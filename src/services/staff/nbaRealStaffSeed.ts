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
import { getStaffMarketSalary, resolveStaffMarketForTeam } from '../tycoon/economyScale';
import { isEuroStaffLeagueId, toStaffFreeAgent } from '../euro/staffPool';
import { evaluateStaffRetirement, staffRetirementHistory, type StaffRetirementRecord } from './staffRetirement';
import type { TycoonTier } from '../../types/tycoon';
import {
  buildHistoricalStaffCandidatesForTeam,
  getHistoricalCoachAchievements,
  type HistoricalCoachCandidate,
} from './historicalNbaCoaches';
import { finalizeStaffStint, stampStaffHireCareer } from './staffCareerRows';
import { getNameData } from '../../data/nameDataFetcher';
import { FICTIONAL_STAFF_LEAGUE_ID, generateFictionalStaffPool } from '../fictionalStaffGenerator';
import { attrsForCoach, computeStaffOverall, seedForStaff } from './displayAttributes';
import { PBA_STAFF_ECONOMY_VERSION } from '../pba/historicalEconomy';
import { resolveEraAwareStaffRating } from '../era/basketballEraRules';

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
  'Milwaukee Bucks': {
    name: 'Taylor Jenkins',
    team: 'Milwaukee Bucks',
    position: 'Head Coach',
    league: 'NBA',
    nationality: 'American',
    born: 'September 12, 1984',
    age: '41',
    image: '',
    url: '',
  },
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

function generatedRatingForRole(role: string, tier: TycoonTier, seed: number, currentYear = 2026): number {
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
  const fallback = Math.max(52, Math.min(94, base + tierOffset[tier] + variance));
  return resolveEraAwareStaffRating(baseRole, currentYear, (seed % 1000) / 1000, fallback, tierOffset[tier]);
}

function contractYearsForRole(role: string, seed: number): number {
  if (role === 'Head Coach') return 3 + (seed % 3);
  return 2 + (seed % 3);
}

function historicalStaffSalaryScale(year: number): number {
  const anchors = [
    { year: 1950, scale: 0.015 },
    { year: 1960, scale: 0.025 },
    { year: 1970, scale: 0.045 },
    { year: 1980, scale: 0.085 },
    { year: 1990, scale: 0.17 },
    { year: 2000, scale: 0.34 },
    { year: 2010, scale: 0.55 },
    { year: 2020, scale: 0.82 },
    { year: 2026, scale: 1 },
  ];
  const first = anchors[0];
  if (year <= first.year) return first.scale;
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const next = anchors[i];
    if (year <= next.year) {
      const t = (year - prev.year) / (next.year - prev.year);
      return prev.scale + (next.scale - prev.scale) * t;
    }
  }
  return 1;
}

