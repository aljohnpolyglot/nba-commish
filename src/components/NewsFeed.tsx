import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useGame } from '../store/GameContext';
import Navbar from './news/Navbar';
import SubNav from './news/SubNav';
import Footer from './news/Footer';
import ArticleCard from './news/ArticleCard';
import ArticleViewer from './news/ArticleViewer';
import Pagination from './news/Pagination';
import { NewsItem } from './news/types';
import { fetchWriters } from '../services/social/authorService';
import type { Author } from './news/types';
import { buildGamePhotoInfo, buildNewsPhotoRequest, enrichNewsWithPhoto, getResolvedPhotoCredit } from '../services/social/photoEnricher';
import type { GamePhotoInfo } from '../services/social/photoEnricher';
import type { GameResult, GameState, NBAPlayer } from '../types';
import { getPlayerImage } from './central/view/bioCache';
import { resolveAnyTeam } from '../utils/teamLookup';
import { getNewsMediaEra } from '../utils/mediaTimeline';
import { useLeagueLabels } from '../utils/leagueLabels';
import EraNewsFeed from './news/era/EraNewsFeed';
import EuroNewsPortalNav from './news/EuroNewsPortalNav';
import { buildEraTeams, isNewsAboutTeam, readJsonStorage } from './news/newsFeedHelpers';
import { buildSavedNbaSeasonRecaps, fetchPriorNbaSeasonRecap, previousNbaSeasonLabelForStartYear } from '../services/news/seasonRecaps';
import { isEuroIsolatedMode } from '../utils/uiMode';
import { normalizeDate } from '../utils/helpers';
import { resolveNewsBranding } from './news/branding';
import {
  articleMatchesEuroPortal,
  buildEuroNewsTeamOptions,
  buildSharedInternationalArticles,
  fetchEuroOpeningSeasonRecaps,
} from '../services/news/europeNews';
import { buildEuroEcosystemArticles } from '../services/news/europeEcosystemNews';
import { buildPbaEcosystemArticles } from '../services/news/pbaEcosystemNews';
import { buildNativeLeagueEcosystemArticles } from '../services/news/nativeLeagueEcosystemNews';
import { selectTopLeagueStories } from '../services/news/newsTopStories';
import { buildSharedLeagueArticles } from '../services/news/sharedLeagueNews';
import { isAnnouncementDateVisible } from '../services/social/socialPostVisibility';
import { resolveAllStarEventLogo } from '../services/allStar/allStarEventAssets';
import { loadHistoricalPbaTeamHistorySource } from '../services/pba/historicalRemoteSources';
import {
  loadWnbaLogoHistory,
  type WnbaLogoHistorySource,
} from '../services/teamIdentity/wnbaLogoHistory';
import type { NewsBrandKind } from './news/branding';
import { clearPendingNewsArticle, peekPendingNewsArticle } from './news/NewsFeedNav';
import { queryMediaArticle, queryMediaPage } from '../services/media/mediaReadModel';
import { getLeagueLifecycleMode } from '../services/lifecycle/leagueSeasonLifecycle';

function buildGameLookup(
  boxScores: GameResult[],
  teams: any[],
  nonNBATeams: any[],
  state: Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats' | 'nbaStartYear'>,
): Map<number, GamePhotoInfo> {
  const lookup = new Map<number, GamePhotoInfo>();
  for (const game of boxScores) {
    const homeTeam = resolveAnyTeam(game.homeTeamId, teams, nonNBATeams);
    const awayTeam = resolveAnyTeam(game.awayTeamId, teams, nonNBATeams);
    if (!homeTeam || !awayTeam) continue;
    lookup.set(game.gameId, buildGamePhotoInfo(game, homeTeam, awayTeam, state));
  }
  return lookup;
}

