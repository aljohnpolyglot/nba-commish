/**
 * ImagnPhotoService.ts
 * Fetches real NBA game action photos from imagn.com via Cloudflare Worker proxy.
 * Uses navigationSearchAjax when keyword IDs are known (more precise),
 * falls back to simpleSearchAjax for plain-text queries.
 */

const PROXY            = 'https://nbagamesimages.mogatas-princealjohn-05082003.workers.dev/?url=';
const IMAGN_SIMPLE     = 'https://imagn.com/simpleSearchAjax/';
const IMAGN_NAV        = 'https://imagn.com/navigationSearchAjax/';
const SEARCH_CG        = '44,45,328,129,180,164,127,143,300,192,306,312';
const SEARCH_CG_NAV    = '44,45,180,164,127,143,192';
const FROM_DATE_SIMPLE = '11/01/2025'; // slashes — simpleSearchAjax format
const FROM_DATE_NAV    = '11-01-2025'; // dashes  — navigationSearchAjax format

// ── Player keyword ID cache — NBA official IDs (same as imagn tag IDs) ───────
// Source: https://raw.githubusercontent.com/bttmly/nba/refs/heads/master/data/players.json
// Format: [{ firstName, lastName, playerId, teamId }]

const playerIdCache = new Map<string, number>(); // normalized full name → playerId
let playerCacheReady: Promise<void> | null = null;

function initPlayerCache(): Promise<void> {
  if (playerCacheReady) return playerCacheReady;
  playerCacheReady = fetch(
    'https://raw.githubusercontent.com/bttmly/nba/refs/heads/master/data/players.json'
  )
    .then(r => r.json())
    .then((players: Array<{ firstName: string; lastName: string; playerId: number }>) => {
      for (const p of players) {
        const name = `${p.firstName} ${p.lastName}`.toLowerCase();
        playerIdCache.set(name, p.playerId);
      }
      console.log(`[Imagn] player ID cache ready: ${playerIdCache.size} entries`);
    })
    .catch(err => {
      console.warn('[Imagn] failed to load player ID cache:', err);
    });
  return playerCacheReady;
}

// Team IDs still come from navigation responses (30 teams, populated after first query)
const teamIdCache = new Map<string, number>();

function cacheNavigationKeywords(navigation: any): void {
  if (!navigation) return;
  for (const section of ['Teams', 'Locations']) {
    const entries: any[] = navigation[section] || [];
    for (const entry of entries) {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number') {
        teamIdCache.set(entry[0].toLowerCase(), entry[1]);
      }
    }
  }
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ImagnPhoto {
  id          : number;
  setId       : number;
  headLine    : string;
  medUrl      : string;      // 450-425 CDN — use in social posts/UI
  largeUrl    : string;      // 1024-922    — use in news cover
  caption     : string;
  captionClean: string;
  players     : string[];    // tagged player names from keywordsLimit
  photographer: string;
  location    : string;
  date        : string;
  width       : number;
  height      : number;
  isTopPic    : boolean;
  isLandscape?: boolean;
}

export interface GamePhotoResult {
  photos        : ImagnPhoto[];
  captionStory  : string;
  activePlayers : string[];
  passivePlayers: string[];
  gameNarrative : {
    story          : string;
    topPerformers  : string[];
    inactivePlayers: string[];
  };
}

// ── Caption classification ────────────────────────────────────────────────────

const ACTIVE_VERBS = [
  'drives','dunks','dunk','makes','shoots','dribbles','rebounds',
  'layup','basket','three point basket','spins','scores','blocks',
  'steals','hangs on the rim','goes to the basket','goes to the hoop',
];
const PASSIVE_VERBS = [
  'reacts','laughs','points','walks','watches','on the bench',
  'during a timeout','sideline','talks with','claps',
];
const POSTGAME_VERBS = ['hugs','signs autographs','following the game','after the game'];

function classifyCaption(caption: string): 'active' | 'passive' | 'postgame' | 'crowd' {
  const c = caption.toLowerCase();
  if (POSTGAME_VERBS.some(v => c.includes(v))) return 'postgame';
  if (ACTIVE_VERBS.some(v => c.includes(v)))   return 'active';
  if (PASSIVE_VERBS.some(v => c.includes(v)))  return 'passive';
  return 'crowd';
}

