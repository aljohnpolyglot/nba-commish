/**
 * AIFreeAgentHandler.ts
 *
 * Autonomous AI free-agent signings + mid-season extensions.
 * Spec: multiseason_todo.md §3
 */

import type { GameState, NBAPlayer, NBATeam } from '../types';
import { getCapThresholds, getTeamCapProfile, computeContractOffer, getMLEAvailability, effectiveRecord, getContractLimits, hasBirdRights as resolveBirdRights } from '../utils/salaryUtils';
import type { MleType } from '../utils/salaryUtils';
import { convertTo2KRating } from '../utils/helpers';
import { SettingsManager } from './SettingsManager';
import { computeMoodScore } from '../utils/mood/moodScore';
import type { MoodTrait } from '../utils/mood/moodTypes';
import { calcPot2K } from './trade/tradeValueEngine';
import { isAssistantGMActive } from './assistantGMFlag';
import { getGMAttributes, clampSpendOffer, workEthicSignProb } from './staff/gmAttributes';
import { hasFamilyOnRoster } from '../utils/familyTies';
import { canSignMultiYear, isPastTradeDeadline } from '../utils/dateUtils';
import { resolveTeamStrategyProfile, type TeamStrategyProfile } from '../utils/teamStrategy';

const DEFAULT_MAX_ROSTER = 15;

// ── Mid-season offer clamp ──────────────────────────────────────────────────
//
// Cameron Johnson ($42M/3yr Oct 26) and Landry Shamet ($52M/3yr Nov 22) both
// got mid-season Pass-1 deals because faMarketTicker's K2 ≥ 92 floor sent them
// to runAIFreeAgencyRound, where computeContractOffer returns full 3-4yr deals
// year-round. This helper applies the same date gates (length cap + salary
// decay) to any signing path inside this file, mirroring the faMarketTicker
// + freeAgencyBidding logic so the two pipelines stay in lockstep.

interface DateClampedOffer {
  salaryUSD: number;
  years: number;
  hasPlayerOption: boolean;
}

function clampOfferForDate(
  offer: { salaryUSD: number; years: number; hasPlayerOption: boolean },
  stateDate: string | undefined,
  currentYear: number,
  leagueStats: any,
): DateClampedOffer {
  if (!stateDate) return offer;
  const dt = new Date(stateDate);
  if (isNaN(dt.getTime())) return offer;
  const m = dt.getMonth() + 1;
  const day = dt.getDate();
  const isOffseason = (m >= 7 && m <= 9) || (m === 10 && day <= 21);
  if (isOffseason) return offer; // pre-Oct 21 — full FA terms

  // Length cap: post-deadline + setting OFF → 1yr. Otherwise post-Oct 21 → 2yr.
  const allowMultiYear = canSignMultiYear(stateDate, currentYear, leagueStats);
  const postDeadline = isPastTradeDeadline(stateDate, currentYear, leagueStats);
  const yearsCap = (postDeadline && !allowMultiYear) ? 1 : 2;
  const finalYears = Math.min(offer.years, yearsCap);

  // Salary decay: matches generateAIBids — late-Oct/Nov/Dec ×0.55, Jan ×0.35, Feb-Jun ×0.20.
  let decay = 1.0;
  if (m === 2 || m === 3 || m === 4 || m === 5 || m === 6) decay = 0.20;
  else if (m === 1) decay = 0.35;
  else if (m === 11 || m === 12 || (m === 10 && day >= 22)) decay = 0.55;
  // Floor at min salary so decay can't push offer below the league min.
  const minSalaryUSD = ((leagueStats?.minContractStaticAmount ?? 1.273) as number) * 1_000_000;
  const finalSalary = Math.max(minSalaryUSD, Math.round(offer.salaryUSD * decay));

  return { salaryUSD: finalSalary, years: finalYears, hasPlayerOption: offer.hasPlayerOption };
}

// ── LOYAL prior-team gate ─────────────────────────────────────────────────────

/** Returns the NBA tid (0–29) the player last played for, or -1 if none. */
function getLoyalPriorTid(player: NBAPlayer): number {
  // Prefer explicit transactions (most recent non-FA tid in 0-29 range)
  const txns: Array<{ season: number; tid: number }> = (player as any).transactions ?? [];
  if (txns.length > 0) {
    const nbaT = [...txns]
      .sort((a, b) => b.season - a.season)
      .find(t => t.tid >= 0 && t.tid <= 29);
    if (nbaT) return nbaT.tid;
  }
  // Fall back to most recent stats season with gp > 0 on an NBA team
  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
  const nbaStats = stats
    .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
  return nbaStats.length > 0 ? (nbaStats[0].tid ?? -1) : -1;
}

/**
 * Returns true if this player's LOYAL trait should block signing with `teamId`.
 * Gate: LOYAL trait + age 30+ + 3+ years of service + prior NBA team exists + teamId ≠ prior team.
 */
function isLoyalBlocked(player: NBAPlayer, teamId: number, currentYear: number): boolean {
  const traits: string[] = (player as any).moodTraits ?? [];
  if (!traits.includes('LOYAL')) return false;
  if ((player as any).status === 'Retired') return false;
  if ((player as any).diedYear) return false;

  const age = player.born?.year ? currentYear - player.born.year : (player.age ?? 0);
  if (age < 30) return false;

  const yearsOfService = ((player as any).stats ?? [])
    .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
  if (yearsOfService < 3) return false;

  const priorTid = getLoyalPriorTid(player);
  if (priorTid < 0) return false; // no prior NBA team — gate doesn't apply

  return teamId !== priorTid;
}

// ── RFA matching (mirrors faMarketTicker offer-sheet flow) ──────────────────

/** Canonical RFA flag with a rookie+R1 fallback for real-player imports that
 *  never get contract.restrictedFA stamped (only in-sim drafted players do). */
function isPlayerRFA(player: NBAPlayer): boolean {
  const c = (player as any).contract;
  if (c?.isRestrictedFA || c?.restrictedFA) return true;
  return !!(c?.rookie && (player as any).draft?.round === 1);
}

/** Deterministic match-probability roll. Same K2 tiers as faMarketTicker:
 *  K2 ≥ 85 → 85%, K2 ≥ 80 → 70%, else 55%. Seed includes year so a re-run
 *  of the same round produces the same outcome but next year is fresh. */
function rollPriorTeamMatch(player: NBAPlayer, currentYear: number): boolean {
  const rating = player.ratings?.[player.ratings.length - 1];
  const k2 = convertTo2KRating(player.overallRating ?? rating?.ovr ?? 50, rating?.hgt ?? 50, rating?.tp ?? 50);
  const matchPct = k2 >= 85 ? 0.85 : k2 >= 80 ? 0.70 : 0.55;
  let h = 0;
  const seed = `rfa_match_round_${player.internalId}_${currentYear}`;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  const roll = ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
  return roll < matchPct;
}

// ── §3a: Player mood for team ─────────────────────────────────────────────────

function playerMoodForTeam(player: NBAPlayer, team: NBATeam, state: GameState): number {
  let mood = 1.0;

  const wins = (team as any).wins ?? 0;
  const losses = (team as any).losses ?? 0;
  const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0.5;

  if (winPct >= 0.6) mood += 0.3;
  else if (winPct < 0.35) mood -= 0.3;

  const teamPlayers = state.players.filter(p => p.tid === team.id);
  const posCount = teamPlayers.filter(p =>
    (p.pos ?? '').includes(player.pos ?? '') && (p.overallRating ?? 0) >= (player.overallRating ?? 0)
  ).length;

  if (posCount === 0) mood += 0.3;
  else if (posCount >= 3) mood -= 0.2;

  const pop = (team as any).pop ?? 0;
  if (pop > 5) mood += 0.2;

  return Math.max(0, Math.min(2, mood));
}

function getK2Ovr(player: NBAPlayer): number {
  const rating = player.ratings?.[player.ratings.length - 1];
  return convertTo2KRating(player.overallRating ?? rating?.ovr ?? 50, rating?.hgt ?? 50, rating?.tp ?? 50);
}

function playerAge(player: NBAPlayer, currentYear: number): number {
  return player.born?.year ? currentYear - player.born.year : (player.age ?? 27);
}

function sharesPosition(a?: string, b?: string): boolean {
  const left = (a ?? '').toUpperCase();
  const right = (b ?? '').toUpperCase();
  if (!left || !right) return false;
  if (left === right) return true;
  return left.split('').some(ch => right.includes(ch));
}

function positionNeedScore(teamPlayers: NBAPlayer[], candidate: NBAPlayer): number {
  const strongerAtPos = teamPlayers.filter(player =>
    sharesPosition(player.pos, candidate.pos) &&
    (player.overallRating ?? 0) >= (candidate.overallRating ?? 0)
  ).length;
  if (strongerAtPos === 0) return 2.5;
  if (strongerAtPos === 1) return 1.5;
  if (strongerAtPos === 2) return 0.5;
  if (strongerAtPos === 3) return -0.5;
  return -1.5;
}

function scoreFreeAgentFit(args: {
  player: NBAPlayer;
  team: NBATeam;
  state: GameState;
  strategy: TeamStrategyProfile;
  offer: { salaryUSD: number; years: number; hasPlayerOption: boolean };
  effectiveCapSpace: number;
  mood: number;
}): number {
  const { player, team, state, strategy, offer, effectiveCapSpace, mood } = args;
  const currentYear = state.leagueStats.year;
  const teamPlayers = state.players.filter(p => p.tid === team.id);
  const k2 = getK2Ovr(player);
  const pot = calcPot2K(player, currentYear);
  const age = playerAge(player, currentYear);
  const need = positionNeedScore(teamPlayers, player);
  const agePenalty = Math.max(0, age - strategy.preferredFreeAgentMaxAge) * 3.5 * strategy.agePenaltyWeight;
  const lengthPenalty = Math.max(0, offer.years - strategy.preferredContractYears) * 7 * strategy.capFlexWeight;
  const overCapPenalty = effectiveCapSpace > 0
    ? Math.max(0, offer.salaryUSD - effectiveCapSpace) / 1_000_000 * 1.75 * strategy.capFlexWeight
    : 0;
  const youthBonus = age <= 25 ? 6 * strategy.futureTalentWeight : 0;
  const veteranBonus = age >= 29 ? 4 * strategy.currentTalentWeight : 0;

  return (
    k2 * strategy.currentTalentWeight +
    pot * strategy.futureTalentWeight * 0.7 +
    need * 8 * strategy.fitWeight +
    mood * 18 * strategy.freeAgentAggression +
    youthBonus +
    veteranBonus -
    agePenalty -
    lengthPenalty -
    overCapPenalty
  );
}

