import type { FibaCountryPool, FibaPoolCandidate, FibaRosterRole, FibaSelectedPlayer } from '../fiba/types';
import type { GameState, NBAPlayer, NBATeam } from '../../types';
import { getNameData, pickGenderedName } from '../../data/nameDataFetcher';
import { computeAge, getOwnTeamId } from '../../utils/helpers';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { isArchivedTeam } from '../../utils/teamArchive';
import { getTeamFullName } from '../../utils/teamNames';
import { selectFibaNationalRoster } from '../fiba/selectNationalRoster';
import { getLeagueEventDisplayName } from '../franchises/franchiseEventNaming';
import { seededRandom } from '../externalLeague/externalLeagueIdentity';
import { scheduleSummerLeaguePreliminary } from './schedule';
import type { SummerLeagueTeam, SummerLeagueTournamentState } from './types';
import { isSummerLeagueTournamentEnabled } from './availability';
import { getLeagueCalendarDates } from '../leagueCalendar';
import { toISODateString } from '../../utils/dateUtils';
import { normalizePlayerAwardType } from '../../utils/playerAwardNormalizer';

function yearsOfService(player: NBAPlayer, year: number): number {
  return new Set((player.stats ?? [])
    .filter(stat =>
      !stat.playoffs
      && Number(stat.gp ?? 0) > 0
      && Number(stat.season) < year
      && (!stat.competitionId || stat.competitionId === 'nba-cup'),
    )
    .map(stat => Number(stat.season))
    .filter(Number.isFinite)).size;
}

export function getSummerLeagueExperience(player: NBAPlayer, year: number): number {
  const draftYear = Number(player.draft?.year);
  const seasonsSinceDraft = Number.isFinite(draftYear) && draftYear <= year
    ? Math.max(0, year - draftYear)
    : 0;
  return Math.max(yearsOfService(player, year), seasonsSinceDraft);
}

export function isSummerLeagueEligiblePlayer(player: NBAPlayer, year: number): boolean {
  const status = String(player.status ?? '');
  if (['Retired', 'WNBA', 'Euroleague', 'EuroCup', 'PBA', 'B-League', 'Endesa', 'China CBA', 'NBL Australia', 'France Elite', 'Italy Serie A', 'Germany BBL', 'Greece A1', 'Turkey BSL', 'Lithuania LKL', 'Israel BSL', 'VTB', 'ABA'].includes(status)) return false;
  if (['Draft Prospect', 'Prospect'].includes(status) && Number(player.draft?.year ?? year + 1) > year) return false;
  if ((player.awards ?? []).some(award =>
    Number(award.season) <= year && normalizePlayerAwardType(award.type) === 'All-Star'
  )) return false;
  const age = computeAge(player, year);
  const professionalExperience = getSummerLeagueExperience(player, year);
  return age >= 18 && age <= 25 && professionalExperience <= 2;
}

function rosterRole(position: string): FibaRosterRole {
  const value = position.toUpperCase();
  if (value.includes('C')) return 'big';
  if (value.includes('G')) return 'guard';
  return 'forward';
}

function candidate(player: NBAPlayer, teamName: string, year: number): FibaPoolCandidate {
  const rating = [...(player.ratings ?? [])]
    .filter(row => !Number.isFinite(Number(row?.season)) || Number(row.season) <= year)
    .sort((left, right) => Number(left?.season ?? 0) - Number(right?.season ?? 0))
    .at(-1);
  const strength = Number(rating?.ovr ?? player.overallRating ?? 45);
  return {
    id: `save:${player.internalId}`,
    name: player.name,
    imageUrl: player.imgURL,
    country: teamName,
    source: 'save',
    position: player.pos ?? 'G',
    strength,
    selectionScore: strength * 10 + Number(rating?.pot ?? player.potential ?? strength),
    jerseyNumber: player.jerseyNumber,
    birthYear: player.born?.year,
    savePlayerId: player.internalId,
    rating: rating ? { ...rating } : undefined,
  };
}

