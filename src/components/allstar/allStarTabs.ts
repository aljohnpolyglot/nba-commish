import { Crown, Sparkles, Star, Target, Users, Zap } from 'lucide-react';

export type AllStarTab = 'overview' | 'votes' | 'roster' | 'rising-stars' | 'celebrity' | 'dunk' | 'three-point' | 'shooting-stars' | 'skills' | 'throne';

type AllStarTabConfig = {
  id: AllStarTab;
  label: string;
  icon: any;
  locked?: boolean;
  hidden?: boolean;
};

export const buildAllStarTabs = ({
  allStar,
  currentDate,
  dates,
  leagueStats,
  phase,
}: {
  allStar: any;
  currentDate: Date;
  dates: any;
  leagueStats: any;
  phase: 'upcoming' | 'voting' | 'starters' | 'roster' | 'complete';
}): AllStarTabConfig[] => [
  { id: 'overview', label: 'Overview', icon: Star },
  { id: 'votes', label: 'Voting', icon: Target, locked: phase === 'upcoming' },
  { id: 'roster', label: 'Roster', icon: Star, locked: phase === 'upcoming' || phase === 'voting' },
  { id: 'rising-stars', label: 'Rising Stars', icon: Zap, locked: !allStar?.risingStarsAnnounced && currentDate < dates.risingStars },
  { id: 'celebrity', label: 'Celebrity Game', icon: Users, locked: !allStar?.celebrityRoster, hidden: !leagueStats.celebrityGameEnabled },
  { id: 'dunk', label: 'Dunk Contest', icon: Zap, locked: !allStar?.dunkContestAnnounced && currentDate < dates.saturday },
  { id: 'three-point', label: '3-Point Contest', icon: Target, locked: !allStar?.threePointAnnounced && currentDate < dates.saturday },
  {
    id: 'shooting-stars',
    label: 'Shooting Stars',
    icon: Sparkles,
    hidden: leagueStats.allStarShootingStars === false,
    locked: !(allStar as any)?.shootingStarsAnnounced && !(allStar as any)?.shootingStars?.complete && currentDate < dates.saturday,
  },
  {
    id: 'skills',
    label: 'Skills Challenge',
    icon: Target,
    hidden: leagueStats.allStarSkillsChallenge !== true,
    locked: !(allStar as any)?.skillsChallengeAnnounced && !(allStar as any)?.skillsChallenge?.complete && currentDate < dates.saturday,
  },
  {
    id: 'throne',
    label: 'The Throne',
    icon: Crown,
    hidden: !leagueStats.allStarThroneEnabled,
    locked:
      !(allStar as any)?.throneSignupSchedule
      && !(allStar as any)?.throneAnnounced
      && !(allStar as any)?.throne?.complete
      && currentDate < (dates as any).throneSignupOpens,
  },
];