// ── §3b: Best FA fit ──────────────────────────────────────────────────────────

function getBestFit(
  team: NBATeam,
  freeAgents: NBAPlayer[],
  state: GameState,
  strategy: TeamStrategyProfile,
  /** Local MLE already spent this round (teamId → usedUSD). Avoids double-spending within a round. */
  localMleUsed: Map<number, { type: MleType; usedUSD: number }>,
  /** Total USD this team has already committed in earlier same-round signings.
   *  Without this, every getBestFit call sees the same pre-round cap snapshot
   *  and a cap-rich team could "afford" the same star slot N times. */
  roundSpentUSD = 0,
): NBAPlayer | null {
  const thresholds = getCapThresholds(state.leagueStats as any);
  const profile = getTeamCapProfile(
    state.players,
    team.id,
    (team as any).wins ?? 0,
    (team as any).losses ?? 0,
    thresholds,
  );
  const effectiveCapSpace = Math.max(0, profile.capSpaceUSD - roundSpentUSD);
  const effectivePayroll  = profile.payrollUSD + roundSpentUSD;

  const gmSpending = getGMAttributes(state, team.id).spending;
  return freeAgents
    .filter(p => {
      const baseOffer = computeContractOffer(p, state.leagueStats as any);
      const limits = getContractLimits(p, state.leagueStats as any);
      // Never push AI offers over the player's max contract. Cap-space headroom
      // isn't a hard ceiling here — MLE still lets teams offer above cap.
      const offer = { ...baseOffer, salaryUSD: clampSpendOffer(baseOffer.salaryUSD, gmSpending, limits.maxSalaryUSD) };

      // Build an effective leagueStats that merges any MLE already spent this round
      const localEntry = localMleUsed.get(team.id);
      const effectiveLeagueStats = localEntry
        ? {
            ...state.leagueStats,
            mleUsage: {
              ...(state.leagueStats as any).mleUsage,
              [team.id]: localEntry,
            },
          }
        : state.leagueStats;

      const mleAvail = getMLEAvailability(
        team.id,
        effectivePayroll,
        offer.salaryUSD,
        thresholds,
        effectiveLeagueStats as any,
      );

      const canAffordViaCap = offer.salaryUSD <= effectiveCapSpace + 2_000_000;
      const canAffordViaMle = !mleAvail.blocked && offer.salaryUSD <= mleAvail.available;
      if (!canAffordViaCap && !canAffordViaMle) return false;
      const age = playerAge(p, state.leagueStats.year);
      const k2 = getK2Ovr(p);
      if (strategy.key === 'cap_clearing' && offer.years > 1) return false;
      if ((strategy.key === 'rebuilding' || strategy.key === 'development') && age >= 29 && offer.years > 1) return false;
      if (!strategy.initiateBuyTrades && age >= 31 && offer.years > strategy.preferredContractYears) return false;
      if (strategy.initiateBuyTrades && k2 < 72 && offer.years > 1) return false;
      if (playerMoodForTeam(p, team, state) < 0.85) return false;
      if (isLoyalBlocked(p, team.id, state.leagueStats.year)) return false;
      return true;
    })
    .sort((a, b) => {
      const aOffer = clampOfferForDate(computeContractOffer(a, state.leagueStats as any), state.date, state.leagueStats.year, state.leagueStats);
      const bOffer = clampOfferForDate(computeContractOffer(b, state.leagueStats as any), state.date, state.leagueStats.year, state.leagueStats);
      const aScore = scoreFreeAgentFit({
        player: a,
        team,
        state,
        strategy,
        offer: aOffer,
        effectiveCapSpace,
        mood: playerMoodForTeam(a, team, state),
      });
      const bScore = scoreFreeAgentFit({
        player: b,
        team,
        state,
        strategy,
        offer: bOffer,
        effectiveCapSpace,
        mood: playerMoodForTeam(b, team, state),
      });
      return bScore - aScore || (b.overallRating ?? 0) - (a.overallRating ?? 0);
    })[0] ?? null;
}

// ── §3c: Main signing round ───────────────────────────────────────────────────

export interface SigningResult {
  playerId: string;
  teamId: number;
  playerName: string;
  teamName: string;
  salaryUSD: number;   // annual contract value in USD
  contractYears: number;
  contractExp: number; // season year contract expires
  hasPlayerOption: boolean;
  /** Set when signing was funded via an MLE rather than cap space. */
  mleTypeUsed?: MleType;
  mleAmountUSD?: number;
  /** True when this is a non-guaranteed training camp deal (slots 16–21). */
  nonGuaranteed?: boolean;
  /** 'Supermax' | 'Rose Rule' | 'Two-Way' — shown in transaction log. */
  contractLabel?: string;
  /** RFA offer-sheet outcome: signing was rerouted to the prior team via match. */
  matchedOfferSheet?: boolean;
  /** Team that originally extended the offer sheet (set when matchedOfferSheet=true). */
  offerSheetSigningTid?: number;
  offerSheetSigningTeamName?: string;
}

/**
 * Run one round of AI FA signings.
 * Returns mutations to apply to state.players (set tid for each signed player).
 */
