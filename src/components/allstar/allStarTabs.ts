import { Crown, Sparkles, Star, Target, Users, Zap } from 'lucide-react';
import {
  isAllStarGameEnabled,
  isCelebrityGameEnabled,
  isDunkContestEnabled,
  isRisingStarsEnabled,
  isShootingStarsEnabled,
  isSkillsChallengeEnabled,
  isThreePointContestEnabled,
  getRisingStarsEventLabel,
} from '../../services/allStar/allStarEventAvailability';
import type { GameState } from '../../types';
import { getLeagueEventDisplayName } from '../../services/franchises/franchiseEventNaming';
import { getAllStarWeekendCompletion } from '../../services/allStar/allStarCompletion';

export type AllStarTab = 'overview' | 'votes' | 'roster' | 'rising-stars' | 'celebrity' | 'dunk' | 'three-point' | 'shooting-stars' | 'skills' | 'horse' | 'throne';

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
  state,
}: {
  allStar: any;
  currentDate: Date;
  dates: any;
  leagueStats: any;
  state?: GameState;
  phase: 'upcoming' | 'voting' | 'starters' | 'roster' | 'complete';
}): AllStarTabConfig[] => {
  const allStarGameDisabled = !isAllStarGameEnabled(leagueStats);
  const completion = state ? getAllStarWeekendCompletion(state) : null;
  const announcementLocked = (announced: boolean, announcementDate: Date, complete = false) =>
    currentDate < announcementDate || (!announced && !complete);
  const named = (assetId: string, fallback: string) =>
    state ? getLeagueEventDisplayName(state, assetId, fallback) : fallback;
  return [
  { id: 'overview', label: 'Overview', icon: Star },
  { id: 'votes', label: 'Voting', icon: Target, locked: phase === 'upcoming', hidden: allStarGameDisabled || leagueStats?.uiMode === 'pba_isolated' },
  { id: 'roster', label: 'Roster', icon: Star, locked: phase === 'upcoming' || phase === 'voting', hidden: allStarGameDisabled },
  { id: 'rising-stars', label: named('rising_stars', getRisingStarsEventLabel(leagueStats)), icon: Zap, locked: announcementLocked(!!allStar?.risingStarsAnnounced, dates.risingStarsAnnounced, completion?.risingStars ?? allStar?.risingStarsBracket?.complete === true), hidden: !isRisingStarsEnabled(leagueStats) },
  { id: 'celebrity', label: named('celebrity_game', 'Celebrity Game'), icon: Users, locked: announcementLocked(!!allStar?.celebrityAnnounced && (allStar?.celebrityRoster?.length ?? 0) > 0, dates.celebrityAnnounced, completion?.celebrity ?? !!allStar?.celebrityGameResult), hidden: !isCelebrityGameEnabled(leagueStats) },
  { id: 'dunk', label: named('slam_dunk', 'Dunk Contest'), icon: Zap, locked: announcementLocked(!!allStar?.dunkContestAnnounced, dates.dunkContestAnnounced, completion?.dunk ?? allStar?.dunkContest?.complete === true), hidden: !isDunkContestEnabled(leagueStats) },
  { id: 'three-point', label: named('three_point', '3-Point Contest'), icon: Target, locked: announcementLocked(!!allStar?.threePointAnnounced, dates.threePointAnnounced, completion?.threePoint ?? allStar?.threePointContest?.complete === true), hidden: !isThreePointContestEnabled(leagueStats) },
  {
    id: 'shooting-stars',
    label: named('shooting_stars', 'Shooting Stars'),
    icon: Sparkles,
    hidden: !isShootingStarsEnabled(leagueStats),
    locked: announcementLocked(!!(allStar as any)?.shootingStarsAnnounced, dates.shootingStarsAnnounced, completion?.shootingStars ?? (allStar as any)?.shootingStars?.complete === true),
  },
  {
    id: 'skills',
    label: named('skills_challenge', 'Skills Challenge'),
    icon: Target,
    hidden: !isSkillsChallengeEnabled(leagueStats),
    locked: announcementLocked(!!(allStar as any)?.skillsChallengeAnnounced, dates.skillsChallengeAnnounced, completion?.skills ?? (allStar as any)?.skillsChallenge?.complete === true),
  },
  {
    id: 'horse',
    label: 'H-O-R-S-E',
    icon: Target,
    hidden: allStarGameDisabled || leagueStats?.uiMode === 'pba_isolated' || leagueStats?.uiMode === 'wnba_isolated' || leagueStats.allStarHorse !== true,
    locked: announcementLocked(!!(allStar as any)?.horseAnnounced, dates.horseAnnounced, !!(allStar as any)?.horseTournament?.complete),
  },
  {
    id: 'throne',
    label: 'The Throne',
    icon: Crown,
    hidden: allStarGameDisabled || leagueStats?.uiMode === 'pba_isolated' || leagueStats?.uiMode === 'wnba_isolated' || !leagueStats.allStarThroneEnabled,
    locked:
      !(allStar as any)?.throneSignupSchedule
      && !(allStar as any)?.throneAnnounced
      && !(allStar as any)?.throne?.complete
      && currentDate < (dates as any).throneSignupOpens,
  },
  ];
};
