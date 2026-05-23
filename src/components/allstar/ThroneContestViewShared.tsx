import React from 'react';
import { Crown, Skull, Sparkles } from 'lucide-react';
import { getPlayerImage } from '../central/view/bioCache';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { PlayerPortrait } from '../shared/PlayerPortrait';

export const VoterPie: React.FC = () => (
  <div className="flex items-center justify-center flex-wrap gap-2 mb-6 text-[9px] font-black uppercase tracking-widest">
    <span className="px-2 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">Fan 40%</span>
    <span className="px-2 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">Player 30%</span>
    <span className="px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">Media 20%</span>
    <span className="px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">Coach 10%</span>
  </div>
);

export const HeroHeader: React.FC<{ phaseLabel: string; sub: string }> = ({ phaseLabel, sub }) => (
  <div className="relative overflow-hidden rounded-3xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 via-amber-900/5 to-black px-8 py-8">
    <div className="absolute inset-0 opacity-20 pointer-events-none">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-yellow-500 rounded-full blur-[150px]" />
    </div>
    <div className="relative text-center">
      <div className="flex items-center justify-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-yellow-400" />
        <span className="text-[10px] font-black tracking-[0.4em] text-yellow-400">{phaseLabel}</span>
        <Sparkles className="w-4 h-4 text-yellow-400" />
      </div>
      <h2 className="text-5xl font-black italic tracking-tighter text-white mb-2">THE THRONE</h2>
      <p className="text-sm text-zinc-400 max-w-xl mx-auto">{sub}</p>
    </div>
  </div>
);

export const KingCallout: React.FC<{ king: any; vacated: boolean }> = ({ king, vacated }) => {
  if (!king) return null;
  const kingPortrait = getPlayerImage(king);
  if (vacated) {
    return (
      <div className="rounded-2xl border-2 border-red-500/40 bg-red-950/20 p-6 flex items-center gap-4">
        <Skull className="w-8 h-8 text-red-400 shrink-0" />
        <div>
          <p className="text-[10px] font-black tracking-widest text-red-300 mb-1">THRONE VACATED</p>
          <p className="text-sm text-zinc-300">
            <PlayerNameWithHover player={king}>{king.name}</PlayerNameWithHover> cannot defend.
            The crown is up for grabs — anyone in the field of 16 can claim it.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-yellow-500/40 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-transparent p-5 flex items-center gap-5">
      <div className="relative shrink-0">
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.4)]">
          {kingPortrait ? (
            <img src={kingPortrait} alt={king.name} className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-black">
              {king.name.split(' ').map((name: string) => name[0]).join('')}
            </div>
          )}
        </div>
        <Crown className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-black tracking-[0.3em] text-yellow-400 mb-1">MANDATORY TITLE DEFENSE</p>
        <p className="text-base font-black text-white">
          <PlayerNameWithHover player={king}>{king.name}</PlayerNameWithHover> returns as the #1 seed.
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">Auto-included in the field. Everyone else is gunning for the crown.</p>
      </div>
    </div>
  );
};

const fmtVotes = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const VoteCell: React.FC<{ votes: number; rank: number; tone: string }> = ({ votes, rank, tone }) => (
  <div className="text-right tabular-nums leading-tight">
    <p className={`text-[15px] font-mono font-black ${tone}`}>#{rank}</p>
    <p className="text-[9px] text-zinc-500 font-mono">{fmtVotes(votes)} votes</p>
  </div>
);

export interface VoteRowData {
  playerId: string;
  rank: number;
  composite: number;
  fanVotes: number;
  fanRank: number;
  playerVotes: number;
  playerRank: number;
  mediaVotes: number;
  mediaRank: number;
  coachVotes: number;
  coachRank: number;
}

const compositeRankAvg = (row: { fanRank: number; playerRank: number; mediaRank: number; coachRank: number }) =>
  Math.round((0.4 * row.fanRank + 0.3 * row.playerRank + 0.2 * row.mediaRank + 0.1 * row.coachRank) * 10) / 10;

export const VoteTable: React.FC<{
  rows: VoteRowData[];
  players: any[];
  teams: any[];
  titleDefenderId: string | null;
  ownTid: number | null | undefined;
}> = ({ rows, players, teams, titleDefenderId, ownTid }) => (
  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-[9px] font-black uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
            <th className="px-3 py-3 w-10 text-center">#</th>
            <th className="px-3 py-3">Player</th>
            <th className="px-2 py-3 text-right text-rose-300">Fan</th>
            <th className="px-2 py-3 text-right text-purple-300">Player</th>
            <th className="px-2 py-3 text-right text-cyan-300">Media</th>
            <th className="px-2 py-3 text-right text-yellow-300">Coach</th>
            <th className="px-3 py-3 text-right text-yellow-400" title="Weighted rank average — 40% Fan + 30% Player + 20% Media + 10% Coach. Lower = better.">Avg Rank</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const player = players.find((entry) => entry.internalId === row.playerId);
            if (!player) return null;
            const team = teams.find((entry: any) => entry.id === player.tid);
            const isDefender = row.playerId === titleDefenderId;
            const isOwn = ownTid !== null && ownTid !== undefined && player.tid === ownTid;
            const portrait = getPlayerImage(player);
            return (
              <tr
                key={row.playerId}
                className={`border-b border-zinc-800/60 last:border-b-0 transition-colors hover:bg-zinc-800/30 ${isDefender ? 'bg-yellow-500/5' : isOwn ? 'bg-indigo-500/5' : ''}`}
              >
                <td className="px-3 py-2.5 text-center">
                  <span className={`font-mono font-black text-[12px] ${isDefender ? 'text-yellow-300' : 'text-zinc-400'}`}>{row.rank}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-[180px]">
                    <PlayerPortrait
                      imgUrl={portrait || undefined}
                      teamLogoUrl={(team as any)?.logoUrl}
                      overallRating={player.overallRating}
                      ratings={player.ratings}
                      playerName={player.name}
                      face={(player as any).face}
                      size={36}
                    />
                    <div className="min-w-0">
                      <p className={`text-[12px] font-black truncate ${isDefender ? 'text-yellow-200' : 'text-white'}`}>
                        {isDefender && <Crown size={10} className="inline mr-1 text-yellow-400" />}
                        <PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover>
                      </p>
                      <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">{player.pos} · {team?.abbrev ?? ''}</p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5"><VoteCell votes={row.fanVotes ?? 0} rank={row.fanRank ?? 0} tone="text-rose-200" /></td>
                <td className="px-2 py-2.5"><VoteCell votes={row.playerVotes ?? 0} rank={row.playerRank ?? 0} tone="text-purple-200" /></td>
                <td className="px-2 py-2.5"><VoteCell votes={row.mediaVotes ?? 0} rank={row.mediaRank ?? 0} tone="text-cyan-200" /></td>
                <td className="px-2 py-2.5"><VoteCell votes={row.coachVotes ?? 0} rank={row.coachRank ?? 0} tone="text-yellow-200" /></td>
                <td className="px-3 py-2.5 text-right">
                  <p className="text-[15px] font-mono font-black text-white tabular-nums">{compositeRankAvg(row)}</p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);
