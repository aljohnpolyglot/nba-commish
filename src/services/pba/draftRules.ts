import type { LeagueStats, NBAPlayer } from '../../types';
import type { DraftOrderTeam } from '../draft/draftOrder';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { selectCompetitionTeamTids } from '../competition/competitionScheduler';
import { isFilipino } from './importManager';
import { computeAge, convertTo2KRating } from '../../utils/helpers';

const PBA_DRAFT_TUNING_VERSION = 'pba-draft-2026-06-k2-v11';

const seededUnit = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

const internalRatingForK2 = (target: number, height: number, threePoint?: number): number => {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let rating = 0; rating <= 100; rating++) {
    const distance = Math.abs(convertTo2KRating(rating, height, threePoint) - target);
    if (distance < bestDistance) {
      best = rating;
      bestDistance = distance;
    }
  }
  return best;
};

const displayK2ForPlayer = (player: NBAPlayer): number => {
  const ratings = Array.isArray(player.ratings) ? player.ratings : [];
  const last = ratings.length > 0 ? ratings[ratings.length - 1] : undefined;
  const rawOvr = Number(player.overallRating ?? last?.ovr ?? 50);
  const height = Number(last?.hgt ?? 50);
  const threePoint = typeof last?.tp === 'number' ? last.tp : undefined;
  return convertTo2KRating(rawOvr, height, threePoint);
};

const displayPotK2ForPlayer = (player: NBAPlayer, currentYear: number): number => {
  const ratings = Array.isArray(player.ratings) ? player.ratings : [];
  const last = ratings.length > 0 ? ratings[ratings.length - 1] : undefined;
  const rawOvr = Number(player.overallRating ?? last?.ovr ?? 50);
  const rawPot = Number(player.potential ?? last?.pot ?? rawOvr);
  const age = computeAge(player, currentYear);
  const resolvedPot = Number.isFinite(rawPot) && rawPot > 0 ? Math.max(rawOvr, rawPot) : Math.max(rawOvr, rawOvr + Math.max(2, 23 - age));
  const height = Number(last?.hgt ?? 50);
  const threePoint = typeof last?.tp === 'number' ? last.tp : undefined;
  return convertTo2KRating(resolvedPot, height, threePoint);
};

const draftYearOf = (player: NBAPlayer, fallbackYear: number): number => {
  const draftYear = Number((player as any).draft?.year);
  return Number.isFinite(draftYear) ? draftYear : fallbackYear;
};

const isDraftProspect = (player: NBAPlayer): boolean =>
  player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';

const isRetunablePbaDraftee = (player: NBAPlayer, currentYear: number): boolean => {
  if ((player as any).pbaDraftTunedVersion === PBA_DRAFT_TUNING_VERSION) return false;
  if (player.status !== 'PBA') return false;
  const draft = (player as any).draft;
  const draftYear = Number(draft?.year);
  const draftRound = Number(draft?.round);
  if (!Number.isFinite(draftYear) || draftYear < currentYear - 3 || draftYear > currentYear + 1) return false;
  if (!Number.isFinite(draftRound) || draftRound <= 0) return false;
  const version = String((player as any).pbaDraftTunedVersion ?? '');
  return version.startsWith('pba-draft-') || version.length === 0;
};

type PbaTuneMeta = {
  rankPct: number;
  targetOvrK2: number;
  targetPotK2: number;
};

const buildPbaTuneMeta = (
  players: NBAPlayer[],
  currentYear: number,
): Map<string, PbaTuneMeta> => {
  const byDraftYear = new Map<number, Array<{ player: NBAPlayer; score: number }>>();
  for (const player of players) {
    const shouldTune = isDraftProspect(player) || isRetunablePbaDraftee(player, currentYear);
    if (!shouldTune || !isFilipino(player)) continue;
    const draftYear = draftYearOf(player, currentYear);
    const age = computeAge(player, currentYear);
    const displayOvr = displayK2ForPlayer(player);
    const displayPot = displayPotK2ForPlayer(player, currentYear);
    const readiness = Math.max(0, 23 - age) * 0.35;
    const score = (displayPot * 0.58) + (displayOvr * 0.42) + readiness;
    const group = byDraftYear.get(draftYear) ?? [];
    group.push({ player, score });
    byDraftYear.set(draftYear, group);
  }

  const meta = new Map<string, PbaTuneMeta>();
  for (const [draftYear, group] of byDraftYear.entries()) {
    group.sort((a, b) => b.score - a.score);
    const denom = Math.max(1, group.length - 1);
    for (let index = 0; index < group.length; index++) {
      const { player } = group[index];
      const seed = seededUnit(`${player.internalId}|${player.name}|${draftYear}|ovr`);
      const potSeed = seededUnit(`${player.internalId}|${player.name}|${draftYear}|pot`);
      const rankPct = group.length === 1 ? 1 : 1 - (index / denom);
      const yearsUntilDraft = Math.max(0, draftYear - currentYear);
      const futurePenalty = yearsUntilDraft * 2;
      const targetOvrK2 = Math.round(Math.max(42, Math.min(50, 42 + (rankPct * 6) + seed - futurePenalty)));
      const targetPotK2 = Math.round(Math.max(45, Math.min(54, targetOvrK2 + 2 + rankPct + potSeed - yearsUntilDraft)));
      meta.set(player.internalId, { rankPct, targetOvrK2, targetPotK2 });
    }
  }
  return meta;
};

