import type { NBAPlayer } from '../../types';
import { mergePlayerCareer } from '../../utils/playerCareerMerge';
import {
  getPlayerIdentityEvidenceTokens,
  resolveCanonicalPersonId,
  sameCanonicalPlayerIdentity,
  withCanonicalPersonIdentity,
} from '../../utils/playerIdentity';
import { hasNbaCareerFootprint } from './canonicalNbaIdentity';

export interface CanonicalDraftProspectIdentityResult {
  players: NBAPlayer[];
  merged: number;
  idAliases: Record<string, string>;
}

const isDraftProspect = (player: NBAPlayer): boolean =>
  player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';

const careerGames = (player: NBAPlayer): number =>
  (player.stats ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.gp ?? 0)), 0);

const dataRichness = (player: NBAPlayer): number =>
  (player.stats?.length ?? 0) * 12
  + (player.ratings?.length ?? 0) * 4
  + (player.awards?.length ?? 0) * 3
  + (player.transactions?.length ?? 0) * 2
  + (player.imgURL ? 2 : 0)
  + (player.college ? 1 : 0);

const isCurrentBranchDraftSelection = (player: NBAPlayer, currentSeasonYear: number): boolean =>
  player.status === 'Prospect'
  && Number(player.tid) >= 0
  && Number(player.draft?.year ?? 0) === currentSeasonYear
  && Number(player.draft?.round ?? 0) > 0
  && Number(player.draft?.pick ?? 0) > 0;

const canonicalPriority = (player: NBAPlayer, currentSeasonYear: number): number => {
  const prospect = isDraftProspect(player);
  const draftYear = Number(player.draft?.year ?? 0);
  const selected = Number(player.draft?.round ?? 0) > 0 && Number(player.draft?.pick ?? 0) > 0;
  const classDistance = prospect && draftYear > 0
    ? Math.abs(draftYear - currentSeasonYear)
    : 999;
  return (isCurrentBranchDraftSelection(player, currentSeasonYear) ? 3_000_000 : prospect ? 0 : 1_000_000)
    + (String(player.internalId).startsWith('fiba-fa:') ? 0 : 500_000)
    + (Number(player.tid) >= 0 ? 500_000 : 0)
    + (hasNbaCareerFootprint(player) ? 250_000 : 0)
    + (selected ? 100_000 : 0)
    + (prospect ? Math.max(0, 10_000 - classDistance * 100) : 0)
    + Math.min(50_000, careerGames(player))
    + Math.min(9_999, dataRichness(player));
};

const identityLookupKeys = (player: NBAPlayer): string[] => {
  const keys = new Set<string>();
  const internalId = String(player.internalId ?? '').trim().toLowerCase();
  if (internalId) keys.add(`internal:${internalId}`);
  keys.add(`canonical:${resolveCanonicalPersonId(player)}`);
  getPlayerIdentityEvidenceTokens(player).forEach(token => keys.add(`evidence:${token}`));
  return [...keys];
};

export function canonicalizeDraftProspectIdentities(
  players: NBAPlayer[],
  currentSeasonYear: number,
): CanonicalDraftProspectIdentityResult {
  const ordered = players
    .map((player, index) => {
      const canonicalPlayer = withCanonicalPersonIdentity(player);
      return { player: canonicalPlayer, index, priority: canonicalPriority(canonicalPlayer, currentSeasonYear) };
    })
    .sort((left, right) => right.priority - left.priority || left.index - right.index);
  const canonical: Array<{ player: NBAPlayer; firstIndex: number }> = [];
  const canonicalIndicesByIdentity = new Map<string, Set<number>>();
  const idAliases: Record<string, string> = {};
  let merged = 0;

  const addToIdentityIndex = (player: NBAPlayer, index: number) => {
    for (const key of identityLookupKeys(player)) {
      const indices = canonicalIndicesByIdentity.get(key) ?? new Set<number>();
      indices.add(index);
      canonicalIndicesByIdentity.set(key, indices);
    }
  };
  const removeFromIdentityIndex = (player: NBAPlayer, index: number) => {
    for (const key of identityLookupKeys(player)) {
      const indices = canonicalIndicesByIdentity.get(key);
      if (!indices) continue;
      indices.delete(index);
      if (indices.size === 0) canonicalIndicesByIdentity.delete(key);
    }
  };

  for (const entry of ordered) {
    const candidateIsProspect = isDraftProspect(entry.player);
    const possibleIndices = new Set<number>();
    for (const key of identityLookupKeys(entry.player)) {
      canonicalIndicesByIdentity.get(key)?.forEach(index => possibleIndices.add(index));
    }
    const existingIndex = [...possibleIndices]
      .sort((left, right) => left - right)
      .find(index => {
        const existing = canonical[index];
        return !!existing
          && (candidateIsProspect || isDraftProspect(existing.player))
          && sameCanonicalPlayerIdentity(existing.player, entry.player);
      }) ?? -1;
    if (existingIndex < 0) {
      const canonicalIndex = canonical.length;
      canonical.push({ player: entry.player, firstIndex: entry.index });
      addToIdentityIndex(entry.player, canonicalIndex);
      continue;
    }

    const existing = canonical[existingIndex];
    const existingId = String(existing.player.internalId ?? '');
    const candidateId = String(entry.player.internalId ?? '');
    const existingWins = canonicalPriority(existing.player, currentSeasonYear) >= entry.priority;
    const primary = existingWins ? existing.player : entry.player;
    const history = existingWins ? entry.player : existing.player;
    const primaryIndex = existingWins ? existing.firstIndex : entry.index;
    const removedId = existingWins ? candidateId : existingId;
    const canonicalId = String(primary.internalId ?? '');
    const mergedPlayer = withCanonicalPersonIdentity(mergePlayerCareer(primary, history));
    removeFromIdentityIndex(existing.player, existingIndex);
    canonical[existingIndex] = {
      player: mergedPlayer,
      firstIndex: Math.min(existing.firstIndex, primaryIndex),
    };
    addToIdentityIndex(mergedPlayer, existingIndex);
    if (removedId && canonicalId && removedId !== canonicalId) idAliases[removedId] = canonicalId;
    merged += 1;
  }

  canonical.sort((left, right) => left.firstIndex - right.firstIndex);
  return {
    players: canonical.map(entry => entry.player),
    merged,
    idAliases,
  };
}
