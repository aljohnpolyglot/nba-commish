import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Coffee,
  Radio,
  ReceiptText,
  Shirt,
  ShoppingBag,
  Ticket,
  Users,
} from 'lucide-react';
import type { NBAPlayer } from '../../../../../types';
import type { CommercialMatchdayRecord, TycoonState } from '../../../../../types/tycoon';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { getCommercialSeasonSnapshot } from '../../../../../services/tycoon/commercialEngine';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';

type CommercialTab = 'overview' | 'club-shop' | 'matchday';

interface CommercialSectionProps {
  tycoon: TycoonState;
  currentYear: number;
  currency: string;
  players: NBAPlayer[];
}

const tabItems: Array<{ id: CommercialTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'club-shop', label: 'Club Shop' },
  { id: 'matchday', label: 'Matchday Sales' },
];

const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: 'emerald' | 'amber' | 'sky';
}> = ({ icon, label, value, detail, tone = 'emerald' }) => {
  const color = tone === 'amber' ? 'text-amber-300' : tone === 'sky' ? 'text-sky-300' : 'text-emerald-300';
  return (
    <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <div className={`mt-3 truncate text-2xl font-black tabular-nums ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
};

const RevenueBar: React.FC<{
  label: string;
  value: number;
  total: number;
  fmt: (value: number) => string;
  color: string;
}> = ({ label, value, total, fmt, color }) => {
  const share = total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-slate-300">{label}</span>
        <span className="font-black tabular-nums text-white">{fmt(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${share}%` }} />
      </div>
      <div className="mt-1 text-right text-[10px] font-bold text-slate-600">{share.toFixed(1)}%</div>
    </div>
  );
};

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 px-5 py-12 text-center text-sm text-slate-500">
    {text}
  </div>
);

const MatchdayCard: React.FC<{
  record: CommercialMatchdayRecord;
  fmt: (value: number) => string;
}> = ({ record, fmt }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-black text-white">vs {record.opponentName}</div>
        <div className="mt-1 text-xs text-slate-500">{record.date}</div>
      </div>
      <div className="text-right font-black tabular-nums text-emerald-300">{fmt(record.matchdayRevenueEUR)}</div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
      <div><span className="text-slate-500">Attendance</span><div className="mt-1 font-bold tabular-nums text-slate-200">{record.attendance.toLocaleString()}</div></div>
      <div><span className="text-slate-500">Gate</span><div className="mt-1 font-bold tabular-nums text-slate-200">{fmt(record.gateRevenueEUR)}</div></div>
      <div><span className="text-slate-500">Food</span><div className="mt-1 font-bold tabular-nums text-slate-200">{fmt(record.foodRevenueEUR)}</div></div>
      <div><span className="text-slate-500">Drinks</span><div className="mt-1 font-bold tabular-nums text-slate-200">{fmt(record.drinkRevenueEUR)}</div></div>
    </div>
  </div>
);

