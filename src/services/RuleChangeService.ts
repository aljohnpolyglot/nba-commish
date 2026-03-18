import { LeagueStats } from '../types';

interface RuleChangeLog {
    ruleName: string;
    timestamp: number;
}

class RuleChangeService {
    private changeHistory: RuleChangeLog[] = [];
    private readonly PENALTY_WINDOW = 1000 * 60 * 5; // 5 minutes window for "rapid" changes
    private readonly MAX_CHANGES_IN_WINDOW = 2;

    /**
     * Returns a formatted string of ONLY the rules that have changed.
     * This saves tokens by not sending the entire rulebook.
     */
    public getRulesDiff(oldStats: LeagueStats, newStats: Partial<LeagueStats>): string {
        const changes: string[] = [];
        
        const checkChange = (key: keyof LeagueStats, label: string, formatter?: (val: any) => string) => {
            if (newStats[key] !== undefined && newStats[key] !== oldStats[key]) {
                const val = newStats[key];
                changes.push(`${label}: ${formatter ? formatter(val) : val}`);
            }
        };

        // Schedule
        checkChange('customScheduleEnabled', '[Schedule] Custom Schedule', v => v ? 'Enabled' : 'Disabled');
        checkChange('gamesPerSeason', '[Schedule] Games Per Season');
        checkChange('divisionGames', '[Schedule] Division Games');
        checkChange('conferenceGames', '[Schedule] Conference Games');
        checkChange('numQuarters', '[Structure] Quarters');
        checkChange('overtimeEnabled', '[Timing] Overtime', v => v ? 'Enabled' : 'Disabled');
        checkChange('overtimeDuration', '[Timing] OT Duration', v => `${v}m`);
        checkChange('overtimeTargetPoints', '[Timing] OT Target Points', v => `${v}pts`);
        checkChange('shootoutRounds', '[Timing] Shootout Rounds');
        checkChange('overtimeType', '[Timing] OT Format');
        checkChange('maxOvertimesEnabled', '[Timing] Limit Overtimes', v => v ? 'Yes' : 'No');
        checkChange('maxOvertimes', '[Timing] Max Overtimes');
        checkChange('overtimeTieBreaker', '[Timing] OT Tie-Breaker');

        // Personnel
        checkChange('maxPlayersOnCourt', '[Personnel] Players on Court');
        checkChange('substitutionLimitEnabled', '[Personnel] Sub Limits', v => v ? 'On' : 'Off');
        checkChange('maxSubstitutions', '[Personnel] Max Subs');
        checkChange('noDribbleRule', '[Personnel] No Dribble', v => v ? 'Active' : 'Inactive');
        checkChange('multiballEnabled', '[Personnel] Multiball', v => v ? 'Active' : 'Inactive');
        checkChange('multiballCount', '[Personnel] Multiball Count');

        // Timing
        checkChange('shotClockEnabled', '[Timing] Shot Clock', v => v ? 'On' : 'Off');
        checkChange('shotClockValue', '[Timing] Shot Clock', v => `${v}s`);
        checkChange('backcourtTimerEnabled', '[Timing] Backcourt Timer', v => v ? 'On' : 'Off');
        checkChange('backcourtTimerValue', '[Timing] Backcourt Limit', v => `${v}s`);
        checkChange('offensiveThreeSecondEnabled', '[Timing] Offensive 3s', v => v ? 'On' : 'Off');
        checkChange('offensiveThreeSecondValue', '[Timing] Offensive 3s Limit', v => `${v}s`);
        checkChange('defensiveThreeSecondEnabled', '[Timing] Defensive 3s', v => v ? 'On' : 'Off');
        checkChange('defensiveThreeSecondValue', '[Timing] Defensive 3s Limit', v => `${v}s`);

        // Scoring
        checkChange('threePointLineEnabled', '[Scoring] 3PT Line Enabled', v => v ? 'Enabled' : 'Disabled');
        checkChange('threePointLineDistance', '[Scoring] 3PT Distance', v => `${v}ft`);
        checkChange('fourPointLine', '[Scoring] 4PT Line', v => v ? 'Enabled' : 'Disabled');
        checkChange('fourPointLineDistance', '[Scoring] 4PT Distance', v => `${v}ft`);
        checkChange('dunkValue', '[Scoring] Dunk Value', v => `${v}pts`);
        checkChange('midrangeValue', '[Scoring] Midrange Value', v => `${v}pts`);
        checkChange('heaveRuleEnabled', '[Scoring] Heave Rule', v => v ? 'On' : 'Off');
        checkChange('halfCourtShotValue', '[Scoring] Half-Court Value', v => `${v}pts`);

        // Fouls
        checkChange('foulOutLimit', '[Fouls] Foul Limit');
        checkChange('techEjectionLimit', '[Fouls] Tech Limit');
        checkChange('teamFoulPenalty', '[Fouls] Bonus Threshold');
        checkChange('flagrantFoulPenaltyEnabled', '[Fouls] Flagrant Fouls', v => v ? 'On' : 'Off');
        checkChange('clearPathFoulEnabled', '[Fouls] Clear Path Fouls', v => v ? 'On' : 'Off');
        checkChange('illegalScreenEnabled', '[Fouls] Illegal Screens', v => v ? 'On' : 'Off');
        checkChange('overTheBackFoulEnabled', '[Fouls] Over-the-Back', v => v ? 'On' : 'Off');
        checkChange('looseBallFoulEnabled', '[Fouls] Loose Ball Fouls', v => v ? 'On' : 'Off');
        checkChange('chargingEnabled', '[Fouls] Charging/Blocking', v => v ? 'On' : 'Off');
        checkChange('handcheckingEnabled', '[Fouls] Handchecking', v => v ? 'On' : 'Off');

        // Court Violations
        checkChange('backcourtViolationEnabled', '[Violations] Backcourt Violation', v => v ? 'On' : 'Off');
        checkChange('illegalZoneDefenseEnabled', '[Violations] Illegal Zone Defense', v => v ? 'On' : 'Off');
        checkChange('travelingEnabled', '[Violations] Traveling', v => v ? 'On' : 'Off');
        checkChange('doubleDribbleEnabled', '[Violations] Double Dribble', v => v ? 'On' : 'Off');
        checkChange('goaltendingEnabled', '[Violations] Goaltending', v => v ? 'On' : 'Off');
        checkChange('basketInterferenceEnabled', '[Violations] Basket Interference', v => v ? 'On' : 'Off');
        checkChange('kickedBallEnabled', '[Violations] Kicked Ball', v => v ? 'On' : 'Off');

        // Coaching
        checkChange('maxTimeouts', 'Max Timeouts');
        checkChange('clutchTimeoutLimit', 'Clutch Timeout Limit');
        checkChange('coachChallenges', 'Coach Challenges', v => v ? 'On' : 'Off');
        checkChange('maxCoachChallenges', 'Max Challenges');
        checkChange('challengeReimbursed', 'Reimburse Challenge', v => v ? 'Yes' : 'No');

        // League Structure
        checkChange('minGamesRequirement', 'Min Games for Awards');
        checkChange('minAgeRequirement', 'Min Age');
        checkChange('draftEligibilityRule', 'Draft Eligibility Rule');
        checkChange('playIn', 'Play-In Tournament', v => v ? 'Enabled' : 'Disabled');
        checkChange('inSeasonTournament', 'In-Season Tournament', v => v ? 'Enabled' : 'Disabled');
        checkChange('draftType', 'Draft Format');
        
        // All-Star Weekend
        checkChange('allStarGameEnabled', '[All-Star] All-Star Game', v => v ? 'Enabled' : 'Disabled');
        checkChange('allStarFormat', '[All-Star] Game Format');
        checkChange('allStarTeams', '[All-Star] Number of Teams');
        checkChange('allStarMirrorLeagueRules', '[All-Star] Mirror League Rules', v => v ? 'Yes' : 'No');
        checkChange('allStarGameFormat', '[All-Star] Game Mode', v => v === 'timed' ? 'Timed' : 'Target Score');
        checkChange('allStarDunkContest', '[All-Star] Dunk Contest', v => v ? 'Enabled' : 'Disabled');
        checkChange('allStarThreePointContest', '[All-Star] 3PT Contest', v => v ? 'Enabled' : 'Disabled');
        checkChange('allStarShootingStars', '[All-Star] Shooting Stars', v => v ? 'Enabled' : 'Disabled');
        checkChange('allStarSkillsChallenge', '[All-Star] Skills Challenge', v => v ? 'Enabled' : 'Disabled');
        checkChange('allStarHorse', '[All-Star] HORSE', v => v ? 'Enabled' : 'Disabled');
        checkChange('allStarOneOnOneEnabled', '[All-Star] 1v1 Tournament', v => v ? 'Enabled' : 'Disabled');
        
        // Rising Stars & Celebrity
        checkChange('risingStarsEnabled', '[Rising Stars] Game', v => v ? 'Enabled' : 'Disabled');
        checkChange('risingStarsFormat', '[Rising Stars] Format');
        checkChange('risingStarsMirrorLeagueRules', '[Rising Stars] Mirror Rules', v => v ? 'Yes' : 'No');
        checkChange('celebrityGameEnabled', '[Celebrity Game] Game', v => v ? 'Enabled' : 'Disabled');
        checkChange('celebrityGameMirrorLeagueRules', '[Celebrity Game] Mirror Rules', v => v ? 'Yes' : 'No');

        checkChange('allStarEnding', 'All-Star Ending');

        if (changes.length === 0) return "";

        return `
RECENT RULE CHANGES:
${changes.map(c => `- ${c}`).join('\n')}
        `.trim();
    }

    /**
     * Checks for rapid rule changes and calculates penalties.
     * Returns a penalty object if applicable.
     */
    public checkRapidChangePenalty(ruleNames: string[]): { moralePenalty: number; description: string } | null {
        const now = Date.now();
        let totalPenalty = 0;
        const penalizedRules: string[] = [];

        ruleNames.forEach(name => {
            const recentChanges = this.changeHistory.filter(log => 
                log.ruleName === name && (now - log.timestamp) < this.PENALTY_WINDOW
            );

            if (recentChanges.length >= this.MAX_CHANGES_IN_WINDOW) {
                totalPenalty += 5; // Fixed penalty per rule changed too often
                penalizedRules.push(name);
            }

            // Log this change
            this.changeHistory.push({ ruleName: name, timestamp: now });
        });

        // Clean up old history
        this.changeHistory = this.changeHistory.filter(log => (now - log.timestamp) < this.PENALTY_WINDOW * 2);

        if (totalPenalty > 0) {
            return {
                moralePenalty: totalPenalty,
                description: `The Commissioner is being indecisive about: ${penalizedRules.join(', ')}. Fans and owners are losing confidence in the league's stability.`
            };
        }

        return null;
    }
}

export const ruleChangeService = new RuleChangeService();
