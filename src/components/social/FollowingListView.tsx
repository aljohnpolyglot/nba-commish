import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useGame } from '../../store/GameContext';

interface FollowingListViewProps {
  onBack: () => void;
  onProfileClick: (handle: string) => void;
}

export const FollowingListView: React.FC<FollowingListViewProps> = ({ onBack, onProfileClick }) => {
  const { state, unfollowUser } = useGame();

  // Get unique authors from the feed that are in the followed list
  const followedAccounts = state.followedHandles.map(handle => {
    const cached = state.cachedProfiles?.[handle];
    const post = state.socialFeed.find(p => p.handle.replace('@', '') === handle);
    return {
      handle: `@${handle}`,
      name: cached?.name || post?.author || handle,
      avatar: cached?.avatarUrl || post?.avatarUrl
    };
  });

  return (
    <div className="flex flex-col min-h-screen bg-black">
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md px-4 py-3 flex items-center space-x-8 border-b border-[#2f3336]">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold">Following</h2>
          <p className="text-zinc-500 text-sm">{followedAccounts.length} accounts</p>
        </div>
      </div>

      <div className="flex flex-col">
        {followedAccounts.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            You aren't following anyone yet.
          </div>
        ) : (
          followedAccounts.map((account) => (
            <div 
              key={account.handle}
              onClick={() => onProfileClick(account.handle)}
              className="px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors flex items-center justify-between border-b border-[#2f3336]"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden">
                  {account.avatar ? (
                    <img src={account.avatar} alt={account.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-bold">
                      {account.name[0]}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-white font-bold text-sm hover:underline">{account.name}</p>
                  <p className="text-zinc-500 text-sm">{account.handle}</p>
                </div>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  unfollowUser(account.handle.replace('@', ''));
                }}
                className="bg-transparent border border-zinc-500 text-white font-bold text-sm px-4 py-1.5 rounded-full hover:bg-rose-500/10 hover:border-rose-500 hover:text-rose-500 transition-colors group"
              >
                <span className="group-hover:hidden">Following</span>
                <span className="hidden group-hover:inline">Unfollow</span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
