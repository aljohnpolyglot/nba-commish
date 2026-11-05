import type { GameState, NBATeam, NonNBATeam, SetupTierLabel, StaffMember } from '../../types';
import { seedStaffSix } from './staffSeed';
import { createPortraitUsageSet, getRegenPortraitUrl } from '../../utils/newgenPortrait';
import { getNameData } from '../../data/nameDataFetcher';
import { FICTIONAL_STAFF_LEAGUE_ID, generateFictionalStaffPool } from '../fictionalStaffGenerator';
import { EURO_BASKETBALL_SOURCE_ARCHIVES } from '../../data/euroBasketballSources';
import { getSimulationSeed } from '../saveIdentity';

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

const EURO_STAFF_POSITIONS = [...STAFF_POSITIONS, 'Head of Academy', 'Regional Scout'] as const;
const EURO_STAFF_LEAGUE_IDS = new Set([
  'euroleague',
  'endesa',
  ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.leagueId),
]);

export const isEuroStaffLeagueId = (leagueId: string): boolean => EURO_STAFF_LEAGUE_IDS.has(leagueId);

const positionsForLeague = (leagueId: string): readonly string[] => (
  EURO_STAFF_LEAGUE_IDS.has(leagueId) ? EURO_STAFF_POSITIONS : STAFF_POSITIONS
);

/** Minimum unemployed FAs per position per league. Source candidates are preferred in UI; seeded staff provide long-save depth. */
export const MIN_FA_DEPTH_PER_POSITION = 10;
export const STAFF_CANDIDATE_FALLBACK_DEPTH = 12;

