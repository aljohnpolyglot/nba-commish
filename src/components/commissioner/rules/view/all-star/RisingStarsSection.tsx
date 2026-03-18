import React from 'react';
import { Zap, Settings2 } from 'lucide-react';

interface RisingStarsSectionProps {
    risingStarsEnabled: boolean;
    setRisingStarsEnabled: (val: boolean) => void;
    risingStarsFormat: string;
    setRisingStarsFormat: (val: string) => void;
    risingStarsMirrorLeagueRules: boolean;
    setRisingStarsMirrorLeagueRules: (val: boolean) => void;
}

export const RisingStarsSection: React.FC<RisingStarsSectionProps> = (props) => {
    const formats = [
        { value: 'rookies_vs_sophomores', label: 'Rookies vs Sophomores' },
        { value: 'east_vs_west', label: 'East vs West' },
        { value: 'usa_vs_world', label: 'USA vs World' },
        { value: 'tournament', label: '4-Team Mini-Tournament' },
        { value: 'blacks_vs_whites', label: 'Blacks vs Whites (Satire)' },
    ];

    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Zap size={16} className="text-sky-400" />
                    <h2 className="text-lg font-black text-white uppercase tracking-tight">Rising Stars</h2>
                </div>
                <button 
                    onClick={() => props.setRisingStarsEnabled(!props.risingStarsEnabled)} 
                    className={`w-10 h-5 rounded-full transition-all duration-200 relative ${props.risingStarsEnabled ? 'bg-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-700'}`}
                >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.risingStarsEnabled ? 'left-6' : 'left-1'}`} />
                </button>
            </div>

            {props.risingStarsEnabled && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Format</span>
                        <select 
                            value={props.risingStarsFormat} 
                            onChange={(e) => props.setRisingStarsFormat(e.target.value)} 
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                        >
                            {formats.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                        </select>
                        <p className="text-[9px] text-slate-500 italic">
                            {props.risingStarsFormat === 'tournament' ? 
                                "4-team mini-tournament (2 Semifinals to 40 pts, 1 Championship to 25 pts)." : 
                                "Standard game format."}
                        </p>
                    </div>

                    <div className="pt-4 border-t border-slate-800/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Settings2 size={14} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mirror League Rules</span>
                            </div>
                            <button 
                                onClick={() => props.setRisingStarsMirrorLeagueRules(!props.risingStarsMirrorLeagueRules)} 
                                className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.risingStarsMirrorLeagueRules ? 'bg-indigo-500' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.risingStarsMirrorLeagueRules ? 'left-4.5' : 'left-0.5'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
