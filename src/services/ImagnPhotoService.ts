import type { NBATeam, NBAPlayer } from '../types';

const PROXY_BASE        = 'https://nbagamesimages.mogatas-princealjohn-05082003.workers.dev/?url=';
const IMAGN_SIMPLE      = 'https://imagn.com/simpleSearchAjax/';
const IMAGN_NAV         = 'https://imagn.com/navigationSearchAjax/';
const SEARCH_CG_SIMPLE  = '44,45,328,129,180,164,127,143,300,192,306,312';
const SEARCH_CG_NAV     = '44,45,180,164,127,143,192';
const FROM_DATE         = '11/01/2025';

// ─── Caption Intelligence (unchanged) ────────────────────────────────────────

const ACTIVE_VERBS = [
  'drives', 'dunks', 'dunk', 'makes', 'shoots', 'shooting',
  'dribbles', 'dribbling', 'rebounds', 'rebound', 'layup',
  'basket', 'three point basket', 'jumper', 'spins', 'scores',
  'blocks', 'steals', 'passes', 'assists', 'alley-oop',
  'slams', 'finger roll', 'floater', 'hook shot', 'tip-in',
  'goes to the basket', 'goes to the hoop', 'drives to the hoop',
  'drives to the basket', 'hangs on the rim',
] as const;

const PASSIVE_VERBS = [
  'reacts', 'laughs', 'points', 'walks', 'watches', 'gestures',
  'looks on', 'on the bench', 'during a timeout', 'during timeout',
  'sideline', 'stands', 'sitting', 'seated',
  'talks with', 'claps', 'celebrates from',
] as const;

const STAR_MOMENT_VERBS = [
  'dunks', 'dunk', 'hangs on the rim', 'alley-oop',
  'three point basket', 'buzzer', 'game-winner',
  'blocks', 'steal', '50 point', '40 point',
] as const;

const POSTGAME_VERBS = [
  'hugs', 'signs autographs', 'following the game',
  'after the game', 'talks with', 'shakes hands',
  'exchanges jerseys', 'walks off',
] as const;

const QUARTER_LABELS: Record<string, number> = {
  'first quarter':  1,
  'second quarter': 2,
  'third quarter':  3,
  'fourth quarter': 4,
  'overtime':       5,
  'halftime':       0,
};

// ─── Types (unchanged) ────────────────────────────────────────────────────────

export interface ImagnPhoto {
  id: number;
  setId: number;
  headLine: string;
  caption: string;
  captionClean: string;
  photographer: string;
  date: string;
  location: string;
  width: number;
  height: number;
  fileSize: number;
  filename: string;
  tags: string[];
  isTopPic: boolean;
  players: PlayerTag[];
  thumbUrl: string;
  medUrl: string;
  largeUrl: string;
  orientation: 'landscape' | 'portrait' | 'square';
  quarter: number | null;
  actionType: CaptionActionType;
  isPostgame: boolean;
}

export interface PlayerTag {
  name: string;
  keywordId: number;
}

export type CaptionActionType =
  | 'active'
  | 'passive'
  | 'star_moment'
  | 'postgame'
  | 'crowd'
  | 'unknown';

export interface PlayerActivitySummary {
  playerName: string;
  teamName: string;
  activePhotoCount: number;
  passivePhotoCount: number;
  likelyInactive: boolean;
  likelyDNP: boolean;
  activeQuarters: number[];
  topMoment: string | null;
  captions: string[];
  keywordId: number | null;
}

export interface GamePhotoNarrative {
  story: string;
  apparentWinner: string | null;
  keyMoments: string[];
  inactivePlayers: string[];
  topPerformers: string[];
  hasPostgamePhotos: boolean;
  confirmedArena: string | null;
}

export interface ImagnGallery {
  setId: number;
  title: string;
  date: string;
  photoCount: number;
  photos: ImagnPhoto[];
  activitySummary: PlayerActivitySummary[];
  gameNarrative: GamePhotoNarrative;
}

