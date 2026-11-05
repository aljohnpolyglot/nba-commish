import type { GameState } from '../../types';
import { EURO_BASKETBALL_SOURCE_ARCHIVES, EUROLEAGUE_2026_SOURCE } from '../../data/euroBasketballSources';
import { buildEndesaBroadcastDistribution, bookEndesaBroadcastDistribution } from '../historicalEndesa/broadcastDistribution';
import { getSeasonEconomyIndex, postClubTransaction } from '../tycoon/clubFinance';
import { getTeamCountry } from '../../utils/teamCountry';
import { getTeamFullName } from '../../utils/teamNames';
import { getTeamCompetitionRecord } from '../../utils/competitionRecord';
import { findEuroCountryProfile } from '../euroScouting/countryProfiles';
import { projectEuroCountryPopulation } from '../euroScouting/populationProjection';
import { getEuroClubMarketPopulation } from './teamMarketPopulation';
import { getClubContinentalPrestige } from './continentalPrestige';

export interface EuroMediaRightsRow {
  teamId: number;
  equalShareEUR: number;
  performanceShareEUR: number;
  commercialShareEUR: number;
  totalEUR: number;
  previousTotalEUR?: number;
}

export interface EuroCompetitionMediaRights {
  id: string;
  competitionId: string;
  competitionName: string;
  season: number;
  totalPoolEUR: number;
  equalPoolEUR: number;
  performancePoolEUR: number;
  commercialPoolEUR: number;
  commercialProvisional?: boolean;
  rows: EuroMediaRightsRow[];
}

export interface EuroMediaRightsMeeting {
  id: string;
  season: number;
  competitions: EuroCompetitionMediaRights[];
  totalPoolEUR: number;
}

const tierWeight: Record<string, number> = { S: 1.65, A: 1.35, B: 1.1, C: 0.9, D: 0.72 };

function teamId(team: any): number {
  return Number(team?.id ?? team?.tid);
}

function unique(tids: number[]): number[] {
  return [...new Set(tids.filter(tid => Number.isFinite(tid) && tid >= 0))];
}

function distribute(pool: number, weights: number[]): number[] {
  const normalized = weights.map(weight => Math.max(0.01, weight));
  const total = normalized.reduce((sum, weight) => sum + weight, 0);
  const values = normalized.map(weight => Math.round(pool * weight / total));
  if (values.length > 0) values[0] += pool - values.reduce((sum, value) => sum + value, 0);
  return values;
}

function participants(state: GameState, competitionId: string): number[] {
  const explicit = state.euroCompetitionTeamTids?.[competitionId] ?? [];
  if (explicit.length > 0) return unique(explicit);
  return unique(state.schedule
    .filter(game => game.competitionId === competitionId)
    .flatMap(game => [game.homeTid, game.awayTid]));
}

function basePool2026(competitionId: string, clubCount: number, isPrimary: boolean): number {
  if (competitionId === 'endesa') return 172_000_000;
  if (competitionId === 'euroleague') return 180_000_000;
  if (competitionId === 'eurocup') return 35_000_000;
  const source = [EUROLEAGUE_2026_SOURCE, ...EURO_BASKETBALL_SOURCE_ARCHIVES]
    .find(entry => entry.competitionId === competitionId);
  if (source?.kind === 'cross-border') return clubCount * 1_500_000;
  return clubCount * (isPrimary ? 2_000_000 : 1_200_000);
}

function priorReceipt(team: any, competitionId: string, season: number): number | undefined {
  return [...(team?.tycoon?.broadcastReceipts ?? [])]
    .filter((receipt: any) => receipt.competitionId === competitionId && receipt.year < season)
    .sort((left: any, right: any) => right.year - left.year)[0]?.totalEUR;
}

function latestCompletedSeason(team: any, season: number): any | null {
  return [...(team.seasons ?? [])]
    .filter((row: any) => Number(row.season) < season && Number(row.won ?? 0) + Number(row.lost ?? 0) > 0)
    .sort((left: any, right: any) => Number(right.season) - Number(left.season))[0] ?? null;
}

function stableVariation(team: any): number {
  const hash = getTeamFullName(team).split('').reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) >>> 0, 7);
  return ((hash % 21) - 10) / 100;
}

