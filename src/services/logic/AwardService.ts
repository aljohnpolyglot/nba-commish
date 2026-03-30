import { NBAPlayer, NBATeam, NBAGMStat, StaffData } from '../../types';

export interface AwardCandidate {
  player: NBAPlayer;
  team: NBATeam;
  score: number;
  odds: string;
  stats: NBAGMStat;
}

/** Coach of the Year candidate */
export interface CoachCandidate {
  coachName: string;
  team: NBATeam;
  score: number;
  odds: string;
  wins: number;
  losses: number;
  improvement: number; // wins above previous season
}

/** One spot on an All-NBA / All-Defense / All-Rookie team */
export interface AllNBASpot {
  player: NBAPlayer;
  team: NBATeam;
  pos: string;   // G | F | C
  score: number;
  stats: NBAGMStat;
}

/** All team selections for one season */
export interface AllNBATeams {
  allNBA: [AllNBASpot[], AllNBASpot[], AllNBASpot[]];         // 1st, 2nd, 3rd
  allDefense: [AllNBASpot[], AllNBASpot[]];                   // 1st, 2nd
  allRookie: [AllNBASpot[], AllNBASpot[]];                    // 1st, 2nd
}

export interface AwardRaces {
  mvp: AwardCandidate[];
  dpoy: AwardCandidate[];
  roty: AwardCandidate[];
  smoy: AwardCandidate[];
  mip: AwardCandidate[];
  coy: CoachCandidate[];
  allNBATeams: AllNBATeams;
}

const getTrb = (stat: any) => stat.trb || stat.reb || (stat.orb || 0) + (stat.drb || 0);

const getBestStat = (stats: NBAGMStat[] | undefined, season: number) => {
  if (!stats) return undefined;
  // Try current season first, fall back to previous season (handles day-1 where season stats don't exist yet)
  const trySeasons = [season, season - 1];
  for (const s of trySeasons) {
    const seasonStats = stats.filter(st => st.season === s && !st.playoffs);
    if (seasonStats.length > 0) {
      return seasonStats.reduce((prev, current) => (prev.gp >= current.gp) ? prev : current);
    }
  }
  return undefined;
};

export class AwardService {
  static calculateAwardRaces(
    players: NBAPlayer[],
    teams: NBATeam[],
    currentSeason: number = 2026,
    staff?: StaffData | null
  ): AwardRaces {
    // Determine the actual current season based on the data to avoid being "one year late"
    const maxSeason = players.reduce((max, p) => {
      const playerMax = p.stats?.reduce((m, s) => Math.max(m, s.season), 0) || 0;
      return Math.max(max, playerMax);
    }, currentSeason);

    const mvpCandidates = this.calculateMVP(players, teams, maxSeason);
    const dpoyCandidates = this.calculateDPOY(players, teams, maxSeason);
    const rotyCandidates = this.calculateROTY(players, teams, maxSeason);
    const smoyCandidates = this.calculate6MOY(players, teams, maxSeason);
    const mipCandidates = this.calculateMIP(players, teams, maxSeason);
    const coyCandidates = this.calculateCOY(teams, maxSeason, staff);
    const allNBATeams = this.calculateAllNBATeams(players, teams, maxSeason);

    return {
      mvp: this.assignOdds(mvpCandidates),
      dpoy: this.assignOdds(dpoyCandidates),
      roty: this.assignOdds(rotyCandidates),
      smoy: this.assignOdds(smoyCandidates),
      mip: this.assignOdds(mipCandidates),
      coy: this.assignCoachOdds(coyCandidates),
      allNBATeams,
    };
  }

  private static isEligible(stat: NBAGMStat, team: NBATeam): boolean {
    const teamGames = team.wins + team.losses;
    if (teamGames === 0) return stat.gp >= 1; // Day-1 fallback: show any player with prior season stats
    
    // NBA 65-game rule equivalent: (65/82) ratio of team games
    const threshold = teamGames * (65 / 82);
    return stat.gp >= threshold;
  }

  private static calculateMVP(players: NBAPlayer[], teams: NBATeam[], season: number): AwardCandidate[] {
    return players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || !this.isEligible(stat, team)) return null;

