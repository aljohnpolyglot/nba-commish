import ligaAcbClubLogos from '../data/ligaAcbClubLogos.json';

type LogoClub = {
  displayName?: string;
  articleTitle?: string;
  logoUrl?: string;
  logoThumbUrl?: string;
};

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const unusable = (value: unknown): boolean => {
  const url = String(value ?? '').trim();
  return !url || /proballers\.com\/media\/team\/default\.svg|kit_shorts|blank|placeholder/i.test(url);
};

const aliases: Array<{ club: string; keys: string[] }> = [
  { club: 'Joventut Badalona', keys: ['joventut', 'badalonajoventut', 'joventutmassana'] },
  { club: 'FC Barcelona Bàsquet', keys: ['fcbarcelona', 'barcelonabarca', 'barcelonaregal'] },
  { club: 'Basket Zaragoza', keys: ['basketzaragoza', 'zaragozabasket', 'caizaragoza', 'calzaragoza'] },
  { club: 'Bàsquet Manresa', keys: ['basquetmanresa', 'manresabaxi', 'ebromanresa'] },
  { club: 'Saski Baskonia', keys: ['saskibaskonia', 'baskonia', 'arabatxobaskonia', 'tauceramica', 'taugres'] },
  { club: 'CB Canarias', keys: ['cbcanarias', 'cofisacanarias', 'tenerife'] },
  { club: 'Real Madrid Baloncesto', keys: ['realmadrid'] },
  { club: 'CB Estudiantes', keys: ['estudiantes', 'cajapostal'] },
  { club: 'CB Valladolid', keys: ['valladolid', 'forumvalladolid'] },
  { club: 'CB Gran Canaria', keys: ['grancanaria'] },
  { club: 'Valencia Basket', keys: ['valenciabasket'] },
  { club: 'Baloncesto Málaga', keys: ['baloncestomalaga', 'malagaunicaja', 'unicaja'] },
  { club: 'Baloncesto Fuenlabrada', keys: ['fuenlabrada'] },
  { club: 'Bilbao Basket', keys: ['bilbaobasket'] },
  { club: 'BC Andorra', keys: ['andorra'] },
  { club: 'Obradoiro CAB', keys: ['obradoiro'] },
  { club: 'Real Betis Baloncesto', keys: ['realbetis', 'sevillerealbetis'] },
  { club: 'UCAM Murcia CB', keys: ['ucammurcia', 'murciaucam'] },
  { club: 'Fundación CB Granada', keys: ['fundaciongranada', 'granadacb'] },
  { club: "CB L'Hospitalet", keys: ['lhospitalet'] },
  { club: 'CB Granollers', keys: ['granollers', 'aresluxgranollers'] },
  { club: 'CB OAR Ferrol', keys: ['oarferrol'] },
  { club: 'CB Peñas Huesca', keys: ['penashuesca'] },
];

const knownFallbacks = [
  {
    keys: ['panellinios', 'panelliniosbc'],
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/a/a8/Panellinios_B.C..png',
  },
];

const clubs = (ligaAcbClubLogos.clubs as LogoClub[]).map(club => ({
  ...club,
  keys: [normalize(club.displayName), normalize(club.articleTitle)].filter(Boolean),
}));

export function getEuroClubFallbackLogo(team: {
  name?: unknown;
  region?: unknown;
  abbrev?: unknown;
} | null | undefined): string | undefined {
  if (!team) return undefined;
  const teamKeys = [team.name, team.region, team.abbrev, `${team.region ?? ''} ${team.name ?? ''}`]
    .map(normalize)
    .filter(Boolean);
  const knownFallback = knownFallbacks.find(entry =>
    entry.keys.some(key => teamKeys.some(teamKey => teamKey === key || teamKey.includes(key))),
  );
  if (knownFallback) return knownFallback.logoUrl;
  const alias = aliases.find(entry => entry.keys.some(key => teamKeys.some(teamKey => teamKey.includes(key))));
  const aliasKey = normalize(alias?.club);
  const club = aliasKey
    ? clubs.find(entry => entry.keys.includes(aliasKey))
    : clubs.find(entry => entry.keys.some(key => teamKeys.some(teamKey => teamKey === key || teamKey.includes(key) || key.includes(teamKey))));
  const logo = club?.logoUrl || club?.logoThumbUrl;
  return unusable(logo) ? undefined : logo;
}
