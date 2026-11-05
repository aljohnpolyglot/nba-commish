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
  'french-jeep-elite': 'france',
  'italian-serie-a': 'italy',
  'german-bbl': 'germany',
  'greek-heba-a1': 'greece',
  'turkish-bsl': 'turkey',
  'lithuanian-lkl': 'lithuania',
  'israeli-bsl': 'israel',
  'vtb-united-league': 'russia',
  'adriatic-league': 'adriatic',
  eurocup: 'spain',
};

export function leagueIdToKey(leagueId: string): LeagueKey | undefined {
  return LEAGUE_ID_TO_KEY[leagueId];
}
