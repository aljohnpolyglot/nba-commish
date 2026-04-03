import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { useSidebarData } from '../../hooks/useSidebarData';
import { WhoToFollow } from './SidebarComponents.tsx';

interface ConnectViewProps {
  onBack: () => void;
  onProfileClick: (handle: string) => void;
}

export const ConnectView: React.FC<ConnectViewProps> = ({ onBack, onProfileClick }) => {
  const { state, followUser, unfollowUser } = useGame();
  const { suggestedUsersList } = useSidebarData();

  const handleToggleFollow = (handle: string) => {
    const cleanHandle = handle.replace('@', '');
    if ((state.followedHandles || []).includes(cleanHandle)) {
      unfollowUser(cleanHandle);
    } else {
      followUser(cleanHandle);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black">
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md px-4 py-3 flex items-center space-x-8 border-b border-[#2f3336]">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-bold">Connect</h2>
      </div>

      <div className="flex flex-col">
        <h2 className="px-4 py-3 text-xl font-black text-white border-b border-[#2f3336]">Suggested for you</h2>
     {suggestedUsersList.map((user: { name: string; handle: string; avatar?: string }, i: number) => (
          <div key={i} className="border-b border-[#2f3336]">
            <WhoToFollow 
              {...user} 
              isFollowing={(state.followedHandles || []).includes(user.handle.replace('@', ''))}
              onToggleFollow={() => handleToggleFollow(user.handle)}
              onProfileClick={() => onProfileClick(user.handle)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
