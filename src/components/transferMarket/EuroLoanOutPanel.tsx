import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Check, Clock, Plus, Search, X } from 'lucide-react';
import type { LoanOffer, NBAPlayer } from '../../types';
import { useGame } from '../../store/GameContext';
import {
  getLoanOutCandidates,
  getLoanDestinationProfile,
  LOAN_LENGTH_LABELS,
  loanEndDate,
  type LoanLength,
} from '../../services/transfer/loanMarket';
import { computeAge } from '../../utils/helpers';
import { getDisplayOverall } from '../../utils/playerRatings';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { PlayerSelectorGrid, type PlayerSelectorItem } from '../shared/PlayerSelectorGrid';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { fmtEUR, OvrPotPair } from './EuroTransferMarketShared';
import { isInLoanWindow } from '../../utils/transferWindow';

const DURATION_RANK: Record<LoanLength, number> = { 'three-months': 1, 'six-months': 2, season: 3 };

const formatMarket = (population: number) => population >= 1
  ? `${population.toFixed(population >= 10 ? 0 : 1)}M`
  : `${Math.max(1, Math.round(population * 1_000))}K`;

const LoanListingModal: React.FC<{ onClose: () => void; initialPlayerId?: string | null }> = ({ onClose, initialPlayerId }) => {
  const { state, dispatchAction } = useGame();
  const loanWindowOpen = isInLoanWindow(state.date, state.leagueStats).open;
  const parentTid = Number(state.userTeamId ?? -1);
  const candidates = useMemo(() => getLoanOutCandidates(state, parentTid), [parentTid, state]);
  const [selectedId, setSelectedId] = useState<string | null>(initialPlayerId ?? null);
  const selected = candidates.find(candidate => candidate.player.internalId === selectedId);
  const [feeEUR, setFeeEUR] = useState(100_000);
  const [wageSharePercent, setWageSharePercent] = useState(50);
  const [length, setLength] = useState<LoanLength>('season');
  const year = Number(state.leagueStats?.year ?? new Date().getFullYear());
  const teams = useMemo(() => [
    ...state.teams,
    ...(state.nonNBATeams ?? []).map((team: any) => ({ ...team, id: team.tid })),
  ], [state.nonNBATeams, state.teams]);
  const items = useMemo<PlayerSelectorItem[]>(() => candidates.map(candidate => ({
    player: candidate.player,
    score: getDisplayOverall(candidate.player),
    subtitle: `${computeAge(candidate.player, year)}y`,
  })), [candidates, year]);

  React.useEffect(() => {
    if (selected) setFeeEUR(selected.suggestedFeeEUR);
  }, [selectedId, selected]);

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-6" onClick={event => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h3 className="text-lg font-black text-white">List Player For Loan</h3><p className="mt-1 text-xs text-slate-400">Choose a reserve player, then set the terms clubs may offer.</p></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        {items.length > 0 ? (
          <PlayerSelectorGrid
            items={items}
            teams={teams as any}
            selectedIds={new Set(selectedId ? [selectedId] : [])}
            onToggle={setSelectedId}
            maxSelections={1}
            replaceSelectionAtLimit
            accentColor="sky"
            defaultVisible={30}
            searchPlaceholder="Search your roster..."
          />
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center text-sm text-slate-400">No eligible reserve players are available for loan.</div>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Requested Fee</div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setFeeEUR(value => Math.max(25_000, value - 25_000))} className="rounded-lg border border-slate-700 px-3 py-2 text-white">−</button>
              <div className="text-xl font-black text-emerald-300">{fmtEUR(feeEUR)}</div>
              <button type="button" onClick={() => setFeeEUR(value => value + 25_000)} className="rounded-lg border border-slate-700 px-3 py-2 text-white">+</button>
            </div>
            {selected && <button type="button" onClick={() => setFeeEUR(selected.suggestedFeeEUR)} className="mt-3 text-xs font-bold text-sky-300">Use suggestion ({fmtEUR(selected.suggestedFeeEUR)})</button>}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Wage Paid By Borrowing Club</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[0, 50, 100].map(value => <button type="button" key={value} onClick={() => setWageSharePercent(value)} className={`rounded-lg border px-2 py-2 text-xs font-black ${wageSharePercent === value ? 'border-sky-400 bg-sky-400/10 text-sky-200' : 'border-slate-700 text-slate-400'}`}>{value}%</button>)}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Loan Length</div>
          <div className="grid gap-2 sm:grid-cols-3">{(Object.keys(LOAN_LENGTH_LABELS) as LoanLength[]).map(value => <button type="button" key={value} onClick={() => setLength(value)} className={`rounded-xl border px-3 py-3 text-xs font-black ${length === value ? 'border-sky-400 bg-sky-400/10 text-sky-200' : 'border-slate-700 text-slate-400'}`}><span className="block">{LOAN_LENGTH_LABELS[value]}</span><span className="mt-1 block text-[9px] font-normal text-slate-500">Through {loanEndDate(state.date, value)}</span></button>)}</div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-800 py-3 text-xs font-bold uppercase text-slate-200">Cancel</button>
          <button type="button" disabled={!selected || !loanWindowOpen} onClick={() => {
            if (!selected) return;
            dispatchAction({ type: 'LIST_PLAYER_FOR_LOAN', payload: { playerId: selected.player.internalId, parentTid, requestedFeeEUR: feeEUR, wageSharePercent, length } } as any);
            onClose();
          }} className="flex-1 rounded-xl bg-sky-400 py-3 text-xs font-black uppercase text-slate-950 disabled:opacity-40">List For Loan</button>
        </div>
      </div>
    </div>
  );
};

