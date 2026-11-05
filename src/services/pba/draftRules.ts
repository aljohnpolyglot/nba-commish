import type { DraftPick, LeagueStats, NBAPlayer } from '../../types';
import type { DraftOrderTeam } from '../draft/draftOrder';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { selectCompetitionTeamTids } from '../competition/competitionScheduler';
import { isFilipino } from './importManager';
import { computeAge } from '../../utils/helpers';
import { normalizeCompactPositionLabel } from '../../utils/positionUtils';

const isDraftProspect = (player: NBAPlayer): boolean =>
  player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';

const isPbaDraftImport = (player: NBAPlayer): boolean =>
  player.isImport === true
  || player.historicalPbaSource?.importTagged === true
  || /\(Import\)\s*$/i.test(player.name);

const isPbaDraftLocal = (player: NBAPlayer): boolean => isFilipino(player) || !!(player as any).pbaLocalEligible;

export const isPbaSourceDraftProspect = (player: NBAPlayer): boolean => (
  (player as any).historicalPbaDraftProspect === true
  || typeof (player as any).pbaDraftSource === 'string'
  || (player as any).pbaDraftRatingsSource === 'historical-pba-roster'
);

const normalizePbaDraftPosition = (pos: unknown, height?: number): string =>
  normalizeCompactPositionLabel(pos, height);

export function getPbaDraftPool(
  players: NBAPlayer[],
  draftYear = new Date().getFullYear(),
  leagueStats?: Pick<LeagueStats, 'draftEligibilityRule' | 'minAgeRequirement'> | null,
): NBAPlayer[] {
  const eligibilityAgeRange = getPbaEligibilityAgeRange(leagueStats);
  return players.filter(p => {
    if (!isDraftProspect(p)) return false;
    if (isPbaDraftImport(p)) return false;
    if (!isPbaDraftLocal(p)) return false;
    const playerDraftYear = Number((p as any).draft?.year);
    if (Number.isFinite(playerDraftYear) && playerDraftYear !== draftYear) return false;
    if (computeAge(p, draftYear) < eligibilityAgeRange.min) return false;
    if ((p as any).historicalPbaDraftProspect === true) {
      if ((p as any).pbaDraftRatingsSource !== 'historical-pba-roster') return false;
      if (!Array.isArray(p.ratings) || p.ratings.length === 0) return false;
    }
    return true;
  });
}

const PBA_RULE_AGE_RANGES: Record<string, { min: number; max: number }> = {
  one_and_done: { min: 19, max: 23 },
  prep_to_pro: { min: 19, max: 23 },
  hardship: { min: 19, max: 23 },
  pre_1970s: { min: 19, max: 24 },
};

export const getPbaEligibilityAgeRange = (
  leagueStats?: Pick<LeagueStats, 'draftEligibilityRule' | 'minAgeRequirement'> | null,
) => {
  const rule = String(leagueStats?.draftEligibilityRule ?? 'pre_1970s');
  const ruleRange = PBA_RULE_AGE_RANGES[rule] ?? PBA_RULE_AGE_RANGES.one_and_done;
  const configuredMin = Number(leagueStats?.minAgeRequirement ?? ruleRange.min);
  const staleDefaultMin = rule === 'pre_1970s' && configuredMin === 22;
  const minFloor = Math.max(19, ruleRange.min);
  const min = Number.isFinite(configuredMin) && !staleDefaultMin
    ? Math.max(minFloor, configuredMin)
    : minFloor;
  const max = Math.max(min, ruleRange.max);
  return { min, max };
};

export function tunePbaDraftProspects(
  players: NBAPlayer[],
  _currentYear: number,
  _leagueStats?: Pick<LeagueStats, 'draftEligibilityRule' | 'minAgeRequirement'> | null,
): NBAPlayer[] {
  return players.map(player => {
    if (!isPbaDraftLocal(player)) return player;
    const pos = normalizePbaDraftPosition(player.pos, player.hgt);
    return pos === player.pos ? player : { ...player, pos };
  });
}

