// ─────────────────────────────────────────────────────────────────────────────
// nonNBACache.ts
// Lazy-fetches stats + profile data from the three league gists and stores them
// in a module-level map.
//
// Data is used to:
//   • Overwrite the hero stats bar (PTS/REB/AST/STL/BLK)
//   • Fill the hero info grid (height, weight, country, school, birthdate, draft)
//   • Show brief profile info in the "Professional Career Report" bio section
//     (B-League also gets their notes text there)
//
// Images are NOT touched — keep whatever imgURL externalRosterService loaded.
// ─────────────────────────────────────────────────────────────────────────────

export interface NonNBAGistEntry {
  // Hero stats bar
  stats: { PTS: string; REB: string; AST: string; STL: string; BLK: string };
  // Hero info grid overrides (undefined = leave baseData value)
  h?: string;   // height
  w?: string;   // weight
  c?: string;   // country / nationality
  s?: string;   // school / college / pre-draft
  b?: string;   // birthdate display string
  a?: string;   // age display string
  d?: string;   // draft
  // Bio section — "Professional Career Report"
  proBio: string;  // HTML <li> bullets
}

const gistCache      = new Map<string, Map<string, NonNBAGistEntry>>();
const pendingFetches = new Map<string, Promise<void>>();

const BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/';

const GIST_URLS: Record<string, string> = {
  PBA:
    'https://gist.githubusercontent.com/aljohnpolyglot/858c81167c2605178b65961efe8425bf/raw/a12c6dbefd3e077f15f04396e797d192632cea18/pba_final_merged.json',
  Euroleague:
    'https://gist.githubusercontent.com/aljohnpolyglot/60406083729779fb19533e04baead405/raw/bfd8196e3e5b787917bce4baf4fea0cb3007625b/euroleaguestats',
  'B-League':
    'https://gist.githubusercontent.com/aljohnpolyglot/0ffa999888dac89005a31b6f1b41b0ba/raw/c73a664f6507078afa48cc365f2cfdf7eaa326b5/bleaguebio',
  'G-League':   BASE + 'gleaguebio',
  Endesa:       BASE + 'ligaendesabio',
  'China CBA':     BASE + 'chinacbabio',
  'NBL Australia': BASE + 'nblaustraliabio',
  // WNBA uses two bio files merged together — handled as a special case in fetchLeagueData
  WNBA_BIO1:    BASE + 'wnbabio1',
  WNBA_BIO2:    BASE + 'wnbabio2',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function li(html: string) { return `<li>${html}</li>`; }
function fmt(v: any, fallback = '0.0') {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n.toFixed(1);
}

/** Extract a clean birthdate string from formats like "Feb 4, 1988 (38 years old)" */
function parseBorn(bornStr: string): { display: string; age: string } {
  if (!bornStr) return { display: '', age: '' };
  // Strip the "(N years old)" part
  const dateOnly = bornStr.replace(/\s*\(\d+\s+years?\s+old\)/i, '').trim();
  const ageMatch = bornStr.match(/\((\d+)\s+years?\s+old\)/i);
  const age = ageMatch ? `${ageMatch[1]} years` : '';
  return { display: dateOnly, age };
}

// ── PBA / Euroleague — flat stats object ─────────────────────────────────────

function buildFlatEntry(item: any): NonNBAGistEntry {
  // Hero stats
  const stats = {
    PTS: fmt(item.ppg),
    REB: fmt(item.rpg),
    AST: fmt(item.apg),
    STL: fmt(item.spg),
    BLK: fmt(item.bpg),
  };

  // Info grid
  // Height: "6-2 (188cm)" → "6'2\""
  let h: string | undefined;
  if (item.height) {
    const m = item.height.match(/^(\d+)-(\d+)/);
    h = m ? `${m[1]}'${m[2]}"` : item.height;
  }

  // Weight: "200 lbs (91kg)" → "200lb"
  let w: string | undefined;
  if (item.weight) {
    const m = item.weight.match(/^(\d+)\s*lbs?/i);
    w = m ? `${m[1]}lb` : item.weight;
  }

  const c = item.nationality || undefined;
  const s = (item.pre_draft && !['N/A', '-', ''].includes(item.pre_draft))
    ? item.pre_draft.replace(/\s*\([^)]*\)\s*$/, '').trim()  // strip class suffix e.g. "(So)"
    : undefined;

  let b: string | undefined;
  let a: string | undefined;
  if (item.born) {
    const parsed = parseBorn(item.born);
    b = parsed.display || undefined;
    a = parsed.age || undefined;
  }

  const d = (item.draft && !['N/A', '-', ''].includes(item.draft))
    ? item.draft
    : 'Undrafted';

  // Bio section: just profile vitals — stats are already in the hero
  const profileLines: string[] = [];
  if (item.hometown) {
    profileLines.push(`<b>Hometown:</b> ${item.hometown}${item.nationality ? ` (${item.nationality})` : ''}`);
  }
  if (item.high_school && !['N/A', '-', ''].includes(item.high_school)) {
    profileLines.push(`<b>High School:</b> ${item.high_school}`);
  }
  if (item.nba_status && !['N/A', '-', '', 'Unrestricted Free Agent'].includes(item.nba_status)) {
    profileLines.push(`<b>NBA Status:</b> ${item.nba_status}`);
  }
  const proBio = profileLines.map(li).join('');

  return { stats, h, w, c, s, b, a, d, proBio };
}

