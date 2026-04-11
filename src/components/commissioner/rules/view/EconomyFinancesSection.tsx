import React from 'react';
import { DollarSign, Info, Lock, Tv, TrendingUp } from 'lucide-react';
import { useGame } from '../../../../store/GameContext';

const InfoTooltip = ({ text }: { text: string }) => (
    <div className="group relative inline-flex items-center justify-center ml-1">
        <Info size={12} className="text-slate-500 cursor-help hover:text-indigo-400 transition-colors" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none shadow-xl border border-slate-700 text-center leading-relaxed">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
        </div>
    </div>
);

export const EconomyFinancesSection = ({ props }: { props: any }) => {
    const { state } = useGame();
    const mediaRights  = state.leagueStats.mediaRights;
    const dealLocked   = mediaRights?.isLocked === true;
    const broadcastCap = dealLocked ? mediaRights?.salaryCap : null; // $M value from broadcasting
    const totalRev     = dealLocked ? mediaRights?.totalRev : null;

    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <DollarSign size={16} className="text-emerald-400" />
                    <h2 className="text-lg font-black text-white uppercase tracking-tight">Finances</h2>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Enable Salary Cap</span>
                    <button 
                        onClick={() => props.setSalaryCapEnabled(!props.salaryCapEnabled)} 
                        className={`w-10 h-5 rounded-full transition-all duration-200 relative ${props.salaryCapEnabled ? 'bg-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.salaryCapEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                </div>
            </div>

            {props.salaryCapEnabled && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Salary Cap Amount</span>
                                <InfoTooltip text="The maximum amount a team can spend on player salaries. When a Broadcasting Deal is locked, this is derived from league revenue." />
                            </div>
                            {dealLocked && (
                                <div className="flex items-center gap-1 text-[9px] font-bold text-sky-400">
                                    <Tv size={10} /> Broadcasting Deal
                                </div>
                            )}
                        </div>

                        {dealLocked ? (
                            // Read-only display — cap is driven by broadcasting revenue
                            <div className="bg-slate-950 border border-sky-500/30 rounded-xl px-3 py-2.5 flex items-center justify-between">
                                <div>
                                    <div className="text-lg font-black text-sky-400">
                                        ${(props.salaryCap / 1_000_000).toFixed(1)}M
                                    </div>
                                    <div className="text-[9px] text-slate-500 mt-0.5">
                                        {totalRev != null
                                            ? `$${totalRev.toFixed(2)}B revenue × ${((props.salaryCap / 1_000_000) / totalRev * 100).toFixed(1)}% per-team share`
                                            : 'Derived from Broadcasting Deal'
                                        }
                                    </div>
                                </div>
                                <Lock size={14} className="text-sky-500/60" />
                            </div>
                        ) : (
                            // Editable when no deal is locked
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                <input
                                    type="number"
                                    value={props.salaryCap / 1000000}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val) && val >= 0) props.setSalaryCap(val * 1000000);
                                    }}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 pl-8 pr-8 focus:outline-none focus:border-indigo-500"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">M</span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Salary Cap Type</span>
                            <InfoTooltip text="Soft cap allows teams to exceed the limit using exceptions (like Bird Rights). Hard cap is a strict limit that cannot be exceeded under any circumstances." />
                        </div>
                        <select 
                            value={props.salaryCapType} 
                            onChange={(e) => props.setSalaryCapType(e.target.value)} 
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                        >
                            <option value="soft">Soft Cap</option>
                            <option value="hard">Hard Cap</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Minimum Payroll</span>
                                <InfoTooltip text="The minimum amount a team must spend on player salaries, calculated as a percentage of the salary cap." />
                            </div>
                            <button 
                                onClick={() => props.setMinimumPayrollEnabled(!props.minimumPayrollEnabled)} 
                                className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.minimumPayrollEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.minimumPayrollEnabled ? 'left-4.5' : 'left-0.5'}`} />
                            </button>
                        </div>
                        {props.minimumPayrollEnabled && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex justify-between items-center text-[10px] text-slate-400">
                                    <span>% of Cap: {props.minimumPayrollPercentage}%</span>
                                    <span className="font-bold text-emerald-400">${((props.salaryCap * props.minimumPayrollPercentage / 100) / 1000000).toFixed(3)}M</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="50" 
                                    max="100" 
                                    value={props.minimumPayrollPercentage} 
                                    onChange={(e) => props.setMinimumPayrollPercentage(parseInt(e.target.value))}
                                    className="w-full accent-indigo-500"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Luxury Tax</span>
                                <InfoTooltip text="A penalty tax applied to teams whose payroll exceeds a specific threshold above the salary cap." />
                            </div>
                            <button 
                                onClick={() => props.setLuxuryTaxEnabled(!props.luxuryTaxEnabled)} 
                                className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.luxuryTaxEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.luxuryTaxEnabled ? 'left-4.5' : 'left-0.5'}`} />
                            </button>
                        </div>
                        {props.luxuryTaxEnabled && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-[10px] text-slate-400">
                                        <span>Threshold: {props.luxuryTaxThresholdPercentage}% of Cap</span>
                                        <span className="font-bold text-emerald-400">${((props.salaryCap * props.luxuryTaxThresholdPercentage / 100) / 1000000).toFixed(3)}M</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="100" 
                                        max="200" 
                                        step="0.1"
                                        value={props.luxuryTaxThresholdPercentage} 
                                        onChange={(e) => props.setLuxuryTaxThresholdPercentage(parseFloat(e.target.value))}
                                        className="w-full accent-indigo-500"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {props.luxuryTaxEnabled && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aprons</span>
                                    <InfoTooltip text="Additional spending thresholds above the luxury tax line that trigger severe roster-building restrictions." />
                                </div>
                                <button 
                                    onClick={() => props.setApronsEnabled(!props.apronsEnabled)} 
                                    className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.apronsEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.apronsEnabled ? 'left-4.5' : 'left-0.5'}`} />
                                </button>
                            </div>
                            {props.apronsEnabled && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Number of Aprons</span>
                                        <select 
                                            value={props.numberOfAprons} 
                                            onChange={(e) => props.setNumberOfAprons(parseInt(e.target.value))} 
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                                        >
                                            <option value="1">1 Apron</option>
                                            <option value="2">2 Aprons</option>
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">First Apron</span>
                                            <InfoTooltip text="Sign-and-Trade Restrictions: Cannot acquire a player via sign-and-trade if the team is over the apron. Bi-Annual Exception: Cannot use the Bi-Annual Exception. Mid-Level Exception (MLE): Limited to the Taxpayer MLE, which is smaller and shorter than the Non-Taxpayer MLE. Buyout Market: Cannot sign a player waived during the season if their pre-waiver salary was larger than the Non-Taxpayer MLE. Salary Matching in Trades: Cannot take back more salary in a trade than they send out (100% matching rule, down from 125%). Trade Exceptions: Cannot use pre-existing trade exceptions generated in prior seasons." />
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                                            <span>{props.firstApronPercentage}% of Cap</span>
                                            <span className="font-bold text-emerald-400">${((props.salaryCap * props.firstApronPercentage / 100) / 1000000).toFixed(3)}M</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min={props.luxuryTaxThresholdPercentage} 
                                            max="250" 
                                            step="0.1"
                                            value={props.firstApronPercentage} 
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                if (val >= props.luxuryTaxThresholdPercentage) props.setFirstApronPercentage(val);
                                            }}
                                            className="w-full accent-indigo-500"
                                        />
                                    </div>

                                    {props.numberOfAprons > 1 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Second Apron</span>
                                                <InfoTooltip text="All First Apron Restrictions Apply. No Mid-Level Exception (MLE): Cannot use any MLE, including the Taxpayer MLE. Aggregating Salaries in Trades: Cannot combine multiple players' salaries in a trade to acquire a more expensive player. Sending Cash in Trades: Cannot send cash considerations to another team in a trade. Trading First-Round Picks (7 Years Out): If a team stays over the second apron for multiple years, their first-round pick 7 years in the future becomes frozen (cannot be traded). If they remain over the apron, that pick automatically moves to the end of the first round, regardless of their record." />
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-slate-400">
                                                <span>{props.secondApronPercentage}% of Cap</span>
                                                <span className="font-bold text-emerald-400">${((props.salaryCap * props.secondApronPercentage / 100) / 1000000).toFixed(3)}M</span>
                                            </div>
                                            <input 
                                                type="range" 
                                                min={props.firstApronPercentage} 
                                                max="300" 
                                                step="0.1"
                                                value={props.secondApronPercentage} 
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    if (val >= props.firstApronPercentage) props.setSecondApronPercentage(val);
                                                }}
                                                className="w-full accent-indigo-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Cap Inflation Section */}
            <div className="pt-4 border-t border-slate-800/50 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp size={13} className="text-emerald-400" />
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Cap Inflation</span>
                        <InfoTooltip text="Each season at rollover, the salary cap and all thresholds inflate by a random % drawn from a normal distribution within the Min–Max range. Mimics real CBA revenue growth." />
                    </div>
                    <button
                        onClick={() => props.setInflationEnabled(!props.inflationEnabled)}
                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.inflationEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.inflationEnabled ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                </div>
                {props.inflationEnabled && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Min %</span>
                                <input type="number" min="0" max={props.inflationMax} step="0.5"
                                    value={props.inflationMin}
                                    onChange={e => props.setInflationMin(Math.max(0, parseFloat(e.target.value) || 0))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-1.5 px-3 focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Max %</span>
                                <input type="number" min={props.inflationMin} max="20" step="0.5"
                                    value={props.inflationMax}
                                    onChange={e => props.setInflationMax(Math.max(props.inflationMin, parseFloat(e.target.value) || 0))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-1.5 px-3 focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Mean %</span>
                                <input type="number" min={props.inflationMin} max={props.inflationMax} step="0.1"
                                    value={props.inflationAverage}
                                    onChange={e => props.setInflationAverage(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-1.5 px-3 focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Std Dev %</span>
                                <input type="number" min="0" max="5" step="0.1"
                                    value={props.inflationStdDev}
                                    onChange={e => props.setInflationStdDev(Math.max(0, parseFloat(e.target.value) || 0))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-1.5 px-3 focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>
                        <p className="text-[9px] text-slate-500 italic">
                            Each offseason cap inflates by ~{props.inflationAverage}% ± {props.inflationStdDev}%, between {props.inflationMin}%–{props.inflationMax}%. Affects cap, luxury tax, aprons, and min contract.
                        </p>
                    </div>
                )}
            </div>

            {/* Live threshold summary — always visible when salary cap is enabled */}
            {props.salaryCapEnabled && (
                <div className="bg-slate-900/60 rounded-2xl p-4 border border-slate-700/30 space-y-2">
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">
                        Derived Thresholds — {state.leagueStats.year}–{state.leagueStats.year + 1}
                    </div>
                    {[
                        { label: 'Salary Cap',   val: props.salaryCap / 1_000_000,                                                          color: 'text-sky-400',    bar: 'bg-sky-400' },
                        { label: 'Luxury Tax',   val: props.salaryCap * (props.luxuryTaxThresholdPercentage ?? 121.5) / 100 / 1_000_000,    color: 'text-yellow-400', bar: 'bg-yellow-400' },
                        { label: '1st Apron',    val: props.salaryCapEnabled && props.apronsEnabled ? props.salaryCap * (props.firstApronPercentage ?? 126.7) / 100 / 1_000_000 : null, color: 'text-orange-400', bar: 'bg-orange-400' },
                        { label: '2nd Apron',    val: props.salaryCapEnabled && props.apronsEnabled && props.numberOfAprons > 1 ? props.salaryCap * (props.secondApronPercentage ?? 134.4) / 100 / 1_000_000 : null, color: 'text-rose-400', bar: 'bg-rose-400' },
                        { label: 'Min Payroll',  val: props.minimumPayrollEnabled ? props.salaryCap * (props.minimumPayrollPercentage ?? 90) / 100 / 1_000_000 : null, color: 'text-slate-400', bar: 'bg-slate-400' },
                    ].filter(row => row.val != null).map(row => (
                        <div key={row.label} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 w-24 flex-shrink-0">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.bar}`} />
                                <span className="text-[10px] text-slate-400">{row.label}</span>
                            </div>
                            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${row.bar} opacity-60`}
                                    style={{ width: `${Math.min((row.val! / ((props.salaryCap * (props.secondApronPercentage ?? 134.4) / 100 / 1_000_000) * 1.05)) * 100, 100)}%` }}
                                />
                            </div>
                            <span className={`text-[10px] font-black w-16 text-right tabular-nums ${row.color}`}>
                                ${row.val!.toFixed(1)}M
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
