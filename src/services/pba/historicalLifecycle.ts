import type { GameState, NBAPlayer, NonNBATeam } from '../../types';
import { generateDraftPicksForTeamIdsAndSeasons } from '../draft/DraftPickGenerator';
import { computeLocalPBASalaryUSD, getPBARosterEconomyConfig, type PBAEconomyConfig } from '../externalRosterService.shared';
import { PBA_STANDARD_ROSTER_LIMIT } from '../../utils/rosterLimits';
import { getLatestPlayablePbaSeason } from './historyConfig';
import { PBA_HISTORICAL_CATALOG } from './historicalCatalog';
import {
  buildHistoricalPbaSeasonTeamsFromSource,
  historicalPbaIdentityKey,
  mapHistoricalPbaPlayer,
  selectHistoricalPbaActiveRosterIdentityKeys,
} from './historicalSeasonBuilder';
import { getHistoricalPbaTeamIdentitySnapshot, type PbaMasterSource } from './historicalTypes';
import { materializeRealPbaDraftClasses } from './archiveDraftProspects';
import { getPbaBranchStartSeason } from './branchHistoryOwnership';
import { PBA_PLAYER_ECONOMY_VERSION } from './historicalEconomy';
import { prepareHistoricalPbaImportPool } from './historicalImportPool';
import { getPbaDraftPickYears } from './draftCalendar';

function withPbaEntrantContract(
  player: NBAPlayer,
  season: number,
  economy: PBAEconomyConfig,
): NBAPlayer {
  if (Number(player.contract?.pbaEconomyVersion ?? 0) === PBA_PLAYER_ECONOMY_VERSION) return player;
  const rating = Number(player.overallRating ?? player.ratings?.at(-1)?.ovr ?? 45);
  const salaryUSD = computeLocalPBASalaryUSD(rating, economy, player, season);
  const key = `${player.internalId}|${season}|contract`;
  let seed = 0;
  for (let index = 0; index < key.length; index++) seed = (Math.imul(seed, 31) + key.charCodeAt(index)) | 0;
  const baseYears = rating >= 55 ? 3 : rating >= 45 ? 2 : 1;
  const years = Math.min(4, baseYears + (Math.abs(seed) % 2));
  return {
    ...player,
    contract: {
      amount: Math.round(salaryUSD / 1_000),
      exp: season + years - 1,
      rookie: false,
      pbaEconomyVersion: PBA_PLAYER_ECONOMY_VERSION,
      pbaSalarySource: 'generated',
    },
    contractYears: Array.from({ length: years }, (_, index) => ({
      season: `${season + index - 1}-${String(season + index).slice(-2)}`,
      guaranteed: Math.round(salaryUSD * Math.pow(1.04, index)),
      option: '',
    })),
  };
}

function mergePbaTeamIdentity(current: NonNBATeam, source: NonNBATeam): NonNBATeam {
  return {
    ...current,
    cid: source.cid,
    did: source.did,
    region: source.region,
    name: source.name,
    abbrev: source.abbrev,
    pop: source.pop,
    stadiumCapacity: source.stadiumCapacity,
    imgURL: source.imgURL ?? current.imgURL,
    colors: source.colors ?? current.colors,
    league: 'PBA',
  };
}

