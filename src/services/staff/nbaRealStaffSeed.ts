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

function supportRatingForTier(tier: TycoonTier, seed: number): number {
  const base: Record<TycoonTier, number> = { S: 79, A: 74, B: 69, C: 64, D: 59 };
  return Math.max(48, Math.min(92, base[tier] + ((seed % 13) - 6)));
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
  const rating = ratingEntry ? Math.round(
    Object.values(ratingEntry.attributes).reduce((a, b) => a + b, 0) / 15
  ) : undefined;
  const career = getStaffCareerSnapshot(raw as any, currentYear);
  const contract = getCoachContractSnapshot(raw.name, currentYear);
  return {
    id: `nba-real-staff-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${raw.name.replace(/[^a-zA-Z0-9]+/g, '-')}`,
    role,
    name: raw.name,
    nationality: raw.nationality ?? 'USA',
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
  const hc = pickHeadCoach(all);
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
    const rating = supportRatingForTier(tier, seed);
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
      nationality: 'USA',
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
    } as any;
  });
}

export function buildGeneratedNBAStaffForRole(team: NBATeam, role: string, currentYear: number, salt = ''): StaffMember {
  const tier = marketTierForTeam(team);
  const teamId = team.id ?? (team as any).tid ?? 0;
  const teamName = getTeamFullName(team);
  const seed = hashSeed(`${teamId}-${teamName}-${role}-${currentYear}-${salt}`);
  const rating = supportRatingForTier(tier, seed);
  const name = pickSupportName(seed);
  const career = seededCareer(seed, currentYear, currentYear);
  return {
    id: `nba-ai-staff-${teamId}-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${currentYear}-${seed}`,
    role,
    name,
    team: teamName,
    position: role,
    jobTitle: role,
    nationality: 'USA',
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

function inferStaffAge(member: any, seed: number, currentYear: number): number {
  if (member?.bornYear) return currentYear - member.bornYear;
  if (member?.born?.year) return currentYear - member.born.year;
  return 43 + (seed % 24);
}

function shouldRetireStaff(member: any, team: NBATeam, currentYear: number): boolean {
  const seed = staffSeed(member, team, currentYear);
  const age = inferStaffAge(member, seed, currentYear);
  const roll = seed % 100;
  if (age >= 70) return roll < 35;
  if (age >= 66) return roll < 18;
  if (age >= 62) return roll < 7;
  return false;
}

function shouldAIExtendStaff(member: any, team: NBATeam, currentYear: number): boolean {
  const seed = staffSeed(member, team, currentYear);
  const tier = marketTierForTeam(team);
  const rating = member?.rating ?? member?.reputation ?? 66;
  const tierBonus: Record<TycoonTier, number> = { S: 16, A: 10, B: 5, C: 0, D: -4 };
  const chance = Math.max(28, Math.min(88, 48 + (rating - 68) * 2 + tierBonus[tier]));
  return (seed % 100) < chance;
}

function staffHistory(text: string, date: string, tid: number) {
  return { text, date, type: 'Personnel' as const, tid };
}

export function processNBAStaffLifecycle(
  teams: NBATeam[],
  currentYear: number,
  date: string,
  userTeamId?: number | null,
): {
  teams: NBATeam[];
  historyEntries: Array<{ text: string; date: string; type: 'Personnel'; tid: number }>;
  freeAgents: StaffMember[];
} {
  const historyEntries: Array<{ text: string; date: string; type: 'Personnel'; tid: number }> = [];
  const freeAgents: StaffMember[] = [];
  const teamsOut = teams.map(team => {
    if (team.id == null || team.id < 0 || team.id >= 100) return team;
    const tycoon = (team as any).tycoon;
    if (!tycoon?.staffMembers?.length) return team;
    const teamName = getTeamFullName(team);
    const isUserTeam = userTeamId != null && team.id === userTeamId;
    const nextStaff: any[] = [];
    const occupied = new Set<string>();

    for (const member of tycoon.staffMembers as any[]) {
      const role = member.role ?? member.position ?? member.jobTitle;
      if (!role) continue;
      const retired = shouldRetireStaff(member, team, currentYear);
      if (retired) {
        historyEntries.push(staffHistory(`${member.name} retired from the ${teamName} staff as ${role}.`, date, team.id));
        continue;
      }

      const remainingYears = Math.max(0, Math.round(member.contractYears ?? 1) - 1);
      if (remainingYears > 0) {
        nextStaff.push({ ...member, contractYears: remainingYears });
        occupied.add(role);
        continue;
      }

      if (!isUserTeam && shouldAIExtendStaff(member, team, currentYear)) {
        const seed = staffSeed(member, team, currentYear);
        const years = contractYearsForRole(role, seed);
        const rating = member.rating ?? member.reputation ?? supportRatingForTier(marketTierForTeam(team), seed);
        const career = getStaffCareerSnapshot(member, currentYear);
        const extended = {
          ...member,
          contractYears: years,
          salary: getStaffMarketSalary(tycoon.tier ?? marketTierForTeam(team), role, rating, {
            yearsExperience: Math.max(1, career.yearsExperience),
            yearsWithTeam: career.yearsWithTeam + 1,
          }),
          rating,
        };
        nextStaff.push(extended);
        occupied.add(role);
        historyEntries.push(staffHistory(`${member.name} signed a ${years}-year extension with the ${teamName} as ${role}.`, date, team.id));
      } else {
        freeAgents.push(
          toStaffFreeAgent(
            {
              ...member,
              contractYears: 0,
              yearsWithTeam: member?.yearsWithTeam ?? 0,
            } as StaffMember,
            'nba',
            `nba-staff-fa-${team.id}-${String(role).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(member?.name ?? 'staff').replace(/[^a-z0-9]+/gi, '-')}-${currentYear}`,
          ),
        );
        historyEntries.push(staffHistory(`${member.name}'s contract with the ${teamName} expired after serving as ${role}.`, date, team.id));
      }
    }

    if (!isUserTeam) {
      for (const role of NBA_STAFF_ROLES) {
        if (occupied.has(role)) continue;
        const hire = buildGeneratedNBAStaffForRole(team, role, currentYear, `rollover-${historyEntries.length}`);
        nextStaff.push(hire);
        occupied.add(role);
        historyEntries.push(staffHistory(`${teamName} hired ${hire.name} as ${role}.`, date, team.id));
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
  return { teams: teamsOut, historyEntries, freeAgents };
}
