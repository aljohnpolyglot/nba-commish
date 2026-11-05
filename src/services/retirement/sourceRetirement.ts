export const PLAYER_RETIREMENT_INACTIVITY_BUFFER_YEARS = 7;
export const STAFF_RETIREMENT_INACTIVITY_BUFFER_YEARS = 11;
export const SOURCE_RETIREMENT_CONFIDENCE_THRESHOLD = 0.86;

type SourceSeasonRow = {
  season?: unknown;
  year?: unknown;
  gp?: unknown;
  games?: unknown;
  tid?: unknown;
  teamId?: unknown;
  playoffs?: unknown;
  type?: unknown;
};

export type SourceRetirementPerson = {
  retiredYear?: unknown;
  retireddYer?: unknown;
  retirementYear?: unknown;
  retired_year?: unknown;
  lastSeason?: unknown;
  season_max?: unknown;
  status?: unknown;
  tid?: unknown;
  born?: { year?: unknown } | null;
  bornYear?: unknown;
  age?: unknown;
  stats?: SourceSeasonRow[] | null;
  ratings?: SourceSeasonRow[] | null;
  transactions?: SourceSeasonRow[] | null;
  assignments?: SourceSeasonRow[] | null;
  career?: SourceSeasonRow[] | null;
};

export type SourceRetirementResult = {
  retiredYear: number;
  confidence: number;
  evidence: 'explicit' | 'inferred';
  lastMeaningfulSeason: number;
  evidenceThrough: number;
  inactivityBufferYears: number;
};

const finiteYear = (value: unknown): number | null => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1800 && year <= 2200 ? year : null;
};

const rowYear = (row: SourceSeasonRow): number | null => finiteYear(row.season ?? row.year);

const hasGames = (row: SourceSeasonRow): boolean => {
  const raw = row.gp ?? row.games;
  if (raw == null) return true;
  const games = Number(raw);
  return Number.isFinite(games) && games > 0;
};

const isActiveRow = (row: SourceSeasonRow): boolean => {
  if (!hasGames(row)) return false;
  const type = String(row.type ?? '').toLowerCase();
  return !/(retir|death|died)/.test(type);
};

export function getExplicitSourceRetiredYear(person: SourceRetirementPerson): number | null {
  for (const value of [
    person.retiredYear,
    person.retireddYer,
    person.retirementYear,
    person.retired_year,
  ]) {
    const year = finiteYear(value);
    if (year !== null) return year;
  }
  return null;
}

function meaningfulSeasons(person: SourceRetirementPerson): number[] {
  const played = (person.stats ?? [])
    .filter(row => row.playoffs !== true && isActiveRow(row))
    .map(rowYear)
    .filter((year): year is number => year !== null);
  const assignments = [
    ...(person.transactions ?? []),
    ...(person.assignments ?? []),
    ...(person.career ?? []),
  ]
    .filter(isActiveRow)
    .map(rowYear)
    .filter((year): year is number => year !== null);
  const fallbackRatings = played.length === 0 && assignments.length === 0
    ? (person.ratings ?? []).map(rowYear).filter((year): year is number => year !== null)
    : [];
  const fallbackLastSeason = played.length === 0 && assignments.length === 0 && fallbackRatings.length === 0
    ? [finiteYear(person.lastSeason ?? person.season_max)].filter((year): year is number => year !== null)
    : [];
  return [...new Set([...played, ...assignments, ...fallbackRatings, ...fallbackLastSeason])].sort((a, b) => a - b);
}

function ageAtSeason(person: SourceRetirementPerson, season: number): number | null {
  const bornYear = finiteYear(person.born?.year ?? person.bornYear);
  return bornYear !== null ? season - bornYear : null;
}

