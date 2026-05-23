import { type GameState, type NBAPlayer } from '../../types';
import { applyCapInflation } from '../../utils/finance/inflationUtils';
import { getFreeAgencyStartDate, getRolloverDate, toISODateString, formatGameDateShort } from '../../utils/dateUtils';
import { getOffseasonState, logOffseasonDrift } from '../offseason/offseasonState';
import { hasUnresolvedEuroSeasonCompetitions, type CompetitionSeasonResolution } from '../competition/competitionResolver';
import { deriveLeagueStartYearFromHistory } from '../playerDevelopment/jerseyRetirementChecker';
import { generateFuturePicks, pruneExpiredPicks, DEFAULT_TRADABLE_PICK_SEASONS } from '../draft/DraftPickGenerator';
import { buildSeasonRolloverNewsAndPruning } from './seasonRollover/newsAndPruning';
import { runSeasonRolloverPlayerPass } from './seasonRollover/playerPass';
import { runSeasonRolloverTeamPass } from './seasonRollover/teamPass';

function computeBirdRightsForRollover(
  player: NBAPlayer,
  leagueStats: GameState['leagueStats'],
  yearsCompleted: number,
): boolean {
  if ((leagueStats.birdRightsEnabled ?? true) && yearsCompleted >= 3) return true;
  return (player as any).hasBirdRights ?? false;
}

