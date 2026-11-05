import React, { useMemo, useState } from 'react';
import { useGame } from '../../../store/GameContext';
import { formatCurrency, formatCurrencyWithCode } from '../../../utils/helpers';
import { contractToUSD, formatSalaryM, getCapThresholds, getTeamPayrollUSD, getMLEAvailability } from '../../../utils/salaryUtils';
import { ArrowLeft, AlertTriangle, Minus, Plus, Ticket, TrendingDown, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ContractTimeline } from '../../shared/ContractTimeline';
import { isEuroIsolatedMode, isPbaIsolatedMode, isWnbaIsolatedMode } from '../../../utils/uiMode';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { areNonGuaranteedContractsEnabled, areTwoWayContractsEnabled, isNonGuaranteedContract, isTwoWayContract } from '../../../utils/contractTypes';
import { isDeadMoneyEnabled, isMleEnabled } from '../../../utils/ruleFlags';
import { AnnualLedgerCard } from '../../tycoon/AnnualLedgerCard';
import { SponsorshipCard } from '../../tycoon/SponsorshipCard';
import { LedgerHistoryCard } from '../../tycoon/LedgerHistoryCard';
import { SponsorshipNegotiationModal } from '../../tycoon/SponsorshipNegotiationModal';
import { buildBudgetContext, computeAnnualBudget, getEuroFinanceProjectionReadiness } from '../../../services/tycoon/budgetEngine';
import type { SponsorshipSlot } from '../../../types/tycoon';
import { resolveSponsorLeagueKey } from '../../../data/sponsorCatalogFetcher';
import { getTicketPricingLevel, normalizeTicketPriceMultiplier } from '../../../services/tycoon/clubFinance';
import { getTycoonTierBase } from '../../../services/tycoon/tierBase';
import type { TicketPricingLevel } from '../../../types/tycoon';
import { EuroClubContractCommitments } from './EuroClubContractCommitments';
import { getLeagueCalendarDates } from '../../../services/leagueCalendar';
import { formatGameDateShort } from '../../../utils/dateUtils';
import {
  areWnbaDevelopmentalContractsEnabled,
  getWnbaDevelopmentalCompensationUSD,
  getWnbaDevelopmentalContractLabel,
} from '../../../services/wnba/developmentalContracts';

const COLORS = ['#38bdf8', '#facc15', '#4ade80', '#f87171', '#c084fc', '#fb923c', '#94a3b8'];
const TICKET_LEVEL_LABELS: Record<TicketPricingLevel, string> = {
  community: 'Community',
  value: 'Value',
  standard: 'Standard',
  premium: 'Premium',
  elite: 'Elite',
};

