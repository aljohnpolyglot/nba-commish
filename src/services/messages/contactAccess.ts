import type { GameState, NBAPlayer } from '../../types';
import { resolveAnyTeam } from '../../utils/teamLookup';

const EXTERNAL_LEAGUES = new Set([
  'Euroleague',
  'PBA',
  'B-League',
  'Endesa',
  'China CBA',
  'NBL Australia',
]);

const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export function isContactUnlocked(
  state: GameState,
  contact: { id?: string; name?: string },
): boolean {
  const id = String(contact.id ?? '').trim();
  const name = normalize(contact.name);
  if (id && state.chats.some(chat => chat.participants.includes(id))) return true;
  return Object.values(state.actionAffinities ?? {}).some(record =>
    normalize(record.targetType) !== 'team'
    && (
      (id && record.targetId === id)
      || (name && normalize(record.targetName) === name)
    )
  );
}

export function isExternalContactLeague(league: unknown): boolean {
  return EXTERNAL_LEAGUES.has(String(league ?? '').trim());
}

export function isExternalPlayerContact(state: GameState, player: NBAPlayer): boolean {
  const team = player.tid >= 0
    ? resolveAnyTeam(player.tid, state.teams, state.nonNBATeams)
    : undefined;
  const league = (team as any)?.league ?? player.status;
  return isExternalContactLeague(league);
}

export function isExternalStaffOrganization(state: GameState, organization: unknown): boolean {
  const key = normalize(organization);
  if (!key) return false;
  return state.nonNBATeams.some(team => {
    const names = [team.name, team.region, team.abbrev]
      .map(normalize)
      .filter(Boolean);
    return names.some(name => key === name || key.includes(name) || name.includes(key));
  });
}
