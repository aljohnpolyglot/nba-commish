import { NBATeam as Team, NBAPlayer as Player, Game, LeagueStats, ResolvedGamePresentation } from '../../../types';
import { StatGenerator } from '../StatGenerator';
import { GameEjection, GameResult, GameTiebreaker } from '../types';
import { GameLiveEvent } from '../types';
import { InjurySystem, enforceSeasonEndingMinimum, injuryChanceWithLeagueFactor } from '../InjurySystem';
import { calcTeamRatings, expectedTeamScore } from '../teamratinghelper';
import { normalRandom } from '../utils';
import { simulateQuarters } from './quarters';
import { pickGameWinner } from './clutch';
import { setClubDebuffs, clearClubDebuffs } from '../StatGenerator/helpers';
import { generateFight } from '../../FightGenerator';
import { Defense2KService } from '../../Defense2KService';
import {
  SimulatorKnobs,
  KNOBS_ALL_STAR,
  KNOBS_BLEAGUE,
  KNOBS_CELEBRITY,
  KNOBS_DEFAULT,
  KNOBS_EURO_CLUB_COMPETITION,
  KNOBS_EUROLEAGUE,
  KNOBS_PBA,
  KNOBS_PRESEASON,
  KNOBS_RISING_STARS,
  applySimulationEngineCalibration,
  getKnobs,
} from '../SimulatorKnobs';
import { HighlightGenerator } from '../HighlightGenerator';
import { getInjuries, getRandomInjury } from '../../injuryService';
import { getScoringOptionBiases, getCoachingPenalty } from '../../../store/scoringOptionsStore';
import {
  getSimulationScoringOptions as getScoringOptions,
  getSimulationSystemFitPenalty as getSystemFitPenalty,
  getSimulationSystemKnobMods as getSystemKnobMods,
} from '../simulationRealmContext';
import {
  simulateGameViaAdapter,
  simulatePreparedGameViaAdapter,
  type SimulateGameArgs,
} from '../SimulatorAdapter';
import { getRealDurability } from '../../../utils/durabilityUtils';
import { getFourPointDistance, isFourPointEnabled } from '../../../utils/ruleFlags';
import { resolveExhibitionRules } from '../../allStar/exhibitionRules';
import {
  applyStaffGameEffectsToRoster,
  getTeamCoachingGameplayEffects,
  getTeamMedicalGameplayEffects,
} from '../../staff/staffGameplayEffects';
import { getTeamTravelGameplayEffects } from '../../tycoon/travelGameplayEffects';
import { finalizeBoxScore, reconcileTeamPointsToScore } from './engineBoxScore';
import { resolveDayGameSetup, buildStandingsContext } from './engineDaySetup';
import { buildLeagueBaseKnobs } from './engineLeagueKnobs';
import {
  getFastEraAssistDistributionExponent,
  getFastEraInteriorBlockMissShare,
  getFastEraReboundDistributionExponent,
  getFastEraSimulationAdapter,
  NEUTRAL_ERA_COACHING_BIAS,
} from '../eraCoachingBias';
import { capturePreparedSimulationGame, recordSimulationPerf } from '../simulationPerfDebug';
import { annotateFourthQuarterPoints } from '../fourthQuarterStats';
import { normalizeGameResultScoreIntegrity } from '../resultIntegrity';
import { generateHeaveEvents } from '../heaveRule';
import { applyPMToStats, generateSyntheticPM } from './syntheticPM';
import {
  applyTemporaryTravelFatigue,
  applyTrainingFatiguePerformance,
  buildBaselineOrder,
  computePaceFactor,
  computeShotMults,
  defensiveStackOnOpponent,
  getDefenseSliders,
  getEfficiencyMultFromScore,
  getFamiliarityMods,
  getTrainingDefensiveAuraMods,
  resolveTeamEraCoachingBias,
  resolveTeamStrength,
} from './engineTeamModifiers';
import { resolveGameRules, resolveShootout } from '../gameRuleRuntime';
import { fastHomeWinProbability } from '../playoffProbability';

export class GameSimulator {
  /**
   * Capture the exact defensive profiles consumed after staff/travel roster
   * transforms. Capturing the raw adapter roster is insufficient for players
   * without a name-matched 2K row because their fallback profile derives from
   * the transformed ratings.
   */
  static capturePreparedGameDefenseProfiles(args: SimulateGameArgs) {
    const awayTravel = getTeamTravelGameplayEffects(args.awayTeam as any);
    const rawHomePlayers = args.homeOverridePlayers
      ?? args.players.filter(player => player.tid === args.homeTeam.id);
    const rawAwayPlayers = applyTemporaryTravelFatigue(
      args.awayOverridePlayers
        ?? args.players.filter(player => player.tid === args.awayTeam.id),
      awayTravel.awayFatigueShift,
    );
    const homePlayers = applyStaffGameEffectsToRoster(rawHomePlayers, args.homeTeam as any);
    const awayPlayers = applyStaffGameEffectsToRoster(rawAwayPlayers, args.awayTeam as any);
    return Defense2KService.captureSimulationProfiles([...homePlayers, ...awayPlayers]);
  }

