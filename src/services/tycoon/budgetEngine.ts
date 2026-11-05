import type { GameState, NBATeam } from '../../types';
import { ALL_SLOTS, type AnnualLedger, type AnnualLedgerComponent, type SponsorshipSlot, type TycoonState } from '../../types/tycoon';
import { academyBudgetCostEUR, fallbackStaffPayrollEUR, sumStaffPayroll } from './economyScale';
import { getSafeTycoonTier, getTycoonFacilityLevel, getTycoonStadiumCapacity, getTycoonTierBase } from './tierBase';
import { getSeasonEconomyIndex, getTicketDemandMultiplier, normalizeTicketPriceMultiplier } from './clubFinance';
import { getSponsorTravelCoverage } from './sponsorBenefits';
import { matchesScheduleSeason } from '../competition/competitionSeasonState';
import { convertUSDToExternalCurrency } from '../../constants';
import { isOnRoster } from '../../utils/teamLookup';
import {
  getSponsorEffectMultiplier,
  getSponsorQualityFloor,
  getSponsorTravelCostMultiplier,
} from './sponsorPerkEngine';

export interface BudgetContext {
  year: number;
  domesticFinishPosition: number;
  continentalStage: 'final-four' | 'qf' | 'group' | 'none';
  continentalAwayGames: number;
  domesticAwayGames?: number;
  domesticPrizeEUR: number;
  continentalPrizeEUR: number;
  scheduledHomeGames: number;
  economyIndex: number;
  avgOpponentPrestige?: number;
}

export interface EuroFinanceProjectionReadiness {
  matchday: boolean;
  sponsorship: boolean;
  mediaRights: boolean;
  travel: boolean;
}

const taskResolved = (status: unknown): boolean => status === 'done' || status === 'skipped';

export function getEuroFinanceProjectionReadiness(
  state: GameState,
  teamId: number,
): EuroFinanceProjectionReadiness {
  if (state.leagueStats?.uiMode !== 'euro_isolated') {
    return { matchday: true, sponsorship: true, mediaRights: true, travel: true };
  }
  const year = state.leagueStats.year;
  const team = [...state.teams, ...(state.nonNBATeams ?? [])]
    .find(candidate => Number('tid' in candidate ? candidate.tid : candidate.id) === teamId);
  const fixturesReleased = (state.schedule ?? []).some(game => (
    matchesScheduleSeason(game, year)
    && game.homeTid !== game.awayTid
    && (game.homeTid === teamId || game.awayTid === teamId)
  ));
  const receiptBooked = Boolean((team?.tycoon?.broadcastReceipts ?? [])
    .some(receipt => receipt.year === year));
  const checklist = state.offseasonChecklist;
  const scheduleReady = fixturesReleased && (
    !checklist || taskResolved(checklist.euroScheduleDraw)
  );
  return {
    matchday: scheduleReady,
    travel: scheduleReady,
    sponsorship: !checklist || taskResolved(checklist.sponsorRenewals),
    mediaRights: receiptBooked || !checklist || taskResolved(checklist.endesaBroadcastMeeting),
  };
}

const SPONSOR_SLOT_LABELS: Record<SponsorshipSlot, string> = {
  kit: 'Kit Sponsor',
  sleeve: 'Sleeve Sponsor',
  back: 'Back of Shirt',
  shorts: 'Shorts Sponsor',
  training: 'Training Kit',
  court: 'Court Logo',
  stadium: 'Arena Naming',
  practice: 'Practice Facility',
};

