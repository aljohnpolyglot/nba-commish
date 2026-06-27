import type { NBAPlayer } from '../../types';
import { EXTERNAL_SALARY_SCALE } from '../../constants';
import { computeLocalPBASalaryUSD, getPBARosterEconomyConfig } from '../../services/externalRosterService.shared';
import { isPbaRosterLocal } from '../../services/pba/importManager';
import { getDisplayAge } from '../../store/playerRatingStore';
import { convertTo2KRating } from '../helpers';

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
  if (leagueStats?.uiMode === 'pba_isolated') return !isPbaRosterLocal(player, leagueStats);
  if ((player as any).status !== 'PBA') return false;
  const born = (player as any).born ?? {};
  const nationality = String((born as any).country ?? (player as any).nationality ?? '').toLowerCase();
  const loc = String((born as any).loc ?? '').toLowerCase();
  return !nationality.includes('philippines') && !loc.includes('philippines');
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
  | 'salaryCap'
  | 'uiMode'
  | 'pbaLocalEligibilityMode'
  | 'minContractType'
  | 'minContractStaticAmount'
  | 'maxContractType'
  | 'maxContractStaticPercentage'
  | 'minContractLength'
  | 'maxContractLengthStandard'
  | 'supermaxEnabled'
  | 'supermaxPercentage'
  | 'supermaxMinYears'
  | 'rookieExtEnabled'
  | 'rookieExtPct'
  | 'rookieExtRosePct'
