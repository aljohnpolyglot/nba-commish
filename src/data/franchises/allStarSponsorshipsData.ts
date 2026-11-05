export interface AllStarAsset {
  id: string;
  name: string;
  assetType: 'main_event' | 'award' | 'umbrella_package' | 'competition' | 'showcase_game' | 'entertainment_game' | 'college_showcase' | 'developmental_showcase' | 'creator_event' | 'supporting_event' | 'digital_campaign' | 'selection_show' | 'fan_festival' | 'hospitality' | 'entertainment' | 'heritage_event' | 'community' | 'developmental_competition' | 'historical_game' | 'shooting_competition' | 'custom_rotating';
  firstYear: number;
  lastYear?: number | null;
  inactiveYears: number[];
  day: 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | 'Multi-Day' | 'Season-Long' | 'Postseason' | 'Mid-Season' | 'Offseason';
  durationDays: string;
  metricType: string;
  base2020sExposure: string;
  prestige: number;
  required: boolean;
  parentPackage?: string | null;
  strictNbaTitleNamingAllowed: boolean;
  customLeagueTitleNamingAllowed: boolean;
  defaultSponsorSlots: number;
  restrictedCategories?: string[];
  bestIndustries?: string[];
  baseAnnualValue: number; // in USD
  categoryGroup: 'All-Star Weekend Events' | 'Major Tournaments & Finals' | 'Historical / Rotating Events';
  namingTemplate: string; // e.g. "{brand} Slam Dunk" or "NBA HBCU Classic presented by {brand}"
}

export interface SponsorBrand {
  id: string;
  name: string;
  domain: string;
  industry: string;
  tier: 1 | 2 | 3 | 4;
  startYear: number;
  endYear?: number | null;
  isHighRisk?: boolean;
  isRestricted?: boolean;
  isFictional?: boolean;
  parentGroup?: string;
  preferredAssets: string[];
  budgetPerYear: number;
  reputationRisk: number; // 0 to 100
  exclusivityRequirement: string;
}

export interface AssignedDeal {
  dealId: string;
  assetId: string;
  assetName: string;
  sponsorId: string;
  sponsorName: string;
  sponsorDomain: string;
  industry: string;
  startYear: number;
  endYear: number;
  annualPayout: number;
  totalRemainingValue: number;
  isExclusive: boolean;
  renewalInterest: number; // 0 to 100
  status: 'active' | 'expiring' | 'unbranded';
}

export interface SponsorOfferCard {
  offerId: string;
  brand: SponsorBrand;
  preferredAssetId: string;
  eligibleAssetIds: string[];
  proposedLengthYears: number;
  proposedAnnualPayout: number;
  proposedTotalValue: number;
  activationBudget: number;
  brandFitScore: number;
  reputationRiskScore: number;
  exclusivityReq: string;
  badge: 'HISTORICAL PARTNER' | 'CURRENT PARTNER' | 'RETURNING BIDDER' | 'NEW BIDDER' | 'LOCAL HOST BRAND' | 'HIGH RISK' | 'CATEGORY CONFLICT' | 'FICTIONAL FUTURE BRAND' | 'PARENT-COMPANY PACKAGE';
  interestLevel: 'no bid' | 'low offer' | 'competitive offer' | 'strong offer' | 'aggressive premium offer';
}

export const CONFLICT_GROUPS: Record<string, string[]> = {
  'Beverage - Cola': ['Coca-Cola', 'Pepsi', '7UP', 'Dr Pepper', 'Sprite', 'Mountain Dew', 'Starry'],
  'Telecommunications': ['AT&T', 'Verizon', 'T-Mobile', 'Sprint', 'MCI', '1-800-CALL-ATT', 'Solstice Wireless'],
  'Apparel & Footwear': ['Nike', 'Jordan Brand', 'Adidas', 'Puma', 'Under Armour', 'New Balance', 'Reebok', 'Converse', 'NovaWear'],
  'Payments & Credit Cards': ['Visa', 'Mastercard', 'American Express', 'PayPal', 'Venmo', 'Cash App', 'OrbitPay'],
  'Insurance': ['State Farm', 'Allstate', 'GEICO', 'Progressive'],
  'Automotive': ['Kia', 'Hyundai', 'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Chrysler', 'Dodge', 'Tesla', 'Rivian', 'AstraDrive', 'Titan Mobility'],
  'Gaming Consoles': ['PlayStation', 'Xbox', 'Nintendo', 'Sega', 'Atari', 'HoloCourt Labs'],
  'Sportsbook & Fantasy': ['DraftKings', 'FanDuel'],
  'Crypto': ['Coinbase', 'Crypto.com'],
  'Artificial Intelligence': ['OpenAI', 'Anthropic', 'Perplexity', 'xAI', 'Figure AI', 'NVIDIA', 'Synapse Sports']
};

