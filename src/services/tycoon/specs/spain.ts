import type { TierBase, TycoonTier, SponsorshipSlot, SponsorIndustry } from '../../../types/tycoon';

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
  A: { stadiumCapacity: 10500, ticketPrice: 34, tvRevenue: 4_500_000,
       sponsorshipFloor: slot(1_600_000, 900_000, 650_000, 380_000, 320_000, 200_000, 2_000_000, 140_000),
       facilityOpsPerLevel: 200_000, travelBase: 500_000, scoutingBudget: 300_000, startingCash: 15_000_000 },
  B: { stadiumCapacity: 8000, ticketPrice: 26, tvRevenue: 2_700_000,
       sponsorshipFloor: slot(850_000, 480_000, 320_000, 160_000, 150_000, 90_000, 950_000, 70_000),
       facilityOpsPerLevel: 120_000, travelBase: 350_000, scoutingBudget: 150_000, startingCash: 5_000_000 },
  C: { stadiumCapacity: 6200, ticketPrice: 23, tvRevenue: 2_000_000,
       sponsorshipFloor: slot(650_000, 360_000, 240_000, 110_000, 110_000, 70_000, 750_000, 50_000),
       facilityOpsPerLevel: 80_000, travelBase: 250_000, scoutingBudget: 80_000, startingCash: 2_000_000 },
  D: { stadiumCapacity: 5000, ticketPrice: 18, tvRevenue: 1_100_000,
       sponsorshipFloor: slot(320_000, 180_000, 120_000, 60_000, 60_000, 35_000, 380_000, 25_000),
       facilityOpsPerLevel: 50_000, travelBase: 180_000, scoutingBudget: 40_000, startingCash: 500_000 },
};

