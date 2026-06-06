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

import type { NBAPlayer, NBATeam, DraftPick, LeagueStats, TradeProposal } from '../../types';
import {
  calcOvr2K, calcPot2K, calcPlayerTV, getPickTV, isRecentlySignedLocked, isSalaryLegal, isUntouchable, isWalkingExpiring,
  getTradeCandidateFloor, type TeamMode, type PickValueContext,
} from './tradeValueEngine';
import { tradeRoleToTeamMode } from '../../utils/teamStrategy';
import { validateCBATradeRules } from '../../utils/cbaTradeRules';
import { wouldStepienViolateForTid } from './stepienRule';
import { DEFAULT_TRADABLE_PICK_SEASONS } from '../draft/DraftPickGenerator';
import { isTradeExcludedStatus } from './tradeFinderShared';

const TV_PARITY_TOLERANCE = 0.15;    // ±15% on either side = "fair" trade
const MAX_COMBO_SIZE = 3;            // up to 3 players per side
const MAX_PROPOSALS_PER_TEAM = 2;    // keep the inbox readable
const MAX_TOTAL_PROPOSALS = 20;      // overall cap
const MIN_BODY_PLAYER_TV = 0.5;      // keep low-end roster bodies eligible for filler-for-filler offers

function roleToMode(role: string): TeamMode {
  return tradeRoleToTeamMode(role);
}

// Pure pick/cap-relief sides skip the cap match (no salary to balance against).
function salariesFit(outSalaryUSD: number, inSalaryUSD: number): boolean {
  if (outSalaryUSD === 0 || inSalaryUSD === 0) return true;
  return isSalaryLegal(outSalaryUSD, inSalaryUSD);
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
  /** Optional dynamic pick-value inputs (see draftClassStrength.ts). */
  classStrengthByYear?: Map<number, number>;
  lotterySlotByTid?: Map<number, number>;
  /** Optional tid → power rank (1=best). If present, pick TV projects off
   *  the original owner's rank instead of a hardcoded mid-league 15. */
  powerRanks?: Map<number, number>;
  /** True when expiring contracts are walking before the upcoming FA rollover. */
  isPostDeadlinePreFA?: boolean;
  /** Optional timestamps for the recently-signed trade lock. */
  recentlySignedLockMs?: { currentDate: string; leagueStats?: LeagueStats };
  /** Allow PBA roster members to be treated as tradeable when the current mode is PBA. */
  allowPbaRoster?: boolean;
  /** Optional player.internalId → 1-based MVP-race rank. Top-30 candidates are
   *  treated as untouchable (top-10 globally, top-30 for contenders) and get a
   *  TV premium so the engine demands franchise-tier compensation. */
  mvpRank?: Map<string, number>;
  /** Required for CBA + Stepien validation. Without this, generated proposals
   *  can be apron-illegal / Stepien-illegal / inside the moratorium window. */
  leagueStats: LeagueStats;
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
  cbaValid: boolean;
  cbaReason?: string;
  cbaOffendingSide?: 'A' | 'B';
}