// ── Bad caption filter ────────────────────────────────────────────────────────

const BAD_CAPTIONS = [
  'cheerleader','mascot','arena','crowd','fan ','fans ','general view',
  'halftime','pregame','warm up','warmup','head coach','coaching staff',
  'commissioner','press conference','interview','trophy','award',
];

function isBadCaption(caption: string): boolean {
  return BAD_CAPTIONS.some(b => caption.toLowerCase().includes(b));
}

export const TRUE_PASSIVE_CAPTIONS = [
  'on the bench', 'during a timeout', 'during timeout',
  'sideline', 'seated', 'sitting', 'walks off',
  'hugs', 'following the game', 'after the game',
  'towel', 'shakes hands', 'exchanges jerseys',
  'leaves the court', 'celebrates with', 'detailed view',
  'all star', 'all-star', 'rising stars',
];

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function proxyFetch(url: string, retries = 1): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error(`Imagn: HTTP ${res.status}`);
    const text = await res.text();
    if (text.trimStart().startsWith('<')) {
      if (attempt < retries) { await new Promise(r => setTimeout(r, 1500)); continue; }
      throw new Error('Imagn: got HTML (double-encoded or homepage)');
    }
    return JSON.parse(text);
  }
}

// ── Asset parser ──────────────────────────────────────────────────────────────

function parseAsset(raw: any): ImagnPhoto {
  const id = raw.id;
  const w  = parseInt(raw.width)  || 0;
  const h  = parseInt(raw.height) || 0;
  const players: string[] = (raw.keywordsLimit || [])
    .filter((k: any) => Array.isArray(k) && k[0] !== '...' && typeof k[1] === 'number')
    .map(([name]: [string]) => name);
  return {
    id,
    setId       : raw.setId          || 0,
    headLine    : raw.headLine       || '',
    medUrl      : (raw.hover_url || `https://imagn.com/image/thumb/450-425/${id}.jpg`).replace('cdn.imagn.com', 'imagn.com'),
    largeUrl    : `https://imagn.com/image/thumb/1024-922/${id}.jpg`,
    caption     : raw.caption        || '',
    captionClean: raw.captionClean   || '',
    players,
    photographer: raw.photographerCreditName || raw.photographer || '',
    location    : raw.location       || '',
    date        : raw.create_date || raw.upload_date ||
                  (raw.filename ? `${raw.filename.substring(0,4)}-${raw.filename.substring(4,6)}-${raw.filename.substring(6,8)}` : ''),
    width       : w,
    height      : h,
    isTopPic    : (raw.tags || []).includes('TopPic'),
    isLandscape : w >= h,
  };
}

const BAD_HEADLINES = ['all star', 'all-star', 'rising stars', 'celebrity game', 'slam dunk'];

function enrichPhoto(raw: any): ImagnPhoto | null {
  if (BAD_HEADLINES.some(w => (raw.headLine || '').toLowerCase().includes(w))) return null;
  return parseAsset(raw);
}

// ── Core search ───────────────────────────────────────────────────────────────

interface SearchParams {
  query?      : string;
  keywordIds? : number[];
  page?       : number;
  setId?      : number;
}

interface SearchResult {
  photos    : ImagnPhoto[];
  totalCount: number;
  pageCount : number;
  navigation: any;
}

