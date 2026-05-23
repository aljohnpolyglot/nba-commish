import type { ButtonHTMLAttributes, ReactElement } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { spendingOfferMultiplier } from '../../../services/staff/gmAttributes';
import type { NBAPlayer } from '../../../types';
import type { ContractOption, ContractType } from './SigningModalShared';

type HoldableButtonProps = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'onPointerCancel' | 'onPointerDown' | 'onPointerUp'
>;

interface BuyoutInfo {
  applicable: boolean;
  estimatedBuyoutUSD: number;
  league: string;
  teamMaxContributionUSD: number;
}

interface ContractLimitsLike {
  isRookieExtEligible: boolean;
  isSupermaxEligible: boolean;
  maxSalaryUSD: number;
  minSalaryUSD: number;
  rookieRoseQualified?: boolean;
}

interface RosterInfo {
  standardCount: number;
  standardFull: boolean;
  twoWayFull: boolean;
}

interface YearsTableRow {
  capRoom: number;
  salary: number;
  year: number;
}

interface SigningModalNegotiationTabProps {
  buyout: BuyoutInfo;
  canOfferTwoWay: boolean;
  competingInterest: number;
  contractType: ContractType;
  decOptionProps: HoldableButtonProps;
  decSalaryProps: HoldableButtonProps;
  decYearsProps: HoldableButtonProps;
  euroIsolated: boolean;
  formattedYears: string;
  gmSpending: number;
  hasOwnTeamBirdRights: boolean;
  incOptionProps: HoldableButtonProps;
  incSalaryProps: HoldableButtonProps;
  incYearsProps: HoldableButtonProps;
  interest: number;
  interestColor: string;
  isOwnTeamGM: boolean;
  isResign: boolean;
  isTrainingCampPeriod: boolean;
  leagueYear: number;
  limits: ContractLimitsLike;
  maxAllowed: number;
  minAllowed: number;
  money: (value: number) => string;
  moneyPrecise: (value: number, decimals?: number) => string;
  option: ContractOption;
  player: NBAPlayer;
  roster: RosterInfo;
  salary: number;
  setContractType: (value: ContractType) => void;
  setTeamBuyoutContribUSD: (value: number) => void;
  teamBuyoutContribUSD: number;
  teamHoldsBirdRights: boolean;
  totalBuyoutPaidUSD: number;
  yearsTable: YearsTableRow[];
}

