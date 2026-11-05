/**
 * EuroAwardService — race & winner calculator for Euroleague + Liga ACB
 * (Endesa) individual awards. Kept separate from NBA AwardService.ts so
 * Euro rules can evolve independently (Rising Star age cap, PIR scoring,
 * etc.) without leaking into the NBA path.
 *
 * Real-world award structure (2024-25 onwards):
 *
 *   EUROLEAGUE
 *   - Regular Season MVP        — strictly regular-season weighted score
 *   - Best Defender Trophy      — steals/blocks/rebounds + def IQ
 *   - Rising Star Award         — under-23 standout
 *   - Alphonso Ford Top Scorer  — pure PPG leader
 *   - Alexander Gomelskiy COY   — wins improvement + record
 *   - All-EuroLeague 1st/2nd Team
 *   - Final Four MVP            — assigned post-playoffs (see euroAwardAnnouncer)
 *
 *   LIGA ACB (Endesa)
 *   - Regular Season MVP
 *   - Finals MVP                — assigned post-playoffs
 *   - Best Young Player         — under-22
 *   - Best Coach
 *   - Top Scorer / Rebound / Assist Leader (per-game)
 *   - PIR Leader (Performance Index Rating)
 *
 * PIR formula (FIBA standard):
 *   PIR = (Pts + Reb + Ast + Stl + Blk + FoulsDrawn)
 *       − (MissedFG + MissedFT + Turnovers + ShotsRejected + Fouls)
 *
 * We approximate FoulsDrawn ≈ FTA × 0.4 (real-life ratio), ShotsRejected
 * is dropped (we don't track), Fouls = personal fouls.
 */
import type { NBAPlayer, NBATeam, NBAGMStat, StaffData, NonNBATeam } from '../../types';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { resolveHeadCoachMember, resolveHeadCoachName } from '../staff/coachNameResolver';
import { getStaffImageUrl, resolveStaffImageId } from '../../utils/staffPortrait';
import { getCanonicalEuroStatCompetitionId } from '../euro/statsArchive';
import { didHomeTeamWin } from '../../utils/gameOutcome';

export interface EuroAwardCandidate {
  player: NBAPlayer;
  team: NBATeam;
  score: number;
  odds: string;
  stats: NBAGMStat;
}

export interface EuroCoachCandidate {
  coachName: string;
  role?: 'coach' | 'executive';
  portraitUrl?: string;
  face?: unknown;
  team: NBATeam;
  score: number;
  odds: string;
  wins: number;
  losses: number;
  improvement: number;
}

export interface EuroAllTeamSpot {
  player: NBAPlayer;
  team: NBATeam;
  score: number;
  stats: NBAGMStat;
  pos: string;
}

export interface EuroleagueAwardRaces {
  mvp: EuroAwardCandidate[];
  defender: EuroAwardCandidate[];
  risingStar: EuroAwardCandidate[];
  topScorer: EuroAwardCandidate[];
  coy: EuroCoachCandidate[];
  allEuroLeague: [EuroAllTeamSpot[], EuroAllTeamSpot[]]; // 1st, 2nd
}

export interface EndesaAwardRaces {
  mvp: EuroAwardCandidate[];
  defender: EuroAwardCandidate[];
  sixthMan: EuroAwardCandidate[];
  mostImproved: EuroAwardCandidate[];
  bestYoungPlayer: EuroAwardCandidate[];
  bestFive: [EuroAllTeamSpot[], EuroAllTeamSpot[]];
  topScorer: EuroAwardCandidate[];
  topRebounder: EuroAwardCandidate[];
  topAssister: EuroAwardCandidate[];
  pirLeader: EuroAwardCandidate[];
  offensivePlayer: EuroAwardCandidate[];
  efficiencyPlayer: EuroAwardCandidate[];
  spectacularPlayer: EuroAwardCandidate[];
  popularPlayer: EuroAwardCandidate[];
  bestCoach: EuroCoachCandidate[];
}