function teamPool(
  team: NBATeam,
  players: readonly NBAPlayer[],
  year: number,
): FibaCountryPool {
  const name = getTeamFullName(team);
  const ownPlayers = players
    .filter(player => player.tid === team.id)
    .sort((left, right) =>
      Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0)
      || left.name.localeCompare(right.name),
    );
  const primary = ownPlayers.filter(player => isSummerLeagueEligiblePlayer(player, year));
  return {
    country: name,
    teamTid: team.id,
    abbrev: team.abbrev,
    imageUrl: getResolvedTeamLogoUrl(team, year),
    candidates: primary.map(player => candidate(player, name, year)),
  };
}

function generatedCampInvite(
  team: NBATeam,
  teamName: string,
  year: number,
  slot: number,
): FibaPoolCandidate {
  let roll = 0;
  const rng = () => seededRandom(`${year}:${team.id}:summer-camp:${slot}:${roll++}`);
  const position = (['G', 'GF', 'F', 'FC', 'C'] as const)[slot % 5];
  const age = 19 + Math.floor(rng() * 7);
  const strength = 35 + Math.floor(rng() * 13);
  const athletic = 30 + Math.floor(rng() * 28);
  const skill = 25 + Math.floor(rng() * 30);
  return {
    id: `summer-camp:${year}:${team.id}:${slot}`,
    name: pickGenderedName(getNameData(), 'USA', 'male', rng),
    country: teamName,
    source: 'archive',
    position,
    strength,
    selectionScore: strength * 10 + Math.floor(rng() * 30),
    birthYear: year - age,
    rating: {
      season: year,
      hgt: position === 'C' ? 72 : position.includes('F') ? 52 : 34,
      stre: athletic,
      spd: position === 'C' ? Math.max(20, athletic - 12) : athletic,
      jmp: athletic,
      endu: 40 + Math.floor(rng() * 25),
      ins: skill,
      dnk: athletic,
      fg: skill,
      tp: position === 'C' ? Math.max(10, skill - 12) : skill,
      ft: skill,
      pss: position.includes('G') ? skill + 8 : skill,
      reb: position.includes('C') || position.includes('F') ? skill + 8 : skill,
      drb: skill,
      oiq: skill,
      diq: skill,
    },
  };
}

function fillPools(
  pools: FibaCountryPool[],
  teamsByTid: ReadonlyMap<number, NBATeam>,
  sharedPlayers: readonly NBAPlayer[],
  year: number,
  userTeamId: number | undefined,
): FibaCountryPool[] {
  const assignedPlayerIds = new Set(
    pools.flatMap(pool => pool.candidates.flatMap(entry => entry.savePlayerId ? [entry.savePlayerId] : [])),
  );
  const unassignedPlayers = sharedPlayers.filter(player => !assignedPlayerIds.has(player.internalId));
  const ordered = [
    ...pools.filter(pool => pool.teamTid === userTeamId),
    ...pools.filter(pool => pool.teamTid !== userTeamId),
  ];
  let sharedIndex = 0;
  const userPool = ordered.find(pool => pool.teamTid === userTeamId);
  while (userPool && userPool.candidates.length < 24 && sharedIndex < unassignedPlayers.length) {
    userPool.candidates.push(candidate(unassignedPlayers[sharedIndex], userPool.country, year));
    sharedIndex += 1;
  }
  const remaining = ordered.filter(pool => pool !== userPool);
  while (sharedIndex < unassignedPlayers.length && remaining.some(pool => pool.candidates.length < 15)) {
    for (const pool of remaining) {
      if (pool.candidates.length >= 15 || sharedIndex >= unassignedPlayers.length) continue;
      pool.candidates.push(candidate(unassignedPlayers[sharedIndex], pool.country, year));
      sharedIndex += 1;
    }
  }
  return pools.map(pool => {
    const team = teamsByTid.get(pool.teamTid);
    if (!team) return pool;
    const candidates = [...pool.candidates];
    for (let slot = candidates.length; slot < 15; slot += 1) {
      candidates.push(generatedCampInvite(team, pool.country, year, slot));
    }
    return { ...pool, candidates };
  });
}

