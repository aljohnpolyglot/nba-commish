import React from 'react';
import { FileText, Info } from 'lucide-react';

const InfoTooltip = ({ text }: { text: string }) => (
    <div className="group relative inline-flex items-center justify-center ml-1">
        <Info size={12} className="text-slate-500 cursor-help hover:text-indigo-400 transition-colors" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none shadow-xl border border-slate-700 text-center leading-relaxed">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
        </div>
    </div>
);

export const EconomyContractsSection = ({ 
    props, 
    setIsMinContractModalOpen, 
    setIsMaxContractModalOpen 
}: { 
    props: any, 
    setIsMinContractModalOpen: (val: boolean) => void,
    setIsMaxContractModalOpen: (val: boolean) => void
}) => {
    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center gap-2">
                <FileText size={16} className="text-purple-400" />
                <h2 className="text-lg font-black text-white uppercase tracking-tight">Contracts</h2>
            </div>

            {/* Regular Contracts */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Regular Contracts</h3>
                
                <div className="flex flex-col gap-2">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Minimum Contracts</span>
                        <InfoTooltip text="None: No minimum salary. Static: All minimum contracts are the same amount. Dynamic: Minimum contract amount increases with a player's years of experience." />
                    </div>
                    <select 
                        value={props.minContractType} 
                        onChange={(e) => props.setMinContractType(e.target.value)} 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                    >
                        <option value="none">None</option>
                        <option value="static">Static</option>
                        <option value="dynamic">Dynamic (Years of Experience)</option>
                    </select>
                </div>

                {props.minContractType !== 'none' && (
                    props.minContractType === 'static' ? (
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount (Millions)</span>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    step="0.01"
                                    min="0"
                                    value={props.minContractStaticAmount} 
                                    onChange={(e) => props.setMinContractStaticAmount(Math.max(0, parseFloat(e.target.value)))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 pr-8 focus:outline-none focus:border-indigo-500"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">M</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Minimum Salary Floor (Millions)</span>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    step="0.01"
                                    min="0"
                                    value={props.minContractStaticAmount} 
                                    onChange={(e) => props.setMinContractStaticAmount(Math.max(0, parseFloat(e.target.value)))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 pr-8 focus:outline-none focus:border-indigo-500"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">M</span>
                            </div>
                            <button
                                onClick={() => setIsMinContractModalOpen(true)}
                                className="mt-2 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors"
                            >
                                See Computations
                            </button>
                        </div>
                    )
                )}

                <div className="flex flex-col gap-2 mt-4">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Maximum Contracts</span>
                        <InfoTooltip text="None: No maximum salary. Static: All max contracts are a fixed percentage of the salary cap. Service Tiered: Max contract percentage increases with a player's years of experience." />
                    </div>
                    <select 
                        value={props.maxContractType} 
                        onChange={(e) => props.setMaxContractType(e.target.value)} 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                    >
                        <option value="none">None</option>
                        <option value="static">Static</option>
                        <option value="service_tiered">Service Tiered</option>
                    </select>
                </div>

                {props.maxContractType !== 'none' && (
                    props.maxContractType === 'static' ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center text-[10px] text-slate-400">
                                <span>Max Percentage of Cap: {props.maxContractStaticPercentage}%</span>
                                <span className="font-bold text-emerald-400">${((props.salaryCap * props.maxContractStaticPercentage / 100) / 1000000).toFixed(3)}M</span>
                            </div>
                            <input 
                                type="range" 
                                min="10" 
                                max="50" 
                                value={props.maxContractStaticPercentage} 
                                onChange={(e) => props.setMaxContractStaticPercentage(parseInt(e.target.value))}
                                className="w-full accent-indigo-500"
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center text-[10px] text-slate-400">
                                <span>Base Max Percentage of Cap: {props.maxContractStaticPercentage}%</span>
                                <span className="font-bold text-emerald-400">${((props.salaryCap * props.maxContractStaticPercentage / 100) / 1000000).toFixed(3)}M</span>
                            </div>
                            <input 
                                type="range" 
                                min="10" 
                                max="50" 
                                value={props.maxContractStaticPercentage} 
                                onChange={(e) => props.setMaxContractStaticPercentage(parseInt(e.target.value))}
                                className="w-full accent-indigo-500"
                            />
                            <button
                                onClick={() => setIsMaxContractModalOpen(true)}
                                className="mt-2 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors"
                            >
                                See Computations
                            </button>
                        </div>
                    )
                )}
            </div>

            {/* Supermax */}
            {props.maxContractType !== 'none' && (
                <div className="pt-6 border-t border-slate-800/50 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Supermax</h3>
                            <InfoTooltip text="Allows teams to offer a higher max contract percentage to players who meet certain performance criteria (e.g., MVP, All-NBA)." />
                        </div>
                        <button 
                            onClick={() => props.setSupermaxEnabled(!props.supermaxEnabled)} 
                            className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.supermaxEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.supermaxEnabled ? 'left-4.5' : 'left-0.5'}`} />
                        </button>
                    </div>

                    {props.supermaxEnabled && (
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center text-[10px] text-slate-400">
                                <span>Supermax Percentage: {props.supermaxPercentage}%</span>
                                <span className="font-bold text-emerald-400">${((props.salaryCap * props.supermaxPercentage / 100) / 1000000).toFixed(3)}M</span>
                            </div>
                            <input 
                                type="range" 
                                min="25" 
                                max="50" 
                                value={props.supermaxPercentage} 
                                onChange={(e) => props.setSupermaxPercentage(parseInt(e.target.value))}
                                className="w-full accent-indigo-500"
                            />
                            <div className="flex flex-col gap-2 mt-3">
                                <div className="flex items-center">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Min Years of Service</span>
                                    <InfoTooltip text="Minimum seasons played to qualify for a supermax via awards. Players with 10+ years qualify automatically regardless of awards." />
                                </div>
                                <input
                                    type="number"
                                    min="1"
                                    max="9"
                                    value={props.supermaxMinYears}
                                    onChange={(e) => props.setSupermaxMinYears(Math.min(9, Math.max(1, parseInt(e.target.value) || 8)))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                                />
                                <p className="text-[9px] text-slate-500 italic">
                                    Eligible via MVP/DPOY (last 3 seasons) or All-NBA in preceding season or 2 of last 3. 10+ years: automatic.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Rookie Extensions (Derrick Rose Rule) */}
            {props.maxContractType !== 'none' && (
                <div className="pt-6 border-t border-slate-800/50 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Rookie Extensions</h3>
                            <InfoTooltip text="Designated Rookie Scale Extensions (Rose Rule). Players finishing their 3rd–4th season can sign 5-year extensions at 25% of cap, or 30% if they earned All-NBA, MVP, or DPOY." />
                        </div>
                        <button
                            onClick={() => props.setRookieExtEnabled(!props.rookieExtEnabled)}
                            className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.rookieExtEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.rookieExtEnabled ? 'left-4.5' : 'left-0.5'}`} />
                        </button>
                    </div>

                    {props.rookieExtEnabled && (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center text-[10px] text-slate-400">
                                    <span>Standard Max: {props.rookieExtPct}%</span>
                                    <span className="font-bold text-emerald-400">${((props.salaryCap * props.rookieExtPct / 100) / 1_000_000).toFixed(3)}M</span>
                                </div>
                                <input
                                    type="range"
                                    min="20"
                                    max="40"
                                    value={props.rookieExtPct}
                                    onChange={(e) => props.setRookieExtPct(parseInt(e.target.value))}
                                    className="w-full accent-indigo-500"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center text-[10px] text-slate-400">
                                    <span>Rose Rule (All-NBA/MVP/DPOY): {props.rookieExtRosePct}%</span>
                                    <span className="font-bold text-emerald-400">${((props.salaryCap * props.rookieExtRosePct / 100) / 1_000_000).toFixed(3)}M</span>
                                </div>
                                <input
                                    type="range"
                                    min="20"
                                    max="45"
                                    value={props.rookieExtRosePct}
                                    onChange={(e) => props.setRookieExtRosePct(Math.max(props.rookieExtPct, parseInt(e.target.value)))}
                                    className="w-full accent-indigo-500"
                                />
                                <p className="text-[9px] text-slate-500 italic">
                                    All-NBA in preceding season or 2 of last 3 · DPOY same · MVP once in last 3 seasons.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Contract Conditions */}
            <div className="pt-6 border-t border-slate-800/50 space-y-4">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Contract Conditions</h3>
                
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Allow Bird Rights</span>
                        <InfoTooltip text="Allows teams to exceed the salary cap to re-sign their own veteran free agents." />
                    </div>
                    <button 
                        onClick={() => props.setBirdRightsEnabled(!props.birdRightsEnabled)} 
                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.birdRightsEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.birdRightsEnabled ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                </div>

                <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Minimum Contract Length (Years)</span>
                    <input 
                        type="number" 
                        min="1"
                        value={props.minContractLength} 
                        onChange={(e) => props.setMinContractLength(Math.max(1, parseInt(e.target.value)))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                    />
                </div>

                {!props.birdRightsEnabled ? (
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Length (Years)</span>
                        <input 
                            type="number" 
                            min={props.minContractLength}
                            value={props.maxContractLengthStandard} 
                            onChange={(e) => props.setMaxContractLengthStandard(Math.max(props.minContractLength, parseInt(e.target.value)))}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Standard Max</span>
                                <InfoTooltip text="Maximum contract length for players signing with a new team or without Bird Rights." />
                            </div>
                            <input 
                                type="number" 
                                min={props.minContractLength}
                                value={props.maxContractLengthStandard} 
                                onChange={(e) => props.setMaxContractLengthStandard(Math.max(props.minContractLength, parseInt(e.target.value)))}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bird Rights Max</span>
                                <InfoTooltip text="Maximum contract length for players re-signing with their current team using Bird Rights (typically longer than standard max)." />
                            </div>
                            <input 
                                type="number" 
                                min={props.maxContractLengthStandard}
                                value={props.maxContractLengthBird} 
                                onChange={(e) => props.setMaxContractLengthBird(Math.max(props.maxContractLengthStandard, parseInt(e.target.value)))}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Player Options</span>
                        <InfoTooltip text="Allows a player to decide whether to stay for another year or become a free agent." />
                    </div>
                    <button 
                        onClick={() => props.setPlayerOptionsEnabled(!props.playerOptionsEnabled)} 
                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.playerOptionsEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.playerOptionsEnabled ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                </div>
            </div>

            {/* Miscellaneous */}
            <div className="pt-6 border-t border-slate-800/50 space-y-4">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Miscellaneous</h3>
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Allow 10-Day Contracts</span>
                        <InfoTooltip text="Short-term contracts allowing teams to sign players for 10 days or 3 games, whichever is longer." />
                    </div>
                    <button
                        onClick={() => props.setTenDayContractsEnabled(!props.tenDayContractsEnabled)}
                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.tenDayContractsEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.tenDayContractsEnabled ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                </div>
            </div>

            {/* Cap Exceptions (MLE / Biannual) */}
            <div className="pt-6 border-t border-slate-800/50 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Cap Exceptions</h3>
                        <InfoTooltip text="Mid-Level Exceptions (MLE) allow teams over the salary cap to sign free agents up to a set dollar amount. Three tiers exist based on team payroll relative to the cap and aprons. Can be split across multiple signings as long as the total doesn't exceed the limit." />
                    </div>
                    <button
                        onClick={() => props.setMleEnabled(!props.mleEnabled)}
                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.mleEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.mleEnabled ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                </div>

                {props.mleEnabled && (() => {
                    // MLE / Biannual are driven by % of salary cap so they scale automatically when cap grows.
                    const cap = props.salaryCap || 154_647_000;
                    const dollars = (pct: number) => (cap * pct / 100);
                    const setRoomPct = (pct: number) => {
                        props.setRoomMlePercentage(pct);
                        props.setRoomMleAmount(Math.round(dollars(pct)));
                    };
                    const setNtPct = (pct: number) => {
                        props.setNonTaxpayerMlePercentage(pct);
                        props.setNonTaxpayerMleAmount(Math.round(dollars(pct)));
                    };
                    const setTaxPct = (pct: number) => {
                        props.setTaxpayerMlePercentage(pct);
                        props.setTaxpayerMleAmount(Math.round(dollars(pct)));
                    };
                    const setBiaPct = (pct: number) => {
                        props.setBiannualPercentage(pct);
                        props.setBiannualAmount(Math.round(dollars(pct)));
                    };
                    return (
                    <div className="space-y-4">
                        {/* Room MLE */}
                        <div className="bg-slate-900/60 rounded-2xl p-4 space-y-2 border border-slate-700/50">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Room MLE</span>
                                <InfoTooltip text="Available when team is below the salary cap. % of cap — scales automatically when the cap changes." />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>{props.roomMlePercentage.toFixed(2)}% of cap → <span className="text-emerald-400 font-bold">${(dollars(props.roomMlePercentage) / 1_000_000).toFixed(3)}M</span></span>
                                <span className="text-slate-600 italic">Below salary cap</span>
                            </div>
                            <input
                                type="range" min="0" max="15" step="0.01"
                                value={props.roomMlePercentage}
                                onChange={e => setRoomPct(parseFloat(e.target.value))}
                                className="w-full accent-emerald-500"
                            />
                        </div>

                        {/* Non-Taxpayer MLE */}
                        <div className="bg-slate-900/60 rounded-2xl p-4 space-y-2 border border-slate-700/50">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Non-Taxpayer MLE</span>
                                <InfoTooltip text="Available when team is above cap but below the 1st apron. % of cap." />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>{props.nonTaxpayerMlePercentage.toFixed(2)}% of cap → <span className="text-blue-400 font-bold">${(dollars(props.nonTaxpayerMlePercentage) / 1_000_000).toFixed(3)}M</span></span>
                                <span className="text-slate-600 italic">Over cap, below 1st apron</span>
                            </div>
                            <input
                                type="range" min="0" max="20" step="0.01"
                                value={props.nonTaxpayerMlePercentage}
                                onChange={e => setNtPct(parseFloat(e.target.value))}
                                className="w-full accent-blue-500"
                            />
                        </div>

                        {/* Taxpayer MLE */}
                        <div className="bg-slate-900/60 rounded-2xl p-4 space-y-2 border border-slate-700/50">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-yellow-400 uppercase tracking-widest">Taxpayer MLE</span>
                                <InfoTooltip text="Available when a signing crosses the 1st apron, team stays below the 2nd. % of cap." />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>{props.taxpayerMlePercentage.toFixed(2)}% of cap → <span className="text-yellow-400 font-bold">${(dollars(props.taxpayerMlePercentage) / 1_000_000).toFixed(3)}M</span></span>
                                <span className="text-slate-600 italic">Crosses 1st apron, below 2nd</span>
                            </div>
                            <input
                                type="range" min="0" max="10" step="0.01"
                                value={props.taxpayerMlePercentage}
                                onChange={e => setTaxPct(parseFloat(e.target.value))}
                                className="w-full accent-yellow-500"
                            />
                        </div>

                        {/* Biannual Exception */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Biannual Exception</span>
                                <InfoTooltip text="A smaller exception available every other year to teams below the 1st apron. Cannot be combined with any MLE." />
                            </div>
                            <button
                                onClick={() => props.setBiannualEnabled(!props.biannualEnabled)}
                                className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.biannualEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.biannualEnabled ? 'left-4.5' : 'left-0.5'}`} />
                            </button>
                        </div>
                        {props.biannualEnabled && (
                            <div className="bg-slate-900/60 rounded-2xl p-4 space-y-2 border border-slate-700/50">
                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span>{props.biannualPercentage.toFixed(2)}% of cap → <span className="text-slate-300 font-bold">${(dollars(props.biannualPercentage) / 1_000_000).toFixed(3)}M</span></span>
                                    <span className="text-slate-600 italic">Every other season</span>
                                </div>
                                <input
                                    type="range" min="0" max="8" step="0.01"
                                    value={props.biannualPercentage}
                                    onChange={e => setBiaPct(parseFloat(e.target.value))}
                                    className="w-full accent-slate-500"
                                />
                            </div>
                        )}
                    </div>
                    );
                })()}
            </div>
        </div>
    );
};
