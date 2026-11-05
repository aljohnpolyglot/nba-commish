import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, Volume2, VolumeX } from 'lucide-react';
import { CountryFlag } from '../shared/CountryFlag';
import type { LeagueSetupSelection } from './LeagueTypeSelector';
import {
  isModdedSetupMuted,
  playModdedSetupSound,
  playModdedSetupTrack,
  setModdedSetupMuted,
} from './moddedSetupAudio';
import {
  MODDED_BASES,
  MODDED_EUROPE_MARKETS,
  type ModdedBaseCard,
  type ModdedEuropeCard,
  type ModdedSelectorBase,
} from './moddedSelectorData';

interface ModdedBaseSelectorProps {
  onSelect: (selection: LeagueSetupSelection) => void;
  onBack: () => void;
}

const ModdedLogo = ({ europe = false }: { europe?: boolean }) => (
  <div className="flex select-none items-center gap-2">
    <div className={`relative flex h-11 w-11 items-center justify-center overflow-hidden ${europe ? 'rounded-full border-2 border-yellow-400 bg-slate-900' : ''}`}>
      {europe ? (
        <>
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: '15s' }}>
            {Array.from({ length: 8 }, (_, index) => (
              <span
                key={index}
                className="absolute left-1/2 top-1/2 text-[8px] text-yellow-400"
                style={{ transform: `translate(-50%, -50%) rotate(${index * 45}deg) translate(15px)` }}
              >
                ★
              </span>
            ))}
          </div>
          <span className="text-xl text-yellow-400">◉</span>
        </>
      ) : (
        <svg className="h-11 w-11 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" viewBox="0 0 100 100" fill="none">
          <path d="M15 80 L35 20 H45 L25 80 Z" fill="#3b82f6" opacity=".8" />
          <path d="M55 80 L75 20 H85 L65 80 Z" fill="#ef4444" opacity=".8" />
          <circle cx="50" cy="50" r="30" stroke="#fff" strokeWidth="3" fill="#111827" />
          <path d="M30 50 H70 M50 30 V70" stroke="#fff" strokeWidth="2" />
          <path d="M36 36 C42 45 42 55 36 64 M64 36 C58 45 58 55 64 64" stroke="#fff" strokeWidth="2" />
        </svg>
      )}
    </div>
    <div className="modded-font-sport flex flex-col italic leading-none">
      <span className={`${europe ? 'text-2xl text-yellow-400' : 'bg-gradient-to-r from-blue-400 to-red-400 bg-clip-text text-3xl text-transparent'} font-black tracking-tight`}>
        {europe ? 'EUROPE' : 'MODDED'}
      </span>
      {europe && <span className="-mt-1 text-base font-bold tracking-widest text-white">MARKET</span>}
    </div>
  </div>
);

