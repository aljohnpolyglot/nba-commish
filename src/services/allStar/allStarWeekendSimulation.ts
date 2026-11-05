import { GameResult, GameState } from '../../types';
import {
  isAllStarGameEnabled,
  isCelebrityGameEnabled,
  isDanceContestEnabled,
  isDunkContestEnabled,
  isRisingStarsEnabled,
  isShootingStarsEnabled,
  isSkillsChallengeEnabled,
  isThreePointContestEnabled,
} from './allStarEventAvailability';
import { yieldLongSimControl } from '../simulation/longSimCoordinator';
import { withDeterministicRandom } from '../simulation/deterministicRandom';
import { buildAllStarEventSeed } from './allStarDeterminism';
import { getAllStarWeekendCompletion } from './allStarCompletion';

interface WeekendSimulationHandlers {
  simulateCelebrityGame(state: GameState): Promise<Partial<GameState>>;
  simulateRisingStars(state: GameState): Promise<Partial<GameState>>;
  simulateRisingStarsBracket(state: GameState): Promise<Partial<GameState>>;
  simulateDanceContest(state: GameState): Partial<GameState>;
  simulateDunkContest(state: GameState): Partial<GameState>;
  simulateThreePointContest(state: GameState): Partial<GameState>;
  simulateShootingStars(state: GameState): Partial<GameState>;
  simulateSkillsChallenge(state: GameState): Partial<GameState>;
  simulateHorseTournament(state: GameState): Partial<GameState>;
  simulateThroneTournament(state: GameState): Partial<GameState>;
  simulateAllStarBracket(state: GameState): Promise<Partial<GameState>>;
}

export async function simulateWeekendCore(
  state: GameState,
  simFlags: { friday: boolean; saturday: boolean; sunday: boolean } | undefined,
  handlers: WeekendSimulationHandlers,
): Promise<Partial<GameState>> {
  if (!state.allStar) return {};

  let currentState = { ...state };
  let accumulatedBoxScores = [...(state.boxScores || [])];
  const isFriday = simFlags ? simFlags.friday : true;
  const isSaturday = simFlags ? simFlags.saturday : true;
  const isSunday = simFlags ? simFlags.sunday : true;
  const runSeeded = <T>(eventIdentity: string, run: () => T): T =>
    withDeterministicRandom(buildAllStarEventSeed(currentState, eventIdentity), run);
  const boxScoreKey = (box: GameResult) => {
    const date = String((box as any).date ?? '').slice(0, 10);
    return `${box.gameId}-${box.season ?? date}`;
  };

  const mergeBoxScores = (update: Partial<GameState>) => {
    if (!update.boxScores) return;
    const seen = new Set(accumulatedBoxScores.map(boxScoreKey));
    const newBox: GameResult[] = [];
    for (const nb of update.boxScores) {
      const key = boxScoreKey(nb);
      if (seen.has(key)) continue;
      seen.add(key);
      newBox.push(nb);
    }
    accumulatedBoxScores.push(...(newBox as GameResult[]));
  };

  if (isFriday) {
    if (isCelebrityGameEnabled(currentState.leagueStats)) {
      const celebUpdate = await handlers.simulateCelebrityGame(currentState);
      mergeBoxScores(celebUpdate);
      currentState = { ...currentState, ...celebUpdate, boxScores: accumulatedBoxScores };
      await yieldLongSimControl();
    }

    if (isRisingStarsEnabled(currentState.leagueStats)) {
      const rsFormat = currentState.leagueStats.risingStarsFormat ?? '4team_tournament';
      const rsIsTournament = rsFormat === '4team_tournament' || rsFormat === 'random_4team';
      const rsUpdate = rsIsTournament
        ? await handlers.simulateRisingStarsBracket(currentState)
        : await handlers.simulateRisingStars(currentState);
      mergeBoxScores(rsUpdate);
      currentState = { ...currentState, ...rsUpdate, boxScores: accumulatedBoxScores };
      await yieldLongSimControl();
    }
  }

  if (isSaturday) {
    if (isDunkContestEnabled(currentState.leagueStats)) {
      currentState = { ...currentState, ...runSeeded('allstar-dunk-contest', () => handlers.simulateDunkContest(currentState)) };
      await yieldLongSimControl();
    }
    if (isThreePointContestEnabled(currentState.leagueStats)) {
      currentState = { ...currentState, ...runSeeded('allstar-three-point-contest', () => handlers.simulateThreePointContest(currentState)) };
      await yieldLongSimControl();
    }
    if (isShootingStarsEnabled(currentState.leagueStats)) {
      currentState = { ...currentState, ...runSeeded('allstar-shooting-stars', () => handlers.simulateShootingStars(currentState)) };
      await yieldLongSimControl();
    }
    if (isSkillsChallengeEnabled(currentState.leagueStats)) {
      currentState = { ...currentState, ...runSeeded('allstar-skills-challenge', () => handlers.simulateSkillsChallenge(currentState)) };
      await yieldLongSimControl();
    }
    if (currentState.leagueStats.allStarHorse === true) {
      currentState = { ...currentState, ...runSeeded('allstar-horse-tournament', () => handlers.simulateHorseTournament(currentState)) };
      await yieldLongSimControl();
    }
    if (currentState.leagueStats.allStarThroneEnabled === true) {
      currentState = { ...currentState, ...runSeeded('allstar-throne-tournament', () => handlers.simulateThroneTournament(currentState)) };
      await yieldLongSimControl();
    }
  }

  if (isSunday && isAllStarGameEnabled(currentState.leagueStats)) {
    if (isDanceContestEnabled(currentState.leagueStats)) {
      currentState = { ...currentState, ...runSeeded('allstar-dance-contest', () => handlers.simulateDanceContest(currentState)) };
      await yieldLongSimControl();
    }
    const asgUpdate = await handlers.simulateAllStarBracket(currentState);
    mergeBoxScores(asgUpdate);
    currentState = { ...currentState, ...asgUpdate, boxScores: accumulatedBoxScores };
    await yieldLongSimControl();
  }

  if (!currentState.allStar) return {};
  const completion = getAllStarWeekendCompletion(currentState);

  return {
    schedule: currentState.schedule,
    boxScores: accumulatedBoxScores,
    allStar: {
      ...currentState.allStar,
      weekendComplete: completion.resultsComplete,
    },
  };
}
