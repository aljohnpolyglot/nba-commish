import React from 'react';

interface ArenaCourtTabProps {
  teamName: string;
  teamLogoUrl?: string;
  teamAbbrev?: string;
  arenaName: string;
}

export const ArenaCourtTab: React.FC<ArenaCourtTabProps> = ({
  teamName,
  teamLogoUrl,
  teamAbbrev,
  arenaName,
}) => (
  <div className="space-y-5">
    <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-6">
      <div className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Court Design</div>
      <div className="relative flex aspect-[94/50] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-[#c4935a]">
        <svg viewBox="0 0 940 500" className="absolute inset-0 h-full w-full" role="img" aria-label={`${teamName} basketball court`}>
          <defs>
            <pattern id="arena-maple" width="44" height="500" patternUnits="userSpaceOnUse">
              <rect width="44" height="500" fill="#c4935a" />
              <rect width="1.5" height="500" fill="#8b5e34" opacity="0.22" />
              <rect x="22" width="1" height="500" fill="#f4d29b" opacity="0.16" />
            </pattern>
          </defs>
          <rect width="940" height="500" fill="url(#arena-maple)" />
          <g fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="3">
            <rect x="18" y="18" width="904" height="464" rx="4" />
            <line x1="470" y1="18" x2="470" y2="482" />
            <circle cx="470" cy="250" r="60" />
            <circle cx="470" cy="250" r="4" fill="rgba(255,255,255,0.72)" />
            <rect x="18" y="165" width="192" height="170" fill="rgba(117,74,38,0.13)" />
            <circle cx="210" cy="250" r="60" />
            <line x1="55" y1="205" x2="55" y2="295" strokeWidth="5" />
            <circle cx="70" cy="250" r="9" />
            <path d="M70 205 A45 45 0 0 1 70 295" />
            <path d="M18 62 H80 C310 62 310 438 80 438 H18" />
            <rect x="730" y="165" width="192" height="170" fill="rgba(117,74,38,0.13)" />
            <circle cx="730" cy="250" r="60" />
            <line x1="885" y1="205" x2="885" y2="295" strokeWidth="5" />
            <circle cx="870" cy="250" r="9" />
            <path d="M870 205 A45 45 0 0 0 870 295" />
            <path d="M922 62 H860 C630 62 630 438 860 438 H922" />
          </g>
        </svg>
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          {teamLogoUrl ? (
            <img src={teamLogoUrl} alt={teamName} className="h-16 w-16 object-contain opacity-85 drop-shadow-lg mix-blend-multiply sm:h-24 sm:w-24" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-slate-900/60 sm:h-24 sm:w-24">
              <span className="text-lg font-black text-white/70 sm:text-2xl">{teamAbbrev ?? teamName.slice(0, 3).toUpperCase()}</span>
            </div>
          )}
        </div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center text-[8px] font-bold uppercase tracking-widest text-white/55 sm:text-[10px]">{arenaName}</div>
      </div>
    </section>

    <div className="grid gap-4 md:grid-cols-3">
      <CourtDetail title="Court Surface" value="Northern Maple" description="Standard basketball-grade hardwood from northern forests." />
      <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
        <div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Court Color</div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg border border-slate-700 bg-[#c4935a]" />
          <div>
            <div className="font-black text-white">Classic Maple</div>
            <p className="mt-1 text-xs text-slate-500">Traditional tone</p>
          </div>
        </div>
      </section>
      <CourtDetail title="Center Logo" value={teamName} description="Primary team logo displayed at half court." />
    </div>
  </div>
);

const CourtDetail: React.FC<{ title: string; value: string; description: string }> = ({ title, value, description }) => (
  <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
    <div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{title}</div>
    <div className="text-lg font-black text-white">{value}</div>
    <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
  </section>
);
