import type { RefereeData } from '../../data/photos/referees';
import type { GameState, StaffData } from '../../types';

const NBA_PATH = '/data/referees/nba-referees-merged.json';
const FICTIONAL_PATH = '/data/referees/fictional/fictional-referee-face-pool.json';
const PBA_PATH = '/data/referees/pba/fictional-pba-referee-database.json';
const MINIMUM_ACTIVE_CREW = 12;

type SourceReferee = {
  id?: string;
  name?: string;
  officialNumber?: number;
  jerseyNumber?: number;
  imageUrl?: string;
  imgUrl?: string;
  relativePath?: string;
  bioUrl?: string;
  brefUrl?: string;
  bioText?: string;
  nationality?: string;
  countryCode?: string;
  birthDate?: string;
  startSeason?: string;
  endSeason?: string;
  isFictional?: boolean;
  ratings?: Record<string, number | null>;
  riggingProfile?: Record<string, unknown>;
  careerSummary?: {
    debutYear?: number;
    finalSeasonStartYear?: number;
    finalSeasonYear?: number;
    retirementYear?: number;
  };
};

type RefereeSourcePayload = {
  referees?: SourceReferee[];
  faces?: SourceReferee[];
};

export interface RefereeRetirementRecord {
  id: string;
  refereeId: string;
  name: string;
  portraitUrl?: string;
  officialNumber?: number;
  league: RefereeData['league'];
  season: number;
  retiredDate: string;
  debutYear: number;
  yearsExperience: number;
  source: RefereeData['source'];
}

