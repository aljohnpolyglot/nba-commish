import React, { useState } from 'react';
import {
  ArrowLeftRight, Inbox, Search, FileWarning, Clock, TrendingUp, TrendingDown,
  Eye, X, Check, ListChecks, Plus, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  type InboxBid, type MyListing, type BrowseListing, type ReleaseClause,
  type MockPlayer, type MockClub, type BidStatus, type ClauseStatus,
} from './mockData';
import { TransferMarketProvider, useTransferMarketContext } from './state';
import { useGame } from '../../store/GameContext';
import { estimatePlayerValueEUR } from '../../services/transfer/transferMarket';
import { convertTo2KRating } from '../../utils/helpers';
import { PlayerSelectorGrid, type PlayerSelectorItem } from '../shared/PlayerSelectorGrid';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { useHoldable } from '../../hooks/useHoldable';

type TabKey = 'listings' | 'inbox' | 'browse' | 'clauses';

// ── Format helpers ──────────────────────────────────────────────────────────

const fmtEUR = (n: number): string => {
  if (n === 0) return '€0';
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `€${Math.round(n / 1_000)}K`;
  return `€${n}`;
};

// Color tiers match PlayerRatingsModal's getRatingColor — 2K scale.
const ratingColor = (v: number): string => {
  if (v >= 90) return 'text-blue-300 border-blue-500/40 bg-blue-500/10';
  if (v >= 80) return 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  if (v >= 70) return 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  if (v >= 50) return 'text-orange-300 border-orange-500/40 bg-orange-500/10';
  return 'text-rose-300 border-rose-500/40 bg-rose-500/10';
};

const statusColor = (s: BidStatus): string => {
  switch (s) {
    case 'Highest Bid': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'Active':      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'Outbid':      return 'bg-slate-700/40 text-slate-400 border-slate-600/40';
    case 'Accepted':    return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    case 'Rejected':    return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    case 'Withdrawn':   return 'bg-slate-700/40 text-slate-500 border-slate-600/40';
  }
};

const clauseStatusColor = (s: ClauseStatus): string => {
  switch (s) {
    case 'Active':       return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'Trigger Risk': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'Fired':        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    case 'Expired':      return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
    case 'No Clause':    return 'bg-slate-700/40 text-slate-500 border-slate-600/40';
  }
};

// ── Reusable bits ───────────────────────────────────────────────────────────

const PlayerCell: React.FC<{ p: MockPlayer; small?: boolean }> = ({ p, small }) => (
  <div className="flex items-center gap-3">
    <PlayerPortrait
      imgUrl={p.imgURL}
      face={p.face}
      playerName={p.name}
      size={small ? 32 : 44}
    />
    <div className="min-w-0">
      <div className={`${small ? 'text-[11px]' : 'text-xs'} font-bold text-white truncate`}>{p.name}</div>
      <div className="text-[9px] text-slate-500 truncate">
        {p.flag} {p.position} · {p.age}y · {p.contractYearsLeft}y left
      </div>
    </div>
  </div>
);

const RatingBadge: React.FC<{ label: 'OVR' | 'POT'; value: number; small?: boolean }> = ({ label, value, small }) => (
  <div className={`inline-flex items-center gap-1 px-2 ${small ? 'py-0.5 text-[10px]' : 'py-1 text-[11px]'} rounded-md border font-black tabular-nums ${ratingColor(value)}`}>
    <span className="text-[8px] font-bold opacity-60 tracking-widest">{label}</span>
    {value}
  </div>
);

const OvrPotPair: React.FC<{ ovr: number; pot: number; small?: boolean }> = ({ ovr, pot, small }) => (
  <div className="inline-flex items-center gap-1">
    <RatingBadge label="OVR" value={ovr} small={small} />
    <RatingBadge label="POT" value={pot} small={small} />
  </div>
);

const ClubChip: React.FC<{ c: MockClub; small?: boolean }> = ({ c, small }) => (
  <div className="inline-flex items-center gap-1.5">
    <div className={`${small ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]'} rounded-full flex items-center justify-center font-black text-white shrink-0`} style={{ background: c.colorHex, border: '1px solid rgba(255,255,255,0.2)' }}>
      {c.shortName}
    </div>
    <div className="min-w-0">
      <div className={`${small ? 'text-[10px]' : 'text-[11px]'} font-bold text-white truncate`}>{c.name}</div>
      <div className="text-[9px] text-slate-500 truncate">{c.flag} {c.league}</div>
    </div>
  </div>
);

