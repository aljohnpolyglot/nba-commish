import React, { useState, useMemo } from 'react';
import { normalizeDate } from '../../utils/helpers';
import {
  Inbox, MessageSquare, Newspaper, Activity, Trophy, Sparkles,
  User, Calendar, BarChart2, TrendingUp,
  Search, Users, Star, Building2, Settings2, ChevronDown,
  ListOrdered, Stethoscope, Tv, ThumbsUp, Eye, DollarSign,
  Target, Ticket, Table2, Zap, UserX, UserPlus, ArrowRightLeft, Cpu, GitPullRequest, ShoppingBag, BookOpen, ClipboardList, Briefcase, Crown, ArrowLeftRight, Globe2,
  Landmark, Megaphone, Plane, HeartPulse, Hammer, IdCard, Telescope, Repeat, Banknote
} from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { useLeagueLabels } from '../../utils/leagueLabels';
import { Tab } from '../../types';
import {
  getTradeDeadlineDate,
  getCurrentOffseasonEffectiveFAStart,
  getOpeningNightDate,
  getTrainingCampDate,
  getDraftDate,
  getRolloverDate,
  isFreeAgentMarketAccessible,
  isDraftBlockedByUnresolvedPlayoffs,
  toISODateString,
} from '../../utils/dateUtils';
import { isNoDraftLeague } from '../../services/offseason/offseasonState';
import { isPbaTradeWindowOpen } from '../../services/pba/tradeWindow';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../utils/uiMode';
import { userParticipatesInCompetition } from '../../utils/euroLeagueDefaults';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { isTwitterAvailable } from '../../utils/mediaTimeline';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getBankSponsorAccess } from '../../services/tycoon/sponsorBenefits';
import { getOutstandingBankPrincipal } from '../../services/tycoon/bankEngine';
import { getCommissionerTaskViews, isCommissionerTaskTerminal } from '../../services/commissionerTasks/taskRegistry';
import {
  ensureFranchiseOperations,
  getFranchiseTaskItems,
  isFranchiseExperienceAvailable,
} from '../../services/franchises/franchiseState';
import { isSummerLeagueEnabled } from '../../services/summerLeague/availability';
import { isNbaCupEnabled } from '../../utils/ruleFlags';
import { resolveLeagueSeasonLifecycle } from '../../services/lifecycle/leagueSeasonLifecycle';

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
  const labels = useLeagueLabels();
  const isGM = state.gameMode === 'gm';
  const godModeEnabled = state.godModeEnabled === true;
  const noDraft = isNoDraftLeague(state.leagueStats as any);
  const tradesDisabled = state.leagueStats?.tradesAllowed === false;
  const euroIsolated = isEuroIsolatedMode(state);
  const pbaIsolated = isPbaIsolatedMode(state);
  const canonicalDraftComplete = resolveLeagueSeasonLifecycle(state).draft.draft === 'complete';
  const franchiseAvailable = isFranchiseExperienceAvailable(state);
  const mainPlayoffsEnabled = state.leagueStats?.playoffsEnabled !== false;
  const nbaCupEnabled = isNbaCupEnabled(state.leagueStats);
  const socialFeedAvailable = isTwitterAvailable(state.date, state.leagueStats?.year);
  const managedTeam = resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? []);
  const managedTycoon = (managedTeam as any)?.tycoon;
  const showBank = !!managedTycoon && (!!getBankSponsorAccess(managedTycoon) || getOutstandingBankPrincipal(managedTycoon) > 0);

  // Trade deadline + FA period detection for GM mode gating
  // Dates resolved dynamically via dateUtils.resolveSeasonDate (day-of-week aware).
  const currentDateNorm = normalizeDate(state.date ?? '');
  const seasonYear = state.leagueStats?.year ?? new Date().getFullYear();
  const tradeDeadline = toISODateString(getTradeDeadlineDate(seasonYear, state.leagueStats));
  const faStartDate = getCurrentOffseasonEffectiveFAStart(`${currentDateNorm}T00:00:00Z`, state.leagueStats, state.schedule as any);
  const faStart = toISODateString(faStartDate);
  const trainingCampStart = toISODateString(getTrainingCampDate(seasonYear, state.leagueStats));
  const openingNight = toISODateString(getOpeningNightDate(seasonYear, state.leagueStats, state.schedule));

  // Trades reopen once the NBA Finals end (bracketComplete) OR once it's draft day —
  // dynamic draft dates can fall before Game 7, and draft-night trades are real.
  const finalsOver = !!(state.playoffs?.bracketComplete);
  const draftDate = toISODateString(getDraftDate(seasonYear, state.leagueStats));
  const rolloverDate = toISODateString(getRolloverDate(seasonYear, state.leagueStats, state.schedule));
  const isDraftDayOrLater = currentDateNorm >= draftDate;
  const fantasyDraftActive = state.leagueType === 'fictional'
    && state.leagueStats.fictionalRosterMode === 'fantasy_draft'
    && state.leagueStats.fictionalFantasyDraftCompleted !== true;
  const pbaDraftActive = pbaIsolated
    && !canonicalDraftComplete
    && state.offseasonChecklist?.pbaDraft === 'in-progress'
    && (state.leagueStats as any)?.pbaConferencePhase === 'offseason'
    && isDraftDayOrLater;
  const nbaDraftActive = !pbaIsolated
    && !canonicalDraftComplete
    && currentDateNorm >= draftDate
    && currentDateNorm <= rolloverDate
    && !isDraftBlockedByUnresolvedPlayoffs(state);
  const draftActive = fantasyDraftActive || pbaDraftActive || nbaDraftActive;
  const isPastTradeDeadline = isGM && !finalsOver && !isDraftDayOrLater && currentDateNorm > tradeDeadline && currentDateNorm < faStart;
  const pbaTradeWindowClosed = pbaIsolated && !isPbaTradeWindowOpen(state);
  const tradeNavOpen = !tradesDisabled && !pbaTradeWindowClosed && (!isPastTradeDeadline || pbaIsolated);
  const showFATabInGM = !!state.date && isFreeAgentMarketAccessible(
    state.date,
    seasonYear,
    state.leagueStats as any,
    state.schedule as any,
  );

  const pendingTradesCount   = (state.tradeProposals || []).filter(p => p.status === 'pending').length;
  const unreadCount          = (state.inbox      || []).filter(e  => !e.read).length;
  const socialCount          = (state.socialFeed  || []).filter(p  => p.isNew).length;
  const newsCount            = (state.news        || []).filter(n  => n.isNew).length;
  const unreadMessagesCount  = (state.chats       || []).reduce((a, c) => a + c.unreadCount, 0);
  const hasUnreadPayslip     = state.hasUnreadPayslip;
  const commissionerTaskViews = isGM ? [] : getCommissionerTaskViews(state);
  const commissionerTaskCount = isGM
    ? 0
    : commissionerTaskViews.filter(task =>
        !isCommissionerTaskTerminal(task.status) && (task.available || task.status === 'in_progress' || task.overdue),
      ).length;
  const franchiseBadge = (() => {
    if (!franchiseAvailable) return undefined;
    if (isGM && managedTeam && 'id' in managedTeam) {
      const status = state.offseasonChecklist?.sponsorRenewals;
      const due = getFranchiseTaskItems(
        ensureFranchiseOperations(state, managedTeam),
        state.leagueStats,
      );
      return due.length > 0 && (status === 'pending' || status === 'in-progress')
        ? '!'
        : undefined;
    }
    const task = commissionerTaskViews.find(item => item.taskId === 'franchise_event_sponsorships');
    return task && !isCommissionerTaskTerminal(task.status)
      && (task.available || task.status === 'in_progress' || task.overdue)
      ? '!'
      : undefined;
  })();

  const fmt = (n: number) => (n > 99 ? '99+' : n);
  const draftScoutingBadge =
    isGM &&
    state.draftCombineResultsAvailableYear === seasonYear &&
    state.draftCombineResultsViewedYear !== seasonYear
      ? '!'
      : undefined;
  const worldScoutingBadge = (state.euroScouting?.assignments ?? [])
    .filter(assignment => assignment.status === 'ready' && !assignment.reviewed)
    .length;

  const playoffBadge = (() => {
    if (!state.playoffs) return 0;
    if (state.playoffs.bracketComplete) return 0;
    if (state.playoffs.gamesInjected) return '•';
    return 0;
  })();

  const broadcastingBadge = (() => {
    const renewal = commissionerTaskViews.find(task => task.taskId === 'media_rights_renewal');
    return renewal && !isCommissionerTaskTerminal(renewal.status) && (renewal.available || renewal.overdue) ? '!' : 0;
  })();

  const primaryCompetitionId = state.euroPrimaryCompetitionId ?? 'endesa';
  const primaryCompetition = state.activeCompetitions?.find(competition => competition.id === primaryCompetitionId);
  const primaryCompetitionLabel = primaryCompetition?.displayName ?? state.leagueStats?.leagueName ?? 'Domestic League';
  const visibleSecondaryCompetitions = (state.activeCompetitions ?? []).filter(competition => (
    competition.id !== primaryCompetitionId
    && ['euroleague', 'eurocup'].includes(competition.id)
    && userParticipatesInCompetition(state as any, competition.id)
  ));

  const euroGmGroups: NavGroup[] = [
    {
      label: 'My Team',
      items: [
        { id: 'Schedule' as Tab, label: 'Schedule', icon: Calendar },
        { id: 'Team Office' as Tab, label: 'Team Office', icon: Briefcase },
        { id: 'Coaching' as Tab, label: 'Coaching', icon: ClipboardList },
        { id: 'Training Center' as Tab, label: 'Training', icon: Activity },
        { id: 'Euro Scouting' as Tab, label: 'World Scouting', icon: Telescope, badge: worldScoutingBadge ? fmt(worldScoutingBadge) : undefined },
        { id: 'Youth Academy' as Tab, label: 'Youth Academy', icon: Target },
      ],
    },
    {
      label: 'Front Office',
      items: [
        { id: 'Front Office Finances' as Tab,        label: 'Finances',        icon: Landmark },
        { id: 'Front Office Sponsorships' as Tab,    label: 'Sponsorships',    icon: Megaphone },
        { id: 'Front Office Commercial' as Tab,      label: 'Commercial',      icon: ShoppingBag },
        ...(showBank ? [{ id: 'Front Office Bank' as Tab, label: 'Bank', icon: Banknote }] : []),
        { id: 'Front Office Transfer Market' as Tab, label: 'Transfer Market', icon: Repeat },
        { id: 'Front Office Staff' as Tab,           label: 'Staff',           icon: IdCard },
        { id: 'Front Office Facilities' as Tab,      label: 'Facilities',      icon: Hammer },
      ],
    },
    {
      label: 'Competitions',
      items: [
        { id: 'Endesa Hub' as Tab, label: primaryCompetitionLabel, icon: Trophy },
        ...visibleSecondaryCompetitions.map(competition => ({
          id: (competition.id === 'eurocup' ? 'EuroCup Hub' : 'Euroleague Hub') as Tab,
          label: competition.displayName,
          icon: Globe2,
        })),
      ],
    },
    {
      label: 'Squad',
      items: [
        { id: 'Player Search' as Tab,     label: 'Player Search',     icon: Search },
        { id: 'Player Bios' as Tab,       label: 'Player Bios',       icon: Users },
        { id: 'Player Comparison' as Tab, label: 'Player Comparison', icon: ArrowLeftRight },
        { id: 'Free Agents' as Tab,       label: 'Free Agents',       icon: UserX },
      ],
    },
    {
      label: 'Communications',
      items: [
        { id: 'Inbox' as Tab, label: 'Inbox', icon: Inbox, badge: fmt(unreadCount) },
        { id: 'Messages' as Tab,    label: 'Messages',    icon: MessageSquare, badge: fmt(unreadMessagesCount) },
        ...(socialFeedAvailable ? [{ id: 'Social Feed' as Tab, label: 'Social Feed', icon: Activity,      badge: fmt(socialCount) }] : []),
        { id: 'League News' as Tab, label: 'League News', icon: Newspaper,     badge: fmt(newsCount) },
        { id: 'Transactions' as Tab, label: 'Transactions', icon: ArrowRightLeft },
      ],
    },
  ];

  const groups: NavGroup[] = isGM && euroIsolated ? euroGmGroups : [
    {
      label: isGM ? 'My Team' : 'Command Center',
      items: [
        { id: 'Schedule' as Tab,  label: 'Schedule',  icon: Calendar },
        ...(!isGM ? [
          { id: 'Commissioner Tasks' as Tab, label: 'Commissioner Tasks', icon: ClipboardList, badge: commissionerTaskCount ? fmt(commissionerTaskCount) : undefined },
          { id: 'Actions' as Tab,   label: 'Actions',   icon: Sparkles },
          ...(franchiseAvailable
            ? [{ id: 'Franchises' as Tab, label: 'Franchises', icon: Building2, badge: franchiseBadge }]
            : []),
        ] : []),
        ...(isGM && !euroIsolated ? [
          { id: 'Team Office' as Tab, label: 'Team Office', icon: Briefcase },
          { id: 'Coaching' as Tab, label: 'Coaching', icon: ClipboardList },
          { id: 'Training Center' as Tab, label: 'Training Center', icon: Activity },
          ...(franchiseAvailable
            ? [{ id: 'Franchises' as Tab, label: 'Franchises', icon: Building2, badge: franchiseBadge }]
            : []),
        ] : []),
        ...(isGM && euroIsolated ? [
          { id: 'Coaching' as Tab, label: 'Coaching', icon: ClipboardList },
          { id: 'Training Center' as Tab, label: 'Training', icon: Activity },
        ] : []),
      ],
    },
    ...(isGM && euroIsolated ? [{
      label: 'Front Office',
      items: [
        { id: 'Front Office Finances' as Tab,        label: 'Finances',          icon: Landmark },
        { id: 'Front Office Sponsorships' as Tab,    label: 'Sponsorships',      icon: Megaphone },
        { id: 'Front Office Commercial' as Tab,      label: 'Commercial',        icon: ShoppingBag },
        ...(showBank ? [{ id: 'Front Office Bank' as Tab, label: 'Bank', icon: Banknote }] : []),
        { id: 'Front Office Transfer Market' as Tab, label: 'Transfer Market',   icon: Repeat },
        { id: 'Front Office Staff' as Tab,           label: 'Staff',             icon: IdCard },
        { id: 'Front Office Facilities' as Tab,      label: 'Facilities',        icon: Hammer },
      ],
    }] : []),
    // NBA GM mode gets ONLY the Staff entry (signings / fires / personnel
    // actions) — no Finances / Sponsorships / Facilities, those are euro-only.
    ...(isGM && !euroIsolated ? [{
      label: 'Front Office',
      items: [
        { id: 'Front Office Staff' as Tab, label: 'Staff', icon: IdCard },
      ],
    }] : []),
    ...(!isGM && !pbaIsolated ? [{
      label: 'Season',
      items: [
        ...(() => {
          const currentNorm = normalizeDate(state.date ?? '');
          const isPreseason = currentNorm >= trainingCampStart && currentNorm < openingNight;
          return (!state.seasonPreviewDismissed && (state.seasonHistory ?? []).length > 0 && isPreseason)
            ? [{ id: 'Season Preview' as Tab, label: 'Season Preview', icon: Sparkles, badge: '!' as string }]
            : [];
        })(),
        ...(!euroIsolated && !pbaIsolated ? [{ id: 'All-Star' as Tab, label: 'All-Star', icon: Star }] : []),
        ...(!euroIsolated && !pbaIsolated && nbaCupEnabled ? [{ id: 'NBA Cup' as Tab, label: labels.cupShort, icon: Trophy }] : []),
        ...(!euroIsolated && !pbaIsolated && isSummerLeagueEnabled(state.leagueStats, state.leagueStats?.year ?? new Date().getFullYear()) ? [{ id: 'Summer League' as Tab, label: 'Summer League', icon: Trophy }] : []),
        ...(!euroIsolated && !pbaIsolated && state.leagueType !== 'fictional' ? [{ id: 'International' as Tab, label: 'International', icon: Globe2 }] : []),
        ...(euroIsolated || mainPlayoffsEnabled ? [{ id: 'Playoffs' as Tab, label: 'Playoffs', icon: Trophy, badge: playoffBadge }] : []),
      ],
    }] : [{
      label: 'Season',
      items: [
        ...(!euroIsolated && (!pbaIsolated || isGM) ? [{ id: 'All-Star' as Tab, label: 'All-Star', icon: Star }] : []),
        ...(!euroIsolated && !pbaIsolated && nbaCupEnabled ? [{ id: 'NBA Cup' as Tab, label: labels.cupShort, icon: Trophy }] : []),
        ...(!euroIsolated && !pbaIsolated && isSummerLeagueEnabled(state.leagueStats, state.leagueStats?.year ?? new Date().getFullYear()) ? [{ id: 'Summer League' as Tab, label: 'Summer League', icon: Trophy }] : []),
        ...(!euroIsolated && !pbaIsolated && state.leagueType !== 'fictional' ? [{ id: 'International' as Tab, label: 'International', icon: Globe2 }] : []),
        ...(euroIsolated || pbaIsolated || mainPlayoffsEnabled ? [{ id: 'Playoffs' as Tab, label: 'Playoffs', icon: Trophy, badge: playoffBadge }] : []),
      ],
    }]),
    {
      label: 'Communications',
      items: [
        { id: 'Inbox' as Tab,        label: 'Inbox',        icon: Inbox,          badge: fmt(unreadCount) },
        { id: 'Messages' as Tab,     label: 'Messages',     icon: MessageSquare,  badge: fmt(unreadMessagesCount) },
        ...(socialFeedAvailable ? [{ id: 'Social Feed' as Tab,  label: 'Social Feed',  icon: Activity,       badge: fmt(socialCount) }] : []),
        { id: 'League News' as Tab,  label: 'League News',  icon: Newspaper,      badge: fmt(newsCount) },
      ],
    },
    {
      label: 'League',
      items: [
        { id: 'NBA Central' as Tab,      label: labels.central,    icon: Trophy },
        { id: 'Standings' as Tab,        label: 'Standings',       icon: Table2 },
        { id: 'Transactions' as Tab,     label: 'Transactions',    icon: ArrowRightLeft },
        ...(tradeNavOpen ? [
          { id: 'Trade Machine' as Tab,    label: !pbaIsolated && isPastTradeDeadline ? 'Trade Machine (Locked)' : 'Trade Machine',   icon: Cpu },
          { id: 'Trade Finder' as Tab,     label: 'Trade Finder',    icon: Search },
        ] : []),
        ...(isGM && tradeNavOpen ? [{ id: 'Trade Proposals' as Tab, label: 'Trade Proposals', icon: GitPullRequest, badge: fmt(pendingTradesCount) }] : []),
        { id: 'Player Search' as Tab,    label: 'Player Search',   icon: Search },
        { id: 'Player Bios' as Tab,        label: 'Player Bios',       icon: Users },
        { id: 'Player Comparison' as Tab,  label: 'Player Comparison', icon: ArrowLeftRight },
        ...(!isGM || showFATabInGM ? [{ id: 'Free Agents' as Tab, label: 'Free Agents', icon: UserX }] : []),
        { id: 'Injuries' as Tab,         label: 'Injuries',        icon: Stethoscope },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { id: 'Player Stats' as Tab,    label: 'Player Stats',    icon: BarChart2 },
        { id: 'Player Ratings' as Tab,  label: 'Player Ratings',  icon: BarChart2 },
        { id: 'Team Stats' as Tab,      label: 'Team Stats',      icon: Users },
        { id: 'Award Races' as Tab,     label: 'Award Races',     icon: TrendingUp },
        { id: 'Statistical Feats' as Tab, label: 'Statistical Feats', icon: Zap },
        { id: 'League Leaders' as Tab,  label: 'League Leaders',  icon: ListOrdered },
        { id: 'League History' as Tab,  label: 'League History',  icon: Trophy },
        { id: 'Team History' as Tab,    label: 'Team History',    icon: BookOpen },
        ...(!pbaIsolated ? [{ id: 'Hall of Fame' as Tab, label: 'Hall of Fame', icon: Crown }] : []),
        { id: 'Power Rankings' as Tab,  label: 'Power Rankings',  icon: TrendingUp },
      ],
    },
    ...(!noDraft ? [{
      label: 'Draft',
      items: [
        { id: 'Draft Scouting' as Tab, label: 'Scouting',      icon: Target, badge: draftScoutingBadge },
        ...(!pbaIsolated && isDraftLotteryEnabled(state.leagueStats?.draftType) ? [{ id: 'Draft Lottery' as Tab, label: 'Draft Lottery', icon: Ticket }] : []),
        { id: 'Draft History' as Tab, label: 'Draft History', icon: BookOpen },
        ...(draftActive ? [{ id: 'Draft Board' as Tab, label: 'Draft Board', icon: ClipboardList }] : []),
      ],
    }] : []),
    // ── International league hubs (commented out — user has a better design in mind) ──
    // ...(state.leagueType !== 'fictional' ? [{
    //   label: 'International',
    //   items: [
    //     { id: 'Euroleague Hub' as Tab,    label: 'Euroleague',    icon: Globe2 },
    //     { id: 'Endesa Hub' as Tab,        label: 'Liga ACB',      icon: Globe2 },
    //     { id: 'G-League Hub' as Tab,      label: 'G-League',      icon: Globe2 },
    //     { id: 'WNBA Hub' as Tab,          label: 'WNBA',          icon: Globe2 },
    //     { id: 'B-League Hub' as Tab,      label: 'B-League',      icon: Globe2 },
    //     { id: 'China CBA Hub' as Tab,     label: 'China CBA',     icon: Globe2 },
    //     { id: 'NBL Australia Hub' as Tab, label: 'NBL Australia', icon: Globe2 },
    //     { id: 'PBA Hub' as Tab,           label: 'PBA',           icon: Globe2 },
    //   ],
    // }] : []),
    {
      label: 'Operations',
      items: [
        ...(isGM ? [] : [
          { id: 'Team Office' as Tab, label: 'Team Office', icon: Briefcase },
          { id: 'Coaching' as Tab, label: 'Coaching', icon: ClipboardList },
          { id: 'Training Center' as Tab, label: 'Training Center', icon: Activity },
        ]),
        ...(!isGM ? [
          { id: 'League Office' as Tab,    label: 'League Office',   icon: Building2 },
        ] : []),
        ...(godModeEnabled ? [
          { id: 'Player Creator' as Tab,   label: 'Player Creator',  icon: UserPlus },
        ] : []),
        ...(!isGM ? [
          { id: 'League Settings' as Tab,  label: 'League Settings', icon: Settings2 },
          { id: 'Broadcasting' as Tab,     label: 'Broadcasting',    icon: Tv, badge: broadcastingBadge },
        ] : []),
        ...(!pbaIsolated ? [{ id: 'League Finances' as Tab, label: 'Team Finances', icon: DollarSign }] : []),
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
                      <div className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                        <item.icon
                          size={15}
                          className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`}
                        />
                        <span className="min-w-0 text-left text-sm font-medium leading-tight">{item.label}</span>
                      </div>
                      {hasBadge && (
                        <span className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
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
