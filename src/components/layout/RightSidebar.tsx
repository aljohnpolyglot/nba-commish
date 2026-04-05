import React, { useMemo } from 'react';
import { Search } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { useSidebarData } from '../../hooks/useSidebarData';
import { TrendItem, WhoToFollow } from '../social/SidebarComponents';

export const RightSidebar = ({ onTrendClick, onProfileClick, onConnectClick, onExploreClick }: { onTrendClick?: (query: string) => void, onProfileClick?: (handle: string) => void, onConnectClick?: () => void, onExploreClick?: () => void }) => {
  const { state, followUser, unfollowUser } = useGame();
  const [searchValue, setSearchValue] = React.useState('');
  const { trends, suggestedUsersList } = useSidebarData();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      onTrendClick?.(searchValue.trim());
    }
  };

  const handleToggleFollow = (handle: string) => {
    const cleanHandle = handle.replace('@', '');
    if ((state.followedHandles || []).includes(cleanHandle)) {
      unfollowUser(cleanHandle);
    } else {
      followUser(cleanHandle);
    }
  };

  return (
    <div className="hidden lg:flex flex-col h-screen sticky top-0 py-2 px-4 space-y-4 w-[350px] overflow-y-auto no-scrollbar">
      <form onSubmit={handleSearch} className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search size={18} className="text-zinc-500 group-focus-within:text-sky-500" />
        </div>
        <input
          type="text"
          placeholder="Search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="bg-zinc-900 border-none rounded-full py-3 pl-12 pr-4 w-full text-white focus:ring-1 focus:ring-sky-500 focus:bg-black transition-all outline-none text-sm"
        />
      </form>

      <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-[#2f3336]">
        <h2 className="px-4 py-3 text-xl font-black text-white">What's happening</h2>
     {trends.map((trend: { category: string; title: string; posts: number }, i: number) => (
          <TrendItem key={i} {...trend} onClick={() => onTrendClick?.(trend.title)} />
        ))}
        <div 
          onClick={() => onExploreClick?.()}
          className="px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors"
        >
          <span className="text-sky-500 text-sm">Show more</span>
        </div>
      </div>
      
      <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-[#2f3336]">
        <h2 className="px-4 py-3 text-xl font-black text-white">Who to follow</h2>
      {suggestedUsersList.slice(0, 3).map((user: { name: string; handle: string; avatar?: string }, i: number) => {
          const cleanHandle = user.handle.replace('@', '');
          const cached = state.cachedProfiles?.[cleanHandle];
          return (
            <WhoToFollow
              key={i}
              {...user}
              avatar={cached?.avatarUrl || user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanHandle}`}
              isFollowing={(state.followedHandles || []).includes(cleanHandle)}
              onToggleFollow={() => handleToggleFollow(user.handle)}
              onProfileClick={() => onProfileClick?.(user.handle)}
            />
          );
        })}
        <div 
          onClick={() => onConnectClick?.()}
          className="px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors"
        >
          <span className="text-sky-500 text-sm">Show more</span>
        </div>
      </div>
    </div>
  );
};
