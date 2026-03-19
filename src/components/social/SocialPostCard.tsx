import React from 'react';
import { useGame } from '../../store/GameContext';
import { SocialPost, SocialSource } from '../../types';
import { UserPlus, UserMinus } from 'lucide-react';
import { formatTwitterDate } from '../../utils/helpers';
import { getUnavatarUrl, canUseUnavatar } from '../../data/photos/social';

const SourceIcon: React.FC<{ source: SocialSource }> = ({ source }) => {
  if (source === 'TwitterX') {
    return (
      <svg className="h-6 w-6 text-sky-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
      </svg>
    );
  }
  // Feddit Icon
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1.03-5.22a.75.75 0 011.06-1.06l3 3a.75.75 0 11-1.06 1.06l-3-3zM9 12a1 1 0 112 0 1 1 0 01-2 0zm-2.5-1.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" clipRule="evenodd" />
        <path d="M10 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 4z" />
    </svg>
  );
};

const SocialPostCard: React.FC<{ post: SocialPost }> = ({ post }) => {
  const { state, toggleLike, toggleRetweet, followUser, unfollowUser } = useGame();

  const cleanHandle = post.handle.replace('@', '');
  const isFollowing = (state.followedHandles || []).includes(cleanHandle);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(post.id);
  };

  const handleRetweet = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleRetweet(post.id);
  };

  const handleFollowToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFollowing) {
      unfollowUser(cleanHandle);
    } else {
      followUser(cleanHandle);
    }
  };

  const [unavatarUrl, setUnavatarUrl] = React.useState<string>('');
  const [unavatarFailed, setUnavatarFailed] = React.useState(false);

  const isDefaultAvatar = post.avatarUrl?.includes('default_profile') || post.avatarUrl?.includes('placeholder') || !post.avatarUrl;
  const finalAvatarUrl = isDefaultAvatar ? (post.playerPortraitUrl || post.teamLogoUrl || post.avatarUrl) : post.avatarUrl;

  return (
    <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50 flex items-start space-x-4 hover:bg-zinc-800 transition-colors group/card">
      <div className="flex-shrink-0 w-12 h-12 relative">
        {finalAvatarUrl ? (
          <img
            src={finalAvatarUrl}
            alt={post.author}
            className={`h-12 w-12 rounded-full object-cover bg-zinc-700 ${!isDefaultAvatar || post.playerPortraitUrl ? '' : 'p-2'}`}
            referrerPolicy="no-referrer"
            onError={(e) => {
              // On portrait fail, try unavatar if Twitter post and budget remaining
              if (post.source === 'TwitterX' && !unavatarFailed && canUseUnavatar()) {
                const url = getUnavatarUrl(post.handle);
                if (url) { setUnavatarUrl(url); return; }
              }
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : post.source === 'TwitterX' && !unavatarFailed && canUseUnavatar() ? (
          <img
            src={unavatarUrl || getUnavatarUrl(post.handle)}
            alt={post.author}
            className="h-12 w-12 rounded-full object-cover bg-zinc-700"
            referrerPolicy="no-referrer"
            onError={() => setUnavatarFailed(true)}
          />
        ) : (
          <div className="h-12 w-12 flex items-center justify-center bg-zinc-700 rounded-full">
            <SourceIcon source={post.source} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline space-x-1 truncate">
            <p className="font-bold text-white truncate">{post.author}</p>
            <p className="text-sm text-zinc-400 truncate">{post.handle}</p>
            <span className="text-zinc-500 text-sm flex-shrink-0">·</span>
            <p className="text-sm text-zinc-500 flex-shrink-0">{formatTwitterDate(post.date, state.date)}</p>
          </div>
          <button
            onClick={handleFollowToggle}
            className={`opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded-full ${
              isFollowing 
                ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white' 
                : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white'
            }`}
          >
            {isFollowing ? (
              <>
                <UserMinus size={12} />
                <span>Unfollow</span>
              </>
            ) : (
              <>
                <UserPlus size={12} />
                <span>Follow</span>
              </>
            )}
          </button>
        </div>
        <p className="mt-1 text-zinc-300 whitespace-pre-wrap">{post.content}</p>
        
        {post.mediaUrl && (
          <div 
            className="mt-3 rounded-2xl overflow-hidden border border-zinc-700/50 relative aspect-video flex items-center justify-center"
            style={{ backgroundColor: post.mediaBackgroundColor || '#1d1160' }}
          >
            <img 
              src={post.mediaUrl} 
              alt="Post media" 
              className="h-full w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            {post.handle === '@statmuse' && (
              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-80">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 4h4v16H4V4zm6 0h4v16h-4V4zm6 0h4v16h-4V4z" />
                </svg>
                <span className="text-white font-black text-xs tracking-tighter">statmuse</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center space-x-6 text-zinc-500 text-xs">
          <button 
            onClick={handleLike}
            className={`flex items-center gap-1 transition-colors group ${post.isLiked ? 'text-rose-500' : 'hover:text-rose-500'}`}
          >
            <svg className={`w-4 h-4 group-active:scale-125 transition-transform ${post.isLiked ? 'fill-current' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            {post.likes}
          </button>
          <button 
            onClick={handleRetweet}
            className={`flex items-center gap-1 transition-colors group ${post.isRetweeted ? 'text-emerald-500' : 'hover:text-emerald-500'}`}
          >
            <svg className="w-4 h-4 group-active:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            {post.retweets}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SocialPostCard;
