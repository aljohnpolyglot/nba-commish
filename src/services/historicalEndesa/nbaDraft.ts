import { ensureBiosLoaded, getBioByName } from '../../data/realPlayerDataFetcher';
import { STATIC_NBA_TEAMS } from '../../data/staticNbaTeams';
import type { GameState, NBAPlayer } from '../../types';
import { getDisplayOverall } from '../../utils/playerRatings';
import { calculateInternationalDraftValue, projectInternationalDraftSelection, shouldDeclareForInternationalDraft } from '../draft/internationalDraftValue';
import { ENDESA_HISTORICAL_CATALOG } from './catalog';
import type { HistoricalEndesaDraftOutcome } from './types';

const hashUnit = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

const draftCalendarYear = (state: GameState): number => state.leagueStats.year - 1;

const matchingNbaBio = (player: NBAPlayer) => {
  const bio = getBioByName(player.name);
  const playerBirthYear = Number(player.born?.year ?? 0);
  const bioBirthYear = Number(bio?.bornYear ?? 0);
  if (playerBirthYear > 0 && bioBirthYear > 0 && playerBirthYear !== bioBirthYear) return null;
  return bio;
};

const verifiedDraftYear = (player: NBAPlayer): number => {
  const bioYear = Number(matchingNbaBio(player)?.draftYear ?? 0);
  if (bioYear > 0) return bioYear;
  return Number(player.historicalEndesaSource?.draftYear ?? 0);
};

const prospectScore = (player: NBAPlayer, draftYear: number): number => {
  const visibleOverall = getDisplayOverall(player, draftYear);
  const age = player.born?.year ? draftYear - player.born.year : Number(player.age ?? 22);
  const ageBonus = Math.max(0, 22 - age) * 2;
  const variance = Math.round(hashUnit(`${player.internalId}:${draftYear}:prospect`) * 8) - 2;
  return Math.max(35, Math.min(99, Math.round(visibleOverall + ageBonus + variance)));
};

export const getNbaDraftTeamPresentation = (abbrev?: string) => {
  const team = STATIC_NBA_TEAMS.find(entry => entry.abbrev === abbrev);
  return {
    name: team?.fullName ?? abbrev ?? 'NBA Club',
    logoUrl: team ? `https://cdn.nba.com/logos/nba/${team.nbaId}/global/L/logo.svg` : undefined,
  };
};

