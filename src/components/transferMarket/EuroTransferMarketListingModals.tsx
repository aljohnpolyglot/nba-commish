import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { BrowseListing } from './mockData';
import { useTransferMarketContext } from './state';
import { useGame } from '../../store/GameContext';
import { estimatePlayerValueEUR } from '../../services/transfer/transferMarket';
import { clubInterestLabel, computeClubInterest, computePlayerInterest, playerInterestLabel } from '../../services/transfer/interestModel';
import { computeAge, convertTo2KRating } from '../../utils/helpers';
import { PlayerSelectorGrid, type PlayerSelectorItem } from '../shared/PlayerSelectorGrid';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { useHoldable } from '../../hooks/useHoldable';
import { getTeamFullName } from '../../utils/teamNames';
import { isOnRoster } from '../../utils/teamLookup';
import { ClubChip, fmtEUR, OvrPotPair } from './EuroTransferMarketShared';

export const ListPlayerModal: React.FC<{ onClose: () => void; preselectedPlayerId?: string | null }> = ({ onClose, preselectedPlayerId = null }) => {
  const { state } = useGame() as any;
  const { userTid, listings, actions } = useTransferMarketContext();
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();

  const alreadyListed = useMemo(
    () => new Set(listings.map(l => l.player.id)),
    [listings],
  );
  const eligible = useMemo(
    () => (state.players ?? [])
      .filter((p: any) => p.tid === userTid && isOnRoster(p) && !alreadyListed.has(p.internalId)),
    [alreadyListed, state.players, userTid],
  );
  const eligibleIdsKey = useMemo(
    () => eligible.map((p: any) => p.internalId).join('|'),
    [eligible],
  );

  const preferredPlayerId = eligible.some((p: any) => p.internalId === preselectedPlayerId)
    ? preselectedPlayerId
    : null;
  const [selPid, setSelPid] = useState<string | null>(preferredPlayerId ?? eligible[0]?.internalId ?? null);
  const selPlayer = eligible.find((p: any) => p.internalId === selPid);
  const suggested = selPlayer ? estimatePlayerValueEUR(selPlayer, currentYear) : 1_000_000;
  const [asking, setAsking] = useState<number>(suggested);
  const [days] = useState<number>(7);

  React.useEffect(() => { setAsking(suggested); }, [selPid, suggested]);
  React.useEffect(() => {
    setSelPid(prev => {
      if (preferredPlayerId && prev !== preferredPlayerId) return preferredPlayerId;
      if (prev && eligible.some((p: any) => p.internalId === prev)) return prev;
      return eligible[0]?.internalId ?? null;
    });
  }, [preferredPlayerId, eligible, eligibleIdsKey]);

  const selectorItems: PlayerSelectorItem[] = React.useMemo(
    () => eligible.map((p: any) => ({
      player: p,
      score: Math.round(convertTo2KRating(p.overallRating ?? 60)),
      subtitle: `${computeAge(p, currentYear)}y`,
    })),
    [currentYear, eligible],
  );
  const selectedSet = React.useMemo(
    () => new Set<string>(selPid ? [selPid] : []),
    [selPid],
  );

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
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-6 max-w-2xl w-full max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-base sm:text-lg font-black text-white">List Player For Transfer</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

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
            }, [state.nonNBATeams, state.teams])}
            selectedIds={selectedSet}
            onToggle={(pid) => setSelPid(prev => (prev === pid ? null : pid))}
            maxSelections={1}
            accentColor="amber"
            defaultVisible={30}
            searchPlaceholder="Search your roster..."
          />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex flex-col gap-1.5 sm:flex-row sm:justify-between sm:items-center mb-2">
              <span>Asking Price</span>
              <div className="flex flex-wrap gap-3 text-[10px]">
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
              <div
                className="pointer-events-none absolute top-1 h-3 w-px bg-amber-400/80"
                style={{ left: `${sugPct}%` }}
                title={`Engine suggestion: ${fmtEUR(suggested)}`}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center text-[9px] font-bold uppercase text-white/30 tracking-widest mt-1">
              <span>Min {fmtEUR(askMin)}</span>
              <button onClick={() => setAsking(suggested)} className="text-amber-300 hover:text-amber-200 normal-case tracking-normal font-bold">
                use suggestion ({fmtEUR(suggested)})
              </button>
              <span>{Math.round(askPct)}%</span>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
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

