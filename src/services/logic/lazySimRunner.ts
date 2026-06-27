import { GameState, LazySimProgress, HistoricalStatPoint, GameResult } from '../../types';
import { runSimulation } from '../../store/logic/turn/simulationHandler';
import { processSimulationResults } from '../../store/logic/turn/postProcessor';
import { calculateNewStats } from '../../store/logic/turn/statUpdater';
import { generatePaychecks } from './financialService';
import { SocialEngine } from '../social/SocialEngine';
import { SettingsManager } from '../SettingsManager';
import { normalizeDate, calculateSocialEngagement } from '../../utils/helpers';
import { getRolloverDate, toISODateString } from '../../utils/dateUtils';
import { buildShamsPost } from '../social/templates/charania';
import { findShamsPhoto } from '../social/charaniaphotos';
import { getInsiderHandle } from '../../data/social/handles';
import { generateLazySimNews } from '../news/lazySimNewsGenerator';
import { convertTo2KRating } from '../../utils/helpers';
import { applySeasonRollover } from './seasonRollover';
import { applyDailyFamiliarityTick, applyDailyFatigueTick } from '../training/trainingTick';
import { getOffseasonDayPlan, logPlanEvent } from '../offseason/offseasonPlan';
import { autoResolveAllStarHosts } from '../allStar/hostAutoResolver';
import { PlayoffSeries } from '../../types';
import { setAssistantGMActive } from '../assistantGMFlag';
import { isPbaActiveConferenceMode } from '../../utils/uiMode';
import { logPbaLazySimAudit, shouldLogPbaLazySimCheckpoint } from '../../utils/pbaLazySimDebug';
import { applyPbaConferenceLifecycle, repairPbaConferenceForDate } from '../pba/conferenceTransition';
import {
  advanceDateByOne,
  autoResolveEuroSetupOffseasonTasks,
  autoResolvePbaSetupOffseasonTasks,
  buildAutoNews,
  buildAutoResolveEvents,
  daysBetween,
  getPhaseLabel,
  hasDueUnplayedEuroCompetitionGames,
  hasDueUnplayedPbaCompetitionGames,
  repairEuroCompetitionScheduleForToday,
} from './lazySimRunnerHelpers';
import { buildLazySimPlayoffOutcomes } from './lazySimRunnerPlayoffAwards';
export { buildAutoResolveEvents } from './lazySimRunnerHelpers';

const prependAutoNewsIfMissing = (state: GameState, item: any): GameState => {
  const existingIds = new Set((state.news ?? []).map((news: any) => news.id));
  if (existingIds.has(item.id)) return state;
  return { ...state, news: [item, ...(state.news ?? [])] };
};

export interface LazySimOptions {
  /** 'overlay' = show progress UI (long skips, load game). 'silent' = no UI, collect lastSimResults (short skips). */
  mode?: 'overlay' | 'silent';
  /** Days per batch. Default 7 for overlay, 1 for silent. */
  batchSize?: number;
  /** If true, stop AT target date without simulating target day's games.
   *  Use for "Sim to Date" from ScheduleView where the user wants to land on that date
   *  and decide whether to watch/sim those games manually.
   *  Default false — target day is simmed (needed for Sim Round / Sim Playoffs). */
  stopBefore?: boolean;
  /** If true, AI handles the user's team for all transactions during this lazy sim
   *  (re-signings, FA signings, waivings, trades, extensions, two-way promotions).
   *  Clears automatically when the sim completes. Default false. */
  assistantGM?: boolean;
  /** Setup jumpstart only: auto-complete user-facing Euro offseason checklist rows as their date windows pass. */
  autoResolveOffseasonTasks?: boolean;
  /** Called after each individual game result during silent-mode short sims.
   *  Use with flushSync in GameContext to stream results to the ticker in real-time. */
  onGame?: (result: any) => void;
}

export interface LazySimResult {
  state: GameState;
  /** Box scores from the LAST batch — used by silent mode so GameContext can show game results modal. */
  lastSimResults: any[];
}

const perfNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const perfMs = (start: number) => Math.round((perfNow() - start) * 10) / 10;

