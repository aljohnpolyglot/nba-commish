import type { GameState, NBATeam, NonNBATeam, SetupTierLabel, StaffMember } from '../../types';
import { seedStaffSix } from './staffSeed';
import { getNewgenPortraitUrl, getRegenPortraitUrl } from '../../utils/newgenPortrait';

type StaffPoolMember = StaffMember & {
  id: string;
  reputation?: number;
  leagueId: string;
  formerTeam?: string;
  formerTeamLogoUrl?: string;
  formerRole?: string;
};

/** All staff positions the FA pool tracks. Must match StaffSection role names. */
export const STAFF_POSITIONS = [
  'Head Coach',
  'Assistant Coach',
  'Head of Sports Science',
  'Head Physio',
  'Player Development Coach',
  'Chief Scout',
  'Head of Analytics',
] as const;

/** Minimum unemployed FAs per position per league. The user explicitly wanted
 *  this — no on-the-fly generation in UI, always a real pool to read from. */
export const MIN_FA_DEPTH_PER_POSITION = 10;

const LEAGUE_TID_RANGES: Record<string, [number, number]> = {
  nba: [0, 100],
  euroleague: [1000, 1100],
  pba: [2000, 2100],
  endesa: [5000, 5100],
  wnba: [3000, 3100],
  bleague: [4000, 4100],
  gleague: [6000, 6100],
  chinacba: [7000, 7100],
  nblaus: [8000, 8100],
};

export function inferEuroStaffLeagueId(teamId: number): string {
  if (teamId >= 0 && teamId < 100) return 'nba';
  if (teamId >= 1000 && teamId < 1100) return 'euroleague';
  if (teamId >= 2000 && teamId < 2100) return 'pba';
  if (teamId >= 4000 && teamId < 4100) return 'bleague';
  if (teamId >= 5000 && teamId < 5100) return 'endesa';
  if (teamId >= 6000 && teamId < 6100) return 'gleague';
  if (teamId >= 7000 && teamId < 7100) return 'chinacba';
  if (teamId >= 8000 && teamId < 8100) return 'nblaus';
  return 'nba';
}

export function normalizeStaffPoolRole(role: string | undefined | null): string {
  return String(role ?? '').replace(/ \d+$/, '').trim();
}

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

function getLeagueTeams(state: Pick<GameState, 'nonNBATeams' | 'teams'>, leagueId: string): NonNBATeam[] {
  // NBA pool draws from the NBA roster. We coerce NBATeam → NonNBATeam-ish for
  // the downstream seedStaffSix helper which only reads {tid, name, region, abbrev, imgURL}.
  if (leagueId === 'nba') {
    const nba = (state.teams ?? []) as any[];
    return nba.map(t => ({
      tid: t.id ?? t.tid,
      name: t.name,
      region: t.region ?? '',
      abbrev: t.abbrev ?? '',
      imgURL: t.logoUrl,
    })) as any;
  }
  const teams = state.nonNBATeams ?? [];
  const range = LEAGUE_TID_RANGES[leagueId];
  if (!range) return teams;
  const filtered = teams.filter(team => team.tid >= range[0] && team.tid < range[1]);
  return filtered.length > 0 ? filtered : teams;
}

function toTeamStub(team: NonNBATeam): NBATeam {
  return {
    id: team.tid,
    name: team.name,
    region: team.region,
    abbrev: team.abbrev ?? String(team.tid),
    conference: '',
    wins: 0,
    losses: 0,
    strength: 0,
    logoUrl: team.imgURL,
    colors: team.colors,
  };
}

function resolvePoolPortrait(member: StaffMember & { reputation?: number }, id: string, leagueId: string): string | undefined {
  if (member.playerPortraitUrl) return member.playerPortraitUrl;
  const nationality = String(member.nationality ?? '');
  if (leagueId === 'pba' || nationality.toLowerCase().includes('philippines')) {
    return getRegenPortraitUrl(`${id}-${member.name ?? ''}`, 'asian', { nationality: 'Philippines' })
      ?? getNewgenPortraitUrl(`${id}-${member.name ?? ''}`, 'male');
  }
  return undefined;
}

