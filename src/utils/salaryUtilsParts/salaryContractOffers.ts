import type { NBAPlayer } from '../../types';
import { EXTERNAL_SALARY_SCALE } from '../../constants';
import { computeLocalPBASalaryUSD, getPBARosterEconomyConfig } from '../../services/externalRosterService.shared';
import { isPbaRosterLocal } from '../../services/pba/importManager';
import { getDisplayAge } from '../../store/playerRatingStore';
import { convertTo2KRating } from '../helpers';
import { resolvePotentialBbgm } from '../playerRatings';
import { areBirdRightsEnabled, isRookieExtensionEnabled, isSupermaxEnabled } from '../ruleFlags';
import { getNbaYearsOfService } from '../playerExperience';
import { getWnbaMinimumSalaryUSD } from '../../services/wnba/economy';

export type ContractTier = 'Superstar' | 'Star' | 'All-Star' | 'Starter' | 'Bench' | 'Charity';

export interface ContractOffer {
  salaryUSD: number;
  years: number;
  tier: ContractTier;
  hasPlayerOption: boolean;
}

const MAX_CONTRACT_PCT = [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.30, 0.30, 0.30, 0.35];
const MIN_CONTRACT_BASE_M = [1.273, 1.426, 1.598, 1.790, 2.006, 2.247, 2.518, 2.821, 3.161, 3.541, 3.967];
const BASE_CAP_M = 154.6;

function getPbaImportSalaryFloorUSD(salaryCapUSD: number, minSalaryUSD: number, maxSalaryUSD: number): number {
  return Math.max(
    Math.round(minSalaryUSD * 4),
    Math.round(maxSalaryUSD * 0.5),
    Math.round(salaryCapUSD * 0.16),
  );
}

function isPbaImportLike(player: NBAPlayer, leagueStats?: ContractLeagueStats): boolean {
  return leagueStats?.uiMode === 'pba_isolated' && !isPbaRosterLocal(player, leagueStats);
}

function isHistoricalRealPlayer(player: NBAPlayer): boolean {
  return typeof (player as any).srID === 'string' || typeof (player as any).slug === 'string';
}

function getContractSeason(leagueStats: ContractLeagueStats, player: NBAPlayer): number {
  const leagueYear = Number((leagueStats as any).year ?? 0);
  if (Number.isFinite(leagueYear) && leagueYear > 0) return leagueYear;
  return (player as any).stats?.reduce((m: number, s: any) => Math.max(m, Number(s?.season ?? 0)), 0) ?? 0;
}

