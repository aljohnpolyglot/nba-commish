import type { SponsorIndustry } from '../types/tycoon';

export interface BrandMeta {
  industry: SponsorIndustry | 'generic';
  domain: string | null;
  logoOverride: string | null;
}

const INDUSTRY_LABELS: Record<SponsorIndustry, string> = {
  airline: 'Airline',
  tech: 'Tech',
  fashion: 'Fashion',
  bank: 'Bank',
  auto: 'Auto',
  telecom: 'Telecom',
  beer: 'Beer',
  water: 'Water',
  energy_drink: 'Energy Drink',
  gambling: 'Gambling',
  sportswashing: 'State Partner',
  generic: 'Local Partner',
};

export function getIndustryLabel(industry: SponsorIndustry | 'generic' | undefined): string {
  if (!industry) return INDUSTRY_LABELS.generic;
  return INDUSTRY_LABELS[industry as SponsorIndustry] ?? INDUSTRY_LABELS.generic;
}

/** Returns the URL to render in <img>, or null when the SVG fallback should be used. */
export function resolveSponsorLogoUrl(meta: BrandMeta | undefined): string | null {
  if (!meta) return null;
  if (meta.logoOverride) return meta.logoOverride;
  if (meta.domain) {
    const token = import.meta.env.VITE_LOGODEV_TOKEN as string | undefined;
    const tokenParam = token ? `&token=${token}` : '';
    return `https://img.logo.dev/${meta.domain}?size=128&format=png${tokenParam}`;
  }
  return null;
}
