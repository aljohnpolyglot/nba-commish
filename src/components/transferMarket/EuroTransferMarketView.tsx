import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Inbox, ListChecks, Plus, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { type BrowseListing, type InboxBid } from './mockData';
import { TransferMarketProvider, useTransferMarketContext } from './state';
import { useGame } from '../../store/GameContext';
import { usePlayerQuickActions } from '../../hooks/usePlayerQuickActions';
import type { NBAPlayer } from '../../types';
import {
  type OpenMarketPlayer,
  type TabKey,
  ClubChip,
  fmtEUR,
  HeaderStrip,
  OvrPotPair,
  PlayerCell,
  RatingBadge,
  resolveMarketPlayer,
  StatusPill,
  statusColor,
  TabsRow,
} from './EuroTransferMarketShared';
import {
  BidOnListingModal,
  ConfirmTransferModal,
  ListPlayerModal,
  OfferDetailsModal,
  TransferCompleteModal,
  ViewBidsModal,
} from './EuroTransferMarketModals';
import { ReleaseClausesTab } from './EuroTransferMarketReleaseClausesTab';

// ───────────────────────────────────────────────────────────────────────────
// Tab 1: My Listings
// ───────────────────────────────────────────────────────────────────────────

const MyListingsTab: React.FC<{ onOpenPlayer: OpenMarketPlayer }> = ({ onOpenPlayer }) => {
  const { listings, inboxBids, window: w, budget, cashChannels, marketActivity, actions, club } = useTransferMarketContext();
  const [selected, setSelected] = useState<string | null>(listings[0]?.id ?? null);
  const [showListModal, setShowListModal] = useState(false);
  const [viewBidsListingId, setViewBidsListingId] = useState<string | null>(null);
  const [pendingAccept, setPendingAccept] = useState<InboxBid | null>(null);
  const [celebration, setCelebration] = useState<InboxBid | null>(null);

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
            <div
              key={l.id}
              onClick={() => setSelected(l.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setSelected(l.id)}
              className={`w-full text-left bg-slate-800/40 rounded-2xl p-4 border transition-all cursor-pointer ${
                isSelected ? 'border-amber-500/60 bg-slate-800/60' : 'border-slate-800/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <PlayerCell p={l.player} onOpen={onOpenPlayer} />
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
                  <button
                    onClick={(e) => { e.stopPropagation(); setViewBidsListingId(l.id); }}
                    className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  >
                    View Bids {l.bidsCount > 0 && <span className="ml-1 text-amber-300">({l.bidsCount})</span>}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); actions.cancelListing(l.id); }}
                    className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showListModal && <ListPlayerModal onClose={() => setShowListModal(false)} />}

      <ViewBidsModal
        listingId={viewBidsListingId}
        listings={listings}
        bids={inboxBids}
        onClose={() => setViewBidsListingId(null)}
        onAccept={(id) => {
          const acceptedBid = inboxBids.find(b => b.id === id) ?? null;
          if (acceptedBid) {
            setViewBidsListingId(null);
            setPendingAccept(acceptedBid);
          }
        }}
        onReject={actions.rejectBid}
      />
      <ConfirmTransferModal
        bid={pendingAccept}
        sellerClub={club}
        onCancel={() => setPendingAccept(null)}
        onConfirm={() => {
          if (!pendingAccept) return;
          const b = pendingAccept;
          actions.acceptBid(b.id);
          setPendingAccept(null);
          setCelebration(b);
        }}
      />
      <TransferCompleteModal
        bid={celebration}
        sellerClub={club}
        onClose={() => setCelebration(null)}
      />

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
// Tab 2: Inbox
// ───────────────────────────────────────────────────────────────────────────

const InboxTab: React.FC<{ onOpenPlayer: OpenMarketPlayer }> = ({ onOpenPlayer }) => {
  const { inboxBids, actions, club } = useTransferMarketContext();
  const [filter, setFilter] = useState<'all' | 'active' | 'accepted' | 'rejected'>('all');
  const [selected, setSelected] = useState<InboxBid | null>(inboxBids[0] ?? null);
  const [pendingAccept, setPendingAccept] = useState<InboxBid | null>(null);
  const [celebration, setCelebration] = useState<InboxBid | null>(null);
  const handleAcceptRequest = (b: InboxBid) => setPendingAccept(b);
  const handleAcceptConfirm = () => {
    if (!pendingAccept) return;
    const b = pendingAccept;
    actions.acceptBid(b.id);
    setPendingAccept(null);
    setCelebration(b);
  };

  // No auto-select: detail view is a modal that opens on click and closes
  // on dismiss. Clear selection when the underlying bid disappears.
  React.useEffect(() => {
    if (selected && !inboxBids.find(b => b.id === selected.id)) setSelected(null);
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
    <div className="p-6 space-y-3">
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
                <PlayerCell p={b.player} small onOpen={onOpenPlayer} />
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
      <OfferDetailsModal
        bid={selected}
        onClose={() => setSelected(null)}
        onAccept={() => { if (selected) handleAcceptRequest(selected); setSelected(null); }}
        onReject={() => { if (selected) actions.rejectBid(selected.id); setSelected(null); }}
      />
      <ConfirmTransferModal
        bid={pendingAccept}
        sellerClub={club}
        onCancel={() => setPendingAccept(null)}
        onConfirm={handleAcceptConfirm}
      />
      <TransferCompleteModal
        bid={celebration}
        sellerClub={club}
        onClose={() => setCelebration(null)}
      />
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Tab 3: Browse Market
// ───────────────────────────────────────────────────────────────────────────

const BrowseMarketTab: React.FC<{ onOpenPlayer: OpenMarketPlayer }> = ({ onOpenPlayer }) => {
  const { browseListings, actions, window: w } = useTransferMarketContext();
  const [selected, setSelected] = useState<BrowseListing | null>(null);
  const [sort, setSort] = useState<{ key: 'ovr' | 'pot' | 'contract' | 'asking' | 'highestBid' | 'left'; dir: 'asc' | 'desc' }>({ key: 'asking', dir: 'desc' });
  // Session-local "ignored listings" — user hides ones they don't care about.
  // Stored as a Set of listing ids. Resets when the user re-enters the tab.
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const visibleListings = useMemo(() => {
    const valueFor = (b: BrowseListing): number => {
      switch (sort.key) {
        case 'ovr': return b.player.ovr;
        case 'pot': return b.player.pot;
        case 'contract': return b.player.contractYearsLeft;
        case 'asking': return b.askingEUR;
        case 'highestBid': return b.highestBidEUR;
        case 'left': return b.daysLeft;
      }
    };
    return browseListings
      .filter(b => !ignored.has(b.id))
      .slice()
      .sort((a, b) => {
        const diff = valueFor(a) - valueFor(b);
        return sort.dir === 'asc' ? diff : -diff;
      });
  }, [browseListings, ignored, sort]);
  const ignoredCount = browseListings.length - visibleListings.length;
  const toggleSort = (key: typeof sort.key) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: 'desc' });
  };
  const SortHead: React.FC<{ id: typeof sort.key; label: string; align?: 'left' | 'center' | 'right' }> = ({ id, label, align = 'left' }) => (
    <button
      onClick={() => toggleSort(id)}
      className={`uppercase tracking-wider hover:text-amber-300 transition-colors ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
      title={`Sort by ${label}`}
    >
      {label} {sort.key === id && <span className="text-amber-300">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
    </button>
  );
  const browseGrid = '3fr 0.55fr 0.55fr 1.15fr 1.9fr 1.25fr 1.25fr 0.65fr 1.25fr 0.85fr';

  // Clear selection when the underlying listing disappears (sold/expired).
  React.useEffect(() => {
    if (selected && !browseListings.find(b => b.id === selected.id)) setSelected(null);
  }, [browseListings, selected]);

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
          <Search size={16} className="text-amber-400" />
          Browse Market
          <span className="text-[10px] font-bold text-slate-500">({visibleListings.length} listings{ignoredCount > 0 ? ` · ${ignoredCount} ignored` : ''})</span>
        </h2>
        {ignoredCount > 0 && (
          <button
            onClick={() => setIgnored(new Set())}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
          >
            Show Ignored ({ignoredCount})
          </button>
        )}
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
          <div className="grid gap-2 px-4 py-2 bg-slate-900/60 text-[9px] uppercase tracking-wider text-slate-500 font-bold" style={{ gridTemplateColumns: browseGrid }}>
            <div>Player</div>
            <SortHead id="ovr" label="OVR" align="center" />
            <SortHead id="pot" label="POT" align="center" />
            <SortHead id="contract" label="Contract" />
            <div>Selling Club</div>
            <SortHead id="asking" label="Asking" />
            <SortHead id="highestBid" label="Highest Bid" />
            <SortHead id="left" label="Left" align="right" />
            <div className="text-right">Action</div>
            <div className="text-right">Ignore</div>
          </div>
          {visibleListings.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500 border-t border-slate-800/40">
              {browseListings.length === 0
                ? 'No listings on the market right now.'
                : 'All listings ignored — click "Show Ignored" above to restore.'}
            </div>
          )}
          {visibleListings.map(b => (
            <div
              key={b.id}
              className="grid gap-2 px-4 py-3 items-center border-t border-slate-800/40 hover:bg-slate-800/30 transition-colors"
              style={{ gridTemplateColumns: browseGrid }}
            >
              <div><PlayerCell p={b.player} small onOpen={onOpenPlayer} /></div>
              <div className="flex justify-center"><RatingBadge label="OVR" value={b.player.ovr} small /></div>
              <div className="flex justify-center"><RatingBadge label="POT" value={b.player.pot} small /></div>
              <div>
                <div className="text-xs font-black text-white tabular-nums">{b.player.contractYearsLeft}y</div>
                <div className="text-[9px] font-bold text-slate-500 tabular-nums">{fmtEUR(b.player.annualWageEUR)}/yr</div>
              </div>
              <div><ClubChip c={b.club} small /></div>
              <div className="text-xs font-black text-white">{fmtEUR(b.askingEUR)}</div>
              <div className={`text-xs font-black ${b.highestBidEUR <= 0 ? 'text-slate-500' : b.highestBidEUR >= b.askingEUR ? 'text-emerald-300' : 'text-amber-300'}`}>
                {b.highestBidEUR > 0 ? fmtEUR(b.highestBidEUR) : 'No bids'}
              </div>
              <div className="text-right text-[10px] font-bold text-amber-300">{b.daysLeft}d</div>
              <div className="flex justify-end">
                <button
                  onClick={() => setSelected(b)}
                  disabled={!w.open}
                  title={w.open ? 'Open negotiation modal' : 'Transfer window closed'}
                  className="px-3 py-1.5 rounded-md bg-rose-500 hover:bg-rose-400 disabled:bg-slate-700 disabled:text-slate-500 text-white text-[10px] font-black uppercase tracking-widest"
                >
                  Negotiate
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setIgnored(prev => new Set(prev).add(b.id))}
                  title="Hide this listing from the board"
                  className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-black uppercase tracking-widest"
                >
                  Ignore
                </button>
              </div>
            </div>
          ))}
        </div>
      <BidOnListingModal
        listing={selected}
        windowOpen={w.open}
        onClose={() => setSelected(null)}
        onSubmit={(amountEUR) => {
          if (!selected) return;
          actions.submitBid({
            listingId: selected.id,
            playerId: selected.player.id,
            sellerTid: -1,
            bidType: 'Transfer',
            amountEUR,
            validDays: 5,
          });
          setSelected(null);
        }}
      />
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Main View
// ───────────────────────────────────────────────────────────────────────────

const TabCountsAdapter: React.FC<{ initialTab: TabKey }> = ({ initialTab }) => {
  const { listings, inboxBids, browseListings, clauses } = useTransferMarketContext();
  const { state } = useGame();
  const quick = usePlayerQuickActions();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const players = state.players ?? [];

  const counts: Record<TabKey, number> = {
    listings: listings.length,
    inbox:    inboxBids.length,
    browse:   browseListings.length,
    clauses:  clauses.length,
  };

  const openMarketPlayer = useMemo<OpenMarketPlayer>(() => (marketPlayer) => {
    const resolved = resolveMarketPlayer(players, marketPlayer);
    if (resolved) quick.openFor(resolved);
  }, [players, quick]);

  if (quick.fullPageView) return quick.fullPageView;

  return (
    <>
      <HeaderStrip />
      <TabsRow active={tab} onChange={setTab} counts={counts} />
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {tab === 'listings' && <MyListingsTab onOpenPlayer={openMarketPlayer} />}
        {tab === 'inbox' && <InboxTab onOpenPlayer={openMarketPlayer} />}
        {tab === 'browse' && <BrowseMarketTab onOpenPlayer={openMarketPlayer} />}
        {tab === 'clauses' && <ReleaseClausesTab onOpenPlayer={openMarketPlayer} />}
      </div>
      {quick.portals}
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

export { TransferResolutionModal } from './EuroTransferMarketModals';

export default EuroTransferMarketView;
