import type { LeagueKey } from '../../data/sponsorCatalogFetcher';
import type { SponsorshipSlot, TycoonState } from '../../types/tycoon';
import { getStableCityRoll, preloadEuroCityPools, pickWeightedEuroCity } from '../euroScouting/cityPools';

export const SPONSOR_LEAGUE_COUNTRY: Record<LeagueKey, { country: string; iso2: string }> = {
  spain: { country: 'Spain', iso2: 'ES' },
  france: { country: 'France', iso2: 'FR' },
  italy: { country: 'Italy', iso2: 'IT' },
  greece: { country: 'Greece', iso2: 'GR' },
  germany: { country: 'Germany', iso2: 'DE' },
  turkey: { country: 'Turkey', iso2: 'TR' },
  israel: { country: 'Israel', iso2: 'IL' },
  lithuania: { country: 'Lithuania', iso2: 'LT' },
  adriatic: { country: 'Serbia', iso2: 'RS' },
  russia: { country: 'Russia', iso2: 'RU' },
  philippines: { country: 'Philippines', iso2: 'PH' },
};

export interface SponsorHeadquartersPatch {
  slot: SponsorshipSlot;
  sponsor: string;
  city: string;
  country: string;
  iso2: string;
}

export async function buildMissingSponsorHeadquarters(
  state: TycoonState,
  league: LeagueKey,
): Promise<SponsorHeadquartersPatch[]> {
  await preloadEuroCityPools();
  const location = SPONSOR_LEAGUE_COUNTRY[league];
  const patches: SponsorHeadquartersPatch[] = [];
  for (const [slot, deal] of Object.entries(state.sponsorships ?? {})) {
    if (!deal || deal.headquartersCity) continue;
    const sponsorshipSlot = slot as SponsorshipSlot;
    const city = pickWeightedEuroCity(
      location.iso2,
      getStableCityRoll(`${league}:${sponsorshipSlot}:${deal.sponsor}:${deal.signedYear}`),
    );
    patches.push({
      slot: sponsorshipSlot,
      sponsor: deal.sponsor,
      city: city ?? location.country,
      country: location.country,
      iso2: location.iso2,
    });
  }
  return patches;
}
