import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { NBAPlayer, NBATeam, GameState } from '../../types';
import { buildStretchedSchedule, seasonLabelToYear } from '../../utils/salaryUtils';
import { getTwoWayRosterLimit } from '../../utils/rosterLimits';
import { isNonGuaranteedContract, isTwoWayContract, normalizeContractOptionKind } from '../../utils/contractTypes';
import { areApronsEnabled, isDeadMoneyEnabled, isMleEnabled, isStretchProvisionEnabled } from '../../utils/ruleFlags';
import { getTeamFullName } from '../../utils/teamNames';
import { getWnbaDevelopmentalContractLabel } from '../../services/wnba/developmentalContracts';

interface Props {
  player: NBAPlayer;
  team: NBATeam | undefined;
  state: GameState;
  onClose: () => void;
  onConfirm: (opts: { stretch: boolean }) => void;
}

const fmtM = (usd: number) => `$${(usd / 1_000_000).toFixed(1)}M`;

export const WaiveConfirmModal: React.FC<Props> = ({ player, team, state, onClose, onConfirm }) => {
  const [stretch, setStretch] = useState(false);

  const ls = state.leagueStats as any;
  const pbaIsolated = ls.uiMode === 'pba_isolated';
  const deadMoneyEnabled = !pbaIsolated && isDeadMoneyEnabled(ls);
  const stretchEnabled = isStretchProvisionEnabled(ls);
  const stretchMult = ls.stretchProvisionMultiplier ?? 2;
  const ngDeadlineMonth = ls.ngGuaranteeDeadlineMonth ?? 1;
  const ngDeadlineDay = ls.ngGuaranteeDeadlineDay ?? 10;
  const seasonYear: number = ls.year ?? new Date().getUTCFullYear();
  const today = state.date ? new Date(state.date) : new Date();
  const ngDeadline = new Date(seasonYear, ngDeadlineMonth - 1, ngDeadlineDay);
  const twoWayContractsActive = !pbaIsolated && getTwoWayRosterLimit(ls) > 0;
  const nonGuaranteedContractsActive = !pbaIsolated && ls.nonGuaranteedContractsEnabled !== false;

  const wasNG = nonGuaranteedContractsActive && isNonGuaranteedContract(player, ls);
  const wasTwoWay = twoWayContractsActive && isTwoWayContract(player, ls);
  const secondaryContractLabel = getWnbaDevelopmentalContractLabel(ls);
  const ngFreeRelease = wasNG && today < ngDeadline;
  const contractTypeLabel = pbaIsolated ? 'PBA CONTRACT' : wasNG ? 'NON-GUARANTEED' : wasTwoWay ? secondaryContractLabel.toUpperCase() : 'GUARANTEED';
  const releaseActionLabel = pbaIsolated ? 'Release' : 'Waive';

  const remaining = useMemo(() => {
    if (!deadMoneyEnabled || wasTwoWay || ngFreeRelease) return [];
    const cy: Array<{ season: string; guaranteed: number; option?: string }> =
      Array.isArray((player as any).contractYears) ? (player as any).contractYears : [];
    const future = cy
      .filter(y => {
        const option = normalizeContractOptionKind(y.option);
        return seasonLabelToYear(y.season) >= seasonYear && option !== 'team' && option !== 'player';
      })
      .map(y => ({ season: y.season, amountUSD: y.guaranteed }));
    if (future.length === 0 && (player as any).contract?.amount) {
      const exp = (player as any).contract.exp ?? seasonYear;
      const amt = ((player as any).contract.amount || 0) * 1_000;
      const out: Array<{ season: string; amountUSD: number }> = [];
      for (let yr = seasonYear; yr <= exp; yr++) {
        out.push({ season: `${yr - 1}-${String(yr).slice(-2)}`, amountUSD: amt });
      }
      return out;
    }
    return future;
  }, [player, seasonYear, deadMoneyEnabled, wasTwoWay, ngFreeRelease]);

  const previewSchedule = useMemo(() => {
    if (!stretch || !stretchEnabled) return remaining;
    return buildStretchedSchedule(remaining, stretchMult);
  }, [remaining, stretch, stretchEnabled, stretchMult]);
  const pbaPlainRelease = pbaIsolated && !wasTwoWay && remaining.length === 0;

  const totalDead = remaining.reduce((s, y) => s + y.amountUSD, 0);
  const thisSeasonHit = previewSchedule.find(y => seasonLabelToYear(y.season) === seasonYear)?.amountUSD ?? 0;
  const impactTerms = [
    'payroll',
    ...(isMleEnabled(ls) ? ['exception room'] : []),
    ...(areApronsEnabled(ls) ? ['apron'] : []),
  ];
  const teamName = team ? getTeamFullName(team) : 'Team';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative flex w-full max-w-[1080px] max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-lg border border-rose-500/35 bg-[#080a0d] shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-gradient-to-r from-rose-950/50 via-rose-950/20 to-transparent px-5 py-5 sm:px-12 sm:py-8">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <AlertTriangle className="h-8 w-8 flex-shrink-0 text-rose-400 sm:h-11 sm:w-11" strokeWidth={2.2} />
            <h3 className="break-words text-lg font-black uppercase tracking-[0.12em] text-white sm:text-3xl">
              {releaseActionLabel} {player.name}?
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-7 w-7 sm:h-9 sm:w-9" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:space-y-9 sm:px-12 sm:py-8">
          <div className="text-sm font-medium text-slate-400 sm:text-xl">
            {teamName} · {player.pos} · {contractTypeLabel}
            {' '}· exp {(player as any).contract?.exp ?? '?'}
          </div>

          {pbaPlainRelease && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-5 sm:p-7">
              <p className="text-base font-bold text-emerald-300 sm:text-xl">PBA Release</p>
              <p className="mt-2 text-sm text-slate-400 sm:text-base">
                This move opens a roster spot. No NBA guarantee-deadline or dead-money schedule applies.
              </p>
            </div>
          )}

          {ngFreeRelease && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-5 sm:p-7">
              <p className="text-base font-bold text-emerald-300 sm:text-xl">Free Release</p>
              <p className="mt-2 text-sm text-slate-400 sm:text-base">
                Contract is non-guaranteed and we're before the {ngDeadlineMonth}/{ngDeadlineDay} guarantee deadline. No dead money.
              </p>
            </div>
          )}

          {wasTwoWay && (
            <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-5 sm:p-7">
              <p className="text-base font-bold text-violet-300 sm:text-xl">{secondaryContractLabel} Release</p>
              <p className="mt-2 text-sm text-slate-400 sm:text-base">
                {secondaryContractLabel} contracts do not create dead money.
              </p>
            </div>
          )}

          {!ngFreeRelease && !wasTwoWay && remaining.length > 0 && (
            <>
              <div className="overflow-hidden rounded-md border border-rose-500/35 bg-gradient-to-br from-rose-950/20 to-white/[0.03]">
                <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-7 sm:py-5">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-rose-300 sm:text-lg">
                    Dead Money Schedule
                  </p>
                  <p className="text-sm font-bold text-rose-300 sm:text-xl">{fmtM(totalDead)} total</p>
                </div>
                <div className="max-h-72 divide-y divide-white/10 overflow-y-auto">
                  {previewSchedule.map(y => (
                    <div key={y.season} className="flex items-center justify-between px-5 py-4 text-sm sm:px-7 sm:py-5 sm:text-xl">
                      <span className="text-slate-400">{y.season}</span>
                      <span className="font-mono font-bold text-rose-300">{fmtM(y.amountUSD)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {stretchEnabled && remaining.length > 0 && (
                <label className="flex cursor-pointer items-start gap-4 rounded-md border border-amber-500/40 bg-gradient-to-r from-amber-950/35 to-amber-500/[0.04] p-5 transition-colors hover:bg-amber-500/10 sm:gap-6 sm:p-7">
                  <input
                    type="checkbox"
                    checked={stretch}
                    onChange={e => setStretch(e.target.checked)}
                    className="mt-0.5 h-6 w-6 flex-shrink-0 accent-amber-400 sm:h-8 sm:w-8"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-black uppercase tracking-[0.08em] text-amber-300 sm:text-xl">
                      Stretch over {remaining.length * stretchMult + 1} seasons
                    </p>
                    <p className="mt-2 text-xs text-slate-400 sm:text-lg">
                      Lowers annual cap hit (~{fmtM(totalDead / (remaining.length * stretchMult + 1))}/yr) but extends obligation.
                    </p>
                  </div>
                </label>
              )}

              <div className="text-xs italic text-slate-400 sm:text-lg">
                Cap hit this season: <span className="text-rose-300 font-bold">{fmtM(thisSeasonHit)}</span>
                {' '}· counts against {impactTerms.join(', ')}.
              </div>
            </>
          )}

          {!pbaPlainRelease && !ngFreeRelease && !wasTwoWay && remaining.length === 0 && (
            <div className="rounded-md border border-slate-500/25 bg-slate-500/10 p-5 sm:p-7">
              <p className="text-base font-bold text-slate-200 sm:text-xl">No Future Cap Charge</p>
              <p className="mt-2 text-sm text-slate-400 sm:text-base">
                This release has no future dead-money schedule under the active league rules.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col gap-3 border-t border-white/10 bg-black/40 p-5 sm:flex-row sm:gap-6 sm:px-12 sm:py-7">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-white/20 bg-white/5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/10 sm:py-6 sm:text-lg">
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ stretch: stretch && stretchEnabled })}
            className="flex-1 rounded-md border border-rose-500 bg-gradient-to-r from-rose-950 to-rose-800/80 py-4 text-sm font-black uppercase tracking-[0.08em] text-white shadow-[0_0_28px_rgba(225,29,72,0.14)] transition-colors hover:from-rose-900 hover:to-rose-700 sm:py-6 sm:text-lg">
            {ngFreeRelease || wasTwoWay || remaining.length === 0 ? 'Release' : `${releaseActionLabel} — ${fmtM(thisSeasonHit)} dead`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
