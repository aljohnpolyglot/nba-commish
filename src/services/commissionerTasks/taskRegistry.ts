import type {
  CommissionerTaskDefinition,
  CommissionerTaskId,
  CommissionerTaskLedger,
  CommissionerTaskRecord,
  CommissionerTaskStatus,
  CommissionerTaskView,
  GameState,
} from '../../types';
import { normalizeDate } from '../../utils/helpers';
import {
  addGameDays,
  getDraftDate,
  getDraftLotteryDate,
  getOpeningNightDate,
  getRolloverDate,
  parseGameDate,
  toISODateString,
} from '../../utils/dateUtils';
import {
  isAllStarGameEnabled,
  isCelebrityGameEnabled,
  isDunkContestEnabled,
  isSkillsChallengeEnabled,
  isShootingStarsEnabled,
  isThreePointContestEnabled,
} from '../allStar/allStarEventAvailability';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { isNoDraftLeague } from '../offseason/offseasonState';
import { getExpansionBidYear } from '../expansion/generatedExpansionBidding';
import { isExpansionDraftDueForOffseason } from '../expansion/expansionOffseasonTransition';
import { getAllStarHostDecisionYear } from '../allStar/hostAutoResolver';
import { getAllStarWeekendDates } from '../allStar/allStarWeekendDates';
import { buildInternationalShowcaseOpponents } from '../externalLeague/internationalShowcase';
import {
  getAllStarReplacementAutoDecisionDate,
  getOutstandingAllStarInjuries,
  hasAllStarInjuryReplacements,
} from '../allStar/allStarInjuryReplacements';
import { getLeagueSeasonForDate } from '../leagueCalendar';
import { getHOFClassYearForDate, getHOFCeremonyDateString } from '../playerDevelopment/hofChecker';
import { isCanonicalDraftComplete, resolveLeagueSeasonLifecycle } from '../lifecycle/leagueSeasonLifecycle';
import { resolveCommissionerTaskDestination } from '../tasks/taskDestinations';

