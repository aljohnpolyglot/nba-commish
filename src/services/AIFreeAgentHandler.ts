/**
 * AIFreeAgentHandler.ts
 *
 * Autonomous AI free-agent signings + mid-season extensions.
 * Spec: multiseason_todo.md §3
 */

import type { GameState, NBAPlayer, NBATeam } from '../types';
import { getCapThresholds, getTeamCapProfileFromState, computeContractOffer, getMLEAvailability, effectiveRecord, getContractLimits, hasBirdRights as resolveBirdRights, seasonLabelToYear, getTeamDeadMoneyForSeason, contractToUSD } from '../utils/salaryUtils';
import type { MleType } from '../utils/salaryUtils';
import { convertTo2KRating } from '../utils/helpers';
import { SettingsManager } from './SettingsManager';
import { computeMoodScore } from '../utils/mood/moodScore';
import type { MoodTrait } from '../utils/mood/moodTypes';
import { calcPot2K } from './trade/tradeValueEngine';
import { isAssistantGMActive } from './assistantGMFlag';
import { getGMAttributes, clampSpendOffer, workEthicSignProb } from './staff/gmAttributes';
import { hasFamilyOnRoster } from '../utils/familyTies';
import { resolveTeamStrategyProfile, type TeamStrategyProfile } from '../utils/teamStrategy';

const DEFAULT_MAX_ROSTER = 15;
// Guaranteed contracts should not be waived immediately after signing. The old
// 30-day guard let 31-60 day sign-and-waive churn book dead money; 60 days
// covers the common Oct/Nov fringe-signing cycle without blocking season-long
// roster management.
const RECENT_SIGNING_GRACE_DAYS = 60;

