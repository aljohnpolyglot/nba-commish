import { NBAPlayer as Player } from '../../../types';

export interface NightProfile {
  ptsTargetMult: number;   // overall scoring multiplier
  efficiencyMult: number;  // hits fg%, 3p%, ft% — same night, correlated
  shotDietShift: number;   // shifts threePointRate up/down
}

function calcStreakiness(rating: any): number {
  const fg   = rating.fg   ?? 50;
  const tp   = rating.tp   ?? 50;
  const oiq  = rating.oiq  ?? 50;
  const endu = rating.endu ?? 50;
  const dnk  = rating.dnk  ?? 50;
  const ins  = rating.ins  ?? 50;
  const hgt  = rating.hgt  ?? 50;

  // Rim-only bigs have low fg/tp but are NOT streaky — they get
  // automatic dunks/putbacks. Use dnk+ins as their consistency anchor.
  // Validated: Gobert (fg=28,dnk=92,hgt=80) → correctly low streakiness
  //            Robinson (fg=25,dnk=85,hgt=74,endu=10) → medium (endu hurts)
  const isRimOnly = tp < 20 && fg < 45 && dnk > 65 && hgt > 65;

  const effectiveFg = isRimOnly
    ? (dnk * 0.55 + ins * 0.30 + fg * 0.15)
    : fg;

  return (100 - effectiveFg) * 0.45
       + tp                  * 0.30
       + (100 - oiq)         * 0.15
       + (100 - endu)        * 0.10;
}

function approxNormal(): number {
  // Sum of 4 uniforms → approx normal, range ~-1 to 1, centered at 0
  // Mean-preserving: symmetric around 0 before clamping
  return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
}

export function getNightProfile(p: Player, season: number): NightProfile {
  const rating = p.ratings?.find(r => r.season === season)
              ?? p.ratings?.[p.ratings.length - 1];

  // No ratings = celebrity/mock player, flat profile
  if (!rating) return { ptsTargetMult: 1.0, efficiencyMult: 1.0, shotDietShift: 0 };

  const streakiness  = calcStreakiness(rating);
  const ovr          = p.overallRating ?? 70;
  const fg           = rating.fg   ?? 50;
  const tp           = rating.tp   ?? 50;
  const dnk          = rating.dnk  ?? 50;
  const hgt          = rating.hgt  ?? 50;

  const isRimOnly = tp < 20 && fg < 45 && dnk > 65 && hgt > 65;

  // Normalize streakiness: practical NBA range is ~15–55
  const normalized = Math.min(1, streakiness / 55);

  // ONE shared roll → everything correlates (bad night = worse pts AND worse efficiency)
  const roll = approxNormal(); // ~-1 to 1

  // Shot diet shift computed early (used by lightning paths too)
  const dietWidth     = (tp / 100) * 0.12;
  const shotDietShift = roll * dietWidth;

  // ── Lightning strikes FIRST (~1.5% total) ────────────────────────────
  // Bypasses the normal min/max clamps — these are the historic outliers
  const lightningRoll = Math.random();

  if (lightningRoll < 0.008) {
    // DISASTER — LeBron 2011 territory. Stars can still have historic collapses.
    return {
      ptsTargetMult:  0.25 + Math.random() * 0.25, // 25–50% of normal
      efficiencyMult: 0.55 + Math.random() * 0.15, // shooting falls apart
      shotDietShift,
    };
  }

  if (lightningRoll < 0.018) {
    // EXPLOSION — Corey Brewer 51pts territory.
    // OVR 68 → ceiling 2.01x  |  OVR 94 → ceiling 2.25x
    const explosionCeiling = 1.4 + (ovr / 100) * 0.9;
    return {
      ptsTargetMult:  1.6 + Math.random() * (explosionCeiling - 1.6),
      efficiencyMult: 1.15 + Math.random() * 0.20,
      shotDietShift,
    };
  }

  // ── Normal night ──────────────────────────────────────────────────────

  // Points multiplier — width scales with streakiness AND 3-point shot diet.
  // High-tp shooters (Curry, Klay) are boom-or-bust: a cold 3pt night tanks
  // the whole line; a hot one explodes it. That's the real NBA pattern.
  // SGA (tp~45, norm~0.32) → ptsWidth ~0.17  |  Steph (tp~86, norm~0.78) → ~0.38
  const tpBoost  = (tp / 100) * 0.15; // pure shooter volatility
  const ptsWidth = 0.06 + normalized * 0.20 + tpBoost;
  let ptsTargetMult = 1.0 + roll * ptsWidth;

  // Cap explosion ceiling by OVR — Malachi Flynn cannot go nuclear
  // OVR 94 → max 1.61x  |  OVR 70 → max 1.46x  |  OVR 50 → max 1.33x
  const maxMult = 1.0 + (ovr / 100) * 0.65;
  // Floor: stars can still go cold — don't protect them too much
  // OVR 94 → min 0.45  |  OVR 70 → min 0.38  |  OVR 50 → min 0.33
  const minMult = 0.25 + (ovr / 100) * 0.20;
  ptsTargetMult = Math.max(minMult, Math.min(maxMult, ptsTargetMult));

  // ── Efficiency multiplier (fg%, 3p%, ft%) ────────────────────────────
  // Rim-only bigs use dnk as their consistency anchor (Gobert auto-dunks)
  // High fg/dnk = efficiency barely wobbles | Low fg = bigger swing
  // 3pt-heavy shooters get extra efficiency swing — cold = .2/17, hot = 7/16
  const effBase  = isRimOnly ? dnk : fg;
  const effWidth = ((100 - effBase) / 100) * (isRimOnly ? 0.08 : 0.18)
                 + (tp / 100) * 0.08; // 3pt shooters: efficiency swings harder
  const efficiencyMult = Math.max(0.62, Math.min(1.32, 1.0 + roll * effWidth));

  return { ptsTargetMult, efficiencyMult, shotDietShift };
}
