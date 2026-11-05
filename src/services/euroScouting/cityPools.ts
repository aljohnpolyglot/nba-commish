export type CityPool = Array<[name: string, population: number]>;

let cityPools: Record<string, CityPool> | null = null;
let cityPoolRequest: Promise<void> | null = null;

export const preloadEuroCityPools = (): Promise<void> => {
  if (cityPools) return Promise.resolve();
  if (!cityPoolRequest) {
    cityPoolRequest = fetch('/data/euro-scouting/cityPools.json')
      .then(response => {
        if (!response.ok) throw new Error('City data unavailable');
        return response.json();
      })
      .then(data => { cityPools = data as Record<string, CityPool>; })
      .catch(() => { cityPools = {}; });
  }
  return cityPoolRequest;
};

export const pickWeightedEuroCity = (iso2: string, roll: number): string | null => {
  const pool = cityPools?.[iso2.toUpperCase()];
  if (!pool?.length) return null;
  const total = pool.reduce((sum, [, population]) => sum + population, 0);
  let target = Math.max(0, Math.min(0.999999999, roll)) * total;
  for (const [name, population] of pool) {
    target -= population;
    if (target <= 0) return name;
  }
  return pool[pool.length - 1][0];
};

export const getEuroCityPool = (iso2: string): CityPool => (
  cityPools?.[iso2.toUpperCase()]?.map(([name, population]) => [name, population]) ?? []
);

export const getStableCityRoll = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
};

const normalizeCityText = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const findEuroCityForClubName = (iso2: string, clubName: string): string | null => {
  const normalizedClub = ` ${normalizeCityText(clubName)} `;
  const candidates = getEuroCityPool(iso2)
    .filter(([name]) => normalizedClub.includes(` ${normalizeCityText(name)} `))
    .sort((a, b) => b[0].length - a[0].length || b[1] - a[1]);
  return candidates[0]?.[0] ?? null;
};
