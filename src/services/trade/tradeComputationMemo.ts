import type { NBAPlayer } from '../../types';

export interface TradeComputationMemo {
  playerValues: Map<string, number>;
  pickValues: Map<string, number>;
  eligibility: Map<string, boolean>;
  rosterEligibility: WeakMap<NBAPlayer[], Map<string, boolean>>;
}

export function createTradeComputationMemo(): TradeComputationMemo {
  return {
    playerValues: new Map(),
    pickValues: new Map(),
    eligibility: new Map(),
    rosterEligibility: new WeakMap(),
  };
}
