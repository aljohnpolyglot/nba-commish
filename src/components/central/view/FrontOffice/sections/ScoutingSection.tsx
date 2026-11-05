import React, { useEffect, useMemo, useState } from 'react';
import { Info, Lock, Minus, Plus, Save, User } from 'lucide-react';
import type { TycoonState } from '../../../../../types/tycoon';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { getStaffImageUrl, resolveStaffImageId } from '../../../../../utils/staffPortrait';
import { getAnalyticsDepartmentRating } from '../../../../../services/tycoon/analyticsEngine';

const ANALYTICS_STAFF_ROLES = [
  'Chief Scout',
  'Regional Scout',
  'Regional Scout 2',
  'Regional Scout 3',
  'Regional Scout 4',
  'Head of Analytics',
] as const;

const roleLabel = (role: string): string => role === 'Regional Scout' ? 'Regional Scout 1' : role;

export const ScoutingSection: React.FC<{
  tycoon: TycoonState;
  currency: string;
  season: number;
  economyIndex?: number;
  onSave: (budget: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  locked?: boolean;
}> = ({ tycoon, currency, season, economyIndex = 1, onSave, onDirtyChange, locked = false }) => {
  const wallet = tycoon.regionalScoutingBudget?.season === season ? tycoon.regionalScoutingBudget : undefined;
  const rawSpent = Number(wallet?.spentEUR ?? 0);
  const alreadySpent = Number.isFinite(rawSpent) ? Math.max(0, rawSpent) : 0;
  const minimum = Math.max(Math.round(50_000 * economyIndex), alreadySpent);
  const maximum = Math.max(minimum, Math.round(2_500_000 * economyIndex));
  const step = Math.max(5_000, Math.round(50_000 * economyIndex / 5_000) * 5_000);
  const savedInvestment = Math.max(minimum, tycoon.scoutingInvestment ?? Math.round(250_000 * economyIndex));
  const [investment, setInvestment] = useState(savedInvestment);
  const dirty = investment !== savedInvestment;
  const staff = useMemo(() => ANALYTICS_STAFF_ROLES
    .map(role => ({ role, member: tycoon.staffMembers?.find(item => item.role === role) }))
    .filter(entry => entry.member || entry.role !== 'Regional Scout 4'), [tycoon.staffMembers]);
  const analyticsRating = getAnalyticsDepartmentRating(tycoon, economyIndex, investment);
  const scoutingRemaining = Math.max(0, (wallet?.allocatedEUR ?? investment) - alreadySpent);
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);

  useEffect(() => setInvestment(savedInvestment), [savedInvestment]);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-5 sm:p-7">
        <div className="flex justify-end">
          <div className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black ${locked ? 'border-slate-600 text-slate-200' : 'border-emerald-400/35 bg-emerald-400/[0.07] text-emerald-200'}`}>
            {locked && <Lock size={15} />}
            {locked ? 'Locked until next offseason' : 'Ready to adjust'}
          </div>
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.9fr)] lg:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Scouting & Analytics Plan</p>
            <p className="mt-3 text-4xl font-black tabular-nums text-white sm:text-5xl">{fmt(investment)}</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">Annual analytics budget for report processing, player evaluation, and market coverage.</p>
          </div>
          <div>
            <p className="text-sm text-slate-300">Overall Analytics Rating</p>
            <p className="mt-2 text-4xl font-black tabular-nums text-cyan-300">{analyticsRating} <span className="text-2xl text-slate-400">/ 100</span></p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300" style={{ width: `${analyticsRating}%` }} />
            </div>
            <p className="mt-3 text-xs text-slate-500">Based on budget and department staff.</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-black text-white">Scouting & Analytics Staff</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {staff.map(({ role, member }) => {
            const portrait = member ? member.playerPortraitUrl ?? getStaffImageUrl(resolveStaffImageId(member)) : null;
            const rawRating = Number(member?.rating ?? 50);
            const rating = Math.max(1, Math.min(99, Math.round(Number.isFinite(rawRating) ? rawRating : 50)));
            return (
              <article key={role} className="min-w-0 rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-600 bg-slate-800">
                    {portrait ? <img src={portrait} alt={member?.name ?? ''} className="h-full w-full object-cover" /> : <User size={28} className="text-slate-500" />}
                  </div>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-cyan-400/55 bg-cyan-400/[0.06] text-lg font-black text-cyan-300">{rating}</span>
                </div>
                <p className="mt-4 truncate text-base font-black text-white">{member?.name ?? 'Position Vacant'}</p>
                <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{roleLabel(role)}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-white">Annual Budget</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-white">{fmt(investment)}</p>
          </div>
          {alreadySpent > 0 && (
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Trips spent</p>
              <p className="mt-1 text-sm font-black text-amber-200">{fmt(alreadySpent)}</p>
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-[64px_minmax(0,1fr)_64px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
          <button type="button" onClick={() => setInvestment(Math.max(minimum, investment - step))} disabled={locked || investment <= minimum} aria-label="Decrease annual analytics budget" className="flex h-16 items-center justify-center border-r border-slate-700 text-cyan-300 hover:bg-white/5 disabled:text-slate-700">
            <Minus size={22} />
          </button>
          <div className="flex flex-col items-center justify-center px-2 text-center">
            <p className="text-xl font-black tabular-nums text-cyan-300">{fmt(investment)}</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Per season</p>
          </div>
          <button type="button" onClick={() => setInvestment(Math.min(maximum, investment + step))} disabled={locked || investment >= maximum} aria-label="Increase annual analytics budget" className="flex h-16 items-center justify-center border-l border-slate-700 text-cyan-300 hover:bg-white/5 disabled:text-slate-700">
            <Plus size={22} />
          </button>
        </div>
        <button type="button" onClick={() => onSave(investment)} disabled={locked || !dirty} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">
          <Save size={17} /> Save Budget
        </button>
      </section>

      <div className="flex items-center justify-center gap-2 text-center text-xs leading-5 text-slate-500">
        <Info size={14} />
        Higher budgets and stronger staff improve scouting coverage and report clarity. {fmt(scoutingRemaining)} remains available for Regional Scout assignments.
      </div>
    </div>
  );
};
