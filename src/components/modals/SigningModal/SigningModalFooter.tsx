import type { ReactElement } from 'react';
import type { NBAPlayer } from '../../../types';
import { contractToUSD } from '../../../utils/salaryUtils';
import type { ContractType, MleType } from './SigningModalShared';

interface SigningModalFooterProps {
  autoAccept: boolean;
  contractType: ContractType;
  euroIsolated: boolean;
  hasOwnTeamBirdRights: boolean;
  isResign: boolean;
  leagueYear: number;
  limitsMinSalaryUSD: number;
  mle: {
    available: number;
    blocked: boolean;
    type: MleType;
  };
  money: (value: number) => string;
  onClose: () => void;
  onMleSubmit: () => void;
  onPrimarySubmit: () => void;
  onShowCapWarning: () => void;
  playerInternalId?: string;
  players: NBAPlayer[];
  salary: number;
  shouldSubmitBid: boolean;
  teamId: number;
  thresholdsSalaryCap: number;
}

export default function SigningModalFooter({
  autoAccept,
  contractType,
  euroIsolated,
  hasOwnTeamBirdRights,
  isResign,
  leagueYear,
  limitsMinSalaryUSD,
  mle,
  money,
  onClose,
  onMleSubmit,
  onPrimarySubmit,
  onShowCapWarning,
  playerInternalId,
  players,
  salary,
  shouldSubmitBid,
  teamId,
  thresholdsSalaryCap,
}: SigningModalFooterProps): ReactElement {
  const newDealStartYear = leagueYear + (isResign ? 1 : 0);
  const committedAtStartYear = players
    .filter(p =>
      p.tid === teamId &&
      !(p as any).twoWay &&
      (p.contract?.exp ?? newDealStartYear) >= newDealStartYear &&
      !(isResign && p.internalId === playerInternalId),
    )
    .reduce((sum, p) => sum + contractToUSD(p.contract?.amount || 0), 0);
  const projectedPayroll = committedAtStartYear + salary;
  const isMinContract = salary <= limitsMinSalaryUSD * 1.05;
  const blownCap = !euroIsolated && contractType !== 'TWO_WAY' && !hasOwnTeamBirdRights && projectedPayroll > thresholdsSalaryCap && !isMinContract;

  return (
    <div className="sticky bottom-0 z-40 px-3 sm:px-8 xl:px-10 py-3 sm:py-6 bg-black/80 backdrop-blur-xl border-t border-white/10 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-end shrink-0 shadow-[0_-18px_40px_rgba(0,0,0,0.45)]">
      <div className="flex w-full sm:w-auto gap-2 sm:gap-3 flex-nowrap justify-end">
        <button
          onClick={onClose}
          className="flex-1 sm:flex-none px-3 sm:px-8 py-2.5 sm:py-3 bg-white/5 border border-white/10 rounded-sm text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all"
        >
          Withdraw
        </button>
        {!euroIsolated && contractType !== 'TWO_WAY' && mle.type && (() => {
          const mleCanCover = !mle.blocked && salary > 0 && salary <= mle.available;
          const mleLabel = mle.type === 'room' ? 'Room MLE' : mle.type === 'non_taxpayer' ? 'NT MLE' : 'Tax MLE';
          return (
            <button
              disabled={!mleCanCover}
              onClick={onMleSubmit}
              title={mleCanCover ? `Uses ${mleLabel} — ${money(mle.available)} available` : `Salary exceeds ${mleLabel} limit (${money(mle.available)} available)`}
              className={`flex-1 sm:flex-none px-3 sm:px-6 py-2.5 sm:py-3 rounded-sm text-[9px] sm:text-[10px] font-black italic uppercase tracking-widest transition-all ${mleCanCover ? 'bg-blue-600 text-white hover:scale-[1.02]' : 'bg-blue-900/30 text-blue-300/30 cursor-not-allowed'}`}
            >
              Sign w/ {mleLabel}
            </button>
          );
        })()}
        <button
          onClick={() => {
            if (blownCap) {
              onShowCapWarning();
              return;
            }
            onPrimarySubmit();
          }}
          className="flex-1 sm:flex-none px-5 sm:px-10 py-2.5 sm:py-3 bg-[#e21d37] rounded-sm text-[9px] sm:text-[10px] font-black italic uppercase tracking-widest text-white hover:scale-[1.02] transition-all"
        >
          {shouldSubmitBid ? 'Submit Offer' : (autoAccept ? 'Finalize Deal' : 'Submit')}
        </button>
      </div>
    </div>
  );
}