export const CommercialSection: React.FC<CommercialSectionProps> = ({
  tycoon,
  currentYear,
  currency,
  players,
}) => {
  const [tab, setTab] = useState<CommercialTab>('overview');
  const snapshot = useMemo(
    () => getCommercialSeasonSnapshot(tycoon, currentYear),
    [currentYear, tycoon],
  );
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const topSeller = snapshot.playerShirtSales[0];
  const totalShirts = snapshot.playerShirtSales.reduce((sum, row) => sum + row.units, 0);
  const playerById = useMemo(
    () => new Map(players.map(player => [String(player.internalId), player])),
    [players],
  );
  const foodAndDrink = snapshot.foodRevenueEUR + snapshot.drinkRevenueEUR;

  return (
    <section className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">
          <ShoppingBag size={13} /> Club Business
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Commercial</h1>
        <p className="mt-1 text-sm text-slate-400">Review club-shop and home-game revenue for the current season.</p>
      </header>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70 p-1">
        {tabItems.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-w-max flex-1 rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wider transition ${
              tab === item.id ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard icon={<BarChart3 size={16} />} label="Total Commercial" value={fmt(snapshot.totalCommercialRevenueEUR)} detail={`${snapshot.records.length} home games`} />
            <KpiCard icon={<Ticket size={16} />} label="Matchday" value={fmt(snapshot.matchdayRevenueEUR)} detail="Gate, food and drinks" tone="amber" />
            <KpiCard icon={<Shirt size={16} />} label="Club Shop" value={fmt(snapshot.merchandiseRevenueEUR)} detail="After distribution costs" tone="sky" />
            <KpiCard icon={<Radio size={16} />} label="Club Media" value={fmt(snapshot.clubMediaRevenueEUR)} detail="Media and digital content" />
          </div>

          {snapshot.records.length === 0 ? (
            <EmptyState text="Commercial results will appear after the first played home game." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-white">Revenue Split</h2>
                <div className="mt-5 space-y-5">
                  <RevenueBar label="Gate Revenue" value={snapshot.gateRevenueEUR} total={snapshot.totalCommercialRevenueEUR} fmt={fmt} color="bg-amber-400" />
                  <RevenueBar label="Food & Drinks" value={foodAndDrink} total={snapshot.totalCommercialRevenueEUR} fmt={fmt} color="bg-orange-400" />
                  <RevenueBar label="Club Shop" value={snapshot.merchandiseRevenueEUR} total={snapshot.totalCommercialRevenueEUR} fmt={fmt} color="bg-sky-400" />
                  <RevenueBar label="Club Media" value={snapshot.clubMediaRevenueEUR} total={snapshot.totalCommercialRevenueEUR} fmt={fmt} color="bg-emerald-400" />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-white">Current Season</h2>
                <div className="mt-5 divide-y divide-slate-800">
                  <div className="flex justify-between gap-3 py-3 text-sm"><span className="text-slate-500">Home attendance</span><span className="font-black tabular-nums">{snapshot.attendance.toLocaleString()}</span></div>
                  <div className="flex justify-between gap-3 py-3 text-sm"><span className="text-slate-500">Average attendance</span><span className="font-black tabular-nums">{snapshot.averageAttendance.toLocaleString()}</span></div>
                  <div className="flex justify-between gap-3 py-3 text-sm"><span className="text-slate-500">Replica shirts sold</span><span className="font-black tabular-nums">{totalShirts.toLocaleString()}</span></div>
                  <div className="flex justify-between gap-3 py-3 text-sm"><span className="text-slate-500">Top seller</span><span className="truncate font-black">{topSeller?.playerName ?? '—'}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'club-shop' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard icon={<ShoppingBag size={16} />} label="Gross Sales" value={fmt(snapshot.merchandiseGrossRevenueEUR)} detail="Before distribution" />
            <KpiCard icon={<Shirt size={16} />} label="Replica Shirts" value={totalShirts.toLocaleString()} detail="Current season" tone="amber" />
            <KpiCard icon={<Users size={16} />} label="Top Seller" value={topSeller?.playerName ?? '—'} detail={topSeller ? `${topSeller.units.toLocaleString()} shirts` : 'No sales yet'} tone="sky" />
            <KpiCard icon={<ReceiptText size={16} />} label="Distribution" value={fmt(snapshot.merchandiseDistributionCostEUR)} detail="Commercial expense" />
          </div>

          {snapshot.playerShirtSales.length === 0 ? (
            <EmptyState text="Club-shop results will appear after the first played home game." />
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
              <h2 className="text-sm font-black uppercase tracking-widest text-white">Player Jersey Sales</h2>
              <div className="mt-4 space-y-2">
                {snapshot.playerShirtSales.map((row, index) => {
                  const player = playerById.get(row.playerId);
                  return (
                    <div key={row.playerId} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                      <div className="w-5 text-center text-xs font-black text-slate-600">{index + 1}</div>
                      <PlayerPortrait imgUrl={player?.imgURL} playerName={row.playerName} face={(player as NBAPlayer & { face?: unknown } | undefined)?.face} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-white">{row.playerName}</div>
                        <div className="text-xs text-slate-500">{row.units.toLocaleString()} shirts</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black tabular-nums text-emerald-300">{fmt(row.revenueEUR)}</div>
                        <div className="text-[10px] font-bold text-slate-600">{(row.share * 100).toFixed(1)}% of gross sales</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'matchday' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard icon={<Ticket size={16} />} label="Matchday Revenue" value={fmt(snapshot.matchdayRevenueEUR)} detail="Gate, food and drinks" />
            <KpiCard icon={<Users size={16} />} label="Tickets Sold" value={snapshot.attendance.toLocaleString()} detail={`${snapshot.records.length} home games`} tone="amber" />
            <KpiCard icon={<BarChart3 size={16} />} label="Average Attendance" value={snapshot.averageAttendance.toLocaleString()} detail="Per home game" tone="sky" />
            <KpiCard icon={<Coffee size={16} />} label="Food & Drinks" value={fmt(foodAndDrink)} detail="Arena sales" />
          </div>

          {snapshot.records.length === 0 ? (
            <EmptyState text="Matchday sales will appear after the first played home game." />
          ) : (
            <>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-sm font-black uppercase tracking-widest text-white">Matchday Split</h2>
                  <span className="text-xs text-slate-500">Gate includes regular, courtside, VIP, suite and corporate tickets.</span>
                </div>
                <div className="mt-5 grid gap-5 md:grid-cols-3">
                  <RevenueBar label="Gate Revenue" value={snapshot.gateRevenueEUR} total={snapshot.matchdayRevenueEUR} fmt={fmt} color="bg-amber-400" />
                  <RevenueBar label="Food Revenue" value={snapshot.foodRevenueEUR} total={snapshot.matchdayRevenueEUR} fmt={fmt} color="bg-orange-400" />
                  <RevenueBar label="Drink Revenue" value={snapshot.drinkRevenueEUR} total={snapshot.matchdayRevenueEUR} fmt={fmt} color="bg-sky-400" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-white">Home Games</h2>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {snapshot.records.map(record => <MatchdayCard key={record.gameId} record={record} fmt={fmt} />)}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