async function searchPhotos(params: SearchParams): Promise<SearchResult> {
  let url: string;

  if (params.keywordIds?.length) {
    // lowercase names + + for spaces + dashes in date
    const tag = ',' + params.keywordIds
      .map(id => [...teamIdCache.entries(), ...playerIdCache.entries()]
        .find(([, v]) => v === id)?.[0] ?? '')
      .filter(Boolean)
      .map(n => n.toLowerCase().replace(/ /g, '+'))
      .join(',');
    const searchText = (params.query || '').toLowerCase().replace(/ /g, '+');
    url = `https://imagn.com/navigationSearchAjax/?q=nba&tag=${tag}&orientation=&widthMin=&widthMax=&frmdate=${FROM_DATE_NAV}&todate=03-31-2026&keyWord=&keywordTypes=&searchCGOnly=${SEARCH_CG_NAV}&searchType=navigation&sort=DESC&npage=${params.page || 1}&searchWithin=searchWithin&searchText=${searchText}&isSiteSearch=&pageToken=&lastPage=`;
  } else {
    const q = (params.query || '').replace(/ /g, '+');  // + not %20
    url = `https://imagn.com/simpleSearchAjax/?searchCGOnly=${SEARCH_CG}`;
    if (q) url += `&searchtxt=${q}`;
    if (params.setId) url += `&setId=${params.setId}`;
    if (params.page && params.page > 1) url += `&page=${params.page}`;
  }

  console.log('[Imagn] →', url);
  const data = await proxyFetch(url);

  // Populate team ID cache from navigation
  if (data?.results?.navigation) cacheNavigationKeywords(data.results.navigation);

  const assets: any[] = data?.results?.content?.assetsForPage
    || data?.content?.assetsForPage
    || [];

  return {
    photos    : assets.map(enrichPhoto).filter((p): p is ImagnPhoto => p !== null),
    totalCount: data?.results?.resultCount || data?.resultCount || 0,
    pageCount : data?.results?.pageCount   || data?.pageCount   || 1,
    navigation: data?.results?.navigation  || {},
  };
}

// ── Post type suffix map ──────────────────────────────────────────────────────

type GamePostType =
  | 'recap' | 'blowout' | 'close' | 'overtime'
  | 'buzzer' | 'injury' | 'ejection' | 'celebration' | 'bench';

const POST_TYPE_SUFFIX: Record<GamePostType, string> = {
  recap      : 'nba basketball',
  blowout    : 'nba dunk layup',
  close      : 'nba basketball',
  overtime   : 'nba basketball overtime',
  buzzer     : 'nba shot buzzer',
  injury     : 'nba injury',
  ejection   : 'nba ejection technical',
  celebration: 'nba celebration',
  bench      : 'nba bench reaction',
};

// ── fetchGamePhotos ───────────────────────────────────────────────────────────

