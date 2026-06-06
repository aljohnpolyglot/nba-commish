/**
 * One-shot seeding of every NBA team's `tycoon.staffMembers` from the real
 * nba2kcoachlist + nbacoachescontract gists. After this runs, opening Staff in
 * NBA GM mode shows the actual coaching staff for that team (Spoelstra in
 * Miami, Kerr in Golden State, Doc Rivers in Milwaukee, etc.) instead of
 * empty role slots.
 *
 * Requires `fetchCoachData()` (services/staffService) to have completed first
 * — caller is responsible for awaiting that promise before invoking us.
 */

import type { GameState, NBATeam, StaffMember } from '../../types';
import { getCoachContractSnapshot, getCoachRatings, getStaffCareerSnapshot, getTeamStaff, type NBA2KCoachData } from '../staffService';
import { deterministicStaffImageId } from '../../utils/staffPortrait';
import { getTeamFullName } from '../../utils/teamNames';
import { getStaffMarketSalary } from '../tycoon/economyScale';
import { toStaffFreeAgent } from '../euro/staffPool';
import { evaluateStaffRetirement, staffRetirementHistory, type StaffRetirementRecord } from './staffRetirement';
import type { TycoonTier } from '../../types/tycoon';

const norm = (s: string | undefined | null) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const SUPPORT_ROLES = [
  'Head of Sports Science',
  'Head Physio',
  'Player Development Coach',
  'Chief Scout',
  'Head of Analytics',
] as const;
const NBA_STAFF_ROLES = [
  'Head Coach',
  'Assistant Coach',
  'Assistant Coach 2',
  'Assistant Coach 3',
  ...SUPPORT_ROLES,
] as const;
const ELITE_ORG_ABBREVS = new Set(['SAS', 'MIA', 'GSW']);
const CURRENT_HEAD_COACH_OVERRIDES: Record<string, Partial<NBA2KCoachData> & Pick<NBA2KCoachData, 'name' | 'team' | 'position'>> = {
  'San Antonio Spurs': {
    name: 'Mitch Johnson',
    team: 'San Antonio Spurs',
    position: 'Head Coach',
    league: 'NBA',
    nationality: 'American',
    born: 'Unknown',
    age: '',
    image: '',
    url: '',
  },
};

const FIRST_NAMES = [
  'Aaron', 'Adrian', 'Andre', 'Brandon', 'Brian', 'Calvin', 'Charles', 'Chris',
  'Damon', 'Derek', 'Elliot', 'Garrett', 'Isaiah', 'Jason', 'Marcus', 'Nate',
  'Quentin', 'Ryan', 'Sean', 'Terrence', 'Victor', 'Wesley',
];

const LAST_NAMES = [
  'Anderson', 'Bennett', 'Brooks', 'Coleman', 'Dawson', 'Ellis', 'Foster',
  'Graves', 'Harris', 'Jefferson', 'Lawson', 'Mitchell', 'Parker', 'Pierce',
  'Reed', 'Simmons', 'Stewart', 'Turner', 'Wallace', 'Watkins', 'Williams',
];

const DEFAULT_NBA_STAFF_NATIONALITY = 'American';

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

function marketTierForTeam(team: NBATeam): TycoonTier {
  const pop = Number.isFinite(team.pop ?? NaN) ? team.pop! : 1.5;
  if (pop >= 8) return 'S';
  if (pop >= 4) return 'A';
  if (pop >= 2) return 'B';
  if (pop >= 1) return 'C';
  return 'D';
}

function generatedRatingForRole(role: string, tier: TycoonTier, seed: number): number {
  const baseRole = role.replace(/ \d+$/, '');
  const roleBase: Record<string, number> = {
    'Head Coach': 89,
    'Assistant Coach': 83,
    'Head of Sports Science': 72,
    'Head Physio': 74,
    'Player Development Coach': 73,
    'Chief Scout': 73,
    'Head of Analytics': 73,
  };
  const tierOffset: Record<TycoonTier, number> = { S: 2, A: 0, B: -3, C: -6, D: -9 };
  const variance = (seed % 7) - 3;
  const base = roleBase[baseRole] ?? 70;
  return Math.max(52, Math.min(94, base + tierOffset[tier] + variance));
}

