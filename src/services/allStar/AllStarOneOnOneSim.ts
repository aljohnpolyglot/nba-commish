import { NBAPlayer } from '../../types';

export interface OneOnOneMatch {
  p1Id: string;
  p1Name: string;
  p2Id: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  winnerId: string;
}

export interface OneOnOneRound {
  round: number;
  matches: OneOnOneMatch[];
}

export interface OneOnOneResult {
  bracket: OneOnOneRound[];
  winnerId: string;
  winnerName: string;
  log: string[];
}

const ratingOf = (p: NBAPlayer, key: 'fg' | 'tp' | 'ins' | 'spd' | 'stre' | 'diq'): number => {
  const r = p.ratings?.[p.ratings.length - 1] as any;
  return (r?.[key] ?? 50);
};

const offSkill = (p: NBAPlayer): number =>
  (ratingOf(p, 'fg') + ratingOf(p, 'tp') + ratingOf(p, 'ins') + ratingOf(p, 'spd')) / 4;
const defSkill = (p: NBAPlayer): number =>
  (ratingOf(p, 'stre') + ratingOf(p, 'diq') + ratingOf(p, 'spd')) / 3;

const playMatch = (p1: NBAPlayer, p2: NBAPlayer, log: string[]): OneOnOneMatch => {
  // First to 11, win-by-2, capped at 21. Each possession the offensive player
  // tries to score: success prob is offSkill / (offSkill + defOpp + 20).
  let s1 = 0, s2 = 0;
  let possessor = Math.random() < 0.5 ? 1 : 2; // ball check
  let safety = 0;
  while (safety++ < 80) {
    const off = possessor === 1 ? p1 : p2;
    const def = possessor === 1 ? p2 : p1;
    const prob = offSkill(off) / (offSkill(off) + defSkill(def) + 20);
    if (Math.random() < prob) {
      // Score 1 (most attempts) or 2 (3PT zone, ~22%)
      const pts = Math.random() < 0.22 ? 2 : 1;
      if (possessor === 1) s1 += pts; else s2 += pts;
      // Make-it-take-it: shooter retains possession.
    } else {
      possessor = possessor === 1 ? 2 : 1;
    }
    const target = 11;
    const gap = Math.abs(s1 - s2);
    if ((s1 >= target || s2 >= target) && gap >= 2) break;
    if (s1 >= 21 || s2 >= 21) break;
  }
  const winner = s1 > s2 ? p1 : p2;
  log.push(`${p1.name} vs ${p2.name}: ${s1}-${s2} → ${winner.name} advances.`);
  return {
    p1Id: p1.internalId, p1Name: p1.name,
    p2Id: p2.internalId, p2Name: p2.name,
    p1Score: s1, p2Score: s2,
    winnerId: winner.internalId,
  };
};

export class AllStarOneOnOneSim {
  static selectContestants(players: NBAPlayer[], season: number, n: number): NBAPlayer[] {
    const eligible = players.filter(p => p.stats?.some(s => s.season === season && !s.playoffs && (s.gp ?? 0) > 0));
    const shortlist = eligible
      .sort((a, b) => (offSkill(b) + defSkill(b)) - (offSkill(a) + defSkill(a)))
      .slice(0, Math.max(n * 2, n));
    for (let i = shortlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shortlist[i], shortlist[j]] = [shortlist[j], shortlist[i]];
    }
    const pow2 = 1 << Math.floor(Math.log2(Math.max(2, n)));
    return shortlist.slice(0, pow2);
  }

  static simulate(contestants: NBAPlayer[]): OneOnOneResult {
    const log: string[] = ['Welcome to the 1v1 Tournament!'];
    const bracket: OneOnOneRound[] = [];
    let active = [...contestants];
    let roundNum = 1;

    while (active.length > 1) {
      log.push(`--- ROUND ${roundNum} ---`);
      const matches: OneOnOneMatch[] = [];
      const next: NBAPlayer[] = [];
      for (let i = 0; i < active.length; i += 2) {
        const m = playMatch(active[i], active[i + 1], log);
        matches.push(m);
        next.push(m.winnerId === active[i].internalId ? active[i] : active[i + 1]);
      }
      bracket.push({ round: roundNum, matches });
      active = next;
      roundNum++;
    }

    const winner = active[0];
    log.push(`${winner.name} wins the 1v1 Tournament!`);
    return { bracket, winnerId: winner.internalId, winnerName: winner.name, log };
  }
}