export function runAIFreeAgencyRound(state: GameState): SigningResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];

  const results: SigningResult[] = [];
  // In GM mode, exclude the user's team from AI signings. In commissioner mode every team is AI-controlled,
  // so use a sentinel id that can't match any real team — userTeamId may still be set as the "last managed
  // franchise" remembered across mode switches, and we don't want that team frozen out of the AI loop.
  const userTeamId = (state.gameMode === 'gm' && !isAssistantGMActive()) ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;

  // Players with an active FA bidding market are reserved by `faMarketTicker` —
  // the round must not poach them on a non-resolution day.
  const marketPendingIds = new Set<string>(
    (state.faBidding?.markets ?? [])
      .filter(m => !m.resolved)
      .map(m => m.playerId),
  );
  let pool = state.players
    .filter(p => p.tid < 0 && p.status === 'Free Agent' && !((p as any).draft?.year >= state.leagueStats.year))
    .filter(p => !marketPendingIds.has(p.internalId));
  if (pool.length === 0) return [];

  const strategyByTeam = new Map<number, TeamStrategyProfile>();
  const getStrategy = (team: NBATeam) => {
    const cached = strategyByTeam.get(team.id);
    if (cached) return cached;
    const next = resolveTeamStrategyProfile({
      team,
      players: state.players,
      teams: state.teams,
      leagueStats: state.leagueStats,
      currentYear: state.leagueStats.year,
      gameMode: state.gameMode,
      userTeamId: (state as any).userTeamId,
    });
    strategyByTeam.set(team.id, next);
    return next;
  };

  const sortedAITeams = [...state.teams]
    .filter(t => t.id !== userTeamId)
    .sort((a, b) =>
      getStrategy(b).freeAgentAggression - getStrategy(a).freeAgentAggression ||
      (((b as any).wins ?? 0) - ((a as any).wins ?? 0))
    );

  // Training camp period: Jul 1 – Oct 21 (when maxTrainingCampRoster applies)
  const month = state.date ? parseInt(state.date.split('-')[1], 10) : new Date().getMonth() + 1;
  const day = state.date ? parseInt(state.date.split('-')[2], 10) : new Date().getDate();
  const isTrainingCampPeriod = (month >= 7 && month <= 9) || (month === 10 && day <= 21);

  // Standard roster limit — expands to maxTrainingCampRoster during Jul 1–Oct 21
  const maxStandard = isTrainingCampPeriod
    ? (state.leagueStats.maxTrainingCampRoster ?? 21)
    : (state.leagueStats.maxStandardPlayersPerTeam ?? state.leagueStats.maxPlayersPerTeam ?? DEFAULT_MAX_ROSTER);

  // Track MLE spend within this round so a team can't double-spend before state updates
  const localMleUsed = new Map<number, { type: MleType; usedUSD: number }>();

  const thresholds = getCapThresholds(state.leagueStats as any);

  const currentYear = state.leagueStats.year;

  // Helper: record a signing into results + remove from pool
  const rfaEnabled = (state.leagueStats as any).rfaMatchingEnabled ?? true;

  const signPlayer = (
    player: NBAPlayer,
    team: NBATeam,
    offer: { salaryUSD: number; years: number; hasPlayerOption: boolean },
    mleTypeUsed: MleType = null,
    mleAmountUSD = 0,
    twoWay = false,
    nonGuaranteed = false,
  ) => {
    // RFA matching: if the signing team isn't the prior team and the player is
    // an RFA, give the prior team a shot at matching the offer (Bird Rights
    // cover the cap, so no cap recheck — only roster space gates the match).
    // Two-way deals opt out: 2W contracts don't trigger RFA matching in the NBA.
    let finalTeam = team;
    let matchedOfferSheet = false;
    let offerSheetSigningTid: number | undefined;
    let offerSheetSigningTeamName: string | undefined;
    if (rfaEnabled && !twoWay && isPlayerRFA(player)) {
      const priorTid = getLoyalPriorTid(player);
      if (priorTid >= 0 && priorTid !== team.id) {
        const priorTeam = state.teams.find(t => t.id === priorTid);
        if (priorTeam) {
          const priorRoster =
            state.players.filter(p => p.tid === priorTid && !(p as any).twoWay).length +
            results.filter(r => r.teamId === priorTid && !(r as any).twoWay).length;
          if (priorRoster < maxStandard && rollPriorTeamMatch(player, currentYear)) {
            finalTeam = priorTeam;
            matchedOfferSheet = true;
            offerSheetSigningTid = team.id;
            offerSheetSigningTeamName = team.name;
          }
        }
      }
    }

    results.push({
      playerId: player.internalId,
      teamId: finalTeam.id,
      playerName: player.name,
      teamName: finalTeam.name,
      salaryUSD: offer.salaryUSD,
      contractYears: offer.years,
      contractExp: currentYear + offer.years - 1,
      hasPlayerOption: offer.hasPlayerOption,
      ...(mleTypeUsed ? { mleTypeUsed, mleAmountUSD } : {}),
      ...(twoWay ? { twoWay: true } as any : {}),
      ...(nonGuaranteed ? { nonGuaranteed: true } : {}),
      ...(matchedOfferSheet ? { matchedOfferSheet, offerSheetSigningTid, offerSheetSigningTeamName } : {}),
    });
    pool = pool.filter(p => p.internalId !== player.internalId);
  };

  // ── Pass 1: Normal signings (cap space + MLE for best available) ──────
  // Cap-rich teams keep signing best-fit FAs until they exhaust cap+MLE or
  // the roster is full. Without this fill loop, a team with $130M cap space
  // would sign exactly ONE star and leave the rest of their cap dormant —
  // Pass 4 (which sorts by salary asc) would then sweep them up with $1M
  // fillers and the team ends up at 15/15 with $4M avg salary instead of
  // a real rotation. (Symptom: GSW $67M / 15 players in season 5 audit.)
  for (const team of sortedAITeams) {
    const rosterSizeStart = state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length;
    if (rosterSizeStart >= maxStandard) continue;

    // work_ethic: lazy GMs sometimes skip a round of non-mandatory signings.
    // Fires ONCE per team per round (gates the whole fill loop, not each signing).
    const teamAttrs = getGMAttributes(state, team.id);
    if (Math.random() > workEthicSignProb(teamAttrs.work_ethic)) continue;
    const strategy = getStrategy(team);

    let signedThisIteration = true;
    while (signedThisIteration) {
      signedThisIteration = false;

      // Recompute roster + roundSpent each iteration
      const rosterSize = state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length
                       + results.filter(r => r.teamId === team.id && !(r as any).twoWay).length;
      if (rosterSize >= maxStandard) break;

      const roundSpentUSD = results
        .filter(r => r.teamId === team.id)
        .reduce((s, r) => s + r.salaryUSD, 0);

      const best = getBestFit(team, pool, state, strategy, localMleUsed, roundSpentUSD);
      if (!best) break;

      // spending: GM's personal multiplier on the market offer (overpay vs lowball),
      // clamped against the player's max contract so overpay never breaks league rules.
      // Date-clamp first so post-Oct-21 length/salary cuts apply BEFORE the spending
      // overlay — Cameron Johnson Oct 26 $42M/3yr regression had a 3yr deal slip
      // through Pass 1 because the date gate only lived in faMarketTicker.
      const baseOfferRaw = computeContractOffer(best, state.leagueStats as any);
      const baseOffer = clampOfferForDate(baseOfferRaw, state.date, currentYear, state.leagueStats);
      const bestLimits = getContractLimits(best, state.leagueStats as any);
      const offer = { ...baseOffer, salaryUSD: clampSpendOffer(baseOffer.salaryUSD, teamAttrs.spending, bestLimits.maxSalaryUSD) };

      // Determine if this signing fits via cap (after subtracting in-flight spend) or MLE
      const profile = getTeamCapProfile(
        state.players, team.id,
        (team as any).wins ?? 0, (team as any).losses ?? 0, thresholds,
      );
      const effectiveCapSpace = profile.capSpaceUSD - roundSpentUSD;
      const effectivePayroll  = profile.payrollUSD  + roundSpentUSD;
      const isViaCap = offer.salaryUSD <= effectiveCapSpace;
      let mleTypeUsed: MleType = null;
      let mleAmountUSD = 0;

      if (!isViaCap) {
        // Signing is via MLE — figure out which type and record it locally
        const localEntry = localMleUsed.get(team.id);
        const effectiveLS = localEntry
          ? { ...state.leagueStats, mleUsage: { ...(state.leagueStats as any).mleUsage, [team.id]: localEntry } }
          : state.leagueStats;
        const mleAvail = getMLEAvailability(team.id, effectivePayroll, offer.salaryUSD, thresholds, effectiveLS as any);
        if (!mleAvail.blocked && mleAvail.type) {
          mleTypeUsed = mleAvail.type;
          mleAmountUSD = offer.salaryUSD;
          const prevUsed = localEntry?.usedUSD ?? 0;
          localMleUsed.set(team.id, { type: mleAvail.type, usedUSD: prevUsed + offer.salaryUSD });
        }
      }

      signPlayer(best, team, offer, mleTypeUsed, mleAmountUSD);
      signedThisIteration = true;
    }
  }

  // ── Preseason window check (used by Two-way + NG passes) ──────────────
  // Lifted to the top so both pre-fill passes can gate on it without duplicating logic.
  const ngEnabled = (state.leagueStats as any).nonGuaranteedContractsEnabled ?? true;
  const maxCampRoster = state.leagueStats.maxTrainingCampRoster ?? 21;
  const simDateMonth = state.date ? new Date(state.date).getMonth() + 1 : 0;
  const simDateDay   = state.date ? new Date(state.date).getDate() : 0;
  const isPreseasonWindow = ngEnabled && (
    (simDateMonth >= 7 && simDateMonth <= 9) ||
    (simDateMonth === 10 && simDateDay <= 21)
  );

  // ── Pass 2: Two-way contract signings ────────────────────────────────
  // RUNS BEFORE roster-fill so the OVR-≤60 fringe FAs aren't vacuumed up by
  // the salary-ASC sort in Pass 4. Two-way slots are a separate roster pool
  // (don't compete with the 15) so reserving 3 fringe FAs per team here
  // doesn't hurt Pass 4's ability to fill standard rosters.
  const maxTwoWay = state.leagueStats.maxTwoWayPlayersPerTeam ?? 3;
  const twoWayEnabled = (state.leagueStats as any).twoWayContractsEnabled ?? true;
  // Raw BBGM OVR cap. After multi-season progression the FA pool drifts upward,
  // and a 52 ceiling leaves the two-way pool empty by season ~3 (league-wide 0/3 2W).
  // 60 still tops out below "rotation-grade" while keeping a viable post-progression pool.
  const TWO_WAY_OVR_CAP = 60;
  const TWO_WAY_SALARY_USD = 625_000;

  if (twoWayEnabled && maxTwoWay > 0) {
    for (const team of sortedAITeams) {
      // During training camp: two-way slots come from the shared 21-player pool
      if (isPreseasonWindow) {
        const totalOnTeam = state.players.filter(p => p.tid === team.id).length;
        const totalSigned = results.filter(r => r.teamId === team.id).length;
        if (totalOnTeam + totalSigned >= maxCampRoster) continue;
      }

      // Count existing two-way players + any signed this round
      const existingTwoWay = state.players.filter(p => p.tid === team.id && !!(p as any).twoWay).length;
      const signedTwoWay = results.filter(r => r.teamId === team.id && !!(r as any).twoWay).length;
      const currentTwoWay = existingTwoWay + signedTwoWay;
      if (currentTwoWay >= maxTwoWay) continue;

      const slotsAvailable = maxTwoWay - currentTwoWay;

      // Pool: low-OVR FAs only — AND must be a young/unproven prospect.
      // Real NBA: 2W contracts are almost exclusively for sub-25 players or
      // ≤2-YOS guys (G-League call-ups, undrafted rookies). Without this gate
      // aging vets like Christian Wood / Terry Rozier whose OVR decayed below
      // the cap get swept into 2W slots — unrealistic, and starves the
      // legitimate young 2W pool. Vets fall through to Pass 4 min-deal.
      // Age is the hard ceiling — YOS≤2 backstop covers undrafted rookies past
      // 24, but age≥30 always blocks regardless of YOS (covers real-player
      // imports whose stats[] may lack gp counts and would falsely pass YOS).
      const twoWayCandidates = pool
        .filter(p => (p.overallRating ?? 99) <= TWO_WAY_OVR_CAP)
        .filter(p => {
          const age = p.born?.year ? currentYear - p.born.year : (p.age ?? 99);
          if (age >= 30) return false;     // hard vet ceiling
          if (age <= 24) return true;
          const yosFromStats = ((p as any).stats ?? [])
            .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
          const draftYr = (p as any).draft?.year;
          const yosFromDraft = (draftYr && currentYear > draftYr) ? currentYear - draftYr : 0;
          const yos = Math.max(yosFromStats, yosFromDraft);
          return yos <= 2;
        })
        .filter(p => !isLoyalBlocked(p, team.id, currentYear))
        .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0)); // best of the fringe first

      let filled = 0;
      for (const candidate of twoWayCandidates) {
        if (filled >= slotsAvailable) break;
        signPlayer(
          candidate,
          team,
          { salaryUSD: TWO_WAY_SALARY_USD, years: 1, hasPlayerOption: false },
          null,
          0,
          true,
        );
        filled++;
      }
    }
  }

  // ── Pass 3: Non-guaranteed training camp signings (slots 16–21) ──────
  // Preseason-only (Jul 1 – Oct 21). Runs before Pass 4 for the same reason
  // as Pass 2 — Pass 4 sorts by salary ASC and would consume NG candidates.
  if (isPreseasonWindow) {
    const NG_OVR_CAP = 60; // fringe prospects / camp bodies
    const minSalaryUSDPreseason = ((state.leagueStats as any).minContractStaticAmount ?? 1.2) * 1_000_000;
    // Anchor NG tiers to a % of the season's salary cap so they inflate
    // automatically as the cap grows year-to-year (matches the rest of
    // EconomyTab which uses cap percentages — MLE, max contract, apron, etc).
    // Reference: NBA $1.27M min ≈ 0.9% of $140M cap; $4M ≈ 2.85%.
    const seasonCap = (thresholds as any).salaryCap ?? 140_000_000;
    const NG_CAP_PCT_BY_OVR: Array<{ maxOvr: number; pct: number }> = [
      { maxOvr: 50, pct: 0.009 },
      { maxOvr: 55, pct: 0.011 },
      { maxOvr: 60, pct: 0.014 },
      { maxOvr: 65, pct: 0.019 },
      { maxOvr: 70, pct: 0.024 },
      { maxOvr: 75, pct: 0.029 },
      { maxOvr: 99, pct: 0.034 },
    ];

    for (const team of sortedAITeams) {
      // Training camp limit is TOTAL (standard + NG + two-way all share the 21 pool)
      const existingAll = state.players.filter(p => p.tid === team.id).length;
      const signedAll = results.filter(r => r.teamId === team.id).length;
      const totalCamp = existingAll + signedAll;
      if (totalCamp >= maxCampRoster) continue;

      const ngSlots = maxCampRoster - totalCamp;
      const ngCandidates = pool
        .filter(p => (p.overallRating ?? 99) <= NG_OVR_CAP)
        .filter(p => !isLoyalBlocked(p, team.id, currentYear))
        .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));

      let filled = 0;
      for (const candidate of ngCandidates) {
        if (filled >= ngSlots) break;
        // NG salary tiered by % of salary cap so deals scale with cap inflation
        // (consistent with MLE/max/apron in EconomyTab). Floor at min contract,
        // ceiling at the top NG tier. Pre-fix every NG landed at ~$4M because
        // market×0.60 always exceeded the 3×min ceiling.
        const ovr = candidate.overallRating ?? 50;
        const tierPct = (NG_CAP_PCT_BY_OVR.find(t => ovr <= t.maxOvr) ?? NG_CAP_PCT_BY_OVR[NG_CAP_PCT_BY_OVR.length - 1]).pct;
        // Stable jitter from internalId so same call yields same salary, but
        // different players at the same OVR don't print the identical number.
        let seed = 0;
        const id = candidate.internalId ?? '';
        for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) | 0;
        const jitter = 0.90 + ((Math.abs(seed) % 200) / 1000); // 0.90 – 1.10
        const target = seasonCap * tierPct * jitter;
        const ngCeiling = seasonCap * NG_CAP_PCT_BY_OVR[NG_CAP_PCT_BY_OVR.length - 1].pct * 1.10;
        const ngSalaryUSD = Math.max(
          minSalaryUSDPreseason,
          Math.min(ngCeiling, Math.round(target / 25_000) * 25_000),
        );
        signPlayer(
          candidate,
          team,
          { salaryUSD: ngSalaryUSD, years: 1, hasPlayerOption: false },
          null,
          0,
          false,
          true,
        );
        filled++;
      }
    }
  }

  // ── Pass 4: Minimum-roster enforcement ────────────────────────────────
  // Teams with < 15 regular-contract players MUST sign someone, even on a
  // minimum contract.  Over-cap teams use the MLE; if MLE is exhausted,
  // minimum-salary FAs can always be signed (league rule).
  //
  // User-team bail-out: normally the user handles their own signings, but if
  // retirement/waiving drops their roster below leagueStats.minPlayersPerTeam,
  // the AI backfills to that minimum (not to 15) so the sim can proceed even
  // when the user is inattentive. Real NBA rule — a team *must* carry 14.
  const minRoster = state.leagueStats?.minPlayersPerTeam ?? 14;
  const userTeamUnderMin = userTeamId >= 0 && (() => {
    const userTeam = state.teams.find(t => t.id === userTeamId);
    if (!userTeam) return false;
    const count = state.players.filter(p => p.tid === userTeamId && !(p as any).twoWay).length;
    return count < minRoster;
  })();
  const pass4Teams = userTeamUnderMin
    ? [...sortedAITeams, state.teams.find(t => t.id === userTeamId)!].filter(Boolean)
    : sortedAITeams;

  // ── Pass 4 diagnostic logging ────────────────────────────────────────
  // Toggle via window.__DEBUG_PASS4 = true in DevTools, or set env flag for tests.
  // Output is structured per-team so we can see exactly why fills fail
  // (cap-blocked, MLE-blocked, pool-empty, signed-N).
  const pass4Debug = typeof window !== 'undefined' && (window as any).__DEBUG_PASS4 === true;
  const pass4Diag: Array<{
    team: string;
    startRoster: number;
    endRoster: number;
    fillTarget: number;
    signedThisPass: number;
    iterations: number;
    poolSizeStart: number;
    poolSizeEnd: number;
    capRejects: number;       // candidates skipped because cap+2M overflow
    mleRejects: number;       // candidates skipped because MLE exhausted/blocked
    forcedMinDeal: boolean;   // last-resort min-deal fired
    stopReason: string;
  }> = [];

  for (const team of pass4Teams) {
    const isUserFill = team.id === userTeamId;
    // For user team in lazy-GM bail-out, fill only up to minRoster (not maxStandard).
    const fillTarget = isUserFill ? minRoster : maxStandard;
    // Count standard roster INCLUDING players we just signed in earlier passes
    const alreadySigned = () => results.filter(r => r.teamId === team.id && !(r as any).twoWay).length;
    const computeRosterSize = () =>
      state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length + alreadySigned();
    let rosterSize = computeRosterSize();
    const startRoster = rosterSize;
    const startSignedCount = alreadySigned();
    const poolSizeStart = pool.length;
    let iterations = 0;
    let capRejects = 0;
    let mleRejects = 0;
    let stopReason = 'reached fill target';
    if (rosterSize >= fillTarget) continue;

    // Inner fill loop — keep signing affordable players until at fillTarget or pool empty.
    // Profile + MLE state change with every signing, so re-fetch each iteration.
    let signedThisIteration = true;
    while (rosterSize < fillTarget && pool.length > 0 && signedThisIteration) {
      signedThisIteration = false;
      iterations++;

      const profile = getTeamCapProfile(
        state.players, team.id,
        (team as any).wins ?? 0, (team as any).losses ?? 0, thresholds,
      );

      const localEntry = localMleUsed.get(team.id);
      const effectiveLS = localEntry
        ? { ...state.leagueStats, mleUsage: { ...(state.leagueStats as any).mleUsage, [team.id]: localEntry } }
        : state.leagueStats;

      // Re-build candidates from current pool (shrinks after each sign).
      // Sort: best OVR first, tiebreak by lowest salary. Earlier this was salary ASC
      // which caused cap-rich teams to sign 15 minimum-tier scrubs before ever
      // looking at the K2 80+ stars they could actually afford. Pass 1 already
      // signs the absolute top of the pool via best-fit; Pass 4 mops up with the
      // best-OVR FA who fits cap, then falls through to min-exception for fringe.
      const candidates = pool
        .filter(p => !isLoyalBlocked(p, team.id, currentYear))
        .map(p => ({
          player: p,
          offer: clampOfferForDate(
            computeContractOffer(p, state.leagueStats as any),
            state.date, currentYear, state.leagueStats,
          ),
        }))
        .sort((a, b) => (b.player.overallRating ?? 0) - (a.player.overallRating ?? 0) || a.offer.salaryUSD - b.offer.salaryUSD);

      // Pass 1 signed by team-payroll burn; here we re-check cap+MLE per candidate.
      // Note: payroll snapshot in `profile` is from BEFORE this round, so reduce
      // capSpace by what this team has signed so far this round.
      const roundSpentUSD = results
        .filter(r => r.teamId === team.id)
        .reduce((s, r) => s + r.salaryUSD, 0);
      const effectiveCapSpace = profile.capSpaceUSD - roundSpentUSD;
      const effectivePayroll  = profile.payrollUSD  + roundSpentUSD;

      for (const { player, offer } of candidates) {
        // Can we afford via cap space?
        if (offer.salaryUSD <= effectiveCapSpace + 2_000_000) {
          signPlayer(player, team, offer);
          signedThisIteration = true;
          rosterSize = computeRosterSize();
          break;
        }
        capRejects++;

        // Can we afford via MLE?
        const mleAvail = getMLEAvailability(team.id, effectivePayroll, offer.salaryUSD, thresholds, effectiveLS as any);
        if (!mleAvail.blocked && mleAvail.type && offer.salaryUSD <= mleAvail.available) {
          const prevUsed = localEntry?.usedUSD ?? 0;
          localMleUsed.set(team.id, { type: mleAvail.type, usedUSD: prevUsed + offer.salaryUSD });
          signPlayer(player, team, offer, mleAvail.type, offer.salaryUSD);
          signedThisIteration = true;
          rosterSize = computeRosterSize();
          break;
        }
        mleRejects++;
      }

      // Inner-loop fallback: NBA minimum exception (unlimited, no cap penalty).
      // If cap+MLE both blocked every candidate this iteration, sign the lowest-OVR
      // available player at minContract. Player accepts the discount in exchange
      // for a roster spot — real-NBA fringe-FA dynamic. Without this, over-cap
      // teams could only sign 1 player per FA round (last-resort), so a team that
      // lost 5+ to retirement/trades could never catch up before the season ends.
      if (!signedThisIteration && pool.length > 0 && rosterSize < fillTarget) {
        const minSalaryUSD = ((state.leagueStats as any).minContractStaticAmount ?? 1.2) * 1_000_000;
        const minDealCandidate = pool
          .filter(p => !isLoyalBlocked(p, team.id, currentYear))
          .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0))[0]; // weakest first — they're the ones who'd accept min
        if (minDealCandidate) {
          signPlayer(
            minDealCandidate,
            team,
            { salaryUSD: minSalaryUSD, years: 1, hasPlayerOption: false },
          );
          signedThisIteration = true;
          rosterSize = computeRosterSize();
        }
      }
      // Note: signedAtMin tracking is per-iteration only; counts via signedThisPass below.
    }

    // Decide stop reason for diagnostics
    if (rosterSize >= fillTarget) stopReason = 'reached fill target';
    else if (pool.length === 0) stopReason = 'pool exhausted';
    else if (!signedThisIteration) stopReason = 'no affordable candidate (all cap+MLE+min blocked — pool empty?)';

    // Old "last resort 1× min-deal" block removed — the inner-loop minimum-exception
    // fallback above now handles this case for every iteration, not just once.
    const forcedMinDeal = false;

    if (pass4Debug) {
      pass4Diag.push({
        team: team.name,
        startRoster,
        endRoster: rosterSize,
        fillTarget,
        signedThisPass: alreadySigned() - startSignedCount,
        iterations,
        poolSizeStart,
        poolSizeEnd: pool.length,
        capRejects,
        mleRejects,
        forcedMinDeal,
        stopReason,
      });
    }
  }

  // Emit diagnostic table after all teams processed
  if (pass4Debug && pass4Diag.length > 0) {
    const underFilled = pass4Diag.filter(d => d.endRoster < d.fillTarget);
    console.log(`[Pass4] ${state.date} — ${pass4Diag.length} teams processed, ${underFilled.length} still below fillTarget after pass`);
    console.table(pass4Diag);
    if (underFilled.length > 0) {
      console.log('[Pass4] Teams still under target after Pass 4:', underFilled.map(d =>
        `${d.team} ${d.endRoster}/${d.fillTarget} (${d.stopReason})`).join(' · '));
    }
  }

  // ── Pass 5: Minimum-payroll floor enforcement ─────────────────────────
  // Teams below the salary floor (leagueStats.minimumPayrollPercentage % of cap,
  // default 90%) must keep signing until they clear it or run out of roster space.
  // NOTE: this pass only helps teams with OPEN roster slots. Teams already at 15/15
  // with cheap rosters need shortfall distribution at season-end (separate function).
  // Offer is priced at max(minSalary, floorGap / openSlots) so each signing closes
  // the gap proportionally rather than forcing a dozen minimum deals.  The per-player
  // ceiling is getContractLimits().maxSalaryUSD so we never manufacture a supermax.
  if ((state.leagueStats as any).minimumPayrollEnabled !== false) {
    const minSalaryUSD = ((state.leagueStats as any).minContractStaticAmount ?? 1.2) * 1_000_000;

    for (const team of sortedAITeams) {
      // Re-compute current roster + what we've signed this round
      const existingStd = state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length;
      const signedStd   = results.filter(r => r.teamId === team.id && !(r as any).twoWay).length;
      let rosterSize    = existingStd + signedStd;
      if (rosterSize >= maxStandard) continue;

      // Re-compute payroll including round signings
      const profile = getTeamCapProfile(
        state.players, team.id,
        (team as any).wins ?? 0, (team as any).losses ?? 0, thresholds,
      );
      const roundSpentUSD = results
        .filter(r => r.teamId === team.id)
        .reduce((s, r) => s + r.salaryUSD, 0);
      let effectivePayroll = profile.payrollUSD + roundSpentUSD;
      if (effectivePayroll >= thresholds.minPayroll) continue;

      let continueLoop = true;
      while (
        effectivePayroll < thresholds.minPayroll &&
        rosterSize < maxStandard &&
        pool.length > 0 &&
        continueLoop
      ) {
        continueLoop = false;

        const openSlots   = maxStandard - rosterSize;
        const floorGap    = thresholds.minPayroll - effectivePayroll;
        // Proportional offer: spread the remaining gap over all open slots.
        // Clamped to [minSalary, player's maxSalary] so it never goes negative
        // and never manufactures a supermax.
        const targetPerSlot = Math.max(minSalaryUSD, Math.round(floorGap / openSlots));

        // Cheapest available FA whose salary ≤ targetPerSlot (we want to spend
        // exactly what's needed, not blow past the floor in one signing)
        const candidate = pool
          .filter(p => !isLoyalBlocked(p, team.id, currentYear))
          .map(p => {
            const limits = getContractLimits(p, state.leagueStats as any);
            const baseOfferRaw = computeContractOffer(p, state.leagueStats as any);
            const baseOffer = clampOfferForDate(baseOfferRaw, state.date, currentYear, state.leagueStats);
            const salaryUSD = Math.min(
              limits.maxSalaryUSD,
              Math.max(minSalaryUSD, Math.min(targetPerSlot, baseOffer.salaryUSD)),
            );
            return { player: p, offer: { ...baseOffer, salaryUSD }, limits };
          })
          .filter(({ offer }) => offer.salaryUSD >= minSalaryUSD)
          .sort((a, b) => b.offer.salaryUSD - a.offer.salaryUSD)[0]; // highest within budget first

        if (!candidate) break;

        signPlayer(candidate.player, team, candidate.offer);
        continueLoop = true;
        rosterSize++;
        effectivePayroll += candidate.offer.salaryUSD;
      }
    }
  }

  return results;
}

