export function normalRandom(mean: number, stdDev: number): number {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdDev + mean;
}

export function getVariance(mean: number = 1.0, stdDev: number = 0.15): number {
  return normalRandom(mean, stdDev);
}