export default function SigningModalNegotiationTab({
  buyout,
  canOfferTwoWay,
  competingInterest,
  contractType,
  decOptionProps,
  decSalaryProps,
  decYearsProps,
  euroIsolated,
  formattedYears,
  gmSpending,
  hasOwnTeamBirdRights,
  incOptionProps,
  incSalaryProps,
  incYearsProps,
  interest,
  interestColor,
  isOwnTeamGM,
  isResign,
  isTrainingCampPeriod,
  leagueYear,
  limits,
  maxAllowed,
  minAllowed,
  money,
  moneyPrecise,
  option,
  player,
  roster,
  salary,
  setContractType,
  setTeamBuyoutContribUSD,
  teamBuyoutContribUSD,
  teamHoldsBirdRights,
  totalBuyoutPaidUSD,
  yearsTable,
}: SigningModalNegotiationTabProps): ReactElement {
  return (
    <div className="space-y-8">
      <div className="bg-white/[0.04] border border-white/[0.06] rounded-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-[#e21d37]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/50 italic">
              Offer Strength
            </span>
          </div>
          <span className="text-2xl font-black italic" style={{ color: interestColor }}>
            {interest}%
          </span>
        </div>
        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
          <motion.div
            animate={{ width: `${interest}%` }}
            transition={{ type: 'spring', damping: 20 }}
            className="h-full rounded-full"
            style={{ backgroundColor: interestColor, boxShadow: `0 0 16px ${interestColor}60` }}
          />
        </div>
        <p className="text-[9px] font-bold uppercase text-white/20 tracking-widest mt-2">
          {interest >= 70 ? 'Strong interest — player is engaged' : interest >= 40 ? 'Moderate — room to improve' : 'Low — player is unlikely to accept'}
        </p>
      </div>

      {isOwnTeamGM && (() => {
        const mult = spendingOfferMultiplier(gmSpending);
        const label = gmSpending >= 80 ? 'High Spender' : gmSpending >= 60 ? 'Balanced' : 'Value Hunter';
        const color = gmSpending >= 80 ? '#f59e0b' : gmSpending >= 60 ? '#8b949e' : '#38bdf8';
        const pctText = mult >= 1 ? `+${Math.round((mult - 1) * 100)}%` : `-${Math.round((1 - mult) * 100)}%`;
        return (
          <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-sm">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color }}>
              GM Style: {label}
            </p>
            <p className="text-[9px] text-white/30 ml-auto">
              Opening offer {pctText} vs market · Spending {gmSpending}
            </p>
          </div>
        );
      })()}

      {buyout.applicable && (() => {
        const neededRatio = Math.max(0.5, competingInterest / 100);
        const neededUSD = buyout.estimatedBuyoutUSD * neededRatio;
        const release = neededUSD > 0 ? Math.min(100, Math.round((totalBuyoutPaidUSD / neededUSD) * 100)) : 100;
        const color = release >= 100 ? '#22c55e' : release >= 60 ? '#f59e0b' : '#f43f5e';
        const note = release >= 100
          ? `${buyout.league} club will accept your buyout`
          : release >= 60
            ? 'Getting warmer — bump your contribution to close it out'
            : `${buyout.league} club not interested at this number`;
        return (
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp size={15} style={{ color }} />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/50 italic">
                  {buyout.league} Mother Team Interest
                </span>
              </div>
              <span className="text-2xl font-black italic" style={{ color }}>
                {release}%
              </span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div
                animate={{ width: `${release}%` }}
                transition={{ type: 'spring', damping: 20 }}
                className="h-full rounded-full"
                style={{ backgroundColor: color, boxShadow: `0 0 16px ${color}60` }}
              />
            </div>
            <p className="text-[9px] font-bold uppercase tracking-widest mt-2 text-white/20">
              {note} · Retention pull {competingInterest}%
            </p>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Contract Type</p>
            <div className="flex border border-white/5 rounded-sm p-1 bg-black/60 gap-1">
              {(euroIsolated ? (['GUARANTEED'] as ContractType[]) : (['GUARANTEED', 'TWO_WAY', 'NON_GUARANTEED'] as ContractType[]))
                .filter(type =>
                  type === 'GUARANTEED' ? (!roster.standardFull || isResign || teamHoldsBirdRights)
                    : type === 'TWO_WAY' ? canOfferTwoWay && !hasOwnTeamBirdRights && !roster.twoWayFull
                      : isTrainingCampPeriod && roster.standardCount >= 15,
                )
                .map(type => (
                  <button
                    key={type}
                    onClick={() => setContractType(type)}
                    className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-sm transition-all ${
                      contractType === type
                        ? type === 'NON_GUARANTEED'
                          ? 'bg-amber-600 text-white shadow-lg'
                          : 'bg-[#e21d37] text-white shadow-lg'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                    }`}
                  >
                    {type === 'NON_GUARANTEED' ? 'NG' : type.replace('_', ' ')}
                  </button>
                ))}
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex justify-between items-center mb-2">
              Year 1 Salary
              <div className="flex gap-3 text-[10px]">
                <span className="text-[#e21d37]">MIN {money(minAllowed)}</span>
                <span className="text-white/50">MAX {money(maxAllowed)}</span>
              </div>
            </label>
            <div className={`flex items-center justify-between h-16 bg-white/[0.04] border border-white/10 rounded-sm px-4 transition-all ${contractType === 'TWO_WAY' ? 'opacity-40' : 'hover:border-[#e21d37]/40'}`}>
              <button
                {...decSalaryProps}
                disabled={contractType === 'TWO_WAY' || salary <= minAllowed}
                className="text-white/30 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed touch-none select-none"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-center">
                <span className="text-2xl font-black italic text-white">{moneyPrecise(salary, 2)}</span>
                <p className="text-[8px] font-bold uppercase text-white/30 tracking-widest mt-0.5">Starting Amount</p>
              </div>
              <button
                {...incSalaryProps}
                disabled={contractType === 'TWO_WAY' || salary >= maxAllowed}
                className="text-white/30 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed touch-none select-none"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            {contractType !== 'TWO_WAY' && (
              <div className="mt-2 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/20 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, ((salary - minAllowed) / Math.max(1, maxAllowed - minAllowed)) * 100))}%` }}
                />
              </div>
            )}
          </div>

          <div className={`grid gap-4 ${euroIsolated ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {[
              {
                label: 'Years',
                display: formattedYears,
                decProps: decYearsProps,
                incProps: incYearsProps,
                disabled: false,
              },
              ...(!euroIsolated ? [{
                label: 'Incentive',
                display: option === 'NONE' ? 'None' : `${option === 'PLAYER' ? 'Player' : 'Team'} Opt.`,
                decProps: decOptionProps,
                incProps: incOptionProps,
                disabled: contractType === 'TWO_WAY',
              }] : []),
            ].map(({ label, display, decProps, incProps, disabled }) => (
              <div key={label}>
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">{label}</p>
                <div className={`flex items-center justify-between h-12 bg-white/[0.04] border border-white/10 rounded-sm px-2 ${disabled ? 'opacity-30' : ''}`}>
                  <button {...decProps} disabled={disabled} className="text-white/30 hover:text-white p-1 disabled:cursor-not-allowed touch-none select-none">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-sm font-black italic text-white uppercase truncate text-center flex-1">
                    {display}
                  </span>
                  <button {...incProps} disabled={disabled} className="text-white/30 hover:text-white p-1 disabled:cursor-not-allowed touch-none select-none">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!euroIsolated && (() => {
            const hasBird = hasOwnTeamBirdRights || !!(player as any).hasBirdRights;
            const svc = ((player as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
            const recent = ((player as any).awards ?? []).filter((a: any) => a.season && a.season >= leagueYear - 3);
            const notableAwards = recent
              .filter((a: any) => /all.nba|mvp|defensive player|dpoy/i.test(a.type ?? ''))
              .map((a: any) => a.type);
            return (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">Bird Rights</p>
                  <div className={`flex items-center justify-center h-12 bg-white/[0.04] border rounded-sm ${hasBird ? 'border-emerald-500/40' : 'border-white/10'}`}>
                    <span className={`text-sm font-black italic uppercase ${hasBird ? 'text-emerald-300' : 'text-white/40'}`}>
                      {hasBird ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">Supermax</p>
                  <div className={`flex items-center justify-center h-12 bg-white/[0.04] border rounded-sm ${limits.isSupermaxEligible ? 'border-amber-500/50' : 'border-white/10'}`}>
                    <span
                      className={`text-[10px] font-black italic uppercase text-center leading-tight px-1 ${limits.isSupermaxEligible ? 'text-amber-300' : 'text-white/40'}`}
                      title={limits.isSupermaxEligible ? (svc >= 8 ? `${svc}yrs service` : notableAwards.slice(0, 2).join(', ') || 'Eligible') : `Needs 8+ yrs svc OR recent All-NBA/MVP/DPOY${hasBird ? '' : ' + Bird Rights'}`}
                    >
                      {limits.isSupermaxEligible ? (svc >= 8 ? `${svc}yr svc` : (notableAwards[0] ?? 'Eligible')) : 'Not Eligible'}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">Rookie Ext</p>
                  <div className={`flex items-center justify-center h-12 bg-white/[0.04] border rounded-sm ${limits.isRookieExtEligible ? 'border-indigo-500/50' : 'border-white/10'}`}>
                    <span
                      className={`text-[10px] font-black italic uppercase text-center leading-tight px-1 ${limits.isRookieExtEligible ? 'text-indigo-300' : 'text-white/40'}`}
                      title={limits.isRookieExtEligible ? (limits.rookieRoseQualified ? 'Rose Rule — 30% max ext' : 'Standard rookie ext — 25% max') : 'Needs Bird Rights + 3–4 yrs service'}
                    >
                      {limits.isRookieExtEligible ? (limits.rookieRoseQualified ? 'Rose Rule' : 'Eligible') : 'Not Eligible'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {buyout.applicable && contractType !== 'TWO_WAY' && (
            <div>
              <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex justify-between items-center mb-2">
                Buyout — {buyout.league}
                <span className="text-[10px] text-orange-400">
                  Asking {money(buyout.estimatedBuyoutUSD)}
                </span>
              </label>
              <div className="bg-white/[0.04] border border-white/10 rounded-sm p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[9px] font-bold uppercase text-white/40 tracking-widest">Your Contribution</span>
                  <span className="text-lg font-black italic text-white">{moneyPrecise(teamBuyoutContribUSD, 2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={buyout.teamMaxContributionUSD}
                  step={25_000}
                  value={teamBuyoutContribUSD}
                  onChange={e => setTeamBuyoutContribUSD(parseInt(e.target.value, 10))}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-[9px] font-bold uppercase text-white/30 tracking-widest">
                  <span>Min {money(0)}</span>
                  <span>FIBA Cap {money(buyout.teamMaxContributionUSD)}</span>
                </div>
                <div className="pt-2 border-t border-white/5">
                  <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest">
                    <span className="text-white/40">Player Pays (out of pocket)</span>
                    <span className="text-amber-300">
                      {money(Math.max(0, buyout.estimatedBuyoutUSD - teamBuyoutContribUSD))}
                    </span>
                  </div>
                  <p className="text-[8px] text-white/30 italic mt-1 leading-relaxed normal-case tracking-normal">
                    FIBA cap limits your team's contribution to {money(buyout.teamMaxContributionUSD)}. Any remainder is paid by the player — usually from their signing bonus.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#0d0d0d] border border-white/5 rounded-sm overflow-hidden">
          <div className="bg-white/[0.04] px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest italic text-white/40">
              Cap Projection
            </span>
            <span className="text-[8px] font-bold uppercase text-emerald-400">+5% Escalator</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {yearsTable.map((row, i) => (
              <div key={row.year} className="grid grid-cols-3 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <div>
                  <p className="text-[8px] font-bold text-white/20 uppercase">Season {i + 1}</p>
                  <p className="text-xs font-black italic text-white/60">
                    {row.year - 1}–{String(row.year).slice(-2)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] font-bold text-white/20 uppercase">Salary</p>
                  <p className="text-xs font-black italic text-white">{money(row.salary)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-bold text-white/20 uppercase">Cap Rm</p>
                  <p className={`text-xs font-black italic ${row.capRoom < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {row.capRoom < 0 ? '-' : ''}
                    {money(Math.abs(row.capRoom))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