// ── Auto-trim oversized rosters ───────────────────────────────────────────────

export interface WaiverResult {
  playerId: string;
  teamId: number;
  playerName: string;
  teamName: string;
  /** Distinguishes standard-roster overflow from two-way overflow so the sim can
   *  apply the right post-waiver status (FA vs. G-League stash). */
  reason?: 'standardExcess' | 'twoWayExcess';
  /** True when the cut player was on a non-guaranteed deal (training camp release). */
  wasNonGuaranteed?: boolean;
}

/**
 * For each AI team over the roster limit, release the lowest-rated player.
 * During the offseason/preseason (July–September, month 7–9), teams may carry up to
 * maxTrainingCampRoster (default 21) players — mimicking NBA training camp rules.
 * Once the regular season starts (October+), the limit drops to maxStandard (15).
 * Two-way contract players (twoWay: true) don't count against the standard 15, but
 * have their own cap (maxTwoWayPlayersPerTeam, default 3) which is enforced here too.
 * G-League assigned players DO count against the standard cap (they're on standard
 * contracts — NBA rule) and are trimmed first since they're already inactive.
 * User's team is never touched.
 *
 * @param month - current simulation month (1-12). Pass undefined to always enforce regular-season limit.
 */
export function autoTrimOversizedRosters(state: GameState, month?: number, day?: number): WaiverResult[] {
  const userTeamId = (state.gameMode === 'gm' && !isAssistantGMActive()) ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? DEFAULT_MAX_ROSTER;
  const maxTrainingCamp = state.leagueStats.maxTrainingCampRoster ?? 21;
  const maxTwoWay = state.leagueStats.maxTwoWayPlayersPerTeam ?? 3;

  // Training camp roster (21) is in effect Jul 1 – Oct 21 (day before opening night).
  // Oct 22+ regular season enforces the standard 15-man cap.
  const isPreseasonPeriod = month !== undefined && (
    (month >= 7 && month <= 9) ||
    (month === 10 && (day === undefined || day <= 21))
  );
  const effectiveLimit = isPreseasonPeriod ? maxTrainingCamp : maxStandard;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const results: WaiverResult[] = [];

  for (const team of state.teams) {
    if (team.id === userTeamId) continue;

    const { wins: ew, losses: el } = effectiveRecord(team, currentYear);
    const gp = ew + el;
    const winPct = gp > 0 ? ew / gp : 0.5;
    const isRebuilding = gp > 0 && winPct < 0.42;
    const isContender = gp > 0 && winPct >= 0.55;

    if (isPreseasonPeriod) {
      // ── Training camp: 21 TOTAL (standard + NG + two-way all share one pool) ──
      const allPlayers = state.players.filter(p => p.tid === team.id);
      if (allPlayers.length > effectiveLimit) {
        const excess = allPlayers.length - effectiveLimit;
        const avgAge = allPlayers.length > 0
          ? allPlayers.reduce((s, p) => s + ((p.born?.year ? currentYear - p.born.year : (p.age ?? 27))), 0) / allPlayers.length
          : 27;
        const sortByPot = isRebuilding || (isContender && avgAge < 27);
        const sortFn = sortByPot
          ? (a: NBAPlayer, b: NBAPlayer) => calcPot2K(a, currentYear) - calcPot2K(b, currentYear)
          : (a: NBAPlayer, b: NBAPlayer) => (a.overallRating ?? 0) - (b.overallRating ?? 0);

        // Cut priority: NG first (free), then G-League stash, then 2W lowest OVR, then standard
        // Players with a relative on this roster are untouchable (nepotism protection).
        const canCut = (p: NBAPlayer) => !hasFamilyOnRoster(p, allPlayers);
        const ngPlayers  = allPlayers.filter(p => canCut(p) && !!(p as any).nonGuaranteed).sort(sortFn);
        const glPlayers  = allPlayers.filter(p => canCut(p) && !(p as any).nonGuaranteed && !!(p as any).gLeagueAssigned).sort(sortFn);
        const twPlayers  = allPlayers.filter(p => canCut(p) && !(p as any).nonGuaranteed && !(p as any).gLeagueAssigned && !!(p as any).twoWay).sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));
        const stdPlayers = allPlayers.filter(p => canCut(p) && !(p as any).nonGuaranteed && !(p as any).gLeagueAssigned && !(p as any).twoWay).sort(sortFn);
        const trimPool = [...ngPlayers, ...glPlayers, ...twPlayers, ...stdPlayers];
        const teamWaivers: WaiverResult[] = [];
        for (let i = 0; i < excess && i < trimPool.length; i++) {
          const p = trimPool[i];
          teamWaivers.push({ playerId: p.internalId, teamId: team.id, playerName: p.name, teamName: team.name, reason: !!(p as any).twoWay ? 'twoWayExcess' : 'standardExcess', wasNonGuaranteed: !!(p as any).nonGuaranteed });
        }
        if (teamWaivers.length > 0) {
          console.log(`[RosterTrim-TC] Month=${month}, team=${team.name}, total=${allPlayers.length}, limit=${effectiveLimit}, trimmed=${teamWaivers.length}: ${teamWaivers.map(w => w.playerName).join(', ')}`);
        }
        results.push(...teamWaivers);
      }
    } else {
      // ── Regular season: standard (15) and two-way (3) are separate buckets ──
      const roster = state.players.filter(p => p.tid === team.id && !(p as any).twoWay);

      if (roster.length > effectiveLimit) {
        const excess = roster.length - effectiveLimit;
        const avgAge = roster.length > 0
          ? roster.reduce((s, p) => s + ((p.born?.year ? currentYear - p.born.year : (p.age ?? 27))), 0) / roster.length
          : 27;
        const sortByPot = isRebuilding || (isContender && avgAge < 27);
        const sortFn = sortByPot
          ? (a: NBAPlayer, b: NBAPlayer) => calcPot2K(a, currentYear) - calcPot2K(b, currentYear)
          : (a: NBAPlayer, b: NBAPlayer) => (a.overallRating ?? 0) - (b.overallRating ?? 0);

        // Players with a relative on this roster are untouchable (nepotism protection).
        const canCut = (p: NBAPlayer) => !hasFamilyOnRoster(p, roster);
        const ngRoster = roster.filter(p => canCut(p) && !!(p as any).nonGuaranteed).sort(sortFn);
        const glPlayers = roster.filter(p => canCut(p) && !(p as any).nonGuaranteed && !!(p as any).gLeagueAssigned).sort(sortFn);
        const nonGL = roster.filter(p => canCut(p) && !(p as any).nonGuaranteed && !(p as any).gLeagueAssigned).sort(sortFn);
        const trimPool = [...ngRoster, ...glPlayers, ...nonGL];
        const teamWaivers: WaiverResult[] = [];
        for (let i = 0; i < excess && i < trimPool.length; i++) {
          const p = trimPool[i];
          teamWaivers.push({ playerId: p.internalId, teamId: team.id, playerName: p.name, teamName: team.name, reason: 'standardExcess', wasNonGuaranteed: !!(p as any).nonGuaranteed });
        }
        if (teamWaivers.length > 0) {
          console.log(`[RosterTrim] Month=${month}, team=${team.name}, roster=${roster.length} (gl=${glPlayers.length}), limit=${effectiveLimit}, sortBy=${sortByPot ? 'POT' : 'OVR'}, trimmed=${teamWaivers.length}: ${teamWaivers.map(w => w.playerName).join(', ')}`);
        }
        results.push(...teamWaivers);
      }

      // Two-way overflow
      const twoWayRoster = state.players.filter(p => p.tid === team.id && !!(p as any).twoWay);
      if (twoWayRoster.length > maxTwoWay) {
        const excess2W = twoWayRoster.length - maxTwoWay;
        const fullRosterForFamilyCheck = state.players.filter(p => p.tid === team.id);
        const sorted2W = [...twoWayRoster]
          .filter(p => !hasFamilyOnRoster(p, fullRosterForFamilyCheck))
          .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));
        const teamTwoWayWaivers: WaiverResult[] = [];
        for (let i = 0; i < excess2W && i < sorted2W.length; i++) {
          const p = sorted2W[i];
          teamTwoWayWaivers.push({ playerId: p.internalId, teamId: team.id, playerName: p.name, teamName: team.name, reason: 'twoWayExcess' });
        }
        if (teamTwoWayWaivers.length > 0) {
          console.log(`[RosterTrim-2W] Month=${month}, team=${team.name}, twoWay=${twoWayRoster.length}, cap=${maxTwoWay}, trimmed=${teamTwoWayWaivers.length}: ${teamTwoWayWaivers.map(w => w.playerName).join(', ')}`);
        }
        results.push(...teamTwoWayWaivers);
      }
    }
  }

  return results;
}

