import type { LeagueStats, NBAConf, NBADiv } from '../../types';

type RawRecord = Record<string, unknown>;

export interface BbgmImportEnvelope {
  schemaVersion?: number | string;
  sourceMeta?: unknown;
  sourceGameAttributes: unknown;
  resolvedGameAttributes: RawRecord;
  unsupportedGameAttributes: RawRecord;
  importedAtSeason: number;
}

const asRecord = (value: unknown): RawRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as RawRecord : {}
);

export const normalizeBbgmGameAttributes = (value: unknown): RawRecord => {
  if (!Array.isArray(value)) return asRecord(value);
  return Object.fromEntries(value.flatMap(entry => {
    const row = asRecord(entry);
    return typeof row.key === 'string' && row.key ? [[row.key, row.value]] : [];
  }));
};

export const resolveBbgmHistoryValue = (value: unknown, season: number): unknown => {
  if (!Array.isArray(value) || !value.some(entry => 'value' in asRecord(entry))) return value;
  return value
    .map(asRecord)
    .filter(entry => 'value' in entry)
    .filter(entry => entry.start == null || Number(entry.start) <= season)
    .sort((left, right) => Number(left.start ?? -Infinity) - Number(right.start ?? -Infinity))
    .at(-1)?.value;
};

const optionalNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const optionalBoolean = (value: unknown): boolean | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return Boolean(value);
};

const optionalNumberList = (value: unknown): number[] | undefined => {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : [];
  const parsed = values.map(Number).filter(Number.isFinite).map(value => Math.max(1, Math.round(value)));
  return parsed.length > 0 ? parsed : undefined;
};

const resolveConferences = (value: unknown): NBAConf[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const rows = value.flatMap(entry => {
    const row = asRecord(entry);
    const cid = optionalNumber(row.cid);
    const name = String(row.name ?? '').trim();
    return cid == null || !name ? [] : [{ cid, name }];
  });
  return rows.length > 0 ? rows : undefined;
};

const resolveDivisions = (value: unknown): NBADiv[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const rows = value.flatMap(entry => {
    const row = asRecord(entry);
    const cid = optionalNumber(row.cid);
    const did = optionalNumber(row.did);
    const name = String(row.name ?? '').trim();
    return cid == null || did == null || !name ? [] : [{ cid, did, name }];
  });
  return rows.length > 0 ? rows : undefined;
};

const KNOWN_KEYS = new Set([
  'leagueName', 'season', 'startingSeason', 'gender',
  'confs', 'divs', 'numGames', 'numGamesDiv', 'numGamesConf',
  'numGamesPlayoffSeries', 'numPlayoffTeams', 'numPlayoffByes', 'playoffEntryRounds', 'playIn', 'playoffsByConf',
  'minRosterSize', 'maxRosterSize', 'draftAges', 'draftType',
  'salaryCap', 'luxuryPayroll', 'minPayroll', 'minContract', 'maxContract', 'salaryCapType',
  'quarterLength', 'numPeriods', 'numPlayersOnCourt', 'playersOnCourt',
  'foulsNeededToFoulOut', 'threePointers', 'threePointLineEnabled',
  'elam', 'elamMinutes', 'elamPoints', 'elamOvertime',
  'maxOvertimes', 'shootoutRounds', 'otl',
  'gameFormat', 'gameTargetScore', 'overtimeEnabled', 'overtimeDuration', 'overtimeType',
  'overtimeTargetPoints', 'maxOvertimesEnabled', 'overtimeTieBreaker', 'threePointLineDistance',
  'pace', 'threePointTendencyFactor', 'threePointAccuracyFactor', 'twoPointAccuracyFactor',
  'ftAccuracyFactor', 'blockFactor', 'stealFactor', 'turnoverFactor', 'orbFactor', 'foulRateFactor',
  'inSeasonTournament',
]);

const optionalClampedNumber = (value: unknown, min: number, max: number): number | undefined => {
  const parsed = optionalNumber(value);
  return parsed == null ? undefined : Math.min(max, Math.max(min, parsed));
};

export function resolveBbgmGameAttributes(value: unknown, season: number): RawRecord {
  const normalized = normalizeBbgmGameAttributes(value);
  return Object.fromEntries(Object.entries(normalized).map(([key, entry]) => [
    key,
    resolveBbgmHistoryValue(entry, season),
  ]));
}

