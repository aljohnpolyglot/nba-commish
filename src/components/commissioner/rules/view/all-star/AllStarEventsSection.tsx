import React from 'react';
import { Trophy, Info } from 'lucide-react';

interface AllStarEventsSectionProps {
    allStarDunkContest: boolean;
    setAllStarDunkContest: (val: boolean) => void;
    allStarDunkContestPlayers: number;
    setAllStarDunkContestPlayers: (val: number) => void;

    allStarThreePointContest: boolean;
    setAllStarThreePointContest: (val: boolean) => void;
    allStarThreePointContestPlayers: number;
    setAllStarThreePointContestPlayers: (val: number) => void;

    allStarShootingStars: boolean;
    setAllStarShootingStars: (val: boolean) => void;
    allStarShootingStarsMode: 'individual' | 'team';
    setAllStarShootingStarsMode: (val: 'individual' | 'team') => void;
    allStarShootingStarsTeams: number;
    setAllStarShootingStarsTeams: (val: number) => void;
    allStarShootingStarsPlayersPerTeam: number;
    setAllStarShootingStarsPlayersPerTeam: (val: number) => void;
    allStarShootingStarsTotalPlayers: number;
    setAllStarShootingStarsTotalPlayers: (val: number) => void;

    allStarSkillsChallenge: boolean;
    setAllStarSkillsChallenge: (val: boolean) => void;
    allStarSkillsChallengeMode: 'individual' | 'team';
    setAllStarSkillsChallengeMode: (val: 'individual' | 'team') => void;
    allStarSkillsChallengeTeams: number;
    setAllStarSkillsChallengeTeams: (val: number) => void;
    allStarSkillsChallengePlayersPerTeam: number;
    setAllStarSkillsChallengePlayersPerTeam: (val: number) => void;
    allStarSkillsChallengeTotalPlayers: number;
    setAllStarSkillsChallengeTotalPlayers: (val: number) => void;

    allStarHorse: boolean;
    setAllStarHorse: (val: boolean) => void;
    allStarHorseParticipants: number;
    setAllStarHorseParticipants: (val: number) => void;

    allStarOneOnOneEnabled: boolean;
    setAllStarOneOnOneEnabled: (val: boolean) => void;
    allStarOneOnOneParticipants: number;
    setAllStarOneOnOneParticipants: (val: number) => void;
}

