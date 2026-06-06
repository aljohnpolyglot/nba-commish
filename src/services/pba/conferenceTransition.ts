import type { GameState, NBAPlayer } from '../../types';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { generateForCompetition, selectCompetitionTeamTids } from '../competition/competitionScheduler';
import { resolveCompetitionSeason } from '../competition/competitionResolver';
import { initialPbaEndOfSeasonChecklist, initialPbaInterConferenceChecklist } from '../offseason/offseasonState';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { applySeasonRollover } from '../logic/seasonRollover';

export type PbaConference = 'philippine' | 'commissioners' | 'governors';

const CONFERENCE_ORDER: PbaConference[] = ['philippine', 'commissioners', 'governors'];

export function getNextConference(current: PbaConference): PbaConference | null {
  const idx = CONFERENCE_ORDER.indexOf(current);
  return idx < CONFERENCE_ORDER.length - 1 ? CONFERENCE_ORDER[idx + 1] : null;
}

export function getConferenceSpec(conf: PbaConference) {
  const map: Record<PbaConference, number> = { philippine: 0, commissioners: 1, governors: 2 };
  return PBA_COMPETITIONS[map[conf]];
}

export function clearConferenceImports(players: NBAPlayer[], conference: PbaConference): NBAPlayer[] {
  return players.map(p => {
    if ((p as any).isImport && (p as any).importConference === conference) {
      return {
        ...p,
        tid: -1,
        status: 'Free Agent',
        isImport: undefined,
        importConference: undefined,
        importTeamId: undefined,
        pbaImportContract: undefined,
      } as any;
    }
    return p;
  });
}

export function recordConferenceChampion(
  state: GameState,
  conference: PbaConference,
  championTid: number,
  championName: string,
): any[] {
  const season = (state.leagueStats as any)?.year ?? new Date().getFullYear();
  const existing: any[] = (state.leagueStats as any)?.pbaConferenceChampions ?? [];
  return [
    ...existing,
    { season, conference, teamId: championTid, teamName: championName },
  ];
}

export function checkGrandSlam(champions: any[], season: number): { teamId: number; teamName: string } | null {
  const seasonChamps = champions.filter((c: any) => c.season === season);
  if (seasonChamps.length < 3) return null;
  const tids = seasonChamps.map((c: any) => c.teamId);
  if (new Set(tids).size === 1) {
    return { teamId: tids[0], teamName: seasonChamps[0].teamName };
  }
  return null;
}

export function generateNextConferenceSchedule(
  state: GameState,
  nextConf: PbaConference,
): any[] {
  const spec = getConferenceSpec(nextConf);
  const ls = state.leagueStats as any;
  const seasonYear = ls?.year ?? new Date().getFullYear();
  const calYear = spec.seasonStart.month >= 7 ? seasonYear - 1 : seasonYear;
  const start = new Date(Date.UTC(calYear, spec.seasonStart.month - 1, spec.seasonStart.day));
  const source = { nonNBATeams: (state as any).nonNBATeams, userTeamId: state.userTeamId };
  const tids = selectCompetitionTeamTids(spec, source);
  const gidBase = nextConf === 'commissioners' ? 810_000 : 820_000;
  return generateForCompetition(spec, tids.map(tid => ({ tid })), start, gidBase);
}

