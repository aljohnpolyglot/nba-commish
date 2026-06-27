// Season-disambiguated boxScore lookup. `gameId` is recycled per season
// (CLAUDE.md note 11), so a bare `.find(b => b.gameId === gid)` returns
// whichever entry was written first → stale cross-season data.
//
// Legacy-safe: boxScores written before the season-field landed have
// `season === undefined` — we treat those as "any season" matches so old
// saves don't break entirely.

import type { GameResult } from '../services/simulation/types';

type BoxScoreLookupResult = GameResult & Record<string, any>;
type BoxScoreLookupOptions = {
  homeTid?: number;
  awayTid?: number;
  homeTeamName?: string;
  awayTeamName?: string;
};

export function seasonFromDate(date?: string): number | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  return isNaN(d.getTime()) ? undefined : d.getFullYear();
}

function dateKey(date?: string): string | undefined {
  if (!date) return undefined;
  const iso = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(date);
  if (isNaN(d.getTime())) return undefined;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function findBoxScoreForGame(
  boxScores: GameResult[] | undefined,
  gid: number | undefined,
  date?: string,
  options?: BoxScoreLookupOptions,
): BoxScoreLookupResult | undefined {
  if (!boxScores || gid === undefined) return undefined;
  const wantSeason = seasonFromDate(date);
  const wantDate = dateKey(date);
  const normalized = (value?: string) => String(value ?? '').trim().toLowerCase();
  const matchesExpected = (box: BoxScoreLookupResult) => {
    if (options?.homeTid !== undefined && Number(box.homeTeamId) !== Number(options.homeTid)) return false;
    if (options?.awayTid !== undefined && Number(box.awayTeamId) !== Number(options.awayTid)) return false;
    if (options?.homeTeamName && box.homeTeamName && normalized(box.homeTeamName) !== normalized(options.homeTeamName)) return false;
    if (options?.awayTeamName && box.awayTeamName && normalized(box.awayTeamName) !== normalized(options.awayTeamName)) return false;
    return true;
  };
  const candidates = (boxScores as BoxScoreLookupResult[])
    .filter(b => b.gameId === gid)
    .filter(matchesExpected);
  if (wantDate !== undefined) {
    const exactDateMatch = candidates.find(b => dateKey(b.date) === wantDate);
    if (exactDateMatch) return exactDateMatch;
    if (options?.homeTeamName || options?.awayTeamName || options?.homeTid !== undefined || options?.awayTid !== undefined) {
      return undefined;
    }
    const sameSeasonMatch = candidates.find(b =>
      b.season === undefined || wantSeason === undefined || b.season === wantSeason
    );
    if (sameSeasonMatch) return sameSeasonMatch;
    return candidates.find(b => dateKey(b.date) === undefined);
  }
  return candidates.find(b =>
    b.season === undefined || wantSeason === undefined || b.season === wantSeason
  );
}
