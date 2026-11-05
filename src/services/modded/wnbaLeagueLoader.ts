import type { GameState, HistoricalAward, NBATeam } from '../../types';
import {
  assignCupGroups,
  buildWnbaStyleCupFormat,
  createCupCompetitionState,
  setCupCompetitionState,
  tagExistingCupGroupGames,
} from '../competition/cup';
import { createCupPrizePoolState } from '../governorsBoard/cupPrizePool';
import { normalizeBbgmGameAttributes } from './bbgmGameAttributes';
import { parseBBGMLeagueFile } from '../bbgmParser';
import { prepareWnbaCoachSource, buildWnbaHeadCoachStaffMembers } from '../staff/wnba';
import { seedActiveLeagueStaffForTeams } from '../staff/nbaRealStaffSeed';
import {
  loadWnbaLogoHistory,
  resolveWnbaTeamLogo,
  type WnbaLogoHistorySource,
} from '../teamIdentity/wnbaLogoHistory';
import { parseWnbaCommissionersCupHistory } from '../wnba/cupHistory';
import { applyWnbaRuleSnapshot, buildHistoricalWnbaState } from '../wnba/history';
import { applyWnbaContractHistory } from '../wnba/contractHistory';
import { getTeamFullName } from '../../utils/teamNames';
import { fetchInternalWnbaAwardHistory } from '../../data/internalCompetitionHistory';
import { getLeagueCalendarDates } from '../leagueCalendar';
import { seedOpeningTeamChemistry } from '../teamChemistry';
import { buildOpeningSeasonReviewNews } from '../news/seasonRecaps';

const WNBA_LEAGUE_PATH = '/data/external/wnba/wnba-2026-bbgm.json';
const WNBA_2027_DRAFT_PATH = '/data/external/wnba/draft/wnba-draft-2027-bbgm.json';
const WNBA_AWARDS_PATH = '/data/external/wnba/wnba_awards.json';
const WNBA_CUP_PATH = '/data/external/wnba/wnba_commissioners_cup.json';
const WNBA_ALL_STAR_PATH = '/data/external/wnba/wnba_all_star_history.json';
const WNBA_CONTRACT_HISTORY_PATH = '/data/external/wnba/wnba-hhs-spotrac-merged-2026-08-14T12-08-11-330Z.json';
const HOF_PATH = '/data/historical/hof/naismith-player-inductees.json';
const WNBA_KNOWLEDGE_CUTOFF = '2026-07-31';

type RawRecord = Record<string, unknown>;
type WnbaSource = RawRecord & { awards?: unknown[] };

