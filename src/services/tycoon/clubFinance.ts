import type { GameState, NBATeam, NonNBATeam } from '../../types';
import type {
  ClubFinanceCategory,
  ClubFinanceCommitment,
  ClubFinanceReservation,
  ClubFinanceTransaction,
  ClubFinancialStatus,
  TicketPricingLevel,
  TycoonState,
} from '../../types/tycoon';

export const CLUB_FINANCE_SCHEMA_VERSION = 2;
export const TICKET_PRICING_MULTIPLIER = {
  community: 0.5,
  value: 0.75,
  standard: 1,
  premium: 1.25,
  elite: 1.5,
} as const;

export function getTicketPricingLevel(multiplier: number): TicketPricingLevel {
  return (Object.entries(TICKET_PRICING_MULTIPLIER) as Array<[TicketPricingLevel, number]>)
    .sort((left, right) => Math.abs(left[1] - multiplier) - Math.abs(right[1] - multiplier))[0][0];
}

export function normalizeTicketPriceMultiplier(value: unknown): number {
  const multiplier = Number(value);
  return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}

export function getTicketDemandMultiplier(value: unknown): number {
  return Math.min(1.12, Math.exp(-0.18 * (normalizeTicketPriceMultiplier(value) - 1)));
}

export interface PostClubTransactionInput {
  sourceId: string;
  date: string;
  season: number;
  category: ClubFinanceCategory;
  label: string;
  amountEUR: number;
  competitionId?: string;
  commitmentId?: string;
  playerId?: string;
  counterpartyTid?: number;
  counterpartyName?: string;
  transactionType?: 'Permanent transfer' | 'Loan';
}

export interface ScheduleClubCommitmentInput {
  sourceId: string;
  dueDate: string;
  season: number;
  category: ClubFinanceCategory;
  label: string;
  amountEUR: number;
  competitionId?: string;
  creditLoanId?: string;
  creditPrincipalEUR?: number;
}

export interface ReserveClubFundsInput {
  sourceId: string;
  createdDate: string;
  amountEUR: number;
  purpose: ClubFinanceReservation['purpose'];
  label: string;
  expiresDate?: string;
}

export interface ClubFinanceSnapshot {
  cashOnHandEUR: number;
  reservedEUR: number;
  dueIn30DaysEUR: number;
  availableEUR: number;
  unusedCreditEUR: number;
  monthlyBurnEUR: number;
  runwayMonths: number;
  projectedYearEndEUR: number;
  status: ClubFinancialStatus;
}

export interface SeasonOperatingPlan {
  season: number;
  startDate: string;
  sponsorshipEUR: number;
  sponsorshipAdvanceEUR?: number;
  facilityEUR: number;
  medicalEUR: number;
  academyEUR: number;
  financeCostsEUR?: number;
}

function finiteMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function transactionId(sourceId: string): string {
  return `club-finance:${sourceId}`;
}

function commitmentId(sourceId: string): string {
  return `club-commitment:${sourceId}`;
}

function reservationId(sourceId: string): string {
  return `club-reservation:${sourceId}`;
}

function normalizedDate(value: string): string {
  const raw = String(value ?? '').trim();
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : raw;
}

