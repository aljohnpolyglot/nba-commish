import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Sparkles, Trophy } from 'lucide-react';
import type { LigaEndesaStep, Team } from './types';

interface LigaEndesaViewProps {
  step: LigaEndesaStep;
  competitionName: string;
  previousTeams: Team[];
  nextTeams: Team[];
  relegatedTeams: Team[];
  promotedTeams: Team[];
  season: number;
  userTeamId?: number;
  onComplete?: () => void;
}

const spring = { type: 'spring' as const, stiffness: 50, damping: 25, mass: 1 };

export const LigaEndesaView: React.FC<LigaEndesaViewProps> = ({
  step,
  competitionName,
  previousTeams,
  nextTeams,
  relegatedTeams,
  promotedTeams,
  season,
  userTeamId,
  onComplete,
}) => {
  const [phase, setPhase] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const relegatedIds = new Set(relegatedTeams.map(team => team.id));

  useEffect(() => {
    if (bottomRef.current && (step === 1 || step === 2)) {
      const timeout = window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
      return () => window.clearTimeout(timeout);
    }
  }, [phase, step]);

  useEffect(() => {
    setPhase(0);
    const timeouts: number[] = [];
    const later = (delay: number, action: () => void) => timeouts.push(window.setTimeout(action, delay));
    const finish = (delay: number) => onComplete && later(delay + 1800, onComplete);
    if (step === 1) {
      previousTeams.forEach((_, index) => later((index + 1) * 120, () => setPhase(index + 1)));
      finish(Math.max(600, previousTeams.length * 120));
    } else if (step === 2) {
      later(500, () => setPhase(1));
      later(1800, () => setPhase(2));
      later(2800, () => setPhase(3));
      finish(2800);
    } else if (step === 3) {
      promotedTeams.forEach((_, index) => later(500 + index * 1400, () => setPhase(index + 1)));
      finish(500 + Math.max(0, promotedTeams.length - 1) * 1400);
    } else {
      later(500, () => setPhase(1));
      finish(500);
    }
    return () => timeouts.forEach(window.clearTimeout);
  }, [onComplete, previousTeams.length, promotedTeams.length, step]);

  const currentTeams = step === 4 && phase >= 1 ? nextTeams : previousTeams;
  const renderRow = (team: Team, index: number) => {
    const isRelegated = relegatedIds.has(team.id);
    if (step === 2 && isRelegated) {
      const slot = relegatedTeams.findIndex(candidate => candidate.id === team.id);
      return phase < 3 ? (
        <motion.div key={team.id} layout layoutId={`domestic-team-${team.id}`} animate={{ opacity: phase >= 2 ? 0 : 1, filter: phase >= 2 ? 'blur(12px)' : 'blur(0px)', scale: phase >= 2 ? 0.9 : 1, backgroundColor: phase >= 1 ? 'rgba(159,18,57,0.2)' : 'rgba(255,255,255,0.02)', borderColor: phase >= 1 ? 'rgba(225,29,72,0.5)' : 'rgba(255,255,255,0.05)' }} transition={{ duration: 1 }} className="grid grid-cols-12 items-center rounded-xl border p-2 text-white sm:rounded-2xl sm:p-3">
          <span className="col-span-2 text-xs font-black text-white/40 sm:text-sm">{team.rank ?? index + 1}</span><div className="col-span-7 flex min-w-0 items-center gap-3 sm:gap-4">{team.logoUrl && <img src={team.logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain sm:h-10 sm:w-10" />}<span className="truncate text-xs font-bold text-white/80 sm:text-sm">{team.name}</span></div><span className="col-span-3 justify-self-end rounded-md border border-rose-400 bg-rose-600/80 px-2 py-0.5 text-[8px] font-black text-rose-100 shadow-[0_0_10px_rgba(225,29,72,0.4)] sm:text-[10px]">RELEGATED</span>
        </motion.div>
      ) : (
        <motion.div key={`domestic-vacant-${team.id}`} layout layoutId={`domestic-team-${team.id}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring} className="grid grid-cols-12 items-center rounded-xl border-2 border-dashed border-emerald-500/60 bg-emerald-950/10 p-2 shadow-[inset_0_0_20px_rgba(16,185,129,0.1)] sm:rounded-2xl sm:p-3"><span className="col-span-2 text-xs font-black text-emerald-600 sm:text-sm">{team.rank ?? index + 1}</span><div className="col-span-10 flex items-center gap-3"><div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-emerald-500/50 bg-emerald-500/5"><Sparkles className="h-3 w-3 animate-pulse text-emerald-400" /></div><span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 sm:text-xs">PROMOTION PLACE #{slot + 1} — OPEN</span></div></motion.div>
      );
    }
    const isUserTeam = team.id === userTeamId;
    return <motion.div key={team.id} layout layoutId={`domestic-team-${team.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: step === 1 && phase <= index ? 0 : 1, y: 0 }} transition={spring} className={`relative grid grid-cols-12 items-center overflow-hidden rounded-xl border p-2 sm:rounded-2xl sm:p-3 ${isUserTeam ? 'border-emerald-500/40 bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : team.statusType === 'promoted' ? 'border-emerald-500/50 bg-gradient-to-r from-emerald-950/40 to-teal-900/20' : 'border-white/5 bg-white/[0.02]'}`}><span className="col-span-2 text-xs font-black text-white/40 sm:text-sm">{team.rank ?? index + 1}</span><div className="col-span-7 flex min-w-0 items-center gap-3 sm:gap-4">{team.logoUrl && <img src={team.logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain sm:h-10 sm:w-10" />}<span className={`truncate text-xs font-bold sm:text-sm ${isUserTeam ? 'text-emerald-100' : 'text-white/80'}`}>{team.name}{isUserTeam && <span className="ml-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black text-emerald-500">YOU</span>}</span></div><span className={`col-span-3 justify-self-end rounded-md border px-2 py-0.5 text-[8px] font-black sm:text-[10px] ${team.statusType === 'promoted' ? 'border-emerald-400 bg-emerald-600/80 text-white' : 'border-white/10 bg-white/5 text-white/40'}`}>{team.status}</span></motion.div>;
  };

  return (
    <LayoutGroup>
      <div className="relative flex w-full max-w-4xl flex-col items-center">
        <AnimatePresence>
          {(step === 1 || step === 2 || (step === 4 && phase >= 1)) && <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }} transition={spring} className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d] p-4 shadow-2xl sm:p-6 lg:p-8"><div className="pointer-events-none absolute left-1/2 top-0 h-[100px] w-[120%] -translate-x-1/2 bg-emerald-500/10 blur-[100px]" /><div className="relative z-10 mb-4 flex items-center justify-between gap-2 sm:mb-6"><h2 className="truncate text-base font-black uppercase tracking-wide text-white sm:text-xl">{step === 4 ? 'Updated Participants' : `${competitionName} Standings`}</h2><span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-400 sm:px-3 sm:text-xs">Season {step === 4 ? season : season - 1}</span></div><div className="relative z-10 space-y-1.5 sm:space-y-2">{currentTeams.map(renderRow)}<div ref={bottomRef} className="h-4" /></div></motion.div>}
        </AnimatePresence>
        <AnimatePresence>
          {step === 3 && <motion.div layout className="relative z-50 mx-auto flex w-full max-w-4xl flex-col items-stretch justify-center gap-4 sm:gap-6 md:flex-row lg:gap-8">{promotedTeams.map((team, index) => <motion.div key={team.id} layoutId={`domestic-team-${team.id}`} className="relative flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-3xl border border-emerald-500/30 bg-[#0a0a0c] p-6 shadow-[0_0_40px_rgba(16,185,129,0.15)] sm:p-8"><div className="pointer-events-none absolute left-1/2 top-0 h-[100px] w-full -translate-x-1/2 bg-gradient-to-b from-emerald-500/10 to-transparent" /><h2 className="relative z-10 flex items-center gap-2 border-b border-white/10 pb-4 text-xs font-black uppercase tracking-widest text-emerald-400 sm:text-sm"><Trophy className="h-4 w-4 sm:h-5 sm:w-5" />PROMOTED CLUB</h2><AnimatePresence>{phase >= index + 1 && <motion.div initial={{ opacity: 0, filter: 'blur(10px)', scale: 0.9 }} animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }} className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">{team.logoUrl && <img src={team.logoUrl} alt="" className="mb-4 h-20 w-20 object-contain drop-shadow-2xl sm:h-28 sm:w-28" />}<h3 className="text-xl font-black tracking-wide text-white sm:text-2xl">{team.name}</h3><p className="mt-4 bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-xs font-black uppercase tracking-widest text-transparent sm:text-sm">Promotion Confirmed</p></motion.div>}</AnimatePresence></motion.div>)}</motion.div>}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
};
