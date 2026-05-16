import React from 'react';
import { motion } from 'motion/react';
import { Trophy, Play } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';

const CONFERENCE_LABELS: Record<string, string> = {
  philippine: 'Philippine Cup',
  commissioners: "Commissioner's Cup",
  governors: "Governors' Cup",
};

interface Props {
  onStart: () => void;
  onSkip: () => void;
}

export const PBAOpeningCeremonyView: React.FC<Props> = ({ onStart, onSkip }) => {
  const { state } = useGame();
  const ls = state.leagueStats as any;
  const conf = ls?.pbaConference ?? 'philippine';
  const season = ls?.year ?? new Date().getFullYear();
  const label = CONFERENCE_LABELS[conf] ?? 'Conference';
  const spec = PBA_COMPETITIONS[conf === 'philippine' ? 0 : conf === 'commissioners' ? 1 : 2];

  const pbaTeams = ((state as any).nonNBATeams ?? []).filter((t: any) => t.tid >= 2000 && t.tid < 2100);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-slate-950 to-slate-950 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-3xl text-center space-y-8"
      >
        <div>
          <div className="text-5xl mb-4">🏀</div>
          <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">
            {label}
          </h1>
          <p className="text-sm text-slate-400 mt-2">Season {season} Opening Ceremony</p>
        </div>

        {/* Team Parade Grid */}
        <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
          {pbaTeams.map((t: any) => (
            <div key={t.tid} className="flex flex-col items-center gap-1 p-2 bg-slate-900/40 rounded-xl border border-slate-800/30">
              {t.imgURL && <img src={t.imgURL} alt="" className="w-8 h-8 object-contain" />}
              <span className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-full">
                {t.abbrev ?? t.name?.split(' ').pop()}
              </span>
            </div>
          ))}
        </div>

        {/* Conference Info */}
        <div className="inline-flex items-center gap-3 px-5 py-3 bg-slate-900/60 border border-slate-800/50 rounded-2xl">
          <Trophy className="w-5 h-5 text-amber-400" />
          <div className="text-left">
            <p className="text-xs font-bold text-white">{spec.gamesPerTeam} Games • {spec.teamCount} Teams</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
              {spec.importRule === 'none'
                ? 'All-Filipino Conference'
                : spec.importRule === 'one_no_height_limit'
                  ? '1 Import — No Height Limit'
                  : "1 Import — Max 6'5\""}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onSkip}
            className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-white transition-colors"
          >
            Skip Ceremony
          </button>
          <button
            onClick={onStart}
            className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Play className="w-4 h-4" />
            Start {label}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
