import type { NBAPlayer } from '../../types';
import {
  buildNativeHistoricalPlayerForIdentity,
  ensureBiosLoaded,
  ensureNativeHistoricalStatsLoaded,
  getNativeHistoricalRatingsForIdentity,
  normalizePlayerName,
} from '../../data/realPlayerDataFetcher';
import { mergePlayerCareer } from '../../utils/playerCareerMerge';
import {
  getPlayerIdentityEvidenceTokens,
  sameCanonicalPlayerIdentity,
} from '../../utils/playerIdentity';
import {
  isExternalLeaguePlayer,
  isWnbaPlayerIdentity,
} from '../../utils/playerLeagueScope';
import { hasNbaCareerFootprint } from './canonicalNbaIdentity';

export const CANONICAL_NBA_CAREER_HYDRATION_VERSION = 1;

const finitePositive = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const hasSourceToken = (player: NBAPlayer, namespace: string): boolean =>
  getPlayerIdentityEvidenceTokens(player).some(token => token.startsWith(`${namespace}:`));

export function isCompatibleExternalNbaCareerIdentity(
  player: NBAPlayer,
  reference: NBAPlayer,
): boolean {
  if (isWnbaPlayerIdentity(player) || isWnbaPlayerIdentity(reference)) return false;
  if (sameCanonicalPlayerIdentity(player, reference)) return true;
  if (!isExternalLeaguePlayer(player)) return false;
  if (!hasSourceToken(player, 'realgm') || !hasSourceToken(reference, 'bref')) return false;
  if (normalizePlayerName(player.name) !== normalizePlayerName(reference.name)) return false;

  const playerBirthYear = finitePositive(player.born?.year);
  const referenceBirthYear = finitePositive(reference.born?.year);
  if (!playerBirthYear || !referenceBirthYear || playerBirthYear !== referenceBirthYear) return false;

  const playerDraftYear = finitePositive(player.draft?.year);
  const referenceDraftYear = finitePositive(reference.draft?.year);
  if (playerDraftYear && referenceDraftYear && playerDraftYear !== referenceDraftYear) return false;

  const playerHeight = finitePositive(player.hgt);
  const referenceHeight = finitePositive(reference.hgt);
  const playerWeight = finitePositive(player.weight);
  const referenceWeight = finitePositive(reference.weight);
  const compatibleMeasurements = Boolean(
    playerHeight
    && referenceHeight
    && Math.abs(playerHeight - referenceHeight) <= 1
    && (!playerWeight || !referenceWeight || Math.abs(playerWeight - referenceWeight) <= 15),
  );
  const compatibleDraft = Boolean(playerDraftYear && referenceDraftYear);
  return compatibleMeasurements || compatibleDraft;
}

export function needsCanonicalNbaCareerHydration(player: NBAPlayer): boolean {
  if (Number(player.canonicalNbaCareerHydrationVersion ?? 0) >= CANONICAL_NBA_CAREER_HYDRATION_VERSION) {
    return false;
  }
  if (isExternalLeaguePlayer(player) && !isWnbaPlayerIdentity(player)) return true;
  const selected = Number(player.draft?.round ?? 0) > 0 && Number(player.draft?.pick ?? 0) > 0;
  const hasDraftYear = Number(player.draft?.year ?? 0) > 0;
  return hasNbaCareerFootprint(player) && hasDraftYear && !selected;
}

export async function hydrateCanonicalNbaCareers(
  players: NBAPlayer[],
  maxCompletedSeason: number,
): Promise<{ players: NBAPlayer[]; hydrated: number }> {
  if (!players.some(needsCanonicalNbaCareerHydration)) return { players, hydrated: 0 };

  await Promise.all([
    ensureBiosLoaded(),
    ensureNativeHistoricalStatsLoaded(),
  ]);

  let hydrated = 0;
  const nextPlayers = players.map(player => {
    if (!needsCanonicalNbaCareerHydration(player)) return player;
    const reference = buildNativeHistoricalPlayerForIdentity(player, {
      branchCutoffYear: maxCompletedSeason + 1,
    });
    if (!reference || !isCompatibleExternalNbaCareerIdentity(player, reference)) return player;

    const boundedReference: NBAPlayer = {
      ...reference,
      stats: (reference.stats ?? []).filter(row => Number(row.season ?? 0) <= maxCompletedSeason),
      awards: (reference.awards ?? []).filter(row => Number(row.season ?? 0) <= maxCompletedSeason),
      salaries: (reference.salaries ?? []).filter(row => Number(row.season ?? 0) <= maxCompletedSeason),
      ratings: getNativeHistoricalRatingsForIdentity(reference, maxCompletedSeason),
      draft: Number(reference.draft?.year ?? 0) <= maxCompletedSeason ? reference.draft : undefined,
      transactions: (reference.transactions ?? []).filter(row => Number(row.season ?? 0) <= maxCompletedSeason),
    };
    if (!hasNbaCareerFootprint(boundedReference)) return player;

    hydrated += 1;
    return {
      ...mergePlayerCareer(player, boundedReference),
      canonicalNbaCareerHydrationVersion: CANONICAL_NBA_CAREER_HYDRATION_VERSION,
    };
  });

  return { players: nextPlayers, hydrated };
}