// Mid-season offer clamp: caps length and decays salary post-Oct 21 to mirror faMarketTicker.

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
  playerK2?: number,
): DateClampedOffer {
  if (!stateDate) return offer;
  const dt = new Date(stateDate);
  if (isNaN(dt.getTime())) return offer;
  const m = dt.getMonth() + 1;
  const day = dt.getDate();
  const isOffseason = (m >= 7 && m <= 9) || (m === 10 && day <= 21);
  if (isOffseason) return offer; // pre-Oct 21 — full FA terms

  // Length cap: post-Oct 21 stars (K2 ≥ 80) → 2yr; everyone else (incl. Jan+ / past deadline) → 1yr.
  const isAfterJan1 = m >= 1 && m <= 6;
  const isStar = (playerK2 ?? 0) >= 80;
  const yearsCap = isStar && !isAfterJan1 ? 2 : 1;
  const finalYears = Math.min(offer.years, yearsCap);

  // Salary decay: late-Oct/Nov/Dec ×0.55, Jan ×0.35, Feb-Jun ×0.20.
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
 * Returns true if `team` has waived this player in the last 90 days.
 * Prevents Bufkin/Hall/Bassey waiver→re-sign churn within the same team.
 * NG releases ("Training Camp Release") don't trigger this — those weren't real cuts.
 */
function isRecentWaiverByTeam(player: NBAPlayer, teamId: number, currentDate: string | undefined): boolean {
  const waivedBy = (player as any).recentlyWaivedBy;
  const waivedDate = (player as any).recentlyWaivedDate;
  if (waivedBy !== teamId || !waivedDate || !currentDate) return false;
  const days = (new Date(currentDate).getTime() - new Date(waivedDate).getTime()) / (1000 * 60 * 60 * 24);
  // 90-day cooldown (was 30): real NBA effectively bans waive-then-re-sign within
  // the same season at higher salaries (CBA Article VII §10). CHA waived Coby
  // White Aug 29, re-signed him Oct 2 for $67M/3yr (5× the prior salary) — exactly
  // the abuse this rule prevents in real life. 90 days catches Aug→Oct cycles
  // while still allowing legitimate Jul→Oct buyout-market signings the next year.
  return days >= 0 && days < 90;
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
  effectivePayroll?: number;
  thresholds?: { firstApron: number; secondApron: number; salaryCap: number };
  mood: number;
}): number {
  const { player, team, state, strategy, offer, effectiveCapSpace, effectivePayroll, thresholds, mood } = args;
  const currentYear = state.leagueStats.year;
  const teamPlayers = state.players.filter(p => p.tid === team.id);
  const k2 = getK2Ovr(player);
  const pot = calcPot2K(player, currentYear);
  const age = playerAge(player, currentYear);
  const need = positionNeedScore(teamPlayers, player);
  const agePenalty = Math.max(0, age - strategy.preferredFreeAgentMaxAge) * 3.5 * strategy.agePenaltyWeight;
  // Asymmetric loss aversion on length: ^1.6 makes 4yr hit ~5× the 2yr hit.
  const yearsOver = Math.max(0, offer.years - strategy.preferredContractYears);
  const lengthPenalty = Math.pow(yearsOver, 1.6) * 7 * strategy.capFlexWeight;
  const overCapPenalty = effectiveCapSpace > 0
    ? Math.max(0, offer.salaryUSD - effectiveCapSpace) / 1_000_000 * 1.75 * strategy.capFlexWeight
    : 0;

  // Future-cap awareness: penalize multi-year deals that push team past 1st/2nd apron.
  let apronPenalty = 0;
  if (thresholds && effectivePayroll !== undefined && offer.years > 1) {
    const projectedNextYrPayroll = effectivePayroll + offer.salaryUSD;
    const overhang1st = Math.max(0, projectedNextYrPayroll - thresholds.firstApron);
    const overhang2nd = Math.max(0, projectedNextYrPayroll - thresholds.secondApron);
    apronPenalty = (overhang1st / 1_000_000) * 1.2 * strategy.capFlexWeight
                 + (overhang2nd / 1_000_000) * 2.0 * strategy.capFlexWeight;
  }

  // Dead-money awareness: discourage multi-year mid-K2 deals when team is carrying past mistakes.
  let deadMoneyPenalty = 0;
  if (thresholds && offer.years > 1) {
    const teamRecord = state.teams.find(t => t.id === team.id);
    const deadThisYr = getTeamDeadMoneyForSeason(teamRecord, currentYear);
    const deadPctOfCap = deadThisYr / thresholds.salaryCap;
    if (deadPctOfCap > 0.05 && k2 < 80) {
      deadMoneyPenalty = (deadPctOfCap - 0.05) * 200 * strategy.capFlexWeight;
    }
  }

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
    overCapPenalty -
    apronPenalty -
    deadMoneyPenalty
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
  const profile = getTeamCapProfileFromState(state, team.id, thresholds);
  const effectiveCapSpace = Math.max(0, profile.capSpaceUSD - roundSpentUSD);
  const effectivePayroll  = profile.payrollUSD + roundSpentUSD;

  const gmSpending = getGMAttributes(state, team.id).spending;

  // Dead-money load gate: > 8% cap dead → hard-block multi-year deals to sub-80 K2.
  const deadThisYr = getTeamDeadMoneyForSeason(team, state.leagueStats.year);
  const deadHeavy = (deadThisYr / (thresholds.salaryCap || 140_000_000)) > 0.08;

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
      // K2 < 75 is Pass 3 (NG/camp) territory — never a guaranteed multi-year deal.
      if (k2 < 75 && offer.years > 1) return false;
      if (deadHeavy && k2 < 80 && offer.years > 1) return false;
      if (strategy.key === 'cap_clearing' && offer.years > 1) return false;
      // Rebuilder discipline: tankers don't lock in mid-tier multi-year deals.
      // Pre-fix the gate was only `age ≥ 29` so a 26yo K2 75 vet still got
      // 3-year deals from rebuilders. Real NBA: BKN/MEM/UTA tier teams sign
      // 1-year flier deals only (or true young stars at K2 80+).
      if ((strategy.key === 'rebuilding' || strategy.key === 'development') && k2 < 80 && offer.years > 1) return false;
      if (!strategy.initiateBuyTrades && age >= 31 && offer.years > strategy.preferredContractYears) return false;
      if (strategy.initiateBuyTrades && k2 < 72 && offer.years > 1) return false;
      if (playerMoodForTeam(p, team, state) < 0.85) return false;
      if (isLoyalBlocked(p, team.id, state.leagueStats.year)) return false;
      if (isRecentWaiverByTeam(p, team.id, state.date)) return false;
      return true;
    })
    .sort((a, b) => {
      const aOffer = clampOfferForDate(computeContractOffer(a, state.leagueStats as any), state.date, state.leagueStats.year, state.leagueStats, getK2Ovr(a));
      const bOffer = clampOfferForDate(computeContractOffer(b, state.leagueStats as any), state.date, state.leagueStats.year, state.leagueStats, getK2Ovr(b));
      const aScore = scoreFreeAgentFit({
        player: a,
        team,
        state,
        strategy,
        offer: aOffer,
        effectiveCapSpace,
        effectivePayroll,
        thresholds,
        mood: playerMoodForTeam(a, team, state),
      });
      const bScore = scoreFreeAgentFit({
        player: b,
        team,
        state,
        strategy,
        offer: bOffer,
        effectiveCapSpace,
        effectivePayroll,
        thresholds,
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

  // Pass 1/4 always cap at 15; slots 16–21 belong to Pass 2 (2W) and Pass 3 (NG).
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? state.leagueStats.maxPlayersPerTeam ?? DEFAULT_MAX_ROSTER;

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

  // ── Preseason window check (used by Two-way + NG passes + camp-invite) ──
  // Lifted to the top so all passes (including Pass 1) can gate on it without
  // duplicating logic. Note: ngEnabled is referenced by isCampInvite below.
  const ngEnabled = (state.leagueStats as any).nonGuaranteedContractsEnabled ?? true;
  const maxCampRoster = state.leagueStats.maxTrainingCampRoster ?? 21;
  const simDateMonth = state.date ? new Date(state.date).getMonth() + 1 : 0;
  const simDateDay   = state.date ? new Date(state.date).getDate() : 0;
  const isPreseasonWindow = ngEnabled && (
    (simDateMonth >= 7 && simDateMonth <= 9) ||
    (simDateMonth === 10 && simDateDay <= 21)
  );

  // Exhibit-10 / camp invite detector — any 1-year preseason min-tier deal lands as NG so the
  // Oct 22 trim cuts them free instead of booking $4-5M dead money per release. Real-NBA pattern:
  // bench/G-League-tier summer signings are almost always partially-or-non-guaranteed for exactly
  // this reason. Bands:
  //   ≤ 5% of cap + ovr < 78  → NG (covers full vet-min and most rotation min-deals)
  //   ≤ 7% of cap + ovr < 72  → NG (low-tier mid-range bench fillers)
  //   ≤ 9% of cap + ovr < 65  → NG (deep bench / G-League call-ups)
  const isCampInvite = (
    player: NBAPlayer,
    offer: { salaryUSD: number; years: number },
  ): boolean => {
    if (!ngEnabled || !isPreseasonWindow) return false;
    if (offer.years > 1) return false;
    const seasonCap = (thresholds as any).salaryCap ?? 140_000_000;
    const offerPct = offer.salaryUSD / seasonCap;
    const ovr = player.overallRating ?? 0;
    if (offerPct <= 0.050 && ovr < 78) return true;
    if (offerPct <= 0.070 && ovr < 72) return true;
    if (offerPct <= 0.090 && ovr < 65) return true;
    return false;
  };

  // ── Pass 1: Best-fit signings via cap space + MLE; loops until roster full or cap exhausted.
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

      // Date-clamp before the spending overlay so post-Oct-21 length/salary cuts apply first.
      const baseOfferRaw = computeContractOffer(best, state.leagueStats as any);
      const baseOffer = clampOfferForDate(baseOfferRaw, state.date, currentYear, state.leagueStats, getK2Ovr(best));
      const bestLimits = getContractLimits(best, state.leagueStats as any);
      const offer = { ...baseOffer, salaryUSD: clampSpendOffer(baseOffer.salaryUSD, teamAttrs.spending, bestLimits.maxSalaryUSD) };

      // Financial discipline: at 13+/15, multi-year mid-money to fringe K2 → stop and let Pass 3 fill.
      {
        const stdRosterCount = state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length
          + results.filter(r => r.teamId === team.id && !(r as any).twoWay).length;
        const k2 = getK2Ovr(best);
        const seasonCap = (thresholds as any).salaryCap ?? 140_000_000;
        const offerPctOfCap = offer.salaryUSD / seasonCap;

        if (stdRosterCount >= 13 && offer.years > 1 && offerPctOfCap > 0.025 && k2 < 75) break;

        const samePosRotation = state.players
          .filter(p => p.tid === team.id && !(p as any).twoWay
            && sharesPosition(p.pos, best.pos)
            && (p.overallRating ?? 0) >= 65).length
          + results.filter(r => {
            if (r.teamId !== team.id || (r as any).twoWay) return false;
            const sp = state.players.find(p => p.internalId === r.playerId);
            return sp ? sharesPosition(sp.pos, best.pos) : false;
          }).length;
        if (samePosRotation >= 3 && offerPctOfCap > 0.025 && k2 < 78) break;

        if (stdRosterCount >= 14 && offer.years >= 3 && k2 < 78) break;
      }

      // Determine if this signing fits via cap (after subtracting in-flight spend) or MLE
      const profile = getTeamCapProfileFromState(state, team.id, thresholds);
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

      signPlayer(best, team, offer, mleTypeUsed, mleAmountUSD, false, isCampInvite(best, offer));
      signedThisIteration = true;
    }
  }

  // (ngEnabled / isPreseasonWindow / maxCampRoster declared above isCampInvite.)

  // ── Pass 2: Two-way signings (runs before Pass 4 so fringe FAs aren't vacuumed by salary-ASC sort).
  const maxTwoWay = state.leagueStats.maxTwoWayPlayersPerTeam ?? 3;
  const twoWayEnabled = (state.leagueStats as any).twoWayContractsEnabled ?? true;
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

      // 2W pool: low-OVR FAs that are also age≤24 OR YOS≤2; age≥30 always blocked.
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
        .filter(p => !isRecentWaiverByTeam(p, team.id, state.date))
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

  // ── Pass 3: Non-guaranteed training camp signings (slots 16–21, preseason only).
  if (isPreseasonWindow) {
    const NG_OVR_CAP = 60;
    const minSalaryUSDPreseason = ((state.leagueStats as any).minContractStaticAmount ?? 1.2) * 1_000_000;
    // NG tiers: % of cap so they inflate with cap year-to-year.
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

    // Real NBA: most teams enter camp with 17–19 bodies, NOT 21. The 21-cap is
    // a hard ceiling, not a target. Filling all the way to 21 means 6 cuts at
    // Oct 21 to drop to 15 — even if all 6 are NG (free), it's a lot of churn,
    // and a salary penalty creep where the AI keeps signing $4M NG fillers when
    // it doesn't need them. Cap NG fill at maxStandard + 3 (= 18) so camp ends
    // with realistic depth and the eventual 21→15 cut is a 3-man drop, not 6.
    const NG_FILL_TARGET = Math.min(maxCampRoster, maxStandard + 3);

    for (const team of sortedAITeams) {
      // Training camp limit is TOTAL (standard + NG + two-way all share the 21 pool)
      const existingAll = state.players.filter(p => p.tid === team.id).length;
      const signedAll = results.filter(r => r.teamId === team.id).length;
      const totalCamp = existingAll + signedAll;
      if (totalCamp >= NG_FILL_TARGET) continue;

      const ngSlots = NG_FILL_TARGET - totalCamp;
      const ngCandidates = pool
        .filter(p => (p.overallRating ?? 99) <= NG_OVR_CAP)
        .filter(p => !isLoyalBlocked(p, team.id, currentYear))
        .filter(p => !isRecentWaiverByTeam(p, team.id, state.date))
        .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));

      let filled = 0;
      for (const candidate of ngCandidates) {
        if (filled >= ngSlots) break;
        // NG salary: tier % of cap → jittered by internalId, floored at min, ceilinged at top tier × 1.10.
        const ovr = candidate.overallRating ?? 50;
        const tierPct = (NG_CAP_PCT_BY_OVR.find(t => ovr <= t.maxOvr) ?? NG_CAP_PCT_BY_OVR[NG_CAP_PCT_BY_OVR.length - 1]).pct;
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
  // Teams below 15 must sign via cap → MLE → minimum exception. User team backfilled to minRoster only.
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

      const profile = getTeamCapProfileFromState(state, team.id, thresholds);

      const localEntry = localMleUsed.get(team.id);
      const effectiveLS = localEntry
        ? { ...state.leagueStats, mleUsage: { ...(state.leagueStats as any).mleUsage, [team.id]: localEntry } }
        : state.leagueStats;

      // Near-full bias: when team has 13+ standard, the last 1-2 slots in real
      // NBA are min-tier signings (vet min / camp invite), not $5-15M FAs.
      // Without this gate Pass 4 fills 14→15 with the best-available K2-78 player
      // for $12M, inflating every team's payroll past the tax line.
      const nearFullBias = rosterSize >= 13;
      const minSalaryUSDForBias = ((state.leagueStats as any).minContractStaticAmount ?? 1.2) * 1_000_000;

      // Sort: best OVR first, tiebreak by lowest salary.
      const candidates = pool
        .filter(p => !isLoyalBlocked(p, team.id, currentYear))
        .filter(p => !isRecentWaiverByTeam(p, team.id, state.date))
        .map(p => ({
          player: p,
          offer: clampOfferForDate(
            computeContractOffer(p, state.leagueStats as any),
            state.date, currentYear, state.leagueStats, getK2Ovr(p),
          ),
        }))
        // Near-full: cap each candidate's offer at 2x min so $12M FAs sign for ~$2.4M
        // instead of inflating payroll. Pass 1 is for the actual bidding war on stars.
        .map(({ player, offer }) => nearFullBias
          ? { player, offer: { ...offer, salaryUSD: Math.min(offer.salaryUSD, minSalaryUSDForBias * 2), years: 1 } }
          : { player, offer })
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
          signPlayer(player, team, offer, null, 0, false, isCampInvite(player, offer));
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
          signPlayer(player, team, offer, mleAvail.type, offer.salaryUSD, false, isCampInvite(player, offer));
          signedThisIteration = true;
          rosterSize = computeRosterSize();
          break;
        }
        mleRejects++;
      }

      // Min-exception fallback: cap+MLE both blocked → sign the lowest-OVR FA at min.
      if (!signedThisIteration && pool.length > 0 && rosterSize < fillTarget) {
        const minSalaryUSD = ((state.leagueStats as any).minContractStaticAmount ?? 1.2) * 1_000_000;
        const minDealCandidate = pool
          .filter(p => !isLoyalBlocked(p, team.id, currentYear))
          .filter(p => !isRecentWaiverByTeam(p, team.id, state.date))
          .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0))[0]; // weakest first — they're the ones who'd accept min
        if (minDealCandidate) {
          // Preseason min fills sign as NG (camp invite); regular-season fills stay guaranteed.
          const minDealOffer = { salaryUSD: minSalaryUSD, years: 1, hasPlayerOption: false };
          signPlayer(
            minDealCandidate,
            team,
            minDealOffer,
            null,
            0,
            false,
            isCampInvite(minDealCandidate, minDealOffer),
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
      const profile = getTeamCapProfileFromState(state, team.id, thresholds);
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
          .filter(p => !isRecentWaiverByTeam(p, team.id, state.date))
          .map(p => {
            const limits = getContractLimits(p, state.leagueStats as any);
            const baseOfferRaw = computeContractOffer(p, state.leagueStats as any);
            const baseOffer = clampOfferForDate(baseOfferRaw, state.date, currentYear, state.leagueStats, getK2Ovr(p));
            const salaryUSD = Math.min(
              limits.maxSalaryUSD,
              Math.max(minSalaryUSD, Math.min(targetPerSlot, baseOffer.salaryUSD)),
            );
            return { player: p, offer: { ...baseOffer, salaryUSD }, limits };
          })
          .filter(({ offer }) => offer.salaryUSD >= minSalaryUSD)
          .sort((a, b) => b.offer.salaryUSD - a.offer.salaryUSD)[0]; // highest within budget first

        if (!candidate) break;

        signPlayer(candidate.player, team, candidate.offer, null, 0, false, isCampInvite(candidate.player, candidate.offer));
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
  /** Set when the hard roster limit forced a cut after every protection gate blocked. */
  forced?: boolean;
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
// Remaining fully-guaranteed seasons (excludes either-side options).
function getRemainingYearsGuaranteed(p: NBAPlayer, currentYear: number): number {
  const cy = (p as any).contractYears as Array<{ season: string; option?: string }> | undefined;
  if (Array.isArray(cy) && cy.length > 0) {
    return cy.filter(y =>
      seasonLabelToYear(y.season) >= currentYear && y.option !== 'team' && y.option !== 'player'
    ).length;
  }
  const exp = (p as any).contract?.exp ?? currentYear;
  return Math.max(0, exp - currentYear + 1);
}

// Sum of remaining guaranteed USD; used so trim prefers cutting cheap bodies over expensive ones.
function getRemainingGuaranteedUSD(p: NBAPlayer, currentYear: number): number {
  const cy = (p as any).contractYears as Array<{ season: string; guaranteed: number; option?: string }> | undefined;
  if (Array.isArray(cy) && cy.length > 0) {
    return cy
      .filter(y =>
        seasonLabelToYear(y.season) >= currentYear && y.option !== 'team' && y.option !== 'player'
      )
      .reduce((s, y) => s + (y.guaranteed || 0), 0);
  }
  // Fallback: project contract.amount flat through expiry. amount is BBGM thousands.
  const exp = (p as any).contract?.exp ?? currentYear;
  const amountUSD = contractToUSD((p as any).contract?.amount || 0);
  const yrs = Math.max(0, exp - currentYear + 1);
  return amountUSD * yrs;
}

function isRecentlySignedWithinGrace(player: NBAPlayer, currentDate: string | undefined): boolean {
  const signed = (player as any).signedDate;
  if (!signed || !currentDate) return false;
  const days = (new Date(currentDate).getTime() - new Date(signed).getTime()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days < RECENT_SIGNING_GRACE_DAYS;
}

export function autoTrimOversizedRosters(state: GameState, month?: number, day?: number): WaiverResult[] {
  const userTeamId = (state.gameMode === 'gm' && !isAssistantGMActive()) ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? DEFAULT_MAX_ROSTER;
  const maxTrainingCamp = state.leagueStats.maxTrainingCampRoster ?? 21;
  const maxTwoWay = state.leagueStats.maxTwoWayPlayersPerTeam ?? 3;
  const salaryCapUSD = state.leagueStats.salaryCap ?? 140_000_000;
  const PROTECT_GUARANTEED_OVR = 70;
  const PROTECT_GUARANTEED_REMAINING_PCT = 0.10;
  // Hard ceiling: any guaranteed contract worth > 10% of cap (≈ $15M+) is trade
  // fodder, never a one-day buyout. Real NBA never just-waives a $20-30M player —
  // they negotiate buyouts at 50-70% or trade with sweetener picks.
  const MAX_BUYOUT_PCT_OF_CAP = 0.10;
  const isRecentlySigned = (p: NBAPlayer): boolean => isRecentlySignedWithinGrace(p, state.date);

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
        // Sort: talent score minus salary penalty (pct-of-cap × 30) so $20M mistakes get cut before $1M vets.
        const sortFn = (a: NBAPlayer, b: NBAPlayer) => {
          const baseA = sortByPot ? calcPot2K(a, currentYear) : (a.overallRating ?? 0);
          const baseB = sortByPot ? calcPot2K(b, currentYear) : (b.overallRating ?? 0);
          const salaryPenA = (contractToUSD((a as any).contract?.amount || 0) / salaryCapUSD) * 30;
          const salaryPenB = (contractToUSD((b as any).contract?.amount || 0) / salaryCapUSD) * 30;
          return (baseA - salaryPenA) - (baseB - salaryPenB);
        };

        // Cut order: NG first (free), G-League, 2W lowest OVR, then standard. Family-tied players excluded.
        const canCut = (p: NBAPlayer) => {
          if (hasFamilyOnRoster(p, allPlayers)) return false;
          // Recency guard: never waive a guaranteed player you just signed.
          if (isRecentlySigned(p) && !(p as any).nonGuaranteed && !(p as any).twoWay) return false;
          if ((p as any).nonGuaranteed || (p as any).twoWay) return true;
          // Rookie protection: drafted in the last 2 seasons → never cut. Real NBA:
          // teams almost never waive their own draft picks in their first two years.
          // Pre-fix BKN dump showed Konan Niederhauser/Traore/Powell/Saraf all 2025
          // draftees waived Jul 7 2026 — $44M of dead money for cutting your own
          // rookie class. The OVR/salary guards below let rookies through because
          // their $3-4M deals don't hit the 10%-cap protection threshold.
          const draftYr = (p as any).draft?.year;
          if (typeof draftYr === 'number' && currentYear - draftYr <= 2) return false;
          // Pre-camp OVR rescue: training camp shuffle can drop a player's OVR by
          // 2-3 across all 14 attrs (≈ 5-7 OVR points). A guy signed at OVR 65 who
          // randomly regressed to OVR 58 in camp would otherwise fail the OVR<70
          // cuttable check — we just paid him, the regression is RNG, don't cut.
          const preCampOvr = (p as any).preCampOverallRating as number | undefined;
          const ovrForCheck = typeof preCampOvr === 'number' ? Math.max(preCampOvr, p.overallRating ?? 0) : (p.overallRating ?? 0);
          // Bird Rights protection: the team just used Bird Rights to retain this
          // player at +10% premium during the offseason. Waiving him months later
          // is GM whiplash. Protect through this offseason regardless of OVR.
          if ((p as any).birdRightsResignedThisYear === currentYear) return false;
          const ovr = ovrForCheck;
          const yrsLeft = getRemainingYearsGuaranteed(p, currentYear);
          const age = p.born?.year ? currentYear - p.born.year : (p.age ?? 27);
          const remaining = getRemainingGuaranteedUSD(p, currentYear);
          // STAR PROTECTION (real-NBA hard rule): OVR ≥ 75 (K2 ~85+) is never cut.
          // Pre-fix the formula had a backwards branch: a 26yo OVR 88 star on a $5M
          // expiring deal landed in `remaining < 10% of cap → cuttable` because the
          // logic only protected EXPENSIVE multi-year deals. CHA actually waived
          // Coby White (OVR 88, 14.2 PPG) for that reason. Real NBA: a star on a
          // cheap expiring deal is the most valuable trade asset in the league —
          // you trade him for picks, you never waive him. Period.
          if (ovr >= 75 && !(age >= 35 && yrsLeft <= 1)) return false;
          // Hard ceiling: never auto-waive >10%-of-cap contracts (Simons $27.7M tier).
          // Exception: deep-bench OVR<60 + age 35+ vets — those are real buyout candidates.
          if (remaining > salaryCapUSD * MAX_BUYOUT_PCT_OF_CAP && !(ovr < 60 && age >= 35)) return false;
          // Buyout candidates: 1yr left, aged-out OR cheap. Big 1-year deals never buyout.
          const isCheapEnoughForBuyout = remaining < salaryCapUSD * 0.05;
          const isBuyoutCandidate = yrsLeft <= 1 && (age >= 32 || isRebuilding) && isCheapEnoughForBuyout;
          if (isBuyoutCandidate) return true;
          // Multi-year guarantees above the protection threshold are trade fodder, not waive material.
          if (yrsLeft >= 2 && remaining >= salaryCapUSD * PROTECT_GUARANTEED_REMAINING_PCT) return false;
          if (ovr < PROTECT_GUARANTEED_OVR) return true;
          return remaining < salaryCapUSD * PROTECT_GUARANTEED_REMAINING_PCT;
        };
        const ngPlayers  = allPlayers.filter(p => canCut(p) && !!(p as any).nonGuaranteed).sort(sortFn);
        const glPlayers  = allPlayers.filter(p => canCut(p) && !(p as any).nonGuaranteed && !!(p as any).gLeagueAssigned).sort(sortFn);
        const twPlayers  = allPlayers.filter(p => canCut(p) && !(p as any).nonGuaranteed && !(p as any).gLeagueAssigned && !!(p as any).twoWay).sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));
        const stdPlayers = allPlayers.filter(p => canCut(p) && !(p as any).nonGuaranteed && !(p as any).gLeagueAssigned && !(p as any).twoWay).sort(sortFn);
        const trimPool = [...ngPlayers, ...glPlayers, ...twPlayers, ...stdPlayers];
        const teamWaivers: WaiverResult[] = [];
        const selectedIds = new Set<string>();
        const pushWaiver = (p: NBAPlayer, forced = false) => {
          selectedIds.add(p.internalId);
          teamWaivers.push({
            playerId: p.internalId,
            teamId: team.id,
            playerName: p.name,
            teamName: team.name,
            reason: !!(p as any).twoWay ? 'twoWayExcess' : 'standardExcess',
            wasNonGuaranteed: !!(p as any).nonGuaranteed,
            ...(forced ? { forced: true } : {}),
          });
        };
        for (let i = 0; i < excess && i < trimPool.length; i++) {
          pushWaiver(trimPool[i]);
        }
        if (teamWaivers.length < excess) {
          const forcedPool = allPlayers
            .filter(p => !selectedIds.has(p.internalId))
            .sort(sortFn);
          for (let i = 0; teamWaivers.length < excess && i < forcedPool.length; i++) {
            pushWaiver(forcedPool[i], true);
          }
        }
        if (teamWaivers.length > 0) {
          const forcedCount = teamWaivers.filter(w => w.forced).length;
          console.log(`[RosterTrim-TC] Month=${month}, team=${team.name}, total=${allPlayers.length}, limit=${effectiveLimit}, trimmed=${teamWaivers.length}${forcedCount ? ` forced=${forcedCount}` : ''}: ${teamWaivers.map(w => w.playerName).join(', ')}`);
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
        // Salary-aware composite (see preseason branch comment).
        const sortFn = (a: NBAPlayer, b: NBAPlayer) => {
          const baseA = sortByPot ? calcPot2K(a, currentYear) : (a.overallRating ?? 0);
          const baseB = sortByPot ? calcPot2K(b, currentYear) : (b.overallRating ?? 0);
          const salaryPenA = (contractToUSD((a as any).contract?.amount || 0) / salaryCapUSD) * 30;
          const salaryPenB = (contractToUSD((b as any).contract?.amount || 0) / salaryCapUSD) * 30;
          return (baseA - salaryPenA) - (baseB - salaryPenB);
        };

        const canCut = (p: NBAPlayer) => {
          if (hasFamilyOnRoster(p, roster)) return false;
          if (isRecentlySigned(p) && !(p as any).nonGuaranteed) return false;
          if ((p as any).nonGuaranteed) return true;
          // Rookie / pre-camp / Bird-Rights protections — see preseason branch comment.
          const draftYr = (p as any).draft?.year;
          if (typeof draftYr === 'number' && currentYear - draftYr <= 2) return false;
          const preCampOvr = (p as any).preCampOverallRating as number | undefined;
          const ovrForCheck = typeof preCampOvr === 'number' ? Math.max(preCampOvr, p.overallRating ?? 0) : (p.overallRating ?? 0);
          if ((p as any).birdRightsResignedThisYear === currentYear) return false;
          const ovr = ovrForCheck;
          const yrsLeft = getRemainingYearsGuaranteed(p, currentYear);
          const age = p.born?.year ? currentYear - p.born.year : (p.age ?? 27);
          const remaining = getRemainingGuaranteedUSD(p, currentYear);
          // STAR PROTECTION (real-NBA hard rule): OVR ≥ 75 (K2 ~85+) is never cut.
          // Pre-fix CHA waived Coby White (OVR 88, $12.9M dead) Oct 28 — the regular-
          // season canCut fell through to "remaining < 10% cap → cuttable" because
          // Coby's 1yr expiring deal didn't hit the multi-year guard. Stars on cheap
          // expiring deals are trade gold, never waive material.
          if (ovr >= 75 && !(age >= 35 && yrsLeft <= 1)) return false;
          // Hard ceiling: see preseason branch — Simons $27.7M etc. should be trade fodder.
          if (remaining > salaryCapUSD * MAX_BUYOUT_PCT_OF_CAP && !(ovr < 60 && age >= 35)) return false;
          const isCheapEnoughForBuyout = remaining < salaryCapUSD * 0.05;
          const isBuyoutCandidate = yrsLeft <= 1 && (age >= 32 || isRebuilding) && isCheapEnoughForBuyout;
          if (isBuyoutCandidate) return true;
          if (yrsLeft >= 2 && remaining >= salaryCapUSD * PROTECT_GUARANTEED_REMAINING_PCT) return false;
          if (ovr < PROTECT_GUARANTEED_OVR) return true;
          return remaining < salaryCapUSD * PROTECT_GUARANTEED_REMAINING_PCT;
        };
        const ngRoster = roster.filter(p => canCut(p) && !!(p as any).nonGuaranteed).sort(sortFn);
        const glPlayers = roster.filter(p => canCut(p) && !(p as any).nonGuaranteed && !!(p as any).gLeagueAssigned).sort(sortFn);
        const nonGL = roster.filter(p => canCut(p) && !(p as any).nonGuaranteed && !(p as any).gLeagueAssigned).sort(sortFn);
        const trimPool = [...ngRoster, ...glPlayers, ...nonGL];
        const teamWaivers: WaiverResult[] = [];
        const selectedIds = new Set<string>();
        const pushWaiver = (p: NBAPlayer, forced = false) => {
          selectedIds.add(p.internalId);
          teamWaivers.push({
            playerId: p.internalId,
            teamId: team.id,
            playerName: p.name,
            teamName: team.name,
            reason: 'standardExcess',
            wasNonGuaranteed: !!(p as any).nonGuaranteed,
            ...(forced ? { forced: true } : {}),
          });
        };
        for (let i = 0; i < excess && i < trimPool.length; i++) {
          pushWaiver(trimPool[i]);
        }
        if (teamWaivers.length < excess) {
          const forcedPool = roster
            .filter(p => !selectedIds.has(p.internalId))
            .sort(sortFn);
          for (let i = 0; teamWaivers.length < excess && i < forcedPool.length; i++) {
            pushWaiver(forcedPool[i], true);
          }
        }
        if (teamWaivers.length > 0) {
          const forcedCount = teamWaivers.filter(w => w.forced).length;
          console.log(`[RosterTrim] Month=${month}, team=${team.name}, roster=${roster.length} (gl=${glPlayers.length}), limit=${effectiveLimit}, sortBy=${sortByPot ? 'POT' : 'OVR'}, trimmed=${teamWaivers.length}${forcedCount ? ` forced=${forcedCount}` : ''}: ${teamWaivers.map(w => w.playerName).join(', ')}`);
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

    const payrollUSD = teamPlayers.reduce((s, p) => s + contractToUSD((p.contract?.amount as number) || 0), 0);

    // Pick highest-OVR two-ways (they've earned the standard deal)
    const candidates = [...twoWay].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));

    let projectedPayroll = payrollUSD;

    for (const p of candidates) {
      if (toPromote <= 0) break;

      // 1yr promotion deal capped at 2× league min so role-player promotions stay realistic.
      const offer = computeContractOffer(p, state.leagueStats, [], 0);
      const minSalaryUSD = ((state.leagueStats as any).minContractStaticAmount ?? 1.273) * 1_000_000;
      const promotionCapUSD = minSalaryUSD * 2;
      const newSalaryUSD = Math.min(offer.salaryUSD, promotionCapUSD);
      const currentSalaryUSD = contractToUSD((p.contract?.amount as number) || 0);
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

    // Rebuilder discipline: real NBA tankers don't extend mid-tier vets — they
    // let them walk to gather cap space. Only the young core gets extended
    // (Wemby/Holmgren/Edwards tier). Pre-fix all teams behaved like contenders,
    // pushing rebuilder payrolls past $170M (real-NBA tanker floor: ~$151M).
    const teamStrategy = resolveTeamStrategyProfile({
      team,
      players: state.players,
      teams: state.teams,
      leagueStats: state.leagueStats,
      currentYear,
      gameMode: state.gameMode,
      userTeamId: (state as any).userTeamId,
    });
    const playerAgeNow = playerAge(player, currentYear);
    const playerK2 = getK2Ovr(player);
    if ((teamStrategy.key === 'rebuilding' || teamStrategy.key === 'development' || teamStrategy.key === 'cap_clearing')
        && (playerAgeNow > 25 || playerK2 < 78)) {
      results.push({
        playerId: player.internalId,
        teamId: player.tid,
        playerName: player.name,
        teamName: team.name,
        newAmount: 0,
        newExp: currentYear,
        newYears: 0,
        hasPlayerOption: false,
        declined: true,
      });
      continue;
    }

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

    // Rebuilder discipline (see runAIMidSeasonExtensions for full reasoning).
    // Rebuilders/development teams only extend young core (age ≤ 25 + K2 ≥ 78).
    const teamStrategy = resolveTeamStrategyProfile({
      team,
      players: state.players,
      teams: state.teams,
      leagueStats: state.leagueStats,
      currentYear,
      gameMode: state.gameMode,
      userTeamId: (state as any).userTeamId,
    });
    const playerAgeNow = playerAge(player, currentYear);
    const playerK2 = getK2Ovr(player);
    if ((teamStrategy.key === 'rebuilding' || teamStrategy.key === 'development' || teamStrategy.key === 'cap_clearing')
        && (playerAgeNow > 25 || playerK2 < 78)) {
      results.push({
        playerId: player.internalId,
        teamId: player.tid,
        playerName: player.name,
        teamName: team.name,
        newAmount: 0,
        newExp: currentYear,
        newYears: 0,
        hasPlayerOption: false,
        declined: true,
      });
      continue;
    }

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

// MLE Upgrade Swap: monthly per-team scan to sign-via-MLE + waive the weakest player.

// Pass 0: Bird Rights re-sign on Jul 1 — incumbent team gets first-look at +10% with 85% acceptance.

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

    // 2nd-apron teams skip — they'd take the tax penalty over re-signing. Lux-tax teams still bid.
    const payroll = state.players
      .filter(p => p.tid === priorTid && !(p as any).twoWay)
      .reduce((s, p) => s + contractToUSD(p.contract?.amount ?? 0), 0);
    if (thresholds.secondApron && payroll >= thresholds.secondApron) continue;

    // Rebuilder discipline: tankers don't Bird-Rights-resign mid-tier vets.
    // Real NBA: HOU 2022 let Eric Gordon walk, BKN/MEM-tier teams routinely
    // skip Bird Rights re-signs to gather cap space. Only young core (age ≤ 25
    // + K2 ≥ 78) gets retained. This is the structural fix that gives the
    // league cap-space teams next offseason.
    const priorStrategy = resolveTeamStrategyProfile({
      team: priorTeam,
      players: state.players,
      teams: state.teams,
      leagueStats: state.leagueStats,
      currentYear,
      gameMode: state.gameMode,
      userTeamId: (state as any).userTeamId,
    });
    const playerAgeBR = playerAge(player, currentYear);
    if ((priorStrategy.key === 'rebuilding' || priorStrategy.key === 'development' || priorStrategy.key === 'cap_clearing')
        && (playerAgeBR > 25 || k2 < 78)) continue;

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
  // Track claimed FAs so two teams firing on the same seeded day can't both
  // sign the same player. Without this, the stale freeAgents snapshot lets
  // IND and MIA both push a result for the same top candidate.
  const claimedFAIds = new Set<string>();

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
    const profile = getTeamCapProfileFromState(state, team.id, thresholds);
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

    // Apply the same protections autoTrim's canCut uses — MLE swap is just an
    // optimized waive-and-replace, so it shouldn't waive players who'd never
    // be waived by trim. Pre-fix this function picked the "weakest" by sort
    // score with no floor — a team of 12 stars + 3 rotation guys would waive
    // a rotation guy (OVR 78) to sign an MLE-tier (~OVR 76) "upgrade", losing
    // the rotation guy AND booking dead money for nothing.
    const swapCandidates = guaranteedRoster.filter(p => {
      if (hasFamilyOnRoster(p, guaranteedRoster)) return false;
      // Same guaranteed-signing grace as auto-trim. This blocks the Oct→Nov
      // fringe cycle where a team signs a player, waits just past the old
      // 30-day window, then waives him for dead money.
      if (isRecentlySignedWithinGrace(p, state.date)) return false;
      // Star protection: OVR ≥ 75 → trade asset, not waive material.
      if ((p.overallRating ?? 0) >= 75) return false;
      // Rookie protection: drafted in last 2 yrs → never waive own draft picks.
      const draftYr = (p as any).draft?.year;
      if (typeof draftYr === 'number' && currentYear - draftYr <= 2) return false;
      // Bird Rights protection: re-signed this offseason → don't whiplash-cut him.
      if ((p as any).birdRightsResignedThisYear === currentYear) return false;
      const remaining = getRemainingGuaranteedUSD(p, currentYear);
      const age = p.born?.year ? currentYear - p.born.year : (p.age ?? 27);
      if (remaining > thresholds.salaryCap * 0.10 && !((p.overallRating ?? 0) < 60 && age >= 35)) return false;
      return true;
    });

    const weakest = [...swapCandidates].sort((a, b) => sortScore(a) - sortScore(b))[0];
    if (!weakest) continue;
    const weakestScore = sortScore(weakest);

    // Best FA whose salary ≤ MLE available and who beats the weakest player; date-clamp applies.
    const gmSpending = getGMAttributes(state, team.id).spending;
    const candidate = freeAgents
      .filter(p => {
        if (claimedFAIds.has(p.internalId)) return false;
        if (isLoyalBlocked(p, team.id, currentYear)) return false;
        if (isRecentWaiverByTeam(p, team.id, state.date)) return false;
        const limits  = getContractLimits(p, state.leagueStats as any);
        const rawOffer = computeContractOffer(p, state.leagueStats as any);
        const offer   = clampOfferForDate(rawOffer, state.date, currentYear, state.leagueStats, getK2Ovr(p));
        const salary  = clampSpendOffer(offer.salaryUSD, gmSpending, limits.maxSalaryUSD);
        return salary <= mle.available && sortScore(p) > weakestScore;
      })
      .sort((a, b) => sortScore(b) - sortScore(a))[0];

    if (!candidate) continue;

    claimedFAIds.add(candidate.internalId);

    const baseOfferRaw = computeContractOffer(candidate, state.leagueStats as any);
    const baseOffer    = clampOfferForDate(baseOfferRaw, state.date, currentYear, state.leagueStats, getK2Ovr(candidate));
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
