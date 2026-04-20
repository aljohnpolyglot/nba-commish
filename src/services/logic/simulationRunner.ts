import { GameState, NBATeam, Game, HeadToHead } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { simulateGames } from '../simulationService';
import { getAllStarWeekendDates } from '../allStar/AllStarWeekendOrchestrator';
import { computeClinchStatus } from '../../utils/standingsUtils';

export const simulateDayGames = async (state: GameState, watchedGameResult?: any, riggedForTid?: number, onGame?: (result: any) => void): Promise<{ teams: NBATeam[], schedule: Game[], results: any[], headToHead?: HeadToHead }> => {
    const dates = getAllStarWeekendDates(state.leagueStats.year);

    // Timezone-safe All-Star break check using normalized YYYY-MM-DD strings
    const normalizedCurrent = normalizeDate(state.date);
    const breakStartNorm = normalizeDate(dates.breakStart.toISOString());
    const breakEndNorm = normalizeDate(dates.breakEnd.toISOString());
    const isAllStarBreak = normalizedCurrent >= breakStartNorm && normalizedCurrent <= breakEndNorm;

    // Simulate games for the current day.
    // The watched game is included even if already marked `played: true` (by RECORD_WATCHED_GAME)
    // because stateRef may not be committed yet when ADVANCE_DAY reads it. simulateGames then
    // excludes it from actual simulation (via gid filter) but injects the precomputed result into
    // allResults so standings update correctly — no double-count.
    const watchedGameId = watchedGameResult?.gameId;
    const gamesToday = state.schedule.filter(g =>
      (!g.played || g.gid === watchedGameId) && normalizeDate(g.date) === normalizedCurrent
    );

    // During All-Star break, only simulate All-Star/Rising Stars games (not regular season)
    // Playoff and play-in games are never during All-Star break so they always pass through
    const gamesToSimulate = (isAllStarBreak
        ? gamesToday.filter(g => g.isAllStar || g.isRisingStars || g.isPlayoff || g.isPlayIn)
        : gamesToday
    ).filter(g => {
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

    if (gamesToSimulate.length === 0) return { teams: state.teams, schedule: state.schedule, results: [] };

    // Build club debuff map from pending state
    const clubDebuffs = new Map<string, 'heavy' | 'moderate' | 'mild'>();
    (state.pendingClubDebuff || []).forEach(d => {
        clubDebuffs.set(d.playerId, d.severity);
    });

    // Pass player approval to simulation to affect performance
    const simResult = await simulateGames(
        state.teams,
        state.players,
        gamesToSimulate,
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
        {
            quarterLength:                 state.leagueStats.quarterLength,
            shotClockValue:                state.leagueStats.shotClockValue,
            shotClockEnabled:              state.leagueStats.shotClockEnabled,
            threePointLineEnabled:         state.leagueStats.threePointLineEnabled,
            defensiveThreeSecondEnabled:   state.leagueStats.defensiveThreeSecondEnabled,
            offensiveThreeSecondEnabled:   state.leagueStats.offensiveThreeSecondEnabled,
            handcheckingEnabled:           state.leagueStats.handcheckingEnabled,
            goaltendingEnabled:            state.leagueStats.goaltendingEnabled,
            chargingEnabled:               state.leagueStats.chargingEnabled,
            noDribbleRule:                 state.leagueStats.noDribbleRule,
        },
        onGame
    );

    // Compute clinch/elimination status after standings update
    const teamsWithClinch = computeClinchStatus(simResult.updatedTeams, state.schedule);

    // Update schedule by gameId — critical for playoff series where two teams play
    // multiple games; matching by teamIds alone would mark all future series games played
    const updatedSchedule = state.schedule.map(game => {
        const result = simResult.results.find(r => r.gameId === game.gid);
        if (result) {
            return {
                ...game,
                played: true,
                homeScore: result.homeScore,
                awayScore: result.awayScore
            };
        }
        return game;
    });

    return { teams: teamsWithClinch, schedule: updatedSchedule, results: simResult.results, headToHead: simResult.headToHead };
};
