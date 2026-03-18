import { AVATAR_DATA, AvatarData, fetchAvatarData as fetchFromGist } from '../data/avatars';
export type { AvatarData };

export const fetchAvatarData = async (): Promise<AvatarData[]> => {
  if (AVATAR_DATA.length === 0) {
    await fetchFromGist();
    console.log(`${AVATAR_DATA.length} avatars fetched`);
  }
  return AVATAR_DATA;
};

export const getAvatarByHandle = (handle: string, avatars: AvatarData[]): string | undefined => {
  // Normalize handle: remove '@' and lowercase
  const normalizedHandle = handle.replace(/^@/, '').toLowerCase();
  
  const match = avatars.find(a => {
    const aHandle = a.handle.replace(/^@/, '').toLowerCase();
    return aHandle === normalizedHandle;
  });
  
  return match?.avatarUrl;
};

export const getAvatarByName = (name: string, avatars: AvatarData[]): string | undefined => {
  const match = avatars.find(a => a.name.toLowerCase() === name.toLowerCase());
  return match?.avatarUrl;
};
