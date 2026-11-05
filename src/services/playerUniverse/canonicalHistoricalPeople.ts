import type { GameState, NBAPlayer } from '../../types';
import {
  buildNativeHistoricalPlayersThroughSeason,
  ensureBiosLoaded,
  ensureFullRosterPlayerDataLoaded,
  ensureNativeHistoricalStatsLoaded,
  ensurePortraitLookupsLoaded,
  getNativeHistoricalRatingsForIdentity,
} from '../../data/realPlayerDataFetcher';
import {
  createCanonicalPlayerIdentityIndex,
  resolveCanonicalPersonId,
  withCanonicalPersonIdentity,
} from '../../utils/playerIdentity';
import { getBackgroundGeneratedPlayers } from '../backgroundUniverse/backgroundUniverseSelectors';

export const CANONICAL_HISTORICAL_PEOPLE_VERSION = 1;

const throughSeason = (player: NBAPlayer, cutoff: number): NBAPlayer => {
  const ratings = getNativeHistoricalRatingsForIdentity(player, cutoff);
  const latestRating = ratings[ratings.length - 1];
  return withCanonicalPersonIdentity({
    ...player,
    internalId: `historical-person-${String(player.slug ?? player.srID ?? player.internalId)}`,
    stats: (player.stats ?? []).filter(row => Number(row.season ?? 0) <= cutoff),
    ratings,
    salaries: (player.salaries ?? []).filter(row => Number(row.season ?? 0) <= cutoff),
    awards: (player.awards ?? []).filter(row => Number(row.season ?? 0) <= cutoff),
    transactions: (player.transactions ?? []).filter(row => Number(row.season ?? 0) <= cutoff),
    draft: Number(player.draft?.year ?? 0) <= cutoff ? player.draft : undefined,
    overallRating: Number(latestRating?.ovr ?? player.overallRating ?? 0),
    status: 'Retired',
    tid: -3,
  });
};

export async function materializeCanonicalHistoricalPeople(
  activePlayers: NBAPlayer[],
  maxCompletedSeason: number,
): Promise<NBAPlayer[]> {
  await Promise.all([
    ensureBiosLoaded(),
    ensureNativeHistoricalStatsLoaded(),
    ensureFullRosterPlayerDataLoaded(),
    ensurePortraitLookupsLoaded(),
  ]);
  const activeIndex = createCanonicalPlayerIdentityIndex(activePlayers);
  return buildNativeHistoricalPlayersThroughSeason(maxCompletedSeason)
    .map(player => throughSeason(player, maxCompletedSeason))
    .filter(player => !activeIndex.has(player));
}

export function getSaveVisiblePeople(state: GameState): NBAPlayer[] {
  const byPersonId = new Map<string, NBAPlayer>();
  for (const player of [
    ...(state.historicalPeople ?? []),
    ...getBackgroundGeneratedPlayers(state),
    ...(state.players ?? []),
  ]) {
    byPersonId.set(resolveCanonicalPersonId(player), player);
  }
  return [...byPersonId.values()];
}
