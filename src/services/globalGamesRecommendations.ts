import type { NBAPlayer, NBATeam } from '../types';
import { findEuroCountryProfile } from './euroScouting/countryProfiles';
import { getPlayerNationalityCountries } from '../utils/playerNationality';

export interface GlobalGameCity {
  name: string;
  country: string;
  lat?: number;
  lng?: number;
}

export interface GlobalGameRecommendation {
  homeTid: number;
  awayTid: number;
  city: string;
  country: string;
  date: string;
  fit: number;
  marketFit: number;
  matchupStrength: number;
  rosterConnections: number;
  reasons: string[];
}

export const GLOBAL_GAME_CITIES_URL = 'https://gist.githubusercontent.com/randymeech/e9398d4f6fb827e2294a/raw/22925b92339f0f4c005159ae4d36f8f3988e9d39/top-1000-cities.json';

export const DEFAULT_GLOBAL_GAME_CITIES: GlobalGameCity[] = [
  { name: 'Paris', country: 'France' },
  { name: 'London', country: 'United Kingdom' },
  { name: 'Madrid', country: 'Spain' },
  { name: 'Barcelona', country: 'Spain' },
  { name: 'Athens', country: 'Greece' },
  { name: 'Belgrade', country: 'Serbia' },
  { name: 'Kaunas', country: 'Lithuania' },
  { name: 'Ljubljana', country: 'Slovenia' },
  { name: 'Berlin', country: 'Germany' },
  { name: 'Rome', country: 'Italy' },
  { name: 'Istanbul', country: 'Turkey' },
  { name: 'Tokyo', country: 'Japan' },
  { name: 'Manila', country: 'Philippines' },
  { name: 'Beijing', country: 'China' },
  { name: 'Shanghai', country: 'China' },
  { name: 'Melbourne', country: 'Australia' },
  { name: 'Sydney', country: 'Australia' },
  { name: 'Mexico City', country: 'Mexico' },
  { name: 'Santo Domingo', country: 'Dominican Republic' },
  { name: 'San Juan', country: 'Puerto Rico' },
  { name: 'Nassau', country: 'Bahamas' },
  { name: 'Dakar', country: 'Senegal' },
  { name: 'Abu Dhabi', country: 'United Arab Emirates' },
];

export function parseGlobalGameCities(data: unknown): GlobalGameCity[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((value): GlobalGameCity[] => {
    if (!value || typeof value !== 'object') return [];
    const city = value as Record<string, unknown>;
    if (typeof city.name !== 'string' || typeof city.country !== 'string') return [];
    const name = city.name.trim();
    const country = city.country.trim();
    if (!name || !country || ['united states', 'usa', 'us'].includes(country.toLowerCase())) return [];
    return [{
      name,
      country,
      lat: typeof city.lat === 'number' ? city.lat : undefined,
      lng: typeof city.lng === 'number' ? city.lng : undefined,
    }];
  });
}

export async function loadGlobalGameCities(): Promise<GlobalGameCity[]> {
  try {
    const response = await fetch(GLOBAL_GAME_CITIES_URL);
    if (!response.ok) throw new Error(`Global cities request failed (${response.status})`);
    const cities = parseGlobalGameCities(await response.json());
    return cities.length > 0 ? cities : DEFAULT_GLOBAL_GAME_CITIES;
  } catch {
    return DEFAULT_GLOBAL_GAME_CITIES;
  }
}

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

const getCountryProfile = (country: string) =>
  findEuroCountryProfile(country);

export function getGlobalCityMarketScore(city: GlobalGameCity): number {
  const profile = getCountryProfile(city.country);
  if (!profile) return 20;
  const populationScore = Math.min(100, Math.log10(Math.max(1, profile.population)) * 12);
  return profile.basketballPopularity * 0.72 + populationScore * 0.28;
}

function getTeamCountryAffinity(team: NBATeam, country: string, players: NBAPlayer[]): number {
  const profile = getCountryProfile(country);
  const profileName = profile?.name ?? country;
  return players
    .filter(player => player.tid === team.id && player.status !== 'Retired')
    .reduce((score, player) => {
      const countries = getPlayerNationalityCountries(player);
      const matches = countries.some(value => {
        const playerProfile = getCountryProfile(value);
        return normalize(playerProfile?.name ?? value) === normalize(profileName);
      });
      if (!matches) return score;
      return score + Math.max(1, Math.min(100, player.overallRating || 1));
    }, 0);
}

function getDateForSlot(startDate: string, endDate: string, index: number, slotCount: number): string {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  const fraction = (index + 1) / (Math.max(1, slotCount) + 1);
  return new Date(start + Math.max(0, end - start) * fraction).toISOString().slice(0, 10);
}

export function buildGlobalGameRecommendations(args: {
  teams: NBATeam[];
  players: NBAPlayer[];
  seasonYear: number;
  regularSeasonStart: string;
  regularSeasonEnd: string;
  cities?: GlobalGameCity[];
  limit?: number;
}): GlobalGameRecommendation[] {
  const candidates = (args.cities?.length ? args.cities : DEFAULT_GLOBAL_GAME_CITIES)
    .filter(city => normalize(city.country) !== 'unitedstates' && normalize(city.country) !== 'usa')
    .sort((left, right) => getGlobalCityMarketScore(right) - getGlobalCityMarketScore(left))
    .slice(0, 80);
  const teams = [...args.teams].sort((left, right) => (right.strength ?? 0) - (left.strength ?? 0));
  const usedTeams = new Set<number>();
  const usedCountries = new Set<string>();
  const recommendations: GlobalGameRecommendation[] = [];

  for (const city of candidates) {
    if (recommendations.length >= (args.limit ?? 5)) break;
    const marketScore = getGlobalCityMarketScore(city);
    const rankedTeams = teams
      .filter(team => !usedTeams.has(team.id))
      .map(team => {
        const affinity = getTeamCountryAffinity(team, city.country, args.players);
        return {
          team,
          affinity,
          score: Math.max(0, team.strength ?? 0) * 0.45 + affinity * 0.8 + marketScore * 0.35,
        };
      })
      .sort((left, right) => right.score - left.score);
    if (rankedTeams.length < 2) break;
    if (usedCountries.has(normalize(city.country)) && candidates.length > recommendations.length + 1) continue;

    const [home, away] = rankedTeams;
    usedTeams.add(home.team.id);
    usedTeams.add(away.team.id);
    usedCountries.add(normalize(city.country));
    const nationalPlayerCount = [home, away].filter(entry => entry.affinity > 0).length;
    const matchupStrength = Math.round(((home.team.strength ?? 0) + (away.team.strength ?? 0)) / 2);
    const reasons = [
      `${Math.round(marketScore)} market fit`,
      `${matchupStrength} matchup strength`,
    ];
    if (nationalPlayerCount > 0) reasons.push(`${nationalPlayerCount} roster connection${nationalPlayerCount === 1 ? '' : 's'}`);
    recommendations.push({
      homeTid: home.team.id,
      awayTid: away.team.id,
      city: city.name,
      country: city.country,
      date: getDateForSlot(args.regularSeasonStart, args.regularSeasonEnd, recommendations.length, args.limit ?? 5),
      fit: Math.round((home.score + away.score) / 2),
      marketFit: Math.round(marketScore),
      matchupStrength,
      rosterConnections: nationalPlayerCount,
      reasons,
    });
  }

  return recommendations;
}
