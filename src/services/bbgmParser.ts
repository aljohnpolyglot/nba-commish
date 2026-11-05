import { INITIAL_LEAGUE_STATS } from '../constants';
import { STATIC_NBA_TEAMS, type StaticNbaTeam } from '../data/staticNbaTeams';
import type {
  DraftPick,
  FictionalStartupTeamDef,
  Game,
  GameState,
  HistoricalAward,
  LeagueStats,
  NBAConf,
  NBATeam,
  NBAPlayer,
} from '../types';
import { initialState } from '../store/initialState';
import { getTeamFullName } from '../utils/teamNames';
import { resolveWnbaPlayerPortrait } from '../utils/playerImage';
import {
  calculateOverallFromRating,
  calculateTeamStrength,
  estimatePotentialBbgm,
} from '../utils/playerRatings';
import { generateFictionalLeague } from './fictionalLeagueGenerator';
import { generateSchedule } from './gameScheduler';
import { normalizeBBGMStats } from './rosterServiceHelpers';
import { completeImportedScheduleTarget } from './bbgmSchedule';
import { createBbgmLeagueRulePatch } from './modded/bbgmGameAttributes';
import { getLeagueCalendarDates, WNBA_LEAGUE_CALENDAR } from './leagueCalendar';
import { applyWnbaRuleSnapshot } from './wnba/history';
import { ensureDraftClasses } from './draftClassFiller';
import { isNoDraftLeague } from './offseason/offseasonState';

type RawRecord = Record<string, any>;

const BBGM_AWARD_MAP: Record<string, string> = {
  mvp: 'Most Valuable Player',
  dpoy: 'Defensive Player of the Year',
  roy: 'Rookie of the Year',
  smoy: 'Sixth Man of the Year',
  mip: 'Most Improved Player',
  champion: 'NBA Champion',
  finals_mvp: 'Finals MVP',
  finalsMvp: 'Finals MVP',
  allstar: 'All-Star',
};

const normalizeAttributes = (raw: unknown): RawRecord => {
  if (!Array.isArray(raw)) return raw && typeof raw === 'object' ? raw as RawRecord : {};
  return Object.fromEntries(raw
    .filter((entry: any) => entry?.key)
    .map((entry: any) => [entry.key, entry.value]));
};

const resolveHistoryValue = (value: any, season: number): any => {
  if (!Array.isArray(value) || !value.some(entry => entry && typeof entry === 'object' && 'value' in entry)) {
    return value;
  }
  const eligible = value
    .filter(entry => entry && typeof entry === 'object' && 'value' in entry)
    .filter(entry => entry.start == null || Number(entry.start) <= season)
    .sort((a, b) => Number(a.start ?? -Infinity) - Number(b.start ?? -Infinity));
  return eligible.at(-1)?.value;
};