  private static perfNow(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  private static perfMs(start: number): number {
    return Math.round((this.perfNow() - start) * 10) / 10;
  }

  private static scaleWinnerToTarget(home: number, away: number, target: number): { home: number; away: number } {
    const saneTarget = Math.max(1, Math.round(target));
    const winner = Math.max(home, away);
    const loser = Math.min(home, away);
    if (winner <= 0) {
      return { home: saneTarget, away: Math.max(0, saneTarget - 1) };
    }
    const scaledLoser = Math.min(Math.round(loser * saneTarget / winner), saneTarget - 1);
    return home >= away
      ? { home: saneTarget, away: scaledLoser }
      : { home: scaledLoser, away: saneTarget };
  }

  private static normalizeElamScores(
    home: number,
    away: number,
    homeRegulation: number,
    awayRegulation: number,
    target: number,
  ): { home: number; away: number } {
    const saneTarget = Math.max(homeRegulation, awayRegulation) + Math.max(1, Math.round(target - Math.max(homeRegulation, awayRegulation)));
    if (home >= away) {
      return {
        home: saneTarget,
        away: Math.max(awayRegulation, Math.min(saneTarget - 1, Math.round(away))),
      };
    }
    return {
      home: Math.max(homeRegulation, Math.min(saneTarget - 1, Math.round(home))),
      away: saneTarget,
    };
  }

  private static simulateOTPeriod(
    isDecisive: boolean,
    strengthDiff: number,
    overtimeDuration: number = 5
  ): { homePts: number; awayPts: number } {
    const durationScale = Math.max(0.2, overtimeDuration / 5);
    const scoringScale = Math.sqrt(durationScale);

    if (!isDecisive) {
      const basePts = Math.max(2, Math.round(normalRandom(11.5 * durationScale, 2.0 * scoringScale)));
      return { homePts: basePts, awayPts: basePts };
    }

    const winnerPts  = Math.max(2,  Math.round(normalRandom(13.0 * durationScale, 2.5 * scoringScale)));
    const otMargin   = Math.max(1,  Math.round(Math.abs(normalRandom(3.5 * scoringScale, 2.0))));
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
    isEliminationGame?: boolean,
    riggedForTid?: number,
    homeKnobs: SimulatorKnobs = KNOBS_DEFAULT,
    awayKnobs: SimulatorKnobs = KNOBS_DEFAULT,
    injuryFrequencyFactor: number = 1,
    season?: number,
    allowTies: boolean = false,
  ): GameResult {
    const fastHomeKnobs = applySimulationEngineCalibration(homeKnobs, 'fast');
    const fastAwayKnobs = applySimulationEngineCalibration(awayKnobs, 'fast');
    // 500-retry loop to enforce rigged result
    for (let attempt = 0; attempt < 500; attempt++) {
      const result = this._simulateGameOnce(homeTeam, awayTeam, players, gameId, date, playerApproval, homeOverridePlayers, awayOverridePlayers, isAllStar, isRisingStars, isEliminationGame, fastHomeKnobs, fastAwayKnobs, injuryFrequencyFactor, season, allowTies);
      if (!riggedForTid || result.winnerId === riggedForTid) {
        return result;
      }
    }
    // Fallback: return last attempt even if rig failed (shouldn't happen with 500 tries)
    return this._simulateGameOnce(homeTeam, awayTeam, players, gameId, date, playerApproval, homeOverridePlayers, awayOverridePlayers, isAllStar, isRisingStars, isEliminationGame, fastHomeKnobs, fastAwayKnobs, injuryFrequencyFactor, season, allowTies);
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
    isEliminationGame?: boolean,
    homeKnobs: SimulatorKnobs = KNOBS_DEFAULT,
    awayKnobs: SimulatorKnobs = KNOBS_DEFAULT,
    injuryFrequencyFactor: number = 1,
    season?: number,
    allowTies: boolean = false,
  ): GameResult {
    const forensicTotalStart = this.perfNow();
    let forensicStageStart = forensicTotalStart;
    const currentSeason = Number.isFinite(season) ? Number(season) : date ? parseInt(date.split('-')[0], 10) : 2026;
    const gameRules = resolveGameRules(homeKnobs, awayKnobs);
    const baseHomeStrength = resolveTeamStrength(homeTeam, players, currentSeason, homeOverridePlayers, homeKnobs);
    const baseAwayStrength = resolveTeamStrength(awayTeam, players, currentSeason, awayOverridePlayers, awayKnobs);
    const homeCoaching = getTeamCoachingGameplayEffects(homeTeam as any);
    const awayCoaching = getTeamCoachingGameplayEffects(awayTeam as any);
    const highLeverageGame = !!homeKnobs.isPlayoffs || !!awayKnobs.isPlayoffs || !!isEliminationGame;
    const homeStaffStrength = highLeverageGame ? homeCoaching.playoffStrengthBonus : homeCoaching.regularStrengthBonus;
    const awayStaffStrength = highLeverageGame ? awayCoaching.playoffStrengthBonus : awayCoaching.regularStrengthBonus;

    // Coaching penalty — picking the wrong 1st/2nd/3rd option actually hurts W/L,
    // not just stat distribution. Skip for exhibition/override rosters.
    const homeCoachPenalty = homeOverridePlayers
      ? 0
      : getCoachingPenalty(
          buildBaselineOrder(homeOverridePlayers ?? players.filter(p => p.tid === homeTeam.id), gameRules.dribbleRule),
          getScoringOptions(homeTeam.id)
        );
    const awayCoachPenalty = awayOverridePlayers
      ? 0
      : getCoachingPenalty(
          buildBaselineOrder(awayOverridePlayers ?? players.filter(p => p.tid === awayTeam.id), gameRules.dribbleRule),
          getScoringOptions(awayTeam.id)
        );
    // System-fit penalty — wrong system reduces team strength + shooting efficiency.
    // Skip for exhibition/override rosters (same guard as coach penalty above).
    const homeSysFit = homeOverridePlayers ? null : getSystemFitPenalty(homeTeam.id);
    const awaySysFit = awayOverridePlayers ? null : getSystemFitPenalty(awayTeam.id);
    const homeFamMods = homeOverridePlayers ? getFamiliarityMods(undefined) : getFamiliarityMods(homeTeam);
    const awayFamMods = awayOverridePlayers ? getFamiliarityMods(undefined) : getFamiliarityMods(awayTeam);
    const homeTrainingAura = homeOverridePlayers ? getTrainingDefensiveAuraMods(undefined) : getTrainingDefensiveAuraMods(homeTeam);
    const awayTrainingAura = awayOverridePlayers ? getTrainingDefensiveAuraMods(undefined) : getTrainingDefensiveAuraMods(awayTeam);
    const awayTravel = getTeamTravelGameplayEffects(awayTeam as any);

    const homeStrength = baseHomeStrength - homeCoachPenalty - (homeSysFit?.strengthPenalty ?? 0) + homeFamMods.strengthBoost + homeTrainingAura.strengthBoost + homeStaffStrength;
    const awayStrength = baseAwayStrength - awayCoachPenalty - (awaySysFit?.strengthPenalty ?? 0) + awayFamMods.strengthBoost + awayTrainingAura.strengthBoost + awayStaffStrength + awayTravel.awayStrengthBonus;

    const homeCourtAdvantage = Math.max(0, Math.min(6, homeKnobs.homeCourtAdvantagePoints ?? 3));
    const strengthDiff = (homeStrength - awayStrength) + homeCourtAdvantage;
    const winProb      = fastHomeWinProbability(strengthDiff);
    const homeWins     = Math.random() < winProb;

    const absGap   = Math.abs(homeStrength - awayStrength);
    const baseLead = Math.max(2, Math.round(
      absGap * 0.9 + Math.abs(normalRandom(0, 6)) + 2
    ));

    const rawHomePlayers = homeOverridePlayers ?? players.filter(p => p.tid === homeTeam.id);
    const rawAwayPlayers = applyTemporaryTravelFatigue(
      awayOverridePlayers ?? players.filter(p => p.tid === awayTeam.id),
      awayTravel.awayFatigueShift,
    );
    const homePlayers = applyStaffGameEffectsToRoster(rawHomePlayers, homeTeam as any);
    const awayPlayers = applyStaffGameEffectsToRoster(rawAwayPlayers, awayTeam as any);
    const adjustedPlayerMap = new Map<string, Player>([
      ...homePlayers.map(player => [player.internalId, player] as const),
      ...awayPlayers.map(player => [player.internalId, player] as const),
    ]);
    const gameplayAdjustedPlayers = players.map(player => adjustedPlayerMap.get(player.internalId) ?? player);
    const fatigueAdjustedPlayers = applyTrainingFatiguePerformance(gameplayAdjustedPlayers);
    const inputStrengthMs = this.perfNow() - forensicStageStart;
    forensicStageStart = this.perfNow();
    const homeRatings = calcTeamRatings(homeTeam.id, fatigueAdjustedPlayers);
    const awayRatings = calcTeamRatings(awayTeam.id, fatigueAdjustedPlayers);

    const homeExpected = expectedTeamScore(homeRatings.offRating, awayRatings.defRating, homeRatings.pace);
    const awayExpected = expectedTeamScore(awayRatings.offRating, homeRatings.defRating, awayRatings.pace);

    // Score floors scale by game length — All-Star 3-min quarters (12 min total) need
    // ~22-pt floors, not the 85/80 designed for full-length 48-min NBA games.
    const homeQL = homeKnobs.quarterLength ?? 12;
    const awayQL = awayKnobs.quarterLength ?? 12;
    const homeNumQ = homeKnobs.numQuarters ?? 4;
    const awayNumQ = awayKnobs.numQuarters ?? 4;
    const lengthScale = ((homeQL * homeNumQ + awayQL * awayNumQ) / 2) / 48; // 1.0 for regulation, 0.25 for 3-min All-Star
    const homeMinFloor = Math.max(20, Math.round(85 * lengthScale));
    const awayMinFloor = Math.max(18, Math.round(80 * lengthScale));
    const homeRegScore = Math.max(homeMinFloor, Math.round(normalRandom(homeExpected * lengthScale, 8 * lengthScale)));
    const awayRegScore = Math.max(awayMinFloor, Math.round(normalRandom(awayExpected * lengthScale, 8 * lengthScale)));

    let winnerScore = Math.max(homeRegScore, awayRegScore);
    let loserScore  = Math.min(homeRegScore, awayRegScore);

    // Prevent tied scores outside of OT path
    if (winnerScore === loserScore && !allowTies) {
      if (Math.random() < 0.5) winnerScore += 1;
      else loserScore = Math.max(0, loserScore - 1);
    }

    let isOT    = false;
    let otCount = 0;
    let finalHomeScore: number;
    let finalAwayScore: number;
    let pendingShootout = false;
    let tiebreaker: GameTiebreaker | undefined;
    const baseGameFormat = (homeKnobs.gameFormat ?? awayKnobs.gameFormat ?? 'timed') as 'timed' | 'target_score' | 'elam_ending';
    const configuredTargetScore = Math.max(1, Math.round(((homeKnobs.targetScore ?? 0) + (awayKnobs.targetScore ?? 0)) / 2 || 0));
    const overtimeType = homeKnobs.overtimeType ?? awayKnobs.overtimeType ?? 'standard';
    const overtimeTargetPoints = Math.max(1, Math.round(((homeKnobs.overtimeTargetPoints ?? 0) + (awayKnobs.overtimeTargetPoints ?? 0)) / 2 || 0));

    const overtimeDuration = Math.max(1, ((homeKnobs.overtimeDuration ?? 5) + (awayKnobs.overtimeDuration ?? 5)) / 2);
    const overtimeEnabled = (homeKnobs.overtimeEnabled ?? true) && (awayKnobs.overtimeEnabled ?? true);
    const enabledOtCaps = [homeKnobs, awayKnobs]
      .filter(k => k.maxOvertimesEnabled)
      .map(k => Math.max(0, Math.floor(k.maxOvertimes ?? 0)));
    const maxOvertimes = enabledOtCaps.length > 0
      ? Math.min(...enabledOtCaps)
      : Number.POSITIVE_INFINITY;
    const otChance = baseLead <= 4 ? 0.38 : baseLead <= 8 ? 0.06 : 0;

    if (baseGameFormat === 'target_score') {
      const scaled = this.scaleWinnerToTarget(homeRegScore, awayRegScore, configuredTargetScore > 0 ? configuredTargetScore : 100);
      finalHomeScore = scaled.home;
      finalAwayScore = scaled.away;
    } else if (baseGameFormat === 'elam_ending') {
      const baseTargetAdd = overtimeTargetPoints > 0 ? overtimeTargetPoints : 24;
      const targetScore = Math.max(homeRegScore, awayRegScore) + baseTargetAdd;
      const race = this.simulateOTPeriod(true, strengthDiff, overtimeDuration);
      const homeGain = Math.round(race.homePts * baseTargetAdd / Math.max(1, Math.max(race.homePts, race.awayPts)));
      const awayGain = Math.round(race.awayPts * baseTargetAdd / Math.max(1, Math.max(race.homePts, race.awayPts)));
      finalHomeScore = Math.min(targetScore, homeRegScore + homeGain);
      finalAwayScore = Math.min(targetScore, awayRegScore + awayGain);
      if (finalHomeScore === finalAwayScore) {
        if (homeRegScore >= awayRegScore) finalHomeScore = targetScore;
        else finalAwayScore = targetScore;
      } else if (finalHomeScore < targetScore && finalAwayScore < targetScore) {
        if (finalHomeScore > finalAwayScore) finalHomeScore = targetScore;
        else finalAwayScore = targetScore;
      } else if (finalHomeScore >= targetScore && finalAwayScore >= targetScore) {
        if (homeRegScore >= awayRegScore) finalAwayScore = targetScore - 1;
        else finalHomeScore = targetScore - 1;
      }
      isOT = true;
      otCount = 1;
    } else if (!allowTies && otChance > 0 && Math.random() < otChance) {
      const regTie  = loserScore;
      if (overtimeType === 'shootout' || !overtimeEnabled) {
        const selected = overtimeType === 'shootout' ? 'shootout' : gameRules.overtimeTieBreaker;
        if (selected === 'shootout') {
          pendingShootout = true;
          finalHomeScore = regTie;
          finalAwayScore = regTie;
        } else if (selected === 'target_score') {
          isOT = true;
          otCount = 1;
          const race = this.simulateOTPeriod(true, strengthDiff, overtimeDuration);
          const scaled = this.scaleWinnerToTarget(race.homePts, race.awayPts, overtimeTargetPoints);
          finalHomeScore = regTie + scaled.home;
          finalAwayScore = regTie + scaled.away;
          tiebreaker = { type: 'target_score', homeScore: scaled.home, awayScore: scaled.away };
        } else {
          const homeWinsSd = Math.random() < (0.50 + strengthDiff * 0.008);
          const points = Math.random() < 0.25 ? 1 : Math.random() < 0.55 ? 2 : 3;
          finalHomeScore = regTie + (homeWinsSd ? points : 0);
          finalAwayScore = regTie + (homeWinsSd ? 0 : points);
          tiebreaker = { type: 'sudden_death', homeScore: homeWinsSd ? points : 0, awayScore: homeWinsSd ? 0 : points };
        }
      } else if (overtimeType === 'target_score') {
        isOT = true;
        otCount = 1;
        const race = this.simulateOTPeriod(true, strengthDiff, overtimeDuration);
        const scaled = this.scaleWinnerToTarget(race.homePts, race.awayPts, overtimeTargetPoints > 0 ? overtimeTargetPoints : 7);
        finalHomeScore = regTie + scaled.home;
        finalAwayScore = regTie + scaled.away;
        tiebreaker = { type: 'target_score', homeScore: scaled.home, awayScore: scaled.away };
      } else if (overtimeType === 'sudden_death') {
        isOT = true;
        otCount = 1;
        const homeWinsSd = Math.random() < (0.50 + strengthDiff * 0.008);
        const suddenDeathPts = Math.random() < 0.25 ? 1 : Math.random() < 0.55 ? 2 : 3;
        finalHomeScore = regTie + (homeWinsSd ? suddenDeathPts : 0);
        finalAwayScore = regTie + (homeWinsSd ? 0 : suddenDeathPts);
        tiebreaker = {
          type: 'sudden_death',
          homeScore: homeWinsSd ? suddenDeathPts : 0,
          awayScore: homeWinsSd ? 0 : suddenDeathPts,
        };
      } else {
        isOT = maxOvertimes !== 0;
        const rolledOtCount = Math.random() < 0.07 ? 3 : Math.random() < 0.22 ? 2 : 1;
        otCount = Math.min(rolledOtCount, maxOvertimes);
        const capStoppedGame = Number.isFinite(maxOvertimes) && rolledOtCount > maxOvertimes;

        let homeOtPts = 0;
        let awayOtPts = 0;

        for (let ot = 1; ot <= otCount; ot++) {
          const isDecisive = ot === otCount && !capStoppedGame;
          const { homePts, awayPts } = this.simulateOTPeriod(isDecisive, strengthDiff, overtimeDuration);
          homeOtPts += homePts;
          awayOtPts += awayPts;
        }

        finalHomeScore = regTie + homeOtPts;
        finalAwayScore = regTie + awayOtPts;

        if (finalHomeScore === finalAwayScore) {
          const selected = gameRules.overtimeTieBreaker;
          if (selected === 'shootout') {
            pendingShootout = true;
          } else if (selected === 'target_score') {
            const race = this.simulateOTPeriod(true, strengthDiff, overtimeDuration);
            const scaled = this.scaleWinnerToTarget(race.homePts, race.awayPts, overtimeTargetPoints);
            finalHomeScore += scaled.home;
            finalAwayScore += scaled.away;
            tiebreaker = { type: 'target_score', homeScore: scaled.home, awayScore: scaled.away };
          } else {
            const homeWinsSd = Math.random() < (0.50 + strengthDiff * 0.005);
            const points = Math.random() < 0.25 ? 1 : Math.random() < 0.55 ? 2 : 3;
            finalHomeScore += homeWinsSd ? points : 0;
            finalAwayScore += homeWinsSd ? 0 : points;
            tiebreaker = { type: 'sudden_death', homeScore: homeWinsSd ? points : 0, awayScore: homeWinsSd ? 0 : points };
          }
        }
      }

    } else {
      finalHomeScore = homeWins ? winnerScore : loserScore;
      finalAwayScore = homeWins ? loserScore  : winnerScore;
    }

    // ── Team night dice ──────────────────────────────────────────────────────
    // pace roll: shared (both teams) — creates slow grinds vs fast shootouts
    // eff roll:  independent per team — creates blowouts and cold-shooting nights
    // Both are uniform with mean 1.0 → long-run player averages are preserved
    const home2KDef = Defense2KService.getTeamDefense(homePlayers, homeKnobs.playersOnCourt ?? 5);
    const away2KDef = Defense2KService.getTeamDefense(awayPlayers, awayKnobs.playersOnCourt ?? 5);

    // Aura centered at 70: elite (82) → +0.06 debuff on opponent; bad (60) → -0.05 buff to opponent
    const homeDefAura = (home2KDef.overallDef - 70) * 0.005;
    const awayDefAura = (away2KDef.overallDef - 70) * 0.005;

    // Tempo / Early Offense / Fast Break: both teams pull the game toward their
    // preferred pace. Actual pace ≈ average of the two rosters' pace factors.
    // Run-and-gun vs run-and-gun → 130-128 shootouts; two grinders → 95-93.
    const homePaceFactor = homeOverridePlayers ? 1.0 : computePaceFactor(homeTeam.id, homePlayers);
    const awayPaceFactor = awayOverridePlayers ? 1.0 : computePaceFactor(awayTeam.id, awayPlayers);
    const sharedPaceFactor = (homePaceFactor + awayPaceFactor) / 2;

    const paceRoll    = (0.96 + Math.random() * 0.20) * sharedPaceFactor;   // calibrated 0.96–1.16 × pace bias
    // Crash Offensive Glass: crashing hard → fewer bodies back on D → opponent
    // gets more transition points. Neutral = 50 → no effect. 100 → +3% to opp.
    const homeCrashPre = homeOverridePlayers ? 50 : getDefenseSliders(homeTeam.id, homePlayers).crashOffensiveGlass;
    const awayCrashPre = awayOverridePlayers ? 50 : getDefenseSliders(awayTeam.id, awayPlayers).crashOffensiveGlass;
    const awayTransitionBonus = 1 + ((homeCrashPre - 50) / 50) * 0.03;
    const homeTransitionBonus = 1 + ((awayCrashPre - 50) / 50) * 0.03;
    const homeEffRoll = ((0.88 + Math.random() * 0.24) - awayDefAura) * homeTransitionBonus;
    const awayEffRoll = ((0.88 + Math.random() * 0.24) - homeDefAura) * awayTransitionBonus;

    const scoringUnitScale = gameRules.fieldGoalValue / 2;
    const sharedScoreEfficiency = Math.max(0.5, Math.min(1.5, ((homeKnobs.efficiencyMultiplier ?? 1) + (awayKnobs.efficiencyMultiplier ?? 1)) / 2));
    const sharedFastScorePace = Math.max(0.25, Math.min(2, (
      (homeKnobs.fastScorePaceMultiplier ?? 1) + (awayKnobs.fastScorePaceMultiplier ?? 1)
    ) / 2));
    const historicalFloorMultiplier = homeKnobs.eraCoachingBias || awayKnobs.eraCoachingBias
      ? Math.min(1, sharedScoreEfficiency * sharedFastScorePace)
      : 1;
    const homePostFloor = Math.max(1, Math.round(75 * lengthScale * scoringUnitScale * historicalFloorMultiplier));
    const awayPostFloor = Math.max(1, Math.round(70 * lengthScale * scoringUnitScale * historicalFloorMultiplier));
    const shootoutTiedScore = pendingShootout ? finalHomeScore : undefined;
    finalHomeScore = Math.max(homePostFloor, Math.round(finalHomeScore * paceRoll * homeEffRoll));
    finalAwayScore = Math.max(awayPostFloor, Math.round(finalAwayScore * paceRoll * awayEffRoll));

    // Exhibition score boost — applied BEFORE stat generation so player totals
    // match the scoreboard.  paceMultiplier in knobs is kept at 1.0 for All-Star
    // to avoid double-counting.
    const homeExhibMult = homeKnobs.exhibitionScoreMult ?? 1.0;
    const awayExhibMult = awayKnobs.exhibitionScoreMult ?? 1.0;
    if (homeExhibMult !== 1.0) finalHomeScore = Math.max(homePostFloor, Math.round(finalHomeScore * homeExhibMult));
    if (awayExhibMult !== 1.0) finalAwayScore = Math.max(awayPostFloor, Math.round(finalAwayScore * awayExhibMult));

    const homeScoreTempoBias = homeOverridePlayers ? 1 : resolveTeamEraCoachingBias(homeTeam.id, homeKnobs.eraCoachingBias).tempoMultiplier;
    const awayScoreTempoBias = awayOverridePlayers ? 1 : resolveTeamEraCoachingBias(awayTeam.id, awayKnobs.eraCoachingBias).tempoMultiplier;
    const sharedScoreTempoBias = Math.max(0.72, Math.min(1.30, (homeScoreTempoBias + awayScoreTempoBias) / 2));
    const historicalFastBaseline = homeKnobs.eraCoachingBias || awayKnobs.eraCoachingBias ? 0.94 : 1;
    const sharedHistoricalScoreMult = sharedScoreTempoBias * sharedScoreEfficiency * historicalFastBaseline;
    if (sharedHistoricalScoreMult !== 1.0 && !isAllStar && !isRisingStars) {
      finalHomeScore = Math.max(homePostFloor, Math.round(finalHomeScore * sharedHistoricalScoreMult));
      finalAwayScore = Math.max(awayPostFloor, Math.round(finalAwayScore * sharedHistoricalScoreMult));
    }
    if (sharedFastScorePace !== 1 && !isAllStar && !isRisingStars) {
      finalHomeScore = Math.max(homePostFloor, Math.round(finalHomeScore * sharedFastScorePace));
      finalAwayScore = Math.max(awayPostFloor, Math.round(finalAwayScore * sharedFastScorePace));
    }
    if (baseGameFormat === 'target_score') {
      const normalized = this.scaleWinnerToTarget(
        finalHomeScore,
        finalAwayScore,
        configuredTargetScore > 0 ? configuredTargetScore : 100,
      );
      finalHomeScore = normalized.home;
      finalAwayScore = normalized.away;
    } else if (baseGameFormat === 'elam_ending') {
      const normalized = this.normalizeElamScores(
        finalHomeScore,
        finalAwayScore,
        homeRegScore,
        awayRegScore,
        Math.max(homeRegScore, awayRegScore) + (overtimeTargetPoints > 0 ? overtimeTargetPoints : 24),
      );
      finalHomeScore = normalized.home;
      finalAwayScore = normalized.away;
    }

    if (shootoutTiedScore !== undefined) {
      finalHomeScore = shootoutTiedScore;
      finalAwayScore = shootoutTiedScore;
    }

    if (finalHomeScore === finalAwayScore && !pendingShootout && !allowTies) {
      if (Math.random() < 0.5) finalHomeScore += 1;
      else finalAwayScore += 1;
    }

    if (baseGameFormat === 'timed' && !isAllStar && !isRisingStars && !pendingShootout && !allowTies) {
      const rolledHomeWin = finalHomeScore > finalAwayScore;
      if (rolledHomeWin !== homeWins) {
        const winnerScoreAfterRoll = Math.max(finalHomeScore, finalAwayScore);
        const loserScoreAfterRoll = Math.min(finalHomeScore, finalAwayScore);
        finalHomeScore = homeWins ? winnerScoreAfterRoll : loserScoreAfterRoll;
        finalAwayScore = homeWins ? loserScoreAfterRoll : winnerScoreAfterRoll;
      }
    }

    let homeWinsFinal = pendingShootout ? homeWins : finalHomeScore > finalAwayScore;
    const isDraw = allowTies && finalHomeScore === finalAwayScore && !pendingShootout;
    const scoreCalculationMs = this.perfNow() - forensicStageStart;
    forensicStageStart = this.perfNow();

    const availablePlayers = gameplayAdjustedPlayers.filter(
      p => !p.injury || p.injury.gamesRemaining <= 0
    );

    const actualMargin = Math.abs(finalHomeScore - finalAwayScore);

    // Score-efficiency correlation: high-scoring games reflect hot shooting nights,
    // low-scoring games are grind/cold-shooting games. Multiplied into the knobs
    // so stat lines match the scoreboard energy. League avg preserved over many games.
    const homeEffMult = getEfficiencyMultFromScore(finalHomeScore);
    const awayEffMult = getEfficiencyMultFromScore(finalAwayScore);
    const homeKnobsEff = { ...homeKnobs, efficiencyMultiplier: (homeKnobs.efficiencyMultiplier ?? 1.0) * homeEffMult * (homeSysFit?.efficiencyMult ?? 1.0) };
    const awayKnobsEff = { ...awayKnobs, efficiencyMultiplier: (awayKnobs.efficiencyMultiplier ?? 1.0) * awayEffMult * (awaySysFit?.efficiencyMult ?? 1.0) };

    // Baseline order (usage*ovr) for each team — reused by biases, double team,
    // and coaching penalty. Empty for exhibitions.
    const homeBaselineOrder = homeOverridePlayers ? [] : buildBaselineOrder(homePlayers, gameRules.dribbleRule);
    const awayBaselineOrder = awayOverridePlayers ? [] : buildBaselineOrder(awayPlayers, gameRules.dribbleRule);

    // Scoring Options biases (Coaching → Preferences). Skip for exhibition games
    // (overridePlayers set) since synthetic rosters don't have user overrides.
    let homeBiases = homeOverridePlayers
      ? undefined
      : getScoringOptionBiases(homeBaselineOrder, getScoringOptions(homeTeam.id));
    let awayBiases = awayOverridePlayers
      ? undefined
      : getScoringOptionBiases(awayBaselineOrder, getScoringOptions(awayTeam.id));

    // Defense sliders — each team's defense projects onto the OPPONENT'S knobs.
    // Skip for exhibitions (synthetic rosters use default knobs).
    const homeDef = homeOverridePlayers ? null : getDefenseSliders(homeTeam.id, homePlayers);
    const awayDef = awayOverridePlayers ? null : getDefenseSliders(awayTeam.id, awayPlayers);

    // Run Plays dilutes scoring biases toward neutral. Low RP = more freelance
    // so user overrides matter less; RP=100 = full scripted effect.
    const diluteBiases = (biases: Map<string, { ptsMult: number; effMult: number }> | undefined, runPlays: number) => {
      if (!biases) return;
      const strength = Math.max(0, Math.min(1, runPlays / 100));
      biases.forEach((v, k) => {
        biases.set(k, {
          ptsMult: 1 + (v.ptsMult - 1) * strength,
          effMult: 1 + (v.effMult - 1) * strength,
        });
      });
    };
    if (homeDef) diluteBiases(homeBiases, homeDef.runPlays);
    if (awayDef) diluteBiases(awayBiases, awayDef.runPlays);

    // Double Team — opponent's DT slider debuffs YOUR #1 baseline scorer.
    // Injected into biases Map (creating it if user hasn't set scoring options).
    const applyDoubleTeam = (
      biases: Map<string, { ptsMult: number; effMult: number }> | undefined,
      baseline: string[],
      oppDoubleTeam: number
    ) => {
      if (!biases || !baseline[0] || oppDoubleTeam < 5) return biases;
      const dt = oppDoubleTeam / 100;
      const existing = biases.get(baseline[0]) ?? { ptsMult: 1, effMult: 1 };
      biases.set(baseline[0], {
        ptsMult: existing.ptsMult * (1 - dt * 0.15),
        effMult: existing.effMult * (1 - dt * 0.08),
      });
      return biases;
    };
    if (awayDef && !homeOverridePlayers) {
      homeBiases = homeBiases ?? new Map();
      applyDoubleTeam(homeBiases, homeBaselineOrder, awayDef.doubleTeam);
    }
    if (homeDef && !awayOverridePlayers) {
      awayBiases = awayBiases ?? new Map();
      applyDoubleTeam(awayBiases, awayBaselineOrder, homeDef.doubleTeam);
    }

    // System-specific knob mods — pace/shot/efficiency bonuses for running
    // the right system. Also handles the Heliocentric star ptsMult injection
    // into the biases map so the #1 option reaches prime-usage scoring volume.
    // Skip for exhibition/override rosters.
    const homeSysMods = homeOverridePlayers ? null : getSystemKnobMods(homeTeam.id);
    const awaySysMods = awayOverridePlayers ? null : getSystemKnobMods(awayTeam.id);

    const applyHelioStarBoost = (
      biases: Map<string, { ptsMult: number; effMult: number }> | undefined,
      baseline: string[],
      mods: ReturnType<typeof getSystemKnobMods> | null
    ) => {
      if (!mods || mods.helioStarPtsMod === 1 || !baseline[0]) return;
      const existing = biases?.get(baseline[0]) ?? { ptsMult: 1, effMult: 1 };
      if (!biases) return;
      biases.set(baseline[0], {
        ptsMult: existing.ptsMult * mods.helioStarPtsMod,
        effMult:  existing.effMult  * mods.helioStarEffMod,
      });
    };
    if (!homeOverridePlayers) {
      homeBiases = homeBiases ?? new Map();
      applyHelioStarBoost(homeBiases, homeBaselineOrder, homeSysMods);
    }
    if (!awayOverridePlayers) {
      awayBiases = awayBiases ?? new Map();
      applyHelioStarBoost(awayBiases, awayBaselineOrder, awaySysMods);
    }

    // Shot Distribution sliders (Coaching → Strategy) → per-team shot mix. Skip
    // for exhibition games — synthetic rosters use default knobs.
    const homeShotMults = homeOverridePlayers ? null : computeShotMults(homeTeam.id, homePlayers);
    const awayShotMults = awayOverridePlayers ? null : computeShotMults(awayTeam.id, awayPlayers);
    const homeEraBias = homeOverridePlayers ? NEUTRAL_ERA_COACHING_BIAS : resolveTeamEraCoachingBias(homeTeam.id, homeKnobsEff.eraCoachingBias);
    const awayEraBias = awayOverridePlayers ? NEUTRAL_ERA_COACHING_BIAS : resolveTeamEraCoachingBias(awayTeam.id, awayKnobsEff.eraCoachingBias);
    if (homeBaselineOrder[0] && homeEraBias.primaryOptionUsageMultiplier !== 1) {
      const current = homeBiases?.get(homeBaselineOrder[0]) ?? { ptsMult: 1, effMult: 1 };
      homeBiases?.set(homeBaselineOrder[0], { ...current, ptsMult: current.ptsMult * homeEraBias.primaryOptionUsageMultiplier });
    }
    if (awayBaselineOrder[0] && awayEraBias.primaryOptionUsageMultiplier !== 1) {
      const current = awayBiases?.get(awayBaselineOrder[0]) ?? { ptsMult: 1, effMult: 1 };
      awayBiases?.set(awayBaselineOrder[0], { ...current, ptsMult: current.ptsMult * awayEraBias.primaryOptionUsageMultiplier });
    }

    // Defensive stack — what the opponent's defense projects onto your knobs.
    const homeOpponentStack = awayDef ? defensiveStackOnOpponent(awayDef) : null;
    const awayOpponentStack = homeDef ? defensiveStackOnOpponent(homeDef) : null;
    const homeDefenseStack = homeDef ? defensiveStackOnOpponent(homeDef) : null;
    const awayDefenseStack = awayDef ? defensiveStackOnOpponent(awayDef) : null;

    // Compose final per-team knobs: base × shotMults × opponent-defense.
    // rimRate and threePointRate are multiplicative stacks; interiorEffMult
    // drops in fresh; tovMult/ftRateMult compound with the base value.
    const homeFastEraAdapter = getFastEraSimulationAdapter(homeEraBias, homeKnobs.efficiencyMultiplier ?? 1);
    const awayFastEraAdapter = getFastEraSimulationAdapter(awayEraBias, awayKnobs.efficiencyMultiplier ?? 1);
    const homeKnobsFinal: SimulatorKnobs = {
      ...homeKnobsEff,
      ...(homeShotMults ?? {}),
      paceMultiplier:     (homeKnobsEff.paceMultiplier     ?? 1) * (homeSysMods?.paceBonus     ?? 1),
      efficiencyMultiplier:(homeKnobsEff.efficiencyMultiplier ?? 1) * homeFastEraAdapter.efficiencyMultiplier * (homeSysMods?.efficiencyMod ?? 1) * homeFamMods.efficiencyMult * awayFamMods.opponentEfficiencyMult * awayTrainingAura.opponentEfficiencyMult,
      ftRateMult:         (homeKnobsEff.ftRateMult ?? 1) * homeFastEraAdapter.freeThrowRateMultiplier * (homeOpponentStack?.ftRateMult ?? 1),
      interiorEffMult:    homeOpponentStack?.interiorEffMult ?? 1,
      rimRateMult:        (homeKnobsEff.rimRateMult        ?? 1) * (homeShotMults?.rimRateMult        ?? 1) * (homeOpponentStack?.rimRateMult        ?? 1) * (homeSysMods?.rimMod        ?? 1) * homeEraBias.rimRateMultiplier,
      lowPostRateMult:    (homeKnobsEff.lowPostRateMult    ?? 1) * (homeShotMults?.lowPostRateMult    ?? 1) * (homeSysMods?.lowPostMod   ?? 1) * homeEraBias.lowPostRateMultiplier,
      midRangeRateMult:   (homeKnobsEff.midRangeRateMult   ?? 1) * (homeShotMults?.midRangeRateMult  ?? 1) * (homeSysMods?.midRangeMod  ?? 1) * homeEraBias.midRangeRateMultiplier,
      threePointRateMult: (homeKnobsEff.threePointRateMult ?? 1) * homeFastEraAdapter.threePointRateMultiplier * (homeShotMults?.threePointRateMult ?? 1) * (homeOpponentStack?.threePointRateMult ?? 1) * (homeSysMods?.threePointMod ?? 1) * homeEraBias.outsideRateMultiplier,
      threePointSkillExponentMult: (homeKnobsEff.threePointSkillExponentMult ?? 1) * (homeFastEraAdapter.threePointSkillExponentMultiplier ?? 1),
      threePointPersonalCapMult: (homeKnobsEff.threePointPersonalCapMult ?? 1) * (homeFastEraAdapter.threePointPersonalCapMultiplier ?? 1),
      threePointEfficiencyMult: (homeKnobsEff.threePointEfficiencyMult ?? 1) * homeFastEraAdapter.threePointEfficiencyMultiplier,
      stealRateMult: (homeKnobsEff.stealRateMult ?? 1) * (homeDefenseStack?.stealRateMult ?? 1),
      tovMult: (homeKnobsEff.tovMult ?? 1) * (homeOpponentStack?.tovMult ?? 1) * homeFamMods.tovMult * awayFamMods.opponentTovMult * awayTrainingAura.opponentTovMult,
    };
    const awayKnobsFinal: SimulatorKnobs = {
      ...awayKnobsEff,
      ...(awayShotMults ?? {}),
      paceMultiplier:     (awayKnobsEff.paceMultiplier     ?? 1) * (awaySysMods?.paceBonus     ?? 1),
      efficiencyMultiplier:(awayKnobsEff.efficiencyMultiplier ?? 1) * awayFastEraAdapter.efficiencyMultiplier * (awaySysMods?.efficiencyMod ?? 1) * awayFamMods.efficiencyMult * homeFamMods.opponentEfficiencyMult * homeTrainingAura.opponentEfficiencyMult,
      ftRateMult:         (awayKnobsEff.ftRateMult ?? 1) * awayFastEraAdapter.freeThrowRateMultiplier * (awayOpponentStack?.ftRateMult ?? 1),
      interiorEffMult:    awayOpponentStack?.interiorEffMult ?? 1,
      rimRateMult:        (awayKnobsEff.rimRateMult        ?? 1) * (awayShotMults?.rimRateMult        ?? 1) * (awayOpponentStack?.rimRateMult        ?? 1) * (awaySysMods?.rimMod        ?? 1) * awayEraBias.rimRateMultiplier,
      lowPostRateMult:    (awayKnobsEff.lowPostRateMult    ?? 1) * (awayShotMults?.lowPostRateMult    ?? 1) * (awaySysMods?.lowPostMod   ?? 1) * awayEraBias.lowPostRateMultiplier,
      midRangeRateMult:   (awayKnobsEff.midRangeRateMult   ?? 1) * (awayShotMults?.midRangeRateMult  ?? 1) * (awaySysMods?.midRangeMod  ?? 1) * awayEraBias.midRangeRateMultiplier,
      threePointRateMult: (awayKnobsEff.threePointRateMult ?? 1) * awayFastEraAdapter.threePointRateMultiplier * (awayShotMults?.threePointRateMult ?? 1) * (awayOpponentStack?.threePointRateMult ?? 1) * (awaySysMods?.threePointMod ?? 1) * awayEraBias.outsideRateMultiplier,
      threePointSkillExponentMult: (awayKnobsEff.threePointSkillExponentMult ?? 1) * (awayFastEraAdapter.threePointSkillExponentMultiplier ?? 1),
      threePointPersonalCapMult: (awayKnobsEff.threePointPersonalCapMult ?? 1) * (awayFastEraAdapter.threePointPersonalCapMultiplier ?? 1),
      threePointEfficiencyMult: (awayKnobsEff.threePointEfficiencyMult ?? 1) * awayFastEraAdapter.threePointEfficiencyMultiplier,
      stealRateMult: (awayKnobsEff.stealRateMult ?? 1) * (awayDefenseStack?.stealRateMult ?? 1),
      tovMult: (awayKnobsEff.tovMult ?? 1) * (awayOpponentStack?.tovMult ?? 1) * awayFamMods.tovMult * homeFamMods.opponentTovMult * homeTrainingAura.opponentTovMult,
    };

    const homeOverrideForStats = homeOverridePlayers ? applyTrainingFatiguePerformance(rawHomePlayers) : undefined;
    const awayOverrideForStats = awayOverridePlayers ? applyTrainingFatiguePerformance(rawAwayPlayers) : undefined;
    const usageAllocationMs = this.perfNow() - forensicStageStart;
    forensicStageStart = this.perfNow();
    const homeInitial = StatGenerator.generateStatsForTeam(
      homeTeam, fatigueAdjustedPlayers, finalHomeScore, homeWinsFinal, actualMargin, { league3PAMult: 1.0 }, currentSeason, homeOverrideForStats, otCount, away2KDef, homeKnobsFinal, homeBiases
    );
    const awayInitial = StatGenerator.generateStatsForTeam(
      awayTeam, fatigueAdjustedPlayers, finalAwayScore, !homeWinsFinal, actualMargin, { league3PAMult: 1.0 }, currentSeason, awayOverrideForStats, otCount, home2KDef, awayKnobsFinal, awayBiases
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
      (sum, p) => sum + Math.max(0, (p.fga - p.threePa - (p.fourPa ?? 0)) - (p.fgm - p.threePm - (p.fourPm ?? 0))), 0
    );
    const awayInteriorMisses = awayInitial.reduce(
      (sum, p) => sum + Math.max(0, (p.fga - p.threePa - (p.fourPa ?? 0)) - (p.fgm - p.threePm - (p.fourPm ?? 0))), 0
    );

    const homeFTA = homeInitial.reduce((sum, p) => sum + p.fta, 0);
    const awayFTA = awayInitial.reduce((sum, p) => sum + p.fta, 0);

    const homeBlkMult = homeKnobsFinal.blockRateMult ?? 1.0;
    const awayBlkMult = awayKnobsFinal.blockRateMult ?? 1.0;

    // Crash Offensive Glass → ORB pool multiplier per team. 50 = neutral.
    // 100 → +35% ORB (Dennis Rodman-mode); 0 → −30% ORB (everyone sprints back).
    const homeReboundOpportunityMult = homeKnobsFinal.reboundOpportunityMult ?? 1;
    const awayReboundOpportunityMult = awayKnobsFinal.reboundOpportunityMult ?? 1;
    const homeOrbMult = (1 + ((homeCrashPre - 50) / 50) * 0.35) * (homeKnobsFinal.orbRateMult ?? 1.0) * homeReboundOpportunityMult;
    const awayOrbMult = (1 + ((awayCrashPre - 50) / 50) * 0.35) * (awayKnobsFinal.orbRateMult ?? 1.0) * awayReboundOpportunityMult;

    // DRB pool keeps the existing 0.70 base (league-wide REB mean is already on target).
    // Layer a small winner-edge with per-team variance: winning team's defense forces
    // a slight extra miss, but with ±5% wobble so the asymmetry isn't deterministic.
    // Real NBA: NYK 140-89 ATL blowout (51-pt diff) has only +11 REB for winner — the
    // natural FG%-divergence mechanism already produces most of that asymmetry. Edge
    // is kept tiny (2%) to nudge symmetric-profile games (e.g. DET-SAC 144-103 with
    // equal misses) toward winner without overshooting brick-fest games. Mean-preserving
    // because winner/loser are roughly 50/50 across the season.
    const WINNER_EDGE = 0.02;  // +2% DRB to winner, -2% to loser
    const homeDrbWobble = 1 + (Math.random() - 0.5) * 0.10;  // ±5% per team
    const awayDrbWobble = 1 + (Math.random() - 0.5) * 0.10;
    const homeDrbMult   = (homeWinsFinal ? (1 + WINNER_EDGE) : (1 - WINNER_EDGE)) * homeDrbWobble;
    const awayDrbMult   = (homeWinsFinal ? (1 - WINNER_EDGE) : (1 + WINNER_EDGE)) * awayDrbWobble;

    const homeStats = StatGenerator.generateCoordinatedStats(
      homeInitial,
      homeTeam,
      availablePlayers,
      awayMisses         * 0.58 * homeDrbMult * homeReboundOpportunityMult,
      awayTov            * 0.48 * (homeKnobsFinal.stealRateMult ?? 1.0),
      awayInteriorMisses * getFastEraInteriorBlockMissShare(homeEraBias) * awayBlkMult,
      awayFTA,
      currentSeason,
      otCount,
      home2KDef,  // home team's defensive ratings (sizes their steal/block pools)
      away2KDef,  // away team's pass perception (shrinks home's assist pool)
      homeOrbMult,
      homeKnobsFinal.quarterLength ?? 12,
      homeKnobsFinal.overtimeDuration ?? 5,
      homeKnobsFinal.numQuarters ?? 4,
      homeKnobsFinal.playersOnCourt ?? 5,
      homeKnobsFinal.gameRules?.foulOutLimit ?? 6,
      homeKnobsFinal.assistRateMult ?? 1,
      getFastEraReboundDistributionExponent(homeEraBias, homeKnobsFinal.reboundDistributionExponent),
      getFastEraAssistDistributionExponent(homeEraBias, homeKnobsFinal.assistDistributionExponent),
      homeKnobsFinal.personalFoulRateMult ?? 1,
    );
    const awayStats = StatGenerator.generateCoordinatedStats(
      awayInitial,
      awayTeam,
      availablePlayers,
      homeMisses         * 0.58 * awayDrbMult * awayReboundOpportunityMult,
      homeTov            * 0.48 * (awayKnobsFinal.stealRateMult ?? 1.0),
      homeInteriorMisses * getFastEraInteriorBlockMissShare(awayEraBias) * homeBlkMult,
      homeFTA,
      currentSeason,
      otCount,
      away2KDef,  // away team's defensive ratings
      home2KDef,  // home team's pass perception
      awayOrbMult,
      awayKnobsFinal.quarterLength ?? 12,
      awayKnobsFinal.overtimeDuration ?? 5,
      awayKnobsFinal.numQuarters ?? 4,
      awayKnobsFinal.playersOnCourt ?? 5,
      awayKnobsFinal.gameRules?.foulOutLimit ?? 6,
      awayKnobsFinal.assistRateMult ?? 1,
      getFastEraReboundDistributionExponent(awayEraBias, awayKnobsFinal.reboundDistributionExponent),
      getFastEraAssistDistributionExponent(awayEraBias, awayKnobsFinal.assistDistributionExponent),
      awayKnobsFinal.personalFoulRateMult ?? 1,
    );
    const boxScoreGenerationMs = this.perfNow() - forensicStageStart;
    forensicStageStart = this.perfNow();
    const { homeStatsFinal, awayStatsFinal } = finalizeBoxScore(
      homeStats,
      awayStats,
      finalHomeScore,
      finalAwayScore,
      homeOverrideForStats ?? fatigueAdjustedPlayers.filter(player => player.tid === homeTeam.id),
      awayOverrideForStats ?? fatigueAdjustedPlayers.filter(player => player.tid === awayTeam.id),
      currentSeason,
      gameRules,
      homeKnobsFinal.boxScoreFgaNormalizationMult ?? 1,
      awayKnobsFinal.boxScoreFgaNormalizationMult ?? 1,
    );

    // then replace homeStats → homeStatsFinal, awayStats → awayStatsFinal below:
    const winnerStats = homeWinsFinal ? homeStatsFinal : awayStatsFinal;  // ← was homeStats/awayStats
    const winnerTeamId = homeWinsFinal ? homeTeam.id : awayTeam.id;
    let gameWinner = pickGameWinner(
      winnerStats,
      winnerTeamId,
      Math.abs(finalHomeScore - finalAwayScore),
      isOT,
      players,
    );

    const averageNumQuarters = Math.round(((homeKnobsFinal.numQuarters ?? 4) + (awayKnobsFinal.numQuarters ?? 4)) / 2);
    let quarterScores = simulateQuarters(
      finalHomeScore,
      finalAwayScore,
      Math.abs(finalHomeScore - finalAwayScore),
      isOT ? otCount : 0,
      averageNumQuarters
    );
    if (baseGameFormat === 'target_score') {
      quarterScores = { home: [finalHomeScore], away: [finalAwayScore] };
      isOT = false;
      otCount = 0;
    } else if (baseGameFormat === 'elam_ending') {
      const regulationQuarterScores = simulateQuarters(
        homeRegScore,
        awayRegScore,
        Math.abs(homeRegScore - awayRegScore),
        0,
        averageNumQuarters
      );
      regulationQuarterScores.home.push(Math.max(0, finalHomeScore - homeRegScore));
      regulationQuarterScores.away.push(Math.max(0, finalAwayScore - awayRegScore));
      quarterScores = regulationQuarterScores;
    }

    annotateFourthQuarterPoints(homeStatsFinal, awayStatsFinal, quarterScores, otCount, {
      numQuarters: averageNumQuarters,
      quarterLengthSeconds: Math.max(1, Math.round(((homeKnobsFinal.quarterLength ?? 12) + (awayKnobsFinal.quarterLength ?? 12)) / 2)) * 60,
      overtimeLengthSeconds: Math.max(1, Math.round(((homeKnobsFinal.overtimeDuration ?? 5) + (awayKnobsFinal.overtimeDuration ?? 5)) / 2)) * 60,
    });
    const boxScoreFinalizationMs = this.perfNow() - forensicStageStart;
    const fastCoreMs = inputStrengthMs + scoreCalculationMs + usageAllocationMs + boxScoreGenerationMs + boxScoreFinalizationMs;
    forensicStageStart = this.perfNow();

    const gamePlayers = homeOverridePlayers && awayOverridePlayers 
      ? [...homeOverridePlayers, ...awayOverridePlayers]
      : availablePlayers.filter(
          p => p.tid === homeTeam.id || p.tid === awayTeam.id
        );
    const injuries = InjurySystem.checkInjuries(gamePlayers, homeTeam, awayTeam, injuryFrequencyFactor);

    // Record DNP reasons at time of simulation so historical views stay accurate
    const playedHomeIds = new Set(homeStatsFinal.map(s => s.playerId));
    const playedAwayIds = new Set(awayStatsFinal.map(s => s.playerId));

    // Stamp checkInjuries results with startDate + origin. Every game-day injury gets
    // an opponent label based on the player's team — even bench guys, so the UI shows
    // "Nov 5 vs LAC" consistently. Pre-existing roster injuries remain the only ones
    // without an origin (they get "Last Season"/"Summer 2025" at init).
    const homeAbbrev = (homeTeam as any).abbrev;
    const awayAbbrev = (awayTeam as any).abbrev;
    for (const inj of injuries) {
      if (inj.startDate) continue; // already stamped by mid-game path
      inj.startDate = date;
      const isHome = inj.teamId === homeTeam.id;
      const oppAbbrev = isHome ? awayAbbrev : homeAbbrev;
      if (oppAbbrev) inj.origin = `${isHome ? 'vs' : '@'} ${oppAbbrev}`;
    }
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

    // ── Players who suited up already hurt (play-through injuries) ──────────
    // Snapshot the pre-existing injury for anyone who actually logged minutes.
    // BoxScoreModal renders these with an orange indicator ("playing hurt").
    const playersPlayingHurt: Record<string, string> = {};
    const playedAllStats = [...homeStatsFinal, ...awayStatsFinal];
    for (const stat of playedAllStats) {
      const src = availablePlayers.find(p => p.internalId === stat.playerId);
      const g = src?.injury?.gamesRemaining ?? 0;
      if (g > 0 && src?.injury?.type) {
        playersPlayingHurt[stat.playerId] = src.injury.type;
      }
    }

    // ── Mid-game injuries — any player can roll, low-minute players much more likely ──
    // Low minutes (< 15) = clearly left early → 20% chance it's real
    // Short night (15-25) = possible early exit → 7% chance
    // Full game (25-35) = contact/twist late → 2% chance
    // Iron man (35+) → 0.6% chance
    const injuryDefs = getInjuries();
    const playerInGameInjuries: Record<string, { type: string; quarter: number }> = {};
    const liveEvents: GameLiveEvent[] = [];
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
        const fatigue = Math.max(0, Math.min(100, Number((player as any).trainingFatigue ?? 0)));
        const fatigueRiskMult = 1 + Math.min(1.5, fatigue / 70);
        const durability = getRealDurability(player);
        const durabilityRiskMult = durability == null
          ? 1.0
          : Math.max(0.75, Math.min(1.50, 1 + ((60 - durability) / 90)));
        const minuteExposureMult =
          min < 8   ? 0.25 :
          min < 15  ? 0.50 :
          min < 25  ? 0.85 :
          min < 35  ? 1.15 :
                      1.45;
        const medical = getTeamMedicalGameplayEffects(player.tid === homeTeam.id ? homeTeam as any : awayTeam as any);
        const injuryChance = injuryChanceWithLeagueFactor(
          preseasonFactor * fatigueRiskMult * 0.012 * minuteExposureMult * durabilityRiskMult * medical.injuryRiskMultiplier,
          injuryFrequencyFactor,
        );

        if (Math.random() >= injuryChance) continue;

        const drawn = getRandomInjury(injuryDefs);
        // JSON `games` is the empirical mean — stay close to it (σ=0.15, clamp 0.75–1.30).
        // Early exits are slightly milder; full-game contacts are full severity.
        const u1 = 1 - Math.random(), u2 = 1 - Math.random();
        const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const baseMult = Math.max(0.75, Math.min(1.30, 1.0 + z * 0.15));
        const severityAdj =
          min >= 36 ? 0.08 :
          min >= 28 ? 0.04 :
          min < 10  ? -0.08 :
          min < 18  ? -0.04 :
                      0;
        const gameMult = Math.max(0.70, baseMult + severityAdj);
        const gamesRemaining = enforceSeasonEndingMinimum(drawn.name, Math.max(1, Math.round(drawn.games * gameMult)));

        // Origin label — mid-game injury → prefix by side. Home team vs opponent, away team @ opponent.
        const isHome = player.tid === homeTeam.id;
        const oppAbbrev = isHome ? (awayTeam as any).abbrev : (homeTeam as any).abbrev;
        const origin = oppAbbrev ? `${isHome ? 'vs' : '@'} ${oppAbbrev}` : undefined;
        injuries.push({
          playerId:       player.internalId,
          playerName:     player.name,
          teamId:         player.tid,
          injuryType:     drawn.name,
          gamesRemaining,
          startDate:      date,
          origin,
        });
        // Only flag "left early" if the injury actually costs the player games.
        // Use stat.min (total minutes played) to approximate the quarter they exited:
        // 0–12 → Q1, 12–24 → Q2, 24–36 → Q3, 36+ → Q4 (OT clamps to 4).
        if (gamesRemaining > 0) {
          const quarter = Math.max(1, Math.min(4, Math.ceil(Math.max(1, stat.min) / 12)));
          playerInGameInjuries[player.internalId] = { type: drawn.name, quarter };
          const team = isHome ? 'HOME' : 'AWAY';
          const quarterLengthMinutes = Math.max(1, ((homeKnobsFinal.quarterLength ?? 12) + (awayKnobsFinal.quarterLength ?? 12)) / 2);
          const clockSeconds = Math.max(0, Math.round(quarterLengthMinutes * 60 - ((Math.max(1, stat.min) - ((quarter - 1) * quarterLengthMinutes)) * 60)));
          const mm = Math.floor(clockSeconds / 60);
          const ss = String(clockSeconds % 60).padStart(2, '0');
          liveEvents.push({
            kind: 'injury',
            team,
            quarter,
            gs: ((quarter - 1) * quarterLengthMinutes * 60) + ((quarterLengthMinutes * 60) - clockSeconds),
            clock: `${mm}:${ss}`,
            playerId: player.internalId,
            playerName: player.name,
            description: `${player.name} is down and will be evaluated for a ${drawn.name.toLowerCase()}.`,
          });
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
    if (fight) {
      const involvedStats = [...homeStatsFinal, ...awayStatsFinal].filter(
        stat => stat.playerId === fight.player1Id || stat.playerId === fight.player2Id,
      );
      const avgMinutes = involvedStats.length > 0
        ? involvedStats.reduce((sum, stat) => sum + (stat.min ?? 0), 0) / involvedStats.length
        : 24;
      const quarterLengthMinutes = Math.max(1, ((homeKnobsFinal.quarterLength ?? 12) + (awayKnobsFinal.quarterLength ?? 12)) / 2);
      const fightQuarter = Math.max(1, Math.min(4, Math.ceil(Math.max(1, avgMinutes) / quarterLengthMinutes)));
      const clockSeconds = Math.max(0, Math.round(quarterLengthMinutes * 60 - ((Math.max(1, avgMinutes) - ((fightQuarter - 1) * quarterLengthMinutes)) * 60)));
      const mm = Math.floor(clockSeconds / 60);
      const ss = String(clockSeconds % 60).padStart(2, '0');
      const team = fight.player1TeamId === homeTeam.id ? 'HOME' : 'AWAY';
      const playerId = team === 'HOME' ? fight.player1Id : fight.player2Id;
      const playerName = team === 'HOME' ? fight.player1Name : fight.player2Name;
      const opponentName = team === 'HOME' ? fight.player2Name : fight.player1Name;
      const fightLabel = gameRules.fightingInstantEjection && gameRules.useYellowRedCards
        ? `${playerName} and ${opponentName} receive red cards after the fight. Both will be suspended for the next game.`
        : gameRules.fightingInstantEjection
          ? `${playerName} and ${opponentName} are ejected after the fight.`
          : fight.severity === 'brawl'
            ? `${playerName} and ${opponentName} are going at it. Benches are clearing.`
            : `${playerName} gets into it with ${opponentName} after the play.`;
      liveEvents.push({
        kind: 'fight',
        team,
        quarter: fightQuarter,
        gs: ((fightQuarter - 1) * quarterLengthMinutes * 60) + ((quarterLengthMinutes * 60) - clockSeconds),
        clock: `${mm}:${ss}`,
        playerId,
        playerName,
        opponentName,
        description: fightLabel,
      });
    }

    const highlights = HighlightGenerator.processGame(
      homeStatsFinal,
      awayStatsFinal,
      homeTeam.id,
      awayTeam.id,
      availablePlayers,
      gameRules,
    );

    const applyDunkValue = (stats: typeof homeStatsFinal) => stats.reduce((teamBonus, stat) => {
      const bonus = Math.max(0, gameRules.dunkValue - 2) * Math.max(0, stat.dunks ?? 0);
      if (bonus > 0) {
        stat.pts += bonus;
        stat.gameScore += bonus;
      }
      return teamBonus + bonus;
    }, 0);
    const homeDunkBonus = applyDunkValue(homeStatsFinal);
    const awayDunkBonus = applyDunkValue(awayStatsFinal);
    finalHomeScore += homeDunkBonus;
    finalAwayScore += awayDunkBonus;
    if (homeDunkBonus > 0 && quarterScores.home.length > 0) {
      quarterScores.home[quarterScores.home.length - 1] += homeDunkBonus;
    }
    if (awayDunkBonus > 0 && quarterScores.away.length > 0) {
      quarterScores.away[quarterScores.away.length - 1] += awayDunkBonus;
    }
    if (baseGameFormat === 'target_score' || baseGameFormat === 'elam_ending') {
      const target = baseGameFormat === 'target_score'
        ? (configuredTargetScore > 0 ? configuredTargetScore : 100)
        : Math.max(homeRegScore, awayRegScore) + (overtimeTargetPoints > 0 ? overtimeTargetPoints : 24);
      const normalized = baseGameFormat === 'elam_ending'
        ? this.normalizeElamScores(finalHomeScore, finalAwayScore, homeRegScore, awayRegScore, target)
        : this.scaleWinnerToTarget(finalHomeScore, finalAwayScore, target);
      finalHomeScore = normalized.home;
      finalAwayScore = normalized.away;
      reconcileTeamPointsToScore(homeStatsFinal, finalHomeScore, gameRules);
      reconcileTeamPointsToScore(awayStatsFinal, finalAwayScore, gameRules);
      const reconcilePeriods = (periods: number[], score: number) => {
        if (periods.length === 0) return;
        const delta = score - periods.reduce((sum, points) => sum + points, 0);
        periods[periods.length - 1] = Math.max(0, periods[periods.length - 1] + delta);
      };
      reconcilePeriods(quarterScores.home, finalHomeScore);
      reconcilePeriods(quarterScores.away, finalAwayScore);
    }

    if (pendingShootout && finalHomeScore !== finalAwayScore) {
      pendingShootout = false;
    }
    if (pendingShootout) {
      const shootout = resolveShootout(homeStatsFinal, awayStatsFinal, availablePlayers, gameRules.shootoutRounds);
      tiebreaker = shootout.tiebreaker;
      homeWinsFinal = shootout.winner === 'home';
    } else {
      homeWinsFinal = finalHomeScore > finalAwayScore;
    }

    const ejections: GameEjection[] = [];
    const addEjection = (
      playerId: string,
      reason: GameEjection['reason'],
      quarter: number,
      clock: string,
      suspensionGames?: number,
    ) => {
      const player = availablePlayers.find(candidate => candidate.internalId === playerId);
      if (!player || ejections.some(event => event.playerId === playerId && event.reason === reason)) return;
      ejections.push({
        playerId,
        playerName: player.name,
        teamId: player.tid,
        reason,
        quarter,
        clock,
        card: gameRules.useYellowRedCards && reason !== 'foul_out' ? 'red' : undefined,
        suspensionGames,
      });
    };

    for (const stat of [...homeStatsFinal, ...awayStatsFinal]) {
      while (
        (stat.techs ?? 0) > 0
        && (stat.techs ?? 0) < gameRules.techEjectionLimit
        && Math.random() < 0.12
      ) {
        stat.techs = (stat.techs ?? 0) + 1;
      }
      if (stat.pf >= gameRules.foulOutLimit) {
        addEjection(stat.playerId, 'foul_out', averageNumQuarters + otCount, '0:00');
      }
      if ((stat.techs ?? 0) >= gameRules.techEjectionLimit) {
        addEjection(
          stat.playerId,
          gameRules.useYellowRedCards ? 'red_card' : 'technical',
          Math.min(averageNumQuarters, 3),
          '4:00',
          gameRules.useYellowRedCards ? 1 : undefined,
        );
      } else if ((stat.techs ?? 0) > 0 && gameRules.useYellowRedCards) {
        const player = availablePlayers.find(candidate => candidate.internalId === stat.playerId);
        if (player) {
          liveEvents.push({
            kind: 'rule',
            team: player.tid === homeTeam.id ? 'HOME' : 'AWAY',
            quarter: Math.min(averageNumQuarters, 3),
            gs: Math.max(1, (Math.min(averageNumQuarters, 3) - 1) * (homeKnobsFinal.quarterLength ?? 12) * 60 + 480),
            clock: '4:00',
            playerId: player.internalId,
            playerName: player.name,
            description: `${player.name} receives a yellow card for a technical foul.`,
          });
        }
      }
    }

    if (!isAllStar && !isRisingStars && Math.random() < 0.018) {
      const candidates = [...homeStatsFinal, ...awayStatsFinal].filter(stat => stat.min > 8);
      const offender = candidates.sort((a, b) => b.pf - a.pf)[0];
      if (offender) {
        const isFlagrant2 = Math.random() < 0.18;
        const limit = isFlagrant2 ? gameRules.flagrant2EjectionLimit : gameRules.flagrant1EjectionLimit;
        const label = isFlagrant2 ? 'Flagrant 2' : 'Flagrant 1';
        let count = 1;
        while (count < limit && Math.random() < 0.12) count += 1;
        const ejected = count >= limit;
        if (ejected) {
          addEjection(
            offender.playerId,
            gameRules.useYellowRedCards ? 'red_card' : isFlagrant2 ? 'flagrant_2' : 'flagrant_1',
            Math.min(averageNumQuarters, 3),
            '6:00',
            gameRules.useYellowRedCards ? 1 : undefined,
          );
        }
        const player = availablePlayers.find(candidate => candidate.internalId === offender.playerId);
        if (player) {
          liveEvents.push({
            kind: ejected ? 'ejection' : 'rule',
            team: player.tid === homeTeam.id ? 'HOME' : 'AWAY',
            quarter: Math.min(averageNumQuarters, 3),
            gs: Math.max(1, (Math.min(averageNumQuarters, 3) - 1) * (homeKnobsFinal.quarterLength ?? 12) * 60 + 360),
            clock: '6:00',
            playerId: player.internalId,
            playerName: player.name,
            description: ejected
              ? gameRules.useYellowRedCards
                ? `${player.name} has received a red card and is ejected. They will be suspended for the next game.`
                : `${player.name} is ejected after a ${label}.`
              : gameRules.useYellowRedCards
                ? `${player.name} receives a yellow card for a ${label}.`
                : `${player.name} is assessed ${count > 1 ? `${count} ${label} fouls` : `a ${label}`}.`,
          });
        }
      }
    }

    if (fight && gameRules.fightingInstantEjection) {
      for (const playerId of [fight.player1Id, fight.player2Id]) {
        addEjection(
          playerId,
          gameRules.useYellowRedCards ? 'red_card' : 'fighting',
          Math.min(averageNumQuarters, 3),
          '5:00',
          1,
        );
      }
    }
    for (const ejection of ejections.filter(event => event.reason === 'foul_out')) {
      liveEvents.push({
        kind: 'ejection',
        team: ejection.teamId === homeTeam.id ? 'HOME' : 'AWAY',
        quarter: ejection.quarter,
        gs: Math.max(1, ejection.quarter * (homeKnobsFinal.quarterLength ?? 12) * 60),
        clock: ejection.clock,
        playerId: ejection.playerId,
        playerName: ejection.playerName,
        description: `${ejection.playerName} has fouled out with ${gameRules.foulOutLimit} personal fouls.`,
      });
    }
    for (const ejection of ejections.filter(event => event.reason !== 'foul_out')) {
      const alreadyAnnounced = liveEvents.some(event =>
        event.kind === 'ejection'
        && event.playerId === ejection.playerId,
      );
      if (alreadyAnnounced) continue;
      const team = ejection.teamId === homeTeam.id ? 'HOME' : 'AWAY';
      const quarterSeconds = Math.max(60, (homeKnobsFinal.quarterLength ?? 12) * 60);
      const elapsedInQuarter = Math.max(0, quarterSeconds - (() => {
        const [minutes, seconds] = ejection.clock.split(':').map(Number);
        return (minutes || 0) * 60 + (seconds || 0);
      })());
      liveEvents.push({
        kind: 'ejection',
        team,
        quarter: ejection.quarter,
        gs: Math.max(1, (ejection.quarter - 1) * quarterSeconds + elapsedInQuarter),
        clock: ejection.clock,
        playerId: ejection.playerId,
        playerName: ejection.playerName,
        description: ejection.card === 'red'
          ? `${ejection.playerName} has received a red card and is ejected. They will be suspended for the next game.`
          : ejection.reason === 'fighting'
            ? `${ejection.playerName} is ejected for fighting.`
            : ejection.reason === 'technical'
              ? `${ejection.playerName} is ejected after reaching the technical-foul limit.`
              : `${ejection.playerName} is ejected after reaching the flagrant-foul limit.`,
      });
    }
    if (tiebreaker) {
      const winningTeam = homeWinsFinal ? homeTeam : awayTeam;
      const shooterId = homeWinsFinal ? tiebreaker.homeShooterId : tiebreaker.awayShooterId;
      liveEvents.push({
        kind: 'tiebreaker',
        team: homeWinsFinal ? 'HOME' : 'AWAY',
        quarter: Math.max(averageNumQuarters, averageNumQuarters + otCount),
        gs: Math.max(1, (averageNumQuarters * (homeKnobsFinal.quarterLength ?? 12) + otCount * (homeKnobsFinal.overtimeDuration ?? 5)) * 60 + 0.2),
        clock: '0:00',
        playerId: shooterId,
        playerName: availablePlayers.find(player => player.internalId === shooterId)?.name ?? winningTeam.name,
        description: tiebreaker.type === 'shootout'
          ? `${winningTeam.name} win the shootout ${tiebreaker.homeScore}-${tiebreaker.awayScore}.`
          : `${winningTeam.name} take the ${tiebreaker.type === 'target_score' ? 'target-score' : 'sudden-death'} tiebreak.`,
      });
    }

    gameWinner = isDraw || tiebreaker?.type === 'shootout'
      ? undefined
      : pickGameWinner(
          homeWinsFinal ? homeStatsFinal : awayStatsFinal,
          homeWinsFinal ? homeTeam.id : awayTeam.id,
          Math.abs(finalHomeScore - finalAwayScore),
          isOT,
          players,
        );
    const heaves = generateHeaveEvents(
      homeStatsFinal,
      awayStatsFinal,
      homeTeam.id,
      awayTeam.id,
      Math.min(averageNumQuarters, quarterScores.home.length, quarterScores.away.length),
      gameRules.heaveRuleEnabled,
    );
    reconcileTeamPointsToScore(homeStatsFinal, finalHomeScore, gameRules);
    reconcileTeamPointsToScore(awayStatsFinal, finalAwayScore, gameRules);

    const decorationMs = this.perfNow() - forensicStageStart;
    recordSimulationPerf({
      engine: 'fast-core',
      gameId,
      date,
      inputStrengthMs,
      scoreCalculationMs,
      usageAllocationMs,
      boxScoreGenerationMs,
      boxScoreFinalizationMs,
      coreMs: fastCoreMs,
      decorationMs,
      totalMs: this.perfNow() - forensicTotalStart,
      inputPlayers: players.length,
      homeRosterPlayers: homePlayers.length,
      awayRosterPlayers: awayPlayers.length,
      availablePlayers: availablePlayers.length,
      outputStatLines: homeStatsFinal.length + awayStatsFinal.length,
    });

    return {
      gameId,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore:  finalHomeScore,
      awayScore:  finalAwayScore,
       homeStats: homeStatsFinal,   // ← was homeStats
      awayStats: awayStatsFinal,   // ← was awayStats
      winnerId: isDraw ? -1 : homeWinsFinal ? homeTeam.id : awayTeam.id,
      isDraw,
      lead:    Math.abs(finalHomeScore - finalAwayScore),
      isOT,
      otCount,
      playersOnCourt: homeKnobsFinal.playersOnCourt ?? 5,
      date,
      isAllStar,
      isRisingStars,
      isEliminationGame,
      injuries,
      quarterScores,
      gameWinner,
      playerDNPs,
      playerInGameInjuries,
      playersPlayingHurt,
      liveEvents,
      fight,
      gameRules,
      ejections,
      tiebreaker,
      heaves,
      highlights,
      // Snapshot records at tip-off (before this game's result is applied)
      homeWins:   homeTeam.wins   ?? 0,
      homeLosses: homeTeam.losses ?? 0,
      awayWins:   awayTeam.wins   ?? 0,
      awayLosses: awayTeam.losses ?? 0,
      gameFormat: baseGameFormat,
      targetScore: baseGameFormat === 'target_score'
        ? (configuredTargetScore > 0 ? configuredTargetScore : 100)
        : baseGameFormat === 'elam_ending'
          ? Math.max(finalHomeScore, finalAwayScore)
          : undefined,
    };
  }

  /**
   * Pre-compute conference standings context for every team.
   * Returns rank (1-15), GB from conference leader, and games remaining.
   * Used to build per-team SimulatorKnobs so rotation depth / star MPG
   * reflect real standings pressure at time of simulation.
   */
  private static buildStandingsContext(teams: Team[]): Map<number, { conferenceRank: number; gbFromLeader: number; gamesRemaining: number }> {
    return buildStandingsContext(teams);
  }

  static async simulateDay(
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
    leagueStats?: Partial<LeagueStats>,
    onGame?: (result: GameResult) => void,
    routing?: { controlledTeamIds?: number[]; watchedGameId?: number; simulationSeed?: string },
  ): Promise<GameResult[]> {
    const prepared = this.prepareDayGames(
      teams,
      players,
      gamesToSimulate,
      date,
      playerApproval,
      allStar,
      homeOverridePlayers,
      awayOverridePlayers,
      riggedForTid,
      leagueStats,
      routing,
    );
    const results = this.simulatePreparedDayGames(prepared, clubDebuffs);

    if (onGame && results.length > 0) {
      onGame(results[results.length - 1]);
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return results;
  }

  /**
   * Build immutable per-game inputs from the canonical state at tip-off.
   * This is deliberately separate from execution so a browser worker may
   * receive only the two participating teams/rosters and resolved knobs.
   */
  static prepareDayGames(
    teams: Team[],
    players: Player[],
    gamesToSimulate: Game[],
    date: string,
    playerApproval: number = 50,
    allStar?: any,
    homeOverridePlayers?: Player[],
    awayOverridePlayers?: Player[],
    riggedForTid?: number,
    leagueStats?: Partial<LeagueStats>,
    routing?: { controlledTeamIds?: number[]; watchedGameId?: number; simulationSeed?: string },
  ): PreparedDayGame[] {
    const prepared: PreparedDayGame[] = [];
    const standingsStart = this.perfNow();
    const standingsCtx = this.buildStandingsContext(teams);
    const standingsContextMs = this.perfNow() - standingsStart;
    const leagueKnobsStart = this.perfNow();
    const leagueBaseKnobs = buildLeagueBaseKnobs(leagueStats);
    const leagueKnobsMs = this.perfNow() - leagueKnobsStart;
    recordSimulationPerf({
      engine: 'day-preparation',
      date,
      games: gamesToSimulate.length,
      teams: teams.length,
      players: players.length,
      standingsContextMs,
      leagueKnobsMs,
    });

    for (let order = 0; order < gamesToSimulate.length; order += 1) {
      const game = gamesToSimulate[order];
      const gameStart = this.perfNow();
      const setup = resolveDayGameSetup({
        game,
        teams,
        players,
        standingsCtx,
        leagueBaseKnobs,
        leagueStats,
        allStar,
        homeOverridePlayers,
        awayOverridePlayers,
        simulationSeed: routing?.simulationSeed,
      });
      if (!setup.home || !setup.away || !setup.homeKnobs || !setup.awayKnobs) continue;
      const setupMs = this.perfMs(gameStart);

      const gameRig = riggedForTid !== undefined &&
        (setup.home.id === riggedForTid || setup.away.id === riggedForTid)
        ? riggedForTid : undefined;
      const rosterFor = (team: Team, override?: Player[]) => override ?? players.filter(player => {
        if (player.tid !== team.id) return false;
        return !['Retired', 'Free Agent', 'Draft Prospect', 'Prospect'].includes(player.status ?? 'Active');
      });
      prepared.push({
        order,
        gid: game.gid,
        date,
        setupMs,
        homeLabel: setup.home.abbrev ?? setup.home.name,
        awayLabel: setup.away.abbrev ?? setup.away.name,
        isPlayoff: !!game.isPlayoff,
        isPlayIn: !!game.isPlayIn,
        isNBACup: !!game.isNBACup,
        presentation: {
          gameId: game.gid,
          leagueId: game.cupLeagueId ?? leagueStats?.uiMode,
          competitionId: game.competitionId,
          season: game.season ?? leagueStats?.year,
          site: game.isExhibition || game.homeTid < 0 || game.awayTid < 0 ? 'neutral' : 'home-away',
          away: { team: setup.away, roster: rosterFor(setup.away, setup.awayOverride) },
          home: { team: setup.home, roster: rosterFor(setup.home, setup.homeOverride) },
        },
        args: {
          homeTeam: setup.home,
          awayTeam: setup.away,
          players,
          gameId: game.gid,
          date,
          season: Number.isFinite(leagueStats?.year) ? Number(leagueStats?.year) : undefined,
          rngSeed: routing?.simulationSeed,
          playerApproval,
          homeOverridePlayers: setup.homeOverride,
          awayOverridePlayers: setup.awayOverride,
          isAllStar: game.isAllStar,
          isRisingStars: game.isRisingStars,
          isEliminationGame:
            game.isEliminationGame === true ||
            !!game.isPlayIn ||
            (game.competitionId && !['group', 'league', 'regular'].includes(String(game.competitionPhase ?? '').toLowerCase())) ||
            (typeof game.cupRoundId === 'string' && game.cupRoundId !== 'group') ||
            (typeof game.nbaCupRound === 'string' && !['group'].includes(String(game.nbaCupRound).toLowerCase())),
          enginePolicy: leagueStats?.simulationEnginePolicy ?? 'hybrid',
          controlledTeamIds: routing?.controlledTeamIds,
          watched: routing?.watchedGameId === game.gid,
          isPlayoff: !!game.isPlayoff,
          isFinals: game.playoffSeriesId === 'Finals' || game.competitionPhase === 'final',
          allowTies: leagueStats?.allowTies === true && !game.isPlayoff && !game.isPlayIn,
          riggedForTid: gameRig,
          homeKnobs: setup.homeKnobs,
          awayKnobs: setup.awayKnobs,
          injuryFrequencyFactor: leagueStats?.injuryFrequencyFactor,
        },
      });
      capturePreparedSimulationGame(prepared[prepared.length - 1]);
    }
    return prepared;
  }

  static simulatePreparedGame(
    prepared: PreparedDayGame,
    clubDebuffs?: Map<string, 'heavy' | 'moderate' | 'mild'>,
    inputAlreadyIsolated: boolean = false,
  ): GameResult {
    const simulateStart = this.perfNow();
    if (clubDebuffs && clubDebuffs.size > 0) setClubDebuffs(clubDebuffs);
    try {
      const adapter = inputAlreadyIsolated ? simulatePreparedGameViaAdapter : simulateGameViaAdapter;
      const adapterResult = adapter(
        prepared.args,
        (a) => this.simulateGame(a.homeTeam, a.awayTeam, a.players, a.gameId, a.date, a.playerApproval, a.homeOverridePlayers, a.awayOverridePlayers, a.isAllStar, a.isRisingStars, a.isEliminationGame, a.riggedForTid, a.homeKnobs ?? KNOBS_DEFAULT, a.awayKnobs ?? KNOBS_DEFAULT, a.injuryFrequencyFactor, a.season, a.allowTies),
      );
      const postAdapterNormalizeStart = this.perfNow();
      const gameResult = normalizeGameResultScoreIntegrity(adapterResult);
      const postAdapterNormalizeMs = this.perfNow() - postAdapterNormalizeStart;
      const simulateMs = this.perfMs(simulateStart);
      recordSimulationPerf({
        engine: 'day',
        gameId: prepared.gid,
        date: prepared.date,
        home: prepared.homeLabel,
        away: prepared.awayLabel,
        isPlayoff: prepared.isPlayoff,
        isPlayIn: prepared.isPlayIn,
        isNBACup: prepared.isNBACup,
        setupMs: prepared.setupMs,
        postAdapterNormalizeMs,
        simulateMs,
        totalMs: prepared.setupMs + simulateMs,
      });
      return gameResult;
    } finally {
      if (clubDebuffs && clubDebuffs.size > 0) clearClubDebuffs();
    }
  }

  static simulatePreparedDayGames(
    prepared: PreparedDayGame[],
    clubDebuffs?: Map<string, 'heavy' | 'moderate' | 'mild'>,
  ): GameResult[] {
    return prepared.map(game => this.simulatePreparedGame(game, clubDebuffs));
  }
}

export interface PreparedDayGame {
  order: number;
  gid: number;
  date: string;
  setupMs: number;
  homeLabel: string;
  awayLabel: string;
  isPlayoff: boolean;
  isPlayIn: boolean;
  isNBACup: boolean;
  presentation: ResolvedGamePresentation;
  args: SimulateGameArgs;
}
