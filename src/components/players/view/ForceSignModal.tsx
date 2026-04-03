import React, { useState, useMemo } from 'react';
import { X, Search, CheckCircle2, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NBAPlayer, NBATeam } from '../../../types';
import { convertTo2KRating } from '../../../utils/helpers';
import { getPlayerImage } from '../../central/view/bioCache';

interface ForceSignModalProps {
  player: NBAPlayer;
  teams: NBATeam[];
  onClose: () => void;
  onConfirm: (payload: { playerId: string; teamId: number; playerName: string; teamName: string }) => void;
}

export const ForceSignModal: React.FC<ForceSignModalProps> = ({ player, teams, onClose, onConfirm }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<NBATeam | null>(null);

  const currentYear = new Date().getFullYear();
  const age = player.born?.year ? currentYear - player.born.year : player.age || 0;
  const ovr = convertTo2KRating(player.overallRating, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp);

  const filteredTeams = useMemo(() => {
    return teams
      .filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.abbrev.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, searchTerm]);

  const handleConfirm = () => {
    if (selectedTeam) {
      onConfirm({
        playerId: player.internalId,
        teamId: selectedTeam.id,
        playerName: player.name,
        teamName: selectedTeam.name
      });
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-[95vw] max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-800 bg-slate-900/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-rose-400">
                <Shield size={24} />
                <h3 className="text-xl font-black uppercase tracking-tight text-white">
                  Force Signing
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Player Summary */}
            <div className="mt-4 flex items-center gap-4 p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
              <img
                src={getPlayerImage(player)}
                alt={player.name}
                className="w-16 h-16 rounded-xl object-cover bg-slate-800 border-2 border-slate-700"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1">
                <h4 className="text-lg font-bold text-white">{player.name}</h4>
                <div className="flex items-center gap-3 mt-1 text-sm">
                  <span className="text-slate-400">{player.pos}</span>
                  <span className="text-slate-700">•</span>
                  <span className="text-slate-400">OVR: {ovr}</span>
                  <span className="text-slate-700">•</span>
                  <span className="text-slate-400">{age} years old</span>
                  {player.status && !['Active', 'Free Agent'].includes(player.status) && (
                    <>
                      <span className="text-slate-700">•</span>
                      <span className="text-indigo-400 font-bold text-xs uppercase tracking-tight">{player.status}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Team Selection */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search teams..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 outline-none placeholder:text-slate-700 transition-all"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredTeams.map(team => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeam(team)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                    selectedTeam?.id === team.id
                      ? 'bg-rose-600/20 border-rose-500/50 shadow-lg shadow-rose-500/10'
                      : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="w-10 h-10 bg-slate-950 rounded-lg flex items-center justify-center p-1">
                    <img
                      src={team.logoUrl}
                      alt={team.abbrev}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate text-white">{team.name}</div>
                    <div className="text-xs text-slate-500">
                      {team.wins}-{team.losses} • {team.conference}ern
                    </div>
                  </div>
                  {selectedTeam?.id === team.id && (
                    <CheckCircle2 size={16} className="text-rose-400" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex flex-col md:flex-row justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-3 md:py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-white hover:bg-slate-800 transition-colors uppercase tracking-wider w-full md:w-auto text-center"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedTeam}
              className="px-6 py-3 md:py-2 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider flex items-center justify-center gap-2 w-full md:w-auto shadow-lg shadow-rose-500/20"
            >
              <Shield size={14} />
              Execute Signing
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};