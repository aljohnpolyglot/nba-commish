import React, { useMemo, useState } from 'react';
import { Bus, Hotel, Lock, Minus, Plane, Plus, Save, ShieldCheck } from 'lucide-react';
import type { TycoonState, TycoonTier } from '../../../../../types/tycoon';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { applySponsorRecoveryBenefit, getTravelGameplayEffectsFromPreferences } from '../../../../../services/tycoon/travelGameplayEffects';
import type { TravelFixtureStatus } from '../../../../../services/tycoon/travelFixtures';
import { getSponsorRecoveryReduction, getSponsorTravelCoverage } from '../../../../../services/tycoon/sponsorBenefits';
import {
  getSponsorPerksForTarget,
  getSponsorQualityFloor,
  getSponsorTravelCostMultiplier,
  isSponsorBudgetControlLocked,
} from '../../../../../services/tycoon/sponsorPerkEngine';
import { getBrandMeta, type LeagueKey } from '../../../../../data/sponsorCatalogFetcher';
import { SponsorLogo } from '../../../../tycoon/SponsorLogo';

type Axis = 'hotel' | 'flight' | 'bus';

const TIER_DEFAULTS: Record<TycoonTier, Record<Axis, number>> = {
  S: { hotel: 5, flight: 5, bus: 5 },
  A: { hotel: 4.5, flight: 4.5, bus: 4 },
  B: { hotel: 4, flight: 4, bus: 3.5 },
  C: { hotel: 3.5, flight: 3, bus: 3 },
  D: { hotel: 3, flight: 2.5, bus: 2.5 },
};

const HOTEL_PRICE: Record<string, number> = {
  '0.5': 1_500, '1.0': 2_500, '1.5': 4_000, '2.0': 6_000, '2.5': 8_000,
  '3.0': 10_000, '3.5': 13_000, '4.0': 16_000, '4.5': 22_000, '5.0': 30_000,
};
const FLIGHT_PRICE: Record<string, number> = {
  '0.5': 4_000, '1.0': 7_000, '1.5': 12_000, '2.0': 18_000, '2.5': 28_000,
  '3.0': 40_000, '3.5': 70_000, '4.0': 110_000, '4.5': 160_000, '5.0': 220_000,
};
const BUS_PRICE: Record<string, number> = {
  '0.5': 400, '1.0': 700, '1.5': 1_100, '2.0': 1_700, '2.5': 2_400,
  '3.0': 3_500, '3.5': 5_000, '4.0': 7_500, '4.5': 11_000, '5.0': 16_000,
};

const qualityLabel = (value: number): string => value >= 4.5 ? 'World Class' : value >= 3.5 ? 'Premium' : value >= 2.5 ? 'Standard' : 'Budget';

const TravelLevel: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  unitCost: number;
  totalCost: number | null;
  tripCount: number | null;
  fmt: (value: number) => string;
  onChange: (value: number) => void;
  locked: boolean;
  sponsor?: string;
  sponsorLeague: LeagueKey;
}> = ({ icon, label, value, unitCost, totalCost, tripCount, fmt, onChange, locked, sponsor, sponsorLeague }) => (
  <div className="rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900/90 to-slate-950/80 p-4 shadow-lg shadow-black/10">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2 text-sm font-black text-white"><span className="text-amber-300">{icon}</span>{label}</div>
      <div className="flex min-w-0 items-start gap-2 text-right">
        {sponsor && <SponsorLogo name={sponsor} meta={getBrandMeta(sponsorLeague, sponsor)} size={30} />}
        <div className="min-w-0">
          <div className="text-lg font-black text-amber-300">{value.toFixed(1)} / 5</div>
          <div className="max-w-36 truncate text-[10px] text-slate-400">{sponsor ? `${sponsor} · Sponsored` : qualityLabel(value)}</div>
        </div>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-[42px_minmax(0,1fr)_42px] items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900/70">
      <button type="button" onClick={() => onChange(Math.max(0.5, value - 0.5))} disabled={locked || value <= 0.5} aria-label={`Decrease ${label}`} className="flex h-10 items-center justify-center border-r border-slate-700 text-slate-200 hover:bg-white/5 disabled:text-slate-700"><Minus size={15} /></button>
      <div className="text-center text-xs font-black uppercase tracking-wider text-slate-300">{qualityLabel(value)}</div>
      <button type="button" onClick={() => onChange(Math.min(5, value + 0.5))} disabled={locked || value >= 5} aria-label={`Increase ${label}`} className="flex h-10 items-center justify-center border-l border-slate-700 text-slate-200 hover:bg-white/5 disabled:text-slate-700"><Plus size={15} /></button>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-500">{fmt(unitCost)} × {tripCount ?? '—'}</span>
      <span className="font-black tabular-nums text-slate-200">{totalCost == null ? '—' : fmt(totalCost)}</span>
    </div>
  </div>
);

