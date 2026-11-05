import type { GameState, GameResult, LeagueStats, NewsItem } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { addGameDays, formatGameDateShort, getDraftCombineStartDate, getDraftDate, getDraftLotteryDate, toISODateString } from '../../utils/dateUtils';
import {
  autoScheduleIntlPreseason,
  autoGenerateSchedule,
  autoPickChristmasGames,
  autoPickGlobalGames,
  autoSimVotes,
  autoAnnounceStarters,
  autoAnnounceReserves,
  autoAnnounceRisingStars,
  autoAnnounceCelebrityRoster,
  autoSelectDunkContestants,
  autoSelectThreePointContestants,
  autoSelectShootingStarsContestants,
  autoSelectSkillsChallengeContestants,
  autoSelectHorseContestants,
  autoOpenThroneSignups,
  autoCloseThroneSignups,
  autoOpenThroneVoting,
  autoLockThroneField,
  autoSimAllStarWeekend,
  autoRunLottery,
  autoReviewDraftOrder,
  autoRunDraft,
  autoRunRookieContracts,
  autoInductHOFClass,
} from './autoResolvers';
import { announce as announceAwardViaEngine, getAnnouncementEvents } from '../awards/AwardEngine';
import { recordSimulationPerf } from '../simulation/simulationPerfDebug';
import { getHOFCeremonyDateString } from '../playerDevelopment/hofChecker';
import { NewsGenerator } from '../news/NewsGenerator';
import { getAllStarWeekendDates } from '../allStar/allStarWeekendDates';
import { DEFAULT_MEDIA_RIGHTS, attachBroadcastersToGames } from '../../utils/broadcastingUtils';
import { buildPbaMediaRights } from '../../data/pbaBroadcastRights';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { injectCompetitionPostseasonGames, injectSingleEliminationProgression } from '../competition/competitionResolver';
import { generateForCompetition, repairCompetitionSchedules, selectCompetitionTeamTids } from '../competition/competitionScheduler';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { prepareSeasonRolloverForTask } from '../offseason/taskRolloverGate';
import { getManualCalendarEventWindow } from '../lifecycle/eventArrivalPolicy';
import {
  clearConferenceImports,
  generateNextConferenceSchedule,
  getPbaCalendarPosition,
  getConferenceStartIso,
  getNextPbaScheduleGid,
  getNextConference,
  type PbaConference,
} from '../pba/conferenceTransition';
import { autoManagePbaImports } from '../pba/importAutomation';
import { resolvePbaLocalFreeAgency } from '../pba/localFreeAgencyAi';
import { trimPbaOversizedRosters } from '../pba/rosterTrim';
import {
  autoResolveAllStarInjuryReplacements,
  getOutstandingAllStarInjuries,
} from '../allStar/allStarInjuryReplacements';
import { updateCommissionerTaskRecord } from '../commissionerTasks/taskRegistry';
import { getLeagueCalendarDates, getLeagueScheduleReleaseDate } from '../leagueCalendar';
import { getCompletedManagedEuroSeasonResolutions } from '../competition/euroSeasonReview';
import {
  buildPbaAllStarRosterAnnouncement,
  buildPbaAllStarWeekendAnnouncement,
} from '../news/pbaEcosystemNews';
import { getLeagueLabels } from '../../utils/leagueLabels';
import { resolveFinalsRound } from '../playoffs/playoffRounds';
import { getTeamFullName } from '../../utils/teamNames';
import { enterFreeAgencyForDraftDisabledClass, isDraftEnabled } from '../draft/draftApplicability';
import { applyDraftCombineCalendarEvent } from '../lifecycle/calendarEventDisposition';

type PlayoffMvpBag = {
  pid: string; gp: number; pts: number; reb: number; ast: number;
  stl: number; blk: number; tov: number; fgm: number; fga: number;
  ftm: number; fta: number; fg3m: number; fg3a: number; mins: number;
};

export interface AutoResolveEvent {
  date: string;
  key: string;
  resolver: (state: GameState) => Promise<Partial<GameState>> | Partial<GameState>;
  phase: string;
  required?: boolean;
}

export function repairEuroCompetitionScheduleForToday(state: GameState): GameState {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return state;
  const activeCompetitions = state.activeCompetitions ?? [];
  if (activeCompetitions.length === 0) return state;
  const repairedRegularSeason = repairCompetitionSchedules(state as any, activeCompetitions as any, state.leagueStats.year);
  const repairedPostseason = injectCompetitionPostseasonGames(
    { ...(state as any), schedule: repairedRegularSeason },
    activeCompetitions as any,
    state.leagueStats.year,
  );
  const repairedKnockouts = injectSingleEliminationProgression(
    { ...(state as any), schedule: repairedPostseason },
    activeCompetitions as any,
    state.leagueStats.year,
  );
  return repairedKnockouts === state.schedule ? state : { ...state, schedule: repairedKnockouts };
}

export function hasDueUnplayedEuroCompetitionGames(state: GameState, currentNorm: string): boolean {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return false;
  return (state.schedule ?? []).some(game =>
    !!game.competitionId &&
    !game.played &&
    normalizeDate(game.date) <= currentNorm,
  );
}

export function hasDueUnplayedPbaCompetitionGames(state: GameState, currentNorm: string): boolean {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return false;
  return (state.schedule ?? []).some(game =>
    String(game.competitionId ?? '').startsWith('pba-') &&
    !game.played &&
    normalizeDate(game.date) <= currentNorm,
  );
}