function asDate(value: string): number {
  const parsed = new Date(`${normalizedDate(value)}T00:00:00Z`).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function plusDays(value: string, days: number): number {
  return asDate(value) + days * 86_400_000;
}

function activeReservations(tycoon: TycoonState, asOfDate?: string): ClubFinanceReservation[] {
  const cutoff = asOfDate ? asDate(asOfDate) : Number.POSITIVE_INFINITY;
  return (tycoon.activeReservations ?? []).filter(reservation => (
    !reservation.expiresDate || asDate(reservation.expiresDate) >= cutoff
  ));
}

function inferStatus(availableEUR: number, dueIn30DaysEUR: number, monthlyBurnEUR: number): ClubFinancialStatus {
  if (availableEUR < 0 || availableEUR < dueIn30DaysEUR * 0.5) return 'critical';
  if (availableEUR < dueIn30DaysEUR || (monthlyBurnEUR > 0 && availableEUR < monthlyBurnEUR * 2)) return 'strained';
  if (monthlyBurnEUR > 0 && availableEUR < monthlyBurnEUR * 5) return 'watch';
  return 'healthy';
}

export function ensureClubFinanceState(tycoon: TycoonState, season: number): void {
  tycoon.schemaVersion = CLUB_FINANCE_SCHEMA_VERSION;
  if (!Array.isArray(tycoon.transactions)) tycoon.transactions = [];
  if (!Array.isArray(tycoon.commitments)) tycoon.commitments = [];
  if (!Array.isArray(tycoon.activeReservations)) tycoon.activeReservations = [];
  if (!Array.isArray(tycoon.loans)) tycoon.loans = [];
  if (!tycoon.creditFacility) tycoon.creditFacility = { limitEUR: 0, drawnEUR: 0, annualRate: 0.05 };
  if (!tycoon.regionalScoutingBudget || tycoon.regionalScoutingBudget.season !== season) {
    tycoon.regionalScoutingBudget = {
      season,
      allocatedEUR: finiteMoney(tycoon.scoutingInvestment),
      spentEUR: 0,
    };
  }
  const currentTicketMultiplier = tycoon.ticketPriceMultiplier === undefined
    ? TICKET_PRICING_MULTIPLIER[tycoon.ticketPricingLevel ?? 'standard']
    : normalizeTicketPriceMultiplier(tycoon.ticketPriceMultiplier);
  tycoon.ticketPriceMultiplier = currentTicketMultiplier;
  tycoon.ticketPricingLevel = getTicketPricingLevel(currentTicketMultiplier);
  if (!tycoon.financialStatus) tycoon.financialStatus = 'healthy';
}

export function postClubTransaction(
  tycoon: TycoonState,
  input: PostClubTransactionInput,
): ClubFinanceTransaction | null {
  ensureClubFinanceState(tycoon, input.season);
  const existing = tycoon.transactions!.find(transaction => transaction.sourceId === input.sourceId);
  if (existing) return null;
  const amountEUR = finiteMoney(input.amountEUR);
  if (amountEUR === 0) return null;
  tycoon.cashOnHand = finiteMoney(tycoon.cashOnHand) + amountEUR;
  const transaction: ClubFinanceTransaction = {
    id: transactionId(input.sourceId),
    sourceId: input.sourceId,
    date: normalizedDate(input.date),
    season: input.season,
    category: input.category,
    label: input.label,
    amountEUR,
    balanceAfterEUR: tycoon.cashOnHand,
    competitionId: input.competitionId,
    commitmentId: input.commitmentId,
    playerId: input.playerId,
    counterpartyTid: input.counterpartyTid,
    counterpartyName: input.counterpartyName,
    transactionType: input.transactionType,
  };
  tycoon.transactions = [...tycoon.transactions!, transaction].slice(-10_000);
  return transaction;
}

export function scheduleClubCommitment(
  tycoon: TycoonState,
  input: ScheduleClubCommitmentInput,
): ClubFinanceCommitment {
  ensureClubFinanceState(tycoon, input.season);
  const existing = tycoon.commitments!.find(commitment => commitment.sourceId === input.sourceId);
  if (existing) return existing;
  const commitment: ClubFinanceCommitment = {
    id: commitmentId(input.sourceId),
    sourceId: input.sourceId,
    dueDate: normalizedDate(input.dueDate),
    season: input.season,
    category: input.category,
    label: input.label,
    amountEUR: finiteMoney(input.amountEUR),
    status: 'scheduled',
    competitionId: input.competitionId,
    creditLoanId: input.creditLoanId,
    creditPrincipalEUR: input.creditPrincipalEUR == null ? undefined : Math.max(0, finiteMoney(input.creditPrincipalEUR)),
  };
  tycoon.commitments = [...tycoon.commitments!, commitment].slice(-5_000);
  return commitment;
}

export function scheduleSeasonOperatingCommitments(tycoon: TycoonState, plan: SeasonOperatingPlan): void {
  ensureClubFinanceState(tycoon, plan.season);
  const scheduleTotal = (
    category: ClubFinanceCategory,
    label: string,
    totalEUR: number,
    periods: number,
    intervalDays: number,
    cadence: 'weekly' | 'quarterly',
    income = false,
  ) => {
    const sourcePrefix = `operations:${category}:${plan.season}:`;
    const matching = (tycoon.commitments ?? []).filter(commitment => commitment.sourceId.startsWith(sourcePrefix));
    const settled = matching.filter(commitment => commitment.status === 'settled');
    const settledTotal = settled.reduce((sum, commitment) => sum + Math.abs(finiteMoney(commitment.amountEUR)), 0);
    tycoon.commitments = (tycoon.commitments ?? []).filter(commitment => (
      !commitment.sourceId.startsWith(sourcePrefix) || commitment.status === 'settled'
    ));
    const total = Math.max(0, finiteMoney(totalEUR));
    const remainingTotal = Math.max(0, total - settledTotal);
    const remainingPeriods = Math.max(0, periods - settled.length);
    if (remainingTotal === 0 || remainingPeriods === 0) return;
    const base = Math.floor(remainingTotal / remainingPeriods);
    for (let period = 1; period <= remainingPeriods; period++) {
      const amount = base + (period === remainingPeriods ? remainingTotal - base * remainingPeriods : 0);
      const schedulePeriod = settled.length + period;
      const dueDate = new Date(`${normalizedDate(plan.startDate)}T00:00:00Z`);
      dueDate.setUTCDate(dueDate.getUTCDate() + schedulePeriod * intervalDays);
      scheduleClubCommitment(tycoon, {
        sourceId: `${sourcePrefix}${cadence}:${schedulePeriod}`,
        dueDate: dueDate.toISOString().slice(0, 10),
        season: plan.season,
        category,
        label,
        amountEUR: income ? amount : -amount,
      });
    }
  };
  const sponsorshipAdvance = Math.min(
    Math.max(0, finiteMoney(plan.sponsorshipAdvanceEUR)),
    Math.max(0, finiteMoney(plan.sponsorshipEUR)),
  );
  const advancePrefix = `operations:sponsor-advance:${plan.season}:`;
  tycoon.commitments = (tycoon.commitments ?? []).filter(commitment => (
    !commitment.sourceId.startsWith(advancePrefix) || commitment.status === 'settled'
  ));
  const advanceAlreadySettled = (tycoon.commitments ?? [])
    .some(commitment => commitment.sourceId.startsWith(advancePrefix) && commitment.status === 'settled');
  if (sponsorshipAdvance > 0 && !advanceAlreadySettled) {
    scheduleClubCommitment(tycoon, {
      sourceId: `${advancePrefix}season-start`,
      dueDate: plan.startDate,
      season: plan.season,
      category: 'sponsorship',
      label: 'Sponsor payment advance',
      amountEUR: sponsorshipAdvance,
    });
  }
  scheduleTotal(
    'sponsorship',
    'Sponsor payment',
    Math.max(0, plan.sponsorshipEUR - sponsorshipAdvance),
    4,
    91,
    'quarterly',
    true,
  );
  scheduleTotal('facility', 'Facility operations', plan.facilityEUR, 52, 7, 'weekly');
  scheduleTotal('medical', 'Medical operations', plan.medicalEUR, 52, 7, 'weekly');
  scheduleTotal('academy', 'Academy operations', plan.academyEUR, 52, 7, 'weekly');
  scheduleTotal('finance', 'Financing costs', plan.financeCostsEUR ?? 0, 52, 7, 'weekly');
}

export function cancelClubCommitment(tycoon: TycoonState, sourceId: string): boolean {
  const commitment = tycoon.commitments?.find(item => item.sourceId === sourceId);
  if (!commitment || commitment.status !== 'scheduled') return false;
  commitment.status = 'cancelled';
  return true;
}

export function settleDueCommitments(
  tycoon: TycoonState,
  throughDate: string,
): ClubFinanceTransaction[] {
  const settled: ClubFinanceTransaction[] = [];
  const cutoff = asDate(throughDate);
  for (const commitment of tycoon.commitments ?? []) {
    if (commitment.status !== 'scheduled' || asDate(commitment.dueDate) > cutoff) continue;
    const transaction = postClubTransaction(tycoon, {
      sourceId: `settlement:${commitment.sourceId}`,
      date: commitment.dueDate,
      season: commitment.season,
      category: commitment.category,
      label: commitment.label,
      amountEUR: commitment.amountEUR,
      competitionId: commitment.competitionId,
      commitmentId: commitment.id,
    });
    const existing = transaction ?? tycoon.transactions?.find(item => item.sourceId === `settlement:${commitment.sourceId}`);
    if (!existing) continue;
    commitment.status = 'settled';
    commitment.settledTransactionId = existing.id;
    if (commitment.creditLoanId && (commitment.creditPrincipalEUR ?? 0) > 0) {
      const loan = tycoon.loans?.find(item => item.id === commitment.creditLoanId && item.status === 'active');
      if (loan) {
        loan.outstandingPrincipalEUR = Math.max(0, finiteMoney(loan.outstandingPrincipalEUR) - finiteMoney(commitment.creditPrincipalEUR));
        if (loan.outstandingPrincipalEUR === 0) {
          loan.status = 'repaid';
          loan.repaidDate = normalizedDate(commitment.dueDate);
          for (const future of tycoon.commitments ?? []) {
            if (future.creditLoanId === loan.id && future.status === 'scheduled') future.status = 'cancelled';
          }
        }
        if (tycoon.creditFacility) {
          tycoon.creditFacility.drawnEUR = (tycoon.loans ?? [])
            .filter(item => item.status === 'active')
            .reduce((sum, item) => sum + Math.max(0, finiteMoney(item.outstandingPrincipalEUR)), 0);
        }
      }
    }
    if (transaction) settled.push(transaction);
  }
  return settled;
}

export function reserveClubFunds(tycoon: TycoonState, input: ReserveClubFundsInput): ClubFinanceReservation {
  const createdDate = normalizedDate(input.createdDate);
  ensureClubFinanceState(tycoon, Number(createdDate.slice(0, 4)));
  const existing = tycoon.activeReservations!.find(reservation => reservation.sourceId === input.sourceId);
  if (existing) return existing;
  const reservation: ClubFinanceReservation = {
    id: reservationId(input.sourceId),
    sourceId: input.sourceId,
    createdDate,
    amountEUR: Math.max(0, finiteMoney(input.amountEUR)),
    purpose: input.purpose,
    label: input.label,
    expiresDate: input.expiresDate ? normalizedDate(input.expiresDate) : undefined,
  };
  tycoon.activeReservations = [...tycoon.activeReservations!, reservation];
  return reservation;
}

export function releaseClubReservation(tycoon: TycoonState, sourceId: string): boolean {
  const before = tycoon.activeReservations?.length ?? 0;
  tycoon.activeReservations = (tycoon.activeReservations ?? []).filter(item => item.sourceId !== sourceId);
  return tycoon.activeReservations.length < before;
}

export function getPostedSeasonNet(tycoon: TycoonState, season: number): number {
  return (tycoon.transactions ?? [])
    .filter(transaction => transaction.season === season)
    .reduce((sum, transaction) => sum + finiteMoney(transaction.amountEUR), 0);
}

export function getClubFinanceSnapshot(
  tycoon: TycoonState,
  asOfDate: string,
  projectedYearEndEUR?: number,
): ClubFinanceSnapshot {
  const cashOnHandEUR = finiteMoney(tycoon.cashOnHand);
  const reservedEUR = activeReservations(tycoon, asOfDate)
    .reduce((sum, reservation) => sum + Math.max(0, finiteMoney(reservation.amountEUR)), 0);
  const dueCutoff = plusDays(asOfDate, 30);
  const dueIn30DaysEUR = (tycoon.commitments ?? [])
    .filter(commitment => commitment.status === 'scheduled' && asDate(commitment.dueDate) <= dueCutoff)
    .reduce((sum, commitment) => sum + Math.max(0, -finiteMoney(commitment.amountEUR)), 0);
  const availableEUR = cashOnHandEUR - reservedEUR;
  const yearAgo = plusDays(asOfDate, -365);
  const recentExpense = (tycoon.transactions ?? [])
    .filter(transaction => asDate(transaction.date) >= yearAgo && transaction.amountEUR < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amountEUR), 0);
  const monthlyBurnEUR = Math.round(recentExpense / 12);
  const runwayMonths = monthlyBurnEUR <= 0 ? 99 : Math.max(0, Math.min(99, availableEUR / monthlyBurnEUR));
  const unusedCreditEUR = Math.max(0, finiteMoney(tycoon.creditFacility?.limitEUR) - finiteMoney(tycoon.creditFacility?.drawnEUR));
  const status = inferStatus(availableEUR, dueIn30DaysEUR, monthlyBurnEUR);
  return {
    cashOnHandEUR,
    reservedEUR,
    dueIn30DaysEUR,
    availableEUR,
    unusedCreditEUR,
    monthlyBurnEUR,
    runwayMonths,
    projectedYearEndEUR: projectedYearEndEUR ?? cashOnHandEUR,
    status,
  };
}

