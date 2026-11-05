import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Heart, History, ShieldAlert, Wallet } from 'lucide-react';
import type { NBAPlayer } from '../../../types';
import { formatExternalSalary, isExternalLeagueStatus } from '../../../constants';
import {
  formatSalaryM,
  formatSalaryMPrecise,
  computeContractOffer,
  getCapThresholds,
  getTeamPayrollUSD,
  getContractLimits,
  getMLEAvailability,
  getBiannualExceptionAvailability,
  computeExternalBuyout,
  contractToUSD,
  hasBirdRights,
} from '../../../utils/salaryUtils';
import { normalizeDate, formatCurrencyWithCode, getLeagueCurrencyCode } from '../../../utils/helpers';
import { getCurrentOffseasonEffectiveFAStart, getGameDateParts } from '../../../utils/dateUtils';
import { getPlayerImage } from '../../central/view/bioCache';
import { loadPlayerRenders, getPlayerRender } from '../../../utils/playerRenders';
import { classifyResignIntent } from '../../central/view/PlayerBioMoraleTab';
import { computeMoodScore, normalizeMoodTraits } from '../../../utils/mood/moodScore';
import { useGame } from '../../../store/GameContext';
import { isPlausibleActiveMarket } from '../../../services/freeAgencyBidding';
import { getGMAttributes, clampSpendOffer } from '../../../services/staff/gmAttributes';
import { buildBudgetContext, projectYearEndCash } from '../../../services/tycoon/budgetEngine';
import { getDisplayAge, getDisplayOverall } from '../../../store/playerRatingStore';
import { canSignInCurrentPbaWindow, getEffectivePbaConference, getPbaImportOfferRange, hasNbaExperience, isPbaImportForTeam } from '../../../services/pba/importManager';
import { getSigningRosterLimit, getStandardRosterLimit, getTwoWayRosterLimit } from '../../../utils/rosterLimits';
import { areTwoWayContractsEnabled, isTwoWayContract } from '../../../utils/contractTypes';
import { getScoutedDisplayOverall } from '../../../utils/scoutingFuzz';
import { areBirdRightsEnabled } from '../../../utils/ruleFlags';
import type { ContractType, MleType, SigningModalBidSubmitted, SigningModalTabDefinition, TabType } from './SigningModalShared';
import type { SigningModalProps } from './SigningModalTypes';
import { isNbaTwoWayServiceEligible } from '../../../utils/playerExperience';
import {
  areWnbaDevelopmentalContractsEnabled,
  getWnbaDevelopmentalBaseStipendUSD,
  isWnbaDevelopmentalServiceEligible,
} from '../../../services/wnba/developmentalContracts';
import { applyColdMarketVeteranOfferFloor } from '../../../services/freeAgency/userOfferAcceptance';
import { getEuroSeniorRosterSigningGate } from '../../../services/freeAgency/euroRosterSigningGate';
import { isOnRoster } from '../../../utils/teamLookup';
import {
  computeSigningBonusInterestBoost,
  getSigningBonusStepEUR,
  recommendSigningBonusEUR,
} from '../../../services/transfer/interestModel';
import { getAvailableSigningSponsorPerks } from '../../../services/tycoon/sponsorPerkEngine';
import { isUnavailableInternationalTournamentPlayer } from '../../../utils/prospectUtils';
import {
  getAspireAmountStep,
  getAspireBrands,
  getAspireRisk,
  getAspireRoll,
  isAspireSigningEligible,
} from '../../../services/aspireSideDeals';
import { boostEurostashRightsInterest, getEurostashRightsTid } from '../../../services/freeAgency/eurostashRights';
import { isLeagueTrainingCampWindow } from '../../../services/leagueCalendar';

const ALL_TABS: SigningModalTabDefinition[] = [
  { id: 'NEGOTIATION', label: 'Negotiation', icon: DollarSign },
  { id: 'MORALE', label: 'Morale', icon: Heart },
  { id: 'CONTRACT', label: 'Contract', icon: History },
  { id: 'FINANCES', label: 'Finances', icon: Wallet },
  { id: 'OFFERS', label: 'Team Offers', icon: History },
];

const EURO_HIDDEN_TABS = new Set<TabType>(['FINANCES']);
const PEAK_FA_DAYS = 14;

function useHoldable(callback: () => void, disabled: boolean) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = React.useRef(160);
  const isHoldingRef = React.useRef(false);

  const run = React.useCallback(() => {
    if (disabled) return;
    isHoldingRef.current = true;
    callback();
    speedRef.current = Math.max(40, speedRef.current * 0.88);
    timerRef.current = setTimeout(run, speedRef.current);
  }, [callback, disabled]);

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    isHoldingRef.current = false;
    speedRef.current = 160;
    timerRef.current = setTimeout(run, 350);
  }, [disabled, run]);

  const onPointerUpOrLeave = React.useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onClick = React.useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    if (isHoldingRef.current) {
      e.preventDefault();
      e.stopPropagation();
    } else {
      callback();
    }
  }, [callback, disabled]);

  return {
    onPointerDown,
    onPointerUp: onPointerUpOrLeave,
    onPointerCancel: onPointerUpOrLeave,
    onClick,
  };
}

