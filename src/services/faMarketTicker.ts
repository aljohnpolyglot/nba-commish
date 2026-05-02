/**
 * faMarketTicker.ts — Drives the FA bidding lifecycle during the FA period.
 *
 * Per sim day, this module:
 *   1. Opens markets for notable unsigned FAs (K2 >= 80) that don't have one yet.
 *      AI team bids are generated via `generateAIBids`, with each bid's
 *      decision window (3-5 days) driving when the player picks.
 *   2. Resolves any markets whose decision window has closed — the best bid wins
 *      via `resolvePlayerDecision`, the player moves, history gets a signing entry,
 *      and the market is marked resolved.
 *
 * The pre-existing `runAIFreeAgencyRound` still handles low-tier FAs and
 * roster-minimum enforcement — this ticker runs first and filters top FAs
 * (and any with an active market) out of the pool so we never double-sign.
 */

import type { GameState, NBAPlayer, HistoryEntry } from '../types';
import { convertTo2KRating, calculateSocialEngagement } from '../utils/helpers';
import { getContractLimits, getTeamPayrollUSD, hasBirdRights } from '../utils/salaryUtils';
import { generateAIBids, isPlausibleActiveMarket, resolvePlayerDecision, type FreeAgentBid, type FreeAgentMarket } from './freeAgencyBidding';
import { buildShamsTransactionPost } from './social/templates/charania';
import { findShamsPhoto } from './social/charaniaphotos';
import { canSignMultiYear, compareGameDates, getCurrentOffseasonEffectiveFAStart, getCurrentOffseasonFAMoratoriumEnd, getGameDateParts, isInMoratorium, isPastTradeDeadline, parseGameDate, toISODateString } from '../utils/dateUtils';
import { getCapThresholds, getMLEAvailability } from '../utils/salaryUtils';
import { isRfaMatchingEnabled } from '../utils/ruleFlags';
import { computeTradeEligibleDate } from '../utils/signingMoratorium';

/** A FA is eligible for a competitive market if they're notable enough to attract bids.
 *  PR1: dropped from 80 → 70 so K2 70-79 mid-tier rotation FAs also see multi-team
 *  bidding. The previous threshold meant ~150+ rotation players went silently through
 *  runAIFreeAgencyRound with zero competition — rebuilders never got a crack at them. */
const MARKET_K2_THRESHOLD = 70;
/** Normal cadence — 8 new markets/day during in-season + offseason tail. */
const MAX_NEW_MARKETS_PER_DAY = 8;
/** Burst cadence — Jul 1-3 opens up to 30/day to clear the offseason FA flood without
 *  dragging into mid-July. After day 3 the offseason settles back to NORMAL. */
const MAX_NEW_MARKETS_BURST = 30;
/** After Oct 21 (preseason ends), only true superstars open new markets — the
 *  rest sit until next offseason or sign min/NG. K2 ≥ 92 ≈ All-NBA tier. */
const LATE_SEASON_K2_THRESHOLD = 92;
/** Spread market resolution so the offseason tail doesn't dump 80+ signings into
 *  a single sim day. When this many already resolve today, push extras to +1 day.
 *  Bumped 10 → 20 with PR1's K2 70 threshold drop — more open markets need more
 *  resolution headroom so the burst doesn't queue a week of pent-up signings. */
const MAX_MARKETS_RESOLVING_PER_DAY = 20;

/** True when current sim date is past Oct 21 — preseason has ended, regular
 *  season begins ~Oct 24. Used to gate mid-season market opens + cap years. */
function isPostPreseason(stateDate: string | undefined): boolean {
  if (!stateDate) return false;
  const { month: m, day } = getGameDateParts(stateDate);
  // After Oct 21: Nov-Jun all count. Jul-Sep are offseason.
  if (m >= 7 && m <= 9) return false;
  if (m === 10 && day <= 21) return false;
  return true;
}

function isPreseasonCampWindow(stateDate: string | undefined, leagueStats: any): boolean {
  if ((leagueStats?.nonGuaranteedContractsEnabled ?? true) === false) return false;
  if (!stateDate) return false;
  const { month: m, day } = getGameDateParts(stateDate);
  return (m >= 7 && m <= 9) || (m === 10 && day <= 21);
}

function isCampInviteBid(
  k2: number,
  bid: Pick<FreeAgentBid, 'salaryUSD' | 'years'>,
  state: GameState,
): boolean {
  if (!isPreseasonCampWindow(state.date, state.leagueStats as any)) return false;
  if (bid.years > 1) return false;
  const cap = getCapThresholds(state.leagueStats as any).salaryCap || 140_000_000;
  const pct = bid.salaryUSD / cap;
  if (pct <= 0.050 && k2 < 78) return true;
  if (pct <= 0.070 && k2 < 72) return true;
  if (pct <= 0.090 && k2 < 65) return true;
  return false;
}

/** RFA-specific prior team lookup — same logic as getLoyalPriorTid but
 *  exported via a stable name for the matching-offer-sheet flow. */
function getRFAPriorTid(player: NBAPlayer): number {
  const txns: Array<{ season: number; tid: number }> = (player as any).transactions ?? [];
  if (txns.length > 0) {
    const t = [...txns].sort((a, b) => b.season - a.season).find(x => x.tid >= 0 && x.tid <= 29);
    if (t) return t.tid;
  }
  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
  const s = stats.filter(x => !x.playoffs && (x.gp ?? 0) > 0 && (x.tid ?? -1) >= 0 && (x.tid ?? -1) <= 29)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0))[0];
  return s ? (s.tid ?? -1) : -1;
}

/** Returns the NBA tid (0–29) the player last played for, or -1 if unknown. */
function getLoyalPriorTid(player: NBAPlayer): number {
  const txns: Array<{ season: number; tid: number }> = (player as any).transactions ?? [];
  if (txns.length > 0) {
    const nbaT = [...txns].sort((a, b) => b.season - a.season).find(t => t.tid >= 0 && t.tid <= 29);
    if (nbaT) return nbaT.tid;
  }
  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
  const nbaStats = stats
    .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
  return nbaStats.length > 0 ? (nbaStats[0].tid ?? -1) : -1;
}

