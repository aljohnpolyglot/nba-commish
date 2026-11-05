import { getNameData } from '../../data/nameDataFetcher';
import { getTeamCountry } from '../../utils/teamCountry';
import { buildCoachNationalityPool } from './nationalityPool';
import { deterministicStaffImageId } from '../../utils/staffPortrait';
import { getTeamFullName } from '../../utils/teamNames';
import type { GameState, NBATeam, SetupTierLabel, StaffMember } from '../../types';
import { resolveEraAwareStaffRating } from '../era/basketballEraRules';

const ROLES = [
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

const EURO_ACADEMY_ROLES = [
  'Head of Academy',
  'Regional Scout',
  'Regional Scout 2',
  'Regional Scout 3',
  'Regional Scout 4',
] as const;

const TIER_REP_BASE: Record<SetupTierLabel, number> = {
  Powerhouse: 70,
  Established: 60,
  MidTier: 55,
  Underdog: 50,
};

const LOCAL_HIRE_PROBABILITY = 0.55;

function rngFromSeed(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function weightedPick(pool: { country: string; weight: number }[], rng: () => number): string {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.country;
  }
  return pool[pool.length - 1]?.country ?? 'USA';
}

function pickName(country: string, rng: () => number): string {
  const nameData = getNameData() as any;
  const countryData = nameData.countries?.[country] ?? nameData.countries?.USA;
  const firstPool = Object.keys(countryData?.first ?? {});
  const lastPool = Object.keys(countryData?.last ?? {});
  if (firstPool.length === 0 || lastPool.length === 0) return `${country} Staff`;
  const first = firstPool[Math.floor(rng() * firstPool.length)];
  const last = lastPool[Math.floor(rng() * lastPool.length)];
  return `${first} ${last}`;
}

export function seedStaffSix(
  team: NBATeam,
  state: Pick<GameState, 'players' | 'nonNBATeams'>,
  leagueId: string,
  tier: SetupTierLabel,
  subSeed: number,
  currentYear = 2026,
): Array<StaffMember & { reputation: number }> {
  const tid = (team as any).id ?? (team as any).tid ?? 0;
  const rng = rngFromSeed(subSeed ^ tid);
  const normalizedTeam = { ...team, id: tid };
  const nationalityPool = buildCoachNationalityPool(state as Pick<GameState, 'players'>, leagueId);
  const homeCountry = getTeamCountry(normalizedTeam, state);
  const repBase = leagueId === 'pba'
    ? Math.max(38, TIER_REP_BASE[tier] - 14)
    : TIER_REP_BASE[tier];
  const label = getTeamFullName(normalizedTeam);

  const roles: readonly string[] = leagueId !== 'pba' && leagueId !== 'nba'
    ? [...ROLES, ...EURO_ACADEMY_ROLES]
    : ROLES;

  return roles.map(role => {
    const country = homeCountry && rng() < LOCAL_HIRE_PROBABILITY
      ? homeCountry
      : weightedPick(nationalityPool, rng);
    const developmentBonus = role === 'Player Development Coach' && leagueId !== 'pba'
      ? 8 + (rng() < 0.18 ? 7 : 0)
      : 0;
    const academySpecialist = EURO_ACADEMY_ROLES.includes(role as typeof EURO_ACADEMY_ROLES[number]);
    const chiefScoutSpecialist = role === 'Chief Scout' && leagueId !== 'pba' && leagueId !== 'nba';
    const analyticsSpecialist = role === 'Head of Analytics' && leagueId !== 'pba';
    const academyBase = {
      Powerhouse: 82,
      Established: 77,
      MidTier: 72,
      Underdog: 67,
    }[tier];
    const ratingRoll = rng();
    const fallbackRating = academySpecialist || chiefScoutSpecialist || analyticsSpecialist
      ? Math.max(60, Math.min(99, academyBase + Math.floor(ratingRoll * 17) - 8 + (rng() < 0.12 ? 8 : 0)))
      : Math.max(40, Math.min(99, repBase + developmentBonus + Math.floor(ratingRoll * 21) - 10));
    const tierOffset = (TIER_REP_BASE[tier] - TIER_REP_BASE.Established) * 0.2;
    const reputation = resolveEraAwareStaffRating(role, currentYear, ratingRoll, fallbackRating, tierOffset);
    const tenureRoll = rng();
    const yearsWithTeam = tenureRoll < 0.5
      ? 1
      : tenureRoll < 0.85
      ? Math.floor(rng() * 4) + 2
      : Math.floor(rng() * 6) + 5;
    const contractYears = leagueId === 'pba'
      ? (role === 'Head Coach' ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2))
      : Math.max(1, Math.floor(rng() * 3) + 1);
    const careerStartYear = currentYear - (yearsWithTeam + Math.floor(rng() * 18) + 4);
    const bornYear = careerStartYear - (Math.floor(rng() * 12) + 28);

    const name = pickName(country, rng);
    return {
      name,
      team: label,
      position: role,
      jobTitle: role,
      teamLogoUrl: team.logoUrl,
      nationality: country,
      bornYear,
      careerStartYear,
      yearsWithTeam,
      contractYears,
      isPlaceholder: true,
      rating: reputation,
      reputation,
      ...(academySpecialist ? { academySpecialistRatingVersion: 1 } : {}),
      ...(chiefScoutSpecialist ? { chiefScoutRatingVersion: 1 } : {}),
      ...(analyticsSpecialist ? { analyticsSpecialistRatingVersion: 1 } : {}),
      staffImageId: deterministicStaffImageId(name),
    };
  });
}
