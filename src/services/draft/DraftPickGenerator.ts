/**
 * DraftPickGenerator.ts
 *
 * Generates future draft picks at season rollover.
 *
 * Called from applySeasonRollover to ensure each team always has
 * `tradableDraftPickSeasons` future pick seasons visible in their
 * tradable assets (§4d of multiseason_todo.md).
 *
 * Example: after 2026 rollover with tradableDraftPickSeasons=4,
 *   → generate Round 1 + Round 2 picks for season 2030 for all 30 teams
 *     (seasons 2027–2029 already exist from prior rollovers / roster file)
 *
 * We only ADD picks that don't exist yet — this is idempotent and safe to
 * call every rollover.
 */

import type { DraftPick, NBATeam } from '../../types';

let _dpidCounter = 900_000; // high base to avoid collisions with BBGM pick IDs

function nextDpid(): number {
  return ++_dpidCounter + Date.now() % 10_000; // collision-proof
}

/**
 * Ensure every team has R1 + R2 picks present for seasons
 *   [newCurrentYear + 1 … newCurrentYear + windowSize].
 *
 * @param existingPicks   state.draftPicks (may include traded picks)
 * @param teams           active NBA teams (tid < 100 assumed)
 * @param newCurrentYear  leagueStats.year AFTER the year increment
 * @param windowSize      leagueStats.tradableDraftPickSeasons (default 4)
 * @returns               merged DraftPick[] (existing + any newly generated)
 */
export function generateFuturePicks(
  existingPicks: DraftPick[],
  teams: NBATeam[],
  newCurrentYear: number,
  windowSize: number = 4,
): DraftPick[] {
  const nbaTids = teams.filter(t => t.tid >= 0 && t.tid < 100).map(t => t.tid);

  // Build a Set of (tid, season, round) tuples that already exist
  const existingSet = new Set<string>();
  for (const p of existingPicks) {
    existingSet.add(`${p.tid}_${p.season}_${p.round}`);
  }

  const newPicks: DraftPick[] = [];

  for (let season = newCurrentYear + 1; season <= newCurrentYear + windowSize; season++) {
    for (const tid of nbaTids) {
      for (const round of [1, 2] as const) {
        const key = `${tid}_${season}_${round}`;
        if (!existingSet.has(key)) {
          newPicks.push({
            dpid:        nextDpid(),
            tid,          // current owner = original team (untouched)
            originalTid:  tid,
            round,
            season,
          });
          existingSet.add(key); // prevent duplicates within this run
        }
      }
    }
  }

  if (newPicks.length > 0) {
    console.log(
      `[DraftPickGenerator] Generated ${newPicks.length} future picks ` +
      `(seasons ${newCurrentYear + 1}–${newCurrentYear + windowSize})`
    );
  }

  return [...existingPicks, ...newPicks];
}

/**
 * Prune picks for seasons that have already passed and were never executed.
 * Keeps picks for season >= currentYear (current draft can still happen).
 */
export function pruneExpiredPicks(
  picks: DraftPick[],
  currentYear: number,
): DraftPick[] {
  return picks.filter(p => p.season >= currentYear);
}