export const AllStarEventsSection: React.FC<AllStarEventsSectionProps> = (props) => {
    const EventToggle = ({ label, value, onChange }: { label: string, value: boolean, onChange: (v: boolean) => void }) => (
        <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50">
            <span className="text-[10px] font-bold text-slate-200 uppercase tracking-widest">{label}</span>
            <button 
                onClick={() => onChange(!value)} 
                className={`w-8 h-4 rounded-full transition-all duration-200 relative ${value ? 'bg-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-700'}`}
            >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${value ? 'left-4.5' : 'left-0.5'}`} />
            </button>
        </div>
    );

    const EventInput = ({ label, value, onChange, min = 2, max = 20 }: { label: string, value: number, onChange: (v: number) => void, min?: number, max?: number }) => (
        <div className="flex items-center justify-between pl-4 border-l border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
            <div className="flex items-center gap-2">
                <input 
                    type="number" 
                    value={value} 
                    onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                    className="w-12 bg-slate-950 border border-slate-700 rounded-lg text-center text-white font-mono text-[10px] py-1 focus:outline-none focus:border-indigo-500"
                    min={min}
                    max={max}
                />
            </div>
        </div>
    );

    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center gap-2">
                <Trophy size={16} className="text-emerald-400" />
                <h2 className="text-lg font-black text-white uppercase tracking-tight">Weekend Events</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Dunk Contest */}
                <div className="space-y-4">
                    <EventToggle label="Slam Dunk Contest" value={props.allStarDunkContest} onChange={props.setAllStarDunkContest} />
                    {props.allStarDunkContest && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest pl-2">Dunk Contest Settings</h3>
                            <EventInput label="Participants" value={props.allStarDunkContestPlayers} onChange={props.setAllStarDunkContestPlayers} />
                        </div>
                    )}
                </div>

                {/* 3-Point Contest */}
                <div className="space-y-4">
                    <EventToggle label="3-Point Contest" value={props.allStarThreePointContest} onChange={props.setAllStarThreePointContest} />
                    {props.allStarThreePointContest && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest pl-2">3-Point Contest Settings</h3>
                            <EventInput label="Participants" value={props.allStarThreePointContestPlayers} onChange={props.setAllStarThreePointContestPlayers} />
                        </div>
                    )}
                </div>

                {/* Shooting Stars */}
                <div className="space-y-4">
                    <EventToggle label="Shooting Stars" value={props.allStarShootingStars} onChange={props.setAllStarShootingStars} />
                    {props.allStarShootingStars && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest pl-2">Shooting Stars Settings</h3>
                            <div className="flex flex-col gap-2 pl-4 border-l border-slate-800">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mode</span>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => props.setAllStarShootingStarsMode('individual')}
                                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${props.allStarShootingStarsMode === 'individual' ? 'bg-indigo-500 text-white' : 'bg-slate-900 text-slate-500'}`}
                                    >
                                        Individual
                                    </button>
                                    <button 
                                        onClick={() => props.setAllStarShootingStarsMode('team')}
                                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${props.allStarShootingStarsMode === 'team' ? 'bg-indigo-500 text-white' : 'bg-slate-900 text-slate-500'}`}
                                    >
                                        Team
                                    </button>
                                </div>
                            </div>
                            {props.allStarShootingStarsMode === 'team' ? (
                                <>
                                    <EventInput label="Number of Teams" value={props.allStarShootingStarsTeams} onChange={props.setAllStarShootingStarsTeams} />
                                    <EventInput label="Players Per Team" value={props.allStarShootingStarsPlayersPerTeam} onChange={props.setAllStarShootingStarsPlayersPerTeam} />
                                </>
                            ) : (
                                <EventInput label="Total Participants" value={props.allStarShootingStarsTotalPlayers} onChange={props.setAllStarShootingStarsTotalPlayers} />
                            )}
                        </div>
                    )}
                </div>

                {/* Skills Challenge */}
                <div className="space-y-4">
                    <EventToggle label="Skills Challenge" value={props.allStarSkillsChallenge} onChange={props.setAllStarSkillsChallenge} />
                    {props.allStarSkillsChallenge && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest pl-2">Skills Challenge Settings</h3>
                            <div className="flex flex-col gap-2 pl-4 border-l border-slate-800">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mode</span>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => props.setAllStarSkillsChallengeMode('individual')}
                                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${props.allStarSkillsChallengeMode === 'individual' ? 'bg-indigo-500 text-white' : 'bg-slate-900 text-slate-500'}`}
                                    >
                                        Individual
                                    </button>
                                    <button 
                                        onClick={() => props.setAllStarSkillsChallengeMode('team')}
                                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${props.allStarSkillsChallengeMode === 'team' ? 'bg-indigo-500 text-white' : 'bg-slate-900 text-slate-500'}`}
                                    >
                                        Team
                                    </button>
                                </div>
                            </div>
                            {props.allStarSkillsChallengeMode === 'team' ? (
                                <>
                                    <EventInput label="Number of Teams" value={props.allStarSkillsChallengeTeams} onChange={props.setAllStarSkillsChallengeTeams} />
                                    <EventInput label="Players Per Team" value={props.allStarSkillsChallengePlayersPerTeam} onChange={props.setAllStarSkillsChallengePlayersPerTeam} />
                                </>
                            ) : (
                                <EventInput label="Total Participants" value={props.allStarSkillsChallengeTotalPlayers} onChange={props.setAllStarSkillsChallengeTotalPlayers} />
                            )}
                        </div>
                    )}
                </div>

                {/* HORSE */}
                <div className="space-y-4">
                    <EventToggle label="HORSE Tournament" value={props.allStarHorse} onChange={props.setAllStarHorse} />
                    {props.allStarHorse && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest pl-2">HORSE Settings</h3>
                            <EventInput label="Participants" value={props.allStarHorseParticipants} onChange={props.setAllStarHorseParticipants} />
                        </div>
                    )}
                </div>

                {/* 1v1 Tournament */}
                <div className="space-y-4">
                    <EventToggle label="1v1 Tournament" value={props.allStarOneOnOneEnabled} onChange={props.setAllStarOneOnOneEnabled} />
                    {props.allStarOneOnOneEnabled && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest pl-2">1v1 Tournament Settings</h3>
                            <EventInput label="Participants" value={props.allStarOneOnOneParticipants} onChange={props.setAllStarOneOnOneParticipants} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
