import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Heart, History, Wallet } from 'lucide-react';
import type { NBAPlayer } from '../../../types';
import {
  formatSalaryM,
  formatSalaryMPrecise,
  computeContractOffer,
  getCapThresholds,
  getTeamPayrollUSD,
  getContractLimits,
  getMLEAvailability,
  computeExternalBuyout,
  contractToUSD,
  hasBirdRights,
} from '../../../utils/salaryUtils';
import { normalizeDate, convertTo2KRating, formatCurrencyWithCode, getLeagueCurrencyCode } from '../../../utils/helpers';
import { getCurrentOffseasonEffectiveFAStart, getGameDateParts } from '../../../utils/dateUtils';
import { getPlayerImage } from '../../central/view/bioCache';
import { loadPlayerRenders, getPlayerRender } from '../../../utils/playerRenders';
import { classifyResignIntent } from '../../central/view/PlayerBioMoraleTab';
import { computeMoodScore, normalizeMoodTraits } from '../../../utils/mood/moodScore';
import { useGame } from '../../../store/GameContext';
import { isPlausibleActiveMarket } from '../../../services/freeAgencyBidding';
import { getGMAttributes, clampSpendOffer } from '../../../services/staff/gmAttributes';
import { projectYearEndCash } from '../../../services/tycoon/budgetEngine';
import { getDisplayAge } from '../../../store/playerRatingStore';
import { getEffectivePbaConference, getPbaImportConferenceSalary, isPbaImportForTeam } from '../../../services/pba/importManager';
import type { ContractType, MleType, SigningModalBidSubmitted, SigningModalTabDefinition, TabType } from './SigningModalShared';
import type { SigningModalProps } from './SigningModalTypes';

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

  const [activeTab, setActiveTab] = useState<TabType>('NEGOTIATION');
  const [contractType, setContractType] = useState<ContractType>('GUARANTEED');
  const [salary, setSalary] = useState(0);
  const [years, setYears] = useState(1);
  const [option, setOption] = useState<'NONE' | 'PLAYER' | 'TEAM'>('NONE');
  const [showResponse, setShowResponse] = useState(false);
  const [bidSubmitted, setBidSubmitted] = useState<SigningModalBidSubmitted | null>(null);
  const [selectedMleType, setSelectedMleType] = useState<MleType>(null);
  const [preflightOverridden, setPreflightOverridden] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showCapWarning, setShowCapWarning] = useState(false);
  const [pendingCashAck, setPendingCashAck] = useState<null | (() => void)>(null);
  const [rosterFullOverridden, setRosterFullOverridden] = useState(false);
  const [overLimitAction, setOverLimitAction] = useState<null | 'showResponse' | 'sign'>(null);
  const [teamBuyoutContribUSD, setTeamBuyoutContribUSD] = useState(0);
  const [rendersTick, setRendersTick] = useState(0);
  const [imgAllFailed, setImgAllFailed] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const thresholds = useMemo(() => getCapThresholds(leagueStats), [leagueStats]);
  const teamPayroll = useMemo(() => getTeamPayrollUSD(state.players, team.id, team, state.leagueStats?.year), [state.players, team, state.leagueStats?.year]);
  const currencyCode = getLeagueCurrencyCode(leagueStats);
  const money = (value: number) => currencyCode === 'USD' ? formatSalaryM(value) : formatCurrencyWithCode(value, currencyCode, false);
  const moneyPrecise = (value: number, decimals = 2) => currencyCode === 'USD' ? formatSalaryMPrecise(value, decimals) : formatCurrencyWithCode(value, currencyCode, false);
  const euroIsolated = state.leagueStats?.uiMode === 'euro_isolated';

  const roster = useMemo(() => {
    const { month: mo, day: dy } = state.date ? getGameDateParts(state.date) : getGameDateParts(new Date());
    const isTrainingCamp = (mo >= 7 && mo <= 9) || (mo === 10 && dy <= 21);
    const onTeam = state.players.filter((p: NBAPlayer) => p.tid === team.id);
    const twoWayCount = euroIsolated ? 0 : onTeam.filter((p: NBAPlayer) => (p as any).twoWay).length;
    const standardCount = onTeam.length - twoWayCount;

    if (euroIsolated) {
      return {
        maxStandard: Math.max(99, standardCount), maxTwoWay: 0, maxTotal: Math.max(99, standardCount),
        standardCount, twoWayCount, standardFull: false, twoWayFull: true, totalFull: false,
      };
    }

    if (isTrainingCamp) {
      const campLimit = leagueStats?.maxTrainingCampRoster ?? 21;
      const totalFull = onTeam.length >= campLimit;
      return {
        maxStandard: campLimit, maxTwoWay: campLimit, maxTotal: campLimit,
        standardCount, twoWayCount, standardFull: totalFull, twoWayFull: totalFull, totalFull,
      };
    }

    const maxStandard = leagueStats?.maxStandardPlayersPerTeam ?? 15;
    const maxTwoWay = leagueStats?.maxTwoWayPlayersPerTeam ?? 3;
    const standardFull = standardCount >= maxStandard;
    const twoWayFull = twoWayCount >= maxTwoWay;
    return {
      maxStandard, maxTwoWay, maxTotal: maxStandard + maxTwoWay,
      standardCount, twoWayCount, standardFull, twoWayFull, totalFull: standardFull && twoWayFull,
    };
  }, [state.players, team.id, leagueStats, state.date, euroIsolated]);

  const guaranteedCount = useMemo(
    () => state.players.filter((p: NBAPlayer) =>
      p.tid === team.id &&
      !(p as any).twoWay &&
      !(p as any).nonGuaranteed &&
      (((p.contract as any)?.type ?? 'GUARANTEED') === 'GUARANTEED')
    ).length,
    [state.players, team.id],
  );

  const isResign = player.tid === team.id;
  const priorNbaTid = useMemo(() => {
    const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
    const sorted = stats
      .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
      .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
    return sorted[0]?.tid ?? -1;
  }, [player]);
  const teamHoldsBirdRights = !isResign && priorNbaTid === team.id && hasBirdRights(player);
  const hasOwnTeamBirdRights = (isResign && hasBirdRights(player)) || teamHoldsBirdRights;
  const playerForLimits = useMemo(
    () => (hasOwnTeamBirdRights ? { ...player, hasBirdRights: true } as NBAPlayer : player),
    [player, hasOwnTeamBirdRights],
  );
  const limits = useMemo(() => getContractLimits(playerForLimits, leagueStats), [playerForLimits, leagueStats]);
  const initialOffer = useMemo(() => {
    const base = computeContractOffer(playerForLimits, leagueStats);
    if (hasOwnTeamBirdRights && (limits.isSupermaxEligible || limits.isRookieExtEligible)) return { ...base, salaryUSD: limits.maxSalaryUSD };
    if (hasOwnTeamBirdRights && base.salaryUSD <= limits.minSalaryUSD * 1.05 && limits.maxSalaryUSD > limits.minSalaryUSD * 5) {
      return { ...base, salaryUSD: Math.round(limits.maxSalaryUSD * 0.85) };
    }
    return base;
  }, [playerForLimits, leagueStats, hasOwnTeamBirdRights, limits.isSupermaxEligible, limits.isRookieExtEligible, limits.maxSalaryUSD, limits.minSalaryUSD]);
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
          .filter((b: any) => b.teamId === team.id && b.status === 'active')
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

  const playerK2 = useMemo(() => {
    const lastR = (player as any).ratings?.[(player as any).ratings?.length - 1];
    return convertTo2KRating(player.overallRating ?? lastR?.ovr ?? 60, lastR?.hgt ?? 50, lastR?.tp);
  }, [player]);
  const twoWaySalaryUSD = useMemo(() => Math.round(limits.minSalaryUSD * 0.5), [limits.minSalaryUSD]);

  const isTrainingCampPeriod = useMemo(() => {
    if (euroIsolated) return false;
    if (!(leagueStats?.nonGuaranteedContractsEnabled ?? true)) return false;
    if (!state.date) return false;
    const { month: mo, day: dy } = getGameDateParts(state.date);
    return (mo >= 7 && mo <= 9) || (mo === 10 && dy <= 21);
  }, [state.date, leagueStats?.nonGuaranteedContractsEnabled, euroIsolated]);

  const seasonYear = leagueStats?.year ?? new Date().getUTCFullYear();
  const realAge = getDisplayAge(player, seasonYear);

  const isTwoWayCandidate = useMemo(() => {
    if (realAge <= 0 || playerK2 > 76) return false;
    const yearsOfService = ((player as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
    if (yearsOfService > 4) return false;
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
  }, [realAge, player.internalId, playerK2, player]);

  const canOfferTwoWay = useMemo(() => {
    if (euroIsolated || playerK2 > 76 || realAge > 25) return false;
    const yearsOfService = ((player as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
    return yearsOfService <= 4;
  }, [player, playerK2, realAge, euroIsolated]);

  const pbaImportMinSalary = isPbaImportSigning
    ? getPbaImportConferenceSalary(limits.minSalaryUSD, leagueStats as any, pbaConference)
    : 0;
  const minAllowed = isPbaImportSigning
    ? pbaImportMinSalary
    : contractType === 'TWO_WAY' ? twoWaySalaryUSD : limits.minSalaryUSD;
  const maxAllowed = isPbaImportSigning
    ? Math.max(pbaImportMinSalary, limits.maxSalaryUSD)
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
  const buyout = useMemo(() => computeExternalBuyout(player, leagueStats), [player, leagueStats]);
  useEffect(() => {
    setTeamBuyoutContribUSD(buyout.recommendedTeamContribUSD);
  }, [buyout.recommendedTeamContribUSD]);

  const competingInterest = useMemo(() => {
    let seed = 0;
    const id = player.internalId ?? '';
    for (let i = 0; i < id.length; i++) seed += id.charCodeAt(i);
    const noise = ((Math.sin(seed) + 1) * 0.5) * 30;
    const lastR = (player as any).ratings?.[(player as any).ratings?.length - 1];
    const hgt = lastR?.hgt ?? 50;
    const k2 = convertTo2KRating(player.overallRating ?? lastR?.ovr ?? 60, hgt, lastR?.tp);
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
  }, [player.internalId, player.overallRating, realAge, buyout.applicable, player.tid, player.status, state.nonNBATeams]);

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

  const hasActiveMarket = useMemo(
    () => !!state.faBidding?.markets?.some((m: any) => m.playerId === player.internalId && isPlausibleActiveMarket(m as any, state, player)),
    [state.faBidding?.markets, player.internalId],
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
  const isBiddingMode = !euroIsolated && !pbaIsolated && !!onSubmitBid && !autoAccept && !isResignFromOwnTeam && player.tid < 0 && state.gameMode === 'gm';
  const shouldSubmitBid = isBiddingMode && (hasActiveMarket || isPeakFA);
  const showOffersTab = !euroIsolated && !pbaIsolated && (hasActiveMarket || isPeakFA);
  const projectedCashAfterDeal = useMemo(() => {
    if (!euroIsolated || pbaIsolated || !(team as any).tycoon || contractType === 'TWO_WAY') return null;
    return projectYearEndCash(team, {
      year: leagueStats.year,
      endesaFinishPosition: (team as any).lastEndesaFinish ?? 9,
      euroleagueStage: (team as any).lastEuroleagueStage ?? 'none',
      euroleagueAwayGames: (team as any).lastEuroAwayGames ?? 0,
      endesaPrizeEUR: 0,
      euroleaguePrizeEUR: 0,
    }, salary, state.players);
  }, [euroIsolated, team, contractType, leagueStats.year, salary, state.players]);

  const tabs = useMemo(() => {
    let result = showOffersTab ? ALL_TABS : ALL_TABS.filter(t => t.id !== 'OFFERS');
    if (euroIsolated || pbaIsolated) result = result.filter(t => !EURO_HIDDEN_TABS.has(t.id));
    return result;
  }, [showOffersTab, euroIsolated, pbaIsolated]);

  useEffect(() => {
    if (!showOffersTab && activeTab === 'OFFERS') setActiveTab('NEGOTIATION');
    if ((euroIsolated || pbaIsolated) && EURO_HIDDEN_TABS.has(activeTab)) setActiveTab('NEGOTIATION');
  }, [showOffersTab, activeTab, euroIsolated, pbaIsolated]);

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
    else if (initialContractType) chosenType = initialContractType;
    else if (hasBirdBypass) chosenType = 'GUARANTEED';
    else if (canOfferTwoWay && isTwoWayCandidate) chosenType = 'TWO_WAY';
    else chosenType = 'GUARANTEED';
    setContractType(chosenType);
    if (chosenType === 'TWO_WAY') {
      setSalary(twoWaySalaryUSD);
      setYears(2);
      setOption('NONE');
    } else if (isPbaImportSigning) {
      setSalary(getPbaImportConferenceSalary(initialOffer.salaryUSD, leagueStats as any, pbaConference));
      setYears(1);
      setOption('NONE');
    } else {
      const seeded = isOwnTeamGM ? clampSpendOffer(initialOffer.salaryUSD, gmSpending, limits.maxSalaryUSD) : initialOffer.salaryUSD;
      setSalary(Math.min(limits.maxSalaryUSD, Math.max(limits.minSalaryUSD, seeded)));
      setYears(initialOffer.years);
      setOption((euroIsolated || pbaIsolated) ? 'NONE' : initialOffer.hasPlayerOption ? 'PLAYER' : 'NONE');
    }
  }, [player.internalId, isTwoWayCandidate, canOfferTwoWay, twoWaySalaryUSD, initialOffer, limits.minSalaryUSD, limits.maxSalaryUSD, roster.standardFull, roster.twoWayFull, initialContractType, isOwnTeamGM, gmSpending, euroIsolated, pbaIsolated, hasOwnTeamBirdRights, isPbaImportSigning, leagueStats, pbaConference]);

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
      setSalary(getPbaImportConferenceSalary(initialOffer.salaryUSD, leagueStats as any, pbaConference));
      setYears(1);
      setOption('NONE');
    } else {
      const seeded = isOwnTeamGM ? clampSpendOffer(initialOffer.salaryUSD, gmSpending, limits.maxSalaryUSD) : initialOffer.salaryUSD;
      setSalary(Math.min(limits.maxSalaryUSD, Math.max(limits.minSalaryUSD, seeded)));
      setYears(initialOffer.years);
      setOption((euroIsolated || pbaIsolated) ? 'NONE' : initialOffer.hasPlayerOption ? 'PLAYER' : 'NONE');
    }
  }, [contractType, canOfferTwoWay, euroIsolated, pbaIsolated, initialOffer.salaryUSD, initialOffer.years, initialOffer.hasPlayerOption, limits.minSalaryUSD, limits.maxSalaryUSD, isOwnTeamGM, gmSpending, twoWaySalaryUSD, isPbaImportSigning, leagueStats, pbaConference]);

  const portraitFallback = useMemo(() => getPlayerImage(player), [player]);
  useEffect(() => {
    let cancelled = false;
    loadPlayerRenders().then(() => { if (!cancelled) setRendersTick(t => t + 1); });
    return () => { cancelled = true; };
  }, []);
  const fullBodyRender = useMemo(() => getPlayerRender(player.name), [player.name, rendersTick]);
  useEffect(() => { setImgAllFailed(false); }, [fullBodyRender, portraitFallback]);

  const playerFace = (player as any).face;
  const teamColors = team.colors?.length === 3 ? (team.colors as [string, string, string]) : undefined;

  const { interest, uncappedInterest } = useMemo(() => {
    const salaryDiffPct = ((salary - initialOffer.salaryUSD) / initialOffer.salaryUSD) * 100;
    const yearsPenalty = isPbaImportSigning ? 0 : Math.abs(years - initialOffer.years) * -8;
    let base = 65 + salaryDiffPct * 0.5 + yearsPenalty + (!euroIsolated && !pbaIsolated ? (option === 'PLAYER' ? 15 : option === 'TEAM' ? -15 : 0) : 0);
    const traits = player.moodTraits || [];
    if (traits.includes('FAME')) {
      const externalStatuses = new Set(['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
      if (externalStatuses.has(player.status ?? '')) base += 40;
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
    const rawUncapped = Math.round(base);
    const cappedUI = Math.min(100, Math.max(0, rawUncapped));
    if (isTwoWayCandidate) return { interest: 100, uncappedInterest: 100 };
    return { interest: cappedUI, uncappedInterest: rawUncapped };
  }, [salary, years, option, initialOffer, player.moodTraits, player.tid, team.id, marketSize, powerRanking, maxAllowed, isTwoWayCandidate, resignIntent, player.status, euroIsolated, pbaIsolated, isPbaImportSigning]);

  const yearsTable = useMemo(() => {
    const total = option !== 'NONE' ? years + 1 : years;
    const baseYear = leagueStats.year + (isResign ? 1 : 0);
    return Array.from({ length: total }).map((_, i) => {
      const targetYear = baseYear + i;
      const committed = state.players
        .filter((p: NBAPlayer) =>
          p.tid === team.id &&
          !(p as any).twoWay &&
          (p.contract?.exp ?? baseYear) >= targetYear &&
          !(isResign && p.internalId === player.internalId)
        )
        .reduce((sum: number, p: NBAPlayer) => sum + contractToUSD(p.contract?.amount || 0), 0);
      const newSalary = salary * Math.pow(1.05, i);
      return { year: targetYear, salary: newSalary, capRoom: thresholds.salaryCap - (committed + newSalary) };
    });
  }, [salary, years, option, thresholds, leagueStats.year, state.players, team.id, isResign, player.internalId]);

  const formattedYears = isPbaImportSigning ? 'Conference' : option !== 'NONE' ? `${years}+1` : String(years);
  const interestColor = interest < 40 ? '#f43f5e' : interest < 70 ? '#f59e0b' : '#22c55e';

  const SALARY_STEP = 100_000;
  const decSalaryProps = useHoldable(() => setSalary(v => Math.max(minAllowed, v - SALARY_STEP)), contractType === 'TWO_WAY' || salary <= minAllowed);
  const incSalaryProps = useHoldable(() => setSalary(v => Math.min(maxAllowed, v + SALARY_STEP)), contractType === 'TWO_WAY' || salary >= maxAllowed);
  const decYearsProps = useHoldable(() => setYears(v => Math.max(1, v - 1)), isPbaImportSigning);
  const incYearsProps = useHoldable(() => setYears(v => Math.min(contractType === 'TWO_WAY' ? 2 : contractType === 'NON_GUARANTEED' ? 1 : 5, v + 1)), isPbaImportSigning);
  const decOptionProps = useHoldable(() => setOption(v => v === 'NONE' ? 'TEAM' : v === 'PLAYER' ? 'NONE' : 'PLAYER'), contractType === 'TWO_WAY' || isPbaImportSigning);
  const incOptionProps = useHoldable(() => setOption(v => v === 'NONE' ? 'PLAYER' : v === 'PLAYER' ? 'TEAM' : 'NONE'), contractType === 'TWO_WAY' || isPbaImportSigning);

  const needsGuaranteedOverLimitConfirm = !euroIsolated && contractType === 'GUARANTEED' && !isResign && !teamHoldsBirdRights && guaranteedCount >= 15;
  const submitSigning = (skipOverLimitConfirm = false, mleTypeOverride: 'room' | 'non_taxpayer' | 'taxpayer' | null = selectedMleType) => {
    if (!skipOverLimitConfirm && needsGuaranteedOverLimitConfirm) {
      setOverLimitAction('sign');
      return;
    }
    const fitsMLE = !euroIsolated && !pbaIsolated && !!mle && !mle.blocked && salary > 0 && salary <= mle.available;
    onSign({
      salary,
      years: isPbaImportSigning ? 1 : years,
      option: (euroIsolated || pbaIsolated) ? 'NONE' : option,
      twoWay: contractType === 'TWO_WAY',
      nonGuaranteed: contractType === 'NON_GUARANTEED',
      mleType: (euroIsolated || pbaIsolated || contractType === 'TWO_WAY' || contractType === 'NON_GUARANTEED' || !fitsMLE) ? null : mleTypeOverride,
    });
  };
  const requestPlayerResponse = (useMle = false) => {
    setSelectedMleType(useMle ? (mle?.type ?? null) : null);
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
    if (roster.totalFull && !rosterFullOverridden && isFreeAgencySeason && teamPayroll < thresholds.salaryCap) {
      setRosterFullOverridden(true);
    }
  }, [roster.totalFull, rosterFullOverridden, isFreeAgencySeason, teamPayroll, thresholds.salaryCap]);

  const handleMleSubmit = () => {
      setSelectedMleType(mle?.type ?? null);
    if (shouldSubmitBid && onSubmitBid) {
      onSubmitBid({ salary, years, option });
      setBidSubmitted({ salary, years, option });
      return;
    }
    if (autoAccept) submitSigning(false, mle?.type ?? null);
    else requestPlayerResponse(true);
  };

  const handlePrimarySubmit = () => {
    setSelectedMleType(null);
    if (shouldSubmitBid && onSubmitBid) {
      onSubmitBid({ salary, years, option });
      setBidSubmitted({ salary, years, option });
      return;
    }
    if (autoAccept) submitSigning();
    else requestPlayerResponse(false);
  };

  const capWarningStartYear = leagueStats.year + (isResign ? 1 : 0);
  const capWarningCommittedAtStartYear = state.players
    .filter((p: NBAPlayer) =>
      p.tid === team.id &&
      !(p as any).twoWay &&
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
    autoAccept,
    bidSubmitted,
    buyout,
    canOfferTwoWay,
    capWarningOverBy,
    capWarningProjectedPayroll,
    competingInterest,
    contractType,
    decOptionProps,
    decSalaryProps,
    decYearsProps,
    euroIsolated,
    formattedYears,
    fullBodyRender,
    gmSpending,
    handleMleSubmit,
    handlePrimarySubmit,
    hasOwnTeamBirdRights,
    imgAllFailed,
    incOptionProps,
    incSalaryProps,
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
    minAllowed,
    mle,
    money,
    moneyPrecise,
    motherTeam,
    motherTeamWillRelease,
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
    realAge,
    rendersTick,
    roster,
    rosterFullOverridden,
    salary,
    seasonYear,
    selectedMleType,
    setActiveTab,
    setBidSubmitted,
    setContractType,
    setImgAllFailed,
    setOverLimitAction,
    setPendingCashAck,
    setPreflightOverridden,
    setRosterFullOverridden,
    setSelectedMleType,
    setShowCapWarning,
    setShowResponse,
    setTeamBuyoutContribUSD,
    showCapWarning,
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
