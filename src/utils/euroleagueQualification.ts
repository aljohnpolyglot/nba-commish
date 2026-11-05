import type { NBATeam, NonNBATeam } from '../types';
import { getSpainClubIdentityKey } from '../data/templates/spain/teamPopulations';

type TeamLike = Partial<NBATeam & NonNBATeam> & {
  id?: number;
  tid?: number;
  lastDomesticFinish?: number;
  lastEndesaFinish?: number;
};

type EuroleagueSelectionSource = {
  nonNBATeams?: TeamLike[];
  clubAliasMap?: Record<number, number>;
  euroleagueSeededTids?: number[];
  euroleagueSeedSeason?: number;
  euroleagueSelectionSeason?: number;
  euroleagueCurrentTids?: number[];
  euroleagueFinishByTid?: Record<number, number>;
  domesticCandidates?: Array<{ tid: number; finish: number; competitionId: string }>;
  continentalPrestigeByTid?: Record<number, number>;
  protectedTids?: number[];
  forcedRemovalTids?: number[];
  leagueStats?: { year?: number };
  userTeamId?: number | null;
};

export type EuroleagueSelection = {
  tids: number[];
  licensedSpanishTids: number[];
  wildcardTid: number | null;
  wildcardFinish: number | null;
  promotedTids: number[];
  removedTids: number[];
  candidateEvaluations: EuroleagueCandidateEvaluation[];
};

export type EuroleagueCandidateEvaluation = {
  tid: number;
  performance: number;
  continentalStanding: number;
  clubStanding: number;
  continuity: number;
  totalScore: number;
  selected: boolean;
  incumbent: boolean;
};

export type ContinentalQualificationExplanation = {
  title: string;
  points: string[];
};

const LICENSED_SPANISH_CLUBS = new Set([
  getSpainClubIdentityKey('Real Madrid', ''),
  getSpainClubIdentityKey('Barcelona', 'Barca'),
  getSpainClubIdentityKey('Baskonia', ''),
].filter((identity): identity is string => !!identity));

const INITIAL_WILDCARD_CLUB = getSpainClubIdentityKey('Valencia', 'Basket');

function getTid(team: TeamLike | null | undefined): number | null {
  const tid = team?.tid ?? team?.id;
  return typeof tid === 'number' ? tid : null;
}

export function isLicensedSpanishEuroleagueClub(team: TeamLike): boolean {
  const identity = getSpainClubIdentityKey(team.region, team.name);
  return !!identity && LICENSED_SPANISH_CLUBS.has(identity);
}

export function isInitialSpanishEuroleagueWildcard(team: TeamLike): boolean {
  const identity = getSpainClubIdentityKey(team.region, team.name);
  return !!identity && identity === INITIAL_WILDCARD_CLUB;
}

export function getContinentalQualificationExplanation(
  competitionId: string,
): ContinentalQualificationExplanation | null {
  if (competitionId === 'euroleague') {
    return {
      title: 'How clubs enter EuroLeague',
      points: [
        'Opening membership follows the selected starting season; later membership follows results in your save.',
        'The EuroCup champion receives first priority for an available place, followed by domestic champions.',
        'Existing members are ranked by EuroLeague finish and continental standing when places must be freed; licensed clubs remain protected.',
      ],
    };
  }
  if (competitionId === 'eurocup') {
    return {
      title: 'How clubs enter EuroCup',
      points: [
        'Existing members remain unless they move into EuroLeague.',
        'Clubs leaving EuroLeague receive first priority for open EuroCup places.',
        'Remaining places go to leading domestic finishers, beginning with champions and top-two clubs.',
      ],
    };
  }
  return null;
}

function canonicalTid(team: TeamLike, source: EuroleagueSelectionSource): number | null {
  const tid = getTid(team);
  if (tid == null) return null;
  return source.clubAliasMap?.[tid] ?? tid;
}

function uniqueTids(tids: Array<number | null | undefined>): number[] {
  return [...new Set(tids.filter((tid): tid is number => typeof tid === 'number' && tid >= 100))];
}

function sortByWildcardPriority(a: TeamLike, b: TeamLike): number {
  const aFinish = a.lastDomesticFinish ?? a.lastEndesaFinish ?? Number.POSITIVE_INFINITY;
  const bFinish = b.lastDomesticFinish ?? b.lastEndesaFinish ?? Number.POSITIVE_INFINITY;
  if (aFinish !== bFinish) return aFinish - bFinish;

  const aInitial = isInitialSpanishEuroleagueWildcard(a) ? 0 : 1;
  const bInitial = isInitialSpanishEuroleagueWildcard(b) ? 0 : 1;
  if (aInitial !== bInitial) return aInitial - bInitial;

  const aGames = (a.wins ?? 0) + (a.losses ?? 0);
  const bGames = (b.wins ?? 0) + (b.losses ?? 0);
  if (aGames > 0 || bGames > 0) {
    const aPct = aGames > 0 ? (a.wins ?? 0) / aGames : -1;
    const bPct = bGames > 0 ? (b.wins ?? 0) / bGames : -1;
    if (aPct !== bPct) return bPct - aPct;
  }

  return (b.pop ?? 0) - (a.pop ?? 0);
}

