import { useMemo } from 'react';
import type { LeagueStats, NBAGMStat } from '../../../types';
import { Phase, SeasonRow } from './PlayerBioStatsHistoryShared';
import { EURO_BASKETBALL_SOURCE_ARCHIVES, EUROLEAGUE_2026_SOURCE } from '../../../data/euroBasketballSources';
import { getCanonicalEuroStatCompetitionId } from '../../../services/euro/statsArchive';
import { getInternationalCompetitionLabel, isInternationalCompetitionId } from '../../../services/fiba/competitionIdentity';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { getCalibratedEwa, getCalibratedPer } from '../../../utils/advancedStatCalibration';
import { groupPbaSeasonRows } from './playerBioPbaSeasonGrouping';
import { formatPlayerBioSeasonLabel, type PlayerBioLeagueContext } from './playerBioCrossLeagueHistory';
import { getGameSeasonYear } from '../../../utils/gameClassification';
import { resolveHistoricalCompetitionTeam } from '../../../services/teamIdentity/competitionTeamIdentity';
import { getTeamFullName } from '../../../utils/teamNames';

const EURO_COMPETITION_LABELS = new Map(
  [EUROLEAGUE_2026_SOURCE, ...EURO_BASKETBALL_SOURCE_ARCHIVES]
    .map(source => [source.competitionId, { tag: source.shortName, title: source.displayName }] as const),
);

const sp = (n: unknown): number => (typeof n === 'number' && isFinite(n) ? n : 0);

export function enrichInternationalStatMetadata(
  stats: NBAGMStat[],
  archiveStats: NBAGMStat[],
): NBAGMStat[] {
  const archiveBySeason = new Map(archiveStats.map(row => [Number(row.season), row] as const));
  return stats.map(row => {
    const raw = row as NBAGMStat & Record<string, unknown>;
    const archiveRow = archiveBySeason.get(Number(row.season)) as (NBAGMStat & Record<string, unknown>) | undefined;
    const competitionId = String(raw.competitionId ?? '').toLowerCase();
    const isInternational = isInternationalCompetitionId(competitionId)
      || String(raw._source ?? '').toLowerCase() === 'fiba-history';
    if (!archiveRow || !isInternational) return row;
    const useArchiveEvent = !competitionId || competitionId === 'fiba-national-team';
    return {
      ...row,
      abbrev: raw.abbrev || raw.teamAbbrev || archiveRow.abbrev || archiveRow.teamAbbrev,
      teamAbbrev: raw.teamAbbrev || raw.abbrev || archiveRow.teamAbbrev || archiveRow.abbrev,
      teamName: raw.teamName || archiveRow.teamName,
      competitionId: useArchiveEvent ? archiveRow.competitionId : row.competitionId,
      _seasonLabel: useArchiveEvent ? archiveRow._seasonLabel : raw._seasonLabel,
    } as NBAGMStat;
  });
}

function emptyGH(): Pick<SeasonRow, 'ghMin'|'ghFgm'|'ghFga'|'ghTpm'|'ghTpa'|'ghTwom'|'ghTwoa'|'ghFtm'|'ghFta'|'ghOrb'|'ghDrb'|'ghTrb'|'ghAst'|'ghTov'|'ghStl'|'ghBlk'|'ghBa'|'ghPf'|'ghPts'|'ghPm'|'ghGmSc'> {
  return { ghMin: 0, ghFgm: 0, ghFga: 0, ghTpm: 0, ghTpa: 0, ghTwom: 0, ghTwoa: 0, ghFtm: 0, ghFta: 0, ghOrb: 0, ghDrb: 0, ghTrb: 0, ghAst: 0, ghTov: 0, ghStl: 0, ghBlk: 0, ghBa: 0, ghPf: 0, ghPts: 0, ghPm: 0, ghGmSc: 0 };
}

function sourceMaxValue(stat: any, fields: string[]): number {
  let best = 0;
  for (const field of fields) {
    const raw = stat?.[field];
    if (Array.isArray(raw)) {
      for (const value of raw) best = Math.max(best, sp(value));
    } else {
      best = Math.max(best, sp(raw));
    }
  }
  return best;
}

function sourceGameHighs(list: NBAGMStat[]): ReturnType<typeof emptyGH> {
  const maxAny = (...fields: string[]) => Math.max(...list.map(stat => sourceMaxValue(stat as any, fields)));
  return {
    ghMin: maxAny('_ghMin', 'minMax', 'mpMax'),
    ghFgm: maxAny('_ghFgm', 'fgMax', 'fgmMax'),
    ghFga: maxAny('_ghFga', 'fgaMax'),
    ghTpm: maxAny('_ghTpm', 'tpMax', 'tpmMax', 'threePmMax', 'fg3mMax'),
    ghTpa: maxAny('_ghTpa', 'tpaMax', 'threePaMax', 'fg3aMax'),
    ghTwom: maxAny('_ghTwom', '2pMax', 'twopMax', 'twoPmMax'),
    ghTwoa: maxAny('_ghTwoa', '2paMax', 'twopaMax', 'twoPaMax'),
    ghFtm: maxAny('_ghFtm', 'ftMax', 'ftmMax'),
    ghFta: maxAny('_ghFta', 'ftaMax'),
    ghOrb: maxAny('_ghOrb', 'orbMax'),
    ghDrb: maxAny('_ghDrb', 'drbMax'),
    ghTrb: maxAny('_ghTrb', 'trbMax', 'rebMax'),
    ghAst: maxAny('_ghAst', 'astMax'),
    ghTov: maxAny('_ghTov', 'tovMax', 'toMax'),
    ghStl: maxAny('_ghStl', 'stlMax'),
    ghBlk: maxAny('_ghBlk', 'blkMax'),
    ghBa: maxAny('_ghBa', 'baMax'),
    ghPf: maxAny('_ghPf', 'pfMax'),
    ghPts: maxAny('_ghPts', 'ptsMax'),
    ghPm: maxAny('_ghPm', 'pmMax', 'plusMinusMax'),
    ghGmSc: maxAny('_ghGmSc', 'gmScMax', 'gameScoreMax'),
  };
}

interface BoxAggregate {
  gp: number;
  teamTid: number;
  leagueTag?: string;
  leagueTitle?: string;
  rimFgm: number; rimFga: number;
  lpFgm: number; lpFga: number;
  mrFgm: number; mrFga: number;
  ba: number;
  dd: number; td: number; qd: number; fiveBy5: number;
  gh: ReturnType<typeof emptyGH>;
}

