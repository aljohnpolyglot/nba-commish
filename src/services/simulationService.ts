import { NBATeam, NBAPlayer, Game, HeadToHead } from '../types';
import { GameSimulator } from './simulation/GameSimulator';
import { GameResult } from './simulation/StatGenerator';

const updateHeadToHead = (
    current: HeadToHead | undefined,
    result: GameResult,
    season: number
): HeadToHead => {
    const h2h: HeadToHead = current ?? { season, regularSeason: {} };
    const { homeTeamId: a, awayTeamId: b, winnerId } = result;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    if (!h2h.regularSeason[lo]) h2h.regularSeason[lo] = {};
    if (!h2h.regularSeason[lo][hi]) h2h.regularSeason[lo][hi] = { won: 0, lost: 0, tied: 0 };

    const rec = h2h.regularSeason[lo][hi];
    if (winnerId === lo) rec.won++;
    else if (winnerId === hi) rec.lost++;
    else rec.tied++;

    return h2h;
};

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
    clubDebuffs?: Map<string, 'heavy' | 'moderate' | 'mild'>,
    currentHeadToHead?: HeadToHead,
    otlEnabled?: boolean,
    season?: number,
    leagueStats?: {
        quarterLength?: number;
        shotClockValue?: number;
        shotClockEnabled?: boolean;
        threePointLineEnabled?: boolean;
        defensiveThreeSecondEnabled?: boolean;
        offensiveThreeSecondEnabled?: boolean;
        handcheckingEnabled?: boolean;
        goaltendingEnabled?: boolean;
        chargingEnabled?: boolean;
        noDribbleRule?: boolean;
    }
): { updatedTeams: NBATeam[], results: GameResult[], headToHead?: HeadToHead } => {
    const updatedTeams = [...teams].map(t => ({ ...t }));
    const allResults: GameResult[] = [];

    // BUG 2 FIX: filter only by game ID, not team IDs, to avoid blocking future series games
    const gamesToActuallySimulate = gamesToSimulate.filter(g => {
        if (!watchedGameResult) return true;
        return g.gid !== watchedGameResult.gameId;
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
        clubDebuffs,
        leagueStats
    );
    allResults.push(...dayResults);

    if (watchedGameResult) {
        allResults.push(watchedGameResult);
    }

    // Update standings
    let headToHead: HeadToHead | undefined = currentHeadToHead
        ? { ...currentHeadToHead, regularSeason: { ...currentHeadToHead.regularSeason } }
        : undefined;

    allResults.forEach(res => {
        const game = gamesToSimulate.find(g => g.gid === res.gameId);
        if (game?.isExhibition) return;
        if (game?.isPreseason) return;
        // Playoff and play-in results don't affect regular season standings
        if (game?.isPlayoff || game?.isPlayIn) return;
        if (res.homeTeamId < 0 || res.awayTeamId < 0) return;

        const home = updatedTeams.find(t => t.id === res.homeTeamId);
        const away = updatedTeams.find(t => t.id === res.awayTeamId);
        if (home && away) {
            const isOT = res.isOT;
            const trackOtl = otlEnabled === true && isOT;

            if (res.winnerId === home.id) {
                home.wins += 1;
                home.streak = home.streak?.type === 'W' ? { type: 'W', count: home.streak.count + 1 } : { type: 'W', count: 1 };
                if (trackOtl) {
                    away.otl = (away.otl ?? 0) + 1;
                } else {
                    away.losses += 1;
                }
                away.streak = away.streak?.type === 'L' ? { type: 'L', count: away.streak.count + 1 } : { type: 'L', count: 1 };
            } else {
                away.wins += 1;
                away.streak = away.streak?.type === 'W' ? { type: 'W', count: away.streak.count + 1 } : { type: 'W', count: 1 };
                if (trackOtl) {
                    home.otl = (home.otl ?? 0) + 1;
                } else {
                    home.losses += 1;
                }
                home.streak = home.streak?.type === 'L' ? { type: 'L', count: home.streak.count + 1 } : { type: 'L', count: 1 };
            }
        }

        // Track head-to-head for regular season games only
        if (!game?.isPlayoff && !game?.isPlayIn && !game?.isPreseason && !game?.isAllStar) {
            headToHead = updateHeadToHead(headToHead, res, season ?? new Date().getFullYear());
        }
    });

    return { updatedTeams, results: allResults, headToHead };
};
