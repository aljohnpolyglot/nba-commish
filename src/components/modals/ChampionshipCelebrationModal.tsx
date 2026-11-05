import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Trophy, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import {
  collectChampionshipCelebrations,
  type ChampionshipCelebration,
} from '../../services/championshipCelebration';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';

const CONFETTI_COLORS = ['#facc15', '#f97316', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6'];

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 72 }, (_, index) => ({
    id: index,
    left: `${(index * 37) % 100}%`,
    delay: `${(index % 18) * 0.08}s`,
    duration: `${2.5 + (index % 7) * 0.18}s`,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    rotate: `${(index * 47) % 360}deg`,
  })), []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[141] overflow-hidden" aria-hidden="true">
      <style>{`@keyframes championship-confetti{0%{transform:translateY(-8vh) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(760deg);opacity:0}}`}</style>
      {pieces.map(piece => (
        <span
          key={piece.id}
          className="absolute -top-8 h-5 w-2.5 rounded-sm"
          style={{
            left: piece.left,
            backgroundColor: piece.color,
            animation: `championship-confetti ${piece.duration} linear ${piece.delay} forwards`,
            rotate: piece.rotate,
          }}
        />
      ))}
    </div>
  );
}

function CelebrationCard({ celebration, onClose }: { celebration: ChampionshipCelebration; onClose: () => void }) {
  const { state } = useGame();
  const champion = resolveAnyTeam(celebration.championTid, state.teams, state.nonNBATeams ?? []);
  const runnerUp = celebration.runnerUpTid == null
    ? null
    : resolveAnyTeam(celebration.runnerUpTid, state.teams, state.nonNBATeams ?? []);
  const championName = champion ? getTeamFullName(champion as any) : `Team ${celebration.championTid}`;
  const runnerUpName = runnerUp ? getTeamFullName(runnerUp as any) : null;
  const logoUrl = champion
    ? state.leagueType === 'fictional'
      ? String((champion as any).logoUrl ?? '')
      : getResolvedTeamLogoUrl(champion, celebration.season)
    : '';

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" />
      <Confetti />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${championName} champions`}
        className="relative z-[142] w-full max-w-xl overflow-hidden rounded-3xl border border-amber-300/40 bg-gradient-to-b from-amber-400/20 via-slate-950 to-slate-950 p-6 text-center shadow-2xl md:p-10"
      >
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close championship celebration">
          <X size={20} />
        </button>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/50 bg-amber-400/20 text-amber-300">
          <Trophy size={30} />
        </div>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">{celebration.season} {celebration.competitionName}</p>
        {logoUrl && <img src={logoUrl} alt="" className="mx-auto my-5 h-24 w-24 object-contain drop-shadow-2xl" />}
        <h2 className="text-3xl font-black uppercase tracking-tight text-white md:text-5xl">{championName}</h2>
        <p className="mt-2 text-lg font-bold uppercase tracking-widest text-amber-300">Champions</p>
        {runnerUpName && <p className="mt-4 text-sm text-slate-400">Defeated {runnerUpName} in the final.</p>}
        {celebration.finalsMvp && <p className="mt-2 text-sm font-bold text-slate-200">Finals MVP · {celebration.finalsMvp}</p>}
        <button onClick={onClose} className="mx-auto mt-8 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300">
          Continue <ArrowRight size={17} />
        </button>
      </section>
    </div>
  );
}

export function ChampionshipCelebrationHost() {
  const { state } = useGame();
  const celebrations = useMemo(() => collectChampionshipCelebrations(state), [
    state.activeCompetitions,
    state.competitionHistory,
    state.leagueStats,
    state.playoffs,
    state.seasonHistory,
  ]);
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<ChampionshipCelebration[]>([]);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(celebrations.map(entry => entry.key));
      return;
    }
    const fresh = celebrations.filter(entry => !seen.current!.has(entry.key));
    if (fresh.length === 0) return;
    fresh.forEach(entry => seen.current!.add(entry.key));
    setQueue(current => [...current, ...fresh]);
  }, [celebrations]);

  const current = queue[0];
  return current
    ? <CelebrationCard celebration={current} onClose={() => setQueue(entries => entries.slice(1))} />
    : null;
}
