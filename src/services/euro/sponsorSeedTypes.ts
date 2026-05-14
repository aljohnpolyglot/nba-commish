import type { LeagueKey } from '../../data/sponsorCatalogFetcher';

export type SponsorSlot = {
  slotId: 'main' | 'jersey' | 'arena';
  brand: string;
  amountEUR: number;
  years: number;
};

// Map our internal leagueId to the catalog's LeagueKey.
const LEAGUE_ID_TO_KEY: Record<string, LeagueKey> = {
  endesa: 'spain',
  euroleague: 'spain',  // catalog has no separate Euroleague — use Spain pool until expanded
};

export function leagueIdToKey(leagueId: string): LeagueKey | undefined {
  return LEAGUE_ID_TO_KEY[leagueId];
}
