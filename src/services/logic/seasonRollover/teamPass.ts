import { type CompetitionSeasonResolution, resolveCompetitionSeason } from '../../competition/competitionResolver';
import { selectCompetitionTeamTids } from '../../competition/competitionScheduler';
import { evaluateSeasonForOwner, type SeasonStatsForOwner } from '../../euro/evaluateSeasonForOwner';
import { processEuroCoachHiring, type EuroCoachHiringResult } from '../../euro/coachHiring';
import { drawCupGroups } from '../../nbaCup/drawGroups';
import { getSimulationSeed } from '../../saveIdentity';
import { processNBAStaffHiringVacancies, processNBAStaffLifecycle } from '../../staff/nbaRealStaffSeed';
import { FICTIONAL_STAFF_LEAGUE_ID } from '../../fictionalStaffGenerator';
import { processStaffRetirementsForTeams, type StaffRetirementRecord } from '../../staff/staffRetirement';
import { appendCoachAchievementToTeam } from '../../staff/coachAchievements';
import { resolveHeadCoachMember } from '../../staff/coachNameResolver';
import * as tycoonBudget from '../../tycoon/budgetEngine';
import * as tycoonFacility from '../../tycoon/facilityEngine';
import * as tycoonLedger from '../../tycoon/ledgerEngine';
import * as tycoonSponsor from '../../tycoon/sponsorshipEngine';
import { getSeasonEconomyIndex, postClubTransaction } from '../../tycoon/clubFinance';
import { settleSponsorPerformanceBonuses } from '../../tycoon/sponsorPerformanceBonusEngine';
import { matchesScheduleSeason } from '../../competition/competitionSeasonState';
import { EURO_BASKETBALL_SOURCE_ARCHIVES } from '../../../data/euroBasketballSources';
import { formatGameDateShort, getRolloverDate } from '../../../utils/dateUtils';
import { selectEuroleagueParticipants, type EuroleagueSelection } from '../../../utils/euroleagueQualification';
import { getContinentalPrestigeByTid } from '../../euro/continentalPrestige';
import {
  advanceContinentalAgreements,
  agreementCoversSeason,
  seedContinentalAgreements,
  selectProtectedEuroleagueTids,
} from '../../euro/continentalAgreements';
import { usesLegacyNbaCupState } from '../../../utils/ruleFlags';
import { sumPlayerCurrentSalariesUSD } from '../../../utils/salaryUtils';
import { isTwoWayContract } from '../../../utils/contractTypes';
import { getTeamFullName } from '../../../utils/teamNames';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../../utils/uiMode';
import { sweepExpiredTPEs } from '../../../utils/tradeExceptionUtils';
import { type GameState, type HistoricalAward, type NBACupState, type NBAPlayer, type NBATeam, type OwnerProfile, type SetupTierLabel } from '../../../types';

type HistoryEntry = NonNullable<GameState['history']>[number];
type NewsItem = NonNullable<GameState['news']>[number];
type StaffFreeAgent = NonNullable<GameState['staffFreeAgents']>[number];

const OWNER_PATIENCE_THRESHOLD: Record<OwnerProfile['patience'], number> = {
  TriggerHappy: 1,
  Steady: 2,
  LongTerm: 4,
};

