import { ENDESA_TEAM_COUNTRY, EUROLEAGUE_TEAM_COUNTRIES } from '../constants';
import { EURO_BASKETBALL_SOURCE_ARCHIVES } from '../data/euroBasketballSources';
import { findEuroCountryProfile } from '../services/euroScouting/countryProfiles';
import type { GameState, NBATeam, NonNBATeam } from '../types';

export function getTeamCountry(team: NBATeam | NonNBATeam | null | undefined, state: Pick<GameState, 'nonNBATeams'>): string {
  if (!team) return '';
  const tid = Number('tid' in team ? team.tid : team.id);
  const explicitCountry = String((team as (NBATeam | NonNBATeam) & { country?: string }).country ?? '').trim();
  if (explicitCountry) return findEuroCountryProfile(explicitCountry)?.name ?? explicitCountry;
  if (tid >= 5000 && tid < 6000) return ENDESA_TEAM_COUNTRY;
  if (tid >= 1000 && tid < 2000) return EUROLEAGUE_TEAM_COUNTRIES[tid] ?? '';
  if (tid >= 2000 && tid < 3000) return 'Philippines';
  if (tid >= 0 && tid < 100) return 'USA';
  const nonNBA = 'league' in team ? team : state.nonNBATeams?.find(t => t.tid === tid);
  if (!nonNBA) return '';
  if (nonNBA.league === 'Endesa') return ENDESA_TEAM_COUNTRY;
  if (nonNBA.league === 'Euroleague') return EUROLEAGUE_TEAM_COUNTRIES[tid] ?? '';
  if (nonNBA.league === 'PBA') return 'Philippines';
  const source = EURO_BASKETBALL_SOURCE_ARCHIVES.find(entry => entry.leagueStatus === nonNBA.league);
  if (source?.countryCode) return findEuroCountryProfile(source.countryCode)?.name ?? source.countryCode;
  const regionProfile = findEuroCountryProfile(nonNBA.region);
  if (regionProfile) return regionProfile.name;
  return '';
}
