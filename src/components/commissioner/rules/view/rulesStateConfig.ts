import type { LeagueStats } from '../../../../types';
import { HISTORICAL_GAME_RULE_KEYS } from '../../../../services/era/basketballEraRules';
import { DEFAULT_CAP_INFLATION_AVERAGE, INITIAL_LEAGUE_STATS } from '../../../../constants';
import { calculateRuleChangeEffects } from '../../../../utils/ruleEffects';
import { ruleChangeService } from '../../../../services/RuleChangeService';
import type { createRulesViewDefaults } from './rulesStateViewDefaults';
import { getMinimumPlayoffField, MAX_PLAYOFF_ROUNDS, MIN_PLAYOFF_ROUNDS } from '../../../../utils/playoffFormat';
import { getLeagueCalendar, normalizeLeagueCalendar, validateLeagueCalendar } from '../../../../services/leagueCalendar';
import { WNBA_DEVELOPMENTAL_DEFAULTS } from '../../../../services/wnba/developmentalContracts';

type RulesViewDefaults = ReturnType<typeof createRulesViewDefaults>;

type RuleValue = string | number | boolean | (string | number)[] | LeagueStats['awardSettings'] | LeagueStats['leagueCalendar'] | undefined;
type RulesSnapshot = Record<string, RuleValue>;

const NBA_MAX_PLAYOFF_SERIES = 7;
const NBA_MAX_GAMES_PER_SEASON = 82;
const MODDED_MAX_GAMES_PER_SEASON = 200;
const NBA_MAX_DIVISION_GAMES = 16;
const NBA_MAX_CONFERENCE_GAMES = 36;

