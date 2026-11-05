const CAP_HISTORY: Record<number, number> = {
  2014: 901_000,
  2015: 913_000,
  2016: 925_000,
  2017: 937_000,
  2018: 976_300,
  2019: 996_100,
  2020: 1_300_000,
  2021: 1_339_000,
  2022: 1_379_170,
  2023: 1_420_500,
  2024: 1_463_200,
  2025: 1_507_100,
  2026: 7_000_000,
};

const MAXIMUM_SALARIES: Record<number, { maximum: number; superMaximum: number }> = {
  2020: { maximum: 185_000, superMaximum: 215_000 },
  2021: { maximum: 190_550, superMaximum: 221_450 },
  2022: { maximum: 196_267, superMaximum: 228_094 },
  2023: { maximum: 202_154, superMaximum: 234_936 },
  2024: { maximum: 208_219, superMaximum: 241_984 },
  2025: { maximum: 214_466, superMaximum: 249_244 },
  2026: { maximum: 220_900, superMaximum: 256_721 },
  2027: { maximum: 227_527, superMaximum: 264_423 },
};

const MINIMUM_SALARIES: Record<number, { early: number; veteran: number }> = {
  2020: { early: 57_000, veteran: 68_000 },
  2021: { early: 58_710, veteran: 70_040 },
  2022: { early: 60_471, veteran: 72_141 },
  2023: { early: 62_285, veteran: 74_305 },
  2024: { early: 64_154, veteran: 76_535 },
  2025: { early: 66_079, veteran: 78_831 },
  2026: { early: 68_061, veteran: 81_196 },
  2027: { early: 70_103, veteran: 83_631 },
};

const ROOKIE_SCALE_2026 = {
  firstRound: [
    [500_000, 520_000, 572_000, 646_360],
    [466_913, 485_590, 534_149, 603_588],
    [436_016, 453_457, 498_803, 563_647],
    [407_163, 423_450, 465_795, 526_348],
    [380_219, 395_428, 434_971, 491_517],
    [355_058, 369_260, 406_186, 458_990],
    [331_563, 344_826, 379_309, 428_619],
    [309_622, 322_007, 354_208, 400_255],
    [289_133, 300_698, 330_768, 373_768],
  ],
  laterRounds: [270_000, 288_600, 317_460, 358_730],
} as const;

function projectFromLatest(table: Record<number, number>, season: number, growth = 1.03): number {
  const years = Object.keys(table).map(Number).sort((left, right) => left - right);
  const exact = table[season];
  if (exact != null) return exact;
  const first = years[0];
  const last = years[years.length - 1];
  if (season < first) return Math.round(table[first] / Math.pow(growth, first - season));
  return Math.round(table[last] * Math.pow(growth, season - last));
}

export function getWnbaSalaryCapUSD(season: number): number {
  return projectFromLatest(CAP_HISTORY, season);
}

export function getWnbaMaximumSalaryUSD(season: number, superMaximum: boolean): number {
  const values = Object.fromEntries(Object.entries(MAXIMUM_SALARIES).map(([year, row]) => [year, superMaximum ? row.superMaximum : row.maximum]));
  return projectFromLatest(values, season);
}

export function getWnbaMinimumSalaryUSD(season: number, yearsOfService: number): number {
  const veteran = Math.max(0, Math.trunc(yearsOfService)) >= 3;
  const values = Object.fromEntries(Object.entries(MINIMUM_SALARIES).map(([year, row]) => [year, veteran ? row.veteran : row.early]));
  return projectFromLatest(values, season);
}

export function getWnbaRookieScaleSalaryUSD(
  season: number,
  round: number,
  pickInRound: number,
  contractYearIndex: number,
): number {
  const yearIndex = Math.max(0, Math.min(3, Math.trunc(contractYearIndex)));
  const firstRound = Math.max(1, Math.trunc(round)) === 1;
  const base = firstRound
    ? ROOKIE_SCALE_2026.firstRound[Math.min(8, Math.max(0, Math.trunc(pickInRound) - 1))][yearIndex]
    : ROOKIE_SCALE_2026.laterRounds[yearIndex];
  if (season === 2026) return base;
  if (firstRound) {
    return Math.round(base * getWnbaSalaryCapUSD(season) / getWnbaSalaryCapUSD(2026));
  }
  return Math.round(base * Math.pow(1.04, season - 2026));
}

export function getWnbaEconomySnapshot(season: number) {
  const salaryCap = getWnbaSalaryCapUSD(season);
  const maximum = getWnbaMaximumSalaryUSD(season, false);
  const superMaximum = getWnbaMaximumSalaryUSD(season, true);
  return {
    salaryCap,
    maximum,
    superMaximum,
    minimum: getWnbaMinimumSalaryUSD(season, 0),
    maxPercentage: maximum / salaryCap * 100,
    superMaxPercentage: superMaximum / salaryCap * 100,
  };
}
