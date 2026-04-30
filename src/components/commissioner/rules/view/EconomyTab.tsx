import React, { useState } from 'react';
import { MinContractModal, MaxContractModal, RookieContractModal } from './EconomyComputationsModals';
import { EconomyFinancesSection } from './EconomyFinancesSection';
import { EconomyTeamsSection } from './EconomyTeamsSection';
import { EconomyContractsSection } from './EconomyContractsSection';
import { EconomyRookieContractsSection } from './EconomyRookieContractsSection';
import { Ticket, Calendar, Lock, Coins, HeartPulse, ShieldCheck, Skull } from 'lucide-react';
import { getTradeDeadlineDate, getFreeAgencyStartDate, getFreeAgencyMoratoriumEndDate, toISODateString } from '../../../../utils/dateUtils';
import { useGame } from '../../../../store/GameContext';

interface EconomyTabProps {
    draftType: string;
    salaryCap: number;
    setSalaryCap: (val: number) => void;
    salaryCapEnabled: boolean;
    setSalaryCapEnabled: (val: boolean) => void;
    salaryCapType: string;
    setSalaryCapType: (val: string) => void;
    minimumPayrollEnabled: boolean;
    setMinimumPayrollEnabled: (val: boolean) => void;
    minimumPayrollPercentage: number;
    setMinimumPayrollPercentage: (val: number) => void;
    luxuryTaxEnabled: boolean;
    setLuxuryTaxEnabled: (val: boolean) => void;
    luxuryTaxThresholdPercentage: number;
    setLuxuryTaxThresholdPercentage: (val: number) => void;
    apronsEnabled: boolean;
    setApronsEnabled: (val: boolean) => void;
    numberOfAprons: number;
    setNumberOfAprons: (val: number) => void;
    firstApronPercentage: number;
    setFirstApronPercentage: (val: number) => void;
    secondApronPercentage: number;
    setSecondApronPercentage: (val: number) => void;
    tradeMatchingRatioUnder: number;
    setTradeMatchingRatioUnder: (val: number) => void;
    tradeMatchingRatioOver1st: number;
    setTradeMatchingRatioOver1st: (val: number) => void;
    tradeMatchingRatioOver2nd: number;
    setTradeMatchingRatioOver2nd: (val: number) => void;
    restrictCashSendOver2ndApron: boolean;
    setRestrictCashSendOver2ndApron: (val: boolean) => void;
    restrictAggregationOver2ndApron: boolean;
    setRestrictAggregationOver2ndApron: (val: boolean) => void;
    restrictSignAndTradeAcquisitionOver1stApron: boolean;
    setRestrictSignAndTradeAcquisitionOver1stApron: (val: boolean) => void;
    freezePickAt2ndApron: boolean;
    setFreezePickAt2ndApron: (val: boolean) => void;
    restrictTPEProvenanceOver2ndApron: boolean;
    setRestrictTPEProvenanceOver2ndApron: (val: boolean) => void;
    twoWayContractsEnabled: boolean;
    setTwoWayContractsEnabled: (val: boolean) => void;
    nonGuaranteedContractsEnabled: boolean;
    setNonGuaranteedContractsEnabled: (val: boolean) => void;
    minPlayersPerTeam: number;
    setMinPlayersPerTeam: (val: number) => void;
    maxPlayersPerTeam: number;
    setMaxPlayersPerTeam: (val: number) => void;
    maxStandardPlayersPerTeam: number;
    setMaxStandardPlayersPerTeam: (val: number) => void;
    maxTwoWayPlayersPerTeam: number;
    setMaxTwoWayPlayersPerTeam: (val: number) => void;
    maxTrainingCampRoster: number;
    setMaxTrainingCampRoster: (val: number) => void;
    minContractType: string;
    setMinContractType: (val: string) => void;
    minContractStaticAmount: number;
    setMinContractStaticAmount: (val: number) => void;
    maxContractType: string;
    setMaxContractType: (val: string) => void;
    maxContractStaticPercentage: number;
    setMaxContractStaticPercentage: (val: number) => void;
    supermaxEnabled: boolean;
    setSupermaxEnabled: (val: boolean) => void;
    supermaxPercentage: number;
    setSupermaxPercentage: (val: number) => void;
    supermaxMinYears: number;
    setSupermaxMinYears: (val: number) => void;
    rookieExtEnabled: boolean;
    setRookieExtEnabled: (val: boolean) => void;
    rookieExtPct: number;
    setRookieExtPct: (val: number) => void;
    rookieExtRosePct: number;
    setRookieExtRosePct: (val: number) => void;
    birdRightsEnabled: boolean;
    setBirdRightsEnabled: (val: boolean) => void;
    minContractLength: number;
    setMinContractLength: (val: number) => void;
    maxContractLengthStandard: number;
    setMaxContractLengthStandard: (val: number) => void;
    maxContractLengthBird: number;
    setMaxContractLengthBird: (val: number) => void;
    playerOptionsEnabled: boolean;
    setPlayerOptionsEnabled: (val: boolean) => void;
    tenDayContractsEnabled: boolean;
    setTenDayContractsEnabled: (val: boolean) => void;
    rookieScaleType: string;
    setRookieScaleType: (val: string) => void;
    rookieStaticAmount: number;
    setRookieStaticAmount: (val: number) => void;
    rookieMaxContractPercentage: number;
    setRookieMaxContractPercentage: (val: number) => void;
    rookieScaleAppliesTo: string;
    setRookieScaleAppliesTo: (val: string) => void;
    rookieContractLength: number;
    setRookieContractLength: (val: number) => void;
    rookieTeamOptionsEnabled: boolean;
    setRookieTeamOptionsEnabled: (val: boolean) => void;
    rookieTeamOptionYears: number;
    setRookieTeamOptionYears: (val: number) => void;
    rookieRestrictedFreeAgentEligibility: boolean;
    setRookieRestrictedFreeAgentEligibility: (val: boolean) => void;
    rookieContractCapException: boolean;
    setRookieContractCapException: (val: boolean) => void;
    r2ContractsNonGuaranteed: boolean;
    setR2ContractsNonGuaranteed: (val: boolean) => void;
    inflationEnabled: boolean;
    setInflationEnabled: (val: boolean) => void;
    inflationMin: number;
    setInflationMin: (val: number) => void;
    inflationMax: number;
    setInflationMax: (val: number) => void;
    inflationAverage: number;
    setInflationAverage: (val: number) => void;
    inflationStdDev: number;
    setInflationStdDev: (val: number) => void;
    tradableDraftPickSeasons: number;
    setTradableDraftPickSeasons: (val: number) => void;
    stepienRuleEnabled: boolean;
    setStepienRuleEnabled: (val: boolean) => void;
    mleEnabled: boolean;
    setMleEnabled: (val: boolean) => void;
    roomMleAmount: number;
    setRoomMleAmount: (val: number) => void;
    nonTaxpayerMleAmount: number;
    setNonTaxpayerMleAmount: (val: number) => void;
    taxpayerMleAmount: number;
    setTaxpayerMleAmount: (val: number) => void;
    biannualEnabled: boolean;
    setBiannualEnabled: (val: boolean) => void;
    biannualAmount: number;
    setBiannualAmount: (val: number) => void;
    roomMlePercentage: number;
    setRoomMlePercentage: (val: number) => void;
    nonTaxpayerMlePercentage: number;
    setNonTaxpayerMlePercentage: (val: number) => void;
    taxpayerMlePercentage: number;
    setTaxpayerMlePercentage: (val: number) => void;
    biannualPercentage: number;
    setBiannualPercentage: (val: number) => void;
    tradeDeadlineMonth: number;
    setTradeDeadlineMonth: (val: number) => void;
    tradeDeadlineOrdinal: number;
    setTradeDeadlineOrdinal: (val: number) => void;
    tradeDeadlineDayOfWeek: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
    setTradeDeadlineDayOfWeek: (val: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat') => void;
    faStartMonth: number;
    setFaStartMonth: (val: number) => void;
    faStartDay: number;
    setFaStartDay: (val: number) => void;
    faMoratoriumDays: number;
    setFaMoratoriumDays: (val: number) => void;
    regularSeasonFAEnabled: boolean;
    setRegularSeasonFAEnabled: (val: boolean) => void;
    postDeadlineMultiYearContracts: boolean;
    setPostDeadlineMultiYearContracts: (val: boolean) => void;
    tradeExceptionsEnabled: boolean;
    setTradeExceptionsEnabled: (val: boolean) => void;
    disabledPlayerExceptionEnabled: boolean;
    setDisabledPlayerExceptionEnabled: (val: boolean) => void;
    rfaMatchingEnabled: boolean;
    setRfaMatchingEnabled: (val: boolean) => void;
    rfaMatchWindowDays: number;
    setRfaMatchWindowDays: (val: number) => void;
    rfaAutoDeclineOver2ndApron: boolean;
    setRfaAutoDeclineOver2ndApron: (val: boolean) => void;
    deadMoneyEnabled: boolean;
    setDeadMoneyEnabled: (val: boolean) => void;
    ngGuaranteeDeadlineMonth: number;
    setNgGuaranteeDeadlineMonth: (val: number) => void;
    ngGuaranteeDeadlineDay: number;
    setNgGuaranteeDeadlineDay: (val: number) => void;
    stretchProvisionEnabled: boolean;
    setStretchProvisionEnabled: (val: boolean) => void;
    stretchProvisionMultiplier: number;
    setStretchProvisionMultiplier: (val: number) => void;
    stretchedDeadMoneyCapPct: number;
    setStretchedDeadMoneyCapPct: (val: number) => void;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS: Array<'Sun'|'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'> = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const ORDINAL_LABELS = ['1st','2nd','3rd','4th','5th'];

const ToggleRow = ({ title, subtitle, checked, onChange }: { title: string; subtitle: string; checked: boolean; onChange: (next: boolean) => void }) => (
    <label className="flex items-center justify-between gap-4 cursor-pointer pt-3 border-t border-slate-800/60">
        <div className="flex flex-col">
            <span className="text-[11px] font-bold text-white">{title}</span>
            <span className="text-[9px] text-slate-500">{subtitle}</span>
        </div>
        <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-emerald-500' : 'bg-slate-700'}`}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
        </div>
    </label>
);

const RatioRow = ({ label, value, onChange, accent }: { label: string; value: number; onChange: (next: number) => void; accent: string }) => (
    <div className="bg-slate-900/60 rounded-2xl p-4 space-y-2 border border-slate-700/50">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="font-black uppercase tracking-widest">{label}</span>
            <span className={`font-black ${accent}`}>{value.toFixed(2)}x outgoing</span>
        </div>
        <input
            type="range"
            min="1"
            max="1.5"
            step="0.01"
            value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="w-full accent-indigo-500"
        />
    </div>
);

const ApronRulesCard = ({ props }: { props: EconomyTabProps }) => (
    <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-5">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-orange-400" />
                <h2 className="text-lg font-black text-white uppercase tracking-tight">Aprons</h2>
            </div>
            <button
                onClick={() => props.setApronsEnabled(!props.apronsEnabled)}
                className={`w-10 h-5 rounded-full transition-all duration-200 relative ${props.apronsEnabled ? 'bg-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-700'}`}
            >
                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.apronsEnabled ? 'left-6' : 'left-1'}`} />
            </button>
        </div>

        <div className={props.apronsEnabled ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none'}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-900/60 rounded-2xl p-3 border border-slate-700/50">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Count</span>
                    <select
                        value={props.numberOfAprons}
                        onChange={e => props.setNumberOfAprons(parseInt(e.target.value))}
                        className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 uppercase font-bold"
                    >
                        <option value="1">1 Apron</option>
                        <option value="2">2 Aprons</option>
                    </select>
                </div>
                <div className="bg-slate-900/60 rounded-2xl p-3 border border-slate-700/50">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">1st Apron</span>
                    <div className="mt-2 text-sm font-black text-orange-300">${((props.salaryCap * props.firstApronPercentage / 100) / 1_000_000).toFixed(2)}M</div>
                    <input type="range" min={props.luxuryTaxThresholdPercentage} max="250" step="0.1" value={props.firstApronPercentage}
                        onChange={e => props.setFirstApronPercentage(parseFloat(e.target.value))}
                        className="mt-2 w-full accent-orange-500" />
                    <div className="text-[9px] text-slate-500">{props.firstApronPercentage.toFixed(1)}% of cap</div>
                </div>
                <div className="bg-slate-900/60 rounded-2xl p-3 border border-slate-700/50">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">2nd Apron</span>
                    <div className="mt-2 text-sm font-black text-rose-300">${((props.salaryCap * props.secondApronPercentage / 100) / 1_000_000).toFixed(2)}M</div>
                    <input type="range" min={props.firstApronPercentage} max="300" step="0.1" value={props.secondApronPercentage}
                        disabled={props.numberOfAprons < 2}
                        onChange={e => props.setSecondApronPercentage(parseFloat(e.target.value))}
                        className="mt-2 w-full accent-rose-500 disabled:opacity-40" />
                    <div className="text-[9px] text-slate-500">{props.numberOfAprons > 1 ? `${props.secondApronPercentage.toFixed(1)}% of cap` : 'Disabled'}</div>
                </div>
            </div>

            <div className="pt-4 border-t border-slate-800/60 space-y-3">
                <div>
                    <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Apron-Tied Restrictions</h3>
                    <p className="text-[9px] text-slate-500 mt-1">Defaults mirror the 2023 NBA CBA. Toggle off for relaxed simulation saves.</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <RatioRow label="Below 1st Apron" value={props.tradeMatchingRatioUnder} onChange={props.setTradeMatchingRatioUnder} accent="text-emerald-300" />
                    <RatioRow label="Over 1st Apron" value={props.tradeMatchingRatioOver1st} onChange={props.setTradeMatchingRatioOver1st} accent="text-orange-300" />
                    <RatioRow label="Over 2nd Apron" value={props.tradeMatchingRatioOver2nd} onChange={props.setTradeMatchingRatioOver2nd} accent="text-rose-300" />
                </div>
                <ToggleRow
                    title="No Salary Aggregation Over 2nd Apron"
                    subtitle="Require second-apron teams to match incoming contracts one-for-one."
                    checked={props.restrictAggregationOver2ndApron}
                    onChange={props.setRestrictAggregationOver2ndApron}
                />
                <ToggleRow
                    title="Freeze 7th-Year 1st Over 2nd Apron"
                    subtitle="Block trading the first-round pick seven seasons out while projected over the second apron."
                    checked={props.freezePickAt2ndApron}
                    onChange={props.setFreezePickAt2ndApron}
                />
            </div>
        </div>
    </div>
);

export const EconomyTab: React.FC<EconomyTabProps> = (props) => {
    const { state } = useGame();
    const seasonYear = state.leagueStats?.year ?? new Date().getFullYear();
    const [showTaxRates, setShowTaxRates] = useState(false);
    const [isMinContractModalOpen, setIsMinContractModalOpen] = useState(false);
    const [isMaxContractModalOpen, setIsMaxContractModalOpen] = useState(false);
    const [isRookieContractModalOpen, setIsRookieContractModalOpen] = useState(false);

    // Live-preview resolved dates from the current inputs
    const previewStats = {
        tradeDeadlineMonth: props.tradeDeadlineMonth,
        tradeDeadlineOrdinal: props.tradeDeadlineOrdinal,
        tradeDeadlineDayOfWeek: props.tradeDeadlineDayOfWeek,
        faStartMonth: props.faStartMonth,
        faStartDay: props.faStartDay,
        faMoratoriumDays: props.faMoratoriumDays,
    };
    const resolvedTradeDeadline = toISODateString(getTradeDeadlineDate(seasonYear, previewStats));
    const resolvedFAStart = toISODateString(getFreeAgencyStartDate(seasonYear, previewStats));
    const resolvedMoratoriumEnd = toISODateString(getFreeAgencyMoratoriumEndDate(seasonYear, previewStats));

    return (
        <div className="space-y-12">
            <MinContractModal 
                isOpen={isMinContractModalOpen} 
                onClose={() => setIsMinContractModalOpen(false)} 
                baseAmount={props.minContractStaticAmount} 
            />
            <MaxContractModal 
                isOpen={isMaxContractModalOpen} 
                onClose={() => setIsMaxContractModalOpen(false)} 
                basePercentage={props.maxContractStaticPercentage} 
                salaryCap={props.salaryCap}
            />
            <RookieContractModal 
                isOpen={isRookieContractModalOpen} 
                onClose={() => setIsRookieContractModalOpen(false)} 
                basePercentage={props.rookieMaxContractPercentage} 
                scaleAppliesTo={props.rookieScaleAppliesTo} 
                salaryCap={props.salaryCap} 
            />

            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">League Economy</h1>
                <p className="text-xs text-slate-500 font-medium max-w-2xl">
                    Manage the financial structure of the league, from salary caps and luxury taxes to contract rules and team sizes.
                </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div className="space-y-8">
                    <EconomyFinancesSection props={props} />

                    <ApronRulesCard props={props} />

                    <EconomyTeamsSection props={props} />
                </div>

                <div className="space-y-8">
                    <EconomyContractsSection
                        props={props}
                        setIsMinContractModalOpen={setIsMinContractModalOpen}
                        setIsMaxContractModalOpen={setIsMaxContractModalOpen}
                    />
                    <EconomyRookieContractsSection
                        props={props}
                        setIsRookieContractModalOpen={setIsRookieContractModalOpen}
                    />

                    {/* Draft Picks — tradable seasons window */}
                    <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
                        <div className="flex items-center gap-2">
                            <Ticket size={16} className="text-amber-400" />
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Draft Picks</h2>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-bold uppercase tracking-wider">Tradable Future Seasons</span>
                                <span className="font-black text-amber-400">{props.tradableDraftPickSeasons} seasons out</span>
                            </div>
                            <input
                                type="range" min="1" max="7" step="1"
                                value={props.tradableDraftPickSeasons}
                                onChange={e => props.setTradableDraftPickSeasons(parseInt(e.target.value))}
                                className="w-full accent-amber-500"
                            />
                            <p className="text-[9px] text-slate-500 italic">
                                Teams can trade picks up to {props.tradableDraftPickSeasons} year{props.tradableDraftPickSeasons !== 1 ? 's' : ''} in the future. NBA default is 7.
                            </p>
                        </div>

                        {/* Stepien Rule */}
                        <label className="flex items-center justify-between cursor-pointer pt-3 border-t border-slate-800/60">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white">Stepien Rule</span>
                                <span className="text-[9px] text-slate-500">Block any trade that would leave a team with no 1st-round pick in two consecutive future drafts. Applies to GM and AI proposals.</span>
                            </div>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${props.stepienRuleEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <input
                                    type="checkbox"
                                    checked={props.stepienRuleEnabled}
                                    onChange={e => props.setStepienRuleEnabled(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.stepienRuleEnabled ? 'translate-x-5' : ''}`} />
                            </div>
                        </label>
                    </div>

