import type { RetiredJerseyRecord } from '../../types';

type IdentityPlayer = {
  internalId?: string;
  name?: string;
  pid?: string | number;
  srID?: string;
  slug?: string;
  sourceIds?: Record<string, unknown>;
};
type JerseyIdentity = Pick<RetiredJerseyRecord, 'text' | 'pid' | 'playerId'>;

const token = (value: unknown): string => String(value ?? '').trim().toLowerCase();

function addStableIdentity(map: Map<string, IdentityPlayer>, player: IdentityPlayer, value: unknown): void {
  const key = token(value);
  if (!key || map.has(key)) return;
  map.set(key, player);
}

function buildStableIdIndex(players: readonly IdentityPlayer[]): Map<string, IdentityPlayer> {
  const index = new Map<string, IdentityPlayer>();
  for (const player of players) {
    addStableIdentity(index, player, player.internalId);
    addStableIdentity(index, player, player.srID);
    addStableIdentity(index, player, player.slug);
    const sourceIds = player.sourceIds;
    if (sourceIds) {
      Object.values(sourceIds).forEach(value => addStableIdentity(index, player, value));
    }
  }
  return index;
}

function buildPidIndex(players: readonly IdentityPlayer[]): Map<string, IdentityPlayer> {
  const index = new Map<string, IdentityPlayer>();
  for (const player of players) {
    const key = token(player.pid);
    if (!key || index.has(key)) continue;
    index.set(key, player);
  }
  return index;
}

export function createRetiredJerseyIdentityIndex(
  savePlayers: readonly IdentityPlayer[],
  nbaSourcePlayers: readonly IdentityPlayer[] = [],
) {
  const saveIds = buildStableIdIndex(savePlayers);
  const sourceIds = buildStableIdIndex(nbaSourcePlayers);
  const sourcePids = buildPidIndex(nbaSourcePlayers);
  const savePids = buildPidIndex(savePlayers);

  return {
    resolve(record: JerseyIdentity): IdentityPlayer | undefined {
      const playerId = token(record.playerId);
      if (playerId) {
        const stableMatch = saveIds.get(playerId) ?? sourceIds.get(playerId);
        if (stableMatch) return stableMatch;
      }
      const pid = token(record.pid);
      if (!pid) return undefined;
      return sourcePids.get(pid) ?? savePids.get(pid);
    },
    displayName(record: JerseyIdentity): string {
      const explicitName = String(record.text ?? '').trim();
      if (explicitName) return explicitName;
      return String(this.resolve(record)?.name ?? '').trim() || 'Unknown Player';
    },
  };
}
