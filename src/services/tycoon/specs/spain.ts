import type { TierBase, TycoonTier, SponsorshipSlot } from '../../../types/tycoon';

const slot = (
  kit: number, sleeve: number, back: number, shorts: number,
  training: number, court: number, stadium: number, practice: number,
): Record<SponsorshipSlot, number> => ({
  kit, sleeve, back, shorts, training, court, stadium, practice,
});

export const TIER_BASE: Record<TycoonTier, TierBase> = {
  S: { stadiumCapacity: 15000, ticketPrice: 45, tvRevenue: 8_000_000,
       sponsorshipFloor: slot(3_500_000, 2_000_000, 1_500_000, 800_000, 600_000, 400_000, 4_000_000, 300_000),
       facilityOpsPerLevel: 400_000, travelBase: 800_000, scoutingBudget: 600_000, startingCash: 40_000_000 },
  A: { stadiumCapacity: 10000, ticketPrice: 30, tvRevenue: 3_000_000,
       sponsorshipFloor: slot(1_200_000, 700_000, 500_000, 300_000, 250_000, 150_000, 1_500_000, 100_000),
       facilityOpsPerLevel: 200_000, travelBase: 500_000, scoutingBudget: 300_000, startingCash: 15_000_000 },
  B: { stadiumCapacity: 7500, ticketPrice: 22, tvRevenue: 1_500_000,
       sponsorshipFloor: slot(500_000, 300_000, 200_000, 100_000, 100_000, 60_000, 600_000, 40_000),
       facilityOpsPerLevel: 120_000, travelBase: 350_000, scoutingBudget: 150_000, startingCash: 5_000_000 },
  C: { stadiumCapacity: 5500, ticketPrice: 18, tvRevenue: 800_000,
       sponsorshipFloor: slot(250_000, 150_000, 100_000, 50_000, 50_000, 30_000, 300_000, 20_000),
       facilityOpsPerLevel: 80_000, travelBase: 250_000, scoutingBudget: 80_000, startingCash: 2_000_000 },
  D: { stadiumCapacity: 4500, ticketPrice: 15, tvRevenue: 400_000,
       sponsorshipFloor: slot(120_000, 70_000, 50_000, 20_000, 30_000, 15_000, 150_000, 10_000),
       facilityOpsPerLevel: 50_000, travelBase: 180_000, scoutingBudget: 40_000, startingCash: 500_000 },
};

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

/** City prestige 0..1 — drives sponsorship floor scaling decoupled from tier. */
export const SPAIN_CITY_PRESTIGE: Record<string, number> = {
  'Real Madrid': 1.00,
  'FC Barcelona': 1.00,
  'Barcelona': 1.00,
  'Valencia Basket': 0.80,
  'Valencia': 0.80,
  'Baskonia': 0.75,
  'Joventut': 0.75,
  'Joventut Badalona': 0.75,
  'Unicaja': 0.80,
  'Gran Canaria': 0.60,
  'Tenerife': 0.55,
  'Lenovo Tenerife': 0.55,
  'Bilbao': 0.65,
  'Bilbao Basket': 0.65,
  'UCAM Murcia': 0.50,
  'Murcia': 0.50,
  'Zaragoza': 0.55,
  'San Pablo Burgos': 0.45,
  'Burgos': 0.45,
  'Manresa': 0.40,
  'Baxi Manresa': 0.40,
  'Andorra': 0.40,
  'MoraBanc Andorra': 0.40,
  'Río Breogán': 0.35,
  'Breogán': 0.35,
  'Covirán Granada': 0.30,
  'Granada': 0.30,
};

const TIER_PRESTIGE_DEFAULT: Record<TycoonTier, number> = {
  S: 0.95, A: 0.65, B: 0.50, C: 0.40, D: 0.30,
};

