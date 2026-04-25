import { NBACupState, NBACupGroup, NBACupKnockoutGame, Game, NBATeam } from '../../types';
import { seededRandom } from './seededRandom';

interface GroupEntry {
  tid: number;
  w: number; l: number;
  pf: number; pa: number; pd: number;
  gp: number;
}

// Real-NBA tiebreaker order:
//   1. W   2. H2H   3. PD (regulation only)   4. PF (regulation only)
//   5. Prior regular-season W   6. Random coin
// NOTE on OT: the official rule excludes OT points from PD and PF. Our box
// scores currently store final score only — adding regulation-only tracking
// is tracked separately. For now PD/PF include OT, which is a known divergence.
function groupWinner(group: NBACupGroup, schedule: Game[], year: number, saveId: string, prevSeasonWins: Map<number, number>): number {
  const sorted = [...group.standings].sort((a, b) => {
    // 1. Wins
    if (b.w !== a.w) return b.w - a.w;

    // 2. H2H record between tied teams
    const tiedTids = group.standings.filter(s => s.w === a.w).map(s => s.tid);
    if (tiedTids.length === 2) {
      const h2hGame = schedule.find(g =>
        g.isNBACup && g.nbaCupGroupId === group.id &&
        ((g.homeTid === a.tid && g.awayTid === b.tid) ||
         (g.homeTid === b.tid && g.awayTid === a.tid))
      );
      if (h2hGame?.played) {
        const aWon = h2hGame.homeScore !== undefined && h2hGame.awayScore !== undefined
          ? (h2hGame.homeTid === a.tid ? h2hGame.homeScore > h2hGame.awayScore : h2hGame.awayScore > h2hGame.homeScore)
          : null;
        if (aWon === true) return -1;
        if (aWon === false) return 1;
      }
    }

    // 3. Point differential
    if (b.pd !== a.pd) return b.pd - a.pd;

    // 4. Points scored
    if (b.pf !== a.pf) return b.pf - a.pf;

    // 5. Prior regular-season wins (defaults to 0 if unknown — only matters in
    //    season 2+ when we have last-season data)
    const aPrev = prevSeasonWins.get(a.tid) ?? 0;
    const bPrev = prevSeasonWins.get(b.tid) ?? 0;
    if (bPrev !== aPrev) return bPrev - aPrev;

    // 6. Seeded coin
    const coin = seededRandom(`cup_tiebreak_${group.id}_${year}_${a.tid}_${b.tid}`);
    return coin > 0.5 ? -1 : 1;
  });

  return sorted[0].tid;
}

function bestNonWinner(
  confGroups: NBACupGroup[],
  winners: Set<number>,
  schedule: Game[],
  year: number,
  conf: 'East' | 'West',
  saveId: string,
  prevSeasonWins: Map<number, number>,
): number | null {
  const nonWinners: GroupEntry[] = confGroups.flatMap(g =>
    g.standings.filter(s => !winners.has(s.tid))
  );

  if (nonWinners.length === 0) return null;

  const sorted = [...nonWinners].sort((a, b) => {
    if (b.w !== a.w) return b.w - a.w;
    // No H2H step here — wildcard candidates from different groups likely never met.
    if (b.pd !== a.pd) return b.pd - a.pd;
    if (b.pf !== a.pf) return b.pf - a.pf;
    const aPrev = prevSeasonWins.get(a.tid) ?? 0;
    const bPrev = prevSeasonWins.get(b.tid) ?? 0;
    if (bPrev !== aPrev) return bPrev - aPrev;
    const coin = seededRandom(`cup_wildcard_${conf}_${year}_${a.tid}_${b.tid}`);
    return coin > 0.5 ? -1 : 1;
  });

  return sorted[0].tid;
}

/**
 * Called when all 60 Cup group games have been played.
 * Returns an updated NBACupState with:
 *   - wildcards populated
 *   - knockout bracket built (seeded 1-4 per conference)
 *   - status set to 'knockout'
 */
