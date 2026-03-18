import { GameState, NBATeam, NBAPlayer as Player } from '../../../types';
import { simulateDayGames } from '../../../services/logic/simulationRunner';
import { calculateTeamStrength, clearTeamStrengthCache } from '../../../utils/playerRatings';
import { normalizeDate } from '../../../utils/helpers';

const updateTeamStrengths = (teams: NBATeam[], players: Player[]): NBATeam[] => {
    return teams.map(team => ({
        ...team,
        strength: calculateTeamStrength(team.id, players)
    }));
};

export const runSimulation = (state: GameState, daysToSimulate: number, action?: any) => {
    let stateWithSim = { ...state };
    
    // Clear cache at start of simulation batch
    clearTeamStrengthCache();
    
    // Pre-calculate strengths once for the batch
    stateWithSim.teams = updateTeamStrengths(stateWithSim.teams, stateWithSim.players);
    
    let allSimResults: any[] = [];
    let lastDaySimResults: any[] = [];

    const effectiveRiggedForTid: number | undefined = action?.payload?.riggedForTid ?? undefined;

    for (let i = 0; i < daysToSimulate; i++) {
        const simPatch = simulateDayGames(stateWithSim, action?.payload?.watchedGameResult, effectiveRiggedForTid);
        
        // Update state with results
        stateWithSim = { 
            ...stateWithSim, 
            teams: simPatch.teams, 
            schedule: simPatch.schedule 
        };
        
        allSimResults.push(...simPatch.results);
        
        if (i === daysToSimulate - 1) {
            lastDaySimResults = simPatch.results;
        } else {
            // Timezone-safe: normalise to YYYY-MM-DD, advance via UTC, format back with timeZone:'UTC'
            const currentNorm = normalizeDate(stateWithSim.date);
            const nextDate = new Date(`${currentNorm}T00:00:00Z`);
            nextDate.setUTCDate(nextDate.getUTCDate() + 1);
            stateWithSim.date = nextDate.toLocaleDateString('en-US', {
                timeZone: 'UTC',
                month: 'short', day: 'numeric', year: 'numeric'
            });
            stateWithSim.day += 1;
        }
    }

    return { stateWithSim, allSimResults, lastDaySimResults };
};
