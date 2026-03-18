import React, { useState } from 'react';
import { X, Plus, Trash2, Trophy } from 'lucide-react';
import { NBATeam } from '../../types';

interface ChristmasGamesModalProps {
  teams: NBATeam[];
  onClose: () => void;
  onConfirm: (games: { homeTid: number; awayTid: number }[]) => void;
  initialGames?: { homeTid: number; awayTid: number }[];
}

export const ChristmasGamesModal: React.FC<ChristmasGamesModalProps> = ({ teams, onClose, onConfirm, initialGames = [] }) => {
  const [games, setGames] = useState<{ homeTid: number; awayTid: number }[]>(
    initialGames.length > 0 ? initialGames : [{ homeTid: -1, awayTid: -1 }]
  );

  const usedTeamIds = new Set<number>();
  games.forEach(g => {
    if (g.homeTid !== -1) usedTeamIds.add(g.homeTid);
    if (g.awayTid !== -1) usedTeamIds.add(g.awayTid);
  });

  const addGame = () => {
    if (games.length < 5) {
      setGames([...games, { homeTid: -1, awayTid: -1 }]);
    }
  };

  const removeGame = (index: number) => {
    const newGames = [...games];
    newGames.splice(index, 1);
    setGames(newGames.length > 0 ? newGames : [{ homeTid: -1, awayTid: -1 }]);
  };

  const updateGame = (index: number, field: 'homeTid' | 'awayTid', value: number) => {
    const newGames = [...games];
    newGames[index][field] = value;
    setGames(newGames);
  };

  const isValid = games.length > 0 && games.every(g => g.homeTid !== -1 && g.awayTid !== -1 && g.homeTid !== g.awayTid);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 md:p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
              <Trophy className="text-rose-500" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">Christmas Day Showcase</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Schedule the Marquee Matchups</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-4">
            <p className="text-sm text-slate-400 leading-relaxed italic">
              "Commissioner, Christmas Day is our biggest stage. The world is watching. Hand-pick the five matchups that will define the holiday and drive our ratings to record highs."
            </p>
          </div>

          <div className="space-y-4">
            {games.map((game, index) => (
              <div key={index} className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 group animate-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${index * 50}ms` }}>
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Away Team</label>
                    <select
                      value={game.awayTid}
                      onChange={(e) => updateGame(index, 'awayTid', parseInt(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all"
                    >
                      <option value="-1">Select Team</option>
                      {teams.map(t => (
                        <option 
                          key={t.id} 
                          value={t.id} 
                          disabled={usedTeamIds.has(t.id) && game.awayTid !== t.id}
                        >
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Home Team</label>
                    <select
                      value={game.homeTid}
                      onChange={(e) => updateGame(index, 'homeTid', parseInt(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all"
                    >
                      <option value="-1">Select Team</option>
                      {teams.map(t => (
                        <option 
                          key={t.id} 
                          value={t.id} 
                          disabled={usedTeamIds.has(t.id) && game.homeTid !== t.id}
                        >
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => removeGame(index)}
                  className="p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all mt-5"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>

          {games.length < 5 && (
            <button
              onClick={addGame}
              className="w-full py-4 border-2 border-dashed border-slate-800 rounded-2xl text-slate-500 hover:text-white hover:border-slate-600 hover:bg-slate-800/30 transition-all flex items-center justify-center gap-2 group"
            >
              <Plus size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-xs font-black uppercase tracking-widest">Add Matchup ({games.length}/5)</span>
            </button>
          )}
        </div>

        <div className="p-6 md:p-8 border-t border-slate-800 bg-slate-900/50 flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl border border-slate-700 text-slate-300 font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(games)}
            disabled={!isValid}
            className={`flex-[2] py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg ${isValid ? 'bg-rose-600 text-white hover:bg-rose-500 shadow-rose-500/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
          >
            Lock In Schedule
          </button>
        </div>
      </div>
    </div>
  );
};