export function inferSourceRetirement(
  person: SourceRetirementPerson,
  options: {
    branchCutoffYear: number;
    sourceCoverageThrough: number;
    kind?: 'player' | 'staff';
    confirmThroughSourceCoverage?: boolean;
  },
): SourceRetirementResult | null {
  const kind = options.kind ?? 'player';
  const branchCutoffYear = finiteYear(options.branchCutoffYear);
  const sourceCoverageThrough = finiteYear(options.sourceCoverageThrough);
  if (branchCutoffYear === null || sourceCoverageThrough === null) return null;
  const cutoffEvidenceThrough = Math.min(branchCutoffYear, sourceCoverageThrough);
  const allSeasons = meaningfulSeasons(person);
  const seasons = allSeasons.filter(season => season <= cutoffEvidenceThrough);
  const lastMeaningfulSeason = seasons.at(-1) ?? 0;
  const explicitYear = getExplicitSourceRetiredYear(person);
  if (
    explicitYear !== null
    && explicitYear <= cutoffEvidenceThrough
    && (lastMeaningfulSeason === 0 || lastMeaningfulSeason <= explicitYear)
  ) {
    return {
      retiredYear: explicitYear,
      confidence: 1,
      evidence: 'explicit',
      lastMeaningfulSeason: lastMeaningfulSeason || explicitYear,
      evidenceThrough: cutoffEvidenceThrough,
      inactivityBufferYears: 0,
    };
  }
  if (lastMeaningfulSeason <= 0 || lastMeaningfulSeason > cutoffEvidenceThrough) return null;
  if (
    options.confirmThroughSourceCoverage
    && allSeasons.some(season => season > branchCutoffYear)
  ) {
    return null;
  }
  const evidenceThrough = options.confirmThroughSourceCoverage
    ? sourceCoverageThrough
    : cutoffEvidenceThrough;
  const activeAtCutoff = Number(person.tid) >= 0
    && !/retired/i.test(String(person.status ?? ''))
    && lastMeaningfulSeason >= cutoffEvidenceThrough;
  if (activeAtCutoff) return null;
  const age = ageAtSeason(person, lastMeaningfulSeason);
  const minimumAge = kind === 'staff' ? 55 : 34;
  if (age !== null && age < minimumAge) return null;
  const buffer = kind === 'staff'
    ? STAFF_RETIREMENT_INACTIVITY_BUFFER_YEARS
    : PLAYER_RETIREMENT_INACTIVITY_BUFFER_YEARS;
  const inactiveYears = evidenceThrough - lastMeaningfulSeason;
  if (inactiveYears < buffer) return null;
  const ageScore = age === null ? 0 : Math.min(0.1, Math.max(0, age - minimumAge) * 0.01 + 0.08);
  const gapScore = Math.min(0.08, Math.max(0, inactiveYears - buffer) * 0.01);
  const statusScore = /retired/i.test(String(person.status ?? '')) || Number(person.tid) === -3 ? 0.04 : 0;
  const confidence = Math.min(0.99, 0.78 + ageScore + gapScore + statusScore);
  if (confidence < SOURCE_RETIREMENT_CONFIDENCE_THRESHOLD) return null;
  return {
    retiredYear: lastMeaningfulSeason,
    confidence,
    evidence: 'inferred',
    lastMeaningfulSeason,
    evidenceThrough,
    inactivityBufferYears: buffer,
  };
}

const coverageCache = new WeakMap<object, number>();

export function getSourceCoverageThrough(source: {
  players?: SourceRetirementPerson[] | null;
  teams?: Array<{ seasons?: SourceSeasonRow[] | null }> | null;
}): number {
  const cached = coverageCache.get(source as object);
  if (cached !== undefined) return cached;
  let through = 0;
  for (const person of source.players ?? []) {
    through = Math.max(
      through,
      finiteYear(person.lastSeason ?? person.season_max) ?? 0,
      getExplicitSourceRetiredYear(person) ?? 0,
    );
    for (const row of [
      ...(person.stats ?? []),
      ...(person.ratings ?? []),
      ...(person.transactions ?? []),
      ...(person.assignments ?? []),
      ...(person.career ?? []),
    ]) {
      through = Math.max(through, rowYear(row) ?? 0);
    }
  }
  for (const team of source.teams ?? []) {
    for (const row of team.seasons ?? []) through = Math.max(through, rowYear(row) ?? 0);
  }
  coverageCache.set(source as object, through);
  return through;
}
