import React from 'react';
import { NBAPlayer } from '../../../types';
import { MessageSquare, HandCoins, Gavel, Utensils, Film, X, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getPlayerImage } from './bioCache';

interface PlayerActionsModalProps {
  player: NBAPlayer;
  onClose: () => void;
  onActionSelect: (actionType: 'view_bio' | 'contact' | 'bribe' | 'fine' | 'dinner' | 'movie' | 'suspension' | 'sabotage') => void;
}

export const PlayerActionsModal: React.FC<PlayerActionsModalProps> = ({ player, onClose, onActionSelect }) => {
  const isActiveNBAPlayer = player.tid >= 0;

  const allActions = [
    { id: 'view_bio', name: 'View Bio', icon: Eye, color: 'bg-blue-500', hover: 'hover:bg-blue-600', description: 'View detailed scouting report and bio.', requiresActive: false },
    { id: 'contact', name: 'Direct Message', icon: MessageSquare, color: 'bg-indigo-500', hover: 'hover:bg-indigo-600', description: 'Send a private message to this player.', requiresActive: false },
    { id: 'bribe', name: 'Bribe', icon: HandCoins, color: 'bg-emerald-500', hover: 'hover:bg-emerald-600', description: 'Offer money for favorable actions.', requiresActive: false },
    { id: 'fine', name: 'Fine', icon: Gavel, color: 'bg-rose-500', hover: 'hover:bg-rose-600', description: 'Issue a financial penalty.', requiresActive: true },
    { id: 'dinner', name: 'Invite to Dinner', icon: Utensils, color: 'bg-amber-500', hover: 'hover:bg-amber-600', description: 'Discuss matters over a private meal.', requiresActive: false },
    { id: 'movie', name: 'Invite to Movie', icon: Film, color: 'bg-sky-500', hover: 'hover:bg-sky-600', description: 'Casual bonding over a film.', requiresActive: false },
    { id: 'suspension', name: 'Suspend', icon: Gavel, color: 'bg-red-600', hover: 'hover:bg-red-700', description: 'Suspend player from upcoming games.', requiresActive: true },
    { id: 'sabotage', name: 'Sabotage', icon: Eye, color: 'bg-rose-600', hover: 'hover:bg-rose-700', description: 'Covertly injure this player.', requiresActive: true }
  ] as const;

  const actions = allActions.filter(action => !action.requiresActive || isActiveNBAPlayer);

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
          className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                {getPlayerImage(player) ? (
                  <img src={getPlayerImage(player)} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold">
                    {player.name.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight text-white leading-none">{player.name}</h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Select Action</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {actions.map(action => (
              <button
                key={action.id}
                onClick={() => onActionSelect(action.id as any)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 transition-all text-left group"
              >
                <div className={`p-3 rounded-xl text-white ${action.color} ${action.hover} transition-colors`}>
                  <action.icon size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">{action.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
