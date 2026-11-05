export type CupPrizePoolDirection = 'increase' | 'hold' | 'decrease';

export type CupPrizePoolActor = 'user' | 'ai';

export type CupPrizePoolDecisionKind = 'accept-recommendation' | 'hold-current' | 'custom';

export interface CupPrizePoolPayouts {
  winner: number;
  runnerUp: number;
  semi: number;
  quarter: number;
}

export interface CupPrizePoolDecisionRecord {
  id: string;
  proposalId: string;
  season: number;
  actor: CupPrizePoolActor;
  kind: CupPrizePoolDecisionKind;
  direction: CupPrizePoolDirection;
  previous: CupPrizePoolPayouts;
  next: CupPrizePoolPayouts;
}

export interface CupPrizePoolState {
  leagueId: string;
  competitionId: string;
  enabled: boolean;
  currencyCode: string;
  effectiveSeason: number;
  perPlayerByFinish: CupPrizePoolPayouts;
  history: CupPrizePoolDecisionRecord[];
}

export interface CupPrizePoolProposal {
  id: string;
  leagueId: string;
  competitionId: string;
  season: number;
  currencyCode: string;
  inflationPercent: number;
  direction: CupPrizePoolDirection;
  percentageChange: number;
  current: CupPrizePoolPayouts;
  recommended: CupPrizePoolPayouts;
}

export interface CupPrizePoolDecision {
  id: string;
  proposalId: string;
  leagueId: string;
  competitionId: string;
  season: number;
  actor: CupPrizePoolActor;
  kind: CupPrizePoolDecisionKind;
  direction: CupPrizePoolDirection;
  previous: CupPrizePoolPayouts;
  next: CupPrizePoolPayouts;
}

export interface CupPrizePoolRecap {
  leagueId: string;
  competitionId: string;
  season: number;
  currencyCode: string;
  actor: CupPrizePoolActor;
  decision: CupPrizePoolDecisionKind;
  direction: CupPrizePoolDirection;
  percentageChange: number;
  previous: CupPrizePoolPayouts;
  next: CupPrizePoolPayouts;
  changed: boolean;
}