export function getMinimumPayrollDistribution(
  state: Pick<GameState, 'players' | 'leagueStats'>,
  teamId: number,
  currentYear: number,
  existingRecord: NonNullable<NBATeam['seasons']>[number] | undefined,
) {
  const enabled = state.leagueStats.minimumPayrollEnabled !== false
    && state.leagueStats.salaryCapEnabled !== false
    && state.leagueStats.salaryCapType !== 'none';
  const cap = Number(state.leagueStats.salaryCap ?? 0);
  if (!enabled || !Number.isFinite(cap) || cap <= 0) return {};

  const retained = Number(existingRecord?.minimumPayrollDistributionUSD ?? 0);
  if (retained > 0) {
    return {
      payrollBeforeDistributionUSD: existingRecord?.payrollBeforeDistributionUSD,
      minimumPayrollUSD: existingRecord?.minimumPayrollUSD,
      minimumPayrollDistributionUSD: retained,
      minimumPayrollDistributions: existingRecord?.minimumPayrollDistributions,
    };
  }

  const roster = state.players
    .filter(player => player.tid === teamId && !isTwoWayContract(player, state.leagueStats))
    .sort((a, b) => String(a.internalId).localeCompare(String(b.internalId)));
  if (roster.length === 0) return {};

  const payrollBeforeDistributionUSD = sumPlayerCurrentSalariesUSD(roster, currentYear);
  const minimumPayrollUSD = Math.round(cap * ((state.leagueStats.minimumPayrollPercentage ?? 90) / 100));
  const minimumPayrollDistributionUSD = Math.max(0, minimumPayrollUSD - payrollBeforeDistributionUSD);
  if (minimumPayrollDistributionUSD <= 0) {
    return { payrollBeforeDistributionUSD, minimumPayrollUSD, minimumPayrollDistributionUSD: 0 };
  }

  const salaryWeights = roster.map(player => Math.max(0, sumPlayerCurrentSalariesUSD([player], currentYear)));
  const totalWeight = salaryWeights.reduce((sum, salary) => sum + salary, 0);
  let remaining = minimumPayrollDistributionUSD;
  const minimumPayrollDistributions = roster.map((player, index) => {
    const isLast = index === roster.length - 1;
    const weight = totalWeight > 0 ? salaryWeights[index] / totalWeight : 1 / roster.length;
    const amountUSD = isLast ? remaining : Math.min(remaining, Math.floor(minimumPayrollDistributionUSD * weight));
    remaining -= amountUSD;
    return { playerId: player.internalId, amountUSD };
  }).filter(entry => entry.amountUSD > 0);

  return {
    payrollBeforeDistributionUSD,
    minimumPayrollUSD,
    minimumPayrollDistributionUSD,
    minimumPayrollDistributions,
  };
}

function tickOwnerPatience(team: NBATeam, stats: SeasonStatsForOwner): boolean {
  const owner = team.ownerProfile;
  if (!owner) return false;
  const outcome = evaluateSeasonForOwner(stats, owner.vision, (team.startingTier ?? 'MidTier') as SetupTierLabel);
  owner.consecutiveBadSeasons = outcome === 'bad' ? (owner.consecutiveBadSeasons ?? 0) + 1 : 0;
  owner.cashInjectionUsedThisSeason = false;
  owner.seasonsSinceLastInjection = (owner.seasonsSinceLastInjection ?? 0) + 1;
  return owner.consecutiveBadSeasons >= OWNER_PATIENCE_THRESHOLD[owner.patience];
}

export interface SeasonRolloverTeamPassArgs {
  state: GameState;
  currentYear: number;
  nextYear: number;
  teamsAfterJerseyRetirements: NonNullable<GameState['teams']>;
  playersFinalized: NBAPlayer[];
  staffFreeAgentsForHiring?: StaffFreeAgent[];
}

export interface SeasonRolloverTeamPassResult {
  teamsWithSweptTPEs: NonNullable<GameState['teams']>;
  nonNBATeamsWithTycoon: NonNullable<GameState['nonNBATeams']>;
  nbaCupPatch: { nbaCup?: NBACupState; nbaCupHistory?: Record<number, NBACupState> };
  euroCompetitionResolutions: CompetitionSeasonResolution[];
  euroChampionHistory: HistoryEntry[];
  euroBankruptcyNews: NewsItem[];
  euroBankruptcyHistory: HistoryEntry[];
  pendingEuroBankruptcy: GameState['pendingEuroBankruptcy'] | undefined;
  pendingEuroleagueWelcome: GameState['pendingEuroleagueWelcome'] | undefined;
  nextEuroleagueTids?: number[];
  nextEuroCupTids?: number[];
  nextContinentalAgreements?: GameState['continentalAgreements'];
  euroleagueSelection?: EuroleagueSelection;
  euroHistoricalAwards: HistoricalAward[];
  nbaStaffLifecycle: {
    teams: NonNullable<GameState['teams']>;
    historyEntries: HistoryEntry[];
    freeAgents: StaffFreeAgent[];
    consumedFreeAgentIds: string[];
    retirementRecords: StaffRetirementRecord[];
  };
  euroCoachHiring: EuroCoachHiringResult;
  pbaStaffHiring: {
    teams: NonNullable<GameState['nonNBATeams']>;
    historyEntries: HistoryEntry[];
    consumedFreeAgentIds: string[];
  };
  nonNBAStaffRetirementHistory: HistoryEntry[];
  staffRetirementRecords: StaffRetirementRecord[];
}

