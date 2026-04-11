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
  ptsMult:      number[];   // scoring share (normalized)
  minutesMult:  number[];   // playing time nudge (normalized, small σ)
  effMult:      number[];   // shooting efficiency nudge (+corr with pts)
  astMult:      number[];   // assist tendency (weak inverse corr with pts)
  ftaMult:      number[];   // foul-drawing concentration (+corr with pts) — funnels FTAs to scorers
}

// Box-Muller normal sample
function sampleNormal(mean: number, sigma: number): number {
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sigma * z;
}

/**
 * σ by slot — stars stable, role players genuinely volatile:
 *   slot 0 (star)       → 0.07   very stable
 *   slot 1 (co-star)    → 0.10
 *   slot 2 (3rd option) → 0.20   occasional 28-33 pt games
 *   slot 3              → 0.34   role player explosion territory
 *   slot 4              → 0.44
 *   slot 5+             → 0.52   deep bench: big variance both ways, capped 0.60
 */
function slotSigma(slot: number): number {
  if (slot === 0) return 0.17;                         // star: enough variance to reach 60-pt territory
  if (slot === 1) return 0.20;                         // co-star
  if (slot === 2) return 0.20;                         // 3rd option
  return Math.min(0.65, 0.40 + (slot - 3) * 0.10);   // role players: 0.40, 0.50, 0.60, 0.65+
}

export function generateGamePlan(rotationSize: number): GamePlan {
  // ── 1. Draw raw minutes weights ───────────────────────────────────────────
  const rawMins = Array.from({ length: rotationSize }, (_, i) =>
    Math.min(1.50, Math.max(0.35, sampleNormal(1.0, slotSigma(i))))
  );

  // ── 2. Draw raw pts weights: mostly independent of minutes ──────────────────
  //    Weak 15% correlation: natural link (more time → slight scoring opportunity).
  //    Strong independence: role player erupts in 22 min, star quiet in 38 min.
  //    The 65% correlation was causing every explosion night to also force 48 min.
  const rawPts = Array.from({ length: rotationSize }, (_, i) => {
    const sigma         = slotSigma(i);
    const minsDeviation = rawMins[i] - 1.0;
    const correlated    = minsDeviation * 0.15;   // was 0.65 — decoupled from minutes
    const independent   = sampleNormal(0, sigma); // now full σ drives scoring variance
    return Math.max(0.28, 1.0 + correlated + independent);
  });

  // ── 3. Narrative roll: occasional shape to who scores tonight ────────────────
  //    Nudges are MARGINAL (1.08–1.22× hero, 0.90–0.97× others).
  //    Natural σ still does the heavy lifting — this just tilts distribution.
  //    ~63% of games: pure independent variance (no narrative).
  {
    const roll = Math.random();
    const nm   = Array(rotationSize).fill(1.0);

    if (roll < 0.12 && rotationSize > 0) {
      // Star takeover: slot 0 elevated, rest gently down
      nm[0] = 1.08 + Math.random() * 0.12;
      for (let j = 1; j < rotationSize; j++) nm[j] = 0.91 + Math.random() * 0.06;

    } else if (roll < 0.22 && rotationSize > 1) {
      // 2nd-option night: slot 1 or 2 elevated, star slightly off
      const hero = rotationSize > 2 && Math.random() < 0.45 ? 2 : 1;
      nm[hero] = 1.08 + Math.random() * 0.12;
      nm[0]    = 0.90 + Math.random() * 0.07;

    } else if (roll < 0.30 && rotationSize > 3) {
      // Role player eruption: slots 3-6 — someone cooks (Mikal 35, Clarkson 32, Shamet 28)
      const hero = 3 + Math.floor(Math.random() * Math.min(4, rotationSize - 3));
      nm[hero] = 1.15 + Math.random() * 0.25;   // 1.15–1.40×
      nm[0]    = 0.91 + Math.random() * 0.06;
      if (rotationSize > 1) nm[1] = 0.92 + Math.random() * 0.06;

    } else if (roll < 0.37) {
      // Balanced night: everyone converges toward mean
      for (let j = 0; j < rotationSize; j++) nm[j] = 0.93 + Math.random() * 0.14;
    }
    // else (~63%): pure variance — no shaping

    for (let i = 0; i < rotationSize; i++) {
      rawPts[i] = Math.max(0.28, rawPts[i] * nm[i]);
    }
  }

  // ── 4a. FTA funnel: strongly correlated with pts (+65%), range [0.40, 2.0] ────────
  //    On a star takeover night, the scorer bulldozes the rim → disproportionate FTAs.
  //    Teammates who score less draw far fewer fouls. Slot σ scaled down (FTA is stable).
  const rawFta = Array.from({ length: rotationSize }, (_, i) => {
    const ptsDeviation = rawPts[i] - 1.0;
    const correlated   = ptsDeviation * 0.65;
    const own          = sampleNormal(0, slotSigma(i) * 0.12);
    return Math.max(0.40, Math.min(2.0, 1.0 + correlated + own));
  });

  // ── 4b. Efficiency nudge: positively correlated with pts (+45%), rest independent ─
  //    Low pts night → slightly lower FG% too.  Range [0.88, 1.12] — marginal only.
  const rawEff = Array.from({ length: rotationSize }, (_, i) => {
    const ptsDeviation = rawPts[i] - 1.0;
    const correlated   = ptsDeviation * 0.45;
    const own          = sampleNormal(0, slotSigma(i) * 0.20);
    return Math.max(0.88, Math.min(1.12, 1.0 + correlated + own));
  });

  // ── 4. Assist nudge: weak inverse correlation with pts (−25%), rest independent ─
  //    On a passive scoring night the player sometimes facilitates more.  Range [0.75, 1.25].
  const rawAst = Array.from({ length: rotationSize }, (_, i) => {
    const ptsDeviation = rawPts[i] - 1.0;
    const inverseCorr  = -ptsDeviation * 0.25;
    const own          = sampleNormal(0, slotSigma(i) * 0.25);
    return Math.max(0.75, Math.min(1.25, 1.0 + inverseCorr + own));
  });

  // ── 5. Normalize pts + minutes so mean = 1.0 (sum = rotationSize) ────────────
  const minsSum = rawMins.reduce((a, b) => a + b, 0) || rotationSize;
  const ptsSum  = rawPts.reduce((a, b) => a + b, 0)  || rotationSize;

  const minutesMult = rawMins.map(v => (v / minsSum) * rotationSize);
  const ptsMult     = rawPts.map(v  => (v / ptsSum)  * rotationSize);

  // effMult, astMult, ftaMult are raw (not normalized) — each player gets an independent nudge
  return { ptsMult, minutesMult, effMult: rawEff, astMult: rawAst, ftaMult: rawFta };
}