export function autoResolveEuroSetupOffseasonTasks(state: GameState, enabled: boolean): GameState {
  if (!enabled || state.leagueStats?.uiMode !== 'euro_isolated') return state;
  if (!state.offseasonChecklist) return state;
  if (getCompletedManagedEuroSeasonResolutions(state)) return state;
  const currentNorm = normalizeDate(state.date);
  const seasonYear = state.leagueStats?.year ?? new Date().getFullYear();
  const dates = getLeagueCalendarDates(seasonYear, state.leagueStats);
  const campStart = dates.trainingCampStart ?? dates.preseasonStart ?? addGameDays(dates.regularSeasonStart, -14);
  const operationsDeadline = toISODateString(addGameDays(campStart, -83));
  const rosterPrepDeadline = toISODateString(addGameDays(campStart, -21));
  const campDeadline = toISODateString(campStart);
  const checklist = { ...state.offseasonChecklist } as any;
  let changed = false;
  const done = (row: string) => {
    if (checklist[row] === 'pending' || checklist[row] === 'in-progress') {
      checklist[row] = 'done';
      changed = true;
    }
  };

  if (currentNorm > operationsDeadline) {
    ['preseasonFriendlies', 'euroScheduleDraw', 'transferMarket', 'sponsorRenewals', 'facilityUpgrades', 'staffSignings', 'budgetLock'].forEach(done);
  }
  if (currentNorm >= rosterPrepDeadline) {
    ['youthPromotion'].forEach(done);
  }
  if (currentNorm >= campDeadline) {
    done('trainingCamp');
  }

  return changed ? { ...state, offseasonChecklist: checklist } : state;
}

export function autoSignPbaImportsForLazySim(
  state: GameState,
  conference: PbaConference,
  options: { excludeUserTeam?: boolean } = {},
): GameState {
  return autoManagePbaImports(state, conference, {
    fillMissingTeams: true,
    excludeUserTeam: options.excludeUserTeam,
  });
}

export function autoResolvePbaSetupOffseasonTasks(state: GameState, enabled: boolean, targetDate?: string): GameState {
  if (!enabled || state.leagueStats?.uiMode !== 'pba_isolated') return state;
  const leagueStats = state.leagueStats as any;
  if (leagueStats?.pbaConferencePhase !== 'offseason' || !state.offseasonChecklist) return state;
  const current = (leagueStats.pbaConference ?? 'philippine') as PbaConference;
  const nextConference = getNextConference(current, Number(leagueStats.year));
  const playersAfterClear = clearConferenceImports(state.players, current);
  let nextState = { ...state, players: playersAfterClear };

  if (nextConference) {
    nextState = autoSignPbaImportsForLazySim(nextState, nextConference, {
      excludeUserTeam: false,
    });
    const rosterTrim = trimPbaOversizedRosters(nextState, nextState.players);
    if (rosterTrim.trimmed.length > 0) {
      nextState = {
        ...nextState,
        players: rosterTrim.players,
        history: [...(nextState.history ?? []), ...rosterTrim.history],
      };
    }
    const newGames = generateNextConferenceSchedule(nextState, nextConference);
    return {
      ...nextState,
      leagueStats: {
        ...nextState.leagueStats,
        pbaConference: nextConference,
        pbaConferencePhase: 'regularSeason',
      },
      date: normalizeDate(nextState.date) < getConferenceStartIso(nextConference, leagueStats.year ?? new Date().getFullYear())
        ? getConferenceStartIso(nextConference, leagueStats.year ?? new Date().getFullYear())
        : normalizeDate(nextState.date),
      schedule: [...(nextState.schedule ?? []), ...newGames],
      offseasonChecklist: undefined,
    };
  }

  const existingPreparedSeason = Number(leagueStats?.pbaYearEndRolloverPreparedSeason);
  const nextYear = Number.isFinite(existingPreparedSeason)
    ? existingPreparedSeason + 1
    : (leagueStats.year ?? new Date().getFullYear()) + 1;
  const nextSeasonStart = getConferenceStartIso('philippine', nextYear);
  const targetNorm = targetDate ? normalizeDate(targetDate) : null;
  if (targetNorm && targetNorm < nextSeasonStart) return nextState;

  nextState = {
    ...nextState,
    offseasonChecklist: nextState.offseasonChecklist
      ? { ...nextState.offseasonChecklist, pbaConferenceAwards: 'done' }
      : nextState.offseasonChecklist,
  };
  nextState = prepareSeasonRolloverForTask(nextState, 'retiredPlayersReview');
  if (!nextState.draftComplete) {
    const draftPatch = autoRunDraft(nextState);
    if (!(draftPatch as any)?._deferred && Object.keys(draftPatch).length > 0) {
      nextState = { ...nextState, ...draftPatch } as GameState;
    }
  }
  const pbaDraftWasComplete = !!nextState.draftComplete;
  const preparedSeason = Number((nextState.leagueStats as any)?.pbaYearEndRolloverPreparedSeason);
  const alreadyRolledForYearEnd = Number.isFinite(preparedSeason)
    && Number((nextState.leagueStats as any)?.year) === preparedSeason + 1;
  if (!alreadyRolledForYearEnd) return nextState;
  const localFreeAgencyPatch = resolvePbaLocalFreeAgency(nextState);
  if (Object.keys(localFreeAgencyPatch).length > 0) {
    nextState = { ...nextState, ...localFreeAgencyPatch } as GameState;
  }
  const rolledYear = Number((nextState.leagueStats as any)?.year);
  const scheduleYear = Number.isFinite(rolledYear) ? rolledYear : nextYear;
  const philSpec = PBA_COMPETITIONS[0];
  const tids = selectCompetitionTeamTids(philSpec, nextState as any);
  const start = new Date(Date.UTC(scheduleYear - 1, philSpec.seasonStart.month - 1, philSpec.seasonStart.day));
  const newGames = generateForCompetition(
    philSpec,
    tids.map((tid: number) => ({ tid })),
    start,
    getNextPbaScheduleGid(nextState, 'philippine'),
  );
  const preservedBackgroundSchedule = (nextState.schedule ?? []).filter((game: any) =>
    !String(game?.competitionId ?? '').startsWith('pba-'),
  );
  return {
    ...nextState,
    leagueStats: {
      ...nextState.leagueStats,
      pbaConference: 'philippine',
      pbaConferencePhase: 'regularSeason',
      pbaYearEndRolloverPreparedSeason: undefined,
      pbaDraftComplete: pbaDraftWasComplete || (nextState.leagueStats as any)?.pbaDraftComplete,
      pbaDraftCompleteSeason: pbaDraftWasComplete ? scheduleYear : (nextState.leagueStats as any)?.pbaDraftCompleteSeason,
    },
    date: normalizeDate(nextState.date) < getConferenceStartIso('philippine', scheduleYear)
      ? getConferenceStartIso('philippine', scheduleYear)
      : normalizeDate(nextState.date),
    schedule: [...preservedBackgroundSchedule, ...newGames].sort((a: any, b: any) =>
      new Date(a.date).getTime() - new Date(b.date).getTime(),
    ),
    offseasonChecklist: undefined,
  } as GameState;
}