export function buildBudgetContext(
  state: GameState,
  teamId: number,
  overrides: Partial<BudgetContext> = {},
): BudgetContext {
  const team = [...state.teams, ...(state.nonNBATeams ?? [])]
    .find(candidate => Number('tid' in candidate ? candidate.tid : candidate.id) === teamId);
  const currentGameRows = (state.schedule ?? []).filter(game => (
    matchesScheduleSeason(game, state.leagueStats.year)
    && (game.homeTid === teamId || game.awayTid === teamId)
    && game.homeTid !== game.awayTid
  ));
  const currentGames = [...new Map(currentGameRows.map(game => {
    const key = game.gid != null
      ? `${game.competitionId ?? 'competition'}:${game.gid}`
      : `${game.competitionId ?? 'competition'}:${game.date}:${game.homeTid}:${game.awayTid}`;
    return [key, game] as const;
  })).values()];
  return {
    year: state.leagueStats.year,
    domesticFinishPosition: Number((team as any)?.lastDomesticFinish ?? (team as any)?.lastEndesaFinish ?? 0),
    continentalStage: (team as any)?.lastContinentalStage ?? (team as any)?.lastEuroleagueStage ?? 'none',
    continentalAwayGames: currentGames.filter(game => (
      game.awayTid === teamId && game.competitionId !== state.euroPrimaryCompetitionId
    )).length,
    domesticAwayGames: currentGames.filter(game => (
      game.awayTid === teamId && game.competitionId === state.euroPrimaryCompetitionId
    )).length,
    domesticPrizeEUR: 0,
    continentalPrizeEUR: 0,
    scheduledHomeGames: currentGames.filter(game => game.homeTid === teamId).length,
    economyIndex: getSeasonEconomyIndex(state, state.leagueStats.year),
    ...overrides,
  };
}

export function estimateTravelCost(
  prefs: { hotel: number; flight: number; bus: number },
  domesticAwayGames: number,
  continentalAwayGames: number,
  covered?: {
    flight?: boolean;
    bus?: boolean;
    hotelMultiplier?: number;
    flightMultiplier?: number;
    busMultiplier?: number;
  },
): number {
  const key = (v: number) => v.toFixed(1);
  const hotelPrice: Record<string, number> = {
    '0.5': 1_500, '1.0': 2_500, '1.5': 4_000, '2.0': 6_000, '2.5': 8_000,
    '3.0': 10_000, '3.5': 13_000, '4.0': 16_000, '4.5': 22_000, '5.0': 30_000,
  };
  const flightPrice: Record<string, number> = {
    '0.5': 4_000, '1.0': 7_000, '1.5': 12_000, '2.0': 18_000, '2.5': 28_000,
    '3.0': 40_000, '3.5': 70_000, '4.0': 110_000, '4.5': 160_000, '5.0': 220_000,
  };
  const busPrice: Record<string, number> = {
    '0.5': 400, '1.0': 700, '1.5': 1_100, '2.0': 1_700, '2.5': 2_400,
    '3.0': 3_500, '3.5': 5_000, '4.0': 7_500, '4.5': 11_000, '5.0': 16_000,
  };
  const totalAway = domesticAwayGames + continentalAwayGames;
  const flightGames = totalAway;
  const hotelMultiplier = Math.max(0, Number(covered?.hotelMultiplier ?? 1));
  const flightMultiplier = covered?.flight ? 0 : Math.max(0, Number(covered?.flightMultiplier ?? 1));
  const busMultiplier = covered?.bus ? 0 : Math.max(0, Number(covered?.busMultiplier ?? 1));
  return Math.round(
    (hotelPrice[key(prefs.hotel)] ?? 0) * totalAway * hotelMultiplier
    + (flightPrice[key(prefs.flight)] ?? 0) * flightGames * flightMultiplier
    + (busPrice[key(prefs.bus)] ?? 0) * domesticAwayGames * busMultiplier,
  );
}

function successMultiplier(ctx: BudgetContext): number {
  let m = 1.0;
  const pos = ctx.domesticFinishPosition;
  if (pos >= 1 && pos <= 4) m = 1.25;
  else if (pos >= 5 && pos <= 8) m = 1.10;
  else if (pos >= 9 && pos <= 14) m = 1.00;
  else if (pos >= 15) m = 0.85;
  // pos === 0 = season-in-progress, no multiplier bump
  if (ctx.continentalStage === 'final-four') m += 0.20;
  else if (ctx.continentalStage === 'qf') m += 0.10;
  else if (ctx.continentalStage === 'group') m += 0.05;
  return m;
}

function averageAttendancePct(tier: TycoonState['tier'], success: number): number {
  const floor: Record<TycoonState['tier'], number> = { S: 0.85, A: 0.75, B: 0.65, C: 0.55, D: 0.45 };
  return Math.min(0.99, floor[tier] * success);
}

export interface MatchdayCommercialOutcome {
  attendance: number;
  ticketPriceEUR: number;
  gateRevenueEUR: number;
  foodRevenueEUR: number;
  drinkRevenueEUR: number;
  revenueEUR: number;
  merchandiseGrossRevenueEUR: number;
  merchandiseDistributionCostEUR: number;
  merchandiseRevenueEUR: number;
  clubMediaRevenueEUR: number;
}

