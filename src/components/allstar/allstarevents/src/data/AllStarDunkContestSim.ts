import {
  AllStarDunkContestSim as CoreAllStarDunkContestSim,
  APPROACH_CEILING_MOD,
  APPROACH_PROB_MOD,
  DELIVERY_CEILING_MOD,
  DELIVERY_PROB_MOD,
  INVALID_COMBOS,
  isValidCombo,
  LEGENDARY_COMBOS,
  LEGENDARY_STACKS,
  OBSTACLE_CEILING_MOD,
  OBSTACLE_PROB_MOD,
  TIERS,
  TOSS_TYPES,
} from '../../../../../services/allStar/AllStarDunkContestSim';

export {
  APPROACH_CEILING_MOD,
  APPROACH_PROB_MOD,
  DELIVERY_CEILING_MOD,
  DELIVERY_PROB_MOD,
  INVALID_COMBOS,
  isValidCombo,
  LEGENDARY_COMBOS,
  LEGENDARY_STACKS,
  OBSTACLE_CEILING_MOD,
  OBSTACLE_PROB_MOD,
  TIERS,
  TOSS_TYPES,
};

export type {
  ApproachType,
  DeliveryType,
  DunkAttempt,
  DunkComposition,
  DunkContestResult,
  DunkPlayer,
  ObstacleType,
  Play,
  PlayerRound,
} from '../../../../../services/allStar/AllStarDunkContestSim';

export interface NBAPlayer {
  name: string;
  nbaId?: string;
  imgURL?: string;
  pos: string;
  age: number;
  ratings: { dnk: number; jmp: number; spd: number }[];
  awards?: { season: number; type: string }[];
}

export const pick = <T>(items: T[]): T => items[~~(Math.random() * items.length)];

export class AllStarDunkContestSim {
  static buildIntroText(player: NBAPlayer, year: number): string {
    return CoreAllStarDunkContestSim.buildIntroText(player as any, year);
  }

  static simulate(contestants: NBAPlayer[]) {
    return CoreAllStarDunkContestSim.simulate(contestants as any);
  }

  static selectContestants(players: NBAPlayer[], num = 4) {
    return CoreAllStarDunkContestSim.selectContestants(players as any, num) as any;
  }
}