export const BidOnListingModal: React.FC<{
  listing: BrowseListing | null;
  windowOpen: boolean;
  onClose: () => void;
  onSubmit: (amountEUR: number) => void;
}> = ({ listing, windowOpen, onClose, onSubmit }) => {
  const { state } = useGame() as any;
  const { budget } = useTransferMarketContext();
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();

  const minBid = listing ? Math.round(listing.askingEUR * 0.5 / 50_000) * 50_000 : 100_000;
  const maxBid = listing ? Math.round(listing.askingEUR * 2.0 / 50_000) * 50_000 : 5_000_000;
  const step = 50_000;
  const [bidInput, setBidInput] = useState<number>(listing?.askingEUR ?? 1_000_000);

  React.useEffect(() => {
    if (listing) setBidInput(Math.max(listing.highestBidEUR || 0, listing.askingEUR));
  }, [listing?.askingEUR, listing?.highestBidEUR, listing?.id]);

  if (!listing) return <AnimatePresence>{null}</AnimatePresence>;

  const rawPlayer = (state.players ?? []).find((p: any) => p.internalId === listing.player.id);
  const allBids = (state.transferBids ?? []) as Array<any>;
  const otherOffers = allBids
    .filter(b => b.listingId === listing.id && (b.status === 'active' || b.status === 'highest' || b.status === 'outbid'))
    .filter(b => b.bidderTid !== (state.userTeamId ?? -999))
    .sort((a, b) => b.amountEUR - a.amountEUR)
    .slice(0, 5);

  const marketValueEUR = rawPlayer ? estimatePlayerValueEUR(rawPlayer, currentYear) : listing.askingEUR;
  const clubInterest = computeClubInterest(bidInput, listing.askingEUR);
  const clubTone = clubInterest >= 70 ? 'emerald' : clubInterest >= 40 ? 'amber' : 'rose';
  const playerInterest = computePlayerInterest(listing.player.id);
  const playerInterestText = playerInterestLabel(playerInterest);
  const clubInterestText = clubInterestLabel(clubInterest);
  const playerWillVeto = playerInterest < 50 && bidInput < listing.askingEUR * 1.2;

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
            className="w-full max-w-3xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-800">
              <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                <PlayerPortrait imgUrl={listing.player.imgURL} face={listing.player.face} playerName={listing.player.name} size={64} />
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">Negotiate Transfer</div>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-none break-words">{listing.player.name}</h2>
                  <div className="text-[11px] text-slate-400 mt-1.5 flex flex-wrap items-center gap-2">
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

            <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              <div className="bg-slate-900/60 rounded-2xl border border-slate-800/60 p-4 sm:p-5 space-y-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-400">Offer Details</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Bid to {listing.club.name} for the transfer rights</div>
                </div>

                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex justify-between">
                    <span>Transfer Fee</span>
                    <span className="text-slate-400">Market Value: {fmtEUR(marketValueEUR)}</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white tabular-nums mt-1 break-words">{fmtEUR(bidInput)}</div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
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

              <div className="space-y-4 sm:space-y-5">
                <div className="bg-slate-900/60 rounded-2xl border border-slate-800/60 p-4 sm:p-5 space-y-4">
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
                        Even if {listing.club.name} accepts, the player will turn it down at this fee. Push 1.2× asking or higher to overcome the reluctance.
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-slate-900/60 rounded-2xl border border-slate-800/60 p-4 sm:p-5 space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400">
                    Other Offers <span className="text-slate-500">({otherOffers.length})</span>
                  </div>
                  {otherOffers.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No competing bids yet — you're first in line.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {otherOffers.map(b => {
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

            <div className="px-4 sm:px-6 py-4 bg-slate-900/40 border-t border-slate-800">
              <div className="text-center text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 mb-3">Current Contract (To Be Transferred)</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Salary</div>
                  <div className="text-lg sm:text-xl font-black text-white tabular-nums break-words">{fmtEUR(annualSalaryEUR)}</div>
                  <div className="text-[9px] text-slate-500">per year</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Years Remaining</div>
                  <div className="text-lg sm:text-xl font-black text-white tabular-nums">{yearsLeft} {yearsLeft === 1 ? 'Year' : 'Years'}</div>
                  <div className="text-[9px] text-slate-500">({currentYear}/{String(currentYear + 1).slice(-2)} – {currentYear + yearsLeft - 1}/{String(currentYear + yearsLeft).slice(-2)})</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Contract Type</div>
                  <div className="text-lg sm:text-xl font-black text-white break-words">{contractType}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Expires</div>
                  <div className="text-lg sm:text-xl font-black text-white">Jun 30, {expYear}</div>
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 border-t border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center gap-3 lg:gap-4">
              <button
                onClick={onClose}
                className="w-full lg:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase tracking-widest text-xs"
              >
                Cancel
              </button>
              <p className="flex-1 text-[10px] text-slate-500 leading-snug text-center lg:text-left">
                You can make changes to your offer before submitting. Lowballs under 80% of asking are rejected on sight.
              </p>
              <button
                onClick={() => onSubmit(bidInput)}
                disabled={!windowOpen || blockedByCash}
                title={!windowOpen ? 'Transfer window closed' : blockedByCash ? 'No cash for this transfer' : 'Submit offer'}
                className="w-full lg:w-auto px-8 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black uppercase tracking-widest text-xs disabled:opacity-40 disabled:cursor-not-allowed"
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
