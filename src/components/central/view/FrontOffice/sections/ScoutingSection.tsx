import React from 'react';
import { Briefcase, Search, Target } from 'lucide-react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import type { TycoonState } from '../../../../../types/tycoon';
import { SectionTitle } from '../shared/helpers';
import { FacilityKpi } from '../shared/FacilityKpi';

export const ScoutingSection: React.FC<{ tycoon: TycoonState; currency: string; onChange: (budget: number) => void; locked?: boolean }> = ({ tycoon, currency, onChange, locked = false }) => {
  const investment = tycoon.scoutingInvestment ?? 250_000;
  const quality = Math.max(0, Math.min(1, (investment - 50_000) / (2_500_000 - 50_000)));
  const band = Math.max(2, Math.round(12 - quality * 10));
  const coverage = Math.round(42 + quality * 53);
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const scopes = [
    ['Own Squad', 1, 'Known baseline from training and games'],
    ['Domestic Rivals', Math.max(3, band - 3), 'Endesa reports update quickly'],
    ['EuroLeague Market', band, 'International reports need travel coverage'],
    ['Deep Prospects', band + 3, 'Youth and lower-tier data stays volatile'],
  ] as Array<[string, number, string]>;
  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <SectionTitle icon={<Target size={22} />} title="Analytics" subtitle="Tune analytics investment and review data coverage before making roster decisions." />
        <div className="grid sm:grid-cols-3 gap-3">
          <FacilityKpi icon={<Search size={22} />} label="Report Coverage" value={`${coverage}%`} sub="Tracked market" />
          <FacilityKpi icon={<Target size={22} />} label="Rating Band" value={`±${band}`} sub="Unknown players" />
          <FacilityKpi icon={<Briefcase size={22} />} label="Annual Spend" value={fmt(investment)} sub="Analytics budget" />
        </div>
      </div>

      <div className="grid 2xl:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Analytics Investment</div>
                <div className="text-3xl font-black text-white mt-2">{fmt(investment)}</div>
                <p className="text-sm text-slate-400 mt-1">Higher investment narrows uncertainty bands and improves foreign-market reports.</p>
              </div>
              <div className="w-28 h-28 rounded-full border border-emerald-400/40 bg-emerald-400/10 flex flex-col items-center justify-center">
                <div className="text-3xl font-black text-emerald-300">{coverage}</div>
                <div className="text-xs text-slate-400">coverage</div>
              </div>
            </div>
            <input
              type="range"
              min={50_000}
              max={2_500_000}
              step={25_000}
              value={investment}
              onChange={(event) => onChange(Number(event.target.value))}
              disabled={locked}
              className={`mt-7 w-full accent-emerald-400 ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
            />
            {locked && <div className="mt-3 text-xs font-bold text-amber-300">Locked until next offseason.</div>}
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>{fmt(50_000)}</span><span>{fmt(2_500_000)}</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {scopes.map(([label, uncertainty, desc]) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black text-white">{label}</div>
                  <div className={`rounded-lg border px-2 py-1 text-xs font-black ${uncertainty <= 3 ? 'border-emerald-400/40 text-emerald-300 bg-emerald-400/10' : uncertainty <= 8 ? 'border-amber-400/40 text-amber-300 bg-amber-400/10' : 'border-rose-400/40 text-rose-300 bg-rose-400/10'}`}>
                    ±{uncertainty}
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${Math.max(15, 100 - uncertainty * 7)}%` }} /></div>
                <p className="text-xs text-slate-400 mt-3 leading-5">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Analytics Notes</div>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">Known players stay exact. Unknown non-own ratings should be read as a range, not a promise.</div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">Domestic coverage improves faster than EuroLeague coverage because reports are cheaper to refresh.</div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">At elite spend, hidden-market mistakes are rare but not impossible.</div>
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-emerald-300">Report Depth</div>
            <div className="mt-4 space-y-3">
              {[
                ['Video Reports', Math.round(45 + quality * 50)],
                ['Live Scouting', Math.round(35 + quality * 58)],
                ['Medical Intel', Math.round(30 + quality * 55)],
                ['Contract Intel', Math.round(40 + quality * 50)],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-slate-300">{label}</span><span className="font-black text-emerald-300">{value}%</span></div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${value}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
