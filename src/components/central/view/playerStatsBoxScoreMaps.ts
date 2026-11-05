import { GameState, NBAGMStat } from '../../../types';
import { classifyBoxScoreGame } from '../../../utils/gameClassification';
import { Phase, SeasonMode, ShotLocAgg, StatType } from './PlayerStatsTypes';
import { safePct, zeroStatRow } from './playerStatsMath';
import { PBA_COMPETITIONS } from '../../../data/templates/philippines/competitions';
import { isPbaCompetitionId, makeCountedPbaRegularBoxSet, pbaBoxIdentity } from '../../../services/pba/competitionGames';
import { getCanonicalEuroStatCompetitionId } from '../../../services/euro/statsArchive';
import {
  ADVANCED_STAT_FORMULA_VERSION,
  calculateIndividualOrtg,
  getCalibratedEwa,
  getCalibratedPer,
} from '../../../utils/advancedStatCalibration';

type BoxScoreStatsPhase = Exclude<Phase, 'cup'>;

interface BoxScoreStatsOptions {
  competitionIds?: Set<string>;
  teamIds?: Set<number>;
  phase?: BoxScoreStatsPhase;
}

const finiteBoxStat = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const finiteLineRebounds = (line: any): number => {
  const reported = line.reb ?? line.trb;
  return typeof reported === 'number' && Number.isFinite(reported)
    ? reported
    : finiteBoxStat(line.orb) + finiteBoxStat(line.drb);
};

function matchesBoxScoreStatsFilter(state: GameState, box: any, options: BoxScoreStatsOptions) {
  if (box.isAllStar || box.isRisingStars || box.isCelebrityGame) return null;
  if (options.teamIds && (
    !options.teamIds.has(Number(box.homeTeamId))
    || !options.teamIds.has(Number(box.awayTeamId))
  )) return null;
  const competitionId = getCanonicalEuroStatCompetitionId({ competitionId: box.competitionId } as any);
  if (options.competitionIds && !options.competitionIds.has(competitionId)) return null;
  const meta = classifyBoxScoreGame(
    box,
    state.schedule,
    state.playoffs,
    state.nbaCup,
    state.nbaCupHistory,
    state.leagueStats.year,
    state.leagueStats,
  );
  if (meta.isAllStar) return null;
  if (options.phase === 'preseason') {
    if (!meta.isPreseason) return null;
  } else if (meta.isPreseason || meta.excludeFromRecord) {
    return null;
  }
  if (meta.isPlayIn && !options.competitionIds) return null;
  if (options.phase === 'regular' && (meta.isPlayoff || meta.isPlayIn)) return null;
  if (options.phase === 'playoffs' && !meta.isPlayoff && !meta.isPlayIn) return null;
  return meta;
}