export const COMMISSIONER_TASK_DEFINITIONS: CommissionerTaskDefinition[] = [
  { id: 'draft_lottery', phase: 'offseason', order: 5, title: 'Draft Lottery', description: 'Run or watch the lottery before the draft order is handed off.', autoLabel: 'Run the official lottery', workspace: 'Draft Lottery' },
  { id: 'season_review', phase: 'offseason', order: 10, title: 'Season Review', description: 'Review the completed season, champions, awards and league health.', autoLabel: 'Accept official season review', workspace: 'League History' },
  { id: 'nba_draft', phase: 'offseason', order: 20, title: 'NBA Draft', description: 'Run the draft or override a team selection with explicit confirmation.', autoLabel: 'Simulate the complete draft', workspace: 'Draft Board' },
  { id: 'retired_players', phase: 'offseason', order: 30, title: 'Retired Players', description: 'Review the retirement class prepared for the new season.', autoLabel: 'Acknowledge retirement class', workspace: 'League History' },
  { id: 'staff_retirements', phase: 'offseason', order: 40, title: 'Staff Retirements', description: 'Review league-office and team staff departures prepared for the new season.', autoLabel: 'Acknowledge staff retirements', workspace: 'League Office' },
  { id: 'referee_retirements', phase: 'offseason', order: 45, title: 'Referee Retirements', description: 'Review the officials leaving the active crew before assignments are finalized.', autoLabel: 'Acknowledge referee retirements', workspace: 'League Office' },
  { id: 'league_pass_price', phase: 'offseason', order: 50, title: 'League Pass Price', description: 'Set the monthly subscription price before national media projections are finalized.', autoLabel: 'Use the recommended price' },
  { id: 'media_rights_renewal', phase: 'offseason', order: 60, title: 'National Media Rights Renewal', description: 'Choose one complete national package. Every category shares its contract expiration.', autoLabel: 'Choose the recommended package', workspace: 'Broadcasting' },
  { id: 'governors_proposal', phase: 'offseason', order: 70, title: 'Governors Board Proposal', description: 'Review the governors’ recommendations, veto any proposal, then sign the docket.', autoLabel: 'Sign the governors’ recommended docket' },
  { id: 'league_settings_review', phase: 'offseason', order: 80, title: 'League Settings Review', description: 'Open League Settings, make any commissioner changes, then mark the review complete.', autoLabel: 'Keep the current league settings', workspace: 'League Settings' },
  { id: 'governors_final', phase: 'offseason', order: 90, title: 'Governors Board Final', description: 'Review the final season recap and enact the signed league changes.', autoLabel: 'Sign and enact the final docket' },
  { id: 'franchise_event_sponsorships', phase: 'offseason', order: 91, title: 'League Event Sponsorships', description: 'Choose the commercial partners for every league event confirmed for the coming season.', autoLabel: 'Assign the strongest eligible partners', workspace: 'Franchises' },
  { id: 'celebrity_roster', phase: 'offseason', order: 92, title: 'Celebrity Game Roster', description: 'Review the field, replace any slot from the decade pool, or build the roster from scratch when no official field exists.', autoLabel: 'Use the official roster' },
  { id: 'dunk_participants', phase: 'offseason', order: 93, title: 'Dunk Contest Participants', description: 'Review or select the dunk contest field.', autoLabel: 'Select the recommended field', allowAssistant: true },
  { id: 'three_point_participants', phase: 'offseason', order: 94, title: 'Three-Point Contest Participants', description: 'Review or select the three-point contest field.', autoLabel: 'Select the recommended field', allowAssistant: true },
  { id: 'shooting_stars_participants', phase: 'offseason', order: 95, title: 'Shooting Stars Teams', description: 'Select complete three-player franchise teams for the active league format.', autoLabel: 'Select the recommended teams', allowAssistant: true },
  { id: 'skills_participants', phase: 'offseason', order: 96, title: 'Skills Challenge Participants', description: 'Select the Skills Challenge field.', autoLabel: 'Select the recommended field', allowAssistant: true },
  { id: 'horse_participants', phase: 'offseason', order: 97, title: 'H-O-R-S-E Participants', description: 'Select the H-O-R-S-E field.', autoLabel: 'Select the recommended field', allowAssistant: true },
  { id: 'all_star_host', phase: 'offseason', order: 98, title: 'All-Star Weekend Host', description: 'Confirm the next open host year, prioritizing cities that never hosted or waited longest.', autoLabel: 'Choose the longest-waiting host' },
  { id: 'commissioner_free_agency', phase: 'offseason', order: 100, title: 'Free Agency', description: 'Review every league signing from the complete free-agency period.', autoLabel: 'Let free agency play out' },
  { id: 'expansion_bidding', phase: 'offseason', order: 120, title: 'Expansion Bidding', description: 'Review active expansion applications, market population and ownership pitches.', autoLabel: 'Resolve the active expansion window' },
  { id: 'expansion_draft', phase: 'offseason', order: 125, title: 'Expansion Draft', description: 'Confirm team protections, then conduct the expansion draft for the incoming franchises.', autoLabel: 'Conduct the expansion draft' },
  { id: 'nba_cup_host', phase: 'offseason', order: 130, title: 'NBA Cup Host', description: 'Select the host city when the cup is active.', autoLabel: 'Choose the strongest eligible host' },
  { id: 'international_tournament', phase: 'offseason', order: 145, title: 'International Tournament', description: 'Open the active World Cup or Olympic tournament hub.', autoLabel: 'Complete the active tournament', workspace: 'International' },
  { id: 'global_games', phase: 'offseason', order: 150, title: 'Global Games', description: 'Set international regular-season games using team strength and player-nationality fit.', autoLabel: 'Build the recommended global slate', allowAssistant: true },
  { id: 'international_preseason', phase: 'offseason', order: 160, title: 'International Preseason', description: 'Partner with an available external league and schedule a preseason showcase.', autoLabel: 'Build the best available showcase' },
  { id: 'christmas_games', phase: 'offseason', order: 170, title: 'Christmas Games', description: 'Select the marquee Christmas schedule.', autoLabel: 'Build the recommended Christmas slate', allowAssistant: true },
  { id: 'invite_performance', phase: 'offseason', order: 180, title: 'Invite Performance', description: 'Book a performance for a league showcase.', autoLabel: 'Book the recommended performance', allowAssistant: true },
  { id: 'hof_endorsement', phase: 'offseason', order: 190, title: 'Endorse Hall of Fame', description: 'Select the induction class and record its induction year.', autoLabel: 'Endorse the recommended class', workspace: 'Hall of Fame' },
  { id: 'hof_ceremony', phase: 'offseason', order: 200, title: 'Hall of Fame Ceremony', description: 'Complete the induction ceremony and close the offseason.', autoLabel: 'Run the ceremony', workspace: 'Hall of Fame' },
  { id: 'all_star_replacements', phase: 'midyear', order: 205, title: 'All-Star Injury Replacements', description: 'Replace injured players from the announced All-Star roster before the weekend begins.', autoLabel: 'Select the best eligible replacements', allowAssistant: true, workspace: 'All-Star' },
];

const terminal = (status: CommissionerTaskStatus) =>
  status === 'resolved' || status === 'auto_resolved' || status === 'not_applicable';

const completed = (status: CommissionerTaskStatus | undefined) =>
  status === 'resolved' || status === 'auto_resolved';

const bootstrapResolvedTasks = new Set<CommissionerTaskId>([
  'season_review',
  'draft_lottery',
  'nba_draft',
  'commissioner_free_agency',
]);

const allStarTaskIds = new Set<CommissionerTaskId>([
  'all_star_host',
  'invite_performance',
  'all_star_replacements',
  'celebrity_roster',
  'dunk_participants',
  'three_point_participants',
  'shooting_stars_participants',
  'skills_participants',
  'horse_participants',
]);

const isNbaCommissionerTaskMode = (state: GameState) =>
  state.gameMode !== 'gm'
  && state.leagueStats.uiMode !== 'euro_isolated';

