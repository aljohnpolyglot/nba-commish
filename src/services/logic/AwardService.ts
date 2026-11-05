import { NBAPlayer, NBATeam, NBAGMStat, StaffData } from '../../types';
import { resolveHeadCoachName } from '../staff/coachNameResolver';
import { isRookieForSeason } from '../awards/eligibility';
import type { UIMode } from '../awards/types';
import { getCalibratedEwa, getCalibratedPer } from '../../utils/advancedStatCalibration';
import {
  type AllNBASpot,
  type AllNBATeams,
  type AwardCandidate,
  type AwardRaces,
  type CoachCandidate,
  assignCoachOdds,
  assignOdds,
  getBestStat,
  getDpoyScore,
  getExactStat,
  getLeagueDefensiveRating,
  getMipScore,
  getTrb,
  wasAllStarBeforeSeason,
} from './AwardServiceShared';
export type {
  AllNBASpot,
  AllNBATeams,
  AwardCandidate,
  AwardRaces,
  CoachCandidate,
} from './AwardServiceShared';

export class AwardService {
  // Configurable minimum-games threshold (default: NBA 65-game rule)
  private static minGamesTarget = 65;

  private static getTradeMVPStat(stats: NBAGMStat[] | undefined, season: number): NBAGMStat | undefined {
    if (!stats?.length) return undefined;
    const regular = stats.filter(stat => !stat.playoffs);
    if (regular.length === 0) return undefined;
    const atOrBefore = regular.filter(stat => stat.season <= season);
    const pool = atOrBefore.length > 0 ? atOrBefore : regular;
    return pool.sort((a, b) => {
      if (b.season !== a.season) return b.season - a.season;
      return (b.gp ?? 0) - (a.gp ?? 0);
    })[0];
  }

  static calculateAwardRaces(
    players: NBAPlayer[],
    teams: NBATeam[],
    currentSeason: number = 2026,
    staff?: StaffData | null,
    minGamesRequirement?: number,
    candidateLimit: number = 10,
    uiMode: UIMode = 'nba',
  ): AwardRaces {
    // Apply commissioner-set minimum-games requirement
    this.minGamesTarget = minGamesRequirement ?? 65;

    const limit = Number.isFinite(candidateLimit)
      ? Math.max(1, Math.trunc(candidateLimit))
      : Math.max(players.length, teams.length, 1);
    const mvpCandidates = this.calculateMVP(players, teams, currentSeason, limit);
    const defensiveCandidates = this.calculateDPOY(players, teams, currentSeason, players.length);
    const dpoyCandidates = defensiveCandidates.slice(0, limit);
    const rotyCandidates = this.calculateROTY(players, teams, currentSeason, limit, uiMode);
    const smoyCandidates = this.calculate6MOY(players, teams, currentSeason, limit);
    const mipCandidates = this.calculateMIP(players, teams, currentSeason, limit, uiMode);
    const coyCandidates = this.calculateCOY(teams, currentSeason, staff, limit);
    const allNBATeams = this.calculateAllNBATeams(players, teams, currentSeason, uiMode, defensiveCandidates);

    return {
      mvp: assignOdds(mvpCandidates),
      dpoy: assignOdds(dpoyCandidates),
      roty: assignOdds(rotyCandidates),
      smoy: assignOdds(smoyCandidates),
      mip: assignOdds(mipCandidates),
      coy: assignCoachOdds(coyCandidates),
      allNBATeams,
    };
  }

  private static isEligible(stat: NBAGMStat, team: NBATeam, checkInjuryException = false): boolean {
    const teamGames = team.wins + team.losses;
    if (teamGames === 0) return stat.gp >= 1; // Day-1 fallback: show any player with prior season stats

    const fullSeasonGames = 82;
    const targetGames = this.minGamesTarget; // commissioner-configurable (default: 65)

    if (teamGames >= fullSeasonGames) {
      // Full season: hard minimum-games floor (real NBA rule)
      const meetsHard = stat.gp >= targetGames;
      // Season-ending injury exception (real NBA rule): ≥ targetGames-3 games with active injury still qualifies
      if (!meetsHard && checkInjuryException && stat.gp >= Math.max(targetGames - 3, 1)) return true;
      return meetsHard;
    }

    // Mid-season: proportional threshold so candidates appear throughout the season
    const threshold = teamGames * (targetGames / fullSeasonGames);
    return stat.gp >= threshold;
  }