function roundHistoricalStaffSalary(value: number): number {
  return Math.max(25_000, Math.round(value / 5_000) * 5_000);
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

export interface GeneratedStaffMemberOptions {
  source: string;
  leagueId?: string;
  nationality?: string;
  gender?: 'male' | 'female';
  attributeProfile?: 'default' | 'nba';
}

export function buildGeneratedStaffMemberForRole(
  team: NBATeam,
  role: string,
  currentYear: number,
  index = 0,
  options: GeneratedStaffMemberOptions = { source: 'nba-ai-staff' },
): StaffMember {
  const teamId = team.id ?? (team as any).tid ?? 0;
  const teamName = getTeamFullName(team);
  const tier = marketTierForTeam(team);
  const seed = hashSeed(`${teamId}-${teamName}-${role}-${currentYear}-${index}`);
  const rating = generatedRatingForRole(role, tier, seed, currentYear);
  const name = pickSupportName(seed + index * 101);
  const hiredYear = currentYear - 1;
  const career = seededCareer(seed, currentYear, hiredYear);
  const roleLabel = role.replace(/ \d+$/, '');
  const careerRow = `${hiredYear}-Present ${teamName} (${roleLabel})`;
  const source = options.source;
  return {
    id: `${source}-${teamId}-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    role,
    name,
    team: teamName,
    position: role,
    jobTitle: role,
    nationality: options.nationality ?? DEFAULT_NBA_STAFF_NATIONALITY,
    gender: options.gender,
    leagueId: options.leagueId,
    salary: getStaffMarketSalary(tier, role, rating, {
      yearsExperience: career.yearsExperience,
      yearsWithTeam: career.yearsWithTeam,
    }),
    contractYears: contractYearsForRole(role, seed),
    rating,
    hiredYear,
    roleStartYear: hiredYear,
    yearsWithTeam: career.yearsWithTeam,
    bornYear: career.bornYear,
    careerStartYear: career.careerStartYear,
    coaching_career: careerRow,
    career_history: careerRow,
    signingBonus: 0,
    staffImageId: deterministicStaffImageId(name),
    isPlaceholder: true,
    attributeSeed: seed,
    attributeProfile: options.attributeProfile ?? 'nba',
    source,
  } as any;
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
  raw: NBA2KCoachData | HistoricalCoachCandidate,
  role: string,
  hiredYear: number,
  contractYears: number,
  currentYear: number,
): StaffMember {
  const rawAny = raw as any;
  const ratingEntry = getCoachRatings(raw.name);
  const seed = hashSeed(`${rawAny.team ?? ''}-${raw.name}-${role}`);
  const explicitRating = Number(rawAny.rating);
  const rating = Number.isFinite(explicitRating) ? Math.round(explicitRating) : ratingEntry ? Math.round(
    Object.values(ratingEntry.attributes).reduce((a, b) => a + b, 0) / 15
  ) : generatedRatingForRole(role, 'A', seed, currentYear);
  const career = getStaffCareerSnapshot(raw as any, currentYear);
  const contract = getCoachContractSnapshot(raw.name, currentYear);
  const resolvedHiredYear = Number.isFinite(Number(rawAny.hiredYear)) ? Number(rawAny.hiredYear) : hiredYear;
  const resolvedYearsWithTeam = Number.isFinite(resolvedHiredYear)
    ? Math.max(0, currentYear - resolvedHiredYear)
    : career.yearsWithTeam;
  const resolvedContractYears = Number.isFinite(Number(rawAny.contractYears)) ? Number(rawAny.contractYears) : contractYears;
  const marketSalary = getStaffMarketSalary(undefined, role, rating, {
    externalSalary: contract?.annualSalary ?? null,
    yearsExperience: career.yearsExperience,
    yearsWithTeam: career.yearsWithTeam,
  });
  const salary = rawAny.source === 'historical-nba-coaches'
    ? roundHistoricalStaffSalary(marketSalary * historicalStaffSalaryScale(currentYear))
    : marketSalary;
  const sourceAchievements = getHistoricalCoachAchievements(raw.name, currentYear - 1);
  const coachAchievements = sourceAchievements.length > 0
    ? sourceAchievements
    : rawAny.coachAchievements;
  return {
    id: `nba-real-staff-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${raw.name.replace(/[^a-zA-Z0-9]+/g, '-')}`,
    role,
    name: raw.name,
    team: rawAny.team,
    jobTitle: role,
    nationality: rawAny.nationality ?? DEFAULT_NBA_STAFF_NATIONALITY,
    salary,
    contractYears: resolvedContractYears,
    rating,
    reputation: rawAny.reputation ?? rating,
    hiredYear: resolvedHiredYear,
    yearsWithTeam: resolvedYearsWithTeam,
    age: rawAny.age,
    bornYear: rawAny.bornYear ?? career.bornYear ?? undefined,
    bornDate: rawAny.bornDate,
    born: rawAny.born,
    careerStartYear: rawAny.careerStartYear ?? career.careerStartYear ?? undefined,
    signingBonus: 0,
    face: undefined,
    staffImageId: undefined,
    playerPortraitUrl: rawAny.image ?? rawAny.playerPortraitUrl ?? undefined,
    position: rawAny.position,
    url: rawAny.url,
    basketballReferenceUrl: rawAny.basketballReferenceUrl,
    basketballReference: rawAny.basketballReference,
    coaching_career: rawAny.coaching_career,
    career_history: rawAny.career_history,
    awardsSummary: Array.from(new Set([
      ...(Array.isArray(rawAny.awardsSummary) ? rawAny.awardsSummary : []),
      ...(coachAchievements ?? []).map((achievement: any) => achievement.label ?? achievement.type),
    ])),
    coachAchievements,
    source: rawAny.source ?? 'nba-real-staff',
    attributeSeed: seed,
    attributeProfile: 'nba',
  } as any;
}

/** Build the full staffMembers list for one NBA team from the real coach list. */
export function buildRealStaffForTeam(team: NBATeam, currentYear: number): StaffMember[] {
  // Defer the import so a unit-test environment doesn't blow up on the gist fetch.
  // `getTeamStaff` would also work but doing the filter inline lets us share
  // the candidate array between HC + AC resolution.
  const seenCurrent = new Set<string>();
  const all = teamMatchKeys(team)
    .flatMap(key => ((globalThis as any).__nba2kCoachList?.filter?.((c: NBA2KCoachData) => c.team === key) ?? getTeamStaff(key)))
    .filter(current => {
      const key = `${norm(current.name)}|${norm(current.position)}`;
      if (seenCurrent.has(key)) return false;
      seenCurrent.add(key);
      return true;
    });
  const isHistoricalSeason = currentYear < 2026;
  const historical = buildHistoricalStaffCandidatesForTeam(team, currentYear);
  const override = CURRENT_HEAD_COACH_OVERRIDES[getTeamFullName(team)];
  if (!isHistoricalSeason && all.length === 0 && historical.length === 0 && !override) return [];
  const currentCandidates = isHistoricalSeason ? [] : all;

  const out: StaffMember[] = [];
  const usedNames = new Set<string>();
  const historicalHC = historical.find(candidate => candidate.role === 'Head Coach');
  const hc = isHistoricalSeason
    ? historicalHC
    : override ? override as NBA2KCoachData : pickHeadCoach(currentCandidates) ?? historicalHC;
  if (hc) {
    const contract = getCoachContractSnapshot(hc.name, currentYear);
    const remainingYears = (hc as any).contractYears ?? contract?.yearsLeft ?? 3;
    out.push(buildStaffMember(hc, 'Head Coach', currentYear - 1, remainingYears, currentYear));
    usedNames.add(norm(hc.name));
  }

  // Lead AC first, then regular ACs, up to 3 slots total.
  const currentAcs = [
    ...currentCandidates.filter(c => isLeadAC(c.position)),
    ...currentCandidates.filter(c => isAC(c.position)),
  ];
  const historicalAcs = historical.filter(candidate => candidate.role.startsWith('Assistant Coach'));
  const acs = [
    ...currentAcs,
    ...historicalAcs.filter(candidate => !currentAcs.some(current => norm(current.name) === norm(candidate.name))),
  ];
  const acSlots = ['Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'];
  for (let i = 0; i < acs.length && out.filter(member => member.role.startsWith('Assistant Coach')).length < acSlots.length; i++) {
    if (usedNames.has(norm(acs[i].name))) continue;
    const slot = acSlots[out.filter(member => member.role.startsWith('Assistant Coach')).length];
    const contract = getCoachContractSnapshot(acs[i].name, currentYear);
    out.push(buildStaffMember(acs[i], slot, currentYear - 1, (acs[i] as any).contractYears ?? contract?.yearsLeft ?? (2 + (i % 2)), currentYear));
    usedNames.add(norm(acs[i].name));
  }

  if (isHistoricalSeason) {
    const coachingRoles = ['Head Coach', 'Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'];
    for (let i = 0; i < coachingRoles.length; i++) {
      const role = coachingRoles[i];
      if (out.some(member => (member as any).role === role)) continue;
      const generated = buildGeneratedStaffMemberForRole(team, role, currentYear, i, { source: 'historical-nba-generated-staff' });
      if (usedNames.has(norm(generated.name))) continue;
      out.push(generated);
      usedNames.add(norm(generated.name));
    }
  }

  for (const support of historical.filter(candidate => SUPPORT_ROLES.includes(candidate.role as any))) {
    if (usedNames.has(norm(support.name))) continue;
    out.push(buildStaffMember(support, support.role, currentYear - 1, support.contractYears ?? 2, currentYear));
    usedNames.add(norm(support.name));
  }

  return out;
}

function buildSupportStaffForTeam(team: NBATeam, currentYear: number): StaffMember[] {
  return SUPPORT_ROLES.map((role, index) => buildGeneratedStaffMemberForRole(team, role, currentYear, index));
}

const normalizedStaffTeam = (value: unknown): string => String(value ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export function seedActiveLeagueStaffForTeams(
  teams: NBATeam[],
  currentYear: number,
  options: GeneratedStaffMemberOptions & { headCoaches?: StaffMember[] },
): { teams: NBATeam[]; seededCount: number; filledRoleCount: number } {
  let seededCount = 0;
  let filledRoleCount = 0;
  const nextTeams = teams.map(team => {
    const tycoon = (team as any).tycoon ?? {};
    const existing = [...((tycoon.staffMembers ?? []) as StaffMember[])];
    const firedRoles = new Set<string>(tycoon.firedStaffRoles ?? []);
    const teamKeys = new Set([
      getTeamFullName(team),
      team.name,
      team.region,
      team.abbrev,
    ].map(normalizedStaffTeam).filter(Boolean));
    const sourceHeadCoach = (options.headCoaches ?? []).find(member => teamKeys.has(normalizedStaffTeam(member.team)));
    let teamFillCount = 0;
    for (let index = 0; index < NBA_STAFF_ROLES.length; index += 1) {
      const role = NBA_STAFF_ROLES[index];
      if (firedRoles.has(role) || existing.some(member => member.role === role)) continue;
      const member = role === 'Head Coach' && sourceHeadCoach
        ? {
            ...sourceHeadCoach,
            role,
            position: role,
            jobTitle: role,
            team: getTeamFullName(team),
            leagueId: options.leagueId ?? sourceHeadCoach.leagueId,
            contractYears: sourceHeadCoach.contractYears ?? Math.max(1, 4 - Math.min(3, sourceHeadCoach.yearsWithTeam ?? 1)),
          }
        : buildGeneratedStaffMemberForRole(team, role, currentYear, index, options);
      existing.push(member);
      teamFillCount += 1;
    }
    if (teamFillCount === 0) return team;
    seededCount += 1;
    filledRoleCount += teamFillCount;
    return {
      ...team,
      tycoon: {
        ...tycoon,
        staffMembers: existing,
      },
    } as NBATeam;
  });
  return { teams: nextTeams, seededCount, filledRoleCount };
}

function isHistoricalEraStaff(member: StaffMember | undefined): boolean {
  const source = String((member as any)?.source ?? '');
  return source === 'historical-nba-coaches'
    || source === 'historical-nba-generated-staff'
    || source === 'historical-coach-pool'
    || source === 'historical-retired-player-staff';
}

/** Seed missing staffMembers into NBA teams. Idempotent — preserves existing
 *  hires/fired roles and only fills roles that are still absent. */
export function seedRealNBAStaffForAllTeams(
  teams: NBATeam[],
  coachList: NBA2KCoachData[] | undefined,
  currentYear: number,
  opts: {
    excludeTeamId?: number | null;
    fillSupportRoles?: boolean;
    replacePlaceholderRoles?: boolean;
    replaceModernHistoricalMismatches?: boolean;
  } = {},
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
    const seededRoles = new Set(seededMembers.map(member => (member as any).role).filter(Boolean));
    const hasHistoricalSeeded = seededMembers.some(member => isHistoricalEraStaff(member));
    const nextMembers = [...existing];
    let changedRoles = 0;
    for (const member of seededMembers) {
      const role = (member as any).role;
      if (!role || firedRoles.includes(role)) continue;
      const existingIndex = nextMembers.findIndex(existingMember => (existingMember as any).role === role);
      if (existingIndex < 0) {
        nextMembers.push(member);
        changedRoles += 1;
        continue;
      }
      const existingMember = nextMembers[existingIndex] as any;
      const incomingMember = member as any;
      const existingSource = String(existingMember.source ?? '');
      const existingId = String(existingMember.id ?? '');
      const sameCanonicalId = !!existingId && existingId === String(incomingMember.id ?? '');
      const hasMixedIdentity = sameCanonicalId && norm(existingMember.name) !== norm(incomingMember.name);
      const existingStintStart = Number(existingMember.roleStartYear ?? existingMember.hiredYear);
      const hasPostSeedCareer = Number.isFinite(existingStintStart) && existingStintStart > currentYear;
      const canReplacePlaceholder = opts.replacePlaceholderRoles !== false
        && !!existingMember.isPlaceholder
        && !incomingMember.isPlaceholder
        && !hasPostSeedCareer;
      const canReplaceModernHistoricalMismatch = opts.replaceModernHistoricalMismatches !== false
        && currentYear < 2026
        && isHistoricalEraStaff(incomingMember)
        && !hasPostSeedCareer
        && (existingSource === 'nba-real-staff' || existingId.startsWith('nba-real-staff-'));
      if (canReplacePlaceholder || canReplaceModernHistoricalMismatch || hasMixedIdentity) {
        nextMembers[existingIndex] = member;
        changedRoles += 1;
      }
    }
    if (opts.replaceModernHistoricalMismatches !== false && currentYear < 2026 && hasHistoricalSeeded) {
      for (let i = nextMembers.length - 1; i >= 0; i--) {
        const existingMember = nextMembers[i] as any;
        const role = String(existingMember.role ?? '');
        const isSeededModernStaff = existingMember.source === 'nba-real-staff'
          || String(existingMember.id ?? '').startsWith('nba-real-staff-');
        const existingStintStart = Number(existingMember.roleStartYear ?? existingMember.hiredYear);
        const hasPostSeedCareer = Number.isFinite(existingStintStart) && existingStintStart > currentYear;
        const isCoachingRole = role === 'Head Coach'
          || role === 'Assistant Coach'
          || role === 'Assistant Coach 2'
          || role === 'Assistant Coach 3'
          || role === 'Player Development Coach';
        if (isSeededModernStaff && !hasPostSeedCareer && isCoachingRole && !seededRoles.has(role)) {
          nextMembers.splice(i, 1);
          changedRoles += 1;
        }
      }
    }
    if (changedRoles === 0) return team;
    seeded++;
    filledRoles += changedRoles;
    return {
      ...team,
      tycoon: {
        ...(tycoon ?? {}),
        tier: tycoon?.tier ?? marketTierForTeam(team),
        staffMembers: nextMembers,
        firedStaffRoles: tycoon?.firedStaffRoles ?? [],
        cashOnHand: tycoon?.cashOnHand ?? 0,
      },
    } as NBATeam;
  });
  return { teams: updated, seededCount: seeded, filledRoleCount: filledRoles };
}

function staffSeed(member: any, team: NBATeam, year: number): number {
  return hashSeed(`${team.id ?? (team as any).tid}-${member?.id ?? ''}-${member?.name ?? ''}-${member?.role ?? ''}-${year}`);
}

function shouldAIExtendStaff(member: any, team: NBATeam, currentYear: number): boolean {
  const seed = staffSeed(member, team, currentYear);
  const tier = marketTierForTeam(team);
  const baseRole = baseStaffRole(member?.role ?? member?.position ?? member?.jobTitle);
  const rating = member?.rating ?? member?.reputation ?? 66;
  const yearsWithTeam = getStaffCareerSnapshot(member, currentYear).yearsWithTeam;
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
      68 + (rating - 68) * 2 + tierBonus[tier] + regularSeasonBonus + playoffBonus + headCoachSuccessBonus + tenureContinuityBonus,
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

function canonicalStaffRole(role: string | undefined | null): string {
  const raw = String(role ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  if ((NBA_STAFF_ROLES as readonly string[]).includes(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower === 'lead assistant coach' || lower === 'associate head coach') return 'Assistant Coach';
  return raw;
}

function staffIdentityKey(member: any): string {
  const id = String(member?.id ?? '').trim();
  if (id) return `id:${id}`;
  const sourcePlayerId = String(member?.sourcePlayerId ?? '').trim();
  if (sourcePlayerId) return `player:${sourcePlayerId}`;
  const name = norm(member?.name);
  return name ? `name:${name}` : '';
}

function normalizeAIStaffForVacancies(
  team: NBATeam,
  staffMembers: any[],
  currentYear: number,
  date: string,
): { staffMembers: any[]; historyEntries: Array<{ text: string; date: string; type: 'Personnel'; tid: number }> } {
  const teamName = getTeamFullName(team);
  const teamId = Number(team.id ?? (team as any).tid);
  const historyEntries: Array<{ text: string; date: string; type: 'Personnel'; tid: number }> = [];
  const seenRoles = new Set<string>();
  const seenPeople = new Set<string>();
  const validRoles = new Set<string>(NBA_STAFF_ROLES as readonly string[]);
  const nextStaff: any[] = [];

  for (const member of staffMembers) {
    const role = canonicalStaffRole(member?.role ?? member?.position ?? member?.jobTitle);
    if (!validRoles.has(role)) continue;

    const yearsLeftRaw = Number(member?.contractYears);
    if (Number.isFinite(yearsLeftRaw) && Math.round(yearsLeftRaw) <= 0) {
      historyEntries.push(staffHistory(`${member.name}'s contract with the ${teamName} expired after serving as ${displayStaffRole(role)}.`, date, teamId));
      continue;
    }

    const personKey = staffIdentityKey(member);
    if ((personKey && seenPeople.has(personKey)) || seenRoles.has(role)) continue;
    if (personKey) seenPeople.add(personKey);
    seenRoles.add(role);
    nextStaff.push({
      ...member,
      role,
      position: role,
      jobTitle: role,
      yearsWithTeam: getStaffCareerSnapshot(member, currentYear).yearsWithTeam,
    });
  }

  return { staffMembers: nextStaff, historyEntries };
}