function addBoxScoreLine(row: NBAGMStat & Record<string, number>, ln: any) {
  const reb = finiteLineRebounds(ln);
  const minutes = finiteBoxStat(ln.min);
  row.gp += 1;
  row.gs += finiteBoxStat(ln.gs) > 0 ? 1 : 0;
  row.min += minutes;
  row.fg += finiteBoxStat(ln.fgm);
  row.fga += finiteBoxStat(ln.fga);
  row.tp += finiteBoxStat(ln.threePm);
  row.tpa += finiteBoxStat(ln.threePa);
  row.fp = finiteBoxStat(row.fp) + finiteBoxStat(ln.fourPm);
  row.fpa = finiteBoxStat(row.fpa) + finiteBoxStat(ln.fourPa);
  row.ft += finiteBoxStat(ln.ftm);
  row.fta += finiteBoxStat(ln.fta);
  row.orb += finiteBoxStat(ln.orb);
  row.drb += finiteBoxStat(ln.drb);
  row.trb += reb;
  row.ast += finiteBoxStat(ln.ast);
  row.stl += finiteBoxStat(ln.stl);
  row.blk += finiteBoxStat(ln.blk);
  row.tov += finiteBoxStat(ln.tov);
  row.pf += finiteBoxStat(ln.pf);
  row.pts += finiteBoxStat(ln.pts);
  row.pm = finiteBoxStat(row.pm) + finiteBoxStat(ln.pm);
  row.ws = finiteBoxStat(row.ws) + finiteBoxStat(ln.ws);
  row.ows = finiteBoxStat(row.ows) + finiteBoxStat(ln.ows);
  row.dws = finiteBoxStat(row.dws) + finiteBoxStat(ln.dws);
  row.vorp = finiteBoxStat(row.vorp) + finiteBoxStat(ln.vorp);
  row.ewa = finiteBoxStat(row.ewa) + getCalibratedEwa(ln);
  const calibratedPer = getCalibratedPer(ln);
  row._perSum = finiteBoxStat(row._perSum) + calibratedPer;
  row._perMinuteSum = finiteBoxStat(row._perMinuteSum) + calibratedPer * finiteBoxStat(ln.min);
  row._usgPctSum = finiteBoxStat(row._usgPctSum) + finiteBoxStat(ln.usgPct) * minutes;
  row._ortgSum = finiteBoxStat(row._ortgSum) + finiteBoxStat(ln.ortg) * minutes;
  row._drtgSum = finiteBoxStat(row._drtgSum) + finiteBoxStat(ln.drtg) * minutes;
  row._bpmSum = finiteBoxStat(row._bpmSum) + finiteBoxStat(ln.bpm) * minutes;
  row._obpmSum = finiteBoxStat(row._obpmSum) + finiteBoxStat(ln.obpm) * minutes;
  row._dbpmSum = finiteBoxStat(row._dbpmSum) + finiteBoxStat(ln.dbpm) * minutes;
  row._orbPctSum = finiteBoxStat(row._orbPctSum) + finiteBoxStat(ln.orbPct) * minutes;
  row._drbPctSum = finiteBoxStat(row._drbPctSum) + finiteBoxStat(ln.drbPct) * minutes;
  row._trbPctSum = finiteBoxStat(row._trbPctSum) + finiteBoxStat(ln.trbPct) * minutes;
  row._astPctSum = finiteBoxStat(row._astPctSum) + finiteBoxStat(ln.astPct) * minutes;
  row._stlPctSum = finiteBoxStat(row._stlPctSum) + finiteBoxStat(ln.stlPct) * minutes;
  row._blkPctSum = finiteBoxStat(row._blkPctSum) + finiteBoxStat(ln.blkPct) * minutes;
  row._tovPctSum = finiteBoxStat(row._tovPctSum) + finiteBoxStat(ln.tovPct) * minutes;
}

function finalizeBoxScoreStat(row: NBAGMStat & Record<string, number>): NBAGMStat {
  row.fgp = safePct(row.fg, row.fga);
  row.tpp = safePct(row.tp, row.tpa);
  row.fpp = safePct(row.fp ?? 0, row.fpa ?? 0);
  row.ftp = safePct(row.ft, row.fta);
  const gp = row.gp || 1;
  const minutes = row.min || 1;
  row.per = row.min > 0 ? (row._perMinuteSum ?? 0) / minutes : (row._perSum ?? 0) / gp;
  row.usgPct = (row._usgPctSum ?? 0) / minutes;
  row.drtg = (row._drtgSum ?? 0) / minutes;
  row.bpm = (row._bpmSum ?? 0) / minutes;
  row.obpm = (row._obpmSum ?? 0) / minutes;
  row.dbpm = (row._dbpmSum ?? 0) / minutes;
  row.orbPct = (row._orbPctSum ?? 0) / minutes;
  row.drbPct = (row._drbPctSum ?? 0) / minutes;
  row.rebPct = (row._trbPctSum ?? 0) / minutes;
  row.astPct = (row._astPctSum ?? 0) / minutes;
  row.stlPct = (row._stlPctSum ?? 0) / minutes;
  row.blkPct = (row._blkPctSum ?? 0) / minutes;
  row.tovPct = (row._tovPctSum ?? 0) / minutes;
  const tsDenom = 2 * (row.fga + 0.44 * row.fta);
  row.tsPct = tsDenom > 0 ? (row.pts / tsDenom) * 100 : 0;
  row.efgPct = row.fga > 0 ? ((row.fg + 0.5 * row.tp + (row.fp ?? 0)) / row.fga) * 100 : 0;
  row.ortg = calculateIndividualOrtg(row);
  row._advancedStatVersion = ADVANCED_STAT_FORMULA_VERSION;
  return row;
}

