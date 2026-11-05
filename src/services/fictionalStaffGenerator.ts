import type { GameState, HistoricalAward, NBATeam, StaffData, StaffMember } from '../types';
import type { NameData } from '../genplayersconstants';
import { getRaceFrequencies } from '../genplayersconstants';
import type { RefereeData } from '../data/photos/referees';
import { generateBasketballFace } from './genDraftPlayers';
import { getStaffMarketSalary } from './tycoon/economyScale';
import { createPortraitUsageSet, getRegenPortraitUrl, type RegenRace } from '../utils/newgenPortrait';
import { getTeamFullName } from '../utils/teamNames';
import type { FictionalHistoryMode } from '../types/fictionalLeague';
import { pickGenderedName } from '../data/nameDataFetcher';
import { generateGMAttributes } from './staff/gmAttributes';
import { getSimulationSeed } from './saveIdentity';
import { resolveEraAwareStaffRating } from './era/basketballEraRules';

export const FICTIONAL_STAFF_LEAGUE_ID = 'fictional';
export const FICTIONAL_STAFF_SEED_VERSION = 5;

type FictionalStaffGenderMode = 'male' | 'female' | 'mixed';

export const FICTIONAL_TEAM_STAFF_ROLES = [
  'Head Coach',
  'Assistant Coach',
  'Assistant Coach 2',
  'Assistant Coach 3',
  'Head of Sports Science',
  'Head Physio',
  'Player Development Coach',
  'Chief Scout',
  'Head of Analytics',
] as const;

const FICTIONAL_POOL_ROLES = [
  'Head Coach',
  'Assistant Coach',
  'Head of Sports Science',
  'Head Physio',
  'Player Development Coach',
  'Chief Scout',
  'Head of Analytics',
] as const;

const LEAGUE_OFFICE_TITLES = [
  'Deputy Commissioner',
  'President of Basketball Operations',
  'SVP of Player Personnel',
  'Director of Officiating',
  'Chief Legal Officer',
  'SVP of Communications',
  'Director of Player Development',
  'VP of Referee Operations',
  'SVP of Marketing',
  'Chief Financial Officer',
];

type FictionalStaffSetup = {
  teams: NBATeam[];
  staff: StaffData;
  staffFreeAgents: StaffMember[];
  referees: RefereeData[];
};

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedKey(values: Record<string, number>, rng: () => number): string | undefined {
  const entries = Object.entries(values).filter(([, weight]) => Number(weight) > 0);
  const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  if (total <= 0) return entries[0]?.[0];
  let roll = rng() * total;
  for (const [key, weight] of entries) {
    roll -= Number(weight);
    if (roll <= 0) return key;
  }
  return entries.at(-1)?.[0];
}

function teamCountry(team?: NBATeam): string {
  const location = String(team?.region ?? team?.name ?? '').toLowerCase();
  if (['toronto', 'montreal', 'vancouver'].some(city => location.includes(city))) return 'Canada';
  if (location.includes('mexico')) return 'Mexico';
  return 'USA';
}

function teamId(team: NBATeam, fallback = 0): number {
  return team.id ?? (team as unknown as { tid?: number }).tid ?? fallback;
}

function pickNationality(rng: () => number, localCountry?: string): string {
  if (localCountry && rng() < 0.68) return localCountry;
  const roll = rng();
  if (roll < 0.72) return 'USA';
  if (roll < 0.82) return 'Canada';
  if (roll < 0.89) return 'Mexico';
  if (roll < 0.93) return 'Nigeria';
  if (roll < 0.96) return 'France';
  if (roll < 0.98) return 'Spain';
  return 'Australia';
}

function pickRace(country: string, rng: () => number): RegenRace {
  const frequencies = getRaceFrequencies(country);
  const picked = weightedKey(frequencies, rng);
  return picked === 'black' || picked === 'asian' || picked === 'brown' || picked === 'white'
    ? picked
    : 'black';
}

function baseRole(role: string): string {
  return role.replace(/ \d+$/, '');
}

