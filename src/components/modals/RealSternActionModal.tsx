import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Gift, UserPlus, DollarSign, Trash2, MapPin, Building, AlertTriangle } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { OwnedAsset } from '../central/view/realsternTypes';
import { PersonSelectorModal } from './PersonSelectorModal';
import { Contact } from '../../types';

const IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800';

interface RealSternActionModalProps {
  asset: OwnedAsset;
  onClose: () => void;
  onSell: (instanceId: string) => void;
  onAbandon: (instanceId: string) => void;
  onGiftComplete: () => void;
  onInviteComplete: () => void;
}

type InnerView = 'menu' | 'gift_select' | 'invite_select' | 'abandon_confirm';

export const RealSternActionModal: React.FC<RealSternActionModalProps> = ({
  asset, onClose, onSell, onAbandon, onGiftComplete, onInviteComplete
}) => {
  const { dispatchAction } = useGame();
  const [innerView, setInnerView] = useState<InnerView>('menu');
  const [isProcessing, setIsProcessing] = useState(false);
  const [inviteReason, setInviteReason] = useState('');

  const sellPrice = Math.floor(asset.price * 0.8);
  const daysOwned = Math.floor((Date.now() - new Date(asset.purchasedAt).getTime()) / (1000 * 60 * 60 * 24));

  const handleGiftPersonSelected = async (contacts: Contact[]) => {
    if (!contacts.length) return;
    const recipientName = contacts.map(c => c.name).join(', ');
    setIsProcessing(true);
    onClose();
    onGiftComplete();
    await dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: `Commissioner gifted "${asset.title}" (valued at $${asset.price.toLocaleString()}) to ${recipientName}.`,
        isSpecificEvent: true,
      },
    } as any);
    setIsProcessing(false);
  };

  const handleInvitePersonSelected = async (contacts: Contact[]) => {
    if (!contacts.length) return;
    const guestName = contacts.map(c => c.name).join(', ');
    const reasonNote = inviteReason.trim() ? ` — ${inviteReason.trim()}` : ' for an exclusive private meeting';
    setIsProcessing(true);
    onClose();
    onInviteComplete();
    await dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: `Commissioner hosted ${guestName} at ${asset.title}${reasonNote}.`,
        isSpecificEvent: true,
      },
    } as any);
    setIsProcessing(false);
  };

  if (innerView === 'gift_select') {
    return (
      <PersonSelectorModal
        title="Gift Property"
        actionType="general"
        onClose={() => setInnerView('menu')}
        onSelect={handleGiftPersonSelected}
      />
    );
  }

  if (innerView === 'invite_select') {
    return (
      <PersonSelectorModal
        title="Invite to Property"
        actionType="general"
        onClose={() => setInnerView('menu')}
        onSelect={handleInvitePersonSelected}
      />
    );
  }

  return (
    <AnimatePresence>
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100]"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-40%' }}
          animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
          exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-40%' }}
          className="fixed top-1/2 left-1/2 bg-white rounded-3xl overflow-hidden w-[95%] max-w-md z-[101] shadow-2xl flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Asset Header */}
          <div className="relative h-36 sm:h-44 overflow-hidden">
            <img
              src={asset.image || IMAGE_FALLBACK}
              alt={asset.title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-white/40 transition-all"
            >
              <X size={16} />
            </button>
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h2 className="font-black text-white text-base leading-tight line-clamp-1">{asset.title}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-white/70 flex items-center gap-1 uppercase tracking-wider">
                  <MapPin size={9} /> {asset.location}
                </span>
                <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">
                  Owned {daysOwned}d
                </span>
              </div>
            </div>
          </div>

          {/* Price info */}
          <div className="px-5 pt-4 pb-2 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 uppercase tracking-wider">
              <Building size={12} />
              Acquired at
            </div>
            <span className="font-black text-gray-900 text-sm">${asset.price.toLocaleString()}</span>
          </div>

          {/* Actions */}
          <div className="p-5 space-y-2.5">
            {innerView === 'menu' && (
              <>
                {/* Invite */}
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={inviteReason}
                    onChange={e => setInviteReason(e.target.value)}
                    placeholder="Reason for invite (optional)"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400 transition-colors"
                  />
                  <button
                    onClick={() => setInnerView('invite_select')}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 font-black text-sm"
                  >
                    <UserPlus size={16} /> Invite Guest
                  </button>
                </div>

                {/* Gift */}
                <button
                  onClick={() => setInnerView('gift_select')}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white p-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 font-black text-sm"
                >
                  <Gift size={16} /> Gift Property
                </button>

                {/* Sell */}
                <button
                  onClick={() => { onSell(asset.instanceId); onClose(); }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-3.5 rounded-2xl transition-all flex flex-col items-center justify-center gap-0.5 font-black text-sm"
                >
                  <div className="flex items-center gap-2">
                    <DollarSign size={16} /> Sell (80% value)
                  </div>
                  <span className="text-emerald-200 text-xs font-bold">+${sellPrice.toLocaleString()}</span>
                </button>

                {/* Abandon */}
                <button
                  onClick={() => setInnerView('abandon_confirm')}
                  className="w-full bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 p-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 font-black text-sm"
                >
                  <Trash2 size={16} /> Abandon Property
                </button>
              </>
            )}

            {innerView === 'abandon_confirm' && (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-red-700 text-sm mb-1">Abandon Property?</p>
                    <p className="text-xs text-red-500">This is permanent. You will lose the asset and receive no funds in return.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setInnerView('menu')}
                    className="py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-black hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { onAbandon(asset.instanceId); onClose(); }}
                    className="py-3 rounded-xl bg-red-600 text-white text-sm font-black hover:bg-red-700 transition-all"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
};