const isPbaCommissionerMode = (state: GameState) =>
  state.gameMode !== 'gm'
  && state.leagueStats.uiMode === 'pba_isolated';

const isPbaCommissionerBootstrapCycle = (
  state: GameState,
  decisionYear: number,
) => {
  if (!isPbaCommissionerMode(state)) return false;
  const sourceSeason = Number(
    state.pbaSeasonKey
    ?? state.historicalPba?.sourceSeason
    ?? (state.pbaStartYear != null ? state.pbaStartYear + 1 : Number.NaN),
  );
  return state.commissionerBootstrapCycle === decisionYear
    || (Number.isFinite(sourceSeason) && sourceSeason === decisionYear);
};

const isFictionalCurrentRosterBootstrapCycle = (
  state: GameState,
  decisionYear: number,
) =>
  state.leagueType === 'fictional'
  && state.leagueStats.fictionalRosterMode === 'current'
  && state.commissionerBootstrapCycle === decisionYear;

const commissionerTaskOrder = (
  state: GameState,
  definition: CommissionerTaskDefinition,
) => {
  if (state.leagueType !== 'fictional') return definition.order;
  if (definition.id === 'season_review') return 5;
  if (definition.id === 'draft_lottery') return 10;
  return definition.order;
};

export const commissionerTaskKey = (season: number, taskId: CommissionerTaskId) => `${season}:${taskId}`;

function getCommissionerTaskCycleForDate(state: GameState, value: string): number {
  const date = parseGameDate(value);
  const dateStr = toISODateString(date);
  const activeSeason = getLeagueSeasonForDate(dateStr, state.leagueStats) || state.leagueStats.year;
  return date < getOpeningNightDate(activeSeason, state.leagueStats, state.schedule)
    ? activeSeason - 1
    : activeSeason;
}

export function getCommissionerTaskCycleYear(state: GameState): number {
  return getCommissionerTaskCycleForDate(state, state.date);
}

export function getCommissionerHofReviewDate(
  state: GameState,
  cycle = getCommissionerTaskCycleYear(state),
): string {
  const rollover = getRolloverDate(cycle, state.leagueStats, state.schedule);
  const rolloverDate = toISODateString(rollover);
  const calendarYear = rollover.getUTCFullYear();
  const ceremonyDate = getHOFCeremonyDateString(calendarYear);
  return ceremonyDate >= rolloverDate ? ceremonyDate : rolloverDate;
}

export function getCommissionerHofClassYear(
  state: GameState,
  cycle = getCommissionerTaskCycleYear(state),
): number {
  return getHOFClassYearForDate(getCommissionerHofReviewDate(state, cycle));
}

export function isCommissionerSeasonReviewReady(
  state: GameState,
  cycle = getCommissionerTaskCycleYear(state),
): boolean {
  if (state.playoffs?.season === cycle) {
    return state.playoffs.bracketComplete && state.playoffs.champion != null;
  }
  const archivedPlayoffs = state.historicalPlayoffs?.[String(cycle)];
  if (archivedPlayoffs?.bracketComplete && archivedPlayoffs?.champion != null) return true;
  if (state.leagueType === 'fictional' && (state.historicalAwards ?? []).some(award => (
    Number(award.season) === cycle
    && award.type === 'Champion'
    && award.tid != null
  ))) return true;
  return (state.seasonHistory ?? []).some(entry =>
    Number(entry.year) === cycle && entry.championTid != null,
  );
}

export function getCommissionerSeasonReviewSeason(state: GameState): number | undefined {
  const cycle = getCommissionerTaskCycleYear(state);
  return isCommissionerSeasonReviewReady(state, cycle) ? cycle : undefined;
}

