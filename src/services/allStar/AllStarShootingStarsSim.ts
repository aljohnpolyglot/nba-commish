import { NBAPlayer } from '../../types';

export interface ShootingStarsTeam {
  teamId: string;
  label: string;
  playerIds: string[];
  playerNames: string[];
  timeSec: number;
}

export interface ShootingStarsResult {
  teams: ShootingStarsTeam[];
  winnerTeamId: string;
  winnerLabel: string;
  log: string[];
}

const ratingOf = (p: NBAPlayer, key: 'tp' | 'fg' | 'spd'): number => {
  const r = p.ratings?.[p.ratings.length - 1] as any;
  return (r?.[key] ?? 50);
};

export class AllStarShootingStarsSim {
  static selectContestants(players: NBAPlayer[], season: number, totalPlayers: number): NBAPlayer[] {
    const eligible = players.filter(p => p.stats?.some(s => s.season === season && !s.playoffs && (s.gp ?? 0) > 0));
    return eligible
      .sort((a, b) => ratingOf(b, 'tp') + ratingOf(b, 'fg') - ratingOf(a, 'tp') - ratingOf(a, 'fg'))
      .slice(0, totalPlayers);
  }

  static simulate(contestants: NBAPlayer[], teamCount: number, playersPerTeam: number): ShootingStarsResult {
    const log: string[] = ['Welcome to the Shooting Stars Challenge!'];

    const teams: ShootingStarsTeam[] = [];
    for (let i = 0; i < teamCount; i++) {
      const teamPlayers = contestants.slice(i * playersPerTeam, (i + 1) * playersPerTeam);
      if (teamPlayers.length === 0) continue;
      // Each player attempts 1 shot from progressive distance. Time = sum of attempts
      // until all six (mid → 3PT → halfcourt) drop. Higher tp/fg → faster.
      let teamTime = 0;
      for (const p of teamPlayers) {
        const skill = (ratingOf(p, 'tp') + ratingOf(p, 'fg')) / 2;
        const baseAttempts = 6;
        const skillFactor = Math.max(0.4, 1 - skill / 130); // top shooters: 0.35 multiplier
        const noise = 0.7 + Math.random() * 0.6;
        teamTime += baseAttempts * 4.5 * skillFactor * noise; // ~10-30 sec/player
      }
      teamTime = Math.round(teamTime * 10) / 10;
      const label = `Team ${String.fromCharCode(65 + i)}`;
      teams.push({
        teamId: `ss-team-${i}`,
        label,
        playerIds: teamPlayers.map(p => p.internalId),
        playerNames: teamPlayers.map(p => p.name),
        timeSec: teamTime,
      });
      log.push(`${label} (${teamPlayers.map(p => p.name).join(', ')}) finishes in ${teamTime}s.`);
    }

    teams.sort((a, b) => a.timeSec - b.timeSec);
    const winner = teams[0];
    log.push(`${winner.label} wins the Shooting Stars Challenge with a time of ${winner.timeSec}s!`);

    return { teams, winnerTeamId: winner.teamId, winnerLabel: winner.label, log };
  }
}
