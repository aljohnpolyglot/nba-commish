/**
 * Durability helpers — single source of truth for the injury-history-based
 * durability rating shown in PlayerBioInjuriesTab, PlayerBioRatingsTab, and
 * PlayerRatingsView. Overrides K2's computed AT.sub[6] ("Durability") so all
 * surfaces agree.
 */

import { getPlayerInjuryProfile } from '../data/playerInjuryData';
import type { NBAPlayer } from '../types';
import type { K2Data } from '../services/simulation/convert2kAttributes';

/**
 * Derive a 0–99 durability from career injury count relative to games played.
 * 0 injuries → 99, ~20 per 100 GP → ~0. Falls back to 75 when no career GP.
 */
export function computeDurability(careerCount: number, careerGP: number): number {
  if (careerGP <= 0) return 75;
  const per100 = (careerCount / careerGP) * 100;
  return Math.max(0, Math.min(99, Math.round(99 - per100 * 5)));
}

/**
 * Resolve the real durability for a player. Priority:
 *   1. `player.durability` explicit override
 *   2. Injury-profile–derived value (`computeDurability(careerCount, careerGP)`)
 *   3. `null` when no data is available — callers may substitute a default.
 */
export function getRealDurability(player: NBAPlayer): number | null {
  if ((player as any).durability != null) return (player as any).durability;
  const profile = getPlayerInjuryProfile(player.name);
  if (!profile) return null;
  const careerGP = (player.stats ?? [])
    .filter((s: any) => !s.playoffs && (s.tid ?? -1) >= 0)
    .reduce((sum: number, s: any) => sum + (s.gp ?? 0), 0);
  return computeDurability(profile.careerCount, careerGP);
}

/**
 * Returns a durability-adjusted K2Data: writes the injury-history durability into
 * `MI.sub[0]` (the Misc category). AT.sub[6] ("Toughness") is the body-frame
 * endurance stat and stays untouched. When `realDurability` is null, MI.sub[0]
 * falls back to whatever calculateK2 produced (default 75). Floor is 0 so
 * Glass-tier durability renders accurately.
 */
export function applyDurabilityToK2(k2: K2Data, realDurability: number | null): K2Data {
  if (realDurability == null) return k2;
  const clamped = Math.max(0, Math.min(99, realDurability));
  return {
    ...k2,
    MI: { sub: [clamped], ovr: clamped },
  };
}

/** Color tier for durability rating (matches PlayerBioInjuriesTab). */
export function durabilityColor(val: number): string {
  if (val >= 80) return '#22c55e';
  if (val >= 60) return '#eab308';
  if (val >= 40) return '#f97316';
  return '#f43f5e';
}

/** Human label tier for durability. */
export function durabilityLabel(val: number): string {
  if (val >= 90) return 'Iron Man';
  if (val >= 75) return 'Durable';
  if (val >= 60) return 'Average';
  if (val >= 45) return 'Fragile';
  if (val >= 30) return 'Injury-Prone';
  return 'Glass';
}
