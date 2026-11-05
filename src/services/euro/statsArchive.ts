import type { NBAPlayer, NBAGMStat } from '../../types';
import { EUROLEAGUE_2026_SOURCE } from '../../data/euroBasketballSources';
import type { EuroleagueBbgmFile } from '../euroleagueRosterFetcher';
import { readJsonResponse } from '../utils/jsonResponse';

const EURO_STATS_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/euroleaguestatscomplete';

interface RawEuroStatsRow {
  player_name?: string;
  player_url?: string;
  season?: string;
  age?: string;
  team?: string;
  league?: string;
  gp?: string;
  gs?: string;
  min?: string;
  pts?: string;
  fgm?: string;
  fga?: string;
  fg_pct?: string;
  '3pm'?: string;
  '3pa'?: string;
  '3p_pct'?: string;
  ftm?: string;
  fta?: string;
  ft_pct?: string;
  off?: string;
  def?: string;
  trb?: string;
  ast?: string;
  stl?: string;
  blk?: string;
  tov?: string;
  pf?: string;
}

interface RawEuroStatsPayload {
  rows?: RawEuroStatsRow[];
}

export type EuroStatsByPlayer = Map<string, NBAGMStat[]>;

let archivePromise: Promise<RawEuroStatsRow[]> | null = null;
let bundledHistoryPromise: Promise<EuroleagueBbgmFile | null> | null = null;

