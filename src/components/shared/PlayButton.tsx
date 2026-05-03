import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronDown, Play } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';
import {
  getTradeDeadlineDate, getDraftLotteryDate, getDraftDate,
  getCurrentOffseasonEffectiveFAStart, getOpeningNightDate, getTrainingCampDate,
  getAllStarWeekendStartDate, getCurrentOffseasonFAMoratoriumEnd, isDraftBlockedByUnresolvedPlayoffs, toISODateString,
} from '../../utils/dateUtils';
import { Tab } from '../../types';
import { useDraftEventGate } from '../../hooks/useDraftEventGate';
import { useRosterComplianceGate } from '../../hooks/useRosterComplianceGate';
import { useTeamOptionGate } from '../../hooks/useTeamOptionGate';
import { useExpiringResignGate } from '../../hooks/useExpiringResignGate';
import { getOffseasonState, type OffseasonPhase } from '../../services/offseason/offseasonState';

type SimPhase =
  | 'preseason'
  | 'regular-season'
  | 'playin'
  | 'playoffs'
  | 'draft-lottery'
  | 'draft'
  | 'after-draft'
  | 'free-agency';

interface PlayOption {
  label: string;
  action: () => void;
}

function addDays(dateStr: string, days: number): string {
  // Strip timestamp portion if present ("2026-04-13T19:00:00.000Z" → "2026-04-13")
  // before re-anchoring to UTC midnight, otherwise the trailing T-string corrupts.
  const norm = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : normalizeDate(dateStr);
  const d = new Date(`${norm}T00:00:00Z`);
  if (isNaN(d.getTime())) return dateStr; // give up — caller will get a no-op date
  d.setUTCDate(d.getUTCDate() + days);
  return toISODateString(d);
}

