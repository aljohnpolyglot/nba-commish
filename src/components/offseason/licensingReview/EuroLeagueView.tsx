import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Award, Mail, Sparkles, Star } from 'lucide-react';
import type { Candidate, EuroLeagueStep, Team } from './types';

interface EuroLeagueViewProps {
  step: EuroLeagueStep;
  teams: Team[];
  finalTeams: Team[];
  candidates: Candidate[];
  season: number;
  userTeamId?: number;
  invitationTeamId?: number;
  invitationAgreement?: string;
  invitationValidThrough?: string;
  onAccept: () => Promise<void> | void;
  onDecline: () => Promise<void> | void;
  onComplete?: () => void;
}

const spring = { type: 'spring' as const, stiffness: 50, damping: 25, mass: 1 };

export const EuroLeagueView: React.FC<EuroLeagueViewProps> = ({
  step,
  teams,
  finalTeams,
  candidates,
  season,
  userTeamId,
  invitationTeamId,
  invitationAgreement,
  invitationValidThrough,
  onAccept,
  onDecline,
  onComplete,
}) => {
  const [phase, setPhase] = useState(0);
  const [decisionMade, setDecisionMade] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const visibleCandidates = candidates.slice(0, 4);
  const selectedCandidate = candidates.find(candidate => candidate.id === invitationTeamId)
    ?? candidates.find(candidate => candidate.isSelected)
    ?? candidates[0];

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
      [1, 2, 3, 4, 5].forEach((value, index) => later(450 + index * 420, () => setPhase(value)));
      finish(2150);
    } else if (step === 2) {
      later(600, () => setPhase(1));
      later(1600, () => setPhase(2));
      finish(1600);
    } else if (step === 3) {
      const count = Math.max(1, visibleCandidates.length);
      for (let index = 0; index < count; index += 1) {
        later(450 + index * 1700, () => setPhase(index * 2 + 1));
        later(1400 + index * 1700, () => setPhase(index * 2 + 2));
      }
      finish(1400 + (count - 1) * 1700);
    } else if (invitationTeamId != null && !decisionMade) {
      later(450, () => setPhase(1));
    } else {
      later(450, () => setPhase(1));
      later(1800, () => setPhase(2));
      finish(1800);
    }
    return () => timeouts.forEach(window.clearTimeout);
  }, [decisionMade, invitationTeamId, onComplete, step, visibleCandidates.length]);

  const statusPhase = (team: Team) => {
    if (step > 1) return 1;
    if (team.statusType === 'long-term') return phase >= 1 ? 1 : 0;
    if (team.statusType === 'active') return phase >= 2 ? 1 : 0;
    if (team.statusType === 'expiring') return phase >= 4 ? 1 : 0;
    return phase >= 5 ? 1 : 0;
  };

  const statusBadge = (team: Team) => {
    const styles = team.statusType === 'long-term'
      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
      : team.statusType === 'active'
        ? 'bg-sky-950/60 text-sky-400 border-sky-500/30 shadow-[0_0_10px_rgba(14,165,233,0.2)]'
        : team.statusType === 'expiring'
          ? 'bg-amber-950/60 text-amber-400 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
          : 'bg-rose-950/80 text-rose-400 border-rose-500/50 shadow-[0_0_15px_rgba(225,29,72,0.4)]';
    return <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold sm:rounded-lg sm:px-3 sm:py-1 sm:text-xs ${styles}`}>{team.status}</span>;
  };

  const candidateStats = (candidate: Candidate) => [
    ['Domestic Form', candidate.performance],
    ['Continental Standing', candidate.continentalStanding],
    ['Club Standing', candidate.clubStanding],
    ['Continuity', candidate.continuity],
  ] as const;

  const renderCandidateScores = (candidate: Candidate, show: boolean) => (
    <div className="mx-auto mt-4 w-full max-w-md space-y-2 sm:mt-6 sm:space-y-3">
      {candidateStats(candidate).map(([label, value], index) => (
        <div key={label}>
          <div className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-wider text-white/60 sm:text-xs">
            <span>{label}</span><span className="font-mono text-white">{show ? value : 0}<span className="text-white/40">/100</span></span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full border border-white/5 bg-white/5 sm:h-2">
            <motion.div initial={{ width: 0 }} animate={{ width: show ? `${value}%` : 0 }} transition={{ duration: 1, delay: show ? index * 0.1 : 0 }} className="h-full rounded-full bg-gradient-to-r from-orange-600 to-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
          </div>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-4 font-bold">
        <span className="text-sm tracking-widest text-white/80 sm:text-base">REVIEW SCORE</span>
        <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: show ? 1 : 0.8 }} className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-xl text-transparent sm:text-2xl">{show ? candidate.totalScore.toFixed(1) : '0.0'}</motion.span>
      </div>
    </div>
  );

  const listTeams = step === 4 && phase >= 2 ? finalTeams : teams;
  const expiredTeams = teams.filter(team => team.statusType === 'expired');
  const participantList = useMemo(() => listTeams.map(team => {
    const expiredIndex = expiredTeams.findIndex(candidate => candidate.id === team.id);
    if (step === 2 && expiredIndex >= 0) {
      return phase < 2 ? (
        <motion.div key={team.id} layout layoutId={`team-${team.id}`} animate={{ opacity: phase === 1 ? 0 : 1, filter: phase === 1 ? 'blur(12px)' : 'blur(0px)', scale: phase === 1 ? 0.9 : 1 }} transition={{ duration: 1 }} className="flex items-center justify-between rounded-xl border border-rose-900/50 bg-rose-950/20 p-3 sm:rounded-2xl sm:p-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">{team.logoUrl && <img src={team.logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain opacity-80 sm:h-10 sm:w-10" />}<span className="truncate text-sm font-semibold text-rose-200/80 sm:text-base">{team.name}</span></div>{statusBadge(team)}
        </motion.div>
      ) : (
        <motion.div key={`vacant-${team.id}`} layout layoutId={`team-${team.id}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring} className="flex items-center gap-3 rounded-xl border-2 border-dashed border-orange-500/60 bg-orange-950/10 p-3 shadow-[inset_0_0_20px_rgba(249,115,22,0.1)] sm:rounded-2xl sm:p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-orange-500/50 bg-orange-500/5 sm:h-10 sm:w-10"><Sparkles className="h-4 w-4 animate-pulse text-orange-400 sm:h-5 sm:w-5" /></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 sm:text-sm">EUROLEAGUE PLACE #{expiredIndex + 1} — OPEN</span>
        </motion.div>
      );
    }
    const isUserTeam = team.id === userTeamId;
    return (
      <motion.div key={team.id} layout layoutId={`team-${team.id}`} className={`relative flex items-center justify-between overflow-hidden rounded-xl border p-3 sm:rounded-2xl sm:p-4 ${isUserTeam ? 'border-orange-500/40 bg-orange-950/10 shadow-[0_0_20px_rgba(249,115,22,0.1)]' : 'border-white/5 bg-white/[0.02]'}`}>
        {isUserTeam && <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent" />}
        <div className="relative z-10 flex min-w-0 items-center gap-3 sm:gap-4">{team.logoUrl && <img src={team.logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain drop-shadow-md sm:h-10 sm:w-10" />}<span className={`truncate text-sm font-bold sm:text-base ${isUserTeam ? 'text-orange-100' : 'text-white/80'}`}>{team.name}{isUserTeam && <span className="ml-1.5 rounded border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-orange-500 sm:text-xs">YOU</span>}</span></div>
        <motion.div style={{ opacity: statusPhase(team) }} className="relative z-10 ml-2 shrink-0">{statusBadge(team)}</motion.div>
      </motion.div>
    );
  }), [expiredTeams, listTeams, phase, step, userTeamId]);

  const resolveDecision = async (decision: 'accept' | 'decline') => {
    if (decisionPending) return;
    setDecisionPending(true);
    await (decision === 'accept' ? onAccept() : onDecline());
    setDecisionMade(true);
    setDecisionPending(false);
  };

  return (
    <LayoutGroup>
      <div className="relative flex w-full max-w-4xl flex-col items-center">
        <AnimatePresence>
          {(step === 1 || step === 2 || (step === 4 && phase >= 2)) && (
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }} transition={spring} className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d] p-4 shadow-2xl sm:p-6 lg:p-8">
              <div className="pointer-events-none absolute left-1/2 top-0 h-[100px] w-[120%] -translate-x-1/2 bg-orange-500/10 blur-[100px]" />
              <div className="relative z-10 mb-4 flex items-center justify-between gap-2 sm:mb-6"><h2 className="text-base font-black uppercase tracking-wide text-white sm:text-xl">{step === 4 ? 'Confirmed EuroLeague Clubs' : 'Season Participants'}</h2><span className="shrink-0 rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-[9px] font-bold text-orange-400 sm:px-3 sm:text-xs">Season {season}</span></div>
              <div className="relative z-10 flex flex-col gap-2 sm:gap-3">{participantList}<div ref={bottomRef} className="h-4" /></div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(step === 3 || (step === 4 && phase < 2)) && (
            <motion.div layout className="relative z-50 mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-orange-500/30 bg-[#0a0a0c] p-4 shadow-[0_0_50px_rgba(249,115,22,0.15)] sm:p-6 lg:p-8">
              <div className="pointer-events-none absolute left-1/2 top-0 h-[150px] w-full -translate-x-1/2 bg-gradient-to-b from-orange-500/10 to-transparent" />
              <div className="relative z-10 mb-6 flex items-center justify-between gap-3 border-b border-white/10 pb-4 sm:mb-8"><h2 className="flex items-center gap-3 bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-lg font-black tracking-wider text-transparent sm:text-2xl">{step === 4 ? <Mail className="h-6 w-6 text-orange-400" /> : <Award className="h-6 w-6 text-orange-400" />}{step === 4 ? 'FORMAL INVITATION' : 'CANDIDATE EVALUATION'}</h2><span className="rounded-full border border-orange-500/30 bg-orange-950/30 px-3 py-1.5 text-[10px] font-black text-orange-400">EUROLEAGUE</span></div>

              {step === 3 && visibleCandidates.length > 0 && (() => {
                const activeIndex = Math.min(visibleCandidates.length - 1, Math.max(0, Math.floor((Math.max(1, phase) - 1) / 2)));
                const active = visibleCandidates[activeIndex];
                return <div className="relative z-10 flex flex-1 flex-col gap-6 lg:flex-row lg:gap-8"><div className="flex min-h-[350px] flex-1 flex-col items-center justify-center rounded-2xl border border-white/5 bg-black/40 p-6 shadow-inner sm:p-8"><AnimatePresence mode="wait"><motion.div key={active.id} initial={{ opacity: 0, filter: 'blur(10px)', scale: 0.9 }} animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }} exit={{ opacity: 0, filter: 'blur(10px)', scale: 1.1 }} className="flex w-full flex-col items-center">{active.logoUrl && <img src={active.logoUrl} alt="" className="mb-4 h-20 w-20 object-contain drop-shadow-2xl sm:h-28 sm:w-28" />}<h3 className="text-center text-xl font-black tracking-wide text-white sm:text-2xl">{active.name}</h3>{renderCandidateScores(active, phase >= activeIndex * 2 + 1)}</motion.div></AnimatePresence></div><div className="flex w-full flex-col gap-3 lg:w-[35%]"><h4 className="mb-1 border-b border-white/5 pb-2 text-[10px] font-black uppercase tracking-widest text-white/40 sm:text-xs">Reviewed</h4>{visibleCandidates.map((candidate, index) => phase >= index * 2 + 2 && <motion.div key={candidate.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} layout className={`relative flex items-center justify-between rounded-xl border p-3 sm:rounded-2xl sm:p-4 ${candidate.isSelected ? 'border-orange-500/50 bg-gradient-to-r from-orange-900/30 to-amber-900/10 shadow-[0_0_20px_rgba(249,115,22,0.15)]' : 'border-white/5 bg-white/[0.02]'}`}>{candidate.isSelected && <Star className="absolute -right-2 -top-2 h-5 w-5 fill-orange-400 text-orange-400" />}<div className="flex min-w-0 items-center gap-3"><span className={`text-xs font-black sm:text-sm ${candidate.isSelected ? 'text-orange-400' : 'text-white/30'}`}>#{index + 1}</span>{candidate.logoUrl && <img src={candidate.logoUrl} alt="" className="h-6 w-6 shrink-0 object-contain sm:h-8 sm:w-8" />}<span className="truncate text-xs font-bold text-white sm:text-sm">{candidate.name}</span></div><span className="font-black text-orange-400">{candidate.totalScore}</span></motion.div>)}</div></div>;
              })()}
              {step === 3 && visibleCandidates.length === 0 && <div className="relative z-10 rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-sm font-semibold text-slate-400">All current agreements remain in force. No open place requires a club review.</div>}

              {step === 4 && phase < 2 && selectedCandidate && <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-5 text-center sm:p-12"><motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-orange-500/50 bg-gradient-to-br from-orange-500/20 to-orange-900/20 shadow-[0_0_40px_rgba(249,115,22,0.3)] sm:h-28 sm:w-28"><div className="absolute inset-0 animate-ping rounded-full border border-orange-400/30" /><Mail className="h-8 w-8 text-orange-400 sm:h-12 sm:w-12" /></motion.div><h2 className="mb-4 text-2xl font-black tracking-wide text-white sm:text-4xl">{invitationTeamId != null ? 'EuroLeague Invitation' : 'Invitation Issued'}</h2>{selectedCandidate.logoUrl && <img src={selectedCandidate.logoUrl} alt="" className="mb-3 h-16 w-16 object-contain sm:h-20 sm:w-20" />}<p className="max-w-lg text-sm font-medium leading-relaxed text-white/70 sm:text-lg"><span className="font-black text-orange-300">{selectedCandidate.name}</span> has been selected for the available EuroLeague place.</p>{invitationTeamId != null && <div className="mt-4 space-y-1 text-xs font-bold text-slate-300 sm:text-sm"><div>{invitationAgreement}</div><div>{invitationValidThrough}</div></div>}{invitationTeamId != null && <div className="mt-8 flex w-full max-w-sm flex-col-reverse gap-3 sm:flex-row"><button disabled={decisionPending} onClick={() => void resolveDecision('decline')} className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-50">Decline</button><button disabled={decisionPending} onClick={() => void resolveDecision('accept')} className="min-h-11 flex-1 rounded-xl border border-orange-500 bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-2.5 font-bold text-white shadow-[0_0_20px_rgba(249,115,22,0.4)] disabled:opacity-50">Accept</button></div>}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
};
