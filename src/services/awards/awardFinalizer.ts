import type { GameState } from '../../types';
import { announce, getEnabledAwards, hasAwardResolutionEvidence } from './AwardEngine';

export interface AwardFinalizationResult {
  state: GameState;
  finalizedAwardKeys: string[];
  unresolvedAwardKeys: string[];
}

/** The scheduled announcer and championship fallback share this idempotent writer. */
export function finalizeEnabledAwards(initial: GameState): AwardFinalizationResult {
  let state = initial;
  const finalizedAwardKeys: string[] = [];
  const unresolvedAwardKeys: string[] = [];
  for (const award of getEnabledAwards(state)) {
    if (award.calculatorId !== 'postseason') {
      const patch = announce(state, award.id);
      if (Object.keys(patch).length > 0) state = { ...state, ...patch } as GameState;
    }
    if (hasAwardResolutionEvidence(state, award.id)) finalizedAwardKeys.push(award.id);
    else unresolvedAwardKeys.push(award.id);
  }
  return { state, finalizedAwardKeys, unresolvedAwardKeys };
}
