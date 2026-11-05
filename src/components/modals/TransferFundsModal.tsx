import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../store/GameContext';
import { X, ArrowRightLeft } from 'lucide-react';
import { getLeagueCurrencyCode } from '../../utils/helpers';
import { ChevronAmountControl } from '../shared/actions/ChevronAmountControl';
import {
  getAvailableLeagueBudget,
  getLeagueReserve,
} from '../../services/logic/leagueTreasury';

interface TransferFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: { from: 'personal' | 'league', amount: number }) => Promise<void>;
}

export const TransferFundsModal: React.FC<TransferFundsModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const { state } = useGame();
  const currencyCode = getLeagueCurrencyCode(state.leagueStats);
  const availableBudgetM = getAvailableLeagueBudget(state.stats);
  const leagueReserveM = getLeagueReserve(state.stats);
  const [transferAmount, setTransferAmount] = useState<number>(100_000);
  const [transferDirection, setTransferDirection] = useState<'league_to_personal' | 'personal_to_league'>('league_to_personal');
  const availableUSD = (transferDirection === 'league_to_personal' ? availableBudgetM : state.stats.personalWealth) * 1_000_000;
  const amountStep = availableUSD < 1_000_000 ? 10_000 : availableUSD < 10_000_000 ? 50_000 : 100_000;
  const recommendedAmount = useMemo(
    () => Math.max(amountStep, Math.round((availableUSD * 0.05) / amountStep) * amountStep),
    [amountStep, availableUSD],
  );

  useEffect(() => {
    if (isOpen) setTransferAmount(recommendedAmount);
  }, [isOpen, recommendedAmount, transferDirection]);

  if (!isOpen) return null;

  const handleTransfer = async () => {
    if (transferAmount <= 0) return;
    
    const amountInMillions = transferAmount / 1000000;

    if (transferDirection === 'league_to_personal') {
      if (amountInMillions > availableBudgetM) return;
      await onConfirm({ from: 'league', amount: transferAmount });
    } else {
      if (amountInMillions > state.stats.personalWealth) return;
      await onConfirm({ from: 'personal', amount: transferAmount });
    }
    
    setTransferAmount(0);
    onClose();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl flex max-h-[calc(100vh-2rem)] flex-col shadow-2xl overflow-hidden">
        <div className="border-b border-slate-800 bg-slate-900/50 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
              <ArrowRightLeft className="text-indigo-500" />
              Transfer Funds
            </h2>
            <p className="text-sm text-slate-400 mt-1">League spending is limited by the current season budget.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <X size={24} />
          </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mb-6 grid grid-cols-1 gap-4 sm:mb-8 sm:grid-cols-3 sm:gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">League Reserve</p>
              <p className="text-2xl font-mono font-bold text-emerald-400">${leagueReserveM.toFixed(2)}M</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Available Budget</p>
              <p className="text-2xl font-mono font-bold text-cyan-400">${availableBudgetM.toFixed(2)}M</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Personal Wealth</p>
              <p className="text-2xl font-mono font-bold text-amber-400 sm:text-3xl">${state.stats.personalWealth.toFixed(2)}M</p>
            </div>
          </div>

          <div className="space-y-5 sm:space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-400 mb-2">Transfer Direction</label>
              <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-1 sm:flex-row">
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
              <ChevronAmountControl
                value={transferAmount}
                step={amountStep}
                recommendedValue={recommendedAmount}
                currencyCode={currencyCode}
                label="Transfer Amount"
                valueCaption="Funds Transfer"
                onChange={setTransferAmount}
              />
              <p className="text-xs text-slate-500 mt-2">
                {transferAmount > 0 ? `Transferring ${formatCurrency(transferAmount)}` : 'Select an amount with the chevrons.'}
              </p>
            </div>

            <button
              onClick={handleTransfer}
              disabled={
                transferAmount <= 0 || 
                (transferDirection === 'league_to_personal' && (transferAmount / 1000000) > availableBudgetM) ||
                (transferDirection === 'personal_to_league' && (transferAmount / 1000000) > state.stats.personalWealth)
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4 font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
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
