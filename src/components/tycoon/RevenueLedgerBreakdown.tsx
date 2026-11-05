import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { AnnualLedger, AnnualLedgerComponent } from '../../types/tycoon';

interface Props {
  ledger: AnnualLedger;
  fmt: (value: number) => string;
  title?: string;
  className?: string;
  onOpenPlayer?: (playerId: string) => void;
}

const STATUS_LABEL: Record<AnnualLedgerComponent['status'], string> = {
  contracted: 'Contracted',
  earned: 'Earned',
  posted: 'Received',
  projected: 'Projected',
};

export const RevenueLedgerBreakdown: React.FC<Props> = ({ ledger, fmt, title = 'Revenue', className = '', onOpenPlayer }) => {
  const rows = [
    { key: 'matchday' as const, label: 'Matchday', value: ledger.revenue.matchday },
    { key: 'commercial' as const, label: 'Club Shop & Media', value: ledger.revenue.commercial ?? 0 },
    { key: 'sponsorship' as const, label: 'Sponsorships', value: ledger.revenue.sponsorship },
    { key: 'tv' as const, label: 'Media Rights', value: ledger.revenue.tv },
    { key: 'prize' as const, label: 'Prize Money', value: ledger.revenue.prize },
    { key: 'transfer' as const, label: 'Player Sales & Loan Fees', value: ledger.revenue.transfer },
  ].filter(row => row.value > 0);
  const total = Object.values(ledger.revenue).reduce((sum, value) => sum + Number(value ?? 0), 0);

  return (
    <div className={`mt-5 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-widest text-slate-500">{title}</div>
        <div className="text-sm font-black tabular-nums text-emerald-300">{fmt(total)}</div>
      </div>
      <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/70">
        {rows.map(row => {
          const details = ledger.revenueDetails?.[row.key] ?? [];
          const reconciled = details.reduce((sum, detail) => sum + detail.amount, 0) === row.value;
          if (details.length === 0) {
            return (
              <div key={row.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-slate-400">{row.label}</span>
                <span className="font-black tabular-nums text-slate-200">{fmt(row.value)}</span>
              </div>
            );
          }
          return (
            <details key={row.key} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-slate-400">
                  <ChevronDown size={14} className="shrink-0 transition-transform group-open:rotate-180" />
                  {row.label}
                </span>
                <span className="font-black tabular-nums text-slate-200">{fmt(row.value)}</span>
              </summary>
              <div className="space-y-2 border-t border-slate-800/70 bg-slate-900/40 px-3 py-3">
                {details.map(detail => (
                  <div key={detail.id} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      {detail.playerId && onOpenPlayer
                        ? <button type="button" onClick={() => onOpenPlayer(detail.playerId!)} className="truncate text-left font-bold text-sky-300 hover:text-sky-200 hover:underline">{detail.label}</button>
                        : <div className="truncate font-bold text-slate-300">{detail.label}</div>}
                      <div className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
                        {[detail.transactionType, detail.counterpartyName ? `to ${detail.counterpartyName}` : null, detail.date, STATUS_LABEL[detail.status]].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <span className="shrink-0 font-black tabular-nums text-slate-300">{fmt(detail.amount)}</span>
                  </div>
                ))}
                {!reconciled && <div className="text-[10px] font-bold text-amber-300">Component detail is still being finalized.</div>}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
};