function contractYearsForRole(role: string, seed: number): number {
  if (role === 'Head Coach') return 3 + (seed % 3);
  return 2 + (seed % 3);
}

function seededCareer(seed: number, currentYear: number, hiredYear: number) {
  const yearsWithTeam = Math.max(0, currentYear - hiredYear);
  const yearsExperience = yearsWithTeam + 4 + (seed % 16);
  const bornYear = currentYear - (30 + (seed % 24));
  const careerStartYear = currentYear - yearsExperience;
  return { yearsWithTeam, yearsExperience, bornYear, careerStartYear };
}

function pickSupportName(seed: number): string {
  const first = FIRST_NAMES[seed % FIRST_NAMES.length];
  const last = LAST_NAMES[(seed >>> 5) % LAST_NAMES.length];
  return `${first} ${last}`;
}

/** Resolve the team name format used in nba2kcoachlist. Source uses full names
 *  like "Miami Heat", "Golden State Warriors" — our state.teams can carry
 *  region + name split, so we try both join patterns and a direct match. */
function teamMatchKeys(team: NBATeam): string[] {
  const name = team.name ?? '';
  const fullName = getTeamFullName(team);
  const out = new Set<string>();
  out.add(name);
  out.add(fullName);
  if (team.region) out.add(team.region);
  return [...out].filter(Boolean);
}

function isHC(position: string) {
  const p = norm(position);
  return p === 'head coach'
    || p === 'interim head coach'
    || p === 'associate head coach'
    || p === 'assoicate head coach'      // typo present in source
    || p === 'presidenthead coach';
}

function isLeadAC(position: string) {
  const p = norm(position);
  return p === 'lead assistant coach';
}

function isAC(position: string) {
  const p = norm(position).replace(/\s+/g, ' ');
  return p === 'assistant coach' || p === 'assistant  coach';   // tolerate double space
}

/** Pick the most authoritative HC for a team. "Head Coach" beats "Interim",
 *  "Associate" only used as last resort. */
function pickHeadCoach(candidates: NBA2KCoachData[]): NBA2KCoachData | undefined {
  const tiers: Array<(p: string) => boolean> = [
    p => norm(p) === 'head coach',
    p => norm(p) === 'interim head coach',
    p => norm(p) === 'presidenthead coach',
    p => norm(p) === 'associate head coach' || norm(p) === 'assoicate head coach',
  ];
  for (const tier of tiers) {
    const hit = candidates.find(c => tier(c.position));
    if (hit) return hit;
  }
  return undefined;
}

function buildStaffMember(
  raw: NBA2KCoachData,
  role: string,
  hiredYear: number,
  contractYears: number,
  currentYear: number,
): StaffMember {
  const ratingEntry = getCoachRatings(raw.name);
  const seed = hashSeed(`${raw.team ?? ''}-${raw.name}-${role}`);
  const rating = ratingEntry ? Math.round(
    Object.values(ratingEntry.attributes).reduce((a, b) => a + b, 0) / 15
  ) : generatedRatingForRole(role, 'A', seed);
  const career = getStaffCareerSnapshot(raw as any, currentYear);
  const contract = getCoachContractSnapshot(raw.name, currentYear);
  return {
    id: `nba-real-staff-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${raw.name.replace(/[^a-zA-Z0-9]+/g, '-')}`,
    role,
    name: raw.name,
    nationality: raw.nationality ?? DEFAULT_NBA_STAFF_NATIONALITY,
    salary: getStaffMarketSalary(undefined, role, rating, {
      externalSalary: contract?.annualSalary ?? null,
      yearsExperience: career.yearsExperience,
      yearsWithTeam: career.yearsWithTeam,
    }),
    contractYears,
    rating,
    hiredYear,
    yearsWithTeam: career.yearsWithTeam,
    bornYear: career.bornYear ?? undefined,
    careerStartYear: career.careerStartYear ?? undefined,
    signingBonus: 0,
    face: undefined,
    staffImageId: deterministicStaffImageId(raw.name),
    playerPortraitUrl: raw.image ?? undefined,
    position: raw.position,
    attributeSeed: seed,
    attributeProfile: 'nba',
  } as any;
}

