import { NBAPlayer, NBATeam } from '../../types';
import { MoodTrait, MoodComponents } from './moodTypes';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Simple seeded float 0–1
function seededFloat(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// Expected MPG by archetype
function expectedMPG(rating: number): number {
  if (rating >= 88) return 34;
  if (rating >= 80) return 28;
  if (rating >= 70) return 22;
  return 12;
}

function estimateMarketValue(player: NBAPlayer): number {
  // Very rough: $1M per overall point above 60, capped at 50
  const base = Math.max(0, player.overallRating - 60) * 1_000_000;
  const agePenalty = player.age && player.age > 30 ? (player.age - 30) * 500_000 : 0;
  return Math.max(2_000_000, base - agePenalty);
}

/**
 * Computes a mood score in [−10, +10] for a player.
 * Pass `dateStr` (e.g. "Mar 29, 2026") to get deterministic noise.
 */
export function computeMoodScore(
  player: NBAPlayer,
  team: NBATeam | undefined,
  dateStr: string,
  endorsedByCommish = false,
  suspendedByCommish = false,
  sabotagedByCommish = false,
  teamPlayers?: NBAPlayer[], // used for DIVA top-3 usage check
): { score: number; components: MoodComponents } {
  const traits: MoodTrait[] = (player as any).moodTraits ?? [];

  // ── Playing time ───────────────────────────────────────────────────────────
  const isInjured = player.injury?.type !== 'Healthy' && player.injury?.gamesRemaining > 0;
  let ptDelta = 0;
  if (!isInjured) {
    const season = (player.stats ?? []).find(s => !s.playoffs);
    const actualMPG = season ? (season.min / Math.max(1, season.gp)) : 0;
    const expMPG = expectedMPG(player.overallRating);
    ptDelta = clamp((actualMPG - expMPG) / 3, -3, 3);
  }

  // ── Team success ───────────────────────────────────────────────────────────
  let winDelta = 0;
  if (team) {
    const gp = team.wins + team.losses;
    const winPct = gp > 0 ? team.wins / gp : 0.5;
    winDelta = clamp((winPct - 0.5) * 4, -2, 2);
    if (winPct >= 0.56) winDelta += 1; // contender floor bonus
    const age = player.age ?? 27;
    if (winPct < 0.40 && age > 30) winDelta -= 1; // vet on rebuilder
    winDelta = clamp(winDelta, -2, 2);
  }

  // ── Contract satisfaction ──────────────────────────────────────────────────
  let contractDelta = 0;
  if (player.contract?.amount) {
    const market = estimateMarketValue(player);
    const ratio = (player.contract.amount * 1_000_000) / market;
    contractDelta = clamp((ratio - 1.0) * 4, -2, 2);
  }

  // ── Commish relationship ───────────────────────────────────────────────────
  let relDelta = 0;
  if (endorsedByCommish) relDelta += 1;
  if (suspendedByCommish) relDelta -= 1;
  if (sabotagedByCommish) relDelta -= 2;
  if (traits.includes('LOYAL')) relDelta += 1;
  if (traits.includes('AMBASSADOR')) relDelta += 1;
  relDelta = clamp(relDelta, -2, 2);

  // ── Role stability ─────────────────────────────────────────────────────────
  const season = (player.stats ?? []).find(s => !s.playoffs);
  const isStarter = season ? (season.gs / Math.max(1, season.gp)) >= 0.5 : false;
  const isStar = player.overallRating >= 80;
  const roleDelta = isStarter ? 0.5 : isStar ? -1.5 : 0;

  // ── Seeded noise ───────────────────────────────────────────────────────────
  let dateSeed = 0;
  for (let i = 0; i < dateStr.length; i++) dateSeed += dateStr.charCodeAt(i);
  let idSeed = 0;
  for (let i = 0; i < player.internalId.length; i++) idSeed += player.internalId.charCodeAt(i);
  const noiseDelta = seededFloat(idSeed + dateSeed) * 2 - 1;

  // ── Apply trait multipliers ────────────────────────────────────────────────
  let pt = ptDelta;
  let win = winDelta;
  let contract = contractDelta;
  let role = roleDelta;

  if (traits.includes('DIVA')) {
    pt *= 2; // playing time 2×
    // Extra −1 if not top-3 in usage rate on their team
    if (teamPlayers && teamPlayers.length > 0) {
      const teammates = teamPlayers.filter(tp => tp.tid === player.tid && tp.internalId !== player.internalId);
      const playerUsage = (player.stats ?? []).find(s => !s.playoffs)?.usgPct ?? 0;
      const higherUsage = teammates.filter(tp => {
        const usg = (tp.stats ?? []).find(s => !s.playoffs)?.usgPct ?? 0;
        return usg > playerUsage;
      }).length;
      if (higherUsage >= 3) pt -= 1; // not in top-3 usage
    }
  }
  if (traits.includes('COMPETITOR')) {
    win *= 2; // win-delta 2×
    if (team && (team.wins / Math.max(1, team.wins + team.losses)) < 0.40) {
      win -= 2; // extra penalty on rebuilder
    }
  }
  if (traits.includes('MERCENARY')) {
    contract *= 2;
  }
  if (traits.includes('LOYAL')) {
    // slower decay — floor all negative components at −1
    pt = Math.max(pt, -1);
    win = Math.max(win, -1);
  }
  if (traits.includes('VOLATILE')) {
    // negative components 1.5×
    if (pt < 0) pt *= 1.5;
    if (win < 0) win *= 1.5;
    if (contract < 0) contract *= 1.5;
    if (relDelta < 0) relDelta *= 1.5;
  }

  const components: MoodComponents = {
    playingTime: clamp(pt, -3, 3),
    teamSuccess: clamp(win, -2, 2),
    contractSatisfaction: clamp(contract, -2, 2),
    commishRelationship: clamp(relDelta, -2, 2),
    roleStability: clamp(role, -1.5, 0.5),
    noise: clamp(noiseDelta, -1, 1),
  };

  let raw = Object.values(components).reduce((a, b) => a + b, 0);

  // LOYAL: floor at −2
  if (traits.includes('LOYAL')) raw = Math.max(raw, -2);

  return { score: clamp(raw, -10, 10), components };
}

/** Human-readable label for a mood score */
export function moodLabel(score: number): string {
  if (score >= 8) return 'Content';
  if (score >= 4) return 'Happy';
  if (score >= 0) return 'Neutral';
  if (score >= -3) return 'Restless';
  if (score >= -6) return 'Unhappy';
  return 'Disgruntled';
}