// Offline fallback only. The gist at https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/sponsor-catalog.json
// is the source of truth at runtime. Edit there, not here.
export const SPAIN_INITIAL_SPONSORS: Record<TycoonTier, Record<SponsorshipSlot, string[]>> = {
  S: {
    kit: ['Emirates', 'Adidas', 'Herbalife'],
    sleeve: ['Plus500', 'Mahou', 'Iberdrola'],
    back: ['BBVA', 'Endesa', 'Mapfre'],
    shorts: ['Banco Santander', 'Repsol', 'Iberia'],
    training: ['Nike', 'Adidas Training', 'Under Armour'],
    court: ['Movistar', 'Coca-Cola', 'Spotify'],
    stadium: ['WiZink Center', 'Spotify Arena', 'Movistar Arena'],
    practice: ['Real Madrid City', 'Sports Hub Valdebebas', 'Adidas Center'],
  },
  A: {
    kit: ['Bankia', 'Caixa', 'Mapfre'],
    sleeve: ['Acciona', 'Naturgy', 'Iberia'],
    back: ['Cetelem', 'EVO Banco', 'Liberbank'],
    shorts: ['Ibercaja', 'Mahou Regional', 'Tecnocasa'],
    training: ['Joma', 'Kelme', 'Macron'],
    court: ['Iberdrola', 'Endesa', 'Telefónica'],
    stadium: ['Fuente San Luis', 'Buesa Arena', 'Olímpico'],
    practice: ['Training Complex', 'Performance Center', 'Sports Campus'],
  },
  B: {
    kit: ['Local Bank', 'Damm', 'Cabify Regional'],
    sleeve: ['Provincial Insurance', 'Reale', 'Liberbank'],
    back: ['Caja Rural Regional', 'Hipercor', 'Local Energy'],
    shorts: ['Provincial Coop', 'Local Realtor', 'Reginal Bus'],
    training: ['Hummel', 'Spalding', 'Local Sports'],
    court: ['Regional Cable', 'Local Beer', 'Provincial Bank'],
    stadium: ['Pabellón Municipal', 'Coliseum', 'Pabellón Insular'],
    practice: ['Municipal Sports Hub', 'Regional Training Center'],
  },
  C: {
    kit: ['Regional Coop', 'Caja Rural'],
    sleeve: ['Local Energy', 'Provincial Tour'],
    back: ['Local Press', 'Regional Phone'],
    shorts: ['Small Bank', 'Coop Insurance'],
    training: ['Town Sports', 'Regional Apparel'],
    court: ['Local Radio', 'Town Beverage'],
    stadium: ['Pavelló Municipal', 'Pabellón Río', 'Polideportivo'],
    practice: ['Community Training Center', 'Town Sports Hall'],
  },
  D: {
    kit: ['City Sports', 'Town Supplies'],
    sleeve: ['Local Services'],
    back: ['Town Press'],
    shorts: ['Small Coop'],
    training: ['Town Athletic'],
    court: ['Local Print'],
    stadium: ['Municipal Sports Hall'],
    practice: ['Town Practice Facility'],
  },
};

export function getTierForClub(clubName: string): TycoonTier {
  if (!clubName) return 'D';
  if (SPAIN_CLUB_TIERS[clubName]) return SPAIN_CLUB_TIERS[clubName];
  const firstTwo = clubName.split(' ').slice(0, 2).join(' ');
  if (SPAIN_CLUB_TIERS[firstTwo]) return SPAIN_CLUB_TIERS[firstTwo];
  const firstWord = clubName.split(' ')[0];
  if (SPAIN_CLUB_TIERS[firstWord]) return SPAIN_CLUB_TIERS[firstWord];
  return 'D';
}

export function getCityPrestige(clubName: string, tier: TycoonTier): number {
  if (clubName) {
    if (SPAIN_CITY_PRESTIGE[clubName] !== undefined) return SPAIN_CITY_PRESTIGE[clubName];
    const firstTwo = clubName.split(' ').slice(0, 2).join(' ');
    if (SPAIN_CITY_PRESTIGE[firstTwo] !== undefined) return SPAIN_CITY_PRESTIGE[firstTwo];
    const firstWord = clubName.split(' ')[0];
    if (SPAIN_CITY_PRESTIGE[firstWord] !== undefined) return SPAIN_CITY_PRESTIGE[firstWord];
  }
  return TIER_PRESTIGE_DEFAULT[tier];
}
