import { NBATeam, NBAPlayer, Game } from '../types';
import { GameSimulator } from './simulation/GameSimulator';
import { GameResult } from './simulation/StatGenerator';

export const simulateGames = (
    teams: NBATeam[],
    players: NBAPlayer[],
    gamesToSimulate: Game[],
    date: string,
    playerApproval: number = 50,
    watchedGameResult?: any,
    allStar?: any,
    homeOverridePlayers?: NBAPlayer[],
    awayOverridePlayers?: NBAPlayer[],
    riggedForTid?: number,
    clubDebuffs?: Map<string, 'heavy' | 'moderate' | 'mild'>
): { updatedTeams: NBATeam[], results: GameResult[] } => {
    const updatedTeams = [...teams].map(t => ({ ...t }));
    const allResults: GameResult[] = [];
    
    // Filter out the watched game from gamesToSimulate
    const gamesToActuallySimulate = gamesToSimulate.filter(g => {
        if (!watchedGameResult) return true;
        return !(g.gid === watchedGameResult.gameId || (g.homeTid === watchedGameResult.homeTeamId && g.awayTid === watchedGameResult.awayTeamId));
    });

    const dayResults = GameSimulator.simulateDay(
        updatedTeams,
        players,
        gamesToActuallySimulate,
        date,
        playerApproval,
        allStar,
        homeOverridePlayers,
        awayOverridePlayers,
        riggedForTid,
        clubDebuffs
    );
    allResults.push(...dayResults);

    if (watchedGameResult) {
        allResults.push(watchedGameResult);
    }

    // Update standings
    allResults.forEach(res => {
        const game = gamesToSimulate.find(g => g.gid === res.gameId);
        if (game?.isExhibition) return;
        if (res.homeTeamId < 0 || res.awayTeamId < 0) return;

        const home = updatedTeams.find(t => t.id === res.homeTeamId);
        const away = updatedTeams.find(t => t.id === res.awayTeamId);
        if (home && away) {
            if (res.winnerId === home.id) {
                home.wins += 1;
                home.streak = home.streak?.type === 'W' ? { type: 'W', count: home.streak.count + 1 } : { type: 'W', count: 1 };
                away.losses += 1;
                away.streak = away.streak?.type === 'L' ? { type: 'L', count: away.streak.count + 1 } : { type: 'L', count: 1 };
            } else {
                away.wins += 1;
                away.streak = away.streak?.type === 'W' ? { type: 'W', count: away.streak.count + 1 } : { type: 'W', count: 1 };
                home.losses += 1;
                home.streak = home.streak?.type === 'L' ? { type: 'L', count: home.streak.count + 1 } : { type: 'L', count: 1 };
            }
        }
    });

    return { updatedTeams, results: allResults };
};
