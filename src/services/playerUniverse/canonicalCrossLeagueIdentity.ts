import type { NBAPlayer } from '../../types';
import { mergePlayerCareer } from '../../utils/playerCareerMerge';
import {
  getPlayerIdentityEvidenceTokens,
  sameCanonicalPlayerIdentity,
  withCanonicalPersonIdentity,
} from '../../utils/playerIdentity';
import { hasNbaCareerFootprint } from './canonicalNbaIdentity';

export const CANONICAL_CROSS_LEAGUE_IDENTITY_VERSION = 1;

export interface CanonicalCrossLeagueIdentityResult {
  players: NBAPlayer[];
  merged: number;
  idAliases: Record<string, string>;
}

export interface CanonicalCrossLeagueIdentityOptions {
  preserveUndraftedProspectsFromYear?: number;
}

const EXTERNAL_STATUSES = new Set([
  'Euroleague',
  'EuroCup',
  'PBA',
  'B-League',
  'G-League',
  'Endesa',
  'China CBA',
  'NBL Australia',
  'France Elite',
  'Italy Serie A',
  'Germany BBL',
  'Greece A1',
  'Turkey BSL',
  'Lithuania LKL',
  'Israel BSL',
  'VTB',
  'ABA',
]);

const EXTERNAL_ID_PATTERN = /^(?:aba|bleague|china|endesa|euro|euroleague|fiba|france|gbl|gleague|israel|italy|lkl|nblaus|pba|realgm|turkey|vtb)[-_:]/i;

const isDraftProspect = (player: NBAPlayer): boolean =>
  player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';

const isWnbaPlayer = (player: NBAPlayer): boolean =>
  player.status === 'WNBA' || player.gender === 'female';

const isExternalSourcePlayer = (player: NBAPlayer): boolean =>
  EXTERNAL_STATUSES.has(String(player.status ?? ''))
  || EXTERNAL_ID_PATTERN.test(String(player.internalId ?? ''))
  || player.historicalEndesaSource != null
  || player.historicalPbaSource != null
  || player.historicalEuropeSource != null;

const careerGames = (player: NBAPlayer): number =>
  (player.stats ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.gp ?? 0)), 0);

const dataRichness = (player: NBAPlayer): number =>
  (player.stats?.length ?? 0) * 12
  + (player.ratings?.length ?? 0) * 4
  + (player.awards?.length ?? 0) * 3
  + (player.transactions?.length ?? 0) * 2
  + (player.salaries?.length ?? 0) * 2
  + (player.imgURL ? 2 : 0)
  + (player.college ? 1 : 0);

const hasCurrentSeasonEvidence = (player: NBAPlayer, currentSeasonYear: number): boolean =>
  (player.stats ?? []).some(row => Number(row.season) === currentSeasonYear)
  || (player.ratings ?? []).some(row => Number(row.season) === currentSeasonYear);

const isProtectedUndraftedProspect = (
  player: NBAPlayer,
  options?: CanonicalCrossLeagueIdentityOptions,
): boolean => {
  const floor = Number(options?.preserveUndraftedProspectsFromYear);
  const draftYear = Number(player.draft?.year ?? 0);
  return isDraftProspect(player)
    && Number.isInteger(floor)
    && draftYear >= floor
    && Number(player.draft?.round ?? 0) <= 0
    && Number(player.draft?.pick ?? 0) <= 0;
};

const canonicalPriority = (
  player: NBAPlayer,
  currentSeasonYear: number,
  options?: CanonicalCrossLeagueIdentityOptions,
): number =>
  (isProtectedUndraftedProspect(player, options) ? 2_000_000 : isDraftProspect(player) ? 0 : 1_000_000)
  + (Number(player.tid) >= 0 ? 600_000 : 0)
  + (hasCurrentSeasonEvidence(player, currentSeasonYear) ? 300_000 : 0)
  + (hasNbaCareerFootprint(player) ? 250_000 : 0)
  + (Number(player.contract?.exp ?? 0) >= currentSeasonYear ? 100_000 : 0)
  + Math.min(50_000, careerGames(player))
  + Math.min(9_999, dataRichness(player));

const sharesStableIdentityToken = (left: NBAPlayer, right: NBAPlayer): boolean => {
  const leftInternalId = identityToken(left.internalId);
  const rightInternalId = identityToken(right.internalId);
  if (leftInternalId && leftInternalId === rightInternalId) return true;
  const rightTokens = new Set([right.srID, right.slug].map(identityToken).filter(Boolean));
  return [left.srID, left.slug]
    .map(identityToken)
    .filter(Boolean)
    .some(token => rightTokens.has(token));
};

