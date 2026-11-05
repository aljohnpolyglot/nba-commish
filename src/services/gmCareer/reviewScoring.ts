import type { GameState, GmReviewCategory, GmSeasonReview, NBATeam } from '../../types';
import { getFranchiseValuationSnapshot } from '../franchises/franchiseValuation';
import { buildOwnerCoachChatContacts } from '../staff/historicalChatContacts';
import { getCurrentSeasonLedgerPreview } from '../tycoon/ledgerEngine';
import { getCapThresholds, getLeaguePayrollsUSD } from '../../utils/salaryUtils';
import { getActiveLeagueTeams, resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveTeamStrategyProfile, type TeamStrategyProfile } from '../../utils/teamStrategy';
import { getLeagueCurrencyCode } from '../../utils/helpers';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function careerTeam(state: GameState, teamId: number): NBATeam | null {
  const nba = state.teams.find(team => team.id === teamId);
  if (nba) return nba;
  const external = state.nonNBATeams?.find(team => team.tid === teamId);
  const wrapped = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  return external && wrapped ? { ...wrapped, ...external, id: external.tid } as unknown as NBATeam : wrapped;
}

function careerTeams(state: GameState): NBATeam[] {
  return getActiveLeagueTeams(state).map(team => careerTeam(state, team.id) ?? team);
}

function recordFor(team: NBATeam, season: number): { wins: number; losses: number } {
  const recordTeam = team as NBATeam & { won?: number; lost?: number };
  const liveWins = Number(recordTeam.wins ?? recordTeam.won ?? 0);
  const liveLosses = Number(recordTeam.losses ?? recordTeam.lost ?? 0);
  if (liveWins + liveLosses > 0) return { wins: liveWins, losses: liveLosses };
  const row = [...(team.seasons ?? [])].reverse().find(entry => Number(entry.season) === season);
  return { wins: Number(row?.won ?? 0), losses: Number(row?.lost ?? 0) };
}

function playoffRoundsWon(state: GameState, team: NBATeam, season: number): number {
  if (state.playoffs?.season === season) {
    if (state.playoffs.champion === team.id) return 4;
    const appearances = state.playoffs.series.filter(series =>
      series.higherSeedTid === team.id || series.lowerSeedTid === team.id
    );
    const wonRounds = appearances.filter(series => series.winnerId === team.id).map(series => series.round);
    const lostRound = appearances.find(series => series.status === 'complete' && series.winnerId !== team.id)?.round;
    if (lostRound != null) return Math.max(0, lostRound - 1);
    if (wonRounds.length > 0) return Math.max(...wonRounds);
    if (appearances.length > 0) return 0;
  }
  return Number(team.seasons?.find(entry => entry.season === season)?.playoffRoundsWon ?? 0);
}

function playoffLabel(roundsWon: number, madePlayoffs: boolean, champion: boolean): string {
  if (champion || roundsWon >= 4) return 'League Champions';
  if (roundsWon === 3) return 'League Finals';
  if (roundsWon === 2) return 'Conference Finals';
  if (roundsWon === 1) return 'Conference Semifinals';
  return madePlayoffs ? 'First Round' : 'Missed Playoffs';
}

function assessment(impact: number): Pick<GmReviewCategory, 'grade' | 'assessment' | 'tone'> {
  if (impact >= 13) return { grade: 'A', assessment: 'EXCELLENT', tone: 'excellent' };
  if (impact >= 6) return { grade: 'B+', assessment: 'GOOD', tone: 'good' };
  if (impact >= -2) return { grade: 'C', assessment: 'ACCEPTABLE', tone: 'acceptable' };
  if (impact >= -10) return { grade: 'D', assessment: 'BELOW EXPECTATIONS', tone: 'poor' };
  return { grade: 'F', assessment: 'FAILED', tone: 'failed' };
}

function expectedWinRate(strategy: StrategyWithCulture): number {
  const target: Record<string, number> = {
    contending: 0.62, win_now: 0.56, play_in_push: 0.5, neutral: 0.48,
    retooling: 0.44, cap_clearing: 0.4, rebuilding: 0.35, development: 0.35,
  };
  return clamp((target[strategy.profile.key] ?? 0.48) + strategy.cultureBoost, 0.32, 0.7);
}

interface StrategyWithCulture {
  profile: TeamStrategyProfile;
  cultureBoost: number;
  marketTier: string;
  championships: number;
  recentChampionships: number;
  valuationUSD: number;
  populationMillions: number;
}

function strategyContext(state: GameState, team: NBATeam, teams: NBATeam[]): StrategyWithCulture {
  const franchise = getFranchiseValuationSnapshot(state, team);
  return {
    profile: resolveTeamStrategyProfile({
      team,
      teams,
      players: state.players,
      leagueStats: state.leagueStats,
      currentYear: state.leagueStats.year,
      gameMode: state.gameMode,
      userTeamId: state.userTeamId,
    }),
    cultureBoost: clamp(franchise.championships * 0.009 + franchise.recentChampionships * 0.018, 0, 0.09),
    ...franchise,
  };
}

