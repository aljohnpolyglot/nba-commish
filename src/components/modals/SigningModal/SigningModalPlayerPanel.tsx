import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { getScoutedDisplayOverall, getScoutedDisplayPotential } from '../../../utils/scoutingFuzz';
import { getNonNBAGistData } from '../../central/view/nonNBACache';
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';
import type { GameState, NBAPlayer, NBATeam } from '../../../types';
import { isExternalLeagueStatus } from '../../../constants';
import { PLAYER_SILHOUETTE_DATA_URI } from '../../../utils/playerSilhouette';
import { Loader2 } from 'lucide-react';
import { useConnectedBlackPortrait } from '../../../utils/portraitBackground';

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
    isRookieExtEligible: boolean;
    isSupermaxEligible: boolean;
  };
  money: (value: number) => string;
  onAllImagesFailed: () => void;
  player: NBAPlayer;
  playerFace: unknown;
  portraitFallback?: string | null;
  realAge: number;
  seasonYear: number;
  state: GameState;
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
  state,
  team,
  teamColors,
}: SigningModalPlayerPanelProps): ReactElement {
  const portraitCandidates = useMemo(
    () => [...new Set([fullBodyRender, portraitFallback].filter((source): source is string => !!source))],
    [fullBodyRender, portraitFallback],
  );
  const [rankedPortraits, setRankedPortraits] = useState(portraitCandidates);
  const [portraitIndex, setPortraitIndex] = useState(0);
  useEffect(() => {
    let active = true;
    setRankedPortraits(portraitCandidates);
    setPortraitIndex(0);
    if (portraitCandidates.length < 2) return () => { active = false; };

    void Promise.all(portraitCandidates.map(source => new Promise<{ source: string; pixels: number }>(resolve => {
      const image = new Image();
      image.onload = () => resolve({ source, pixels: image.naturalWidth * image.naturalHeight });
      image.onerror = () => resolve({ source, pixels: 0 });
      image.src = source;
    }))).then(measured => {
      if (!active) return;
      const ranked = measured
        .filter(candidate => candidate.pixels > 0)
        .sort((left, right) => right.pixels - left.pixels)
        .map(candidate => candidate.source);
      setRankedPortraits(ranked.length > 0 ? ranked : portraitCandidates);
      setPortraitIndex(0);
    });

    return () => { active = false; };
  }, [portraitCandidates]);
  const primarySrc = imgAllFailed ? undefined : (rankedPortraits[portraitIndex] ?? portraitCandidates[0]);
  const { src: displayPrimarySrc, preparing: isPreparingPortrait } = useConnectedBlackPortrait(primarySrc);
  const usingFullBodyRender = !!fullBodyRender && primarySrc === fullBodyRender;
  const hasFace = isRealFaceConfig(playerFace);
  const extensionBadgeLabel = limits.isSupermaxEligible
    ? 'Supermax Eligible'
    : limits.isRookieExtEligible
      ? 'Rookie Extension Eligible'
      : null;
  const visibleRating = getScoutedDisplayOverall(state, player, seasonYear);
  const visiblePotential = Math.max(
    visibleRating,
    getScoutedDisplayPotential(state, player, seasonYear, seasonYear),
  );

  return (
    <div className="w-full lg:w-[38%] xl:w-[35%] shrink-0 relative flex flex-col border-b lg:border-b-0 lg:border-r border-white/5 bg-[#090909]">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.07]" />
      <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none z-10" />

      <div className="relative z-20 pt-5 sm:pt-8 px-4 sm:px-8 pb-0">
        <span className="text-[9px] font-black text-[#e21d37] uppercase tracking-[0.4em] block mb-2">
          Prospective Signee
        </span>
        <h2 className="text-3xl sm:text-4xl xl:text-5xl font-black italic uppercase tracking-tighter leading-[0.88] text-white drop-shadow-2xl break-words">
          {player.name}
        </h2>
        {extensionBadgeLabel && (
          <div className="inline-flex mt-3 items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-widest text-amber-300">
              {extensionBadgeLabel}
            </span>
          </div>
        )}
      </div>

      <div className="relative z-50 flex-1 flex items-end justify-center overflow-visible min-h-[220px] sm:min-h-[280px] lg:min-h-[400px]">
        <AnimatePresence mode="wait">
          {isPreparingPortrait ? (
            <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Preparing player portrait">
              <Loader2 className="animate-spin text-white/70" size={28} />
            </div>
          ) : (imgAllFailed || !displayPrimarySrc) && hasFace ? (
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
              key={displayPrimarySrc ?? 'fallback'}
              initial={{ opacity: 0, scale: 1.05, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              src={displayPrimarySrc || PLAYER_SILHOUETTE_DATA_URI}
              onError={() => {
                if (portraitIndex + 1 < rankedPortraits.length) {
                  setPortraitIndex(index => index + 1);
                } else {
                  onAllImagesFailed();
                }
              }}
              referrerPolicy="no-referrer"
              className={
                usingFullBodyRender
                  ? 'absolute inset-x-[10%] sm:inset-x-[6%] lg:inset-0 bottom-0 w-[80%] sm:w-[88%] lg:w-full h-full object-contain lg:object-cover object-top drop-shadow-[0_0_80px_rgba(226,29,55,0.15)] select-none pointer-events-none'
                  : 'absolute inset-x-[10%] sm:inset-x-[6%] lg:inset-x-0 bottom-0 w-[80%] sm:w-[88%] lg:w-full h-[88%] sm:h-full object-contain object-bottom drop-shadow-[0_0_80px_rgba(226,29,55,0.15)] select-none pointer-events-none scale-100 sm:scale-[1.02] lg:scale-[1.05]'
              }
              style={usingFullBodyRender ? undefined : { transformOrigin: 'bottom center' }}
            />
          )}
        </AnimatePresence>

        <div className="relative z-20 w-full px-4 sm:px-6 pb-5 sm:pb-8 flex justify-center gap-2 items-end">
          {[
            { label: 'Rating', value: visibleRating, accent: '#e21d37' },
            { label: 'Potential', value: visiblePotential, accent: null as string | null },
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
              const isExternal = isExternalLeagueStatus(player.status);
              if (state.leagueType !== 'fictional' && isExternal) {
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