const LoanOffersModal: React.FC<{
  player: NBAPlayer;
  offers: LoanOffer[];
  onClose: () => void;
}> = ({ player, offers, onClose }) => {
  const { state, dispatchAction } = useGame();
  const loanWindowOpen = isInLoanWindow(state.date, state.leagueStats).open;
  const [sort, setSort] = useState<'fee' | 'duration' | 'playing-time' | 'market'>('fee');
  const rows = useMemo(() => offers.map(offer => {
    const borrower = resolveAnyTeam(offer.borrowerTid, state.teams, state.nonNBATeams ?? []);
    const profile = getLoanDestinationProfile(state, offer.borrowerTid, player);
    return { offer, borrower, profile };
  }).sort((left, right) => {
    if (sort === 'duration') return DURATION_RANK[right.offer.duration ?? 'season'] - DURATION_RANK[left.offer.duration ?? 'season'] || right.offer.feeEUR - left.offer.feeEUR;
    if (sort === 'playing-time') return right.profile.playingTime - left.profile.playingTime || right.offer.feeEUR - left.offer.feeEUR;
    if (sort === 'market') return right.profile.marketPopulation - left.profile.marketPopulation || right.offer.feeEUR - left.offer.feeEUR;
    return right.offer.feeEUR - left.offer.feeEUR;
  }), [offers, player, sort, state]);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 shadow-2xl sm:max-w-3xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/95 p-5 backdrop-blur">
          <div><div className="text-[10px] font-black uppercase tracking-widest text-sky-300">Loan Offers</div><h3 className="text-xl font-black text-white">{player.name}</h3><p className="mt-1 text-xs text-slate-500">Compare the fee, length, expected role and destination market.</p></div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4 sm:p-5">
          <label className="mb-4 flex w-full items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400 sm:ml-auto sm:w-fit"><ArrowUpDown size={14} />Sort by<select value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="bg-transparent text-white outline-none"><option value="fee">Highest fee</option><option value="duration">Longest duration</option><option value="playing-time">Most playing time</option><option value="market">Biggest market</option></select></label>
          {rows.length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-500">No club offers yet.</div> : <div className="space-y-3">{rows.map(({ offer, borrower, profile }, index) => {
            const logo = borrower ? getResolvedTeamLogoUrl(borrower, state.leagueStats.year) : undefined;
            return <div key={offer.id} className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
              <div className="flex min-w-0 items-center gap-3">{logo ? <img src={logo} alt="" className="h-10 w-10 shrink-0 object-contain" referrerPolicy="no-referrer" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-[8px] font-black text-slate-500">CLUB</div>}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><div className="truncate text-sm font-black text-white">{borrower ? getTeamFullName(borrower as any) : 'Borrowing club'}</div>{index === 0 && <span className="rounded border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase text-sky-200">Best match</span>}</div><div className="mt-0.5 text-[10px] text-slate-500">Offer received {offer.submittedDate}</div></div></div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Fee</div><div className="mt-1 text-sm font-black text-emerald-300">{fmtEUR(offer.feeEUR)}</div></div><div><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Duration</div><div className="mt-1 text-sm font-black text-cyan-300">{LOAN_LENGTH_LABELS[offer.duration ?? 'season']}</div></div><div><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Playing Time</div><div className="mt-1 text-sm font-black text-white">{profile.playingTime}%</div></div><div><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Market</div><div className="mt-1 text-sm font-black text-white">{formatMarket(profile.marketPopulation)}</div></div></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3"><div className="flex flex-wrap gap-3 text-[10px] text-slate-500"><span>{offer.wageSharePercent}% wages paid by borrower</span><span className="inline-flex items-center gap-1"><Clock size={10} /> through {offer.endDate}</span></div><div className="flex gap-2"><button type="button" onClick={() => dispatchAction({ type: 'REJECT_LOAN_OFFER', payload: { offerId: offer.id } } as any)} className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 px-3 py-2 text-[10px] font-black uppercase text-rose-300"><X size={12} /> Decline</button><button type="button" disabled={!loanWindowOpen} onClick={() => { dispatchAction({ type: 'ACCEPT_LOAN_OFFER', payload: { offerId: offer.id } } as any); onClose(); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-400 px-3 py-2 text-[10px] font-black uppercase text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><Check size={12} /> Accept</button></div></div>
            </div>;
          })}</div>}
        </div>
      </div>
    </div>
  );
};

