import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Calendar, MapPin, Link as LinkIcon, MoreHorizontal } from 'lucide-react';
import { useSocialGame } from '../../store/SocialGameContext';
import { SocialPost, UserProfile } from '../../types';
import SocialPostCard from './SocialPostCard';
import { EditProfile } from './EditProfile';
import { cn } from '../../lib/utils';
import { generateSocialStats } from '../../utils/socialhelpers';

interface ProfileViewProps {
  handle: string;
  onBack: () => void;
  onPostClick?: (postId: string) => void;
  onProfileClick?: (handle: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ handle, onBack, onPostClick, onProfileClick }) => {
const { state, followUser, unfollowUser, dispatchAction } = useSocialGame();
  const [activeTab, setActiveTab] = useState<'Posts' | 'Replies' | 'Media' | 'Likes'>('Posts');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [fetchedProfile, setFetchedProfile] = useState<any>(null);
  
  const cleanHandle = handle.replace('@', '');
  const isFollowing = (state.followedHandles || []).includes(cleanHandle);
  const isCurrentUser = cleanHandle === 'username' || handle === state.userProfile.handle;

  useEffect(() => {
    const cached = state.cachedProfiles?.[cleanHandle];
    
    // If we have it in cache, use it immediately and stop loading
    if (cached) {
      setFetchedProfile(cached);
      setIsLoadingProfile(false);
      return;
    }

    const fetchProfileData = async () => {
      setIsLoadingProfile(true);
      try {
        const API = "https://twitterfollowers.mogatas-princealjohn-05082003.workers.dev";
        const r = await fetch(`${API}?handle=${cleanHandle}`);
        const d = await r.json();

        if (d && d.success !== false) {
          let bio = d.aboutBio || "";
          
          // Clear the bio if it's the specific hardcoded string the user complained about
          if (bio.includes("Everything is directly taken from official API Service")) {
            bio = "";
          }

          const profileData = {
            name: d.name || cleanHandle,
            handle: `@${cleanHandle}`,
            bio: bio,
            location: 'Global',
            website: `x.com/${cleanHandle}`,
            avatarUrl: d.scrapedAvatar,
            bannerUrl: d.scrapedBanner,
            followingCount: d.bottomOdos?.[1] || 1200,
            followersCount: d.followerCount || 45800000,
            verified: d.verified
          };
          setFetchedProfile(profileData);
          
          // Cache the profile
          dispatchAction({ type: 'CACHE_PROFILE', payload: { handle: cleanHandle, profile: profileData } });

          // If it's the current user, update the global state
          if (isCurrentUser) {
            dispatchAction({ type: 'UPDATE_PROFILE', payload: profileData });
          }

          // Update existing posts in feed from this user to use real avatar/name
          const updatedFeed = state.socialFeed.map(post => {
            if (post.handle.replace('@', '') === cleanHandle) {
              return {
                ...post,
                author: profileData.name,
                avatarUrl: profileData.avatarUrl || post.avatarUrl,
                verified: profileData.verified
              };
            }
            return post;
          });
          
          if (JSON.stringify(updatedFeed) !== JSON.stringify(state.socialFeed)) {
            dispatchAction({ type: 'SET_FEED', payload: updatedFeed });
          }
        }
      } catch (e) {
        console.error("Error fetching profile data:", e);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchProfileData();
  }, [cleanHandle, isCurrentUser, dispatchAction, state.cachedProfiles?.[cleanHandle]]);

  // Find a post by this user to get their info, or use defaults
  const userPost = state.socialFeed.find(p => p.handle === handle);
  
  // Use fetchedProfile if available, otherwise fallback
  const profile = useMemo(() => {
    if (fetchedProfile) return fetchedProfile;
    if (isCurrentUser) return state.userProfile;
    
    const stats = generateSocialStats(cleanHandle);
    return {
      name: userPost?.author || cleanHandle,
      handle: handle,
      bio: '',
      location: 'Global',
      website: `x.com/${cleanHandle}`,
      avatarUrl: userPost?.avatarUrl,
      bannerUrl: undefined,
      followingCount: stats.following,
      followersCount: stats.followers,
    };
  }, [fetchedProfile, isCurrentUser, state.userProfile, cleanHandle, userPost, handle]);

  const name = profile.name;
  const avatar = profile.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanHandle}`;
  
  const userPosts = useMemo(() => 
    state.socialFeed.filter(p => 
      (p.handle === handle && !p.replyToId) || 
      (isCurrentUser && p.isRetweeted && !p.replyToId)
    ), 
    [state.socialFeed, handle, isCurrentUser]
  );
  const replyPosts = useMemo(() => state.socialFeed.filter(p => p.handle === handle), [state.socialFeed, handle]);
  const likedPosts = useMemo(() => state.socialFeed.filter(p => p.isLiked), [state.socialFeed]);
  const mediaPosts = useMemo(() => state.socialFeed.filter(p => p.handle === handle && p.mediaUrl), [state.socialFeed, handle]);

  const handleToggleFollow = () => {
    if (isFollowing) {
      unfollowUser(cleanHandle);
    } else {
      followUser(cleanHandle);
    }
  };

  const displayPosts = useMemo(() => {
    switch (activeTab) {
      case 'Likes': return likedPosts;
      case 'Media': return mediaPosts;
      case 'Replies': return replyPosts;
      default: return userPosts;
    }
  }, [activeTab, userPosts, replyPosts, likedPosts, mediaPosts]);

  const formatCount = (count: number) => {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count.toString();
  };

  return (
    <div className="flex flex-col min-h-screen bg-black">
      {isEditing && (
        <EditProfile 
        initialData={state.userProfile ?? { name: '', handle: '@username' }}
          onClose={() => setIsEditing(false)}
          onSave={(data) => {
            setIsEditing(false);
          }}
        />
      )}

      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md px-4 py-1 flex items-center space-x-8 border-b border-[#2f3336]">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center space-x-1">
            <h2 className="text-xl font-bold">{name}</h2>
            {profile.verified && (
              <svg className="w-5 h-5 text-sky-500" viewBox="0 0 512 512" fill="currentColor">
                <path d="M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z"></path>
              </svg>
            )}
          </div>
          <p className="text-zinc-500 text-sm">{userPosts.length} posts</p>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => {
              if (window.confirm('Are you sure you want to reset the app? This will clear all generated threads and your profile changes.')) {
                localStorage.removeItem('twitter_game_state');
                window.location.reload();
              }
            }}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-zinc-500 hover:text-rose-500"
            title="Reset App"
          >
            <MoreHorizontal size={20} />
          </button>
        </div>
      </div>

      <div className="h-[200px] bg-zinc-800 w-full relative">
        {isLoadingProfile ? (
          <div className="w-full h-full bg-zinc-900 animate-pulse" />
        ) : profile.bannerUrl ? (
          <img src={profile.bannerUrl} alt="Banner" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full bg-zinc-800" />
        )}
        <div className="absolute -bottom-16 left-4 p-1 bg-black rounded-full z-10">
          <div className="w-32 h-32 rounded-full bg-zinc-900 border-4 border-black overflow-hidden relative">
            {isLoadingProfile ? (
              <div className="w-full h-full bg-zinc-800 animate-pulse" />
            ) : avatar ? (
              <img src={avatar} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-white bg-zinc-800">
                {name?.[0] || '?'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-20 px-4 space-y-4">
        <div className="flex justify-end">
          {isLoadingProfile ? (
            <div className="w-24 h-9 bg-zinc-800 rounded-full animate-pulse" />
          ) : isCurrentUser ? (
            <button 
              onClick={() => setIsEditing(true)}
              className="border border-zinc-500 text-white font-bold px-4 py-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              Edit profile
            </button>
          ) : (
            <button 
              onClick={handleToggleFollow}
              className={cn(
                "font-bold px-4 py-1.5 rounded-full transition-colors group",
                isFollowing 
                  ? "bg-transparent border border-zinc-500 text-white hover:bg-rose-500/10 hover:border-rose-500 hover:text-rose-500"
                  : "bg-white text-black hover:bg-zinc-200"
              )}
            >
              <span className={isFollowing ? "group-hover:hidden" : ""}>{isFollowing ? "Following" : "Follow"}</span>
              {isFollowing && <span className="hidden group-hover:inline">Unfollow</span>}
            </button>
          )}
        </div>

        <div>
          <div className="flex items-center space-x-1">
            {isLoadingProfile ? (
              <div className="w-48 h-7 bg-zinc-800 rounded animate-pulse" />
            ) : (
              <>
                <h2 className="text-xl font-bold">{name}</h2>
                {profile.verified && (
                  <svg className="w-5 h-5 text-sky-500" viewBox="0 0 512 512" fill="currentColor">
                    <path d="M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248 6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z"></path>
                  </svg>
                )}
              </>
            )}
          </div>
          {isLoadingProfile ? (
            <div className="w-32 h-5 bg-zinc-800 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-zinc-500">{handle}</p>
          )}
        </div>

        {isLoadingProfile ? (
          <div className="space-y-2">
            <div className="w-full h-4 bg-zinc-800 rounded animate-pulse" />
            <div className="w-2/3 h-4 bg-zinc-800 rounded animate-pulse" />
          </div>
        ) : (
          <p className="text-[15px]">
            {profile.bio}
          </p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-zinc-500 text-sm">
          <div className="flex items-center space-x-1">
            <MapPin size={16} />
            {isLoadingProfile ? (
              <div className="w-20 h-4 bg-zinc-800 rounded animate-pulse" />
            ) : (
              <span>{profile.location}</span>
            )}
          </div>
          <div className="flex items-center space-x-1">
            <LinkIcon size={16} />
            {isLoadingProfile ? (
              <div className="w-32 h-4 bg-zinc-800 rounded animate-pulse" />
            ) : (
              <span className="text-sky-500 hover:underline cursor-pointer">{profile.website}</span>
            )}
          </div>
          <div className="flex items-center space-x-1">
            <Calendar size={16} />
            {isLoadingProfile ? (
              <div className="w-24 h-4 bg-zinc-800 rounded animate-pulse" />
            ) : (
              <span>Joined {new Date(state.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            )}
          </div>
        </div>

        <div className="flex space-x-4 text-sm">
          <div className="hover:underline cursor-pointer" onClick={() => isCurrentUser && onBack()}>
            <span className="font-bold text-white">
              {isLoadingProfile ? (
                <div className="inline-block w-8 h-4 bg-zinc-800 rounded animate-pulse" />
              ) : isCurrentUser ? (
                formatCount(state.followedHandles.length)
              ) : (
                formatCount(profile.followingCount)
              )}
            </span> <span className="text-zinc-500">Following</span>
          </div>
          <div className="hover:underline cursor-pointer">
            <span className="font-bold text-white">
              {isLoadingProfile ? (
                <div className="inline-block w-12 h-4 bg-zinc-800 rounded animate-pulse" />
              ) : (
                formatCount(profile.followersCount)
              )}
            </span> <span className="text-zinc-500">Followers</span>
          </div>
        </div>
      </div>

      <div className="flex w-full border-b border-zinc-800 mt-4">
        {(['Posts', 'Replies', 'Media', 'Likes'] as const).map((tab) => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-4 hover:bg-white/5 transition-colors relative"
          >
            <span className={cn(
              "text-[15px] font-bold",
              activeTab === tab ? "text-white" : "text-zinc-500"
            )}>
              {tab}
            </span>
            {activeTab === tab && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-sky-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col">
        {isLoadingProfile ? (
          <div className="space-y-0">
            {[1, 2, 3].map(i => (
              <div key={i} className="px-4 py-3 border-b border-[#2f3336] animate-pulse">
                <div className="flex space-x-3">
                  <div className="h-10 w-10 bg-zinc-800 rounded-full" />
                  <div className="flex-1 space-y-3 py-1">
                    <div className="h-4 bg-zinc-800 rounded w-1/4" />
                    <div className="space-y-2">
                      <div className="h-4 bg-zinc-800 rounded w-full" />
                      <div className="h-4 bg-zinc-800 rounded w-5/6" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : displayPosts.length > 0 ? (
          activeTab === 'Media' ? (
            <div className="grid grid-cols-3 gap-1 p-1">
              {displayPosts.map(post => (
                <div key={post.id} className="aspect-square relative group cursor-pointer overflow-hidden">
                  <img 
                    src={post.mediaUrl} 
                    alt="" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                </div>
              ))}
            </div>
          ) : (
            displayPosts.map(post => (
              <SocialPostCard 
                key={post.id} 
                post={post} 
                onClick={() => onPostClick?.(post.id)} 
                onProfileClick={(handle) => onProfileClick?.(handle || post.handle)}
              />
            ))
          )
        ) : (
          <div className="p-10 text-center text-zinc-500">
            {activeTab === 'Media' ? (
              <>
                <p className="text-xl font-bold text-white">No media yet</p>
                {/* TODO: Claude code - transfer lazyloaded media from real game here */}
                <p className="text-sm mt-1">When {name} posts photos or videos, they will show up here.</p>
              </>
            ) : activeTab === 'Likes' ? (
              <>
                <p className="text-xl font-bold text-white">No likes yet</p>
                <p className="text-sm mt-1">When {name} likes posts, they will show up here.</p>
              </>
            ) : (
              <p>Nothing to see here yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
