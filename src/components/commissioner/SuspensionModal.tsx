import React, { useState } from 'react';
import type { NBAPlayer as Player, SuspensionParams } from '../../types';
import { Loader2 } from 'lucide-react';
import { convertTo2KRating } from '../../utils/helpers';

interface SuspensionModalProps {
  player: Player | null;
  onClose: () => void;
  onConfirm: (details: Omit<SuspensionParams, 'player'>) => void;
  isLoading: boolean;
}

const SuspensionModal: React.FC<SuspensionModalProps> = ({ player, onClose, onConfirm, isLoading }) => {
  const [games, setGames] = useState<number>(5);
  const [reason, setReason] = useState('');
  const [isFraming, setIsFraming] = useState(false);

  if (!player) return null;

  const handleConfirm = () => {
    if (reason.trim() && games > 0) {
      onConfirm({ reason, games, isFraming });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 transition-opacity" onClick={onClose}>
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl transform transition-all" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-700">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-sm text-red-400 font-semibold">PLAYER DISCIPLINE</p>
              <h2 className="text-2xl font-bold mt-1 text-white">Suspend {player.name}</h2>
              <p className="text-sm text-slate-400 mt-1">{player.pos} | {convertTo2KRating(player.overallRating)} 2K OVR</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white ml-4 text-2xl leading-none">&times;</button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="animate-spin text-indigo-500" size={48} />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="suspension-games" className="block text-sm font-medium text-slate-300">Games</label>
                <input
                  type="number"
                  id="suspension-games"
                  value={games}
                  onChange={(e) => setGames(Math.max(1, parseInt(e.target.value, 10)))}
                  className="w-full mt-1 p-2 bg-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                  min="1"
                />
              </div>
              <div>
                <label htmlFor="suspension-reason" className="block text-sm font-medium text-slate-300">Reason</label>
                <textarea
                  id="suspension-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Conduct detrimental to the league."
                  className="w-full mt-1 p-2 bg-slate-700 rounded-lg text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                  rows={3}
                />
              </div>
              <div
                onClick={() => setIsFraming(!isFraming)}
                className="flex items-start p-3 rounded-md bg-slate-900/50 hover:bg-slate-700/50 cursor-pointer transition-colors"
              >
                 <div className="flex h-5 items-center">
                    <input
                        id="frame-player"
                        name="frame-player"
                        type="checkbox"
                        checked={isFraming}
                        onChange={(e) => setIsFraming(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="frame-player" className="font-bold text-purple-400">Frame Player</label>
                  <p className="text-slate-400 text-xs">Use your power to ensure the accusation sticks. Costs significant Legacy. Irreversible.</p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 bg-slate-800/50 border-t border-slate-700">
          <button
            onClick={handleConfirm}
            disabled={isLoading || !reason.trim() || games <= 0}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : `Confirm Suspension`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuspensionModal;
