import type { NBAPlayer } from '../../types';

export function resolveChatPlayerIdentity(
  players: readonly NBAPlayer[],
  participant: { id?: string; name?: string } | null | undefined,
): NBAPlayer | null {
  if (!participant) return null;
  const rawId = String(participant.id ?? '');
  const playerId = rawId.startsWith('fa-agent:') ? rawId.slice('fa-agent:'.length) : rawId;
  const byId = players.find(player => player.internalId === playerId);
  if (byId) return byId;
  if (rawId.startsWith('fa-agent:')) return null;
  const name = String(participant.name ?? '').trim().toLowerCase();
  return name
    ? players.find(player => player.name?.trim().toLowerCase() === name) ?? null
    : null;
}
