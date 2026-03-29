import { NBATeam as Team, NBAPlayer as Player, Game } from '../../../types';
import { StatGenerator } from '../StatGenerator';
import { GameResult } from '../types';
import { InjurySystem } from '../InjurySystem';
import { calculateTeamStrength } from '../../../utils/playerRatings';
import { calcTeamRatings, expectedTeamScore } from '../teamratinghelper';
import { normalRandom } from '../utils';
import { simulateQuarters } from './quarters';
import { pickGameWinner } from './clutch';
import { generateSyntheticPM, applyPMToStats } from './syntheticPM';
import { setClubDebuffs, clearClubDebuffs } from '../StatGenerator/helpers';
import { generateFight } from '../../FightGenerator';
import { fetchGamePhotos } from '../../ImagnPhotoService';
import { Defense2KService } from '../../Defense2KService';
import { SimulatorKnobs, KNOBS_DEFAULT, KNOBS_ALL_STAR, KNOBS_RISING_STARS, KNOBS_CELEBRITY, getKnobs } from '../SimulatorKnobs';
export class GameSimulator {

  private static calcWinProb(strengthDiff: number): number {
    return 1 / (1 + Math.exp(-strengthDiff * 0.09));
  }

  private static simulateOTPeriod(
    isDecisive: boolean,
    strengthDiff: number
  ): { homePts: number; awayPts: number } {
    if (!isDecisive) {
      const basePts = Math.max(6, Math.round(normalRandom(11.5, 2.0)));
      return { homePts: basePts, awayPts: basePts };
    }

    const winnerPts  = Math.max(6,  Math.round(normalRandom(13.0, 2.5)));
    const otMargin   = Math.max(1,  Math.round(Math.abs(normalRandom(3.5, 2.0))));
    const loserPts   = Math.max(0,  winnerPts - otMargin);

    const homeWinsOT = Math.random() < (0.50 + strengthDiff * 0.008);

    return homeWinsOT
      ? { homePts: winnerPts, awayPts: loserPts }
      : { homePts: loserPts,  awayPts: winnerPts };
  }

  static simulateGame(
    homeTeam: Team,
    awayTeam: Team,
    players: Player[],
    gameId: number,
    date: string,
    playerApproval: number = 50,
    homeOverridePlayers?: Player[],
    awayOverridePlayers?: Player[],
    isAllStar?: boolean,
    isRisingStars?: boolean,
    riggedForTid?: number,
    homeKnobs: SimulatorKnobs = KNOBS_DEFAULT,
    awayKnobs: SimulatorKnobs = KNOBS_DEFAULT,
  ): GameResult {
    // 500-retry loop to enforce rigged result
    for (let attempt = 0; attempt < 500; attempt++) {
      const result = this._simulateGameOnce(homeTeam, awayTeam, players, gameId, date, playerApproval, homeOverridePlayers, awayOverridePlayers, isAllStar, isRisingStars, homeKnobs, awayKnobs);
      if (!riggedForTid || result.winnerId === riggedForTid) {
        return result;
      }
    }
    // Fallback: return last attempt even if rig failed (shouldn't happen with 500 tries)
    return this._simulateGameOnce(homeTeam, awayTeam, players, gameId, date, playerApproval, homeOverridePlayers, awayOverridePlayers, isAllStar, isRisingStars, homeKnobs, awayKnobs);
  }

