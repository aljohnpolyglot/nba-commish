import React from 'react';
import {
  BadgeDollarSign,
  BarChart3,
  Flame,
  MessageSquareText,
  Shield,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import type { NBAPlayer } from '../../types';
import { useGame } from '../../store/GameContext';
import { getDisplayAge } from '../../store/playerRatingStore';
import { getScoutedDisplayOverall, getScoutedDisplayPotential } from '../../utils/scoutingFuzz';
import { computeContractOffer, formatContractTotalUSD, formatContractUSD } from '../../utils/salaryUtils';
import { formatHeight } from '../../utils/helpers';
import { getPlayerImage } from '../central/view/bioCache';
import { MyFace, isRealFaceConfig } from '../shared/MyFace';
import { isPlausibleActiveMarket } from '../../services/freeAgencyBidding';
import { countActiveOfferTeams } from '../../services/freeAgency/freeAgencyDecisionTiming';
import { formatExternalSalary } from '../../constants';
import { normalizeMoodTraits } from '../../utils/mood/moodScore';

interface Props {
  player: NBAPlayer;
  onClose: () => void;
  onContactAgent: () => void;
}

type Importance = 'Not Important' | 'Important' | 'Very Important';

function personality(player: NBAPlayer) {
  const traits = new Set(normalizeMoodTraits(player.moodTraits ?? []));
  const loyalty = traits.has('LOYAL') ? 'High' : traits.has('MERCENARY') ? 'Low' : 'Medium';
  const winning: Importance = traits.has('COMPETITOR')
    ? 'Very Important'
    : traits.has('MERCENARY') || traits.has('DIVA')
      ? 'Important'
      : 'Important';
  const money: Importance = traits.has('MERCENARY')
    ? 'Very Important'
    : traits.has('LOYAL')
      ? 'Not Important'
      : 'Important';
  const fame: Importance = traits.has('FAME') || traits.has('DIVA')
    ? 'Very Important'
    : traits.has('COMPETITOR')
      ? 'Not Important'
      : 'Important';
  return { loyalty, winning, money, fame };
}

function SnapshotRow({
  icon,
  title,
  description,
  value,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="grid gap-3 border-b border-white/5 px-4 py-4 last:border-b-0 sm:grid-cols-[42px_minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
      <div>
        <div className="text-sm font-black uppercase tracking-wide text-slate-200">{title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{description}</div>
      </div>
      <div className="text-left text-lg font-black tabular-nums text-white sm:text-right">{value}</div>
    </div>
  );
}

export const FAOffersModal: React.FC<Props> = ({ player, onClose, onContactAgent }) => {
  const { state } = useGame();
  const year = state.leagueStats?.year ?? new Date().getUTCFullYear();
  const age = getDisplayAge(player, year);
  const overall = getScoutedDisplayOverall(state, player, year);
  const potential = getScoutedDisplayPotential(state, player, year, year);
  const profile = personality(player);
  const market = state.faBidding?.markets?.find(candidate =>
    candidate.playerId === player.internalId
    && isPlausibleActiveMarket(candidate as any, state, player)
  );
  const pbaMarket = state.pbaLocalFreeAgency?.markets?.find(candidate =>
    candidate.playerId === player.internalId && !candidate.resolved
  );
  const activeBids = (market?.bids ?? pbaMarket?.bids ?? []).filter(bid => bid.status === 'active');
  const offerCount = countActiveOfferTeams(activeBids);
  const hasUserBid = !!(market?.bids ?? pbaMarket?.bids)?.some(bid => bid.isUserBid);
  const asking = computeContractOffer(player, state.leagueStats as any, player.moodTraits ?? []);
  const bestOffer = [...activeBids].sort((left, right) =>
    (right.salaryUSD * right.years) - (left.salaryUSD * left.years)
  )[0];
  const demand = offerCount >= 4 ? 'High' : offerCount >= 2 ? 'Medium' : 'Low';
  const image = getPlayerImage(player);
  const face = (player as any).face;
  const pbaIsolated = state.leagueStats?.uiMode === 'pba_isolated';
  const totalMoney = (salaryUSD: number, years: number) => pbaIsolated
    ? formatExternalSalary(salaryUSD * years, 'PBA')
    : formatContractTotalUSD(salaryUSD, years);
  const annualMoney = (salaryUSD: number) => pbaIsolated
    ? formatExternalSalary(salaryUSD, 'PBA')
    : formatContractUSD(salaryUSD);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-2 backdrop-blur-md sm:p-5" onClick={onClose}>
      <div
        className="relative max-h-[calc(100dvh-1rem)] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-700/80 bg-[radial-gradient(circle_at_top_left,rgba(29,78,216,0.24),transparent_36%),linear-gradient(145deg,#07111f,#020712_70%)] shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]"
        onClick={event => event.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">
          <X size={24} />
        </button>

        <div className="grid gap-5 px-5 pb-5 pt-14 sm:px-8 sm:pb-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-end lg:pt-8">
          <div className="mx-auto h-52 w-52 overflow-hidden rounded-2xl bg-slate-900/70 lg:h-64 lg:w-full">
            {image ? (
              <img src={image} alt={player.name} className="h-full w-full object-cover object-top" referrerPolicy="no-referrer" />
            ) : isRealFaceConfig(face) ? (
              <MyFace face={face} style={{ width: '100%', height: '100%' }} />
            ) : (
              <div className="flex h-full items-center justify-center text-6xl font-black text-slate-700">{player.name.charAt(0)}</div>
            )}
          </div>

          <div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="pr-8 text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">{player.name}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold uppercase text-slate-400">
                  <span className="rounded bg-blue-700 px-3 py-1 text-white">{player.pos}</span>
                  <span>{player.hgt ? formatHeight(player.hgt) : '—'}</span>
                  <span>·</span>
                  <span>{player.weight ? `${player.weight} lbs` : '—'}</span>
                  <span>·</span>
                  <span>{age} years old</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-5">
                <div><div className="text-xs font-black uppercase tracking-widest text-slate-500">OVR</div><div className="text-5xl font-black text-white">{overall}</div></div>
                <div className="border-l border-slate-700 pl-5"><div className="text-xs font-black uppercase tracking-widest text-slate-500">Potential</div><div className="text-5xl font-black text-amber-400">{potential}</div></div>
              </div>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-3 text-xs font-black uppercase text-slate-300"><Shield className="mr-2 inline text-violet-400" size={17} />Loyalty: <span className="text-violet-300">{profile.loyalty}</span></div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-xs font-black uppercase text-slate-300"><Trophy className="mr-2 inline text-emerald-400" size={17} />Play for Winner: <span className="text-emerald-300">{profile.winning}</span></div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs font-black uppercase text-slate-300"><BadgeDollarSign className="mr-2 inline text-amber-400" size={17} />Money: <span className="text-amber-300">{profile.money}</span></div>
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-3 text-xs font-black uppercase text-slate-300"><BarChart3 className="mr-2 inline text-sky-400" size={17} />Fame: <span className="text-sky-300">{profile.fame}</span></div>
            </div>
          </div>
        </div>

        <section className="mx-3 mb-3 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/45 sm:mx-8 sm:mb-8">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
            <BarChart3 className="text-blue-400" />
            <h3 className="text-xl font-black uppercase tracking-wide text-white">Market Snapshot</h3>
          </div>
          <SnapshotRow icon={<Users size={24} />} title="Offers Received" description="Number of teams that have made an offer." tone="bg-blue-500/15 text-blue-400" value={offerCount} />
          <SnapshotRow icon={<Flame size={24} />} title="Demand" description="Interest level around the league." tone="bg-orange-500/15 text-orange-400" value={<span className={hasUserBid ? 'text-slate-400' : demand === 'High' ? 'text-rose-400' : demand === 'Medium' ? 'text-amber-400' : 'text-slate-300'}>{hasUserBid ? 'Private' : demand}</span>} />
          <SnapshotRow icon={<BadgeDollarSign size={24} />} title="Asking Price" description="Contract the player is seeking." tone="bg-emerald-500/15 text-emerald-400" value={<><div>{totalMoney(asking.salaryUSD, asking.years)} / {asking.years} yrs</div><div className="text-xs font-bold uppercase text-slate-500">{annualMoney(asking.salaryUSD)} annually</div></>} />
          <SnapshotRow icon={<BarChart3 size={24} />} title="Best Offer" description="Best contract currently on the table." tone="bg-emerald-500/15 text-emerald-400" value={hasUserBid ? <span className="text-slate-400">Private</span> : bestOffer ? <><div>{totalMoney(bestOffer.salaryUSD, bestOffer.years)} / {bestOffer.years} yrs</div><div className="text-xs font-bold uppercase text-slate-500">{annualMoney(bestOffer.salaryUSD)} annually</div></> : 'No offer yet'} />
        </section>

        <div className="sticky bottom-0 border-t border-white/10 bg-slate-950/95 p-3 sm:px-8 sm:py-5">
          <button
            type="button"
            onClick={onContactAgent}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-600 px-5 py-4 text-lg font-black uppercase tracking-wide text-white shadow-lg shadow-blue-950/40 hover:from-blue-600 hover:to-indigo-500"
          >
            <MessageSquareText size={26} />
            Contact Agent
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">Start a conversation with {player.name}&apos;s Agent.</p>
        </div>
      </div>
    </div>
  );
};