// ── Two-way → Standard promotion (first line of defense for 2W > 3) ─────────
// When a team has fewer than 15 standard players AND more than 3 two-way, AND
// enough cap room, promote the highest-rated excess two-way to a 1-year min deal.
// Runs BEFORE autoTrimOversizedRosters so it can rescue talent that would
// otherwise be waived. Mirrors real-NBA behavior: teams convert two-ways to
// standard contracts during the season to open two-way slots and to lock in
// breakout prospects before rivals poach them.

export interface PromotionResult {
  playerId: string;
  teamId: number;
  playerName: string;
  teamName: string;
  newSalaryUSD: number;   // full-USD annual salary on the new standard deal
  contractExp: number;    // ending season year of the new deal
}

export function autoPromoteTwoWayExcess(state: GameState, month?: number): PromotionResult[] {
  const userTeamId = (state.gameMode === 'gm' && !isAssistantGMActive()) ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? DEFAULT_MAX_ROSTER;
  const maxTwoWay = 3;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  // During Jul–Sep training-camp window the standard-limit expansion doesn't matter
  // for promotion since preseason trim is separate. We still use the regular limit.
  const isPreseasonPeriod = month !== undefined && month >= 7 && month <= 9;
  if (isPreseasonPeriod) return []; // let normal FA/trim handle training camp

  const thresholds = getCapThresholds(state.leagueStats);

  const results: PromotionResult[] = [];

  for (const team of state.teams) {
    if (team.id === userTeamId) continue;

    const teamPlayers = state.players.filter(p => p.tid === team.id);
    const standard = teamPlayers.filter(p => !(p as any).twoWay && !(p as any).gLeagueAssigned);
    const twoWay   = teamPlayers.filter(p => !!(p as any).twoWay);

    if (standard.length >= maxStandard) continue;
    if (twoWay.length <= maxTwoWay) continue;

    const slotsOpen = maxStandard - standard.length;
    const excess2W  = twoWay.length - maxTwoWay;
    let toPromote   = Math.min(slotsOpen, excess2W);
    if (toPromote <= 0) continue;

    const payrollUSD = teamPlayers.reduce((s, p) => s + (((p.contract?.amount as number) || 0) * 1_000), 0);

    // Pick highest-OVR two-ways (they've earned the standard deal)
    const candidates = [...twoWay].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));

    let projectedPayroll = payrollUSD;

    for (const p of candidates) {
      if (toPromote <= 0) break;

      // Fresh 1-year standard deal. Real NBA 2W→standard promotions are min /
      // pro-rated min — Tyreke Key's $10.8M promotion was the regression. Cap
      // at 2× league min (~$2.5M) so role-player promotions stay realistic;
      // genuine breakouts can still get a real standard deal next FA window.
      const offer = computeContractOffer(p, state.leagueStats, [], 0);
      const minSalaryUSD = ((state.leagueStats as any).minContractStaticAmount ?? 1.273) * 1_000_000;
      const promotionCapUSD = minSalaryUSD * 2;
      const newSalaryUSD = Math.min(offer.salaryUSD, promotionCapUSD);
      const currentSalaryUSD = ((p.contract?.amount as number) || 0) * 1_000;
      const netIncrease = Math.max(0, newSalaryUSD - currentSalaryUSD);

      // Hard-cap: skip if the bump would push team over the 2nd apron.
      if (projectedPayroll + netIncrease > thresholds.secondApron) break;

      results.push({
        playerId: p.internalId,
        teamId: team.id,
        playerName: p.name,
        teamName: team.name,
        newSalaryUSD,
        contractExp: currentYear,
      });
      projectedPayroll += netIncrease;
      toPromote--;
    }
  }

  if (results.length > 0) {
    const byTeam: Record<string, string[]> = {};
    for (const r of results) {
      if (!byTeam[r.teamName]) byTeam[r.teamName] = [];
      byTeam[r.teamName].push(r.playerName);
    }
    console.log(`[TwoWayPromotion] Month=${month}, promoted ${results.length} players: ${Object.entries(byTeam).map(([t, ns]) => `${t}(${ns.join(', ')})`).join('; ')}`);
  }

  return results;
}

