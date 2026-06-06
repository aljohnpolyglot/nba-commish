import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { Product } from '../central/view/commishStoreassets';
import { PersonSelectorModal } from './PersonSelectorModal';
import { useRosterComplianceGate } from '../../hooks/useRosterComplianceGate';
import { useDraftEventGate } from '../../hooks/useDraftEventGate';
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
  const draftGate = useDraftEventGate();

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
    rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: `Commissioner gifted ${qty}x "${asset.product.title}" (valued at $${(unitPrice * qty).toLocaleString()}) to ${recipientName} as a personal gesture.`,
      },
    } as any)));
    setIsProcessing(false);
  };

  /* ─── DEPLOY ─── LLM-driven, user describes intent */
  const handleDeploySubmit = async () => {
    if (!deployText.trim()) return;
    setIsProcessing(true);
    onRemoveAsset(asset, qty);
    onClose();
    rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: `Commissioner deployed ${qty}x "${asset.product.title}": ${deployText.trim()}`,
      },
    } as any)));
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
          className="fixed left-1/2 top-1/2 z-[111] flex max-h-[calc(100vh-2rem)] w-[95%] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl bg-white shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4 sm:p-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gray-50 p-2 sm:h-16 sm:w-16">
                <img
                  src={asset.product.image}
                  alt={asset.product.title}
                  className="max-w-full max-h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="min-w-0">
                <h2 className="font-black text-gray-900 text-sm leading-tight line-clamp-2">
                  {asset.product.title}
                </h2>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                  {innerView === 'deploy_input' ? 'Deploy Asset' : 'Asset Management'}
                </div>
              </div>
            </div>
            <button
              className="self-start text-gray-400 transition-colors hover:text-gray-600"
              onClick={innerView === 'menu' ? onClose : () => setInnerView('menu')}
            >
              <X size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto p-4 sm:p-6">
            {/* Quantity selector (menu view only) */}
            {innerView === 'menu' && asset.quantity > 1 && (
              <div className="mb-6">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">
                  HOW MANY?
                </div>
                <div className="flex items-center justify-center gap-4 sm:gap-6">
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
                  className="w-full rounded-2xl bg-blue-600 p-4 text-white transition-all hover:bg-blue-700"
                >
                  <div className="flex items-center justify-center gap-2 font-black text-base">
                    <span>🎁</span> GIFT
                  </div>
                </button>

                {/* SELL */}
                <button
                  onClick={handleSell}
                  className="w-full rounded-2xl bg-green-600 p-4 text-white transition-all hover:bg-green-700"
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
                  className="w-full rounded-2xl bg-red-600 p-4 text-white transition-all hover:bg-red-700"
                >
                  <div className="flex items-center justify-center gap-2 font-black text-base">
                    <span>🗑</span> DISCARD
                  </div>
                </button>

                {/* DEPLOY */}
                <button
                  onClick={() => setInnerView('deploy_input')}
                  className="w-full rounded-2xl bg-purple-600 p-4 text-white transition-all hover:bg-purple-700"
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
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 p-4 text-base font-black text-white transition-all hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-300"
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
      {draftGate.modal}
    </AnimatePresence>
  );
};