export function getCommissionerTaskDates(
  state: GameState,
  taskId: CommissionerTaskId,
  cycle = getCommissionerTaskCycleYear(state),
): { openDate: string; dueDate: string } {
  const allStarDates = getAllStarWeekendDates(cycle, state.leagueStats);
  const allStarDate = (date: Date) => toISODateString(date);
  const allStarReplacementOpen = new Date(allStarDates.allStarGame.getTime() - 7 * 86_400_000);
  const rollover = getRolloverDate(cycle, state.leagueStats, state.schedule);
  const afterRollover = (days: number) =>
    toISODateString(new Date(rollover.getTime() + days * 86_400_000));
  const tournamentDates = (state.internationalTournament?.games ?? [])
    .map(game => normalizeDate(game.date))
    .filter(Boolean)
    .sort();
  const draftDate = toISODateString(getDraftDate(cycle, state.leagueStats));
  const lotteryDate = getDraftLotteryDate(cycle, state.leagueStats);
  const lotteryDateString = toISODateString(lotteryDate);
  const seasonReviewOpen = state.leagueType === 'fictional'
    ? toISODateString(addGameDays(lotteryDate, -1))
    : draftDate;
  const seasonReviewDue = state.leagueType === 'fictional'
    ? lotteryDateString
    : toISODateString(addGameDays(draftDate, 2));
  const hofReviewDate = getCommissionerHofReviewDate(state, cycle);
  const hofReviewDueDate = toISODateString(addGameDays(hofReviewDate, 7));
  const dates: Record<CommissionerTaskId, [string, string]> = {
    season_review: [seasonReviewOpen, seasonReviewDue],
    draft_lottery: [lotteryDateString, lotteryDateString],
    nba_draft: [toISODateString(getDraftDate(cycle, state.leagueStats)), toISODateString(getDraftDate(cycle, state.leagueStats))],
    retired_players: [afterRollover(1), afterRollover(2)],
    staff_retirements: [afterRollover(2), afterRollover(3)],
    referee_retirements: [afterRollover(3), afterRollover(4)],
    league_pass_price: [afterRollover(2), afterRollover(4)],
    media_rights_renewal: [afterRollover(4), afterRollover(6)],
    governors_proposal: [afterRollover(6), afterRollover(8)],
    league_settings_review: [afterRollover(8), afterRollover(10)],
    governors_final: [afterRollover(10), afterRollover(12)],
    franchise_event_sponsorships: [afterRollover(12), afterRollover(18)],
    commissioner_free_agency: [afterRollover(13), afterRollover(19)],
    expansion_bidding: [afterRollover(16), afterRollover(19)],
    expansion_draft: [afterRollover(19), afterRollover(22)],
    nba_cup_host: [afterRollover(19), afterRollover(21)],
    all_star_host: [afterRollover(18), afterRollover(20)],
    global_games: [afterRollover(31), afterRollover(35)],
    international_tournament: [
      tournamentDates[0] ?? afterRollover(1),
      tournamentDates[tournamentDates.length - 1] ?? afterRollover(71),
    ],
    international_preseason: [afterRollover(35), afterRollover(38)],
    christmas_games: [afterRollover(38), afterRollover(40)],
    invite_performance: [afterRollover(40), afterRollover(42)],
    hof_endorsement: [hofReviewDate, hofReviewDate],
    hof_ceremony: [hofReviewDate, hofReviewDueDate],
    all_star_replacements: [
      allStarDate(allStarReplacementOpen),
      getAllStarReplacementAutoDecisionDate(state, cycle),
    ],
    celebrity_roster: [afterRollover(12), afterRollover(18)],
    dunk_participants: [afterRollover(12), afterRollover(18)],
    three_point_participants: [afterRollover(12), afterRollover(18)],
    shooting_stars_participants: [afterRollover(12), afterRollover(18)],
    skills_participants: [afterRollover(12), afterRollover(18)],
    horse_participants: [afterRollover(12), afterRollover(18)],
  };
  const [openDate, dueDate] = dates[taskId];
  return { openDate, dueDate };
}

function hasIntlRoster(state: GameState) {
  return state.leagueType !== 'fictional'
    && buildInternationalShowcaseOpponents(state.nonNBATeams, state.players, {
      excludedLeagues: ['WNBA'],
    }).length > 0;
}

export function hasAvailableCommissionerFreeAgents(state: GameState): boolean {
  return state.players.some(player =>
    player.status !== 'Retired'
    && player.status !== 'Prospect'
    && player.status !== 'Draft Prospect'
    && player.tid !== -2
    && player.tid !== -100
    && (player.tid === -1 || player.status === 'Free Agent'),
  );
}

