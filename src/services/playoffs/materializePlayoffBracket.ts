import type { GameState } from '../../types';
import { TimeService } from '../time/TimeService';
import { resolveLeagueSeasonLifecycle } from '../lifecycle/leagueSeasonLifecycle';
import { transitionSeasonLifecycle } from '../lifecycle/seasonLifecycleMachine';
import { PlayoffGenerator } from './PlayoffGenerator';
import { upgradeLegacyBracketGraph } from './bracketGraph';
import {
  getRegularSeasonCompletionFingerprint,
  getUnresolvedCountableRegularSeasonGames,
} from '../lifecycle/postseasonRegularSeasonConflict';

const fingerprint = (value: unknown) => {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
};

export function materializePlayoffBracket(initial: GameState): GameState {
  if (initial.playoffs) {
    const upgraded = upgradeLegacyBracketGraph(
      initial.playoffs,
      initial.leagueStats.numGamesPlayoffSeries ?? [7, 7, 7, 7],
    );
    return upgraded === initial.playoffs ? initial : { ...initial, playoffs: upgraded };
  }
  const unfinishedRegularGames = getUnresolvedCountableRegularSeasonGames(initial);
  if (unfinishedRegularGames.length > 0) return initial;
  const stats = initial.leagueStats;
  const gamesPerRound = stats.numGamesPlayoffSeries ?? [7, 7, 7, 7];
  const playInEnabled = stats.playIn !== false && stats.playoffsByConf !== false;
  const generatedBracket = PlayoffGenerator.generateBracket(initial.teams, stats.year, gamesPerRound, playInEnabled, {
    totalPlayoffTeams: stats.numPlayoffTeams,
    firstRoundByes: stats.numPlayoffByes,
    entryRounds: stats.playoffEntryRounds,
    playInFormat: stats.playInFormat,
    byConference: stats.playoffsByConf,
    tiebreakers: stats.tiebreakers,
    headToHead: initial.headToHead,
    standingsMode: stats.standingsMode,
    pointsForWin: stats.pointsForWin,
    pointsForDraw: stats.pointsForDraw,
    pointsForLoss: stats.pointsForLoss,
    playoffReseeding: stats.playoffReseeding,
  });
  // The no-Play-In modern generator historically returned only round-one
  // series. Canonical target completion requires the same graph contract as
  // every other bracket path on the very first materialization pass.
  const bracket = upgradeLegacyBracketGraph(generatedBracket, gamesPerRound);
  const regularSeasonCompletionFingerprint = getRegularSeasonCompletionFingerprint(initial);
  bracket.regularSeasonCompletionFingerprint = regularSeasonCompletionFingerprint;
  const playInStartDate = TimeService.resolveSeasonEventDate(stats.year, stats, 'playInStart');
  const firstRoundStartDate = TimeService.resolveSeasonEventDate(stats.year, stats, 'playoffStart');
  let schedule = initial.schedule;
  const maxGid = Math.max(0, ...schedule.map(game => game.gid));
  if (bracket.playInGames.length > 0) {
    schedule = [...schedule, ...PlayoffGenerator.injectPlayInGames(bracket.playInGames, new Date(`${playInStartDate}T12:00:00Z`), maxGid)];
    bracket.gamesInjected = true;
  } else {
    const opening = bracket.series.filter(series => series.round === 1 && series.status === 'active');
    schedule = [...schedule, ...PlayoffGenerator.injectSeriesGames(opening, new Date(`${firstRoundStartDate}T12:00:00Z`), maxGid)];
    bracket.gamesInjected = true;
    bracket.round1Injected = true;
  }
  let state: GameState = {
    ...initial,
    schedule: schedule.sort((a, b) => TimeService.compare(a.date, b.date) || a.gid - b.gid),
    playoffs: { ...bracket, playInStartDate, firstRoundStartDate },
  };
  let lifecycle = resolveLeagueSeasonLifecycle(state);
  if (lifecycle.currentPhase === 'REGULAR_SEASON_ACTIVE') {
    const completed = transitionSeasonLifecycle(state, {
      league: lifecycle.mode,
      season: stats.year,
      from: 'REGULAR_SEASON_ACTIVE',
      to: 'REGULAR_SEASON_COMPLETE',
      atDate: state.date,
      evidence: { standingsFingerprint: fingerprint(state.teams.map(team => [team.id, team.wins, team.losses, team.tied])) },
    });
    if (completed.status !== 'rejected') state = { ...state, seasonLifecycle: completed.lifecycle };
  }
  lifecycle = resolveLeagueSeasonLifecycle(state);
  if (lifecycle.currentPhase === 'REGULAR_SEASON_COMPLETE') {
    const materialized = transitionSeasonLifecycle(state, {
      league: lifecycle.mode,
      season: stats.year,
      from: 'REGULAR_SEASON_COMPLETE',
      to: 'PLAYOFFS_MATERIALIZED',
      atDate: state.date,
      evidence: {
        bracketFingerprint: fingerprint({ nodes: bracket.nodes, byes: bracket.byes, series: bracket.series }),
        standingsFingerprint: regularSeasonCompletionFingerprint,
      },
    });
    if (materialized.status !== 'rejected') state = { ...state, seasonLifecycle: materialized.lifecycle };
  }
  return state;
}
