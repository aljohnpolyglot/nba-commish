import type { NBAPlayer } from '../types';
import { projectCanonicalPlayerBiography } from '../services/playerUniverse/realGmBiographyContinuity';
import { getLastAttendedSchool } from './educationUtils';
import { getTeamFullName, type TeamLike } from './teamNames';
import { getHistoricalProspectSourceClub } from '../data/historicalProspectClubSources';

export interface ProspectPreDraftClub {
  name: string;
  tid?: number;
  logoUrl?: string;
  colors?: string[];
  competitionId?: string;
  season: number;
}

interface ProspectClubStat {
  season?: number;
  tid?: number;
  gp?: number;
  playoffs?: boolean;
  competitionId?: string;
  league?: string;
  teamName?: string;
  teamLogoUrl?: string;
}

export function getProspectPreDraftClub(
  player: NBAPlayer,
  options: {
    currentSeason: number;
    completedThrough: number;
    teams?: readonly TeamLike[];
  },
): ProspectPreDraftClub | null {
  const direct = player.preDraftClub;
  if (
    direct?.name
    && Number.isFinite(Number(direct.season))
    && Number(direct.season) <= options.currentSeason
  ) return direct;

  const draftYear = Number(player.draft?.year ?? Number.POSITIVE_INFINITY);
  const rows = (player.stats ?? []) as ProspectClubStat[];
  const latest = rows
    .filter(row =>
      row.playoffs !== true
      && Number(row.gp ?? 0) > 0
      && Number.isFinite(Number(row.season))
      && Number(row.season) <= options.completedThrough
      && Number(row.season) <= draftYear
      && (
        Boolean(String(row.teamName ?? '').trim())
        || Boolean(options.teams?.some(team => (team.tid ?? team.id) === row.tid))
      ),
    )
    .sort((left, right) =>
      Number(right.season ?? 0) - Number(left.season ?? 0)
      || Number(right.gp ?? 0) - Number(left.gp ?? 0),
    )[0];
  if (!latest) return getHistoricalProspectSourceClub(player.internalId, player.born?.year, options.completedThrough) ?? null;

  const team = options.teams?.find(candidate => (candidate.tid ?? candidate.id) === latest.tid);
  const name = String(latest.teamName ?? '').trim() || getTeamFullName(team);
  if (!name) return null;
  return {
    name,
    tid: latest.tid,
    logoUrl: latest.teamLogoUrl,
    competitionId: latest.competitionId,
    season: Number(latest.season),
  };
}

export function getProspectCollege(player: NBAPlayer): string | null {
  const projected = projectCanonicalPlayerBiography(player);
  const college = projected.college;
  if (typeof college === 'string' && college.trim()) return getLastAttendedSchool(college);

  const preDraftRaw = (projected as NBAPlayer & { pre_draft?: unknown }).pre_draft;
  if (typeof preDraftRaw === 'string' && preDraftRaw.trim()) return getLastAttendedSchool(preDraftRaw);

  return null;
}

export function isFutureDraftClassPlayer(player: NBAPlayer, currentYear: number): boolean {
  const draftYear = Number((player as any).draft?.year ?? 0);
  return Number.isFinite(draftYear) && draftYear > currentYear;
}

export function isInternationalTournamentOnlyPlayer(player: Pick<NBAPlayer, 'internalId' | 'internationalTournamentOnly'>): boolean {
  return player.internationalTournamentOnly === true || String(player.internalId).startsWith('fiba-fa:');
}

export function isUnavailableInternationalTournamentPlayer(
  player: Pick<NBAPlayer, 'internalId' | 'internationalTournamentOnly' | 'tid' | 'status'>,
): boolean {
  return isInternationalTournamentOnlyPlayer(player)
    && !(player.tid === -1 && player.status === 'Free Agent');
}

export function isDraftProspectLike(player: NBAPlayer, currentYear: number): boolean {
  if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') {
    return true;
  }
  if (player.tid === -1 || player.status === 'Free Agent') return false;

  const draftYear = Number((player as any).draft?.year ?? 0);
  const college = getProspectCollege(player);
  const age = (player as any).born?.year
    ? currentYear - (player as any).born.year
    : (player.age ?? 99);
  const regularSeasonGames = (player.stats ?? []).reduce(
    (sum, stat) => sum + (!stat.playoffs ? (stat.gp ?? 0) : 0),
    0,
  );

  return !!college && draftYear > currentYear && regularSeasonGames === 0 && age <= 23;
}
