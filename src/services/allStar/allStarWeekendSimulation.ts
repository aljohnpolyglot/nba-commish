import { GameResult, GameState } from '../../types';

interface WeekendSimulationHandlers {
  simulateCelebrityGame(state: GameState): Promise<Partial<GameState>>;
  simulateRisingStars(state: GameState): Promise<Partial<GameState>>;
  simulateRisingStarsBracket(state: GameState): Promise<Partial<GameState>>;
  simulateDunkContest(state: GameState): Partial<GameState>;
  simulateThreePointContest(state: GameState): Partial<GameState>;
  simulateShootingStars(state: GameState): Partial<GameState>;
  simulateSkillsChallenge(state: GameState): Partial<GameState>;
  simulateHorseTournament(state: GameState): Partial<GameState>;
  simulateThroneTournament(state: GameState): Partial<GameState>;
  simulateOneOnOneTournament(state: GameState): Partial<GameState>;
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

  const mergeBoxScores = (update: Partial<GameState>) => {
    if (!update.boxScores) return;
    const newBox = update.boxScores.filter((nb) => !accumulatedBoxScores.some((ab) => ab.gameId === nb.gameId));
    accumulatedBoxScores.push(...(newBox as GameResult[]));
  };

  if (isFriday) {
    const celebUpdate = await handlers.simulateCelebrityGame(currentState);
    mergeBoxScores(celebUpdate);
    currentState = { ...currentState, ...celebUpdate, boxScores: accumulatedBoxScores };

    const rsFormat = currentState.leagueStats.risingStarsFormat ?? '4team_tournament';
    const rsIsTournament = rsFormat === '4team_tournament' || rsFormat === 'random_4team';
    const rsUpdate = rsIsTournament
      ? await handlers.simulateRisingStarsBracket(currentState)
      : await handlers.simulateRisingStars(currentState);
    mergeBoxScores(rsUpdate);
    currentState = { ...currentState, ...rsUpdate, boxScores: accumulatedBoxScores };
  }

  if (isSaturday) {
    currentState = { ...currentState, ...handlers.simulateDunkContest(currentState) };
    currentState = { ...currentState, ...handlers.simulateThreePointContest(currentState) };
    currentState = { ...currentState, ...handlers.simulateShootingStars(currentState) };
    currentState = { ...currentState, ...handlers.simulateSkillsChallenge(currentState) };
    currentState = { ...currentState, ...handlers.simulateHorseTournament(currentState) };
    currentState = currentState.leagueStats.allStarThroneEnabled === true
      ? { ...currentState, ...handlers.simulateThroneTournament(currentState) }
      : { ...currentState, ...handlers.simulateOneOnOneTournament(currentState) };
  }

  if (isSunday) {
    const asgUpdate = await handlers.simulateAllStarBracket(currentState);
    mergeBoxScores(asgUpdate);
    currentState = { ...currentState, ...asgUpdate, boxScores: accumulatedBoxScores };
  }

  if (!currentState.allStar) return {};
  const weekendComplete =
    !!(currentState.allStar as any).bracket?.complete ||
    !!(currentState.allStar as any).risingStarsBracket?.complete ||
    currentState.allStar.allStarGameId !== undefined;

  return {
    schedule: currentState.schedule,
    boxScores: accumulatedBoxScores,
    allStar: {
      ...currentState.allStar,
      weekendComplete,
    },
  };
}
