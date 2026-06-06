import { ENDESA_TEAM_COUNTRY, EUROLEAGUE_TEAM_COUNTRIES } from '../constants';
import type { GameState, NBATeam } from '../types';

export function getTeamCountry(team: NBATeam | null | undefined, state: Pick<GameState, 'nonNBATeams'>): string {
  if (!team) return '';
  const tid = team.id;
  if (tid >= 5000 && tid < 6000) return ENDESA_TEAM_COUNTRY;
  if (tid >= 1000 && tid < 2000) return EUROLEAGUE_TEAM_COUNTRIES[tid] ?? '';
  if (tid >= 2000 && tid < 3000) return 'Philippines';
  if (tid >= 0 && tid < 100) return 'USA';
  const nonNBA = state.nonNBATeams?.find(t => t.tid === tid);
  if (!nonNBA) return '';
  if (nonNBA.league === 'Endesa') return ENDESA_TEAM_COUNTRY;
  if (nonNBA.league === 'Euroleague') return EUROLEAGUE_TEAM_COUNTRIES[tid] ?? '';
  if (nonNBA.league === 'PBA') return 'Philippines';
  return '';
}
