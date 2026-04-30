import React from 'react';
import { Zap, Settings2 } from 'lucide-react';

interface RisingStarsSectionProps {
    risingStarsEnabled: boolean;
    setRisingStarsEnabled: (val: boolean) => void;
    risingStarsFormat: string;
    setRisingStarsFormat: (val: string) => void;
    risingStarsMirrorLeagueRules: boolean;
    setRisingStarsMirrorLeagueRules: (val: boolean) => void;
    risingStarsQuarterLength: number;
    setRisingStarsQuarterLength: (val: number) => void;
    risingStarsEliminationEndings: boolean;
    setRisingStarsEliminationEndings: (val: boolean) => void;
}

const FORMAT_META: Record<string, { label: string; desc: string; teams: string }> = {
    rookies_vs_sophomores: {
        label: 'Rookies vs Sophomores',
        desc: 'Classic 2-team game. Top rookies face top sophomores.',
        teams: '2 teams',
    },
    usa_vs_world: {
        label: 'USA vs World',
        desc: 'Rookies & sophomores divided by nationality — American-born vs international.',
        teams: '2 teams',
    },
    '4team_tournament': {
        label: '4-Team Tournament (2022+ NBA)',
        desc: '3 legend-coached NBA teams + 1 G League squad. SFs first to 40 pts, Final first to 25 pts.',
        teams: '4 teams · bracket',
    },
    random_4team: {
        label: 'Random 4-Team',
        desc: 'Eligible pool shuffled randomly into 4 equal teams. SFs to 40, Final to 25.',
        teams: '4 teams · bracket',
    },
    random_2team: {
        label: 'Random 2-Team',
        desc: 'Eligible rookies & sophomores split randomly into two balanced squads.',
        teams: '2 teams',
    },
};

const isTournament = (fmt: string) => fmt === '4team_tournament' || fmt === 'random_4team';

export const RisingStarsSection: React.FC<RisingStarsSectionProps> = (props) => {
    const meta = FORMAT_META[props.risingStarsFormat] ?? FORMAT_META['rookies_vs_sophomores'];

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
                    {/* Format */}
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Format</span>
                        <select
                            value={props.risingStarsFormat}
                            onChange={(e) => props.setRisingStarsFormat(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                        >
                            {Object.entries(FORMAT_META).map(([val, m]) => (
                                <option key={val} value={val}>{m.label}</option>
                            ))}
                        </select>
                        <div className="flex items-center justify-between">
                            <p className="text-[9px] text-slate-500 italic flex-1">{meta.desc}</p>
                            <span className="text-[9px] font-bold text-sky-600 uppercase tracking-wider ml-2 shrink-0">{meta.teams}</span>
                        </div>
                    </div>

                    {/* Tournament-only options */}
                    {isTournament(props.risingStarsFormat) && (
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Elimination Endings</span>
                                <p className="text-[9px] text-slate-500 italic mt-0.5">SF losers sit out the final. Off = all four teams play the final.</p>
                            </div>
                            <button
                                onClick={() => props.setRisingStarsEliminationEndings(!props.risingStarsEliminationEndings)}
                                className={`w-8 h-4 rounded-full transition-all duration-200 relative shrink-0 ml-4 ${props.risingStarsEliminationEndings ? 'bg-indigo-500' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.risingStarsEliminationEndings ? 'left-4.5' : 'left-0.5'}`} />
                            </button>
                        </div>
                    )}

                    {/* Game rules */}
                    <div className="pt-4 border-t border-slate-800/50 space-y-4">
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

                        {!props.risingStarsMirrorLeagueRules && (
                            <div className="flex flex-col gap-2 animate-in fade-in duration-200">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quarter Length (minutes)</span>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min={1}
                                        max={12}
                                        step={1}
                                        value={props.risingStarsQuarterLength}
                                        onChange={(e) => props.setRisingStarsQuarterLength(parseInt(e.target.value))}
                                        className="flex-1 accent-indigo-500"
                                    />
                                    <span className="text-white font-black text-sm w-8 text-right">{props.risingStarsQuarterLength}</span>
                                </div>
                                <p className="text-[9px] text-slate-500 italic">
                                    {props.risingStarsQuarterLength === 12
                                        ? 'Full regulation quarters (4×12 = 48 min).'
                                        : props.risingStarsQuarterLength === 3
                                        ? 'NBA 2022+ format (4×3 = 12 min).'
                                        : `4×${props.risingStarsQuarterLength} = ${props.risingStarsQuarterLength * 4} min total.`}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
