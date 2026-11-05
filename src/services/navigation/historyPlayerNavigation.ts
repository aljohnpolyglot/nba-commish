import type { NBAPlayer } from '../../types';
import {
  getPlayerIdentityEvidenceTokens,
  resolveCanonicalPersonId,
  resolvePlayerByCanonicalPersonId,
} from '../../utils/playerIdentity';

type HistoryPlayerEntry = Partial<NBAPlayer> & {
  pid?: string | number;
  playerId?: string | number;
  playerRef?: Partial<NBAPlayer> | null;
  playerIdentityMatch?: 'id' | 'source' | 'name';
};

const identityValue = (value: unknown) => String(value ?? '').trim();

const exactSavedPlayer = (
  players: readonly NBAPlayer[],
  values: unknown[],
): NBAPlayer | undefined => {
  const ids = new Set(values.map(identityValue).filter(Boolean));
  if (ids.size === 0) return undefined;
  return players.find(player => (
    ids.has(identityValue(player.internalId))
    || ids.has(identityValue((player as NBAPlayer & { pid?: string | number }).pid))
  ));
};

export function resolveSavedHistoryPlayer(
  players: readonly NBAPlayer[],
  rawEntry: unknown,
): NBAPlayer | undefined {
  if (!rawEntry || typeof rawEntry !== 'object') return undefined;
  const entry = rawEntry as HistoryPlayerEntry;
  if (entry.playerIdentityMatch === 'name') return undefined;

  const candidate = entry.playerRef && typeof entry.playerRef === 'object'
    ? entry.playerRef
    : entry;
  const exact = exactSavedPlayer(players, [
    entry.pid,
    entry.playerId,
    entry.internalId,
    candidate.internalId,
    (candidate as HistoryPlayerEntry).pid,
    (candidate as HistoryPlayerEntry).playerId,
  ]);
  if (exact) return exact;

  const hasStrongAlias = Boolean(candidate.personId)
    || getPlayerIdentityEvidenceTokens(candidate as NBAPlayer).length > 0;
  if (!hasStrongAlias) return undefined;
  return resolvePlayerByCanonicalPersonId(
    players,
    resolveCanonicalPersonId(candidate as NBAPlayer),
  );
}

export function getSourceOnlyHistoryPlayer(rawEntry: unknown): NBAPlayer | undefined {
  if (!rawEntry || typeof rawEntry !== 'object') return undefined;
  const entry = rawEntry as HistoryPlayerEntry;
  if (entry.playerIdentityMatch === 'name') return undefined;
  const candidate = entry.playerRef && typeof entry.playerRef === 'object'
    ? entry.playerRef
    : entry;
  return typeof candidate.internalId === 'string' && typeof candidate.name === 'string'
    ? candidate as NBAPlayer
    : undefined;
}
