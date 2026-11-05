import { NBAPlayer, AllStarPlayer } from '../../types';
import { isCurrentNbaPlayer } from './allStarSelectionHelpers';

export interface ThreePointContestResult {
  round1: { playerId: string; playerName: string; score: number }[];
  finals: { playerId: string; playerName: string; score: number }[];
  winnerId: string;
  winnerName: string;
  log: string[];
}

const EXCLUDED_FROM_THREE_CONTEST = ['Stephen Curry', 'Klay Thompson'];

export class AllStarThreePointContestSim {
  static selectContestants(players: NBAPlayer[], season: number, numContestants: number = 8): NBAPlayer[] {
    const eligible = players.filter(p =>
      isCurrentNbaPlayer(p) && !EXCLUDED_FROM_THREE_CONTEST.includes(p.name)
    );
    const selectionStats = new Map(eligible.map(player => {
      const stat = player.stats
        ?.filter(row => !row.playoffs && Number(row.season) <= season && Number(row.gp ?? 0) > 0)
        .sort((left, right) => Number(right.season) - Number(left.season))[0];
      return [player.internalId, stat] as const;
    }));
    const score = (player: NBAPlayer) => {
      const stat = selectionStats.get(player.internalId);
      const gp = Math.max(1, Number(stat?.gp ?? 0));
      const attemptsPerGame = Number(stat?.tpa ?? 0) / gp;
      const percentage = Number(stat?.tpa ?? 0) > 0
        ? Number(stat?.tp ?? 0) / Number(stat?.tpa)
        : 0;
      const threeRating = Number(player.ratings?.[player.ratings.length - 1]?.tp ?? 0);
      return attemptsPerGame * 20 + percentage * 100 + threeRating / 10;
    };
    const primary = eligible.filter(player => {
      const stat = selectionStats.get(player.internalId);
      if (!stat) return false;
      const gp = Math.max(1, Number(stat.gp ?? 0));
      return Number(stat.tpa ?? 0) / gp >= 3.5;
    }).sort((left, right) => score(right) - score(left));
    const primaryIds = new Set(primary.map(player => player.internalId));
    const fallback = eligible
      .filter(player => !primaryIds.has(player.internalId))
      .sort((left, right) => score(right) - score(left));

    return [...primary, ...fallback].slice(0, numContestants);
  }

  static simulate(contestants: NBAPlayer[], season: number): ThreePointContestResult {
    const log: string[] = [];
    const round1: { playerId: string; playerName: string; score: number }[] = [];
    const finals: { playerId: string; playerName: string; score: number }[] = [];

    log.push("Welcome to the 3-Point Contest!");
    
    // Round 1
    log.push("--- ROUND 1 ---");
    for (const player of contestants) {
      const score = this.simulateShootout(player, season, log);
      round1.push({
        playerId: player.internalId,
        playerName: player.name,
        score
      });
      log.push(`Round 1 score for ${player.name}: ${score}/30`);
    }

    // Top 3 advance
    const finalists = [...round1].sort((a, b) => b.score - a.score).slice(0, 3);
    log.push(`Advancing to the finals: ${finalists.map(f => f.playerName).join(', ')}!`);

    // Finals
    log.push("--- FINALS ---");
    for (const finalist of finalists.reverse()) { // Lowest score goes first
      const player = contestants.find(p => p.internalId === finalist.playerId)!;
      const score = this.simulateShootout(player, season, log);
      finals.push({
        playerId: player.internalId,
        playerName: player.name,
        score
      });
      log.push(`Finals score for ${player.name}: ${score}/30`);
    }

    const winner = [...finals].sort((a, b) => b.score - a.score)[0];
    log.push(`The winner of the 3-Point Contest is ${winner.playerName} with a final score of ${winner.score}!`);

    return {
      round1,
      finals,
      winnerId: winner.playerId,
      winnerName: winner.playerName,
      log
    };
  }

  private static simulateShootout(player: NBAPlayer, season: number, log: string[]): number {
    const stat = player.stats?.find(s => s.season === season && !s.playoffs);
    let prob = stat && stat.tpa > 0 ? stat.tp / stat.tpa : 0.35;

    // Apply badge bonuses
    const badges = player.badges || [];
    if (badges.includes('Limitless Range HOF')) prob += 0.06;
    else if (badges.includes('Limitless Range Gold')) prob += 0.04;
    else if (badges.includes('Limitless Range Silver')) prob += 0.02;
    
    if (badges.some(b => b.startsWith('Deadeye'))) prob += 0.02;

    prob = Math.min(0.72, prob); // Cap probability at 0.72

    let totalScore = 0;
    
    for (let rack = 1; rack <= 5; rack++) {
      let rackLog = `${player.name} steps up to rack ${rack}... `;
      let rackScore = 0;
      const isMoneyRack = rack === 5;

      for (let ball = 1; ball <= 5; ball++) {
        const isMoneyBall = isMoneyRack || ball === 5;
        const points = isMoneyBall ? 2 : 1;
        
        if (Math.random() < prob) {
          rackScore += points;
          totalScore += points;
          if (isMoneyBall) rackLog += "Money ball... GOOD! ";
          else rackLog += "Make! ";
        } else {
          if (isMoneyBall) rackLog += "Money ball... missed. ";
          else rackLog += "Miss. ";
        }
      }
      log.push(rackLog.trim());
    }

    return totalScore;
  }
}