export const SPAIN_CLUB_TIERS: Record<string, TycoonTier> = {
  // ── Liga Endesa ───────────────────────────────────────────────
  // Lookup is accent + case insensitive (see normalizeClubKey below) — no
  // need to repeat every diacritic variant. Keys must cover the full
  // ENDESA_TEAMS string in genplayersconstants.ts so post-migration heal
  // can resolve "Baskonia Vitoria-Gasteiz", "La Laguna Tenerife", etc.
  'Real Madrid': 'S',
  'Madrid': 'S',
  'FC Barcelona': 'S',
  'Barcelona': 'S',
  'Valencia Basket': 'A',
  'Valencia': 'A',
  'Baskonia': 'A',
  'Baskonia Vitoria-Gasteiz': 'A',
  'Vitoria-Gasteiz': 'A',
  'Joventut': 'A',
  'Joventut Badalona': 'A',
  'Badalona': 'A',
  'Unicaja': 'A',
  'Unicaja Malaga': 'A',
  'Unicaja Málaga': 'A',
  'Malaga': 'A',
  'Gran Canaria': 'B',
  'Dreamland Gran Canaria': 'B',
  'Herbalife Gran Canaria': 'B',
  'Tenerife': 'B',
  'Lenovo Tenerife': 'B',
  'La Laguna Tenerife': 'B',
  'Iberostar Tenerife': 'B',
  'Bilbao': 'B',
  'Bilbao Basket': 'B',
  'Surne Bilbao': 'B',
  'Surne Bilbao Basket': 'B',
  'UCAM Murcia': 'B',
  'Murcia': 'B',
  'Zaragoza': 'B',
  'Casademont Zaragoza': 'B',
  'San Pablo Burgos': 'B',
  'Burgos': 'B',
  'Manresa': 'C',
  'BAXI Manresa': 'C',
  'Baxi Manresa': 'C',
  'Andorra': 'C',
  'MoraBanc Andorra': 'C',
  'Río Breogán': 'C',
  'Rio Breogan': 'C',
  'Breogán': 'C',
  'Covirán Granada': 'C',
  'Coviran Granada': 'C',
  'Granada': 'C',
  'Girona': 'C',
  'Basquet Girona': 'C',
  'Bàsquet Girona': 'C',
  'Hiopos Lleida': 'C',
  'Lleida': 'C',
  'Estudiantes': 'C',
  'Movistar Estudiantes': 'C',
  'Leyma Coruna': 'C',
  'Leyma Coruña': 'C',
  'Coruna': 'C',
  'Coruña': 'C',
  'Real Betis': 'C',
  'Betis': 'C',
  'Obradoiro': 'D',
  'Monbus Obradoiro': 'D',
  'Fuenlabrada': 'D',
  'Carplus Fuenlabrada': 'D',
  // ── EuroLeague ────────────────────────────────────────────────
  'FC Bayern Munich': 'S',
  'Bayern Munich': 'S',
  'Bayern': 'S',
  'Fenerbahce': 'S',
  'Fenerbahçe': 'S',
  'EA7 Emporio Armani Milan': 'S',
  'Olimpia Milano': 'S',
  'Milan': 'S',
  'Moscow CSKA': 'A',
  'CSKA Moscow': 'A',
  'CSKA': 'A',
  'Maccabi Tel Aviv': 'A',
  'Maccabi': 'A',
  'Olympiacos': 'A',
  'Panathinaikos': 'A',
  'Anadolu Efes': 'A',
  'Efes': 'A',
  'AS Monaco': 'A',
  'Monaco': 'A',
  'Alba Berlin': 'B',
  'ALBA Berlin': 'B',
  'Paris': 'B',
  'Paris Basketball': 'B',
  'LDLC ASVEL': 'B',
  'ASVEL': 'B',
  'Partizan': 'B',
  'Hapoel Tel Aviv': 'B',
  'Crvena Zvezda': 'C',
  'Zalgiris': 'C',
  'Zalgiris Kaunas': 'C',
  'AEK Athens': 'C',
  'Athens AEK': 'C',
  'Podgorica Buducnost': 'D',
  'Ljubljana Olimpija': 'D',
  'Vilnius Rytas': 'D',
  'Thessaloniki Aris': 'D',
  'Thessaloniki PAOK': 'D',
  'Limoges CSP': 'D',
  'Nanterre 92': 'D',
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
    kit: ['Emirates', 'Adidas', 'Nike', 'Herbalife', 'Qatar Airways', 'Tesla'],
    sleeve: ['Plus500', 'Mahou', 'Estrella Damm', 'bwin', 'Red Bull', 'Iberdrola'],
    back: ['BBVA', 'Santander', 'CaixaBank', 'Endesa', 'Mapfre', 'ING'],
    shorts: ['Repsol', 'Iberia', 'Vueling', 'Cetelem', 'Audi'],
    training: ['Nike', 'Adidas Training', 'Under Armour', 'Puma', 'Red Bull'],
    court: ['Movistar', 'Vodafone', 'Coca-Cola', 'Spotify', 'Heineken', 'Monster'],
    stadium: ['WiZink Center', 'Spotify Arena', 'Movistar Arena', 'Palau Blaugrana'],
    practice: ['Real Madrid City', 'Ciutat Esportiva', 'Adidas Center'],
  },
  A: {
    kit: ['CaixaBank', 'Mapfre', 'Hyundai', 'SEAT', 'Toyota'],
    sleeve: ['bwin', 'Sportium', 'Codere', 'Mahou', 'Red Bull', 'Naturgy'],
    back: ['Cetelem', 'Sabadell', 'Bankinter', 'Liberbank', 'Allianz'],
    shorts: ['Ibercaja', 'Mahou', 'Tecnocasa', 'Vueling'],
    training: ['Joma', 'Kelme', 'Macron', 'Hummel', 'Monster'],
    court: ['Iberdrola', 'Endesa', 'Telefónica', 'Cruzcampo', 'San Miguel'],
    stadium: ['Fuente San Luis', 'Buesa Arena', 'Palau de la Fonteta'],
    practice: ['Training Complex', 'Performance Center', 'Sports Campus'],
  },
  B: {
    kit: ['Sabadell', 'Damm', 'Citroen', 'Renault'],
    sleeve: ['Sportium', 'Codere', 'Cruzcampo', 'Reale', 'Burn'],
    back: ['Caja Rural', 'Bezoya', 'Solán de Cabras', 'Allianz'],
    shorts: ['Ibercaja', 'AXA', 'Tecnocasa'],
    training: ['Hummel', 'Spalding', 'Joma'],
    court: ['Vodafone', 'San Miguel', 'Amstel', 'Burn'],
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

// Brand metadata with logo.dev domains. resolveSponsorLogoUrl reads `domain`
// to build `https://img.logo.dev/<domain>?...` URLs. Brands not listed here
// fall back to the industry icon.
export const SPAIN_BRAND_META: Record<string, { industry: SponsorIndustry | 'generic'; domain: string | null; logoOverride: string | null }> = {
  // Airline
  'Emirates': { industry: 'airline', domain: 'emirates.com', logoOverride: null },
  'Iberia': { industry: 'airline', domain: 'iberia.com', logoOverride: null },
  'Vueling': { industry: 'airline', domain: 'vueling.com', logoOverride: null },
  'Qatar Airways': { industry: 'airline', domain: 'qatarairways.com', logoOverride: null },
  // Bank / Finance
  'BBVA': { industry: 'bank', domain: 'bbva.com', logoOverride: null },
  'Santander': { industry: 'bank', domain: 'santander.com', logoOverride: null },
  'Banco Santander': { industry: 'bank', domain: 'santander.com', logoOverride: null },
  'CaixaBank': { industry: 'bank', domain: 'caixabank.com', logoOverride: null },
  'Caixa': { industry: 'bank', domain: 'caixabank.com', logoOverride: null },
  'Sabadell': { industry: 'bank', domain: 'bancsabadell.com', logoOverride: null },
  'Bankinter': { industry: 'bank', domain: 'bankinter.com', logoOverride: null },
  'Bankia': { industry: 'bank', domain: 'bankia.es', logoOverride: null },
  'ING': { industry: 'bank', domain: 'ing.es', logoOverride: null },
  'Cetelem': { industry: 'bank', domain: 'cetelem.es', logoOverride: null },
  'Ibercaja': { industry: 'bank', domain: 'ibercaja.es', logoOverride: null },
  'Liberbank': { industry: 'bank', domain: 'liberbank.es', logoOverride: null },
  'Caja Rural': { industry: 'bank', domain: 'cajarural.com', logoOverride: null },
  'Mapfre': { industry: 'bank', domain: 'mapfre.es', logoOverride: null },
  'Allianz': { industry: 'bank', domain: 'allianz.es', logoOverride: null },
  'AXA': { industry: 'bank', domain: 'axa.es', logoOverride: null },
  'Reale': { industry: 'bank', domain: 'reale.es', logoOverride: null },
  // Beer
  'Mahou': { industry: 'beer', domain: 'mahou.es', logoOverride: null },
  'Estrella Damm': { industry: 'beer', domain: 'estrelladamm.com', logoOverride: null },
  'Damm': { industry: 'beer', domain: 'damm.com', logoOverride: null },
  'Cruzcampo': { industry: 'beer', domain: 'cruzcampo.es', logoOverride: null },
  'San Miguel': { industry: 'beer', domain: 'sanmiguel.es', logoOverride: null },
  'Heineken': { industry: 'beer', domain: 'heineken.com', logoOverride: null },
  'Amstel': { industry: 'beer', domain: 'amstel.es', logoOverride: null },
  // Gambling
  'bwin': { industry: 'gambling', domain: 'bwin.es', logoOverride: null },
  'bet365': { industry: 'gambling', domain: 'bet365.es', logoOverride: null },
  'Betway': { industry: 'gambling', domain: 'betway.es', logoOverride: null },
  'Sportium': { industry: 'gambling', domain: 'sportium.es', logoOverride: null },
  'Codere': { industry: 'gambling', domain: 'codere.es', logoOverride: null },
  // Energy Drink
  'Red Bull': { industry: 'energy_drink', domain: 'redbull.com', logoOverride: null },
  'Monster': { industry: 'energy_drink', domain: 'monsterenergy.com', logoOverride: null },
  'Burn': { industry: 'energy_drink', domain: 'burn.com', logoOverride: null },
  // Water
  'Solán de Cabras': { industry: 'water', domain: 'solandecabras.es', logoOverride: null },
  'Bezoya': { industry: 'water', domain: 'bezoya.es', logoOverride: null },
  // Tech / Telecom
  'Movistar': { industry: 'telecom', domain: 'movistar.es', logoOverride: null },
  'Vodafone': { industry: 'telecom', domain: 'vodafone.es', logoOverride: null },
  'Orange': { industry: 'telecom', domain: 'orange.es', logoOverride: null },
  'Telefónica': { industry: 'telecom', domain: 'telefonica.com', logoOverride: null },
  'Plus500': { industry: 'tech', domain: 'plus500.com', logoOverride: null },
  'Spotify': { industry: 'tech', domain: 'spotify.com', logoOverride: null },
  // Fashion / Apparel
  'Nike': { industry: 'fashion', domain: 'nike.com', logoOverride: null },
  'Adidas': { industry: 'fashion', domain: 'adidas.com', logoOverride: null },
  'Adidas Training': { industry: 'fashion', domain: 'adidas.com', logoOverride: null },
  'Adidas Center': { industry: 'fashion', domain: 'adidas.com', logoOverride: null },
  'Under Armour': { industry: 'fashion', domain: 'underarmour.com', logoOverride: null },
  'Puma': { industry: 'fashion', domain: 'puma.com', logoOverride: null },
  'Joma': { industry: 'fashion', domain: 'joma-sport.com', logoOverride: null },
  'Kelme': { industry: 'fashion', domain: 'kelme.com', logoOverride: null },
  'Macron': { industry: 'fashion', domain: 'macron.com', logoOverride: null },
  'Hummel': { industry: 'fashion', domain: 'hummel.net', logoOverride: null },
  'Spalding': { industry: 'fashion', domain: 'spalding.com', logoOverride: null },
  'Herbalife': { industry: 'fashion', domain: 'herbalife.com', logoOverride: null },
  // Auto
  'SEAT': { industry: 'auto', domain: 'seat.com', logoOverride: null },
  'Cupra': { industry: 'auto', domain: 'cupraofficial.es', logoOverride: null },
  'Toyota': { industry: 'auto', domain: 'toyota.es', logoOverride: null },
  'Hyundai': { industry: 'auto', domain: 'hyundai.es', logoOverride: null },
  'Renault': { industry: 'auto', domain: 'renault.es', logoOverride: null },
  'Citroen': { industry: 'auto', domain: 'citroen.es', logoOverride: null },
  'Audi': { industry: 'auto', domain: 'audi.es', logoOverride: null },
  'Tesla': { industry: 'auto', domain: 'tesla.com', logoOverride: null },
  // Energy / Utility (no native industry — classify as generic)
  'Iberdrola': { industry: 'generic', domain: 'iberdrola.com', logoOverride: null },
  'Endesa': { industry: 'generic', domain: 'endesa.com', logoOverride: null },
  'Naturgy': { industry: 'generic', domain: 'naturgy.es', logoOverride: null },
  'Repsol': { industry: 'generic', domain: 'repsol.com', logoOverride: null },
  'Acciona': { industry: 'generic', domain: 'acciona.com', logoOverride: null },
  // Beverage / Other
  'Coca-Cola': { industry: 'generic', domain: 'coca-cola.com', logoOverride: null },
  'Tecnocasa': { industry: 'generic', domain: 'tecnocasa.es', logoOverride: null },
  // Endorsement-pool brands (not in the regular kit/stadium catalogue)
  'Turkish Airlines': { industry: 'airline', domain: 'turkishairlines.com', logoOverride: null },
  'Gatorade': { industry: 'energy_drink', domain: 'gatorade.com', logoOverride: null },
  'Beko': { industry: 'tech', domain: 'beko.com', logoOverride: null },
  'Local City Bank': { industry: 'bank', domain: null, logoOverride: null },
  'Downtown Dental': { industry: 'generic', domain: null, logoOverride: null },
  'La Tasca Local': { industry: 'generic', domain: null, logoOverride: null },
  'Panadería del Barrio': { industry: 'generic', domain: null, logoOverride: null },
  'Radio Local FM': { industry: 'generic', domain: null, logoOverride: null },
  'Supermercado del Centro': { industry: 'generic', domain: null, logoOverride: null },
};

// Strip diacritics + lowercase + collapse non-alphanumeric. Same shape as
// the populations helper so a key written either way ("Río Breogán" vs
// "Rio Breogan") resolves to the same tier.
function normalizeClubKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TIER_KEY_INDEX: Map<string, TycoonTier> = (() => {
  const m = new Map<string, TycoonTier>();
  for (const [key, tier] of Object.entries(SPAIN_CLUB_TIERS)) m.set(normalizeClubKey(key), tier);
  return m;
})();

const PRESTIGE_KEY_INDEX: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (const [key, p] of Object.entries(SPAIN_CITY_PRESTIGE)) m.set(normalizeClubKey(key), p);
  return m;
})();