export function resolveCupGroupStage(
  cup: NBACupState,
  schedule: Game[],
  saveId: string,
  teams?: NBATeam[],
): NBACupState {
  // Build prevSeasonWins map from team.seasons[] (last completed season).
  // Falls back to empty map in season 1 — that step is then a no-op.
  const prevSeasonWins = new Map<number, number>();
  if (teams) {
    for (const t of teams) {
      const seasons = (t as any).seasons as Array<{ year: number; won: number }> | undefined;
      if (seasons && seasons.length > 0) {
        const last = seasons[seasons.length - 1];
        if (last?.won != null) prevSeasonWins.set(t.id, last.won);
      }
    }
  }

  const eastGroups = cup.groups.filter(g => g.conference === 'East');
  const westGroups = cup.groups.filter(g => g.conference === 'West');

  const eastWinners = eastGroups.map(g => groupWinner(g, schedule, cup.year, saveId, prevSeasonWins));
  const westWinners = westGroups.map(g => groupWinner(g, schedule, cup.year, saveId, prevSeasonWins));

  const eastWinnerSet = new Set(eastWinners);
  const westWinnerSet = new Set(westWinners);

  const eastWildcard = bestNonWinner(eastGroups, eastWinnerSet, schedule, cup.year, 'East', saveId, prevSeasonWins);
  const westWildcard = bestNonWinner(westGroups, westWinnerSet, schedule, cup.year, 'West', saveId, prevSeasonWins);

  // Seed 1-4: group winners ranked by group-stage record, wildcard is seed 4
  const rankConf = (winners: number[], groups: NBACupGroup[]): number[] => {
    const winnerRecords = winners.map(tid => {
      const entry = groups.flatMap(g => g.standings).find(s => s.tid === tid)!;
      return { tid, w: entry.w, pd: entry.pd, pf: entry.pf };
    });
    winnerRecords.sort((a, b) => b.w - a.w || b.pd - a.pd || b.pf - a.pf);
    return winnerRecords.map(r => r.tid);
  };

  const eastSeeded = [...rankConf(eastWinners, eastGroups), ...(eastWildcard ? [eastWildcard] : [])];
  const westSeeded = [...rankConf(westWinners, westGroups), ...(westWildcard ? [westWildcard] : [])];

  // QF: E1 vs E4, E2 vs E3, W1 vs W4, W2 vs W3
  const knockout: NBACupKnockoutGame[] = [
    { round: 'QF', seed1: 1, seed2: 4, tid1: eastSeeded[0], tid2: eastSeeded[3] ?? -1, countsTowardRecord: true },
    { round: 'QF', seed1: 2, seed2: 3, tid1: eastSeeded[1], tid2: eastSeeded[2] ?? -1, countsTowardRecord: true },
    { round: 'QF', seed1: 1, seed2: 4, tid1: westSeeded[0], tid2: westSeeded[3] ?? -1, countsTowardRecord: true },
    { round: 'QF', seed1: 2, seed2: 3, tid1: westSeeded[1], tid2: westSeeded[2] ?? -1, countsTowardRecord: true },
    // Real NBA rule: group play, QF, and SF all count toward regular-season
    // record. Only the Championship game is excluded.
    { round: 'SF', seed1: 1, seed2: 2, tid1: -1, tid2: -1, countsTowardRecord: true },
    { round: 'SF', seed1: 1, seed2: 2, tid1: -1, tid2: -1, countsTowardRecord: true },
    { round: 'Final', seed1: 1, seed2: 2, tid1: -1, tid2: -1, countsTowardRecord: false },
  ];

  return {
    ...cup,
    wildcards: { East: eastWildcard, West: westWildcard },
    knockout,
    status: 'knockout',
  };
}

/** After QFs resolve, fill in SF tid1/tid2 based on winners. */
export function advanceKnockoutBracket(cup: NBACupState): NBACupState {
  const knockout = [...cup.knockout];
  const qf = knockout.filter(k => k.round === 'QF');
  const sf = knockout.filter(k => k.round === 'SF');
  const final = knockout.find(k => k.round === 'Final');

  const qfDone = qf.filter(k => k.winnerTid !== undefined);

  // Fill SFs from QF winners (East: qf[0] winner vs qf[1] winner, West: qf[2] vs qf[3])
  if (qfDone.length >= 2 && sf[0] && sf[0].tid1 < 0) {
    sf[0] = { ...sf[0], tid1: qfDone[0].winnerTid!, tid2: qfDone[1].winnerTid! };
  }
  if (qfDone.length >= 4 && sf[1] && sf[1].tid1 < 0) {
    sf[1] = { ...sf[1], tid1: qfDone[2].winnerTid!, tid2: qfDone[3].winnerTid! };
  }

  const sfDone = sf.filter(k => k.winnerTid !== undefined);
  if (sfDone.length >= 2 && final && final.tid1 < 0) {
    const fi = knockout.findIndex(k => k.round === 'Final');
    knockout[fi] = { ...final, tid1: sfDone[0].winnerTid!, tid2: sfDone[1].winnerTid! };
  }

  // Rebuild knockout with updated sf entries
  const sfIdxs = knockout.map((k, i) => k.round === 'SF' ? i : -1).filter(i => i >= 0);
  if (sfIdxs[0] !== undefined) knockout[sfIdxs[0]] = sf[0] ?? knockout[sfIdxs[0]];
  if (sfIdxs[1] !== undefined) knockout[sfIdxs[1]] = sf[1] ?? knockout[sfIdxs[1]];

  return { ...cup, knockout };
}
