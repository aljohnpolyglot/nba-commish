/**
 * AIFreeAgentHandler.ts
 *
 * Autonomous AI free-agent signings + mid-season extensions.
 * Spec: multiseason_todo.md §3
 */

import type { GameState, NBAPlayer, NBATeam } from '../types';
import { getCapThresholds, getTeamCapProfile, computeContractOffer, getMLEAvailability } from '../utils/salaryUtils';
import type { MleType } from '../utils/salaryUtils';
import { convertTo2KRating } from '../utils/helpers';
import { SettingsManager } from './SettingsManager';
import { computeMoodScore } from '../utils/mood/moodScore';
import type { MoodTrait } from '../utils/mood/moodTypes';

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
  // In GM mode, exclude user's team from AI signings; in commissioner mode, exclude team[0] (convention)
  const userTeamId = (state as any).userTeamId ?? state.teams[0]?.id;

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
}

/**
 * For each AI team over the roster limit, release the lowest-rated player.
 * During the offseason/preseason (July–September, month 7–9), teams may carry up to
 * maxTrainingCampRoster (default 21) players — mimicking NBA training camp rules.
 * Once the regular season starts (October+), the limit drops to maxStandard (15).
 * Two-way contract players (twoWay: true) never count against the standard limit.
 * User's team is never touched.
 *
 * @param month - current simulation month (1-12). Pass undefined to always enforce regular-season limit.
 */
export function autoTrimOversizedRosters(state: GameState, month?: number): WaiverResult[] {
  const userTeamId = (state as any).userTeamId ?? state.teams[0]?.id;
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? DEFAULT_MAX_ROSTER;
  const maxTrainingCamp = state.leagueStats.maxTrainingCampRoster ?? 21;

  // During July–September (offseason / training camp), allow the expanded limit.
  // October onwards = regular season, enforce the standard 15-man cap.
  const isPreseasonPeriod = month !== undefined && month >= 7 && month <= 9;
  const effectiveLimit = isPreseasonPeriod ? maxTrainingCamp : maxStandard;

  const results: WaiverResult[] = [];

  for (const team of state.teams) {
    if (team.id === userTeamId) continue;
    // Two-way and G-League assigned players don't count against the standard roster cap
    const roster = state.players.filter(p => p.tid === team.id && !(p as any).twoWay && !(p as any).gLeagueAssigned);
    if (roster.length <= effectiveLimit) continue;
    const excess = roster.length - effectiveLimit;
    // G-League assigned players are last resort — trim non-GL lowest OVR first
    const nonGL = roster.filter(p => !(p as any).gLeagueAssigned)
      .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));
    const glPlayers = roster.filter(p => !!(p as any).gLeagueAssigned)
      .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));
    const trimPool = [...nonGL, ...glPlayers];
    const teamWaivers: WaiverResult[] = [];
    for (let i = 0; i < excess && i < trimPool.length; i++) {
      const p = trimPool[i];
      teamWaivers.push({ playerId: p.internalId, teamId: team.id, playerName: p.name, teamName: team.name });
    }
    if (teamWaivers.length > 0) {
      console.log(`[RosterTrim] Month=${month}, team=${team.name}, roster=${roster.length}, limit=${effectiveLimit}, trimmed=${teamWaivers.length} players: ${teamWaivers.map(w => w.playerName).join(', ')}`);
    }
    results.push(...teamWaivers);
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

  // Only AI teams — in GM mode skip the user's managed team, otherwise fall
  // back to teams[0] (commissioner mode has no roster gate to honor).
  const userTeamId = (state as any).userTeamId ?? state.teams[0]?.id;

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
  const userTeamId = (state as any).userTeamId ?? state.teams[0]?.id;

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
