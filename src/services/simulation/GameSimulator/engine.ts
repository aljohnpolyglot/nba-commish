import { NBATeam as Team, NBAPlayer as Player, Game } from '../../../types';
import { StatGenerator } from '../StatGenerator';
import { GameResult } from '../types';
import { InjurySystem, enforceSeasonEndingMinimum } from '../InjurySystem';
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
import { SimulatorKnobs, KNOBS_DEFAULT, KNOBS_PRESEASON, KNOBS_ALL_STAR, KNOBS_RISING_STARS, KNOBS_CELEBRITY, KNOBS_BLEAGUE, KNOBS_EUROLEAGUE, KNOBS_PBA, getKnobs } from '../SimulatorKnobs';
import { HighlightGenerator } from '../HighlightGenerator';
import { getInjuries, getRandomInjury } from '../../injuryService';
/**
 * Maps a team's final score to a shot-efficiency multiplier.
 * High-scoring games reflect hot shooting; low-scoring games are grind nights.
 * Curve: +1% efficiency per 3 pts above average (avg ≈ 114).
 * Clamped to [0.90, 1.12] so extreme scores don't produce nonsense lines.
 * Long-run league average is preserved because score distributions are symmetric.
 */
function getEfficiencyMultFromScore(teamPts: number, avgPts = 114): number {
  const delta = (teamPts - avgPts) / 3;
  // Wider range [0.82, 1.22]: 165-pt game → 1.22 (22% more efficient, fewer FGA, more FT)
  // 90-pt game → 0.88 (brickfest — lower FG%, more attempts)
  return Math.max(0.82, Math.min(1.22, 1.0 + delta * 0.013));
}

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

    // Score-efficiency correlation: high-scoring games reflect hot shooting nights,
    // low-scoring games are grind/cold-shooting games. Multiplied into the knobs
    // so stat lines match the scoreboard energy. League avg preserved over many games.
    const homeEffMult = getEfficiencyMultFromScore(finalHomeScore);
    const awayEffMult = getEfficiencyMultFromScore(finalAwayScore);
    const homeKnobsEff = { ...homeKnobs, efficiencyMultiplier: (homeKnobs.efficiencyMultiplier ?? 1.0) * homeEffMult };
    const awayKnobsEff = { ...awayKnobs, efficiencyMultiplier: (awayKnobs.efficiencyMultiplier ?? 1.0) * awayEffMult };

    const homeInitial = StatGenerator.generateStatsForTeam(
      homeTeam, players, finalHomeScore, homeWinsFinal, actualMargin, { league3PAMult: 1.0 }, 2026, homeOverridePlayers, otCount, away2KDef, homeKnobsEff
    );
    const awayInitial = StatGenerator.generateStatsForTeam(
      awayTeam, players, finalAwayScore, !homeWinsFinal, actualMargin, { league3PAMult: 1.0 }, 2026, awayOverridePlayers, otCount, home2KDef, awayKnobsEff
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
      awayMisses         * 0.70,
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
      homeMisses         * 0.70,
      homeTov            * 0.60,
      homeInteriorMisses * 0.33 * homeBlkMult,  // blockRateMult scales home team's blockable interior misses
      homeFTA,
      2026,
      otCount,
      away2KDef,  // away team's defensive ratings
      home2KDef   // home team's pass perception
    );
    // Reconcile player pts to match the final team score.
    // nightProfile boosts individuals asymmetrically (EXPLOSION 1.5× on one player) so the
    // sum of player pts can drift 10-25 pts above the scoreboard total. Fix via FTM adjustment.
    // Removal: lowest scorers first → preserves the star's big night (EXPLOSION stays at 55).
    // Addition: highest scorers first → realistic (stars make the extra FTs).
    // Pass 2: if FTM-based pass can't fully close the gap (due to low ftm), adjust FGM (2-pt) as fallback.
    const reconcileToScore = (stats: any[], target: number) => {
      let delta = target - stats.reduce((s: number, p: any) => s + (p.pts || 0), 0);
      if (delta === 0) return;
      const sorted = delta < 0
        ? [...stats].sort((a: any, b: any) => a.pts - b.pts)   // remove from low scorers first
        : [...stats].sort((a: any, b: any) => b.pts - a.pts);  // add to top scorers first
      // Pass 1: adjust via FTM (capped at 4 per player to preserve star lines)
      for (const s of sorted) {
        if (delta === 0) break;
        if (delta > 0) {
          const add = Math.min(delta, 4);
          s.ftm += add; s.fta = Math.max(s.fta, s.ftm); s.pts += add; delta -= add;
        } else {
          const remove = Math.min(-delta, Math.min(4, Math.max(0, s.ftm)));
          if (remove > 0) { s.ftm -= remove; s.pts -= remove; delta += remove; }
        }
      }
      // Pass 2: if delta still remains, adjust via 2-pt FGM (add/remove 2-pointers)
      if (delta !== 0) {
        const pass2 = delta < 0
          ? [...stats].sort((a: any, b: any) => a.pts - b.pts)
          : [...stats].sort((a: any, b: any) => b.pts - a.pts);
        for (const s of pass2) {
          if (delta === 0) break;
          const twoPm = Math.max(0, s.fgm - (s.threePm ?? s.tp ?? 0));
          if (delta > 0) {
            // Add a 2-pointer
            s.fgm += 1; s.fga = Math.max(s.fga, s.fgm); s.pts += 2; delta -= 2;
          } else if (twoPm > 0 && delta <= -2) {
            // Remove a 2-pointer
            s.fgm -= 1; s.pts -= 2; delta += 2;
          } else if (delta === -1) {
            // Odd-point gap: remove 1 FT from whoever has one
            if (s.ftm > 0) { s.ftm -= 1; s.pts -= 1; delta += 1; }
          }
        }
      }
    };
    reconcileToScore(homeStats, finalHomeScore);
    reconcileToScore(awayStats, finalAwayScore);

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
        obpm: homeAdv[i].obpm,
        dbpm: homeAdv[i].dbpm,
        ws: homeAdv[i].ws,
        ows: homeAdv[i].ows,
        dws: homeAdv[i].dws,
        vorp: homeAdv[i].vorp,
        ewa: homeAdv[i].ewa,
        orbPct: homeAdv[i].orbPct,
        drbPct: homeAdv[i].drbPct,
        trbPct: homeAdv[i].trbPct,
        astPct: homeAdv[i].astPct,
        stlPct: homeAdv[i].stlPct,
        blkPct: homeAdv[i].blkPct,
        tovPct: homeAdv[i].tovPct,
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
        obpm: awayAdv[i].obpm,
        dbpm: awayAdv[i].dbpm,
        ws: awayAdv[i].ws,
        ows: awayAdv[i].ows,
        dws: awayAdv[i].dws,
        vorp: awayAdv[i].vorp,
        ewa: awayAdv[i].ewa,
        orbPct: awayAdv[i].orbPct,
        drbPct: awayAdv[i].drbPct,
        trbPct: awayAdv[i].trbPct,
        astPct: awayAdv[i].astPct,
        stlPct: awayAdv[i].stlPct,
        blkPct: awayAdv[i].blkPct,
        tovPct: awayAdv[i].tovPct,
      });
    });

    // then replace homeStats → homeStatsFinal, awayStats → awayStatsFinal below:
    const winnerStats = homeWinsFinal ? homeStatsFinal : awayStatsFinal;  // ← was homeStats/awayStats
    const winnerTeamId = homeWinsFinal ? homeTeam.id : awayTeam.id;
    const gameWinner = pickGameWinner(
      winnerStats,
      winnerTeamId,
      Math.abs(finalHomeScore - finalAwayScore),
      isOT,
      players,
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

    // ── Mid-game injuries — any player can roll, low-minute players much more likely ──
    // Low minutes (< 15) = clearly left early → 20% chance it's real
    // Short night (15-25) = possible early exit → 7% chance
    // Full game (25-35) = contact/twist late → 2% chance
    // Iron man (35+) → 0.6% chance
    const injuryDefs = getInjuries();
    const playerInGameInjuries: Record<string, string> = {};
    // Detect international preseason: one side is a non-NBA team (tid ≥ 100).
    // `game` is not in scope here — derive from homeTeam/awayTeam ids that were passed in.
    const isIntlPreseason = homeTeam.id >= 100 || awayTeam.id >= 100;
    if (injuryDefs.length > 0 && !isAllStar && !isRisingStars) {
      const allPlayedStats = [...homeStatsFinal, ...awayStatsFinal];
      for (const stat of allPlayedStats) {
        const player = availablePlayers.find(p => p.internalId === stat.playerId);
        if (!player || (player.injury?.gamesRemaining ?? 0) > 0) continue;

        const min = stat.min;
        // Preseason international games: NBA stars are treated cautiously,
        // sharply reduced injury risk (coaches pull guys early if anything feels off).
        const preseasonFactor = isIntlPreseason ? 0.25 : 1.0;
        const injuryChance = preseasonFactor * (
          min < 15  ? 0.20 :
          min < 25  ? 0.07 :
          min < 35  ? 0.02 :
                      0.006);

        if (Math.random() >= injuryChance) continue;

        const drawn = getRandomInjury(injuryDefs);
        // JSON `games` is the empirical mean — stay close to it (σ=0.15, clamp 0.75–1.30).
        // Early exits are slightly milder; full-game contacts are full severity.
        const u1 = 1 - Math.random(), u2 = 1 - Math.random();
        const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const baseMult = Math.max(0.75, Math.min(1.30, 1.0 + z * 0.15));
        const severityAdj = min < 15 ? -0.10 : min < 25 ? -0.05 : 0;
        const gameMult = Math.max(0.70, baseMult + severityAdj);
        const gamesRemaining = enforceSeasonEndingMinimum(drawn.name, Math.max(1, Math.round(drawn.games * gameMult)));

        injuries.push({
          playerId:       player.internalId,
          playerName:     player.name,
          teamId:         player.tid,
          injuryType:     drawn.name,
          gamesRemaining,
        });
        // Only flag "left early" if the injury actually costs the player games.
        if (gamesRemaining > 0) {
          playerInGameInjuries[player.internalId] = drawn.name;
        }
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

    const highlights = HighlightGenerator.processGame(
      homeStatsFinal,
      awayStatsFinal,
      homeTeam.id,
      awayTeam.id,
      availablePlayers,
    );

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
      playerInGameInjuries,
      fight,
      highlights,
      // Snapshot records at tip-off (before this game's result is applied)
      homeWins:   homeTeam.wins   ?? 0,
      homeLosses: homeTeam.losses ?? 0,
      awayWins:   awayTeam.wins   ?? 0,
      awayLosses: awayTeam.losses ?? 0,
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
      shotClockResetOffensiveRebound?: boolean;
      threePointLineEnabled?: boolean;
      defensiveThreeSecondEnabled?: boolean;
      offensiveThreeSecondEnabled?: boolean;
      handcheckingEnabled?: boolean;
      goaltendingEnabled?: boolean;
      chargingEnabled?: boolean;
      noDribbleRule?: boolean;
      backcourtTimerEnabled?: boolean;
      backToBasketTimerEnabled?: boolean;
      illegalZoneDefenseEnabled?: boolean;
      travelingEnabled?: boolean;
      doubleDribbleEnabled?: boolean;
      backcourtViolationEnabled?: boolean;
      freeThrowDistance?: number;
      rimHeight?: number;
      courtLength?: number;
      baselineLength?: number;
      keyWidth?: number;
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

    // ── New Phase 1A rules ────────────────────────────────────────────────────

    // Off-reb doesn't reset shot clock → less urgency, fewer possessions
    const noSCResetPace = (leagueStats?.shotClockResetOffensiveRebound === false) ? 0.88 : 1.0;

    // No backcourt timer → slower game, fewer forced TOs
    const backcourtTimerOn = leagueStats?.backcourtTimerEnabled ?? true;
    const backcourtPace    = backcourtTimerOn ? 1.0 : 0.90;
    const backcourtTovMult = backcourtTimerOn ? 1.0 : 0.85;

    // Back-to-basket timer → faster post reads → fewer post attempts
    const backToBasketTimer = leagueStats?.backToBasketTimerEnabled ?? false;
    const backToBasketLowPost = backToBasketTimer ? 0.90 : 1.0;

    // Illegal zone defense: false = zone allowed → clog paint, kick out; true = must play man → drives
    const illegalZone = leagueStats?.illegalZoneDefenseEnabled ?? true;
    const zoneRimMult   = illegalZone ? 1.0 : 0.90;   // zone clogs paint
    const zone3PMult    = illegalZone ? 1.0 : 1.10;   // zone kicks to perimeter
    const manRimBump    = illegalZone ? 1.05 : 1.0;   // man-to-man → more dribble penetration (guard at 1.0 NBA default)

    // Violation flags → fewer TOs when disabled
    const travelOn   = leagueStats?.travelingEnabled        ?? true;
    const dblDribOn  = leagueStats?.doubleDribbleEnabled    ?? true;
    const backctViol = leagueStats?.backcourtViolationEnabled ?? true;
    let tovMult = 1.0;
    if (!travelOn)   tovMult *= 0.88;
    if (!dblDribOn)  tovMult *= 0.90;
    if (!backctViol) tovMult *= 0.92;
    tovMult *= backcourtTovMult;

    // Free throw distance: farther line → lower FT%
    const ftDist = leagueStats?.freeThrowDistance ?? 15;
    const ftEfficiencyMult = Math.min(1.0, Math.max(0.65, 15 / Math.max(10, ftDist)));

    // Rim height: taller rim → lower overall efficiency (efficiencyMultiplier)
    const rimH = leagueStats?.rimHeight ?? 10;
    const rimHeightEffMult = Math.min(1.0, Math.max(0.5, Math.pow(10 / Math.max(8, rimH), 1.5)));

    // Court length: bigger court → slower pace, fewer TOs
    const courtLen = leagueStats?.courtLength ?? 94;
    const courtLenPace   = Math.pow(94 / Math.max(70, courtLen), 0.4);
    const courtLenTov    = Math.pow(94 / Math.max(70, courtLen), 0.2);
    tovMult *= courtLenTov;

    // Baseline (court width): wider court → slightly slower pace
    const baseline = leagueStats?.baselineLength ?? 50;
    const baselinePace  = Math.pow(50 / Math.max(40, baseline), 0.3);

    // Key width: wider key → harder to camp paint → less post, fewer rim drives
    const keyW = leagueStats?.keyWidth ?? 16;
    const keyLowPost = Math.pow(16 / Math.max(10, keyW), 0.5);
    const keyRimMult = Math.pow(16 / Math.max(10, keyW), 0.3);

    const leagueBaseKnobs = getKnobs({
      quarterLength:       leagueStats?.quarterLength ?? 12,
      shotClockSeconds:    shotClock,
      threePointAvailable: threeOn,
      threePointRateMult:  threeOn ? (1.0 * threeBumpD * noDribble3PMult * zone3PMult) : 0,
      paceMultiplier:      shotClockPace * noDribblePaceMult * noSCResetPace * backcourtPace * courtLenPace * baselinePace,
      efficiencyMultiplier: goaltendEffMult * rimHeightEffMult,
      rimRateMult:         rimMult * rimBumpO * chargingRimBump * noDribbleRimMult * zoneRimMult * manRimBump * keyRimMult,
      lowPostRateMult:     lowPostMult * backToBasketLowPost * keyLowPost,
      ftRateMult:          handcheckFtMult,
      blockRateMult:       blockMult,
      tovMult,
      ftEfficiencyMult,
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
        // Ensure minimum 8 players — fill from top available NBA players not already on either side
        if (homeOverride && homeOverride.length < 8 && !game.isCelebrityGame) {
          const usedIds = new Set([...(homeOverride || []), ...(awayOverride || [])].map((p: any) => p.internalId));
          const INELIGIBLE = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
          const fillers = players
            .filter(p => !usedIds.has(p.internalId) && !INELIGIBLE.has((p as any).status ?? '') && ((p as any).injury?.gamesRemaining ?? 0) === 0)
            .sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
          while (homeOverride.length < 12 && fillers.length > 0) homeOverride.push(fillers.shift()!);
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
        // Ensure minimum 8 players — fill from top available NBA players not already on either side
        if (awayOverride && awayOverride.length < 8 && !game.isCelebrityGame) {
          const usedIds = new Set([...(homeOverride || []), ...(awayOverride || [])].map((p: any) => p.internalId));
          const INELIGIBLE = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
          const fillers = players
            .filter(p => !usedIds.has(p.internalId) && !INELIGIBLE.has((p as any).status ?? '') && ((p as any).injury?.gamesRemaining ?? 0) === 0)
            .sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
          while (awayOverride.length < 12 && fillers.length > 0) awayOverride.push(fillers.shift()!);
        }
      }

      // ── Preseason international games: one side is a nonNBA club (tid ≥ 100) ──
      // nonNBA teams are not in the `teams` array (NBA only). Build a synthetic
      // team and use that club's actual player roster from the shared players pool.
      // Sim multipliers in getScaledRating already nerf their ratings appropriately.
      if ((game as any).isPreseason) {
        const buildNonNBATeam = (tid: number): { team: Team; roster: Player[] } | null => {
          const clubPlayers = players.filter(p => p.tid === tid);
          if (clubPlayers.length === 0) return null;
          // Compute strength from actual pre-scaled player OVRs (top-8 average, like calculateTeamStrength).
          // This naturally reflects the league multiplier — PBA at 0.54× will produce ~38-45 OVR players,
          // giving a strength of ~40-45 vs NBA teams at ~82-88. No hardcoded values needed.
          const sorted = [...clubPlayers].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
          const top8 = sorted.slice(0, 8);
          const computedStr = top8.length > 0
            ? top8.reduce((s, p) => s + (p.overallRating ?? 50), 0) / top8.length
            : 50;
          const synTeam: Team = {
            id: tid,
            name: `Club ${tid}`,
            abbrev: `C${tid}`,
            conference: 'West',
            did: 0,
            wins: 0,
            losses: 0,
            strength: computedStr,
          } as any;
          return { team: synTeam, roster: clubPlayers };
        };

        if (!home && game.homeTid >= 100) {
          const result = buildNonNBATeam(game.homeTid);
          if (result) { home = result.team; if (!homeOverride) homeOverride = result.roster; }
        }
        if (!away && game.awayTid >= 100) {
          const result = buildNonNBATeam(game.awayTid);
          if (result) { away = result.team; if (!awayOverride) awayOverride = result.roster; }
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
        } else if ((game as any).isPreseason && (game.homeTid >= 100 || game.awayTid >= 100)) {
          // International preseason: league-specific knobs for the intl team, NBA preseason for the NBA team.
          // Previously both teams used the same intl knobs — this meant the NBA team also played at
          // PBA efficiency (0.83×), making scores unrealistically close.
          const intlTid = game.homeTid >= 100 ? game.homeTid : game.awayTid;
          const isHomeIntl = game.homeTid >= 100;
          let intlKnobs: SimulatorKnobs;
          if      (intlTid >= 4000 && intlTid < 5000) intlKnobs = KNOBS_BLEAGUE;    // B-League +4000
          else if (intlTid >= 1000 && intlTid < 2000) intlKnobs = KNOBS_EUROLEAGUE; // Euroleague +1000
          else if (intlTid >= 5000 && intlTid < 6000) intlKnobs = KNOBS_EUROLEAGUE; // Endesa/ACB — similar style
          else if (intlTid >= 2000 && intlTid < 3000) intlKnobs = KNOBS_PBA;        // PBA +2000
          else if (intlTid >= 7000 && intlTid < 8000) intlKnobs = KNOBS_BLEAGUE;    // China CBA +7000 — B-League baseline
          else if (intlTid >= 8000 && intlTid < 9000) intlKnobs = KNOBS_BLEAGUE;    // NBL Australia +8000 — B-League baseline
          else intlKnobs = { ...KNOBS_BLEAGUE };                                      // G-League/WNBA/unknown → B-League baseline
          // NBA team uses standard preseason knobs; intl team uses their league-calibrated knobs
          homeKnobs = isHomeIntl ? intlKnobs : KNOBS_PRESEASON;
          awayKnobs = isHomeIntl ? KNOBS_PRESEASON : intlKnobs;
        } else {
          // Regular game: per-team standings context drives rotation depth + star MPG
          // Base is leagueBaseKnobs (commissioner rule changes) not raw KNOBS_DEFAULT
          const homeCtx = standingsCtx.get(home.id) ?? { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 };
          const awayCtx = standingsCtx.get(away.id) ?? { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 };
          if (game.isPlayIn || game.isPlayoff) {
            // Post-season: override gbFromLeader=0 and gamesRemaining=7 to prevent teams from
            // being treated as "eliminated" (82 reg-season games done → gamesRemaining=0, gb>0
            // → standingsProfile returns 12-deep exhibition-style rotation). All remaining
            // playoff teams are still competing — use tight, star-heavy playoff rotation.
            homeKnobs = { ...leagueBaseKnobs, ...homeCtx, gbFromLeader: 0, gamesRemaining: 7, isPlayoffs: true };
            awayKnobs = { ...leagueBaseKnobs, ...awayCtx, gbFromLeader: 0, gamesRemaining: 7, isPlayoffs: true };
          } else {
            homeKnobs = { ...leagueBaseKnobs, ...homeCtx };
            awayKnobs = { ...leagueBaseKnobs, ...awayCtx };
          }
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
