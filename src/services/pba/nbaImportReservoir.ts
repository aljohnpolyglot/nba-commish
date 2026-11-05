import type { DraftPick, GameState, NBAPlayer, NBATeam } from '../../types';
import { getPlayerNationalityCountries } from '../../utils/playerNationality';
import { getLastAttendedSchool } from '../../utils/educationUtils';
import { PBA_HISTORICAL_CATALOG } from './historicalCatalog';
import { hasMeaningfulSourceText, parsePlausibleBirthYear } from './sourceIdentityValues';
import { getPhilippineCollegeLabel } from './collegeIdentity';

type NbaReferenceRoster = {
  supported?: boolean;
  players: NBAPlayer[];
  teams: NBATeam[];
  draftPicks: DraftPick[];
};

const normalizeName = (value: string): string => value
  .toLowerCase()
  .replace(/\./g, '')
  .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const identityKey = (player: NBAPlayer): string => (
  `${normalizeName(player.name)}|${parsePlausibleBirthYear(player.born?.year) ?? ''}`
);

const mergeRows = <T>(
  primary: T[] | undefined,
  enrichment: T[] | undefined,
  keyOf: (row: T) => string,
): T[] | undefined => {
  const rows = new Map<string, T>();
  for (const row of enrichment ?? []) rows.set(keyOf(row), row);
  for (const row of primary ?? []) rows.set(keyOf(row), row);
  return rows.size > 0 ? [...rows.values()] : undefined;
};

function mergeNbaHistoryIntoPbaPlayer(current: NBAPlayer, reference: NBAPlayer): NBAPlayer {
  const countries = [...new Set([
    ...getPlayerNationalityCountries(reference),
    ...getPlayerNationalityCountries(current),
  ])];
  const nationality = countries.join(' / ') || current.nationality || reference.nationality;
  const birthYear = parsePlausibleBirthYear(current.born?.year) ?? parsePlausibleBirthYear(reference.born?.year);
  const born = birthYear ? {
    ...reference.born,
    ...current.born,
    year: birthYear,
    loc: nationality || current.born?.loc || reference.born?.loc || 'Unknown',
  } : current.born ?? reference.born;
  const currentHeight = Number(current.hgt);
  const currentWeight = Number(current.weight);
  const currentDraftYear = Number(current.draft?.year);
  return {
    ...current,
    srID: current.srID || reference.srID,
    slug: current.slug || reference.slug,
    college: (() => {
      const source = hasMeaningfulSourceText(current.college) ? current.college : reference.college;
      const lastAttended = getLastAttendedSchool(source);
      return getPhilippineCollegeLabel(lastAttended) ?? lastAttended ?? undefined;
    })(),
    hgt: Number.isFinite(currentHeight) && currentHeight >= 48 && currentHeight <= 100 ? current.hgt : reference.hgt,
    weight: Number.isFinite(currentWeight) && currentWeight >= 80 && currentWeight <= 500 ? current.weight : reference.weight,
    imgURL: current.imgURL ?? reference.imgURL,
    draft: Number.isFinite(currentDraftYear) && currentDraftYear > 0 ? current.draft : reference.draft,
    nationality,
    born,
    stats: mergeRows(current.stats, reference.stats, row => [
      Number(row.season),
      Number(row.tid),
      row.playoffs === true ? 'p' : 'r',
      String(row.competitionId ?? ''),
    ].join('|')),
    awards: mergeRows(current.awards, reference.awards, row => [
      Number(row.season),
      String(row.type ?? '').toLowerCase(),
      String(row.competitionId ?? ''),
    ].join('|')),
    transactions: mergeRows(current.transactions, reference.transactions, row => [
      Number(row.season),
      String(row.type ?? ''),
      Number(row.tid ?? -1),
    ].join('|')),
    contractYears: mergeRows(current.contractYears, reference.contractYears, row => [
      String(row.season ?? ''),
      String(row.type ?? ''),
    ].join('|')),
    salaries: mergeRows(current.salaries, reference.salaries, row => [
      Number(row.season),
      Number(row.tid ?? -1),
      String(row.teamAbbrev ?? ''),
    ].join('|')),
  };
}

function findNbaReference(
  player: NBAPlayer,
  exact: Map<string, NBAPlayer>,
  byName: Map<string, NBAPlayer[]>,
): NBAPlayer | undefined {
  const exactMatch = exact.get(identityKey(player));
  if (exactMatch) return exactMatch;
  const candidates = byName.get(normalizeName(player.name)) ?? [];
  if (candidates.length !== 1) return undefined;
  const candidate = candidates[0];
  const currentBirthYear = parsePlausibleBirthYear(player.born?.year);
  const referenceBirthYear = parsePlausibleBirthYear(candidate.born?.year);
  if (currentBirthYear && referenceBirthYear && currentBirthYear !== referenceBirthYear) return undefined;
  return candidate;
}

export function advancePbaNbaImportReservoir(
  state: GameState,
  reference: NbaReferenceRoster,
): GameState {
  const historical = state.historicalPba;
  const season = state.leagueStats.year;
  if (!historical || (historical.materializedNbaMarketSeasons ?? []).includes(season) || reference.supported === false) return state;
  const coexist = season >= PBA_HISTORICAL_CATALOG.nbaCoexistSourceSeason;
  const referenceByIdentity = new Map(reference.players.map(player => [identityKey(player), player]));
  const referenceByName = new Map<string, NBAPlayer[]>();
  for (const player of reference.players) {
    const key = normalizeName(player.name);
    referenceByName.set(key, [...(referenceByName.get(key) ?? []), player]);
  }
  const players = state.players.map(player => {
    if (!player.historicalPbaSource) return player;
    const referencePlayer = findNbaReference(player, referenceByIdentity, referenceByName);
    return referencePlayer ? mergeNbaHistoryIntoPbaPlayer(player, referencePlayer) : player;
  });
  const existingIdentityKeys = new Set(players.map(identityKey));
  const incoming = reference.players.filter(player => {
    if (!coexist && player.tid !== -1 && player.status !== 'Free Agent') return false;
    const key = identityKey(player);
    return !existingIdentityKeys.has(key);
  });
  for (const player of incoming) {
    players.push(coexist ? player : { ...player, tid: -1, status: 'Free Agent' });
    existingIdentityKeys.add(identityKey(player));
  }
  const knownTeamIds = new Set(state.teams.map(team => team.id));
  const teams = coexist
    ? [...state.teams, ...reference.teams.filter(team => !knownTeamIds.has(team.id))]
    : state.teams;
  const pickKeys = new Set(state.draftPicks.map(pick => `${pick.originalTid}|${pick.season}|${pick.round}`));
  const draftPicks = coexist
    ? [...state.draftPicks, ...reference.draftPicks.filter(pick => !pickKeys.has(`${pick.originalTid}|${pick.season}|${pick.round}`))]
    : state.draftPicks;
  return {
    ...state,
    players,
    teams,
    draftPicks,
    historicalPba: {
      ...historical,
      materializedNbaMarketSeasons: [...(historical.materializedNbaMarketSeasons ?? []), season],
    },
  };
}
