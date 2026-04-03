import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { RightSidebar } from './RightSidebar';
import { TweetInput } from '../social/TweetInput';
import SocialPostCard from '../social/SocialPostCard';
import { ProfileView } from '../social/ProfileView';
import { ThreadView } from '../social/ThreadView';
import { FollowingListView } from '../social/FollowingListView';
import { ConnectView } from '../social/ConnectView';
import { useGame } from '../../store/GameContext';
import { SocialGameProvider } from '../../store/SocialGameContext';
import { useTwitterData } from '../../hooks/useTwitterData';
import { useSidebarData } from '../../hooks/useSidebarData';
import { useBackgroundFetcher } from '../../hooks/useBackgroundFetcher';
import { TrendItem, WhoToFollow } from '../social/SidebarComponents';
import { cn } from '../../lib/utils';
import { Settings2, ArrowLeft, Search, Menu, X, Loader2 } from 'lucide-react';
import { useInView } from '../../hooks/useInView';
import { enrichPostWithPhoto, getResolvedUrl, type GamePhotoInfo } from '../../services/social/photoEnricher';
import type { GameResult, SocialPost } from '../../types';

// ─── Game photo lookup (boxScores + teams) ────────────────────────────────────
function useGameLookup(): Map<number, GamePhotoInfo> {
  const { state } = useGame();
  return useMemo(() => {
    const lookup = new Map<number, GamePhotoInfo>();
    for (const bs of (state.boxScores || []) as GameResult[]) {
      if (!bs.gameId || bs.homeTeamId <= 0 || bs.awayTeamId <= 0) continue;
      const home = state.teams.find(t => t.id === bs.homeTeamId);
      const away = state.teams.find(t => t.id === bs.awayTeamId);
      if (!home || !away) continue;
      const topPlayers = [...(bs.homeStats || []), ...(bs.awayStats || [])]
        .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0))
        .slice(0, 10)
        .map(s => ({ name: s.name, gameScore: s.gameScore ?? 0 }));
      lookup.set(bs.gameId, { homeTeam: home, awayTeam: away, topPlayers, date: bs.date || '' });
    }
    return lookup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.boxScores, state.teams]);
}

// ─── Lazy-photo wrapper (only enriches when post scrolls into view) ───────────
const LazyPhotoCard: React.FC<{ post: SocialPost; gameLookup: Map<number, GamePhotoInfo>; onClick: () => void; onProfileClick: (h?: string) => void }> = ({ post, gameLookup, onClick, onProfileClick }) => {
  const { ref, inView } = useInView(0.05);
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | undefined>(() => {
    const cached = getResolvedUrl(post.id);
    return cached ?? post.mediaUrl ?? undefined;
  });
  useEffect(() => {
    if (!inView || resolvedMediaUrl) return;
    let cancelled = false;
    enrichPostWithPhoto(post, gameLookup).then(url => {
      if (!cancelled && url) setResolvedMediaUrl(url);
    });
    return () => { cancelled = true; };
  }, [inView, gameLookup]);
  const enriched: SocialPost = resolvedMediaUrl ? { ...post, mediaUrl: resolvedMediaUrl } : post;
  return (
    <div ref={ref}>
      <SocialPostCard post={enriched} onClick={onClick} onProfileClick={onProfileClick} />
    </div>
  );
};

const WhoToFollowFeedBlock = ({ onProfileClick, suggestedUsersList }: { onProfileClick: (handle: string) => void, suggestedUsersList: any[] }) => {
  const { state, followUser, unfollowUser } = useGame();

  if (!suggestedUsersList || suggestedUsersList.length === 0) return null;

  return (
    <>
      {suggestedUsersList.slice(0, 3).map((user: any, i: number) => (
        <WhoToFollow 
          key={i} 
          {...user} 
          isFollowing={(state.followedHandles || []).includes(user.handle.replace('@', ''))}
          onToggleFollow={() => {
            const cleanHandle = user.handle.replace('@', '');
            if ((state.followedHandles || []).includes(cleanHandle)) {
              unfollowUser(cleanHandle);
            } else {
              followUser(cleanHandle);
            }
          }}
          onProfileClick={() => onProfileClick(user.handle)}
        />
      ))}
    </>
  );
};

