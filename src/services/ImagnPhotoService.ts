import {
  buildImagnSearchUrl,
  isImagnCandidateEligible,
  isImagnPrimarySubject,
  normalizeImagnKeywordEntry,
  normalizePhotoAction,
  resolveImagnLeagueTerm,
  resolveImagnTeamSearchNames,
  resolveImagnSearchWindows,
  scoreImagnCandidate,
  type ImagnSearchContext,
  type ImagnSearchWindow,
} from './imagnPhotoSearch';

const PROXY            = 'https://nbagamesimages.mogatas-princealjohn-05082003.workers.dev/?url=';
const SEARCH_CG        = '44,45,328,129,180,164,127,143,300,192,306,312';
const SEARCH_CG_NAV    = '44,45,180,164,127,143,192';

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
  source?      : 'imagn' | 'getty';
  creditLine?  : string;
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
    .map(normalizeImagnKeywordEntry)
    .filter((keyword: ReturnType<typeof normalizeImagnKeywordEntry>): keyword is NonNullable<ReturnType<typeof normalizeImagnKeywordEntry>> => (
      keyword !== null && keyword.name !== '...'
    ))
    .map((keyword) => keyword.name);
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
    source      : 'imagn',
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
  keywordNames?: string[];
  page?       : number;
  setId?      : number;
  leagueTerm  : string;
  window      : ImagnSearchWindow;
}

interface SearchResult {
  photos    : ImagnPhoto[];
  totalCount: number;
  pageCount : number;
  navigation: any;
}

async function searchPhotos(params: SearchParams): Promise<SearchResult> {
  const url = buildImagnSearchUrl({
    query: params.query,
    keywordNames: params.keywordIds?.length ? params.keywordNames : undefined,
    page: params.page,
    setId: params.setId,
    leagueTerm: params.leagueTerm,
    window: params.window,
    simpleContentGroups: SEARCH_CG,
    navigationContentGroups: SEARCH_CG_NAV,
  });

  console.log('[Imagn] →', url);
  const data = await proxyFetch(url);

  const navigation = data?.results?.navigation ?? data?.navigation ?? {};

  const assets: any[] = data?.results?.content?.assetsForPage
    || data?.content?.assetsForPage
    || [];

  return {
    photos    : assets.map(enrichPhoto).filter((p): p is ImagnPhoto => p !== null),
    totalCount: data?.results?.resultCount || data?.resultCount || 0,
    pageCount : data?.results?.pageCount   || data?.pageCount   || 1,
    navigation,
  };
}

// ── Post type suffix map ──────────────────────────────────────────────────────

type GamePostType =
  | 'recap' | 'blowout' | 'close' | 'overtime'
  | 'buzzer' | 'injury' | 'ejection' | 'celebration' | 'bench';

const POST_TYPE_SUFFIX: Record<GamePostType, string> = {
  recap      : 'basketball',
  blowout    : 'dunk layup',
  close      : 'basketball',
  overtime   : 'basketball overtime',
  buzzer     : 'shot buzzer',
  injury     : 'injury',
  ejection   : 'ejection technical',
  celebration: 'celebration',
  bench      : 'bench reaction',
};

// ── fetchGamePhotos ───────────────────────────────────────────────────────────