// ── B-League / G-League — BBGM-format player object with stats array + optional flat fields ─────
// Bio gists may have either BBGM-style fields (hgt in inches, weight number, born.year) or
// flat-style fields (height string "6-2 (188cm)", weight string "200 lbs", nationality string).
// We try both so the bio card shows height/weight/country regardless of gist format.

function buildBBGMStyleEntry(player: any): NonNBAGistEntry {
  // ── Stats from stats array ────────────────────────────────────────────────
  const statsArr: any[] = player.stats ?? [];
  let pts = '0.0', reb = '0.0', ast = '0.0', stl = '0.0', blk = '0.0';
  if (statsArr.length > 0) {
    const latest = [...statsArr].sort((a, b) => (b.season ?? 0) - (a.season ?? 0))[0];
    if (latest) {
      const gp = latest.gp || 1;
      pts = fmt((latest.pts ?? 0) / gp);
      const trb = latest.trb ?? ((latest.orb ?? 0) + (latest.drb ?? 0));
      reb = fmt(trb / gp);
      ast = fmt((latest.ast ?? 0) / gp);
      stl = fmt((latest.stl ?? 0) / gp);
      blk = fmt((latest.blk ?? 0) / gp);
    }
  }
  // Also try flat ppg/rpg fields if stats array missing
  if (pts === '0.0' && player.ppg) { pts = fmt(player.ppg); reb = fmt(player.rpg); ast = fmt(player.apg); stl = fmt(player.spg); blk = fmt(player.bpg); }

  // ── Height ───────────────────────────────────────────────────────────────
  let h: string | undefined;
  if (player.hgt) {
    // BBGM inches
    const inches = typeof player.hgt === 'number' ? player.hgt : parseInt(player.hgt);
    if (!isNaN(inches) && inches > 20) h = `${Math.floor(inches / 12)}'${inches % 12}"`;
  } else if (player.height) {
    // flat "6-2 (188cm)" format
    const m = String(player.height).match(/^(\d+)-(\d+)/);
    h = m ? `${m[1]}'${m[2]}"` : String(player.height);
  }

  // ── Weight ───────────────────────────────────────────────────────────────
  let w: string | undefined;
  if (player.weight && typeof player.weight === 'number') {
    w = `${player.weight}lb`;
  } else if (player.weight) {
    const m = String(player.weight).match(/^(\d+)\s*lbs?/i);
    w = m ? `${m[1]}lb` : String(player.weight);
  }

  // ── Country ──────────────────────────────────────────────────────────────
  const c = player.nationality || player.born?.loc || undefined;

  // ── College / School ─────────────────────────────────────────────────────
  let s: string | undefined;
  if (player.college && !['N/A', '-', ''].includes(player.college)) s = player.college;
  else if (player.pre_draft && !['N/A', '-', ''].includes(player.pre_draft))
    s = String(player.pre_draft).replace(/\s*\([^)]*\)\s*$/, '').trim();

  // ── Birthdate / Age ───────────────────────────────────────────────────────
  let b: string | undefined;
  let a: string | undefined;
  if (player.born?.year) { b = String(player.born.year); a = `${new Date().getFullYear() - player.born.year} years`; }
  else if (player.born) { const parsed = parseBorn(String(player.born)); b = parsed.display || undefined; a = parsed.age || undefined; }

  // ── Draft ─────────────────────────────────────────────────────────────────
  let d: string | undefined;
  if (player.draft?.year) {
    d = `${player.draft.year} Round ${player.draft.round ?? '?'}, Pick ${player.draft.pick ?? '?'}`;
  } else if (player.draft && !['N/A', '-', ''].includes(String(player.draft))) {
    d = String(player.draft);
  }

  // ── Bio section: notes text → bullet sentences ────────────────────────────
  const notes: string = player.notes ?? '';
  let proBio = '';
  if (notes.trim().length > 10) {
    const sentences = notes
      .split(/(?<=[.!?])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 8);
    proBio = sentences
      .map((s: string) =>
        li(s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : `${s}.`))
      .join('');
  }

  return { stats: { PTS: pts, REB: reb, AST: ast, STL: stl, BLK: blk }, h, w, c, s, b, a, d, proBio };
}

