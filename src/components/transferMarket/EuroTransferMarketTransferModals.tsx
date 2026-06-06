import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeftRight, Check, X } from 'lucide-react';
import type { InboxBid, MockClub, MyListing } from './mockData';
import { useGame } from '../../store/GameContext';
import { estimatePlayerValueEUR } from '../../services/transfer/transferMarket';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { ClubChip, fmtEUR, OvrPotPair, StatusPill, statusColor } from './EuroTransferMarketShared';

export const ViewBidsModal: React.FC<{
  listingId: string | null;
  listings: MyListing[];
  bids: InboxBid[];
  onClose: () => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}> = ({ listingId, listings, bids, onClose, onAccept, onReject }) => {
  const [loading, setLoading] = useState(true);
  const listing = listings.find(item => item.id === listingId);
  const filteredBids = bids.filter(item => item.listingId === listingId);
  const { state } = useGame();

  useEffect(() => {
    if (!listingId) return;
    setLoading(true);
    const timeoutId = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(timeoutId);
  }, [listingId]);

  const overpricedHint = useMemo(() => {
    if (!listing || filteredBids.length > 0) return null;
    const player = (state.players ?? []).find((entry: any) => entry.internalId === listing.player.id);
    if (!player) return null;
    const estimated = estimatePlayerValueEUR(player as any, state as any);
    if (!Number.isFinite(estimated) || estimated <= 0) return null;
    if (listing.askingEUR <= estimated * 1.3) return null;
    const gap = Math.round(((listing.askingEUR - estimated) / estimated) * 100);
    if (!Number.isFinite(gap)) return null;
    return `Asking price is ~${gap}% above estimated market value. Most clubs won't bid — but top-tier sides with deep pockets sometimes overpay for the right profile.`;
  }, [filteredBids, listing, state]);

  return (
    <AnimatePresence>
      {listingId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-white">
                  Bids — {listing?.player.name ?? '—'}
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Asking {listing ? fmtEUR(listing.askingEUR) : '—'} · {loading ? 'Checking market…' : `${filteredBids.length} bid${filteredBids.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <button onClick={onClose} className="text-slate-500 transition-colors hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                  <p className="animate-pulse text-xs font-bold uppercase tracking-wider text-slate-400">Receiving bids…</p>
                </div>
              ) : (
                <>
                  {filteredBids.length === 0 && (
                    <div className="space-y-2 px-5 py-8 text-center">
                      <p className="text-sm font-bold text-slate-400">No bids yet.</p>
                      {overpricedHint && <p className="mx-auto max-w-xs text-[11px] leading-relaxed text-amber-400/80">{overpricedHint}</p>}
                    </div>
                  )}
                  <div className="divide-y divide-slate-800">
                    {filteredBids.map(bid => (
                      <div key={bid.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-white">{bid.bidder.name}</span>
                            {bid.bidder.league === 'NBA' && (
                              <span className="rounded border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-amber-300">NBA</span>
                            )}
                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${statusColor(bid.status)}`}>{bid.status}</span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500">{bid.bidType} · received {bid.receivedDate} · expires in {bid.expiresInDays}d</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-white">{fmtEUR(bid.amountEUR)}</div>
                          <div className={`text-[10px] font-bold ${bid.pctVsAsking >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {bid.pctVsAsking >= 0 ? '+' : ''}{bid.pctVsAsking}% vs ask
                          </div>
                        </div>
                        <div className="ml-2 flex flex-col gap-1">
                          <button
                            onClick={() => onAccept(bid.id)}
                            className="rounded border border-emerald-500/30 bg-emerald-500/20 p-1.5 text-emerald-300 hover:bg-emerald-500/30"
                          >
                            <Check size={10} />
                          </button>
                          <button
                            onClick={() => onReject(bid.id)}
                            className="rounded border border-rose-500/20 bg-rose-500/10 p-1.5 text-rose-300 hover:bg-rose-500/20"
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

export const OfferDetailsModal: React.FC<{
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
          className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-900 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <h3 className="text-sm font-black uppercase tracking-tight text-white">Offer Details</h3>
              <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="max-h-[80vh] space-y-4 overflow-y-auto p-5">
              <div className="flex items-center gap-3">
                <PlayerPortrait imgUrl={bid.player.imgURL} face={bid.player.face} playerName={bid.player.name} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-white">{bid.player.name}</div>
                  <div className="text-[10px] text-slate-500">{bid.player.flag} {bid.player.position} · {bid.player.age}y</div>
                  <div className="mt-1"><OvrPotPair ovr={bid.player.ovr} pot={bid.player.pot} small /></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-3">
                <div className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">Bidder</div>
                <ClubChip c={bid.bidder} />
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Bid Amount</div>
                <div className="mt-1 text-3xl font-black text-amber-300">{fmtEUR(bid.amountEUR)}</div>
                {bid.pctVsAsking !== 0 && (
                  <div className={`mt-1 text-[11px] font-bold ${bid.pctVsAsking > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {bid.pctVsAsking > 0 ? '+' : ''}{bid.pctVsAsking}% vs asking price
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Offer Information</div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">Transaction type</span><span className="font-bold text-white">{bid.bidType}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">Received</span><span className="font-bold text-white">{bid.receivedDate}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">Expires in</span><span className="font-bold text-amber-300">{bid.expiresInDays}d</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">Status</span><StatusPill tone={statusColor(bid.status)}>{bid.status}</StatusPill></div>
              </div>

              <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">About the Interest</div>
                <p className="text-[10px] leading-relaxed text-slate-300">
                  {bid.bidder.name} is actively reshaping their {bid.player.position} rotation. The {bid.bidType.toLowerCase()} fits their summer plan and {bid.player.contractYearsLeft}-year remaining term gives them flexibility.
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={onAccept}
                  disabled={!!resolved}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Check size={14} /> Accept Offer
                </button>
                <button
                  onClick={onReject}
                  disabled={!!resolved}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 py-2 text-xs font-bold uppercase tracking-wider text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
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

export const TransferResolutionModal: React.FC = () => {
  const { state, dispatchAction } = useGame() as any;
  const rawPending: Array<{ playerName: string; accepted: boolean; sellerTeamName: string; feeEUR: number; reason?: string; userInitiated?: boolean }> =
    state.pendingTransferToasts ?? [];
  const pending = rawPending.filter(item => item.userInitiated === true);

  useEffect(() => {
    if (rawPending.length === pending.length) return;
    dispatchAction({
      type: 'UPDATE_STATE' as any,
      payload: { pendingTransferToasts: pending },
    });
  }, [dispatchAction, pending, rawPending]);

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
        className="fixed inset-0 z-[210] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        onClick={dismiss}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className={`w-full max-w-md overflow-hidden rounded-2xl border bg-slate-900 shadow-2xl ${
            accepted ? 'border-emerald-500/40' : 'border-rose-500/40'
          }`}
          onClick={event => event.stopPropagation()}
        >
          <div className={`border-b px-6 py-5 ${accepted ? 'border-emerald-500/20 bg-emerald-500/[0.08]' : 'border-rose-500/20 bg-rose-500/[0.08]'}`}>
            <p className={`mb-1 text-[10px] font-black uppercase tracking-[0.35em] ${accepted ? 'text-emerald-300' : 'text-rose-300'}`}>
              {accepted ? 'Transfer Complete' : 'Offer Turned Down'}
            </p>
            <h2 className="text-xl font-black uppercase tracking-tight text-white">
              {accepted ? 'Nice Doing Business' : 'Bid Rejected'}
            </h2>
          </div>
          <div className="space-y-5 p-6">
            <div className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-4">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Player</div>
              <div className="text-lg font-black text-white">{current.playerName}</div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-4">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{accepted ? 'Selling Club' : 'Bidding On'}</div>
              <div className="text-sm font-bold text-white">{current.sellerTeamName}</div>
            </div>

            <div className={`rounded-xl border p-4 text-center ${
              accepted
                ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-emerald-600/5'
                : 'border-rose-500/30 bg-gradient-to-br from-rose-500/15 to-rose-600/5'
            }`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider ${accepted ? 'text-emerald-400' : 'text-rose-400'}`}>
                {accepted ? 'Transfer Fee' : 'Your Offer'}
              </div>
              <div className={`mt-1 text-3xl font-black ${accepted ? 'text-emerald-300' : 'text-rose-300'}`}>€{feeM}M</div>
            </div>

            <p className="text-center text-[11px] leading-relaxed text-slate-300">
              {accepted
                ? `Funds wired and paperwork filed. ${current.sellerTeamName} thanks you for the deal — looking forward to doing business again.`
                : current.reason ?? 'Offer was not accepted.'}
            </p>

            <button
              onClick={dismiss}
              className={`w-full rounded-xl py-3 text-xs font-black uppercase tracking-widest text-white ${
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

export const ConfirmTransferModal: React.FC<{
  bid: InboxBid | null;
  sellerClub: MockClub;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ bid, sellerClub, onCancel, onConfirm }) => (
  <AnimatePresence>
    {bid && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[199] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/40 bg-slate-900 shadow-2xl"
          onClick={event => event.stopPropagation()}
        >
          <div className="border-b border-amber-500/20 bg-amber-500/[0.06] px-6 py-5">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.35em] text-amber-300">Confirm Transfer</p>
            <h2 className="text-xl font-black uppercase tracking-tight text-white">Accept Offer?</h2>
          </div>
          <div className="space-y-5 p-6">
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-1 text-center">
                <ClubChip c={sellerClub} small />
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Selling</span>
              </div>
              <ArrowLeftRight size={20} className="text-amber-400" />
              <div className="flex flex-col items-center gap-1 text-center">
                <ClubChip c={bid.bidder} small />
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Buying</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-4">
              <div className="flex items-center gap-3">
                <PlayerPortrait imgUrl={bid.player.imgURL} face={bid.player.face} playerName={bid.player.name} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-white">{bid.player.name}</div>
                  <div className="text-[10px] text-slate-500">{bid.player.flag} {bid.player.position} · {bid.player.age}y · {bid.player.contractYearsLeft}y left</div>
                </div>
                <OvrPotPair ovr={bid.player.ovr} pot={bid.player.pot} small />
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-600/5 p-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Transfer Fee</div>
              <div className="mt-1 text-3xl font-black text-amber-300">{fmtEUR(bid.amountEUR)}</div>
              {bid.pctVsAsking !== 0 && (
                <div className={`mt-1 text-[10px] font-bold ${bid.pctVsAsking > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {bid.pctVsAsking > 0 ? '+' : ''}{bid.pctVsAsking}% vs asking
                </div>
              )}
            </div>

            <p className="text-center text-[11px] leading-relaxed text-slate-400">
              Confirming releases {bid.player.name} to {bid.bidder.name}. The deal is final and cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 rounded-xl bg-slate-800 py-3 text-xs font-bold uppercase tracking-widest text-slate-200 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-400"
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

export const TransferCompleteModal: React.FC<{
  bid: InboxBid | null;
  sellerClub: MockClub;
  onClose: () => void;
}> = ({ bid, sellerClub, onClose }) => (
  <AnimatePresence>
    {bid && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/40 bg-slate-900 shadow-2xl"
          onClick={event => event.stopPropagation()}
        >
          <div className="border-b border-emerald-500/20 bg-emerald-500/[0.08] px-6 py-5">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.35em] text-emerald-300">Transfer Complete</p>
            <h2 className="text-xl font-black uppercase tracking-tight text-white">Nice Doing Business</h2>
          </div>
          <div className="space-y-5 p-6">
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-1 text-center">
                <ClubChip c={sellerClub} small />
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Sold</span>
              </div>
              <ArrowLeftRight size={20} className="text-emerald-400" />
              <div className="flex flex-col items-center gap-1 text-center">
                <ClubChip c={bid.bidder} small />
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Bought</span>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-700/60 bg-slate-800/60 p-4">
              <div className="flex items-center gap-3">
                <PlayerPortrait imgUrl={bid.player.imgURL} face={bid.player.face} playerName={bid.player.name} size={44} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-white">{bid.player.name}</div>
                  <div className="text-[10px] text-slate-500">{bid.player.flag} {bid.player.position} · {bid.player.age}y</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 p-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Transfer Fee</div>
              <div className="mt-1 text-3xl font-black text-emerald-300">{fmtEUR(bid.amountEUR)}</div>
            </div>

            <p className="text-center text-[11px] leading-relaxed text-slate-300">
              Funds wired and paperwork filed. {bid.bidder.name} thanks you for the deal — looking forward to doing business again.
            </p>

            <button
              onClick={onClose}
              className="w-full rounded-xl bg-emerald-500 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-400"
            >
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
