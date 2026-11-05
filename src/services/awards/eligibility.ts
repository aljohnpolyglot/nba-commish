/**
 * Eligibility predicates — reusable across awards.
 * Each returns true if the player CAN be considered for the award.
 */
import type { NBAPlayer, NBAGMStat, NBATeam } from '../../types';
import type { EligibilityKey, UIMode } from './types';

export function getRookieDraftSeason(season: number, uiMode: UIMode = 'nba'): number {
  return uiMode === 'wnba_isolated' || uiMode === 'pba_isolated' ? season : season - 1;
}

export function isRookieForSeason(player: NBAPlayer, season: number, uiMode: UIMode = 'nba'): boolean {
  if (uiMode === 'nba' && Number(player.nbaRookieSeason) === season) return true;
  return player.draft?.year === getRookieDraftSeason(season, uiMode);
}

function playerAge(p: NBAPlayer, season: number): number {
  const born = (p as any).born?.year;
  if (born && season) return season - born;
  return (p as any).age ?? 25;
}

function isProportionallyEligible(
  stat: NBAGMStat,
  team: NBATeam,
  minPerSeason: number,
  fullSeasonRef: number,
): boolean {
  const teamGames = (team.wins ?? 0) + (team.losses ?? 0);
  if (teamGames === 0) return stat.gp >= 1;
  if (teamGames >= fullSeasonRef) return stat.gp >= minPerSeason;
  const threshold = teamGames * (minPerSeason / fullSeasonRef);
  return stat.gp >= threshold;
}

export function checkEligibility(
  keys: EligibilityKey[],
  player: NBAPlayer,
  stat: NBAGMStat | undefined,
  team: NBATeam | undefined,
  season: number,
  minGames: number,
  fullSeasonRef = 82,
  uiMode: UIMode = 'nba',
): boolean {
  if (!stat || !team) return false;
  for (const k of keys) {
    switch (k) {
      case 'min-games':
        if (!isProportionallyEligible(stat, team, minGames, fullSeasonRef)) return false;
        break;
      case 'rookie-year':
        if (!isRookieForSeason(player, season, uiMode)) return false;
        break;
      case 'under-22':
        if (playerAge(player, season) >= 22) return false;
        break;
      case 'under-23':
        if (playerAge(player, season) >= 23) return false;
        break;
      case 'bench-role':
        if ((stat.gs ?? 0) > (stat.gp ?? 0) / 2) return false;
        break;
      case 'pos-G': {
        const pos = (player.ratings?.[player.ratings.length - 1] as any)?.pos ?? player.pos ?? '';
        if (!/^(PG|SG|G)/i.test(pos)) return false;
        break;
      }
      case 'pos-F': {
        const pos = (player.ratings?.[player.ratings.length - 1] as any)?.pos ?? player.pos ?? '';
        if (!/^(SF|PF|F)/i.test(pos)) return false;
        break;
      }
      case 'pos-C': {
        const pos = (player.ratings?.[player.ratings.length - 1] as any)?.pos ?? player.pos ?? '';
        if (!/^C/i.test(pos)) return false;
        break;
      }
    }
  }
  return true;
}

export { playerAge };
