import type { NBAGMStat, NBAPlayer, NonNBATeam } from '../../types';
import { INITIAL_LEAGUE_STATS, PBA_ISOLATED_DEFAULTS } from '../../constants';
import { getPbaTeamPopulationOverride } from '../../data/templates/philippines/teamPopulations';
import { getLastAttendedSchool } from '../../utils/educationUtils';
import { mergePlayerCareer } from '../../utils/playerCareerMerge';
import { estimatePotentialBbgm } from '../../utils/playerRatings';
import { getPlayerNationalityCountries } from '../../utils/playerNationality';
import { isLowQualityPlayerPortrait } from '../../utils/playerImage';
import { PBA_STANDARD_ROSTER_LIMIT } from '../../utils/rosterLimits';
import { attachHistoricalPbaStaffToTeam } from './staffSources';
import { LEAGUE_MULTIPLIERS } from '../logic/leagueOvr';
import {
  computeLeagueOvr,
  extractJerseyNumber,
  getPBARosterEconomyConfig,
  resolveImgURL,
  scaleRatings,
  type PBAEconomyConfig,
} from '../externalRosterService.shared';
import { getPbaRosterPortrait } from './portraits';
import { getPhilippineCollegeLabel } from './collegeIdentity';
import {
  PBA_HISTORICAL_CATALOG,
} from './historicalCatalog';
import {
  getActivePbaSeasonTeamEntries,
  getPbaSeasonDataStatus,
  isPlayablePbaSeason,
  resolvePbaPlayerRawTid,
} from './historyConfig';
import { loadHistoricalPbaSource } from './historicalLoader';
import type {
  HistoricalPbaPlayerSourceMeta,
  PbaMasterSource,
  PbaSourcePlayer,
  PbaSourceRating,
  PbaSourceStat,
  PbaSourceTeam,
  PbaSourceTeamSeason,
  HistoricalPbaTeamIdentitySnapshot,
} from './historicalTypes';
import { attachHistoricalPbaTeamIdentityTimeline } from './historicalTypes';
import { loadHistoricalPbaRemoteSources, type HistoricalPbaRemoteSources } from './historicalRemoteSources';
import {
  applyHistoricalPbaRemoteSnapshot,
  buildHistoricalPbaTeamIdentityTimeline,
  normalizeHistoricalPbaLogoUrl,
} from './historicalSourceAdapters';
import {
  getCanonicalHistoricalPbaTid,
  getCanonicalPbaRawTid,
} from './franchiseTimeline';
import { prepareHistoricalPbaImportPool } from './historicalImportPool';
import {
  getCanonicalPbaPlayerName,
  hasCanonicalPbaPlayerIdentity,
  normalizePbaDraftPlayerName,
} from './pbaDraftArchive';
import { getPbaDraftYearForSeasonYear } from './draftCalendar';
import {
  getSourceCoverageThrough,
  inferSourceRetirement,
  PLAYER_RETIREMENT_INACTIVITY_BUFFER_YEARS,
  type SourceRetirementResult,
} from '../retirement/sourceRetirement';

export interface HistoricalPbaRosterResult {
  players: NBAPlayer[];
  teams: NonNBATeam[];
  source: PbaMasterSource;
  sourceSeason: number;
  sourceVersion: string;
  staffFreeAgents: import('../../types').StaffMember[];
  staffRetirementAnnouncements: import('../staff/staffRetirement').StaffRetirementRecord[];
  coachSourceVersion?: string;
  teamHistorySourceVersion?: string;
  teamIdentityTimeline: HistoricalPbaTeamIdentitySnapshot[];
}

const CONFIRMED_PBA_IMPORT_SOURCE_PIDS = new Set([
  260438,
  260440,
  260442,
  260445,
  260471,
  260479,
  260481,
  260826,
  260854,
  260869,
  260729,
]);

const finiteSeason = (value: unknown): number | null => {
  const season = Number(value);
  return Number.isInteger(season) && season >= 1900 && season <= 2100 ? season : null;
};

