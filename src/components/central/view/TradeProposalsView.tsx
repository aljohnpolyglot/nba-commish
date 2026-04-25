/**
 * TradeProposalsView — inbound AI GM trade proposals for the user's team.
 *
 * Uses the shared OfferCard (from TradeFinderView) so layout matches the Trade
 * Finder's visual language. Each proposal = one card showing the AI's offer plus
 * a "For your:" ribbon listing what they want. Manage opens the TradeMachineModal
 * pre-loaded with the deal; Reject marks it rejected. Expired proposals auto-purge
 * on mount / day change.
 */

import React, { useEffect, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { ArrowLeftRight, RefreshCw, Clock, CheckCircle, XCircle, Hourglass } from 'lucide-react';
import { motion } from 'motion/react';
import type { TradeProposal, NBATeam, NBAPlayer, DraftPick } from '../../../types';
import { OfferCard, type FoundOffer, type TradeItem } from './TradeFinderView';
import { buildClassStrengthMap, buildLotterySlotMap } from '../../../services/draft/draftClassStrength';
import { getMaxTradableSeason } from '../../../services/draft/DraftPickGenerator';
import { teamPowerRanks } from '../../../services/trade/tradeFinderEngine';
import { TradeMachineModal } from '../../modals/TradeMachineModal';
import {
  calcOvr2K, calcPot2K, calcPlayerTV, calcPickTV,
  computeLeaguePerAvg,
  type TeamMode, type TVContext,
} from '../../../services/trade/tradeValueEngine';
import {
  getTradeOutlook, effectiveRecord, getCapThresholds,
  getTeamPayrollUSD, getTeamCapProfile, topNAvgK2, resolveManualOutlook,
  type TradeOutlook,
} from '../../../utils/salaryUtils';
import { tradeRoleToTeamMode } from '../../../utils/teamStrategy';

// ── Status tab pill ──────────────────────────────────────────────────────────

const STATUS_META = {
  pending:  { icon: <Hourglass size={11} />,     label: 'Pending',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  accepted: { icon: <CheckCircle size={11} />,   label: 'Accepted',  cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  rejected: { icon: <XCircle size={11} />,       label: 'Rejected',  cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
} as const;

function roleToMode(role: string): TeamMode {
  return tradeRoleToTeamMode(role);
}

// ── Proposal → FoundOffer adapter ────────────────────────────────────────────

function buildOfferFromProposal(
  proposal: TradeProposal,
  players: NBAPlayer[],
  draftPicks: DraftPick[],
  teams: NBATeam[],
  currentYear: number,
  outlook: TradeOutlook,
  theirMode: TeamMode,
  tvContext: TVContext | undefined,
  classStrengthByYear: Map<number, number>,
  lotterySlotByTid: Map<number, number>,
  powerRanks: Map<number, number>,
): FoundOffer {
  const items: TradeItem[] = [];

  for (const pid of proposal.playersOffered) {
    const p = players.find(x => x.internalId === pid);
    if (!p) continue;
    items.push({
      id: p.internalId,
      type: 'player',
      label: p.name,
      val: calcPlayerTV(p, theirMode, currentYear, tvContext),
      player: p,
      ovr: calcOvr2K(p),
      pot: calcPot2K(p, currentYear),
    });
  }

  for (const dpid of proposal.picksOffered) {
    const pk = draftPicks.find(x => x.dpid === dpid);
    if (!pk) continue;
    const owner = teams.find(t => t.id === pk.originalTid);
    const classStrength = classStrengthByYear.get(pk.season) ?? 1.0;
    const actualSlot = pk.round === 1 && pk.season === currentYear
      ? lotterySlotByTid.get(pk.originalTid)
      : undefined;
    // Pick value reflects the original owner's record, not the current holder's.
    const rank = powerRanks.get(pk.originalTid) ?? 15;
    items.push({
      id: String(pk.dpid),
      type: 'pick',
      label: `${pk.season} ${pk.round === 1 ? '1st' : '2nd'} Round${owner ? ` (via ${owner.abbrev})` : ''}`,
      val: calcPickTV(pk.round, rank, teams.length, Math.max(1, pk.season - currentYear), { classStrength, actualSlot }),
      pick: pk,
    });
  }

  return {
    tid: proposal.proposingTeamId,
    items,
    outlook,
    variant: 'match',
  };
}

function buildMyItemsFromProposal(
  proposal: TradeProposal,
  players: NBAPlayer[],
  draftPicks: DraftPick[],
  currentYear: number,
): TradeItem[] {
  const items: TradeItem[] = [];
  for (const pid of proposal.playersRequested) {
    const p = players.find(x => x.internalId === pid);
    if (!p) continue;
    items.push({
      id: p.internalId,
      type: 'player',
      label: p.name,
      val: 0,
      player: p,
      ovr: calcOvr2K(p),
      pot: calcPot2K(p, currentYear),
    });
  }
  for (const dpid of proposal.picksRequested) {
    const pk = draftPicks.find(x => x.dpid === dpid);
    if (!pk) continue;
    items.push({
      id: String(pk.dpid),
      type: 'pick',
      label: `${pk.season} ${pk.round === 1 ? '1st' : '2nd'} Round`,
      val: 0,
      pick: pk,
    });
  }
  return items;
}

// ── Main view ────────────────────────────────────────────────────────────────

export const TradeProposalsView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const { players, teams, draftPicks = [] } = state;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const userTid = (state as any).userTeamId;
  const [statusFilter, setStatusFilter] = React.useState<TradeProposal['status'] | ''>('');
  const [manageProposal, setManageProposal] = React.useState<TradeProposal | null>(null);

  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

  // Auto-purge expired proposals on mount + whenever the sim date changes.
  useEffect(() => {
    const hasExpired = (state.tradeProposals ?? []).some(p => p.status === 'expired');
    if (!hasExpired) return;
    const kept = (state.tradeProposals ?? []).filter(p => p.status !== 'expired');
    dispatchAction({ type: 'UPDATE_STATE', payload: { tradeProposals: kept } } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.date]);

  // Auto-purge stale proposals whose roster no longer matches the trade.
  // After a player in an offered/requested slot is traded (or cut), the proposal
  // becomes impossible — drop it so the user doesn't see a ghost offer.
  useEffect(() => {
    const proposals = state.tradeProposals ?? [];
    if (proposals.length === 0) return;
    const byId = new Map(players.map(p => [p.internalId, p]));
    const stale = proposals.filter(pr => {
      if (pr.status !== 'pending') return false;
      for (const pid of pr.playersOffered) {
        const pl = byId.get(pid);
        if (!pl || pl.tid !== pr.proposingTeamId || pl.status !== 'Active') return true;
      }
      for (const pid of pr.playersRequested) {
        const pl = byId.get(pid);
        if (!pl || pl.tid !== pr.receivingTeamId || pl.status !== 'Active') return true;
      }
      return false;
    });
    if (stale.length === 0) return;
    const staleIds = new Set(stale.map(p => p.id));
    const kept = proposals.filter(p => !staleIds.has(p.id));
    dispatchAction({ type: 'UPDATE_STATE', payload: { tradeProposals: kept } } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  // PER context for in-season TV adjustments inside the card helper.
  const tvContext: TVContext | undefined = useMemo(() => {
    const d = state.date ? new Date(state.date) : null;
    const month = d ? d.getMonth() + 1 : 0;
    const isRegularSeason = (month >= 10 && month <= 12) || (month >= 1 && month <= 4);
    if (!isRegularSeason) return undefined;
    return { leaguePerAvg: computeLeaguePerAvg(players, currentYear), isRegularSeason: true };
  }, [players, currentYear, state.date]);

  // Dynamic pick valuation inputs.
  const classStrengthByYear = useMemo(
    () => buildClassStrengthMap(players, currentYear, currentYear, getMaxTradableSeason(state)),
    [players, currentYear, state.leagueStats?.tradableDraftPickSeasons],
  );
  const lotterySlotByTid = useMemo(
    () => buildLotterySlotMap((state as any).draftLotteryResult),
    [(state as any).draftLotteryResult],
  );
  const powerRanks = useMemo(
    () => teamPowerRanks(teams, currentYear),
    [teams, currentYear],
  );

  // Conference standings for outlook computation (same approach as TradeFinderView).
  const confStandings = useMemo(() => {
    const map = new Map<number, { confRank: number; gbFromLeader: number }>();
    for (const conf of ['East', 'West']) {
      const confTeams = teams.filter(t => t.conference === conf).map(t => ({
        t, rec: effectiveRecord(t, currentYear),
      })).sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
      const leader = confTeams[0];
      const lw = leader?.rec.wins ?? 0;
      const ll = leader?.rec.losses ?? 0;
      confTeams.forEach(({ t, rec }, i) => {
        const gb = Math.max(0, ((lw - rec.wins) + (rec.losses - ll)) / 2);
        map.set(t.id, { confRank: i + 1, gbFromLeader: gb });
      });
    }
    return map;
  }, [teams, currentYear]);

  const teamOutlooks = useMemo(() => {
    const map = new Map<number, TradeOutlook>();
    teams.forEach(t => {
      const manual = resolveManualOutlook(t, state.gameMode, userTid);
      if (manual) { map.set(t.id, manual); return; }
      const payroll = getTeamPayrollUSD(players, t.id);
      const standings = confStandings.get(t.id);
      const expiring = players.filter(p => p.tid === t.id && (p.contract?.exp ?? 0) <= currentYear).length;
      const rec = effectiveRecord(t, currentYear);
      const starAvg = topNAvgK2(players, t.id, 3);
      map.set(t.id, getTradeOutlook(payroll, rec.wins, rec.losses, expiring, thresholds, standings?.confRank, standings?.gbFromLeader, starAvg));
    });
    return map;
  }, [teams, players, thresholds, confStandings, currentYear, state.gameMode, userTid]);

  const capSpaces = useMemo(() => {
    const map = new Map<number, number>();
    teams.forEach(t => {
      const profile = getTeamCapProfile(players, t.id, (t as any).wins ?? 0, (t as any).losses ?? 0, thresholds);
      map.set(t.id, profile.capSpaceUSD / 1000);
    });
    return map;
  }, [teams, players, thresholds]);

  // Only show proposals that target the user's team. Ignore AI-vs-AI historical trades.
  const proposals: TradeProposal[] = useMemo(() =>
    (state.tradeProposals ?? []).filter(p => p.receivingTeamId === userTid && !p.isAIvsAI && p.status !== 'expired'),
  [state.tradeProposals, userTid]);

  const filtered = statusFilter ? proposals.filter(p => p.status === statusFilter) : proposals;

  const counts = {
    pending:  proposals.filter(p => p.status === 'pending').length,
    accepted: proposals.filter(p => p.status === 'accepted').length,
    rejected: proposals.filter(p => p.status === 'rejected').length,
  };

  const handleReject = (proposal: TradeProposal) => {
    const next = (state.tradeProposals ?? []).map(p =>
      p.id === proposal.id ? { ...p, status: 'rejected' as const } : p
    );
    dispatchAction({ type: 'UPDATE_STATE', payload: { tradeProposals: next } } as any);
  };

  const handleExecute = (payload: any) => {
    dispatchAction({ type: 'EXECUTIVE_TRADE', payload } as any);
    if (manageProposal) {
      const next = (state.tradeProposals ?? []).map(p =>
        p.id === manageProposal.id ? { ...p, status: 'accepted' as const } : p
      );
      dispatchAction({ type: 'UPDATE_STATE', payload: { tradeProposals: next } } as any);
    }
    setManageProposal(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#0f172a] text-slate-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/30 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              <ArrowLeftRight className="text-indigo-500" size={22} />
              Trade Proposals
            </h2>
            <p className="text-slate-500 text-[11px] font-medium mt-0.5">
              AI GMs evaluate your target list, untouchables, and block every day. Expired offers auto-purge.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <RefreshCw size={12} />
            <span>5 fresh offers per day · until trade deadline</span>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {[
            ['',        'All',       proposals.length],
            ['pending', 'Pending',   counts.pending],
            ['accepted','Accepted',  counts.accepted],
            ['rejected','Rejected',  counts.rejected],
          ].map(([val, label, count]) => (
            <button
              key={val as string}
              onClick={() => setStatusFilter(val as any)}
              className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${
                statusFilter === val
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-white/3 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
              }`}
            >
              {label as string} <span className="opacity-60 ml-1">{count as number}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(proposal => {
              const theirOutlook = teamOutlooks.get(proposal.proposingTeamId) ?? {
                role: 'neutral', label: 'Neutral', color: 'text-slate-400',
                bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: '',
              } as TradeOutlook;
              const theirMode = roleToMode(theirOutlook.role);
              const offer = buildOfferFromProposal(
                proposal, players, draftPicks, teams, currentYear,
                theirOutlook, theirMode, tvContext,
                classStrengthByYear, lotterySlotByTid, powerRanks,
              );
              const myItems = buildMyItemsFromProposal(proposal, players, draftPicks, currentYear);
              const team = teams.find(t => t.id === proposal.proposingTeamId);
              const isPending = proposal.status === 'pending';

              return (
                <motion.div
                  key={proposal.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative"
                >
                  {/* Status ribbon for non-pending */}
                  {!isPending && (
                    <div className={`absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${STATUS_META[proposal.status as keyof typeof STATUS_META]?.cls ?? ''}`}>
                      {STATUS_META[proposal.status as keyof typeof STATUS_META]?.icon}
                      {STATUS_META[proposal.status as keyof typeof STATUS_META]?.label}
                    </div>
                  )}
                  <OfferCard
                    offer={offer}
                    myItems={myItems}
                    team={team}
                    teams={teams}
                    currentYear={currentYear}
                    dateStr={state.date ?? ''}
                    capSpaceK={capSpaces.get(proposal.proposingTeamId)}
                    showAsk
                    onManage={() => setManageProposal(proposal)}
                    onReject={isPending ? () => handleReject(proposal) : undefined}
                  />
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4">
              <ArrowLeftRight size={28} />
            </div>
            <p className="text-sm font-bold">No inbound proposals.</p>
            <p className="text-xs mt-1 text-slate-700">
              Add players to your Trading Block in Team Office — AI GMs will start offering deals tomorrow.
            </p>
          </div>
        )}
      </div>

      {/* Manage modal — TradeMachineModal pre-loaded. User is Team A. */}
      {manageProposal && (
        <TradeMachineModal
          onClose={() => setManageProposal(null)}
          onConfirm={handleExecute}
          initialTeamAId={manageProposal.receivingTeamId}
          initialTeamBId={manageProposal.proposingTeamId}
          initialTeamAPlayerIds={manageProposal.playersRequested}
          initialTeamBPlayerIds={manageProposal.playersOffered}
          initialTeamAPickDpids={manageProposal.picksRequested}
          initialTeamBPickDpids={manageProposal.picksOffered}
        />
      )}
    </div>
  );
};
