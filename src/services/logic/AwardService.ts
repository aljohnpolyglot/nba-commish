import { NBAPlayer, NBATeam, NBAGMStat } from '../../types';

export interface AwardCandidate {
  player: NBAPlayer;
  team: NBATeam;
  score: number;
  odds: string;
  stats: NBAGMStat;
}

export interface AwardRaces {
  mvp: AwardCandidate[];
  dpoy: AwardCandidate[];
  roty: AwardCandidate[];
  smoy: AwardCandidate[];
  mip: AwardCandidate[];
}

const getTrb = (stat: any) => stat.trb || stat.reb || (stat.orb || 0) + (stat.drb || 0);

const getBestStat = (stats: NBAGMStat[] | undefined, season: number) => {
  if (!stats) return undefined;
  const seasonStats = stats.filter(s => s.season === season && !s.playoffs);
  if (seasonStats.length === 0) return undefined;
  return seasonStats.reduce((prev, current) => (prev.gp >= current.gp) ? prev : current);
};

export class AwardService {
  static calculateAwardRaces(players: NBAPlayer[], teams: NBATeam[], currentSeason: number = 2026): AwardRaces {
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

    return {
      mvp: this.assignOdds(mvpCandidates),
      dpoy: this.assignOdds(dpoyCandidates),
      roty: this.assignOdds(rotyCandidates),
      smoy: this.assignOdds(smoyCandidates),
      mip: this.assignOdds(mipCandidates),
    };
  }

  private static isEligible(stat: NBAGMStat, team: NBATeam): boolean {
    const teamGames = team.wins + team.losses;
    if (teamGames === 0) return stat.gp >= 5; // Early season fallback
    
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

        // MVP Formula: (PPG * 1.0 + RPG * 0.4 + APG * 0.5) * (WinPct * 2.0)
        const bpm = stat.bpm || 0;
        const ws = stat.ws || 0;
        const winFloor = 0.7; // soften punishment for bad teams
        let score = (ppg * 0.8 + rpg * 0.3 + apg * 0.4 + bpm * 1.5 + ws * 0.5) * (winFloor + winPct * 0.8);

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
    return players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || !this.isEligible(stat, team)) return null;

        const gp = stat.gp;
        const rpg = getTrb(stat) / gp;
        const spg = stat.stl / gp;
        const bpg = stat.blk / gp;
        const winPct = team.wins / (team.wins + team.losses || 1);

        // DPOY Formula: (RPG * 0.3 + SPG * 2.5 + BPG * 2.5) * (WinPct * 1.2)
        const dbpm = stat.dbpm || stat.bpm || 0;
        const drtg = stat.drtg || 110; // lower is better, 110 is avg
        const drtgBonus = (110 - drtg) * 0.02; // +0.02 per point below avg
        let score = (rpg * 0.3 + spg * 2.5 + bpg * 2.5 + dbpm * 1.2) * (0.8 + winPct * 0.4) + drtgBonus;

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
