import { normalRandom } from '../utils';

export function simulateQuarters(
  homeTotal: number,
  awayTotal: number,
  lead: number,
  otCount: number = 0,
  numQuarters: number = 4
): { home: number[]; away: number[] } {

  const homeWins = homeTotal > awayTotal;
  const regulationPeriods = Math.max(1, Math.floor(numQuarters || 4));
  const buildWeights = (isWinner: boolean): number[] => {
    const base = Array.from({ length: regulationPeriods }, () => 1 / regulationPeriods);
    if (regulationPeriods >= 4) {
      const earlyShift = isWinner ? -0.01 : 0.01;
      const lateShift = isWinner ? 0.015 : -0.015;
      base[0] = Math.max(0.05, base[0] + earlyShift);
      base[regulationPeriods - 2] = Math.max(0.05, base[regulationPeriods - 2] + lateShift);
      base[regulationPeriods - 1] = Math.max(0.05, base[regulationPeriods - 1] - lateShift);
    }
    const total = base.reduce((a, b) => a + b, 0) || 1;
    return base.map(w => w / total);
  };

  if (otCount > 0) {
    // OT games: both teams MUST be tied at end of regulation.
    // Estimate loser's OT contribution (~10 pts per OT period) to back out the tied reg score.
    const loserOTEstimate = otCount * 10;
    const regTied = Math.max(60, Math.min(homeTotal, awayTotal) - loserOTEstimate);
    const homeOT = Math.max(2, homeTotal - regTied);
    const awayOT = Math.max(2, awayTotal - regTied);

    // Distribute the same tied regulation total for each team (slight per-quarter variance for realism)
    const distributeReg = (total: number, isWinner: boolean): number[] => {
      const w = buildWeights(isWinner);
      const raw = w.map(weight => Math.max(10, Math.round(total * weight * normalRandom(1.0, 0.06))));
      const driftIndex = Math.min(1, raw.length - 1);
      const finalIndex = raw.length - 1;
      // First drift fix into an early period
      const drift1 = total - raw.reduce((a, b) => a + b, 0);
      raw[driftIndex] = Math.max(8, raw[driftIndex] + drift1);
      // Second precision fix into the final regulation period
      const drift2 = total - raw.reduce((a, b) => a + b, 0);
      raw[finalIndex] = Math.max(8, raw[finalIndex] + drift2);
      return raw;
    };

    const homeReg = distributeReg(regTied, homeWins);
    const awayReg = distributeReg(regTied, !homeWins);

    // Distribute OT points across periods
    const homeOTByPeriod: number[] = [];
    const awayOTByPeriod: number[] = [];

    if (otCount === 1) {
      homeOTByPeriod.push(homeOT);
      awayOTByPeriod.push(awayOT);
    } else {
      // Middle OT periods are roughly tied; last is decisive
      let hRem = homeOT;
      let aRem = awayOT;
      for (let i = 0; i < otCount - 1; i++) {
        const pts = Math.max(5, Math.round(normalRandom(10, 1)));
        homeOTByPeriod.push(pts);
        awayOTByPeriod.push(pts);
        hRem -= pts;
        aRem -= pts;
      }
      homeOTByPeriod.push(Math.max(2, hRem));
      awayOTByPeriod.push(Math.max(2, aRem));
    }

    // Ensure decisive (last) OT period goes to the right winner
    const last = otCount - 1;
    if (homeWins && homeOTByPeriod[last] <= awayOTByPeriod[last]) {
      homeOTByPeriod[last] = awayOTByPeriod[last] + Math.max(1, Math.round(normalRandom(2, 1)));
    } else if (!homeWins && awayOTByPeriod[last] <= homeOTByPeriod[last]) {
      awayOTByPeriod[last] = homeOTByPeriod[last] + Math.max(1, Math.round(normalRandom(2, 1)));
    }

    return {
      home: [...homeReg, ...homeOTByPeriod],
      away: [...awayReg, ...awayOTByPeriod],
    };
  }

  // ── Non-OT: original distribution ────────────────────────────────────────
  // Per-quarter minimums scale with total so 3-min All-Star games (~30 pts) don't
  // get clamped to 10/quarter (= 40 sum, way above the actual total).
  const perQuarterFloor = Math.max(2, Math.round(Math.min(homeTotal, awayTotal) * 0.10));
  const driftFloor = Math.max(1, Math.round(perQuarterFloor * 0.8));
  const distributeScore = (total: number, isWinner: boolean): number[] => {
    const w = buildWeights(isWinner);

    const raw = w.map(weight =>
      Math.max(perQuarterFloor, Math.round(total * weight * normalRandom(1.0, 0.08)))
    );

    const drift = total - raw.reduce((a, b) => a + b, 0);
    raw[raw.length - 1] = Math.max(perQuarterFloor, raw[raw.length - 1] + drift);

    return raw;
  };

  const home = distributeScore(homeTotal, homeWins);
  const away = distributeScore(awayTotal, !homeWins);

  if (lead > 20) {
    const blowoutFloor = Math.max(2, Math.round(perQuarterFloor * 1.5));
    const finalRegIndex = home.length - 1;
    home[finalRegIndex] = Math.max(blowoutFloor, Math.round(home[finalRegIndex] * 0.82));
    away[finalRegIndex] = Math.max(blowoutFloor, Math.round(away[finalRegIndex] * 0.82));
    const homeDrift = homeTotal - home.reduce((a, b) => a + b, 0);
    const awayDrift = awayTotal - away.reduce((a, b) => a + b, 0);
    const absorb = Math.max(0, Math.min(home.length - 2, 2));
    home[absorb] += homeDrift;
    away[absorb] += awayDrift;
  }

  // Final drift correction into Q2
  const homeDrift = homeTotal - home.reduce((a, b) => a + b, 0);
  const awayDrift = awayTotal - away.reduce((a, b) => a + b, 0);
  const driftIndex = Math.min(1, home.length - 1);
  home[driftIndex] = Math.max(driftFloor, home[driftIndex] + homeDrift);
  away[driftIndex] = Math.max(driftFloor, away[driftIndex] + awayDrift);

  return { home, away };
}
