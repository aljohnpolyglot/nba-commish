import { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  FastForward,
  ListChecks,
  Sparkles,
  X,
} from 'lucide-react';
import type { CommissionerTaskView, GameState, Tab } from '../../types';
import { useGame } from '../../store/GameContext';
import {
  getCommissionerSeasonReviewSeason,
  getCommissionerTaskViews,
  isCommissionerTaskTerminal,
  shouldShowCommissionerOffseasonTasks,
  updateCommissionerTaskRecord,
} from '../../services/commissionerTasks/taskRegistry';
import { resolveCommissionerTask } from '../../services/commissionerTasks/taskResolution';
import { CommissionerTaskModal } from './CommissionerTaskModal';
import { requestSeasonReviewView } from '../news/SeasonReviewNav';
import { ExpansionSchedulePin } from '../offseason/OffseasonSidebarBits';
import { OffseasonTaskRailFrame } from '../offseason/OffseasonTaskRailFrame';
import { getUpcomingTrainingCampISO } from '../offseason/aufgabenShared';
import { ensureFranchiseLeagueEvents } from '../../services/franchises/franchiseSponsors';
import { getCommissionerTaskDisplayTitle } from '../../services/franchises/franchiseEventNaming';
import { normalizeDate } from '../../utils/helpers';

interface TasksPanelProps {
  onNavigate: (view: Tab) => void;
  onBeforeOpen?: () => void;
}

interface TaskSection {
  id: 'now' | 'coming' | 'later' | 'finished';
  tasks: CommissionerTaskView[];
}

const participantSelectionTaskIds = new Set<CommissionerTaskView['taskId']>([
  'dunk_participants',
  'three_point_participants',
  'shooting_stars_participants',
  'skills_participants',
  'horse_participants',
]);
const resumeSkipTaskIds = new Set<CommissionerTaskView['taskId']>([
  ...participantSelectionTaskIds,
  'global_games',
  'christmas_games',
  'invite_performance',
]);
const railCompletionTaskIds = new Set<CommissionerTaskView['taskId']>([
  'season_review',
  'league_settings_review',
  'franchise_event_sponsorships',
]);

import { resolveCommissionerTaskDestination } from '../../services/tasks/taskDestinations';

function taskDestination(task: CommissionerTaskView): Tab | null {
  return resolveCommissionerTaskDestination(task)?.tab ?? null;
}

function taskStatus(task: CommissionerTaskView, isCurrent: boolean) {
  if (task.status === 'resolved') return 'Complete';
  if (task.status === 'auto_resolved') return 'Handled by Assistant';
  if (task.status === 'in_progress') return 'In progress';
  if (isCurrent && task.available) return 'Ready';
  return '';
}

function taskSections(tasks: CommissionerTaskView[], showLater = true): TaskSection[] {
  const unresolved = tasks.filter(task => !isCommissionerTaskTerminal(task.status));
  const current = unresolved[0] ?? null;
  const now = current && (current.available || current.status === 'in_progress') ? [current] : [];
  const coming = current && now.length === 0 ? [current] : [];
  const later = unresolved.filter(task => task.key !== current?.key);
  const finished = tasks.filter(task => isCommissionerTaskTerminal(task.status));
  return [
    { id: 'now', tasks: now },
    { id: 'coming', tasks: coming },
    { id: 'later', tasks: showLater ? later : [] },
    { id: 'finished', tasks: finished },
  ].filter(section => section.tasks.length > 0) as TaskSection[];
}

