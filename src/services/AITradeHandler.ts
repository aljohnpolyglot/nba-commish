/**
 * AITradeHandler.ts
 *
 * Autonomous AI-vs-AI trade logic.
 * Spec: multiseason_todo.md §2
 */

import type { GameState, NBAPlayer, NBATeam, DraftPick, TradeProposal } from '../types';
import { getCapThresholds, getTradeOutlook } from '../utils/salaryUtils';
import { SettingsManager } from './SettingsManager';

// ── §2a: Player value ─────────────────────────────────────────────────────────

function playerValue(p: NBAPlayer, currentYear: number): number {
  const age = p.age ?? 26;
  const rating = p.overallRating ?? 60;
  const yearsLeft = (p.contract?.exp ?? currentYear) - currentYear;

  const ageMult = age <= 24 ? 0.85 + age * 0.01
                : age <= 29 ? 1.0
                : Math.max(0.5, 1.0 - (age - 29) * 0.07);

  const contractMult = rating >= 75 ? 1.0 + yearsLeft * 0.03
                     : rating >= 65 ? 1.0
                     : Math.max(0.6, 1.0 - yearsLeft * 0.08);

  return rating * ageMult * contractMult;
}

// ── §2d: Pick values ──────────────────────────────────────────────────────────

function pickValue(_pick: DraftPick): number {
  return 45; // default mid first round; future: derive from lottery odds
}

// ── §2b: Team needs ───────────────────────────────────────────────────────────

function teamNeedsScore(roster: NBAPlayer[], isBuyer: boolean): Record<string, number> {
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  const scores: Record<string, number> = {};

  for (const pos of positions) {
    const capable = roster.filter(p =>
      (p.pos ?? '').includes(pos) && (p.overallRating ?? 0) >= 70
    ).length;
    let need = Math.max(0, Math.min(10, 10 - capable * 3));
    if (isBuyer) need = Math.min(10, need + 3);
    scores[pos] = need;
  }
  return scores;
}

// ── §2c: Value change ────────────────────────────────────────────────────────

function valueChange(
  receiving: { players: NBAPlayer[]; picks: DraftPick[] },
  giving: { players: NBAPlayer[]; picks: DraftPick[] },
  roster: NBAPlayer[],
  isBuyer: boolean,
  currentYear: number,
): number {
  const receivedValue = receiving.players.reduce((s, p) => s + playerValue(p, currentYear), 0)
    + receiving.picks.reduce((s, pk) => s + pickValue(pk), 0);
  const givenValue = giving.players.reduce((s, p) => s + playerValue(p, currentYear), 0)
    + giving.picks.reduce((s, pk) => s + pickValue(pk), 0);

  const needs = teamNeedsScore(roster, isBuyer);
  const needBonus = receiving.players.reduce((s, p) => {
    const pos = p.pos ?? 'SF';
    return s + (needs[pos] ?? 0) * 0.15;
  }, 0);

  return (receivedValue - givenValue) + needBonus;
}

// ── §2e: Proposal loop ────────────────────────────────────────────────────────

export function generateAIDayTradeProposals(state: GameState): TradeProposal[] {
  if (!SettingsManager.getSettings().allowAITrades) return [];

  const proposals: TradeProposal[] = [];
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const userTeamId = state.teams[0]?.id;
  const thresholds = getCapThresholds(state.leagueStats as any);

  const getOutlook = (t: NBATeam) => getTradeOutlook(
    state.players.filter(p => p.tid === t.id).reduce((s, p) => s + ((p.contract?.amount ?? 0) * 1_000_000), 0),
    (t as any).wins ?? 0,
    (t as any).losses ?? 0,
    state.players.filter(p => p.tid === t.id && ((p.contract?.exp ?? 0) <= currentYear)).length,
    thresholds,
  );

  const buyerTeams = state.teams.filter(t => t.id !== userTeamId && ['buyer', 'heavy_buyer'].includes(getOutlook(t).role));
  const sellerTeams = state.teams.filter(t => t.id !== userTeamId && !['buyer', 'heavy_buyer'].includes(getOutlook(t).role));

  if (buyerTeams.length === 0 || sellerTeams.length === 0) return [];

  let count = 0;
  for (const buyerTeam of buyerTeams) {
    if (count >= 3) break;

    const buyerRoster = state.players.filter(p => p.tid === buyerTeam.id);
    const buyerIsBuyer = true;

    for (const sellerTeam of sellerTeams) {
      const sellerRoster = state.players.filter(p => p.tid === sellerTeam.id)
        .sort((a, b) => playerValue(b, currentYear) - playerValue(a, currentYear));

      const targetPlayer = sellerRoster[1] ?? sellerRoster[0];
      if (!targetPlayer) continue;

      const buyerOfferPlayer = [...buyerRoster]
        .sort((a, b) => playerValue(a, currentYear) - playerValue(b, currentYear))
        .find(p => (p.overallRating ?? 0) >= 60);
      if (!buyerOfferPlayer) continue;

      const receiving = { players: [targetPlayer], picks: [] as DraftPick[] };
      const giving = { players: [buyerOfferPlayer], picks: [] as DraftPick[] };

      const buyerGain = valueChange(receiving, giving, buyerRoster, buyerIsBuyer, currentYear);
      const sellerGain = valueChange(
        { players: [buyerOfferPlayer], picks: [] },
        { players: [targetPlayer], picks: [] },
        sellerRoster, false, currentYear,
      );

      if (buyerGain >= -5 && sellerGain >= -5) {
        proposals.push({
          id: `ai-trade-${buyerTeam.id}-${sellerTeam.id}-${Date.now()}`,
          proposingTeamId: buyerTeam.id,
          receivingTeamId: sellerTeam.id,
          proposingGMName: 'AI GM',
          playersOffered: [buyerOfferPlayer.internalId],
          playersRequested: [targetPlayer.internalId],
          picksOffered: [],
          picksRequested: [],
          proposedDate: state.date,
          status: 'accepted',
          isAIvsAI: true,
        });
        count++;
        break;
      }
    }
  }

  return proposals;
}

/**
 * Process pending proposals: expire stale, auto-resolve AI-vs-AI.
 */
export function processAITradeProposals(
  existing: TradeProposal[],
  currentDate: string,
): TradeProposal[] {
  return existing.map(p => {
    if (p.status !== 'pending') return p;

    const diffDays = (new Date(currentDate).getTime() - new Date(p.proposedDate).getTime()) / 86_400_000;
    if (diffDays > 7) return { ...p, status: 'expired' as const };
    if (p.isAIvsAI) return { ...p, status: 'accepted' as const };

    return p;
  });
}
