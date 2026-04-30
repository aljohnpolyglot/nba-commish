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
import { enrichNewsWithPhoto } from '../services/social/photoEnricher';
import type { GamePhotoInfo } from '../services/social/photoEnricher';
import type { NBAPlayer } from '../types';
import { getPlayerImage } from './central/view/bioCache';

// ─── Build gameLookup from boxScores + teams ───────────────────────────────────

function buildGameLookup(
  boxScores: any[],
  teams: any[]
): Map<number, GamePhotoInfo> {
  const teamById = new Map(teams.map((t: any) => [t.id, t]));
  const lookup = new Map<number, GamePhotoInfo>();
  for (const game of boxScores) {
    const homeTeam = teamById.get(game.homeTeamId);
    const awayTeam = teamById.get(game.awayTeamId);
    if (!homeTeam || !awayTeam) continue;
    const allStats = [...(game.homeStats || []), ...(game.awayStats || [])];
    const topPlayers = allStats
      .sort((a: any, b: any) => (b.gameScore ?? 0) - (a.gameScore ?? 0))
      .slice(0, 10)
      .map((s: any) => ({ name: s.name, gameScore: s.gameScore ?? 0 }));
    lookup.set(game.gameId, { homeTeam, awayTeam, topPlayers, date: game.date });
  }
  return lookup;
}

// ─── Category → display tab mapping ───────────────────────────────────────────
// Matches the SubNav tab values exactly. Any NewsCategory not listed defaults to 'League News'.