export function useSigningModalController({
  player,
  team,
  leagueStats,
  autoAccept = false,
  preflightMessage,
  initialContractType,
  onClose,
  onSign,
  onSubmitBid,
}: SigningModalProps) {
  const { state } = useGame() as any;
  const isOwnTeamGM = state.gameMode === 'gm' && team.id === state.userTeamId;
  const gmSpending = isOwnTeamGM ? getGMAttributes(state, team.id).spending : 75;
  const pbaIsolated = state.leagueStats?.uiMode === 'pba_isolated';
  const pbaConference = getEffectivePbaConference(state.leagueStats as any);
  const isPbaTeam = pbaIsolated && (state.nonNBATeams ?? []).some((t: any) => t.league === 'PBA' && Number(t.tid ?? t.id) === Number(team.id));
  const isPbaImportSigning = isPbaTeam && isPbaImportForTeam(player, team.id, pbaConference, leagueStats as any);
  const pbaSigningGate = useMemo(
    () => isPbaTeam
      ? canSignInCurrentPbaWindow(player, team.id, state)
      : { allowed: true as const, reason: undefined },
    [isPbaTeam, player, team.id, state],
  );

  const [activeTab, setActiveTab] = useState<TabType>('NEGOTIATION');
  const [contractType, setContractType] = useState<ContractType>('GUARANTEED');
  const [salary, setSalary] = useState(0);
  const [years, setYears] = useState(1);
  const [option, setOption] = useState<'NONE' | 'PLAYER' | 'TEAM'>('NONE');
  const [showResponse, setShowResponse] = useState(false);
  const [showAspireRoll, setShowAspireRoll] = useState(false);
  const [bidSubmitted, setBidSubmitted] = useState<SigningModalBidSubmitted | null>(null);
  const [selectedMleType, setSelectedMleType] = useState<MleType>(null);
  const [selectedBae, setSelectedBae] = useState(false);
  const [preflightOverridden, setPreflightOverridden] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showCapWarning, setShowCapWarning] = useState(false);
  const [pendingCashAck, setPendingCashAck] = useState<null | (() => void)>(null);
  const [rosterFullOverridden, setRosterFullOverridden] = useState(false);
  const [overLimitAction, setOverLimitAction] = useState<null | 'showResponse' | 'sign'>(null);
  const [guaranteedOverLimitApproved, setGuaranteedOverLimitApproved] = useState(false);
  const [teamBuyoutContribUSD, setTeamBuyoutContribUSD] = useState(0);
  const [signingBonusEUR, setSigningBonusEUR] = useState(0);
  const [selectedSponsorPerkKey, setSelectedSponsorPerkKey] = useState<string | null>(null);
  const aspireEligible = isAspireSigningEligible(state, team.id);
  const aspireBrands = useMemo(() => getAspireBrands(Number(leagueStats.year ?? 2026)), [leagueStats.year]);
  const [aspireBrand, setAspireBrand] = useState(() => aspireBrands[0]?.name ?? 'ACME');
  const [aspireAmountUSD, setAspireAmountUSD] = useState(0);
  const [rendersTick, setRendersTick] = useState(0);
  const [imgAllFailed, setImgAllFailed] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const thresholds = useMemo(() => getCapThresholds(leagueStats), [leagueStats]);
  const teamPayroll = useMemo(
    () => getTeamPayrollUSD(state.players, team.id, team, state.leagueStats?.year, leagueStats),
    [state.players, team, state.leagueStats?.year, leagueStats],
  );
  const currencyCode = getLeagueCurrencyCode(leagueStats);
  const money = (value: number) => pbaIsolated ? formatExternalSalary(value, 'PBA') : currencyCode === 'USD' ? formatSalaryM(value) : formatCurrencyWithCode(value, currencyCode, false);
  const moneyPrecise = (value: number, decimals = 2) => pbaIsolated ? formatExternalSalary(value, 'PBA') : currencyCode === 'USD' ? formatSalaryMPrecise(value, decimals) : formatCurrencyWithCode(value, currencyCode, false);
  const euroIsolated = state.leagueStats?.uiMode === 'euro_isolated';
  const sponsorCurrentYear = Number(leagueStats.year ?? state.leagueStats?.year ?? new Date().getFullYear());
  const sponsorSigningPerkChoices = useMemo(
    () => euroIsolated
      ? getAvailableSigningSponsorPerks(team.tycoon, sponsorCurrentYear, 'player', salary)
      : [],
    [euroIsolated, salary, sponsorCurrentYear, team.tycoon],
  );
  const selectedSponsorPerk = sponsorSigningPerkChoices.find(choice => choice.key === selectedSponsorPerkKey) ?? null;
  const playerOptionsEnabled = leagueStats?.playerOptionsEnabled !== false;
  const birdRightsAvailable = !euroIsolated && !pbaIsolated && areBirdRightsEnabled(leagueStats);
  const twoWayContractsAvailable = !euroIsolated && !pbaIsolated && areTwoWayContractsEnabled(leagueStats);
  const wnbaDevelopmentalContracts = areWnbaDevelopmentalContractsEnabled(leagueStats);
  const nonGuaranteedContractsAvailable = !euroIsolated && !pbaIsolated && leagueStats?.nonGuaranteedContractsEnabled !== false;
  const isTrainingCampPeriod = useMemo(() => {
    if (euroIsolated || !nonGuaranteedContractsAvailable || !state.date) return false;
    return state.offseasonChecklist?.freeAgency === 'in-progress'
      || isLeagueTrainingCampWindow(state.date, leagueStats);
  }, [state.date, state.offseasonChecklist?.freeAgency, leagueStats, nonGuaranteedContractsAvailable, euroIsolated]);
  const isActiveTwoWay = React.useCallback(
    (candidate: NBAPlayer) => twoWayContractsAvailable && isTwoWayContract(candidate, leagueStats),
    [twoWayContractsAvailable, leagueStats],
  );
  const sanitizeContractOption = React.useCallback(
    (value: 'NONE' | 'PLAYER' | 'TEAM'): 'NONE' | 'PLAYER' | 'TEAM' =>
      value === 'PLAYER' && !playerOptionsEnabled ? 'NONE' : value,
    [playerOptionsEnabled],
  );

  const roster = useMemo(() => {
    const isTrainingCamp = isTrainingCampPeriod;
    const onTeam = state.players.filter((p: NBAPlayer) => p.tid === team.id && isOnRoster(p));
    const twoWayCount = twoWayContractsAvailable ? onTeam.filter(isActiveTwoWay).length : 0;
    const standardCount = onTeam.length - twoWayCount;

    if (euroIsolated) {
      const euroRoster = getEuroSeniorRosterSigningGate(state.players, team.id, leagueStats);
      return {
        maxStandard: euroRoster.maxStandard,
        maxTwoWay: 0,
        maxTotal: euroRoster.maxStandard,
        standardCount: euroRoster.standardCount,
        twoWayCount: 0,
        standardFull: euroRoster.full,
        twoWayFull: true,
        totalFull: euroRoster.full,
      };
    }

    if (pbaIsolated) {
      const maxStandard = getStandardRosterLimit(leagueStats);
      const totalFull = !isPbaImportSigning && standardCount >= maxStandard;
      return {
        maxStandard,
        maxTwoWay: 0,
        maxTotal: maxStandard,
        standardCount,
        twoWayCount: 0,
        standardFull: totalFull,
        twoWayFull: true,
        totalFull,
      };
    }

    if (isTrainingCamp) {
      const campLimit = getSigningRosterLimit(leagueStats, true);
      const totalFull = onTeam.length >= campLimit;
      return {
        maxStandard: campLimit, maxTwoWay: twoWayContractsAvailable ? campLimit : 0, maxTotal: campLimit,
        standardCount, twoWayCount, standardFull: totalFull, twoWayFull: !twoWayContractsAvailable || totalFull, totalFull,
      };
    }

    const maxStandard = getStandardRosterLimit(leagueStats);
    const maxTwoWay = twoWayContractsAvailable ? getTwoWayRosterLimit(leagueStats) : 0;
    const standardFull = standardCount >= maxStandard;
    const twoWayFull = maxTwoWay <= 0 || twoWayCount >= maxTwoWay;
    return {
      maxStandard, maxTwoWay, maxTotal: maxStandard + maxTwoWay,
      standardCount, twoWayCount, standardFull, twoWayFull, totalFull: standardFull && twoWayFull,
    };
  }, [state.players, team.id, leagueStats, euroIsolated, pbaIsolated, isPbaImportSigning, twoWayContractsAvailable, isActiveTwoWay, isTrainingCampPeriod]);

  const guaranteedCount = useMemo(
    () => state.players.filter((p: NBAPlayer) =>
      p.tid === team.id &&
      isOnRoster(p) &&
      !isActiveTwoWay(p) &&
      (!nonGuaranteedContractsAvailable || !(p as any).nonGuaranteed) &&
      (((p.contract as any)?.type ?? 'GUARANTEED') === 'GUARANTEED')
    ).length,
    [state.players, team.id, isActiveTwoWay, nonGuaranteedContractsAvailable],
  );
  const maxGuaranteed = roster.maxStandard;

  const isResign = player.tid === team.id;
  const priorNbaTid = useMemo(() => {
    const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
    const sorted = stats
      .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
      .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
    return sorted[0]?.tid ?? -1;
  }, [player]);
  const teamHoldsBirdRights = birdRightsAvailable && !isResign && priorNbaTid === team.id && hasBirdRights(player);
  const hasOwnTeamBirdRights = birdRightsAvailable && ((isResign && hasBirdRights(player)) || teamHoldsBirdRights);
  const playerForLimits = useMemo(
    () => (hasOwnTeamBirdRights ? { ...player, hasBirdRights: true } as NBAPlayer : player),
    [player, hasOwnTeamBirdRights],
  );
  const limits = useMemo(() => getContractLimits(playerForLimits, leagueStats), [playerForLimits, leagueStats]);
  const pbaImportOfferRange = useMemo(
    () => isPbaImportSigning ? getPbaImportOfferRange(player, leagueStats as any, pbaConference) : null,
    [isPbaImportSigning, player, leagueStats, pbaConference],
  );
  const initialOffer = useMemo(() => {
    const base = computeContractOffer(playerForLimits, leagueStats);
    if (pbaImportOfferRange) return { ...base, salaryUSD: pbaImportOfferRange.marketSalaryUSD, years: 1, hasPlayerOption: false };
    if (hasOwnTeamBirdRights && (limits.isSupermaxEligible || limits.isRookieExtEligible)) return { ...base, salaryUSD: limits.maxSalaryUSD };
    if (hasOwnTeamBirdRights && base.salaryUSD <= limits.minSalaryUSD * 1.05 && limits.maxSalaryUSD > limits.minSalaryUSD * 5) {
      return { ...base, salaryUSD: Math.round(limits.maxSalaryUSD * 0.85) };
    }
    return base;
  }, [playerForLimits, leagueStats, pbaImportOfferRange, hasOwnTeamBirdRights, limits.isSupermaxEligible, limits.isRookieExtEligible, limits.maxSalaryUSD, limits.minSalaryUSD]);
  const mle = useMemo(() => {
    if (pbaIsolated) {
      return { blocked: true, available: 0, limit: 0, used: 0, type: null };
    }
    const base = getMLEAvailability(team.id, teamPayroll, salary, thresholds, leagueStats);
    if (base.blocked || !base.type) return base;
    const reservedFromOtherMarketsUSD = ((state.faBidding?.markets ?? []) as any[])
      .filter(m => !m?.resolved && m?.playerId !== player.internalId)
      .reduce((sum, market) => {
        const topMine = (market.bids ?? [])
          .filter((b: any) => b.teamId === team.id && b.status === 'active' && b.fundingSource === 'mle')
          .sort((a: any, b: any) => (b.salaryUSD ?? 0) - (a.salaryUSD ?? 0))[0];
        return sum + (topMine?.salaryUSD ?? 0);
      }, 0);
    const netAvailable = Math.max(0, base.available - reservedFromOtherMarketsUSD);
    const netUsed = Math.min(base.limit, base.used + reservedFromOtherMarketsUSD);
    return {
      ...base,
      used: netUsed,
      available: netAvailable,
      blocked: netAvailable <= 0,
    };
  }, [pbaIsolated, team.id, teamPayroll, salary, thresholds, leagueStats, state.faBidding?.markets, player.internalId]);
  const bae = useMemo(() => {
    if (euroIsolated || pbaIsolated || isResign) {
      return {
        enabled: false,
        blocked: true,
        reasonCode: 'disabled' as const,
        reason: isResign
          ? 'The bi-annual exception is for new free-agent contracts, not extensions.'
          : 'The bi-annual exception is not active in this league.',
        limit: 0,
        used: 0,
        available: 0,
        hardCapLevel: null,
      };
    }
    const contractSeasons = Math.max(1, Math.floor(years)) + (sanitizeContractOption(option) === 'NONE' ? 0 : 1);
    const base = getBiannualExceptionAvailability({
      teamId: team.id,
      payrollUSD: teamPayroll,
      contractSeasons,
      acquisitionType: 'signing',
      season: Number(leagueStats.year),
      currentDate: state.date,
      schedule: state.schedule,
      thresholds,
      leagueStats,
    });
    const reservedFromOtherMarketsUSD = ((state.faBidding?.markets ?? []) as any[])
      .filter(market => !market?.resolved && market?.playerId !== player.internalId)
      .reduce((sum, market) => {
        const topMine = (market.bids ?? [])
          .filter((bid: any) => (
            bid.teamId === team.id
            && bid.status === 'active'
            && bid.fundingSource === 'biannual'
          ))
          .sort((a: any, b: any) => (b.salaryUSD ?? 0) - (a.salaryUSD ?? 0))[0];
        return sum + (topMine?.salaryUSD ?? 0);
      }, 0);
    const available = Math.max(0, base.available - reservedFromOtherMarketsUSD);
    return {
      ...base,
      used: Math.min(base.limit, base.used + reservedFromOtherMarketsUSD),
      available,
      blocked: base.blocked || available <= 0,
    };
  }, [
    contractType,
    euroIsolated,
    isResign,
    leagueStats,
    option,
    pbaIsolated,
    player.internalId,
    state.date,
    state.faBidding?.markets,
    state.schedule,
    team.id,
    teamPayroll,
    thresholds,
    years,
  ]);

  const playerK2 = useMemo(() => {
    return getDisplayOverall(player);
  }, [player]);
  const twoWaySalaryUSD = useMemo(
    () => wnbaDevelopmentalContracts
      ? getWnbaDevelopmentalBaseStipendUSD(leagueStats)
      : Math.round(limits.minSalaryUSD * 0.5),
    [leagueStats, limits.minSalaryUSD, wnbaDevelopmentalContracts],
  );

  const seasonYear = leagueStats?.year ?? new Date().getUTCFullYear();
  const realAge = getDisplayAge(player, seasonYear);
  const scoutedPlayerOverall = useMemo(
    () => getScoutedDisplayOverall(state, player, seasonYear),
    [state, player, seasonYear],
  );

  const isTwoWayCandidate = useMemo(() => {
    if (realAge <= 0 || playerK2 > 76) return false;
    const serviceEligible = wnbaDevelopmentalContracts
      ? isWnbaDevelopmentalServiceEligible(player, seasonYear, leagueStats)
      : isNbaTwoWayServiceEligible(player, seasonYear);
    if (!serviceEligible) return false;
    let prob: number;
    if (realAge <= 19) prob = 0.95;
    else if (realAge <= 22) prob = 0.65 + (22 - realAge) * 0.10;
    else if (realAge <= 25) prob = 0.30 + (25 - realAge) * 0.117;
    else if (realAge <= 28) prob = 0.10 + (28 - realAge) * 0.067;
    else prob = 0.03;
    let seed = 0;
    const id = player.internalId ?? '';
    for (let i = 0; i < id.length; i++) seed += id.charCodeAt(i);
    const roll = Math.abs(Math.sin(seed) * 10000) % 1;
    return roll < prob;
  }, [realAge, player.internalId, playerK2, player, seasonYear, wnbaDevelopmentalContracts, leagueStats]);

  const canOfferTwoWay = useMemo(() => {
    if (!twoWayContractsAvailable || playerK2 > 76) return false;
    return wnbaDevelopmentalContracts
      ? isWnbaDevelopmentalServiceEligible(player, seasonYear, leagueStats)
      : isNbaTwoWayServiceEligible(player, seasonYear);
  }, [player, playerK2, seasonYear, twoWayContractsAvailable, wnbaDevelopmentalContracts, leagueStats]);

  const minAllowed = isPbaImportSigning
    ? (pbaImportOfferRange?.minSalaryUSD ?? 0)
    : contractType === 'TWO_WAY' ? twoWaySalaryUSD : limits.minSalaryUSD;
  const maxAllowed = isPbaImportSigning
    ? (pbaImportOfferRange?.maxSalaryUSD ?? limits.maxSalaryUSD)
    : contractType === 'TWO_WAY' ? twoWaySalaryUSD : contractType === 'NON_GUARANTEED' ? limits.minSalaryUSD * 3 : limits.maxSalaryUSD;

  const powerRanking = useMemo(() => {
    const ranked = [...state.teams].sort((a: any, b: any) => {
      const aGp = a.wins + a.losses;
      const bGp = b.wins + b.losses;
      const aPct = aGp > 0 ? a.wins / aGp : (a.strength ?? 50) / 100;
      const bPct = bGp > 0 ? b.wins / bGp : (b.strength ?? 50) / 100;
      return bPct - aPct;
    });
    const idx = ranked.findIndex((t: any) => t.id === team.id);
    return idx >= 0 ? idx + 1 : 16;
  }, [state.teams, team.id]);

  const marketSize = Math.min(100, Math.max(0, (team.pop ?? 2.5) * 10));
  const nbaTeamIds = useMemo<Set<number>>(() => new Set(state.teams.map(candidate => Number(candidate.id))), [state.teams]);
  const ownsEurostashRights = getEurostashRightsTid(player, nbaTeamIds) === team.id;
  const buyout = useMemo(() => {
    const externalBuyout = computeExternalBuyout(player, leagueStats);
    return ownsEurostashRights
      ? {
          ...externalBuyout,
          applicable: false,
          estimatedBuyoutUSD: 0,
          recommendedTeamContribUSD: 0,
          playerContributionUSD: 0,
        }
      : externalBuyout;
  }, [player, leagueStats, ownsEurostashRights]);
  useEffect(() => {
    setTeamBuyoutContribUSD(buyout.recommendedTeamContribUSD);
  }, [buyout.recommendedTeamContribUSD]);

  const competingInterest = useMemo(() => {
    let seed = 0;
    const id = player.internalId ?? '';
    for (let i = 0; i < id.length; i++) seed += id.charCodeAt(i);
    const noise = ((Math.sin(seed) + 1) * 0.5) * 30;
    const k2 = playerK2;
    if (buyout.applicable) {
      const base = 40 + (k2 - 60) * 1.3;
      const ageBump = realAge < 24 ? 12 : realAge >= 31 ? -8 : 0;
      const motherTeam = (state.nonNBATeams ?? []).find((t: any) => t.tid === player.tid && t.league === player.status);
      const prestigeBump = motherTeam ? Math.min(25, Math.round(((motherTeam as any).pop ?? 1) * 3.5)) : 0;
      return Math.max(15, Math.min(100, Math.round(base + ageBump + prestigeBump + noise * 0.3)));
    }
    const base = 15 + (k2 - 60) * 2.1;
    const ageBump = realAge >= 27 && realAge <= 30 ? 10 : realAge >= 35 ? -15 : 0;
    return Math.max(0, Math.min(100, Math.round(base + ageBump + noise * 0.4)));
  }, [player.internalId, playerK2, realAge, buyout.applicable, player.tid, player.status, state.nonNBATeams]);

  const resignIntent = useMemo(() => {
    const traitsNorm = normalizeMoodTraits((player as any).moodTraits ?? []);
    const { score } = computeMoodScore(
      player,
      team,
      state.date,
      false,
      false,
      false,
      state.players.filter((p: NBAPlayer) => p.tid === player.tid),
      leagueStats?.year,
    );
    const gp = (team.wins ?? 0) + (team.losses ?? 0);
    const winPct = gp > 0 ? (team.wins ?? 0) / gp : 0.5;
    return classifyResignIntent(player, traitsNorm, score, leagueStats?.year ?? new Date().getFullYear(), winPct);
  }, [player, team, state.date, state.players, leagueStats?.year]);

  const activeMarket = useMemo(() => {
    if (pbaIsolated) {
      return state.pbaLocalFreeAgency?.markets?.find((market: any) =>
        market.playerId === player.internalId && !market.resolved,
      );
    }
    return state.faBidding?.markets?.find((market: any) =>
      market.playerId === player.internalId && isPlausibleActiveMarket(market as any, state, player),
    );
  }, [pbaIsolated, state.pbaLocalFreeAgency?.markets, state.faBidding?.markets, player.internalId]);
  const hasActiveMarket = !!activeMarket;
  const hasSubmittedUserBid = !!activeMarket?.bids?.some((bid: any) => bid.isUserBid);
  const activeCompetingOffers = useMemo(
    () => (activeMarket?.bids ?? []).filter((bid: any) => bid.status === 'active' && bid.teamId !== team.id).length,
    [activeMarket, team.id],
  );
  const isPeakFA = useMemo(() => {
    const dateStr = normalizeDate(state.date ?? '');
    if (!dateStr) return false;
    const faStart = getCurrentOffseasonEffectiveFAStart(`${dateStr}T00:00:00Z`, leagueStats, state.schedule as any);
    const peakEnd = new Date(faStart.getTime() + PEAK_FA_DAYS * 86_400_000);
    const current = new Date(`${dateStr}T00:00:00Z`);
    return current >= faStart && current < peakEnd;
  }, [state.date, leagueStats]);
  const isResignFromOwnTeam = player.tid === team.id;
  const pbaLocalBiddingMode = pbaIsolated
    && !isUnavailableInternationalTournamentPlayer(player)
    && !!onSubmitBid
    && !autoAccept
    && !isResignFromOwnTeam
    && !isPbaImportSigning
    && player.tid === -1
    && player.status === 'Free Agent'
    && state.gameMode === 'gm';
  const nbaBiddingMode = !euroIsolated
    && !pbaIsolated
    && !isUnavailableInternationalTournamentPlayer(player)
    && !!onSubmitBid
    && !autoAccept
    && !isResignFromOwnTeam
    && player.tid < 0
    && state.gameMode === 'gm';
  const shouldSubmitBid = pbaLocalBiddingMode || (nbaBiddingMode && (hasActiveMarket || isPeakFA));
  const showOffersTab = pbaLocalBiddingMode || (!euroIsolated && !pbaIsolated && (hasActiveMarket || isPeakFA));
  const projectedCashAfterDeal = useMemo(() => {
    if (!euroIsolated || pbaIsolated || !(team as any).tycoon || contractType === 'TWO_WAY') return null;
    const projected = projectYearEndCash(
      team,
      buildBudgetContext(state, team.id),
      salary,
      state.players,
    );
    return projected - signingBonusEUR - (buyout.applicable ? teamBuyoutContribUSD : 0);
  }, [euroIsolated, pbaIsolated, team, contractType, salary, state, signingBonusEUR, buyout.applicable, teamBuyoutContribUSD]);

  const tabs = useMemo(() => {
    let result = showOffersTab ? ALL_TABS : ALL_TABS.filter(t => t.id !== 'OFFERS');
    if (aspireEligible) result = [result[0], { id: 'ASPIRE', label: 'ASPIRE', icon: ShieldAlert }, ...result.slice(1)];
    if (euroIsolated || pbaIsolated) result = result.filter(t => !EURO_HIDDEN_TABS.has(t.id));
    return result;
  }, [showOffersTab, aspireEligible, euroIsolated, pbaIsolated]);

  const minContractYears = Math.max(1, Number(leagueStats?.minContractLength ?? 1));
  const maxContractYears = Math.max(
    minContractYears,
    Number(hasOwnTeamBirdRights
      ? (leagueStats?.maxContractLengthBird ?? leagueStats?.maxContractLengthStandard ?? 5)
      : (leagueStats?.maxContractLengthStandard ?? 5)),
  );
  const clampYearsForType = React.useCallback((value: number, type: ContractType) => {
    if (isPbaImportSigning) return 1;
    if (type === 'TWO_WAY') return Math.max(1, Math.min(2, Math.floor(value)));
    if (type === 'NON_GUARANTEED') return 1;
    return Math.max(minContractYears, Math.min(maxContractYears, Math.floor(value)));
  }, [isPbaImportSigning, maxContractYears, minContractYears]);

  useEffect(() => {
    if (!showOffersTab && activeTab === 'OFFERS') setActiveTab('NEGOTIATION');
    if ((euroIsolated || pbaIsolated) && EURO_HIDDEN_TABS.has(activeTab)) setActiveTab('NEGOTIATION');
  }, [showOffersTab, activeTab, euroIsolated, pbaIsolated]);

  useEffect(() => {
    if (!playerOptionsEnabled && option === 'PLAYER') setOption('NONE');
  }, [playerOptionsEnabled, option]);

  const initedForPlayerRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (initedForPlayerRef.current === player.internalId) return;
    initedForPlayerRef.current = player.internalId;
    const hasBirdBypass = hasOwnTeamBirdRights;
    const forcedTwoWay = canOfferTwoWay && !hasBirdBypass && roster.standardFull && !roster.twoWayFull;
    const forcedGuaranteed = !hasBirdBypass && roster.twoWayFull && !roster.standardFull;
    let chosenType: ContractType;
    if (euroIsolated || pbaIsolated) chosenType = 'GUARANTEED';
    else if (forcedGuaranteed) chosenType = 'GUARANTEED';
    else if (forcedTwoWay) chosenType = 'TWO_WAY';
    else if (initialContractType === 'TWO_WAY' && canOfferTwoWay) chosenType = 'TWO_WAY';
    else if (initialContractType && initialContractType !== 'TWO_WAY') chosenType = initialContractType;
    else if (hasBirdBypass) chosenType = 'GUARANTEED';
    else if (canOfferTwoWay && isTwoWayCandidate) chosenType = 'TWO_WAY';
    else chosenType = 'GUARANTEED';
    setContractType(chosenType);
    if (chosenType === 'TWO_WAY') {
      setSalary(twoWaySalaryUSD);
      setYears(2);
      setOption('NONE');
      setSigningBonusEUR(0);
    } else if (isPbaImportSigning) {
      setSalary(Math.min(maxAllowed, Math.max(minAllowed, initialOffer.salaryUSD)));
      setYears(1);
      setOption('NONE');
      setSigningBonusEUR(0);
    } else {
      const seeded = isOwnTeamGM ? clampSpendOffer(initialOffer.salaryUSD, gmSpending, limits.maxSalaryUSD) : initialOffer.salaryUSD;
      const initialSalary = Math.min(limits.maxSalaryUSD, Math.max(limits.minSalaryUSD, seeded));
      const initialYears = clampYearsForType(initialOffer.years, chosenType);
      setSalary(initialSalary);
      setYears(initialYears);
      setOption((euroIsolated || pbaIsolated) ? 'NONE' : sanitizeContractOption(initialOffer.hasPlayerOption ? 'PLAYER' : 'NONE'));
      setSigningBonusEUR(euroIsolated ? recommendSigningBonusEUR(initialSalary, initialYears) : 0);
    }
  }, [player.internalId, isTwoWayCandidate, canOfferTwoWay, twoWaySalaryUSD, initialOffer, limits.minSalaryUSD, limits.maxSalaryUSD, roster.standardFull, roster.twoWayFull, initialContractType, isOwnTeamGM, gmSpending, euroIsolated, pbaIsolated, hasOwnTeamBirdRights, isPbaImportSigning, minAllowed, maxAllowed, clampYearsForType, sanitizeContractOption]);

  const contractTypeInitedRef = React.useRef(false);
  useEffect(() => {
    if (!contractTypeInitedRef.current) { contractTypeInitedRef.current = true; return; }
    if ((euroIsolated || pbaIsolated) && contractType !== 'GUARANTEED') {
      setContractType('GUARANTEED');
      return;
    }
    if (contractType === 'TWO_WAY' && !canOfferTwoWay) {
      setContractType('GUARANTEED');
      return;
    }
    if (contractType === 'TWO_WAY') {
      setSalary(twoWaySalaryUSD);
      setYears(y => (y > 2 ? 2 : y));
      setOption('NONE');
    } else if (contractType === 'NON_GUARANTEED') {
      const discounted = Math.max(limits.minSalaryUSD, Math.min(limits.minSalaryUSD * 3, Math.round(initialOffer.salaryUSD * 0.60)));
      setSalary(discounted);
      setYears(1);
      setOption('NONE');
    } else if (isPbaImportSigning) {
      setSalary(Math.min(maxAllowed, Math.max(minAllowed, initialOffer.salaryUSD)));
      setYears(1);
      setOption('NONE');
    } else {
      const seeded = isOwnTeamGM ? clampSpendOffer(initialOffer.salaryUSD, gmSpending, limits.maxSalaryUSD) : initialOffer.salaryUSD;
      setSalary(Math.min(limits.maxSalaryUSD, Math.max(limits.minSalaryUSD, seeded)));
      setYears(clampYearsForType(initialOffer.years, contractType));
      setOption((euroIsolated || pbaIsolated) ? 'NONE' : sanitizeContractOption(initialOffer.hasPlayerOption ? 'PLAYER' : 'NONE'));
    }
  }, [contractType, canOfferTwoWay, euroIsolated, pbaIsolated, initialOffer.salaryUSD, initialOffer.years, initialOffer.hasPlayerOption, limits.minSalaryUSD, limits.maxSalaryUSD, isOwnTeamGM, gmSpending, twoWaySalaryUSD, isPbaImportSigning, minAllowed, maxAllowed, clampYearsForType, sanitizeContractOption]);

  const portraitFallback = useMemo(
    () => getPlayerImage(player, { preferCanonicalNbaPortrait: true, portraitSeason: seasonYear }),
    [player, seasonYear],
  );
  useEffect(() => {
    let cancelled = false;
    loadPlayerRenders().then(() => { if (!cancelled) setRendersTick(t => t + 1); });
    return () => { cancelled = true; };
  }, []);
  const fullBodyRender = useMemo(() => getPlayerRender(player.name), [player.name, rendersTick]);
  useEffect(() => { setImgAllFailed(false); }, [fullBodyRender, portraitFallback]);

  const playerFace = (player as any).face;
  const teamColors = team.colors?.length === 3 ? (team.colors as [string, string, string]) : undefined;
  const aspireRiskBasisUSD = leagueStats.salaryCapEnabled === false || leagueStats.salaryCapType === 'none'
    ? initialOffer.salaryUSD
    : maxAllowed;
  const aspireRisk = aspireEligible ? getAspireRisk(aspireAmountUSD, aspireRiskBasisUSD) : 0;
  const aspireAmountStep = getAspireAmountStep(aspireRiskBasisUSD);
  const personalWealthUSD = Math.max(0, Number(state.stats?.personalWealth ?? 0) * 1_000_000);
  const aspireCanAfford = aspireAmountUSD <= personalWealthUSD;
  const aspireRoll = getAspireRoll(state, player.internalId, aspireBrand, aspireAmountUSD);
  const selectedAspireSideDeal = aspireEligible && aspireAmountUSD > 0 ? {
    sponsor: aspireBrand,
    amountUSD: aspireAmountUSD,
    risk: aspireRisk,
    roll: aspireRoll,
    riskBasisUSD: aspireRiskBasisUSD,
  } : undefined;

  const { interest, uncappedInterest } = useMemo(() => {
    if (isPbaImportSigning && pbaImportOfferRange) {
      const ratio = pbaImportOfferRange.marketSalaryUSD > 0 ? salary / pbaImportOfferRange.marketSalaryUSD : 0;
      const starResistance = Math.max(0, playerK2 - 76) * 2.2;
      const nbaPull = hasNbaExperience(player) ? (playerK2 >= 84 ? 14 + (playerK2 - 84) * 0.8 : 5) : 0;
      const contenderBump = powerRanking <= 4 ? 10 : powerRanking <= 8 ? 6 : powerRanking <= 12 ? 3 : 0;
      const marketBump = marketSize >= 70 ? 6 : marketSize <= 30 ? -6 : 0;
      let base = 74 + (ratio - 1) * 70 - starResistance - nbaPull + contenderBump + marketBump;
      const traits = player.moodTraits || [];
      if (traits.includes('$' as any) || traits.includes('GREEDY' as any) || traits.includes('MERCENARY')) base += (ratio - 1) * 20;
      if (traits.includes('FAME')) base += marketSize >= 70 ? 8 : marketSize <= 30 ? -8 : 0;
      if (traits.includes('COMPETITOR') || traits.includes('WINNER' as any)) base += contenderBump - 3;
      const rawUncapped = Math.round(base);
      const cappedUI = Math.min(100, Math.max(0, rawUncapped));
      return { interest: cappedUI, uncappedInterest: rawUncapped };
    }
    const salaryDiffPct = ((salary - initialOffer.salaryUSD) / initialOffer.salaryUSD) * 100;
    const yearsPenalty = isPbaImportSigning ? 0 : Math.abs(years - initialOffer.years) * -8;
    const signingBonusBoost = euroIsolated
      ? computeSigningBonusInterestBoost(signingBonusEUR + (selectedSponsorPerk?.equivalentAnnualValueEUR ?? 0), salary)
      : 0;
    let base = 65 + salaryDiffPct * 0.5 + yearsPenalty + signingBonusBoost + aspireRisk * 0.35 + (!euroIsolated && !pbaIsolated ? (option === 'PLAYER' ? 15 : option === 'TEAM' ? -15 : 0) : 0);
    const traits = player.moodTraits || [];
    if (traits.includes('FAME')) {
      if (isExternalLeagueStatus(player.status)) base += 40;
      if (marketSize >= 70) base += 20;
      else if (marketSize <= 30) base -= 20;
    }
    if (traits.includes('LOYAL') || traits.includes('LOYALTY' as any)) {
      const isSameTeam = player.tid === team.id || ((player.draft as any)?.tid === team.id);
      if (isSameTeam) base += 40;
    }
    if (traits.includes('$' as any) || traits.includes('GREEDY' as any) || traits.includes('MERCENARY')) {
      if (salary < maxAllowed) base -= 10;
      const overMarketPct = Math.max(0, ((salary - initialOffer.salaryUSD) / initialOffer.salaryUSD) * 100);
      base += Math.max(-20, -20 + (overMarketPct * 4));
    }
    if (traits.includes('COMPETITOR') || traits.includes('WINNER' as any)) {
      if (powerRanking < 16) base += Math.max(0, 20 * ((16 - powerRanking) / 15));
    }
    if (resignIntent === 'testing_market') base -= 25;
    else if (resignIntent === 'ready_to_extend') base += 15;
    else if (resignIntent === 'farewell') base -= 60;
    base = boostEurostashRightsInterest(base, player, team.id, new Set(state.teams.map(candidate => candidate.id)));
    const rawUncapped = Math.round(base);
    const adjustedInterest = applyColdMarketVeteranOfferFloor({
      activeCompetingOffers,
      age: realAge,
      baseInterest: rawUncapped,
      contractType,
      displayOverall: playerK2,
      minSalaryUSD: limits.minSalaryUSD,
      salaryUSD: salary,
      years,
    });
    const cappedUI = Math.min(100, Math.max(0, adjustedInterest));
    if (contractType === 'TWO_WAY' && isTwoWayCandidate) return { interest: 100, uncappedInterest: 100 };
    return { interest: cappedUI, uncappedInterest: adjustedInterest };
  }, [salary, years, option, signingBonusEUR, selectedSponsorPerk, aspireRisk, initialOffer, player.moodTraits, player.tid, player, team.id, marketSize, powerRanking, maxAllowed, isTwoWayCandidate, resignIntent, player.status, euroIsolated, pbaIsolated, isPbaImportSigning, pbaImportOfferRange, playerK2, activeCompetingOffers, realAge, contractType, limits.minSalaryUSD, state.teams]);

  const yearsTable = useMemo(() => {
    const total = option !== 'NONE' ? years + 1 : years;
    const baseYear = leagueStats.year + (isResign ? 1 : 0);
    return Array.from({ length: total }).map((_, i) => {
      const targetYear = baseYear + i;
      const committed = state.players
        .filter((p: NBAPlayer) =>
          p.tid === team.id &&
          !isActiveTwoWay(p) &&
          (p.contract?.exp ?? baseYear) >= targetYear &&
          !(isResign && p.internalId === player.internalId)
        )
        .reduce((sum: number, p: NBAPlayer) => sum + contractToUSD(p.contract?.amount || 0), 0);
      const newSalary = salary * Math.pow(1.05, i);
      return { year: targetYear, salary: newSalary, capRoom: thresholds.salaryCap - (committed + newSalary) };
    });
  }, [salary, years, option, thresholds, leagueStats.year, state.players, team.id, isResign, player.internalId, isActiveTwoWay]);

  const formattedYears = isPbaImportSigning ? 'Conference' : option !== 'NONE' ? `${years}+1` : String(years);
  const interestColor = interest < 40 ? '#f43f5e' : interest < 70 ? '#f59e0b' : '#22c55e';

  const SALARY_STEP = isPbaImportSigning ? Math.max(5_000, Math.round(maxAllowed / 200 / 5_000) * 5_000) : pbaIsolated ? 5_000 : 100_000;
  const decSalaryProps = useHoldable(() => setSalary(v => Math.max(minAllowed, v - SALARY_STEP)), contractType === 'TWO_WAY' || salary <= minAllowed);
  const incSalaryProps = useHoldable(() => setSalary(v => Math.min(maxAllowed, v + SALARY_STEP)), contractType === 'TWO_WAY' || salary >= maxAllowed);
  const decYearsProps = useHoldable(() => setYears(v => clampYearsForType(v - 1, contractType)), isPbaImportSigning);
  const incYearsProps = useHoldable(() => setYears(v => clampYearsForType(v + 1, contractType)), isPbaImportSigning);
  const decOptionProps = useHoldable(() => setOption(v => {
    const current = sanitizeContractOption(v);
    if (!playerOptionsEnabled) return current === 'NONE' ? 'TEAM' : 'NONE';
    return current === 'NONE' ? 'TEAM' : current === 'PLAYER' ? 'NONE' : 'PLAYER';
  }), contractType === 'TWO_WAY' || isPbaImportSigning);
  const incOptionProps = useHoldable(() => setOption(v => {
    const current = sanitizeContractOption(v);
    if (!playerOptionsEnabled) return current === 'NONE' ? 'TEAM' : 'NONE';
    return current === 'NONE' ? 'PLAYER' : current === 'PLAYER' ? 'TEAM' : 'NONE';
  }), contractType === 'TWO_WAY' || isPbaImportSigning);
  const signingBonusStepEUR = getSigningBonusStepEUR(salary);
  const recommendedSigningBonusEUR = recommendSigningBonusEUR(salary, years);
  const decSigningBonusProps = useHoldable(
    () => setSigningBonusEUR(value => Math.max(0, value - signingBonusStepEUR)),
    !euroIsolated || signingBonusEUR <= 0,
  );
  const incSigningBonusProps = useHoldable(
    () => setSigningBonusEUR(value => Math.min(Number.MAX_SAFE_INTEGER, value + signingBonusStepEUR)),
    !euroIsolated,
  );

  const needsGuaranteedOverLimitConfirm = !euroIsolated
    && contractType === 'GUARANTEED'
    && !isResign
    && !teamHoldsBirdRights
    && !isPbaImportSigning
    && guaranteedCount >= maxGuaranteed
    && !guaranteedOverLimitApproved;
  const submitSigning = (
    skipOverLimitConfirm = false,
    mleTypeOverride: 'room' | 'non_taxpayer' | 'taxpayer' | null = selectedMleType,
    useBaeOverride = selectedBae,
    skipAspireRoll = false,
  ) => {
    if (!skipOverLimitConfirm && needsGuaranteedOverLimitConfirm) {
      setOverLimitAction('sign');
      return;
    }
    const fitsMLE = !euroIsolated && !pbaIsolated && !!mle && !mle.blocked && salary > 0 && salary <= mle.available;
    const fitsBAE = !euroIsolated && !pbaIsolated && !bae.blocked && salary > 0 && salary <= bae.available;
    const finalOption = sanitizeContractOption(option);
    if (aspireAmountUSD > 0 && !aspireCanAfford) {
      setToast('Insufficient personal funds for the ASPIRE agreement.');
      return;
    }
    if (aspireEligible && aspireAmountUSD > 0 && !skipAspireRoll) {
      setShowAspireRoll(true);
      return;
    }
    const executeSigning = () => onSign({
      salary,
      years: clampYearsForType(years, contractType),
      option: (euroIsolated || pbaIsolated) ? 'NONE' : finalOption,
      twoWay: contractType === 'TWO_WAY',
      nonGuaranteed: contractType === 'NON_GUARANTEED',
      mleType: (useBaeOverride || euroIsolated || pbaIsolated || contractType === 'TWO_WAY' || contractType === 'NON_GUARANTEED' || !fitsMLE) ? null : mleTypeOverride,
      useBiannualException: !!useBaeOverride && fitsBAE && contractType === 'GUARANTEED',
      teamBuyoutContribUSD: euroIsolated && buyout.applicable ? teamBuyoutContribUSD : 0,
      signingBonusEUR: euroIsolated ? signingBonusEUR : 0,
      sponsorSigningPerk: euroIsolated && selectedSponsorPerk ? {
        sponsor: selectedSponsorPerk.sponsor,
        perkId: selectedSponsorPerk.perk.id,
        label: selectedSponsorPerk.perk.label,
        season: sponsorCurrentYear,
        equivalentAnnualValueEUR: selectedSponsorPerk.equivalentAnnualValueEUR,
      } : undefined,
      aspireSideDeal: selectedAspireSideDeal,
    });
    if (euroIsolated && projectedCashAfterDeal != null && projectedCashAfterDeal < 0) {
      setPendingCashAck(() => executeSigning);
      return;
    }
    executeSigning();
  };
  const requestPlayerResponse = (useMle = false, useBae = false) => {
    setSelectedMleType(useMle ? (mle?.type ?? null) : null);
    setSelectedBae(useBae);
    if (needsGuaranteedOverLimitConfirm) {
      setOverLimitAction('showResponse');
      return;
    }
    setShowResponse(true);
  };

  const isFreeAgencySeason = useMemo(() => {
    const { month: mo } = state.date ? getGameDateParts(state.date) : getGameDateParts(new Date());
    return (mo >= 7 && mo <= 9) || mo >= 10 || mo <= 2;
  }, [state.date]);

  useEffect(() => {
    if (!euroIsolated && !pbaIsolated && roster.totalFull && !rosterFullOverridden && isFreeAgencySeason && teamPayroll < thresholds.salaryCap) {
      setRosterFullOverridden(true);
    }
  }, [euroIsolated, pbaIsolated, roster.totalFull, rosterFullOverridden, isFreeAgencySeason, teamPayroll, thresholds.salaryCap]);

  const handleMleSubmit = () => {
    setSelectedMleType(mle?.type ?? null);
    setSelectedBae(false);
    if (shouldSubmitBid && onSubmitBid) {
      const finalOption = sanitizeContractOption(option);
      const submittedYears = clampYearsForType(years, contractType) + (finalOption === 'NONE' ? 0 : 1);
      onSubmitBid({
        salary,
        years: submittedYears,
        option: finalOption,
        fundingSource: 'mle',
        mleType: mle?.type ?? null,
        aspireSideDeal: selectedAspireSideDeal,
      });
      setBidSubmitted({ salary, years: submittedYears, option: finalOption });
      return;
    }
    if (autoAccept) submitSigning(false, mle?.type ?? null);
    else requestPlayerResponse(true);
  };

  const handleBaeSubmit = () => {
    setSelectedMleType(null);
    setSelectedBae(true);
    if (shouldSubmitBid && onSubmitBid) {
      const finalOption = sanitizeContractOption(option);
      const submittedYears = clampYearsForType(years, contractType) + (finalOption === 'NONE' ? 0 : 1);
      onSubmitBid({
        salary,
        years: submittedYears,
        option: finalOption,
        fundingSource: 'biannual',
        aspireSideDeal: selectedAspireSideDeal,
      });
      setBidSubmitted({ salary, years: submittedYears, option: finalOption });
      return;
    }
    if (autoAccept) submitSigning(false, null, true);
    else requestPlayerResponse(false, true);
  };

  const handlePrimarySubmit = () => {
    setSelectedMleType(null);
    setSelectedBae(false);
    if (shouldSubmitBid && onSubmitBid) {
      const finalOption = sanitizeContractOption(option);
      const submittedYears = clampYearsForType(years, contractType) + (finalOption === 'NONE' ? 0 : 1);
      onSubmitBid({
        salary,
        years: submittedYears,
        option: finalOption,
        fundingSource: 'standard',
        aspireSideDeal: selectedAspireSideDeal,
      });
      setBidSubmitted({ salary, years: submittedYears, option: finalOption });
      return;
    }
    if (autoAccept) submitSigning();
    else requestPlayerResponse(false);
  };

  const capWarningStartYear = leagueStats.year + (isResign ? 1 : 0);
  const capWarningCommittedAtStartYear = state.players
    .filter((p: NBAPlayer) =>
      p.tid === team.id &&
      !isActiveTwoWay(p) &&
      (p.contract?.exp ?? capWarningStartYear) >= capWarningStartYear &&
      !(isResign && p.internalId === player.internalId)
    )
    .reduce((sum: number, p: NBAPlayer) => sum + contractToUSD(p.contract?.amount || 0), 0);
  const capWarningProjectedPayroll = capWarningCommittedAtStartYear + salary;
  const capWarningOverBy = capWarningProjectedPayroll - thresholds.salaryCap;
  const totalBuyoutPaidUSD = buyout.applicable ? teamBuyoutContribUSD + Math.max(0, buyout.estimatedBuyoutUSD - teamBuyoutContribUSD) : 0;
  const motherTeamWillRelease = !buyout.applicable || (() => {
    const ratio = buyout.estimatedBuyoutUSD > 0 ? totalBuyoutPaidUSD / buyout.estimatedBuyoutUSD : 1;
    return ratio >= Math.max(0.5, competingInterest / 100);
  })();
  const motherTeam = showResponse && !motherTeamWillRelease
    ? (state.nonNBATeams ?? []).find((t: any) => t.tid === player.tid && t.league === player.status) ?? null
    : null;

  return {
    activeTab,
    aspireAmountStep,
    aspireAmountUSD,
    aspireBrand,
    aspireBrands,
    aspireCanAfford,
    aspireEligible,
    aspireRisk,
    aspireRoll,
    autoAccept,
    bidSubmitted,
    bae,
    buyout,
    canOfferTwoWay,
    capWarningOverBy,
    capWarningProjectedPayroll,
    competingInterest,
    contractType,
    decOptionProps,
    decSalaryProps,
    decSigningBonusProps,
    decYearsProps,
    euroIsolated,
    formattedYears,
    fullBodyRender,
    gmSpending,
    handleMleSubmit,
    handleBaeSubmit,
    handlePrimarySubmit,
    hasOwnTeamBirdRights,
    hasSubmittedUserBid,
    imgAllFailed,
    incOptionProps,
    incSalaryProps,
    incSigningBonusProps,
    incYearsProps,
    initialOffer,
    interest,
    interestColor,
    isOwnTeamGM,
    isPbaImportSigning,
    isResign,
    isTrainingCampPeriod,
    leagueStats,
    limits,
    maxAllowed,
    maxGuaranteed,
    minAllowed,
    mle,
    money,
    moneyPrecise,
    personalWealthUSD,
    motherTeam,
    motherTeamWillRelease,
    guaranteedCount,
    needsGuaranteedOverLimitConfirm,
    onClose,
    option,
    overLimitAction,
    pendingCashAck,
    pbaIsolated,
    player,
    playerFace,
    portraitFallback,
    preflightMessage,
    preflightOverridden,
    projectedCashAfterDeal,
    pbaSigningGate,
    realAge,
    rendersTick,
    roster,
    rosterFullOverridden,
    salary,
    signingBonusEUR,
    selectedSponsorPerkKey,
    setSelectedSponsorPerkKey,
    signingBonusStepEUR,
    recommendedSigningBonusEUR,
    scoutedPlayerOverall,
    seasonYear,
    selectedMleType,
    setActiveTab,
    setAspireAmountUSD,
    setAspireBrand,
    setBidSubmitted,
    setContractType,
    setGuaranteedOverLimitApproved,
    setImgAllFailed,
    setOverLimitAction,
    setPendingCashAck,
    setPreflightOverridden,
    setRosterFullOverridden,
    setSelectedMleType,
    setShowCapWarning,
    setShowAspireRoll,
    setShowResponse,
    setTeamBuyoutContribUSD,
    showCapWarning,
    showAspireRoll,
    showResponse,
    shouldSubmitBid,
    state,
    tabs,
    team,
    teamBuyoutContribUSD,
    teamColors,
    teamHoldsBirdRights,
    teamPayroll,
    thresholds,
    toast,
    totalBuyoutPaidUSD,
    uncappedInterest,
    yearsTable,
    submitSigning,
  };
}
