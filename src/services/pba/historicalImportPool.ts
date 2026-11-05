import type { NBAPlayer } from '../../types';
import { hasLegalPbaGovernorsImportHeight } from './importManager';
import { hasMeaningfulSourceText } from './sourceIdentityValues';

export const PBA_HISTORICAL_IMPORT_POOL_MINIMUM = 20;

function importIdentity(player: NBAPlayer): string | null {
  return player.historicalPbaSource?.identityKey ?? null;
}

function sourceDistance(player: NBAPlayer, season: number): number {
  const seasons = player.historicalPbaSource?.importSourceSeasons ?? [];
  if (seasons.length > 0) {
    return Math.min(...seasons.map(sourceSeason => Math.abs(sourceSeason - season)));
  }
  return Math.abs(Number(player.historicalPbaSource?.firstEligibleSeason ?? season) - season) + 100;
}

function isProtectedImport(player: NBAPlayer): boolean {
  if (Number(player.tid) >= 0) return true;
  const status = String((player as any).pbaImportContract?.status ?? '');
  return status === 'active' || status === 'reserve';
}

function isPastImportPoolAge(player: NBAPlayer, season: number): boolean {
  const birthYear = Number(player.born?.year);
  return Number.isInteger(birthYear)
    && season - birthYear >= 40;
}

function retirePastPoolImport(player: NBAPlayer): NBAPlayer {
  const sourceSeasons = player.historicalPbaSource?.importSourceSeasons ?? [];
  const lastSourceSeason = sourceSeasons.length > 0 ? Math.max(...sourceSeasons) : undefined;
  return {
    ...player,
    tid: -3,
    status: 'Retired',
    contract: undefined,
    retiredYear: player.retiredYear ?? lastSourceSeason,
    isImport: true,
    importConference: undefined,
    importTeamId: undefined,
    pbaImportContract: undefined,
    pbaLocalEligible: false,
  } as NBAPlayer;
}

function activateImport(current: NBAPlayer | undefined, refreshed: NBAPlayer): NBAPlayer {
  const currentDraftYear = Number(current?.draft?.year);
  return {
    ...current,
    ...refreshed,
    internalId: current?.internalId ?? refreshed.internalId,
    tid: -1,
    status: 'Free Agent',
    contract: undefined,
    retiredYear: undefined,
    sourceRetirement: undefined,
    retiredFromLeague: undefined,
    hofLeague: undefined,
    isImport: true,
    importConference: undefined,
    importTeamId: undefined,
    pbaImportContract: undefined,
    pbaLocalEligible: false,
    stats: current?.stats ?? refreshed.stats,
    awards: current?.awards ?? refreshed.awards,
    transactions: current?.transactions ?? refreshed.transactions,
    college: hasMeaningfulSourceText(current?.college) ? current.college : refreshed.college,
    draft: Number.isFinite(currentDraftYear) && currentDraftYear > 0 ? current?.draft : refreshed.draft,
    imgURL: current?.imgURL ?? refreshed.imgURL,
    srID: current?.srID || refreshed.srID,
    slug: current?.slug || refreshed.slug,
    pbaImportHistory: (current as any)?.pbaImportHistory,
    historicalPbaSource: {
      ...current?.historicalPbaSource,
      ...refreshed.historicalPbaSource,
    },
  } as NBAPlayer;
}

function deactivateImport(player: NBAPlayer, season: number): NBAPlayer {
  if (isProtectedImport(player)) return player;
  if (isPastImportPoolAge(player, season)) return retirePastPoolImport(player);
  return {
    ...player,
    tid: -1,
    status: 'PBA Import Reserve',
    contract: undefined,
    retiredYear: undefined,
    sourceRetirement: undefined,
    retiredFromLeague: undefined,
    hofLeague: undefined,
    isImport: true,
    importConference: undefined,
    importTeamId: undefined,
    pbaImportContract: undefined,
    pbaLocalEligible: false,
  } as NBAPlayer;
}

export function prepareHistoricalPbaImportPool(
  currentPlayers: NBAPlayer[],
  refreshedImports: NBAPlayer[],
  season: number,
  minimum = PBA_HISTORICAL_IMPORT_POOL_MINIMUM,
): NBAPlayer[] {
  const candidates = refreshedImports
    .filter(player => player.historicalPbaSource?.importTagged === true)
    .filter(player => Number(player.born?.year ?? season - 25) <= season - 19)
    .sort((left, right) =>
      sourceDistance(left, season) - sourceDistance(right, season)
      || Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0)
      || left.name.localeCompare(right.name),
    );
  const selected = new Set(
    candidates
      .filter(player => player.status === 'Free Agent')
      .map(importIdentity)
      .filter((identity): identity is string => !!identity),
  );
  for (const player of candidates) {
    if (selected.size >= minimum) break;
    const identity = importIdentity(player);
    if (identity) selected.add(identity);
  }
  let legalCount = candidates.filter(player => {
    const identity = importIdentity(player);
    return !!identity && selected.has(identity) && hasLegalPbaGovernorsImportHeight(player);
  }).length;
  for (const player of candidates) {
    if (legalCount >= minimum) break;
    const identity = importIdentity(player);
    if (!identity || selected.has(identity) || !hasLegalPbaGovernorsImportHeight(player)) continue;
    selected.add(identity);
    legalCount += 1;
  }

  const refreshedByIdentity = new Map(
    candidates
      .map(player => [importIdentity(player), player] as const)
      .filter((row): row is [string, NBAPlayer] => !!row[0]),
  );
  const existingIdentities = new Set<string>();
  const players = currentPlayers.map(player => {
    const identity = importIdentity(player);
    if (!identity || player.historicalPbaSource?.importTagged !== true) return player;
    existingIdentities.add(identity);
    if (isProtectedImport(player)) return player;
    if (isPastImportPoolAge(player, season)) return retirePastPoolImport(player);
    const refreshed = refreshedByIdentity.get(identity);
    return refreshed && selected.has(identity)
      ? activateImport(player, refreshed)
      : deactivateImport(player, season);
  });
  for (const identity of selected) {
    if (existingIdentities.has(identity)) continue;
    const refreshed = refreshedByIdentity.get(identity);
    if (refreshed) players.push(activateImport(undefined, refreshed));
  }
  return players;
}