export async function fetchGamePhotos(opts: {
  homeTeam : { name: string; abbrev: string; [key: string]: any };
  awayTeam : { name: string; abbrev: string; [key: string]: any };
  count?   : number;
  postType?: GamePostType;
  maxPages?: number;
}): Promise<GamePhotoResult> {
  const empty: GamePhotoResult = { photos: [], captionStory: '', activePlayers: [], passivePlayers: [], gameNarrative: { story: '', topPerformers: [], inactivePlayers: [] } };

  try {
    const { homeTeam, awayTeam, count = 80, postType, maxPages = 4 } = opts;
    const homeTeamName = homeTeam.name;
    const awayTeamName = awayTeam.name;
    const suffix = postType ? POST_TYPE_SUFFIX[postType] : '';
    console.log('[Imagn] fetchGamePhotos:', awayTeamName, '@', homeTeamName);

    const homeId = teamIdCache.get(homeTeamName.toLowerCase());
    const awayId = teamIdCache.get(awayTeamName.toLowerCase());

    // Priority: keyword IDs (nav endpoint) → fallback plain text (simple endpoint)
    const queries: SearchParams[] = [
      // Best: both team IDs → most precise results
      ...(homeId && awayId
        ? [{ keywordIds: [homeId, awayId], query: `${awayTeamName} ${homeTeamName}` }]
        : []),
      // One team ID
      ...(awayId ? [{ keywordIds: [awayId], query: awayTeamName }] : []),
      ...(homeId ? [{ keywordIds: [homeId], query: homeTeamName }] : []),
      // Plain text fallbacks
      { query: `${awayTeamName} ${homeTeamName}${suffix ? ' ' + suffix : ''}` },
      { query: `${awayTeamName} ${homeTeamName}` },
    ];

    let allPhotos: ImagnPhoto[] = [];
    for (const params of queries) {
      try {
        const pageResults = await Promise.all(
          Array.from({ length: maxPages }, (_, i) =>
            searchPhotos({ ...params, page: i + 1 }).catch(() => ({ photos: [], totalCount: 0, pageCount: 1, navigation: {} } as SearchResult))
          )
        );
        const combined = pageResults.flatMap(r => r.photos);
        console.log('[Imagn] got', combined.length, 'raw assets across', maxPages, 'pages',
          params.keywordIds ? `(ids: ${params.keywordIds})` : `(text: "${params.query}")`);
        const filtered = combined.filter(p => p.medUrl && p.width >= 1500 && !isBadCaption(p.captionClean));
        console.log('[Imagn] after filter:', filtered.length);
        if (filtered.length >= 3) { allPhotos = filtered; break; }
        if (filtered.length > allPhotos.length) allPhotos = filtered;
      } catch (err) {
        console.warn('[Imagn] query failed:', params, err);
      }
    }

    if (!allPhotos.length) return empty;

    // Dedupe by setId — keep only the set that mentions one of the teams and has the most photos
    const setGroups = new Map<number, ImagnPhoto[]>();
    allPhotos.forEach(p => {
      if (!setGroups.has(p.setId)) setGroups.set(p.setId, []);
      setGroups.get(p.setId)!.push(p);
    });
    const homeWord = homeTeamName.toLowerCase().split(' ').pop()!;
    const awayWord = awayTeamName.toLowerCase().split(' ').pop()!;
    let bestPhotos: ImagnPhoto[] = [];
    for (const [, photos] of setGroups.entries()) {
      const hl = (photos[0]?.headLine || '').toLowerCase();
      const mentionsTeam = hl.includes(homeWord) || hl.includes(awayWord);
      if (mentionsTeam && photos.length > bestPhotos.length) bestPhotos = photos;
    }
    // Fall back to all photos if no set matched a team (e.g. setId = 0 on all)
    if (bestPhotos.length) allPhotos = bestPhotos;

    // Prefer landscape TopPic action shots
    const topPics = allPhotos.filter(p => p.isTopPic && p.isLandscape);
    const rest    = allPhotos.filter(p => !p.isTopPic || !p.isLandscape);
    const sorted  = [...topPics, ...rest].slice(0, count);

    // Build caption intelligence
    const activePlayers : string[] = [];
    const passivePlayers: string[] = [];
    const seen = new Set<string>();
    for (const photo of allPhotos) {
      const type = classifyCaption(photo.captionClean);
      for (const player of photo.players) {
        if (seen.has(player)) continue;
        seen.add(player);
        if (type === 'active')  activePlayers.push(player);
        if (type === 'passive') passivePlayers.push(player);
      }
    }

    const captionStory = allPhotos
      .filter(p => classifyCaption(p.captionClean) === 'active' && p.captionClean)
      .slice(0, 3)
      .map(p => p.captionClean)
      .join(' ');

    return {
      photos: sorted, captionStory, activePlayers, passivePlayers,
      gameNarrative: { story: captionStory, topPerformers: activePlayers, inactivePlayers: passivePlayers },
    };

  } catch {
    return empty;
  }
}

// ── fetchPlayerPhotos ─────────────────────────────────────────────────────────

type PlayerStatType = 'shooting' | 'dunk' | 'three' | 'general';

const STAT_TYPE_SUFFIX: Record<PlayerStatType, string> = {
  shooting: 'nba shooting',
  dunk    : 'nba dunk',
  three   : 'nba three',
  general : 'nba basketball',
};