export function getPbaComparisonPool(players: NBAPlayer[]): NBAPlayer[] {
  return players.filter(player => {
    const tid = Number(player.tid);
    const onPbaRoster = Number.isFinite(tid) && tid >= 2000 && tid < 3000;
    return onPbaRoster && player.status === 'PBA';
  });
}

export const PBA_DRAFT_ROUNDS = 2;
export const getPbaDraftClassTargetSize = (activeTeamCount: number): number =>
  Math.max(1, Math.floor(activeTeamCount)) * PBA_DRAFT_ROUNDS + 10;

type PbaConferenceKey = 'philippine' | 'commissioners' | 'governors';

export interface PbaDraftRankingRow {
  tid: number;
  team: any;
  philippineRank: number;
  commissionersRank: number;
  governorsRank: number;
  totalScore: number;
}

const PBA_CONFERENCES: Array<{ key: PbaConferenceKey; competitionId: string; weight: number }> = [
  { key: 'governors', competitionId: PBA_COMPETITIONS[2].id, weight: 0.3 },
  { key: 'commissioners', competitionId: PBA_COMPETITIONS[1].id, weight: 0.3 },
  { key: 'philippine', competitionId: PBA_COMPETITIONS[0].id, weight: 0.4 },
];

const POSTSEASON_PHASES = new Set(['play-in', 'qf', 'quarterfinals', 'sf', 'semifinals', 'final-four', 'final', 'finals', 'bronze']);

const teamIdOf = (team: any): number => Number(team?.tid ?? team?.id);

const teamNameOf = (team: any): string => String(team?.abbrev ?? team?.name ?? team?.region ?? `Team ${teamIdOf(team)}`);

function buildConferenceRankings(
  nonNBATeams: any[],
  boxScores: any[],
  seasonYear?: number,
): Record<PbaConferenceKey, Map<number, number>> {
  const pbaTeams = nonNBATeams
    .filter((team: any) => team.league === 'PBA')
    .filter((team: any) => !team?.isGuest && !team?.guestTeam);
  const pbaTeamTids = selectCompetitionTeamTids(PBA_COMPETITIONS[0], { nonNBATeams }).filter(tid =>
    pbaTeams.some(team => teamIdOf(team) === tid),
  );

  const standingsByConference = new Map<PbaConferenceKey, Map<number, { tid: number; w: number; l: number; pf: number; pa: number }>>();
  for (const { key } of PBA_CONFERENCES) {
    standingsByConference.set(key, new Map(pbaTeamTids.map(tid => [tid, { tid, w: 0, l: 0, pf: 0, pa: 0 }])));
  }

  for (const box of boxScores) {
    const competitionId = String(box?.competitionId ?? '');
    const conference = PBA_CONFERENCES.find(entry => entry.competitionId === competitionId);
    if (!conference) continue;
    if (seasonYear != null && Number(box?.season ?? seasonYear) !== seasonYear) continue;
    const phase = String(box?.competitionPhase ?? '').toLowerCase();
    if (POSTSEASON_PHASES.has(phase)) continue;

    const homeTid = Number(box?.homeTeamId ?? box?.homeTid);
    const awayTid = Number(box?.awayTeamId ?? box?.awayTid);
    const standings = standingsByConference.get(conference.key);
    if (!standings?.has(homeTid) || !standings?.has(awayTid)) continue;

    const homeScore = Number(box?.homeScore ?? 0);
    const awayScore = Number(box?.awayScore ?? 0);
    const winnerTid = box?.winnerId != null
      ? Number(box.winnerId)
      : homeScore > awayScore
        ? homeTid
        : awayTid;
    const loserTid = winnerTid === homeTid ? awayTid : homeTid;

    const winner = standings.get(winnerTid);
    const loser = standings.get(loserTid);
    if (winner) {
      winner.w += 1;
      winner.pf += winnerTid === homeTid ? homeScore : awayScore;
      winner.pa += winnerTid === homeTid ? awayScore : homeScore;
    }
    if (loser) {
      loser.l += 1;
      loser.pf += loserTid === homeTid ? homeScore : awayScore;
      loser.pa += loserTid === homeTid ? awayScore : homeScore;
    }
  }

  const rankMaps = {} as Record<PbaConferenceKey, Map<number, number>>;
  for (const { key } of PBA_CONFERENCES) {
    const standings = standingsByConference.get(key) ?? new Map<number, { tid: number; w: number; l: number; pf: number; pa: number }>();
    const rows = pbaTeamTids
      .map(tid => {
        const row = standings.get(tid) ?? { tid, w: 0, l: 0, pf: 0, pa: 0 };
        const gp = row.w + row.l;
        const winPct = gp > 0 ? row.w / gp : 0;
        return {
          tid,
          winPct,
          diff: row.pf - row.pa,
          team: pbaTeams.find(team => teamIdOf(team) === tid),
        };
      })
      .sort((a, b) =>
        a.winPct - b.winPct ||
        a.diff - b.diff ||
        teamNameOf(a.team).localeCompare(teamNameOf(b.team)),
      );

    const map = new Map<number, number>();
    rows.forEach((row, index) => map.set(row.tid, index + 1));
    rankMaps[key] = map;
  }

  return rankMaps;
}

