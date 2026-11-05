import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Shirt,
  ShoppingBag,
} from 'lucide-react';
import type { GameState, NBAPlayer, NBATeam } from '../../types';
import { getFranchiseEventEconomyScale } from '../../services/franchises/franchiseEventCatalog';
import { franchiseSeed } from '../../services/franchises/franchiseMath';
import { getSimulationSeed } from '../../services/saveIdentity';
import { getFranchiseJerseySalesSnapshot } from '../../services/franchises/franchiseJerseySales';
import { formatCurrencyWithCode, getLeagueCurrencyCode } from '../../utils/helpers';
import { parseGameDate } from '../../utils/dateUtils';
import { PlayerPortrait } from '../shared/PlayerPortrait';

type Props = {
  state: GameState;
  team: NBATeam;
  onPlayerSelect: (player: NBAPlayer) => void;
};

type BreakdownRow = {
  label: string;
  share: number;
  color: string;
};

const BREAKDOWN: BreakdownRow[] = [
  { label: 'Replica Jerseys', share: 0.62, color: '#6d4aff' },
  { label: 'Team Apparel', share: 0.18, color: '#fbbf24' },
  { label: 'Accessories', share: 0.13, color: '#14b8a6' },
  { label: 'Other', share: 0.07, color: '#3b82f6' },
];

const TrendValue: React.FC<{ value: number }> = ({ value }) => {
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      <Icon size={13} />
      {Math.abs(value).toFixed(1)}% <span className="font-medium text-slate-500">vs last month</span>
    </div>
  );
};

const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: React.ReactNode;
}> = ({ icon, label, value, detail }) => (
  <div className="flex min-w-0 items-center gap-4 rounded-lg border border-[#1e304b] bg-[#0a172a] px-4 py-4 shadow-xl sm:px-5">
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#171f55] text-[#7457ff]">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xl font-black tabular-nums text-white">{value}</p>
      {detail}
    </div>
  </div>
);

const Sparkline: React.FC<{ seed: number }> = ({ seed }) => {
  const rising = seed % 5 !== 0;
  const values = Array.from({ length: 7 }, (_, index) => {
    const jitter = ((seed >>> (index % 12)) % 9) - 4;
    return 15 + (rising ? index * 1.7 : -index * 1.15) + jitter;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values
    .map((value, index) => `${4 + index * 12},${24 - (value - min) / range * 19}`)
    .join(' ');
  const color = rising ? '#10d98b' : '#ef4444';
  return (
    <svg viewBox="0 0 80 28" className="h-7 w-20" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="76" cy={24 - (values[6] - min) / range * 19} r="2" fill={color} />
    </svg>
  );
};

const MerchandiseBreakdown: React.FC<{
  totalRevenue: number;
  fmt: (value: number) => string;
}> = ({ totalRevenue, fmt }) => (
  <section className="rounded-lg border border-[#1e304b] bg-[#0a172a] p-4 shadow-xl sm:p-5">
    <h3 className="text-[11px] font-black uppercase tracking-wide text-white">Merchandise Breakdown</h3>
    <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row xl:flex-col 2xl:flex-row">
      <div
        className="relative h-28 w-28 shrink-0 rounded-full"
        style={{
          background: 'conic-gradient(#6d4aff 0 62%, #fbbf24 62% 80%, #14b8a6 80% 93%, #3b82f6 93% 100%)',
        }}
      >
        <div className="absolute inset-[19px] rounded-full bg-[#0a172a]" />
      </div>
      <div className="w-full min-w-0 space-y-3">
        {BREAKDOWN.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="truncate text-slate-300">{row.label}</span>
            </div>
            <span className="shrink-0 font-black tabular-nums text-white">{fmt(totalRevenue * row.share)}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const ClubShopTrend: React.FC<{
  totalRevenue: number;
  currency: string;
  currentDate: string;
  seed: number;
}> = ({ totalRevenue, currency, currentDate, seed }) => {
  const date = parseGameDate(currentDate);
  const labels = Array.from({ length: 5 }, (_, index) => {
    const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 4 + index, 1));
    return month.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  });
  const values = [0.16, 0.34, 0.55, 0.76, 1].map((share, index) =>
    totalRevenue * Math.max(0, share + (((seed >>> index) % 5) - 2) / 100),
  );
  const maximum = Math.max(1, ...values) * 1.12;
  const width = 310;
  const height = 150;
  const left = 48;
  const right = 10;
  const top = 10;
  const bottom = 27;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = values.map((value, index) => ({
    x: left + plotWidth * index / Math.max(1, values.length - 1),
    y: top + plotHeight * (1 - value / maximum),
  }));
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);

  return (
    <section className="rounded-lg border border-[#1e304b] bg-[#0a172a] p-4 shadow-xl sm:p-5">
      <h3 className="text-[11px] font-black uppercase tracking-wide text-white">Club Shop Revenue Trend</h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-40 w-full" role="img" aria-label="Club shop revenue trend">
        {[0, 0.5, 1].map(step => {
          const y = top + plotHeight * step;
          const value = maximum * (1 - step);
          return (
            <g key={step}>
              <line x1={left} y1={y} x2={width - right} y2={y} stroke="#20324d" strokeWidth="1" />
              <text x={0} y={y + 4} fill="#7b8ba3" fontSize="10">{fmt(value)}</text>
            </g>
          );
        })}
        <polyline points={line} fill="none" stroke="#7654ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={labels[index]}>
            <circle cx={point.x} cy={point.y} r="3.5" fill="#7654ff" />
            <text x={point.x} y={height - 5} textAnchor="middle" fill="#7b8ba3" fontSize="10">{labels[index]}</text>
          </g>
        ))}
      </svg>
    </section>
  );
};

