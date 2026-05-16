export type JerseyLeague = 'NBA' | 'ENDESA' | 'EUROLEAGUE' | 'PBA';

export interface JerseyKit {
  filename: string;
  url?: string;
  part?: 'body' | 'shorts' | 'unknown' | string;
  variant?: string;
  localPath?: string;
  error?: string;
}

export interface JerseyTeam {
  team: string;
  league: JerseyLeague;
  kits: JerseyKit[];
}

type JerseyIndex = Record<JerseyLeague, JerseyTeam[]>;

const INDEX_URL = '/img/jerseys/index.json';

let cache: JerseyIndex | null = null;
let inflight: Promise<JerseyIndex> | null = null;

export async function loadJerseyIndex(): Promise<JerseyIndex> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(INDEX_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as JerseyIndex;
      cache = json;
      return json;
    } catch (err) {
      console.warn('[jerseyLoader] failed to load index.json', err);
      cache = { NBA: [], ENDESA: [], EUROLEAGUE: [], PBA: [] } as JerseyIndex;
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Normalize a team name for fuzzy lookup. Strips diacritics, lowercases,
 *  collapses non-alphanumeric to single underscores. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function findTeamJerseys(
  index: JerseyIndex,
  teamName: string,
  league?: JerseyLeague,
): JerseyTeam | undefined {
  const target = norm(teamName);
  const buckets: JerseyLeague[] = league ? [league] : ['ENDESA', 'EUROLEAGUE', 'NBA', 'PBA'];
  for (const bucket of buckets) {
    const list = index[bucket] ?? [];
    // Exact match first
    const exact = list.find((t) => norm(t.team) === target);
    if (exact) return exact;
    // Prefix / contains match
    const contains = list.find((t) => norm(t.team).includes(target) || target.includes(norm(t.team)));
    if (contains) return contains;
  }
  return undefined;
}

/** Convert an index `localPath` ("public/img/jerseys/...") into a URL the dev server can serve. */
export function jerseyUrl(localPath: string | undefined): string | null {
  if (!localPath) return null;
  return '/' + localPath.replace(/^public\//, '');
}

/** Pick the best body kit + matching shorts for rendering.
 *  Strategy: prefer kits with localPath (downloaded) and part='body' / 'shorts',
 *  optionally filtered by variant substring (e.g. 'home', 'icon', 'association'). */
export function pickKit(team: JerseyTeam, variantHint?: string): { body: JerseyKit | null; shorts: JerseyKit | null } {
  const downloaded = team.kits.filter((k) => k.localPath && !k.error);
  const bodies = downloaded.filter((k) => k.part === 'body');
  const shorts = downloaded.filter((k) => k.part === 'shorts');
  let body: JerseyKit | null = null;
  if (variantHint) {
    body = bodies.find((k) => (k.variant ?? '').toLowerCase().includes(variantHint.toLowerCase())) ?? null;
  }
  if (!body) body = bodies[0] ?? null;
  let short: JerseyKit | null = null;
  if (body?.variant) {
    short = shorts.find((k) => k.variant === body!.variant) ?? null;
  }
  if (!short) short = shorts[0] ?? null;
  return { body, shorts: short };
}
