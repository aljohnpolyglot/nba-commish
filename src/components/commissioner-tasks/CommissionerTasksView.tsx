import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { CommissionerTaskPhase, CommissionerTaskView, Tab } from '../../types';
import { useGame } from '../../store/GameContext';
import {
  getCommissionerSeasonReviewSeason,
  getCommissionerTaskViews,
  isCommissionerTaskTerminal,
  updateCommissionerTaskRecord,
} from '../../services/commissionerTasks/taskRegistry';
import { CommissionerTaskModal } from './CommissionerTaskModal';
import { requestSeasonReviewView } from '../news/SeasonReviewNav';
import { getCommissionerTaskDisplayTitle } from '../../services/franchises/franchiseEventNaming';
import { resolveCommissionerTask } from '../../services/commissionerTasks/taskResolution';
import { ensureFranchiseLeagueEvents } from '../../services/franchises/franchiseSponsors';

interface Props {
  onNavigate: (view: Tab) => void;
}

const phaseLabels: Record<CommissionerTaskPhase, string> = {
  offseason: 'Offseason',
  midyear: 'Mid-Year',
};
const railCompletionTaskIds = new Set<CommissionerTaskView['taskId']>([
  'season_review',
  'league_settings_review',
  'franchise_event_sponsorships',
]);
const resumeTaskIds = new Set<CommissionerTaskView['taskId']>([
  'dunk_participants',
  'three_point_participants',
  'shooting_stars_participants',
  'skills_participants',
  'horse_participants',
  'global_games',
  'christmas_games',
  'invite_performance',
]);

function statusCopy(task: CommissionerTaskView) {
  if (task.status === 'auto_resolved') return 'Handled by Assistant';
  if (task.status === 'resolved') return 'Completed';
  if (task.status === 'not_applicable') return 'Not required';
  if (task.status === 'in_progress') return 'Ready for decision';
  if (task.overdue) return 'Decision required';
  if (task.available) return 'Available now';
  return 'Coming up';
}

function statusIcon(task: CommissionerTaskView) {
  if (task.status === 'resolved') return <CheckCircle2 size={18} className="text-emerald-300" />;
  if (task.status === 'auto_resolved') return <Sparkles size={18} className="text-indigo-300" />;
  if (task.status === 'not_applicable') return <Check size={18} className="text-slate-600" />;
  if (task.overdue) return <ShieldAlert size={18} className="text-rose-300" />;
  if (task.available || task.status === 'in_progress') return <Clock3 size={18} className="text-amber-300" />;
  return <CircleDashed size={18} className="text-slate-600" />;
}

