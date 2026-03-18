import React from 'react';
import { Star, Settings2 } from 'lucide-react';
import { RuleToggle } from '../RuleControls';
import { GameStructureSection } from '../game-rules/GameStructureSection';

interface AllStarGameSectionProps {
    allStarGameEnabled: boolean;
    setAllStarGameEnabled: (val: boolean) => void;
    allStarFormat: string;
    setAllStarFormat: (val: string) => void;
    allStarTeams: number;
    setAllStarTeams: (val: number) => void;
    allStarMirrorLeagueRules: boolean;
    setAllStarMirrorLeagueRules: (val: boolean) => void;
    // Game Rules Props (for when mirror is false)
    allStarGameFormat: 'timed' | 'target_score';
    setAllStarGameFormat: (val: 'timed' | 'target_score') => void;
    allStarQuarterLength: number;
    setAllStarQuarterLength: (val: number) => void;
    allStarNumQuarters: number;
    setAllStarNumQuarters: (val: number) => void;
    allStarOvertimeDuration: number;
    setAllStarOvertimeDuration: (val: number) => void;
    allStarOvertimeTargetPoints: number;
    setAllStarOvertimeTargetPoints: (val: number) => void;
    allStarShootoutRounds: number;
    setAllStarShootoutRounds: (val: number) => void;
    allStarOvertimeType: string;
    setAllStarOvertimeType: (val: string) => void;
    allStarMaxOvertimesEnabled: boolean;
    setAllStarMaxOvertimesEnabled: (val: boolean) => void;
    allStarMaxOvertimes: number;
    setAllStarMaxOvertimes: (val: number) => void;
    allStarOvertimeTieBreaker: string;
    setAllStarOvertimeTieBreaker: (val: string) => void;
}

export const AllStarGameSection: React.FC<AllStarGameSectionProps> = (props) => {
    const formats = [
        { value: 'east_vs_west', label: 'East vs West (Classic)' },
        { value: 'captains_draft', label: 'Captains Draft' },
        { value: 'usa_vs_world', label: 'USA vs World' },
        { value: 'blacks_vs_whites', label: 'Blacks vs Whites (Satire)' },
    ];

    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Star size={16} className="text-amber-400" />
                    <h2 className="text-lg font-black text-white uppercase tracking-tight">All-Star Game</h2>
                </div>
                <button 
                    onClick={() => props.setAllStarGameEnabled(!props.allStarGameEnabled)} 
                    className={`w-10 h-5 rounded-full transition-all duration-200 relative ${props.allStarGameEnabled ? 'bg-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-700'}`}
                >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.allStarGameEnabled ? 'left-6' : 'left-1'}`} />
                </button>
            </div>

            {props.allStarGameEnabled && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Format</span>
                            <select 
                                value={props.allStarFormat} 
                                onChange={(e) => props.setAllStarFormat(e.target.value)} 
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                            >
                                {formats.map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Number of Teams: {props.allStarTeams}</span>
                            <input 
                                type="range" 
                                min="2" 
                                max="4" 
                                value={props.allStarTeams} 
                                onChange={(e) => props.setAllStarTeams(parseInt(e.target.value))}
                                className="w-full accent-indigo-500"
                            />
                            <p className="text-[9px] text-slate-500 italic">
                                {props.allStarTeams === 2 ? "Classic 2-team showdown (East vs West or Captains Draft)." : 
                                 props.allStarTeams === 3 ? "3-team round robin tournament (2 USA, 1 World). Top 2 advance to championship." : 
                                 "4-team knockout tournament (2 Semifinals, 1 Championship)."}
                            </p>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800/50">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Settings2 size={14} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mirror League Rules</span>
                            </div>
                            <button 
                                onClick={() => props.setAllStarMirrorLeagueRules(!props.allStarMirrorLeagueRules)} 
                                className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.allStarMirrorLeagueRules ? 'bg-indigo-500' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.allStarMirrorLeagueRules ? 'left-4.5' : 'left-0.5'}`} />
                            </button>
                        </div>

                        {!props.allStarMirrorLeagueRules && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Custom All-Star Game Laws</h3>
                                <GameStructureSection 
                                    gameFormat={props.allStarGameFormat}
                                    setGameFormat={props.setAllStarGameFormat}
                                    gameTargetScore={props.allStarOvertimeTargetPoints} // Reusing target points for game target score in this context
                                    setGameTargetScore={props.setAllStarOvertimeTargetPoints}
                                    quarterLength={props.allStarQuarterLength}
                                    setQuarterLength={props.setAllStarQuarterLength}
                                    numQuarters={props.allStarNumQuarters}
                                    setNumQuarters={props.setAllStarNumQuarters}
                                    overtimeEnabled={true}
                                    setOvertimeEnabled={() => {}}
                                    overtimeType={props.allStarOvertimeType}
                                    setOvertimeType={props.setAllStarOvertimeType}
                                    overtimeDuration={props.allStarOvertimeDuration}
                                    setOvertimeDuration={props.setAllStarOvertimeDuration}
                                    maxOvertimesEnabled={props.allStarMaxOvertimesEnabled}
                                    setMaxOvertimesEnabled={props.setAllStarMaxOvertimesEnabled}
                                    maxOvertimes={props.allStarMaxOvertimes}
                                    setMaxOvertimes={props.setAllStarMaxOvertimes}
                                    overtimeTieBreaker={props.allStarOvertimeTieBreaker}
                                    setOvertimeTieBreaker={props.setAllStarOvertimeTieBreaker}
                                    overtimeTargetPoints={props.allStarOvertimeTargetPoints}
                                    setOvertimeTargetPoints={props.setAllStarOvertimeTargetPoints}
                                    shootoutRounds={props.allStarShootoutRounds}
                                    setShootoutRounds={props.setAllStarShootoutRounds}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