function makeStaffMember(params: {
  id: string;
  role: string;
  currentYear: number;
  nameData: NameData;
  rng: () => number;
  team?: NBATeam;
  position?: string;
  freshLeague?: boolean;
  usedPortraitUrls: Set<string>;
  genderMode?: FictionalStaffGenderMode;
}): StaffMember {
  const nationality = pickNationality(params.rng, params.team ? teamCountry(params.team) : undefined);
  const race = pickRace(nationality, params.rng);
  const gender = params.genderMode === 'female'
    ? 'female'
    : params.genderMode === 'mixed' && params.rng() < 0.5
      ? 'female'
      : 'male';
  const name = pickGenderedName(params.nameData, nationality, gender, params.rng);
  const age = 36 + Math.floor(params.rng() * 29);
  const careerStartAge = 24 + Math.floor(params.rng() * 13);
  const bornYear = params.currentYear - age;
  const careerStartYear = bornYear + careerStartAge;
  const ratingRoll = params.rng();
  const fallbackRating = baseRole(params.role) === 'Player Development Coach'
    ? Math.max(54, Math.min(88, 60 + Math.floor(ratingRoll * 29)))
    : Math.max(48, Math.min(88, 54 + Math.floor(ratingRoll * 31)));
  const rating = resolveEraAwareStaffRating(baseRole(params.role), params.currentYear, ratingRoll, fallbackRating);
  const yearsWithTeam = params.team
    ? params.freshLeague ? 0 : Math.max(1, Math.floor(params.rng() * 7) + 1)
    : 0;
  const contractYears = Math.max(1, Math.floor(params.rng() * 4) + 1);
  const teamName = params.team ? getTeamFullName(params.team) : undefined;
  const role = params.position ?? params.role;
  const isGeneralManager = baseRole(params.role) === 'GM';
  return {
    id: params.id,
    name,
    team: teamName,
    position: role,
    jobTitle: role,
    role: params.role,
    teamLogoUrl: params.team?.logoUrl,
    nationality,
    gender,
    bornYear,
    careerStartYear,
    yearsWithTeam,
    hiredYear: params.team ? params.currentYear - yearsWithTeam : undefined,
    roleStartYear: params.team ? params.currentYear - yearsWithTeam : undefined,
    contractYears,
    rating,
    reputation: rating,
    attributes: isGeneralManager ? generateGMAttributes(`${params.id}:${teamName ?? 'free-agent'}:${name}`) : undefined,
    salary: getStaffMarketSalary(undefined, baseRole(params.role), rating, {
      market: 'nba',
      yearsExperience: Math.max(1, params.currentYear - careerStartYear),
      yearsWithTeam,
    }),
    face: generateBasketballFace({ race, gender }),
    playerPortraitUrl: getRegenPortraitUrl(`${params.id}-${name}`, race, {
      nationality,
      gender,
      kind: 'staff',
      usedPortraitUrls: params.usedPortraitUrls,
    }) ?? undefined,
    staffImageId: undefined,
    leagueId: FICTIONAL_STAFF_LEAGUE_ID,
    source: 'fictional-generated-staff',
    isPlaceholder: !params.team,
  };
}

function tierForTeam(team: NBATeam): 'S' | 'A' | 'B' | 'C' | 'D' {
  const population = Number(team.pop ?? 0);
  if (population >= 8) return 'S';
  if (population >= 5) return 'A';
  if (population >= 3) return 'B';
  if (population >= 1.5) return 'C';
  return 'D';
}

