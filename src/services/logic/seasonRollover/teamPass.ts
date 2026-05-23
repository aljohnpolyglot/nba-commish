import { type CompetitionSeasonResolution, resolveCompetitionSeason } from '../../competition/competitionResolver';
import { selectCompetitionTeamTids } from '../../competition/competitionScheduler';
import { evaluateSeasonForOwner, type SeasonStatsForOwner } from '../../euro/evaluateSeasonForOwner';
import { drawCupGroups } from '../../nbaCup/drawGroups';
import { processNBAStaffLifecycle } from '../../staff/nbaRealStaffSeed';
import * as tycoonBudget from '../../tycoon/budgetEngine';
import * as tycoonFacility from '../../tycoon/facilityEngine';
import * as tycoonLedger from '../../tycoon/ledgerEngine';
import * as tycoonSponsor from '../../tycoon/sponsorshipEngine';
import { formatGameDateShort, getRolloverDate } from '../../../utils/dateUtils';
import { isNbaCupEnabled } from '../../../utils/ruleFlags';
import { getTeamFullName } from '../../../utils/teamNames';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../../utils/uiMode';
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
  euroHistoricalAwards: HistoricalAward[];
  nbaStaffLifecycle: {
    teams: NonNullable<GameState['teams']>;
    historyEntries: HistoryEntry[];
    freeAgents: StaffFreeAgent[];
  };
}

export function runSeasonRolloverTeamPass({
  state,
  currentYear,
  nextYear,
  teamsAfterJerseyRetirements,
  playersFinalized,
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
    const seasonRecord = {
      ...(existingRecord ?? {}),
      season: currentYear,
      wins: team.wins,
      losses: team.losses,
      won: team.wins,
      lost: team.losses,
      playoffRoundsWon: existingRecord?.playoffRoundsWon ?? 0,
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
  if (isNbaCupEnabled(state.leagueStats)) {
    const previousStandings = state.teams.map(team => ({ tid: team.id, wins: team.wins, losses: team.losses }));
    const groups = drawCupGroups(state.teams, previousStandings, state.saveId ?? 'default', nextYear);
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
        .filter(spec => spec.id === 'endesa' || spec.id === 'euroleague')
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
  const euroBankruptcyNews: NewsItem[] = [];
  const euroBankruptcyHistory: HistoryEntry[] = [];
  const nonNBATeamsWithTycoon = (state.nonNBATeams ?? []).map(team => ({ ...team }));

  if (isEuroIsolatedMode(state)) {
    const endesaResolution = euroCompetitionResolutions.find(result => result.competitionId === 'endesa');
    const euroleagueResolution = euroCompetitionResolutions.find(result => result.competitionId === 'euroleague');

    const getEndesaFinish = (tid: number): number => {
      if (!endesaResolution) return 9;
      const idx = endesaResolution.standings.findIndex(standing => standing.tid === tid);
      return idx === -1 ? 9 : idx + 1;
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

    const getEndesaPrize = (tid: number): number => {
      const spec = state.activeCompetitions?.find(competition => competition.id === 'endesa') as any;
      const pool: any[] = spec?.prizePool ?? [];
      return pool[getEndesaFinish(tid) - 1] ?? 0;
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

    for (const team of [...(teamsWithSweptTPEs as any[]), ...nonNBATeamsWithTycoon]) {
      if (!team.tycoon) continue;
      try {
        const tid = team.id ?? team.tid;
        const endesaFinish = getEndesaFinish(tid);
        const euroleagueStage = getEuroleagueStage(tid);
        const euroleagueAwayGames = countEuroleagueAwayGames(tid);

        const ledger = tycoonBudget.computeAnnualBudget(team, {
          year: currentYear,
          endesaFinishPosition: endesaFinish,
          euroleagueStage,
          euroleagueAwayGames,
          endesaPrizeEUR: getEndesaPrize(tid),
          euroleaguePrizeEUR: getEuroleaguePrize(tid),
        });
        tycoonLedger.snapshot(team, ledger);
        tycoonSponsor.dekrementSponsorshipYears(team.tycoon);
        tycoonFacility.completeFinishedUpgrades(team, nextYear);
        team.tycoon.cashGateOverridesThisSeason = 0;
        team.tycoon.budgetLocked = false;
        delete team.tycoon.budgetLockedYear;

        if (team.ownerProfile) {
          const totalGames = (team.wins ?? 0) + (team.losses ?? 0);
          const ownerLostPatience = tickOwnerPatience(team as NBATeam, {
            domesticPlayoffAppearance: endesaFinish <= 8,
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
          if (ownerLostPatience && state.gameMode === 'gm' && state.userTeamId === tid) {
            pendingEuroBankruptcy = {
              teamId: tid,
              teamName: getTeamFullName(team),
              cashOnHand: team.tycoon.cashOnHand,
              year: nextYear,
            };
            const text = `${team.ownerProfile.name} has lost patience with the ${getTeamFullName(team)} project after repeated missed goals. The board ends your tenure.`;
            euroBankruptcyNews.push({
              id: `euro-owner-patience-${tid}-${currentYear}`,
              text,
              date: state.date,
              type: 'Business',
              tid,
            } as unknown as NewsItem);
            euroBankruptcyHistory.push({ text, date: state.date, type: 'Business', tid } as HistoryEntry);
          }
        }

        team.recentEndesaPositions = [...(team.recentEndesaPositions ?? []), endesaFinish].slice(-3);
        team.recentEuroleagueStages = [...(team.recentEuroleagueStages ?? []), euroleagueStage].slice(-3);
        team.lastEndesaFinish = endesaFinish;
        team.lastEuroleagueStage = euroleagueStage;
        team.lastEuroAwayGames = euroleagueAwayGames;
        if (endesaResolution?.championTid === tid) team.justWonEndesa = true;
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
  }

  const euroHistoricalAwards: HistoricalAward[] = euroCompetitionResolutions.flatMap(result => {
    const champion = result.championTid != null ? resolveAnyTeam(result.championTid, state.teams, state.nonNBATeams ?? []) : null;
    const runnerUp = result.runnerUpTid != null ? resolveAnyTeam(result.runnerUpTid, state.teams, state.nonNBATeams ?? []) : null;
    return [
      ...(champion ? [{
        season: currentYear,
        type: 'Champion',
        name: getTeamFullName(champion),
        tid: result.championTid ?? undefined,
        competitionId: result.competitionId,
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

  const nbaStaffLifecycle = state.leagueType !== 'fictional'
    ? processNBAStaffLifecycle(
        teamsWithSweptTPEs,
        nextYear,
        state.date ?? formatGameDateShort(getRolloverDate(currentYear)),
        state.gameMode === 'gm' ? state.userTeamId : null,
      )
    : { teams: teamsWithSweptTPEs, historyEntries: [], freeAgents: [] };

  return {
    teamsWithSweptTPEs,
    nonNBATeamsWithTycoon,
    nbaCupPatch,
    euroCompetitionResolutions,
    euroChampionHistory,
    euroBankruptcyNews,
    euroBankruptcyHistory,
    pendingEuroBankruptcy,
    euroHistoricalAwards,
    nbaStaffLifecycle,
  };
}
