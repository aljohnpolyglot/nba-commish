import {
  ArrowRight,
  Check,
  ChevronLeft,
  EyeOff,
  Flag,
  Landmark,
  Mic2,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';
import type { TeamStatus } from '../../types';

type MediaStrategy = {
  headline: string;
  quote: string;
  icon: ComponentType<{ className?: string; size?: number }>;
};

const MEDIA_STRATEGIES: Record<TeamStatus, MediaStrategy> = {
  contending: {
    headline: 'Championship or Bust',
    quote: 'We believe this group has everything it needs to compete for a championship.',
    icon: Trophy,
  },
  win_now: {
    headline: 'Ready to Win Now',
    quote: 'Our goal is to win immediately and make a deep playoff run.',
    icon: Zap,
  },
  play_in_push: {
    headline: 'Back in the Playoff Race',
    quote: 'We expect to take a major step forward and compete for the postseason.',
    icon: Flag,
  },
  retooling: {
    headline: 'Building Around Our Core',
    quote: 'We believe in our core, but we will keep looking for the right pieces around them.',
    icon: RefreshCw,
  },
  cap_clearing: {
    headline: 'Keeping Our Options Open',
    quote: 'We want to stay flexible and make decisions that put the organization in a stronger position.',
    icon: Landmark,
  },
  rebuilding: {
    headline: 'Focused on the Future',
    quote: 'We are building something sustainable and will not sacrifice the future for short-term results.',
    icon: Shield,
  },
  development: {
    headline: 'Let the Young Core Grow',
    quote: 'This season is about giving our young players opportunities and helping them take the next step.',
    icon: Sparkles,
  },
};

const STRATEGY_OPTIONS = Object.entries(MEDIA_STRATEGIES) as Array<[TeamStatus, MediaStrategy]>;

const AUTO_STRATEGY: MediaStrategy = {
  headline: 'Avoid Making a Prediction',
  quote: 'We’ll evaluate the roster and let the season determine our direction.',
  icon: EyeOff,
};

type MediaDayStage = 'question' | 'answers' | 'confirmation';

interface SeasonStrategyModalProps {
  currentStrategy?: TeamStatus;
  onClose: () => void;
  onDeliver: (strategy?: TeamStatus) => Promise<void> | void;
  onProceed: () => Promise<void> | void;
  reporterName: string;
  seasonLabel: string;
  teamAbbrev?: string;
  teamColors?: string[];
  teamLogoUrl?: string;
  teamName: string;
}

export function SeasonStrategyModal({
  currentStrategy,
  onClose,
  onDeliver,
  onProceed,
  reporterName,
  seasonLabel,
  teamAbbrev,
  teamColors,
  teamLogoUrl,
  teamName,
}: SeasonStrategyModalProps) {
  const [stage, setStage] = useState<MediaDayStage>('question');
  const [selected, setSelected] = useState<TeamStatus | undefined>(currentStrategy);
  const [isDelivering, setIsDelivering] = useState(false);
  const selectedResponse = selected ? MEDIA_STRATEGIES[selected] : AUTO_STRATEGY;
  const primaryColor = teamColors?.[0] ?? '#f59e0b';
  const secondaryColor = teamColors?.[1] ?? '#fbbf24';

  const deliverStatement = async () => {
    setIsDelivering(true);
    try {
      await onDeliver(selected);
      setStage('confirmation');
    } finally {
      setIsDelivering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/85 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-[#080d18] shadow-2xl sm:rounded-3xl">
        <div
          className="relative shrink-0 overflow-hidden border-b border-white/10 px-5 py-5 sm:px-8 sm:py-6"
          style={{
            background: `radial-gradient(circle at 82% 0%, ${secondaryColor}38 0%, transparent 35%), linear-gradient(125deg, ${primaryColor}2e 0%, #0d1729 42%, #050914 100%)`,
          }}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.055]" aria-hidden="true">
            {teamLogoUrl && Array.from({ length: 12 }).map((_, index) => (
              <img
                key={index}
                src={teamLogoUrl}
                alt=""
                className="absolute h-16 w-16 object-contain"
                style={{
                  left: `${(index % 6) * 19 - 3}%`,
                  top: `${Math.floor(index / 6) * 72 - 10}%`,
                  transform: `rotate(${index % 2 === 0 ? -9 : 9}deg)`,
                }}
              />
            ))}
          </div>

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/95 p-2 shadow-xl sm:h-16 sm:w-16">
                {teamLogoUrl ? (
                  <img src={teamLogoUrl} alt={`${teamName} logo`} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-lg font-black text-slate-800">{teamAbbrev ?? teamName.slice(0, 3).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">Media Day</span>
                  <span className="rounded-full border border-red-400/35 bg-red-500/15 px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-red-200">
                    Media Availability
                  </span>
                </div>
                <h2 className="mt-2 truncate text-xl font-black uppercase tracking-tight text-white sm:text-2xl">{teamName}</h2>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Front Office Press Conference · {seasonLabel} Season Outlook
                </p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        {stage === 'question' && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-7 sm:px-8 sm:py-10">
              <div className="mx-auto max-w-2xl">
                <div className="mb-6 flex items-center justify-center">
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-slate-900 shadow-2xl">
                    <div className="absolute inset-2 rounded-full border border-amber-300/20" />
                    <Mic2 className="relative text-amber-300" size={34} />
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-center shadow-xl sm:p-9">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">Reporter · {reporterName}</div>
                  <p className="mt-4 text-xl font-black leading-relaxed text-white sm:text-3xl">
                    “What should fans expect from the team during the coming season?”
                  </p>
                </div>
              </div>
            </div>
            <div className="shrink-0 border-t border-white/10 bg-black/20 p-4 sm:px-8">
              <button
                onClick={() => setStage('answers')}
                className="ml-auto flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 text-xs font-black uppercase tracking-[0.18em] text-amber-950 transition-colors hover:bg-amber-300 sm:w-auto"
              >
                Answer Question
                <ArrowRight size={17} />
              </button>
            </div>
          </>
        )}

        {stage === 'answers' && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
              <button
                onClick={() => setStage('question')}
                className="mb-5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 transition-colors hover:text-white"
              >
                <ChevronLeft size={15} />
                Back to Question
              </button>

              <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
                <div className="flex gap-3">
                  <Mic2 className="mt-0.5 shrink-0 text-amber-300" size={17} />
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Reporter · {reporterName}</div>
                    <p className="mt-1 text-sm font-bold text-slate-200">What should fans expect from the team this season?</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ResponseCard
                  response={AUTO_STRATEGY}
                  selected={selected === undefined}
                  onSelect={() => setSelected(undefined)}
                />
                {STRATEGY_OPTIONS.map(([strategy, response]) => (
                  <ResponseCard
                    key={strategy}
                    response={response}
                    selected={selected === strategy}
                    onSelect={() => setSelected(strategy)}
                  />
                ))}
              </div>
            </div>
            <div className="shrink-0 border-t border-white/10 bg-black/25 p-4 sm:px-8">
              <button
                onClick={deliverStatement}
                disabled={isDelivering}
                className="ml-auto flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 text-xs font-black uppercase tracking-[0.18em] text-amber-950 transition-colors hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                <Mic2 size={17} />
                {isDelivering ? 'Delivering…' : 'Deliver Statement'}
              </button>
            </div>
          </>
        )}

        {stage === 'confirmation' && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8 sm:py-12">
              <div className="mx-auto max-w-2xl text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 text-emerald-300">
                  <Check size={31} strokeWidth={3} />
                </div>
                <div className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">Statement Delivered</div>
                <blockquote className="mt-5 rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-lg font-black leading-relaxed text-white shadow-xl sm:p-8 sm:text-2xl">
                  “{selectedResponse.quote}”
                </blockquote>
                <p className="mt-5 text-sm font-semibold text-slate-400">Your season direction has been set.</p>
                <p className="mt-2 text-xs text-slate-500">Thank you. We’ll take one final question.</p>
              </div>
            </div>
            <div className="shrink-0 border-t border-white/10 bg-black/25 p-4 sm:px-8">
              <button
                onClick={onProceed}
                className="ml-auto flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 text-xs font-black uppercase tracking-[0.18em] text-amber-950 transition-colors hover:bg-amber-300 sm:w-auto"
              >
                Proceed to Next Task
                <ArrowRight size={17} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResponseCard({
  onSelect,
  response,
  selected,
}: {
  onSelect: () => void;
  response: MediaStrategy;
  selected: boolean;
}) {
  const Icon = response.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex min-h-28 items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
        selected
          ? 'border-amber-300 bg-amber-300/10 shadow-[0_0_0_1px_rgba(252,211,77,0.16)]'
          : 'border-white/10 bg-slate-900/70 hover:border-white/25 hover:bg-slate-900'
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-amber-300 text-amber-950' : 'bg-white/5 text-slate-400 group-hover:text-white'}`}>
        <Icon size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className={`text-sm font-black ${selected ? 'text-amber-200' : 'text-white'}`}>{response.headline}</h3>
          <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${selected ? 'border-amber-300 bg-amber-300 shadow-[inset_0_0_0_3px_#101827]' : 'border-slate-600'}`} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">“{response.quote}”</p>
      </div>
    </button>
  );
}
