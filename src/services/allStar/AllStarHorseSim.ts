import { NBAPlayer } from '../../types';

export interface HorseMatch {
  p1Id: string;
  p1Name: string;
  p2Id: string;
  p2Name: string;
  winnerId: string;
}

export interface HorseRound {
  round: number;
  matches: HorseMatch[];
}

export interface HorseResult {
  bracket: HorseRound[];
  winnerId: string;
  winnerName: string;
  log: string[];
}

const ratingOf = (p: NBAPlayer, key: 'tp' | 'fg' | 'dnk' | 'spd'): number => {
  const r = p.ratings?.[p.ratings.length - 1] as any;
  return (r?.[key] ?? 50);
};

// Trick-shot prowess: weighted blend of shot-making + creativity (dunk for flair).
const horseSkill = (p: NBAPlayer): number =>
  ratingOf(p, 'tp') * 0.45 + ratingOf(p, 'fg') * 0.30 + ratingOf(p, 'dnk') * 0.25;

export class AllStarHorseSim {
  static selectContestants(players: NBAPlayer[], season: number, n: number): NBAPlayer[] {
    const eligible = players.filter(p => p.stats?.some(s => s.season === season && !s.playoffs && (s.gp ?? 0) > 0));
    // Shuffle a top-skill shortlist so it's not always the same lineup.
    const shortlist = eligible.sort((a, b) => horseSkill(b) - horseSkill(a)).slice(0, Math.max(n * 2, n));
    for (let i = shortlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shortlist[i], shortlist[j]] = [shortlist[j], shortlist[i]];
    }
    // Pad to next power of 2 by dropping the tail rather than padding byes.
    const pow2 = 1 << Math.floor(Math.log2(Math.max(2, n)));
    return shortlist.slice(0, pow2);
  }

  static simulate(contestants: NBAPlayer[]): HorseResult {
    const log: string[] = ['Welcome to the HORSE Tournament!'];
    const bracket: HorseRound[] = [];
    let active = [...contestants];
    let roundNum = 1;

    while (active.length > 1) {
      log.push(`--- ROUND ${roundNum} ---`);
      const matches: HorseMatch[] = [];
      const next: NBAPlayer[] = [];
      for (let i = 0; i < active.length; i += 2) {
        const p1 = active[i];
        const p2 = active[i + 1];
        const s1 = horseSkill(p1) + Math.random() * 18;
        const s2 = horseSkill(p2) + Math.random() * 18;
        const winner = s1 >= s2 ? p1 : p2;
        const loser = winner === p1 ? p2 : p1;
        log.push(`${p1.name} vs ${p2.name} → ${winner.name} spells "${'HORSE'.slice(0, Math.min(5, 3 + Math.floor(Math.random() * 3)))}" on ${loser.name}.`);
        matches.push({
          p1Id: p1.internalId, p1Name: p1.name,
          p2Id: p2.internalId, p2Name: p2.name,
          winnerId: winner.internalId,
        });
        next.push(winner);
      }
      bracket.push({ round: roundNum, matches });
      active = next;
      roundNum++;
    }

    const winner = active[0];
    log.push(`${winner.name} wins the HORSE Tournament!`);
    return { bracket, winnerId: winner.internalId, winnerName: winner.name, log };
  }
}
