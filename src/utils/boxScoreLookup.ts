// Season-disambiguated boxScore lookup. `gameId` is recycled per season
// (CLAUDE.md note 11), so a bare `.find(b => b.gameId === gid)` returns
// whichever entry was written first → stale cross-season data.
//
// Legacy-safe: boxScores written before the season-field landed have
// `season === undefined` — we treat those as "any season" matches so old
// saves don't break entirely.

import type { GameResult } from '../services/simulation/types';

export function seasonFromDate(date?: string): number | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  return isNaN(d.getTime()) ? undefined : d.getFullYear();
}

export function findBoxScoreForGame(
  boxScores: GameResult[] | undefined,
  gid: number | undefined,
  date?: string,
): GameResult | undefined {
  if (!boxScores || gid === undefined) return undefined;
  const wantSeason = seasonFromDate(date);
  return boxScores.find(b =>
    b.gameId === gid &&
    (b.season === undefined || wantSeason === undefined || b.season === wantSeason)
  );
}