/** Build the full staffMembers list for one NBA team from the real coach list. */
export function buildRealStaffForTeam(team: NBATeam, currentYear: number): StaffMember[] {
  // Defer the import so a unit-test environment doesn't blow up on the gist fetch.
  // `getTeamStaff` would also work but doing the filter inline lets us share
  // the candidate array between HC + AC resolution.
  const all = teamMatchKeys(team)
    .flatMap(key => ((globalThis as any).__nba2kCoachList?.filter?.((c: NBA2KCoachData) => c.team === key) ?? getTeamStaff(key)));
  if (all.length === 0) return [];

  const out: StaffMember[] = [];
  const override = CURRENT_HEAD_COACH_OVERRIDES[getTeamFullName(team)];
  const hc = override ? override as NBA2KCoachData : pickHeadCoach(all);
  if (hc) {
    const contract = getCoachContractSnapshot(hc.name, currentYear);
    const remainingYears = contract?.yearsLeft ?? 3;
    out.push(buildStaffMember(hc, 'Head Coach', currentYear - 1, remainingYears, currentYear));
  }

  // Lead AC first, then regular ACs, up to 3 slots total.
  const acs = [
    ...all.filter(c => isLeadAC(c.position)),
    ...all.filter(c => isAC(c.position)),
  ];
  const acSlots = ['Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'];
  for (let i = 0; i < Math.min(acs.length, acSlots.length); i++) {
    const contract = getCoachContractSnapshot(acs[i].name, currentYear);
    out.push(buildStaffMember(acs[i], acSlots[i], currentYear - 1, contract?.yearsLeft ?? (2 + (i % 2)), currentYear));
  }

  return out;
}

