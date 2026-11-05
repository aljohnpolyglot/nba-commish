import type { NBAPlayer } from '../types';

type ChemistryTeam = {
  id?: number;
  tid?: number;
  teamChemistry?: number;
  seasons?: Array<{ season: number; won?: number; lost?: number; wins?: number; losses?: number }>;
};

function teamId(team: ChemistryTeam): number {
  return Number(team.id ?? team.tid);
}

function stableOffset(id: number, season: number): number {
  const hash = Math.abs(Math.imul(id + 37, 1103515245) ^ Math.imul(season, 2654435761));
  return (hash % 9) - 4;
}

export function estimateOpeningTeamChemistry(
  team: ChemistryTeam,
  players: NBAPlayer[],
  season: number,
): number {
  const id = teamId(team);
  const roster = players.filter(player => player.tid === id && player.status !== 'Retired');
  const priorSeason = season - 1;
  const returning = roster.filter(player => (player.stats ?? []).some(stat => (
    stat.season === priorSeason && stat.tid === id && !stat.playoffs && (stat.gp ?? 0) > 0
  ))).length;
  const continuity = roster.length > 0 ? returning / roster.length : 0.35;
  const lastSeason = [...(team.seasons ?? [])]
    .filter(row => Number(row.season) < season)
    .sort((left, right) => Number(right.season) - Number(left.season))[0];
  const wins = Number(lastSeason?.won ?? lastSeason?.wins ?? 0);
  const losses = Number(lastSeason?.lost ?? lastSeason?.losses ?? 0);
  const winPct = wins + losses > 0 ? wins / (wins + losses) : 0.5;
  const value = 42 + continuity * 28 + (winPct - 0.5) * 18 + stableOffset(id, season);
  return Number(Math.max(35, Math.min(82, value)).toFixed(1));
}

export function seedOpeningTeamChemistry<T extends ChemistryTeam>(
  teams: T[],
  players: NBAPlayer[],
  season: number,
): T[] {
  return teams.map(team => Number.isFinite(Number(team.teamChemistry))
    ? team
    : { ...team, teamChemistry: estimateOpeningTeamChemistry(team, players, season) });
}