function formatTradeValue(tv: number): string {
  if (tv >= 20) return String(Math.round(tv));
  const fixed = tv.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

export function generateInboundProposalsForUser(input: InboundProposalInput): TradeProposal[] {
  const {
    userTid, userGMName, blockPlayerIds, blockPickIds,
    players, teams, draftPicks, currentYear, minTradableSeason,
    teamOutlooks, proposedDate, classStrengthByYear, lotterySlotByTid, powerRanks,
    isPostDeadlinePreFA = false, recentlySignedLockMs, mvpRank, leagueStats, allowPbaRoster = false,
  } = input;
  if ((leagueStats as any)?.tradesAllowed === false) return [];
  const tradablePickWindow = (leagueStats as any)?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
  const stepienEnabled = (leagueStats as any)?.stepienRuleEnabled !== false;
  const tvCtx = mvpRank ? { leaguePerAvg: 15, isRegularSeason: false, mvpRank } : undefined;

  const minLivePickSeason = Math.max(minTradableSeason, currentYear);
  const liveDraftPicks = draftPicks.filter(dp => dp.season >= currentYear);
  const pickCtx: PickValueContext = {
    currentYear,
    totalTeams: teams.length,
    powerRanks: powerRanks ?? new Map(),
    classStrengthByYear,
    lotterySlotByTid,
  };

  // ── Resolve user's block assets ────────────────────────────────────────────
  const userMode: TeamMode = roleToMode(teamOutlooks.get(userTid)?.role ?? 'neutral');
  const isWalking = (p: NBAPlayer) => isWalkingExpiring(p, currentYear, isPostDeadlinePreFA);
  const isLocked = recentlySignedLockMs
    ? (p: NBAPlayer) => isRecentlySignedLocked(p, recentlySignedLockMs.currentDate, recentlySignedLockMs.leagueStats)
    : (_p: NBAPlayer) => false;
  const userBlockPlayers = players
    .filter(p => p.tid === userTid && blockPlayerIds.includes(p.internalId))
    .filter(p => !isWalking(p) && !isLocked(p));
  const userBlockPicks = liveDraftPicks.filter(dp => dp.tid === userTid && dp.season >= minLivePickSeason && blockPickIds.includes(dp.dpid));

  if (userBlockPlayers.length === 0 && userBlockPicks.length === 0) return [];

  const userPlayerTVs = new Map(userBlockPlayers.map(p => [p.internalId, Math.max(MIN_BODY_PLAYER_TV, calcPlayerTV(p, userMode, currentYear, tvCtx))]));
  const userPickTVs = new Map(userBlockPicks.map(dp => [dp.dpid, getPickTV(dp, pickCtx)]));
  const blockScale = Math.max(
    1,
    ...Array.from(userPlayerTVs.values()),
    ...Array.from(userPickTVs.values()),
  );
  const deadWeightFloor = getTradeCandidateFloor(blockScale);

  const proposals: RawProposal[] = [];

  // ── For each other team, try building trades around their block/roster ────
  for (const team of teams) {
    if (team.id === userTid) continue;

    const theirOutlook = teamOutlooks.get(team.id) ?? { role: 'neutral' };
    const theirMode = roleToMode(theirOutlook.role);

    // Their tradeable roster — non-external, non-untouchable from their POV.
    const theirRoster = players
      .filter(p => p.tid === team.id && !isTradeExcludedStatus(p.status, allowPbaRoster))
      .filter(p => !isWalking(p) && !isLocked(p))
      .filter(p => !isUntouchable(p, theirMode, currentYear, mvpRank))
      .map(p => ({ player: p, tv: Math.max(MIN_BODY_PLAYER_TV, calcPlayerTV(p, theirMode, currentYear, tvCtx)), salary: (p.contract?.amount ?? 0) * 1000, ovr: calcOvr2K(p) }))
      .filter(r => r.tv >= deadWeightFloor)
      .sort((a, b) => b.tv - a.tv)
      .slice(0, 12); // top 12 candidates — keeps combo explosion bounded

    // Their tradeable picks — future picks only.
    const theirPicks = liveDraftPicks
      .filter(dp => dp.tid === team.id && dp.season >= minLivePickSeason)
      .map(dp => ({ pick: dp, tv: getPickTV(dp, pickCtx) }))
      .filter(r => r.tv >= deadWeightFloor)
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

            // Salary parity — approximate CBA rule (loose gate so we still surface
            // "needs minor adjustment" trades; the proper apron/Stepien validation
            // below tags them with cbaValid=false instead of hiding them).
            if (!salariesFit(theirSalary, userOutSalary)) continue;

            // Fit score: higher = closer to 1.0 ratio (fairer). Used to sort within a team.
            const fitScore = 100 - Math.abs(1 - finalRatio) * 100;

            const offeredPlayers = theirCombo.map(r => r.player.internalId);
            const requestedPlayers = userCombo.filter(a => a.kind === 'player').map(a => a.id);
            const requestedPicks = userCombo.filter(a => a.kind === 'pick').map(a => parseInt(a.id, 10));
            const requestedPlayerObjs = userCombo
              .filter(a => a.kind === 'player')
              .map(a => players.find(p => p.internalId === a.id))
              .filter((p): p is NBAPlayer => !!p);
            const premiumIncoming = requestedPlayerObjs.some(p => calcPot2K(p, currentYear) > 84)
              || userCombo.some(a => a.kind === 'pick' && userBlockPicks.some(dp => dp.dpid === parseInt(a.id, 10) && dp.round === 1));
            if (!premiumIncoming && theirCombo.some(r => r.ovr > 84)) continue;

            // ── CBA + Stepien validation ────────────────────────────────────────
            // We do NOT filter — illegal proposals stay visible as "available with
            // minor adjustments" signals; the inbox UI offers a legal-only filter.
            const offeredPickObjs = liveDraftPicks.filter(dp => pickSweetener.includes(dp.dpid));
            const requestedPickObjs = liveDraftPicks.filter(dp => requestedPicks.includes(dp.dpid));
            const cba = validateCBATradeRules({
              teamAId: team.id,
              teamBId: userTid,
              teamAPlayers: theirCombo.map(r => r.player),
              teamBPlayers: requestedPlayerObjs,
              teamAPicks: offeredPickObjs,
              teamBPicks: requestedPickObjs,
              teams, players, leagueStats,
              currentDate: proposedDate,
              currentYear,
            });
            let cbaValid = cba.ok;
            let cbaReason = cba.ok ? undefined : (cba.reason ?? 'CBA rule violation');
            let cbaOffendingSide = cba.ok ? undefined : cba.offendingSide;
            if (cbaValid && stepienEnabled) {
              if (offeredPickObjs.length > 0 &&
                  wouldStepienViolateForTid(liveDraftPicks, currentYear, tradablePickWindow, team.id, offeredPickObjs)) {
                cbaValid = false;
                cbaReason = 'Stepien violation: trading these picks leaves no consecutive 1st rounders';
                cbaOffendingSide = 'A';
              }
              if (cbaValid && requestedPickObjs.length > 0 &&
                  wouldStepienViolateForTid(liveDraftPicks, currentYear, tradablePickWindow, userTid, requestedPickObjs)) {
                cbaValid = false;
                cbaReason = 'Stepien violation on your side';
                cbaOffendingSide = 'B';
              }
            }

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
              cbaValid,
              cbaReason,
              cbaOffendingSide,
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
    tradeText: `Fit ${p.fitScore.toFixed(0)}% · TV ${formatTradeValue(p.offerTV)} ↔ ${formatTradeValue(p.requestTV)}`,
    cbaValid: p.cbaValid,
    cbaReason: p.cbaReason,
    cbaOffendingSide: p.cbaOffendingSide,
  }));
}
