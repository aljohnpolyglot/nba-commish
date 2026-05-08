/**
 * defensiveSystemFit — roster-vs-defensive-system fit scorer.
 *
 * Parallels the offensive fit scoring in coachSliders.ts. For each defensive
 * system, returns a 0-100 score representing how well the roster matches the
 * personnel demands of that scheme.
 *
 * Per user direction:
 *  - Switch Everything → versatility (spd + stre + diq + jmp + hgt across roster)
 *  - Drop Coverage → high interior defense (big's diq + hgt + stre + block)
 *  - Pack Line → help-rotating wings + active big
 *  - Press defenses → guard speed + endurance
 *  - Junk defenses → having lockdown wings
 *
 * Output is meant to BLEND with team-level Familiarity (`byDefense`) — a great
 * fit means the system would work IF drilled. A bad fit means even max-drill
 * can't save it. Caller decides the blend ratio (suggested 60/40 fit/familiarity).
 */

import type { PlayerK2 } from '../TeamTraining/types';

type Stats = Record<string, number>;

function getStats(p: PlayerK2): Stats {
  return (p.stats ?? {}) as any;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Average a stat across the top-N players (by overall) — "rotation impact".
 *  Default 5 — the rotation core, NOT the bench. Reading 8 dilutes with low-rated
 *  bench guys and crushes elite teams toward the middle. */
function avgTop(roster: PlayerK2[], key: keyof Stats, n: number = 5): number {
  if (!roster.length) return 50;
  const sorted = [...roster].sort((a, b) => ((b as any).bbgmOvr ?? 50) - ((a as any).bbgmOvr ?? 50));
  const top = sorted.slice(0, Math.min(n, sorted.length));
  const sum = top.reduce((s, p) => s + (Number(getStats(p)[key as string] ?? 50)), 0);
  return sum / top.length;
}

/** Stretches BBGM-scale stats (which actually cluster 50-65 even for elite
 *  players — 75+ is essentially nonexistent) into a readable display range.
 *  Steep coefficient to compensate for the compressed source range:
 *    47 → 31 (Personnel Mismatch)
 *    50 → 40 (replacement-level)
 *    55 → 55 (Competence floor)
 *    60 → 70 (Competence high)
 *    63 → 79 (Mastery floor)
 *    65 → 85 (Mastery)
 *    70 → 100 (rare ceiling)
 *  Without this transform, BBGM's compressed rating scale leaves elite defenses
 *  visually indistinguishable from average ones. */
function eliteCurve(x: number): number {
  return clamp(40 + (x - 50) * 3);
}

/** Whether any rostered defender is "elite stopper" caliber — DIQ ≥ 60.
 *  In BBGM 60+ DIQ is rare; most rotation defenders sit ~50-55. */
function hasEliteStopper(roster: PlayerK2[]): boolean {
  return roster.some(p => Number(getStats(p).diq ?? 0) >= 60);
}

/** Top-1 defender's `diq` — used as the explicit "elite anchor" signal. */
function topDiq(roster: PlayerK2[]): number {
  if (!roster.length) return 50;
  return Math.max(...roster.map(p => Number(getStats(p).diq ?? 50)));
}

/** Score a single player by an attribute basket (avg of listed keys). */
function playerScore(p: PlayerK2, keys: string[]): number {
  const s = getStats(p);
  const sum = keys.reduce((acc, k) => acc + Number(s[k] ?? 50), 0);
  return sum / keys.length;
}

/** Average score of the top-N roster players ranked by the same basket. */
function topNByScore(roster: PlayerK2[], keys: string[], n: number): number {
  if (!roster.length) return 50;
  const scored = roster.map(p => playerScore(p, keys)).sort((a, b) => b - a);
  const top = scored.slice(0, Math.min(n, scored.length));
  return top.reduce((s, v) => s + v, 0) / top.length;
}

/** Find the team's primary big — tallest of the top 8. */
function getPrimaryBig(roster: PlayerK2[]): PlayerK2 | null {
  if (!roster.length) return null;
  const top = [...roster].sort((a, b) => ((b as any).bbgmOvr ?? 50) - ((a as any).bbgmOvr ?? 50)).slice(0, 8);
  return [...top].sort((a, b) => (Number(getStats(b).hgt ?? 50)) - (Number(getStats(a).hgt ?? 50)))[0] ?? null;
}

export function computeDefensiveSystemFit(roster: PlayerK2[]): Record<string, number> {
  if (!roster.length) return {};

  const big = getPrimaryBig(roster);
  const bigStats = big ? getStats(big) : {};

  // Helpers — averaged top-5 (rotation-core) attribute reads. Top-8 dilutes
  // with bench guys and visually crushes elite defenses.
  const diq = avgTop(roster, 'diq');
  const spd = avgTop(roster, 'spd');
  const stre = avgTop(roster, 'stre');
  const hgt = avgTop(roster, 'hgt');
  const jmp = avgTop(roster, 'jmp');
  const endu = avgTop(roster, 'endu');
  const oiq = avgTop(roster, 'oiq');

  const bigSpd = Number(bigStats.spd ?? 65);
  const bigDiq = Number(bigStats.diq ?? 50);
  const bigHgt = Number(bigStats.hgt ?? 50);
  const bigStre = Number(bigStats.stre ?? 50);
  const bigJmp = Number(bigStats.jmp ?? 50);

  // Mobile-big bonus drives Switch Everything (only fluid if 5 can switch 1-5).
  const mobileBigBonus = Math.max(0, bigSpd - 65) * 0.6;
  const slowBigPenalty = Math.max(0, 65 - bigSpd) * 0.5;
  // Elite stopper bonus drives lockdown-centric schemes.
  const elitePresence = hasEliteStopper(roster) ? 5 : 0;
  const topAnchor = topDiq(roster);

  const fits: Record<string, number> = {
    // Baseline man — every defensive team should be at least Competence here.
    // Scales with diq + slight stre buffer (POA physicality).
    'Man-to-Man': diq * 0.7 + stre * 0.2 + spd * 0.1,

    // Switch Everything — versatility. Like-sized wings + mobile big are king.
    // Heavy mobile-big bonus, heavy slow-big penalty.
    'Switch Everything':
      diq * 0.25 + spd * 0.30 + stre * 0.15 + jmp * 0.10 + hgt * 0.20
      + mobileBigBonus - slowBigPenalty,

    // Drop Coverage — anchor big's interior package is everything.
    'Drop Coverage':
      bigDiq * 0.4 + bigHgt * 0.25 + bigStre * 0.2 + bigJmp * 0.15,

    // Hedge / Show — mobile big + active wing tags.
    'Hedge / Show':
      bigSpd * 0.3 + bigDiq * 0.25 + diq * 0.25 + endu * 0.20,

    // Ice / Down — POA disruption + big who stays back.
    'Ice / Down':
      diq * 0.45 + bigDiq * 0.30 + spd * 0.25,

    // Blitz / Trap — hyperactive everywhere. Endurance gates it hard.
    'Blitz / Trap':
      diq * 0.30 + spd * 0.25 + endu * 0.25 + bigSpd * 0.20
      - Math.max(0, 60 - endu) * 0.5
      + elitePresence,

    // Pack Line — disciplined help rotations, big anchor matters.
    'Pack Line':
      diq * 0.50 + bigDiq * 0.25 + stre * 0.25,

    // No Middle — physical wings + diq.
    'No Middle':
      diq * 0.40 + stre * 0.30 + spd * 0.30,

    // Zone defenses — length + collective IQ.
    '2-3 Zone':
      hgt * 0.30 + diq * 0.30 + bigHgt * 0.25 + jmp * 0.15,
    '3-2 Zone':
      diq * 0.35 + spd * 0.30 + hgt * 0.20 + endu * 0.15,
    '1-3-1 Zone':
      spd * 0.30 + diq * 0.30 + hgt * 0.25 + endu * 0.15,
    'Match-Up Zone':
      (diq + oiq) / 2 * 0.65 + hgt * 0.20 + spd * 0.15,

    // Junk defenses — DOMINATED by your single best stopper.
    // Score = topDiq (the lockdown's IQ ceiling) + supporting cast.
    'Box-and-1':
      topAnchor * 0.55 + diq * 0.25 + spd * 0.20 + elitePresence * 1.5,
    'Triangle-and-2':
      topNByScore(roster, ['diq', 'spd', 'stre'], 2) * 0.5 + diq * 0.30 + spd * 0.20 + elitePresence,

    // Press defenses — speed + endurance for guards.
    'Full-Court Press':
      topNByScore(roster, ['spd', 'endu', 'diq'], 4) * 0.55 + endu * 0.30 + spd * 0.15
      - Math.max(0, 65 - endu) * 0.6,
    'Half-Court Trap':
      spd * 0.35 + diq * 0.35 + endu * 0.20 + stre * 0.10,
    '3/4-Court Pickup':
      spd * 0.40 + endu * 0.30 + diq * 0.30,
  };

  // Apply elite curve + clamp at the end. Stretches BBGM's compressed scale
  // into a more readable display: replacement = 40, elite = 85+, all-time = 100.
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(fits)) {
    out[k] = Math.round(eliteCurve(raw));
  }
  return out;
}

/**
 * Blend roster fit + per-system Familiarity.
 *
 * Fit is the FLOOR (= "could this team execute this scheme right now?").
 * Familiarity is a BONUS on top, capped at +25, that represents how much
 * additional polish reps add. So:
 *  - Great roster (fit 80) + 0 reps     → 80 (Mastery from personnel alone)
 *  - Great roster (fit 80) + 100 reps   → 100 (clamped — Mastery)
 *  - Mediocre roster (fit 50) + 100 reps → 75 (Mastery via grinding)
 *  - Bad roster (fit 30) + 100 reps      → 55 (drilled-but-mismatched)
 *
 * Mental model: you can always run a scheme as well as your personnel
 * allows; reps shrink the gap between "we tried it" and "we own it",
 * but they can't turn a mismatched roster into elite.
 */
export function blendDefensiveProficiency(
  fit: number,
  familiarity: number = 0,
): number {
  const f = clamp(fit);
  const fam = clamp(familiarity);
  return Math.round(clamp(f + Math.min(25, fam * 0.25)));
}