const PLAYOFF_MVP_LEAGUE_TS = 0.57;

export function computePlayoffMvpFromResults(
  results: Array<{ homeTeamId: number; awayTeamId: number; homeStats: any[]; awayStats: any[] }>,
  winnerTid: number,
  minGames = 3,
): { pid: string; score: number; avgPts: number } | null {
  const bags = new Map<string, PlayoffMvpBag>();
  for (const r of results) {
    const stats = r.homeTeamId === winnerTid ? r.homeStats
      : r.awayTeamId === winnerTid ? r.awayStats
      : null;
    if (!stats) continue;
    for (const s of stats) {
      if (!s.playerId) continue;
      const b = bags.get(s.playerId) ?? {
        pid: s.playerId, gp: 0, pts: 0, reb: 0, ast: 0,
        stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0,
        ftm: 0, fta: 0, fg3m: 0, fg3a: 0, mins: 0,
      };
      b.gp += 1;
      b.pts += s.pts ?? 0;
      b.reb += s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0));
      b.ast += s.ast ?? 0;
      b.stl += s.stl ?? 0;
      b.blk += s.blk ?? 0;
      b.tov += s.tov ?? 0;
      b.fgm += s.fgm ?? 0;
      b.fga += s.fga ?? 0;
      b.ftm += s.ftm ?? 0;
      b.fta += s.fta ?? 0;
      b.fg3m += s.threePm ?? 0;
      b.fg3a += s.threePa ?? 0;
      b.mins += s.min ?? 0;
      bags.set(s.playerId, b);
    }
  }
  const candidates = [...bags.values()].filter(b => b.gp >= minGames);
  if (candidates.length === 0) return null;
  const scored = candidates.map(b => {
    const avgPts = b.pts / b.gp;
    const tsDenom = 2 * (b.fga + 0.44 * b.fta);
    const ts = tsDenom > 0 ? b.pts / tsDenom : 0;
    const score =
      avgPts * 1.0
      + (b.reb / b.gp) * 0.5
      + (b.ast / b.gp) * 0.7
      + (b.stl / b.gp) * 1.0
      + (b.blk / b.gp) * 1.0
      - (b.tov / b.gp) * 0.7
      + (ts - PLAYOFF_MVP_LEAGUE_TS) * 8
      + Math.min(b.mins / b.gp, 40) / 40 * 3;
    return { pid: b.pid, score, avgPts };
  });
  scored.sort((a, b) => (b.score - a.score) || (b.avgPts - a.avgPts));
  return scored[0];
}

const autoBroadcastingDefault = (state: GameState): Partial<GameState> => {
  const mediaRights = state.leagueStats.mediaRights ?? (
    state.leagueStats.uiMode === 'pba_isolated'
      ? buildPbaMediaRights(state.leagueStats.year, state.leagueStats.salaryCap)
      : DEFAULT_MEDIA_RIGHTS
  );
  // LOAD/restart rebuilds the sparse event list, so this resolver can be seen
  // again after its original date. Existing assignments are canonical; only
  // hydrate genuinely missing rows or the reduced unplayed slate can reshuffle
  // national slots on every reload.
  const assignedSchedule = attachBroadcastersToGames(state.schedule, mediaRights, state.teams);
  const updatedSchedule = state.schedule.map((game, index) =>
    game.broadcaster ? game : (assignedSchedule[index] ?? game));
  return {
    leagueStats: {
      ...state.leagueStats,
      mediaRights,
    },
    schedule: updatedSchedule,
  };
};

