import type { GameState, NBATeam, NBAPlayer, NonNBATeam } from '../../types';
import type { BoardPromise, FinanceRecapLine, SponsorReview, TycoonState } from '../../types/tycoon';
import { ALL_SLOTS } from '../../types/tycoon';
import { getSponsorConflictWarnings } from './sponsorshipEngine';
import { fallbackStaffPayrollEUR, sumStaffPayroll } from './economyScale';
import { getSeasonEconomyIndex, postClubTransaction, settleDueCommitments, settleMatchdayRevenue } from './clubFinance';
import { estimateMatchdayOutcome, estimateTravelCost } from './budgetEngine';
import { buildCommercialMatchdayRecord, upsertCommercialMatchday } from './commercialEngine';
import { normalizeDate } from '../../utils/helpers';
import { isOnRoster, resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { dateForCompetitionSeason } from '../competition/competitionSeasonState';
import { convertUSDToExternalCurrency } from '../../constants';
import { getTycoonStadiumCapacity } from './tierBase';

interface EuroTycoonOpsResult {
  teams: NBATeam[];
  nonNBATeams: NonNBATeam[];
  news: any[];
  socialFeed: any[];
}

function daysBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const start = new Date(`${normalizeDate(a)}T00:00:00Z`).getTime();
  const end = new Date(`${normalizeDate(b)}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${normalizeDate(dateIso)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function rosterWages(players: NBAPlayer[], tid: number): number {
  return players
    .filter((p: any) => p.tid === tid && isOnRoster(p))
    .reduce((sum, p: any) => (
      sum + convertUSDToExternalCurrency((p.contract?.amount ?? 0) * 1000, 'Euroleague')
    ), 0);
}

function initialPayrollAnchor(state: GameState, startDate: string): string {
  const normalizedStart = normalizeDate(startDate);
  const primary = state.activeCompetitions?.find(spec => spec.id === state.euroPrimaryCompetitionId);
  if (!primary) return normalizedStart;
  const seasonStart = dateForCompetitionSeason(
    primary,
    state.leagueStats.year,
    primary.seasonStart.month,
    primary.seasonStart.day,
  ).slice(0, 10);
  return seasonStart <= normalizedStart ? seasonStart : normalizedStart;
}

function staffWages(tycoon: TycoonState, playerPayroll: number): number {
  return sumStaffPayroll(tycoon, 'euro') || fallbackStaffPayrollEUR(playerPayroll);
}

function seedPromises(year: number, tycoon: TycoonState): BoardPromise[] {
  const economyIndex = Math.max(0.05, Number(tycoon.currentEconomyIndex ?? tycoon.historicalEconomyScaleApplied ?? 1));
  return [
    { id: `cash-${year}`, year, type: 'cash', label: 'Keep club cash positive', target: 1, progress: (tycoon.cashOnHand ?? 0) >= 0 ? 1 : 0, status: 'active', confidenceDelta: 8 },
    { id: `medical-${year}`, year, type: 'medical', label: 'Maintain a credible recovery program', target: Math.round(450_000 * economyIndex), progress: Math.min(1, (tycoon.medicalBudget ?? 0) / Math.max(1, 450_000 * economyIndex)), status: 'active', confidenceDelta: 5 },
    { id: `scouting-${year}`, year, type: 'scouting', label: 'Fund a real scouting department', target: Math.round(250_000 * economyIndex), progress: Math.min(1, (tycoon.scoutingInvestment ?? 0) / Math.max(1, 250_000 * economyIndex)), status: 'active', confidenceDelta: 5 },
  ];
}

function updateBoardPromises(tycoon: TycoonState, year: number, endDate: string): void {
  const current = tycoon.boardPromises?.some(p => p.year === year)
    ? [...(tycoon.boardPromises ?? [])]
    : [...(tycoon.boardPromises ?? []), ...seedPromises(year, tycoon)];
  const monthDay = endDate.slice(5, 10);
  const shouldGrade = monthDay >= '06-15';
  let confidence = tycoon.boardConfidence ?? 60;

  tycoon.boardPromises = current.map(p => {
    if (p.year !== year || p.status !== 'active') return p;
    const progress = p.type === 'cash' ? ((tycoon.cashOnHand ?? 0) >= 0 ? 1 : 0)
      : p.type === 'medical' ? Math.min(1, (tycoon.medicalBudget ?? 0) / p.target)
      : p.type === 'scouting' ? Math.min(1, (tycoon.scoutingInvestment ?? 0) / p.target)
      : p.progress;
    if (!shouldGrade) return { ...p, progress };
    const status: BoardPromise['status'] = progress >= 0.95 ? 'kept' : 'missed';
    confidence += status === 'kept' ? p.confidenceDelta : -p.confidenceDelta;
    return { ...p, progress, status };
  }).slice(-12);

  const economyIndex = Math.max(0.05, Number(tycoon.currentEconomyIndex ?? tycoon.historicalEconomyScaleApplied ?? 1));
  if ((tycoon.cashOnHand ?? 0) < -1_000_000 * economyIndex) confidence -= 3;
  tycoon.boardConfidence = clampConfidence(confidence);
  tycoon.ownerFiringRisk = tycoon.boardConfidence < 18 || (tycoon.cashOnHand ?? 0) < -6_000_000 * economyIndex;
}

function buildSponsorReview(tycoon: TycoonState, year: number): SponsorReview | undefined {
  const sponsorships = tycoon.sponsorships ?? {};
  const openSlots = ALL_SLOTS.filter(slot => sponsorships[slot] == null);
  const expiringSlots = ALL_SLOTS.filter(slot => {
    const deal = sponsorships[slot];
    return !!deal && deal.yearsRemaining <= 1;
  });
  if (openSlots.length === 0 && expiringSlots.length === 0) return undefined;
  return {
    id: `sponsor-review-${year}-${openSlots.join('_')}-${expiringSlots.join('_')}`,
    year,
    openSlots,
    expiringSlots,
    conflictWarnings: getSponsorConflictWarnings(tycoon),
  };
}

function maybePressConference(state: GameState, team: NBATeam, endDate: string, daysAdvanced: number) {
  const tycoon = team.tycoon;
  if (!tycoon || tycoon.pendingPressConference || daysAdvanced < 3) return null;
  const tid = (team as any).tid ?? (team as any).id;
  const candidates = (state.players ?? [])
    .filter((p: any) => p.tid === tid && !p.retiredYear)
    .sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
  const player = candidates[0] as any;
  if (!player) return null;
  const seed = String(player.internalId ?? player.pid ?? player.id ?? player.name)
    .split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) + new Date(`${endDate}T00:00:00Z`).getUTCDate();
  if (seed % 6 !== 0 && (tycoon.boardConfidence ?? 60) >= 35) return null;
  return {
    id: `pc-${endDate}-${player.internalId ?? player.pid ?? player.name}`,
    playerId: String(player.internalId ?? player.pid ?? player.id ?? ''),
    playerName: player.name ?? 'A key player',
    headline: `${player.name ?? 'A key player'} wants clarity`,
    prompt: `${player.name ?? 'A key player'} has asked for a public response after questions about role, ambition, and club direction.`,
    options: [
      { id: 'support' as const, label: 'Back the player publicly', boardDelta: -2, moraleDelta: 8 },
      { id: 'discipline' as const, label: 'Demand professionalism', boardDelta: 4, moraleDelta: -5 },
      { id: 'deflect' as const, label: 'Keep it internal', boardDelta: 1, moraleDelta: 1 },
    ],
  };
}

export function applyEuroTycoonDailyOps(
  state: GameState,
  teams: NBATeam[],
  startDate: string,
  endDate: string,
  daysAdvanced: number,
): EuroTycoonOpsResult {
  if (state.leagueStats?.uiMode !== 'euro_isolated' || state.gameMode !== 'gm' || daysAdvanced <= 0) {
    return { teams, nonNBATeams: state.nonNBATeams ?? [], news: [], socialFeed: [] };
  }
  const userTeamId = state.userTeamId;
  const teamIndex = teams.findIndex((t: any) => (t.id ?? t.tid) === userTeamId);
  const nonNBATeamIndex = (state.nonNBATeams ?? []).findIndex(team => team.tid === userTeamId);
  const sourceTeam = teamIndex >= 0 ? teams[teamIndex] : state.nonNBATeams?.[nonNBATeamIndex];
  if (!sourceTeam?.tycoon) return { teams, nonNBATeams: state.nonNBATeams ?? [], news: [], socialFeed: [] };

  const originalTycoon = sourceTeam.tycoon;
  const team = {
    ...sourceTeam,
    tycoon: {
      ...originalTycoon,
      transactions: [...(originalTycoon.transactions ?? [])],
      commitments: (originalTycoon.commitments ?? []).map(commitment => ({ ...commitment })),
      activeReservations: [...(originalTycoon.activeReservations ?? [])],
      loans: (originalTycoon.loans ?? []).map(loan => ({ ...loan })),
      creditFacility: originalTycoon.creditFacility ? { ...originalTycoon.creditFacility } : undefined,
      regionalScoutingBudget: originalTycoon.regionalScoutingBudget
        ? { ...originalTycoon.regionalScoutingBudget }
        : undefined,
      commercialMatchdays: (originalTycoon.commercialMatchdays ?? []).map(record => ({
        ...record,
        playerShirtSales: (record.playerShirtSales ?? []).map(row => ({ ...row })),
      })),
    },
  };
  const tycoon = team.tycoon!;
  tycoon.currentEconomyIndex = getSeasonEconomyIndex(state, state.leagueStats.year);
  const tid = (team as any).tid ?? (team as any).id;
  const news: any[] = [];
  const socialFeed: any[] = [];
  const lines: FinanceRecapLine[] = [];

  for (const transaction of settleDueCommitments(tycoon, endDate)) {
    lines.push({
      label: transaction.label,
      amount: transaction.amountEUR,
      kind: transaction.amountEUR >= 0 ? 'income' : 'expense',
    });
  }

  const lastPay = tycoon.lastTycoonPayslipDate ?? initialPayrollAnchor(state, startDate);
  if (!tycoon.lastTycoonPayslipDate) tycoon.lastTycoonPayslipDate = lastPay;
  const duePeriods = Math.floor(daysBetween(lastPay, endDate) / 14);
  let payrollOut = 0;
  if (duePeriods > 0) {
    const playerPayrollTotal = rosterWages(state.players ?? [], tid);
    const staffPayrollTotal = staffWages(tycoon, playerPayrollTotal);
    for (let period = 1; period <= duePeriods; period++) {
      const payday = addDays(lastPay, period * 14);
      const playerTransaction = postClubTransaction(tycoon, {
        sourceId: `payroll:players:${tid}:${payday}`,
        date: payday,
        season: state.leagueStats.year,
        category: 'wages',
        label: `Player payroll · period ending ${payday}`,
        amountEUR: -Math.round(playerPayrollTotal / 26),
      });
      const staffTransaction = postClubTransaction(tycoon, {
        sourceId: `payroll:staff:${tid}:${payday}`,
        date: payday,
        season: state.leagueStats.year,
        category: 'staff',
        label: `Staff payroll · period ending ${payday}`,
        amountEUR: -Math.round(staffPayrollTotal / 26),
      });
      payrollOut += Math.abs(playerTransaction?.amountEUR ?? 0) + Math.abs(staffTransaction?.amountEUR ?? 0);
    }
    tycoon.lastTycoonPayslipDate = addDays(lastPay, duePeriods * 14);
    if (payrollOut > 0) {
      lines.push({ label: `${duePeriods} payroll run${duePeriods === 1 ? '' : 's'}`, amount: -payrollOut, kind: 'expense' });
    }
  }

  const homeGames = (state.schedule ?? []).filter((g: any) => {
    const d = normalizeDate(g.date ?? '');
    return d > normalizeDate(startDate) && d <= normalizeDate(endDate) && g.played && g.homeTid === tid;
  });
  if (homeGames.length > 0) {
    let matchdayIncome = 0;
    let commercialIncome = 0;
    for (const game of homeGames) {
      const opponent = resolveAnyTeam(game.awayTid, state.teams, state.nonNBATeams ?? []);
      const opponentPrestige = Number((opponent as any)?.tycoon?.cityPrestige ?? 0.5);
      const economyIndex = getSeasonEconomyIndex(state, state.leagueStats.year);
      const estimated = estimateMatchdayOutcome(
        team as NBATeam,
        economyIndex,
        opponentPrestige,
        1,
        state.leagueStats.year,
      );
      const outcome = {
        attendance: Number(game.attendance ?? estimated.attendance),
        ticketPriceEUR: Number(game.ticketPriceEUR ?? estimated.ticketPriceEUR),
        gateRevenueEUR: Number(game.gateRevenueEUR ?? estimated.gateRevenueEUR),
        foodRevenueEUR: Number(game.matchdayFoodRevenueEUR ?? estimated.foodRevenueEUR),
        drinkRevenueEUR: Number(game.matchdayDrinkRevenueEUR ?? estimated.drinkRevenueEUR),
        revenueEUR: Number(game.matchdayRevenueEUR ?? estimated.revenueEUR),
        merchandiseGrossRevenueEUR: Number(game.merchandiseGrossRevenueEUR ?? estimated.merchandiseGrossRevenueEUR),
        merchandiseDistributionCostEUR: Number(game.merchandiseDistributionCostEUR ?? estimated.merchandiseDistributionCostEUR),
        merchandiseRevenueEUR: Number(game.merchandiseRevenueEUR ?? estimated.merchandiseRevenueEUR),
        clubMediaRevenueEUR: Number(game.clubMediaRevenueEUR ?? estimated.clubMediaRevenueEUR),
      };
      const opponentName = getTeamFullName(opponent) || 'opponent';
      const transaction = settleMatchdayRevenue(tycoon, {
        sourceId: `matchday:${game.competitionId ?? 'friendly'}:${game.gid}`,
        date: normalizeDate(game.date),
        season: state.leagueStats.year,
        label: `Home matchday receipts vs ${opponentName}`,
        amountEUR: outcome.revenueEUR,
        competitionId: game.competitionId,
      });
      matchdayIncome += transaction?.amountEUR ?? 0;
      const merchandiseIncome = postClubTransaction(tycoon, {
        sourceId: `commercial:club-shop:${game.competitionId ?? 'friendly'}:${game.gid}`,
        date: normalizeDate(game.date),
        season: state.leagueStats.year,
        category: 'commercial',
        label: `Club shop sales vs ${opponentName}`,
        amountEUR: outcome.merchandiseGrossRevenueEUR,
        competitionId: game.competitionId,
      });
      const distributionExpense = postClubTransaction(tycoon, {
        sourceId: `commercial:distribution:${game.competitionId ?? 'friendly'}:${game.gid}`,
        date: normalizeDate(game.date),
        season: state.leagueStats.year,
        category: 'commercial',
        label: `Merchandise distribution vs ${opponentName}`,
        amountEUR: -outcome.merchandiseDistributionCostEUR,
        competitionId: game.competitionId,
      });
      const mediaIncome = postClubTransaction(tycoon, {
        sourceId: `commercial:media:${game.competitionId ?? 'friendly'}:${game.gid}`,
        date: normalizeDate(game.date),
        season: state.leagueStats.year,
        category: 'commercial',
        label: `Club media revenue vs ${opponentName}`,
        amountEUR: outcome.clubMediaRevenueEUR,
        competitionId: game.competitionId,
      });
      commercialIncome += (merchandiseIncome?.amountEUR ?? 0)
        + (distributionExpense?.amountEUR ?? 0)
        + (mediaIncome?.amountEUR ?? 0);
      upsertCommercialMatchday(tycoon, buildCommercialMatchdayRecord({
        gid: game.gid,
        season: state.leagueStats.year,
        date: normalizeDate(game.date),
        competitionId: game.competitionId,
        opponentTid: game.awayTid,
        opponentName,
        capacity: getTycoonStadiumCapacity(tycoon),
        outcome,
        players: state.players ?? [],
        teamId: tid,
        economyIndex,
      }));
    }
    if (matchdayIncome > 0) {
      lines.push({
        label: `${homeGames.length} home matchday${homeGames.length === 1 ? '' : 's'}`,
        amount: matchdayIncome,
        kind: 'income',
      });
    }
    if (commercialIncome > 0) {
      lines.push({
        label: `${homeGames.length} club shop and media settlement${homeGames.length === 1 ? '' : 's'}`,
        amount: commercialIncome,
        kind: 'income',
      });
    }
  }

  const awayGames = (state.schedule ?? []).filter((game: any) => {
    const date = normalizeDate(game.date ?? '');
    return date > normalizeDate(startDate) && date <= normalizeDate(endDate) && game.played && game.awayTid === tid;
  });
  if (awayGames.length > 0 && tycoon.travelPreferences) {
    let travelOut = 0;
    for (const game of awayGames) {
      const isDomestic = game.competitionId === state.euroPrimaryCompetitionId;
      const opponent = resolveAnyTeam(game.homeTid, state.teams, state.nonNBATeams ?? []);
      const amountEUR = Math.round(
        estimateTravelCost(tycoon.travelPreferences, isDomestic ? 1 : 0, isDomestic ? 0 : 1)
        * getSeasonEconomyIndex(state, state.leagueStats.year),
      );
      const transaction = postClubTransaction(tycoon, {
        sourceId: `travel:${game.competitionId ?? 'friendly'}:${game.gid}`,
        date: String(game.date).slice(0, 10),
        season: state.leagueStats.year,
        category: 'travel',
        label: `Away travel at ${getTeamFullName(opponent) || 'opponent'}`,
        amountEUR: -amountEUR,
        competitionId: game.competitionId,
      });
      travelOut += Math.abs(transaction?.amountEUR ?? 0);
    }
    if (travelOut > 0) lines.push({ label: `${awayGames.length} away trip${awayGames.length === 1 ? '' : 's'}`, amount: -travelOut, kind: 'expense' });
  }

  updateBoardPromises(tycoon, state.leagueStats.year, endDate);

  const pendingReview = buildSponsorReview(tycoon, state.leagueStats.year);
  if (pendingReview && tycoon.pendingSponsorReview?.id !== pendingReview.id) {
    tycoon.pendingSponsorReview = pendingReview;
    news.push({
      id: `tycoon-sponsor-review-${Date.now()}`,
      headline: 'Sponsor Review Required',
      content: `${team.name} have ${pendingReview.openSlots.length} open sponsor slots and ${pendingReview.expiringSlots.length} expiring deals to review.`,
      date: endDate,
      type: 'league',
      read: false,
      isNew: true,
    });
  }

  const press = maybePressConference(state, team as NBATeam, endDate, daysAdvanced);
  if (press) {
    tycoon.pendingPressConference = press;
    news.push({
      id: `tycoon-press-${Date.now()}`,
      headline: press.headline,
      content: press.prompt,
      date: endDate,
      type: 'player',
      read: false,
      isNew: true,
    });
    socialFeed.push({
      id: `tycoon-social-${Date.now()}`,
      author: 'Euro Hoops Wire',
      handle: '@eurohoopswire',
      content: `${press.playerName} situation now needs a club response. Board confidence: ${tycoon.boardConfidence}/100.`,
      timestamp: endDate,
      likes: 0,
      retweets: 0,
      comments: [],
      read: false,
    });
  }

  const monthKey = endDate.slice(0, 7);
  const financeEnabled = tycoon.financeRecapSettings?.enabled !== false;
  if (financeEnabled && tycoon.financeRecapSettings?.mutedMonth !== monthKey && daysAdvanced >= 3) {
    const cashIn = lines.filter(l => l.kind === 'income').reduce((sum, l) => sum + Math.max(0, l.amount), 0);
    const cashOut = lines.filter(l => l.kind === 'expense').reduce((sum, l) => sum + Math.abs(l.amount), 0);
    tycoon.pendingFinanceRecap = {
      id: `finance-${startDate.slice(0, 10)}-${endDate.slice(0, 10)}`,
      startDate: startDate.slice(0, 10),
      endDate: endDate.slice(0, 10),
      cashIn,
      cashOut,
      net: cashIn - cashOut,
      cashOnHand: tycoon.cashOnHand ?? 0,
      nextPayday: addDays(tycoon.lastTycoonPayslipDate ?? endDate, 14),
      lines: lines.length > 0 ? lines : [{ label: 'No cash events posted in this sim window', amount: 0, kind: 'note' }],
    };
  }

  const nextTeams = [...teams];
  const nextNonNBATeams = [...(state.nonNBATeams ?? [])];
  if (teamIndex >= 0) nextTeams[teamIndex] = team as NBATeam;
  else if (nonNBATeamIndex >= 0) nextNonNBATeams[nonNBATeamIndex] = team as NonNBATeam;
  return { teams: nextTeams, nonNBATeams: nextNonNBATeams, news, socialFeed };
}
