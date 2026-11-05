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
  const distributeExact = (total: number, weights: number[], deviation: number): number[] => {
    const safeTotal = Math.max(0, Math.round(total));
    if (weights.length === 0) return [];
    const varied = weights.map(weight => Math.max(0.0001, weight * normalRandom(1, deviation)));
    const variedTotal = varied.reduce((sum, weight) => sum + weight, 0) || 1;
    const exact = varied.map(weight => safeTotal * weight / variedTotal);
    const result = exact.map(value => Math.floor(value));
    let remainder = safeTotal - result.reduce((sum, value) => sum + value, 0);
    const remainderOrder = exact
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
    for (let index = 0; index < remainder; index++) {
      result[remainderOrder[index % remainderOrder.length].index]++;
    }
    return result;
  };
  const reconcileExact = (periods: number[], score: number, preferredIndex: number): void => {
    let delta = Math.max(0, Math.round(score)) - periods.reduce((sum, value) => sum + value, 0);
    if (delta >= 0) {
      periods[Math.max(0, Math.min(preferredIndex, periods.length - 1))] += delta;
      return;
    }
    const order = [preferredIndex, ...periods.map((_, index) => index)]
      .filter((index, position, values) => index >= 0 && index < periods.length && values.indexOf(index) === position);
    for (const index of order) {
      if (delta === 0) break;
      const removable = Math.min(periods[index], -delta);
      periods[index] -= removable;
      delta += removable;
    }
  };

  if (otCount > 0) {
    const losingTotal = Math.min(homeTotal, awayTotal);
    const estimatedLosingOt = Math.min(losingTotal, Math.max(otCount, otCount * 10));
    const regTied = Math.max(0, losingTotal - estimatedLosingOt);
    const homeReg = distributeExact(regTied, buildWeights(homeWins), 0.06);
    const awayReg = distributeExact(regTied, buildWeights(!homeWins), 0.06);
    const tiedOtPeriods = distributeExact(estimatedLosingOt, Array.from({ length: otCount }, () => 1 / otCount), 0.08);
    const homeOTByPeriod = [...tiedOtPeriods];
    const awayOTByPeriod = [...tiedOtPeriods];
    const finalOtIndex = otCount - 1;
    if (homeWins) homeOTByPeriod[finalOtIndex] += Math.max(0, homeTotal - awayTotal);
    if (!homeWins) awayOTByPeriod[finalOtIndex] += Math.max(0, awayTotal - homeTotal);

    return {
      home: [...homeReg, ...homeOTByPeriod],
      away: [...awayReg, ...awayOTByPeriod],
    };
  }

  // ── Non-OT: original distribution ────────────────────────────────────────
  const distributeScore = (total: number, isWinner: boolean): number[] => {
    return distributeExact(total, buildWeights(isWinner), 0.08);
  };

  const home = distributeScore(homeTotal, homeWins);
  const away = distributeScore(awayTotal, !homeWins);

  if (lead > 20) {
    const finalRegIndex = home.length - 1;
    home[finalRegIndex] = Math.max(0, Math.round(home[finalRegIndex] * 0.82));
    away[finalRegIndex] = Math.max(0, Math.round(away[finalRegIndex] * 0.82));
    const absorb = Math.max(0, Math.min(home.length - 2, 2));
    reconcileExact(home, homeTotal, absorb);
    reconcileExact(away, awayTotal, absorb);
  }

  const driftIndex = Math.min(1, home.length - 1);
  reconcileExact(home, homeTotal, driftIndex);
  reconcileExact(away, awayTotal, driftIndex);

  return { home, away };
}
