import type { TierBase, TycoonTier, SponsorshipSlot } from '../../../types/tycoon';

export const TIER_BASE: Record<TycoonTier, TierBase> = {
  S: { stadiumCapacity: 15000, ticketPrice: 45, tvRevenue: 8_000_000,
       sponsorshipFloor: { kit: 3_000_000, sleeve: 3_000_000, stadium: 3_000_000 },
       facilityOpsPerLevel: 400_000, travelBase: 800_000, scoutingBudget: 600_000, startingCash: 40_000_000 },
  A: { stadiumCapacity: 10000, ticketPrice: 30, tvRevenue: 3_000_000,
       sponsorshipFloor: { kit: 1_000_000, sleeve: 1_000_000, stadium: 1_000_000 },
       facilityOpsPerLevel: 200_000, travelBase: 500_000, scoutingBudget: 300_000, startingCash: 15_000_000 },
  B: { stadiumCapacity: 7500, ticketPrice: 22, tvRevenue: 1_500_000,
       sponsorshipFloor: { kit: 400_000, sleeve: 400_000, stadium: 400_000 },
       facilityOpsPerLevel: 120_000, travelBase: 350_000, scoutingBudget: 150_000, startingCash: 5_000_000 },
  C: { stadiumCapacity: 5500, ticketPrice: 18, tvRevenue: 800_000,
       sponsorshipFloor: { kit: 200_000, sleeve: 200_000, stadium: 200_000 },
       facilityOpsPerLevel: 80_000, travelBase: 250_000, scoutingBudget: 80_000, startingCash: 2_000_000 },
  D: { stadiumCapacity: 4500, ticketPrice: 15, tvRevenue: 400_000,
       sponsorshipFloor: { kit: 100_000, sleeve: 100_000, stadium: 100_000 },
       facilityOpsPerLevel: 50_000, travelBase: 180_000, scoutingBudget: 40_000, startingCash: 500_000 },
};

/** Map club name (or region prefix) → tier. Lookup is case-insensitive and tries
 *  both the full name and just the region word (e.g. "Real Madrid Baloncesto"
 *  matches "Real Madrid" entry below). Unknown clubs fall through to 'D'. */
export const SPAIN_CLUB_TIERS: Record<string, TycoonTier> = {
  'Real Madrid': 'S',
  'FC Barcelona': 'S',
  'Barcelona': 'S',
  'Valencia Basket': 'A',
  'Valencia': 'A',
  'Baskonia': 'A',
  'Joventut': 'A',
  'Joventut Badalona': 'A',
  'Unicaja': 'A',
  'Gran Canaria': 'B',
  'Tenerife': 'B',
  'Lenovo Tenerife': 'B',
  'Bilbao': 'B',
  'Bilbao Basket': 'B',
  'UCAM Murcia': 'B',
  'Murcia': 'B',
  'Zaragoza': 'B',
  'San Pablo Burgos': 'B',
  'Burgos': 'B',
  'Manresa': 'C',
  'Baxi Manresa': 'C',
  'Andorra': 'C',
  'MoraBanc Andorra': 'C',
  'Río Breogán': 'C',
  'Breogán': 'C',
  'Covirán Granada': 'C',
  'Granada': 'C',
};

export const SPAIN_INITIAL_SPONSORS: Record<TycoonTier, Record<SponsorshipSlot, string[]>> = {
  S: { kit: ['Emirates', 'Adidas', 'Herbalife'],
       sleeve: ['Plus500', 'Mahou', 'Iberdrola'],
       stadium: ['WiZink Center', 'Spotify Arena', 'Movistar Arena'] },
  A: { kit: ['Bankia', 'Caixa', 'Mapfre'],
       sleeve: ['Acciona', 'Naturgy', 'Iberia'],
       stadium: ['Fuente San Luis', 'Buesa Arena', 'Olímpico'] },
  B: { kit: ['Local Bank', 'Damm', 'Cabify Regional'],
       sleeve: ['Provincial Insurance', 'Reale', 'Liberbank'],
       stadium: ['Pabellón Municipal', 'Coliseum', 'Pabellón Insular'] },
  C: { kit: ['Regional Coop', 'Caja Rural'],
       sleeve: ['Local Energy', 'Provincial Tour'],
       stadium: ['Pavelló Municipal', 'Pabellón Río', 'Polideportivo'] },
  D: { kit: ['City Sports', 'Town Supplies'],
       sleeve: ['Local Services'],
       stadium: ['Municipal Sports Hall'] },
};

export function getTierForClub(clubName: string): TycoonTier {
  if (!clubName) return 'D';
  if (SPAIN_CLUB_TIERS[clubName]) return SPAIN_CLUB_TIERS[clubName];
  // Try region prefix (first word) for cases like "Real Madrid Baloncesto"
  const firstTwo = clubName.split(' ').slice(0, 2).join(' ');
  if (SPAIN_CLUB_TIERS[firstTwo]) return SPAIN_CLUB_TIERS[firstTwo];
  const firstWord = clubName.split(' ')[0];
  if (SPAIN_CLUB_TIERS[firstWord]) return SPAIN_CLUB_TIERS[firstWord];
  return 'D';
}