function applicable(
  state: GameState,
  taskId: CommissionerTaskId,
  decisionYear = getCommissionerTaskCycleYear(state),
): boolean {
  if (!isNbaCommissionerTaskMode(state)) return false;
  const definition = COMMISSIONER_TASK_DEFINITIONS.find(task => task.id === taskId);
  if (!definition) return false;
  if (isPbaCommissionerMode(state)) {
    if (taskId === 'season_review' || taskId === 'draft_lottery') return false;
    if (taskId === 'franchise_event_sponsorships') return false;
    if (taskId === 'nba_cup_host') return false;
    if (taskId === 'international_tournament' || taskId === 'international_preseason') return false;
    if (taskId === 'christmas_games') return false;
    if (
      isPbaCommissionerBootstrapCycle(state, decisionYear)
      && taskId === 'retired_players'
      && (state.retirementAnnouncements?.length ?? 0) === 0
    ) return false;
    if (
      isPbaCommissionerBootstrapCycle(state, decisionYear)
      && taskId === 'staff_retirements'
      && (state.staffRetirementAnnouncements?.length ?? 0) === 0
    ) return false;
    if (
      isPbaCommissionerBootstrapCycle(state, decisionYear)
      && taskId === 'referee_retirements'
      && (state.refereeRetirementAnnouncements?.length ?? 0) === 0
    ) return false;
  }
  if (state.leagueStats.uiMode === 'wnba_isolated' && taskId === 'christmas_games') return false;
  if (taskId === 'hof_endorsement') return false;
  if (
    (taskId === 'season_review' || taskId === 'draft_lottery' || taskId === 'nba_draft')
    && isFictionalCurrentRosterBootstrapCycle(state, decisionYear)
  ) return false;
  if (taskId === 'draft_lottery' || taskId === 'nba_draft') {
    const lifecycleDraftYear = resolveLeagueSeasonLifecycle(state).draft.year;
    if (lifecycleDraftYear == null || lifecycleDraftYear !== decisionYear) return false;
    if (taskId === 'draft_lottery') {
      return !isNoDraftLeague(state.leagueStats) && isDraftLotteryEnabled(state.leagueStats.draftType);
    }
    return !isNoDraftLeague(state.leagueStats);
  }
  if (taskId === 'media_rights_renewal') {
    if (decisionYear < 1946) return false;
    const end = state.leagueStats.mediaRights?.contractEndSeason;
    return end == null || end < decisionYear;
  }
  if (taskId === 'league_pass_price') return decisionYear >= 1994;
  if (taskId === 'expansion_bidding') {
    if (isPbaCommissionerMode(state) !== (state.expansionSchedule?.league === 'pba')) return false;
    const scheduledYear = state.expansionSchedule?.year;
    const decision = scheduledYear == null ? undefined : state.expansionBidDecisions?.[scheduledYear];
    return !!state.expansionSchedule?.teams?.length
      && scheduledYear != null
      && decisionYear >= getExpansionBidYear(scheduledYear)
      && !decision?.acknowledgedAt;
  }
  if (taskId === 'expansion_draft') {
    if (isPbaCommissionerMode(state) !== (state.expansionSchedule?.league === 'pba')) return false;
    const scheduledYear = state.expansionSchedule?.year;
    const bidDecision = scheduledYear == null ? undefined : state.expansionBidDecisions?.[scheduledYear];
    return isExpansionDraftDueForOffseason(state.leagueStats, state.expansionSchedule)
      && bidDecision?.status !== 'rejected';
  }
  if (taskId === 'nba_cup_host') return state.leagueStats.inSeasonTournament !== false;
  if (taskId === 'all_star_host' || taskId === 'invite_performance') {
    return isAllStarGameEnabled(state.leagueStats);
  }
  if (taskId === 'all_star_replacements') {
    return isAllStarGameEnabled(state.leagueStats)
      && state.allStar?.season === decisionYear
      && (getOutstandingAllStarInjuries(state).length > 0 || hasAllStarInjuryReplacements(state));
  }
  if (taskId === 'international_tournament') {
    const tournament = state.internationalTournament;
    return !!tournament && Number(tournament.playedYear ?? tournament.year) === decisionYear;
  }
  if (taskId === 'global_games') return isPbaCommissionerMode(state) || state.leagueStats.globalGames === true;
  if (taskId === 'international_preseason') return hasIntlRoster(state);
  if (taskId === 'commissioner_free_agency') return hasAvailableCommissionerFreeAgents(state);
  if (taskId === 'celebrity_roster') return isCelebrityGameEnabled(state.leagueStats);
  if (taskId === 'dunk_participants') return isDunkContestEnabled(state.leagueStats);
  if (taskId === 'three_point_participants') return isThreePointContestEnabled(state.leagueStats);
  if (taskId === 'shooting_stars_participants') return isShootingStarsEnabled(state.leagueStats);
  if (taskId === 'skills_participants') return isSkillsChallengeEnabled(state.leagueStats);
  if (taskId === 'horse_participants') return state.leagueStats.allStarHorse === true;
  return true;
}