export const buildAutoResolveEvents = (
  y: number,
  leagueStats?: any,
  gameMode?: GameState['gameMode'],
): AutoResolveEvent[] => {
  const buildStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const finish = (result: AutoResolveEvent[], mode: string): AutoResolveEvent[] => {
    recordSimulationPerf({
      engine: 'calendar-event-build',
      season: y,
      uiMode: String(leagueStats?.uiMode ?? 'nba'),
      gameMode: String(gameMode ?? 'unknown'),
      mode,
      eventCount: result.length,
      eventSignature: result.map(event => `${event.date}:${event.key}`).join('|'),
      totalMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - buildStart,
    });
    return result;
  };
  const euroIsolated = leagueStats?.uiMode === 'euro_isolated';
  const pbaIsolated = leagueStats?.uiMode === 'pba_isolated';
  const wnbaIsolated = leagueStats?.uiMode === 'wnba_isolated';
  const completedWnbaOpeningDraftCycle = wnbaIsolated
    && leagueStats?.openingRosterMode === 'current'
    && Number(leagueStats?.wnbaSourceSeason) === Number(y);
  const calendarDates = getLeagueCalendarDates(y, leagueStats);
  const scheduleReleaseDate = getLeagueScheduleReleaseDate(y, leagueStats);
  const scheduleDate = toISODateString(scheduleReleaseDate);
  const scheduleOffset = (days: number) => toISODateString(addGameDays(scheduleReleaseDate, days));
  const draftLotteryEnabled = isDraftLotteryEnabled(leagueStats?.draftType);
  const draftLotteryEventDateStr = getManualCalendarEventWindow(
    getDraftLotteryDate(y, leagueStats),
  ).arrivalDate;
  const draftCombineEventDateStr = toISODateString(getDraftCombineStartDate(y, leagueStats));
  const draftEventDateStr = getManualCalendarEventWindow(
    getDraftDate(y, leagueStats),
  ).arrivalDate;
  const draftEnabled = isDraftEnabled(leagueStats ?? { enableDraft: true, draftType: 'nba' });
  const configuredReviewDate = Number(leagueStats?.draftOrderReviewMonth) > 0
    && Number(leagueStats?.draftOrderReviewDay) > 0
    ? new Date(Date.UTC(
        y,
        Number(leagueStats.draftOrderReviewMonth) - 1,
        Number(leagueStats.draftOrderReviewDay),
      ))
    : calendarDates.regularSeasonEnd;
  const draftOrderReviewEventDateStr = getManualCalendarEventWindow(configuredReviewDate).arrivalDate;
  const hofCeremony = getHOFCeremonyDateString(calendarDates.regularSeasonStart.getUTCFullYear());
  const allStarDates = getAllStarWeekendDates(y, leagueStats);
  const allStarDate = (date: Date) => toISODateString(date);
  const allStarReplacementDeadline = allStarDate(
    new Date(allStarDates.allStarGame.getTime() - 2 * 86_400_000),
  );

  const stubState = {
    leagueStats: leagueStats ?? { uiMode: 'nba' },
    players: [], teams: [], nonNBATeams: [], staff: null, historicalAwards: [],
  } as any;
  const awardEvents: AutoResolveEvent[] = getAnnouncementEvents(stubState, y).map(ev => ({
    date: ev.date,
    key: `award_${ev.awardId}`,
    resolver: (state: GameState) => announceAwardViaEngine(state, ev.awardId),
    phase: ev.phase,
  }));

  if (pbaIsolated) {
    return finish([
      { date: allStarDate(allStarDates.votingEnd), key: 'allstar_votes', resolver: autoSimVotes, phase: 'Selecting PBA All-Star captains...' },
      { date: allStarDate(allStarDates.reservesAnnounced), key: 'allstar_reserves', resolver: autoAnnounceReserves, phase: 'Setting PBA All-Star rosters...' },
      { date: allStarDate(allStarDates.dunkContestAnnounced), key: 'dunk_contestants', resolver: state => autoSelectDunkContestants(state, true, false), phase: 'Selecting PBA Dunk Contest field...' },
      { date: allStarDate(allStarDates.threePointAnnounced), key: 'threepoint_contestants', resolver: state => autoSelectThreePointContestants(state, true, false), phase: 'Selecting PBA 3-Point Contest field...' },
      { date: allStarDate(allStarDates.skillsChallengeAnnounced), key: 'skills_challenge_contestants', resolver: state => autoSelectSkillsChallengeContestants(state, true, false), phase: 'Selecting PBA Skills Challenge field...' },
      { date: allStarDate(allStarDates.allStarGame), key: 'allstar_weekend', resolver: autoSimAllStarWeekend, phase: 'Simulating PBA All-Star Weekend...', required: true },
      ...awardEvents,
    ], 'pba');
  }

  if (euroIsolated) {
    return finish([
      { date: scheduleDate, key: 'schedule_generation', resolver: autoGenerateSchedule, phase: 'Generating Schedule...' },
      ...awardEvents,
    ], 'euro');
  }

  const events: AutoResolveEvent[] = [
    { date: scheduleOffset(-8), key: 'broadcasting_default', resolver: autoBroadcastingDefault, phase: 'Setting Broadcasting Deal...' },
    ...(!wnbaIsolated ? [{ date: scheduleOffset(-2), key: 'christmas_games', resolver: autoPickChristmasGames, phase: 'Setting Christmas Games...' }] : []),
    { date: scheduleOffset(-1), key: 'global_games', resolver: autoPickGlobalGames, phase: 'Finalizing Global Schedule...' },
    { date: scheduleOffset(-1), key: 'intl_preseason', resolver: autoScheduleIntlPreseason, phase: 'Scheduling International Preseason...' },
    {
      date: scheduleDate,
      key: 'schedule_generation',
      // Long simulation commits the schedule fact only. The News/Social read
      // model derives its presentation after the user opens that surface.
      resolver: autoGenerateSchedule,
      phase: 'Generating Schedule...',
    },
    { date: hofCeremony, key: 'hof_induction', resolver: autoInductHOFClass, phase: 'Inducting Hall of Fame Class...' },
    { date: allStarDate(allStarDates.throneSignupOpens), key: 'throne_signups_open', resolver: autoOpenThroneSignups, phase: 'Opening Throne Sign-Ups...' },
    { date: allStarDate(allStarDates.votingEnd), key: 'allstar_votes', resolver: autoSimVotes, phase: 'Simulating All-Star Voting...' },
    { date: allStarDate(allStarDates.throneSignupCloses), key: 'throne_signups_close', resolver: autoCloseThroneSignups, phase: 'Closing Throne Sign-Ups...' },
    { date: allStarDate(allStarDates.throneVotingOpens), key: 'throne_voting_open', resolver: autoOpenThroneVoting, phase: 'Opening Throne Voting...' },
    { date: allStarDate(allStarDates.startersAnnounced), key: 'allstar_starters', resolver: autoAnnounceStarters, phase: 'Announcing All-Star Starters...' },
    { date: allStarDate(allStarDates.reservesAnnounced), key: 'allstar_reserves', resolver: autoAnnounceReserves, phase: 'Announcing All-Star Reserves...' },
    { date: allStarDate(allStarDates.risingStarsAnnounced), key: 'rising_stars_roster', resolver: autoAnnounceRisingStars, phase: 'Announcing Rising Stars...' },
    { date: allStarDate(allStarDates.celebrityAnnounced), key: 'celebrity_roster_reveal', resolver: state => autoAnnounceCelebrityRoster(state, false), phase: 'Announcing Celebrity Game field...' },
    { date: allStarDate(allStarDates.throneFieldReveal), key: 'throne_field_reveal', resolver: autoLockThroneField, phase: 'Revealing The Throne — Field of 16...' },
    { date: allStarDate(allStarDates.dunkContestAnnounced), key: 'dunk_contestants', resolver: state => autoSelectDunkContestants(state, true, false), phase: 'Selecting Dunk Contest Field...' },
    { date: allStarDate(allStarDates.threePointAnnounced), key: 'threepoint_contestants', resolver: state => autoSelectThreePointContestants(state, true, false), phase: 'Selecting 3-Point Contest Field...' },
    { date: allStarDate(allStarDates.shootingStarsAnnounced), key: 'shooting_stars_contestants', resolver: state => autoSelectShootingStarsContestants(state, true, false), phase: 'Selecting Shooting Stars Field...' },
    { date: allStarDate(allStarDates.skillsChallengeAnnounced), key: 'skills_challenge_contestants', resolver: state => autoSelectSkillsChallengeContestants(state, true, false), phase: 'Selecting Skills Challenge Field...' },
    { date: allStarDate(allStarDates.horseAnnounced), key: 'horse_contestants', resolver: state => autoSelectHorseContestants(state, true, false), phase: 'Selecting H-O-R-S-E field...' },
    {
      date: allStarReplacementDeadline,
      key: 'allstar_injury_replacements',
      resolver: (state: GameState) => {
        if (getOutstandingAllStarInjuries(state).length === 0) return {};
        const result = autoResolveAllStarInjuryReplacements(state);
        if (result.replacements.length === 0) return {};
        const commissionerTasks = state.gameMode === 'gm'
          ? state.commissionerTasks
          : updateCommissionerTaskRecord(
              result.state,
              'all_star_replacements',
              'auto_resolved',
              { replacements: result.replacements },
            );
        return {
          allStar: result.state.allStar,
          inbox: result.state.inbox,
          ...(state.gameMode === 'gm' ? {} : { commissionerTasks }),
        };
      },
      phase: 'Finalizing All-Star injury replacements...',
    },
    { date: allStarDate(allStarDates.risingStars), key: 'allstar_weekend', resolver: autoSimAllStarWeekend, phase: 'Simulating All-Star Weekend...', required: true },
    ...awardEvents,
    ...(!draftEnabled
      ? [{
          date: draftEventDateStr,
          key: 'incoming_class_entry',
          resolver: (state: GameState) => {
            const next = enterFreeAgencyForDraftDisabledClass(state, y);
            return next === state ? {} : { players: next.players };
          },
          phase: 'Opening Incoming Player Market...',
        }]
      : []),
    ...(draftEnabled && draftLotteryEnabled && !completedWnbaOpeningDraftCycle
      ? [{ date: draftLotteryEventDateStr, key: 'draft_lottery', resolver: autoRunLottery, phase: 'Running Draft Lottery...' }]
      : []),
    ...(draftEnabled && !completedWnbaOpeningDraftCycle
      ? [{
          date: draftCombineEventDateStr,
          key: 'draft_combine',
          resolver: (state: GameState) => applyDraftCombineCalendarEvent(state, y).patch,
          phase: 'Publishing Draft Combine results...',
        }]
      : []),
    ...(draftEnabled && !completedWnbaOpeningDraftCycle
      ? [{ date: draftOrderReviewEventDateStr, key: 'draft_order_review', resolver: autoReviewDraftOrder, phase: 'Reviewing Draft Order...' }]
      : []),
    ...(draftEnabled && !completedWnbaOpeningDraftCycle
      ? [
          { date: draftEventDateStr, key: 'draft_execute', resolver: autoRunDraft, phase: wnbaIsolated ? 'Executing WNBA Draft...' : 'Executing NBA Draft...' },
          { date: draftEventDateStr, key: 'rookie_contracts', resolver: autoRunRookieContracts, phase: 'Finalizing Rookie Contracts...' },
        ]
      : []),
  ];
  if (gameMode === 'gm') return finish(events, 'gm');
  const commissionerTaskOwnedEvents = new Set([
    'christmas_games',
    'global_games',
    'intl_preseason',
    'hof_induction',
    'throne_field_reveal',
  ]);
  return finish(events.filter(event => !commissionerTaskOwnedEvents.has(event.key)), 'commissioner');
};