export async function prepareHistoricalEndesaDraftOutcomes(state: GameState): Promise<GameState> {
  const historical = state.historicalEndesa;
  if (!historical) return state;
  const season = draftCalendarYear(state);
  if ((historical.preparedDraftSeasons ?? []).includes(season)) return state;
  await ensureBiosLoaded();

  const rosterByIdentity = new Map<string, NBAPlayer>();
  for (const player of state.players) {
    rosterByIdentity.set(player.historicalEndesaSource?.identityKey ?? player.internalId, player);
  }
  for (const player of state.euroScouting?.academyPlayers ?? []) {
    rosterByIdentity.set(player.historicalEndesaSource?.identityKey ?? player.internalId, player);
  }
  const roster = [...rosterByIdentity.values()];
  const historicalCandidates = season <= ENDESA_HISTORICAL_CATALOG.nbaDraftReferenceCutoffYear
      ? roster.filter(player => {
        if (!player.historicalEndesaSource) return false;
        return verifiedDraftYear(player) === season;
      })
    : [];
  const branchCandidates = season > ENDESA_HISTORICAL_CATALOG.nbaDraftReferenceCutoffYear ? roster.filter(player => {
    const identityKey = player.historicalEndesaSource?.identityKey ?? player.internalId;
    if ((historical.draftOutcomes ?? []).some(outcome => outcome.identityKey === identityKey)) return false;
    return shouldDeclareForInternationalDraft(player, season);
  }) : [];
  const candidates = [...historicalCandidates, ...branchCandidates];
  const seen = new Set<string>();
  const outcomes: HistoricalEndesaDraftOutcome[] = [];
  for (const player of candidates) {
    const meta = player.historicalEndesaSource;
    const identityKey = meta?.identityKey ?? player.internalId;
    if (seen.has(identityKey)) continue;
    seen.add(identityKey);
    const bio = meta ? matchingNbaBio(player) : null;
    const draftYear = verifiedDraftYear(player);
    const isHistoricalClass = draftYear === season && season <= ENDESA_HISTORICAL_CATALOG.nbaDraftReferenceCutoffYear;
    const bioMatchesClass = Number(bio?.draftYear ?? 0) === season;
    const projection = isHistoricalClass ? null : projectInternationalDraftSelection(player, season);
    const round = isHistoricalClass
      ? (bioMatchesClass ? Number(bio?.draftRound ?? 0) : Number(meta?.draftRound ?? 0))
      : projection?.selected ? (Number(projection.pick) <= 30 ? 1 : 2) : 0;
    const pick = isHistoricalClass
      ? (bioMatchesClass ? Number(bio?.draftPick ?? 0) : Number(meta?.draftPick ?? 0))
      : Number(projection?.pick ?? 0);
    const selected = round > 0 && pick > 0;
    const destinationIndex = projection?.destinationIndex;
    const projectedTeam = typeof destinationIndex === 'number' ? STATIC_NBA_TEAMS[destinationIndex] : undefined;
    outcomes.push({
      id: `endesa-nba-draft:${season}:${identityKey}`,
      season,
      playerId: player.internalId,
      identityKey,
      playerName: player.name,
      sourceTeamTid: player.tid,
      prospectScore: isHistoricalClass ? prospectScore(player, season) : calculateInternationalDraftValue(player, season),
      status: selected ? 'selected' : 'undrafted',
      draftRound: selected ? round : undefined,
      draftPick: selected ? pick : undefined,
      destinationAbbrev: selected ? (bio?.draftAbbrev ?? projectedTeam?.abbrev) : undefined,
      reviewed: false,
    });
  }

  return {
    ...state,
    historicalEndesa: {
      ...historical,
      preparedDraftSeasons: [...(historical.preparedDraftSeasons ?? []), season],
      draftOutcomes: [...(historical.draftOutcomes ?? []), ...outcomes],
    },
  };
}

export function completeHistoricalEndesaDraftReview(state: GameState): GameState {
  const historical = state.historicalEndesa;
  if (!historical) return state;
  const season = draftCalendarYear(state);
  const current = (historical.draftOutcomes ?? []).filter(outcome => outcome.season === season && !outcome.reviewed);
  if (current.length === 0) return state;
  const selectedIds = new Set(current.filter(outcome => outcome.status === 'selected').map(outcome => outcome.playerId));
  const selectedIdentityKeys = current.filter(outcome => outcome.status === 'selected').map(outcome => outcome.identityKey);
  const selectedSourcePlayers = [
    ...state.players,
    ...(state.euroScouting?.academyPlayers ?? []),
  ].filter(player => selectedIds.has(player.internalId) && !!player.historicalEndesaSource);
  const departuresByIdentity = new Map((historical.draftDepartures ?? []).map(player => [
    player.historicalEndesaSource?.identityKey ?? player.internalId,
    player,
  ]));
  for (const player of selectedSourcePlayers) {
    departuresByIdentity.set(player.historicalEndesaSource!.identityKey, player);
  }
  return {
    ...state,
    players: state.players.filter(player => !selectedIds.has(player.internalId)),
    euroScouting: state.euroScouting ? {
      ...state.euroScouting,
      academyPlayers: state.euroScouting.academyPlayers.filter(player => !selectedIds.has(player.internalId)),
    } : state.euroScouting,
    historicalEndesa: {
      ...historical,
      reservedIdentityKeys: [...new Set([...(historical.reservedIdentityKeys ?? []), ...selectedIdentityKeys])],
      draftDepartures: [...departuresByIdentity.values()],
      draftOutcomes: (historical.draftOutcomes ?? []).map(outcome => outcome.season === season ? { ...outcome, reviewed: true } : outcome),
    },
  };
}
