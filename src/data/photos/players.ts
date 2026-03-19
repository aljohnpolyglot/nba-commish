const NBA_CDN = (nbaId: string) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaId}.png`;

export const getPlayerPhoto = (
  imgURL?: string,
  nbaId?: string,
  isHD: boolean = false
): string => {
  const cdnUrl = nbaId ? NBA_CDN(nbaId) : '';

  if (isHD) {
    // PlayerBioView: HD first
    return cdnUrl || imgURL || '';
  }

  // Everything else: BBGM first
  return imgURL || cdnUrl || '';
};