export function generateFictionalStaffSetup(params: {
  teams: NBATeam[];
  nameData: NameData;
  currentYear: number;
  seed: number;
  gameMode: GameState['gameMode'];
  userTeamId?: number;
  historyMode?: FictionalHistoryMode;
  usedPortraitUrls?: Set<string>;
  genderMode?: FictionalStaffGenderMode;
}): FictionalStaffSetup {
  const rng = createRng(params.seed ^ 0x57aff);
  const usedPortraitUrls = params.usedPortraitUrls ?? createPortraitUsageSet();
  const owners: StaffMember[] = [];
  const gms: StaffMember[] = [];
  const coaches: StaffMember[] = [];
  const headCoachesByTid = new Map<number, StaffMember>();

  for (const team of params.teams) {
    const tid = teamId(team);
    owners.push(makeStaffMember({ id: `fictional-owner-${tid}`, role: 'Owner', position: 'Majority Owner', currentYear: params.currentYear, nameData: params.nameData, rng, team, freshLeague: params.historyMode === 'brand_new', usedPortraitUrls, genderMode: params.genderMode }));
    gms.push(makeStaffMember({ id: `fictional-gm-${tid}`, role: 'GM', position: 'General Manager', currentYear: params.currentYear, nameData: params.nameData, rng, team, freshLeague: params.historyMode === 'brand_new', usedPortraitUrls, genderMode: params.genderMode }));
    const coach = makeStaffMember({ id: `fictional-head-coach-${tid}`, role: 'Head Coach', currentYear: params.currentYear, nameData: params.nameData, rng, team, freshLeague: params.historyMode === 'brand_new', usedPortraitUrls, genderMode: params.genderMode });
    coaches.push(coach);
    headCoachesByTid.set(tid, coach);
  }

  const teams = params.teams.map(team => {
    const tid = teamId(team);
    const headCoach = headCoachesByTid.get(tid);
    const staffMembers = FICTIONAL_TEAM_STAFF_ROLES.flatMap((role, roleIndex) => {
      if (role === 'Head Coach') return headCoach ? [{ ...headCoach, role }] : [];
      return [makeStaffMember({
        id: `fictional-team-staff-${tid}-${roleIndex}`,
        role,
        currentYear: params.currentYear,
        nameData: params.nameData,
        rng,
        team,
        freshLeague: params.historyMode === 'brand_new',
        usedPortraitUrls,
        genderMode: params.genderMode,
      })];
    });
    return {
      ...team,
      tycoon: {
        ...(team.tycoon ?? {}),
        tier: team.tycoon?.tier ?? tierForTeam(team),
        staffMembers,
      },
    } as NBATeam;
  });

  const leagueOffice = LEAGUE_OFFICE_TITLES.map((title, index) => makeStaffMember({
    id: `fictional-league-office-${index}`,
    role: title,
    currentYear: params.currentYear,
    nameData: params.nameData,
    rng,
    usedPortraitUrls,
    genderMode: params.genderMode,
  }));
  const staffFreeAgents = generateFictionalStaffPool(params.nameData, params.currentYear, params.seed, 10, usedPortraitUrls, params.genderMode);
  const referees = generateFictionalReferees(params.nameData, 36, params.seed ^ 0x0fee, usedPortraitUrls, params.genderMode);

  return {
    teams,
    staff: { owners, gms, coaches, leagueOffice, referees },
    staffFreeAgents,
    referees,
  };
}

export function buildFictionalCoachAwardRows(
  teams: NBATeam[],
  coaches: StaffMember[],
  currentYear: number,
): HistoricalAward[] {
  const coachByTeam = new Map(coaches
    .filter(coach => coach.team)
    .map(coach => [coach.team!, coach]));
  const seasons = [...new Set(teams.flatMap(team => (team.seasons ?? [])
    .map(row => Number(row.season))
    .filter(season => Number.isFinite(season) && season > 0 && season < currentYear)))]
    .sort((left, right) => left - right);
  const wins = new Map<string, number>();
  const awards: HistoricalAward[] = [];
  let priorCoach = '';
  let streak = 0;

  for (const season of seasons) {
    const candidates = teams.flatMap(team => {
      const row = (team.seasons ?? []).find(entry => Number(entry.season) === season);
      const coach = coachByTeam.get(getTeamFullName(team));
      if (!row || !coach) return [];
      const games = Math.max(1, Number(row.won ?? 0) + Number(row.lost ?? 0));
      const prior = (team.seasons ?? []).find(entry => Number(entry.season) === season - 1);
      const priorGames = Math.max(1, Number(prior?.won ?? 0) + Number(prior?.lost ?? 0));
      const improvement = prior ? Number(row.won ?? 0) / games - Number(prior.won ?? 0) / priorGames : 0;
      const playoffBonus = Math.max(0, Number(row.playoffRoundsWon ?? -1)) * 0.035;
      return [{
        team,
        coach,
        score: Number(row.won ?? 0) / games + improvement * 0.55 + playoffBonus,
      }];
    }).sort((left, right) => right.score - left.score || left.team.id - right.team.id);
    const winner = candidates.find(candidate => {
      const count = wins.get(candidate.coach.name) ?? 0;
      const nextStreak = candidate.coach.name === priorCoach ? streak + 1 : 1;
      return count < 4 && nextStreak <= 3;
    }) ?? candidates[0];
    if (!winner) continue;
    streak = winner.coach.name === priorCoach ? streak + 1 : 1;
    priorCoach = winner.coach.name;
    wins.set(winner.coach.name, (wins.get(winner.coach.name) ?? 0) + 1);
    awards.push({
      season,
      type: 'COY',
      name: winner.coach.name,
      tid: winner.team.id,
      team: getTeamFullName(winner.team),
      uiMode: 'fictional',
      role: 'coach',
      coachName: winner.coach.name,
      coachId: winner.coach.id,
      source: 'fictional-native-history',
    });
  }
  return awards;
}

