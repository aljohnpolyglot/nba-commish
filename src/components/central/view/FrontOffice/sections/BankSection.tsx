import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, Info, Landmark, Minus, Plus, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react';
import type { ClubLoan, TycoonState } from '../../../../../types/tycoon';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { getEffectiveBankSponsorAccess, getOutstandingBankLoans, getOutstandingBankPrincipal } from '../../../../../services/tycoon/bankEngine';
import { SponsorLogo } from '../../../../tycoon/SponsorLogo';
import { getBrandMeta, type LeagueKey } from '../../../../../data/sponsorCatalogFetcher';
import { formatGameDateShort } from '../../../../../utils/dateUtils';

interface BankSectionProps {
  tycoon: TycoonState;
  currency: string;
  sponsorLeague: LeagueKey;
  currentYear: number;
  availableCash: number;
  onBorrow: (amountEUR: number, termMonths: number) => void;
  onRepay: (loanId: string, amountEUR: number) => void;
}

const TERM_OPTIONS = [12, 24, 36] as const;
const LOAN_AMOUNT_STEP = 10_000;

function displayLoanDate(value: string | undefined): string {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : formatGameDateShort(parsed);
}

export const BankSection: React.FC<BankSectionProps> = ({
  tycoon,
  currency,
  sponsorLeague,
  currentYear,
  availableCash,
  onBorrow,
  onRepay,
}) => {
  const access = getEffectiveBankSponsorAccess(tycoon, currentYear);
  const loans = getOutstandingBankLoans(tycoon);
  const loanHistory = useMemo(
    () => [...(tycoon.loans ?? [])].sort((left, right) => right.openedDate.localeCompare(left.openedDate)),
    [tycoon.loans],
  );
  const outstanding = getOutstandingBankPrincipal(tycoon);
  const limit = access?.package.bankLoanLimitEUR ?? 0;
  const headroom = Math.max(0, limit - outstanding);
  const minimum = headroom > 0 ? Math.min(LOAN_AMOUNT_STEP, headroom) : 0;
  const [amount, setAmount] = useState(minimum);
  const [termMonths, setTermMonths] = useState<(typeof TERM_OPTIONS)[number]>(24);
  const [historyOpen, setHistoryOpen] = useState(false);
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);

  useEffect(() => {
    setAmount(current => headroom <= 0 ? 0 : Math.max(minimum, Math.min(headroom, current || minimum)));
  }, [headroom, minimum]);

  const scheduledByLoan = useMemo(() => new Map(loans.map(loan => {
    const payments = (tycoon.commitments ?? [])
      .filter(item => item.creditLoanId === loan.id && item.status === 'scheduled')
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    return [loan.id, payments] as const;
  })), [loans, tycoon.commitments]);

  const decreaseAmount = () => setAmount(value => Math.max(minimum, value - LOAN_AMOUNT_STEP));
  const increaseAmount = () => setAmount(value => Math.min(headroom, value + LOAN_AMOUNT_STEP));

  return (
    <div data-testid="bank-section" className="space-y-5">
      {access ? (
        <section className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-slate-900 to-slate-950">
          <div className="flex flex-col gap-4 border-b border-slate-800 p-5 sm:flex-row sm:items-center">
            <SponsorLogo name={access.sponsor} meta={getBrandMeta(sponsorLeague, access.sponsor)} industry="bank" size={58} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">Club Banking Partner</p>
              <h2 className="mt-1 truncate text-2xl font-black text-white">{access.sponsor}</h2>
              <p className="mt-1 text-sm text-slate-400">New borrowing is available while this partnership remains active.</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-slate-950/60 px-4 py-3 text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Credit Available</p>
              <p className="mt-1 text-xl font-black tabular-nums text-emerald-300">{fmt(headroom)}</p>
            </div>
          </div>

          <div className="grid gap-1 p-3 sm:p-5 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Loan Amount</p>
                  <p className="mt-1 text-3xl font-black tabular-nums text-white">{fmt(amount)}</p>
                </div>
                <WalletCards className="text-emerald-400" size={24} />
              </div>
              <div className="mt-4 grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2">
                <button type="button" aria-label="Decrease loan amount" disabled={amount <= minimum} onClick={decreaseAmount} className="flex h-11 items-center justify-center rounded-xl border border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-30"><Minus size={17} /></button>
                <div className="flex h-11 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-sm font-black text-emerald-200">{fmt(amount)}</div>
                <button type="button" aria-label="Increase loan amount" disabled={amount >= headroom} onClick={increaseAmount} className="flex h-11 items-center justify-center rounded-xl border border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-30"><Plus size={17} /></button>
              </div>
              <input
                aria-label="Loan amount"
                type="range"
                min={minimum}
                max={Math.max(minimum, headroom)}
                step={Math.max(1, Math.min(LOAN_AMOUNT_STEP, headroom - minimum || LOAN_AMOUNT_STEP))}
                value={amount}
                disabled={headroom <= 0}
                onChange={event => setAmount(Number(event.target.value))}
                className="mt-4 h-1.5 w-full cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
              />
              <div className="mt-2 flex justify-between text-[11px] font-semibold text-slate-400">
                <span>{fmt(minimum)}</span>
                <span>{fmt(headroom)}</span>
              </div>
              <p className="mt-3 text-xs text-slate-500">Partner credit line {fmt(limit)} · {fmt(outstanding)} currently owed</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Repayment Term</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {TERM_OPTIONS.map(option => <button key={option} type="button" aria-pressed={termMonths === option} onClick={() => setTermMonths(option)} className={`rounded-xl border px-2 py-3 text-xs font-black transition-colors ${termMonths === option ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}>{option} mo</button>)}
              </div>
              <div className="mt-5 flex items-center gap-3 text-sm"><span className="shrink-0 text-slate-400">Fixed annual interest</span><span className="h-px flex-1 border-t border-dashed border-slate-700" /><span className="font-black text-white">{((access.package.bankAnnualRate ?? 0.05) * 100).toFixed(1)}%</span></div>
              <button type="button" disabled={amount <= 0 || headroom <= 0} onClick={() => onBorrow(amount, termMonths)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-black uppercase tracking-wider text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-35">Request Loan <ChevronRight size={15} /></button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/35 p-6">
          <Landmark size={24} className="text-slate-500" />
          <h2 className="mt-3 text-xl font-black text-white">No active banking partner</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-400">New borrowing is unavailable. Existing loans remain visible and payable until the balance is cleared.</p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3"><ReceiptText size={24} className="shrink-0 text-emerald-400" /><div><p className="text-sm font-black uppercase tracking-wide text-white">Outstanding Loans</p><p className="mt-0.5 text-xs text-slate-500">Scheduled payments update after every draw or voluntary repayment.</p></div></div>
          <div className="shrink-0 text-right"><p className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500"><ShieldCheck size={14} className="text-blue-400" /> Total Outstanding</p><h2 className="mt-1 text-xl font-black tabular-nums text-emerald-300">{fmt(outstanding)}</h2></div>
        </div>
        <div className="mt-4 space-y-3">
          {loans.length === 0 ? <div className="rounded-xl border border-dashed border-slate-800 py-8 text-center text-sm text-slate-500">The club has no outstanding bank debt.</div> : loans.map(loan => (
            <LoanCard key={loan.id} loan={loan} payments={scheduledByLoan.get(loan.id) ?? []} sponsorLeague={sponsorLeague} availableCash={availableCash} fmt={fmt} onRepay={onRepay} />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/45">
        <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen(open => !open)} className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-800/55 sm:px-5">
          <span className="flex min-w-0 items-center gap-3 text-sm text-slate-300"><Info size={20} className="shrink-0 text-emerald-400" /><span>Loans help fund stadium upgrades, youth development, and team operations.</span></span>
          <span className="flex shrink-0 items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-300">{historyOpen ? 'Hide Loan History' : 'View Loan History'} <ChevronRight size={16} className={historyOpen ? 'rotate-90 transition-transform' : 'transition-transform'} /></span>
        </button>
        {historyOpen && (
          <div className="border-t border-slate-800 p-4 sm:p-5">
            {loanHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 py-6 text-center text-sm text-slate-500">No loan history is on file.</div>
            ) : (
              <div className="space-y-2">
                {loanHistory.map(loan => (
                  <div key={loan.id} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5">
                    <div className="min-w-0"><p className="truncate font-black text-white">{loan.lender}</p><p className="mt-1 text-slate-500">Opened {displayLoanDate(loan.openedDate)} · {loan.termMonths} months · {(loan.annualRate * 100).toFixed(1)}% fixed</p></div>
                    <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Original</p><p className="mt-1 font-black tabular-nums text-slate-300">{fmt(loan.originalPrincipalEUR)}</p></div>
                    <div className="sm:text-right"><p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Status</p><p className={`mt-1 font-black uppercase ${loan.status === 'repaid' ? 'text-emerald-300' : 'text-amber-300'}`}>{loan.status === 'repaid' ? `Repaid${loan.repaidDate ? ` · ${displayLoanDate(loan.repaidDate)}` : ''}` : `${fmt(loan.outstandingPrincipalEUR)} owed`}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

const LoanCard: React.FC<{
  loan: ClubLoan;
  payments: NonNullable<TycoonState['commitments']>;
  sponsorLeague: LeagueKey;
  availableCash: number;
  fmt: (value: number) => string;
  onRepay: (loanId: string, amountEUR: number) => void;
}> = ({ loan, payments, sponsorLeague, availableCash, fmt, onRepay }) => {
  const next = payments[0];
  const repaymentOptions = [0.1, 0.25, 0.5, 1]
    .map(ratio => Math.max(1, Math.round(loan.outstandingPrincipalEUR * ratio)))
    .filter((value, index, values) => values.indexOf(value) === index);
  return (
    <article aria-label={`${loan.lender} loan ${fmt(loan.originalPrincipalEUR)}`} className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <SponsorLogo name={loan.lender} meta={getBrandMeta(sponsorLeague, loan.lender)} industry="bank" size={50} />
          <div className="min-w-0">
            <p className="truncate font-black uppercase tracking-wide text-emerald-300">{loan.lender}</p>
            <p className="mt-1 text-xs text-slate-500">Opened {displayLoanDate(loan.openedDate)} · {(loan.annualRate * 100).toFixed(1)}% fixed · {loan.termMonths} months</p>
          </div>
        </div>
        <div className="lg:border-l lg:border-dashed lg:border-slate-800 lg:pl-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Original Principal</p>
          <p className="mt-1 font-black tabular-nums text-white">{fmt(loan.originalPrincipalEUR)}</p>
        </div>
        <div className="lg:text-right">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Outstanding</p>
          <p className="mt-1 text-xl font-black tabular-nums text-amber-300">{fmt(loan.outstandingPrincipalEUR)}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
        <div className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-800 px-3 text-xs text-slate-400"><CalendarDays size={14} />{next ? `Next ${fmt(Math.abs(next.amountEUR))} · ${displayLoanDate(next.dueDate)}` : 'No scheduled payment'}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {repaymentOptions.map((value, index) => (
            <button key={value} type="button" disabled={value > availableCash} onClick={() => onRepay(loan.id, value)} className={`min-h-10 rounded-lg border px-2 text-[10px] font-black uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${index === repaymentOptions.length - 1 ? 'border-emerald-400/40 bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10'}`}>{index === repaymentOptions.length - 1 ? 'Pay in full' : `Pay ${fmt(value)}`}</button>
          ))}
        </div>
      </div>
    </article>
  );
};
