/**
 * AIFreeAgentHandler.ts
 *
 * Autonomous AI free-agent signings + mid-season extensions.
 * Spec: multiseason_todo.md §3
 */

import type { GameState, NBAPlayer, NBATeam } from '../types';
import { getCapThresholds, getTeamCapProfile, computeContractOffer, getMLEAvailability, effectiveRecord } from '../utils/salaryUtils';
import type { MleType } from '../utils/salaryUtils';
import { convertTo2KRating } from '../utils/helpers';
import { SettingsManager } from './SettingsManager';
import { computeMoodScore } from '../utils/mood/moodScore';
import type { MoodTrait } from '../utils/mood/moodTypes';
import { calcPot2K } from './trade/tradeValueEngine';
import { isAssistantGMActive } from './assistantGMFlag';

const DEFAULT_MAX_ROSTER = 15;

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

// ── §3b: Best FA fit ──────────────────────────────────────────────────────────

function getBestFit(
  team: NBATeam,
  freeAgents: NBAPlayer[],
  state: GameState,
  /** Local MLE already spent this round (teamId → usedUSD). Avoids double-spending within a round. */
  localMleUsed: Map<number, { type: MleType; usedUSD: number }>,
): NBAPlayer | null {
  const thresholds = getCapThresholds(state.leagueStats as any);
  const profile = getTeamCapProfile(
    state.players,
    team.id,
    (team as any).wins ?? 0,
    (team as any).losses ?? 0,
    thresholds,
  );

  return freeAgents
    .filter(p => {
      const offer = computeContractOffer(p, state.leagueStats as any);

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
        profile.payrollUSD,
        offer.salaryUSD,
        thresholds,
        effectiveLeagueStats as any,
      );

      const canAffordViaCap = offer.salaryUSD <= profile.capSpaceUSD + 2_000_000;
      const canAffordViaMle = !mleAvail.blocked && offer.salaryUSD <= mleAvail.available;
      if (!canAffordViaCap && !canAffordViaMle) return false;
      if (playerMoodForTeam(p, team, state) < 1) return false;
      return true;
    })
    .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))[0] ?? null;
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

  let pool = state.players.filter(p => p.tid < 0 && p.status === 'Free Agent');
  if (pool.length === 0) return [];

  const sortedAITeams = [...state.teams]
    .filter(t => t.id !== userTeamId)
    .sort((a, b) => ((b as any).wins ?? 0) - ((a as any).wins ?? 0));

  // Standard roster limit (15-man) — two-way players don't count against this
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? state.leagueStats.maxPlayersPerTeam ?? DEFAULT_MAX_ROSTER;

  // Track MLE spend within this round so a team can't double-spend before state updates
  const localMleUsed = new Map<number, { type: MleType; usedUSD: number }>();

  const thresholds = getCapThresholds(state.leagueStats as any);

  const currentYear = state.leagueStats.year;

  // Helper: record a signing into results + remove from pool
  const signPlayer = (
    player: NBAPlayer,
    team: NBATeam,
    offer: { salaryUSD: number; years: number; hasPlayerOption: boolean },
    mleTypeUsed: MleType = null,
    mleAmountUSD = 0,
    twoWay = false,
  ) => {
    results.push({
      playerId: player.internalId,
      teamId: team.id,
      playerName: player.name,
      teamName: team.name,
      salaryUSD: offer.salaryUSD,
      contractYears: offer.years,
      contractExp: currentYear + offer.years - 1,
      hasPlayerOption: offer.hasPlayerOption,
      ...(mleTypeUsed ? { mleTypeUsed, mleAmountUSD } : {}),
      ...(twoWay ? { twoWay: true } as any : {}),
    });
    pool = pool.filter(p => p.internalId !== player.internalId);
  };

  // ── Pass 1: Normal signings (cap space + MLE for best available) ──────
  for (const team of sortedAITeams) {
    const rosterSize = state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length;
    if (rosterSize >= maxStandard) continue;

    const best = getBestFit(team, pool, state, localMleUsed);
    if (!best) continue;

    const offer = computeContractOffer(best, state.leagueStats as any);

    // Determine if this is a cap-space signing or MLE signing
    const profile = getTeamCapProfile(
      state.players, team.id,
      (team as any).wins ?? 0, (team as any).losses ?? 0, thresholds,
    );
    const isViaCap = offer.salaryUSD <= profile.capSpaceUSD + 2_000_000;
    let mleTypeUsed: MleType = null;
    let mleAmountUSD = 0;

    if (!isViaCap) {
      // Signing is via MLE — figure out which type and record it locally
      const localEntry = localMleUsed.get(team.id);
      const effectiveLS = localEntry
        ? { ...state.leagueStats, mleUsage: { ...(state.leagueStats as any).mleUsage, [team.id]: localEntry } }
        : state.leagueStats;
      const mleAvail = getMLEAvailability(team.id, profile.payrollUSD, offer.salaryUSD, thresholds, effectiveLS as any);
      if (!mleAvail.blocked && mleAvail.type) {
        mleTypeUsed = mleAvail.type;
        mleAmountUSD = offer.salaryUSD;
        // Update local tracker so subsequent signings by this team see reduced MLE
        const prevUsed = localEntry?.usedUSD ?? 0;
        localMleUsed.set(team.id, { type: mleAvail.type, usedUSD: prevUsed + offer.salaryUSD });
      }
    }

    signPlayer(best, team, offer, mleTypeUsed, mleAmountUSD);
  }

  // ── Pass 2: Minimum-roster enforcement ────────────────────────────────
  // Teams with < 15 regular-contract players MUST sign someone, even on a
  // minimum contract.  Over-cap teams use the MLE; if MLE is exhausted,
  // minimum-salary FAs can always be signed (league rule).
  for (const team of sortedAITeams) {
    // Count standard roster INCLUDING players we just signed in Pass 1
    const alreadySigned = results.filter(r => r.teamId === team.id && !(r as any).twoWay).length;
    const rosterSize = state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length + alreadySigned;
    if (rosterSize >= maxStandard) continue;

    const profile = getTeamCapProfile(
      state.players, team.id,
      (team as any).wins ?? 0, (team as any).losses ?? 0, thresholds,
    );

    // Try MLE first for the best available player
    const localEntry = localMleUsed.get(team.id);
    const effectiveLS = localEntry
      ? { ...state.leagueStats, mleUsage: { ...(state.leagueStats as any).mleUsage, [team.id]: localEntry } }
      : state.leagueStats;

    // Find cheapest viable FA (sorted by salary ascending, then OVR descending)
    const candidates = pool
      .map(p => ({ player: p, offer: computeContractOffer(p, state.leagueStats as any) }))
      .sort((a, b) => a.offer.salaryUSD - b.offer.salaryUSD || (b.player.overallRating ?? 0) - (a.player.overallRating ?? 0));

    let signed = false;
    for (const { player, offer } of candidates) {
      // Can we afford via cap space?
      if (offer.salaryUSD <= profile.capSpaceUSD + 2_000_000) {
        signPlayer(player, team, offer);
        signed = true;
        break;
      }

      // Can we afford via MLE?
      const mleAvail = getMLEAvailability(team.id, profile.payrollUSD, offer.salaryUSD, thresholds, effectiveLS as any);
      if (!mleAvail.blocked && mleAvail.type && offer.salaryUSD <= mleAvail.available) {
        const prevUsed = localEntry?.usedUSD ?? 0;
        localMleUsed.set(team.id, { type: mleAvail.type, usedUSD: prevUsed + offer.salaryUSD });
        signPlayer(player, team, offer, mleAvail.type, offer.salaryUSD);
        signed = true;
        break;
      }
    }

    // Last resort: sign the cheapest FA on a minimum deal regardless of cap
    // (NBA teams below 15 players are required to fill roster spots)
    if (!signed && candidates.length > 0) {
      const cheapest = candidates[0];
      signPlayer(cheapest.player, team, cheapest.offer);
    }
  }

  // ── Pass 3: Two-way contract signings ─────────────────────────────────
  // Teams with 15 regular players but fewer than maxTwoWayPlayersPerTeam
  // two-way players should sign low-OVR FAs on two-way deals.
  const maxTwoWay = state.leagueStats.maxTwoWayPlayersPerTeam ?? 3;
  const twoWayEnabled = (state.leagueStats as any).twoWayContractsEnabled ?? true;
  const TWO_WAY_OVR_CAP = 52; // raw BBGM OVR — fringe rotation / end-of-bench players
  const TWO_WAY_SALARY_USD = 625_000;

  if (twoWayEnabled && maxTwoWay > 0) {
    for (const team of sortedAITeams) {
      // Count existing two-way players + any signed this round
      const existingTwoWay = state.players.filter(p => p.tid === team.id && !!(p as any).twoWay).length;
      const signedTwoWay = results.filter(r => r.teamId === team.id && !!(r as any).twoWay).length;
      const currentTwoWay = existingTwoWay + signedTwoWay;
      if (currentTwoWay >= maxTwoWay) continue;

      const slotsAvailable = maxTwoWay - currentTwoWay;

      // Pool: low-OVR FAs only
      const twoWayCandidates = pool
        .filter(p => (p.overallRating ?? 99) <= TWO_WAY_OVR_CAP)
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
export function autoTrimOversizedRosters(state: GameState, month?: number): WaiverResult[] {
  const userTeamId = (state.gameMode === 'gm' && !isAssistantGMActive()) ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? DEFAULT_MAX_ROSTER;
  const maxTrainingCamp = state.leagueStats.maxTrainingCampRoster ?? 21;
  const maxTwoWay = state.leagueStats.maxTwoWayPlayersPerTeam ?? 3;

  // During July–September (offseason / training camp), allow the expanded limit.
  // October onwards = regular season, enforce the standard 15-man cap.
  const isPreseasonPeriod = month !== undefined && month >= 7 && month <= 9;
  const effectiveLimit = isPreseasonPeriod ? maxTrainingCamp : maxStandard;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const results: WaiverResult[] = [];

  for (const team of state.teams) {
    if (team.id === userTeamId) continue;
    // Standard roster = every non-two-way player on the team, including G-League
    // assignees. They still occupy a 15-man slot per NBA rules, and not counting
    // them here is how IND ended up carrying 33 players mid-season (trade flurry
    // + weekly 0-GP GL demotions piling up with no cut-down).
    const roster = state.players.filter(p => p.tid === team.id && !(p as any).twoWay);

    // ── Standard roster overflow ─────────────────────────────────────────────
    if (roster.length > effectiveLimit) {
      const excess = roster.length - effectiveLimit;

      // Rebuilders and young contenders (avg age <27) trim by lowest POT so washed
      // vets go first and high-ceiling prospects stay. Mirrors the untouchable/young-
      // core protection in tradeValueEngine (isYoungContenderCore).
      const { wins: ew, losses: el } = effectiveRecord(team, currentYear);
      const gp = ew + el;
      const winPct = gp > 0 ? ew / gp : 0.5;
      const isRebuilding = gp > 0 && winPct < 0.42;
      const isContender = gp > 0 && winPct >= 0.55;
      const avgAge = roster.length > 0
        ? roster.reduce((s, p) => s + ((p.born?.year ? currentYear - p.born.year : (p.age ?? 27))), 0) / roster.length
        : 27;
      const sortByPot = isRebuilding || (isContender && avgAge < 27);
      const sortFn = sortByPot
        ? (a: NBAPlayer, b: NBAPlayer) => calcPot2K(a, currentYear) - calcPot2K(b, currentYear)
        : (a: NBAPlayer, b: NBAPlayer) => (a.overallRating ?? 0) - (b.overallRating ?? 0);

      // G-League stashed players get trimmed first — they're already marked as
      // not seeing the floor, so waiving them over active players is the right
      // priority order. Within each bucket, sort by POT/OVR (lowest first).
      const glPlayers = roster.filter(p => !!(p as any).gLeagueAssigned).sort(sortFn);
      const nonGL = roster.filter(p => !(p as any).gLeagueAssigned).sort(sortFn);
      const trimPool = [...glPlayers, ...nonGL];
      const teamWaivers: WaiverResult[] = [];
      for (let i = 0; i < excess && i < trimPool.length; i++) {
        const p = trimPool[i];
        teamWaivers.push({ playerId: p.internalId, teamId: team.id, playerName: p.name, teamName: team.name, reason: 'standardExcess' });
      }
      if (teamWaivers.length > 0) {
        console.log(`[RosterTrim] Month=${month}, team=${team.name}, roster=${roster.length} (gl=${glPlayers.length}), limit=${effectiveLimit}, sortBy=${sortByPot ? 'POT' : 'OVR'}, trimmed=${teamWaivers.length}: ${teamWaivers.map(w => w.playerName).join(', ')}`);
      }
      results.push(...teamWaivers);
    }

    // ── Two-way overflow ─────────────────────────────────────────────────────
    // Enforce the 2W cap (default 3). Excess usually comes from trades that
    // import a 2W player while the receiving team is already at 3, or from
    // legacy saves. Waive the lowest-OVR 2Ws to bring them back to the cap.
    const twoWayRoster = state.players.filter(p => p.tid === team.id && !!(p as any).twoWay);
    if (twoWayRoster.length > maxTwoWay) {
      const excess2W = twoWayRoster.length - maxTwoWay;
      const sorted2W = [...twoWayRoster].sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));
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

      // Fresh market-value 1-year standard deal. Old contract is discarded —
      // mirrors real NBA flow: waived/released → signs new standard deal.
      const offer = computeContractOffer(p, state.leagueStats, [], 0);
      const newSalaryUSD = offer.salaryUSD;
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

  // Players expiring at end of this season, on AI teams, not already extended
  const expiringPlayers = state.players.filter(p => {
    if (!p.contract) return false;
    if (p.contract.exp !== currentYear) return false;
    if (p.tid <= 0) return false;                      // not on a real team
    if (p.tid === userTeamId) return false;            // user handles their own
    if ((p as any).status === 'Retired') return false;
    if ((p as any).midSeasonExtensionDeclined) return false; // already declined this season
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
    const extensionOffer = computeContractOffer(
      player,
      state.leagueStats as any,
      traits,
      score,
    );
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

    const extensionOffer = computeContractOffer(player, state.leagueStats as any, traits, score);

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
    });
  }

  return results;
}