export function inferBbgmPlayoffTeamCount(
  numRounds: number,
  numPlayoffByes: number,
  activeTeamCount: number,
): number {
  if (numRounds <= 0) return 0;
  return Math.min(activeTeamCount, Math.max(2, (2 ** numRounds) - Math.max(0, numPlayoffByes)));
}

export function createBbgmLeagueRulePatch(
  rawGameAttributes: unknown,
  season: number,
  activeTeamCount: number,
): { rules: Partial<LeagueStats>; resolved: RawRecord; unsupported: RawRecord } {
  const resolved = resolveBbgmGameAttributes(rawGameAttributes, season);
  const playoffSeries = optionalNumberList(resolved.numGamesPlayoffSeries);
  const playoffEntryRounds = optionalNumberList(resolved.playoffEntryRounds);
  const numPlayoffByes = Math.max(0, Math.round(optionalNumber(resolved.numPlayoffByes) ?? 0));
  const explicitPlayoffTeams = optionalNumber(resolved.numPlayoffTeams);
  const numGames = optionalNumber(resolved.numGames);
  const numGamesDiv = resolved.numGamesDiv == null ? null : optionalNumber(resolved.numGamesDiv) ?? 0;
  const numGamesConf = resolved.numGamesConf == null ? null : optionalNumber(resolved.numGamesConf) ?? 0;
  const maxOvertimes = resolved.maxOvertimes == null ? undefined : optionalNumber(resolved.maxOvertimes);
  const shootoutRounds = Math.max(0, Math.round(optionalNumber(resolved.shootoutRounds) ?? 0));
  const elam = optionalBoolean(resolved.elam) === true;
  const threePointers = optionalBoolean(resolved.threePointers ?? resolved.threePointLineEnabled);
  const maxPlayersOnCourt = optionalNumber(resolved.numPlayersOnCourt ?? resolved.playersOnCourt);
  const explicitGameFormat = String(resolved.gameFormat ?? '').trim();
  const gameFormat: LeagueStats['gameFormat'] = elam
    ? 'elam_ending'
    : explicitGameFormat === 'target_score' || explicitGameFormat === 'elam_ending'
      ? explicitGameFormat
      : 'timed';
  const confs = resolveConferences(resolved.confs);
  const divs = resolveDivisions(resolved.divs);
  const pace = optionalClampedNumber(resolved.pace, 1, 400);
  const threePointTendencyFactor = optionalClampedNumber(resolved.threePointTendencyFactor, 0, 4);
  const threePointAccuracyFactor = optionalClampedNumber(resolved.threePointAccuracyFactor, 0, 4);
  const twoPointAccuracyFactor = optionalClampedNumber(resolved.twoPointAccuracyFactor, 0, 4);
  const ftAccuracyFactor = optionalClampedNumber(resolved.ftAccuracyFactor, 0, 4);
  const blockFactor = optionalClampedNumber(resolved.blockFactor, 0, 4);
  const stealFactor = optionalClampedNumber(resolved.stealFactor, 0, 4);
  const turnoverFactor = optionalClampedNumber(resolved.turnoverFactor, 0, 4);
  const orbFactor = optionalClampedNumber(resolved.orbFactor, 0, 4);
  const foulRateFactor = optionalClampedNumber(resolved.foulRateFactor, 0, 4);

  const rules: Partial<LeagueStats> = {
    ...(numGames != null ? { gamesPerSeason: Math.max(1, Math.round(numGames)) } : {}),
    customScheduleEnabled: numGames != null || numGamesDiv != null || numGamesConf != null,
    numGamesDiv,
    numGamesConf,
    ...(numGamesDiv != null ? { divisionGames: Math.max(0, Math.round(numGamesDiv)) } : {}),
    ...(numGamesConf != null ? { conferenceGames: Math.max(0, Math.round(numGamesConf)) } : {}),
    ...(playoffSeries ? { numGamesPlayoffSeries: playoffSeries } : {}),
    numPlayoffByes,
    ...(playoffEntryRounds ? { playoffEntryRounds } : {}),
    numPlayoffTeams: Math.max(0, Math.round(explicitPlayoffTeams ?? inferBbgmPlayoffTeamCount(
      playoffSeries?.length ?? 0,
      numPlayoffByes,
      activeTeamCount,
    ))),
    ...(optionalBoolean(resolved.playIn) != null ? { playIn: optionalBoolean(resolved.playIn)! } : {}),
    ...(optionalBoolean(resolved.playoffsByConf) != null ? { playoffsByConf: optionalBoolean(resolved.playoffsByConf)! } : {}),
    ...(confs ? { confs } : {}),
    ...(divs ? { divs } : {}),
    ...(optionalNumber(resolved.quarterLength) != null ? { quarterLength: Math.max(1, optionalNumber(resolved.quarterLength)!) } : {}),
    ...(optionalNumber(resolved.numPeriods) != null ? { numQuarters: Math.max(1, Math.round(optionalNumber(resolved.numPeriods)!)) } : {}),
    ...(maxPlayersOnCourt != null ? { maxPlayersOnCourt: Math.max(1, Math.round(maxPlayersOnCourt)) } : {}),
    ...(optionalNumber(resolved.foulsNeededToFoulOut) != null ? { foulOutLimit: Math.max(1, Math.round(optionalNumber(resolved.foulsNeededToFoulOut)!)) } : {}),
    ...(threePointers != null ? { threePointLineEnabled: threePointers } : {}),
    gameFormat,
    ...(optionalNumber(resolved.gameTargetScore) != null ? { gameTargetScore: Math.max(1, Math.round(optionalNumber(resolved.gameTargetScore)!)) } : {}),
    ...(optionalNumber(resolved.elamPoints ?? resolved.overtimeTargetPoints) != null
      ? { overtimeTargetPoints: Math.max(1, Math.round(optionalNumber(resolved.elamPoints ?? resolved.overtimeTargetPoints)!)) }
      : {}),
    ...(optionalNumber(resolved.overtimeDuration) != null ? { overtimeDuration: Math.max(1, optionalNumber(resolved.overtimeDuration)!) } : {}),
    overtimeEnabled: optionalBoolean(resolved.overtimeEnabled) ?? maxOvertimes !== 0,
    maxOvertimesEnabled: optionalBoolean(resolved.maxOvertimesEnabled) ?? maxOvertimes != null,
    maxOvertimes: Math.max(0, Math.round(maxOvertimes ?? 0)),
    overtimeType: String(resolved.overtimeType ?? 'standard'),
    overtimeTieBreaker: String(resolved.overtimeTieBreaker ?? (shootoutRounds > 0 ? 'shootout' : 'sudden_death')),
    shootoutRounds: shootoutRounds > 0 ? shootoutRounds : 3,
    ...(optionalNumber(resolved.threePointLineDistance) != null ? { threePointLineDistance: optionalNumber(resolved.threePointLineDistance)! } : {}),
    ...(optionalBoolean(resolved.otl) != null ? { otl: optionalBoolean(resolved.otl)! } : {}),
    ...(optionalBoolean(resolved.inSeasonTournament) != null ? { inSeasonTournament: optionalBoolean(resolved.inSeasonTournament)! } : {}),
    ...(pace != null ? { pace } : {}),
    ...(threePointTendencyFactor != null ? { threePointTendencyFactor } : {}),
    ...(threePointAccuracyFactor != null ? { threePointAccuracyFactor } : {}),
    ...(twoPointAccuracyFactor != null ? { twoPointAccuracyFactor } : {}),
    ...(ftAccuracyFactor != null ? { ftAccuracyFactor } : {}),
    ...(blockFactor != null ? { blockFactor } : {}),
    ...(stealFactor != null ? { stealFactor } : {}),
    ...(turnoverFactor != null ? { turnoverFactor } : {}),
    ...(orbFactor != null ? { orbFactor } : {}),
    ...(foulRateFactor != null ? { foulRateFactor } : {}),
    ...(optionalNumber(resolved.minRosterSize) != null ? { minPlayersPerTeam: Math.max(1, Math.round(optionalNumber(resolved.minRosterSize)!)) } : {}),
    ...(optionalNumber(resolved.maxRosterSize) != null ? {
      maxPlayersPerTeam: Math.max(1, Math.round(optionalNumber(resolved.maxRosterSize)!)),
      maxStandardPlayersPerTeam: Math.max(1, Math.round(optionalNumber(resolved.maxRosterSize)!)),
    } : {}),
  };
  const unsupported = Object.fromEntries(Object.entries(resolved).filter(([key]) => !KNOWN_KEYS.has(key)));
  return { rules, resolved, unsupported };
}
