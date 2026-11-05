import type { NBAPlayer } from '../types';

// Manually reconciled source identities. These are last-known pre-branch clubs, not simulated transfers.
const SOURCES: Record<string, { bornYear: number; club: NonNullable<NBAPlayer['preDraftClub']>; source: string }> = {
  'zengm-draft-2013-abrinal01': {
    bornYear: 1993,
    club: { name: 'Clínicas Rincón (Unicaja)', season: 2011, rosterBucket: 'senior' },
    source: 'https://www.fiba.basketball/en/news/news-re-living-fiba-youth-events-when-alex-abrines-went-from-unknown-to-mvp',
  },
};

export function getHistoricalProspectSourceClub(internalId: string, bornYear: number | undefined, completedThrough: number): NBAPlayer['preDraftClub'] {
  const source = SOURCES[internalId];
  return source && source.bornYear === bornYear && source.club.season <= completedThrough
    ? { ...source.club }
    : undefined;
}
