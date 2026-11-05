import React from 'react';
import { Sparkles, Star, Target, Zap, Trophy } from 'lucide-react';
import type { AllStarTab } from './allStarTabs';
import {
  isAllStarGameEnabled,
  isCelebrityGameEnabled,
  isDunkContestEnabled,
  isPbaAllStarMode,
  isRisingStarsEnabled,
  isShootingStarsEnabled,
  isSkillsChallengeEnabled,
  isThreePointContestEnabled,
  getRisingStarsEventLabel,
} from '../../services/allStar/allStarEventAvailability';
import { normalizeAllStarRoster } from '../../services/allStar/allStarSelectionHelpers';
import type { GameState } from '../../types';
import { getLeagueEventDisplayName } from '../../services/franchises/franchiseEventNaming';
import { getAllStarWeekendCompletion } from '../../services/allStar/allStarCompletion';

interface AllStarOverviewProps {
  phase: string;
  allStar: any;
  players?: any[];
  playerEligibility?: (player: any) => boolean;
  onNavigate: (tab: AllStarTab) => void;
  leagueStats?: any;
  currentDate?: Date;
  dates?: {
    votingStart: Date;
    votingEnd: Date;
    startersAnnounced: Date;
    reservesAnnounced: Date;
    risingStarsAnnounced: Date;
    celebrityAnnounced: Date;
    dunkContestAnnounced: Date;
    threePointAnnounced: Date;
    shootingStarsAnnounced: Date;
    skillsChallengeAnnounced: Date;
    horseAnnounced: Date;
    risingStars: Date;
    celebrityGame: Date;
    saturday: Date;
    allStarGame: Date;
  };
  state?: GameState;
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

export const AllStarOverview: React.FC<AllStarOverviewProps> = ({ phase, allStar, players, playerEligibility, onNavigate, leagueStats, currentDate, dates, state }) => {
  const isPba = isPbaAllStarMode(leagueStats);
  const showAllStarGame = isAllStarGameEnabled(leagueStats);
  const showRisingStars = isRisingStarsEnabled(leagueStats);
  const showCelebrity = isCelebrityGameEnabled(leagueStats);
  const showDunk = isDunkContestEnabled(leagueStats);
  const showThreePoint = isThreePointContestEnabled(leagueStats);
  const showShootingStars = isShootingStarsEnabled(leagueStats);
  const showSkills = isSkillsChallengeEnabled(leagueStats);
  const completion = state ? getAllStarWeekendCompletion(state) : null;
  const named = (assetId: string, fallback: string) =>
    state ? getLeagueEventDisplayName(state, assetId, fallback) : fallback;
  const risingStarsLabel = named('rising_stars', getRisingStarsEventLabel(leagueStats));
  const pastSaturday = !!(currentDate && dates && currentDate >= dates.saturday);
  const pastSunday = !!(currentDate && dates && currentDate >= dates.allStarGame);
  const reached = (date?: Date) => !date || !currentDate || currentDate >= date;
  const votingLive = !!(currentDate && dates && currentDate >= dates.votingStart && currentDate <= dates.votingEnd);
  const dateLabel = (date?: Date) => date
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : 'TBD';
  const startersVisible = !!allStar?.startersAnnounced && reached(dates?.startersAnnounced);
  const reservesVisible = !!allStar?.reservesAnnounced && reached(dates?.reservesAnnounced);
  const risingStarsVisible = !!allStar?.risingStarsAnnounced && reached(dates?.risingStarsAnnounced);
  const celebrityVisible = !!allStar?.celebrityAnnounced && reached(dates?.celebrityAnnounced);
  const dunkVisible = !!allStar?.dunkContestAnnounced && reached(dates?.dunkContestAnnounced);
  const threePointVisible = !!allStar?.threePointAnnounced && reached(dates?.threePointAnnounced);
  const shootingStarsVisible = !!allStar?.shootingStarsAnnounced && reached(dates?.shootingStarsAnnounced);
  const skillsVisible = !!allStar?.skillsChallengeAnnounced && reached(dates?.skillsChallengeAnnounced);
  const celebrityComplete = (completion?.celebrity ?? !!allStar?.celebrityGameResult) && reached(dates?.celebrityAnnounced);
  const risingStarsComplete = (completion?.risingStars ?? allStar?.risingStarsBracket?.complete === true) && reached(dates?.risingStarsAnnounced);
  const dunkComplete = (completion?.dunk ?? allStar?.dunkContest?.complete === true) && reached(dates?.dunkContestAnnounced);
  const threePointComplete = (completion?.threePoint ?? allStar?.threePointContest?.complete === true) && reached(dates?.threePointAnnounced);
  const shootingStarsComplete = (completion?.shootingStars ?? allStar?.shootingStars?.complete === true) && reached(dates?.shootingStarsAnnounced);
  const skillsComplete = (completion?.skills ?? allStar?.skillsChallenge?.complete === true) && reached(dates?.skillsChallengeAnnounced);
  const allStarGameComplete = completion?.allStarGame ?? allStar?.bracket?.complete === true;
  const selectedPlayers = normalizeAllStarRoster(allStar?.roster ?? [], players, playerEligibility).length;
  const saturdayLabels = [
    showDunk ? named('slam_dunk', 'Dunk') : null,
    showThreePoint ? named('three_point', '3PT') : null,
    showShootingStars ? named('shooting_stars', 'Shooting Stars') : null,
    showSkills ? named('skills_challenge', 'Skills') : null,
  ].filter(Boolean).join(' + ');
  const upcomingSchedule = isPba
    ? [
        { date: 'All-Star window', label: 'Selections announced' },
        ...(saturdayLabels ? [{ date: 'All-Star Saturday', label: saturdayLabels }] : []),
        ...(showAllStarGame ? [{ date: 'All-Star Weekend', label: 'PBA All-Star Game' }] : []),
      ]
    : [
        { date: dateLabel(dates?.votingStart), label: 'Voting opens' },
        { date: dateLabel(dates?.votingEnd), label: 'Voting closes' },
        { date: dateLabel(dates?.startersAnnounced), label: 'Starters announced' },
        { date: dateLabel(dates?.reservesAnnounced), label: 'Reserves announced' },
        ...(showRisingStars ? [{ date: dateLabel(dates?.risingStars), label: risingStarsLabel }] : []),
        ...(saturdayLabels ? [{ date: dateLabel(dates?.saturday), label: saturdayLabels }] : []),
        ...(showAllStarGame ? [{ date: dateLabel(dates?.allStarGame), label: named('all_star_game', 'All-Star Game') }] : []),
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
            ? 'All-Star selections will be announced during All-Star Weekend, alongside the main game and Saturday contests.'
            : `Fan voting opens ${dateLabel(dates?.votingStart)}. Check back then to see who the fans want to send to All-Star Weekend.`}
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
  const events = [
    ...(!isPba && showAllStarGame ? [{
      id: 'votes' as AllStarTab,
      title: 'Fan Voting',
      sub: votingLive ? 'Live now' : `Closed ${dateLabel(dates?.votingEnd)}`,
      status: votingLive ? 'live' : 'done',
      icon: Target,
      locked: false,
    }] : []),
    ...(showAllStarGame ? [{
      id: 'roster' as AllStarTab,
      title: 'All-Star Roster',
      sub: reservesVisible
        ? `${selectedPlayers} players selected`
        : startersVisible
          ? 'Reserves pending'
          : 'Not yet announced',
      status: reservesVisible
        ? 'done' 
        : startersVisible
          ? 'partial' 
          : 'soon',
      icon: Star,
      locked: !startersVisible,
    }] : []),
    ...(showRisingStars ? [{
      id: 'rising-stars' as AllStarTab,
      title: risingStarsLabel,
      sub: `Friday, ${dateLabel(dates?.risingStars)}`,
      status: risingStarsComplete ? 'done' : risingStarsVisible ? 'partial' : 'soon',
      icon: Zap,
      locked: !risingStarsVisible && !risingStarsComplete,
    }] : []),
    ...(showCelebrity ? [{
      id: 'celebrity' as AllStarTab,
      title: named('celebrity_game', 'Celebrity Game'),
      sub: `Friday, ${dateLabel(dates?.celebrityGame)}`,
      status: celebrityComplete ? 'done' : celebrityVisible ? 'partial' : 'soon',
      icon: Star,
      locked: !celebrityComplete && !celebrityVisible,
    }] : []),
    ...(showDunk ? [{
      id: 'dunk' as AllStarTab,
      title: named('slam_dunk', 'Dunk Contest'),
      sub: isPba ? 'All-Star Saturday' : `Saturday, ${dateLabel(dates?.saturday)}`,
      status: dunkComplete ? 'done' : ((dunkVisible || (isPba && pastSaturday)) ? 'partial' : 'soon'),
      icon: Zap,
      locked: !dunkComplete && !dunkVisible && !(isPba && pastSaturday),
    }] : []),
    ...(showThreePoint ? [{
      id: 'three-point' as AllStarTab,
      title: named('three_point', '3-Point Contest'),
      sub: isPba ? 'All-Star Saturday' : `Saturday, ${dateLabel(dates?.saturday)}`,
      status: threePointComplete ? 'done' : ((threePointVisible || (isPba && pastSaturday)) ? 'partial' : 'soon'),
      icon: Target,
      locked: !threePointComplete && !threePointVisible && !(isPba && pastSaturday),
    }] : []),
    ...(showShootingStars ? [{
      id: 'shooting-stars' as AllStarTab,
      title: named('shooting_stars', 'Shooting Stars'),
      sub: `Saturday, ${dateLabel(dates?.saturday)}`,
      status: shootingStarsComplete ? 'done' : shootingStarsVisible ? 'partial' : 'soon',
      icon: Sparkles,
      locked: !shootingStarsComplete && !shootingStarsVisible,
    }] : []),
    ...(showSkills ? [{
      id: 'skills' as AllStarTab,
      title: named('skills_challenge', 'Skills Challenge'),
      sub: isPba ? 'All-Star Saturday' : `Saturday, ${dateLabel(dates?.saturday)}`,
      status: skillsComplete ? 'done' : ((skillsVisible || (isPba && pastSaturday)) ? 'partial' : 'soon'),
      icon: Target,
      locked: !skillsComplete && !skillsVisible && !(isPba && pastSaturday),
    }] : []),
    ...(showAllStarGame ? [{
      id: 'roster' as AllStarTab,
      title: isPba ? 'PBA All-Star Game' : named('all_star_game', 'All-Star Game'),
      sub: isPba ? 'Main event' : `Sunday, ${dateLabel(dates?.allStarGame)}`,
      status: allStarGameComplete ? 'done' : ((allStar?.bracket || (isPba && pastSunday)) ? 'partial' : 'soon'),
      icon: Trophy,
      locked: !reservesVisible && !allStarGameComplete,
    }] : []),
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
          onClick={() => !ev.locked && onNavigate(ev.id)}
          disabled={ev.locked}
          className={`
            text-left p-4 rounded-xl border transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:hover:scale-100
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
          {ev.id === 'dunk' && dunkComplete && (
            <div className="mt-2 text-xs font-bold text-amber-400">
              Winner: {allStar.dunkContest?.winnerName ?? 'TBA'}
            </div>
          )}
          {ev.id === 'three-point' && threePointComplete && (
            <div className="mt-2 text-xs font-bold text-amber-400">
              Winner: {allStar.threePointContest?.winnerName ?? 'TBA'}
            </div>
          )}
          {ev.id === 'shooting-stars' && shootingStarsComplete && (
            <div className="mt-2 text-xs font-bold text-amber-400">
              Winner: {collapseRepeatedLocation(allStar.shootingStars?.winnerLabel)}
            </div>
          )}
          {ev.id === 'skills' && skillsComplete && (
            <div className="mt-2 text-xs font-bold text-amber-400">
              Winner: {allStar.skillsChallenge?.winnerName ?? 'TBA'}
            </div>
          )}
        </button>
      ))}
    </div>
  );
};