function inferredStatus(state: GameState, taskId: CommissionerTaskId): CommissionerTaskStatus | null {
  if (
    state.leagueType === 'modded'
    && state.moddedLeagueBase === 'nba'
    && state.nbaGmStartMode === 'fixed_preseason'
    && (state.commissionerBootstrapCycle ?? state.nbaStartYear) === getCommissionerTaskCycleYear(state)
    && taskId !== 'all_star_replacements'
    && taskId !== 'referee_retirements'
  ) return 'resolved';
  if (
    state.leagueType === 'modded'
    && state.moddedLeagueBase === 'nba'
    && state.commissionerBootstrapCycle === getCommissionerTaskCycleYear(state)
    && bootstrapResolvedTasks.has(taskId)
  ) return 'resolved';
  if (!applicable(state, taskId)) return 'not_applicable';
  if (isPbaCommissionerBootstrapCycle(state, getCommissionerTaskCycleYear(state))) return 'resolved';
  if (taskId === 'draft_lottery' && (state.draftLotteryResult?.length ?? 0) > 0) return 'resolved';
  if (taskId === 'nba_draft' && isCanonicalDraftComplete(state)) return 'resolved';
  if (taskId === 'retired_players' && state.offseasonChecklist?.retiredPlayersReview === 'done') return 'resolved';
  if (
    taskId === 'media_rights_renewal'
    && (state.leagueStats.mediaRights?.contractEndSeason ?? -1) >= getCommissionerTaskCycleYear(state)
  ) return 'resolved';
  if (
    taskId === 'franchise_event_sponsorships'
    && (state.franchiseLeagueEvents?.reviewedSeason ?? -1) >= getCommissionerTaskCycleYear(state)
  ) return 'resolved';
  if (taskId === 'governors_proposal' && state.commissionerBoardPaper?.cycleYear === getCommissionerTaskCycleYear(state)) return 'resolved';
  if (taskId === 'league_settings_review' && state.commissionerBoardPaper?.cycleYear === getCommissionerTaskCycleYear(state) && state.commissionerBoardPaper.reviewedAt) return 'resolved';
  if (taskId === 'governors_final' && state.commissionerBoardPaper?.cycleYear === getCommissionerTaskCycleYear(state) && state.commissionerBoardPaper.signedAt) return 'resolved';
  if (taskId === 'league_pass_price' && state.leagueStats.leaguePassPriceSetYear === state.leagueStats.year) return 'resolved';
  if (
    taskId === 'expansion_bidding'
    && state.expansionSchedule?.year != null
    && state.expansionBidDecisions?.[state.expansionSchedule.year]?.acknowledgedAt
  ) return 'resolved';
  if (taskId === 'expansion_draft' && state.offseasonChecklist?.expansionDraft === 'done') return 'resolved';
  if (taskId === 'nba_cup_host' && state.leagueStats.nbaCupHosts?.some(host => host.year === state.leagueStats.year)) return 'resolved';
  if (
    taskId === 'all_star_host'
    && state.leagueStats.allStarHosts?.some(host =>
      host.year === (
        isPbaCommissionerMode(state)
          ? state.leagueStats.year
          : getAllStarHostDecisionYear(state.leagueStats)
      )
      && (
        isPbaCommissionerMode(state)
          ? host.city.trim() !== '' && (host.arena?.trim() ?? '') !== ''
          : (host.teamIds?.length ?? 0) > 0
      ),
    )
  ) return 'resolved';
  if (taskId === 'global_games' && state.leagueStats.globalGamesScheduledYear === state.leagueStats.year && (state.globalGames?.length ?? 0) > 0) return 'resolved';
  if (
    taskId === 'international_tournament'
    && (state.internationalTournament?.reviewed || state.internationalTournament?.status === 'reviewed')
  ) return 'resolved';
  if (taskId === 'international_preseason' && state.schedule.some(game => game.isPreseason && (game.homeTid >= 100 || game.awayTid >= 100))) return 'resolved';
  if (taskId === 'christmas_games' && (state.christmasGames?.length ?? 0) > 0) return 'resolved';
  if (taskId === 'invite_performance' && state.leagueStats.performanceInvitationYear === state.leagueStats.year) return 'resolved';
  if (taskId === 'hof_ceremony' && state.leagueStats.hofClassesInducted?.includes(getCommissionerHofClassYear(state))) return 'resolved';
  if (taskId === 'all_star_replacements' && hasAllStarInjuryReplacements(state) && getOutstandingAllStarInjuries(state).length === 0) return 'resolved';
  if (taskId === 'celebrity_roster' && (state.allStar?.celebrityRoster?.length ?? 0) > 0) return 'resolved';
  if (taskId === 'dunk_participants' && (state.allStar?.dunkContestContestants?.length ?? 0) > 0) return 'resolved';
  if (taskId === 'three_point_participants' && (state.allStar?.threePointContestants?.length ?? 0) > 0) return 'resolved';
  if (taskId === 'shooting_stars_participants' && (state.allStar?.shootingStarsContestants?.length ?? 0) > 0) return 'resolved';
  if (taskId === 'skills_participants' && (state.allStar?.skillsChallengeContestants?.length ?? 0) > 0) return 'resolved';
  if (taskId === 'horse_participants' && (state.allStar?.horseContestants?.length ?? 0) > 0) return 'resolved';
  return null;
}

