const HISTORICAL_NBA_ABBREV_ALIASES: Record<string, string> = {
  GS: 'GSW',
  SA: 'SAS',
  NYC: 'NYK',
  PHO: 'PHX',
  BRK: 'BKN',
  NJN: 'BKN',
  NOH: 'NOP',
  NOK: 'NOP',
  NOL: 'NOP',
  CHO: 'CHA',
  SEA: 'OKC',
  CHH: 'CHA',
  VAN: 'MEM',
  WSB: 'WAS',
  KCK: 'SAC',
  CIN: 'SAC',
  ROC: 'SAC',
  SDC: 'LAC',
  BUF: 'LAC',
  SYR: 'PHI',
  PHW: 'GSW',
  MPL: 'LAL',
  MNL: 'LAL',
  STL: 'ATL',
  FTW: 'DET',
  BLB: 'WAS',
  INJ: 'IND',
  INO: 'IND',
  AND: 'IND',
  DNN: 'DEN',
  SHE: 'MIL',
  WAT: 'ATL',
};

export function normalizeHistoricalNbaTeamAbbrev(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/^_+/, '');
  if (!normalized || normalized === 'TOT') return null;
  return HISTORICAL_NBA_ABBREV_ALIASES[normalized] ?? normalized;
}
