import React from 'react';
import { Trophy } from 'lucide-react';

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
                            <EventInput label="Teams" value={props.allStarShootingStarsTeams} onChange={props.setAllStarShootingStarsTeams} min={2} max={6} />
                            <EventInput label="Players / Team" value={props.allStarShootingStarsPlayersPerTeam} onChange={props.setAllStarShootingStarsPlayersPerTeam} min={2} max={5} />
                            <EventInput label="Total Players" value={props.allStarShootingStarsTotalPlayers} onChange={props.setAllStarShootingStarsTotalPlayers} min={4} max={30} />
                        </div>
                    )}
                </div>

                {/* Skills Challenge */}
                <div className="space-y-4">
                    <EventToggle label="Skills Challenge" value={props.allStarSkillsChallenge} onChange={props.setAllStarSkillsChallenge} />
                    {props.allStarSkillsChallenge && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest pl-2">Skills Challenge Settings</h3>
                            <EventInput label="Total Players" value={props.allStarSkillsChallengeTotalPlayers} onChange={props.setAllStarSkillsChallengeTotalPlayers} min={4} max={16} />
                        </div>
                    )}
                </div>

                {/* HORSE Tournament */}
                <div className="space-y-4">
                    <EventToggle label="HORSE Tournament" value={props.allStarHorse} onChange={props.setAllStarHorse} />
                    {props.allStarHorse && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest pl-2">HORSE Settings</h3>
                            <EventInput label="Participants" value={props.allStarHorseParticipants} onChange={props.setAllStarHorseParticipants} min={2} max={16} />
                        </div>
                    )}
                </div>

                {/* 1v1 Tournament */}
                <div className="space-y-4">
                    <EventToggle label="1v1 Tournament" value={props.allStarOneOnOneEnabled} onChange={props.setAllStarOneOnOneEnabled} />
                    {props.allStarOneOnOneEnabled && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest pl-2">1v1 Settings</h3>
                            <EventInput label="Participants" value={props.allStarOneOnOneParticipants} onChange={props.setAllStarOneOnOneParticipants} min={2} max={16} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
