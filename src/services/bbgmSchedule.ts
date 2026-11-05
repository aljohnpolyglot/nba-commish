import type { Game, LeagueStats, NBATeam } from '../types';
import { getLeagueCalendarDates } from './leagueCalendar';

export function completeImportedScheduleTarget(
  source: Game[],
  teams: NBATeam[],
  season: number,
  targetGames: number,
  leagueStats?: Pick<LeagueStats, 'leagueCalendar' | 'uiMode'>,
): Game[] {
  const schedule = [...source];
  const counts = new Map(teams.map(team => [team.id, 0]));
  const homeCounts = new Map(teams.map(team => [team.id, 0]));
  const pairCounts = new Map<string, number>();
  const occupied = new Map<string, Set<number>>();
  const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const isRegularGame = (game: Game) =>
    !game.played
    && !game.isPreseason
    && !game.isExhibition
    && !(game as Game & { isCupTBD?: boolean }).isCupTBD;

  for (const game of schedule) {
    const date = String(game.date).slice(0, 10);
    const day = occupied.get(date) ?? new Set<number>();
    day.add(game.homeTid);
    day.add(game.awayTid);
    occupied.set(date, day);
    if (!isRegularGame(game)) continue;
    counts.set(game.homeTid, (counts.get(game.homeTid) ?? 0) + 1);
    counts.set(game.awayTid, (counts.get(game.awayTid) ?? 0) + 1);
    homeCounts.set(game.homeTid, (homeCounts.get(game.homeTid) ?? 0) + 1);
    const key = pairKey(game.homeTid, game.awayTid);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  const deficits = new Map(teams.map(team => [team.id, Math.max(0, targetGames - (counts.get(team.id) ?? 0))]));
  let nextGid = schedule.reduce((max, game) => Math.max(max, Number(game.gid) || 0), 0) + 1;
  const calendar = getLeagueCalendarDates(season, leagueStats);
  const firstDate = calendar.regularSeasonStart;
  const lastDate = calendar.regularSeasonEnd;
  const dayCount = Math.max(1, Math.floor((lastDate.getTime() - firstDate.getTime()) / 86_400_000) + 1);
  let dateCursor = 0;

  while ([...deficits.values()].some(value => value > 0)) {
    const contenders = teams
      .filter(team => (deficits.get(team.id) ?? 0) > 0)
      .sort((a, b) => (deficits.get(b.id) ?? 0) - (deficits.get(a.id) ?? 0) || a.id - b.id);
    const first = contenders[0];
    if (!first) break;
    if (contenders.length === 1) {
      const removableIndex = schedule.findIndex(game =>
        isRegularGame(game)
        && game.homeTid !== first.id
        && game.awayTid !== first.id
      );
      if (removableIndex < 0) break;
      const [removed] = schedule.splice(removableIndex, 1);
      deficits.set(removed.homeTid, (deficits.get(removed.homeTid) ?? 0) + 1);
      deficits.set(removed.awayTid, (deficits.get(removed.awayTid) ?? 0) + 1);
      homeCounts.set(removed.homeTid, Math.max(0, (homeCounts.get(removed.homeTid) ?? 0) - 1));
      const removedPair = pairKey(removed.homeTid, removed.awayTid);
      pairCounts.set(removedPair, Math.max(0, (pairCounts.get(removedPair) ?? 0) - 1));
      const removedDay = occupied.get(String(removed.date).slice(0, 10));
      removedDay?.delete(removed.homeTid);
      removedDay?.delete(removed.awayTid);
      continue;
    }
    const second = contenders
      .slice(1)
      .sort((a, b) =>
        (pairCounts.get(pairKey(first.id, a.id)) ?? 0) - (pairCounts.get(pairKey(first.id, b.id)) ?? 0)
        || (deficits.get(b.id) ?? 0) - (deficits.get(a.id) ?? 0)
        || a.id - b.id
      )[0];
    if (!second) break;

    let date = '';
    for (let offset = 0; offset < dayCount; offset++) {
      const index = (dateCursor + offset) % dayCount;
      const candidate = new Date(firstDate);
      candidate.setUTCDate(firstDate.getUTCDate() + index);
      const iso = candidate.toISOString().slice(0, 10);
      const day = occupied.get(iso);
      if (!day?.has(first.id) && !day?.has(second.id)) {
        date = iso;
        dateCursor = (index + 1) % dayCount;
        break;
      }
    }
    if (!date) break;

    const homeTid = (homeCounts.get(first.id) ?? 0) <= (homeCounts.get(second.id) ?? 0)
      ? first.id
      : second.id;
    const awayTid = homeTid === first.id ? second.id : first.id;
    schedule.push({
      gid: nextGid++,
      homeTid,
      awayTid,
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: `${date}T00:00:00.000Z`,
    });
    const day = occupied.get(date) ?? new Set<number>();
    day.add(first.id);
    day.add(second.id);
    occupied.set(date, day);
    deficits.set(first.id, (deficits.get(first.id) ?? 0) - 1);
    deficits.set(second.id, (deficits.get(second.id) ?? 0) - 1);
    homeCounts.set(homeTid, (homeCounts.get(homeTid) ?? 0) + 1);
    const key = pairKey(first.id, second.id);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  return schedule.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.gid - b.gid);
}
