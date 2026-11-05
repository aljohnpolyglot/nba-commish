import type { NBAPlayer, PlayerRelative, PlayerRelativeType } from '../types';
import { isPlayerVisibleInTimeline } from './historicalTimeline';

export function isRelativeVisibleInTimeline(player: NBAPlayer, currentYear: number): boolean {
  return isPlayerVisibleInTimeline(player, currentYear);
}

export function normalizeRelativeName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function inverseRelativeType(type: string, relative?: NBAPlayer): PlayerRelativeType {
  if (type === 'father' || type === 'mother') {
    return String((relative as any)?.gender ?? '').toLowerCase() === 'female' ? 'daughter' : 'son';
  }
  if (type === 'son' || type === 'daughter') {
    return String((relative as any)?.gender ?? '').toLowerCase() === 'female' ? 'mother' : 'father';
  }
  if (type === 'twin') return 'twin';
  return String((relative as any)?.gender ?? '').toLowerCase() === 'female' ? 'sister' : 'brother';
}

export function resolveFamilyRelative(relative: PlayerRelative, players: readonly NBAPlayer[]): NBAPlayer | undefined {
  const playerId = String(relative.playerId ?? '').trim();
  if (playerId) {
    const byInternalId = players.find(player => String(player.internalId ?? '') === playerId);
    if (byInternalId) return byInternalId;
  }

  const pid = String(relative.pid ?? '').trim();
  if (pid) {
    const byPid = players.find(player => String((player as any).pid ?? '').trim() === pid);
    if (byPid) return byPid;
  }

  const name = normalizeRelativeName(relative.name);
  return name ? players.find(player => normalizeRelativeName(player.name) === name) : undefined;
}

export function isFamilyRelationVisible(
  relative: PlayerRelative,
  match: NBAPlayer | undefined,
  currentYear: number,
): boolean {
  if (Number(relative.introducedYear ?? 0) > currentYear) return false;
  return !match || isRelativeVisibleInTimeline(match, currentYear);
}

export function getFamilyOnRoster(player: NBAPlayer, roster: NBAPlayer[], currentYear?: number): NBAPlayer[] {
  const rel = player.relatives;
  if (!rel || rel.length === 0) return [];
  const familyIds = new Set(
    rel.flatMap(relative => {
      const match = resolveFamilyRelative(relative, roster);
      if (!match || match.internalId === player.internalId) return [];
      if (currentYear != null && !isFamilyRelationVisible(relative, match, currentYear)) return [];
      return [match.internalId];
    }),
  );
  return roster.filter(relative => familyIds.has(relative.internalId));
}

export function hasFamilyOnRoster(player: NBAPlayer, roster: NBAPlayer[], currentYear?: number): boolean {
  return getFamilyOnRoster(player, roster, currentYear).length > 0;
}
