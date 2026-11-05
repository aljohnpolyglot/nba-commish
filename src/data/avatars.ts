import { SOCIAL_HANDLES } from './social/handles';

export interface AvatarData {
  name: string;
  handle: string;
  avatarUrl: string;
}

export const AVATAR_DATA: AvatarData[] = Object.values(SOCIAL_HANDLES).map(({ name, handle }) => ({
  name,
  handle,
  avatarUrl: `/img/social/avatars/${handle.toLowerCase()}.png`,
}));

export const fetchAvatarData = async () => AVATAR_DATA;
