import type { ClubLoan, TycoonState } from '../../types/tycoon';
import { getBankSponsorAccess } from './sponsorBenefits';
import { getSponsorCreditFacilityAccess } from './sponsorPerkEngine';
import {
  ensureClubFinanceState,
  getClubFinanceSnapshot,
  postClubTransaction,
  scheduleClubCommitment,
} from './clubFinance';
import { parseGameDate, toISODateString } from '../../utils/dateUtils';

export type BankActionResult = { ok: true; loan: ClubLoan } | { ok: false; reason: 'access' | 'amount' | 'cash' | 'duplicate' };

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function addMonths(value: string, months: number): string {
  const parsed = parseGameDate(value);
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  return toISODateString(parsed);
}

function bankDate(value: string): string {
  return toISODateString(parseGameDate(value));
}

export function getOutstandingBankLoans(state: TycoonState): ClubLoan[] {
  return (state.loans ?? []).filter(loan => loan.status === 'active' && money(loan.outstandingPrincipalEUR) > 0);
}

export function getOutstandingBankPrincipal(state: TycoonState): number {
  return getOutstandingBankLoans(state).reduce((sum, loan) => sum + money(loan.outstandingPrincipalEUR), 0);
}

export function getEffectiveBankSponsorAccess(state: TycoonState, season: number) {
  return getSponsorCreditFacilityAccess(state, season) ?? getBankSponsorAccess(state);
}

export function syncBankSponsorCreditFacility(state: TycoonState, season: number): void {
  ensureClubFinanceState(state, season);
  const access = getEffectiveBankSponsorAccess(state, season);
  const drawnEUR = getOutstandingBankPrincipal(state);
  state.creditFacility = {
    limitEUR: access?.package.bankLoanLimitEUR ?? 0,
    drawnEUR,
    annualRate: access?.package.bankAnnualRate ?? state.creditFacility?.annualRate ?? 0.05,
    sponsor: access?.sponsor,
  };
}

function scheduleRepaymentPlan(state: TycoonState, loan: ClubLoan, startDate: string, season: number, months: number): void {
  const remainingMonths = Math.max(1, Math.round(months));
  const monthlyRate = Math.max(0, loan.annualRate) / 12;
  let balance = money(loan.outstandingPrincipalEUR);
  const payment = monthlyRate > 0
    ? balance * monthlyRate / (1 - Math.pow(1 + monthlyRate, -remainingMonths))
    : balance / remainingMonths;

  for (let month = 1; month <= remainingMonths && balance > 0; month += 1) {
    const dueDate = addMonths(startDate, month);
    const interest = Math.round(balance * monthlyRate);
    const principal = month === remainingMonths ? balance : Math.min(balance, Math.max(1, Math.round(payment - interest)));
    scheduleClubCommitment(state, {
      sourceId: `${loan.id}:r${loan.scheduleRevision}:payment:${month}`,
      dueDate,
      season: season + Math.floor((month - 1) / 12),
      category: 'finance',
      label: `${loan.lender} loan payment`,
      amountEUR: -(principal + interest),
      creditLoanId: loan.id,
      creditPrincipalEUR: principal,
    });
    balance -= principal;
  }
}

export function takeSponsorLoan(
  state: TycoonState,
  amountEUR: number,
  termMonths: number,
  currentDate: string,
  season: number,
): BankActionResult {
  ensureClubFinanceState(state, season);
  const access = getEffectiveBankSponsorAccess(state, season);
  if (!access) return { ok: false, reason: 'access' };
  const outstanding = getOutstandingBankPrincipal(state);
  const headroom = Math.max(0, money(access.package.bankLoanLimitEUR) - outstanding);
  const principal = Math.min(headroom, money(amountEUR));
  if (principal <= 0 || principal !== money(amountEUR)) return { ok: false, reason: 'amount' };
  const sequence = Math.max(0, Math.round(state.bankLoanSequence ?? 0)) + 1;
  const id = `bank-loan:${season}:${sequence}`;
  if ((state.loans ?? []).some(loan => loan.id === id)) return { ok: false, reason: 'duplicate' };
  const transaction = postClubTransaction(state, {
    sourceId: `${id}:draw`,
    date: currentDate,
    season,
    category: 'credit',
    label: `${access.sponsor} loan draw`,
    amountEUR: principal,
  });
  if (!transaction) return { ok: false, reason: 'duplicate' };
  const loan: ClubLoan = {
    id,
    lender: access.sponsor,
    openedDate: bankDate(currentDate),
    originalPrincipalEUR: principal,
    outstandingPrincipalEUR: principal,
    annualRate: access.package.bankAnnualRate ?? 0.05,
    termMonths: Math.max(12, Math.min(36, Math.round(termMonths / 12) * 12)),
    scheduleRevision: 1,
    paymentSequence: 0,
    status: 'active',
  };
  state.bankLoanSequence = sequence;
  state.loans = [...(state.loans ?? []), loan];
  scheduleRepaymentPlan(state, loan, currentDate, season, loan.termMonths);
  syncBankSponsorCreditFacility(state, season);
  return { ok: true, loan };
}

export function makeVoluntaryLoanRepayment(
  state: TycoonState,
  loanId: string,
  amountEUR: number,
  currentDate: string,
  season: number,
): BankActionResult {
  ensureClubFinanceState(state, season);
  const loan = state.loans?.find(item => item.id === loanId && item.status === 'active');
  if (!loan) return { ok: false, reason: 'amount' };
  const requested = Math.min(money(amountEUR), money(loan.outstandingPrincipalEUR));
  if (requested <= 0) return { ok: false, reason: 'amount' };
  if (requested > Math.max(0, getClubFinanceSnapshot(state, currentDate).availableEUR)) return { ok: false, reason: 'cash' };
  const paymentSequence = Math.max(0, Math.round(loan.paymentSequence ?? 0)) + 1;
  const transaction = postClubTransaction(state, {
    sourceId: `${loan.id}:voluntary:${paymentSequence}`,
    date: currentDate,
    season,
    category: 'finance',
    label: `${loan.lender} voluntary principal repayment`,
    amountEUR: -requested,
  });
  if (!transaction) return { ok: false, reason: 'duplicate' };
  loan.paymentSequence = paymentSequence;
  loan.outstandingPrincipalEUR = Math.max(0, money(loan.outstandingPrincipalEUR) - requested);
  const scheduled = (state.commitments ?? []).filter(item => item.creditLoanId === loan.id && item.status === 'scheduled');
  for (const commitment of scheduled) commitment.status = 'cancelled';
  if (loan.outstandingPrincipalEUR === 0) {
    loan.status = 'repaid';
    loan.repaidDate = bankDate(currentDate);
  } else {
    loan.scheduleRevision += 1;
    scheduleRepaymentPlan(state, loan, currentDate, season, Math.max(1, scheduled.length));
  }
  syncBankSponsorCreditFacility(state, season);
  return { ok: true, loan };
}
