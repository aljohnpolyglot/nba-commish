let pendingLeagueHistorySeason: number | null = null;

export function requestLeagueHistorySeasonDetail(season: number) {
  pendingLeagueHistorySeason = season;
}

export function consumePendingLeagueHistorySeason() {
  const next = pendingLeagueHistorySeason;
  pendingLeagueHistorySeason = null;
  return next;
}
