import React from 'react';
import { Clock } from 'lucide-react';
import { RuleToggle, RuleInput } from '../RuleControls';
import { RULE_DEFINITIONS } from '../../../../../constants/ruleDefinitions';

interface GameStructureSectionProps {
    gameFormat: 'timed' | 'target_score';
    setGameFormat: (val: 'timed' | 'target_score') => void;
    gameTargetScore: number;
    setGameTargetScore: (val: number) => void;
    quarterLength: number;
    setQuarterLength: (val: number) => void;
    numQuarters: number;
    setNumQuarters: (val: number) => void;
    overtimeEnabled: boolean;
    setOvertimeEnabled: (val: boolean) => void;
    overtimeType: string;
    setOvertimeType: (val: string) => void;
    overtimeDuration: number;
    setOvertimeDuration: (val: number) => void;
    maxOvertimesEnabled: boolean;
    setMaxOvertimesEnabled: (val: boolean) => void;
    maxOvertimes: number;
    setMaxOvertimes: (val: number) => void;
    overtimeTieBreaker: string;
    setOvertimeTieBreaker: (val: string) => void;
    overtimeTargetPoints: number;
    setOvertimeTargetPoints: (val: number) => void;
    shootoutRounds: number;
    setShootoutRounds: (val: number) => void;
    startOfPossessionMethod: 'jump_ball' | 'coin_toss' | 'rock_paper_scissors';
    setStartOfPossessionMethod: (val: 'jump_ball' | 'coin_toss' | 'rock_paper_scissors') => void;
    possessionPattern: 'nba' | 'alternating';
    setPossessionPattern: (val: 'nba' | 'alternating') => void;
}

export const GameStructureSection: React.FC<GameStructureSectionProps> = ({
    gameFormat, setGameFormat,
    gameTargetScore, setGameTargetScore,
    quarterLength, setQuarterLength,
    numQuarters, setNumQuarters,
    overtimeEnabled, setOvertimeEnabled,
    overtimeType, setOvertimeType,
    overtimeDuration, setOvertimeDuration,
    maxOvertimesEnabled, setMaxOvertimesEnabled,
    maxOvertimes, setMaxOvertimes,
    overtimeTieBreaker, setOvertimeTieBreaker,
    overtimeTargetPoints, setOvertimeTargetPoints,
    shootoutRounds, setShootoutRounds,
    startOfPossessionMethod, setStartOfPossessionMethod,
    possessionPattern, setPossessionPattern
}) => {
    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-indigo-400" />
                <h5 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Game Structure</h5>
            </div>
            {/* Wired to sim: quarterLength, overtime enabled/duration/max OT. Stored only: target-score formats, possession ceremony/pattern, numQuarters. */}
            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Stored only until the engine supports target-score game flow. */}
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Game Format</span>
                        <select 
                            value={gameFormat} 
                            onChange={(e) => setGameFormat(e.target.value as 'timed' | 'target_score')} 
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                        >
                            {RULE_DEFINITIONS.gameFormat.options?.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start of Possession</span>
                        <select 
                            value={startOfPossessionMethod} 
                            onChange={(e) => setStartOfPossessionMethod(e.target.value as any)} 
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                        >
                            {RULE_DEFINITIONS.startOfPossessionMethod.options?.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {gameFormat === 'timed' ? (
                        <>
                            <div className="space-y-4">
                                {/* quarterLength feeds simulator score and minutes budgets. */}
                                <RuleInput id="quarterLength" value={quarterLength} onChange={setQuarterLength} />
                                {/* Stored only: engine currently simulates 4 quarters. */}
                                <RuleInput id="numQuarters" value={numQuarters} onChange={setNumQuarters} />
                                <div className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quarter Possession Pattern</span>
                                    <select 
                                        value={possessionPattern} 
                                        onChange={(e) => setPossessionPattern(e.target.value as any)} 
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                                    >
                                        {RULE_DEFINITIONS.possessionPattern.options?.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {/* Standard OT enabled/duration/max periods feed simulator score and minutes budgets. */}
                            <div className="space-y-4">
                                <RuleToggle id="overtimeEnabled" value={overtimeEnabled} onChange={setOvertimeEnabled} />
                                {overtimeEnabled && (
                                    <div className="space-y-4 pt-2 border-t border-slate-800/50">
                                        <div className="flex flex-col gap-2">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Format</span>
                                            <select 
                                                value={overtimeType} 
                                                onChange={(e) => setOvertimeType(e.target.value)} 
                                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                                            >
                                                {RULE_DEFINITIONS.overtimeType.options?.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {overtimeType === 'standard' && (
                                            <>
                                                <RuleInput id="overtimeDuration" value={overtimeDuration} onChange={setOvertimeDuration} />
                                                <RuleToggle id="maxOvertimesEnabled" value={maxOvertimesEnabled} onChange={setMaxOvertimesEnabled} />
                                                {maxOvertimesEnabled && (
                                                    <div className="space-y-4 pl-4 border-l border-slate-800/50">
                                                        <RuleInput id="maxOvertimes" value={maxOvertimes} onChange={setMaxOvertimes} />
                                                        <div className="flex flex-col gap-2">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tie-Breaker Format</span>
                                                            <select 
                                                                value={overtimeTieBreaker} 
                                                                onChange={(e) => setOvertimeTieBreaker(e.target.value)} 
                                                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold"
                                                            >
                                                                {RULE_DEFINITIONS.overtimeTieBreaker.options?.map(opt => (
                                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {overtimeType === 'target_score' && (
                                            <RuleInput id="overtimeTargetPoints" value={overtimeTargetPoints} onChange={setOvertimeTargetPoints} />
                                        )}

                                        {overtimeType === 'shootout' && (
                                            <RuleInput id="shootoutRounds" value={shootoutRounds} onChange={setShootoutRounds} />
                                        )}

                                        {overtimeType === 'sudden_death' && (
                                            <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                                                <p className="text-[9px] text-indigo-300 font-medium leading-relaxed">
                                                    SUDDEN DEATH: The first team to score any points (FG or FT) wins the game immediately. No timers or limits apply.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="col-span-2 space-y-4">
                            <RuleInput id="gameTargetScore" value={gameTargetScore} onChange={setGameTargetScore} />
                            <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                                <p className="text-[10px] text-indigo-300 font-medium leading-relaxed">
                                    TARGET SCORE MODE: The game ends immediately when a team reaches the target score. Quarters and standard game clocks are disabled.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
