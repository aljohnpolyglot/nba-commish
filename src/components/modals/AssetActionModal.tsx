import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { Product } from '../central/view/commishStoreassets';
import { PersonSelectorModal } from './PersonSelectorModal';
import { useRosterComplianceGate } from '../../hooks/useRosterComplianceGate';
import { Contact } from '../../types';

interface AssetEntry {
  product: Product;
  quantity: number;
  date: string;
}

interface AssetActionModalProps {
  asset: AssetEntry;
  onClose: () => void;
  /** Parent removes the asset from inventory after any action */
  onRemoveAsset: (asset: AssetEntry, qty: number) => void;
}

type InnerView = 'menu' | 'gift_select' | 'deploy_input';

export const AssetActionModal: React.FC<AssetActionModalProps> = ({ asset, onClose, onRemoveAsset }) => {
  const { dispatchAction } = useGame();
  const rosterGate = useRosterComplianceGate();

  const [qty, setQty] = useState(1);
  const [innerView, setInnerView] = useState<InnerView>('menu');
  const [deployText, setDeployText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const unitPrice = parseFloat(asset.product.price.replace(/[^0-9.]/g, '')) || 0;
  const refundDollars = unitPrice * qty * 0.7;
  const refundMillion = refundDollars / 1_000_000;

  /* ─── SELL ─── immediate refund, no day advance */
  const handleSell = () => {
    dispatchAction({ type: 'STORE_PURCHASE', payload: { amountMillion: -refundMillion } });
    onRemoveAsset(asset, qty);
    onClose();
  };

  /* ─── DISCARD ─── remove permanently, no day advance */
  const handleDiscard = () => {
    onRemoveAsset(asset, qty);
    onClose();
  };

  /* ─── GIFT ─── person selector → ADVANCE_DAY so LLM narrates it */
  const handleGiftPersonSelected = async (contacts: Contact[]) => {
    if (!contacts.length) return;
    const recipientName = contacts.map(c => c.name).join(', ');
    setIsProcessing(true);
    onRemoveAsset(asset, qty);
    onClose();
    rosterGate.attempt(() => dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: `Commissioner gifted ${qty}x "${asset.product.title}" (valued at $${(unitPrice * qty).toLocaleString()}) to ${recipientName} as a personal gesture.`,
      },
    } as any));
    setIsProcessing(false);
  };

  /* ─── DEPLOY ─── LLM-driven, user describes intent */
  const handleDeploySubmit = async () => {
    if (!deployText.trim()) return;
    setIsProcessing(true);
    onRemoveAsset(asset, qty);
    onClose();
    rosterGate.attempt(() => dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: `Commissioner deployed ${qty}x "${asset.product.title}": ${deployText.trim()}`,
      },
    } as any));
    setIsProcessing(false);
  };

  /* ─── GIFT mode — shows PersonSelectorModal */
  if (innerView === 'gift_select') {
    return (
      <PersonSelectorModal
        title="Gift Asset — Select Recipient"
        actionType="general"
        onClose={() => setInnerView('menu')}
        onSelect={handleGiftPersonSelected}
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
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110]"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-40%' }}
          animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
          exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-40%' }}
          className="fixed top-1/2 left-1/2 bg-white rounded-3xl overflow-hidden w-[95%] max-w-md z-[111] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center p-2 flex-shrink-0">
                <img
                  src={asset.product.image}
                  alt={asset.product.title}
                  className="max-w-full max-h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <h2 className="font-black text-gray-900 text-sm leading-tight line-clamp-2">
                  {asset.product.title}
                </h2>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                  {innerView === 'deploy_input' ? 'Deploy Asset' : 'Asset Management'}
                </div>
              </div>
            </div>
            <button
              className="text-gray-400 hover:text-gray-600 transition-colors self-start"
              onClick={innerView === 'menu' ? onClose : () => setInnerView('menu')}
            >
              <X size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6">
            {/* Quantity selector (menu view only) */}
            {innerView === 'menu' && asset.quantity > 1 && (
              <div className="mb-6">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">
                  HOW MANY?
                </div>
                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-nba-blue hover:text-nba-blue transition-all font-bold text-xl"
                  >
                    -
                  </button>
                  <span className="text-2xl font-black w-8 text-center">{qty}</span>
                  <button
                    onClick={() => setQty(q => Math.min(asset.quantity, q + 1))}
                    className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-nba-blue hover:text-nba-blue transition-all font-bold text-xl"
                  >
                    +
                  </button>
                </div>
                <div className="text-[10px] text-center text-gray-400 mt-2">MAX: {asset.quantity}</div>
              </div>
            )}

            {/* ── MENU ── */}
            {innerView === 'menu' && (
              <div className="space-y-3">

                {/* GIFT */}
                <button
                  onClick={() => setInnerView('gift_select')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl transition-all"
                >
                  <div className="flex items-center justify-center gap-2 font-black text-base">
                    <span>🎁</span> GIFT
                  </div>
                </button>

                {/* SELL */}
                <button
                  onClick={handleSell}
                  className="w-full bg-green-600 hover:bg-green-700 text-white p-4 rounded-2xl transition-all"
                >
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <div className="flex items-center gap-2 font-black text-base">
                      <span>💰</span> SELL
                    </div>
                    <div className="text-xs font-bold text-green-200">
                      +${refundDollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </button>

                {/* DISCARD */}
                <button
                  onClick={handleDiscard}
                  className="w-full bg-red-600 hover:bg-red-700 text-white p-4 rounded-2xl transition-all"
                >
                  <div className="flex items-center justify-center gap-2 font-black text-base">
                    <span>🗑</span> DISCARD
                  </div>
                </button>

                {/* DEPLOY */}
                <button
                  onClick={() => setInnerView('deploy_input')}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-2xl transition-all"
                >
                  <div className="flex items-center justify-center gap-2 font-black text-base">
                    <span>🤖</span> USE / DEPLOY
                  </div>
                </button>

              </div>
            )}

            {/* ── DEPLOY INPUT ── */}
            {innerView === 'deploy_input' && (
              <div className="space-y-4">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest text-center">
                  How do you want to use this?
                </div>
                <textarea
                  autoFocus
                  rows={4}
                  value={deployText}
                  onChange={e => setDeployText(e.target.value)}
                  placeholder="e.g. Send it to the locker room before the championship game as motivation, or auction it off at a charity event..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 outline-none focus:border-purple-500 transition-colors resize-none"
                />
                <button
                  onClick={handleDeploySubmit}
                  disabled={!deployText.trim() || isProcessing}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white p-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <span className="animate-spin">⚙️</span> Deploying...
                    </>
                  ) : (
                    <>
                      <Send size={18} /> DEPLOY
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </>
      {rosterGate.modal}
    </AnimatePresence>
  );
};