export const ALL_STAR_ASSETS_CATALOG: AllStarAsset[] = [
  // MAJOR LEAGUE TOURNAMENTS & FINALS
  {
    id: 'nba_finals',
    name: 'The NBA Finals',
    assetType: 'main_event',
    firstYear: 1947,
    inactiveYears: [],
    day: 'Postseason',
    durationDays: '7-Game Series',
    metricType: 'global broadcast viewers',
    base2020sExposure: '12.0M avg / game',
    prestige: 100,
    required: true,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 35000000,
    categoryGroup: 'Major Tournaments & Finals',
    namingTemplate: 'The NBA Finals presented by {brand}'
  },
  {
    id: 'nba_cup',
    name: 'NBA Cup (In-Season Tournament)',
    assetType: 'main_event',
    firstYear: 2023,
    inactiveYears: [],
    day: 'Mid-Season',
    durationDays: 'Multi-Week Tournament',
    metricType: 'global broadcast & streaming',
    base2020sExposure: '4.5M avg',
    prestige: 88,
    required: false,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 18000000,
    categoryGroup: 'Major Tournaments & Finals',
    namingTemplate: '{brand} NBA Cup'
  },
  {
    id: 'nba_play_in',
    name: 'NBA Play-In Tournament',
    assetType: 'main_event',
    firstYear: 2020,
    inactiveYears: [],
    day: 'Postseason',
    durationDays: '4 days',
    metricType: 'broadcast viewers',
    base2020sExposure: '3.2M avg',
    prestige: 82,
    required: false,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 12000000,
    categoryGroup: 'Major Tournaments & Finals',
    namingTemplate: '{brand} NBA Play-In Tournament'
  },
  {
    id: 'nba_draft',
    name: 'NBA Draft',
    assetType: 'selection_show',
    firstYear: 1947,
    inactiveYears: [],
    day: 'Offseason',
    durationDays: '2 days',
    metricType: 'broadcast viewers',
    base2020sExposure: '3.7M avg',
    prestige: 85,
    required: true,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 14000000,
    categoryGroup: 'Major Tournaments & Finals',
    namingTemplate: 'NBA Draft presented by {brand}'
  },

  // ALL-STAR WEEKEND EVENTS
  {
    id: 'all_star_game',
    name: 'NBA All-Star Game',
    assetType: 'main_event',
    firstYear: 1951,
    lastYear: null,
    inactiveYears: [1999],
    day: 'Sunday',
    durationDays: '1 day',
    metricType: 'est. viewers',
    base2020sExposure: '5.5M',
    prestige: 100,
    required: true,
    strictNbaTitleNamingAllowed: false,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 25000000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: '{brand} All-Star Game'
  },
  {
    id: 'all_star_game_mvp',
    name: 'NBA All-Star Game MVP Award',
    assetType: 'award',
    firstYear: 1951,
    inactiveYears: [1999],
    day: 'Sunday',
    durationDays: 'final presentation',
    metricType: 'inherited viewers',
    base2020sExposure: '5.5M',
    prestige: 86,
    required: false,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 6500000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: '{brand} NBA All-Star Game MVP'
  },
  {
    id: 'all_star_saturday',
    name: 'NBA All-Star Saturday Night',
    assetType: 'umbrella_package',
    firstYear: 1984,
    inactiveYears: [1999],
    day: 'Saturday',
    durationDays: '1 day',
    metricType: 'est. avg broadcast viewers',
    base2020sExposure: '4.0M',
    prestige: 90,
    required: false,
    parentPackage: null,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 12000000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: '{brand} All-Star Saturday Night'
  },
  {
    id: 'slam_dunk',
    name: 'Slam Dunk Contest',
    assetType: 'competition',
    firstYear: 1984,
    lastYear: null,
    inactiveYears: [1998, 1999],
    day: 'Saturday',
    durationDays: '1 event',
    metricType: 'est. segment viewers',
    base2020sExposure: '4.3M',
    prestige: 94,
    required: true,
    parentPackage: 'all_star_saturday',
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 7500000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: '{brand} Slam Dunk'
  },
  {
    id: 'three_point',
    name: '3-Point Contest',
    assetType: 'competition',
    firstYear: 1986,
    inactiveYears: [1999],
    day: 'Saturday',
    durationDays: '1 event',
    metricType: 'est. segment viewers',
    base2020sExposure: '4.1M',
    prestige: 91,
    required: true,
    parentPackage: 'all_star_saturday',
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 6000000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: '{brand} 3-Point Contest'
  },
  {
    id: 'skills_challenge',
    name: 'Skills Challenge',
    assetType: 'competition',
    firstYear: 2003,
    lastYear: null,
    inactiveYears: [2026],
    day: 'Saturday',
    durationDays: '1 event',
    metricType: 'est. segment viewers',
    base2020sExposure: '3.6M',
    prestige: 76,
    required: false,
    parentPackage: 'all_star_saturday',
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 3800000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: '{brand} Skills Challenge'
  },
  {
    id: 'shooting_stars',
    name: 'Shooting Stars',
    assetType: 'competition',
    firstYear: 2004,
    inactiveYears: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
    day: 'Saturday',
    durationDays: '1 event',
    metricType: 'est. segment viewers',
    base2020sExposure: '3.8M',
    prestige: 73,
    required: false,
    parentPackage: 'all_star_saturday',
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 3200000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: '{brand} Shooting Stars'
  },
  {
    id: 'rising_stars',
    name: 'Rising Stars',
    assetType: 'showcase_game',
    firstYear: 1994,
    inactiveYears: [1999, 2021],
    day: 'Friday',
    durationDays: '1 day',
    metricType: 'est. viewers',
    base2020sExposure: '1.5M',
    prestige: 72,
    required: true,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 4500000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: '{brand} Rising Stars'
  },
  {
    id: 'celebrity_game',
    name: 'NBA All-Star Celebrity Game',
    assetType: 'entertainment_game',
    firstYear: 2003,
    inactiveYears: [],
    day: 'Friday',
    durationDays: '1 day',
    metricType: 'est. viewers',
    base2020sExposure: '1.4M',
    prestige: 64,
    required: false,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 3000000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: '{brand} NBA All-Star Celebrity Game'
  },
  {
    id: 'all_star_media_day',
    name: 'NBA All-Star Media Day',
    assetType: 'supporting_event',
    firstYear: 2000,
    inactiveYears: [],
    day: 'Saturday',
    durationDays: '1 day',
    metricType: 'digital reach',
    base2020sExposure: '3.0M',
    prestige: 60,
    required: false,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 1500000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: 'NBA All-Star Media Day presented by {brand}'
  },
  // Only triggered on invite performance tasks (when commissioner invites an artist/performer here)
  {
    id: 'pregame_concert',
    name: 'NBA All-Star Pregame Concert',
    assetType: 'entertainment',
    firstYear: 2000,
    inactiveYears: [],
    day: 'Sunday',
    durationDays: '1 event',
    metricType: 'inherited game viewers',
    base2020sExposure: '5.0M',
    prestige: 69,
    required: false,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 2800000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: 'NBA All-Star Pregame Concert presented by {brand}'
  },
  {
    id: 'halftime_show',
    name: 'NBA All-Star Halftime Show',
    assetType: 'entertainment',
    firstYear: 1980,
    inactiveYears: [],
    day: 'Sunday',
    durationDays: '1 event',
    metricType: 'inherited game viewers',
    base2020sExposure: '5.2M',
    prestige: 74,
    required: false,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 3500000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: 'NBA All-Star Halftime Show presented by {brand}'
  }
];

