import { MoodTrait, TRAIT_EXCLUSIONS } from './moodTypes';

// Seeded LCG so trait generation is deterministic per player
function seededRandInt(seed: number, max: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return Math.floor((x - Math.floor(x)) * max);
}

const ALL_TRAITS: MoodTrait[] = [
  'DIVA', 'LOYAL', 'MERCENARY', 'COMPETITOR',
  'VOLATILE', 'AMBASSADOR', 'DRAMA_MAGNET',
];

function isExcluded(a: MoodTrait, b: MoodTrait): boolean {
  return TRAIT_EXCLUSIONS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
}

/**
 * Deterministically generates 1–2 mood traits for a player based on their internalId hash.
 * Always assigns exactly 1 trait; 50 % chance of a second (non-contradictory) trait.
 */
export function genMoodTraits(internalId: string): MoodTrait[] {
  // Simple string hash for determinism
  let seed = 0;
  for (let i = 0; i < internalId.length; i++) {
    seed = (seed * 31 + internalId.charCodeAt(i)) >>> 0;
  }

  const first = ALL_TRAITS[seededRandInt(seed, ALL_TRAITS.length)];
  const traits: MoodTrait[] = [first];

  // 50 % chance of second trait
  const secondRoll = (Math.sin(seed + 99) * 10000);
  if ((secondRoll - Math.floor(secondRoll)) > 0.5) {
    const candidates = ALL_TRAITS.filter(t => t !== first && !isExcluded(first, t));
    if (candidates.length > 0) {
      traits.push(candidates[seededRandInt(seed + 7, candidates.length)]);
    }
  }

  return traits.sort();
}