const ArcadeButton = ({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    onMouseEnter={() => playModdedSetupSound('hover')}
    disabled={disabled}
    className={`relative w-full max-w-sm group ${disabled ? 'cursor-not-allowed opacity-70 grayscale' : 'cursor-pointer'}`}
  >
    <div className="absolute inset-0 rounded-lg bg-blue-500 opacity-30 blur-md transition-opacity group-hover:opacity-60" />
    <div className="relative flex items-center justify-between overflow-hidden rounded-lg border border-blue-400/50 bg-gradient-to-r from-blue-700 to-blue-900 px-6 py-4 shadow-inner transition-transform group-active:scale-[.98]">
      <div className="absolute inset-y-0 left-0 w-1.5 origin-top-left skew-x-12 bg-red-500" />
      <div className="absolute inset-y-0 right-0 w-1.5 origin-bottom-right skew-x-12 bg-red-500" />
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-300 bg-black/50 text-sm font-bold text-slate-300">
          {disabled ? '?' : '✕'}
        </div>
        <span className="modded-font-sport text-lg italic tracking-widest text-white">{label}</span>
      </div>
      <div className="text-blue-300 transition-transform group-hover:translate-x-1">{disabled ? '🔒' : '❯ ❯'}</div>
    </div>
  </button>
);

const BaseCard = ({ card, selected, onSelect }: { card: ModdedBaseCard; selected: boolean; onSelect: () => void }) => (
  <button
    type="button"
    id={`card-${card.id}`}
    onClick={onSelect}
    onMouseEnter={() => playModdedSetupSound('hover')}
    className="relative w-[85vw] shrink-0 snap-center overflow-hidden rounded-xl border bg-black/40 text-left transition-all duration-300 sm:w-[300px] md:w-auto"
    style={{
      borderColor: selected ? card.accent : 'rgba(255,255,255,.1)',
      boxShadow: selected ? `0 0 0 4px ${card.accent}22` : undefined,
    }}
  >
    <div className="group relative aspect-[16/10] w-full overflow-hidden">
      <img
        src={card.cover}
        alt={`${card.cardTitle} cover`}
        className={`h-full w-full object-cover transition-all duration-500 ${selected ? '' : 'scale-105 saturate-50 opacity-45 group-hover:opacity-75 group-hover:saturate-100'}`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full border bg-black/40" style={{ borderColor: selected ? card.accent : 'rgba(255,255,255,.2)', backgroundColor: selected ? card.accent : undefined }}>
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </div>
    </div>
    <div className="flex items-center justify-between gap-2 border-t border-white/5 bg-slate-950/90 p-3.5">
      <div className="min-w-0">
        <h3 className="modded-font-sport truncate text-base italic tracking-wide text-white">{card.cardTitle}</h3>
        <p className="mt-0.5 truncate text-[10px] text-slate-400">{card.subtitle}</p>
      </div>
      <span className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest" style={{ borderColor: `${card.accent}55`, color: card.accent, backgroundColor: `${card.accent}16` }}>
        {card.badge}
      </span>
    </div>
  </button>
);

const EuropeCard = ({ market, selected, onSelect }: { market: ModdedEuropeCard; selected: boolean; onSelect: () => void }) => (
  <button
    type="button"
    id={`card-europe-${market.id}`}
    onClick={onSelect}
    onMouseEnter={() => playModdedSetupSound('hover')}
    className={`relative w-[85vw] shrink-0 snap-center overflow-hidden rounded-xl border bg-black/40 text-left transition-all duration-300 sm:w-auto ${selected ? 'border-yellow-400 ring-4 ring-yellow-400/15' : 'border-white/10 hover:border-white/30'}`}
  >
    <div className="group relative aspect-[16/10] overflow-hidden">
      <img src={market.cover} alt={`${market.title} cover`} className={`h-full w-full object-cover transition-all duration-500 ${selected ? '' : 'scale-105 saturate-50 opacity-45 group-hover:opacity-75 group-hover:saturate-100'}`} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className={`absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full border ${selected ? 'border-yellow-400 bg-yellow-500' : 'border-white/20 bg-black/40'}`}>
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </div>
    </div>
    <div className="flex items-center justify-between gap-2 border-t border-white/5 bg-slate-950/90 p-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <CountryFlag country={market.country} iso2={market.iso2} className="inline-flex h-3.5 w-5 shrink-0 rounded-sm" />
        <div className="min-w-0">
          <h3 className="modded-font-sport truncate text-base italic tracking-wide text-white">{market.title}</h3>
          <p className="mt-0.5 truncate text-[10px] text-slate-400">{market.subtitle}</p>
        </div>
      </div>
      <span className="shrink-0 rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-yellow-500">{market.code}</span>
    </div>
  </button>
);

export const ModdedBaseSelector: React.FC<ModdedBaseSelectorProps> = ({ onSelect, onBack }) => {
  const [booting, setBooting] = useState(true);
  const [bootStep, setBootStep] = useState(0);
  const [screen, setScreen] = useState<'main' | 'europe'>('main');
  const [selectedBase, setSelectedBase] = useState<ModdedSelectorBase>('nba');
  const [selectedMarket, setSelectedMarket] = useState<ModdedEuropeCard['id']>('spain');
  const [muted, setMuted] = useState(isModdedSetupMuted());
  const activeBase = MODDED_BASES.find(base => base.id === selectedBase) ?? MODDED_BASES[0];
  const activeMarket = useMemo(
    () => MODDED_EUROPE_MARKETS.find(market => market.id === selectedMarket) ?? MODDED_EUROPE_MARKETS[0],
    [selectedMarket],
  );

  useEffect(() => {
    if (!booting) return;
    const timer = window.setInterval(() => setBootStep(step => {
      if (step >= 3) {
        window.clearInterval(timer);
        window.setTimeout(() => setBooting(false), 180);
        return 4;
      }
      return step + 1;
    }), 180);
    return () => window.clearInterval(timer);
  }, [booting]);

  useEffect(() => {
    if (booting) return;
    playModdedSetupTrack(screen === 'europe' ? selectedMarket : selectedBase);
  }, [booting, screen, selectedBase, selectedMarket]);

  const continueSetup = () => {
    playModdedSetupSound('success');
    if (screen === 'main' && selectedBase === 'europe') {
      setScreen('europe');
      return;
    }
    if (screen === 'europe') {
      onSelect({ leagueType: 'modded', moddedLeagueBase: 'europe', europeMarket: selectedMarket });
      return;
    }
    if (selectedBase !== 'college') {
      onSelect({ leagueType: 'modded', moddedLeagueBase: selectedBase });
    }
  };

  const goBack = () => {
    playModdedSetupSound('back');
    if (screen === 'europe') setScreen('main');
    else onBack();
  };

  if (booting) {
    return (
      <div className="modded-setup modded-scanlines relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,.15),transparent_60%)]" />
        <div className="z-10 flex max-w-md flex-col items-center px-6 text-center">
          <ModdedLogo />
          <div className="mt-8 h-1.5 w-64 overflow-hidden rounded-full border border-slate-700/50 bg-slate-800">
            <motion.div className="h-full bg-gradient-to-r from-blue-500 to-red-500" animate={{ width: `${bootStep * 25}%` }} />
          </div>
          <div className="mt-4 h-6 font-mono text-xs text-slate-400">
            {['Initializing...', 'Loading audio...', 'Preparing layout...', 'Loading assets...', 'Ready'][bootStep]}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modded-setup modded-scanlines relative flex min-h-screen flex-col justify-between overflow-x-hidden bg-[#07090e] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(59,130,246,.12)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(239,68,68,.12)_0%,transparent_50%)]" />
      </div>
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-2 border-b border-white/5 bg-black/10 px-4 py-3 backdrop-blur-sm sm:px-6 sm:py-4">
        <div className="flex flex-1 justify-start">
          <button type="button" onClick={goBack} onMouseEnter={() => playModdedSetupSound('hover')} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-300 transition-all hover:border-white/30 hover:bg-white/10 hover:text-white sm:gap-2 sm:px-3 sm:text-sm">
            <ChevronLeft className="h-4 w-4" /> {screen === 'europe' ? 'Back' : 'Reset'}
          </button>
        </div>
        <div className="shrink-0"><ModdedLogo europe={screen === 'europe'} /></div>
        <div className="flex flex-1 justify-end">
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setModdedSetupMuted(next);
            }}
            className="rounded-lg border border-white/10 bg-slate-900/60 p-2 text-slate-300 transition-all hover:bg-slate-800 hover:text-white"
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {muted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4 text-blue-400" />}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-6 md:px-6">
        <AnimatePresence mode="wait">
          <motion.div key={screen} initial={{ opacity: 0, x: screen === 'main' ? 0 : 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} className="flex flex-col gap-6">
            <div className="order-2 relative grid min-h-0 w-full grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl backdrop-blur-xl lg:order-1 lg:min-h-[480px] lg:grid-cols-12">
              <div className="relative z-10 flex flex-col justify-between p-6 lg:col-span-5 lg:p-8">
                <div>
                  {screen === 'europe' && <CountryFlag country={activeMarket.country} iso2={activeMarket.iso2} className="mb-4 inline-flex h-5 w-8 rounded-sm" />}
                  <h2 className="modded-font-sport mb-4 text-3xl font-black uppercase italic leading-none tracking-tight text-yellow-400 md:text-5xl lg:mb-6">
                    {screen === 'europe' ? activeMarket.title : activeBase.title}
                  </h2>
                  <p className="text-sm font-light leading-relaxed text-slate-300 md:text-lg">
                    {screen === 'europe' ? activeMarket.description : activeBase.description}
                  </p>
                </div>
                <div className="mt-6 lg:mt-8">
                  <ArcadeButton
                    label={screen === 'main' && selectedBase === 'europe' ? 'CHOOSE REGION' : activeBase.disabled ? 'SOON' : 'CONTINUE'}
                    disabled={screen === 'main' && activeBase.disabled}
                    onClick={continueSetup}
                  />
                </div>
              </div>
              <div className="relative hidden min-h-[200px] overflow-hidden lg:col-span-7 lg:block">
                <AnimatePresence mode="wait">
                  <motion.div key={screen === 'europe' ? selectedMarket : selectedBase} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                    <img src={screen === 'europe' ? activeMarket.cover : activeBase.cover} alt="Ecosystem cover art" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#07090e] via-transparent to-transparent" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {screen === 'main' ? (
              <div className="order-1 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 pt-2 md:grid md:grid-cols-3 md:pb-0 lg:order-2 lg:grid-cols-5 lg:gap-6 lg:pt-4">
                {MODDED_BASES.map(card => (
                  <BaseCard key={card.id} card={card} selected={selectedBase === card.id} onSelect={() => {
                    setSelectedBase(card.id);
                    playModdedSetupSound('click');
                  }} />
                ))}
              </div>
            ) : (
              <div className="order-1 space-y-3 pt-2 lg:order-2 lg:pt-4">
                <div className="px-2 font-mono text-xs font-bold uppercase tracking-widest text-yellow-500">
                  Select regional league identity ({MODDED_EUROPE_MARKETS.length} countries available)
                </div>
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:grid sm:grid-cols-2 sm:pb-0 md:grid-cols-3 lg:grid-cols-5">
                  {MODDED_EUROPE_MARKETS.map(market => (
                    <EuropeCard key={market.id} market={market} selected={selectedMarket === market.id} onSelect={() => {
                      setSelectedMarket(market.id);
                      playModdedSetupSound('click');
                    }} />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 border-t border-white/5 bg-black/20 px-6 py-3 font-mono text-[10px] text-slate-500 backdrop-blur-sm">
        <span>SELECT: ENTER/CLICK</span><span>NAV: HOVER CARDS</span>
      </footer>
    </div>
  );
};
