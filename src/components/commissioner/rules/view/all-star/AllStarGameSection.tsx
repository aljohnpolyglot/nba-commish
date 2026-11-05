import React, { useState } from 'react';
import { Star, Settings2, Lock } from 'lucide-react';
import { RuleToggle } from '../RuleControls';
import { GameStructureSection } from '../game-rules/GameStructureSection';
import { useGame } from '../../../../../store/GameContext';
import { getLeagueLegendCaptainCandidates } from '../../../../../services/allStar/captainPool';

interface AllStarGameSectionProps {
    allStarGameEnabled: boolean;
    setAllStarGameEnabled: (val: boolean) => void;
    allStarFormat: string;
    setAllStarFormat: (val: string) => void;
    allStarTeams: number;
    setAllStarTeams: (val: number) => void;
    allStarCaptainType: 'player' | 'legend';
    setAllStarCaptainType: (val: 'player' | 'legend') => void;
    allStarPlayerCaptainNameStyle: 'first_name' | 'last_name';
    setAllStarPlayerCaptainNameStyle: (val: 'first_name' | 'last_name') => void;
    allStarLegendCaptainIds: string[];
    setAllStarLegendCaptainIds: (val: string[]) => void;
    allStarTeamNames: string[];
    setAllStarTeamNames: (val: string[]) => void;
    allStarMirrorLeagueRules: boolean;
    setAllStarMirrorLeagueRules: (val: boolean) => void;
    // Game Rules Props (for when mirror is false)
    allStarGameFormat: 'timed' | 'target_score' | 'elam_ending';
    setAllStarGameFormat: (val: 'timed' | 'target_score' | 'elam_ending') => void;
    allStarGameTargetScore: number;
    setAllStarGameTargetScore: (val: number) => void;
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
    const { state } = useGame();
    // Possession rules aren't yet sim-wired for All-Star; keep local state so
    // the GameStructureSection controls render without affecting league rules.
    const [allStarStartOfPossessionMethod, setAllStarStartOfPossessionMethod] =
        useState<'jump_ball' | 'coin_toss' | 'rock_paper_scissors'>('jump_ball');
    const [allStarPossessionPattern, setAllStarPossessionPattern] =
        useState<'nba' | 'alternating'>('nba');
    const formats = [
        { value: 'east_vs_west', label: 'East vs West (Classic)' },
        { value: 'captains_draft', label: 'Captains Draft' },
        { value: 'usa_vs_world', label: 'USA vs World' },
        { value: 'blacks_vs_whites', label: 'Blacks vs Whites (Satire)' },
    ];

    // Format and team count freeze once starters are announced and unlock when
    // the next season is initialized from the saved league calendar.
    const seasonLocked = !!state?.allStar?.startersAnnounced;
    const nextSeason = (state?.leagueStats?.year ?? 0) + 1;

    // Only usa_vs_world supports 3/4-team brackets; everyone else snaps to 2.
    const supportsMultiTeam = props.allStarFormat === 'usa_vs_world';
    const teamsLocked = seasonLocked || !supportsMultiTeam;
    const legendCandidates = getLeagueLegendCaptainCandidates(state.players, state.teams, state.leagueStats);

    const setLegendCaptain = (index: number, playerId: string) => {
        const next = [...props.allStarLegendCaptainIds];
        next[index] = playerId;
        props.setAllStarLegendCaptainIds(next.slice(0, 2));
        const player = legendCandidates.find(candidate => candidate.internalId === playerId);
        const names = [...props.allStarTeamNames];
        names[index] = player ? `Team ${player.name.trim().split(/\s+/).at(-1)}` : '';
        props.setAllStarTeamNames(names.slice(0, 2));
    };

    const handleFormatChange = (value: string) => {
        props.setAllStarFormat(value);
        if (value !== 'usa_vs_world' && props.allStarTeams !== 2) {
            props.setAllStarTeams(2);
        }
    };

