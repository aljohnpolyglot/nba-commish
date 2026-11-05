import type { GameRuleConfig } from '../../types';
import type { Possession, TeamId } from './possessionTypes';

function clockSeconds(clock: string | undefined): number {
  if (!clock) return Number.POSITIVE_INFINITY;
  const [minutes, seconds] = clock.split(':').map(Number);
  return (minutes || 0) * 60 + (seconds || 0);
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function stampTimeouts(
  possessions: Possession[],
  rules: GameRuleConfig,
  regulationPeriods: number,
  timeoutCounts?: Partial<Record<TeamId, number>>,
): void {
  const maximum = Math.max(0, Math.round(rules.maxTimeouts));
  if (maximum === 0) return;
  const clutchMaximum = Math.min(maximum, Math.max(0, Math.round(rules.clutchTimeoutLimit)));
  const selected: Array<{ possession: Possession; team: TeamId; isClutch: boolean }> = [];
  const reserved = new Set<number>();

  for (const team of ['HOME', 'AWAY'] as TeamId[]) {
    const storedCount = Number(timeoutCounts?.[team]);
    const used = Number.isFinite(storedCount)
      ? Math.max(0, Math.min(maximum, Math.round(storedCount)))
      : Math.min(
          maximum,
          Math.max(1, Math.round(maximum * (0.55 + Math.random() * 0.45))),
        );
    const clutchCandidates = shuffled(possessions.filter(possession =>
      !possession.isJumpball
      && !reserved.has(possession.id)
      && possession.quarter >= regulationPeriods
      && clockSeconds(possession.clock) <= 120,
    ));
    const desiredClutch = clutchMaximum > 0 && Math.random() < 0.8
      ? 1 + Math.floor(Math.random() * clutchMaximum)
      : 0;
    const clutchCount = Math.min(used, desiredClutch, clutchCandidates.length);
    const clutchPicks = clutchCandidates.slice(0, clutchCount);
    const clutchIds = new Set(clutchPicks.map(possession => possession.id));
    const regularCandidates = shuffled(possessions.filter(possession =>
      !possession.isJumpball
      && !reserved.has(possession.id)
      && !clutchIds.has(possession.id)
      && !possession.timeout,
    ));
    const regularPicks = regularCandidates.slice(0, Math.max(0, used - clutchCount));
    for (const possession of [...regularPicks, ...clutchPicks]) reserved.add(possession.id);
    selected.push(
      ...regularPicks.map(possession => ({ possession, team, isClutch: false })),
      ...clutchPicks.map(possession => ({ possession, team, isClutch: true })),
    );
  }

  const remaining: Record<TeamId, number> = { HOME: maximum, AWAY: maximum };
  const clutchRemaining: Record<TeamId, number> = {
    HOME: clutchMaximum,
    AWAY: clutchMaximum,
  };
  selected.sort((a, b) => (a.possession.gs ?? 0) - (b.possession.gs ?? 0));
  for (const entry of selected) {
    if (entry.possession.timeout) continue;
    remaining[entry.team] = Math.max(0, remaining[entry.team] - 1);
    if (entry.isClutch) {
      clutchRemaining[entry.team] = Math.max(0, clutchRemaining[entry.team] - 1);
    }
    entry.possession.timeout = {
      team: entry.team,
      remaining: remaining[entry.team],
      clutchRemaining: clutchRemaining[entry.team],
      isClutch: entry.isClutch,
    };
  }
}