function regularSeasonCategory(
  team: NBATeam,
  teams: NBATeam[],
  season: number,
  strategy: StrategyWithCulture,
): GmReviewCategory {
  const record = recordFor(team, season);
  const games = Math.max(1, record.wins + record.losses);
  const winRate = record.wins / games;
  const ranked = teams
    .map(candidate => ({ id: candidate.id, ...recordFor(candidate, season) }))
    .sort((left, right) => right.wins - left.wins || left.losses - right.losses);
  const finish = Math.max(1, ranked.findIndex(entry => entry.id === team.id) + 1);
  const impact = clamp(Math.round((winRate - expectedWinRate(strategy)) * 70), -18, 17);
  return {
    key: 'regularSeason', label: 'Regular Season', impact, ...assessment(impact),
    details: [
      { label: 'Record', value: `${record.wins}–${record.losses}` },
      { label: 'League finish', value: `${finish}${finish === 1 ? 'st' : finish === 2 ? 'nd' : finish === 3 ? 'rd' : 'th'}` },
      { label: 'Owner assessment', value: assessment(impact).assessment },
      { label: 'Approval impact', value: `${impact >= 0 ? '+' : ''}${impact}` },
    ],
  };
}

function playoffsCategory(
  state: GameState,
  team: NBATeam,
  season: number,
  strategy: StrategyWithCulture,
): GmReviewCategory {
  const rounds = playoffRoundsWon(state, team, season);
  const inBracket = state.playoffs?.series.some(series => series.higherSeedTid === team.id || series.lowerSeedTid === team.id) ?? false;
  const madePlayoffs = inBracket || rounds > 0;
  const champion = state.playoffs?.champion === team.id || rounds >= 4;
  const expectedRounds: Record<string, number> = {
    contending: 2.5, win_now: 1.5, play_in_push: 0.5, neutral: 0.5,
    retooling: 0, cap_clearing: 0, rebuilding: 0, development: 0,
  };
  const cultureTarget = Math.min(1, strategy.cultureBoost * 10);
  const achieved = champion ? 4 : madePlayoffs ? rounds + 0.5 : 0;
  const impact = clamp(Math.round((achieved - (expectedRounds[strategy.profile.key] ?? 0.5) - cultureTarget) * 7), -20, 22);
  const previousRounds = Number(team.seasons?.find(entry => entry.season === season - 1)?.playoffRoundsWon ?? 0);
  return {
    key: 'playoffs', label: 'Playoffs', impact, ...assessment(impact),
    details: [
      { label: 'Result', value: playoffLabel(rounds, madePlayoffs, champion) },
      { label: 'Previous season', value: playoffLabel(previousRounds, previousRounds >= 0, previousRounds >= 4) },
      { label: 'Owner assessment', value: assessment(impact).assessment },
      { label: 'Approval impact', value: `${impact >= 0 ? '+' : ''}${impact}` },
    ],
  };
}