>;

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
  const salaryCapUSD = leagueStats.salaryCap ?? (BASE_CAP_M * 1_000_000);
  const capM = salaryCapUSD / 1_000_000;
  const yearsOfService = (player as any).stats
    ? (player as any).stats.filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length
    : 0;
  const svcIdx = Math.min(yearsOfService, 10);
  const playerAwards: Array<{ season: number; type: string }> = (player as any).awards ?? [];
  const playerCurrentSeason = (player as any).stats?.reduce((m: number, s: any) => Math.max(m, s.season ?? 0), 0) ?? 0;

  const supermaxEnabled = leagueStats.supermaxEnabled ?? true;
  const supermaxPct = (leagueStats.supermaxPercentage ?? 35) / 100;
  const supermaxMinYrs = leagueStats.supermaxMinYears ?? 8;
  let isSupermaxEligible: boolean;
  if ((player as any).superMaxEligible !== undefined) {
    isSupermaxEligible = supermaxEnabled && !!(player as any).superMaxEligible;
  } else {
    const hasBirdRights = (player as any).hasBirdRights ?? false;
    isSupermaxEligible = supermaxEnabled && hasBirdRights &&
      isSupermaxAwardQualified(playerAwards, playerCurrentSeason, yearsOfService, supermaxMinYrs);
  }

  const hasBirdRightsForRookieExt = (player as any).hasBirdRights ?? false;
  const rookieExtEnabled = leagueStats.rookieExtEnabled ?? true;
  const rookieExtPct = (leagueStats.rookieExtPct ?? 25) / 100;
  const rookieExtRosePct = (leagueStats.rookieExtRosePct ?? 30) / 100;
  const inRookieExtWindow = hasBirdRightsForRookieExt && yearsOfService >= 3 && yearsOfService <= 4;
  const rookieRoseQualified = inRookieExtWindow &&
    isSupermaxAwardQualified(playerAwards, playerCurrentSeason, yearsOfService, 3);

  let maxContractUSD: number;
  if (isSupermaxEligible) {
    maxContractUSD = capM * supermaxPct * 1_000_000;
  } else if (rookieExtEnabled && inRookieExtWindow) {
    const pct = rookieRoseQualified ? rookieExtRosePct : rookieExtPct;
    maxContractUSD = capM * pct * 1_000_000;
  } else if ((leagueStats.maxContractType ?? 'service_tiered') === 'service_tiered') {
    maxContractUSD = capM * MAX_CONTRACT_PCT[svcIdx] * 1_000_000;
  } else {
    const pct = (leagueStats.maxContractStaticPercentage ?? 25) / 100;
    maxContractUSD = capM * pct * 1_000_000;
  }

  let minSalaryUSD: number;
  if ((leagueStats.minContractType ?? 'dynamic') === 'dynamic') {
    minSalaryUSD = (MIN_CONTRACT_BASE_M[svcIdx] / BASE_CAP_M) * capM * 1_000_000;
  } else {
    minSalaryUSD = ((leagueStats.minContractStaticAmount ?? 1.273) as number) * 1_000_000;
  }

  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  const bbgmOvr = lastRating?.ovr ?? player.overallRating ?? 60;
  const bbgmPot = lastRating?.pot ?? bbgmOvr;
  const hgtAttr = lastRating?.hgt ?? 50;
  const ovr = convertTo2KRating(bbgmOvr, hgtAttr);
  const pot = convertTo2KRating(bbgmPot, hgtAttr);
  const age = getDisplayAge(player, playerCurrentSeason || new Date().getFullYear());
  const potWeight = age < 24 ? 0.65 : age < 28 ? 0.50 : age < 32 ? 0.35 : 0.20;
  const score = ovr * (1 - potWeight) + pot * potWeight;

  let tier: ContractTier;
  if (score >= 95) tier = 'Superstar';
  else if (score >= 90) tier = 'Star';
  else if (score >= 85) tier = 'All-Star';
  else if (score >= 78) tier = 'Starter';
  else if (score >= 72) tier = 'Bench';
  else tier = 'Charity';

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

  const scale = EXTERNAL_SALARY_SCALE[(player as any).status ?? ''];
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

  let years: number;
  if (isEliteProspect) years = 5;
  else if (ovr >= 85) years = 4 + plusOne;
  else if (ovr >= 76) years = 3 + plusOne;
  else if (ovr >= 70) years = 2 + plusOne;
  else years = 1 + plusOne;

  years = Math.max(1, years - injuryPenalty);
  if (moodScore < -2) years = Math.min(years, 2);
  if (moodTraits.includes('LOYAL')) years = Math.min(years + 1, 5);
  years = Math.min(years, leagueStats.maxContractLengthStandard ?? 5);
  years = Math.max(leagueStats.minContractLength ?? 1, years);

  const optV = Math.abs((Math.cos(varSeed + 42) * 10000) % 1);
  const hasPlayerOption =
    (ovr >= 85 && optV > 0.20) ||
    (ovr >= 76 && optV > 0.50);

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
  if (!(EXTERNAL_STATUSES as readonly string[]).includes(status)) {
    return { applicable: false, estimatedBuyoutUSD: 0, teamMaxContributionUSD: 0, recommendedTeamContribUSD: 0, playerContributionUSD: 0, league: status };
  }
  const mult = BUYOUT_LEAGUE_MULT[status] ?? 0.3;
  if (mult === 0) {
    return { applicable: false, estimatedBuyoutUSD: 0, teamMaxContributionUSD: 0, recommendedTeamContribUSD: 0, playerContributionUSD: 0, league: status };
  }
  const cap = leagueStats.salaryCap ?? 154_647_000;
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
  const salaryCapUSD = leagueStats.salaryCap ?? (BASE_CAP_M * 1_000_000);
  const capM = salaryCapUSD / 1_000_000;
  const yearsOfService = (player as any).stats
    ? (player as any).stats.filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length
    : 0;
  const svcIdx = Math.min(yearsOfService, 10);
  const supermaxEnabled = leagueStats.supermaxEnabled ?? true;
  const supermaxPct = (leagueStats.supermaxPercentage ?? 35) / 100;
  const supermaxMinYrs = leagueStats.supermaxMinYears ?? 8;
  const awards: Array<{ season: number; type: string }> = (player as any).awards ?? [];
  const currentSeason = (player as any).stats?.reduce((m: number, s: any) => Math.max(m, s.season ?? 0), 0) ?? 0;
  const hasBirdRightsForSupermax = (player as any).hasBirdRights ?? false;
  const cachedSupermax = (player as any).superMaxEligible === true;
  const freshSupermax = hasBirdRightsForSupermax &&
    isSupermaxAwardQualified(awards, currentSeason, yearsOfService, supermaxMinYrs);
  const isSupermaxEligible = supermaxEnabled && (cachedSupermax || freshSupermax);

  const rookieExtEnabled = leagueStats.rookieExtEnabled ?? true;
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
    maxPct = 1;
    maxSalaryUSD = salaryCapUSD * 10;
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
  if (minType === 'none') {
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
