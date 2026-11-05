interface GameOutcomeLike {
  winnerId?: string | number | null;
  homeTeamId?: string | number | null;
  homeTid?: string | number | null;
  awayTeamId?: string | number | null;
  awayTid?: string | number | null;
  homeScore?: number | null;
  awayScore?: number | null;
}

export function didHomeTeamWin(game: GameOutcomeLike): boolean {
  const homeId = game.homeTeamId ?? game.homeTid;
  if (game.winnerId != null && homeId != null) {
    return String(game.winnerId) === String(homeId);
  }
  return Number(game.homeScore ?? 0) > Number(game.awayScore ?? 0);
}

export function getWinningTeamId(game: GameOutcomeLike): string | number | undefined {
  if (game.winnerId != null) return game.winnerId;
  return didHomeTeamWin(game)
    ? game.homeTeamId ?? game.homeTid ?? undefined
    : game.awayTeamId ?? game.awayTid ?? undefined;
}
