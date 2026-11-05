const ARENA_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/wikipedia-indoor-arenas-split/nba/nba-team-arenas-simple.json';

interface ArenaSourceInfo {
  id?: string;
  name: string;
  city: string;
  state?: string | null;
  country?: string | null;
  location: string;
  capacity?: number | null;
  opened?: number | null;
  imgURL?: string | null;
  logoURL?: string | null;
  sponsor?: string | null;
  hasNamingRights?: boolean;
  names?: Record<string, string>;
  seasons?: Record<string, ArenaSourceInfo>;
  alternate?: ArenaSourceInfo[];
  tenants?: string[];
}

export interface ArenaInfo {
  arena_name: string;
  arena_location: string;
  seating_capacity: number;
  opening_year: number;
  name: string;
  city: string;
  state?: string | null;
  country?: string | null;
  location: string;
  capacity?: number | null;
  opened?: number | null;
  imageUrl?: string;
  formerNames: Array<{ season: number; name: string }>;
  tenants: string[];
  sponsor?: string | null;
  hasNamingRights?: boolean;
}

const ARENA_SPONSOR_PATTERNS: Array<[RegExp, string]> = [
  [/\bcrypto\.com\b/i, 'Crypto.com'],
  [/\bstate farm\b/i, 'State Farm'],
  [/\blittle caesars\b/i, 'Little Caesars'],
  [/\bsmoothie king\b/i, 'Smoothie King'],
  [/\bamerican airlines\b/i, 'American Airlines'],
  [/\bcontinental airlines\b/i, 'Continental Airlines'],
  [/\bamerica west\b/i, 'America West'],
  [/\bus airways\b/i, 'US Airways'],
  [/\bwells fargo\b/i, 'Wells Fargo'],
  [/\bfirst union\b/i, 'First Union'],
  [/\bcorestates\b/i, 'CoreStates'],
  [/\bgolden 1\b/i, 'Golden 1'],
  [/\bfrost bank\b/i, 'Frost Bank'],
  [/\brocket mortgage\b/i, 'Rocket Mortgage'],
  [/\brocket arena\b/i, 'Rocket'],
  [/\bfootprint\b/i, 'Footprint'],
  [/\bscotiabank\b/i, 'Scotiabank'],
  [/\bgainbridge\b/i, 'Gainbridge'],
  [/\bfiserv\b/i, 'Fiserv'],
  [/\bfedex\b/i, 'FedEx'],
  [/\bpaycom\b/i, 'Paycom'],
  [/\bkaseya\b/i, 'Kaseya'],
  [/\bintuit\b/i, 'Intuit'],
  [/\bbarclays\b/i, 'Barclays'],
  [/\bspectrum\b/i, 'Spectrum'],
  [/\bamway\b/i, 'Amway'],
  [/\bprudential\b/i, 'Prudential'],
  [/\bverizon\b/i, 'Verizon'],
  [/\bat&t\b/i, 'AT&T'],
  [/\bstaples\b/i, 'Staples'],
  [/\btarget\b/i, 'Target'],
  [/\bpepsi\b/i, 'Pepsi'],
  [/\btoyota\b/i, 'Toyota'],
  [/\bchase\b/i, 'Chase'],
  [/\bdelta\b/i, 'Delta'],
  [/\bmoda\b/i, 'Moda'],
  [/\bball arena\b/i, 'Ball'],
  [/\btd garden\b/i, 'TD'],
  [/\bfleetcenter\b/i, 'Fleet'],
  [/\bkia\b/i, 'Kia'],
  [/\barco\b/i, 'ARCO'],
  [/\bcapital one\b/i, 'Capital One'],
  [/\bunited center\b/i, 'United Airlines'],
];

const UNSPONSORED_ARENA_NAMES = [
  'madison square garden',
  'boston garden',
  'chicago stadium',
  'the forum',
  'the summit',
  'the palace of auburn hills',
  'alamodome',
  'brendan byrne arena',
  'meadowlands arena',
  'capital centre',
];

export function resolveArenaNamingRightsSponsor(
  arena: Partial<Pick<ArenaSourceInfo, 'name' | 'sponsor' | 'hasNamingRights'>>,
): string | null {
  const explicit = typeof arena.sponsor === 'string' ? arena.sponsor.trim() : '';
  if (explicit) return explicit;
  const name = typeof arena.name === 'string' ? arena.name.trim() : '';
  if (!name) return null;
  if (UNSPONSORED_ARENA_NAMES.includes(name.toLowerCase())) return null;
  const known = ARENA_SPONSOR_PATTERNS.find(([pattern]) => pattern.test(name));
  if (known) return known[1];
  if (arena.hasNamingRights === false) return null;
  if (arena.hasNamingRights !== true) return null;
  const inferred = name
    .replace(/\s+(Arena|Center|Centre|Fieldhouse|Forum|Garden|Coliseum|Pavilion|Dome|Stadium)$/i, '')
    .trim();
  return inferred && inferred.toLowerCase() !== name.toLowerCase() ? inferred : null;
}

let arenaMap: Map<string, ArenaSourceInfo> | null = null;
let arenaAliases: Map<string, string> | null = null;
let loadPromise: Promise<void> | null = null;

export function loadArenas(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = fetch(ARENA_URL)
    .then(response => response.json())
    .then((data: Record<string, ArenaSourceInfo>) => {
      arenaMap = new Map(Object.entries(data).map(([abbrev, arena]) => [abbrev.toUpperCase(), arena]));
      arenaAliases = new Map();
      for (const [abbrev, arena] of Object.entries(data)) {
        const arenaRows = [arena, ...Object.values(arena.seasons ?? {}), ...(arena.alternate ?? [])];
        for (const arenaRow of arenaRows) {
          for (const tenant of arenaRow.tenants ?? []) {
            const leagueTeamName = tenant.match(/^(.+?)\s+\((?:(?:BAA\/)?NBA|WNBA)\)/i)?.[1]?.trim();
            if (leagueTeamName) arenaAliases.set(leagueTeamName.toLowerCase(), abbrev.toUpperCase());
          }
        }
      }
    })
    .catch(() => {});
  return loadPromise;
}

