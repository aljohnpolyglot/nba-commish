import React from 'react';
import { Calendar } from 'lucide-react';

// NBA-standard maximums — users may go LOWER but never higher.
// Capping the upper bound prevents calendar overflow (draft slides into July,
// FA collides with playoffs, etc.) which is the root cause of the offseason
// pipeline bugs.
export const NBA_MAX_GAMES_PER_SEASON  = 82;
export const NBA_MAX_DIVISION_GAMES    = 16; // 4 games × 4 division opponents
export const NBA_MAX_CONFERENCE_GAMES  = 36; // 4×6 + 3×4 vs non-div same-conf
export const NBA_MAX_PLAYOFF_SERIES    = 7;  // best-of-7

interface FormatTabProps {
    playIn: boolean;
    setPlayIn: (val: boolean) => void;
    playoffFormat: (number | string)[];
    updatePlayoffFormat: (index: number, value: string) => void;
    minGamesRequirement: number | string;
    setMinGamesRequirement: (val: string) => void;
    customScheduleEnabled: boolean;
    setCustomScheduleEnabled: (val: boolean) => void;
    gamesPerSeason: number;
    setGamesPerSeason: (val: number) => void;
    divisionGames: number;
    setDivisionGames: (val: number) => void;
    conferenceGames: number;
    setConferenceGames: (val: number) => void;
}

export const FormatTab: React.FC<FormatTabProps> = ({
    playIn,
    setPlayIn,
    playoffFormat,
    updatePlayoffFormat,
    minGamesRequirement,
    setMinGamesRequirement,
    customScheduleEnabled,
    setCustomScheduleEnabled,
    gamesPerSeason,
    setGamesPerSeason,
    divisionGames,
    setDivisionGames,
    conferenceGames,
    setConferenceGames
}) => {
    return (
        <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm space-y-8">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400">
                    <Calendar size={20} />
                </div>
                <h4 className="text-xl font-black text-white uppercase tracking-tight">Season Format</h4>
            </div>
            
            <div className="flex items-center justify-between p-5 bg-slate-800/40 rounded-2xl border border-slate-800/50">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Play-In Tournament</span>
                    <span className="text-[10px] text-slate-500 font-medium mt-1">Teams 7-10 compete for final playoff seeds</span>
                </div>
                <button
                    onClick={() => setPlayIn(!playIn)}
                    className={`text-xs font-black px-4 py-2 rounded-xl transition-all ${playIn ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}
                >
                    {playIn ? 'ENABLED' : 'DISABLED'}
                </button>
            </div>

            <div className="p-6 bg-slate-800/40 rounded-2xl border border-slate-800/50 space-y-4">
                <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Playoff Series Length (Best of)</span>
                    <span className="text-[10px] text-slate-500 font-medium">Max best-of-{NBA_MAX_PLAYOFF_SERIES} per round</span>
                </div>
                <div className="grid grid-cols-4 gap-4">
                    {playoffFormat.map((games, idx) => (
                        <div key={idx} className="flex flex-col gap-2">
                            <span className="text-[10px] text-slate-500 font-bold uppercase text-center">Round {idx+1}</span>
                            <input
                                type="number"
                                value={games}
                                onChange={(e) => updatePlayoffFormat(idx, e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                min="1"
                                max={NBA_MAX_PLAYOFF_SERIES}
                                step="2"
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-6 bg-slate-800/40 rounded-2xl border border-slate-800/50 space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Schedule</span>
                    <button
                        type="button"
                        onClick={() => setCustomScheduleEnabled(!customScheduleEnabled)}
                        className={`text-xs font-black px-4 py-2 rounded-xl transition-all ${customScheduleEnabled ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}
                    >
                        {customScheduleEnabled ? 'CUSTOM' : 'STANDARD'}
                    </button>
                </div>
                {/* Derived non-conference games: gamesPerSeason - division - conference.
                    Negative ⇒ user has over-allocated; show a red callout so they can fix
                    before save (handleSaveConfig clamps as a safety net). */}
                {(() => {
                    const interConf = gamesPerSeason - divisionGames - conferenceGames;
                    const interConfClass = interConf < 0
                        ? 'text-rose-400'
                        : interConf > 30 ? 'text-amber-400' : 'text-emerald-400';
                    return (
                        <p className="text-[10px] text-slate-500 font-medium">
                            NBA standard: 82 / 16 / 36 (16 vs own division, 36 vs same conf, 30 vs other conf).
                            <span className="ml-2">Inter-conference games: <strong className={interConfClass}>{interConf}</strong></span>
                            {interConf < 0 && <span className="ml-2 text-rose-400 font-bold">⚠ Division + Conference exceeds total games</span>}
                        </p>
                    );
                })()}
                <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${customScheduleEnabled ? '' : 'opacity-50'}`}>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Games Per Season</span>
                        <input
                            type="number"
                            value={gamesPerSeason}
                            onChange={(e) => setGamesPerSeason(parseInt(e.target.value, 10))}
                            disabled={!customScheduleEnabled}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500"
                            min="1"
                            max={NBA_MAX_GAMES_PER_SEASON}
                        />
                        <span className="text-[9px] text-slate-600 font-medium text-center">Max {NBA_MAX_GAMES_PER_SEASON}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Division Games</span>
                        <input
                            type="number"
                            value={divisionGames}
                            onChange={(e) => setDivisionGames(parseInt(e.target.value, 10))}
                            disabled={!customScheduleEnabled}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500"
                            min="0"
                            max={Math.min(NBA_MAX_DIVISION_GAMES, gamesPerSeason)}
                        />
                        <span className="text-[9px] text-slate-600 font-medium text-center">Max {NBA_MAX_DIVISION_GAMES}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Conference Games</span>
                        <input
                            type="number"
                            value={conferenceGames}
                            onChange={(e) => setConferenceGames(parseInt(e.target.value, 10))}
                            disabled={!customScheduleEnabled}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500"
                            min="0"
                            max={Math.min(NBA_MAX_CONFERENCE_GAMES, gamesPerSeason - divisionGames)}
                        />
                        <span className="text-[9px] text-slate-600 font-medium text-center">Max {NBA_MAX_CONFERENCE_GAMES}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between p-5 bg-slate-800/40 rounded-2xl border border-slate-800/50">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Minimum Games Requirement</span>
                    <span className="text-[10px] text-slate-500 font-medium mt-1">Required games for major award eligibility</span>
                </div>
                <div className="flex items-center gap-3">
                    <input 
                        type="number" 
                        value={minGamesRequirement} 
                        onChange={(e) => setMinGamesRequirement(e.target.value)}
                        className="w-16 bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-2 focus:outline-none focus:border-indigo-500"
                        min="0"
                        max={gamesPerSeason}
                    />
                    <span className="text-[10px] text-slate-500 font-bold uppercase">GAMES</span>
                </div>
            </div>
        </div>
    );
};
