import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Trophy, X } from 'lucide-react';
import type {
  SimulationBoundaryChoice,
  SimulationBoundaryPreflight,
  SimulationBoundarySelections,
} from '../../services/simulation/boundaryPreflight';
import { TimeService } from '../../services/time/TimeService';

interface SimulationBoundaryPreflightModalProps {
  preflight: SimulationBoundaryPreflight | null;
  onConfirm: (selections: SimulationBoundarySelections) => void;
  onCancel: () => void;
}

const choiceLabel = (
  kind: SimulationBoundaryPreflight['boundaries'][number]['kind'],
  choice: SimulationBoundaryChoice,
): string => {
  switch (choice) {
    case 'STOP_AND_WATCH': return kind === 'ALL_STAR_WEEKEND' ? 'Stop & Watch All-Star' : 'Stop & Watch Lottery';
    case 'AUTO_RESOLVE_CONTINUE': return 'Auto-Resolve & Continue';
    case 'STOP': return 'Stop at Deadline';
    case 'CONTINUE': return 'Continue Through Deadline';
  }
};

export function SimulationBoundaryPreflightModal({
  preflight,
  onConfirm,
  onCancel,
}: SimulationBoundaryPreflightModalProps) {
  const [selections, setSelections] = useState<SimulationBoundarySelections>({});
  const isMultiple = (preflight?.boundaries.length ?? 0) > 1;

  useEffect(() => {
    if (!preflight) {
      setSelections({});
      return;
    }
    setSelections(Object.fromEntries(
      preflight.boundaries
        .filter(boundary => boundary.allowedChoices.length === 1)
        .map(boundary => [boundary.kind, boundary.allowedChoices[0]]),
    ));
  }, [preflight]);

  useEffect(() => {
    if (!preflight) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, preflight]);

  const allSelected = useMemo(() => preflight?.boundaries.every(
    boundary => boundary.allowedChoices.includes(selections[boundary.kind] as SimulationBoundaryChoice),
  ) === true, [preflight, selections]);

  const choose = (kind: SimulationBoundaryPreflight['boundaries'][number]['kind'], choice: SimulationBoundaryChoice) => {
    if (!preflight) return;
    if (!isMultiple) {
      onConfirm({ [kind]: choice });
      return;
    }
    setSelections(current => ({ ...current, [kind]: choice }));
  };

  return (
    <AnimatePresence>
      {preflight && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-6" role="presentation">
          <motion.button
            type="button"
            aria-label="Cancel simulation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 h-full w-full bg-black/90 backdrop-blur-md"
            onClick={onCancel}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="simulation-boundary-title"
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-indigo-400/30 bg-[#0f0f0f] shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-indigo-500/[0.06] px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                {preflight.boundaries.length === 1 && preflight.boundaries[0].kind === 'DRAFT_LOTTERY'
                  ? <Trophy className="h-5 w-5 shrink-0 text-indigo-300" />
                  : <CalendarClock className="h-5 w-5 shrink-0 text-indigo-300" />}
                <h2 id="simulation-boundary-title" className="truncate text-base font-black uppercase tracking-tight text-white sm:text-lg">
                  {preflight.boundaries.length === 1 ? preflight.boundaries[0].title : 'Important Dates Ahead'}
                </h2>
              </div>
              <button type="button" onClick={onCancel} aria-label="Cancel simulation" className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-white">
                <X size={18} />
              </button>
            </header>

            <div className="overflow-y-auto px-4 py-5 sm:px-6">
              {isMultiple && (
                <p className="mb-5 text-sm leading-6 text-slate-300">
                  This simulation is headed to {preflight.targetLabel} and will cross these league events. Choose how the run should handle each one before it starts.
                </p>
              )}
              <div className="space-y-4">
                {preflight.boundaries.map(boundary => (
                  <section key={`${boundary.kind}:${boundary.date}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    {isMultiple && <h3 className="text-sm font-black uppercase tracking-wide text-white">{boundary.title}</h3>}
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-indigo-300">
                      {TimeService.formatForDisplay(boundary.date, 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{boundary.description}</p>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {boundary.allowedChoices.map(choice => {
                        const selected = selections[boundary.kind] === choice;
                        return (
                          <button
                            key={choice}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => choose(boundary.kind, choice)}
                            className={`min-h-11 rounded-xl border px-3 py-3 text-xs font-black uppercase tracking-wider transition-colors ${
                              selected
                                ? 'border-indigo-300 bg-indigo-400 text-slate-950'
                                : 'border-white/10 bg-white/[0.05] text-white hover:bg-white/10'
                            }`}
                          >
                            {choiceLabel(boundary.kind, choice)}
                          </button>
                        );
                      })}
                      {boundary.manualOnly && (
                        <div className="flex min-h-11 items-center justify-center rounded-xl border border-white/5 bg-black/20 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                          Automatic resolution unavailable
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 bg-black/20 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={onCancel} className="min-h-11 rounded-xl px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-400 transition-colors hover:bg-white/5 hover:text-white">
                Cancel
              </button>
              {isMultiple && (
                <button
                  type="button"
                  disabled={!allSelected}
                  onClick={() => onConfirm(selections)}
                  className="min-h-11 rounded-xl bg-indigo-400 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950 transition-colors hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Start Simulation
                </button>
              )}
            </footer>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}