                    {/* Trade Exceptions — TPE / DPE */}
                    <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
                        <div className="flex items-center gap-2">
                            <Coins size={16} className="text-emerald-400" />
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Trade Exceptions</h2>
                        </div>

                        {/* TPE — active */}
                        <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white">Trade Player Exceptions (TPE)</span>
                                <span className="text-[9px] text-slate-500">Over-cap teams that send out more salary than they receive bank a 1-year "coupon" to absorb a single contract.</span>
                            </div>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${props.tradeExceptionsEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <input
                                    type="checkbox"
                                    checked={props.tradeExceptionsEnabled}
                                    onChange={e => props.setTradeExceptionsEnabled(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.tradeExceptionsEnabled ? 'translate-x-5' : ''}`} />
                            </div>
                        </label>

                        <ToggleRow
                            title="2nd Apron Cash Send Ban"
                            subtitle="Teams projected over the second apron cannot send cash in trades."
                            checked={props.restrictCashSendOver2ndApron}
                            onChange={props.setRestrictCashSendOver2ndApron}
                        />

                        <ToggleRow
                            title="Sign-and-Trade Acquisition Gate"
                            subtitle="Teams projected over the first apron cannot acquire a same-day signing."
                            checked={props.restrictSignAndTradeAcquisitionOver1stApron}
                            onChange={props.setRestrictSignAndTradeAcquisitionOver1stApron}
                        />

                        <ToggleRow
                            title="2nd Apron TPE Provenance Gate"
                            subtitle="Second-apron teams can only use same-year plain TPEs."
                            checked={props.restrictTPEProvenanceOver2ndApron}
                            onChange={props.setRestrictTPEProvenanceOver2ndApron}
                        />

                        {/* DPE — placeholder */}
                        <label className="flex items-center justify-between cursor-pointer pt-3 border-t border-slate-800/60 opacity-60">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                                    <HeartPulse size={11} className="text-rose-400" />
                                    Disabled Player Exception (DPE)
                                    <span className="text-[8px] font-black uppercase tracking-wider bg-slate-700/60 text-slate-300 px-1 py-0.5 rounded">Coming soon</span>
                                </span>
                                <span className="text-[9px] text-slate-500">Replace a player who's out for the season. Apply by Jan 15, expires Mar 10. Not yet active.</span>
                            </div>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${props.disabledPlayerExceptionEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <input
                                    type="checkbox"
                                    checked={props.disabledPlayerExceptionEnabled}
                                    onChange={e => props.setDisabledPlayerExceptionEnabled(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.disabledPlayerExceptionEnabled ? 'translate-x-5' : ''}`} />
                            </div>
                        </label>
                    </div>

                    {/* Dead Money / Waivers */}
                    <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
                        <div className="flex items-center gap-2">
                            <Skull size={16} className="text-slate-400" />
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Dead Money & Waivers</h2>
                        </div>

                        <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white">Dead Money Enabled</span>
                                <span className="text-[9px] text-slate-500">Waiving a guaranteed contract keeps the salary on the cap. Off = free roster delete.</span>
                            </div>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${props.deadMoneyEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <input type="checkbox" checked={props.deadMoneyEnabled} onChange={e => props.setDeadMoneyEnabled(e.target.checked)} className="sr-only" />
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.deadMoneyEnabled ? 'translate-x-5' : ''}`} />
                            </div>
                        </label>

                        <div className={`space-y-2 pt-3 border-t border-slate-800/60 ${props.deadMoneyEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-bold uppercase tracking-wider">NG Guarantee Deadline</span>
                                <span className="font-black text-amber-400">{MONTH_NAMES[props.ngGuaranteeDeadlineMonth - 1]} {props.ngGuaranteeDeadlineDay}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <select value={props.ngGuaranteeDeadlineMonth} onChange={e => props.setNgGuaranteeDeadlineMonth(parseInt(e.target.value))}
                                    className="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-white">
                                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                </select>
                                <input type="number" min={1} max={31} value={props.ngGuaranteeDeadlineDay}
                                    onChange={e => props.setNgGuaranteeDeadlineDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                                    className="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-white" />
                            </div>
                            <p className="text-[9px] text-slate-500 italic">Waive an NG before this date = free release. After = full guaranteed dead money. NBA: Jan 10.</p>
                        </div>

                        <label className={`flex items-center justify-between cursor-pointer pt-3 border-t border-slate-800/60 ${props.deadMoneyEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white">Stretch Provision</span>
                                <span className="text-[9px] text-slate-500">Spread dead money over (multiplier × N) + 1 future seasons. Lowers annual hit, extends obligation.</span>
                            </div>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${props.stretchProvisionEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <input type="checkbox" checked={props.stretchProvisionEnabled} onChange={e => props.setStretchProvisionEnabled(e.target.checked)} className="sr-only" />
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.stretchProvisionEnabled ? 'translate-x-5' : ''}`} />
                            </div>
                        </label>

                        <div className={`space-y-2 pt-3 border-t border-slate-800/60 ${props.deadMoneyEnabled && props.stretchProvisionEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-bold uppercase tracking-wider">Stretch Multiplier</span>
                                <span className="font-black text-amber-400">{props.stretchProvisionMultiplier}× + 1 yr</span>
                            </div>
                            <input type="range" min={1} max={4} step={1} value={props.stretchProvisionMultiplier}
                                onChange={e => props.setStretchProvisionMultiplier(parseInt(e.target.value))}
                                className="w-full accent-amber-500" />
                            <p className="text-[9px] text-slate-500 italic">NBA = 2 (so 2N+1 years). Higher = more spread, longer tail.</p>
                        </div>

                        <div className={`space-y-2 ${props.deadMoneyEnabled && props.stretchProvisionEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-bold uppercase tracking-wider">Stretched-Dead-Money Cap</span>
                                <span className="font-black text-rose-400">{props.stretchedDeadMoneyCapPct}% of salary cap</span>
                            </div>
                            <input type="range" min={5} max={30} step={1} value={props.stretchedDeadMoneyCapPct}
                                onChange={e => props.setStretchedDeadMoneyCapPct(parseInt(e.target.value))}
                                className="w-full accent-rose-500" />
                            <p className="text-[9px] text-slate-500 italic">Total stretched dead money on the books may not exceed this. NBA: 15%.</p>
                        </div>
                    </div>

                    {/* Restricted Free Agent matching */}
                    <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={16} className="text-indigo-400" />
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Restricted Free Agency</h2>
                        </div>

                        {/* Master toggle */}
                        <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white">RFA Matching</span>
                                <span className="text-[9px] text-slate-500">Original team can match outside offer sheets to retain a restricted free agent.</span>
                            </div>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${props.rfaMatchingEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <input
                                    type="checkbox"
                                    checked={props.rfaMatchingEnabled}
                                    onChange={e => props.setRfaMatchingEnabled(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.rfaMatchingEnabled ? 'translate-x-5' : ''}`} />
                            </div>
                        </label>

                        {/* Match window */}
                        <div className={`space-y-2 pt-3 border-t border-slate-800/60 ${props.rfaMatchingEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-bold uppercase tracking-wider">Match Window</span>
                                <span className="font-black text-indigo-400">{props.rfaMatchWindowDays} day{props.rfaMatchWindowDays !== 1 ? 's' : ''}</span>
                            </div>
                            <input
                                type="range" min={1} max={7} step={1}
                                value={props.rfaMatchWindowDays}
                                onChange={e => props.setRfaMatchWindowDays(parseInt(e.target.value))}
                                className="w-full accent-indigo-500"
                            />
                            <p className="text-[9px] text-slate-500 italic">
                                Days the original team has to match an offer sheet. NBA default: 2.
                            </p>
                        </div>

                        {/* Auto-decline over 2nd apron */}
                        <label className={`flex items-center justify-between cursor-pointer pt-3 border-t border-slate-800/60 ${props.rfaMatchingEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white">Auto-Decline Over 2nd Apron</span>
                                <span className="text-[9px] text-slate-500">Skip matching offers that would push the team over the 2nd apron.</span>
                            </div>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${props.rfaAutoDeclineOver2ndApron ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <input
                                    type="checkbox"
                                    checked={props.rfaAutoDeclineOver2ndApron}
                                    onChange={e => props.setRfaAutoDeclineOver2ndApron(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.rfaAutoDeclineOver2ndApron ? 'translate-x-5' : ''}`} />
                            </div>
                        </label>
                    </div>

                    {/* Transaction Calendar — Trade Deadline + FA Window */}
                    <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-sky-400" />
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Transaction Calendar</h2>
                        </div>

                        {/* Trade Deadline */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trade Deadline</span>
                                <span className="font-black text-sky-400 text-xs">{resolvedTradeDeadline}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <select
                                    value={props.tradeDeadlineMonth}
                                    onChange={e => props.setTradeDeadlineMonth(parseInt(e.target.value))}
                                    className="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-white"
                                >
                                    {MONTH_NAMES.map((m, i) => (
                                        <option key={m} value={i + 1}>{m}</option>
                                    ))}
                                </select>
                                <select
                                    value={props.tradeDeadlineOrdinal}
                                    onChange={e => props.setTradeDeadlineOrdinal(parseInt(e.target.value))}
                                    className="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-white"
                                >
                                    {ORDINAL_LABELS.map((o, i) => (
                                        <option key={o} value={i + 1}>{o}</option>
                                    ))}
                                </select>
                                <select
                                    value={props.tradeDeadlineDayOfWeek}
                                    onChange={e => props.setTradeDeadlineDayOfWeek(e.target.value as any)}
                                    className="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-white"
                                >
                                    {DAY_LABELS.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>
                            <p className="text-[9px] text-slate-500 italic">
                                NBA default: 1st Thu of Feb. Resolved to a real weekday each season.
                            </p>
                        </div>

                        {/* Free Agency Start */}
                        <div className="space-y-3 pt-3 border-t border-slate-800/60">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Free Agency Opens</span>
                                <span className="font-black text-emerald-400 text-xs">{resolvedFAStart}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={props.faStartMonth}
                                    onChange={e => props.setFaStartMonth(parseInt(e.target.value))}
                                    className="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-white"
                                >
                                    {MONTH_NAMES.map((m, i) => (
                                        <option key={m} value={i + 1}>{m}</option>
                                    ))}
                                </select>
                                <input
                                    type="number" min={1} max={31}
                                    value={props.faStartDay}
                                    onChange={e => props.setFaStartDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                                    className="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-white"
                                />
                            </div>
                        </div>

                        {/* Moratorium */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-bold uppercase tracking-wider flex items-center gap-1">
                                    <Lock size={10} /> Moratorium
                                </span>
                                <span className="font-black text-amber-400">{props.faMoratoriumDays} days → lifts {resolvedMoratoriumEnd}</span>
                            </div>
                            <input
                                type="range" min={0} max={10} step={1}
                                value={props.faMoratoriumDays}
                                onChange={e => props.setFaMoratoriumDays(parseInt(e.target.value))}
                                className="w-full accent-amber-500"
                            />
                            <p className="text-[9px] text-slate-500 italic">
                                Negotiation-only window after FA opens. NBA default: 6 days.
                            </p>
                        </div>

                        {/* Year-round regular-season FA */}
                        <label className="flex items-center justify-between cursor-pointer pt-3 border-t border-slate-800/60">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white">Year-Round Regular Season FA</span>
                                <span className="text-[9px] text-slate-500">Buyouts, 10-days, open-roster signings allowed during season.</span>
                            </div>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${props.regularSeasonFAEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <input
                                    type="checkbox"
                                    checked={props.regularSeasonFAEnabled}
                                    onChange={e => props.setRegularSeasonFAEnabled(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.regularSeasonFAEnabled ? 'translate-x-5' : ''}`} />
                            </div>
                        </label>

                        {/* Post-deadline multi-year */}
                        <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white">Multi-Year Deals Past Trade Deadline</span>
                                <span className="text-[9px] text-slate-500">If off, post-deadline signings are 1-year only.</span>
                            </div>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${props.postDeadlineMultiYearContracts ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <input
                                    type="checkbox"
                                    checked={props.postDeadlineMultiYearContracts}
                                    onChange={e => props.setPostDeadlineMultiYearContracts(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${props.postDeadlineMultiYearContracts ? 'translate-x-5' : ''}`} />
                            </div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};