function competitionBoxKey(seasonYear: number, phaseKey: 'rs' | 'ply' | 'int' | 'college' | 'sl', competitionId?: string): string {
  return `${seasonYear}_${phaseKey}_${String(competitionId ?? '').toLowerCase()}`;
}

function inferLeagueFromGame(game: any, teamTid: number): { tag: string; title: string } {
  const competitionId = String(game?.competitionId ?? '').toLowerCase();
  const international = getInternationalCompetitionLabel(competitionId);
  if (international) return international;
  if (competitionId === 'wnba' || competitionId.startsWith('wnba-')) return { tag: 'WNBA', title: 'WNBA' };
  if (competitionId === 'gleague' || competitionId === 'g-league') return { tag: 'G-LG', title: 'G League' };
  if (competitionId === 'nba') return { tag: 'NBA', title: 'NBA' };
  if (competitionId === 'euroleague') return { tag: 'EUROPE', title: 'EuroLeague' };
  if (competitionId === 'endesa') return { tag: 'ESP-1', title: 'Liga Endesa' };
  if (competitionId === 'copa-del-rey') return { tag: 'ESP-CUP', title: 'Copa del Rey' };
  if (competitionId === 'supercopa') return { tag: 'ESP-SC', title: 'Supercopa' };
  if (competitionId === 'pba-philippine-cup') return { tag: 'PH CUP', title: 'PBA Philippine Cup' };
  if (competitionId === 'pba-commissioners-cup') return { tag: 'COMM', title: "PBA Commissioners' Cup" };
  if (competitionId === 'pba-governors-cup') return { tag: 'GOV', title: "PBA Governors' Cup" };
  if (competitionId === 'pba' || competitionId.startsWith('pba-')) return { tag: 'PBA', title: 'PBA' };
  if (competitionId === 'nba-summer-league') return { tag: 'SUMMER', title: 'NBA Summer League' };
  if (competitionId === 'ncaa-college') return { tag: 'COLLEGE', title: 'College Basketball' };
  const euroCompetition = EURO_COMPETITION_LABELS.get(competitionId);
  if (euroCompetition) return euroCompetition;
  if (teamTid >= 5000 && teamTid < 6000) return { tag: 'ESP-1', title: 'Liga Endesa' };
  if (teamTid >= 1000 && teamTid < 2000) return { tag: 'EUROPE', title: 'EuroLeague / Europe' };
  if (teamTid >= 2000 && teamTid < 3000) return { tag: 'PBA', title: 'PBA' };
  if (teamTid >= 3000 && teamTid < 4000) return { tag: 'WNBA', title: 'WNBA' };
  if (teamTid >= 16000 && teamTid < 17000) return { tag: 'G-LG', title: 'G League' };
  if (teamTid >= 17000 && teamTid < 18000) return { tag: 'CBA', title: 'China CBA' };
  if (teamTid >= 18000 && teamTid < 19000) return { tag: 'NBL', title: 'NBL Australia' };
  if (teamTid >= 6000 && teamTid < 7000) return { tag: 'G-LG', title: 'G League' };
  if (teamTid >= 7000 && teamTid < 8000) return { tag: 'CBA', title: 'China CBA' };
  if (teamTid >= 8000 && teamTid < 9000) return { tag: 'NBL', title: 'NBL Australia' };
  return { tag: 'NBA', title: 'NBA' };
}

export function resolvePlayerBioStatLeague(
  row: NBAGMStat & Record<string, unknown>,
  teamTid: number = Number(row.tid),
): { tag: string; title: string } {
  const competitionId = getCanonicalEuroStatCompetitionId(row);
  const inferred = inferLeagueFromGame({ competitionId }, teamTid);
  if (competitionId || inferred.tag !== 'NBA') return inferred;

  const tag = String(row.leagueTag ?? row.tag ?? '').trim();
  const title = String(row.leagueTitle ?? row.title ?? row.league ?? '').trim();
  if (tag) return { tag, title: title || tag };
  if (title && !/^nba$/i.test(title)) return { tag: title.toUpperCase().slice(0, 10), title };
  return inferred;
}