export function ensureCommissionerTaskLedger(state: GameState): CommissionerTaskLedger {
  if (!isNbaCommissionerTaskMode(state)) {
    return state.commissionerTasks ?? { version: 2, records: {} };
  }
  const previous = state.commissionerTasks?.records ?? {};
  const records = Object.fromEntries(
    Object.entries(previous).filter(([, record]) => String(record.taskId) !== 'other_event_participants'),
  );
  const season = getCommissionerTaskCycleYear(state);
  for (const definition of COMMISSIONER_TASK_DEFINITIONS) {
    const key = commissionerTaskKey(season, definition.id);
    const current = records[key];
    const inferred = inferredStatus(state, definition.id);
    const dates = getCommissionerTaskDates(state, definition.id);
    const staleHostCompletion = definition.id === 'all_star_host'
      && current != null
      && completed(current.status)
      && inferred !== 'resolved';
    const staleReplacementCompletion = definition.id === 'all_star_replacements'
      && current != null
      && completed(current.status)
      && getOutstandingAllStarInjuries(state).length > 0;
    let status: CommissionerTaskStatus = current?.status ?? 'pending';
    if (staleHostCompletion || staleReplacementCompletion) {
      status = 'pending';
    } else if (inferred === 'resolved') {
      status = completed(current?.status) ? current!.status : 'resolved';
    } else if (inferred === 'not_applicable') {
      status = allStarTaskIds.has(definition.id) || !completed(current?.status)
        ? 'not_applicable'
        : current!.status;
    } else if (current?.status === 'not_applicable') {
      status = 'pending';
    }
    const clearResolution = staleHostCompletion
      || staleReplacementCompletion
      || (current?.status === 'not_applicable' && status === 'pending')
      || (status === 'not_applicable' && current?.status !== 'not_applicable');
    records[key] = {
      key,
      taskId: definition.id,
      season,
      phase: definition.phase,
      status,
      openDate: dates.openDate,
      dueDate: dates.dueDate,
      resolvedAt: clearResolution ? undefined : current?.resolvedAt,
      resolution: clearResolution ? undefined : current?.resolution,
      league: resolveLeagueSeasonLifecycle(state).mode,
      cycleId: `${resolveLeagueSeasonLifecycle(state).mode}:${season}`,
      applicable: status !== 'not_applicable',
      availableDate: dates.openDate,
      prerequisites: COMMISSIONER_TASK_DEFINITIONS
        .filter(other => other.phase === definition.phase && other.order < definition.order)
        .map(other => commissionerTaskKey(season, other.id)),
      authority: definition.allowAssistant ? 'delegated' : 'manual',
      destination: resolveCommissionerTaskDestination(definition.id)?.focus
        ?? resolveCommissionerTaskDestination(definition.id)?.tab
        ?? definition.workspace
        ?? 'commissioner-tasks',
      completionEvidence: clearResolution ? undefined : current?.completionEvidence ?? current?.resolution,
    };
  }
  return { version: 2, records };
}

export function areCommissionerTaskLedgersEqual(
  left: CommissionerTaskLedger | undefined,
  right: CommissionerTaskLedger,
): boolean {
  if (!left || left.version !== right.version) return false;
  const leftKeys = Object.keys(left.records);
  const rightKeys = Object.keys(right.records);
  if (leftKeys.length !== rightKeys.length) return false;
  return rightKeys.every(key => {
    const a = left.records[key];
    const b = right.records[key];
    return !!a
      && a.key === b.key
      && a.taskId === b.taskId
      && a.season === b.season
      && a.phase === b.phase
      && a.status === b.status
      && a.openDate === b.openDate
      && a.dueDate === b.dueDate
      && a.resolvedAt === b.resolvedAt
      && a.resolution === b.resolution;
  });
}

export function getCommissionerTaskViews(state: GameState): CommissionerTaskView[] {
  if (!isNbaCommissionerTaskMode(state)) return [];
  const ledger = ensureCommissionerTaskLedger(state);
  const today = normalizeDate(state.date);
  const definitions = [...COMMISSIONER_TASK_DEFINITIONS].sort(
    (left, right) => commissionerTaskOrder(state, left) - commissionerTaskOrder(state, right),
  );
  return definitions.map((definition, index) => {
    const cycle = getCommissionerTaskCycleYear(state);
    const record = ledger.records[commissionerTaskKey(cycle, definition.id)];
    const rolloverReviewReady = (
      definition.id !== 'retired_players'
      && definition.id !== 'staff_retirements'
      && definition.id !== 'referee_retirements'
    )
      || state.leagueStats.year > cycle
      || (
        definition.id === 'referee_retirements'
        && (state.refereeRetirementAnnouncements?.length ?? 0) > 0
      );
    const prerequisitesDone = definitions
      .slice(0, index)
      .filter(other => other.phase === definition.phase)
      .every(other => terminal(ledger.records[commissionerTaskKey(cycle, other.id)].status));
    const displayDefinition = isPbaCommissionerMode(state)
      ? {
          ...definition,
          ...(definition.id === 'nba_draft'
            ? {
                title: 'PBA Draft',
                description: 'Conduct the PBA draft and hand every selection to the active team roster.',
                autoLabel: 'Simulate the complete PBA draft',
              }
            : {}),
          ...(definition.id === 'league_pass_price'
            ? {
                title: 'Streaming Package Price',
                description: 'Set the monthly streaming price before broadcast projections are finalized.',
              }
            : {}),
          ...(definition.id === 'media_rights_renewal'
            ? {
                title: 'Media Rights Renewal',
                description: 'Choose a complete broadcast package for the coming PBA seasons.',
              }
             : {}),
          ...(definition.id === 'global_games'
            ? {
                title: 'PBA Opening Night',
                description: 'Choose the two teams featured on Philippine Cup opening night and confirm the arena.',
                autoLabel: 'Use the recommended opening matchup and venue',
              }
            : {}),
          ...(definition.id === 'all_star_host'
            ? {
                title: 'All-Star Weekend Venue',
                description: 'Choose the Philippine arena that will host the next PBA All-Star Weekend.',
                autoLabel: 'Choose the strongest available venue',
              }
            : {}),
        }
      : definition;
    return {
      ...record,
      definition: displayDefinition,
      available: today >= record.openDate
        && prerequisitesDone
        && !terminal(record.status)
        && rolloverReviewReady
        && (definition.id !== 'season_review' || isCommissionerSeasonReviewReady(state, cycle)),
      overdue: today > record.dueDate && !terminal(record.status),
    };
  });
}