const StatusPill: React.FC<{ children: React.ReactNode; tone: string }> = ({ children, tone }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${tone}`}>
    {children}
  </span>
);

// ── Header strip ────────────────────────────────────────────────────────────

const HeaderStrip: React.FC = () => {
  const { club, budget, window: w } = useTransferMarketContext();
  return (
    <div className="bg-slate-900/60 border-b border-slate-800/60 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black text-white border-2 border-white/20" style={{ background: club.colorHex }}>
          {club.shortName}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{club.name} · Front Office</div>
          <h1 className="text-lg font-black text-white flex items-center gap-2">
            <ArrowLeftRight size={18} className="text-amber-400" />
            Transfer Market
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Auction hub for player transfers</span>
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">Cash</span>
          <span className="font-black text-emerald-300">{fmtEUR(budget.cashEUR)}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">Payroll Space</span>
          <span className="font-black text-blue-300">{fmtEUR(budget.payrollSpaceEUR)}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">Window</span>
          <span className={`font-black ${w.open ? 'text-amber-300' : 'text-slate-500'}`}>
            {w.windowLabel}{w.open ? ` · ${w.daysLeft}d left` : ` · ${w.spanLabel}`}
          </span>
        </div>
      </div>
    </div>
  );
};

// ── Tabs ────────────────────────────────────────────────────────────────────

const TabsRow: React.FC<{ active: TabKey; onChange: (k: TabKey) => void; counts: Record<TabKey, number> }> = ({ active, onChange, counts }) => {
  const tabs: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: 'listings', label: 'My Listings',     icon: ListChecks },
    { key: 'inbox',    label: 'Inbox',           icon: Inbox },
    { key: 'browse',   label: 'Browse Market',   icon: Search },
    { key: 'clauses',  label: 'Release Clauses', icon: FileWarning },
  ];
  return (
    <div className="px-6 pt-4 border-b border-slate-800/60 flex items-center gap-1 bg-slate-900/40">
      {tabs.map(t => {
        const isActive = active === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 border-b-2 ${
              isActive ? 'text-amber-300 border-amber-400' : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <Icon size={14} />
            {t.label}
            <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] ${isActive ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>
              {counts[t.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Tab 1: My Listings
// ───────────────────────────────────────────────────────────────────────────

const MyListingsTab: React.FC = () => {
  const { listings, window: w, budget, cashChannels, marketActivity, actions } = useTransferMarketContext();
  const [selected, setSelected] = useState<string | null>(listings[0]?.id ?? null);
  const [showListModal, setShowListModal] = useState(false);

  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      {/* Left: Listing cards */}
      <div className="col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
            <ListChecks size={16} className="text-amber-400" />
            My Listings
            <span className="text-[10px] font-bold text-slate-500">({listings.length} active)</span>
          </h2>
          <button
            onClick={() => setShowListModal(true)}
            disabled={!w.open}
            title={w.open ? 'List a player for transfer' : 'Transfer window closed'}
            className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={12} /> List Player
          </button>
        </div>

        {listings.length === 0 && (
          <div className="rounded-2xl border border-slate-800/50 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
            {w.open
              ? 'No active listings. Click "List Player" to put a player on the market.'
              : 'Transfer window closed — listings re-open during the next window.'}
          </div>
        )}

        {listings.map(l => {
          const pct = (l.daysLeft / l.totalDays) * 100;
          const isSelected = selected === l.id;
          return (
            <button
              key={l.id}
              onClick={() => setSelected(l.id)}
              className={`w-full text-left bg-slate-800/40 rounded-2xl p-4 border transition-all ${
                isSelected ? 'border-amber-500/60 bg-slate-800/60' : 'border-slate-800/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <PlayerCell p={l.player} />
                </div>
                <OvrPotPair ovr={l.player.ovr} pot={l.player.pot} />
              </div>

              <div className="grid grid-cols-4 gap-3 mt-3">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">Asking</div>
                  <div className="text-sm font-black text-white">{fmtEUR(l.askingEUR)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">Highest Bid</div>
                  <div className={`text-sm font-black ${l.highestBidEUR >= l.askingEUR ? 'text-emerald-300' : 'text-amber-300'}`}>{fmtEUR(l.highestBidEUR)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">Bids</div>
                  <div className="text-sm font-black text-white">{l.bidsCount}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><Clock size={9} /> Time Left</div>
                  <div className="text-sm font-black text-amber-300">{l.daysLeft}d</div>
                </div>
              </div>

              <div className="mt-3 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${pct}%` }} />
              </div>

              <div className="flex items-center justify-between mt-3 gap-2">
                <div className="text-[10px] text-slate-400">
                  Top bidder: {l.topBidder ? <ClubChip c={l.topBidder} small /> : <span>—</span>}
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
                    View Bids
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); actions.cancelListing(l.id); }}
                    className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {showListModal && <ListPlayerModal onClose={() => setShowListModal(false)} />}

      {/* Right rail */}
      <div className="space-y-4">
        {/* Transfer Window */}
        <div className="bg-slate-800/40 rounded-2xl p-4 border border-amber-500/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Transfer Window</span>
            <span className="text-[10px] font-black text-amber-300">{w.open ? `${w.daysLeft}d left` : 'closed'}</span>
          </div>
          <div className="text-[11px] text-white font-bold">{w.windowLabel} Window</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{w.spanLabel}</div>
          <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden mt-2">
            <div className="h-full bg-amber-400" style={{ width: w.open ? `${((w.totalDays - w.daysLeft) / Math.max(1, w.totalDays)) * 100}%` : '0%' }} />
          </div>
        </div>

        {/* Budget Overview */}
        <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-800/60">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Budget Overview</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Total Cash</span>
              <span className="text-[11px] font-black text-emerald-300">{fmtEUR(budget.cashEUR)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Available Cash</span>
              <span className="text-[11px] font-black text-emerald-300">{fmtEUR(budget.availableCashEUR)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Payroll Space</span>
              <span className="text-[11px] font-black text-blue-300">{fmtEUR(budget.payrollSpaceEUR)}</span>
            </div>
          </div>
        </div>

        {/* Cash Channels */}
        <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-800/60">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Cash-Flow Channels</div>
          <div className="space-y-3">
            {cashChannels.map(ch => (
              <div key={ch.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-white truncate">{ch.label}</div>
                  <div className="text-[9px] text-slate-500 truncate">{ch.subtitle}</div>
                </div>
                <div className="text-right">
                  {ch.inEUR > 0 && <div className="text-[10px] font-black text-emerald-300 flex items-center gap-1 justify-end"><TrendingUp size={9} />{fmtEUR(ch.inEUR)}</div>}
                  {ch.outEUR > 0 && <div className="text-[10px] font-black text-rose-300 flex items-center gap-1 justify-end"><TrendingDown size={9} />{fmtEUR(ch.outEUR)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Market Activity */}
        <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-800/60">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Market Activity</div>
          <div className="space-y-2">
            {marketActivity.length === 0 && <div className="text-[10px] text-slate-500">No transfers yet this season.</div>}
            {marketActivity.map((a, i) => (
              <div key={i} className="text-[10px] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-slate-300 truncate">
                    <span className="font-bold text-white">{a.player}</span>{' '}
                    <span className="text-slate-500">to</span> <span className="font-bold">{a.to}</span>
                  </div>
                  <div className="text-[9px] text-slate-500">from {a.from} · {a.date}</div>
                </div>
                <span className="text-[10px] font-black text-amber-300 shrink-0">{a.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// List Player Modal
// ───────────────────────────────────────────────────────────────────────────

const ListPlayerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state } = useGame() as any;
  const { userTid, listings, actions } = useTransferMarketContext();
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();

  const alreadyListed = new Set(listings.map(l => l.player.id));
  const eligible = (state.players ?? [])
    .filter((p: any) => p.tid === userTid && !alreadyListed.has(p.internalId));

  const [selPid, setSelPid] = useState<string | null>(eligible[0]?.internalId ?? null);
  const selPlayer = eligible.find((p: any) => p.internalId === selPid);
  const suggested = selPlayer ? estimatePlayerValueEUR(selPlayer, currentYear) : 1_000_000;
  const [asking, setAsking] = useState<number>(suggested);
  const [days, setDays] = useState<number>(7);

  React.useEffect(() => { setAsking(suggested); }, [selPid]);

  const selectorItems: PlayerSelectorItem[] = React.useMemo(
    () => eligible.map((p: any) => ({
      player: p,
      score: Math.round(convertTo2KRating(p.overallRating ?? 60)),
    })),
    [eligible],
  );
  const selectedSet = React.useMemo(
    () => new Set<string>(selPid ? [selPid] : []),
    [selPid],
  );

  // Slider bounds: 50K min (listing minimum), 4× engine suggestion as ceiling, snap to 50K.
  const ASK_STEP = 50_000;
  const askMin = 50_000;
  const askMax = Math.max(ASK_STEP * 4, suggested * 4);
  const askPct = Math.min(100, Math.max(0, ((asking - askMin) / Math.max(1, askMax - askMin)) * 100));
  const sugPct = Math.min(100, Math.max(0, ((suggested - askMin) / Math.max(1, askMax - askMin)) * 100));

  const decAskProps = useHoldable(() => setAsking(v => Math.max(askMin, v - ASK_STEP)), asking <= askMin);
  const incAskProps = useHoldable(() => setAsking(v => Math.min(askMax, v + ASK_STEP)), asking >= askMax);

  if (eligible.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-black text-white mb-2">No eligible players</h3>
          <p className="text-sm text-slate-400">All of your players are already listed.</p>
          <button onClick={onClose} className="mt-4 w-full py-2 rounded-xl bg-slate-800 text-slate-200 font-bold uppercase text-xs">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white">List Player For Transfer</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {/* Player picker */}
        <div className="mb-4">
          <PlayerSelectorGrid
            items={selectorItems}
            teams={state.teams ?? []}
            selectedIds={selectedSet}
            onToggle={(pid) => setSelPid(prev => (prev === pid ? null : pid))}
            maxSelections={1}
            accentColor="amber"
            defaultVisible={30}
            searchPlaceholder="Search your roster..."
          />
        </div>

        {/* Asking price — SigningModal-style stepper + slider */}
        <div className="space-y-3">
          <div>
            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex justify-between items-center mb-2">
              Asking Price
              <div className="flex gap-3 text-[10px]">
                <span className="text-amber-300">SUGG {fmtEUR(suggested)}</span>
                <span className="text-white/50">MAX {fmtEUR(askMax)}</span>
              </div>
            </label>
            <div className="flex items-center justify-between h-16 bg-white/[0.04] border border-white/10 rounded-sm px-4 hover:border-amber-500/40 transition-all">
              <button
                {...decAskProps}
                disabled={asking <= askMin}
                className="text-white/30 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed touch-none select-none"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-center">
                <span className="text-2xl font-black italic text-white tabular-nums">{fmtEUR(asking)}</span>
                <p className="text-[8px] font-bold uppercase text-white/30 tracking-widest mt-0.5">Listing Amount</p>
              </div>
              <button
                {...incAskProps}
                disabled={asking >= askMax}
                className="text-white/30 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed touch-none select-none"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="mt-3 relative">
              <input
                type="range"
                min={askMin}
                max={askMax}
                step={ASK_STEP}
                value={asking}
                onChange={(e) => setAsking(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500"
              />
              {/* Suggestion marker on track */}
              <div
                className="pointer-events-none absolute top-1 h-3 w-px bg-amber-400/80"
                style={{ left: `${sugPct}%` }}
                title={`Engine suggestion: ${fmtEUR(suggested)}`}
              />
            </div>
            <div className="flex justify-between text-[9px] font-bold uppercase text-white/30 tracking-widest mt-1">
              <span>Min {fmtEUR(askMin)}</span>
              <button onClick={() => setAsking(suggested)} className="text-amber-300 hover:text-amber-200 normal-case tracking-normal font-bold">
                use suggestion ({fmtEUR(suggested)})
              </button>
              <span>{Math.round(askPct)}%</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Auction Duration</label>
            <div className="mt-1 flex items-center gap-2">
              {[3, 5, 7, 10, 14].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`flex-1 h-9 rounded-lg text-xs font-bold ${
                    days === d ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold uppercase text-xs"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!selPid) return;
                actions.listPlayer(selPid, asking, days);
                onClose();
              }}
              disabled={!selPid}
              className="flex-1 h-11 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black uppercase text-xs disabled:opacity-40"
            >
              List For Transfer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Tab 2: Inbox
// ───────────────────────────────────────────────────────────────────────────

const InboxTab: React.FC = () => {
  const { inboxBids, actions } = useTransferMarketContext();
  const [filter, setFilter] = useState<'all' | 'active' | 'accepted' | 'rejected'>('all');
  const [selected, setSelected] = useState<InboxBid | null>(inboxBids[0] ?? null);

  React.useEffect(() => {
    if (!selected && inboxBids[0]) setSelected(inboxBids[0]);
    if (selected && !inboxBids.find(b => b.id === selected.id)) setSelected(inboxBids[0] ?? null);
  }, [inboxBids, selected]);

  const counts = {
    all: inboxBids.length,
    active: inboxBids.filter(b => b.status === 'Active' || b.status === 'Highest Bid').length,
    accepted: inboxBids.filter(b => b.status === 'Accepted').length,
    rejected: inboxBids.filter(b => b.status === 'Rejected' || b.status === 'Withdrawn').length,
  };

  const filtered = inboxBids.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'active') return b.status === 'Active' || b.status === 'Highest Bid';
    if (filter === 'accepted') return b.status === 'Accepted';
    if (filter === 'rejected') return b.status === 'Rejected' || b.status === 'Withdrawn';
    return true;
  });

  const filterTabs: Array<{ key: typeof filter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'accepted', label: 'Accepted', count: counts.accepted },
    { key: 'rejected', label: 'Rejected', count: counts.rejected },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      <div className="col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Inbox size={16} className="text-amber-400" /> Inbox
            </h2>
            <span className="text-[10px] text-slate-500">Offers received for your players (listed and unsolicited)</span>
          </div>
          <button className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
            Mark All as Read
          </button>
        </div>

        <div className="flex items-center gap-2">
          {filterTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                filter === t.key ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              {t.label} <span className="ml-1 opacity-60">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="bg-slate-800/40 rounded-2xl border border-slate-800/50 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-900/60 text-[9px] uppercase tracking-wider text-slate-500 font-bold">
            <div className="col-span-3">Player</div>
            <div className="col-span-1 text-center">OVR</div>
            <div className="col-span-1 text-center">POT</div>
            <div className="col-span-2">Bidder</div>
            <div className="col-span-1">Type</div>
            <div className="col-span-2">Amount</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500 border-t border-slate-800/40">
              No bids match this filter.
            </div>
          )}
          {filtered.map(b => (
            <button
              key={b.id}
              onClick={() => setSelected(b)}
              className={`w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-left border-t border-slate-800/40 transition-colors ${
                selected?.id === b.id ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : 'hover:bg-slate-800/30'
              }`}
            >
              <div className="col-span-3 flex items-center gap-2">
                <PlayerCell p={b.player} small />
              </div>
              <div className="col-span-1 flex justify-center"><RatingBadge label="OVR" value={b.player.ovr} small /></div>
              <div className="col-span-1 flex justify-center"><RatingBadge label="POT" value={b.player.pot} small /></div>
              <div className="col-span-2">
                <ClubChip c={b.bidder} small />
              </div>
              <div className="col-span-1">
                <span className="text-[10px] font-bold text-slate-300">{b.bidType}</span>
                <div className="text-[9px] text-slate-500">{b.expiresInDays}d</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs font-black text-white">{fmtEUR(b.amountEUR)}</div>
                {b.pctVsAsking !== 0 && (
                  <div className={`text-[9px] font-bold ${b.pctVsAsking > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {b.pctVsAsking > 0 ? '+' : ''}{b.pctVsAsking}% vs ask
                  </div>
                )}
              </div>
              <div className="col-span-2 text-right">
                <StatusPill tone={statusColor(b.status)}>{b.status}</StatusPill>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right rail: offer detail */}
      <div className="space-y-4">
        {!selected ? (
          <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-800/60 text-sm text-slate-500 text-center">
            Select a bid to view offer details.
          </div>
        ) : (
        <div className="bg-slate-800/40 rounded-2xl p-5 border border-slate-800/60 space-y-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Offer Details</div>

          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 border-2 border-slate-700 flex items-center justify-center font-black text-white">
              {selected.player.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-white truncate">{selected.player.name}</div>
              <div className="text-[10px] text-slate-500">{selected.player.flag} {selected.player.position} · {selected.player.age}y</div>
              <div className="mt-1"><OvrPotPair ovr={selected.player.ovr} pot={selected.player.pot} small /></div>
            </div>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Bidder</div>
            <ClubChip c={selected.bidder} />
          </div>

          <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 rounded-xl p-4 border border-amber-500/30">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Bid Amount</div>
            <div className="text-3xl font-black text-amber-300 mt-1">{fmtEUR(selected.amountEUR)}</div>
            {selected.pctVsAsking !== 0 && (
              <div className={`text-[11px] font-bold mt-1 ${selected.pctVsAsking > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {selected.pctVsAsking > 0 ? '+' : ''}{selected.pctVsAsking}% vs asking price
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Offer Information</div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Transaction type</span>
              <span className="font-bold text-white">{selected.bidType}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Received</span>
              <span className="font-bold text-white">{selected.receivedDate}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Expires in</span>
              <span className="font-bold text-amber-300">{selected.expiresInDays}d</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Status</span>
              <StatusPill tone={statusColor(selected.status)}>{selected.status}</StatusPill>
            </div>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">About the Interest</div>
            <p className="text-[10px] text-slate-300 leading-relaxed">
              {selected.bidder.name} is actively reshaping their {selected.player.position} rotation. The {selected.bidType.toLowerCase()} fits their summer plan and {selected.player.contractYearsLeft}-year remaining term gives them flexibility.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => actions.acceptBid(selected.id)}
              disabled={selected.status === 'Accepted' || selected.status === 'Rejected' || selected.status === 'Withdrawn'}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check size={14} /> Accept Offer
            </button>
            <button
              onClick={() => actions.rejectBid(selected.id)}
              disabled={selected.status === 'Accepted' || selected.status === 'Rejected' || selected.status === 'Withdrawn'}
              className="w-full py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X size={14} /> Reject Offer
            </button>
            <button className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
              <Eye size={14} /> View Player Profile
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Tab 3: Browse Market
// ───────────────────────────────────────────────────────────────────────────

const BrowseMarketTab: React.FC = () => {
  const { browseListings, actions, window: w, userTid } = useTransferMarketContext();
  const [selected, setSelected] = useState<BrowseListing | null>(browseListings[0] ?? null);
  const minBid = selected ? (selected.highestBidEUR || selected.askingEUR) + 50_000 : 100_000;
  const maxBid = selected ? Math.max(selected.askingEUR * 3, (selected.highestBidEUR || selected.askingEUR) * 2) : 5_000_000;
  const step = 50_000;
  const [bidInput, setBidInput] = useState<number>(minBid);

  React.useEffect(() => {
    if (selected && !browseListings.find(b => b.id === selected.id)) setSelected(browseListings[0] ?? null);
    if (!selected && browseListings[0]) setSelected(browseListings[0]);
  }, [browseListings, selected]);

  React.useEffect(() => {
    if (selected) setBidInput((selected.highestBidEUR || selected.askingEUR) + 100_000);
  }, [selected?.id, selected?.highestBidEUR, selected?.askingEUR]);

  const dec = () => setBidInput(b => Math.max(minBid, b - step));
  const inc = () => setBidInput(b => Math.min(maxBid, b + step));
  const pctInRange = Math.min(100, Math.max(0, ((bidInput - minBid) / Math.max(1, maxBid - minBid)) * 100));
  const pctVsAsking = selected ? Math.round(((bidInput - selected.askingEUR) / Math.max(1, selected.askingEUR)) * 100) : 0;

  const submitBid = () => {
    if (!selected) return;
    // selected.id is the listingId; sellerTid we don't have directly — but the
    // submit-action only needs playerId + listingId; sellerTid is on the listing
    // record, which the reducer can re-fetch. For simplicity we pass via the
    // context payload sellerTid=0 and let the reducer ignore (current reducer
    // signature still wants it — we read off the listing). Pass a sane default.
    actions.submitBid({
      listingId: selected.id,
      playerId: selected.player.id,
      sellerTid: -1,
      bidType: 'Transfer',
      amountEUR: bidInput,
      validDays: 5,
    });
  };

  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      <div className="col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Search size={16} className="text-amber-400" />
            Browse Market
            <span className="text-[10px] font-bold text-slate-500">({browseListings.length} listings)</span>
          </h2>
        </div>

        {/* Filter row */}
        <div className="grid grid-cols-6 gap-2 bg-slate-800/40 p-3 rounded-2xl border border-slate-800/50">
          {['All Leagues', 'All Nationalities', 'Age: any', 'OVR: 60–85', 'POT: 60–95', 'Sort: Value desc'].map((label, i) => (
            <select key={i} className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white text-[10px] py-1.5 px-2 focus:outline-none focus:border-amber-500 font-bold uppercase tracking-wide">
              <option>{label}</option>
            </select>
          ))}
        </div>

        <div className="bg-slate-800/40 rounded-2xl border border-slate-800/50 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-900/60 text-[9px] uppercase tracking-wider text-slate-500 font-bold">
            <div className="col-span-3">Player</div>
            <div className="col-span-1 text-center">OVR</div>
            <div className="col-span-1 text-center">POT</div>
            <div className="col-span-2">Selling Club</div>
            <div className="col-span-2">Asking</div>
            <div className="col-span-2">Highest Bid</div>
            <div className="col-span-1 text-right">Left</div>
          </div>
          {browseListings.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500 border-t border-slate-800/40">
              No listings on the market right now.
            </div>
          )}
          {browseListings.map(b => (
            <button
              key={b.id}
              onClick={() => setSelected(b)}
              className={`w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-left border-t border-slate-800/40 transition-colors ${
                selected?.id === b.id ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : 'hover:bg-slate-800/30'
              }`}
            >
              <div className="col-span-3"><PlayerCell p={b.player} small /></div>
              <div className="col-span-1 flex justify-center"><RatingBadge label="OVR" value={b.player.ovr} small /></div>
              <div className="col-span-1 flex justify-center"><RatingBadge label="POT" value={b.player.pot} small /></div>
              <div className="col-span-2"><ClubChip c={b.club} small /></div>
              <div className="col-span-2 text-xs font-black text-white">{fmtEUR(b.askingEUR)}</div>
              <div className={`col-span-2 text-xs font-black ${b.highestBidEUR >= b.askingEUR ? 'text-emerald-300' : 'text-amber-300'}`}>{fmtEUR(b.highestBidEUR)}</div>
              <div className="col-span-1 text-right text-[10px] font-bold text-amber-300">{b.daysLeft}d</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right rail */}
      <div className="space-y-4">
        {!selected ? (
          <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-800/60 text-sm text-slate-500 text-center">
            Pick a listing on the left to scout the player and submit a bid.
          </div>
        ) : (
        <div className="bg-slate-800/40 rounded-2xl p-5 border border-slate-800/60 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 border-2 border-slate-700 flex items-center justify-center font-black text-white">
              {selected.player.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-white truncate">{selected.player.name}</div>
              <div className="text-[10px] text-slate-500">{selected.player.flag} {selected.player.position} · {selected.player.age}y · {selected.player.contractYearsLeft}y left</div>
              <div className="mt-1"><OvrPotPair ovr={selected.player.ovr} pot={selected.player.pot} small /></div>
            </div>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Selling Club</div>
            <ClubChip c={selected.club} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60">
              <div className="text-[9px] uppercase tracking-wider text-slate-500">Asking</div>
              <div className="text-lg font-black text-white">{fmtEUR(selected.askingEUR)}</div>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-3 border border-amber-500/30">
              <div className="text-[9px] uppercase tracking-wider text-amber-400">Highest Bid</div>
              <div className="text-lg font-black text-amber-300">{fmtEUR(selected.highestBidEUR)}</div>
            </div>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Scouting Report</div>
            <p className="text-[10px] text-slate-300 leading-relaxed">{selected.scoutingReport}</p>
          </div>

          {/* Bid form — SigningModal-style stepper */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-emerald-500/30 space-y-3">
            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex justify-between items-center">
              Bid Amount
              <div className="flex gap-3 text-[10px]">
                <span className="text-rose-400">MIN {fmtEUR(minBid)}</span>
                <span className="text-white/50">MAX {fmtEUR(maxBid)}</span>
              </div>
            </label>

            <div className="flex items-center justify-between h-16 bg-white/[0.04] border border-white/10 rounded-sm px-4 transition-all hover:border-emerald-500/40">
              <button
                onClick={dec}
                disabled={bidInput <= minBid}
                className="text-white/30 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed touch-none select-none"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-center">
                <span className="text-2xl font-black italic text-white">{fmtEUR(bidInput)}</span>
                <p className="text-[8px] font-bold uppercase text-white/30 tracking-widest mt-0.5">
                  {pctVsAsking >= 0 ? `+${pctVsAsking}%` : `${pctVsAsking}%`} vs asking
                </p>
              </div>
              <button
                onClick={inc}
                disabled={bidInput >= maxBid}
                className="text-white/30 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed touch-none select-none"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400/70 transition-all" style={{ width: `${pctInRange}%` }} />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              {[
                { label: 'Bid Type', display: 'Transfer', dec: () => {}, inc: () => {} },
                { label: 'Window',   display: `${selected.daysLeft}d left`, dec: () => {}, inc: () => {} },
              ].map(({ label, display, dec: d, inc: i }) => (
                <div key={label}>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">{label}</p>
                  <div className="flex items-center justify-between h-12 bg-white/[0.04] border border-white/10 rounded-sm px-2">
                    <button onClick={d} className="text-white/30 hover:text-white p-1 touch-none select-none">
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-sm font-black italic text-white uppercase truncate text-center flex-1">
                      {display}
                    </span>
                    <button onClick={i} className="text-white/30 hover:text-white p-1 touch-none select-none">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={submitBid}
              disabled={!w.open}
              title={w.open ? 'Submit bid' : 'Transfer window closed'}
              className="w-full py-2.5 rounded-sm bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black uppercase tracking-[0.2em] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Place Bid
            </button>
            <button className="w-full py-1.5 rounded-sm bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5">
              <Eye size={11} /> Add to Watchlist
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Tab 4: Release Clauses
// ───────────────────────────────────────────────────────────────────────────

const ReleaseClausesTab: React.FC = () => {
  const { clauses } = useTransferMarketContext();
  const [filter, setFilter] = useState<ClauseStatus | 'all'>('all');
  const [selected, setSelected] = useState<ReleaseClause | null>(clauses[0] ?? null);

  React.useEffect(() => {
    if (!selected && clauses[0]) setSelected(clauses[0]);
    if (selected && !clauses.find(c => c.id === selected.id)) setSelected(clauses[0] ?? null);
  }, [clauses, selected]);

  const filtered = filter === 'all' ? clauses : clauses.filter(c => c.status === filter);

  const filterTabs: Array<{ key: ClauseStatus | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'Active', label: 'Active' },
    { key: 'Trigger Risk', label: 'Trigger Risk' },
    { key: 'Fired', label: 'Fired' },
    { key: 'No Clause', label: 'No Clause' },
    { key: 'Expired', label: 'Expired' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      <div className="col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
            <FileWarning size={16} className="text-amber-400" />
            Release Clauses
            <span className="text-[10px] font-bold text-slate-500">Buyout clauses on your active contracts</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filterTabs.map(t => {
            const count = t.key === 'all' ? clauses.length : clauses.filter(c => c.status === t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                  filter === t.key ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                {t.label} <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="bg-slate-800/40 rounded-2xl border border-slate-800/50 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-900/60 text-[9px] uppercase tracking-wider text-slate-500 font-bold">
            <div className="col-span-3">Player</div>
            <div className="col-span-1 text-center">OVR</div>
            <div className="col-span-1 text-center">POT</div>
            <div className="col-span-2">Clause Type</div>
            <div className="col-span-2">Amount</div>
            <div className="col-span-1">Expires</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500 border-t border-slate-800/40">
              No clauses on your active contracts.
            </div>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-left border-t border-slate-800/40 transition-colors ${
                selected?.id === c.id ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : 'hover:bg-slate-800/30'
              }`}
            >
              <div className="col-span-3"><PlayerCell p={c.player} small /></div>
              <div className="col-span-1 flex justify-center"><RatingBadge label="OVR" value={c.player.ovr} small /></div>
              <div className="col-span-1 flex justify-center"><RatingBadge label="POT" value={c.player.pot} small /></div>
              <div className="col-span-2 text-[11px] font-bold text-slate-300">{c.type}</div>
              <div className="col-span-2 text-xs font-black text-white">{c.amountEUR > 0 ? fmtEUR(c.amountEUR) : '—'}</div>
              <div className="col-span-1 text-[10px] text-slate-400">{c.expiresDate}</div>
              <div className="col-span-2 text-right">
                <StatusPill tone={clauseStatusColor(c.status)}>{c.status}</StatusPill>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right rail */}
      <div className="space-y-4">
        {!selected ? (
          <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-800/60 text-sm text-slate-500 text-center">
            Pick a clause on the left to view its details.
          </div>
        ) : (
        <div className="bg-slate-800/40 rounded-2xl p-5 border border-slate-800/60 space-y-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Player</div>

          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 border-2 border-slate-700 flex items-center justify-center font-black text-white">
              {selected.player.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-white truncate">{selected.player.name}</div>
              <div className="text-[10px] text-slate-500">{selected.player.flag} {selected.player.position} · {selected.player.age}y · {selected.player.contractYearsLeft}y left</div>
              <div className="mt-1"><OvrPotPair ovr={selected.player.ovr} pot={selected.player.pot} small /></div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-xl p-4 border border-purple-500/30">
            <div className="text-[10px] uppercase tracking-wider text-purple-400 font-bold">Clause Amount</div>
            <div className="text-3xl font-black text-purple-300 mt-1">{selected.amountEUR > 0 ? fmtEUR(selected.amountEUR) : '—'}</div>
            <div className="text-[10px] text-slate-400 mt-1">{selected.type}</div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Clause Information</div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Status</span>
              <StatusPill tone={clauseStatusColor(selected.status)}>{selected.status}</StatusPill>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Expires</span>
              <span className="font-bold text-white">{selected.expiresDate}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Term notice</span>
              <span className="font-bold text-white">{selected.termNoticeDays > 0 ? `${selected.termNoticeDays} days` : '—'}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Payment structure</span>
              <span className="font-bold text-white">{selected.paymentStructure}</span>
            </div>
          </div>

          {selected.status === 'No Clause' ? (
            <div className="bg-slate-900/60 rounded-xl p-3 border border-amber-500/30">
              <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">Description</div>
              <p className="text-[10px] text-slate-300 leading-relaxed">
                This contract has no release clause. Any club must negotiate a transfer fee with you directly — you cannot be forced to sell.
              </p>
            </div>
          ) : (
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Description</div>
              <p className="text-[10px] text-slate-300 leading-relaxed">
                Any club that deposits {fmtEUR(selected.amountEUR)} can sign {selected.player.name.split(' ')[0]} without your approval. Term notice of {selected.termNoticeDays} days must be filed before payment is finalized.
              </p>
            </div>
          )}

          {selected.recentActivity.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Recent Activity</div>
              <div className="space-y-1.5">
                {selected.recentActivity.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px]">
                    <span className="text-slate-500 shrink-0 font-mono">{a.date}</span>
                    <span className="text-slate-300">{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider">
            Edit Clause
          </button>
        </div>
        )}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Main View
// ───────────────────────────────────────────────────────────────────────────

const TabCountsAdapter: React.FC<{ initialTab: TabKey }> = ({ initialTab }) => {
  const { listings, inboxBids, browseListings, clauses } = useTransferMarketContext();
  const [tab, setTab] = useState<TabKey>(initialTab);

  const counts: Record<TabKey, number> = {
    listings: listings.length,
    inbox:    inboxBids.length,
    browse:   browseListings.length,
    clauses:  clauses.length,
  };

  return (
    <>
      <HeaderStrip />
      <TabsRow active={tab} onChange={setTab} counts={counts} />
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {tab === 'listings' && <MyListingsTab />}
        {tab === 'inbox' && <InboxTab />}
        {tab === 'browse' && <BrowseMarketTab />}
        {tab === 'clauses' && <ReleaseClausesTab />}
      </div>
    </>
  );
};

export const EuroTransferMarketView: React.FC<{ initialTab?: TabKey }> = ({ initialTab = 'listings' }) => (
  <div className="flex flex-col h-full bg-slate-950 text-slate-100">
    <TransferMarketProvider>
      <TabCountsAdapter initialTab={initialTab} />
    </TransferMarketProvider>
  </div>
);

export default EuroTransferMarketView;
