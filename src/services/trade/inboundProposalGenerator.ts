/**
 * inboundProposalGenerator.ts
 *
 * Given a team's trading block (players + picks), scan every other team and
 * build legal, TV-balanced trade proposals targeting those assets. Produces
 * 1-for-1 through 3-for-3 combinations with ±15% TV parity so neither side
 * feels fleeced.
 *
 * Used by the Trade Proposals view (GM mode) — "Generate Offers" from the
 * user's Trading Block page.
 */

import type { NBAPlayer, NBATeam, DraftPick, TradeProposal } from '../../types';
import {
  calcOvr2K, calcPlayerTV, calcPickTV, isUntouchable, type TeamMode,
} from './tradeValueEngine';

const EXTERNAL = new Set(['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'Draft Prospect', 'Prospect']);

const TV_PARITY_TOLERANCE = 0.15;    // ±15% on either side = "fair" trade
const MAX_COMBO_SIZE = 3;            // up to 3 players per side
const MAX_PROPOSALS_PER_TEAM = 2;    // keep the inbox readable
const MAX_TOTAL_PROPOSALS = 20;      // overall cap

function roleToMode(role: string): TeamMode {
  if (role === 'heavy_buyer' || role === 'buyer') return 'contend';
  if (role === 'rebuilding') return 'presti';
  return 'rebuild';
}

/** Salary parity for same-team out/in — 125% cap rule approximation. */
function salariesFit(outSalaryUSD: number, inSalaryUSD: number): boolean {
  if (outSalaryUSD === 0 || inSalaryUSD === 0) return true; // at least one side is pure picks/cap-relief
  // Real CBA: incoming ≤ 125% + $100K for over-cap teams. We use ±25% symmetrical as a lenient approximation.
  const ratio = Math.max(outSalaryUSD, inSalaryUSD) / Math.min(outSalaryUSD, inSalaryUSD);
  return ratio <= 1.30;
}

/** Generate all k-combinations of arr (k ≤ MAX_COMBO_SIZE). */
function* combos<T>(arr: T[], k: number, start = 0, current: T[] = []): Generator<T[]> {
  if (current.length === k) { yield [...current]; return; }
  for (let i = start; i < arr.length; i++) {
    current.push(arr[i]);
    yield* combos(arr, k, i + 1, current);
    current.pop();
  }
}

export interface InboundProposalInput {
  userTid: number;
  userGMName?: string;
  /** internalIds of user's players on the trading block */
  blockPlayerIds: string[];
  /** dpids of user's picks on the trading block */
  blockPickIds: number[];
  players: NBAPlayer[];
  teams: NBATeam[];
  draftPicks: DraftPick[];
  currentYear: number;
  /** Minimum tradable draft season (past drafts are off-limits) */
  minTradableSeason: number;
  /** tid → { role } from getTradeOutlook */
  teamOutlooks: Map<number, { role: string }>;
  /** When the proposal is dated — usually state.date */
  proposedDate: string;
}

/** Shape of a generated proposal (before id/status are assigned by caller). */
interface RawProposal {
  proposingTeamId: number;
  proposingGMName: string;
  playersOffered: string[];   // from the other team (they're proposing)
  playersRequested: string[]; // from user
  picksOffered: number[];
  picksRequested: number[];
  offerTV: number;
  requestTV: number;
  fitScore: number;           // higher = tighter parity + better need match
}

export function generateInboundProposalsForUser(input: InboundProposalInput): TradeProposal[] {
  const {
    userTid, userGMName, blockPlayerIds, blockPickIds,
    players, teams, draftPicks, currentYear, minTradableSeason,
    teamOutlooks, proposedDate,
  } = input;

  // ── Resolve user's block assets ────────────────────────────────────────────
  const userMode: TeamMode = roleToMode(teamOutlooks.get(userTid)?.role ?? 'neutral');
  const userBlockPlayers = players.filter(p => p.tid === userTid && blockPlayerIds.includes(p.internalId));
  const userBlockPicks = draftPicks.filter(dp => dp.tid === userTid && blockPickIds.includes(dp.dpid));

  if (userBlockPlayers.length === 0 && userBlockPicks.length === 0) return [];

  const userPlayerTVs = new Map(userBlockPlayers.map(p => [p.internalId, calcPlayerTV(p, userMode, currentYear)]));
  const userPickTVs = new Map(userBlockPicks.map(dp => [
    dp.dpid,
    calcPickTV(dp.round, 15, teams.length, Math.max(1, dp.season - currentYear)),
  ]));

  const proposals: RawProposal[] = [];

  // ── For each other team, try building trades around their block/roster ────
  for (const team of teams) {
    if (team.id === userTid) continue;

    const theirOutlook = teamOutlooks.get(team.id) ?? { role: 'neutral' };
    const theirMode = roleToMode(theirOutlook.role);

    // Their tradeable roster — non-external, non-untouchable from their POV.
    const theirRoster = players
      .filter(p => p.tid === team.id && !EXTERNAL.has(p.status ?? ''))
      .filter(p => !isUntouchable(p, theirMode, currentYear))
      .map(p => ({ player: p, tv: calcPlayerTV(p, theirMode, currentYear), salary: (p.contract?.amount ?? 0) * 1000 }))
      .filter(r => r.tv > 5) // skip dead roster weight
      .sort((a, b) => b.tv - a.tv)
      .slice(0, 12); // top 12 candidates — keeps combo explosion bounded

    // Their tradeable picks — future picks only.
    const theirPicks = draftPicks
      .filter(dp => dp.tid === team.id && dp.season >= minTradableSeason)
      .map(dp => ({
        pick: dp,
        tv: calcPickTV(dp.round, 15, teams.length, Math.max(1, dp.season - currentYear)),
      }))
      .filter(r => r.tv > 5)
      .sort((a, b) => b.tv - a.tv)
      .slice(0, 6);

    // Build user-side asset combinations (1 through MAX_COMBO_SIZE players).
    const userAssets = [
      ...userBlockPlayers.map(p => ({ kind: 'player' as const, id: p.internalId, tv: userPlayerTVs.get(p.internalId) ?? 0, salary: (p.contract?.amount ?? 0) * 1000 })),
      ...userBlockPicks.map(dp => ({ kind: 'pick' as const, id: String(dp.dpid), tv: userPickTVs.get(dp.dpid) ?? 0, salary: 0 })),
    ].filter(a => a.tv > 0);

    if (userAssets.length === 0) continue;

    const teamProposals: RawProposal[] = [];

    for (let userK = 1; userK <= Math.min(MAX_COMBO_SIZE, userAssets.length); userK++) {
      for (const userCombo of combos(userAssets, userK)) {
        const requestTV = userCombo.reduce((s, a) => s + a.tv, 0);
        const userOutSalary = userCombo.reduce((s, a) => s + a.salary, 0);

        // Try 1-through-MAX_COMBO_SIZE player combinations on their side, optionally plus picks.
        for (let theirK = 1; theirK <= Math.min(MAX_COMBO_SIZE, theirRoster.length); theirK++) {
          for (const theirCombo of combos(theirRoster, theirK)) {
            const baseOfferTV = theirCombo.reduce((s, r) => s + r.tv, 0);
            const theirSalary = theirCombo.reduce((s, r) => s + r.salary, 0);

            // Parity check on player portion — if way off, try sweetening with picks.
            const ratio = baseOfferTV / requestTV;
            let offerTV = baseOfferTV;
            let pickSweetener: number[] = [];

            if (ratio < 1 - TV_PARITY_TOLERANCE) {
              // Their side is too light — try a pick sweetener to close the gap.
              const gap = requestTV - baseOfferTV;
              for (const { pick, tv } of theirPicks) {
                if (offerTV + tv <= requestTV * (1 + TV_PARITY_TOLERANCE)) {
                  pickSweetener.push(pick.dpid);
                  offerTV += tv;
                  if (offerTV >= requestTV * (1 - TV_PARITY_TOLERANCE)) break;
                }
              }
            } else if (ratio > 1 + TV_PARITY_TOLERANCE) {
              // Their side is too heavy — they wouldn't offer this. Skip.
              continue;
            }

            // Final parity check after sweetener.
            const finalRatio = offerTV / requestTV;
            if (finalRatio < 1 - TV_PARITY_TOLERANCE || finalRatio > 1 + TV_PARITY_TOLERANCE) continue;

            // Salary parity — approximate CBA rule.
            if (!salariesFit(theirSalary, userOutSalary)) continue;

            // Fit score: higher = closer to 1.0 ratio (fairer). Used to sort within a team.
            const fitScore = 100 - Math.abs(1 - finalRatio) * 100;

            const offeredPlayers = theirCombo.map(r => r.player.internalId);
            const requestedPlayers = userCombo.filter(a => a.kind === 'player').map(a => a.id);
            const requestedPicks = userCombo.filter(a => a.kind === 'pick').map(a => parseInt(a.id, 10));

            teamProposals.push({
              proposingTeamId: team.id,
              proposingGMName: userGMName ?? `${team.name} GM`,
              playersOffered: offeredPlayers,
              playersRequested: requestedPlayers,
              picksOffered: pickSweetener,
              picksRequested: requestedPicks,
              offerTV,
              requestTV,
              fitScore,
            });
          }
        }
      }
    }

    // Keep the top N fair proposals per team — avoid flooding with duplicates.
    teamProposals.sort((a, b) => b.fitScore - a.fitScore);
    // Dedupe by (playersOffered, playersRequested) signature.
    const seen = new Set<string>();
    for (const p of teamProposals) {
      const key = `${p.playersOffered.sort().join(',')}|${p.playersRequested.sort().join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      proposals.push(p);
      if (seen.size >= MAX_PROPOSALS_PER_TEAM) break;
    }
  }

  // Pick 5 random teams that have at least one eligible proposal, take the best
  // proposal from each. This mirrors real NBA vibe: a handful of fresh offers
  // per day, not a flood. Final list ≤ 5 proposals, one per distinct team.
  const byTeam = new Map<number, RawProposal[]>();
  for (const p of proposals) {
    if (!byTeam.has(p.proposingTeamId)) byTeam.set(p.proposingTeamId, []);
    byTeam.get(p.proposingTeamId)!.push(p);
  }
  for (const list of byTeam.values()) list.sort((a, b) => b.fitScore - a.fitScore);
  const teamIds = Array.from(byTeam.keys());
  // Date-seeded shuffle so the same day returns stable 5 teams (no re-rolling on re-render).
  const seed = proposedDate ? proposedDate.split('-').reduce((s, x) => s + parseInt(x, 10) * 7, 0) : Date.now();
  const shuffled = [...teamIds].sort((a, b) => {
    const ra = Math.sin(a * 9301 + seed * 49297) * 233280;
    const rb = Math.sin(b * 9301 + seed * 49297) * 233280;
    return (ra - Math.floor(ra)) - (rb - Math.floor(rb));
  });
  const DAILY_TEAM_COUNT = 5;
  const chosen = shuffled.slice(0, DAILY_TEAM_COUNT);
  const trimmed = chosen.map(tid => byTeam.get(tid)![0]).slice(0, MAX_TOTAL_PROPOSALS);

  // Translate to TradeProposal type
  return trimmed.map((p, idx) => ({
    id: `inbound-${Date.now()}-${idx}`,
    proposingTeamId: p.proposingTeamId,
    receivingTeamId: userTid,
    proposingGMName: p.proposingGMName,
    playersOffered: p.playersOffered,
    playersRequested: p.playersRequested,
    picksOffered: p.picksOffered,
    picksRequested: p.picksRequested,
    proposedDate,
    status: 'pending',
    isAIvsAI: false,
    tradeText: `Fit ${p.fitScore.toFixed(0)}% · TV ${Math.round(p.offerTV)} ↔ ${Math.round(p.requestTV)}`,
  }));
}
