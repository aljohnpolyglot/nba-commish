import type { NBAPlayer } from '../../types';
import { createInternationalTournamentState } from './createTournamentState';
import { prepareFibaNationalTeams } from './prepareNationalTeams';
import { scheduleInternationalGroupStage } from './scheduleGroupStage';
import { getPlayableInternationalWindowForSeason } from './tournamentWindows';
import type { InternationalTournamentState } from './types';
import { loadFibaHistoricalRoster } from './fibaRosterLoader';
import { mergeFibaHistoricalPlayerAwards } from './mergeHistoricalPlayerAwards';
import tournamentHistory from '../../data/fibaTournamentHistory.json';
import type { InternationalTournamentKind, InternationalTournamentTeam } from './types';
import euroBasketHistory from '../../data/euroBasketHistory.json';
import { isEuroBasketCountry } from './countryIdentity';
import { internationalTournamentCompetitionId } from './competitionIdentity';

function readOnlyTeam(country: string, year: number, seed: number): InternationalTournamentTeam {
  return {
    id: `national:readonly:${country.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${year}`,
    country,
    abbrev: country.slice(0, 3).toUpperCase(),
    sourceTid: -1,
    seed,
    strength: 0,
    players: [],
    reserves: [],
  };
}

function readOnlyTournament(
  kind: InternationalTournamentKind,
  year: number,
  playedYear: number,
  branchYear: number,
): InternationalTournamentState | undefined {
  if (playedYear >= branchYear) return undefined;
  const worldCup = kind === 'world-cup'
    ? tournamentHistory.worldCup.find(entry => entry.year === year && entry.status === 'complete')
    : undefined;
  const olympics = kind === 'olympics-men'
    ? tournamentHistory.olympicsMen.find(entry => entry.year === year && entry.status === 'complete')
    : undefined;
  const euroBasket = kind === 'eurobasket'
    ? euroBasketHistory.find(entry => entry.year === year && 'gold' in entry && !!entry.gold)
    : undefined;
  if (!worldCup && !olympics && !euroBasket) return undefined;
  const placements = worldCup
    ? [worldCup.champion, worldCup.runnerUp, worldCup.thirdPlace, worldCup.fourthPlace]
    : olympics
      ? [olympics.gold, olympics.silver, olympics.bronze, olympics.fourthPlace]
      : [euroBasket!.gold, euroBasket!.silver, euroBasket!.bronze, euroBasket!.fourthPlace];
  if (!placements[0] || !placements[1]) return undefined;
  const teams = placements
    .filter((country): country is string => !!country)
    .filter((country, index, rows) => rows.indexOf(country) === index)
    .map((country, index) => readOnlyTeam(country, year, index + 1));
  const teamId = (country: string | null | undefined) => teams.find(team => team.country === country)?.id;
  const finalScore = worldCup
    ? worldCup.finalScore
    : olympics ? olympics.goldMedalGameScore : euroBasket!.score;
  const thirdPlaceScore = worldCup
    ? worldCup.thirdPlaceScore
    : olympics ? olympics.bronzeMedalGameScore : euroBasket!.bronzeScore;
  const competitionId = internationalTournamentCompetitionId(kind, year);
  return {
    version: 1,
    id: competitionId,
    competitionId,
    kind,
    year,
    playedYear,
    branchYear,
    status: 'complete',
    hostCountries: (worldCup ?? olympics ?? euroBasket!).hosts,
    fieldMode: kind === 'world-cup' ? 'eligible-countries' : 'capped',
    teams,
    groups: [],
    games: [],
    boxScores: [],
    result: {
      championTeamId: teamId(placements[0])!,
      runnerUpTeamId: teamId(placements[1])!,
      thirdPlaceTeamId: teamId(placements[2]),
      fourthPlaceTeamId: teamId(placements[3]),
      finalScore: finalScore ?? undefined,
      thirdPlaceScore: thirdPlaceScore ?? undefined,
    },
    reviewed: false,
    readOnly: true,
  };
}

export interface PreparedInternationalTournamentWindow {
  tournament?: InternationalTournamentState;
  players: NBAPlayer[];
}

export async function enrichPlayersWithFibaHistoricalAwards(
  players: readonly NBAPlayer[],
  branchYear: number,
): Promise<NBAPlayer[]> {
  const loaded = await loadFibaHistoricalRoster();
  return mergeFibaHistoricalPlayerAwards(players, loaded.roster, branchYear - 1).players;
}

export async function prepareInternationalTournamentWindow(
  players: readonly NBAPlayer[],
  branchYear: number,
  tournamentCalendarYear: number,
  landingCalendarYear = tournamentCalendarYear,
  selectedStartDate?: string,
): Promise<PreparedInternationalTournamentWindow> {
  const window = getPlayableInternationalWindowForSeason(tournamentCalendarYear, landingCalendarYear);
  if (!window) {
    return { players: await enrichPlayersWithFibaHistoricalAwards(players, branchYear) };
  }

  if (
    selectedStartDate
    && selectedStartDate > window.tournamentEndDate
    && window.tournamentYear <= branchYear
  ) {
    return { players: await enrichPlayersWithFibaHistoricalAwards(players, branchYear) };
  }

  const prepared = await prepareFibaNationalTeams({
    year: window.rosterYear,
    minimumPlayablePlayers: 8,
    branchCutoffYear: branchYear - 1,
    savePlayers: players,
    ...(window.kind === 'eurobasket' ? { countryFilter: isEuroBasketCountry } : {}),
  });
  if (prepared.rosters.length < 4) {
    return {
      tournament: readOnlyTournament(window.kind, window.tournamentYear, window.rosterYear, branchYear),
      players: prepared.savePlayersWithHistoricalAwards,
    };
  }

  const branchSafeHosts = window.kind === 'eurobasket' && window.tournamentYear > branchYear
    ? []
    : window.hosts;
  const assignedHosts = branchSafeHosts.length > 0
    ? branchSafeHosts
    : [prepared.rosters[(window.tournamentYear * 17) % prepared.rosters.length]?.country].filter((country): country is string => !!country);
  const base = createInternationalTournamentState({
    kind: window.kind,
    year: window.tournamentYear,
    playedYear: window.rosterYear,
    branchYear,
    hostCountries: assignedHosts,
    preparedTeams: prepared,
    ...(window.kind !== 'world-cup'
      ? { fieldMode: 'capped' as const, fieldLimit: window.fieldLimit ?? 24 }
      : { fieldMode: 'eligible-countries' as const }),
  });
  const selectedDateInWindow = selectedStartDate?.startsWith(`${landingCalendarYear}-`)
    && selectedStartDate <= window.tournamentEndDate
    ? selectedStartDate
    : undefined;
  const tournament = scheduleInternationalGroupStage(base, {
    startDate: selectedDateInWindow && selectedDateInWindow > window.tournamentStartDate
      ? selectedDateInWindow
      : window.tournamentStartDate,
    groupSize: 4,
    daysBetweenRounds: 2,
  });
  return {
    tournament,
    players: prepared.savePlayersWithHistoricalAwards,
  };
}
