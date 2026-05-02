import React from 'react';
import { X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { computeOfferStrength, isPlausibleActiveMarket } from '../../services/freeAgencyBidding';
import { getCurrentOffseasonFAMoratoriumEnd, isInMoratorium, parseGameDate } from '../../utils/dateUtils';
import type { NBAPlayer } from '../../types';

interface Props {
  player: NBAPlayer;
  onClose: () => void;
}

export const FAOffersModal: React.FC<Props> = ({ player, onClose }) => {
  const { state } = useGame();
  const market = state.faBidding?.markets?.find(m =>
    m.playerId === player.internalId &&
    isPlausibleActiveMarket(m as any, state, player)
  );
  const resolvedMarket = !market ? state.faBidding?.markets?.find(m => m.playerId === player.internalId && m.resolved) : null;
  const activeMarket = market ?? resolvedMarket;
  const activeBids = market?.bids?.filter(b => b.status === 'active' && !b.isUserBid) ?? [];
  const userBid = activeMarket?.bids?.find(b => b.isUserBid);
  const userBidAccepted = userBid?.status === 'accepted';
  const userBidRejected = userBid && !userBidAccepted && userBid.status !== 'active';
  const acceptedByOther = resolvedMarket?.bids?.find(b => b.status === 'accepted' && !b.isUserBid);
  const sortedBids = [...activeBids].sort((a, b) => b.salaryUSD - a.salaryUSD);
  const decisionDaysOut = (() => {
    if (!market) return 0;
    const rawDays = Math.max(0, market.decidesOnDay - (state.day ?? 0));
    if (!state.date || !isInMoratorium(state.date, state.leagueStats?.year ?? 2026, state.leagueStats as any, state.schedule as any)) return rawDays;
    const today = parseGameDate(state.date);
    const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(state.date, state.leagueStats as any, state.schedule as any);
    const moratoriumDays = Math.max(0, Math.ceil((moratoriumEnd.getTime() - today.getTime()) / 86_400_000));
    return Math.max(rawDays, moratoriumDays);
  })();

  // Normalize all bid scores so the leader = 100%
  const allBidsForStrength = [
    ...(market?.bids?.filter(b => b.status === 'active') ?? []),
    ...(resolvedMarket?.bids?.filter(b => b.status === 'accepted' || b.isUserBid) ?? []),
  ];
  const rawScores = new Map(allBidsForStrength.map(b => [b.id, computeOfferStrength(b, player, state)]));
  const maxRaw = Math.max(...rawScores.values(), 1);
  const normalizedPct = (bid: any) => Math.round((rawScores.get(bid.id) ?? 0) / maxRaw * 100);

  const renderStrengthBar = (bid: any) => {
    const pct = normalizedPct(bid);
    const color = pct >= 95 ? '#22c55e' : pct >= 70 ? '#FDB927' : 'rgba(255,255,255,0.2)';
    const textColor = pct >= 95 ? 'text-emerald-400' : pct >= 70 ? 'text-[#FDB927]' : 'text-white/40';
    return (
      <div className="mt-1.5">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-[8px] uppercase tracking-widest text-white/30">Offer Strength</div>
          <div className={`text-[9px] font-black ${textColor}`}>{pct}%</div>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
    );
  };

  const renderBidCard = (bid: any, idx: number, isUser = false) => {
    const totalM = Math.round((bid.salaryUSD * bid.years) / 100_000) / 10;
    const annualM = Math.round(bid.salaryUSD / 100_000) / 10;
    return (
      <div key={bid.id} className={`px-3 py-2.5 rounded-lg border ${isUser ? 'bg-indigo-500/5 border-indigo-500/30' : 'bg-white/[0.03] border-white/5'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {isUser ? (
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0 text-[9px] font-black text-indigo-300">YOU</div>
            ) : bid.teamLogoUrl ? (
              <img src={bid.teamLogoUrl} alt="" className="w-7 h-7 object-contain shrink-0" />
            ) : null}
            <div className="min-w-0">
              <div className={`text-[11px] font-black truncate ${isUser ? 'text-indigo-300' : 'text-white/90'}`}>
                {isUser ? 'Your Offer' : bid.teamName}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-white/40">
                {bid.option === 'PLAYER' ? 'Player option' : bid.option === 'TEAM' ? 'Team option' : `${bid.years}-year deal`}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[13px] font-black text-[#FDB927]">${totalM}M</div>
            <div className="text-[9px] uppercase tracking-widest text-white/40">${annualM}M / {bid.years}yr{!isUser && idx === 0 ? ' · leading' : ''}</div>
          </div>
        </div>
        {renderStrengthBar(bid)}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-zinc-950 border border-white/10 rounded-xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 italic">Active Market Bids</div>
            <div className="text-sm font-bold text-white mt-0.5">{player.name}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {!activeMarket && !userBid ? (
            <p className="text-[11px] text-white/40 italic text-center py-4">No competing bids on record.</p>
          ) : (
            <>
              {market && (
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <div className="text-[9px] uppercase tracking-widest text-white/50">Decision window</div>
                  <div className="text-[11px] font-bold text-[#FDB927]">
                    {decisionDaysOut === 0 ? 'Decides today' : `${decisionDaysOut} day${decisionDaysOut === 1 ? '' : 's'} remaining`}
                  </div>
                </div>
              )}

              {userBidAccepted && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <span className="text-emerald-400 font-black">✓</span>
                  <span className="text-[11px] font-black text-emerald-300 uppercase tracking-widest">Offer Accepted</span>
                </div>
              )}
              {userBidRejected && (
                <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-lg">
                  <span className="text-rose-400 font-black">✗</span>
                  <span className="text-[11px] font-black text-rose-300 uppercase tracking-widest">
                    Outbid{acceptedByOther ? ` — Player chose ${acceptedByOther.teamName}` : ''}
                  </span>
                </div>
              )}

              {userBid && renderBidCard(userBid, -1, true)}
              {sortedBids.map((bid, idx) => renderBidCard(bid, idx))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