const CATEGORY_DISPLAY: Record<string, string> = {
  // Injuries
  major_injury:           'Injury Update',
  // Transactions
  signing_confirmed:      'Transaction',
  trade_confirmed:        'Transaction',
  euro_transfer_completed:'Transaction',
  euro_loan_completed:    'Transaction',
  // Breaking (high-impact single events)
  monster_performance:    'Breaking News',
  preseason_performance:  'Breaking News',
  triple_double:          'Breaking News',
  milestone:              'Breaking News',
  win_streak:             'Breaking News',
  long_win_streak:        'Breaking News',
  lose_streak:            'Breaking News',
  streak_snapped:         'Breaking News',
  all_star_winner:        'Breaking News',
  all_star_mvp:           'Breaking News',
  all_star_bracket:       'Breaking News',
  playoff_series_win:     'Breaking News',
  playoff_elimination:    'Breaking News',
  nba_champion:           'Breaking News',
  finals_mvp:             'Breaking News',
  // League News (recaps, rumors, coaching drama)
  batch_recap:            'League News',
  preseason_recap:        'League News',
  game_result:            'League News',
  duo_performance:        'Breaking News',
  team_feat:              'League News',
  trade_rumor:            'League News',
  coach_hot_seat:         'League News',
  league_contract_extension: 'League News',
  league_coaching_change: 'League News',
  international_field_set: 'International',
  international_champion: 'International',
  euro_domestic_champion: 'League News',
  euro_continental_champion: 'League News',
  euro_award_winner:      'Awards',
  euro_promotion:         'League News',
  euro_relegation:        'League News',
  euro_continental_qualification: 'League News',
  euro_license_decision:  'League News',
  euro_final_four:        'League News',
  euro_derby:             'League News',
  euro_media_rights:      'League News',
  euro_club_finance:      'League News',
  euro_academy_promotion: 'League News',
  euro_coaching_change:   'League News',
  euro_contract_extension:'League News',
  pba_game_recap:         'League News',
  pba_close_game:         'League News',
  pba_upset:              'Breaking News',
  pba_player_performance: 'Breaking News',
  pba_conference_preview: 'League News',
  pba_standings_race:     'League News',
  pba_playoff_series:     'League News',
  pba_finals_bound:       'Breaking News',
  pba_conference_champion:'Breaking News',
  pba_grand_slam:         'Breaking News',
  pba_all_star_captains:  'League News',
  pba_all_star_recap:     'League News',
  pba_contest_winner:     'League News',
  pba_award_winner:       'Awards',
  pba_draft_pick:         'League News',
  pba_import_signing:     'Transaction',
};

function resolveDisplayCategory(n: any): string {
  // 1. Stored category from NewsGenerator (most reliable)
  if (n.category && CATEGORY_DISPLAY[n.category]) return CATEGORY_DISPLAY[n.category];

  // 2. LLM-generated news has n.type set by normalizeResult
  const t = (n.type || '').toLowerCase();
  if (t.includes('injur'))                                     return 'Injury Update';
  if (t === 'trade' || t === 'signing' || t === 'transaction') return 'Transaction';
  if (t === 'breaking')                                        return 'Breaking News';

  // 3. Default
  return 'League News';
}

function resolvePlayerPortrait(text: string, players: NBAPlayer[]): string | undefined {
  if (!text || !players.length) return undefined;
  const lower = text.toLowerCase();
  // Try matching full name first (longer names first to avoid partial matches)
  const sorted = [...players].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    if (!p.name || p.name.length < 4) continue;
    if (lower.includes(p.name.toLowerCase())) {
      const img = getPlayerImage(p);
      if (img) return img;
    }
  }
  // Fallback: try last name match (only for names > 4 chars to avoid false positives)
  for (const p of sorted) {
    if (!p.name) continue;
    const lastName = p.name.split(/\s+/).pop() || '';
    if (lastName.length > 4 && lower.includes(lastName.toLowerCase())) {
      const img = getPlayerImage(p);
      if (img) return img;
    }
  }
  return undefined;
}