export function buildAutoNews(eventKey: string, state: GameState) {
  const date = state.date;
  const season = state.leagueStats?.year ?? new Date().getFullYear();
  const allStarDates = getAllStarWeekendDates(season, state.leagueStats);
  const throneSignupCloseLabel = formatGameDateShort(allStarDates.throneSignupCloses);
  const throneVotingOpenLabel = formatGameDateShort(allStarDates.throneVotingOpens);
  const autoId = (suffix: string) => `auto-news-${season}-${suffix}`;
  const isPba = state.leagueStats?.uiMode === 'pba_isolated';
  const pbaRosterStory = isPba ? buildPbaAllStarRosterAnnouncement(state) : null;
  const pbaWeekendStory = isPba ? buildPbaAllStarWeekendAnnouncement(state) : null;
  const map: Record<string, any> = {
    christmas_games: null,
    throne_signups_open: { id: autoId('throne-signups-open'), headline: 'THE THRONE — Sign-Ups Open', content: `The 1v1 tournament throne is up for grabs. Sign-ups are live through ${throneSignupCloseLabel}.`, date },
    throne_signups_close: { id: autoId('throne-signups-closed'), headline: 'THE THRONE — Sign-Ups Closed', content: `Sign-ups have closed. Voting opens ${throneVotingOpenLabel}.`, date },
    throne_field_reveal: { id: autoId('throne-field-reveal'), headline: 'THE THRONE — Field of 16 Revealed', content: 'The composite vote has spoken. The 16 players who will fight for the crown have been chosen.', date },
    allstar_starters: { id: autoId('nba-allstar-starters'), headline: 'All-Star Starters Announced', content: 'Fan voting has concluded. The All-Star starters have been revealed.', date },
    allstar_reserves: isPba
      ? pbaRosterStory
        ? { id: pbaRosterStory.id, headline: pbaRosterStory.headline, content: pbaRosterStory.content, date, category: 'pba_all_star_captains' }
        : null
      : { id: autoId('nba-allstar-rosters'), headline: 'Full All-Star Rosters Set', content: 'Coaches have made their picks. The complete All-Star rosters are finalized.', date },
    allstar_weekend: isPba
      ? pbaWeekendStory
        ? { id: pbaWeekendStory.id, headline: pbaWeekendStory.headline, content: pbaWeekendStory.content, date, category: 'pba_all_star_recap' }
        : null
      : { id: autoId('nba-allstar-weekend'), headline: 'All-Star Weekend Complete', content: 'The NBA All-Star Weekend has concluded. Check the All-Star tab for results.', date },
    background_nba_allstar_starters: { id: autoId('background-nba-allstar-starters'), headline: 'NBA All-Star Starters Announced', content: 'Fan voting has concluded. The NBA All-Star starters have been revealed.', date },
    background_nba_allstar_reserves: { id: autoId('background-nba-allstar-rosters'), headline: 'NBA All-Star Rosters Set', content: 'Coaches have made their picks. The complete NBA All-Star rosters are finalized.', date },
    background_nba_allstar_weekend: { id: autoId('background-nba-allstar-weekend'), headline: 'NBA All-Star Weekend Complete', content: 'The NBA All-Star Game and weekend contests have concluded.', date },
    award_coy: null, award_smoy: null, award_mip: null,
    award_dpoy: null, award_roy: null, award_allnba: null, award_mvp: null,
    draft_lottery: { id: autoId('draft-lottery'), headline: 'Draft Lottery Complete', content: 'The NBA Draft Lottery has concluded. View the Draft Lottery tab for full results.', date },
    draft_execute: { id: autoId('draft-complete'), headline: 'NBA Draft Complete', content: 'The NBA Draft has concluded. All prospects have been assigned to teams. Undrafted players are now free agents.', date },
    hof_induction: null,
  };
  return map[eventKey] ?? null;
}

