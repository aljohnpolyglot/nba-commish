import React, { useMemo, useState } from 'react';
import { Plane, Hotel, Bus, Star } from 'lucide-react';
import type { TycoonState, TycoonTier } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { HelpIconPopover } from './HelpIconPopover';

interface Props {
  tycoon: TycoonState;
  domesticAwayGames: number;
  internationalAwayGames: number;
  currency: string;
  /** Locks sliders, hides the slider input UI. */
  readOnly?: boolean;
  onSave?: (prefs: { hotel: number; flight: number; bus: number }) => void;
}

type Axis = 'hotel' | 'flight' | 'bus';

const TIER_DEFAULTS: Record<TycoonTier, Record<Axis, number>> = {
  S: { hotel: 5.0, flight: 5.0, bus: 5.0 },
  A: { hotel: 4.5, flight: 4.5, bus: 4.0 },
  B: { hotel: 4.0, flight: 4.0, bus: 3.5 },
  C: { hotel: 3.5, flight: 3.0, bus: 3.0 },
  D: { hotel: 3.0, flight: 2.5, bus: 2.5 },
};

const HOTEL_LABELS: Record<string, string> = {
  '0.5': 'Roadside motel',
  '1.0': 'Hostel',
  '1.5': 'Budget inn',
  '2.0': 'Standard 2★',
  '2.5': 'Comfort',
  '3.0': 'Mid-range 3★',
  '3.5': 'Superior 3★',
  '4.0': 'First-class 4★ — EuroLeague compliant',
  '4.5': 'Premium 4★ suites',
  '5.0': 'Luxury 5★ — single rooms, recovery suites',
};

const FLIGHT_LABELS: Record<string, string> = {
  '0.5': 'Economy commercial · long layovers',
  '1.0': 'Economy commercial',
  '1.5': 'Premium economy',
  '2.0': 'Premium economy · priority boarding',
  '2.5': 'Business class commercial',
  '3.0': 'Business class commercial · full team',
  '3.5': 'Group charter · shared',
  '4.0': 'Charter jet · standard config',
  '4.5': 'Charter jet · business config',
  '5.0': 'Private jet · custom team layout (Boeing 737BBJ)',
};

const BUS_LABELS: Record<string, string> = {
  '0.5': 'Public coach',
  '1.0': 'Standard coach',
  '1.5': 'Standard coach · onboard wifi',
  '2.0': 'Comfort coach',
  '2.5': 'Comfort coach · reclining seats',
  '3.0': 'Premium coach',
  '3.5': 'Luxury coach · panoramic',
  '4.0': 'Sleeper coach',
  '4.5': 'Custom team bus',
  '5.0': 'Custom luxury bus · galley + lounge',
};

// EUR per away game (per night for hotel, per trip for flight/bus)
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

const fmtKey = (v: number) => v.toFixed(1);

