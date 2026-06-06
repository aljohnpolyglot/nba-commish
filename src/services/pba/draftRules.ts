import type { LeagueStats, NBAPlayer } from '../../types';
import type { DraftOrderTeam } from '../draft/draftOrder';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { selectCompetitionTeamTids } from '../competition/competitionScheduler';
import { isFilipino } from './importManager';

const seededUnit = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

export function getPbaDraftPool(players: NBAPlayer[]): NBAPlayer[] {
  return players.filter(p => {
    if (p.tid !== -2) return false; // draft prospects only
    if (!isFilipino(p)) return false;
    return true;
  });
}

const PBA_RULE_AGE_RANGES: Record<string, { min: number; max: number }> = {
  one_and_done: { min: 19, max: 23 },
  prep_to_pro: { min: 17, max: 23 },
  hardship: { min: 19, max: 23 },
  pre_1970s: { min: 21, max: 24 },
};

const getPbaEligibilityAgeRange = (
  leagueStats?: Pick<LeagueStats, 'draftEligibilityRule' | 'minAgeRequirement'> | null,
) => {
  const rule = String(leagueStats?.draftEligibilityRule ?? 'one_and_done');
  const ruleRange = PBA_RULE_AGE_RANGES[rule] ?? PBA_RULE_AGE_RANGES.one_and_done;
  const configuredMin = Number(leagueStats?.minAgeRequirement ?? ruleRange.min);
  const min = Number.isFinite(configuredMin) ? Math.max(ruleRange.min, configuredMin) : ruleRange.min;
  const max = Math.max(min, ruleRange.max);
  return { min, max };
};

export function tunePbaDraftProspects(
  players: NBAPlayer[],
  currentYear: number,
  leagueStats?: Pick<LeagueStats, 'draftEligibilityRule' | 'minAgeRequirement'> | null,
): NBAPlayer[] {
  const eligibilityAgeRange = getPbaEligibilityAgeRange(leagueStats);
  return players.map(player => {
    const isProspect = player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';
    if (!isProspect || !isFilipino(player)) return player;

    const draftYear = Number((player as any).draft?.year ?? currentYear);
    const yearsUntilDraft = Math.max(0, draftYear - currentYear);
    const minAge = Math.max(16, eligibilityAgeRange.min - yearsUntilDraft);
    const maxAge = Math.max(minAge, eligibilityAgeRange.max - yearsUntilDraft);
    const seed = seededUnit(`${player.internalId}|${player.name}|${draftYear}`);
    const rawAge = Number(player.age ?? (player.born?.year ? currentYear - player.born.year : maxAge));
    let age = Number.isFinite(rawAge) ? rawAge : maxAge;
    age = Math.min(maxAge, Math.max(minAge, age));
    if (age === maxAge && maxAge > minAge && seed < 0.6) age -= 1;

    const ratings = Array.isArray(player.ratings) && player.ratings.length > 0 ? [...player.ratings] : [];
    const lastIndex = ratings.length - 1;
    const last = lastIndex >= 0 ? { ...ratings[lastIndex] } : undefined;
    const rawOvr = Number(player.overallRating ?? last?.ovr ?? 34);
    const rawPot = Number(player.potential ?? last?.pot ?? rawOvr + 6);
    const tunedOvr = Math.max(30, Math.min(42, Math.round(rawOvr * 0.76 + 4)));
    const tunedPotBase = Math.round(rawPot * 0.72 + 5 + (age <= 19 ? 2 : 0));
    const tunedPot = Math.max(tunedOvr + 3, Math.min(54, tunedPotBase));

    if (last) {
      last.ovr = tunedOvr;
      last.pot = tunedPot;
      if (typeof last.tp === 'number') last.tp = Math.min(last.tp, 84);
      ratings[lastIndex] = last;
    }

    return {
      ...player,
      age,
      born: player.born ? { ...player.born, year: currentYear - age } : { year: currentYear - age, loc: 'Philippines' },
      overallRating: tunedOvr,
      potential: tunedPot,
      ratings,
    };
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
export const PBA_MAX_DRAFT_ROUNDS = 8;

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
): DraftOrderTeam[] => {
  const pbaRows = buildPbaDraftRankingRows(nonNBATeams, boxScores, seasonYear);
  const pbaOrder = pbaRows.map(row => row.tid);
  const order: DraftOrderTeam[] = [];
  const teamCount = Math.max(1, pbaOrder.length);
  const roundsByPool = Math.ceil(Math.max(prospectCount, teamCount * PBA_DRAFT_ROUNDS) / teamCount);
  const totalRounds = Math.max(PBA_DRAFT_ROUNDS, Math.min(PBA_MAX_DRAFT_ROUNDS, roundsByPool));

  for (let round = 1; round <= totalRounds; round++) {
    for (const tid of pbaOrder) {
      const row = pbaRows.find(entry => entry.tid === tid);
      const team = row?.team;
      if (!team) continue;
      order.push({
        ...team,
        id: tid,
        name: team.name ?? 'PBA Team',
        abbrev: team.abbrev ?? '???',
        _originalTid: tid,
        _originalAbbrev: team.abbrev ?? '???',
        _originalName: team.name ?? 'PBA Team',
        _traded: false,
        _round: round,
        _roundSize: teamCount,
        _r2: round === 2,
      } as any);
    }
  }

  return order;
};
