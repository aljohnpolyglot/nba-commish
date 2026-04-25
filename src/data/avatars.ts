import { fetchWithCache } from '../services/utils/fetchWithCache';

export interface AvatarData {
  name: string;
  handle: string;
  avatarUrl: string;
}

const AVATAR_GIST_URL = "https://gist.githubusercontent.com/aljohnpolyglot/4711f5bd42dc7e82f0489bbc5b897711/raw/0d93b93e0a3760af1ee0953a41ae3e8373cb5bb4/nba_twitter_handles";

export let AVATAR_DATA: AvatarData[] = [];

export const fetchAvatarData = async () => {
    const data = await fetchWithCache<AvatarData[]>('avatars', AVATAR_GIST_URL);
    if (data) {
        AVATAR_DATA = data;
        console.log(`Avatars synced: ${AVATAR_DATA.length} entries loaded.`);
    }
};