  /**
   * Top-N MVP candidates for trade-value use. Mirrors calculateMVP scoring but
   * skips the 65-game eligibility gate (we want a stable star ranking from day 1)
   * and returns a configurable number of candidates (default 30).
   * Used by the trade engine to flag franchise-altering MVP-tier players so they
   * get the "this guy doesn't move for fair value" premium.
   */
  static calculateMVPRankings(
    players: NBAPlayer[],
    teams: NBATeam[],
    season?: number,
    limit: number = 30,
  ): AwardCandidate[] {
    const baseSeason = season ?? new Date().getFullYear();
    const maxSeason = players.reduce((max, p) => {
      const playerMax = p.stats?.reduce((m, s) => Math.max(m, s.season), 0) || 0;
      return Math.max(max, playerMax);
    }, baseSeason);

    return players
      .map(p => {
        const stat = this.getTradeMVPStat(p.stats, maxSeason);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || (stat.gp ?? 0) < 1) return null;
        const gp = stat.gp;
        const ppg = stat.pts / gp;
        const rpg = getTrb(stat) / gp;
        const apg = stat.ast / gp;
        if (ppg < 14) return null; // bench warmers can't be in the MVP top-30

        const liveGames = team.wins + team.losses;
        const winPct = liveGames > 0 ? team.wins / liveGames : 0.5;
        const teamMultiplier = liveGames > 0 ? (0.7 + winPct * 0.8) : 1.0;
        const ewa = getCalibratedEwa(stat);
        const ws = Number(stat.ws ?? ((stat.ows ?? 0) + (stat.dws ?? 0)));
        const per = getCalibratedPer(stat) || 15;
        let score =
          (ewa * 5.0) +
          (ws * 4.0) +
          (per * 0.8) +
          (ppg * 1.1) +
          (rpg * 0.35) +
          (apg * 0.45);
        score *= teamMultiplier;

        const pastMVPs = p.awards?.filter(a => a.type === 'Most Valuable Player').length || 0;
        score *= Math.max(0.925, 1 - (pastMVPs * 0.025));

        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((c): c is AwardCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private static calculateMVP(players: NBAPlayer[], teams: NBATeam[], season: number, limit: number): AwardCandidate[] {
    return players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        // Injury exception applies: 62+ games with active injury counts for MVP
        const hasInjury = !!(p.injury && p.injury.gamesRemaining > 0);
        if (!stat || !team || !this.isEligible(stat, team, hasInjury)) return null;

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
      .slice(0, limit);
  }

  private static calculateDPOY(players: NBAPlayer[], teams: NBATeam[], season: number, limit: number): AwardCandidate[] {
    const allSeasonStats = players.flatMap(p => p.stats?.filter(s => s.season === season && !s.playoffs) ?? []);
    const maxGP = Math.max(...allSeasonStats.map(s => s.gp || 0), 1);
    const seasonsStarted = maxGP > 10;
    const minGP = Math.max(10, Math.floor(maxGP * 0.3));
    const minMPG = 20;
    const leagueDrtg = getLeagueDefensiveRating(players, season);

    return players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        const hasInjury = !!(p.injury && p.injury.gamesRemaining > 0);
        if (!stat || !team || !this.isEligible(stat, team, hasInjury)) return null;

        if (seasonsStarted) {
          if (stat.gp < minGP) return null;
          if (stat.gp > 0 && stat.min / stat.gp < minMPG) return null;
        }

        const winPct = team.wins / (team.wins + team.losses || 1);

        // DPOY Formula — diq gates score so offensive stars (Luka/Jokić) can't sneak in
        const diqRating = (p.ratings?.[p.ratings.length - 1] as any)?.diq ?? 50;
        let score = getDpoyScore(stat, diqRating, winPct, leagueDrtg);

        // Voter Fatigue: -2.5% per past DPOY, max -7.5%
        const pastDPOYs = p.awards?.filter(a => a.type === 'Defensive Player of the Year').length || 0;
        const fatigueMultiplier = Math.max(0.925, 1 - (pastDPOYs * 0.025));
        score *= fatigueMultiplier;

        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((c): c is AwardCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private static calculateROTY(players: NBAPlayer[], teams: NBATeam[], season: number, limit: number, uiMode: UIMode): AwardCandidate[] {
    return players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || stat.gp < 1) return null;

        const isRookie = isRookieForSeason(p, season, uiMode);
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
      .slice(0, limit);
  }

  private static calculate6MOY(players: NBAPlayer[], teams: NBATeam[], season: number, limit: number): AwardCandidate[] {
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
      .slice(0, limit);
  }

  private static calculateMIP(players: NBAPlayer[], teams: NBATeam[], season: number, limit: number, uiMode: UIMode): AwardCandidate[] {
    return players
      .map(p => {
        const currentStat = getBestStat(p.stats, season);
        const prevStat = getExactStat(p.stats, season - 1);
        const team = teams.find(t => t.id === p.tid);
        
        if (!currentStat || !team || !this.isEligible(currentStat, team)) return null;
        
        // A current-season selection must not erase the improvement that earned it.
        if (wasAllStarBeforeSeason(p, season)) return null;

        // Condition: Not a Rookie
        const isRookie = isRookieForSeason(p, season, uiMode);
        if (isRookie) return null;

        // minimum production floor
        const currentGp = currentStat.gp || 1;
        const currentPpg = currentStat.pts / currentGp;
        const currentRpg = getTrb(currentStat) / currentGp;
        const currentApg = currentStat.ast / currentGp;
        if (currentPpg < 10 && (currentPpg + currentRpg + currentApg) < 20) return null;

        // Require a real prior season — no fabricated baseline
        if (!prevStat) return null;

        const score = getMipScore(currentStat, prevStat);
        if (score == null) return null;

        return { player: p, team, score, odds: '', stats: currentStat };
      })
      .filter((c): c is AwardCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ─── Coach of the Year ───────────────────────────────────────────────────────

  private static calculateCOY(teams: NBATeam[], season: number, staff: StaffData | null | undefined, limit: number): CoachCandidate[] {
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

        const coachName = resolveHeadCoachName(t, staff, season);

        return { coachName, team: t, score, odds: '', wins, losses, improvement };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ─── All-NBA / All-Defense / All-Rookie Teams ────────────────────────────────

  /** Assign players to All-NBA-style teams using positional slots (2G, 2F, 1C). */
  private static calculateAllNBATeams(players: NBAPlayer[], teams: NBATeam[], season: number, uiMode: UIMode, defensiveCandidates: AwardCandidate[]): AllNBATeams {
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

    const defPool = defensiveCandidates.map(candidate => ({
      player: candidate.player,
      team: candidate.team,
      score: candidate.score,
      stats: candidate.stats,
      pos: posGroup(candidate.player.pos),
    }));

    // Rookie pool
    const rookiePool = players
      .map(p => {
        const stat = getBestStat(p.stats, season);
        const team = teams.find(t => t.id === p.tid);
        if (!stat || !team || !isRookieForSeason(p, season, uiMode) || stat.gp < 1) return null;
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
    const targetSize = gSlots + fSlots + cSlots;
    if (team.length < targetSize) {
      for (const spot of pool) {
        if (globalUsed.has(spot.player.internalId)) continue;
        team.push(spot);
        globalUsed.add(spot.player.internalId);
        if (team.length === targetSize) break;
      }
    }
    return team;
  }
}
