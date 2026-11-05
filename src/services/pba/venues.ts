export interface PbaVenue {
  id: string;
  name: string;
  city: string;
  openedYear: number;
  capacity: number | null;
  sourceUrl: string;
}

interface PbaVenueSource {
  venues?: PbaVenue[];
}

let venueCache: PbaVenue[] | null = null;

export async function loadPbaVenues(seasonYear: number): Promise<PbaVenue[]> {
  if (!venueCache) {
    const response = await fetch('/data/pba/philippines-basketball-venues.json');
    if (!response.ok) throw new Error(`PBA venue source failed (${response.status})`);
    const source = await response.json() as PbaVenueSource;
    venueCache = Array.isArray(source.venues) ? source.venues : [];
  }
  return venueCache
    .filter(venue => venue.openedYear <= seasonYear)
    .sort((left, right) =>
      (right.capacity ?? 0) - (left.capacity ?? 0)
      || left.name.localeCompare(right.name)
    );
}

export function pickRecommendedPbaVenue(venues: PbaVenue[]): PbaVenue | undefined {
  return venues[0];
}
