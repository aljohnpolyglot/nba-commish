import { NBAPlayer, NBATeam } from '../../types';
import { MoodTrait, MoodComponents } from './moodTypes';
import { effectiveRecord } from '../salaryUtils';
import { getFamilyOnRoster } from '../familyTies';

// ── Normalize BBGM letter codes → full MoodTrait names ────────────────────────
// BBGM stores traits as single-char letters: "F"=DIVA, "L"=LOYAL, "$"=MERCENARY, "W"=COMPETITOR
// Our system adds drama modifiers by full name. Support both forms.
const LETTER_TO_TRAIT: Record<string, MoodTrait> = {
  F: 'DIVA',
  L: 'LOYAL',
  $: 'MERCENARY',
  W: 'COMPETITOR',
};
export function normalizeMoodTraits(raw: string[]): MoodTrait[] {
  return raw.map(t => LETTER_TO_TRAIT[t] ?? t as MoodTrait).filter(Boolean);
}

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
 * Pass `currentYear` to enable effective-record offseason fallback for win delta.
 */
export function computeMoodScore(
  player: NBAPlayer,
  team: NBATeam | undefined,
  dateStr: string,
  endorsedByCommish = false,
  suspendedByCommish = false,
  sabotagedByCommish = false,
  teamPlayers?: NBAPlayer[], // used for DIVA top-3 usage check
  currentYear?: number,
): { score: number; components: MoodComponents } {
  const traits: MoodTrait[] = normalizeMoodTraits((player as any).moodTraits ?? []);

  // ── Playing time ───────────────────────────────────────────────────────────
  const isInjured = player.injury?.type !== 'Healthy' && player.injury?.gamesRemaining > 0;
  let ptDelta = 0;
  if (!isInjured) {
    const season = (player.stats ?? []).find(s => !s.playoffs);
    const actualMPG = season ? (season.min / Math.max(1, season.gp)) : 0;
    const expMPG = expectedMPG(player.overallRating);
    ptDelta = clamp((actualMPG - expMPG) / 2, -5, 5);
  }

  // ── Team success (use effectiveRecord so offseason 0-0 falls back to last season) ────────
  let winDelta = 0;
  if (team) {
    const rec = currentYear ? effectiveRecord(team, currentYear) : { wins: team.wins, losses: team.losses };
    const gp = rec.wins + rec.losses;
    const winPct = gp > 0 ? rec.wins / gp : 0.5;
    winDelta = clamp((winPct - 0.5) * 10, -5, 5);
    if (winPct >= 0.56) winDelta += 1; // contender floor bonus
    if (winPct >= 0.65) winDelta += 1; // elite-record bonus
    const age = player.age ?? 27;
    if (winPct < 0.40 && age > 30) winDelta -= 1; // vet on rebuilder
    winDelta = clamp(winDelta, -5, 7);
  }

  // ── Contract satisfaction ──────────────────────────────────────────────────
  let contractDelta = 0;
  if (player.contract?.amount) {
    const market = estimateMarketValue(player);
    const ratio = (player.contract.amount * 1_000_000) / market;
    contractDelta = clamp((ratio - 1.0) * 8, -4, 4);
  }

  // ── Commish relationship ───────────────────────────────────────────────────
  let relDelta = 0;
  if (endorsedByCommish) relDelta += 2;
  if (suspendedByCommish) relDelta -= 2;
  if (sabotagedByCommish) relDelta -= 3;
  if (traits.includes('LOYAL')) relDelta += 1;
  if (traits.includes('AMBASSADOR')) relDelta += 1;
  // LOYAL tenure bonus: 3+ years with same team → +1 (keeps LeBron re-signing)
  if (traits.includes('LOYAL') && ((player as any).yearsWithTeam ?? 0) >= 3) relDelta += 1;
  relDelta = clamp(relDelta, -3, 3);

  // ── Market size (tier-based: all players get base; FAME doubles; DIVA/MERC extras) ────
  let marketDelta = 0;
  if (team) {
    const pop = (team as any).pop ?? 0; // BBGM population field (millions)
    // Tier thresholds: top-third of NBA cities ≈ pop ≥ 5M; bottom-third < 2.5M
    const marketBase = pop >= 5 ? 3 : pop >= 2.5 ? 1 : 0; // High=+3, Mid=+1, Low=0
    const fameMult = traits.includes('FAME') ? 2 : 1;
    marketDelta = marketBase * fameMult; // FAME: High→+6, Mid→+2, Low→0
    // DIVA spotlight bonus: very big market → +2 extra, very small → −2 penalty
    if (traits.includes('DIVA')) {
      if (pop >= 5) marketDelta += 2;
      else if (pop < 1.5) marketDelta -= 2;
    }
    // MERCENARY: extra +1 in a big market, −2 in a small market
    if (traits.includes('MERCENARY')) {
      marketDelta += marketBase > 0 ? 1 : -2;
    }
    marketDelta = clamp(marketDelta, -3, 6);
  }

  // ── Role stability ─────────────────────────────────────────────────────────
  const season = (player.stats ?? []).find(s => !s.playoffs);
  const isStarter = season ? (season.gs / Math.max(1, season.gp)) >= 0.5 : false;
  const isStar = player.overallRating >= 65; // BBGM 65+ = All-Star caliber (70+ = superstar)
  const roleDelta = isStarter ? 2 : isStar ? -3 : 0;

  // ── Family ties ────────────────────────────────────────────────────────────
  // +1 per relative on the same team (cap 3). Playing next to a brother is a
  // real morale anchor — the BBGM roster carries the `relatives` list per player.
  let familyDelta = 0;
  if (teamPlayers && teamPlayers.length > 0) {
    const familyCount = getFamilyOnRoster(player, teamPlayers).length;
    familyDelta = Math.min(3, familyCount);
  }

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
    win *= 2; // win-delta 2× (can reach +5 on elite teams)
    // Use effectiveRecord so offseason 0-0 falls back to last season's record
    if (team) {
      const compRec = currentYear ? effectiveRecord(team, currentYear) : { wins: team.wins, losses: team.losses };
      const compGP = compRec.wins + compRec.losses;
      if (compGP > 0 && (compRec.wins / compGP) < 0.40) {
        win -= 2; // extra penalty on rebuilder
      }
    }
    win = clamp(win, -6, 5); // COMPETITOR-specific clamp: allow deeper lows
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
    playingTime: clamp(pt, -5, 5),
    teamSuccess: clamp(win, -8, 7),
    contractSatisfaction: clamp(contract, -4, 4),
    commishRelationship: clamp(relDelta, -3, 3),
    roleStability: clamp(role, -3, 2),
    marketSize: clamp(marketDelta, -3, 6),
    familyTies: clamp(familyDelta, 0, 3),
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