export function buildBoxScoreStatsByPlayer(
  state: GameState,
  options: BoxScoreStatsOptions = {},
): Map<string, NBAGMStat[]> {
  const phase = options.phase ?? 'regular';
  const rows = new Map<string, NBAGMStat & Record<string, number>>();
  const countedPbaRegularBoxes = phase === 'regular'
    ? makeCountedPbaRegularBoxSet(
        state.boxScores as any[],
        PBA_COMPETITIONS.filter(spec => !options.competitionIds || options.competitionIds.has(spec.id.toLowerCase())),
      )
    : undefined;

  for (const box of state.boxScores as any[]) {
    const meta = matchesBoxScoreStatsFilter(state, box, { ...options, phase });
    if (!meta) continue;
    if (countedPbaRegularBoxes && isPbaCompetitionId(box.competitionId) && !countedPbaRegularBoxes.has(pbaBoxIdentity(box))) continue;
    const season = Number(box.season ?? meta.seasonYear);
    const sides = [
      { tid: box.homeTeamId, lines: box.homeStats ?? [] },
      { tid: box.awayTeamId, lines: box.awayStats ?? [] },
    ];
    for (const side of sides) {
      for (const line of side.lines) {
        const playerId = line.playerId;
        if (!playerId) continue;
        const key = `${playerId}|${season}|${side.tid}`;
        if (!rows.has(key)) {
          const row = zeroStatRow(season, side.tid) as NBAGMStat & Record<string, number>;
          (row as any).competitionId = getCanonicalEuroStatCompetitionId({
            competitionId: box.competitionId ?? (meta as any).competitionId,
          } as any);
          rows.set(key, row);
        }
        addBoxScoreLine(rows.get(key)!, line);
      }
    }
  }

  const byPlayer = new Map<string, NBAGMStat[]>();
  for (const [key, row] of rows) {
    const playerId = key.split('|')[0];
    if (!byPlayer.has(playerId)) byPlayer.set(playerId, []);
    byPlayer.get(playerId)!.push(finalizeBoxScoreStat(row));
  }
  return byPlayer;
}

export function buildCompetitionSeasonPlayers(
  state: GameState,
  competitionId: string,
  participantTids: Set<number>,
  season = state.leagueStats.year,
) {
  const canonicalCompetitionId = getCanonicalEuroStatCompetitionId({ competitionId } as any);
  const liveStats = buildBoxScoreStatsByPlayer(state, {
    competitionIds: new Set([canonicalCompetitionId]),
    phase: 'regular',
  });
  return state.players
    .filter(player => !(player.euroAcademyPlayer && !player.promotedFromAcademy))
    .filter(player => (
      participantTids.has(player.tid)
      || liveStats.has(player.internalId)
      || (player.stats ?? []).some(stat =>
        stat.season === season
        && getCanonicalEuroStatCompetitionId(stat as NBAGMStat & Record<string, unknown>) === canonicalCompetitionId,
      )
    ))
    .map(player => {
      const liveSeasonRows = (liveStats.get(player.internalId) ?? []).filter(stat => stat.season === season);
      const archiveSeasonRows = (player.stats ?? []).filter(stat =>
        stat.season === season
        && !stat.playoffs
        && getCanonicalEuroStatCompetitionId(stat as NBAGMStat & Record<string, unknown>) === canonicalCompetitionId,
      );
      return {
        ...player,
        stats: [
          ...(player.stats ?? []).filter(stat => stat.season !== season),
          ...(liveSeasonRows.length > 0 ? liveSeasonRows : archiveSeasonRows),
        ],
      };
    });
}