export function useBoxData(
  playerId: string,
  boxScores: any[],
  leagueStats?: Pick<LeagueStats, 'leagueCalendar' | 'uiMode'>,
) {
  return useMemo(() => {
    const map = new Map<string, BoxAggregate>();
    const getOrCreate = (key: string): BoxAggregate => {
      if (!map.has(key)) {
        map.set(key, { gp: 0, teamTid: -1, rimFgm: 0, rimFga: 0, lpFgm: 0, lpFga: 0, mrFgm: 0, mrFga: 0, ba: 0, dd: 0, td: 0, qd: 0, fiveBy5: 0, gh: emptyGH() });
      }
      return map.get(key)!;
    };

    boxScores.forEach((game: any) => {
      const international = isInternationalCompetitionId(game?.competitionId);
      const summerLeague = String(game?.competitionId ?? '').toLowerCase() === 'nba-summer-league';
      if (game?.isAllStar || game?.isRisingStars || game?.isCelebrityGame || (game?.isExhibition && !international && !summerLeague)) return;
      if (Number(game?.homeTeamId ?? game?.homeTid ?? 0) < 0 || Number(game?.awayTeamId ?? game?.awayTid ?? 0) < 0) return;
      const inHome = (game.homeStats ?? []).some((player: any) => player.playerId === playerId);
      const stats = [...(game.homeStats ?? []), ...(game.awayStats ?? [])].find((player: any) => player.playerId === playerId);
      if (!stats) return;
      const seasonYear = getGameSeasonYear(game.date ?? '', 0, leagueStats);
      if (!seasonYear) return;
      const isPlayoffs = !!(game.isPlayoff || game.isPlayIn);
      const competitionId = String(game.competitionId ?? '').toLowerCase();
      const aggregate = getOrCreate(competitionBoxKey(
        seasonYear,
        international ? 'int' : summerLeague ? 'sl' : isPlayoffs ? 'ply' : 'rs',
        competitionId,
      ));
      const gameTid = inHome ? (game.homeTeamId ?? game.homeTid ?? -1) : (game.awayTeamId ?? game.awayTid ?? -1);
      if (gameTid > 0) aggregate.teamTid = gameTid;
      const league = inferLeagueFromGame(game, gameTid);
      if (!aggregate.leagueTag) {
        aggregate.leagueTag = league.tag;
        aggregate.leagueTitle = league.title;
      } else if (aggregate.leagueTag !== league.tag) {
        aggregate.leagueTag = 'MIX';
        aggregate.leagueTitle = 'Multiple competitions';
      }
      aggregate.gp += 1;

      const rimFgm = sp(stats.fgAtRim); const rimFga = sp(stats.fgaAtRim);
      const lpFgm = sp(stats.fgLowPost); const lpFga = sp(stats.fgaLowPost);
      const mrFgm = sp(stats.fgMidRange); const mrFga = sp(stats.fgaMidRange);
      const ba = sp(stats.ba);

      aggregate.rimFgm += rimFgm; aggregate.rimFga += rimFga;
      aggregate.lpFgm += lpFgm; aggregate.lpFga += lpFga;
      aggregate.mrFgm += mrFgm; aggregate.mrFga += mrFga;
      aggregate.ba += ba;

      const pts = sp(stats.pts);
      const reb = sp(stats.reb ?? (sp(stats.orb) + sp(stats.drb)));
      const ast = sp(stats.ast);
      const stl = sp(stats.stl);
      const blk = sp(stats.blk);
      const cats10 = [pts >= 10, reb >= 10, ast >= 10, stl >= 10, blk >= 10].filter(Boolean).length;
      const cats5 = [pts >= 5, reb >= 5, ast >= 5, stl >= 5, blk >= 5].filter(Boolean).length;
      if (cats10 >= 2) aggregate.dd += 1;
      if (cats10 >= 3) aggregate.td += 1;
      if (cats10 >= 4) aggregate.qd += 1;
      if (cats5 >= 5) aggregate.fiveBy5 += 1;

      const gh = aggregate.gh;
      const fgm = sp(stats.fgm); const fga = sp(stats.fga);
      const tpm = sp(stats.threePm); const tpa = sp(stats.threePa);
      const twom = fgm - tpm; const twoa = fga - tpa;
      const ftm = sp(stats.ftm); const fta = sp(stats.fta);
      const orb = sp(stats.orb); const drb = sp(stats.drb);
      const trb = sp(stats.reb ?? (orb + drb));
      const tov = sp(stats.tov); const pf = sp(stats.pf);
      const pm = sp(stats.pm); const gmSc = sp(stats.gameScore); const min = sp(stats.min);

      if (min > gh.ghMin) gh.ghMin = min;
      if (fgm > gh.ghFgm) gh.ghFgm = fgm;
      if (fga > gh.ghFga) gh.ghFga = fga;
      if (tpm > gh.ghTpm) gh.ghTpm = tpm;
      if (tpa > gh.ghTpa) gh.ghTpa = tpa;
      if (twom > gh.ghTwom) gh.ghTwom = twom;
      if (twoa > gh.ghTwoa) gh.ghTwoa = twoa;
      if (ftm > gh.ghFtm) gh.ghFtm = ftm;
      if (fta > gh.ghFta) gh.ghFta = fta;
      if (orb > gh.ghOrb) gh.ghOrb = orb;
      if (drb > gh.ghDrb) gh.ghDrb = drb;
      if (trb > gh.ghTrb) gh.ghTrb = trb;
      if (ast > gh.ghAst) gh.ghAst = ast;
      if (tov > gh.ghTov) gh.ghTov = tov;
      if (stl > gh.ghStl) gh.ghStl = stl;
      if (blk > gh.ghBlk) gh.ghBlk = blk;
      if (ba > gh.ghBa) gh.ghBa = ba;
      if (pf > gh.ghPf) gh.ghPf = pf;
      if (pts > gh.ghPts) gh.ghPts = pts;
      if (pm > gh.ghPm) gh.ghPm = pm;
      if (gmSc > gh.ghGmSc) gh.ghGmSc = gmSc;
    });

    return map;
  }, [boxScores, leagueStats, playerId]);
}

