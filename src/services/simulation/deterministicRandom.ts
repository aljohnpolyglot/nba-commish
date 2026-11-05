const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const createDeterministicRandom = (seed: string): (() => number) => {
  let value = hashSeed(seed) || 1;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Compatibility boundary for legacy synchronous services that still consume
 * Math.random. The original function is restored before control can yield.
 */
export const withDeterministicRandom = <T>(seed: string, run: () => T): T => {
  const originalRandom = Math.random;
  const deterministicRandom = createDeterministicRandom(seed);
  Math.random = deterministicRandom;
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
};
