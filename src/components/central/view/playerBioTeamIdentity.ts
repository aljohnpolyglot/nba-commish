import type { NBAPlayer } from '../../../types';
import { resolveHistoricalCompetitionTeam } from '../../../services/teamIdentity/competitionTeamIdentity';

type BioTeam = {
  id?: number;
  tid?: number;
  name?: string;
  abbrev?: string;
  league?: string;
  conference?: string;
  identitySeasons?: unknown[];
  seasons?: unknown[];
  colors?: string[];
  logoUrl?: string;
  imgURL?: string;
};

const playerDefaultLeagueTag = (player: NBAPlayer): string | undefined => {
  if (player.gender === 'female' || player.status === 'WNBA' || /^wnba[-_:]/i.test(player.internalId)) return 'WNBA';
  if (player.status === 'G-League' || /^gleague[-_:]/i.test(player.internalId)) return 'G-LG';
  if (player.status === 'PBA' || /^pba[-_:]/i.test(player.internalId)) return 'PBA';
  return undefined;
};

const identityKey = (team: BioTeam): string => `${String(team.league ?? team.conference ?? 'NBA').toLowerCase()}:${Number(team.id ?? team.tid ?? -1)}`;

export function resolvePlayerBioPrimaryTeam(
  player: NBAPlayer,
  teams: BioTeam[],
  nonNBATeams: BioTeam[],
  teamArchive: BioTeam[],
  currentYear: number,
  preloadedTeams: BioTeam[] = [],
): BioTeam | null {
  const allTeams = [...teams, ...teamArchive, ...nonNBATeams, ...preloadedTeams];
  const defaultLeagueTag = playerDefaultLeagueTag(player);
  if (player.tid >= 0 && !['Retired', 'Free Agent'].includes(String(player.status ?? ''))) {
    const currentNbaTeam = player.tid < 100
      ? teams.find(team => Number(team.id ?? team.tid) === player.tid)
      : undefined;
    if (currentNbaTeam) return currentNbaTeam;
    const current = resolveHistoricalCompetitionTeam({
      teams: allTeams,
      tid: player.tid,
      season: currentYear,
      competitionId: player.status,
      defaultLeagueTag,
    });
    if (current) return current;
  }

  const totals = new Map<string, { team: BioTeam; gp: number }>();
  for (const stat of player.stats ?? []) {
    if (stat.playoffs) continue;
    const raw = stat as typeof stat & Record<string, unknown>;
    const team = resolveHistoricalCompetitionTeam({
      teams: allTeams,
      tid: Number(stat.tid ?? -1),
      season: Number(stat.season ?? currentYear),
      teamAbbrev: raw.abbrev ?? raw.teamAbbrev ?? raw.tm,
      competitionId: stat.competitionId,
      defaultLeagueTag,
    });
    if (!team) continue;
    const key = identityKey(team);
    const previous = totals.get(key);
    totals.set(key, { team, gp: (previous?.gp ?? 0) + Math.max(0, Number(stat.gp ?? 0)) });
  }
  return [...totals.values()].sort((left, right) => right.gp - left.gp)[0]?.team ?? null;
}