export function advanceHistoricalPbaSeason(state: GameState, source: PbaMasterSource): GameState {
  const historical = state.historicalPba;
  const season = state.leagueStats.year;
  if (!historical || historical.materializedSeasons.includes(season)) return state;
  if (state.moddedLeagueBase !== 'philippines' || state.leagueStats.uiMode !== 'pba_isolated') return state;
  if (historical.sourceVersion !== PBA_HISTORICAL_CATALOG.sourceVersion) return state;

  if (season > getLatestPlayablePbaSeason(source)) {
    return {
      ...state,
      historicalPba: {
        ...historical,
        sourceSeason: season,
        materializedSeasons: [...historical.materializedSeasons, season],
      },
    };
  }

  const sourceTeams = buildHistoricalPbaSeasonTeamsFromSource(source, season).map(team => {
    const snapshot = getHistoricalPbaTeamIdentitySnapshot(historical, team.tid, season);
    return snapshot ? {
      ...team,
      region: snapshot.region,
      name: snapshot.name,
      abbrev: snapshot.abbrev,
      imgURL: snapshot.imgURL ?? team.imgURL,
      colors: snapshot.colors ?? team.colors,
    } : team;
  });
  const existingPbaTeamIds = new Set(
    state.nonNBATeams.filter(team => team.league === 'PBA').map(team => team.tid),
  );
  const addedTeams = sourceTeams.filter(team => !existingPbaTeamIds.has(team.tid));
  const nonNBATeams = [
    ...state.nonNBATeams.filter(team => team.league !== 'PBA'),
    ...sourceTeams.map(team => {
      const current = state.nonNBATeams.find(existing => existing.league === 'PBA' && existing.tid === team.tid);
      return current ? mergePbaTeamIdentity(current, team) : team;
    }),
  ];
  const economy = getPBARosterEconomyConfig(state.leagueStats, 'pba_isolated');
  const refreshedImports = source.players
    .map(raw => mapHistoricalPbaPlayer(raw, season, economy, source))
    .filter((player): player is NBAPlayer => player?.historicalPbaSource?.importTagged === true);
  const playersWithImportPool = prepareHistoricalPbaImportPool(
    state.players,
    refreshedImports,
    season,
  );

  const materializedKeys = new Set([
    ...(historical.materializedIdentityKeys ?? []),
    ...playersWithImportPool
      .map(player => player.historicalPbaSource?.identityKey ?? (player as any).pbaDraftSourceIdentityKey)
      .filter((key): key is string => !!key),
  ]);
  const activeRosterKeys = selectHistoricalPbaActiveRosterIdentityKeys(source, season);
  const pbaTeamIds = new Set(sourceTeams.map(team => team.tid));
  const rosterCounts = new Map<number, number>();
  for (const player of playersWithImportPool) {
    if (!pbaTeamIds.has(player.tid) || player.status === 'Retired') continue;
    rosterCounts.set(player.tid, (rosterCounts.get(player.tid) ?? 0) + 1);
  }
  const branchStartSeason = getPbaBranchStartSeason(state);
  const entrants: NBAPlayer[] = [];
  for (const raw of source.players) {
    const identityKey = historicalPbaIdentityKey(raw);
    if (materializedKeys.has(identityKey)) continue;
    const mappedPlayer = mapHistoricalPbaPlayer(raw, season, economy, source);
    const player: NBAPlayer | null = mappedPlayer ? {
      ...mappedPlayer,
      stats: (mappedPlayer.stats ?? []).filter(stat => Number(stat.season) < branchStartSeason),
      awards: (mappedPlayer.awards ?? []).filter(award => Number(award.season) < branchStartSeason),
    } as NBAPlayer : null;
    const meta = player?.historicalPbaSource;
    if (!player || !meta || meta.firstEligibleSeason !== season) continue;
    let entrant: NBAPlayer = player;
    if (meta.importTagged) {
      entrant = { ...player, tid: -1, status: 'Free Agent', contract: undefined, isImport: true, pbaLocalEligible: false };
    } else if (
      activeRosterKeys.has(identityKey)
      && meta.sourceTeamTid !== undefined
      && pbaTeamIds.has(meta.sourceTeamTid)
      && (rosterCounts.get(meta.sourceTeamTid) ?? 0) < PBA_STANDARD_ROSTER_LIMIT
    ) {
      entrant = withPbaEntrantContract(player, season, economy);
      rosterCounts.set(meta.sourceTeamTid, (rosterCounts.get(meta.sourceTeamTid) ?? 0) + 1);
    } else if (player.status !== 'Retired') {
      entrant = { ...player, tid: -1, status: 'Free Agent', contract: undefined };
    }
    entrants.push(entrant);
    materializedKeys.add(identityKey);
  }

  const draftPicks = addedTeams.length > 0
    ? generateDraftPicksForTeamIdsAndSeasons(
        state.draftPicks,
        addedTeams.map(team => team.tid),
        getPbaDraftPickYears(season, state.leagueStats.tradableDraftPickSeasons, true),
        2,
      )
    : state.draftPicks;

  const playersWithEntrants = entrants.length > 0
    ? [...playersWithImportPool, ...entrants]
    : playersWithImportPool;
  const draftMaterialization = materializeRealPbaDraftClasses(
    playersWithEntrants,
    source,
    season,
    state.leagueStats.draftEligibilityRule,
  );
  for (const player of draftMaterialization.players) {
    const identityKey = player.historicalPbaSource?.identityKey ?? (player as any).pbaDraftSourceIdentityKey;
    if (identityKey) materializedKeys.add(identityKey);
  }

  return {
    ...state,
    players: draftMaterialization.players,
    nonNBATeams,
    draftPicks,
    historicalPba: {
      ...historical,
      sourceSeason: season,
      materializedSeasons: [...historical.materializedSeasons, season],
      materializedIdentityKeys: [...materializedKeys],
    },
  };
}
