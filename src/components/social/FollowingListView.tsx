import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { WhoToFollow } from './SidebarComponents';

interface FollowingListViewProps {
  onProfileClick?: (handle: string) => void;
  onBack?: () => void;
}

export const FollowingListView: React.FC<FollowingListViewProps> = ({ onProfileClick, onBack }) => {
  const { state, followUser, unfollowUser } = useGame();
  const followedHandles = state.followedHandles || [];

  const users = followedHandles.map(handle => {
    const cached = state.cachedProfiles?.[handle];
    const postWithHandle = (state.socialFeed || []).find(p => p.handle.replace('@', '') === handle);
    return {
      name: cached?.name || postWithHandle?.author || handle,
      handle: '@' + handle,
      avatar: cached?.avatarUrl || postWithHandle?.avatarUrl,
    };
  });

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md px-4 py-3 flex items-center space-x-6 border-b border-[#2f3336]">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">Following</h2>
          <p className="text-sm text-zinc-500">{users.length} accounts</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {users.length === 0 ? (
          <div className="flex flex-col items-center py-16 px-8 text-center">
            <p className="text-white text-2xl font-bold mb-2">You're not following anyone yet</p>
            <p className="text-zinc-500 text-sm">Follow people to see their posts here.</p>
          </div>
        ) : (
          users.map((user, i) => (
            <WhoToFollow
              key={i}
              {...user}
              isFollowing={true}
              onToggleFollow={() => unfollowUser(user.handle.replace('@', ''))}
              onProfileClick={() => onProfileClick?.(user.handle)}
            />
          ))
        )}
      </div>
    </div>
  );
};
