export interface AvatarData {
  name: string;
  handle: string;
  avatarUrl: string;
}

// Your Avatar/Handlers Gist
const AVATAR_GIST_URL = "https://gist.githubusercontent.com/aljohnpolyglot/4711f5bd42dc7e82f0489bbc5b897711/raw/0d93b93e0a3760af1ee0953a41ae3e8373cb5bb4/nba_twitter_handles";

/**
 * COMPRESSED: All avatar data moved to Gist.
 * Starts as an empty array.
 */
export let AVATAR_DATA: AvatarData[] = [];

export const fetchAvatarData = async () => {
    try {
        const response = await fetch(AVATAR_GIST_URL);
        if (!response.ok) return;
        const data = await response.json();
        
        // Populate the array with the Gist data
        AVATAR_DATA = data;
        console.log(`Avatars synced: ${AVATAR_DATA.length} entries loaded.`);
    } catch (e) {
        console.error("Avatar sync failed", e);
    }
};