export function buildBoxScoreShotLocMap(
  state: GameState,
  statType: StatType,
  season: SeasonMode,
  phase: BoxScoreStatsPhase,
  competitionIds?: Set<string>,
  teamIds?: Set<number>,
): Map<string, ShotLocAgg> {
  if (statType !== 'shotLocations') return new Map();
  const map = new Map<string, ShotLocAgg>();
  const countedPbaRegularBoxes = phase === 'regular'
    ? makeCountedPbaRegularBoxSet(
        state.boxScores as any[],
        PBA_COMPETITIONS.filter(spec => !competitionIds || competitionIds.has(spec.id.toLowerCase())),
        typeof season === 'number' ? season : undefined,
      )
    : undefined;
  const zero = (): ShotLocAgg => ({
    rimFgm: 0,
    rimFga: 0,
    lpFgm: 0,
    lpFga: 0,
    mrFgm: 0,
    mrFga: 0,
    tpFgm: 0,
    tpFga: 0,
    ba: 0,
    dd: 0,
    td: 0,
    qd: 0,
    fiveX5: 0,
    dunks: 0,
    techs: 0,
    pip: 0,
  });

  for (const box of state.boxScores as any[]) {
    const meta = matchesBoxScoreStatsFilter(state, box, { competitionIds, teamIds, phase });
    if (!meta) continue;
    if (countedPbaRegularBoxes && isPbaCompetitionId(box.competitionId) && !countedPbaRegularBoxes.has(pbaBoxIdentity(box))) continue;
    const boxSeason = Number(box.season ?? meta.seasonYear);
    if (typeof season === 'number' && boxSeason !== season) continue;
    const process = (stats: any[]) => {
      for (const line of stats ?? []) {
        const pid = line.playerId;
        if (!pid) continue;
        const key = season === 'all' ? `${pid}_${boxSeason}` : pid;
        if (!map.has(key)) map.set(key, zero());
        const agg = map.get(key)!;
        const sp = (value: any) => (typeof value === 'number' && isFinite(value) ? value : 0);
        agg.rimFgm += sp(line.fgAtRim);
        agg.rimFga += sp(line.fgaAtRim);
        agg.lpFgm += sp(line.fgLowPost);
        agg.lpFga += sp(line.fgaLowPost);
        agg.mrFgm += sp(line.fgMidRange);
        agg.mrFga += sp(line.fgaMidRange);
        agg.tpFgm += sp(line.threePm);
        agg.tpFga += sp(line.threePa);
        agg.ba += sp(line.ba);
        agg.dunks += sp(line.dunks);
        agg.techs += sp(line.techs);
        agg.pip += sp(line.fgAtRim) * 2 + sp(line.fgLowPost) * 2;
        const pts = sp(line.pts);
        const reb = sp(line.trb || line.reb || (line.orb || 0) + (line.drb || 0));
        const ast = sp(line.ast);
        const stl = sp(line.stl);
        const blk = sp(line.blk);
        const cats10 = [pts >= 10, reb >= 10, ast >= 10, stl >= 10, blk >= 10].filter(Boolean).length;
        if (cats10 >= 4) agg.qd += 1;
        else if (cats10 >= 3) agg.td += 1;
        else if (cats10 >= 2) agg.dd += 1;
        const cats5 = [pts >= 5, reb >= 5, ast >= 5, stl >= 5, blk >= 5].filter(Boolean).length;
        if (cats5 >= 5) agg.fiveX5 += 1;
      }
    };
    process(box.homeStats);
    process(box.awayStats);
  }
  return map;
}