// ── Mid-season extensions ─────────────────────────────────────────────────────


export interface ExtensionResult {
  playerId: string;
  teamId: number;
  playerName: string;
  teamName: string;
  newAmount: number;      // millions (annual)
  newExp: number;         // season year the new contract expires
  newYears: number;       // number of seasons
  hasPlayerOption: boolean;
  declined: boolean;
  /** 'Supermax' | 'Rose Rule' | 'Rookie Ext' — shown in transaction log. */
  contractLabel?: string;
}

/** @deprecated Use computeContractOffer() from salaryUtils instead. */
function _legacyEstimateMarketValueUSD_unused(player: NBAPlayer, seasonYear: number): number {
  const lastRating = (player as any).ratings?.[(player as any).ratings.length - 1];
  const ovr = player.overallRating ?? lastRating?.ovr ?? 60;
  const base = Math.max(0, ovr - 60) * 1_000_000;
  const age = player.age ?? ((player as any).born?.year ? seasonYear - (player as any).born.year : 27);
  const agePenalty = age > 30 ? (age - 30) * 500_000 : 0;
  return Math.max(2_000_000, base - agePenalty);
}

/**
 * Run one round of AI mid-season extensions.
 *
 * Targets players whose contract expires at the END of the current season
 * (contract.exp === leagueStats.year) who are still on an AI-controlled team.
 * Mood score from computeMoodScore drives willingness:
 *
 *   LOYAL trait   → 90% base chance (always wants to stay)
 *   score >= 6    → 80% chance
 *   score >= 2    → 60% chance
 *   score >= -2   → 35% chance
 *   score < -2    → 10% chance (unhappy, likely to test FA market)
 *
 * MERCENARY gets a 25% pay bump on offer; COMPETITOR won't re-sign if team
 * win% < 40% and player OVR >= 80.
 *
 * Returns an array of mutations: players who accepted get updated contract,
 * players who declined are flagged so news/lazylog can report it.
 */
