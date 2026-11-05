export const NBA_CONFERENCE_LOGO_SOURCE = {
  east: 'https://github.com/aljohnpolyglot/nba-store-data/blob/main/nba-eastern-conference-logos-2026-09-04T22-52-46-768Z.json',
  west: 'https://github.com/aljohnpolyglot/nba-store-data/blob/main/nba-western-conference-logos-2026-09-04T22-53-30-803Z.json',
  capturedAt: '2026-09-04',
} as const;

export type NbaConference = 'East' | 'West';

const NBA_CONFERENCE_LOGOS = {
  East: {
    legacy: 'https://content.sportslogos.net/logos/6/999/full/2995.gif',
    current: 'https://content.sportslogos.net/logos/6/999/full/9515__nba_eastern_conference-primary-2018.png',
  },
  West: {
    legacy: 'https://content.sportslogos.net/logos/6/1001/full/2996.gif',
    current: 'https://content.sportslogos.net/logos/6/1001/full/3926__nba_western_conference-primary-2018.png',
  },
} as const;

export function resolveNbaConferenceLogo(
  conference: NbaConference,
  season: number,
): string | undefined {
  if (!Number.isInteger(season) || season < 1994) return undefined;
  return NBA_CONFERENCE_LOGOS[conference][season >= 2018 ? 'current' : 'legacy'];
}