export const runLazySim = async (
  initialState: GameState,
  targetDateStr: string,
  onProgress?: (progress: LazySimProgress) => void,
  options?: LazySimOptions,
): Promise<LazySimResult> => {
  const mode = options?.mode ?? 'overlay';
  const defaultBatch = mode === 'silent' ? 1 : 7;
  const BATCH_SIZE = options?.batchSize ?? defaultBatch;
  const stopBefore = options?.stopBefore ?? false;
  const assistantGM = options?.assistantGM ?? false;

  setAssistantGMActive(assistantGM);

  const targetNorm = normalizeDate(targetDateStr);
  const startNorm = normalizeDate(initialState.date);
  const daysTotal = daysBetween(startNorm, targetNorm);

  console.log('[LAZY_SIM] ▶️ start', {
    rawTargetDate: targetDateStr,
    targetNorm,
    rawStartDate: initialState.date,
    startNorm,
    daysTotal,
    mode,
    BATCH_SIZE,
  });
  logPbaLazySimAudit(initialState, 'start');

  if (daysTotal < 0) {
    console.log('[LAZY_SIM] ⛔ daysTotal < 0 — returning initial state');
    return { state: initialState, lastSimResults: [] };
  }

  const originalSettings = SettingsManager.getSettings();
  SettingsManager.saveSettings({ ...originalSettings, enableLLM: false, gameSpeed: 10 });
  const restoreOnUnload = () => SettingsManager.saveSettings(originalSettings);
  window.addEventListener('beforeunload', restoreOnUnload);

  let state = { ...initialState };
  let lastBatchSimResults: any[] = []; // Track last batch for silent mode
  const firedEvents = new Set<string>();

  {
    const eagerSeasonYear = state.leagueStats.year;
    const eagerKeys = ['broadcasting_default', 'global_games', 'intl_preseason', 'schedule_generation'];
    const hasRegularSeason = state.schedule.some(
      (g: any) => !g.isPreseason && !g.isPlayoff && !g.isPlayIn
    );
    if (!hasRegularSeason) {
      for (const event of buildAutoResolveEvents(eagerSeasonYear, state.leagueStats)) {
        if (!eagerKeys.includes(event.key)) continue;
        if (event.date >= targetNorm) continue; // target is before this event
        const compositeKey = `${eagerSeasonYear}:${event.key}`;
        if (firedEvents.has(compositeKey)) continue;
        try {
          const patch = await event.resolver(state);
          if (patch && Object.keys(patch).length > 0) {
            state = { ...state, ...patch };
          }
        } catch (err) {
          console.warn(`[lazySim eager] ${event.key} failed:`, err);
        }
        firedEvents.add(compositeKey);
      }
    }
  }
  // Pre-seed with all injuries already on players so only NEW injuries generate news
  const reportedInjuries = new Set<string>(
    (initialState.players ?? [])
      .filter(p => p.injury && p.injury.gamesRemaining > 0)
      .map(p => `${p.internalId}-${p.injury!.type}`)
  );
  let daysComplete = 0;
  let currentPhase = 'Starting...';

  const report = (override?: Partial<LazySimProgress>) => {
    const currentNorm = normalizeDate(state.date);
    onProgress?.({
      currentDate: currentNorm,
      targetDate: targetNorm,
      daysComplete,
      daysTotal,
      currentPhase,
      percentComplete: Math.min(99, Math.round((daysComplete / daysTotal) * 100)),
      ...override,
    });
  };

  try {
    let iterNum = 0;
    while (true) {
      iterNum++;
      const iterStart = perfNow();
      let currentNorm = normalizeDate(state.date);
      state = autoResolveEuroSetupOffseasonTasks(state, options?.autoResolveOffseasonTasks === true);
      state = autoResolvePbaSetupOffseasonTasks(state, options?.autoResolveOffseasonTasks === true, targetNorm);
      state = repairPbaConferenceForDate(state);
      currentNorm = normalizeDate(state.date);
      currentPhase = getPhaseLabel(currentNorm, state.leagueStats.year, state.leagueStats);

      if (state.leagueStats?.uiMode === 'euro_isolated') {
        try {
          const eventsBefore = ((state as any).tycoonEvents ?? []).length;
          const tycoonTick = (await import('../tycoon/eventChecker')).tick;
          tycoonTick({ state, gameDate: currentNorm });
          const eventsAfter = ((state as any).tycoonEvents ?? []).length;
          if (eventsAfter > eventsBefore) {
            const HIGH_PRIORITY_KINDS = new Set(['bankAlarm', 'crisisMeeting', 'sponsorMidTermBonus', 'sponsorPoachingOffer']);
            const newEvents = ((state as any).tycoonEvents as any[]).slice(eventsBefore);
            const userTeamId = (state as any).userTeamId;
            const hasUserHighPrio = newEvents.some(e => e.teamId === userTeamId && HIGH_PRIORITY_KINDS.has(e.kind));
            if (hasUserHighPrio) {
              console.log(`[LAZY_SIM] 🛑 tycoon event break — ${newEvents.filter(e => e.teamId === userTeamId).map(e => e.kind).join(', ')}`);
              currentPhase = 'Front Office Alert';
              report();
              break;
            }
          }
        } catch (e) {
          console.warn('[tycoon] daily tick failed', e);
        }
      }
      console.log(`[LAZY_SIM] 🔁 iter ${iterNum} — currentNorm=${currentNorm}, targetNorm=${targetNorm}, state.day=${state.day}, stopBefore=${stopBefore}`);
      const pendingDueEuroGamesAtTop = hasDueUnplayedEuroCompetitionGames(state, currentNorm);
      const pendingDuePbaGamesAtTop = hasDueUnplayedPbaCompetitionGames(state, currentNorm);
      const shouldBreakTop = stopBefore
        ? currentNorm >= targetNorm
        : currentNorm > targetNorm && !pendingDueEuroGamesAtTop && !pendingDuePbaGamesAtTop;
      if (shouldBreakTop) {
        console.log(`[LAZY_SIM] 🛑 iter ${iterNum} — break at top (stopBefore=${stopBefore})`);
        break;
      }

      const seasonYear = state.leagueStats.year;
      for (const event of buildAutoResolveEvents(seasonYear, state.leagueStats)) {
        const compositeKey = `${seasonYear}:${event.key}`;
        if (!firedEvents.has(compositeKey) && event.date <= currentNorm) {
          currentPhase = event.phase;
          report();
          try {
            const patch = await event.resolver(state);
            if ((patch as any)?._deferred) continue; // resolver asked to retry next iteration
            if (patch && Object.keys(patch).length > 0) {
              state = { ...state, ...patch };
            }
          } catch (err) {
            console.warn(`Auto-resolver ${event.key} failed:`, err);
          }
          firedEvents.add(compositeKey);
          const autoNews = buildAutoNews(event.key, state);
          if (autoNews) {
            state = prependAutoNewsIfMissing(state, autoNews);
          }
        }
      }

      currentPhase = getPhaseLabel(currentNorm, seasonYear, state.leagueStats);
      report();

      state = repairEuroCompetitionScheduleForToday(state);
      const lazyPlan = getOffseasonDayPlan(state);
      const pendingEuroCompetitionGames = hasDueUnplayedEuroCompetitionGames(state, currentNorm);
      const pbaIsolatedMode = state.leagueStats?.uiMode === 'pba_isolated';
      if (lazyPlan.actions.rollover === 'fire' && pendingEuroCompetitionGames) {
        currentPhase = 'Finishing European competition games...';
        report();
      } else if (lazyPlan.actions.rollover === 'fire' && !pbaIsolatedMode) {
        logPlanEvent('lazySimRunner.rollover', 'fire', `date=${currentNorm}`);
        const rolloverPatch = applySeasonRollover(state);
        state = { ...state, ...rolloverPatch };
        const resolvedHosts = autoResolveAllStarHosts(state.leagueStats, state.teams, { horizon: 1 });
        if (resolvedHosts !== state.leagueStats.allStarHosts) {
          state = { ...state, leagueStats: { ...state.leagueStats, allStarHosts: resolvedHosts } };
        }
        currentPhase = 'Season Rollover...';
        report();
      }

      const rolloverDate = toISODateString(getRolloverDate(state.leagueStats.year, state.leagueStats as any, state.schedule as any));
      const nearRolloverStart = toISODateString(new Date(getRolloverDate(state.leagueStats.year, state.leagueStats as any, state.schedule as any).getTime() - 5 * 86_400_000));
      const nearRollover = currentNorm >= nearRolloverStart && currentNorm < rolloverDate;
      const remaining = daysBetween(currentNorm, targetNorm);
      const effectiveBatch = nearRollover ? 1 : BATCH_SIZE;
      let batchDays = Math.max(1, Math.min(effectiveBatch, remaining));

      const nextEventDate = buildAutoResolveEvents(state.leagueStats.year, state.leagueStats)
        .filter(e => !firedEvents.has(`${state.leagueStats.year}:${e.key}`) && e.date > currentNorm)
        .map(e => e.date)
        .sort()[0];
      if (nextEventDate) {
        const daysToEvent = daysBetween(currentNorm, nextEventDate);
        if (daysToEvent > 0 && daysToEvent < batchDays) batchDays = daysToEvent;
      }
      console.log(`[LAZY_SIM] 📊 iter ${iterNum} — remaining=${remaining}, batchDays=${batchDays}, nearRollover=${nearRollover}, nextEvent=${nextEventDate ?? 'none'}`);
      if (remaining < 0) {
        console.log(`[LAZY_SIM] 🛑 iter ${iterNum} — remaining < 0, breaking`);
        break;
      }

      const runSimulationStart = perfNow();
      let { stateWithSim, allSimResults, perDayResults, userInterrupted } = await runSimulation(state, batchDays, undefined, options?.onGame);
      const runSimulationMs = perfMs(runSimulationStart);
      console.log(`[LAZY_SIM] 🎮 iter ${iterNum} — after runSimulation: state.date=${stateWithSim.date}, simResults=${allSimResults.length}, perDayResults=${perDayResults.length}, userInterrupted=${!!userInterrupted}`);
      lastBatchSimResults = allSimResults; // track for silent mode return
      console.log(`[LAZY_SIM] ✓ 581 post-runSim — iter ${iterNum}`);

      const postProcessStart = perfNow();
      let { updatedPlayers, updatedDraftPicks } = processSimulationResults(
        allSimResults,
        stateWithSim.players,
        stateWithSim.draftPicks,
        stateWithSim.schedule,
        stateWithSim.leagueStats?.year,
        stateWithSim.teams,
      );
      const postProcessMs = perfMs(postProcessStart);
      console.log(`[LAZY_SIM] ✓ 591 post-processSimulationResults — iter ${iterNum}, updatedPlayers=${updatedPlayers.length}`);

      const trainingTickStart = perfNow();
      const batchCalendarDays = Math.max(0, daysBetween(currentNorm, normalizeDate(stateWithSim.date)));
      if (batchCalendarDays > 0) {
        const teamsAfterTraining = applyDailyFamiliarityTick(
          stateWithSim.teams,
          state.date,
          batchCalendarDays,
          {
            schedule: stateWithSim.schedule,
            currentYear: stateWithSim.leagueStats?.year ?? new Date().getFullYear(),
            userTeamId: stateWithSim.userTeamId,
            gameMode: stateWithSim.gameMode,
          },
        );
        const isTrainingCampChecklistOpen =
          !!state.offseasonChecklist &&
          !isPbaActiveConferenceMode(state) &&
          state.offseasonChecklist.trainingCamp !== 'done' &&
          state.offseasonChecklist.trainingCamp !== 'skipped';
        const teamsForFatigueTick = isTrainingCampChecklistOpen
          ? teamsAfterTraining.map(team => ({ ...team, trainingCalendar: {} as any }))
          : teamsAfterTraining;
        updatedPlayers = applyDailyFatigueTick(
          updatedPlayers,
          teamsForFatigueTick,
          state.date,
          batchCalendarDays,
          stateWithSim.schedule,
        );
        stateWithSim = { ...stateWithSim, teams: teamsAfterTraining };
      }
      const pbaLifecyclePatch = applyPbaConferenceLifecycle(
        { ...stateWithSim, players: updatedPlayers } as GameState,
        allSimResults,
      );
      if (Object.keys(pbaLifecyclePatch).length > 0) {
        stateWithSim = { ...stateWithSim, ...pbaLifecyclePatch } as GameState;
        updatedPlayers = (pbaLifecyclePatch.players ?? updatedPlayers) as GameState['players'];
      }
      const trainingTickMs = perfMs(trainingTickStart);
      console.log(`[LAZY_SIM] ✓ 592 trainingTick — iter ${iterNum}, days=${batchCalendarDays}, ms=${trainingTickMs}`);

      let runningState = { ...state };
      const newHistoricalPoints: HistoricalStatPoint[] = [];
      const historicalStatsStart = perfNow();
      for (const dayData of perDayResults) {
        const { newStats, newLeagueStats } = calculateNewStats(
          runningState,
          { type: 'ADVANCE_DAY' } as any,
          {},
          dayData.results,
          0,
          dayData.date
        );
        runningState = {
          ...runningState,
          stats: { ...runningState.stats, ...newStats },
          leagueStats: { ...runningState.leagueStats, ...newLeagueStats },
        };
        newHistoricalPoints.push({
          date: dayData.date,
          publicApproval: newStats.publicApproval,
          ownerApproval: newStats.ownerApproval,
          playerApproval: newStats.playerApproval,
          legacy: newStats.legacy,
          revenue: newLeagueStats.revenue,
          viewership: newLeagueStats.viewership,
        });
      }
      const historicalStatsMs = perfMs(historicalStatsStart);

      console.log(`[LAZY_SIM] ✓ 620 post-perDayLoop — iter ${iterNum}, histPoints=${newHistoricalPoints.length}`);

      const nbaPlayers = updatedPlayers.filter(p =>
        p.tid >= 0 &&
        p.tid <= 29 &&
        (p as any).status !== 'Retired' &&
        !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '')
      );
      const socialEngine = new SocialEngine();
      const batchDateString = stateWithSim.date;
      console.log(`[LAZY_SIM] ✓ 625 pre-socialEngine — iter ${iterNum}, nbaPlayers=${nbaPlayers.length}`);
      const socialStart = perfNow();
      const enginePosts = await socialEngine.generateDailyPosts(allSimResults, nbaPlayers, stateWithSim.teams, batchDateString, batchDays, stateWithSim.playoffs, stateWithSim.schedule, stateWithSim.leagueType);
      const socialMs = perfMs(socialStart);
      console.log(`[LAZY_SIM] ✓ 626 post-socialEngine — iter ${iterNum}, posts=${enginePosts.length}`);

      const shamsStart = perfNow();
      const shamsInjuryPosts: any[] = [];
      const injuryInsider = getInsiderHandle(stateWithSim.leagueType);
      for (const simResult of allSimResults) {
        if (!simResult.injuries?.length) continue;
        for (const injury of simResult.injuries) {
          const player = updatedPlayers.find(p => p.internalId === injury.playerId);
          if (!player || convertTo2KRating(player.overallRating ?? player.ratings?.[0]?.ovr ?? 0, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp) < 70) continue;
          const team = stateWithSim.teams.find((t: any) => t.id === (injury.teamId ?? player.tid));
          if (!team) continue;
          const content = buildShamsPost({ player, team, injury: { injuryType: injury.injuryType, gamesRemaining: injury.gamesRemaining }, opponent: null } as any);
          if (!content) continue;
          const engagement = calculateSocialEngagement(injuryInsider.atHandle, content, player.overallRating);
          const shamsPhoto = findShamsPhoto(player.name, team?.name);
          shamsInjuryPosts.push({
            id: `shams-injury-${injury.playerId}-${Date.now()}-${Math.random()}`,
            author: injuryInsider.name,
            handle: injuryInsider.atHandle,
            content,
            date: new Date(simResult.date).toISOString(),
            likes: engagement.likes,
            retweets: engagement.retweets,
            source: 'TwitterX' as const,
            isNew: true,
            playerPortraitUrl: player.imgURL,
            ...(shamsPhoto ? { mediaUrl: shamsPhoto.image_url } : {}),
          });
        }
      }
      const allBatchPosts = [...enginePosts, ...shamsInjuryPosts];
      const shamsMs = perfMs(shamsStart);
      console.log(`[LAZY_SIM] ✓ 662 post-shams — iter ${iterNum}, totalPosts=${allBatchPosts.length}`);

      const newsStart = perfNow();
      const batchNews = generateLazySimNews(
        stateWithSim.teams,
        updatedPlayers,
        allSimResults,
        stateWithSim.date,
        reportedInjuries,
        false,
        state.teams,
        stateWithSim.playoffs,
        stateWithSim.schedule,
        stateWithSim.leagueStats?.year ?? new Date().getFullYear()
      );
      const newsMs = perfMs(newsStart);
      console.log(`[LAZY_SIM] ✓ 676 post-lazySimNews — iter ${iterNum}, news=${batchNews?.length ?? 0}`);

      const playoffOutcomesStart = perfNow();
      const {
        updatedPlayers: updatedPlayersWithPlayoffAwards,
        playoffSeriesNews,
        champHistoricalAwards,
        semifinalsMvpAwards,
        champTeamsWithRoundsWon,
        seasonHistoryPatch,
      } = buildLazySimPlayoffOutcomes({
        state,
        stateWithSim,
        allSimResults,
        updatedPlayers,
      });
      const playoffOutcomesMs = perfMs(playoffOutcomesStart);
      console.log(`[LAZY_SIM] ✓ 690 post-playoffSeriesNews — iter ${iterNum}, news=${playoffSeriesNews?.length ?? 0}`);

      const batchPayResult = generatePaychecks(
        state.lastPayDate || new Date(initialState.date).toISOString(),
        new Date(stateWithSim.date).toISOString(),
        state.salary || 10000000
      );
      const batchPayWealth = batchPayResult.totalNetPay / 1_000_000;

      const monthlyPassive = (state.realEstateInventory ?? [])
        .reduce((s: number, a: any) => s + Math.floor(a.price * 0.004), 0);
      const passiveBatchWealth = monthlyPassive > 0
        ? (monthlyPassive * (batchDays / 30)) / 1_000_000
        : 0;

      const allBatchNews = [...playoffSeriesNews, ...batchNews];

      const yearAdvanced = stateWithSim.leagueStats.year !== state.leagueStats.year;
      const safeSchedule = !yearAdvanced && stateWithSim.schedule.length === 0 && state.schedule.length > 0
        ? state.schedule
        : stateWithSim.schedule;
      const committedLeagueStats = stateWithSim.leagueStats?.uiMode === 'pba_isolated'
        ? {
            ...runningState.leagueStats,
            ...stateWithSim.leagueStats,
          }
        : runningState.leagueStats;

      const commitStart = perfNow();
      state = {
        ...stateWithSim,
        schedule: safeSchedule,
        stats: {
          ...runningState.stats,
          personalWealth: Number((runningState.stats.personalWealth + batchPayWealth + passiveBatchWealth).toFixed(2)),
        },
        leagueStats: committedLeagueStats,
        players: updatedPlayersWithPlayoffAwards,
        draftPicks: updatedDraftPicks,
        historicalStats: [...(state.historicalStats || []), ...newHistoricalPoints].slice(-365),
        boxScores: [
          ...(stateWithSim.boxScores || []),
          ...allSimResults.map(r => ({ ...r, date: r.date || stateWithSim.date }))
        ],
        socialFeed: allBatchPosts.length > 0
          ? [...allBatchPosts, ...(stateWithSim.socialFeed || [])].slice(0, 500)
          : stateWithSim.socialFeed,
        news: allBatchNews.length > 0
          ? [...allBatchNews, ...(stateWithSim.news || [])].slice(0, 200)
          : stateWithSim.news,
        lastPayDate: batchPayResult.newLastPayDate,
        payslips: [...(state.payslips || []), ...batchPayResult.newPayslips].slice(-50),
        historicalAwards: (champHistoricalAwards.length > 0 || semifinalsMvpAwards.length > 0)
          ? [...(stateWithSim.historicalAwards ?? []), ...semifinalsMvpAwards, ...champHistoricalAwards]
          : stateWithSim.historicalAwards,
        ...(champTeamsWithRoundsWon ? { teams: champTeamsWithRoundsWon } : {}),
        ...(seasonHistoryPatch ?? {}),
      };
      const commitMs = perfMs(commitStart);
      daysComplete += batchDays;

      const currentNormAfterSim = normalizeDate(state.date);
      if (shouldLogPbaLazySimCheckpoint(runningState, state)) {
        logPbaLazySimAudit(state, `post-batch ${iterNum}`);
      }
      console.log(`[LAZY_SIM] 📍 iter ${iterNum} — post-batch: state.date=${state.date}, currentNormAfterSim=${currentNormAfterSim}, daysComplete=${daysComplete}`);
      console.log('[LAZY_SIM_PERF]', {
        iter: iterNum,
        startDate: currentNorm,
        endDate: currentNormAfterSim,
        batchDays,
        games: allSimResults.length,
        runSimulationMs,
        postProcessMs,
        historicalStatsMs,
        socialMs,
        shamsMs,
        newsMs,
        playoffOutcomesMs,
        trainingTickMs,
        commitMs,
        totalIterMs: perfMs(iterStart),
      });
      if (currentNormAfterSim >= targetNorm) {
        if (hasDueUnplayedEuroCompetitionGames(state, currentNormAfterSim) && allSimResults.length > 0) {
          console.log(`[LAZY_SIM] 🔁 iter ${iterNum} — continuing for newly injected due Euro competition games`);
          currentPhase = 'Finishing European competition games...';
          report();
          continue;
        }
        if (hasDueUnplayedPbaCompetitionGames(state, currentNormAfterSim)) {
          console.log(`[LAZY_SIM] 🔁 iter ${iterNum} — continuing for newly injected due PBA competition games`);
          currentPhase = 'Finishing PBA playoff games...';
          report();
          continue;
        }
        console.log(`[LAZY_SIM] 🏁 iter ${iterNum} — currentNormAfterSim >= targetNorm, breaking (target reached)`);
        break;
      }
      if (userInterrupted) {
        console.log(`[LAZY_SIM] 🔔 iter ${iterNum} — userInterrupted=true (FA bid resolved), breaking before target`);
        break;
      }
      state = advanceDateByOne(state);
      console.log(`[LAZY_SIM] ⏭️ iter ${iterNum} — advanceDateByOne → state.date=${state.date}, state.day=${state.day}`);

      currentPhase = getPhaseLabel(normalizeDate(state.date), state.leagueStats.year, state.leagueStats);
      report();

      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const finalSeasonYear = state.leagueStats.year;
    for (const event of buildAutoResolveEvents(finalSeasonYear, state.leagueStats)) {
      const compositeKey = `${finalSeasonYear}:${event.key}`;
      if (!firedEvents.has(compositeKey) && event.date < targetNorm) {
        try {
          const patch = await event.resolver(state);
          if (patch && Object.keys(patch).length > 0) {
            state = { ...state, ...patch };
          }
        } catch (err) {
          console.warn(`Auto-resolver ${event.key} (post-loop) failed:`, err);
        }
        firedEvents.add(compositeKey);
        const autoNews = buildAutoNews(event.key, state);
        if (autoNews) {
          state = prependAutoNewsIfMissing(state, autoNews);
        }
      }
    }
  } finally {
    setAssistantGMActive(false);
    window.removeEventListener('beforeunload', restoreOnUnload);
    SettingsManager.saveSettings(originalSettings);
  }

  report({ percentComplete: 100, currentPhase: 'Done!', daysComplete: daysTotal });
  state = repairPbaConferenceForDate(state);

  console.log('[LAZY_SIM] 🎯 DONE', {
    finalStateDate: state.date,
    finalNorm: normalizeDate(state.date),
    finalDay: state.day,
    targetNorm,
    reachedTarget: normalizeDate(state.date) === targetNorm,
    lastBatchCount: lastBatchSimResults.length,
  });
  logPbaLazySimAudit(state, 'final');

  return { state, lastSimResults: lastBatchSimResults };
};
