import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CheckCircle2, CircleDot, Trophy, X } from 'lucide-react';
import type { OffseasonFixtureRow } from './offseasonSidebarData';

type CompetitionSummary = {
  id: string;
  label: string;
  count: number;
  format?: string;
  color: string;
};

const safeColor = (value?: string): string =>
  /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value) : '#14b8a6';

const colorWithAlpha = (color: string, alpha: string): string => `${safeColor(color)}${alpha}`;

const competitionSummaries = (games: OffseasonFixtureRow[]): CompetitionSummary[] => {
  const rows = new Map<string, CompetitionSummary>();
  for (const game of games) {
    if (!game.competitionId) continue;
    const existing = rows.get(game.competitionId);
    if (existing) {
      existing.count += 1;
      continue;
    }
    rows.set(game.competitionId, {
      id: game.competitionId,
      label: game.competitionLabel ?? game.competitionName ?? game.competitionId,
      count: 1,
      format: game.competitionFormat,
      color: safeColor(game.accentColor),
    });
  }
  return [...rows.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
};

const SummaryIcon: React.FC<{ format?: string; color: string }> = ({ format, color }) => (
  format === 'regular-league'
    ? <CircleDot size={27} style={{ color }} />
    : <Trophy size={27} style={{ color }} />
);

export const ScheduleDrawModal: React.FC<{
  open: boolean;
  games: OffseasonFixtureRow[];
  seasonLabel: string;
  teamName: string;
  teamLogoUrl?: string;
  onClose: () => void;
  onConfirm: () => void;
}> = ({
  open,
  games,
  seasonLabel,
  teamName,
  teamLogoUrl,
  onClose,
  onConfirm,
}) => {
  const summaries = useMemo(() => competitionSummaries(games), [games]);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Close schedule draw"
        className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-draw-title"
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden border-slate-700/80 bg-[#07111f] shadow-[0_30px_100px_rgba(0,0,0,0.7)] sm:h-[min(92dvh,900px)] sm:max-w-5xl sm:rounded-2xl sm:border"
      >
        <header className="shrink-0 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_45%)] px-4 py-4 sm:px-8 sm:py-6">
          <div className="flex items-start gap-3 sm:gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] sm:h-14 sm:w-14">
              <CalendarDays size={24} className="text-slate-100" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-teal-300 sm:text-xs">Fixture Release</p>
              <h2 id="schedule-draw-title" className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
                Schedule Draw
              </h2>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 sm:text-sm">
                  <CalendarDays size={15} className="text-slate-300" />
                  <span>{seasonLabel} Season</span>
                </div>
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 sm:text-sm">
                  {teamLogoUrl ? (
                    <img src={teamLogoUrl} alt="" className="h-5 w-5 shrink-0 object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-teal-500/20 text-[9px] font-black text-teal-200">
                      {teamName.slice(0, 1)}
                    </span>
                  )}
                  <span className="max-w-[13rem] truncate sm:max-w-none">{teamName}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={21} />
            </button>
          </div>
        </header>

        <div className="shrink-0 px-4 py-4 sm:px-8 sm:py-5">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 sm:px-4">
              <CalendarDays size={27} className="shrink-0 text-slate-400" />
              <div className="min-w-0">
                <div className="text-lg font-black leading-none text-white">{games.length}</div>
                <div className="mt-1 truncate text-[11px] text-slate-400">fixtures</div>
              </div>
            </div>
            {summaries.map(summary => (
              <div
                key={summary.id}
                className="flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 sm:px-4"
                style={{
                  borderColor: colorWithAlpha(summary.color, '30'),
                  backgroundColor: colorWithAlpha(summary.color, '0D'),
                }}
              >
                <div className="shrink-0">
                  <SummaryIcon format={summary.format} color={summary.color} />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-black leading-none text-white">{summary.count}</div>
                  <div className="mt-1 truncate text-[11px] text-slate-400">{summary.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-4 shrink-0 border-t border-white/10 sm:mx-8" />
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          <p className="mb-3 px-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Fixtures</p>
          {games.length > 0 ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/25 custom-scrollbar">
                {games.map(game => {
                  const color = safeColor(game.accentColor);
                  return (
                    <div
                      key={game.key}
                      className="grid grid-cols-[104px_1fr] items-center gap-x-3 gap-y-2 border-b border-white/[0.07] px-3 py-3 last:border-b-0 sm:grid-cols-[120px_112px_minmax(0,1fr)] sm:px-4"
                    >
                      <div className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-300 sm:text-sm">
                        <CalendarDays size={14} className="shrink-0 text-slate-500" />
                        {game.dateLabel}
                      </div>
                      <span
                        className="w-fit max-w-full truncate rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wide"
                        style={{
                          color,
                          borderColor: colorWithAlpha(color, '70'),
                          backgroundColor: colorWithAlpha(color, '1A'),
                        }}
                      >
                        {game.competitionLabel ?? game.competitionName ?? 'Fixture'}
                      </span>
                      <div className="col-span-2 flex min-w-0 items-center gap-2 text-xs font-medium leading-relaxed text-slate-100 sm:col-span-1 sm:text-sm">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                          {game.awayTeamLogoUrl
                            ? <img src={game.awayTeamLogoUrl} alt="" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                            : <span className="text-[9px] font-black text-slate-600">AWY</span>}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{game.matchup}</span>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                          {game.homeTeamLogoUrl
                            ? <img src={game.homeTeamLogoUrl} alt="" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                            : <span className="text-[9px] font-black text-slate-600">HME</span>}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {games.length > 10 && (
                <div className="shrink-0 py-2 text-center text-[11px] text-slate-500">
                  <span className="tracking-[0.35em]">•••</span>
                  <span className="mx-2">More fixtures below</span>
                  <span className="tracking-[0.35em]">•••</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
              No competition fixtures have been released for your club yet.
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#091422] px-4 py-3 sm:px-8">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={games.length === 0}
            className="flex items-center justify-center gap-2 rounded-xl border border-teal-300/30 bg-gradient-to-r from-cyan-600 to-emerald-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-teal-950/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-60"
          >
            <CheckCircle2 size={20} />
            Confirm Schedule
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
};