function candidateBaseRole(member: StaffMember): string {
  return baseStaffRole(member.role ?? member.position ?? member.jobTitle);
}

function candidateScore(member: StaffMember): number {
  const rating = Number((member as any).rating ?? member.reputation ?? 0);
  return rating + (member.reputation ?? rating) * 0.35 + (member.staffJoinChance ?? 0) * 0.2;
}

function isModernRealStaffSource(member: StaffMember): boolean {
  const source = String((member as any)?.source ?? '');
  const id = String((member as any)?.id ?? '');
  return source === 'nba-real-staff' || id.startsWith('nba-real-staff-');
}

function hasEnteredStaffMarket(member: StaffMember, currentYear: number): boolean {
  const career = getStaffCareerSnapshot(member as any, currentYear);
  return career.careerStartYear != null ? career.careerStartYear <= currentYear : currentYear >= 2026;
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
  const coachingTrack = new Set(['Head Coach', 'Assistant Coach', 'Player Development Coach', 'Youth Coach']);
  if (coachingTrack.has(target)) return coachingTrack.has(source);
  return source === target;
}

function candidateRatingForRole(member: StaffMember, role: string): number {
  const attrs = attrsForCoach(member.name, seedForStaff(member), {
    role,
    attributeProfile: member.attributeProfile,
    attributeOverrides: member.attributeOverrides,
  });
  const rating = computeStaffOverall(role, attrs);
  return member.leagueId === 'pba' ? Math.max(20, Math.min(70, rating)) : rating;
}

