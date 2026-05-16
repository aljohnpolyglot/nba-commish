import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
import { computeClubInterest, computePlayerInterest, playerInterestLabel, clubInterestLabel } from '../../services/transfer/interestModel';
import { convertTo2KRating, computeAge } from '../../utils/helpers';
import { PlayerSelectorGrid, type PlayerSelectorItem } from '../shared/PlayerSelectorGrid';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { useHoldable } from '../../hooks/useHoldable';
import { usePlayerQuickActions } from '../../hooks/usePlayerQuickActions';
import { isOnRoster } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import type { NBAPlayer } from '../../types';

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

type OpenMarketPlayer = (player: MockPlayer) => void;

function resolveMarketPlayer(players: NBAPlayer[], player: MockPlayer): NBAPlayer | null {
  const ids = new Set([
    player.id,
    (player as any).internalId,
    (player as any).playerId,
    (player as any).pid,
  ].filter(Boolean));
  return players.find(p =>
    ids.has(p.internalId) ||
    ids.has(String((p as any).pid ?? '')) ||
    p.name === player.name
  ) ?? null;
}

const PlayerCell: React.FC<{ p: MockPlayer; small?: boolean; onOpen?: OpenMarketPlayer }> = ({ p, small, onOpen }) => (
  <div
    className={`flex items-center gap-3 ${onOpen ? 'cursor-pointer hover:text-amber-200' : ''}`}
    role={onOpen ? 'button' : undefined}
    tabIndex={onOpen ? 0 : undefined}
    title={onOpen ? `Open ${p.name}` : undefined}
    onClick={(e) => {
      if (!onOpen) return;
      e.stopPropagation();
      onOpen(p);
    }}
    onKeyDown={(e) => {
      if (!onOpen || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      e.stopPropagation();
      onOpen(p);
    }}
  >
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

const ClubChip: React.FC<{ c: MockClub; small?: boolean }> = ({ c, small }) => {
  const [logoFailed, setLogoFailed] = React.useState(false);
  const size = small ? 'w-5 h-5' : 'w-6 h-6';
  const showLogo = c.logoUrl && !logoFailed;
  return (
    <div className="inline-flex items-center gap-1.5">
      {showLogo ? (
        <img
          src={c.logoUrl}
          alt={c.shortName}
          className={`${size} object-contain shrink-0`}
          loading="lazy"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <div
          className={`${size} ${small ? 'text-[9px]' : 'text-[10px]'} rounded-full flex items-center justify-center font-black text-white shrink-0`}
          style={{ background: c.colorHex, border: '1px solid rgba(255,255,255,0.2)' }}
        >
          {c.shortName}
        </div>
      )}
      <div className="min-w-0">
        <div className={`${small ? 'text-[10px]' : 'text-[11px]'} font-bold text-white truncate`}>{c.name}</div>
        <div className="text-[9px] text-slate-500 truncate">{c.flag} {c.league}</div>
      </div>
    </div>
  );
};

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
    // TODO: Release Clauses tab is underdeveloped — hide until clause flow ships.
    // { key: 'clauses',  label: 'Release Clauses', icon: FileWarning },
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
// View Bids Modal
// ───────────────────────────────────────────────────────────────────────────

const ViewBidsModal: React.FC<{
  listingId: string | null;
  listings: MyListing[];
  bids: InboxBid[];
  onClose: () => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}> = ({ listingId, listings, bids, onClose, onAccept, onReject }) => {
  const [loading, setLoading] = useState(true);
  const listing = listings.find(l => l.id === listingId);
  const filteredBids = bids.filter(b => b.listingId === listingId);
  const { state } = useGame();

  useEffect(() => {
    if (!listingId) return;
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, [listingId]);

  // Overpriced detection: if no bids and asking > estimated value
  const overpricedHint = useMemo(() => {
    if (!listing || filteredBids.length > 0) return null;
    const player = (state.players ?? []).find((p: any) => p.internalId === listing.player.id);
    if (!player) return null;
    const estimated = estimatePlayerValueEUR(player as any, state as any);
    if (listing.askingEUR > estimated * 1.3) {
      const gap = Math.round(((listing.askingEUR - estimated) / estimated) * 100);
      return `Asking price is ~${gap}% above estimated market value. Most clubs won't bid — but top-tier sides with deep pockets sometimes overpay for the right profile.`;
    }
    return null;
  }, [listing, filteredBids, state]);

  return (
    <AnimatePresence>
      {listingId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-tight">
                  Bids — {listing?.player.name ?? '—'}
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Asking {listing ? fmtEUR(listing.askingEUR) : '—'} · {loading ? 'Checking market…' : `${filteredBids.length} bid${filteredBids.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider animate-pulse">Receiving bids…</p>
                </div>
              ) : (
                <>
                  {filteredBids.length === 0 && (
                    <div className="px-5 py-8 text-center space-y-2">
                      <p className="text-sm font-bold text-slate-400">No bids yet.</p>
                      {overpricedHint && (
                        <p className="text-[11px] text-amber-400/80 leading-relaxed max-w-xs mx-auto">{overpricedHint}</p>
                      )}
                    </div>
                  )}
                  <div className="divide-y divide-slate-800">
                    {filteredBids.map(b => (
                      <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white truncate">{b.bidder.name}</span>
                            {b.bidder.league === 'NBA' && (
                              <span className="text-[8px] font-black uppercase px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">NBA</span>
                            )}
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${statusColor(b.status)}`}>{b.status}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{b.bidType} · received {b.receivedDate} · expires in {b.expiresInDays}d</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-white">{fmtEUR(b.amountEUR)}</div>
                          <div className={`text-[10px] font-bold ${b.pctVsAsking >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {b.pctVsAsking >= 0 ? '+' : ''}{b.pctVsAsking}% vs ask
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 ml-2">
                          <button
                            onClick={() => onAccept(b.id)}
                            className="p-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                          >
                            <Check size={10} />
                          </button>
                          <button
                            onClick={() => onReject(b.id)}
                            className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

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
// List Player Modal
// ───────────────────────────────────────────────────────────────────────────

const ListPlayerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state } = useGame() as any;
  const { userTid, listings, actions } = useTransferMarketContext();
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();

  const alreadyListed = new Set(listings.map(l => l.player.id));
  const eligible = (state.players ?? [])
    .filter((p: any) => p.tid === userTid && isOnRoster(p) && !alreadyListed.has(p.internalId));

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
      subtitle: `${computeAge(p, currentYear)}y`,
    })),
    [eligible, currentYear],
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
            teams={React.useMemo(() => {
              const nba = state.teams ?? [];
              const euro = (state.nonNBATeams ?? []).map((t: any) => ({
                id: t.tid, name: t.name, abbrev: t.abbrev ?? '', region: t.region,
                logoUrl: t.imgURL, colors: t.colors, conference: '', wins: 0, losses: 0, strength: 0,
              }));
              return [...nba, ...euro];
            }, [state.teams, state.nonNBATeams])}
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

// ── Offer Details modal (Inbox) ────────────────────────────────────────────
// Replaces the right-rail panel — opens on row click.

const OfferDetailsModal: React.FC<{
  bid: InboxBid | null;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
}> = ({ bid, onClose, onAccept, onReject }) => {
  const resolved = bid && (bid.status === 'Accepted' || bid.status === 'Rejected' || bid.status === 'Withdrawn');
  return (
    <AnimatePresence>
      {bid && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full max-w-md bg-slate-900 rounded-2xl border border-amber-500/30 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="text-sm font-black text-white uppercase tracking-tight">Offer Details</h3>
              <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center gap-3">
                <PlayerPortrait imgUrl={bid.player.imgURL} face={bid.player.face} playerName={bid.player.name} size={56} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-white truncate">{bid.player.name}</div>
                  <div className="text-[10px] text-slate-500">{bid.player.flag} {bid.player.position} · {bid.player.age}y</div>
                  <div className="mt-1"><OvrPotPair ovr={bid.player.ovr} pot={bid.player.pot} small /></div>
                </div>
              </div>

              <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Bidder</div>
                <ClubChip c={bid.bidder} />
              </div>

              <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 rounded-xl p-4 border border-amber-500/30">
                <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Bid Amount</div>
                <div className="text-3xl font-black text-amber-300 mt-1">{fmtEUR(bid.amountEUR)}</div>
                {bid.pctVsAsking !== 0 && (
                  <div className={`text-[11px] font-bold mt-1 ${bid.pctVsAsking > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {bid.pctVsAsking > 0 ? '+' : ''}{bid.pctVsAsking}% vs asking price
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Offer Information</div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">Transaction type</span><span className="font-bold text-white">{bid.bidType}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">Received</span><span className="font-bold text-white">{bid.receivedDate}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">Expires in</span><span className="font-bold text-amber-300">{bid.expiresInDays}d</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">Status</span><StatusPill tone={statusColor(bid.status)}>{bid.status}</StatusPill></div>
              </div>

              <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">About the Interest</div>
                <p className="text-[10px] text-slate-300 leading-relaxed">
                  {bid.bidder.name} is actively reshaping their {bid.player.position} rotation. The {bid.bidType.toLowerCase()} fits their summer plan and {bid.player.contractYearsLeft}-year remaining term gives them flexibility.
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={onAccept}
                  disabled={!!resolved}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check size={14} /> Accept Offer
                </button>
                <button
                  onClick={onReject}
                  disabled={!!resolved}
                  className="w-full py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <X size={14} /> Reject Offer
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Global Transfer Resolution modal ───────────────────────────────────────
// Drains state.pendingTransferToasts one entry at a time. Two flavors:
//   - accepted=true  → "Nice doing business" (emerald, sale completed)
//   - accepted=false → "Offer turned down" (rose, with reason)
// Mounted globally in App.tsx so the user sees rejections regardless of which
// view they're sitting on when the sim resolves.

export const TransferResolutionModal: React.FC = () => {
  const { state, dispatchAction } = useGame() as any;
  const pending: Array<{ playerName: string; accepted: boolean; sellerTeamName: string; feeEUR: number; reason?: string }> =
    state.pendingTransferToasts ?? [];
  if (pending.length === 0) return null;
  const current = pending[0];
  const accepted = current.accepted;

  const dismiss = () => {
    dispatchAction({
      type: 'UPDATE_STATE' as any,
      payload: { pendingTransferToasts: pending.slice(1) },
    });
  };

  const feeM = (current.feeEUR / 1_000_000).toFixed(current.feeEUR >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '');

  return (
    <AnimatePresence>
      <motion.div
        key={`${current.playerName}-${current.feeEUR}-${pending.length}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        onClick={dismiss}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className={`w-full max-w-md bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border ${
            accepted ? 'border-emerald-500/40' : 'border-rose-500/40'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`px-6 py-5 border-b ${accepted ? 'border-emerald-500/20 bg-emerald-500/[0.08]' : 'border-rose-500/20 bg-rose-500/[0.08]'}`}>
            <p className={`text-[10px] font-black uppercase tracking-[0.35em] mb-1 ${accepted ? 'text-emerald-300' : 'text-rose-300'}`}>
              {accepted ? 'Transfer Complete' : 'Offer Turned Down'}
            </p>
            <h2 className="text-xl font-black uppercase tracking-tight text-white">
              {accepted ? 'Nice Doing Business' : 'Bid Rejected'}
            </h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Player</div>
              <div className="text-lg font-black text-white">{current.playerName}</div>
            </div>

            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{accepted ? 'Selling Club' : 'Bidding On'}</div>
              <div className="text-sm font-bold text-white">{current.sellerTeamName}</div>
            </div>

            <div className={`rounded-xl p-4 border text-center ${
              accepted
                ? 'bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 border-emerald-500/30'
                : 'bg-gradient-to-br from-rose-500/15 to-rose-600/5 border-rose-500/30'
            }`}>
              <div className={`text-[10px] uppercase tracking-wider font-bold ${accepted ? 'text-emerald-400' : 'text-rose-400'}`}>
                {accepted ? 'Transfer Fee' : 'Your Offer'}
              </div>
              <div className={`text-3xl font-black mt-1 ${accepted ? 'text-emerald-300' : 'text-rose-300'}`}>€{feeM}M</div>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed text-center">
              {accepted
                ? `Funds wired and paperwork filed. ${current.sellerTeamName} thanks you for the deal — looking forward to doing business again.`
                : (current.reason ?? 'Offer was not accepted.')}
            </p>

            <button
              onClick={dismiss}
              className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-xs text-white ${
                accepted ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-rose-500 hover:bg-rose-400'
              }`}
            >
              {pending.length > 1 ? `Next (${pending.length - 1} more)` : 'Done'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ── Confirm Transfer modal ─────────────────────────────────────────────────
// Shown BEFORE the user commits to accepting a bid — mirrors TradeSummaryModal.
// User reviews player, bidder, fee, and clicks Confirm to fire actions.acceptBid.

const ConfirmTransferModal: React.FC<{
  bid: InboxBid | null;
  sellerClub: MockClub;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ bid, sellerClub, onCancel, onConfirm }) => {
  return (
    <AnimatePresence>
      {bid && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[199] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full max-w-md bg-slate-900 rounded-2xl border border-amber-500/40 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-amber-500/20 bg-amber-500/[0.06]">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 mb-1">Confirm Transfer</p>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">Accept Offer?</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-1 text-center">
                  <ClubChip c={sellerClub} small />
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Selling</span>
                </div>
                <ArrowLeftRight size={20} className="text-amber-400" />
                <div className="flex flex-col items-center gap-1 text-center">
                  <ClubChip c={bid.bidder} small />
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Buying</span>
                </div>
              </div>

              <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60">
                <div className="flex items-center gap-3">
                  <PlayerPortrait imgUrl={bid.player.imgURL} face={bid.player.face} playerName={bid.player.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-white truncate">{bid.player.name}</div>
                    <div className="text-[10px] text-slate-500">{bid.player.flag} {bid.player.position} · {bid.player.age}y · {bid.player.contractYearsLeft}y left</div>
                  </div>
                  <OvrPotPair ovr={bid.player.ovr} pot={bid.player.pot} small />
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-500/15 to-amber-600/5 rounded-xl p-4 border border-amber-500/30 text-center">
                <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Transfer Fee</div>
                <div className="text-3xl font-black text-amber-300 mt-1">{fmtEUR(bid.amountEUR)}</div>
                {bid.pctVsAsking !== 0 && (
                  <div className={`text-[10px] font-bold mt-1 ${bid.pctVsAsking > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {bid.pctVsAsking > 0 ? '+' : ''}{bid.pctVsAsking}% vs asking
                  </div>
                )}
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed text-center">
                Confirming releases {bid.player.name} to {bid.bidder.name}. The deal is final and cannot be undone.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold uppercase tracking-widest text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                >
                  <Check size={14} /> Confirm
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Transfer Complete celebration modal ────────────────────────────────────
// Pops up after the user accepts a bid on one of their listings, mirroring
// the "Trade Complete / Nice doing business" confirmation from TradeMachine.

const TransferCompleteModal: React.FC<{
  bid: InboxBid | null;
  sellerClub: MockClub;
  onClose: () => void;
}> = ({ bid, sellerClub, onClose }) => {
  return (
    <AnimatePresence>
      {bid && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full max-w-md bg-slate-900 rounded-2xl border border-emerald-500/40 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-emerald-500/20 bg-emerald-500/[0.08]">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-300 mb-1">Transfer Complete</p>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">Nice Doing Business</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-1 text-center">
                  <ClubChip c={sellerClub} small />
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Sold</span>
                </div>
                <ArrowLeftRight size={20} className="text-emerald-400" />
                <div className="flex flex-col items-center gap-1 text-center">
                  <ClubChip c={bid.bidder} small />
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Bought</span>
                </div>
              </div>

              <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60 space-y-2">
                <div className="flex items-center gap-3">
                  <PlayerPortrait imgUrl={bid.player.imgURL} face={bid.player.face} playerName={bid.player.name} size={44} />
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white truncate">{bid.player.name}</div>
                    <div className="text-[10px] text-slate-500">{bid.player.flag} {bid.player.position} · {bid.player.age}y</div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 rounded-xl p-4 border border-emerald-500/30 text-center">
                <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Transfer Fee</div>
                <div className="text-3xl font-black text-emerald-300 mt-1">{fmtEUR(bid.amountEUR)}</div>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed text-center">
                Funds wired and paperwork filed. {bid.bidder.name} thanks you for the deal — looking forward to doing business again.
              </p>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-widest text-xs"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Tab 3: Browse Market
// ───────────────────────────────────────────────────────────────────────────

const BrowseMarketTab: React.FC<{ onOpenPlayer: OpenMarketPlayer }> = ({ onOpenPlayer }) => {
  const { browseListings, actions, window: w } = useTransferMarketContext();
  const [selected, setSelected] = useState<BrowseListing | null>(null);
  // Session-local "ignored listings" — user hides ones they don't care about.
  // Stored as a Set of listing ids. Resets when the user re-enters the tab.
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const visibleListings = browseListings.filter(b => !ignored.has(b.id));
  const ignoredCount = browseListings.length - visibleListings.length;

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
          <div className="grid gap-2 px-4 py-2 bg-slate-900/60 text-[9px] uppercase tracking-wider text-slate-500 font-bold" style={{ gridTemplateColumns: '3fr 0.6fr 0.6fr 2fr 1.5fr 1.5fr 0.7fr 1.4fr 0.9fr' }}>
            <div>Player</div>
            <div className="text-center">OVR</div>
            <div className="text-center">POT</div>
            <div>Selling Club</div>
            <div>Asking</div>
            <div>Highest Bid</div>
            <div className="text-right">Left</div>
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
              style={{ gridTemplateColumns: '3fr 0.6fr 0.6fr 2fr 1.5fr 1.5fr 0.7fr 1.4fr 0.9fr' }}
            >
              <div><PlayerCell p={b.player} small onOpen={onOpenPlayer} /></div>
              <div className="flex justify-center"><RatingBadge label="OVR" value={b.player.ovr} small /></div>
              <div className="flex justify-center"><RatingBadge label="POT" value={b.player.pot} small /></div>
              <div><ClubChip c={b.club} small /></div>
              <div className="text-xs font-black text-white">{fmtEUR(b.askingEUR)}</div>
              <div className={`text-xs font-black ${b.highestBidEUR >= b.askingEUR ? 'text-emerald-300' : 'text-amber-300'}`}>{fmtEUR(b.highestBidEUR)}</div>
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

// ── Bid On Listing modal (Browse Market) ───────────────────────────────────
// Replaces the right-rail bid form — opens on row click.

// ── Negotiate Transfer modal ───────────────────────────────────────────────
// IMPORTANT MENTAL MODEL:
//   The bid amount = TRANSFER FEE (buyout) paid to the selling club to release
//   the player. The player's existing salary contract is transferred as-is —
//   buying club inherits it, no renegotiation. That's why the Current Contract
//   block at the bottom is read-only.
export const BidOnListingModal: React.FC<{
  listing: BrowseListing | null;
  windowOpen: boolean;
  onClose: () => void;
  onSubmit: (amountEUR: number) => void;
}> = ({ listing, windowOpen, onClose, onSubmit }) => {
  const { state } = useGame() as any;
  const { budget } = useTransferMarketContext();
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();

  // Min = 50% of asking (still rendered, but rejection kicks in <80%); max = 2× asking
  const minBid = listing ? Math.round(listing.askingEUR * 0.5 / 50_000) * 50_000 : 100_000;
  const maxBid = listing ? Math.round(listing.askingEUR * 2.0 / 50_000) * 50_000 : 5_000_000;
  const step = 50_000;
  const [bidInput, setBidInput] = useState<number>(listing?.askingEUR ?? 1_000_000);

  React.useEffect(() => {
    if (listing) setBidInput(Math.max(listing.highestBidEUR || 0, listing.askingEUR));
  }, [listing?.id, listing?.highestBidEUR, listing?.askingEUR]);

  if (!listing) return <AnimatePresence>{null}</AnimatePresence>;

  // Look up the raw player + outstanding bids + market value
  const rawPlayer = (state.players ?? []).find((p: any) => p.internalId === listing.player.id);
  const allBids = (state.transferBids ?? []) as Array<any>;
  const otherOffers = allBids
    .filter(b => b.listingId === listing.id && (b.status === 'active' || b.status === 'highest' || b.status === 'outbid'))
    .filter(b => b.bidderTid !== (state.userTeamId ?? -999))
    .sort((a, b) => b.amountEUR - a.amountEUR)
    .slice(0, 5);

  const marketValueEUR = rawPlayer ? estimatePlayerValueEUR(rawPlayer, currentYear) : listing.askingEUR;

  // Both gauges read from the shared interestModel — same numbers the ticker
  // uses when deciding accept/reject. UI ↔ AI cannot drift apart.
  const clubInterest = computeClubInterest(bidInput, listing.askingEUR);
  const clubTone = clubInterest >= 70 ? 'emerald' : clubInterest >= 40 ? 'amber' : 'rose';
  const playerInterest = computePlayerInterest(listing.player.id);
  const playerInterestText = playerInterestLabel(playerInterest);
  const clubInterestText = clubInterestLabel(clubInterest);
  // Visual cue when fee is fine but the player will veto anyway.
  const playerWillVeto = playerInterest < 50 && bidInput < listing.askingEUR * 1.2;

  // Pull contract data straight off the raw player. Falls back to MockPlayer
  // fields if the player can't be located (shouldn't happen on a real listing).
  const annualSalaryEUR = listing.player.annualWageEUR;
  const yearsLeft = listing.player.contractYearsLeft;
  const contractType = rawPlayer?.nonGuaranteed ? 'Non-Guaranteed' : 'Guaranteed';
  const expYear = rawPlayer?.contract?.exp ?? (currentYear + yearsLeft);
  const projectedCash = budget.cashEUR - bidInput;
  const blockedByCash = budget.cashEUR < bidInput;

  return (
    <AnimatePresence>
      {listing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full max-w-3xl bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-slate-800">
              <div className="flex items-center gap-4">
                <PlayerPortrait imgUrl={listing.player.imgURL} face={listing.player.face} playerName={listing.player.name} size={64} />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">Negotiate Transfer</div>
                  <h2 className="text-2xl font-black text-white tracking-tight leading-none">{listing.player.name}</h2>
                  <div className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-2">
                    <span>{listing.player.position}</span>
                    <span className="text-slate-700">•</span>
                    <span>{listing.player.age} years old</span>
                    <span className="text-slate-700">•</span>
                    <OvrPotPair ovr={listing.player.ovr} pot={listing.player.pot} small />
                  </div>
                  <div className="mt-2"><ClubChip c={listing.club} small /></div>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={20} /></button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-5 max-h-[68vh] overflow-y-auto">
              {/* LEFT — Offer Details */}
              <div className="bg-slate-900/60 rounded-2xl border border-slate-800/60 p-5 space-y-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-400">Offer Details</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Bid to {listing.club.name} for the transfer rights</div>
                </div>

                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex justify-between">
                    <span>Transfer Fee</span>
                    <span className="text-slate-400">Market Value: {fmtEUR(marketValueEUR)}</span>
                  </div>
                  <div className="text-3xl font-black text-white tabular-nums mt-1">{fmtEUR(bidInput)}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                      <div className="uppercase tracking-wider text-slate-500">Cash on Hand</div>
                      <div className={`font-black ${budget.cashEUR >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtEUR(budget.cashEUR)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                      <div className="uppercase tracking-wider text-slate-500">After Transfer</div>
                      <div className={`font-black ${projectedCash >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtEUR(projectedCash)}</div>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={minBid}
                    max={maxBid}
                    step={step}
                    value={bidInput}
                    onChange={(e) => setBidInput(parseInt(e.target.value, 10))}
                    className="w-full mt-3 accent-rose-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>{fmtEUR(minBid)}</span>
                    <span>{fmtEUR(maxBid)}</span>
                  </div>
                  {blockedByCash && (
                    <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-[10px] font-bold leading-snug text-rose-300">
                      No cash for this transfer. Lower the fee or create cash before bidding.
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Payment Structure</div>
                  <div className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-bold text-white flex items-center justify-between cursor-not-allowed opacity-90">
                    <span>Upfront</span>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Default</span>
                  </div>
                </div>

                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Add-ons</div>
                  <div className="w-full bg-slate-900 border border-slate-700 border-dashed rounded-lg px-3 py-2.5 text-xs text-slate-500 flex items-center justify-between">
                    <span>No add-ons</span>
                    <span className="text-slate-600">+</span>
                  </div>
                </div>
              </div>

              {/* RIGHT — Interest Levels + Other Offers */}
              <div className="space-y-5">
                <div className="bg-slate-900/60 rounded-2xl border border-slate-800/60 p-5 space-y-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400">Interest Levels</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Both club and player must be willing</div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">{listing.club.name} Interest</span>
                      <span className={`text-2xl font-black tabular-nums text-${clubTone}-300`}>{clubInterest}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden mt-1">
                      <div className={`h-full bg-${clubTone}-400 transition-all`} style={{ width: `${clubInterest}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{clubInterestText}</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">{listing.player.name.split(' ').slice(-1)[0]} Interest</span>
                      <span className={`text-2xl font-black tabular-nums ${playerInterest >= 65 ? 'text-violet-300' : 'text-rose-300'}`}>{playerInterest}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden mt-1">
                      <div className={`h-full transition-all ${playerInterest >= 65 ? 'bg-violet-400' : 'bg-rose-400'}`} style={{ width: `${playerInterest}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{playerInterestText}</p>
                  </div>

                  {playerWillVeto && (
                    <div className="bg-rose-950/40 border border-rose-500/40 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-bold text-rose-300 leading-snug">
                        ⚠ Even if {listing.club.name} accepts, the player will turn it down at this fee. Push 1.2× asking or higher to overcome the reluctance.
                      </p>
                    </div>
                  )}
                </div>

                {/* Other offers already on the table */}
                <div className="bg-slate-900/60 rounded-2xl border border-slate-800/60 p-5 space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400">
                    Other Offers <span className="text-slate-500">({otherOffers.length})</span>
                  </div>
                  {otherOffers.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No competing bids yet — you're first in line.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {otherOffers.map((b, i) => {
                        const bidderTeam = (state.nonNBATeams ?? []).find((t: any) => (t.tid ?? t.id) === b.bidderTid)
                          ?? (state.teams ?? []).find((t: any) => (t.tid ?? t.id) === b.bidderTid);
                        const name = bidderTeam ? getTeamFullName(bidderTeam) : '—';
                        const abbrev = bidderTeam?.abbrev ?? name.slice(0, 3).toUpperCase();
                        const logoUrl = bidderTeam?.imgURL ?? bidderTeam?.logoUrl;
                        return (
                          <div key={b.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-b-0">
                            <div className="flex items-center gap-2 min-w-0">
                              {logoUrl ? (
                                <img src={logoUrl} alt={abbrev} className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-slate-700 text-[8px] font-black text-white flex items-center justify-center shrink-0">{abbrev}</div>
                              )}
                              <span className="text-[11px] font-bold text-white truncate">{name}</span>
                              {b.status === 'highest' && <span className="text-[8px] font-black text-amber-300 uppercase tracking-wider px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded">Highest</span>}
                            </div>
                            <span className="text-xs font-black text-white tabular-nums shrink-0">{fmtEUR(b.amountEUR)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Current Contract — transferred as-is, not editable */}
            <div className="px-6 py-4 bg-slate-900/40 border-t border-slate-800">
              <div className="text-center text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 mb-3">Current Contract (To Be Transferred)</div>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Salary</div>
                  <div className="text-xl font-black text-white tabular-nums">{fmtEUR(annualSalaryEUR)}</div>
                  <div className="text-[9px] text-slate-500">per year</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Years Remaining</div>
                  <div className="text-xl font-black text-white tabular-nums">{yearsLeft} {yearsLeft === 1 ? 'Year' : 'Years'}</div>
                  <div className="text-[9px] text-slate-500">({currentYear}/{String(currentYear + 1).slice(-2)} – {currentYear + yearsLeft - 1}/{String(currentYear + yearsLeft).slice(-2)})</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Contract Type</div>
                  <div className="text-xl font-black text-white">{contractType}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Expires</div>
                  <div className="text-xl font-black text-white">Jun 30, {expYear}</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-800 flex items-center gap-4">
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase tracking-widest text-xs"
              >
                Cancel
              </button>
              <p className="flex-1 text-[10px] text-slate-500 leading-snug">
                You can make changes to your offer before submitting. Lowballs under 80% of asking are rejected on sight.
              </p>
              <button
                onClick={() => onSubmit(bidInput)}
                disabled={!windowOpen || blockedByCash}
                title={!windowOpen ? 'Transfer window closed' : blockedByCash ? 'No cash for this transfer' : 'Submit offer'}
                className="px-8 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black uppercase tracking-widest text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Submit Offer
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Tab 4: Release Clauses
// ───────────────────────────────────────────────────────────────────────────

const ReleaseClausesTab: React.FC<{ onOpenPlayer: OpenMarketPlayer }> = ({ onOpenPlayer }) => {
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
              <div className="col-span-3"><PlayerCell p={c.player} small onOpen={onOpenPlayer} /></div>
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

export default EuroTransferMarketView;