export const FranchiseJerseySalesPanel: React.FC<Props> = ({ state, team, onPlayerSelect }) => {
  const [showAll, setShowAll] = useState(false);
  const snapshot = useMemo(
    () => getFranchiseJerseySalesSnapshot(state, team),
    [state, team],
  );
  const currency = getLeagueCurrencyCode(state.leagueStats);
  const economyScale = getFranchiseEventEconomyScale(state, snapshot.season);
  const jerseyPrice = Math.max(20, Math.round(160 * economyScale));
  const replicaRevenue = snapshot.totalUnits * jerseyPrice;
  const totalMerchRevenue = replicaRevenue / BREAKDOWN[0].share;
  const leader = snapshot.rows[0];
  const seed = franchiseSeed(`${getSimulationSeed(state)}:${snapshot.season}:${team.id}:merch`);
  const merchGrowth = -2 + (seed % 1301) / 100;
  const shirtGrowth = -1 + ((seed >>> 5) % 1601) / 100;
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const visibleRows = showAll ? snapshot.rows : snapshot.rows.slice(0, 7);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<ShoppingBag size={27} />}
          label="Total Merch Revenue"
          value={fmt(totalMerchRevenue)}
          detail={<TrendValue value={merchGrowth} />}
        />
        <KpiCard
          icon={<Shirt size={27} />}
          label="Replica Shirts Sold"
          value={snapshot.totalUnits.toLocaleString()}
          detail={<TrendValue value={shirtGrowth} />}
        />
        <KpiCard
          icon={leader ? (
            <PlayerPortrait
              imgUrl={leader.player.imgURL}
              playerName={leader.player.name}
              face={(leader.player as NBAPlayer & { face?: unknown }).face}
              size={48}
            />
          ) : <Shirt size={27} />}
          label="Top-Selling Player"
          value={leader?.player.name ?? '—'}
          detail={<p className="mt-1 text-xs font-bold text-slate-400">#{leader?.jerseyNumber || '—'}</p>}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <section className="overflow-hidden rounded-lg border border-[#1e304b] bg-[#0a172a] shadow-xl">
          <div className="border-b border-[#1e304b] px-4 py-4 sm:px-5">
            <h3 className="text-[11px] font-black uppercase tracking-wide text-white">Player Jersey Sales</h3>
          </div>

          {visibleRows.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-bold text-slate-400">Sales rankings begin after the first regular-season game.</p>
              <p className="mt-1 text-xs text-slate-600">Every new season starts from zero.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[36px_minmax(190px,1fr)_115px_110px_80px_86px] items-center gap-3 border-b border-[#1e304b] px-4 py-3 text-[9px] font-black uppercase tracking-wide text-slate-500">
                    <span>#</span>
                    <span>Player</span>
                    <span className="text-right">Shirts Sold</span>
                    <span className="text-right">Revenue</span>
                    <span className="text-right">Share</span>
                    <span className="text-right">Trend</span>
                  </div>
                  {visibleRows.map((row, index) => (
                    <button
                      key={row.player.internalId}
                      type="button"
                      onClick={() => onPlayerSelect(row.player)}
                      className="grid w-full grid-cols-[36px_minmax(190px,1fr)_115px_110px_80px_86px] items-center gap-3 border-b border-[#1e304b] px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7654ff]"
                    >
                      <span className="text-center text-xs font-black text-slate-300">{index + 1}</span>
                      <div className="flex min-w-0 items-center gap-3">
                        <PlayerPortrait
                          imgUrl={row.player.imgURL}
                          playerName={row.player.name}
                          face={(row.player as NBAPlayer & { face?: unknown }).face}
                          size={34}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-white">{row.player.name}</p>
                          <p className="mt-0.5 text-[10px] font-bold text-slate-500">#{row.jerseyNumber || '—'}</p>
                        </div>
                      </div>
                      <span className="text-right text-xs font-bold tabular-nums text-slate-200">{row.units.toLocaleString()}</span>
                      <span className="text-right text-xs font-bold tabular-nums text-slate-200">{fmt(row.units * jerseyPrice)}</span>
                      <span className="text-right text-xs font-bold tabular-nums text-slate-200">{(row.share * 100).toFixed(1)}%</span>
                      <div className="flex justify-end"><Sparkline seed={franchiseSeed(`${seed}:${row.player.internalId}`)} /></div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-[#1e304b] md:hidden">
                {visibleRows.map((row, index) => (
                  <button
                    key={row.player.internalId}
                    type="button"
                    onClick={() => onPlayerSelect(row.player)}
                    className="block w-full p-4 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7654ff]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center text-xs font-black text-slate-500">{index + 1}</span>
                      <PlayerPortrait
                        imgUrl={row.player.imgURL}
                        playerName={row.player.name}
                        face={(row.player as NBAPlayer & { face?: unknown }).face}
                        size={38}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-white">{row.player.name}</p>
                        <p className="text-[10px] font-bold text-slate-500">#{row.jerseyNumber || '—'}</p>
                      </div>
                      <Sparkline seed={franchiseSeed(`${seed}:${row.player.internalId}`)} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 pl-8 text-right">
                      <div><p className="text-[8px] font-black uppercase tracking-wide text-slate-600">Sold</p><p className="mt-1 text-xs font-black tabular-nums text-white">{row.units.toLocaleString()}</p></div>
                      <div><p className="text-[8px] font-black uppercase tracking-wide text-slate-600">Revenue</p><p className="mt-1 text-xs font-black tabular-nums text-white">{fmt(row.units * jerseyPrice)}</p></div>
                      <div><p className="text-[8px] font-black uppercase tracking-wide text-slate-600">Share</p><p className="mt-1 text-xs font-black tabular-nums text-white">{(row.share * 100).toFixed(1)}%</p></div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {snapshot.rows.length > 7 && (
            <button
              type="button"
              onClick={() => setShowAll(current => !current)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-[#1e304b] px-4 py-3 text-[11px] font-bold text-[#7654ff] hover:bg-white/[0.02]"
            >
              {showAll ? 'Show top players' : 'View all players'} <ChevronRight size={13} className={showAll ? 'rotate-90' : ''} />
            </button>
          )}
        </section>

        <div className="space-y-3">
          <MerchandiseBreakdown totalRevenue={totalMerchRevenue} fmt={fmt} />
          <ClubShopTrend totalRevenue={totalMerchRevenue} currency={currency} currentDate={state.date} seed={seed} />
        </div>
      </div>

      <p className="px-1 text-[10px] font-medium text-slate-600">
        Season-to-date estimates only. Sales reset at the start of every new season.
      </p>
    </div>
  );
};