export function getTierForClub(clubName: string): TycoonTier {
  if (!clubName) return 'D';
  const norm = normalizeClubKey(clubName);
  // 1) full normalized key
  const direct = TIER_KEY_INDEX.get(norm);
  if (direct) return direct;
  // 2) walk word-prefix slices: longest first so "real madrid" beats "real"
  const parts = norm.split(' ').filter(Boolean);
  for (let len = parts.length; len >= 1; len--) {
    const slice = parts.slice(0, len).join(' ');
    const hit = TIER_KEY_INDEX.get(slice);
    if (hit) return hit;
  }
  // 3) single-word substring scan — handles "BAXI Manresa", "Surne Bilbao"
  //    where the meaningful tier word is the suffix, not the prefix.
  for (const word of parts) {
    const hit = TIER_KEY_INDEX.get(word);
    if (hit) return hit;
  }
  return 'D';
}

export function getCityPrestige(clubName: string, tier: TycoonTier): number {
  if (clubName) {
    const norm = normalizeClubKey(clubName);
    const direct = PRESTIGE_KEY_INDEX.get(norm);
    if (direct !== undefined) return direct;
    const parts = norm.split(' ').filter(Boolean);
    for (let len = parts.length; len >= 1; len--) {
      const slice = parts.slice(0, len).join(' ');
      const hit = PRESTIGE_KEY_INDEX.get(slice);
      if (hit !== undefined) return hit;
    }
    for (const word of parts) {
      const hit = PRESTIGE_KEY_INDEX.get(word);
      if (hit !== undefined) return hit;
    }
  }
  return TIER_PRESTIGE_DEFAULT[tier];
}
