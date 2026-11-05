import type { Contact, GameState } from '../types';
import { isOnRoster, resolveAnyTeam } from '../utils/teamLookup';
import { resolveHeadCoachMember } from './staff/coachNameResolver';
import { getActiveTeamStaffMembers } from './staff/activeStaffContracts';

export type TeamActivityType = 'dinner' | 'movie';

export type ManagedTeamActivityParticipants = {
  contacts: Contact[];
  playerCount: number;
  staffCount: number;
};

const normalizeIdentity = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function resolveManagedTeamActivityParticipants(
  state: GameState,
  managedTeamId: number,
  requestedContacts: Contact[],
): ManagedTeamActivityParticipants {
  if (state.gameMode !== 'gm' || state.userTeamId !== managedTeamId) {
    return { contacts: [], playerCount: 0, staffCount: 0 };
  }

  const team = resolveAnyTeam(managedTeamId, state.teams, state.nonNBATeams ?? []);
  if (!team) return { contacts: [], playerCount: 0, staffCount: 0 };

  const playerIds = new Set(
    state.players
      .filter(player => player.tid === managedTeamId && isOnRoster(player))
      .map(player => String(player.internalId)),
  );
  const resolvedHeadCoach = resolveHeadCoachMember(team as any, state.staff);
  const directoryStaff = resolvedHeadCoach ? [resolvedHeadCoach] : [];
  const clubStaff = getActiveTeamStaffMembers(team as any, state.leagueStats?.year);
  const staffIds = new Set(
    [...directoryStaff, ...clubStaff]
      .map(member => normalizeIdentity(member.id))
      .filter(Boolean),
  );
  const staffNames = new Set(
    [...directoryStaff, ...clubStaff]
      .map(member => normalizeIdentity(member.name))
      .filter(Boolean),
  );

  const contacts: Contact[] = [];
  const seen = new Set<string>();
  let playerCount = 0;
  let staffCount = 0;
  for (const contact of requestedContacts) {
    const contactId = String(contact.id ?? '');
    const normalizedId = normalizeIdentity(contactId);
    const normalizedName = normalizeIdentity(contact.name);
    const isPlayer = contact.type === 'player' && playerIds.has(contactId);
    const isStaff = contact.type !== 'player'
      && contact.type !== 'owner'
      && contact.type !== 'gm'
      && (staffIds.has(normalizedId) || staffNames.has(normalizedName));
    if (!isPlayer && !isStaff) continue;
    const key = `${isPlayer ? 'player' : 'staff'}:${normalizedId || normalizedName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push(contact);
    if (isPlayer) playerCount += 1;
    else staffCount += 1;
  }

  return { contacts, playerCount, staffCount };
}

export function getTeamActivityChemistryGain(playerCount: number): number {
  return Math.min(1, Math.max(0, Math.floor(playerCount)) * 0.1);
}

export function getTeamActivityCostMillion(type: TeamActivityType, playerCount: number): number {
  const guests = Math.max(1, Math.floor(playerCount));
  const cost = type === 'dinner'
    ? 0.025 + guests * 0.0025
    : 0.008 + guests * 0.0005;
  return Math.ceil(cost * 100) / 100;
}

export function formatTeamActivityCost(type: TeamActivityType, playerCount: number): string {
  return `$${Math.round(getTeamActivityCostMillion(type, playerCount) * 1_000_000).toLocaleString()}`;
}
