import type { LeagueStats, NBAPlayer, NBATeam } from '../../types';
import { getDisplayAge, getDisplayOverall } from '../../store/playerRatingStore';
import { computeMoodScore, normalizeMoodTraits } from '../../utils/mood/moodScore';
import { effectiveRecord, hasBirdRights } from '../../utils/salaryUtils';
import { getCurrentTeamRegularSeasonYears } from '../../utils/playerTenure';

const EXTERNAL_STATUSES = new Set([
  'WNBA',
  'Euroleague',
  'PBA',
  'B-League',
  'G-League',
  'Endesa',
  'China CBA',
  'NBL Australia',
  'Draft Prospect',
  'Prospect',
]);

function isExpiring(player: NBAPlayer, currentYear: number): boolean {
  return (player.contract?.exp ?? currentYear + 5) <= currentYear;
}

function teamWinPct(team: NBATeam | undefined, currentYear: number): number {
  if (!team) return 0.5;
  const rec = effectiveRecord(team, currentYear);
  const games = rec.wins + rec.losses;
  return games > 0 ? rec.wins / games : 0.5;
}

export function isCredibleResignExpiring(input: {
  player: NBAPlayer;
  team?: NBATeam;
  teamPlayers: NBAPlayer[];
  currentYear: number;
  date?: string;
  leagueStats?: LeagueStats;
}): boolean {
  const { player, team, teamPlayers, currentYear, date, leagueStats } = input;
  if (!isExpiring(player, currentYear)) return false;
  if (player.tid < 0 || player.status === 'Free Agent') return false;
  if (EXTERNAL_STATUSES.has(player.status ?? '')) return false;
  if ((player as any).farewellTour) return false;

  const traits = normalizeMoodTraits((player as any).moodTraits ?? []);
  const mood = computeMoodScore(player, team, date ?? String(currentYear), false, false, false, teamPlayers, currentYear).score;
  if (mood <= -3) return false;

  const traitsAny = traits as any[];
  const loyal = traitsAny.includes('LOYAL') || traitsAny.includes('LOYALTY');
  const mercenary = traitsAny.includes('MERCENARY') || traitsAny.includes('$');
  const winner = traitsAny.includes('COMPETITOR') || traitsAny.includes('WINNER');
  const birdRightsActive = leagueStats?.birdRightsEnabled !== false;
  const bird = birdRightsActive && hasBirdRights(player);
  const tenure = getCurrentTeamRegularSeasonYears(player);
  const winPct = teamWinPct(team, currentYear);

  if (winner && winPct < 0.42 && !loyal) return false;
  if (mercenary && mood < 6 && !bird) return false;

  let score = 50;
  if (mood >= 5) score += 20;
  else if (mood >= 3) score += 12;
  else if (mood >= 1) score += 5;
  else if (mood <= -1) score -= 5;

  if (loyal) score += 18;
  if (mercenary) score -= 16;
  if (bird) score += 8;
  if (tenure >= 5) score += 7;
  else if (tenure >= 3) score += 3;
  if (winner && winPct > 0.58) score += 10;
  if (winPct >= 0.62) score += 8;
  else if (winPct <= 0.35) score -= 8;

  const age = getDisplayAge(player, currentYear);
  if (age >= 34) score += 7;
  else if (age < 24) score -= 4;
  if (getDisplayOverall(player, currentYear) >= 88 && !bird && !loyal) score -= 10;

  return score >= 65 || (loyal && mood >= 3) || (mood >= 6 && (bird || tenure >= 3));
}

export function buildCredibleResignExpiringIds(input: {
  players: NBAPlayer[];
  teams: NBATeam[];
  currentYear: number;
  date?: string;
  leagueStats?: LeagueStats;
}): Set<string> {
  const { players, teams, currentYear, date, leagueStats } = input;
  const teamsById = new Map(teams.map(team => [team.id, team]));
  const byTid = new Map<number, NBAPlayer[]>();
  for (const player of players) {
    if (player.tid < 0) continue;
    const current = byTid.get(player.tid) ?? [];
    current.push(player);
    byTid.set(player.tid, current);
  }

  const ids = new Set<string>();
  for (const player of players) {
    if (!isCredibleResignExpiring({
      player,
      team: teamsById.get(player.tid),
      teamPlayers: byTid.get(player.tid) ?? [],
      currentYear,
      date,
      leagueStats,
    })) continue;
    ids.add(player.internalId);
  }
  return ids;
}