export function runAIMidSeasonExtensions(state: GameState): ExtensionResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];

  const currentYear = state.leagueStats.year;
  const results: ExtensionResult[] = [];

  // Only AI teams — in GM mode skip the user's managed team. In commissioner mode every team is AI,
  // so use a sentinel id that can't match any real franchise.
  const userTeamId = (state.gameMode === 'gm' && !isAssistantGMActive()) ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;

  // Players expiring at end of this season, on AI teams, not already extended.
  // yearsWithTeam ≥ 1 gates out players who just signed mid-season — extending
  // a player days after a fresh waiver-and-resign chain produces duplicate
  // "re-signed" labels in the same offseason (Aaron Bradshaw case).
  const expiringPlayers = state.players.filter(p => {
    if (!p.contract) return false;
    if (p.contract.exp !== currentYear) return false;
    if (p.tid <= 0) return false;                      // not on a real team
    if (p.tid === userTeamId) return false;            // user handles their own
    if ((p as any).status === 'Retired') return false;
    if ((p as any).midSeasonExtensionDeclined) return false; // already declined this season
    if (((p as any).yearsWithTeam ?? 0) < 1) return false;   // signed too recently to extend
    return true;
  });

  if (expiringPlayers.length === 0) return [];

  for (const player of expiringPlayers) {
    const team = state.teams.find(t => t.id === player.tid);
    if (!team) continue;

    const traits: MoodTrait[] = (player as any).moodTraits ?? [];
    const teamPlayers = state.players.filter(p => p.tid === player.tid);
    const { score } = computeMoodScore(
      player,
      team,
      state.date,
      false, false, false,
      teamPlayers,
    );

    // ── Acceptance probability ───────────────────────────────────────────
    let basePct: number;
    if (traits.includes('LOYAL')) {
      basePct = 0.90;
    } else if (score >= 6) {
      basePct = 0.80;
    } else if (score >= 2) {
      basePct = 0.60;
    } else if (score >= -2) {
      basePct = 0.35;
    } else {
      basePct = 0.10;
    }

    // COMPETITOR won't re-sign with a struggling team
    const gp = (team.wins ?? 0) + (team.losses ?? 0);
    const winPct = gp > 0 ? (team.wins ?? 0) / gp : 0.5;
    // BBGM 60 ≈ K2 ~84 (solid starter) — a real competitor who'd leave a losing team
    if (traits.includes('COMPETITOR') && winPct < 0.40 && (player.overallRating ?? 0) >= 60) {
      basePct = Math.min(basePct, 0.10);
    }

    // Deterministic "roll" seeded by player id + year so it's stable across saves
    let seed = 0;
    for (let i = 0; i < player.internalId.length; i++) seed += player.internalId.charCodeAt(i);
    seed += currentYear * 31;
    const roll = (Math.sin(seed) * 10000) % 1;
    const accepted = roll > 0 && (Math.abs(roll) - Math.floor(Math.abs(roll))) < basePct;

    // ── Contract offer (uses full formula from §6c) ──────────────────────
    // Force hasBirdRights:true — extensions are always own-team re-signings.
    // The rollover sets hasBirdRights at Jun 30, but extensions fire before it,
    // so a 3rd-year player's flag is still false from last rollover.
    const playerForExt = { ...player, hasBirdRights: true } as typeof player;
    const baseExtensionOffer = computeContractOffer(
      playerForExt,
      state.leagueStats as any,
      traits,
      score,
    );
    // spending: GM personality scales the extension offer up or down, clamped at max contract
    const extLimits = getContractLimits(playerForExt, state.leagueStats as any);
    const extensionOffer = {
      ...baseExtensionOffer,
      salaryUSD: clampSpendOffer(baseExtensionOffer.salaryUSD, getGMAttributes(state, player.tid).spending, extLimits.maxSalaryUSD),
    };
    const offerUSD = extensionOffer.salaryUSD;
    const extensionYears = extensionOffer.years;

    results.push({
      playerId: player.internalId,
      teamId: player.tid,
      playerName: player.name,
      teamName: team.name,
      newAmount: Math.round(offerUSD / 100_000) / 10,  // rounded to $0.1M
      newExp: currentYear + extensionYears,
      newYears: extensionYears,
      hasPlayerOption: extensionOffer.hasPlayerOption,
      declined: !accepted,
      contractLabel: extLimits.isSupermaxEligible ? 'Supermax'
        : (extLimits.isRookieExtEligible && extLimits.rookieRoseQualified) ? 'Rose Rule'
        : extLimits.isRookieExtEligible ? 'Rookie Ext'
        : undefined,
    });
  }

  return results;
}

// ── Season-End Extensions (May–June) ─────────────────────────────────────────

/**
 * Run season-end extension offers in the May–June window (after awards are set,
 * before the June 30 rollover opens free agency).
 *
 * Unlike mid-season extensions (Oct–Feb), this window:
 *  - Targets rotation players+ on AI teams with expiring contracts (OVR ≥ 72)
 *  - Higher base acceptance — Bird Rights advantage, team/player both know the stakes
 *  - Supermax-eligible players get the full designated-veteran offer via computeContractOffer
 *  - Players who already declined a mid-season extension are skipped
 */
export function runAISeasonEndExtensions(state: GameState): ExtensionResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];

  const currentYear = state.leagueStats.year;
  const results: ExtensionResult[] = [];
  const userTeamId = (state.gameMode === 'gm' && !isAssistantGMActive()) ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;

  const expiringPlayers = state.players.filter(p => {
    if (!p.contract) return false;
    if (p.contract.exp !== currentYear) return false;
    if (p.tid <= 0) return false;
    if (p.tid === userTeamId) return false;
    if ((p as any).status === 'Retired') return false;
    if ((p as any).midSeasonExtensionDeclined) return false; // already said no once this season
    if (((p as any).yearsWithTeam ?? 0) < 1) return false;    // see runAIMidSeasonExtensions — same gate
    // BBGM 47 = K2 ~72 (rotation-level per salary tiers in salaryUtils.ts)
    if ((p.overallRating ?? 0) < 47) return false;           // only rotation-level and above (BBGM 47+)
    return true;
  });

  if (expiringPlayers.length === 0) return [];

  for (const player of expiringPlayers) {
    const team = state.teams.find(t => t.id === player.tid);
    if (!team) continue;

    const traits: MoodTrait[] = (player as any).moodTraits ?? [];
    const teamPlayers = state.players.filter(p => p.tid === player.tid);
    const { score } = computeMoodScore(player, team, state.date, false, false, false, teamPlayers);

    // Higher acceptance than mid-season — end of year, clearer picture
    let basePct: number;
    if (traits.includes('LOYAL')) {
      basePct = 0.95;
    } else if (score >= 4) {
      basePct = 0.85;
    } else if (score >= 0) {
      basePct = 0.70;
    } else if (score >= -3) {
      basePct = 0.45;
    } else {
      basePct = 0.15; // very unhappy — wants out
    }

    if (traits.includes('COMPETITOR')) {
      const gp = (team.wins ?? 0) + (team.losses ?? 0);
      const winPct = gp > 0 ? (team.wins ?? 0) / gp : 0.5;
      // BBGM 62 ≈ K2 ~86 (All-Star tier) — star-level competitor won't re-sign with a loser
      if (winPct < 0.45 && (player.overallRating ?? 0) >= 62) basePct = Math.min(basePct, 0.20);
    }

    // Different seed than mid-season so the same player doesn't always get the same outcome
    let seed = 0;
    for (let i = 0; i < player.internalId.length; i++) seed += player.internalId.charCodeAt(i);
    seed += (currentYear + 7) * 53;
    const roll = Math.abs((Math.sin(seed) * 10000) % 1);
    const accepted = roll < basePct;

    const playerForSEExt = { ...player, hasBirdRights: true } as typeof player;
    const baseExtensionOffer = computeContractOffer(playerForSEExt, state.leagueStats as any, traits, score);
    const seLimits = getContractLimits(playerForSEExt, state.leagueStats as any);
    const extensionOffer = {
      ...baseExtensionOffer,
      salaryUSD: clampSpendOffer(baseExtensionOffer.salaryUSD, getGMAttributes(state, player.tid).spending, seLimits.maxSalaryUSD),
    };

    results.push({
      playerId: player.internalId,
      teamId: player.tid,
      playerName: player.name,
      teamName: team.name,
      newAmount: Math.round(extensionOffer.salaryUSD / 100_000) / 10,
      newExp: currentYear + extensionOffer.years,
      newYears: extensionOffer.years,
      hasPlayerOption: extensionOffer.hasPlayerOption,
      declined: !accepted,
      contractLabel: seLimits.isSupermaxEligible ? 'Supermax'
        : (seLimits.isRookieExtEligible && seLimits.rookieRoseQualified) ? 'Rose Rule'
        : seLimits.isRookieExtEligible ? 'Rookie Ext'
        : undefined,
    });
  }

  return results;
}

// ── MLE Upgrade Swap ─────────────────────────────────────────────────────────
// Once per month (on a team-seeded random day), over-cap teams scan the FA pool
// for a player whose market value fits their available MLE AND beats their weakest
// guaranteed player by OVR (contending) or POT (rebuilding). If found: sign via
// MLE, waive the weakest. Capped at 1 swap per team per trigger.

