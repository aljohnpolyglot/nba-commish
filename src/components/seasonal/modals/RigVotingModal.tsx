import React, { useState, useMemo } from 'react';
import { Star } from 'lucide-react';
import { motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';

interface RigVotingModalProps {
  onClose: () => void;
  onConfirm: (playerId: string, playerName: string, ghostVotes: number) => void;
}

export const RigVotingModal: React.FC<RigVotingModalProps> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const votes = state.allStar?.votes ?? [];
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [ghostVotes, setGhostVotes] = useState(500000);

  const sorted = useMemo(() =>
    [...votes]
      .sort((a, b) => b.votes - a.votes)
      .filter(v => !search || v.playerName.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 20),
    [votes, search]
  );

  const selectedPlayer = votes.find(v => v.playerId === selected);
  const previewTotal = selectedPlayer ? (selectedPlayer.votes + ghostVotes).toLocaleString() : '—';

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="bg-slate-900 border border-slate-800 rounded-[2rem] max-w-lg w-full shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400">
              <Star size={22} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-widest">Rig All-Star Voting</h3>
              <p className="text-slate-400 text-xs">Inject ghost votes — one-time use</p>
            </div>
          </div>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search player..."
            className="w-full mt-4 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="overflow-y-auto custom-scrollbar px-8 pb-4 space-y-1 flex-1">
          {sorted.map((v, i) => (
            <button
              key={v.playerId}
              onClick={() => setSelected(v.playerId)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all text-sm ${
                selected === v.playerId
                  ? 'bg-violet-600 text-white'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-slate-500 w-4">{i + 1}</span>
                <span className="font-bold">{v.playerName}</span>
                <span className="text-[10px] text-slate-500">{v.conference} · {v.category}</span>
              </div>
              <span className="text-[10px] font-mono">{(v.votes / 1000000).toFixed(2)}M</span>
            </button>
          ))}
          {sorted.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">No votes recorded yet</p>
          )}
        </div>

        <div className="p-8 pt-4 border-t border-slate-800 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Ghost Votes</span>
              <span className="text-sm font-black text-violet-400">{(ghostVotes / 1000000).toFixed(2)}M</span>
            </div>
            <input
              type="range"
              min={100000} max={5000000} step={100000}
              value={ghostVotes}
              onChange={e => setGhostVotes(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-1">
              <span>100K</span>
              <span>5M</span>
            </div>
          </div>
          {selectedPlayer && (
            <div className="text-xs text-slate-400 bg-slate-950 rounded-xl px-4 py-2.5 border border-slate-800">
              <span className="font-bold text-white">{selectedPlayer.playerName}</span>
              {' '}{selectedPlayer.votes.toLocaleString()} → <span className="text-violet-400 font-bold">{previewTotal}</span>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-bold uppercase tracking-wider text-xs">Cancel</button>
            <button
              disabled={!selected}
              onClick={() => selected && selectedPlayer && onConfirm(selected, selectedPlayer.playerName, ghostVotes)}
              className="px-6 py-3 rounded-xl bg-violet-600 text-white hover:bg-violet-500 font-bold uppercase tracking-wider text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Inject Votes
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