/** True when a LOYAL 30+ veteran should not enter a market where their prior team has no bid. */
function isLoyalMarketBlocked(player: NBAPlayer, bidTeamIds: number[], currentYear: number): boolean {
  const traits: string[] = (player as any).moodTraits ?? [];
  if (!traits.includes('LOYAL')) return false;
  if ((player as any).status === 'Retired' || (player as any).diedYear) return false;
  const age = player.born?.year ? currentYear - player.born.year : (player.age ?? 0);
  if (age < 30) return false;
  const yearsOfService = ((player as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
  if (yearsOfService < 8) return false;
  const priorTid = getLoyalPriorTid(player);
  if (priorTid < 0) return false;
  return !bidTeamIds.includes(priorTid);
}

function getK2(player: NBAPlayer): number {
  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  return convertTo2KRating(player.overallRating ?? 60, lastRating?.hgt ?? 50);
}

export interface MarketTickResult {
  updatedMarkets: FreeAgentMarket[];
  /** Player mutations for signings that resolved this tick. */
  signedPlayerIds: Set<string>;
  playerMutations: Map<string, Partial<NBAPlayer>>;
  historyEntries: HistoryEntry[];
  /** News items for resolved signings — folded into state.news by simulationHandler. */
  newsItems: any[];
  /** Shams social posts for notable (K2 ≥ 78) resolved signings. */
  socialPosts: any[];
  /** Player ids that have an ACTIVE (unresolved) market — callers should skip these
   *  in `runAIFreeAgencyRound` so the regular round doesn't poach them. */
  pendingPlayerIds: Set<string>;
  /** Markets that resolved this tick and had a user bid — used to pop GM-mode toasts. */
  userBidResolutions: { playerName: string; accepted: boolean; winnerTeamName?: string; annualM: number; years: number; rejectionReason?: string }[];
  /** RFA offer sheets received by user's team this tick — opens the Match/Decline toast. */
  rfaOfferSheets: { playerId: string; playerName: string; signingTeamName: string; annualM: number; years: number; expiresInDays: number }[];
  /** RFA matches resolved this tick — pop result toast for both prior team and signing team if user. */
  rfaMatchResolutions: { playerName: string; priorTeamName: string; signingTeamName: string; matched: boolean; userInvolved: boolean }[];
  /** True if anything in this tick should stop a multi-day sim early so the user
   *  sees the toast at the resolution moment instead of after the whole batch.
   *  Set when ANY user bid resolves (accepted OR rejected) — including silent
   *  closes that emit defensive rejection toasts. */
  shouldStopSim: boolean;
}

/**
 * Main entry. Call once per sim day during the FA season.
 */
export function tickFAMarkets(state: GameState): MarketTickResult {
  const currentDay = state.day;
  const currentYear = state.leagueStats?.year ?? 2026;
  const playerById = new Map(state.players.map(p => [p.internalId, p]));

  const signedPlayerIds = new Set<string>();
  const playerMutations = new Map<string, Partial<NBAPlayer>>();
  const historyEntries: HistoryEntry[] = [];
  const newsItems: any[] = [];
  const socialPosts: any[] = [];
  const userBidResolutions: MarketTickResult['userBidResolutions'] = [];

  // Helper — emit a rejection toast for any user bid in a market that's about to
  // close silently. Without this, user bids vanish without feedback whenever the
  // market is filtered out, the player has already been signed elsewhere, or
  // any of the early-close paths fire (LOYAL, RFA expiry, etc.).
  const emitUserBidRejection = (m: FreeAgentMarket, playerName: string, opts: { winnerTeamName?: string; reason?: string }) => {
    for (const b of m.bids) {
      if (!b.isUserBid) continue;
      if (b.status !== 'active') continue;
      userBidResolutions.push({
        playerName,
        accepted: false,
        winnerTeamName: opts.winnerTeamName,
        annualM: Math.round(b.salaryUSD / 100_000) / 10,
        years: b.years,
        rejectionReason: opts.reason,
      });
    }
  };

  // Pre-filter: drop markets that fail isPlausibleActiveMarket. Before emitting
  // the working set, surface any user bids that got dropped so the user gets
  // a toast instead of silently losing the bid (e.g., player flipped to a non-FA
  // status, or market opened too far in the past).
  const allMarkets = state.faBidding?.markets ?? [];
  const existing: FreeAgentMarket[] = [];
  for (const m of allMarkets) {
    const player = playerById.get(m.playerId);
    if (!m.resolved && player && player.tid !== -1) {
      console.warn(`[FA-MARKET] closed stale market — player already rostered: ${player.name}`);
      emitUserBidRejection(m, player.name, { reason: 'player is already rostered' });
      existing.push({
        ...m,
        resolved: true,
        bids: m.bids.map(b => b.status === 'active'
          ? { ...b, status: b.isUserBid ? 'rejected' as const : 'withdrawn' as const }
          : b),
      });
      continue;
    }
    if (m.resolved || isPlausibleActiveMarket(m, state, playerById.get(m.playerId))) {
      existing.push(m);
      continue;
    }
    const hadUserBid = m.bids.some(b => b.isUserBid);
    if (hadUserBid) {
      // Diagnostic: log why a user-bid market is being silently dropped so we can
      // tell whether the market got stale (window blew), the player got signed
      // by an AI path that bypassed the marketPendingIds filter, or something
      // else is racing the state. Goes alongside the toast so the user sees
      // both signal + console trace.
      const reason = !player
        ? 'player vanished from state'
        : player.tid >= 0
          ? `player.tid=${player.tid} (signed by ${state.teams.find(t => t.id === player.tid)?.name ?? 'unknown team'})`
          : `player.status=${player.status}, decidesOnDay=${m.decidesOnDay}, openedDay=${(m as any).openedDay}, currentDay=${currentDay}`;
      console.warn(`[FA-MARKET] Dropping user-bid market for ${m.playerName ?? player?.name ?? m.playerId}: ${reason}`);
    }
    if (!player) {
      emitUserBidRejection(m, m.playerName ?? 'Unknown', { reason: 'is no longer available' });
    } else if (player.tid >= 0) {
      const winnerName = state.teams.find(t => t.id === player.tid)?.name ?? 'another team';
      emitUserBidRejection(m, player.name, { winnerTeamName: winnerName });
    } else {
      emitUserBidRejection(m, player.name, { reason: 'market closed before resolution' });
    }
  }
  const workingMarkets: FreeAgentMarket[] = existing.map(m => ({ ...m, bids: [...m.bids] }));
  const rfaOfferSheets: MarketTickResult['rfaOfferSheets'] = [];
  const rfaMatchResolutions: MarketTickResult['rfaMatchResolutions'] = [];
  const userBidRejectedForCap = new Set<string>();

  const dateParts = state.date ? getGameDateParts(state.date) : null;
  const inSummerFAWindow = !!dateParts && dateParts.month >= 7 && dateParts.month <= 9;
  if (inSummerFAWindow) {
    const effectiveFAStart = toISODateString(getCurrentOffseasonEffectiveFAStart(state.date, state.leagueStats as any, state.schedule as any));
    if (compareGameDates(state.date, effectiveFAStart) < 0) {
      return {
        updatedMarkets: workingMarkets,
        signedPlayerIds,
        playerMutations,
        historyEntries,
        newsItems,
        socialPosts,
        pendingPlayerIds: new Set(workingMarkets.filter(m => !m.resolved).map(m => m.playerId)),
        userBidResolutions,
        rfaOfferSheets,
        rfaMatchResolutions,
        shouldStopSim: false,
      };
    }
  }

  // ── Date-based length cap (used at market open AND at resolution) ──────────
  // A market opened pre-Oct 21 with 3yr bids that resolves in Nov would
  // otherwise honor the original 3yr — sanity-cap at resolution time too.
  const postPreseasonResolve = isPostPreseason(state.date);
  const allowMultiYearResolve = canSignMultiYear(state.date, currentYear, state.leagueStats as any);
  const postDeadlineResolve = isPastTradeDeadline(state.date, currentYear, state.leagueStats as any);
  const resolutionMaxYears = (postDeadlineResolve && !allowMultiYearResolve)
    ? 1
    : postPreseasonResolve
      ? 2
      : Infinity;
  const moratoriumActive = isInMoratorium(state.date, currentYear, state.leagueStats as any, state.schedule as any);
  const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(state.date, state.leagueStats as any, state.schedule as any);
  const moratoriumEndDay = (() => {
    if (!state.date) return currentDay;
    const today = parseGameDate(state.date);
    if (isNaN(today.getTime()) || isNaN(moratoriumEnd.getTime())) return currentDay;
    return currentDay + Math.max(0, Math.ceil((moratoriumEnd.getTime() - today.getTime()) / 86_400_000));
  })();

  // Legacy/user-created markets from before the moratorium guard can have a
  // decision day that has already arrived while signings are still locked.
  // Push them to the first legal resolution day so they do not sit as
  // "Resolves today" throughout moratorium.
  if (moratoriumActive) {
    for (let i = 0; i < workingMarkets.length; i++) {
      const m = workingMarkets[i];
      if (m.resolved || m.decidesOnDay >= moratoriumEndDay) continue;
      workingMarkets[i] = {
        ...m,
        decidesOnDay: moratoriumEndDay,
        bids: m.bids.map(b => b.status === 'active'
          ? { ...b, expiresDay: Math.max(b.expiresDay ?? moratoriumEndDay, moratoriumEndDay) }
          : b),
      };
    }
  }

  const bidStillLegalAtResolution = (bid: FreeAgentBid, player: NBAPlayer): boolean => {
    const team = state.teams.find(t => t.id === bid.teamId);
    if (!team) return false;
    const priorTid = getRFAPriorTid(player);
    if (bid.teamId === priorTid && hasBirdRights(player)) return true;

    const thresholds = getCapThresholds(state.leagueStats as any);
    const newlyCommittedUSD = Array.from(playerMutations.values())
      .filter(mut => mut.tid === bid.teamId && mut.contract?.amount != null)
      .reduce((sum, mut) => sum + ((mut.contract?.amount ?? 0) * 1_000), 0);
    const payroll = getTeamPayrollUSD(state.players, bid.teamId, team, currentYear) + newlyCommittedUSD;
    const capSpace = thresholds.salaryCap - payroll;
    const mle = getMLEAvailability(bid.teamId, payroll, bid.salaryUSD, thresholds, state.leagueStats as any);
    return capSpace >= bid.salaryUSD || (!mle.blocked && bid.salaryUSD <= mle.available);
  };

  let userMarketCountered = false;
  for (let i = 0; i < workingMarkets.length; i++) {
    let m = workingMarkets[i];
    if (m.resolved || m.pendingMatch) continue;
    const hasActiveUserBid = m.bids.some(b => b.isUserBid && b.status === 'active');
    const hasActiveAiBid = m.bids.some(b => !b.isUserBid && b.status === 'active');
    if (!hasActiveUserBid || hasActiveAiBid) continue;

    const player = state.players.find(p => p.internalId === m.playerId);
    if (!player || player.tid >= 0 || player.status !== 'Free Agent') continue;

    const aiBids = generateAIBids(player, state, 5);
    if (aiBids.length === 0) continue;

    const decisionDay = Math.max(
      m.decidesOnDay ?? currentDay,
      currentDay + 2,
      moratoriumEndDay,
      ...aiBids.map(b => b.expiresDay ?? currentDay),
    );
    const existingTeamIds = new Set(m.bids.map(b => b.teamId));
    const freshAiBids = aiBids
      .filter(b => !existingTeamIds.has(b.teamId))
      .map(b => ({ ...b, expiresDay: Math.max(b.expiresDay ?? decisionDay, decisionDay) }));
    if (freshAiBids.length === 0) continue;

    workingMarkets[i] = {
      ...m,
      bids: [
        ...m.bids.map(b => b.status === 'active'
          ? { ...b, expiresDay: Math.max(b.expiresDay ?? decisionDay, decisionDay) }
          : b),
        ...freshAiBids,
      ],
      decidesOnDay: decisionDay,
      season: m.season ?? currentYear,
      openedDay: m.openedDay ?? currentDay,
      openedDate: m.openedDate ?? state.date,
    };
    userMarketCountered = true;
    console.log(`[FA-MARKET] Added ${freshAiBids.length} AI counter-bids to user market for ${player.name}.`);
  }

  // ── 1. Resolve any markets whose decision day has arrived ──────────────────
  for (let i = 0; i < workingMarkets.length; i++) {
    let m = workingMarkets[i];
    const hadUserBidForLog = m.bids.some(b => b.isUserBid);
    if (m.resolved) {
      if (hadUserBidForLog) console.log(`[FA-RESOLVE] Skipping ${m.playerName ?? m.playerId} — already resolved.`);
      continue;
    }
    if (m.decidesOnDay > currentDay) {
      if (hadUserBidForLog) console.log(`[FA-RESOLVE] Skipping ${m.playerName ?? m.playerId} — decidesOnDay=${m.decidesOnDay} > currentDay=${currentDay}.`);
      continue;
    }
    if (moratoriumActive) {
      if (hadUserBidForLog) console.log(`[FA-RESOLVE] Skipping ${m.playerName ?? m.playerId} — moratorium active.`);
      continue;
    }
    if (hadUserBidForLog) {
      console.log(`[FA-RESOLVE] Resolving ${m.playerName ?? m.playerId} — currentDay=${currentDay}, decidesOnDay=${m.decidesOnDay}, bids=${m.bids.length}, activeBids=${m.bids.filter(b => b.status === 'active').length}`);
    }

    const player = state.players.find(p => p.internalId === m.playerId);
    if (!player) {
      emitUserBidRejection(m, m.playerName ?? 'Unknown', { reason: 'is no longer available' });
      workingMarkets[i] = { ...m, resolved: true };
      continue;
    }
    if (player.tid >= 0) {
      // Already signed elsewhere (Bird Rights resign, AI signing race, etc.)
      const winnerName = state.teams.find(t => t.id === player.tid)?.name ?? 'another team';
      emitUserBidRejection(m, player.name, { winnerTeamName: winnerName });
      workingMarkets[i] = { ...m, resolved: true };
      continue;
    }

    const legalBids = m.bids.map(bid => {
      if (bid.status !== 'active') return bid;
      if (bidStillLegalAtResolution(bid, player)) return bid;
      if (bid.isUserBid) {
        emitUserBidRejection(m, player.name, { reason: 'no longer fits your cap space or exception room after season rollover' });
        userBidRejectedForCap.add(m.playerId);
        return { ...bid, status: 'rejected' as const };
      }
      return { ...bid, status: 'withdrawn' as const };
    });
    if (legalBids !== m.bids) {
      m = { ...m, bids: legalBids };
      workingMarkets[i] = m;
    }

    const resolved = resolvePlayerDecision(m, player, state);
    workingMarkets[i] = resolved;

    const winner = resolved.bids.find(b => b.status === 'accepted');
    if (!winner) {
      if (hadUserBidForLog) {
        console.warn(`[FA-RESOLVE] ${m.playerName ?? m.playerId} closed with no accepted bid while user had a bid.`);
        emitUserBidRejection(m, m.playerName ?? player.name, { reason: 'did not accept any offer' });
        workingMarkets[i] = {
          ...resolved,
          bids: resolved.bids.map(b => b.isUserBid && b.status === 'active'
            ? { ...b, status: 'rejected' as const }
            : b),
        };
      }
      continue;
    }

    const team = state.teams.find(t => t.id === winner.teamId);
    if (!team) continue;

    // ── RFA matching offer-sheet branch ───────────────────────────────────
    // If the winning bid is from a non-prior team AND the player is RFA AND
    // matching is enabled in commissioner settings, suspend final mutation
    // and put the market into pending-match state. Prior team gets a window
    // to match. AI matches resolve via the dedicated tick below; the user's
    // RFA case (priorTid === userTid) waits for explicit MATCH/DECLINE action.
    const rfaEnabled = isRfaMatchingEnabled(state.leagueStats);
    // Real-player imports never get contract.restrictedFA stamped — fall back
    // to rookie-flag + R1 round (canonical NBA rule: R1 rookie deal → RFA).
    const c = (player as any).contract;
    const isRFA =
      !!(c?.isRestrictedFA || c?.restrictedFA) ||
      !!(c?.rookie && (player as any).draft?.round === 1);
    const priorTid = getRFAPriorTid(player);
    const matchWindowDays = (state.leagueStats as any).rfaMatchWindowDays ?? 2;
    if (
      rfaEnabled &&
      isRFA &&
      priorTid >= 0 &&
      winner.teamId !== priorTid &&
      !m.pendingMatch &&
      !winner.isUserBid
    ) {
      // Mark market pending — prior team has matchWindowDays to decide.
      workingMarkets[i] = {
        ...resolved,
        resolved: false,
        pendingMatch: true,
        pendingMatchExpiresDay: currentDay + matchWindowDays,
        pendingMatchPriorTid: priorTid,
        pendingMatchOfferBidId: winner.id,
      };
      // If the user IS the prior team, push the Match/Decline toast.
      const userTeamForRFA = state.gameMode === 'gm' ? ((state as any).userTeamId ?? -999) : -999;
      if (priorTid === userTeamForRFA) {
        rfaOfferSheets.push({
          playerId: player.internalId,
          playerName: player.name,
          signingTeamName: team.name,
          annualM: Math.round(winner.salaryUSD / 100_000) / 10,
          years: winner.years,
          expiresInDays: matchWindowDays,
        });
      }
      // History: offer sheet entry (real Ayton/Suns/Pacers flow — first the
      // offer sheet shows up, then the match override comes later).
      const annualMOS = Math.round(winner.salaryUSD / 100_000) / 10;
      const totalMOS = Math.round(annualMOS * winner.years);
      const optTagOS = winner.option === 'PLAYER' ? ' (player option)' : winner.option === 'TEAM' ? ' (team option)' : '';
      const priorTeamForHist = state.teams.find(t => t.id === priorTid);
      historyEntries.push({
        text: `${player.name} signs offer sheet with the ${team.name}: $${totalMOS}M/${winner.years}yr${optTagOS} — ${priorTeamForHist?.name ?? 'prior team'} has ${matchWindowDays} days to match.`,
        date: state.date,
        type: 'Signing',
        playerIds: [player.internalId],
        tid: team.id,
      } as any);
      newsItems.push({
        id: `rfa-offer-sheet-${player.internalId}-${state.date}`,
        headline: `${player.name} Signs Offer Sheet with ${team.name}`,
        content: `${player.name} (RFA) has agreed to a ${winner.years}-year, $${totalMOS}M offer sheet with the ${team.name}. The ${priorTeamForHist?.name ?? 'prior team'} has ${matchWindowDays} days to match. Sources: Adrian Wojnarowski.`,
        date: state.date,
        type: 'transaction',
        read: false,
        isNew: true,
      });
      continue; // skip final mutation — wait for match decision
    }

    // Clamp years at resolution time — covers markets opened pre-cutoff that
    // resolve mid-season (Quentin Grimes Nov-5 $96M/3yr regression).
    const finalYears = Math.min(winner.years, resolutionMaxYears);
    const isNonGuaranteed = !!winner.nonGuaranteed && finalYears === 1;

    // Apply the winning bid to the player. Bird Rights reset when signing with a
    // different franchise — yearsWithTeam goes to 0, and season rollover will
    // recompute hasBirdRights fresh against the new team next cycle.
    const previousTid = player.tid;
    const joinedNewTeam = previousTid !== winner.teamId;
    const newContract = {
      amount: Math.round(winner.salaryUSD / 1_000),
      exp: currentYear + finalYears - 1,
      hasPlayerOption: winner.option === 'PLAYER',
    };
    const newContractYears = Array.from({ length: finalYears }, (_, idx) => {
      const yr = currentYear + idx;
      const annual = Math.round(winner.salaryUSD * Math.pow(1.05, idx));
        return {
          season: `${yr - 1}-${String(yr).slice(-2)}`,
          guaranteed: isNonGuaranteed ? 0 : annual,
          option: idx === finalYears - 1 && winner.option === 'PLAYER' ? 'Player'
                : idx === finalYears - 1 && winner.option === 'TEAM' ? 'Team' : '',
        };
    });
    const historicalYears = ((player as any).contractYears ?? []).filter((cy: any) => {
      const yr = parseInt(cy.season.split('-')[0], 10) + 1;
      return yr < currentYear;
    });

    const prevSalaryUSDFirstYear = (Number((player as any).contract?.amount) || 0) * 1_000;
    const minUSD = ((state.leagueStats?.minContractStaticAmount as number | undefined) ?? 1.273) * 1_000_000;
    const mutation: Partial<NBAPlayer> = {
      tid: winner.teamId,
      status: 'Active' as any,
      contract: newContract,
      contractYears: [...historicalYears, ...newContractYears],
      // Stamp signing date so trim's recency guard protects this signing.
      signedDate: state.date,
      tradeEligibleDate: computeTradeEligibleDate({
        signingDate: state.date,
        contractYears: finalYears,
        salaryUSDFirstYear: winner.salaryUSD,
        prevSalaryUSDFirstYear,
        usedBirdRights: !joinedNewTeam,
        isReSign: !joinedNewTeam,
        isMinimum: winner.salaryUSD <= minUSD * 1.01,
        leagueStats: state.leagueStats as any,
      }),
      ...(isNonGuaranteed ? { nonGuaranteed: true } : {}),
      ...(joinedNewTeam ? { yearsWithTeam: 0, hasBirdRights: false } : {}),
    } as any;
    playerMutations.set(player.internalId, mutation);
    signedPlayerIds.add(player.internalId);

    const annualM = Math.round(winner.salaryUSD / 100_000) / 10;
    const totalM = Math.round(annualM * finalYears);
    const optTag = winner.option === 'PLAYER' ? ' (player option)' : winner.option === 'TEAM' ? ' (team option)' : '';
    const ngTag = isNonGuaranteed ? ' (non-guaranteed)' : '';
    const userWon = !!winner.isUserBid;
    // Check if the resolved market had a user bid — generate a GM toast.
    const hadUserBid = m.bids.some(b => b.isUserBid);
    if (hadUserBid && !userBidRejectedForCap.has(m.playerId)) {
      const winnerTeam = state.teams.find(t => t.id === winner.teamId);
      userBidResolutions.push({
        playerName: player.name,
        accepted: userWon,
        winnerTeamName: userWon ? undefined : (winnerTeam?.name ?? winner.teamName),
        annualM: annualM,
        years: finalYears,
      });
    }
    historyEntries.push({
      text: `${player.name} signs with the ${team.name}: $${totalM}M/${finalYears}yr${optTag}${ngTag}`,
      date: state.date,
      type: 'Signing',
      playerIds: [player.internalId],
      tid: team.id,
    } as any);

    // News item — matches the shape the existing FA round produces so the
    // transactions view renders it the same way.
    const isMax = annualM >= 30;
    const headline = userWon
      ? `${player.name} Picks Your ${team.name}`
      : isMax
        ? `${player.name} Lands Max Deal with ${team.name}`
        : `${player.name} Signs with ${team.name}`;
    const content = `${player.name} has agreed to a ${finalYears}-year, $${totalM}M deal with the ${team.name}${optTag}${ngTag}. ${isMax ? 'Sources: Shams Charania.' : 'Sources: Adrian Wojnarowski.'}`;
    newsItems.push({
      id: `fa-market-signing-${player.internalId}-${state.date}`,
      headline,
      content,
      date: state.date,
      type: 'transaction',
      read: false,
      isNew: true,
    });

    // Shams social post for notable signings (K2 >= 78) — mirror existing gate.
    const k2 = getK2(player);
    if (k2 >= 78) {
      const shamsContent = buildShamsTransactionPost({
        type: 'signing',
        playerName: player.name,
        teamName: team.name,
        amount: annualM,
        years: finalYears,
        hasPlayerOption: winner.option === 'PLAYER',
      });
      if (shamsContent) {
        const engagement = calculateSocialEngagement('@ShamsCharania', shamsContent, player.overallRating);
        const shamsPhoto = findShamsPhoto(player.name, team.name);
        socialPosts.push({
          id: `shams-market-sign-${player.internalId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          author: 'Shams Charania',
          handle: '@ShamsCharania',
          content: shamsContent,
          date: parseGameDate(state.date).toISOString(),
          likes: engagement.likes,
          retweets: engagement.retweets,
          source: 'TwitterX' as const,
          isNew: true,
          playerPortraitUrl: (player as any).imgURL,
          ...(shamsPhoto ? { mediaUrl: shamsPhoto } : {}),
        });
      }
    }
  }

  // ── 1a. RFA pending-match resolution ────────────────────────────────────
  // For markets in pending-match state: AI prior teams decide here based on
  // budget + need + cap; user prior teams stay pending until MATCH_RFA_OFFER /
  // DECLINE_RFA_OFFER action. Window expiry → auto-decline (signing team wins).
  const userTeamIdRFA = state.gameMode === 'gm' ? ((state as any).userTeamId ?? -999) : -999;
  const rfaThresholds = getCapThresholds(state.leagueStats as any);
  const autoDeclineOver2nd = (state.leagueStats as any).rfaAutoDeclineOver2ndApron ?? true;

  for (let i = 0; i < workingMarkets.length; i++) {
    const m = workingMarkets[i];
    if (!m.pendingMatch) continue;
    if (m.resolved) continue;
    const player = state.players.find(p => p.internalId === m.playerId);
    if (!player) { workingMarkets[i] = { ...m, resolved: true, pendingMatch: false }; continue; }

    const priorTid = m.pendingMatchPriorTid ?? -1;
    if (priorTid < 0) { workingMarkets[i] = { ...m, resolved: true, pendingMatch: false }; continue; }
    const priorTeam = state.teams.find(t => t.id === priorTid);
    const offerBid = m.bids.find(b => b.id === m.pendingMatchOfferBidId);
    if (!offerBid) { workingMarkets[i] = { ...m, resolved: true, pendingMatch: false }; continue; }
    const signingTeam = state.teams.find(t => t.id === offerBid.teamId);
    if (!priorTeam || !signingTeam) { workingMarkets[i] = { ...m, resolved: true, pendingMatch: false }; continue; }

    // User prior team — wait for explicit action (handled in GameContext reducer).
    if (priorTid === userTeamIdRFA) continue;

    // Window expiry → auto-decline.
    const windowExpired = (m.pendingMatchExpiresDay ?? 0) <= currentDay;
    let willMatch = false;
    if (!windowExpired) {
      // AI match decision — fires once per pending market (deterministic by seed).
      // Match if:
      //   - K2 >= 80 (always retain stars)
      //   - OR seededRandom < 0.55 default acceptance
      //   - AND prior team isn't above 2nd apron (when autoDecline setting is on)
      const k2 = getK2(player);
      const priorPayroll = state.players
        .filter(p => p.tid === priorTid && !(p as any).twoWay)
        .reduce((s, p) => s + ((p.contract?.amount ?? 0) * 1_000), 0);
      const overSecondApron = rfaThresholds.secondApron != null && priorPayroll >= rfaThresholds.secondApron;
      if (autoDeclineOver2nd && overSecondApron) {
        willMatch = false;
      } else {
        // Seeded RNG — same player + season → same outcome on replay.
        let h = 0;
        const seed = `rfa_match_${m.playerId}_${currentYear}`;
        for (let si = 0; si < seed.length; si++) h = (Math.imul(31, h) + seed.charCodeAt(si)) | 0;
        h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
        h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
        const roll = ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
        const matchPct = k2 >= 85 ? 0.85 : k2 >= 80 ? 0.70 : 0.55;
        willMatch = roll < matchPct;
      }
    }

    // Apply outcome — either prior team matches (player goes there at offer terms)
    // or signing team gets the player. Same contract math for both branches.
    const winningTid = willMatch ? priorTid : offerBid.teamId;
    const winningTeam = willMatch ? priorTeam : signingTeam;
    const finalYearsRFA = Math.min(offerBid.years, resolutionMaxYears);
    const isNonGuaranteedRFA = !!offerBid.nonGuaranteed && finalYearsRFA === 1;
    const newContract = {
      amount: Math.round(offerBid.salaryUSD / 1_000),
      exp: currentYear + finalYearsRFA - 1,
      hasPlayerOption: offerBid.option === 'PLAYER',
    };
    const newContractYears = Array.from({ length: finalYearsRFA }, (_, idx) => {
      const yr = currentYear + idx;
      const annual = Math.round(offerBid.salaryUSD * Math.pow(1.05, idx));
      return {
        season: `${yr - 1}-${String(yr).slice(-2)}`,
        guaranteed: isNonGuaranteedRFA ? 0 : annual,
        option: idx === finalYearsRFA - 1 && offerBid.option === 'PLAYER' ? 'Player'
              : idx === finalYearsRFA - 1 && offerBid.option === 'TEAM' ? 'Team' : '',
      };
    });
    const histYears = ((player as any).contractYears ?? []).filter((cy: any) => {
      const yr = parseInt(cy.season.split('-')[0], 10) + 1;
      return yr < currentYear;
    });
    const joinedNewTeam = winningTid !== player.tid;
    const prevSalaryUSDFirstYearRfa = (Number((player as any).contract?.amount) || 0) * 1_000;
    const minUSDRfa = ((state.leagueStats?.minContractStaticAmount as number | undefined) ?? 1.273) * 1_000_000;
    playerMutations.set(player.internalId, {
      tid: winningTid,
      status: 'Active' as any,
      contract: newContract,
      contractYears: [...histYears, ...newContractYears],
      signedDate: state.date,
      tradeEligibleDate: computeTradeEligibleDate({
        signingDate: state.date,
        contractYears: finalYearsRFA,
        salaryUSDFirstYear: offerBid.salaryUSD,
        prevSalaryUSDFirstYear: prevSalaryUSDFirstYearRfa,
        usedBirdRights: !joinedNewTeam,
        isReSign: !joinedNewTeam,
        isMinimum: offerBid.salaryUSD <= minUSDRfa * 1.01,
        leagueStats: state.leagueStats as any,
      }),
      ...(isNonGuaranteedRFA ? { nonGuaranteed: true } : {}),
      ...(joinedNewTeam ? { yearsWithTeam: 0, hasBirdRights: false } : {}),
    } as any);
    signedPlayerIds.add(player.internalId);

    workingMarkets[i] = {
      ...m,
      resolved: true,
      pendingMatch: false,
      matchedByPriorTeam: willMatch,
    };

    // Toast resolution for the user — if user was the signing team and lost
    // the match, or watching their RFA get matched/lost (handled separately).
    const userInvolvedInMatch = userTeamIdRFA === priorTid || userTeamIdRFA === offerBid.teamId;
    rfaMatchResolutions.push({
      playerName: player.name,
      priorTeamName: priorTeam.name,
      signingTeamName: signingTeam.name,
      matched: willMatch,
      userInvolved: userInvolvedInMatch,
    });

    const annualMM = Math.round(offerBid.salaryUSD / 100_000) / 10;
    const totalMM = Math.round(annualMM * finalYearsRFA);
    if (willMatch) {
      historyEntries.push({
        text: `${priorTeam.name} matched ${signingTeam.name}'s offer sheet on ${player.name}: $${totalMM}M/${finalYearsRFA}yr.`,
        date: state.date,
        type: 'Signing',
        playerIds: [player.internalId],
        tid: priorTeam.id,
      } as any);
      newsItems.push({
        id: `rfa-matched-${player.internalId}-${state.date}`,
        headline: `${priorTeam.name} Match ${signingTeam.name}'s Offer for ${player.name}`,
        content: `The ${priorTeam.name} have matched the ${signingTeam.name}'s ${finalYearsRFA}-year, $${totalMM}M offer sheet for ${player.name}, retaining the restricted free agent. Sources: Adrian Wojnarowski.`,
        date: state.date,
        type: 'transaction',
        read: false,
        isNew: true,
      });
    } else {
      historyEntries.push({
        text: `${player.name} signs with the ${signingTeam.name}: $${totalMM}M/${finalYearsRFA}yr (${priorTeam.name} declined to match).`,
        date: state.date,
        type: 'Signing',
        playerIds: [player.internalId],
        tid: signingTeam.id,
      } as any);
      newsItems.push({
        id: `rfa-not-matched-${player.internalId}-${state.date}`,
        headline: `${signingTeam.name} Land ${player.name} as ${priorTeam.name} Decline Match`,
        content: `${player.name} (${finalYearsRFA}yr · $${totalMM}M) joins the ${signingTeam.name} after the ${priorTeam.name} declined to match the offer sheet.`,
        date: state.date,
        type: 'transaction',
        read: false,
        isNew: true,
      });
    }
  }

  // ── 1b. Withdraw bids from teams that exhausted cap this tick ────────────────
  // When a team signs a max contract, their remaining offers on other players
  // must be killed so they can't phantom-commit beyond their cap.
  // PR1: replaced hardcoded `cap × 1.18 / cap × 0.085` with getCapThresholds() so
  // commissioner-tuned cap settings (lux pct, MLE pct) are honored.
  if (playerMutations.size > 0) {
    const thresholds = getCapThresholds(state.leagueStats as any);
    const capUSD = thresholds.salaryCap;
    const luxTax = thresholds.luxuryTax;

    // Sum up salary newly committed this tick per team (amount stored in thousands)
    const newlyCommitted = new Map<number, number>();
    for (const mutation of playerMutations.values()) {
      const tid = mutation.tid;
      const amountK = mutation.contract?.amount;
      if (tid != null && tid >= 0 && amountK != null) {
        newlyCommitted.set(tid, (newlyCommitted.get(tid) ?? 0) + amountK * 1_000);
      }
    }

    for (const market of workingMarkets) {
      if (market.resolved) continue;
      market.bids = market.bids.map(bid => {
        if (bid.status !== 'active' || bid.isUserBid) return bid;
        const extra = newlyCommitted.get(bid.teamId) ?? 0;
        if (extra === 0) return bid; // team didn't sign anyone this tick

        const teamPayroll = state.players
          .filter(p => p.tid === bid.teamId && !(p as any).twoWay)
          .reduce((sum, p) => sum + ((p.contract?.amount ?? 0) * 1_000), 0);
        const effectivePayroll = teamPayroll + extra;
        const capSpace = capUSD - effectivePayroll;
        // Real MLE check — uses commissioner-set MLE percentages instead of cap×0.085
        const mleAvail = getMLEAvailability(bid.teamId, effectivePayroll, bid.salaryUSD, thresholds, state.leagueStats as any);
        const canUseMLE = !mleAvail.blocked && bid.salaryUSD <= mleAvail.available;
        if (capSpace >= bid.salaryUSD || canUseMLE) return bid;
        return { ...bid, status: 'withdrawn' as const };
      });
    }
  }

  // ── 1c. Close LOYAL markets where only non-prior-team bids remain ───────────
  for (let i = 0; i < workingMarkets.length; i++) {
    const m = workingMarkets[i];
    if (m.resolved) continue;
    const player = state.players.find(p => p.internalId === m.playerId);
    if (!player) continue;
    const activeBids = m.bids.filter(b => b.status === 'active');
    if (activeBids.length === 0) continue;
    // User bid present → don't pre-close. The user committed money and deserves
    // a normal resolution path (and toast). If the player still rejects, that
    // happens on decidesOnDay through resolvePlayerDecision, which DOES emit a
    // userBidResolution toast.
    if (activeBids.some(b => b.isUserBid)) continue;
    const activeBidTeams = activeBids.map(b => b.teamId);
    if (isLoyalMarketBlocked(player, activeBidTeams, currentYear)) {
      // Resolve as unsigned — mark all bids rejected
      workingMarkets[i] = {
        ...m,
        resolved: true,
        bids: m.bids.map(b => b.status === 'active' ? { ...b, status: 'rejected' as const } : b),
      };
    }
  }

  // ── 2. Collect ids currently tied up in active markets (seed for de-dup) ───
  const activeMarketIds = new Set<string>();
  for (const m of workingMarkets) {
    if (!m.resolved) activeMarketIds.add(m.playerId);
  }

  // ── 3. Open new markets for notable FAs without one ────────────────────────
  // Mid-season gate: after Oct 21 only K2 ≥ 92 stars open new markets.
  // Length cap: 2yr post-Oct 21 (general mid-season sanity); 1yr post-deadline
  // when EconomyTab.postDeadlineMultiYearContracts is OFF (rulebook respected).
  const postPreseason = isPostPreseason(state.date);
  const k2Floor = postPreseason ? LATE_SEASON_K2_THRESHOLD : MARKET_K2_THRESHOLD;
  const allowMultiYear = canSignMultiYear(state.date, currentYear, state.leagueStats as any);
  const postDeadline = isPastTradeDeadline(state.date, currentYear, state.leagueStats as any);
  let maxYearsThisTick: number;
  if (postDeadline && !allowMultiYear) maxYearsThisTick = 1;
  else if (postPreseason)              maxYearsThisTick = 2;
  else                                 maxYearsThisTick = Infinity;

  // How many decisions are already scheduled to land today/earlier — used to
  // stagger new opens so the offseason tail doesn't all resolve in one day.
  const resolvingTodayCount = workingMarkets
    .filter(m => !m.resolved && m.decidesOnDay <= currentDay + 3)
    .length;

  // Burst window — first 3 days of FA (Jul 1-3) need to clear the offseason flood.
  // Without burst the K2 70 threshold drop would otherwise leave 100+ FAs sitting
  // until late July before anyone bids on them.
  const dt = state.date ? getGameDateParts(state.date) : null;
  const isBurstWindow = !!dt && dt.month === 7 && dt.day <= 3;
  const newMarketsCap = isBurstWindow ? MAX_NEW_MARKETS_BURST : MAX_NEW_MARKETS_PER_DAY;

  // Re-open cooldown — markets that closed unsigned (all bids rejected, or all
  // withdrew when bidders signed someone else) need to reopen with fresh bids
  // a few days later. Without this, K2 ≥ 88 stars (LeBron, Reaves, Porzingis)
  // sit as FAs forever — their first market resolved with no winner and the
  // filter never let it re-open. Cooldown stops same-day re-attempts.
  const REOPEN_COOLDOWN_DAYS = 3;
  const unsignedTopFAs = state.players
    .filter(p => p.tid < 0 && p.status === 'Free Agent' && !((p as any).draft?.year >= currentYear))
    .filter(p => !activeMarketIds.has(p.internalId))
    // Allow re-opening if the previous market resolved without a signing AND
    // enough days have passed. A resolved market with an `accepted` bid means
    // the player signed (we leave those alone since the player has a tid now);
    // a resolved market with NO accepted bid means they sat unsigned and need
    // another shot at the market once teams have re-evaluated their cap.
    .filter(p => {
      const priorMarkets = workingMarkets.filter(m => m.playerId === p.internalId && m.resolved);
      if (priorMarkets.length === 0) return true;
      const latest = priorMarkets[priorMarkets.length - 1];
      const wasSigned = latest.bids.some(b => b.status === 'accepted');
      if (wasSigned) return false; // already signed; player just looks like FA temporarily
      // Unsigned — re-open after the cooldown.
      const daysSinceResolved = currentDay - (latest.decidesOnDay ?? currentDay);
      return daysSinceResolved >= REOPEN_COOLDOWN_DAYS;
    })
    .map(p => ({ player: p, k2: getK2(p) }))
    .filter(x => x.k2 >= k2Floor)
    .sort((a, b) => b.k2 - a.k2)
    .slice(0, newMarketsCap);

  let openedThisTick = 0;
  for (const { player, k2 } of unsignedTopFAs) {
    // Tier-based bid count — stars deserve a real bidding war (5 teams),
    // role players keep the original 3-bid baseline. Without this, every
    // star post-multi-season-sim showed the same 3 cap-rich teams (BKN/LAL/LAC)
    // because that's all generateAIBids' cap-eligibility filter let through.
    const maxBids = k2 >= 88 ? 5 : k2 >= 80 ? 4 : 3;
    const bids = generateAIBids(player, state, maxBids);
    if (bids.length === 0) continue;
    // Clamp every bid to the player's max contract — `generateAIBids` uses tier-
    // based pct of cap, which can inch above max for supermax-tier stars.
    const limits = getContractLimits(player, state.leagueStats as any);
    let clamped: FreeAgentBid[] = bids.map(b => {
      const salaryUSD = Math.min(b.salaryUSD, Math.round(limits.maxSalaryUSD));
      // K2 70-74 fringe markets in camp are Exhibit-10/NG territory, not
      // guaranteed multi-year money. They still get a market, but bids resolve
      // as one-year camp invites so Oct trims do not create dead money.
      const years = isPreseasonCampWindow(state.date, state.leagueStats as any) && k2 < 75
        ? 1
        : Math.min(b.years, maxYearsThisTick);
      const nextBid = { ...b, salaryUSD, years };
      return isCampInviteBid(k2, nextBid, state)
        ? { ...nextBid, nonGuaranteed: true }
        : nextBid;
    });

    // LOYAL players only enter a market if their prior team is among the bidders.
    const bidTeamIds = clamped.map(b => b.teamId);
    if (isLoyalMarketBlocked(player, bidTeamIds, currentYear)) continue;

    // Stagger: if we've already piled too many decisions onto the next 3 days,
    // push this market's decision out further so resolution day doesn't burst.
    let decidesOnDay = Math.max(...clamped.map(b => b.expiresDay));
    decidesOnDay = Math.max(decidesOnDay, moratoriumEndDay);
    if (resolvingTodayCount + openedThisTick >= MAX_MARKETS_RESOLVING_PER_DAY) {
      const overflow = (resolvingTodayCount + openedThisTick) - MAX_MARKETS_RESOLVING_PER_DAY;
      decidesOnDay += 1 + Math.floor(overflow / MAX_MARKETS_RESOLVING_PER_DAY);
    }

    workingMarkets.push({
      playerId: player.internalId,
      playerName: player.name,
      bids: clamped,
      decidesOnDay,
      resolved: false,
      season: currentYear,
      openedDay: currentDay,
      openedDate: state.date,
    });
    activeMarketIds.add(player.internalId);
    openedThisTick++;
  }

  // Refresh the pending set after opening new markets (we want the most recent view).
  const pendingPlayerIds = new Set<string>();
  for (const m of workingMarkets) {
    if (!m.resolved) pendingPlayerIds.add(m.playerId);
  }

  // Sim should stop early if anything user-facing resolved this tick — user bid
  // toasts (accepted/rejected) AND RFA offer-sheets the user has to decide on.
  // Without this, the user sims through their own market events and only sees
  // the toast pile after the whole batch lands.
  const shouldStopSim = userMarketCountered || userBidResolutions.length > 0 || rfaOfferSheets.length > 0;

  return {
    updatedMarkets: workingMarkets,
    signedPlayerIds,
    playerMutations,
    historyEntries,
    newsItems,
    socialPosts,
    pendingPlayerIds,
    rfaOfferSheets,
    rfaMatchResolutions,
    userBidResolutions,
    shouldStopSim,
  };
}
