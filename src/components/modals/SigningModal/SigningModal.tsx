import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ChevronLeft, ChevronRight,
  DollarSign, Heart, Wallet, History, TrendingUp,
} from 'lucide-react';
import type { NBAPlayer, NBATeam } from '../../../types';
import {
  formatSalaryM, formatSalaryMPrecise, computeContractOffer, getCapThresholds, getTeamPayrollUSD, getContractLimits, getMLEAvailability, computeExternalBuyout,
} from '../../../utils/salaryUtils';
import { extractNbaId, hdPortrait, normalizeDate, convertTo2KRating } from '../../../utils/helpers';
import { getFreeAgencyStartDate } from '../../../utils/dateUtils';
import { getPlayerImage } from '../../central/view/bioCache';
import { loadPlayerRenders, getPlayerRender } from '../../../utils/playerRenders';
import { PlayerBioMoraleTab, classifyResignIntent } from '../../central/view/PlayerBioMoraleTab';
import { PlayerBioContractTab } from '../../central/view/PlayerBioContractTab';
import { computeMoodScore, normalizeMoodTraits } from '../../../utils/mood/moodScore';
import { useGame } from '../../../store/GameContext';

interface SigningModalProps {
  player: NBAPlayer;
  team: NBATeam;
  leagueStats: any;
  /** When true, Submit finalizes immediately — no interest check, no accept/reject modal. Used in commissioner mode. */
  autoAccept?: boolean;
  /** When set, renders the player-voiced message screen up-front (reusing the response screen UI) instead of the negotiation panel. */
  preflightMessage?: { title: string; body: string; tone?: 'neutral' | 'positive' };
  onClose: () => void;
  onSign: (contract: { salary: number; years: number; option: 'NONE' | 'PLAYER' | 'TEAM'; twoWay: boolean; mleType: 'room' | 'non_taxpayer' | 'taxpayer' | null }) => void;
}

const formatPos = (pos = '') => {
  const p = pos.toUpperCase().trim();
  if (!p) return '—';
  if (p.includes('POINT GUARD'))    return 'PG';
  if (p.includes('SHOOTING GUARD')) return 'SG';
  if (p.includes('SMALL FORWARD'))  return 'SF';
  if (p.includes('POWER FORWARD'))  return 'PF';
  if (p.includes('CENTER'))         return 'C';
  // BBGM already stores short codes like SG / PG / PF / GF / FC — keep them verbatim.
  if (/^[A-Z]{1,3}$/.test(p)) return p;
  return p.split(/\s+/).map(s => s[0]).join('') || '—';
};

type TabType = 'NEGOTIATION' | 'MORALE' | 'CONTRACT' | 'FINANCES' | 'OFFERS';
type ContractType = 'GUARANTEED' | 'TWO_WAY';

const ALL_TABS: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: 'NEGOTIATION', label: 'Negotiation', icon: DollarSign },
  { id: 'MORALE',      label: 'Morale',      icon: Heart      },
  { id: 'CONTRACT',    label: 'Contract',    icon: History    },
  { id: 'FINANCES',    label: 'Finances',    icon: Wallet     },
  { id: 'OFFERS',      label: 'Team Offers', icon: History    },
];

// Peak FA = first 2 weeks after free agency opens. Competing bids are noisy after that.
const PEAK_FA_DAYS = 14;

// Logos shown on the mother-team refusal card.
const LEAGUE_LOGOS: Record<string, string> = {
  PBA:             'https://upload.wikimedia.org/wikipedia/en/thumb/9/93/Philippine_Basketball_Association_logo.svg/200px-Philippine_Basketball_Association_logo.svg.png',
  Euroleague:      'https://upload.wikimedia.org/wikipedia/en/thumb/b/b7/EuroLeague_logo.svg/200px-EuroLeague_logo.svg.png',
  'B-League':      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmjuA28r8Wi0G12PZR5iGIk8X2sMvjOgyyXw&s',
  'G-League':      'https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/NBA_G_League_logo.svg/200px-NBA_G_League_logo.svg.png',
  Endesa:          'https://r2.thesportsdb.com/images/media/league/badge/9i99ii1549879285.png',
};

