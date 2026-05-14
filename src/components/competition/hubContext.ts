import { createContext } from 'react';
import type { LeagueTabId } from '../../utils/euroLeagueDefaults';

/**
 * Broadcast the active competition hub's leagueTabId so deeply-reused stat
 * views (PlayerStatsView, TeamStatsView, LeagueLeadersView, …) can sync their
 * internal `leagueTab` filter without prop-drilling.
 *
 * When `null`, the consuming view is being rendered outside any hub (NBA-mode
 * sidebar tab) and falls back to its existing `getDefaultLeagueTabId` logic.
 */
export const CompetitionHubLeagueTabContext = createContext<LeagueTabId | null>(null);
