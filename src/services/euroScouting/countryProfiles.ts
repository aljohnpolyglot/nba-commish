import profiles from './countryProfiles.json';
import type { EuroCountryProfile } from './types';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(enLocale);

export type EuroCountryMetric = 'talent' | 'height' | 'athleticism' | 'popularity' | 'population' | 'scouted';
export type EuroCountryBracket = 'low' | 'average' | 'strong' | 'elite';

const GENERATION_ALIASES: Record<string, string> = {
  'United States': 'USA',
  'United States of America': 'USA',
  'Great Britain': 'UK',
  'Korea Republic': 'South Korea',
  'Korea DPR': 'South Korea',
  'Chinese Taipei': 'Taiwan',
  'Congo DR': 'DR Congo',
  'Congo Democratic Republic': 'DR Congo',
  'Côte d’Ivoire': 'Ivory Coast',
  'Côte d\'Ivoire': 'Ivory Coast',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'North Macedonia': 'Macedonia',
};

const ATLAS_ALIASES: Record<string, string> = {
  USA: 'United States',
  'United States of America': 'United States',
  England: 'Great Britain',
  'United Kingdom': 'Great Britain',
  Czechia: 'Czech Republic',
  'Republic of Serbia': 'Serbia',
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'Democratic Republic of the Congo': 'Congo DR',
  'Republic of the Congo': 'Congo',
  'South Korea': 'Korea Republic',
  'North Korea': 'Korea DPR',
  Taiwan: 'Chinese Taipei',
  'Ivory Coast': 'Côte d’Ivoire',
};

export const EURO_COUNTRY_PROFILES = profiles as EuroCountryProfile[];

export const EURO_COUNTRY_BY_ID = new Map(EURO_COUNTRY_PROFILES.map(profile => [profile.id, profile]));

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

const profileAliases = new Map<string, EuroCountryProfile>();
const registerProfile = (profile: EuroCountryProfile, extraAliases: Array<string | undefined> = []) => {
  for (const value of [profile.id, profile.iso2, profile.name, ATLAS_ALIASES[profile.name]]) {
    if (value) profileAliases.set(normalize(value), profile);
  }
  for (const value of extraAliases) {
    if (value) profileAliases.set(normalize(value), profile);
  }
  EURO_COUNTRY_BY_ID.set(profile.id, profile);
};

for (const profile of EURO_COUNTRY_PROFILES) registerProfile(profile);

export const findEuroCountryProfile = (value?: string | null): EuroCountryProfile | undefined => {
  if (!value) return undefined;
  return profileAliases.get(normalize(value));
};

export const resolveEuroAtlasCountry = (id: string | number | undefined, name: string): EuroCountryProfile => {
  const rawId = String(id ?? '');
  const numericId = /^\d+$/.test(rawId) ? rawId.padStart(3, '0') : '';
  const alpha3 = numericId ? countries.numericToAlpha3(numericId) : rawId;
  const existing = findEuroCountryProfile(alpha3) ?? findEuroCountryProfile(name);
  if (existing) {
    registerProfile(existing, [rawId, name]);
    return existing;
  }

  const fallbackId = alpha3 || normalize(name).slice(0, 3).toUpperCase();
  const charSum = fallbackId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const fallback: EuroCountryProfile = {
    id: fallbackId,
    iso2: countries.alpha3ToAlpha2(fallbackId) || countries.getAlpha2Code(name, 'en') || '',
    name,
    region: 'Global',
    talentRating: 10 + (charSum % 30),
    heightRating: 30 + (charSum % 40),
    athleticismRating: 0,
    basketballPopularity: 0,
    population: 500_000 + charSum * 10_000,
  };
  registerProfile(fallback, [rawId, name]);
  return fallback;
};

export const getGenerationCountry = (profile: EuroCountryProfile): string => GENERATION_ALIASES[profile.name] ?? profile.name;

export const getCountryMetricValue = (
  profile: EuroCountryProfile,
  metric: EuroCountryMetric,
  timesScouted = 0,
): number => {
  if (metric === 'talent') return profile.talentRating;
  if (metric === 'height') return profile.heightRating;
  if (metric === 'athleticism') return profile.athleticismRating;
  if (metric === 'popularity') return profile.basketballPopularity;
  if (metric === 'population') return profile.population;
  return timesScouted;
};

export const getCountryMetricBracket = (
  profile: EuroCountryProfile,
  metric: EuroCountryMetric,
  timesScouted = 0,
): EuroCountryBracket => {
  const value = getCountryMetricValue(profile, metric, timesScouted);
  const thresholds = metric === 'population'
    ? [10_000_000, 50_000_000, 150_000_000]
    : metric === 'scouted'
      ? [1, 3, 5]
      : [50, 75, 90];
  if (value < thresholds[0]) return 'low';
  if (value < thresholds[1]) return 'average';
  if (value < thresholds[2]) return 'strong';
  return 'elite';
};

const METRIC_COLORS: Record<EuroCountryMetric, Record<EuroCountryBracket, string>> = {
  talent: { low: '#262626', average: '#047857', strong: '#10b981', elite: '#34d399' },
  height: { low: '#262626', average: '#4338ca', strong: '#4f46e5', elite: '#818cf8' },
  athleticism: { low: '#262626', average: '#c2410c', strong: '#ea580c', elite: '#fb923c' },
  popularity: { low: '#262626', average: '#be185d', strong: '#db2777', elite: '#f472b6' },
  population: { low: '#262626', average: '#0e7490', strong: '#0891b2', elite: '#22d3ee' },
  scouted: { low: '#262626', average: '#a16207', strong: '#ca8a04', elite: '#fde047' },
};

export const getCountryMetricColor = (
  profile: EuroCountryProfile,
  metric: EuroCountryMetric,
  timesScouted = 0,
): string => METRIC_COLORS[metric][getCountryMetricBracket(profile, metric, timesScouted)];

export const getMetricBracketColor = (metric: EuroCountryMetric, bracket: EuroCountryBracket): string => (
  METRIC_COLORS[metric][bracket]
);