export const EuroLoanOutPanel: React.FC<{
  onOpenPlayer: (player: NBAPlayer) => void;
  initialPlayerId?: string | null;
  onInitialPlayerHandled?: () => void;
}> = ({ onOpenPlayer, initialPlayerId, onInitialPlayerHandled }) => {
  const { state, dispatchAction } = useGame();
  const loanWindow = isInLoanWindow(state.date, state.leagueStats);
  const [modalOpen, setModalOpen] = useState(false);
  const [listingInitialPlayerId, setListingInitialPlayerId] = useState<string | null>(null);
  const [offersPlayerId, setOffersPlayerId] = useState<string | null>(null);
  const listed = (state.loanListedPlayerIds ?? [])
    .map(id => state.players.find(player => player.internalId === id))
    .filter((player): player is NBAPlayer => !!player && player.tid === state.userTeamId);
  const activeOffers = (playerId: string) => (state.loanOffers ?? [])
    .filter(offer => offer.playerId === playerId && offer.status === 'active' && offer.requiresParentDecision)
    .sort((left, right) => right.feeEUR - left.feeEUR);

  React.useEffect(() => {
    if (!initialPlayerId) return;
    if (!loanWindow.open) {
      onInitialPlayerHandled?.();
      return;
    }
    setListingInitialPlayerId(initialPlayerId);
    setModalOpen(true);
    onInitialPlayerHandled?.();
  }, [initialPlayerId, loanWindow.open, onInitialPlayerHandled]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-sm font-black uppercase text-white">Loan Listings <span className="text-[10px] text-slate-500">({listed.length} active)</span></h2><p className="mt-1 text-xs text-slate-500">Invite short-term offers for reserve players in your squad.</p></div>
        <button
          type="button"
          disabled={!loanWindow.open}
          title={loanWindow.open ? 'List a player for loan' : 'Loan window closed'}
          onClick={() => { setListingInitialPlayerId(null); setModalOpen(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-[10px] font-black uppercase text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={12} /> List Player
        </button>
      </div>
      {!loanWindow.open && (
        <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.05] px-4 py-3 text-xs text-sky-200">
          The loan window is closed. Existing agreements remain visible, but new listings reopen during the next window.
        </div>
      )}
      {listed.length === 0 && <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-500"><Search size={24} className="mx-auto mb-2" />No active loan listings.</div>}
      {listed.map(player => {
        const offers = activeOffers(player.internalId);
        const profiled = offers.map(offer => ({ offer, profile: getLoanDestinationProfile(state, offer.borrowerTid, player) }));
        const topFee = profiled.slice().sort((left, right) => right.offer.feeEUR - left.offer.feeEUR)[0];
        const longest = profiled.slice().sort((left, right) => DURATION_RANK[right.offer.duration ?? 'season'] - DURATION_RANK[left.offer.duration ?? 'season'])[0];
        const playingTime = profiled.slice().sort((left, right) => right.profile.playingTime - left.profile.playingTime)[0];
        const market = profiled.slice().sort((left, right) => right.profile.marketPopulation - left.profile.marketPopulation)[0];
        return <div key={player.internalId} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => onOpenPlayer(player)} className="flex min-w-0 items-center gap-3 text-left"><PlayerPortrait imgUrl={player.imgURL} face={(player as any).face} playerName={player.name} size={44} /><div className="min-w-0"><div className="truncate text-sm font-black text-white">{player.name}</div><div className="text-xs text-slate-500">{player.pos} · {computeAge(player, state.leagueStats.year)}y</div></div><OvrPotPair ovr={getDisplayOverall(player)} pot={Number(player.potential ?? player.ratings?.at(-1)?.pot ?? 0)} small /></button>
            <div className="flex gap-2"><button type="button" onClick={() => setOffersPlayerId(player.internalId)} className="rounded-lg border border-sky-400/30 px-3 py-2 text-[10px] font-black uppercase text-sky-200">View Offers ({offers.length})</button><button type="button" onClick={() => dispatchAction({ type: 'CANCEL_LOAN_LISTING', payload: { playerId: player.internalId } } as any)} className="rounded-lg border border-rose-400/30 px-3 py-2 text-[10px] font-black uppercase text-rose-300">Cancel</button></div>
          </div>
          {offers.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800 pt-4 sm:grid-cols-4"><div><div className="text-[9px] font-black uppercase text-slate-600">Top Bidder</div><div className="mt-1 text-xs font-black text-emerald-300">{topFee ? fmtEUR(topFee.offer.feeEUR) : '—'}</div></div><div><div className="text-[9px] font-black uppercase text-slate-600">Longest</div><div className="mt-1 text-xs font-black text-cyan-300">{longest ? LOAN_LENGTH_LABELS[longest.offer.duration ?? 'season'] : '—'}</div></div><div><div className="text-[9px] font-black uppercase text-slate-600">Playing Time</div><div className="mt-1 text-xs font-black text-white">{playingTime ? `${playingTime.profile.playingTime}%` : '—'}</div></div><div><div className="text-[9px] font-black uppercase text-slate-600">Biggest Market</div><div className="mt-1 text-xs font-black text-white">{market ? formatMarket(market.profile.marketPopulation) : '—'}</div></div></div>}
        </div>;
      })}
      {modalOpen && <LoanListingModal initialPlayerId={listingInitialPlayerId} onClose={() => setModalOpen(false)} />}
      {offersPlayerId && (() => {
        const player = listed.find(candidate => candidate.internalId === offersPlayerId);
        return player ? <LoanOffersModal player={player} offers={activeOffers(player.internalId)} onClose={() => setOffersPlayerId(null)} /> : null;
      })()}
    </div>
  );
};
