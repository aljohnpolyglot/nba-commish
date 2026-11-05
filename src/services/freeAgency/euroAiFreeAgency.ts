import type { GameState, NBAPlayer, NonNBATeam } from '../../types';
import { computeContractOffer, getContractLimits } from '../../utils/salaryUtils';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { getTeamFullName } from '../../utils/teamNames';
import { isFutureDraftClassPlayer } from '../../utils/prospectUtils';
import { isOnRoster } from '../../utils/teamLookup';
import { buildBudgetContext, projectYearEndCash } from '../tycoon/budgetEngine';
import { getClubSpendableEUR } from '../tycoon/clubFinance';
import { SettingsManager } from '../SettingsManager';
import { isEuroFreeAgentAvailable } from '../euro/historicalNbaMarket';
import { getSigningBonusStepEUR, recommendSigningBonusEUR } from '../transfer/interestModel';
import type { SigningResult } from './passTypes';

function activeEuroTeamIds(state: GameState): Set<number> {
  const competitionId = state.euroPrimaryCompetitionId;
  const explicit = competitionId ? state.euroCompetitionTeamTids?.[competitionId] ?? [] : [];
  if (explicit.length > 0) return new Set(explicit);
  const scheduled = competitionId
    ? state.schedule
        .filter(game => game.competitionId === competitionId)
        .flatMap(game => [game.homeTid, game.awayTid])
        .filter((tid): tid is number => Number.isFinite(tid))
    : [];
  if (scheduled.length > 0) return new Set(scheduled);
  const userTeam = state.nonNBATeams.find(team => team.tid === state.userTeamId);
  return new Set(
    state.nonNBATeams
      .filter(team => !userTeam || team.league === userTeam.league)
      .map(team => team.tid),
  );
}

function playerFitScore(player: NBAPlayer, roster: NBAPlayer[]): number {
  const position = String(player.pos ?? '').charAt(0);
  const samePosition = roster.filter(teammate => String(teammate.pos ?? '').charAt(0) === position).length;
  return Number(player.overallRating ?? 0) * 10 - samePosition * 12;
}

function affordableBonus(
  state: GameState,
  team: NonNBATeam,
  salaryEUR: number,
  years: number,
): number {
  if (!team.tycoon) return 0;
  const step = getSigningBonusStepEUR(salaryEUR);
  const recommended = recommendSigningBonusEUR(salaryEUR, years);
  const projectedAfterSalary = projectYearEndCash(
    team as any,
    buildBudgetContext(state, team.tid),
    salaryEUR,
    state.players,
  );
  const availableCash = getClubSpendableEUR(team.tycoon, state.date);
  const available = Math.max(0, Math.min(projectedAfterSalary, availableCash));
  return Math.floor(Math.min(recommended, available) / step) * step;
}

export function runEuroAIFreeAgencyRound(state: GameState): SigningResult[] {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return [];
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];

  const activeTids = activeEuroTeamIds(state);
  const userTeamId = state.gameMode === 'gm' ? state.userTeamId : null;
  const maxStandard = getStandardRosterLimit(state.leagueStats);
  const targetRosterSize = Math.min(maxStandard, 13);
  const currentYear = state.leagueStats.year;
  const teams = state.nonNBATeams
    .filter(team => activeTids.has(team.tid) && team.tid !== userTeamId && !!team.tycoon)
    .sort((left, right) => left.tid - right.tid);
  let pool = state.players
    .filter(player => isEuroFreeAgentAvailable(state, player))
    .filter(player => !isFutureDraftClassPlayer(player, currentYear));
  const results: SigningResult[] = [];

  for (const team of teams) {
    const roster = state.players.filter(player => player.tid === team.tid && isOnRoster(player));
    if (roster.length >= targetRosterSize || pool.length === 0) continue;
    const candidate = [...pool].sort((left, right) =>
      playerFitScore(right, roster) - playerFitScore(left, roster)
      || left.internalId.localeCompare(right.internalId)
    )[0];
    if (!candidate) continue;

    const limits = getContractLimits(candidate, state.leagueStats);
    const offer = computeContractOffer(candidate, state.leagueStats);
    const salaryEUR = Math.round(Math.min(limits.maxSalaryUSD, Math.max(limits.minSalaryUSD, offer.salaryUSD)));
    const minYears = Math.max(1, Number(state.leagueStats.minContractLength ?? 1));
    const maxYears = Math.max(minYears, Number(state.leagueStats.maxContractLengthStandard ?? 5));
    const years = Math.max(minYears, Math.min(maxYears, Math.floor(offer.years)));
    const signingBonusEUR = affordableBonus(state, team, salaryEUR, years);
    if (signingBonusEUR <= 0) continue;
    if (projectYearEndCash(
      team as any,
      buildBudgetContext(state, team.tid),
      salaryEUR + signingBonusEUR,
      state.players,
    ) < 0) continue;

    results.push({
      playerId: candidate.internalId,
      teamId: team.tid,
      playerName: candidate.name,
      teamName: getTeamFullName(team),
      salaryUSD: salaryEUR,
      contractYears: years,
      contractExp: currentYear + years - 1,
      hasPlayerOption: false,
      signingBonusEUR,
      leagueStatus: team.league,
      signedDate: state.date,
    });
    pool = pool.filter(player => player.internalId !== candidate.internalId);
  }

  return results;
}