export function generatePlayoffSeriesNews(
  prevPlayoffs: GameState['playoffs'],
  newPlayoffs: GameState['playoffs'],
  teams: GameState['teams'],
  date: string,
  season: number,
  allSimResults: GameResult[] = [],
  players: GameState['players'] = [],
  historicalAwards: GameState['historicalAwards'] = [],
  leagueStats?: Pick<LeagueStats, 'uiMode' | 'leagueName' | 'numGamesPlayoffSeries'>,
): NewsItem[] {
  if (!newPlayoffs || !prevPlayoffs) return [];
  const news: NewsItem[] = [];
  const finalsRound = resolveFinalsRound(leagueStats, newPlayoffs);
  const labels = getLeagueLabels(undefined, leagueStats?.uiMode, leagueStats?.leagueName);

  for (const series of newPlayoffs.series) {
    const prev = prevPlayoffs.series.find(s => s.id === series.id);
    if (!prev || prev.status === 'complete') continue;

    const higherTeam = teams.find(t => t.id === series.higherSeedTid);
    const lowerTeam = teams.find(t => t.id === series.lowerSeedTid);
    if (!higherTeam || !lowerTeam) continue;

    const newHW = series.higherSeedWins;
    const newLW = series.lowerSeedWins;
    const prevHW = prev.higherSeedWins;
    const prevLW = prev.lowerSeedWins;
    const winsNeeded = Math.ceil(series.gamesNeeded / 2);

    if (series.status === 'complete') {
      const winner = teams.find(t => t.id === series.winnerId);
      const loser = teams.find(t => t.id === (series.winnerId === series.higherSeedTid ? series.lowerSeedTid : series.higherSeedTid));
      if (!winner || !loser) continue;

      const totalGames = newHW + newLW;
      const isChampionship = series.round === finalsRound;

      if (!isChampionship) {
        const winnerResults = allSimResults.filter(r => r.homeTeamId === winner.id || r.awayTeamId === winner.id);
        const winnerTopStat = winnerResults
          .flatMap(r => r.homeTeamId === winner.id ? r.homeStats : r.awayStats)
          .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0))[0];
        const winnerTopPlayer = winnerTopStat ? players.find(p => p.internalId === winnerTopStat.playerId) : undefined;
        const winCategory = series.round === finalsRound - 1 ? 'playoff_finals_bound'
          : series.round === 2 ? 'playoff_advance_r2'
          : 'playoff_series_win';

        const winItem = NewsGenerator.generate(winCategory, date, {
          teamName: getTeamFullName(winner), teamCity: winner.region ?? winner.name,
          opponentName: getTeamFullName(loser), gamesCount: totalGames,
        }, undefined);
        if (winItem) {
          if (winnerTopPlayer?.imgURL) winItem.playerPortraitUrl = winnerTopPlayer.imgURL;
          if (series.round === finalsRound - 1) {
            const finalsSeasonYears = new Set([
              ...(historicalAwards ?? [])
                .filter((a: any) => (a.type === 'Champion' || a.type === 'Runner Up') && Number(a.tid) === winner.id)
                .map((a: any) => Number(a.season)),
              ...(winner.seasons ?? [])
                .filter((s: any) => s.playoffRoundsWon === finalsRound || s.playoffRoundsWon === finalsRound - 1)
                .map((s: any) => Number(s.season)),
            ]);
            const priorFinals = [...finalsSeasonYears].filter(yr => yr < season).sort((a, b) => b - a);
            const lastFinalsYear = priorFinals[0];
            const consecutiveFinals = lastFinalsYear === season - 1 && finalsSeasonYears.has(season - 2);
            const fmt = (yr: number) => `${yr - 1}-${String(yr).slice(-2)}`;

            const winnerName = getTeamFullName(winner);
            if (consecutiveFinals) winItem.headline = `${winnerName} Return to the ${labels.finals} for the Third Consecutive Year`;
            else if (lastFinalsYear === season - 1) winItem.headline = `${winnerName} Are Back — Return to the ${labels.finals}`;
            else if (!lastFinalsYear) winItem.headline = `FIRST FINALS IN FRANCHISE HISTORY! ${winnerName} Are Going to the ${labels.finals}`;
            else winItem.headline = `${winnerName} Head to the ${labels.finals} for First Time Since ${fmt(lastFinalsYear)}`;
          }
          news.push(winItem);
        }

        const elimItem = NewsGenerator.generate('playoff_elimination', date, {
          teamName: getTeamFullName(loser), teamCity: loser.region ?? loser.name,
          opponentName: getTeamFullName(winner), gamesCount: totalGames,
        }, undefined);
        if (elimItem) {
          if (winnerTopPlayer?.imgURL) elimItem.playerPortraitUrl = winnerTopPlayer.imgURL;
          news.push(elimItem);
        }
      }
      continue;
    }

    if (newHW === prevHW && newLW === prevLW) continue;

    const hGained = newHW - prevHW;
    const lGained = newLW - prevLW;

    if (winsNeeded === 4 && newHW === 3 && newLW === 3 && !(prevHW === 3 && prevLW === 3)) {
      const cameBack = lGained > hGained ? lowerTeam : higherTeam;
      const opponent = cameBack === lowerTeam ? higherTeam : lowerTeam;
      const item = NewsGenerator.generate('series_forces_game7', date, {
        teamName: cameBack.name, opponentName: opponent.name, year: season,
      }, cameBack.logoUrl);
      if (item) news.push(item);
      continue;
    }

    const prevHigherOnBrink = prevHW === winsNeeded - 1 && prevLW < winsNeeded - 1;
    const prevLowerOnBrink = prevLW === winsNeeded - 1 && prevHW < winsNeeded - 1;

    if (prevHigherOnBrink && lGained > 0) {
      const item = NewsGenerator.generate('series_alive', date, {
        teamName: lowerTeam.name, opponentName: higherTeam.name, year: season,
      }, lowerTeam.logoUrl);
      if (item) news.push(item);
      continue;
    }
    if (prevLowerOnBrink && hGained > 0) {
      const item = NewsGenerator.generate('series_alive', date, {
        teamName: higherTeam.name, opponentName: lowerTeam.name, year: season,
      }, higherTeam.logoUrl);
      if (item) news.push(item);
      continue;
    }

    const wasUneven = prevHW !== prevLW;
    const nowTied = newHW === newLW;
    if (wasUneven && nowTied && newHW < winsNeeded - 1) {
      const cameBack = prevHW < prevLW ? higherTeam : lowerTeam;
      const opponent = cameBack === higherTeam ? lowerTeam : higherTeam;
      const item = NewsGenerator.generate('series_comeback', date, {
        teamName: cameBack.name, opponentName: opponent.name,
        wins: String(newHW), year: season,
      }, cameBack.logoUrl);
      if (item) news.push(item);
    }
  }

  if (newPlayoffs.bracketComplete && !prevPlayoffs.bracketComplete && newPlayoffs.champion != null) {
    const champTeam = teams.find(t => t.id === newPlayoffs.champion);
    const finalsSeries = newPlayoffs.series.find(s => s.round === finalsRound && s.status === 'complete');
    const loserTeam = finalsSeries
      ? teams.find(t => t.id === (finalsSeries.winnerId === finalsSeries.higherSeedTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid))
      : undefined;
    const totalGames = finalsSeries ? finalsSeries.higherSeedWins + finalsSeries.lowerSeedWins : 0;

    if (champTeam) {
      const champSeasonYears = new Set([
        ...(historicalAwards ?? [])
          .filter((a: any) => a.type === 'Champion' && Number(a.tid) === champTeam.id)
          .map((a: any) => Number(a.season)),
        ...(champTeam.seasons ?? [])
          .filter((s: any) => s.playoffRoundsWon === finalsRound)
          .map((s: any) => Number(s.season)),
      ]);
      const priorTitles = [...champSeasonYears].filter(yr => yr < season).length;
      const totalTitles = priorTitles + 1;
      const wonLastYear = champSeasonYears.has(season - 1);
      const wonTwoYearsAgo = champSeasonYears.has(season - 2);
      const isThreePeat = wonLastYear && wonTwoYearsAgo;
      const isRepeat = wonLastYear && !wonTwoYearsAgo;
      const ordinal = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

      const champItem = NewsGenerator.generate('nba_champion', date, {
        teamName: getTeamFullName(champTeam), teamCity: champTeam.region ?? champTeam.name,
        opponentName: loserTeam ? getTeamFullName(loserTeam) : 'their opponent',
        year: season, gamesCount: totalGames,
      }, champTeam.logoUrl);
      if (champItem) {
        const championName = getTeamFullName(champTeam);
        if (labels.leagueName !== 'NBA' && champItem.content) {
          champItem.content = champItem.content.replace(/NBA Finals/g, labels.finals).replace(/\bNBA\b/g, labels.leagueName);
        }
        if (isThreePeat) champItem.headline = `THREE-PEAT! ${championName} Are the ${season} ${labels.leagueName} Champions`;
        else if (isRepeat) champItem.headline = `BACK-TO-BACK! ${championName} Repeat as ${season} ${labels.leagueName} Champions`;
        else if (priorTitles === 0) champItem.headline = `FIRST IN FRANCHISE HISTORY! ${championName} Are the ${season} ${labels.leagueName} Champions`;
        else champItem.headline = `${ordinal(totalTitles)} Title! ${championName} Capture the ${season} ${labels.leagueName} Championship`;
        news.push(champItem);
      }
    }
  }

  return news;
}