export const MASTER_BRANDS_CATALOG: SponsorBrand[] = [
  // HISTORICAL & CURRENT
  { id: 'coca_cola', name: 'Coca-Cola', domain: 'coca-colacompany.com', industry: 'Beverage - Cola', tier: 1, startYear: 1946, parentGroup: 'PepsiCo / Coke', preferredAssets: ['slam_dunk', 'three_point', 'all_star_saturday'], budgetPerYear: 20000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Beverage Partner' },
  { id: 'pepsi', name: 'Pepsi', domain: 'pepsico.com', industry: 'Beverage - Cola', tier: 1, startYear: 1946, parentGroup: 'PepsiCo', preferredAssets: ['slam_dunk', 'three_point', 'all_star_saturday'], budgetPerYear: 22000000, reputationRisk: 12, exclusivityRequirement: 'Exclusive Beverage Partner' },
  { id: '7up', name: '7UP', domain: '7up.com', industry: 'Beverage - Cola', tier: 2, startYear: 1946, preferredAssets: ['three_point', 'celebrity_game'], budgetPerYear: 8000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Beverage Partner' },
  { id: 'sprite', name: 'Sprite', domain: 'sprite.com', industry: 'Beverage - Cola', tier: 1, startYear: 1961, parentGroup: 'PepsiCo / Coke', preferredAssets: ['slam_dunk', 'all_star_fan_festival'], budgetPerYear: 18000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Beverage Partner' },
  { id: 'mountain_dew', name: 'Mountain Dew', domain: 'mountaindew.com', industry: 'Beverage - Cola', tier: 1, startYear: 1964, parentGroup: 'PepsiCo', preferredAssets: ['three_point', 'rising_stars'], budgetPerYear: 16000000, reputationRisk: 15, exclusivityRequirement: 'Exclusive Beverage Partner' },
  { id: 'gatorade', name: 'Gatorade', domain: 'gatorade.com', industry: 'Beverage - Cola', tier: 1, startYear: 1966, parentGroup: 'PepsiCo', preferredAssets: ['slam_dunk', 'all_star_game_mvp', 'all_star_practice'], budgetPerYear: 25000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Sports Beverage Partner' },
  { id: 'dr_pepper', name: 'Dr Pepper', domain: 'drpepper.com', industry: 'Beverage - Cola', tier: 2, startYear: 1946, preferredAssets: ['three_point', 'celebrity_game'], budgetPerYear: 10000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Beverage Partner' },
  { id: 'starry', name: 'Starry', domain: 'starrylemonlime.com', industry: 'Beverage - Cola', tier: 1, startYear: 2023, parentGroup: 'PepsiCo', preferredAssets: ['three_point', 'rising_stars'], budgetPerYear: 14000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Beverage Partner' },
  { id: 'ruffles', name: 'Ruffles', domain: 'ruffles.com', industry: 'Dining / QSR', tier: 2, startYear: 1986, parentGroup: 'PepsiCo', preferredAssets: ['celebrity_game', 'all_star_fan_festival'], budgetPerYear: 8000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Snack Partner' },
  { id: 'nestle_crunch', name: 'Nestle Crunch', domain: 'nestle.com', industry: 'Dining / QSR', tier: 2, startYear: 1946, endYear: 2010, preferredAssets: ['slam_dunk'], budgetPerYear: 6000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Confectionery Partner' },
  { id: 'mcdonalds', name: "McDonald's", domain: 'mcdonalds.com', industry: 'Dining / QSR', tier: 1, startYear: 1955, preferredAssets: ['celebrity_game', 'all_star_saturday'], budgetPerYear: 20000000, reputationRisk: 12, exclusivityRequirement: 'Exclusive QSR Partner' },
  { id: 'burger_king', name: 'Burger King', domain: 'bk.com', industry: 'Dining / QSR', tier: 1, startYear: 1954, preferredAssets: ['celebrity_game', 'rising_stars'], budgetPerYear: 12000000, reputationRisk: 14, exclusivityRequirement: 'Exclusive QSR Partner' },
  { id: 'taco_bell', name: 'Taco Bell', domain: 'tacobell.com', industry: 'Dining / QSR', tier: 1, startYear: 1962, preferredAssets: ['skills_challenge', 'rising_stars'], budgetPerYear: 15000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive QSR Partner' },
  { id: 'door_dash', name: 'DoorDash / DashPass', domain: 'doordash.com', industry: 'Delivery', tier: 1, startYear: 2013, preferredAssets: ['all_star_experiences', 'all_star_fan_festival'], budgetPerYear: 16000000, reputationRisk: 12, exclusivityRequirement: 'Exclusive Delivery & Hospitality Partner' },
  
  // AUTOMOTIVE
  { id: 'ford', name: 'Ford', domain: 'ford.com', industry: 'Automotive', tier: 1, startYear: 1946, preferredAssets: ['all_star_game_mvp', 'all_star_saturday'], budgetPerYear: 18000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Automotive Partner' },
  { id: 'chevrolet', name: 'Chevrolet', domain: 'chevrolet.com', industry: 'Automotive', tier: 1, startYear: 1946, preferredAssets: ['all_star_game_mvp', 'shooting_stars'], budgetPerYear: 16000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Automotive Partner' },
  { id: 'toyota', name: 'Toyota', domain: 'toyota.com', industry: 'Automotive', tier: 1, startYear: 1958, preferredAssets: ['all_star_game_mvp', 'skills_challenge', 'all_star_saturday'], budgetPerYear: 22000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Automotive Partner' },
  { id: 'honda', name: 'Honda', domain: 'honda.com', industry: 'Automotive', tier: 1, startYear: 1969, preferredAssets: ['skills_challenge', 'shooting_stars'], budgetPerYear: 15000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Automotive Partner' },
  { id: 'kia', name: 'Kia', domain: 'kia.com', industry: 'Automotive', tier: 1, startYear: 1994, preferredAssets: ['all_star_game_mvp', 'skills_challenge', 'shooting_stars'], budgetPerYear: 24000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Automotive Partner' },
  { id: 'hyundai', name: 'Hyundai', domain: 'hyundai.com', industry: 'Automotive', tier: 1, startYear: 1986, preferredAssets: ['all_star_game_mvp', 'rising_stars'], budgetPerYear: 18000000, reputationRisk: 7, exclusivityRequirement: 'Exclusive Automotive Partner' },
  { id: 'tesla', name: 'Tesla', domain: 'tesla.com', industry: 'Automotive', tier: 1, startYear: 2008, preferredAssets: ['creator_cup', 'all_star_game_mvp', 'shooting_stars'], budgetPerYear: 20000000, reputationRisk: 25, exclusivityRequirement: 'Exclusive Automotive & Mobility Partner' },
  { id: 'rivian', name: 'Rivian', domain: 'rivian.com', industry: 'Automotive', tier: 2, startYear: 2021, preferredAssets: ['shooting_stars', 'all_star_experiences'], budgetPerYear: 10000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Automotive Partner' },

  // AVIATION & LOGISTICS
  { id: 'american_airlines', name: 'American Airlines', domain: 'aa.com', industry: 'Travel / Hospitality', tier: 1, startYear: 1946, preferredAssets: ['three_point', 'all_star_experiences'], budgetPerYear: 15000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Aviation & Travel Partner' },
  { id: 'delta', name: 'Delta Air Lines', domain: 'delta.com', industry: 'Travel / Hospitality', tier: 1, startYear: 1946, preferredAssets: ['all_star_experiences', 'all_star_saturday'], budgetPerYear: 16000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Aviation Partner' },
  { id: 'southwest', name: 'Southwest Airlines', domain: 'southwest.com', industry: 'Travel / Hospitality', tier: 1, startYear: 1971, preferredAssets: ['celebrity_game', 'all_star_fan_festival'], budgetPerYear: 12000000, reputationRisk: 12, exclusivityRequirement: 'Exclusive Aviation Partner' },
  { id: 'fedex', name: 'FedEx', domain: 'fedex.com', industry: 'Delivery', tier: 1, startYear: 1973, preferredAssets: ['shooting_stars', 'all_star_saturday'], budgetPerYear: 18000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Logistics Partner' },
  
  // ELECTRONICS & MEDIA
  { id: 'sony', name: 'Sony', domain: 'sony.com', industry: 'Media / Streaming', tier: 1, startYear: 1960, preferredAssets: ['creator_cup', 'all_star_fan_festival'], budgetPerYear: 20000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Electronics & Entertainment Partner' },
  { id: 'radioshack', name: 'RadioShack', domain: 'radioshack.com', industry: 'Technology', tier: 2, startYear: 1946, endYear: 2015, preferredAssets: ['shooting_stars', 'skills_challenge'], budgetPerYear: 5000000, reputationRisk: 15, exclusivityRequirement: 'Exclusive Electronics Retail Partner' },
  { id: 'haier', name: 'Haier', domain: 'haier.com', industry: 'Technology', tier: 1, startYear: 1999, preferredAssets: ['shooting_stars'], budgetPerYear: 8000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Appliances Partner' },
  { id: 'jbl', name: 'JBL', domain: 'jbl.com', industry: 'Media / Streaming', tier: 2, startYear: 1946, preferredAssets: ['three_point', 'pregame_concert', 'halftime_show'], budgetPerYear: 9000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Audio Partner' },
  { id: 'beats', name: 'Beats by Dre', domain: 'beatsbydre.com', industry: 'Media / Streaming', tier: 1, startYear: 2008, preferredAssets: ['pregame_concert', 'halftime_show', 'slam_dunk'], budgetPerYear: 15000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Audio Partner' },
  { id: 'samsung', name: 'Samsung', domain: 'samsung.com', industry: 'Technology', tier: 1, startYear: 1970, preferredAssets: ['all_star_saturday', 'creator_cup'], budgetPerYear: 25000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Mobile & Display Partner' },

  // TELECOMMUNICATIONS
  { id: 'att', name: 'AT&T', domain: 'att.com', industry: 'Telecommunications', tier: 1, startYear: 1984, preferredAssets: ['slam_dunk', 'all_star_practice', 'all_star_media_day', 'hbcu_classic', 'g_league_next_up'], budgetPerYear: 30000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Telecommunications Partner' },
  { id: 'verizon', name: 'Verizon', domain: 'verizon.com', industry: 'Telecommunications', tier: 1, startYear: 2000, preferredAssets: ['slam_dunk', 'all_star_practice', 'all_star_media_day'], budgetPerYear: 28000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Telecommunications Partner' },
  { id: 'tmobile', name: 'T-Mobile', domain: 't-mobile.com', industry: 'Telecommunications', tier: 1, startYear: 2001, preferredAssets: ['rising_stars', 'all_star_fan_festival'], budgetPerYear: 24000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Telecommunications Partner' },
  { id: 'sprint', name: 'Sprint', domain: 'sprint.com', industry: 'Telecommunications', tier: 1, startYear: 1987, endYear: 2020, preferredAssets: ['celebrity_game', 'all_star_saturday'], budgetPerYear: 15000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Telecommunications Partner' },
  { id: 'call_att', name: '1-800-CALL-ATT', domain: 'att.com', industry: 'Telecommunications', tier: 3, startYear: 1990, endYear: 2002, preferredAssets: ['slam_dunk'], budgetPerYear: 6000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Long Distance Partner' },

  // INSURANCE & FINANCE
  { id: 'state_farm', name: 'State Farm', domain: 'statefarm.com', industry: 'Insurance', tier: 1, startYear: 1946, preferredAssets: ['three_point', 'all_star_saturday'], budgetPerYear: 26000000, reputationRisk: 4, exclusivityRequirement: 'Exclusive Insurance Partner' },
  { id: 'allstate', name: 'Allstate', domain: 'allstate.com', industry: 'Insurance', tier: 1, startYear: 1950, preferredAssets: ['three_point', 'all_star_saturday'], budgetPerYear: 20000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Insurance Partner' },
  { id: 'geico', name: 'GEICO', domain: 'geico.com', industry: 'Insurance', tier: 1, startYear: 1946, preferredAssets: ['skills_challenge', 'shooting_stars'], budgetPerYear: 22000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Insurance Partner' },
  { id: 'american_express', name: 'American Express', domain: 'americanexpress.com', industry: 'Payments & Credit Cards', tier: 1, startYear: 1958, preferredAssets: ['all_star_experiences', 'halftime_show'], budgetPerYear: 24000000, reputationRisk: 4, exclusivityRequirement: 'Exclusive Payment & Card Partner' },
  { id: 'visa', name: 'Visa', domain: 'visa.com', industry: 'Payments & Credit Cards', tier: 1, startYear: 1976, preferredAssets: ['all_star_saturday', 'all_star_experiences'], budgetPerYear: 25000000, reputationRisk: 4, exclusivityRequirement: 'Exclusive Payment & Card Partner' },
  { id: 'mastercard', name: 'Mastercard', domain: 'mastercard.us', industry: 'Payments & Credit Cards', tier: 1, startYear: 1969, preferredAssets: ['all_star_saturday', 'rising_stars'], budgetPerYear: 22000000, reputationRisk: 4, exclusivityRequirement: 'Exclusive Payment & Card Partner' },
  { id: 'bbva', name: 'BBVA', domain: 'bbva.com', industry: 'Payments & Credit Cards', tier: 1, startYear: 2007, preferredAssets: ['rising_stars', 'all_star_saturday'], budgetPerYear: 14000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Banking Partner' },
  { id: 'cash_app', name: 'Cash App', domain: 'cash.app', industry: 'Payments & Credit Cards', tier: 1, startYear: 2013, preferredAssets: ['creator_cup', 'celebrity_game', 'slam_dunk'], budgetPerYear: 18000000, reputationRisk: 14, exclusivityRequirement: 'Exclusive Mobile Finance Partner' },
  { id: 'coinbase', name: 'Coinbase', domain: 'coinbase.com', industry: 'Crypto', tier: 1, startYear: 2017, isHighRisk: true, preferredAssets: ['creator_cup', 'rising_stars'], budgetPerYear: 20000000, reputationRisk: 35, exclusivityRequirement: 'Exclusive Crypto Exchange Partner' },

  // RETAIL & GOODS
  { id: 'sears', name: 'Sears', domain: 'sears.com', industry: 'Delivery', tier: 1, startYear: 1946, endYear: 2019, preferredAssets: ['shooting_stars', 'all_star_saturday'], budgetPerYear: 8000000, reputationRisk: 18, exclusivityRequirement: 'Exclusive Department Store Partner' },
  { id: 'foot_locker', name: 'Foot Locker', domain: 'footlocker.com', industry: 'Apparel & Footwear', tier: 1, startYear: 1974, preferredAssets: ['three_point', 'rising_stars', 'slam_dunk'], budgetPerYear: 16000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Footwear Retail Partner' },
  { id: '1800flowers', name: '1-800-FLOWERS', domain: '1800flowers.com', industry: 'Delivery', tier: 3, startYear: 1992, preferredAssets: ['three_point'], budgetPerYear: 5000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Floral & Gift Partner' },
  { id: 'amazon', name: 'Amazon', domain: 'amazon.com', industry: 'Technology', tier: 1, startYear: 1995, preferredAssets: ['all_star_saturday', 'all_star_experiences', 'creator_cup'], budgetPerYear: 35000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive E-Commerce & Cloud Partner' },
  { id: 'schick', name: 'Schick', domain: 'schick.com', industry: 'Delivery', tier: 2, startYear: 1946, preferredAssets: ['rising_stars', 'skills_challenge'], budgetPerYear: 7000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Grooming Partner' },
  { id: 'castrol', name: 'Castrol', domain: 'castrol.com', industry: 'Automotive', tier: 1, startYear: 1946, preferredAssets: ['rising_stars', 'skills_challenge'], budgetPerYear: 14000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Lubricants & Motor Oil Partner' },
  { id: 'got_milk', name: 'Got Milk?', domain: 'gotmilk.com', industry: 'Beverage - Cola', tier: 2, startYear: 1993, endYear: 2014, preferredAssets: ['rising_stars', 'slam_dunk'], budgetPerYear: 6000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Dairy Campaign Partner' },

  // APPAREL & FOOTWEAR
  { id: 'nike', name: 'Nike', domain: 'nike.com', industry: 'Apparel & Footwear', tier: 1, startYear: 1972, preferredAssets: ['rising_stars', 'creator_cup', 'all_star_fan_festival'], budgetPerYear: 35000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Footwear & Apparel Partner' },
  { id: 'jordan_brand', name: 'Jordan Brand', domain: 'nike.com', industry: 'Apparel & Footwear', tier: 1, startYear: 1997, preferredAssets: ['rising_stars', 'slam_dunk', 'all_star_fan_festival'], budgetPerYear: 28000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Footwear & Apparel Partner' },
  { id: 'adidas', name: 'Adidas', domain: 'adidas.com', industry: 'Apparel & Footwear', tier: 1, startYear: 1949, preferredAssets: ['rising_stars', 'skills_challenge', 'all_star_fan_festival'], budgetPerYear: 26000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Footwear & Apparel Partner' },
  { id: 'puma', name: 'Puma', domain: 'puma.com', industry: 'Apparel & Footwear', tier: 1, startYear: 1948, preferredAssets: ['rising_stars', 'slam_dunk', 'celebrity_game'], budgetPerYear: 18000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Footwear & Apparel Partner' },
  { id: 'panini', name: 'Panini', domain: 'paniniamerica.net', industry: 'Delivery', tier: 2, startYear: 1961, preferredAssets: ['rising_stars', 'all_star_fan_festival', 'legends_brunch'], budgetPerYear: 9000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Collectibles Partner' },

  // VIDEO GAMES & TECH
  { id: 'playstation', name: 'PlayStation', domain: 'playstation.com', industry: 'Gaming Consoles', tier: 1, startYear: 1995, preferredAssets: ['creator_cup', 'all_star_fan_festival', 'skills_challenge'], budgetPerYear: 25000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Gaming Console Partner' },
  { id: 'xbox', name: 'Xbox', domain: 'xbox.com', industry: 'Gaming Consoles', tier: 1, startYear: 2001, preferredAssets: ['creator_cup', 'all_star_fan_festival', 'celebrity_game'], budgetPerYear: 24000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Gaming Console Partner' },
  { id: 'nintendo', name: 'Nintendo', domain: 'nintendo.com', industry: 'Gaming Consoles', tier: 1, startYear: 1980, preferredAssets: ['skills_challenge', 'all_star_fan_festival'], budgetPerYear: 20000000, reputationRisk: 4, exclusivityRequirement: 'Exclusive Gaming Console Partner' },
  { id: 'ea_sports', name: 'EA Sports', domain: 'ea.com', industry: 'Gaming Consoles', tier: 1, startYear: 1988, preferredAssets: ['all_star_saturday', 'creator_cup'], budgetPerYear: 22000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Sports Gaming Partner' },
  { id: '2k_sports', name: '2K Sports', domain: '2k.com', industry: 'Gaming Consoles', tier: 1, startYear: 2005, preferredAssets: ['all_star_saturday', 'creator_cup', 'all_star_fan_festival'], budgetPerYear: 24000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Basketball Gaming Partner' },
  { id: '989_sports', name: '989 Sports', domain: 'playstation.com', industry: 'Gaming Consoles', tier: 3, startYear: 1995, endYear: 2005, preferredAssets: ['skills_challenge'], budgetPerYear: 5000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Sports Video Game Partner' },

  // INTERNET & AI
  { id: 'aol', name: 'AOL', domain: 'aol.com', industry: 'Technology', tier: 1, startYear: 1989, endYear: 2017, preferredAssets: ['all_star_saturday'], budgetPerYear: 15000000, reputationRisk: 12, exclusivityRequirement: 'Exclusive Internet Service Partner' },
  { id: 'google', name: 'Google', domain: 'google.com', industry: 'Technology', tier: 1, startYear: 1998, preferredAssets: ['all_star_voting', 'creator_cup', 'all_star_saturday'], budgetPerYear: 32000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Search & Technology Partner' },
  { id: 'apple', name: 'Apple', domain: 'apple.com', industry: 'Technology', tier: 1, startYear: 1977, preferredAssets: ['halftime_show', 'pregame_concert', 'creator_cup'], budgetPerYear: 35000000, reputationRisk: 4, exclusivityRequirement: 'Exclusive Technology & Music Partner' },
  { id: 'microsoft', name: 'Microsoft', domain: 'microsoft.com', industry: 'Technology', tier: 1, startYear: 1980, preferredAssets: ['all_star_saturday', 'all_star_voting', 'creator_cup'], budgetPerYear: 30000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Technology & Cloud Partner' },
  { id: 'youtube', name: 'YouTube', domain: 'youtube.com', industry: 'Media / Streaming', tier: 1, startYear: 2006, preferredAssets: ['creator_cup', 'all_star_media_day', 'all_star_voting'], budgetPerYear: 26000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Video Creator Platform' },
  { id: 'tiktok', name: 'TikTok', domain: 'tiktok.com', industry: 'Media / Streaming', tier: 1, startYear: 2018, preferredAssets: ['creator_cup', 'all_star_voting', 'slam_dunk'], budgetPerYear: 24000000, reputationRisk: 28, exclusivityRequirement: 'Exclusive Short-Form Video Partner' },
  { id: 'spotify', name: 'Spotify', domain: 'spotify.com', industry: 'Media / Streaming', tier: 1, startYear: 2008, preferredAssets: ['pregame_concert', 'halftime_show', 'all_star_fan_festival'], budgetPerYear: 18000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Audio Streaming Partner' },
  { id: 'discord', name: 'Discord', domain: 'discord.com', industry: 'Technology', tier: 1, startYear: 2016, preferredAssets: ['creator_cup', 'all_star_fan_festival'], budgetPerYear: 15000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Community Voice Partner' },
  { id: 'nvidia', name: 'NVIDIA', domain: 'nvidia.com', industry: 'Artificial Intelligence', tier: 1, startYear: 1993, preferredAssets: ['creator_cup', 'all_star_game_mvp', 'all_star_saturday'], budgetPerYear: 35000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive AI & Compute Partner' },
  { id: 'openai', name: 'OpenAI', domain: 'openai.com', industry: 'Artificial Intelligence', tier: 1, startYear: 2022, preferredAssets: ['creator_cup', 'all_star_voting', 'all_star_draft', 'all_star_media_day'], budgetPerYear: 30000000, reputationRisk: 12, exclusivityRequirement: 'Exclusive Artificial Intelligence Partner' },
  { id: 'anthropic', name: 'Anthropic', domain: 'anthropic.com', industry: 'Artificial Intelligence', tier: 1, startYear: 2023, preferredAssets: ['creator_cup', 'all_star_draft', 'all_star_voting'], budgetPerYear: 24000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Artificial Intelligence Partner' },
  { id: 'perplexity', name: 'Perplexity AI', domain: 'perplexity.ai', industry: 'Artificial Intelligence', tier: 2, startYear: 2023, preferredAssets: ['skills_challenge', 'all_star_voting', 'all_star_media_day'], budgetPerYear: 14000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive AI Answer Engine' },
  { id: 'xai', name: 'xAI / Grok', domain: 'x.ai', industry: 'Artificial Intelligence', tier: 1, startYear: 2024, preferredAssets: ['creator_cup', 'slam_dunk', 'all_star_voting'], budgetPerYear: 25000000, reputationRisk: 22, exclusivityRequirement: 'Exclusive Artificial Intelligence Partner' },
  { id: 'figure_ai', name: 'Figure AI', domain: 'figure.ai', industry: 'Artificial Intelligence', tier: 2, startYear: 2023, preferredAssets: ['skills_challenge', 'shooting_stars'], budgetPerYear: 12000000, reputationRisk: 15, exclusivityRequirement: 'Exclusive Robotics & AI Partner' },
  { id: 'waymo', name: 'Waymo', domain: 'waymo.com', industry: 'Automotive', tier: 1, startYear: 2018, preferredAssets: ['all_star_experiences', 'skills_challenge'], budgetPerYear: 18000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Autonomous Mobility Partner' },

  // MOBILITY & HOSPITALITY
  { id: 'uber', name: 'Uber', domain: 'uber.com', industry: 'Travel / Hospitality', tier: 1, startYear: 2011, preferredAssets: ['all_star_experiences', 'all_star_fan_festival'], budgetPerYear: 20000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Mobility & Rideshare Partner' },
  { id: 'airbnb', name: 'Airbnb', domain: 'airbnb.com', industry: 'Travel / Hospitality', tier: 1, startYear: 2009, preferredAssets: ['all_star_experiences', 'celebrity_game'], budgetPerYear: 18000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Travel & Stays Partner' },
  { id: 'marriott', name: 'Marriott', domain: 'marriott.com', industry: 'Travel / Hospitality', tier: 1, startYear: 1957, preferredAssets: ['all_star_experiences', 'all_star_saturday'], budgetPerYear: 18000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Hotel & Resort Partner' },
  { id: 'hilton', name: 'Hilton', domain: 'hilton.com', industry: 'Travel / Hospitality', tier: 1, startYear: 1946, preferredAssets: ['all_star_experiences', 'legends_brunch'], budgetPerYear: 16000000, reputationRisk: 5, exclusivityRequirement: 'Exclusive Hotel & Resort Partner' },
  { id: 'emirates', name: 'Emirates', domain: 'emirates.com', industry: 'Travel / Hospitality', tier: 1, startYear: 2024, preferredAssets: ['nba_cup', 'all_star_game'], budgetPerYear: 25000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Global Airline Partner' },
  { id: 'youtube_tv', name: 'YouTube TV', domain: 'tv.youtube.com', industry: 'Media / Streaming', tier: 1, startYear: 2018, endYear: 2025, preferredAssets: ['nba_finals', 'all_star_saturday'], budgetPerYear: 35000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Live TV Streaming Partner' },
  { id: 'sofi', name: 'SoFi', domain: 'sofi.com', industry: 'Payments & Credit Cards', tier: 1, startYear: 2024, preferredAssets: ['nba_play_in', 'rising_stars'], budgetPerYear: 20000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Banking & Digital Finance Partner' },

  // SPORTSBOOK & FANTASY (RESTRICTED)
  { id: 'draftkings', name: 'DraftKings', domain: 'draftkings.com', industry: 'Sportsbook & Fantasy', tier: 1, startYear: 2018, isRestricted: true, isHighRisk: true, preferredAssets: ['three_point', 'all_star_saturday', 'all_star_game'], budgetPerYear: 25000000, reputationRisk: 30, exclusivityRequirement: 'Exclusive Official Sportsbook Partner' },
  { id: 'fanduel', name: 'FanDuel', domain: 'fanduel.com', industry: 'Sportsbook & Fantasy', tier: 1, startYear: 2018, isRestricted: true, isHighRisk: true, preferredAssets: ['slam_dunk', 'three_point', 'all_star_saturday'], budgetPerYear: 26000000, reputationRisk: 30, exclusivityRequirement: 'Exclusive Official Sportsbook Partner' },

  // 2030s & 2040s FICTIONAL FUTURE BRANDS
  { id: 'holocourt', name: 'HoloCourt Labs', domain: 'meta.com', industry: 'Gaming Consoles', tier: 1, startYear: 2029, isFictional: true, preferredAssets: ['creator_cup', 'all_star_fan_festival', 'slam_dunk'], budgetPerYear: 28000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive XR Sports Technology Partner' },
  { id: 'astradrive', name: 'AstraDrive', domain: 'waymo.com', industry: 'Automotive', tier: 1, startYear: 2028, isFictional: true, preferredAssets: ['all_star_game_mvp', 'shooting_stars', 'all_star_experiences'], budgetPerYear: 25000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Autonomous Mobility Partner' },
  { id: 'novagrid', name: 'NovaGrid Energy', domain: 'tesla.com', industry: 'Technology', tier: 1, startYear: 2028, isFictional: true, preferredAssets: ['all_star_saturday', 'skills_challenge'], budgetPerYear: 24000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Clean Energy Technology Partner' },
  { id: 'neonbank', name: 'NeonBank', domain: 'sofi.com', industry: 'Payments & Credit Cards', tier: 1, startYear: 2027, isFictional: true, preferredAssets: ['rising_stars', 'all_star_saturday', 'creator_cup'], budgetPerYear: 22000000, reputationRisk: 10, exclusivityRequirement: 'Exclusive Digital Finance Partner' },
  { id: 'prism_media', name: 'Prism Media', domain: 'sony.com', industry: 'Media / Streaming', tier: 1, startYear: 2028, isFictional: true, preferredAssets: ['pregame_concert', 'halftime_show', 'all_star_voting'], budgetPerYear: 26000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Immersive Streaming Partner' },
  { id: 'pulsefuel', name: 'PulseFuel', domain: 'gatorade.com', industry: 'Beverage - Cola', tier: 2, startYear: 2029, isFictional: true, preferredAssets: ['slam_dunk', 'three_point', 'all_star_practice'], budgetPerYear: 16000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Performance Beverage Partner' },
  { id: 'orbitpay', name: 'OrbitPay', domain: 'stripe.com', industry: 'Payments & Credit Cards', tier: 1, startYear: 2030, isFictional: true, preferredAssets: ['all_star_saturday', 'all_star_experiences'], budgetPerYear: 24000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Global Payment Partner' },
  { id: 'novawear', name: 'NovaWear', domain: 'underarmour.com', industry: 'Apparel & Footwear', tier: 2, startYear: 2030, isFictional: true, preferredAssets: ['rising_stars', 'creator_cup'], budgetPerYear: 14000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Smart Apparel Partner' },
  { id: 'solstice', name: 'Solstice Wireless', domain: 'verizon.com', industry: 'Telecommunications', tier: 1, startYear: 2030, isFictional: true, preferredAssets: ['slam_dunk', 'all_star_practice', 'all_star_media_day'], budgetPerYear: 28000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Telecommunications Partner' },
  { id: 'synapse', name: 'Synapse Sports', domain: 'nvidia.com', industry: 'Artificial Intelligence', tier: 1, startYear: 2031, isFictional: true, preferredAssets: ['all_star_game_mvp', 'skills_challenge', 'all_star_draft'], budgetPerYear: 30000000, reputationRisk: 6, exclusivityRequirement: 'Exclusive Sports AI & Analytics Partner' },
  { id: 'titan_mobility', name: 'Titan Mobility', domain: 'rivian.com', industry: 'Automotive', tier: 1, startYear: 2033, isFictional: true, preferredAssets: ['all_star_experiences', 'all_star_saturday'], budgetPerYear: 26000000, reputationRisk: 8, exclusivityRequirement: 'Exclusive Autonomous Flight & Mobility Partner' }
];

export const CURRENT_2026_DEFAULT_DEALS: AssignedDeal[] = [
  {
    dealId: 'deal-mvp-kia',
    assetId: 'all_star_game_mvp',
    assetName: 'NBA All-Star Game MVP Award',
    sponsorId: 'kia',
    sponsorName: 'Kia',
    sponsorDomain: 'kia.com',
    industry: 'Automotive',
    startYear: 2011,
    endYear: 2027,
    annualPayout: 6500000,
    totalRemainingValue: 13000000,
    isExclusive: true,
    renewalInterest: 92,
    status: 'active'
  },
  {
    dealId: 'deal-3pt-statefarm',
    assetId: 'three_point',
    assetName: '3-Point Contest',
    sponsorId: 'state_farm',
    sponsorName: 'State Farm',
    sponsorDomain: 'statefarm.com',
    industry: 'Insurance',
    startYear: 2026,
    endYear: 2028,
    annualPayout: 6000000,
    totalRemainingValue: 18000000,
    isExclusive: true,
    renewalInterest: 88,
    status: 'active'
  },
  {
    dealId: 'deal-dunk-att',
    assetId: 'slam_dunk',
    assetName: 'Slam Dunk Contest',
    sponsorId: 'att',
    sponsorName: 'AT&T',
    sponsorDomain: 'att.com',
    industry: 'Telecommunications',
    startYear: 2019,
    endYear: 2027,
    annualPayout: 7500000,
    totalRemainingValue: 15000000,
    isExclusive: true,
    renewalInterest: 94,
    status: 'active'
  },
  {
    dealId: 'deal-shooting-kia',
    assetId: 'shooting_stars',
    assetName: 'Shooting Stars',
    sponsorId: 'kia',
    sponsorName: 'Kia',
    sponsorDomain: 'kia.com',
    industry: 'Automotive',
    startYear: 2026,
    endYear: 2027,
    annualPayout: 3200000,
    totalRemainingValue: 6400000,
    isExclusive: true,
    renewalInterest: 85,
    status: 'active'
  },
  {
    dealId: 'deal-rising-castrol',
    assetId: 'rising_stars',
    assetName: 'Rising Stars',
    sponsorId: 'castrol',
    sponsorName: 'Castrol',
    sponsorDomain: 'castrol.com',
    industry: 'Automotive',
    startYear: 2025,
    endYear: 2027,
    annualPayout: 4500000,
    totalRemainingValue: 9000000,
    isExclusive: true,
    renewalInterest: 82,
    status: 'active'
  },
  {
    dealId: 'deal-celeb-ruffles',
    assetId: 'celebrity_game',
    assetName: 'NBA All-Star Celebrity Game',
    sponsorId: 'ruffles',
    sponsorName: 'Ruffles',
    sponsorDomain: 'ruffles.com',
    industry: 'Dining / QSR',
    startYear: 2018,
    endYear: 2027,
    annualPayout: 3000000,
    totalRemainingValue: 6000000,
    isExclusive: true,
    renewalInterest: 90,
    status: 'active'
  },
  {
    dealId: 'deal-mediaday-att',
    assetId: 'all_star_media_day',
    assetName: 'NBA All-Star Media Day',
    sponsorId: 'att',
    sponsorName: 'AT&T',
    sponsorDomain: 'att.com',
    industry: 'Telecommunications',
    startYear: 2019,
    endYear: 2027,
    annualPayout: 1500000,
    totalRemainingValue: 3000000,
    isExclusive: true,
    renewalInterest: 91,
    status: 'active'
  },
  {
    dealId: 'deal-nbacup-emirates',
    assetId: 'nba_cup',
    assetName: 'NBA Cup (In-Season Tournament)',
    sponsorId: 'emirates',
    sponsorName: 'Emirates',
    sponsorDomain: 'emirates.com',
    industry: 'Travel / Hospitality',
    startYear: 2024,
    endYear: 2028,
    annualPayout: 18000000,
    totalRemainingValue: 54000000,
    isExclusive: true,
    renewalInterest: 95,
    status: 'active'
  },
  {
    dealId: 'deal-playin-sofi',
    assetId: 'nba_play_in',
    assetName: 'NBA Play-In Tournament',
    sponsorId: 'sofi',
    sponsorName: 'SoFi',
    sponsorDomain: 'sofi.com',
    industry: 'Payments & Credit Cards',
    startYear: 2024,
    endYear: 2027,
    annualPayout: 12000000,
    totalRemainingValue: 24000000,
    isExclusive: true,
    renewalInterest: 90,
    status: 'active'
  },
  {
    dealId: 'deal-draft-statefarm',
    assetId: 'nba_draft',
    assetName: 'NBA Draft',
    sponsorId: 'state_farm',
    sponsorName: 'State Farm',
    sponsorDomain: 'statefarm.com',
    industry: 'Insurance',
    startYear: 2012,
    endYear: 2026,
    annualPayout: 14000000,
    totalRemainingValue: 14000000,
    isExclusive: true,
    renewalInterest: 92,
    status: 'active'
  }
];

// Use this historical timeline data depending on simulation era as default presenting sponsors. Never silently leave a missing historical year.
export const SPONSORSHIP_HISTORICAL_TIMELINES: Record<string, Array<{ years: string; sponsor: string; note?: string }>> = {
  slam_dunk: [
    { years: '1984', sponsor: 'None / unbranded' },
    { years: '1985–1993', sponsor: 'Gatorade' },
    { years: '1994–1997', sponsor: 'Nestle Crunch' },
    { years: '1998', sponsor: 'None', note: 'event inactive' },
    { years: '1999', sponsor: 'None', note: 'no All-Star Weekend' },
    { years: '2000–2002', sponsor: '1-800-CALL-ATT' },
    { years: '2003–2015', sponsor: 'Sprite' },
    { years: '2016–2018', sponsor: 'Verizon' },
    { years: '2019–present', sponsor: 'AT&T' }
  ],
  three_point: [
    { years: '1986–1996', sponsor: 'American Airlines' },
    { years: '1997–1998', sponsor: 'AT&T Shootout' },
    { years: '1999', sponsor: 'None', note: 'no All-Star Weekend' },
    { years: '2000', sponsor: 'AT&T Shootout' },
    { years: '2001–2003', sponsor: '1-800-FLOWERS' },
    { years: '2004–2017', sponsor: 'Foot Locker' },
    { years: '2018–2019', sponsor: 'JBL' },
    { years: '2020–2022', sponsor: 'Mountain Dew' },
    { years: '2023–2025', sponsor: 'Starry' },
    { years: '2026–present', sponsor: 'State Farm' }
  ],
  skills_challenge: [
    { years: '2003–2004', sponsor: '989 Sports' },
    { years: '2005–2021', sponsor: 'Taco Bell' },
    { years: '2022–2025', sponsor: 'Kia' },
    { years: '2026', sponsor: 'None', note: 'event inactive and replaced by Shooting Stars' },
    { years: '2027 onward', sponsor: 'Determined by simulation Saturday format' }
  ],
  rising_stars: [
    { years: '1994–1998', sponsor: 'Schick' },
    { years: '1999', sponsor: 'None', note: 'no All-Star Weekend' },
    { years: '2000–2001', sponsor: 'Schick' },
    { years: '2002–2003', sponsor: 'Got Milk?' },
    { years: '2004–2011', sponsor: 'T-Mobile' },
    { years: '2012–2017', sponsor: 'BBVA' },
    { years: '2018–2020', sponsor: 'Mountain Dew' },
    { years: '2021', sponsor: 'None', note: 'roster named but event not played' },
    { years: '2022', sponsor: 'Clorox' },
    { years: '2023', sponsor: 'Jordan Brand' },
    { years: '2024', sponsor: 'Panini' },
    { years: '2025–present', sponsor: 'Castrol' }
  ],
  celebrity_game: [
    { years: '2003', sponsor: 'None / unbranded' },
    { years: '2004–2011', sponsor: "McDonald's" },
    { years: '2012–2015', sponsor: 'Sprint' },
    { years: '2016–2017', sponsor: 'None / unbranded' },
    { years: '2018–present', sponsor: 'Ruffles' }
  ],
  shooting_stars: [
    { years: '2004–2005', sponsor: 'RadioShack' },
    { years: '2006–2012', sponsor: 'Haier' },
    { years: '2013–2015', sponsor: 'Sears' },
    { years: '2016–2025', sponsor: 'None', note: 'event inactive' },
    { years: '2026–present', sponsor: 'Kia' }
  ],
  all_star_saturday: [
    { years: '1984–2002', sponsor: 'None / unbranded' },
    { years: '2003–2005', sponsor: 'America Online / AOL' },
    { years: '2006–2009', sponsor: 'None / unbranded' },
    { years: '2010–2025', sponsor: 'State Farm' },
    { years: '2026–present', sponsor: 'None unless new umbrella deal is signed' }
  ],
  all_star_game_mvp: [
    { years: '1951–2010', sponsor: 'None / unbranded' },
    { years: '2011–present', sponsor: 'Kia' }
  ],
  nba_finals: [
    { years: '1947–2017', sponsor: 'None / unbranded' },
    { years: '2018–2025', sponsor: 'YouTube TV' },
    { years: '2026–present', sponsor: 'None unless new presenting deal is signed' }
  ],
  nba_cup: [
    { years: '2023', sponsor: 'None / unbranded' },
    { years: '2024–present', sponsor: 'Emirates' }
  ],
  nba_draft: [
    { years: '1947–2005', sponsor: 'None / unbranded' },
    { years: '2006–2008', sponsor: 'Sprite' },
    { years: '2009–2010', sponsor: 'EA Sports' },
    { years: '2011', sponsor: 'Kia Motors' },
    { years: '2012–2026', sponsor: 'State Farm' }
  ],
  nba_play_in: [
    { years: '2020–2023', sponsor: 'None / unbranded' },
    { years: '2024–present', sponsor: 'SoFi' }
  ],
  all_star_media_day: [
    { years: '1980s–1990s', sponsor: 'Local radio and print media partners' },
    { years: '2010s', sponsor: 'American Express / Michelob Ultra' },
    { years: '2019–present', sponsor: 'AT&T' }
  ]
};

// Helper to calculate Era Money Multipliers
export function getEraMoneyMultiplier(year: number): number {
  if (year <= 1959) return 0.01;
  if (year <= 1969) return 0.025;
  if (year <= 1979) return 0.06;
  if (year <= 1989) return 0.15;
  if (year <= 1999) return 0.35;
  if (year <= 2009) return 0.60;
  if (year <= 2019) return 0.85;
  if (year <= 2029) return 1.00;
  if (year <= 2039) return 1.25;
  if (year <= 2049) return 1.55;
  return 1.80 + (year - 2050) * 0.03;
}

// Helper to calculate Brand Fit Score (0-100)
export function calculateBrandFitScore(brand: SponsorBrand, asset: AllStarAsset): number {
  if (brand.preferredAssets.includes(asset.id)) {
    return Math.min(100, 92 + Math.floor(Math.random() * 8));
  }
  if (asset.bestIndustries && asset.bestIndustries.includes(brand.industry)) {
    return Math.min(100, 85 + Math.floor(Math.random() * 10));
  }
  if (brand.industry === 'Beverage - Cola' && (asset.id === 'three_point' || asset.id === 'slam_dunk' || asset.id === 'all_star_saturday')) {
    return 94;
  }
  if (brand.industry === 'Telecommunications' && (asset.id === 'slam_dunk' || asset.id === 'all_star_practice' || asset.id === 'all_star_media_day')) {
    return 95;
  }
  if (brand.industry === 'Automotive' && (asset.id === 'all_star_game_mvp' || asset.id === 'skills_challenge' || asset.id === 'shooting_stars')) {
    return 93;
  }
  return 68 + Math.floor(Math.random() * 18);
}

// Helper to check if an asset is active in a given sim year
export function isAssetActiveInYear(asset: AllStarAsset, year: number): boolean {
  if (year === 1999) return false; // 1999 Lockout: no All-Star weekend
  if (year < asset.firstYear) return false;
  if (asset.lastYear && year > asset.lastYear) return false;
  if (asset.inactiveYears.includes(year)) return false;
  return true;
}

// Helper to format naming preview live
export function formatNamingPreview(asset: AllStarAsset, sponsorName: string, allowCustomUmbrella: boolean): string {
  if (sponsorName === 'None' || !sponsorName) {
    return asset.name;
  }
  if (!allowCustomUmbrella && asset.id === 'all_star_game') {
    return 'NBA All-Star Game (Strict Mode: Unbranded Title)';
  }
  return asset.namingTemplate.replace('{brand}', sponsorName);
}

// Helper to get bundle premium percentage
export function getBundlePremiumPercent(assetCount: number, isParentCompanyCoordinated: boolean = false): number {
  let basePercent = 0;
  if (assetCount === 2) basePercent = 3;
  else if (assetCount === 3) basePercent = 6;
  else if (assetCount >= 4 && assetCount <= 5) basePercent = 10;
  else if (assetCount >= 6) basePercent = 12;

  if (isParentCompanyCoordinated && assetCount >= 2) {
    basePercent += 3;
  }
  return basePercent;
}
