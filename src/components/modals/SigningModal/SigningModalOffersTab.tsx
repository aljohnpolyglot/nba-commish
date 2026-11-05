import type { ReactElement } from 'react';
import type { NBAPlayer } from '../../../types';
import { formatContractTotalUSD, formatContractUSD } from '../../../utils/salaryUtils';
import { formatExternalSalary } from '../../../constants';

interface SigningModalOffersTabProps {
  isPlausibleActiveMarket: (market: any, state: any, player: NBAPlayer) => boolean;
  leagueStats: any;
  pbaIsolated: boolean;
  player: NBAPlayer;
  state: any;
}

function OfferTerms({ bid, pbaIsolated }: { bid: any; pbaIsolated: boolean }) {
  const total = pbaIsolated
    ? formatExternalSalary(bid.salaryUSD * bid.years, 'PBA')
    : formatContractTotalUSD(bid.salaryUSD, bid.years);
  const annual = pbaIsolated
    ? formatExternalSalary(bid.salaryUSD, 'PBA')
    : formatContractUSD(bid.salaryUSD);
  return (
    <div className="text-right">
      <div className="text-base font-black text-[#FDB927]">{total} / {bid.years} yrs</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">{annual} annually</div>
    </div>
  );
}

export default function SigningModalOffersTab({
  isPlausibleActiveMarket,
  pbaIsolated,
  player,
  state,
}: SigningModalOffersTabProps): ReactElement {
  const sourceMarkets = pbaIsolated
    ? state.pbaLocalFreeAgency?.markets ?? []
    : state.faBidding?.markets ?? [];
  const market = sourceMarkets.find((entry: any) =>
    entry.playerId === player.internalId
    && !entry.resolved
    && (pbaIsolated || isPlausibleActiveMarket(entry, state, player))
  );
  const activeBids = market?.bids?.filter((bid: any) => bid.status === 'active') ?? [];
  const userBid = [...(market?.bids ?? [])].reverse().find((bid: any) => bid.isUserBid);
  const competingBids = activeBids.filter((bid: any) => !bid.isUserBid);
  const competingOfferCount = new Set(competingBids.map((bid: any) => bid.teamId)).size;
  const bestOffer = [...competingBids].sort((left: any, right: any) =>
    (right.salaryUSD * right.years) - (left.salaryUSD * left.years)
  )[0];
  const demand = competingOfferCount >= 4 ? 'High' : competingOfferCount >= 2 ? 'Medium' : 'Low';

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="rounded-sm border border-white/5 bg-white/[0.04] p-4 sm:p-7">
        <h4 className="mb-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/50 italic">
          Market Snapshot
        </h4>
        <p className="mb-7 text-[9px] uppercase tracking-widest text-white/30">
          Review your offer and current interest
        </p>

        {userBid ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-4 py-4">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-indigo-300">Your Offer</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-white/35">Submitted and awaiting a decision</div>
              </div>
              <OfferTerms bid={userBid} pbaIsolated={pbaIsolated} />
            </div>
            <div className="rounded-lg border border-white/5 bg-slate-950/40 px-4 py-4">
              <div className="text-xs font-black uppercase tracking-widest text-white/60">Awaiting Decision</div>
              <p className="mt-2 text-xs leading-relaxed text-white/35">
                Advance free agency to receive the player&apos;s response.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white/5 bg-slate-950/40 p-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-white/35">Offers Received</div>
              <div className="mt-2 text-2xl font-black text-blue-400">{competingOfferCount}</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-slate-950/40 p-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-white/35">Demand</div>
              <div className="mt-2 text-2xl font-black text-amber-400">{demand}</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-slate-950/40 p-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-white/35">Best Offer</div>
              <div className="mt-2">{bestOffer ? <OfferTerms bid={bestOffer} pbaIsolated={pbaIsolated} /> : <span className="text-sm font-black text-white/60">No offer yet</span>}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
