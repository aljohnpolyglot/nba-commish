import type { NBAPlayer, NBAGMStat } from '../../types';

const PBA_STATS_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/pbastatscomplete';

interface RawPbaStatsRow {
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

interface RawPbaStatsPayload {
  rows?: RawPbaStatsRow[];
}

export type PbaStatsByPlayer = Map<string, NBAGMStat[]>;

let archivePromise: Promise<RawPbaStatsRow[]> | null = null;

const numberValue = (value: unknown): number => {
  const raw = String(value ?? '').replace(/[%*,]/g, '').trim();
  if (!raw) return 0;
  const parsed = Number(raw.startsWith('.') ? `0${raw}` : raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizePbaStatName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function nameKeys(value: string): string[] {
  const normalized = normalizePbaStatName(value);
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

function competitionIdForLeague(league: string | undefined): string | null {
  const value = String(league ?? '').trim().toUpperCase();
  if (value === 'PBA PC' || value === 'FPBA') return 'pba-philippine-cup';
  if (value === 'PBA CC') return 'pba-commissioners-cup';
  if (value === 'PBA GC') return 'pba-governors-cup';
  return null;
}

function leagueTag(rows: RawPbaStatsRow[]): { tag: string; title: string } {
  const leagues = new Set(rows.map(row => String(row.league ?? '').trim()).filter(Boolean));
  if (leagues.size === 0) return { tag: 'PBA', title: 'PBA' };
  const values = Array.from(leagues);
  if (values.every(value => value.startsWith('PBA') || value === 'FPBA')) {
    return { tag: 'PBA', title: 'PBA' };
  }
  if (values.length === 1) {
    const league = values[0];
    if (league === 'KBL') return { tag: 'KBL', title: 'South Korean KBL' };
    if (league === 'B.League') return { tag: 'B.LEAGUE', title: 'Japanese B.League' };
    if (league === 'NZ NBL') return { tag: 'NZ NBL', title: 'New Zealand NBL' };
    return { tag: league.toUpperCase().slice(0, 10), title: league };
  }
  return { tag: 'MIX', title: values.join(' / ') };
}

function weightedTotal(rows: RawPbaStatsRow[], field: keyof RawPbaStatsRow): number {
  return rows.reduce((sum, row) => sum + numberValue(row[field]) * numberValue(row.gp), 0);
}

function buildStatRow(rows: RawPbaStatsRow[], player: NBAPlayer, season: number): NBAGMStat {
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

  return {
    season,
    tid: player.tid,
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
    _archiveCompetitionId: competitionIdForLeague(rows[0]?.league),
    _seasonLabel: seasonLabel(rows[0]?.season),
    _source: 'pba-stats-archive',
  } as NBAGMStat;
}

async function fetchArchiveRows(): Promise<RawPbaStatsRow[]> {
  if (!archivePromise) {
    archivePromise = fetch(`${PBA_STATS_URL}?t=${Date.now()}`)
      .then(response => {
        if (!response.ok) throw new Error(`PBA stats fetch failed: ${response.status}`);
        return response.json() as Promise<RawPbaStatsPayload>;
      })
      .then(payload => payload.rows ?? [])
      .catch(error => {
        console.warn('[PBAStats] Could not load archive', error);
        return [];
      });
  }
  return archivePromise;
}

export async function loadPbaStatsForPlayers(players: NBAPlayer[]): Promise<PbaStatsByPlayer> {
  const archiveRows = await fetchArchiveRows();
  const rowsByNameKey = new Map<string, RawPbaStatsRow[]>();

  for (const row of archiveRows) {
    if (!row.player_name || row.team === 'All Teams' || row.league === 'All Leagues') continue;
    for (const key of nameKeys(row.player_name)) {
      if (!rowsByNameKey.has(key)) rowsByNameKey.set(key, []);
      rowsByNameKey.get(key)!.push(row);
    }
  }

  const out: PbaStatsByPlayer = new Map();
  for (const player of players) {
    const matchedRows = nameKeys(player.name).map(key => rowsByNameKey.get(key)).find(Boolean);
    if (!matchedRows?.length) continue;

    const bySeasonCompetition = new Map<string, RawPbaStatsRow[]>();
    for (const row of matchedRows) {
      const year = seasonYear(row.season);
      if (!year || numberValue(row.gp) <= 0) continue;
      const competitionId = competitionIdForLeague(row.league) ?? `league:${String(row.league ?? '').trim() || 'unknown'}`;
      const key = `${year}|${competitionId}`;
      if (!bySeasonCompetition.has(key)) bySeasonCompetition.set(key, []);
      bySeasonCompetition.get(key)!.push(row);
    }

    const stats = Array.from(bySeasonCompetition.entries())
      .map(([key, rows]) => buildStatRow(rows, player, Number(key.split('|')[0])))
      .filter(row => row.gp > 0)
      .sort((a, b) => a.season - b.season);
    if (stats.length) out.set(player.internalId, stats);
  }
  return out;
}