  private static _simulateGameOnce(
    homeTeam: Team,
    awayTeam: Team,
    players: Player[],
    gameId: number,
    date: string,
    playerApproval: number = 50,
    homeOverridePlayers?: Player[],
    awayOverridePlayers?: Player[],
    isAllStar?: boolean,
    isRisingStars?: boolean,
    homeKnobs: SimulatorKnobs = KNOBS_DEFAULT,
    awayKnobs: SimulatorKnobs = KNOBS_DEFAULT,
  ): GameResult {

    const homeStrength = calculateTeamStrength(homeTeam.id, players, homeOverridePlayers);
    const awayStrength = calculateTeamStrength(awayTeam.id, players, awayOverridePlayers);

    const HOME_COURT  = 3;
    const strengthDiff = (homeStrength - awayStrength) + HOME_COURT;
    const winProb      = Math.max(0.07, Math.min(0.93, this.calcWinProb(strengthDiff)));
    const homeWins     = Math.random() < winProb;

    const absGap   = Math.abs(homeStrength - awayStrength);
    const baseLead = Math.max(2, Math.round(
      absGap * 0.9 + Math.abs(normalRandom(0, 6)) + 2
    ));

    const homeRatings = calcTeamRatings(homeTeam.id, players);
    const awayRatings = calcTeamRatings(awayTeam.id, players);

    const homeExpected = expectedTeamScore(homeRatings.offRating, awayRatings.defRating, homeRatings.pace);
    const awayExpected = expectedTeamScore(awayRatings.offRating, homeRatings.defRating, awayRatings.pace);

    const homeRegScore = Math.max(85, Math.round(normalRandom(homeExpected, 8)));
    const awayRegScore = Math.max(80, Math.round(normalRandom(awayExpected, 8)));

    let winnerScore = Math.max(homeRegScore, awayRegScore);
    let loserScore  = Math.min(homeRegScore, awayRegScore);

    // Prevent tied scores outside of OT path
    if (winnerScore === loserScore) {
      if (Math.random() < 0.5) winnerScore += 1;
      else loserScore = Math.max(0, loserScore - 1);
    }

    let isOT    = false;
    let otCount = 0;
    let finalHomeScore: number;
    let finalAwayScore: number;

    const otChance = baseLead <= 4 ? 0.38 : baseLead <= 8 ? 0.06 : 0;

    if (otChance > 0 && Math.random() < otChance) {
      isOT    = true;
      otCount = Math.random() < 0.07 ? 3 : Math.random() < 0.22 ? 2 : 1;

      const regTie  = loserScore;
      let homeOtPts = 0;
      let awayOtPts = 0;

      for (let ot = 1; ot <= otCount; ot++) {
        const isDecisive = ot === otCount;
        const { homePts, awayPts } = this.simulateOTPeriod(isDecisive, strengthDiff);
        homeOtPts += homePts;
        awayOtPts += awayPts;
      }

      finalHomeScore = regTie + homeOtPts;
      finalAwayScore = regTie + awayOtPts;

      if (finalHomeScore === finalAwayScore) {
        if (Math.random() < (0.50 + strengthDiff * 0.005)) finalHomeScore += 1;
        else finalAwayScore += 1;
      }

    } else {
      finalHomeScore = homeWins ? winnerScore : loserScore;
      finalAwayScore = homeWins ? loserScore  : winnerScore;
    }

    // ── Team night dice ──────────────────────────────────────────────────────
    // pace roll: shared (both teams) — creates slow grinds vs fast shootouts
    // eff roll:  independent per team — creates blowouts and cold-shooting nights
    // Both are uniform with mean 1.0 → long-run player averages are preserved
    const homePlayers = homeOverridePlayers ?? players.filter(p => p.tid === homeTeam.id);
    const awayPlayers = awayOverridePlayers ?? players.filter(p => p.tid === awayTeam.id);
    const home2KDef = Defense2KService.getTeamDefense(homePlayers);
    const away2KDef = Defense2KService.getTeamDefense(awayPlayers);

    // Aura centered at 70: elite (82) → +0.06 debuff on opponent; bad (60) → -0.05 buff to opponent
    const homeDefAura = (home2KDef.overallDef - 70) * 0.005;
    const awayDefAura = (away2KDef.overallDef - 70) * 0.005;

    const paceRoll    = 0.96 + Math.random() * 0.20;   // 0.90–1.10, mean 1.00
    const homeEffRoll = (0.88 + Math.random() * 0.24) - awayDefAura;
    const awayEffRoll = (0.88 + Math.random() * 0.24) - homeDefAura;

    finalHomeScore = Math.max(75, Math.round(finalHomeScore * paceRoll * homeEffRoll));
    finalAwayScore = Math.max(70, Math.round(finalAwayScore * paceRoll * awayEffRoll));

    // Exhibition score boost — applied BEFORE stat generation so player totals
    // match the scoreboard.  paceMultiplier in knobs is kept at 1.0 for All-Star
    // to avoid double-counting.
    const homeExhibMult = homeKnobs.exhibitionScoreMult ?? 1.0;
    const awayExhibMult = awayKnobs.exhibitionScoreMult ?? 1.0;
    if (homeExhibMult !== 1.0) finalHomeScore = Math.max(75, Math.round(finalHomeScore * homeExhibMult));
    if (awayExhibMult !== 1.0) finalAwayScore = Math.max(70, Math.round(finalAwayScore * awayExhibMult));

    if (finalHomeScore === finalAwayScore) {
      if (Math.random() < 0.5) finalHomeScore += 1;
      else finalAwayScore += 1;
    }

    const homeWinsFinal = finalHomeScore > finalAwayScore;

    const availablePlayers = players.filter(
      p => !p.injury || p.injury.gamesRemaining <= 0
    );

    const actualMargin = Math.abs(finalHomeScore - finalAwayScore);
    const homeInitial = StatGenerator.generateStatsForTeam(
      homeTeam, players, finalHomeScore, homeWinsFinal, actualMargin, { league3PAMult: 1.0 }, 2026, homeOverridePlayers, otCount, away2KDef, homeKnobs
    );
    const awayInitial = StatGenerator.generateStatsForTeam(
      awayTeam, players, finalAwayScore, !homeWinsFinal, actualMargin, { league3PAMult: 1.0 }, 2026, awayOverridePlayers, otCount, home2KDef, awayKnobs
    );

    const homeMisses = homeInitial.reduce(
      (sum, p) => sum + (p.fga - p.fgm) + (p.fta - p.ftm) * 0.4, 0
    );
    const awayMisses = awayInitial.reduce(
      (sum, p) => sum + (p.fga - p.fgm) + (p.fta - p.ftm) * 0.4, 0
    );
    const homeTov = homeInitial.reduce((sum, p) => sum + p.tov, 0);
    const awayTov = awayInitial.reduce((sum, p) => sum + p.tov, 0);

    const homeInteriorMisses = homeInitial.reduce(
      (sum, p) => sum + Math.max(0, (p.fga - p.threePa) - (p.fgm - p.threePm)), 0
    );
    const awayInteriorMisses = awayInitial.reduce(
      (sum, p) => sum + Math.max(0, (p.fga - p.threePa) - (p.fgm - p.threePm)), 0
    );

    const homeFTA = homeInitial.reduce((sum, p) => sum + p.fta, 0);
    const awayFTA = awayInitial.reduce((sum, p) => sum + p.fta, 0);

    const homeBlkMult = homeKnobs.blockRateMult ?? 1.0;
    const awayBlkMult = awayKnobs.blockRateMult ?? 1.0;

    const homeStats = StatGenerator.generateCoordinatedStats(
      homeInitial,
      homeTeam,
      availablePlayers,
      awayMisses         * 0.69,
      awayTov            * 0.60,
      awayInteriorMisses * 0.33 * awayBlkMult,  // blockRateMult scales away team's blockable interior misses
      awayFTA,
      2026,
      otCount,
      home2KDef,  // home team's defensive ratings (sizes their steal/block pools)
      away2KDef   // away team's pass perception (shrinks home's assist pool)
    );
    const awayStats = StatGenerator.generateCoordinatedStats(
      awayInitial,
      awayTeam,
      availablePlayers,
      homeMisses         * 0.69,
      homeTov            * 0.60,
      homeInteriorMisses * 0.33 * homeBlkMult,  // blockRateMult scales home team's blockable interior misses
      homeFTA,
      2026,
      otCount,
      away2KDef,  // away team's defensive ratings
      home2KDef   // home team's pass perception
    );
 // ✅ ADD HERE
    const { homePM, awayPM } = generateSyntheticPM(
      homeStats, awayStats,
      finalHomeScore, finalAwayScore,
      Math.abs(finalHomeScore - finalAwayScore) > 20
    );
    const homeStatsFinal = applyPMToStats(homeStats, homePM).filter(Boolean);
    const awayStatsFinal = applyPMToStats(awayStats, awayPM).filter(Boolean);

    // Weave Advanced Stats
    const homeAdv = StatGenerator.generateAdvancedStats(homeStatsFinal, awayStatsFinal, homePM.map(p => p.pm));
    const awayAdv = StatGenerator.generateAdvancedStats(awayStatsFinal, homeStatsFinal, awayPM.map(p => p.pm));

    homeStatsFinal.forEach((s, i) => {
      Object.assign(s, {
        tsPct: homeAdv[i].tsPct,
        efgPct: homeAdv[i].efgPct,
        per: homeAdv[i].per,
        ortg: homeAdv[i].ortg,
        drtg: homeAdv[i].drtg,
        usgPct: homeAdv[i].usgPct,
        bpm: homeAdv[i].bpm,
        ws: homeAdv[i].ws,
        vorp: homeAdv[i].vorp,
      });
    });

    awayStatsFinal.forEach((s, i) => {
      Object.assign(s, {
        tsPct: awayAdv[i].tsPct,
        efgPct: awayAdv[i].efgPct,
        per: awayAdv[i].per,
        ortg: awayAdv[i].ortg,
        drtg: awayAdv[i].drtg,
        usgPct: awayAdv[i].usgPct,
        bpm: awayAdv[i].bpm,
        ws: awayAdv[i].ws,
        vorp: awayAdv[i].vorp,
      });
    });

    // then replace homeStats → homeStatsFinal, awayStats → awayStatsFinal below:
    const winnerStats = homeWinsFinal ? homeStatsFinal : awayStatsFinal;  // ← was homeStats/awayStats
    const winnerTeamId = homeWinsFinal ? homeTeam.id : awayTeam.id;
    const gameWinner = pickGameWinner(
      winnerStats,
      winnerTeamId,
      Math.abs(finalHomeScore - finalAwayScore),
      isOT
    );

    const quarterScores = simulateQuarters(
      finalHomeScore,
      finalAwayScore,
      Math.abs(finalHomeScore - finalAwayScore),
      isOT ? otCount : 0
    );

    const gamePlayers = homeOverridePlayers && awayOverridePlayers 
      ? [...homeOverridePlayers, ...awayOverridePlayers]
      : availablePlayers.filter(
          p => p.tid === homeTeam.id || p.tid === awayTeam.id
        );
    const injuries = InjurySystem.checkInjuries(gamePlayers, homeTeam, awayTeam);

    // Record DNP reasons at time of simulation so historical views stay accurate
    const playedHomeIds = new Set(homeStatsFinal.map(s => s.playerId));
    const playedAwayIds = new Set(awayStatsFinal.map(s => s.playerId));
    const playerDNPs: Record<string, string> = {};
    for (const p of homePlayers) {
      if (!playedHomeIds.has(p.internalId) && p.status === 'Active') {
        playerDNPs[p.internalId] = (p.injury?.gamesRemaining ?? 0) > 0
          ? `DNP — Injury (${p.injury!.type})`
          : "DNP — Coach's Decision";
      }
    }
    for (const p of awayPlayers) {
      if (!playedAwayIds.has(p.internalId) && p.status === 'Active') {
        playerDNPs[p.internalId] = (p.injury?.gamesRemaining ?? 0) > 0
          ? `DNP — Injury (${p.injury!.type})`
          : "DNP — Coach's Decision";
      }
    }

    // ── Fight check (skipped for All-Star / exhibition games) ────────────────
    const fight = (!isAllStar && !isRisingStars)
      ? generateFight(
          homeStatsFinal.map(s => s.playerId),
          awayStatsFinal.map(s => s.playerId),
          availablePlayers,
          [homeTeam, awayTeam] as any,
          date,
        ) ?? undefined
      : undefined;

    return {
      gameId,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore:  finalHomeScore,
      awayScore:  finalAwayScore,
       homeStats: homeStatsFinal,   // ← was homeStats
      awayStats: awayStatsFinal,   // ← was awayStats
      winnerId: homeWinsFinal ? homeTeam.id : awayTeam.id,
      lead:    Math.abs(finalHomeScore - finalAwayScore),
      isOT,
      otCount,
      date,
      isAllStar,
      isRisingStars,
      injuries,
      quarterScores,
      gameWinner,
      playerDNPs,
      fight,
    };
  }