const numberValue = (value: unknown): number => {
  const raw = String(value ?? '').replace(/[%*,]/g, '').trim();
  if (!raw) return 0;
  const parsed = Number(raw.startsWith('.') ? `0${raw}` : raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeEuroStatName = (value: string): string =>
  value
    .replace(/\bplayer profile\b/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function nameKeys(value: string): string[] {
  const normalized = normalizeEuroStatName(value);
  const parts = normalized.split(' ').filter(Boolean);
  const keys = new Set<string>();
  if (normalized) keys.add(normalized);
  if (parts.length >= 2) {
    keys.add(`${parts[0]} ${parts[parts.length - 1]}`);
    keys.add(parts.slice(-2).join(' '));
    keys.add(`${parts[0][0]} ${parts[parts.length - 1]}`);
  }
  return Array.from(keys);
}

function seasonYear(value: string | undefined): number {
  const clean = String(value ?? '').replace('*', '').trim();
  const range = clean.match(/^(\d{4})\s*[-–]\s*(\d{2})$/);
  if (range) return Number(`${range[1].slice(0, 2)}${range[2]}`);
  const single = clean.match(/^(\d{4})$/);
  return single ? Number(single[1]) : 0;
}

function seasonLabel(value: string | undefined): string {
  return String(value ?? '').replace('*', '').trim();
}

function leagueTag(rows: RawEuroStatsRow[]): { tag: string; title: string } {
  const leagues = new Set(rows.map(row => String(row.league ?? '').trim()).filter(Boolean));
  if (leagues.size === 0) return { tag: 'EUROPE', title: 'Europe' };
  const values = Array.from(leagues);
  if (values.length === 1) {
    const league = values[0];
    if (league === 'Euroleague') return { tag: 'EUROPE', title: 'EuroLeague' };
    if (league === 'ACB') return { tag: 'ESP-1', title: 'Liga Endesa' };
    if (league === 'Spanish Cup') return { tag: 'ESP-CUP', title: 'Copa del Rey' };
    if (league === 'ACB SuperCup') return { tag: 'ESP-SC', title: 'Supercopa' };
    if (['German BBL', 'G-BBL', 'BBL'].includes(league)) return { tag: 'BBL', title: 'Basketball Bundesliga' };
    return { tag: league.toUpperCase().slice(0, 10), title: league };
  }
  return { tag: 'MIX', title: values.join(' / ') };
}

function competitionIdForLeague(value: unknown): string | undefined {
  const league = String(value ?? '').trim().toLowerCase();
  if (league === 'euroleague') return 'euroleague';
  if (league === 'acb') return 'endesa';
  if (league === 'spanish cup') return 'copa-del-rey';
  if (league === 'acb supercup') return 'supercopa';
  if (league === 'german-bbl' || league === 'german bbl' || league === 'g-bbl' || league === 'bbl' || league === 'basketball bundesliga') return 'german-bbl';
  if (league === 'lba' || league === 'italian serie a' || league === 'lega basket serie a') return 'italian-serie-a';
  return undefined;
}

export function getCanonicalEuroStatCompetitionId(row: Partial<NBAGMStat> & Record<string, unknown>): string {
  const explicit = String(row.competitionId ?? '').trim().toLowerCase();
  const explicitCanonical = competitionIdForLeague(explicit);
  if (explicitCanonical) return explicitCanonical;
  for (const value of [row.tag, row.leagueTag, row.title, row.leagueTitle, row.league]) {
    const canonical = competitionIdForLeague(value);
    if (canonical) return canonical;
  }
  return explicit;
}

function weightedTotal(rows: RawEuroStatsRow[], field: keyof RawEuroStatsRow): number {
  return rows.reduce((sum, row) => sum + numberValue(row[field]) * numberValue(row.gp), 0);
}

function buildStatRow(rows: RawEuroStatsRow[], season: number): NBAGMStat {
  const gp = rows.reduce((sum, row) => sum + numberValue(row.gp), 0);
  const fg = weightedTotal(rows, 'fgm');
  const fga = weightedTotal(rows, 'fga');
  const tp = weightedTotal(rows, '3pm');
  const tpa = weightedTotal(rows, '3pa');
  const ft = weightedTotal(rows, 'ftm');
  const fta = weightedTotal(rows, 'fta');
  const league = leagueTag(rows);
  const min = weightedTotal(rows, 'min');
  const pts = weightedTotal(rows, 'pts');
  const poss = fga + 0.44 * fta;
  const historicalTeamAbbrev = String(rows[0]?.team ?? '').trim().toUpperCase();

  return {
    season,
    tid: -1,
    abbrev: historicalTeamAbbrev || undefined,
    gp,
    gs: rows.reduce((sum, row) => sum + numberValue(row.gs), 0),
    min,
    fg,
    fga,
    fgp: fga > 0 ? fg / fga : 0,
    tp,
    tpa,
    tpp: tpa > 0 ? tp / tpa : 0,
    ft,
    fta,
    ftp: fta > 0 ? ft / fta : 0,
    orb: weightedTotal(rows, 'off'),
    drb: weightedTotal(rows, 'def'),
    trb: weightedTotal(rows, 'trb'),
    ast: weightedTotal(rows, 'ast'),
    stl: weightedTotal(rows, 'stl'),
    blk: weightedTotal(rows, 'blk'),
    tov: weightedTotal(rows, 'tov'),
    pf: weightedTotal(rows, 'pf'),
    pts,
    per: 0,
    pm: 0,
    tsPct: poss > 0 ? (pts / (2 * poss)) * 100 : 0,
    efgPct: fga > 0 ? ((fg + 0.5 * tp) / fga) * 100 : 0,
    ...(league as any),
    competitionId: competitionIdForLeague(rows[0]?.league),
    _seasonLabel: seasonLabel(rows[0]?.season),
    _source: 'euro-stats-archive',
  } as NBAGMStat;
}

async function fetchArchiveRows(): Promise<RawEuroStatsRow[]> {
  if (!archivePromise) {
    archivePromise = fetch(`${EURO_STATS_URL}?t=${Date.now()}`)
      .then(response => readJsonResponse<RawEuroStatsPayload>(response, 'European stats archive'))
      .then(payload => payload.rows ?? [])
      .catch(error => {
        console.warn('[EuroStats] Could not load archive', error);
        return [];
      });
  }
  return archivePromise;
}

async function fetchBundledHistory(): Promise<EuroleagueBbgmFile | null> {
  if (!bundledHistoryPromise) {
    bundledHistoryPromise = fetch(EUROLEAGUE_2026_SOURCE.rosterUrl)
      .then(response => readJsonResponse<EuroleagueBbgmFile>(response, 'Bundled EuroLeague history'))
      .catch(error => {
        console.warn('[EuroStats] Could not load bundled history', error);
        return null;
      });
  }
  return bundledHistoryPromise;
}

const sourceIdValues = (player: NBAPlayer): string[] => {
  const values = [
    player.sourceIds?.[EUROLEAGUE_2026_SOURCE.id],
    player.sourceIds?.realgm,
  ].flatMap(value => Array.isArray(value) ? value : value ? [value] : []);
  for (const value of [player.personId, player.internalId]) {
    const match = String(value ?? '').match(/(?:realgm[^:]*:|euro-realgm-)(\d+)$/i);
    if (match) values.push(match[1]);
  }
  return [...new Set(values.map(String))];
};

const hasBundledEuroIdentity = (player: NBAPlayer): boolean => (
  player.sourceIds?.[EUROLEAGUE_2026_SOURCE.id] != null
  || String(player.personId ?? '').includes(EUROLEAGUE_2026_SOURCE.id)
  || String(player.internalId ?? '').startsWith(`${EUROLEAGUE_2026_SOURCE.identityNamespace}-`)
);

function buildBundledHistoryRows(
  players: NBAPlayer[],
  data: EuroleagueBbgmFile,
  maxSeason?: number,
): EuroStatsByPlayer {
  const sourceById = new Map((data.players ?? [])
    .filter(source => source.pid != null)
    .map(source => [String(source.pid), source] as const));
  const teamsByTid = new Map((data.teams ?? [])
    .filter(team => team.tid != null)
    .map(team => [Number(team.tid), team] as const));
  const out: EuroStatsByPlayer = new Map();

  for (const player of players) {
    const source = sourceIdValues(player).map(id => sourceById.get(id)).find(Boolean);
    if (!source) continue;
    const rows = (source.stats ?? [])
      .filter(row => (
        row.playoffs !== true
        && Number(row.gp ?? 0) > 0
        && (maxSeason == null || Number(row.season ?? 0) <= maxSeason)
      ))
      .map(row => {
        const team = row.tid == null ? undefined : teamsByTid.get(Number(row.tid));
        return {
          ...row,
          tid: row.tid == null ? -1 : Number(row.tid) + EUROLEAGUE_2026_SOURCE.teamTidOffset,
          abbrev: team?.abbrev,
          teamAbbrev: team?.abbrev,
          teamName: team?.name,
          league: EUROLEAGUE_2026_SOURCE.displayName,
          tag: 'EUROPE',
          title: EUROLEAGUE_2026_SOURCE.displayName,
          competitionId: EUROLEAGUE_2026_SOURCE.competitionId,
          _source: 'bundled-euroleague-history',
        } as unknown as NBAGMStat;
      })
      .sort((left, right) => Number(left.season) - Number(right.season));
    if (rows.length) out.set(player.internalId, rows);
  }
  return out;
}

export async function loadEuroStatsForPlayers(players: NBAPlayer[], options?: { maxSeason?: number }): Promise<EuroStatsByPlayer> {
  const archiveRows = await fetchArchiveRows();
  const rowsByNameKey = new Map<string, RawEuroStatsRow[]>();

  for (const row of archiveRows) {
    if (!row.player_name || row.team === 'All Teams' || row.league === 'All Leagues') continue;
    for (const key of nameKeys(row.player_name)) {
      if (!rowsByNameKey.has(key)) rowsByNameKey.set(key, []);
      rowsByNameKey.get(key)!.push(row);
    }
  }

  const out: EuroStatsByPlayer = new Map();
  for (const player of players) {
    const matchedRows = nameKeys(player.name).map(key => rowsByNameKey.get(key)).find(Boolean);
    if (!matchedRows?.length) continue;

    const bySeasonLeagueTeam = new Map<string, RawEuroStatsRow[]>();
    for (const row of matchedRows) {
      const year = seasonYear(row.season);
      if (!year || numberValue(row.gp) <= 0 || (options?.maxSeason != null && year > options.maxSeason)) continue;
      const competition = competitionIdForLeague(row.league) ?? (String(row.league ?? '').trim().toLowerCase() || 'unknown');
      const team = String(row.team ?? '').trim().toUpperCase() || 'unknown';
      const key = `${year}|${competition}|${team}`;
      if (!bySeasonLeagueTeam.has(key)) bySeasonLeagueTeam.set(key, []);
      bySeasonLeagueTeam.get(key)!.push(row);
    }

    const stats = Array.from(bySeasonLeagueTeam.entries())
      .map(([key, rows]) => buildStatRow(rows, Number(key.split('|')[0])))
      .filter(row => row.gp > 0)
      .sort((a, b) => a.season - b.season);
    if (stats.length) out.set(player.internalId, stats);
  }

  const missing = players.filter(player => !out.has(player.internalId) && hasBundledEuroIdentity(player));
  if (missing.length > 0) {
    const bundled = await fetchBundledHistory();
    if (bundled) {
      for (const [playerId, rows] of buildBundledHistoryRows(missing, bundled, options?.maxSeason)) {
        out.set(playerId, rows);
      }
    }
  }
  return out;
}
