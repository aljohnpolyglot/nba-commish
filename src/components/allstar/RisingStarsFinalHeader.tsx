import React from 'react';
import { BarChart3, ChevronRight, Star, Trophy } from 'lucide-react';
import type { Game } from '../../types';

interface RisingStarsFinalHeaderProps {
  game: Game;
  boxScore: any;
  homeName: string;
  awayName: string;
  homeLogo?: string;
  awayLogo?: string;
  onViewBoxScore: (game: Game) => void;
}

const ScoreSide: React.FC<{
  name: string;
  score: number;
  logo?: string;
  winner: boolean;
}> = ({ name, score, logo, winner }) => (
  <div className={`relative min-w-0 overflow-hidden rounded-2xl border px-4 py-4 sm:px-6 sm:py-5 ${winner
    ? 'border-cyan-300/80 bg-gradient-to-br from-cyan-500/20 via-[#071426]/95 to-[#071426] shadow-[0_0_32px_rgba(34,211,238,0.2)]'
    : 'border-violet-500/70 bg-gradient-to-br from-violet-600/15 via-[#100b2d]/95 to-[#090a22] shadow-[0_0_32px_rgba(139,92,246,0.18)]'}`}
  >
    {winner && (
      <div className="absolute left-0 top-0 z-10 flex items-center gap-1.5 rounded-br-xl bg-gradient-to-r from-cyan-400 to-sky-200 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-950 sm:text-[10px]">
        <Trophy size={12} /> Winner
      </div>
    )}
    <div className={`flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:gap-4 ${winner ? 'pt-5 sm:pt-3' : ''}`}>
      <div className={`flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full border-2 bg-slate-950/80 p-2 shadow-[0_0_24px_rgba(34,211,238,0.2)] ${winner ? 'border-cyan-300' : 'border-violet-500'}`}>
        {logo ? <img src={logo} alt="" className="h-full w-full rounded-full object-contain" referrerPolicy="no-referrer" /> : <Star size={34} className="fill-cyan-300 text-cyan-300" />}
      </div>
      <div className="min-w-0 text-center sm:flex-1 sm:text-left">
        <div className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-slate-200 sm:text-xs">{name}</div>
        <div className={`mt-1 font-mono text-5xl font-black leading-none tracking-tighter sm:text-7xl ${winner ? 'text-white' : 'text-slate-300'}`}>{score}</div>
      </div>
    </div>
  </div>
);

export const RisingStarsFinalHeader: React.FC<RisingStarsFinalHeaderProps> = ({
  game,
  boxScore,
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  onViewBoxScore,
}) => {
  const homeScore = Number(boxScore?.homeScore ?? game.homeScore ?? 0);
  const awayScore = Number(boxScore?.awayScore ?? game.awayScore ?? 0);
  const homeWon = homeScore >= awayScore;
  const mvp = [...(boxScore?.homeStats ?? []), ...(boxScore?.awayStats ?? [])]
    .sort((a: any, b: any) => Number(b.pts ?? 0) - Number(a.pts ?? 0) || Number(b.reb ?? 0) - Number(a.reb ?? 0))[0] as any;
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-cyan-400/30 bg-[#030718] p-3 text-white shadow-[0_18px_70px_rgba(0,0,0,0.48)] sm:p-5 xl:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(6,182,212,0.2),transparent_28%),radial-gradient(circle_at_90%_10%,rgba(139,92,246,0.22),transparent_30%),linear-gradient(135deg,rgba(8,145,178,0.08),transparent_45%,rgba(88,28,135,0.12))]" />
      <div className="relative mb-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-cyan-300 sm:mb-5 sm:text-xs">
        <div className="h-px w-6 bg-gradient-to-r from-transparent to-cyan-400 sm:w-16" />
        <Star size={12} className="fill-current" /> Rising Stars · Final Score <Star size={12} className="fill-current" />
        <div className="h-px w-6 bg-gradient-to-l from-transparent to-violet-400 sm:w-16" />
      </div>

      <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4 xl:gap-7">
        <ScoreSide name={homeName} score={homeScore} logo={homeLogo} winner={homeWon} />
        <div className="flex flex-col items-center gap-2 sm:gap-3">
          <div className="bg-gradient-to-b from-cyan-100 via-cyan-300 to-violet-500 bg-clip-text text-2xl font-black italic text-transparent drop-shadow-[0_0_12px_rgba(34,211,238,0.6)] sm:text-4xl xl:text-6xl">VS</div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-slate-950/70 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-cyan-300 sm:text-[10px]"><Trophy size={11} /> Final</div>
        </div>
        <ScoreSide name={awayName} score={awayScore} logo={awayLogo} winner={!homeWon} />
      </div>

      <div className="relative mt-3 flex justify-center sm:mt-4">
        <button onClick={() => onViewBoxScore(game)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-200/60 bg-gradient-to-b from-cyan-200 via-cyan-400 to-sky-600 px-5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-950 shadow-[0_8px_24px_rgba(34,211,238,0.24)] transition hover:brightness-110 sm:px-7 sm:text-xs">
          <BarChart3 size={15} /> View Box Score <ChevronRight size={15} />
        </button>
      </div>

      {mvp?.name && (
        <div className="relative mt-4 border-t border-cyan-400/25 pt-3 sm:mt-5 sm:pt-4">
          <div className="mb-3 flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.26em] text-cyan-300 sm:text-[11px]"><div className="h-px flex-1 bg-gradient-to-r from-transparent to-cyan-400/70" />Rising Stars Awards<Star size={10} className="fill-current" /><div className="h-px flex-1 bg-gradient-to-l from-transparent to-violet-500/70" /></div>
          <div className="flex min-w-0 items-center gap-3 rounded-xl border border-cyan-400/45 bg-gradient-to-r from-cyan-500/20 to-violet-950/25 px-3 py-3 sm:px-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-300 sm:h-12 sm:w-12"><Trophy size={24} /></div>
            <div className="min-w-0"><div className="text-[8px] font-black uppercase tracking-[0.12em] text-cyan-300 sm:text-[10px]">Rising Stars MVP</div><div className="truncate text-xs font-black text-white sm:text-lg">{mvp.name}</div></div>
          </div>
        </div>
      )}
    </section>
  );
};