export interface ApplyCupPrizePoolDecisionResult {
  pools: CupPrizePoolState[];
  recap: CupPrizePoolRecap | null;
  applied: boolean;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clonePayouts(payouts: CupPrizePoolPayouts): CupPrizePoolPayouts {
  return { ...payouts };
}

function payoutValues(payouts: CupPrizePoolPayouts): number[] {
  return [payouts.winner, payouts.runnerUp, payouts.semi, payouts.quarter];
}

function roundMoney(value: number): number {
  const amount = Math.max(0, value);
  const step = amount >= 100_000 ? 1_000 : amount >= 10_000 ? 500 : amount >= 1_000 ? 100 : 1;
  return Math.round(amount / step) * step;
}

function normalizePayouts(payouts: CupPrizePoolPayouts): CupPrizePoolPayouts {
  const quarter = roundMoney(payouts.quarter);
  const semi = Math.max(quarter, roundMoney(payouts.semi));
  const runnerUp = Math.max(semi, roundMoney(payouts.runnerUp));
  const winner = Math.max(runnerUp, roundMoney(payouts.winner));
  return { winner, runnerUp, semi, quarter };
}

function equalPayouts(left: CupPrizePoolPayouts, right: CupPrizePoolPayouts): boolean {
  return left.winner === right.winner
    && left.runnerUp === right.runnerUp
    && left.semi === right.semi
    && left.quarter === right.quarter;
}

function getPercentageChange(previous: CupPrizePoolPayouts, next: CupPrizePoolPayouts): number {
  const previousTotal = payoutValues(previous).reduce((sum, value) => sum + value, 0);
  const nextTotal = payoutValues(next).reduce((sum, value) => sum + value, 0);
  if (previousTotal <= 0) return nextTotal > 0 ? 100 : 0;
  return Math.round((((nextTotal / previousTotal) - 1) * 100) * 100) / 100;
}

function getDirection(previous: CupPrizePoolPayouts, next: CupPrizePoolPayouts): CupPrizePoolDirection {
  const change = getPercentageChange(previous, next);
  if (change > 0) return 'increase';
  if (change < 0) return 'decrease';
  return 'hold';
}

function scalePayouts(payouts: CupPrizePoolPayouts, multiplier: number): CupPrizePoolPayouts {
  return normalizePayouts({
    winner: payouts.winner * multiplier,
    runnerUp: payouts.runnerUp * multiplier,
    semi: payouts.semi * multiplier,
    quarter: payouts.quarter * multiplier,
  });
}

export function getCupPrizePoolKey(leagueId: string, competitionId: string): string {
  return `${encodeURIComponent(leagueId)}::${encodeURIComponent(competitionId)}`;
}

export function createCupPrizePoolState(args: {
  leagueId: string;
  competitionId: string;
  enabled: boolean;
  currencyCode: string;
  effectiveSeason: number;
  perPlayerByFinish: CupPrizePoolPayouts;
  history?: CupPrizePoolDecisionRecord[];
}): CupPrizePoolState {
  return {
    leagueId: args.leagueId,
    competitionId: args.competitionId,
    enabled: args.enabled,
    currencyCode: args.currencyCode,
    effectiveSeason: args.effectiveSeason,
    perPlayerByFinish: normalizePayouts(args.perPlayerByFinish),
    history: [...(args.history ?? [])],
  };
}

export function findCupPrizePool(
  pools: readonly CupPrizePoolState[],
  leagueId: string,
  competitionId: string,
): CupPrizePoolState | undefined {
  return pools.find(pool => pool.leagueId === leagueId && pool.competitionId === competitionId);
}

export function buildAnnualCupPrizePoolProposal(
  pool: CupPrizePoolState,
  season: number,
  inflationPercent: number,
): CupPrizePoolProposal | null {
  if (!pool.enabled) return null;

  const seed = `${pool.leagueId}|${pool.competitionId}|${season}`;
  const directionRoll = hashString(seed) % 100;
  const magnitudeRoll = hashString(`${seed}|magnitude`) % 201;
  const extraPercent = 0.5 + (magnitudeRoll / 100);
  let direction: CupPrizePoolDirection;
  let percentageChange: number;

  if (directionRoll < 80) {
    direction = 'increase';
    percentageChange = Math.max(0.5, Math.min(20, inflationPercent + extraPercent));
  } else if (directionRoll < 95) {
    direction = 'hold';
    percentageChange = 0;
  } else {
    direction = 'decrease';
    percentageChange = -(0.5 + ((magnitudeRoll % 151) / 100));
  }

  const current = normalizePayouts(pool.perPlayerByFinish);
  const recommended = direction === 'hold'
    ? clonePayouts(current)
    : scalePayouts(current, 1 + (percentageChange / 100));
  const actualDirection = getDirection(current, recommended);
  const actualPercentageChange = getPercentageChange(current, recommended);

  return {
    id: `cup-prize:${getCupPrizePoolKey(pool.leagueId, pool.competitionId)}:${season}`,
    leagueId: pool.leagueId,
    competitionId: pool.competitionId,
    season,
    currencyCode: pool.currencyCode,
    inflationPercent,
    direction: actualDirection,
    percentageChange: actualPercentageChange,
    current,
    recommended,
  };
}

export function createCupPrizePoolDecision(args: {
  proposal: CupPrizePoolProposal;
  actor: CupPrizePoolActor;
  kind: CupPrizePoolDecisionKind;
  customPayouts?: CupPrizePoolPayouts;
}): CupPrizePoolDecision {
  const { proposal, actor, kind } = args;
  const next = kind === 'accept-recommendation'
    ? proposal.recommended
    : kind === 'hold-current'
      ? proposal.current
      : normalizePayouts(args.customPayouts ?? proposal.current);
  const direction = getDirection(proposal.current, next);

  return {
    id: `${proposal.id}:${actor}:${kind}`,
    proposalId: proposal.id,
    leagueId: proposal.leagueId,
    competitionId: proposal.competitionId,
    season: proposal.season,
    actor,
    kind,
    direction,
    previous: clonePayouts(proposal.current),
    next: clonePayouts(next),
  };
}

export function createAICupPrizePoolDecision(proposal: CupPrizePoolProposal): CupPrizePoolDecision {
  const roll = hashString(`${proposal.id}|ai`) % 100;
  const acceptThreshold = proposal.direction === 'increase' ? 85 : proposal.direction === 'hold' ? 100 : 55;
  return createCupPrizePoolDecision({
    proposal,
    actor: 'ai',
    kind: roll < acceptThreshold ? 'accept-recommendation' : 'hold-current',
  });
}

export function applyCupPrizePoolDecision(
  pools: readonly CupPrizePoolState[],
  decision: CupPrizePoolDecision,
): ApplyCupPrizePoolDecisionResult {
  const target = findCupPrizePool(pools, decision.leagueId, decision.competitionId);
  if (!target?.enabled || target.history.some(entry => (
    entry.id === decision.id
    || entry.proposalId === decision.proposalId
    || entry.season === decision.season
  ))) {
    return { pools: [...pools], recap: null, applied: false };
  }

  const nextPayouts = normalizePayouts(decision.next);
  const recap: CupPrizePoolRecap = {
    leagueId: target.leagueId,
    competitionId: target.competitionId,
    season: decision.season,
    currencyCode: target.currencyCode,
    actor: decision.actor,
    decision: decision.kind,
    direction: getDirection(target.perPlayerByFinish, nextPayouts),
    percentageChange: getPercentageChange(target.perPlayerByFinish, nextPayouts),
    previous: clonePayouts(target.perPlayerByFinish),
    next: clonePayouts(nextPayouts),
    changed: !equalPayouts(target.perPlayerByFinish, nextPayouts),
  };
  const record: CupPrizePoolDecisionRecord = {
    id: decision.id,
    proposalId: decision.proposalId,
    season: decision.season,
    actor: decision.actor,
    kind: decision.kind,
    direction: recap.direction,
    previous: recap.previous,
    next: recap.next,
  };

  return {
    pools: pools.map(pool => pool.leagueId === decision.leagueId && pool.competitionId === decision.competitionId
      ? {
          ...pool,
          effectiveSeason: decision.season,
          perPlayerByFinish: nextPayouts,
          history: [...pool.history, record],
        }
      : pool),
    recap,
    applied: true,
  };
}
