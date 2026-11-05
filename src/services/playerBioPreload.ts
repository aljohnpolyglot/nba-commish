import type { GameState, NBAGMStat, NBAPlayer, NBATeam } from '../types';
import {
  ensureBiosLoaded,
  ensureFullRosterPlayerDataLoaded,
  ensureNativeHistoricalStatsLoaded,
  ensurePortraitLookupsLoaded,
  buildNativeHistoricalPlayerForIdentity,
  getNativeHistoricalRatingsForIdentity,
} from '../data/realPlayerDataFetcher';
import {
  loadCompetitionAwardCatalog,
  type CompetitionAwardCatalog,
} from './competition/competitionAwardHistory';
import { loadEuroStatsForPlayers } from './euro/statsArchive';
import { loadPbaStatsForPlayers } from './pba/statsArchive';
import { ensureNonNBAFetched } from '../components/central/view/nonNBACache';
import { loadExternalCareerArchiveBundle } from './playerExternalCareerArchive';
import { isExternalLeaguePlayer } from '../utils/playerLeagueScope';
import { isCompatibleExternalNbaCareerIdentity } from './playerUniverse/canonicalNbaCareerHydration';

interface PlayerBioPreloadEntry {
  signature: string;
  euroMaxSeason: number;
  pbaMaxSeason: number;
  euroStats: Map<string, NBAGMStat[]>;
  pbaStats: Map<string, NBAGMStat[]>;
  competitionAwards?: CompetitionAwardCatalog;
  externalPlayers: NBAPlayer[];
  externalTeams: NBATeam[];
}

const entriesBySave = new Map<string, PlayerBioPreloadEntry>();
const pendingBySignature = new Map<string, Promise<void>>();
const latestSignatureBySave = new Map<string, string>();
const identitySignatureByPlayers = new WeakMap<GameState['players'], string>();
const EMPTY_EXTERNAL_PLAYERS: NBAPlayer[] = [];
const EMPTY_EXTERNAL_TEAMS: NBATeam[] = [];

const saveKey = (state: Pick<GameState, 'saveId'>): string => String(state.saveId || 'unsaved');
const NON_NBA_BIO_LEAGUES = [
  'PBA',
  'Euroleague',
  'Endesa',
  'B-League',
  'G-League',
  'China CBA',
  'NBL Australia',
  'WNBA',
] as const;

const statIdentity = (row: NBAGMStat): string => [
  Number(row.season ?? 0),
  row.playoffs ? 1 : 0,
  String((row as any).competitionId ?? (row as any).tag ?? (row as any).league ?? ''),
  Number(row.tid ?? -1),
  String((row as any).abbrev ?? ''),
].join(':');

