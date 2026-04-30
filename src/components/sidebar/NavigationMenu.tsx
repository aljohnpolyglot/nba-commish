import React, { useState, useMemo } from 'react';
import { normalizeDate } from '../../utils/helpers';
import {
  Inbox, MessageSquare, Newspaper, Activity, Trophy, Sparkles,
  User, Calendar, BarChart2, TrendingUp,
  Search, Users, Star, Building2, Settings2, ChevronDown,
  ListOrdered, Stethoscope, Tv, ThumbsUp, Eye, DollarSign,
  Target, Ticket, Table2, Zap, UserX, UserPlus, ArrowRightLeft, Cpu, GitPullRequest, ShoppingBag, BookOpen, Clock, ClipboardList, Briefcase, Crown, ArrowLeftRight
} from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { Tab } from '../../types';
import { getAllStarWeekendDates } from '../../services/allStar/AllStarWeekendOrchestrator';
import { getTradeDeadlineDate, getFreeAgencyStartDate, getOpeningNightDate, toISODateString } from '../../utils/dateUtils';

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
  const isGM = state.gameMode === 'gm';

  // Trade deadline + FA period detection for GM mode gating
  // Dates resolved dynamically via dateUtils.resolveSeasonDate (day-of-week aware).
  const currentDateNorm = normalizeDate(state.date ?? '');
  const seasonYear = state.leagueStats?.year ?? 2026;
  const tradeDeadline = toISODateString(getTradeDeadlineDate(seasonYear, state.leagueStats));
  const faStart = toISODateString(getFreeAgencyStartDate(seasonYear, state.leagueStats));
  const faEnd = `${seasonYear}-10-01`; // dead period ends at training camp
  const openingNight = toISODateString(getOpeningNightDate(seasonYear));

  // Trades reopen once the NBA Finals end (bracketComplete) — covers draft day, offseason, etc.
  const finalsOver = !!(state.playoffs?.bracketComplete);
  const isPastTradeDeadline = isGM && !finalsOver && currentDateNorm > tradeDeadline && currentDateNorm < faStart;
  const isFreeAgencyPeriod = currentDateNorm >= faStart && currentDateNorm < faEnd;
  // Year-round regular-season FA: between opening night and next FA start
  const regularSeasonFAEnabled = state.leagueStats?.regularSeasonFAEnabled ?? true;
  const isRegularSeasonSigningWindow = regularSeasonFAEnabled && currentDateNorm >= openingNight && currentDateNorm < faStart;
  // Post-Finals pre-FA offseason: after playoffs wrap up, GM should still see impending FAs.
  // Fires whenever date is before the next FA start AND before opening night — i.e. summer dead zone.
  const isOffseasonPreFA = currentDateNorm < faStart && currentDateNorm < openingNight;
  // Show FA tab in GM mode during: FA window OR regular season OR offseason pre-FA
  const showFATabInGM = isFreeAgencyPeriod || isRegularSeasonSigningWindow || isOffseasonPreFA;

  const pendingTradesCount   = (state.tradeProposals || []).filter(p => p.status === 'pending').length;
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
    const broadcastDeadline = `${state.leagueStats.year ?? 2026}-06-30`;
    if (new Date(state.date) >= new Date(broadcastDeadline)) return 0;
    return '!';
  })();

  const seasonalBadge = (() => {
    const currentDate = new Date(state.date);
    const season = state.leagueStats.year || 2026;
    const dates = getAllStarWeekendDates(season);
    const allStar = state.allStar;
    const URGENT = 7; // days

    const urgentDeadline = (deadline: Date, done: boolean) => {
      if (done) return false;
      const days = Math.ceil((deadline.getTime() - currentDate.getTime()) / 86400000);
      return days >= 0 && days <= URGENT;
    };

    let count = 0;
    // Rig voting: open + starters announced + not yet rigged
    if (urgentDeadline(dates.votingEnd, !!(allStar?.hasRiggedVoting) || !(allStar?.startersAnnounced))) count++;
    // Celebrity Game roster
    if (urgentDeadline(dates.celebrityAnnounced, !!(allStar?.celebrityAnnounced))) count++;
    // Dunk contest
    if (urgentDeadline(dates.dunkContestAnnounced, false)) count++;
    // 3-Point contest
    if (urgentDeadline(dates.threePointAnnounced, false)) count++;
    // Injured All-Star waiting for replacement
    const hasInjury = !!(allStar?.startersAnnounced) &&
      (allStar?.roster ?? []).some((r: any) => {
        const p = state.players.find(p => p.internalId === r.playerId);
        return p && (p as any).injury?.gamesRemaining > 0;
      });
    if (hasInjury) count++;

    return count > 0 ? count : 0;
  })();

  const groups: NavGroup[] = [
    {
      label: isGM ? 'My Team' : 'Command Center',
      items: [
        { id: 'Schedule',  label: 'Schedule',  icon: Calendar },
        ...(!isGM ? [
          { id: 'Actions' as Tab,   label: 'Actions',   icon: Sparkles },
          { id: 'Events' as Tab,    label: 'Timeline',  icon: Clock },
        ] : []),
        ...(isGM ? [{ id: 'Team Office' as Tab, label: 'Team Office', icon: Briefcase }] : []),
      ],
    },
    ...(!isGM ? [{
      label: 'Seasonal',
      items: [
        { id: 'Seasonal' as Tab,       label: 'Seasonal Actions', icon: Clock,  badge: seasonalBadge || undefined },
        ...(() => {
          const yr = state.leagueStats?.year ?? 2026;
          const currentNorm = normalizeDate(state.date ?? '');
          const oct1 = `${yr - 1}-10-01`;
          const oct25 = `${yr - 1}-10-25`; // opening night — preview badge expires after games start
          const isPreseason = currentNorm >= oct1 && currentNorm < oct25;
          return (!state.seasonPreviewDismissed && (state.seasonHistory ?? []).length > 0 && isPreseason)
            ? [{ id: 'Season Preview' as Tab, label: 'Season Preview', icon: Sparkles, badge: '!' as string }]
            : [];
        })(),
        { id: 'All-Star' as Tab,       label: 'All-Star',          icon: Star },
        { id: 'NBA Cup' as Tab,        label: 'NBA Cup',            icon: Trophy },
        { id: 'Playoffs' as Tab,       label: 'Playoffs',           icon: Trophy, badge: playoffBadge },
      ],
    }] : [{
      label: 'Season',
      items: [
        { id: 'All-Star' as Tab,  label: 'All-Star',  icon: Star },
        { id: 'NBA Cup' as Tab,   label: 'NBA Cup',   icon: Trophy },
        { id: 'Playoffs' as Tab,  label: 'Playoffs',  icon: Trophy, badge: playoffBadge },
      ],
    }]),
    {
      label: 'Communications',
      items: [
        ...(!isGM ? [
          { id: 'Inbox' as Tab,        label: 'Inbox',        icon: Inbox,          badge: fmt(unreadCount) },
        ] : []),
        { id: 'Messages' as Tab,     label: 'Messages',     icon: MessageSquare,  badge: fmt(unreadMessagesCount) },
        { id: 'Social Feed' as Tab,  label: 'Social Feed',  icon: Activity,       badge: fmt(socialCount) },
        { id: 'League News' as Tab,  label: 'League News',  icon: Newspaper,      badge: fmt(newsCount) },
      ],
    },
    {
      label: 'League',
      items: [
        { id: 'NBA Central',      label: 'NBA Central',     icon: Trophy },
        { id: 'Standings',        label: 'Standings',       icon: Table2 },
        { id: 'Transactions',     label: 'Transactions',    icon: ArrowRightLeft },
        ...(!isPastTradeDeadline ? [
          { id: 'Trade Machine' as Tab,    label: isPastTradeDeadline ? 'Trade Machine (Locked)' : 'Trade Machine',   icon: Cpu },
          { id: 'Trade Finder' as Tab,     label: 'Trade Finder',    icon: Search },
        ] : []),
        ...(isGM && !isPastTradeDeadline ? [{ id: 'Trade Proposals' as Tab, label: 'Trade Proposals', icon: GitPullRequest, badge: fmt(pendingTradesCount) }] : []),
        { id: 'Player Search',    label: 'Player Search',   icon: Search },
        { id: 'Player Bios',        label: 'Player Bios',       icon: Users },
        { id: 'Player Comparison',  label: 'Player Comparison', icon: ArrowLeftRight },
        ...(!isGM || showFATabInGM ? [{ id: 'Free Agents' as Tab, label: 'Free Agents', icon: UserX }] : []),
        { id: 'Injuries',         label: 'Injuries',        icon: Stethoscope },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { id: 'Player Stats',    label: 'Player Stats',    icon: BarChart2 },
        { id: 'Player Ratings',  label: 'Player Ratings',  icon: BarChart2 },
        { id: 'Team Stats',      label: 'Team Stats',      icon: Users },
        { id: 'Award Races',     label: 'Award Races',     icon: TrendingUp },
        { id: 'Statistical Feats', label: 'Statistical Feats', icon: Zap },
        { id: 'League Leaders',  label: 'League Leaders',  icon: ListOrdered },
        { id: 'League History',  label: 'League History',  icon: Trophy },
        { id: 'Team History',    label: 'Team History',    icon: BookOpen },
        { id: 'Hall of Fame',    label: 'Hall of Fame',    icon: Crown },
        { id: 'Power Rankings',  label: 'Power Rankings',  icon: TrendingUp },
      ],
    },
    {
      label: 'Draft',
      items: [
        { id: 'Draft Scouting', label: 'Scouting',      icon: Target },
        { id: 'Draft Lottery',  label: 'Draft Lottery', icon: Ticket },
        { id: 'Draft Board',    label: 'Draft Board',   icon: ClipboardList },
      ],
    },
    {
      label: 'Operations',
      items: [
        ...(isGM ? [] : [{ id: 'Team Office' as Tab, label: 'Team Office', icon: Briefcase }]),
        ...(!isGM ? [
          { id: 'League Office' as Tab,    label: 'League Office',   icon: Building2 },
          { id: 'Player Creator' as Tab,   label: 'Player Creator',  icon: UserPlus },
          { id: 'League Settings' as Tab,  label: 'League Settings', icon: Settings2 },
          { id: 'Broadcasting' as Tab,     label: 'Broadcasting',    icon: Tv, badge: broadcastingBadge },
        ] : []),
        { id: 'League Finances' as Tab,  label: 'Team Finances',   icon: DollarSign },
      ],
    },
    ...(!isGM ? [
      {
        label: 'Wealth',
        items: [
          { id: 'Personal' as Tab,      label: 'Payslips',      icon: User,        badge: hasUnreadPayslip ? 1 : 0 },
          { id: 'Commish Store' as Tab, label: 'Store',          icon: ShoppingBag },
          { id: 'Real Stern' as Tab,    label: 'Real Stern',     icon: Building2 },
          { id: 'Sports Book' as Tab,   label: 'Sports Book',    icon: TrendingUp },
        ],
      },
      {
        label: 'Legacy',
        items: [
          { id: 'Approvals' as Tab,  label: 'Approvals',  icon: ThumbsUp },
          { id: 'Viewership' as Tab, label: 'Viewership', icon: Eye },
          { id: 'Finances' as Tab,   label: 'Finances',   icon: DollarSign },
        ],
      },
    ] : [
      {
        label: 'Entertainment',
        items: [
          { id: 'Sports Book' as Tab,   label: 'Sports Book',    icon: TrendingUp },
        ],
      },
    ]),
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
