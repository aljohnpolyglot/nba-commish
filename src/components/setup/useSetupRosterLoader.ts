import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_LEAGUE_STATS } from '../../constants';
import type {
  FictionalHistoryMode,
  FictionalNationalityFrequency,
  FictionalPlayerPool,
  FictionalStartupTeamDef,
  LeagueStats,
  NBAPlayer,
  NBATeam,
  NonNBATeam,
} from '../../types';
import { generateFictionalLeague } from '../../services/fictionalLeagueGenerator';
import { prewarmRoster } from '../../services/rosterService';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { buildHistoricalEndesaRoster } from '../../services/historicalEndesa/seasonBuilder';
import { getEuroDomesticSourceForMarket } from '../../data/euroBasketballSources';
import { getEuropeHistoricalBackfillSource } from '../../data/europeHistoricalBackfill';
import { fetchEuroBasketballRoster } from '../../services/euroleagueRosterFetcher';
import { buildHistoricalPbaRoster } from '../../services/pba/historicalSeasonBuilder';
import { loadEuropeanCoachSource } from '../../services/euro/historicalCoachSource';
import { loadBundledWnbaLeagueState } from '../../services/modded/wnbaLeagueLoader';
import type { EuropeMarket, LeagueType, ModdedLeagueBase } from './LeagueTypeSelector';
import { shouldExposeSetupRoster } from './setupRosterLoadingPolicy';
import { isOnRoster } from '../../utils/teamLookup';

interface SetupRosterLoaderParams {
  enabled: boolean;
  leagueType: LeagueType;
  moddedLeagueBase?: ModdedLeagueBase;
  europeMarket?: EuropeMarket;
  activeNbaStartYear: number;
  activeEndesaStartYear: number;
  activeEuroSourceSeason: number;
  activePbaStartYear: number;
  fictionalLeagueSeed: number;
  fictionalSeasonYear?: number;
  fictionalTeams?: FictionalStartupTeamDef[];
  fictionalHistoryMode?: FictionalHistoryMode;
  fictionalPlayerPool?: FictionalPlayerPool;
  fictionalNationalityFrequencies?: FictionalNationalityFrequency[];
  fictionalLeagueRules?: Partial<LeagueStats>;
}

interface SetupRosterLoaderState {
  teams: NBATeam[];
  players: NBAPlayer[];
  loading: boolean;
  slow: boolean;
  supported: boolean;
  error: string | null;
  requestKey: string;
}

const SLOW_LOAD_MS = 4_000;
const LOAD_ERROR = 'This season could not be prepared. Check your connection and try again.';
const EMPTY_ERROR = 'No playable teams were found for this season. Try again or choose another season.';

const initialState: SetupRosterLoaderState = {
  teams: [],
  players: [],
  loading: true,
  slow: false,
  supported: true,
  error: null,
  requestKey: '',
};

export function projectSetupFranchises(teams: NBATeam[], players: NBAPlayer[]) {
  const rosterTeamIds = new Set(
    players
      .filter(player => Number.isInteger(Number(player.tid)) && Number(player.tid) >= 0 && isOnRoster(player))
      .map(player => Number(player.tid)),
  );
  const seen = new Set<number>();
  const rejectedTeamIds = new Set<number>();
  const projected = teams.filter(team => {
    const teamId = Number(team.id ?? (team as any).tid);
    const valid = Number.isInteger(teamId)
      && teamId >= 0
      && !seen.has(teamId)
      && rosterTeamIds.has(teamId)
      && Boolean(String(team.name ?? '').trim())
      && Boolean(String(team.abbrev ?? '').trim());
    if (!valid) {
      rejectedTeamIds.add(teamId);
      return false;
    }
    seen.add(teamId);
    return true;
  });
  return { teams: projected, rejectedTeamIds };
}

function mapPbaTeam(team: NonNBATeam): NBATeam {
  return {
    id: team.tid,
    tid: team.tid,
    region: team.region,
    name: team.name,
    abbrev: team.abbrev,
    colors: team.colors,
    logoUrl: getResolvedTeamLogoUrl(team),
    pop: team.pop,
    stadiumCapacity: team.stadiumCapacity,
    wins: Number((team as any).wins ?? (team as any).won ?? 0),
    losses: Number((team as any).losses ?? (team as any).lost ?? 0),
  } as unknown as NBATeam;
}