export function generateFictionalStaffPool(
  nameData: NameData,
  currentYear: number,
  seed: number,
  perRole = 10,
  usedPortraitUrls = createPortraitUsageSet(),
  genderMode: FictionalStaffGenderMode = 'male',
): StaffMember[] {
  const rng = createRng(seed ^ 0x5faff);
  return FICTIONAL_POOL_ROLES.flatMap((role, roleIndex) =>
    Array.from({ length: perRole }, (_, index) => {
      const member = makeStaffMember({
        id: `fictional-staff-fa-${roleIndex}-${index}-${seed}`,
        role,
        currentYear,
        nameData,
        rng,
        usedPortraitUrls,
        genderMode,
      });
      return {
        ...member,
        position: role,
        jobTitle: role,
        role,
        team: '',
        teamLogoUrl: undefined,
        formerRole: role,
        formerTeam: '',
        isPlaceholder: true,
      };
    }),
  );
}

const PLAYER_PORTRAIT_URL_MARKERS = [
  '/nba-commish-portraits@',
  '/ng-regens-mainpack/',
  '/ng-regens-black/',
  '/ng-regens-afroamerican/',
  '/ng-regens-asia/',
  '/ng-regens-brown/',
  '/ng-regens-filipino/',
  '/ng-regens-wf/',
  '/playerfaces_regen_replacements/',
] as const;

function shouldReplaceGeneratedStaffPortrait(member: StaffMember): boolean {
  const id = String(member.id ?? '');
  const source = String(member.source ?? '');
  const isGenerated = id.startsWith('fictional-') || source.startsWith('fictional-generated-staff');
  if (!isGenerated || !member.playerPortraitUrl) return false;
  return PLAYER_PORTRAIT_URL_MARKERS.some(marker => member.playerPortraitUrl?.includes(marker));
}

function hydrateMember(existing: StaffMember, fallback: StaffMember): StaffMember {
  const playerPortraitUrl = shouldReplaceGeneratedStaffPortrait(existing)
    ? fallback.playerPortraitUrl
    : existing.playerPortraitUrl ?? fallback.playerPortraitUrl;
  return {
    ...fallback,
    ...existing,
    id: existing.id ?? fallback.id,
    face: existing.face ?? fallback.face,
    playerPortraitUrl,
    staffImageId: undefined,
    leagueId: FICTIONAL_STAFF_LEAGUE_ID,
    source: existing.source ?? 'fictional-generated-staff',
  };
}

function hydrateStaffList(existing: StaffMember[] | undefined, fallback: StaffMember[]): StaffMember[] {
  return fallback.map((generated, index) => {
    const current = existing?.find(member => member.team && member.team === generated.team)
      ?? existing?.find(member => member.id && member.id === generated.id)
      ?? existing?.[index];
    return current ? hydrateMember(current, generated) : generated;
  });
}

function existingFictionalStaffPortraits(state: GameState): Set<string> {
  const staffMembers = [
    ...(state.staff?.owners ?? []),
    ...(state.staff?.gms ?? []),
    ...(state.staff?.coaches ?? []),
    ...(state.staff?.leagueOffice ?? []),
    ...(state.staffFreeAgents ?? []),
    ...(state.teams ?? []).flatMap(team => team.tycoon?.staffMembers ?? []),
  ];
  const refereeUrls = (state.staff?.referees ?? []).map(referee => (referee as RefereeData).photo_url);
  return createPortraitUsageSet([
    ...(state.players ?? []).map(player => player.imgURL),
    ...staffMembers.map(member => member.playerPortraitUrl),
    ...refereeUrls,
  ]);
}