const mergeDraftClass = (source: WnbaSource, draftSource: unknown): WnbaSource => {
  const root = draftSource && typeof draftSource === 'object' ? draftSource as RawRecord : {};
  const sourcePlayers = Array.isArray(source.players) ? source.players as RawRecord[] : [];
  const draftPlayers = Array.isArray(root.players) ? root.players as RawRecord[] : [];
  const existing = new Set(sourcePlayers.map(player => [
    normalizedName(player.name),
    Number((player.born as RawRecord | undefined)?.year ?? 0),
    Number((player.draft as RawRecord | undefined)?.year ?? 0),
  ].join('|')));
  const additions = draftPlayers.filter(player => {
    const draftYear = Number((player.draft as RawRecord | undefined)?.year);
    const key = [
      normalizedName(player.name),
      Number((player.born as RawRecord | undefined)?.year ?? 0),
      draftYear,
    ].join('|');
    if (Number(player.tid) !== -2 || draftYear !== 2027 || !normalizedName(player.name) || existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  return { ...source, players: [...sourcePlayers, ...additions] };
};

let sourcePromise: Promise<{
  source: WnbaSource;
  cup: unknown;
  allStar: unknown;
  contractHistory: unknown;
  logos: WnbaLogoHistorySource;
}> | null = null;

const fetchJson = async (path: string): Promise<unknown> => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`WNBA source could not be loaded (${response.status}).`);
  return response.json();
};

const mergeAwardSeasons = (base: unknown, history: unknown): unknown[] => {
  const rows = new Map<number, RawRecord>();
  for (const row of Array.isArray(base) ? base : []) {
    const season = Number((row as RawRecord)?.season);
    if (Number.isFinite(season)) rows.set(season, row as RawRecord);
  }
  for (const row of Array.isArray(history) ? history : []) {
    const season = Number((row as RawRecord)?.season);
    if (!Number.isFinite(season)) continue;
    const existing = rows.get(season) ?? {};
    const incoming = row as RawRecord;
    const merged = { ...existing, ...incoming };
    for (const [key, value] of Object.entries(incoming)) {
      if (Array.isArray(value)) continue;
      const prior = existing[key];
      if (prior && value && typeof prior === 'object' && typeof value === 'object') {
        merged[key] = { ...(prior as RawRecord), ...(value as RawRecord) };
      }
    }
    rows.set(season, merged);
  }
  return [...rows.values()].sort((left, right) => Number(left.season) - Number(right.season));
};

const normalizedName = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const hofNameKey = (value: unknown): string => normalizedName(value).replace(/\s+/g, '');

const withWnbaHallOfFame = (source: WnbaSource, hofSource: unknown): WnbaSource => {
  const root = hofSource && typeof hofSource === 'object' ? hofSource as RawRecord : {};
  const rows = Array.isArray(root.data) ? root.data as RawRecord[] : Array.isArray(hofSource) ? hofSource as RawRecord[] : [];
  const byName = new Map(rows.map(row => [hofNameKey(row.name), row]));
  const aliases = new Map([['cynthiacooper', 'cynthiacooperdyke']]);
  return {
    ...source,
    players: (Array.isArray(source.players) ? source.players as RawRecord[] : []).map(player => {
      const key = hofNameKey(player.name);
      const hof = byName.get(key) ?? byName.get(aliases.get(key) ?? '');
      if (!hof) return { ...player, gender: player.gender ?? 'female' };
      const year = Number(hof.year);
      return {
        ...player,
        gender: 'female',
        hof: true,
        hofInductionYear: Number.isFinite(year) ? year : undefined,
        status: Number(player.tid) < 0 ? 'Retired' : player.status,
      };
    }),
  };
};

const currentAllStarTeamLabels = (source: unknown, season: number): string[] => {
  const root = source && typeof source === 'object' ? source as RawRecord : {};
  const results = root.all_star_game_results && typeof root.all_star_game_results === 'object'
    ? root.all_star_game_results as RawRecord
    : {};
  const games = Array.isArray(results.games) ? results.games as RawRecord[] : [];
  const result = String(games.find(game => Number(game.year) === season)?.result ?? '');
  const labels = [...result.matchAll(/Team\s+([A-Za-z'’-]+)/g)].map(match => match[1]);
  return [...new Set(labels)].slice(0, 2);
};

const resolveHistoricalLegendCaptains = (players: GameState['players'], labels: string[]) => labels.flatMap(label => {
  const needle = hofNameKey(label);
  const matches = players.filter(player => {
    if (!player.hof) return false;
    const parts = normalizedName(player.name).split(' ').filter(Boolean);
    const last = parts.at(-1)?.replace(/[^a-z0-9]/g, '') ?? '';
    return last === needle || last.startsWith(needle) || last.endsWith(needle);
  });
  return matches.length === 1 ? [matches[0].internalId] : [];
}).slice(0, 2);

const teamName = (team: NBATeam): string => getTeamFullName(team);

const logoTeam = (team: NBATeam, source: WnbaLogoHistorySource, season: number): NBATeam => {
  const resolve = (targetSeason: number) => resolveWnbaTeamLogo(source, {
    ...team,
    league: 'wnba',
    uiMode: 'wnba_isolated',
    seasons: team.seasons,
  }, targetSeason);
  const current = resolve(season);
  return {
    ...team,
    logoUrl: current?.logoUrl ?? team.logoUrl,
    colors: current?.colors.length ? current.colors : team.colors,
    seasons: team.seasons?.map(row => {
      const historical = resolve(row.season);
      return historical ? {
        ...row,
        imgURL: historical.logoUrl,
        imgURLSmall: historical.logoUrl,
        logoUrl: historical.logoUrl,
        teamLogoUrl: historical.logoUrl,
        colors: historical.colors.length ? historical.colors : row.colors,
      } : row;
    }),
  };
};

const currentCupGroups = (cupSource: unknown, season: number, teams: NBATeam[]) => {
  const root = cupSource && typeof cupSource === 'object' ? cupSource as RawRecord : {};
  const editions = Array.isArray(root.wnba_commissioners_cup) ? root.wnba_commissioners_cup as RawRecord[] : [];
  const edition = editions.find(row => Number(row.year) === season);
  const standings = edition?.standings && typeof edition.standings === 'object'
    ? edition.standings as RawRecord
    : {};
  const teamByName = new Map(teams.flatMap(team => {
    const names = [teamName(team), team.name, team.region, team.abbrev].map(normalizedName).filter(Boolean);
    return names.map(name => [name, team] as const);
  }));
  const hints = new Map<number, 'East' | 'West'>();
  const read = (value: unknown, group: 'East' | 'West') => {
    for (const row of Array.isArray(value) ? value : []) {
      const sourceName = normalizedName((row as RawRecord)?.team);
      const team = teamByName.get(sourceName);
      if (team) hints.set(team.id, group);
    }
  };
  read(standings.eastern_conference, 'East');
  read(standings.western_conference, 'West');
  return hints;
};

async function loadSource(): Promise<{
  source: WnbaSource;
  cup: unknown;
  allStar: unknown;
  contractHistory: unknown;
  logos: WnbaLogoHistorySource;
}> {
  if (!sourcePromise) {
    sourcePromise = Promise.all([
      fetchJson(WNBA_LEAGUE_PATH),
      fetchJson(WNBA_2027_DRAFT_PATH),
      fetchJson(WNBA_AWARDS_PATH),
      fetchInternalWnbaAwardHistory(),
      fetchJson(WNBA_CUP_PATH),
      fetchJson(WNBA_ALL_STAR_PATH),
      fetchJson(HOF_PATH),
      fetchJson(WNBA_CONTRACT_HISTORY_PATH),
      loadWnbaLogoHistory(),
      prepareWnbaCoachSource(),
    ]).then(([league, draft2027, awards, internalAwards, cup, allStar, hof, contractHistory, logos]) => {
      const source = withWnbaHallOfFame(mergeDraftClass(league as WnbaSource, draft2027), hof);
      return {
        source: {
          ...source,
          awards: mergeAwardSeasons(mergeAwardSeasons(source.awards, awards), internalAwards),
        },
        cup,
        allStar,
        contractHistory,
        logos,
      };
    }).catch(error => {
      sourcePromise = null;
      throw error;
    });
  }
  return sourcePromise;
}

export async function loadBundledWnbaLeagueState(): Promise<GameState> {
  const { source, cup, allStar, contractHistory, logos } = await loadSource();
  const season = Number(source.startingSeason ?? 2026);
  const sourceWithRules: WnbaSource = {
    ...source,
    gameAttributes: {
      ...normalizeBbgmGameAttributes(source.gameAttributes),
      leagueName: 'WNBA',
      gender: 'female',
      quarterLength: 10,
      numPeriods: 4,
      numGames: 44,
      numPlayoffTeams: 8,
      numPlayoffByes: 0,
      numGamesPlayoffSeries: [3, 5, 7],
      playoffsByConf: false,
      playIn: false,
      inSeasonTournament: true,
      confs: [],
      divs: [],
    },
  };
  const parsed = await parseBBGMLeagueFile(sourceWithRules);
  const openingDate = getLeagueCalendarDates(season, parsed.leagueStats).regularSeasonStart.toISOString();
  const openingDay = openingDate.slice(0, 10);
  const activeTeamIds = new Set(parsed.teams.map(team => team.id));
  const players = applyWnbaContractHistory(
    parsed.players.map(player => (
      player.status === 'Active' && activeTeamIds.has(player.tid)
        ? { ...player, displayRatingProfile: 'wnba-current-roster' as const }
        : player
    )),
    parsed.teams,
    contractHistory,
    Math.min(season, Number(WNBA_KNOWLEDGE_CUTOFF.slice(0, 4))),
  );
  const history = buildHistoricalWnbaState(sourceWithRules, season);
  const cupHistory = parseWnbaCommissionersCupHistory({
    source: cup,
    history,
    cutoffDate: `${season}-01-01`,
  });
  history.commissionersCupHistory = cupHistory.history;

  const scopeTeam = (team: NBATeam): NBATeam => logoTeam({
    ...team,
    cid: 0,
    did: 0,
    conference: 'League',
  }, logos, season);
  const teams = parsed.teams.map(scopeTeam);
  const teamArchive = (parsed.teamArchive ?? parsed.prevTeams ?? parsed.teams).map(scopeTeam);
  const format = buildWnbaStyleCupFormat(teams.length);
  const groupHints = currentCupGroups(cup, season, teams);
  const assigned = assignCupGroups(format, teams.map((team, index) => ({
    tid: team.id,
    seed: index + 1,
    groupHint: groupHints.get(team.id),
    poolId: groupHints.get(team.id),
  })));
  const cupState = {
    ...createCupCompetitionState(format, season, assigned.groups),
    history: cupHistory.history,
  };
  const schedule = tagExistingCupGroupGames(
    parsed.schedule.filter(game => !game.isPreseason && String(game.date).slice(0, 10) >= openingDay),
    cupState,
  );
  const teamNamesByAbbrev = Object.fromEntries(teams.map(team => [team.abbrev, teamName(team)]));
  const coaches = buildWnbaHeadCoachStaffMembers({
    season,
    completedThroughYear: season - 1,
    teamNamesByAbbrev,
  });
  const staffedTeams = seedActiveLeagueStaffForTeams(seedOpeningTeamChemistry(teams, players, season), season, {
    source: 'wnba-generated-staff',
    leagueId: 'wnba',
    attributeProfile: 'default',
    headCoaches: coaches,
  }).teams;
  const historicalAwards: HistoricalAward[] = [
    ...parsed.historicalAwards,
    ...cupHistory.awards,
  ];
  const allStarLabels = currentAllStarTeamLabels(allStar, season);
  const allStarLegendCaptainIds = resolveHistoricalLegendCaptains(players, allStarLabels);

  return {
    ...parsed,
    date: openingDate,
    draftComplete: true,
    draftPicks: parsed.draftPicks.filter(pick => pick.season > season),
    history: parsed.history.map(entry => (
      typeof entry !== 'string' && entry.date === parsed.date
        ? { ...entry, date: openingDate }
        : entry
    )),
    news: [buildOpeningSeasonReviewNews('WNBA', String(season - 1), openingDate)],
    players,
    teams: staffedTeams,
    prevTeams: teamArchive,
    teamArchive,
    historicalAwards,
    schedule,
    leagueStats: {
      ...applyWnbaRuleSnapshot({
      ...parsed.leagueStats,
      uiMode: 'wnba_isolated',
      leagueName: 'WNBA',
      fictionalPlayerPool: 'womens',
      wnbaSourceSeason: season,
      }, season, WNBA_KNOWLEDGE_CUTOFF),
      ...(allStarLegendCaptainIds.length === 2 ? {
        allStarLegendCaptainIds,
        allStarTeamNames: allStarLabels.map(label => `Team ${label}`),
      } : {}),
      wnbaStaffSeedVersion: 1,
    },
    staff: { owners: [], gms: [], coaches, leagueOffice: [] },
    cupCompetitions: setCupCompetitionState(parsed.cupCompetitions, cupState),
    cupPrizePools: [createCupPrizePoolState({
      leagueId: 'wnba',
      competitionId: 'wnba-commissioners-cup',
      enabled: true,
      currencyCode: 'USD',
      effectiveSeason: season,
      perPlayerByFinish: { winner: 500_000, runnerUp: 165_000, semi: 0, quarter: 0 },
    })],
    wnbaStartYear: season,
    wnbaKnowledgeCutoffDate: WNBA_KNOWLEDGE_CUTOFF,
    historicalWnba: history,
  };
}
