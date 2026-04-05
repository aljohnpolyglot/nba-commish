import React from 'react';
import { useGame } from '../../store/GameContext';
import { SocialPost, SocialSource } from '../../types';
import { UserPlus, UserMinus, Heart, MessageCircle, Repeat2, Share, MoreHorizontal } from 'lucide-react';
import { formatTwitterDate } from '../../utils/socialhelpers';
import { getUnavatarUrl, canUseUnavatar } from '../../data/photos/social';
import { AVATAR_DATA } from '../../data/avatars';
import { needsCanvasEditor } from '../../services/social/photoEnricher';
import { ImagnPhotoEditor } from './ImagnPhotoEditor';
import { cn } from '../../lib/utils';

const avatarCache = new Map<string, string | null>();

const SourceIcon: React.FC<{ source: SocialSource }> = ({ source }) => {
  if (source === 'TwitterX') {
    return (
      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
      </svg>
    );
  }
  return null;
};

interface SocialPostCardProps {
  post: SocialPost;
  onImageClick?: (url: string) => void;
  onClick?: () => void;
  onProfileClick?: (handle?: string) => void;
}

const SocialPostCard: React.FC<SocialPostCardProps> = ({ post, onImageClick, onClick, onProfileClick }) => {
  const { state, toggleLike, toggleRetweet, followUser, unfollowUser } = useGame();

  const cleanHandle = post.handle.replace('@', '');
  const isFollowing = (state.followedHandles || []).includes(cleanHandle);
  const cachedProfile = state.cachedProfiles?.[cleanHandle];

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(post.id);
  };

  const handleRetweet = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleRetweet(post.id);
  };

  const handleProfileClick = (e: React.MouseEvent, handle?: string) => {
    e.stopPropagation();
    onProfileClick?.(handle || post.handle);
  };

  const [avatarSrc, setAvatarSrc] = React.useState<string | null | undefined>(() => {
    const cached = avatarCache.get(post.handle);
    return cached !== undefined ? cached : undefined;
  });

  React.useEffect(() => {
    if (avatarSrc !== undefined) return;
    
    const resolve = async () => {
      // 1. Try provided avatarUrl if it's not a placeholder
      if (post.avatarUrl && typeof post.avatarUrl === 'string' && !post.avatarUrl.includes('placeholder') && !post.avatarUrl.includes('default')) {
        setAvatarSrc(post.avatarUrl);
        avatarCache.set(post.handle, post.avatarUrl);
        return;
      }

      // 2. Try unavatar as fallback
      if (post.source === 'TwitterX' && canUseUnavatar()) {
        const url = getUnavatarUrl(post.handle);
        setAvatarSrc(url);
        avatarCache.set(post.handle, url);
        return;
      }

      setAvatarSrc(null);
      avatarCache.set(post.handle, null);
    };
    resolve();
  }, [post.handle, post.avatarUrl]);

  return (
    <div 
      onClick={onClick}
      className="px-4 py-3 border-b border-[#2f3336] hover:bg-white/[0.03] transition-colors cursor-pointer group/card"
    >
      <div className="flex space-x-3">
        <div className="flex-shrink-0" onClick={handleProfileClick}>
          {(cachedProfile?.avatarUrl || avatarSrc) ? (
            <img
              src={cachedProfile?.avatarUrl || avatarSrc!}
              alt={post.author}
              className={cn("h-10 w-10 rounded-full object-cover bg-zinc-800", post.isAI && !cachedProfile && "animate-pulse")}
              referrerPolicy="no-referrer"
              onError={() => setAvatarSrc(null)}
            />
          ) : (
            <div className={cn("h-10 w-10 flex items-center justify-center bg-zinc-800 rounded-full text-white font-bold", post.isAI && !cachedProfile && "animate-pulse")}>
              {post.author?.[0] || '?'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1 truncate" onClick={handleProfileClick}>
              <span className="font-bold text-[15px] text-white hover:underline truncate">{cachedProfile?.name || post.author}</span>
              {(cachedProfile?.verified || post.verified) && (
                <svg className="w-4 h-4 text-sky-500 flex-shrink-0" viewBox="0 0 512 512" fill="currentColor">
                  <path d="M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z"></path>
                </svg>
              )}
              <span className="text-[15px] text-zinc-500 truncate">{post.handle}</span>
              <span className="text-zinc-500 text-[15px]">·</span>
              <span className="text-zinc-500 text-[15px] hover:underline">{formatTwitterDate(post.date, state.date)}</span>
            </div>
            <button className="text-zinc-500 hover:text-sky-500 p-1.5 rounded-full hover:bg-sky-500/10 transition-colors">
              <MoreHorizontal size={18} />
            </button>
          </div>

          {post.replyToId && (
            <div className="text-zinc-500 text-[13px] mt-0.5">
              Replying to <span 
                className="text-sky-500 hover:underline cursor-pointer"
                onClick={(e) => {
                  const replyHandle = state.socialFeed.find(p => p.id === post.replyToId)?.handle;
                  if (replyHandle) handleProfileClick(e, replyHandle);
                }}
              >
                {state.socialFeed.find(p => p.id === post.replyToId)?.handle || '@someone'}
              </span>
            </div>
          )}
          
          <p className="text-[15px] text-white leading-normal mt-0.5 whitespace-pre-wrap">{post.content}</p>

          {post.mediaUrl && post.mediaUrl !== avatarSrc && (() => {
            const d = post.data as any;
            const tplId = d?.templateId || '';
            if (tplId.startsWith('nba_')) {
              console.log(`[SocialPostCard] @NBA post rendering: templateId="${tplId}" mediaUrl="${post.mediaUrl?.slice(0,80)}" needsCanvas=${needsCanvasEditor(post)} hasHomeTeam=${!!d?.homeTeam} hasAwayTeam=${!!d?.awayTeam}`);
            }
            if (needsCanvasEditor(post) && d?.homeTeam && d?.awayTeam) {
              const photo = {
                id: 0, setId: 0, headLine: '', caption: '', captionClean: '',
                players: [], photographer: '', location: '', date: '',
                width: 0, height: 0, isTopPic: false,
                medUrl: post.mediaUrl!,
                largeUrl: post.mediaUrl!,
              };
              return (
                <div className="mt-3 rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                  <ImagnPhotoEditor
                    photo={photo}
                    homeTeamColor={d.homeTeam.color ?? '#1d428a'}
                    awayTeamColor={d.awayTeam.color ?? '#c8102e'}
                    homeAbbrev={d.homeTeam.abbrev ?? ''}
                    awayAbbrev={d.awayTeam.abbrev ?? ''}
                    homeScore={d.homeTeam.score ?? 0}
                    awayScore={d.awayTeam.score ?? 0}
                    homeLogoUrl={d.homeTeam.logoUrl}
                    awayLogoUrl={d.awayTeam.logoUrl}
                    readOnly
                  />
                </div>
              );
            }
            return (
              <div
                className="mt-3 rounded-2xl overflow-hidden border border-zinc-800"
                style={post.mediaBackgroundColor ? { backgroundColor: post.mediaBackgroundColor } : undefined}
                onClick={e => e.stopPropagation()}
              >
                <img
                  src={post.mediaUrl}
                  alt=""
                  className="w-full object-cover max-h-[512px]"
                  referrerPolicy="no-referrer"
                  onClick={() => onImageClick?.(post.mediaUrl!)}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            );
          })()}

          <div className="mt-3 flex items-center justify-between max-w-md text-zinc-500">
            <button className="flex items-center space-x-2 group/btn hover:text-sky-500 transition-colors">
              <div className="p-2 rounded-full group-hover/btn:bg-sky-500/10">
                <MessageCircle size={18} />
              </div>
              <span className="text-xs">{post.replies?.length || post.replyCount || Math.round((post.retweets + post.likes) * 0.12) || 0}</span>
            </button>
            <button 
              onClick={handleRetweet}
              className={cn(
                "flex items-center space-x-2 group/btn transition-colors",
                post.isRetweeted ? "text-emerald-500" : "hover:text-emerald-500"
              )}
            >
              <div className="p-2 rounded-full group-hover/btn:bg-emerald-500/10">
                <Repeat2 size={18} className={cn(post.isRetweeted && "fill-current")} />
              </div>
              <span className="text-xs">{post.retweets}</span>
            </button>
            <button 
              onClick={handleLike}
              className={cn(
                "flex items-center space-x-2 group/btn transition-colors",
                post.isLiked ? "text-rose-500" : "hover:text-rose-500"
              )}
            >
              <div className="p-2 rounded-full group-hover/btn:bg-rose-500/10">
                <Heart size={18} className={cn(post.isLiked && "fill-current")} />
              </div>
              <span className="text-xs">{post.likes}</span>
            </button>
            <button className="flex items-center space-x-2 group/btn hover:text-sky-500 transition-colors" onClick={e => e.stopPropagation()}>
              <div className="p-2 rounded-full group-hover/btn:bg-sky-500/10">
                <Share size={18} />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SocialPostCard;
