import type { ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type ActionAccent = 'violet' | 'cyan' | 'emerald' | 'amber' | 'sky';

interface ActionModalShellProps {
  open?: boolean;
  title: string;
  description?: string;
  icon: ReactNode;
  accent?: ActionAccent;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  selectedCount?: number;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  primaryIcon?: ReactNode;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  showSecondary?: boolean;
  wide?: boolean;
  compact?: boolean;
  elevated?: boolean;
}

const accentClasses: Record<ActionAccent, {
  icon: string;
  primary: string;
  glow: string;
}> = {
  violet: {
    icon: 'border-violet-400/25 bg-violet-500/10 text-violet-300',
    primary: 'border-violet-300/40 bg-gradient-to-r from-violet-700 via-indigo-600 to-violet-600 shadow-[0_0_28px_rgba(124,58,237,0.28)] hover:from-violet-600 hover:to-indigo-500',
    glow: 'bg-violet-600/10',
  },
  cyan: {
    icon: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-300',
    primary: 'border-cyan-300/35 bg-gradient-to-r from-cyan-700 to-blue-600 shadow-[0_0_28px_rgba(6,182,212,0.2)] hover:from-cyan-600 hover:to-blue-500',
    glow: 'bg-cyan-600/10',
  },
  emerald: {
    icon: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
    primary: 'border-emerald-300/35 bg-gradient-to-r from-emerald-700 to-teal-600 shadow-[0_0_28px_rgba(16,185,129,0.2)] hover:from-emerald-600 hover:to-teal-500',
    glow: 'bg-emerald-600/10',
  },
  amber: {
    icon: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
    primary: 'border-amber-300/35 bg-gradient-to-r from-amber-600 to-orange-600 shadow-[0_0_28px_rgba(245,158,11,0.2)] hover:from-amber-500 hover:to-orange-500',
    glow: 'bg-amber-600/10',
  },
  sky: {
    icon: 'border-sky-400/25 bg-sky-500/10 text-sky-300',
    primary: 'border-sky-300/35 bg-gradient-to-r from-sky-700 to-blue-600 shadow-[0_0_28px_rgba(14,165,233,0.2)] hover:from-sky-600 hover:to-blue-500',
    glow: 'bg-sky-600/10',
  },
};

export function ActionModalShell({
  open = true,
  title,
  description,
  icon,
  accent = 'violet',
  children,
  onClose,
  onBack,
  selectedCount,
  primaryLabel,
  primaryDisabled,
  primaryIcon,
  onPrimary,
  secondaryLabel = 'Cancel',
  onSecondary,
  showSecondary = true,
  wide,
  compact,
  elevated,
}: ActionModalShellProps) {
  const classes = accentClasses[accent];
  const hasFooter = primaryLabel || onSecondary || selectedCount !== undefined;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 flex items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_14%_18%,rgba(76,29,149,0.12),transparent_28%),radial-gradient(circle_at_88%_82%,rgba(30,64,175,0.13),transparent_30%),rgba(2,6,23,0.9)] p-3 backdrop-blur-md sm:p-6 ${elevated ? 'z-[180]' : 'z-[70]'}`}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.97, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 18 }}
            transition={{ duration: 0.2 }}
            className={`relative flex max-h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden rounded-[1.65rem] border border-slate-600/50 bg-[linear-gradient(145deg,rgba(13,24,48,0.985),rgba(6,14,33,0.995))] shadow-[0_28px_90px_rgba(0,0,0,0.62),0_0_35px_rgba(76,29,149,0.08)] sm:max-h-[calc(100vh-3rem)] ${
              wide ? 'max-w-6xl' : compact ? 'max-w-xl' : 'max-w-4xl'
            }`}
          >
            <div className={`pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl ${classes.glow}`} />
            <header className="relative flex items-start gap-3 border-b border-slate-700/70 px-4 py-5 sm:items-center sm:gap-5 sm:px-8 sm:py-7">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back"
                  className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/35 text-slate-400 transition hover:border-slate-500 hover:text-white sm:mt-0"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border sm:h-16 sm:w-16 ${classes.icon}`}>
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-xl font-black uppercase tracking-tight text-white sm:text-3xl">{title}</h2>
                {description && <p className="mt-1 text-sm leading-relaxed text-slate-400 sm:text-base">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-800/80 hover:text-white sm:h-12 sm:w-12"
              >
                <X size={26} />
              </button>
            </header>

            <div className="custom-scrollbar relative flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
              {children}
            </div>

            {hasFooter && (
              <footer className="relative flex flex-col gap-3 border-t border-slate-700/70 bg-slate-950/20 px-4 py-4 sm:flex-row sm:items-center sm:px-8 sm:py-5">
                <div className="min-w-0 flex-1">
                  {selectedCount !== undefined && (
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                      {selectedCount} selected
                    </p>
                  )}
                </div>
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  {showSecondary && (onSecondary || onClose) && (
                    <button
                      type="button"
                      onClick={onSecondary ?? onClose}
                      className="h-12 rounded-xl border border-slate-600/50 bg-slate-900/45 px-8 text-sm font-bold text-white transition hover:border-slate-500 hover:bg-slate-800"
                    >
                      {secondaryLabel}
                    </button>
                  )}
                  {primaryLabel && onPrimary && (
                    <button
                      type="button"
                      onClick={onPrimary}
                      disabled={primaryDisabled}
                      className={`flex h-12 items-center justify-center gap-2 rounded-xl border px-8 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none ${classes.primary}`}
                    >
                      {primaryLabel}
                      {primaryIcon}
                    </button>
                  )}
                </div>
              </footer>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
