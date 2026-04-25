import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronDown, Play } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';
import {
  getTradeDeadlineDate, getDraftLotteryDate, getDraftDate,
  getFreeAgencyStartDate, getOpeningNightDate, getTrainingCampDate,
  getAllStarWeekendStartDate, toISODateString,
} from '../../utils/dateUtils';
import { Tab } from '../../types';

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

function getSimPhase(state: any): SimPhase {
  const norm = normalizeDate(state.date);
  const curDate = new Date(`${norm}T00:00:00Z`);
  const ls = state.leagueStats;
  const seasonYear: number = ls?.year ?? curDate.getUTCFullYear();

  const openingNight = getOpeningNightDate(seasonYear);
  const draftLotteryDate = getDraftLotteryDate(seasonYear, ls);
  const draftDate = getDraftDate(seasonYear, ls);
  const faStartDate = getFreeAgencyStartDate(seasonYear, ls);
  const nextOpeningNight = getOpeningNightDate(seasonYear + 1);

  if (curDate < openingNight) return 'preseason';
  if (curDate >= faStartDate && curDate < nextOpeningNight) return 'free-agency';
  if (curDate > draftDate) return 'after-draft';
  // On draft day: if the user has already run the draft via DraftSimulatorView,
  // flip immediately to 'after-draft' so they get the FA chain instead of the
  // dead-end "View draft" loop.
  if (toISODateString(draftDate) === norm) return state.draftComplete ? 'after-draft' : 'draft';

  const hasPlayIn = (state.playoffs?.playInGames ?? []).some((g: any) => !g.winner);
  const hasActivePlayoffs = (state.playoffs?.series ?? []).some((s: any) => s.status !== 'complete');
  if (hasPlayIn && !hasActivePlayoffs) return 'playin';
  if (hasActivePlayoffs) return 'playoffs';

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

  const simDay = useCallback(() => {
    setOpen(false);
    dispatchAction({ type: 'ADVANCE_DAY' });
  }, [dispatchAction]);

  // stopBefore:true — advance TO that date, leaving its games unplayed (for "until X starts")
  const simToDate = useCallback((date: string) => {
    setOpen(false);
    dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: date, stopBefore: true } } as any);
  }, [dispatchAction]);

  // no stopBefore — play through that date's games (for "until end of X")
  const simThrough = useCallback((date: string) => {
    setOpen(false);
    dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: date } } as any);
  }, [dispatchAction]);

  const navigate = useCallback((view: Tab) => {
    setOpen(false);
    setCurrentView(view);
  }, [setCurrentView]);

  const options: PlayOption[] = useMemo(() => {
    const tdStr              = toISODateString(getTradeDeadlineDate(seasonYear, ls));
    const draftLotteryStr    = toISODateString(getDraftLotteryDate(seasonYear, ls));
    const draftStr           = toISODateString(getDraftDate(seasonYear, ls));
    const faStartStr         = toISODateString(getFreeAgencyStartDate(seasonYear, ls));
    const openingNightStr    = toISODateString(getOpeningNightDate(seasonYear));
    // Land Thursday (1 day before Rising Stars Friday) so the user sees All-Star
    // weekend BEFORE any of its events trigger.
    const allStarStr         = toISODateString(addDaysToDate(getAllStarWeekendStartDate(seasonYear, ls), -1));
    // Training camp for the NEXT season (e.g. free agency 2026 → camp Oct 2026 = season 2027)
    const preseasonStr       = toISODateString(getTrainingCampDate(seasonYear + 1, ls));
    // Last scheduled playoff game from state.schedule — Finals Game 7 if all-7
    // games are pre-scheduled, otherwise whatever's left. Falls back to the day
    // before the draft if the bracket hasn't been generated yet.
    const lastPlayoffStr     = findLastTruePlayoffDate(state) ?? addDays(draftStr, -1);

    switch (phase) {
      case 'preseason': {
        const opts: PlayOption[] = [{ label: 'One day', action: simDay }];
        const firstPreseason = findFirstPreseasonDate(state);
        const lastPreseason  = findLastPreseasonDate(state);
        // If we haven't reached the first preseason game yet, offer to land on it
        if (firstPreseason && firstPreseason > norm) {
          opts.push({ label: 'Until preseason games', action: () => simToDate(firstPreseason) });
        }
        // Play through every remaining preseason game (last preseason game day,
        // games inclusive). Falls back gracefully if no preseason games exist.
        if (lastPreseason && lastPreseason >= norm) {
          opts.push({ label: 'Through preseason', action: () => simThrough(lastPreseason) });
        }
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
        // Play-in: prefer scheduled play-in games; otherwise fall back to the day
        // AFTER the last regular-season game (real schedule rolls straight from
        // regular season into play-in). Always shown in regular season so the user
        // can skip to it before the bracket has been generated.
        const playInScheduled  = findFirstPlayInDate(state);
        const lastRegSeasonStr = findLastRegSeasonDate(state);
        const playInTarget     = playInScheduled ?? (lastRegSeasonStr ? addDays(lastRegSeasonStr, 1) : null);
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
          { label: 'One day',            action: simDay },
          { label: 'View draft lottery', action: () => navigate('Draft Lottery' as Tab) },
          { label: 'Until draft',        action: () => simToDate(draftStr) },
        ];

      case 'draft':
        return [
          { label: 'One day',    action: simDay },
          { label: 'View draft', action: () => navigate('Draft Board' as Tab) },
        ];

      case 'after-draft':
        return [
          { label: 'One day',           action: simDay },
          { label: 'Until free agency', action: () => simToDate(faStartStr) },
        ];

      case 'free-agency':
        return [
          { label: 'One day',         action: simDay },
          { label: 'One week',        action: () => simToDate(addDays(norm, 7)) },
          { label: 'Until preseason', action: () => simToDate(preseasonStr) },
        ];

      default:
        return [{ label: 'One day', action: simDay }];
    }
  }, [phase, norm, seasonYear, ls, state, simDay, simToDate, simThrough, navigate]);

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
    </div>
  );
};
