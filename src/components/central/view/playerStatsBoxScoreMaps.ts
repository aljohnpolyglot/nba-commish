import { GameState, NBAGMStat } from '../../../types';
import { classifyBoxScoreGame } from '../../../utils/gameClassification';
import { Phase, SeasonMode, ShotLocAgg, StatType } from './PlayerStatsTypes';
import { safePct, zeroStatRow } from './playerStatsMath';

export function buildCupStatsByPlayer(state: GameState): Map<string, NBAGMStat> {
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
    const meta = classifyBoxScoreGame(
      box as any,
      state.schedule,
      state.playoffs,
      state.nbaCup,
      state.nbaCupHistory,
      state.leagueStats.year,
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
        row.gp += 1;
        row.gs += (ln.gs ?? 0) > 0 ? 1 : 0;
        row.min += ln.min ?? 0;
        row.fg += ln.fgm ?? 0;
        row.fga += ln.fga ?? 0;
        row.tp += ln.threePm ?? 0;
        row.tpa += ln.threePa ?? 0;
        row.fp = (row.fp ?? 0) + (ln.fourPm ?? 0);
        row.fpa = (row.fpa ?? 0) + (ln.fourPa ?? 0);
        row.ft += ln.ftm ?? 0;
        row.fta += ln.fta ?? 0;
        row.orb += ln.orb ?? 0;
        row.drb += ln.drb ?? 0;
        row.trb += ln.reb ?? ((ln.orb ?? 0) + (ln.drb ?? 0));
        row.ast += ln.ast ?? 0;
        row.stl += ln.stl ?? 0;
        row.blk += ln.blk ?? 0;
        row.tov += ln.tov ?? 0;
        row.pf += ln.pf ?? 0;
        row.pts += ln.pts ?? 0;
        row.pm = (row.pm ?? 0) + (ln.pm ?? 0);
      }
    }
  }

  for (const row of out.values()) {
    row.fgp = safePct(row.fg, row.fga);
    row.tpp = safePct(row.tp, row.tpa);
    row.fpp = safePct(row.fp ?? 0, row.fpa ?? 0);
    row.ftp = safePct(row.ft, row.fta);
  }
  return out;
}

export function buildCurrentSeasonStatsByPhase(state: GameState) {
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

  const applyLine = (row: NBAGMStat, ln: any) => {
    row.gp += 1;
    row.gs += (ln.gs ?? 0) > 0 ? 1 : 0;
    row.min += ln.min ?? 0;
    row.fg += ln.fgm ?? 0;
    row.fga += ln.fga ?? 0;
    row.tp += ln.threePm ?? 0;
    row.tpa += ln.threePa ?? 0;
    row.fp = (row.fp ?? 0) + (ln.fourPm ?? 0);
    row.fpa = (row.fpa ?? 0) + (ln.fourPa ?? 0);
    row.ft += ln.ftm ?? 0;
    row.fta += ln.fta ?? 0;
    row.orb += ln.orb ?? 0;
    row.drb += ln.drb ?? 0;
    row.trb += ln.reb ?? ((ln.orb ?? 0) + (ln.drb ?? 0));
    row.ast += ln.ast ?? 0;
    row.stl += ln.stl ?? 0;
    row.blk += ln.blk ?? 0;
    row.tov += ln.tov ?? 0;
    row.pf += ln.pf ?? 0;
    row.pts += ln.pts ?? 0;
    row.pm = (row.pm ?? 0) + (ln.pm ?? 0);
    row.ws = (row.ws ?? 0) + (ln.ws ?? 0);
    row.ows = (row.ows ?? 0) + (ln.ows ?? 0);
    row.dws = (row.dws ?? 0) + (ln.dws ?? 0);
    row.vorp = (row.vorp ?? 0) + (ln.vorp ?? 0);
    row.ewa = (row.ewa ?? 0) + (ln.ewa ?? 0);
    row.per = ((row.per ?? 0) * (row.gp - 1) + (ln.per ?? 0)) / row.gp;
    row.tsPct = ((row.tsPct ?? 0) * (row.gp - 1) + (ln.tsPct ?? 0)) / row.gp;
    row.efgPct = ((row.efgPct ?? 0) * (row.gp - 1) + (ln.efgPct ?? 0)) / row.gp;
    row.usgPct = ((row.usgPct ?? 0) * (row.gp - 1) + (ln.usgPct ?? 0)) / row.gp;
    row.ortg = ((row.ortg ?? 0) * (row.gp - 1) + (ln.ortg ?? 0)) / row.gp;
    row.drtg = ((row.drtg ?? 0) * (row.gp - 1) + (ln.drtg ?? 0)) / row.gp;
    row.bpm = ((row.bpm ?? 0) * (row.gp - 1) + (ln.bpm ?? 0)) / row.gp;
    row.obpm = ((row.obpm ?? 0) * (row.gp - 1) + (ln.obpm ?? 0)) / row.gp;
    row.dbpm = ((row.dbpm ?? 0) * (row.gp - 1) + (ln.dbpm ?? 0)) / row.gp;
    row.orbPct = ((row.orbPct ?? 0) * (row.gp - 1) + (ln.orbPct ?? 0)) / row.gp;
    row.drbPct = ((row.drbPct ?? 0) * (row.gp - 1) + (ln.drbPct ?? 0)) / row.gp;
    row.rebPct = ((row.rebPct ?? 0) * (row.gp - 1) + (ln.trbPct ?? 0)) / row.gp;
    row.astPct = ((row.astPct ?? 0) * (row.gp - 1) + (ln.astPct ?? 0)) / row.gp;
    row.stlPct = ((row.stlPct ?? 0) * (row.gp - 1) + (ln.stlPct ?? 0)) / row.gp;
    row.blkPct = ((row.blkPct ?? 0) * (row.gp - 1) + (ln.blkPct ?? 0)) / row.gp;
    row.tovPct = ((row.tovPct ?? 0) * (row.gp - 1) + (ln.tovPct ?? 0)) / row.gp;
    row.fgp = safePct(row.fg, row.fga);
    row.tpp = safePct(row.tp, row.tpa);
    row.fpp = safePct(row.fp ?? 0, row.fpa ?? 0);
    row.ftp = safePct(row.ft, row.fta);
  };

  for (const box of state.boxScores as any[]) {
    const meta = classifyBoxScoreGame(
      box,
      state.schedule,
      state.playoffs,
      state.nbaCup,
      state.nbaCupHistory,
      state.leagueStats.year,
    );
    const boxSeason = box.season ?? meta.seasonYear;
    if (boxSeason !== state.leagueStats.year) continue;
    if (meta.isPreseason || meta.isPlayIn || meta.excludeFromRecord) continue;

    const bucket = meta.isPlayoff ? playoffs : regular;
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
        applyLine(ensure(combined, ln.playerId, side.tid), ln);
      }
    }
  }

  return { regular, playoffs, combined };
}

export function buildShotLocMap(
  boxScores: GameState['boxScores'],
  statType: StatType,
  season: SeasonMode,
  phase: Phase,
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

  for (const game of boxScores as any[]) {
    const date = new Date(game.date ?? '');
    if (isNaN(date.getTime())) continue;
    const year = date.getFullYear();
    const gameSeasonYear = date.getMonth() < 9 ? year : year + 1;
    if (season !== 'career' && season !== 'all' && gameSeasonYear !== season) continue;

    const isPlayoff = !!(game.isPlayoff || game.isPlayIn);
    if (phase === 'regular' && isPlayoff) continue;
    if (phase === 'playoffs' && !isPlayoff) continue;

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