/** @deprecated alias kept for the B-League case — same logic */
const buildBLeagueEntry = buildBBGMStyleEntry;

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchLeagueData(league: string): Promise<void> {
  const map = new Map<string, NonNBAGistEntry>();

  try {
    if (league === 'WNBA') {
      // WNBA has two separate bio files — merge them (bio1 wins on conflict)
      const [res1, res2] = await Promise.all([
        fetch(GIST_URLS.WNBA_BIO1),
        fetch(GIST_URLS.WNBA_BIO2),
      ]);
      const arr1: any[] = res1.ok ? await res1.json() : [];
      const arr2: any[] = res2.ok ? await res2.json() : [];
      // bio2 first, bio1 overwrites — so bio1 takes priority
      [...arr2, ...arr1].forEach((item: any) => {
        if (item.name) map.set(item.name.toLowerCase(), buildFlatEntry(item));
      });
    } else if (league === 'B-League' || league === 'G-League') {
      // Both leagues use BBGM-format roster data — hgt in inches, stats array, etc.
      const url = GIST_URLS[league];
      if (!url) { gistCache.set(league, map); return; }
      const res = await fetch(url);
      if (!res.ok) { gistCache.set(league, map); return; }
      const data = await res.json();
      const arr: any[] = Array.isArray(data) ? data : (data.players ?? []);
      arr.forEach((item: any) => {
        if (item.name) map.set(item.name.toLowerCase(), buildBBGMStyleEntry(item));
      });
    } else {
      const url = GIST_URLS[league];
      if (!url) { gistCache.set(league, map); return; }
      const res = await fetch(url);
      if (!res.ok) { gistCache.set(league, map); return; }
      const data = await res.json();
      const arr: any[] = Array.isArray(data) ? data : (data.players ?? []);
      arr.forEach((item: any) => {
        if (item.name) map.set(item.name.toLowerCase(), buildFlatEntry(item));
      });
    }
  } catch (_) {
    // silent fail — hero keeps baseData values
  }

  gistCache.set(league, map);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function ensureNonNBAFetched(league: string): Promise<void> {
  if (gistCache.has(league)) return Promise.resolve();
  if (pendingFetches.has(league)) return pendingFetches.get(league)!;
  const p = fetchLeagueData(league).finally(() => pendingFetches.delete(league));
  pendingFetches.set(league, p);
  return p;
}

export function getNonNBAGistData(league: string, name: string): NonNBAGistEntry | null {
  const map = gistCache.get(league);
  if (!map) return null;
  const direct = map.get(name.toLowerCase());
  if (direct) return direct;
  // Fallback: try reversed name (e.g. "Sotto Kai" → "Kai Sotto")
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const reversed = [...parts].reverse().join(' ').toLowerCase();
    return map.get(reversed) ?? null;
  }
  return null;
}
