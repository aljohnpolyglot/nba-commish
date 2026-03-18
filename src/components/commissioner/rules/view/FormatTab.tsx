import React from 'react';
import { Calendar } from 'lucide-react';

interface FormatTabProps {
    playIn: boolean;
    setPlayIn: (val: boolean) => void;
    inSeasonTournament: boolean;
    setInSeasonTournament: (val: boolean) => void;
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
    inSeasonTournament,
    setInSeasonTournament,
    playoffFormat,
    updatePlayoffFormat,
    minGamesRequirement,
    setMinGamesRequirement,
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                <div className="flex items-center justify-between p-5 bg-slate-800/40 rounded-2xl border border-slate-800/50">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">In-Season Tournament</span>
                        <span className="text-[10px] text-slate-500 font-medium mt-1">The NBA Cup - Mid-season group play</span>
                    </div>
                    <button 
                        onClick={() => setInSeasonTournament(!inSeasonTournament)}
                        className={`text-xs font-black px-4 py-2 rounded-xl transition-all ${inSeasonTournament ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}
                    >
                        {inSeasonTournament ? 'ENABLED' : 'DISABLED'}
                    </button>
                </div>
            </div>

            <div className="p-6 bg-slate-800/40 rounded-2xl border border-slate-800/50 space-y-4">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Playoff Series Length (Best of)</span>
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
                                step="2"
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-6 bg-slate-800/40 rounded-2xl border border-slate-800/50 space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Schedule</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Games Per Season</span>
                        <input 
                            type="number" 
                            value={gamesPerSeason} 
                            onChange={(e) => setGamesPerSeason(parseInt(e.target.value, 10))}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500"
                            min="1"
                            max="162"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Division Games</span>
                        <input 
                            type="number" 
                            value={divisionGames} 
                            onChange={(e) => setDivisionGames(parseInt(e.target.value, 10))}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500"
                            min="0"
                            max={gamesPerSeason}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Conference Games</span>
                        <input 
                            type="number" 
                            value={conferenceGames} 
                            onChange={(e) => setConferenceGames(parseInt(e.target.value, 10))}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono text-lg py-3 focus:outline-none focus:border-indigo-500"
                            min="0"
                            max={gamesPerSeason}
                        />
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