function summerTeam(
  pool: FibaCountryPool,
  seed: number,
): SummerLeagueTeam {
  const selected = selectFibaNationalRoster(pool, 8);
  const strength = selected.players.reduce((sum, player) => sum + player.strength, 0)
    / Math.max(1, selected.players.length);
  return {
    id: `summer-team:${pool.teamTid}`,
    sourceTid: pool.teamTid,
    name: pool.country,
    abbrev: pool.abbrev,
    logoUrl: pool.imageUrl,
    seed,
    strength,
    players: selected.players,
    reserves: selected.reserves,
    availablePlayerIds: pool.candidates.flatMap(entry => entry.savePlayerId ? [entry.savePlayerId] : []),
  };
}

export function prepareSummerLeagueTournament(
  state: GameState,
  calendarYear: number,
): SummerLeagueTournamentState | undefined {
  if (!isSummerLeagueTournamentEnabled(state.leagueStats, calendarYear)) return undefined;
  const activeTeams = state.teams
    .filter(team => !isArchivedTeam(team) && team.id >= 0 && team.id < 100)
    .sort((left, right) => left.id - right.id);
  if (activeTeams.length < 2) return undefined;
  const userTeamId = getOwnTeamId(state) ?? undefined;
  const sharedPlayers = state.players
    .filter(player =>
      (player.tid < 0 || player.status === 'G-League')
      && isSummerLeagueEligiblePlayer(player, calendarYear),
    )
    .sort((left, right) =>
      Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0)
      || left.name.localeCompare(right.name),
    );
  const teamsByTid = new Map(activeTeams.map(team => [team.id, team]));
  const pools = fillPools(
    activeTeams.map(team => teamPool(team, state.players, calendarYear)),
    teamsByTid,
    sharedPlayers,
    calendarYear,
    userTeamId,
  );
  const teams = pools
    .map((pool, index) => summerTeam(pool, index + 1))
    .filter(team => team.players.length >= 5);
  if (teams.length < 2) return undefined;
  const id = `nba-summer-league-${calendarYear}`;
  const summerLeagueStart = getLeagueCalendarDates(calendarYear, state.leagueStats).summerLeagueStart;
  if (!summerLeagueStart) return undefined;
  const userRosterFinalized = state.gameMode !== 'gm'
    || userTeamId == null
    || !teams.some(team => team.sourceTid === userTeamId)
    || (teams.find(team => team.sourceTid === userTeamId)?.availablePlayerIds.length ?? 0) < 8;
  return {
    version: 1,
    id,
    competitionId: 'nba-summer-league',
    year: calendarYear,
    branchYear: Number(state.nbaStartYear ?? state.leagueStats.historicalEraStartYear ?? calendarYear),
    title: getLeagueEventDisplayName(state, 'summer_league', 'NBA Summer League'),
    location: 'Las Vegas, Nevada',
    status: userRosterFinalized ? 'preliminary' : 'roster-selection',
    teams,
    games: scheduleSummerLeaguePreliminary(teams, id, toISODateString(summerLeagueStart)),
    boxScores: [],
    userTeamId,
    userRosterFinalized,
    reviewed: false,
  };
}

export function reconcileSummerLeagueUserCandidatePool(
  tournament: SummerLeagueTournamentState,
  players: readonly NBAPlayer[],
): SummerLeagueTournamentState {
  if (tournament.userTeamId == null || tournament.userRosterFinalized) return tournament;
  const teamIndex = tournament.teams.findIndex(team => team.sourceTid === tournament.userTeamId);
  if (teamIndex < 0) return tournament;
  const team = tournament.teams[teamIndex];
  const selectedIds = [...team.players, ...team.reserves]
    .flatMap(entry => entry.savePlayerId ? [entry.savePlayerId] : []);
  const otherRosterIds = new Set(tournament.teams
    .filter(entry => entry.sourceTid !== tournament.userTeamId)
    .flatMap(entry => [...entry.players, ...entry.reserves])
    .flatMap(entry => entry.savePlayerId ? [entry.savePlayerId] : []));
  const eligible = players
    .filter(player => (
      isSummerLeagueEligiblePlayer(player, tournament.year)
      && (
        player.tid === tournament.userTeamId
        || player.tid < 0
        || player.status === 'G-League'
      )
      && (!otherRosterIds.has(player.internalId) || selectedIds.includes(player.internalId))
    ))
    .sort((left, right) => (
      Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0)
      || left.name.localeCompare(right.name)
    ));
  const availablePlayerIds = [...new Set([
    ...selectedIds,
    ...eligible.map(player => player.internalId),
  ])].slice(0, 24);
  if (
    availablePlayerIds.length === team.availablePlayerIds.length
    && availablePlayerIds.every((id, index) => id === team.availablePlayerIds[index])
  ) return tournament;
  const teams = [...tournament.teams];
  teams[teamIndex] = { ...team, availablePlayerIds };
  return { ...tournament, teams };
}