function performanceWeight(state: GameState, team: any, competitionId: string, season: number): number {
  const continentalFactor = 0.9 + getClubContinentalPrestige(state, teamId(team), season) / 500;
  const record = getTeamCompetitionRecord(state.boxScores ?? [], teamId(team), season, competitionId);
  const played = record.wins + record.losses;
  if (played > 0) return (0.65 + Math.pow(record.wins / played, 2) * 2.25) * continentalFactor;

  const prior = latestCompletedSeason(team, season);
  if (prior) {
    const games = Number(prior.won ?? 0) + Number(prior.lost ?? 0);
    return (
      0.7 + Math.pow(Number(prior.won ?? 0) / games, 2) * 1.8
      + Math.max(0, Number(prior.playoffRoundsWon ?? -1) + 1) * 0.08
    ) * continentalFactor;
  }

  const profile = tierWeight[team.tycoon?.tier ?? 'D'] ?? 0.9;
  const market = getEuroClubMarketPopulation(team) ?? 0.25;
  return Math.max(0.35, profile + Math.log10(1 + market) * 0.08 + stableVariation(team)) * continentalFactor;
}

function audienceProfile(team: any, season: number): number {
  const priorHype = Number(latestCompletedSeason(team, season)?.hype);
  if (Number.isFinite(priorHype)) return 0.9 + Math.max(0, Math.min(1, priorHype)) * 0.2;
  const tier = tierWeight[team.tycoon?.tier ?? 'D'] ?? 0.9;
  return 0.9 + Math.max(0, Math.min(1, (tier - 0.7) / 0.95)) * 0.2;
}