export function shouldShowCommissionerOffseasonTasks(state: GameState): boolean {
  const tasks = getCommissionerTaskViews(state)
    .filter(task => task.phase === 'offseason' && task.status !== 'not_applicable');
  if (tasks.length === 0) return false;
  const today = normalizeDate(state.date);
  const firstOpenDate = tasks[0].openDate;
  const finalDueDate = tasks.find(task => task.taskId === 'hof_ceremony')?.dueDate ?? tasks.reduce(
    (latest, task) => task.dueDate > latest ? task.dueDate : latest,
    tasks[0].dueDate,
  );
  const currentWindowTasks = tasks.filter(task => task.openDate <= finalDueDate);
  const unfinishedCurrentTask = currentWindowTasks.some(task => !terminal(task.status));
  if (!unfinishedCurrentTask) return false;
  return today >= firstOpenDate
    && (today <= finalDueDate || currentWindowTasks.some(task => !terminal(task.status) && task.openDate <= today));
}

export function getBlockingCommissionerTask(state: GameState, targetDate: string): CommissionerTaskView | null {
  if (state.gameMode === 'gm' || !isNbaCommissionerTaskMode(state)) return null;
  const target = normalizeDate(targetDate);
  const targetCycle = getCommissionerTaskCycleForDate(state, target);
  const currentCycle = getCommissionerTaskCycleYear(state);
  const prospective: CommissionerTaskView[] = [];
  for (let cycle = currentCycle + 1; cycle <= targetCycle; cycle++) {
    for (const definition of COMMISSIONER_TASK_DEFINITIONS) {
      const dates = getCommissionerTaskDates(state, definition.id, cycle);
      const status: CommissionerTaskStatus = applicable(state, definition.id, cycle)
        ? 'pending'
        : 'not_applicable';
      prospective.push({
        key: commissionerTaskKey(cycle, definition.id),
        taskId: definition.id,
        season: cycle,
        phase: definition.phase,
        status,
        openDate: dates.openDate,
        dueDate: dates.dueDate,
        league: resolveLeagueSeasonLifecycle(state).mode,
        cycleId: `${resolveLeagueSeasonLifecycle(state).mode}:${cycle}`,
        applicable: status !== 'not_applicable',
        availableDate: dates.openDate,
        prerequisites: COMMISSIONER_TASK_DEFINITIONS
          .filter(other => other.phase === definition.phase && other.order < definition.order)
          .map(other => commissionerTaskKey(cycle, other.id)),
        authority: definition.allowAssistant ? 'delegated' : 'manual',
        destination: resolveCommissionerTaskDestination(definition.id)?.focus
          ?? resolveCommissionerTaskDestination(definition.id)?.tab
          ?? definition.workspace
          ?? 'commissioner-tasks',
        definition,
        available: false,
        overdue: false,
      });
    }
  }
  const phaseHeads = new Map<string, CommissionerTaskView>();
  [...getCommissionerTaskViews(state), ...prospective]
    .filter(task => !terminal(task.status) && task.taskId !== 'all_star_replacements' && task.taskId !== 'hof_ceremony')
    .filter(task =>
      task.taskId !== 'season_review'
      || task.season !== currentCycle
      || isCommissionerSeasonReviewReady(state, currentCycle),
    )
    .sort((left, right) =>
      left.season - right.season
      || commissionerTaskOrder(state, left.definition) - commissionerTaskOrder(state, right.definition),
    )
    .forEach(task => {
      const phaseKey = `${task.season}:${task.phase}`;
      if (!phaseHeads.has(phaseKey)) phaseHeads.set(phaseKey, task);
    });
  return [...phaseHeads.values()]
    .filter(task => task.openDate <= target)
    .sort((left, right) =>
      left.openDate.localeCompare(right.openDate)
      || commissionerTaskOrder(state, left.definition) - commissionerTaskOrder(state, right.definition),
    )[0] ?? null;
}

export const isCommissionerTaskTerminal = (status: CommissionerTaskStatus) => terminal(status);

export function updateCommissionerTaskRecord(
  state: GameState,
  taskId: CommissionerTaskId,
  status: CommissionerTaskStatus,
  resolution?: Record<string, unknown>,
): CommissionerTaskLedger {
  const ledger = ensureCommissionerTaskLedger(state);
  const key = commissionerTaskKey(getCommissionerTaskCycleYear(state), taskId);
  const current = ledger.records[key];
  return {
    ...ledger,
    records: {
      ...ledger.records,
      [key]: {
        ...current,
        status,
        resolvedAt: terminal(status) ? normalizeDate(state.date) : undefined,
        resolution,
      },
    },
  };
}
