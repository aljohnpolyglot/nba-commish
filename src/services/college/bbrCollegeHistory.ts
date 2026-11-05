import type { NBAGMStat, NBAPlayer } from '../../types';

type CollegeSourceRow = Record<string, unknown> & {
  season?: string;
  college?: string;
  collegeId?: string;
};

type CollegeSourcePayload = {
  players?: Record<string, {
    collegeStats?: CollegeSourceRow[];
  }>;
};

const RUNTIME_ROOT = '/data/college/bbr-player-history';

const payloadPromises = new Map<string, Promise<CollegeSourcePayload>>();

const finite = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function seasonEndYear(value: unknown): number | null {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4})[-–](\d{2}|\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const shortEnd = Number(match[2]);
  const end = match[2].length === 4
    ? shortEnd
    : Math.floor(start / 100) * 100 + shortEnd + (shortEnd < start % 100 ? 100 : 0);
  return Number.isFinite(end) ? end : null;
}

function playerSlug(player: Pick<NBAPlayer, 'srID' | 'slug'>): string | null {
  const raw = String(player.srID ?? player.slug ?? '').trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/([^/]+?)(?:\.html)?$/);
  return match?.[1] ?? null;
}

async function readPayload(shard: string): Promise<CollegeSourcePayload> {
  const response = await fetch(`${RUNTIME_ROOT}/${shard}.json.gz`);
  if (!response.ok) throw new Error(`College history returned HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : buffer;
  return JSON.parse(new TextDecoder().decode(decoded)) as CollegeSourcePayload;
}

function getPayload(shard: string): Promise<CollegeSourcePayload> {
  const existing = payloadPromises.get(shard);
  if (existing) return existing;
  const pending = readPayload(shard).catch(error => {
    payloadPromises.delete(shard);
    throw error;
  });
  payloadPromises.set(shard, pending);
  return pending;
}

function toNativeCollegeStat(row: CollegeSourceRow): NBAGMStat | null {
  const season = seasonEndYear(row.season);
  const gp = finite(row.g);
  if (!season || gp <= 0) return null;
  const fg = finite(row.fg);
  const fga = finite(row.fga);
  const tp = finite(row.fg3);
  const tpa = finite(row.fg3a);
  const ft = finite(row.ft);
  const fta = finite(row.fta);
  const orb = finite(row.orb);
  const trb = finite(row.trb);
  const college = String(row.college ?? '').trim();
  const collegeId = String(row.collegeId ?? college).trim().toUpperCase();
  return {
    season,
    tid: -1,
    gp,
    gs: finite(row.gs),
    min: finite(row.mp),
    fg,
    fga,
    fgp: finite(row.fg_pct) * 100,
    tp,
    tpa,
    tpp: finite(row.fg3_pct) * 100,
    ft,
    fta,
    ftp: finite(row.ft_pct) * 100,
    orb,
    drb: Math.max(0, trb - orb),
    trb,
    ast: finite(row.ast),
    stl: finite(row.stl),
    blk: finite(row.blk),
    tov: finite(row.tov),
    pf: finite(row.pf),
    pts: finite(row.pts),
    per: finite(row.per),
    competitionId: 'ncaa-college',
    abbrev: collegeId || college || 'COL',
    teamAbbrev: collegeId || college || 'COL',
    _seasonLabel: row.season,
    _source: 'bbr-college-history',
    _collegeName: college || collegeId,
    _sourceAge: finite(row.age),
  } as NBAGMStat;
}

export async function loadBbrCollegeStatsForPlayer(
  player: NBAPlayer,
  maxSeason: number,
): Promise<NBAGMStat[]> {
  const inlineRows = (player as NBAPlayer & { collegeStats?: CollegeSourceRow[] }).collegeStats;
  let rows = Array.isArray(inlineRows) ? inlineRows : undefined;
  if (!rows) {
    const slug = playerSlug(player);
    if (!slug) return [];
    const shard = /^[a-z0-9]$/i.test(slug[0] ?? '') ? slug[0].toLowerCase() : '_';
    rows = (await getPayload(shard)).players?.[slug]?.collegeStats;
  }
  return (rows ?? [])
    .map(toNativeCollegeStat)
    .filter((stat): stat is NBAGMStat => Boolean(stat) && stat.season <= maxSeason)
    .sort((left, right) => left.season - right.season);
}