export function estimateMatchdayOutcome(
  team: NBATeam,
  economyIndex: number,
  opponentPrestige = 0.5,
  success = 1,
  currentYear?: number,
): MatchdayCommercialOutcome {
  const tycoon = team.tycoon;
  if (!tycoon) {
    return {
      attendance: 0,
      ticketPriceEUR: 0,
      gateRevenueEUR: 0,
      foodRevenueEUR: 0,
      drinkRevenueEUR: 0,
      revenueEUR: 0,
      merchandiseGrossRevenueEUR: 0,
      merchandiseDistributionCostEUR: 0,
      merchandiseRevenueEUR: 0,
      clubMediaRevenueEUR: 0,
    };
  }
  const tier = getSafeTycoonTier(tycoon.tier);
  const tierBase = getTycoonTierBase(tier);
  const economy = Math.max(0.05, economyIndex);
  const ticketMultiplier = normalizeTicketPriceMultiplier(tycoon.ticketPriceMultiplier);
  const ticketDemand = getTicketDemandMultiplier(ticketMultiplier);
  const opponentDemand = 0.88 + Math.max(0, Math.min(1, opponentPrestige)) * 0.24;
  const attendanceMultiplier = currentYear == null
    ? 1
    : getSponsorEffectMultiplier(tycoon, currentYear, 'homeAttendance');
  const fillRate = Math.min(0.99, averageAttendancePct(tier, success) * ticketDemand * opponentDemand * attendanceMultiplier);
  const attendance = Math.round(getTycoonStadiumCapacity(tycoon) * fillRate);
  const ticketPriceEUR = tierBase.ticketPrice * economy * ticketMultiplier;
  const sponsorMultiplier = (target: string) => currentYear == null
    ? 1
    : getSponsorEffectMultiplier(tycoon, currentYear, target);
  const gateRevenueEUR = Math.round(attendance * ticketPriceEUR * sponsorMultiplier('gateRevenue'));
  const foodRevenueEUR = Math.round(attendance * 6 * economy * sponsorMultiplier('matchdayFoodRevenue'));
  const drinkRevenueEUR = Math.round(attendance * 4 * economy * sponsorMultiplier('matchdayDrinkRevenue'));
  const merchandiseGrossRevenueEUR = Math.round(attendance * 5 * economy * sponsorMultiplier('merchandiseRevenue'));
  const merchandiseDistributionCostEUR = Math.round(
    merchandiseGrossRevenueEUR * 0.18 * sponsorMultiplier('merchandiseDistributionCost'),
  );
  const merchandiseRevenueEUR = Math.max(0, merchandiseGrossRevenueEUR - merchandiseDistributionCostEUR);
  const clubMediaRevenueEUR = Math.round(attendance * 1.5 * economy * sponsorMultiplier('clubMediaRevenue'));
  return {
    attendance,
    ticketPriceEUR,
    gateRevenueEUR,
    foodRevenueEUR,
    drinkRevenueEUR,
    revenueEUR: gateRevenueEUR + foodRevenueEUR + drinkRevenueEUR,
    merchandiseGrossRevenueEUR,
    merchandiseDistributionCostEUR,
    merchandiseRevenueEUR,
    clubMediaRevenueEUR,
  };
}

export function estimateMatchdayRevenue(
  team: NBATeam,
  economyIndex: number,
  opponentPrestige = 0.5,
  success = 1,
  currentYear?: number,
): number {
  return estimateMatchdayOutcome(team, economyIndex, opponentPrestige, success, currentYear).revenueEUR;
}

function playerWagesEUR(team: NBATeam, allPlayers?: any[]): number {
  const players = allPlayers ?? (team as any).players ?? [];
  const tid = (team as any).tid ?? team.id;
  return players
    .filter((p: any) => p.tid === tid && isOnRoster(p))
    .reduce((sum: number, p: any) => (
      sum + convertUSDToExternalCurrency((p.contract?.amount ?? 0) * 1000, 'Euroleague')
    ), 0);
}