function mapEndesaTeam(team: NonNBATeam, season?: number): NBATeam {
  return {
    id: team.tid,
    tid: team.tid,
    region: team.region,
    name: team.name,
    abbrev: team.abbrev,
    colors: team.colors,
    logoUrl: getResolvedTeamLogoUrl(team, season),
    pop: team.pop,
    stadiumCapacity: team.stadiumCapacity,
    wins: 0,
    losses: 0,
  } as unknown as NBATeam;
}

function hasPlayableNbaRoster(teams: NBATeam[], players: NBAPlayer[]): boolean {
  return teams.length > 0 && players.some(player =>
    player.tid >= 0 &&
    player.tid < 100 &&
    player.status === 'Active'
  );
}

export function useSetupRosterLoader({
  enabled,
  leagueType,
  moddedLeagueBase,
  europeMarket,
  activeNbaStartYear,
  activeEndesaStartYear,
  activeEuroSourceSeason,
  activePbaStartYear,
  fictionalLeagueSeed,
  fictionalSeasonYear,
  fictionalTeams,
  fictionalHistoryMode,
  fictionalPlayerPool,
  fictionalNationalityFrequencies,
  fictionalLeagueRules,
}: SetupRosterLoaderParams) {
  const [state, setState] = useState<SetupRosterLoaderState>(initialState);
  const [retryToken, setRetryToken] = useState(0);
  const requestKey = useMemo(() => JSON.stringify({
    leagueType,
    moddedLeagueBase,
    europeMarket,
    activeNbaStartYear,
    activeEndesaStartYear,
    activeEuroSourceSeason,
    activePbaStartYear,
    fictionalLeagueSeed,
    fictionalSeasonYear,
    fictionalHistoryMode,
    fictionalPlayerPool,
    teams: fictionalTeams?.map(team => [team.abbrev, team.cid, team.did]),
    nationalities: fictionalNationalityFrequencies?.map(entry => [entry.country, entry.frequency]),
    rules: fictionalLeagueRules,
    retryToken,
  }), [activeEndesaStartYear, activeEuroSourceSeason, activeNbaStartYear, activePbaStartYear, europeMarket, fictionalHistoryMode, fictionalLeagueRules, fictionalLeagueSeed, fictionalNationalityFrequencies, fictionalPlayerPool, fictionalSeasonYear, fictionalTeams, leagueType, moddedLeagueBase, retryToken]);

  const retry = useCallback(() => {
    setRetryToken(token => token + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const isPbaSetup = leagueType === 'modded' && moddedLeagueBase === 'philippines';
    const isWnbaSetup = leagueType === 'modded' && moddedLeagueBase === 'wnba';
    const isSpainEuropeSetup = leagueType === 'modded' && moddedLeagueBase === 'europe' && europeMarket === 'spain';
    const euroDomesticSource = leagueType === 'modded' && moddedLeagueBase === 'europe'
      ? getEuroDomesticSourceForMarket(europeMarket)
      : null;
    const historicalEuropeSource = leagueType === 'modded' && moddedLeagueBase === 'europe'
      ? getEuropeHistoricalBackfillSource(europeMarket, activeEuroSourceSeason)
      : null;
    const selectedEuroSource = historicalEuropeSource ?? euroDomesticSource;
    const slowTimer = setTimeout(() => {
      if (!cancelled) setState(current => current.loading ? { ...current, slow: true } : current);
    }, SLOW_LOAD_MS);

    const finish = (next: Omit<SetupRosterLoaderState, 'loading' | 'slow' | 'requestKey'>) => {
      if (cancelled) return;
      clearTimeout(slowTimer);
      const projected = projectSetupFranchises(next.teams, next.players);
      const supported = next.supported && projected.teams.length > 0;
      setState({
        ...next,
        teams: projected.teams,
        supported,
        error: supported ? next.error : next.error ?? EMPTY_ERROR,
        loading: false,
        slow: false,
        requestKey,
      });
    };
    const fail = () => finish({ teams: [], players: [], supported: false, error: LOAD_ERROR });
    const prepareEuropeanCoaches = () => loadEuropeanCoachSource().catch(error => {
      console.warn('[EURO STAFF] Real coach source unavailable during setup; generated staff remain available.', error);
      return null;
    });

    setState({ ...initialState, requestKey });

    if (leagueType === 'fictional') {
      const { teams, players } = generateFictionalLeague(
        fictionalSeasonYear ?? INITIAL_LEAGUE_STATS.year,
        fictionalLeagueSeed,
        {
          teams: fictionalTeams,
          historyMode: fictionalHistoryMode,
          playerPool: fictionalPlayerPool,
          nationalityFrequencies: fictionalNationalityFrequencies,
          leagueRules: fictionalLeagueRules,
        },
      );
      finish({ teams, players, supported: true, error: null });
      return () => {
        cancelled = true;
        clearTimeout(slowTimer);
      };
    }

    if (isPbaSetup) {
      buildHistoricalPbaRoster(activePbaStartYear).then(({ teams, players }) => {
        const mappedTeams = teams.map(mapPbaTeam);
        finish({
          teams: mappedTeams,
          players,
          supported: mappedTeams.length > 0,
          error: mappedTeams.length > 0 ? null : EMPTY_ERROR,
        });
      }).catch(fail);
      return () => {
        cancelled = true;
        clearTimeout(slowTimer);
      };
    }

    if (isWnbaSetup) {
      loadBundledWnbaLeagueState().then(league => {
        const teams = league.teams ?? [];
        const players = league.players ?? [];
        finish({
          teams,
          players,
          supported: teams.length > 1 && players.some(player => player.tid >= 0),
          error: teams.length > 1 ? null : EMPTY_ERROR,
        });
      }).catch(fail);
      return () => {
        cancelled = true;
        clearTimeout(slowTimer);
      };
    }

    if (isSpainEuropeSetup) {
      if (historicalEuropeSource) {
        Promise.all([
          fetchEuroBasketballRoster(historicalEuropeSource, activeEuroSourceSeason),
          prepareEuropeanCoaches(),
        ]).then(([{ teams, players }]) => {
          const mappedTeams = teams.map(team => mapEndesaTeam(team, activeEuroSourceSeason));
          finish({
            teams: mappedTeams,
            players,
            supported: mappedTeams.length > 0,
            error: mappedTeams.length > 0 ? null : EMPTY_ERROR,
          });
        }).catch(fail);
        return () => {
          cancelled = true;
          clearTimeout(slowTimer);
        };
      }
      Promise.all([
        buildHistoricalEndesaRoster(activeEndesaStartYear),
        prepareEuropeanCoaches(),
      ]).then(([{ teams, players }]) => {
        const mappedTeams = teams.map(team => mapEndesaTeam(team, activeEuroSourceSeason));
        finish({
          teams: mappedTeams,
          players,
          supported: mappedTeams.length > 0,
          error: mappedTeams.length > 0 ? null : EMPTY_ERROR,
        });
      }).catch(fail);
      return () => {
        cancelled = true;
        clearTimeout(slowTimer);
      };
    }

    if (selectedEuroSource) {
      Promise.all([
        fetchEuroBasketballRoster(selectedEuroSource, activeEuroSourceSeason),
        prepareEuropeanCoaches(),
      ]).then(([{ teams, players }]) => {
        const mappedTeams = teams.map(team => mapEndesaTeam(team, activeEuroSourceSeason));
        finish({
          teams: mappedTeams,
          players,
          supported: mappedTeams.length > 0,
          error: mappedTeams.length > 0 ? null : EMPTY_ERROR,
        });
      }).catch(fail);
      return () => {
        cancelled = true;
        clearTimeout(slowTimer);
      };
    }

    prewarmRoster(activeNbaStartYear).then(data => {
      const teams = data.teams ?? [];
      const players = data.players ?? [];
      const supported = data.supported !== false && hasPlayableNbaRoster(teams, players);
      finish({
        teams,
        players,
        supported,
        error: supported ? null : EMPTY_ERROR,
      });
    }).catch(fail);

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [activeEndesaStartYear, activeEuroSourceSeason, activeNbaStartYear, activePbaStartYear, enabled, europeMarket, fictionalHistoryMode, fictionalLeagueRules, fictionalLeagueSeed, fictionalNationalityFrequencies, fictionalPlayerPool, fictionalSeasonYear, fictionalTeams, leagueType, moddedLeagueBase, requestKey, retryToken]);

  if (!enabled) return { ...initialState, loading: false, retry };
  if (!shouldExposeSetupRoster(enabled, state.requestKey, requestKey)) {
    return { ...initialState, requestKey, loading: true, retry };
  }
  return { ...state, retry };
}