  /**
   * Pre-compute conference standings context for every team.
   * Returns rank (1-15), GB from conference leader, and games remaining.
   * Used to build per-team SimulatorKnobs so rotation depth / star MPG
   * reflect real standings pressure at time of simulation.
   */
  private static buildStandingsContext(teams: Team[]): Map<number, { conferenceRank: number; gbFromLeader: number; gamesRemaining: number }> {
    const ctx = new Map<number, { conferenceRank: number; gbFromLeader: number; gamesRemaining: number }>();

    for (const conf of ['East', 'West'] as const) {
      const confTeams = teams
        .filter(t => t.conference === conf)
        .sort((a, b) => {
          const aPct = a.wins / Math.max(1, a.wins + a.losses);
          const bPct = b.wins / Math.max(1, b.wins + b.losses);
          return bPct - aPct || b.wins - a.wins;
        });

      const leader = confTeams[0];
      confTeams.forEach((t, idx) => {
        const gb = leader
          ? Math.max(0, ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2)
          : 0;
        ctx.set(t.id, {
          conferenceRank: idx + 1,   // was 'rank' — key must match SimulatorKnobs.conferenceRank
          gbFromLeader: gb,
          gamesRemaining: Math.max(0, 82 - (t.wins + t.losses)),
        });
      });
    }

    return ctx;
  }