function capWithProtectedTids(tids: number[], teamCount: number | undefined, protectedTids: Set<number>): number[] {
  if (!teamCount || tids.length <= teamCount) return tids;
  const protectedList = tids.filter(tid => protectedTids.has(tid));
  const fill = tids.filter(tid => !protectedTids.has(tid)).slice(0, Math.max(0, teamCount - protectedList.length));
  return uniqueTids([...fill, ...protectedList]).slice(0, teamCount);
}

const score = (value: number, minimum = 0, maximum = 100) => Math.round(Math.max(minimum, Math.min(maximum, value)));

function buildCandidateEvaluations(
  source: EuroleagueSelectionSource,
  teams: TeamLike[],
  currentTids: number[],
  domesticCandidates: Array<{ tid: number; finish: number; competitionId: string }>,
  selectedTids: number[],
  protectedTids: Set<number>,
): EuroleagueCandidateEvaluation[] {
  const domesticByTid = new Map(domesticCandidates.map((candidate, index) => [candidate.tid, { ...candidate, index }]));
  const tids = uniqueTids([
    ...domesticCandidates.map(candidate => candidate.tid),
    ...currentTids.filter(tid => !protectedTids.has(tid)),
  ]);
  const ranked = tids.sort((left, right) => {
    const leftSelected = selectedTids.includes(left) ? 0 : 1;
    const rightSelected = selectedTids.includes(right) ? 0 : 1;
    if (leftSelected !== rightSelected) return leftSelected - rightSelected;
    const leftDomestic = domesticByTid.get(left)?.index ?? Number.MAX_SAFE_INTEGER;
    const rightDomestic = domesticByTid.get(right)?.index ?? Number.MAX_SAFE_INTEGER;
    if (leftDomestic !== rightDomestic) return leftDomestic - rightDomestic;
    const finish = source.euroleagueFinishByTid ?? {};
    return Number(finish[left] ?? Number.MAX_SAFE_INTEGER) - Number(finish[right] ?? Number.MAX_SAFE_INTEGER);
  });
  return ranked.map((tid, index) => {
    const domestic = domesticByTid.get(tid);
    const euroleagueFinish = Number(source.euroleagueFinishByTid?.[tid] ?? 0);
    const team = teams.find(candidate => canonicalTid(candidate, source) === tid);
    const performance = domestic
      ? score(100 - Math.max(0, domestic.finish) * 7, 35)
      : score(104 - Math.max(1, euroleagueFinish) * 4, 35);
    return {
      tid,
      performance,
      continentalStanding: score(Number(source.continentalPrestigeByTid?.[tid] ?? 25), 25),
      clubStanding: score(Number(team?.pop ?? 0) * 8, 25),
      continuity: currentTids.includes(tid) ? 100 : 35,
      totalScore: score(96 - index * 4, 50),
      selected: selectedTids.includes(tid),
      incumbent: currentTids.includes(tid),
    };
  });
}

