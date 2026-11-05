// Season-disambiguated boxScore lookup. `gameId` is recycled per season
// (CLAUDE.md note 11), so a bare `.find(b => b.gameId === gid)` returns
// whichever entry was written first → stale cross-season data.
//
// Legacy-safe: boxScores written before the season-field landed have
// `season === undefined` — we treat those as "any season" matches so old
// saves don't break entirely.

import type { Game } from '../types';
import type { GameResult } from '../services/simulation/types';

type BoxScoreLookupResult = GameResult & Record<string, any>;
type BoxScoreLookupOptions = {
  homeTid?: number;
  awayTid?: number;
  homeTeamName?: string;
  awayTeamName?: string;
  competitionId?: string;
  competitionPhase?: string;
  isPreseason?: boolean;
  isPlayoff?: boolean;
  isPlayIn?: boolean;
  isExhibition?: boolean;
  isAllStar?: boolean;
  isRisingStars?: boolean;
  isCelebrityGame?: boolean;
  season?: number;
};

export function seasonFromDate(date?: string): number | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  if (isNaN(d.getTime())) return undefined;
  const year = d.getUTCFullYear();
  return d.getUTCMonth() < 8 ? year : year + 1;
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
  const wantSeason = options?.season ?? seasonFromDate(date);
  const wantDate = dateKey(date);
  const normalized = (value?: string) => String(value ?? '').trim().toLowerCase();
  const normalizedCompetitionId = normalized(options?.competitionId);
  const normalizedCompetitionPhase = normalized(options?.competitionPhase);
  const hasStats = (box: BoxScoreLookupResult) =>
    (box.homeStats?.length ?? 0) > 0 || (box.awayStats?.length ?? 0) > 0;
  const matchesExpected = (box: BoxScoreLookupResult) => {
    if (options?.homeTid !== undefined && Number(box.homeTeamId) !== Number(options.homeTid)) return false;
    if (options?.awayTid !== undefined && Number(box.awayTeamId) !== Number(options.awayTid)) return false;
    if (options?.homeTeamName && box.homeTeamName && normalized(box.homeTeamName) !== normalized(options.homeTeamName)) return false;
    if (options?.awayTeamName && box.awayTeamName && normalized(box.awayTeamName) !== normalized(options.awayTeamName)) return false;
    if (normalizedCompetitionId && box.competitionId && normalized(box.competitionId) !== normalizedCompetitionId) return false;
    return true;
  };
  const score = (box: BoxScoreLookupResult): number => {
    let value = 0;
    const boxDate = dateKey(box.date);
    if (wantDate && boxDate === wantDate) value += 1000;
    if (wantSeason !== undefined) {
      if (box.season === wantSeason) value += 200;
      else if (box.season === undefined) value += 50;
      else value -= 500;
    }
    if (normalizedCompetitionId && normalized(box.competitionId) === normalizedCompetitionId) value += 80;
    if (normalizedCompetitionPhase && normalized(box.competitionPhase) === normalizedCompetitionPhase) value += 20;
    const flagScore = (key: keyof BoxScoreLookupOptions) => {
      const expected = options?.[key];
      if (typeof expected !== 'boolean') return 0;
      return Boolean((box as any)[key]) === expected ? 12 : -80;
    };
    value += flagScore('isPreseason');
    value += flagScore('isPlayoff');
    value += flagScore('isPlayIn');
    value += flagScore('isExhibition');
    value += flagScore('isAllStar');
    value += flagScore('isRisingStars');
    value += flagScore('isCelebrityGame');
    if (hasStats(box)) value += 10;
    return value;
  };
  const best = (list: BoxScoreLookupResult[]) =>
    [...list].sort((a, b) => score(b) - score(a))[0];
  const candidates = (boxScores as BoxScoreLookupResult[])
    .filter(b => b.gameId === gid)
    .filter(matchesExpected);
  if (wantDate !== undefined) {
    const exactDateMatch = best(candidates.filter(b => dateKey(b.date) === wantDate));
    if (exactDateMatch) return exactDateMatch;
    const sameSeasonMatch = best(candidates.filter(b =>
      b.season === undefined || wantSeason === undefined || b.season === wantSeason
    ));
    if (sameSeasonMatch) return sameSeasonMatch;
    if (options?.homeTeamName || options?.awayTeamName || options?.homeTid !== undefined || options?.awayTid !== undefined || options?.competitionId) {
      return undefined;
    }
    return best(candidates.filter(b => dateKey(b.date) === undefined));
  }
  return best(candidates.filter(b =>
    b.season === undefined || wantSeason === undefined || b.season === wantSeason
  ));
}

export function findBoxScoreForScheduledGame(
  boxScores: GameResult[] | undefined,
  game: Game | undefined,
): BoxScoreLookupResult | undefined {
  if (!game) return undefined;
  return findBoxScoreForGame(boxScores, game.gid, game.date, {
    homeTid: game.homeTid,
    awayTid: game.awayTid,
    competitionId: game.competitionId,
    competitionPhase: game.competitionPhase,
    isPreseason: game.isPreseason,
    isPlayoff: game.isPlayoff,
    isPlayIn: game.isPlayIn,
    isExhibition: game.isExhibition,
    isAllStar: game.isAllStar,
    isRisingStars: game.isRisingStars,
    isCelebrityGame: game.isCelebrityGame,
  });
}
