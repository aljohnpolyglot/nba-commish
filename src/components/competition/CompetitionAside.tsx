import React from 'react';
import {
  Trophy, Table2, BarChart2, Users, ListOrdered, TrendingUp,
  Star, Zap, BookOpen, Stethoscope, History, LayoutGrid, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { CompetitionSpec } from '../../services/competition/types';

export type CompetitionHubView =
  | 'bracket'
  | 'standings'
  | 'central'
  | 'team-history'
  | 'finances'
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
  icon: LucideIcon;
  badge?: string;
}

interface AsideSection {
  label: string;
  items: AsideItem[];
}

export function getCompetitionHubSections(spec?: CompetitionSpec): AsideSection[] {
  const fullSeason = !spec || spec.format === 'regular-league' || spec.format === 'group-knockout';
  return [
    {
      label: 'Competition',
      items: [
        { id: 'central', label: 'Central', icon: LayoutGrid },
        { id: 'bracket', label: 'Bracket', icon: Trophy },
        ...(fullSeason ? [{ id: 'standings' as const, label: 'Standings', icon: Table2 }] : []),
        ...(fullSeason ? [{ id: 'team-history' as const, label: 'Team History', icon: History }] : []),
        ...(fullSeason ? [{ id: 'finances' as const, label: 'Finances', icon: Wallet }] : []),
      ],
    },
    {
      label: 'Statistics',
      items: [
        { id: 'player-stats', label: 'Player Stats', icon: BarChart2 },
        { id: 'team-stats', label: 'Team Stats', icon: Users },
        { id: 'top-scorers', label: 'Leaders', icon: ListOrdered },
        { id: 'stat-feats', label: 'Stat Feats', icon: Zap },
        ...(fullSeason ? [{ id: 'player-ratings' as const, label: 'Player Ratings', icon: Star }] : []),
        ...(fullSeason ? [{ id: 'power-rankings' as const, label: 'Power Rankings', icon: TrendingUp }] : []),
        ...(fullSeason ? [{ id: 'injuries' as const, label: 'Injuries', icon: Stethoscope }] : []),
      ],
    },
    {
      label: 'Honours',
      items: [
        ...(fullSeason ? [{ id: 'mvp-race' as const, label: 'Award Races', icon: TrendingUp }] : []),
        { id: 'awards', label: 'History', icon: BookOpen },
      ],
    },
  ];
}

export function getDefaultCompetitionHubView(spec?: CompetitionSpec): CompetitionHubView {
  return spec && (spec.format === 'knockout' || spec.format === 'tournament') ? 'bracket' : 'central';
}

export function isCompetitionHubViewAvailable(view: CompetitionHubView, spec?: CompetitionSpec): boolean {
  return getCompetitionHubSections(spec).some(section => section.items.some(item => item.id === view));
}

interface Props {
  active: CompetitionHubView;
  onSelect: (view: CompetitionHubView) => void;
  accentColor?: string;
  spec?: CompetitionSpec;
}

export const CompetitionAside: React.FC<Props> = ({ active, onSelect, accentColor = '#3b82f6', spec }) => {
  const sections = getCompetitionHubSections(spec);
  const flatItems = sections.flatMap(section => section.items);
  return (
    <>
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

      <aside className="hidden md:block md:order-last md:w-[220px] shrink-0 bg-slate-950 border-l border-slate-800 overflow-y-auto py-2">
        {sections.map(section => (
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