export function getClubSpendableEUR(
  tycoon: TycoonState,
  asOfDate: string,
  reservationSourceId?: string,
): number {
  const availableEUR = getClubFinanceSnapshot(tycoon, asOfDate).availableEUR;
  if (!reservationSourceId) return availableEUR;
  const coveredEUR = activeReservations(tycoon, asOfDate)
    .filter(reservation => reservation.sourceId === reservationSourceId)
    .reduce((sum, reservation) => sum + Math.max(0, finiteMoney(reservation.amountEUR)), 0);
  return availableEUR + coveredEUR;
}

export function getSeasonEconomyIndex(state: GameState, season: number): number {
  const baseSeason = Number(
    state.euroStartSeason
    ?? (state.endesaStartYear != null ? state.endesaStartYear + 1 : undefined)
    ?? state.franchiseEconomyBaseSeason
    ?? (state.nbaStartYear != null ? state.nbaStartYear + 1 : undefined)
    ?? state.leagueStats.year,
  );
  const baseIndex = Math.max(0.05, Number(state.leagueStats.historicalEconomyScale ?? 1));
  if (state.leagueStats.inflationEnabled === false) return baseIndex;
  const annualRate = Math.max(-0.05, Math.min(0.2, Number(state.leagueStats.inflationAverage ?? 2.5) / 100));
  return baseIndex * Math.pow(1 + annualRate, season - baseSeason);
}

