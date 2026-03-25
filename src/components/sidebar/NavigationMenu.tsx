import React, { useState } from 'react';
import {
  Inbox, MessageSquare, Newspaper, Activity, Trophy, Sparkles,
  LayoutDashboard, User, Calendar, BarChart2, TrendingUp,
  Search, Users, Star, Building2, Settings2, ChevronDown,
  ListOrdered, Stethoscope, Tv, ThumbsUp, Eye, DollarSign,
  Target, Ticket
} from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { Tab } from '../../types';

interface NavigationMenuProps {
  currentView: Tab;
  onViewChange: (view: Tab) => void;
  onClose: () => void;
}

interface NavItem {
  id: Tab;
  label: string;
  icon: any;
  badge?: number | string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NavigationMenu: React.FC<NavigationMenuProps> = ({ currentView, onViewChange, onClose }) => {
  const { state, markSocialRead, markNewsRead, markPayslipsRead } = useGame();

  const unreadCount          = (state.inbox      || []).filter(e  => !e.read).length;
  const socialCount          = (state.socialFeed  || []).filter(p  => p.isNew).length;
  const newsCount            = (state.news        || []).filter(n  => n.isNew).length;
  const unreadMessagesCount  = (state.chats       || []).reduce((a, c) => a + c.unreadCount, 0);
  const hasUnreadPayslip     = state.hasUnreadPayslip;

  const fmt = (n: number) => (n > 99 ? '99+' : n);

  const playoffBadge = (() => {
    if (!state.playoffs) return 0;
    if (state.playoffs.bracketComplete) return 0;
    if (state.playoffs.gamesInjected) return '•';
    return 0;
  })();

  const broadcastingBadge = (() => {
    if (state.leagueStats.mediaRights?.isLocked) return 0;
    if (new Date(state.date) >= new Date('2025-10-24')) return 0;
    return '!';
  })();

  const groups: NavGroup[] = [
    {
      label: 'Command Center',
      items: [
        { id: 'Commissioner', label: 'Dashboard',        icon: LayoutDashboard },
        { id: 'Actions',      label: 'Actions',          icon: Sparkles },
        { id: 'Approvals',    label: 'Approvals',        icon: ThumbsUp },
        { id: 'Viewership',   label: 'Viewership',       icon: Eye },
        { id: 'Finances',     label: 'Finances',         icon: DollarSign },
      ],
    },
    {
      label: 'Communications',
      items: [
        { id: 'Inbox',        label: 'Inbox',        icon: Inbox,          badge: fmt(unreadCount) },
        { id: 'Messages',     label: 'Messages',     icon: MessageSquare,  badge: fmt(unreadMessagesCount) },
        { id: 'Social Feed',  label: 'Social Feed',  icon: Activity,       badge: fmt(socialCount) },
        { id: 'League News',  label: 'League News',  icon: Newspaper,      badge: fmt(newsCount) },
      ],
    },
    {
      label: 'League',
      items: [
        { id: 'NBA Central', label: 'NBA Central', icon: Trophy },
        { id: 'Schedule',    label: 'Schedule',    icon: Calendar },
        { id: 'Players',     label: 'Players',     icon: Search },
        { id: 'All-Star',    label: 'All-Star',    icon: Star },
        { id: 'Playoffs',    label: 'Playoffs',    icon: Trophy, badge: playoffBadge },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { id: 'Player Stats',   label: 'Player Stats',   icon: BarChart2 },
        { id: 'Team Stats',     label: 'Team Stats',     icon: Users },
        { id: 'Award Races',    label: 'Award Races',    icon: TrendingUp },
        { id: 'League Leaders', label: 'League Leaders', icon: ListOrdered },
        { id: 'Injuries',       label: 'Injuries',       icon: Stethoscope },
      ],
    },
    {
      label: 'Draft',
      items: [
        { id: 'Draft Scouting', label: 'Scouting',      icon: Target },
        { id: 'Draft Lottery',  label: 'Draft Lottery', icon: Ticket },
      ],
    },
    {
      label: 'Operations',
      items: [
        { id: 'League Office',   label: 'League Office',   icon: Building2 },
        { id: 'League Settings', label: 'League Settings', icon: Settings2 },
        { id: 'Broadcasting',    label: 'Broadcasting',    icon: Tv, badge: broadcastingBadge },
      ],
    },
    {
      label: 'Personal',
      items: [
        { id: 'Personal', label: 'Personal Wealth', icon: User, badge: hasUnreadPayslip ? 1 : 0 },
      ],
    },
  ];

  // All groups expanded by default
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleNavClick = (item: NavItem) => {
    if (item.id === 'Social Feed') markSocialRead();
    else if (item.id === 'League News') markNewsRead();
    else if (item.id === 'Personal') markPayslipsRead();
    onViewChange(item.id);
    onClose();
  };

  return (
    <div className="space-y-1 mb-6">
      {groups.map(group => {
        const isCollapsed = collapsed[group.label] ?? false;
        const hasActiveMember = group.items.some(i => i.id === currentView);

        return (
          <div key={group.label}>
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.label)}
              className="w-full flex items-center justify-between px-2 py-1.5 mt-3 mb-0.5 group"
            >
              <span className={`text-[9px] font-black uppercase tracking-[0.15em] transition-colors ${
                hasActiveMember ? 'text-indigo-400' : 'text-slate-600 group-hover:text-slate-500'
              }`}>
                {group.label}
              </span>
              <ChevronDown
                size={11}
                className={`text-slate-700 group-hover:text-slate-500 transition-transform duration-200 ${
                  isCollapsed ? '-rotate-90' : ''
                }`}
              />
            </button>

            {/* Group items */}
            {!isCollapsed && (
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const isActive = currentView === item.id;
                  const hasBadge = item.badge !== undefined && item.badge !== 0 && item.badge !== '0';
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-150 ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                          : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <item.icon
                          size={15}
                          className={isActive ? 'text-white' : 'text-slate-500'}
                        />
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      {hasBadge && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          item.badge === '!'
                            ? isActive ? 'bg-white text-amber-600' : 'bg-amber-500 text-white animate-pulse'
                            : isActive ? 'bg-white text-indigo-600' : 'bg-indigo-500 text-white'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
