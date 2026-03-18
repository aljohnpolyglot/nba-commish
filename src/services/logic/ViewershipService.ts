import { GameState, NBATeam, NBAPlayer, UserAction, GamePhase } from "../../types";
import { getGamePhase, convertTo2KRating } from "../../utils/helpers";

export const VIEWERSHIP_MEANS: Record<GamePhase, number> = {
    'Preseason': 0.8,
    'Opening Week': 2.2,
    'Regular Season (Early)': 1.6,
    'Regular Season (Mid)': 1.8,
    'All-Star Break': 3.5,
    'Trade Deadline': 2.5,
    'Regular Season (Late)': 2.1,
    'Play-In Tournament': 2.8,
    'Playoffs (Round 1)': 3.5,
    'Playoffs (Round 2)': 4.5,
    'Conference Finals': 6.0,
    'NBA Finals': 12.0,
    'Offseason': 0.2,
    'Draft': 1.5,
    'Draft Lottery': 1.2,
    'Free Agency': 1.0,
    'Schedule Planning': 0.3,
    'Schedule Release': 1.5,
    'Training Camp': 0.5
};

export class ViewershipService {
    static calculateTeamMultiplier(team: NBATeam, allTeams: NBATeam[], players?: NBAPlayer[]): number {
        const pops = allTeams.map(t => t.pop || 0);
        const meanPop = pops.reduce((a, b) => a + b, 0) / pops.length;
        const teamPop = team.pop || 0;
        
        // Base market multiplier
        const marketFactor = teamPop / meanPop;

        let strengthBonus = 0;
        let winPctBonus = 0;

        // Calculate Team Strength Bonus if players are provided
        if (players) {
            const teamPlayers = players.filter(p => p.tid === team.id);
            // Sort by overall rating descending
            teamPlayers.sort((a, b) => b.overallRating - a.overallRating);
            // Take top 3 players
            const top3 = teamPlayers.slice(0, 3);
            if (top3.length > 0) {
                const avgTop3Rating = top3.reduce((sum, p) => sum + convertTo2KRating(p.overallRating), 0) / top3.length;
                // If avg top 3 is > 78, give a bonus. If < 78, give a penalty.
                strengthBonus = (avgTop3Rating - 78) / 100; // e.g., 90 avg -> +0.12, 70 avg -> -0.08
            }
        }

        // Calculate Win Percentage Bonus
        const totalGames = (team.wins || 0) + (team.losses || 0);
        if (totalGames > 0) {
            const winPct = (team.wins || 0) / totalGames;
            // Less aggressive regression on start of season
            // Scale the impact by how many games have been played (up to 20 games)
            const gamesScale = Math.min(totalGames / 20, 1);
            
            // Win pct bonus: above 0.5 is good, below 0.5 is bad
            winPctBonus = (winPct - 0.5) * 0.5 * gamesScale; // Max +/- 0.25
        }

        // Final multiplier combines market, strength, and performance
        // A bad Lakers team (marketFactor 2.5, strengthBonus -0.1, winPctBonus -0.2) = 2.5 * 0.7 = 1.75 (still high)
        // A good OKC team (marketFactor 0.5, strengthBonus 0.15, winPctBonus 0.25) = 0.5 * 1.4 = 0.7 (better, but not Lakers level)
        const finalMultiplier = marketFactor * (1 + strengthBonus + winPctBonus);
        
        return Math.max(0.1, finalMultiplier); // Ensure it doesn't go below 0.1
    }

