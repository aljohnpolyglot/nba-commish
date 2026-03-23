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

  // Validated against CraftedNBA data:
  // SGA (fg=98,tp=37,oiq=93,endu=56) → ~17 (very consistent)
  // Steph (fg=84,tp=96,oiq=70,endu=55) → ~45 (streaky)
  // Mathurin (fg=67,tp=49,oiq=65,endu=77) → ~37 (boom/bust)
  // Valanciunas (fg=86,tp=29,oiq=72,endu=2) → ~30 (disaster floor)
  return (100 - fg)   * 0.45
       + tp            * 0.30
       + (100 - oiq)  * 0.15
       + (100 - endu) * 0.10;
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

  // Normalize streakiness: practical NBA range is ~15–55
  const normalized = Math.min(1, streakiness / 55);

  // ONE shared roll → everything correlates (bad night = worse pts AND worse efficiency)
  const roll = approxNormal(); // ~-1 to 1

  // ── Points target multiplier ──────────────────────────────────────────
  // Width: SGA(normalized~0.32) → ±0.09  |  Steph(~0.82) → ±0.22
  const ptsWidth = 0.06 + normalized * 0.20;
  let ptsTargetMult = 1.0 + roll * ptsWidth;

  // Cap explosion ceiling by OVR — Malachi Flynn cannot go nuclear
  // OVR 94 → max 1.61x  |  OVR 70 → max 1.46x  |  OVR 50 → max 1.33x
  const maxMult = 1.0 + (ovr / 100) * 0.65;
  // Floor: stars don't have total disasters
  // OVR 94 → min 0.60  |  OVR 70 → min 0.50  |  OVR 50 → min 0.43
  const minMult = 0.35 + (ovr / 100) * 0.25;
  ptsTargetMult = Math.max(minMult, Math.min(maxMult, ptsTargetMult));

  // ── Efficiency multiplier (fg%, 3p%, ft%) ────────────────────────────
  // High fg rating = efficiency barely wobbles (SGA fg=98 → tiny swing)
  // Low fg = efficiency swings more (Mathurin fg=67 → bigger swing)
  const effWidth = ((100 - fg) / 100) * 0.18;
  const efficiencyMult = Math.max(0.72, Math.min(1.28, 1.0 + roll * effWidth));

  // ── Shot diet shift (threePointRate) ─────────────────────────────────
  // High tp players shift their 3pt diet more on a given night
  // Steph (tp=96) swings ±0.115  |  SGA (tp=37) barely moves ±0.044
  const dietWidth = (tp / 100) * 0.12;
  const shotDietShift = roll * dietWidth;

  // ── Lightning strikes (~1.5% total) ─────────────────────────────────
  // Bypasses the normal min/max clamps — these are the historic outliers
  const lightningRoll = Math.random();

  if (lightningRoll < 0.008) {
    // DISASTER — LeBron 2011 territory. Stars can still have historic collapses.
    return {
      ptsTargetMult: 0.25 + Math.random() * 0.25, // 25–50% of normal
      efficiencyMult: 0.55 + Math.random() * 0.15, // shooting falls apart
      shotDietShift,
    };
  }

  if (lightningRoll < 0.018) {
    // EXPLOSION — Corey Brewer 51pts territory.
    // OVR 68 → ceiling 2.01x  |  OVR 94 → ceiling 2.25x
    const explosionCeiling = 1.4 + (ovr / 100) * 0.9;
    return {
      ptsTargetMult: 1.6 + Math.random() * (explosionCeiling - 1.6),
      efficiencyMult: 1.15 + Math.random() * 0.20, // everything falling
      shotDietShift,
    };
  }

  return { ptsTargetMult, efficiencyMult, shotDietShift };
}