function perGameValue(stat: any, key: string): number {
  const value = Number(stat?.[key] ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const gp = Math.max(1, Number(stat?.gp ?? 0));
  return value > gp * 2 ? value / gp : value;
}

function getRecentRegularSeasonSignal(player: NBAPlayer, season: number) {
  const row = [...((player as any).stats ?? [])]
    .filter((s: any) => !s?.playoffs && (s?.gp ?? 0) > 0 && (season <= 0 || Number(s?.season ?? 0) <= season))
    .sort((a: any, b: any) => Number(b?.season ?? 0) - Number(a?.season ?? 0))[0];
  if (!row) return { gp: 0, mpg: 0, weighted: 0 };
  const gp = Number(row.gp ?? 0);
  const mpg = perGameValue(row, 'min');
  const weighted = perGameValue(row, 'pts') + perGameValue(row, 'trb') * 0.7 + perGameValue(row, 'ast') * 0.7;
  return { gp, mpg, weighted };
}

export function getLateCareerMarketAdjustment(
  player: NBAPlayer,
  age: number,
  ovr: number,
  score: number,
  currentSeason: number,
  protectedMaxDeal = false,
): { multiplier: number; roleDeal: boolean } {
  if (age < 34 || protectedMaxDeal) return { multiplier: 1, roleDeal: false };

  const awards: Array<{ season: number; type: string }> = (player as any).awards ?? [];
  const hasRecentStarSignal = awards.some(a =>
    Number(a?.season ?? 0) >= currentSeason - 1 &&
    /mvp|most valuable|all.nba|all-league|all-star/i.test(String(a?.type ?? '')),
  );
  if (hasRecentStarSignal && (ovr >= 84 || score >= 84)) return { multiplier: 1, roleDeal: false };

  let multiplier =
    age >= 40 ? 0.36 :
    age >= 38 ? 0.44 :
    age >= 36 ? 0.58 :
    0.74;

  if (ovr >= 86 || score >= 86) multiplier += 0.10;
  else if (ovr >= 82 || score >= 82) multiplier += 0.06;
  else if (ovr >= 78 || score >= 78) multiplier += 0.03;

  const recent = getRecentRegularSeasonSignal(player, currentSeason);
  if (recent.weighted >= 24 || recent.mpg >= 30) multiplier += 0.18;
  else if (recent.weighted >= 18 || recent.mpg >= 24) multiplier += 0.11;
  else if (recent.weighted >= 12 || recent.mpg >= 18) multiplier += 0.05;
  if (recent.gp > 0 && recent.gp < 40) multiplier -= 0.08;

  const finalMultiplier = Math.max(0.32, Math.min(1, multiplier));
  return { multiplier: finalMultiplier, roleDeal: finalMultiplier < 0.88 };
}

export function getProductionMarketAdjustment(
  player: NBAPlayer,
  age: number,
  ovr: number,
  score: number,
  currentSeason: number,
  protectedMaxDeal = false,
): { multiplier: number; roleDeal: boolean } {
  if (age >= 34 || protectedMaxDeal) return { multiplier: 1, roleDeal: false };

  const recent = getRecentRegularSeasonSignal(player, currentSeason);
  let multiplier: number;
  if (recent.gp === 0) {
    multiplier = ovr >= 85 ? 0.82 : ovr >= 80 ? 0.68 : ovr >= 76 ? 0.55 : 0.42;
  } else if (recent.mpg < 15 || recent.weighted < 8) {
    multiplier = 0.52;
  } else if (recent.mpg < 22 || recent.weighted < 13) {
    multiplier = 0.68;
  } else if (recent.mpg < 28 || recent.weighted < 18) {
    multiplier = 0.84;
  } else {
    multiplier = 1;
  }

  if (recent.gp > 0 && recent.gp < 20) multiplier -= 0.06;
  const ratingFloor = score >= 90 ? 0.85 : score >= 85 ? 0.75 : score >= 80 ? 0.62 : score >= 76 ? 0.50 : 0.40;
  const finalMultiplier = Math.max(ratingFloor, Math.min(1, multiplier));
  return { multiplier: finalMultiplier, roleDeal: finalMultiplier < 0.80 };
}

function computePbaLocalContractOfferUSD(
  player: NBAPlayer,
  leagueStats: ContractLeagueStats,
  currentSeason: number,
): number {
  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  const pbaOvr = lastRating?.ovr ?? player.overallRating ?? 40;
  const economy = getPBARosterEconomyConfig(leagueStats, 'pba_isolated');
  return computeLocalPBASalaryUSD(pbaOvr, economy, player as any, currentSeason);
}

export type ContractLeagueStats = Pick<
  import('../../types').LeagueStats,
  | 'year'
  | 'salaryCap'
  | 'historicalContractScaleCap'
  | 'uiMode'
  | 'pbaLocalEligibilityMode'
  | 'minContractType'
  | 'minContractStaticAmount'
  | 'maxContractType'
  | 'maxContractStaticPercentage'
  | 'minContractLength'
  | 'maxContractLengthStandard'
  | 'maxContractLengthBird'
  | 'supermaxEnabled'
  | 'supermaxPercentage'
  | 'supermaxMinYears'
  | 'rookieExtEnabled'
  | 'rookieExtPct'
  | 'rookieExtRosePct'
  | 'rookieScaleType'
  | 'birdRightsEnabled'
  | 'playerOptionsEnabled'
  | 'salaryCapEnabled'
  | 'salaryCapType'
  | 'historicalEraStartYear'
  | 'historicalEconomyScale'
>;

function getContractScaleCapUSD(leagueStats: ContractLeagueStats): number {
  if (leagueStats.uiMode === 'pba_isolated') {
    return getPBARosterEconomyConfig(leagueStats, 'pba_isolated').salaryCapUSD;
  }
  const rawCap = Number(leagueStats.salaryCap ?? 0);
  if (Number.isFinite(rawCap) && rawCap > 0) {
    return rawCap > 1_000_000 ? rawCap : rawCap * 1_000_000;
  }
  const historicalBasis = Number((leagueStats as any).historicalContractScaleCap ?? 0);
  if (Number.isFinite(historicalBasis) && historicalBasis > 0) return historicalBasis;
  return BASE_CAP_M * 1_000_000;
}

export function isSupermaxAwardQualified(
  awards: Array<{ season: number; type: string }>,
  currentSeason: number,
  yearsOfService: number,
  minYears: number,
): boolean {
  if (yearsOfService < minYears) return false;
  if (awards.some(a => a.season >= currentSeason - 2 && /mvp|defensive player|dpoy/i.test(a.type))) return true;
  if (awards.some(a => a.season === currentSeason && /all.nba/i.test(a.type))) return true;
  const allNbaSeasons = new Set(
    awards.filter(a => a.season >= currentSeason - 2 && /all.nba/i.test(a.type)).map(a => a.season),
  );
  return allNbaSeasons.size >= 2;
}

export function computeContractOffer(
  player: NBAPlayer,
  leagueStats: ContractLeagueStats,
  moodTraits: string[] = [],
  moodScore: number = 0,
): ContractOffer {
  const salaryCapUSD = getContractScaleCapUSD(leagueStats);
  const capM = salaryCapUSD / 1_000_000;
  const playerCurrentSeason = getContractSeason(leagueStats, player);
  const yearsOfService = getNbaYearsOfService(player, playerCurrentSeason > 0 ? playerCurrentSeason : Number.POSITIVE_INFINITY);
  const svcIdx = Math.min(yearsOfService, 10);
  const playerAwards: Array<{ season: number; type: string }> = (player as any).awards ?? [];

  const birdRightsActive = areBirdRightsEnabled(leagueStats);
  const hasBirdRights = birdRightsActive && ((player as any).hasBirdRights ?? false);
  const supermaxEnabled = isSupermaxEnabled(leagueStats);
  const supermaxPct = (leagueStats.supermaxPercentage ?? 35) / 100;
  const supermaxMinYrs = leagueStats.supermaxMinYears ?? 8;
  let isSupermaxEligible: boolean;
  if ((player as any).superMaxEligible !== undefined) {
    isSupermaxEligible = supermaxEnabled && !!(player as any).superMaxEligible;
  } else {
    isSupermaxEligible = supermaxEnabled && hasBirdRights &&
      isSupermaxAwardQualified(playerAwards, playerCurrentSeason, yearsOfService, supermaxMinYrs);
  }

  const hasBirdRightsForRookieExt = hasBirdRights;
  const rookieExtEnabled = isRookieExtensionEnabled(leagueStats);
  const rookieExtPct = (leagueStats.rookieExtPct ?? 25) / 100;
  const rookieExtRosePct = (leagueStats.rookieExtRosePct ?? 30) / 100;
  const inRookieExtWindow = hasBirdRightsForRookieExt && yearsOfService >= 3 && yearsOfService <= 4;
  const rookieRoseQualified = inRookieExtWindow &&
    isSupermaxAwardQualified(playerAwards, playerCurrentSeason, yearsOfService, 3);

  const maxContractType = leagueStats.maxContractType ?? 'service_tiered';
  let maxContractUSD: number;
  if (isSupermaxEligible) {
    maxContractUSD = capM * supermaxPct * 1_000_000;
  } else if (rookieExtEnabled && inRookieExtWindow) {
    const pct = rookieRoseQualified ? rookieExtRosePct : rookieExtPct;
    maxContractUSD = capM * pct * 1_000_000;
  } else if (maxContractType === 'none') {
    maxContractUSD = salaryCapUSD * 0.45;
  } else if (maxContractType === 'service_tiered') {
    maxContractUSD = capM * MAX_CONTRACT_PCT[svcIdx] * 1_000_000;
  } else {
    const pct = (leagueStats.maxContractStaticPercentage ?? 25) / 100;
    maxContractUSD = capM * pct * 1_000_000;
  }

  let minSalaryUSD: number;
  if (leagueStats.uiMode === 'pba_isolated') {
    minSalaryUSD = getPBARosterEconomyConfig(leagueStats, 'pba_isolated').minSalaryUSD;
  } else if (leagueStats.uiMode === 'wnba_isolated') {
    minSalaryUSD = getWnbaMinimumSalaryUSD(playerCurrentSeason, yearsOfService);
  } else if ((leagueStats.minContractType ?? 'dynamic') === 'none') {
    minSalaryUSD = 0;
  } else if ((leagueStats.minContractType ?? 'dynamic') === 'dynamic') {
    minSalaryUSD = (MIN_CONTRACT_BASE_M[svcIdx] / BASE_CAP_M) * capM * 1_000_000;
  } else {
    minSalaryUSD = ((leagueStats.minContractStaticAmount ?? 1.273) as number) * 1_000_000;
  }

  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  const bbgmOvr = lastRating?.ovr ?? player.overallRating ?? 60;
  const hgtAttr = lastRating?.hgt ?? 50;
  const ovr = convertTo2KRating(bbgmOvr, hgtAttr);
  const age = getDisplayAge(player, playerCurrentSeason || new Date().getFullYear());
  const storedPot = Number(lastRating?.pot ?? (player as any).potential ?? bbgmOvr);
  const bbgmPot = isHistoricalRealPlayer(player)
    ? resolvePotentialBbgm(bbgmOvr, age, undefined)
    : (Number.isFinite(storedPot) ? storedPot : bbgmOvr);
  const pot = convertTo2KRating(bbgmPot, hgtAttr);
  const potWeight = age < 24 ? 0.65 : age < 28 ? 0.50 : age < 32 ? 0.35 : 0.20;
  const score = ovr * (1 - potWeight) + pot * potWeight;

  let tier: ContractTier;
  if (score >= 95) tier = 'Superstar';
  else if (score >= 90) tier = 'Star';
  else if (score >= 85) tier = 'All-Star';
  else if (score >= 78) tier = 'Starter';
  else if (score >= 72) tier = 'Bench';
  else tier = 'Charity';

  if (maxContractType === 'none' && !isSupermaxEligible && !(rookieExtEnabled && inRookieExtWindow)) {
    const noMaxMarketPct =
      score >= 95 ? 1.40 :
      score >= 90 ? 1.00 :
      score >= 85 ? 0.75 :
      score >= 78 ? 0.55 :
      0.45;
    maxContractUSD = Math.max(maxContractUSD, salaryCapUSD * noMaxMarketPct);
  }

  const normalised = Math.max(0, score - 68) / (99 - 68);
  let salaryUSD = (isSupermaxEligible || rookieRoseQualified)
    ? maxContractUSD
    : Math.max(minSalaryUSD, maxContractUSD * Math.pow(normalised, 1.3));

  if (moodTraits.includes('LOYAL')) {
    salaryUSD *= 0.92;
  } else if (moodTraits.includes('MERCENARY')) {
    salaryUSD *= 1.28;
  } else if (moodTraits.includes('COMPETITOR')) {
    salaryUSD *= 0.91;
  } else if (moodScore < -2) {
    salaryUSD *= 1.17;
  } else if (moodScore < 2) {
    salaryUSD *= 1.10;
  }

  const salaryStatus = leagueStats.uiMode === 'euro_isolated' && player.status === 'Free Agent'
    ? player.euroMarketSalaryStatus ?? player.status
    : player.status;
  const scale = EXTERNAL_SALARY_SCALE[salaryStatus ?? ''];
  const usesNbaMarket = !scale && leagueStats.uiMode !== 'pba_isolated' && !isPbaImportLike(player, leagueStats);
  const protectedMaxDeal = isSupermaxEligible || rookieRoseQualified;
  const productionMarket = usesNbaMarket
    ? getProductionMarketAdjustment(player, age, ovr, score, playerCurrentSeason, protectedMaxDeal)
    : { multiplier: 1, roleDeal: false };
  salaryUSD *= productionMarket.multiplier;
  const lateCareer = usesNbaMarket
    ? getLateCareerMarketAdjustment(player, age, ovr, score, playerCurrentSeason, isSupermaxEligible || rookieRoseQualified)
    : { multiplier: 1, roleDeal: false };
  salaryUSD *= lateCareer.multiplier;

  if (scale) {
    const externalPeakUSD = salaryCapUSD * scale.maxPct;
    salaryUSD = Math.min(salaryUSD, externalPeakUSD * 3);
  }
  if (isPbaImportLike(player, leagueStats)) {
    salaryUSD = Math.max(salaryUSD, getPbaImportSalaryFloorUSD(salaryCapUSD, minSalaryUSD, maxContractUSD));
  } else if (leagueStats.uiMode === 'pba_isolated') {
    salaryUSD = computePbaLocalContractOfferUSD(
      player,
      leagueStats,
      playerCurrentSeason || new Date().getFullYear(),
    );
  }
  salaryUSD = Math.max(minSalaryUSD, salaryUSD);

  let varSeed = 0;
  const pid = (player as any).internalId ?? '';
  for (let ci = 0; ci < pid.length; ci++) varSeed += pid.charCodeAt(ci);
  varSeed += yearsOfService * 37;
  const sinV = Math.abs((Math.sin(varSeed) * 10000) % 1);
  const plusOne = sinV > 0.5 ? 1 : 0;
  const lastSeasonStats = ((player as any).stats ?? []).filter((s: any) => !s.playoffs).at(-1);
  const injuryPenalty = (lastSeasonStats?.gp ?? 82) < 40 ? 1 : 0;
  const isEliteProspect = bbgmPot > 99 || pot >= 97;
  const minLengthRaw = Number(leagueStats.minContractLength ?? 1);
  const minLength = Number.isFinite(minLengthRaw) ? Math.max(1, minLengthRaw) : 1;
  const maxLengthSource = hasBirdRights
    ? (leagueStats.maxContractLengthBird ?? leagueStats.maxContractLengthStandard ?? 5)
    : (leagueStats.maxContractLengthStandard ?? 5);
  const maxLengthRaw = Number(maxLengthSource ?? 5);
  const maxLength = Math.max(minLength, Number.isFinite(maxLengthRaw) ? maxLengthRaw : 5);

  let years: number;
  if (isEliteProspect) years = 5;
  else if (ovr >= 85) years = 4 + plusOne;
  else if (ovr >= 76) years = 3 + plusOne;
  else if (ovr >= 70) years = 2 + plusOne;
  else years = 1 + plusOne;

  years = Math.max(1, years - injuryPenalty);
  if (moodScore < -2) years = Math.min(years, 2);
  if (maxLength > 5 && score >= 82 && !lateCareer.roleDeal) {
    const longEraBonus = score >= 92 ? 3 : score >= 86 ? 2 : 1;
    years = Math.min(maxLength, years + longEraBonus);
  }
  if (moodTraits.includes('LOYAL')) years = Math.min(years + 1, maxLength);
  years = Math.min(years, maxLength);
  if (lateCareer.roleDeal && age >= 39) years = Math.min(years, 1);
  else if (lateCareer.roleDeal && age >= 35) years = Math.min(years, 2);
  if (productionMarket.multiplier < 0.60) years = Math.min(years, 2);
  else if (productionMarket.roleDeal) years = Math.min(years, 3);
  years = Math.max(minLength, years);

  const optV = Math.abs((Math.cos(varSeed + 42) * 10000) % 1);
  const hasPlayerOption = leagueStats.playerOptionsEnabled !== false && (
    (ovr >= 85 && optV > 0.20) ||
    (ovr >= 76 && optV > 0.50)
  ) && !lateCareer.roleDeal && !productionMarket.roleDeal;

  return { salaryUSD, years, tier, hasPlayerOption };
}

export interface ExternalBuyout {
  applicable: boolean;
  estimatedBuyoutUSD: number;
  teamMaxContributionUSD: number;
  recommendedTeamContribUSD: number;
  playerContributionUSD: number;
  league: string;
}

const EXTERNAL_STATUSES = ['Euroleague', 'China CBA', 'NBL Australia', 'Endesa', 'B-League', 'PBA', 'G-League'] as const;
const BUYOUT_LEAGUE_MULT: Record<string, number> = {
  Euroleague: 1.00,
  'China CBA': 0.80,
  'NBL Australia': 0.60,
  Endesa: 0.55,
  'B-League': 0.45,
  PBA: 0.40,
  'G-League': 0.00,
};

export function computeExternalBuyout(
  player: NBAPlayer,
  leagueStats: ContractLeagueStats & { teamBuyoutMaxUSD?: number; year?: number },
): ExternalBuyout {
  const status = player.status ?? '';
  if (leagueStats.uiMode === 'pba_isolated' && status === 'PBA') {
    return { applicable: false, estimatedBuyoutUSD: 0, teamMaxContributionUSD: 0, recommendedTeamContribUSD: 0, playerContributionUSD: 0, league: status };
  }
  if (!(EXTERNAL_STATUSES as readonly string[]).includes(status)) {
    return { applicable: false, estimatedBuyoutUSD: 0, teamMaxContributionUSD: 0, recommendedTeamContribUSD: 0, playerContributionUSD: 0, league: status };
  }
  const mult = BUYOUT_LEAGUE_MULT[status] ?? 0.3;
  if (mult === 0) {
    return { applicable: false, estimatedBuyoutUSD: 0, teamMaxContributionUSD: 0, recommendedTeamContribUSD: 0, playerContributionUSD: 0, league: status };
  }
  const cap = getContractScaleCapUSD(leagueStats as any);
  const teamMaxContributionUSD = leagueStats.teamBuyoutMaxUSD ?? Math.round(cap * 0.00586);
  const marketOffer = computeContractOffer(player, leagueStats as any);
  const baseUSD = marketOffer.salaryUSD * mult;
  const estimatedBuyoutUSD = Math.max(100_000, Math.round(baseUSD / 10_000) * 10_000);
  const recommendedTeamContribUSD = Math.min(teamMaxContributionUSD, Math.round(estimatedBuyoutUSD * 0.5));
  return {
    applicable: true,
    estimatedBuyoutUSD,
    teamMaxContributionUSD,
    recommendedTeamContribUSD,
    playerContributionUSD: Math.max(0, estimatedBuyoutUSD - recommendedTeamContribUSD),
    league: status,
  };
}

export interface ContractLimits {
  minSalaryUSD: number;
  maxSalaryUSD: number;
  maxPct: number;
  isSupermaxEligible: boolean;
  isRookieExtEligible: boolean;
  rookieRoseQualified: boolean;
}

export function getContractLimits(
  player: NBAPlayer,
  leagueStats: ContractLeagueStats,
): ContractLimits {
  const salaryCapUSD = getContractScaleCapUSD(leagueStats);
  const capM = salaryCapUSD / 1_000_000;
  const currentSeason = getContractSeason(leagueStats, player);
  const yearsOfService = getNbaYearsOfService(player, currentSeason > 0 ? currentSeason : Number.POSITIVE_INFINITY);
  const svcIdx = Math.min(yearsOfService, 10);
  const birdRightsActive = areBirdRightsEnabled(leagueStats);
  const supermaxEnabled = isSupermaxEnabled(leagueStats);
  const supermaxPct = (leagueStats.supermaxPercentage ?? 35) / 100;
  const supermaxMinYrs = leagueStats.supermaxMinYears ?? 8;
  const awards: Array<{ season: number; type: string }> = (player as any).awards ?? [];
  const hasBirdRightsForSupermax = birdRightsActive && ((player as any).hasBirdRights ?? false);
  const cachedSupermax = (player as any).superMaxEligible === true;
  const freshSupermax = hasBirdRightsForSupermax &&
    isSupermaxAwardQualified(awards, currentSeason, yearsOfService, supermaxMinYrs);
  const isSupermaxEligible = supermaxEnabled && (cachedSupermax || freshSupermax);

  const rookieExtEnabled = isRookieExtensionEnabled(leagueStats);
  const rookieExtPct = (leagueStats.rookieExtPct ?? 25) / 100;
  const rookieExtRosePct = (leagueStats.rookieExtRosePct ?? 30) / 100;
  const inRookieExtWindow = hasBirdRightsForSupermax && yearsOfService >= 3 && yearsOfService <= 4;
  const rookieRoseQualified = inRookieExtWindow &&
    isSupermaxAwardQualified(awards, currentSeason, yearsOfService, 3);
  const isRookieExtEligible = rookieExtEnabled && inRookieExtWindow;

  const maxType = (leagueStats as any).maxContractType ?? 'service_tiered';
  let maxPct: number;
  let maxSalaryUSD: number;
  if (maxType === 'none') {
    maxPct = 1.5;
    maxSalaryUSD = salaryCapUSD * maxPct;
  } else if (isSupermaxEligible) {
    maxPct = supermaxPct;
    maxSalaryUSD = capM * supermaxPct * 1_000_000;
  } else if (isRookieExtEligible) {
    maxPct = rookieRoseQualified ? rookieExtRosePct : rookieExtPct;
    maxSalaryUSD = capM * maxPct * 1_000_000;
  } else if (maxType === 'service_tiered') {
    maxPct = MAX_CONTRACT_PCT[svcIdx];
    maxSalaryUSD = capM * maxPct * 1_000_000;
  } else {
    maxPct = ((leagueStats as any).maxContractStaticPercentage ?? 25) / 100;
    maxSalaryUSD = capM * maxPct * 1_000_000;
  }

  const minType = (leagueStats as any).minContractType ?? 'dynamic';
  const staticMinM = (leagueStats as any).minContractStaticAmount ?? 1.273;
  let minSalaryUSD: number;
  if (leagueStats.uiMode === 'pba_isolated') {
    minSalaryUSD = getPBARosterEconomyConfig(leagueStats, 'pba_isolated').minSalaryUSD;
  } else if (leagueStats.uiMode === 'wnba_isolated') {
    minSalaryUSD = getWnbaMinimumSalaryUSD(currentSeason, yearsOfService);
  } else if (minType === 'none') {
    minSalaryUSD = 0;
  } else if (minType === 'static') {
    minSalaryUSD = staticMinM * 1_000_000;
  } else {
    const baseM = MIN_CONTRACT_BASE_M[svcIdx];
    const yr0M = MIN_CONTRACT_BASE_M[0];
    minSalaryUSD = (baseM / BASE_CAP_M) * capM * (staticMinM / yr0M) * 1_000_000;
  }
  if (isPbaImportLike(player, leagueStats)) {
    minSalaryUSD = Math.max(minSalaryUSD, getPbaImportSalaryFloorUSD(salaryCapUSD, minSalaryUSD, maxSalaryUSD));
    maxSalaryUSD = Math.max(maxSalaryUSD, minSalaryUSD);
  }

  return { minSalaryUSD, maxSalaryUSD, maxPct, isSupermaxEligible, isRookieExtEligible, rookieRoseQualified };
}
