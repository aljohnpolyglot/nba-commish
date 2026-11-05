import { readJsonResponse } from '../services/utils/jsonResponse';

export type AllStarHistorySource = 'nba' | 'wnba' | 'pba';

export interface AllStarHistoryContestWinner {
  name: string;
  team: string;
}

export interface AllStarHistoryEntry {
  year: number;
  eventStatus?: 'held' | 'not-held' | 'cancelled' | 'special-event-only' | 'scheduled' | 'unavailable';
  teams: string[];         // e.g. ["East", "West"] or ["Team LeBron", "Team Durant"]
  winner: string;
  final_score: Record<string, number> | null;
  game_note?: string;
  host_arena: string;
  host_city: string;
  host_teams: string[];    // team names as strings (wiki-style)
  mvps: Array<{ name: string; team: string }>;
  risingStarsMvp?: AllStarHistoryContestWinner;
  dunkWinner?: AllStarHistoryContestWinner;
  threePointWinner?: AllStarHistoryContestWinner;
  shootingStarsWinner?: AllStarHistoryContestWinner;
  shootingStarsWinners?: AllStarHistoryContestWinner[];
  skillsWinner?: AllStarHistoryContestWinner;
  horseWinner?: AllStarHistoryContestWinner;
}

const SOURCE_URLS: Record<AllStarHistorySource, string> = {
  nba: '/data/historical/all-star/nba.json',
  wnba: '/data/historical/all-star/wnba.json',
  pba: '/data/historical/all-star/pba.json',
};

const cache: Partial<Record<AllStarHistorySource, AllStarHistoryEntry[]>> = {};
const inflight: Partial<Record<AllStarHistorySource, Promise<AllStarHistoryEntry[]>>> = {};

const object = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
);

const entityName = (value: unknown): string => String(object(value)?.sourceName ?? '').trim();

const result = (value: unknown): AllStarHistoryContestWinner | undefined => {
  const row = object(value);
  const name = entityName(row?.person);
  return name ? { name, team: entityName(row?.team) } : undefined;
};

const contestWinners = (contests: unknown[], key: string): AllStarHistoryContestWinner[] => {
  const contest = contests.map(object).find(row => row?.contestKey === key && row.status === 'held');
  return Array.isArray(contest?.winners)
    ? contest.winners.map(result).filter(Boolean) as AllStarHistoryContestWinner[]
    : [];
};

const contestWinner = (contests: unknown[], key: string): AllStarHistoryContestWinner | undefined => contestWinners(contests, key)[0];

export const normalizeAllStarHistory = (value: unknown, source: AllStarHistorySource): AllStarHistoryEntry[] => {
  const root = object(value);
  if (root?.schemaVersion !== 1 || root.leagueKey !== source || !Array.isArray(root.seasons)) return [];
  return root.seasons.flatMap(value => {
    const row = object(value);
    const year = Number(row?.season);
    if (!Number.isFinite(year)) return [];
    const host = object(row?.host);
    const finalScore = object(row?.finalScore);
    const contests = Array.isArray(row?.contests) ? row.contests : [];
    const mvps = Array.isArray(row?.mvps) ? row.mvps.map(result).filter(Boolean) as AllStarHistoryContestWinner[] : [];
    const shootingStarsWinners = contestWinners(contests, 'shooting-stars');
    return [{
      year,
      eventStatus: row?.status as AllStarHistoryEntry['eventStatus'],
      teams: Array.isArray(row?.teams) ? row.teams.map(String) : [],
      winner: String(row?.winner ?? ''),
      final_score: finalScore
        ? Object.fromEntries(Object.entries(finalScore).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
        : null,
      game_note: String(row?.note ?? row?.format ?? '').trim() || undefined,
      host_arena: entityName(host?.arena),
      host_city: String(host?.city ?? '').trim(),
      host_teams: Array.isArray(host?.hostTeams) ? host.hostTeams.map(entityName).filter(Boolean) : [],
      mvps,
      risingStarsMvp: contestWinner(contests, 'rising-stars'),
      dunkWinner: contestWinner(contests, 'slam-dunk'),
      threePointWinner: contestWinner(contests, 'three-point'),
      shootingStarsWinner: shootingStarsWinners[0],
      shootingStarsWinners,
      skillsWinner: contestWinner(contests, 'skills'),
      horseWinner: contestWinner(contests, 'horse'),
    }];
  });
};

export async function fetchAllStarHistory(source: AllStarHistorySource = 'nba'): Promise<AllStarHistoryEntry[]> {
  if (cache[source]) return cache[source]!;
  if (inflight[source]) return inflight[source]!;
  inflight[source] = (async () => {
    try {
      const res = await fetch(SOURCE_URLS[source]);
      const data = await readJsonResponse<unknown>(res, `${source.toUpperCase()} All-Star history`);
      cache[source] = normalizeAllStarHistory(data, source);
      return cache[source]!;
    } catch (e) {
      console.error(`[AllStarHistory] ${source} fetch failed`, e);
      cache[source] = [];
      return cache[source]!;
    } finally {
      delete inflight[source];
    }
  })();
  return inflight[source]!;
}

export function getCachedAllStarHistory(source: AllStarHistorySource = 'nba'): AllStarHistoryEntry[] | null {
  return cache[source] ?? null;
}