export const cleanHistoricalPbaPlayerName = (value: string): string => (
  getCanonicalPbaPlayerName(value.replace(/\s*\(Import\)\s*$/i, '').replace(/\s+/g, ' ').trim())
);

export function historicalPbaIdentityKey(player: PbaSourcePlayer): string {
  const rawName = String(player.name ?? `${player.firstName ?? ''} ${player.lastName ?? ''}`);
  const name = cleanHistoricalPbaPlayerName(rawName);
  if (hasCanonicalPbaPlayerIdentity(name)) {
    return `alias:${normalizePbaDraftPlayerName(name)}|${player.born?.year ?? ''}`;
  }
  if (Number.isInteger(player.pid)) return `pid:${player.pid}`;
  const fallbackName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${fallbackName}|${player.born?.year ?? ''}`;
}

export function isHistoricalPbaImport(player: PbaSourcePlayer): boolean {
  return player.pbaImport === true
    || CONFIRMED_PBA_IMPORT_SOURCE_PIDS.has(Number(player.pid))
    || /\(Import\)\s*$/i.test(String(player.name ?? ''));
}

export function getHistoricalPbaFirstEligibleSeason(player: PbaSourcePlayer): number | null {
  const seasons = [
    ...(player.ratings ?? []).map(row => finiteSeason(row.season)),
    ...(player.stats ?? []).map(row => finiteSeason(row.season)),
  ].filter((season): season is number => season !== null);
  return seasons.length > 0 ? Math.min(...seasons) : null;
}

export function hasHistoricalPbaBiographyChronologyConflict(player: PbaSourcePlayer): boolean {
  const birthYear = Number(player.born?.year);
  const firstEligibleSeason = getHistoricalPbaFirstEligibleSeason(player);
  return Number.isInteger(birthYear)
    && birthYear > 0
    && firstEligibleSeason !== null
    && firstEligibleSeason < birthYear + 15;
}

function activeRating(player: PbaSourcePlayer, sourceSeason: number): PbaSourceRating | null {
  return [...(player.ratings ?? [])]
    .filter(row => (finiteSeason(row.season) ?? Number.MAX_SAFE_INTEGER) <= sourceSeason)
    .sort((left, right) => right.season - left.season)[0] ?? null;
}

const regularStats = (player: PbaSourcePlayer): PbaSourceStat[] => (
  (player.stats ?? []).filter(row => row.playoffs !== true && finiteSeason(row.season) !== null)
);

function bestStat(rows: PbaSourceStat[]): PbaSourceStat | null {
  return [...rows].sort((left, right) => (
    Number(right.gp ?? 0) - Number(left.gp ?? 0)
    || Number(right.min ?? 0) - Number(left.min ?? 0)
    || Number(right.gs ?? 0) - Number(left.gs ?? 0)
    || left.tid - right.tid
  ))[0] ?? null;
}

function sourceRosterStat(player: PbaSourcePlayer, sourceSeason: number): PbaSourceStat | null {
  const exact = bestStat(regularStats(player).filter(row => row.season === sourceSeason));
  return exact;
}

function sourceTeamForPlayer(
  player: PbaSourcePlayer,
  sourceSeason: number,
  source: PbaMasterSource,
): number | null {
  return resolvePbaPlayerRawTid(player, sourceSeason, source);
}

function inferHistoricalPbaRetirement(
  player: PbaSourcePlayer,
  sourceSeason: number,
  source: PbaMasterSource,
): SourceRetirementResult | null {
  const shared = inferSourceRetirement(player, {
    branchCutoffYear: sourceSeason - 1,
    sourceCoverageThrough: getSourceCoverageThrough(source),
    confirmThroughSourceCoverage: true,
  });
  if (shared) {
    const birthYear = Number(player.born?.year);
    const retirementAge = Number.isInteger(birthYear) ? shared.retiredYear - birthYear : null;
    const sourceCallsBasketballRetirement = /retired/i.test(String(player.status ?? ''));
    if (
      shared.evidence === 'explicit'
      && retirementAge !== null
      && retirementAge < 34
      && !sourceCallsBasketballRetirement
      && isHistoricalPbaImport(player)
    ) return null;
    return shared;
  }
  if (Number(player.tid) !== -3 && !/retired/i.test(String(player.status ?? ''))) return null;

  const playedSeasons = regularStats(player)
    .filter(row => row.gp == null || Number(row.gp) > 0)
    .map(row => finiteSeason(row.season))
    .filter((season): season is number => season !== null && season < sourceSeason);
  const evidenceSeasons = playedSeasons.length > 0
    ? playedSeasons
    : (player.ratings ?? [])
        .map(row => finiteSeason(row.season))
        .filter((season): season is number => season !== null && season < sourceSeason);
  const lastMeaningfulSeason = evidenceSeasons.sort((left, right) => left - right).at(-1);
  const evidenceThrough = sourceSeason - 1;
  if (
    lastMeaningfulSeason === undefined
    || evidenceThrough - lastMeaningfulSeason < PLAYER_RETIREMENT_INACTIVITY_BUFFER_YEARS
  ) return null;

  return {
    retiredYear: lastMeaningfulSeason,
    confidence: 0.9,
    evidence: 'inferred',
    lastMeaningfulSeason,
    evidenceThrough,
    inactivityBufferYears: PLAYER_RETIREMENT_INACTIVITY_BUFFER_YEARS,
  };
}

export function selectHistoricalPbaActiveRosterIdentityKeys(
  source: PbaMasterSource,
  sourceSeason: number,
  rosterLimit = PBA_STANDARD_ROSTER_LIMIT,
): Set<string> {
  const activeRawTids = new Set(getActivePbaSeasonTeamEntries(source, sourceSeason).map(entry => entry.team.tid));
  const participants = new Map<number, Array<{ key: string; stat: PbaSourceStat | null }>>();
  for (const player of source.players) {
    if (isHistoricalPbaImport(player)) continue;
    if (!(player.ratings ?? []).some(row => Number(row.season) === sourceSeason)) continue;
    const rawTid = sourceTeamForPlayer(player, sourceSeason, source);
    if (rawTid === null || !activeRawTids.has(rawTid)) continue;
    const canonicalRawTid = getCanonicalPbaRawTid(rawTid);
    const rows = participants.get(canonicalRawTid) ?? [];
    rows.push({ key: historicalPbaIdentityKey(player), stat: sourceRosterStat(player, sourceSeason) });
    participants.set(canonicalRawTid, rows);
  }
  return new Set([...participants.values()].flatMap(rows => rows
    .sort((left, right) => (
      Number(right.stat?.gp ?? 0) - Number(left.stat?.gp ?? 0)
      || Number(right.stat?.min ?? 0) - Number(left.stat?.min ?? 0)
      || Number(right.stat?.gs ?? 0) - Number(left.stat?.gs ?? 0)
      || left.key.localeCompare(right.key)
    ))
    .slice(0, rosterLimit)
    .map(row => row.key)));
}

const pct = (made: number, attempted: number): number => attempted > 0 ? (made / attempted) * 100 : 0;

function mapStat(stat: PbaSourceStat, resolvedRawTid?: number | null, source?: PbaMasterSource): NBAGMStat {
  const rawTid = resolvedRawTid ?? stat.tid;
  const sourceTeam = rawTid >= 0
    ? source?.teams.find(team => team.tid === rawTid && (team.seasons ?? []).some(row => row.season === stat.season))
      ?? source?.teams.find(team => team.tid === rawTid)
    : undefined;
  const sourceTeamSeason = sourceTeam?.seasons?.find(row => row.season === stat.season);
  const mapped: Record<string, unknown> = {
    ...stat,
    season: stat.season,
    tid: stat.tid >= 0 ? getCanonicalHistoricalPbaTid(rawTid) : stat.tid,
    playoffs: stat.playoffs === true,
    competitionId: 'pba',
    historicalPbaSourceStat: true,
    jerseyNumber: stat.jerseyNumber,
    abbrev: sourceTeamSeason?.abbrev ?? sourceTeam?.abbrev,
  };
  const numericFields = [
    'gp', 'gs', 'min', 'fg', 'fga', 'tp', 'tpa', 'ft', 'fta', 'orb', 'drb',
    'ast', 'stl', 'blk', 'tov', 'pf', 'pts', 'per', 'ewa', 'ortg', 'drtg',
    'obpm', 'dbpm', 'vorp',
  ];
  for (const field of numericFields) {
    if (stat[field] !== undefined && Number.isFinite(Number(stat[field]))) mapped[field] = Number(stat[field]);
  }
  if (stat.fg !== undefined && stat.fga !== undefined) mapped.fgp = pct(Number(stat.fg), Number(stat.fga));
  if (stat.tp !== undefined && stat.tpa !== undefined) mapped.tpp = pct(Number(stat.tp), Number(stat.tpa));
  if (stat.ft !== undefined && stat.fta !== undefined) mapped.ftp = pct(Number(stat.ft), Number(stat.fta));
  if (stat.orb !== undefined && stat.drb !== undefined) mapped.trb = Number(stat.orb) + Number(stat.drb);
  return mapped as unknown as NBAGMStat;
}

function sourceMeta(
  player: PbaSourcePlayer,
  sourceSeason: number,
  source: PbaMasterSource,
): HistoricalPbaPlayerSourceMeta | null {
  const firstEligibleSeason = getHistoricalPbaFirstEligibleSeason(player);
  if (firstEligibleSeason === null || firstEligibleSeason > sourceSeason) return null;
  const importTagged = isHistoricalPbaImport(player);
  const rawTid = importTagged ? null : sourceTeamForPlayer(player, sourceSeason, source);
  const dataStatus = getPbaSeasonDataStatus(sourceSeason);
  const importSourceSeasons = importTagged
    ? [...new Set([
        ...(player.ratings ?? []).map(row => finiteSeason(row.pbaImportSourceSeason)),
        ...(player.stats ?? []).map(row => finiteSeason(row.season)),
      ].filter((season): season is number => season !== null))].sort((left, right) => left - right)
    : undefined;
  return {
    identityKey: historicalPbaIdentityKey(player),
    sourcePid: player.pid,
    firstEligibleSeason,
    sourceSeason,
    sourceTeamTid: rawTid === null ? undefined : getCanonicalHistoricalPbaTid(rawTid),
    importTagged,
    importSource: player.pbaImportSource ?? (importTagged ? 'confirmed-source-correction' : undefined),
    importEvidence: Array.isArray(player.pbaImportEvidence)
      ? player.pbaImportEvidence.join(', ')
      : player.pbaImportEvidence ?? (CONFIRMED_PBA_IMPORT_SOURCE_PIDS.has(Number(player.pid)) ? 'historical-import-roster' : undefined),
    importConfidence: player.pbaImportConfidence ?? (CONFIRMED_PBA_IMPORT_SOURCE_PIDS.has(Number(player.pid)) ? 'confirmed' : undefined),
    importSourceSeasons,
    biographyChronologyRejected: hasHistoricalPbaBiographyChronologyConflict(player) || undefined,
    dataStatus,
    rosterOnly: dataStatus === 'ROSTER_ONLY' || undefined,
    pointsOnly: dataStatus === 'POINTS_ONLY' || undefined,
    rosterSupported: dataStatus === 'ROSTER_SUPPORTED' || undefined,
  };
}

export function mapHistoricalPbaPlayer(
  player: PbaSourcePlayer,
  sourceSeason: number,
  economy: PBAEconomyConfig,
  source: PbaMasterSource,
): NBAPlayer | null {
  const meta = sourceMeta(player, sourceSeason, source);
  const rating = activeRating(player, sourceSeason);
  if (!meta || !rating) return null;
  const rawName = String(player.name ?? `${player.firstName ?? ''} ${player.lastName ?? ''}`);
  const name = cleanHistoricalPbaPlayerName(rawName);
  if (!name) return null;
  const sourceRatings = (player.ratings ?? []).filter(row => row.season <= sourceSeason);
  const rawRatings = sourceRatings.length > 0 ? sourceRatings : [rating];
  const rawBirthYear = Number(player.born?.year);
  const rejectBiography = meta.biographyChronologyRejected === true;
  const birthYear = !rejectBiography && Number.isInteger(rawBirthYear) && rawBirthYear >= 1900 && rawBirthYear <= sourceSeason - 15
    ? rawBirthYear
    : undefined;
  const ratings = scaleRatings(
    rawRatings,
    LEAGUE_MULTIPLIERS.PBA,
    0.85,
  ).map((scaled, index) => {
    const raw = rawRatings[index] ?? rating;
    const rowOvr = computeLeagueOvr(raw, 'PBA');
    const rawPot = Number(raw.pot);
    const rowAge = birthYear ? Math.max(15, Number(raw.season) - birthYear) : 25;
    const rowPot = Number.isFinite(rawPot) && rawPot > 0
      ? Math.max(rowOvr, Math.round(rawPot * LEAGUE_MULTIPLIERS.PBA))
      : estimatePotentialBbgm(rowOvr, rowAge, Math.round(40 * LEAGUE_MULTIPLIERS.PBA));
    return {
      ...scaled,
      tid: raw.tid,
      ovr: rowOvr,
      pot: rowPot,
      pbaCanonicalLeagueRating: true,
    };
  });
  const activeCanonicalRating = ratings.find(row =>
    Number(row.season) === Number(rating.season)
    && Number(row.tid ?? -1) === Number(rating.tid ?? -1)
  ) ?? ratings.at(-1);
  const overallRating = Number(activeCanonicalRating?.ovr ?? computeLeagueOvr(rating, 'PBA'));
  const ageForRatings = birthYear ? sourceSeason - birthYear : 25;
  const nationality = (
    (rejectBiography ? [] : getPlayerNationalityCountries(player, meta.importTagged ? undefined : 'Philippines')).join(' / ')
    || (meta.importTagged ? undefined : 'Philippines')
  );
  const height = Number(player.hgt);
  const weight = Number(player.weight);
  const stats = (player.stats ?? [])
    .filter(row => row.season < sourceSeason)
    .map(row => mapStat(
      row,
      resolvePbaPlayerRawTid({ ...player, stats: [row] }, row.season, source),
      source,
    ));
  const awards = (player.awards ?? [])
    .filter(award => Number(award.season) < sourceSeason && !!award.type)
    .map(award => ({
      season: Number(award.season),
      type: String(award.type),
      competitionId: 'pba',
      uiMode: 'pba_isolated',
      source: 'historical-pba',
    }));
  const hasExactSeasonRosterEvidence = meta.sourceTeamTid !== undefined
    && (player.ratings ?? []).some(row => Number(row.season) === sourceSeason);
  const sourceRetirement = inferHistoricalPbaRetirement(player, sourceSeason, source);
  const retired = !!sourceRetirement && !hasExactSeasonRosterEvidence;
  const lastAttendedCollege = rejectBiography ? undefined : getLastAttendedSchool(player.college);
  const sourcePortrait = rejectBiography ? undefined : resolveImgURL(player.imgURL);
  const rosterPortrait = rejectBiography ? undefined : getPbaRosterPortrait(name, sourceSeason);
  const portrait = [rosterPortrait, sourcePortrait].find(candidate => candidate && !isLowQualityPlayerPortrait(candidate))
    ?? sourcePortrait
    ?? rosterPortrait;
  const base: NBAPlayer = {
    internalId: `pba-history:${meta.identityKey}`,
    tid: retired ? -3 : -1,
    name,
    overallRating,
    potential: Number(activeCanonicalRating?.pot ?? estimatePotentialBbgm(
      overallRating,
      ageForRatings,
      Math.round(40 * LEAGUE_MULTIPLIERS.PBA),
    )),
    ratings,
    stats,
    imgURL: portrait,
    pos: player.pos ?? 'GF',
    age: birthYear ? sourceSeason - birthYear : undefined,
    hgt: !rejectBiography && Number.isFinite(height) && height >= 48 && height <= 100 ? height : undefined,
    weight: !rejectBiography && Number.isFinite(weight) && weight >= 80 && weight <= 500 ? weight : undefined,
    born: birthYear ? { year: birthYear, loc: player.born?.loc ?? nationality ?? '' } : undefined,
    nationality,
    draft: player.draft?.year ? {
      year: getPbaDraftYearForSeasonYear(player.draft.year),
      tid: Number.isInteger(player.draft.tid) && Number(player.draft.tid) >= 0
        ? getCanonicalHistoricalPbaTid(Number(player.draft.tid))
        : -1,
      round: player.draft.round,
      pick: player.draft.pick,
      originalTid: Number.isInteger(player.draft.originalTid) && Number(player.draft.originalTid) >= 0
        ? getCanonicalHistoricalPbaTid(Number(player.draft.originalTid))
        : -1,
    } : undefined,
    college: getPhilippineCollegeLabel(lastAttendedCollege) ?? lastAttendedCollege ?? undefined,
    injury: retired ? { type: 'Healthy', gamesRemaining: 0 } : {
      type: player.injury?.type ?? 'Healthy',
      gamesRemaining: Number(player.injury?.gamesRemaining ?? 0),
    },
    status: retired ? 'Retired' : 'Free Agent',
    retiredYear: retired ? sourceRetirement?.retiredYear : undefined,
    sourceRetirement: retired ? sourceRetirement ?? undefined : undefined,
    hof: false,
    awards,
    jerseyNumber: extractJerseyNumber({ stats }),
    pbaLocalEligible: !meta.importTagged,
    isImport: meta.importTagged || undefined,
    historicalPbaSource: meta,
  };
  if (retired || meta.importTagged || meta.sourceTeamTid === undefined) return base;
  const sourceContract = sourceSeason === Number(source.startingSeason) && player.contract
    ? {
        ...player.contract,
        amount: Number(player.contract.amount),
        exp: Number(player.contract.exp),
      }
    : undefined;
  return {
    ...base,
    tid: meta.sourceTeamTid,
    status: 'PBA',
    contract: sourceContract,
  } as NBAPlayer;
}

function mergedTeamSeasons(source: PbaMasterSource, canonicalRawTid: number, cutoffSeason: number): NonNullable<NonNBATeam['seasons']> {
  const rows = source.teams
    .flatMap(team => (team.seasons ?? [])
      .filter(row => getCanonicalPbaRawTid(team.tid) === canonicalRawTid))
    .filter(row => row.season <= cutoffSeason)
    .sort((left, right) => left.season - right.season);
  const bySeason = new Map<number, PbaSourceTeamSeason>();
  for (const row of rows) bySeason.set(row.season, row);
  return [...bySeason.values()].map(row => {
    const mapped: Record<string, unknown> = { ...row, season: row.season };
    if (row.won !== undefined) {
      mapped.won = Number(row.won);
      mapped.wins = Number(row.won);
    }
    if (row.lost !== undefined) {
      mapped.lost = Number(row.lost);
      mapped.losses = Number(row.lost);
    }
    if (row.playoffRoundsWon !== undefined) mapped.playoffRoundsWon = Number(row.playoffRoundsWon);
    return mapped;
  }) as NonNullable<NonNBATeam['seasons']>;
}

function materializeHistoricalPbaTeam(
  source: PbaMasterSource,
  sourceTeam: PbaSourceTeam,
  currentSeason: PbaSourceTeamSeason,
  sourceSeason: number,
  carryIdentityOnly = false,
): NonNBATeam {
  const rawTid = sourceTeam.tid;
  const canonicalRawTid = getCanonicalPbaRawTid(rawTid);
  const historicalName = String(currentSeason.pbaTeamName ?? '').trim();
  const region = String(currentSeason.region ?? (historicalName || sourceTeam.region) ?? '').trim();
  const name = String(currentSeason.name ?? (currentSeason.region || historicalName ? '' : sourceTeam.name ?? '')).trim();
  return attachHistoricalPbaStaffToTeam({
    tid: getCanonicalHistoricalPbaTid(rawTid),
    cid: 0,
    did: 0,
    region,
    name,
    abbrev: String(currentSeason.abbrev ?? sourceTeam.abbrev ?? `PBA${rawTid}`),
    pop: getPbaTeamPopulationOverride(region, name) ?? currentSeason.pop ?? sourceTeam.pop ?? 1,
    stadiumCapacity: currentSeason.stadiumCapacity ?? sourceTeam.stadiumCapacity ?? 10_000,
    imgURL: normalizeHistoricalPbaLogoUrl(currentSeason.imgURLSmall)
      ?? normalizeHistoricalPbaLogoUrl(currentSeason.imgURL)
      ?? normalizeHistoricalPbaLogoUrl(sourceTeam.imgURLSmall)
      ?? normalizeHistoricalPbaLogoUrl(sourceTeam.imgURL),
    colors: currentSeason.colors ?? sourceTeam.colors,
    league: 'PBA' as const,
    seasons: mergedTeamSeasons(source, canonicalRawTid, sourceSeason),
    wins: carryIdentityOnly ? 0 : currentSeason.won,
    losses: carryIdentityOnly ? 0 : currentSeason.lost,
    won: carryIdentityOnly ? 0 : currentSeason.won,
    lost: carryIdentityOnly ? 0 : currentSeason.lost,
  }, sourceSeason);
}

export function buildHistoricalPbaSeasonTeamsFromSource(
  source: PbaMasterSource,
  sourceSeason: number,
): NonNBATeam[] {
  const teamsByTid = new Map<number, NonNBATeam>();
  for (const { team: sourceTeam, row: currentSeason } of getActivePbaSeasonTeamEntries(source, sourceSeason)) {
    const team = materializeHistoricalPbaTeam(source, sourceTeam, currentSeason, sourceSeason);
    teamsByTid.set(team.tid, team);
  }

  const lineageRows = new Map<number, Array<{ team: PbaSourceTeam; row: PbaSourceTeamSeason }>>();
  for (const team of source.teams) {
    const canonicalRawTid = getCanonicalPbaRawTid(team.tid);
    if (canonicalRawTid === 24 || teamsByTid.has(getCanonicalHistoricalPbaTid(canonicalRawTid))) continue;
    const rows = lineageRows.get(canonicalRawTid) ?? [];
    for (const row of team.seasons ?? []) {
      if (Number.isInteger(Number(row.season))) rows.push({ team, row });
    }
    lineageRows.set(canonicalRawTid, rows);
  }
  for (const rows of lineageRows.values()) {
    const prior = rows
      .filter(entry => Number(entry.row.season) === sourceSeason - 1)
      .sort((left, right) => right.team.tid - left.team.tid)[0];
    const resumesNextSeason = rows.some(entry => Number(entry.row.season) === sourceSeason + 1);
    if (!prior || !resumesNextSeason) continue;
    const team = materializeHistoricalPbaTeam(source, prior.team, prior.row, sourceSeason, true);
    teamsByTid.set(team.tid, team);
  }
  return [...teamsByTid.values()].sort((left, right) => left.tid - right.tid);
}

export function buildHistoricalPbaRosterFromSource(
  source: PbaMasterSource,
  sourceSeason: number,
  economy: PBAEconomyConfig = getPBARosterEconomyConfig({
    ...INITIAL_LEAGUE_STATS,
    ...PBA_ISOLATED_DEFAULTS,
  }, 'pba_isolated'),
  remoteSources?: HistoricalPbaRemoteSources,
): HistoricalPbaRosterResult {
  if (!isPlayablePbaSeason(sourceSeason, source)) {
    throw new Error(`PBA season key ${sourceSeason} is not playable in the loaded historical source.`);
  }
  const baseTeams = buildHistoricalPbaSeasonTeamsFromSource(source, sourceSeason);
  const remoteSnapshot = remoteSources
    ? applyHistoricalPbaRemoteSnapshot(baseTeams, source.teams, sourceSeason, remoteSources)
    : { teams: baseTeams, staffFreeAgents: [], retirementAnnouncements: [] };
  const teamIdentityTimeline = buildHistoricalPbaTeamIdentityTimeline(source, remoteSources);
  const teams = attachHistoricalPbaTeamIdentityTimeline(remoteSnapshot.teams, {
    version: 1,
    sourceVersion: PBA_HISTORICAL_CATALOG.sourceVersion,
    startYear: sourceSeason,
    sourceSeason,
    materializedSeasons: [sourceSeason],
    materializedIdentityKeys: [],
    materializedNbaMarketSeasons: [],
    teamIdentityTimeline,
  });
  const activeTeamIds = new Set(teams.map(team => team.tid));
  const activeRosterKeys = selectHistoricalPbaActiveRosterIdentityKeys(source, sourceSeason);
  const rawMappedPlayers = source.players
    .map(raw => {
      const player = mapHistoricalPbaPlayer(raw, sourceSeason, economy, source);
      const key = player?.historicalPbaSource?.identityKey;
      if (!player || player.status === 'Retired' || player.historicalPbaSource?.importTagged) return player;
      if (key && activeRosterKeys.has(key) && activeTeamIds.has(player.tid)) return player;
      return { ...player, tid: -1, status: 'Free Agent' as const, contract: undefined };
    })
    .filter((player): player is NBAPlayer => player !== null);
  const mappedByIdentity = new Map<string, NBAPlayer>();
  for (const player of rawMappedPlayers) {
    const key = player.historicalPbaSource?.identityKey ?? player.internalId;
    const existing = mappedByIdentity.get(key);
    if (!existing) {
      mappedByIdentity.set(key, player);
      continue;
    }
    const priority = (candidate: NBAPlayer) => (
      (candidate.status === 'PBA' ? 1_000_000 : candidate.status === 'Free Agent' ? 100_000 : 0)
      + (candidate.stats ?? []).reduce((sum, row) => sum + Number(row.gp ?? 0), 0)
      + (candidate.ratings?.length ?? 0)
    );
    const primary = priority(player) > priority(existing) ? player : existing;
    const history = primary === player ? existing : player;
    mappedByIdentity.set(key, mergePlayerCareer(primary, history) as NBAPlayer);
  }
  const mappedPlayers = [...mappedByIdentity.values()];
  const players = prepareHistoricalPbaImportPool(mappedPlayers, mappedPlayers, sourceSeason);
  return {
    players,
    teams,
    source,
    sourceSeason,
    sourceVersion: PBA_HISTORICAL_CATALOG.sourceVersion,
    staffFreeAgents: remoteSnapshot.staffFreeAgents,
    staffRetirementAnnouncements: remoteSnapshot.retirementAnnouncements,
    coachSourceVersion: remoteSources?.coachSourceVersion,
    teamHistorySourceVersion: remoteSources?.teamHistorySourceVersion,
    teamIdentityTimeline,
  };
}

export async function buildHistoricalPbaRoster(startYear: number): Promise<HistoricalPbaRosterResult> {
  const source = await loadHistoricalPbaSource();
  const remoteSources = await loadHistoricalPbaRemoteSources().catch(error => {
    console.warn('[PBA HISTORY] Optional coach and logo enrichment is unavailable.', error);
    return undefined;
  });
  return buildHistoricalPbaRosterFromSource(source, startYear, undefined, remoteSources);
}
