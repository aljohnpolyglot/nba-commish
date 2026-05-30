import { NBAPlayer, NBATeam } from '../../types';
import { buildLiveTeamMap, fallbackLiveTeam, LiveContestTeam, toLivePlayer } from './liveContestTypes';

export const buildSkillsLiveTeams = (players: NBAPlayer[], teams: Array<NBATeam | any>): LiveContestTeam[] => {
  const teamMap = buildLiveTeamMap(teams);
  return players.map(player => ({
    team: teamMap.get(player.tid) ?? fallbackLiveTeam(player.tid),
    players: [toLivePlayer(player)],
  }));
};

export const buildShootingStarsLiveTeams = (players: NBAPlayer[], teams: Array<NBATeam | any>): LiveContestTeam[] => {
  const teamMap = buildLiveTeamMap(teams);
  if (players.length >= 6 && players.length % 3 === 0) {
    return Array.from({ length: Math.floor(players.length / 3) }, (_, index) => {
      const teamPlayers = players.slice(index * 3, index * 3 + 3);
      const anchor = teamPlayers.find(player => player.tid >= 0 && player.tid < 100) ?? teamPlayers[0];
      return {
        team: teamMap.get(anchor?.tid) ?? fallbackLiveTeam(anchor?.tid ?? index, `Team ${String.fromCharCode(65 + index)}`),
        players: teamPlayers.map(toLivePlayer),
      };
    }).filter(team => team.players.length === 3);
  }

  const grouped = new Map<number, NBAPlayer[]>();
  players.forEach(player => {
    if (!grouped.has(player.tid)) grouped.set(player.tid, []);
    grouped.get(player.tid)!.push(player);
  });

  const naturalTeams = Array.from(grouped.entries())
    .filter(([, teamPlayers]) => teamPlayers.length >= 3)
    .map(([tid, teamPlayers]) => ({
      team: teamMap.get(tid) ?? fallbackLiveTeam(tid),
      players: teamPlayers.slice(0, 3).map(toLivePlayer),
    }));

  if (naturalTeams.length >= 2) return naturalTeams;

  const fallbackTeams: LiveContestTeam[] = [];
  for (let index = 0; index < Math.floor(players.length / 3); index++) {
    const teamPlayers = players.slice(index * 3, index * 3 + 3);
    const tid = teamPlayers[0]?.tid ?? index;
    fallbackTeams.push({
      team: teamMap.get(tid) ?? fallbackLiveTeam(tid, `Team ${String.fromCharCode(65 + index)}`),
      players: teamPlayers.map(toLivePlayer),
    });
  }
  return fallbackTeams;
};
