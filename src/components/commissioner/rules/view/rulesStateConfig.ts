import type { LeagueStats } from '../../../../types';
import { calculateRuleChangeEffects } from '../../../../utils/ruleEffects';
import { ruleChangeService } from '../../../../services/RuleChangeService';
import type { createRulesViewDefaults } from './rulesStateViewDefaults';

type RulesViewDefaults = ReturnType<typeof createRulesViewDefaults>;

type RuleValue = string | number | boolean | (string | number)[] | undefined;
type RulesSnapshot = Record<string, RuleValue>;

const NBA_MAX_PLAYOFF_SERIES = 7;
const NBA_MAX_GAMES_PER_SEASON = 82;
const NBA_MAX_DIVISION_GAMES = 16;
const NBA_MAX_CONFERENCE_GAMES = 36;

export const buildRulesStateBaseline = (leagueStats: LeagueStats, viewDefaults: RulesViewDefaults): RulesSnapshot => ({
  playIn: viewDefaults.playIn,
  inSeasonTournament: viewDefaults.inSeasonTournament,
  cupPrizePoolEnabled: viewDefaults.cupPrizePoolEnabled,
  cupPrizePoolAutoInflate: viewDefaults.cupPrizePoolAutoInflate,
  cupPrizeWinner: viewDefaults.cupPrizeWinner,
  cupPrizeRunnerUp: viewDefaults.cupPrizeRunnerUp,
  cupPrizeSemi: viewDefaults.cupPrizeSemi,
  cupPrizeQuarter: viewDefaults.cupPrizeQuarter,
  playoffFormat: viewDefaults.playoffFormat,
  draftType: viewDefaults.draftType,
  eligibilityRule: viewDefaults.eligibilityRule,
  draftEligibilityRule: viewDefaults.eligibilityRule,
  minAgeRequirement: viewDefaults.minAgeRequirement,
  minGamesRequirement: viewDefaults.minGamesRequirement,
  customScheduleEnabled: viewDefaults.customScheduleEnabled,
  gamesPerSeason: viewDefaults.gamesPerSeason,
  divisionGames: viewDefaults.divisionGames,
  conferenceGames: viewDefaults.conferenceGames,
  allStarGameEnabled: viewDefaults.allStarGameEnabled,
  allStarFormat: viewDefaults.allStarFormat,
  allStarTeams: viewDefaults.allStarTeams,
  allStarMirrorLeagueRules: viewDefaults.allStarMirrorLeagueRules,
  allStarDunkContest: viewDefaults.allStarDunkContest,
  allStarDunkContestPlayers: viewDefaults.allStarDunkContestPlayers,
  allStarThreePointContest: viewDefaults.allStarThreePointContest,
  allStarThreePointContestPlayers: viewDefaults.allStarThreePointContestPlayers,
  allStarShootingStars: viewDefaults.allStarShootingStars,
  allStarShootingStarsMode: viewDefaults.allStarShootingStarsMode,
  allStarShootingStarsTeams: viewDefaults.allStarShootingStarsTeams,
  allStarShootingStarsPlayersPerTeam: viewDefaults.allStarShootingStarsPlayersPerTeam,
  allStarShootingStarsTotalPlayers: viewDefaults.allStarShootingStarsTotalPlayers,
  allStarSkillsChallenge: viewDefaults.allStarSkillsChallenge,
  allStarSkillsChallengeMode: viewDefaults.allStarSkillsChallengeMode,
  allStarSkillsChallengeTeams: viewDefaults.allStarSkillsChallengeTeams,
  allStarSkillsChallengePlayersPerTeam: viewDefaults.allStarSkillsChallengePlayersPerTeam,
  allStarSkillsChallengeTotalPlayers: viewDefaults.allStarSkillsChallengeTotalPlayers,
  allStarHorse: viewDefaults.allStarHorse,
  allStarHorseParticipants: viewDefaults.allStarHorseParticipants,
  allStarHorseNoPlayerRepeat: viewDefaults.allStarHorseNoPlayerRepeat,
  allStarHorseNoGlobalRepeat: viewDefaults.allStarHorseNoGlobalRepeat,
  allStarOneOnOneEnabled: viewDefaults.allStarOneOnOneEnabled,
  allStarOneOnOneParticipants: viewDefaults.allStarOneOnOneParticipants,
  allStarThroneEnabled: viewDefaults.allStarThroneEnabled,
  allStarThroneFieldSize: viewDefaults.allStarThroneFieldSize,
  allStarThroneFormat: viewDefaults.allStarThroneFormat,
  allStarThroneFirstPossession: viewDefaults.allStarThroneFirstPossession,
  allStarThroneScoring: viewDefaults.allStarThroneScoring,
  allStarThroneShotClock: viewDefaults.allStarThroneShotClock,
  allStarThroneTargetScore: viewDefaults.allStarThroneTargetScore,
  allStarThroneHardCap: viewDefaults.allStarThroneHardCap,
  allStarThronePrizePool: viewDefaults.allStarThronePrizePool,
  allStarThroneMandatoryDefense: viewDefaults.allStarThroneMandatoryDefense,
  risingStarsEnabled: viewDefaults.risingStarsEnabled,
  risingStarsFormat: viewDefaults.risingStarsFormat,
  risingStarsMirrorLeagueRules: viewDefaults.risingStarsMirrorLeagueRules,
  risingStarsQuarterLength: viewDefaults.risingStarsQuarterLength,
  risingStarsEliminationEndings: viewDefaults.risingStarsEliminationEndings,
  celebrityGameEnabled: viewDefaults.celebrityGameEnabled,
  celebrityGameMirrorLeagueRules: viewDefaults.celebrityGameMirrorLeagueRules,
  allStarGameFormat: viewDefaults.allStarGameFormat,
  allStarGameTargetScore: viewDefaults.allStarGameTargetScore,
  allStarQuarterLength: viewDefaults.allStarQuarterLength,
  allStarNumQuarters: viewDefaults.allStarNumQuarters,
  allStarOvertimeDuration: viewDefaults.allStarOvertimeDuration,
  allStarOvertimeTargetPoints: viewDefaults.allStarOvertimeTargetPoints,
  allStarShootoutRounds: viewDefaults.allStarShootoutRounds,
  allStarOvertimeType: viewDefaults.allStarOvertimeType,
  allStarMaxOvertimesEnabled: viewDefaults.allStarMaxOvertimesEnabled,
  allStarMaxOvertimes: viewDefaults.allStarMaxOvertimes,
  allStarOvertimeTieBreaker: viewDefaults.allStarOvertimeTieBreaker,
  gameFormat: leagueStats.gameFormat ?? 'timed',
  gameTargetScore: leagueStats.gameTargetScore ?? 100,
  fourPointLine: leagueStats.fourPointLine ?? false,
  threePointLineEnabled: leagueStats.threePointLineEnabled ?? true,
  multiballCount: leagueStats.multiballCount ?? 1,
  foulOutLimit: leagueStats.foulOutLimit ?? 6,
  teamFoulPenalty: leagueStats.teamFoulPenalty ?? 5,
  quarterLength: leagueStats.quarterLength ?? 12,
  numQuarters: leagueStats.numQuarters ?? 4,
  overtimeDuration: leagueStats.overtimeDuration ?? 5,
  overtimeTargetPoints: leagueStats.overtimeTargetPoints ?? 0,
  shootoutRounds: leagueStats.shootoutRounds ?? 0,
  overtimeType: leagueStats.overtimeType ?? 'standard',
  maxTimeouts: leagueStats.maxTimeouts ?? 7,
  coachChallenges: leagueStats.coachChallenges ?? true,
  maxCoachChallenges: leagueStats.maxCoachChallenges ?? 2,
  challengeReimbursed: leagueStats.challengeReimbursed ?? true,
  shotClockEnabled: leagueStats.shotClockEnabled ?? true,
  shotClockValue: leagueStats.shotClockValue ?? 24,
  backcourtTimerEnabled: leagueStats.backcourtTimerEnabled ?? true,
  backcourtTimerValue: leagueStats.backcourtTimerValue ?? 8,
  offensiveThreeSecondEnabled: leagueStats.offensiveThreeSecondEnabled ?? true,
  offensiveThreeSecondValue: leagueStats.offensiveThreeSecondValue ?? 3,
  defensiveThreeSecondEnabled: leagueStats.defensiveThreeSecondEnabled ?? true,
  defensiveThreeSecondValue: leagueStats.defensiveThreeSecondValue ?? 3,
  inboundTimerEnabled: leagueStats.inboundTimerEnabled ?? true,
  inboundTimerValue: leagueStats.inboundTimerValue ?? 5,
  backToBasketTimerEnabled: leagueStats.backToBasketTimerEnabled ?? true,
  backToBasketTimerValue: leagueStats.backToBasketTimerValue ?? 5,
  backcourtViolationEnabled: leagueStats.backcourtViolationEnabled ?? true,
  travelingEnabled: leagueStats.travelingEnabled ?? true,
  doubleDribbleEnabled: leagueStats.doubleDribbleEnabled ?? true,
  goaltendingEnabled: leagueStats.goaltendingEnabled ?? true,
  basketInterferenceEnabled: leagueStats.basketInterferenceEnabled ?? true,
  kickedBallEnabled: leagueStats.kickedBallEnabled ?? true,
  flagrantFoulPenaltyEnabled: leagueStats.flagrantFoulPenaltyEnabled ?? true,
  clearPathFoulEnabled: leagueStats.clearPathFoulEnabled ?? true,
  illegalScreenEnabled: leagueStats.illegalScreenEnabled ?? true,
  overTheBackFoulEnabled: leagueStats.overTheBackFoulEnabled ?? true,
  looseBallFoulEnabled: leagueStats.looseBallFoulEnabled ?? true,
  chargingEnabled: leagueStats.chargingEnabled ?? true,
  overtimeEnabled: leagueStats.overtimeEnabled ?? true,
  maxOvertimesEnabled: leagueStats.maxOvertimesEnabled ?? false,
  maxOvertimes: leagueStats.maxOvertimes ?? 0,
  overtimeTieBreaker: leagueStats.overtimeTieBreaker ?? 'sudden_death',
  maxPlayersOnCourt: leagueStats.maxPlayersOnCourt ?? 5,
  substitutionLimitEnabled: leagueStats.substitutionLimitEnabled ?? false,
  maxSubstitutions: leagueStats.maxSubstitutions ?? 0,
  noDribbleRule: leagueStats.noDribbleRule ?? false,
  multiballEnabled: leagueStats.multiballEnabled ?? false,
  threePointLineDistance: leagueStats.threePointLineDistance ?? 23.75,
  fourPointLineDistance: leagueStats.fourPointLineDistance ?? 27,
  dunkValue: leagueStats.dunkValue ?? 2,
  midrangeValue: leagueStats.midrangeValue ?? 2,
  heaveRuleEnabled: leagueStats.heaveRuleEnabled ?? false,
  halfCourtShotValue: leagueStats.halfCourtShotValue ?? 3,
  clutchTimeoutLimit: leagueStats.clutchTimeoutLimit ?? 2,
  handcheckingEnabled: leagueStats.handcheckingEnabled ?? false,
  illegalZoneDefenseEnabled: leagueStats.illegalZoneDefenseEnabled ?? false,
  outOfBoundsEnabled: leagueStats.outOfBoundsEnabled ?? true,
  freeThrowDistance: leagueStats.freeThrowDistance ?? 15,
  rimHeight: leagueStats.rimHeight ?? 10,
  ballWeight: leagueStats.ballWeight ?? 1.4,
  startOfPossessionMethod: leagueStats.startOfPossessionMethod ?? 'jump_ball',
  possessionPattern: leagueStats.possessionPattern ?? 'nba',
  courtLength: leagueStats.courtLength ?? 94,
  baselineLength: leagueStats.baselineLength ?? 50,
  keyWidth: leagueStats.keyWidth ?? 16,
  cornerThrowInEnabled: leagueStats.cornerThrowInEnabled ?? false,
  techEjectionLimit: leagueStats.techEjectionLimit ?? 2,
  flagrant1EjectionLimit: leagueStats.flagrant1EjectionLimit ?? 2,
  flagrant2EjectionLimit: leagueStats.flagrant2EjectionLimit ?? 1,
  fightingInstantEjection: leagueStats.fightingInstantEjection ?? true,
  useYellowRedCards: leagueStats.useYellowRedCards ?? false,
  shotClockResetOffensiveRebound: leagueStats.shotClockResetOffensiveRebound ?? 14,
  currency: leagueStats.currency ?? 'USD',
  tradesAllowed: leagueStats.tradesAllowed ?? true,
  pbaLocalEligibilityMode: leagueStats.pbaLocalEligibilityMode ?? 'registered_roster',
  salaryCap: leagueStats.salaryCap ?? 154647000,
  salaryCapEnabled: leagueStats.salaryCapEnabled ?? true,
  salaryCapType: leagueStats.salaryCapType ?? 'soft',
  minimumPayrollEnabled: leagueStats.minimumPayrollEnabled ?? true,
  minimumPayrollPercentage: leagueStats.minimumPayrollPercentage ?? 90,
  luxuryTaxEnabled: leagueStats.luxuryTaxEnabled ?? true,
  luxuryTaxThresholdPercentage: leagueStats.luxuryTaxThresholdPercentage ?? 121.5,
  apronsEnabled: leagueStats.apronsEnabled ?? true,
  numberOfAprons: leagueStats.numberOfAprons ?? 2,
  firstApronPercentage: leagueStats.firstApronPercentage ?? 126.7,
  secondApronPercentage: leagueStats.secondApronPercentage ?? 134.4,
  tradeMatchingRatioUnder: leagueStats.tradeMatchingRatioUnder ?? 1.25,
  tradeMatchingRatioOver1st: leagueStats.tradeMatchingRatioOver1st ?? 1.10,
  tradeMatchingRatioOver2nd: leagueStats.tradeMatchingRatioOver2nd ?? 1.00,
  restrictCashSendOver2ndApron: leagueStats.restrictCashSendOver2ndApron ?? true,
  restrictAggregationOver2ndApron: leagueStats.restrictAggregationOver2ndApron ?? true,
  restrictSignAndTradeAcquisitionOver1stApron: leagueStats.restrictSignAndTradeAcquisitionOver1stApron ?? true,
  freezePickAt2ndApron: leagueStats.freezePickAt2ndApron ?? true,
  restrictTPEProvenanceOver2ndApron: leagueStats.restrictTPEProvenanceOver2ndApron ?? true,
  postSigningMoratoriumEnabled: leagueStats.postSigningMoratoriumEnabled ?? true,
  twoWayContractsEnabled: leagueStats.twoWayContractsEnabled ?? true,
  nonGuaranteedContractsEnabled: leagueStats.nonGuaranteedContractsEnabled ?? true,
  minPlayersPerTeam: leagueStats.minPlayersPerTeam ?? 14,
  maxPlayersPerTeam: leagueStats.maxPlayersPerTeam ?? 17,
  maxStandardPlayersPerTeam: leagueStats.maxStandardPlayersPerTeam ?? 15,
  maxTwoWayPlayersPerTeam: leagueStats.maxTwoWayPlayersPerTeam ?? 3,
  maxTrainingCampRoster: leagueStats.maxTrainingCampRoster ?? 21,
  minContractType: leagueStats.minContractType ?? 'dynamic',
  minContractStaticAmount: leagueStats.minContractStaticAmount ?? 1.27287,
  maxContractType: leagueStats.maxContractType ?? 'service_tiered',
  maxContractStaticPercentage: leagueStats.maxContractStaticPercentage ?? 30,
  supermaxEnabled: leagueStats.supermaxEnabled ?? true,
  supermaxPercentage: leagueStats.supermaxPercentage ?? 35,
  supermaxMinYears: leagueStats.supermaxMinYears ?? 8,
  rookieExtEnabled: leagueStats.rookieExtEnabled ?? true,
  rookieExtPct: leagueStats.rookieExtPct ?? 25,
  rookieExtRosePct: leagueStats.rookieExtRosePct ?? 30,
  birdRightsEnabled: leagueStats.birdRightsEnabled ?? true,
  minContractLength: leagueStats.minContractLength ?? 1,
  maxContractLengthStandard: leagueStats.maxContractLengthStandard ?? 4,
  maxContractLengthBird: leagueStats.maxContractLengthBird ?? 5,
  playerOptionsEnabled: leagueStats.playerOptionsEnabled ?? true,
  tenDayContractsEnabled: leagueStats.tenDayContractsEnabled ?? true,
  inflationEnabled: leagueStats.inflationEnabled ?? true,
  inflationMin: leagueStats.inflationMin ?? 0,
  inflationMax: leagueStats.inflationMax ?? 10,
  inflationAverage: leagueStats.inflationAverage ?? 5.5,
  inflationStdDev: leagueStats.inflationStdDev ?? 2,
  mleEnabled: leagueStats.mleEnabled ?? true,
  roomMleAmount: leagueStats.roomMleAmount ?? 8_781_000,
  nonTaxpayerMleAmount: leagueStats.nonTaxpayerMleAmount ?? 14_104_000,
  taxpayerMleAmount: leagueStats.taxpayerMleAmount ?? 5_685_000,
  biannualEnabled: leagueStats.biannualEnabled ?? true,
  biannualAmount: leagueStats.biannualAmount ?? 4_767_000,
  roomMlePercentage: (leagueStats as any).roomMlePercentage ?? 5.68,
  nonTaxpayerMlePercentage: (leagueStats as any).nonTaxpayerMlePercentage ?? 9.12,
  taxpayerMlePercentage: (leagueStats as any).taxpayerMlePercentage ?? 3.68,
  biannualPercentage: (leagueStats as any).biannualPercentage ?? 3.08,
  tradableDraftPickSeasons: leagueStats.tradableDraftPickSeasons ?? 7,
  stepienRuleEnabled: leagueStats.stepienRuleEnabled ?? true,
  tradeExceptionsEnabled: leagueStats.tradeExceptionsEnabled ?? true,
  disabledPlayerExceptionEnabled: leagueStats.disabledPlayerExceptionEnabled ?? false,
  deadMoneyEnabled: (leagueStats as any).deadMoneyEnabled ?? true,
  ngGuaranteeDeadlineMonth: (leagueStats as any).ngGuaranteeDeadlineMonth ?? 1,
  ngGuaranteeDeadlineDay: (leagueStats as any).ngGuaranteeDeadlineDay ?? 10,
  stretchProvisionEnabled: (leagueStats as any).stretchProvisionEnabled ?? true,
  stretchProvisionMultiplier: (leagueStats as any).stretchProvisionMultiplier ?? 2,
  stretchedDeadMoneyCapPct: (leagueStats as any).stretchedDeadMoneyCapPct ?? 15,
  rfaMatchingEnabled: (leagueStats as any).rfaMatchingEnabled ?? true,
  rfaMatchWindowDays: (leagueStats as any).rfaMatchWindowDays ?? 2,
  rfaAutoDeclineOver2ndApron: (leagueStats as any).rfaAutoDeclineOver2ndApron ?? true,
  tradeDeadlineMonth: leagueStats.tradeDeadlineMonth ?? 2,
  tradeDeadlineOrdinal: leagueStats.tradeDeadlineOrdinal ?? 1,
  tradeDeadlineDayOfWeek: leagueStats.tradeDeadlineDayOfWeek ?? 'Thu',
  faStartMonth: leagueStats.faStartMonth ?? 7,
  faStartDay: leagueStats.faStartDay ?? 1,
  faMoratoriumDays: leagueStats.faMoratoriumDays ?? 0,
  regularSeasonFAEnabled: leagueStats.regularSeasonFAEnabled ?? true,
  postDeadlineMultiYearContracts: leagueStats.postDeadlineMultiYearContracts ?? true,
  rookieScaleType: leagueStats.rookieScaleType ?? 'dynamic',
  rookieStaticAmount: leagueStats.rookieStaticAmount ?? 5,
  rookieMaxContractPercentage: leagueStats.rookieMaxContractPercentage ?? 9,
  rookieScaleAppliesTo: leagueStats.rookieScaleAppliesTo ?? 'first_round',
  rookieContractLength: leagueStats.rookieContractLength ?? 2,
  rookieTeamOptionsEnabled: leagueStats.rookieTeamOptionsEnabled ?? true,
  rookieTeamOptionYears: leagueStats.rookieTeamOptionYears ?? 2,
  rookieRestrictedFreeAgentEligibility: leagueStats.rookieRestrictedFreeAgentEligibility ?? true,
  rookieContractCapException: leagueStats.rookieContractCapException ?? true,
  r2ContractsNonGuaranteed: leagueStats.r2ContractsNonGuaranteed ?? true,
  allNbaTeams: leagueStats.allNbaTeams ?? 3,
  allNbaPlayersPerTeam: leagueStats.allNbaPlayersPerTeam ?? 5,
  allDefenseTeams: leagueStats.allDefenseTeams ?? 2,
  allDefensePlayersPerTeam: leagueStats.allDefensePlayersPerTeam ?? 5,
  allRookieTeams: leagueStats.allRookieTeams ?? 2,
  allRookiePlayersPerTeam: leagueStats.allRookiePlayersPerTeam ?? 5,
  positionlessAwards: leagueStats.positionlessAwards ?? false,
});

