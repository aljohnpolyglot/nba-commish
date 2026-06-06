import { NBAPlayer as Player, NBATeam as Team } from '../../../types';
import { GameResult, PlayerGameStats } from '../types';
import { GameLiveEvent } from '../types';
import { SimulatorKnobs, KNOBS_DEFAULT, isEuroClubCompetitionGame } from '../SimulatorKnobs';
import { StatGenerator } from '../StatGenerator';
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
import { pickGameWinner } from '../GameSimulator/clutch';
import { HighlightGenerator } from '../HighlightGenerator';
import { InjurySystem, enforceSeasonEndingMinimum } from '../InjurySystem';
import { generateFight } from '../../FightGenerator';
import { getInjuries, getRandomInjury } from '../../injuryService';
import { getRealDurability } from '../../../utils/durabilityUtils';
import {
  buildBaselineOrder,
  computePaceFactor,
  computeShotMults,
  defensiveStackOnOpponent,
  getDefenseSliders,
  getFamiliarityMods,
  getTrainingDefensiveAuraMods,
} from '../GameSimulator/engineTeamModifiers';
import {
  applyStaffGameEffectsToRoster,
  getTeamCoachingGameplayEffects,
  getTeamMedicalGameplayEffects,
} from '../../staff/staffGameplayEffects';
import { getTeamTravelGameplayEffects } from '../../tycoon/travelGameplayEffects';
import { applyRealisticSystemEffects } from './systemEffects';
import { getCoachingPenalty, getScoringOptionBiases, getScoringOptions } from '../../../store/scoringOptionsStore';
import { getSystemFitPenalty, getSystemKnobMods } from '../../../store/coachSystemStore';

interface PrepResult {
  rotation: Player[];
  minuteTargets: number[];
  composites: PlayerComposite[];
  isEuroClubGame: boolean;
}

interface RealisticTeamSetup {
  modifiers: TeamGameplayModifiers;
  coachingPenalty: number;
  systemStrengthPenalty: number;
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
  const rotation = applyStaffGameEffectsToRoster(plan.rotation, team as any);
  const euroClubGame = isEuroClubCompetitionGame(team, knobs);
  if (rotation.length === 0) {
    return { rotation: [], minuteTargets: [], composites: [], isEuroClubGame: euroClubGame };
  }
  const composites = rotation.map(p => buildComposite(p, season));
  return { rotation, minuteTargets: plan.minuteTargets, composites, isEuroClubGame: euroClubGame };
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
): RealisticTeamSetup {
  if (hasOverrideRoster) {
    return {
      modifiers: { paceMultiplier: 1, tovMult: 1, ftRateMult: 1, orbMult: 1, interiorEffMult: 1, rimRateMult: 1, lowPostRateMult: 1, midRangeRateMult: 1, threePointRateMult: 1 },
      coachingPenalty: 0,
      systemStrengthPenalty: 0,
    };
  }

  const baseline = buildBaselineOrder(unit.rotation);
  const biases = getScoringOptionBiases(baseline, getScoringOptions(team.id));
  const ownDef = getDefenseSliders(team.id, unit.rotation);
  const oppDef = opponentHasOverrideRoster ? null : getDefenseSliders(opponent.id, opponentUnit.rotation);
  const shotMults = computeShotMults(team.id, unit.rotation);
  const opponentStack = oppDef ? defensiveStackOnOpponent(oppDef) : null;
  const sysMods = getSystemKnobMods(team.id);
  const sysFit = getSystemFitPenalty(team.id);
  const ownFam = getFamiliarityMods(team);
  const oppFam = opponentHasOverrideRoster ? getFamiliarityMods(undefined) : getFamiliarityMods(opponent);
  const oppAura = opponentHasOverrideRoster ? getTrainingDefensiveAuraMods(undefined) : getTrainingDefensiveAuraMods(opponent);

  diluteBiases(biases, ownDef.runPlays);
  if (oppDef) applyDoubleTeam(biases, baseline, oppDef.doubleTeam);
  applyHelioStarBoost(biases, baseline, team.id);
  applyBiasesToComposites(unit, biases, sysFit.strengthPenalty);

  return {
    modifiers: {
      paceMultiplier: computePaceFactor(unit.rotation) * (sysMods.paceBonus ?? 1),
      tovMult: ownFam.tovMult * oppFam.opponentTovMult * oppAura.opponentTovMult * (opponentStack?.tovMult ?? 1),
      ftRateMult: opponentStack?.ftRateMult ?? 1,
      orbMult: 1 + ((ownDef.crashOffensiveGlass - 50) / 50) * 0.35,
      interiorEffMult: opponentStack?.interiorEffMult ?? 1,
      rimRateMult: (shotMults.rimRateMult ?? 1) * (opponentStack?.rimRateMult ?? 1) * (sysMods.rimMod ?? 1),
      lowPostRateMult: (shotMults.lowPostRateMult ?? 1) * (sysMods.lowPostMod ?? 1),
      midRangeRateMult: (shotMults.midRangeRateMult ?? 1) * (sysMods.midRangeMod ?? 1),
      threePointRateMult: (shotMults.threePointRateMult ?? 1) * (opponentStack?.threePointRateMult ?? 1) * (sysMods.threePointMod ?? 1),
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
      if (typeof sa.dbpm === 'number') sa.dbpm *= boost;
    }
  });
}