export interface RefereeRosterSetup {
  pool: RefereeData[];
  active: RefereeData[];
  yearZeroRetirements: RefereeRetirementRecord[];
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function seasonEndYear(value?: string): number | undefined {
  const years = String(value ?? '').match(/\d{4}/g)?.map(Number) ?? [];
  if (years.length === 0) return undefined;
  if (years.length === 1) return years[0];
  return years.at(-1);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function birthYear(value?: string): number | undefined {
  const year = Number(String(value ?? '').slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : undefined;
}

function projectRetirementYear(row: SourceReferee, debutYear: number, branchYear: number): number {
  const seed = hashSeed(`${row.name}:${debutYear}`);
  const born = birthYear(row.birthDate);
  const ageTarget = born ? born + 62 + (seed % 8) : Number.POSITIVE_INFINITY;
  const serviceTarget = debutYear + 25 + (seed % 9);
  const target = Math.min(ageTarget, serviceTarget);
  return target <= branchYear
    ? branchYear + 1 + (seed % 4)
    : Math.max(branchYear + 1, target);
}

function normalizeRealReferee(
  row: SourceReferee,
  index: number,
  branchYear: number,
  sourceCutoffYear: number,
): RefereeData | null {
  if (!row.name) return null;
  const debutYear = row.careerSummary?.debutYear ?? seasonEndYear(row.startSeason);
  const sourceCareerEndYear = seasonEndYear(row.endSeason);
  const knowledgeYear = Math.min(branchYear, sourceCutoffYear);
  if (!debutYear || debutYear > knowledgeYear) return null;
  const sourceRetirementYear = sourceCareerEndYear && sourceCareerEndYear < knowledgeYear
    ? sourceCareerEndYear + 1
    : undefined;
  const retirementYear = sourceRetirementYear
    ?? projectRetirementYear(row, debutYear, knowledgeYear);
  const brefId = row.brefUrl?.match(/\/([^/]+)\.html/)?.[1];
  return {
    id: `nba:${brefId ?? `${slugify(row.name)}-${debutYear}`}-${index}`,
    name: row.name,
    slug: slugify(row.name),
    photo_url: row.imageUrl ?? row.imgUrl,
    officialNumber: row.officialNumber ?? row.jerseyNumber,
    league: 'NBA',
    nationality: row.nationality,
    countryCode: row.countryCode,
    birthDate: row.birthDate,
    debutYear,
    careerEndYear: retirementYear - 1,
    sourceRetirementYear,
    retirementYear,
    isFictional: false,
    source: 'nba-merged',
    bioUrl: row.bioUrl,
    brefUrl: row.brefUrl,
    bioText: branchYear < sourceCutoffYear
      ? `${row.name} joined the league officiating staff in ${debutYear}. This career record covers service completed through ${branchYear}.`
      : row.bioText,
    ratings: row.ratings,
  };
}

function normalizeFictionalReferee(
  row: SourceReferee,
  index: number,
  league: 'PBA' | 'fictional',
): RefereeData | null {
  if (!row.name) return null;
  const debutYear = row.careerSummary?.debutYear ?? seasonEndYear(row.startSeason);
  const retirementYear = row.careerSummary?.retirementYear
    ?? ((row.careerSummary?.finalSeasonYear ?? row.careerSummary?.finalSeasonStartYear ?? seasonEndYear(row.endSeason) ?? 0) + 1);
  if (!debutYear || !retirementYear) return null;
  const source = league === 'PBA' ? 'fictional-pba-referee-pool' : 'fictional-referee-pool';
  const portraitRoot = league === 'PBA' ? '/data/referees/pba/' : '/data/referees/fictional/';
  const portrait = row.imageUrl ?? row.imgUrl ?? row.relativePath;
  return {
    id: row.id ?? `${source}:${slugify(row.name)}-${index}`,
    name: row.name,
    slug: slugify(row.name),
    photo_url: portrait ? `${portraitRoot}${portrait.replace(/^[/\\]+/, '')}` : undefined,
    officialNumber: row.officialNumber ?? row.jerseyNumber,
    league,
    nationality: row.nationality,
    countryCode: row.countryCode,
    birthDate: row.birthDate,
    debutYear,
    careerEndYear: retirementYear - 1,
    sourceRetirementYear: retirementYear,
    retirementYear,
    isFictional: true,
    source,
    bioText: row.bioText,
    ratings: row.ratings,
    riggingProfile: row.riggingProfile,
  };
}

async function fetchPayload(path: string): Promise<RefereeSourcePayload> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<RefereeSourcePayload>;
}

export function getRefereeMode(state: Pick<GameState, 'leagueType' | 'leagueStats'>): 'NBA' | 'PBA' | 'fictional' {
  if (state.leagueStats?.uiMode === 'pba_isolated') return 'PBA';
  if (state.leagueType === 'fictional') return 'fictional';
  return 'NBA';
}

export function getActiveReferees(
  pool: RefereeData[],
  year: number,
  mode: 'NBA' | 'PBA' | 'fictional',
): RefereeData[] {
  const eligible = pool.filter(referee =>
    Number(referee.debutYear ?? 0) <= year
    && Number(referee.retirementYear ?? Number.POSITIVE_INFINITY) > year
  );
  if (mode !== 'NBA') return eligible.filter(referee => referee.league === mode);
  const real = eligible.filter(referee => referee.league === 'NBA');
  if (real.length >= MINIMUM_ACTIVE_CREW) return real;
  const fictional = eligible.filter(referee => referee.source === 'fictional-referee-pool');
  return [...real, ...fictional.slice(0, Math.max(0, MINIMUM_ACTIVE_CREW - real.length))];
}

function retirementRecord(referee: RefereeData, season: number): RefereeRetirementRecord {
  const debutYear = referee.debutYear ?? season;
  return {
    id: `referee-retirement:${referee.id}:${season}`,
    refereeId: referee.id,
    name: referee.name,
    portraitUrl: referee.photo_url,
    officialNumber: referee.officialNumber,
    league: referee.league,
    season,
    retiredDate: `${season}-07-03`,
    debutYear,
    yearsExperience: Math.max(0, season - debutYear + 1),
    source: referee.source,
  };
}

export async function loadRefereeRoster(
  state: Pick<GameState, 'leagueType' | 'leagueStats'>,
): Promise<RefereeRosterSetup> {
  const year = state.leagueStats?.year ?? new Date().getFullYear();
  const mode = getRefereeMode(state);
  const [primary, fallback] = await Promise.all([
    fetchPayload(mode === 'PBA' ? PBA_PATH : mode === 'fictional' ? FICTIONAL_PATH : NBA_PATH),
    mode === 'NBA' ? fetchPayload(FICTIONAL_PATH) : Promise.resolve(undefined),
  ]);
  const primaryRows = primary.referees ?? primary.faces ?? [];
  const observedCutoffYear = Math.max(...primaryRows.map(row => seasonEndYear(row.endSeason) ?? 0));
  const sourceCutoffYear = observedCutoffYear > 0 ? observedCutoffYear : year;
  const primaryPool = mode === 'NBA'
    ? primaryRows.map((row, index) => normalizeRealReferee(row, index, year, sourceCutoffYear)).filter((row): row is RefereeData => !!row)
    : primaryRows.map((row, index) => normalizeFictionalReferee(row, index, mode)).filter((row): row is RefereeData => !!row);
  const fallbackPool = (fallback?.faces ?? [])
    .map((row, index) => normalizeFictionalReferee(row, index, 'fictional'))
    .filter((row): row is RefereeData => !!row);
  const pool = [...primaryPool, ...fallbackPool];
  const active = getActiveReferees(pool, year, mode);
  const yearZeroRetirements = pool
    .filter(referee =>
      referee.sourceRetirementYear === year
      && (mode === 'NBA' ? referee.league === 'NBA' : referee.league === mode)
    )
    .map(referee => retirementRecord(referee, year - 1));
  return { pool, active, yearZeroRetirements };
}

export function runRefereeRollover(params: {
  state: Pick<GameState, 'leagueType' | 'leagueStats' | 'staff' | 'refereePool' | 'refereeRetirementAnnouncements'>;
  currentYear: number;
  nextYear: number;
  staff?: StaffData | null;
}): {
  staff: StaffData | null;
  announcements: RefereeRetirementRecord[];
  active: RefereeData[];
} {
  const pool = params.state.refereePool ?? [];
  const mode = getRefereeMode(params.state);
  const previousActive = params.state.staff?.referees ?? getActiveReferees(pool, params.currentYear, mode);
  const active = getActiveReferees(pool, params.nextYear, mode);
  const activeIds = new Set(active.map(referee => referee.id));
  const newRecords = previousActive
    .filter(referee => !activeIds.has(referee.id) && Number(referee.retirementYear ?? Number.POSITIVE_INFINITY) <= params.nextYear)
    .map(referee => retirementRecord(referee, params.currentYear));
  const announcements = [...newRecords, ...(params.state.refereeRetirementAnnouncements ?? [])]
    .filter((record, index, rows) => rows.findIndex(candidate => candidate.id === record.id) === index);
  const staffBase = params.staff === undefined ? params.state.staff : params.staff;
  const staff = staffBase
    ? { ...staffBase, referees: active }
    : null;
  return { staff, announcements, active };
}
