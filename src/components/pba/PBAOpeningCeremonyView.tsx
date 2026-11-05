import { useEffect, useRef, useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';
import type { GameState } from '../../types';
import { buildPbaOpeningCeremonyTeams } from '../../services/pba/openingCeremony';
import { ArenaStage } from './openingCeremony/components/ArenaStage';
import { Navbar } from './openingCeremony/components/Navbar';
import type { ArenaLighting, PBATeam } from './openingCeremony/types';

const LIGHTING_MODES: ArenaLighting[] = ['stadium', 'spotlight', 'fiesta', 'gold', 'neon'];

type Props = {
  open: boolean;
  state: GameState;
  onExit: () => void;
  onSkip: () => void;
};

export const PBAOpeningCeremonyView: React.FC<Props> = ({ open, state, onExit, onSkip }) => {
  const [teams, setTeams] = useState<PBATeam[]>([]);
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const closeHandled = useRef(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    closeHandled.current = false;
    setLoading(true);
    setTeams([]);
    setCurrentTeamIndex(0);
    setIsPlaying(true);
    void buildPbaOpeningCeremonyTeams(state).then(result => {
      if (!active) return;
      setTeams(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || closeHandled.current) return;
      closeHandled.current = true;
      onExit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onExit]);

  if (!open) return null;
  const finish = (action: () => void) => {
    if (closeHandled.current) return;
    closeHandled.current = true;
    action();
  };
  const season = Number(state.leagueStats?.year ?? new Date().getFullYear());
  const lighting = LIGHTING_MODES[currentTeamIndex % LIGHTING_MODES.length];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`PBA ${season} Opening Ceremony`}
      className="fixed inset-0 z-[220] overflow-y-auto bg-slate-950 font-sans text-slate-100 antialiased selection:bg-amber-500 selection:text-slate-950"
    >
      <Navbar
        title={`PBA ${season} Opening Ceremony`}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onSkip={() => finish(onSkip)}
        onExit={() => finish(onExit)}
      />
      <main className="mx-auto w-full max-w-7xl space-y-8 px-2 py-3 sm:px-4 sm:py-6">
        {loading ? (
          <div className="flex min-h-[70vh] flex-col items-center justify-center rounded-3xl border border-slate-800 bg-slate-950">
            <Loader2 className="mb-5 h-10 w-10 animate-spin text-amber-400" />
            <h2 className="text-xl font-black uppercase tracking-tight text-white">Preparing Ceremony</h2>
            <p className="mt-2 px-4 text-center text-sm text-slate-400">The teams are lining up for their introductions.</p>
          </div>
        ) : teams.length > 0 ? (
          <ArenaStage
            teams={teams}
            currentTeamIndex={currentTeamIndex}
            setCurrentTeamIndex={setCurrentTeamIndex}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            arenaLighting={lighting}
            soundEnabled={soundEnabled}
            onToggleSound={() => setSoundEnabled(enabled => !enabled)}
          />
        ) : (
          <div className="flex min-h-[70vh] flex-col items-center justify-center rounded-3xl border border-slate-800 bg-slate-950 px-5 text-center">
            <Trophy className="mb-5 h-12 w-12 text-amber-400" />
            <h2 className="text-xl font-black uppercase tracking-tight text-white">Opening Ceremony</h2>
            <p className="mt-2 max-w-md text-sm text-slate-400">The team parade is unavailable, but you can safely continue to the new season.</p>
          </div>
        )}
      </main>
    </div>
  );
};
