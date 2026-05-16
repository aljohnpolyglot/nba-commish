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
import { getNBA2KCoach, getCoachContract, getCoachRatings, type NBA2KCoachData } from '../staffService';
import { deterministicStaffImageId } from '../../utils/staffPortrait';

const norm = (s: string | undefined | null) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Resolve the team name format used in nba2kcoachlist. Source uses full names
 *  like "Miami Heat", "Golden State Warriors" — our state.teams can carry
 *  region + name split, so we try both join patterns and a direct match. */
function teamMatchKeys(team: NBATeam): string[] {
  const region = (team as any).region ?? '';
  const name = team.name ?? '';
  const out = new Set<string>();
  out.add(name);
  if (region && !name.startsWith(region)) out.add(`${region} ${name}`);
  if (region) out.add(region);
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
  baseSalary: number,
): StaffMember {
  const rating = getCoachRatings(raw.name);
  return {
    id: `nba-real-staff-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${raw.name.replace(/[^a-zA-Z0-9]+/g, '-')}`,
    role,
    name: raw.name,
    nationality: raw.nationality ?? 'USA',
    salary: baseSalary,
    contractYears,
    rating: rating ? Math.round(
      // role-agnostic mean as a back-compat scalar; the UI re-derives the
      // proper role-weighted overall via attrsForCoach() at render time.
      Object.values(rating.attributes).reduce((a, b) => a + b, 0) / 15
    ) : undefined,
    hiredYear,
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
    .flatMap(key => (globalThis as any).__nba2kCoachList?.filter?.((c: NBA2KCoachData) => c.team === key) ?? []);
  if (all.length === 0) return [];

  const out: StaffMember[] = [];
  const hc = pickHeadCoach(all);
  if (hc) {
    // Real HC contract length — fall back to 3 years if not in contracts gist.
    const contract = getCoachContract(hc.name);
    const remainingYears = contract && contract.history.length
      ? Math.max(1, contract.history[0].end_year - currentYear + 1)
      : 3;
    out.push(buildStaffMember(hc, 'Head Coach', currentYear - 1, remainingYears, 8_500_000));
  }

  // Lead AC first, then regular ACs, up to 3 slots total.
  const acs = [
    ...all.filter(c => isLeadAC(c.position)),
    ...all.filter(c => isAC(c.position)),
  ];
  const acSlots = ['Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'];
  for (let i = 0; i < Math.min(acs.length, acSlots.length); i++) {
    out.push(buildStaffMember(acs[i], acSlots[i], currentYear - 1, 2 + (i % 2), 1_200_000 - i * 200_000));
  }

  return out;
}

/** Seed staffMembers into every NBA team. Idempotent — skips teams that
 *  already have hires. Returns the updated teams array (caller should setState
 *  with this). Mutates in place is also fine because callers always shell-copy. */
export function seedRealNBAStaffForAllTeams(
  teams: NBATeam[],
  coachList: NBA2KCoachData[],
  currentYear: number,
): { teams: NBATeam[]; seededCount: number } {
  // Stash the source list on globalThis so buildRealStaffForTeam can read it
  // without forcing a re-import — keeps the helper signature simple.
  (globalThis as any).__nba2kCoachList = coachList;
  let seeded = 0;
  const updated = teams.map(team => {
    const tycoon = (team as any).tycoon ?? null;
    const existing: StaffMember[] = tycoon?.staffMembers ?? [];
    if (existing.length > 0) return team;
    const members = buildRealStaffForTeam(team, currentYear);
    if (members.length === 0) return team;
    seeded++;
    return {
      ...team,
      tycoon: {
        ...(tycoon ?? {}),
        staffMembers: members,
        firedStaffRoles: tycoon?.firedStaffRoles ?? [],
        cashOnHand: tycoon?.cashOnHand ?? 0,
      },
    } as NBATeam;
  });
  return { teams: updated, seededCount: seeded };
}
