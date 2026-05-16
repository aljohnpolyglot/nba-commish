import React, { useState, useMemo } from 'react';
import { Bus, DollarSign, Hotel, MapPin, Plane, Star, TrendingUp, Zap } from 'lucide-react';
import type { TycoonState, TycoonTier } from '../../../../../types/tycoon';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';

type Axis = 'hotel' | 'flight' | 'bus';

const TIER_DEFAULTS: Record<TycoonTier, Record<Axis, number>> = {
  S: { hotel: 5.0, flight: 5.0, bus: 5.0 },
  A: { hotel: 4.5, flight: 4.5, bus: 4.0 },
  B: { hotel: 4.0, flight: 4.0, bus: 3.5 },
  C: { hotel: 3.5, flight: 3.0, bus: 3.0 },
  D: { hotel: 3.0, flight: 2.5, bus: 2.5 },
};

const HOTEL_LABELS: Record<string, string> = {
  '0.5': 'Roadside motel', '1.0': 'Hostel', '1.5': 'Budget inn',
  '2.0': 'Standard 2-star', '2.5': 'Comfort', '3.0': 'Mid-range 3-star',
  '3.5': 'Superior 3-star', '4.0': 'First-class 4-star', '4.5': 'Premium 4-star suites',
  '5.0': 'Luxury 5-star — single rooms, recovery suites',
};
const FLIGHT_LABELS: Record<string, string> = {
  '0.5': 'Economy · long layovers', '1.0': 'Economy commercial', '1.5': 'Premium economy',
  '2.0': 'Premium economy · priority', '2.5': 'Business class', '3.0': 'Business class · full team',
  '3.5': 'Group charter · shared', '4.0': 'Charter jet', '4.5': 'Charter jet · business config',
  '5.0': 'Private jet · custom layout',
};
const BUS_LABELS: Record<string, string> = {
  '0.5': 'Public coach', '1.0': 'Standard coach', '1.5': 'Standard · wifi',
  '2.0': 'Comfort coach', '2.5': 'Comfort · reclining', '3.0': 'Premium coach',
  '3.5': 'Luxury · panoramic', '4.0': 'Sleeper coach', '4.5': 'Custom team bus',
  '5.0': 'Custom luxury · galley + lounge',
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

const fk = (v: number) => v.toFixed(1);

interface TravelSectionProps {
  tycoon: TycoonState;
  currency: string;
  domesticAwayGames: number;
  internationalAwayGames: number;
  onSave: (prefs: { hotel: number; flight: number; bus: number }) => void;
  locked?: boolean;
}

export const TravelSection: React.FC<TravelSectionProps> = ({
  tycoon, currency, domesticAwayGames, internationalAwayGames, onSave, locked = false,
}) => {
  const defaults = TIER_DEFAULTS[tycoon.tier];
  const [hotel, setHotel] = useState(tycoon.travelPreferences?.hotel ?? defaults.hotel);
  const [flight, setFlight] = useState(tycoon.travelPreferences?.flight ?? defaults.flight);
  const [bus, setBus] = useState(tycoon.travelPreferences?.bus ?? defaults.bus);
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);

  const totalAwayGames = domesticAwayGames + internationalAwayGames;
  const flightGames = Math.max(domesticAwayGames, internationalAwayGames);
  const hotelPrice = HOTEL_PRICE[fk(hotel)] ?? 0;
  const flightPrice = FLIGHT_PRICE[fk(flight)] ?? 0;
  const busPrice = BUS_PRICE[fk(bus)] ?? 0;
  const hotelTotal = hotelPrice * totalAwayGames;
  const flightTotal = flightPrice * flightGames;
  const busTotal = busPrice * domesticAwayGames;
  const grandTotal = hotelTotal + flightTotal + busTotal;

  const avgStars = ((hotel + flight + bus) / 3);
  const comfortLabel = avgStars >= 4.5 ? 'World Class' : avgStars >= 3.5 ? 'Premium' : avgStars >= 2.5 ? 'Standard' : 'Budget';

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-4 gap-3">
        <KpiBox icon={<Plane size={22} />} label="Comfort Level" value={comfortLabel} sub={`${avgStars.toFixed(1)} avg`} accent="text-amber-300" />
        <KpiBox icon={<DollarSign size={22} />} label="Travel Budget" value={fmt(grandTotal)} sub="Projected annual" accent="text-emerald-300" />
        <KpiBox icon={<MapPin size={22} />} label="Away Games" value={String(totalAwayGames)} sub={internationalAwayGames > 0 ? `${domesticAwayGames} dom + ${internationalAwayGames} intl` : `${domesticAwayGames} domestic`} accent="text-sky-300" />
        <KpiBox icon={<Zap size={22} />} label="Recovery Impact" value={avgStars >= 4 ? 'Optimal' : avgStars >= 3 ? 'Good' : 'Low'} sub="Road fatigue" accent="text-violet-300" />
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-4">
          <SliderCard
            icon={<Hotel size={20} />}
            title="Hotel"
            value={hotel}
            onChange={setHotel}
            label={HOTEL_LABELS[fk(hotel)] ?? ''}
            unitPrice={hotelPrice}
            games={totalAwayGames}
            gamesLabel="away games"
            total={hotelTotal}
            fmt={fmt}
            accent="amber"
            locked={locked}
          />
          <SliderCard
            icon={<Plane size={20} />}
            title="Flight"
            value={flight}
            onChange={setFlight}
            label={FLIGHT_LABELS[fk(flight)] ?? ''}
            unitPrice={flightPrice}
            games={flightGames}
            gamesLabel={internationalAwayGames > 0 ? 'away trips' : 'away trips'}
            total={flightTotal}
            fmt={fmt}
            accent="sky"
            locked={locked}
          />
          <SliderCard
            icon={<Bus size={20} />}
            title="Bus"
            value={bus}
            onChange={setBus}
            label={BUS_LABELS[fk(bus)] ?? ''}
            unitPrice={busPrice}
            games={domesticAwayGames}
            gamesLabel="domestic away"
            total={busTotal}
            fmt={fmt}
            accent="violet"
            locked={locked}
          />

          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Projected Travel Total</div>
              <div className="text-3xl font-black text-white mt-1 tabular-nums">{fmt(grandTotal)}</div>
            </div>
            <button
              onClick={() => onSave({ hotel, flight, bus })}
              disabled={locked}
              className="h-12 px-8 rounded-xl bg-amber-400 text-slate-950 font-black uppercase tracking-widest text-xs hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {locked ? 'Locked' : 'Save'}
            </button>
          </div>
          {locked && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs font-bold text-amber-200">Travel standards are locked until next offseason.</div>}
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Cost Breakdown</div>
            <div className="divide-y divide-slate-800">
              {[
                ['Hotels', hotelTotal, 'amber'],
                ['Flights', flightTotal, 'sky'],
                ['Bus / Ground', busTotal, 'violet'],
              ].map(([label, val, color]) => (
                <div key={label as string} className="py-3 flex justify-between items-center">
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className={`text-sm font-black text-${color}-300 tabular-nums`}>{fmt(val as number)}</span>
                </div>
              ))}
              <div className="py-3 flex justify-between items-center">
                <span className="text-sm font-bold text-white">Total</span>
                <span className="text-sm font-black text-amber-300 tabular-nums">{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Travel Impact</div>
            <div className="space-y-3">
              {[
                ['Road Recovery', Math.min(99, Math.round(avgStars * 18))],
                ['Player Fatigue', Math.min(99, Math.round(avgStars * 16))],
                ['Team Morale', Math.min(99, Math.round(avgStars * 15))],
                ['Road Performance', Math.min(99, Math.round(avgStars * 14))],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-black text-amber-300">{value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Strategy Guide</div>
            <div className="space-y-3 text-xs text-slate-400 leading-5">
              <p><span className="text-amber-300 font-bold">Premium travel</span> reduces road fatigue and improves away performance, but costs significantly more.</p>
              <p><span className="text-sky-300 font-bold">Budget travel</span> saves money but players arrive fatigued, increasing injury risk on road trips.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

const KpiBox: React.FC<{ icon: React.ReactNode; label: string; value: string; sub: string; accent: string }> = ({ icon, label, value, sub, accent }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-center">
    <div className={`flex justify-center ${accent}`}>{icon}</div>
    <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
    <div className={`mt-1 text-xl font-black ${accent}`}>{value}</div>
    <div className="text-[10px] text-slate-500 mt-1">{sub}</div>
  </div>
);

const StarRow: React.FC<{ value: number }> = ({ value }) => {
  const full = Math.floor(value);
  const hasHalf = value - full >= 0.5;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="relative w-4 h-4">
          <Star size={16} className="absolute inset-0 text-slate-700" />
          {(i < full || (i === full && hasHalf)) && (
            <div className="absolute inset-0 overflow-hidden" style={{ width: i < full ? '100%' : '50%' }}>
              <Star size={16} className="text-amber-400 fill-amber-400" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const SliderCard: React.FC<{
  icon: React.ReactNode; title: string; value: number; onChange: (v: number) => void;
  label: string; unitPrice: number; games: number; gamesLabel: string;
  total: number; fmt: (v: number) => string; accent: string;
  locked?: boolean;
}> = ({ icon, title, value, onChange, label, unitPrice, games, gamesLabel, total, fmt, accent, locked = false }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-3">
        <span className={`text-${accent}-400`}>{icon}</span>
        <span className="text-sm font-black text-white uppercase tracking-wide">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        <StarRow value={value} />
        <span className="text-sm font-black text-amber-300 tabular-nums w-8 text-right">{value.toFixed(1)}</span>
      </div>
    </div>
    <input
      type="range" min={0.5} max={5} step={0.5} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      disabled={locked}
      className={`w-full accent-${accent}-400 ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
    />
    <p className="text-xs text-slate-400 mt-2">{label}</p>
    <div className="mt-3 flex items-center justify-between text-xs">
      <span className="text-slate-500">{fmt(unitPrice)} /trip <span className="text-slate-600">x {games} {gamesLabel}</span></span>
      <span className="font-black text-slate-200 tabular-nums">{fmt(total)}</span>
    </div>
  </div>
);
