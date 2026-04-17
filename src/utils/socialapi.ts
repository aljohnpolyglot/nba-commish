import { generateSocialStats } from './socialhelpers';

/**
 * Find the avatar URL for a handle from existing social feed posts.
 * Posts already have avatarUrl set from the social engine — reuse it.
 */
function findAvatarFromPosts(handle: string, state: any): string | undefined {
  const clean = handle.replace('@', '').toLowerCase();
  const posts: any[] = state?.socialFeed ?? [];
  for (const p of posts) {
    if ((p.handle ?? '').replace('@', '').toLowerCase() === clean && p.avatarUrl) {
      return p.avatarUrl;
    }
  }
  return undefined;
}

export const fetchProfileData = async (handle: string, dispatchAction: (action: any) => void, state?: any) => {
  const cleanHandle = handle.replace('@', '');

  try {
    const API = "https://twitterfollowers.mogatas-princealjohn-05082003.workers.dev";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const r = await fetch(`${API}?handle=${cleanHandle}`, { signal: controller.signal });
    const d = await r.json();
    clearTimeout(timeoutId);

    let profileData;
    if (d && d.success !== false && d.name) {
      let bio = d.aboutBio || "";
      if (bio.includes("Everything is directly taken from official API Service")) bio = "";

      // Avatar: API may return it under various field names; fall back to existing post avatar
      const apiAvatar = d.scrapedAvatar || d.profileImageUrl || d.avatar || d.image || d.profile_image_url || d.profile_image_url_https;
      const avatarUrl = apiAvatar || findAvatarFromPosts(cleanHandle, state);
      const bannerUrl = d.scrapedBanner || d.profileBannerUrl || d.banner || d.profile_banner_url || undefined;

      profileData = {
        name: d.name || cleanHandle,
        handle: `@${cleanHandle}`,
        bio,
        location: 'Global',
        website: `x.com/${cleanHandle}`,
        avatarUrl,
        bannerUrl,
        followingCount: d.bottomOdos?.[1] || 0,
        followersCount: d.followerCount || 0,
        verified: d.verified || false
      };
    } else {
      const stats = generateSocialStats(cleanHandle);
      profileData = {
        name: cleanHandle,
        handle: `@${cleanHandle}`,
        bio: "",
        location: 'Global',
        website: `x.com/${cleanHandle}`,
        followingCount: stats.following,
        followersCount: stats.followers,
        verified: false,
        avatarUrl: findAvatarFromPosts(cleanHandle, state)
      };
    }

    dispatchAction({ type: 'CACHE_PROFILE', payload: { handle: cleanHandle, profile: profileData } });
    return profileData;
  } catch (e: any) {
    const stats = generateSocialStats(cleanHandle);
    const fallback = {
      name: cleanHandle,
      handle: `@${cleanHandle}`,
      bio: "",
      location: 'Global',
      website: `x.com/${cleanHandle}`,
      followingCount: stats.following,
      followersCount: stats.followers,
      verified: false,
      avatarUrl: findAvatarFromPosts(cleanHandle, state)
    };
    dispatchAction({ type: 'CACHE_PROFILE', payload: { handle: cleanHandle, profile: fallback } });
    return fallback;
  }
};
