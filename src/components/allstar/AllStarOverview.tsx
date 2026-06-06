import React from 'react';
import { Sparkles, Star, Target, Zap, Trophy } from 'lucide-react';
import type { AllStarTab } from './allStarTabs';

interface AllStarOverviewProps {
  phase: string;
  allStar: any;
  onNavigate: (tab: AllStarTab) => void;
  onWatchDunkContest?: () => void;
  year: number;
  leagueStats?: any;
}

const collapseRepeatedLocation = (label?: string) => {
  const parts = (label ?? '').trim().split(/\s+/).filter(Boolean);
  for (let size = 1; size <= Math.floor(parts.length / 2); size += 1) {
    if (parts.slice(0, size).join(' ').toLowerCase() === parts.slice(size, size * 2).join(' ').toLowerCase()) {
      return [...parts.slice(0, size), ...parts.slice(size * 2)].join(' ');
    }
  }
  return parts.join(' ');
};

export const AllStarOverview: React.FC<AllStarOverviewProps> = ({ phase, allStar, onNavigate, onWatchDunkContest, year, leagueStats }) => {
  const isPba = leagueStats?.uiMode === 'pba_isolated';
  const upcomingSchedule = isPba
    ? [
        { date: 'All-Star window', label: 'Selections announced' },
        { date: 'All-Star Saturday', label: 'Dunk + 3PT + Skills' },
        { date: 'All-Star Weekend', label: 'PBA All-Star Game' },
      ]
    : [
        { date: `Dec 17, ${year - 1}`, label: 'Voting opens' },
        { date: `Jan 14, ${year}`, label: 'Voting closes' },
        { date: `Jan 22, ${year}`, label: 'Starters announced' },
        { date: `Jan 29, ${year}`, label: 'Reserves announced' },
        { date: `Feb 13, ${year}`, label: 'Rising Stars' },
        { date: `Feb 14, ${year}`, label: 'Dunk + 3PT Contests' },
        { date: `Feb 15, ${year}`, label: 'All-Star Game' },
      ];

  if (phase === 'upcoming') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
          <Star size={28} className="text-slate-600"/>
        </div>
        <h3 className="text-xl font-black text-white mb-2">
          {isPba ? 'PBA All-Star Weekend' : 'All-Star Weekend'}
        </h3>
        <p className="text-slate-400 text-sm max-w-xs leading-relaxed mb-6">
          {isPba
            ? 'PBA selections will be announced during the All-Star window, with the main game and Saturday contests using PBA rosters.'
            : `Fan voting opens December 17, ${year - 1}. Check back then to see who the fans want to see in Los Angeles.`}
        </p>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 text-left w-64">
          <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-3">
            Schedule
          </div>
          {upcomingSchedule.map(({ date, label }) => (
            <div key={date} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
              <span className="text-xs text-slate-500">
                {date}
              </span>
              <span className="text-xs text-slate-300">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Active phase — event cards grid
  void onWatchDunkContest;
  const events = [
    ...(!isPba ? [{
      id: 'votes' as AllStarTab,
      title: 'Fan Voting',
      sub: phase === 'voting' ? 'Live now' : 'Closed Jan 14',
      status: phase === 'voting' ? 'live' : 'done',
      icon: Target,
    }] : []),
    {
      id: 'roster' as AllStarTab,
      title: 'All-Star Roster',
      sub: allStar?.reservesAnnounced 
        ? `${allStar.roster.length} players selected`
        : allStar?.startersAnnounced 
          ? 'Reserves pending'
          : 'Not yet announced',
      status: allStar?.reservesAnnounced 
        ? 'done' 
        : allStar?.startersAnnounced 
          ? 'partial' 
          : 'soon',
      icon: Star,
    },
    ...(!isPba ? [{
      id: 'rising-stars' as AllStarTab,
      title: 'Rising Stars',
      sub: 'Friday, Feb 13',
      status: allStar?.weekendComplete ? 'done' : 'soon',
      icon: Zap,
    }] : []),
    {
      id: 'dunk' as AllStarTab,
      title: 'Dunk Contest',
      sub: isPba ? 'All-Star Saturday' : 'Saturday, Feb 14',
      status: allStar?.dunkContest ? 'done' : 'soon',
      icon: Zap,
    },
    {
      id: 'three-point' as AllStarTab,
      title: '3-Point Contest',
      sub: isPba ? 'All-Star Saturday' : 'Saturday, Feb 14',
      status: allStar?.threePointContest ? 'done' : 'soon',
      icon: Target,
    },
    ...(!isPba && leagueStats?.allStarShootingStars !== false ? [{
      id: 'shooting-stars' as AllStarTab,
      title: 'Shooting Stars',
      sub: 'Saturday, Feb 14',
      status: allStar?.shootingStars ? 'done' : allStar?.shootingStarsAnnounced ? 'partial' : 'soon',
      icon: Sparkles,
    }] : []),
    ...((isPba || leagueStats?.allStarSkillsChallenge === true) ? [{
      id: 'skills' as AllStarTab,
      title: 'Skills Challenge',
      sub: isPba ? 'All-Star Saturday' : 'Saturday, Feb 14',
      status: allStar?.skillsChallenge ? 'done' : allStar?.skillsChallengeAnnounced ? 'partial' : 'soon',
      icon: Target,
    }] : []),
    {
      id: 'roster' as AllStarTab,
      title: isPba ? 'PBA All-Star Game' : 'All-Star Game',
      sub: isPba ? 'Main event' : 'Sunday, Feb 15 · LA',
      status: allStar?.allStarGameId ? 'done' : 'soon',
      icon: Trophy,
    },
  ];

  const statusStyles: Record<string, string> = {
    live: 'bg-red-500/10 border-red-500/30 text-red-400',
    done: 'bg-emerald-500/10 border-emerald-500/30',
    partial: 'bg-amber-500/10 border-amber-500/30',
    soon: 'bg-slate-800/50 border-slate-700/50',
  };
  const statusLabel: Record<string, string> = {
    live: 'LIVE',
    done: 'DONE',
    partial: 'PARTIAL',
    soon: 'UPCOMING',
  };
  const statusLabelStyle: Record<string, string> = {
    live: 'text-red-400',
    done: 'text-emerald-400',
    partial: 'text-amber-400',
    soon: 'text-slate-500',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {events.map(ev => (
        <button
          key={`${ev.id}-${ev.title}`}
          onClick={() => onNavigate(ev.id)}
          className={`
            text-left p-4 rounded-xl border transition-all hover:scale-[1.01]
            ${statusStyles[ev.status]}
          `}
        >
          <div className="flex items-center justify-between mb-3">
            <ev.icon size={18} className="text-slate-400"/>
            <span className={`text-[10px] font-black tracking-widest ${statusLabelStyle[ev.status]}`}>
              {statusLabel[ev.status]}
            </span>
          </div>
          <div className="text-sm font-bold text-white mb-1">
            {ev.title}
          </div>
          <div className="text-xs text-slate-400">
            {ev.sub}
          </div>
          {/* Show winner if complete */}
          {ev.id === 'dunk' && allStar?.dunkContest && (
            <div className="mt-2 text-xs font-bold text-amber-400">
              Winner: {allStar.dunkContest.winnerName}
            </div>
          )}
          {ev.id === 'three-point' && allStar?.threePointContest && (
            <div className="mt-2 text-xs font-bold text-amber-400">
              Winner: {allStar.threePointContest.winnerName}
            </div>
          )}
          {ev.id === 'shooting-stars' && allStar?.shootingStars && (
            <div className="mt-2 text-xs font-bold text-amber-400">
              Winner: {collapseRepeatedLocation(allStar.shootingStars.winnerLabel)}
            </div>
          )}
          {ev.id === 'skills' && allStar?.skillsChallenge && (
            <div className="mt-2 text-xs font-bold text-amber-400">
              Winner: {allStar.skillsChallenge.winnerName}
            </div>
          )}
        </button>
      ))}
    </div>
  );
};
