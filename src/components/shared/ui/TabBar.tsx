import React from 'react';

export interface TabDef {
  id: string;
  label: string;
}

interface TabBarProps {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Reusable horizontal tab bar.
 * Active tab gets an indigo bottom border; inactive tabs are muted.
 *
 * Usage:
 *   <TabBar
 *     tabs={[{ id: 'overview', label: 'Overview' }, { id: 'log', label: 'Game Log' }]}
 *     active={activeTab}
 *     onChange={setActiveTab}
 *   />
 */
export const TabBar: React.FC<TabBarProps> = ({ tabs, active, onChange, className = '' }) => (
  <div className={`flex border-b border-white/10 overflow-x-auto no-scrollbar ${className}`}>
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`px-3 md:px-6 py-3 text-xs md:text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 ${
          active === tab.id
            ? 'border-indigo-500 text-white'
            : 'border-transparent text-slate-500 hover:text-slate-300'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);