const CATEGORY_DISPLAY: Record<string, string> = {
  // Injuries
  major_injury:           'Injury Update',
  // Transactions
  signing_confirmed:      'Transaction',
  trade_confirmed:        'Transaction',
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

// ─── Map game-state news items to NewsItem ─────────────────────────────────────

/** Try to find a player portrait from the headline/content by matching against state.players */
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

function mapToNewsItem(n: any, authors: Author[], players: NBAPlayer[]): NewsItem {
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
  let imageUrl = n.image || n.playerPortraitUrl;
  if (!imageUrl) {
    const text = `${n.headline || n.title || ''} ${n.content || ''}`;
    imageUrl = resolvePlayerPortrait(text, players);
  }

  return {
    id: n.id || String(Math.random()),
    category,
    date: dateStr,
    title: n.headline || n.title || 'League Update',
    content: n.content || '',
    imageUrl,
    impact: n.isNew ? 'high' : 'standard',
    url: '#',
    author,
    gameId:     n.gameId,
    homeTeamId: n.homeTeamId,
    awayTeamId: n.awayTeamId,
  };
}

// ─── Main component ────────────────────────────────────────────────────────────

const ARTICLES_PER_PAGE = 10;

export const NewsFeed: React.FC = () => {
  const { state } = useGame();

  const [authors, setAuthors] = useState<Author[]>([]);
  useEffect(() => { fetchWriters().then(setAuthors).catch(() => {}); }, []);

  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('nba_news_bookmarks') || '[]'); } catch { return []; }
  });
  const [aiCache, setAiCache] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('nba_news_ai_cache') || '{}'); } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem('nba_news_bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(() => { localStorage.setItem('nba_news_ai_cache', JSON.stringify(aiCache)); }, [aiCache]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);

  // Imagn enriched image cache: articleId → resolved URL | null
  const [imagnImages, setImagnImages] = useState<Record<string, string | null>>({});
  const enrichingRef = useRef(new Set<string>());

  const gameLookup = useMemo(
    () => buildGameLookup(state.boxScores || [], state.teams || []),
    [state.boxScores, state.teams]
  );

  const allArticles = useMemo<NewsItem[]>(() => {
    // Sort by date descending so newest articles always appear first regardless of insertion order.
    return (state.news || [])
      .filter((n: any) => !n.teamOnly)
      .slice()
      .sort((a: any, b: any) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return tb - ta;
      })
      .map(n => mapToNewsItem(n, authors, state.players || []));
  }, [state.news, authors, state.players]);

  const filteredArticles = useMemo(() => {
    return allArticles.filter(article => {
      if (showBookmarksOnly && !bookmarks.includes(article.id)) return false;
      if (selectedTeam) {
        const text = (article.title + ' ' + article.content).toLowerCase();
        const parts = selectedTeam.toLowerCase().split(' ');
        if (!parts.some(p => p.length > 3 && text.includes(p))) return false;
      }
      if (selectedType && article.category !== selectedType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!article.title.toLowerCase().includes(q) && !article.content.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allArticles, selectedTeam, selectedType, showBookmarksOnly, searchQuery, bookmarks]);

  // When the hero section is visible (no filters), exclude the first 9 articles it already shows
  const heroSectionVisible = !searchQuery && !showBookmarksOnly && filteredArticles.length > 0;
  const latestNewsArticles = heroSectionVisible ? filteredArticles.slice(9) : filteredArticles;

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
  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    if (filteredArticles[0]) ids.add(filteredArticles[0].id);
    filteredArticles.slice(1, 9).forEach(a => ids.add(a.id));
    paginatedArticles.forEach(a => ids.add(a.id));
    return ids;
  }, [filteredArticles, paginatedArticles]);

  useEffect(() => {
    const rawNews = state.news || [];
    for (const id of visibleIds) {
      if (enrichingRef.current.has(id) || id in imagnImages) continue;
      const rawItem = rawNews.find((n: any) => (n.id || '') === id);
      if (!rawItem) continue;
      // Skip if already has a static logo image (no portrait = team logo, no enrichment needed)
      if (rawItem.image && !rawItem.playerPortraitUrl) continue;
      enrichingRef.current.add(id);
      enrichNewsWithPhoto(
        { id, headline: rawItem.headline || '', content: rawItem.content || '', image: rawItem.image, playerPortraitUrl: rawItem.playerPortraitUrl },
        gameLookup
      ).then(url => {
        setImagnImages(prev => ({ ...prev, [id]: url }));
      }).catch(() => {
        setImagnImages(prev => ({ ...prev, [id]: null }));
      });
    }
  }, [visibleIds, gameLookup, state.news]); // imagnImages intentionally excluded to avoid loop

  // Merge enriched photo into article before rendering
  const withEnrichedImage = (article: NewsItem): NewsItem => {
    if (!(article.id in imagnImages)) return article;
    const url = imagnImages[article.id];
    return url ? { ...article, imageUrl: url } : article;
  };

  // Top Stories — last 7 days of game-linked articles, ranked by game score of top performer
  const topStories = useMemo(() => {
    const rawNews = state.news || [];
    const latestDate = rawNews.length > 0
      ? Math.max(...rawNews.map((n: any) => { try { return new Date(n.date).getTime(); } catch { return 0; } }))
      : Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const cutoff = latestDate - sevenDaysMs;

    // Build a gameScore lookup: gameId → top gameScore in that game
    const gameScoreLookup = new Map<number, number>();
    for (const box of (state.boxScores || [])) {
      const top = [...(box.homeStats || []), ...(box.awayStats || [])]
        .reduce((max, s) => Math.max(max, s.gameScore ?? 0), 0);
      gameScoreLookup.set(box.gameId, top);
    }

    return allArticles
      .filter(a => {
        const rawItem = rawNews.find((n: any) => n.id === a.id);
        const ts = rawItem ? (() => { try { return new Date(rawItem.date).getTime(); } catch { return 0; } })() : 0;
        return ts >= cutoff;
      })
      .sort((a, b) => {
        const gsA = a.gameId ? (gameScoreLookup.get(a.gameId) ?? 0) : (a.impact === 'high' ? 30 : 0);
        const gsB = b.gameId ? (gameScoreLookup.get(b.gameId) ?? 0) : (b.impact === 'high' ? 30 : 0);
        return gsB - gsA;
      })
      .slice(0, 8);
  }, [allArticles, state.news, state.boxScores]);

  const sidebarArticles = topStories.length > 0 ? topStories : allArticles.slice(0, 8);

  const heroArticle = filteredArticles[0];
  const relatedArticles = filteredArticles.slice(1, 4);
  const heroBelowArticles = filteredArticles.slice(4, 9);

  const showHeroSection = heroSectionVisible;

  return (
    <div className="min-h-full bg-gray-50 font-sans text-gray-900 flex flex-col">
      <Navbar searchQuery={searchQuery} onSearchChange={(q) => { setSearchQuery(q); resetPage(); }} />

      <SubNav
        selectedTeam={selectedTeam}
        selectedType={selectedType}
        showBookmarksOnly={showBookmarksOnly}
        onSelectTeam={handleSelectTeam}
        onSelectType={handleSelectType}
        onToggleBookmarks={handleToggleBookmarks}
        gameTeams={state.teams}
      />

      <main className="flex-1">
        {showHeroSection && (
          <section className="max-w-[1400px] mx-auto px-4 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-9">
                <ArticleCard article={withEnrichedImage(heroArticle)} variant="hero" onOpen={setSelectedArticle} />
              </div>

              <div className="lg:col-span-3 flex flex-col gap-4">
                {relatedArticles.map((article) => (
                  <ArticleCard key={article.id} article={withEnrichedImage(article)} variant="related" onOpen={setSelectedArticle} />
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
                    <ArticleCard key={article.id} article={withEnrichedImage(article)} variant="hero-bottom" onOpen={setSelectedArticle} />
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
                    <ArticleCard key={article.id} article={withEnrichedImage(article)} variant="latest" onOpen={setSelectedArticle} />
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
                    <ArticleCard key={article.id} article={article} variant="sidebar" onOpen={setSelectedArticle} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <ArticleViewer
        article={selectedArticle}
        onClose={() => setSelectedArticle(null)}
        isBookmarked={selectedArticle ? bookmarks.includes(selectedArticle.id) : false}
        onToggleBookmark={handleToggleBookmark}
        cachedContent={selectedArticle ? aiCache[selectedArticle.id] ?? null : null}
        onCacheContent={(id, content) => setAiCache(prev => ({ ...prev, [id]: content }))}
        boxScores={state.boxScores || []}
        teams={state.teams || []}
      />
    </div>
  );
};
