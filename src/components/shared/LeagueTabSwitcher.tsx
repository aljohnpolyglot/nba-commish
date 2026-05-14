import React from 'react';
import { useGame } from '../../store/GameContext';
import { getLeagueTabs, LeagueTab, LeagueTabId } from '../../utils/euroLeagueDefaults';

interface Props {
  value: LeagueTabId;
  onChange: (id: LeagueTabId) => void;
  className?: string;
  size?: 'sm' | 'md';
  // Optional: drop one or more tab ids (e.g. SportsBook drops 'nba')
  exclude?: LeagueTabId[];
}

export const LeagueTabSwitcher: React.FC<Props> = ({ value, onChange, className = '', size = 'md', exclude = [] }) => {
  const { state } = useGame();
  const tabs = getLeagueTabs(state).filter(t => !exclude.includes(t.id));
  if (tabs.length <= 1) return null;

  const pad = size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-xs';

  return (
    <div className={`inline-flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-0.5 ${className}`}>
      {tabs.map((tab: LeagueTab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`${pad} font-black uppercase tracking-wider rounded-lg transition-colors ${
              active
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