export function runSeasonRolloverTeamPass({
  state,
  currentYear,
  nextYear,
  teamsAfterJerseyRetirements,
  playersFinalized,
  staffFreeAgentsForHiring = [],
}: SeasonRolloverTeamPassArgs): SeasonRolloverTeamPassResult {
  const teamsAfterCashReset = teamsAfterJerseyRetirements.map(team =>
    team.cashUsedInTrades ? { ...team, cashUsedInTrades: 0 } : team,
  );

  const teamsAfterDeadMoneyPrune = teamsAfterCashReset.map(team => {
    if (!team.deadMoney?.length) return team;
    const nextDeadMoney = team.deadMoney
      .map(entry => ({
        ...entry,
        remainingByYear: entry.remainingByYear.filter(yearEntry => {
          const year = parseInt(yearEntry.season.split('-')[0], 10) + 1;
          return year > currentYear;
        }),
      }))
      .filter(entry => entry.remainingByYear.length > 0);
    return { ...team, deadMoney: nextDeadMoney };
  });

  const teamsReset = teamsAfterDeadMoneyPrune.map(team => {
    const existingSeasons: any[] = (team as any).seasons ?? [];
    const existingRecord = existingSeasons.find(season => Number(season.season) === currentYear);
    const minimumPayrollDistribution = getMinimumPayrollDistribution(state, team.id, currentYear, existingRecord);
    const seasonRecord = {
      ...(existingRecord ?? {}),
      season: currentYear,
      wins: team.wins,
      losses: team.losses,
      won: team.wins,
      lost: team.losses,
      playoffRoundsWon: existingRecord?.playoffRoundsWon ?? 0,
      ...minimumPayrollDistribution,
    };
    const nextSeasons = existingRecord
      ? existingSeasons.map(season => Number(season.season) === currentYear ? seasonRecord : season)
      : [...existingSeasons, seasonRecord];
    return {
      ...team,
      wins: 0,
      losses: 0,
      streak: { type: 'W' as const, count: 0 },
      seasons: nextSeasons,
    };
  });

  const teamsWithSweptTPEs = sweepExpiredTPEs(teamsReset, state.date);

  let nbaCupPatch: { nbaCup?: NBACupState; nbaCupHistory?: Record<number, NBACupState> } = {};
  if (usesLegacyNbaCupState(state.leagueStats)) {
    const previousStandings = state.teams.map(team => ({ tid: team.id, wins: team.wins, losses: team.losses }));
    const groups = drawCupGroups(state.teams, previousStandings, getSimulationSeed(state), nextYear);
    nbaCupPatch = {
      nbaCup: {
        year: nextYear,
        status: 'group',
        groups,
        wildcards: { East: null, West: null },
        knockout: [],
      },
      nbaCupHistory: {
        ...(state.nbaCupHistory ?? {}),
        ...(state.nbaCup ? { [currentYear]: state.nbaCup } : {}),
      },
    };
  }

  const euroCompetitionResolutions: CompetitionSeasonResolution[] = isEuroIsolatedMode(state)
    ? (state.activeCompetitions ?? [])
        .map(spec => resolveCompetitionSeason(spec, state.boxScores, currentYear, selectCompetitionTeamTids(spec, state)))
        .filter((result): result is CompetitionSeasonResolution => result !== null)
    : [];

  const euroChampionHistory = euroCompetitionResolutions.flatMap(result => {
    const spec = state.activeCompetitions?.find(competition => competition.id === result.competitionId);
    const champion = result.championTid != null ? resolveAnyTeam(result.championTid, state.teams, state.nonNBATeams ?? []) : null;
    const runnerUp = result.runnerUpTid != null ? resolveAnyTeam(result.runnerUpTid, state.teams, state.nonNBATeams ?? []) : null;
    if (!champion || !spec) return [];
    return [
      {
        text: `${getTeamFullName(champion)} won the ${spec.displayName} ${currentYear} title${runnerUp ? ` over ${getTeamFullName(runnerUp)}` : ''}.`,
        date: state.date,
        type: 'Champion' as const,
        tid: result.championTid,
        competitionId: result.competitionId,
      },
      ...(runnerUp ? [{
        text: `${getTeamFullName(runnerUp)} finished runner-up in the ${spec.displayName} ${currentYear}.`,
        date: state.date,
        type: 'Runner Up' as const,
        tid: result.runnerUpTid,
        competitionId: result.competitionId,
      }] : []),
    ];
  });

  let pendingEuroBankruptcy: GameState['pendingEuroBankruptcy'] | undefined;
  let pendingEuroleagueWelcome: GameState['pendingEuroleagueWelcome'] | undefined;
  let nextEuroleagueTids: number[] | undefined;
  let nextEuroCupTids: number[] | undefined;
  let nextContinentalAgreements: GameState['continentalAgreements'] | undefined;
  let euroleagueSelection: EuroleagueSelection | undefined;
  const euroBankruptcyNews: NewsItem[] = [];
  const euroBankruptcyHistory: HistoryEntry[] = [];
  let nonNBATeamsWithTycoon = (state.nonNBATeams ?? []).map(team => ({ ...team }));

  if (isEuroIsolatedMode(state)) {
    const domesticCompetitionId = state.euroPrimaryCompetitionId ?? 'endesa';
    const euroleagueResolution = euroCompetitionResolutions.find(result => result.competitionId === 'euroleague');
    const domesticCompetitionIds = new Set([
      'endesa',
      domesticCompetitionId,
      ...EURO_BASKETBALL_SOURCE_ARCHIVES
        .filter(source => source.kind === 'domestic')
        .map(source => source.competitionId),
    ]);

    const getDomesticResolution = (tid: number) => euroCompetitionResolutions.find(result =>
      domesticCompetitionIds.has(result.competitionId) && result.standings.some(standing => standing.tid === tid),
    );

    const getDomesticFinish = (tid: number): number => {
      const resolution = getDomesticResolution(tid);
      if (!resolution) return 0;
      const idx = resolution.standings.findIndex(standing => standing.tid === tid);
      return idx === -1 ? 0 : idx + 1;
    };

    const getEuroleagueStage = (tid: number): 'final-four' | 'qf' | 'group' | 'none' => {
      if (!euroleagueResolution) return 'none';
      if (
        euroleagueResolution.championTid === tid ||
        euroleagueResolution.runnerUpTid === tid ||
        euroleagueResolution.semifinalistTids.includes(tid)
      ) {
        return 'final-four';
      }
      if (euroleagueResolution.quarterfinalistTids.includes(tid)) return 'qf';
      return euroleagueResolution.standings.find(standing => standing.tid === tid) ? 'group' : 'none';
    };

    const countEuroleagueAwayGames = (tid: number): number =>
      (state.boxScores ?? []).filter((game: any) =>
        game.competitionId === 'euroleague' && game.awayTeamId === tid && game.season === currentYear,
      ).length;

    const getDomesticPrize = (tid: number): number => {
      const teamDomesticCompetitionId = getDomesticResolution(tid)?.competitionId ?? domesticCompetitionId;
      const spec = state.activeCompetitions?.find(competition => competition.id === teamDomesticCompetitionId) as any;
      const pool: any[] = spec?.prizePool ?? [];
      return pool[getDomesticFinish(tid) - 1] ?? 0;
    };

    const getEuroleaguePrize = (tid: number): number => {
      const spec = state.activeCompetitions?.find(competition => competition.id === 'euroleague') as any;
      const stage = getEuroleagueStage(tid);
      const pool = spec?.prizePool ?? {};
      if (stage === 'final-four') {
        if (euroleagueResolution?.championTid === tid) return pool.champion ?? 0;
        if (euroleagueResolution?.runnerUpTid === tid) return pool.runnerUp ?? 0;
        return pool.semifinal ?? 0;
      }
      if (stage === 'qf') return pool.quarterfinal ?? 0;
      if (stage === 'group') return pool.group ?? 0;
      return 0;
    };

    const competitionPrizeEntries = (tid: number): Array<{ competitionId: string; name: string; amountEUR: number }> => (
      euroCompetitionResolutions.map(result => {
        const spec = state.activeCompetitions?.find(competition => competition.id === result.competitionId) as any;
        const pool = spec?.prizePool;
        if (!pool) return null;
        const finish = result.standings.findIndex(standing => standing.tid === tid);
        let amountEUR = 0;
        if (Array.isArray(pool)) {
          amountEUR = finish >= 0 ? Number(pool[finish] ?? 0) : 0;
        } else if (finish >= 0) {
          amountEUR += Number(pool.participation ?? pool.groupParticipation ?? 0);
          if (result.championTid === tid) amountEUR += Number(pool.champion ?? pool.winner ?? 0);
          else if (result.runnerUpTid === tid) amountEUR += Number(pool.runnerUp ?? 0);
          else if (result.semifinalistTids.includes(tid)) amountEUR += Number(pool.semifinal ?? pool.semiFinalist ?? pool.semi ?? 0);
          else if (result.quarterfinalistTids.includes(tid)) amountEUR += Number(pool.quarterfinal ?? pool.quarterFinalist ?? pool.qf ?? 0);
        }
        return amountEUR > 0 ? { competitionId: result.competitionId, name: spec?.displayName ?? result.competitionId, amountEUR } : null;
      }).filter((entry): entry is { competitionId: string; name: string; amountEUR: number } => entry !== null)
    );

    for (const team of [...(teamsWithSweptTPEs as any[]), ...nonNBATeamsWithTycoon]) {
      if (!team.tycoon) continue;
      try {
        const tid = team.id ?? team.tid;
        const domesticFinish = getDomesticFinish(tid);
        const domesticResolution = getDomesticResolution(tid);
        const teamDomesticCompetitionId = domesticResolution?.competitionId ?? domesticCompetitionId;
        const euroleagueStage = getEuroleagueStage(tid);
        const euroleagueAwayGames = countEuroleagueAwayGames(tid);
        const prizeEntries = competitionPrizeEntries(tid);
        for (const prize of prizeEntries) {
          postClubTransaction(team.tycoon, {
            sourceId: `prize:${prize.competitionId}:${currentYear}`,
            date: state.date,
            season: currentYear,
            category: 'prize',
            label: `${prize.name} prize money`,
            amountEUR: prize.amountEUR,
            competitionId: prize.competitionId,
          });
        }
        const isDomesticPrize = (competitionId: string) => {
          const competition = state.activeCompetitions?.find(entry => entry.id === competitionId);
          return competitionId === teamDomesticCompetitionId || competition?.domesticParentId === teamDomesticCompetitionId;
        };
        const domesticPrizeEUR = prizeEntries
          .filter(entry => isDomesticPrize(entry.competitionId))
          .reduce((sum, entry) => sum + entry.amountEUR, 0) || getDomesticPrize(tid);
        const continentalPrizeEUR = prizeEntries
          .filter(entry => !isDomesticPrize(entry.competitionId))
          .reduce((sum, entry) => sum + entry.amountEUR, 0) || getEuroleaguePrize(tid);

        const homeGames = (state.schedule ?? []).filter(game => (
          matchesScheduleSeason(game, currentYear)
          && game.homeTid === tid
          && game.homeTid !== game.awayTid
          && game.played
          && Number.isFinite(Number(game.attendance))
        ));
        const capacity = Math.max(1, Number(team.tycoon.facilities?.stadium?.capacity ?? 1));
        const averageHomeAttendanceRate = homeGames.length > 0
          ? homeGames.reduce((sum, game) => sum + Number(game.attendance ?? 0), 0) / (homeGames.length * capacity)
          : 0;
        const homeSellouts = homeGames.filter(game => Number(game.attendance ?? 0) >= capacity * 0.99).length;
        const domesticCupWon = euroCompetitionResolutions.some(result => {
          const spec = state.activeCompetitions?.find(competition => competition.id === result.competitionId);
          return spec?.domesticParentId === teamDomesticCompetitionId && result.championTid === tid;
        });
        const academyPromotions = playersFinalized.filter(player => (
          player.tid === tid
          && player.promotedFromAcademy
          && (player.transactions ?? []).some(transaction => (
            transaction.type === 'academy' && Number(transaction.season) === currentYear
          ))
        )).length;
        settleSponsorPerformanceBonuses(team.tycoon, currentYear, state.date, {
          playoffQualified: Boolean(domesticResolution?.playoffSeedTids?.includes(tid))
            || (domesticFinish > 0 && domesticFinish <= 8),
          domesticCupWon,
          domesticLeagueWon: domesticResolution?.championTid === tid,
          continentalQualified: euroleagueStage !== 'none',
          averageHomeAttendanceRate,
          homeSellouts,
          academyPromotions,
        });

        const ledger = tycoonBudget.computeAnnualBudget(
          team,
          tycoonBudget.buildBudgetContext(state, tid, {
            year: currentYear,
            domesticFinishPosition: domesticFinish,
            continentalStage: euroleagueStage,
            continentalAwayGames: euroleagueAwayGames,
            domesticPrizeEUR,
            continentalPrizeEUR,
          }),
        );
        tycoonLedger.snapshot(team, ledger);
        tycoonSponsor.dekrementSponsorshipYears(team.tycoon, currentYear);
        tycoonFacility.completeFinishedUpgrades(team, nextYear);
        team.tycoon.cashGateOverridesThisSeason = 0;
        team.tycoon.budgetLocked = false;
        delete team.tycoon.budgetLockedYear;

        if (team.ownerProfile) {
          const totalGames = (team.wins ?? 0) + (team.losses ?? 0);
          tickOwnerPatience(team as NBATeam, {
            domesticPlayoffAppearance: domesticFinish > 0 && domesticFinish <= 8,
            continentalFinalFour: euroleagueStage === 'final-four',
            winPct: totalGames > 0 ? (team.wins ?? 0) / totalGames : 0,
            netProfitEUR: ledger.profit ?? 0,
            youthProgressed: playersFinalized.some(player =>
              player.tid === tid &&
              player.born?.year &&
              currentYear - player.born.year <= 22 &&
              ((player as any).ovrDeltaThisSeason ?? 0) >= 3,
            ),
          });
        }

        team.recentDomesticPositions = [...(team.recentDomesticPositions ?? team.recentEndesaPositions ?? []), domesticFinish].slice(-3);
        team.recentEuroleagueStages = [...(team.recentEuroleagueStages ?? []), euroleagueStage].slice(-3);
        team.lastDomesticFinish = domesticFinish;
        if (teamDomesticCompetitionId === 'endesa') {
          team.recentEndesaPositions = team.recentDomesticPositions;
          team.lastEndesaFinish = domesticFinish;
        }
        team.lastEuroleagueStage = euroleagueStage;
        team.lastEuroAwayGames = euroleagueAwayGames;
        if (getDomesticResolution(tid)?.championTid === tid) {
          team.justWonDomesticTitle = true;
          if (teamDomesticCompetitionId === 'endesa') team.justWonEndesa = true;
        }
        if (euroleagueStage === 'final-four') team.justReachedEuroFinalFour = true;
        if (state.gameMode === 'gm' && state.userTeamId === tid && team.tycoon.cashOnHand < 0) {
          pendingEuroBankruptcy = {
            teamId: tid,
            teamName: getTeamFullName(team),
            cashOnHand: team.tycoon.cashOnHand,
            year: nextYear,
          };
          const text = `${getTeamFullName(team)} is insolvent. The board ends the project and you must take over a new Euro club.`;
          euroBankruptcyNews.push({
            id: `euro-bankruptcy-${tid}-${currentYear}`,
            text,
            date: state.date,
            type: 'Business',
            tid,
          } as unknown as NewsItem);
          euroBankruptcyHistory.push({ text, date: state.date, type: 'Business', tid } as HistoryEntry);
        }
      } catch (error) {
        console.warn(`[tycoon] year-end snapshot failed for team ${team.id ?? team.tid}`, error);
      }
    }

    const domesticCandidates = euroCompetitionResolutions
      .filter(result => domesticCompetitionIds.has(result.competitionId))
      .flatMap(result => result.championTid != null
        ? [{ tid: result.championTid, finish: 1, competitionId: result.competitionId }]
        : []);
    const euroCupResolution = euroCompetitionResolutions.find(result => result.competitionId === 'eurocup');
    const continentalEntryCandidates = euroCupResolution?.championTid != null
      ? [{ tid: euroCupResolution.championTid, finish: 0, competitionId: 'eurocup' }, ...domesticCandidates]
      : domesticCandidates;
    const euroleagueFinishByTid = Object.fromEntries(
      (euroleagueResolution?.standings ?? []).map(standing => [standing.tid, standing.seed]),
    );
    const previousMemberships = state.euroCompetitionTeamTids ?? {};
    const currentEuroleagueTids = previousMemberships.euroleague ?? state.euroleagueSeededTids ?? [];
    const seededAgreements = seedContinentalAgreements(state, {
      ...previousMemberships,
      euroleague: currentEuroleagueTids,
    }, currentYear);
    const protectedEuroleagueTids = selectProtectedEuroleagueTids(seededAgreements, nextYear);
    const euroleaguePlayoffTids = new Set(
      euroleagueResolution?.knockoutMatches
        .filter(match => match.round === 'quarterfinal')
        .flatMap(match => [match.highSeedTid, match.lowSeedTid])
        ?? [],
    );
    const failedChampionWildcardTids = seededAgreements
      .filter(agreement => agreement.competitionId === 'euroleague' && agreement.origin === 'eurocupChampion')
      .filter(agreement => agreementCoversSeason(agreement, currentYear))
      .map(agreement => agreement.clubId)
      .filter(tid => !euroleaguePlayoffTids.has(tid));
    const continentalPrestigeByTid = getContinentalPrestigeByTid(
      state,
      nonNBATeamsWithTycoon
        .map(team => Number(team.tid))
        .filter(Number.isFinite),
      nextYear,
    );
    euroleagueSelection = selectEuroleagueParticipants({
      nonNBATeams: nonNBATeamsWithTycoon as any,
      clubAliasMap: state.clubAliasMap,
      euroleagueSeededTids: state.euroleagueSeededTids,
      euroleagueSeedSeason: state.euroleagueSeedSeason,
      euroleagueSelectionSeason: nextYear,
      euroleagueCurrentTids: currentEuroleagueTids,
      euroleagueFinishByTid,
      domesticCandidates: continentalEntryCandidates,
      continentalPrestigeByTid,
      protectedTids: protectedEuroleagueTids,
      forcedRemovalTids: failedChampionWildcardTids,
      userTeamId: state.userTeamId,
    }, state.activeCompetitions?.find(competition => competition.id === 'euroleague')?.teamCount);
    nextEuroleagueTids = euroleagueSelection.tids;
    const euroCupSpec = state.activeCompetitions?.find(competition => competition.id === 'eurocup');
    const currentEuroCupTids = state.euroCompetitionTeamTids?.eurocup ?? [];
    if (euroCupSpec && currentEuroCupTids.length > 0) {
      const targetCount = euroCupSpec.teamCount ?? currentEuroCupTids.length;
      const nextEuroleagueSet = new Set(nextEuroleagueTids);
      const currentEuroCupSet = new Set(currentEuroCupTids);
      const euroCupRank = new Map((euroCupResolution?.standings ?? []).map((standing, index) => [standing.tid, index + 1]));
      const retained = currentEuroCupTids
        .filter(tid => !nextEuroleagueSet.has(tid))
        .sort((left, right) => Number(euroCupRank.get(left) ?? Number.MAX_SAFE_INTEGER) - Number(euroCupRank.get(right) ?? Number.MAX_SAFE_INTEGER));
      const droppedEuroleague = currentEuroleagueTids.filter(tid => !nextEuroleagueSet.has(tid));
      const domesticContenders = euroCompetitionResolutions
        .filter(result => domesticCompetitionIds.has(result.competitionId))
        .flatMap(result => {
          const top = result.standings.slice(0, 2).map((standing, index) => ({ tid: standing.tid, finish: index + 1 }));
          if (result.championTid != null && !top.some(candidate => candidate.tid === result.championTid)) {
            top.unshift({ tid: result.championTid, finish: 1 });
          }
          return top;
        })
        .sort((left, right) => left.finish - right.finish || (left.tid === state.userTeamId ? -1 : right.tid === state.userTeamId ? 1 : 0))
        .map(candidate => candidate.tid);
      const entrantPool = [...new Set([...droppedEuroleague, ...domesticContenders])]
        .filter(tid => !nextEuroleagueSet.has(tid) && !currentEuroCupSet.has(tid));
      const entrantCount = Math.min(targetCount, Math.max(2, targetCount - retained.length));
      const entrants = entrantPool.slice(0, entrantCount);
      nextEuroCupTids = [...new Set([...retained.slice(0, Math.max(0, targetCount - entrants.length)), ...entrants])].slice(0, targetCount);
    }
    const eurocupChampionTid = euroCupResolution?.championTid ?? null;
    nextContinentalAgreements = advanceContinentalAgreements({
      agreements: seededAgreements,
      previousMemberships: {
        ...previousMemberships,
        euroleague: currentEuroleagueTids,
      },
      nextMemberships: {
        euroleague: nextEuroleagueTids,
        eurocup: nextEuroCupTids ?? previousMemberships.eurocup ?? [],
      },
      nextSeason: nextYear,
      eurocupChampionTid,
    });
    const userTeam = state.gameMode === 'gm' && state.userTeamId != null
      ? (nonNBATeamsWithTycoon as any[]).find(team => (team.tid ?? team.id) === state.userTeamId)
      : null;
    if (
      userTeam &&
      euroleagueSelection.promotedTids.includes(state.userTeamId)
    ) {
      const domesticSpec = state.activeCompetitions?.find(competition => competition.id === domesticCompetitionId);
      pendingEuroleagueWelcome = {
        season: nextYear,
        teamId: state.userTeamId,
        teamName: getTeamFullName(userTeam),
        domesticFinish: getDomesticFinish(state.userTeamId) || undefined,
        domesticCompetitionName: domesticSpec?.displayName ?? state.leagueStats.leagueName,
        endesaFinish: domesticCompetitionId === 'endesa' ? getDomesticFinish(state.userTeamId) || undefined : undefined,
      };
    }
  }

  for (const result of euroCompetitionResolutions) {
    if (result.championTid == null) continue;
    const spec = state.activeCompetitions?.find(competition => competition.id === result.competitionId);
    nonNBATeamsWithTycoon = nonNBATeamsWithTycoon.map(team => {
      if (team.tid !== result.championTid) return team;
      const coach = resolveHeadCoachMember(team as any, state.staff);
      if (!coach) return team;
      return appendCoachAchievementToTeam(team, {
        coachName: coach.name,
        coachId: coach.id ?? coach.sourcePlayerId,
      }, {
        season: currentYear,
        type: 'Champion',
        label: `${currentYear} ${spec?.displayName ?? result.competitionId} Champion`,
        league: 'euro',
        competitionId: result.competitionId,
        teamId: team.tid,
        teamName: getTeamFullName(team),
        role: 'Head Coach',
      });
    });
  }

  const euroHistoricalAwards: HistoricalAward[] = euroCompetitionResolutions.flatMap(result => {
    const champion = result.championTid != null ? resolveAnyTeam(result.championTid, state.teams, state.nonNBATeams ?? []) : null;
    const runnerUp = result.runnerUpTid != null ? resolveAnyTeam(result.runnerUpTid, state.teams, state.nonNBATeams ?? []) : null;
    const coach = champion ? resolveHeadCoachMember(champion as any, state.staff) : undefined;
    return [
      ...(champion ? [{
        season: currentYear,
        type: 'Champion',
        name: getTeamFullName(champion),
        tid: result.championTid ?? undefined,
        competitionId: result.competitionId,
        coachName: coach?.name,
        coachId: coach?.id ?? coach?.sourcePlayerId,
      } as HistoricalAward & { competitionId: string }] : []),
      ...(runnerUp ? [{
        season: currentYear,
        type: 'Runner Up',
        name: getTeamFullName(runnerUp),
        tid: result.runnerUpTid ?? undefined,
        competitionId: result.competitionId,
      } as HistoricalAward & { competitionId: string }] : []),
    ];
  });

  const nonNBAStaffRetirementPass = processStaffRetirementsForTeams(
    nonNBATeamsWithTycoon as any[],
    currentYear,
    state.date ?? formatGameDateShort(getRolloverDate(currentYear, state.leagueStats, state.schedule)),
  );
  const pbaStaffHiring = isPbaIsolatedMode(state)
    ? (() => {
        const result = processNBAStaffHiringVacancies(
          nonNBAStaffRetirementPass.teams as any[],
          nextYear,
          state.date ?? formatGameDateShort(getRolloverDate(currentYear, state.leagueStats, state.schedule)),
          state.gameMode === 'gm' ? state.userTeamId : null,
          staffFreeAgentsForHiring,
          'pba',
        );
        return {
          teams: result.teams as unknown as NonNullable<GameState['nonNBATeams']>,
          historyEntries: result.historyEntries as HistoryEntry[],
          consumedFreeAgentIds: result.consumedFreeAgentIds,
        };
      })()
    : {
        teams: nonNBAStaffRetirementPass.teams as NonNullable<GameState['nonNBATeams']>,
        historyEntries: [],
        consumedFreeAgentIds: [],
      };
  const euroCoachHiring = isEuroIsolatedMode(state)
    ? processEuroCoachHiring(
        pbaStaffHiring.teams as NonNullable<GameState['nonNBATeams']>,
        nextYear,
        state.date ?? formatGameDateShort(getRolloverDate(currentYear, state.leagueStats, state.schedule)),
        state.gameMode === 'gm' ? state.userTeamId : null,
        staffFreeAgentsForHiring,
        getSeasonEconomyIndex(state, nextYear),
      )
    : {
        teams: pbaStaffHiring.teams as NonNullable<GameState['nonNBATeams']>,
        historyEntries: [],
        freeAgents: [],
        consumedFreeAgentIds: [],
      };

  const nbaStaffLifecycle = processNBAStaffLifecycle(
    teamsWithSweptTPEs,
    nextYear,
    state.date ?? formatGameDateShort(getRolloverDate(currentYear, state.leagueStats, state.schedule)),
    state.gameMode === 'gm' ? state.userTeamId : null,
    staffFreeAgentsForHiring,
    state.leagueType === 'fictional' ? FICTIONAL_STAFF_LEAGUE_ID : 'nba',
  );

  return {
    teamsWithSweptTPEs,
    nonNBATeamsWithTycoon: euroCoachHiring.teams,
    nbaCupPatch,
    euroCompetitionResolutions,
    euroChampionHistory,
    euroBankruptcyNews,
    euroBankruptcyHistory,
    pendingEuroBankruptcy,
    pendingEuroleagueWelcome,
    nextEuroleagueTids,
    nextEuroCupTids,
    nextContinentalAgreements,
    euroleagueSelection,
    euroHistoricalAwards,
    nbaStaffLifecycle,
    euroCoachHiring,
    pbaStaffHiring,
    nonNBAStaffRetirementHistory: [
      ...nonNBAStaffRetirementPass.historyEntries,
      ...pbaStaffHiring.historyEntries,
      ...euroCoachHiring.historyEntries,
    ] as HistoryEntry[],
    staffRetirementRecords: [
      ...nbaStaffLifecycle.retirementRecords,
      ...nonNBAStaffRetirementPass.retirements,
    ],
  };
}
