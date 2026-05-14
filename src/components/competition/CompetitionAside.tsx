import React from 'react';
import {
  Trophy, Table2, BarChart2, Users, ListOrdered, TrendingUp,
  Star, Zap, BookOpen, Stethoscope, History, LayoutGrid,
} from 'lucide-react';

export type CompetitionHubView =
  | 'bracket'
  | 'standings'
  | 'central'
  | 'team-history'
  | 'player-stats'
  | 'player-ratings'
  | 'team-stats'
  | 'top-scorers'
  | 'stat-feats'
  | 'power-rankings'
  | 'injuries'
  | 'mvp-race'
  | 'awards';

interface AsideItem {
  id: CompetitionHubView;
  label: string;
  icon: any;
  badge?: string;
}

interface AsideSection {
  label: string;
  items: AsideItem[];
}

const SECTIONS: AsideSection[] = [
  {
    label: 'League',
    items: [
      { id: 'central',      label: 'Central',      icon: LayoutGrid },
      { id: 'bracket',      label: 'Bracket',      icon: Trophy },
      { id: 'standings',    label: 'Standings',    icon: Table2 },
      { id: 'team-history', label: 'Team History', icon: History },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { id: 'player-stats',    label: 'Player Stats',    icon: BarChart2 },
      { id: 'player-ratings',  label: 'Player Ratings',  icon: Star },
      { id: 'team-stats',      label: 'Team Stats',      icon: Users },
      { id: 'top-scorers',     label: 'League Leaders',  icon: ListOrdered },
      { id: 'stat-feats',      label: 'Stat Feats',      icon: Zap },
      { id: 'power-rankings',  label: 'Power Rankings',  icon: TrendingUp },
      { id: 'injuries',        label: 'Injuries',        icon: Stethoscope },
    ],
  },
  {
    label: 'Drama',
    items: [
      { id: 'mvp-race',  label: 'MVP Race',  icon: TrendingUp },
      { id: 'awards',    label: 'History',   icon: BookOpen },
    ],
  },
];

interface Props {
  active: CompetitionHubView;
  onSelect: (view: CompetitionHubView) => void;
  accentColor?: string;
}

export const CompetitionAside: React.FC<Props> = ({ active, onSelect, accentColor = '#3b82f6' }) => {
  // Flatten for mobile horizontal pill bar
  const flatItems = SECTIONS.flatMap(s => s.items);
  return (
    <>
      {/* Mobile: horizontal scroll pill bar above main content */}
      <aside className="md:hidden order-first w-full bg-slate-950 border-b border-slate-800 px-2 py-2 overflow-x-auto whitespace-nowrap flex gap-1.5 scrollbar-thin">
        {flatItems.map(item => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
              style={isActive ? { backgroundColor: `${accentColor}25`, border: `1px solid ${accentColor}55` } : { border: '1px solid transparent' }}
            >
              <item.icon size={12} />
              {item.label}
            </button>
          );
        })}
      </aside>

      {/* Desktop: vertical sidebar on the RIGHT */}
      <aside className="hidden md:block md:order-last md:w-[220px] shrink-0 bg-slate-950 border-l border-slate-800 overflow-y-auto py-2">
        {SECTIONS.map(section => (
          <div key={section.label}>
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600 px-3 pt-3 pb-1">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const isActive = item.id === active;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left transition-all duration-150 border-l-[3px] ${
                      isActive
                        ? 'bg-slate-800/40 text-white font-bold'
                        : 'border-l-transparent hover:bg-slate-900/40 text-slate-400 hover:text-slate-200'
                    }`}
                    style={isActive ? { borderLeftColor: accentColor } : undefined}
                  >
                    <div className="flex items-center gap-2.5">
                      <item.icon size={14} className={isActive ? 'text-white' : 'text-slate-500'} />
                      <span className="text-[12px]">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>
    </>
  );
};
