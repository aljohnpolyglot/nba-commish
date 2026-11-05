import { LeagueStats } from '../../../types';
import { getFourPointDistance, isFourPointEnabled } from '../../../utils/ruleFlags';
import { buildEraCoachingBiasFromLeagueStats } from '../eraCoachingBias';
import { getKnobs, SimulatorKnobs } from '../SimulatorKnobs';
import { getPlayersOnCourt } from '../courtSize';
import { NO_SHOT_CLOCK_FGA_RATE_MULTIPLIER } from '../../era/basketballEraRules';
import { getHistoricalNbaEraContext } from '../../../data/historicalNbaSeasons';

export function resolveHomeCourtAdvantagePoints(leagueStats?: Partial<LeagueStats>): number {
  const raw = Number(leagueStats?.homeCourtAdvantage ?? 50);
  const level = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 50;
  return Math.round(level * 0.06 * 100) / 100;
}

export function buildLeagueBaseKnobs(leagueStats?: Partial<LeagueStats>): SimulatorKnobs {
  const simFactor = (value: number | undefined, fallback = 1) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(4, Math.max(0, parsed)) : fallback;
  };
  const rawPace = Number(leagueStats?.pace);
  const importedPace = Number.isFinite(rawPace)
    ? Math.min(4, Math.max(0.25, rawPace / 100))
    : 1;
  const threePointTendencyFactor = simFactor(leagueStats?.threePointTendencyFactor);
  const threePointAccuracyFactor = simFactor(leagueStats?.threePointAccuracyFactor);
  const twoPointAccuracyFactor = simFactor(leagueStats?.twoPointAccuracyFactor);
  const ftAccuracyFactor = simFactor(leagueStats?.ftAccuracyFactor);
  const blockFactor = simFactor(leagueStats?.blockFactor);
  const stealFactor = simFactor(leagueStats?.stealFactor);
  const turnoverFactor = simFactor(leagueStats?.turnoverFactor);
  const orbFactor = simFactor(leagueStats?.orbFactor);
  const foulRateFactor = simFactor(leagueStats?.foulRateFactor);
  const shotClock = leagueStats?.shotClockValue ?? 24;
  const shotClockOn = leagueStats?.shotClockEnabled ?? true;
  const def3sec = leagueStats?.defensiveThreeSecondEnabled ?? true;
  const off3sec = leagueStats?.offensiveThreeSecondEnabled ?? true;
  const threeOn = leagueStats?.threePointLineEnabled ?? true;
  const handchecking = leagueStats?.handcheckingEnabled ?? false;
  const goaltending = leagueStats?.goaltendingEnabled ?? true;
  const charging = leagueStats?.chargingEnabled ?? true;
  const noDribble = leagueStats?.noDribbleRule ?? false;
  const dribbleRule = leagueStats?.dribbleRule ?? (noDribble ? 'none' : 'continuous');
  const freeThrowsEnabled = leagueStats?.freeThrowsEnabled ?? true;
  const historicalFtRate = leagueStats?.historicalFreeThrowRateMultiplier ?? 1;
  const historicalMode = leagueStats?.uiMode === 'nba' || leagueStats?.uiMode === 'fictional';
  const automaticHistoricalFga = historicalMode
    && leagueStats?.historicalEraStartYear != null
    && leagueStats?.historicalGameRulesAutoProgression !== false
    && !leagueStats?.gameRulesCustomized
    ? getHistoricalNbaEraContext(leagueStats.historicalEraStartYear).sim.fieldGoalAttemptMultiplier
    : undefined;
  const historicalFieldGoalAttempts = automaticHistoricalFga ?? leagueStats?.historicalFieldGoalAttemptMultiplier ?? 1;
  const historicalTov = leagueStats?.historicalTurnoverMultiplier ?? 1;
  const historicalEfficiency = leagueStats?.historicalEfficiencyMultiplier ?? 1;
  const historicalAssistRate = leagueStats?.historicalAssistRateMultiplier ?? 1;
  const historicalAssistDistribution = Number(leagueStats?.historicalAssistDistributionExponent);
  const historicalReboundOpportunities = leagueStats?.historicalReboundOpportunityMultiplier ?? 1;
  const historicalFtAccuracy = leagueStats?.historicalFreeThrowAccuracyMultiplier ?? 1;
  const historicalReboundDistribution = Number(leagueStats?.historicalReboundDistributionExponent);
  const historicalOrbRate = leagueStats?.historicalOrbRateMultiplier ?? 1;
  const historicalBlockRate = leagueStats?.historicalBlockRateMultiplier ?? 1;
  const eraCoachingBias = buildEraCoachingBiasFromLeagueStats(leagueStats);

  const shotClockPace = shotClockOn
    ? Math.min(2.0, 24 / Math.max(8, shotClock))
    : NO_SHOT_CLOCK_FGA_RATE_MULTIPLIER;

  const rimMult = def3sec ? 1.0 : 0.72;
  const threeBumpD = def3sec ? 1.0 : 1.22;
  const lowPostMult = off3sec ? 1.0 : 1.35;
  const rimBumpO = off3sec ? 1.0 : 1.15;
  const handcheckFtMult = handchecking ? 0.82 : 1.0;
  const blockMult = goaltending ? 1.0 : 1.6;
  const goaltendEffMult = goaltending ? 1.0 : 0.93;
  const chargingRimBump = charging ? 1.0 : 1.12;
  const noDribblePaceMult = dribbleRule === 'none' ? 0.72 : dribbleRule === 'single_bounce_no_shot' ? 0.86 : 1.0;
  const noDribbleRimMult = dribbleRule === 'none' ? 0.65 : dribbleRule === 'single_bounce_no_shot' ? 0.82 : 1.0;
  const noDribble3PMult = dribbleRule === 'none' ? 1.40 : dribbleRule === 'single_bounce_no_shot' ? 1.18 : 1.0;

  const offRebReset = leagueStats?.shotClockResetOffensiveRebound ?? 14;
  const offRebResetPace = shotClockOn
    ? offRebReset === shotClock
      ? 1
      : Math.max(0.94, Math.min(1.04, 1 + (14 - offRebReset) * 0.004))
    : 1.0;

  const backcourtTimerOn = leagueStats?.backcourtTimerEnabled ?? true;
  const backcourtPace = backcourtTimerOn ? 1.0 : 0.90;
  const backcourtTovMult = backcourtTimerOn ? 1.0 : 0.85;
  const backToBasketTimer = leagueStats?.backToBasketTimerEnabled ?? false;
  const backToBasketLowPost = backToBasketTimer ? 0.90 : 1.0;
  const illegalZone = leagueStats?.illegalZoneDefenseEnabled ?? true;
  const zoneRimMult = illegalZone ? 1.0 : 0.90;
  const zone3PMult = illegalZone ? 1.0 : 1.10;
  const manRimBump = illegalZone ? 1.05 : 1.0;

  const travelOn = leagueStats?.travelingEnabled ?? true;
  const dblDribOn = leagueStats?.doubleDribbleEnabled ?? true;
  const backctViol = leagueStats?.backcourtViolationEnabled ?? true;
  let tovMult = 1.0;
  if (!travelOn) tovMult *= 0.88;
  if (!dblDribOn) tovMult *= 0.90;
  if (!backctViol) tovMult *= 0.92;
  tovMult *= backcourtTovMult;

  const ftDist = leagueStats?.freeThrowDistance ?? 15;
  const ftEfficiencyMult = Math.min(1.0, Math.max(0.65, 15 / Math.max(10, ftDist)));
  const rimH = leagueStats?.rimHeight ?? 10;
  const rimHeightEffMult = Math.min(1.0, Math.max(0.5, Math.pow(10 / Math.max(8, rimH), 1.5)));
  const courtLen = leagueStats?.courtLength ?? 94;
  const courtLenPace = Math.pow(94 / Math.max(70, courtLen), 0.4);
  const courtLenTov = Math.pow(94 / Math.max(70, courtLen), 0.2);
  tovMult *= courtLenTov;

  const baseline = leagueStats?.baselineLength ?? 50;
  const baselinePace = Math.pow(50 / Math.max(40, baseline), 0.3);
  const keyW = leagueStats?.keyWidth ?? 16;
  const keyLowPost = Math.pow(16 / Math.max(10, keyW), 0.5);
  const keyRimMult = Math.pow(16 / Math.max(10, keyW), 0.3);

  const threePointDistance = leagueStats?.threePointLineDistance ?? 23.75;
  const threeDistanceRate = threeOn
    ? Math.max(0.55, Math.min(1.35, Math.pow(23.75 / Math.max(10, threePointDistance), 0.85)))
    : 0;
  const threeDistanceEff = threeOn
    ? Math.max(0.70, Math.min(1.20, Math.pow(23.75 / Math.max(10, threePointDistance), 0.45)))
    : 1.0;
  const fourPointOn = isFourPointEnabled(leagueStats);
  const fourPointDistance = getFourPointDistance(leagueStats);
  const fourDistanceRate = fourPointOn
    ? Math.max(0.55, Math.min(1.25, Math.pow(27 / Math.max(23, fourPointDistance), 0.75)))
    : 0;
  const fourDistanceEff = fourPointOn
    ? Math.max(0.68, Math.min(1.12, Math.pow(27 / Math.max(23, fourPointDistance), 0.55)))
    : 1.0;
  const ballWeight = leagueStats?.ballWeight ?? 1.4;
  const ballWeightEff = Math.max(0.85, Math.min(1.08, Math.pow(1.4 / Math.max(0.8, ballWeight), 0.25)));
  const ballWeightTov = Math.max(0.90, Math.min(1.18, Math.pow(Math.max(0.8, ballWeight) / 1.4, 0.5)));

  const inboundTimerOn = leagueStats?.inboundTimerEnabled ?? true;
  const inboundTimerValue = leagueStats?.inboundTimerValue ?? 5;
  const inboundTovMult = inboundTimerOn ? Math.max(0.90, Math.min(1.25, 5 / Math.max(2, inboundTimerValue))) : 0.92;
  const outOfBoundsOn = leagueStats?.outOfBoundsEnabled ?? true;
  const kickedBallOn = leagueStats?.kickedBallEnabled ?? true;
  const basketInterferenceOn = leagueStats?.basketInterferenceEnabled ?? true;

  const teamFoulPenalty = leagueStats?.teamFoulPenalty ?? 5;
  const penaltyFtMult = Math.max(0.75, Math.min(1.35, 5 / Math.max(1, teamFoulPenalty)));
  const foulOutLimit = leagueStats?.foulOutLimit ?? 6;
  const foulOutPhysicality = Math.max(0.85, Math.min(1.18, foulOutLimit / 6));
  const illegalScreenOn = leagueStats?.illegalScreenEnabled ?? true;
  const screenTovMult = illegalScreenOn ? 1.0 : 0.94;
  const clearPathOn = leagueStats?.clearPathFoulEnabled ?? true;
  const clearPathFtMult = clearPathOn ? 1.0 : 0.97;
  const looseBallOn = leagueStats?.looseBallFoulEnabled ?? true;
  const looseBallFtMult = looseBallOn ? 1.0 : 0.96;
  const overBackOn = leagueStats?.overTheBackFoulEnabled ?? true;
  const overBackFtMult = overBackOn ? 1.0 : 0.97;
  tovMult *= inboundTovMult * screenTovMult * ballWeightTov;
  const dunkValue = leagueStats?.dunkValue === 1 ? 1 : leagueStats?.dunkValue === 3 ? 3 : 2;

  return getKnobs({
    playersOnCourt: getPlayersOnCourt(leagueStats),
    homeCourtAdvantagePoints: resolveHomeCourtAdvantagePoints(leagueStats),
    gameFormat: (leagueStats?.gameFormat ?? 'timed') as any,
    targetScore: leagueStats?.gameTargetScore ?? 100,
    quarterLength: leagueStats?.quarterLength ?? 12,
    numQuarters: leagueStats?.numQuarters ?? 4,
    overtimeDuration: leagueStats?.overtimeDuration ?? 5,
    overtimeEnabled: leagueStats?.overtimeEnabled ?? true,
    overtimeType: leagueStats?.overtimeType ?? 'standard',
    overtimeTargetPoints: leagueStats?.overtimeTargetPoints ?? 7,
    maxOvertimesEnabled: leagueStats?.maxOvertimesEnabled ?? false,
    maxOvertimes: leagueStats?.maxOvertimes ?? 0,
    gameRules: {
      dribbleRule,
      threePointLineEnabled: threeOn,
      startOfPossessionMethod: leagueStats?.startOfPossessionMethod ?? 'jump_ball',
      possessionPattern: leagueStats?.possessionPattern ?? 'nba',
      coachChallenges: leagueStats?.coachChallenges ?? true,
      maxCoachChallenges: Math.max(0, Math.round(leagueStats?.maxCoachChallenges ?? 2)),
      challengeReimbursed: leagueStats?.challengeReimbursed ?? true,
      maxTimeouts: Math.max(0, Math.round(leagueStats?.maxTimeouts ?? 7)),
      clutchTimeoutLimit: Math.max(0, Math.round(leagueStats?.clutchTimeoutLimit ?? 2)),
      heaveRuleEnabled: leagueStats?.heaveRuleEnabled ?? false,
      shotClockEnabled: shotClockOn,
      shotClockSeconds: shotClock,
      offensiveReboundResetSeconds: offRebReset,
      backcourtTimerEnabled: backcourtTimerOn,
      backcourtTimerSeconds: leagueStats?.backcourtTimerValue ?? 8,
      offensiveThreeSecondEnabled: off3sec,
      offensiveThreeSecondSeconds: leagueStats?.offensiveThreeSecondValue ?? 3,
      defensiveThreeSecondEnabled: def3sec,
      defensiveThreeSecondSeconds: leagueStats?.defensiveThreeSecondValue ?? 3,
      backToBasketTimerEnabled: backToBasketTimer,
      backToBasketTimerSeconds: leagueStats?.backToBasketTimerValue ?? 5,
      inboundTimerEnabled: inboundTimerOn,
      inboundTimerSeconds: inboundTimerValue,
      travelingEnabled: travelOn,
      doubleDribbleEnabled: dblDribOn,
      backcourtViolationEnabled: backctViol,
      basketInterferenceEnabled: basketInterferenceOn,
      kickedBallEnabled: kickedBallOn,
      outOfBoundsEnabled: outOfBoundsOn,
      cornerThrowInEnabled: leagueStats?.cornerThrowInEnabled ?? false,
      foulOutLimit: Math.max(1, Math.round(foulOutLimit)),
      teamFoulPenalty: Math.max(1, Math.round(teamFoulPenalty)),
      substitutionLimitEnabled: leagueStats?.substitutionLimitEnabled ?? false,
      maxSubstitutions: Math.max(0, Math.round(leagueStats?.maxSubstitutions ?? 0)),
      fieldGoalValue: leagueStats?.fieldGoalValue === 1 ? 1 : 2,
      dunkValue,
      freeThrowsEnabled,
      madeBasketRestart: leagueStats?.madeBasketRestart ?? 'inbound',
      teamFoulPenaltyMode: leagueStats?.teamFoulPenaltyMode ?? 'free_throws',
      teamFoulPenaltyPoints: Math.max(1, Math.round(leagueStats?.teamFoulPenaltyPoints ?? 1)),
      temporaryDisqualificationFoulLimit: Math.max(0, Math.round(leagueStats?.temporaryDisqualificationFoulLimit ?? 0)),
      temporaryDisqualificationUntilNextScore: leagueStats?.temporaryDisqualificationUntilNextScore ?? false,
      temporaryDisqualificationAllowsSubstitute: leagueStats?.temporaryDisqualificationAllowsSubstitute ?? true,
      shootoutRounds: Math.max(1, Math.round(leagueStats?.shootoutRounds || 3)),
      overtimeTieBreaker: (leagueStats?.overtimeTieBreaker ?? 'sudden_death') as 'target_score' | 'shootout' | 'sudden_death',
      techEjectionLimit: Math.max(1, Math.round(leagueStats?.techEjectionLimit ?? 2)),
      flagrant1EjectionLimit: Math.max(1, Math.round(leagueStats?.flagrant1EjectionLimit ?? 2)),
      flagrant2EjectionLimit: Math.max(1, Math.round(leagueStats?.flagrant2EjectionLimit ?? 1)),
      fightingInstantEjection: leagueStats?.fightingInstantEjection ?? true,
      useYellowRedCards: leagueStats?.useYellowRedCards ?? false,
    },
    shotClockSeconds: shotClock,
    threePointAvailable: threeOn,
    threePointRateMult: threeOn ? (threePointTendencyFactor * threeBumpD * noDribble3PMult * zone3PMult * threeDistanceRate) : 0,
    threePointEfficiencyMult: threeDistanceEff * threePointAccuracyFactor,
    twoPointEfficiencyMult: twoPointAccuracyFactor,
    fourPointAvailable: fourPointOn,
    fourPointRateMult: fourDistanceRate,
    fourPointEfficiencyMult: fourDistanceEff,
    fieldGoalAttemptMult: shotClockOn ? 1 : NO_SHOT_CLOCK_FGA_RATE_MULTIPLIER * historicalFieldGoalAttempts,
    boxScoreFgaNormalizationMult: shotClockOn ? historicalFieldGoalAttempts : 1,
    fastScorePaceMultiplier: shotClockOn ? 1 : NO_SHOT_CLOCK_FGA_RATE_MULTIPLIER,
    paceMultiplier: importedPace * shotClockPace * noDribblePaceMult * offRebResetPace * backcourtPace * courtLenPace * baselinePace,
    efficiencyMultiplier: goaltendEffMult * rimHeightEffMult * ballWeightEff * historicalEfficiency,
    rimRateMult: rimMult * rimBumpO * chargingRimBump * noDribbleRimMult * zoneRimMult * manRimBump * keyRimMult,
    lowPostRateMult: lowPostMult * backToBasketLowPost * keyLowPost,
    midRangeRateMult: 1,
    ftRateMult: freeThrowsEnabled
      ? foulRateFactor * handcheckFtMult * penaltyFtMult * foulOutPhysicality * clearPathFtMult * looseBallFtMult * overBackFtMult * historicalFtRate
      : 0,
    blockRateMult: blockMult * blockFactor * historicalBlockRate,
    stealRateMult: stealFactor,
    orbRateMult: orbFactor * historicalOrbRate,
    assistRateMult: historicalAssistRate,
    assistDistributionExponent: Number.isFinite(historicalAssistDistribution) ? historicalAssistDistribution : undefined,
    reboundOpportunityMult: historicalReboundOpportunities,
    reboundDistributionExponent: Number.isFinite(historicalReboundDistribution) ? historicalReboundDistribution : undefined,
    tovMult: turnoverFactor * tovMult * historicalTov,
    ftEfficiencyMult: ftEfficiencyMult * ftAccuracyFactor * historicalFtAccuracy,
    eraCoachingBias,
  });
}