export function getActiveLeagueFinanceTeams(
  state: GameState,
  competitionId = state.euroPrimaryCompetitionId,
): Array<NBATeam | NonNBATeam> {
  const all = [...state.teams, ...state.nonNBATeams] as Array<(NBATeam | NonNBATeam) & { tycoon?: TycoonState }>;
  const byTid = new Map<number, (NBATeam | NonNBATeam) & { tycoon?: TycoonState }>();
  for (const team of all) byTid.set(Number((team as NBATeam).id ?? (team as NonNBATeam).tid), team);
  if (!competitionId) return [...byTid.values()].filter(team => Boolean(team.tycoon));
  const explicit = state.euroCompetitionTeamTids?.[competitionId] ?? [];
  const scheduled = state.schedule
    .filter(game => game.competitionId === competitionId)
    .flatMap(game => [game.homeTid, game.awayTid]);
  const tids = [...new Set(explicit.length > 0 ? explicit : scheduled)];
  return tids.map(tid => byTid.get(tid)).filter((team): team is (NBATeam | NonNBATeam) & { tycoon: TycoonState } => Boolean(team?.tycoon));
}

export function settleMatchdayRevenue(
  tycoon: TycoonState,
  input: Omit<PostClubTransactionInput, 'category'>,
): ClubFinanceTransaction | null {
  return postClubTransaction(tycoon, { ...input, category: 'matchday' });
}