function buildSupportStaffForTeam(team: NBATeam, currentYear: number): StaffMember[] {
  const tier = marketTierForTeam(team);
  const teamId = team.id ?? (team as any).tid ?? 0;
  const teamName = getTeamFullName(team);
  return SUPPORT_ROLES.map((role, index) => {
    const seed = hashSeed(`${teamId}-${teamName}-${role}`);
    const rating = generatedRatingForRole(role, tier, seed);
    const name = pickSupportName(seed + index * 101);
    const hiredYear = currentYear - 1;
    const career = seededCareer(seed, currentYear, hiredYear);
    return {
      id: `nba-ai-staff-${teamId}-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      role,
      name,
      team: teamName,
      position: role,
      jobTitle: role,
      nationality: DEFAULT_NBA_STAFF_NATIONALITY,
      salary: getStaffMarketSalary(tier, role, rating, {
        yearsExperience: career.yearsExperience,
        yearsWithTeam: career.yearsWithTeam,
      }),
      contractYears: 2 + (seed % 3),
      rating,
      hiredYear,
      yearsWithTeam: career.yearsWithTeam,
      bornYear: career.bornYear,
      careerStartYear: career.careerStartYear,
      signingBonus: 0,
      staffImageId: deterministicStaffImageId(name),
      isPlaceholder: true,
      attributeSeed: seed,
      attributeProfile: 'nba',
    } as any;
  });
}

export function buildGeneratedNBAStaffForRole(team: NBATeam, role: string, currentYear: number, salt = ''): StaffMember {
  const tier = marketTierForTeam(team);
  const teamId = team.id ?? (team as any).tid ?? 0;
  const teamName = getTeamFullName(team);
  const seed = hashSeed(`${teamId}-${teamName}-${role}-${currentYear}-${salt}`);
  const rating = generatedRatingForRole(role, tier, seed);
  const name = pickSupportName(seed);
  const career = seededCareer(seed, currentYear, currentYear);
  return {
    id: `nba-ai-staff-${teamId}-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${currentYear}-${seed}`,
    role,
    name,
    team: teamName,
    position: role,
    jobTitle: role,
    nationality: DEFAULT_NBA_STAFF_NATIONALITY,
    salary: getStaffMarketSalary(tier, role, rating, {
      yearsExperience: career.yearsExperience,
      yearsWithTeam: career.yearsWithTeam,
    }),
    contractYears: contractYearsForRole(role, seed),
    rating,
    hiredYear: currentYear,
    yearsWithTeam: career.yearsWithTeam,
    bornYear: career.bornYear,
    careerStartYear: career.careerStartYear,
    signingBonus: 0,
    staffImageId: deterministicStaffImageId(name),
    isPlaceholder: true,
    attributeSeed: seed,
    attributeProfile: 'nba',
  } as any;
}

/** Seed missing staffMembers into NBA teams. Idempotent — preserves existing
 *  hires/fired roles and only fills roles that are still absent. */
export function seedRealNBAStaffForAllTeams(
  teams: NBATeam[],
  coachList: NBA2KCoachData[] | undefined,
  currentYear: number,
  opts: { excludeTeamId?: number | null; fillSupportRoles?: boolean } = {},
): { teams: NBATeam[]; seededCount: number; filledRoleCount: number } {
  // Stash the source list on globalThis so buildRealStaffForTeam can read it
  // without forcing a re-import — keeps the helper signature simple.
  if (coachList) (globalThis as any).__nba2kCoachList = coachList;
  let seeded = 0;
  let filledRoles = 0;
  const updated = teams.map(team => {
    if (opts.excludeTeamId != null && team.id === opts.excludeTeamId) return team;
    const tycoon = (team as any).tycoon ?? null;
    const existing: StaffMember[] = tycoon?.staffMembers ?? [];
    const firedRoles: string[] = tycoon?.firedStaffRoles ?? [];
    const seededMembers = [
      ...buildRealStaffForTeam(team, currentYear),
      ...(opts.fillSupportRoles ? buildSupportStaffForTeam(team, currentYear) : []),
    ];
    const existingRoles = new Set(existing.map(member => (member as any).role));
    const additions = seededMembers.filter(member =>
      !existingRoles.has((member as any).role) && !firedRoles.includes((member as any).role)
    );
    if (additions.length === 0) return team;
    seeded++;
    filledRoles += additions.length;
    return {
      ...team,
      tycoon: {
        ...(tycoon ?? {}),
        tier: tycoon?.tier ?? marketTierForTeam(team),
        staffMembers: [...existing, ...additions],
        firedStaffRoles: tycoon?.firedStaffRoles ?? [],
        cashOnHand: tycoon?.cashOnHand ?? 0,
      },
    } as NBATeam;
  });
  return { teams: updated, seededCount: seeded, filledRoleCount: filledRoles };
}

function staffSeed(member: any, team: NBATeam, year: number): number {
  return hashSeed(`${team.id}-${member?.id ?? ''}-${member?.name ?? ''}-${member?.role ?? ''}-${year}`);
}

function shouldAIExtendStaff(member: any, team: NBATeam, currentYear: number): boolean {
  const seed = staffSeed(member, team, currentYear);
  const tier = marketTierForTeam(team);
  const baseRole = baseStaffRole(member?.role ?? member?.position ?? member?.jobTitle);
  const rating = member?.rating ?? member?.reputation ?? 66;
  const yearsWithTeam = Math.max(0, Number(member?.yearsWithTeam ?? 0));
  const tierBonus: Record<TycoonTier, number> = { S: 16, A: 10, B: 5, C: 0, D: -4 };
  const wins = Number((team as any).wins ?? 0);
  const losses = Number((team as any).losses ?? 0);
  const games = Math.max(1, wins + losses);
  const winPct = wins / games;
  const playoffRoundsWon = Math.max(0, Number((team as any).playoffRoundsWon ?? 0));
  const madeFinals = playoffRoundsWon >= 3;
  const wonTitle = playoffRoundsWon >= 4;
  const regularSeasonBonus = (winPct - 0.5) * 20; // roughly -10..+10
  const playoffBonus = playoffRoundsWon * 6;      // 0..24
  const headCoachSuccessBonus = baseRole === 'Head Coach'
    ? (madeFinals ? 30 : 0) + (wonTitle ? 10 : 0)
    : 0;
  // Long-tenure continuity: protects legacy HCs (Spo/Kerr archetype),
  // while non-elite/short-tenure staff remain churn-prone.
  const tenureContinuityBonus = (() => {
    if (yearsWithTeam < 6) return 0;
    if (baseRole !== 'Head Coach') return Math.min(10, (yearsWithTeam - 5) * 2);
    if (rating >= 82) return Math.min(35, 12 + (yearsWithTeam - 6) * 3);
    return Math.min(14, (yearsWithTeam - 5) * 2);
  })();
  const chance = Math.max(
    28,
    Math.min(
      98,
      48 + (rating - 68) * 2 + tierBonus[tier] + regularSeasonBonus + playoffBonus + headCoachSuccessBonus + tenureContinuityBonus,
    ),
  );
  return (seed % 100) < chance;
}

function staffHistory(text: string, date: string, tid: number) {
  return { text, date, type: 'Personnel' as const, tid };
}

function baseStaffRole(role: string | undefined | null): string {
  return (role ?? '').replace(/ \d+$/, '');
}

function displayStaffRole(role: string | undefined | null): string {
  const base = baseStaffRole(role);
  return base || String(role ?? 'Staff');
}

function candidateBaseRole(member: StaffMember): string {
  return baseStaffRole(member.role ?? member.position ?? member.jobTitle);
}

function candidateScore(member: StaffMember): number {
  const rating = Number((member as any).rating ?? member.reputation ?? 0);
  return rating + (member.reputation ?? rating) * 0.35 + (member.staffJoinChance ?? 0) * 0.2;
}

type HeadCoachProgressionProfile = {
  ceiling: number;
  growthRate: number;
  volatility: number;
};

function seededUnit(seed: string): number {
  return hashSeed(seed) / 0xffffffff;
}

function ensureCoachingProgressionProfile(member: any): HeadCoachProgressionProfile {
  const existing = member?.coachingProgressionProfile as HeadCoachProgressionProfile | undefined;
  if (existing && Number.isFinite(existing.ceiling) && Number.isFinite(existing.growthRate) && Number.isFinite(existing.volatility)) {
    return existing;
  }
  const key = `${member?.id ?? ''}|${member?.name ?? ''}|coaching-profile`;
  const r1 = seededUnit(`${key}|r1`);
  const r2 = seededUnit(`${key}|r2`);
  const r3 = seededUnit(`${key}|r3`);
  return {
    // Some are destined (higher ceiling), some plateau earlier.
    ceiling: Math.round(74 + r1 * 22),      // 74..96
    growthRate: 0.7 + r2 * 0.8,             // 0.7..1.5
    volatility: 0.15 + r3 * 0.85,           // 0.15..1.0
  };
}

function computeTeamSuccessPoints(team: NBATeam): number {
  const wins = Number((team as any).wins ?? 0);
  const losses = Number((team as any).losses ?? 0);
  const games = Math.max(1, wins + losses);
  const winPct = wins / games;
  // Neutral around .500; contending seasons gain, tanking seasons lose.
  const regularSeason = (winPct - 0.5) * 8; // approx -4..+4
  const playoffRoundsWon = Number((team as any).playoffRoundsWon ?? 0);
  const playoffSuccess = Math.max(0, playoffRoundsWon) * 0.9;
  const championshipBonus = playoffRoundsWon >= 4 ? 2.0 : 0;
  return regularSeason + playoffSuccess + championshipBonus;
}

function organizationBonus(team: NBATeam): number {
  const abbr = String((team as any).abbrev ?? '').toUpperCase();
  return ELITE_ORG_ABBREVS.has(abbr) ? 1.25 : 0;
}

function isMainCoachingTrackRole(role: string): boolean {
  const base = baseStaffRole(role);
  return base === 'Head Coach' || base === 'Assistant Coach' || base === 'Player Development Coach';
}

function progressMainCoachingStaff(member: any, role: string, team: NBATeam, currentYear: number, headCoachRating: number): any {
  const profile = ensureCoachingProgressionProfile(member);
  const baseRole = baseStaffRole(role);
  const currentRating = Number(member?.rating ?? member?.reputation ?? 66);
  const success = computeTeamSuccessPoints(team);
  // Mentorship: assistants/dev coaches learn from HC quality. HC self-term is
  // smaller and acts as continuity/culture carry-over.
  const mentorship = baseRole === 'Head Coach'
    ? Math.max(0, (currentRating - 76) * 0.05)
    : Math.max(0, (headCoachRating - 72) * 0.11);
  const org = organizationBonus(team);
  const noise = (seededUnit(`${member?.id ?? member?.name}|coach-prog|${currentYear}`) - 0.5) * 2 * profile.volatility;
  const growthRaw = (success + mentorship + org) * profile.growthRate + noise;
  const delta = Math.round(Math.max(-3, Math.min(6, growthRaw)));
  const nextRating = Math.max(50, Math.min(profile.ceiling, currentRating + delta));
  return {
    ...member,
    rating: nextRating,
    reputation: Math.max(Number(member?.reputation ?? currentRating), nextRating),
    coachingProgressionProfile: profile,
    coachingLastProgressionDelta: delta,
    coachingLastProgressionYear: currentYear,
  };
}

function canFillRole(member: StaffMember, openRole: string): boolean {
  const target = baseStaffRole(openRole);
  const source = candidateBaseRole(member);
  const rating = Number((member as any).rating ?? member.reputation ?? 0);
  if (target === 'Head Coach') return source === 'Head Coach' || rating >= 84;
  if (target === 'Assistant Coach') return source === 'Assistant Coach' || source === 'Head Coach' || source === 'Player Development Coach';
  if (target === 'Player Development Coach') return source === 'Player Development Coach' || source === 'Assistant Coach';
  return source === target;
}

function hireFromStaffPool(
  team: NBATeam,
  role: string,
  currentYear: number,
  staffFreeAgents: StaffMember[],
  consumedFreeAgentIds: Set<string>,
  unavailableNames: Set<string> = new Set(),
): StaffMember | null {
  const pool = staffFreeAgents
    .filter(member => !member.id || !consumedFreeAgentIds.has(member.id))
    .filter(member => !unavailableNames.has(norm(member.name)))
    .filter(member => !member.leagueId || member.leagueId === 'nba')
    .filter(member => canFillRole(member, role))
    .sort((a, b) => candidateScore(b) - candidateScore(a));
  const candidate = pool[0];
  if (!candidate) return null;
  if (candidate.id) consumedFreeAgentIds.add(candidate.id);
  unavailableNames.add(norm(candidate.name));
  const teamName = getTeamFullName(team);
  const seed = staffSeed(candidate, team, currentYear);
  const rating = Number((candidate as any).rating ?? candidate.reputation ?? generatedRatingForRole(role, marketTierForTeam(team), seed));
  const years = Math.max(1, Math.round(candidate.contractYears ?? contractYearsForRole(role, seed)));
  return {
    ...candidate,
    role,
    position: role,
    jobTitle: role,
    team: teamName,
    teamLogoUrl: team.logoUrl,
    leagueId: 'nba',
    contractYears: years,
    hiredYear: currentYear,
    yearsWithTeam: 0,
    rating,
    reputation: candidate.reputation ?? rating,
    salary: getStaffMarketSalary((team as any).tycoon?.tier ?? marketTierForTeam(team), role, rating, {
      yearsExperience: Math.max(1, currentYear - (candidate.careerStartYear ?? currentYear)),
      yearsWithTeam: 0,
    }),
    isPlaceholder: false,
  } as StaffMember;
}

function activeStaffNameSet(teams: NBATeam[]): Set<string> {
  const names = new Set<string>();
  for (const team of teams) {
    for (const member of ((team as any).tycoon?.staffMembers ?? []) as any[]) {
      const key = norm(member?.name);
      if (key) names.add(key);
    }
  }
  return names;
}

function fillAIStaffVacancies(
  teams: NBATeam[],
  currentYear: number,
  date: string,
  userTeamId: number | null | undefined,
  staffFreeAgents: StaffMember[],
): {
  teams: NBATeam[];
  historyEntries: Array<{ text: string; date: string; type: 'Personnel'; tid: number }>;
  consumedFreeAgentIds: string[];
} {
  const historyEntries: Array<{ text: string; date: string; type: 'Personnel'; tid: number }> = [];
  const consumedFreeAgentIds = new Set<string>();
  const unavailableNames = activeStaffNameSet(teams);

  const teamsOut = teams.map(team => {
    if (team.id == null || team.id < 0 || team.id >= 100) return team;
    if (userTeamId != null && team.id === userTeamId) return team;
    const tycoon = (team as any).tycoon;
    if (!tycoon) return team;

    const teamName = getTeamFullName(team);
    const nextStaff: any[] = [...(tycoon.staffMembers ?? [])];
    const occupied = new Set(nextStaff.map(member => member?.role ?? member?.position ?? member?.jobTitle).filter(Boolean));

    for (const role of NBA_STAFF_ROLES) {
      if (occupied.has(role)) continue;
      const hire = hireFromStaffPool(team, role, currentYear, staffFreeAgents, consumedFreeAgentIds, unavailableNames)
        ?? buildGeneratedNBAStaffForRole(team, role, currentYear, `staff-hiring-${historyEntries.length}`);
      nextStaff.push(hire);
      occupied.add(role);
      historyEntries.push(staffHistory(`${teamName} hired ${hire.name} as ${displayStaffRole(role)}.`, date, team.id));
    }

    return {
      ...team,
      tycoon: {
        ...tycoon,
        tier: tycoon.tier ?? marketTierForTeam(team),
        staffMembers: nextStaff,
      },
    } as NBATeam;
  });

  return { teams: teamsOut, historyEntries, consumedFreeAgentIds: Array.from(consumedFreeAgentIds) };
}

export function processNBAStaffHiringVacancies(
  teams: NBATeam[],
  currentYear: number,
  date: string,
  userTeamId?: number | null,
  staffFreeAgents: StaffMember[] = [],
) {
  return fillAIStaffVacancies(teams, currentYear, date, userTeamId, staffFreeAgents);
}

export function processNBAStaffLifecycle(
  teams: NBATeam[],
  currentYear: number,
  date: string,
  userTeamId?: number | null,
  staffFreeAgents: StaffMember[] = [],
): {
  teams: NBATeam[];
  historyEntries: Array<{ text: string; date: string; type: 'Personnel'; tid: number }>;
  freeAgents: StaffMember[];
  consumedFreeAgentIds: string[];
  retirementRecords: StaffRetirementRecord[];
} {
  const historyEntries: Array<{ text: string; date: string; type: 'Personnel'; tid: number }> = [];
  const freeAgents: StaffMember[] = [];
  const consumedFreeAgentIds = new Set<string>();
  const retirementRecords: StaffRetirementRecord[] = [];
  const unavailableNames = activeStaffNameSet(teams);
  const aiCanUseStaffMarket = (() => {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return true;
    const month = parsed.getUTCMonth() + 1;
    const day = parsed.getUTCDate();
    return month > 9 || (month === 9 && day >= 5);
  })();
  const teamsOut = teams.map(team => {
    if (team.id == null || team.id < 0 || team.id >= 100) return team;
    const tycoon = (team as any).tycoon;
    if (!tycoon?.staffMembers?.length) return team;
    const teamName = getTeamFullName(team);
    const isUserTeam = userTeamId != null && team.id === userTeamId;
    const nextStaff: any[] = [];
    const occupied = new Set<string>();
    const headCoachMember = (tycoon.staffMembers as any[]).find(member => baseStaffRole(member?.role ?? member?.position ?? member?.jobTitle) === 'Head Coach');
    const headCoachRating = Number(headCoachMember?.rating ?? headCoachMember?.reputation ?? 68);

    for (const member of tycoon.staffMembers as any[]) {
      const role = member.role ?? member.position ?? member.jobTitle;
      if (!role) continue;
      const memberForYear = isMainCoachingTrackRole(role)
        ? progressMainCoachingStaff(member, role, team, currentYear, headCoachRating)
        : member;
      const retirement = evaluateStaffRetirement({ member, team, currentYear, date });
      if (retirement) {
        retirementRecords.push(retirement);
        historyEntries.push(staffRetirementHistory(retirement) as { text: string; date: string; type: 'Personnel'; tid: number });
        continue;
      }

      const remainingYears = Math.max(0, Math.round(memberForYear.contractYears ?? 1) - 1);
      if (remainingYears > 0) {
        nextStaff.push({ ...memberForYear, contractYears: remainingYears });
        occupied.add(role);
        continue;
      }

      if (!isUserTeam && shouldAIExtendStaff(memberForYear, team, currentYear)) {
        const seed = staffSeed(memberForYear, team, currentYear);
        const years = contractYearsForRole(role, seed);
        const rating = memberForYear.rating ?? memberForYear.reputation ?? generatedRatingForRole(role, marketTierForTeam(team), seed);
        const career = getStaffCareerSnapshot(memberForYear, currentYear);
        const extended = {
          ...memberForYear,
          contractYears: years,
          salary: getStaffMarketSalary(tycoon.tier ?? marketTierForTeam(team), role, rating, {
            yearsExperience: Math.max(1, career.yearsExperience),
            yearsWithTeam: career.yearsWithTeam + 1,
          }),
          rating,
        };
        nextStaff.push(extended);
        occupied.add(role);
        historyEntries.push(staffHistory(`${member.name} signed a ${years}-year extension with the ${teamName} as ${displayStaffRole(role)}.`, date, team.id));
      } else {
        freeAgents.push(
          toStaffFreeAgent(
            {
              ...memberForYear,
              contractYears: 0,
              yearsWithTeam: memberForYear?.yearsWithTeam ?? 0,
            } as StaffMember,
            'nba',
            `nba-staff-fa-${team.id}-${String(role).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(memberForYear?.name ?? 'staff').replace(/[^a-z0-9]+/gi, '-')}-${currentYear}`,
          ),
        );
        historyEntries.push(staffHistory(`${memberForYear.name}'s contract with the ${teamName} expired after serving as ${displayStaffRole(role)}.`, date, team.id));
      }
    }

    if (!isUserTeam && aiCanUseStaffMarket) {
      for (const role of NBA_STAFF_ROLES) {
        if (occupied.has(role)) continue;
        const hire = hireFromStaffPool(team, role, currentYear, staffFreeAgents, consumedFreeAgentIds, unavailableNames)
          ?? buildGeneratedNBAStaffForRole(team, role, currentYear, `rollover-${historyEntries.length}`);
        nextStaff.push(hire);
        occupied.add(role);
        historyEntries.push(staffHistory(`${teamName} hired ${hire.name} as ${displayStaffRole(role)}.`, date, team.id));
      }
    }

    return {
      ...team,
      tycoon: {
        ...tycoon,
        tier: tycoon.tier ?? marketTierForTeam(team),
        staffMembers: nextStaff,
      },
    } as NBATeam;
  });
  return { teams: teamsOut, historyEntries, freeAgents, consumedFreeAgentIds: Array.from(consumedFreeAgentIds), retirementRecords };
}
