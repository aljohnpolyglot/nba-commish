import {
  getPeriodDurationSeconds,
  getPeriodLabel,
  getPeriodStartSeconds,
  type GameTimingConfig,
} from '../../../../utils/gameClock';
import type { GameHeaveEvent } from '../../types';
import type { PlayerPool, Possession, TeamId } from './possessionTypes';

function getPlayersById(
  possessions: Possession[],
  homePool: PlayerPool[],
  awayPool: PlayerPool[],
): Map<string, PlayerPool> {
  const players = new Map([...homePool, ...awayPool].map(player => [player.id, player]));
  for (const possession of possessions) {
    for (const player of [
      possession.scorer,
      possession.assister,
      possession.passPlayer,
      possession.blocker,
      possession.rebounder,
      possession.handler,
      possession.stealer,
      possession.fouler,
      possession.victim,
    ]) {
      if (player) players.set(player.id, player);
    }
  }
  return players;
}

export function stampHeaveCommentary(
  possessions: Possession[],
  events: GameHeaveEvent[],
  homeTeamId: number,
  awayTeamId: number,
  timingConfig: GameTimingConfig,
  homePool: PlayerPool[],
  awayPool: PlayerPool[],
): void {
  if (events.length === 0) return;
  const playersById = getPlayersById(possessions, homePool, awayPool);

  for (const event of events) {
    const team: TeamId | undefined = event.teamId === homeTeamId
      ? 'HOME'
      : event.teamId === awayTeamId
        ? 'AWAY'
        : undefined;
    if (!team) continue;

    const scorer = playersById.get(event.playerId);
    if (!scorer) continue;
    const possession: Possession | undefined = event.protectedFromIndividualStats
      ? {
          id: possessions.reduce((maximum, candidate) => Math.max(maximum, candidate.id), 0) + 1,
          team,
          outcome: 'MISS_3_DRB' as const,
          quarter: event.quarter,
          pts: 0,
          scorer,
          is3: true,
          period: getPeriodLabel(event.quarter, timingConfig.numQuarters),
        }
      : [...possessions].reverse().find(candidate =>
          candidate.quarter === event.quarter
          && candidate.team === team
          && !candidate.basketInterference
          && candidate.scorer?.id === event.playerId
          && (event.made
            ? candidate.outcome === 'MADE_3'
            : candidate.outcome.startsWith('MISS_')),
        );
    if (!possession) continue;

    possession.is3 = true;
    possession.is4 = false;
    possession.isHeave = true;
    possession.heaveProtected = event.protectedFromIndividualStats;
    possession.heaveDistanceFeet = event.distanceFeet;
    const possessionIndex = possessions.indexOf(possession);
    if (possessionIndex >= 0) {
      possessions.splice(possessionIndex, 1);
      let lastQuarterIndex = -1;
      for (let index = possessions.length - 1; index >= 0; index--) {
        if (possessions[index].quarter === event.quarter) {
          lastQuarterIndex = index;
          break;
        }
      }
      possessions.splice(lastQuarterIndex + 1, 0, possession);
    } else {
      const nextQuarterIndex = possessions.findIndex(candidate => candidate.quarter > event.quarter);
      possessions.splice(nextQuarterIndex < 0 ? possessions.length : nextQuarterIndex, 0, possession);
    }
    const secondsLeft = Math.floor(Math.random() * 3);
    possession.clock = `0:0${secondsLeft}`;
    possession.gs = getPeriodStartSeconds(event.quarter, timingConfig)
      + getPeriodDurationSeconds(event.quarter, timingConfig)
      - secondsLeft
      - 0.1;
  }
}