export function spendScoutingBudget(
  tycoon: TycoonState,
  input: Omit<PostClubTransactionInput, 'category' | 'amountEUR'> & { costEUR: number },
): { ok: boolean; remainingEUR: number; reason?: 'cash' | 'budget' | 'duplicate' } {
  ensureClubFinanceState(tycoon, input.season);
  const wallet = tycoon.regionalScoutingBudget!;
  const costEUR = Math.max(0, finiteMoney(input.costEUR));
  const remainingEUR = Math.max(0, wallet.allocatedEUR - wallet.spentEUR);
  if (tycoon.transactions!.some(transaction => transaction.sourceId === input.sourceId)) {
    return { ok: false, remainingEUR, reason: 'duplicate' };
  }
  if (costEUR > remainingEUR) return { ok: false, remainingEUR, reason: 'budget' };
  if (costEUR > getClubSpendableEUR(tycoon, input.date)) {
    return { ok: false, remainingEUR, reason: 'cash' };
  }
  const transaction = postClubTransaction(tycoon, {
    ...input,
    category: 'scouting',
    amountEUR: -costEUR,
  });
  if (!transaction) return { ok: false, remainingEUR, reason: 'duplicate' };
  wallet.spentEUR += costEUR;
  return { ok: true, remainingEUR: wallet.allocatedEUR - wallet.spentEUR };
}
