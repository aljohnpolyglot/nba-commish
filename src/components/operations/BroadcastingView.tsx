import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Tv } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useGame } from '../../store/GameContext';
import { useLeagueLabels } from '../../utils/leagueLabels';
import { useRosterComplianceGate } from '../../hooks/useRosterComplianceGate';
import { useDraftEventGate } from '../../hooks/useDraftEventGate';
import { compareGameDates } from '../../utils/dateUtils';
import { BroadcastingDashboardStep } from './BroadcastingDashboardStep';
import { BroadcastingRosterStep } from './BroadcastingRosterStep';
import {
  BASE_LP_SUBS,
  BROADCASTERS,
  BroadcastFilter,
  BroadcastingMetrics,
  BroadcastingViewStep,
  getBroadcastPartnerName,
  getGrade,
  gradeColor,
  OPTIMAL_LP_PRICE,
  PHASE_DATA,
  SCHEDULE_DAYS,
  TOTAL_REV_TARGET,
  ValidationModal,
  WarningModal,
} from './BroadcastingShared';
import { BroadcastingStrategyStep } from './BroadcastingStrategyStep';

export const BroadcastingView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const isFictional = state.leagueType === 'fictional';
  const bcName = (id: string) => getBroadcastPartnerName(id, isFictional);
  const labels = useLeagueLabels();
  const phaseName = (phase: { id: string; name: string }) => phase.id === 'nbacupinseason' ? labels.cupShort : phase.name;
  const rosterGate = useRosterComplianceGate();
  const draftGate = useDraftEventGate();

  const isLocked = state.leagueStats.mediaRights?.isLocked === true;
  const broadcastDeadline = `${state.leagueStats.year ?? new Date().getFullYear()}-06-30`;
  const isAfterDeadline = compareGameDates(state.date, broadcastDeadline) >= 0;
  const readOnly = isLocked || isAfterDeadline;

  const [view, setView] = useState<BroadcastingViewStep>('roster');
  const [activeBroadcasters, setActiveBroadcasters] = useState<string[]>(['espn', 'tnt', 'abc']);
  const [phaseAssignments, setPhaseAssignments] = useState<Record<string, string[]>>({});
  const [scheduleAssignments, setScheduleAssignments] = useState<Record<string, string[]>>({});
  const [lpPrice, setLpPrice] = useState(19.99);
  const [currentBroadcaster, setCurrentBroadcaster] = useState<string | null>('espn');
  const [filter, setFilter] = useState<BroadcastFilter>('All');
  const [sortBy, setSortBy] = useState<'fee' | 'reach' | 'approval'>('fee');
  const [validationItems, setValidationItems] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [warningItems, setWarningItems] = useState<string[]>([]);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (readOnly) setView('dashboard');
  }, [readOnly]);

  useEffect(() => {
    const saved = state.leagueStats.mediaRights;
    if (!saved) return;
    setActiveBroadcasters(saved.activeBroadcasters);
    setLpPrice((saved as { lpPriceMonthly?: number }).lpPriceMonthly ?? saved.lpPrice ?? 19.99);
    if ((saved as { phaseAssignments?: Record<string, string[]> }).phaseAssignments) {
      setPhaseAssignments((saved as { phaseAssignments: Record<string, string[]> }).phaseAssignments);
    }
    if ((saved as { scheduleAssignments?: Record<string, string[]> }).scheduleAssignments) {
      setScheduleAssignments((saved as { scheduleAssignments: Record<string, string[]> }).scheduleAssignments);
    }
  }, [state.leagueStats.mediaRights]);

  useEffect(() => {
    if (activeBroadcasters.length > 0 && (!currentBroadcaster || !activeBroadcasters.includes(currentBroadcaster))) {
      setCurrentBroadcaster(activeBroadcasters[0]);
    } else if (activeBroadcasters.length === 0) {
      setCurrentBroadcaster(null);
    }
  }, [activeBroadcasters, currentBroadcaster]);

  const metrics = useMemo<BroadcastingMetrics>(() => {
    const active = BROADCASTERS.filter(broadcaster => activeBroadcasters.includes(broadcaster.id));
    const hasStreameast = activeBroadcasters.includes('streameast');

    let mediaRev = active.reduce((sum, broadcaster) => sum + broadcaster.fee, 0);
    if (hasStreameast) mediaRev *= 0.75;

    const priceDiff = lpPrice - OPTIMAL_LP_PRICE;
    let subsMultiplier = Math.max(0.2, 1 - priceDiff * 0.05);
    if (hasStreameast) subsMultiplier *= 0.5;
    const subs = BASE_LP_SUBS * subsMultiplier;
    const lpRev = (lpPrice * subs * 12) / 1000;
    const totalRev = mediaRev + lpRev + 3.8;
    const salaryCap = 154.6 * (totalRev / TOTAL_REV_TARGET);

    let totalExpectedViewers = 0;
    let totalDays = 0;
    PHASE_DATA.forEach(phase => {
      const ids = phaseAssignments[phase.id] || [];
      const phaseReach = ids.length > 0
        ? ids.reduce((sum, id) => {
          const broadcaster = BROADCASTERS.find(entry => entry.id === id);
          return sum + (broadcaster?.reach ?? 0);
        }, 0) / ids.length
        : 0;
      totalExpectedViewers += phase.baseViewers * phaseReach * phase.days;
      totalDays += phase.days;
    });

    let scheduleViewers = 0;
    SCHEDULE_DAYS.forEach(scheduleDay => {
      const ids = scheduleAssignments[scheduleDay.day] || [];
      const dayReach = ids.length > 0
        ? ids.reduce((sum, id) => {
          const broadcaster = BROADCASTERS.find(entry => entry.id === id);
          return sum + (broadcaster?.reach ?? 0);
        }, 0) / ids.length
        : 0;
      scheduleViewers += (scheduleDay.pri + scheduleDay.sec) * dayReach * 0.1;
    });

    const viewership = ((totalExpectedViewers / Math.max(1, totalDays)) + scheduleViewers)
      * (hasStreameast ? 1.4 : 1)
      * (subsMultiplier * 0.8 + 0.2);

    const streamingCount = active.filter(broadcaster => broadcaster.type === 'streaming').length;
    const paywallPenalty = Math.max(0, (streamingCount - 2) * 0.05);
    const pricePenalty = Math.max(0, (lpPrice - 14.99) * 0.01);
    const hasPIF = active.some(broadcaster => broadcaster.id === 'pif');
    const integrityPenalty = hasPIF ? 0.6 : active.some(broadcaster => broadcaster.id === 'fanduel') ? 0.2 : 0;
    const baseApproval = active.length > 0
      ? active.reduce((sum, broadcaster) => sum + broadcaster.approval, 0) / active.length
      : 0.5;
    let approval = Math.max(0, Math.min(1.1, baseApproval - paywallPenalty - pricePenalty - integrityPenalty));
    if (hasPIF) approval = Math.min(approval, 0.15);
    const approvalGrade = getGrade(approval, { S: 0.9, A: 0.8, B: 0.7, C: 0.5, D: 0.3 });
    const avgReach = active.length > 0
      ? active.reduce((sum, broadcaster) => sum + broadcaster.reach, 0) / active.length
      : 0;

    return { totalRev, mediaRev, lpRev, salaryCap, viewership, avgReach, approval, approvalGrade, subs, streamingCount, hasStreameast, integrityPenalty };
  }, [activeBroadcasters, lpPrice, phaseAssignments, scheduleAssignments]);

  const savedRights = readOnly ? state.leagueStats.mediaRights : null;
  const dispMediaRev = savedRights?.mediaRev ?? metrics.mediaRev;
  const dispTotalRev = savedRights?.totalRev ?? metrics.totalRev;
  const dispSalaryCap = readOnly ? (state.leagueStats.salaryCap ?? 154_647_000) / 1_000_000 : metrics.salaryCap;

  const toggleBroadcaster = (id: string) => {
    if (readOnly) return;
    const broadcaster = BROADCASTERS.find(entry => entry.id === id);
    if (!broadcaster) return;

    if (activeBroadcasters.includes(id)) {
      setActiveBroadcasters(prev => prev.filter(entry => entry !== id));
      setPhaseAssignments(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          next[key] = next[key].filter(entry => entry !== id);
        });
        return next;
      });
      setScheduleAssignments(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          next[key] = next[key].filter(entry => entry !== id);
        });
        return next;
      });
      return;
    }

    setActiveBroadcasters(prev => [...prev, id]);
    setPhaseAssignments(prev => {
      const next = { ...prev };
      broadcaster.defaultPhases.forEach(phaseId => {
        if (!next[phaseId]) next[phaseId] = [];
        if (!next[phaseId].includes(id)) next[phaseId] = [...next[phaseId], id];
      });
      return next;
    });
    setScheduleAssignments(prev => {
      const next = { ...prev };
      broadcaster.defaultSchedule.forEach(day => {
        if (!next[day]) next[day] = [];
        if (!next[day].includes(id)) next[day] = [...next[day], id];
      });
      return next;
    });
  };

  const togglePhaseAssignment = (phaseId: string, broadcasterId: string) => {
    if (readOnly) return;
    setPhaseAssignments(prev => {
      const current = prev[phaseId] || [];
      return { ...prev, [phaseId]: current.includes(broadcasterId) ? current.filter(id => id !== broadcasterId) : [...current, broadcasterId] };
    });
  };

  const toggleScheduleAssignment = (day: string, broadcasterId: string) => {
    if (readOnly) return;
    setScheduleAssignments(prev => {
      const current = prev[day] || [];
      return { ...prev, [day]: current.includes(broadcasterId) ? current.filter(id => id !== broadcasterId) : [...current, broadcasterId] };
    });
  };

  const autoFillRealWorld = () => {
    if (readOnly) return;
    setActiveBroadcasters(['espn', 'nbc', 'amazon']);
    setPhaseAssignments({
      preseason: ['espn', 'nbc', 'amazon'],
      openingweek: ['espn', 'nbc'],
      regularseason: ['espn', 'nbc', 'amazon'],
      nbacupinseason: ['amazon'],
      christmasdaygames: ['espn'],
      allstarweekend: ['nbc'],
      playintournament: ['amazon'],
      playoffsround1: ['espn', 'nbc', 'amazon'],
      playoffsround2: ['espn', 'nbc', 'amazon'],
      conferencefinals: ['espn', 'nbc', 'amazon'],
      nbafinals: ['espn'],
      nbadraftlottery: ['espn'],
      nbadraft: ['espn'],
    });
    setScheduleAssignments({
      Monday: ['nbc'],
      Tuesday: ['nbc'],
      Wednesday: ['espn'],
      Thursday: ['amazon'],
      Friday: ['amazon', 'espn'],
      Saturday: ['espn', 'amazon'],
      Sunday: ['nbc', 'espn'],
    });
    setLpPrice(19.99);
  };

  const handleNext = () => {
    if (view === 'roster') {
      if (activeBroadcasters.length === 0) return;
      setView('phases');
      return;
    }

    if (view === 'phases') {
      const missing = PHASE_DATA.filter(phase => !phaseAssignments[phase.id]?.length).map(phase => phaseName(phase));
      if (missing.length > 0) {
        setValidationItems(missing);
        setShowValidation(true);
        return;
      }
      setView('weekly');
      return;
    }

    if (view === 'weekly') {
      const warnings: string[] = [];
      const regIds = phaseAssignments.regularseason || [];
      const ghosted = activeBroadcasters.filter(id => !regIds.includes(id));
      if (ghosted.length > 0) {
        const names = ghosted.map(id => bcName(id) || BROADCASTERS.find(broadcaster => broadcaster.id === id)?.name).join(', ');
        warnings.push(`Ghost Partners: ${names} ${ghosted.length > 1 ? 'are' : 'is'} on payroll but skipped the Regular Season!`);
      }
      const emptyDays = SCHEDULE_DAYS.filter(scheduleDay => !scheduleAssignments[scheduleDay.day]?.length).map(scheduleDay => scheduleDay.day);
      if (emptyDays.length > 0) warnings.push(`Broadcast Blackout: ${emptyDays.join(', ')} have zero coverage. Fans will riot!`);
      if (warnings.length > 0) {
        setWarningItems(warnings);
        setShowWarning(true);
        return;
      }
      setView('leaguepass');
      return;
    }

    if (view === 'leaguepass') {
      setView('dashboard');
      return;
    }

    if (view !== 'dashboard' || readOnly) return;

    const newCapUSD = Math.round(metrics.salaryCap * 1_000_000);
    const taxPct = state.leagueStats.luxuryTaxThresholdPercentage ?? 121.5;

    dispatchAction({
      type: 'UPDATE_RULES',
      payload: {
        mediaRights: {
          activeBroadcasters,
          lpPrice,
          lpPriceMonthly: lpPrice,
          totalRev: metrics.totalRev,
          mediaRev: metrics.mediaRev,
          lpRev: metrics.lpRev,
          salaryCap: metrics.salaryCap,
          phaseAssignments,
          scheduleAssignments,
          isLocked: true,
        },
        salaryCap: newCapUSD,
        luxuryPayroll: Math.round(newCapUSD * taxPct / 100),
      },
    });

    const partnerNames = activeBroadcasters
      .map(id => bcName(id) || BROADCASTERS.find(broadcaster => broadcaster.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    const year = state.leagueStats.year ?? new Date().getFullYear();
    const dealOutcome = [
      `Commissioner ${state.commissionerName || 'of the NBA'} has officially finalized the league's media rights deal for the ${year - 1}-${String(year).slice(2)} season.`,
      `Broadcasting partners: ${partnerNames}.`,
      `Total media revenue: $${metrics.mediaRev.toFixed(2)}B. League Pass priced at $${lpPrice.toFixed(2)}/month (${metrics.subs.toFixed(1)}M projected subscribers).`,
      `Combined annual broadcast revenue: $${metrics.totalRev.toFixed(2)}B. New salary cap set at $${metrics.salaryCap.toFixed(1)}M.`,
      metrics.hasStreameast ? 'CONTROVERSY: Streameast (piracy platform) is included in the deal, raising serious integrity concerns across the league.' : '',
      metrics.integrityPenalty > 0 && activeBroadcasters.includes('pif') ? 'CONTROVERSY: Saudi Arabia\'s Public Investment Fund (PIF) is a broadcasting partner - this deal is widely condemned as sportswashing.' : '',
    ].filter(Boolean).join(' ');

    rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: dealOutcome,
        isSpecificEvent: true,
      },
    })));
  };

  const filteredBroadcasters = useMemo(() => {
    const list = [...BROADCASTERS].filter(broadcaster => {
      if (filter === 'National TV') return broadcaster.type === 'national';
      if (filter === 'Streaming') return broadcaster.type === 'streaming';
      return true;
    });
    list.sort((left, right) => sortBy === 'fee' ? right.fee - left.fee : sortBy === 'reach' ? right.reach - left.reach : right.approval - left.approval);
    return list;
  }, [filter, sortBy]);

  const stepLabel = view === 'roster' ? 'Confirm Roster' : view === 'phases' ? 'Next: Weekly' : view === 'weekly' ? 'Next: League Pass' : view === 'leaguepass' ? 'View Dashboard' : readOnly ? 'Locked' : 'Finalize Deal';
  const steps: BroadcastingViewStep[] = ['roster', 'phases', 'weekly', 'leaguepass', 'dashboard'];
  const stepLabels = ['Roster', 'Phases', 'Weekly', 'League Pass', 'Dashboard'];

  return (
    <div className="min-h-full bg-[#050714] text-zinc-300 selection:bg-indigo-500/30 pb-8">
      <header className="sticky top-0 bg-[#050714]/80 backdrop-blur-xl border-b border-[#1a1f35] z-40 px-4 md:px-8 py-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 flex items-center justify-center">
              <Tv size={18} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-tighter uppercase italic leading-none">{labels.mediaRights}</h1>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">Season 2025-26</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Broadcasting</span>
              <span className={`text-base font-black ${dispMediaRev >= 6.9 ? 'text-indigo-400' : 'text-white'}`}>${dispMediaRev.toFixed(2)}B</span>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Total Expected Rev</span>
              <span className={`text-base font-black ${dispTotalRev >= TOTAL_REV_TARGET ? 'text-emerald-400' : 'text-white'}`}>${dispTotalRev.toFixed(2)}B</span>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Salary Cap</span>
              <span className="text-base font-black text-amber-400">${dispSalaryCap.toFixed(1)}M</span>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Approval</span>
              <span className={`text-base font-black ${gradeColor(metrics.approvalGrade)}`}>{metrics.approvalGrade}</span>
            </div>

            {!readOnly && (
              <button
                onClick={autoFillRealWorld}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20"
              >
                2025-26 Deal
              </button>
            )}

            <button
              onClick={handleNext}
              disabled={readOnly || (view === 'roster' && activeBroadcasters.length === 0)}
              className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-1.5 ${readOnly || (view === 'roster' && activeBroadcasters.length === 0) ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 active:scale-95'}`}
            >
              {readOnly && <Lock size={12} />}
              {stepLabel}
            </button>
          </div>
        </div>

        {readOnly && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-medium">
            <Lock size={12} />
            {isLocked ? 'Deal finalized - Broadcasting rights are locked for this season.' : 'Season has started - deadline passed.'}
          </div>
        )}

        <div className="mt-3 flex items-center gap-1">
          {steps.map((step, index) => {
            const activeIndex = steps.indexOf(view);
            const isActive = view === step;
            const canClick = readOnly ? true : index <= activeIndex && !(index > 0 && activeBroadcasters.length === 0);
            return (
              <button
                key={step}
                onClick={() => canClick && setView(step)}
                disabled={!canClick}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${isActive ? readOnly ? 'bg-zinc-700 text-zinc-300' : 'bg-indigo-600 text-white' : canClick ? 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200' : 'text-zinc-700 cursor-not-allowed'}`}
              >
                {stepLabels[index]}
              </button>
            );
          })}
        </div>
      </header>

      <ValidationModal isOpen={showValidation} onClose={() => setShowValidation(false)} items={validationItems} />
      <WarningModal isOpen={showWarning} onClose={() => setShowWarning(false)} onConfirm={() => { setShowWarning(false); setView('leaguepass'); }} warnings={warningItems} />

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {view === 'roster' && (
            <BroadcastingRosterStep
              filteredBroadcasters={filteredBroadcasters}
              sortBy={sortBy}
              setSortBy={setSortBy}
              filter={filter}
              setFilter={setFilter}
              bcName={bcName}
              activeBroadcasters={activeBroadcasters}
              toggleBroadcaster={toggleBroadcaster}
              readOnly={readOnly}
              isFictional={isFictional}
            />
          )}

          {(view === 'phases' || view === 'weekly' || view === 'leaguepass') && (
            <BroadcastingStrategyStep
              view={view}
              activeBroadcasters={activeBroadcasters}
              currentBroadcaster={currentBroadcaster}
              setCurrentBroadcaster={setCurrentBroadcaster}
              phaseAssignments={phaseAssignments}
              scheduleAssignments={scheduleAssignments}
              togglePhaseAssignment={togglePhaseAssignment}
              toggleScheduleAssignment={toggleScheduleAssignment}
              lpPrice={lpPrice}
              setLpPrice={setLpPrice}
              metrics={metrics}
              phaseName={phaseName}
              bcName={bcName}
              readOnly={readOnly}
              isFictional={isFictional}
            />
          )}

          {view === 'dashboard' && (
            <BroadcastingDashboardStep
              metrics={metrics}
              dispTotalRev={dispTotalRev}
              dispSalaryCap={dispSalaryCap}
              phaseAssignments={phaseAssignments}
              scheduleAssignments={scheduleAssignments}
              phaseName={phaseName}
              handleNext={handleNext}
              readOnly={readOnly}
            />
          )}
        </AnimatePresence>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 bg-[#0c1021] border-t border-[#1a1f35] px-6 py-2 z-40 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Engine
          </span>
          <div className="w-px h-3 bg-zinc-800" />
          <span className="text-zinc-500">Broadcasters: {activeBroadcasters.length}</span>
          <div className="w-px h-3 bg-zinc-800" />
          <span className="text-zinc-500">Streaming: {metrics.streamingCount}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, (metrics.totalRev / 15) * 100)}%` }} />
          </div>
          <span className="text-[10px] font-black text-white tracking-widest">REV CAP</span>
        </div>
      </footer>
      {rosterGate.modal}
      {draftGate.modal}
    </div>
  );
};
