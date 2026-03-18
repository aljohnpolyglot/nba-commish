import { LeagueStats } from '../types';

interface RuleEffects {
    morale: {
        fans: number;
        players: number;
        owners: number;
        legacy: number;
    };
    revenue: number;
    viewership: number;
    legacy: number;
}

export const calculateRuleChangeEffects = (oldStats: LeagueStats, newStats: Partial<LeagueStats>): RuleEffects => {
    let fanMorale = 0;
    let playerMorale = 0;
    let ownerMorale = 0;
    let legacy = 0;
    let revenue = 0;
    let viewership = 0;

    // Play-In Tournament
    if (newStats.playIn !== undefined && newStats.playIn !== oldStats.playIn) {
        if (newStats.playIn) {
            fanMorale += 2;
            ownerMorale += 3;
            playerMorale -= 1;
            revenue += 5;
            viewership += 4;
        } else {
            fanMorale -= 2;
            ownerMorale -= 3;
            playerMorale += 1;
            revenue -= 5;
            viewership -= 4;
        }
    }

    // In-Season Tournament
    if (newStats.inSeasonTournament !== undefined && newStats.inSeasonTournament !== oldStats.inSeasonTournament) {
        if (newStats.inSeasonTournament) {
            fanMorale += 3;
            ownerMorale += 4;
            playerMorale -= 2;
            revenue += 6;
            viewership += 5;
        } else {
            fanMorale -= 3;
            ownerMorale -= 4;
            playerMorale += 2;
            revenue -= 6;
            viewership -= 5;
        }
    }

    // Playoff Series Length
    if (newStats.numGamesPlayoffSeries && oldStats.numGamesPlayoffSeries) {
        const oldTotal = oldStats.numGamesPlayoffSeries.reduce((a, b) => a + b, 0);
        const newTotal = newStats.numGamesPlayoffSeries.reduce((a, b) => a + b, 0);
        const diff = newTotal - oldTotal;
        
        if (diff > 0) {
            // More games = more money, but players hate it, fans might get fatigued
            revenue += diff * 3;
            viewership += diff * 1;
            playerMorale -= diff * 2;
            ownerMorale += diff * 2;
            if (newStats.numGamesPlayoffSeries[0] === 7 && oldStats.numGamesPlayoffSeries[0] === 5) {
                legacy -= 2; // Purists remember best of 5 first round
            }
        } else if (diff < 0) {
            revenue += diff * 3;
            viewership += diff * 1;
            playerMorale -= diff * 2; // diff is negative, so player morale increases
            ownerMorale += diff * 2;
        }
    }

    // All-Star Format
    if (newStats.allStarFormat !== undefined && newStats.allStarFormat !== oldStats.allStarFormat) {
        if (newStats.allStarFormat === 'East vs West') {
            legacy += 3;
            fanMorale += 1;
        } else if (newStats.allStarFormat === 'Captains Draft') {
            fanMorale += 3;
            viewership += 2;
            legacy -= 1;
        } else if (newStats.allStarFormat === 'USA vs World') {
            viewership += 4;
            fanMorale += 2;
            legacy -= 2;
        }
    }

    // All-Star Ending
    if (newStats.allStarEnding !== undefined && newStats.allStarEnding !== oldStats.allStarEnding) {
        if (newStats.allStarEnding === 'Elam Ending') {
            fanMorale += 4;
            viewership += 3;
            playerMorale += 2; // They like the competitive ending
            legacy -= 3;
        } else if (newStats.allStarEnding === 'Normal') {
            legacy += 3;
            fanMorale -= 1;
        }
    }

    // 4-Point Line
    if (newStats.fourPointLine !== undefined && newStats.fourPointLine !== oldStats.fourPointLine) {
        if (newStats.fourPointLine) {
            fanMorale += 5; // Fans love scoring
            playerMorale += 1; // Shooters love it, bigs hate it
            ownerMorale += 2;
            legacy -= 5; // Purists hate it
            viewership += 8;
        } else {
            fanMorale -= 2;
            legacy += 2;
            viewership -= 3;
        }
    }

    // Quarter Length
    if (newStats.quarterLength !== undefined && newStats.quarterLength !== oldStats.quarterLength) {
        const diff = newStats.quarterLength - (oldStats.quarterLength || 12);
        // Longer games = more ad slots = more revenue
        // But players hate the extra workload, and fans might find it too long
        playerMorale -= diff * 3;
        ownerMorale += diff * 2; // Owners love ad revenue
        revenue += diff * 4; // Significant revenue impact
        viewership += diff * 0.5; // Slight viewership boost (more content), but diminishing returns
    }

    // Foul Out Limit
    if (newStats.foulOutLimit !== undefined && newStats.foulOutLimit !== oldStats.foulOutLimit) {
        const diff = newStats.foulOutLimit - (oldStats.foulOutLimit || 6);
        // Higher limit = stars play more = fans happy, but less defense
        fanMorale += diff * 1;
        playerMorale += diff * 1;
        legacy -= diff > 0 ? 1 : -1;
    }

    // Minimum Games Requirement
    if (newStats.minGamesRequirement !== undefined && newStats.minGamesRequirement !== oldStats.minGamesRequirement) {
        const diff = (newStats.minGamesRequirement as number) - (oldStats.minGamesRequirement || 65);
        // Higher requirement = players hate it, fans/owners love it (stars play)
        playerMorale -= diff * 0.5;
        fanMorale += diff * 0.5;
        ownerMorale += diff * 0.5;
        viewership += diff * 0.5;
    }

    // Overtime Type
    if (newStats.overtimeType !== undefined && newStats.overtimeType !== oldStats.overtimeType) {
        if (newStats.overtimeType === 'target_score') {
            fanMorale += 5;
            legacy -= 2;
            viewership += 6; // High drama
            revenue -= 2; // Ends faster than standard OT usually
        } else if (newStats.overtimeType === 'shootout') {
            fanMorale += 6;
            legacy -= 5;
            viewership += 8; // Maximum drama
            revenue -= 3; // Very short duration
        } else if (newStats.overtimeType === 'sudden_death') {
            fanMorale += 4;
            legacy -= 3;
            viewership += 7;
            revenue -= 4; // Shortest duration
        } else if (newStats.overtimeType === 'standard') {
            legacy += 2;
            revenue += 3; // Standard OTs can go long
        }
    }

    if (newStats.overtimeDuration !== undefined && newStats.overtimeDuration !== oldStats.overtimeDuration) {
        const diff = newStats.overtimeDuration - (oldStats.overtimeDuration || 5);
        // More minutes in OT = more ads
        revenue += diff * 1.5;
        playerMorale -= diff * 1;
    }

    if (newStats.overtimeTargetPoints !== undefined && newStats.overtimeTargetPoints !== oldStats.overtimeTargetPoints) {
        const diff = newStats.overtimeTargetPoints - (oldStats.overtimeTargetPoints || 7);
        // Higher target = longer game = more ads
        revenue += diff * 1;
        viewership += diff * 0.2;
        playerMorale -= diff * 0.2;
    }

    if (newStats.shootoutRounds !== undefined && newStats.shootoutRounds !== oldStats.shootoutRounds) {
        const diff = newStats.shootoutRounds - (oldStats.shootoutRounds || 3);
        fanMorale += diff * 0.5;
    }

    if (newStats.overtimeTieBreaker !== undefined && newStats.overtimeTieBreaker !== oldStats.overtimeTieBreaker) {
        if (newStats.overtimeTieBreaker === 'sudden_death') {
            fanMorale += 2;
            legacy -= 3;
        } else if (newStats.overtimeTieBreaker === 'shootout') {
            fanMorale += 3;
            legacy -= 4;
        }
    }

    // Personnel & Subs
    if (newStats.maxPlayersOnCourt !== undefined && newStats.maxPlayersOnCourt !== oldStats.maxPlayersOnCourt) {
        const diff = newStats.maxPlayersOnCourt - (oldStats.maxPlayersOnCourt || 5);
        // More players = more chaos, less space
        fanMorale += Math.abs(diff) * 2;
        viewership += Math.abs(diff) * 3;
        legacy -= Math.abs(diff) * 5;
    }

    if (newStats.substitutionLimitEnabled !== undefined && newStats.substitutionLimitEnabled !== oldStats.substitutionLimitEnabled) {
        if (newStats.substitutionLimitEnabled) {
            playerMorale -= 5; // Harder to manage fatigue
            legacy -= 2;
            viewership += 2; // More strategy
        }
    }

    if (newStats.noDribbleRule !== undefined && newStats.noDribbleRule !== oldStats.noDribbleRule) {
        if (newStats.noDribbleRule) {
            fanMorale -= 5;
            legacy -= 10;
            viewership += 5; // Weirdness factor
        }
    }

    if (newStats.multiballEnabled !== undefined && newStats.multiballEnabled !== oldStats.multiballEnabled) {
        if (newStats.multiballEnabled) {
            fanMorale += 10;
            viewership += 15;
            legacy -= 20;
            revenue += 5;
        }
    }

    // Scoring (Dunk/Midrange)
    if (newStats.dunkValue !== undefined && newStats.dunkValue !== oldStats.dunkValue) {
        const diff = newStats.dunkValue - (oldStats.dunkValue || 2);
        fanMorale += diff * 3;
        viewership += diff * 2;
        legacy -= Math.abs(diff) * 2;
    }

    if (newStats.midrangeValue !== undefined && newStats.midrangeValue !== oldStats.midrangeValue) {
        const diff = newStats.midrangeValue - (oldStats.midrangeValue || 2);
        // Buffing midrange might bring back the "old game"
        legacy += diff > 0 ? 2 : -2;
        fanMorale += diff * 1;
    }

    // Coach Challenges
    if (newStats.coachChallenges !== undefined && newStats.coachChallenges !== oldStats.coachChallenges) {
        if (newStats.coachChallenges) {
            fanMorale -= 1; // Slows down game
            playerMorale += 2; // More fair
            legacy += 1;
        } else {
            fanMorale += 1;
            playerMorale -= 2;
        }
    }

    // Shot Clock
    if (newStats.shotClockValue !== undefined && newStats.shotClockValue !== oldStats.shotClockValue) {
        const diff = newStats.shotClockValue - (oldStats.shotClockValue || 24);
        // Lower shot clock = faster pace = more fans/viewership
        fanMorale -= diff * 0.5;
        viewership -= diff * 0.5;
        playerMorale += diff * 0.2; // Players like more time to set up
        legacy -= diff < 0 ? 2 : 0; // Purists hate changing the 24s clock
    }

    // 3PT Distance
    if (newStats.threePointLineDistance !== undefined && newStats.threePointLineDistance !== oldStats.threePointLineDistance) {
        const diff = newStats.threePointLineDistance - (oldStats.threePointLineDistance || 23.75);
        // Further line = harder shots = less scoring = fans unhappy
        fanMorale -= diff * 2;
        viewership -= diff * 1;
        legacy += diff > 0 ? 3 : -3; // Purists like a harder line
    }

    // Technical Foul Limit
    if (newStats.techEjectionLimit !== undefined && newStats.techEjectionLimit !== oldStats.techEjectionLimit) {
        const diff = newStats.techEjectionLimit - (oldStats.techEjectionLimit || 2);
        // Lower limit = more ejections = fans hate seeing stars leave
        fanMorale += diff * 2;
        playerMorale += diff * 3;
        ownerMorale -= diff * 1;
    }

    // Overtime Enabled
    if (newStats.overtimeEnabled !== undefined && newStats.overtimeEnabled !== oldStats.overtimeEnabled) {
        if (!newStats.overtimeEnabled) {
            fanMorale -= 10; // Fans HATE ties
            viewership -= 5;
            revenue -= 5;
            legacy -= 5;
        } else {
            fanMorale += 5;
            viewership += 3;
            revenue += 3;
        }
    }

    if (newStats.maxOvertimesEnabled !== undefined && newStats.maxOvertimesEnabled !== oldStats.maxOvertimesEnabled) {
        if (newStats.maxOvertimesEnabled) {
            // Limiting OTs increases tension (viewership) but caps revenue
            viewership += 2;
            revenue -= 3;
        } else {
            // Infinite OTs = potential ad goldmine
            revenue += 5;
            viewership -= 1; // Fans might get bored of 6OT games
        }
    }

    // Clutch Timeout Limit
    if (newStats.clutchTimeoutLimit !== undefined && newStats.clutchTimeoutLimit !== oldStats.clutchTimeoutLimit) {
        const diff = newStats.clutchTimeoutLimit - (oldStats.clutchTimeoutLimit || 2);
        // Fewer timeouts in clutch = better flow = fans happy
        fanMorale -= diff * 2;
        viewership -= diff * 1;
        ownerMorale += diff * 1; // Coaches like more control
    }

    // Court Violations
    const courtViolations = [
        'backcourtViolationEnabled', 'travelingEnabled', 'double DribbleEnabled', 
        'goaltendingEnabled', 'basketInterferenceEnabled', 'kickedBallEnabled'
    ];
    courtViolations.forEach(key => {
        const k = key as keyof LeagueStats;
        if (newStats[k] !== undefined && newStats[k] !== oldStats[k]) {
            if (newStats[k]) {
                legacy += 1; // Purists like rules
                playerMorale -= 0.5; // Harder to play
            } else {
                legacy -= 3; // Chaos
                fanMorale += 1; // More scoring/fast play
                viewership += 1;
            }
        }
    });

    // Additional Fouls
    const extraFouls = ['illegalScreenEnabled', 'overTheBackFoulEnabled', 'looseBallFoulEnabled', 'chargingEnabled'];
    extraFouls.forEach(key => {
        const k = key as keyof LeagueStats;
        if (newStats[k] !== undefined && newStats[k] !== oldStats[k]) {
            if (newStats[k]) {
                legacy += 1;
                playerMorale -= 1;
                fanMorale -= 0.5; // More whistles
            } else {
                legacy -= 2;
                playerMorale += 1;
                fanMorale += 2; // More flow
                viewership += 2;
            }
        }
    });

    // 4PT Distance
    if (newStats.fourPointLineDistance !== undefined && newStats.fourPointLineDistance !== oldStats.fourPointLineDistance) {
        const diff = newStats.fourPointLineDistance - (oldStats.fourPointLineDistance || 30);
        // Further = harder = less scoring
        fanMorale -= diff * 0.5;
        legacy += diff > 0 ? 1 : -1;
    }

    // Half Court Shot Value
    if (newStats.halfCourtShotValue !== undefined && newStats.halfCourtShotValue !== oldStats.halfCourtShotValue) {
        const diff = newStats.halfCourtShotValue - (oldStats.halfCourtShotValue || 3);
        fanMorale += diff * 2;
        viewership += diff * 1;
        legacy -= diff > 0 ? 1 : 0;
    }

    return {
        morale: {
            fans: Math.round(fanMorale),
            players: Math.round(playerMorale),
            owners: Math.round(ownerMorale),
            legacy: Math.round(legacy)
        },
        revenue: Math.round(revenue),
        viewership: Math.round(viewership),
        legacy: Math.round(legacy)
    };
};
