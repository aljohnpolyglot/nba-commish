import React from 'react';
import { 
  Home, 
  Search, 
  Bell, 
  Mail, 
  User, 
  MoreHorizontal, 
  Twitter, 
  Hash,
  SquarePen
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGame } from '../../store/GameContext';
import { useSidebarData } from '../../hooks/useSidebarData';
import { WhoToFollow } from '../social/SidebarComponents';

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className="flex items-center space-x-4 p-3 rounded-full hover:bg-white/10 cursor-pointer transition-colors w-fit pr-6"
  >
    <Icon size={26} className={cn("text-white", active && "font-bold")} />
    <span className={cn("text-xl text-white hidden xl:block", active ? "font-bold" : "font-normal")}>
      {label}
    </span>
  </div>
);

export const Sidebar = ({ 
  onHomeClick, 
  onProfileClick, 
  onFollowingClick,
  onExploreClick,
  activeView,
  forceFull = false
}: { 
  onHomeClick?: () => void, 
  onProfileClick?: () => void, 
  onFollowingClick?: () => void,
  onExploreClick?: () => void,
  activeView?: string,
  forceFull?: boolean
}) => {
  const { state } = useGame();
  const commName = state.commissionerName || 'Commissioner';
  const commHandle = '@' + commName.toLowerCase().replace(/\s+/g, '');
  const userProfile = state.userProfile ?? { name: commName, handle: commHandle, avatarUrl: undefined };

  return (
    <div className="flex flex-row sm:flex-col h-full sm:h-screen sticky top-0 px-2 xl:px-4 py-2 justify-around sm:justify-between overflow-y-auto no-scrollbar w-full">
      <div className="flex flex-row sm:flex-col space-x-2 sm:space-x-0 sm:space-y-1 w-full sm:w-auto justify-around sm:justify-start">
        <div 
          onClick={onHomeClick}
          className="p-3 rounded-full hover:bg-white/10 cursor-pointer transition-colors w-fit hidden sm:block"
        >
          <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
          </svg>
        </div>
        
        <SidebarItem icon={Home} label="Home" active={activeView === 'feed'} onClick={onHomeClick} />
        <SidebarItem icon={Search} label="Explore" active={activeView === 'explore'} onClick={onExploreClick} />
        <SidebarItem icon={Hash} label="Following" active={activeView === 'following-list'} onClick={onFollowingClick} />
        
        <SidebarItem icon={User} label="Profile" active={activeView === 'profile'} onClick={onProfileClick} />
      </div>

      <div 
        onClick={onProfileClick}
        className="hidden sm:flex items-center justify-between p-3 rounded-full hover:bg-white/10 cursor-pointer transition-colors mt-auto mb-4"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-white font-bold overflow-hidden">
            {userProfile.avatarUrl ? (
              <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              userProfile.name[0]
            )}
          </div>
          <div className={cn(!forceFull && "hidden xl:block")}>
            <p className="text-white font-bold text-sm">{userProfile.name}</p>
            <p className="text-zinc-500 text-sm">{userProfile.handle}</p>
          </div>
        </div>
        <MoreHorizontal size={18} className={cn("text-white", !forceFull && "hidden xl:block")} />
      </div>
    </div>
  );
};
