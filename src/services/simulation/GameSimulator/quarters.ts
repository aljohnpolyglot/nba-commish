import { normalRandom } from '../utils';

export function simulateQuarters(
  homeTotal: number,
  awayTotal: number,
  lead: number,
  otCount: number = 0
): { home: number[]; away: number[] } {
  
  const distributeScore = (total: number, isWinner: boolean, otCount: number): number[] => {
    // If OT, reserve some points for OT periods (roughly 8-12 points per OT)
    const otPoints = otCount > 0 ? Array.from({ length: otCount }, () => Math.max(5, Math.round(10 * normalRandom(1.0, 0.2)))) : [];
    const totalOTPoints = otPoints.reduce((sum, p) => sum + p, 0);
    
    const regulationTotal = Math.max(40, total - totalOTPoints);

    const w = isWinner
      ? [0.24, 0.26, 0.28, 0.22]
      : [0.26, 0.24, 0.22, 0.28];

    const raw = w.map(weight =>
      Math.max(10, Math.round(regulationTotal * weight * normalRandom(1.0, 0.08)))
    );

    const drift = regulationTotal - (raw[0] + raw[1] + raw[2] + raw[3]);
    raw[3] = Math.max(10, raw[3] + drift);

    return [...raw, ...otPoints];
  };

  const homeWins = homeTotal > awayTotal;
  const home = distributeScore(homeTotal, homeWins, otCount);
  const away = distributeScore(awayTotal, !homeWins, otCount);

  // Adjust OT points to ensure winner wins the last OT
  if (otCount > 0) {
    const lastOTIndex = 3 + otCount;
    
    if (homeWins) {
      if (home[lastOTIndex] <= away[lastOTIndex]) {
        // Give home the win in last OT, redistribute within OT periods only
        home[lastOTIndex] = away[lastOTIndex] + Math.max(1, Math.round(normalRandom(2, 1)));
      }
    } else {
      if (away[lastOTIndex] <= home[lastOTIndex]) {
        away[lastOTIndex] = home[lastOTIndex] + Math.max(1, Math.round(normalRandom(2, 1)));
      }
    }

    // Non-decisive OT periods should be tied or very close
    for (let ot = 1; ot < otCount; ot++) {
      const idx = 3 + ot;
      const avg = Math.round((home[idx] + away[idx]) / 2);
      home[idx] = avg;
      away[idx] = avg;
    }
  }

  if (lead > 20 && otCount === 0) {
    home[3] = Math.max(15, Math.round(home[3] * 0.82));
    away[3] = Math.max(15, Math.round(away[3] * 0.82));
    const homeDrift = homeTotal - home.reduce((a, b) => a + b, 0);
    const awayDrift = awayTotal - away.reduce((a, b) => a + b, 0);
    home[2] += homeDrift;
    away[2] += awayDrift;
  }

  // Final drift correction — spread across middle quarters not Q1
  const homeDrift = homeTotal - home.reduce((a, b) => a + b, 0);
  const awayDrift = awayTotal - away.reduce((a, b) => a + b, 0);
  // Dump into Q2 which is least narratively important
  home[1] = Math.max(8, home[1] + homeDrift);
  away[1] = Math.max(8, away[1] + awayDrift);

  return { home, away };
}
