import type { ReactElement } from 'react';
import type { NBAPlayer } from '../../../types';
import { getCurrentOffseasonFAMoratoriumEnd, isInMoratorium, parseGameDate } from '../../../utils/dateUtils';
import { computeOfferStrength } from '../../../services/freeAgencyBidding';

interface SigningModalOffersTabProps {
  isPlausibleActiveMarket: (market: any, state: any, player: NBAPlayer) => boolean;
  leagueStats: any;
  player: NBAPlayer;
  state: any;
}

export default function SigningModalOffersTab({
  isPlausibleActiveMarket,
  leagueStats,
  player,
  state,
}: SigningModalOffersTabProps): ReactElement {
  const market = state.faBidding?.markets?.find((entry: any) =>
    entry.playerId === player.internalId &&
    isPlausibleActiveMarket(entry, state, player)
  );
  const resolvedMarket = !market
    ? state.faBidding?.markets?.find((entry: any) => entry.playerId === player.internalId && entry.resolved)
    : null;
  const activeMarket = market ?? resolvedMarket;
  const activeBids = market?.bids?.filter((bid: any) => bid.status === 'active' && !bid.isUserBid) ?? [];
  const userBid = activeMarket?.bids?.find((bid: any) => bid.isUserBid);
  const userBidActive = userBid?.status === 'active';
  const userBidAccepted = userBid?.status === 'accepted';
  const userBidRejected = userBid && !userBidActive && !userBidAccepted;
  const acceptedByOther = resolvedMarket?.bids?.find((bid: any) => bid.status === 'accepted' && !bid.isUserBid);
  const allBidsForStrength = [
    ...(market?.bids?.filter((bid: any) => bid.status === 'active') ?? []),
    ...(resolvedMarket?.bids?.filter((bid: any) => bid.status === 'accepted' || bid.isUserBid) ?? []),
  ];
  const rawScores = new Map(allBidsForStrength.map((bid: any) => [bid.id, computeOfferStrength(bid, player, state)]));
  const maxRaw = Math.max(...rawScores.values(), 1);
  const normalizedPct = (bid: any) => Math.round(((rawScores.get(bid.id) ?? 0) / maxRaw) * 100);
  const decisionDaysOut = (() => {
    if (!market) return 0;
    const rawDays = Math.max(0, market.decidesOnDay - (state.day ?? 0));
    if (!state.date || !isInMoratorium(state.date, leagueStats?.year ?? new Date().getFullYear(), leagueStats as any, state.schedule as any)) {
      return rawDays;
    }
    const today = parseGameDate(state.date);
    const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(state.date, leagueStats as any, state.schedule as any);
    const moratoriumDays = Math.max(0, Math.ceil((moratoriumEnd.getTime() - today.getTime()) / 86_400_000));
    return Math.max(rawDays, moratoriumDays);
  })();
  const decisionLabel = decisionDaysOut === 0
    ? 'Decides today'
    : `${decisionDaysOut} day${decisionDaysOut === 1 ? '' : 's'} remaining`;
  const sortedBids = [...activeBids].sort((a: any, b: any) => b.salaryUSD - a.salaryUSD);

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
    const borderClass = isUser ? 'border-indigo-500/30' : 'border-white/5';
    const bgClass = isUser ? 'bg-indigo-500/5' : 'bg-white/[0.03]';

    return (
      <div key={bid.id} className={`px-3 py-2.5 ${bgClass} rounded-sm border ${borderClass}`}>
        <div className="flex items-center justify-between gap-4">
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
    <div className="space-y-5 sm:space-y-6">
      <div className="bg-white/[0.04] p-4 sm:p-7 rounded-sm border border-white/5">
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-2 italic">
          Active Market Bids
        </h4>
        <p className="text-[9px] text-white/30 uppercase tracking-widest mb-7">
          Competing offers from opposing front offices
        </p>
        {!activeMarket && !userBid ? (
          <p className="text-[11px] text-white/40 italic">No competing bids on record.</p>
        ) : (
          <div className="space-y-4">
            {market && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
                <div className="text-[9px] uppercase tracking-widest text-white/50">Decision window</div>
                <div className="text-[11px] font-bold text-[#FDB927]">
                  {decisionLabel}
                </div>
              </div>
            )}

            {userBidAccepted && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
                <span className="text-emerald-400 text-sm font-black">✓</span>
                <span className="text-[11px] font-black text-emerald-300 uppercase tracking-widest">Offer Accepted</span>
              </div>
            )}
            {userBidRejected && (
              <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-sm">
                <span className="text-rose-400 text-sm font-black">✗</span>
                <span className="text-[11px] font-black text-rose-300 uppercase tracking-widest">
                  Outbid{acceptedByOther ? ` — Player chose ${acceptedByOther.teamName}` : ''}
                </span>
              </div>
            )}

            {userBid && renderBidCard(userBid, -1, true)}
            {sortedBids.map((bid: any, idx: number) => renderBidCard(bid, idx))}

            {activeBids.length === 0 && !userBid && (
              <p className="text-[11px] text-white/40 italic">No competing bids on record.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