export function applySeasonRollover(state: GameState): Partial<GameState> {
  if (state.date) {
    const offseasonState = getOffseasonState(
      state.date,
      state.leagueStats as any,
      state.schedule as any,
      { playoffsActive: hasUnresolvedEuroSeasonCompetitions(state as any), draftComplete: !!state.draftComplete },
    );
    logOffseasonDrift(
      'seasonRollover.applySeasonRollover',
      ['postDraft', 'moratorium'],
      offseasonState.phase,
      `date=${offseasonState.dateStr}`,
    );
  }

  const currentYear = state.leagueStats.year;
  const nextYear = currentYear + 1;
  const leagueStartYear = deriveLeagueStartYearFromHistory(state.history, currentYear);

  const freeAgencyStartDate = getFreeAgencyStartDate(currentYear, state.leagueStats as any);
  const optionDecisionDate = new Date(freeAgencyStartDate.getTime() - 86_400_000);
  const optionDateStr = formatGameDateShort(optionDecisionDate);

  const playerPass = runSeasonRolloverPlayerPass({
    state,
    currentYear,
    nextYear,
    leagueStartYear,
    optionDateStr,
    computeBirdRightsForRollover,
  });

  const leagueStats = state.leagueStats;
  let newSalaryCap = leagueStats.salaryCap ?? 154_647_000;
  let newLuxuryPayroll = leagueStats.luxuryPayroll ?? Math.round(newSalaryCap * (leagueStats.luxuryTaxThresholdPercentage ?? 121.5) / 100);
  let newFirstApron = leagueStats.firstApronPercentage != null ? Math.round(newSalaryCap * leagueStats.firstApronPercentage / 100) : undefined;
  let newSecondApron = leagueStats.secondApronPercentage != null ? Math.round(newSalaryCap * leagueStats.secondApronPercentage / 100) : undefined;
  let newMinContract = leagueStats.minContractStaticAmount ?? 1.273;
  let inflationPctApplied = 0;

  if (leagueStats.inflationEnabled ?? true) {
    const { thresholds, pct } = applyCapInflation(
      {
        salaryCap: newSalaryCap,
        luxuryPayroll: newLuxuryPayroll,
        firstApron: newFirstApron,
        secondApron: newSecondApron,
        minContract: Math.round(newMinContract * 1_000_000),
      },
      {
        inflationMin: leagueStats.inflationMin ?? 0,
        inflationMax: leagueStats.inflationMax ?? 10,
        inflationAverage: leagueStats.inflationAverage ?? 5.5,
        inflationStdDev: leagueStats.inflationStdDev ?? 2.0,
      },
    );
    inflationPctApplied = pct;
    newSalaryCap = thresholds.salaryCap;
    newLuxuryPayroll = thresholds.luxuryPayroll;
    newFirstApron = thresholds.firstApron;
    newSecondApron = thresholds.secondApron;
    newMinContract = (thresholds.minContract ?? Math.round(newMinContract * 1_000_000)) / 1_000_000;
  }

  const windowSize = state.leagueStats.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
  const nbaTeams = (state.teams ?? []).filter(team => team.id >= 0 && team.id < 100);
  const prunedPicks = pruneExpiredPicks(state.draftPicks ?? [], currentYear);
  const updatedPicks = generateFuturePicks(prunedPicks, nbaTeams as any, nextYear, windowSize);

  const newsAndPruning = buildSeasonRolloverNewsAndPruning({
    state,
    currentYear,
    nextYear,
    newSalaryCap,
    inflationPctApplied,
    expiredCount: playerPass.expiredIds.size,
    optionDateStr,
    playerOptionNews: playerPass.playerOptionNews,
    teamOptionNews: playerPass.teamOptionNews,
    newRetirees: playerPass.newRetirees,
    newFarewells: playerPass.newFarewells,
    newInductees: playerPass.newInductees,
    newJerseyRetirements: playerPass.newJerseyRetirements,
    deaths: playerPass.deaths,
  });

  const teamPass = runSeasonRolloverTeamPass({
    state,
    currentYear,
    nextYear,
    teamsAfterJerseyRetirements: playerPass.teamsAfterJerseyRetirements,
    playersFinalized: playerPass.playersFinalized,
  });

  console.log(
    `[SeasonRollover] ${currentYear} → ${nextYear} | ` +
    `Cap: $${(state.leagueStats.salaryCap ?? 0) / 1_000_000 | 0}M → $${(newSalaryCap / 1_000_000).toFixed(1)}M (${newsAndPruning.pctStr}) | ` +
    `${playerPass.expiredIds.size} contracts expired | ` +
    `${playerPass.teamOptionExercisedCount} team opts exercised | ` +
    `${playerPass.teamOptionDeclinedCount} team opts declined | ` +
    `${playerPass.optionExtensionsCount} rookie extensions signed | ` +
    `${playerPass.newRetirees.length} retirements | ${playerPass.newFarewells.length} farewell tours | ` +
    `${playerPass.newInductees.length} HOF inductions | ${playerPass.newJerseyRetirements.length} jersey retirements | ${playerPass.deaths.length} deaths | ` +
    `${updatedPicks.length} total draft picks`,
  );

  return {
    players: playerPass.playersFinalized,
    teams: teamPass.nbaStaffLifecycle.teams,
    nonNBATeams: teamPass.nonNBATeamsWithTycoon,
    draftPicks: updatedPicks,
    bets: newsAndPruning.prunedBets,
    boxScores: newsAndPruning.prunedBoxScores,
    schedule: [],
    christmasGames: [],
    globalGames: [],
    ...({
      historicalPlayoffs: {
        ...((state as any).historicalPlayoffs ?? {}),
        ...(state.playoffs ? { [currentYear]: state.playoffs } : {}),
      },
      competitionHistory: teamPass.euroCompetitionResolutions.length > 0
        ? {
            ...((state as any).competitionHistory ?? {}),
            ...Object.fromEntries(teamPass.euroCompetitionResolutions.map(result => [
              result.competitionId,
              [
                ...(((state as any).competitionHistory?.[result.competitionId] ?? []) as CompetitionSeasonResolution[]).filter(
                  entry => entry.season !== currentYear,
                ),
                result,
              ],
            ])),
          }
        : (state as any).competitionHistory,
    } as any),
    ...teamPass.nbaCupPatch,
    playoffs: undefined,
    allStar: (() => {
      const beltHolderInternalId = (state.allStar as any)?.throne?.champion?.playerId
        ?? (state.allStar as any)?.beltHolderInternalId
        ?? null;
      return beltHolderInternalId
        ? ({
            season: nextYear,
            votes: [],
            startersAnnounced: false,
            reservesAnnounced: false,
            roster: [],
            weekendComplete: false,
            beltHolderInternalId,
          } as any)
        : undefined;
    })(),
    draftLotteryResult: undefined,
    activeDraftPicks: undefined,
    activeDraftOrder: undefined,
    historicalAwards: teamPass.euroHistoricalAwards.length > 0
      ? [
          ...(state.historicalAwards ?? []).filter((award: any) =>
            !(award.competitionId && award.season === currentYear && (award.type === 'Champion' || award.type === 'Runner Up')),
          ),
          ...teamPass.euroHistoricalAwards,
        ]
      : state.historicalAwards,
    faBidding: { markets: playerPass.preservedUserBidMarkets },
    staffFreeAgents: [...(state.staffFreeAgents ?? []), ...teamPass.nbaStaffLifecycle.freeAgents],
    pendingRFAMatchResolutions: [],
    leagueStats: {
      ...state.leagueStats,
      year: nextYear,
      salaryCap: newSalaryCap,
      luxuryPayroll: newLuxuryPayroll,
      ...(newFirstApron != null ? { firstApronAmount: newFirstApron } : {}),
      ...(newSecondApron != null ? { secondApronAmount: newSecondApron } : {}),
      minContractStaticAmount: newMinContract,
      ...(leagueStats.inSeasonTournament &&
      (leagueStats.cupPrizePoolEnabled ?? true) &&
      (leagueStats.cupPrizePoolAutoInflate ?? true) &&
      inflationPctApplied > 0
        ? {
            cupPrizeWinner: Math.round((leagueStats.cupPrizeWinner ?? 500_000) * (1 + inflationPctApplied / 100)),
            cupPrizeRunnerUp: Math.round((leagueStats.cupPrizeRunnerUp ?? 200_000) * (1 + inflationPctApplied / 100)),
            cupPrizeSemi: Math.round((leagueStats.cupPrizeSemi ?? 100_000) * (1 + inflationPctApplied / 100)),
            cupPrizeQuarter: Math.round((leagueStats.cupPrizeQuarter ?? 50_000) * (1 + inflationPctApplied / 100)),
          }
        : {}),
      mleUsage: {},
      revenue: Math.round((state.leagueStats.revenue ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap))),
      ...(state.leagueStats.mediaRights
        ? {
            mediaRights: {
              ...state.leagueStats.mediaRights,
              salaryCap: newSalaryCap / 1_000_000,
              totalRev: (state.leagueStats.mediaRights.totalRev ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap)),
              mediaRev: (state.leagueStats.mediaRights.mediaRev ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap)),
              lpRev: (state.leagueStats.mediaRights.lpRev ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap)),
              isLocked: false,
            },
          }
        : {}),
    },
    retirementAnnouncements: playerPass.newRetirees,
    seasonPreviewDismissed: true,
    draftComplete: undefined,
    ...(teamPass.pendingEuroBankruptcy ? { pendingEuroBankruptcy: teamPass.pendingEuroBankruptcy } : {}),
    news: [
      ...teamPass.euroBankruptcyNews,
      ...newsAndPruning.jerseyRetirementNewsItems,
      ...newsAndPruning.hofNewsItems,
      ...newsAndPruning.mortalityNewsItems,
      ...newsAndPruning.farewellNewsItems,
      ...newsAndPruning.teamOptionNewsItems,
      ...newsAndPruning.playerOptionNewsItems,
      ...newsAndPruning.retirementNewsItems,
      newsAndPruning.rolloverNews,
      ...(state.news ?? []),
    ].slice(0, 200),
    history: [
      ...(state.history ?? []),
      ...playerPass.playerOptionHistory,
      ...newsAndPruning.teamOptionHistoryEntries,
      ...playerPass.optionExtHistory,
      ...teamPass.euroChampionHistory,
      ...teamPass.euroBankruptcyHistory,
      ...newsAndPruning.retirementHistoryEntries,
      ...newsAndPruning.farewellHistoryEntries,
      ...newsAndPruning.hofHistoryEntries,
      ...newsAndPruning.jerseyRetirementHistoryEntries,
      ...newsAndPruning.mortalityHistoryEntries,
      ...playerPass.extRetireHistory,
      ...playerPass.extFAHistory,
      ...teamPass.nbaStaffLifecycle.historyEntries,
    ],
    ...(playerPass.pendingOptionToasts.length > 0
      ? { pendingOptionToasts: [...(state.pendingOptionToasts ?? []), ...playerPass.pendingOptionToasts] }
      : {}),
  };
}

export function shouldFireRollover(state: GameState, dateNorm: string): boolean {
  const year = state.leagueStats.year;
  const rolloverDate = toISODateString(getRolloverDate(year, state.leagueStats as any, state.schedule as any));
  return dateNorm >= rolloverDate;
}