export const TwitterLayout = () => {
  const { state, followUser, unfollowUser, dispatchAction } = useGame();
  const { loading } = useTwitterData();
  useBackgroundFetcher();
  const { trends, allTrends, suggestedUsersList } = useSidebarData();
  const [activeTab, setActiveTab] = useState<'for-you' | 'following'>('for-you');
  const [searchQuery, setSearchQuery] = useState('');
  const gameLookup = useGameLookup();
  const [view, setView] = useState<{ type: 'feed' | 'profile' | 'thread' | 'following-list' | 'explore' | 'connect'; handle?: string; postId?: string }>({ type: 'feed' });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(10);
  const observer = useRef<IntersectionObserver | null>(null);
  const scrollPositionRef = useRef(0);

  const lastTweetElementRef = useCallback((node: HTMLDivElement | null) => {
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setDisplayLimit(prev => prev + 10);
      }
    }, { threshold: 0.1 });
    if (node) observer.current.observe(node);
  }, []);

  // Reset display limit when changing tabs or searching
  useEffect(() => {
    setDisplayLimit(10);
  }, [activeTab, searchQuery, view.type]);

  const handleProfileClick = (handle: string) => {
    scrollPositionRef.current = window.scrollY;
    setView({ type: 'profile', handle });
    setIsMobileMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const handlePostClick = (postId: string) => {
    scrollPositionRef.current = window.scrollY;
    setView({ type: 'thread', postId });
    window.scrollTo(0, 0);
  };

  const handleHomeClick = () => {
    setView({ type: 'feed' });
    setSearchQuery('');
    setIsMobileMenuOpen(false);
    setTimeout(() => window.scrollTo(0, scrollPositionRef.current), 0);
  };

  const handleExploreClick = () => {
    scrollPositionRef.current = window.scrollY;
    setView({ type: 'explore' });
    setIsMobileMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const handleFollowingListClick = () => {
    scrollPositionRef.current = window.scrollY;
    setView({ type: 'following-list' });
    setIsMobileMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const handleConnectClick = () => {
    scrollPositionRef.current = window.scrollY;
    setView({ type: 'connect' });
    setIsMobileMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const handleTrendClick = (query: string) => {
    setSearchQuery(query);
    setView({ type: 'feed' });
    setActiveTab('for-you');
    window.scrollTo(0, 0);
  };

  const [searchTab, setSearchTab] = useState<'top' | 'latest' | 'people' | 'media'>('top');

  return (
    <SocialGameProvider>
      <div className="h-screen overflow-hidden bg-black text-[#e7e9ea] flex justify-center relative overflow-x-clip">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-white/10 backdrop-blur-sm z-[100] xl:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div className="flex w-full max-w-[1300px] h-full">
        {/* Left Sidebar (Desktop) */}
        <div className="hidden sm:flex flex-shrink-0 w-[80px] xl:w-[275px]">
          <Sidebar 
            onHomeClick={handleHomeClick} 
            onProfileClick={() => handleProfileClick(state.userProfile?.handle ?? ('@' + (state.commissionerName || 'commissioner').toLowerCase().replace(/\s+/g, '')))}
            onFollowingClick={handleFollowingListClick}
            onExploreClick={handleExploreClick}
            activeView={view.type}
          />
        </div>

        {/* Main Content */}
        <main className="flex-1 max-w-[600px] border-x border-[#2f3336] h-screen overflow-y-auto no-scrollbar w-full">
          {view.type === 'feed' ? (
            <>
              <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-[#2f3336]">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    {searchQuery ? (
                      <>
                        <button onClick={() => setSearchQuery('')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                          <ArrowLeft size={20} />
                        </button>
                        <div className="flex-1 bg-zinc-900 rounded-full px-4 py-2 flex items-center space-x-3 border border-transparent focus-within:border-sky-500 focus-within:bg-black transition-all">
                          <Search size={18} className="text-zinc-500" />
                          <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none outline-none text-white w-full"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between w-full">
                        <h1 className="text-xl font-bold">Home</h1>
                        <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
                          <Settings2 size={20} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {searchQuery ? (
                  <div className="flex w-full overflow-x-auto no-scrollbar">
                    {['Top', 'Latest', 'People', 'Media'].map((tab) => (
                      <button 
                        key={tab}
                        onClick={() => setSearchTab(tab.toLowerCase() as any)}
                        className="flex-1 py-4 hover:bg-white/5 transition-colors relative min-w-[100px]"
                      >
                        <span className={cn(
                          "text-[15px] font-bold",
                          searchTab === tab.toLowerCase() ? "text-white" : "text-[#71767b]"
                        )}>
                          {tab}
                        </span>
                        {searchTab === tab.toLowerCase() && (
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-[#1d9bf0] rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex w-full">
                    <button 
                      onClick={() => setActiveTab('for-you')}
                      className="flex-1 py-4 hover:bg-white/5 transition-colors relative"
                    >
                      <span className={cn(
                        "text-[15px] font-bold",
                        activeTab === 'for-you' ? "text-white" : "text-[#71767b]"
                      )}>
                        For you
                      </span>
                      {activeTab === 'for-you' && (
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-[#1d9bf0] rounded-full" />
                      )}
                    </button>
                    <button 
                      onClick={() => setActiveTab('following')}
                      className="flex-1 py-4 hover:bg-white/5 transition-colors relative"
                    >
                      <span className={cn(
                        "text-[15px] font-bold",
                        activeTab === 'following' ? "text-white" : "text-[#71767b]"
                      )}>
                        Following
                      </span>
                      {activeTab === 'following' && (
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-[#1d9bf0] rounded-full" />
                      )}
                    </button>
                  </div>
                )}
              </header>

              {!searchQuery && <TweetInput onTweet={(content) => {
                const commName = state.commissionerName || 'Commissioner';
                const commHandle = '@' + commName.toLowerCase().replace(/\s+/g, '');
                const newPost = {
                  id: `user-post-${Date.now()}`,
                  author: commName,
                  handle: commHandle,
                  avatarUrl: state.userProfile?.avatarUrl,
                  content,
                  date: new Date().toISOString(),
                  likes: 0,
                  retweets: 0,
                  replies: [],
                  source: 'TwitterX' as const,
                  isLiked: false,
                  isRetweeted: false,
                  isNew: false,
                };
                dispatchAction({ type: 'ADD_USER_POST', payload: newPost } as any);
              }} />}

              {loading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#1d9bf0]" />
                </div>
              ) : (
                <div className="flex flex-col">
                  {searchQuery && searchTab === 'people' ? (
                    // People Tab: Show users matching the query
                    <div className="flex flex-col">
                      {Array.from(new Map(state.socialFeed
                        .filter(post => 
                          post.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          post.handle.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map(post => [post.handle, { name: post.author, handle: post.handle, avatar: post.avatarUrl }])
                      ).values()).map((user: any) => (
                        <div 
                          key={user.handle}
                          onClick={() => handleProfileClick(user.handle)}
                          className="px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors flex items-center justify-between border-b border-zinc-800"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden">
                              {user.avatar ? (
                                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white font-bold">?</div>
                              )}
                            </div>
                            <div>
                              <p className="text-white font-bold text-[15px] hover:underline">{user.name}</p>
                              <p className="text-zinc-500 text-[15px]">{user.handle}</p>
                            </div>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const cleanHandle = user.handle.replace('@', '');
                              if ((state.followedHandles || []).includes(cleanHandle)) {
                                unfollowUser(cleanHandle);
                              } else {
                                followUser(cleanHandle);
                              }
                            }}
                            className={cn(
                              "font-bold text-sm px-4 py-1.5 rounded-full transition-colors",
                              (state.followedHandles || []).includes(user.handle.replace('@', ''))
                                ? "bg-transparent border border-zinc-500 text-white hover:bg-rose-500/10 hover:border-rose-500 hover:text-rose-500"
                                : "bg-white text-black hover:bg-zinc-200"
                            )}
                          >
                            {(state.followedHandles || []).includes(user.handle.replace('@', '')) ? "Following" : "Follow"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Other Tabs: Show posts
                    state.socialFeed
                      .filter(post => {
                        if (post.replyToId) return false; // Don't show replies in main feed
                        
                        if (searchQuery) {
                          const matchesSearch = post.content.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 post.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 post.handle.toLowerCase().includes(searchQuery.toLowerCase());
                          
                          if (!matchesSearch) return false;

                          if (searchTab === 'media') return !!post.mediaUrl;
                          return true;
                        }
                        return activeTab === 'for-you' || (state.followedHandles || []).includes(post.handle.replace('@', ''));
                      })
                      .sort((a, b) => {
                        if (searchQuery) {
                          if (searchTab === 'latest') {
                            // Sort by ID or simulated timestamp (newer first)
                            return b.id.localeCompare(a.id);
                          }
                          if (searchTab === 'top') {
                            // Weighted score for 'Top'
                            const scoreA = (a.likes || 0) * 2 + (a.retweets || 0) * 3 + (a.replyCount ?? 0);
                            const scoreB = (b.likes || 0) * 2 + (b.retweets || 0) * 3 + (b.replyCount ?? 0);
                            return scoreB - scoreA;
                          }
                        }
                        return 0;
                      })
                      .slice(0, displayLimit)
                      .map((post, index) => (
                        <React.Fragment key={post.id}>
                          <LazyPhotoCard
                            post={post}
                            gameLookup={gameLookup}
                            onClick={() => handlePostClick(post.id)}
                            onProfileClick={(handle) => handleProfileClick(handle || post.handle)}
                          />
                          {!searchQuery && activeTab === 'for-you' && index === 2 && suggestedUsersList && suggestedUsersList.length > 0 && (
                            <div className="border-b border-[#2f3336]">
                              <h2 className="px-4 py-3 text-xl font-black text-white">Who to follow</h2>
                              <WhoToFollowFeedBlock onProfileClick={handleProfileClick} suggestedUsersList={suggestedUsersList} />
                            </div>
                          )}
                        </React.Fragment>
                      ))
                  )}
                  {/* Lazy load trigger */}
                  {state.socialFeed.length > 0 && displayLimit < state.socialFeed.length && (
                    <div ref={lastTweetElementRef} className="h-20 flex items-center justify-center">
                      <Loader2 className="animate-spin text-sky-500" size={24} />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : view.type === 'explore' ? (
            <div className="flex flex-col min-h-screen">
              <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-[#2f3336] px-4 py-3">
                <div className="flex items-center space-x-4">
                  <button 
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="sm:hidden w-8 h-8 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0"
                  >
                    {state.userProfile?.avatarUrl ? (
                    <img src={state.userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                    <span className="text-white font-bold text-xs">{state.userProfile?.name?.[0] ?? '?'}</span>
                    )}
                  </button>
                  <div className="flex-1 bg-zinc-900 rounded-full px-4 py-2 flex items-center space-x-3 border border-transparent focus-within:border-sky-500 focus-within:bg-black transition-all">
                    <Search size={18} className="text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="Search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleTrendClick(searchQuery)}
                      className="bg-transparent border-none outline-none text-white w-full"
                    />
                  </div>
                  <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <Settings2 size={20} />
                  </button>
                </div>
              </header>
              <div className="flex flex-col">
                {searchQuery ? (
                  <>
                    <div className="flex w-full overflow-x-auto no-scrollbar border-b border-zinc-800">
                      {['Top', 'Latest', 'People', 'Media'].map((tab) => (
                        <button 
                          key={tab}
                          onClick={() => setSearchTab(tab.toLowerCase() as any)}
                          className="flex-1 py-4 hover:bg-white/5 transition-colors relative min-w-[100px]"
                        >
                          <span className={cn(
                            "text-[15px] font-bold",
                            searchTab === tab.toLowerCase() ? "text-white" : "text-[#71767b]"
                          )}>
                            {tab}
                          </span>
                          {searchTab === tab.toLowerCase() && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-[#1d9bf0] rounded-full" />
                          )}
                        </button>
                      ))}
                    </div>
                    {searchTab === 'people' ? (
                      <div className="flex flex-col">
                        {Array.from(new Map(state.socialFeed
                          .filter(post => 
                            post.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            post.handle.toLowerCase().includes(searchQuery.toLowerCase())
                          )
                          .map(post => [post.handle, { name: post.author, handle: post.handle, avatar: post.avatarUrl }])
                        ).values()).map((user: any) => (
                          <div 
                            key={user.handle}
                            onClick={() => handleProfileClick(user.handle)}
                            className="px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors flex items-center justify-between border-b border-zinc-800"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden">
                                {user.avatar ? (
                                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white font-bold">?</div>
                                )}
                              </div>
                              <div>
                                <p className="text-white font-bold text-[15px] hover:underline">{user.name}</p>
                                <p className="text-zinc-500 text-[15px]">{user.handle}</p>
                              </div>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                const cleanHandle = user.handle.replace('@', '');
                                if ((state.followedHandles || []).includes(cleanHandle)) {
                                  unfollowUser(cleanHandle);
                                } else {
                                  followUser(cleanHandle);
                                }
                              }}
                              className={cn(
                                "font-bold text-sm px-4 py-1.5 rounded-full transition-colors",
                                (state.followedHandles || []).includes(user.handle.replace('@', ''))
                                  ? "bg-transparent border border-zinc-500 text-white hover:bg-rose-500/10 hover:border-rose-500 hover:text-rose-500"
                                  : "bg-white text-black hover:bg-zinc-200"
                              )}
                            >
                              {(state.followedHandles || []).includes(user.handle.replace('@', '')) ? "Following" : "Follow"}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      state.socialFeed
                        .filter(post => {
                          if (post.replyToId) return false; // Don't show replies in main feed
                          
                          const matchesSearch = post.content.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 post.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 post.handle.toLowerCase().includes(searchQuery.toLowerCase());
                          
                          if (!matchesSearch) return false;
                          if (searchTab === 'media') return !!post.mediaUrl;
                          return true;
                        })
                        .sort((a, b) => {
                          if (searchTab === 'latest') return b.id.localeCompare(a.id);
                          if (searchTab === 'top') {
                            const scoreA = (a.likes || 0) * 2 + (a.retweets || 0) * 3 + (a.replyCount ?? 0);
                            const scoreB = (b.likes || 0) * 2 + (b.retweets || 0) * 3 + (b.replyCount ?? 0);
                            return scoreB - scoreA;
                          }
                          return 0;
                        })
                        .map((post) => (
                          <LazyPhotoCard
                            key={post.id}
                            post={post}
                            gameLookup={gameLookup}
                            onClick={() => handlePostClick(post.id)}
                            onProfileClick={(handle) => handleProfileClick(handle || post.handle)}
                          />
                        ))
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="px-4 py-3 text-xl font-black text-white">What's happening</h2>
                    {allTrends.map((trend: { category: string; title: string; posts: number }, i: number) => (
                    <TrendItem key={i} {...trend} onClick={() => handleTrendClick(trend.title)} />
                    ))}
                  </>
                )}
              </div>
            </div>
          ) : view.type === 'profile' ? (
            <ProfileView 
              handle={view.handle!} 
              onBack={handleHomeClick} 
              onPostClick={handlePostClick}
              onProfileClick={handleProfileClick}
            />
          ) : view.type === 'thread' ? (
            <ThreadView 
              postId={view.postId!} 
              onBack={handleHomeClick} 
              onProfileClick={handleProfileClick}
              onPostClick={handlePostClick}
            />
          ) : view.type === 'following-list' ? (
            <FollowingListView 
              onBack={handleHomeClick}
              onProfileClick={handleProfileClick}
            />
          ) : (
            <ConnectView
              onBack={handleHomeClick}
              onProfileClick={handleProfileClick}
            />
          )}
        </main>

        {/* Right Sidebar */}
        <RightSidebar 
          onTrendClick={handleTrendClick} 
          onProfileClick={handleProfileClick} 
          onConnectClick={handleConnectClick} 
          onExploreClick={handleExploreClick}
        />

        {/* Mobile Bottom Navigation */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 h-16 bg-black border-t border-zinc-800 flex justify-around items-center z-[100]">
          <Sidebar 
            onHomeClick={handleHomeClick} 
            onProfileClick={() => handleProfileClick(state.userProfile?.handle ?? ('@' + (state.commissionerName || 'commissioner').toLowerCase().replace(/\s+/g, '')))}
            onFollowingClick={handleFollowingListClick}
            onExploreClick={handleExploreClick}
            activeView={view.type}
            forceFull={false}
          />
        </div>
      </div>
    </div>
    </SocialGameProvider>
  );
};
