import React from 'react';
import { Users, Info } from 'lucide-react';

const InfoTooltip = ({ text }: { text: string }) => (
    <div className="group relative inline-flex items-center justify-center ml-1">
        <Info size={12} className="text-slate-500 cursor-help hover:text-indigo-400 transition-colors" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none shadow-xl border border-slate-700 text-center leading-relaxed">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
        </div>
    </div>
);

export const EconomyTeamsSection = ({ props }: { props: any }) => {
    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center gap-2">
                <Users size={16} className="text-sky-400" />
                <h2 className="text-lg font-black text-white uppercase tracking-tight">Teams</h2>
            </div>

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Allow Two-Way Contracts</span>
                        <InfoTooltip text="Contracts that allow players to play for both the NBA team and their G League affiliate." />
                    </div>
                    <button 
                        onClick={() => props.setTwoWayContractsEnabled(!props.twoWayContractsEnabled)} 
                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.twoWayContractsEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.twoWayContractsEnabled ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Minimum Players Per Team</span>
                        <InfoTooltip text="The minimum number of players a team must have on their roster (not the number to start a regulation game)." />
                    </div>
                    <input 
                        type="number" 
                        min="1"
                        value={props.minPlayersPerTeam} 
                        onChange={(e) => props.setMinPlayersPerTeam(Math.max(1, parseInt(e.target.value)))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                    />
                </div>

                {!props.twoWayContractsEnabled ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Players Per Team</span>
                            <InfoTooltip text="The maximum number of players on standard NBA contracts." />
                        </div>
                        <input 
                            type="number" 
                            min={props.minPlayersPerTeam}
                            value={props.maxPlayersPerTeam} 
                            onChange={(e) => props.setMaxPlayersPerTeam(Math.max(props.minPlayersPerTeam, parseInt(e.target.value)))}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Standard Contract Players</span>
                                    <InfoTooltip text="The maximum number of players on standard NBA contracts." />
                                </div>
                                <span className="text-[10px] font-bold text-emerald-400">Total: {props.maxStandardPlayersPerTeam + props.maxTwoWayPlayersPerTeam}</span>
                            </div>
                            <input 
                                type="number" 
                                min={props.minPlayersPerTeam}
                                value={props.maxStandardPlayersPerTeam} 
                                onChange={(e) => props.setMaxStandardPlayersPerTeam(Math.max(props.minPlayersPerTeam, parseInt(e.target.value)))}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Two-Way Players</span>
                                    <InfoTooltip text="The maximum number of players on two-way contracts (spending time between the NBA and G League)." />
                                </div>
                                <span className="text-[10px] font-bold text-emerald-400">Total: {props.maxStandardPlayersPerTeam + props.maxTwoWayPlayersPerTeam}</span>
                            </div>
                            <input 
                                type="number" 
                                min="0"
                                value={props.maxTwoWayPlayersPerTeam} 
                                onChange={(e) => props.setMaxTwoWayPlayersPerTeam(Math.max(0, parseInt(e.target.value)))}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