export function selectEuroleagueParticipants(
  source: EuroleagueSelectionSource,
  teamCount?: number,
): EuroleagueSelection {
  const teams = source.nonNBATeams ?? [];
  const endesaTeams = teams.filter(team => team.league === 'Endesa' && (team as any).endesaRelegated !== true);

  const licensedSpanishTids = uniqueTids(
    endesaTeams
      .filter(isLicensedSpanishEuroleagueClub)
      .map(team => canonicalTid(team, source)),
  );

  const wildcardTeam = [...endesaTeams]
    .filter(team => !isLicensedSpanishEuroleagueClub(team))
    .sort(sortByWildcardPriority)[0] ?? null;
  const wildcardTid = wildcardTeam ? canonicalTid(wildcardTeam, source) : null;

  const selectionSeason = source.euroleagueSelectionSeason ?? source.leagueStats?.year;
  const isOpeningSeedSeason = selectionSeason != null
    && source.euroleagueSeedSeason != null
    && selectionSeason === source.euroleagueSeedSeason;
  const seededTids = isOpeningSeedSeason
    ? uniqueTids(source.euroleagueSeededTids ?? [])
    : [];
  if (seededTids.length > 0) {
    const seededSet = new Set(seededTids);
    return {
      tids: capWithProtectedTids(seededTids, teamCount, seededSet),
      licensedSpanishTids: licensedSpanishTids.filter(tid => seededSet.has(tid)),
      wildcardTid: wildcardTid != null && seededSet.has(wildcardTid) ? wildcardTid : null,
      wildcardFinish: wildcardTid != null && seededSet.has(wildcardTid) ? wildcardTeam?.lastDomesticFinish ?? wildcardTeam?.lastEndesaFinish ?? null : null,
      promotedTids: [],
      removedTids: [],
      candidateEvaluations: [],
    };
  }

  const currentTids = uniqueTids(source.euroleagueCurrentTids ?? source.euroleagueSeededTids ?? []);
  const candidateByTid = new Map<number, { tid: number; finish: number; competitionId: string }>();
  for (const candidate of source.domesticCandidates ?? []) {
    const canonical = source.clubAliasMap?.[candidate.tid] ?? candidate.tid;
    if (currentTids.includes(canonical)) continue;
    const existing = candidateByTid.get(canonical);
    if (!existing || candidate.finish < existing.finish) candidateByTid.set(canonical, { ...candidate, tid: canonical });
  }
  const domesticCandidates = [...candidateByTid.values()].sort((a, b) => {
    if (a.finish !== b.finish) return a.finish - b.finish;
    const coefficientDifference = Number(source.continentalPrestigeByTid?.[b.tid] ?? 0)
      - Number(source.continentalPrestigeByTid?.[a.tid] ?? 0);
    if (coefficientDifference !== 0) return coefficientDifference;
    if (a.tid === source.userTeamId) return -1;
    if (b.tid === source.userTeamId) return 1;
    const aTeam = teams.find(team => canonicalTid(team, source) === a.tid);
    const bTeam = teams.find(team => canonicalTid(team, source) === b.tid);
    return Number(bTeam?.pop ?? 0) - Number(aTeam?.pop ?? 0);
  });

  if (currentTids.length > 0) {
    const targetCount = teamCount ?? currentTids.length;
    const protectedTids = new Set(source.protectedTids ?? []);
    const forcedRemovalTids = new Set(source.forcedRemovalTids ?? []);
    const protectedCurrent = currentTids.filter(tid => !forcedRemovalTids.has(tid) && protectedTids.has(tid));
    const openPlaceCount = Math.max(0, targetCount - protectedCurrent.length);
    const promoted = domesticCandidates.slice(0, Math.min(2, openPlaceCount));
    const promotedTids = promoted.map(candidate => candidate.tid);
    const rank = source.euroleagueFinishByTid ?? {};
    const retained = currentTids
      .filter(tid => !forcedRemovalTids.has(tid) && !promotedTids.includes(tid) && !protectedTids.has(tid))
      .sort((a, b) => (
        Number(rank[a] ?? Number.MAX_SAFE_INTEGER) - Number(rank[b] ?? Number.MAX_SAFE_INTEGER)
        || Number(source.continentalPrestigeByTid?.[b] ?? 0) - Number(source.continentalPrestigeByTid?.[a] ?? 0)
      ));
    const availableIncumbentPlaces = Math.max(0, targetCount - protectedCurrent.length - promotedTids.length);
    const keptIncumbents = retained.slice(0, availableIncumbentPlaces);
    const selected = uniqueTids([
      ...currentTids.filter(tid => protectedCurrent.includes(tid) || keptIncumbents.includes(tid)),
      ...promotedTids,
    ]);
    const removedTids = currentTids.filter(tid => !selected.includes(tid));
    return {
      tids: selected,
      licensedSpanishTids: licensedSpanishTids.filter(tid => selected.includes(tid)),
      wildcardTid: promotedTids[0] ?? null,
      wildcardFinish: promoted[0]?.finish ?? null,
      promotedTids,
      removedTids,
      candidateEvaluations: buildCandidateEvaluations(source, teams, currentTids, domesticCandidates, selected, protectedTids),
    };
  }

  const spanishParticipantTids = new Set(uniqueTids([...licensedSpanishTids, wildcardTid]));
  const euroleagueBaseTids = teams
    .filter(team => team.league === 'Euroleague')
    .filter(team => {
      const mappedTid = canonicalTid(team, source);
      return mappedTid == null || !spanishParticipantTids.has(mappedTid);
    })
    .filter(team => !isLicensedSpanishEuroleagueClub(team) && !isInitialSpanishEuroleagueWildcard(team))
    .map(team => canonicalTid(team, source));

  const ordered = uniqueTids([...euroleagueBaseTids, ...licensedSpanishTids, wildcardTid]);
  const protectedTids = new Set<number>([...licensedSpanishTids, ...(wildcardTid != null ? [wildcardTid] : [])]);
  if (source.userTeamId != null && ordered.includes(source.userTeamId)) protectedTids.add(source.userTeamId);

  return {
    tids: capWithProtectedTids(ordered, teamCount, protectedTids),
    licensedSpanishTids,
    wildcardTid,
    wildcardFinish: wildcardTeam?.lastDomesticFinish ?? wildcardTeam?.lastEndesaFinish ?? null,
    promotedTids: wildcardTid != null ? [wildcardTid] : [],
    removedTids: [],
    candidateEvaluations: [],
  };
}
