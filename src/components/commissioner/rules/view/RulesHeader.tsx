import React from 'react';
import { Save, RotateCcw, Settings2, Trophy, Star, Calendar, UserPlus, Award, DollarSign } from 'lucide-react';
import { useLeagueLabels } from '../../../../utils/leagueLabels';

interface RulesHeaderProps {
    activeTab: string;
    setActiveTab: (tab: any) => void;
    hasConfigChanges: boolean;
    isEditable: boolean;
    isSaving: boolean;
    handleSaveConfig: () => void;
    handleResetConfig: () => void;
}

export const RulesHeader: React.FC<RulesHeaderProps> = ({
    activeTab,
    setActiveTab,
    hasConfigChanges,
    isEditable,
    isSaving,
    handleSaveConfig,
    handleResetConfig
}) => {
    const labels = useLeagueLabels();
    const lockedTitle = 'Commissioner settings are locked right now.';
    const tabs = [
        { id: 'Format', icon: Calendar, label: 'Format' },
        { id: 'NBA Cup', icon: Trophy, label: labels.cupShort },
        { id: 'Economy', icon: DollarSign, label: 'Economy' },
        { id: 'Draft', icon: UserPlus, label: 'Draft' },
        { id: 'Honors', icon: Award, label: 'Honors' },
        { id: 'All-Star', icon: Star, label: 'All-Star' },
        { id: 'Game Rules', icon: Settings2, label: 'Game Rules' }
    ];

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                    <Settings2 className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">League Governance</h2>
                    <p className="text-sm text-slate-400">Configure the structural rules and formats of the league</p>
                </div>
            </div>

            <div className="flex items-center gap-2 self-end">
                {hasConfigChanges && (
                    <div className="flex items-center gap-2 mr-2">
                        <button
                            onClick={handleResetConfig}
                            disabled={!isEditable}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                            title={isEditable ? 'Reset Changes' : lockedTitle}
                        >
                            <RotateCcw className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleSaveConfig}
                            disabled={!isEditable || isSaving}
                            title={isEditable ? 'Save Changes' : lockedTitle}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/20"
                        >
                            {isSaving ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Save className="w-5 h-5" />
                            )}
                            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-900/50 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                            activeTab === tab.id
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
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
