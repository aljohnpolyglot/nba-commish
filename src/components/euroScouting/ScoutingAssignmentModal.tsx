import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Plane, User, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { calculateScoutingCost, estimateDiscoveryRange, EURO_SCOUTING_DURATIONS, getChiefScoutRating, getEuroUserTeam, getRegionalScouts } from '../../services/euroScouting/engine';
import type { EuroCountryProfile } from '../../services/euroScouting/types';
import { preloadEuroCityPools } from '../../services/euroScouting/cityPools';
import { getClubFinanceSnapshot } from '../../services/tycoon/clubFinance';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { CountryFlag } from '../shared/CountryFlag';

export const ScoutingAssignmentModal: React.FC<{
  country: EuroCountryProfile;
  onClose: () => void;
}> = ({ country, onClose }) => {
  const { state, dispatchAction } = useGame();
  const assignments = state.euroScouting?.assignments ?? [];
  const team = getEuroUserTeam(state);
  const chiefScoutRating = getChiefScoutRating(team);
  const scouts = getRegionalScouts(team, assignments);
  const available = scouts.filter(scout => !scout.activeAssignmentId);
  const [scoutId, setScoutId] = useState(available[0]?.id ?? '');
  const [durationDays, setDurationDays] = useState<number>(14);
  const [customDays, setCustomDays] = useState('');
  const [customDaysDraft, setCustomDaysDraft] = useState('');
  const [customDaysOpen, setCustomDaysOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [farewell, setFarewell] = useState<{ scoutName: string; countryName: string } | null>(null);
  const scout = scouts.find(item => item.id === scoutId);
  const cost = calculateScoutingCost(state, country, durationDays);
  const finance = team?.tycoon ? getClubFinanceSnapshot(team.tycoon, state.date) : null;
  const currency = state.leagueStats.currency ?? 'EUR';
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const savedWallet = team?.tycoon?.regionalScoutingBudget;
  const walletAllocated = savedWallet?.season === state.leagueStats.year
    ? savedWallet.allocatedEUR
    : Number(team?.tycoon?.scoutingInvestment ?? 0);
  const walletSpent = savedWallet?.season === state.leagueStats.year ? savedWallet.spentEUR : 0;
  const walletRemaining = Math.max(0, walletAllocated - walletSpent);
  const clubCashAfter = (finance?.cashOnHandEUR ?? 0) - cost;
  const scoutingBudgetAfter = walletRemaining - cost;
  const canAfford = (finance?.availableEUR ?? 0) >= cost && walletRemaining >= cost;
  const discoveryRange = useMemo(
    () => estimateDiscoveryRange(durationDays, scout?.rating ?? 60, chiefScoutRating),
    [chiefScoutRating, durationDays, scout?.rating],
  );

  const submit = async () => {
    if (!scoutId) return;
    setStarting(true);
    await preloadEuroCityPools();
    await dispatchAction({
      type: 'START_EURO_SCOUTING_ASSIGNMENT',
      payload: { scoutId, countryId: country.id, durationDays },
    });
    setStarting(false);
    setFarewell({ scoutName: scout?.name ?? 'Your scout', countryName: country.name });
  };

  if (farewell) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-3xl border border-emerald-500/35 bg-slate-950 p-6 text-center shadow-2xl sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
            <Plane size={26} className="text-emerald-300" />
          </div>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">Destination Confirmed</p>
          <h2 className="mt-2 text-2xl font-black text-white">{farewell.scoutName}</h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">“Noted. I’ll head to {farewell.countryName} and report back with the best prospects I find.”</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-xs font-bold text-slate-300">
            <CountryFlag country={country.name} iso2={country.iso2} className="inline-flex h-4 w-6 rounded-sm" />
            {country.name} · {durationDays} days
          </div>
          <button onClick={onClose} className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-emerald-400">Continue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-900/95 p-5 backdrop-blur">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">New Assignment</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-black text-white"><CountryFlag country={country.name} iso2={country.iso2} className="inline-flex h-5 w-8 rounded-sm" />{country.name}</h2>
            <p className="mt-1 text-xs text-slate-400">Choose a regional scout and trip length.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={18} /></button>
        </div>

        <div className="space-y-6 p-5">
          <section>
            <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Regional Scout</h3>
            {scouts.length === 0 ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                Hire a Regional Scout from Team Office before arranging a trip.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {scouts.map(item => {
                  const disabled = !!item.activeAssignmentId;
                  return (
                    <button
                      key={item.id}
                      disabled={disabled}
                      onClick={() => setScoutId(item.id)}
                      className={`rounded-2xl border p-3 text-left transition ${scoutId === item.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 bg-slate-950/40 hover:border-slate-500'} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <div className="flex items-center gap-3"><div className="relative shrink-0"><span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-800">{item.portraitUrl ? <img src={item.portraitUrl} alt={item.name} className="h-full w-full object-cover" /> : <User size={18} className="text-slate-500" />}</span><span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-slate-900 bg-emerald-600 text-[9px] font-black text-white">{item.rating}</span></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold text-white">{item.name}</span>{scoutId === item.id && <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />}</div><p className="mt-1 text-[11px] text-slate-500">{disabled ? 'Currently abroad' : item.nationality || 'Available'}</p></div></div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Trip Length</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {EURO_SCOUTING_DURATIONS.filter(days => days !== 60 && days <= 90).map(days => (
                <button key={days} onClick={() => { setDurationDays(days); setCustomDays(''); }} className={`rounded-xl border py-3 text-xs font-black ${durationDays === days && !customDays ? 'border-blue-400 bg-blue-500/15 text-blue-200' : 'border-slate-700 bg-slate-950/40 text-slate-400 hover:text-white'}`}>
                  {days}d
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setCustomDaysDraft(customDays || String(durationDays)); setCustomDaysOpen(true); }}
                className={`rounded-xl border py-3 text-xs font-black ${customDays ? 'border-blue-400 bg-blue-500/15 text-blue-200' : 'border-slate-700 bg-slate-950/40 text-slate-400 hover:text-white'}`}
              >
                {customDays ? `${durationDays}d` : 'Custom'}
              </button>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <Plane size={17} className="text-blue-400" />
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Travel Cost</p>
              <p className="mt-1 text-lg font-black text-white">{fmt(cost)}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Club Cash</p>
              <p className={`mt-2 text-lg font-black ${(finance?.availableEUR ?? 0) >= cost ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(finance?.cashOnHandEUR ?? 0)}</p>
              <p className="mt-1 text-[10px] text-slate-500">{fmt(finance?.availableEUR ?? 0)} available</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Scouting Budget</p>
              <p className={`mt-2 text-lg font-black ${walletRemaining >= cost ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(walletRemaining)}</p>
              <p className="mt-1 text-[10px] text-slate-500">{fmt(walletAllocated)} allocated · {fmt(walletSpent)} spent</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <Clock3 size={17} className="text-emerald-400" />
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Likely Finds</p>
              <p className="mt-1 text-lg font-black text-white">{discoveryRange[0]}–{discoveryRange[1]}</p>
            </div>
          </div>

          <section className={`rounded-2xl border p-4 ${canAfford ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/10'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${canAfford ? 'text-emerald-300' : 'text-rose-300'}`}>After this trip</p>
                <p className="mt-1 text-xs text-slate-400">Projected balances once the assignment is booked.</p>
              </div>
              <Plane size={20} className={canAfford ? 'text-emerald-300' : 'text-rose-300'} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Club Cash</p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${clubCashAfter >= 0 ? 'text-white' : 'text-rose-300'}`}>{fmt(clubCashAfter)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Scouting Budget Remaining</p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${scoutingBudgetAfter >= 0 ? 'text-white' : 'text-rose-300'}`}>{fmt(scoutingBudgetAfter)}</p>
              </div>
            </div>
          </section>

          <p className="text-xs leading-relaxed text-slate-500">Longer trips create more opportunities to find players. The destination and scout determine what your club sees.</p>
        </div>

        <div className="sticky bottom-0 flex gap-3 border-t border-slate-800 bg-slate-900/95 p-4 backdrop-blur">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-300 hover:bg-slate-800">Cancel</button>
          <button disabled={!scoutId || available.length === 0 || starting || !canAfford} onClick={submit} className="flex-[1.4] rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">{starting ? 'Preparing Trip…' : !canAfford ? 'Budget Unavailable' : 'Begin Scouting'}</button>
        </div>
      </div>
      {customDaysOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onClick={event => event.target === event.currentTarget && setCustomDaysOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-blue-500/30 bg-slate-950 p-5 shadow-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">Custom Trip Length</p>
            <h3 className="mt-1 text-xl font-black text-white">How many days?</h3>
            <p className="mt-1 text-xs text-slate-500">Choose between 7 and 120 days.</p>
            <input
              autoFocus
              type="number"
              min={7}
              max={120}
              value={customDaysDraft}
              onChange={event => setCustomDaysDraft(event.target.value)}
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg font-black text-white outline-none focus:border-blue-400"
            />
            <div className="mt-5 flex gap-3">
              <button onClick={() => setCustomDaysOpen(false)} className="flex-1 rounded-xl border border-slate-700 py-3 text-xs font-black text-slate-300 hover:bg-slate-900">Cancel</button>
              <button
                disabled={!Number.isFinite(Number(customDaysDraft)) || Number(customDaysDraft) < 7 || Number(customDaysDraft) > 120}
                onClick={() => {
                  const value = Math.round(Number(customDaysDraft));
                  if (!Number.isFinite(value) || value < 7 || value > 120) return;
                  setDurationDays(value);
                  setCustomDays(String(value));
                  setCustomDaysOpen(false);
                }}
                className="flex-1 rounded-xl bg-blue-500 py-3 text-xs font-black text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
