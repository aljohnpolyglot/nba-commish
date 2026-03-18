import { GameState, NBATeam, Game, HeadToHead } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { simulateGames } from '../simulationService';
import { getAllStarWeekendDates } from '../allStar/AllStarWeekendOrchestrator';
import { computeClinchStatus } from '../../utils/standingsUtils';

export const simulateDayGames = (state: GameState, watchedGameResult?: any, riggedForTid?: number): { teams: NBATeam[], schedule: Game[], results: any[], headToHead?: HeadToHead } => {
    const dates = getAllStarWeekendDates(state.leagueStats.year);

    // Timezone-safe All-Star break check using normalized YYYY-MM-DD strings
    const normalizedCurrent = normalizeDate(state.date);
    const breakStartNorm = normalizeDate(dates.breakStart.toISOString());
    const breakEndNorm = normalizeDate(dates.breakEnd.toISOString());
    const isAllStarBreak = normalizedCurrent >= breakStartNorm && normalizedCurrent <= breakEndNorm;

    // Simulate games for the current day
    const gamesToday = state.schedule.filter(g => !g.played && normalizeDate(g.date) === normalizedCurrent);

    // During All-Star break, only simulate All-Star/Rising Stars games (not regular season)
    // Playoff and play-in games are never during All-Star break so they always pass through
    const gamesToSimulate = isAllStarBreak
        ? gamesToday.filter(g => g.isAllStar || g.isRisingStars || g.isPlayoff || g.isPlayIn)
        : gamesToday;

    if (gamesToSimulate.length === 0) return { teams: state.teams, schedule: state.schedule, results: [] };

    // Build club debuff map from pending state
    const clubDebuffs = new Map<string, 'heavy' | 'moderate' | 'mild'>();
    (state.pendingClubDebuff || []).forEach(d => {
        clubDebuffs.set(d.playerId, d.severity);
    });

    // Pass player approval to simulation to affect performance
    const simResult = simulateGames(
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
        state.leagueStats.year
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