function staffCandidateSourcePriority(member: StaffMember): number {
  const source = String(member.source ?? '').toLowerCase();
  if (
    source === 'nba-real-staff'
    || source === 'historical-nba-coaches'
    || source === 'historical-coach-pool'
    || source === 'historical-retired-player-staff'
    || source === 'wnba-coaches-bref-wikipedia'
  ) return 3;
  if (member.basketballReferenceUrl || member.sourcePlayerId || member.playerPortraitUrl) return 2;
  if (source.includes('generated') || source.includes('ai-staff') || source.includes('fictional')) return 0;
  return 1;
}

function hireFromStaffPool(
  team: NBATeam,
  role: string,
  currentYear: number,
  staffFreeAgents: StaffMember[],
  consumedFreeAgentIds: Set<string>,
  unavailableNames: Set<string> = new Set(),
  staffLeagueId = 'nba',
): StaffMember | null {
  const pool = staffFreeAgents
    .filter(member => !member.id || !consumedFreeAgentIds.has(member.id))
    .filter(member => !unavailableNames.has(norm(member.name)))
    .filter(member => !member.leagueId || member.leagueId === staffLeagueId)
    .filter(member => !isModernRealStaffSource(member) || hasEnteredStaffMarket(member, currentYear))
    .filter(member => canFillRole(member, role))
    .sort((a, b) =>
      staffCandidateSourcePriority(b) - staffCandidateSourcePriority(a)
      || candidateRatingForRole(b, role) - candidateRatingForRole(a, role)
      || candidateScore(b) - candidateScore(a)
    );
  const candidate = pool[0];
  if (!candidate) return null;
  if (candidate.id) consumedFreeAgentIds.add(candidate.id);
  unavailableNames.add(norm(candidate.name));
  const teamName = getTeamFullName(team);
  const seed = staffSeed(candidate, team, currentYear);
  const rating = candidateRatingForRole(candidate, role);
  const candidateYears = Math.round(Number(candidate.contractYears ?? 0));
  const years = candidateYears > 0 ? candidateYears : contractYearsForRole(role, seed);
  const market = resolveStaffMarketForTeam(team);
  const economyScale = market === 'nba'
    ? 1
    : Math.max(0.05, Number((team as any).tycoon?.currentEconomyIndex ?? 1));
  const marketSalary = getStaffMarketSalary((team as any).tycoon?.tier ?? marketTierForTeam(team), role, rating, {
    yearsExperience: Math.max(1, currentYear - (candidate.careerStartYear ?? currentYear)),
    yearsWithTeam: 0,
    market,
    economyScale,
  });
  const candidateSource = String((candidate as any).source ?? '');
  const salary = market === 'nba' && candidateSource.startsWith('historical-')
    ? roundHistoricalStaffSalary(marketSalary * historicalStaffSalaryScale(currentYear))
    : marketSalary;
  const hired = {
    ...candidate,
    role,
    position: role,
    jobTitle: role,
    team: teamName,
    teamLogoUrl: team.logoUrl ?? (team as any).imgURL,
    leagueId: staffLeagueId,
    contractYears: years,
    hiredYear: currentYear,
    yearsWithTeam: 0,
    rating,
    reputation: candidate.reputation ?? rating,
    salary,
    staffEconomyVersion: staffLeagueId === 'pba' ? PBA_STAFF_ECONOMY_VERSION : candidate.staffEconomyVersion,
    isPlaceholder: false,
  } as StaffMember;
  return stampStaffHireCareer(hired, role, teamName, currentYear) as StaffMember;
}

