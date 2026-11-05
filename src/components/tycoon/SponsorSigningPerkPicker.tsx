import React, { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { TycoonState } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import {
  getAvailableSigningSponsorPerks,
  type SponsorSigningPerkChoice,
} from '../../services/tycoon/sponsorPerkEngine';
import { getBrandMeta, type LeagueKey } from '../../data/sponsorCatalogFetcher';
import { SponsorLogo } from './SponsorLogo';

interface Props {
  tycoon?: TycoonState;
  currentYear: number;
  appliesTo: 'player' | 'staff';
  annualSalaryEUR: number;
  selectedKey: string | null;
  onSelect: (choice: SponsorSigningPerkChoice | null) => void;
  currency?: string;
  sponsorLeague?: LeagueKey;
}

export const SponsorSigningPerkPicker: React.FC<Props> = ({
  tycoon,
  currentYear,
  appliesTo,
  annualSalaryEUR,
  selectedKey,
  onSelect,
  currency = 'EUR',
  sponsorLeague = 'spain',
}) => {
  const [open, setOpen] = useState(false);
  const choices = useMemo(
    () => getAvailableSigningSponsorPerks(tycoon, currentYear, appliesTo, annualSalaryEUR),
    [annualSalaryEUR, appliesTo, currentYear, tycoon],
  );
  const selected = choices.find(choice => choice.key === selectedKey) ?? null;
  if (choices.length === 0 && !selected) return null;
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-sm border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
            {selected ? <SponsorLogo name={selected.sponsor} meta={getBrandMeta(sponsorLeague, selected.sponsor)} size={34} /> : <Plus size={17} />}
          </span>
          <span className="min-w-0">
            <span className="block text-[9px] font-black uppercase tracking-[0.22em] text-amber-300">Sponsor signing perk</span>
            <span className="mt-0.5 block truncate text-sm font-black text-white">
              {selected ? `${selected.perk.label} · ${selected.sponsor}` : 'Add Perk'}
            </span>
          </span>
        </span>
        {selected && <span className="shrink-0 text-xs font-black text-emerald-300">+{fmt(selected.equivalentAnnualValueEUR)}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[240] flex items-end justify-center bg-black/80 sm:items-center sm:p-4" onClick={event => event.target === event.currentTarget && setOpen(false)}>
          <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">Current sponsors</div>
                <h3 className="mt-1 text-xl font-black text-white">Add a signing perk</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">One available use is consumed only if the deal is signed.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={19} /></button>
            </div>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => { onSelect(null); setOpen(false); }}
                className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left"
              >
                <span className="text-sm font-black text-slate-300">No sponsor perk</span>
                {!selected && <Check size={17} className="text-emerald-300" />}
              </button>
              {choices.map(choice => (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => { onSelect(choice); setOpen(false); }}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left hover:border-amber-400/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <SponsorLogo name={choice.sponsor} meta={getBrandMeta(sponsorLeague, choice.sponsor)} size={38} />
                      <div className="min-w-0">
                      <div className="text-sm font-black text-white">{choice.perk.label}</div>
                      <div className="mt-0.5 truncate text-xs font-bold text-amber-300">{choice.sponsor}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-emerald-300">+{fmt(choice.equivalentAnnualValueEUR)}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{choice.remainingUses} / {choice.totalUses} left</div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">{choice.perk.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