export function buildCupStatsByPlayer(state: GameState, teamIds?: Set<number>): Map<string, NBAGMStat> {
  const out = new Map<string, NBAGMStat>();
  const ensure = (pid: string, tid: number): NBAGMStat => {
    let row = out.get(pid);
    if (!row) {
      row = {
        season: state.leagueStats.year,
        tid,
        gp: 0,
        gs: 0,
        min: 0,
        fg: 0,
        fga: 0,
        fgp: 0,
        tp: 0,
        tpa: 0,
        tpp: 0,
        fp: 0,
        fpa: 0,
        fpp: 0,
        ft: 0,
        fta: 0,
        ftp: 0,
        orb: 0,
        drb: 0,
        trb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        tov: 0,
        pf: 0,
        pts: 0,
        per: 0,
        pm: 0,
      } as NBAGMStat;
      out.set(pid, row);
    }
    return row;
  };

  for (const box of state.boxScores) {
    if (teamIds && (
      !teamIds.has(Number((box as any).homeTeamId))
      || !teamIds.has(Number((box as any).awayTeamId))
    )) continue;
    const meta = classifyBoxScoreGame(
      box as any,
      state.schedule,
      state.playoffs,
      state.nbaCup,
      state.nbaCupHistory,
      state.leagueStats.year,
      state.leagueStats,
    );
    if (!meta.isNBACup) continue;
    const sides: Array<{ tid: number; lines: any[] }> = [
      { tid: (box as any).homeTeamId, lines: (box as any).homeStats ?? [] },
      { tid: (box as any).awayTeamId, lines: (box as any).awayStats ?? [] },
    ];
    for (const { tid, lines } of sides) {
      for (const ln of lines) {
        if (!ln?.playerId) continue;
        const row = ensure(`${meta.seasonYear}:${ln.playerId}`, tid);
        row.season = meta.seasonYear;
        addBoxScoreLine(row as NBAGMStat & Record<string, number>, ln);
      }
    }
  }

  for (const row of out.values()) finalizeBoxScoreStat(row as NBAGMStat & Record<string, number>);
  return out;
}

export function buildCurrentSeasonStatsByPhase(state: GameState, teamIds?: Set<number>) {
  const preseason = new Map<string, NBAGMStat>();
  const regular = new Map<string, NBAGMStat>();
  const playoffs = new Map<string, NBAGMStat>();
  const combined = new Map<string, NBAGMStat>();

  const ensure = (map: Map<string, NBAGMStat>, pid: string, tid: number) => {
    let row = map.get(pid);
    if (!row) {
      row = zeroStatRow(state.leagueStats.year, tid);
      map.set(pid, row);
    }
    return row;
  };

  const applyLine = (row: NBAGMStat, ln: any) => addBoxScoreLine(row as NBAGMStat & Record<string, number>, ln);

  for (const box of state.boxScores as any[]) {
    if (teamIds && (
      !teamIds.has(Number(box.homeTeamId))
      || !teamIds.has(Number(box.awayTeamId))
    )) continue;
    const meta = classifyBoxScoreGame(
      box,
      state.schedule,
      state.playoffs,
      state.nbaCup,
      state.nbaCupHistory,
      state.leagueStats.year,
      state.leagueStats,
    );
    const boxSeason = box.season ?? meta.seasonYear;
    if (boxSeason !== state.leagueStats.year) continue;
    if (meta.isPlayIn || (!meta.isPreseason && meta.excludeFromRecord)) continue;

    const bucket = meta.isPreseason ? preseason : meta.isPlayoff ? playoffs : regular;
    const sides = [
      { tid: box.homeTeamId, lines: box.homeStats ?? [] },
      { tid: box.awayTeamId, lines: box.awayStats ?? [] },
    ];
    for (const side of sides) {
      const seen = new Set<string>();
      for (const ln of side.lines) {
        if (!ln?.playerId || seen.has(ln.playerId)) continue;
        seen.add(ln.playerId);
        applyLine(ensure(bucket, ln.playerId, side.tid), ln);
        if (!meta.isPreseason) applyLine(ensure(combined, ln.playerId, side.tid), ln);
      }
    }
  }

  for (const map of [preseason, regular, playoffs, combined]) {
    for (const row of map.values()) finalizeBoxScoreStat(row as NBAGMStat & Record<string, number>);
  }
  return { preseason, regular, playoffs, combined };
}

