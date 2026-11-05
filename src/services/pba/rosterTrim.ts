import type { GameState, NBAPlayer } from '../../types';
import { getDisplayAge, getDisplayOverall } from '../../store/playerRatingStore';
import { getTeamFullName } from '../../utils/teamNames';
import { isOnRoster } from '../../utils/teamLookup';
import { appendPlayerTransaction } from '../../utils/playerBirdRights';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { getPbaTradeTeams } from './tradeWindow';

type TrimResult = {
  players: NBAPlayer[];
  history: any[];
  trimmed: Array<{ playerId: string; playerName: string; teamId: number; teamName: string }>;
};

const isPbaImportLike = (player: NBAPlayer): boolean => {
  const meta = (player as any).pbaImportContract;
  return !!(player as any).isImport
    || !!(player as any).importConference
    || (meta?.league === 'PBA' && meta?.status !== 'released');
};

export function trimPbaOversizedRosters(
  state: Pick<GameState, 'gameMode' | 'userTeamId' | 'leagueStats' | 'teams' | 'nonNBATeams' | 'date' | 'history'>,
  players: NBAPlayer[],
): TrimResult {
  if (!isPbaIsolatedMode(state)) return { players, history: [], trimmed: [] };

  const limit = getStandardRosterLimit(state.leagueStats as any);
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const userTeamId = state.gameMode === 'gm' ? state.userTeamId ?? -999 : -999;
  const selected = new Map<string, { teamId: number; teamName: string }>();

  for (const team of getPbaTradeTeams(state as any)) {
    if (team.id === userTeamId) continue;
    const roster = players.filter(player => Number(player.tid) === team.id && isOnRoster(player));
    const excess = roster.length - limit;
    if (excess <= 0) continue;

    const teamName = getTeamFullName(team);
    const sortedLocals = roster
      .filter(player => !isPbaImportLike(player))
      .sort((left, right) => {
        const ovr = getDisplayOverall(left, currentYear) - getDisplayOverall(right, currentYear);
        if (ovr !== 0) return ovr;
        return getDisplayAge(right, currentYear) - getDisplayAge(left, currentYear);
      });
    const forcedPool = roster
      .filter(player => isPbaImportLike(player))
      .sort((left, right) => getDisplayOverall(left, currentYear) - getDisplayOverall(right, currentYear));
    const trimPool = [...sortedLocals, ...forcedPool];

    for (const player of trimPool.slice(0, excess)) {
      selected.set(player.internalId, { teamId: team.id, teamName });
    }
  }

  if (selected.size === 0) return { players, history: [], trimmed: [] };

  const trimmed: TrimResult['trimmed'] = [];
  const nextPlayers = players.map(player => {
    const info = selected.get(player.internalId);
    if (!info) return player;
    trimmed.push({
      playerId: player.internalId,
      playerName: player.name,
      teamId: info.teamId,
      teamName: info.teamName,
    });
    return {
      ...player,
      tid: -1,
      status: 'Free Agent' as const,
      waivedDate: state.date ?? undefined,
      transactions: appendPlayerTransaction(player, { season: currentYear, tid: -1, type: 'waive' }),
      ...(isPbaImportLike(player)
        ? {
            isImport: false,
            importConference: undefined,
            pbaImportContract: undefined,
          }
        : {}),
    };
  });

  const history = trimmed.map(row => ({
    text: `${row.playerName} waived by ${row.teamName}`,
    date: state.date,
    type: 'Waiver',
    playerIds: [row.playerId],
    tid: row.teamId,
    league: 'PBA',
  }));

  return { players: nextPlayers, history, trimmed };
}
