import { OnCourt, PossessionEnd } from './types';
import { runPossession } from './possession';
import { BoxAccumulator } from './boxScoreAccumulator';
import { RotationManager } from './rotationManager';
import type { ShotRules } from './types';
import type { GameRuleConfig } from '../types';
import { DEFAULT_GAME_RULES } from '../gameRuleRuntime';
import { isSimulationPerfEnabled } from '../simulationPerfDebug';

const AVG_POSSESSION_SEC = 13.2; // calibrated to land PACE just under 100 poss/team/48
const POSSESSION_VARIANCE_SEC = 5.5;

export interface PeriodResult {
  homeScore: number;
  awayScore: number;
  possessions: number;
  possessionCpuMs: number;
  shotEventCpuMs: number;
  foulFreeThrowCpuMs: number;
  boxApplyCpuMs: number;
  rotationCpuMs: number;
  shotPossessions: number;
  turnoverPossessions: number;
  foulPossessions: number;
  freeThrowAttempts: number;
}

export interface PeriodRuntimeEvent {
  atFraction: number;
  apply: () => void;
}

export interface TargetFinish {
  homeBase: number;
  awayBase: number;
  target: number;
}

/**
 * Simulate one period (regulation quarter or OT).
 *
 * Each team's configured on-court unit is owned by a RotationManager — after every
 * possession we advance both teams' clocks and let each manager swap in
 * fresh bodies for fouled-out / fatigued / over-target players.
 */
