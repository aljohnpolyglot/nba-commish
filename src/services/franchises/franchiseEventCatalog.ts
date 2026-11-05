import type { GameState } from '../../types';
import {
  ALL_STAR_ASSETS_CATALOG,
  CURRENT_2026_DEFAULT_DEALS,
  MASTER_BRANDS_CATALOG,
  SPONSORSHIP_HISTORICAL_TIMELINES,
  getEraMoneyMultiplier,
  type AllStarAsset,
  type SponsorBrand,
} from '../../data/franchises/allStarSponsorshipsData';
import {
  isAllStarGameEnabled,
  isCelebrityGameEnabled,
  isDunkContestEnabled,
  isRisingStarsEnabled,
  isShootingStarsEnabled,
  isSkillsChallengeEnabled,
  isThreePointContestEnabled,
} from '../allStar/allStarEventAvailability';
import { isNoDraftLeague } from '../offseason/offseasonState';
import { getSeasonEconomyIndex } from '../tycoon/clubFinance';
import { FICTIONAL_FRANCHISE_BRANDS } from '../../data/fictionalFranchiseBrands';

const EXTRA_ASSETS: AllStarAsset[] = [
  {
    id: 'global_games',
    name: 'NBA Global Games',
    assetType: 'showcase_game',
    firstYear: 1947,
    inactiveYears: [],
    day: 'Season-Long',
    durationDays: 'Selected games',
    metricType: 'international broadcast reach',
    base2020sExposure: 'Global markets',
    prestige: 82,
    required: false,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 9_000_000,
    categoryGroup: 'Major Tournaments & Finals',
    namingTemplate: 'NBA Global Games presented by {brand}',
  },
  {
    id: 'summer_league',
    name: 'NBA Summer League',
    assetType: 'developmental_showcase',
    firstYear: 1947,
    inactiveYears: [],
    day: 'Offseason',
    durationDays: 'Multi-Day',
    metricType: 'broadcast and attendance reach',
    base2020sExposure: 'Development showcase',
    prestige: 70,
    required: false,
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 6_000_000,
    categoryGroup: 'Major Tournaments & Finals',
    namingTemplate: 'NBA Summer League presented by {brand}',
  },
  {
    id: 'horse',
    name: 'H-O-R-S-E Competition',
    assetType: 'shooting_competition',
    firstYear: 2009,
    inactiveYears: [],
    day: 'Saturday',
    durationDays: '1 event',
    metricType: 'broadcast and streaming viewers',
    base2020sExposure: 'All-Star Saturday audience',
    prestige: 68,
    required: false,
    parentPackage: 'all_star_saturday',
    strictNbaTitleNamingAllowed: true,
    customLeagueTitleNamingAllowed: true,
    defaultSponsorSlots: 1,
    baseAnnualValue: 2_800_000,
    categoryGroup: 'All-Star Weekend Events',
    namingTemplate: '{brand} H-O-R-S-E Competition',
  },
];

const hasScheduledPerformance = (state: GameState, phrase: string) =>
  (state.scheduledEvents ?? []).some(event =>
    event.type === 'PERFORMANCE_DAY'
    && String(event.payload?.event ?? '').toLowerCase().includes(phrase),
  );

const eventEnabled = (state: GameState, asset: AllStarAsset) => {
  const rules = state.leagueStats;
  if (asset.id === 'nba_draft') return !isNoDraftLeague(rules);
  if (asset.id === 'nba_cup') return rules.inSeasonTournament !== false;
  if (asset.id === 'nba_play_in') return rules.playIn !== false;
  if (asset.id === 'all_star_game' || asset.id === 'all_star_game_mvp' || asset.id === 'all_star_media_day') {
    return isAllStarGameEnabled(rules);
  }
  if (asset.id === 'all_star_saturday') {
    return isDunkContestEnabled(rules)
      || isThreePointContestEnabled(rules)
      || isSkillsChallengeEnabled(rules)
      || isShootingStarsEnabled(rules)
      || rules.allStarHorse === true;
  }
  if (asset.id === 'slam_dunk') return isDunkContestEnabled(rules);
  if (asset.id === 'three_point') return isThreePointContestEnabled(rules);
  if (asset.id === 'skills_challenge') return isSkillsChallengeEnabled(rules);
  if (asset.id === 'shooting_stars') return isShootingStarsEnabled(rules);
  if (asset.id === 'horse') return isAllStarGameEnabled(rules) && rules.allStarHorse === true;
  if (asset.id === 'rising_stars') return isRisingStarsEnabled(rules);
  if (asset.id === 'celebrity_game') return isCelebrityGameEnabled(rules);
  if (asset.id === 'halftime_show') {
    return isAllStarGameEnabled(rules) && (
      rules.hasAllStarHalftime === true
      || hasScheduledPerformance(state, 'all-star game halftime')
    );
  }
  if (asset.id === 'pregame_concert') {
    return isAllStarGameEnabled(rules) && hasScheduledPerformance(state, 'pregame');
  }
  return true;
};

const localizeLeagueAsset = (state: GameState, asset: AllStarAsset): AllStarAsset => {
  const uiMode = state.leagueStats.uiMode;
  const shouldLocalize = state.leagueType === 'fictional' || (uiMode != null && uiMode !== 'nba');
  if (!shouldLocalize) return asset;
  const leagueName = uiMode === 'pba_isolated'
    ? 'PBA'
    : state.leagueStats.leagueName ?? 'League';
  return {
    ...asset,
    name: asset.name.replace(/\bThe NBA\b|\bNBA\b/g, leagueName),
    namingTemplate: asset.namingTemplate.replace(/\bThe NBA\b|\bNBA\b/g, leagueName),
  };
};

