const PBA_TEAM_DATA = [
  { abbrev: 'BGSM', region: 'Ginebra',     name: 'Barangay Ginebra San Miguel',        pop: 15.0,  company: 'Ginebra San Miguel, Inc.',           championships: 15, colors: ['#CA0000', '#FFFFFF', '#707372'], governor: 'Alfrancis Chua',    coach: 'Tim Cone',       aliases: ['ginebra', 'barangay ginebra', 'bgsm'] },
  { abbrev: 'SMB',  region: 'San Miguel',   name: 'San Miguel Beermen',                 pop: 12.0,  company: 'San Miguel Brewery, Inc.',           championships: 31, colors: ['#002366', '#CA0000', '#FFFFFF'], governor: 'Robert Non',        coach: 'Leo Austria',    aliases: ['san miguel', 'beermen', 'smb'] },
  { abbrev: 'MAG',  region: 'Magnolia',     name: 'Magnolia Chicken Timplados Hotshots', pop: 11.0,  company: 'San Miguel Food and Beverage, Inc.', championships: 14, colors: ['#0C2340', '#FFFFFF', '#FFB81C'], governor: 'Jason Webb',        coach: 'LA Tenorio',     aliases: ['magnolia', 'hotshots', 'mag'] },
  { abbrev: 'TNT',  region: 'TNT',          name: 'TNT Tropang 5G',                     pop:  8.0,  company: 'Smart Communications',               championships: 11, colors: ['#0050B5', '#FFB81C', '#000000'], governor: 'Ricky Vargas',      coach: 'Chot Reyes',     aliases: ['tnt', 'tropang giga', 'tnt tropang'] },
  { abbrev: 'MER',  region: 'Meralco',      name: 'Meralco Bolts',                      pop:  7.0,  company: 'Manila Electric Company',             championships:  1, colors: ['#FF6720', '#003057', '#FFFFFF'], governor: 'William Pamintuan', coach: 'Luigi Trillo',   aliases: ['meralco', 'bolts', 'mer'] },
  { abbrev: 'ROS',  region: 'Rain or Shine', name: 'Rain or Shine Elasto Painters',     pop:  6.0,  company: 'Asian Coatings Philippines, Inc.',    championships:  2, colors: ['#1D4289', '#EE2737', '#FFFFFF'], governor: 'Mamerto Mondragon', coach: 'Yeng Guiao',    aliases: ['rain or shine', 'elasto painters', 'ros'] },
  { abbrev: 'NLEX', region: 'NLEX',         name: 'NLEX Road Warriors',                 pop:  5.0,  company: 'NLEX Corporation',                   championships:  0, colors: ['#1B365D', '#EFB661', '#FFFFFF'], governor: 'Ronald Dulatre',    coach: 'Jong Uichico',   aliases: ['nlex', 'road warriors'] },
  { abbrev: 'PHX',  region: 'Phoenix',      name: 'Phoenix Super LPG Fuel Masters',     pop:  4.0,  company: 'Phoenix Petroleum Philippines, Inc.', championships:  0, colors: ['#FF6720', '#FFB81C', '#000000'], governor: 'Raymond Zorrilla',  coach: 'Charles Tiu',    aliases: ['phoenix', 'fuel masters', 'phx'] },
  { abbrev: 'CON',  region: 'Converge',     name: 'Converge FiberXers',                 pop:  4.0,  company: 'Converge ICT Solutions, Inc.',        championships:  0, colors: ['#702F8A', '#0092BC', '#FFFFFF'], governor: 'Archen Cayabyab',   coach: 'Dennis Pineda',  aliases: ['converge', 'fiberxers', 'con'] },
  { abbrev: 'TGR',  region: 'Titan Ultra',  name: 'Titan Ultra Giant Risers',           pop:  3.0,  company: 'Pureblends Corporation',             championships:  0, colors: ['#EE2737', '#BF9474', '#101820'], governor: 'Emilio Tiu',        coach: 'Rensy Bajar',    aliases: ['titan ultra', 'giant risers', 'northport', 'tgr'] },
  { abbrev: 'BWB',  region: 'Blackwater',   name: 'Blackwater Bossing',                 pop:  2.0,  company: 'Ever Bilena Cosmetics, Inc.',         championships:  0, colors: ['#9B2242', '#000000', '#FFFFFF'], governor: 'Silliman Sy',       coach: 'Patrick Aquino', aliases: ['blackwater', 'bossing', 'bwb'] },
  { abbrev: 'TER',  region: 'Terrafirma',   name: 'Terrafirma Dyip',                   pop:  1.5,  company: 'Terrafirma Realty Development Corp.', championships:  0, colors: ['#FF6720', '#000000', '#FFFFFF'], governor: 'Pido Jarencio',     coach: 'Ronald Tubid',   aliases: ['terrafirma', 'dyip', 'ter'] },
];

const normalizePbaText = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const PBA_TEAM_POPULATION_MAP = new Map<string, number>();

for (const club of PBA_TEAM_DATA) {
  const keys = [club.region, club.name, club.abbrev, ...club.aliases];
  for (const key of keys) {
    PBA_TEAM_POPULATION_MAP.set(normalizePbaText(key), club.pop);
  }
}

export const getPbaTeamPopulationOverride = (region?: string | null, name?: string | null): number | null => {
  const regionKey = region ? normalizePbaText(region) : '';
  const nameKey = name ? normalizePbaText(name) : '';
  const combinedKey = `${regionKey} ${nameKey}`.trim();

  return PBA_TEAM_POPULATION_MAP.get(combinedKey)
    ?? PBA_TEAM_POPULATION_MAP.get(nameKey)
    ?? PBA_TEAM_POPULATION_MAP.get(regionKey)
    ?? null;
};

export const PBA_ARENAS = [
  { name: 'SM Mall of Asia Arena',      city: 'Pasay',       capacity: 15_000, tier: 'finals' as const },
  { name: 'Smart Araneta Coliseum',     city: 'Quezon City', capacity: 14_429, tier: 'standard' as const },
  { name: 'Philippine Arena',           city: 'Bocaue',      capacity: 55_000, tier: 'special' as const },
  { name: 'Ynares Center',             city: 'Antipolo',    capacity: 7_400,  tier: 'regional' as const },
  { name: 'Ninoy Aquino Stadium',      city: 'Manila',      capacity: 6_000,  tier: 'weekday' as const },
  { name: 'Quadricentennial Pavilion', city: 'Manila',      capacity: 5_792,  tier: 'weekday' as const },
  { name: 'Ynares Center II',          city: 'Rodriguez',   capacity: 8_000,  tier: 'regional' as const },
];

export const PBA_TICKET_PRICING = {
  generalAdmission: 100,
  upperBox: 500,
  lowerBox: 1_200,
  courtside: 2_500,
  premiumVIP: 3_300,
};

export const PBA_CORPORATE_BLOCKS = {
  smc: ['BGSM', 'SMB', 'MAG'],
  mvp: ['TNT', 'MER', 'NLEX'],
} as const;

export { PBA_TEAM_DATA };