export function simulateGameRealistic(args: SimulateGameArgs): GameResult {
  const totalStart = perfNow();
  const homeKnobs = args.homeKnobs ?? KNOBS_DEFAULT;
  const awayKnobs = args.awayKnobs ?? KNOBS_DEFAULT;
  const season = args.date ? parseInt(args.date.split('-')[0], 10) : new Date().getFullYear();
  const numQuarters = Math.max(1, Math.round(((homeKnobs.numQuarters ?? 4) + (awayKnobs.numQuarters ?? 4)) / 2));
  const quarterLen = Math.max(1, ((homeKnobs.quarterLength ?? 12) + (awayKnobs.quarterLength ?? 12)) / 2);
  const overtimeLength = Math.max(1, ((homeKnobs.overtimeDuration ?? 5) + (awayKnobs.overtimeDuration ?? 5)) / 2);

  const prepStart = perfNow();
  const home = prepareUnit(args.homeTeam, args.players, args.homeOverridePlayers, season, homeKnobs, 0);
  const away = prepareUnit(args.awayTeam, args.players, args.awayOverridePlayers, season, awayKnobs, 0);
  const prepMsValue = perfMs(prepStart);
  const shotRules = {
    fourPointAvailable: !!(homeKnobs.fourPointAvailable || awayKnobs.fourPointAvailable),
    fourPointRateMult: ((homeKnobs.fourPointRateMult ?? 1) + (awayKnobs.fourPointRateMult ?? 1)) / 2,
    fourPointEfficiencyMult: ((homeKnobs.fourPointEfficiencyMult ?? 1) + (awayKnobs.fourPointEfficiencyMult ?? 1)) / 2,
  };

  if (home.rotation.length < 5 || away.rotation.length < 5) {
    // Insufficient roster — caller should fall back. We surface a synthetic score-tied throwaway.
    throw new Error('Realistic engine: insufficient rotation');
  }

  applyRealisticSystemEffects(home, args.homeTeam, args.awayTeam, !!args.homeOverridePlayers, !!args.awayOverridePlayers);
  applyRealisticSystemEffects(away, args.awayTeam, args.homeTeam, !!args.awayOverridePlayers, !!args.homeOverridePlayers);

  const homeSetup = buildRealisticTeamSetup(
    args.homeTeam,
    args.awayTeam,
    home,
    away,
    !!args.homeOverridePlayers,
    !!args.awayOverridePlayers,
  );
  const awaySetup = buildRealisticTeamSetup(
    args.awayTeam,
    args.homeTeam,
    away,
    home,
    !!args.awayOverridePlayers,
    !!args.homeOverridePlayers,
  );

  // Apply game-state hooks (clubDebuff / playThrough / defensive aura). Defensive
  // aura needs the opponent's 2K rating computed from the same player set the fast
  // engine uses, so each side passes the OTHER side's rotation to Defense2KService.
  const home2KDef = Defense2KService.getTeamDefense(home.rotation);
  const away2KDef = Defense2KService.getTeamDefense(away.rotation);
  applyHooks(home, away2KDef.overallDef, homeKnobs.playThroughInjuries ?? 0);
  applyHooks(away, home2KDef.overallDef, awayKnobs.playThroughInjuries ?? 0);

  const loopStart = perfNow();
  const acc = new BoxAccumulator();
  acc.registerRoster(home.rotation, 5);
  acc.registerRoster(away.rotation, 5);

  // Possession-by-possession rotation managers — handle foul-out, foul-trouble
  // pulls, fatigue stretches, and minute-target burn-down. The starting 5 are
  // the top-rotation players seeded by getRotation order.
  const homeMgr = new RotationManager(home.rotation, home.composites, home.minuteTargets, home.isEuroClubGame, homeSetup.modifiers);
  const awayMgr = new RotationManager(away.rotation, away.composites, away.minuteTargets, away.isEuroClubGame, awaySetup.modifiers);

  let homeScore = 0;
  let awayScore = 0;
  const quarterScoresHome: number[] = [];
  const quarterScoresAway: number[] = [];

  for (let p = 1; p <= numQuarters; p++) {
    const futureSecondsAfterPeriod = Math.max(0, (numQuarters - p) * quarterLen * 60);
    const startPoss: 'home' | 'away' = p === 1
      ? (Math.random() < 0.5 ? 'home' : 'away')
      : (p % 2 === 0 ? 'away' : 'home');
    const r = simulatePeriod(homeMgr, awayMgr, acc, startPoss, quarterLen, p, futureSecondsAfterPeriod, shotRules);
    homeScore += r.homeScore;
    awayScore += r.awayScore;
    quarterScoresHome.push(r.homeScore);
    quarterScoresAway.push(r.awayScore);
  }

  // Overtime
  let otCount = 0;
  while (homeScore === awayScore && otCount < 6) {
    otCount += 1;
    const r = simulatePeriod(
      homeMgr, awayMgr, acc,
      Math.random() < 0.5 ? 'home' : 'away',
      overtimeLength,
      numQuarters + otCount,
      0,
      shotRules,
    );
    homeScore += r.homeScore;
    awayScore += r.awayScore;
    quarterScoresHome.push(r.homeScore);
    quarterScoresAway.push(r.awayScore);
  }
  const loopMsValue = perfMs(loopStart);

  const tailStart = perfNow();
  const tailPerf: Record<string, number> = {};
  const markTail = (label: string, start: number) => {
    tailPerf[label] = perfMs(start);
  };

  const scoreAdjustStart = perfNow();
  const highLeverageGame = !!homeKnobs.isPlayoffs || !!awayKnobs.isPlayoffs || !!args.isEliminationGame;
  const homeCoaching = getTeamCoachingGameplayEffects(args.homeTeam as any);
  const awayCoaching = getTeamCoachingGameplayEffects(args.awayTeam as any);
  const awayTravel = getTeamTravelGameplayEffects(args.awayTeam as any);
  const coachingDiff = (highLeverageGame ? homeCoaching.playoffStrengthBonus : homeCoaching.regularStrengthBonus)
    - (highLeverageGame ? awayCoaching.playoffStrengthBonus : awayCoaching.regularStrengthBonus);
  const coachingSwing = clamp(Math.round(coachingDiff * 0.35), -4, 4);
  if (coachingSwing > 0) homeScore += coachingSwing;
  else if (coachingSwing < 0) awayScore += Math.abs(coachingSwing);
  const travelSwing = clamp(Math.round(awayTravel.awayStrengthBonus * 1.6), -2, 2);
  if (travelSwing > 0) awayScore += travelSwing;
  else if (travelSwing < 0) homeScore += Math.abs(travelSwing);
  const tacticalSwing = clamp(
    Math.round(
      (awaySetup.coachingPenalty + awaySetup.systemStrengthPenalty)
      - (homeSetup.coachingPenalty + homeSetup.systemStrengthPenalty)
    ),
    -6,
    6,
  );
  if (tacticalSwing > 0) homeScore += tacticalSwing;
  else if (tacticalSwing < 0) awayScore += Math.abs(tacticalSwing);
  markTail('scoreAdjustMs', scoreAdjustStart);

  // Distribute actual minutes from the rotation manager (replaces the static target).
  const minutesStart = perfNow();
  acc.setMinutes(home.rotation, homeMgr.getMinutesPlayed());
  acc.setMinutes(away.rotation, awayMgr.getMinutesPlayed());

  const homeStats: PlayerGameStats[] = acc.toArray(home.rotation);
  const awayStats: PlayerGameStats[] = acc.toArray(away.rotation);
  markTail('minutesMs', minutesStart);

  // Advanced stats (PER, USG%, ORtg, DRtg, BPM, OBPM, DBPM, WS, VORP, eFG%,
  // TS%, AST%, ORB%, DRB%, TRB%, STL%, BLK%, TOV%) — same per-game wiring
  // the fast engine does. PM is already tracked in the boxScoreAccumulator.
  const advancedStart = perfNow();
  const homePm = homeStats.map(s => s.pm ?? 0);
  const awayPm = awayStats.map(s => s.pm ?? 0);
  const homeAdv = StatGenerator.generateAdvancedStats(homeStats, awayStats, homePm);
  const awayAdv = StatGenerator.generateAdvancedStats(awayStats, homeStats, awayPm);
  applyAdvanced(homeStats, homeAdv);
  applyAdvanced(awayStats, awayAdv);
  markTail('advancedMs', advancedStart);

  const winnerId = homeScore > awayScore ? args.homeTeam.id : args.awayTeam.id;
  const lead = Math.abs(homeScore - awayScore);
  const quarterScores = { home: quarterScoresHome, away: quarterScoresAway };
  const gameWinner = pickGameWinner(
    winnerId === args.homeTeam.id ? homeStats : awayStats,
    winnerId,
    lead,
    otCount > 0,
    args.players,
  );

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
  const injuries = InjurySystem.checkInjuries(gamePlayers, args.homeTeam, args.awayTeam);
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
      const injuryChance = preseasonFactor * fatigueRiskMult * 0.012 * minuteExposureMult * durabilityRiskMult * medical.injuryRiskMultiplier;
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
  const fight = (!args.isAllStar && !args.isRisingStars)
    ? generateFight(
        homeStats.map(s => s.playerId),
        awayStats.map(s => s.playerId),
        gamePlayers,
        [args.homeTeam, args.awayTeam] as any,
        args.date,
      ) ?? undefined
    : undefined;
  if (fight) {
    const involvedStats = [...homeStats, ...awayStats].filter(
      stat => stat.playerId === fight.player1Id || stat.playerId === fight.player2Id,
    );
    const avgMinutes = involvedStats.length > 0
      ? involvedStats.reduce((sum, stat) => sum + (stat.min ?? 0), 0) / involvedStats.length
      : quarterLen * 2;
    const fightQuarter = Math.max(1, Math.min(numQuarters, Math.ceil(Math.max(1, avgMinutes) / quarterLen)));
    const clockSeconds = Math.max(0, Math.round((quarterLen * 60) - ((Math.max(1, avgMinutes) - ((fightQuarter - 1) * quarterLen)) * 60)));
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
      description: fight.severity === 'brawl'
        ? `${playerName} and ${opponentName} are throwing down. Benches are spilling onto the floor.`
        : fight.severity === 'ejection'
          ? `${playerName} and ${opponentName} have to be separated after that sequence.`
          : `${playerName} gets tangled up with ${opponentName} and tempers flare.`,
    });
  }
  markTail('fightMs', fightStart);

  const highlightsStart = perfNow();
  const highlights = HighlightGenerator.processGame(
    homeStats,
    awayStats,
    args.homeTeam.id,
    args.awayTeam.id,
    gamePlayers,
  );
  markTail('highlightsMs', highlightsStart);

  const tailMsValue = perfMs(tailStart);

  const perfPayload: Record<string, unknown> = {
    gameId: args.gameId,
    home: args.homeTeam.abbrev ?? args.homeTeam.name,
    away: args.awayTeam.abbrev ?? args.awayTeam.name,
    prepMs: prepMsValue,
    loopMs: loopMsValue,
    tailMs: tailMsValue,
    otCount,
    homeRotation: home.rotation.length,
    awayRotation: away.rotation.length,
    totalMs: perfMs(totalStart),
  };
  if (tailMsValue >= 150) {
    Object.assign(perfPayload, tailPerf);
  }
  console.log('[SIM_REALISTIC_PERF]', perfPayload);

  return {
    gameId: args.gameId,
    homeTeamId: args.homeTeam.id,
    awayTeamId: args.awayTeam.id,
    homeScore,
    awayScore,
    homeStats,
    awayStats,
    winnerId,
    lead,
    isOT: otCount > 0,
    otCount,
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
    homeWins: args.homeTeam.wins,
    homeLosses: args.homeTeam.losses,
    awayWins: args.awayTeam.wins,
    awayLosses: args.awayTeam.losses,
  };
}
