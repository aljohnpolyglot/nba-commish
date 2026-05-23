import { NBATeam as Team, NBAPlayer as Player, Game, LeagueStats } from '../../../types';
import { StatGenerator } from '../StatGenerator';
import { GameResult } from '../types';
import { InjurySystem, enforceSeasonEndingMinimum } from '../InjurySystem';
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
  getKnobs,
} from '../SimulatorKnobs';
import { HighlightGenerator } from '../HighlightGenerator';
import { getInjuries, getRandomInjury } from '../../injuryService';
import { getScoringOptions, getScoringOptionBiases, getCoachingPenalty } from '../../../store/scoringOptionsStore';
import { getSystemFitPenalty, getSystemKnobMods } from '../../../store/coachSystemStore';
import { getLockedStrategy } from '../../../store/coachStrategyLockStore';
import { simulateGameViaAdapter } from '../SimulatorAdapter';
import { getRealDurability } from '../../../utils/durabilityUtils';
import { getFourPointDistance, isFourPointEnabled } from '../../../utils/ruleFlags';
import { resolveExhibitionRules } from '../../allStar/exhibitionRules';
import {
  applyStaffGameEffectsToRoster,
  getTeamCoachingGameplayEffects,
  getTeamMedicalGameplayEffects,
} from '../../staff/staffGameplayEffects';
import { getTeamTravelGameplayEffects } from '../../tycoon/travelGameplayEffects';
import { finalizeBoxScore } from './engineBoxScore';
import { resolveDayGameSetup, buildStandingsContext } from './engineDaySetup';
import { buildLeagueBaseKnobs } from './engineLeagueKnobs';
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
  resolveTeamStrength,
} from './engineTeamModifiers';

export class GameSimulator {
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

