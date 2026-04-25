import assert from 'node:assert/strict';
import type { NBAPlayer } from '../src/types';
import { getHOFTierInfo, runHOFChecks } from '../src/services/playerDevelopment/hofChecker';

function makeRetiredPlayer(overrides: Partial<NBAPlayer> = {}): NBAPlayer {
  return {
    internalId: overrides.internalId ?? 'p1',
    name: overrides.name ?? 'Test Player',
    status: 'Retired' as any,
    retiredYear: overrides.retiredYear ?? 2020,
    hof: false,
    born: overrides.born ?? { year: 1980, loc: 'Test' },
    awards: overrides.awards ?? [],
    stats: overrides.stats ?? [],
    tid: overrides.tid ?? -1,
    ...overrides,
  } as NBAPlayer;
}

function runChecks(): void {
  const firstBallot = makeRetiredPlayer({
    awards: [
      { season: 2015, type: 'Most Valuable Player' } as any,
      { season: 2016, type: 'Most Valuable Player' } as any,
      { season: 2015, type: 'All-Star' } as any,
      { season: 2016, type: 'All-Star' } as any,
      { season: 2017, type: 'All-Star' } as any,
      { season: 2018, type: 'All-Star' } as any,
      { season: 2019, type: 'All-Star' } as any,
      { season: 2020, type: 'All-Star' } as any,
      { season: 2021, type: 'All-Star' } as any,
      { season: 2022, type: 'All-Star' } as any,
    ],
    stats: [{ ws: 120, gp: 82 }] as any,
  });
  const firstTier = getHOFTierInfo(firstBallot, 50);
  assert.ok(firstTier);
  assert.equal(firstTier.tier, 'first_ballot');
  assert.equal(firstTier.eligibleYear, 2025);
  assert.equal(runHOFChecks([firstBallot], 2024, 50).newInductees.length, 0);
  assert.equal(runHOFChecks([firstBallot], 2025, 50).newInductees[0]?.firstBallot, true);

  const regular = makeRetiredPlayer({
    internalId: 'p2',
    name: 'Regular Resume',
    awards: [
      { season: 2016, type: 'All-Star' } as any,
      { season: 2017, type: 'All-Star' } as any,
      { season: 2018, type: 'All-Star' } as any,
      { season: 2019, type: 'All-Star' } as any,
    ],
    stats: [{ ws: 62, gp: 82 }] as any,
  });
  const regularTier = getHOFTierInfo(regular, 50);
  assert.ok(regularTier);
  assert.equal(regularTier.tier, 'regular');
  assert.equal(regularTier.eligibleYear, 2027);
  assert.equal(runHOFChecks([regular], 2026, 50).newInductees.length, 0);
  assert.equal(runHOFChecks([regular], 2027, 50).newInductees[0]?.tier, 'regular');

  const borderline = makeRetiredPlayer({
    internalId: 'p3',
    name: 'Borderline Resume',
    awards: Array.from({ length: 8 }, (_, i) => ({ season: 2010 + i, type: 'All-Star' })) as any,
    stats: [{ ws: 42, gp: 82 }] as any,
  });
  const borderlineTier = getHOFTierInfo(borderline, 50);
  assert.ok(borderlineTier);
  assert.equal(borderlineTier.tier, 'borderline');
  assert.equal(borderlineTier.eligibleYear, 2035);
  assert.equal(runHOFChecks([borderline], 2034, 50).newInductees.length, 0);
  assert.equal(runHOFChecks([borderline], 2035, 50).newInductees[0]?.tier, 'borderline');
}

runChecks();
console.log('hofCheckerTiming: ok');
