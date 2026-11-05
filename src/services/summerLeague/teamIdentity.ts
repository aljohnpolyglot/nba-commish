import type { NBATeam } from '../../types';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';

const TEAM_NAME_ALIASES: Record<string, string> = {
  'philadelphia sixers': 'Philadelphia 76ers',
  'philadelphia 76ers': 'Philadelphia 76ers',
  'la clippers': 'Los Angeles Clippers',
  'la lakers': 'Los Angeles Lakers',
  'portland trailblazers': 'Portland Trail Blazers',
};

function key(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canonicalSummerLeagueTeamName(value: unknown): string {
  const raw = String(value ?? '').trim().replace(/^#\d+\s+/, '');
  return TEAM_NAME_ALIASES[key(raw)] ?? raw;
}

export function resolveSummerLeagueTeam(
  teams: readonly NBATeam[],
  name: string,
  year: number,
  abbrev?: string,
): NBATeam | undefined {
  const targetName = key(canonicalSummerLeagueTeamName(name));
  const targetAbbrev = key(abbrev);
  return teams.find(team => {
    const snapshot = getHistoricalTeamSnapshot(team, year) as NBATeam;
    const names = [
      getTeamFullName(snapshot),
      getTeamFullName(team),
      snapshot.name,
      team.name,
    ].map(canonicalSummerLeagueTeamName).map(key);
    return names.includes(targetName)
      || (!!targetAbbrev && [snapshot.abbrev, team.abbrev].map(key).includes(targetAbbrev));
  });
}

export function getSummerLeagueTeamLogo(
  teams: readonly NBATeam[],
  name: string,
  year: number,
  abbrev?: string,
): string {
  const team = resolveSummerLeagueTeam(teams, name, year, abbrev);
  return team ? String(getHistoricalTeamSnapshot(team, year).logoUrl ?? '') : '';
}
