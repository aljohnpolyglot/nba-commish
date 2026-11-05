import { calcEFG, calcTS } from './StatGenerator/advancedstatsHelpers';
import type { GameHeaveEvent, PlayerGameStats } from './types';

type PlayerStatWithAdvanced = PlayerGameStats & {
  tsPct?: number;
  efgPct?: number;
};

function weightedPick(
  stats: PlayerStatWithAdvanced[],
  weight: (stat: PlayerStatWithAdvanced) => number,
): PlayerStatWithAdvanced | undefined {
  const total = stats.reduce((sum, stat) => sum + Math.max(0, weight(stat)), 0);
  if (total <= 0) return undefined;
  let roll = Math.random() * total;
  for (const stat of stats) {
    roll -= Math.max(0, weight(stat));
    if (roll <= 0) return stat;
  }
  return stats[stats.length - 1];
}

function removeProtectedMiss(stat: PlayerStatWithAdvanced): void {
  stat.fga = Math.max(stat.fgm, stat.fga - 1);
  stat.threePa = Math.max(stat.threePm, stat.threePa - 1);
  stat.gameScore += 0.7;
  stat.tsPct = calcTS(stat.pts, stat.fga, stat.fta);
  stat.efgPct = calcEFG(stat.fgm, stat.threePm, stat.fga, stat.fourPm ?? 0);
}

export function generateHeaveEvents(
  homeStats: PlayerGameStats[],
  awayStats: PlayerGameStats[],
  homeTeamId: number,
  awayTeamId: number,
  regulationPeriods: number,
  protectMisses: boolean,
): GameHeaveEvent[] {
  const events: GameHeaveEvent[] = [];
  const teams = [
    { teamId: homeTeamId, stats: homeStats as PlayerStatWithAdvanced[] },
    { teamId: awayTeamId, stats: awayStats as PlayerStatWithAdvanced[] },
  ];
  const periodChance = protectMisses ? 0.24 : 0.12;

  for (let quarter = 1; quarter < regulationPeriods; quarter++) {
    if (Math.random() >= periodChance) continue;
    const preferred = Math.random() < 0.5 ? teams : [teams[1], teams[0]];
    let selectedTeam = preferred[0];
    let missCandidates = selectedTeam.stats.filter(
      stat => stat.min > 0 && stat.threePa - stat.threePm > 0,
    );
    if (missCandidates.length === 0) {
      selectedTeam = preferred[1];
      missCandidates = selectedTeam.stats.filter(
        stat => stat.min > 0 && stat.threePa - stat.threePm > 0,
      );
    }

    const madeCandidates = selectedTeam.stats.filter(stat => stat.min > 0 && stat.threePm > 0);
    const made = madeCandidates.length > 0 && Math.random() < 0.007;
    const player = made
      ? weightedPick(madeCandidates, stat => stat.threePm)
      : weightedPick(missCandidates, stat => stat.threePa - stat.threePm);
    if (!player) continue;

    const protectedFromIndividualStats = protectMisses && !made;
    if (protectedFromIndividualStats) removeProtectedMiss(player);
    events.push({
      teamId: selectedTeam.teamId,
      playerId: player.playerId,
      playerName: player.name,
      quarter,
      made,
      protectedFromIndividualStats,
      distanceFeet: 36 + Math.floor(Math.random() * 19),
      startedInBackcourt: true,
    });
  }

  return events;
}