export function buildPbaDraftRankingRows(
  nonNBATeams: any[],
  boxScores: any[] = [],
  seasonYear?: number,
): PbaDraftRankingRow[] {
  const pbaTeams = nonNBATeams
    .filter((team: any) => team.league === 'PBA')
    .filter((team: any) => !team?.isGuest && !team?.guestTeam);
  if (pbaTeams.length === 0) return [];

  const rankMaps = buildConferenceRankings(nonNBATeams, boxScores, seasonYear);
  const rows = pbaTeams.map(team => {
    const tid = teamIdOf(team);
    const philippineRank = rankMaps.philippine.get(tid) ?? pbaTeams.length;
    const commissionersRank = rankMaps.commissioners.get(tid) ?? pbaTeams.length;
    const governorsRank = rankMaps.governors.get(tid) ?? pbaTeams.length;
    const totalScore = (governorsRank * 0.3) + (commissionersRank * 0.3) + (philippineRank * 0.4);
    return { tid, team, philippineRank, commissionersRank, governorsRank, totalScore };
  });

  return rows.sort((a, b) =>
    a.totalScore - b.totalScore ||
    a.governorsRank - b.governorsRank ||
    a.commissionersRank - b.commissionersRank ||
    a.philippineRank - b.philippineRank ||
    teamNameOf(a.team).localeCompare(teamNameOf(b.team)),
  );
}

export const buildPbaDraftOrderTeams = (
  nonNBATeams: any[],
  boxScores: any[] = [],
  seasonYear?: number,
  prospectCount = 0,
  draftPicks: DraftPick[] = [],
): DraftOrderTeam[] => {
  const pbaRows = buildPbaDraftRankingRows(nonNBATeams, boxScores, seasonYear);
  const pbaOrder = pbaRows.map(row => row.tid);
  const order: DraftOrderTeam[] = [];
  const teamCount = Math.max(1, pbaOrder.length);
  const totalRounds = PBA_DRAFT_ROUNDS;

  for (let round = 1; round <= totalRounds; round++) {
    for (const tid of pbaOrder) {
      const row = pbaRows.find(entry => entry.tid === tid);
      const team = row?.team;
      if (!team) continue;
      const pickAsset = draftPicks.find(pick => pick.season === seasonYear && pick.round === round && pick.originalTid === tid);
      const owner = pbaRows.find(entry => entry.tid === pickAsset?.tid)?.team ?? team;
      order.push({
        ...owner,
        id: teamIdOf(owner),
        name: owner.name ?? 'PBA Team',
        abbrev: owner.abbrev ?? '???',
        _originalTid: tid,
        _originalAbbrev: team.abbrev ?? '???',
        _originalName: team.name ?? 'PBA Team',
        _traded: teamIdOf(owner) !== tid,
        _forfeited: !!pickAsset?.forfeiture,
        _round: round,
        _roundSize: teamCount,
        _r2: round === 2,
      } as any);
    }
  }

  return order;
};
