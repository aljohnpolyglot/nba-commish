import type { GameState, NBAPlayer } from '../../types';
import { selectExternalMarketPlayers } from '../externalLeague/marketPool';
import { parseGameDate } from '../../utils/dateUtils';
import { buildHistoricalPbaRosterFromSource } from './historicalSeasonBuilder';
import { PBA_HISTORICAL_CATALOG } from './historicalCatalog';
import { isPlayablePbaSeason } from './historyConfig';
import type { PbaMasterSource } from './historicalTypes';
import { canonicalizeCrossLeaguePlayerIdentities } from '../playerUniverse/canonicalCrossLeagueIdentity';
import { rewritePlayerIdAliases } from '../playerUniverse/playerIdAliases';
import { mergePlayerCareer } from '../../utils/playerCareerMerge';

const normalizeName = (value: string): string => value
  .toLowerCase()
  .replace(/\./g, '')
  .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function identityKeys(player: NBAPlayer): string[] {
  const sourceKey = player.historicalPbaSource?.identityKey;
  const birthYear = Number(player.born?.year);
  const nameBirthKey = Number.isFinite(birthYear)
    ? `${normalizeName(player.name)}|${birthYear}`
    : undefined;
  return [...new Set([sourceKey, nameBirthKey].filter((key): key is string => !!key))];
}

function isNbaClaimedPlayer(player: NBAPlayer, state: GameState): boolean {
  if (player.tid >= 0 && player.tid < 100) return true;
  if ((player.transactions ?? []).some(transaction => {
    const tid = Number(transaction.tid);
    return tid >= 0 && tid < 100;
  })) return true;
  if ((player.stats ?? []).some(stat => Number(stat.tid) >= 0 && Number(stat.tid) < 100)) return true;
  return (state.faBidding?.markets ?? []).some(market =>
    market.playerId === player.internalId && !market.resolved,
  );
}

function prepareBranchEntrant(player: NBAPlayer, state: GameState, season: number): NBAPlayer {
  const immutableCutoff = Number(state.nbaStartYear ?? season - 1);
  const draftYear = Number(player.draft?.year);
  return {
    ...player,
    tid: -1,
    status: 'Free Agent',
    contract: undefined,
    contractYears: [],
    stats: (player.stats ?? []).filter(stat => Number(stat.season) <= immutableCutoff),
    awards: (player.awards ?? []).filter(award => Number(award.season) <= immutableCutoff),
    ratings: (player.ratings ?? []).filter(rating =>
      Number(rating.season) <= immutableCutoff || Number(rating.season) === season,
    ),
    draft: player.draft
      ? {
          ...player.draft,
          ...(Number.isFinite(draftYear) && draftYear > immutableCutoff
            ? { tid: -1, originalTid: -1, round: undefined, pick: undefined }
            : {}),
        }
      : undefined,
  };
}

export function advanceNbaExternalPbaMarket(
  state: GameState,
  source: PbaMasterSource,
): GameState {
  if (state.leagueType !== 'modded' || state.moddedLeagueBase !== 'nba') return state;
  const season = Number(state.leagueStats.year);
  const tracker = state.nbaExternalPbaMarket;
  const sourceVersion = PBA_HISTORICAL_CATALOG.sourceVersion;
  if (
    tracker?.sourceVersion === sourceVersion
    && tracker.materializedSeasons.includes(season)
  ) return state;

  const materializedSeasons = [...new Set([...(tracker?.materializedSeasons ?? []), season])];
  if (!isPlayablePbaSeason(season, source)) {
    return {
      ...state,
      nbaExternalPbaMarket: {
        sourceVersion,
        materializedSeasons,
        activeSeason: tracker?.activeSeason,
      },
    };
  }

  const parsedDate = parseGameDate(state.date);
  const calendarYear = Number.isFinite(parsedDate.getTime())
    ? parsedDate.getUTCFullYear()
    : season - 1;
  const sourceRoster = buildHistoricalPbaRosterFromSource(source, season);
  const candidates = selectExternalMarketPlayers(sourceRoster.players.filter(player => {
    if (player.status === 'Retired') return false;
    const draftYear = Number(player.draft?.year);
    return !Number.isFinite(draftYear) || draftYear <= calendarYear;
  }));
  const existingByIdentity = new Map<string, NBAPlayer>();
  const existingByUniqueName = new Map<string, NBAPlayer>();
  const duplicateNames = new Set<string>();
  for (const player of state.players) {
    for (const key of identityKeys(player)) {
      const current = existingByIdentity.get(key);
      if (!current || isNbaClaimedPlayer(player, state)) existingByIdentity.set(key, player);
    }
    const name = normalizeName(player.name);
    if (existingByUniqueName.has(name)) {
      existingByUniqueName.delete(name);
      duplicateNames.add(name);
    } else if (!duplicateNames.has(name)) {
      existingByUniqueName.set(name, player);
    }
  }
  const preserved = state.players.filter(player =>
    !player.historicalPbaSource || isNbaClaimedPlayer(player, state),
  );
  const preservedIds = new Set(preserved.map(player => player.internalId));

  for (const candidate of candidates) {
    const existing = identityKeys(candidate)
      .map(key => existingByIdentity.get(key))
      .find((player): player is NBAPlayer => !!player)
      ?? (candidate.historicalPbaSource?.importTagged
        ? existingByUniqueName.get(normalizeName(candidate.name))
        : undefined);
    if (existing) {
      if (candidate.historicalPbaSource?.importTagged && !isNbaClaimedPlayer(existing, state)) {
        const index = preserved.findIndex(player => player.internalId === existing.internalId);
        if (index >= 0) {
          const entrant = prepareBranchEntrant(candidate, state, season);
          preserved[index] = mergePlayerCareer({
            ...existing,
            isImport: entrant.isImport,
            pbaLocalEligible: entrant.pbaLocalEligible,
            historicalPbaSource: entrant.historicalPbaSource,
          }, entrant);
        }
      }
      if (existing.historicalPbaSource && !preservedIds.has(existing.internalId)) {
        preserved.push(existing);
        preservedIds.add(existing.internalId);
      }
      continue;
    }
    const entrant = prepareBranchEntrant(candidate, state, season);
    preserved.push(entrant);
    preservedIds.add(entrant.internalId);
  }

  const nextState = {
    ...state,
    players: preserved,
    nbaExternalPbaMarket: {
      sourceVersion,
      materializedSeasons,
      activeSeason: season,
    },
  };
  const canonical = canonicalizeCrossLeaguePlayerIdentities(nextState.players, season);
  return rewritePlayerIdAliases(
    { ...nextState, players: canonical.players },
    canonical.idAliases,
  );
}
