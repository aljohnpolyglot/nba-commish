import type { NBAPlayer, NBATeam } from '../../../types';
import { mergePlayerCareer } from '../../../utils/playerCareerMerge';
import { sameCanonicalPlayerIdentity } from '../../../utils/playerIdentity';
import { isFranchiseStatRow } from './teamHistoryRanking';

export function getFranchiseTeamAbbrevs(team: NBATeam): Set<string> {
  return new Set([
    team.abbrev,
    ...(((team as any).identitySeasons ?? []) as Array<{ abbrev?: string }>).map(row => row.abbrev),
    ...(((team as any).seasons ?? []) as Array<{ abbrev?: string }>).map(row => row.abbrev),
  ].map(value => String(value ?? '').trim().toUpperCase()).filter(Boolean));
}

const isRosterStat = (
  player: NBAPlayer,
  team: NBATeam,
  season: number,
  aliases: ReadonlySet<string>,
): boolean => (player.stats ?? []).some(row =>
  Number(row.season) === season
  && !row.playoffs
  && Number(row.gp ?? 0) > 0
  && isFranchiseStatRow(row, team.id, aliases),
);

const sourceHistoryThrough = (player: NBAPlayer, cutoff: number): NBAPlayer => ({
  ...player,
  stats: (player.stats ?? []).filter(row => Number(row.season) <= cutoff),
  ratings: (player.ratings ?? []).filter(row => Number(row.season ?? 0) <= cutoff),
  salaries: (player.salaries ?? []).filter(row => Number(row.season) <= cutoff),
  awards: (player.awards ?? []).filter(row => Number(row.season) <= cutoff),
  contractYears: (player.contractYears ?? []).filter(row => {
    const start = Number(String(row.season ?? '').slice(0, 4));
    return Number.isFinite(start) && start + 1 <= cutoff;
  }),
});

export function buildHistoricalTeamRoster(args: {
  savedPlayers: NBAPlayer[];
  sourcePlayers: NBAPlayer[];
  team: NBATeam;
  season: number;
  sourceCutoff: number;
}): NBAPlayer[] {
  const { savedPlayers, sourcePlayers, team, season, sourceCutoff } = args;
  const aliases = getFranchiseTeamAbbrevs(team);
  const roster = savedPlayers.filter(player => isRosterStat(player, team, season, aliases));
  if (season > sourceCutoff) return roster;

  for (const rawSource of sourcePlayers) {
    if (!isRosterStat(rawSource, team, season, aliases)) continue;
    const saved = savedPlayers.find(player => sameCanonicalPlayerIdentity(player, rawSource));
    const candidate = saved
      ? mergePlayerCareer(saved, sourceHistoryThrough(rawSource, sourceCutoff))
      : sourceHistoryThrough(rawSource, sourceCutoff);
    const existingIndex = roster.findIndex(player => sameCanonicalPlayerIdentity(player, candidate));
    if (existingIndex >= 0) roster[existingIndex] = candidate;
    else roster.push(candidate);
  }
  return roster;
}

export function getHistoricalTeamRosterSeasons(args: {
  savedPlayers: NBAPlayer[];
  sourcePlayers: NBAPlayer[];
  team: NBATeam;
  currentSeason: number;
  sourceCutoff: number;
}): number[] {
  const { savedPlayers, sourcePlayers, team, currentSeason, sourceCutoff } = args;
  const aliases = getFranchiseTeamAbbrevs(team);
  const seasons = new Set<number>([currentSeason]);
  const collect = (player: NBAPlayer, maxSeason: number) => {
    for (const row of player.stats ?? []) {
      const season = Number(row.season);
      if (
        season > 0
        && season <= maxSeason
        && !row.playoffs
        && Number(row.gp ?? 0) > 0
        && isFranchiseStatRow(row, team.id, aliases)
      ) seasons.add(season);
    }
  };
  savedPlayers.forEach(player => collect(player, currentSeason));
  sourcePlayers.forEach(player => collect(player, sourceCutoff));
  return [...seasons].sort((left, right) => right - left);
}
