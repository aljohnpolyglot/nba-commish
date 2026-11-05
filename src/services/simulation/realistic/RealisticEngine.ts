import { NBAPlayer as Player, NBATeam as Team } from '../../../types';
import { GameEjection, GameResult, GameTiebreaker, PlayerGameStats } from '../types';
import { annotateFourthQuarterPoints } from '../fourthQuarterStats';
import { GameLiveEvent } from '../types';
import { applySimulationEngineCalibration, SimulatorKnobs, KNOBS_DEFAULT, isEuroClubCompetitionGame } from '../SimulatorKnobs';
import {
  getRealisticEraEfficiencyExponent,
  getRealisticEraFreeThrowResponse,
  getRealisticEraReboundDistributionExponent,
  getRealisticEraTempoAdapter,
  NEUTRAL_ERA_COACHING_BIAS,
} from '../eraCoachingBias';
import { StatGenerator } from '../StatGenerator';
import type { DefensiveRatingProfile } from '../StatGenerator/advancedstats';
import { R } from '../StatGenerator/helpers';
import { activeClubDebuffs } from '../StatGenerator/helpers';
import { Defense2KService } from '../../Defense2KService';
import { injurySeverityLevel, playThroughInjuriesFactor } from '../playThroughInjuriesFactor';
import { PlayerComposite, TeamGameplayModifiers } from './types';
import { buildComposite } from './compositeMap';
import { BoxAccumulator } from './boxScoreAccumulator';
import { simulatePeriod } from './possessionLoop';
import { RotationManager } from './rotationManager';
import { SimulateGameArgs } from '../SimulatorAdapter';
import { resolveRotationPlan } from '../rotationPlan';
import { MinutesPlayedService } from '../MinutesPlayedService';
import { pickGameWinner } from '../GameSimulator/clutch';
import { HighlightGenerator } from '../HighlightGenerator';
import { InjurySystem, enforceSeasonEndingMinimum, injuryChanceWithLeagueFactor } from '../InjurySystem';
import { generateFight } from '../../FightGenerator';
import { getInjuries, getRandomInjury } from '../../injuryService';
import { getRealDurability } from '../../../utils/durabilityUtils';
import { calculateTeamStrengthWithMinutes } from '../../../utils/playerRatings';
import {
  buildBaselineOrder,
  computePaceFactor,
  computeShotMults,
  defensiveStackOnOpponent,
  getDefenseSliders,
  getFamiliarityMods,
  getTrainingDefensiveAuraMods,
  resolveTeamEraCoachingBias,
} from '../GameSimulator/engineTeamModifiers';
import {
  applyStaffGameEffectsToRoster,
  getTeamCoachingGameplayEffects,
  getTeamMedicalGameplayEffects,
} from '../../staff/staffGameplayEffects';
import { getTeamTravelGameplayEffects } from '../../tycoon/travelGameplayEffects';
import { applyRealisticSystemEffects } from './systemEffects';
import { getCoachingPenalty, getScoringOptionBiases } from '../../../store/scoringOptionsStore';
import {
  getSimulationScoringOptions as getScoringOptions,
  getSimulationSystemFitPenalty as getSystemFitPenalty,
  getSimulationSystemKnobMods as getSystemKnobMods,
} from '../simulationRealmContext';
import { recordSimulationPerf } from '../simulationPerfDebug';
import { resolveGameRules, resolveShootout } from '../gameRuleRuntime';
import { generateHeaveEvents } from '../heaveRule';
import { reconcileTeamPointsToScore } from '../GameSimulator/engineBoxScore';

interface PrepResult {
  rotation: Player[];
  minuteTargets: number[];
  composites: PlayerComposite[];
  isEuroClubGame: boolean;
  competitiveRotationDepth: number;
}

interface RealisticTeamSetup {
  modifiers: TeamGameplayModifiers;
  coachingPenalty: number;
  systemStrengthPenalty: number;
}

function gameplayBaseFromKnobs(knobs: SimulatorKnobs): TeamGameplayModifiers {
  const eraBias = knobs.eraCoachingBias;
  const historicalEfficiency = knobs.eraCoachingBias
    ? 0.95 * Math.pow(knobs.efficiencyMultiplier ?? 1, getRealisticEraEfficiencyExponent(knobs.eraCoachingBias))
    : knobs.efficiencyMultiplier ?? 1;
  const historicalFtRate = knobs.eraCoachingBias
    ? 1 + ((knobs.ftRateMult ?? 1) - 1) * getRealisticEraFreeThrowResponse(knobs.eraCoachingBias)
    : knobs.ftRateMult ?? 1;
  return {
    paceMultiplier: knobs.paceMultiplier ?? 1,
    shotEfficiencyMult: historicalEfficiency,
    tovMult: knobs.tovMult ?? 1,
    ftRateMult: historicalFtRate,
    orbMult: knobs.orbRateMult ?? 1,
    assistRateMult: knobs.assistRateMult ?? 1,
    assistDistributionExponent: knobs.assistDistributionExponent,
    reboundDistributionExponent: getRealisticEraReboundDistributionExponent(eraBias, knobs.reboundDistributionExponent),
    reboundOpportunityMult: knobs.reboundOpportunityMult ?? 1,
    interiorEffMult: knobs.interiorEffMult ?? 1,
    blockRateMult: knobs.blockRateMult ?? 1,
    stealRateMult: knobs.stealRateMult ?? 1,
    rimRateMult: knobs.rimRateMult ?? 1,
    lowPostRateMult: knobs.lowPostRateMult ?? 1,
    midRangeRateMult: knobs.midRangeRateMult ?? 1,
    threePointRateMult: (knobs.threePointAvailable ?? true) ? (knobs.threePointRateMult ?? 1) : 0,
  };
}

function applyEraBiasToGameplayModifiers(
  modifiers: TeamGameplayModifiers,
  eraBias = NEUTRAL_ERA_COACHING_BIAS,
): TeamGameplayModifiers {
  return {
    ...modifiers,
    paceMultiplier: (modifiers.paceMultiplier ?? 1) * eraBias.tempoMultiplier * getRealisticEraTempoAdapter(eraBias),
    rimRateMult: (modifiers.rimRateMult ?? 1) * eraBias.rimRateMultiplier,
    lowPostRateMult: (modifiers.lowPostRateMult ?? 1) * eraBias.lowPostRateMultiplier,
    midRangeRateMult: (modifiers.midRangeRateMult ?? 1) * eraBias.midRangeRateMultiplier,
    threePointRateMult: (modifiers.threePointRateMult ?? 1) * eraBias.outsideRateMultiplier,
  };
}

function perfNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function perfMs(start: number): number {
  return Math.round((perfNow() - start) * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampComposite(value: number): number {
  return clamp(value, 0.02, 1.35);
}

function prepareUnit(
  team: Team,
  allPlayers: Player[],
  override: Player[] | undefined,
  season: number,
  knobs: SimulatorKnobs,
  lead: number,
): PrepResult {
  const plan = resolveRotationPlan(team, allPlayers, season, knobs, lead, override);
  const competitiveRotationDepth = plan.rotation.length;
  const playersOnCourt = Math.max(1, Math.round(knobs.playersOnCourt ?? 5));
  const substitutionRotationCap = knobs.gameRules?.substitutionLimitEnabled
    ? playersOnCourt + Math.max(0, Math.round(knobs.gameRules.maxSubstitutions ?? 0))
    : 13;
  const reserveRotation = override
    ? plan.rotation
    : MinutesPlayedService.getRotation(
      team,
      allPlayers,
      30,
      season,
      undefined,
      knobs.conferenceRank,
      knobs.gbFromLeader,
      knobs.gamesRemaining,
      Math.min(13, substitutionRotationCap),
      knobs.playThroughInjuries ?? 0,
      playersOnCourt,
    ).players;
  const competitiveIds = new Set(plan.rotation.map(player => player.internalId));
  const expandedRotation = [
    ...plan.rotation,
    ...reserveRotation.filter(player => !competitiveIds.has(player.internalId)),
  ];
  const rotation = applyStaffGameEffectsToRoster(expandedRotation, team as any);
  const minuteTargetById = new Map(plan.rotation.map((player, index) => [
    player.internalId,
    plan.minuteTargets[index] ?? 1,
  ]));
  const minuteTargets = expandedRotation.map(player => minuteTargetById.get(player.internalId) ?? 1);
  const euroClubGame = isEuroClubCompetitionGame(team, knobs);
  if (rotation.length === 0) {
    return { rotation: [], minuteTargets: [], composites: [], isEuroClubGame: euroClubGame, competitiveRotationDepth: 0 };
  }
  const composites = rotation.map(p => buildComposite(p, season, knobs.gameRules?.dribbleRule));
  return { rotation, minuteTargets, composites, isEuroClubGame: euroClubGame, competitiveRotationDepth };
}

function strengthFromPreparedUnit(unit: PrepResult, season: number, playersOnCourt: number): number {
  const minuteMap: Record<string, number> = {};
  unit.rotation.forEach((player, index) => {
    minuteMap[player.internalId] = unit.minuteTargets[index] ?? 0;
  });
  return calculateTeamStrengthWithMinutes(unit.rotation, minuteMap, season, 0, playersOnCourt);
}

/**
 * Apply per-game hooks to the offensive composites of a single unit:
 *  - clubDebuff   : per-player from `activeClubDebuffs` global (set by simulateDay)
 *  - playThrough  : per-player from injury severity vs the team's PTI tolerance
 *  - defensive aura: scalar from opponent's overall 2K defense rating
 *
 * Mutates composites in place. Defensive composites (defRim/defPerimeter/steal/
 * block/rebound) are unaffected — only the offensive side gets dampened, since
 * these hooks model "how well does this player produce against this opponent".
 *
 * Multipliers are conservative (≤22% range total) so the calibration the rest
 * of Phase 5 nailed down isn't overridden by hook stacking.
 */
function applyHooks(unit: PrepResult, oppOverallDef: number, playThroughTolerance: number): void {
  // Defensive aura: opponent's 2K overallDef centered at 70.
  // 82 (elite) → -0.06 on opponent offense, 60 (bad) → +0.05.
  const auraMult = 1 - (oppOverallDef - 70) * 0.005;

  unit.rotation.forEach((p, i) => {
    const c = unit.composites[i];
    let mult = auraMult;

    // clubDebuff — global Map populated by simulateDay before each game.
    const debuffSeverity = activeClubDebuffs.get(p.internalId);
    if (debuffSeverity === 'heavy')         mult *= 0.84;
    else if (debuffSeverity === 'moderate') mult *= 0.91;
    else if (debuffSeverity === 'mild')     mult *= 0.96;

    // playThroughInjuries — injured players who are suiting up get an output
    // reduction proportional to severity (matches BBGM 2.5%/level).
    const injurySev = injurySeverityLevel(p.injury?.gamesRemaining ?? 0);
    if (injurySev > 0 && playThroughTolerance > 0) {
      mult *= playThroughInjuriesFactor(Math.min(injurySev, playThroughTolerance));
    }

    if (mult !== 1) {
      c.rim        *= mult;
      c.midRange   *= mult;
      c.three      *= mult;
      c.lowPost    *= mult;
      c.driving    *= mult;
      c.passing    *= mult;
      c.drawingFouls *= mult;
      // Usage is the player's "touches" weight — hook also dampens engagement.
      c.usage      *= mult;
    }
  });
}

function diluteBiases(biases: Map<string, { ptsMult: number; effMult: number }>, runPlays: number): void {
  const strength = Math.max(0, Math.min(1, runPlays / 100));
  biases.forEach((value, key) => {
    biases.set(key, {
      ptsMult: 1 + (value.ptsMult - 1) * strength,
      effMult: 1 + (value.effMult - 1) * strength,
    });
  });
}

function applyDoubleTeam(
  biases: Map<string, { ptsMult: number; effMult: number }>,
  baseline: string[],
  oppDoubleTeam: number,
): void {
  if (!baseline[0] || oppDoubleTeam < 5) return;
  const dt = oppDoubleTeam / 100;
  const existing = biases.get(baseline[0]) ?? { ptsMult: 1, effMult: 1 };
  biases.set(baseline[0], {
    ptsMult: existing.ptsMult * (1 - dt * 0.15),
    effMult: existing.effMult * (1 - dt * 0.08),
  });
}

function applyHelioStarBoost(
  biases: Map<string, { ptsMult: number; effMult: number }>,
  baseline: string[],
  teamId: number,
): void {
  const mods = getSystemKnobMods(teamId);
  if (mods.helioStarPtsMod === 1 || !baseline[0]) return;
  const existing = biases.get(baseline[0]) ?? { ptsMult: 1, effMult: 1 };
  biases.set(baseline[0], {
    ptsMult: existing.ptsMult * mods.helioStarPtsMod,
    effMult: existing.effMult * mods.helioStarEffMod,
  });
}

function applyBiasesToComposites(
  unit: PrepResult,
  biases: Map<string, { ptsMult: number; effMult: number }>,
  systemStrengthPenalty: number,
): void {
  const systemPenaltyMult = clamp(1 - systemStrengthPenalty * 0.01, 0.84, 1);
  unit.composites.forEach((composite, index) => {
    const playerId = unit.rotation[index]?.internalId;
    const bias = playerId ? biases.get(playerId) : undefined;
    const usageMult = (bias?.ptsMult ?? 1) * systemPenaltyMult;
    const effMult = (bias?.effMult ?? 1) * systemPenaltyMult;
    composite.usage = clampComposite(composite.usage * usageMult);
    composite.rim = clampComposite(composite.rim * effMult);
    composite.midRange = clampComposite(composite.midRange * effMult);
    composite.three = clampComposite(composite.three * effMult);
    composite.lowPost = clampComposite(composite.lowPost * effMult);
    composite.driving = clampComposite(composite.driving * Math.sqrt(effMult));
    composite.passing = clampComposite(composite.passing * Math.sqrt(systemPenaltyMult));
  });
}

function buildRealisticTeamSetup(
  team: Team,
  opponent: Team,
  unit: PrepResult,
  opponentUnit: PrepResult,
  hasOverrideRoster: boolean,
  opponentHasOverrideRoster: boolean,
  ownKnobs: SimulatorKnobs,
): RealisticTeamSetup {
  const base = gameplayBaseFromKnobs(ownKnobs);
  const eraBias = hasOverrideRoster
    ? ownKnobs.eraCoachingBias ?? NEUTRAL_ERA_COACHING_BIAS
    : resolveTeamEraCoachingBias(team.id, ownKnobs.eraCoachingBias);
  if (hasOverrideRoster) {
    return {
      modifiers: applyEraBiasToGameplayModifiers(base, eraBias),
      coachingPenalty: 0,
      systemStrengthPenalty: 0,
    };
  }

  const baseline = buildBaselineOrder(unit.rotation, ownKnobs.gameRules?.dribbleRule);
  const biases = getScoringOptionBiases(baseline, getScoringOptions(team.id));
  const ownDef = getDefenseSliders(team.id, unit.rotation);
  const oppDef = opponentHasOverrideRoster ? null : getDefenseSliders(opponent.id, opponentUnit.rotation);
  const shotMults = computeShotMults(team.id, unit.rotation);
  const opponentStack = oppDef ? defensiveStackOnOpponent(oppDef) : null;
  const ownDefenseStack = defensiveStackOnOpponent(ownDef);
  const sysMods = getSystemKnobMods(team.id);
  const sysFit = getSystemFitPenalty(team.id);
  const ownFam = getFamiliarityMods(team);
  const oppFam = opponentHasOverrideRoster ? getFamiliarityMods(undefined) : getFamiliarityMods(opponent);
  const oppAura = opponentHasOverrideRoster ? getTrainingDefensiveAuraMods(undefined) : getTrainingDefensiveAuraMods(opponent);

  diluteBiases(biases, ownDef.runPlays);
  if (oppDef) applyDoubleTeam(biases, baseline, oppDef.doubleTeam);
  applyHelioStarBoost(biases, baseline, team.id);
  if (baseline[0] && eraBias.primaryOptionUsageMultiplier !== 1) {
    const current = biases.get(baseline[0]) ?? { ptsMult: 1, effMult: 1 };
    const realisticEraUsage = 1 + (eraBias.primaryOptionUsageMultiplier - 1) * 0.48;
    biases.set(baseline[0], { ...current, ptsMult: current.ptsMult * realisticEraUsage });
  }
  applyBiasesToComposites(unit, biases, sysFit.strengthPenalty);

  return {
    modifiers: {
      paceMultiplier: (base.paceMultiplier ?? 1) * computePaceFactor(team.id, unit.rotation) * (sysMods.paceBonus ?? 1) * eraBias.tempoMultiplier * getRealisticEraTempoAdapter(eraBias),
      tovMult: (base.tovMult ?? 1) * ownFam.tovMult * oppFam.opponentTovMult * oppAura.opponentTovMult * (opponentStack?.tovMult ?? 1),
      ftRateMult: (base.ftRateMult ?? 1) * (opponentStack?.ftRateMult ?? 1),
      orbMult: (base.orbMult ?? 1) * (1 + ((ownDef.crashOffensiveGlass - 50) / 50) * 0.35),
      assistRateMult: base.assistRateMult ?? 1,
      assistDistributionExponent: base.assistDistributionExponent,
      reboundDistributionExponent: base.reboundDistributionExponent,
      reboundOpportunityMult: base.reboundOpportunityMult ?? 1,
      shotEfficiencyMult: (base.shotEfficiencyMult ?? 1) * (sysMods.efficiencyMod ?? 1) * ownFam.efficiencyMult * oppFam.opponentEfficiencyMult * oppAura.opponentEfficiencyMult,
      interiorEffMult: (base.interiorEffMult ?? 1) * (opponentStack?.interiorEffMult ?? 1),
      blockRateMult: base.blockRateMult ?? 1,
      stealRateMult: (base.stealRateMult ?? 1) * ownDefenseStack.stealRateMult,
      rimRateMult: (base.rimRateMult ?? 1) * (shotMults.rimRateMult ?? 1) * (opponentStack?.rimRateMult ?? 1) * (sysMods.rimMod ?? 1) * eraBias.rimRateMultiplier,
      lowPostRateMult: (base.lowPostRateMult ?? 1) * (shotMults.lowPostRateMult ?? 1) * (sysMods.lowPostMod ?? 1) * eraBias.lowPostRateMultiplier,
      midRangeRateMult: (base.midRangeRateMult ?? 1) * (shotMults.midRangeRateMult ?? 1) * (sysMods.midRangeMod ?? 1) * eraBias.midRangeRateMultiplier,
      threePointRateMult: (base.threePointRateMult ?? 1) * (shotMults.threePointRateMult ?? 1) * (opponentStack?.threePointRateMult ?? 1) * (sysMods.threePointMod ?? 1) * eraBias.outsideRateMultiplier,
    },
    coachingPenalty: getCoachingPenalty(baseline, getScoringOptions(team.id)),
    systemStrengthPenalty: sysFit.strengthPenalty,
  };
}

/**
 * Three-driver calibration multiplier on per-minute advanced stats.
 *
 * The realistic engine has no foul-out, fatigue, or minute-pressure subs yet
 * (Phase 3), so per-minute advanced metrics compress 15-25% on engaged
 * players. We need to capture three archetypes:
 *
 *   - Volume scorers (Doncic): high USG + high MPG → driven by usgB
 *   - 6th-man spark plugs (Herro): high USG + low MPG → driven by usgB alone
 *   - Efficient rim runners (M. Robinson, Gobert): low USG, high TS% → driven by effB
 *
 * Bench fillers (low on all three) get no boost. Boost is capped at +25% so
 * elite engines don't compound across all three drivers.
 *
 *   Bench filler (14 mpg, 16 usg, .50 ts) : 1.00
 *   Role player  (22 mpg, 22 usg, .55 ts) : 1.04
 *   M. Robinson  (18 mpg, 12 usg, .75 ts) : 1.16  ← efficiency-driven
 *   Tyler Herro  (22 mpg, 28 usg, .58 ts) : 1.13
 *   Gobert       (28 mpg, 17 usg, .65 ts) : 1.12  ← efficiency-driven
 *   Jokic        (38 mpg, 30 usg, .66 ts) : 1.25 (cap)
 */
function applyAdvanced(stats: PlayerGameStats[], adv: any[]): void {
  stats.forEach((s, i) => {
    Object.assign(s, adv[i]);
    const sa = s as any;
    const mpg = s.min ?? 0;
    const usg = sa.usgPct ?? 18;
    const ts  = sa.tsPct  ?? 0.55;
    const usgB = Math.max(0, usg - 18)   * 0.010;
    const mpgB = Math.max(0, mpg - 22)   * 0.006;
    const effB = Math.max(0, ts  - 0.55) * 0.80;   // TS% .65 → +8%, TS% .75 → +16%
    const boost = 1 + Math.min(0.25, usgB + mpgB + effB);
    if (boost > 1) {
      if (typeof sa.per  === 'number') sa.per  *= boost;
      if (typeof sa.bpm  === 'number') sa.bpm  *= boost;
      if (typeof sa.obpm === 'number') sa.obpm *= boost;
    }
  });
}

export function simulateGameRealistic(args: SimulateGameArgs): GameResult {
  const allowDraw = args.allowTies === true && args.isPlayoff !== true && args.isEliminationGame !== true;
  const totalStart = perfNow();
  const homeKnobs = applySimulationEngineCalibration(args.homeKnobs ?? KNOBS_DEFAULT, 'realistic');
  const awayKnobs = applySimulationEngineCalibration(args.awayKnobs ?? KNOBS_DEFAULT, 'realistic');
  const season = Number.isFinite(args.season)
    ? Number(args.season)
    : args.date ? parseInt(args.date.split('-')[0], 10) : new Date().getFullYear();
  const numQuarters = Math.max(1, Math.round(((homeKnobs.numQuarters ?? 4) + (awayKnobs.numQuarters ?? 4)) / 2));
  const quarterLen = Math.max(1, ((homeKnobs.quarterLength ?? 12) + (awayKnobs.quarterLength ?? 12)) / 2);
  const overtimeLength = Math.max(1, ((homeKnobs.overtimeDuration ?? 5) + (awayKnobs.overtimeDuration ?? 5)) / 2);
  const playersOnCourt = Math.max(1, Math.round(homeKnobs.playersOnCourt ?? awayKnobs.playersOnCourt ?? 5));
  const gameRules = resolveGameRules(homeKnobs, awayKnobs);
  const gameFormat = homeKnobs.gameFormat ?? awayKnobs.gameFormat ?? 'timed';
  const overtimeType = homeKnobs.overtimeType ?? awayKnobs.overtimeType ?? 'standard';
  const overtimeTargetPoints = Math.max(1, Math.round(((homeKnobs.overtimeTargetPoints ?? 7) + (awayKnobs.overtimeTargetPoints ?? 7)) / 2));

  const prepStart = perfNow();
  const home = prepareUnit(args.homeTeam, args.players, args.homeOverridePlayers, season, homeKnobs, 0);
  const away = prepareUnit(args.awayTeam, args.players, args.awayOverridePlayers, season, awayKnobs, 0);
  const prepMsValue = perfMs(prepStart);
  const averageFtEfficiency = ((homeKnobs.ftEfficiencyMult ?? 1) + (awayKnobs.ftEfficiencyMult ?? 1)) / 2;
  const historicalGame = !!(homeKnobs.eraCoachingBias || awayKnobs.eraCoachingBias);
  const shotRules = {
    fieldGoalValue: gameRules.fieldGoalValue,
    freeThrowsEnabled: gameRules.freeThrowsEnabled,
    threePointAvailable: (homeKnobs.threePointAvailable ?? true) && (awayKnobs.threePointAvailable ?? true),
    threePointEfficiencyMult: ((homeKnobs.threePointEfficiencyMult ?? 1) + (awayKnobs.threePointEfficiencyMult ?? 1)) / 2,
    twoPointEfficiencyMult: ((homeKnobs.twoPointEfficiencyMult ?? 1) + (awayKnobs.twoPointEfficiencyMult ?? 1)) / 2,
    fourPointAvailable: !!(homeKnobs.fourPointAvailable || awayKnobs.fourPointAvailable),
    fourPointRateMult: ((homeKnobs.fourPointRateMult ?? 1) + (awayKnobs.fourPointRateMult ?? 1)) / 2,
    fourPointEfficiencyMult: ((homeKnobs.fourPointEfficiencyMult ?? 1) + (awayKnobs.fourPointEfficiencyMult ?? 1)) / 2,
    ftEfficiencyMult: historicalGame ? Math.sqrt(averageFtEfficiency) : averageFtEfficiency,
    dunkValue: gameRules.dunkValue,
  };

  if (home.rotation.length < playersOnCourt || away.rotation.length < playersOnCourt) {
    // Insufficient roster — caller should fall back. We surface a synthetic score-tied throwaway.
    throw new Error('Realistic engine: insufficient rotation');
  }

  const systemEffectsStart = perfNow();
  applyRealisticSystemEffects(home, args.homeTeam, args.awayTeam, !!args.homeOverridePlayers, !!args.awayOverridePlayers);
  applyRealisticSystemEffects(away, args.awayTeam, args.homeTeam, !!args.awayOverridePlayers, !!args.homeOverridePlayers);
  const systemEffectsMs = perfMs(systemEffectsStart);

  const teamSetupStart = perfNow();
  const homeSetup = buildRealisticTeamSetup(
    args.homeTeam,
    args.awayTeam,
    home,
    away,
    !!args.homeOverridePlayers,
    !!args.awayOverridePlayers,
    homeKnobs,
  );
  const awaySetup = buildRealisticTeamSetup(
    args.awayTeam,
    args.homeTeam,
    away,
    home,
    !!args.awayOverridePlayers,
    !!args.homeOverridePlayers,
    awayKnobs,
  );
  const teamSetupMs = perfMs(teamSetupStart);

  // Apply game-state hooks (clubDebuff / playThrough / defensive aura). Defensive
  // aura needs the opponent's 2K rating computed from the same player set the fast
  // engine uses, so each side passes the OTHER side's rotation to Defense2KService.
  const hooksStart = perfNow();
  const home2KDef = Defense2KService.getTeamDefense(home.rotation, playersOnCourt);
  const away2KDef = Defense2KService.getTeamDefense(away.rotation, playersOnCourt);
  applyHooks(home, away2KDef.overallDef, homeKnobs.playThroughInjuries ?? 0);
  applyHooks(away, home2KDef.overallDef, awayKnobs.playThroughInjuries ?? 0);
  const hooksMs = perfMs(hooksStart);

  const loopStart = perfNow();
  const acc = new BoxAccumulator(gameRules);
  acc.registerRoster(home.rotation, playersOnCourt);
  acc.registerRoster(away.rotation, playersOnCourt);

  // Possession-by-possession rotation managers — handle foul-out, foul-trouble
  // pulls, fatigue stretches, and minute-target burn-down. The starting 5 are
  // the top-rotation players seeded by getRotation order.
  const homeMgr = new RotationManager(
    home.rotation,
    home.composites,
    home.minuteTargets,
    playersOnCourt,
    home.isEuroClubGame,
    homeSetup.modifiers,
    gameRules.foulOutLimit,
    gameRules.substitutionLimitEnabled,
    gameRules.maxSubstitutions,
    numQuarters,
    home.competitiveRotationDepth,
  );
  const awayMgr = new RotationManager(
    away.rotation,
    away.composites,
    away.minuteTargets,
    playersOnCourt,
    away.isEuroClubGame,
    awaySetup.modifiers,
    gameRules.foulOutLimit,
    gameRules.substitutionLimitEnabled,
    gameRules.maxSubstitutions,
    numQuarters,
    away.competitiveRotationDepth,
  );

  const simGamePlayers = args.homeOverridePlayers && args.awayOverridePlayers
    ? [...args.homeOverridePlayers, ...args.awayOverridePlayers]
    : [...home.rotation, ...away.rotation];
  const fight = (!args.isAllStar && !args.isRisingStars)
    ? generateFight(
        home.rotation.map(player => player.internalId),
        away.rotation.map(player => player.internalId),
        simGamePlayers,
        [args.homeTeam, args.awayTeam] as any,
        args.date,
      ) ?? undefined
    : undefined;
  const fightPeriod = fight ? Math.max(1, Math.min(numQuarters, 1 + Math.floor(Math.random() * numQuarters))) : 0;
  const fightFraction = 0.25 + Math.random() * 0.5;
  const fightRuntimeEvents = fight && gameRules.fightingInstantEjection
    ? [{
        atFraction: fightFraction,
        apply: () => {
          homeMgr.ejectPlayer(fight.player1Id);
          homeMgr.ejectPlayer(fight.player2Id);
          awayMgr.ejectPlayer(fight.player1Id);
          awayMgr.ejectPlayer(fight.player2Id);
        },
      }]
    : [];

  let homeScore = 0;
  let awayScore = 0;
  const quarterScoresHome: number[] = [];
  const quarterScoresAway: number[] = [];

  let otCount = 0;
  let totalPossessions = 0;
  let possessionCpuMs = 0;
  let shotEventCpuMs = 0;
  let foulFreeThrowCpuMs = 0;
  let boxApplyCpuMs = 0;
  let rotationCpuMs = 0;
  let shotPossessions = 0;
  let turnoverPossessions = 0;
  let foulPossessions = 0;
  let freeThrowAttempts = 0;
  let pendingShootout = false;
  let pendingTiebreakerType: GameTiebreaker['type'] | undefined;
  const runPeriod = (
    period: number,
    minutes: number,
    futureSeconds: number,
    target?: number,
  ) => {
    const runtimeEvents = period === fightPeriod ? fightRuntimeEvents : [];
    const result = simulatePeriod(
      homeMgr,
      awayMgr,
      acc,
      Math.random() < 0.5 ? 'home' : 'away',
      minutes,
      period,
      futureSeconds,
      shotRules,
      gameRules,
      target ? { homeBase: homeScore, awayBase: awayScore, target } : undefined,
      runtimeEvents,
      { home: homeScore, away: awayScore },
    );
    homeScore += result.homeScore;
    awayScore += result.awayScore;
    totalPossessions += result.possessions;
    possessionCpuMs += result.possessionCpuMs;
    shotEventCpuMs += result.shotEventCpuMs;
    foulFreeThrowCpuMs += result.foulFreeThrowCpuMs;
    boxApplyCpuMs += result.boxApplyCpuMs;
    rotationCpuMs += result.rotationCpuMs;
    shotPossessions += result.shotPossessions;
    turnoverPossessions += result.turnoverPossessions;
    foulPossessions += result.foulPossessions;
    freeThrowAttempts += result.freeThrowAttempts;
    quarterScoresHome.push(result.homeScore);
    quarterScoresAway.push(result.awayScore);
  };

  if (gameFormat === 'target_score') {
    const target = Math.max(1, Math.round(((homeKnobs.targetScore ?? 100) + (awayKnobs.targetScore ?? 100)) / 2));
    runPeriod(1, 240, 0, target);
  } else {
    for (let period = 1; period <= numQuarters; period++) {
      const futureSeconds = Math.max(0, (numQuarters - period) * quarterLen * 60);
      runPeriod(period, quarterLen, futureSeconds);
    }

    if (gameFormat === 'elam_ending') {
      otCount = 1;
      runPeriod(numQuarters + 1, 120, 0, Math.max(homeScore, awayScore) + overtimeTargetPoints);
    } else if (homeScore === awayScore && !allowDraw) {
      const enabledCaps = [homeKnobs, awayKnobs]
        .filter(knobs => knobs.maxOvertimesEnabled)
        .map(knobs => Math.max(0, Math.round(knobs.maxOvertimes ?? 0)));
      const configuredCap = enabledCaps.length > 0 ? Math.min(...enabledCaps) : Number.POSITIVE_INFINITY;
      const overtimeEnabled = (homeKnobs.overtimeEnabled ?? true) && (awayKnobs.overtimeEnabled ?? true);

      if (overtimeType === 'shootout' || !overtimeEnabled) {
        pendingShootout = overtimeType === 'shootout' || gameRules.overtimeTieBreaker === 'shootout';
        pendingTiebreakerType = pendingShootout ? 'shootout' : gameRules.overtimeTieBreaker;
        if (!pendingShootout) {
          const add = pendingTiebreakerType === 'target_score' ? overtimeTargetPoints : 1;
          runPeriod(numQuarters + 1, 120, 0, homeScore + add);
        }
      } else if (overtimeType === 'target_score' || overtimeType === 'sudden_death') {
        otCount = 1;
        const add = overtimeType === 'target_score' ? overtimeTargetPoints : 1;
        pendingTiebreakerType = overtimeType === 'target_score' ? 'target_score' : 'sudden_death';
        runPeriod(numQuarters + 1, 120, 0, homeScore + add);
      } else {
        while (homeScore === awayScore && otCount < configuredCap) {
          otCount += 1;
          runPeriod(numQuarters + otCount, overtimeLength, 0);
        }
        if (homeScore === awayScore) {
          pendingTiebreakerType = gameRules.overtimeTieBreaker;
          if (pendingTiebreakerType === 'shootout') {
            pendingShootout = true;
          } else {
            const add = pendingTiebreakerType === 'target_score' ? overtimeTargetPoints : 1;
            runPeriod(numQuarters + otCount + 1, 120, 0, homeScore + add);
          }
        }
      }
    }
  }
  const shootoutTiedScore = pendingShootout ? homeScore : undefined;
  const loopMsValue = perfMs(loopStart);

  const tailStart = perfNow();
  const tailPerf: Record<string, number> = {};
  const markTail = (label: string, start: number) => {
    tailPerf[label] = perfMs(start);
  };

  const scoreAdjustStart = perfNow();
  const homeScoreBeforeAdjustments = homeScore;
  const awayScoreBeforeAdjustments = awayScore;
  const highLeverageGame = !!homeKnobs.isPlayoffs || !!awayKnobs.isPlayoffs || !!args.isEliminationGame;
  const homeCoaching = getTeamCoachingGameplayEffects(args.homeTeam as any);
  const awayCoaching = getTeamCoachingGameplayEffects(args.awayTeam as any);
  const awayTravel = getTeamTravelGameplayEffects(args.awayTeam as any);
  const coachingDiff = (highLeverageGame ? homeCoaching.playoffStrengthBonus : homeCoaching.regularStrengthBonus)
    - (highLeverageGame ? awayCoaching.playoffStrengthBonus : awayCoaching.regularStrengthBonus);
  const coachingSwing = clamp(Math.round(coachingDiff * 0.35), -4, 4);
  const allowPostScoreAdjustments = gameFormat === 'timed' && !pendingTiebreakerType && !pendingShootout
    && !(allowDraw && homeScore === awayScore);
  if (allowPostScoreAdjustments && coachingSwing > 0) homeScore += coachingSwing;
  else if (allowPostScoreAdjustments && coachingSwing < 0) awayScore += Math.abs(coachingSwing);
  const travelSwing = clamp(Math.round(awayTravel.awayStrengthBonus * 1.6), -2, 2);
  if (allowPostScoreAdjustments && travelSwing > 0) awayScore += travelSwing;
  else if (allowPostScoreAdjustments && travelSwing < 0) homeScore += Math.abs(travelSwing);
  const tacticalSwing = clamp(
    Math.round(
      (awaySetup.coachingPenalty + awaySetup.systemStrengthPenalty)
      - (homeSetup.coachingPenalty + homeSetup.systemStrengthPenalty)
    ),
    -6,
    6,
  );
  if (allowPostScoreAdjustments && tacticalSwing > 0) homeScore += tacticalSwing;
  else if (allowPostScoreAdjustments && tacticalSwing < 0) awayScore += Math.abs(tacticalSwing);

  if (
    allowPostScoreAdjustments
    && (
      (!args.homeOverridePlayers && !args.awayOverridePlayers)
      || (homeKnobs.strengthCorrectionWithOverrideRosters && awayKnobs.strengthCorrectionWithOverrideRosters)
    )
    && !args.isAllStar
    && !args.isRisingStars
  ) {
    const useTournamentStrength = homeKnobs.strengthCorrectionWithOverrideRosters
      && awayKnobs.strengthCorrectionWithOverrideRosters;
    const homeStrength = useTournamentStrength && Number.isFinite(args.homeTeam.strength)
      ? Number(args.homeTeam.strength)
      : strengthFromPreparedUnit(home, season, playersOnCourt);
    const awayStrength = useTournamentStrength && Number.isFinite(args.awayTeam.strength)
      ? Number(args.awayTeam.strength)
      : strengthFromPreparedUnit(away, season, playersOnCourt);
    const homeCourtAdvantage = Math.max(0, Math.min(6, homeKnobs.homeCourtAdvantagePoints ?? 3));
    const expectedMargin = clamp(((homeStrength - awayStrength) + homeCourtAdvantage) * 0.75, -18, 18);
    const actualMargin = homeScore - awayScore;
    const correction = useTournamentStrength
      ? clamp(Math.round((expectedMargin - actualMargin) * 0.9), -18, 18)
      : clamp(Math.round((expectedMargin - actualMargin) * 0.42), -10, 10);
    if (correction > 0) homeScore += correction;
    else if (correction < 0) awayScore += Math.abs(correction);
  }
  if (shootoutTiedScore !== undefined) {
    homeScore = shootoutTiedScore;
    awayScore = shootoutTiedScore;
  } else if (allowPostScoreAdjustments && homeScore === awayScore && !allowDraw) {
    if (homeScoreBeforeAdjustments > awayScoreBeforeAdjustments) homeScore += 1;
    else awayScore += 1;
  }
  const homeScoreAdjustment = homeScore - homeScoreBeforeAdjustments;
  const awayScoreAdjustment = awayScore - awayScoreBeforeAdjustments;
  if (quarterScoresHome.length > 0) {
    quarterScoresHome[quarterScoresHome.length - 1] += homeScoreAdjustment;
  }
  if (quarterScoresAway.length > 0) {
    quarterScoresAway[quarterScoresAway.length - 1] += awayScoreAdjustment;
  }
  markTail('scoreAdjustMs', scoreAdjustStart);

  // Distribute actual minutes from the rotation manager (replaces the static target).
  const minutesStart = perfNow();
  acc.setMinutes(home.rotation, homeMgr.getMinutesPlayed());
  acc.setMinutes(away.rotation, awayMgr.getMinutesPlayed());

  const homeStats: PlayerGameStats[] = acc.toArray(home.rotation).filter(stat => stat.min > 0.01);
  const awayStats: PlayerGameStats[] = acc.toArray(away.rotation).filter(stat => stat.min > 0.01);
  reconcileTeamPointsToScore(homeStats, homeScore, gameRules);
  reconcileTeamPointsToScore(awayStats, awayScore, gameRules);
  markTail('minutesMs', minutesStart);

  // Advanced stats (PER, USG%, ORtg, DRtg, BPM, OBPM, DBPM, WS, VORP, eFG%,
  // TS%, AST%, ORB%, DRB%, TRB%, STL%, BLK%, TOV%) — same per-game wiring
  // the fast engine does. PM is already tracked in the boxScoreAccumulator.
  const advancedStart = perfNow();
  const homePm = homeStats.map(s => s.pm ?? 0);
  const awayPm = awayStats.map(s => s.pm ?? 0);
  const buildDefenseMap = (players: Player[]): Map<string, DefensiveRatingProfile> => new Map(
    players.map(player => [player.internalId, { diq: R(player, 'diq', season), hgt: R(player, 'hgt', season) }]),
  );
  const homeAdv = StatGenerator.generateAdvancedStats(homeStats, awayStats, homePm, undefined, buildDefenseMap(home.rotation));
  const awayAdv = StatGenerator.generateAdvancedStats(awayStats, homeStats, awayPm, undefined, buildDefenseMap(away.rotation));
  applyAdvanced(homeStats, homeAdv);
  applyAdvanced(awayStats, awayAdv);
  markTail('advancedMs', advancedStart);

  let tiebreaker: GameTiebreaker | undefined;
  const isDraw = allowDraw && homeScore === awayScore && !pendingShootout;
  let winnerId = isDraw ? -1 : homeScore > awayScore ? args.homeTeam.id : args.awayTeam.id;
  if (pendingShootout) {
    const resolved = resolveShootout(homeStats, awayStats, simGamePlayers, gameRules.shootoutRounds);
    tiebreaker = resolved.tiebreaker;
    winnerId = resolved.winner === 'home' ? args.homeTeam.id : args.awayTeam.id;
  } else if (pendingTiebreakerType) {
    const index = Math.max(0, quarterScoresHome.length - 1);
    tiebreaker = {
      type: pendingTiebreakerType,
      homeScore: quarterScoresHome[index] ?? 0,
      awayScore: quarterScoresAway[index] ?? 0,
    };
  }
  const lead = Math.abs(homeScore - awayScore);
  const quarterScores = { home: quarterScoresHome, away: quarterScoresAway };
  annotateFourthQuarterPoints(homeStats, awayStats, quarterScores, otCount, {
    numQuarters,
    quarterLengthSeconds: Math.round(quarterLen * 60),
    overtimeLengthSeconds: Math.round(overtimeLength * 60),
  });
  const gameWinner = isDraw || tiebreaker?.type === 'shootout'
    ? undefined
    : pickGameWinner(
        winnerId === args.homeTeam.id ? homeStats : awayStats,
        winnerId,
        lead,
        otCount > 0,
        args.players,
      );
  const realisticCoreMs = perfNow() - totalStart;

  const gamePlayerById = new Map(simGamePlayers.map(player => [player.internalId, player] as const));
  const ejections: GameEjection[] = acc.getDisciplineEvents()
    .filter(event => event.ejected)
    .flatMap(event => {
      const player = gamePlayerById.get(event.playerId);
      if (!player) return [];
      const reason = event.card === 'red'
        ? 'red_card'
        : event.discipline === 'technical'
          ? 'technical'
          : event.discipline;
      const minutes = Math.floor(event.clockSeconds / 60);
      const seconds = String(event.clockSeconds % 60).padStart(2, '0');
      return [{
        playerId: player.internalId,
        playerName: player.name,
        teamId: player.tid,
        reason,
        quarter: event.period,
        clock: `${minutes}:${seconds}`,
        card: event.card,
        suspensionGames: event.card === 'red' ? 1 : undefined,
      } satisfies GameEjection];
    });
  for (const stat of [...homeStats, ...awayStats]) {
    if (stat.pf < gameRules.foulOutLimit || ejections.some(event => event.playerId === stat.playerId)) continue;
    const player = gamePlayerById.get(stat.playerId);
    if (!player) continue;
    ejections.push({
      playerId: player.internalId,
      playerName: player.name,
      teamId: player.tid,
      reason: 'foul_out',
      quarter: numQuarters + otCount,
      clock: '0:00',
    });
  }
  if (fight && gameRules.fightingInstantEjection) {
    for (const playerId of [fight.player1Id, fight.player2Id]) {
      const player = gamePlayerById.get(playerId);
      if (!player || ejections.some(event => event.playerId === playerId && event.reason === 'red_card')) continue;
      ejections.push({
        playerId,
        playerName: player.name,
        teamId: player.tid,
        reason: gameRules.useYellowRedCards ? 'red_card' : 'fighting',
        quarter: fightPeriod,
        clock: `${Math.floor(quarterLen * (1 - fightFraction))}:${String(Math.floor((quarterLen * 60 * (1 - fightFraction)) % 60)).padStart(2, '0')}`,
        card: gameRules.useYellowRedCards ? 'red' : undefined,
        suspensionGames: 1,
      });
    }
  }

  const homePlayers = (args.homeOverridePlayers ?? args.players.filter(p => p.tid === args.homeTeam.id))
    .filter(p => p.status === 'Active');
  const awayPlayers = (args.awayOverridePlayers ?? args.players.filter(p => p.tid === args.awayTeam.id))
    .filter(p => p.status === 'Active');
  const playedHomeIds = new Set(homeStats.map(s => s.playerId));
  const playedAwayIds = new Set(awayStats.map(s => s.playerId));
  const playerDNPs: Record<string, string> = {};

  for (const player of homePlayers) {
    if (playedHomeIds.has(player.internalId)) continue;
    playerDNPs[player.internalId] = (player.injury?.gamesRemaining ?? 0) > 0
      ? `DNP — Injury (${player.injury!.type})`
      : "DNP — Coach's Decision";
  }
  for (const player of awayPlayers) {
    if (playedAwayIds.has(player.internalId)) continue;
    playerDNPs[player.internalId] = (player.injury?.gamesRemaining ?? 0) > 0
      ? `DNP — Injury (${player.injury!.type})`
      : "DNP — Coach's Decision";
  }

  const gamePlayers = args.homeOverridePlayers && args.awayOverridePlayers
    ? [...args.homeOverridePlayers, ...args.awayOverridePlayers]
    : args.players.filter(p => p.tid === args.homeTeam.id || p.tid === args.awayTeam.id);
  const gamePlayerMap = new Map(gamePlayers.map(player => [player.internalId, player] as const));

  const dnpStart = perfNow();
  const injuries = InjurySystem.checkInjuries(gamePlayers, args.homeTeam, args.awayTeam, args.injuryFrequencyFactor);
  const homeAbbrev = (args.homeTeam as any).abbrev;
  const awayAbbrev = (args.awayTeam as any).abbrev;
  for (const injury of injuries) {
    if (injury.startDate) continue;
    injury.startDate = args.date;
    const isHome = injury.teamId === args.homeTeam.id;
    const oppAbbrev = isHome ? awayAbbrev : homeAbbrev;
    if (oppAbbrev) injury.origin = `${isHome ? 'vs' : '@'} ${oppAbbrev}`;
  }
  markTail('benchInjuryRollMs', dnpStart);

  const playersPlayingHurt: Record<string, string> = {};
  const hurtStart = perfNow();
  for (const stat of [...homeStats, ...awayStats]) {
    const src = gamePlayerMap.get(stat.playerId);
    const gamesRemaining = src?.injury?.gamesRemaining ?? 0;
    if (gamesRemaining > 0 && src?.injury?.type) {
      playersPlayingHurt[stat.playerId] = src.injury.type;
    }
  }
  markTail('playingHurtMs', hurtStart);

  const playerInGameInjuries: Record<string, { type: string; quarter: number }> = {};
  const liveEvents: GameLiveEvent[] = [];
  const getPeriodStartSeconds = (period: number) => period <= numQuarters
    ? (period - 1) * quarterLen * 60
    : numQuarters * quarterLen * 60 + (period - numQuarters - 1) * overtimeLength * 60;
  const injuryDefs = getInjuries();
  const isIntlPreseason = args.homeTeam.id >= 100 || args.awayTeam.id >= 100;
  if (injuryDefs.length > 0 && !args.isAllStar && !args.isRisingStars) {
    const midgameInjuryStart = perfNow();
    const allPlayedStats = [...homeStats, ...awayStats];
    for (const stat of allPlayedStats) {
      const player = gamePlayerMap.get(stat.playerId);
      if (!player || (player.injury?.gamesRemaining ?? 0) > 0) continue;

      const min = stat.min;
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
      const medical = getTeamMedicalGameplayEffects(player.tid === args.homeTeam.id ? args.homeTeam as any : args.awayTeam as any);
      const injuryChance = injuryChanceWithLeagueFactor(
        preseasonFactor * fatigueRiskMult * 0.012 * minuteExposureMult * durabilityRiskMult * medical.injuryRiskMultiplier,
        args.injuryFrequencyFactor,
      );
      if (Math.random() >= injuryChance) continue;

      const drawn = getRandomInjury(injuryDefs);
      const u1 = 1 - Math.random();
      const u2 = 1 - Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const baseMult = Math.max(0.75, Math.min(1.30, 1.0 + z * 0.15));
      const severityAdj =
        min >= 36 ? 0.08 :
        min >= 28 ? 0.04 :
        min < 10  ? -0.08 :
        min < 18  ? -0.04 :
                    0;
      const gameMult = Math.max(0.70, baseMult + severityAdj);
      const gamesRemaining = enforceSeasonEndingMinimum(
        drawn.name,
        Math.max(1, Math.round(drawn.games * gameMult)),
      );

      const isHome = player.tid === args.homeTeam.id;
      const oppAbbrev = isHome ? awayAbbrev : homeAbbrev;
      const origin = oppAbbrev ? `${isHome ? 'vs' : '@'} ${oppAbbrev}` : undefined;
      injuries.push({
        playerId: player.internalId,
        playerName: player.name,
        teamId: player.tid,
        injuryType: drawn.name,
        gamesRemaining,
        startDate: args.date,
        origin,
      });
      if (gamesRemaining > 0) {
        const quarter = Math.max(1, Math.min(numQuarters, Math.ceil(Math.max(1, stat.min) / quarterLen)));
        playerInGameInjuries[player.internalId] = { type: drawn.name, quarter };
        const clockSeconds = Math.max(0, Math.round((quarterLen * 60) - ((Math.max(1, stat.min) - ((quarter - 1) * quarterLen)) * 60)));
        const mm = Math.floor(clockSeconds / 60);
        const ss = String(clockSeconds % 60).padStart(2, '0');
        liveEvents.push({
          kind: 'injury',
          team: isHome ? 'HOME' : 'AWAY',
          quarter,
          gs: ((quarter - 1) * quarterLen * 60) + ((quarterLen * 60) - clockSeconds),
          clock: `${mm}:${ss}`,
          playerId: player.internalId,
          playerName: player.name,
          description: `${player.name} is down and will be evaluated for a ${drawn.name.toLowerCase()}.`,
        });
      }
    }
    markTail('midgameInjuryMs', midgameInjuryStart);
  }

  const fightStart = perfNow();
  for (const event of acc.getDisciplineEvents()) {
    const player = gamePlayerMap.get(event.playerId);
    if (!player) continue;
    const matchingEjection = ejections.find(ejection =>
      ejection.playerId === event.playerId
      && ejection.quarter === event.period
      && ejection.reason !== 'foul_out',
    );
    const clockMinutes = Math.floor(event.clockSeconds / 60);
    const clock = `${clockMinutes}:${String(event.clockSeconds % 60).padStart(2, '0')}`;
    const label = event.discipline === 'technical'
      ? 'technical foul'
      : event.discipline === 'flagrant_1'
        ? 'Flagrant 1'
        : 'Flagrant 2';
    const description = matchingEjection?.card === 'red'
      ? `${player.name} has received a red card and is ejected. They will be suspended for the next game.`
      : event.card === 'yellow'
        ? `${player.name} receives a yellow card for a ${label}.`
        : matchingEjection
          ? `${player.name} is ejected after reaching the ${label} limit.`
          : `${player.name} is assessed a ${label}.`;
    liveEvents.push({
      kind: matchingEjection ? 'ejection' : 'rule',
      team: player.tid === args.homeTeam.id ? 'HOME' : 'AWAY',
      quarter: event.period,
      gs: getPeriodStartSeconds(event.period) + Math.max(0, (event.period <= numQuarters ? quarterLen : overtimeLength) * 60 - event.clockSeconds),
      clock,
      playerId: player.internalId,
      playerName: player.name,
      description,
    });
  }
  if (fight) {
    const fightQuarter = fightPeriod;
    const clockSeconds = Math.max(0, Math.round(quarterLen * 60 * (1 - fightFraction)));
    const mm = Math.floor(clockSeconds / 60);
    const ss = String(clockSeconds % 60).padStart(2, '0');
    const team = fight.player1TeamId === args.homeTeam.id ? 'HOME' : 'AWAY';
    const playerId = team === 'HOME' ? fight.player1Id : fight.player2Id;
    const playerName = team === 'HOME' ? fight.player1Name : fight.player2Name;
    const opponentName = team === 'HOME' ? fight.player2Name : fight.player1Name;
    liveEvents.push({
      kind: 'fight',
      team,
      quarter: fightQuarter,
      gs: ((fightQuarter - 1) * quarterLen * 60) + ((quarterLen * 60) - clockSeconds),
      clock: `${mm}:${ss}`,
      playerId,
      playerName,
      opponentName,
      description: gameRules.fightingInstantEjection && gameRules.useYellowRedCards
        ? `${playerName} and ${opponentName} are ejected with red cards after the fight. Both will be suspended for the next game.`
        : gameRules.fightingInstantEjection
          ? `${playerName} and ${opponentName} are ejected after the fight.`
          : fight.severity === 'brawl'
            ? `${playerName} and ${opponentName} are throwing down. Benches are spilling onto the floor.`
            : `${playerName} gets tangled up with ${opponentName} and tempers flare.`,
    });
  }
  for (const ejection of ejections.filter(event => event.reason === 'foul_out')) {
    const player = gamePlayerMap.get(ejection.playerId);
    if (!player) continue;
    liveEvents.push({
      kind: 'ejection',
      team: player.tid === args.homeTeam.id ? 'HOME' : 'AWAY',
      quarter: ejection.quarter,
      gs: getPeriodStartSeconds(ejection.quarter) + (ejection.quarter <= numQuarters ? quarterLen : overtimeLength) * 60,
      clock: ejection.clock,
      playerId: player.internalId,
      playerName: player.name,
      description: `${player.name} has fouled out with ${gameRules.foulOutLimit} personal fouls.`,
    });
  }
  if (tiebreaker) {
    const homeWon = winnerId === args.homeTeam.id;
    const playerId = homeWon ? tiebreaker.homeShooterId : tiebreaker.awayShooterId;
    const player = playerId ? gamePlayerMap.get(playerId) : undefined;
    const quarter = Math.max(numQuarters, quarterScoresHome.length);
    liveEvents.push({
      kind: 'tiebreaker',
      team: homeWon ? 'HOME' : 'AWAY',
      quarter,
      gs: getPeriodStartSeconds(quarter) + (quarter <= numQuarters ? quarterLen : overtimeLength) * 60 + 0.2,
      clock: '0:00',
      playerId,
      playerName: player?.name ?? (homeWon ? args.homeTeam.name : args.awayTeam.name),
      description: tiebreaker.type === 'shootout'
        ? `${homeWon ? args.homeTeam.name : args.awayTeam.name} win the shootout ${tiebreaker.homeScore}-${tiebreaker.awayScore}.`
        : `${homeWon ? args.homeTeam.name : args.awayTeam.name} take the ${tiebreaker.type === 'target_score' ? 'target-score' : 'sudden-death'} tiebreak.`,
    });
  }
  markTail('fightMs', fightStart);

  const highlightsStart = perfNow();
  const dunkCounts = new Map([...homeStats, ...awayStats].map(stat => [stat.playerId, stat.dunks ?? 0]));
  const technicalCounts = new Map([...homeStats, ...awayStats].map(stat => [stat.playerId, stat.techs ?? 0]));
  const highlights = HighlightGenerator.processGame(
    homeStats,
    awayStats,
    args.homeTeam.id,
    args.awayTeam.id,
    gamePlayers,
    gameRules,
  );
  for (const stat of [...homeStats, ...awayStats]) {
    stat.dunks = dunkCounts.get(stat.playerId) ?? 0;
    stat.techs = technicalCounts.get(stat.playerId) ?? 0;
  }
  markTail('highlightsMs', highlightsStart);
  const heaves = generateHeaveEvents(
    homeStats,
    awayStats,
    args.homeTeam.id,
    args.awayTeam.id,
    Math.min(numQuarters, quarterScoresHome.length, quarterScoresAway.length),
    gameRules.heaveRuleEnabled,
  );
  reconcileTeamPointsToScore(homeStats, homeScore, gameRules);
  reconcileTeamPointsToScore(awayStats, awayScore, gameRules);

  const tailMsValue = perfMs(tailStart);
  const totalMsValue = perfNow() - totalStart;

  const perfPayload: Record<string, string | number | boolean | undefined> = {
    engine: 'realistic',
    gameId: args.gameId,
    date: args.date,
    home: args.homeTeam.abbrev ?? args.homeTeam.name,
    away: args.awayTeam.abbrev ?? args.awayTeam.name,
    prepMs: prepMsValue,
    systemEffectsMs,
    teamSetupMs,
    hooksMs,
    loopMs: loopMsValue,
    coreMs: realisticCoreMs,
    tailMs: tailMsValue,
    decorationMs: Math.max(0, totalMsValue - realisticCoreMs),
    possessions: totalPossessions,
    possessionCpuMs,
    shotEventCpuMs,
    foulFreeThrowCpuMs,
    boxApplyCpuMs,
    rotationCpuMs,
    shotPossessions,
    turnoverPossessions,
    foulPossessions,
    freeThrowAttempts,
    otCount,
    homeRotation: home.rotation.length,
    awayRotation: away.rotation.length,
    totalMs: totalMsValue,
  };
  Object.assign(perfPayload, tailPerf);
  recordSimulationPerf(perfPayload);

  return {
    gameId: args.gameId,
    homeTeamId: args.homeTeam.id,
    awayTeamId: args.awayTeam.id,
    homeScore,
    awayScore,
    homeStats,
    awayStats,
    winnerId,
    isDraw,
    lead,
    isOT: otCount > 0,
    otCount,
    playersOnCourt,
    injuries,
    quarterScores,
    gameWinner,
    playerDNPs,
    playerInGameInjuries,
    playersPlayingHurt,
    liveEvents,
    fight,
    highlights,
    date: args.date,
    isAllStar: args.isAllStar,
    isRisingStars: args.isRisingStars,
    isEliminationGame: args.isEliminationGame,
    homeWins: args.homeTeam.wins,
    homeLosses: args.homeTeam.losses,
    awayWins: args.awayTeam.wins,
    awayLosses: args.awayTeam.losses,
    gameFormat,
    targetScore: gameFormat === 'target_score'
      ? Math.max(1, Math.round(((homeKnobs.targetScore ?? 100) + (awayKnobs.targetScore ?? 100)) / 2))
      : gameFormat === 'elam_ending'
        ? Math.max(homeScore, awayScore)
        : undefined,
    gameRules,
    ejections,
    tiebreaker,
    heaves,
  };
}