export const getFranchiseEventAssets = (state: GameState): AllStarAsset[] => {
  const season = state.leagueStats.year;
  return [...ALL_STAR_ASSETS_CATALOG, ...EXTRA_ASSETS]
    .filter(asset =>
      season >= asset.firstYear
      && (asset.lastYear == null || season <= asset.lastYear)
      && !asset.inactiveYears.includes(season)
      && !(season === 1999 && asset.categoryGroup === 'All-Star Weekend Events'),
    )
    .filter(asset => eventEnabled(state, asset))
    .map(asset => localizeLeagueAsset(state, asset));
};

const normalizeSponsorName = (value: string) =>
  value
    .replace(/\s*\/\s*unbranded/gi, '')
    .replace(/\s+Motors$/i, '')
    .trim();

export const getEventSponsorBrand = (value: string): SponsorBrand | null => {
  const sponsorName = normalizeSponsorName(value);
  return MASTER_BRANDS_CATALOG.find(brand =>
    brand.name.toLowerCase() === sponsorName.toLowerCase()
    || brand.name.toLowerCase().includes(sponsorName.toLowerCase())
    || sponsorName.toLowerCase().includes(brand.name.toLowerCase()),
  ) ?? null;
};

const timelineIncludesSeason = (years: string, season: number) => {
  const normalized = years.replace(/[–—]/g, '-').toLowerCase();
  if (normalized.includes('onward') || normalized.includes('present')) {
    const start = Number(normalized.match(/\d{4}/)?.[0]);
    return Number.isFinite(start) && season >= start;
  }
  const decades = [...normalized.matchAll(/(\d{4})s/g)].map(match => Number(match[1]));
  if (decades.length >= 2) return season >= decades[0] && season <= decades[1] + 9;
  if (decades.length === 1) return season >= decades[0] && season <= decades[0] + 9;
  const numbers = [...normalized.matchAll(/\d{4}/g)].map(match => Number(match[0]));
  if (numbers.length >= 2) return season >= numbers[0] && season <= numbers[1];
  if (numbers.length === 1) return season === numbers[0];
  return false;
};

export const getHistoricalEventSponsor = (
  assetId: string,
  season: number,
): SponsorBrand | null => {
  const row = SPONSORSHIP_HISTORICAL_TIMELINES[assetId]
    ?.find(item => timelineIncludesSeason(item.years, season));
  if (!row || /^none/i.test(row.sponsor)) return null;
  const sponsorName = normalizeSponsorName(row.sponsor);
  return getEventSponsorBrand(sponsorName) ?? {
    id: sponsorName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    name: sponsorName,
    domain: '',
    industry: 'Historical Partner',
    tier: 2,
    startYear: season,
    preferredAssets: [assetId],
    budgetPerYear: 0,
    reputationRisk: 5,
    exclusivityRequirement: 'Exclusive Presenting Partner',
  };
};

export const getHistoricalEventAssignment = (
  assetId: string,
  season: number,
) => {
  const currentDeal = season === 2026
    ? CURRENT_2026_DEFAULT_DEALS.find(deal => deal.assetId === assetId)
    : undefined;
  if (currentDeal) {
    const brand = MASTER_BRANDS_CATALOG.find(item => item.id === currentDeal.sponsorId);
    return {
      brand: brand ?? null,
      sponsorName: currentDeal.sponsorName,
      sponsorDomain: currentDeal.sponsorDomain,
      industry: currentDeal.industry,
      annualValueUSD: currentDeal.annualPayout,
      startSeason: currentDeal.startYear,
      endSeason: currentDeal.endYear,
    };
  }
  const brand = getHistoricalEventSponsor(assetId, season);
  if (!brand) return null;
  return {
    brand,
    sponsorName: brand.name,
    sponsorDomain: brand.domain,
    industry: brand.industry,
    annualValueUSD: 0,
    startSeason: season,
    endSeason: season,
  };
};

export const getFranchiseEventEconomyScale = (state: GameState, season: number) => {
  const baseSeason = state.franchiseEconomyBaseSeason ?? state.leagueStats.year;
  const baseEconomy = Math.max(0.05, getSeasonEconomyIndex(state, baseSeason));
  const currentEconomy = Math.max(0.05, getSeasonEconomyIndex(state, season));
  return getEraMoneyMultiplier(baseSeason) * (currentEconomy / baseEconomy);
};

export const getAvailableEventBrands = (state: GameState): SponsorBrand[] => {
  const season = state.leagueStats.year;
  const localBrandMode = state.leagueType === 'fictional'
    || (state.leagueStats.uiMode != null && state.leagueStats.uiMode !== 'nba');
  if (localBrandMode) {
    return FICTIONAL_FRANCHISE_BRANDS.map((brand, index) => ({
      id: `fictional_${brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      name: brand.name,
      domain: '',
      industry: brand.category,
      tier: ((index % 8) < 2 ? 1 : (index % 8) < 5 ? 2 : 3) as 1 | 2 | 3,
      startYear: 1947,
      isFictional: true,
      preferredAssets: [],
      budgetPerYear: 24_000_000 - (index % 8) * 2_000_000,
      reputationRisk: 5,
      exclusivityRequirement: 'Exclusive Presenting Partner',
    }));
  }
  return MASTER_BRANDS_CATALOG.filter(brand =>
    season >= brand.startYear
    && (brand.endYear == null || season <= brand.endYear),
  );
};

export { getEraMoneyMultiplier };
export type { AllStarAsset, SponsorBrand };
