import { getNameData } from '../../data/nameDataFetcher';
import { getTeamCountry } from '../../utils/teamCountry';
import { buildCoachNationalityPool } from './nationalityPool';
import { generate as generateFaceRaw } from 'facesjs';
import type {
  GameState,
  NBATeam,
  OwnerPatience,
  OwnerProfile,
  OwnerVision,
  OwnerWealthTier,
  SetupTierLabel,
} from '../../types';

const TIER_DEFAULTS: Record<SetupTierLabel, {
  wealth: Array<[OwnerWealthTier, number]>;
  patience: Array<[OwnerPatience, number]>;
  vision: Array<[OwnerVision, number]>;
}> = {
  Powerhouse: {
    wealth: [['Billionaire', 0.7], ['NationalMagnate', 0.25], ['LocalWealthy', 0.05]],
    patience: [['LongTerm', 0.55], ['Steady', 0.3], ['TriggerHappy', 0.15]],
    vision: [['WinNow', 0.65], ['Develop', 0.2], ['Frugal', 0.15]],
  },
  Established: {
    wealth: [['NationalMagnate', 0.55], ['Billionaire', 0.25], ['LocalWealthy', 0.2]],
    patience: [['Steady', 0.5], ['LongTerm', 0.3], ['TriggerHappy', 0.2]],
    vision: [['WinNow', 0.4], ['Develop', 0.4], ['Frugal', 0.2]],
  },
  MidTier: {
    wealth: [['LocalWealthy', 0.5], ['NationalMagnate', 0.4], ['Billionaire', 0.1]],
    patience: [['Steady', 0.45], ['TriggerHappy', 0.3], ['LongTerm', 0.25]],
    vision: [['Develop', 0.45], ['WinNow', 0.3], ['Frugal', 0.25]],
  },
  Underdog: {
    wealth: [['LocalWealthy', 0.6], ['NationalMagnate', 0.35], ['Billionaire', 0.05]],
    patience: [['TriggerHappy', 0.4], ['Steady', 0.4], ['LongTerm', 0.2]],
    vision: [['Frugal', 0.45], ['Develop', 0.35], ['WinNow', 0.2]],
  },
};

function rngFromSeed(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function weightedDraw<T>(table: Array<[T, number]>, rng: () => number): T {
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of table) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return table[table.length - 1][0];
}

function weightedCountry(pool: { country: string; weight: number }[], rng: () => number): string {
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
  const firsts = Object.keys(countryData?.first ?? {});
  const lasts = Object.keys(countryData?.last ?? {});
  if (firsts.length === 0 || lasts.length === 0) return `${country} Owner`;
  const first = firsts[Math.floor(rng() * firsts.length)];
  const last = lasts[Math.floor(rng() * lasts.length)];
  return `${first} ${last}`;
}

export function seedOwner(
  team: NBATeam,
  state: Pick<GameState, 'players' | 'nonNBATeams'>,
  leagueId: string,
  tier: SetupTierLabel,
  subSeed: number,
): OwnerProfile {
  const tid = (team as any).id ?? (team as any).tid ?? 0;
  const rng = rngFromSeed(subSeed ^ (tid << 4));
  const normalizedTeam = { ...team, id: tid };
  const pool = buildCoachNationalityPool(state as Pick<GameState, 'players'>, leagueId);
  const homeCountry = getTeamCountry(normalizedTeam, state);
  const nationality = homeCountry && rng() < 0.7 ? homeCountry : weightedCountry(pool, rng);
  const defaults = TIER_DEFAULTS[tier];

  // Generate a facesjs config so the Owner card has a recognizable cartoon
  // portrait instead of an indexed Staff{N}.png (those rendered as squished
  // logo-like images in the small 14×16 frame). Keeps staffImageId around
  // for the OwnerProfile shape — the UI now prefers face when present.
  let ownerFace: any;
  try {
    ownerFace = generateFaceRaw({
      jersey: { id: 'suit' },
      accessories: { id: 'none' },
    } as any);
  } catch {
    ownerFace = undefined;
  }
  return {
    name: pickName(nationality, rng),
    nationality,
    face: ownerFace,
    staffImageId: Math.floor(rng() * 948) + 1,
    wealthTier: weightedDraw(defaults.wealth, rng),
    patience: weightedDraw(defaults.patience, rng),
    vision: weightedDraw(defaults.vision, rng),
    cashInjectionUsedThisSeason: false,
    seasonsSinceLastInjection: 0,
    consecutiveBadSeasons: 0,
  };
}
