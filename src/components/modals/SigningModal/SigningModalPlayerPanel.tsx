import type { ReactElement } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { convertTo2KRating } from '../../../utils/helpers';
import { getDisplayPotential } from '../../../utils/playerRatings';
import { getNonNBAGistData } from '../../central/view/nonNBACache';
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';
import type { NBAPlayer, NBATeam } from '../../../types';

const formatPos = (pos = '') => {
  const p = pos.toUpperCase().trim();
  if (!p) return '—';
  if (p.includes('POINT GUARD')) return 'PG';
  if (p.includes('SHOOTING GUARD')) return 'SG';
  if (p.includes('SMALL FORWARD')) return 'SF';
  if (p.includes('POWER FORWARD')) return 'PF';
  if (p.includes('CENTER')) return 'C';
  if (/^[A-Z]{1,3}$/.test(p)) return p;
  return p.split(/\s+/).map(s => s[0]).join('') || '—';
};

interface SigningModalPlayerPanelProps {
  fullBodyRender?: string | null;
  imgAllFailed: boolean;
  limits: {
    isSupermaxEligible: boolean;
    maxPct: number;
  };
  money: (value: number) => string;
  onAllImagesFailed: () => void;
  player: NBAPlayer;
  playerFace: unknown;
  portraitFallback?: string | null;
  realAge: number;
  seasonYear: number;
  team: NBATeam;
  teamColors?: [string, string, string];
}

