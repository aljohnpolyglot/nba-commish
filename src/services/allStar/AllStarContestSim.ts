import { NBAPlayer, GameState } from '../../types';

export interface ContestResult {
  contestants: any[];
  winnerName: string;
  winnerId: string;
  complete: boolean;
}

export class AllStarContestSim {
  static simulateDunkContest(players: NBAPlayer[], season: number): ContestResult {
    // Select 4 high-flying contestants
    const eligible = players
      .filter(p => p.status === 'Active' && p.tid >= 0)
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
      .slice(0, 50); // Top 50 players
    
    // Pick 4 based on "dunk" factor (using overall rating as proxy for now, or random from top)
    const contestants = eligible
      .sort(() => Math.random() - 0.5)
      .slice(0, 4)
      .map(p => ({
        playerId: p.internalId,
        playerName: p.name,
        position: p.pos,
        round1Score: 0,
        round2Score: null as number | null,
        isWinner: false,
        dunkTypes: [] as string[]
      }));

    const dunkTypes = [
      "360 Windmill", "Between the Legs", "Double Clutch Reverse", 
      "Free Throw Line", "Honey Dip", "Behind the Back", 
      "720 Dunk", "Jump over Mascot", "Off the Backboard"
    ];

    // Round 1
    contestants.forEach(c => {
      c.round1Score = 40 + Math.floor(Math.random() * 11);
      c.dunkTypes.push(dunkTypes[Math.floor(Math.random() * dunkTypes.length)]);
    });

    // Top 2 to finals
    const finalists = [...contestants].sort((a, b) => b.round1Score - a.round1Score).slice(0, 2);
    
    // Round 2
    finalists.forEach(c => {
      const contestant = contestants.find(con => con.playerId === c.playerId)!;
      contestant.round2Score = 42 + Math.floor(Math.random() * 9);
      contestant.dunkTypes.push(dunkTypes[Math.floor(Math.random() * dunkTypes.length)]);
    });

    const winner = finalists.sort((a, b) => (b.round2Score ?? 0) - (a.round2Score ?? 0))[0];
    const winningContestant = contestants.find(c => c.playerId === winner.playerId)!;
    winningContestant.isWinner = true;

    return {
      contestants,
      winnerName: winningContestant.playerName,
      winnerId: winningContestant.playerId,
      complete: true
    };
  }

  static simulateThreePointContest(players: NBAPlayer[], season: number): ContestResult {
    // Select 8 top shooters
    const eligible = players
      .filter(p => p.status === 'Active' && p.tid >= 0)
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
      .slice(0, 100);
    
    const contestants = eligible
      .sort(() => Math.random() - 0.5)
      .slice(0, 8)
      .map(p => ({
        playerId: p.internalId,
        playerName: p.name,
        round1Score: 0,
        finalScore: null as number | null,
        isWinner: false
      }));

    // Round 1
    contestants.forEach(c => {
      c.round1Score = 15 + Math.floor(Math.random() * 12);
    });

    // Top 3 to finals
    const finalists = [...contestants].sort((a, b) => b.round1Score - a.round1Score).slice(0, 3);
    
    // Final Round
    finalists.forEach(c => {
      const contestant = contestants.find(con => con.playerId === c.playerId)!;
      contestant.finalScore = 18 + Math.floor(Math.random() * 10);
    });

    const winner = finalists.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0))[0];
    const winningContestant = contestants.find(c => c.playerId === winner.playerId)!;
    winningContestant.isWinner = true;

    return {
      contestants,
      winnerName: winningContestant.playerName,
      winnerId: winningContestant.playerId,
      complete: true
    };
  }
}