const numberValue = (value: any, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const moneyToUsd = (value: any, fallback: number): number => {
  const amount = numberValue(value, fallback);
  return amount > 0 && amount < 1_000_000 ? amount * 1_000 : amount;
};

const numberList = (value: any, fallback: number[]): number[] => {
  if (Array.isArray(value)) {
    const parsed = value.map(Number).filter(Number.isFinite);
    return parsed.length > 0 ? parsed : fallback;
  }
  if (typeof value === 'string') {
    const parsed = value.split(/[\s,]+/).map(Number).filter(Number.isFinite);
    return parsed.length > 0 ? parsed : fallback;
  }
  return fallback;
};

const booleanValue = (value: any, fallback: boolean): boolean => (
  value == null ? fallback : Boolean(value)
);

const playerName = (player: RawRecord): string =>
  String(player.name ?? `${player.firstName ?? ''} ${player.lastName ?? ''}`).trim() || 'Unknown Player';

const latestBySeason = (rows: any[] | undefined, season: number): any => {
  const available = (rows ?? [])
    .filter(row => Number(row?.season ?? season) <= season)
    .sort((a, b) => Number(a?.season ?? 0) - Number(b?.season ?? 0));
  return available.at(-1) ?? rows?.at(-1);
};

const playerStatus = (tid: number, activeTids: Set<number>): NBAPlayer['status'] => {
  if (activeTids.has(tid)) return 'Active';
  if (tid === -1) return 'Free Agent';
  if (tid === -2) return 'Prospect';
  return 'Retired';
};

const mapPlayer = (
  raw: RawRecord,
  season: number,
  activeTids: Set<number>,
  gender: 'male' | 'female',
  sourceAwardCutoff?: number,
  sourceStatCutoff?: number,
): NBAPlayer => {
  const name = playerName(raw);
  const tid = numberValue(raw.tid, -1);
  const bornYear = numberValue(raw.born?.year, season - numberValue(raw.age, 25));
  const ratings = (Array.isArray(raw.ratings) && raw.ratings.length > 0 ? raw.ratings : [{}])
    .map((rating: RawRecord) => {
      const ratingSeason = numberValue(rating.season, season);
      const overall = Number.isFinite(Number(rating.ovr))
        ? Number(rating.ovr)
        : calculateOverallFromRating(rating);
      const potential = Number.isFinite(Number(rating.pot))
        ? Number(rating.pot)
        : estimatePotentialBbgm(overall, Math.max(0, ratingSeason - bornYear));
      return { ...rating, season: ratingSeason, ovr: overall, pot: potential };
    });
  const latestRating = latestBySeason(ratings, season) ?? ratings.at(-1) ?? {};
  const awards = (raw.awards ?? [])
    .filter((award: any) => sourceAwardCutoff == null || Number(award?.season) < sourceAwardCutoff)
    .map((award: any) => ({
      ...award,
      season: numberValue(award?.season, season),
      type: BBGM_AWARD_MAP[String(award?.type ?? '')] ?? String(award?.type ?? 'League Honor'),
    }));
  const stats = normalizeBBGMStats(raw.stats, sourceStatCutoff);
  const jerseyNumber = raw.jerseyNumber
    ?? [...stats].reverse().find((row: any) => row?.jerseyNumber != null)?.jerseyNumber;

  return {
    ...raw,
    internalId: `bbgm-${raw.pid ?? `${name.replace(/[^a-z0-9]+/gi, '')}-${bornYear}`}`,
    tid,
    name,
    overallRating: numberValue(latestRating.ovr, calculateOverallFromRating(latestRating)),
    potential: numberValue(latestRating.pot ?? raw.potential, numberValue(latestRating.ovr, 50)),
    ratings,
    stats,
    born: { year: bornYear, loc: String(raw.born?.loc ?? raw.born?.country ?? '') },
    age: season - bornYear,
    pos: raw.pos ?? latestRating.pos,
    injury: raw.injury ?? { type: 'Healthy', gamesRemaining: 0 },
    status: playerStatus(tid, activeTids),
    awards,
    jerseyNumber: jerseyNumber == null ? undefined : String(jerseyNumber),
    gender,
  } as NBAPlayer;
};

const conferenceMap = (attributes: RawRecord, season: number): Map<number, string> => {
  const confs = resolveHistoryValue(attributes.confs, season);
  return new Map((Array.isArray(confs) ? confs : [])
    .map((conference: any) => [Number(conference.cid), String(conference.name ?? '')]));
};

const currentTeamSeason = (team: RawRecord, season: number): RawRecord | undefined =>
  (team.seasons ?? [])
    .filter((row: any) => Number(row?.season ?? 0) <= season)
    .sort((a: any, b: any) => Number(a?.season ?? 0) - Number(b?.season ?? 0))
    .at(-1);

const mapTeam = (
  raw: RawRecord,
  season: number,
  confNames: Map<number, string>,
): NBATeam => {
  const current = currentTeamSeason(raw, season) ?? {};
  const region = String(current.region ?? raw.region ?? '');
  const name = String(current.name ?? raw.name ?? raw.abbrev ?? 'Team');
  const cid = numberValue(current.cid ?? raw.cid, 0);
  const conference = confNames.get(cid)
    ?? (confNames.size === 2 ? (cid === 0 ? 'East' : 'West') : `Conference ${cid + 1}`);
  return {
    ...raw,
    id: numberValue(raw.tid, 0),
    name: getTeamFullName({ region, name }),
    region,
    abbrev: String(current.abbrev ?? raw.abbrev ?? `T${raw.tid}`),
    conference,
    cid,
    did: numberValue(current.did ?? raw.did, 0),
    wins: numberValue(current.won ?? raw.won, 0),
    losses: numberValue(current.lost ?? raw.lost, 0),
    strength: 50,
    pop: numberValue(current.pop ?? raw.pop, 1),
    stadiumCapacity: current.stadiumCapacity ?? raw.stadiumCapacity,
    logoUrl: current.imgURLSmall ?? current.imgURL ?? raw.imgURLSmall ?? raw.imgURL,
    colors: current.colors ?? raw.colors,
    seasons: raw.seasons ?? [],
    retiredJerseyNumbers: raw.retiredJerseyNumbers ?? [],
  } as NBATeam;
};

const isStandardNbaLeague = (teams: NBATeam[], gender: string): boolean => {
  if (gender === 'female') return false;
  const nbaAbbrevs = new Set(STATIC_NBA_TEAMS.map(team => team.abbrev));
  const matches = teams.filter(team => nbaAbbrevs.has(team.abbrev)).length;
  return matches >= 20;
};

const normalizeStandardNbaConferences = (teams: NBATeam[]): NBATeam[] =>
  teams.map(team => {
    const label = String(team.conference ?? '').toLowerCase();
    const conference = label.includes('east') || team.cid === 0
      ? 'East'
      : label.includes('west') || team.cid === 1
        ? 'West'
        : team.conference;
    return conference === team.conference ? team : { ...team, conference };
  });

const importedLeagueName = (
  raw: RawRecord,
  teams: NBATeam[],
  standardNba: boolean,
  gender: string,
  attributeName?: unknown,
): string => {
  const explicit = raw.meta?.name ?? raw.meta?.leagueName ?? raw.name ?? attributeName;
  if (explicit) return String(explicit);
  if (standardNba) return 'NBA';
  if (gender === 'female' && teams.some(team => team.abbrev === 'ATL') && teams.some(team => team.abbrev === 'SEA')) return 'WNBA';
  if (teams.length > 0 && teams.every(team => /^[A-Z]{3}$/.test(team.abbrev)) && teams.some(team => team.abbrev === 'USA')) {
    return 'Olympic Basketball';
  }
  return 'Custom Basketball League';
};

const normalizePlayerName = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const mapDraftPicks = (raw: RawRecord, season: number): DraftPick[] =>
  (raw.draftPicks ?? []).map((pick: any, index: number) => ({
    ...pick,
    dpid: numberValue(pick.dpid, season * 10_000 + index),
    tid: numberValue(pick.tid, -1),
    originalTid: numberValue(pick.originalTid, numberValue(pick.tid, -1)),
    round: numberValue(pick.round, 1),
    season: numberValue(pick.season, season),
  }));

const importedSchedule = (raw: RawRecord, season: number, leagueStats: LeagueStats): Game[] => {
  const source = Array.isArray(raw.schedule) ? raw.schedule : [];
  const seasonStart = getLeagueCalendarDates(season, leagueStats).regularSeasonStart;
  return source.flatMap((game: any, index: number) => {
    const homeTid = Number(game.homeTid ?? game.teams?.[0]?.tid);
    const awayTid = Number(game.awayTid ?? game.teams?.[1]?.tid);
    if (!Number.isFinite(homeTid) || !Number.isFinite(awayTid)) return [];
    const fallbackDate = new Date(seasonStart);
    fallbackDate.setUTCDate(fallbackDate.getUTCDate() + numberValue(game.day, index));
    return [{
      ...game,
      gid: numberValue(game.gid, season * 100_000 + index),
      homeTid,
      awayTid,
      homeScore: numberValue(game.homeScore ?? game.teams?.[0]?.pts, 0),
      awayScore: numberValue(game.awayScore ?? game.teams?.[1]?.pts, 0),
      played: Boolean(game.played),
      date: /^\d{4}-\d{2}-\d{2}/.test(String(game.date ?? ''))
        ? String(game.date).slice(0, 10)
        : fallbackDate.toISOString().slice(0, 10),
    } as Game];
  });
};

export const flattenHistoricalAwards = (
  rawAwards: any[],
  teams: Array<NBATeam | StaticNbaTeam>,
  uiMode?: LeagueStats['uiMode'],
): HistoricalAward[] => {
  const teamId = (team: NBATeam | StaticNbaTeam) => 'id' in team ? team.id : team.tid;
  const names = new Map(teams.map(team => [teamId(team), getTeamFullName(team)]));
  const teamsByAbbrev = new Map<string, NBATeam | StaticNbaTeam>();
  const normalizeTeamName = (value: unknown) => String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const teamsByName = new Map<string, NBATeam | StaticNbaTeam>();
  for (const team of teams) {
    teamsByAbbrev.set(String(team.abbrev).toUpperCase(), team);
    teamsByName.set(normalizeTeamName(getTeamFullName(team)), team);
    for (const seasonRow of ('seasons' in team ? team.seasons : []) ?? []) {
      const historical = {
        ...team,
        region: String(seasonRow.region ?? team.region ?? ''),
        name: String(seasonRow.name ?? team.name),
        abbrev: String(seasonRow.abbrev ?? team.abbrev),
      };
      teamsByAbbrev.set(historical.abbrev.toUpperCase(), team);
      teamsByName.set(normalizeTeamName(getTeamFullName(historical)), team);
    }
  }
  return (rawAwards ?? []).flatMap((row: any) => {
    const season = Number(row?.season);
    if (!Number.isFinite(season)) return [];
    const awards: HistoricalAward[] = [];
    const resolveTeam = (value: any): NBATeam | StaticNbaTeam | undefined => {
      if (value?.tid != null) {
        const byTid = teams.find(team => teamId(team) === Number(value.tid));
        if (byTid) return byTid;
      }
      const abbrev = String(value?.team ?? value?.abbrev ?? '').toUpperCase();
      if (abbrev && teamsByAbbrev.has(abbrev)) return teamsByAbbrev.get(abbrev);
      return teamsByName.get(normalizeTeamName(value?.teamName ?? value?.name));
    };
    const common = {
      ...(uiMode ? { uiMode } : {}),
      ...(uiMode === 'wnba_isolated' ? { source: 'wnba-history' } : {}),
    };
    const addPerson = (value: any, type: string, role: HistoricalAward['role'] = 'player') => {
      if (Array.isArray(value)) {
        value.forEach(entry => addPerson(entry, type, role));
        return;
      }
      if (!value || (!value.name && value.pid == null)) return;
      const team = resolveTeam(value);
      awards.push({
        ...common,
        season,
        type,
        name: String(value.name ?? 'Unknown Player'),
        pid: value.pid != null
          ? `bbgm-${value.pid}`
          : value.brPid != null
            ? String(value.brPid)
            : undefined,
        tid: team ? teamId(team) : (value.tid == null ? undefined : Number(value.tid)),
        team: team?.abbrev ?? (value.team == null ? undefined : String(value.team)),
        role,
      });
    };
    if (row.champion?.tid != null || row.champion?.name) {
      const team = resolveTeam(row.champion);
      awards.push({
        ...common,
        season,
        type: 'Champion',
        tid: team ? teamId(team) : (row.champion.tid == null ? undefined : Number(row.champion.tid)),
        name: row.champion.name ?? names.get(Number(row.champion.tid)) ?? '',
        team: team?.abbrev,
        coachName: row.champion.coach,
      });
    }
    if (row.runnerUp?.tid != null || row.runnerUp?.name) {
      const team = resolveTeam(row.runnerUp);
      awards.push({
        ...common,
        season,
        type: 'Runner Up',
        tid: team ? teamId(team) : (row.runnerUp.tid == null ? undefined : Number(row.runnerUp.tid)),
        name: row.runnerUp.name ?? names.get(Number(row.runnerUp.tid)) ?? '',
        team: team?.abbrev,
        coachName: row.runnerUp.coach,
      });
    }
    addPerson(row.mvp, 'Most Valuable Player');
    addPerson(row.dpoy, 'Defensive Player of the Year');
    addPerson(row.smoy, 'Sixth Man of the Year');
    addPerson(row.roy, 'Rookie of the Year');
    addPerson(row.mip, 'Most Improved Player');
    addPerson(row.finalsMvp, 'Finals MVP');
    addPerson(row.coy, 'Coach of the Year', 'coach');
    addPerson(row.executiveOfYear, 'Basketball Executive of the Year', 'executive');
    for (const award of row.additionalAwards ?? []) {
      addPerson(award, String(award.type ?? 'Award'), award.role ?? 'player');
    }
    addPerson(row.allStarMvp, 'All-Star MVP');
    addPerson(row.commissionersCupMvp, "Commissioner's Cup MVP");
    addPerson(row.sfmvp?.[0], 'Eastern Conference Finals MVP');
    addPerson(row.sfmvp?.[1], 'Western Conference Finals MVP');
    for (const group of row.allLeague ?? []) {
      for (const player of group?.players ?? []) addPerson(player, `All-League ${group.title ?? ''}`.trim());
    }
    for (const group of row.allDefensive ?? []) {
      for (const player of group?.players ?? []) addPerson(player, `All-Defensive ${group.title ?? ''}`.trim());
    }
    for (const player of row.allRookie ?? []) addPerson(player, 'All-Rookie Team');
    return awards;
  });
};

const fictionalTeamDefinitions = (teams: NBATeam[]): FictionalStartupTeamDef[] =>
  teams.map(team => ({
    tid: team.id,
    region: team.region ?? '',
    name: team.name.startsWith(`${team.region ?? ''} `)
      ? team.name.slice(String(team.region ?? '').length + 1)
      : team.name,
    abbrev: team.abbrev,
    colors: [
      team.colors?.[0] ?? '#334155',
      team.colors?.[1] ?? '#e2e8f0',
      team.colors?.[2] ?? '#6366f1',
    ],
    pop: team.pop ?? 1,
    conference: team.conference,
    conferenceName: team.conference,
    cid: team.cid ?? 0,
    did: team.did ?? 0,
    stadiumCapacity: Number(team.stadiumCapacity ?? 18_000),
    imgURL: team.logoUrl,
  }));

export function isBBGMLeagueFile(raw: unknown): raw is RawRecord {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as RawRecord;
  return Array.isArray(candidate.teams)
    && (Array.isArray(candidate.players) || candidate.gameAttributes != null)
    && candidate.leagueStats == null;
}

export async function parseBBGMLeagueFile(raw: RawRecord): Promise<GameState> {
  if (!isBBGMLeagueFile(raw)) throw new Error('This is not a supported BBGM league file.');
  const attributes = normalizeAttributes(raw.gameAttributes);
  const preliminarySeason = numberValue(raw.startingSeason, numberValue(attributes.season, new Date().getFullYear()));
  const season = numberValue(resolveHistoryValue(attributes.season, preliminarySeason), preliminarySeason);
  const attr = (key: string, fallback?: any) => resolveHistoryValue(attributes[key], season) ?? fallback;
  const attributeLeagueName = attr('leagueName');
  const genderValue = String(attr('gender', '')).toLowerCase();
  const gender = genderValue === 'female' || /\bwnba\b/i.test(String(attributeLeagueName ?? '')) ? 'female' : 'male';
  const confNames = conferenceMap(attributes, season);
  const teamArchive = (raw.teams ?? [])
    .filter((team: any) => Number(team?.tid) >= 0)
    .map((team: any) => mapTeam(team, season, confNames));
  let teams: NBATeam[] = (raw.teams ?? [])
    .filter((team: any) => team?.disabled !== true && Number(team?.tid) >= 0)
    .map((team: any) => mapTeam(team, season, confNames));
  if (teams.length < 2) throw new Error('The BBGM league file needs at least two active teams.');
  const bbgmRuleSet = createBbgmLeagueRulePatch(raw.gameAttributes, season, teams.length);

  const activeTids = new Set<number>(teams.map(team => team.id));
  const standardNba = isStandardNbaLeague(teams, gender);
  if (standardNba) teams = normalizeStandardNbaConferences(teams);
  const leagueName = importedLeagueName(raw, teams, standardNba, gender, attributeLeagueName);
  const isWnbaLeague = /\bwnba\b/i.test(leagueName);
  let players = (raw.players ?? []).map((player: any) =>
    mapPlayer(player, season, activeTids, gender, isWnbaLeague ? season : undefined, isWnbaLeague ? season : undefined),
  );
  if (isWnbaLeague && players.length > 0) {
    try {
      const { fetchWNBARoster } = await import('./externalRosterFetchers');
      const portraitRoster = await fetchWNBARoster(season);
      const portraitByName = new Map(
        portraitRoster.players
          .filter(player => Boolean(player.imgURL))
          .map(player => [normalizePlayerName(player.name), player.imgURL] as const),
      );
      players = players.map(player => ({
        ...player,
        imgURL: resolveWnbaPlayerPortrait(
          player.imgURL,
          portraitByName.get(normalizePlayerName(player.name)),
        ),
      }));
    } catch (error) {
      players = players.map(player => ({
        ...player,
        imgURL: resolveWnbaPlayerPortrait(player.imgURL),
      }));
      console.warn('[WNBA] Current portrait source is unavailable; unsupported fallback portraits were removed.', error);
    }
  }
  const playoffSeries = bbgmRuleSet.rules.numGamesPlayoffSeries
    ?? numberList(attr('numGamesPlayoffSeries'), INITIAL_LEAGUE_STATS.numGamesPlayoffSeries);
  const targetGames = bbgmRuleSet.rules.gamesPerSeason ?? numberValue(attr('numGames'), 82);
  const salaryCap = moneyToUsd(attr('salaryCap'), INITIAL_LEAGUE_STATS.salaryCap);
  const minimumPayroll = moneyToUsd(attr('minPayroll'), 0);
  const inferredPlayoffTeams = bbgmRuleSet.rules.numPlayoffTeams
    ?? Math.min(teams.length, 2 ** playoffSeries.length);
  const importedConferences: NBAConf[] = bbgmRuleSet.rules.confs ?? [];
  const conferenceIds = [...new Set<number>(teams.map(team => Number(team.cid)).filter(Number.isFinite))].sort((a, b) => a - b);
  const inferredConferences = conferenceIds.map(cid => {
    const teamLabel = String(teams.find(team => team.cid === cid)?.conference ?? '');
    const name = conferenceIds.length === 1
      ? leagueName
      : /^Conference \d+$/i.test(teamLabel) || !teamLabel
        ? `Conference ${cid + 1}`
        : teamLabel;
    return { cid, name };
  });
  const resolvedConferences = importedConferences.length > 0 ? importedConferences : inferredConferences;
  const resolvedConferenceNames = new Map(resolvedConferences.map(conference => [conference.cid, conference.name]));
  teams = teams.map(team => ({
    ...team,
    conference: resolvedConferenceNames.get(Number(team.cid)) ?? team.conference,
  }));
  const importedDivisions = bbgmRuleSet.rules.divs ?? [];
  let leagueStats: LeagueStats = {
    ...INITIAL_LEAGUE_STATS,
    ...bbgmRuleSet.rules,
    year: season,
    leagueName,
    uiMode: isWnbaLeague ? 'wnba_isolated' : standardNba ? 'nba' : 'fictional',
    currency: 'USD',
    salaryCap,
    luxuryPayroll: moneyToUsd(attr('luxuryPayroll'), INITIAL_LEAGUE_STATS.luxuryPayroll),
    minContract: moneyToUsd(attr('minContract'), INITIAL_LEAGUE_STATS.minContract),
    maxContract: moneyToUsd(attr('maxContract'), INITIAL_LEAGUE_STATS.maxContract),
    numGamesPlayoffSeries: playoffSeries,
    gamesPerSeason: targetGames,
    numPlayoffTeams: inferredPlayoffTeams,
    numPlayoffByes: bbgmRuleSet.rules.numPlayoffByes ?? 0,
    playIn: bbgmRuleSet.rules.playIn ?? false,
    inSeasonTournament: isWnbaLeague
      ? season >= 2021
      : standardNba && booleanValue(attr('inSeasonTournament'), true),
    minAgeRequirement: numberValue(attr('draftAges')?.[0], INITIAL_LEAGUE_STATS.minAgeRequirement),
    draftType: String(attr('draftType', INITIAL_LEAGUE_STATS.draftType)),
    fictionalPlayerPool: gender === 'female' ? 'womens' : 'mens',
    fictionalRosterMode: 'current',
    fictionalFantasyDraftCompleted: true,
    ...(isWnbaLeague ? { leagueCalendar: WNBA_LEAGUE_CALENDAR } : {}),
    salaryCapEnabled: salaryCap > 0,
    salaryCapType: String(attr('salaryCapType', isWnbaLeague ? 'hard' : INITIAL_LEAGUE_STATS.salaryCapType ?? 'soft')) as LeagueStats['salaryCapType'],
    minimumPayrollEnabled: minimumPayroll > 0,
    minimumPayrollPercentage: salaryCap > 0 && minimumPayroll > 0
      ? Math.round((minimumPayroll / salaryCap) * 10_000) / 100
      : INITIAL_LEAGUE_STATS.minimumPayrollPercentage,
    confs: resolvedConferences,
    ...(importedDivisions.length > 0 ? { divs: importedDivisions } : {}),
    bbgmSchemaVersion: raw.version,
    bbgmGameAttributes: raw.gameAttributes,
    bbgmImportMeta: raw.meta,
    bbgmImportVersion: 1,
    bbgmResolvedGameAttributes: bbgmRuleSet.resolved,
    bbgmUnsupportedGameAttributes: bbgmRuleSet.unsupported,
  };
  if (isWnbaLeague) leagueStats = applyWnbaRuleSnapshot(leagueStats, season, undefined, { preserveConfigured: true });

  let historicalAwards = flattenHistoricalAwards(
    isWnbaLeague
      ? (raw.awards ?? []).filter((row: any) => Number(row?.season) < season)
      : raw.awards ?? [],
    teamArchive,
    isWnbaLeague ? 'wnba_isolated' : leagueStats.uiMode,
  );
  if (players.length === 0) {
    const generated = generateFictionalLeague(season, season * 1009 + teams.length, {
      teams: fictionalTeamDefinitions(teams),
      historyMode: 'brand_new',
      playerPool: gender === 'female' ? 'womens' : 'mens',
      leagueRules: leagueStats,
    });
    teams = generated.teams;
    players = generated.players;
    historicalAwards = generated.historicalAwards as HistoricalAward[];
  } else {
    teams = teams.map(team => ({
      ...team,
      strength: calculateTeamStrength(team.id, players),
    }));
  }

  if (!isNoDraftLeague(leagueStats)) {
    const targetClassSize = Math.max(48, teams.length * 3 + (isWnbaLeague ? 9 : 0));
    const fillResult = ensureDraftClasses(
      players,
      season,
      leagueStats.draftEligibilityRule,
      isWnbaLeague ? 'regen_pack' : 'legacy_newgen',
      {
        gender: gender === 'female' ? 'female' : 'male',
        targetClassSize: standardNba ? 80 : targetClassSize,
        suppressRealWorldOrigin: true,
        firstDraftYear: isWnbaLeague ? season + 1 : season,
        playerScope: isWnbaLeague ? 'wnba' : standardNba ? 'nba' : undefined,
      },
    );
    if (fillResult.additions.length > 0) players = [...players, ...fillResult.additions];
  }

  const sourceSchedule = importedSchedule(raw, season, leagueStats);
  if (!sourceSchedule.some(game => game.played)) {
    teams = teams.map(team => ({ ...team, wins: 0, losses: 0 }));
  }
  const schedule = sourceSchedule.length > 0
    ? sourceSchedule
    : completeImportedScheduleTarget(
        generateSchedule(
          teams,
          undefined,
          undefined,
          null,
          null,
          undefined,
          season,
          undefined,
          `bbgm-import-${season}`,
          targetGames,
          leagueStats.leagueCalendar,
          leagueStats.uiMode,
          leagueStats.allStarGameEnabled !== false,
        ),
        teams,
        season,
        targetGames,
        leagueStats,
      );
  const startDate = schedule.find(game => !game.played)?.date
    ?? schedule.at(-1)?.date
    ?? getLeagueCalendarDates(season, leagueStats).regularSeasonStart.toISOString();
  const commissionerName = 'League Commissioner';

  return {
    ...initialState,
    day: 1,
    date: startDate,
    leagueStats,
    historicalStats: [],
    historicalAwards,
    inbox: [],
    chats: [],
    news: [],
    socialFeed: [],
    history: [{ text: `${commissionerName} began a new season with ${leagueName}.`, date: startDate, type: 'League Event' }],
    teams,
    prevTeams: teamArchive,
    teamArchive,
    nonNBATeams: [],
    players,
    draftPicks: mapDraftPicks(raw, season),
    schedule,
    boxScores: [],
    staff: null,
    scheduledEvents: raw.scheduledEvents ?? raw.events ?? [],
    isDataLoaded: true,
    isProcessing: false,
    commissionerName,
    gameMode: 'commissioner',
    leagueType: standardNba || isWnbaLeague ? 'modded' : 'fictional',
    moddedLeagueBase: standardNba ? 'nba' : isWnbaLeague ? 'wnba' : undefined,
    nbaStartYear: undefined,
    saveId: undefined,
  };
}

export const fetchAndParseBBGMData = async () => {
  const response = await fetch('https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2025-26.NBA.Roster.json');
  if (!response.ok) throw new Error(`BBGM roster request failed (${response.status}).`);
  const state = await parseBBGMLeagueFile(await response.json());
  return { teams: state.teams, players: state.players };
};
