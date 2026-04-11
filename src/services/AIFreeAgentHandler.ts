/**
 * AIFreeAgentHandler.ts
 *
 * Autonomous AI free-agent signings + mid-season extensions.
 * Spec: multiseason_todo.md §3
 */

import type { GameState, NBAPlayer, NBATeam } from '../types';
import { getCapThresholds, getTeamCapProfile } from '../utils/salaryUtils';
import { SettingsManager } from './SettingsManager';
import { computeMoodScore } from '../utils/mood/moodScore';
import type { MoodTrait } from '../utils/mood/moodTypes';

const MAX_ROSTER = 15;

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
      const contractUSD = ((p.contract?.amount ?? 0) as number) * 1_000_000;
      if (contractUSD > profile.capSpaceUSD + 2_000_000) return false;
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
}

/**
 * Run one round of AI FA signings.
 * Returns mutations to apply to state.players (set tid for each signed player).
 */
export function runAIFreeAgencyRound(state: GameState): SigningResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];

  const results: SigningResult[] = [];
  const userTeamId = state.teams[0]?.id;

  let pool = state.players.filter(p => p.tid < 0 && p.status === 'Free Agent');
  if (pool.length === 0) return [];

  const sortedAITeams = [...state.teams]
    .filter(t => t.id !== userTeamId)
    .sort((a, b) => ((b as any).wins ?? 0) - ((a as any).wins ?? 0));

  for (const team of sortedAITeams) {
    const rosterSize = state.players.filter(p => p.tid === team.id).length;
    if (rosterSize >= MAX_ROSTER) continue;

    const best = getBestFit(team, pool, state);
    if (!best) continue;

    results.push({
      playerId: best.internalId,
      teamId: team.id,
      playerName: best.name,
      teamName: team.name,
    });

    pool = pool.filter(p => p.internalId !== best.internalId);
  }

  return results;
}

// ── Mid-season extensions ─────────────────────────────────────────────────────

export interface ExtensionResult {
  playerId: string;
  teamId: number;
  playerName: string;
  teamName: string;
  newAmount: number;    // millions
  newExp: number;       // season year the new contract expires
  declined: boolean;
}

/** Rough market value in USD for a player (used for contract offers). */
function estimateMarketValueUSD(player: NBAPlayer): number {
  // overallRating may be undefined — fall back to ratings array OVR
  const lastRating = (player as any).ratings?.[(player as any).ratings.length - 1];
  const ovr = player.overallRating ?? lastRating?.ovr ?? 60;
  const base = Math.max(0, ovr - 60) * 1_000_000;
  const age = player.age ?? ((player as any).born?.year ? 2026 - (player as any).born.year : 27);
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

  // Only AI teams (not the user's first team, which is conventionally teams[0])
  const userTeamId = state.teams[0]?.id;

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
    if (traits.includes('COMPETITOR') && winPct < 0.40 && (player.overallRating ?? 0) >= 80) {
      basePct = Math.min(basePct, 0.10);
    }

    // Deterministic "roll" seeded by player id + year so it's stable across saves
    let seed = 0;
    for (let i = 0; i < player.internalId.length; i++) seed += player.internalId.charCodeAt(i);
    seed += currentYear * 31;
    const roll = (Math.sin(seed) * 10000) % 1;
    const accepted = roll > 0 && (Math.abs(roll) - Math.floor(Math.abs(roll))) < basePct;

    // ── Contract offer ───────────────────────────────────────────────────
    const marketUSD = estimateMarketValueUSD(player);
    let offerUSD = marketUSD;
    if (traits.includes('MERCENARY')) offerUSD *= 1.25;
    if (traits.includes('LOYAL')) offerUSD *= 0.90; // slight hometown discount

    // Extension length: stars get longer deals
    const ovr = player.overallRating ?? 60;
    const age = player.age ?? 27;
    let extensionYears = 1;
    if (ovr >= 85 && age <= 29) extensionYears = 4;
    else if (ovr >= 80 && age <= 31) extensionYears = 3;
    else if (ovr >= 70) extensionYears = 2;

    const maxLength = state.leagueStats.maxContractLengthStandard ?? 4;
    extensionYears = Math.min(extensionYears, maxLength);

    results.push({
      playerId: player.internalId,
      teamId: player.tid,
      playerName: player.name,
      teamName: team.name,
      newAmount: Math.round(offerUSD / 100_000) / 10,  // rounded to $0.1M
      newExp: currentYear + extensionYears,
      declined: !accepted,
    });
  }

  return results;
}
