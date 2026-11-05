import type { GameState } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import { isExternalLeaguePlayer } from '../../utils/playerLeagueScope';
import { getTeamFullName } from '../../utils/teamNames';
import { isOnRoster, resolveAnyTeam } from '../../utils/teamLookup';
import { buildOwnerCoachChatContacts } from '../staff/historicalChatContacts';

export interface ManagedChatContact {
  id: string;
  name: string;
  role: string;
  org: string;
  league: 'Players' | 'Owner' | 'Coach' | 'Staff';
  avatarUrl?: string;
  ovr: number;
  teamId?: number;
  teamLogoUrl?: string;
}

export function buildManagedClubChatContacts(state: GameState): ManagedChatContact[] {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
  const team = resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams);
  const org = team ? getTeamFullName(team) : 'Your Club';
  const teamLogoUrl = team ? (team as any).logoUrl ?? (team as any).imgURL ?? (team as any).imgURLSmall : undefined;
  const fictional = state.leagueType === 'fictional';
  const managedExternalLeague = state.nonNBATeams.find(candidate => candidate.tid === state.userTeamId)?.league;
  const players: ManagedChatContact[] = state.players
    .filter(player => (
      !player.diedYear
      && player.tid === state.userTeamId
      && (
        isOnRoster(player)
        || (
          managedExternalLeague
          && String(player.status ?? '').trim().toLowerCase() === managedExternalLeague.trim().toLowerCase()
        )
      )
      && (!fictional || !isExternalLeaguePlayer(player))
    ))
    .map(player => ({
      id: player.internalId,
      name: player.name,
      role: `Player • ${org}`,
      org,
      league: 'Players',
      avatarUrl: player.imgURL,
      ovr: Math.round(convertTo2KRating(
        player.overallRating || 0,
        player.ratings?.[player.ratings.length - 1]?.hgt ?? 50,
        player.ratings?.[player.ratings.length - 1]?.tp,
      )),
      teamId: player.tid,
      teamLogoUrl,
    }));
  const staff = buildOwnerCoachChatContacts(state).map(contact => ({ ...contact, ovr: 0 }));
  return [
    ...players.sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name)),
    ...staff.sort((a, b) => a.org.localeCompare(b.org) || a.name.localeCompare(b.name)),
  ];
}
