import type { SocialContext } from '../types';

export function gamesToTime(games: number): string {
  if (games <= 0) return 'day-to-day';
  if (games <= 2) return 'the next two games';
  if (games <= 7) return 'approximately one week';
  if (games <= 14) return 'approximately two weeks';
  if (games <= 22) return 'approximately one month';
  if (games <= 35) return '4-to-6 weeks';
  if (games <= 55) return 'multiple months';
  return 'the remainder of the season';
}

export function teamName(ctx: SocialContext, tid: number): string {
  return ctx.teams?.find((t: any) => t.id === tid)?.name ?? 'Unknown';
}

export function otSuffix(ctx: SocialContext): string {
  if (!ctx.game?.isOT) return '';
  const count = ctx.game.otCount ?? 1;
  if (count === 1) return ' (OT)';
  return ` (${count}OT)`;
}

export function scores(ctx: SocialContext): { winner: number; loser: number; winName: string; loseName: string } {
  const g = ctx.game;
  if (!g) return { winner: 0, loser: 0, winName: '', loseName: '' };
  const homeWon = g.homeScore > g.awayScore;
  const homeName = teamName(ctx, g.homeTeamId);
  const awayName = teamName(ctx, g.awayTeamId);
  return {
    winner: homeWon ? g.homeScore : g.awayScore,
    loser: homeWon ? g.awayScore : g.homeScore,
    winName: homeWon ? homeName : awayName,
    loseName: homeWon ? awayName : homeName,
  };
}
