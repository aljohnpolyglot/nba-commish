import { registerRealisticRunner, SimulateGameArgs } from '../SimulatorAdapter';
import { simulateGameRealistic } from './RealisticEngine';
import { GameResult } from '../types';

let registered = false;

export function ensureRealisticRegistered() {
  if (registered) return;
  registered = true;
  registerRealisticRunner((args: SimulateGameArgs): GameResult => {
    try {
      return simulateGameRealistic(args);
    } catch (err) {
      // If the realistic engine cannot run (e.g. insufficient rotation), surface
      // the error so the adapter falls back to fast.
      throw err;
    }
  });
}

ensureRealisticRegistered();
