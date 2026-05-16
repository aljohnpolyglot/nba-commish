import React, { useMemo, useState } from 'react';
import { Plane, Hotel, Bus, Star, Check, Minus, Plus, ShieldCheck } from 'lucide-react';
import type { TycoonState } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';

interface Props {
  tycoon: TycoonState;
  domesticAwayGames: number;
  internationalAwayGames: number;
  currency: string;
  readOnly?: boolean;
  onSave?: (prefs: { hotel: number; flight: number; bus: number }) => void;
}

type Axis = 'hotel' | 'flight' | 'bus';
type TravelTier = 'rock-bottom' | 'budget' | 'standard' | 'premium' | 'luxury';

const TIER_ORDER: TravelTier[] = ['rock-bottom', 'budget', 'standard', 'premium', 'luxury'];
const TIER_LABEL: Record<TravelTier, string> = {
  'rock-bottom': 'Rock Bottom',
  budget: 'Budget',
  standard: 'Standard',
  premium: 'Premium',
  luxury: 'Luxury',
};
const TIER_STARS: Record<TravelTier, number> = {
  'rock-bottom': 1,
  budget: 2,
  standard: 3,
  premium: 4,
  luxury: 5,
};
const TIER_PRESET: Record<TravelTier, number> = {
  'rock-bottom': 1.0,
  budget: 2.5,
  standard: 3.5,
  premium: 4.5,
  luxury: 5.0,
};

const HOTEL_NAME: Record<string, string> = {
  '0.5': 'Budget Motel', '1.0': 'Roadside Inn',
  '1.5': 'Two-Star Hostel', '2.0': 'Comfort Two-Star',
  '2.5': 'Three-Star Inn', '3.0': 'Mid-Range Three-Star',
  '3.5': 'Superior Three-Star', '4.0': 'Radisson Blu (4★)',
  '4.5': 'Premium Four-Star Suites', '5.0': 'Luxury Five-Star Resort',
};
const FLIGHT_NAME: Record<string, string> = {
  '0.5': 'Economy Commercial', '1.0': 'Economy Commercial',
  '1.5': 'Premium Economy', '2.0': 'Premium Economy +',
  '2.5': 'Business Class', '3.0': 'Business Class Full Team',
  '3.5': 'Shared Group Charter', '4.0': 'Airbus A321neo (Charter)',
  '4.5': 'Charter Jet · Business Config', '5.0': 'Private Jet · Boeing 737BBJ',
};
const BUS_NAME: Record<string, string> = {
  '0.5': 'Public Coach', '1.0': 'Standard Coach',
  '1.5': 'Standard Coach +Wifi', '2.0': 'Comfort Coach',
  '2.5': 'Reclining Comfort Coach', '3.0': 'Premium Coach',
  '3.5': 'Luxury Panoramic Coach', '4.0': 'Sleeper Coach',
  '4.5': 'Custom Team Bus', '5.0': 'Luxury Coach · Galley + Lounge',
};

