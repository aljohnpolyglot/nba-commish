/**
 * GamePlan — per-game scoring + minutes lottery.
 *
 * Produces two normalized multiplier arrays (one per rotation slot):
 *   ptsMult[i]     — applied to each player's ptsTarget (mean = 1.0 per slot)
 *   minutesMult[i] — applied to each player's allocated minutes (mean = 1.0 per slot)
 *
 * Key principles:
 *  • Lottery-based, not template-based — every stat is drawn from a continuous distribution
 *  • Stars (slot 0-1) are more stable: small σ.  Deep bench (slot 7+): large σ.
 *  • ptsMult and minutesMult are correlated (~65%) but not identical — a guy can get
 *    extra minutes without dominating the scoring, or catch fire in limited time.
 *  • Both arrays are normalized so their mean is exactly 1.0 → season averages are preserved.
 */

export interface GamePlan {
  ptsMult:      number[];
  minutesMult:  number[];
}

// Box-Muller normal sample
function sampleNormal(mean: number, sigma: number): number {
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sigma * z;
}

/**
 * σ increases with slot depth so deeper bench is more volatile:
 *   slot 0 (star)    → 0.07
 *   slot 1 (co-star) → 0.10
 *   slot 2           → 0.13
 *   slot 3-4         → 0.16-0.19
 *   slot 5 (6th man) → 0.22
 *   slot 6-7         → 0.25-0.28
 *   slot 8+          → capped at 0.34
 */
function slotSigma(slot: number): number {
  return Math.min(0.34, 0.07 + slot * 0.03);
}

export function generateGamePlan(rotationSize: number): GamePlan {
  // ── 1. Draw raw minutes weights ───────────────────────────────────────────
  const rawMins = Array.from({ length: rotationSize }, (_, i) =>
    Math.min(1.50, Math.max(0.35, sampleNormal(1.0, slotSigma(i))))
  );

  // ── 2. Draw raw pts weights: 65% correlated with minutes, 35% independent ─
  //    This allows "quiet night with good defense" or "caught fire in 22 min".
  const rawPts = Array.from({ length: rotationSize }, (_, i) => {
    const sigma         = slotSigma(i);
    const minsDeviation = rawMins[i] - 1.0;
    const correlated    = minsDeviation * 0.65;
    const independent   = sampleNormal(0, sigma * 0.55);
    return Math.max(0.28, 1.0 + correlated + independent);
  });

  // ── 3. Normalize both arrays so mean = 1.0 (sum = rotationSize) ───────────
  const minsSum = rawMins.reduce((a, b) => a + b, 0) || rotationSize;
  const ptsSum  = rawPts.reduce((a, b) => a + b, 0)  || rotationSize;

  const minutesMult = rawMins.map(v => (v / minsSum) * rotationSize);
  const ptsMult     = rawPts.map(v  => (v / ptsSum)  * rotationSize);

  return { ptsMult, minutesMult };
}