const sameRuleValue = (left: RuleValue, right: RuleValue) =>
  Array.isArray(left) || Array.isArray(right)
    ? JSON.stringify(left) === JSON.stringify(right)
    : left === right;

export const hasRulesConfigChanges = (rules: RulesSnapshot, baseline: RulesSnapshot) =>
  Object.entries(baseline).some(([key, value]) => !sameRuleValue(rules[key], value));

const formatRuleKey = (key: string, cupShort: string) =>
  key
    .replace(/^cup/, `${cupShort} `)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, value => value.toUpperCase());

export const resetRulesConfig = (
  baseline: RulesSnapshot,
  setRule: <K extends keyof LeagueStats | string>(key: K, value: any) => void,
) => {
  for (const [key, value] of Object.entries(baseline)) {
    setRule(key, Array.isArray(value) ? [...value] : value);
  }
};

export const saveRulesConfig = async ({
  rules,
  baseline,
  leagueStats,
  dispatchAction,
  cupShort,
}: {
  rules: RulesSnapshot;
  baseline: RulesSnapshot;
  leagueStats: LeagueStats;
  dispatchAction: (action: any) => Promise<void>;
  cupShort: string;
}) => {
  const rawPlayoffFormat = Array.isArray(rules.playoffFormat) ? rules.playoffFormat : [];
  const cleanedFormat = rawPlayoffFormat.map(value => {
    let num = typeof value === 'string' ? parseInt(value, 10) : value;
    if (Number.isNaN(num) || num < 1) num = 1;
    if (num > NBA_MAX_PLAYOFF_SERIES) num = NBA_MAX_PLAYOFF_SERIES;
    if (num % 2 === 0) num += 1;
    if (num > NBA_MAX_PLAYOFF_SERIES) num = NBA_MAX_PLAYOFF_SERIES;
    return num;
  });

  const cleanedMinGames = typeof rules.minGamesRequirement === 'string' ? parseInt(rules.minGamesRequirement, 10) : Number(rules.minGamesRequirement);
  const cleanedMinAge = typeof rules.minAgeRequirement === 'string' ? parseInt(rules.minAgeRequirement, 10) : Number(rules.minAgeRequirement);
  const cleanedGamesPerSeason = Number.isFinite(Number(rules.gamesPerSeason))
    ? Math.min(NBA_MAX_GAMES_PER_SEASON, Math.max(1, Math.round(Number(rules.gamesPerSeason))))
    : 82;
  let cleanedDivisionGames = Number.isFinite(Number(rules.divisionGames))
    ? Math.min(NBA_MAX_DIVISION_GAMES, Math.max(0, Math.round(Number(rules.divisionGames))))
    : 16;
  let cleanedConferenceGames = Number.isFinite(Number(rules.conferenceGames))
    ? Math.min(NBA_MAX_CONFERENCE_GAMES, Math.max(0, Math.round(Number(rules.conferenceGames))))
    : 36;
  if (cleanedDivisionGames + cleanedConferenceGames > cleanedGamesPerSeason) {
    cleanedConferenceGames = Math.max(0, cleanedGamesPerSeason - cleanedDivisionGames);
    if (cleanedDivisionGames > cleanedGamesPerSeason) {
      cleanedDivisionGames = cleanedGamesPerSeason;
      cleanedConferenceGames = 0;
    }
  }

  const { eligibilityRule, draftEligibilityRule: _draftEligibilityRule, playoffFormat: _playoffFormat, ...rawStats } = rules;
  const newStats: any = {
    ...rawStats,
    numGamesPlayoffSeries: cleanedFormat,
    draftEligibilityRule: typeof eligibilityRule === 'string' ? eligibilityRule : 'one_and_done',
    minAgeRequirement: Number.isNaN(cleanedMinAge) ? 19 : cleanedMinAge,
    minGamesRequirement: Number.isNaN(cleanedMinGames) ? 65 : cleanedMinGames,
    gamesPerSeason: cleanedGamesPerSeason,
    divisionGames: cleanedDivisionGames,
    conferenceGames: cleanedConferenceGames,
  };
  {
    const value = Number(newStats.allStarShootingStarsTeams);
    const teams = Number.isFinite(value) ? Math.min(30, Math.max(2, Math.round(value))) : 4;
    newStats.allStarShootingStarsMode = 'team';
    newStats.allStarShootingStarsTeams = teams;
    newStats.allStarShootingStarsPlayersPerTeam = 3;
    newStats.allStarShootingStarsTotalPlayers = teams * 3;
  }
  {
    const value = Number(newStats.allStarSkillsChallengeTeams ?? newStats.allStarSkillsChallengeTotalPlayers);
    const competitors = Number.isFinite(value) ? Math.min(30, Math.max(3, Math.round(value))) : 4;
    newStats.allStarSkillsChallengeMode = 'individual';
    newStats.allStarSkillsChallengeTeams = competitors;
    newStats.allStarSkillsChallengePlayersPerTeam = 1;
    newStats.allStarSkillsChallengeTotalPlayers = competitors;
  }
  {
    const value = Number(newStats.allStarHorseParticipants);
    newStats.allStarHorseParticipants = Number.isFinite(value) ? Math.min(10, Math.max(3, Math.round(value))) : 3;
  }

  const changes = Object.keys(baseline)
    .filter(key => ![
      'allStarShootingStarsMode',
      'allStarShootingStarsPlayersPerTeam',
      'allStarShootingStarsTotalPlayers',
      'allStarSkillsChallengeMode',
      'allStarSkillsChallengePlayersPerTeam',
      'allStarSkillsChallengeTotalPlayers',
    ].includes(key))
    .filter(key => {
      const left = key === 'playoffFormat' ? cleanedFormat : newStats[key as keyof typeof newStats];
      return !sameRuleValue(left as RuleValue, baseline[key]);
    })
    .map(key => formatRuleKey(key, cupShort));

  const penalty = ruleChangeService.checkRapidChangePenalty(changes);
  const preview = changes.slice(0, 8).join(', ');
  const detailedDescription = changes.length > 0
    ? `The Commissioner has announced structural changes touching ${preview}${changes.length > 8 ? ` and ${changes.length - 8} more settings` : ''}.${penalty ? ` ${penalty.description}` : ''}`
    : 'The Commissioner has reaffirmed the current league structure with minor administrative updates.';

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
          legacy: effects.morale.legacy - (penalty?.moralePenalty || 0),
        },
        revenue: effects.revenue,
        viewership: effects.viewership,
        legacy: effects.legacy,
      },
    },
  });

  return cleanedFormat;
};
