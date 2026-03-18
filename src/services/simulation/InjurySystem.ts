import { NBAPlayer, NBATeam } from '../../types';
import { INJURIES } from '../../data/injuries';

export interface PlayerInjuryEvent {
  playerId: string;
  playerName: string;
  teamId: number;
  injuryType: string;
  gamesRemaining: number;
}

export class InjurySystem {
  private static cumSums: number[] = [];
  private static totalFrequency: number = 0;

  private static init() {
    if (this.cumSums.length === 0) {
      let sum = 0;
      for (const injury of INJURIES) {
        sum += injury.frequency;
        this.cumSums.push(sum);
      }
      this.totalFrequency = sum;
    }
  }

  private static getRandomInjury(healthLevel: number = 0): { type: string; gamesRemaining: number } {
    this.init();
    const rand = Math.random() * this.totalFrequency;
    let index = this.cumSums.findIndex((cs) => cs >= rand);
    if (index === -1) index = INJURIES.length - 1;

    const injury = INJURIES[index];
    
    // Randomize games remaining between 0.25x and 1.75x of base
    const multiplier = 0.25 + Math.random() * 1.5;
    const gamesRemaining = Math.max(1, Math.round((1 + healthLevel) * multiplier * injury.games));

    return {
      type: injury.name,
      gamesRemaining
    };
  }

  public static getSabotageGames(baseGames: number): number {
    // Sabotage is more precise than natural injury, so tighter fluctuation
    const fluctuation = 0.8 + Math.random() * 0.4; // 80% to 120%
    return Math.max(1, Math.round(baseGames * fluctuation));
  }

  public static checkInjuries(
    players: NBAPlayer[], 
    homeTeam: NBATeam, 
    awayTeam: NBATeam
  ): PlayerInjuryEvent[] {
    const events: PlayerInjuryEvent[] = [];
    
    // Base injury rate per game per player (approximate)
    // In an 82 game season, maybe a player gets injured 1-2 times.
    // So per game rate is around 0.015.
    const BASE_INJURY_RATE = 0.015;

    for (const player of players) {
      // Skip already injured players
      if (player.injury && player.injury.gamesRemaining > 0) continue;

      let injuryRate = BASE_INJURY_RATE;

      // Factor 1: Age
      const age = player.age || 26;
      injuryRate *= Math.pow(1.03, Math.min(50, age) - 26);

      // Factor 2: Mood Traits (e.g., 'W' for winning, might play through minor injuries or be more resilient)
      // We don't have moodTraits in NBAPlayer type directly, but if it exists in ratings or we can simulate it.
      // Let's assume we can check if they are a star player, maybe they rest more against bad teams.
      
      // Factor 3: Opponent Strength (Tanking teams / Load Management)
      const playerTeam = player.tid === homeTeam.id ? homeTeam : awayTeam;
      const opponentTeam = player.tid === homeTeam.id ? awayTeam : homeTeam;
      
      // If opponent is weak (< 85 strength), star players might "rest" (simulated as a 1-game injury/rest)
      if (opponentTeam.strength < 85 && player.overallRating > 85) {
        // 5% chance to rest against weak teams
        if (Math.random() < 0.05) {
          events.push({
            playerId: player.internalId,
            playerName: player.name,
            teamId: player.tid,
            injuryType: "Load Management",
            gamesRemaining: 1
          });
          continue;
        }
      }

      // Roll for actual injury
      if (Math.random() < injuryRate) {
        const injury = this.getRandomInjury();
        events.push({
          playerId: player.internalId,
          playerName: player.name,
          teamId: player.tid,
          injuryType: injury.type,
          gamesRemaining: injury.gamesRemaining
        });
      }
    }

    return events;
  }
}