export default function SigningModalPlayerPanel({
  fullBodyRender,
  imgAllFailed,
  limits,
  money,
  onAllImagesFailed,
  player,
  playerFace,
  portraitFallback,
  realAge,
  seasonYear,
  team,
  teamColors,
}: SigningModalPlayerPanelProps): ReactElement {
  const primarySrc = fullBodyRender || portraitFallback;
  const hasFace = isRealFaceConfig(playerFace);

  return (
    <div className="w-full lg:w-[38%] xl:w-[35%] shrink-0 relative flex flex-col border-b lg:border-b-0 lg:border-r border-white/5 bg-[#090909]">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.07]" />
      <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none z-10" />

      <div className="relative z-20 pt-8 px-8 pb-0">
        <span className="text-[9px] font-black text-[#e21d37] uppercase tracking-[0.4em] block mb-2">
          Prospective Signee
        </span>
        <h2 className="text-4xl xl:text-5xl font-black italic uppercase tracking-tighter leading-[0.88] text-white drop-shadow-2xl">
          {player.name}
        </h2>
        {limits.maxPct >= 0.3 && (
          <div className="inline-flex mt-3 items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-widest text-amber-300">
              {limits.isSupermaxEligible ? 'Supermax Eligible' : 'Max Extension Eligible'}
            </span>
          </div>
        )}
      </div>

      <div className="relative z-50 flex-1 flex items-end justify-center overflow-visible min-h-[220px] sm:min-h-[280px] lg:min-h-[400px]">
        <AnimatePresence mode="wait">
          {(imgAllFailed || !primarySrc) && hasFace ? (
            <motion.div
              key="face"
              initial={{ opacity: 0, scale: 1.05, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="absolute inset-x-[15%] sm:inset-x-[10%] lg:inset-x-[5%] bottom-0 w-[70%] sm:w-[80%] lg:w-[90%] h-[88%] sm:h-full select-none pointer-events-none drop-shadow-[0_0_80px_rgba(226,29,55,0.15)]"
            >
              <MyFace face={playerFace} colors={teamColors} style={{ width: '100%', height: '100%' }} />
            </motion.div>
          ) : (
            <motion.img
              key={primarySrc ?? 'fallback'}
              initial={{ opacity: 0, scale: 1.05, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              src={primarySrc || `https://picsum.photos/seed/${encodeURIComponent(player.name ?? 'p')}/600/900`}
              onError={e => {
                const img = e.target as HTMLImageElement;
                if (fullBodyRender && !img.dataset.triedPortrait && portraitFallback && portraitFallback !== img.src) {
                  img.dataset.triedPortrait = '1';
                  img.src = portraitFallback;
                } else if (hasFace) {
                  onAllImagesFailed();
                } else {
                  img.removeAttribute('src');
                }
              }}
              referrerPolicy="no-referrer"
              className={
                fullBodyRender
                  ? 'absolute inset-x-[10%] sm:inset-x-[6%] lg:inset-0 bottom-0 w-[80%] sm:w-[88%] lg:w-full h-full object-contain lg:object-cover object-top drop-shadow-[0_0_80px_rgba(226,29,55,0.15)] select-none pointer-events-none'
                  : 'absolute inset-x-[10%] sm:inset-x-[6%] lg:inset-x-0 bottom-0 w-[80%] sm:w-[88%] lg:w-full h-[88%] sm:h-full object-contain object-bottom drop-shadow-[0_0_80px_rgba(226,29,55,0.15)] select-none pointer-events-none scale-100 sm:scale-[1.02] lg:scale-[1.05]'
              }
              style={fullBodyRender ? undefined : { transformOrigin: 'bottom center' }}
            />
          )}
        </AnimatePresence>

        <div className="relative z-20 w-full px-6 pb-8 flex justify-center gap-2 items-end">
          {[
            (() => {
              const lastR = (player as any).ratings?.[(player as any).ratings?.length - 1];
              const hgt = lastR?.hgt ?? 50;
              const tp = lastR?.tp;
              const ovr2K = convertTo2KRating(player.overallRating ?? lastR?.ovr ?? 60, hgt, tp);
              return { label: 'Rating', value: ovr2K, accent: '#e21d37' };
            })(),
            (() => {
              const ageNow = realAge > 0 ? realAge : (player.age ?? 25);
              const yearProxy = new Date().getFullYear() - ageNow + ((player as any).born?.year ? 0 : ageNow);
              const currentYear = (player as any).born?.year ? ((player as any).born.year + ageNow) : yearProxy;
              const pot2K = getDisplayPotential(player, currentYear);
              return { label: 'Potential', value: pot2K, accent: null as string | null };
            })(),
          ].map(({ label, value, accent }) => (
            <div
              key={label}
              className="flex flex-col items-center bg-black/80 border border-white/10 rounded-sm px-3 md:px-5 py-3 backdrop-blur-md min-w-[70px] shadow-2xl"
              style={accent ? { borderColor: `${accent}50` } : {}}
            >
              <span className="text-[7px] md:text-[8px] font-black uppercase tracking-[0.2em] text-white/40 mb-1 block">
                {label}
              </span>
              <span className="text-2xl md:text-3xl font-black italic leading-none" style={{ color: accent ?? 'white' }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-20 bg-[#050505] px-4 sm:px-6 py-4 sm:py-5 border-t border-white/5 flex md:grid md:grid-cols-6 gap-3 overflow-x-auto md:overflow-visible whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {[
          { label: 'Pos', value: formatPos(player.pos) },
          { label: 'Age', value: realAge > 0 ? realAge : (player.age ?? '—') },
          {
            label: 'Ht',
            value: (() => {
              const h = (player as any).hgt;
              return typeof h === 'number' && h > 0 ? `${Math.floor(h / 12)}'${h % 12}"` : '—';
            })(),
          },
          {
            label: 'Wt',
            value: (() => {
              const raw = (player as any).weight;
              const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : 0;
              if (num > 0) return `${num}lb`;
              const isExternal = ['B-League', 'PBA', 'Euroleague', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'WNBA'].includes(player.status || '');
              if (isExternal) {
                const gist = getNonNBAGistData(player.status!, player.name);
                const gw = gist?.w ? parseInt(gist.w, 10) : 0;
                if (gw > 0) return `${gw}lb`;
              }
              return '—';
            })(),
          },
          {
            label: 'Exp',
            value: (() => {
              const draftYear = player.draft?.year;
              if (!draftYear || draftYear <= 0) return 'UDFA';
              const yrs = seasonYear - draftYear;
              return yrs > 0 ? `${yrs}Y` : 'R';
            })(),
          },
          {
            label: 'Last',
            value: (() => {
              const lastUSD = (player as any).lastSalaryUSD ?? (player.contract?.amount ? player.contract.amount * 1_000 : 0);
              return lastUSD > 0 ? money(lastUSD) : 'N/A';
            })(),
          },
        ].map(({ label, value }) => (
          <div key={label} className="min-w-[72px] shrink-0 md:min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/40 mb-1">{label}</p>
            <p className="text-sm font-black italic uppercase text-white truncate">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