function useHoldable(callback: () => void, disabled: boolean) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = React.useRef(160);
  const isHoldingRef = React.useRef(false);

  const run = React.useCallback(() => {
    if (disabled) return;
    isHoldingRef.current = true;
    callback();
    // Gentle acceleration — long holds still reach ~40ms/tick, not a runaway.
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

const SigningModal: React.FC<SigningModalProps> = ({ player, team, leagueStats, autoAccept = false, preflightMessage, onClose, onSign }) => {
  const { state } = useGame();

  const [activeTab,    setActiveTab]    = useState<TabType>('NEGOTIATION');
  const [contractType, setContractType] = useState<ContractType>('GUARANTEED');
  const [salary,       setSalary]       = useState(0);
  const [years,        setYears]        = useState(1);
  const [option,       setOption]       = useState<'NONE' | 'PLAYER' | 'TEAM'>('NONE');
  const [showResponse, setShowResponse] = useState(false);
  // Commissioner can override the preflight ("Testing Free Agency") and enter negotiation anyway.
  const [preflightOverridden, setPreflightOverridden] = useState(false);
  // Transient toast for contractType collisions with roster caps.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  // Final cap warning gate — shown on Submit when the deal would blow past cap with no Bird / MLE cover.
  const [showCapWarning, setShowCapWarning] = useState(false);
  // Commissioner dismisses roster-full preflight.
  const [rosterFullOverridden, setRosterFullOverridden] = useState(false);

  const thresholds  = useMemo(() => getCapThresholds(leagueStats), [leagueStats]);
  const teamPayroll = useMemo(() => getTeamPayrollUSD(state.players, team.id), [state.players, team.id]);
  // Roster-slot accounting from EconomyTab settings — honor the commissioner's chosen limits.
  const roster = useMemo(() => {
    const maxStandard = leagueStats?.maxStandardPlayersPerTeam ?? 15;
    const maxTwoWay   = leagueStats?.maxTwoWayPlayersPerTeam   ?? 3;
    const maxTotal    = leagueStats?.maxPlayersPerTeam         ?? (maxStandard + maxTwoWay);
    const onTeam = state.players.filter(p => p.tid === team.id);
    const twoWayCount    = onTeam.filter(p => (p as any).twoWay).length;
    const standardCount  = onTeam.length - twoWayCount;
    const standardFull   = standardCount >= maxStandard;
    const twoWayFull     = twoWayCount >= maxTwoWay;
    const totalFull      = onTeam.length >= maxTotal || (standardFull && twoWayFull);
    return { maxStandard, maxTwoWay, maxTotal, standardCount, twoWayCount, standardFull, twoWayFull, totalFull };
  }, [state.players, team.id, leagueStats]);
  // Re-sign = staying on the current team → Bird Rights unlock supermax / longer deals.
  const isResign = player.tid === team.id;
  const playerForLimits = useMemo(
    () => (isResign ? { ...player, hasBirdRights: true } as NBAPlayer : player),
    [player, isResign],
  );
  const initialOffer = useMemo(() => computeContractOffer(playerForLimits, leagueStats), [playerForLimits, leagueStats]);
  const limits = useMemo(() => getContractLimits(playerForLimits, leagueStats), [playerForLimits, leagueStats]);
  // MLE reflects the hypothetical first-year salary of this very offer so the status updates live as the user slides.
  const mle = useMemo(
    () => getMLEAvailability(team.id, teamPayroll, salary, thresholds, leagueStats),
    [team.id, teamPayroll, salary, thresholds, leagueStats],
  );

  // NBA two-way = 50% of the first-year minimum. Derived from EconomyTab settings so commissioners can tune it.
  const twoWaySalaryUSD = useMemo(() => Math.round(limits.minSalaryUSD * 0.5), [limits.minSalaryUSD]);

  // Real age (from born.year when available — player.age goes stale).
  const seasonYear = leagueStats?.year ?? new Date().getUTCFullYear();
  const realAge = player.born?.year ? seasonYear - player.born.year : (player.age ?? 0);

  // Two-way candidate probability — age-weighted, not a hard cutoff.
  // 19 → 95%, 22 → 65%, 25 → 30%, 28 → 10%, 30+ → ~3%. Seeded by player ID so it's stable per-player.
  const isTwoWayCandidate = useMemo(() => {
    if (realAge <= 0) return false;
    let prob: number;
    if (realAge <= 19) prob = 0.95;
    else if (realAge <= 22) prob = 0.65 + (22 - realAge) * 0.10;   // 20→.85, 21→.75, 22→.65
    else if (realAge <= 25) prob = 0.30 + (25 - realAge) * 0.117;  // 23→.53, 24→.41, 25→.30
    else if (realAge <= 28) prob = 0.10 + (28 - realAge) * 0.067;  // 26→.23, 27→.17, 28→.10
    else                    prob = 0.03;
    // Stable per-player roll from internalId.
    let seed = 0;
    const id = player.internalId ?? '';
    for (let i = 0; i < id.length; i++) seed += id.charCodeAt(i);
    const roll = Math.abs(Math.sin(seed) * 10000) % 1;
    return roll < prob;
  }, [realAge, player.internalId]);

  const minAllowed = contractType === 'TWO_WAY' ? twoWaySalaryUSD : limits.minSalaryUSD;
  const maxAllowed = contractType === 'TWO_WAY' ? twoWaySalaryUSD : limits.maxSalaryUSD;

  // Power ranking — rank teams by win% (1 = best). Falls back to strength for preseason ties.
  const powerRanking = useMemo(() => {
    const ranked = [...state.teams].sort((a, b) => {
      const aGp = a.wins + a.losses;
      const bGp = b.wins + b.losses;
      const aPct = aGp > 0 ? a.wins / aGp : (a.strength ?? 50) / 100;
      const bPct = bGp > 0 ? b.wins / bGp : (b.strength ?? 50) / 100;
      return bPct - aPct;
    });
    const idx = ranked.findIndex(t => t.id === team.id);
    return idx >= 0 ? idx + 1 : 16;
  }, [state.teams, team.id]);

  // Market size 0–100 from team.pop (0–10 scale).
  const marketSize = Math.min(100, Math.max(0, (team.pop ?? 2.5) * 10));

  // External-league buyout details (only relevant for Euroleague/CBA/NBL/etc. signings).
  const buyout = useMemo(() => computeExternalBuyout(player, leagueStats), [player, leagueStats]);
  const [teamBuyoutContribUSD, setTeamBuyoutContribUSD] = useState(0);
  useEffect(() => {
    setTeamBuyoutContribUSD(buyout.recommendedTeamContribUSD);
  }, [buyout.recommendedTeamContribUSD]);

  // Competing interest / external league pull — mirrors Offer Strength but from the other side.
  // For external-league players: how hard the overseas club is trying to retain them.
  // For NBA free agents: strength of the strongest competing NBA offer.
  const competingInterest = useMemo(() => {
    // Seeded per-player so the number is stable across re-renders.
    let seed = 0;
    const id = player.internalId ?? '';
    for (let i = 0; i < id.length; i++) seed += id.charCodeAt(i);
    const noise = ((Math.sin(seed) + 1) * 0.5) * 30;  // 0-30
    // Use K2 (60-99) scale instead of raw BBGM so PBA / low-OVR overseas guys aren't zeroed out.
    const lastR = (player as any).ratings?.[(player as any).ratings?.length - 1];
    const hgt = lastR?.hgt ?? 50;
    const k2 = convertTo2KRating(player.overallRating ?? lastR?.ovr ?? 60, hgt, lastR?.tp);
    if (buyout.applicable) {
      // External club's retention pull — stronger clubs (big pop = Barcelona, Real Madrid, CSKA) hold on hard.
      const base = 40 + (k2 - 60) * 1.3;               // K2 60 → 40, K2 85 → 72, K2 99 → 91
      const ageBump = realAge < 24 ? 12 : realAge >= 31 ? -8 : 0;
      const motherTeam = (state.nonNBATeams ?? []).find((t: any) => t.tid === player.tid && t.league === player.status);
      // Mother club prestige: pop is a proxy for budget + prestige. Barcelona pop ≈ 5.5 → +20; small club pop ≈ 0.5 → ~+2.
      const prestigeBump = motherTeam ? Math.min(25, Math.round(((motherTeam as any).pop ?? 1) * 3.5)) : 0;
      return Math.max(15, Math.min(100, Math.round(base + ageBump + prestigeBump + noise * 0.3)));
    }
    // NBA free agent — competing NBA demand scales sharply with K2 OVR.
    const base = 15 + (k2 - 60) * 2.1;                // K2 60 → 15, K2 85 → 68, K2 99 → 97
    const ageBump = realAge >= 27 && realAge <= 30 ? 10 : realAge >= 35 ? -15 : 0;
    return Math.max(0, Math.min(100, Math.round(base + ageBump + noise * 0.4)));
  }, [player.internalId, player.overallRating, realAge, buyout.applicable, player.tid, player.status, state.nonNBATeams]);

  // Re-sign intent — so the interest math matches what the morale tab is saying.
  // A player who's "testing waters" should be visibly harder to sign; a player who's "ready to extend" is a gimme.
  const resignIntent = useMemo(() => {
    const traitsNorm = normalizeMoodTraits((player as any).moodTraits ?? []);
    const { score } = computeMoodScore(
      player,
      team,
      state.date,
      false, false, false,
      state.players.filter(p => p.tid === player.tid),
      leagueStats?.year,
    );
    const gp = (team.wins ?? 0) + (team.losses ?? 0);
    const winPct = gp > 0 ? (team.wins ?? 0) / gp : 0.5;
    return classifyResignIntent(player, traitsNorm, score, leagueStats?.year ?? 2026, winPct);
  }, [player, team, state.date, state.players, leagueStats?.year]);

  // Offers tab is only meaningful during peak FA (first 2 weeks after market opens).
  const isPeakFA = useMemo(() => {
    const dateStr = normalizeDate(state.date ?? '');
    if (!dateStr) return false;
    const seasonYear = leagueStats?.year ?? new Date().getUTCFullYear();
    const faStart = getFreeAgencyStartDate(seasonYear, leagueStats);
    const peakEnd = new Date(faStart.getTime() + PEAK_FA_DAYS * 86_400_000);
    const current = new Date(dateStr);
    return current >= faStart && current < peakEnd;
  }, [state.date, leagueStats]);

  const tabs = useMemo(
    () => (isPeakFA ? ALL_TABS : ALL_TABS.filter(t => t.id !== 'OFFERS')),
    [isPeakFA],
  );

  useEffect(() => {
    if (!isPeakFA && activeTab === 'OFFERS') setActiveTab('NEGOTIATION');
  }, [isPeakFA, activeTab]);

  // One-shot initializer per player — otherwise isTwoWayCandidate keeps forcing TWO_WAY
  // back on after the user picks GUARANTEED (minAllowed / maxAllowed depend on contractType,
  // so they change and re-trigger the init effect in a loop).
  const initedForPlayerRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (initedForPlayerRef.current === player.internalId) return;
    initedForPlayerRef.current = player.internalId;
    // Honor roster slot availability first — if standard is full, we must default to TWO_WAY, and vice versa.
    const forcedTwoWay = roster.standardFull && !roster.twoWayFull;
    const forcedGuaranteed = roster.twoWayFull && !roster.standardFull;
    if (isTwoWayCandidate || forcedTwoWay) {
      setContractType(forcedGuaranteed ? 'GUARANTEED' : 'TWO_WAY');
    } else {
      setContractType('GUARANTEED');
    }
    if (isTwoWayCandidate || forcedTwoWay) {
      setSalary(twoWaySalaryUSD);
      setYears(2);
      setOption('NONE');
    } else {
      setSalary(Math.min(limits.maxSalaryUSD, Math.max(limits.minSalaryUSD, initialOffer.salaryUSD)));
      setYears(initialOffer.years);
      setOption(initialOffer.hasPlayerOption ? 'PLAYER' : 'NONE');
    }
  }, [player.internalId, isTwoWayCandidate, twoWaySalaryUSD, initialOffer, limits.minSalaryUSD, limits.maxSalaryUSD, roster.standardFull, roster.twoWayFull]);

  // User-driven contractType toggle — rebuild salary/years/option for the chosen type.
  // Skips the first run so we don't clobber the init effect above.
  const contractTypeInitedRef = React.useRef(false);
  useEffect(() => {
    if (!contractTypeInitedRef.current) { contractTypeInitedRef.current = true; return; }
    if (contractType === 'TWO_WAY') {
      setSalary(twoWaySalaryUSD);
      setYears(y => (y > 2 ? 2 : y));
      setOption('NONE');
    } else {
      setSalary(Math.min(limits.maxSalaryUSD, Math.max(limits.minSalaryUSD, initialOffer.salaryUSD)));
      setYears(initialOffer.years);
      setOption(initialOffer.hasPlayerOption ? 'PLAYER' : 'NONE');
    }
  }, [contractType]);

  // Full-body NBA action render (1040x760) is primary — looks sick.
  // Portrait (ProBallers via getPlayerImage) is the fallback via <img onError>.
  const actionRender = useMemo(() => {
    const nbaId = extractNbaId(player.imgURL ?? '', player.name);
    return nbaId ? hdPortrait(nbaId) : undefined;
  }, [player.imgURL, player.name]);
  const portraitFallback = useMemo(() => getPlayerImage(player), [player]);
  const initialSrc = actionRender || portraitFallback;

  // Higher-res /small full-body render from the nba-store-data repo.
  // Lazy-loaded once at module level; we re-render when the map arrives.
  const [rendersTick, setRendersTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadPlayerRenders().then(() => { if (!cancelled) setRendersTick(t => t + 1); });
    return () => { cancelled = true; };
  }, []);
  const fullBodyRender = useMemo(
    () => getPlayerRender(player.name),
    [player.name, rendersTick],
  );
  const primarySrc = fullBodyRender || initialSrc;

  const { interest, uncappedInterest } = useMemo(() => {
    const salaryDiffPct = ((salary - initialOffer.salaryUSD) / initialOffer.salaryUSD) * 100;
    let base = 65 + salaryDiffPct * 0.5 + Math.abs(years - initialOffer.years) * -8 + (option === 'PLAYER' ? 15 : option === 'TEAM' ? -15 : 0);

    const traits = player.moodTraits || [];

    if (traits.includes('FAME')) {
      // FAME players want the NBA spotlight, period. If they're currently abroad / G-League,
      // an NBA offer is a massive draw regardless of market size.
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
      const moneyPenalty = Math.max(-20, -20 + (overMarketPct * 4));
      base += moneyPenalty;
    }

    if (traits.includes('COMPETITOR') || traits.includes('WINNER' as any)) {
      if (powerRanking < 16) {
        const winnerBuff = 20 * ((16 - powerRanking) / 15);
        base += Math.max(0, winnerBuff);
      }
    }

    // Keep interest math aligned with what the morale tab says.
    // testing_market → the player is hard to sign until you overpay / offer years; ready_to_extend → easy yes.
    if (resignIntent === 'testing_market') base -= 25;
    else if (resignIntent === 'ready_to_extend') base += 15;
    else if (resignIntent === 'farewell') base -= 60; // they've publicly retired; you're not signing them

    const rawUncapped = Math.round(base);
    const cappedUI = Math.min(100, Math.max(0, rawUncapped));

    // Young FAs just want a roster spot — interest is pinned at 100 so Submit always succeeds.
    if (isTwoWayCandidate) return { interest: 100, uncappedInterest: 100 };
    return { interest: cappedUI, uncappedInterest: rawUncapped };
  }, [salary, years, option, initialOffer, player.moodTraits, player.tid, team.id, marketSize, powerRanking, maxAllowed, isTwoWayCandidate, resignIntent]);

  const yearsTable = useMemo(() => {
    const total = option !== 'NONE' ? years + 1 : years;
    return Array.from({ length: total }).map((_, i) => ({
      year:    leagueStats.year + i,
      salary:  salary * Math.pow(1.05, i),
      capRoom: thresholds.salaryCap - (teamPayroll + salary * Math.pow(1.05, i)),
    }));
  }, [salary, years, option, thresholds, teamPayroll, leagueStats.year]);

  const formattedYears = option !== 'NONE' ? `${years}+1` : String(years);
  const interestColor  = interest < 40 ? '#f43f5e' : interest < 70 ? '#f59e0b' : '#22c55e';

  // Click = $100K nudge; holding ramps up inside useHoldable.
  const SALARY_STEP = 100_000;
  const decSalaryProps = useHoldable(() => setSalary(v => Math.max(minAllowed, v - SALARY_STEP)), contractType === 'TWO_WAY' || salary <= minAllowed);
  const incSalaryProps = useHoldable(() => setSalary(v => Math.min(maxAllowed, v + SALARY_STEP)), contractType === 'TWO_WAY' || salary >= maxAllowed);

  const decYearsProps = useHoldable(() => setYears(v => Math.max(1, v - 1)), false);
  const incYearsProps = useHoldable(() => setYears(v => Math.min(contractType === 'TWO_WAY' ? 2 : 5, v + 1)), false);

  const decOptionProps = useHoldable(() => setOption(v => v === 'NONE' ? 'TEAM' : v === 'PLAYER' ? 'NONE' : 'PLAYER'), contractType === 'TWO_WAY');
  const incOptionProps = useHoldable(() => setOption(v => v === 'NONE' ? 'PLAYER' : v === 'PLAYER' ? 'TEAM' : 'NONE'), contractType === 'TWO_WAY');

  // Cap-blown warning — final gate before player response when the signing would illegally exceed the cap.
  if (showCapWarning) {
    const projectedPayroll = teamPayroll + salary;
    const overBy = projectedPayroll - thresholds.salaryCap;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative w-full max-w-md bg-[#0a0a0a] border border-rose-500/40 shadow-2xl rounded flex flex-col items-center text-center overflow-hidden"
        >
          <div className="w-full bg-gradient-to-b from-rose-600/20 to-transparent p-8">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-300 mb-2">Cap Violation</p>
            <h2 className="text-2xl font-black italic uppercase tracking-wider text-rose-400">
              Not Possible Under Salary Cap
            </h2>
          </div>
          <div className="px-8 pb-8 w-full flex flex-col items-center">
            <p className="text-white/80 italic mb-4 leading-relaxed text-sm">
              Signing {player.name} at {formatSalaryMPrecise(salary, 2)} takes the {team.name} to {formatSalaryM(projectedPayroll)} — {formatSalaryM(overBy)} over the cap, with no MLE or Bird Rights to cover it.
            </p>
            <p className="text-[10px] text-white/40 mb-6 leading-relaxed">
              Options: drop the salary so an MLE fits, restructure around Bird Rights by re-signing a different player, or walk away.
            </p>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => setShowCapWarning(false)}
                className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
              >
                Negotiate Again
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 bg-rose-600/20 border border-rose-500/50 hover:bg-rose-600/40 text-rose-300 font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
              >
                End Deal
              </button>
              {autoAccept && (
                <button
                  onClick={() => { setShowCapWarning(false); onSign({ salary, years, option, twoWay: contractType === 'TWO_WAY', mleType: (contractType === 'TWO_WAY' || (mle?.blocked ?? true)) ? null : (mle?.type ?? null) }); }}
                  className="w-full py-3 bg-[#e21d37]/20 border border-[#e21d37]/50 hover:bg-[#e21d37]/40 text-[#e21d37] font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
                  title="Cap rules don't apply — you're the Commissioner."
                >
                  You're the Commissioner — Force Signing
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Roster-full preflight — if every standard + two-way slot is full, the only path is to waive someone first.
  if (roster.totalFull && !rosterFullOverridden) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative w-full max-w-md bg-[#0a0a0a] border border-rose-500/30 shadow-2xl rounded flex flex-col items-center text-center overflow-hidden"
        >
          <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
            {team.logoUrl && <img src={team.logoUrl} className="h-32 object-contain z-10" alt={team.name} referrerPolicy="no-referrer" />}
          </div>
          <div className="p-8 w-full flex flex-col items-center relative z-20">
            <h2 className="text-2xl font-black italic uppercase tracking-wider mb-4 text-rose-400">Roster Full</h2>
            <p className="text-white/80 italic mb-2 leading-relaxed text-sm">
              The {team.name} have {roster.standardCount}/{roster.maxStandard} standard and {roster.twoWayCount}/{roster.maxTwoWay} two-way players — every slot is filled.
            </p>
            <p className="text-white/60 text-xs mb-8">Waive a player first to clear a roster spot, then come back to sign {player.name}.</p>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={onClose}
                className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
              >
                Close — Go Waive Someone
              </button>
              {autoAccept && (
                <button
                  onClick={() => setRosterFullOverridden(true)}
                  className="w-full py-3 bg-[#e21d37]/20 border border-[#e21d37]/50 hover:bg-[#e21d37]/40 text-[#e21d37] font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
                  title="Roster caps don't apply — you're the Commissioner."
                >
                  You're the Commissioner — Force Signing
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Preflight message (used for re-sign refusals like "I'm testing the market first").
  // Reuses the same visual treatment as the post-Submit response screen but without accept/reject framing.
  if (preflightMessage && !preflightOverridden) {
    const toneColor = preflightMessage.tone === 'positive' ? 'text-emerald-400' : 'text-amber-300';
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 shadow-2xl rounded flex flex-col items-center text-center overflow-hidden"
        >
          <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
            {initialSrc ? (
              <img src={initialSrc} className="h-full object-contain drop-shadow-2xl z-10" alt={player.name} referrerPolicy="no-referrer" />
            ) : (
              <div className="h-full w-32 rounded-full bg-slate-800 flex items-center justify-center text-4xl font-black text-slate-600 z-10">
                {(player.name ?? '??').split(' ').map(w => w[0]).join('')}
              </div>
            )}
          </div>
          <div className="p-8 w-full flex flex-col items-center relative z-20">
            <h2 className={`text-2xl font-black italic uppercase tracking-wider mb-4 ${toneColor}`}>
              {preflightMessage.title}
            </h2>
            <p className="text-white/80 italic mb-8 leading-relaxed text-sm">
              {preflightMessage.body}
            </p>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={onClose}
                className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
              >
                Acknowledge
              </button>
              {autoAccept && (
                <button
                  onClick={() => setPreflightOverridden(true)}
                  className="w-full py-3 bg-[#e21d37]/20 border border-[#e21d37]/50 hover:bg-[#e21d37]/40 text-[#e21d37] font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
                  title="The player's feelings don't matter — you're the Commissioner."
                >
                  You're the Commissioner — Force Negotiation
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Mother-team buyout refusal — the overseas club controls release. Total
  // payment = team contribution (FIBA-capped) + player out-of-pocket from
  // signing bonus. In real NBA buyouts, the club sees the FULL sum, so
  // acceptance is driven by the combined total, not the team portion alone.
  // The FIBA cap limits what the team can chip in, but the player filling the
  // remainder is normal — the old check was refusing buyouts that were
  // actually fully funded.
  const totalBuyoutPaidUSD = buyout.applicable
    ? teamBuyoutContribUSD + Math.max(0, buyout.estimatedBuyoutUSD - teamBuyoutContribUSD)
    : 0;
  const motherTeamWillRelease = !buyout.applicable || (() => {
    const ratio = buyout.estimatedBuyoutUSD > 0
      ? totalBuyoutPaidUSD / buyout.estimatedBuyoutUSD
      : 1;
    // Same floor as the bar — 50% minimum; high-retention clubs require full ask.
    return ratio >= Math.max(0.5, competingInterest / 100);
  })();

  if (showResponse && !motherTeamWillRelease) {
    // Mother TEAM (not league) — look up the external club that actually owns the player's rights.
    const motherTeam = (state.nonNBATeams ?? []).find((t: any) => t.tid === player.tid && t.league === player.status);
    const motherTeamLogo = motherTeam?.imgURL || LEAGUE_LOGOS[buyout.league];
    const motherTeamName = motherTeam
      ? (motherTeam.region ? `${motherTeam.region} ${motherTeam.name}`.trim() : motherTeam.name)
      : buyout.league;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative w-full max-w-md bg-[#0a0a0a] border border-orange-500/30 shadow-2xl rounded flex flex-col items-center text-center overflow-hidden"
        >
          <div className="w-full h-48 bg-[#050505] relative flex items-center justify-center pt-4 border-b border-white/5">
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
            {motherTeamLogo ? (
              <img src={motherTeamLogo} className="h-32 object-contain drop-shadow-2xl z-10" alt={motherTeamName} referrerPolicy="no-referrer" />
            ) : (
              <div className="h-24 w-24 rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center text-sm font-black text-orange-300 z-10">
                {buyout.league}
              </div>
            )}
          </div>
          <div className="p-8 w-full flex flex-col items-center relative z-20">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-300 mb-2">{motherTeamName} Front Office</p>
            <h2 className="text-2xl font-black italic uppercase tracking-wider mb-4 text-orange-400">
              Buyout Refused
            </h2>
            <p className="text-white/80 italic mb-8 leading-relaxed text-sm">
              "Nah. We're not giving you {player.name} for {formatSalaryM(totalBuyoutPaidUSD)}. We're asking {formatSalaryM(buyout.estimatedBuyoutUSD)} and we mean it. Come back when you're serious."
            </p>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => setShowResponse(false)}
                className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
              >
                Back — Sweeten the Buyout
              </button>
              {autoAccept && (
                <button
                  onClick={() => onSign({ salary, years, option, twoWay: contractType === 'TWO_WAY', mleType: (contractType === 'TWO_WAY' || (mle?.blocked ?? true)) ? null : (mle?.type ?? null) })}
                  className="w-full py-3 bg-[#e21d37]/20 border border-[#e21d37]/50 hover:bg-[#e21d37]/40 text-[#e21d37] font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
                  title="The overseas club's refusal doesn't matter — you're the Commissioner."
                >
                  You're the Commissioner — Force Signing
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (showResponse) {
    const isAccepted = uncappedInterest >= 80;
    const responseTitle = isAccepted ? 'Offer Accepted' : 'Offer Rejected';
    let responseMessage = '';

    const traitsAny = (player.moodTraits || []) as any[];
    const isWinner = traitsAny.includes('COMPETITOR') || traitsAny.includes('WINNER') || traitsAny.includes('W');
    const isLoyal = traitsAny.includes('LOYAL') || traitsAny.includes('LOYALTY') || traitsAny.includes('L');
    const isMercenary = traitsAny.includes('MERCENARY') || traitsAny.includes('$');
    const isFame = traitsAny.includes('FAME') || traitsAny.includes('DIVA') || traitsAny.includes('F');
    const isResigning = player.tid === team.id;

    if (uncappedInterest >= 100) {
      if (isMercenary)              responseMessage = `"You stepped up to the plate financially. This is exactly what I'm worth. Let's do it."`;
      else if (isFame)              responseMessage = `"Big lights, big money. I'm ready to be the face of this franchise. Deal."`;
      else if (isWinner)            responseMessage = `"This offer shows me you're committed to building a championship roster. Let's go win a ring."`;
      else if (isLoyal && isResigning) responseMessage = `"I never really wanted to leave, and this offer makes it an easy decision. Let's continue building."`;
      else                          responseMessage = `"Wow. You guys clearly believe in me. This is exactly the kind of offer I was looking for. I'm ready to sign today."`;
    } else if (uncappedInterest >= 80) {
      if (isMercenary)       responseMessage = `"The financial package is right where it needs to be. I'm checking the pen now. Deal."`;
      else if (isFame)       responseMessage = `"I like the numbers and I love the stage. You've got yourselves a deal."`;
      else if (isWinner)     responseMessage = `"This is a solid offer. I feel respected, and I believe in the team's direction. Let's get to work."`;
      else                   responseMessage = `"This is a very solid offer. I feel respected, and it aligns with my goals. You've got yourselves a deal."`;
    } else if (uncappedInterest >= 60) {
      if (isMercenary)       responseMessage = `"This is short of my market value. If we can't respect the money, I can't sign here. I'm moving on."`;
      else if (isFame)       responseMessage = `"I have other high-profile situations looking at me. This isn't enough to pass those up. Best of luck."`;
      else if (isWinner)     responseMessage = `"If I'm committing to a roster, the investment needs to match my goals. We're too far apart. I'm moving on."`;
      else                   responseMessage = `"I appreciate the conversation, but this is short of my market value. I've decided to go in a different direction."`;
    } else {
      if (isMercenary)       responseMessage = `"If this is how you financially value what I bring to the court, we have nothing more to discuss."`;
      else if (isFame)       responseMessage = `"You can't lowball me with my profile. This isn't even close to a serious offer. I'm out."`;
      else if (isWinner)     responseMessage = `"I want to win rings, and this offer tells me you aren't ready to invest in a winning culture. I'm taking my talents elsewhere."`;
      else                   responseMessage = `"No offense, but this isn't even close to a serious offer. If this is how you value what I bring, I'll be exploring other options."`;
    }

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 shadow-2xl rounded flex flex-col items-center text-center overflow-hidden"
        >
          <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
            {initialSrc ? (
              <img src={initialSrc} className="h-full object-contain drop-shadow-2xl z-10" alt={player.name} referrerPolicy="no-referrer" />
            ) : (
              <div className="h-full w-32 rounded-full bg-slate-800 flex items-center justify-center text-4xl font-black text-slate-600 z-10">
                {(player.name ?? '??').split(' ').map(w => w[0]).join('')}
              </div>
            )}
          </div>

          <div className="p-8 w-full flex flex-col items-center relative z-20">
            <h2 className={`text-2xl font-black italic uppercase tracking-wider mb-4 ${isAccepted ? 'text-green-500' : 'text-[#e21d37]'}`}>
              {responseTitle}
            </h2>
            <p className="text-white/80 italic mb-8 leading-relaxed text-sm">
              {responseMessage}
            </p>

            <div className="flex flex-col gap-2 w-full">
              {isAccepted ? (
                <button
                  onClick={() => onSign({ salary, years, option, twoWay: contractType === 'TWO_WAY', mleType: (contractType === 'TWO_WAY' || (mle?.blocked ?? true)) ? null : (mle?.type ?? null) })}
                  className="w-full py-4 bg-green-600/20 border border-green-500/50 hover:bg-green-600/40 hover:border-green-500 text-green-400 font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
                >
                  Finalize Deal
                </button>
              ) : (
                <>
                  <button
                    onClick={onClose}
                    className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
                  >
                    Acknowledge
                  </button>
                  {autoAccept && (
                    <button
                      onClick={() => onSign({ salary, years, option, twoWay: contractType === 'TWO_WAY', mleType: (contractType === 'TWO_WAY' || (mle?.blocked ?? true)) ? null : (mle?.type ?? null) })}
                      className="w-full py-3 bg-[#e21d37]/20 border border-[#e21d37]/50 hover:bg-[#e21d37]/40 text-[#e21d37] font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
                      title="Their rejection doesn't matter — you're the Commissioner."
                    >
                      You're the Commissioner — Force Signing
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start lg:items-center justify-center bg-black/95 backdrop-blur-md pointer-events-none overflow-y-auto lg:overflow-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
    >
      {/* Toast — transient notifications for roster/cap collisions */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] bg-rose-600/90 border border-rose-400 text-white text-xs font-bold uppercase tracking-widest px-5 py-3 rounded-sm shadow-xl pointer-events-auto max-w-md text-center"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ scale: 0.97, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        className="relative w-full max-w-[1400px] m-0 lg:m-8 bg-[#0a0a0a] lg:border lg:border-white/5 lg:rounded-sm overflow-hidden flex flex-col shadow-[0_0_120px_rgba(0,0,0,0.9)] pointer-events-auto min-h-screen lg:min-h-0 lg:h-[85vh] lg:max-h-[900px]"
      >
        <div className="flex items-center justify-between px-8 py-4 bg-gradient-to-r from-[#e21d37] to-[#7a0018] shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black italic uppercase tracking-[0.4em] text-white/80">
              Offer Contract
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 border-l border-white/20 pl-4">
              {team.region} {team.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/20 text-white/70 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-visible lg:overflow-hidden min-h-0">

          <div className="w-full lg:w-[38%] xl:w-[35%] shrink-0 relative flex flex-col border-b lg:border-b-0 lg:border-r border-white/5 bg-[#090909]">

            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.07]" />
            <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none z-10" />

            <div className="relative z-20 pt-8 px-8 pb-0">
              <span className="text-[9px] font-black text-[#e21d37] uppercase tracking-[0.4em] block mb-2">
                Prospective Signee
              </span>
              <h2 className="text-4xl xl:text-5xl font-black italic uppercase tracking-tighter leading-[0.88] text-white drop-shadow-2xl">
                {player.name}
              </h2>
              {limits.maxPct >= 0.30 && (
                <div className="inline-flex mt-3 items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-amber-300">
                    {limits.isSupermaxEligible ? 'Supermax Eligible' : 'Max Extension Eligible'}
                  </span>
                </div>
              )}
            </div>

            <div className="relative z-50 flex-1 flex items-end justify-center overflow-visible min-h-[300px] lg:min-h-[400px]">
              <AnimatePresence mode="wait">
                <motion.img
                  key={primarySrc ?? 'fallback'}
                  initial={{ opacity: 0, scale: 1.05, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  src={primarySrc || `https://picsum.photos/seed/${encodeURIComponent(player.name ?? 'p')}/600/900`}
                  onError={e => {
                    const img = e.target as HTMLImageElement;
                    if (fullBodyRender && !img.dataset.triedAction && actionRender && actionRender !== fullBodyRender) {
                      img.dataset.triedAction = '1';
                      img.src = actionRender;
                    } else if (!img.dataset.triedPortrait && portraitFallback && portraitFallback !== img.src) {
                      img.dataset.triedPortrait = '1';
                      img.src = portraitFallback;
                    } else {
                      img.src = `https://picsum.photos/seed/${encodeURIComponent(player.name ?? 'p')}/600/900`;
                    }
                  }}
                  referrerPolicy="no-referrer"
                  className={
                    fullBodyRender
                      ? "absolute inset-0 w-full h-full object-cover object-top drop-shadow-[0_0_80px_rgba(226,29,55,0.15)] select-none pointer-events-none"
                      : "absolute inset-x-0 bottom-0 w-full h-full object-contain object-bottom drop-shadow-[0_0_80px_rgba(226,29,55,0.15)] select-none pointer-events-none scale-[1.05]"
                  }
                  style={fullBodyRender ? undefined : { transformOrigin: 'bottom center' }}
                />
              </AnimatePresence>

              <div className="relative z-20 w-full px-6 pb-8 flex justify-center gap-2 items-end">
                {[
                  (() => {
                    const lastR = (player as any).ratings?.[(player as any).ratings?.length - 1];
                    const hgt = lastR?.hgt ?? 50;
                    const tp  = lastR?.tp;
                    const ovr2K = convertTo2KRating(player.overallRating ?? lastR?.ovr ?? 60, hgt, tp);
                    return { label: 'Rating', value: ovr2K, accent: '#e21d37' };
                  })(),
                  (() => {
                    // Match PlayerRatingsModal — regress-to-mean model, not raw .potential field.
                    const lastR = (player as any).ratings?.[(player as any).ratings?.length - 1];
                    const hgt = lastR?.hgt ?? 50;
                    const tp  = lastR?.tp;
                    const ageNow = realAge > 0 ? realAge : (player.age ?? 25);
                    const rawOvr = player.overallRating ?? 60;
                    const potBbgm = ageNow >= 29
                      ? rawOvr
                      : Math.max(rawOvr, Math.round(72.31428908571982 + (-2.33062761 * ageNow) + (0.83308748 * rawOvr)));
                    const pot2K = convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), hgt, tp);
                    return { label: 'Potential', value: pot2K, accent: null as string | null };
                  })(),
                ].map(({ label, value, accent }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center bg-black/80 border border-white/10 rounded-sm px-3 md:px-5 py-3 backdrop-blur-md min-w-[70px] shadow-2xl"
                    style={accent ? { borderColor: `${accent}50` } : {}}
                  >
                    <span className="text-[7px] md:text-[8px] font-black uppercase tracking-[0.2em] text-white/40 mb-1 block">
                      {label}
                    </span>
                    <span
                      className="text-2xl md:text-3xl font-black italic leading-none"
                      style={{ color: accent ?? 'white' }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-20 bg-[#050505] px-6 py-5 border-t border-white/5 grid grid-cols-3 md:grid-cols-6 gap-3">
              {[
                { label: 'Pos',  value: formatPos(player.pos) },
                { label: 'Age',  value: realAge > 0 ? realAge : (player.age ?? '—') },
                { label: 'Ht',   value: (() => {
                    const h = (player as any).hgt;
                    return typeof h === 'number' && h > 0 ? `${Math.floor(h / 12)}'${h % 12}"` : '—';
                  })() },
                { label: 'Wt',   value: (() => {
                    // Match PlayerBiosView pattern — weight can be a number OR a "195lb" string.
                    const raw = (player as any).weight;
                    const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : 0;
                    return num > 0 ? `${num}lb` : '—';
                  })() },
                { label: 'Exp',  value: (() => {
                    const draftYear = player.draft?.year;
                    if (!draftYear || draftYear <= 0) return 'UDFA';
                    const yrs = seasonYear - draftYear;
                    return yrs > 0 ? `${yrs}Y` : 'R';
                  })() },
                { label: 'Last', value: (() => {
                    const lastUSD = (player as any).lastSalaryUSD
                      ?? (player.contract?.amount ? player.contract.amount * 1_000 : 0);
                    return lastUSD > 0 ? formatSalaryM(lastUSD) : 'N/A';
                  })() },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/40 mb-1">{label}</p>
                  <p className="text-sm font-black italic uppercase text-white truncate">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0 bg-[#080808] overflow-hidden">

            <div className="flex bg-[#0f0f0f] border-b border-white/5 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`relative flex items-center gap-2 px-7 py-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${
                    activeTab === id ? 'text-[#e21d37]' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                  {activeTab === id && (
                    <motion.div
                      layoutId="tab-line"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#e21d37]"
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 lg:overflow-y-auto p-8 xl:p-10 pb-28 space-y-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {activeTab === 'NEGOTIATION' && (
                <div className="space-y-8">

                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={15} className="text-[#e21d37]" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50 italic">
                          Offer Strength
                        </span>
                      </div>
                      <span className="text-2xl font-black italic" style={{ color: interestColor }}>
                        {interest}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        animate={{ width: `${interest}%` }}
                        transition={{ type: 'spring', damping: 20 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: interestColor, boxShadow: `0 0 16px ${interestColor}60` }}
                      />
                    </div>
                    <p className="text-[9px] font-bold uppercase text-white/20 tracking-widest mt-2">
                      {interest >= 70 ? 'Strong interest — player is engaged' : interest >= 40 ? 'Moderate — room to improve' : 'Low — player is unlikely to accept'}
                    </p>
                  </div>

                  {/* Mother-team release likelihood — moves live as you slide the buyout contribution.
                      Higher retention pull = more money needed before the club lets go. */}
                  {buyout.applicable && (() => {
                    // Needed-ratio scales with retention pull — 50% floor so no overseas club is a pushover.
                    // High-retention clubs (Barça, Real Madrid) effectively need you to meet full ask.
                    const neededRatio = Math.max(0.5, competingInterest / 100);
                    const neededUSD = buyout.estimatedBuyoutUSD * neededRatio;
                    // Use total (team + player out-of-pocket) so the strength
                    // bar tracks the same number the mother club judges.
                    const release = neededUSD > 0
                      ? Math.min(100, Math.round((totalBuyoutPaidUSD / neededUSD) * 100))
                      : 100;
                    const color = release >= 100 ? '#22c55e' : release >= 60 ? '#f59e0b' : '#f43f5e';
                    const note = release >= 100
                      ? `${buyout.league} club will accept your buyout`
                      : release >= 60
                        ? `Getting warmer — bump your contribution to close it out`
                        : `${buyout.league} club not interested at this number`;
                    return (
                      <div className="bg-white/[0.04] border border-white/[0.06] rounded-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <TrendingUp size={15} style={{ color }} />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/50 italic">
                              {buyout.league} Mother Team Interest
                            </span>
                          </div>
                          <span className="text-2xl font-black italic" style={{ color }}>
                            {release}%
                          </span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            animate={{ width: `${release}%` }}
                            transition={{ type: 'spring', damping: 20 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: color, boxShadow: `0 0 16px ${color}60` }}
                          />
                        </div>
                        <p className="text-[9px] font-bold uppercase tracking-widest mt-2 text-white/20">
                          {note} · Retention pull {competingInterest}%
                        </p>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

                    <div className="space-y-6">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Contract Type</p>
                        <div className="flex border border-white/5 rounded-sm p-1 bg-black/60 gap-1">
                          {(['GUARANTEED', 'TWO_WAY'] as ContractType[]).map(type => {
                            const slotFull = type === 'GUARANTEED' ? roster.standardFull : roster.twoWayFull;
                            return (
                              <button
                                key={type}
                                onClick={() => {
                                  if (slotFull) {
                                    setToast(type === 'GUARANTEED'
                                      ? `Standard roster full (${roster.standardCount}/${roster.maxStandard}) — only two-way deals available. Waive someone first.`
                                      : `Two-way roster full (${roster.twoWayCount}/${roster.maxTwoWay}) — only standard deals available.`);
                                    return;
                                  }
                                  setContractType(type);
                                }}
                                className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-sm transition-all ${
                                  contractType === type
                                    ? 'bg-[#e21d37] text-white shadow-lg'
                                    : slotFull
                                      ? 'text-white/20 cursor-not-allowed'
                                      : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                                }`}
                              >
                                {type.replace('_', ' ')}
                                {slotFull && <span className="ml-1 text-[8px] opacity-60">(full)</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex justify-between items-center mb-2">
                          Year 1 Salary
                          <div className="flex gap-3 text-[10px]">
                            <span className="text-[#e21d37]">MIN {formatSalaryM(minAllowed)}</span>
                            <span className="text-white/50">MAX {formatSalaryM(maxAllowed)}</span>
                          </div>
                        </label>
                        <div className={`flex items-center justify-between h-16 bg-white/[0.04] border border-white/10 rounded-sm px-4 transition-all ${
                          contractType === 'TWO_WAY' ? 'opacity-40' : 'hover:border-[#e21d37]/40'
                        }`}>
                          <button
                            {...decSalaryProps}
                            disabled={contractType === 'TWO_WAY' || salary <= minAllowed}
                            className="text-white/30 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed touch-none select-none"
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <div className="text-center">
                            <span className="text-2xl font-black italic text-white">{formatSalaryMPrecise(salary, 2)}</span>
                            <p className="text-[8px] font-bold uppercase text-white/30 tracking-widest mt-0.5">Starting Amount</p>
                          </div>
                          <button
                            {...incSalaryProps}
                            disabled={contractType === 'TWO_WAY' || salary >= maxAllowed}
                            className="text-white/30 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed touch-none select-none"
                          >
                            <ChevronRight size={18} />
                          </button>
                        </div>
                        {contractType !== 'TWO_WAY' && (
                          <div className="mt-2 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-white/20 transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, ((salary - minAllowed) / Math.max(1, maxAllowed - minAllowed)) * 100))}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {[
                          {
                            label: 'Years',
                            display: formattedYears,
                            decProps: decYearsProps,
                            incProps: incYearsProps,
                            disabled: false,
                          },
                          {
                            label: 'Incentive',
                            display: option === 'NONE' ? 'None' : `${option === 'PLAYER' ? 'Player' : 'Team'} Opt.`,
                            decProps: decOptionProps,
                            incProps: incOptionProps,
                            disabled: contractType === 'TWO_WAY',
                          },
                        ].map(({ label, display, decProps, incProps, disabled }) => (
                          <div key={label}>
                            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">{label}</p>
                            <div className={`flex items-center justify-between h-12 bg-white/[0.04] border border-white/10 rounded-sm px-2 ${disabled ? 'opacity-30' : ''}`}>
                              <button {...decProps} disabled={disabled} className="text-white/30 hover:text-white p-1 disabled:cursor-not-allowed touch-none select-none">
                                <ChevronLeft size={14} />
                              </button>
                              <span className="text-sm font-black italic text-white uppercase truncate text-center flex-1">
                                {display}
                              </span>
                              <button {...incProps} disabled={disabled} className="text-white/30 hover:text-white p-1 disabled:cursor-not-allowed touch-none select-none">
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Bird Rights + Supermax eligibility read-outs — non-editable,
                          surface what the contract limits logic derived so the user
                          knows whether max / supermax / extra years are unlocked. */}
                      {(() => {
                        const hasBird = isResign || !!(player as any).hasBirdRights;
                        const svc = ((player as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
                        const recent = ((player as any).awards ?? []).filter((a: any) => a.season && a.season >= (leagueStats?.year ?? 2026) - 3);
                        const notableAwards = recent
                          .filter((a: any) => /all.nba|mvp|defensive player|dpoy/i.test(a.type ?? ''))
                          .map((a: any) => a.type);
                        return (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">Bird Rights</p>
                              <div className={`flex items-center justify-center h-12 bg-white/[0.04] border rounded-sm ${hasBird ? 'border-emerald-500/40' : 'border-white/10'}`}>
                                <span className={`text-sm font-black italic uppercase ${hasBird ? 'text-emerald-300' : 'text-white/40'}`}>
                                  {hasBird ? 'Yes' : 'No'}
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">Supermax</p>
                              <div className={`flex items-center justify-center h-12 bg-white/[0.04] border rounded-sm ${limits.isSupermaxEligible ? 'border-amber-500/50' : 'border-white/10'}`}>
                                <span
                                  className={`text-[10px] font-black italic uppercase text-center leading-tight px-1 ${limits.isSupermaxEligible ? 'text-amber-300' : 'text-white/40'}`}
                                  title={limits.isSupermaxEligible
                                    ? (svc >= 8 ? `${svc}yrs service` : notableAwards.slice(0, 2).join(', ') || 'Eligible')
                                    : `Needs 8+ yrs svc OR recent All-NBA/MVP/DPOY${hasBird ? '' : ' + Bird Rights'}`}
                                >
                                  {limits.isSupermaxEligible
                                    ? (svc >= 8 ? `${svc}yr svc` : (notableAwards[0] ?? 'Eligible'))
                                    : 'Not Eligible'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* External-league buyout — only for overseas players still under contract abroad */}
                      {buyout.applicable && contractType !== 'TWO_WAY' && (
                        <div>
                          <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex justify-between items-center mb-2">
                            Buyout — {buyout.league}
                            <span className="text-[10px] text-orange-400">
                              Asking {formatSalaryM(buyout.estimatedBuyoutUSD)}
                            </span>
                          </label>
                          <div className="bg-white/[0.04] border border-white/10 rounded-sm p-4 space-y-3">
                            <div className="flex items-baseline justify-between">
                              <span className="text-[9px] font-bold uppercase text-white/40 tracking-widest">Your Contribution</span>
                              <span className="text-lg font-black italic text-white">{formatSalaryMPrecise(teamBuyoutContribUSD, 2)}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={buyout.teamMaxContributionUSD}
                              step={25_000}
                              value={teamBuyoutContribUSD}
                              onChange={e => setTeamBuyoutContribUSD(parseInt(e.target.value))}
                              className="w-full accent-orange-500"
                            />
                            <div className="flex justify-between text-[9px] font-bold uppercase text-white/30 tracking-widest">
                              <span>Min $0</span>
                              <span>FIBA Cap {formatSalaryM(buyout.teamMaxContributionUSD)}</span>
                            </div>
                            <div className="pt-2 border-t border-white/5">
                              <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest">
                                <span className="text-white/40">Player Pays (out of pocket)</span>
                                <span className="text-amber-300">
                                  {formatSalaryM(Math.max(0, buyout.estimatedBuyoutUSD - teamBuyoutContribUSD))}
                                </span>
                              </div>
                              <p className="text-[8px] text-white/30 italic mt-1 leading-relaxed normal-case tracking-normal">
                                FIBA cap limits your team's contribution to {formatSalaryM(buyout.teamMaxContributionUSD)}. Any remainder is paid by the player — usually from their NBA signing bonus.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-[#0d0d0d] border border-white/5 rounded-sm overflow-hidden">
                      <div className="bg-white/[0.04] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-widest italic text-white/40">
                          Cap Projection
                        </span>
                        <span className="text-[8px] font-bold uppercase text-emerald-400">+5% Escalator</span>
                      </div>
                      <div className="divide-y divide-white/[0.04]">
                        {yearsTable.map((row, i) => (
                          <div key={row.year} className="grid grid-cols-3 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                            <div>
                              <p className="text-[8px] font-bold text-white/20 uppercase">Season {i + 1}</p>
                              <p className="text-xs font-black italic text-white/60">
                                {row.year}–{String(row.year + 1).slice(-2)}
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-[8px] font-bold text-white/20 uppercase">Salary</p>
                              <p className="text-xs font-black italic text-white">{formatSalaryM(row.salary)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[8px] font-bold text-white/20 uppercase">Cap Rm</p>
                              <p className={`text-xs font-black italic ${row.capRoom < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {row.capRoom < 0 ? '-' : ''}{formatSalaryM(Math.abs(row.capRoom))}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'MORALE' && <PlayerBioMoraleTab player={player} />}

              {activeTab === 'CONTRACT' && <PlayerBioContractTab player={player} />}

              {activeTab === 'FINANCES' && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="bg-white/[0.04] p-7 rounded-sm border border-white/5">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#e21d37] mb-5 italic border-b border-[#e21d37]/20 pb-3">
                        Roster Financials
                      </h4>
                      {(() => {
                        const mleLabel = mle.type === 'room'
                          ? 'Room MLE Remaining'
                          : mle.type === 'non_taxpayer'
                            ? 'Non-Taxpayer MLE Remaining'
                            : mle.type === 'taxpayer'
                              ? 'Taxpayer MLE Remaining'
                              : 'MLE';
                        const mleValue = mle.type
                          ? `${formatSalaryM(mle.available)} / ${formatSalaryM(mle.limit)}`
                          : 'Unavailable';
                        const mleAccent = mle.blocked ? 'text-rose-400' : 'text-emerald-400';
                        const capSpace = thresholds.salaryCap - teamPayroll;
                        return [
                          { label: 'Total Active Payroll', value: formatSalaryM(teamPayroll),                                    accent: 'text-white' },
                          { label: 'Cap Space Remaining',  value: formatSalaryM(capSpace),                                      accent: capSpace >= 0 ? 'text-emerald-400' : 'text-rose-400' },
                          { label: 'Luxury Tax Line',      value: formatSalaryM(thresholds.luxuryTax),                           accent: 'text-white' },
                          { label: 'First Apron',          value: formatSalaryM(thresholds.firstApron),                          accent: 'text-amber-400' },
                          { label: mleLabel,               value: mleValue,                                                       accent: mleAccent },
                        ];
                      })().map(({ label, value, accent }) => (
                        <div key={label} className="flex justify-between items-center py-3 border-b border-white/[0.04] last:border-0">
                          <span className="text-[10px] font-bold uppercase text-white/40 tracking-wide">{label}</span>
                          <span className={`text-sm font-black italic ${accent}`}>{value}</span>
                        </div>
                      ))}
                    </div>

                    <div className="bg-white/[0.04] p-7 rounded-sm border border-white/5">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-4 italic">Market Value</h4>
                      <div className="flex items-center gap-4">
                        <div className="w-1.5 h-14 bg-emerald-500 rounded-full" />
                        <div>
                          <span className="text-2xl font-black italic text-white">
                            {formatSalaryM(initialOffer.salaryUSD)}
                            <span className="text-xs text-white/30 not-italic ml-2">/ {initialOffer.years} Yrs</span>
                          </span>
                          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1">
                            Based on OVR {player.overallRating} — Tier {initialOffer.tier}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0d0d0d] p-7 rounded-sm border border-white/5">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-6 italic">CBA Thresholds</h4>
                    <div className="space-y-5">
                      {[
                        { label: 'Salary Cap',    val: thresholds.salaryCap   },
                        { label: 'Luxury Tax',    val: thresholds.luxuryTax   },
                        { label: 'First Apron',   val: thresholds.firstApron  },
                        { label: 'Second Apron',  val: thresholds.secondApron },
                      ].map(t => (
                        <div key={t.label}>
                          <div className="flex justify-between text-[9px] font-bold text-white/30 uppercase mb-1.5">
                            <span>{t.label}</span>
                            <span>{formatSalaryM(t.val)}</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#e21d37] to-[#e21d37]/60 rounded-full"
                              style={{ width: `${Math.min(100, (teamPayroll / t.val) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'OFFERS' && (
                <div className="space-y-6">
                  <div className="bg-white/[0.04] p-7 rounded-sm border border-white/5">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-2 italic">
                      Active Market Bids
                    </h4>
                    <p className="text-[9px] text-white/30 uppercase tracking-widest mb-7">
                      Competing offers from opposing front offices
                    </p>
                    <p className="text-[11px] text-white/40 italic">No competing bids on record.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-8 xl:px-10 py-6 bg-black/50 border-t border-white/5 flex items-center justify-end shrink-0">
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-8 py-3 bg-white/5 border border-white/10 rounded-sm text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all"
                >
                  Withdraw
                </button>
                {/* Sign with MLE — only when the team has an MLE tier available; grayed when the salary overshoots the cap on it. */}
                {contractType !== 'TWO_WAY' && mle.type && (() => {
                  const mleCanCover = !mle.blocked && salary > 0 && salary <= mle.available;
                  const mleLabel = mle.type === 'room' ? 'Room MLE' : mle.type === 'non_taxpayer' ? 'NT MLE' : 'Tax MLE';
                  return (
                    <button
                      disabled={!mleCanCover}
                      onClick={() => {
                        if (!mleCanCover) return;
                        if (autoAccept) onSign({ salary, years, option } as any);
                        else setShowResponse(true);
                      }}
                      title={mleCanCover
                        ? `Uses ${mleLabel} — ${formatSalaryM(mle.available)} available`
                        : `Salary exceeds ${mleLabel} limit (${formatSalaryM(mle.available)} available)`}
                      className={`px-6 py-3 rounded-sm text-[10px] font-black italic uppercase tracking-widest transition-all ${
                        mleCanCover
                          ? 'bg-blue-600 text-white hover:scale-[1.02]'
                          : 'bg-blue-900/30 text-blue-300/30 cursor-not-allowed'
                      }`}
                    >
                      Sign with {mleLabel}
                    </button>
                  );
                })()}
                <button
                  onClick={() => {
                    // Final cap check — only for GUARANTEED signings that aren't covered by Bird Rights or an MLE.
                    const projectedPayroll = teamPayroll + salary;
                    const blownCap = contractType !== 'TWO_WAY' && !isResign && projectedPayroll > thresholds.salaryCap && (mle.blocked || salary > mle.available);
                    if (blownCap) {
                      setShowCapWarning(true);
                      return;
                    }
                    if (autoAccept) {
                      onSign({ salary, years, option, twoWay: contractType === 'TWO_WAY', mleType: (contractType === 'TWO_WAY' || (mle?.blocked ?? true)) ? null : (mle?.type ?? null) });
                    } else {
                      setShowResponse(true);
                    }
                  }}
                  className="px-10 py-3 bg-[#e21d37] rounded-sm text-[10px] font-black italic uppercase tracking-widest text-white hover:scale-[1.02] transition-all"
                >
                  {autoAccept ? 'Finalize Deal' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SigningModal;