  static simulateDay(
    teams: Team[],
    players: Player[],
    gamesToSimulate: Game[],
    date: string,
    playerApproval: number = 50,
    allStar?: any,
    homeOverridePlayers?: Player[],
    awayOverridePlayers?: Player[],
    riggedForTid?: number,
    clubDebuffs?: Map<string, 'heavy' | 'moderate' | 'mild'>,
    leagueStats?: {
      quarterLength?: number;
      shotClockValue?: number;
      shotClockEnabled?: boolean;
      threePointLineEnabled?: boolean;
      defensiveThreeSecondEnabled?: boolean;
      offensiveThreeSecondEnabled?: boolean;
      handcheckingEnabled?: boolean;
      goaltendingEnabled?: boolean;
      chargingEnabled?: boolean;
      noDribbleRule?: boolean;
    }
  ): GameResult[] {
    const results: GameResult[] = [];

    // Build standings context once for the whole day
    const standingsCtx = this.buildStandingsContext(teams);

    // Build league-rules base knobs from commissioner rule changes
    const shotClock    = leagueStats?.shotClockValue      ?? 24;
    const shotClockOn  = leagueStats?.shotClockEnabled    ?? true;
    const def3sec      = leagueStats?.defensiveThreeSecondEnabled  ?? true;
    const off3sec      = leagueStats?.offensiveThreeSecondEnabled  ?? true;
    const threeOn      = leagueStats?.threePointLineEnabled ?? true;
    const handchecking  = leagueStats?.handcheckingEnabled    ?? false;
    const goaltending   = leagueStats?.goaltendingEnabled     ?? true;
    const charging      = leagueStats?.chargingEnabled        ?? true;
    const noDribble     = leagueStats?.noDribbleRule           ?? false;

    // Shot clock → pace: 24/shotClock gives 1.0 at NBA default, 2.0 at 12s.
    // No shot clock at all → slow-down ball → 0.78× pace, fewer 3s.
    const shotClockPace = shotClockOn
      ? Math.min(2.0, 24 / Math.max(8, shotClock))
      : 0.78;

    // Defensive 3-second disabled → defenders clog the paint → fewer rim drives, more 3s/mid
    const rimMult      = def3sec  ? 1.0  : 0.72;
    const threeBumpD   = def3sec  ? 1.0  : 1.22;  // more perimeter shots when lane is clogged

    // Offensive 3-second disabled → players can camp in the paint → more post / rim
    const lowPostMult  = off3sec  ? 1.0  : 1.35;
    const rimBumpO     = off3sec  ? 1.0  : 1.15;

    // Handchecking allowed → refs swallow whistles on contact → fewer free throws
    const handcheckFtMult = handchecking ? 0.82 : 1.0;

    // Goaltending disabled → defenders freely swat near rim → more blocks, slightly lower rim efficiency
    const blockMult        = goaltending ? 1.0 : 1.6;
    const goaltendEffMult  = goaltending ? 1.0 : 0.93;

    // Charging disabled → no charge calls → players drive fearlessly → more rim attempts
    const chargingRimBump  = charging ? 1.0 : 1.12;

    // No-dribble rule → everything is catch-and-shoot or post → slower pace, fewer rim drives, more 3s
    const noDribblePaceMult   = noDribble ? 0.72 : 1.0;
    const noDribbleRimMult    = noDribble ? 0.65 : 1.0;
    const noDribble3PMult     = noDribble ? 1.40 : 1.0;

    const leagueBaseKnobs = getKnobs({
      quarterLength:       leagueStats?.quarterLength ?? 12,
      shotClockSeconds:    shotClock,
      threePointAvailable: threeOn,
      threePointRateMult:  threeOn ? (1.0 * threeBumpD * noDribble3PMult) : 0,
      paceMultiplier:      shotClockPace * noDribblePaceMult,
      efficiencyMultiplier: goaltendEffMult,
      rimRateMult:         rimMult * rimBumpO * chargingRimBump * noDribbleRimMult,
      lowPostRateMult:     lowPostMult,
      ftRateMult:          handcheckFtMult,
      blockRateMult:       blockMult,
    });

    for (const game of gamesToSimulate) {
      let home = teams.find(t => t.id === game.homeTid);
      let away = teams.find(t => t.id === game.awayTid);
      
      let homeOverride: Player[] | undefined = homeOverridePlayers;
      let awayOverride: Player[] | undefined = awayOverridePlayers;

      // Handle All-Star Teams
      if (!home && game.homeTid < 0) {
        const teamName = game.homeTid === -1 ? 'East All-Stars' : 
                        game.homeTid === -3 ? 'Team USA' : 
                        game.homeTid === -5 ? 'Team Shannon' : 'All-Stars';
        home = { id: game.homeTid, name: teamName } as any;
        
        if (!homeOverride && allStar) {
          if (game.isCelebrityGame) {
            homeOverride = (allStar.celebrityRoster || []).filter((p: any) => p.team === 'Shannon');
          } else {
            const isRisingStars = game.isRisingStars;
            const roster = isRisingStars ? (allStar.risingStarsRoster || []) : (allStar.roster || []);
            
            const rosterIds = new Set(
              isRisingStars 
                ? roster.slice(0, 10).map((r: any) => r.playerId)
                : roster.filter((r: any) => r.conference === 'East').map((r: any) => r.playerId)
            );
            homeOverride = players.filter(p => rosterIds.has(p.internalId));
          }
        }
      }

      if (!away && game.awayTid < 0) {
        const teamName = game.awayTid === -2 ? 'West All-Stars' : 
                        game.awayTid === -4 ? 'Team World' : 
                        game.awayTid === -6 ? 'Team Stephen A' : 'All-Stars';
        away = { id: game.awayTid, name: teamName } as any;
        
        if (!awayOverride && allStar) {
          if (game.isCelebrityGame) {
            awayOverride = (allStar.celebrityRoster || []).filter((p: any) => p.team === 'StephenA');
          } else {
            const isRisingStars = game.isRisingStars;
            const roster = isRisingStars ? (allStar.risingStarsRoster || []) : (allStar.roster || []);

            const rosterIds = new Set(
              isRisingStars 
                ? roster.slice(10, 20).map((r: any) => r.playerId)
                : roster.filter((r: any) => r.conference === 'West').map((r: any) => r.playerId)
            );
            awayOverride = players.filter(p => rosterIds.has(p.internalId));
          }
        }
      }

      if (home && away) {
        // ── Intra-squad scrimmage: split roster in half ──────────────────────
        if (game.homeTid === game.awayTid && !homeOverride && !awayOverride) {
          const roster = players
            .filter(p => p.tid === game.homeTid && (!p.injury || p.injury.gamesRemaining <= 0))
            .sort(() => Math.random() - 0.5);
          const mid = Math.floor(roster.length / 2);
          homeOverride = roster.slice(0, mid);
          awayOverride = roster.slice(mid);
        }

        // ── Pick simulator knobs based on game type ──────────────────────────
        let homeKnobs: SimulatorKnobs;
        let awayKnobs: SimulatorKnobs;

        if (game.isCelebrityGame) {
          homeKnobs = awayKnobs = KNOBS_CELEBRITY;
        } else if (game.isRisingStars) {
          homeKnobs = awayKnobs = KNOBS_RISING_STARS;
        } else if (game.isAllStar) {
          homeKnobs = awayKnobs = KNOBS_ALL_STAR;
        } else {
          // Regular game: per-team standings context drives rotation depth + star MPG
          // Base is leagueBaseKnobs (commissioner rule changes) not raw KNOBS_DEFAULT
          const homeCtx = standingsCtx.get(home.id) ?? { rank: 8, gbFromLeader: 0, gamesRemaining: 41 };
          const awayCtx = standingsCtx.get(away.id) ?? { rank: 8, gbFromLeader: 0, gamesRemaining: 41 };
          homeKnobs = { ...leagueBaseKnobs, ...homeCtx };
          awayKnobs = { ...leagueBaseKnobs, ...awayCtx };
        }

        // Apply club debuffs around this game
        if (clubDebuffs && clubDebuffs.size > 0) setClubDebuffs(clubDebuffs);
        const gameRig = riggedForTid !== undefined &&
          (home.id === riggedForTid || away.id === riggedForTid)
          ? riggedForTid : undefined;
        results.push(
          this.simulateGame(home, away, players, game.gid, date, playerApproval, homeOverride, awayOverride, game.isAllStar, game.isRisingStars, gameRig, homeKnobs, awayKnobs)
        );
        if (clubDebuffs && clubDebuffs.size > 0) clearClubDebuffs();

        // Reset per-game overrides so they don't carry into the next iteration
        homeOverride = homeOverridePlayers;
        awayOverride = awayOverridePlayers;
      }
    }

    return results;
  }
}
