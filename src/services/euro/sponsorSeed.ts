import { getSponsorCatalogSync, pickSponsorName } from '../../data/sponsorCatalogFetcher';
import type { SponsorshipSlot, TycoonTier } from '../../types/tycoon';
import { leagueIdToKey, type SponsorSlot } from './sponsorSeedTypes';

const SLOT_MAP: Array<{ slotId: SponsorSlot['slotId']; catalog: SponsorshipSlot }> = [
  { slotId: 'main', catalog: 'kit' },
  { slotId: 'jersey', catalog: 'sleeve' },
  { slotId: 'arena', catalog: 'stadium' },
];

const TIER_AMOUNTS: Record<TycoonTier, Record<SponsorSlot['slotId'], number>> = {
  S: { main: 8_000_000, jersey: 4_000_000, arena: 2_000_000 },
  A: { main: 3_000_000, jersey: 1_500_000, arena: 800_000 },
  B: { main: 1_200_000, jersey: 500_000, arena: 300_000 },
  C: { main: 400_000, jersey: 150_000, arena: 100_000 },
  D: { main: 150_000, jersey: 60_000, arena: 40_000 },
};

export function seedSponsors(leagueId: string, tier: TycoonTier, _subSeed: number): SponsorSlot[] {
  const catalog = getSponsorCatalogSync();
  if (!catalog) return [];
  const leagueKey = leagueIdToKey(leagueId);
  if (!leagueKey) return [];
  const amounts = TIER_AMOUNTS[tier];
  return SLOT_MAP.map(({ slotId, catalog: catalogSlot }) => ({
    slotId,
    brand: pickSponsorName(leagueKey, tier, catalogSlot),
    amountEUR: amounts[slotId],
    years: 3,
  }));
}
