import React from 'react';
import { NBAPlayer } from '../../../types';
import { X, HeartPulse, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getPlayerImage } from './bioCache';
import { PERSON_ACTION_DEFS, isPlayerEligible } from '../../../data/personActionDefs';
import { useGame } from '../../../store/GameContext';
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';

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
  'resign_player',
  'sign_guaranteed',
  'contact',
  'bribe',
  'fine',
  'dinner',
  'movie',
  'suspension',
  'waive',
  'sabotage',
];

// Actions hidden in GM mode — commissioner-only powers
const GM_HIDDEN_ACTIONS = new Set(['fine', 'bribe', 'dinner', 'movie', 'suspension', 'sabotage', 'contact']);

export const PlayerActionsModal: React.FC<PlayerActionsModalProps> = ({ player, onClose, onActionSelect, onHeal }) => {
  const { state } = useGame();
  const isGM = state.gameMode === 'gm';
  const isInjured = (player as any)?.injury?.gamesRemaining > 0;
  const currentYear = state.leagueStats?.year ?? new Date().getUTCFullYear();
  const userTeamId = isGM ? state.userTeamId ?? null : null;
  const actions = MODAL_ACTION_IDS
    .map(id => PERSON_ACTION_DEFS.find(def => def.id === id))
    .filter((def): def is NonNullable<typeof def> => !!def)
    .filter(def => isPlayerEligible(player, def.eligibility, { currentYear, userTeamId }))
    .filter(def => !isGM || !GM_HIDDEN_ACTIONS.has(def.id));

  const faMarket = state.faBidding?.markets?.find(
    m => m.playerId === player.internalId && !m.resolved
  );
  const activeBidCount = faMarket?.bids?.filter(b => b.status === 'active').length ?? 0;
  const hasOffers = activeBidCount > 0;

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
              <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-700 relative">
                {(() => {
                  const img = getPlayerImage(player);
                  const face = (player as any).face;
                  if (img) return <img src={img} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />;
                  if (isRealFaceConfig(face)) return <div className="absolute left-1/2 top-1/2" style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}><MyFace face={face} style={{ width: '100%', height: '100%' }} /></div>;
                  return <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold">{player.name.charAt(0)}</div>;
                })()}
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
            {isInjured && onHeal && !isGM && (
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
            {hasOffers && (
              <button
                onClick={() => onActionSelect('view_fa_offers')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-all text-left group"
              >
                <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-300 uppercase tracking-wider">View Offers</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{activeBidCount} competing bid{activeBidCount > 1 ? 's' : ''} on the market</p>
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
