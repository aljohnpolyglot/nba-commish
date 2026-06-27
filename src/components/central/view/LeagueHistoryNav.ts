let pendingLeagueHistorySeason: number | null = null;
export const LEAGUE_HISTORY_SEASON_DETAIL_EVENT = 'league-history-season-detail';

export function requestLeagueHistorySeasonDetail(season: number) {
  pendingLeagueHistorySeason = season;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LEAGUE_HISTORY_SEASON_DETAIL_EVENT, { detail: { season } }));
  }
}

export function consumePendingLeagueHistorySeason() {
  const next = pendingLeagueHistorySeason;
  pendingLeagueHistorySeason = null;
  return next;
}

export function peekPendingLeagueHistorySeason() {
  return pendingLeagueHistorySeason;
}