export async function fetchPlayerPhotos(opts: {
  player  : { name: string; [key: string]: any };
  statType?: PlayerStatType;
  count?   : number;
}): Promise<{ photos: ImagnPhoto[] }> {
  try {
    const { player, statType = 'general', count = 4 } = opts;
    const playerName = player.name;
    const suffix     = STAT_TYPE_SUFFIX[statType];
    await initPlayerCache();
    const playerId = playerIdCache.get(playerName.toLowerCase());

    const queries: SearchParams[] = [
      // Best: player keyword ID
      ...(playerId ? [{ keywordIds: [playerId], query: suffix }] : []),
      // Plain text fallbacks
      { query: `${playerName} ${suffix}` },
      { query: `${playerName} nba basketball` },
      { query: playerName },
    ];

    const nameLower = playerName.toLowerCase();
    let best: ImagnPhoto[] = [];

    for (const params of queries) {
      try {
        const result = await searchPhotos(params);
        const filtered = result.photos.filter(p =>
          p.medUrl &&
          !isBadCaption(p.captionClean) &&
          p.players.some(n => n.toLowerCase().includes(nameLower) || nameLower.includes(n.toLowerCase()))
        );
        if (filtered.length >= 2) { best = filtered; break; }
        if (filtered.length > best.length) best = filtered;
      } catch { continue; }
    }

    // Portrait-first, then landscape
    const portrait  = best.filter(p => !p.isLandscape);
    const landscape = best.filter(p =>  p.isLandscape);
    return { photos: [...portrait, ...landscape].slice(0, count) };

  } catch {
    return { photos: [] };
  }
}

// ── fetchGamePhotoPreview ─────────────────────────────────────────────────────

export async function fetchGamePhotoPreview(opts: {
  homeTeam: { name: string; abbrev: string; [key: string]: any };
  awayTeam: { name: string; abbrev: string; [key: string]: any };
}): Promise<ImagnPhoto[]> {
  const result = await fetchGamePhotos({ ...opts, count: 3 });
  return result.photos;
}

// ── fetchGamePlayerPhotos ─────────────────────────────────────────────────────

// Cache: gameKey → per-player photo arrays
const gamePlayerPhotoCache = new Map<string, { playerName: string; photos: ImagnPhoto[] }[]>();

export async function fetchGamePlayerPhotos(opts: {
  homeTeam   : { name: string; abbrev: string; [key: string]: any };
  awayTeam   : { name: string; abbrev: string; [key: string]: any };
  topPlayers : { name: string; gameScore: number }[];
  gameKey    : string;
}): Promise<Map<string, ImagnPhoto[]>> {
  const { homeTeam, awayTeam, topPlayers, gameKey } = opts;

  if (gamePlayerPhotoCache.has(gameKey)) {
    const cached = gamePlayerPhotoCache.get(gameKey)!;
    return new Map(cached.map(e => [e.playerName, e.photos]));
  }

  // BUG FIX: deduplicate team names — intra-squad scrimmages have homeTeam === awayTeam,
  // which produced "Utah+Jazz+Utah+Jazz+Player" in the search URL.
  const teamNames = homeTeam.name === awayTeam.name
    ? homeTeam.name
    : `${homeTeam.name} ${awayTeam.name}`;
  const teamQuery = teamNames.replace(/ /g, '+');
  const result = new Map<string, ImagnPhoto[]>();

  await Promise.all(topPlayers.slice(0, 5).map(async ({ name }) => {
    const playerQuery = name.replace(/ /g, '+');
    const url = `https://imagn.com/simpleSearchAjax/?searchCGOnly=${SEARCH_CG}&searchtxt=${teamQuery}+${playerQuery}`;
    console.log(`[Imagn] player search → ${url}`);
    try {
      const data = await proxyFetch(url);
      const assets: any[] = data?.content?.assetsForPage || data?.results?.content?.assetsForPage || [];
      const photos = assets
        .map(enrichPhoto)
        .filter((p): p is ImagnPhoto =>
          p !== null &&
          !TRUE_PASSIVE_CAPTIONS.some(w => (p.captionClean || '').toLowerCase().includes(w))
        );
      if (photos.length > 0) result.set(name, photos);
    } catch { /* silent */ }
  }));

  gamePlayerPhotoCache.set(gameKey, [...result.entries()].map(([playerName, photos]) => ({ playerName, photos })));
  return result;
}

export const ImagnPhotoService = { fetchGamePhotos, fetchGamePhotoPreview, fetchPlayerPhotos, fetchGamePlayerPhotos };
export default ImagnPhotoService;
