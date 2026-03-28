/**
 * AITradeHandler.ts
 *
 * Handles autonomous AI-vs-AI trade logic between NBA teams.
 * Each AI GM evaluates its roster needs and proposes deals to other GMs.
 *
 * PLACEHOLDER — implementation pending.
 * The structure below mirrors how the real engine will work so callers
 * can already import and wire up the hooks.
 */

import type { GameState, NBAPlayer, NBATeam, DraftPick, TradeProposal } from '../types';
import { SettingsManager } from './SettingsManager';

// ── Value helpers (stubs — replace with real rating-based math) ───────────────

function playerValue(p: NBAPlayer): number {
  // TODO: factor in age, contract length, overallRating, positional scarcity
  return p.overallRating ?? 60;
}

function teamNeedsScore(team: NBATeam, roster: NBAPlayer[]): Record<string, number> {
  // TODO: analyze depth chart gaps by position
  // Returns a map of position → need score (0–10)
  return { PG: 5, SG: 5, SF: 5, PF: 5, C: 5 };
}

// ── Trade valuation ───────────────────────────────────────────────────────────

/**
 * Estimates how much Team B values a given set of assets from Team A.
 * Returns a positive number if B likes the deal, negative if it's bad for B.
 *
 * PLACEHOLDER — always returns 0 until real salary/rating math is in.
 */
function valueChange(
  _receivingTeamId: number,
  _offering: { players: NBAPlayer[]; picks: DraftPick[] },
  _requesting: { players: NBAPlayer[]; picks: DraftPick[] },
): number {
  // TODO: implement forward-selection value model (see BBGM makeItWork reference)
  return 0;
}

// ── Proposal generation ───────────────────────────────────────────────────────

/**
 * Generates a batch of AI trade proposals for one simulation day.
 * Only runs if `allowAITrades` is enabled in settings.
 *
 * @returns Array of new proposals to merge into state.tradeProposals
 */
export function generateAIDayTradeProposals(state: GameState): TradeProposal[] {
  if (!SettingsManager.getSettings().allowAITrades) return [];

  // TODO:
  // 1. For each AI team pair, compute valueChange for random asset bundles
  // 2. If both sides are at least neutral, create a TradeProposal with status 'accepted'
  //    and dispatch FORCE_TRADE to the store (or return it for the store to handle)
  // 3. If one side is the user's team (future feature), set status 'pending'
  //    so the user can approve/reject in TradeProposalsView

  return []; // placeholder — no proposals generated yet
}

/**
 * Processes all pending AI proposals: expire old ones, accept AI-vs-AI ones.
 * Call this once per simulated day.
 *
 * @returns Updated proposals array to replace state.tradeProposals
 */
export function processAITradeProposals(
  existing: TradeProposal[],
  currentDate: string,
): TradeProposal[] {
  return existing.map(p => {
    if (p.status !== 'pending') return p;

    // Expire after 7 in-game days
    const proposed = new Date(p.proposedDate);
    const current  = new Date(currentDate);
    const diffDays = (current.getTime() - proposed.getTime()) / 86_400_000;
    if (diffDays > 7) return { ...p, status: 'expired' as const };

    // AI-vs-AI proposals auto-resolve immediately (placeholder: always accept)
    if (p.isAIvsAI) return { ...p, status: 'accepted' as const };

    return p;
  });
}
