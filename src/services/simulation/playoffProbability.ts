export function fastHomeWinProbability(strengthDiff: number): number {
  const logistic = 1 / (1 + Math.exp(-Number(strengthDiff) * 0.09));
  return Math.max(0.07, Math.min(0.93, logistic));
}

/** Exact 2-2-1-1-1 series probability under the Fast engine's per-game strength contract. */
export function bestOfSevenHigherSeedWinProbability({
  strengthGap,
  homeCourtAdvantage,
}: {
  strengthGap: number;
  homeCourtAdvantage: number;
}): number {
  const higherSeedAtHome = [true, true, false, false, true, false, true];
  const states = new Map<string, number>([['0:0', 1]]);
  let higherSeedSeriesWin = 0;
  for (let gameIndex = 0; gameIndex < higherSeedAtHome.length; gameIndex += 1) {
    const next = new Map<string, number>();
    for (const [key, stateProbability] of states) {
      const [higherWins, lowerWins] = key.split(':').map(Number);
      if (higherWins >= 4 || lowerWins >= 4) continue;
      const atHome = higherSeedAtHome[gameIndex];
      const higherGameWinProbability = atHome
        ? fastHomeWinProbability(strengthGap + homeCourtAdvantage)
        : 1 - fastHomeWinProbability(-strengthGap + homeCourtAdvantage);
      if (higherWins + 1 >= 4) {
        higherSeedSeriesWin += stateProbability * higherGameWinProbability;
      } else {
        const winKey = `${higherWins + 1}:${lowerWins}`;
        next.set(winKey, (next.get(winKey) ?? 0) + stateProbability * higherGameWinProbability);
      }
      if (lowerWins + 1 < 4) {
        const lossKey = `${higherWins}:${lowerWins + 1}`;
        next.set(lossKey, (next.get(lossKey) ?? 0) + stateProbability * (1 - higherGameWinProbability));
      }
    }
    states.clear();
    for (const [key, probability] of next) states.set(key, probability);
  }
  return higherSeedSeriesWin;
}