// ─── Caption Analyzers (unchanged) ───────────────────────────────────────────

function detectQuarter(caption: string): number | null {
  const lower = caption.toLowerCase();
  for (const [label, num] of Object.entries(QUARTER_LABELS)) {
    if (lower.includes(label)) return num;
  }
  return null;
}

function detectActionType(caption: string): CaptionActionType {
  const lower = caption.toLowerCase();
  if (POSTGAME_VERBS.some(v => lower.includes(v)))    return 'postgame';
  if (STAR_MOMENT_VERBS.some(v => lower.includes(v))) return 'star_moment';
  if (ACTIVE_VERBS.some(v => lower.includes(v)))      return 'active';
  if (PASSIVE_VERBS.some(v => lower.includes(v)))     return 'passive';
  return 'crowd';
}

function enrichPhoto(raw: any): ImagnPhoto {
  const w = parseInt(raw.width)  || 0;
  const h = parseInt(raw.height) || 0;

  const players: PlayerTag[] = (raw.keywordsLimit || [])
    .filter((kw: any) => Array.isArray(kw) && kw[0] !== '...' && typeof kw[1] === 'number')
    .map(([name, keywordId]: [string, number]) => ({ name, keywordId }));

  const caption    = raw.caption || '';
  const quarter    = detectQuarter(caption);
  const actionType = detectActionType(caption);
  const isPostgame = POSTGAME_VERBS.some(v => caption.toLowerCase().includes(v));

  return {
    id           : raw.id,
    setId        : raw.set_id,
    headLine     : raw.headLine || raw.headline || '',
    caption,
    captionClean : raw.captionClean || '',
    photographer : raw.photographerCreditName || raw.photographer || '',
    date         : raw.create_date || raw.upload_date || '',
    location     : raw.location || '',
    width        : w,
    height       : h,
    fileSize     : parseInt(raw.file_size) || 0,
    filename     : raw.filename || '',
    tags         : raw.tags || [],
    isTopPic     : (raw.tags || []).includes('TopPic'),
    players,
    thumbUrl     : raw.thumbnail_url || `https://cdn.imagn.com/image/thumb/250-225/${raw.id}.jpg`,
    medUrl       : raw.hover_url     || `https://cdn.imagn.com/image/thumb/450-425/${raw.id}.jpg`,
    largeUrl     : `https://imagn.com/image/thumb/1024-922/${raw.id}.jpg`,
    orientation  : w > h ? 'landscape' : h > w ? 'portrait' : 'square',
    quarter,
    actionType,
    isPostgame,
  };
}

// ─── Activity + Narrative builders (unchanged) ────────────────────────────────