export const TravelSection: React.FC<{
  tycoon: TycoonState;
  currency: string;
  economyIndex?: number;
  currentYear: number;
  domesticAwayGames: number;
  internationalAwayGames: number;
  fixtureStatus: TravelFixtureStatus;
  onSave: (preferences: { hotel: number; flight: number; bus: number }) => void;
  onDirtyChange?: (dirty: boolean) => void;
  locked?: boolean;
  sponsorLeague: LeagueKey;
}> = ({ tycoon, currency, economyIndex = 1, currentYear, domesticAwayGames, internationalAwayGames, fixtureStatus, onSave, onDirtyChange, locked = false, sponsorLeague }) => {
  const defaults = TIER_DEFAULTS[tycoon.tier];
  const savedHotel = tycoon.travelPreferences?.hotel ?? defaults.hotel;
  const savedFlight = tycoon.travelPreferences?.flight ?? defaults.flight;
  const savedBus = tycoon.travelPreferences?.bus ?? defaults.bus;
  const [hotel, setHotel] = useState(savedHotel);
  const [flight, setFlight] = useState(savedFlight);
  const [bus, setBus] = useState(savedBus);
  const dirty = hotel !== savedHotel || flight !== savedFlight || bus !== savedBus;
  React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  const flightCoverage = getSponsorTravelCoverage(tycoon, 'flight');
  const busCoverage = getSponsorTravelCoverage(tycoon, 'bus');
  const airlinePerk = getSponsorPerksForTarget(tycoon, currentYear, 'flightQualityStars')[0];
  const hotelPerk = getSponsorPerksForTarget(tycoon, currentYear, 'hotelQualityStars')[0];
  const groundTravelPerk = [
    ...getSponsorPerksForTarget(tycoon, currentYear, 'busTravelCost'),
    ...getSponsorPerksForTarget(tycoon, currentYear, 'railTravelCost'),
    ...getSponsorPerksForTarget(tycoon, currentYear, 'ferryTravelCost'),
  ][0];
  const effectiveHotel = Math.max(hotel, getSponsorQualityFloor(tycoon, currentYear, 'hotelQualityStars') ?? 0);
  const effectiveFlight = Math.max(flightCoverage?.package.serviceStars ?? flight, getSponsorQualityFloor(tycoon, currentYear, 'flightQualityStars') ?? 0);
  const effectiveBus = Math.max(busCoverage?.package.serviceStars ?? bus, getSponsorQualityFloor(tycoon, currentYear, 'busTravelCost') ?? 0);
  const recoveryReduction = getSponsorRecoveryReduction(tycoon);
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const totalAwayGames = domesticAwayGames + internationalAwayGames;
  const countsPending = fixtureStatus === 'pending';
  const controlsLocked = locked || countsPending;
  const flightTrips = totalAwayGames;
  const hotelUnit = Math.round((HOTEL_PRICE[effectiveHotel.toFixed(1)] ?? 0) * economyIndex * getSponsorTravelCostMultiplier(tycoon, currentYear, 'hotel'));
  const flightUnit = flightCoverage ? 0 : Math.round((FLIGHT_PRICE[effectiveFlight.toFixed(1)] ?? 0) * economyIndex * getSponsorTravelCostMultiplier(tycoon, currentYear, 'flight'));
  const busUnit = busCoverage ? 0 : Math.round((BUS_PRICE[effectiveBus.toFixed(1)] ?? 0) * economyIndex * getSponsorTravelCostMultiplier(tycoon, currentYear, 'bus'));
  const hotelTotal = countsPending ? null : hotelUnit * totalAwayGames;
  const flightTotal = countsPending ? null : flightUnit * flightTrips;
  const busTotal = countsPending ? null : busUnit * domesticAwayGames;
  const grandTotal = hotelTotal == null || flightTotal == null || busTotal == null ? null : hotelTotal + flightTotal + busTotal;
  const average = (effectiveHotel + effectiveFlight + effectiveBus) / 3;
  const impact = useMemo(() => applySponsorRecoveryBenefit(getTravelGameplayEffectsFromPreferences({ hotel: effectiveHotel, flight: effectiveFlight, bus: effectiveBus }), recoveryReduction), [effectiveHotel, effectiveFlight, effectiveBus, recoveryReduction]);

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 shadow-xl shadow-black/10 sm:p-5 ${locked ? 'border-slate-700 bg-gradient-to-br from-slate-900/80 to-slate-950/70' : 'border-amber-400/30 bg-gradient-to-br from-amber-400/[0.09] via-slate-900/75 to-slate-950/80'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Annual travel plan</div>
            <div className="mt-1 text-3xl font-black tabular-nums text-white">{grandTotal == null ? '—' : fmt(grandTotal)}</div>
            <p className="mt-1 text-sm text-slate-400">
              {fixtureStatus === 'pending'
                ? 'Fixture list pending · costs will appear after the draw'
                : fixtureStatus === 'provisional'
                  ? `${qualityLabel(average)} standard · ${totalAwayGames} confirmed away games · more draws pending`
                  : `${qualityLabel(average)} standard · ${totalAwayGames} away games`}
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 self-start rounded-lg border px-3 py-2 text-xs font-black ${locked ? 'border-slate-700 text-slate-300' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}>
            {controlsLocked ? <Lock size={14} /> : <ShieldCheck size={14} />}{locked ? 'Locked until next offseason' : countsPending ? 'Awaiting fixture release' : 'Ready to adjust'}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <TravelLevel icon={<Hotel size={18} />} label="Hotel" value={effectiveHotel} unitCost={hotelUnit} totalCost={hotelTotal} tripCount={countsPending ? null : totalAwayGames} fmt={fmt} onChange={setHotel} locked={controlsLocked || isSponsorBudgetControlLocked(tycoon, currentYear, 'hotelQualityStars')} sponsor={hotelPerk?.sponsor} sponsorLeague={sponsorLeague} />
        <TravelLevel icon={<Plane size={18} />} label="Flights" value={effectiveFlight} unitCost={flightUnit} totalCost={flightTotal} tripCount={countsPending ? null : flightTrips} fmt={fmt} onChange={setFlight} locked={controlsLocked || !!flightCoverage || isSponsorBudgetControlLocked(tycoon, currentYear, 'flightQualityStars')} sponsor={flightCoverage?.sponsor ?? airlinePerk?.sponsor} sponsorLeague={sponsorLeague} />
        <TravelLevel icon={<Bus size={18} />} label="Ground Travel" value={effectiveBus} unitCost={busUnit} totalCost={busTotal} tripCount={countsPending ? null : domesticAwayGames} fmt={fmt} onChange={setBus} locked={controlsLocked || !!busCoverage} sponsor={busCoverage?.sponsor ?? groundTravelPerk?.sponsor} sponsorLeague={sponsorLeague} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Road Recovery', impact.roadRecoveryScore],
          ['Fatigue Management', impact.playerFatigueScore],
          ['Team Morale', impact.teamMoraleScore],
          ['Road Performance', impact.roadPerformanceScore],
        ].map(([label, score]) => (
          <div key={label as string} className="rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900/90 to-slate-950/80 p-4 shadow-lg shadow-black/10">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
            <div className="mt-1 text-2xl font-black text-amber-300">{score}%</div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onSave({ hotel, flight, bus })}
        disabled={controlsLocked || !dirty}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        <Save size={15} /> {locked ? 'Travel plan locked' : countsPending ? 'Available after fixture release' : 'Save travel plan'}
      </button>
    </div>
  );
};