type CompetitionBoxScore = {
  competitionId?: string;
  competitionPhase?: string;
  season?: number;
  date?: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const getTrb = (s: any) => s.trb || s.reb || (s.orb || 0) + (s.drb || 0);
const bestStat = (stats: NBAGMStat[] | undefined, season: number, tidHint?: number): NBAGMStat | undefined => {
  if (!stats) return undefined;
  const filtered = stats.filter(st => st.season === season && !st.playoffs);
  if (filtered.length === 0) return undefined;
  const currentTeamRows = tidHint != null ? filtered.filter(st => st.tid === tidHint) : [];
  const pool = currentTeamRows.length > 0 ? currentTeamRows : filtered;
  return pool.reduce((p, c) => (p.gp >= c.gp ? p : c));
};

const computePIR = (s: NBAGMStat): number => {
  const gp = s.gp || 1;
  const fgMissed = ((s.fga ?? 0) - (s.fg ?? 0));
  const ftMissed = ((s.fta ?? 0) - (s.ft ?? 0));
  const foulsDrawn = (s.fta ?? 0) * 0.4;
  const pir = (s.pts + getTrb(s) + s.ast + s.stl + s.blk + foulsDrawn)
            - (fgMissed + ftMissed + (s.tov ?? 0) + (s.pf ?? 0));
  return pir / gp;
};

const playerAge = (p: NBAPlayer, season: number): number => {
  const born = (p as any).born?.year;
  if (born && season) return season - born;
  return (p as any).age ?? 25;
};

const PLAYER_AWARD_HISTORY = (p: NBAPlayer, type: string): number =>
  p.awards?.filter(a => a.type === type).length ?? 0;

// Eligibility: a player counts toward Euro races only if they're on a club
// that participates in at least one of the active competitions (Endesa or
// Euroleague). Pure-NBA players are ignored.
const isEuroPlayer = (p: NBAPlayer, euroTeamIds: Set<number>): boolean =>
  euroTeamIds.has(p.tid);

// Minimum games gate — proportional to current team games to avoid empty
// leaderboards on day 1.
const isEligible = (s: NBAGMStat, team: NBATeam, minPerSeason: number): boolean => {
  const teamGames = team.wins + team.losses;
  if (teamGames === 0) return s.gp >= 1;
  const fullSeasonRef = 34; // Liga ACB regular season length
  const threshold = teamGames >= fullSeasonRef
    ? minPerSeason
    : teamGames * (minPerSeason / fullSeasonRef);
  return s.gp >= threshold;
};

// ─── EuroAwardService ───────────────────────────────────────────────────────

export class EuroAwardService {
  /** Min regular-season games to qualify for major awards (configurable). */
  private static MIN_GAMES = 20;

  static setMinGames(min: number) { this.MIN_GAMES = min; }

  /** Build a Set of all NBA-team-ids that play the given competition. We use
   *  state.teams' tid range as proxy: Endesa tids ≥ 5000 < 6000, EL tids
   *  ≥ 1000 < 2000. Helps narrow the player pool. */
  static getCompetitionTeamIds(
    teams: NBATeam[],
    nonNBATeams: NonNBATeam[],
    competitionId: 'euroleague' | 'endesa',
  ): Set<number> {
    const ids = new Set<number>();
    // Real Madrid + Barcelona are merged into Endesa tids via clubAliasMap;
    // their Endesa tids show up as state.teams entries when they're the user
    // GM's club. For the rest, walk nonNBATeams.
    for (const t of nonNBATeams ?? []) {
      const id = t.tid;
      if (competitionId === 'endesa' && id >= 5000 && id < 6000 && t.endesaRelegated !== true) ids.add(id);
      if (competitionId === 'euroleague' && id >= 1000 && id < 2000) ids.add(id);
    }
    // Merged dual-league clubs: their tids land in state.teams under 5xxx.
    for (const t of teams) {
      const id = t.id;
      if (competitionId === 'endesa' && id >= 5000 && id < 6000) ids.add(id);
      if (competitionId === 'euroleague' && id >= 5000 && id < 6000) ids.add(id); // EL-eligible via merge
    }
    return ids;
  }

  // ─── EUROLEAGUE ──────────────────────────────────────────────────────────

  static calculateEuroleagueRaces(
    players: NBAPlayer[],
    teams: NBATeam[],
    nonNBATeams: NonNBATeam[],
    season: number,
    staff?: StaffData | null,
    minGamesOverride?: number,
    boxScores: CompetitionBoxScore[] = [],
    participantTids?: Set<number>,
  ): EuroleagueAwardRaces {
    this.MIN_GAMES = minGamesOverride ?? 20;
    const euroIds = participantTids?.size
      ? participantTids
      : this.getCompetitionTeamIds(teams, nonNBATeams, 'euroleague');
    const competitionTeams = this.buildCompetitionTeamMap('euroleague', euroIds, teams, nonNBATeams, season, boxScores);
    const competitionPlayers = this.scopePlayersToCompetition(players, 'euroleague');

    return {
      mvp: this.calcEuroMVP(competitionPlayers, competitionTeams, euroIds, season),
      defender: this.calcEuroDefender(competitionPlayers, competitionTeams, euroIds, season),
      risingStar: this.calcEuroRisingStar(competitionPlayers, competitionTeams, euroIds, season),
      topScorer: this.calcEuroTopScorer(competitionPlayers, competitionTeams, euroIds, season),
      coy: this.calcEuroCOY(competitionTeams, euroIds, season, staff),
      allEuroLeague: this.calcAllEuroLeague(competitionPlayers, competitionTeams, euroIds, season),
    };
  }

  // ─── LIGA ACB (ENDESA) ───────────────────────────────────────────────────

  static calculateEndesaRaces(
    players: NBAPlayer[],
    teams: NBATeam[],
    nonNBATeams: NonNBATeam[],
    season: number,
    staff?: StaffData | null,
    minGamesOverride?: number,
    boxScores: CompetitionBoxScore[] = [],
  ): EndesaAwardRaces {
    const endesaIds = this.getCompetitionTeamIds(teams, nonNBATeams, 'endesa');
    return this.calculateDomesticRaces(
      players,
      teams,
      nonNBATeams,
      season,
      'endesa',
      endesaIds,
      staff,
      minGamesOverride,
      boxScores,
    );
  }

  static calculateDomesticRaces(
    players: NBAPlayer[],
    teams: NBATeam[],
    nonNBATeams: NonNBATeam[],
    season: number,
    competitionId: string,
    competitionIds: Set<number>,
    staff?: StaffData | null,
    minGamesOverride?: number,
    boxScores: CompetitionBoxScore[] = [],
  ): EndesaAwardRaces {
    this.MIN_GAMES = minGamesOverride ?? 20;
    const competitionTeams = this.buildCompetitionTeamMap(competitionId, competitionIds, teams, nonNBATeams, season, boxScores);
    const competitionPlayers = this.scopePlayersToCompetition(players, competitionId);

    return {
      mvp: this.calcEndesaMVP(competitionPlayers, competitionTeams, competitionIds, season),
      defender: this.calcEuroDefender(competitionPlayers, competitionTeams, competitionIds, season),
      sixthMan: this.calcSixthMan(competitionPlayers, competitionTeams, competitionIds, season),
      mostImproved: this.calcMostImproved(competitionPlayers, competitionTeams, competitionIds, season),
      bestYoungPlayer: this.calcBestYoungPlayer(competitionPlayers, competitionTeams, competitionIds, season),
      bestFive: this.calcAllEuroLeague(competitionPlayers, competitionTeams, competitionIds, season),
      topScorer: this.calcTopScorer(competitionPlayers, competitionTeams, competitionIds, season),
      topRebounder: this.calcTopRebounder(competitionPlayers, competitionTeams, competitionIds, season),
      topAssister: this.calcTopAssister(competitionPlayers, competitionTeams, competitionIds, season),
      pirLeader: this.calcPIRLeader(competitionPlayers, competitionTeams, competitionIds, season),
      offensivePlayer: this.calcOffensivePlayer(competitionPlayers, competitionTeams, competitionIds, season),
      efficiencyPlayer: this.calcEfficiencyPlayer(competitionPlayers, competitionTeams, competitionIds, season),
      spectacularPlayer: this.calcSpectacularPlayer(competitionPlayers, competitionTeams, competitionIds, season),
      popularPlayer: this.calcPopularPlayer(competitionPlayers, competitionTeams, competitionIds, season),
      bestCoach: this.calcBestCoach(competitionTeams, competitionIds, season, staff),
    };
  }

  // ─── Internal calculators ────────────────────────────────────────────────

  private static calcEuroMVP(players: NBAPlayer[], teams: NBATeam[], euroIds: Set<number>, season: number): EuroAwardCandidate[] {
    return players
      .filter(p => isEuroPlayer(p, euroIds))
      .map(p => {
        const stat = bestStat(p.stats, season, p.tid);
        const team = teams.find(t => t.id === p.tid) ?? this.buildStubTeam(p.tid);
        if (!stat || !isEligible(stat, team, this.MIN_GAMES)) return null;
        const gp = stat.gp;
        const ppg = stat.pts / gp;
        const rpg = getTrb(stat) / gp;
        const apg = stat.ast / gp;
        if (ppg < 10) return null;
        const winPct = team.wins / (team.wins + team.losses || 1);
        const pir = computePIR(stat);
        let score = (ppg * 1.0 + rpg * 0.5 + apg * 0.6 + pir * 0.4) * (0.7 + winPct * 0.8);
        score *= Math.max(0.9, 1 - PLAYER_AWARD_HISTORY(p, 'Euroleague MVP') * 0.03);
        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((x): x is EuroAwardCandidate => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((c, i, arr) => ({ ...c, odds: this.assignOdds(c, i, arr) }));
  }

  private static calcEuroDefender(players: NBAPlayer[], teams: NBATeam[], euroIds: Set<number>, season: number): EuroAwardCandidate[] {
    return players
      .filter(p => isEuroPlayer(p, euroIds))
      .map(p => {
        const stat = bestStat(p.stats, season, p.tid);
        const team = teams.find(t => t.id === p.tid) ?? this.buildStubTeam(p.tid);
        if (!stat || !isEligible(stat, team, this.MIN_GAMES)) return null;
        const gp = stat.gp;
        const spg = stat.stl / gp;
        const bpg = stat.blk / gp;
        const rpg = getTrb(stat) / gp;
        const diq = (p.ratings?.[p.ratings.length - 1] as any)?.diq ?? 50;
        const defMult = Math.max(0.4, diq / 70);
        const winPct = team.wins / (team.wins + team.losses || 1);
        let score = (spg * 3.5 + bpg * 3.0 + rpg * 0.2) * (0.6 + winPct * 0.7) * defMult;
        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((x): x is EuroAwardCandidate => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((c, i, arr) => ({ ...c, odds: this.assignOdds(c, i, arr) }));
  }

  /** Rising Star: under-23 + ≥1 EL season; awarded based on overall production. */
  private static calcEuroRisingStar(players: NBAPlayer[], teams: NBATeam[], euroIds: Set<number>, season: number): EuroAwardCandidate[] {
    return players
      .filter(p => isEuroPlayer(p, euroIds) && playerAge(p, season) < 23)
      .map(p => {
        const stat = bestStat(p.stats, season, p.tid);
        const team = teams.find(t => t.id === p.tid) ?? this.buildStubTeam(p.tid);
        if (!stat || !isEligible(stat, team, Math.max(1, Math.ceil(this.MIN_GAMES / 2)))) return null;
        const gp = stat.gp;
        const score = (stat.pts / gp) * 1.0 + (getTrb(stat) / gp) * 0.4 + (stat.ast / gp) * 0.4 + computePIR(stat) * 0.3;
        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((x): x is EuroAwardCandidate => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((c, i, arr) => ({ ...c, odds: this.assignOdds(c, i, arr) }));
  }

  /** Alphonso Ford — pure PPG leader. */
  private static calcEuroTopScorer(players: NBAPlayer[], teams: NBATeam[], euroIds: Set<number>, season: number): EuroAwardCandidate[] {
    return this.calcTopPerGame(players, teams, euroIds, season, s => s.pts / (s.gp || 1));
  }

  private static calcEuroCOY(teams: NBATeam[], euroIds: Set<number>, season: number, staff?: StaffData | null): EuroCoachCandidate[] {
    return this.calcCoachRace(teams, euroIds, season, staff);
  }

  /** Two 5-man teams. Position diversity not enforced — Euro voting is more
   *  flexible than NBA. We just pick the top 10 score and slot into 1st/2nd. */
  private static calcAllEuroLeague(players: NBAPlayer[], teams: NBATeam[], euroIds: Set<number>, season: number): [EuroAllTeamSpot[], EuroAllTeamSpot[]] {
    const scored = players
      .filter(p => isEuroPlayer(p, euroIds))
      .map(p => {
        const stat = bestStat(p.stats, season, p.tid);
        const team = teams.find(t => t.id === p.tid) ?? this.buildStubTeam(p.tid);
        if (!stat || !isEligible(stat, team, this.MIN_GAMES)) return null;
        const gp = stat.gp;
        const score = (stat.pts / gp) * 1.0 + (getTrb(stat) / gp) * 0.5 + (stat.ast / gp) * 0.6 + computePIR(stat) * 0.4;
        const pos = (p.ratings?.[p.ratings.length - 1] as any)?.pos ?? p.pos ?? 'F';
        return { player: p, team, score, stats: stat, pos } as EuroAllTeamSpot;
      })
      .filter((x): x is EuroAllTeamSpot => x !== null)
      .sort((a, b) => b.score - a.score);
    return [scored.slice(0, 5), scored.slice(5, 10)];
  }

  // ─── Endesa-specific calcs ───────────────────────────────────────────────

  private static calcEndesaMVP(players: NBAPlayer[], teams: NBATeam[], endesaIds: Set<number>, season: number): EuroAwardCandidate[] {
    return this.calcMVPLike(players, teams, endesaIds, season, 'Liga ACB MVP');
  }

  /** Best Young Player — under-22 (Jean Montero rule). */
  private static calcBestYoungPlayer(players: NBAPlayer[], teams: NBATeam[], endesaIds: Set<number>, season: number): EuroAwardCandidate[] {
    return players
      .filter(p => isEuroPlayer(p, endesaIds) && playerAge(p, season) < 22)
      .map(p => {
        const stat = bestStat(p.stats, season, p.tid);
        const team = teams.find(t => t.id === p.tid) ?? this.buildStubTeam(p.tid);
        if (!stat || !isEligible(stat, team, Math.max(1, Math.ceil(this.MIN_GAMES / 2)))) return null;
        const gp = stat.gp;
        const score = (stat.pts / gp) * 1.0 + (getTrb(stat) / gp) * 0.4 + (stat.ast / gp) * 0.4 + computePIR(stat) * 0.3;
        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((x): x is EuroAwardCandidate => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((c, i, arr) => ({ ...c, odds: this.assignOdds(c, i, arr) }));
  }

  private static calcSixthMan(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number): EuroAwardCandidate[] {
    return this.rankPlayers(players, teams, ids, season, (player, stat) => {
      if ((stat.gs ?? 0) > stat.gp / 2) return null;
      return computePIR(stat) + (stat.pts / (stat.gp || 1)) * 0.6;
    });
  }

  private static calcMostImproved(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number): EuroAwardCandidate[] {
    return this.rankPlayers(players, teams, ids, season, (player, stat) => {
      const previous = bestStat(player.stats, season - 1);
      if (!previous?.gp) return null;
      const currentValue = computePIR(stat) + (stat.pts / (stat.gp || 1)) * 0.5;
      const previousValue = computePIR(previous) + (previous.pts / previous.gp) * 0.5;
      return currentValue - previousValue > 0 ? currentValue - previousValue : null;
    });
  }

  private static calcOffensivePlayer(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number): EuroAwardCandidate[] {
    return this.rankPlayers(players, teams, ids, season, (_player, stat) =>
      stat.pts / (stat.gp || 1) + stat.ast / (stat.gp || 1) * 0.7 + (stat.tp ?? 0) / (stat.gp || 1) * 0.2,
    );
  }

  private static calcEfficiencyPlayer(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number): EuroAwardCandidate[] {
    return this.rankPlayers(players, teams, ids, season, (_player, stat) => computePIR(stat));
  }

  private static calcSpectacularPlayer(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number): EuroAwardCandidate[] {
    return this.rankPlayers(players, teams, ids, season, (_player, stat) =>
      stat.pts / (stat.gp || 1)
      + stat.ast / (stat.gp || 1) * 0.8
      + ((stat.tp ?? 0) + stat.blk + stat.stl) / (stat.gp || 1) * 0.5,
    );
  }

  private static calcPopularPlayer(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number): EuroAwardCandidate[] {
    return this.rankPlayers(players, teams, ids, season, (player, stat) =>
      computePIR(stat)
      + Number((player as NBAPlayer & { popularity?: number }).popularity ?? 0) / 10
      + (player.awards?.length ?? 0) * 0.15,
    );
  }

  private static calcTopScorer(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number): EuroAwardCandidate[] {
    return this.calcTopPerGame(players, teams, ids, season, s => s.pts / (s.gp || 1));
  }

  private static calcTopRebounder(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number): EuroAwardCandidate[] {
    return this.calcTopPerGame(players, teams, ids, season, s => getTrb(s) / (s.gp || 1));
  }

  private static calcTopAssister(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number): EuroAwardCandidate[] {
    return this.calcTopPerGame(players, teams, ids, season, s => s.ast / (s.gp || 1));
  }

  private static calcPIRLeader(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number): EuroAwardCandidate[] {
    return this.calcTopPerGame(players, teams, ids, season, computePIR);
  }

  private static calcBestCoach(teams: NBATeam[], endesaIds: Set<number>, season: number, staff?: StaffData | null): EuroCoachCandidate[] {
    return this.calcCoachRace(teams, endesaIds, season, staff);
  }

  // ─── Shared calc patterns ────────────────────────────────────────────────

  private static calcMVPLike(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number, _label: string): EuroAwardCandidate[] {
    return players
      .filter(p => isEuroPlayer(p, ids))
      .map(p => {
        const stat = bestStat(p.stats, season, p.tid);
        const team = teams.find(t => t.id === p.tid) ?? this.buildStubTeam(p.tid);
        if (!stat || !isEligible(stat, team, this.MIN_GAMES)) return null;
        const gp = stat.gp;
        const ppg = stat.pts / gp;
        if (ppg < 10) return null;
        const winPct = team.wins / (team.wins + team.losses || 1);
        const score = (ppg * 1.0 + (getTrb(stat) / gp) * 0.5 + (stat.ast / gp) * 0.6 + computePIR(stat) * 0.4) * (0.7 + winPct * 0.8);
        return { player: p, team, score, odds: '', stats: stat };
      })
      .filter((x): x is EuroAwardCandidate => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((c, i, arr) => ({ ...c, odds: this.assignOdds(c, i, arr) }));
  }

  private static rankPlayers(
    players: NBAPlayer[],
    teams: NBATeam[],
    ids: Set<number>,
    season: number,
    scoreFor: (player: NBAPlayer, stat: NBAGMStat) => number | null,
  ): EuroAwardCandidate[] {
    return players
      .filter(player => isEuroPlayer(player, ids))
      .map(player => {
        const stat = bestStat(player.stats, season, player.tid);
        const team = teams.find(entry => entry.id === player.tid) ?? this.buildStubTeam(player.tid);
        if (!stat || !isEligible(stat, team, Math.max(1, Math.ceil(this.MIN_GAMES / 2)))) return null;
        const score = scoreFor(player, stat);
        return score != null && Number.isFinite(score)
          ? { player, team, score, odds: '', stats: stat }
          : null;
      })
      .filter((entry): entry is EuroAwardCandidate => entry !== null)
      .sort((left, right) => right.score - left.score)
      .slice(0, 10)
      .map((candidate, index, all) => ({ ...candidate, odds: this.assignOdds(candidate, index, all) }));
  }

  private static calcTopPerGame(players: NBAPlayer[], teams: NBATeam[], ids: Set<number>, season: number, metric: (s: NBAGMStat) => number): EuroAwardCandidate[] {
    return players
      .filter(p => isEuroPlayer(p, ids))
      .map(p => {
        const stat = bestStat(p.stats, season, p.tid);
        const team = teams.find(t => t.id === p.tid) ?? this.buildStubTeam(p.tid);
        if (!stat || !isEligible(stat, team, Math.max(1, Math.ceil(this.MIN_GAMES / 2)))) return null;
        return { player: p, team, score: metric(stat), odds: '', stats: stat };
      })
      .filter((x): x is EuroAwardCandidate => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((c, i, arr) => ({ ...c, odds: this.assignOdds(c, i, arr) }));
  }

  private static calcCoachRace(teams: NBATeam[], ids: Set<number>, season: number, staff?: StaffData | null): EuroCoachCandidate[] {
    return teams
      .filter(t => ids.has(t.id))
      .map(t => {
        const wins = t.wins ?? 0;
        const losses = t.losses ?? 0;
        const winPct = wins / (wins + losses || 1);
        const prevWins = (t.seasons ?? [])[(t.seasons ?? []).length - 2]?.won ?? wins;
        const improvement = wins - prevWins;
        const coach = resolveHeadCoachMember(t, staff);
        const coachName = coach?.name ?? resolveHeadCoachName(t, staff, season);
        const portraitUrl = coach?.playerPortraitUrl ?? (coach ? getStaffImageUrl(resolveStaffImageId(coach)) ?? undefined : undefined);
        const face = (coach as any)?.face;
        const score = winPct * 70 + improvement * 1.5;
        return { coachName, role: 'coach' as const, portraitUrl, face, team: t, score, odds: '', wins, losses, improvement };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((c, i, arr) => ({ ...c, odds: this.assignCoachOdds(c, i, arr) }));
  }

  // ─── Util ────────────────────────────────────────────────────────────────

  private static buildCompetitionTeamMap(
    competitionId: string,
    ids: Set<number>,
    teams: NBATeam[],
    nonNBATeams: NonNBATeam[],
    season: number,
    boxScores: CompetitionBoxScore[],
  ): NBATeam[] {
    const rows = new Map<number, { wins: number; losses: number }>();
    ids.forEach(tid => rows.set(tid, { wins: 0, losses: 0 }));
    const isRegularPhase = (phase?: string) => !phase || phase === 'group' || phase.startsWith('r');
    const matchesSeason = (game: CompetitionBoxScore) => {
      if (typeof game.season === 'number') return game.season === season;
      const match = String(game.date ?? '').match(/(20\d{2})/);
      if (!match) return false;
      const year = Number(match[1]);
      return year === season || year === season - 1;
    };
    boxScores
      .filter(game => game.competitionId === competitionId && isRegularPhase(game.competitionPhase) && matchesSeason(game))
      .forEach(game => {
        const home = rows.get(game.homeTeamId) ?? { wins: 0, losses: 0 };
        const away = rows.get(game.awayTeamId) ?? { wins: 0, losses: 0 };
        const homeWon = didHomeTeamWin(game);
        home.wins += homeWon ? 1 : 0;
        home.losses += homeWon ? 0 : 1;
        away.wins += homeWon ? 0 : 1;
        away.losses += homeWon ? 1 : 0;
        rows.set(game.homeTeamId, home);
        rows.set(game.awayTeamId, away);
      });
    return [...ids].map(tid => {
      const directTeam = teams.find(team => team.id === tid) as any;
      const resolved = (directTeam ?? resolveAnyTeam(tid, teams, nonNBATeams)) as any;
      const row = rows.get(tid);
      const wins = row && row.wins + row.losses > 0 ? row.wins : (directTeam?.wins ?? 0);
      const losses = row && row.wins + row.losses > 0 ? row.losses : (directTeam?.losses ?? 0);
      if (!resolved) {
        return { ...this.buildStubTeam(tid), wins, losses };
      }
      return {
        ...(resolved as object),
        id: resolved.id ?? resolved.tid ?? tid,
        abbrev: resolved.abbrev ?? resolved.name?.slice(0, 3)?.toUpperCase() ?? '?',
        logoUrl: resolved.logoUrl ?? resolved.imgURL,
        wins,
        losses,
      } as NBATeam;
    });
  }

  private static scopePlayersToCompetition(players: NBAPlayer[], competitionId: string): NBAPlayer[] {
    const target = getCanonicalEuroStatCompetitionId({ competitionId } as any);
    return players.map(player => ({
      ...player,
      stats: (player.stats ?? []).filter(stat =>
        getCanonicalEuroStatCompetitionId(stat as NBAGMStat & Record<string, unknown>) === target,
      ),
    }));
  }

  private static buildStubTeam(tid: number): NBATeam {
    return { id: tid, name: 'Unknown', abbrev: '?', wins: 0, losses: 0 } as unknown as NBATeam;
  }

  private static assignOdds(c: EuroAwardCandidate, i: number, all: EuroAwardCandidate[]): string {
    const top = all[0]?.score || 1;
    const ratio = c.score / top;
    if (i === 0) return `${Math.round(45 + ratio * 25)}%`;
    if (i === 1) return `${Math.round(18 + ratio * 8)}%`;
    if (i === 2) return `${Math.round(10 + ratio * 5)}%`;
    return `+${Math.round(800 + (1 - ratio) * 1500)}`;
  }

  private static assignCoachOdds(c: EuroCoachCandidate, i: number, all: EuroCoachCandidate[]): string {
    const top = all[0]?.score || 1;
    const ratio = c.score / top;
    if (i === 0) return `${Math.round(40 + ratio * 25)}%`;
    if (i === 1) return `${Math.round(16 + ratio * 8)}%`;
    if (i === 2) return `${Math.round(9 + ratio * 5)}%`;
    return `+${Math.round(600 + (1 - ratio) * 1500)}`;
  }
}