const HOTEL_FEATURES: Record<string, string[]> = {
  '1.0': ['Shared rooms (2-3 players)', 'Continental breakfast', 'No room service', 'Street-side noise risk'],
  '2.0': ['Twin rooms', 'Basic breakfast buffet', 'Limited late check-in', 'Single Wi-Fi tier'],
  '3.0': ['Single rooms on request', 'Hot breakfast', '24/7 reception', 'Light meeting room'],
  '4.0': ['Single rooms · Same Floor Layout', 'Buffet + à la carte', 'On-site gym access', 'EuroLeague Bylaws compliant'],
  '5.0': ['Premium single suites', 'Recovery & cryo suites', 'On-Site Therapist', 'Private team dining room', 'Late check-out included', 'Concierge / press shielding'],
};
const FLIGHT_FEATURES: Record<string, string[]> = {
  '1.0': ['Economy seating', 'Layovers up to 4h', 'Carry-on only', 'No priority boarding'],
  '2.0': ['Premium economy seats', 'Priority boarding', 'Standard meal', 'Direct routes preferred'],
  '3.0': ['Business class', 'Lie-flat on long-haul', 'Lounge access', 'Team meal coordination'],
  '4.0': ['Charter jet · standard config', 'Direct departures', 'Team-only cabin', 'Recovery seat layout'],
  '5.0': ['Private jet · custom layout', 'Team lounge + galley', 'Onboard physio space', 'Departure on team time', 'Customs fast-track', 'Branded interior'],
};
const BUS_FEATURES: Record<string, string[]> = {
  '1.0': ['Standard coach', 'Forward seating only', 'Driver-only crew', 'No onboard wifi'],
  '2.0': ['Comfort coach', 'Reclining seats', 'Onboard wifi', 'Driver + assistant'],
  '3.0': ['Premium coach', 'Power outlets per seat', 'Galley fridge', 'Tinted windows'],
  '4.0': ['Sleeper coach', 'Reclining loungers', 'Mini-galley', 'Personal entertainment'],
  '5.0': ['Custom team bus', 'Galley + lounge zone', 'Massage seating', 'Branded exterior wrap', 'Concierge crew', 'Black-out windows'],
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

const fmtKey = (v: number) => v.toFixed(1);

const pickFeatures = (map: Record<string, string[]>, value: number): string[] => {
  const rounded = Math.round(value);
  return map[`${rounded}.0`] ?? map['3.0'];
};
const pickName = (map: Record<string, string>, value: number): string => map[fmtKey(value)] ?? '—';

const avgToTier = (h: number, f: number, b: number): TravelTier => {
  const avg = (h + f + b) / 3;
  if (avg < 1.75) return 'rock-bottom';
  if (avg < 2.75) return 'budget';
  if (avg < 3.75) return 'standard';
  if (avg < 4.75) return 'premium';
  return 'luxury';
};

const StarsBar: React.FC<{ value: number; size?: number }> = ({ value, size = 16 }) => {
  const full = Math.floor(value);
  const hasHalf = value - full >= 0.5;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        const isFull = i < full;
        const isHalf = i === full && hasHalf;
        return (
          <div key={i} className="relative" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-slate-700" />
            {(isFull || isHalf) && (
              <div className="absolute inset-0 overflow-hidden" style={{ width: isHalf ? '50%' : '100%' }}>
                <Star size={size} className="text-amber-400 fill-amber-400" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const TierPill: React.FC<{
  tier: TravelTier;
  active: boolean;
  onSelect: () => void;
  fmt: (v: number) => string;
  perGame: number;
}> = ({ tier, active, onSelect, fmt, perGame }) => {
  const stars = TIER_STARS[tier];
  return (
    <button
      onClick={onSelect}
      className={[
        'flex-1 rounded-xl border px-3 py-3 text-left transition-colors',
        active
          ? 'border-amber-400 bg-amber-400/10 ring-1 ring-amber-400/40'
          : 'border-slate-800 bg-slate-950/60 hover:border-slate-600',
      ].join(' ')}
    >
      <div className={`text-[10px] font-black uppercase tracking-[0.2em] ${active ? 'text-amber-200' : 'text-slate-500'}`}>
        {TIER_LABEL[tier]}
      </div>
      <div className="mt-1 flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={11} className={i < stars ? 'text-amber-400 fill-amber-400' : 'text-slate-700'} />
        ))}
      </div>
      <div className="mt-1 text-xs text-slate-400 tabular-nums">{fmt(perGame)}/game avg</div>
    </button>
  );
};

const TravelCard: React.FC<{
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  productName: string;
  features: string[];
  starValue: number;
  unitLabel: string;
  unitPrice: number;
  totalCost: number;
  games: number;
  appliesTo: string;
  badge?: { text: string; tone: 'good' | 'warn' };
  fmt: (v: number) => string;
  onStep: (delta: number) => void;
  readOnly?: boolean;
}> = ({ icon, iconBg, title, productName, features, starValue, unitLabel, unitPrice, totalCost, games, appliesTo, badge, fmt, onStep, readOnly }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden flex flex-col">
    {/* Hero strip */}
    <div className={`relative h-32 ${iconBg} flex items-center justify-center`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.18),transparent_60%)]" />
      <div className="relative text-slate-950/80">{icon}</div>
      <div className="absolute top-3 left-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-950/70 bg-white/30 backdrop-blur rounded-md px-2 py-0.5">
        {title}
      </div>
      <div className="absolute top-3 right-3 rounded-md bg-slate-950/70 backdrop-blur px-2 py-0.5 text-xs font-bold text-amber-300 tabular-nums">
        {starValue.toFixed(1)} ★
      </div>
    </div>

    {/* Body */}
    <div className="p-4 flex-1 flex flex-col gap-3">
      <div>
        <div className="text-sm font-black text-white">{productName}</div>
        <div className="mt-1 flex items-center gap-2">
          <StarsBar value={starValue} size={14} />
          {badge && (
            <span className={[
              'rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border',
              badge.tone === 'good' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' :
                'border-rose-400/40 bg-rose-400/10 text-rose-200',
            ].join(' ')}>
              <ShieldCheck size={11} className="inline -mt-0.5 mr-1" />{badge.text}
            </span>
          )}
        </div>
      </div>

      {/* Key features */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Key Features</div>
        <ul className="space-y-1.5">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <Check size={12} className="text-amber-300 mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto pt-3 border-t border-slate-800 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cost per {unitLabel}</div>
          <div className="text-sm font-bold text-slate-100 tabular-nums">{fmt(unitPrice)}</div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total season cost</div>
          <div className="text-sm font-bold text-emerald-300 tabular-nums">{fmt(totalCost)}</div>
        </div>
      </div>

      <div className="text-[10px] text-slate-500">× {games} {appliesTo}</div>

      {/* Stepper */}
      {!readOnly && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onStep(-0.5)}
            disabled={starValue <= 0.5}
            className="h-9 w-9 rounded-lg border border-slate-800 bg-slate-950/70 text-slate-300 hover:border-amber-400/60 hover:text-amber-200 disabled:opacity-40"
          >
            <Minus size={14} className="mx-auto" />
          </button>
          <div className="flex-1 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Adjust ★</div>
          <button
            onClick={() => onStep(+0.5)}
            disabled={starValue >= 5}
            className="h-9 w-9 rounded-lg border border-slate-800 bg-slate-950/70 text-slate-300 hover:border-amber-400/60 hover:text-amber-200 disabled:opacity-40"
          >
            <Plus size={14} className="mx-auto" />
          </button>
        </div>
      )}
    </div>
  </div>
);