    const bracketPreview = (() => {
        if (!supportsMultiTeam || props.allStarTeams === 2) {
            return 'Single championship game on Sunday Night.';
        }
        if (props.allStarTeams === 3) {
            return '3-team round robin (3 games) → top 2 by record advance to championship. 4 games total.';
        }
        return '4-team knockout: 2 semifinals + championship. 3 games total.';
    })();

    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Star size={16} className="text-amber-400" />
                    <h2 className="text-lg font-black text-white uppercase tracking-tight">All-Star Game</h2>
                </div>
                <button
                    onClick={() => !seasonLocked && props.setAllStarGameEnabled(!props.allStarGameEnabled)}
                    disabled={seasonLocked}
                    className={`w-10 h-5 rounded-full transition-all duration-200 relative ${props.allStarGameEnabled ? 'bg-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-700'} ${seasonLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.allStarGameEnabled ? 'left-6' : 'left-1'}`} />
                </button>
            </div>

            {props.allStarGameEnabled && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    {seasonLocked && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10">
                            <Lock size={12} className="text-amber-400 shrink-0" />
                            <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                                Locked — starters announced. Edits apply to {nextSeason} season.
                            </span>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Format</span>
                            <select
                                value={props.allStarFormat}
                                onChange={(e) => handleFormatChange(e.target.value)}
                                disabled={seasonLocked}
                                className={`w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-[10px] py-2 px-3 focus:outline-none focus:border-indigo-500 appearance-none uppercase font-bold ${seasonLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                                {formats.map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Number of Teams: {props.allStarTeams}
                                {teamsLocked && <span className="ml-2 text-slate-600 normal-case">(USA vs World only)</span>}
                            </span>
                            <input
                                type="range"
                                min="2"
                                max="4"
                                value={props.allStarTeams}
                                disabled={teamsLocked}
                                onChange={(e) => props.setAllStarTeams(parseInt(e.target.value))}
                                className={`w-full accent-indigo-500 ${teamsLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                            />
                            <p className="text-[9px] text-slate-500 italic">{bracketPreview}</p>
                        </div>
                    </div>

                    {props.allStarFormat === 'captains_draft' && (
                        <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Captain Source</span>
                                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {([
                                        ['player', 'Player Captains'],
                                        ['legend', 'Legend Captains'],
                                    ] as const).map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => props.setAllStarCaptainType(value)}
                                            disabled={seasonLocked}
                                            className={`min-h-11 rounded-xl border px-4 text-[10px] font-black uppercase tracking-wider ${props.allStarCaptainType === value ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'border-slate-700 bg-slate-900 text-slate-400'} disabled:opacity-40`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {props.allStarCaptainType === 'legend' && (
                                legendCandidates.length >= 2 ? (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {[0, 1].map(index => (
                                            <label key={index} className="flex flex-col gap-2">
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Legend Captain {index + 1}</span>
                                                <select
                                                    value={props.allStarLegendCaptainIds[index] ?? ''}
                                                    onChange={event => setLegendCaptain(index, event.target.value)}
                                                    disabled={seasonLocked}
                                                    className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-40"
                                                >
                                                    <option value="">Select Hall of Famer</option>
                                                    {legendCandidates.map(player => (
                                                        <option
                                                            key={player.internalId}
                                                            value={player.internalId}
                                                            disabled={props.allStarLegendCaptainIds[1 - index] === player.internalId}
                                                        >
                                                            {player.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs font-medium text-amber-300">
                                        Two Hall of Fame players from this league are required before Legend Captains can be used.
                                    </p>
                                )
                            )}
                            {props.allStarCaptainType === 'player' && (
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Player Team Names</span>
                                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {([['first_name', 'First Name — Team LeBron'], ['last_name', 'Last Name — Team Dončić']] as const).map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => props.setAllStarPlayerCaptainNameStyle(value)}
                                                disabled={seasonLocked}
                                                className={`min-h-11 rounded-xl border px-4 text-[10px] font-black uppercase tracking-wider ${props.allStarPlayerCaptainNameStyle === value ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'border-slate-700 bg-slate-900 text-slate-400'} disabled:opacity-40`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

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
                                    showLeagueEnvironmentControls={false}
                                    gameFormat={props.allStarGameFormat}
                                    setGameFormat={props.setAllStarGameFormat}
                                    gameTargetScore={props.allStarGameTargetScore}
                                    setGameTargetScore={props.setAllStarGameTargetScore}
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
                                    startOfPossessionMethod={allStarStartOfPossessionMethod}
                                    setStartOfPossessionMethod={setAllStarStartOfPossessionMethod}
                                    possessionPattern={allStarPossessionPattern}
                                    setPossessionPattern={setAllStarPossessionPattern}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
