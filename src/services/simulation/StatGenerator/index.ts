import { generateStatsForTeam } from './initial';
import { generateCoordinatedStats } from './coordinated';
import { generateAdvancedStats, generateTeamAdvancedStats } from './advancedstats';

export class StatGenerator {
  static generateStatsForTeam = generateStatsForTeam;
  static generateCoordinatedStats = generateCoordinatedStats;
  static generateAdvancedStats = generateAdvancedStats;
  static generateTeamAdvancedStats = generateTeamAdvancedStats;
}

export * from '../types';