export function mergeStaffCandidateBuckets<T extends { name: string }>(buckets: {
  retired: T[];
  source: T[];
  directory: T[];
  generated: T[];
}): T[] {
  const merged: T[] = [];
  const seen = new Set<string>();
  const append = (candidate: T) => {
    const key = String(candidate.name ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(candidate);
  };
  buckets.retired.forEach(append);
  buckets.source.forEach(append);
  buckets.directory.forEach(append);
  buckets.generated.forEach(append);
  return merged;
}

export function hasStaffPoolDepth(
  members: StaffMember[] | undefined,
  leagueId: string,
  minPerPosition = MIN_FA_DEPTH_PER_POSITION,
): boolean {
  const counts = new Map<string, number>();
  for (const member of members ?? []) {
    if ((member as StaffPoolMember).leagueId !== leagueId) continue;
    const position = normalizeStaffPoolRole(member.position ?? member.jobTitle ?? member.role);
    if (!position) continue;
    counts.set(position, (counts.get(position) ?? 0) + 1);
  }
  return positionsForLeague(leagueId).every(position => (counts.get(position) ?? 0) >= minPerPosition);
}

const LEAGUE_TID_RANGES: Record<string, [number, number]> = {
  nba: [0, 100],
  euroleague: [1000, 1100],
  pba: [2000, 2100],
  endesa: [5000, 5100],
  wnba: [3000, 3100],
  bleague: [4000, 4100],
  gleague: [16000, 17000],
  chinacba: [17000, 18000],
  nblaus: [18000, 19000],
};

const tidRangeForLeague = (leagueId: string): [number, number] | undefined => {
  const source = EURO_BASKETBALL_SOURCE_ARCHIVES.find(entry => entry.leagueId === leagueId);
  return source ? [source.teamTidOffset, source.teamTidOffset + 1000] : LEAGUE_TID_RANGES[leagueId];
};

const leagueIdFromLabel = (value?: string): string | null => {
  const label = String(value ?? '').trim().toLowerCase();
  if (!label) return null;
  if (label.includes('euroleague')) return 'euroleague';
  if (label.includes('endesa') || label.includes('liga acb')) return 'endesa';
  if (label.includes('g-league') || label.includes('g league')) return 'gleague';
  if (label.includes('china cba') || label === 'cba') return 'chinacba';
  if (label.includes('nbl australia')) return 'nblaus';
  if (label.includes('b-league') || label.includes('b.league')) return 'bleague';
  const source = EURO_BASKETBALL_SOURCE_ARCHIVES.find(entry => (
    [entry.leagueId, entry.leagueStatus, entry.displayName, entry.shortName]
      .some(candidate => String(candidate).toLowerCase() === label)
  ));
  return source?.leagueId ?? null;
};

export function inferEuroStaffLeagueId(
  teamId: number,
  leagueType?: GameState['leagueType'],
  context?: { teamLeague?: string; uiMode?: string },
): string {
  if (leagueType === 'fictional') return FICTIONAL_STAFF_LEAGUE_ID;
  const explicitLeagueId = leagueIdFromLabel(context?.teamLeague);
  if (explicitLeagueId) return explicitLeagueId;
  if (teamId >= 0 && teamId < 100) return 'nba';
  if (teamId >= 1000 && teamId < 1100) return 'euroleague';
  if (teamId >= 2000 && teamId < 2100) return 'pba';
  if (teamId >= 4000 && teamId < 4100) return 'bleague';
  if (teamId >= 5000 && teamId < 5100) return 'endesa';
  if (context?.uiMode === 'euro_isolated') {
    const source = EURO_BASKETBALL_SOURCE_ARCHIVES.find(entry => (
      teamId >= entry.teamTidOffset && teamId < entry.teamTidOffset + 1000
    ));
    if (source) return source.leagueId;
  }
  if (teamId >= 16000 && teamId < 17000) return 'gleague';
  if (teamId >= 17000 && teamId < 18000) return 'chinacba';
  if (teamId >= 18000 && teamId < 19000) return 'nblaus';
  const source = EURO_BASKETBALL_SOURCE_ARCHIVES.find(entry => (
    teamId >= entry.teamTidOffset && teamId < entry.teamTidOffset + 1000
  ));
  if (source) return source.leagueId;
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

export function getStaffAskProfile(member: Partial<StaffMember>, identity: string) {
  const salaryRoll = hashSeed(`${identity}-salary`) / 0xffffffff;
  const yearsRoll = hashSeed(`${identity}-years`);
  const bonusRoll = hashSeed(`${identity}-bonus`) / 0xffffffff;
  return {
    salaryAskMultiplier: member.salaryAskMultiplier ?? 0.82 + salaryRoll * 0.46,
    salaryAskYears: member.salaryAskYears ?? 1 + (yearsRoll % 4),
    salaryAskBonusRate: member.salaryAskBonusRate ?? (bonusRoll < 0.28 ? 0 : 0.05 + bonusRoll * 0.2),
  };
}

function getLeagueTeams(state: Pick<GameState, 'nonNBATeams' | 'teams'>, leagueId: string): NonNBATeam[] {
  // NBA pool draws from the NBA roster. We coerce NBATeam → NonNBATeam-ish for
  // the downstream seedStaffSix helper which only reads {tid, name, region, abbrev, imgURL}.
  if (leagueId === 'nba' || leagueId === FICTIONAL_STAFF_LEAGUE_ID) {
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
  const source = EURO_BASKETBALL_SOURCE_ARCHIVES.find(entry => entry.leagueId === leagueId);
  if (source) {
    const byLeague = teams.filter(team => team.league === source.leagueStatus);
    if (byLeague.length > 0) return byLeague;
  }
  const range = tidRangeForLeague(leagueId);
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

function resolvePoolPortrait(member: StaffMember & { reputation?: number }, id: string, leagueId: string, usedPortraitUrls?: Set<string>): string | undefined {
  if (member.playerPortraitUrl) return member.playerPortraitUrl;
  const nationality = String(member.nationality ?? '');
  if (leagueId === 'pba' || nationality.toLowerCase().includes('philippines')) {
    return getRegenPortraitUrl(`${id}-${member.name ?? ''}`, 'asian', {
      nationality: 'Philippines',
      kind: 'staff',
      usedPortraitUrls,
    }) ?? undefined;
  }
  return undefined;
}

function pbaPoolRating(member: StaffMember & { reputation?: number }): number {
  const rating = Number((member as any).rating ?? member.reputation ?? 52);
  return Math.max(42, Math.min(64, Math.round(Number.isFinite(rating) ? rating : 52)));
}

function freeAgentize(member: StaffMember & { reputation?: number }, id: string, leagueId: string, usedPortraitUrls?: Set<string>): StaffPoolMember {
  const pbaRating = leagueId === 'pba' ? pbaPoolRating(member) : undefined;
  const askProfile = getStaffAskProfile(member, id);
  return {
    ...member,
    ...askProfile,
    id,
    leagueId,
    ...(pbaRating != null ? { rating: pbaRating, reputation: pbaRating, staffImageId: undefined } : {}),
    formerTeam: member.team ?? (member as any).formerTeam ?? '',
    formerTeamLogoUrl: member.teamLogoUrl ?? (member as any).formerTeamLogoUrl,
    formerRole: member.role ?? member.position ?? member.jobTitle ?? (member as any).formerRole,
    team: '',
    teamLogoUrl: undefined,
    playerPortraitUrl: resolvePoolPortrait({ ...member, ...(pbaRating != null ? { rating: pbaRating, reputation: pbaRating } : {}) }, id, leagueId, usedPortraitUrls),
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
  const currentYear = (state as Partial<GameState>).leagueStats?.year ?? 2026;
  const usedPortraitUrls = createPortraitUsageSet((state.players ?? []).map(player => player.imgURL));
  if (leagueId === FICTIONAL_STAFF_LEAGUE_ID) {
    const perRole = Math.max(1, Math.ceil(count / STAFF_POSITIONS.length));
    const playerPool = (state as Partial<GameState>).leagueStats?.fictionalPlayerPool;
    const genderMode = playerPool === 'womens' ? 'female' : playerPool === 'mixed' ? 'mixed' : 'male';
    return generateFictionalStaffPool(getNameData(), currentYear, masterSeed, perRole, usedPortraitUrls, genderMode).slice(0, count);
  }
  const pool: StaffMember[] = [];
  let batch = 0;
  while (pool.length < count && batch < count * 2) {
    const team = teams[batch % teams.length];
    const tier: SetupTierLabel = batch % 5 === 0 ? 'Established' : 'MidTier';
    const six = seedStaffSix(toTeamStub(team), state, leagueId, tier, masterSeed + batch * 7919, currentYear);
    for (const member of six) {
      if (pool.length >= count) break;
      pool.push(freeAgentize(member, `euro-staff-fa-${leagueId}-${masterSeed}-${pool.length}`, leagueId, usedPortraitUrls));
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
  const existing = (state.staffFreeAgents ?? []).map(rawMember => {
    const member = {
      ...rawMember,
      ...getStaffAskProfile(rawMember, rawMember.id ?? `${leagueId}-${rawMember.position}-${rawMember.name}`),
    };
    const poolRole = normalizeStaffPoolRole(member.position ?? member.jobTitle ?? member.role);
    const generatedSpecialist = EURO_STAFF_LEAGUE_IDS.has(leagueId)
      && (poolRole === 'Head of Academy' || poolRole === 'Regional Scout')
      && Number((member as any).academySpecialistRatingVersion ?? 0) < 1
      && (member.isPlaceholder === true || String(member.id ?? '').startsWith('euro-staff-fa-'));
    if (generatedSpecialist) {
      const current = Number(member.rating ?? member.reputation ?? 55);
      const rating = Math.max(60, Math.min(99, Math.round((Number.isFinite(current) ? current : 55) + 8)));
      return { ...member, rating, reputation: rating, academySpecialistRatingVersion: 1 };
    }
    const generatedChiefScout = EURO_STAFF_LEAGUE_IDS.has(leagueId)
      && poolRole === 'Chief Scout'
      && Number((member as any).chiefScoutRatingVersion ?? 0) < 1
      && (member.isPlaceholder === true || String(member.id ?? '').startsWith('euro-staff-fa-'));
    if (generatedChiefScout) {
      const current = Number(member.rating ?? member.reputation ?? 55);
      const rating = Math.max(65, Math.min(99, Math.round((Number.isFinite(current) ? current : 55) + 10)));
      return { ...member, rating, reputation: rating, chiefScoutRatingVersion: 1 };
    }
    const generatedAnalytics = leagueId !== 'pba'
      && poolRole === 'Head of Analytics'
      && Number((member as any).analyticsSpecialistRatingVersion ?? 0) < 1
      && (member.isPlaceholder === true || String(member.id ?? '').startsWith('euro-staff-fa-'));
    if (generatedAnalytics) {
      const current = Number(member.rating ?? member.reputation ?? 55);
      const rating = Math.max(65, Math.min(90, Math.round((Number.isFinite(current) ? current : 55) + 12)));
      return { ...member, rating, reputation: rating, analyticsSpecialistRatingVersion: 1 };
    }
    if (
      member.leagueId === leagueId
      && leagueId !== 'pba'
      && !Number.isFinite(Number(member.rating))
      && Number.isFinite(Number(member.reputation))
      && (member.isPlaceholder === true || String(member.id ?? '').startsWith('euro-staff-fa-'))
    ) {
      return { ...member, rating: Math.round(Number(member.reputation)) };
    }
    return member;
  });
  const existingChanged = existing.some((member, index) => member !== state.staffFreeAgents?.[index]);
  const usedPortraitUrls = createPortraitUsageSet([
    ...(state.players ?? []).map(player => player.imgURL),
    ...existing.map(member => member.playerPortraitUrl),
    ...(state.staff?.owners ?? []).map(member => member.playerPortraitUrl),
    ...(state.staff?.gms ?? []).map(member => member.playerPortraitUrl),
    ...(state.staff?.coaches ?? []).map(member => member.playerPortraitUrl),
    ...(state.staff?.leagueOffice ?? []).map(member => member.playerPortraitUrl),
    ...(state.teams ?? []).flatMap(team => (team.tycoon?.staffMembers ?? []).map(member => member.playerPortraitUrl)),
  ]);
  const counts = new Map<string, number>();
  for (const m of existing) {
    if ((m as any).leagueId !== leagueId) continue;
    const pos = m.position ?? m.jobTitle;
    if (!pos) continue;
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  const additions: StaffMember[] = [];
  const baseSeed = hashSeed(`${getSimulationSeed(state)}-${leagueId}-depth-${existing.length}`);
  if (leagueId === FICTIONAL_STAFF_LEAGUE_ID) {
    const generated = generateFictionalStaffPool(
      getNameData(),
      state.leagueStats?.year ?? new Date().getFullYear(),
      baseSeed,
      minPerPosition,
      usedPortraitUrls,
      state.leagueStats?.fictionalPlayerPool === 'womens'
        ? 'female'
        : state.leagueStats?.fictionalPlayerPool === 'mixed'
          ? 'mixed'
          : 'male',
    );
    for (const position of STAFF_POSITIONS) {
      let need = minPerPosition - (counts.get(position) ?? 0);
      if (need <= 0) continue;
      for (const member of generated) {
        if (need <= 0) break;
        if (normalizeStaffPoolRole(member.position ?? member.jobTitle ?? member.role) !== position) continue;
        additions.push(member);
        need--;
      }
    }
    return additions.length > 0 || existingChanged
      ? { ...state, staffFreeAgents: [...existing, ...additions] }
      : state;
  }
  let nextSeed = baseSeed;
  for (const position of positionsForLeague(leagueId)) {
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
      const six = seedStaffSix(toTeamStub(team), state, leagueId, tier, nextSeed, state.leagueStats?.year ?? 2026);
      const match = six.find(m => m.position === position);
      if (!match) continue;
      const id = `euro-staff-fa-${leagueId}-${position.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${nextSeed}`;
      additions.push(freeAgentize(match, id, leagueId, usedPortraitUrls));
      added++;
    }
  }
  if (additions.length === 0) {
    return existingChanged
      ? { ...state, staffFreeAgents: existing }
      : state;
  }
  return { ...state, staffFreeAgents: [...existing, ...additions] };
}

export function refillStaffPool(
  state: GameState,
  leagueId: string,
  monthKey: string,
): GameState {
  const seed = hashSeed(`${getSimulationSeed(state)}-${leagueId}-${monthKey}`);
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
