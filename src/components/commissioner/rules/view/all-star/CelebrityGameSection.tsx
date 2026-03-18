import React from 'react';
import { Users, Settings2, AlertTriangle } from 'lucide-react';

interface CelebrityGameSectionProps {
    celebrityGameEnabled: boolean;
    setCelebrityGameEnabled: (val: boolean) => void;
    celebrityGameMirrorLeagueRules: boolean;
    setCelebrityGameMirrorLeagueRules: (val: boolean) => void;
}

export const CelebrityGameSection: React.FC<CelebrityGameSectionProps> = (props) => {
    const [showWarning, setShowWarning] = React.useState(false);

    const handleToggle = () => {
        if (props.celebrityGameEnabled) {
            setShowWarning(true);
        } else {
            props.setCelebrityGameEnabled(true);
        }
    };

    const confirmDisable = () => {
        props.setCelebrityGameEnabled(false);
        setShowWarning(false);
    };

    return (
        <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users size={16} className="text-pink-400" />
                    <h2 className="text-lg font-black text-white uppercase tracking-tight">Celebrity Game</h2>
                </div>
                <button 
                    onClick={handleToggle} 
                    className={`w-10 h-5 rounded-full transition-all duration-200 relative ${props.celebrityGameEnabled ? 'bg-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-700'}`}
                >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.celebrityGameEnabled ? 'left-6' : 'left-1'}`} />
                </button>
            </div>

            {showWarning && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl space-y-3 animate-in fade-in zoom-in duration-200">
                    <div className="flex items-center gap-2 text-rose-400">
                        <AlertTriangle size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Warning</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                        Disabling the Celebrity Game will remove the Celebrity Roster management from your Season Actions. This cannot be undone for the current season.
                    </p>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={confirmDisable}
                            className="px-3 py-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-lg hover:bg-rose-600 transition-colors uppercase"
                        >
                            Disable Anyway
                        </button>
                        <button 
                            onClick={() => setShowWarning(false)}
                            className="px-3 py-1.5 bg-slate-800 text-slate-300 text-[10px] font-bold rounded-lg hover:bg-slate-700 transition-colors uppercase"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {props.celebrityGameEnabled && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="pt-4 border-t border-slate-800/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Settings2 size={14} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mirror League Rules</span>
                            </div>
                            <button 
                                onClick={() => props.setCelebrityGameMirrorLeagueRules(!props.celebrityGameMirrorLeagueRules)} 
                                className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.celebrityGameMirrorLeagueRules ? 'bg-indigo-500' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.celebrityGameMirrorLeagueRules ? 'left-4.5' : 'left-0.5'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
