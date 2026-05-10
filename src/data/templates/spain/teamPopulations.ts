const SPAIN_TEAM_POPULATIONS = [
  { region: 'Madrid', name: 'Real Madrid', pop: 6.7, aliases: ['real madrid'] },
  { region: 'Barcelona', name: 'FC Barcelona', pop: 5.6, aliases: ['barcelona', 'fc barcelona'] },
  { region: 'Valencia', name: 'Valencia Basket', pop: 1.8, aliases: ['valencia', 'valencia basket'] },
  { region: 'Vitoria-Gasteiz', name: 'Baskonia', pop: 0.25, aliases: ['baskonia', 'saski baskonia'] },
  { region: 'Malaga', name: 'Unicaja', pop: 1.7, aliases: ['unicaja', 'unicaja malaga'] },
  { region: 'Badalona', name: 'Joventut Badalona', pop: 3.3, aliases: ['joventut', 'joventut badalona', 'badalona'] },
  { region: 'Murcia', name: 'UCAM Murcia', pop: 0.67, aliases: ['ucam murcia', 'murcia'] },
  { region: 'Zaragoza', name: 'Casademont Zaragoza', pop: 0.97, aliases: ['zaragoza', 'casademont zaragoza'] },
  { region: 'Gran Canaria', name: 'Gran Canaria', pop: 0.86, aliases: ['gran canaria', 'dreamland gran canaria'] },
  { region: 'Tenerife', name: 'Lenovo Tenerife', pop: 0.95, aliases: ['tenerife', 'lenovo tenerife', 'canarias'] },
  { region: 'Seville', name: 'Real Betis', pop: 1.55, aliases: ['real betis', 'betis'] },
  { region: 'Bilbao', name: 'Bilbao Basket', pop: 1.14, aliases: ['bilbao', 'bilbao basket'] },
  { region: 'Santiago de Compostela', name: 'Obradoiro', pop: 0.4, aliases: ['obradoiro', 'monbus obradoiro'] },
  { region: 'Manresa', name: 'Baxi Manresa', pop: 0.28, aliases: ['manresa', 'baxi manresa'] },
  { region: 'Girona', name: 'Bàsquet Girona', pop: 0.78, aliases: ['girona', 'basquet girona', 'bàsquet girona'] },
  { region: 'Lleida', name: 'Hiopos Lleida', pop: 0.44, aliases: ['lleida', 'hiopos lleida'] },
  { region: 'Andorra la Vella', name: 'MoraBanc Andorra', pop: 0.08, aliases: ['andorra', 'morabanc andorra'] },
  { region: 'Coruna', name: 'Leyma Coruna', pop: 0.41, aliases: ['coruna', 'coruña', 'leyma coruna', 'leyma coruña'] },
  { region: 'Burgos', name: 'San Pablo Burgos', pop: 0.18, aliases: ['burgos', 'san pablo burgos'] },
  { region: 'Fuenlabrada', name: 'Fuenlabrada', pop: 0.2, aliases: ['fuenlabrada', 'carplus fuenlabrada'] },
];

const normalizeSpainClubText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const SPAIN_TEAM_POPULATION_MAP = new Map<string, number>();

for (const club of SPAIN_TEAM_POPULATIONS) {
  const keys = [club.region, club.name, ...club.aliases];
  for (const key of keys) {
    SPAIN_TEAM_POPULATION_MAP.set(normalizeSpainClubText(key), club.pop);
  }
}

export const getSpainTeamPopulationOverride = (region?: string | null, name?: string | null): number | null => {
  const regionKey = region ? normalizeSpainClubText(region) : '';
  const nameKey = name ? normalizeSpainClubText(name) : '';
  const combinedKey = `${regionKey} ${nameKey}`.trim();

  return SPAIN_TEAM_POPULATION_MAP.get(combinedKey)
    ?? SPAIN_TEAM_POPULATION_MAP.get(nameKey)
    ?? SPAIN_TEAM_POPULATION_MAP.get(regionKey)
    ?? null;
};

export { SPAIN_TEAM_POPULATIONS };