// ── Pass 0: Bird Rights re-sign (fires Jul 1, before tickFAMarkets) ──────────
//
// Real NBA: Bird Rights teams get a "first look" window on their expiring stars
// before the open market opens. Without this, expiring stars who declined a
// mid-season extension (one bad seeded roll) fall straight into the FA market —
// where their incumbent team often can't bid (over-cap, no Bird Rights gate
// in legacy generateAIBids). Result: Finals contenders lose their own players
// for nothing. This pass gives priorTid a guaranteed re-sign attempt at +10%
// premium with 85% acceptance rate. Mid-season extension flag gets cleared.

function birdRightsSeed(playerId: string, year: number): number {
  let h = 0;
  const seed = `bird_rights_${playerId}_${year}`;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function getPriorNbaTid(player: NBAPlayer): number {
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

export interface BirdRightsResignResult {
  playerId: string;
  playerName: string;
  teamId: number;
  teamName: string;
  salaryUSD: number;
  years: number;
  hasPlayerOption: boolean;
  isSupermax: boolean;
}

/**
 * Pass 0 Bird Rights re-sign. Fires once on Jul 1 right after rollover.
 * Returns mutations + history entries for resigned players. Caller must apply.
 */
export function runAIBirdRightsResigns(state: GameState): BirdRightsResignResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];
  const currentYear = state.leagueStats.year;
  const userTeamId = (state.gameMode === 'gm' && !isAssistantGMActive())
    ? ((state as any).userTeamId ?? -999) : -999;
  const thresholds = getCapThresholds(state.leagueStats as any);
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? DEFAULT_MAX_ROSTER;
  const results: BirdRightsResignResult[] = [];
  // Track per-team re-signs so a single team doesn't blow its roster on one pass
  const signedByTeam = new Map<number, number>();

  // Eligible: FAs with hasBirdRights, K2 >= 75, prior NBA team known.
  const candidates = state.players
    .filter(p => p.tid === -1 && p.status === 'Free Agent')
    .filter(p => resolveBirdRights(p))
    .filter(p => !((p as any).draft?.year >= currentYear));

  for (const player of candidates) {
    const priorTid = getPriorNbaTid(player);
    if (priorTid < 0) continue;
    if (priorTid === userTeamId) continue; // user handles their own
    const priorTeam = state.teams.find(t => t.id === priorTid);
    if (!priorTeam) continue;

    // K2 >= 75 — only meaningful re-signs. Min-vet / fringe go to open market.
    const lastR = (player as any).ratings?.[(player as any).ratings?.length - 1];
    const k2 = convertTo2KRating(player.overallRating ?? 60, lastR?.hgt ?? 50, lastR?.tp ?? 50);
    if (k2 < 75) continue;

    // Roster check — can't re-sign over the standard cap (15-man).
    const existingStandard = state.players.filter(p => p.tid === priorTid && !(p as any).twoWay).length;
    const signedThisPass = signedByTeam.get(priorTid) ?? 0;
    if (existingStandard + signedThisPass >= maxStandard) continue;

    // Cap-of-cap check — second-apron teams skip (real-NBA cap death; they'd lose
    // the player to a tax penalty rather than re-sign). Lux-tax teams still bid.
    const payroll = state.players
      .filter(p => p.tid === priorTid && !(p as any).twoWay)
      .reduce((s, p) => s + ((p.contract?.amount ?? 0) * 1_000), 0);
    if (thresholds.secondApron && payroll >= thresholds.secondApron) continue;

    // Bird Rights premium: +10% over computed market value.
    const baseOffer = computeContractOffer(player, state.leagueStats as any);
    const limits = getContractLimits(player, state.leagueStats as any);
    const premiumSalary = Math.min(
      Math.round(baseOffer.salaryUSD * 1.10),
      Math.round(limits.maxSalaryUSD),
    );

    // Mood gate — very unhappy stars (< -2) decline; LOYAL always re-signs.
    const traits: MoodTrait[] = (player as any).moodTraits ?? [];
    const teamPlayers = state.players.filter(p => p.tid === priorTid);
    const { score: moodScore } = computeMoodScore(player, priorTeam, state.date, false, false, false, teamPlayers);
    if (moodScore < -2 && !traits.includes('LOYAL')) continue;

    // Acceptance: LOYAL → 0.95, MERCENARY → 0.65 (chases money), default → 0.85.
    const basePct = traits.includes('LOYAL') ? 0.95
                  : traits.includes('MERCENARY') ? 0.65
                  : 0.85;
    const roll = birdRightsSeed(player.internalId, currentYear);
    if (roll >= basePct) continue;

    results.push({
      playerId: player.internalId,
      playerName: player.name,
      teamId: priorTid,
      teamName: priorTeam.name,
      salaryUSD: premiumSalary,
      years: baseOffer.years,
      hasPlayerOption: baseOffer.hasPlayerOption,
      isSupermax: !!(player as any).superMaxEligible,
    });
    signedByTeam.set(priorTid, signedThisPass + 1);
  }

  return results;
}

export interface MleSwapResult {
  sign: SigningResult;
  waive: WaiverResult;
}

export function runAIMleUpgradeSwaps(
  state: GameState,
  simMonth: number,
  simDay: number,
): MleSwapResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];

  const userTeamId = (state.gameMode === 'gm' && !isAssistantGMActive())
    ? ((state as any).userTeamId ?? -999) : -999;

  const thresholds   = getCapThresholds(state.leagueStats as any);
  const currentYear  = state.leagueStats.year;
  const maxStandard  = state.leagueStats.maxStandardPlayersPerTeam ?? DEFAULT_MAX_ROSTER;
  const minSalaryUSD = ((state.leagueStats as any).minContractStaticAmount ?? 1.2) * 1_000_000;

  const freeAgents = state.players.filter(p =>
    p.status === 'Free Agent' &&
    !((p as any).draft?.year >= currentYear) &&
    !p.hof
  );

  const results: MleSwapResult[] = [];

  for (const team of state.teams) {
    if (team.id === userTeamId) continue;
    const strategy = resolveTeamStrategyProfile({
      team,
      players: state.players,
      teams: state.teams,
      leagueStats: state.leagueStats,
      currentYear,
      gameMode: state.gameMode,
      userTeamId: (state as any).userTeamId,
    });
    if (!strategy.initiateBuyTrades) continue;

    // Each team fires on its own seeded day (1-28) to spread swaps across the month
    const seed = (team.id * 7 + simMonth * 13) % 28;
    if (simDay !== seed + 1) continue;

    // Only over-cap teams (MLE territory) — teams with cap room use the normal path
    const profile = getTeamCapProfile(
      state.players, team.id,
      (team as any).wins ?? 0, (team as any).losses ?? 0, thresholds,
    );
    if (profile.capSpaceUSD > 2_000_000) continue;

    const mle = getMLEAvailability(team.id, profile.payrollUSD, 0, thresholds, state.leagueStats as any);
    if (!mle.type || mle.blocked || mle.available < minSalaryUSD) continue;

    // Guaranteed standard roster only (NG players are already the expendable tier)
    const guaranteedRoster = state.players.filter(p =>
      p.tid === team.id && !(p as any).twoWay && !(p as any).nonGuaranteed && p.status === 'Active'
    );
    if (guaranteedRoster.length < maxStandard) continue; // open slot — no swap needed

    // Buyers sort by current impact, development teams by upside.
    const sortScore = (p: NBAPlayer) => (strategy.key === 'rebuilding' || strategy.key === 'development')
      ? calcPot2K(p, currentYear)
      : (p.overallRating ?? 0);

    const weakest = [...guaranteedRoster]
      .filter(p => !hasFamilyOnRoster(p, guaranteedRoster))
      .sort((a, b) => sortScore(a) - sortScore(b))[0];
    if (!weakest) continue;
    const weakestScore = sortScore(weakest);

    // Best FA whose salary ≤ MLE available and who beats the weakest player.
    // MLE swaps fire mid-season (over-cap teams upgrading bench) — date-clamp
    // applies the same length cap + decay as Pass 1. Was the path responsible
    // for Cameron Johnson Oct 26 $42M/3yr regression.
    const gmSpending = getGMAttributes(state, team.id).spending;
    const candidate = freeAgents
      .filter(p => {
        if (isLoyalBlocked(p, team.id, currentYear)) return false;
        const limits  = getContractLimits(p, state.leagueStats as any);
        const rawOffer = computeContractOffer(p, state.leagueStats as any);
        const offer   = clampOfferForDate(rawOffer, state.date, currentYear, state.leagueStats);
        const salary  = clampSpendOffer(offer.salaryUSD, gmSpending, limits.maxSalaryUSD);
        return salary <= mle.available && sortScore(p) > weakestScore;
      })
      .sort((a, b) => sortScore(b) - sortScore(a))[0];

    if (!candidate) continue;

    const baseOfferRaw = computeContractOffer(candidate, state.leagueStats as any);
    const baseOffer    = clampOfferForDate(baseOfferRaw, state.date, currentYear, state.leagueStats);
    const limits       = getContractLimits(candidate, state.leagueStats as any);
    const salaryUSD    = Math.min(mle.available, clampSpendOffer(baseOffer.salaryUSD, gmSpending, limits.maxSalaryUSD));

    results.push({
      sign: {
        playerId:        candidate.internalId,
        teamId:          team.id,
        playerName:      candidate.name,
        teamName:        team.name,
        salaryUSD,
        contractYears:   baseOffer.years,
        contractExp:     currentYear + baseOffer.years - 1,
        hasPlayerOption: baseOffer.hasPlayerOption,
        mleTypeUsed:     mle.type as MleType,
        mleAmountUSD:    salaryUSD,
      },
      waive: {
        playerId:   weakest.internalId,
        teamId:     team.id,
        playerName: weakest.name,
        teamName:   team.name,
        reason:     'standardExcess',
      },
    });
  }

  return results;
}