const mergeStats = (base: NBAGMStat[] | undefined, extra: NBAGMStat[] | undefined): NBAGMStat[] => {
  const merged: NBAGMStat[] = [];
  const seen = new Set<string>();
  for (const row of [...(base ?? []), ...(extra ?? [])]) {
    const key = statIdentity(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged.sort((left, right) =>
    Number(left.season ?? 0) - Number(right.season ?? 0)
    || Number(Boolean(left.playoffs)) - Number(Boolean(right.playoffs)),
  );
};

export function getPlayerBioPreloadSignature(state: GameState): string {
  let identities = identitySignatureByPlayers.get(state.players);
  if (identities === undefined) {
    identities = state.players.map(player => [
      player.internalId,
      player.name,
      player.srID ?? player.slug ?? '',
    ].join(':')).join('|');
    identitySignatureByPlayers.set(state.players, identities);
  }
  const competitions = (state.activeCompetitions ?? []).map(spec => spec.id).sort().join(',');
  return [
    saveKey(state),
    state.leagueStats?.year ?? 0,
    state.leagueStats?.uiMode ?? '',
    state.leagueType ?? '',
    state.moddedLeagueBase ?? '',
    competitions,
    identities,
  ].join('::');
}

export function getPreloadedEuroStats(
  saveId: string | undefined,
  playerId: string,
  maxSeason: number,
): NBAGMStat[] | undefined {
  const entry = entriesBySave.get(String(saveId || 'unsaved'));
  return entry?.euroMaxSeason === maxSeason ? entry.euroStats.get(playerId) ?? [] : undefined;
}

export function getPreloadedPbaStats(
  saveId: string | undefined,
  playerId: string,
  maxSeason: number,
): NBAGMStat[] | undefined {
  const entry = entriesBySave.get(String(saveId || 'unsaved'));
  return entry?.pbaMaxSeason === maxSeason ? entry.pbaStats.get(playerId) ?? [] : undefined;
}

export function getPreloadedCompetitionAwards(saveId: string | undefined): CompetitionAwardCatalog | undefined {
  return entriesBySave.get(String(saveId || 'unsaved'))?.competitionAwards;
}

export function getPreloadedExternalPlayers(saveId: string | undefined): NBAPlayer[] {
  return entriesBySave.get(String(saveId || 'unsaved'))?.externalPlayers ?? EMPTY_EXTERNAL_PLAYERS;
}

export function getPreloadedExternalTeams(saveId: string | undefined): NBATeam[] {
  return entriesBySave.get(String(saveId || 'unsaved'))?.externalTeams ?? EMPTY_EXTERNAL_TEAMS;
}

export function isPlayerBioExternalCareerCandidate(player: NBAPlayer): boolean {
  return isExternalLeaguePlayer(player);
}

export function prehydratePlayerBioData(state: GameState): Promise<void> {
  const signature = getPlayerBioPreloadSignature(state);
  const key = saveKey(state);
  if (entriesBySave.get(key)?.signature === signature) return Promise.resolve();
  if (pendingBySignature.has(signature)) return pendingBySignature.get(signature)!;
  latestSignatureBySave.set(key, signature);

  const euroMode = state.leagueStats?.uiMode === 'euro_isolated';
  const pbaMode = state.leagueStats?.uiMode === 'pba_isolated';
  const fictionalMode = state.leagueType === 'fictional';
  const sourceSeason = Math.max(0, Number(
    euroMode
      ? state.euroStartSeason ?? state.leagueStats?.year
      : state.leagueStats?.year,
  ) - 1);
  const euroMaxSeason = euroMode ? sourceSeason : 0;
  const pbaMaxSeason = pbaMode || euroMode ? sourceSeason : 0;
  const competitionIds = (state.activeCompetitions ?? []).map(spec => spec.id);

  const promise = (async () => {
    const externalRoster = euroMode
      ? await import('./rosterService')
          .then(({ getRosterData }) => getRosterData(sourceSeason, 'Opening Week'))
          .catch(error => {
            console.warn('[PlayerBioPreload] NBA reference roster unavailable.', error);
            return null;
          })
      : null;
    const externalPlayers = (externalRoster?.players ?? []).map(player => ({
      ...player,
      externalArchiveOnly: true,
      externalLeagueId: 'NBA',
    } as NBAPlayer));
    const candidates = [...state.players, ...externalPlayers];
    const [euroStats, pbaStats, competitionAwards] = await Promise.all([
      euroMode
        ? loadEuroStatsForPlayers(candidates, { maxSeason: sourceSeason })
        : Promise.resolve(new Map<string, NBAGMStat[]>()),
      pbaMode || euroMode
        ? loadPbaStatsForPlayers(candidates, { maxSeason: sourceSeason })
        : Promise.resolve(new Map<string, NBAGMStat[]>()),
      euroMode
        ? loadCompetitionAwardCatalog(competitionIds).catch(() => undefined)
        : Promise.resolve(undefined),
    ]);
    if (!fictionalMode) {
      await Promise.allSettled([
        ...(euroMode || pbaMode ? NON_NBA_BIO_LEAGUES.map(ensureNonNBAFetched) : []),
        ensurePortraitLookupsLoaded(),
        ensureBiosLoaded(),
        ensureNativeHistoricalStatsLoaded(),
        ensureFullRosterPlayerDataLoaded(),
      ]);
    }
    if (latestSignatureBySave.get(key) !== signature) return;
    const hydratedExternalPlayers = externalPlayers.map(player => ({
      ...player,
      stats: mergeStats(
        mergeStats(player.stats, euroStats.get(player.internalId)),
        pbaStats.get(player.internalId),
      ),
    }));
    const archiveCandidates = state.players.filter(isPlayerBioExternalCareerCandidate);
    const nativeReferences = fictionalMode ? [] : archiveCandidates.flatMap(player => {
      const reference = buildNativeHistoricalPlayerForIdentity(player, { branchCutoffYear: sourceSeason + 1 });
      if (!reference || !isCompatibleExternalNbaCareerIdentity(player, reference)) return [];
      return [{
        ...reference,
        stats: (reference.stats ?? []).filter(stat => Number(stat.season ?? 0) <= sourceSeason),
        awards: (reference.awards ?? []).filter(award => Number(award.season ?? 0) <= sourceSeason),
        salaries: (reference.salaries ?? []).filter(row => Number(row.season ?? 0) <= sourceSeason),
        draft: Number(reference.draft?.year ?? 0) <= sourceSeason ? reference.draft : undefined,
        ratings: getNativeHistoricalRatingsForIdentity(reference, sourceSeason),
        externalArchiveOnly: true,
        externalLeagueId: 'NBA',
      } as NBAPlayer];
    });
    const externalCareerArchive = fictionalMode
      ? { players: [], teams: [] }
      : await loadExternalCareerArchiveBundle(archiveCandidates, sourceSeason);
    entriesBySave.set(key, {
      signature,
      euroMaxSeason,
      pbaMaxSeason,
      euroStats,
      pbaStats,
      competitionAwards,
      externalPlayers: [...hydratedExternalPlayers, ...nativeReferences, ...externalCareerArchive.players],
      externalTeams: [...(externalRoster?.teams ?? []), ...externalCareerArchive.teams],
    });
    while (entriesBySave.size > 3) {
      const oldest = entriesBySave.keys().next().value;
      if (oldest === undefined) break;
      entriesBySave.delete(oldest);
    }
  })().finally(() => {
    pendingBySignature.delete(signature);
  });

  pendingBySignature.set(signature, promise);
  return promise;
}
