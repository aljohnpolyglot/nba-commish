import { useState, useEffect } from 'react';
import { Rule, LeagueStats } from '../../../../types';
import { calculateRuleChangeEffects } from '../../../../utils/ruleEffects';
import { ruleChangeService } from '../../../../services/RuleChangeService';
import { generateRuleDetails, generateAwardDetails } from '../../../../services/llm/llm';

export const useRulesState = (leagueStats: LeagueStats, dispatchAction: (action: any) => Promise<void>) => {
  const [localRules, setLocalRules] = useState<Rule[]>(leagueStats.rules);
  const [localAwards, setLocalAwards] = useState<Rule[]>(leagueStats.awards || []);
  const [newRule, setNewRule] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAward, setIsGeneratingAward] = useState(false);
  const [awardModalOpen, setAwardModalOpen] = useState(false);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [expandedAward, setExpandedAward] = useState<string | null>(null);

  // Configuration State
  const [playIn, setPlayIn] = useState(leagueStats.playIn);
  const [inSeasonTournament, setInSeasonTournament] = useState(leagueStats.inSeasonTournament ?? true);
  const [playoffFormat, setPlayoffFormat] = useState<(number | string)[]>([...leagueStats.numGamesPlayoffSeries]);
  const [draftType, setDraftType] = useState(leagueStats.draftType);
  const [eligibilityRule, setEligibilityRule] = useState(leagueStats.draftEligibilityRule ?? 'one_and_done');
  const [minAgeRequirement, setMinAgeRequirement] = useState<number | string>(leagueStats.minAgeRequirement ?? 19);
  const [minGamesRequirement, setMinGamesRequirement] = useState<number | string>(leagueStats.minGamesRequirement ?? 65);
  const [gamesPerSeason, setGamesPerSeason] = useState(leagueStats.gamesPerSeason ?? 82);
  const [divisionGames, setDivisionGames] = useState(leagueStats.divisionGames ?? 16);
  const [conferenceGames, setConferenceGames] = useState(leagueStats.conferenceGames ?? 36);
  
  // All-Star State
  const [allStarGameEnabled, setAllStarGameEnabled] = useState(leagueStats.allStarGameEnabled ?? true);
  const [allStarFormat, setAllStarFormat] = useState(leagueStats.allStarFormat ?? 'usa_vs_world');
  const [allStarTeams, setAllStarTeams] = useState(leagueStats.allStarTeams ?? 3);
  const [allStarMirrorLeagueRules, setAllStarMirrorLeagueRules] = useState(leagueStats.allStarMirrorLeagueRules ?? true);
  const [allStarDunkContest, setAllStarDunkContest] = useState(leagueStats.allStarDunkContest ?? true);
  const [allStarDunkContestPlayers, setAllStarDunkContestPlayers] = useState(leagueStats.allStarDunkContestPlayers ?? 4);
  const [allStarThreePointContest, setAllStarThreePointContest] = useState(leagueStats.allStarThreePointContest ?? true);
  const [allStarThreePointContestPlayers, setAllStarThreePointContestPlayers] = useState(leagueStats.allStarThreePointContestPlayers ?? 8);
  const [allStarShootingStars, setAllStarShootingStars] = useState(leagueStats.allStarShootingStars ?? true);
  const [allStarShootingStarsMode, setAllStarShootingStarsMode] = useState<'individual' | 'team'>(leagueStats.allStarShootingStarsMode ?? 'team');
  const [allStarShootingStarsTeams, setAllStarShootingStarsTeams] = useState(leagueStats.allStarShootingStarsTeams ?? 3);
  const [allStarShootingStarsPlayersPerTeam, setAllStarShootingStarsPlayersPerTeam] = useState(leagueStats.allStarShootingStarsPlayersPerTeam ?? 3);
  const [allStarShootingStarsTotalPlayers, setAllStarShootingStarsTotalPlayers] = useState(leagueStats.allStarShootingStarsTotalPlayers ?? 12);
  const [allStarSkillsChallenge, setAllStarSkillsChallenge] = useState(leagueStats.allStarSkillsChallenge ?? false);
  const [allStarSkillsChallengeMode, setAllStarSkillsChallengeMode] = useState<'individual' | 'team'>(leagueStats.allStarSkillsChallengeMode ?? 'team');
  const [allStarSkillsChallengeTeams, setAllStarSkillsChallengeTeams] = useState(leagueStats.allStarSkillsChallengeTeams ?? 4);
  const [allStarSkillsChallengePlayersPerTeam, setAllStarSkillsChallengePlayersPerTeam] = useState(leagueStats.allStarSkillsChallengePlayersPerTeam ?? 2);
  const [allStarSkillsChallengeTotalPlayers, setAllStarSkillsChallengeTotalPlayers] = useState(leagueStats.allStarSkillsChallengeTotalPlayers ?? 8);
  const [allStarHorse, setAllStarHorse] = useState(leagueStats.allStarHorse ?? false);
  const [allStarHorseParticipants, setAllStarHorseParticipants] = useState(leagueStats.allStarHorseParticipants ?? 8);
  const [allStarOneOnOneEnabled, setAllStarOneOnOneEnabled] = useState(leagueStats.allStarOneOnOneEnabled ?? false);
  const [allStarOneOnOneParticipants, setAllStarOneOnOneParticipants] = useState(leagueStats.allStarOneOnOneParticipants ?? 8);

  // Rising Stars & Celebrity Game
  const [risingStarsEnabled, setRisingStarsEnabled] = useState(leagueStats.risingStarsEnabled ?? true);
  const [risingStarsFormat, setRisingStarsFormat] = useState(leagueStats.risingStarsFormat ?? 'tournament');
  const [risingStarsMirrorLeagueRules, setRisingStarsMirrorLeagueRules] = useState(leagueStats.risingStarsMirrorLeagueRules ?? true);
  const [celebrityGameEnabled, setCelebrityGameEnabled] = useState(leagueStats.celebrityGameEnabled ?? true);
  const [celebrityGameMirrorLeagueRules, setCelebrityGameMirrorLeagueRules] = useState(leagueStats.celebrityGameMirrorLeagueRules ?? true);

  // All-Star Game Rules State
  const [allStarGameFormat, setAllStarGameFormat] = useState<'timed' | 'target_score'>(leagueStats.allStarGameFormat ?? 'timed');
  const [allStarQuarterLength, setAllStarQuarterLength] = useState(leagueStats.allStarQuarterLength ?? 12);
  const [allStarNumQuarters, setAllStarNumQuarters] = useState(leagueStats.allStarNumQuarters ?? 4);
  const [allStarOvertimeDuration, setAllStarOvertimeDuration] = useState(leagueStats.allStarOvertimeDuration ?? 5);
  const [allStarOvertimeTargetPoints, setAllStarOvertimeTargetPoints] = useState(leagueStats.allStarOvertimeTargetPoints ?? 7);
  const [allStarShootoutRounds, setAllStarShootoutRounds] = useState(leagueStats.allStarShootoutRounds ?? 3);
  const [allStarOvertimeType, setAllStarOvertimeType] = useState(leagueStats.allStarOvertimeType ?? 'standard');
  const [allStarMaxOvertimesEnabled, setAllStarMaxOvertimesEnabled] = useState(leagueStats.allStarMaxOvertimesEnabled ?? false);
  const [allStarMaxOvertimes, setAllStarMaxOvertimes] = useState(leagueStats.allStarMaxOvertimes ?? 3);
  const [allStarOvertimeTieBreaker, setAllStarOvertimeTieBreaker] = useState(leagueStats.allStarOvertimeTieBreaker ?? 'shootout');

  // Game Rules State
  const [gameFormat, setGameFormat] = useState<'timed' | 'target_score'>(leagueStats.gameFormat ?? 'timed');
  const [gameTargetScore, setGameTargetScore] = useState(leagueStats.gameTargetScore ?? 0);
  const [fourPointLine, setFourPointLine] = useState(leagueStats.fourPointLine ?? false);
  const [threePointLineEnabled, setThreePointLineEnabled] = useState(leagueStats.threePointLineEnabled ?? true);
  const [multiballCount, setMultiballCount] = useState(leagueStats.multiballCount ?? 1);
  const [foulOutLimit, setFoulOutLimit] = useState(leagueStats.foulOutLimit ?? 6);
  const [teamFoulPenalty, setTeamFoulPenalty] = useState(leagueStats.teamFoulPenalty ?? 5);
  const [quarterLength, setQuarterLength] = useState(leagueStats.quarterLength ?? 12);
  const [numQuarters, setNumQuarters] = useState(leagueStats.numQuarters ?? 4);
  const [overtimeDuration, setOvertimeDuration] = useState(leagueStats.overtimeDuration ?? 5);
  const [overtimeTargetPoints, setOvertimeTargetPoints] = useState(leagueStats.overtimeTargetPoints ?? 0);
  const [shootoutRounds, setShootoutRounds] = useState(leagueStats.shootoutRounds ?? 0);
  const [overtimeType, setOvertimeType] = useState(leagueStats.overtimeType ?? 'standard');
  const [maxTimeouts, setMaxTimeouts] = useState(leagueStats.maxTimeouts ?? 7);
  const [coachChallenges, setCoachChallenges] = useState(leagueStats.coachChallenges ?? true);
  const [maxCoachChallenges, setMaxCoachChallenges] = useState(leagueStats.maxCoachChallenges ?? 2);
  const [challengeReimbursed, setChallengeReimbursed] = useState(leagueStats.challengeReimbursed ?? true);

  // Timing Violations
  const [shotClockEnabled, setShotClockEnabled] = useState(leagueStats.shotClockEnabled ?? true);
  const [shotClockValue, setShotClockValue] = useState(leagueStats.shotClockValue ?? 24);
  const [backcourtTimerEnabled, setBackcourtTimerEnabled] = useState(leagueStats.backcourtTimerEnabled ?? true);
  const [backcourtTimerValue, setBackcourtTimerValue] = useState(leagueStats.backcourtTimerValue ?? 8);
  const [offensiveThreeSecondEnabled, setOffensiveThreeSecondEnabled] = useState(leagueStats.offensiveThreeSecondEnabled ?? true);
  const [offensiveThreeSecondValue, setOffensiveThreeSecondValue] = useState(leagueStats.offensiveThreeSecondValue ?? 3);
  const [defensiveThreeSecondEnabled, setDefensiveThreeSecondEnabled] = useState(leagueStats.defensiveThreeSecondEnabled ?? true);
  const [defensiveThreeSecondValue, setDefensiveThreeSecondValue] = useState(leagueStats.defensiveThreeSecondValue ?? 3);
  const [inboundTimerEnabled, setInboundTimerEnabled] = useState(leagueStats.inboundTimerEnabled ?? true);
  const [inboundTimerValue, setInboundTimerValue] = useState(leagueStats.inboundTimerValue ?? 5);
  const [backToBasketTimerEnabled, setBackToBasketTimerEnabled] = useState(leagueStats.backToBasketTimerEnabled ?? true);
  const [backToBasketTimerValue, setBackToBasketTimerValue] = useState(leagueStats.backToBasketTimerValue ?? 5);

  // Court Violations
  const [backcourtViolationEnabled, setBackcourtViolationEnabled] = useState(leagueStats.backcourtViolationEnabled ?? true);
  const [travelingEnabled, setTravelingEnabled] = useState(leagueStats.travelingEnabled ?? true);
  const [doubleDribbleEnabled, setDoubleDribbleEnabled] = useState(leagueStats.doubleDribbleEnabled ?? true);
  const [goaltendingEnabled, setGoaltendingEnabled] = useState(leagueStats.goaltendingEnabled ?? true);
  const [basketInterferenceEnabled, setBasketInterferenceEnabled] = useState(leagueStats.basketInterferenceEnabled ?? true);
  const [kickedBallEnabled, setKickedBallEnabled] = useState(leagueStats.kickedBallEnabled ?? true);

  // Fouls & Limits
  const [flagrantFoulPenaltyEnabled, setFlagrantFoulPenaltyEnabled] = useState(leagueStats.flagrantFoulPenaltyEnabled ?? true);
  const [clearPathFoulEnabled, setClearPathFoulEnabled] = useState(leagueStats.clearPathFoulEnabled ?? true);
  const [illegalScreenEnabled, setIllegalScreenEnabled] = useState(leagueStats.illegalScreenEnabled ?? true);
  const [overTheBackFoulEnabled, setOverTheBackFoulEnabled] = useState(leagueStats.overTheBackFoulEnabled ?? true);
  const [looseBallFoulEnabled, setLooseBallFoulEnabled] = useState(leagueStats.looseBallFoulEnabled ?? true);
  const [chargingEnabled, setChargingEnabled] = useState(leagueStats.chargingEnabled ?? true);

  // Overtime
  const [overtimeEnabled, setOvertimeEnabled] = useState(leagueStats.overtimeEnabled ?? true);
  const [maxOvertimesEnabled, setMaxOvertimesEnabled] = useState(leagueStats.maxOvertimesEnabled ?? false);
  const [maxOvertimes, setMaxOvertimes] = useState(leagueStats.maxOvertimes ?? 0);
  const [overtimeTieBreaker, setOvertimeTieBreaker] = useState(leagueStats.overtimeTieBreaker ?? 'sudden_death');

  // Personnel
  const [maxPlayersOnCourt, setMaxPlayersOnCourt] = useState(leagueStats.maxPlayersOnCourt ?? 5);
  const [substitutionLimitEnabled, setSubstitutionLimitEnabled] = useState(leagueStats.substitutionLimitEnabled ?? false);
  const [maxSubstitutions, setMaxSubstitutions] = useState(leagueStats.maxSubstitutions ?? 0);
  const [noDribbleRule, setNoDribbleRule] = useState(leagueStats.noDribbleRule ?? false);
  const [multiballEnabled, setMultiballEnabled] = useState(leagueStats.multiballEnabled ?? false);

  // Scoring
  const [threePointLineDistance, setThreePointLineDistance] = useState(leagueStats.threePointLineDistance ?? 23.75);
  const [fourPointLineDistance, setFourPointLineDistance] = useState(leagueStats.fourPointLineDistance ?? 0);
  const [dunkValue, setDunkValue] = useState(leagueStats.dunkValue ?? 2);
  const [midrangeValue, setMidrangeValue] = useState(leagueStats.midrangeValue ?? 2);
  const [heaveRuleEnabled, setHeaveRuleEnabled] = useState(leagueStats.heaveRuleEnabled ?? false);
  const [halfCourtShotValue, setHalfCourtShotValue] = useState(leagueStats.halfCourtShotValue ?? 3);
  const [clutchTimeoutLimit, setClutchTimeoutLimit] = useState(leagueStats.clutchTimeoutLimit ?? 2);
  const [handcheckingEnabled, setHandcheckingEnabled] = useState(leagueStats.handcheckingEnabled ?? false);
  const [illegalZoneDefenseEnabled, setIllegalZoneDefenseEnabled] = useState(leagueStats.illegalZoneDefenseEnabled ?? false);

  // New Rules
  const [outOfBoundsEnabled, setOutOfBoundsEnabled] = useState(leagueStats.outOfBoundsEnabled ?? true);
  const [freeThrowDistance, setFreeThrowDistance] = useState(leagueStats.freeThrowDistance ?? 15);
  const [rimHeight, setRimHeight] = useState(leagueStats.rimHeight ?? 10);
  const [ballWeight, setBallWeight] = useState(leagueStats.ballWeight ?? 1.4);
  const [startOfPossessionMethod, setStartOfPossessionMethod] = useState(leagueStats.startOfPossessionMethod ?? 'jump_ball');
  const [possessionPattern, setPossessionPattern] = useState(leagueStats.possessionPattern ?? 'nba');
  const [courtLength, setCourtLength] = useState(leagueStats.courtLength ?? 94);
  const [baselineLength, setBaselineLength] = useState(leagueStats.baselineLength ?? 50);
  const [keyWidth, setKeyWidth] = useState(leagueStats.keyWidth ?? 16);
  const [cornerThrowInEnabled, setCornerThrowInEnabled] = useState(leagueStats.cornerThrowInEnabled ?? false);
  const [techEjectionLimit, setTechEjectionLimit] = useState(leagueStats.techEjectionLimit ?? 2);
  const [flagrant1EjectionLimit, setFlagrant1EjectionLimit] = useState(leagueStats.flagrant1EjectionLimit ?? 2);
  const [flagrant2EjectionLimit, setFlagrant2EjectionLimit] = useState(leagueStats.flagrant2EjectionLimit ?? 1);
  const [fightingInstantEjection, setFightingInstantEjection] = useState(leagueStats.fightingInstantEjection ?? true);
  const [useYellowRedCards, setUseYellowRedCards] = useState(leagueStats.useYellowRedCards ?? false);
  const [shotClockResetOffensiveRebound, setShotClockResetOffensiveRebound] = useState(leagueStats.shotClockResetOffensiveRebound ?? 14);

  // Economy - Finances
  const [salaryCap, setSalaryCap] = useState(leagueStats.salaryCap ?? 154647000);
  const [salaryCapEnabled, setSalaryCapEnabled] = useState(leagueStats.salaryCapEnabled ?? true);
  const [salaryCapType, setSalaryCapType] = useState(leagueStats.salaryCapType ?? 'soft');
  const [minimumPayrollEnabled, setMinimumPayrollEnabled] = useState(leagueStats.minimumPayrollEnabled ?? true);
  const [minimumPayrollPercentage, setMinimumPayrollPercentage] = useState(leagueStats.minimumPayrollPercentage ?? 90);
  const [luxuryTaxEnabled, setLuxuryTaxEnabled] = useState(leagueStats.luxuryTaxEnabled ?? true);
  const [luxuryTaxThresholdPercentage, setLuxuryTaxThresholdPercentage] = useState(leagueStats.luxuryTaxThresholdPercentage ?? 121.5);
  const [apronsEnabled, setApronsEnabled] = useState(leagueStats.apronsEnabled ?? true);
  const [numberOfAprons, setNumberOfAprons] = useState(leagueStats.numberOfAprons ?? 2);
  const [firstApronPercentage, setFirstApronPercentage] = useState(leagueStats.firstApronPercentage ?? 126.7);
  const [secondApronPercentage, setSecondApronPercentage] = useState(leagueStats.secondApronPercentage ?? 134.4);

  // Economy - Teams
  const [twoWayContractsEnabled, setTwoWayContractsEnabled] = useState(leagueStats.twoWayContractsEnabled ?? true);
  const [nonGuaranteedContractsEnabled, setNonGuaranteedContractsEnabled] = useState(leagueStats.nonGuaranteedContractsEnabled ?? true);
  const [minPlayersPerTeam, setMinPlayersPerTeam] = useState(leagueStats.minPlayersPerTeam ?? 14);
  const [maxPlayersPerTeam, setMaxPlayersPerTeam] = useState(leagueStats.maxPlayersPerTeam ?? 17);
  const [maxStandardPlayersPerTeam, setMaxStandardPlayersPerTeam] = useState(leagueStats.maxStandardPlayersPerTeam ?? 15);
  const [maxTwoWayPlayersPerTeam, setMaxTwoWayPlayersPerTeam] = useState(leagueStats.maxTwoWayPlayersPerTeam ?? 3);
  const [maxTrainingCampRoster, setMaxTrainingCampRoster] = useState(leagueStats.maxTrainingCampRoster ?? 21);

  // Economy - Contracts
  const [minContractType, setMinContractType] = useState(leagueStats.minContractType ?? 'dynamic');
  const [minContractStaticAmount, setMinContractStaticAmount] = useState(leagueStats.minContractStaticAmount ?? 1.272870);
  const [maxContractType, setMaxContractType] = useState(leagueStats.maxContractType ?? 'service_tiered');
  const [maxContractStaticPercentage, setMaxContractStaticPercentage] = useState(leagueStats.maxContractStaticPercentage ?? 30);
  const [supermaxEnabled, setSupermaxEnabled] = useState(leagueStats.supermaxEnabled ?? true);
  const [supermaxPercentage, setSupermaxPercentage] = useState(leagueStats.supermaxPercentage ?? 35);
  const [supermaxMinYears, setSupermaxMinYears] = useState(leagueStats.supermaxMinYears ?? 8);
  const [rookieExtEnabled, setRookieExtEnabled] = useState(leagueStats.rookieExtEnabled ?? true);
  const [rookieExtPct, setRookieExtPct] = useState(leagueStats.rookieExtPct ?? 25);
  const [rookieExtRosePct, setRookieExtRosePct] = useState(leagueStats.rookieExtRosePct ?? 30);
  const [birdRightsEnabled, setBirdRightsEnabled] = useState(leagueStats.birdRightsEnabled ?? true);
  const [minContractLength, setMinContractLength] = useState(leagueStats.minContractLength ?? 1);
  const [maxContractLengthStandard, setMaxContractLengthStandard] = useState(leagueStats.maxContractLengthStandard ?? 4);
  const [maxContractLengthBird, setMaxContractLengthBird] = useState(leagueStats.maxContractLengthBird ?? 5);
  const [playerOptionsEnabled, setPlayerOptionsEnabled] = useState(leagueStats.playerOptionsEnabled ?? true);
  const [tenDayContractsEnabled, setTenDayContractsEnabled] = useState(leagueStats.tenDayContractsEnabled ?? true);

  // Economy - Cap Inflation
  const [inflationEnabled, setInflationEnabled] = useState(leagueStats.inflationEnabled ?? true);
  const [inflationMin, setInflationMin] = useState(leagueStats.inflationMin ?? 0);
  const [inflationMax, setInflationMax] = useState(leagueStats.inflationMax ?? 10);
  const [inflationAverage, setInflationAverage] = useState(leagueStats.inflationAverage ?? 5.5);
  const [inflationStdDev, setInflationStdDev] = useState(leagueStats.inflationStdDev ?? 2.0);

  // Economy - Exceptions (MLE / Biannual)
  const [mleEnabled, setMleEnabled] = useState(leagueStats.mleEnabled ?? true);
  const [roomMleAmount, setRoomMleAmount] = useState(leagueStats.roomMleAmount ?? 8_781_000);
  const [nonTaxpayerMleAmount, setNonTaxpayerMleAmount] = useState(leagueStats.nonTaxpayerMleAmount ?? 14_104_000);
  const [taxpayerMleAmount, setTaxpayerMleAmount] = useState(leagueStats.taxpayerMleAmount ?? 5_685_000);
  const [biannualEnabled, setBiannualEnabled] = useState(leagueStats.biannualEnabled ?? true);
  const [biannualAmount, setBiannualAmount] = useState(leagueStats.biannualAmount ?? 4_767_000);
  // MLE / Biannual as % of salary cap — when set these override the raw USD amounts so the exceptions scale with cap increases.
  const [roomMlePercentage, setRoomMlePercentage] = useState((leagueStats as any).roomMlePercentage ?? 5.68);
  const [nonTaxpayerMlePercentage, setNonTaxpayerMlePercentage] = useState((leagueStats as any).nonTaxpayerMlePercentage ?? 9.12);
  const [taxpayerMlePercentage, setTaxpayerMlePercentage] = useState((leagueStats as any).taxpayerMlePercentage ?? 3.68);
  const [biannualPercentage, setBiannualPercentage] = useState((leagueStats as any).biannualPercentage ?? 3.08);

  // Economy - Draft Picks
  const [tradableDraftPickSeasons, setTradableDraftPickSeasons] = useState(leagueStats.tradableDraftPickSeasons ?? 7);

  // Economy - Transaction Calendar (trade deadline + FA window)
  const [tradeDeadlineMonth, setTradeDeadlineMonth] = useState(leagueStats.tradeDeadlineMonth ?? 2);
  const [tradeDeadlineOrdinal, setTradeDeadlineOrdinal] = useState(leagueStats.tradeDeadlineOrdinal ?? 1);
  const [tradeDeadlineDayOfWeek, setTradeDeadlineDayOfWeek] = useState<'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'>(leagueStats.tradeDeadlineDayOfWeek ?? 'Thu');
  const [faStartMonth, setFaStartMonth] = useState(leagueStats.faStartMonth ?? 7);
  const [faStartDay, setFaStartDay] = useState(leagueStats.faStartDay ?? 1);
  const [faMoratoriumDays, setFaMoratoriumDays] = useState(leagueStats.faMoratoriumDays ?? 6);
  const [regularSeasonFAEnabled, setRegularSeasonFAEnabled] = useState(leagueStats.regularSeasonFAEnabled ?? true);
  const [postDeadlineMultiYearContracts, setPostDeadlineMultiYearContracts] = useState(leagueStats.postDeadlineMultiYearContracts ?? true);

  // Economy - Rookie Contracts
  const [rookieScaleType, setRookieScaleType] = useState(leagueStats.rookieScaleType ?? 'dynamic');
  const [rookieStaticAmount, setRookieStaticAmount] = useState(leagueStats.rookieStaticAmount ?? 5.0);
  const [rookieMaxContractPercentage, setRookieMaxContractPercentage] = useState(leagueStats.rookieMaxContractPercentage ?? 9);
  const [rookieScaleAppliesTo, setRookieScaleAppliesTo] = useState(leagueStats.rookieScaleAppliesTo ?? 'first_round');
  const [rookieContractLength, setRookieContractLength] = useState(leagueStats.rookieContractLength ?? 2);
  const [rookieTeamOptionsEnabled, setRookieTeamOptionsEnabled] = useState(leagueStats.rookieTeamOptionsEnabled ?? true);
  const [rookieTeamOptionYears, setRookieTeamOptionYears] = useState(leagueStats.rookieTeamOptionYears ?? 2);
  const [rookieRestrictedFreeAgentEligibility, setRookieRestrictedFreeAgentEligibility] = useState(leagueStats.rookieRestrictedFreeAgentEligibility ?? true);
  const [rookieContractCapException, setRookieContractCapException] = useState(leagueStats.rookieContractCapException ?? true);
  const [r2ContractsNonGuaranteed, setR2ContractsNonGuaranteed] = useState(leagueStats.r2ContractsNonGuaranteed ?? true);

  // Honors
  const [allNbaTeams, setAllNbaTeams] = useState(leagueStats.allNbaTeams ?? 3);
  const [allNbaPlayersPerTeam, setAllNbaPlayersPerTeam] = useState(leagueStats.allNbaPlayersPerTeam ?? 5);
  const [allDefenseTeams, setAllDefenseTeams] = useState(leagueStats.allDefenseTeams ?? 2);
  const [allDefensePlayersPerTeam, setAllDefensePlayersPerTeam] = useState(leagueStats.allDefensePlayersPerTeam ?? 5);
  const [allRookieTeams, setAllRookieTeams] = useState(leagueStats.allRookieTeams ?? 2);
  const [allRookiePlayersPerTeam, setAllRookiePlayersPerTeam] = useState(leagueStats.allRookiePlayersPerTeam ?? 5);
  const [positionlessAwards, setPositionlessAwards] = useState(leagueStats.positionlessAwards ?? false);

  const [hasConfigChanges, setHasConfigChanges] = useState(false);

  useEffect(() => {
    const isDifferent = 
        playIn !== leagueStats.playIn ||
        inSeasonTournament !== (leagueStats.inSeasonTournament ?? true) ||
        JSON.stringify(playoffFormat) !== JSON.stringify(leagueStats.numGamesPlayoffSeries) ||
        draftType !== leagueStats.draftType ||
        eligibilityRule !== (leagueStats.draftEligibilityRule ?? 'one_and_done') ||
        minAgeRequirement !== (leagueStats.minAgeRequirement ?? 19) ||
        minGamesRequirement !== (leagueStats.minGamesRequirement ?? 65) ||
        allStarGameEnabled !== (leagueStats.allStarGameEnabled ?? true) ||
        allStarFormat !== (leagueStats.allStarFormat ?? 'usa_vs_world') ||
        allStarTeams !== (leagueStats.allStarTeams ?? 3) ||
        allStarMirrorLeagueRules !== (leagueStats.allStarMirrorLeagueRules ?? true) ||
        allStarDunkContest !== (leagueStats.allStarDunkContest ?? true) ||
        allStarDunkContestPlayers !== (leagueStats.allStarDunkContestPlayers ?? 4) ||
        allStarThreePointContest !== (leagueStats.allStarThreePointContest ?? true) ||
        allStarThreePointContestPlayers !== (leagueStats.allStarThreePointContestPlayers ?? 8) ||
        allStarShootingStars !== (leagueStats.allStarShootingStars ?? true) ||
        allStarShootingStarsMode !== (leagueStats.allStarShootingStarsMode ?? 'team') ||
        allStarShootingStarsTeams !== (leagueStats.allStarShootingStarsTeams ?? 3) ||
        allStarShootingStarsPlayersPerTeam !== (leagueStats.allStarShootingStarsPlayersPerTeam ?? 3) ||
        allStarShootingStarsTotalPlayers !== (leagueStats.allStarShootingStarsTotalPlayers ?? 12) ||
        allStarSkillsChallenge !== (leagueStats.allStarSkillsChallenge ?? false) ||
        allStarSkillsChallengeMode !== (leagueStats.allStarSkillsChallengeMode ?? 'team') ||
        allStarSkillsChallengeTeams !== (leagueStats.allStarSkillsChallengeTeams ?? 4) ||
        allStarSkillsChallengePlayersPerTeam !== (leagueStats.allStarSkillsChallengePlayersPerTeam ?? 2) ||
        allStarSkillsChallengeTotalPlayers !== (leagueStats.allStarSkillsChallengeTotalPlayers ?? 8) ||
        allStarHorse !== (leagueStats.allStarHorse ?? false) ||
        allStarHorseParticipants !== (leagueStats.allStarHorseParticipants ?? 8) ||
        allStarOneOnOneEnabled !== (leagueStats.allStarOneOnOneEnabled ?? false) ||
        allStarOneOnOneParticipants !== (leagueStats.allStarOneOnOneParticipants ?? 8) ||
        risingStarsEnabled !== (leagueStats.risingStarsEnabled ?? true) ||
        risingStarsFormat !== (leagueStats.risingStarsFormat ?? 'tournament') ||
        risingStarsMirrorLeagueRules !== (leagueStats.risingStarsMirrorLeagueRules ?? true) ||
        celebrityGameEnabled !== (leagueStats.celebrityGameEnabled ?? true) ||
        celebrityGameMirrorLeagueRules !== (leagueStats.celebrityGameMirrorLeagueRules ?? true) ||
        allStarGameFormat !== (leagueStats.allStarGameFormat ?? 'timed') ||
        allStarQuarterLength !== (leagueStats.allStarQuarterLength ?? 12) ||
        allStarNumQuarters !== (leagueStats.allStarNumQuarters ?? 4) ||
        allStarOvertimeDuration !== (leagueStats.allStarOvertimeDuration ?? 5) ||
        allStarOvertimeTargetPoints !== (leagueStats.allStarOvertimeTargetPoints ?? 7) ||
        allStarShootoutRounds !== (leagueStats.allStarShootoutRounds ?? 3) ||
        allStarOvertimeType !== (leagueStats.allStarOvertimeType ?? 'standard') ||
        allStarMaxOvertimesEnabled !== (leagueStats.allStarMaxOvertimesEnabled ?? false) ||
        allStarMaxOvertimes !== (leagueStats.allStarMaxOvertimes ?? 3) ||
        allStarOvertimeTieBreaker !== (leagueStats.allStarOvertimeTieBreaker ?? 'shootout') ||
        gameFormat !== (leagueStats.gameFormat ?? 'timed') ||
        gameTargetScore !== (leagueStats.gameTargetScore ?? 0) ||
        fourPointLine !== (leagueStats.fourPointLine ?? false) ||
        foulOutLimit !== (leagueStats.foulOutLimit ?? 6) ||
        teamFoulPenalty !== (leagueStats.teamFoulPenalty ?? 5) ||
        quarterLength !== (leagueStats.quarterLength ?? 12) ||
        numQuarters !== (leagueStats.numQuarters ?? 4) ||
        overtimeDuration !== (leagueStats.overtimeDuration ?? 5) ||
        overtimeTargetPoints !== (leagueStats.overtimeTargetPoints ?? 0) ||
        shootoutRounds !== (leagueStats.shootoutRounds ?? 0) ||
        overtimeType !== (leagueStats.overtimeType ?? 'standard') ||
        maxTimeouts !== (leagueStats.maxTimeouts ?? 7) ||
        coachChallenges !== (leagueStats.coachChallenges ?? true) ||
        maxCoachChallenges !== (leagueStats.maxCoachChallenges ?? 2) ||
        challengeReimbursed !== (leagueStats.challengeReimbursed ?? true) ||
        shotClockEnabled !== (leagueStats.shotClockEnabled ?? true) ||
        shotClockValue !== (leagueStats.shotClockValue ?? 24) ||
        backcourtTimerEnabled !== (leagueStats.backcourtTimerEnabled ?? true) ||
        backcourtTimerValue !== (leagueStats.backcourtTimerValue ?? 8) ||
        offensiveThreeSecondEnabled !== (leagueStats.offensiveThreeSecondEnabled ?? true) ||
        offensiveThreeSecondValue !== (leagueStats.offensiveThreeSecondValue ?? 3) ||
        defensiveThreeSecondEnabled !== (leagueStats.defensiveThreeSecondEnabled ?? true) ||
        defensiveThreeSecondValue !== (leagueStats.defensiveThreeSecondValue ?? 3) ||
        inboundTimerEnabled !== (leagueStats.inboundTimerEnabled ?? true) ||
        inboundTimerValue !== (leagueStats.inboundTimerValue ?? 5) ||
        backToBasketTimerEnabled !== (leagueStats.backToBasketTimerEnabled ?? true) ||
        backToBasketTimerValue !== (leagueStats.backToBasketTimerValue ?? 5) ||
        backcourtViolationEnabled !== (leagueStats.backcourtViolationEnabled ?? true) ||
        travelingEnabled !== (leagueStats.travelingEnabled ?? true) ||
        doubleDribbleEnabled !== (leagueStats.doubleDribbleEnabled ?? true) ||
        goaltendingEnabled !== (leagueStats.goaltendingEnabled ?? true) ||
        basketInterferenceEnabled !== (leagueStats.basketInterferenceEnabled ?? true) ||
        kickedBallEnabled !== (leagueStats.kickedBallEnabled ?? true) ||
        flagrantFoulPenaltyEnabled !== (leagueStats.flagrantFoulPenaltyEnabled ?? true) ||
        clearPathFoulEnabled !== (leagueStats.clearPathFoulEnabled ?? true) ||
        illegalScreenEnabled !== (leagueStats.illegalScreenEnabled ?? true) ||
        overTheBackFoulEnabled !== (leagueStats.overTheBackFoulEnabled ?? true) ||
        looseBallFoulEnabled !== (leagueStats.looseBallFoulEnabled ?? true) ||
        chargingEnabled !== (leagueStats.chargingEnabled ?? true) ||
        overtimeEnabled !== (leagueStats.overtimeEnabled ?? true) ||
        maxOvertimesEnabled !== (leagueStats.maxOvertimesEnabled ?? false) ||
        maxOvertimes !== (leagueStats.maxOvertimes ?? 0) ||
        overtimeTieBreaker !== (leagueStats.overtimeTieBreaker ?? 'sudden_death') ||
        maxPlayersOnCourt !== (leagueStats.maxPlayersOnCourt ?? 5) ||
        substitutionLimitEnabled !== (leagueStats.substitutionLimitEnabled ?? false) ||
        maxSubstitutions !== (leagueStats.maxSubstitutions ?? 0) ||
        noDribbleRule !== (leagueStats.noDribbleRule ?? false) ||
        multiballEnabled !== (leagueStats.multiballEnabled ?? false) ||
        multiballCount !== (leagueStats.multiballCount ?? 1) ||
        threePointLineDistance !== (leagueStats.threePointLineDistance ?? 23.75) ||
        fourPointLineDistance !== (leagueStats.fourPointLineDistance ?? 0) ||
        dunkValue !== (leagueStats.dunkValue ?? 2) ||
        midrangeValue !== (leagueStats.midrangeValue ?? 2) ||
        heaveRuleEnabled !== (leagueStats.heaveRuleEnabled ?? false) ||
        halfCourtShotValue !== (leagueStats.halfCourtShotValue ?? 3) ||
        clutchTimeoutLimit !== (leagueStats.clutchTimeoutLimit ?? 2) ||
        handcheckingEnabled !== (leagueStats.handcheckingEnabled ?? false) ||
        illegalZoneDefenseEnabled !== (leagueStats.illegalZoneDefenseEnabled ?? false) ||
        salaryCap !== (leagueStats.salaryCap ?? 154647000) ||
        salaryCapEnabled !== (leagueStats.salaryCapEnabled ?? true) ||
        salaryCapType !== (leagueStats.salaryCapType ?? 'soft') ||
        minimumPayrollEnabled !== (leagueStats.minimumPayrollEnabled ?? true) ||
        minimumPayrollPercentage !== (leagueStats.minimumPayrollPercentage ?? 90) ||
        luxuryTaxEnabled !== (leagueStats.luxuryTaxEnabled ?? true) ||
        luxuryTaxThresholdPercentage !== (leagueStats.luxuryTaxThresholdPercentage ?? 121.5) ||
        apronsEnabled !== (leagueStats.apronsEnabled ?? true) ||
        numberOfAprons !== (leagueStats.numberOfAprons ?? 2) ||
        firstApronPercentage !== (leagueStats.firstApronPercentage ?? 126.7) ||
        secondApronPercentage !== (leagueStats.secondApronPercentage ?? 134.4) ||
        twoWayContractsEnabled !== (leagueStats.twoWayContractsEnabled ?? true) ||
        nonGuaranteedContractsEnabled !== (leagueStats.nonGuaranteedContractsEnabled ?? true) ||
        minPlayersPerTeam !== (leagueStats.minPlayersPerTeam ?? 14) ||
        maxPlayersPerTeam !== (leagueStats.maxPlayersPerTeam ?? 17) ||
        maxStandardPlayersPerTeam !== (leagueStats.maxStandardPlayersPerTeam ?? 15) ||
        maxTwoWayPlayersPerTeam !== (leagueStats.maxTwoWayPlayersPerTeam ?? 3) ||
        maxTrainingCampRoster !== (leagueStats.maxTrainingCampRoster ?? 21) ||
        minContractType !== (leagueStats.minContractType ?? 'dynamic') ||
        minContractStaticAmount !== (leagueStats.minContractStaticAmount ?? 1.272870) ||
        maxContractType !== (leagueStats.maxContractType ?? 'service_tiered') ||
        maxContractStaticPercentage !== (leagueStats.maxContractStaticPercentage ?? 30) ||
        supermaxEnabled !== (leagueStats.supermaxEnabled ?? true) ||
        supermaxPercentage !== (leagueStats.supermaxPercentage ?? 35) ||
        supermaxMinYears !== (leagueStats.supermaxMinYears ?? 8) ||
        rookieExtEnabled !== (leagueStats.rookieExtEnabled ?? true) ||
        rookieExtPct !== (leagueStats.rookieExtPct ?? 25) ||
        rookieExtRosePct !== (leagueStats.rookieExtRosePct ?? 30) ||
        birdRightsEnabled !== (leagueStats.birdRightsEnabled ?? true) ||
        minContractLength !== (leagueStats.minContractLength ?? 1) ||
        maxContractLengthStandard !== (leagueStats.maxContractLengthStandard ?? 4) ||
        maxContractLengthBird !== (leagueStats.maxContractLengthBird ?? 5) ||
        playerOptionsEnabled !== (leagueStats.playerOptionsEnabled ?? true) ||
        tenDayContractsEnabled !== (leagueStats.tenDayContractsEnabled ?? true) ||
        inflationEnabled !== (leagueStats.inflationEnabled ?? true) ||
        inflationMin !== (leagueStats.inflationMin ?? 0) ||
        inflationMax !== (leagueStats.inflationMax ?? 10) ||
        inflationAverage !== (leagueStats.inflationAverage ?? 5.5) ||
        inflationStdDev !== (leagueStats.inflationStdDev ?? 2.0) ||
        mleEnabled !== (leagueStats.mleEnabled ?? true) ||
        roomMleAmount !== (leagueStats.roomMleAmount ?? 8_781_000) ||
        nonTaxpayerMleAmount !== (leagueStats.nonTaxpayerMleAmount ?? 14_104_000) ||
        taxpayerMleAmount !== (leagueStats.taxpayerMleAmount ?? 5_685_000) ||
        biannualEnabled !== (leagueStats.biannualEnabled ?? true) ||
        biannualAmount !== (leagueStats.biannualAmount ?? 4_767_000) ||
        tradableDraftPickSeasons !== (leagueStats.tradableDraftPickSeasons ?? 7) ||
        tradeDeadlineMonth !== (leagueStats.tradeDeadlineMonth ?? 2) ||
        tradeDeadlineOrdinal !== (leagueStats.tradeDeadlineOrdinal ?? 1) ||
        tradeDeadlineDayOfWeek !== (leagueStats.tradeDeadlineDayOfWeek ?? 'Thu') ||
        faStartMonth !== (leagueStats.faStartMonth ?? 7) ||
        faStartDay !== (leagueStats.faStartDay ?? 1) ||
        faMoratoriumDays !== (leagueStats.faMoratoriumDays ?? 6) ||
        regularSeasonFAEnabled !== (leagueStats.regularSeasonFAEnabled ?? true) ||
        postDeadlineMultiYearContracts !== (leagueStats.postDeadlineMultiYearContracts ?? true) ||
        rookieScaleType !== (leagueStats.rookieScaleType ?? 'dynamic') ||
        rookieStaticAmount !== (leagueStats.rookieStaticAmount ?? 5.0) ||
        rookieMaxContractPercentage !== (leagueStats.rookieMaxContractPercentage ?? 9) ||
        rookieScaleAppliesTo !== (leagueStats.rookieScaleAppliesTo ?? 'first_round') ||
        rookieContractLength !== (leagueStats.rookieContractLength ?? 2) ||
        rookieTeamOptionsEnabled !== (leagueStats.rookieTeamOptionsEnabled ?? true) ||
        rookieTeamOptionYears !== (leagueStats.rookieTeamOptionYears ?? 2) ||
        rookieRestrictedFreeAgentEligibility !== (leagueStats.rookieRestrictedFreeAgentEligibility ?? true) ||
        rookieContractCapException !== (leagueStats.rookieContractCapException ?? true) ||
        r2ContractsNonGuaranteed !== (leagueStats.r2ContractsNonGuaranteed ?? true) ||
        allNbaTeams !== (leagueStats.allNbaTeams ?? 3) ||
        allNbaPlayersPerTeam !== (leagueStats.allNbaPlayersPerTeam ?? 5) ||
        allDefenseTeams !== (leagueStats.allDefenseTeams ?? 2) ||
        allDefensePlayersPerTeam !== (leagueStats.allDefensePlayersPerTeam ?? 5) ||
        allRookieTeams !== (leagueStats.allRookieTeams ?? 2) ||
        allRookiePlayersPerTeam !== (leagueStats.allRookiePlayersPerTeam ?? 5) ||
        positionlessAwards !== (leagueStats.positionlessAwards ?? false) ||
        eligibilityRule !== (leagueStats.draftEligibilityRule ?? 'one_and_done') ||
        outOfBoundsEnabled !== (leagueStats.outOfBoundsEnabled ?? true) ||
        freeThrowDistance !== (leagueStats.freeThrowDistance ?? 15) ||
        rimHeight !== (leagueStats.rimHeight ?? 10) ||
        ballWeight !== (leagueStats.ballWeight ?? 1.4) ||
        startOfPossessionMethod !== (leagueStats.startOfPossessionMethod ?? 'jump_ball') ||
        possessionPattern !== (leagueStats.possessionPattern ?? 'nba') ||
        courtLength !== (leagueStats.courtLength ?? 94) ||
        baselineLength !== (leagueStats.baselineLength ?? 50) ||
        keyWidth !== (leagueStats.keyWidth ?? 16) ||
        cornerThrowInEnabled !== (leagueStats.cornerThrowInEnabled ?? false) ||
        techEjectionLimit !== (leagueStats.techEjectionLimit ?? 2) ||
        flagrant1EjectionLimit !== (leagueStats.flagrant1EjectionLimit ?? 2) ||
        flagrant2EjectionLimit !== (leagueStats.flagrant2EjectionLimit ?? 1) ||
        fightingInstantEjection !== (leagueStats.fightingInstantEjection ?? true) ||
        useYellowRedCards !== (leagueStats.useYellowRedCards ?? false) ||
        shotClockResetOffensiveRebound !== (leagueStats.shotClockResetOffensiveRebound ?? 14);
    
    setHasConfigChanges(isDifferent);
  }, [playIn, inSeasonTournament, playoffFormat, draftType, eligibilityRule, minAgeRequirement, minGamesRequirement, allStarGameEnabled, allStarFormat, allStarTeams, allStarMirrorLeagueRules, allStarDunkContest, allStarDunkContestPlayers, allStarThreePointContest, allStarThreePointContestPlayers, allStarShootingStars, allStarShootingStarsMode, allStarShootingStarsTeams, allStarShootingStarsPlayersPerTeam, allStarShootingStarsTotalPlayers, allStarSkillsChallenge, allStarSkillsChallengeMode, allStarSkillsChallengeTeams, allStarSkillsChallengePlayersPerTeam, allStarSkillsChallengeTotalPlayers, allStarHorse, allStarHorseParticipants, allStarOneOnOneEnabled, allStarOneOnOneParticipants, risingStarsEnabled, risingStarsFormat, risingStarsMirrorLeagueRules, celebrityGameEnabled, celebrityGameMirrorLeagueRules, allStarGameFormat, allStarQuarterLength, allStarNumQuarters, allStarOvertimeDuration, allStarOvertimeTargetPoints, allStarShootoutRounds, allStarOvertimeType, allStarMaxOvertimesEnabled, allStarMaxOvertimes, allStarOvertimeTieBreaker, gameFormat, gameTargetScore, fourPointLine, foulOutLimit, teamFoulPenalty, quarterLength, numQuarters, overtimeDuration, overtimeTargetPoints, shootoutRounds, overtimeType, maxTimeouts, coachChallenges, maxCoachChallenges, challengeReimbursed, shotClockEnabled, shotClockValue, backcourtTimerEnabled, backcourtTimerValue, offensiveThreeSecondEnabled, offensiveThreeSecondValue, defensiveThreeSecondEnabled, defensiveThreeSecondValue, inboundTimerEnabled, inboundTimerValue, backToBasketTimerEnabled, backToBasketTimerValue, backcourtViolationEnabled, travelingEnabled, doubleDribbleEnabled, goaltendingEnabled, basketInterferenceEnabled, kickedBallEnabled, flagrantFoulPenaltyEnabled, clearPathFoulEnabled, illegalScreenEnabled, overTheBackFoulEnabled, looseBallFoulEnabled, chargingEnabled, overtimeEnabled, maxOvertimesEnabled, maxOvertimes, overtimeTieBreaker, maxPlayersOnCourt, substitutionLimitEnabled, maxSubstitutions, noDribbleRule, multiballEnabled, multiballCount, threePointLineDistance, fourPointLineDistance, dunkValue, midrangeValue, heaveRuleEnabled, halfCourtShotValue, clutchTimeoutLimit, salaryCap, salaryCapEnabled, salaryCapType, minimumPayrollEnabled, minimumPayrollPercentage, luxuryTaxEnabled, luxuryTaxThresholdPercentage, apronsEnabled, numberOfAprons, firstApronPercentage, secondApronPercentage, twoWayContractsEnabled, minPlayersPerTeam, maxPlayersPerTeam, maxStandardPlayersPerTeam, maxTwoWayPlayersPerTeam, minContractType, minContractStaticAmount, maxContractType, maxContractStaticPercentage, supermaxEnabled, supermaxPercentage, birdRightsEnabled, minContractLength, maxContractLengthStandard, maxContractLengthBird, playerOptionsEnabled, tenDayContractsEnabled, inflationEnabled, inflationMin, inflationMax, inflationAverage, inflationStdDev, mleEnabled, roomMleAmount, nonTaxpayerMleAmount, taxpayerMleAmount, biannualEnabled, biannualAmount, tradableDraftPickSeasons, tradeDeadlineMonth, tradeDeadlineOrdinal, tradeDeadlineDayOfWeek, faStartMonth, faStartDay, faMoratoriumDays, regularSeasonFAEnabled, postDeadlineMultiYearContracts, rookieScaleType, rookieStaticAmount, rookieMaxContractPercentage, rookieScaleAppliesTo, rookieContractLength, rookieTeamOptionsEnabled, rookieTeamOptionYears, rookieRestrictedFreeAgentEligibility, rookieContractCapException, allNbaTeams, allNbaPlayersPerTeam, allDefenseTeams, allDefensePlayersPerTeam, allRookieTeams, allRookiePlayersPerTeam, positionlessAwards, leagueStats, handcheckingEnabled, illegalZoneDefenseEnabled, outOfBoundsEnabled, freeThrowDistance, rimHeight, ballWeight, startOfPossessionMethod, possessionPattern, courtLength, baselineLength, keyWidth, cornerThrowInEnabled, techEjectionLimit, flagrant1EjectionLimit, flagrant2EjectionLimit, fightingInstantEjection, useYellowRedCards, shotClockResetOffensiveRebound]);

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
        const cleanedFormat = playoffFormat.map(val => {
            let num = typeof val === 'string' ? parseInt(val, 10) : val;
            if (isNaN(num) || num < 1) num = 1;
            if (num % 2 === 0) num += 1;
            return num;
        });

        const cleanedMinGames = typeof minGamesRequirement === 'string' ? parseInt(minGamesRequirement, 10) : minGamesRequirement;
        const cleanedMinAge = typeof minAgeRequirement === 'string' ? parseInt(minAgeRequirement, 10) : minAgeRequirement;

        const changes: string[] = [];
        if (playIn !== leagueStats.playIn) changes.push(`Play-In Tournament ${playIn ? 'enabled' : 'disabled'}`);
        if (inSeasonTournament !== (leagueStats.inSeasonTournament ?? true)) changes.push(`In-Season Tournament ${inSeasonTournament ? 'enabled' : 'disabled'}`);
        if (JSON.stringify(cleanedFormat) !== JSON.stringify(leagueStats.numGamesPlayoffSeries)) changes.push(`Playoff series format changed to ${cleanedFormat.join('-')}`);
        if (draftType !== leagueStats.draftType) changes.push(`Draft format changed to ${draftType}`);
        if (eligibilityRule !== (leagueStats.draftEligibilityRule ?? 'one_and_done')) changes.push(`Draft eligibility rule changed to ${eligibilityRule}`);
        if (cleanedMinAge !== (leagueStats.minAgeRequirement ?? 19)) changes.push(`Minimum age requirement set to ${cleanedMinAge}`);
        if (cleanedMinGames !== (leagueStats.minGamesRequirement ?? 65)) changes.push(`Minimum games for awards set to ${cleanedMinGames}`);
        if (allStarFormat !== (leagueStats.allStarFormat ?? 'usa_vs_world')) changes.push(`All-Star Game format changed to ${allStarFormat}`);
        if (allStarTeams !== (leagueStats.allStarTeams ?? 3)) changes.push(`All-Star teams changed to ${allStarTeams}`);
        if (risingStarsEnabled !== (leagueStats.risingStarsEnabled ?? true)) changes.push(`Rising Stars Game ${risingStarsEnabled ? 'enabled' : 'disabled'}`);
        if (risingStarsFormat !== (leagueStats.risingStarsFormat ?? 'tournament')) changes.push(`Rising Stars format changed to ${risingStarsFormat}`);
        if (allStarOneOnOneEnabled !== (leagueStats.allStarOneOnOneEnabled ?? false)) changes.push(`All-Star 1v1 Tournament ${allStarOneOnOneEnabled ? 'enabled' : 'disabled'}`);
        if (allStarHorse !== (leagueStats.allStarHorse ?? false)) changes.push(`All-Star HORSE Tournament ${allStarHorse ? 'enabled' : 'disabled'}`);
        if (celebrityGameEnabled !== (leagueStats.celebrityGameEnabled ?? true)) changes.push(`Celebrity Game ${celebrityGameEnabled ? 'enabled' : 'disabled'}`);
        if (gameFormat !== (leagueStats.gameFormat ?? 'timed')) changes.push(`Game format changed to ${gameFormat}`);
        if (fourPointLine !== (leagueStats.fourPointLine ?? false)) changes.push(`4-Point Line ${fourPointLine ? 'enabled' : 'disabled'}`);
        if (foulOutLimit !== (leagueStats.foulOutLimit ?? 6)) changes.push(`Foul Out Limit changed to ${foulOutLimit}`);
        if (quarterLength !== (leagueStats.quarterLength ?? 12)) changes.push(`Quarter Length changed to ${quarterLength} mins`);
        if (numQuarters !== (leagueStats.numQuarters ?? 4)) changes.push(`Number of Quarters changed to ${numQuarters}`);
        if (overtimeType !== (leagueStats.overtimeType ?? 'standard')) changes.push(`Overtime Type changed to ${overtimeType}`);
        if (overtimeEnabled !== (leagueStats.overtimeEnabled ?? true)) changes.push(`Overtime ${overtimeEnabled ? 'enabled' : 'disabled'}`);
        if (shotClockValue !== (leagueStats.shotClockValue ?? 24)) changes.push(`Shot Clock changed to ${shotClockValue}s`);
        if (threePointLineDistance !== (leagueStats.threePointLineDistance ?? 23.75)) changes.push(`3PT Distance changed to ${threePointLineDistance}ft`);
        if (clutchTimeoutLimit !== (leagueStats.clutchTimeoutLimit ?? 2)) changes.push(`Clutch Timeout Limit changed to ${clutchTimeoutLimit}`);
        if (shotClockEnabled !== (leagueStats.shotClockEnabled ?? true)) changes.push(`Shot Clock ${shotClockEnabled ? 'enabled' : 'disabled'}`);
        if (backcourtTimerEnabled !== (leagueStats.backcourtTimerEnabled ?? true)) changes.push(`Backcourt Timer ${backcourtTimerEnabled ? 'enabled' : 'disabled'}`);
        if (offensiveThreeSecondEnabled !== (leagueStats.offensiveThreeSecondEnabled ?? true)) changes.push(`Offensive 3-Seconds ${offensiveThreeSecondEnabled ? 'enabled' : 'disabled'}`);
        if (defensiveThreeSecondEnabled !== (leagueStats.defensiveThreeSecondEnabled ?? true)) changes.push(`Defensive 3-Seconds ${defensiveThreeSecondEnabled ? 'enabled' : 'disabled'}`);
        if (inboundTimerEnabled !== (leagueStats.inboundTimerEnabled ?? true)) changes.push(`Inbound Timer ${inboundTimerEnabled ? 'enabled' : 'disabled'}`);
        if (backToBasketTimerEnabled !== (leagueStats.backToBasketTimerEnabled ?? true)) changes.push(`Back-to-Basket Timer ${backToBasketTimerEnabled ? 'enabled' : 'disabled'}`);
        if (backcourtViolationEnabled !== (leagueStats.backcourtViolationEnabled ?? true)) changes.push(`Backcourt Violation ${backcourtViolationEnabled ? 'enabled' : 'disabled'}`);
        if (travelingEnabled !== (leagueStats.travelingEnabled ?? true)) changes.push(`Traveling ${travelingEnabled ? 'enabled' : 'disabled'}`);
        if (doubleDribbleEnabled !== (leagueStats.doubleDribbleEnabled ?? true)) changes.push(`Double Dribble ${doubleDribbleEnabled ? 'enabled' : 'disabled'}`);
        if (goaltendingEnabled !== (leagueStats.goaltendingEnabled ?? true)) changes.push(`Goaltending ${goaltendingEnabled ? 'enabled' : 'disabled'}`);
        if (basketInterferenceEnabled !== (leagueStats.basketInterferenceEnabled ?? true)) changes.push(`Basket Interference ${basketInterferenceEnabled ? 'enabled' : 'disabled'}`);
        if (kickedBallEnabled !== (leagueStats.kickedBallEnabled ?? true)) changes.push(`Kicked Ball ${kickedBallEnabled ? 'enabled' : 'disabled'}`);
        if (flagrantFoulPenaltyEnabled !== (leagueStats.flagrantFoulPenaltyEnabled ?? true)) changes.push(`Flagrant Foul Penalty ${flagrantFoulPenaltyEnabled ? 'enabled' : 'disabled'}`);
        if (clearPathFoulEnabled !== (leagueStats.clearPathFoulEnabled ?? true)) changes.push(`Clear Path Foul ${clearPathFoulEnabled ? 'enabled' : 'disabled'}`);
        if (illegalScreenEnabled !== (leagueStats.illegalScreenEnabled ?? true)) changes.push(`Illegal Screen ${illegalScreenEnabled ? 'enabled' : 'disabled'}`);
        if (overTheBackFoulEnabled !== (leagueStats.overTheBackFoulEnabled ?? true)) changes.push(`Over-the-Back Foul ${overTheBackFoulEnabled ? 'enabled' : 'disabled'}`);
        if (looseBallFoulEnabled !== (leagueStats.looseBallFoulEnabled ?? true)) changes.push(`Loose Ball Foul ${looseBallFoulEnabled ? 'enabled' : 'disabled'}`);
        if (chargingEnabled !== (leagueStats.chargingEnabled ?? true)) changes.push(`Charging/Blocking ${chargingEnabled ? 'enabled' : 'disabled'}`);
        if (coachChallenges !== (leagueStats.coachChallenges ?? true)) changes.push(`Coach Challenges ${coachChallenges ? 'enabled' : 'disabled'}`);
        if (heaveRuleEnabled !== (leagueStats.heaveRuleEnabled ?? true)) changes.push(`Heave Rule ${heaveRuleEnabled ? 'enabled' : 'disabled'}`);
        if (handcheckingEnabled !== (leagueStats.handcheckingEnabled ?? false)) changes.push(`Handchecking ${handcheckingEnabled ? 'enabled' : 'disabled'}`);
        if (illegalZoneDefenseEnabled !== (leagueStats.illegalZoneDefenseEnabled ?? false)) changes.push(`Illegal Zone Defense ${illegalZoneDefenseEnabled ? 'enabled' : 'disabled'}`);
        if (outOfBoundsEnabled !== (leagueStats.outOfBoundsEnabled ?? true)) changes.push(`Out of Bounds ${outOfBoundsEnabled ? 'enabled' : 'disabled'}`);
        if (freeThrowDistance !== (leagueStats.freeThrowDistance ?? 15)) changes.push(`Free Throw Distance set to ${freeThrowDistance}ft`);
        if (rimHeight !== (leagueStats.rimHeight ?? 10)) changes.push(`Rim Height set to ${rimHeight}ft`);
        if (ballWeight !== (leagueStats.ballWeight ?? 1.4)) changes.push(`Ball Weight set to ${ballWeight} lbs`);
        if (startOfPossessionMethod !== (leagueStats.startOfPossessionMethod ?? 'jump_ball')) changes.push(`Start of Possession Method changed to ${startOfPossessionMethod}`);
        if (possessionPattern !== (leagueStats.possessionPattern ?? 'nba')) changes.push(`Possession Pattern changed to ${possessionPattern}`);
        if (courtLength !== (leagueStats.courtLength ?? 94)) changes.push(`Court Length set to ${courtLength}ft`);
        if (baselineLength !== (leagueStats.baselineLength ?? 50)) changes.push(`Baseline Length set to ${baselineLength}ft`);
        if (keyWidth !== (leagueStats.keyWidth ?? 16)) changes.push(`Key Width set to ${keyWidth}ft`);
        if (cornerThrowInEnabled !== (leagueStats.cornerThrowInEnabled ?? false)) changes.push(`Corner Throw-In ${cornerThrowInEnabled ? 'enabled' : 'disabled'}`);
        if (techEjectionLimit !== (leagueStats.techEjectionLimit ?? 2)) changes.push(`Technical Foul Ejection Limit set to ${techEjectionLimit}`);
        if (flagrant1EjectionLimit !== (leagueStats.flagrant1EjectionLimit ?? 2)) changes.push(`Flagrant 1 Ejection Limit set to ${flagrant1EjectionLimit}`);
        if (flagrant2EjectionLimit !== (leagueStats.flagrant2EjectionLimit ?? 1)) changes.push(`Flagrant 2 Ejection Limit set to ${flagrant2EjectionLimit}`);
        if (fightingInstantEjection !== (leagueStats.fightingInstantEjection ?? true)) changes.push(`Fighting Instant Ejection ${fightingInstantEjection ? 'enabled' : 'disabled'}`);
        if (useYellowRedCards !== (leagueStats.useYellowRedCards ?? false)) changes.push(`Yellow/Red Card System ${useYellowRedCards ? 'enabled' : 'disabled'}`);
        if (shotClockResetOffensiveRebound !== (leagueStats.shotClockResetOffensiveRebound ?? 14)) changes.push(`Shot Clock Reset (Offensive Rebound) set to ${shotClockResetOffensiveRebound}s`);

        // Economy Changes
        if (salaryCapEnabled !== (leagueStats.salaryCapEnabled ?? true)) changes.push(`Salary Cap ${salaryCapEnabled ? 'enabled' : 'disabled'}`);
        if (salaryCap !== (leagueStats.salaryCap ?? 154647000)) changes.push(`Salary Cap set to $${(salaryCap / 1000000).toFixed(2)}M`);
        if (salaryCapType !== (leagueStats.salaryCapType ?? 'soft')) changes.push(`Salary Cap Type changed to ${salaryCapType}`);
        if (minimumPayrollEnabled !== (leagueStats.minimumPayrollEnabled ?? true)) changes.push(`Minimum Payroll ${minimumPayrollEnabled ? 'enabled' : 'disabled'}`);
        if (minimumPayrollPercentage !== (leagueStats.minimumPayrollPercentage ?? 90)) changes.push(`Minimum Payroll set to ${minimumPayrollPercentage}% of cap`);
        if (luxuryTaxEnabled !== (leagueStats.luxuryTaxEnabled ?? true)) changes.push(`Luxury Tax ${luxuryTaxEnabled ? 'enabled' : 'disabled'}`);
        if (luxuryTaxThresholdPercentage !== (leagueStats.luxuryTaxThresholdPercentage ?? 121.5)) changes.push(`Luxury Tax Threshold set to ${luxuryTaxThresholdPercentage}% of cap`);
        if (apronsEnabled !== (leagueStats.apronsEnabled ?? true)) changes.push(`Aprons ${apronsEnabled ? 'enabled' : 'disabled'}`);
        if (numberOfAprons !== (leagueStats.numberOfAprons ?? 2)) changes.push(`Number of Aprons set to ${numberOfAprons}`);
        if (firstApronPercentage !== (leagueStats.firstApronPercentage ?? 126.7)) changes.push(`First Apron set to ${firstApronPercentage}% of cap`);
        if (secondApronPercentage !== (leagueStats.secondApronPercentage ?? 134.4)) changes.push(`Second Apron set to ${secondApronPercentage}% of cap`);
        if (twoWayContractsEnabled !== (leagueStats.twoWayContractsEnabled ?? true)) changes.push(`Two-Way Contracts ${twoWayContractsEnabled ? 'enabled' : 'disabled'}`);
        if (nonGuaranteedContractsEnabled !== (leagueStats.nonGuaranteedContractsEnabled ?? true)) changes.push(`Non-Guaranteed Contracts ${nonGuaranteedContractsEnabled ? 'enabled' : 'disabled'}`);
        if (minPlayersPerTeam !== (leagueStats.minPlayersPerTeam ?? 14)) changes.push(`Minimum Players Per Team set to ${minPlayersPerTeam}`);
        if (maxPlayersPerTeam !== (leagueStats.maxPlayersPerTeam ?? 15)) changes.push(`Max Players Per Team set to ${maxPlayersPerTeam}`);
        if (maxStandardPlayersPerTeam !== (leagueStats.maxStandardPlayersPerTeam ?? 15)) changes.push(`Max Standard Players Per Team set to ${maxStandardPlayersPerTeam}`);
        if (maxTwoWayPlayersPerTeam !== (leagueStats.maxTwoWayPlayersPerTeam ?? 3)) changes.push(`Max Two-Way Players Per Team set to ${maxTwoWayPlayersPerTeam}`);
        if (maxTrainingCampRoster !== (leagueStats.maxTrainingCampRoster ?? 21)) changes.push(`Max Training Camp Roster set to ${maxTrainingCampRoster}`);
        if (minContractType !== (leagueStats.minContractType ?? 'dynamic')) changes.push(`Minimum Contract Type changed to ${minContractType}`);
        if (minContractStaticAmount !== (leagueStats.minContractStaticAmount ?? 1.16)) changes.push(`Minimum Contract Amount set to $${minContractStaticAmount}M`);
        if (maxContractType !== (leagueStats.maxContractType ?? 'service_tiered')) changes.push(`Maximum Contract Type changed to ${maxContractType}`);
        if (maxContractStaticPercentage !== (leagueStats.maxContractStaticPercentage ?? 25)) changes.push(`Maximum Contract Percentage set to ${maxContractStaticPercentage}%`);
        if (supermaxEnabled !== (leagueStats.supermaxEnabled ?? true)) changes.push(`Supermax Contracts ${supermaxEnabled ? 'enabled' : 'disabled'}`);
        if (supermaxPercentage !== (leagueStats.supermaxPercentage ?? 35)) changes.push(`Supermax Percentage set to ${supermaxPercentage}%`);
        if (supermaxMinYears !== (leagueStats.supermaxMinYears ?? 8)) changes.push(`Supermax Min Years of Service set to ${supermaxMinYears}`);
        if (rookieExtEnabled !== (leagueStats.rookieExtEnabled ?? true)) changes.push(`Rookie Extensions ${rookieExtEnabled ? 'enabled' : 'disabled'}`);
        if (rookieExtPct !== (leagueStats.rookieExtPct ?? 25)) changes.push(`Rookie Ext Standard % set to ${rookieExtPct}%`);
        if (rookieExtRosePct !== (leagueStats.rookieExtRosePct ?? 30)) changes.push(`Rookie Ext Rose Rule % set to ${rookieExtRosePct}%`);
        if (birdRightsEnabled !== (leagueStats.birdRightsEnabled ?? true)) changes.push(`Bird Rights ${birdRightsEnabled ? 'enabled' : 'disabled'}`);
        if (minContractLength !== (leagueStats.minContractLength ?? 1)) changes.push(`Minimum Contract Length set to ${minContractLength} years`);
        if (maxContractLengthStandard !== (leagueStats.maxContractLengthStandard ?? 4)) changes.push(`Max Contract Length (Standard) set to ${maxContractLengthStandard} years`);
        if (maxContractLengthBird !== (leagueStats.maxContractLengthBird ?? 5)) changes.push(`Max Contract Length (Bird) set to ${maxContractLengthBird} years`);
        if (playerOptionsEnabled !== (leagueStats.playerOptionsEnabled ?? true)) changes.push(`Player Options ${playerOptionsEnabled ? 'enabled' : 'disabled'}`);
        if (tenDayContractsEnabled !== (leagueStats.tenDayContractsEnabled ?? true)) changes.push(`10-Day Contracts ${tenDayContractsEnabled ? 'enabled' : 'disabled'}`);
        if (rookieScaleType !== (leagueStats.rookieScaleType ?? 'dynamic')) changes.push(`Rookie Scale Type changed to ${rookieScaleType}`);
        if (rookieStaticAmount !== (leagueStats.rookieStaticAmount ?? 5.0)) changes.push(`Rookie Static Amount set to $${rookieStaticAmount}M`);
        if (rookieMaxContractPercentage !== (leagueStats.rookieMaxContractPercentage ?? 9)) changes.push(`Rookie Max Contract Percentage set to ${rookieMaxContractPercentage}%`);
        if (rookieScaleAppliesTo !== (leagueStats.rookieScaleAppliesTo ?? 'first_round')) changes.push(`Rookie Scale Applies To changed to ${rookieScaleAppliesTo}`);
        if (rookieContractLength !== (leagueStats.rookieContractLength ?? 4)) changes.push(`Rookie Contract Length set to ${rookieContractLength} years`);
        if (rookieTeamOptionsEnabled !== (leagueStats.rookieTeamOptionsEnabled ?? true)) changes.push(`Rookie Team Options ${rookieTeamOptionsEnabled ? 'enabled' : 'disabled'}`);
        if (rookieTeamOptionYears !== (leagueStats.rookieTeamOptionYears ?? 2)) changes.push(`Rookie Team Option Years set to ${rookieTeamOptionYears}`);
        if (rookieRestrictedFreeAgentEligibility !== (leagueStats.rookieRestrictedFreeAgentEligibility ?? true)) changes.push(`Rookie Restricted Free Agent Eligibility ${rookieRestrictedFreeAgentEligibility ? 'enabled' : 'disabled'}`);
        if (rookieContractCapException !== (leagueStats.rookieContractCapException ?? true)) changes.push(`Rookie Contract Cap Exception ${rookieContractCapException ? 'enabled' : 'disabled'}`);
        if (r2ContractsNonGuaranteed !== (leagueStats.r2ContractsNonGuaranteed ?? true)) changes.push(`Non-Guaranteed R2 Contracts ${r2ContractsNonGuaranteed ? 'enabled' : 'disabled'}`);

        const penalty = ruleChangeService.checkRapidChangePenalty(changes);

        const detailedDescription = changes.length > 0 
            ? `The Commissioner has announced specific structural changes: ${changes.join(', ')}.${penalty ? ` ${penalty.description}` : ''}`
            : "The Commissioner has reaffirmed the current league structure with minor administrative updates.";

        const newStats = {
            playIn,
            inSeasonTournament,
            numGamesPlayoffSeries: cleanedFormat,
            draftType,
            draftEligibilityRule: eligibilityRule,
            minAgeRequirement: isNaN(cleanedMinAge) ? 19 : cleanedMinAge,
            minGamesRequirement: isNaN(cleanedMinGames) ? 65 : cleanedMinGames,
            allStarGameEnabled,
            allStarFormat,
            allStarTeams,
            allStarMirrorLeagueRules,
            allStarDunkContest,
            allStarDunkContestPlayers,
            allStarThreePointContest,
            allStarThreePointContestPlayers,
            allStarShootingStars,
            allStarShootingStarsMode,
            allStarShootingStarsTeams,
            allStarShootingStarsPlayersPerTeam,
            allStarShootingStarsTotalPlayers,
            allStarSkillsChallenge,
            allStarSkillsChallengeMode,
            allStarSkillsChallengeTeams,
            allStarSkillsChallengePlayersPerTeam,
            allStarSkillsChallengeTotalPlayers,
            allStarHorse,
            allStarHorseParticipants,
            allStarOneOnOneEnabled,
            allStarOneOnOneParticipants,
            risingStarsEnabled,
            risingStarsFormat,
            risingStarsMirrorLeagueRules,
            celebrityGameEnabled,
            celebrityGameMirrorLeagueRules,
            allStarGameFormat,
            allStarQuarterLength,
            allStarNumQuarters,
            allStarOvertimeDuration,
            allStarOvertimeTargetPoints,
            allStarShootoutRounds,
            allStarOvertimeType,
            allStarMaxOvertimesEnabled,
            allStarMaxOvertimes,
            allStarOvertimeTieBreaker,
            gameFormat,
            gameTargetScore,
            fourPointLine,
            foulOutLimit,
            teamFoulPenalty,
            quarterLength,
            numQuarters,
            overtimeDuration,
            overtimeTargetPoints,
            shootoutRounds,
            overtimeType,
            maxTimeouts,
            coachChallenges,
            maxCoachChallenges,
            challengeReimbursed,
            shotClockEnabled,
            shotClockValue,
            backcourtTimerEnabled,
            backcourtTimerValue,
            offensiveThreeSecondEnabled,
            offensiveThreeSecondValue,
            defensiveThreeSecondEnabled,
            defensiveThreeSecondValue,
            inboundTimerEnabled,
            inboundTimerValue,
            backToBasketTimerEnabled,
            backToBasketTimerValue,
            backcourtViolationEnabled,
            travelingEnabled,
            doubleDribbleEnabled,
            goaltendingEnabled,
            basketInterferenceEnabled,
            kickedBallEnabled,
            flagrantFoulPenaltyEnabled,
            clearPathFoulEnabled,
            illegalScreenEnabled,
            overTheBackFoulEnabled,
            looseBallFoulEnabled,
            chargingEnabled,
            overtimeEnabled,
            maxOvertimesEnabled,
            maxOvertimes,
            overtimeTieBreaker,
            maxPlayersOnCourt,
            substitutionLimitEnabled,
            maxSubstitutions,
            noDribbleRule,
            multiballEnabled,
            multiballCount,
            threePointLineDistance,
            fourPointLineDistance,
            dunkValue,
            midrangeValue,
            heaveRuleEnabled,
            halfCourtShotValue,
            clutchTimeoutLimit,
            handcheckingEnabled,
            illegalZoneDefenseEnabled,
            outOfBoundsEnabled,
            freeThrowDistance,
            rimHeight,
            ballWeight,
            startOfPossessionMethod,
            possessionPattern,
            courtLength,
            baselineLength,
            keyWidth,
            cornerThrowInEnabled,
            techEjectionLimit,
            flagrant1EjectionLimit,
            flagrant2EjectionLimit,
            fightingInstantEjection,
            useYellowRedCards,
            shotClockResetOffensiveRebound,
            salaryCap,
            salaryCapEnabled,
            salaryCapType,
            minimumPayrollEnabled,
            minimumPayrollPercentage,
            luxuryTaxEnabled,
            luxuryTaxThresholdPercentage,
            apronsEnabled,
            numberOfAprons,
            firstApronPercentage,
            secondApronPercentage,
            twoWayContractsEnabled,
            nonGuaranteedContractsEnabled,
            minPlayersPerTeam,
            maxPlayersPerTeam,
            maxStandardPlayersPerTeam,
            maxTwoWayPlayersPerTeam,
            maxTrainingCampRoster,
            minContractType,
            minContractStaticAmount,
            maxContractType,
            maxContractStaticPercentage,
            supermaxEnabled,
            supermaxPercentage,
            supermaxMinYears,
            rookieExtEnabled,
            rookieExtPct,
            rookieExtRosePct,
            birdRightsEnabled,
            minContractLength,
            maxContractLengthStandard,
            maxContractLengthBird,
            playerOptionsEnabled,
            tenDayContractsEnabled,
            inflationEnabled,
            inflationMin,
            inflationMax,
            inflationAverage,
            inflationStdDev,
            mleEnabled,
            roomMleAmount,
            nonTaxpayerMleAmount,
            taxpayerMleAmount,
            biannualEnabled,
            biannualAmount,
            roomMlePercentage,
            nonTaxpayerMlePercentage,
            taxpayerMlePercentage,
            biannualPercentage,
            tradableDraftPickSeasons,
            tradeDeadlineMonth,
            tradeDeadlineOrdinal,
            tradeDeadlineDayOfWeek,
            faStartMonth,
            faStartDay,
            faMoratoriumDays,
            regularSeasonFAEnabled,
            postDeadlineMultiYearContracts,
            rookieScaleType,
            rookieStaticAmount,
            rookieMaxContractPercentage,
            rookieScaleAppliesTo,
            rookieContractLength,
            rookieTeamOptionsEnabled,
            rookieTeamOptionYears,
            rookieRestrictedFreeAgentEligibility,
            rookieContractCapException,
            r2ContractsNonGuaranteed,
            allNbaTeams,
            allNbaPlayersPerTeam,
            allDefenseTeams,
            allDefensePlayersPerTeam,
            allRookieTeams,
            allRookiePlayersPerTeam,
            positionlessAwards
        };

        const effects = calculateRuleChangeEffects(leagueStats, newStats);

        await dispatchAction({
          type: 'ANNOUNCE_CHANGE',
          payload: { 
            description: detailedDescription,
            statUpdates: {
                ...newStats,
                morale: {
                    fans: effects.morale.fans - (penalty?.moralePenalty || 0),
                    players: effects.morale.players - (penalty?.moralePenalty || 0),
                    owners: effects.morale.owners - (penalty?.moralePenalty || 0),
                    legacy: effects.morale.legacy - (penalty?.moralePenalty || 0)
                },
                revenue: effects.revenue,
                viewership: effects.viewership,
                legacy: effects.legacy
            }
          }
        });
        setPlayoffFormat(cleanedFormat);
        setHasConfigChanges(false);
    } catch (error) {
        console.error("Failed to save rules:", error);
    } finally {
        setIsSaving(false);
    }
  };

  const handleResetConfig = () => {
    setPlayIn(leagueStats.playIn);
    setInSeasonTournament(leagueStats.inSeasonTournament ?? true);
    setPlayoffFormat([...leagueStats.numGamesPlayoffSeries]);
    setDraftType(leagueStats.draftType);
    setEligibilityRule(leagueStats.draftEligibilityRule ?? 'one_and_done');
    setMinAgeRequirement(leagueStats.minAgeRequirement ?? 19);
    setMinGamesRequirement(leagueStats.minGamesRequirement ?? 65);
    setGamesPerSeason(leagueStats.gamesPerSeason ?? 82);
    setDivisionGames(leagueStats.divisionGames ?? 16);
    setConferenceGames(leagueStats.conferenceGames ?? 36);
    setAllStarGameEnabled(leagueStats.allStarGameEnabled ?? true);
    setAllStarFormat(leagueStats.allStarFormat ?? 'usa_vs_world');
    setAllStarTeams(leagueStats.allStarTeams ?? 3);
    setAllStarMirrorLeagueRules(leagueStats.allStarMirrorLeagueRules ?? true);
    setAllStarDunkContest(leagueStats.allStarDunkContest ?? true);
    setAllStarDunkContestPlayers(leagueStats.allStarDunkContestPlayers ?? 4);
    setAllStarThreePointContest(leagueStats.allStarThreePointContest ?? true);
    setAllStarThreePointContestPlayers(leagueStats.allStarThreePointContestPlayers ?? 8);
    setAllStarShootingStars(leagueStats.allStarShootingStars ?? true);
    setAllStarShootingStarsMode(leagueStats.allStarShootingStarsMode ?? 'team');
    setAllStarShootingStarsTeams(leagueStats.allStarShootingStarsTeams ?? 3);
    setAllStarShootingStarsPlayersPerTeam(leagueStats.allStarShootingStarsPlayersPerTeam ?? 3);
    setAllStarShootingStarsTotalPlayers(leagueStats.allStarShootingStarsTotalPlayers ?? 12);
    setAllStarSkillsChallenge(leagueStats.allStarSkillsChallenge ?? false);
    setAllStarSkillsChallengeMode(leagueStats.allStarSkillsChallengeMode ?? 'team');
    setAllStarSkillsChallengeTeams(leagueStats.allStarSkillsChallengeTeams ?? 4);
    setAllStarSkillsChallengePlayersPerTeam(leagueStats.allStarSkillsChallengePlayersPerTeam ?? 2);
    setAllStarSkillsChallengeTotalPlayers(leagueStats.allStarSkillsChallengeTotalPlayers ?? 8);
    setAllStarHorse(leagueStats.allStarHorse ?? false);
    setAllStarHorseParticipants(leagueStats.allStarHorseParticipants ?? 8);
    setAllStarOneOnOneEnabled(leagueStats.allStarOneOnOneEnabled ?? false);
    setAllStarOneOnOneParticipants(leagueStats.allStarOneOnOneParticipants ?? 8);
    setRisingStarsEnabled(leagueStats.risingStarsEnabled ?? true);
    setRisingStarsFormat(leagueStats.risingStarsFormat ?? 'tournament');
    setRisingStarsMirrorLeagueRules(leagueStats.risingStarsMirrorLeagueRules ?? true);
    setCelebrityGameEnabled(leagueStats.celebrityGameEnabled ?? true);
    setCelebrityGameMirrorLeagueRules(leagueStats.celebrityGameMirrorLeagueRules ?? true);
    setAllStarGameFormat(leagueStats.allStarGameFormat ?? 'timed');
    setAllStarQuarterLength(leagueStats.allStarQuarterLength ?? 12);
    setAllStarNumQuarters(leagueStats.allStarNumQuarters ?? 4);
    setAllStarOvertimeDuration(leagueStats.allStarOvertimeDuration ?? 5);
    setAllStarOvertimeTargetPoints(leagueStats.allStarOvertimeTargetPoints ?? 7);
    setShootoutRounds(leagueStats.shootoutRounds ?? 3);
    setAllStarOvertimeType(leagueStats.allStarOvertimeType ?? 'standard');
    setAllStarMaxOvertimesEnabled(leagueStats.allStarMaxOvertimesEnabled ?? false);
    setAllStarMaxOvertimes(leagueStats.allStarMaxOvertimes ?? 3);
    setAllStarOvertimeTieBreaker(leagueStats.allStarOvertimeTieBreaker ?? 'shootout');
    setGameFormat(leagueStats.gameFormat ?? 'timed');
    setGameTargetScore(leagueStats.gameTargetScore ?? 0);
    setFourPointLine(leagueStats.fourPointLine ?? false);
    setFoulOutLimit(leagueStats.foulOutLimit ?? 6);
    setTeamFoulPenalty(leagueStats.teamFoulPenalty ?? 5);
    setQuarterLength(leagueStats.quarterLength ?? 12);
    setNumQuarters(leagueStats.numQuarters ?? 4);
    setOvertimeDuration(leagueStats.overtimeDuration ?? 5);
    setOvertimeTargetPoints(leagueStats.overtimeTargetPoints ?? 0);
    setShootoutRounds(leagueStats.shootoutRounds ?? 0);
    setOvertimeType(leagueStats.overtimeType ?? 'standard');
    setMaxTimeouts(leagueStats.maxTimeouts ?? 7);
    setCoachChallenges(leagueStats.coachChallenges ?? true);
    setMaxCoachChallenges(leagueStats.maxCoachChallenges ?? 2);
    setChallengeReimbursed(leagueStats.challengeReimbursed ?? true);
    setShotClockEnabled(leagueStats.shotClockEnabled ?? true);
    setShotClockValue(leagueStats.shotClockValue ?? 24);
    setBackcourtTimerEnabled(leagueStats.backcourtTimerEnabled ?? true);
    setBackcourtTimerValue(leagueStats.backcourtTimerValue ?? 8);
    setOffensiveThreeSecondEnabled(leagueStats.offensiveThreeSecondEnabled ?? true);
    setOffensiveThreeSecondValue(leagueStats.offensiveThreeSecondValue ?? 3);
    setDefensiveThreeSecondEnabled(leagueStats.defensiveThreeSecondEnabled ?? true);
    setDefensiveThreeSecondValue(leagueStats.defensiveThreeSecondValue ?? 3);
    setInboundTimerEnabled(leagueStats.inboundTimerEnabled ?? true);
    setInboundTimerValue(leagueStats.inboundTimerValue ?? 5);
    setBackToBasketTimerEnabled(leagueStats.backToBasketTimerEnabled ?? true);
    setBackToBasketTimerValue(leagueStats.backToBasketTimerValue ?? 5);
    setBackcourtViolationEnabled(leagueStats.backcourtViolationEnabled ?? true);
    setTravelingEnabled(leagueStats.travelingEnabled ?? true);
    setDoubleDribbleEnabled(leagueStats.doubleDribbleEnabled ?? true);
    setGoaltendingEnabled(leagueStats.goaltendingEnabled ?? true);
    setBasketInterferenceEnabled(leagueStats.basketInterferenceEnabled ?? true);
    setKickedBallEnabled(leagueStats.kickedBallEnabled ?? true);
    setFlagrantFoulPenaltyEnabled(leagueStats.flagrantFoulPenaltyEnabled ?? true);
    setClearPathFoulEnabled(leagueStats.clearPathFoulEnabled ?? true);
    setIllegalScreenEnabled(leagueStats.illegalScreenEnabled ?? true);
    setOverTheBackFoulEnabled(leagueStats.overTheBackFoulEnabled ?? true);
    setLooseBallFoulEnabled(leagueStats.looseBallFoulEnabled ?? true);
    setChargingEnabled(leagueStats.chargingEnabled ?? true);
    setOvertimeEnabled(leagueStats.overtimeEnabled ?? true);
    setMaxOvertimesEnabled(leagueStats.maxOvertimesEnabled ?? false);
    setMaxOvertimes(leagueStats.maxOvertimes ?? 0);
    setOvertimeTieBreaker(leagueStats.overtimeTieBreaker ?? 'sudden_death');
    setMaxPlayersOnCourt(leagueStats.maxPlayersOnCourt ?? 5);
    setSubstitutionLimitEnabled(leagueStats.substitutionLimitEnabled ?? false);
    setMaxSubstitutions(leagueStats.maxSubstitutions ?? 0);
    setNoDribbleRule(leagueStats.noDribbleRule ?? false);
    setMultiballEnabled(leagueStats.multiballEnabled ?? false);
    setMultiballCount(leagueStats.multiballCount ?? 1);
    setThreePointLineDistance(leagueStats.threePointLineDistance ?? 23.75);
    setFourPointLineDistance(leagueStats.fourPointLineDistance ?? 0);
    setDunkValue(leagueStats.dunkValue ?? 2);
    setMidrangeValue(leagueStats.midrangeValue ?? 2);
    setHeaveRuleEnabled(leagueStats.heaveRuleEnabled ?? false);
    setHalfCourtShotValue(leagueStats.halfCourtShotValue ?? 3);
    setClutchTimeoutLimit(leagueStats.clutchTimeoutLimit ?? 2);
    setHandcheckingEnabled(leagueStats.handcheckingEnabled ?? false);
    setIllegalZoneDefenseEnabled(leagueStats.illegalZoneDefenseEnabled ?? false);
    setOutOfBoundsEnabled(leagueStats.outOfBoundsEnabled ?? true);
    setFreeThrowDistance(leagueStats.freeThrowDistance ?? 15);
    setRimHeight(leagueStats.rimHeight ?? 10);
    setBallWeight(leagueStats.ballWeight ?? 1.4);
    setStartOfPossessionMethod(leagueStats.startOfPossessionMethod ?? 'jump_ball');
    setPossessionPattern(leagueStats.possessionPattern ?? 'nba');
    setCourtLength(leagueStats.courtLength ?? 94);
    setBaselineLength(leagueStats.baselineLength ?? 50);
    setKeyWidth(leagueStats.keyWidth ?? 16);
    setCornerThrowInEnabled(leagueStats.cornerThrowInEnabled ?? false);
    setTechEjectionLimit(leagueStats.techEjectionLimit ?? 2);
    setFlagrant1EjectionLimit(leagueStats.flagrant1EjectionLimit ?? 2);
    setFlagrant2EjectionLimit(leagueStats.flagrant2EjectionLimit ?? 1);
    setFightingInstantEjection(leagueStats.fightingInstantEjection ?? true);
    setUseYellowRedCards(leagueStats.useYellowRedCards ?? false);
    setShotClockResetOffensiveRebound(leagueStats.shotClockResetOffensiveRebound ?? 14);
    setSalaryCap(leagueStats.salaryCap ?? 154647000);
    setSalaryCapEnabled(leagueStats.salaryCapEnabled ?? true);
    setSalaryCapType(leagueStats.salaryCapType ?? 'soft');
    setMinimumPayrollEnabled(leagueStats.minimumPayrollEnabled ?? true);
    setMinimumPayrollPercentage(leagueStats.minimumPayrollPercentage ?? 90);
    setLuxuryTaxEnabled(leagueStats.luxuryTaxEnabled ?? true);
    setLuxuryTaxThresholdPercentage(leagueStats.luxuryTaxThresholdPercentage ?? 121.5);
    setApronsEnabled(leagueStats.apronsEnabled ?? true);
    setNumberOfAprons(leagueStats.numberOfAprons ?? 2);
    setFirstApronPercentage(leagueStats.firstApronPercentage ?? 126.7);
    setSecondApronPercentage(leagueStats.secondApronPercentage ?? 134.4);
    setTwoWayContractsEnabled(leagueStats.twoWayContractsEnabled ?? true);
    setNonGuaranteedContractsEnabled(leagueStats.nonGuaranteedContractsEnabled ?? true);
    setMinPlayersPerTeam(leagueStats.minPlayersPerTeam ?? 14);
    setMaxPlayersPerTeam(leagueStats.maxPlayersPerTeam ?? 17);
    setMaxStandardPlayersPerTeam(leagueStats.maxStandardPlayersPerTeam ?? 15);
    setMaxTwoWayPlayersPerTeam(leagueStats.maxTwoWayPlayersPerTeam ?? 3);
    setMaxTrainingCampRoster(leagueStats.maxTrainingCampRoster ?? 21);
    setMinContractType(leagueStats.minContractType ?? 'dynamic');
    setMinContractStaticAmount(leagueStats.minContractStaticAmount ?? 1.272870);
    setMaxContractType(leagueStats.maxContractType ?? 'service_tiered');
    setMaxContractStaticPercentage(leagueStats.maxContractStaticPercentage ?? 30);
    setSupermaxEnabled(leagueStats.supermaxEnabled ?? true);
    setSupermaxPercentage(leagueStats.supermaxPercentage ?? 35);
    setSupermaxMinYears(leagueStats.supermaxMinYears ?? 8);
    setRookieExtEnabled(leagueStats.rookieExtEnabled ?? true);
    setRookieExtPct(leagueStats.rookieExtPct ?? 25);
    setRookieExtRosePct(leagueStats.rookieExtRosePct ?? 30);
    setBirdRightsEnabled(leagueStats.birdRightsEnabled ?? true);
    setMinContractLength(leagueStats.minContractLength ?? 1);
    setMaxContractLengthStandard(leagueStats.maxContractLengthStandard ?? 4);
    setMaxContractLengthBird(leagueStats.maxContractLengthBird ?? 5);
    setPlayerOptionsEnabled(leagueStats.playerOptionsEnabled ?? true);
    setTenDayContractsEnabled(leagueStats.tenDayContractsEnabled ?? true);
    setInflationEnabled(leagueStats.inflationEnabled ?? true);
    setInflationMin(leagueStats.inflationMin ?? 0);
    setInflationMax(leagueStats.inflationMax ?? 10);
    setInflationAverage(leagueStats.inflationAverage ?? 5.5);
    setInflationStdDev(leagueStats.inflationStdDev ?? 2.0);
    setMleEnabled(leagueStats.mleEnabled ?? true);
    setRoomMleAmount(leagueStats.roomMleAmount ?? 8_781_000);
    setNonTaxpayerMleAmount(leagueStats.nonTaxpayerMleAmount ?? 14_104_000);
    setTaxpayerMleAmount(leagueStats.taxpayerMleAmount ?? 5_685_000);
    setBiannualEnabled(leagueStats.biannualEnabled ?? true);
    setBiannualAmount(leagueStats.biannualAmount ?? 4_767_000);
    setTradableDraftPickSeasons(leagueStats.tradableDraftPickSeasons ?? 7);
    setTradeDeadlineMonth(leagueStats.tradeDeadlineMonth ?? 2);
    setTradeDeadlineOrdinal(leagueStats.tradeDeadlineOrdinal ?? 1);
    setTradeDeadlineDayOfWeek(leagueStats.tradeDeadlineDayOfWeek ?? 'Thu');
    setFaStartMonth(leagueStats.faStartMonth ?? 7);
    setFaStartDay(leagueStats.faStartDay ?? 1);
    setFaMoratoriumDays(leagueStats.faMoratoriumDays ?? 6);
    setRegularSeasonFAEnabled(leagueStats.regularSeasonFAEnabled ?? true);
    setPostDeadlineMultiYearContracts(leagueStats.postDeadlineMultiYearContracts ?? true);
    setRookieScaleType(leagueStats.rookieScaleType ?? 'dynamic');
    setRookieStaticAmount(leagueStats.rookieStaticAmount ?? 5.0);
    setRookieMaxContractPercentage(leagueStats.rookieMaxContractPercentage ?? 9);
    setRookieScaleAppliesTo(leagueStats.rookieScaleAppliesTo ?? 'first_round');
    setRookieContractLength(leagueStats.rookieContractLength ?? 2);
    setRookieTeamOptionsEnabled(leagueStats.rookieTeamOptionsEnabled ?? true);
    setRookieTeamOptionYears(leagueStats.rookieTeamOptionYears ?? 2);
    setRookieRestrictedFreeAgentEligibility(leagueStats.rookieRestrictedFreeAgentEligibility ?? true);
    setRookieContractCapException(leagueStats.rookieContractCapException ?? true);
    setR2ContractsNonGuaranteed(leagueStats.r2ContractsNonGuaranteed ?? true);
    setAllNbaTeams(leagueStats.allNbaTeams ?? 3);
    setAllNbaPlayersPerTeam(leagueStats.allNbaPlayersPerTeam ?? 5);
    setAllDefenseTeams(leagueStats.allDefenseTeams ?? 2);
    setAllDefensePlayersPerTeam(leagueStats.allDefensePlayersPerTeam ?? 5);
    setAllRookieTeams(leagueStats.allRookieTeams ?? 2);
    setAllRookiePlayersPerTeam(leagueStats.allRookiePlayersPerTeam ?? 5);
    setPositionlessAwards(leagueStats.positionlessAwards ?? false);
  };

  const handleAddAward = async (name: string, criteria: string) => {
    setIsGeneratingAward(true);
    try {
      const details = await generateAwardDetails(criteria.trim());
      
      let finalTitle = name.trim() || details.title;
      if (finalTitle.toLowerCase().includes('mvp') && !finalTitle.includes('(')) {
          finalTitle = `MVP (Michael Jordan Trophy)`;
      } else if (finalTitle.toLowerCase().includes('defensive player') && !finalTitle.includes('(')) {
          finalTitle = `Defensive Player of the Year (Hakeem Olajuwon Trophy)`;
      }

      const newAwardObj: Rule = {
        id: `award-${Date.now()}`,
        title: finalTitle,
        description: details.description
      };
      
      const updatedAwards = [...localAwards, newAwardObj];
      setLocalAwards(updatedAwards);
      setAwardModalOpen(false);

      await dispatchAction({
        type: 'ANNOUNCE_CHANGE',
        payload: {
            description: `The Commissioner has established a new award: ${finalTitle}. Criteria: ${details.description}`,
            statUpdates: { 
                awards: updatedAwards,
                morale: { fans: 2, players: 3, owners: 0, legacy: 1 },
                viewership: 1
            }
        }
      });

    } catch (error) {
      console.error("Failed to generate award details:", error);
    } finally {
      setIsGeneratingAward(false);
    }
  };

  const handleRemoveAward = async (id: string) => {
    const awardToRemove = localAwards.find(a => a.id === id);
    const updatedAwards = localAwards.filter(a => a.id !== id);
    setLocalAwards(updatedAwards);
    await dispatchAction({
        type: 'ANNOUNCE_CHANGE',
        payload: { 
            description: `The Commissioner has abolished the ${awardToRemove?.title || 'award'}.`,
            statUpdates: { 
                awards: updatedAwards,
                morale: { fans: -3, players: -4, owners: 0, legacy: -2 },
                viewership: -1
            } 
        }
    });
  };

  const handleRemoveRule = async (id: string) => {
    const updatedRules = localRules.filter(r => r.id !== id);
    setLocalRules(updatedRules);
    await dispatchAction({
        type: 'UPDATE_RULES',
        payload: { rules: updatedRules }
    });
  };

  const handleAddRule = async (newRule: string) => {
    if (newRule.trim()) {
      setIsGenerating(true);
      try {
        const details = await generateRuleDetails(newRule.trim());
        const newRuleObj: Rule = {
          id: `rule-${Date.now()}`,
          title: details.title,
          description: details.description
        };
        
        const updatedRules = [...localRules, newRuleObj];
        setLocalRules(updatedRules);
        setNewRule('');

        await dispatchAction({
            type: 'UPDATE_RULES',
            payload: { rules: updatedRules }
        });

        await dispatchAction({
            type: 'ANNOUNCE_CHANGE',
            payload: {
                description: `The Commissioner has implemented a new rule: ${details.title}. ${details.description}`,
                statUpdates: { rules: updatedRules }
            }
        });

      } catch (error) {
        console.error("Failed to generate rule details:", error);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  return {
    localRules, setLocalRules,
    localAwards, setLocalAwards,
    newRule, setNewRule,
    isSaving, setIsSaving,
    isGenerating, setIsGenerating,
    isGeneratingAward, setIsGeneratingAward,
    awardModalOpen, setAwardModalOpen,
    expandedRule, setExpandedRule,
    expandedAward, setExpandedAward,
    playIn, setPlayIn,
    inSeasonTournament, setInSeasonTournament,
    playoffFormat, setPlayoffFormat,
    draftType, setDraftType,
    minAgeRequirement, setMinAgeRequirement,
    eligibilityRule, setEligibilityRule,
    minGamesRequirement, setMinGamesRequirement,
    gamesPerSeason, setGamesPerSeason,
    divisionGames, setDivisionGames,
    conferenceGames, setConferenceGames,
    allStarGameEnabled, setAllStarGameEnabled,
    allStarFormat, setAllStarFormat,
    allStarTeams, setAllStarTeams,
    allStarMirrorLeagueRules, setAllStarMirrorLeagueRules,
    allStarDunkContest, setAllStarDunkContest,
    allStarDunkContestPlayers, setAllStarDunkContestPlayers,
    allStarThreePointContest, setAllStarThreePointContest,
    allStarThreePointContestPlayers, setAllStarThreePointContestPlayers,
    allStarShootingStars, setAllStarShootingStars,
    allStarShootingStarsMode, setAllStarShootingStarsMode,
    allStarShootingStarsTeams, setAllStarShootingStarsTeams,
    allStarShootingStarsPlayersPerTeam, setAllStarShootingStarsPlayersPerTeam,
    allStarShootingStarsTotalPlayers, setAllStarShootingStarsTotalPlayers,
    allStarSkillsChallenge, setAllStarSkillsChallenge,
    allStarSkillsChallengeMode, setAllStarSkillsChallengeMode,
    allStarSkillsChallengeTeams, setAllStarSkillsChallengeTeams,
    allStarSkillsChallengePlayersPerTeam, setAllStarSkillsChallengePlayersPerTeam,
    allStarSkillsChallengeTotalPlayers, setAllStarSkillsChallengeTotalPlayers,
    allStarHorse, setAllStarHorse,
    allStarHorseParticipants, setAllStarHorseParticipants,
    allStarOneOnOneEnabled, setAllStarOneOnOneEnabled,
    allStarOneOnOneParticipants, setAllStarOneOnOneParticipants,
    risingStarsEnabled, setRisingStarsEnabled,
    risingStarsFormat, setRisingStarsFormat,
    risingStarsMirrorLeagueRules, setRisingStarsMirrorLeagueRules,
    celebrityGameEnabled, setCelebrityGameEnabled,
    celebrityGameMirrorLeagueRules, setCelebrityGameMirrorLeagueRules,
    allStarGameFormat, setAllStarGameFormat,
    allStarQuarterLength, setAllStarQuarterLength,
    allStarNumQuarters, setAllStarNumQuarters,
    allStarOvertimeDuration, setAllStarOvertimeDuration,
    allStarOvertimeTargetPoints, setAllStarOvertimeTargetPoints,
    allStarShootoutRounds, setAllStarShootoutRounds,
    allStarOvertimeType, setAllStarOvertimeType,
    allStarMaxOvertimesEnabled, setAllStarMaxOvertimesEnabled,
    allStarMaxOvertimes, setAllStarMaxOvertimes,
    allStarOvertimeTieBreaker, setAllStarOvertimeTieBreaker,
    gameFormat, setGameFormat,
    gameTargetScore, setGameTargetScore,
    fourPointLine, setFourPointLine,
    threePointLineEnabled, setThreePointLineEnabled,
    multiballCount, setMultiballCount,
    foulOutLimit, setFoulOutLimit,
    teamFoulPenalty, setTeamFoulPenalty,
    quarterLength, setQuarterLength,
    numQuarters, setNumQuarters,
    overtimeDuration, setOvertimeDuration,
    overtimeTargetPoints, setOvertimeTargetPoints,
    shootoutRounds, setShootoutRounds,
    overtimeType, setOvertimeType,
    maxTimeouts, setMaxTimeouts,
    coachChallenges, setCoachChallenges,
    maxCoachChallenges, setMaxCoachChallenges,
    challengeReimbursed, setChallengeReimbursed,
    shotClockEnabled, setShotClockEnabled,
    shotClockValue, setShotClockValue,
    backcourtTimerEnabled, setBackcourtTimerEnabled,
    backcourtTimerValue, setBackcourtTimerValue,
    offensiveThreeSecondEnabled, setOffensiveThreeSecondEnabled,
    offensiveThreeSecondValue, setOffensiveThreeSecondValue,
    defensiveThreeSecondEnabled, setDefensiveThreeSecondEnabled,
    defensiveThreeSecondValue, setDefensiveThreeSecondValue,
    inboundTimerEnabled, setInboundTimerEnabled,
    inboundTimerValue, setInboundTimerValue,
    backToBasketTimerEnabled, setBackToBasketTimerEnabled,
    backToBasketTimerValue, setBackToBasketTimerValue,
    backcourtViolationEnabled, setBackcourtViolationEnabled,
    travelingEnabled, setTravelingEnabled,
    doubleDribbleEnabled, setDoubleDribbleEnabled,
    goaltendingEnabled, setGoaltendingEnabled,
    basketInterferenceEnabled, setBasketInterferenceEnabled,
    kickedBallEnabled, setKickedBallEnabled,
    flagrantFoulPenaltyEnabled, setFlagrantFoulPenaltyEnabled,
    clearPathFoulEnabled, setClearPathFoulEnabled,
    illegalScreenEnabled, setIllegalScreenEnabled,
    overTheBackFoulEnabled, setOverTheBackFoulEnabled,
    looseBallFoulEnabled, setLooseBallFoulEnabled,
    chargingEnabled, setChargingEnabled,
    overtimeEnabled, setOvertimeEnabled,
    maxOvertimesEnabled, setMaxOvertimesEnabled,
    maxOvertimes, setMaxOvertimes,
    overtimeTieBreaker, setOvertimeTieBreaker,
    maxPlayersOnCourt, setMaxPlayersOnCourt,
    substitutionLimitEnabled, setSubstitutionLimitEnabled,
    maxSubstitutions, setMaxSubstitutions,
    noDribbleRule, setNoDribbleRule,
    multiballEnabled, setMultiballEnabled,
    threePointLineDistance, setThreePointLineDistance,
    fourPointLineDistance, setFourPointLineDistance,
    dunkValue, setDunkValue,
    midrangeValue, setMidrangeValue,
    heaveRuleEnabled, setHeaveRuleEnabled,
    halfCourtShotValue, setHalfCourtShotValue,
    clutchTimeoutLimit, setClutchTimeoutLimit,
    handcheckingEnabled, setHandcheckingEnabled,
    illegalZoneDefenseEnabled, setIllegalZoneDefenseEnabled,
    outOfBoundsEnabled, setOutOfBoundsEnabled,
    freeThrowDistance, setFreeThrowDistance,
    rimHeight, setRimHeight,
    ballWeight, setBallWeight,
    startOfPossessionMethod, setStartOfPossessionMethod,
    possessionPattern, setPossessionPattern,
    courtLength, setCourtLength,
    baselineLength, setBaselineLength,
    keyWidth, setKeyWidth,
    cornerThrowInEnabled, setCornerThrowInEnabled,
    techEjectionLimit, setTechEjectionLimit,
    flagrant1EjectionLimit, setFlagrant1EjectionLimit,
    flagrant2EjectionLimit, setFlagrant2EjectionLimit,
    fightingInstantEjection, setFightingInstantEjection,
    useYellowRedCards, setUseYellowRedCards,
    shotClockResetOffensiveRebound, setShotClockResetOffensiveRebound,
    salaryCap, setSalaryCap,
    salaryCapEnabled, setSalaryCapEnabled,
    salaryCapType, setSalaryCapType,
    minimumPayrollEnabled, setMinimumPayrollEnabled,
    minimumPayrollPercentage, setMinimumPayrollPercentage,
    luxuryTaxEnabled, setLuxuryTaxEnabled,
    luxuryTaxThresholdPercentage, setLuxuryTaxThresholdPercentage,
    apronsEnabled, setApronsEnabled,
    numberOfAprons, setNumberOfAprons,
    firstApronPercentage, setFirstApronPercentage,
    secondApronPercentage, setSecondApronPercentage,
    twoWayContractsEnabled, setTwoWayContractsEnabled,
    nonGuaranteedContractsEnabled, setNonGuaranteedContractsEnabled,
    minPlayersPerTeam, setMinPlayersPerTeam,
    maxPlayersPerTeam, setMaxPlayersPerTeam,
    maxStandardPlayersPerTeam, setMaxStandardPlayersPerTeam,
    maxTwoWayPlayersPerTeam, setMaxTwoWayPlayersPerTeam,
    maxTrainingCampRoster, setMaxTrainingCampRoster,
    minContractType, setMinContractType,
    minContractStaticAmount, setMinContractStaticAmount,
    maxContractType, setMaxContractType,
    maxContractStaticPercentage, setMaxContractStaticPercentage,
    supermaxEnabled, setSupermaxEnabled,
    supermaxPercentage, setSupermaxPercentage,
    supermaxMinYears, setSupermaxMinYears,
    rookieExtEnabled, setRookieExtEnabled,
    rookieExtPct, setRookieExtPct,
    rookieExtRosePct, setRookieExtRosePct,
    birdRightsEnabled, setBirdRightsEnabled,
    minContractLength, setMinContractLength,
    maxContractLengthStandard, setMaxContractLengthStandard,
    maxContractLengthBird, setMaxContractLengthBird,
    playerOptionsEnabled, setPlayerOptionsEnabled,
    tenDayContractsEnabled, setTenDayContractsEnabled,
    inflationEnabled, setInflationEnabled,
    inflationMin, setInflationMin,
    inflationMax, setInflationMax,
    inflationAverage, setInflationAverage,
    inflationStdDev, setInflationStdDev,
    mleEnabled, setMleEnabled,
    roomMleAmount, setRoomMleAmount,
    nonTaxpayerMleAmount, setNonTaxpayerMleAmount,
    taxpayerMleAmount, setTaxpayerMleAmount,
    biannualEnabled, setBiannualEnabled,
    biannualAmount, setBiannualAmount,
    roomMlePercentage, setRoomMlePercentage,
    nonTaxpayerMlePercentage, setNonTaxpayerMlePercentage,
    taxpayerMlePercentage, setTaxpayerMlePercentage,
    biannualPercentage, setBiannualPercentage,
    tradableDraftPickSeasons, setTradableDraftPickSeasons,
    tradeDeadlineMonth, setTradeDeadlineMonth,
    tradeDeadlineOrdinal, setTradeDeadlineOrdinal,
    tradeDeadlineDayOfWeek, setTradeDeadlineDayOfWeek,
    faStartMonth, setFaStartMonth,
    faStartDay, setFaStartDay,
    faMoratoriumDays, setFaMoratoriumDays,
    regularSeasonFAEnabled, setRegularSeasonFAEnabled,
    postDeadlineMultiYearContracts, setPostDeadlineMultiYearContracts,
    rookieScaleType, setRookieScaleType,
    rookieStaticAmount, setRookieStaticAmount,
    rookieMaxContractPercentage, setRookieMaxContractPercentage,
    rookieScaleAppliesTo, setRookieScaleAppliesTo,
    rookieContractLength, setRookieContractLength,
    rookieTeamOptionsEnabled, setRookieTeamOptionsEnabled,
    rookieTeamOptionYears, setRookieTeamOptionYears,
    rookieRestrictedFreeAgentEligibility, setRookieRestrictedFreeAgentEligibility,
    rookieContractCapException, setRookieContractCapException,
    r2ContractsNonGuaranteed, setR2ContractsNonGuaranteed,
    allNbaTeams, setAllNbaTeams,
    allNbaPlayersPerTeam, setAllNbaPlayersPerTeam,
    allDefenseTeams, setAllDefenseTeams,
    allDefensePlayersPerTeam, setAllDefensePlayersPerTeam,
    allRookieTeams, setAllRookieTeams,
    allRookiePlayersPerTeam, setAllRookiePlayersPerTeam,
    positionlessAwards, setPositionlessAwards,
    hasConfigChanges,
    handleSaveConfig,
    handleResetConfig,
    handleAddAward,
    handleRemoveAward,
    handleRemoveRule,
    handleAddRule
  };
};
