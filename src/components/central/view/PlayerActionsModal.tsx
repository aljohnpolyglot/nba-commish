import React from 'react';
import { NBAPlayer } from '../../../types';
import { X, HeartPulse } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getPlayerImage } from './bioCache';
import { PERSON_ACTION_DEFS, isPlayerEligible } from '../../../data/personActionDefs';

interface PlayerActionsModalProps {
  player: NBAPlayer;
  onClose: () => void;
  onActionSelect: (actionType: string) => void;
  onHeal?: () => void;
}

// The ordered list of actions shown in this modal (player-focused quick-actions).
const MODAL_ACTION_IDS = [
  'view_bio',
  'view_ratings',
  'sign_player',
  'contact',
  'bribe',
  'fine',
  'dinner',
  'movie',
  'suspension',
  'waive',
  'sabotage',
];

export const PlayerActionsModal: React.FC<PlayerActionsModalProps> = ({ player, onClose, onActionSelect, onHeal }) => {
  const isInjured = (player as any)?.injury?.gamesRemaining > 0;
  const actions = MODAL_ACTION_IDS
    .map(id => PERSON_ACTION_DEFS.find(def => def.id === id))
    .filter((def): def is NonNullable<typeof def> => !!def)
    .filter(def => isPlayerEligible(player, def.eligibility));

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
            {isInjured && onHeal && (
              <button
                onClick={onHeal}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-emerald-700/50 bg-emerald-950/30 hover:bg-emerald-900/40 transition-all text-left group"
              >
                <div className="p-3 rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 transition-colors">
                  <HeartPulse size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Heal Player</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Clear this player's injury immediately</p>
                </div>
              </button>
            )}
            {actions.map(action => (
              <button
                key={action.id}
                onClick={() => onActionSelect(action.id)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 transition-all text-left group"
              >
                <div className={`p-3 rounded-xl text-white ${action.color} ${action.hover} transition-colors`}>
                  <action.icon size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">{action.title}</h4>
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
