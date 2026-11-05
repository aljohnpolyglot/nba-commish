import { getAllReferees, getRefereePhoto } from '../../data/photos';
import type { GameState } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import { isExternalLeaguePlayer } from '../../utils/playerLeagueScope';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { buildOwnerCoachChatContacts } from '../staff/historicalChatContacts';
import { buildManagedClubChatContacts } from './managedChatContacts';
import {
  isContactUnlocked,
  isExternalContactLeague,
  isExternalStaffOrganization,
} from './contactAccess';

export type NewChatContactKind = 'player' | 'staff' | 'official' | 'agent';

export interface NewChatContact {
  id: string;
  name: string;
  role: string;
  org: string;
  league: string;
  kind: NewChatContactKind;
  avatarUrl?: string;
  teamLogoUrl?: string;
  teamId?: number;
  ovr: number;
}

export const INTERNATIONAL_CHAT_LEAGUES = [
  'Euroleague',
  'PBA',
  'B-League',
  'Endesa',
  'China CBA',
  'NBL Australia',
] as const;

export const STAFF_CHAT_FILTERS = ['Owner', 'GM', 'Coach', 'Staff', 'Referee'] as const;

function externalLeagueLabel(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (normalized.includes('wnba')) return 'WNBA';
  if (normalized.includes('gleague')) return 'G-League';
  if (normalized.includes('euro')) return 'Euroleague';
  if (normalized.includes('endesa')) return 'Endesa';
  if (normalized.includes('pba')) return 'PBA';
  if (normalized.includes('bleague')) return 'B-League';
  if (normalized.includes('china') || normalized === 'cba') return 'China CBA';
  if (normalized.includes('australia') || normalized === 'nbl') return 'NBL Australia';
  return null;
}

function playerContact(state: GameState, player: GameState['players'][number]): NewChatContact {
  const team = player.tid >= 0
    ? resolveAnyTeam(player.tid, state.teams, state.nonNBATeams)
    : undefined;
  const externalTeam = state.nonNBATeams.find(candidate => candidate.tid === player.tid);
  const sourceLeague = externalLeagueLabel(
    `${player.status ?? ''} ${externalTeam?.league ?? ''}`,
  );
  let league = state.leagueType === 'fictional' ? 'Active' : 'NBA';
  let roleLabel = 'Player';
  let org = team
    ? getTeamFullName(team)
    : player.tid >= 0
      ? sourceLeague ?? 'NBA'
      : 'Free Agent';

  if (player.status === 'Retired' || player.tid === -3) {
    league = 'Retired';
    roleLabel = player.hof ? 'Hall of Famer' : 'Retired Player';
    org = 'Retired';
  } else if (
    player.tid === -2
    || player.status === 'Draft Prospect'
    || player.status === 'Prospect'
  ) {
    league = 'Draft Prospect';
    roleLabel = 'Prospect';
    org = 'Draft Prospect';
  } else if (sourceLeague) {
    league = sourceLeague;
  } else if (player.tid === -1 || player.status === 'Free Agent') {
    league = 'Free Agent';
    org = 'Free Agent';
  }

  return {
    id: player.internalId,
    name: player.name,
    role: `${roleLabel} • ${org}`,
    org,
    league,
    kind: 'player',
    avatarUrl: player.imgURL,
    teamLogoUrl: team?.logoUrl,
    teamId: player.tid,
    ovr: Math.round(convertTo2KRating(
      player.overallRating || 0,
      player.ratings?.[player.ratings.length - 1]?.hgt ?? 50,
      player.ratings?.[player.ratings.length - 1]?.tp,
    )),
  };
}

function buildCommissionerContacts(state: GameState): NewChatContact[] {
  const players = state.players
    .filter(player => !player.diedYear)
    .filter(player => state.leagueType !== 'fictional' || !isExternalLeaguePlayer(player))
    .map(player => playerContact(state, player));
  const staff: NewChatContact[] = buildOwnerCoachChatContacts(state).map(contact => ({
    ...contact,
    kind: 'staff',
    ovr: 0,
  }));
  for (const gm of state.staff?.gms ?? []) {
    const team = state.teams.find(candidate =>
      getTeamFullName(candidate) === gm.team || candidate.name === gm.team
    );
    const org = team ? getTeamFullName(team) : gm.team || 'Front Office';
    staff.push({
      id: gm.id || `gm:${gm.name}`,
      name: gm.name,
      role: `GM • ${org}`,
      org,
      league: 'GM',
      kind: 'staff',
      avatarUrl: gm.playerPortraitUrl,
      teamLogoUrl: team?.logoUrl,
      teamId: team?.id,
      ovr: 0,
    });
  }
  const officials: NewChatContact[] = getAllReferees().map(referee => ({
    id: `ref-${referee.id}`,
    name: referee.name,
    role: `League Official • #${referee.id}`,
    org: 'League Officials',
    league: 'Referee',
    kind: 'official',
    avatarUrl: getRefereePhoto(referee.name) || undefined,
    ovr: 0,
  }));
  return [...players, ...staff, ...officials];
}

export function buildNewChatContacts(state: GameState): NewChatContact[] {
  const contacts: NewChatContact[] = state.gameMode === 'gm'
    ? buildManagedClubChatContacts(state).map(contact => ({
        ...contact,
        kind: contact.league === 'Players' ? 'player' : 'staff',
      }))
    : buildCommissionerContacts(state).filter(contact => {
        const external = isExternalContactLeague(contact.league)
          || (contact.kind === 'staff' && isExternalStaffOrganization(state, contact.org));
        return !external || isContactUnlocked(state, contact);
      });
  const unique = new Map<string, NewChatContact>();
  for (const contact of contacts) {
    if (!unique.has(contact.id)) unique.set(contact.id, contact);
  }
  return [...unique.values()].sort((left, right) =>
    Number(right.kind === 'player') - Number(left.kind === 'player')
    || right.ovr - left.ovr
    || left.name.localeCompare(right.name)
  );
}

export function isInternationalChatContact(contact: NewChatContact): boolean {
  return INTERNATIONAL_CHAT_LEAGUES.includes(
    contact.league as typeof INTERNATIONAL_CHAT_LEAGUES[number],
  );
}