function addDaysToDate(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

// Map offseason orchestrator phases → PlayButton SimPhase. The orchestrator is
// authoritative for postDraft/moratorium/birdRights/openFA/preCamp/draftDay.
// 'inSeason' / 'preDraft' fall through to schedule-derived sub-phases below.
function offseasonPhaseToSimPhase(p: OffseasonPhase, draftComplete: boolean): SimPhase | null {
  switch (p) {
    case 'draftDay':   return draftComplete ? 'after-draft' : 'draft';
    case 'postDraft':  return 'after-draft';
    case 'moratorium': return 'free-agency';
    case 'birdRights': return 'free-agency';
    case 'openFA':     return 'free-agency';
    case 'preCamp':    return 'preseason';
    default:           return null; // inSeason | preDraft → schedule logic
  }
}

function getSimPhase(state: any): SimPhase {
  const norm = normalizeDate(state.date);
  const curDate = new Date(`${norm}T00:00:00Z`);
  const ls = state.leagueStats;
  const seasonYear: number = ls?.year ?? curDate.getUTCFullYear();

  const draftLotteryDate = getDraftLotteryDate(seasonYear, ls);
  const draftDate = getDraftDate(seasonYear, ls);
  const hasPlayIn = (state.playoffs?.playInGames ?? []).some((g: any) => !g.winner);
  const hasActivePlayoffs = (state.playoffs?.series ?? []).some((s: any) => s.status !== 'complete');
  const draftBlockedByPlayoffs = isDraftBlockedByUnresolvedPlayoffs(state);

  // [OSPLAN] PlayButton consumes the offseason orchestrator for all post-draft/
  // FA/preCamp phases so dropdown options match what the dispatcher will fire.
  const os = getOffseasonState(state.date, ls, state.schedule, {
    draftComplete: !!state.draftComplete,
    playoffsActive: hasActivePlayoffs,
  });
  const fromOrchestrator = offseasonPhaseToSimPhase(os.phase, !!state.draftComplete);
  // Playoffs/blocked states always override the orchestrator — stale series.status
  // can leak 'postDraft' / 'draftDay' when Finals haven't flipped to 'complete'.
  const playoffsBlockOrchestrator = hasActivePlayoffs || draftBlockedByPlayoffs;
  if (fromOrchestrator &&
      !(fromOrchestrator === 'after-draft' && playoffsBlockOrchestrator) &&
      !(fromOrchestrator === 'draft'       && playoffsBlockOrchestrator)) {
    return fromOrchestrator;
  }

  // ── inSeason / preDraft sub-classification (schedule-derived) ──
  if (state.draftComplete) return 'after-draft';
  if (hasActivePlayoffs || draftBlockedByPlayoffs) return 'playoffs';
  if (hasPlayIn && !hasActivePlayoffs) return 'playin';
  if (curDate > draftDate) return 'after-draft';
  if (toISODateString(draftDate) === norm) return state.draftComplete ? 'after-draft' : 'draft';
  if (curDate >= draftLotteryDate) return 'draft-lottery';
  return 'regular-season';
}

function getPhaseLabel(phase: SimPhase, seasonYear: number, calYear: number): string {
  switch (phase) {
    case 'preseason':      return `${calYear} preseason`;
    case 'regular-season': return `${seasonYear} regular season`;
    case 'playin':         return `${seasonYear} play-in`;
    case 'playoffs':       return `${seasonYear} playoffs`;
    case 'draft-lottery':  return `${seasonYear} draft lottery`;
    case 'draft':          return `${seasonYear} draft`;
    case 'after-draft':    return `${seasonYear} offseason`;
    case 'free-agency':    return `${seasonYear} free agency`;
  }
}

// All schedule-derived helpers operate on `state.schedule`. They return YYYY-MM-DD
// strings (matching `normalizeDate`) or null when no matching game is scheduled.

// Returns YYYY-MM-DD (normalized) so callers can safely pass into addDays / Date math.
// Schedule game.date is an ISO timestamp ("2026-04-13T19:00:00.000Z"), not a bare date.
function minScheduledDate(games: any[]): string | null {
  if (!games.length) return null;
  const winner = games.reduce((a, b) => normalizeDate(a.date) < normalizeDate(b.date) ? a : b);
  return normalizeDate(winner.date);
}
function maxScheduledDate(games: any[]): string | null {
  if (!games.length) return null;
  const winner = games.reduce((a, b) => normalizeDate(a.date) > normalizeDate(b.date) ? a : b);
  return normalizeDate(winner.date);
}

function findFirstPreseasonDate(state: any): string | null {
  return minScheduledDate((state.schedule ?? []).filter((g: any) => g.isPreseason && !g.played));
}
function findLastPreseasonDate(state: any): string | null {
  return maxScheduledDate((state.schedule ?? []).filter((g: any) => g.isPreseason && !g.played));
}
function findLastRegSeasonDate(state: any): string | null {
  return maxScheduledDate(
    (state.schedule ?? []).filter((g: any) => !g.isPreseason && !g.isPlayoff && !g.isPlayIn && !g.played)
  );
}
function findFirstPlayInDate(state: any): string | null {
  return minScheduledDate((state.schedule ?? []).filter((g: any) => g.isPlayIn && !g.played));
}
function findPlayInEndDate(state: any): string | null {
  return maxScheduledDate((state.schedule ?? []).filter((g: any) => g.isPlayIn && !g.played));
}
function findFirstTruePlayoffDate(state: any): string | null {
  return minScheduledDate((state.schedule ?? []).filter((g: any) => g.isPlayoff && !g.isPlayIn && !g.played));
}
function findLastTruePlayoffDate(state: any): string | null {
  return maxScheduledDate((state.schedule ?? []).filter((g: any) => g.isPlayoff && !g.isPlayIn && !g.played));
}
function findPlayoffRoundEndDate(state: any): string | null {
  const activeSeries = (state.playoffs?.series ?? []).filter((s: any) => s.status !== 'complete');
  if (!activeSeries.length) return null;
  const minRound = Math.min(...activeSeries.map((s: any) => s.round ?? 1));
  const thisRoundIds = new Set(
    activeSeries.filter((s: any) => (s.round ?? 1) === minRound).map((s: any) => s.id)
  );
  return maxScheduledDate(
    (state.schedule ?? []).filter(
      (g: any) => g.isPlayoff && !g.isPlayIn && !g.played && g.playoffSeriesId && thisRoundIds.has(g.playoffSeriesId)
    )
  );
}

interface PlayButtonProps {
  setCurrentView: (v: Tab) => void;
}

export const PlayButton: React.FC<PlayButtonProps> = ({ setCurrentView }) => {
  const { state, dispatchAction } = useGame();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const norm = normalizeDate(state.date);
  const ls = state.leagueStats;
  const seasonYear: number = ls?.year ?? new Date(state.date).getUTCFullYear();
  const calYear = new Date(`${norm}T00:00:00Z`).getUTCFullYear();

  const phase = getSimPhase(state);
  const phaseLabel = getPhaseLabel(phase, seasonYear, calYear);

  // Lottery / draft gate — pops the Watch/Auto-sim modal when advancing INTO
  // either event from anywhere in the app (PlayButton is global, so this is the
  // only entry point that catches header-driven advances).
  const draftGate = useDraftEventGate({
    onNavigateToDraftLottery: () => setCurrentView('Draft Lottery' as Tab),
    onNavigateToDraft:        () => setCurrentView('Draft Board'   as Tab),
  });
  const rosterGate = useRosterComplianceGate();
  const teamOptionGate = useTeamOptionGate({
    onNavigateManual: () => setCurrentView('Team Office' as Tab),
  });
  const expiringGate = useExpiringResignGate({
    onNavigateManual: () => setCurrentView('Team Office' as Tab),
  });

  const guardedSim = useCallback((fn: () => void | Promise<void>, targetDate?: string) => {
    expiringGate.attempt(
      () => {
        teamOptionGate.attempt(
          () => {
            rosterGate.attempt(
              () => { draftGate.attempt(fn); },
            );
          },
          targetDate,
        );
      },
      targetDate,
    );
  }, [draftGate, rosterGate, teamOptionGate, expiringGate]);

  const simDay = useCallback(() => {
    setOpen(false);
    guardedSim(() => dispatchAction({ type: 'ADVANCE_DAY' }), addDays(norm, 1));
  }, [dispatchAction, guardedSim]);

  // stopBefore:true — advance TO that date, leaving its games unplayed (for "until X starts")
  const simToDate = useCallback((date: string) => {
    setOpen(false);
    guardedSim(
      () => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: date, stopBefore: true } } as any),
      date,
    );
  }, [dispatchAction, guardedSim]);

  // no stopBefore — play through that date's games (for "until end of X")
  const simThrough = useCallback((date: string) => {
    setOpen(false);
    guardedSim(
      () => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: date } } as any),
      date,
    );
  }, [dispatchAction, guardedSim]);

  const simDraftToEnd = useCallback(() => {
    setOpen(false);
    const targetDate = addDays(norm, 1);
    guardedSim(
      () => dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate, stopBefore: true, assistantGM: true },
      } as any),
      targetDate,
    );
  }, [dispatchAction, guardedSim, norm]);

  const navigate = useCallback((view: Tab) => {
    setOpen(false);
    setCurrentView(view);
  }, [setCurrentView]);

  const options: PlayOption[] = useMemo(() => {
    const tdStr              = toISODateString(getTradeDeadlineDate(seasonYear, ls));
    const draftLotteryStr    = toISODateString(getDraftLotteryDate(seasonYear, ls));
    const draftStr           = toISODateString(getDraftDate(seasonYear, ls));
    const faStartStr         = toISODateString(getCurrentOffseasonEffectiveFAStart(`${norm}T00:00:00Z`, ls, state.schedule));
    const faMoratoriumEndStr = toISODateString(getCurrentOffseasonFAMoratoriumEnd(`${norm}T00:00:00Z`, ls, state.schedule));
    const openingNightStr    = toISODateString(getOpeningNightDate(seasonYear));
    // Land Thursday (1 day before Rising Stars Friday) so the user sees All-Star
    // weekend BEFORE any of its events trigger.
    const allStarStr         = toISODateString(addDaysToDate(getAllStarWeekendStartDate(seasonYear, ls), -1));
    const preseasonStr       = toISODateString(getTrainingCampDate(seasonYear, ls));
    // Last scheduled playoff game from state.schedule — Finals Game 7 if all-7
    // games are pre-scheduled, otherwise whatever's left. Falls back to the day
    // before the draft if the bracket hasn't been generated yet.
    const lastPlayoffStr     = findLastTruePlayoffDate(state) ?? addDays(draftStr, -1);

    switch (phase) {
      case 'preseason': {
        const opts: PlayOption[] = [{ label: 'One day', action: simDay }];
        const firstPreseason   = findFirstPreseasonDate(state);
        const lastPreseason    = findLastPreseasonDate(state);
        // ls.year is the upcoming season post-rollover, so getTrainingCampDate(seasonYear)
        // points to THIS year's camp opening (Oct 1) — not next year's.
        const trainingCampStr  = toISODateString(getTrainingCampDate(seasonYear, ls));
        // Pre-camp dead window: Jul–Sep, schedule_generation hasn't fired so no preseason
        // games are in state yet. Offer a camp-opening jump so the user isn't stuck on
        // "One day" / "To opening night" with nothing in between.
        if (norm < trainingCampStr) {
          opts.push({ label: 'Until training camp', action: () => simToDate(trainingCampStr) });
        }
        if (firstPreseason && firstPreseason > norm) {
          opts.push({ label: 'Until preseason games', action: () => simToDate(firstPreseason) });
        }
        // Play through every remaining preseason game (last preseason game day, inclusive).
        if (lastPreseason && lastPreseason >= norm) {
          opts.push({ label: 'Through preseason', action: () => simThrough(lastPreseason) });
        }
        // stopBefore: true — land on opening night with games unplayed.
        opts.push({ label: 'To opening night', action: () => simToDate(openingNightStr) });
        return opts;
      }

      case 'regular-season': {
        const opts: PlayOption[] = [
          { label: 'One day',   action: simDay },
          { label: 'One week',  action: () => simToDate(addDays(norm, 7)) },
          { label: 'One month', action: () => simToDate(addDays(norm, 30)) },
        ];
        // Trade deadline (lands ON deadline day with games unplayed; trades remain
        // legal until the day AFTER per NavigationMenu's `> deadline` gate).
        if (norm < tdStr) {
          opts.push({ label: 'Until trade deadline', action: () => simToDate(tdStr) });
        }
        if (norm < allStarStr) {
          opts.push({ label: 'Until All-Star events', action: () => simToDate(allStarStr) });
        }
        // Through regular season — plays through the actual last RS game day, no drift.
        // Independent of "Until play-in" because the real NBA gap (~3 days) means play-in
        // can land later than the user expects when they want to end RS cleanly.
        const lastRegSeasonStr = findLastRegSeasonDate(state);
        if (lastRegSeasonStr && lastRegSeasonStr >= norm) {
          opts.push({ label: 'Through regular season', action: () => simThrough(lastRegSeasonStr) });
        }
        // Play-in: prefer scheduled play-in games; otherwise fall back to the day
        // AFTER the last regular-season game (real schedule rolls straight from
        // regular season into play-in). Calendar fallback (~Apr 14) covers the
        // dead window where RS is fully played but the bracket hasn't generated
        // yet — without it the user gets stranded with only "One day".
        const playInScheduled  = ls?.playIn !== false ? findFirstPlayInDate(state) : null;
        const playInCalFallback = `${calYear}-04-14`;
        const playInTarget     = ls?.playIn !== false
          ? (playInScheduled
              ?? (lastRegSeasonStr ? addDays(lastRegSeasonStr, 1) : null)
              ?? (norm < playInCalFallback ? playInCalFallback : null))
          : null;
        if (playInTarget && playInTarget > norm) {
          opts.push({ label: 'Until play-in', action: () => simToDate(playInTarget) });
        }
        // True playoffs only appear once Round 1 has been bracketed and scheduled.
        const playoffScheduled = findFirstTruePlayoffDate(state);
        if (playoffScheduled && playoffScheduled > norm) {
          opts.push({ label: 'Until playoffs', action: () => simToDate(playoffScheduled) });
        }
        if (norm < draftLotteryStr) {
          opts.push({ label: 'Until draft lottery', action: () => simToDate(draftLotteryStr) });
        }
        return opts;
      }

      case 'playin': {
        const playInEnd    = findPlayInEndDate(state);
        const playoffStart = findFirstTruePlayoffDate(state);
        const opts: PlayOption[] = [{ label: 'One day', action: simDay }];
        if (playInEnd && playInEnd >= norm) {
          opts.push({ label: 'Until end of play-in', action: () => simThrough(playInEnd) });
        }
        if (playoffStart && playoffStart > norm) {
          opts.push({ label: 'Until playoffs', action: () => simToDate(playoffStart) });
        }
        if (norm < draftLotteryStr) {
          opts.push({ label: 'Until draft lottery', action: () => simToDate(draftLotteryStr) });
        } else if (norm === draftLotteryStr) {
          opts.push({ label: 'Watch lottery', action: () => navigate('Draft Lottery' as Tab) });
        }
        opts.push({ label: 'Through playoffs', action: () => simThrough(lastPlayoffStr) });
        return opts;
      }

      case 'playoffs': {
        const roundEnd = findPlayoffRoundEndDate(state);
        const opts: PlayOption[] = [{ label: 'One day', action: simDay }];
        if (roundEnd && roundEnd >= norm) {
          opts.push({ label: 'Until end of round', action: () => simThrough(roundEnd) });
        }
        // Lottery falls during the playoffs in the real calendar (mid-May).
        if (norm < draftLotteryStr) {
          opts.push({ label: 'Until draft lottery', action: () => simToDate(draftLotteryStr) });
        } else if (norm === draftLotteryStr) {
          // On lottery day during playoffs — let the user actually watch it
          // instead of forcing "Through playoffs" first.
          opts.push({ label: 'Watch lottery', action: () => navigate('Draft Lottery' as Tab) });
        }
        // Stop ON the last scheduled playoff game so the user lands at the
        // championship and can immediately step into the post-finals flow.
        opts.push({ label: 'Through playoffs', action: () => simThrough(lastPlayoffStr) });
        // Direct skip to draft — for users who don't care about post-finals days.
        if (norm < draftStr) {
          opts.push({ label: 'Until draft', action: () => simToDate(draftStr) });
        }
        return opts;
      }

      case 'draft-lottery':
        return [
          { label: 'One day',       action: simDay },
          { label: 'Watch lottery', action: () => navigate('Draft Lottery' as Tab) },
          { label: 'Until draft',   action: () => simToDate(draftStr) },
        ];

      case 'draft':
        return [
          { label: 'Sim to end of draft', action: simDraftToEnd },
          { label: 'Watch draft', action: () => navigate('Draft Board' as Tab) },
        ];

      case 'after-draft': {
        const opts: PlayOption[] = [{ label: 'One day', action: simDay }];
        // Let the user navigate to the draft board even after draft day if the
        // commissioner hasn't run the draft yet (date slid past but draftComplete=false).
        if (!state.draftComplete) {
          opts.push({ label: 'Watch draft', action: () => navigate('Draft Board' as Tab) });
          opts.push({ label: 'Sim to end of draft', action: simDraftToEnd });
        }
        // Dead-zone skip: post-draft → moratorium is boring (no signings legal).
        // "Until FA opens" jumps to the nominal FA start (moratorium begins);
        // "Until signings open" jumps past moratorium to the first day trades/signings
        // are legal so the user lands in a live market, not a silent waiting period.
        if (norm < faStartStr) {
          opts.push({ label: 'Until FA opens', action: () => simToDate(faStartStr) });
        }
        if (norm < faMoratoriumEndStr) {
          opts.push({ label: 'Until signings open', action: () => simToDate(faMoratoriumEndStr) });
        }
        return opts;
      }

      case 'free-agency': {
        const activeMarkets = (state.faBidding?.markets ?? []).filter((m: any) => !m.resolved);
        const marketTarget = (markets: any[]) => {
          const nextDecisionDay = markets
            .map((m: any) => Number(m.decidesOnDay))
            .filter((d: number) => Number.isFinite(d))
            .sort((a: number, b: number) => a - b)[0];
          if (nextDecisionDay == null) return addDays(norm, 1);
          return addDays(norm, Math.max(1, nextDecisionDay - (state.day ?? 0)));
        };
        const majorMarketPlayerIds = new Set(
          state.players
            .filter((p: any) => p.tid < 0 && p.status === 'Free Agent' && (p.overallRating ?? 0) >= 55)
            .map((p: any) => p.internalId),
        );
        const majorMarkets = activeMarkets.filter((m: any) => majorMarketPlayerIds.has(m.playerId));
        const opts: PlayOption[] = [
          { label: 'One day',         action: simDay },
          { label: 'One FA week',     action: () => simToDate(addDays(norm, 7)) },
        ];
        if (norm < faMoratoriumEndStr) {
          opts.push({ label: 'Through moratorium', action: () => simToDate(faMoratoriumEndStr) });
        }
        if (activeMarkets.length > 0) {
          opts.push({ label: 'Until next FA decision', action: () => simThrough(marketTarget(activeMarkets)) });
        }
        if (majorMarkets.length > 0) {
          opts.push({ label: 'Until major FAs resolve', action: () => simThrough(marketTarget(majorMarkets)) });
        }
        opts.push(
          { label: 'One month',       action: () => simToDate(addDays(norm, 30)) },
          { label: 'Until training camp', action: () => simToDate(preseasonStr) },
        );
        const nextSeasonOpening = toISODateString(getOpeningNightDate(seasonYear));
        if (nextSeasonOpening > norm) {
          // stopBefore: true — land on opening night with games unplayed.
          opts.push({ label: 'Through preseason', action: () => simToDate(nextSeasonOpening) });
        }
        return opts;
      }

      default:
        return [{ label: 'One day', action: simDay }];
    }
  }, [phase, norm, seasonYear, ls, state, simDay, simToDate, simThrough, simDraftToEnd, navigate]);

  // Close on outside click or Escape
  useEffect(() => {
    const clickHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', escHandler);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', escHandler);
    };
  }, []);

  const disabled = state.isProcessing;
  const primaryOption = options[0];

  return (
    <div className="flex items-center gap-3">
      {/* Split button */}
      <div ref={ref} className="relative flex items-center">
        <button
          onClick={() => { if (!disabled) primaryOption?.action(); }}
          disabled={disabled}
          aria-label={primaryOption?.label ?? 'Sim day'}
          title={primaryOption?.label ?? 'Sim day'}
          className={`flex items-center justify-center px-3 py-1.5 rounded-l-lg transition-colors ${
            disabled
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-[#2d5a27] hover:bg-[#3a7233] text-white'
          }`}
        >
          <Play size={14} fill="currentColor" />
        </button>
        <button
          onClick={() => !disabled && setOpen(prev => !prev)}
          disabled={disabled}
          className={`flex items-center px-1.5 py-1.5 rounded-r-lg border-l border-black/30 transition-colors ${
            disabled
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-[#1e4219] hover:bg-[#2d5a27] text-white'
          }`}
        >
          <ChevronDown
            size={12}
            className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && !disabled && (
          <div className="absolute top-full left-0 mt-1 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl z-[300] min-w-[240px] py-1.5 overflow-hidden">
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={opt.action}
                className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/5 transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Phase label + status */}
      <div className="flex flex-col leading-none min-w-0">
        <span className="text-[11px] font-bold text-white truncate">{phaseLabel}</span>
        <span
          className={`text-[10px] mt-0.5 ${
            state.isProcessing ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
          }`}
        >
          {state.isProcessing ? 'Simulating…' : 'Idle'}
        </span>
      </div>

      {draftGate.modal}
      {rosterGate.modal}
      {teamOptionGate.modal}
      {expiringGate.modal}
    </div>
  );
};
