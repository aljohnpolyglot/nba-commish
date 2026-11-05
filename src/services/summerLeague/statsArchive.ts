import type { NBAGMStat, NBAPlayer } from '../../types';

const SUMMER_LEAGUE_PATH = '/data/external/summer-league/nba-summer-league-2026-bbgm.json';

type SummerLeaguePlayer = {
  name?: string;
  born?: { year?: number };
  stats?: Array<NBAGMStat & Record<string, unknown>>;
};

type SummerLeagueTeam = {
  tid?: number;
  abbrev?: string;
};

type SummerLeaguePayload = {
  players?: SummerLeaguePlayer[];
  teams?: SummerLeagueTeam[];
};

let cachedPayload: SummerLeaguePayload | null = null;
let pendingPayload: Promise<SummerLeaguePayload> | null = null;

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function loadPayload(): Promise<SummerLeaguePayload> {
  if (cachedPayload) return cachedPayload;
  if (pendingPayload) return pendingPayload;
  pendingPayload = fetch(SUMMER_LEAGUE_PATH)
    .then(response => {
      if (!response.ok) throw new Error(`${SUMMER_LEAGUE_PATH}: HTTP ${response.status}`);
      return response.json() as Promise<SummerLeaguePayload>;
    })
    .then(payload => {
      cachedPayload = payload;
      return payload;
    })
    .finally(() => {
      pendingPayload = null;
    });
  return pendingPayload;
}

export async function loadSummerLeagueStatsForPlayer(
  player: NBAPlayer,
  maxSeason: number,
): Promise<NBAGMStat[]> {
  const payload = await loadPayload();
  const targetName = normalizeName(player.name);
  const targetBirthYear = Number(player.born?.year ?? 0);
  const candidates = (payload.players ?? []).filter(row => normalizeName(row.name) === targetName);
  const source = candidates.find(row =>
    targetBirthYear > 0 && Number(row.born?.year ?? 0) === targetBirthYear
  ) ?? candidates[0];
  if (!source) return [];
  const teamAbbrevs = new Map((payload.teams ?? []).map(team => [Number(team.tid), team.abbrev]));
  return (source.stats ?? [])
    .filter(row => Number(row.season) <= maxSeason && Number(row.gp ?? 0) > 0)
    .map(row => ({
      ...row,
      competitionId: 'nba-summer-league',
      playoffs: false,
      abbrev: teamAbbrevs.get(Number(row.tid)),
      _source: 'summer-league-history',
      _seasonLabel: String(row.season),
    } as NBAGMStat));
}