export function mapToNewsItem(
  n: any,
  authors: Author[],
  players: NBAPlayer[],
  uiMode: string | undefined,
  brandKind: NewsBrandKind,
  currentSeason: number,
  wnbaLogoSource: WnbaLogoHistorySource | null,
): NewsItem {
  const category = resolveDisplayCategory(n);

  const seed = (n.id || '').split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
  const author = authors.length > 0 ? authors[seed % authors.length] : undefined;

  // Format date to human-readable
  let dateStr = n.date || '';
  if (dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    try {
      dateStr = new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch { /* keep raw */ }
  }

  // Resolve image: explicit image > playerPortraitUrl > player match from game state
  let imageUrl = n.imageUrl || n.image || n.playerPortraitUrl;
  if (!imageUrl) {
    const text = `${n.headline || n.title || ''} ${n.content || ''}`;
    if (/all[ -]?star/i.test(text)) {
      const datedSeason = Number(String(n.date ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0]);
      imageUrl = resolveAllStarEventLogo({
        league: uiMode === 'pba_isolated'
          ? 'pba'
          : brandKind === 'wnba'
            ? 'wnba'
            : brandKind === 'nba'
              ? 'nba'
              : 'other',
        season: Number.isFinite(datedSeason) ? datedSeason : currentSeason,
        wnbaSource: wnbaLogoSource,
      });
    }
    imageUrl ||= resolvePlayerPortrait(text, players);
  }

  return {
    id: n.id || String(Math.random()),
    category,
    date: dateStr,
    title: n.headline || n.title || 'League Update',
    content: n.content || '',
    imageUrl,
    photoCredit: n.photoCredit,
    impact: n.impact === 'high' || n.impact === 'standard' ? n.impact : n.isNew ? 'high' : 'standard',
    url: n.url || '#',
    author: n.author || author,
    htmlContent: n.htmlContent,
    sourceUrl: n.sourceUrl,
    readMoreLinks: n.readMoreLinks,
    skipAiExpansion: n.skipAiExpansion,
    gameId:     n.gameId,
    homeTeamId: n.homeTeamId,
    awayTeamId: n.awayTeamId,
    teamIds: [...(Array.isArray(n.teamIds) ? n.teamIds : []), n.tid, n.teamId, n.homeTeamId, n.awayTeamId]
      .filter(tid => tid !== null && tid !== undefined && tid !== '')
      .map(Number)
      .filter((tid, index, tids) => Number.isFinite(tid) && tids.indexOf(tid) === index),
    countries: Array.isArray(n.countries) ? n.countries : undefined,
    competitionId: n.competitionId,
    league: n.league,
    leagueId: n.leagueId,
    scope: n.scope,
  };
}

const ARTICLES_PER_PAGE = 10;
const NEWS_PHOTO_CONCURRENCY = 2;
const NEWS_PHOTO_RETRY_DELAY_MS = 750;

export const NewsFeed: React.FC = () => {
  const { state } = useGame();
  const labels = useLeagueLabels();
  const seasonYear = state.leagueStats?.year ?? new Date(state.date).getFullYear();
  const mediaEra = getNewsMediaEra(seasonYear);
  const eraLeagueName =
    state.leagueStats?.leagueName?.trim() ||
    (labels.central || 'League Central').replace(/\s+Central$/, '') ||
    'League';
  const branding = resolveNewsBranding(state, eraLeagueName);
  const euroMode = isEuroIsolatedMode(state);
  const [pbaEventAssetsReady, setPbaEventAssetsReady] = useState(false);
  const [wnbaLogoSource, setWnbaLogoSource] = useState<WnbaLogoHistorySource | null>(null);
  useEffect(() => {
    if (state.leagueStats?.uiMode !== 'pba_isolated') return;
    loadHistoricalPbaTeamHistorySource()
      .then(() => setPbaEventAssetsReady(true))
      .catch(() => setPbaEventAssetsReady(false));
  }, [state.leagueStats?.uiMode]);
  useEffect(() => {
    let cancelled = false;
    setWnbaLogoSource(null);
    if (branding.kind !== 'wnba') return;
    loadWnbaLogoHistory()
      .then(source => {
        if (!cancelled) setWnbaLogoSource(source);
      })
      .catch(() => {
        if (!cancelled) setWnbaLogoSource(null);
      });
    return () => { cancelled = true; };
  }, [branding.kind]);
  const bookmarkStorageKey = `nba_news_bookmarks_${state.saveId || 'unsaved'}`;
  const aiCacheStorageKey = `nba_news_ai_cache_${state.saveId || 'unsaved'}`;
  const storagePairKey = `${bookmarkStorageKey}|${aiCacheStorageKey}`;

  const [authors, setAuthors] = useState<Author[]>([]);
  useEffect(() => { fetchWriters().then(setAuthors).catch(() => {}); }, []);

  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    return readJsonStorage(bookmarkStorageKey, []);
  });
  const [aiCache, setAiCache] = useState<Record<string, string>>(() => {
    return readJsonStorage(aiCacheStorageKey, {});
  });
  const [loadedStoragePairKey, setLoadedStoragePairKey] = useState(storagePairKey);

  useEffect(() => {
    if (loadedStoragePairKey === storagePairKey) return;
    setBookmarks(readJsonStorage(bookmarkStorageKey, []));
    setAiCache(readJsonStorage(aiCacheStorageKey, {}));
    setLoadedStoragePairKey(storagePairKey);
  }, [storagePairKey, loadedStoragePairKey, bookmarkStorageKey, aiCacheStorageKey]);

  useEffect(() => {
    if (loadedStoragePairKey !== storagePairKey || typeof localStorage === 'undefined') return;
    localStorage.setItem(bookmarkStorageKey, JSON.stringify(bookmarks));
  }, [bookmarkStorageKey, bookmarks, loadedStoragePairKey, storagePairKey]);

  useEffect(() => {
    if (loadedStoragePairKey !== storagePairKey || typeof localStorage === 'undefined') return;
    localStorage.setItem(aiCacheStorageKey, JSON.stringify(aiCache));
  }, [aiCacheStorageKey, aiCache, loadedStoragePairKey, storagePairKey]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedEuroCountry, setSelectedEuroCountry] = useState<string | null>(null);
  const [selectedEuroTeamId, setSelectedEuroTeamId] = useState<number | null>(null);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [queriedNews, setQueriedNews] = useState<any[]>([]);
  const [mediaQueryError, setMediaQueryError] = useState<string | null>(null);
  const [priorSeasonRecap, setPriorSeasonRecap] = useState<NewsItem | null>(null);
  const [euroOpeningRecaps, setEuroOpeningRecaps] = useState<NewsItem[]>([]);
  const asOfDate = normalizeDate(state.date);
  const mediaLeagueScope = getLeagueLifecycleMode(state);
  const mediaStateRevision = state.mediaEventRevision ?? state.saveRevision ?? 0;
  const mediaStateRef = useRef(state);
  mediaStateRef.current = state;
  useEffect(() => {
    const controller = new AbortController();
    setMediaQueryError(null);
    void queryMediaPage(mediaStateRef.current, {
      saveId: state.saveId ?? 'unsaved',
      stateRevision: mediaStateRevision,
      asOfDate,
      leagueScope: mediaLeagueScope,
      feed: 'news',
      limit: 50,
    }, controller.signal).then(page => {
      if (controller.signal.aborted) return;
      setQueriedNews(page.items.filter(item => 'headline' in item));
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMediaQueryError(error instanceof Error ? error.message : String(error));
    });
    return () => controller.abort();
  }, [asOfDate, mediaLeagueScope, mediaStateRevision, state.saveId]);
  const visibleBoxScores = useMemo(
    () => (state.boxScores ?? []).filter(box => normalizeDate(box.date) <= asOfDate),
    [asOfDate, state.boxScores],
  );
  const visibleNews = useMemo(
    () => [...(state.news ?? []), ...queriedNews]
      .filter(item => isAnnouncementDateVisible(item.date, state.date)),
    [queriedNews, state.date, state.news],
  );

  const openArticle = React.useCallback((article: NewsItem) => {
    setSelectedArticle(article);
    if (!article.id.startsWith('media:v1:')) return;
    const controller = new AbortController();
    void queryMediaArticle(mediaStateRef.current, article.id, mediaLeagueScope, controller.signal)
      .then(detail => setSelectedArticle(current => current?.id === article.id
        ? { ...current, content: detail.body }
        : current))
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setMediaQueryError(error instanceof Error ? error.message : String(error));
        }
      });
  }, [mediaLeagueScope]);

  // Imagn enriched image cache: articleId → resolved URL | null
  const [imagnImages, setImagnImages] = useState<Record<string, string | null>>({});
  const enrichingRef = useRef(new Set<string>());

  const gameLookup = useMemo(
    () => buildGameLookup(visibleBoxScores, state.teams || [], state.nonNBATeams || [], state),
    [visibleBoxScores, state.leagueStats, state.leagueType, state.moddedLeagueBase, state.nbaStartYear, state.nonNBATeams, state.teams]
  );
  const euroPortalTeams = useMemo(
    () => euroMode ? buildEuroNewsTeamOptions(state, seasonYear) : [],
    [euroMode, seasonYear, state],
  );
  const euroCountries = useMemo(
    () => [...new Set(euroPortalTeams.map(team => team.country))].sort((left, right) => left.localeCompare(right)),
    [euroPortalTeams],
  );
  const euroPortalTeamIds = useMemo(
    () => new Set(euroPortalTeams.flatMap(team => team.teamIds)),
    [euroPortalTeams],
  );
  const selectedEuroTeam = euroPortalTeams.find(team => team.id === selectedEuroTeamId) ?? null;
  const wnbaNewsTeamIds = useMemo(
    () => branding.kind === 'wnba'
      ? new Set(buildEraTeams(state).map(team => team.id))
      : new Set<number>(),
    [branding.kind, state.teams, state.nonNBATeams, state.userTeamId, state.leagueStats?.uiMode],
  );

  useEffect(() => {
    if (selectedEuroCountry && !euroCountries.includes(selectedEuroCountry)) {
      setSelectedEuroCountry(null);
      setSelectedEuroTeamId(null);
    } else if (selectedEuroTeamId != null && !euroPortalTeams.some(team => team.id === selectedEuroTeamId)) {
      setSelectedEuroTeamId(null);
    }
  }, [euroCountries, euroPortalTeams, selectedEuroCountry, selectedEuroTeamId]);

  const historicalNbaStartYear = state.leagueType === 'modded' && state.moddedLeagueBase === 'nba'
    ? Number(state.nbaStartYear ?? 0)
    : 0;
  const currentSeasonEndYear = Number(state.leagueStats?.year ?? 0);
  const openingNbaSeason = historicalNbaStartYear > 0
    && currentSeasonEndYear <= historicalNbaStartYear + 1;
  const recapStartYear = branding.kind === 'nba' && openingNbaSeason ? historicalNbaStartYear : 0;
  const targetRecapSeason = recapStartYear > 0
    ? previousNbaSeasonLabelForStartYear(recapStartYear)
    : null;
  const savedNbaSeasonRecaps = useMemo(
    () => branding.kind === 'nba'
      ? buildSavedNbaSeasonRecaps(state.seasonHistory, state.teams, state.players)
      : [],
    [branding.kind, state.seasonHistory, state.teams, state.players],
  );
  const euroSeedSeason = Number(state.euroleagueSeedSeason ?? state.euroStartSeason ?? 0);
  const openingEuroSeason = euroMode && euroSeedSeason > 0 && currentSeasonEndYear === euroSeedSeason;

  useEffect(() => {
    let cancelled = false;
    setPriorSeasonRecap(null);
    if (!targetRecapSeason || recapStartYear <= 0) return;

    fetchPriorNbaSeasonRecap(recapStartYear)
      .then(recap => {
        if (!cancelled) setPriorSeasonRecap(recap);
      })
      .catch(() => {
        if (!cancelled) setPriorSeasonRecap(null);
      });

    return () => { cancelled = true; };
  }, [targetRecapSeason, recapStartYear]);

  useEffect(() => {
    let cancelled = false;
    setEuroOpeningRecaps([]);
    if (!openingEuroSeason) return;

    fetchEuroOpeningSeasonRecaps(currentSeasonEndYear - 1, euroCountries)
      .then(recaps => {
        if (!cancelled) setEuroOpeningRecaps(recaps);
      })
      .catch(() => {
        if (!cancelled) setEuroOpeningRecaps([]);
      });

    return () => { cancelled = true; };
  }, [currentSeasonEndYear, euroCountries, openingEuroSeason]);

  const euroEcosystemArticles = useMemo(
    () => euroMode ? buildEuroEcosystemArticles(state, seasonYear, euroPortalTeams) : [],
    [euroMode, euroPortalTeams, seasonYear, state],
  );
  const pbaEcosystemArticles = useMemo(
    () => branding.kind === 'pba' ? buildPbaEcosystemArticles(state, seasonYear) : [],
    [branding.kind, seasonYear, state],
  );
  const nativeLeagueArticles = useMemo(
    () => branding.kind === 'nba' || branding.kind === 'wnba'
      ? buildNativeLeagueEcosystemArticles(state)
      : [],
    [branding.kind, state],
  );
  const internationalArticles = useMemo(
    () => buildSharedInternationalArticles(state),
    [state.date, state.leagueStats?.year, state.internationalTournament, state.internationalTournamentHistory],
  );
  const sharedLeagueArticles = useMemo(
    () => branding.kind === 'nba' || branding.kind === 'wnba' || branding.kind === 'pba' || state.leagueType === 'fictional'
      ? buildSharedLeagueArticles(state, seasonYear)
      : [],
    [branding.kind, seasonYear, state],
  );

  const allArticles = useMemo<NewsItem[]>(() => {
    const pbaGameIds = new Set(pbaEcosystemArticles.flatMap(article => article.gameId == null ? [] : [article.gameId]));
    const nativeGameIds = new Set(nativeLeagueArticles.flatMap(article => article.gameId == null ? [] : [article.gameId]));
    const hasPbaRosterStory = pbaEcosystemArticles.some(article => article.id === `pba-allstar-rosters-${seasonYear}`);
    const hasPbaWeekendStory = pbaEcosystemArticles.some(article => article.id === `pba-allstar-recap-${seasonYear}`);
    // Sort by date descending so newest articles always appear first regardless of insertion order.
    const gameNews = visibleNews
      .filter((n: any) => !n.teamOnly)
      .filter((n: any) => !(String(n.id || '').startsWith('seasonal-')))
      .filter((n: any) => {
        const category = String(n.category ?? '');
        if (
          (branding.kind === 'nba' || branding.kind === 'wnba')
          && nativeGameIds.has(Number(n.gameId))
          && (category === 'game_result' || category === 'batch_recap')
        ) return false;
        if (branding.kind !== 'pba') return true;
        if (pbaGameIds.has(Number(n.gameId)) && (category === 'game_result' || category === 'batch_recap')) return false;
        const headline = String(n.headline ?? n.title ?? '');
        if (hasPbaRosterStory && headline === 'PBA All-Star Rosters Set') return false;
        if (hasPbaWeekendStory && headline === 'PBA All-Star Weekend Complete') return false;
        return true;
      })
      .filter((n: any) => {
        if (!euroMode && branding.kind !== 'wnba') return true;
        const tids = [
          ...(Array.isArray(n.teamIds) ? n.teamIds : []),
          n.tid,
          n.teamId,
          n.homeTeamId,
          n.awayTeamId,
        ]
          .filter(tid => tid !== null && tid !== undefined && tid !== '')
          .map(Number)
          .filter(Number.isFinite);
        if (tids.length === 0) return true;
        const activeTids = euroMode ? euroPortalTeamIds : wnbaNewsTeamIds;
        return tids.some((tid: number) => activeTids.has(tid));
      })
      .slice()
      .sort((a: any, b: any) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return tb - ta;
      })
      .map(n => {
        const article = mapToNewsItem(
          n,
          authors,
          state.players || [],
          state.leagueStats?.uiMode,
          branding.kind,
          seasonYear,
          wnbaLogoSource,
        );
        const articleTeamIds = new Set(article.teamIds ?? []);
        const matchedEuroTeams = euroPortalTeams.filter(team => team.teamIds.some(tid => articleTeamIds.has(tid)));
        return {
          ...article,
          countries: [...new Set([...(article.countries ?? []), ...matchedEuroTeams.map(team => team.country)].filter(Boolean))],
        };
      });

    const nbaRecaps = priorSeasonRecap ? [priorSeasonRecap, ...savedNbaSeasonRecaps] : savedNbaSeasonRecaps;
    const seenIds = new Set<string>();
    const seenStories = new Set<string>();
    return [
      ...euroOpeningRecaps,
      ...euroEcosystemArticles,
      ...pbaEcosystemArticles,
      ...nativeLeagueArticles,
      ...internationalArticles,
      ...sharedLeagueArticles,
      ...nbaRecaps,
      ...gameNews,
    ].filter(article => isAnnouncementDateVisible(article.date, state.date)).filter(article => {
      const storyKey = `${article.title}::${article.content}`
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      if (seenIds.has(article.id) || seenStories.has(storyKey)) return false;
      seenIds.add(article.id);
      seenStories.add(storyKey);
      return true;
    }).sort((left, right) => {
      if (euroMode) {
        const leftIsRecap = left.category === 'Season Recap';
        const rightIsRecap = right.category === 'Season Recap';
        if (leftIsRecap !== rightIsRecap) return leftIsRecap ? 1 : -1;
      }
      if (priorSeasonRecap) {
        if (left.id === priorSeasonRecap.id) return -1;
        if (right.id === priorSeasonRecap.id) return 1;
      }
      return new Date(right.date).getTime() - new Date(left.date).getTime();
    });
  }, [visibleNews, authors, state.players, state.date, state.leagueStats?.uiMode, seasonYear, pbaEventAssetsReady, wnbaLogoSource, priorSeasonRecap, savedNbaSeasonRecaps, euroOpeningRecaps, euroEcosystemArticles, pbaEcosystemArticles, nativeLeagueArticles, internationalArticles, sharedLeagueArticles, branding.kind, euroMode, euroPortalTeamIds, euroPortalTeams, wnbaNewsTeamIds]);

  useEffect(() => {
    const pendingArticleId = peekPendingNewsArticle();
    if (!pendingArticleId) return;
    const article = allArticles.find(candidate => candidate.id === pendingArticleId);
    if (!article) return;
    setSelectedArticle(article);
    clearPendingNewsArticle(pendingArticleId);
  }, [allArticles]);

  const eraTeams = useMemo(
    () => euroMode ? euroPortalTeams.map(option => option.team) : buildEraTeams(state),
    [euroMode, euroPortalTeams, state.teams, state.nonNBATeams, state.userTeamId, state.leagueStats?.uiMode],
  );
  const filteredArticles = useMemo(() => {
    const selectedTeamId = eraTeams.find(team => team.name === selectedTeam)?.id;
    return allArticles.filter(article => {
      if (showBookmarksOnly && !bookmarks.includes(article.id)) return false;
      if (euroMode && !articleMatchesEuroPortal(article, selectedEuroCountry, selectedEuroTeam)) return false;
      if (!euroMode && selectedTeam) {
        if (selectedTeamId == null || !isNewsAboutTeam(article, selectedTeamId)) return false;
      }
      if (selectedType && article.category !== selectedType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!article.title.toLowerCase().includes(q) && !article.content.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allArticles, eraTeams, selectedTeam, selectedType, showBookmarksOnly, searchQuery, bookmarks, euroMode, selectedEuroCountry, selectedEuroTeam]);

  // When the hero section is visible (no filters), exclude the first 9 articles it already shows
  const heroSectionVisible = !searchQuery
    && !showBookmarksOnly
    && !selectedType
    && !selectedTeam
    && !selectedEuroCountry
    && selectedEuroTeamId == null
    && filteredArticles.length > 0;
  const latestNewsArticles = heroSectionVisible
    ? filteredArticles.slice(Math.min(9, filteredArticles.length))
    : filteredArticles;

  const totalPages = Math.max(1, Math.ceil(latestNewsArticles.length / ARTICLES_PER_PAGE));
  const paginatedArticles = latestNewsArticles.slice(
    (currentPage - 1) * ARTICLES_PER_PAGE,
    currentPage * ARTICLES_PER_PAGE
  );

  const resetPage = () => setCurrentPage(1);

  const handleSelectTeam = (team: string | null) => {
    setSelectedTeam(team);
    setSelectedType(null);
    resetPage();
  };

  const handleSelectType = (type: string | null) => {
    setSelectedType(type);
    resetPage();
  };

  const handleToggleBookmarks = () => {
    setShowBookmarksOnly(prev => !prev);
    setSelectedTeam(null);
    setSelectedEuroCountry(null);
    setSelectedEuroTeamId(null);
    setSelectedType(null);
    setSearchQuery('');
    resetPage();
  };

  const handleToggleBookmark = (id: string) => {
    setBookmarks(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  // Lazy Imagn enrichment — runs whenever visible articles change
  const visibleArticles = useMemo(() => {
    const ids = new Set<string>();
    return [
      ...filteredArticles.slice(0, 4),
      ...paginatedArticles,
      ...filteredArticles.slice(4, 9),
    ].filter(article => {
      if (ids.has(article.id)) return false;
      ids.add(article.id);
      return true;
    });
  }, [filteredArticles, paginatedArticles]);

  useEffect(() => {
    if (gameLookup.size === 0) return;
    let nextIndex = 0;
    const enrichVisibleArticles = async () => {
      while (nextIndex < visibleArticles.length) {
        const article = visibleArticles[nextIndex++];
        const id = article.id;
        if (enrichingRef.current.has(id) || id in imagnImages) continue;
        enrichingRef.current.add(id);
        try {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const url = await enrichNewsWithPhoto(
              buildNewsPhotoRequest(article),
              gameLookup,
              state.leagueType
            );
            const credit = getResolvedPhotoCredit(id, 'news');
            if (url && credit) {
              setImagnImages(prev => ({ ...prev, [id]: url }));
              break;
            }
            if (attempt === 0) {
              await new Promise(resolve => setTimeout(resolve, NEWS_PHOTO_RETRY_DELAY_MS));
            }
          }
        } finally {
          enrichingRef.current.delete(id);
        }
      }
    };
    void Promise.all(Array.from(
      { length: Math.min(NEWS_PHOTO_CONCURRENCY, visibleArticles.length) },
      enrichVisibleArticles,
    ));
  }, [visibleArticles, gameLookup, state.leagueType]); // imagnImages intentionally excluded to avoid loop

  // Merge enriched photo into article before rendering
  const withEnrichedImage = (article: NewsItem): NewsItem => {
    if (!(article.id in imagnImages)) return article;
    const url = imagnImages[article.id];
    return url ? { ...article, imageUrl: url, photoCredit: getResolvedPhotoCredit(article.id, 'news') } : article;
  };

  const topStories = useMemo(() => {
    return selectTopLeagueStories(euroMode ? filteredArticles : allArticles, visibleBoxScores, state.date);
  }, [allArticles, filteredArticles, euroMode, visibleBoxScores, state.date]);

  const heroArticle = filteredArticles[0];
  const relatedArticles = filteredArticles.slice(1, 4);
  const heroBelowArticles = filteredArticles.slice(4, 9);
  const featuredIds = new Set(heroSectionVisible ? filteredArticles.slice(0, 9).map(article => article.id) : []);
  const sidebarArticles = (topStories.length > 0 ? topStories : euroMode ? filteredArticles : allArticles)
    .filter(article => !featuredIds.has(article.id))
    .slice(0, 8);

  const showHeroSection = heroSectionVisible;
  const viewerTeams = useMemo(() => {
    const ids = new Set((state.teams ?? []).map(team => team.id));
    return [
      ...(state.teams ?? []),
      ...eraTeams.filter(team => !ids.has(team.id)),
    ];
  }, [state.teams, eraTeams]);
  if (mediaEra !== 'modern') {
    const eraArticles = filteredArticles.map(withEnrichedImage);
    const eraTopStories = topStories.map(withEnrichedImage);
    return (
      <div className="min-h-full flex flex-col">
        {euroMode && (
          <div className="relative z-30 px-3 sm:px-5" style={{ background: branding.secondary, color: '#fff' }}>
            <EuroNewsPortalNav
              branding={branding}
              countries={euroCountries}
              teams={euroPortalTeams}
              selectedCountry={selectedEuroCountry}
              selectedTeamId={selectedEuroTeamId}
              onSelectCountry={(country) => { setSelectedEuroCountry(country); resetPage(); }}
              onSelectTeam={(teamId) => { setSelectedEuroTeamId(teamId); resetPage(); }}
            />
          </div>
        )}
        <EraNewsFeed
          era={mediaEra}
          articles={eraArticles}
          topStories={eraTopStories}
          teams={eraTeams}
          nonNBATeams={state.nonNBATeams || []}
          boxScores={visibleBoxScores}
          players={state.players}
          seasonYear={seasonYear}
          date={state.date}
          leagueName={eraLeagueName}
          branding={branding}
          onOpen={openArticle}
        />

        <ArticleViewer
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
          isBookmarked={selectedArticle ? bookmarks.includes(selectedArticle.id) : false}
          onToggleBookmark={handleToggleBookmark}
          cachedContent={selectedArticle ? aiCache[selectedArticle.id] ?? null : null}
          onCacheContent={(id, content) => setAiCache(prev => ({ ...prev, [id]: content }))}
          boxScores={visibleBoxScores}
          teams={viewerTeams}
          mediaEra={mediaEra}
          branding={branding}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 font-sans text-gray-900 flex flex-col">
      <Navbar branding={branding} searchQuery={searchQuery} onSearchChange={(q) => { setSearchQuery(q); resetPage(); }} />

      <SubNav
        selectedTeam={selectedTeam}
        selectedType={selectedType}
        showBookmarksOnly={showBookmarksOnly}
        onSelectTeam={handleSelectTeam}
        onSelectType={handleSelectType}
        onToggleBookmarks={handleToggleBookmarks}
        gameTeams={eraTeams}
        branding={branding}
        euroPortal={euroMode ? {
          countries: euroCountries,
          teams: euroPortalTeams,
          selectedCountry: selectedEuroCountry,
          selectedTeamId: selectedEuroTeamId,
          onSelectCountry: (country) => { setSelectedEuroCountry(country); resetPage(); },
          onSelectTeam: (teamId) => { setSelectedEuroTeamId(teamId); resetPage(); },
        } : undefined}
      />

      <main className="flex-1">
        {branding.modernPromoImages[0] && (
          <section className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:pt-6">
            <img
              src={branding.modernPromoImages[0]}
              alt="PBA sponsor"
              className="mx-auto h-auto max-h-[140px] w-full max-w-[805px] object-contain"
            />
          </section>
        )}
        {showHeroSection && (
          <section className="max-w-[1400px] mx-auto px-4 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-9">
                <ArticleCard article={withEnrichedImage(heroArticle)} variant="hero" onOpen={openArticle} />
              </div>

              <div className="lg:col-span-3 flex flex-col gap-4">
                {relatedArticles.map((article) => (
                  <ArticleCard key={article.id} article={withEnrichedImage(article)} variant="related" onOpen={openArticle} />
                ))}
              </div>
            </div>

            {heroBelowArticles.length > 0 && (
              <div className="mt-8 pt-8 border-t border-gray-200">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-6">
                  More Stories
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {heroBelowArticles.map((article) => (
                    <ArticleCard key={article.id} article={withEnrichedImage(article)} variant="hero-bottom" onOpen={openArticle} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="max-w-[1400px] mx-auto px-4 py-8 border-t border-gray-100">
          <div className="flex flex-col lg:flex-row gap-12">
            <div className="flex-grow">
              <h2 className="text-sm font-black uppercase tracking-[0.15em] text-gray-900 mb-6 pb-3 border-b-2 border-gray-900">
                {searchQuery ? (
                  <>Search Results: <span className="text-[#0078ff]">{searchQuery}</span></>
                ) : selectedType ? selectedType : showBookmarksOnly ? 'Saved Articles' : 'Latest News'}
              </h2>

              <div className="space-y-4">
                {paginatedArticles.length > 0 ? (
                  paginatedArticles.map((article) => (
                    <ArticleCard key={article.id} article={withEnrichedImage(article)} variant="latest" onOpen={openArticle} />
                  ))
                ) : (
                  <div className="py-24 text-center">
                    <p className="text-gray-400 font-bold text-lg">No articles found.</p>
                    <p className="text-gray-400 text-sm mt-2">Try adjusting your filters.</p>
                  </div>
                )}
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              )}
            </div>

            <div className="lg:w-72 xl:w-80 flex-shrink-0">
              <div className="sticky top-[130px]">
                <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400 mb-4 pb-3 border-b border-gray-100">
                  Top Stories
                </h3>
                <div>
                  {sidebarArticles.slice(0, 6).map((article) => (
                    <ArticleCard key={article.id} article={withEnrichedImage(article)} variant="sidebar" onOpen={openArticle} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer branding={branding} />

      <ArticleViewer
        article={selectedArticle ? withEnrichedImage(selectedArticle) : null}
        onClose={() => setSelectedArticle(null)}
        isBookmarked={selectedArticle ? bookmarks.includes(selectedArticle.id) : false}
        onToggleBookmark={handleToggleBookmark}
        cachedContent={selectedArticle ? aiCache[selectedArticle.id] ?? null : null}
        onCacheContent={(id, content) => setAiCache(prev => ({ ...prev, [id]: content }))}
        boxScores={visibleBoxScores}
        teams={viewerTeams}
        mediaEra={mediaEra}
        branding={branding}
      />
    </div>
  );
};