        const gp = stat.gp;
        const ppg = stat.pts / gp;
        const rpg = getTrb(stat) / gp;
        const apg = stat.ast / gp;
        const winPct = team.wins / (team.wins + team.losses || 1);

        // Minimum production floor — bench players can't win MVP
        if (ppg < 14) return null;

        const winFloor = 0.7;
        // bpm/ws removed — not sim-computed, raw BBGM values wildly distort ranking
        let score = (ppg * 1.2 + rpg * 0.5 + apg * 0.6) * (winFloor + winPct * 0.8);

        // Voter Fatigue: -2.5% per past MVP, max -7.5% (3 wins)
        const pastMVPs = p.awards?.filter(a => a.type === 'Most Valuable Player').length || 0;
        const fatigueMultiplier = Math.max(0.925, 1 - (pastMVPs * 0.025));
        score *= fatigueMultiplier;

        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((c): c is AwardCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  private static calculateDPOY(players: NBAPlayer[], teams: NBATeam[], season: number): AwardCandidate[] {
    const allSeasonStats = players.flatMap(p => p.stats?.filter(s => s.season === season && !s.playoffs) ?? []);
    const maxGP = Math.max(...allSeasonStats.map(s => s.gp || 0), 1);
    const seasonsStarted = maxGP > 10;
    const minGP = Math.max(10, Math.floor(maxGP * 0.3));
    const minMPG = 20;

    return players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || !this.isEligible(stat, team)) return null;

        if (seasonsStarted) {
          if (stat.gp < minGP) return null;
          if (stat.gp > 0 && stat.min / stat.gp < minMPG) return null;
        }

        const gp = stat.gp;
        const rpg = getTrb(stat) / gp;
        const spg = stat.stl / gp;
        const bpg = stat.blk / gp;
        const winPct = team.wins / (team.wins + team.losses || 1);

        // DPOY Formula — diq gates score so offensive stars (Luka/Jokić) can't sneak in
        const diqRating = (p.ratings?.[p.ratings.length - 1] as any)?.diq ?? 50;
        const defMultiplier = Math.max(0.4, diqRating / 70); // Wemby(85)→1.21, Jokić(50)→0.71, Luka(35)→0.5
        let score = (spg * 3.5 + bpg * 3.0 + rpg * 0.15) * (0.6 + winPct * 0.8) * defMultiplier;

        // Voter Fatigue: -2.5% per past DPOY, max -7.5%
        const pastDPOYs = p.awards?.filter(a => a.type === 'Defensive Player of the Year').length || 0;
        const fatigueMultiplier = Math.max(0.925, 1 - (pastDPOYs * 0.025));
        score *= fatigueMultiplier;

        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((c): c is AwardCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  private static calculateROTY(players: NBAPlayer[], teams: NBATeam[], season: number): AwardCandidate[] {
    return players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || !this.isEligible(stat, team)) return null;

        // Rookie Check: Draft year is the year before the current season
        const isRookie = p.draft?.year === season - 1;
        if (!isRookie) return null;

        const gp = stat.gp;
        const ppg = stat.pts / gp;
        const rpg = getTrb(stat) / gp;
        const apg = stat.ast / gp;

        const score = ppg * 1.0 + rpg * 0.5 + apg * 0.5;

        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((c): c is AwardCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  private static calculate6MOY(players: NBAPlayer[], teams: NBATeam[], season: number): AwardCandidate[] {
    return players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || !this.isEligible(stat, team)) return null;

        // 6MOY criteria: Must have started less than half their games
        if (stat.gs > stat.gp / 2) return null;

        const gp = stat.gp;
        const ppg = stat.pts / gp;
        const rpg = getTrb(stat) / gp;
        const apg = stat.ast / gp;

        const tsPct = stat.tsPct || 52; // 52% is roughly league avg
        const efficiencyBonus = (tsPct - 52) * 0.05;
        let score = ppg * 1.2 + rpg * 0.4 + apg * 0.4 + efficiencyBonus;

        // Voter Fatigue: -2.5% per past 6MOY, max -7.5%
        const past6MOYs = p.awards?.filter(a => a.type === 'Sixth Man of the Year').length || 0;
        const fatigueMultiplier = Math.max(0.925, 1 - (past6MOYs * 0.025));
        score *= fatigueMultiplier;

        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((c): c is AwardCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  private static calculateMIP(players: NBAPlayer[], teams: NBATeam[], season: number): AwardCandidate[] {
    return players
      .map(p => {
        const currentStat = getBestStat(p.stats, season);
        const prevStat = getBestStat(p.stats, season - 1);
        const team = teams.find(t => t.id === p.tid);
        
        if (!currentStat || !team || !this.isEligible(currentStat, team)) return null;
        
        // Condition: Never an All-Star
        const wasAllStar = p.awards?.some(a => a.type === 'All-Star');
        if (wasAllStar) return null;

        // Condition: Not a Rookie
        const isRookie = p.draft?.year === season - 1;
        if (isRookie) return null;

        // minimum production floor
        const currentGp = currentStat.gp || 1;
        const currentPpg = currentStat.pts / currentGp;
        const currentRpg = getTrb(currentStat) / currentGp;
        const currentApg = currentStat.ast / currentGp;
        if (currentPpg < 10 && (currentPpg + currentRpg + currentApg) < 20) return null;

        // Require a real prior season — no fabricated baseline
        if (!prevStat) return null;

        const getVal = (s: any) => {
          if (!s) return 0;
          const gp = s.gp || 1;
          const ppg = s.pts / gp;
          const rpg = getTrb(s) / gp;
          const apg = s.ast / gp;
          const stocks = (s.stl + s.blk) / gp;
          return ppg + (rpg * 2) + (apg * 2) + (stocks * 3);
        };

        const currentVal = getVal(currentStat);
        const prevVal = getVal(prevStat);

        const improvement = currentVal - prevVal;
        if (improvement <= 0) return null;

        const score = improvement;

        return { player: p, team, score, odds: '', stats: currentStat };
      })
      .filter((c): c is AwardCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  // ─── Coach of the Year ───────────────────────────────────────────────────────

  private static calculateCOY(teams: NBATeam[], season: number, staff?: StaffData | null): CoachCandidate[] {
    return teams
      .filter(t => t.id >= 0 && (t.wins + t.losses) >= 10)
      .map(t => {
        const wins = t.wins;
        const losses = t.losses;
        const winPct = wins / (wins + losses || 1);

        // Improvement vs previous season
        const prevSeason = t.seasons?.find(s => s.season === season - 1);
        const prevWins = prevSeason ? prevSeason.won : wins; // default to current if no history
        const improvement = wins - prevWins;

        // Score: win% drives base, improvement is the multiplier
        // A bad-record team with big improvement beats a coasting good-record team
        const score = winPct * 60 + Math.max(0, improvement) * 1.5 + Math.min(0, improvement) * 0.5;

        // Find coach name from staff data
        const coachEntry = staff?.coaches?.find(c => c.team === t.name || c.team === t.abbrev);
        const coachName = coachEntry?.name ?? `${t.name} Head Coach`;

        return { coachName, team: t, score, odds: '', wins, losses, improvement };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  // ─── All-NBA / All-Defense / All-Rookie Teams ────────────────────────────────

  /** Assign players to All-NBA-style teams using positional slots (2G, 2F, 1C). */
  private static calculateAllNBATeams(players: NBAPlayer[], teams: NBATeam[], season: number): AllNBATeams {
    const posGroup = (pos?: string): 'G' | 'F' | 'C' => {
      if (!pos) return 'F';
      const p = pos.toUpperCase();
      if (p.startsWith('C')) return 'C';
      if (p.includes('G')) return 'G';
      return 'F';
    };

    // Build scored pool (All-NBA: basically MVP-style scoring)
    const scoredPool = players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || stat.gp < 1) return null;
        const gp = Math.max(stat.gp, 1);
        const ppg = stat.pts / gp;
        const rpg = getTrb(stat) / gp;
        const apg = stat.ast / gp;
        const winPct = team.wins / (team.wins + team.losses || 1);
        const score = (ppg * 1.2 + rpg * 0.5 + apg * 0.6) * (0.7 + winPct * 0.6);
        const pg = posGroup(p.pos);
        return { player: p, team, score, stats: stat, pos: pg };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.score - a.score);

    // Defense pool (DPOY-style scoring)
    const defPool = players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || stat.gp < 1) return null;
        const gp = Math.max(stat.gp, 1);
        const spg = stat.stl / gp;
        const bpg = stat.blk / gp;
        const rpg = getTrb(stat) / gp;
        const diq = (p.ratings?.[p.ratings.length - 1] as any)?.diq ?? 50;
        const defMult = Math.max(0.4, diq / 70);
        const score = (spg * 3.5 + bpg * 3.0 + rpg * 0.15) * defMult;
        const pg = posGroup(p.pos);
        return { player: p, team, score, stats: stat, pos: pg };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.score - a.score);

    // Rookie pool
    const rookiePool = players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || !p.draft || p.draft.year !== season - 1 || stat.gp < 1) return null;
        const gp = Math.max(stat.gp, 1);
        const score = stat.pts / gp * 1.0 + getTrb(stat) / gp * 0.5 + stat.ast / gp * 0.5;
        const pg = posGroup(p.pos);
        return { player: p, team, score, stats: stat, pos: pg };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.score - a.score);

    const allNBAUsed = new Set<string>();
    const defUsed = new Set<string>();
    const rookieUsed = new Set<string>();

    return {
      allNBA: [
        this.pickTeam(scoredPool, [2, 2, 1], allNBAUsed),
        this.pickTeam(scoredPool, [2, 2, 1], allNBAUsed),
        this.pickTeam(scoredPool, [2, 2, 1], allNBAUsed),
      ],
      allDefense: [
        this.pickTeam(defPool, [2, 2, 1], defUsed),
        this.pickTeam(defPool, [2, 2, 1], defUsed),
      ],
      allRookie: [
        this.pickTeam(rookiePool, [2, 2, 1], rookieUsed),
        this.pickTeam(rookiePool, [2, 2, 1], rookieUsed),
      ],
    };
  }

  /**
   * Greedy pick from pool respecting positional slots [G, F, C counts].
   * `globalUsed` is shared across multiple calls so the same player never
   * appears on two different All-NBA teams.
   */
  private static pickTeam(pool: AllNBASpot[], slots: [number, number, number], globalUsed: Set<string>): AllNBASpot[] {
    const [gSlots, fSlots, cSlots] = slots;
    const needed: Record<string, number> = { G: gSlots, F: fSlots, C: cSlots };
    const filled: Record<string, number> = { G: 0, F: 0, C: 0 };
    const team: AllNBASpot[] = [];

    for (const spot of pool) {
      if (globalUsed.has(spot.player.internalId)) continue;
      const pos = spot.pos;
      if (filled[pos] < needed[pos]) {
        team.push(spot);
        filled[pos]++;
        globalUsed.add(spot.player.internalId);
        if (team.length === gSlots + fSlots + cSlots) break;
      }
    }
    return team;
  }

  private static assignCoachOdds(candidates: CoachCandidate[]): CoachCandidate[] {
    if (candidates.length === 0) return [];
    const maxScore = candidates[0].score;
    if (maxScore <= 0 || isNaN(maxScore)) return candidates;
    return candidates.map((c, i) => {
      let odds = '';
      if (i === 0) {
        odds = `-${Math.round(110 + (c.score / maxScore) * 40)}`;
      } else {
        const gap = maxScore / (c.score || 1);
        odds = `+${Math.round(100 + (gap - 1) * 2000)}`;
      }
      return { ...c, odds };
    });
  }

  private static assignOdds(candidates: AwardCandidate[]): AwardCandidate[] {
    if (candidates.length === 0) return [];

    const maxScore = candidates[0].score;
    if (maxScore <= 0 || isNaN(maxScore)) return candidates;
    
    return candidates.map((c, i) => {
      let odds = '';
      if (i === 0) {
        // Leader gets - odds
        const val = Math.round(110 + (c.score / maxScore) * 40);
        odds = `-${val}`;
      } else {
        // Others get + odds based on gap
        const gap = maxScore / (c.score || 1);
        const val = Math.round(100 + (gap - 1) * 2000);
        odds = `+${val}`;
      }
      return { ...c, odds };
    });
  }
}