export function buildSeasonRows(
  stats: NBAGMStat[],
  teams: Array<{ id?: number; tid?: number; abbrev?: string; name?: string; region?: string; seasons?: unknown[] }>,
  currentYear: number,
  age: number | undefined,
  boxData: Map<string, BoxAggregate>,
  phase: Phase,
  defaultLeague?: PlayerBioLeagueContext,
): { body: SeasonRow[]; career: SeasonRow | null } {
  const authoritativeScopes = new Set(stats
    .filter(stat => (stat as any)._source !== 'euro-stats-archive')
    .map(stat => `${stat.season}|${stat.playoffs ? 1 : 0}|${getCanonicalEuroStatCompetitionId(stat as NBAGMStat & Record<string, unknown>)}`));
  const preferredStats = stats.filter(stat => (stat as any)._source !== 'euro-stats-archive' || !authoritativeScopes.has(
    `${stat.season}|${stat.playoffs ? 1 : 0}|${getCanonicalEuroStatCompetitionId(stat as NBAGMStat & Record<string, unknown>)}`,
  ));
  const normalizeAbbrev = (value: unknown): string | null => {
    const text = String(value ?? '').trim().toUpperCase();
    return text.length > 0 ? text : null;
  };
  const statTeamAbbrev = (stat: NBAGMStat): string | null => {
    const raw = stat as any;
    return (
      normalizeAbbrev(raw.abbrev) ??
      normalizeAbbrev(raw.teamAbbrev) ??
      normalizeAbbrev(raw.tm) ??
      normalizeAbbrev(raw.TM)
    );
  };
  const canonicalStatTeamAbbrev = (stat: NBAGMStat): string | null => {
    const explicit = statTeamAbbrev(stat);
    if (explicit) return explicit;
    const tid = Number(stat.tid);
    if (!Number.isFinite(tid) || tid < 0) return null;
    const team = teams.find(entry => Number(entry.id ?? entry.tid) === tid);
    const historicalTeam = team ? getHistoricalTeamSnapshot(team, Number(stat.season)) : undefined;
    return normalizeAbbrev(historicalTeam?.abbrev ?? team?.abbrev);
  };
  const isInternationalStat = (stat: NBAGMStat) =>
    isInternationalCompetitionId((stat as any).competitionId)
    || String((stat as any)._source ?? '').toLowerCase() === 'fiba-history';
  const isSummerLeagueStat = (stat: NBAGMStat) =>
    String((stat as any).competitionId ?? '').toLowerCase() === 'nba-summer-league'
    || String((stat as any)._source ?? '').toLowerCase() === 'summer-league-history';
  const isCollegeStat = (stat: NBAGMStat) =>
    String((stat as any).competitionId ?? '').toLowerCase() === 'ncaa-college'
    || String((stat as any)._source ?? '').toLowerCase() === 'bbr-college-history';
  const rsPool = preferredStats.filter(stat => !isInternationalStat(stat) && !isSummerLeagueStat(stat) && !isCollegeStat(stat) && !stat.playoffs && sp(stat.gp) > 0);
  const plyPool = preferredStats.filter(stat => !isInternationalStat(stat) && !isSummerLeagueStat(stat) && !isCollegeStat(stat) && !!stat.playoffs && sp(stat.gp) > 0);
  const internationalPool = preferredStats.filter(stat => isInternationalStat(stat) && sp(stat.gp) > 0);
  const collegePool = preferredStats.filter(stat => isCollegeStat(stat) && sp(stat.gp) > 0);
  const summerLeaguePool = preferredStats.filter(stat => isSummerLeagueStat(stat) && sp(stat.gp) > 0);
  const statDedupeSignature = (stat: NBAGMStat): string => {
    const raw = stat as any;
    const teamIdentity = canonicalStatTeamAbbrev(stat) ?? (stat.tid >= 0 ? stat.tid : '_');
    return [
      stat.season, teamIdentity, String(raw.competitionId ?? '').toLowerCase(), stat.playoffs ? 'ply' : 'rs',
      stat.gp, stat.gs, stat.min, stat.fg, stat.fga, stat.tp, stat.tpa, stat.ft, stat.fta,
      stat.orb, stat.drb, raw.trb ?? raw.reb, stat.ast, stat.stl, stat.blk, stat.tov, stat.pf, stat.pts,
    ].map(value => String(value ?? '')).join('|');
  };
  const dedupeStatRows = (list: NBAGMStat[]): NBAGMStat[] => {
    const seen = new Set<string>();
    return list.filter(stat => {
      const key = statDedupeSignature(stat);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const makeSeasoned = (pool: NBAGMStat[], phaseKey: 'rs' | 'ply' | 'int' | 'college' | 'sl'): SeasonRow[] => {
    const bySeasonTeamKey = new Map<string, NBAGMStat[]>();
    for (const stat of pool) {
      const abbrevKey = canonicalStatTeamAbbrev(stat) ?? '_';
      const teamIdentity = abbrevKey !== '_' ? abbrevKey : (stat.tid >= 0 ? stat.tid : '_');
      const key = `${stat.season}_${teamIdentity}_${String((stat as any).competitionId ?? '').toLowerCase()}`;
      if (!bySeasonTeamKey.has(key)) bySeasonTeamKey.set(key, []);
      bySeasonTeamKey.get(key)!.push(stat);
    }

    const rows: SeasonRow[] = [];
    bySeasonTeamKey.forEach((rawList, key) => {
      const list = dedupeStatRows(rawList);
      if (list.length === 0) return;
      const [seasonLabel] = key.split('_');
      const season = parseInt(seasonLabel, 10);
      const statCompetitionId = getCanonicalEuroStatCompetitionId(list[0] as NBAGMStat & Record<string, unknown>);
      const box = boxData.get(competitionBoxKey(season, phaseKey, statCompetitionId));
      const statTid = list[0].tid;
      const inferredTid = statTid < 0 && box?.teamTid && box.teamTid > 0 ? box.teamTid : statTid;
      const rawAbbrev = statTeamAbbrev(list[0]);
      const team = resolveHistoricalCompetitionTeam({
        teams,
        tid: inferredTid,
        season,
        teamAbbrev: rawAbbrev,
        competitionId: statCompetitionId,
        defaultLeagueTag: defaultLeague?.tag,
      });
      const historicalTeam = team ? getHistoricalTeamSnapshot(team, season) : undefined;
      const canonicalAbbrev = normalizeAbbrev(historicalTeam?.abbrev ?? team?.abbrev);
      const abbrev = canonicalAbbrev ?? rawAbbrev ?? (inferredTid < 0 ? 'FA' : 'UNK');
      const sourceTeamName = String((list[0] as any).teamName ?? '').trim();
      const teamName = team
        ? getTeamFullName({ ...team, ...historicalTeam })
        : sourceTeamName || undefined;
      const sourceAge = sp((list[0] as any)._sourceAge);
      const rowAge = sourceAge > 0 ? sourceAge : (age ?? 0) - (currentYear - season);
      const inferredLeague = resolvePlayerBioStatLeague(
        list[0] as NBAGMStat & Record<string, unknown>,
        inferredTid,
      );
      const statLeague = defaultLeague && !statCompetitionId && inferredLeague.tag === 'NBA'
        ? defaultLeague
        : inferredLeague;
      const boxLeague = defaultLeague && box?.leagueTag === 'NBA'
        ? { tag: defaultLeague.tag, title: defaultLeague.title }
        : box?.leagueTag
          ? { tag: box.leagueTag, title: box.leagueTitle ?? box.leagueTag }
          : undefined;

      const totGp = list.reduce((sum, stat) => sum + sp(stat.gp), 0) || 1;
      const totMin = list.reduce((sum, stat) => sum + sp(stat.min), 0);
      const totFg = list.reduce((sum, stat) => sum + sp(stat.fg), 0);
      const totFga = list.reduce((sum, stat) => sum + sp(stat.fga), 0);
      const totTp = list.reduce((sum, stat) => sum + sp(stat.tp), 0);
      const totTpa = list.reduce((sum, stat) => sum + sp(stat.tpa), 0);
      const totFt = list.reduce((sum, stat) => sum + sp(stat.ft), 0);
      const totFta = list.reduce((sum, stat) => sum + sp(stat.fta), 0);
      const totOrb = list.reduce((sum, stat) => sum + sp(stat.orb), 0);
      const totDrb = list.reduce((sum, stat) => sum + sp(stat.drb), 0);
      const totTrb = list.reduce((sum, stat) => sum + sp((stat as any).trb ?? (stat as any).reb ?? sp(stat.orb) + sp(stat.drb)), 0);
      const totAst = list.reduce((sum, stat) => sum + sp(stat.ast), 0);
      const totStl = list.reduce((sum, stat) => sum + sp(stat.stl), 0);
      const totBlk = list.reduce((sum, stat) => sum + sp(stat.blk), 0);
      const totTov = list.reduce((sum, stat) => sum + sp(stat.tov), 0);
      const totPf = list.reduce((sum, stat) => sum + sp(stat.pf), 0);
      const totPts = list.reduce((sum, stat) => sum + sp(stat.pts), 0);
      const totPm = list.reduce((sum, stat) => sum + sp((stat as any).pm), 0);
      const wpd = (field: string) => list.reduce((sum, stat) => sum + sp((stat as any)[field]) * sp(stat.gp), 0) / totGp;
      const wpm = (field: string) => totMin > 0
        ? list.reduce((sum, stat) => sum + sp((stat as any)[field]) * sp(stat.min), 0) / totMin
        : wpd(field);
      const calibratedPer = totMin > 0
        ? list.reduce((sum, stat) => sum + getCalibratedPer(stat) * sp(stat.min), 0) / totMin
        : list.reduce((sum, stat) => sum + getCalibratedPer(stat) * sp(stat.gp), 0) / totGp;
      const calibratedEwa = list.reduce((sum, stat) => sum + getCalibratedEwa(stat), 0);
      const rawWs = list.reduce((sum, stat) => sum + sp((stat as any).ws), 0);
      const rawOws = list.reduce((sum, stat) => sum + sp((stat as any).ows), 0);
      const rawDws = list.reduce((sum, stat) => sum + sp((stat as any).dws), 0);

      rows.push({
        season,
        seasonLabel: (list[0] as any)._seasonLabel ?? formatPlayerBioSeasonLabel(season, defaultLeague),
        competitionId: statCompetitionId,
        leagueTag: boxLeague?.tag ?? statLeague.tag,
        leagueTitle: boxLeague?.title ?? statLeague.title,
        teamAbbrev: abbrev,
        teamName,
        age: Math.max(16, rowAge),
        gp: totGp,
        gs: list.reduce((sum, stat) => sum + sp(stat.gs), 0),
        minTotal: totMin,
        minPG: totMin / totGp,
        fg: totFg / totGp,
        fga: totFga / totGp,
        fgPct: totFga > 0 ? totFg / totFga : 0,
        tp: totTp / totGp,
        tpa: totTpa / totGp,
        tpPct: totTpa > 0 ? totTp / totTpa : 0,
        twop: (totFg - totTp) / totGp,
        twopa: (totFga - totTpa) / totGp,
        twopPct: (totFga - totTpa) > 0 ? (totFg - totTp) / (totFga - totTpa) : 0,
        efgPct: totFga > 0 ? (totFg + 0.5 * totTp) / totFga : 0,
        ft: totFt / totGp,
        fta: totFta / totGp,
        ftPct: totFta > 0 ? totFt / totFta : 0,
        orb: totOrb / totGp,
        drb: totDrb / totGp,
        trb: totTrb / totGp,
        ast: totAst / totGp,
        stl: totStl / totGp,
        blk: totBlk / totGp,
        tov: totTov / totGp,
        pf: totPf / totGp,
        pts: totPts / totGp,
        pm: totPm / totGp,
        fgAtRim: box ? box.rimFgm / box.gp : 0,
        fgaAtRim: box ? box.rimFga / box.gp : 0,
        fgLowPost: box ? box.lpFgm / box.gp : 0,
        fgaLowPost: box ? box.lpFga / box.gp : 0,
        fgMidRange: box ? box.mrFgm / box.gp : 0,
        fgaMidRange: box ? box.mrFga / box.gp : 0,
        ba: box ? box.ba / box.gp : wpd('ba'),
        dd: box?.dd ?? list.reduce((sum, stat) => sum + sp((stat as any).dd), 0),
        td: box?.td ?? list.reduce((sum, stat) => sum + sp((stat as any).td), 0),
        qd: box?.qd ?? 0,
        fiveBy5: box?.fiveBy5 ?? 0,
        per: calibratedPer,
        ewa: calibratedEwa || rawWs / 11.4,
        tsPct: (totPts > 0 && (totFga + 0.44 * totFta) > 0) ? totPts / (2 * (totFga + 0.44 * totFta)) : sp(list[0]?.tsPct),
        ftRate: totFga > 0 ? totFta / totFga : 0,
        tpRate: totFga > 0 ? totTpa / totFga : 0,
        orbPct: wpm('orbPct') || wpm('orbp') || wpm('orb%'),
        drbPct: wpm('drbPct') || wpm('drbp') || wpm('drb%'),
        trbPct: wpm('rebPct') || wpm('trbPct') || wpm('trbp') || wpm('reb%'),
        astPct: wpm('astPct') || wpm('astp') || wpm('ast%'),
        stlPct: wpm('stlPct') || wpm('stlp') || wpm('stl%'),
        blkPct: wpm('blkPct') || wpm('blkp') || wpm('blk%'),
        tovPct: wpm('tovPct') || wpm('tovp') || wpm('tov%'),
        usgPct: wpm('usgPct') || wpm('usgp') || wpm('usg%'),
        ortg: wpm('ortg'),
        drtg: wpm('drtg'),
        ows: rawOws,
        dws: rawDws,
        ws: rawWs,
        ws48: totMin > 0 ? rawWs / (totMin / 48) : 0,
        obpm: wpm('obpm'),
        dbpm: wpm('dbpm'),
        bpm: wpm('bpm'),
        vorp: list.reduce((sum, stat) => sum + sp((stat as any).vorp), 0),
        ...(box?.gh ?? sourceGameHighs(list)),
      });
    });
    rows.sort((left, right) => left.season - right.season);

    const componentSeasons = new Set(rows
      .filter(row => String(row.leagueTag).toUpperCase() !== 'MIX' && String(row.teamAbbrev).toUpperCase() !== 'TOT')
      .map(row => row.season));
    const scopedRows = rows.filter(row => !componentSeasons.has(row.season) || (
      String(row.leagueTag).toUpperCase() !== 'MIX' && String(row.teamAbbrev).toUpperCase() !== 'TOT'
    ));
    const seasonCompetitionKey = (row: SeasonRow): string =>
      `${row.season}|${String(row.leagueTag ?? '').trim().toUpperCase()}`;
    const bySeasonCompetition = new Map<string, SeasonRow[]>();
    for (const row of scopedRows) {
      const key = seasonCompetitionKey(row);
      if (!bySeasonCompetition.has(key)) bySeasonCompetition.set(key, []);
      bySeasonCompetition.get(key)!.push(row);
    }

    const rowStatSignature = (row: SeasonRow): string => [
      row.gp, row.gs, row.minTotal, row.fg, row.fga, row.tp, row.tpa, row.ft, row.fta,
      row.orb, row.drb, row.trb, row.ast, row.stl, row.blk, row.tov, row.pf, row.pts,
      row.per, row.ws, row.vorp,
    ].map(value => Number(value ?? 0).toFixed(3)).join('|');
    const normalizeTeamAbbrev = (row: SeasonRow): string => String(row.teamAbbrev ?? '').trim().toUpperCase();
    const dedupeSeasonRows = (seasonRows: SeasonRow[]): SeasonRow[] => {
      const withoutSourceTotals = seasonRows.length > 1
        ? seasonRows.filter(row => normalizeTeamAbbrev(row) !== 'TOT')
        : seasonRows;
      const exactSeen = new Set<string>();
      const exactDedupe = withoutSourceTotals.filter(row => {
        const key = `${normalizeTeamAbbrev(row)}|${rowStatSignature(row)}`;
        if (exactSeen.has(key)) return false;
        exactSeen.add(key);
        return true;
      });
      return exactDedupe;
    };

    const finalRows: SeasonRow[] = [];
    bySeasonCompetition.forEach(rawSeasonRows => {
      const seasonRows = dedupeSeasonRows(rawSeasonRows);
      if (seasonRows.length === 1) {
        finalRows.push(seasonRows[0]);
        return;
      }
      const totalGp = seasonRows.reduce((sum, row) => sum + row.gp, 0) || 1;
      const weighted = (field: keyof SeasonRow) => seasonRows.reduce((sum, row) => sum + (row[field] as number) * row.gp, 0) / totalGp;
      const totalMinutes = seasonRows.reduce((sum, row) => sum + row.minTotal, 0);
      const minuteWeighted = (field: keyof SeasonRow) => totalMinutes > 0
        ? seasonRows.reduce((sum, row) => sum + (row[field] as number) * row.minTotal, 0) / totalMinutes
        : weighted(field);
      const total = (field: keyof SeasonRow) => seasonRows.reduce((sum, row) => sum + (row[field] as number), 0);
      const totalRow: SeasonRow = {
        season: seasonRows[0].season,
        seasonLabel: seasonRows[0].seasonLabel,
        competitionId: seasonRows[0].competitionId,
        leagueTag: seasonRows.every(row => row.leagueTag === seasonRows[0].leagueTag) ? seasonRows[0].leagueTag : 'MIX',
        leagueTitle: seasonRows.every(row => row.leagueTitle === seasonRows[0].leagueTitle) ? seasonRows[0].leagueTitle : 'Multiple competitions',
        teamAbbrev: 'TOT',
        age: seasonRows[0].age,
        isTot: true,
        gp: totalGp, gs: total('gs'), minTotal: total('minTotal'), minPG: weighted('minPG'),
        fg: weighted('fg'), fga: weighted('fga'), fgPct: seasonRows.reduce((sum, row) => sum + row.fg * row.gp, 0) / (seasonRows.reduce((sum, row) => sum + row.fga * row.gp, 0) || 1),
        tp: weighted('tp'), tpa: weighted('tpa'), tpPct: seasonRows.reduce((sum, row) => sum + row.tp * row.gp, 0) / (seasonRows.reduce((sum, row) => sum + row.tpa * row.gp, 0) || 1),
        twop: weighted('twop'), twopa: weighted('twopa'), twopPct: seasonRows.reduce((sum, row) => sum + row.twop * row.gp, 0) / (seasonRows.reduce((sum, row) => sum + row.twopa * row.gp, 0) || 1),
        efgPct: weighted('efgPct'), ft: weighted('ft'), fta: weighted('fta'), ftPct: seasonRows.reduce((sum, row) => sum + row.ft * row.gp, 0) / (seasonRows.reduce((sum, row) => sum + row.fta * row.gp, 0) || 1),
        orb: weighted('orb'), drb: weighted('drb'), trb: weighted('trb'), ast: weighted('ast'), stl: weighted('stl'), blk: weighted('blk'), tov: weighted('tov'), pf: weighted('pf'), pts: weighted('pts'), pm: weighted('pm'),
        fgAtRim: weighted('fgAtRim'), fgaAtRim: weighted('fgaAtRim'), fgLowPost: weighted('fgLowPost'), fgaLowPost: weighted('fgaLowPost'), fgMidRange: weighted('fgMidRange'), fgaMidRange: weighted('fgaMidRange'), ba: weighted('ba'),
        dd: total('dd'), td: total('td'), qd: total('qd'), fiveBy5: total('fiveBy5'),
        per: weighted('per'), ewa: total('ewa'), tsPct: weighted('tsPct'), ftRate: weighted('ftRate'), tpRate: weighted('tpRate'),
        orbPct: minuteWeighted('orbPct'), drbPct: minuteWeighted('drbPct'), trbPct: minuteWeighted('trbPct'), astPct: minuteWeighted('astPct'), stlPct: minuteWeighted('stlPct'), blkPct: minuteWeighted('blkPct'), tovPct: minuteWeighted('tovPct'), usgPct: minuteWeighted('usgPct'),
        ortg: minuteWeighted('ortg'), drtg: minuteWeighted('drtg'), ows: total('ows'), dws: total('dws'), ws: total('ws'),
        ws48: total('minTotal') > 0 ? total('ws') / (total('minTotal') / 48) : 0, obpm: minuteWeighted('obpm'), dbpm: minuteWeighted('dbpm'), bpm: minuteWeighted('bpm'), vorp: total('vorp'),
        ghMin: Math.max(...seasonRows.map(row => row.ghMin)), ghFgm: Math.max(...seasonRows.map(row => row.ghFgm)), ghFga: Math.max(...seasonRows.map(row => row.ghFga)),
        ghTpm: Math.max(...seasonRows.map(row => row.ghTpm)), ghTpa: Math.max(...seasonRows.map(row => row.ghTpa)), ghTwom: Math.max(...seasonRows.map(row => row.ghTwom)), ghTwoa: Math.max(...seasonRows.map(row => row.ghTwoa)),
        ghFtm: Math.max(...seasonRows.map(row => row.ghFtm)), ghFta: Math.max(...seasonRows.map(row => row.ghFta)), ghOrb: Math.max(...seasonRows.map(row => row.ghOrb)), ghDrb: Math.max(...seasonRows.map(row => row.ghDrb)), ghTrb: Math.max(...seasonRows.map(row => row.ghTrb)),
        ghAst: Math.max(...seasonRows.map(row => row.ghAst)), ghTov: Math.max(...seasonRows.map(row => row.ghTov)), ghStl: Math.max(...seasonRows.map(row => row.ghStl)), ghBlk: Math.max(...seasonRows.map(row => row.ghBlk)), ghBa: Math.max(...seasonRows.map(row => row.ghBa)), ghPf: Math.max(...seasonRows.map(row => row.ghPf)), ghPts: Math.max(...seasonRows.map(row => row.ghPts)), ghPm: Math.max(...seasonRows.map(row => row.ghPm)), ghGmSc: Math.max(...seasonRows.map(row => row.ghGmSc)),
      };
      finalRows.push(totalRow);
      seasonRows.forEach(row => finalRows.push({ ...row, isSubRow: true }));
    });
    return finalRows;
  };

  let body: SeasonRow[];
  if (phase === 'rs') body = makeSeasoned(rsPool, 'rs');
  else if (phase === 'playoffs') body = makeSeasoned(plyPool, 'ply');
  else if (phase === 'international') body = makeSeasoned(internationalPool, 'int');
  else if (phase === 'college') body = makeSeasoned(collegePool, 'college');
  else if (phase === 'summerLeague') body = makeSeasoned(summerLeaguePool, 'sl');
  else {
    const rsRows = makeSeasoned(rsPool, 'rs').filter(row => !row.isSubRow);
    const plyRows = makeSeasoned(plyPool, 'ply').filter(row => !row.isSubRow);
    const seasonCompetitionKey = (row: SeasonRow): string =>
      `${row.season}|${String(row.leagueTag ?? '').trim().toUpperCase()}`;
    const regularByKey = new Map<string, SeasonRow>(rsRows.map(row => [seasonCompetitionKey(row), row] as const));
    const playoffsByKey = new Map<string, SeasonRow>(plyRows.map(row => [seasonCompetitionKey(row), row] as const));
    const seasonCompetitions = new Set([...regularByKey.keys(), ...playoffsByKey.keys()]);
    body = [];
    seasonCompetitions.forEach(key => {
      const regular = regularByKey.get(key);
      const playoffs = playoffsByKey.get(key);
      if (!regular && !playoffs) return;
      if (!playoffs) { body.push(regular!); return; }
      if (!regular) { body.push(playoffs!); return; }
      const totalGp = regular.gp + playoffs.gp;
      const weighted = (left: keyof SeasonRow, right: keyof SeasonRow) => (((regular[left] as number) * regular.gp) + ((playoffs[right] as number) * playoffs.gp)) / totalGp;
      const totalMinutes = regular.minTotal + playoffs.minTotal;
      const minuteWeighted = (left: keyof SeasonRow, right: keyof SeasonRow) => totalMinutes > 0
        ? (((regular[left] as number) * regular.minTotal) + ((playoffs[right] as number) * playoffs.minTotal)) / totalMinutes
        : weighted(left, right);
      body.push({
        season: regular.season,
        seasonLabel: regular.seasonLabel ?? playoffs.seasonLabel,
        competitionId: regular.competitionId ?? playoffs.competitionId,
        leagueTag: regular.leagueTag === playoffs.leagueTag ? regular.leagueTag : 'MIX',
        leagueTitle: regular.leagueTitle === playoffs.leagueTitle ? regular.leagueTitle : 'Multiple competitions',
        teamAbbrev: regular.teamAbbrev,
        teamName: regular.teamName ?? playoffs.teamName,
        age: regular.age,
        gp: totalGp,
        gs: regular.gs + playoffs.gs,
        minTotal: regular.minTotal + playoffs.minTotal, minPG: ((regular.minPG * regular.gp) + (playoffs.minPG * playoffs.gp)) / totalGp,
        fg: weighted('fg', 'fg'), fga: weighted('fga', 'fga'), fgPct: weighted('fgPct', 'fgPct'),
        tp: weighted('tp', 'tp'), tpa: weighted('tpa', 'tpa'), tpPct: weighted('tpPct', 'tpPct'),
        twop: weighted('twop', 'twop'), twopa: weighted('twopa', 'twopa'), twopPct: weighted('twopPct', 'twopPct'),
        efgPct: weighted('efgPct', 'efgPct'), ft: weighted('ft', 'ft'), fta: weighted('fta', 'fta'), ftPct: weighted('ftPct', 'ftPct'),
        orb: weighted('orb', 'orb'), drb: weighted('drb', 'drb'), trb: weighted('trb', 'trb'), ast: weighted('ast', 'ast'), stl: weighted('stl', 'stl'), blk: weighted('blk', 'blk'), tov: weighted('tov', 'tov'), pf: weighted('pf', 'pf'), pts: weighted('pts', 'pts'), pm: weighted('pm', 'pm'),
        fgAtRim: weighted('fgAtRim', 'fgAtRim'), fgaAtRim: weighted('fgaAtRim', 'fgaAtRim'), fgLowPost: weighted('fgLowPost', 'fgLowPost'), fgaLowPost: weighted('fgaLowPost', 'fgaLowPost'), fgMidRange: weighted('fgMidRange', 'fgMidRange'), fgaMidRange: weighted('fgaMidRange', 'fgaMidRange'), ba: weighted('ba', 'ba'),
        dd: regular.dd + playoffs.dd, td: regular.td + playoffs.td, qd: regular.qd + playoffs.qd, fiveBy5: regular.fiveBy5 + playoffs.fiveBy5,
        per: weighted('per', 'per'), ewa: regular.ewa + playoffs.ewa, tsPct: weighted('tsPct', 'tsPct'), ftRate: weighted('ftRate', 'ftRate'), tpRate: weighted('tpRate', 'tpRate'),
        orbPct: minuteWeighted('orbPct', 'orbPct'), drbPct: minuteWeighted('drbPct', 'drbPct'), trbPct: minuteWeighted('trbPct', 'trbPct'), astPct: minuteWeighted('astPct', 'astPct'), stlPct: minuteWeighted('stlPct', 'stlPct'), blkPct: minuteWeighted('blkPct', 'blkPct'), tovPct: minuteWeighted('tovPct', 'tovPct'), usgPct: minuteWeighted('usgPct', 'usgPct'),
        ortg: minuteWeighted('ortg', 'ortg'), drtg: minuteWeighted('drtg', 'drtg'), ows: regular.ows + playoffs.ows, dws: regular.dws + playoffs.dws, ws: regular.ws + playoffs.ws,
        ws48: totalMinutes > 0 ? (regular.ws + playoffs.ws) / (totalMinutes / 48) : 0, obpm: minuteWeighted('obpm', 'obpm'), dbpm: minuteWeighted('dbpm', 'dbpm'), bpm: minuteWeighted('bpm', 'bpm'), vorp: regular.vorp + playoffs.vorp,
        ghMin: Math.max(regular.ghMin, playoffs.ghMin), ghFgm: Math.max(regular.ghFgm, playoffs.ghFgm), ghFga: Math.max(regular.ghFga, playoffs.ghFga), ghTpm: Math.max(regular.ghTpm, playoffs.ghTpm), ghTpa: Math.max(regular.ghTpa, playoffs.ghTpa), ghTwom: Math.max(regular.ghTwom, playoffs.ghTwom), ghTwoa: Math.max(regular.ghTwoa, playoffs.ghTwoa), ghFtm: Math.max(regular.ghFtm, playoffs.ghFtm), ghFta: Math.max(regular.ghFta, playoffs.ghFta), ghOrb: Math.max(regular.ghOrb, playoffs.ghOrb), ghDrb: Math.max(regular.ghDrb, playoffs.ghDrb), ghTrb: Math.max(regular.ghTrb, playoffs.ghTrb), ghAst: Math.max(regular.ghAst, playoffs.ghAst), ghTov: Math.max(regular.ghTov, playoffs.ghTov), ghStl: Math.max(regular.ghStl, playoffs.ghStl), ghBlk: Math.max(regular.ghBlk, playoffs.ghBlk), ghBa: Math.max(regular.ghBa, playoffs.ghBa), ghPf: Math.max(regular.ghPf, playoffs.ghPf), ghPts: Math.max(regular.ghPts, playoffs.ghPts), ghPm: Math.max(regular.ghPm, playoffs.ghPm), ghGmSc: Math.max(regular.ghGmSc, playoffs.ghGmSc),
      });
    });
    body.sort((left, right) => left.season - right.season);
  }

  body = groupPbaSeasonRows(body);
  if (body.length === 0) return { body, career: null };
  const careerBase = body.filter(row => !row.isSubRow);
  const totalGp = careerBase.reduce((sum, row) => sum + row.gp, 0) || 1;
  const weighted = (field: keyof SeasonRow) => careerBase.reduce((sum, row) => sum + (row[field] as number) * row.gp, 0) / totalGp;
  const totalMinutes = careerBase.reduce((sum, row) => sum + row.minTotal, 0);
  const minuteWeighted = (field: keyof SeasonRow) => totalMinutes > 0
    ? careerBase.reduce((sum, row) => sum + (row[field] as number) * row.minTotal, 0) / totalMinutes
    : weighted(field);
  const total = (field: keyof SeasonRow) => careerBase.reduce((sum, row) => sum + (row[field] as number), 0);
  const career: SeasonRow = {
    season: 0, leagueTag: '', leagueTitle: '', teamAbbrev: '', age: 0, isCareer: true,
    gp: total('gp'), gs: total('gs'), minTotal: total('minTotal'), minPG: weighted('minPG'),
    fg: weighted('fg'), fga: weighted('fga'), fgPct: careerBase.reduce((sum, row) => sum + row.fg * row.gp, 0) / (careerBase.reduce((sum, row) => sum + row.fga * row.gp, 0) || 1),
    tp: weighted('tp'), tpa: weighted('tpa'), tpPct: careerBase.reduce((sum, row) => sum + row.tp * row.gp, 0) / (careerBase.reduce((sum, row) => sum + row.tpa * row.gp, 0) || 1),
    twop: weighted('twop'), twopa: weighted('twopa'), twopPct: careerBase.reduce((sum, row) => sum + row.twop * row.gp, 0) / (careerBase.reduce((sum, row) => sum + row.twopa * row.gp, 0) || 1),
    efgPct: weighted('efgPct'), ft: weighted('ft'), fta: weighted('fta'), ftPct: careerBase.reduce((sum, row) => sum + row.ft * row.gp, 0) / (careerBase.reduce((sum, row) => sum + row.fta * row.gp, 0) || 1),
    orb: weighted('orb'), drb: weighted('drb'), trb: weighted('trb'), ast: weighted('ast'), stl: weighted('stl'), blk: weighted('blk'), tov: weighted('tov'), pf: weighted('pf'), pts: weighted('pts'), pm: weighted('pm'),
    fgAtRim: weighted('fgAtRim'), fgaAtRim: weighted('fgaAtRim'), fgLowPost: weighted('fgLowPost'), fgaLowPost: weighted('fgaLowPost'), fgMidRange: weighted('fgMidRange'), fgaMidRange: weighted('fgaMidRange'), ba: weighted('ba'),
    dd: total('dd'), td: total('td'), qd: total('qd'), fiveBy5: total('fiveBy5'),
    per: weighted('per'), ewa: total('ewa'), tsPct: weighted('tsPct'), ftRate: weighted('ftRate'), tpRate: weighted('tpRate'),
    orbPct: minuteWeighted('orbPct'), drbPct: minuteWeighted('drbPct'), trbPct: minuteWeighted('trbPct'), astPct: minuteWeighted('astPct'), stlPct: minuteWeighted('stlPct'), blkPct: minuteWeighted('blkPct'), tovPct: minuteWeighted('tovPct'), usgPct: minuteWeighted('usgPct'),
    ortg: minuteWeighted('ortg'), drtg: minuteWeighted('drtg'), ows: total('ows'), dws: total('dws'), ws: total('ws'),
    ws48: totalMinutes > 0 ? total('ws') / (totalMinutes / 48) : 0, obpm: minuteWeighted('obpm'), dbpm: minuteWeighted('dbpm'), bpm: minuteWeighted('bpm'), vorp: total('vorp'),
    ghMin: Math.max(...careerBase.map(row => row.ghMin)), ghFgm: Math.max(...careerBase.map(row => row.ghFgm)), ghFga: Math.max(...careerBase.map(row => row.ghFga)), ghTpm: Math.max(...careerBase.map(row => row.ghTpm)), ghTpa: Math.max(...careerBase.map(row => row.ghTpa)), ghTwom: Math.max(...careerBase.map(row => row.ghTwom)), ghTwoa: Math.max(...careerBase.map(row => row.ghTwoa)), ghFtm: Math.max(...careerBase.map(row => row.ghFtm)), ghFta: Math.max(...careerBase.map(row => row.ghFta)), ghOrb: Math.max(...careerBase.map(row => row.ghOrb)), ghDrb: Math.max(...careerBase.map(row => row.ghDrb)), ghTrb: Math.max(...careerBase.map(row => row.ghTrb)), ghAst: Math.max(...careerBase.map(row => row.ghAst)), ghTov: Math.max(...careerBase.map(row => row.ghTov)), ghStl: Math.max(...careerBase.map(row => row.ghStl)), ghBlk: Math.max(...careerBase.map(row => row.ghBlk)), ghBa: Math.max(...careerBase.map(row => row.ghBa)), ghPf: Math.max(...careerBase.map(row => row.ghPf)), ghPts: Math.max(...careerBase.map(row => row.ghPts)), ghPm: Math.max(...careerBase.map(row => row.ghPm)), ghGmSc: Math.max(...careerBase.map(row => row.ghGmSc)),
  };

  return { body, career };
}
