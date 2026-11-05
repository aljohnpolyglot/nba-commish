import type { GameState } from '../../types';
import { getSimulationSeed } from '../saveIdentity';
import { normalizeDate } from '../../utils/helpers';

/**
 * Stable semantic identity for All-Star selections and event simulations.
 * Performance chunking, render order and wall-clock state are intentionally
 * absent. Optional parts should be persisted identities such as participant,
 * round or operation labels.
 */
export const buildAllStarEventSeed = (
  state: GameState,
  eventIdentity: string,
  ...semanticParts: Array<string | number | undefined>
): string => [
  getSimulationSeed(state),
  state.leagueStats.year,
  normalizeDate(state.date),
  state.leagueStats.uiMode ?? 'nba',
  eventIdentity,
  ...semanticParts.filter(part => part !== undefined),
].join(':');

/**
 * Contest fields are persisted snapshots, not live aliases into state.players.
 * JSON save/reload necessarily breaks object identity; doing so at ownership
 * time keeps uninterrupted and reloaded simulations semantically identical.
 */
export const snapshotAllStarParticipants = <T>(participants: T[]): T[] =>
  structuredClone(participants);