export function buildShotLocMap(
  state: GameState,
  statType: StatType,
  season: SeasonMode,
  phase: Phase,
  teamIds?: Set<number>,
): Map<string, ShotLocAgg> {
  if (statType !== 'shotLocations') return new Map();
  const map = new Map<string, ShotLocAgg>();
  const zero = (): ShotLocAgg => ({
    rimFgm: 0,
    rimFga: 0,
    lpFgm: 0,
    lpFga: 0,
    mrFgm: 0,
    mrFga: 0,
    tpFgm: 0,
    tpFga: 0,
    ba: 0,
    dd: 0,
    td: 0,
    qd: 0,
    fiveX5: 0,
    dunks: 0,
    techs: 0,
    pip: 0,
  });

  for (const game of state.boxScores as any[]) {
    if (teamIds && (
      !teamIds.has(Number(game.homeTeamId))
      || !teamIds.has(Number(game.awayTeamId))
    )) continue;
    const meta = classifyBoxScoreGame(
      game,
      state.schedule,
      state.playoffs,
      state.nbaCup,
      state.nbaCupHistory,
      state.leagueStats.year,
      state.leagueStats,
    );
    const gameSeasonYear = Number(game.season ?? meta.seasonYear);
    if (season !== 'career' && season !== 'all' && gameSeasonYear !== season) continue;

    if (phase === 'preseason' && !meta.isPreseason) continue;
    if (phase !== 'preseason' && meta.isPreseason) continue;
    if (phase === 'regular' && (meta.isPlayoff || meta.isPlayIn)) continue;
    if (phase === 'playoffs' && !meta.isPlayoff && !meta.isPlayIn) continue;

    const process = (stats: any[]) => {
      for (const line of stats ?? []) {
        const pid: string = line.playerId;
        if (!pid) continue;
        const key = season === 'all' ? `${pid}_${gameSeasonYear}` : pid;
        if (!map.has(key)) map.set(key, zero());
        const agg = map.get(key)!;
        const sp = (value: any) => (typeof value === 'number' && isFinite(value) ? value : 0);
        agg.rimFgm += sp(line.fgAtRim);
        agg.rimFga += sp(line.fgaAtRim);
        agg.lpFgm += sp(line.fgLowPost);
        agg.lpFga += sp(line.fgaLowPost);
        agg.mrFgm += sp(line.fgMidRange);
        agg.mrFga += sp(line.fgaMidRange);
        agg.tpFgm += sp(line.threePm);
        agg.tpFga += sp(line.threePa);
        agg.ba += sp(line.ba);
        agg.dunks += sp(line.dunks);
        agg.techs += sp(line.techs);
        agg.pip += sp(line.fgAtRim) * 2 + sp(line.fgLowPost) * 2;
        const pts = sp(line.pts);
        const reb = sp(line.trb || line.reb || (line.orb || 0) + (line.drb || 0));
        const ast = sp(line.ast);
        const stl = sp(line.stl);
        const blk = sp(line.blk);
        const cats10 = [pts >= 10, reb >= 10, ast >= 10, stl >= 10, blk >= 10].filter(Boolean).length;
        if (cats10 >= 4) agg.qd += 1;
        else if (cats10 >= 3) agg.td += 1;
        else if (cats10 >= 2) agg.dd += 1;
        const cats5 = [pts >= 5, reb >= 5, ast >= 5, stl >= 5, blk >= 5].filter(Boolean).length;
        if (cats5 >= 5) agg.fiveX5 += 1;
      }
    };

    process(game.homeStats);
    process(game.awayStats);
  }

  return map;
}
