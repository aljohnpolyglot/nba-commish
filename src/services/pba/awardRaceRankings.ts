import type { NBAGMStat, NBAPlayer, NBATeam } from '../../types';

export interface PbaConferenceCandidate {
  player: NBAPlayer;
  team: NBATeam;
  stats: NBAGMStat;
  score: number;
  odds?: string;
}

export const PBA_AWARD_RACE_CANDIDATE_LIMIT = 10;

export function limitPbaAwardRaceCandidates<T>(candidates: T[]): T[] {
  return candidates.slice(0, PBA_AWARD_RACE_CANDIDATE_LIMIT);
}

const rebounds = (stats: NBAGMStat): number =>
  Number(stats.trb ?? (stats as NBAGMStat & { reb?: number }).reb ?? ((stats.orb ?? 0) + (stats.drb ?? 0)));

export function rankPbaConferenceCandidates(
  players: NBAPlayer[],
  teams: NBATeam[],
  season: number,
): PbaConferenceCandidate[] {
  return players
    .map(player => {
      const stats = player.stats?.find(row => Number(row.season) === Number(season) && !row.playoffs && (row.gp ?? 0) > 0);
      const team = teams.find(entry => Number(entry.id) === Number(player.tid));
      if (!stats?.gp || !team) return null;
      const ppg = Number(stats.pts ?? 0) / stats.gp;
      const rpg = rebounds(stats) / stats.gp;
      const apg = Number(stats.ast ?? 0) / stats.gp;
      const games = Number(team.wins ?? 0) + Number(team.losses ?? 0);
      const winPct = games > 0 ? Number(team.wins ?? 0) / games : 0.5;
      return {
        player,
        team,
        stats,
        score: (ppg * 1.1 + rpg * 0.35 + apg * 0.35) * (0.75 + winPct * 0.5),
      };
    })
    .filter((entry): entry is PbaConferenceCandidate => entry !== null)
    .sort((a, b) => b.score - a.score);
}
