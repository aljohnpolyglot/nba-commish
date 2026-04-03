import { generateSocialStats } from './socialhelpers';

export const fetchProfileData = async (handle: string, dispatchAction: (action: any) => void) => {
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

      profileData = {
        name: d.name || cleanHandle,
        handle: `@${cleanHandle}`,
        bio,
        location: 'Global',
        website: `x.com/${cleanHandle}`,
        avatarUrl: d.scrapedAvatar || undefined,
        bannerUrl: d.scrapedBanner || undefined,
        followingCount: d.bottomOdos?.[1] || 0,
        followersCount: d.followerCount || 0,
        verified: d.verified || false
      };
    } else {
      // Handle doesn't exist on Twitter — use generated stats, no avatar
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
        avatarUrl: undefined
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
      avatarUrl: undefined
    };
    dispatchAction({ type: 'CACHE_PROFILE', payload: { handle: cleanHandle, profile: fallback } });
    return fallback;
  }
};