export function getArenaForTeamAtSeason(
  team: { abbrev?: string; name?: string },
  season: number,
): ArenaInfo | null {
  if (!arenaMap) return null;
  const lookup = String(team.abbrev ?? team.name ?? '');
  const abbrev = arenaMap.has(lookup.toUpperCase())
    ? lookup.toUpperCase()
    : arenaAliases?.get(String(team.name ?? lookup).toLowerCase())
      ?? arenaAliases?.get(lookup.toLowerCase());
  const entry = abbrev ? arenaMap.get(abbrev) : undefined;
  if (!entry) return null;
  const datedRows = Object.entries(entry.seasons ?? {})
    .map(([year, arena]) => ({ year: Number(year), arena }))
    .filter(item => Number.isFinite(item.year));
  const dated = datedRows
    .filter(item => item.year <= season)
    .sort((left, right) => right.year - left.year)[0]?.arena;
  const entryAvailable = datedRows.length === 0
    && (entry.opened == null || Number(entry.opened) <= season);
  const arena = dated ?? (entryAvailable ? entry : null);
  if (!arena) return null;
  const historicalName = Object.entries(arena.names ?? {})
    .map(([year, name]) => ({ year: Number(year), name }))
    .filter(item => Number.isFinite(item.year) && item.year <= season)
    .sort((left, right) => right.year - left.year)[0]?.name;
  const name = String(historicalName ?? arena.name ?? entry.name ?? '').trim();
  if (!name) return null;
  const sponsor = resolveArenaNamingRightsSponsor(
    historicalName && historicalName !== arena.name
      ? { name, hasNamingRights: arena.hasNamingRights }
      : { ...arena, name },
  );
  return {
    ...arena,
    name,
    arena_name: name,
    arena_location: arena.location || entry.location || [arena.city ?? entry.city, arena.state ?? entry.state ?? arena.country ?? entry.country].filter(Boolean).join(', '),
    seating_capacity: Number(arena.capacity ?? 0),
    opening_year: Number(arena.opened ?? 0),
    imageUrl: arena.imgURL ?? undefined,
    formerNames: Object.entries(arena.names ?? {})
      .map(([year, formerName]) => ({ season: Number(year), name: formerName }))
      .filter(item => Number.isFinite(item.season) && item.season <= season)
      .sort((left, right) => right.season - left.season),
    tenants: arena.tenants ?? [],
    sponsor,
    hasNamingRights: arena.hasNamingRights ?? sponsor != null,
  };
}

export function getArenaHistoryForTeam(
  team: { abbrev?: string; name?: string },
  season: number,
): ArenaInfo[] {
  if (!arenaMap) return [];
  const lookup = String(team.abbrev ?? team.name ?? '');
  const abbrev = arenaMap.has(lookup.toUpperCase())
    ? lookup.toUpperCase()
    : arenaAliases?.get(String(team.name ?? lookup).toLowerCase())
      ?? arenaAliases?.get(lookup.toLowerCase());
  const entry = abbrev ? arenaMap.get(abbrev) : undefined;
  if (!entry) return [];
  const seen = new Set<string>();
  return Object.entries(entry.seasons ?? {})
    .map(([startSeason, arena]) => ({ startSeason: Number(startSeason), arena }))
    .filter(row => Number.isFinite(row.startSeason) && row.startSeason <= season)
    .sort((left, right) => right.startSeason - left.startSeason)
    .flatMap(({ startSeason, arena }) => {
      const key = arena.id ?? `${arena.name}:${arena.location}:${arena.opened ?? startSeason}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const name = String(Object.entries(arena.names ?? {})
        .map(([year, value]) => ({ year: Number(year), value }))
        .filter(item => Number.isFinite(item.year) && item.year <= season)
        .sort((left, right) => right.year - left.year)[0]?.value
        ?? arena.name ?? entry.name ?? '').trim();
      if (!name) return [];
      const sponsor = resolveArenaNamingRightsSponsor(
        name !== arena.name
          ? { name, hasNamingRights: arena.hasNamingRights }
          : { ...arena, name },
      );
      return [{
        ...arena,
        name,
        arena_name: name,
        arena_location: arena.location || entry.location || [arena.city ?? entry.city, arena.state ?? entry.state ?? arena.country ?? entry.country].filter(Boolean).join(', '),
        seating_capacity: Number(arena.capacity ?? 0),
        opening_year: Number(arena.opened ?? 0),
        imageUrl: arena.imgURL ?? undefined,
        formerNames: Object.entries(arena.names ?? {})
          .map(([year, formerName]) => ({ season: Number(year), name: formerName }))
          .filter(item => Number.isFinite(item.season) && item.season <= season)
          .sort((left, right) => right.season - left.season),
        tenants: arena.tenants ?? [],
        sponsor,
        hasNamingRights: arena.hasNamingRights ?? sponsor != null,
      }];
    });
}

export function getArenaForTeam(teamNameOrAbbrev: string): ArenaInfo | null {
  return getArenaForTeamAtSeason({ abbrev: teamNameOrAbbrev, name: teamNameOrAbbrev }, Number.MAX_SAFE_INTEGER);
}

export function isArenaDataLoaded(): boolean {
  return arenaMap !== null;
}
