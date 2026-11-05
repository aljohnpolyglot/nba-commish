import type { Game } from '../../../types';
import type { CupCompetitionState, CupCompetitionStateMap } from './types';
import type { CompetitionDate } from '../types';

const dayDistance = (left: string, right: Date): number => Math.abs(new Date(left).getTime() - right.getTime());

const competitionYear = (season: number, date: CompetitionDate): number => (
  season + (Number.isFinite(date.yearOffset) ? Number(date.yearOffset) : date.month < 10 ? 0 : -1)
);

export function tagExistingCupGroupGames(
  schedule: Game[],
  cup: CupCompetitionState,
): Game[] {
  const used = new Set<number>();
  const patch = new Map<number, Partial<Game>>();
  for (const assignment of cup.groups) {
    const spec = cup.format.groups.find(group => group.id === assignment.groupId);
    const dates = cup.format.groupStage.dates.map(date => new Date(Date.UTC(
      competitionYear(cup.season, date),
      date.month - 1,
      date.day,
    )));
    const preferred = dates[Math.floor(dates.length / 2)] ?? new Date(Date.UTC(cup.season, 5, 1));
    const pairs = assignment.tids.flatMap((homeTid, leftIndex) => (
      assignment.tids.slice(leftIndex + 1).map(awayTid => ({ homeTid, awayTid }))
    ));
    const gamesPerTeam = spec?.gamesPerTeam ?? cup.format.groupStage.gamesPerTeam;
    const pairLimit = Math.floor((assignment.tids.length * gamesPerTeam) / 2);
    for (const pair of pairs.slice(0, pairLimit)) {
      const candidate = schedule
        .filter(game => !used.has(game.gid)
          && !game.played
          && !game.isPreseason
          && !game.isPlayoff
          && !game.isPlayIn
          && !game.isNBACup
          && !game.isCupGame
          && ((game.homeTid === pair.homeTid && game.awayTid === pair.awayTid)
            || (game.homeTid === pair.awayTid && game.awayTid === pair.homeTid)))
        .sort((left, right) => dayDistance(left.date, preferred) - dayDistance(right.date, preferred))[0];
      if (!candidate) continue;
      used.add(candidate.gid);
      patch.set(candidate.gid, {
        isCupGame: true,
        cupLeagueId: cup.leagueId,
        cupCompetitionId: cup.competitionId,
        cupGroupId: assignment.groupId,
        cupRoundId: 'group',
      });
    }
  }
  return patch.size === 0
    ? schedule
    : schedule.map(game => patch.has(game.gid) ? { ...game, ...patch.get(game.gid) } : game);
}

export function tagScheduledCupGroupGames(
  schedule: Game[],
  states: CupCompetitionStateMap | undefined,
  season?: number,
): Game[] {
  return Object.values(states ?? {})
    .filter(cup => cup.format.enabled && cup.status !== 'complete' && (season == null || cup.season === season))
    .reduce((current, cup) => tagExistingCupGroupGames(current, cup), schedule);
}

export function cupRoundDate(cup: CupCompetitionState, date: CompetitionDate): string {
  return new Date(Date.UTC(competitionYear(cup.season, date), date.month - 1, date.day, 20)).toISOString();
}