export const buildRulesStateBaseline = (leagueStats: LeagueStats, viewDefaults: RulesViewDefaults): RulesSnapshot => ({
  awardSettings: leagueStats.awardSettings,
  playoffsEnabled: viewDefaults.playoffsEnabled,
  playIn: viewDefaults.playIn,
  inSeasonTournament: viewDefaults.inSeasonTournament,
  summerLeagueEnabled: viewDefaults.summerLeagueEnabled,
  summerLeagueTournamentEnabled: viewDefaults.summerLeagueTournamentEnabled,
  cupPrizePoolEnabled: viewDefaults.cupPrizePoolEnabled,
  cupPrizePoolAutoInflate: viewDefaults.cupPrizePoolAutoInflate,
  cupPrizeWinner: viewDefaults.cupPrizeWinner,
  cupPrizeRunnerUp: viewDefaults.cupPrizeRunnerUp,
  cupPrizeSemi: viewDefaults.cupPrizeSemi,
  cupPrizeQuarter: viewDefaults.cupPrizeQuarter,
  playoffFormat: viewDefaults.playoffFormat,
  numPlayoffTeams: viewDefaults.numPlayoffTeams,
  numPlayoffByes: viewDefaults.numPlayoffByes,
  playoffsByConf: viewDefaults.playoffsByConf,
  draftType: viewDefaults.draftType,
  eligibilityRule: viewDefaults.eligibilityRule,
  draftEligibilityRule: viewDefaults.eligibilityRule,
  minAgeRequirement: viewDefaults.minAgeRequirement,
  minGamesRequirement: viewDefaults.minGamesRequirement,
  customScheduleEnabled: viewDefaults.customScheduleEnabled,
  leagueCalendar: viewDefaults.leagueCalendar,
  preseasonGamesPerTeam: viewDefaults.preseasonGamesPerTeam,
  gamesPerSeason: viewDefaults.gamesPerSeason,
  divisionGames: viewDefaults.divisionGames,
  conferenceGames: viewDefaults.conferenceGames,
  jerseyPatchProgramEnabled: viewDefaults.jerseyPatchProgramEnabled,
  allStarGameEnabled: viewDefaults.allStarGameEnabled,
  allStarFormat: viewDefaults.allStarFormat,
  allStarTeams: viewDefaults.allStarTeams,
  allStarCaptainType: viewDefaults.allStarCaptainType,
  allStarPlayerCaptainNameStyle: viewDefaults.allStarPlayerCaptainNameStyle,
  allStarLegendCaptainIds: viewDefaults.allStarLegendCaptainIds,
  allStarTeamNames: viewDefaults.allStarTeamNames,
  allStarMirrorLeagueRules: viewDefaults.allStarMirrorLeagueRules,
  allStarDunkContest: viewDefaults.allStarDunkContest,
  allStarDunkContestPlayers: viewDefaults.allStarDunkContestPlayers,
  allStarDanceContestEnabled: viewDefaults.allStarDanceContestEnabled,
  pbaAllStarDanceContestEnabled: viewDefaults.pbaAllStarDanceContestEnabled,
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
  risingStarsCaptainType: viewDefaults.risingStarsCaptainType,
  risingStarsLegendCaptainIds: viewDefaults.risingStarsLegendCaptainIds,
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
  shootoutRounds: leagueStats.shootoutRounds || 3,
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
  fieldGoalValue: leagueStats.fieldGoalValue ?? 2,
  freeThrowsEnabled: leagueStats.freeThrowsEnabled ?? true,
  dribbleRule: leagueStats.dribbleRule ?? (leagueStats.noDribbleRule ? 'none' : 'continuous'),
  madeBasketRestart: leagueStats.madeBasketRestart ?? 'inbound',
  teamFoulPenaltyMode: leagueStats.teamFoulPenaltyMode ?? 'free_throws',
  teamFoulPenaltyPoints: leagueStats.teamFoulPenaltyPoints ?? 1,
  temporaryDisqualificationFoulLimit: leagueStats.temporaryDisqualificationFoulLimit ?? 0,
  temporaryDisqualificationUntilNextScore: leagueStats.temporaryDisqualificationUntilNextScore ?? false,
  temporaryDisqualificationAllowsSubstitute: leagueStats.temporaryDisqualificationAllowsSubstitute ?? true,
  homeCourtAdvantage: leagueStats.homeCourtAdvantage ?? 50,
  heaveRuleEnabled: leagueStats.heaveRuleEnabled ?? false,
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
  pace: leagueStats.pace ?? 100,
  threePointTendencyFactor: leagueStats.threePointTendencyFactor ?? 1,
  threePointAccuracyFactor: leagueStats.threePointAccuracyFactor ?? 1,
  twoPointAccuracyFactor: leagueStats.twoPointAccuracyFactor ?? 1,
  ftAccuracyFactor: leagueStats.ftAccuracyFactor ?? 1,
  blockFactor: leagueStats.blockFactor ?? 1,
  stealFactor: leagueStats.stealFactor ?? 1,
  turnoverFactor: leagueStats.turnoverFactor ?? 1,
  orbFactor: leagueStats.orbFactor ?? 1,
  foulRateFactor: leagueStats.foulRateFactor ?? 1,
  currency: leagueStats.currency ?? 'USD',
  tradesAllowed: leagueStats.tradesAllowed ?? true,
  pbaLocalEligibilityMode: leagueStats.pbaLocalEligibilityMode ?? 'registered_roster',
  salaryCap: leagueStats.salaryCap ?? INITIAL_LEAGUE_STATS.salaryCap,
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
  developmentalContractsEnabled: leagueStats.developmentalContractsEnabled
    ?? (leagueStats.uiMode === 'wnba_isolated' && leagueStats.year >= 2026),
  maxDevelopmentalPlayersPerTeam: leagueStats.maxDevelopmentalPlayersPerTeam
    ?? WNBA_DEVELOPMENTAL_DEFAULTS.maxPlayersPerTeam,
  developmentalMaxServiceYears: leagueStats.developmentalMaxServiceYears
    ?? WNBA_DEVELOPMENTAL_DEFAULTS.maxServiceYears,
  developmentalMaxGames: leagueStats.developmentalMaxGames
    ?? WNBA_DEVELOPMENTAL_DEFAULTS.maxGames,
  developmentalWeeklyStipendUSD: leagueStats.developmentalWeeklyStipendUSD
    ?? WNBA_DEVELOPMENTAL_DEFAULTS.weeklyStipendUSD,
  developmentalActiveGameBonusUSD: leagueStats.developmentalActiveGameBonusUSD
    ?? WNBA_DEVELOPMENTAL_DEFAULTS.activeGameBonusUSD,
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
  inflationAverage: leagueStats.inflationAverage ?? DEFAULT_CAP_INFLATION_AVERAGE,
  inflationStdDev: leagueStats.inflationStdDev ?? 2,
  mleEnabled: leagueStats.mleEnabled ?? true,
  roomMleAmount: leagueStats.roomMleAmount ?? 8_781_000,
  nonTaxpayerMleAmount: leagueStats.nonTaxpayerMleAmount ?? 14_104_000,
  taxpayerMleAmount: leagueStats.taxpayerMleAmount ?? 5_685_000,
  biannualEnabled: leagueStats.biannualEnabled ?? true,
  biannualAmount: leagueStats.biannualAmount ?? 5_135_000,
  roomMlePercentage: (leagueStats as any).roomMlePercentage ?? 5.68,
  nonTaxpayerMlePercentage: (leagueStats as any).nonTaxpayerMlePercentage ?? 9.12,
  taxpayerMlePercentage: (leagueStats as any).taxpayerMlePercentage ?? 3.68,
  biannualPercentage: (leagueStats as any).biannualPercentage ?? 3.32,
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
  typeof left === 'object' || typeof right === 'object'
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
  const cleanedFormat = (rawPlayoffFormat.length > 0 ? rawPlayoffFormat : [1])
    .slice(0, MAX_PLAYOFF_ROUNDS)
    .map(value => {
    let num = typeof value === 'string' ? parseInt(value, 10) : value;
    if (Number.isNaN(num) || num < 1) num = 1;
    if (num > NBA_MAX_PLAYOFF_SERIES) num = NBA_MAX_PLAYOFF_SERIES;
    if (num % 2 === 0) num += 1;
    if (num > NBA_MAX_PLAYOFF_SERIES) num = NBA_MAX_PLAYOFF_SERIES;
    return num;
    });
  while (cleanedFormat.length < MIN_PLAYOFF_ROUNDS) cleanedFormat.push(1);

  const cleanedMinGames = typeof rules.minGamesRequirement === 'string' ? parseInt(rules.minGamesRequirement, 10) : Number(rules.minGamesRequirement);
  const cleanedMinAge = typeof rules.minAgeRequirement === 'string' ? parseInt(rules.minAgeRequirement, 10) : Number(rules.minAgeRequirement);
  const scheduleMaximum = leagueStats.uiMode === 'nba' ? NBA_MAX_GAMES_PER_SEASON : MODDED_MAX_GAMES_PER_SEASON;
  const cleanedGamesPerSeason = Number.isFinite(Number(rules.gamesPerSeason))
    ? Math.min(scheduleMaximum, Math.max(1, Math.round(Number(rules.gamesPerSeason))))
    : Math.min(scheduleMaximum, leagueStats.gamesPerSeason ?? 82);
  const cleanedPreseasonGames = Number.isFinite(Number(rules.preseasonGamesPerTeam))
    ? Math.min(20, Math.max(0, Math.round(Number(rules.preseasonGamesPerTeam))))
    : Math.max(0, Math.round(getLeagueCalendar(leagueStats).preseasonGamesPerTeam ?? 0));
  const editableCalendar = rules.leagueCalendar && typeof rules.leagueCalendar === 'object' && !Array.isArray(rules.leagueCalendar)
    ? rules.leagueCalendar as NonNullable<LeagueStats['leagueCalendar']>
    : getLeagueCalendar(leagueStats);
  const cleanedCalendar = normalizeLeagueCalendar({
    ...editableCalendar,
    preseasonGamesPerTeam: cleanedPreseasonGames,
  }, getLeagueCalendar(leagueStats));
  const calendarValidation = validateLeagueCalendar(cleanedCalendar, leagueStats.year, cleanedGamesPerSeason, {
    allStarEnabled: rules.allStarGameEnabled !== false,
    cupEnabled: rules.inSeasonTournament === true,
    playInEnabled: rules.playIn === true,
    summerLeagueEnabled: rules.summerLeagueEnabled === true,
  });
  if (!calendarValidation.valid) {
    throw new Error(calendarValidation.errors.join(' '));
  }
  let cleanedDivisionGames = Number.isFinite(Number(rules.divisionGames))
    ? Math.min(leagueStats.uiMode === 'nba' ? NBA_MAX_DIVISION_GAMES : cleanedGamesPerSeason, Math.max(0, Math.round(Number(rules.divisionGames))))
    : Math.max(0, leagueStats.numGamesDiv ?? leagueStats.divisionGames ?? 0);
  let cleanedConferenceGames = Number.isFinite(Number(rules.conferenceGames))
    ? Math.min(leagueStats.uiMode === 'nba' ? NBA_MAX_CONFERENCE_GAMES : cleanedGamesPerSeason, Math.max(0, Math.round(Number(rules.conferenceGames))))
    : Math.max(0, leagueStats.numGamesConf ?? leagueStats.conferenceGames ?? 0);
  if (cleanedDivisionGames + cleanedConferenceGames > cleanedGamesPerSeason) {
    cleanedConferenceGames = Math.max(0, cleanedGamesPerSeason - cleanedDivisionGames);
    if (cleanedDivisionGames > cleanedGamesPerSeason) {
      cleanedDivisionGames = cleanedGamesPerSeason;
      cleanedConferenceGames = 0;
    }
  }

  const {
    eligibilityRule,
    draftEligibilityRule: _draftEligibilityRule,
    playoffFormat: _playoffFormat,
    preseasonGamesPerTeam: _preseasonGamesPerTeam,
    ...rawStats
  } = rules;
  const playoffCapacity = 2 ** cleanedFormat.length;
  const playoffsByConference = rules.playoffsByConf !== false;
  const minimumPlayoffField = getMinimumPlayoffField(cleanedFormat.length, playoffsByConference);
  const requestedPlayoffTeams = Math.min(
    playoffCapacity,
    Math.max(minimumPlayoffField, Math.round(Number(rules.numPlayoffTeams) || leagueStats.numPlayoffTeams || playoffCapacity)),
  );
  const cleanedPlayoffTeams = playoffsByConference && requestedPlayoffTeams % 2 !== 0
    ? requestedPlayoffTeams - 1
    : requestedPlayoffTeams;
  const cleanedPlayoffByes = Math.max(0, playoffCapacity - cleanedPlayoffTeams);
  const newStats: any = {
    ...rawStats,
    numGamesPlayoffSeries: cleanedFormat,
    numPlayoffTeams: cleanedPlayoffTeams,
    numPlayoffByes: cleanedPlayoffByes,
    leagueCalendar: {
      ...cleanedCalendar,
    },
    draftEligibilityRule: typeof eligibilityRule === 'string' ? eligibilityRule : 'one_and_done',
    minAgeRequirement: Number.isNaN(cleanedMinAge) ? 19 : cleanedMinAge,
    minGamesRequirement: Number.isNaN(cleanedMinGames) ? 65 : cleanedMinGames,
    gamesPerSeason: cleanedGamesPerSeason,
    divisionGames: cleanedDivisionGames,
    conferenceGames: cleanedConferenceGames,
    numGamesDiv: cleanedDivisionGames,
    numGamesConf: cleanedConferenceGames,
  };
  if (newStats.risingStarsFormat === 'captains_draft') {
    newStats.risingStarsCaptainType = 'legend';
  }
  newStats.pace = Math.min(400, Math.max(1, Number(newStats.pace) || 100));
  newStats.homeCourtAdvantage = Math.min(100, Math.max(0, Number(newStats.homeCourtAdvantage) || 0));
  for (const key of [
    'threePointTendencyFactor',
    'threePointAccuracyFactor',
    'twoPointAccuracyFactor',
    'ftAccuracyFactor',
    'blockFactor',
    'stealFactor',
    'turnoverFactor',
    'orbFactor',
    'foulRateFactor',
  ]) {
    const value = Number(newStats[key]);
    newStats[key] = Number.isFinite(value) ? Math.min(4, Math.max(0, value)) : 1;
  }
  {
    const minimumRoster = Number.isFinite(Number(newStats.minPlayersPerTeam))
      ? Math.max(1, Math.round(Number(newStats.minPlayersPerTeam)))
      : 14;
    const requested = Number(newStats.maxPlayersOnCourt);
    newStats.maxPlayersOnCourt = Number.isFinite(requested)
      ? Math.max(1, Math.min(10, minimumRoster, Math.round(requested)))
      : 5;
  }
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

  const changedKeys = Object.keys(baseline)
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
    });
  if (changedKeys.some(key => ['gamesPerSeason', 'playoffFormat', 'numPlayoffTeams', 'numPlayoffByes', 'playoffsByConf', 'playIn', 'leagueCalendar'].includes(key))) {
    newStats.calendarRulesCustomized = true;
  }
  if (changedKeys.some(key => ['tradeDeadlineMonth', 'tradeDeadlineOrdinal', 'tradeDeadlineDayOfWeek', 'faStartMonth', 'faStartDay', 'faMoratoriumDays'].includes(key))) {
    newStats.transactionCalendarRulesCustomized = true;
  }
  if (changedKeys.some(key => ['draftType', 'eligibilityRule', 'draftEligibilityRule', 'minAgeRequirement'].includes(key))) {
    newStats.draftRulesCustomized = true;
  }
  if (changedKeys.some(key => key.startsWith('allStar') || key.startsWith('risingStars') || key.startsWith('celebrityGame'))) {
    newStats.allStarRulesCustomized = true;
  }
  if (changedKeys.some(key => ['inSeasonTournament', 'summerLeagueEnabled', 'summerLeagueTournamentEnabled', 'cupPrizePoolEnabled'].includes(key))) {
    newStats.competitionRulesCustomized = true;
  }
  const gameRuleKeys = new Set([
    ...HISTORICAL_GAME_RULE_KEYS,
    'gameFormat', 'gameTargetScore', 'quarterLength', 'numQuarters', 'overtimeEnabled', 'overtimeType',
    'shotClockEnabled', 'shotClockValue', 'fieldGoalValue', 'freeThrowsEnabled', 'threePointLineEnabled',
    'fourPointLine', 'dunkValue', 'maxPlayersOnCourt', 'noDribbleRule', 'dribbleRule', 'madeBasketRestart',
    'teamFoulPenalty', 'teamFoulPenaltyMode', 'teamFoulPenaltyPoints', 'temporaryDisqualificationFoulLimit',
    'temporaryDisqualificationUntilNextScore', 'temporaryDisqualificationAllowsSubstitute', 'homeCourtAdvantage',
  ]);
  if (changedKeys.some(key => gameRuleKeys.has(key))) {
    newStats.gameRulesCustomized = true;
    newStats.historicalGameRulesAutoProgression = false;
  }
  const changes = changedKeys.map(key => formatRuleKey(key, cupShort));

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