function freeAgentize(member: StaffMember & { reputation?: number }, id: string, leagueId: string): StaffPoolMember {
  return {
    ...member,
    id,
    leagueId,
    formerTeam: member.team ?? (member as any).formerTeam ?? '',
    formerTeamLogoUrl: member.teamLogoUrl ?? (member as any).formerTeamLogoUrl,
    formerRole: member.role ?? member.position ?? member.jobTitle ?? (member as any).formerRole,
    team: '',
    teamLogoUrl: undefined,
    playerPortraitUrl: resolvePoolPortrait(member, id, leagueId),
    isPlaceholder: true,
  };
}

export function toStaffFreeAgent(
  member: StaffMember & { reputation?: number },
  leagueId: string,
  id: string,
): StaffPoolMember {
  const poolRole = normalizeStaffPoolRole((member as any).role ?? member.position ?? member.jobTitle);
  return freeAgentize(
    {
      ...member,
      position: poolRole || member.position,
      jobTitle: poolRole || member.jobTitle,
    } as StaffMember & { reputation?: number },
    id,
    leagueId,
  );
}

export function generateInitialStaffPool(
  state: Pick<GameState, 'players' | 'nonNBATeams' | 'teams'>,
  leagueId: string,
  count = 50,
  masterSeed = 1,
): StaffMember[] {
  const teams = getLeagueTeams(state, leagueId);
  if (teams.length === 0) return [];
  const pool: StaffMember[] = [];
  let batch = 0;
  while (pool.length < count && batch < count * 2) {
    const team = teams[batch % teams.length];
    const tier: SetupTierLabel = batch % 5 === 0 ? 'Established' : 'MidTier';
    const six = seedStaffSix(toTeamStub(team), state, leagueId, tier, masterSeed + batch * 7919);
    for (const member of six) {
      if (pool.length >= count) break;
      pool.push(freeAgentize(member, `euro-staff-fa-${leagueId}-${masterSeed}-${pool.length}`, leagueId));
    }
    batch++;
  }
  return pool;
}

/** Single source of truth for the staff FA pool. Counts existing members per
 *  position+leagueId; tops up any position with < minPerPosition. Idempotent
 *  — safe to call at init, after every hire, monthly tick. Replaces the old
 *  random refill pattern that left positions empty for months. */
export function ensureStaffPoolDepth(
  state: GameState,
  leagueId: string,
  minPerPosition: number = MIN_FA_DEPTH_PER_POSITION,
): GameState {
  const teams = getLeagueTeams(state, leagueId);
  if (teams.length === 0) return state;
  const existing = state.staffFreeAgents ?? [];
  const counts = new Map<string, number>();
  for (const m of existing) {
    if ((m as any).leagueId !== leagueId) continue;
    const pos = m.position ?? m.jobTitle;
    if (!pos) continue;
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  const additions: StaffMember[] = [];
  const baseSeed = hashSeed(`${state.saveId ?? 'save'}-${leagueId}-depth-${existing.length}`);
  let nextSeed = baseSeed;
  for (const position of STAFF_POSITIONS) {
    const have = counts.get(position) ?? 0;
    const need = minPerPosition - have;
    if (need <= 0) continue;
    let added = 0;
    let attempts = 0;
    while (added < need && attempts < need * 6) {
      attempts++;
      nextSeed = (nextSeed + 9973) >>> 0;
      const team = teams[nextSeed % teams.length];
      const tier: SetupTierLabel = (nextSeed % 5 === 0) ? 'Established' : 'MidTier';
      const six = seedStaffSix(toTeamStub(team), state, leagueId, tier, nextSeed);
      const match = six.find(m => m.position === position);
      if (!match) continue;
      const id = `euro-staff-fa-${leagueId}-${position.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${nextSeed}`;
      additions.push(freeAgentize(match, id, leagueId));
      added++;
    }
  }
  if (additions.length === 0) return state;
  return { ...state, staffFreeAgents: [...existing, ...additions] };
}

export function refillStaffPool(
  state: GameState,
  leagueId: string,
  monthKey: string,
): GameState {
  const seed = hashSeed(`${state.saveId ?? 'save'}-${leagueId}-${monthKey}`);
  const count = 5 + (seed % 6);
  const additions = generateInitialStaffPool(state, leagueId, count, seed);
  if (additions.length === 0) return state;
  const seen = new Set((state.staffFreeAgents ?? []).map((member: any) => member.id ?? `${member.position}-${member.name}`));
  const fresh = additions.filter((member: any) => {
    const id = member.id ?? `${member.position}-${member.name}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return {
    ...state,
    staffFreeAgents: [...(state.staffFreeAgents ?? []), ...fresh],
  };
}