function buildGeneratedAIHire(
  team: NBATeam,
  role: string,
  currentYear: number,
  unavailableNames: Set<string>,
  salt: number,
  staffLeagueId = 'nba',
): StaffMember {
  const teamName = getTeamFullName(team);
  const market = resolveStaffMarketForTeam(team);
  if (staffLeagueId === FICTIONAL_STAFF_LEAGUE_ID) {
    const seed = hashSeed(`${team.id ?? 0}-${role}-${currentYear}-${salt}`);
    const baseRole = role.replace(/ \d+$/, '');
    const candidate = generateFictionalStaffPool(getNameData(), currentYear, seed, 1)
      .find(member => member.position === baseRole);
    if (candidate) {
      unavailableNames.add(norm(candidate.name));
      return stampStaffHireCareer({
        ...candidate,
        id: `${candidate.id}-${team.id ?? 0}-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        role,
        position: role,
        jobTitle: role,
        team: teamName,
        teamLogoUrl: team.logoUrl,
        hiredYear: currentYear,
        roleStartYear: currentYear,
        yearsWithTeam: 0,
        isPlaceholder: false,
      }, role, teamName, currentYear) as StaffMember;
    }
  }
  const source = market === 'pba'
    ? currentYear < 2026 ? 'historical-pba-generated-staff' : 'pba-ai-staff'
    : isEuroStaffLeagueId(staffLeagueId)
      ? currentYear < 2026 ? 'historical-euro-generated-staff' : 'euro-ai-staff'
      : currentYear < 2026 ? 'historical-nba-generated-staff' : 'nba-ai-staff';
  const finalizeGenerated = (generated: StaffMember, suffix: string): StaffMember => {
    const rating = generated.rating ?? generated.reputation ?? 60;
    const economyScale = market === 'nba'
      ? 1
      : Math.max(0.05, Number((team as any).tycoon?.currentEconomyIndex ?? 1));
    return stampStaffHireCareer({
      ...generated,
      id: `${generated.id}-${currentYear}-${salt}-${suffix}`,
      hiredYear: currentYear,
      roleStartYear: currentYear,
      yearsWithTeam: 0,
      team: teamName,
      leagueId: staffLeagueId,
      nationality: market === 'pba' ? 'Philippines' : generated.nationality,
      salary: market === 'nba'
        ? generated.salary
        : getStaffMarketSalary((team as any).tycoon?.tier ?? marketTierForTeam(team), role, rating, {
            market,
            economyScale,
            yearsExperience: Math.max(1, currentYear - (generated.careerStartYear ?? currentYear)),
            yearsWithTeam: 0,
          }),
      staffEconomyVersion: staffLeagueId === 'pba'
        ? PBA_STAFF_ECONOMY_VERSION
        : generated.staffEconomyVersion,
      isPlaceholder: false,
    }, role, teamName, currentYear) as StaffMember;
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    const generated = buildGeneratedStaffMemberForRole(team, role, currentYear, salt + attempt * 997, { source });
    const nameKey = norm(generated.name);
    if (nameKey && unavailableNames.has(nameKey)) continue;
    if (nameKey) unavailableNames.add(nameKey);
    return finalizeGenerated(generated, String(attempt));
  }
  const generated = buildGeneratedStaffMemberForRole(team, role, currentYear, salt + 7919, { source });
  return finalizeGenerated(generated, 'fallback');
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
  staffLeagueId = 'nba',
  usePassedTeamScope = false,
): {
  teams: NBATeam[];
  historyEntries: Array<{ text: string; date: string; type: 'Personnel'; tid: number }>;
  consumedFreeAgentIds: string[];
} {
  const historyEntries: Array<{ text: string; date: string; type: 'Personnel'; tid: number }> = [];
  const consumedFreeAgentIds = new Set<string>();
  const unavailableNames = activeStaffNameSet(teams);

  const teamsOut = teams.map(team => {
    const teamId = Number(team.id ?? (team as any).tid);
    const isScopedTeam = usePassedTeamScope || (
      staffLeagueId === 'pba'
        ? teamId >= 2000 && teamId < 2100
        : teamId >= 0 && teamId < 100
    );
    if (!isScopedTeam) return team;
    if (userTeamId != null && teamId === userTeamId) return team;
    const tycoon = (team as any).tycoon ?? { staffMembers: [], tier: marketTierForTeam(team) };

    const teamName = getTeamFullName(team);
    const normalized = normalizeAIStaffForVacancies(team, tycoon.staffMembers ?? [], currentYear, date);
    historyEntries.push(...normalized.historyEntries);
    const nextStaff: any[] = [...normalized.staffMembers];
    const occupied = new Set(nextStaff.map(member => canonicalStaffRole(member?.role ?? member?.position ?? member?.jobTitle)).filter(Boolean));

    for (const role of NBA_STAFF_ROLES) {
      if (occupied.has(role)) continue;
      const hire = hireFromStaffPool(team, role, currentYear, staffFreeAgents, consumedFreeAgentIds, unavailableNames, staffLeagueId)
        ?? buildGeneratedAIHire(team, role, currentYear, unavailableNames, historyEntries.length, staffLeagueId);
      nextStaff.push(hire);
      occupied.add(role);
      historyEntries.push(staffHistory(`${teamName} hired ${hire.name} as ${displayStaffRole(role)} on a ${hire.contractYears}-year contract.`, date, teamId));
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
  staffLeagueId = 'nba',
) {
  return fillAIStaffVacancies(teams, currentYear, date, userTeamId, staffFreeAgents, staffLeagueId);
}

export function processManagedTeamStaffHiringVacancies(
  team: NBATeam,
  currentYear: number,
  date: string,
  staffFreeAgents: StaffMember[] = [],
  staffLeagueId = 'nba',
) {
  return fillAIStaffVacancies(
    [team],
    currentYear,
    date,
    null,
    staffFreeAgents,
    staffLeagueId,
    true,
  );
}

export function processScopedAIStaffHiringVacancies(
  teams: NBATeam[],
  currentYear: number,
  date: string,
  userTeamId: number | null | undefined,
  staffFreeAgents: StaffMember[] = [],
  staffLeagueId = 'nba',
) {
  return fillAIStaffVacancies(
    teams,
    currentYear,
    date,
    userTeamId,
    staffFreeAgents,
    staffLeagueId,
    true,
  );
}

export function getEraAwareStaffMarketSalary(
  team: NBATeam,
  role: string,
  rating: number,
  currentYear: number,
  yearsExperience = 0,
  yearsWithTeam = 0,
): number {
  const market = resolveStaffMarketForTeam(team);
  const economyScale = market === 'nba'
    ? 1
    : Math.max(0.05, Number((team as any).tycoon?.currentEconomyIndex ?? 1));
  const salary = getStaffMarketSalary((team as any).tycoon?.tier ?? marketTierForTeam(team), role, rating, {
    market,
    economyScale,
    yearsExperience,
    yearsWithTeam,
  });
  return market === 'nba'
    ? roundHistoricalStaffSalary(salary * historicalStaffSalaryScale(currentYear))
    : salary;
}

export function processNBAStaffLifecycle(
  teams: NBATeam[],
  currentYear: number,
  date: string,
  userTeamId?: number | null,
  staffFreeAgents: StaffMember[] = [],
  staffLeagueId = 'nba',
  options: { skipRetirement?: boolean } = {},
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
  const teamsOut = teams.map(team => {
    const teamId = Number(team.id ?? (team as any).tid);
    const isScopedTeam = staffLeagueId === 'pba'
      ? teamId >= 2000 && teamId < 2100
      : teamId >= 0 && teamId < 100;
    if (!isScopedTeam) return team;
    const tycoon = (team as any).tycoon;
    const teamName = getTeamFullName(team);
    const isUserTeam = userTeamId != null && teamId === userTeamId;
    const normalized = !isUserTeam
      ? normalizeAIStaffForVacancies(team, tycoon?.staffMembers ?? [], currentYear, date)
      : { staffMembers: tycoon?.staffMembers ?? [], historyEntries: [] };
    historyEntries.push(...normalized.historyEntries);
    if (!normalized.staffMembers.length && isUserTeam) return team;
    const nextStaff: any[] = [];
    const occupied = new Set<string>();
    const headCoachMember = (normalized.staffMembers as any[]).find(member => baseStaffRole(member?.role ?? member?.position ?? member?.jobTitle) === 'Head Coach');
    const headCoachRating = Number(headCoachMember?.rating ?? headCoachMember?.reputation ?? 68);

    for (const member of normalized.staffMembers as any[]) {
      const role = member.role ?? member.position ?? member.jobTitle;
      if (!role) continue;
      const progressedMember = isMainCoachingTrackRole(role)
        ? progressMainCoachingStaff(member, role, team, currentYear, headCoachRating)
        : member;
      const memberForYear = {
        ...progressedMember,
        yearsWithTeam: getStaffCareerSnapshot(progressedMember, currentYear).yearsWithTeam,
      };
      const retirement = options.skipRetirement
        ? null
        : evaluateStaffRetirement({ member: memberForYear, team, currentYear: currentYear - 1, date });
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
        const rating = memberForYear.rating ?? memberForYear.reputation ?? generatedRatingForRole(role, marketTierForTeam(team), seed, currentYear);
        const career = getStaffCareerSnapshot(memberForYear, currentYear);
        const staffMarket = staffLeagueId === 'pba' ? 'pba' : 'nba';
        const economyScale = staffLeagueId === 'pba'
          ? Math.max(0.05, Number(tycoon?.currentEconomyIndex ?? 1))
          : 1;
        const extended = {
          ...memberForYear,
          contractYears: years,
          salary: getStaffMarketSalary(tycoon?.tier ?? marketTierForTeam(team), role, rating, {
            yearsExperience: Math.max(1, career.yearsExperience),
            yearsWithTeam: career.yearsWithTeam + 1,
            market: staffMarket,
            economyScale,
          }),
          staffEconomyVersion: staffLeagueId === 'pba'
            ? PBA_STAFF_ECONOMY_VERSION
            : memberForYear.staffEconomyVersion,
          rating,
        };
        nextStaff.push(extended);
        occupied.add(role);
        historyEntries.push(staffHistory(`${member.name} signed a ${years}-year extension with the ${teamName} as ${displayStaffRole(role)}.`, date, teamId));
      } else {
        const finalizedMember = finalizeStaffStint(
          {
            ...memberForYear,
            contractYears: 0,
            yearsWithTeam: memberForYear?.yearsWithTeam ?? 0,
          } as StaffMember,
          role,
          teamName,
          currentYear,
        );
        freeAgents.push(
          toStaffFreeAgent(
            finalizedMember,
            staffLeagueId,
            `${staffLeagueId}-staff-fa-${teamId}-${String(role).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(memberForYear?.name ?? 'staff').replace(/[^a-z0-9]+/gi, '-')}-${currentYear}`,
          ),
        );
        historyEntries.push(staffHistory(`${memberForYear.name}'s contract with the ${teamName} expired after serving as ${displayStaffRole(role)}.`, date, teamId));
      }
    }

    if (!isUserTeam) {
      for (const role of NBA_STAFF_ROLES) {
        if (occupied.has(role)) continue;
        const hire = hireFromStaffPool(team, role, currentYear, staffFreeAgents, consumedFreeAgentIds, unavailableNames, staffLeagueId)
          ?? buildGeneratedAIHire(team, role, currentYear, unavailableNames, historyEntries.length, staffLeagueId);
        nextStaff.push(hire);
        occupied.add(role);
        historyEntries.push(staffHistory(`${teamName} hired ${hire.name} as ${displayStaffRole(role)} on a ${hire.contractYears}-year contract.`, date, teamId));
      }
    }

    return {
      ...team,
      tycoon: {
        ...(tycoon ?? {}),
        tier: tycoon?.tier ?? marketTierForTeam(team),
        staffMembers: nextStaff,
      },
    } as NBATeam;
  });
  return { teams: teamsOut, historyEntries, freeAgents, consumedFreeAgentIds: Array.from(consumedFreeAgentIds), retirementRecords };
}
