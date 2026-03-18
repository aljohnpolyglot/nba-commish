import React, { useState } from 'react';
import { useGame } from '../../store/GameContext';
import { X, DollarSign, ArrowRightLeft } from 'lucide-react';

interface TransferFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: { from: 'personal' | 'league', amount: number }) => Promise<void>;
}

export const TransferFundsModal: React.FC<TransferFundsModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const { state } = useGame();
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [transferDirection, setTransferDirection] = useState<'league_to_personal' | 'personal_to_league'>('league_to_personal');

  if (!isOpen) return null;

  const handleTransfer = async () => {
    if (transferAmount <= 0) return;
    
    const amountInMillions = transferAmount / 1000000;

    if (transferDirection === 'league_to_personal') {
      if (amountInMillions > state.stats.leagueFunds) return;
      await onConfirm({ from: 'league', amount: transferAmount });
    } else {
      if (amountInMillions > state.stats.personalWealth) return;
      await onConfirm({ from: 'personal', amount: transferAmount });
    }
    
    setTransferAmount(0);
    onClose();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <ArrowRightLeft className="text-indigo-500" />
              Transfer Funds
            </h2>
            <p className="text-sm text-slate-400 mt-1">Move money between your personal wealth and league funds.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">League Funds</p>
              <p className="text-3xl font-mono font-bold text-emerald-400">${state.stats.leagueFunds.toFixed(2)}M</p>
            </div>
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Personal Wealth</p>
              <p className="text-3xl font-mono font-bold text-amber-400">${state.stats.personalWealth.toFixed(2)}M</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-400 mb-2">Transfer Direction</label>
              <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setTransferDirection('league_to_personal')}
                  className={`flex-1 py-3 text-sm font-bold rounded-lg transition-colors ${
                    transferDirection === 'league_to_personal' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  League → Personal
                </button>
                <button
                  onClick={() => setTransferDirection('personal_to_league')}
                  className={`flex-1 py-3 text-sm font-bold rounded-lg transition-colors ${
                    transferDirection === 'personal_to_league' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Personal → League
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-400 mb-2">Amount (USD)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <DollarSign size={20} className="text-slate-500" />
                </div>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={transferAmount || ''}
                  onChange={(e) => setTransferAmount(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white font-mono text-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder="0"
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {transferAmount > 0 ? `Transferring ${formatCurrency(transferAmount)}` : 'Enter exact amount in dollars (e.g., 100000 for $100,000)'}
              </p>
            </div>

            <button
              onClick={handleTransfer}
              disabled={
                transferAmount <= 0 || 
                (transferDirection === 'league_to_personal' && (transferAmount / 1000000) > state.stats.leagueFunds) ||
                (transferDirection === 'personal_to_league' && (transferAmount / 1000000) > state.stats.personalWealth)
              }
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <ArrowRightLeft size={20} />
              Execute Transfer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