export const getPhaseLabel = (
  dateStr: string,
  year: number,
  leagueStats?: Pick<LeagueStats, 'uiMode' | 'draftType' | 'leagueCalendar' | 'playIn'>,
): string => {
  if (leagueStats?.uiMode === 'pba_isolated') {
    const position = getPbaCalendarPosition(dateStr);
    const conference = position.conference === 'philippine'
      ? 'Philippine Cup'
      : position.conference === 'commissioners'
        ? "Commissioner's Cup"
        : "Governors' Cup";
    if (position.phase === 'playoffs') return `${conference} Playoffs...`;
    if (position.phase === 'offseason') return position.conference === 'governors'
      ? 'PBA Season Awards...'
      : `${conference} Offseason...`;
    return `${conference}...`;
  }
  const current = normalizeDate(dateStr);
  const calendar = getLeagueCalendarDates(year, leagueStats);
  const regularStart = toISODateString(calendar.regularSeasonStart);
  const regularEnd = toISODateString(calendar.regularSeasonEnd);
  const playInStart = toISODateString(calendar.playInStart);
  const playoffStart = toISODateString(calendar.playoffStart);
  const nextSeason = toISODateString(calendar.rollover);
  const allStar = getAllStarWeekendDates(year, leagueStats);
  const allStarStart = toISODateString(allStar.breakStart);
  const allStarEnd = toISODateString(allStar.breakEnd);
  if (current < regularStart) return 'Preseason...';
  if (current <= regularEnd) {
    if (current >= allStarStart && current <= allStarEnd) return 'All-Star Weekend...';
    const regularSpan = Math.max(1, calendar.regularSeasonEnd.getTime() - calendar.regularSeasonStart.getTime());
    const elapsed = new Date(`${current}T00:00:00Z`).getTime() - calendar.regularSeasonStart.getTime();
    if (elapsed / regularSpan < 0.25) return 'Early Season...';
    if (current < allStarStart) return 'Mid Season...';
    const daysRemaining = Math.ceil((calendar.regularSeasonEnd.getTime() - new Date(`${current}T00:00:00Z`).getTime()) / 86_400_000);
    return daysRemaining <= 14 ? 'Regular Season Final Days...' : 'Late Season Push...';
  }
  if (leagueStats?.playIn && current >= playInStart && current < playoffStart) return 'Play-In Tournament...';
  if (current >= playoffStart && current < nextSeason) {
    const postseasonDays = Math.floor((new Date(`${current}T00:00:00Z`).getTime() - calendar.playoffStart.getTime()) / 86_400_000);
    if (postseasonDays < 28) return 'Playoffs...';
    if (postseasonDays < 42) {
      return isDraftLotteryEnabled(leagueStats?.draftType)
        ? 'Semifinals & Draft Lottery...'
        : 'Semifinals...';
    }
    return 'Finals...';
  }
  return 'Offseason...';
};

export const daysBetween = (a: string, b: string): number =>
  Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) /
    (1000 * 60 * 60 * 24)
  );

export function advanceDateByOne(state: GameState): GameState {
  const currentNorm = normalizeDate(state.date);
  const nextDate = new Date(`${currentNorm}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return {
    ...state,
    date: nextDate.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    day: state.day + 1,
  };
}
