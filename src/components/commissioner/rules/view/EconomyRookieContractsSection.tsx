import React from 'react';
import { Info } from 'lucide-react';

const InfoTooltip = ({ text }: { text: string }) => (
    <div className="group relative inline-flex items-center justify-center ml-1">
        <Info size={12} className="text-slate-500 cursor-help hover:text-indigo-400 transition-colors" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none shadow-xl border border-slate-700 text-center leading-relaxed">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
        </div>
    </div>
);

export const EconomyRookieContractsSection = ({ 
    props, 
    setIsRookieContractModalOpen 
}: { 
    props: any, 
    setIsRookieContractModalOpen: (val: boolean) => void 
}) => {
    if (props.draftType === 'no_draft') return null;

    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Rookie Contracts</h3>
            
            <div className="flex flex-col gap-2">
                <div className="flex items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rookie Salary</span>
                    <InfoTooltip text="None: No specific rookie salary scale. Static: All rookies get the same amount. Dynamic: Salary is based on draft position (scale)." />
                </div>
                <select 
                    value={props.rookieScaleType} 
                    onChange={(e) => props.setRookieScaleType(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                >
                    <option value="none">None</option>
                    <option value="static">Static</option>
                    <option value="dynamic">Dynamic (Draft Position)</option>
                </select>
            </div>

            {props.rookieScaleType !== 'none' && (
                <>
                    {props.rookieScaleType === 'static' ? (
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount (Millions)</span>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    step="0.1"
                                    value={props.rookieStaticAmount} 
                                    onChange={(e) => props.setRookieStaticAmount(parseFloat(e.target.value))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 pr-8 focus:outline-none focus:border-indigo-500"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">M</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Rookie Contract (First Pick Salary)</span>
                                <InfoTooltip text="The salary for the #1 overall pick, expressed as a percentage of the salary cap. Subsequent picks decrease by 5.42% each." />
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-slate-400">
                                <span>% of Cap: {props.rookieMaxContractPercentage}%</span>
                                <span className="font-bold text-emerald-400">${((props.salaryCap * props.rookieMaxContractPercentage / 100) / 1000000).toFixed(3)}M</span>
                            </div>
                            <input 
                                type="range" 
                                min="1" 
                                max="35" 
                                value={props.rookieMaxContractPercentage} 
                                onChange={(e) => props.setRookieMaxContractPercentage(parseInt(e.target.value))}
                                className="w-full accent-indigo-500"
                            />
                        </div>
                    )}

                    {props.rookieScaleType === 'dynamic' && (
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setIsRookieContractModalOpen(true)}
                                className="mt-2 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors"
                            >
                                See Computations
                            </button>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rookie Contract Eligible</span>
                        <select 
                            value={props.rookieScaleAppliesTo} 
                            onChange={(e) => props.setRookieScaleAppliesTo(e.target.value)} 
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                        >
                            <option value="first_round">First Round Only</option>
                            <option value="both_rounds">Both Rounds</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contract Length (Years)</span>
                        <input 
                            type="number" 
                            value={props.rookieContractLength} 
                            onChange={(e) => props.setRookieContractLength(parseInt(e.target.value))}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team Options</span>
                            <InfoTooltip text="Allows the team to extend the rookie contract for additional years at a predetermined salary." />
                        </div>
                        <button 
                            onClick={() => props.setRookieTeamOptionsEnabled(!props.rookieTeamOptionsEnabled)} 
                            className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.rookieTeamOptionsEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.rookieTeamOptionsEnabled ? 'left-4.5' : 'left-0.5'}`} />
                        </button>
                    </div>

                    {props.rookieTeamOptionsEnabled && (
                        <div className="flex flex-col gap-2 pl-4 border-l-2 border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team Option Years</span>
                            <input 
                                type="number" 
                                value={props.rookieTeamOptionYears} 
                                onChange={(e) => props.setRookieTeamOptionYears(parseInt(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                            />
                            
                            <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Restricted Free Agent Eligibility</span>
                                    <InfoTooltip text="If enabled, the team can match any offer sheet the player signs with another team after their rookie contract expires." />
                                </div>
                                <button 
                                    onClick={() => props.setRookieRestrictedFreeAgentEligibility(!props.rookieRestrictedFreeAgentEligibility)} 
                                    className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.rookieRestrictedFreeAgentEligibility ? 'bg-indigo-500' : 'bg-slate-700'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.rookieRestrictedFreeAgentEligibility ? 'left-4.5' : 'left-0.5'}`} />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800/50">
                <div className="flex items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Non-Guaranteed R2 Contracts</span>
                    <InfoTooltip text="2nd round rookies sign non-guaranteed deals. Teams can waive them for free before Oct 22. Players who survive to Jan 10 are automatically guaranteed." />
                </div>
                <button
                    onClick={() => props.setR2ContractsNonGuaranteed(!(props.r2ContractsNonGuaranteed ?? true))}
                    className={`w-8 h-4 rounded-full transition-all duration-200 relative ${(props.r2ContractsNonGuaranteed ?? true) ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${(props.r2ContractsNonGuaranteed ?? true) ? 'left-4.5' : 'left-0.5'}`} />
                </button>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800/50">
                <div className="flex items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rookie Contract Cap Exception</span>
                    <InfoTooltip text="Allows teams to sign their first-round draft picks even if they are over the salary cap." />
                </div>
                <button
                    onClick={() => props.setRookieContractCapException(!props.rookieContractCapException)}
                    className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.rookieContractCapException ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.rookieContractCapException ? 'left-4.5' : 'left-0.5'}`} />
                </button>
            </div>
        </div>
    );
};