    static calculateDailyViewership(state: GameState, action?: UserAction): number {
        const phase = getGamePhase(state.date);
        let baseMean = VIEWERSHIP_MEANS[phase] || 1.8;

        // Check for Christmas Day (Month is 0-indexed, so 11 is December)
        const dateObj = new Date(state.date);
        if (dateObj.getMonth() === 11 && dateObj.getDate() === 25) {
            baseMean = 5.5; // Christmas Day tentpole event
        }

        let currentViewership = state.leagueStats.viewership || baseMean;

        // 1. Regression to mean (slowly move back to phase baseline)
        const regressionRate = 0.15; // 15% move towards mean each day
        currentViewership = currentViewership + (baseMean - currentViewership) * regressionRate;

        // 2. Action-based impacts (Deterministic)
        let impact = 0;

        if (action) {
            switch (action.type) {
                case 'SUSPEND_PLAYER': {
                    const { player } = action.payload;
                    const rating2k = convertTo2KRating(player.overallRating);
                    // 75 is neutral. 99 is massive drop.
                    if (rating2k > 75) {
                        const scale = (rating2k - 75) / 25;
                        const team = state.teams.find(t => t.id === player.tid);
                        const marketMult = team ? this.calculateTeamMultiplier(team, state.teams, state.players) : 1;
                        impact -= 0.2 * scale * marketMult;
                    }
                    break;
                }
                case 'SIGN_FREE_AGENT': {
                    const { playerId, teamId } = action.payload;
                    const player = state.players.find(p => p.internalId === playerId);
                    const team = state.teams.find(t => t.id === teamId);
                    if (player && team) {
                        const rating2k = convertTo2KRating(player.overallRating);
                        if (rating2k > 70) {
                            const scale = (rating2k - 70) / 30;
                            const marketMult = this.calculateTeamMultiplier(team, state.teams, state.players);
                            impact += 0.08 * scale * marketMult;
                        }
                    }
                    break;
                }
                case 'EXECUTIVE_TRADE':
                case 'FORCE_TRADE': {
                    // Trade hype based on player ratings and market
                    let maxRating = 0;
                    let marketMult = 1;

                    if (action.payload.transaction?.teams) {
                        Object.entries(action.payload.transaction.teams).forEach(([tid, assets]: [string, any]) => {
                            const team = state.teams.find(t => t.id === parseInt(tid));
                            if (team) {
                                const m = this.calculateTeamMultiplier(team, state.teams, state.players);
                                if (m > marketMult) marketMult = m;
                            }
                            assets.playersSent.forEach((p: any) => {
                                if (p.overallRating > maxRating) maxRating = p.overallRating;
                            });
                        });
                    } else if (action.payload.playerOverall) { // Fallback for simple FORCE_TRADE payload
                        maxRating = action.payload.playerOverall;
                        if (action.payload.isLargeMarket) marketMult = 1.5;
                    }
                    
                    if (maxRating > 70) {
                        const rating2k = convertTo2KRating(maxRating);
                        const scale = (rating2k - 70) / 30;
                        impact += 0.15 * scale * marketMult;
                    }
                    break;
                }
                case 'TRANSFER_FUNDS': {
                    const { amount, fundSource } = action.payload;
                    if (fundSource === 'leagueFunds') {
                        // Linear regression: 100M transfer = -0.6 viewership
                        impact -= (amount / 100000000) * 0.6;
                    }
                    break;
                }
                case 'DRUG_TEST_PERSON': {
                    const { contacts } = action.payload;
                    contacts.forEach((c: any) => {
                        const team = state.teams.find(t => t.id === c.tid);
                        if (team) {
                            const marketMult = this.calculateTeamMultiplier(team, state.teams, state.players);
                            if (marketMult > 1.3) { // Big market
                                impact -= 0.03 * marketMult;
                            }
                        }
                    });
                    break;
                }
                case 'GLOBAL_GAMES': {
                    impact += 0.15;
                    break;
                }
                case 'INVITE_PERFORMANCE': {
                    impact += 0.07;
                    break;
                }
            }
        }

        // 3. Team Performance Impact (Lakers win = boost)
        // We can check simResults from the day
        // This logic will be called in processTurn where simResults are available
        // But here we don't have simResults easily unless passed.
        // I'll add simResults as an optional parameter.
        
        // 4. Random fluctuation (noise)
        const noise = (Math.random() - 0.5) * 0.08;
        
        let finalViewership = currentViewership + impact + noise;
        
        // Floor it at a reasonable minimum for the phase
        return Math.max(finalViewership, baseMean * 0.4);
    }

    static calculatePerformanceImpact(state: GameState, simResults: any[]): number {
        let impact = 0;
        simResults.forEach(result => {
            const winner = state.teams.find(t => t.id === result.winnerId);
            if (winner) {
                const marketMult = this.calculateTeamMultiplier(winner, state.teams, state.players);
                // If a big market team wins, ratings get a small bump
                if (marketMult > 1.2) {
                    impact += 0.01 * (marketMult - 1);
                }
            }
        });
        return impact;
    }
}
