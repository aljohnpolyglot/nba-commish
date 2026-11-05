import { Volume2, VolumeX, X } from 'lucide-react';

export function Navbar({
  soundEnabled,
  setSoundEnabled,
  title,
  onSkip,
  onExit,
}: {
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  title: string;
  onSkip: () => void;
  onExit: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md text-white shadow-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/data/pba/news-assets/early-web2-pba-logo.jpg"
            alt="PBA logo"
            className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-0.5 shadow-lg ring-2 ring-amber-400/40 sm:h-11 sm:w-11"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-extrabold tracking-tight text-white sm:text-lg">
                {title}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSkip}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-200 transition-colors hover:bg-slate-800 sm:px-3 sm:text-xs"
          >
            Skip
          </button>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
              soundEnabled
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                : 'border-slate-800 bg-slate-900 text-slate-500 hover:text-white'
            }`}
            title={soundEnabled ? 'Mute Stadium Audio' : 'Enable Stadium Audio FX'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={onExit}
            aria-label="Exit ceremony"
            title="Exit Ceremony"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
