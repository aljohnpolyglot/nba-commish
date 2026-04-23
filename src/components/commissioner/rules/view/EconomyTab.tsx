import React, { useState } from 'react';
import { MinContractModal, MaxContractModal, RookieContractModal } from './EconomyComputationsModals';
import { EconomyFinancesSection } from './EconomyFinancesSection';
import { EconomyTeamsSection } from './EconomyTeamsSection';
import { EconomyContractsSection } from './EconomyContractsSection';
import { EconomyRookieContractsSection } from './EconomyRookieContractsSection';
import { Ticket, Calendar, Lock } from 'lucide-react';
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
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS: Array<'Sun'|'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'> = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const ORDINAL_LABELS = ['1st','2nd','3rd','4th','5th'];

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