export function getPbaDraftPool(
  players: NBAPlayer[],
  draftYear = new Date().getFullYear(),
  leagueStats?: Pick<LeagueStats, 'draftEligibilityRule' | 'minAgeRequirement'> | null,
): NBAPlayer[] {
  const eligibilityAgeRange = getPbaEligibilityAgeRange(leagueStats);
  return players.filter(p => {
    if (!isDraftProspect(p)) return false;
    if (!isFilipino(p)) return false;
    const playerDraftYear = Number((p as any).draft?.year);
    if (Number.isFinite(playerDraftYear) && playerDraftYear !== draftYear) return false;
    if (computeAge(p, draftYear) < eligibilityAgeRange.min) return false;
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
  currentYear: number,
  leagueStats?: Pick<LeagueStats, 'draftEligibilityRule' | 'minAgeRequirement'> | null,
): NBAPlayer[] {
  const eligibilityAgeRange = getPbaEligibilityAgeRange(leagueStats);
  const tuneMeta = buildPbaTuneMeta(players, currentYear);
  return players.map(player => {
    const shouldTune = isDraftProspect(player) || isRetunablePbaDraftee(player, currentYear);
    if (!shouldTune || !isFilipino(player)) return player;

    const draftYear = draftYearOf(player, currentYear);
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
    const meta = tuneMeta.get(player.internalId);
    const rankPct = meta?.rankPct ?? 0.5;
    const targetOvrK2 = meta?.targetOvrK2 ?? (43 + Math.floor(seed * 5));
    const targetPotK2 = meta?.targetPotK2 ?? Math.min(54, targetOvrK2 + 3);
    const height = Number(last?.hgt ?? 50);
    const threePoint = typeof last?.tp === 'number' ? Math.min(last.tp, 84) : undefined;
    const tunedOvr = internalRatingForK2(targetOvrK2, height, threePoint);
    const tunedPot = internalRatingForK2(targetPotK2, height, threePoint);

    if (last) {
      const pos = String(player.pos ?? '');
      const isGuard = pos.includes('G') && !pos.includes('C');
      const isCenter = pos.includes('C');
      const isComboForward = pos.includes('F');
      const floorBase = Math.max(24, tunedOvr - 6 + Math.round(rankPct * 4));
      const shootingFloor = floorBase + (isGuard ? 4 : isComboForward ? 1 : -2);
      const finishingFloor = floorBase + (isCenter ? 6 : 3);
      const playmakingFloor = floorBase + (isGuard ? 5 : isCenter ? -3 : 1);
      const iqFloor = floorBase + 1;
      const defenseFloor = floorBase + (isCenter ? 4 : 2);
      const athleticFloor = floorBase + (String((player as any).archetype ?? '').toLowerCase().includes('athletic') ? 4 : 2);
      const reboundingFloor = floorBase + (isCenter ? 7 : isComboForward ? 3 : 0);
      const strengthFloor = floorBase + (isCenter ? 7 : isComboForward ? 3 : 1);
      const cap = 64;
      const lift = (value: unknown, floor: number) => {
        const numeric = Number(value);
        return Math.round(Math.max(Number.isFinite(numeric) ? numeric : floor, floor));
      };
      last.tp = Math.min(cap, lift(last.tp, shootingFloor));
      last.fg = Math.min(cap, lift(last.fg, shootingFloor - 1));
      last.ft = Math.min(cap, lift(last.ft, shootingFloor - 2));
      last.ins = Math.min(cap, lift(last.ins, finishingFloor));
      last.dnk = Math.min(cap, lift(last.dnk, finishingFloor + (isCenter ? 1 : 2)));
      last.pss = Math.min(cap, lift(last.pss, playmakingFloor));
      last.drb = Math.min(cap, lift(last.drb, playmakingFloor + (isGuard ? 1 : 0)));
      last.oiq = Math.min(cap, lift(last.oiq, iqFloor));
      last.diq = Math.min(cap, lift(last.diq, defenseFloor));
      last.spd = Math.min(cap, lift(last.spd, athleticFloor + (isGuard ? 2 : 0)));
      last.jmp = Math.min(cap, lift(last.jmp, athleticFloor + 1));
      last.endu = Math.min(cap, lift(last.endu, athleticFloor));
      last.reb = Math.min(cap, lift(last.reb, reboundingFloor));
      last.stre = Math.min(cap, lift(last.stre, strengthFloor));
      last.ovr = tunedOvr;
      last.pot = tunedPot;
      ratings[lastIndex] = last;
    }

    return {
      ...player,
      age,
      born: player.born ? { ...player.born, year: currentYear - age } : { year: currentYear - age, loc: 'Philippines' },
      overallRating: tunedOvr,
      potential: tunedPot,
      ratings,
      pbaDraftTunedVersion: PBA_DRAFT_TUNING_VERSION,
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
