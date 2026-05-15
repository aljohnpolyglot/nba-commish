/**
 * Newgen procedural portrait resolver.
 *
 * 14,000 256×256 PNG portraits hosted at
 *   https://github.com/aljohnpolyglot/nba-commish-portraits
 * served via jsDelivr.
 *
 * Use this to assign `player.imgURL` at spawn time. UI components already
 * render imgURL — no UI changes needed.
 */
import { NEWGEN_PORTRAIT_BASE, NEWGEN_MALE_IDS, NEWGEN_FEMALE_IDS } from '../data/newgenPortraits';

export type NewgenGender = 'male' | 'female';

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic portrait URL for a given seed + gender. Never returns null — always picks a face. */
export function getNewgenPortraitUrl(seed: string, gender: NewgenGender = 'male'): string {
  const pool = gender === 'female' ? NEWGEN_FEMALE_IDS : NEWGEN_MALE_IDS;
  const idx = hashString(seed) % pool.length;
  return `${NEWGEN_PORTRAIT_BASE}/portrait_${gender}-${pool[idx]}.png`;
}

/** Deterministic gate — returns true for ~ratio fraction of seeds. */
export function newgenRoll(seed: string, ratio: number): boolean {
  if (ratio >= 1) return true;
  if (ratio <= 0) return false;
  return (hashString(seed + '_gate') / 0xffffffff) < ratio;
}