export function getConferenceStartDate(conf: PbaConference, seasonYear: number): string {
  const spec = getConferenceSpec(conf);
  const calYear = spec.seasonStart.month >= 7 ? seasonYear - 1 : seasonYear;
  const d = new Date(Date.UTC(calYear, spec.seasonStart.month - 1, spec.seasonStart.day));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function applyPbaConferenceLifecycle(
  state: GameState,
  pendingBoxScores: any[] = [],
): Partial<GameState> {
  if ((state.leagueStats as any)?.uiMode !== 'pba_isolated') return {};
  const leagueStats = state.leagueStats as any;
  if (leagueStats?.pbaConferencePhase === 'offseason' || leagueStats?.pbaConferencePhase === 'complete') return {};
  const current: PbaConference = leagueStats?.pbaConference ?? 'philippine';
  const spec = getConferenceSpec(current);
  const season = leagueStats?.year ?? new Date().getFullYear();
  const schedule = state.schedule ?? [];
  const hasCurrentConference = schedule.some((game: any) => game.competitionId === spec.id);
  if (!hasCurrentConference) return {};

  const currentGames = schedule.filter((game: any) => game.competitionId === spec.id);
  const hasPostseasonMaterial =
    currentGames.some((game: any) => ['qf', 'sf', 'final'].includes(String(game.competitionPhase))) ||
    [...(state.boxScores ?? []), ...pendingBoxScores].some((game: any) =>
      game.competitionId === spec.id && ['qf', 'sf', 'final'].includes(String(game.competitionPhase)),
    );
  const nextPhase = hasPostseasonMaterial ? 'playoffs' : 'regularSeason';
  const boxScores = [...(state.boxScores ?? []), ...pendingBoxScores];
  const teamTids = selectCompetitionTeamTids(spec, state as any);
  const resolution = resolveCompetitionSeason(spec, boxScores as any, season, teamTids);

  if (!resolution?.championTid) {
    if (leagueStats.pbaConferencePhase !== nextPhase) {
      return { leagueStats: { ...state.leagueStats, pbaConferencePhase: nextPhase } as any };
    }
    return {};
  }

  const existingChampions: any[] = leagueStats?.pbaConferenceChampions ?? [];
  const alreadyRecorded = existingChampions.some((entry: any) =>
    Number(entry.season) === Number(season) && entry.conference === current,
  );
  const champion = resolveAnyTeam(resolution.championTid, state.teams, state.nonNBATeams ?? []);
  const runnerUp = resolution.runnerUpTid != null
    ? resolveAnyTeam(resolution.runnerUpTid, state.teams, state.nonNBATeams ?? [])
    : null;
  const championName = champion ? getTeamFullName(champion as any) : `Team ${resolution.championTid}`;
  const runnerUpName = runnerUp ? getTeamFullName(runnerUp as any) : null;
  const nextConference = getNextConference(current);
  const nextLeagueStats = {
    ...state.leagueStats,
    pbaConferencePhase: 'offseason',
    pbaConferenceChampions: alreadyRecorded
      ? existingChampions
      : [
          ...existingChampions,
          { season, conference: current, teamId: resolution.championTid, teamName: championName },
        ],
  } as any;

  const historyEntry = {
    text: `${championName} won the ${spec.displayName}${runnerUpName ? ` over ${runnerUpName}` : ''}.`,
    date: state.date,
    type: 'PBA',
    tid: resolution.championTid,
  };
  const history = alreadyRecorded || (state.history ?? []).some((entry: any) => entry.text === historyEntry.text && entry.type === historyEntry.type)
    ? state.history
    : [...(state.history ?? []), historyEntry as any];

  if (!nextConference) {
    const rolloverPatch = applySeasonRollover({
      ...state,
      leagueStats: nextLeagueStats,
      boxScores,
      history,
    } as GameState);
    const rolledLeagueStats = {
      ...(rolloverPatch.leagueStats ?? nextLeagueStats),
      pbaConference: current,
      pbaConferencePhase: 'offseason',
      pbaConferenceChampions: nextLeagueStats.pbaConferenceChampions,
      pbaYearEndRolloverPreparedSeason: season,
    } as any;

    return {
      ...rolloverPatch,
      leagueStats: rolledLeagueStats,
      offseasonChecklist: initialPbaEndOfSeasonChecklist(),
      history: (rolloverPatch.history ?? history) as any,
    };
  }

  return {
    leagueStats: nextLeagueStats,
    schedule: schedule.filter((game: any) => game.competitionId !== spec.id || game.played),
    offseasonChecklist: initialPbaInterConferenceChecklist(),
    history,
  };
}
