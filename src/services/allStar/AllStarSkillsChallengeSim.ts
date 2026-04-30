import { NBAPlayer } from '../../types';

export interface SkillsChallengeEntry {
  playerId: string;
  playerName: string;
  round1Time: number;
  finalTime: number | null;
  isWinner: boolean;
}

export interface SkillsChallengeResult {
  contestants: SkillsChallengeEntry[];
  winnerId: string;
  winnerName: string;
  log: string[];
}

const ratingOf = (p: NBAPlayer, key: 'spd' | 'tp' | 'pss' | 'drb'): number => {
  const r = p.ratings?.[p.ratings.length - 1] as any;
  return (r?.[key] ?? 50);
};

const skillScore = (p: NBAPlayer): number =>
  // Obstacle course rewards speed, dribbling, passing, mid-range/3PT shooting equally.
  (ratingOf(p, 'spd') + ratingOf(p, 'drb') + ratingOf(p, 'pss') + ratingOf(p, 'tp')) / 4;

export class AllStarSkillsChallengeSim {
  static selectContestants(players: NBAPlayer[], season: number, totalPlayers: number): NBAPlayer[] {
    const eligible = players.filter(p => p.stats?.some(s => s.season === season && !s.playoffs && (s.gp ?? 0) > 0));
    return eligible.sort((a, b) => skillScore(b) - skillScore(a)).slice(0, totalPlayers);
  }

  static simulate(contestants: NBAPlayer[]): SkillsChallengeResult {
    const log: string[] = ['Welcome to the Skills Challenge!', '--- ROUND 1 ---'];
    const courseTime = (p: NBAPlayer): number => {
      const skill = skillScore(p);
      // Course base ~38s, scales down to ~24s for elite skill (95+).
      const base = 38 - (skill - 50) * 0.25;
      const noise = 0.92 + Math.random() * 0.18;
      return Math.round(base * noise * 10) / 10;
    };

    const round1: SkillsChallengeEntry[] = contestants.map(p => {
      const t = courseTime(p);
      log.push(`${p.name} finishes the course in ${t}s.`);
      return { playerId: p.internalId, playerName: p.name, round1Time: t, finalTime: null, isWinner: false };
    });

    // Top 2 advance to head-to-head final.
    const finalists = [...round1].sort((a, b) => a.round1Time - b.round1Time).slice(0, 2);
    log.push(`--- FINAL: ${finalists.map(f => f.playerName).join(' vs ')} ---`);

    const finalEntries = finalists.map(f => {
      const player = contestants.find(p => p.internalId === f.playerId)!;
      const finalTime = courseTime(player);
      log.push(`${f.playerName} runs the final in ${finalTime}s.`);
      return { ...f, finalTime };
    });

    finalEntries.sort((a, b) => (a.finalTime ?? 99) - (b.finalTime ?? 99));
    const winner = finalEntries[0];
    log.push(`${winner.playerName} wins the Skills Challenge with a final time of ${winner.finalTime}s!`);

    // Merge final results back into round1 entries.
    const merged = round1.map(r => {
      const fe = finalEntries.find(f => f.playerId === r.playerId);
      if (!fe) return r;
      return { ...r, finalTime: fe.finalTime, isWinner: fe.playerId === winner.playerId };
    });

    return { contestants: merged, winnerId: winner.playerId, winnerName: winner.playerName, log };
  }
}