export function saveSummerLeagueRosterReviewDraft(
  tournament: SummerLeagueTournamentState,
  draft: NonNullable<SummerLeagueTournamentState['rosterReviewDraft']>,
): SummerLeagueTournamentState {
  if (tournament.userRosterFinalized || tournament.status !== 'roster-selection') return tournament;
  const team = tournament.teams.find(candidate => candidate.sourceTid === tournament.userTeamId);
  if (!team) return tournament;
  const allowed = new Set(team.availablePlayerIds);
  const selectedPlayerIds = [...new Set(draft.selectedPlayerIds)]
    .filter(id => allowed.has(id))
    .slice(0, 15);
  const editingPlayerId = draft.editingPlayerId === 'add' || draft.editingPlayerId === null
    ? draft.editingPlayerId
    : selectedPlayerIds.includes(draft.editingPlayerId)
      ? draft.editingPlayerId
      : null;
  const current = tournament.rosterReviewDraft;
  if (
    current
    && current.searchQuery === draft.searchQuery
    && current.editingPlayerId === editingPlayerId
    && current.selectedPlayerIds.length === selectedPlayerIds.length
    && current.selectedPlayerIds.every((id, index) => id === selectedPlayerIds[index])
  ) return tournament;
  return {
    ...tournament,
    rosterReviewDraft: {
      selectedPlayerIds,
      searchQuery: draft.searchQuery,
      editingPlayerId,
    },
  };
}

export function updateSummerLeagueUserRoster(
  tournament: SummerLeagueTournamentState,
  players: readonly NBAPlayer[],
  selectedPlayerIds: readonly string[],
): SummerLeagueTournamentState {
  if (tournament.userTeamId == null || tournament.userRosterFinalized) return tournament;
  const teamIndex = tournament.teams.findIndex(team => team.sourceTid === tournament.userTeamId);
  if (teamIndex < 0) return tournament;
  const team = tournament.teams[teamIndex];
  const allowed = new Set(team.availablePlayerIds);
  const uniqueIds = [...new Set(selectedPlayerIds)].filter(id => allowed.has(id));
  if (uniqueIds.length < 8 || uniqueIds.length > 15) {
    throw new Error('Choose between 8 and 15 eligible Summer League players.');
  }
  const byId = new Map(players.map(player => [player.internalId, player]));
  const selected = uniqueIds
    .map(id => byId.get(id))
    .filter((player): player is NBAPlayer => !!player)
    .map(player => candidate(player, team.name, tournament.year));
  const usedJerseys = new Set<string>();
  const roster: FibaSelectedPlayer[] = selected.map((entry, index) => {
    const requested = String(entry.jerseyNumber ?? '');
    const jerseyNumber = requested && !usedJerseys.has(requested) ? requested : String(index);
    usedJerseys.add(jerseyNumber);
    return { ...entry, rosterRole: rosterRole(entry.position), jerseyNumber };
  });
  const strength = roster.reduce((sum, player) => sum + player.strength, 0) / Math.max(1, roster.length);
  const teams = [...tournament.teams];
  teams[teamIndex] = { ...team, players: roster.slice(0, 12), reserves: roster.slice(12), strength };
  return {
    ...tournament,
    teams,
    userRosterFinalized: true,
    status: 'preliminary',
    rosterReviewDraft: undefined,
  };
}
