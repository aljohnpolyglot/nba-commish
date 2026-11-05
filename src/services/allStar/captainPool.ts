import type { LeagueStats, NBAPlayer, NBATeam } from '../../types';

const inLeagueHistory = (player: NBAPlayer, teamIds: Set<number>, teamAbbrevs: Set<string>): boolean => (
  teamIds.has(player.tid)
  || (player.stats ?? []).some(row => (
    teamIds.has(Number(row.tid))
    || teamAbbrevs.has(String(row.abbrev ?? '').toUpperCase())
  ))
);

const legacyScore = (player: NBAPlayer): number => {
  const awards = player.awards ?? [];
  const allStars = awards.filter(award => /all[- ]star/i.test(award.type)).length;
  const championships = awards.filter(award => /champion/i.test(award.type)).length;
  const games = (player.stats ?? []).reduce((sum, row) => sum + (Number(row.gp) || 0), 0);
  return allStars * 100_000 + championships * 50_000 + games;
};

const isFormerPlayer = (player: NBAPlayer): boolean => (
  player.hof === true
  || player.status === 'Retired'
  || player.tid === -3
);

export function getLeagueLegendCaptainCandidates(
  players: NBAPlayer[],
  teams: NBATeam[],
  leagueStats: Pick<LeagueStats, 'uiMode' | 'leagueName'>,
): NBAPlayer[] {
  const teamIds = new Set(teams.map(team => team.id));
  const teamAbbrevs = new Set(teams.map(team => team.abbrev.toUpperCase()));
  const wnba = leagueStats.uiMode === 'wnba_isolated';
  return players
    .filter(player => player.hof === true && !player.diedYear && inLeagueHistory(player, teamIds, teamAbbrevs))
    .filter(player => !wnba || player.gender === 'female')
    .sort((left, right) => legacyScore(right) - legacyScore(left) || left.name.localeCompare(right.name));
}

export function resolveLegendCaptains(
  ids: string[] | undefined,
  players: NBAPlayer[],
): NBAPlayer[] {
  const byId = new Map(players.map(player => [player.internalId, player]));
  return (ids ?? []).flatMap(id => {
    const player = byId.get(id);
    return player?.hof && !player.diedYear ? [player] : [];
  }).slice(0, 2);
}

export function getLeagueFormerPlayerCaptainCandidates(
  players: NBAPlayer[],
  teams: NBATeam[],
  leagueStats: Pick<LeagueStats, 'uiMode' | 'leagueName'>,
): NBAPlayer[] {
  const teamIds = new Set(teams.map(team => team.id));
  const teamAbbrevs = new Set(teams.map(team => team.abbrev.toUpperCase()));
  const wnba = leagueStats.uiMode === 'wnba_isolated';
  return players
    .filter(player => isFormerPlayer(player) && !player.diedYear && inLeagueHistory(player, teamIds, teamAbbrevs))
    .filter(player => !wnba || player.gender === 'female')
    .sort((left, right) => legacyScore(right) - legacyScore(left) || left.name.localeCompare(right.name));
}

export function resolveFormerPlayerCaptains(
  ids: string[] | undefined,
  candidates: NBAPlayer[],
): NBAPlayer[] {
  const candidateById = new Map(candidates.map(player => [player.internalId, player]));
  const selected = (ids ?? []).flatMap(id => {
    const player = candidateById.get(id);
    return player ? [player] : [];
  });
  const selectedIds = new Set(selected.map(player => player.internalId));
  return [
    ...selected,
    ...candidates.filter(player => !selectedIds.has(player.internalId)),
  ].slice(0, 2);
}

export function getCaptainTeamName(player: NBAPlayer | undefined, fallback: string): string {
  return getCaptainTeamNameFromFullName(player?.name, 'last_name', fallback);
}

export function getCaptainTeamNameFromFullName(
  name: string | undefined,
  style: 'first_name' | 'last_name',
  fallback: string,
): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const captainName = style === 'first_name' ? parts[0] : parts.at(-1);
  return captainName ? `Team ${captainName}` : fallback;
}