export function simulatePeriod(
  homeMgr: RotationManager,
  awayMgr: RotationManager,
  acc: BoxAccumulator,
  startingPossession: 'home' | 'away',
  periodMinutes: number,
  period: number,
  futureSecondsAfterPeriod: number = 0,
  shotRules?: ShotRules,
  gameRules: GameRuleConfig = DEFAULT_GAME_RULES,
  targetFinish?: TargetFinish,
  runtimeEvents: PeriodRuntimeEvent[] = [],
  scoreBase: { home: number; away: number } = { home: 0, away: 0 },
): PeriodResult {
  let clock = periodMinutes * 60;
  let homeScore = 0;
  let awayScore = 0;
  let possessions = 0;
  const forensicTiming = isSimulationPerfEnabled();
  let possessionCpuMs = 0;
  let shotEventCpuMs = 0;
  let foulFreeThrowCpuMs = 0;
  let boxApplyCpuMs = 0;
  let rotationCpuMs = 0;
  let shotPossessions = 0;
  let turnoverPossessions = 0;
  let foulPossessions = 0;
  let freeThrowAttempts = 0;
  let next: 'home' | 'away' = startingPossession;
  const getPf = (id: string) => acc.getPf(id);
  const teamFouls = { home: 0, away: 0 };
  const consecutiveTeamFouls = { home: 0, away: 0 };
  const lastTemporaryPenaltyPf = new Map<string, number>();
  const pendingRuntimeEvents = runtimeEvents
    .map(event => ({ ...event, fired: false }))
    .sort((a, b) => a.atFraction - b.atFraction);

  const getOffensiveReboundChance = (offense: OnCourt, blocked: boolean) => {
    const base = blocked ? 0.20 : 0.26;
    const orbMult = offense.gameplayModifiers?.orbMult ?? 1;
    return Math.max(0.10, Math.min(0.50, base * orbMult));
  };

  const missedFinalFreeThrow = (end: PossessionEnd) => {
    if (!('ftAttempts' in end) || end.ftAttempts <= 0 || end.ftMade >= end.ftAttempts) return false;
    return Math.random() < (end.ftAttempts - end.ftMade) / end.ftAttempts;
  };

  const targetReached = () => !!targetFinish && (
    targetFinish.homeBase + homeScore >= targetFinish.target
    || targetFinish.awayBase + awayScore >= targetFinish.target
  );

  while (clock > 0 && !targetReached() && possessions < 1000) {
    const offenseSide = next;
    const offense = offenseSide === 'home' ? homeMgr.getOnCourt() : awayMgr.getOnCourt();
    const defense = offenseSide === 'home' ? awayMgr.getOnCourt() : homeMgr.getOnCourt();
    const offenseIds = offense.composites.map(c => c.id);
    const defenseIds = defense.composites.map(c => c.id);

    const defenseSide = offenseSide === 'home' ? 'away' : 'home';
    const inBonus = teamFouls[defenseSide] + 1 >= gameRules.teamFoulPenalty;
    const possessionStart = forensicTiming ? performance.now() : 0;
    let end = runPossession(offense, defense, shotRules, inBonus);
    if (forensicTiming) {
      const duration = performance.now() - possessionStart;
      possessionCpuMs += duration;
      shotEventCpuMs += duration;
      const attempts = 'ftAttempts' in end ? Number(end.ftAttempts ?? 0) : 0;
      freeThrowAttempts += attempts;
      if (end.kind === 'shot') shotPossessions += 1;
      else if (end.kind === 'turnover') turnoverPossessions += 1;
      else foulPossessions += 1;
      if (end.kind === 'foul' || end.kind === 'discipline' || attempts > 0) foulFreeThrowCpuMs += duration;
    }
    const trace = (typeof globalThis !== 'undefined' ? (globalThis as any).__realisticTrace : undefined) as
      undefined | ((e: PossessionEnd, side: 'home' | 'away') => void);
    if (trace) trace(end, next);
    const defensiveFoul = (
      end.kind === 'foul'
      || (end.kind === 'shot' && end.fouled)
      || (end.kind === 'discipline' && end.discipline !== 'technical')
    );
    if (defensiveFoul) {
      teamFouls[defenseSide] += 1;
      consecutiveTeamFouls[defenseSide] += 1;
      consecutiveTeamFouls[offenseSide] = 0;
      if (
        gameRules.teamFoulPenaltyMode === 'award_goal'
        && consecutiveTeamFouls[defenseSide] >= gameRules.teamFoulPenalty
      ) {
        if (end.kind === 'shot') end = { ...end, penaltyPoints: gameRules.teamFoulPenaltyPoints };
        else if (end.kind === 'foul') end = { ...end, penaltyPoints: gameRules.teamFoulPenaltyPoints };
        else if (end.kind === 'discipline') end = { ...end, penaltyPoints: gameRules.teamFoulPenaltyPoints };
        consecutiveTeamFouls[defenseSide] = 0;
      }
    }
    const scoreBefore = { off: 0 };
    const boxApplyStart = forensicTiming ? performance.now() : 0;
    acc.applyPossession(end, offenseIds, defenseIds, scoreBefore, {
      period,
      clockSeconds: Math.max(0, Math.round(clock)),
    });
    if (forensicTiming) boxApplyCpuMs += performance.now() - boxApplyStart;

    const offenderId = end.kind === 'shot' ? end.foulerId : end.kind === 'turnover' ? undefined : end.offenderId;
    if (
      defensiveFoul
      && offenderId
      && gameRules.temporaryDisqualificationUntilNextScore
      && gameRules.temporaryDisqualificationFoulLimit > 0
    ) {
      const personalFouls = acc.getPf(offenderId);
      const lastPenalty = lastTemporaryPenaltyPf.get(offenderId) ?? 0;
      if (personalFouls >= gameRules.temporaryDisqualificationFoulLimit && personalFouls > lastPenalty) {
        const defendingManager = defenseSide === 'home' ? homeMgr : awayMgr;
        defendingManager.suspendUntilNextScore(offenderId, gameRules.temporaryDisqualificationAllowsSubstitute);
        lastTemporaryPenaltyPf.set(offenderId, personalFouls);
      }
    }

    // Rebound + possession-flip bookkeeping (unchanged from chunk impl)
    if (end.kind === 'shot' && !end.made && !end.fouled && !end.blockerId) {
      if (Math.random() < 1 - getOffensiveReboundChance(offense, false)) {
        const reb = pickRebounder(defense);
        if (shouldCreditRebound(defense)) acc.applyRebound(reb.id, 'drb');
        next = next === 'home' ? 'away' : 'home';
      } else {
        const reb = pickRebounder(offense);
        if (shouldCreditRebound(offense)) acc.applyRebound(reb.id, 'orb');
      }
    } else if (end.kind === 'shot' && end.blockerId) {
      if (Math.random() < 1 - getOffensiveReboundChance(offense, true)) {
        const reb = pickRebounder(defense);
        if (shouldCreditRebound(defense)) acc.applyRebound(reb.id, 'drb');
        next = next === 'home' ? 'away' : 'home';
      } else {
        const reb = pickRebounder(offense);
        if (shouldCreditRebound(offense)) acc.applyRebound(reb.id, 'orb');
      }
    } else if (missedFinalFreeThrow(end)) {
      if (Math.random() < 0.86) {
        const reb = pickRebounder(defense);
        if (shouldCreditRebound(defense)) acc.applyRebound(reb.id, 'drb');
        next = next === 'home' ? 'away' : 'home';
      } else {
        const reb = pickRebounder(offense);
        if (shouldCreditRebound(offense)) acc.applyRebound(reb.id, 'orb');
        next = offenseSide;
      }
    } else if (end.kind === 'foul' && end.ftAttempts === 0) {
      next = offenseSide;
    } else if (end.kind === 'discipline' && end.retainPossession) {
      next = offenseSide;
    } else {
      const scored = scoreBefore.off > 0;
      next = scored && gameRules.madeBasketRestart === 'center_jump'
        ? (Math.random() < 0.5 ? 'home' : 'away')
        : next === 'home' ? 'away' : 'home';
    }

    if (offenseSide === 'home') homeScore += scoreBefore.off;
    else awayScore += scoreBefore.off;
    if (scoreBefore.off > 0 && gameRules.temporaryDisqualificationUntilNextScore) {
      homeMgr.clearTemporarySuspensions();
      awayMgr.clearTemporarySuspensions();
    }
    const retainedNonShootingFoul = end.kind === 'foul' && end.ftAttempts === 0;
    if (!retainedNonShootingFoul) possessions += 1;

    const combinedPace = ((offense.gameplayModifiers?.paceMultiplier ?? 1) + (defense.gameplayModifiers?.paceMultiplier ?? 1)) / 2;
    const elapsed = retainedNonShootingFoul
      ? 2 + Math.random() * 3
      : (AVG_POSSESSION_SEC + (Math.random() - 0.5) * POSSESSION_VARIANCE_SEC) / Math.max(0.82, combinedPace);
    clock -= elapsed;
    const rotationStart = forensicTiming ? performance.now() : 0;
    homeMgr.advanceTime(elapsed);
    awayMgr.advanceTime(elapsed);

    // Sub check after every possession.
    const totalRemaining = Math.max(0, clock + futureSecondsAfterPeriod);
    const elapsedFraction = 1 - Math.max(0, clock) / Math.max(1, periodMinutes * 60);
    for (const event of pendingRuntimeEvents) {
      if (!event.fired && elapsedFraction >= event.atFraction) {
        event.fired = true;
        event.apply();
      }
    }
    const homeMargin = scoreBase.home + homeScore - scoreBase.away - awayScore;
    homeMgr.maybeSub(period, totalRemaining, getPf, id => acc.isDisqualified(id), homeMargin);
    awayMgr.maybeSub(period, totalRemaining, getPf, id => acc.isDisqualified(id), -homeMargin);
    if (forensicTiming) rotationCpuMs += performance.now() - rotationStart;
  }

  return {
    homeScore,
    awayScore,
    possessions,
    possessionCpuMs,
    shotEventCpuMs,
    foulFreeThrowCpuMs,
    boxApplyCpuMs,
    rotationCpuMs,
    shotPossessions,
    turnoverPossessions,
    foulPossessions,
    freeThrowAttempts,
  };
}

function shouldCreditRebound(unit: OnCourt): boolean {
  const rate = unit.gameplayModifiers?.reboundOpportunityMult ?? 1;
  return Math.random() < Math.max(0, Math.min(1, rate));
}

function pickRebounder(unit: OnCourt) {
  const reboundExp = unit.gameplayModifiers?.reboundDistributionExponent
    ?? (unit.isEuroClubGame || (unit.gameplayModifiers?.paceMultiplier ?? 1) >= 1.25 ? 1.75 : 2.35);
  const weights = unit.composites.map(c => Math.pow(c.rebound, reboundExp));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return unit.composites[0];
  let roll = Math.random() * total;
  for (let i = 0; i < unit.composites.length; i++) {
    roll -= weights[i];
    if (roll < 0) return unit.composites[i];
  }
  return unit.composites[0];
}
