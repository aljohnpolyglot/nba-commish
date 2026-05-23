import { LeagueStats } from '../../../types';
import { getFourPointDistance, isFourPointEnabled } from '../../../utils/ruleFlags';
import { getKnobs, SimulatorKnobs } from '../SimulatorKnobs';

export function buildLeagueBaseKnobs(leagueStats?: Partial<LeagueStats>): SimulatorKnobs {
  const shotClock = leagueStats?.shotClockValue ?? 24;
  const shotClockOn = leagueStats?.shotClockEnabled ?? true;
  const def3sec = leagueStats?.defensiveThreeSecondEnabled ?? true;
  const off3sec = leagueStats?.offensiveThreeSecondEnabled ?? true;
  const threeOn = leagueStats?.threePointLineEnabled ?? true;
  const handchecking = leagueStats?.handcheckingEnabled ?? false;
  const goaltending = leagueStats?.goaltendingEnabled ?? true;
  const charging = leagueStats?.chargingEnabled ?? true;
  const noDribble = leagueStats?.noDribbleRule ?? false;

  const shotClockPace = shotClockOn
    ? Math.min(2.0, 24 / Math.max(8, shotClock))
    : 0.78;

  const rimMult = def3sec ? 1.0 : 0.72;
  const threeBumpD = def3sec ? 1.0 : 1.22;
  const lowPostMult = off3sec ? 1.0 : 1.35;
  const rimBumpO = off3sec ? 1.0 : 1.15;
  const handcheckFtMult = handchecking ? 0.82 : 1.0;
  const blockMult = goaltending ? 1.0 : 1.6;
  const goaltendEffMult = goaltending ? 1.0 : 0.93;
  const chargingRimBump = charging ? 1.0 : 1.12;
  const noDribblePaceMult = noDribble ? 0.72 : 1.0;
  const noDribbleRimMult = noDribble ? 0.65 : 1.0;
  const noDribble3PMult = noDribble ? 1.40 : 1.0;

  const offRebReset = leagueStats?.shotClockResetOffensiveRebound ?? 14;
  const offRebResetPace = shotClockOn
    ? Math.max(0.75, Math.min(1.25, 14 / Math.max(6, offRebReset)))
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
  const outOfBoundsTov = outOfBoundsOn ? 1.0 : 0.88;
  const kickedBallOn = leagueStats?.kickedBallEnabled ?? true;
  const kickedBallPace = kickedBallOn ? 1.0 : 1.03;
  const kickedBallTov = kickedBallOn ? 1.0 : 0.96;
  const basketInterferenceOn = leagueStats?.basketInterferenceEnabled ?? true;
  const basketInterferenceBlock = basketInterferenceOn ? 1.0 : 1.12;
  const basketInterferenceEff = basketInterferenceOn ? 1.0 : 0.98;

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
  tovMult *= inboundTovMult * outOfBoundsTov * kickedBallTov * screenTovMult * ballWeightTov;

  return getKnobs({
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
    shotClockSeconds: shotClock,
    threePointAvailable: threeOn,
    threePointRateMult: threeOn ? (1.0 * threeBumpD * noDribble3PMult * zone3PMult * threeDistanceRate) : 0,
    threePointEfficiencyMult: threeDistanceEff,
    fourPointAvailable: fourPointOn,
    fourPointRateMult: fourDistanceRate,
    fourPointEfficiencyMult: fourDistanceEff,
    paceMultiplier: shotClockPace * noDribblePaceMult * offRebResetPace * backcourtPace * courtLenPace * baselinePace * kickedBallPace,
    efficiencyMultiplier: goaltendEffMult * rimHeightEffMult * ballWeightEff * basketInterferenceEff,
    rimRateMult: rimMult * rimBumpO * chargingRimBump * noDribbleRimMult * zoneRimMult * manRimBump * keyRimMult,
    lowPostRateMult: lowPostMult * backToBasketLowPost * keyLowPost,
    ftRateMult: handcheckFtMult * penaltyFtMult * foulOutPhysicality * clearPathFtMult * looseBallFtMult * overBackFtMult,
    blockRateMult: blockMult * basketInterferenceBlock,
    tovMult,
    ftEfficiencyMult,
  });
}
