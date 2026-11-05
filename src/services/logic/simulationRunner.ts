import { GameState, NBATeam, Game, HeadToHead } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { simulateGames } from '../simulationService';
import { getAllStarWeekendDates } from '../allStar/AllStarWeekendOrchestrator';
import { computeClinchStatus } from '../../utils/standingsUtils';
import { syncNbaTeamRecordsFromSchedule } from '../../utils/nbaOfficialRecords';
import { recordSimulationPerf } from '../simulation/simulationPerfDebug';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { estimateMatchdayOutcome } from '../tycoon/budgetEngine';
import { getSeasonEconomyIndex } from '../tycoon/clubFinance';
import { isPostseasonEliminationGame } from '../playoffs/playoffGameContext';
import { getSimulationSeed } from '../saveIdentity';

const perfNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const perfMs = (start: number) => Math.round((perfNow() - start) * 10) / 10;

const isAllStarWeekendEventGame = (game: Game): boolean =>
    !!(
        game.isAllStar ||
        game.isRisingStars ||
        game.isCelebrityGame ||
        game.isDunkContest ||
        game.isThreePointContest ||
        (game as any).isShootingStars ||
        (game as any).isSkillsChallenge ||
        (game as any).isHorseContest ||
        game.isThroneEvent
    );

export const isScheduledGameDueForSimulation = (
    game: Game,
    normalizedCurrent: string,
    watchedGameId?: number,
): boolean => {
    const gameDate = normalizeDate(game.date);
    if (game.gid === watchedGameId) return gameDate === normalizedCurrent;
    if (game.played) return false;
    if (gameDate === normalizedCurrent) return true;
    if (gameDate >= normalizedCurrent) return false;
    return !!game.competitionId || !!(
        game.isPreseason
        && (game.homeTid >= 100 || game.awayTid >= 100)
    );
};

export const getUnplayedInternationalPreseasonTeamIds = (
    schedule: readonly Game[],
): Set<number> => new Set(schedule.flatMap(game => (
    !game.played && game.isPreseason
        ? [game.homeTid, game.awayTid].filter(tid => tid >= 100)
        : []
)));

