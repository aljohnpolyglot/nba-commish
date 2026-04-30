import { normalRandom } from '../utils';

export function simulateQuarters(
  homeTotal: number,
  awayTotal: number,
  lead: number,
  otCount: number = 0
): { home: number[]; away: number[] } {

  const homeWins = homeTotal > awayTotal;

  if (otCount > 0) {
    // OT games: both teams MUST be tied at end of regulation.
    // Estimate loser's OT contribution (~10 pts per OT period) to back out the tied reg score.
    const loserOTEstimate = otCount * 10;
    const regTied = Math.max(60, Math.min(homeTotal, awayTotal) - loserOTEstimate);
    const homeOT = Math.max(2, homeTotal - regTied);
    const awayOT = Math.max(2, awayTotal - regTied);

    // Distribute the same tied regulation total for each team (slight per-quarter variance for realism)
    const distributeReg = (total: number, isWinner: boolean): number[] => {
      const w = isWinner
        ? [0.24, 0.26, 0.28, 0.22]
        : [0.26, 0.24, 0.22, 0.28];
      const raw = w.map(weight => Math.max(10, Math.round(total * weight * normalRandom(1.0, 0.06))));
      // First drift fix into Q2
      const drift1 = total - raw.reduce((a, b) => a + b, 0);
      raw[1] = Math.max(8, raw[1] + drift1);
      // Second precision fix into Q4 (so sum is exact)
      const drift2 = total - raw.reduce((a, b) => a + b, 0);
      raw[3] = Math.max(8, raw[3] + drift2);
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
    const w = isWinner
      ? [0.24, 0.26, 0.28, 0.22]
      : [0.26, 0.24, 0.22, 0.28];

    const raw = w.map(weight =>
      Math.max(perQuarterFloor, Math.round(total * weight * normalRandom(1.0, 0.08)))
    );

    const drift = total - (raw[0] + raw[1] + raw[2] + raw[3]);
    raw[3] = Math.max(perQuarterFloor, raw[3] + drift);

    return raw;
  };

  const home = distributeScore(homeTotal, homeWins);
  const away = distributeScore(awayTotal, !homeWins);

  if (lead > 20) {
    const blowoutFloor = Math.max(2, Math.round(perQuarterFloor * 1.5));
    home[3] = Math.max(blowoutFloor, Math.round(home[3] * 0.82));
    away[3] = Math.max(blowoutFloor, Math.round(away[3] * 0.82));
    const homeDrift = homeTotal - home.reduce((a, b) => a + b, 0);
    const awayDrift = awayTotal - away.reduce((a, b) => a + b, 0);
    home[2] += homeDrift;
    away[2] += awayDrift;
  }

  // Final drift correction into Q2
  const homeDrift = homeTotal - home.reduce((a, b) => a + b, 0);
  const awayDrift = awayTotal - away.reduce((a, b) => a + b, 0);
  home[1] = Math.max(driftFloor, home[1] + homeDrift);
  away[1] = Math.max(driftFloor, away[1] + awayDrift);

  return { home, away };
}
