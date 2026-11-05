const playerIds: Record<string, string> = {
  'Kyle Filipowski': '1642275',
  'Josh Christopher': '1630528',
  'Jalen Wilson': '1631113',
  'Isaiah Mobley': '1631215',
  'Cam Whitmore': '1641715',
  'Trendon Watford': '1630570',
  'Keegan Murray': '1631099',
  'Louis King': '1629663',
  'Davion Mitchell': '1630558',
  'Cam Thomas': '1630560',
  'Brandon Clarke': '1629634',
  'K. J. McDaniels': '203909',
  'Josh Hart': '1628404',
  'Kyle Kuzma': '1628398',
  'Lonzo Ball': '1628366',
  'Jerian Grant': '1626170',
  'Tyus Jones': '1626145',
  'Jonathon Simmons': '1626154',
  'Kyle Anderson': '203932',
  'Ray McCallum Jr.': '203492',
  'Glen Rice Jr.': '203503',
  'Ian Clark': '203546',
  'Jonas Valančiūnas': '202685',
  'Damian Lillard': '203081',
  'Josh Selby': '202720',
  'John Wall': '202322',
  'Blake Griffin': '201933',
  'Jerryd Bayless': '201573',
  'Nate Robinson': '101126',
  'Randy Foye': '200751',
};

export const getPlayerPortraitUrl = (playerName: string) => {
  const id = playerIds[playerName];
  if (id) {
    return `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(playerName)}&background=f1f5f9&color=64748b`;
};

export function getSummerLeaguePortraitCandidates(
  playerName: string,
  playerImage?: string,
  sourceImage?: string,
): { primary?: string; fallback: string } {
  const primary = playerImage || sourceImage;
  const fallback = sourceImage && sourceImage !== primary
    ? sourceImage
    : getPlayerPortraitUrl(playerName);
  return { primary, fallback };
}

export function resolveSummerLeaguePlayerTeamIdentity(
  player: Pick<NBAPlayer, 'tid' | 'status'>,
  teams: NBATeam[],
  nonNBATeams: NonNBATeam[],
  season: number,
): { abbrev: string; logoUrl?: string; isUnaffiliated: boolean } {
  const team = Number(player.tid) >= 0
    ? resolveAnyTeam(Number(player.tid), teams, nonNBATeams)
    : null;
  if (!team) return { abbrev: 'FA', isUnaffiliated: true };
  return {
    abbrev: team.abbrev,
    logoUrl: team.logoUrl || getResolvedTeamLogoUrl(team, season) || undefined,
    isUnaffiliated: false,
  };
}
import type { NBAPlayer, NBATeam, NonNBATeam } from '../../types';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