export const simulateDayGames = async (
    state: GameState,
    watchedGameResult?: any,
    riggedForTid?: number,
    onGame?: (result: any) => void,
    execution?: { useWorkerPool?: boolean; workerPoolSize?: number; workerThreshold?: number },
): Promise<{ teams: NBATeam[], schedule: Game[], results: any[], headToHead?: HeadToHead }> => {
    const totalStart = perfNow();
    const selectionStart = perfNow();
    const dates = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats);
    const usesNbaAllStarBreak = state.leagueStats?.uiMode !== 'euro_isolated' && state.leagueStats?.uiMode !== 'pba_isolated';

    // Timezone-safe All-Star break check using normalized YYYY-MM-DD strings
    const normalizedCurrent = normalizeDate(state.date);
    const breakStartNorm = normalizeDate(dates.breakStart.toISOString());
    const breakEndNorm = normalizeDate(dates.breakEnd.toISOString());
    const isAllStarBreak = usesNbaAllStarBreak && normalizedCurrent >= breakStartNorm && normalizedCurrent <= breakEndNorm;

    // Simulate games for the current day.
    // The watched game is included even though RECORD_WATCHED_GAME already marked it played.
    // simulateGames excludes it from re-simulation but injects its precomputed result so the
    // normal standings, player-stat, competition, and day-finalization paths run exactly once.
    const watchedGameId = watchedGameResult?.gameId;
    const gamesToday = state.schedule.filter(g =>
      isScheduledGameDueForSimulation(g, normalizedCurrent, watchedGameId),
    );

    // During All-Star break, only simulate All-Star/Rising Stars games (not regular season)
    // Playoff and play-in games are never during All-Star break so they always pass through
    const gamesToSimulate = (isAllStarBreak
        ? gamesToday.filter(g => g.isAllStar || g.isRisingStars || g.isPlayoff || g.isPlayIn)
        : gamesToday
    ).filter(g => {
        if (g.gid !== watchedGameId && isAllStarWeekendEventGame(g)) return false;
        // Cup TBD placeholders are not real games — they get materialized into
        // QF/RS games when the group stage resolves. If a TBD slot reaches its
        // own date without being converted (e.g. group stage didn't finish in
        // time), skip it silently.
        if ((g as any).isCupTBD) return false;
        // Skip playoff games whose series is already complete (prevents ghost games 6/7 after early series end)
        if ((g.isPlayoff || g.isPlayIn) && g.playoffSeriesId && state.playoffs) {
            const series = state.playoffs.series.find(s => s.id === g.playoffSeriesId);
            if (series?.status === 'complete') return false;
            // Also skip play-in games that are already marked played
            const pig = state.playoffs.playInGames?.find(p => p.id === g.playoffSeriesId);
            if (pig?.played) return false;
        }
        return true;
    });

    const selectionMs = perfMs(selectionStart);
    if (gamesToSimulate.length === 0) {
      recordSimulationPerf({ engine: 'day-games', date: normalizedCurrent, games: 0, selectionMs, totalMs: perfMs(totalStart) });
      return { teams: state.teams, schedule: state.schedule, results: [] };
    }

    // Build club debuff map from pending state
    const clubDebuffs = new Map<string, 'heavy' | 'moderate' | 'mild'>();
    (state.pendingClubDebuff || []).forEach(d => {
        clubDebuffs.set(d.playerId, d.severity);
    });

    // Pass player approval to simulation to affect performance
    const playoffContextStart = perfNow();
    const gamesWithPostseasonContext = gamesToSimulate.map(game => (
      game.isPlayoff || game.isPlayIn
        ? {
            ...game,
            isEliminationGame: isPostseasonEliminationGame(game, state.playoffs),
          }
        : game
    ));
    const playoffContextMs = perfMs(playoffContextStart);
    const engineStart = perfNow();
    const simResult = await simulateGames(
        state.teams,
        state.players,
        gamesWithPostseasonContext,
        state.date,
        state.stats.playerApproval,
        watchedGameResult,
        state.allStar,
        undefined,
        undefined,
        riggedForTid,
        clubDebuffs.size > 0 ? clubDebuffs : undefined,
        state.headToHead,
        state.leagueStats.otl,
        state.leagueStats.year,
        state.leagueStats,
        onGame,
        {
          controlledTeamIds: state.controlledTeams ?? (state.userTeamId != null ? [state.userTeamId] : []),
          watchedGameId,
          simulationSeed: getSimulationSeed(state),
        },
        execution,
    );
    const engineMs = perfMs(engineStart);

    // Update schedule by gameId — critical for playoff series where two teams play
    // multiple games; matching by teamIds alone would mark all future series games played
    const scheduleWriteStart = perfNow();
    const resultsByGameId = new Map(simResult.results.map(result => [result.gameId, result]));
    const updatedSchedule = state.schedule.map(game => {
        const result = resultsByGameId.get(game.gid);
        if (result) {
            const homeTeam = state.leagueStats?.uiMode === 'euro_isolated'
              ? resolveAnyTeam(game.homeTid, state.teams, state.nonNBATeams ?? [])
              : null;
            const opponent = homeTeam
              ? resolveAnyTeam(game.awayTid, state.teams, state.nonNBATeams ?? [])
              : null;
            const gamesPlayed = Number((homeTeam as any)?.wins ?? 0) + Number((homeTeam as any)?.losses ?? 0);
            const winPct = gamesPlayed > 0 ? Number((homeTeam as any)?.wins ?? 0) / gamesPlayed : 0.5;
            const matchday = (homeTeam as any)?.tycoon
              ? estimateMatchdayOutcome(
                  homeTeam as NBATeam,
                  getSeasonEconomyIndex(state, state.leagueStats.year),
                  Number((opponent as any)?.tycoon?.cityPrestige ?? 0.5),
                  0.85 + winPct * 0.3,
                  state.leagueStats.year,
                )
              : null;
            return {
                ...game,
                played: true,
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                winnerId: result.winnerId,
                tiebreaker: result.tiebreaker,
                ...(matchday ? {
                    attendance: matchday.attendance,
                    ticketPriceEUR: matchday.ticketPriceEUR,
                    gateRevenueEUR: matchday.gateRevenueEUR,
                    matchdayFoodRevenueEUR: matchday.foodRevenueEUR,
                    matchdayDrinkRevenueEUR: matchday.drinkRevenueEUR,
                    matchdayRevenueEUR: matchday.revenueEUR,
                    merchandiseGrossRevenueEUR: matchday.merchandiseGrossRevenueEUR,
                    merchandiseDistributionCostEUR: matchday.merchandiseDistributionCostEUR,
                    merchandiseRevenueEUR: matchday.merchandiseRevenueEUR,
                    clubMediaRevenueEUR: matchday.clubMediaRevenueEUR,
                } : {}),
            };
        }
        return game;
    });
    const scheduleWriteMs = perfMs(scheduleWriteStart);

    const recordSyncStart = perfNow();
    const officialTeams = state.leagueStats?.uiMode === 'euro_isolated' || state.leagueStats?.uiMode === 'pba_isolated'
      ? simResult.updatedTeams
      : syncNbaTeamRecordsFromSchedule(
          simResult.updatedTeams,
          updatedSchedule,
          state.leagueStats.year,
          state.leagueStats.gamesPerSeason ?? 82,
          state.leagueStats,
        );
    const recordSyncMs = perfMs(recordSyncStart);
    const clinchStart = perfNow();
    const teamsWithClinch = computeClinchStatus(officialTeams, updatedSchedule);
    const clinchMs = perfMs(clinchStart);

    recordSimulationPerf({
      engine: 'day-games',
      date: normalizedCurrent,
      games: gamesToSimulate.length,
      selectionMs,
      playoffContextMs,
      engineMs,
      scheduleWriteMs,
      recordSyncMs,
      clinchMs,
      totalMs: perfMs(totalStart),
    });

    return { teams: teamsWithClinch, schedule: updatedSchedule, results: simResult.results, headToHead: simResult.headToHead };
};