export function healFictionalStaffState(state: GameState, nameData: NameData): GameState {
  if (state.leagueType !== 'fictional') return state;
  const currentVersion = Number((state.leagueStats as unknown as Record<string, unknown> | undefined)?.fictionalStaffSeedVersion ?? 0);
  if (currentVersion >= FICTIONAL_STAFF_SEED_VERSION) return state;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const seed = hashSeed(`${getSimulationSeed(state)}-${currentYear}`);
  const generated = generateFictionalStaffSetup({
    teams: state.teams ?? [],
    nameData,
    currentYear,
    seed,
    gameMode: state.gameMode,
    userTeamId: state.userTeamId,
    historyMode: state.leagueStats.fictionalHistoryMode,
    usedPortraitUrls: existingFictionalStaffPortraits(state),
    genderMode: state.leagueStats.fictionalPlayerPool === 'womens'
      ? 'female'
      : state.leagueStats.fictionalPlayerPool === 'mixed'
        ? 'mixed'
        : 'male',
  });
  const existingTeams = new Map((state.teams ?? []).map(team => [teamId(team, -1), team]));
  const teams = generated.teams.map(generatedTeam => {
    const tid = teamId(generatedTeam, -1);
    const existingTeam = existingTeams.get(tid) ?? generatedTeam;
    const generatedMembers = generatedTeam.tycoon?.staffMembers ?? [];
    const existingMembers = existingTeam.tycoon?.staffMembers ?? [];
    const membersByRole = new Map(generatedMembers.map(member => [member.role, member]));
    const hydratedExisting = existingMembers.map(member => {
      const fallback = membersByRole.get(member.role) ?? generatedMembers[0];
      return fallback ? hydrateMember(member, fallback) : member;
    });
    const existingRoles = new Set(hydratedExisting.map(member => member.role));
    const isUserTeam = state.gameMode === 'gm' && tid === state.userTeamId;
    const additions = generatedMembers.filter(member => {
      if (existingRoles.has(member.role)) return false;
      return !isUserTeam || member.role === 'Head Coach';
    });
    return {
      ...generatedTeam,
      ...existingTeam,
      tycoon: {
        ...(generatedTeam.tycoon ?? {}),
        ...(existingTeam.tycoon ?? {}),
        staffMembers: [...hydratedExisting, ...additions],
      },
    } as NBATeam;
  });
  const existingPool = state.staffFreeAgents ?? [];
  const otherLeaguePool = existingPool.filter(member => member.leagueId && member.leagueId !== FICTIONAL_STAFF_LEAGUE_ID);
  const fictionalPool = existingPool
    .filter(member => !member.leagueId || member.leagueId === FICTIONAL_STAFF_LEAGUE_ID)
    .map((member, index) => hydrateMember(member, generated.staffFreeAgents[index % generated.staffFreeAgents.length]));
  const poolCounts = new Map<string, number>();
  for (const member of fictionalPool) {
    const role = baseRole(member.position ?? member.jobTitle ?? member.role ?? '');
    poolCounts.set(role, (poolCounts.get(role) ?? 0) + 1);
  }
  const poolAdditions = generated.staffFreeAgents.filter(member => {
    const role = baseRole(member.position ?? member.jobTitle ?? member.role ?? '');
    const count = poolCounts.get(role) ?? 0;
    if (count >= 10) return false;
    poolCounts.set(role, count + 1);
    return true;
  });
  const existingStaff = state.staff;
  const staff: StaffData = {
    owners: hydrateStaffList(existingStaff?.owners, generated.staff.owners),
    gms: hydrateStaffList(existingStaff?.gms, generated.staff.gms),
    coaches: hydrateStaffList(existingStaff?.coaches, generated.staff.coaches),
    leagueOffice: hydrateStaffList(existingStaff?.leagueOffice, generated.staff.leagueOffice),
    referees: existingStaff?.referees?.length ? existingStaff.referees : generated.referees,
  };
  return {
    ...state,
    teams,
    staff,
    staffFreeAgents: [...otherLeaguePool, ...fictionalPool, ...poolAdditions],
    leagueStats: {
      ...state.leagueStats,
      staffPoolSeeded: true,
      fictionalStaffSeedVersion: FICTIONAL_STAFF_SEED_VERSION,
    },
  } as GameState;
}

export function generateFictionalStaff(teams: NBATeam[], nameData: NameData, currentYear = new Date().getFullYear(), seed = Date.now()): StaffData {
  return generateFictionalStaffSetup({ teams, nameData, currentYear, seed, gameMode: 'commissioner' }).staff;
}

export function generateFictionalReferees(
  nameData: NameData,
  count = 36,
  seed = Date.now(),
  usedPortraitUrls = createPortraitUsageSet(),
  genderMode: FictionalStaffGenderMode = 'male',
): RefereeData[] {
  const rng = createRng(seed ^ 0x0ff1ce);
  return Array.from({ length: count }, (_, index) => {
    const nationality = pickNationality(rng);
    const race = pickRace(nationality, rng);
    const gender = genderMode === 'female' ? 'female' : genderMode === 'mixed' && rng() < 0.5 ? 'female' : 'male';
    const name = pickGenderedName(nameData, nationality, gender, rng);
    return {
      id: String(1000 + index),
      name,
      slug: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''),
      photo_url: getRegenPortraitUrl(`fictional-referee-${seed}-${index}-${name}`, race, {
        nationality,
        gender,
        kind: 'staff',
        usedPortraitUrls,
      }) ?? undefined,
    };
  });
}
