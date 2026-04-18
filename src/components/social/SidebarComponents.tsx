import React from 'react';
import { MoreHorizontal } from 'lucide-react';

export const TrendItem = ({ category, title, posts, onClick }: { category: string, title: string, posts: string | number, onClick?: () => void }) => (
  <div className="px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors border-b border-zinc-800" onClick={onClick}>
    <div className="flex justify-between items-start">
      <span className="text-zinc-500 text-xs">{category}</span>
      <MoreHorizontal size={16} className="text-zinc-500" />
    </div>
    <p className="text-white font-bold text-[15px] mt-0.5">{title}</p>
    <p className="text-zinc-500 text-xs mt-1">{typeof posts === 'number' ? posts.toLocaleString() : posts} posts</p>
  </div>
);

interface WhoToFollowProps {
  name: string;
  handle: string;
  avatar?: string;
  isFollowing: boolean;
  onToggleFollow: () => void;
  onProfileClick?: () => void;
}

export const WhoToFollow: React.FC<WhoToFollowProps> = ({ name, handle, avatar, isFollowing, onToggleFollow, onProfileClick }) => (
  <div className="px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors flex items-center justify-between border-b border-zinc-800" onClick={onProfileClick}>
    <div className="flex items-center space-x-3 min-w-0">
      <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white font-bold">
            {name?.[0] || '?'}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-white font-bold text-sm hover:underline truncate">{name}</p>
        <p className="text-zinc-500 text-sm truncate">{handle}</p>
      </div>
    </div>
    <button 
      onClick={(e) => { e.stopPropagation(); onToggleFollow(); }}
      className={isFollowing 
        ? "bg-transparent border border-zinc-500 text-white font-bold text-sm px-4 py-1.5 rounded-full hover:bg-rose-500/10 hover:border-rose-500 hover:text-rose-500 transition-colors flex-shrink-0 ml-2" 
        : "bg-white text-black font-bold text-sm px-4 py-1.5 rounded-full hover:bg-zinc-200 transition-colors flex-shrink-0 ml-2"
      }
    >
      {isFollowing ? "Following" : "Follow"}
    </button>
  </div>
);
