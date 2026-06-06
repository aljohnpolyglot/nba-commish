import { NBACupState, NBACupGroup, NBACupKnockoutGame, Game, NBATeam } from '../../types';
import { seededRandom } from './seededRandom';

interface GroupEntry {
  tid: number;
  w: number; l: number;
  pf: number; pa: number; pd: number;
  gp: number;
}

function cupGroupPairKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

export function rebuildCupGroupStandingsFromSchedule(cup: NBACupState, schedule: Game[]): NBACupState {
  const groups = cup.groups.map(group => {
    const standingsByTid = new Map<number, GroupEntry>(
      group.teamIds.map(tid => [tid, { tid, w: 0, l: 0, pf: 0, pa: 0, pd: 0, gp: 0 }]),
    );

    for (const game of schedule) {
      if (!game.played || !game.isNBACup || game.nbaCupRound !== 'group' || game.nbaCupGroupId !== group.id) continue;
      const home = standingsByTid.get(game.homeTid);
      const away = standingsByTid.get(game.awayTid);
      if (!home || !away) continue;

      const homeScore = game.homeScore ?? 0;
      const awayScore = game.awayScore ?? 0;
      const homeWon = homeScore > awayScore;
      home.gp += 1;
      home.w += homeWon ? 1 : 0;
      home.l += homeWon ? 0 : 1;
      home.pf += homeScore;
      home.pa += awayScore;
      home.pd += homeScore - awayScore;

      away.gp += 1;
      away.w += homeWon ? 0 : 1;
      away.l += homeWon ? 1 : 0;
      away.pf += awayScore;
      away.pa += homeScore;
      away.pd += awayScore - homeScore;
    }

    return {
      ...group,
      standings: group.teamIds.map(tid => standingsByTid.get(tid)!),
    };
  });

  return { ...cup, groups };
}

export function isCupGroupStageScheduleComplete(cup: NBACupState, schedule: Game[]): boolean {
  return cup.groups.every(group => {
    const validTids = new Set(group.teamIds);
    const playedPairs = new Set<string>();
    for (const game of schedule) {
      if (!game.played || !game.isNBACup || game.nbaCupRound !== 'group' || game.nbaCupGroupId !== group.id) continue;
      if (!validTids.has(game.homeTid) || !validTids.has(game.awayTid)) continue;
      playedPairs.add(cupGroupPairKey(game.homeTid, game.awayTid));
    }
    return playedPairs.size >= 10;
  });
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

  // Seed 1-4: rank all conference qualifiers (3 group winners + wildcard)
  // by group-stage record and tie-breakers.
  const rankConf = (qualifiers: number[], groups: NBACupGroup[]): number[] => {
    const qualifierRecords = qualifiers.map(tid => {
      const entry = groups.flatMap(g => g.standings).find(s => s.tid === tid)!;
      return { tid, w: entry.w, pd: entry.pd, pf: entry.pf };
    });
    qualifierRecords.sort((a, b) => b.w - a.w || b.pd - a.pd || b.pf - a.pf);
    return qualifierRecords.map(r => r.tid);
  };

  const eastQualifiers = [...eastWinners, ...(eastWildcard != null ? [eastWildcard] : [])];
  const westQualifiers = [...westWinners, ...(westWildcard != null ? [westWildcard] : [])];
  const eastSeeded = rankConf(eastQualifiers, eastGroups);
  const westSeeded = rankConf(westQualifiers, westGroups);

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

  // Fill SFs from QF winners using fixed bracket positions, NOT resolution order.
  // East SF = qf[0] winner vs qf[1] winner; West SF = qf[2] vs qf[3]. Using a
  // qfDone[] filter here would mix conferences if QFs finish out of order — the
  // 2nd West QF could land in the East SF slot before the East QFs resolve,
  // stealing the slot and producing a duplicate-team Final.
  if (sf[0] && sf[0].tid1 < 0 && qf[0]?.winnerTid !== undefined && qf[1]?.winnerTid !== undefined) {
    sf[0] = { ...sf[0], tid1: qf[0].winnerTid, tid2: qf[1].winnerTid };
  }
  if (sf[1] && sf[1].tid1 < 0 && qf[2]?.winnerTid !== undefined && qf[3]?.winnerTid !== undefined) {
    sf[1] = { ...sf[1], tid1: qf[2].winnerTid, tid2: qf[3].winnerTid };
  }

  if (final && final.tid1 < 0 && sf[0]?.winnerTid !== undefined && sf[1]?.winnerTid !== undefined) {
    const fi = knockout.findIndex(k => k.round === 'Final');
    knockout[fi] = { ...final, tid1: sf[0].winnerTid, tid2: sf[1].winnerTid };
  }

  // Rebuild knockout with updated sf entries
  const sfIdxs = knockout.map((k, i) => k.round === 'SF' ? i : -1).filter(i => i >= 0);
  if (sfIdxs[0] !== undefined) knockout[sfIdxs[0]] = sf[0] ?? knockout[sfIdxs[0]];
  if (sfIdxs[1] !== undefined) knockout[sfIdxs[1]] = sf[1] ?? knockout[sfIdxs[1]];

  return { ...cup, knockout };
}
