/** Deterministic hash-based RNG from a string seed. Returns [0, 1). */
export function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** Fisher-Yates shuffle with seeded RNG. Returns a new shuffled array. */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + '_' + i) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