const isCrossLeagueDuplicate = (left: NBAPlayer, right: NBAPlayer): boolean => {
  if (!sameCanonicalPlayerIdentity(left, right)) return false;
  if (isWnbaPlayer(left) !== isWnbaPlayer(right)) return false;
  if (isDraftProspect(left) && isDraftProspect(right)) {
    return sharesStableIdentityToken(left, right);
  }
  if (isDraftProspect(left) || isDraftProspect(right)) return true;
  const leftExternal = isExternalSourcePlayer(left);
  const rightExternal = isExternalSourcePlayer(right);
  return leftExternal || rightExternal;
};

const identityToken = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const candidateTokens = (player: NBAPlayer): string[] => [
  player.internalId,
  ...getPlayerIdentityEvidenceTokens(player),
].map(identityToken).filter(Boolean);

function canonicalizeCrossLeaguePlayerIdentitiesPass(
  players: NBAPlayer[],
  currentSeasonYear: number,
  options?: CanonicalCrossLeagueIdentityOptions,
): CanonicalCrossLeagueIdentityResult {
  const ordered = players
    .map((player, index) => {
      const canonicalPlayer = withCanonicalPersonIdentity(player);
      return { player: canonicalPlayer, index, priority: canonicalPriority(canonicalPlayer, currentSeasonYear, options) };
    })
    .sort((left, right) => right.priority - left.priority || left.index - right.index);
  const canonical: Array<{ player: NBAPlayer; firstIndex: number; priority: number }> = [];
  const indicesByToken = new Map<string, Set<number>>();
  const idAliases: Record<string, string> = {};
  let merged = 0;

  const indexPlayer = (player: NBAPlayer, index: number) => {
    for (const token of candidateTokens(player)) {
      if (!indicesByToken.has(token)) indicesByToken.set(token, new Set());
      indicesByToken.get(token)!.add(index);
    }
  };

  for (const entry of ordered) {
    const candidateIndices = new Set<number>();
    for (const token of candidateTokens(entry.player)) {
      for (const index of indicesByToken.get(token) ?? []) candidateIndices.add(index);
    }
    const existingIndex = [...candidateIndices]
      .sort((left, right) => left - right)
      .find(index => isCrossLeagueDuplicate(canonical[index].player, entry.player)) ?? -1;
    if (existingIndex < 0) {
      canonical.push({ player: entry.player, firstIndex: entry.index, priority: entry.priority });
      indexPlayer(entry.player, canonical.length - 1);
      continue;
    }

    const existing = canonical[existingIndex];
    const existingWins = existing.priority >= entry.priority;
    const primary = existingWins ? existing.player : entry.player;
    const history = existingWins ? entry.player : existing.player;
    const removedId = String((existingWins ? entry.player : existing.player).internalId ?? '');
    const canonicalId = String(primary.internalId ?? '');
    const mergedCareer = mergePlayerCareer(primary, history);
    const mergedPlayer = withCanonicalPersonIdentity(isProtectedUndraftedProspect(primary, options)
      ? {
          ...mergedCareer,
          tid: -2,
          status: 'Draft Prospect',
          contract: primary.contract,
          contractYears: primary.contractYears,
          draft: {
            ...primary.draft,
            round: 0,
            pick: 0,
            tid: -1,
            originalTid: -1,
          },
        }
      : mergedCareer);
    canonical[existingIndex] = {
      player: mergedPlayer,
      firstIndex: Math.min(existing.firstIndex, entry.index),
      priority: Math.max(existing.priority, entry.priority),
    };
    indexPlayer(mergedPlayer, existingIndex);
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

export function canonicalizeCrossLeaguePlayerIdentities(
  players: NBAPlayer[],
  currentSeasonYear: number,
  options?: CanonicalCrossLeagueIdentityOptions,
): CanonicalCrossLeagueIdentityResult {
  let currentPlayers = players;
  let totalMerged = 0;
  const idAliases: Record<string, string> = {};

  while (true) {
    const pass = canonicalizeCrossLeaguePlayerIdentitiesPass(currentPlayers, currentSeasonYear, options);
    currentPlayers = pass.players;
    totalMerged += pass.merged;
    Object.assign(idAliases, pass.idAliases);
    if (pass.merged === 0) break;
  }

  for (const sourceId of Object.keys(idAliases)) {
    const visited = new Set<string>([sourceId]);
    let targetId = idAliases[sourceId];
    while (idAliases[targetId] && !visited.has(targetId)) {
      visited.add(targetId);
      targetId = idAliases[targetId];
    }
    idAliases[sourceId] = targetId;
  }

  return { players: currentPlayers, merged: totalMerged, idAliases };
}
