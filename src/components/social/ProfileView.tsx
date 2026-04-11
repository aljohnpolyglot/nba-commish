import React, { useEffect } from 'react';
import { ArrowLeft, Link2 } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import SocialPostCard from './SocialPostCard';
import { cn } from '../../lib/utils';
import EditProfile from './EditProfile';
import { fetchProfileData } from '../../utils/socialapi';

interface ProfileViewProps {
  handle?: string;
  onBack?: () => void;
  onPostClick?: (postId: string) => void;
  onProfileClick?: (handle: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ handle, onBack, onPostClick, onProfileClick }) => {
  const { state, followUser, unfollowUser, dispatchAction } = useGame();
  const [activeTab, setActiveTab] = React.useState<'posts' | 'replies' | 'media'>('posts');
  const [showEditProfile, setShowEditProfile] = React.useState(false);
  const [isFetching, setIsFetching] = React.useState(false);

  const commName = state.commissionerName || 'Commissioner';
  const ownHandle = (state.userProfile?.handle || ('@' + commName.toLowerCase().replace(/\s+/g, ''))).replace('@', '');

  const cleanHandle = (handle || '').replace('@', '');
  const cached = state.cachedProfiles?.[cleanHandle];
  const isOwnProfile = cleanHandle === ownHandle;

  // Trigger a fetch when navigating to a profile not yet in cache
  useEffect(() => {
    if (!cleanHandle || isOwnProfile) return;
    if (cached) return;
    setIsFetching(true);
    fetchProfileData(cleanHandle, dispatchAction).finally(() => setIsFetching(false));
  }, [cleanHandle]);

  // Own profile: prefer state.userProfile for avatar/banner set via EditProfile
  const ownAvatarUrl = isOwnProfile ? (state.userProfile?.avatarUrl || cached?.avatarUrl) : cached?.avatarUrl;
  const ownBannerUrl = isOwnProfile ? (state.userProfile?.bannerUrl || cached?.bannerUrl) : cached?.bannerUrl;

  const displayName = (isOwnProfile ? state.userProfile?.name : null) || cached?.name || cleanHandle;
  const bio = (isOwnProfile ? state.userProfile?.bio : null) || cached?.bio || '';
  const avatarUrl = ownAvatarUrl;
  const bannerUrl = ownBannerUrl;
  const followersCount = cached?.followersCount ?? 0;
  const followingCount = cached?.followingCount ?? 0;
  const verified = cached?.verified ?? false;

  const isFollowing = (state.followedHandles || []).includes(cleanHandle);

  const userPosts = (state.socialFeed || [])
    .filter(p => {
      const ph = p.handle.replace('@', '');
      if (activeTab === 'posts') return ph === cleanHandle && !p.replyToId;
      if (activeTab === 'replies') return ph === cleanHandle && !!p.replyToId;
      if (activeTab === 'media') return ph === cleanHandle && !!p.mediaUrl;
      return false;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleFollow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFollowing) unfollowUser(cleanHandle);
    else followUser(cleanHandle);
  };

  const tabs = ['posts', 'replies', 'media'] as const;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md px-4 py-3 flex items-center space-x-6 border-b border-[#2f3336]">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">{displayName}</h2>
          <p className="text-sm text-zinc-500">{userPosts.length} posts</p>
        </div>
      </div>

      {/* Banner */}
      <div className={`h-36 relative flex-shrink-0 ${isFetching && !bannerUrl ? 'bg-zinc-800 animate-pulse' : 'bg-zinc-800'}`}>
        {bannerUrl && (
          <img src={bannerUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        )}
      </div>

      {/* Avatar + Follow button */}
      <div className="px-4 pb-3 border-b border-[#2f3336] relative z-10 bg-black">
        <div className="flex justify-between items-start -mt-12 mb-3">
          <div className={`w-24 h-24 rounded-full border-4 border-black overflow-hidden ${isFetching && !avatarUrl ? 'bg-zinc-700 animate-pulse' : 'bg-zinc-800'}`}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-3xl font-bold">
                {displayName[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          {isOwnProfile ? (
            <button
              onClick={() => setShowEditProfile(true)}
              className="mt-14 font-bold text-sm px-5 py-1.5 rounded-full border border-zinc-500 text-white hover:bg-white/10 transition-colors"
            >
              Edit profile
            </button>
          ) : (
            <button
              onClick={handleFollow}
              className={cn(
                'mt-14 font-bold text-sm px-5 py-1.5 rounded-full transition-colors',
                isFollowing
                  ? 'border border-zinc-500 text-white hover:bg-rose-500/10 hover:border-rose-500 hover:text-rose-500'
                  : 'bg-white text-black hover:bg-zinc-200'
              )}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        <div className="mb-3">
          {isFetching && !cached ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-5 bg-zinc-800 rounded w-32" />
              <div className="h-3 bg-zinc-900 rounded w-24" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <p className="text-white font-bold text-xl">{displayName}</p>
                {verified && (
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-sky-500 fill-current">
                    <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
                  </svg>
                )}
              </div>
              <p className="text-zinc-500 text-sm">@{cleanHandle}</p>
            </>
          )}
        </div>

        {bio && <p className="text-white text-sm mb-3 leading-relaxed">{bio}</p>}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-500 text-sm mb-3">
          <span className="flex items-center gap-1">
            <Link2 size={14} />
            x.com/{cleanHandle}
          </span>
        </div>

        {isFetching && !cached ? (
          <div className="flex gap-5 animate-pulse">
            <div className="h-4 bg-zinc-800 rounded w-20" />
            <div className="h-4 bg-zinc-800 rounded w-20" />
          </div>
        ) : (
          <div className="flex gap-5 text-sm">
            <span><span className="text-white font-bold">{followingCount.toLocaleString()}</span> <span className="text-zinc-500">Following</span></span>
            <span><span className="text-white font-bold">{followersCount.toLocaleString()}</span> <span className="text-zinc-500">Followers</span></span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2f3336]">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-4 hover:bg-white/5 transition-colors relative capitalize"
          >
            <span className={cn('text-[15px] font-bold', activeTab === tab ? 'text-white' : 'text-zinc-500')}>
              {tab}
            </span>
            {activeTab === tab && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-[#1d9bf0] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Posts */}
      {userPosts.length === 0 ? (
        <div className="flex flex-col items-center py-16 px-8 text-center">
          <p className="text-white text-2xl font-bold mb-2">No {activeTab} yet</p>
          <p className="text-zinc-500 text-sm">When @{cleanHandle} posts, they'll show up here.</p>
        </div>
      ) : activeTab === 'media' ? (
        <div className="grid grid-cols-3 gap-0.5 bg-zinc-900">
          {userPosts.map(post => (
            <div
              key={post.id}
              className="aspect-square overflow-hidden cursor-pointer relative group"
              onClick={() => onPostClick?.(post.id)}
            >
              <img
                src={post.mediaUrl}
                alt=""
                className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
              />
            </div>
          ))}
        </div>
      ) : (
        userPosts.map(post => (
          <SocialPostCard
            key={post.id}
            post={post}
            onClick={() => onPostClick?.(post.id)}
            onProfileClick={(h) => onProfileClick?.(h || post.handle)}
          />
        ))
      )}
      {showEditProfile && (
        <EditProfile
          initialData={{
            name: state.userProfile?.name || commName,
            handle: state.userProfile?.handle || ('@' + commName.toLowerCase().replace(/\s+/g, '')),
            bio: state.userProfile?.bio || '',
            location: state.userProfile?.location || '',
            website: state.userProfile?.website || '',
            avatarUrl: state.userProfile?.avatarUrl,
            bannerUrl: state.userProfile?.bannerUrl,
          }}
          onClose={() => setShowEditProfile(false)}
          onSave={() => setShowEditProfile(false)}
        />
      )}
    </div>
  );
};