export async function fetchGamePhotos(opts: {
  homeTeam : { name: string; abbrev: string; [key: string]: any };
  awayTeam : { name: string; abbrev: string; [key: string]: any };
  count?   : number;
  postType?: GamePostType;
  maxPages?: number;
  date?    : string;
  season?  : number;
  league?  : string;
  competitionId?: string;
  uiMode?  : string;
  branchCutoffDate?: string;
}): Promise<GamePhotoResult> {
  const empty: GamePhotoResult = { photos: [], captionStory: '', activePlayers: [], passivePlayers: [], gameNarrative: { story: '', topPerformers: [], inactivePlayers: [] } };

  try {
    const { homeTeam, awayTeam, count = 80, postType, maxPages = 4 } = opts;
    const { homeTeamName, awayTeamName } = resolveImagnTeamSearchNames(homeTeam, awayTeam);
    const suffix = postType ? POST_TYPE_SUFFIX[postType] : '';
    const gameDate = opts.date || new Date().toISOString().slice(0, 10);
    const context: ImagnSearchContext = {
      league: opts.league ?? 'NBA',
      competitionId: opts.competitionId,
      uiMode: opts.uiMode,
      season: opts.season ?? Number(gameDate.slice(0, 4)),
      gameDate,
      branchCutoffDate: opts.branchCutoffDate,
      homeTeamName,
      awayTeamName,
      action: normalizePhotoAction(postType),
    };
    const leagueTerm = resolveImagnLeagueTerm(context);
    console.log('[Imagn] fetchGamePhotos:', awayTeamName, '@', homeTeamName);

    let allPhotos: ImagnPhoto[] = [];
    searchWindows: for (const window of resolveImagnSearchWindows(context)) {
      const base = { leagueTerm, window };
      const queries: SearchParams[] = [
        { ...base, query: `${awayTeamName} ${homeTeamName}${suffix ? ` ${suffix}` : ''}` },
      ];
      for (const params of queries) {
        try {
          const pageResults = await Promise.all(Array.from({ length: maxPages }, (_, index) =>
            searchPhotos({ ...params, page: index + 1 }).catch(() => ({ photos: [], totalCount: 0, pageCount: 1, navigation: {} } as SearchResult)),
          ));
          const filtered = pageResults.flatMap(result => result.photos).filter(photo =>
            photo.medUrl && photo.width >= 1500 && !isBadCaption(photo.captionClean) && isImagnCandidateEligible(photo, context, [window]),
          );
          if (filtered.length >= 3) {
            allPhotos = filtered;
            break searchWindows;
          }
          if (filtered.length > allPhotos.length) allPhotos = filtered;
        } catch (err) {
          console.warn('[Imagn] query failed:', params, err);
        }
      }
      if (allPhotos.length) break;
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
  topPlayers : { name: string; gameScore: number; [key: string]: any }[];
  gameKey    : string;
  date       : string;
  season     : number;
  league     : string;
  competitionId?: string;
  uiMode?    : string;
  branchCutoffDate?: string;
  actionHint?: string;
}): Promise<Map<string, ImagnPhoto[]>> {
  const { homeTeam, awayTeam, topPlayers, gameKey } = opts;

  if (gamePlayerPhotoCache.has(gameKey)) {
    const cached = gamePlayerPhotoCache.get(gameKey)!;
    return new Map(cached.map(e => [e.playerName, e.photos]));
  }

  const {
    homeTeamName,
    awayTeamName,
    combinedTeamNames: teamNames,
  } = resolveImagnTeamSearchNames(homeTeam, awayTeam);
  const baseContext: ImagnSearchContext = {
    league: opts.league,
    competitionId: opts.competitionId,
    uiMode: opts.uiMode,
    season: opts.season,
    gameDate: opts.date,
    branchCutoffDate: opts.branchCutoffDate,
    homeTeamName,
    awayTeamName,
    action: normalizePhotoAction(opts.actionHint),
  };
  const leagueTerm = resolveImagnLeagueTerm(baseContext);
  const windows = resolveImagnSearchWindows(baseContext);
  const result = new Map<string, ImagnPhoto[]>();

  await Promise.all(topPlayers.slice(0, 5).map(async ({ name, teamId }) => {
    const homeTeamId = Number(homeTeam.id ?? homeTeam.tid);
    const awayTeamId = Number(awayTeam.id ?? awayTeam.tid);
    const playerTeamId = Number(teamId);
    const playerTeamName = Number.isFinite(playerTeamId) && playerTeamId === homeTeamId
      ? homeTeamName
      : Number.isFinite(playerTeamId) && playerTeamId === awayTeamId
        ? awayTeamName
        : '';
    const context = { ...baseContext, playerName: name, playerTeamName: playerTeamName || undefined };
    let best: ImagnPhoto[] = [];
    for (const window of windows) {
      const base = { leagueTerm, window };
      const queries: SearchParams[] = [];
      const queryKeys = new Set<string>();
      const addQuery = (params: SearchParams): void => {
        const key = JSON.stringify([params.keywordIds ?? [], params.query ?? '']);
        if (!queryKeys.has(key)) {
          queryKeys.add(key);
          queries.push(params);
        }
      };
      if (teamNames) addQuery({ ...base, query: `${teamNames} ${name}` });
      const fallbackTeamNames = [...new Set([playerTeamName, homeTeamName, awayTeamName].filter(Boolean))];
      for (const teamName of fallbackTeamNames) {
        addQuery({ ...base, query: `${teamName} ${name}` });
      }
      addQuery({ ...base, query: name });
      for (const params of queries) {
        const photos = await searchPhotos(params).then(response => response.photos).catch(error => {
          console.warn(`[Imagn] player query failed for ${name}:`, error);
          return [];
        });
        const eligible = photos
          .filter(photo => !TRUE_PASSIVE_CAPTIONS.some(word => (photo.captionClean || '').toLowerCase().includes(word)))
          .filter(photo => isImagnCandidateEligible(photo, context, [window]))
          .filter(photo => isImagnPrimarySubject(name, photo.captionClean || photo.caption || ''))
          .sort((left, right) => scoreImagnCandidate(right, context) - scoreImagnCandidate(left, context));
        if (eligible.length) {
          best = eligible;
          break;
        }
      }
      if (best.length) break;
    }
    if (best.length) result.set(name, best);
  }));

  if (result.size > 0) {
    gamePlayerPhotoCache.set(gameKey, [...result.entries()].map(([playerName, photos]) => ({ playerName, photos })));
  }
  return result;
}

export const ImagnPhotoService = { fetchGamePhotos, fetchGamePhotoPreview, fetchGamePlayerPhotos };
export default ImagnPhotoService;