export function computeAnnualBudget(team: NBATeam, ctx: BudgetContext, allPlayers?: any[]): AnnualLedger {
  const t = team.tycoon;
  if (!t) throw new Error(`Team ${team.name} has no tycoon state`);
  const domesticallyRelegated = Boolean((team as any).euroDomesticRelegatedFrom || (team as any).endesaRelegated);
  const tier = getSafeTycoonTier(t.tier);
  const tb = getTycoonTierBase(tier);
  const success = successMultiplier(ctx);

  const seasonTransactions = (t.transactions ?? []).filter(transaction => transaction.season === ctx.year);
  const postedIncome = (category: string): number => seasonTransactions
    .filter(transaction => transaction.category === category && transaction.amountEUR > 0)
    .reduce((sum, transaction) => sum + transaction.amountEUR, 0);
  const postedExpense = (category: string): number => seasonTransactions
    .filter(transaction => transaction.category === category && transaction.amountEUR < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amountEUR), 0);
  const bookedMatchdays = seasonTransactions.filter(transaction => (
    transaction.category === 'matchday' && transaction.amountEUR > 0
  )).length;
  const homeGames = Math.max(0, ctx.scheduledHomeGames);
  const remainingHomeGames = Math.max(0, homeGames - bookedMatchdays);
  const projectedOutcome = estimateMatchdayOutcome(
    team,
    ctx.economyIndex,
    ctx.avgOpponentPrestige ?? 0.5,
    success,
    ctx.year,
  );
  const projectedMatchdayPerGame = projectedOutcome.revenueEUR;
  const matchday = postedIncome('matchday') + (domesticallyRelegated ? 0 : projectedMatchdayPerGame * remainingHomeGames);
  const remainingCommercialGames = remainingHomeGames;
  const postedCommercial = postedIncome('commercial') - postedExpense('commercial');
  const projectedCommercialPerGame = projectedOutcome.merchandiseRevenueEUR + projectedOutcome.clubMediaRevenueEUR;
  const commercial = postedCommercial + (
    domesticallyRelegated ? 0 : projectedCommercialPerGame * remainingCommercialGames
  );

  const sponsorContracts = ALL_SLOTS.flatMap(slot => {
    const deal = t.sponsorships?.[slot];
    return deal ? [{ slot, deal }] : [];
  });
  const contractedSponsorship = sponsorContracts.reduce((sum, entry) => sum + Math.max(0, Number(entry.deal.valuePerYear ?? 0)), 0);
  const sponsorExtras = seasonTransactions.filter(transaction => (
    transaction.category === 'sponsorship'
    && transaction.amountEUR > 0
    && (transaction.sourceId.startsWith('sponsor-bonus:') || transaction.sourceId.startsWith('one-time-sponsor:'))
  ));
  const sponsorExtraTotal = sponsorExtras.reduce((sum, transaction) => sum + transaction.amountEUR, 0);
  const postedSponsorRegular = Math.max(0, postedIncome('sponsorship') - sponsorExtraTotal);
  const legacySponsorProjection = contractedSponsorship === 0 && postedSponsorRegular === 0
    ? Math.round((tb.sponsorshipFloor.kit + tb.sponsorshipFloor.sleeve + tb.sponsorshipFloor.stadium) * 0.5 * Math.max(0.05, ctx.economyIndex))
    : 0;
  const sponsorshipBase = Math.max(contractedSponsorship, postedSponsorRegular, legacySponsorProjection);
  const sponsorship = sponsorshipBase + sponsorExtraTotal;
  const sponsorshipDetails: AnnualLedgerComponent[] = sponsorContracts.map(({ slot, deal }) => ({
    id: `sponsor-contract:${slot}:${deal.signedYear}:${deal.sponsor}`,
    label: `${SPONSOR_SLOT_LABELS[slot]} · ${deal.sponsor}`,
    amount: Math.max(0, Number(deal.valuePerYear ?? 0)),
    status: 'contracted' as const,
    slot,
    sponsor: deal.sponsor,
    industry: deal.industry,
  }));
  if (postedSponsorRegular > contractedSponsorship) {
    sponsorshipDetails.push({
      id: `sponsor-earlier-receipts:${ctx.year}`,
      label: 'Earlier contract receipts',
      amount: postedSponsorRegular - contractedSponsorship,
      status: 'posted',
    });
  }
  if (legacySponsorProjection > 0) {
    sponsorshipDetails.push({
      id: `sponsor-legacy-projection:${ctx.year}`,
      label: 'Legacy sponsorship projection',
      amount: legacySponsorProjection,
      status: 'projected',
    });
  }
  sponsorshipDetails.push(...sponsorExtras.map(transaction => ({
    id: transaction.id,
    label: transaction.label,
    amount: transaction.amountEUR,
    status: 'posted' as const,
  })));

  const earnedPrize = domesticallyRelegated ? 0 : Math.max(0, ctx.domesticPrizeEUR + ctx.continentalPrizeEUR);
  const postedPrize = domesticallyRelegated ? 0 : postedIncome('prize');
  const prize = Math.max(earnedPrize, postedPrize);
  const bookedBroadcast = (t.broadcastReceipts ?? [])
    .filter(receipt => receipt.year === ctx.year)
    .reduce((sum, receipt) => sum + receipt.totalEUR, 0);
  const postedBroadcast = postedIncome('broadcast');
  const broadcastProjection = Math.round(tb.tvRevenue * Math.max(0.05, ctx.economyIndex));
  const tv = domesticallyRelegated ? 0 : Math.max(bookedBroadcast, postedBroadcast) || broadcastProjection;
  const prebookedRevenue = bookedBroadcast;
  const transfer = postedIncome('transfer');
  const transferFees = postedExpense('transfer');
  const transferIncomeDetails = seasonTransactions
    .filter(transaction => transaction.category === 'transfer' && transaction.amountEUR > 0)
    .map(transaction => ({
      id: transaction.id,
      label: transaction.label,
      amount: transaction.amountEUR,
      status: 'posted' as const,
      date: transaction.date,
      playerId: transaction.playerId,
      counterpartyTid: transaction.counterpartyTid,
      counterpartyName: transaction.counterpartyName,
      transactionType: transaction.transactionType,
    }));

  const wages = playerWagesEUR(team, allPlayers);
  const staff = sumStaffPayroll({
    ...t,
    staffMembers: (t.staffMembers ?? []).map(member => ({
      ...member,
      salary: member.salary,
    })),
  } as any, 'euro') || fallbackStaffPayrollEUR(wages);
  const facilityLevelSum = getTycoonFacilityLevel(t.facilities?.stadium)
    + getTycoonFacilityLevel(t.facilities?.trainingCenter)
    + getTycoonFacilityLevel(t.facilities?.academy);
  const facility = Math.round(
    facilityLevelSum
      * tb.facilityOpsPerLevel
      * Math.max(0.05, ctx.economyIndex)
      * getSponsorEffectMultiplier(t, ctx.year, 'facilityOperatingCost'),
  );
  const scouting = t.scoutingInvestment ?? Math.round(tb.scoutingBudget * Math.max(0.05, ctx.economyIndex));
  const medical = Math.round(
    (t.medicalBudget ?? 0) * getSponsorEffectMultiplier(t, ctx.year, 'medicalSupplyCost'),
  );
  const academy = Math.round(
    academyBudgetCostEUR(t.academyBudget, tier, ctx.economyIndex)
      * getSponsorEffectMultiplier(t, ctx.year, 'academyOperatingCost')
      * getSponsorEffectMultiplier(t, ctx.year, 'academyFoodCost'),
  );
  const savedTravelPrefs = t.travelPreferences;
  const travelPrefs = savedTravelPrefs ? {
    hotel: Math.max(savedTravelPrefs.hotel, getSponsorQualityFloor(t, ctx.year, 'hotelQualityStars') ?? 0),
    flight: Math.max(savedTravelPrefs.flight, getSponsorQualityFloor(t, ctx.year, 'flightQualityStars') ?? 0),
    bus: Math.max(savedTravelPrefs.bus, getSponsorQualityFloor(t, ctx.year, 'busTravelCost') ?? 0),
  } : undefined;
  const domesticAwayGames = Math.max(0, Math.round(ctx.domesticAwayGames ?? ctx.scheduledHomeGames ?? 0));
  const travel = domesticallyRelegated ? 0 : travelPrefs
    ? Math.round(estimateTravelCost(travelPrefs, domesticAwayGames, ctx.continentalAwayGames, {
        flight: !!getSponsorTravelCoverage(t, 'flight'),
        bus: !!getSponsorTravelCoverage(t, 'bus'),
        hotelMultiplier: getSponsorTravelCostMultiplier(t, ctx.year, 'hotel'),
        flightMultiplier: getSponsorTravelCostMultiplier(t, ctx.year, 'flight'),
        busMultiplier: getSponsorTravelCostMultiplier(t, ctx.year, 'bus'),
      }) * Math.max(0.05, ctx.economyIndex))
    : Math.round((tb.travelBase + (ctx.continentalAwayGames * 40_000)) * Math.max(0.05, ctx.economyIndex));
  const cash = t.cashOnHand ?? 0;
  const financeCosts = cash < 0 ? Math.round(Math.abs(cash) * 0.05) : 0;

  const profit = Math.round(matchday + commercial + sponsorship + prize + tv + transfer
               - wages - staff - facility - scouting - travel - medical - academy - transferFees - financeCosts);

  const remainingIncome = Math.max(0, matchday - postedIncome('matchday'))
    + Math.max(0, commercial - postedCommercial)
    + Math.max(0, sponsorship - postedIncome('sponsorship'))
    + Math.max(0, prize - postedIncome('prize'))
    + Math.max(0, tv - postedIncome('broadcast'))
    + Math.max(0, transfer - postedIncome('transfer'));
  const remainingExpense = Math.max(0, wages - postedExpense('wages'))
    + Math.max(0, staff - postedExpense('staff'))
    + Math.max(0, facility - postedExpense('facility'))
    + Math.max(0, scouting - postedExpense('scouting'))
    + Math.max(0, travel - postedExpense('travel'))
    + Math.max(0, medical - postedExpense('medical'))
    + Math.max(0, academy - postedExpense('academy'))
    + Math.max(0, financeCosts - postedExpense('finance'));
  const remainingNet = Math.round(remainingIncome - remainingExpense);
  const tvDetails: AnnualLedgerComponent[] = [
    ...(t.broadcastReceipts ?? []).filter(receipt => receipt.year === ctx.year).map(receipt => ({
      id: receipt.id,
      label: `${receipt.competitionId ?? 'Competition'} media rights`,
      amount: receipt.totalEUR,
      status: 'posted' as const,
      competitionId: receipt.competitionId,
    })),
    ...(bookedBroadcast === 0 && postedBroadcast > 0
      ? seasonTransactions.filter(transaction => transaction.category === 'broadcast' && transaction.amountEUR > 0).map(transaction => ({
        id: transaction.id,
        label: transaction.label,
        amount: transaction.amountEUR,
        status: 'posted' as const,
        competitionId: transaction.competitionId,
      }))
      : bookedBroadcast === 0 && tv > 0 ? [{
        id: `broadcast-projection:${ctx.year}`,
        label: 'Media rights projection',
        amount: tv,
        status: 'projected' as const,
      }] : []),
  ];

  return {
    year: ctx.year,
    revenue: { matchday, commercial, sponsorship, prize, tv, transfer },
    revenueDetails: {
      matchday: [{
        id: `matchday-total:${ctx.year}`,
        label: bookedMatchdays < homeGames ? 'Played and remaining home games' : 'Played home games',
        amount: matchday,
        status: bookedMatchdays < homeGames ? 'projected' : 'posted',
      }],
      commercial: [{
        id: `commercial-total:${ctx.year}`,
        label: remainingCommercialGames > 0 ? 'Club shop and media projection' : 'Club shop and media receipts',
        amount: commercial,
        status: remainingCommercialGames > 0 ? 'projected' : 'posted',
      }],
      sponsorship: sponsorshipDetails,
      prize: prize > 0 ? [{
        id: `prize-total:${ctx.year}`,
        label: postedPrize >= earnedPrize ? 'Earned prize receipts' : 'Qualified competition prize',
        amount: prize,
        status: postedPrize >= earnedPrize ? 'posted' : 'earned',
      }] : [],
      tv: tvDetails,
      transfer: transferIncomeDetails.length > 0 ? transferIncomeDetails : transfer > 0 ? [{
          id: `transfer-income:${ctx.year}`,
          label: 'Player sales received',
          amount: transfer,
          status: 'posted',
        }] : [],
    },
    expenses: { wages, staff, facility, scouting, travel, medical, academy, transfer: transferFees, financeCosts },
    profit,
    cashOnHandEnd: cash + remainingNet,
    ffpDeficitContribution: Math.min(profit, 0),
    prebookedRevenue,
    postedNet: profit - remainingNet,
  };
}

export function projectYearEndCash(team: NBATeam, ctx: BudgetContext, plannedSpendEUR = 0, players?: any[]): number {
  const tycoon = team.tycoon;
  if (!tycoon) return 0;
  const ledger = computeAnnualBudget(team, ctx, players);
  return Math.round(ledger.cashOnHandEnd - plannedSpendEUR);
}