function financesCategory(
  state: GameState,
  team: NBATeam,
  teams: NBATeam[],
  season: number,
  strategy: StrategyWithCulture,
  playoffImpact: number,
): GmReviewCategory {
  const payrollByTeam = getLeaguePayrollsUSD(state.players, teams, season, state.leagueStats);
  const payrolls = teams.map(candidate => ({
    id: candidate.id,
    payroll: payrollByTeam.get(candidate.id) ?? 0,
  })).sort((left, right) => right.payroll - left.payroll);
  const payroll = payrolls.find(entry => entry.id === team.id)?.payroll ?? 0;
  const payrollRank = Math.max(1, payrolls.findIndex(entry => entry.id === team.id) + 1);
  const thresholds = getCapThresholds(state.leagueStats);
  const winNow = strategy.profile.key === 'contending' || strategy.profile.key === 'win_now';
  const resultJustified = playoffImpact >= 5 || recordFor(team, season).wins >= 50;
  let impact = 3;
  let justification = 'Spending stayed within expectations';
  if (Number.isFinite(thresholds.salaryCap)) {
    if (payroll >= thresholds.secondApron) {
      impact = resultJustified ? 2 : -11;
      justification = resultJustified ? 'Deep run justified second-apron spending' : 'Second-apron spending did not produce results';
    } else if (payroll >= thresholds.firstApron) {
      impact = resultJustified ? 3 : -7;
      justification = resultJustified ? 'Results justified aggressive spending' : 'High spending missed its target';
    } else if (payroll >= thresholds.luxuryTax) {
      impact = winNow ? 1 : -4;
      justification = winNow ? 'Tax spending matched the team strategy' : 'Tax spending was high for the current plan';
    } else if (winNow && payroll < thresholds.salaryCap * 0.85) {
      impact = -5;
      justification = 'The roster was underfunded for a win-now season';
    }
    if (payroll >= thresholds.luxuryTax && impact < 0) {
      const marketTolerance = strategy.marketTier.includes('Tier 1') ? 3 : strategy.marketTier.includes('Tier 2') ? 1 : 0;
      impact = Math.min(0, impact + marketTolerance);
      if (marketTolerance > 0) justification += '; the market can absorb more spending';
    }
  } else {
    const percentile = payrolls.length > 1 ? 1 - ((payrollRank - 1) / (payrolls.length - 1)) : 0.5;
    const marketTolerance = strategy.marketTier.includes('Tier 1') ? 0.85 : strategy.marketTier.includes('Tier 2') ? 0.7 : 0.55;
    impact = percentile > marketTolerance && !resultJustified ? -5 : resultJustified ? 4 : 1;
    justification = resultJustified ? 'Results justified league-relative spending' : impact < 0 ? 'Spending outpaced the result' : 'Spending matched the club position';
  }
  const ledger = state.leagueStats.uiMode === 'euro_isolated'
    ? getCurrentSeasonLedgerPreview(team)
    : null;
  if (ledger) {
    impact = clamp(impact + (ledger.profit >= 0 ? 3 : ledger.profit < -5_000_000 ? -7 : -3), -14, 12);
    justification = ledger.profit >= 0 ? 'The club closed the year on stable footing' : 'The club finished the year at a loss';
  }
  return {
    key: 'finances', label: 'Finances', impact, ...assessment(impact),
    details: [
      { label: 'Payroll', value: `${getLeagueCurrencyCode(state.leagueStats)} ${(payroll / 1_000_000).toFixed(1)}M` },
      { label: 'League payroll rank', value: `${payrollRank}${payrollRank === 1 ? 'st' : payrollRank === 2 ? 'nd' : payrollRank === 3 ? 'rd' : 'th'}` },
      { label: 'Spending justification', value: justification },
      { label: 'Approval impact', value: `${impact >= 0 ? '+' : ''}${impact}` },
    ],
  };
}

export interface GmReviewBuildResult {
  review: GmSeasonReview;
  strategy: TeamStrategyProfile;
}

export function buildGmSeasonReview(
  state: GameState,
  annualSalary: number,
  yearsRemaining: number,
  previousApproval: number,
  gracePeriodActive: boolean,
): GmReviewBuildResult | null {
  if (state.userTeamId == null) return null;
  const team = careerTeam(state, state.userTeamId);
  if (!team) return null;
  const teams = careerTeams(state);
  const season = state.leagueStats.year;
  const strategy = strategyContext(state, team, teams);
  const regular = regularSeasonCategory(team, teams, season, strategy);
  const playoffs = playoffsCategory(state, team, season, strategy);
  const finances = financesCategory(state, team, teams, season, strategy, playoffs.impact);
  if (state.leagueStats.uiMode === 'pba_isolated') {
    for (const category of [regular, playoffs, finances]) {
      category.impact = Math.max(0, category.impact);
      Object.assign(category, assessment(category.impact));
      const impactRow = category.details.find(detail => detail.label === 'Approval impact');
      if (impactRow) impactRow.value = `+${category.impact}`;
      const assessmentRow = category.details.find(detail => detail.label === 'Owner assessment');
      if (assessmentRow) assessmentRow.value = category.assessment;
    }
  }
  const seasonImpact = regular.impact + playoffs.impact + finances.impact;
  const currentApproval = clamp(previousApproval + seasonImpact, state.leagueStats.uiMode === 'pba_isolated' ? 45 : 0, 100);
  const dismissed = !gracePeriodActive && state.leagueStats.uiMode !== 'pba_isolated' && currentApproval < 25;
  const owner = buildOwnerCoachChatContacts(state).find(contact => contact.league === 'Owner');
  const teamName = getTeamFullName(team);
  return {
    strategy: strategy.profile,
    review: {
      id: `gm-review-${team.id}-${season}`,
      season,
      teamId: team.id,
      teamName,
      ownerName: owner?.name ?? `${teamName} Ownership Group`,
      ownerPortraitUrl: owner?.avatarUrl,
      annualSalary,
      currency: getLeagueCurrencyCode(state.leagueStats),
      contractYearsRemaining: yearsRemaining,
      previousApproval,
      currentApproval,
      seasonImpact,
      categories: [regular, playoffs, finances],
      decision: dismissed ? 'dismissed' : 'approved',
      gracePeriodActive,
      ownerMessage: dismissed
        ? 'The results have not met our expectations. We have decided to move in a different direction.'
        : gracePeriodActive
          ? 'Your project remains on schedule. We expect the team to keep moving forward.'
          : 'The team moved in the right direction this season. We expect you to continue building on this progress.',
    },
  };
}

export function getGmCareerTeam(state: GameState, teamId: number): NBATeam | null {
  return careerTeam(state, teamId);
}

export function getGmCareerLeagueTeams(state: GameState): NBATeam[] {
  return careerTeams(state);
}