function buildCompetition(state: GameState, competitionId: string, tids: number[]): EuroCompetitionMediaRights | null {
  const spec = state.activeCompetitions?.find(competition => competition.id === competitionId);
  if (!spec || tids.length < 2) return null;
  const clubs = new Map([...state.teams, ...state.nonNBATeams].map(team => [teamId(team), team]));
  const orderedClubs = tids.map(tid => clubs.get(tid)).filter(Boolean) as any[];
  if (orderedClubs.length < 2) return null;
  const season = state.leagueStats.year;
  const totalPoolEUR = Math.round(
    basePool2026(competitionId, orderedClubs.length, competitionId === state.euroPrimaryCompetitionId)
    * getSeasonEconomyIndex(state, season),
  );
  const equalPoolEUR = Math.round(totalPoolEUR * 0.4);
  const performancePoolEUR = Math.round(totalPoolEUR * 0.3);
  const commercialPoolEUR = totalPoolEUR - equalPoolEUR - performancePoolEUR;
  const equal = distribute(equalPoolEUR, orderedClubs.map(() => 1));
  const performance = distribute(performancePoolEUR, orderedClubs.map(team => (
    performanceWeight(state, team, competitionId, season)
  )));
  const source = [EUROLEAGUE_2026_SOURCE, ...EURO_BASKETBALL_SOURCE_ARCHIVES]
    .find(entry => entry.competitionId === competitionId);
  const continental = source?.kind === 'cross-border' || competitionId === 'euroleague' || competitionId === 'eurocup';
  const countries = orderedClubs.map(team => getTeamCountry(team, state));
  const countryCounts = countries.reduce((counts, country) => {
    if (country) counts.set(country, (counts.get(country) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  let resolvedMarkets = 0;
  const commercialWeights = orderedClubs.map((team, index) => {
    let marketMillions: number | null = null;
    if (continental) {
      const country = countries[index];
      const profile = findEuroCountryProfile(country);
      if (profile && country) {
        marketMillions = projectEuroCountryPopulation(profile, season) / 1_000_000 / (countryCounts.get(country) ?? 1);
      }
    } else {
      marketMillions = getEuroClubMarketPopulation(team);
    }
    if (marketMillions != null && marketMillions > 0) resolvedMarkets += 1;
    return Math.sqrt(Math.max(0.01, marketMillions ?? 1)) * audienceProfile(team, season);
  });
  const commercial = distribute(commercialPoolEUR, commercialWeights);
  const commercialSpread = Math.max(...commercialWeights) - Math.min(...commercialWeights);
  return {
    id: `media-rights:${competitionId}:${season}`,
    competitionId,
    competitionName: spec.displayName,
    season,
    totalPoolEUR,
    equalPoolEUR,
    performancePoolEUR,
    commercialPoolEUR,
    commercialProvisional: resolvedMarkets === 0 || commercialSpread < 0.0001,
    rows: orderedClubs.map((team, index) => ({
      teamId: teamId(team),
      equalShareEUR: equal[index] ?? 0,
      performanceShareEUR: performance[index] ?? 0,
      commercialShareEUR: commercial[index] ?? 0,
      totalEUR: (equal[index] ?? 0) + (performance[index] ?? 0) + (commercial[index] ?? 0),
      previousTotalEUR: priorReceipt(team, competitionId, season),
    })).sort((left, right) => right.totalEUR - left.totalEUR),
  };
}

export function buildEuroMediaRightsMeeting(state: GameState): EuroMediaRightsMeeting {
  const season = state.leagueStats.year;
  const userTeamId = state.userTeamId;
  const competitionIds = (state.activeCompetitions ?? [])
    .map(competition => competition.id)
    .filter(competitionId => userTeamId != null && participants(state, competitionId).includes(userTeamId));
  const competitions: EuroCompetitionMediaRights[] = [];
  for (const competitionId of competitionIds) {
    if (competitionId === 'endesa' && state.historicalEndesa) {
      const historical = buildEndesaBroadcastDistribution(state);
      competitions.push({
        ...historical,
        id: historical.id,
        competitionId,
        competitionName: state.activeCompetitions?.find(item => item.id === competitionId)?.displayName ?? 'Liga Endesa',
      });
      continue;
    }
    const competition = buildCompetition(state, competitionId, participants(state, competitionId));
    if (competition) competitions.push(competition);
  }
  return {
    id: `euro-media-rights:${season}`,
    season,
    competitions,
    totalPoolEUR: competitions.reduce((sum, competition) => sum + competition.totalPoolEUR, 0),
  };
}

export function bookEuroMediaRights(state: GameState): GameState {
  const historicalBooked = state.historicalEndesa ? bookEndesaBroadcastDistribution(state) : state;
  const meeting = buildEuroMediaRightsMeeting(historicalBooked);
  const genericCompetitions = meeting.competitions.filter(competition => (
    !(competition.competitionId === 'endesa' && historicalBooked.historicalEndesa)
  ));
  if (genericCompetitions.length === 0) return historicalBooked;
  const rowsByTeam = new Map<number, Array<{ competition: EuroCompetitionMediaRights; row: EuroMediaRightsRow }>>();
  for (const competition of genericCompetitions) {
    for (const row of competition.rows) {
      rowsByTeam.set(row.teamId, [...(rowsByTeam.get(row.teamId) ?? []), { competition, row }]);
    }
  }
  const bookTeam = (team: any) => {
    const entries = rowsByTeam.get(teamId(team));
    if (!entries?.length || !team.tycoon) return team;
    const tycoon = {
      ...team.tycoon,
      transactions: [...(team.tycoon.transactions ?? [])],
      broadcastReceipts: [...(team.tycoon.broadcastReceipts ?? [])],
    };
    for (const { competition, row } of entries) {
      if (tycoon.broadcastReceipts.some((receipt: any) => receipt.id === competition.id)) continue;
      postClubTransaction(tycoon, {
        sourceId: competition.id,
        date: String(state.date),
        season: competition.season,
        category: 'broadcast',
        label: `${competition.competitionName} media rights`,
        amountEUR: row.totalEUR,
        competitionId: competition.competitionId,
      });
      tycoon.broadcastReceipts.push({
        id: competition.id,
        year: competition.season,
        competitionId: competition.competitionId,
        totalPoolEUR: competition.totalPoolEUR,
        equalShareEUR: row.equalShareEUR,
        performanceShareEUR: row.performanceShareEUR,
        commercialShareEUR: row.commercialShareEUR,
        totalEUR: row.totalEUR,
      });
    }
    return { ...team, tycoon };
  };
  return {
    ...historicalBooked,
    teams: historicalBooked.teams.map(bookTeam),
    nonNBATeams: historicalBooked.nonNBATeams.map(bookTeam),
  };
}
