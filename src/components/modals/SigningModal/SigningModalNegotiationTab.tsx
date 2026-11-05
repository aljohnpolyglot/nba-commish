import type { ButtonHTMLAttributes, ReactElement } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import type { NBAPlayer } from '../../../types';
import { areBirdRightsEnabled, isRookieExtensionEnabled, isSalaryCapEnabled, isSupermaxEnabled } from '../../../utils/ruleFlags';
import type { ContractOption, ContractType } from './SigningModalShared';
import { getNbaYearsOfService } from '../../../utils/playerExperience';
import type { TycoonState } from '../../../types/tycoon';
import { SponsorSigningPerkPicker } from '../../tycoon/SponsorSigningPerkPicker';
import { formatLeagueSeasonLabel } from '../../../services/leagueCalendar';
import { getWnbaDevelopmentalContractLabel } from '../../../services/wnba/developmentalContracts';

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
  decSigningBonusProps: HoldableButtonProps;
  decYearsProps: HoldableButtonProps;
  euroIsolated: boolean;
  pbaIsolated: boolean;
  formattedYears: string;
  hasOwnTeamBirdRights: boolean;
  hideMarketFeedback: boolean;
  incOptionProps: HoldableButtonProps;
  incSalaryProps: HoldableButtonProps;
  incSigningBonusProps: HoldableButtonProps;
  incYearsProps: HoldableButtonProps;
  interest: number;
  interestColor: string;
  isPbaImportSigning: boolean;
  isResign: boolean;
  isTrainingCampPeriod: boolean;
  leagueStats: any;
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
  signingBonusEUR: number;
  signingBonusStepEUR: number;
  selectedSponsorPerkKey: string | null;
  setSelectedSponsorPerkKey: (value: string | null) => void;
  recommendedSigningBonusEUR: number;
  setContractType: (value: ContractType) => void;
  setTeamBuyoutContribUSD: (value: number) => void;
  teamBuyoutContribUSD: number;
  teamHoldsBirdRights: boolean;
  totalBuyoutPaidUSD: number;
  yearsTable: YearsTableRow[];
  tycoon?: TycoonState;
}

