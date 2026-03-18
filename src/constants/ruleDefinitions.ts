export interface RuleDefinition {
    id: string;
    label: string;
    description: string;
    category: 'Structure' | 'Timing' | 'Scoring' | 'Fouls' | 'Coaching' | 'Personnel' | 'Schedule' | 'Conduct';
    type: 'number' | 'boolean' | 'select';
    min?: number;
    max?: number;
    unit?: string;
    options?: { label: string; value: string }[];
}

export const RULE_DEFINITIONS: Record<string, RuleDefinition> = {
    // Conduct
    suspensionFighting: {
        id: 'suspensionFighting',
        label: 'Fighting Suspension',
        description: 'Number of games a player is suspended for fighting.',
        category: 'Conduct',
        type: 'number',
        min: 1,
        max: 82,
        unit: 'GAMES'
    },
    techFoulFine: {
        id: 'techFoulFine',
        label: 'Technical Foul Fine',
        description: 'Amount a player is fined for a technical foul.',
        category: 'Conduct',
        type: 'number',
        min: 0,
        max: 50000,
        unit: '$'
    },
    ejectionFine: {
        id: 'ejectionFine',
        label: 'Ejection Fine',
        description: 'Amount a player is fined for an ejection.',
        category: 'Conduct',
        type: 'number',
        min: 0,
        max: 100000,
        unit: '$'
    },
    socialMediaPolicy: {
        id: 'socialMediaPolicy',
        label: 'Social Media Policy',
        description: 'Strictness of the league\'s social media policy.',
        category: 'Conduct',
        type: 'select',
        options: [
            { label: 'Lax', value: 'lax' },
            { label: 'Standard', value: 'standard' },
            { label: 'Strict', value: 'strict' },
            { label: 'Draconian', value: 'draconian' }
        ]
    },
    dressCodeStrictness: {
        id: 'dressCodeStrictness',
        label: 'Dress Code',
        description: 'Strictness of the league\'s dress code for players.',
        category: 'Conduct',
        type: 'select',
        options: [
            { label: 'None', value: 'none' },
            { label: 'Business Casual', value: 'business_casual' },
            { label: 'Formal', value: 'formal' }
        ]
    },
    drugTestingFrequency: {
        id: 'drugTestingFrequency',
        label: 'Drug Testing Frequency',
        description: 'How often players are randomly tested for prohibited substances.',
        category: 'Conduct',
        type: 'select',
        options: [
            { label: 'None', value: 'none' },
            { label: 'Occasional', value: 'occasional' },
            { label: 'Frequent', value: 'frequent' },
            { label: 'Constant', value: 'constant' }
        ]
    },
    gamblingPolicy: {
        id: 'gamblingPolicy',
        label: 'Gambling Policy',
        description: 'Strictness of the league\'s policy on player gambling.',
        category: 'Conduct',
        type: 'select',
        options: [
            { label: 'Standard', value: 'standard' },
            { label: 'Strict', value: 'strict' },
            { label: 'Zero Tolerance', value: 'zero_tolerance' }
        ]
    },

    // Structure
    gameFormat: {
        id: 'gameFormat',
        label: 'Game Format',
        description: 'The fundamental format of the game: Timed (standard quarters) or Target Score (Elam Ending).',
        category: 'Structure',
        type: 'select',
        options: [
            { label: 'Timed', value: 'timed' },
            { label: 'Target Score', value: 'target_score' }
        ]
    },
    gameTargetScore: {
        id: 'gameTargetScore',
        label: 'Target Score',
        description: 'Points needed to win the game in Target Score format.',
        category: 'Structure',
        type: 'number',
        min: 10,
        max: 300,
        unit: 'PTS'
    },
    quarterLength: {
        id: 'quarterLength',
        label: 'Quarter Length',
        description: 'Duration of each standard quarter in minutes.',
        category: 'Structure',
        type: 'number',
        min: 1,
        max: 100,
        unit: 'MIN'
    },
    numQuarters: {
        id: 'numQuarters',
        label: 'Number of Quarters',
        description: 'Total number of standard quarters per game.',
        category: 'Structure',
        type: 'number',
        min: 1,
        max: 10
    },
    overtimeEnabled: {
        id: 'overtimeEnabled',
        label: 'Overtime Periods',
        description: 'Whether games can proceed to overtime if tied at the end of regulation.',
        category: 'Structure',
        type: 'boolean'
    },
    overtimeDuration: {
        id: 'overtimeDuration',
        label: 'OT Duration',
        description: 'Duration of each overtime period in minutes.',
        category: 'Structure',
        type: 'number',
        min: 1,
        max: 15,
        unit: 'MIN'
    },
    overtimeTargetPoints: {
        id: 'overtimeTargetPoints',
        label: 'Target Points',
        description: 'Points needed to win in Target Score (Elam) overtime.',
        category: 'Structure',
        type: 'number',
        min: 1,
        max: 50,
        unit: 'PTS'
    },
    shootoutRounds: {
        id: 'shootoutRounds',
        label: 'Shootout Rounds',
        description: 'Number of rounds in a penalty shootout.',
        category: 'Structure',
        type: 'number',
        min: 1,
        max: 10,
        unit: 'RND'
    },
    overtimeType: {
        id: 'overtimeType',
        label: 'Overtime Format',
        description: 'The mechanism used to resolve ties.',
        category: 'Structure',
        type: 'select',
        options: [
            { label: 'Standard (Timed)', value: 'standard' },
            { label: 'Target Score (Elam)', value: 'target_score' },
            { label: 'Penalty Shootout', value: 'shootout' },
            { label: 'Sudden Death', value: 'sudden_death' }
        ]
    },
    maxOvertimesEnabled: {
        id: 'maxOvertimesEnabled',
        label: 'Limit Overtime Count',
        description: 'If enabled, limits the maximum number of overtime periods before a final resolution (like a tie or shootout).',
        category: 'Structure',
        type: 'boolean'
    },
    maxOvertimes: {
        id: 'maxOvertimes',
        label: 'Max Overtimes',
        description: 'Maximum number of overtime periods allowed.',
        category: 'Structure',
        type: 'number',
        min: 1,
        max: 10
    },
    overtimeTieBreaker: {
        id: 'overtimeTieBreaker',
        label: 'Tie-Breaker Format',
        description: 'The format used to decide a winner after the maximum number of overtime periods is reached.',
        category: 'Structure',
        type: 'select',
        options: [
            { label: 'Target Score (Elam)', value: 'target_score' },
            { label: 'Penalty Shootout', value: 'shootout' },
            { label: 'Sudden Death', value: 'sudden_death' }
        ]
    },
    startOfPossessionMethod: {
        id: 'startOfPossessionMethod',
        label: 'Start of Possession',
        description: 'How the first possession of the game is determined.',
        category: 'Structure',
        type: 'select',
        options: [
            { label: 'Jump Ball', value: 'jump_ball' },
            { label: 'Coin Toss', value: 'coin_toss' },
            { label: 'Rock Paper Scissors', value: 'rock_paper_scissors' }
        ]
    },
    possessionPattern: {
        id: 'possessionPattern',
        label: 'Quarter Possession Pattern',
        description: 'How possession is determined at the start of subsequent quarters.',
        category: 'Structure',
        type: 'select',
        options: [
            { label: 'NBA (1-2-2-1)', value: 'nba' },
            { label: 'Alternating (1-2-1-2)', value: 'alternating' }
        ]
    },

    // Personnel & Subs
    maxPlayersOnCourt: {
        id: 'maxPlayersOnCourt',
        label: 'Players on Court',
        description: 'Number of players per team allowed on the court at once.',
        category: 'Personnel',
        type: 'number',
        min: 1,
        max: 10
    },
    substitutionLimitEnabled: {
        id: 'substitutionLimitEnabled',
        label: 'Sub Limits',
        description: 'If enabled, teams have a limited number of substitutions per game (like Football/Soccer).',
        category: 'Personnel',
        type: 'boolean'
    },
    maxSubstitutions: {
        id: 'maxSubstitutions',
        label: 'Max Subs',
        description: 'Maximum number of substitutions allowed per team per game.',
        category: 'Personnel',
        type: 'number',
        min: 1,
        max: 20
    },
    noDribbleRule: {
        id: 'noDribbleRule',
        label: 'No Dribble Rule',
        description: 'Players are not allowed to dribble. They must pass or shoot immediately upon receiving the ball.',
        category: 'Personnel',
        type: 'boolean'
    },
    multiballEnabled: {
        id: 'multiballEnabled',
        label: 'Multiball Mode',
        description: 'Two balls are in play simultaneously. Chaos ensues.',
        category: 'Personnel',
        type: 'boolean'
    },
    multiballCount: {
        id: 'multiballCount',
        label: 'Number of Basketballs',
        description: 'The number of basketballs in play during multiball mode.',
        category: 'Personnel',
        type: 'number',
        min: 2,
        max: 10
    },

    // Timing
    shotClockEnabled: {
        id: 'shotClockEnabled',
        label: 'Shot Clock',
        description: 'Time allowed for a team to attempt a shot that hits the rim.',
        category: 'Timing',
        type: 'boolean'
    },
    shotClockValue: {
        id: 'shotClockValue',
        label: 'Shot Clock Duration',
        description: 'Seconds on the shot clock.',
        category: 'Timing',
        type: 'number',
        min: 10,
        max: 60,
        unit: 'SEC'
    },
    backcourtTimerEnabled: {
        id: 'backcourtTimerEnabled',
        label: 'Backcourt Timer',
        description: 'Time allowed to advance the ball past the midcourt line.',
        category: 'Timing',
        type: 'boolean'
    },
    backcourtTimerValue: {
        id: 'backcourtTimerValue',
        label: 'Backcourt Duration',
        description: 'Seconds to cross midcourt.',
        category: 'Timing',
        type: 'number',
        min: 5,
        max: 15,
        unit: 'SEC'
    },
    offensiveThreeSecondEnabled: {
        id: 'offensiveThreeSecondEnabled',
        label: 'Offensive 3-Seconds',
        description: 'Limits how long an offensive player can stay in the restricted area (paint).',
        category: 'Timing',
        type: 'boolean'
    },
    offensiveThreeSecondValue: {
        id: 'offensiveThreeSecondValue',
        label: 'Offensive Paint Limit',
        description: 'Seconds allowed in the paint.',
        category: 'Timing',
        type: 'number',
        min: 1,
        max: 10,
        unit: 'SEC'
    },
    defensiveThreeSecondEnabled: {
        id: 'defensiveThreeSecondEnabled',
        label: 'Defensive 3-Seconds',
        description: 'Illegal defense; defender cannot stay in paint without guarding someone.',
        category: 'Timing',
        type: 'boolean'
    },
    defensiveThreeSecondValue: {
        id: 'defensiveThreeSecondValue',
        label: 'Defensive Paint Limit',
        description: 'Seconds allowed for defenders in the paint.',
        category: 'Timing',
        type: 'number',
        min: 1,
        max: 10,
        unit: 'SEC'
    },
    illegalZoneDefenseEnabled: {
        id: 'illegalZoneDefenseEnabled',
        label: 'Illegal Zone Defense',
        description: 'Enforces strict man-to-man defense rules, prohibiting zone defenses.',
        category: 'Timing',
        type: 'boolean'
    },
    inboundTimerEnabled: {
        id: 'inboundTimerEnabled',
        label: 'Inbound Timer',
        description: 'Time allowed to pass the ball in from out-of-bounds.',
        category: 'Timing',
        type: 'boolean'
    },
    inboundTimerValue: {
        id: 'inboundTimerValue',
        label: 'Inbound Duration',
        description: 'Seconds to inbound the ball.',
        category: 'Timing',
        type: 'number',
        min: 3,
        max: 10,
        unit: 'SEC'
    },
    backToBasketTimerEnabled: {
        id: 'backToBasketTimerEnabled',
        label: 'Back to Basket',
        description: 'Time a player can dribble with their back to the basket below the free-throw line.',
        category: 'Timing',
        type: 'boolean'
    },
    backToBasketTimerValue: {
        id: 'backToBasketTimerValue',
        label: 'Post Dribble Limit',
        description: 'Seconds allowed for back-to-basket dribbling.',
        category: 'Timing',
        type: 'number',
        min: 3,
        max: 10,
        unit: 'SEC'
    },
    shotClockResetOffensiveRebound: {
        id: 'shotClockResetOffensiveRebound',
        label: 'Shot Clock Reset (ORB)',
        description: 'Seconds the shot clock resets to after an offensive rebound.',
        category: 'Timing',
        type: 'number',
        min: 10,
        max: 35,
        unit: 'SEC'
    },

    // Schedule
    customScheduleEnabled: {
        id: 'customScheduleEnabled',
        label: 'Custom Schedule',
        description: 'Enables custom scheduling settings.',
        category: 'Schedule',
        type: 'boolean'
    },
    gamesPerSeason: {
        id: 'gamesPerSeason',
        label: 'Games Per Season',
        description: 'Total number of games in a season.',
        category: 'Schedule',
        type: 'number',
        min: 1,
        max: 162,
        unit: 'GAMES'
    },
    divisionGames: {
        id: 'divisionGames',
        label: 'Division Games',
        description: 'Number of games versus other teams in the same division.',
        category: 'Schedule',
        type: 'number',
        min: 0,
        max: 82,
        unit: 'GAMES'
    },
    conferenceGames: {
        id: 'conferenceGames',
        label: 'Conference Games',
        description: 'Number of games versus other teams in the same conference but different division.',
        category: 'Schedule',
        type: 'number',
        min: 0,
        max: 82,
        unit: 'GAMES'
    },

    // Scoring
    threePointLineEnabled: {
        id: 'threePointLineEnabled',
        label: '3-Point Line',
        description: 'Enables the 3-point line.',
        category: 'Scoring',
        type: 'boolean'
    },
    threePointLineDistance: {
        id: 'threePointLineDistance',
        label: '3PT Distance',
        description: 'Distance from the center of the hoop to the three-point line.',
        category: 'Scoring',
        type: 'number',
        min: 15,
        max: 30,
        unit: 'FT'
    },
    fourPointLine: {
        id: 'fourPointLine',
        label: '4-Point Line',
        description: 'Enables an additional scoring arc for 4-point shots.',
        category: 'Scoring',
        type: 'boolean'
    },
    fourPointLineDistance: {
        id: 'fourPointLineDistance',
        label: '4PT Distance',
        description: 'Distance for the 4-point line.',
        category: 'Scoring',
        type: 'number',
        min: 25,
        max: 45,
        unit: 'FT'
    },
    dunkValue: {
        id: 'dunkValue',
        label: 'Dunk Value',
        description: 'Points awarded for a successful dunk.',
        category: 'Scoring',
        type: 'number',
        min: 1,
        max: 10,
        unit: 'PTS'
    },
    midrangeValue: {
        id: 'midrangeValue',
        label: 'Midrange Value',
        description: 'Points awarded for shots outside the paint but inside the 3PT line.',
        category: 'Scoring',
        type: 'number',
        min: 1,
        max: 10,
        unit: 'PTS'
    },
    heaveRuleEnabled: {
        id: 'heaveRuleEnabled',
        label: 'Heave Rule',
        description: 'Shots from the backcourt count for extra points.',
        category: 'Scoring',
        type: 'boolean'
    },
    halfCourtShotValue: {
        id: 'halfCourtShotValue',
        label: 'Half-Court Value',
        description: 'Point value for successful shots from beyond midcourt.',
        category: 'Scoring',
        type: 'number',
        min: 3,
        max: 10,
        unit: 'PTS'
    },
    freeThrowDistance: {
        id: 'freeThrowDistance',
        label: 'Free Throw Distance',
        description: 'Distance from the baseline to the free throw line.',
        category: 'Scoring',
        type: 'number',
        min: 10,
        max: 20,
        unit: 'FT'
    },
    rimHeight: {
        id: 'rimHeight',
        label: 'Rim Height',
        description: 'Height of the basketball rim from the floor.',
        category: 'Scoring',
        type: 'number',
        min: 8,
        max: 12,
        unit: 'FT'
    },
    ballWeight: {
        id: 'ballWeight',
        label: 'Ball Weight',
        description: 'Weight of the basketball.',
        category: 'Scoring',
        type: 'number',
        min: 1,
        max: 15,
        unit: 'LBS'
    },
    courtLength: {
        id: 'courtLength',
        label: 'Court Length',
        description: 'Total length of the basketball court.',
        category: 'Scoring',
        type: 'number',
        min: 50,
        max: 120,
        unit: 'FT'
    },
    baselineLength: {
        id: 'baselineLength',
        label: 'Baseline Length',
        description: 'Width of the basketball court at the baseline.',
        category: 'Scoring',
        type: 'number',
        min: 30,
        max: 80,
        unit: 'FT'
    },
    keyWidth: {
        id: 'keyWidth',
        label: 'Key Width',
        description: 'Width of the painted area (the key).',
        category: 'Scoring',
        type: 'number',
        min: 6,
        max: 20,
        unit: 'FT'
    },

    // Fouls
    foulOutLimit: {
        id: 'foulOutLimit',
        label: 'Personal Foul Limit',
        description: 'Number of personal fouls before a player is disqualified.',
        category: 'Fouls',
        type: 'number',
        min: 1,
        max: 15
    },
    teamFoulPenalty: {
        id: 'teamFoulPenalty',
        label: 'Bonus Threshold',
        description: 'Number of team fouls in a quarter before the opponent enters the bonus.',
        category: 'Fouls',
        type: 'number',
        min: 1,
        max: 10
    },
    flagrantFoulPenaltyEnabled: {
        id: 'flagrantFoulPenaltyEnabled',
        label: 'Flagrant Fouls',
        description: 'Excessive contact results in free throws and retained possession.',
        category: 'Fouls',
        type: 'boolean'
    },
    clearPathFoulEnabled: {
        id: 'clearPathFoulEnabled',
        label: 'Clear Path Foul',
        description: 'Penalty for fouling a player on a breakaway with no defenders ahead.',
        category: 'Fouls',
        type: 'boolean'
    },
    illegalScreenEnabled: {
        id: 'illegalScreenEnabled',
        label: 'Illegal Screens',
        description: 'Offensive foul for moving while setting a pick.',
        category: 'Fouls',
        type: 'boolean'
    },
    overTheBackFoulEnabled: {
        id: 'overTheBackFoulEnabled',
        label: 'Over the Back',
        description: 'Foul for reaching over an opponent during a rebound.',
        category: 'Fouls',
        type: 'boolean'
    },
    looseBallFoulEnabled: {
        id: 'looseBallFoulEnabled',
        label: 'Loose Ball Fouls',
        description: 'Fouls committed while neither team has possession.',
        category: 'Fouls',
        type: 'boolean'
    },
    chargingEnabled: {
        id: 'chargingEnabled',
        label: 'Charging/Blocking',
        description: 'Enables collisions to be called as offensive charges or defensive blocks.',
        category: 'Fouls',
        type: 'boolean'
    },
    handcheckingEnabled: {
        id: 'handcheckingEnabled',
        label: 'Handchecking',
        description: 'Allows defenders to use their hands to impede the progress of an offensive player.',
        category: 'Fouls',
        type: 'boolean'
    },
    techEjectionLimit: {
        id: 'techEjectionLimit',
        label: 'Tech Ejection Limit',
        description: 'Number of technical fouls before a player is ejected.',
        category: 'Fouls',
        type: 'number',
        min: 1,
        max: 5
    },
    flagrant1EjectionLimit: {
        id: 'flagrant1EjectionLimit',
        label: 'Flagrant 1 Limit',
        description: 'Number of Flagrant 1 fouls before a player is ejected.',
        category: 'Fouls',
        type: 'number',
        min: 1,
        max: 5
    },
    flagrant2EjectionLimit: {
        id: 'flagrant2EjectionLimit',
        label: 'Flagrant 2 Limit',
        description: 'Number of Flagrant 2 fouls before a player is ejected.',
        category: 'Fouls',
        type: 'number',
        min: 1,
        max: 5
    },
    fightingInstantEjection: {
        id: 'fightingInstantEjection',
        label: 'Fighting Ejection',
        description: 'Whether fighting results in an immediate ejection.',
        category: 'Fouls',
        type: 'boolean'
    },
    useYellowRedCards: {
        id: 'useYellowRedCards',
        label: 'Yellow/Red Cards',
        description: 'Use a soccer-style card system for discipline.',
        category: 'Fouls',
        type: 'boolean'
    },

    // Court Violations
    backcourtViolationEnabled: {
        id: 'backcourtViolationEnabled',
        label: 'Backcourt Violation',
        description: 'Crossing back over midcourt after entering the frontcourt.',
        category: 'Fouls',
        type: 'boolean'
    },
    travelingEnabled: {
        id: 'travelingEnabled',
        label: 'Traveling',
        description: 'Taking steps without dribbling.',
        category: 'Fouls',
        type: 'boolean'
    },
    doubleDribbleEnabled: {
        id: 'doubleDribbleEnabled',
        label: 'Double Dribble',
        description: 'Stopping and restarting a dribble.',
        category: 'Fouls',
        type: 'boolean'
    },
    goaltendingEnabled: {
        id: 'goaltendingEnabled',
        label: 'Goaltending',
        description: 'Touching the ball on its downward flight toward the rim.',
        category: 'Fouls',
        type: 'boolean'
    },
    basketInterferenceEnabled: {
        id: 'basketInterferenceEnabled',
        label: 'Basket Interference',
        description: 'Touching the rim or net while the ball is on the rim.',
        category: 'Fouls',
        type: 'boolean'
    },
    kickedBallEnabled: {
        id: 'kickedBallEnabled',
        label: 'Kicked Ball',
        description: 'Intentionally touching the ball with the foot or leg.',
        category: 'Fouls',
        type: 'boolean'
    },
    outOfBoundsEnabled: {
        id: 'outOfBoundsEnabled',
        label: 'Out of Bounds',
        description: 'Whether players and the ball are restricted to the court boundaries.',
        category: 'Fouls',
        type: 'boolean'
    },
    cornerThrowInEnabled: {
        id: 'cornerThrowInEnabled',
        label: 'Corner Throw-In',
        description: 'Enables throw-ins from the corner when the ball goes out on the baseline.',
        category: 'Fouls',
        type: 'boolean'
    },

    // Coaching
    maxTimeouts: {
        id: 'maxTimeouts',
        label: 'Max Timeouts',
        description: 'Total timeouts allowed per team per game.',
        category: 'Coaching',
        type: 'number',
        min: 1,
        max: 15
    },
    clutchTimeoutLimit: {
        id: 'clutchTimeoutLimit',
        label: 'Clutch Timeout Limit',
        description: 'Maximum timeouts allowed in the final 2 minutes of the game.',
        category: 'Coaching',
        type: 'number',
        min: 1,
        max: 5
    },
    coachChallenges: {
        id: 'coachChallenges',
        label: 'Coach Challenges',
        description: 'Allows coaches to challenge official rulings.',
        category: 'Coaching',
        type: 'boolean'
    },
    maxCoachChallenges: {
        id: 'maxCoachChallenges',
        label: 'Max Challenges',
        description: 'Number of challenges allowed per game.',
        category: 'Coaching',
        type: 'number',
        min: 1,
        max: 5
    },
    challengeReimbursed: {
        id: 'challengeReimbursed',
        label: 'Reimburse on Success',
        description: 'If a challenge is successful, the team retains the challenge.',
        category: 'Coaching',
        type: 'boolean'
    }
};