export const TeamFinancesViewDetailed: React.FC = () => {
  const { state, selectedTeamId, setCurrentView, applyTycoonMutation } = useGame();

  const pbaIsolated = isPbaIsolatedMode(state);
  const euroIsolated = isEuroIsolatedMode(state);
  const wnbaIsolated = isWnbaIsolatedMode(state);
  const defaultTeamId = euroIsolated && state.userTeamId != null
    ? state.userTeamId
    : pbaIsolated
    ? Number((state.nonNBATeams ?? []).find((team: any) => team?.league === 'PBA')?.tid ?? 0)
    : state.teams[0]?.id ?? 0;
  const teamId = selectedTeamId ?? defaultTeamId;
  const currentYear = state.leagueStats.year;
  const nonGuaranteedGuaranteeDate = getLeagueCalendarDates(currentYear, state.leagueStats).nonGuaranteedGuaranteeDate;
  const nonGuaranteedGuaranteeLabel = nonGuaranteedGuaranteeDate
    ? formatGameDateShort(nonGuaranteedGuaranteeDate)
    : null;
  const [sponsorModal, setSponsorModal] = useState<{ open: boolean; slot: SponsorshipSlot }>({ open: false, slot: 'kit' });

  const capThresholds = getCapThresholds(state.leagueStats);
  const capRulesActive = Number.isFinite(capThresholds.salaryCap);
  const taxRulesActive = Number.isFinite(capThresholds.luxuryTax);
  const salaryCap = capRulesActive ? capThresholds.salaryCap : 0;
  const luxuryPayroll = taxRulesActive ? capThresholds.luxuryTax : 0;
  const { firstApron, secondApron } = capThresholds;
  const firstApronActive = capRulesActive && Number.isFinite(firstApron);
  const secondApronActive = capRulesActive && Number.isFinite(secondApron);

  const selectedTeam = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const teamPlayers = useMemo(
    () => state.players.filter(p => {
      if (p.tid !== teamId) return false;
      if (pbaIsolated) return p.status === 'PBA';
      if (wnbaIsolated) return p.status === 'WNBA';
      return !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '');
    }),
    [state.players, teamId, pbaIsolated, wnbaIsolated]
  );
  const twoWayEnabled = areTwoWayContractsEnabled(state.leagueStats);
  const developmentalActive = areWnbaDevelopmentalContractsEnabled(state.leagueStats);
  const secondaryContractLabel = getWnbaDevelopmentalContractLabel(state.leagueStats);
  const nonGuaranteedEnabled = areNonGuaranteedContractsEnabled(state.leagueStats);
  const isActiveTwoWay = (player: any) => twoWayEnabled && isTwoWayContract(player, state.leagueStats);
  const twoWayPlayers = useMemo(() => twoWayEnabled ? teamPlayers.filter(isActiveTwoWay) : [], [teamPlayers, twoWayEnabled, state.leagueStats]);
  const ngPlayers = useMemo(() => nonGuaranteedEnabled ? teamPlayers.filter(p => isNonGuaranteedContract(p, state.leagueStats)) : [], [teamPlayers, nonGuaranteedEnabled, state.leagueStats]);
  const standardPlayers = useMemo(() => teamPlayers.filter(p =>
    !isActiveTwoWay(p) &&
    (!nonGuaranteedEnabled || !isNonGuaranteedContract(p, state.leagueStats))
  ), [teamPlayers, nonGuaranteedEnabled, isActiveTwoWay, state.leagueStats]);

  const payroll = useMemo(() => {
    const guaranteedPlayers = state.players.filter((p: any) =>
      !(nonGuaranteedEnabled && p.tid === teamId && isNonGuaranteedContract(p, state.leagueStats))
    );
    return getTeamPayrollUSD(guaranteedPlayers, teamId, selectedTeam, currentYear, state.leagueStats as any);
  }, [state.players, teamId, selectedTeam, currentYear, nonGuaranteedEnabled, state.leagueStats]);
  const ngPayroll = useMemo(
    () => ngPlayers.reduce((s, p) => s + contractToUSD(p.contract?.amount || 0), 0),
    [ngPlayers],
  );
  const fullPayrollWithNG = payroll + ngPayroll;
  const deadMoneyEnabled = isDeadMoneyEnabled(state.leagueStats);
  const deadMoneyEntries = useMemo(() => deadMoneyEnabled ? selectedTeam?.deadMoney ?? [] : [], [deadMoneyEnabled, selectedTeam]);
  const deadMoneyThisSeason = useMemo(
    () => deadMoneyEntries.reduce((sum, e) => {
      const yr = e.remainingByYear.find(y => parseInt(y.season.split('-')[0], 10) + 1 === currentYear);
      return sum + (yr?.amountUSD ?? 0);
    }, 0),
    [deadMoneyEntries, currentYear],
  );

  const firstApronSpace = firstApronActive ? firstApron - payroll : 0;
  const secondApronSpace = secondApronActive ? secondApron - payroll : 0;

  const positionData = useMemo(() => {
    const groups = { Guards: 0, Forwards: 0, Centers: 0 };
    standardPlayers.forEach(p => {
      const usd = contractToUSD(p.contract?.amount || 0);
      const pos = p.pos || '';
      if (pos.includes('G')) groups.Guards += usd;
      else if (pos.includes('F')) groups.Forwards += usd;
      else if (pos.includes('C')) groups.Centers += usd;
    });
    return [
      { name: 'Guards', value: groups.Guards },
      { name: 'Forwards', value: groups.Forwards },
      { name: 'Centers', value: groups.Centers },
    ].filter(d => d.value > 0);
  }, [standardPlayers]);

  const playerPieData = useMemo(() =>
    [...standardPlayers]
      .sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0))
      .map(p => ({ name: p.name, value: contractToUSD(p.contract?.amount || 0), pos: p.pos })),
    [standardPlayers]
  );

  const highEarners = useMemo(() => playerPieData.filter(p => p.value >= 8_000_000), [playerPieData]);
  const showPayrollPie = capRulesActive && payroll > 0 && positionData.length > 0 && playerPieData.length > 0;
  const showHighEarners = capRulesActive && highEarners.length > 0;

  if (!selectedTeam) return null;
  if (euroIsolated) {
    const currency = state.leagueStats?.currency ?? 'EUR';
    const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
    const tycoon = (selectedTeam as any).tycoon;
    const sponsorLeague = resolveSponsorLeagueKey((selectedTeam as any).conference, selectedTeam.region, selectedTeam.name);

    if (!tycoon) {
      return (
        <div className="h-full overflow-y-auto p-8 bg-slate-950 text-white">
          <button onClick={() => setCurrentView('Team Office')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6"><ArrowLeft size={16} /> Back</button>
          <p className="text-slate-400">Club finance data is still loading — try reloading the save.</p>
        </div>
      );
    }

    const budgetContext = buildBudgetContext(state, Number((selectedTeam as any).id ?? (selectedTeam as any).tid));
    const projectionReadiness = getEuroFinanceProjectionReadiness(state, teamId);
    const pendingProjection = !projectionReadiness.matchday
      || !projectionReadiness.sponsorship
      || !projectionReadiness.mediaRights
      || !projectionReadiness.travel;
    const pendingLedger = {
      matchday: !projectionReadiness.matchday,
      sponsorship: !projectionReadiness.sponsorship,
      tv: !projectionReadiness.mediaRights,
      travel: !projectionReadiness.travel,
      profit: pendingProjection,
    };
    const liveLedger = computeAnnualBudget(
      selectedTeam as any,
      budgetContext,
      state.players,
    );

    const revenueTotal = liveLedger.revenue.matchday + (liveLedger.revenue.commercial ?? 0) + liveLedger.revenue.sponsorship + liveLedger.revenue.prize + liveLedger.revenue.tv + liveLedger.revenue.transfer;
    const utilizationPct = pendingProjection ? null : Math.round((liveLedger.expenses.wages / Math.max(revenueTotal, 1)) * 100);
    const canManage = Number(state.userTeamId ?? -1) === teamId;
    const ticketMultiplier = normalizeTicketPriceMultiplier(tycoon.ticketPriceMultiplier);
    const ticketLevel = getTicketPricingLevel(ticketMultiplier);
    const ticketPrice = getTycoonTierBase(tycoon.tier).ticketPrice
      * ticketMultiplier
      * budgetContext.economyIndex;
    const changeTicketPrice = (direction: -1 | 1) => {
      if (!canManage) return;
      const nextMultiplier = Math.max(0, ticketMultiplier + direction * 0.25);
      applyTycoonMutation(teamId, team => {
        if (!team.tycoon) return;
        team.tycoon.ticketPricingLevel = getTicketPricingLevel(nextMultiplier);
        team.tycoon.ticketPriceMultiplier = nextMultiplier;
      });
    };

    return (
      <div className="h-full overflow-y-auto p-4 md:p-8 bg-slate-950 text-white">
        <div className="max-w-6xl mx-auto space-y-6">
          <button onClick={() => setCurrentView('League Finances')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"><ArrowLeft size={16} /> Back to Team Finances</button>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300">Euro Finance · Tier {tycoon.tier}</div>
            <h1 className="text-3xl font-black uppercase tracking-tight mt-2">{getTeamFullName(selectedTeam)}</h1>
            <div className="grid gap-4 mt-6 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4">
                <p className="text-xs text-slate-500 uppercase font-black">Cash on Hand</p>
                <p className={`text-3xl font-black ${tycoon.cashOnHand >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>{fmt(tycoon.cashOnHand)}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4">
                <p className="text-xs text-slate-500 uppercase font-black">Annual Wage Bill</p>
                <p className="text-3xl font-black">{fmt(liveLedger.expenses.wages)}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4">
                <p className="text-xs text-slate-500 uppercase font-black">Budget Utilization</p>
                <p className={`text-3xl font-black ${utilizationPct == null ? 'text-sky-300' : ''}`}>{utilizationPct == null ? 'Pending' : `${utilizationPct}%`}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4">
                <p className="text-xs text-slate-500 uppercase font-black">Projected Profit</p>
                <p className={pendingProjection ? 'text-3xl font-black text-sky-300' : liveLedger.profit >= 0 ? 'text-3xl font-black text-emerald-400' : 'text-3xl font-black text-rose-400'}>{pendingProjection ? 'Pending' : fmt(liveLedger.profit)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-sky-400/20 bg-slate-900/70 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-xl bg-sky-400/10 p-2 text-sky-300"><Ticket size={20} /></div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-300">Ticket Pricing</p>
                  <p className="mt-1 text-lg font-black text-white">{ticketMultiplier === 0 ? 'Free admission' : TICKET_LEVEL_LABELS[ticketLevel]} · {ticketMultiplier.toFixed(2)}x · {fmt(ticketPrice)} per seat</p>
                  <p className="mt-1 text-xs text-slate-400">Projected Matchday revenue: {projectionReadiness.matchday ? fmt(liveLedger.revenue.matchday) : 'Pending fixture release'}</p>
                </div>
              </div>
              <div className="grid grid-cols-[44px_minmax(120px,1fr)_44px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                <button type="button" onClick={() => changeTicketPrice(-1)} disabled={!canManage || ticketMultiplier <= 0} aria-label="Lower ticket pricing" className="flex h-11 items-center justify-center border-r border-slate-700 text-slate-200 hover:bg-white/5 disabled:text-slate-700"><Minus size={16} /></button>
                <div className="flex h-11 items-center justify-center px-4 text-center text-xs font-black uppercase tracking-widest text-white">{ticketMultiplier.toFixed(2)}x</div>
                <button type="button" onClick={() => changeTicketPrice(1)} disabled={!canManage} aria-label="Raise ticket pricing" className="flex h-11 items-center justify-center border-l border-slate-700 text-slate-200 hover:bg-white/5 disabled:text-slate-700"><Plus size={16} /></button>
              </div>
            </div>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <AnnualLedgerCard ledger={liveLedger} currency={currency} pending={pendingLedger} />
            <div className="space-y-6">
              <SponsorshipCard tycoon={tycoon} currency={currency} leagueKey={sponsorLeague} onNegotiate={canManage ? (slot) => setSponsorModal({ open: true, slot }) : undefined} />
              <LedgerHistoryCard tycoon={tycoon} currency={currency} />
            </div>
          </div>
          <EuroClubContractCommitments tycoon={tycoon} currency={currency} currentYear={currentYear} />
          <ContractTimeline teamId={teamId} currentYear={currentYear} />
        </div>
        {canManage && <SponsorshipNegotiationModal
          open={sponsorModal.open}
          onClose={() => setSponsorModal({ open: false, slot: 'kit' })}
          initialSlot={sponsorModal.slot}
        />}
      </div>
    );
  }
  const mleAvailBase = isMleEnabled(state.leagueStats)
    ? getMLEAvailability(teamId, payroll, 0, capThresholds, state.leagueStats as any)
    : null;
  const reservedMleUSD = ((state.faBidding?.markets ?? []) as any[])
    .filter(m => !m?.resolved)
    .reduce((sum, market) => {
      const topMine = (market.bids ?? [])
        .filter((b: any) => b.teamId === teamId && b.status === 'active')
        .sort((a: any, b: any) => (b.salaryUSD ?? 0) - (a.salaryUSD ?? 0))[0];
      return sum + (topMine?.salaryUSD ?? 0);
    }, 0);
  const mleAvail = mleAvailBase
    ? {
        ...mleAvailBase,
        available: Math.max(0, mleAvailBase.available - reservedMleUSD),
        used: Math.min(mleAvailBase.limit, (mleAvailBase.used ?? 0) + reservedMleUSD),
      }
    : null;
  const mleBadge: { label: string; color: string; bg: string } | null =
    mleAvail && !mleAvail.blocked && mleAvail.available > 0
      ? mleAvail.type === 'room'
        ? { label: `Room MLE · ${formatSalaryM(mleAvail.available)}`, color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30' }
        : mleAvail.type === 'non_taxpayer'
        ? { label: `Non-Tax MLE · ${formatSalaryM(mleAvail.available)}`, color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30' }
        : { label: `Tax MLE · ${formatSalaryM(mleAvail.available)}`, color: 'text-yellow-300', bg: 'bg-yellow-500/15 border-yellow-500/30' }
      : null;

  const topThreshold = secondApronActive
    ? secondApron
    : firstApronActive
      ? firstApron
      : taxRulesActive
        ? luxuryPayroll
        : salaryCap;
  const maxBarValue = capRulesActive ? Math.max(payroll, topThreshold * 1.05) : Math.max(payroll, 1);
  const capPct = capRulesActive ? (salaryCap / maxBarValue) * 100 : 0;
  const taxPct = taxRulesActive ? Math.max(0, ((luxuryPayroll - salaryCap) / maxBarValue) * 100) : 0;
  const apron1Pct = firstApronActive ? Math.max(0, ((firstApron - (taxRulesActive ? luxuryPayroll : salaryCap)) / maxBarValue) * 100) : 0;
  const apron2Pct = firstApronActive && secondApronActive ? Math.max(0, ((secondApron - firstApron) / maxBarValue) * 100) : 0;
  const capMarkers = [
    { left: capPct, label: 'Cap', color: 'text-[#38bdf8]', value: salaryCap },
    ...(taxRulesActive ? [{ left: capPct + taxPct, label: 'Tax', color: 'text-[#facc15]', value: luxuryPayroll }] : []),
    ...(firstApronActive ? [{ left: capPct + taxPct + apron1Pct, label: '1st', color: 'text-slate-400', value: firstApron }] : []),
    ...(secondApronActive ? [{ left: capPct + taxPct + apron1Pct + apron2Pct, label: '2nd', color: 'text-orange-400', value: secondApron }] : []),
  ];

  const ThresholdStatus = ({ space, label }: { space: number; label: string }) => (
    <div className="flex items-center gap-2">
      {space >= 0
        ? <TrendingDown className="w-4 h-4 text-emerald-400" />
        : <TrendingUp className="w-4 h-4 text-rose-400" />}
      <span className={`font-bold ${space >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {space >= 0 ? `Below ${label}` : `Over ${label}`}
      </span>
      <span className="text-slate-500">
        {space >= 0 ? `by ${formatSalaryM(space)}` : `by ${formatSalaryM(Math.abs(space))}`}
      </span>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#1a1d24] text-slate-200">
      <div className="flex-shrink-0 border-b border-slate-800/50 p-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-4 mb-0">
          <button
            onClick={() => setCurrentView('League Finances')}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-white transition-colors flex-shrink-0"
          >
            <ArrowLeft size={14} /> <span className="hidden sm:inline">All Teams</span>
          </button>
          <div className="w-px h-5 bg-slate-700 flex-shrink-0" />
          <div className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 bg-slate-800 rounded-full p-1 sm:p-1.5 flex items-center justify-center">
            <img src={selectedTeam.logoUrl} alt={selectedTeam.abbrev} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
              {selectedTeam.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">{currentYear}–{currentYear + 1} Salary Cap Analysis</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-[#232730] rounded-xl p-4 sm:p-6 border border-slate-800/50">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 sm:mb-6 flex items-center gap-2">
                <span className="text-slate-500">$</span> TOTAL PAYROLL
              </h3>
              <div className="flex flex-col items-center justify-center mb-4 sm:mb-8">
                <p className="text-3xl sm:text-5xl font-bold text-white tracking-tight">{formatSalaryM(payroll)}</p>
                {ngPlayers.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Full (w/ NG): <span className="text-amber-400 font-bold">{formatSalaryM(fullPayrollWithNG)}</span>
                  </p>
                )}
              </div>
              {capRulesActive ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm flex-wrap gap-2">
                  {firstApronActive || secondApronActive ? (
                    <>
                      {firstApronActive && <ThresholdStatus space={firstApronSpace} label="1st Apron" />}
                      {secondApronActive && <ThresholdStatus space={secondApronSpace} label="2nd Apron" />}
                    </>
                  ) : (
                    <>
                      <ThresholdStatus space={salaryCap - payroll} label="Salary Cap" />
                      {taxRulesActive && <ThresholdStatus space={luxuryPayroll - payroll} label="Luxury Tax" />}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-sm font-bold text-slate-400">No salary cap for this season.</div>
              )}
              {mleBadge && (
                <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${mleBadge.bg} ${mleBadge.color}`}>
                  <span>⚡</span>
                  {mleBadge.label}
                </div>
              )}
            </div>
            <div className="bg-[#232730] rounded-xl p-4 sm:p-6 border border-slate-800/50">
              <div className="flex justify-between items-center mb-4 sm:mb-8">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <img src={selectedTeam.logoUrl} className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                  CAP UTILIZATION
                </h3>
                <span className="text-lg sm:text-xl font-bold text-white">{formatSalaryM(payroll)}</span>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[260px]">
                  {capRulesActive ? (
                    <>
                      <div className="text-center text-xs text-slate-500 mb-2">
                        Range: {formatSalaryM(salaryCap * 0.8)} → {formatSalaryM(maxBarValue)}
                      </div>
                      <div className="relative h-8 bg-slate-800/50 rounded-full overflow-hidden mb-4 flex">
                        <div className="h-full bg-[#38bdf8]" style={{ width: `${capPct}%` }} />
                        {taxRulesActive && <div className="h-full bg-[#facc15]" style={{ width: `${taxPct}%` }} />}
                        {firstApronActive && <div className="h-full bg-[#334155]" style={{ width: `${apron1Pct}%` }} />}
                        {secondApronActive && <div className="h-full bg-[#1e293b]" style={{ width: `${apron2Pct}%` }} />}
                      </div>
                      <div className="relative h-14 text-xs font-medium">
                        {capMarkers.map(marker => (
                          <div key={marker.label} className="absolute flex flex-col items-center" style={{ left: `${marker.left}%`, transform: 'translateX(-50%)' }}>
                            <span className={marker.color}>{marker.label}</span>
                            <span className="text-slate-500">{formatSalaryM(marker.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 px-4 py-6 text-center text-sm font-bold text-slate-400">
                      No salary cap for this season.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-[#232730] rounded-xl border border-slate-800/50 overflow-hidden flex flex-col">
              <div className="p-4 sm:p-6 border-b border-slate-800/50 flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <img src={selectedTeam.logoUrl} className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                  CONTRACT TIMELINE
                </h3>
              </div>
              <div className="flex-1">
                <ContractTimeline teamId={teamId} currentYear={currentYear} />
              </div>
            </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {showPayrollPie && <div className="bg-[#232730] rounded-xl p-4 sm:p-6 border border-slate-800/50">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <img src={selectedTeam.logoUrl} className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                  PAYROLL PIE BREAKDOWN
                </h3>
                <span className="text-xs text-slate-500">{formatSalaryM(payroll)} total</span>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-0">
                <div className="w-56 h-56 sm:w-64 sm:h-64 relative flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0, false)} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                      <Pie data={positionData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} stroke="#232730" strokeWidth={2}>
                        {positionData.map((_, index) => <Cell key={`c-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Pie data={playerPieData} dataKey="value" cx="50%" cy="50%" innerRadius={85} outerRadius={110} stroke="#232730" strokeWidth={2}>
                        {playerPieData.map((entry, index) => {
                          const epos = entry.pos || '';
                          const pi = epos.includes('G') ? 0 : epos.includes('F') ? 1 : 2;
                          return <Cell key={`cp-${index}`} fill={COLORS[pi % COLORS.length]} />;
                        })}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Payroll</span>
                    <span className="text-xl font-black text-white">{formatSalaryM(payroll)}</span>
                    <span className="text-[10px] text-slate-500">{positionData.length} groups</span>
                  </div>
                </div>
                <div className="sm:ml-8 space-y-3 sm:space-y-4 w-full sm:w-auto">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Position Share</h4>
                  {positionData.map((pos, idx) => (
                    <div key={pos.name} className="flex items-center justify-between gap-4 sm:gap-8">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <span className="text-sm font-medium text-slate-300">{pos.name}</span>
                      </div>
                      <span className="text-sm text-slate-400">{((pos.value / payroll) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>}
            {showHighEarners && <div className="bg-[#232730] rounded-xl p-4 sm:p-6 border border-slate-800/50">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <img src={selectedTeam.logoUrl} className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                  HIGH-EARNERS PIE
                </h3>
                <span className="text-xs text-slate-500">$8M+ only</span>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-0">
                <div className="w-56 h-56 sm:w-64 sm:h-64 relative flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0, false)} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                      <Pie data={highEarners} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={110} stroke="#232730" strokeWidth={3}>
                        {highEarners.map((entry, index) => {
                          const epos = entry.pos || '';
                          const pi = epos.includes('G') ? 0 : epos.includes('F') ? 1 : 2;
                          return <Cell key={`he-${index}`} fill={COLORS[pi % COLORS.length]} />;
                        })}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">High Earners</span>
                    <span className="text-xl font-black text-white">{formatSalaryM(highEarners.reduce((s, p) => s + p.value, 0))}</span>
                    <span className="text-[10px] text-slate-500">{highEarners.length} players at $8M+</span>
                  </div>
                </div>
                <div className="sm:ml-8 flex-1 w-full">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Players ({formatSalaryM(highEarners.reduce((s, p) => s + p.value, 0))} Total)
                  </h4>
                  <div className="space-y-2 sm:space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                    {highEarners.map((player, idx) => {
                      const ppos = player.pos || '';
                      const pi = ppos.includes('G') ? 0 : ppos.includes('F') ? 1 : 2;
                      return (
                        <div key={player.name} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS[pi % COLORS.length] }} />
                            <span className="text-sm font-medium text-slate-300 truncate max-w-[120px]">{player.name}</span>
                          </div>
                          <span className="text-sm font-bold text-white">{formatSalaryM(player.value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>}
          </div>
          {(twoWayPlayers.length > 0 || ngPlayers.length > 0 || deadMoneyEntries.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {twoWayPlayers.length > 0 && (
                <div className="bg-[#232730] rounded-xl p-4 border border-slate-800/50">
                  <h3 className="text-xs font-bold text-violet-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                    {secondaryContractLabel} Contracts
                    <span className="text-slate-600 font-normal normal-case tracking-normal">(cap-exempt)</span>
                  </h3>
                  <div className="space-y-2">
                    {twoWayPlayers.map(p => (
                      <div key={p.internalId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded border border-violet-500/40">{developmentalActive ? 'DEV' : '2W'}</span>
                          <span className="text-sm text-slate-300">{p.name}</span>
                          <span className="text-[10px] text-slate-500">{p.pos}</span>
                        </div>
                        <span className="text-sm font-bold text-violet-300">{formatSalaryM(developmentalActive ? getWnbaDevelopmentalCompensationUSD(p, state.leagueStats) : contractToUSD(p.contract?.amount || 0))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ngPlayers.length > 0 && (
                <div className="bg-[#232730] rounded-xl p-4 border border-amber-500/20">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                    Non-Guaranteed
                    <span className="text-slate-600 font-normal normal-case tracking-normal">
                      {nonGuaranteedGuaranteeLabel ? `(guarantee by ${nonGuaranteedGuaranteeLabel} or cut)` : '(no automatic guarantee deadline)'}
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {ngPlayers.map(p => (
                      <div key={p.internalId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">NG</span>
                          <span className="text-sm text-slate-300">{p.name}</span>
                          <span className="text-[10px] text-slate-500">{p.pos}</span>
                        </div>
                        <span className="text-sm font-bold text-amber-300">{formatSalaryM(contractToUSD(p.contract?.amount || 0))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {deadMoneyEntries.length > 0 && (
                <div className="bg-[#1a1d24] rounded-xl p-4 border border-slate-700/50">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                    Dead Money
                    <span className="text-slate-600 font-normal normal-case tracking-normal">
                      (waived contracts — still on cap · ${(deadMoneyThisSeason / 1_000_000).toFixed(1)}M this season)
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {deadMoneyEntries.map(entry => {
                      const yr = entry.remainingByYear.find(y => parseInt(y.season.split('-')[0], 10) + 1 === currentYear);
                      const total = entry.remainingByYear.reduce((s, y) => s + y.amountUSD, 0);
                      const lastYear = entry.remainingByYear[entry.remainingByYear.length - 1];
                      return (
                        <div key={entry.playerId} className="flex items-center justify-between opacity-60">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-500 bg-slate-700/40 px-1.5 py-0.5 rounded border border-slate-700">
                              {entry.stretched ? 'STRETCH' : 'DEAD'}
                            </span>
                            <span className="text-sm text-slate-400 line-through">{entry.playerName}</span>
                            <span className="text-[10px] text-slate-600">
                              waived {entry.waivedDate} · thru {lastYear?.season ?? '?'}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-slate-400">{formatSalaryM(yr?.amountUSD ?? 0)}</div>
                            <div className="text-[9px] text-slate-600">${(total / 1_000_000).toFixed(1)}M total</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