export default function SigningModalNegotiationTab({
  buyout,
  canOfferTwoWay,
  competingInterest,
  contractType,
  decOptionProps,
  decSalaryProps,
  decSigningBonusProps,
  decYearsProps,
  euroIsolated,
  pbaIsolated,
  formattedYears,
  hasOwnTeamBirdRights,
  hideMarketFeedback,
  incOptionProps,
  incSalaryProps,
  incSigningBonusProps,
  incYearsProps,
  interest,
  interestColor,
  isPbaImportSigning,
  isResign,
  isTrainingCampPeriod,
  leagueStats,
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
  signingBonusEUR,
  signingBonusStepEUR,
  selectedSponsorPerkKey,
  setSelectedSponsorPerkKey,
  recommendedSigningBonusEUR,
  setContractType,
  setTeamBuyoutContribUSD,
  teamBuyoutContribUSD,
  teamHoldsBirdRights,
  totalBuyoutPaidUSD,
  yearsTable,
  tycoon,
}: SigningModalNegotiationTabProps): ReactElement {
  const nonNbaContractRules = euroIsolated || pbaIsolated;
  const salaryCapActive = isSalaryCapEnabled(leagueStats);
  const birdRightsActive = areBirdRightsEnabled(leagueStats);
  const supermaxActive = isSupermaxEnabled(leagueStats);
  const rookieExtensionActive = isRookieExtensionEnabled(leagueStats);
  const secondaryContractLabel = getWnbaDevelopmentalContractLabel(leagueStats);
  const showNbaRightsPanel = !nonNbaContractRules && (birdRightsActive || supermaxActive || rookieExtensionActive);
  const showCapRoomProjection = !nonNbaContractRules && salaryCapActive;
  const projectionGridClass = showCapRoomProjection ? 'grid-cols-3' : 'grid-cols-2';
  const projectedMoney = (value: number) => {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    if (!euroIsolated && !pbaIsolated && abs > 0 && abs < 1_000_000) {
      return `$${Math.max(1, Math.round(abs / 1_000))}K`;
    }
    return abs > 0 && abs < 100_000 ? moneyPrecise(value, 2) : money(value);
  };
  const projectionTitle = isPbaImportSigning
    ? 'Conference Contract'
    : showCapRoomProjection
      ? 'Cap Projection'
      : 'Salary Projection';
  const contractTypeChoices = nonNbaContractRules
    ? [{ type: 'GUARANTEED' as ContractType, enabled: true, reason: '' }]
    : [
        {
          type: 'GUARANTEED' as ContractType,
          enabled: !roster.standardFull || isResign || teamHoldsBirdRights,
          reason: roster.standardFull ? 'Standard roster is full' : '',
        },
        {
          type: 'TWO_WAY' as ContractType,
          enabled: canOfferTwoWay && !hasOwnTeamBirdRights && !roster.twoWayFull,
          reason: !canOfferTwoWay
            ? `${secondaryContractLabel} contract unavailable for this player`
            : hasOwnTeamBirdRights
              ? 'Use a standard deal with Bird rights'
              : roster.twoWayFull
                ? `${secondaryContractLabel} slots are full`
                : '',
        },
        {
          type: 'NON_GUARANTEED' as ContractType,
          enabled: isTrainingCampPeriod && roster.standardCount >= 15,
          reason: !isTrainingCampPeriod
            ? 'Available during training camp'
            : roster.standardCount < 15
              ? 'Available after the standard roster is full'
              : '',
        },
      ];

  return (
    <div className="space-y-5 sm:space-y-8">
      {!hideMarketFeedback && <div className="bg-white/[0.04] border border-white/[0.06] rounded-sm p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
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
      </div>}

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
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-sm p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-8">
        <div className="space-y-5 sm:space-y-6">
          {!nonNbaContractRules && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Contract Type</p>
              <div className="flex flex-wrap border border-white/5 rounded-sm p-1 bg-black/60 gap-1">
                {contractTypeChoices.map(({ type, enabled, reason }) => (
                  <button
                    key={type}
                    disabled={!enabled}
                    onClick={() => enabled && setContractType(type)}
                    title={enabled ? undefined : reason}
                    className={`flex-1 min-w-[120px] py-2.5 text-[10px] font-black uppercase tracking-widest rounded-sm transition-all ${
                      contractType === type
                        ? type === 'NON_GUARANTEED'
                          ? 'bg-amber-600 text-white shadow-lg'
                          : 'bg-[#e21d37] text-white shadow-lg'
                        : enabled
                          ? 'text-white/30 hover:text-white/60 hover:bg-white/5'
                          : 'text-white/15 cursor-not-allowed'
                    }`}
                  >
                    {type === 'NON_GUARANTEED' ? 'NG' : type === 'TWO_WAY' ? secondaryContractLabel : type.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex flex-col gap-1.5 sm:flex-row sm:justify-between sm:items-center mb-2">
              <span>{isPbaImportSigning ? 'Conference Salary' : 'Year 1 Salary'}</span>
              <div className="flex flex-wrap gap-3 text-[10px]">
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
                <p className="text-[8px] font-bold uppercase text-white/30 tracking-widest mt-0.5">
                  {isPbaImportSigning ? 'Conference Deal' : 'Starting Amount'}
                </p>
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

          <div className={`grid gap-4 ${nonNbaContractRules ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {[
              {
                label: 'Years',
                display: formattedYears,
                decProps: decYearsProps,
                incProps: incYearsProps,
                disabled: false,
              },
              ...(!nonNbaContractRules ? [{
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

          {euroIsolated && (
            <div>
              <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex flex-col gap-1.5 sm:flex-row sm:justify-between sm:items-center mb-2">
                <span>Signing Bonus</span>
                <span className="text-[10px] text-violet-300">Recommended {money(recommendedSigningBonusEUR)}</span>
              </label>
              <div className="flex items-center justify-between min-h-16 bg-violet-500/[0.06] border border-violet-400/20 rounded-sm px-4">
                <button
                  {...decSigningBonusProps}
                  disabled={signingBonusEUR <= 0}
                  aria-label="Lower signing bonus"
                  className="text-white/30 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed touch-none select-none"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="text-center px-3">
                  <span className="text-2xl font-black italic text-white">{moneyPrecise(signingBonusEUR, 2)}</span>
                  <p className="text-[8px] font-bold text-white/30 tracking-widest mt-0.5">
                    Paid immediately when the deal is signed
                  </p>
                </div>
                <button
                  {...incSigningBonusProps}
                  aria-label="Raise signing bonus"
                  className="text-white/30 hover:text-white transition-colors p-1 touch-none select-none"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-white/20">
                {money(signingBonusStepEUR)} increments · strengthens the offer
              </p>
              <div className="mt-3">
                <SponsorSigningPerkPicker
                  tycoon={tycoon}
                  currentYear={leagueYear}
                  appliesTo="player"
                  annualSalaryEUR={salary}
                  selectedKey={selectedSponsorPerkKey}
                  onSelect={choice => setSelectedSponsorPerkKey(choice?.key ?? null)}
                  currency={leagueStats?.currency ?? 'EUR'}
                />
              </div>
            </div>
          )}

          {showNbaRightsPanel && (() => {
            const hasBird = hasOwnTeamBirdRights;
            const svc = getNbaYearsOfService(player, leagueYear);
            const recent = ((player as any).awards ?? []).filter((a: any) => a.season && a.season >= leagueYear - 3);
            const notableAwards = recent
              .filter((a: any) => /all.nba|mvp|defensive player|dpoy/i.test(a.type ?? ''))
              .map((a: any) => a.type);
            return (
              <div className={`grid grid-cols-1 ${[birdRightsActive, supermaxActive, rookieExtensionActive].filter(Boolean).length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3`}>
                {birdRightsActive && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">Bird Rights</p>
                    <div className={`flex items-center justify-center h-12 bg-white/[0.04] border rounded-sm ${hasBird ? 'border-emerald-500/40' : 'border-white/10'}`}>
                      <span className={`text-sm font-black italic uppercase ${hasBird ? 'text-emerald-300' : 'text-white/40'}`}>
                        {hasBird ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                )}
                {supermaxActive && (
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
                )}
                {rookieExtensionActive && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">Rookie Ext</p>
                    <div className={`flex items-center justify-center h-12 bg-white/[0.04] border rounded-sm ${limits.isRookieExtEligible ? 'border-indigo-500/50' : 'border-white/10'}`}>
                      <span
                        className={`text-[10px] font-black italic uppercase text-center leading-tight px-1 ${limits.isRookieExtEligible ? 'text-indigo-300' : 'text-white/40'}`}
                        title={limits.isRookieExtEligible ? (limits.rookieRoseQualified ? 'Rose Rule - 30% max ext' : 'Standard rookie ext - 25% max') : 'Needs Bird Rights + 3-4 yrs service'}
                      >
                        {limits.isRookieExtEligible ? (limits.rookieRoseQualified ? 'Rose Rule' : 'Eligible') : 'Not Eligible'}
                      </span>
                    </div>
                  </div>
                )}
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
          <div className="bg-white/[0.04] px-4 sm:px-6 py-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest italic text-white/40">
              {projectionTitle}
            </span>
            <span className="text-[8px] font-bold uppercase text-emerald-400">+5% Escalator</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {yearsTable.map((row, i) => (
              <div key={row.year} className={`grid ${projectionGridClass} px-4 sm:px-6 py-4 hover:bg-white/[0.02] transition-colors gap-2`}>
                <div>
                  <p className="text-[8px] font-bold text-white/20 uppercase">Season {i + 1}</p>
                  <p className="text-xs font-black italic text-white/60">
                    {formatLeagueSeasonLabel(row.year, leagueStats)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] font-bold text-white/20 uppercase">Salary</p>
                  <p className="text-xs font-black italic text-white">{projectedMoney(row.salary)}</p>
                </div>
                {showCapRoomProjection && (
                  <div className="text-right">
                    <p className="text-[8px] font-bold text-white/20 uppercase">Cap Rm</p>
                    <p className={`text-xs font-black italic ${row.capRoom < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {row.capRoom < 0 ? '-' : ''}
                      {projectedMoney(Math.abs(row.capRoom))}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