export const TravelLogisticsPage: React.FC<Props> = ({ tycoon, domesticAwayGames, internationalAwayGames, currency, readOnly, onSave }) => {
  const initial = tycoon.travelPreferences ?? { hotel: 3.5, flight: 3.5, bus: 3.5 };
  const [hotel, setHotel] = useState<number>(initial.hotel);
  const [flight, setFlight] = useState<number>(initial.flight);
  const [bus, setBus] = useState<number>(initial.bus);

  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const clamp = (v: number) => Math.max(0.5, Math.min(5, Math.round(v * 2) / 2));

  const totalAway = domesticAwayGames + internationalAwayGames;
  const hotelPrice = HOTEL_PRICE[fmtKey(hotel)] ?? 0;
  const flightPrice = FLIGHT_PRICE[fmtKey(flight)] ?? 0;
  const busPrice = BUS_PRICE[fmtKey(bus)] ?? 0;
  const hotelTotal = hotelPrice * totalAway;
  const flightTotal = flightPrice * internationalAwayGames;
  const busTotal = busPrice * domesticAwayGames;
  const grandTotal = hotelTotal + flightTotal + busTotal;

  const activeTier = avgToTier(hotel, flight, bus);
  const dirty = hotel !== initial.hotel || flight !== initial.flight || bus !== initial.bus;
  const euroleagueWarning = hotel < 4;

  const pickTier = (tier: TravelTier) => {
    if (readOnly) return;
    const v = TIER_PRESET[tier];
    setHotel(v); setFlight(v); setBus(v);
  };

  // Per-tier per-game average for the strip preview
  const tierPerGame = useMemo(() => {
    const r: Record<TravelTier, number> = {} as any;
    for (const t of TIER_ORDER) {
      const v = TIER_PRESET[t];
      const h = HOTEL_PRICE[fmtKey(v)] ?? 0;
      const f = FLIGHT_PRICE[fmtKey(v)] ?? 0;
      const b = BUS_PRICE[fmtKey(v)] ?? 0;
      const total = h * totalAway + f * internationalAwayGames + b * domesticAwayGames;
      r[t] = totalAway > 0 ? total / totalAway : h + f + b;
    }
    return r;
  }, [totalAway, internationalAwayGames, domesticAwayGames]);

  return (
    <div className="space-y-5">
      {/* Header KPI strip */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <Plane size={20} className="text-amber-300" /> Travel &amp; Logistics
          </h2>
          <p className="text-xs text-slate-400 mt-1">Configure your team travel experience · {totalAway} away games this season</p>
        </div>
        <KpiChip label="Travel Budget" value={fmt(grandTotal)} tone="amber" big />
        <KpiChip label="Hotel" value={fmt(hotelTotal)} tone="slate" />
        <KpiChip label="Flights" value={fmt(flightTotal)} tone="slate" />
        <KpiChip label="Buses" value={fmt(busTotal)} tone="slate" />
      </div>

      {/* Tier strip */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Travel Quality Tier</div>
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">
            {TIER_LABEL[activeTier]} selected
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {TIER_ORDER.map((tier) => (
            <TierPill
              key={tier}
              tier={tier}
              active={tier === activeTier}
              onSelect={() => pickTier(tier)}
              fmt={fmt}
              perGame={tierPerGame[tier]}
            />
          ))}
        </div>
      </div>

      {/* 3 cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <TravelCard
          icon={<Hotel size={64} strokeWidth={1.5} />}
          iconBg="bg-gradient-to-br from-amber-300 to-amber-500"
          title="Hotels"
          productName={pickName(HOTEL_NAME, hotel)}
          features={pickFeatures(HOTEL_FEATURES, hotel)}
          starValue={hotel}
          unitLabel="night"
          unitPrice={hotelPrice}
          totalCost={hotelTotal}
          games={totalAway}
          appliesTo="away nights"
          badge={hotel >= 4 ? { text: 'EuroLeague OK', tone: 'good' } : { text: 'Below bylaws', tone: 'warn' }}
          fmt={fmt}
          onStep={(d) => setHotel(clamp(hotel + d))}
          readOnly={readOnly}
        />
        <TravelCard
          icon={<Plane size={64} strokeWidth={1.5} />}
          iconBg="bg-gradient-to-br from-sky-300 to-indigo-500"
          title="Planes"
          productName={pickName(FLIGHT_NAME, flight)}
          features={pickFeatures(FLIGHT_FEATURES, flight)}
          starValue={flight}
          unitLabel="trip"
          unitPrice={flightPrice}
          totalCost={flightTotal}
          games={internationalAwayGames}
          appliesTo="continental away"
          fmt={fmt}
          onStep={(d) => setFlight(clamp(flight + d))}
          readOnly={readOnly}
        />
        <TravelCard
          icon={<Bus size={64} strokeWidth={1.5} />}
          iconBg="bg-gradient-to-br from-emerald-300 to-emerald-600"
          title="Buses"
          productName={pickName(BUS_NAME, bus)}
          features={pickFeatures(BUS_FEATURES, bus)}
          starValue={bus}
          unitLabel="trip"
          unitPrice={busPrice}
          totalCost={busTotal}
          games={domesticAwayGames}
          appliesTo="domestic away"
          fmt={fmt}
          onStep={(d) => setBus(clamp(bus + d))}
          readOnly={readOnly}
        />
      </div>

      {euroleagueWarning && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          EuroLeague Bylaws require visiting-team hotels at ★★★★ minimum. Below that the league can fine the club.
        </div>
      )}

      {/* Confirm strip */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Travel Summary</div>
          <div className="mt-1 text-xs text-slate-400">
            <span className="text-slate-200 font-semibold">{TIER_LABEL[activeTier]}</span> overall · Hotel {hotel.toFixed(1)}★ · Flight {flight.toFixed(1)}★ · Bus {bus.toFixed(1)}★
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Total travel cost</div>
            <div className="text-2xl font-black text-amber-300 tabular-nums">{fmt(grandTotal)}</div>
          </div>
          {!readOnly && onSave && (
            <button
              onClick={() => onSave({ hotel, flight, bus })}
              disabled={!dirty}
              className={[
                'h-12 px-6 rounded-xl font-black uppercase tracking-widest text-xs',
                dirty
                  ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed',
              ].join(' ')}
            >
              {dirty ? 'Confirm & Save' : 'Saved'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const KpiChip: React.FC<{ label: string; value: string; tone: 'amber' | 'slate'; big?: boolean }> = ({ label, value, tone, big }) => {
  const cls = tone === 'amber'
    ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
    : 'border-slate-800 bg-slate-950/60 text-slate-200';
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">{label}</div>
      <div className={`tabular-nums font-black ${big ? 'text-lg' : 'text-sm'}`}>{value}</div>
    </div>
  );
};

export default TravelLogisticsPage;
