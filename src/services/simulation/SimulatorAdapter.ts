import { NBATeam as Team, NBAPlayer as Player } from '../../types';
import { GameResult } from './StatGenerator';
import { SimulatorKnobs, KNOBS_DEFAULT } from './SimulatorKnobs';
import { SettingsManager } from '../SettingsManager';

export type SimulatorMode = 'realistic' | 'fast';

export const getSimulatorMode = (): SimulatorMode => {
  return SettingsManager.getSettings().simulatorMode ?? 'realistic';
};

export interface SimulateGameArgs {
  homeTeam: Team;
  awayTeam: Team;
  players: Player[];
  gameId: number;
  date: string;
  playerApproval?: number;
  homeOverridePlayers?: Player[];
  awayOverridePlayers?: Player[];
  isAllStar?: boolean;
  isRisingStars?: boolean;
  isEliminationGame?: boolean;
  riggedForTid?: number;
  homeKnobs?: SimulatorKnobs;
  awayKnobs?: SimulatorKnobs;
}

export type FastSimRunner = (args: SimulateGameArgs) => GameResult;

let realisticRunner: FastSimRunner | null = null;

export const registerRealisticRunner = (runner: FastSimRunner) => {
  realisticRunner = runner;
};

export const simulateGameViaAdapter = (args: SimulateGameArgs, fastRunner: FastSimRunner): GameResult => {
  const homeFormat = args.homeKnobs?.gameFormat;
  const awayFormat = args.awayKnobs?.gameFormat;
  if (
    homeFormat === 'target_score' ||
    awayFormat === 'target_score' ||
    homeFormat === 'elam_ending' ||
    awayFormat === 'elam_ending' ||
    args.homeKnobs?.overtimeType === 'target_score' ||
    args.awayKnobs?.overtimeType === 'target_score'
  ) {
    return fastRunner(args);
  }
  const mode = getSimulatorMode();
  if (mode === 'realistic' && realisticRunner) {
    try {
      return realisticRunner(args);
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[SimulatorAdapter] realistic engine failed, falling back to fast:', err);
      }
      return fastRunner(args);
    }
  }
  return fastRunner(args);
};
