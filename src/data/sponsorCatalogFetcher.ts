import type { SponsorshipSlot, TycoonTier, SponsorIndustry } from '../types/tycoon';
import { SPAIN_INITIAL_SPONSORS } from '../services/tycoon/specs/spain';
import type { BrandMeta } from '../utils/sponsorLogos';

export type LeagueKey = 'spain' | 'france' | 'italy' | 'greece' | 'germany' | 'turkey' | 'israel';

interface LeagueData {
  tiers: Record<TycoonTier, Record<SponsorshipSlot, string[]>>;
  brands: Record<string, { industry: SponsorIndustry | 'generic'; domain: string | null; logoOverride: string | null }>;
}

interface SponsorCatalog {
  version: number;
  leagues: Partial<Record<LeagueKey, LeagueData | null>>;
}

const CATALOG_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/sponsor-catalog.json';

let cache: SponsorCatalog | null = null;
let inflight: Promise<SponsorCatalog> | null = null;

export async function loadSponsorCatalog(): Promise<SponsorCatalog> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(CATALOG_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SponsorCatalog;
      cache = json;
      return json;
    } catch (err) {
      console.warn('[sponsorCatalog] fetch failed, using offline fallback', err);
      cache = OFFLINE_FALLBACK;
      return OFFLINE_FALLBACK;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getSponsorCatalogSync(): SponsorCatalog | null {
  return cache;
}

export function pickSponsorName(
  league: LeagueKey,
  tier: TycoonTier,
  slot: SponsorshipSlot,
  existing?: string | null,
): string {
  const data = (cache ?? OFFLINE_FALLBACK).leagues[league];
  const pool = data?.tiers?.[tier]?.[slot] ?? SPAIN_INITIAL_SPONSORS[tier]?.[slot] ?? ['Default Sponsor'];
  const filtered = existing ? pool.filter((n) => n !== existing) : pool;
  if (filtered.length === 0) return pool[0];
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export function getBrandMeta(league: LeagueKey, sponsorName: string): BrandMeta | undefined {
  const data = (cache ?? OFFLINE_FALLBACK).leagues[league];
  return data?.brands?.[sponsorName];
}

const OFFLINE_FALLBACK: SponsorCatalog = {
  version: 0,
  leagues: {
    spain: { tiers: SPAIN_INITIAL_SPONSORS, brands: {} },
  },
};