const Stars: React.FC<{ value: number }> = ({ value }) => {
  const full = Math.floor(value);
  const hasHalf = value - full >= 0.5;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        const isFull = i < full;
        const isHalf = i === full && hasHalf;
        return (
          <div key={i} className="relative w-4 h-4">
            <Star size={16} className="absolute inset-0 text-slate-700" />
            {(isFull || isHalf) && (
              <div className="absolute inset-0 overflow-hidden" style={{ width: isHalf ? '50%' : '100%' }}>
                <Star size={16} className="text-amber-400 fill-amber-400" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Row: React.FC<{
  icon: React.ReactNode;
  title: string;
  unitLabel: string;
  appliesTo: string;
  value: number;
  unitPrice: number;
  games: number;
  labelMap: Record<string, string>;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
  readOnly?: boolean;
}> = ({ icon, title, unitLabel, appliesTo, value, unitPrice, games, labelMap, onChange, fmt, readOnly }) => {
  const total = unitPrice * games;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-amber-400">{icon}</span>
          <span className="text-sm font-semibold text-slate-100">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Stars value={value} />
          <span className="text-sm font-bold text-amber-300 tabular-nums w-10 text-right">{value.toFixed(1)}</span>
        </div>
      </div>
      <input
        type="range"
        min={0.5}
        max={5}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-400"
        disabled={readOnly}
      />
      <p className="text-xs text-slate-400 mt-1">{labelMap[fmtKey(value)] ?? '—'}</p>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {fmt(unitPrice)} <span className="text-slate-600">/{unitLabel}</span>
          <span className="text-slate-600"> × {games} {appliesTo}</span>
        </span>
        <span className="font-bold text-slate-200 tabular-nums">{fmt(total)}</span>
      </div>
    </div>
  );
};

export const TravelLogisticsCard: React.FC<Props> = ({ tycoon, domesticAwayGames, internationalAwayGames, currency, readOnly, onSave }) => {
  const defaults = TIER_DEFAULTS[tycoon.tier];
  const [hotel, setHotel] = useState<number>(tycoon.travelPreferences?.hotel ?? defaults.hotel);
  const [flight, setFlight] = useState<number>(tycoon.travelPreferences?.flight ?? defaults.flight);
  const [bus, setBus] = useState<number>(tycoon.travelPreferences?.bus ?? defaults.bus);

  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);

  const totalAwayGames = domesticAwayGames + internationalAwayGames;
  const hotelPrice = HOTEL_PRICE[fmtKey(hotel)] ?? 0;
  const flightPrice = FLIGHT_PRICE[fmtKey(flight)] ?? 0;
  const busPrice = BUS_PRICE[fmtKey(bus)] ?? 0;

  const hotelTotal = hotelPrice * totalAwayGames;
  const flightTotal = flightPrice * internationalAwayGames;
  const busTotal = busPrice * domesticAwayGames;
  const grandTotal = hotelTotal + flightTotal + busTotal;

  const euroleagueWarning = useMemo(() => hotel < 4, [hotel]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="font-bold mb-4 text-base flex items-center gap-2 text-slate-100">
        <Plane size={16} className="text-amber-400" /> Travel & Logistics
        <HelpIconPopover
          title="Travel Preferences"
          body={
            <>
              <p>Pick the standard your club travels at. Each axis runs from 0.5★ (rock-bottom) to 5★ (luxury) in 0.5 steps.</p>
              <p><strong>Hotel</strong> is paid for every away game (domestic + international). ★★★★ is the EuroLeague Bylaws floor for visiting teams.</p>
              <p><strong>Flight</strong> is paid for every EuroLeague / international away trip.</p>
              <p><strong>Bus</strong> is paid for every domestic away trip.</p>
              <p className="text-amber-300">Pricing preview — these costs are not yet wired into the ledger above. Recovery impact lands with the travel economy update.</p>
            </>
          }
        />
      </h2>
      <div className="space-y-3">
        <Row
          icon={<Hotel size={14} />}
          title="Hotel"
          unitLabel="night"
          appliesTo="away games"
          value={hotel}
          unitPrice={hotelPrice}
          games={totalAwayGames}
          labelMap={HOTEL_LABELS}
          onChange={setHotel}
          fmt={fmt}
          readOnly={readOnly}
        />
        <Row
          icon={<Plane size={14} />}
          title="Flight"
          unitLabel="trip"
          appliesTo="EuroLeague away"
          value={flight}
          unitPrice={flightPrice}
          games={internationalAwayGames}
          labelMap={FLIGHT_LABELS}
          onChange={setFlight}
          fmt={fmt}
        />
        <Row
          icon={<Bus size={14} />}
          title="Bus"
          unitLabel="trip"
          appliesTo="domestic away"
          value={bus}
          unitPrice={busPrice}
          games={domesticAwayGames}
          labelMap={BUS_LABELS}
          onChange={setBus}
          fmt={fmt}
        />
      </div>

      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-amber-200">Projected travel total</span>
        <span className="text-lg font-bold text-amber-300 tabular-nums">{fmt(grandTotal)}</span>
      </div>
      {!readOnly && onSave && (
        <button
          onClick={() => onSave({ hotel, flight, bus })}
          className="mt-3 w-full h-11 rounded-xl bg-amber-400 text-slate-950 font-black uppercase tracking-widest text-xs hover:bg-amber-300"
        >
          Confirm & Save
        </button>
      )}

      {euroleagueWarning && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          EuroLeague Bylaws require visiting-team hotels at ★★★★ minimum. Below that the league can fine the club.
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Saved preferences flow into the annual ledger. Recovery + fatigue impact ships in the travel economy update.
      </p>
    </div>
  );
};