  private static calcWinProb(strengthDiff: number): number {
    return 1 / (1 + Math.exp(-strengthDiff * 0.09));
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
  ): GameResult {
    // 500-retry loop to enforce rigged result
    for (let attempt = 0; attempt < 500; attempt++) {
      const result = this._simulateGameOnce(homeTeam, awayTeam, players, gameId, date, playerApproval, homeOverridePlayers, awayOverridePlayers, isAllStar, isRisingStars, isEliminationGame, homeKnobs, awayKnobs);
      if (!riggedForTid || result.winnerId === riggedForTid) {
        return result;
      }
    }
    // Fallback: return last attempt even if rig failed (shouldn't happen with 500 tries)
    return this._simulateGameOnce(homeTeam, awayTeam, players, gameId, date, playerApproval, homeOverridePlayers, awayOverridePlayers, isAllStar, isRisingStars, isEliminationGame, homeKnobs, awayKnobs);
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
  ): GameResult {

    const currentSeason = date ? parseInt(date.split('-')[0], 10) : 2026;
    const baseHomeStrength = resolveTeamStrength(homeTeam, players, currentSeason, homeOverridePlayers);
    const baseAwayStrength = resolveTeamStrength(awayTeam, players, currentSeason, awayOverridePlayers);
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
          buildBaselineOrder(homeOverridePlayers ?? players.filter(p => p.tid === homeTeam.id)),
          getScoringOptions(homeTeam.id)
        );
    const awayCoachPenalty = awayOverridePlayers
      ? 0
      : getCoachingPenalty(
          buildBaselineOrder(awayOverridePlayers ?? players.filter(p => p.tid === awayTeam.id)),
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

    const HOME_COURT  = 3;
    const strengthDiff = (homeStrength - awayStrength) + HOME_COURT;
    const winProb      = Math.max(0.07, Math.min(0.93, this.calcWinProb(strengthDiff)));
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
    if (winnerScore === loserScore) {
      if (Math.random() < 0.5) winnerScore += 1;
      else loserScore = Math.max(0, loserScore - 1);
    }

    let isOT    = false;
    let otCount = 0;
    let finalHomeScore: number;
    let finalAwayScore: number;
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
    const otChance = overtimeEnabled && maxOvertimes !== 0
      ? baseLead <= 4 ? 0.38 : baseLead <= 8 ? 0.06 : 0
      : 0;

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
    } else if (otChance > 0 && Math.random() < otChance) {
      isOT    = true;
      const regTie  = loserScore;
      if (overtimeType === 'target_score') {
        otCount = 1;
        const race = this.simulateOTPeriod(true, strengthDiff, overtimeDuration);
        const scaled = this.scaleWinnerToTarget(race.homePts, race.awayPts, overtimeTargetPoints > 0 ? overtimeTargetPoints : 7);
        finalHomeScore = regTie + scaled.home;
        finalAwayScore = regTie + scaled.away;
      } else if (overtimeType === 'sudden_death') {
        otCount = 1;
        const homeWinsSd = Math.random() < (0.50 + strengthDiff * 0.008);
        const suddenDeathPts = Math.random() < 0.25 ? 1 : Math.random() < 0.55 ? 2 : 3;
        finalHomeScore = regTie + (homeWinsSd ? suddenDeathPts : 0);
        finalAwayScore = regTie + (homeWinsSd ? 0 : suddenDeathPts);
      } else {
        const rolledOtCount = Math.random() < 0.07 ? 3 : Math.random() < 0.22 ? 2 : 1;
        otCount = Math.min(rolledOtCount, maxOvertimes);

        let homeOtPts = 0;
        let awayOtPts = 0;

        for (let ot = 1; ot <= otCount; ot++) {
          const isDecisive = ot === otCount;
          const { homePts, awayPts } = this.simulateOTPeriod(isDecisive, strengthDiff, overtimeDuration);
          homeOtPts += homePts;
          awayOtPts += awayPts;
        }

        finalHomeScore = regTie + homeOtPts;
        finalAwayScore = regTie + awayOtPts;

        if (finalHomeScore === finalAwayScore) {
          if (Math.random() < (0.50 + strengthDiff * 0.005)) finalHomeScore += 1;
          else finalAwayScore += 1;
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
    const home2KDef = Defense2KService.getTeamDefense(homePlayers);
    const away2KDef = Defense2KService.getTeamDefense(awayPlayers);

    // Aura centered at 70: elite (82) → +0.06 debuff on opponent; bad (60) → -0.05 buff to opponent
    const homeDefAura = (home2KDef.overallDef - 70) * 0.005;
    const awayDefAura = (away2KDef.overallDef - 70) * 0.005;

    // Tempo / Early Offense / Fast Break: both teams pull the game toward their
    // preferred pace. Actual pace ≈ average of the two rosters' pace factors.
    // Run-and-gun vs run-and-gun → 130-128 shootouts; two grinders → 95-93.
    const homePaceFactor = homeOverridePlayers ? 1.0 : computePaceFactor(homePlayers);
    const awayPaceFactor = awayOverridePlayers ? 1.0 : computePaceFactor(awayPlayers);
    const sharedPaceFactor = (homePaceFactor + awayPaceFactor) / 2;

    const paceRoll    = (0.96 + Math.random() * 0.20) * sharedPaceFactor;   // 0.90–1.10 × pace bias
    // Crash Offensive Glass: crashing hard → fewer bodies back on D → opponent
    // gets more transition points. Neutral = 50 → no effect. 100 → +3% to opp.
    const homeCrashPre = homeOverridePlayers ? 50 : getDefenseSliders(homeTeam.id, homePlayers).crashOffensiveGlass;
    const awayCrashPre = awayOverridePlayers ? 50 : getDefenseSliders(awayTeam.id, awayPlayers).crashOffensiveGlass;
    const awayTransitionBonus = 1 + ((homeCrashPre - 50) / 50) * 0.03;
    const homeTransitionBonus = 1 + ((awayCrashPre - 50) / 50) * 0.03;
    const homeEffRoll = ((0.88 + Math.random() * 0.24) - awayDefAura) * homeTransitionBonus;
    const awayEffRoll = ((0.88 + Math.random() * 0.24) - homeDefAura) * awayTransitionBonus;

    // Same length scale applied below — 3-min quarters can't have a 75-pt floor.
    const homePostFloor = Math.max(18, Math.round(75 * lengthScale));
    const awayPostFloor = Math.max(16, Math.round(70 * lengthScale));
    finalHomeScore = Math.max(homePostFloor, Math.round(finalHomeScore * paceRoll * homeEffRoll));
    finalAwayScore = Math.max(awayPostFloor, Math.round(finalAwayScore * paceRoll * awayEffRoll));

    // Exhibition score boost — applied BEFORE stat generation so player totals
    // match the scoreboard.  paceMultiplier in knobs is kept at 1.0 for All-Star
    // to avoid double-counting.
    const homeExhibMult = homeKnobs.exhibitionScoreMult ?? 1.0;
    const awayExhibMult = awayKnobs.exhibitionScoreMult ?? 1.0;
    if (homeExhibMult !== 1.0) finalHomeScore = Math.max(homePostFloor, Math.round(finalHomeScore * homeExhibMult));
    if (awayExhibMult !== 1.0) finalAwayScore = Math.max(awayPostFloor, Math.round(finalAwayScore * awayExhibMult));

    if (finalHomeScore === finalAwayScore) {
      if (Math.random() < 0.5) finalHomeScore += 1;
      else finalAwayScore += 1;
    }

    const homeWinsFinal = finalHomeScore > finalAwayScore;

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
    const homeBaselineOrder = homeOverridePlayers ? [] : buildBaselineOrder(homePlayers);
    const awayBaselineOrder = awayOverridePlayers ? [] : buildBaselineOrder(awayPlayers);

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

    // Defensive stack — what the opponent's defense projects onto your knobs.
    const homeOpponentStack = awayDef ? defensiveStackOnOpponent(awayDef) : null;
    const awayOpponentStack = homeDef ? defensiveStackOnOpponent(homeDef) : null;

    // Compose final per-team knobs: base × shotMults × opponent-defense.
    // rimRate and threePointRate are multiplicative stacks; interiorEffMult
    // drops in fresh; tovMult/ftRateMult compound with the base value.
    const homeKnobsFinal: SimulatorKnobs = {
      ...homeKnobsEff,
      ...(homeShotMults ?? {}),
      paceMultiplier:     (homeKnobsEff.paceMultiplier     ?? 1) * (homeSysMods?.paceBonus     ?? 1),
      efficiencyMultiplier:(homeKnobsEff.efficiencyMultiplier ?? 1) * (homeSysMods?.efficiencyMod ?? 1) * homeFamMods.efficiencyMult * awayFamMods.opponentEfficiencyMult * awayTrainingAura.opponentEfficiencyMult,
      tovMult:            (homeKnobsEff.tovMult    ?? 1) * (homeOpponentStack?.tovMult    ?? 1) * homeFamMods.tovMult * awayFamMods.opponentTovMult * awayTrainingAura.opponentTovMult,
      ftRateMult:         (homeKnobsEff.ftRateMult ?? 1) * (homeOpponentStack?.ftRateMult ?? 1),
      interiorEffMult:    homeOpponentStack?.interiorEffMult ?? 1,
      rimRateMult:        (homeKnobsEff.rimRateMult        ?? 1) * (homeShotMults?.rimRateMult        ?? 1) * (homeOpponentStack?.rimRateMult        ?? 1) * (homeSysMods?.rimMod        ?? 1),
      lowPostRateMult:    (homeKnobsEff.lowPostRateMult    ?? 1) * (homeShotMults?.lowPostRateMult    ?? 1) * (homeSysMods?.lowPostMod   ?? 1),
      midRangeRateMult:   (homeKnobsEff.midRangeRateMult   ?? 1) * (homeShotMults?.midRangeRateMult  ?? 1) * (homeSysMods?.midRangeMod  ?? 1),
      threePointRateMult: (homeKnobsEff.threePointRateMult ?? 1) * (homeShotMults?.threePointRateMult ?? 1) * (homeOpponentStack?.threePointRateMult ?? 1) * (homeSysMods?.threePointMod ?? 1),
    };
    const awayKnobsFinal: SimulatorKnobs = {
      ...awayKnobsEff,
      ...(awayShotMults ?? {}),
      paceMultiplier:     (awayKnobsEff.paceMultiplier     ?? 1) * (awaySysMods?.paceBonus     ?? 1),
      efficiencyMultiplier:(awayKnobsEff.efficiencyMultiplier ?? 1) * (awaySysMods?.efficiencyMod ?? 1) * awayFamMods.efficiencyMult * homeFamMods.opponentEfficiencyMult * homeTrainingAura.opponentEfficiencyMult,
      tovMult:            (awayKnobsEff.tovMult    ?? 1) * (awayOpponentStack?.tovMult    ?? 1) * awayFamMods.tovMult * homeFamMods.opponentTovMult * homeTrainingAura.opponentTovMult,
      ftRateMult:         (awayKnobsEff.ftRateMult ?? 1) * (awayOpponentStack?.ftRateMult ?? 1),
      interiorEffMult:    awayOpponentStack?.interiorEffMult ?? 1,
      rimRateMult:        (awayKnobsEff.rimRateMult        ?? 1) * (awayShotMults?.rimRateMult        ?? 1) * (awayOpponentStack?.rimRateMult        ?? 1) * (awaySysMods?.rimMod        ?? 1),
      lowPostRateMult:    (awayKnobsEff.lowPostRateMult    ?? 1) * (awayShotMults?.lowPostRateMult    ?? 1) * (awaySysMods?.lowPostMod   ?? 1),
      midRangeRateMult:   (awayKnobsEff.midRangeRateMult   ?? 1) * (awayShotMults?.midRangeRateMult  ?? 1) * (awaySysMods?.midRangeMod  ?? 1),
      threePointRateMult: (awayKnobsEff.threePointRateMult ?? 1) * (awayShotMults?.threePointRateMult ?? 1) * (awayOpponentStack?.threePointRateMult ?? 1) * (awaySysMods?.threePointMod ?? 1),
    };

    const homeOverrideForStats = homeOverridePlayers ? applyTrainingFatiguePerformance(rawHomePlayers) : undefined;
    const awayOverrideForStats = awayOverridePlayers ? applyTrainingFatiguePerformance(rawAwayPlayers) : undefined;
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
    const homeOrbMult = 1 + ((homeCrashPre - 50) / 50) * 0.35;
    const awayOrbMult = 1 + ((awayCrashPre - 50) / 50) * 0.35;

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
      awayMisses         * 0.70 * homeDrbMult,
      awayTov            * 0.60,
      awayInteriorMisses * 0.39 * awayBlkMult,  // blockRateMult scales away team's blockable interior misses
      awayFTA,
      currentSeason,
      otCount,
      home2KDef,  // home team's defensive ratings (sizes their steal/block pools)
      away2KDef,  // away team's pass perception (shrinks home's assist pool)
      homeOrbMult,
      homeKnobsFinal.quarterLength ?? 12,
      homeKnobsFinal.overtimeDuration ?? 5,
      homeKnobsFinal.numQuarters ?? 4
    );
    const awayStats = StatGenerator.generateCoordinatedStats(
      awayInitial,
      awayTeam,
      availablePlayers,
      homeMisses         * 0.70 * awayDrbMult,
      homeTov            * 0.60,
      homeInteriorMisses * 0.39 * homeBlkMult,  // blockRateMult scales home team's blockable interior misses
      homeFTA,
      currentSeason,
      otCount,
      away2KDef,  // away team's defensive ratings
      home2KDef,  // home team's pass perception
      awayOrbMult,
      awayKnobsFinal.quarterLength ?? 12,
      awayKnobsFinal.overtimeDuration ?? 5,
      awayKnobsFinal.numQuarters ?? 4
    );
    const { homeStatsFinal, awayStatsFinal } = finalizeBoxScore(
      homeStats,
      awayStats,
      finalHomeScore,
      finalAwayScore,
    );

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

    const gamePlayers = homeOverridePlayers && awayOverridePlayers 
      ? [...homeOverridePlayers, ...awayOverridePlayers]
      : availablePlayers.filter(
          p => p.tid === homeTeam.id || p.tid === awayTeam.id
        );
    const injuries = InjurySystem.checkInjuries(gamePlayers, homeTeam, awayTeam);

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
        const injuryChance = preseasonFactor * fatigueRiskMult * 0.012 * minuteExposureMult * durabilityRiskMult * medical.injuryRiskMultiplier;

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
      playersPlayingHurt,
      fight,
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
    onGame?: (result: GameResult) => void
  ): Promise<GameResult[]> {
    const results: GameResult[] = [];
    const standingsCtx = this.buildStandingsContext(teams);
    const leagueBaseKnobs = buildLeagueBaseKnobs(leagueStats);

    for (const game of gamesToSimulate) {
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
      });
      if (!setup.home || !setup.away || !setup.homeKnobs || !setup.awayKnobs) continue;
      const setupMs = this.perfMs(gameStart);

      if (clubDebuffs && clubDebuffs.size > 0) setClubDebuffs(clubDebuffs);
      const gameRig = riggedForTid !== undefined &&
        (setup.home.id === riggedForTid || setup.away.id === riggedForTid)
        ? riggedForTid : undefined;
      const simulateStart = this.perfNow();
      const gameResult = simulateGameViaAdapter(
        {
          homeTeam: setup.home,
          awayTeam: setup.away,
          players,
          gameId: game.gid,
          date,
          playerApproval,
          homeOverridePlayers: setup.homeOverride,
          awayOverridePlayers: setup.awayOverride,
          isAllStar: game.isAllStar,
          isRisingStars: game.isRisingStars,
          isEliminationGame:
            !!game.isPlayIn ||
            !!game.isPlayoff ||
            (game.competitionId && !['group', 'league', 'regular'].includes(String(game.competitionPhase ?? '').toLowerCase())) ||
            (typeof game.nbaCupRound === 'string' && !['group'].includes(String(game.nbaCupRound).toLowerCase())),
          riggedForTid: gameRig,
          homeKnobs: setup.homeKnobs,
          awayKnobs: setup.awayKnobs,
        },
        (a) => this.simulateGame(a.homeTeam, a.awayTeam, a.players, a.gameId, a.date, a.playerApproval, a.homeOverridePlayers, a.awayOverridePlayers, a.isAllStar, a.isRisingStars, a.isEliminationGame, a.riggedForTid, a.homeKnobs ?? KNOBS_DEFAULT, a.awayKnobs ?? KNOBS_DEFAULT),
      );
      const simulateMs = this.perfMs(simulateStart);
      results.push(gameResult);
      if (clubDebuffs && clubDebuffs.size > 0) clearClubDebuffs();

      console.log('[SIM_GAME_PERF]', {
        gameId: game.gid,
        date,
        home: setup.home.abbrev ?? setup.home.name,
        away: setup.away.abbrev ?? setup.away.name,
        isPlayoff: !!game.isPlayoff,
        isPlayIn: !!game.isPlayIn,
        isNBACup: !!game.isNBACup,
        setupMs,
        simulateMs,
        totalMs: this.perfMs(gameStart),
      });

      if (onGame) {
        onGame(gameResult);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    return results;
  }
}