function buildActivitySummary(photos: ImagnPhoto[]): PlayerActivitySummary[] {
  const playerMap = new Map<string, {
    keywordId: number | null;
    photos: ImagnPhoto[];
    teamHints: string[];
  }>();

  for (const photo of photos) {
    const teamHint = photo.headLine
      .replace('NBA: ', '')
      .split(' at ')
      .map(s => s.trim());

    for (const tag of photo.players) {
      if (!playerMap.has(tag.name)) {
        playerMap.set(tag.name, { keywordId: tag.keywordId, photos: [], teamHints: [] });
      }
      const entry = playerMap.get(tag.name)!;
      entry.photos.push(photo);
      const capLower = photo.captionClean.toLowerCase();
      for (const hint of teamHint) {
        if (capLower.includes(hint.toLowerCase().split(' ').pop()!.toLowerCase())) {
          entry.teamHints.push(hint);
        }
      }
    }
  }

  const summaries: PlayerActivitySummary[] = [];

  for (const [playerName, data] of playerMap.entries()) {
    const { photos: playerPhotos, keywordId } = data;
    const activePhotos   = playerPhotos.filter(p => p.actionType === 'active' || p.actionType === 'star_moment');
    const passivePhotos  = playerPhotos.filter(p => p.actionType === 'passive');
    const postgamePhotos = playerPhotos.filter(p => p.actionType === 'postgame');

    const activeQuarters = [...new Set(
      activePhotos.map(p => p.quarter).filter((q): q is number => q !== null && q > 0)
    )].sort();

    const starPhotos = playerPhotos.filter(p => p.actionType === 'star_moment');
    const topMoment  = starPhotos.length > 0
      ? starPhotos[0].captionClean
      : activePhotos.length > 0 ? activePhotos[0].captionClean : null;

    const teamCounts = new Map<string, number>();
    data.teamHints.forEach(t => teamCounts.set(t, (teamCounts.get(t) || 0) + 1));
    const teamName = [...teamCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

    const likelyInactive = activePhotos.length === 0 && passivePhotos.length >= 1;
    const likelyDNP      = playerPhotos.length > 0
      && activePhotos.length === 0
      && postgamePhotos.length === playerPhotos.length;

    summaries.push({
      playerName,
      teamName,
      activePhotoCount  : activePhotos.length,
      passivePhotoCount : passivePhotos.length,
      likelyInactive,
      likelyDNP,
      activeQuarters,
      topMoment,
      captions          : playerPhotos.map(p => p.captionClean).filter(Boolean),
      keywordId,
    });
  }

  return summaries.sort((a, b) => b.activePhotoCount - a.activePhotoCount);
}

function buildGameNarrative(
  photos: ImagnPhoto[],
  activity: PlayerActivitySummary[]
): GamePhotoNarrative {
  const keyMoments = photos
    .filter(p => p.actionType === 'star_moment' && p.captionClean)
    .map(p => p.captionClean)
    .slice(0, 5);

  const inactivePlayers = activity
    .filter(a => a.likelyInactive || a.likelyDNP)
    .map(a => `${a.playerName} (${a.likelyDNP ? 'likely DNP' : 'limited/bench'})`);

  const topPerformers = activity
    .filter(a => a.activePhotoCount >= 3)
    .slice(0, 4)
    .map(a => a.playerName);

  const postgamePhotos    = photos.filter(p => p.isPostgame);
  const hasPostgamePhotos = postgamePhotos.length > 0;

  let apparentWinner: string | null = null;
  const homeTeam = photos[0]?.headLine?.split(' at ')[1]?.replace('NBA: ', '') || null;

  if (hasPostgamePhotos) {
    const homeFanPhoto = postgamePhotos.find(p =>
      p.captionClean.toLowerCase().includes('fans') ||
      p.captionClean.toLowerCase().includes('autograph')
    );
    if (homeFanPhoto && homeTeam) apparentWinner = homeTeam;
  }

  const locationCounts = new Map<string, number>();
  photos.forEach(p => {
    if (p.location) locationCounts.set(p.location, (locationCounts.get(p.location) || 0) + 1);
  });
  const confirmedArena = [...locationCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const parts: string[] = [];
  if (topPerformers.length > 0)
    parts.push(`${topPerformers.slice(0, 2).join(' and ')} led the action according to Imagn photo coverage.`);
  if (keyMoments.length > 0)
    parts.push(`Key play: ${keyMoments[0]}`);
  if (inactivePlayers.length > 0)
    parts.push(`Photo evidence suggests ${inactivePlayers.join(', ')} may have been inactive or limited.`);
  if (hasPostgamePhotos && apparentWinner)
    parts.push(`Post-game photos suggest a ${apparentWinner} celebration.`);

  return { story: parts.join(' '), apparentWinner, keyMoments, inactivePlayers, topPerformers, hasPostgamePhotos, confirmedArena };
}

// ─── HTTP — with HTML detection + exponential retry ──────────────────────────

async function proxyFetch(url: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(PROXY_BASE + encodeURIComponent(url));
    if (!res.ok) throw new Error(`Imagn: HTTP ${res.status}`);

    const text = await res.text();

    // Rate-limited: imagn returned its HTML homepage instead of JSON
    if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      if (attempt < retries) {
        const wait = 2000 * (attempt + 1);
        console.warn(`[Imagn] rate limited, retry ${attempt + 1} in ${wait}ms…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw new Error('Imagn: invalid JSON');
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Imagn: invalid JSON');
    }
  }
}

// ─── Keyword Cache ────────────────────────────────────────────────────────────

const keywordIdCache = new Map<string, number>([
  // Players
  ['Stephen Curry',           127435],
  ['LeBron James',            109118],
  ['Luka Doncic',             816030],
  ['Giannis Antetokounmpo',   474594],
  ['Nikola Jokic',            701603],
  ['Shai Gilgeous-Alexander', 766647],
  ['Jayson Tatum',            721424],
  ['Kevin Durant',            116934],
  ['Anthony Davis',           106125],
  ['Devin Booker',            317623],
  ['Klay Thompson',           266691],
  ['Kyrie Irving',            350068],
  ['James Harden',            129011],
  ['Damian Lillard',          344973],
  ['Karl-Anthony Towns',      500793],
  ['Donovan Mitchell',        701757],
  ['Russell Westbrook',       125913],
  ['Anthony Edwards',         638364],
  ['Alperen Sengun',          4675723],
  ['Jalen Johnson',           520856],
  ['Rudy Gobert',             471060],
  ['Kristaps Porzingis',      558838],
  ['Brandin Podziemski',      4174123],
  ['Gary Payton II',          517563],
  ['Jaden McDaniels',         1013817],
  ['Ayo Dosunmu',             1456753],
  ['Donte DiVincenzo',        705244],
  ['Tari Eason',              6227089],
  ['Onyeka Okongwu',          6227018],
  ['Naz Reid',                1456800],
  ['Malevy Leons',            4981087],
  // Teams
  ['Golden State Warriors',   101189],
  ['Dallas Mavericks',        103978],
  ['Los Angeles Lakers',      106850],
  ['San Antonio Spurs',       120553],
  ['Cleveland Cavaliers',     101184],
  ['Los Angeles Clippers',    117758],
  ['Sacramento Kings',        127288],
  ['Boston Celtics',          112348],
  ['Utah Jazz',               270256],
  ['Minnesota Timberwolves',  112534],
  ['Chicago Bulls',           101180],
  ['Miami Heat',              101194],
  ['Phoenix Suns',            103977],
  ['Charlotte Hornets',       117464],
  ['New York Knicks',         466229],
  ['Houston Rockets',         101303],
  ['Toronto Raptors',         129524],
  ['Orlando Magic',           101187],
  ['Washington Wizards',      113642],
  ['Detroit Pistons',         101181],
  ['Denver Nuggets',          101196],
  ['Portland Trail Blazers',  107092],
  ['Atlanta Hawks',           100607],
  ['Oklahoma City Thunder',   266531],
  ['Memphis Grizzlies',       278461],
  ['Brooklyn Nets',           112355],
  ['Indiana Pacers',          101188],
  ['New Orleans Pelicans',    101189],
  ['Milwaukee Bucks',         101195],
]);

function cacheNavigationKeywords(navigation: any): void {
  for (const category of ['People', 'Teams', 'Locations', 'League']) {
    const items: any[] = navigation?.[category] || [];
    for (const item of items) {
      if (item.keyword && item.id) {
        keywordIdCache.set(item.keyword, parseInt(item.id));
      }
    }
  }
}

// ─── Core Search — routes to best endpoint ────────────────────────────────────

async function searchPhotos(params: {
  query?      : string;
  keywordIds? : number[];
  setId?      : number;
  page?       : number;
}): Promise<{ photos: ImagnPhoto[]; totalCount: number; pageCount: number; navigation: any }> {

  let url: URL;

  if (params.keywordIds?.length) {
    // navigationSearchAjax — precise keyword ID filtering
    url = new URL(IMAGN_NAV);
    url.searchParams.set('q',            params.query || '');
    url.searchParams.set('tag',          ',' + params.keywordIds.join(','));
    url.searchParams.set('searchCGOnly', SEARCH_CG_NAV);
    url.searchParams.set('searchType',   'navigation');
    url.searchParams.set('sort',         'DESC');
    url.searchParams.set('useAI',        'false');
    url.searchParams.set('npage',        String(params.page || 1));
    url.searchParams.set('frmdate',      FROM_DATE);
    url.searchParams.set('orientation',  '');
    url.searchParams.set('widthMin',     '');
    url.searchParams.set('widthMax',     '');
    url.searchParams.set('todate',       '');
    if (params.query) url.searchParams.set('keyWord', params.query.replace(/ /g, '+'));
  } else {
    // simpleSearchAjax — plain text fallback
    url = new URL(IMAGN_SIMPLE);
    url.searchParams.set('searchCGOnly', SEARCH_CG_SIMPLE);
    url.searchParams.set('frmdate',      FROM_DATE);
    if (params.query) url.searchParams.set('searchtxt', params.query);
    if (params.setId) url.searchParams.set('setId',     String(params.setId));
    if (params.page && params.page > 1) url.searchParams.set('page', String(params.page));
  }

  const data = await proxyFetch(url.toString());
  if (data?.results?.navigation) cacheNavigationKeywords(data.results.navigation);

  const assets: any[] =
    data?.results?.content?.assetsForPage ||
    data?.content?.assetsForPage ||
    [];

  return {
    photos     : assets.map(enrichPhoto),
    totalCount : data?.results?.resultCount || data?.resultCount || 0,
    pageCount  : data?.results?.pageCount   || data?.pageCount   || 1,
    navigation : data?.results?.navigation  || {},
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchGamePhotos(opts: {
  homeTeam  : NBATeam;
  awayTeam  : NBATeam;
  maxPages? : number;
}): Promise<ImagnGallery | null> {

  const { homeTeam, awayTeam, maxPages = 1 } = opts; // maxPages=1 to reduce rate limit risk

  const homeId = keywordIdCache.get(homeTeam.name);
  const awayId = keywordIdCache.get(awayTeam.name);

  // Strategy order: keyword IDs first (most precise), then text fallbacks
  const strategies: Array<Parameters<typeof searchPhotos>[0]> = [
    ...(homeId && awayId
      ? [{ keywordIds: [homeId, awayId], query: `${awayTeam.name} ${homeTeam.name}` }]
      : []),
    ...(awayId ? [{ keywordIds: [awayId], query: awayTeam.name }] : []),
    ...(homeId ? [{ keywordIds: [homeId], query: homeTeam.name }] : []),
    { query: `${awayTeam.name} ${homeTeam.name}` },
  ];

  let bestPhotos: ImagnPhoto[] = [];
  let bestSetId: number | null = null;
  let bestTitle = '';

  for (const strategy of strategies) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const { photos } = await searchPhotos({ ...strategy, page });
        if (!photos.length) break;

        const setGroups = new Map<number, ImagnPhoto[]>();
        photos.forEach(p => {
          if (!setGroups.has(p.setId)) setGroups.set(p.setId, []);
          setGroups.get(p.setId)!.push(p);
        });

        for (const [setId, setPhotos] of setGroups.entries()) {
          if (setPhotos.length > bestPhotos.length) {
            const titleLower   = setPhotos[0]?.headLine?.toLowerCase() || '';
            const mentionsHome = titleLower.includes(homeTeam.name.toLowerCase().split(' ').pop()!);
            const mentionsAway = titleLower.includes(awayTeam.name.toLowerCase().split(' ').pop()!);
            if (mentionsHome || mentionsAway) {
              bestPhotos = setPhotos;
              bestSetId  = setId;
              bestTitle  = setPhotos[0]?.headLine || '';
            }
          }
        }

        if (bestPhotos.length >= 5) break;
      } catch (e) {
        console.warn(`[Imagn] query failed:`, strategy, e);
      }
    }
    if (bestPhotos.length >= 5) break;
  }

  if (!bestPhotos.length) return null;

  const activitySummary = buildActivitySummary(bestPhotos);
  const gameNarrative   = buildGameNarrative(bestPhotos, activitySummary);

  return {
    setId    : bestSetId || bestPhotos[0].setId,
    title    : bestTitle,
    date     : bestPhotos[0]?.date || '',
    photoCount: bestPhotos.length,
    photos   : bestPhotos,
    activitySummary,
    gameNarrative,
  };
}

export async function fetchPlayerPhotos(opts: {
  player    : NBAPlayer;
  maxPhotos?: number;
}): Promise<{ photos: ImagnPhoto[]; keywordId: number | null }> {
  const { player, maxPhotos = 30 } = opts;
  let keywordId = keywordIdCache.get(player.name) || null;

  const allPhotos: ImagnPhoto[] = [];
  try {
    const { photos, navigation } = await searchPhotos(
      keywordId ? { keywordIds: [keywordId] } : { query: `${player.name} NBA` }
    );
    allPhotos.push(...photos);

    if (!keywordId && navigation?.People) {
      const match = navigation.People.find((p: any) =>
        p.keyword.toLowerCase() === player.name.toLowerCase()
      );
      if (match) {
        keywordId = parseInt(match.id);
        keywordIdCache.set(player.name, keywordId!);
      }
    }
  } catch (e) {
    console.warn(`[Imagn] player search failed for ${player.name}:`, e);
  }

  return { photos: allPhotos.slice(0, maxPhotos), keywordId };
}

export async function fetchTeamGalleries(opts: {
  team      : NBATeam;
  maxPages? : number;
}): Promise<ImagnGallery[]> {
  const { team, maxPages = 2 } = opts;
  const keywordId = keywordIdCache.get(team.name);
  const allPhotos: ImagnPhoto[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const { photos } = await searchPhotos(
        keywordId
          ? { keywordIds: [keywordId], page }
          : { query: team.name + ' NBA', page }
      );
      allPhotos.push(...photos);
    } catch { break; }
  }

  const setMap = new Map<number, ImagnPhoto[]>();
  allPhotos.forEach(p => {
    if (!setMap.has(p.setId)) setMap.set(p.setId, []);
    setMap.get(p.setId)!.push(p);
  });

  return [...setMap.entries()].map(([setId, photos]) => {
    const activitySummary = buildActivitySummary(photos);
    const gameNarrative   = buildGameNarrative(photos, activitySummary);
    return { setId, title: photos[0]?.headLine || '', date: photos[0]?.date || '', photoCount: photos.length, photos, activitySummary, gameNarrative };
  });
}

export async function fetchGamePhotoPreview(opts: {
  homeTeam : NBATeam;
  awayTeam : NBATeam;
  count?   : number;
}): Promise<ImagnPhoto[]> {
  const gallery = await fetchGamePhotos({ ...opts, maxPages: 1 });
  if (!gallery) return [];
  const topPics = gallery.photos.filter(p => p.isTopPic);
  const others  = gallery.photos.filter(p => !p.isTopPic);
  return [...topPics, ...others].slice(0, opts.count ?? 3);
}

export const keywordCache = {
  get : (key: string) => keywordIdCache.get(key) ?? null,
  set : (key: string, id: number) => keywordIdCache.set(key, id),
  has : (key: string) => keywordIdCache.has(key),
  all : () => Object.fromEntries(keywordIdCache),
};

export const ImagnPhotoService = {
  fetchGamePhotos,
  fetchGamePhotoPreview,
  fetchPlayerPhotos,
  fetchTeamGalleries,
  keywordCache,
};

export default ImagnPhotoService;