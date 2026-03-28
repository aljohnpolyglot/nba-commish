/**
 * AIFreeAgentHandler.ts
 *
 * Handles autonomous AI free-agent signings by NBA teams.
 * Each AI GM scans the free agent pool, evaluates player fit and contract
 * demands, and signs players when cap space allows.
 *
 * PLACEHOLDER — implementation pending.
 */

import type { GameState, NBAPlayer, NBATeam } from '../types';
import { SettingsManager } from './SettingsManager';

// ── Player fitness / mood helpers (stubs) ─────────────────────────────────────

/**
 * Rough mood score for a player joining a given team.
 * 0 = unwilling, 1 = neutral, 2 = eager.
 *
 * PLACEHOLDER — always returns neutral until mood system is wired.
 */
function playerMoodForTeam(_player: NBAPlayer, _team: NBATeam): number {
  // TODO: factor in market size, team performance, hype, loyalty,
  //       playing time opportunity — mirror BBGM moodComponents logic
  return 1;
}

/**
 * Returns the best available free agent for a given team, or null.
 * Mirrors BBGM's getBest() strategy — pick the highest-value player
 * the team can afford and who is willing to sign.
 */
function getBestFit(
  team: NBATeam,
  roster: NBAPlayer[],
  freeAgents: NBAPlayer[],
  maxCapSpace: number,
): NBAPlayer | null {
  // TODO:
  // 1. Filter FAs by contract.amount <= maxCapSpace
  // 2. Filter by roster need (positional depth)
  // 3. Filter by playerMoodForTeam >= 1
  // 4. Sort by overallRating desc, pick first
  return null; // placeholder
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Runs one round of AI free-agency signings.
 * Returns player mutations (new `tid` assignments) to apply to state.players.
 *
 * Only runs if `allowAIFreeAgency` is enabled in settings.
 *
 * @returns Map of internalId → new teamId for signed players
 */
export function runAIFreeAgencyRound(
  state: GameState,
): Map<string, number> {
  const signed = new Map<string, number>();

  if (!SettingsManager.getSettings().allowAIFreeAgency) return signed;

  const freeAgents = state.players.filter(p => p.tid < 0 && p.status === 'Free Agent');
  if (freeAgents.length === 0) return signed;

  // TODO:
  // 1. Shuffle AI teams (user's team is never auto-signed)
  // 2. For each team with roster space & cap room, call getBestFit()
  // 3. If a player is found: signed.set(player.internalId, team.id)
  // 4. Remove signed player from freeAgents pool before next team
  // 5. Add transaction entry to state.history

  return signed; // placeholder — no signings happen yet
}
