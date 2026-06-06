import type { Game, GameResult, NBACupState, PlayoffBracket } from '../types';
import { getOpeningNightDate } from './dateUtils';

type LeagueCalendarLike = {
  uiMode?: string | null;
};

type GameLike = Partial<GameResult> & {
  gameId?: number;
  gid?: number;
  isPreseason?: boolean;
  isPlayoff?: boolean;
  isPlayIn?: boolean;
  isAllStar?: boolean;
  isRisingStars?: boolean;
  isCelebrityGame?: boolean;
  isNBACup?: boolean;
  nbaCupRound?: 'group' | 'QF' | 'SF' | 'Final';
  excludeFromRecord?: boolean;
  competitionId?: string;
  competitionPhase?: string;
};

export interface GameClassification {
  seasonYear: number;
  isPreseason: boolean;
  isPlayoff: boolean;
  isPlayIn: boolean;
  isAllStar: boolean;
  isNBACup: boolean;
  cupRound?: 'group' | 'QF' | 'SF' | 'Final';
  isCupFinal: boolean;
  excludeFromRecord: boolean;
}

export function getGameSeasonYear(dateStr?: string, fallbackYear = new Date().getFullYear()): number {
  const d = new Date(dateStr ?? '');
  if (isNaN(d.getTime())) return fallbackYear;
  return d.getMonth() < 9 ? d.getFullYear() : d.getFullYear() + 1;
}

function samePair(game: GameLike, tid1?: number, tid2?: number): boolean {
  if (tid1 == null || tid2 == null) return false;
  return (
    (game.homeTeamId === tid1 && game.awayTeamId === tid2) ||
    (game.homeTeamId === tid2 && game.awayTeamId === tid1)
  );
}

function cupForYear(
  seasonYear: number,
  nbaCup?: NBACupState,
  nbaCupHistory?: Record<number, NBACupState>,
): NBACupState | undefined {
  if (nbaCup?.year === seasonYear) return nbaCup;
  return nbaCupHistory?.[seasonYear];
}

function inferCupRound(game: GameLike, cup?: NBACupState): GameClassification['cupRound'] {
  if (game.nbaCupRound) return game.nbaCupRound;
  const gid = game.gameId ?? game.gid;
  const ko = cup?.knockout?.find(k => k.gameId === gid);
  if (ko) return ko.round;

  const d = new Date(game.date ?? '');
  if (isNaN(d.getTime())) return undefined;
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();

  const koByPair = cup?.knockout?.find(k => samePair(game, k.tid1, k.tid2));
  if (koByPair && month === 12) {
    if (koByPair.round === 'QF' && day >= 9 && day <= 11) return 'QF';
    if (koByPair.round === 'SF' && day >= 13 && day <= 14) return 'SF';
    if (koByPair.round === 'Final' && day >= 16 && day <= 17) return 'Final';
  }

  const group = cup?.groups?.find(g =>
    g.teamIds.includes(game.homeTeamId ?? -1) && g.teamIds.includes(game.awayTeamId ?? -1)
  );
  const inGroupWindow = (month === 11 && day >= 4) || (month === 12 && day <= 3);
  return group && inGroupWindow ? 'group' : undefined;
}

function isCompetitionPostseasonPhase(phase?: string): boolean {
  return [
    'play-in',
    'qf',
    'quarterfinals',
    'sf',
    'semifinals',
    'final-four',
    'final',
    'finals',
    'bronze',
  ].includes(String(phase ?? '').toLowerCase());
}

export function classifyBoxScoreGame(
  game: GameLike,
  schedule: Game[] = [],
  playoffs?: PlayoffBracket,
  nbaCup?: NBACupState,
  nbaCupHistory?: Record<number, NBACupState>,
  fallbackYear = new Date().getFullYear(),
  leagueStats?: LeagueCalendarLike,
): GameClassification {
  const gid = game.gameId ?? game.gid;
  const sched = schedule.find(g => g.gid === gid);
  const competitionId = game.competitionId ?? sched?.competitionId;
  const competitionPhase = game.competitionPhase ?? sched?.competitionPhase;
  const isCompetitionGame = !!competitionId;
  const isCompetitionPostseason = isCompetitionGame && isCompetitionPostseasonPhase(competitionPhase);
  const seasonYear = Number(game.season) || getGameSeasonYear(game.date, fallbackYear);
  const cup = cupForYear(seasonYear, nbaCup, nbaCupHistory);
  const cupRound = inferCupRound({ ...game, nbaCupRound: game.nbaCupRound ?? sched?.nbaCupRound }, cup);

  const playoffIds = new Set(playoffs?.series?.flatMap(s => s.gameIds ?? []) ?? []);
  const playInIds = new Set(playoffs?.playInGames?.map(g => g.gameId).filter((id): id is number => id != null) ?? []);
  const gameDate = new Date(game.date ?? sched?.date ?? '');
  const validDate = !isNaN(gameDate.getTime());
  const month = validDate ? gameDate.getUTCMonth() + 1 : 0;
  const day = validDate ? gameDate.getUTCDate() : 0;
  const nbaTeams = (game.homeTeamId ?? -1) >= 0 && (game.homeTeamId ?? 1000) < 100 &&
    (game.awayTeamId ?? -1) >= 0 && (game.awayTeamId ?? 1000) < 100;
  const lateSeasonNbaGame = nbaTeams && ((month === 4 && day >= 20) || month === 5 || (month === 6 && day <= 25));

  const isAllStar = !!(sched?.isAllStar || game.isAllStar || game.isRisingStars || game.isCelebrityGame);
  const isPlayIn = !!(sched?.isPlayIn || game.isPlayIn || (gid != null && playInIds.has(gid)));
  const isPlayoff = !!(sched?.isPlayoff || game.isPlayoff || (gid != null && playoffIds.has(gid)) || isCompetitionPostseason || (!isPlayIn && lateSeasonNbaGame));
  const isNBACup = !!(sched?.isNBACup || game.isNBACup || cupRound);
  const isCupFinal = isNBACup && cupRound === 'Final';
  const excludeFromRecord = !!(sched?.excludeFromRecord || game.excludeFromRecord || isCupFinal);

  const openingNight = getOpeningNightDate(seasonYear, leagueStats, schedule).getTime();
  const gameTime = validDate ? gameDate.getTime() : 0;
  const isPreseason = !!(sched?.isPreseason || game.isPreseason) ||
    (!isCompetitionGame && !isPlayoff && !isPlayIn && !isAllStar && !isNBACup && gameTime > 0 && gameTime < openingNight);

  return { seasonYear, isPreseason, isPlayoff, isPlayIn, isAllStar, isNBACup, cupRound, isCupFinal, excludeFromRecord };
}
