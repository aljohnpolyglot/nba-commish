import { Banknote, Building2, Gavel, ShieldCheck } from 'lucide-react';
import { useGame } from '../../../../../store/GameContext';
import { getLeagueCurrencyCode } from '../../../../../utils/helpers';
import {
  FINE_TEMPLATE_CATALOG,
  getFineTemplateAmount,
  type FineEnforcement,
} from '../../../../../services/disciplinePolicy';

const policyLabel: Record<FineEnforcement, string> = {
  automatic: 'Automatic',
  commissioner_discretion: 'Commissioner',
  team_discretion: 'Team',
};

export function FinePolicySection() {
  const { state } = useGame();
  const currencyCode = getLeagueCurrencyCode(state.leagueStats);
  const formatMoney = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
  const automatic = FINE_TEMPLATE_CATALOG.templates.filter(template => template.enforcement === 'automatic');
  const discretionary = FINE_TEMPLATE_CATALOG.templates.filter(template => template.enforcement !== 'automatic');

  return (
    <section className="space-y-6 rounded-3xl border border-slate-700/70 bg-slate-900/35 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
            <Banknote size={22} />
          </span>
          <div>
            <h5 className="text-sm font-black uppercase tracking-widest text-white">Fines</h5>
            <p className="mt-1 text-xs text-slate-500">Current amounts for the {state.leagueStats.year} season.</p>
          </div>
        </div>
        <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-cyan-300">
          Era-adjusted
        </span>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-cyan-300" />
          <h6 className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Automatic schedules</h6>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {automatic.map(template => (
            <div key={template.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-bold text-white">{template.name}</p>
                <p className="shrink-0 text-xs font-black text-emerald-300">
                  {formatMoney(getFineTemplateAmount(state, template))}
                </p>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{template.reason}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Gavel size={16} className="text-amber-300" />
          <h6 className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Discretionary misconduct</h6>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {discretionary.map(template => (
            <div key={template.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-bold text-white">{template.name}</p>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-wide ${
                  template.enforcement === 'team_discretion'
                    ? 'bg-sky-400/10 text-sky-300'
                    : 'bg-amber-400/10 text-amber-300'
                }`}>
                  {policyLabel[template.enforcement]}
                </span>
              </div>
              <p className="mt-2 text-sm font-black text-emerald-300">
                {formatMoney(getFineTemplateAmount(state, template))}
                {template.maximumAmountUSD && template.maximumAmountUSD !== template.baseAmountUSD
                  ? ` · up to ${formatMoney(getFineTemplateAmount(state, { ...template, baseAmountUSD: template.maximumAmountUSD }))}`
                  : ''}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{template.reason}</p>
              {template.suspensionEligible && (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-violet-300">
                  <Building2 size={12} /> A suspension may accompany the fine
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