function CommissionerOffseasonTasksPanel({ onNavigate, onBeforeOpen }: TasksPanelProps) {
  const { state, dispatchAction } = useGame();
  const tasks = useMemo(
    () => getCommissionerTaskViews(state)
      .filter(task => task.phase === 'offseason' && task.status !== 'not_applicable'),
    [state],
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmSponsorReview, setConfirmSponsorReview] = useState(false);
  const [confirmSkipOffseason, setConfirmSkipOffseason] = useState(false);
  const remaining = tasks.filter(task => !isCommissionerTaskTerminal(task.status));
  const currentTask = remaining[0] ?? null;
  const selectedTask = tasks.find(task => task.taskId === selectedTaskId) ?? null;
  const isPbaCommissioner = state.leagueStats.uiMode === 'pba_isolated';
  const sections = useMemo(() => taskSections(tasks, !isPbaCommissioner), [isPbaCommissioner, tasks]);
  const today = normalizeDate(state.date);

  const markInProgress = async (task: CommissionerTaskView) => {
    if (task.status !== 'pending') return;
    await dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        commissionerTasks: updateCommissionerTaskRecord(state, task.taskId, 'in_progress'),
      },
    } as any);
  };

  const openTask = async (task: CommissionerTaskView) => {
    if (task.key !== currentTask?.key || (!task.available && task.status !== 'in_progress')) return;
    onBeforeOpen?.();

    if (task.taskId === 'commissioner_free_agency') {
      if (isPbaCommissioner) {
        await markInProgress(task);
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
    await markInProgress(task);
    const destination = taskDestination(task);
    if (destination) {
      if (task.taskId === 'season_review') {
        const season = getCommissionerSeasonReviewSeason(state);
        onNavigate(season != null ? requestSeasonReviewView(state.news, season, state.leagueStats?.uiMode) : destination);
        return;
      }
      onNavigate(destination);
      return;
    }
    setSelectedTaskId(task.taskId);
  };

  const simulateToCurrentTask = async () => {
    if (!currentTask || currentTask.available || currentTask.status === 'in_progress') return;
    if (currentTask.openDate <= today) return;
    await dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: { targetDate: currentTask.openDate, stopBefore: true },
    } as any);
  };

  const enterPreseason = async () => {
    await dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: { targetDate: getUpcomingTrainingCampISO(state) },
    } as any);
  };

  const autoResolve = async (task: CommissionerTaskView) => {
    if (
      !task.definition.allowAssistant
      || task.key !== currentTask?.key
      || (!task.available && task.status !== 'in_progress')
    ) return;
    setBusyKey(task.key);
    try {
      const patch = await resolveCommissionerTask(state, task.taskId, { mode: 'auto' });
      await dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
      setSelectedTaskId(null);
    } finally {
      setBusyKey(null);
    }
  };

  const completeRailReview = async (task: CommissionerTaskView) => {
    if (task.key !== currentTask?.key || task.status !== 'in_progress') return;
    if (
      task.taskId === 'franchise_event_sponsorships'
      && ensureFranchiseLeagueEvents(state).deals.some(deal =>
        deal.brand === 'Unbranded' || deal.endSeason <= state.leagueStats.year
      )
    ) {
      setConfirmSponsorReview(true);
      return;
    }
    setBusyKey(task.key);
    try {
      const patch = await resolveCommissionerTask(state, task.taskId, { mode: 'manual' });
      await dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
    } finally {
      setBusyKey(null);
    }
  };

  const confirmIncompleteSponsorReview = async () => {
    if (!currentTask || currentTask.taskId !== 'franchise_event_sponsorships') return;
    setConfirmSponsorReview(false);
    setBusyKey(currentTask.key);
    try {
      const patch = await resolveCommissionerTask(state, currentTask.taskId, {
        mode: 'manual',
        resolution: {
          unassignedAssets: ensureFranchiseLeagueEvents(state).deals
            .filter(deal => deal.brand === 'Unbranded' || deal.endSeason <= state.leagueStats.year)
            .map(deal => deal.assetId),
        },
      });
      await dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
    } finally {
      setBusyKey(null);
    }
  };

  const skipOffseasonTasks = async () => {
    setConfirmSkipOffseason(false);
    setBusyKey('skip-offseason');
    try {
      let working: GameState = state;
      for (const task of getCommissionerTaskViews(working)
        .filter(candidate => candidate.phase === 'offseason' && !isCommissionerTaskTerminal(candidate.status))) {
        const patch = await resolveCommissionerTask(working, task.taskId, { mode: 'auto' });
        working = { ...working, ...patch };
      }
      await dispatchAction({ type: 'UPDATE_STATE', payload: working } as any);
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: getUpcomingTrainingCampISO(working) },
      } as any);
    } finally {
      setBusyKey(null);
    }
  };

  const renderTask = (task: CommissionerTaskView) => {
    const terminal = isCommissionerTaskTerminal(task.status);
    const current = task.key === currentTask?.key;
    const actionable = current && (task.available || task.status === 'in_progress');
    const expanded = current && !terminal;
    const canSimToOpenDate = current && task.openDate > today;
    const isResumeSkipTask = resumeSkipTaskIds.has(task.taskId);
    const markDoneInRail = task.status === 'in_progress' && (
      railCompletionTaskIds.has(task.taskId)
      || (isPbaCommissioner && task.taskId === 'commissioner_free_agency')
    );
    return (
      <li
        key={task.key}
        className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 transition-colors ${
          actionable
            ? 'border-amber-500/40 bg-amber-500/10'
            : current
              ? 'border-sky-500/20 bg-sky-500/5'
              : 'border-slate-800/60 bg-slate-900/40'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {terminal
              ? task.status === 'auto_resolved'
                ? <Sparkles className="size-4 text-indigo-300" />
                : <CheckCircle2 className="size-4 text-emerald-400" />
              : <Circle className={`size-4 ${actionable ? 'text-amber-400' : 'text-slate-500'}`} />}
            <span className={`truncate text-[11px] font-black uppercase tracking-tight ${
              terminal ? 'text-slate-500' : 'text-white'
            }`}>
              {getCommissionerTaskDisplayTitle(state, task.taskId, task.definition.title)}
            </span>
          </div>
          {taskStatus(task, current) && (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-widest text-slate-500">
              {taskStatus(task, current)}
            </span>
          )}
        </div>

        {expanded && (
          <>
            <p className="text-[10px] leading-snug text-slate-400">
              {task.definition.description}
            </p>
            <div className="mt-1 flex gap-2">
              {actionable ? (
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => markDoneInRail ? void completeRailReview(task) : void openTask(task)}
                  className="flex-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {busyKey === task.key
                    ? 'Simulating…'
                    : markDoneInRail
                    ? 'Mark Done'
                    : task.taskId === 'celebrity_roster'
                    ? 'Review'
                    : isResumeSkipTask || task.status === 'in_progress'
                      ? 'Resume'
                      : 'Enter'}
                </button>
              ) : canSimToOpenDate ? (
                <button
                  type="button"
                  onClick={simulateToCurrentTask}
                  className="flex-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-sky-200 transition-colors hover:bg-sky-500/20"
                >
                  Sim to Next Task
                </button>
              ) : (
                <div className="flex-1 rounded-md border border-slate-700/70 bg-slate-900/70 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Waiting for season results
                </div>
              )}
              {actionable && task.definition.allowAssistant && (
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => void autoResolve(task)}
                  className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
                >
                  {busyKey === task.key ? 'Handling…' : 'Skip'}
                </button>
              )}
            </div>
          </>
        )}
      </li>
    );
  };

  return (
    <>
      <OffseasonTaskRailFrame remaining={remaining.length}>
        <ExpansionSchedulePin />

        <div className="space-y-3">
          {sections.map(section => (
            <section key={section.id} className="space-y-1.5">
              <ol className="space-y-1.5">
                {section.tasks.map(renderTask)}
              </ol>
            </section>
          ))}
        </div>

        {remaining.length === 0 && (
          <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
            <Check size={16} className="mx-auto text-emerald-300" />
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
              Offseason Complete
            </p>
            <button
              type="button"
              onClick={enterPreseason}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-black hover:bg-emerald-400"
            >
              <Sparkles size={12} /> Enter Preseason
            </button>
          </div>
        )}
        {remaining.length > 0 && (
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() => setConfirmSkipOffseason(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-200 hover:bg-amber-400/15 disabled:opacity-40"
          >
            <FastForward size={12} /> {busyKey === 'skip-offseason' ? 'Handling Offseason…' : 'Skip Offseason Tasks'}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onBeforeOpen?.();
            onNavigate('Commissioner Tasks');
          }}
          className="w-full rounded-xl border border-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/[0.05] hover:text-white"
        >
          View all tasks
        </button>
      </OffseasonTaskRailFrame>

      {selectedTask && (
        <CommissionerTaskModal
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onNavigate={onNavigate}
        />
      )}
      {confirmSponsorReview && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-slate-950 p-5 shadow-2xl">
            <h2 className="text-lg font-black text-white">Finish with unassigned events?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Some league events still have no sponsor. They will remain unbranded and generate no sponsorship revenue this season.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConfirmSponsorReview(false)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs font-black text-slate-300">Return to Sponsors</button>
              <button type="button" onClick={() => void confirmIncompleteSponsorReview()} className="rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-slate-950">Confirm & Mark Done</button>
            </div>
          </div>
        </div>
      )}
      {confirmSkipOffseason && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-slate-950 p-5 shadow-2xl">
            <h2 className="text-lg font-black text-white">Skip the remaining offseason tasks?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              The league office will make every remaining decision, complete any active tournament or expansion draft, and advance to Preseason.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConfirmSkipOffseason(false)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs font-black text-slate-300">Keep Reviewing</button>
              <button type="button" onClick={() => void skipOffseasonTasks()} className="rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-slate-950">Skip Tasks & Enter Preseason</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function CommissionerOffseasonTasksSidebar({ onNavigate }: { onNavigate: (view: Tab) => void }) {
  const { state } = useGame();
  if (!shouldShowCommissionerOffseasonTasks(state)) return null;
  return <CommissionerOffseasonTasksPanel onNavigate={onNavigate} />;
}

export function CommissionerOffseasonPhaseBadge() {
  const { state } = useGame();
  const tasks = getCommissionerTaskViews(state)
    .filter(task => task.phase === 'offseason' && task.status !== 'not_applicable');
  const current = tasks.find(task => !isCommissionerTaskTerminal(task.status));
  if (!current) return null;
  return (
    <div className="min-w-0 rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.18em] text-amber-300/80">
          Offseason
        </span>
        <span className="h-3 w-px shrink-0 bg-slate-700" />
        <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-tight text-white">
          {getCommissionerTaskDisplayTitle(state, current.taskId, current.definition.title)}
        </span>
      </div>
    </div>
  );
}

export function CommissionerOffseasonNextActionButton({ setCurrentView }: { setCurrentView: (view: Tab) => void }) {
  const { state, dispatchAction } = useGame();
  const isPbaCommissioner = state.leagueStats.uiMode === 'pba_isolated';
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [confirmSponsorReview, setConfirmSponsorReview] = useState(false);
  const tasks = useMemo(
    () => getCommissionerTaskViews(state)
      .filter(task => task.phase === 'offseason' && task.status !== 'not_applicable'),
    [state],
  );
  const current = tasks.find(task => !isCommissionerTaskTerminal(task.status)) ?? null;
  const selectedTask = tasks.find(task => task.taskId === selectedTaskId) ?? null;
  const actionable = current && (current.available || current.status === 'in_progress');
  const canSimToOpenDate = current && !actionable && current.openDate > normalizeDate(state.date);

  const handleClick = async () => {
    if (!current) {
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: getUpcomingTrainingCampISO(state) },
      } as any);
      return;
    }
    if (!actionable) {
      if (!canSimToOpenDate) {
        setCurrentView('Commissioner Tasks');
        return;
      }
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: current.openDate, stopBefore: true },
      } as any);
      return;
    }
    const completesFromDestination = railCompletionTaskIds.has(current.taskId)
      || (isPbaCommissioner && current.taskId === 'commissioner_free_agency');
    if (current.status === 'in_progress' && completesFromDestination) {
      if (
        current.taskId === 'franchise_event_sponsorships'
        && ensureFranchiseLeagueEvents(state).deals.some(deal =>
          deal.brand === 'Unbranded' || deal.endSeason <= state.leagueStats.year
        )
      ) {
        setConfirmSponsorReview(true);
        return;
      }
      const patch = await resolveCommissionerTask(state, current.taskId, { mode: 'manual' });
      await dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
      return;
    }
    if (current.taskId === 'commissioner_free_agency') {
      if (isPbaCommissioner) {
        if (current.status === 'pending') {
          await dispatchAction({
            type: 'UPDATE_STATE',
            payload: {
              commissionerTasks: updateCommissionerTaskRecord(state, current.taskId, 'in_progress'),
            },
          } as any);
        }
        setCurrentView('Free Agents');
        return;
      }
      await dispatchAction({
        type: 'OFFSEASON_SKIP_FREE_AGENCY',
        payload: { commissionerFreeAgencyReview: true },
      } as any);
      return;
    }
    if (current.status === 'pending') {
      await dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
          commissionerTasks: updateCommissionerTaskRecord(state, current.taskId, 'in_progress'),
        },
      } as any);
    }
    const destination = taskDestination(current);
    if (destination) {
      if (current.taskId === 'season_review') {
        const season = getCommissionerSeasonReviewSeason(state);
        setCurrentView(season != null ? requestSeasonReviewView(state.news, season, state.leagueStats?.uiMode) : destination);
        return;
      }
      setCurrentView(destination);
      return;
    }
    setSelectedTaskId(current.taskId);
  };

  return (
    <>
      <button
        type="button"
        disabled={state.isProcessing}
        onClick={handleClick}
        className="flex items-center gap-2 rounded-lg bg-[#2d5a27] px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#3a7233] disabled:cursor-not-allowed disabled:bg-slate-700"
      >
        {canSimToOpenDate ? <FastForward size={14} /> : <ChevronRight size={14} />}
        {!current
          ? 'Enter Preseason'
          : !actionable
            ? canSimToOpenDate
              ? 'Sim to Next Task'
              : 'Open Commissioner Tasks'
            : current.status === 'in_progress' && (
              railCompletionTaskIds.has(current.taskId)
              || (isPbaCommissioner && current.taskId === 'commissioner_free_agency')
            )
              ? `Mark Done · ${getCommissionerTaskDisplayTitle(state, current.taskId, current.definition.title)}`
              : `${current.status === 'in_progress' || resumeSkipTaskIds.has(current.taskId) ? 'Resume' : 'Enter'} ${getCommissionerTaskDisplayTitle(state, current.taskId, current.definition.title)}`}
      </button>
      {selectedTask && (
        <CommissionerTaskModal
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onNavigate={setCurrentView}
        />
      )}
      {confirmSponsorReview && current?.taskId === 'franchise_event_sponsorships' && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-slate-950 p-5 shadow-2xl">
            <h2 className="text-lg font-black text-white">Finish with unassigned events?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Unassigned events remain unbranded and generate no sponsorship revenue this season.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConfirmSponsorReview(false)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs font-black text-slate-300">Return to Sponsors</button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmSponsorReview(false);
                  const patch = await resolveCommissionerTask(state, current.taskId, {
                    mode: 'manual',
                    resolution: {
                      unassignedAssets: ensureFranchiseLeagueEvents(state).deals
                        .filter(deal => deal.brand === 'Unbranded' || deal.endSeason <= state.leagueStats.year)
                        .map(deal => deal.assetId),
                    },
                  });
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
    </>
  );
}

export function CommissionerOffseasonTasksMobileSheet({ onNavigate }: { onNavigate: (view: Tab) => void }) {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  const tasks = getCommissionerTaskViews(state)
    .filter(task => task.phase === 'offseason' && task.status !== 'not_applicable');
  const remaining = tasks.filter(task => !isCommissionerTaskTerminal(task.status)).length;
  if (!shouldShowCommissionerOffseasonTasks(state)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[110] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-amber-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-black shadow-2xl transition-colors hover:bg-amber-400 lg:hidden"
      >
        <ListChecks size={14} /> Offseason · {remaining} left
      </button>
      {open && (
        <div className="fixed inset-0 z-[115] flex lg:hidden">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative ml-auto h-[100dvh] w-[320px] max-w-[88vw] overflow-y-auto border-l border-slate-800 bg-slate-950 p-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-md bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
            >
              <X size={14} />
            </button>
            <CommissionerOffseasonTasksPanel onNavigate={onNavigate} onBeforeOpen={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
