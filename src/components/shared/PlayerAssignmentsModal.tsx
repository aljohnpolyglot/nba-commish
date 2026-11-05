import { ArrowRight, Check, Globe2, UsersRound, X } from 'lucide-react';

export interface PlayerAssignmentModalItem {
  id: string;
  playerName: string;
  playerImageUrl?: string;
  destinationName: string;
  destinationSubtitle?: string;
  destinationLogoUrl?: string;
  statusLabel?: string;
}

interface PlayerAssignmentsModalProps {
  open: boolean;
  title: string;
  description: string;
  organizationName: string;
  organizationLogoUrl?: string;
  assignments: PlayerAssignmentModalItem[];
  statusLabel?: string;
  continueLabel?: string;
  participationLabel?: string;
  continueDisabled?: boolean;
  emptyMessage?: string;
  onClose: () => void;
  onContinue: () => void;
}

function AssignmentPortrait({ assignment }: { assignment: PlayerAssignmentModalItem }) {
  const initials = assignment.playerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();

  return (
    <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl border border-emerald-400/15 bg-gradient-to-b from-emerald-950 to-slate-950 sm:h-36 sm:w-32 md:h-40 md:w-40">
      <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-emerald-200/25">
        {initials}
      </div>
      {assignment.playerImageUrl && (
        <img
          src={assignment.playerImageUrl}
          alt={assignment.playerName}
          className="absolute inset-0 h-full w-full object-cover object-top"
          referrerPolicy="no-referrer"
          onError={event => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-950/80 to-transparent" />
    </div>
  );
}

export function PlayerAssignmentsModal({
  open,
  title,
  description,
  organizationName,
  organizationLogoUrl,
  assignments,
  statusLabel = 'Assigned',
  continueLabel = 'Continue',
  participationLabel,
  continueDisabled = false,
  emptyMessage = 'No players from your club were selected for this competition.',
  onClose,
  onContinue,
}: PlayerAssignmentsModalProps) {
  if (!open) return null;

  const assignmentCountLabel = participationLabel ?? (assignments.length === 1
    ? '1 player participating'
    : `${assignments.length} players participating`);

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/85 p-3 backdrop-blur-md sm:p-6" role="dialog" aria-modal="true" aria-labelledby="player-assignments-title">
      <div className="flex min-h-full items-center justify-center">
        <section className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-600/70 bg-[#101720] shadow-[0_32px_100px_rgba(0,0,0,0.75),0_0_45px_rgba(16,185,129,0.08)] sm:max-h-[calc(100dvh-3rem)]">
          <header className="relative shrink-0 border-b border-slate-700/70 px-5 py-5 sm:px-9 sm:py-8">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assignments"
              className="absolute right-4 top-4 rounded-lg p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white sm:right-6 sm:top-6"
            >
              <X size={24} />
            </button>
            <div className="flex items-start gap-4 pr-10 sm:gap-6">
              <div className="mt-1 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/5 text-emerald-400 sm:h-20 sm:w-20">
                <Globe2 size={42} strokeWidth={1.35} />
              </div>
              <div className="min-w-0 pt-1">
                <h2 id="player-assignments-title" className="text-2xl font-black tracking-tight text-white sm:text-4xl">
                  {title}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400 sm:text-lg">
                  {description}
                </p>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-400/25 bg-emerald-950/60 p-1.5 sm:h-12 sm:w-12">
                  {organizationLogoUrl ? (
                    <img src={organizationLogoUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-sm font-black text-emerald-300">{organizationName.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <p className="truncate text-sm font-bold text-white sm:text-lg">
                  {organizationName}
                  <span className="font-medium text-emerald-400"> — {assignmentCountLabel}</span>
                </p>
              </div>
              <UsersRound className="shrink-0 text-emerald-400" size={28} strokeWidth={1.7} />
            </div>

            <div className="space-y-3">
              {assignments.length === 0 ? (
                <div className="rounded-2xl border border-slate-700 bg-slate-900/50 px-5 py-10 text-center text-sm text-slate-400">
                  {emptyMessage}
                </div>
              ) : assignments.map(assignment => (
                <article key={assignment.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/65 p-3 shadow-lg shadow-black/10 sm:p-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-7">
                  <AssignmentPortrait assignment={assignment} />

                  <div className="min-w-0 self-center">
                    <h3 className="text-lg font-black leading-tight text-white sm:text-2xl">{assignment.playerName}</h3>
                    <div className="mt-2 flex min-w-0 items-center gap-2 text-sm text-slate-400 sm:text-base">
                      {organizationLogoUrl && <img src={organizationLogoUrl} alt="" className="h-6 w-6 shrink-0 object-contain" />}
                      <span className="truncate">{organizationName}</span>
                    </div>

                    <div className="mt-4 flex items-center gap-3 border-t border-slate-700/70 pt-4 md:hidden">
                      {assignment.destinationLogoUrl ? (
                        <img src={assignment.destinationLogoUrl} alt="" className="h-8 w-12 shrink-0 rounded-sm object-cover shadow-sm" />
                      ) : (
                        <Globe2 size={30} className="shrink-0 text-slate-500" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white">{assignment.destinationName}</p>
                        <p className="text-sm text-slate-400">{assignment.destinationSubtitle}</p>
                      </div>
                    </div>

                    <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 md:hidden">
                      <Check size={17} strokeWidth={2.5} /> {assignment.statusLabel ?? statusLabel}
                    </div>
                  </div>

                  <div className="hidden min-w-0 items-center gap-4 border-l border-slate-700/70 pl-7 md:flex">
                    {assignment.destinationLogoUrl ? (
                      <img src={assignment.destinationLogoUrl} alt="" className="h-10 w-14 shrink-0 rounded-sm object-cover shadow-sm" />
                    ) : (
                      <Globe2 size={38} className="shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-white">{assignment.destinationName}</p>
                      <p className="text-base text-slate-400">{assignment.destinationSubtitle}</p>
                    </div>
                  </div>

                  <div className="hidden border-l border-slate-700/70 pl-7 md:block">
                    <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
                      <Check size={17} strokeWidth={2.5} /> {assignment.statusLabel ?? statusLabel}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-700 bg-[#0d131b] px-4 py-4 sm:flex-row sm:justify-end sm:px-8 sm:py-5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 rounded-xl border border-slate-600 bg-slate-900 px-8 text-sm font-bold text-white transition-colors hover:bg-slate-800 sm:min-w-36"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={continueDisabled}
              className="flex min-h-12 items-center justify-center gap-7 rounded-xl border border-emerald-400/20 bg-gradient-to-r from-emerald-600 to-emerald-500 px-8 text-sm font-black text-white shadow-lg shadow-emerald-950/40 transition-colors hover:from-emerald-500 hover:to-emerald-400 disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 sm:min-w-52"
            >
              {continueLabel} <ArrowRight size={19} />
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}