export function CommissionerTasksView({ onNavigate }: Props) {
  const { state, dispatchAction } = useGame();
  const isPbaCommissioner = state.leagueStats.uiMode === 'pba_isolated';
  const tasks = useMemo(() => getCommissionerTaskViews(state), [state]);
  const suggestedPhase = tasks.some(task => task.phase === 'midyear' && (task.available || task.status === 'in_progress'))
    ? 'midyear'
    : 'offseason';
  const [phase, setPhase] = useState<CommissionerTaskPhase>(suggestedPhase);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmSponsorTask, setConfirmSponsorTask] = useState<CommissionerTaskView | null>(null);
  const selectedTask = tasks.find(task => task.taskId === selectedTaskId) ?? null;
  const visibleTasks = tasks.filter(task => task.status !== 'not_applicable');
  const phaseTasks = visibleTasks.filter(task => task.phase === phase);
  const required = visibleTasks.filter(task => !isCommissionerTaskTerminal(task.status));
  const completed = visibleTasks.length - required.length;
  const firstUnresolvedByPhase = (taskPhase: CommissionerTaskPhase) =>
    visibleTasks.find(task => task.phase === taskPhase && !isCommissionerTaskTerminal(task.status)) ?? null;

  useEffect(() => {
    const active = tasks.find(task => task.status === 'in_progress');
    if (!active || active.phase === phase) return;
    setPhase(active.phase);
  }, [phase, tasks]);

  const openTask = async (task: CommissionerTaskView) => {
    const current = firstUnresolvedByPhase(task.phase);
    if (task.key !== current?.key || (!task.available && task.status !== 'in_progress')) return;
    const completesFromDestination = railCompletionTaskIds.has(task.taskId)
      || (isPbaCommissioner && task.taskId === 'commissioner_free_agency');
    if (task.status === 'in_progress' && completesFromDestination) {
      if (
        task.taskId === 'franchise_event_sponsorships'
        && ensureFranchiseLeagueEvents(state).deals.some(deal =>
          deal.brand === 'Unbranded' || deal.endSeason <= state.leagueStats.year
        )
      ) {
        setConfirmSponsorTask(task);
        return;
      }
      const patch = await resolveCommissionerTask(state, task.taskId, { mode: 'manual' });
      await dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
      return;
    }
    if (task.taskId === 'commissioner_free_agency') {
      if (isPbaCommissioner) {
        if (task.status === 'pending') {
          await dispatchAction({
            type: 'UPDATE_STATE',
            payload: {
              commissionerTasks: updateCommissionerTaskRecord(state, task.taskId, 'in_progress'),
            },
          } as any);
        }
        onNavigate('Free Agents');
        return;
      }
      setBusyKey(task.key);
      try {
        await dispatchAction({
          type: 'OFFSEASON_SKIP_FREE_AGENCY',
          payload: { commissionerFreeAgencyReview: true },
        } as any);
      } finally {
        setBusyKey(null);
      }
      return;
    }
    if (task.status === 'pending') {
      await dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
          commissionerTasks: updateCommissionerTaskRecord(state, task.taskId, 'in_progress'),
        },
      } as any);
    }
    if (task.taskId === 'season_review') {
      const season = getCommissionerSeasonReviewSeason(state);
      onNavigate(season != null ? requestSeasonReviewView(state.news, season, state.leagueStats?.uiMode) : 'League History');
      return;
    }
    if (task.taskId === 'league_settings_review') {
      onNavigate('League Settings');
      return;
    }
    if (task.taskId === 'international_tournament') {
      onNavigate('International');
      return;
    }
    if (task.taskId === 'media_rights_renewal') {
      onNavigate('Broadcasting');
      return;
    }
    if (task.taskId === 'franchise_event_sponsorships') {
      onNavigate('Franchises');
      return;
    }
    if (task.taskId === 'hof_endorsement') {
      onNavigate('Hall of Fame');
      return;
    }
    if (task.taskId === 'draft_lottery' || task.taskId === 'nba_draft') {
      onNavigate(task.taskId === 'draft_lottery' ? 'Draft Lottery' : 'Draft Board');
      return;
    }
    setSelectedTaskId(task.taskId);
  };

  const skipTask = async (task: CommissionerTaskView) => {
    if (!task.definition.allowAssistant || busyKey) return;
    setBusyKey(task.key);
    try {
      const patch = await resolveCommissionerTask(state, task.taskId, { mode: 'auto' });
      await dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-white custom-scrollbar">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-slate-900 to-slate-950 p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-indigo-300">League calendar</p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight sm:text-4xl">Commissioner Tasks</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                Complete each league responsibility in order. Participant pickers include an automatic selection option.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3">
                <p className="text-2xl font-black">{completed}</p>
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Complete</p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-5 py-3">
                <p className="text-2xl font-black text-amber-200">{required.length}</p>
                <p className="text-[9px] font-black uppercase tracking-wider text-amber-300/70">Remaining</p>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 rounded-2xl border border-white/10 bg-slate-900 p-1">
          {(['offseason', 'midyear'] as const).map(value => {
            const openCount = tasks.filter(task => task.phase === value && !isCommissionerTaskTerminal(task.status)).length;
            return (
              <button
                key={value}
                onClick={() => setPhase(value)}
                className={`rounded-xl px-3 py-3 text-xs font-black uppercase tracking-wider transition ${
                  phase === value ? 'bg-white text-slate-950' : 'text-slate-500 hover:text-white'
                }`}
              >
                {phaseLabels[value]} · {openCount}
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-3">
          {phaseTasks.map((task, index) => {
            const terminal = isCommissionerTaskTerminal(task.status);
            const current = task.key === firstUnresolvedByPhase(task.phase)?.key;
            const actionable = current && (task.available || task.status === 'in_progress');
            return (
              <div
                key={task.key}
                className={`group flex w-full flex-col items-start gap-3 rounded-2xl border p-4 text-left transition sm:flex-row sm:items-center sm:p-5 ${
                  task.overdue
                    ? 'border-rose-400/30 bg-rose-400/10'
                    : actionable
                      ? 'border-amber-400/25 bg-amber-400/[0.07] hover:border-amber-300/50'
                      : terminal
                        ? 'border-white/5 bg-white/[0.025]'
                        : 'border-white/5 bg-black/20 opacity-60'
                }`}
              >
                <button
                  type="button"
                  disabled={!actionable || busyKey !== null}
                  onClick={() => openTask(task)}
                  className="flex w-full min-w-0 flex-1 items-start gap-3 text-left sm:items-center"
                >
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20">
                    {statusIcon(task)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className={`font-black ${terminal ? 'text-slate-500' : 'text-white'}`}>
                        {index + 1}. {getCommissionerTaskDisplayTitle(state, task.taskId, task.definition.title)}
                      </p>
                      <span className={`text-[9px] font-black uppercase tracking-widest ${
                        task.overdue ? 'text-rose-300' : actionable ? 'text-amber-300' : 'text-slate-600'
                      }`}>
                        {statusCopy(task)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{task.definition.description}</p>
                  </div>
                  {actionable && (
                    <span className="mt-2 flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400 sm:mt-0">
                      {busyKey === task.key
                        ? 'Simulating…'
                        : task.status === 'in_progress' && (
                          railCompletionTaskIds.has(task.taskId)
                          || (isPbaCommissioner && task.taskId === 'commissioner_free_agency')
                        )
                        ? 'Mark Done'
                        : task.status === 'in_progress' || resumeTaskIds.has(task.taskId)
                          ? 'Resume'
                          : 'Enter'}
                      <ChevronRight size={16} className="transition group-hover:translate-x-0.5 group-hover:text-white" />
                    </span>
                  )}
                </button>
                {actionable && task.definition.allowAssistant && (
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => void skipTask(task)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/[0.08] disabled:opacity-40 sm:w-auto"
                  >
                    {busyKey === task.key ? 'Handling…' : 'Skip'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedTask && (
        <CommissionerTaskModal
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onNavigate={onNavigate}
        />
      )}
      {confirmSponsorTask && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-slate-950 p-5 shadow-2xl">
            <h2 className="text-lg font-black text-white">Finish with unassigned events?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Some league events will remain unbranded and generate no sponsorship revenue this season.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConfirmSponsorTask(null)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs font-black text-slate-300">Return to Sponsors</button>
              <button
                type="button"
                onClick={async () => {
                  const task = confirmSponsorTask;
                  setConfirmSponsorTask(null);
                  const patch = await resolveCommissionerTask(state, task.taskId, { mode: 'manual' });
                  await dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
                }}
                className="rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-slate-950"
              >
                Confirm & Mark Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
