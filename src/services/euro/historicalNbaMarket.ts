import type { GameState, NBAPlayer } from '../../types';
import { historicalEndesaIdentityKey } from '../historicalEndesa/identity';
import { TRANSFER_MARKET_LEAGUES } from '../transfer/marketEligibility';
import { buildNativeHistoricalPlayerByName, ensureBiosLoaded, ensureNativeHistoricalStatsLoaded } from '../../data/realPlayerDataFetcher';

export async function loadHistoricalNbaMarketPlayers(nbaPlayers: NBAPlayer[], startDate: string): Promise<NBAPlayer[]> {
  // ponytail: only 2019 has a bundled movement snapshot here; add dated snapshots before expanding coverage.
  if (!/^2019-\d{2}-\d{2}$/.test(startDate)) return nbaPlayers;
  const response = await fetch('/data/historical/nba/nba-player-movement-2019.json');
  if (!response.ok) throw new Error(`Historical NBA movement source unavailable (${response.status})`);
  const source = await response.json() as { transactions: Array<{ playerId: number; playerSlug: string; transactionDate: string; transactionType: string }> };
  const latest = new Map<number, typeof source.transactions[number]>();
  for (const row of source.transactions) {
    if (row.transactionDate.slice(0, 10) >= startDate) continue;
    const previous = latest.get(row.playerId);
    if (!previous || row.transactionDate > previous.transactionDate) latest.set(row.playerId, row);
  }
  await Promise.all([ensureBiosLoaded(), ensureNativeHistoricalStatsLoaded()]);
  const entrants = [...latest.values()].flatMap(row => {
    if (row.transactionType !== 'Waive') return [];
    const player = buildNativeHistoricalPlayerByName(row.playerSlug.replaceAll('-', ' '), { branchCutoffYear: 2020 });
    if (!player || !player.ratings?.length || player.diedYear || Number(player.draft?.year) > 2019) return [];
    return [{
      ...player,
      tid: -1,
      status: 'Free Agent' as const,
      stats: player.stats?.filter(stat => stat.season <= 2019),
      awards: player.awards?.filter(award => award.season <= 2019),
      retiredYear: undefined,
      hof: false,
      hofInductionYear: undefined,
    }];
  });
  const byIdentity = new Map(entrants.map(player => [historicalEndesaIdentityKey(player.name, player.born?.year), player]));
  const players = nbaPlayers.map(player => {
    const key = historicalEndesaIdentityKey(player.name, player.born?.year);
    if (!byIdentity.has(key)) return player;
    byIdentity.delete(key);
    return { ...player, tid: -1, status: 'Free Agent' as const };
  });
  return [...players, ...byIdentity.values()];
}

interface HistoricalNbaMarketOptions {
  completedSeasonCutoff: number;
  salaryLeagueStatus: string;
}

const rowSeason = (row: { season?: number }) => Number(row.season ?? 0);
const euroMarketStatuses = new Set(TRANSFER_MARKET_LEAGUES.map(league => league.leagueStatus));
const euroSigningImportStatuses = new Set(['G-League', 'PBA', 'B-League', 'China CBA', 'NBL Australia']);

const marketIdentityKey = (player: NBAPlayer): string => (
  player.historicalEndesaSource?.identityKey
  ?? historicalEndesaIdentityKey(player.name, player.born?.year)
);

export function isEuroFreeAgentAvailable(state: GameState, player: NBAPlayer): boolean {
  if (player.tid !== -1 || player.status !== 'Free Agent') return false;
  const hasEuroMarketProvenance = euroMarketStatuses.has(String(player.euroMarketSalaryStatus ?? ''))
    || euroSigningImportStatuses.has(String(player.euroMarketSalaryStatus ?? ''))
    || player.euroMarketOrigin?.source === 'historical-nba'
    || player.historicalEndesaSource != null
    || player.euroGeneratedYouth === true;
  if (!hasEuroMarketProvenance) return false;
  const identityKey = marketIdentityKey(player);
  const sameIdentity = (other: NBAPlayer) => (
    other.internalId === player.internalId || marketIdentityKey(other) === identityKey
  );
  if (state.players.some(other => other !== player && other.tid >= 0 && sameIdentity(other))) return false;
  if ((state.euroScouting?.academyPlayers ?? []).some(other => sameIdentity(other))) return false;
  if ((state.historicalEndesa?.draftDepartures ?? []).some(other => marketIdentityKey(other) === identityKey)) return false;
  if ((state.transferListings ?? []).some(listing => listing.status === 'active' && listing.playerId === player.internalId)) return false;
  return true;
}

export function buildHistoricalNbaEuroMarket(
  nbaPlayers: NBAPlayer[],
  euroPlayers: NBAPlayer[],
  options: HistoricalNbaMarketOptions,
): NBAPlayer[] {
  const currentSeason = options.completedSeasonCutoff + 1;
  const occupiedIdentities = new Set(euroPlayers.map(player => historicalEndesaIdentityKey(player.name, player.born?.year)));
  const occupiedIds = new Set(euroPlayers.map(player => player.internalId));
  const entrants = new Map<string, NBAPlayer>();

  for (const sourcePlayer of nbaPlayers) {
    if (sourcePlayer.tid !== -1 || sourcePlayer.status !== 'Free Agent') continue;
    if (Number(sourcePlayer.draft?.year ?? options.completedSeasonCutoff) > options.completedSeasonCutoff) continue;
    const identityKey = historicalEndesaIdentityKey(sourcePlayer.name, sourcePlayer.born?.year);
    if (occupiedIdentities.has(identityKey) || occupiedIds.has(sourcePlayer.internalId)) continue;

    const ratings = (sourcePlayer.ratings ?? []).filter(row => rowSeason(row) <= currentSeason);
    const currentRating = ratings.at(-1) ?? sourcePlayer.ratings?.at(-1);
    if (!currentRating) continue;
    const player = {
      ...sourcePlayer,
      tid: -1,
      status: 'Free Agent' as const,
      overallRating: Number(currentRating.ovr ?? sourcePlayer.overallRating),
      potential: Number(currentRating.pot ?? sourcePlayer.potential ?? currentRating.ovr ?? sourcePlayer.overallRating),
      ratings: ratings.length > 0 ? ratings : [currentRating],
      stats: sourcePlayer.stats?.filter(row => rowSeason(row) <= options.completedSeasonCutoff),
      awards: sourcePlayer.awards?.filter(row => rowSeason(row) <= options.completedSeasonCutoff),
      transactions: sourcePlayer.transactions?.filter(row => rowSeason(row) <= options.completedSeasonCutoff),
      contract: undefined,
      contractYears: undefined,
      signedDate: undefined,
      tradeEligibleDate: undefined,
      hasBirdRights: false,
      superMaxEligible: false,
      hof: false,
      hofInductionYear: undefined,
      scheduledHofInductionYear: undefined,
      retiredYear: undefined,
      euroMarketSalaryStatus: options.salaryLeagueStatus,
      euroMarketOrigin: {
        source: 'historical-nba' as const,
        completedSeasonCutoff: options.completedSeasonCutoff,
      },
      injury: sourcePlayer.injury ?? { type: 'Healthy', gamesRemaining: 0 },
    } as NBAPlayer;

    const existing = entrants.get(identityKey);
    const score = (player.stats?.length ?? 0) + (player.ratings?.length ?? 0) + (player.awards?.length ?? 0);
    const existingScore = (existing?.stats?.length ?? 0) + (existing?.ratings?.length ?? 0) + (existing?.awards?.length ?? 0);
    if (!existing || score > existingScore) entrants.set(identityKey, player);
  }

  return [...entrants.values()];
}
