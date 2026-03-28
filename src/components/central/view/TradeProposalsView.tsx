import React, { useEffect, useState } from 'react';
import { useGame } from '../../../store/GameContext';
import { ArrowLeftRight, Clock, CheckCircle, XCircle, Hourglass, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import type { TradeProposal, NBAPlayer } from '../../../types';
import { getStaffData } from '../../../services/staffService';
import { convertTo2KRating } from '../../../utils/helpers';

// ── Status pill ───────────────────────────────────────────────────────────────

const StatusPill: React.FC<{ status: TradeProposal['status'] }> = ({ status }) => {
  const map = {
    pending:  { icon: <Hourglass size={11} />,     label: 'Pending',  cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    accepted: { icon: <CheckCircle size={11} />,   label: 'Accepted', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    rejected: { icon: <XCircle size={11} />,       label: 'Rejected', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    expired:  { icon: <Clock size={11} />,         label: 'Expired',  cls: 'bg-slate-700 text-slate-500 border-slate-600' },
  } as const;
  const { icon, label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${cls}`}>
      {icon}{label}
    </span>
  );
};

// ── Asset chip ────────────────────────────────────────────────────────────────

const PlayerChip: React.FC<{ player: NBAPlayer }> = ({ player }) => {
  const rating = convertTo2KRating(player.overallRating ?? 60);
  return (
    <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-lg px-2.5 py-1.5">
      <div className="w-7 h-7 rounded-full bg-slate-800 overflow-hidden flex-shrink-0">
        <img src={player.imgURL} alt={player.name} className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=334155&color=fff`; }} />
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-xs font-bold text-white truncate max-w-[110px]">{player.name}</span>
        <span className="text-[10px] text-slate-500 font-bold">{player.pos}</span>
      </div>
      <span className={`text-xs font-black font-mono ml-1 ${rating >= 90 ? 'text-amber-400' : rating >= 80 ? 'text-emerald-400' : 'text-slate-400'}`}>{rating}</span>
    </div>
  );
};

// ── Proposal card ─────────────────────────────────────────────────────────────

const ProposalCard: React.FC<{
  proposal: TradeProposal;
  gmPortrait: string | undefined;
  teamAName: string;
  teamBName: string;
  teamALogo: string | undefined;
  teamBLogo: string | undefined;
  offeredPlayers: NBAPlayer[];
  requestedPlayers: NBAPlayer[];
  index: number;
}> = ({ proposal, gmPortrait, teamAName, teamBName, teamALogo, teamBLogo, offeredPlayers, requestedPlayers, index }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.3 }}
    className="bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition-all"
  >
    {/* Header row */}
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        {/* GM portrait */}
        <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-white/10 flex-shrink-0">
          {gmPortrait ? (
            <img src={gmPortrait} alt={proposal.proposingGMName} className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(proposal.proposingGMName)}&background=1e293b&color=94a3b8`; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-black">
              {proposal.proposingGMName.charAt(0)}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-black text-white">{proposal.proposingGMName}</p>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">GM · {teamAName}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <StatusPill status={proposal.status} />
        <div className="flex items-center gap-1.5 text-slate-600 text-[10px]">
          <Clock size={11} />
          <span>{proposal.proposedDate}</span>
        </div>
      </div>
    </div>

    {/* Trade body */}
    <div className="flex gap-3 items-stretch">
      {/* Team A sends */}
      <div className="flex-1 bg-black/20 rounded-xl p-3 border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          {teamALogo && <img src={teamALogo} alt={teamAName} className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />}
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {teamAName} sends
          </span>
        </div>
        <div className="space-y-1.5">
          {offeredPlayers.length > 0
            ? offeredPlayers.map(p => <PlayerChip key={p.internalId} player={p} />)
            : <span className="text-[10px] text-slate-600 italic">No players</span>}
          {proposal.picksOffered.length > 0 && (
            <div className="text-[10px] text-indigo-400 font-bold mt-1">
              + {proposal.picksOffered.length} draft pick{proposal.picksOffered.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* VS divider */}
      <div className="flex items-center justify-center px-1 shrink-0">
        <ArrowLeftRight size={16} className="text-slate-700" />
      </div>

      {/* Team B sends */}
      <div className="flex-1 bg-black/20 rounded-xl p-3 border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          {teamBLogo && <img src={teamBLogo} alt={teamBName} className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />}
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {teamBName} sends
          </span>
        </div>
        <div className="space-y-1.5">
          {requestedPlayers.length > 0
            ? requestedPlayers.map(p => <PlayerChip key={p.internalId} player={p} />)
            : <span className="text-[10px] text-slate-600 italic">No players</span>}
          {proposal.picksRequested.length > 0 && (
            <div className="text-[10px] text-indigo-400 font-bold mt-1">
              + {proposal.picksRequested.length} draft pick{proposal.picksRequested.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Trade text */}
    {proposal.tradeText && (
      <p className="mt-3 text-[11px] text-slate-500 leading-relaxed border-t border-white/5 pt-3">
        {proposal.tradeText}
      </p>
    )}
  </motion.div>
);

// ── Main view ─────────────────────────────────────────────────────────────────

export const TradeProposalsView: React.FC = () => {
  const { state } = useGame();

  const proposals: TradeProposal[] = state.tradeProposals ?? [];

  // Staff portraits keyed by GM name
  const [gmPortraits, setGmPortraits] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<TradeProposal['status'] | ''>('');

  useEffect(() => {
    const teamNameMap = new Map(state.teams.map(t => [t.name.toLowerCase(), t]));
    getStaffData(state.players, teamNameMap).then(staff => {
      const map: Record<string, string> = {};
      (staff.gms ?? []).forEach((gm: any) => {
        if (gm.name && gm.playerPortraitUrl) map[gm.name] = gm.playerPortraitUrl;
      });
      setGmPortraits(map);
    });
  }, []);  // intentionally run once — staff data is stable per session

  const filtered = statusFilter
    ? proposals.filter(p => p.status === statusFilter)
    : proposals;

  const counts = {
    pending:  proposals.filter(p => p.status === 'pending').length,
    accepted: proposals.filter(p => p.status === 'accepted').length,
    rejected: proposals.filter(p => p.status === 'rejected').length,
    expired:  proposals.filter(p => p.status === 'expired').length,
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="p-8 border-b border-slate-800 bg-slate-900/50 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <ArrowLeftRight className="text-indigo-500" size={32} />
              Trade Proposals
            </h2>
            <p className="text-slate-400 mt-1">
              AI GM trade activity across the league. All deals are logged here as they happen.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <RefreshCw size={12} />
            <span>Live · Updates each day</span>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 mt-5 flex-wrap">
          {([['', 'All', proposals.length], ['pending', 'Pending', counts.pending], ['accepted', 'Accepted', counts.accepted], ['rejected', 'Rejected', counts.rejected], ['expired', 'Expired', counts.expired]] as const).map(([val, label, count]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val as any)}
              className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${
                statusFilter === val
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-white/3 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
              }`}
            >
              {label} <span className="opacity-60 ml-1">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-4">
          {filtered.length > 0 ? (
            filtered.map((proposal, idx) => {
              const teamA = state.teams.find(t => t.id === proposal.proposingTeamId);
              const teamB = state.teams.find(t => t.id === proposal.receivingTeamId);
              const offeredPlayers  = proposal.playersOffered.map(id => state.players.find(p => p.internalId === id)).filter(Boolean) as any[];
              const requestedPlayers = proposal.playersRequested.map(id => state.players.find(p => p.internalId === id)).filter(Boolean) as any[];
              return (
                <ProposalCard
                  key={proposal.id}
                  index={idx}
                  proposal={proposal}
                  gmPortrait={gmPortraits[proposal.proposingGMName]}
                  teamAName={teamA?.name ?? 'Unknown'}
                  teamBName={teamB?.name ?? 'Unknown'}
                  teamALogo={teamA?.logoUrl}
                  teamBLogo={teamB?.logoUrl}
                  offeredPlayers={offeredPlayers}
                  requestedPlayers={requestedPlayers}
                />
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-slate-600">
              <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4">
                <ArrowLeftRight size={28} />
              </div>
              <p className="text-lg font-bold">No trade proposals yet.</p>
              <p className="text-sm mt-1">
                AI GMs will start proposing deals once the season is underway.
              </p>
              <p className="text-xs mt-1 text-slate-700">
                Enable AI Trades in League Settings to activate.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
