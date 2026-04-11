import React, { useState } from 'react';
import { MinContractModal, MaxContractModal, RookieContractModal } from './EconomyComputationsModals';
import { EconomyFinancesSection } from './EconomyFinancesSection';
import { EconomyTeamsSection } from './EconomyTeamsSection';
import { EconomyContractsSection } from './EconomyContractsSection';
import { EconomyRookieContractsSection } from './EconomyRookieContractsSection';
import { Ticket } from 'lucide-react';

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
    minPlayersPerTeam: number;
    setMinPlayersPerTeam: (val: number) => void;
    maxPlayersPerTeam: number;
    setMaxPlayersPerTeam: (val: number) => void;
    maxStandardPlayersPerTeam: number;
    setMaxStandardPlayersPerTeam: (val: number) => void;
    maxTwoWayPlayersPerTeam: number;
    setMaxTwoWayPlayersPerTeam: (val: number) => void;
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
}

export const EconomyTab: React.FC<EconomyTabProps> = (props) => {
    const [showTaxRates, setShowTaxRates] = useState(false);
    const [isMinContractModalOpen, setIsMinContractModalOpen] = useState(false);
    const [isMaxContractModalOpen, setIsMaxContractModalOpen] = useState(false);
    const [isRookieContractModalOpen, setIsRookieContractModalOpen] = useState(false);

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
                </div>
            </div>
        </div>
    );
};
