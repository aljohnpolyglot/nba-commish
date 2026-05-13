// Run with: npx tsx scripts/build-sponsor-catalog.ts > sponsor-catalog.json
// Then upload sponsor-catalog.json to https://github.com/aljohnpolyglot/nba-store-data/blob/main/sponsor-catalog.json
import { SPAIN_INITIAL_SPONSORS } from '../src/services/tycoon/specs/spain';
import { classifySponsor } from '../src/services/tycoon/sponsorshipEngine';
import type { TycoonTier, SponsorshipSlot } from '../src/types/tycoon';

const KNOWN_DOMAINS: Record<string, string> = {
  'Emirates': 'emirates.com',
  'Adidas': 'adidas.com',
  'Herbalife': 'herbalife.com',
  'Plus500': 'plus500.com',
  'Mahou': 'mahou-sanmiguel.com',
  'Iberdrola': 'iberdrola.com',
  'BBVA': 'bbva.com',
  'Endesa': 'endesa.com',
  'Mapfre': 'mapfre.com',
  'Banco Santander': 'santander.com',
  'Repsol': 'repsol.com',
  'Iberia': 'iberia.com',
  'Nike': 'nike.com',
  'Adidas Training': 'adidas.com',
  'Under Armour': 'underarmour.com',
  'Movistar': 'movistar.es',
  'Coca-Cola': 'coca-cola.com',
  'Spotify': 'spotify.com',
  'Bankia': 'bankia.es',
  'Caixa': 'caixabank.es',
  'Acciona': 'acciona.com',
  'Naturgy': 'naturgy.com',
  'Cetelem': 'cetelem.es',
  'EVO Banco': 'evobanco.com',
  'Liberbank': 'liberbank.es',
  'Ibercaja': 'ibercaja.es',
  'Mahou Regional': 'mahou-sanmiguel.com',
  'Tecnocasa': 'tecnocasa.es',
  'Joma': 'joma-sport.com',
  'Kelme': 'kelme.com',
  'Macron': 'macron.com',
  'Telefónica': 'telefonica.com',
  'Reale': 'reale.es',
  'Hipercor': 'hipercor.es',
  'Hummel': 'hummel.net',
  'Spalding': 'spalding.com',
  'Damm': 'damm.com',
  'Cabify Regional': 'cabify.com',
};

type Brand = { industry: string; domain: string | null; logoOverride: string | null };
const brands: Record<string, Brand> = {};

const tiers: Record<TycoonTier, Record<SponsorshipSlot, string[]>> = SPAIN_INITIAL_SPONSORS;
for (const tier of Object.keys(tiers) as TycoonTier[]) {
  for (const slot of Object.keys(tiers[tier]) as SponsorshipSlot[]) {
    for (const name of tiers[tier][slot]) {
      if (brands[name]) continue;
      const { industry } = classifySponsor(name);
      brands[name] = {
        industry: industry ?? 'generic',
        domain: KNOWN_DOMAINS[name] ?? null,
        logoOverride: null,
      };
    }
  }
}

const payload = {
  version: 1,
  leagues: {
    spain: { tiers, brands },
    france: null,
    italy: null,
    greece: null,
    germany: null,
    turkey: null,
    israel: null,
  },
};

process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
