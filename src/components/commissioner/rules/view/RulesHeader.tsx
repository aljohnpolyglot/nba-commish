import React from 'react';
import { Settings2, Trophy, Star, Calendar, UserPlus, Award, DollarSign } from 'lucide-react';
import { useLeagueLabels } from '../../../../utils/leagueLabels';

interface RulesHeaderProps {
    activeTab: string;
    setActiveTab: (tab: any) => void;
    startup?: boolean;
}

export const RulesHeader: React.FC<RulesHeaderProps> = ({
    activeTab,
    setActiveTab,
    startup = false,
}) => {
    const labels = useLeagueLabels();
    const tabs = [
        { id: 'Format', icon: Calendar, label: 'Format' },
        { id: 'NBA Cup', icon: Trophy, label: startup ? 'In-Season Cup' : labels.cupShort },
        { id: 'Economy', icon: DollarSign, label: 'Economy' },
        { id: 'Draft', icon: UserPlus, label: 'Draft' },
        { id: 'Honors', icon: Award, label: 'Honors' },
        { id: 'All-Star', icon: Star, label: 'All-Star' },
        { id: 'Game Rules', icon: Settings2, label: 'Game Rules' }
    ];

    return (
        <div className={startup
            ? 'mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'
            : 'mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'}>
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${startup ? 'bg-red-500/10' : 'bg-indigo-500/10'}`}>
                    <Settings2 className={`w-6 h-6 ${startup ? 'text-red-400' : 'text-indigo-400'}`} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">{startup ? 'League Builder' : 'League Governance'}</h2>
                    <p className="text-sm text-slate-400">Configure the structural rules and formats of the league</p>
                </div>
            </div>

            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50 p-1 no-scrollbar">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                            activeTab === tab.id
                                ? startup
                                    ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
                                    : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};
