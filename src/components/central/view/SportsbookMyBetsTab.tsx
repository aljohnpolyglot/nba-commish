import React from 'react';
import { TrendingDown, Trophy } from 'lucide-react';
import { formatCurrency } from '../../../utils/helpers';
import { EmptyState, StatusBadge } from './sportsbook/SportsbookShared';
import { decimalToAmerican } from './sportsbook/sportsbookTypes';

export const SportsbookMyBetsTab: React.FC<{
  state: any;
  betStats: any;
  myBetsPage: number;
  onPageChange: React.Dispatch<React.SetStateAction<number>>;
  onSelectBoxScore: (boxScore: any) => void;
}> = ({ state, betStats, myBetsPage, onPageChange, onSelectBoxScore }) => {
  if ((state.bets?.length ?? 0) === 0) {
    return (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: 'Pending', value: betStats.pending, color: 'amber' },
            { label: 'Won', value: betStats.won, color: 'emerald' },
            { label: 'Lost', value: betStats.lost, color: 'rose' },
            { label: 'Win Rate', value: `${betStats.winRate}%`, color: 'indigo' },
          ].map(stat => (
            <div key={stat.label} className={`bg-[#1e232c] border rounded-xl p-3 text-center border-${stat.color}-500/20`}>
              <p className={`text-xl sm:text-2xl font-black text-${stat.color}-400 font-mono`}>{stat.value}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
        <EmptyState icon={<Trophy className="w-8 h-8" />} title="No bets yet" body="Place your first bet from the Lines or Props tabs." />
      </>
    );
  }

  const allBets = [...(state.bets ?? [])].reverse();
  const betsPerPage = 20;
  const totalPages = Math.ceil(allBets.length / betsPerPage);
  const pageBets = allBets.slice(myBetsPage * betsPerPage, (myBetsPage + 1) * betsPerPage);
  const biggestLossBet = (state.bets ?? []).reduce((best: any, bet: any) => {
    if (bet.status !== 'lost') return best;
    return !best || bet.wager > best.wager ? bet : best;
  }, null);

  const getBetTeamLogo = (bet: any): string | null => {
    if (!bet.legs?.length) return null;
    const leg = bet.legs[0];
    if (!leg.gameId || leg.playerId) return null;
    const cond = leg.condition ?? '';
    const isHomeBet = cond.startsWith('home');
    const isAwayBet = cond.startsWith('away');
    if (!isHomeBet && !isAwayBet) return null;
    const schedGame = (state.schedule as any[]).find((game: any) => game.gid === leg.gameId);
    const boxScore = (state.boxScores as any[]).find((game: any) => game.gameId === leg.gameId);
    const homeTid = schedGame?.homeTid ?? boxScore?.homeTeamId;
    const awayTid = schedGame?.awayTid ?? boxScore?.awayTeamId;
    const tid = isHomeBet ? homeTid : awayTid;
    if (!tid) return null;
    return (state.teams as any[]).find((team: any) => team.id === tid)?.logoUrl ?? null;
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Pending', value: betStats.pending, color: 'amber' },
          { label: 'Won', value: betStats.won, color: 'emerald' },
          { label: 'Lost', value: betStats.lost, color: 'rose' },
          { label: 'Win Rate', value: `${betStats.winRate}%`, color: 'indigo' },
        ].map(stat => (
          <div key={stat.label} className={`bg-[#1e232c] border rounded-xl p-3 text-center border-${stat.color}-500/20`}>
            <p className={`text-xl sm:text-2xl font-black text-${stat.color}-400 font-mono`}>{stat.value}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {[
          { label: 'Biggest Win', value: betStats.biggestWin !== null ? `+${formatCurrency(betStats.biggestWin, false)}` : '--', color: 'emerald' },
          { label: 'Biggest Loss', value: betStats.biggestLoss !== null ? `-${formatCurrency(betStats.biggestLoss, false)}` : '--', color: 'rose' },
          { label: 'Best Parlay', value: betStats.bestParlay !== null ? decimalToAmerican(betStats.bestParlay) : '--', color: 'indigo' },
          { label: 'Total Wagered', value: formatCurrency(betStats.totalWagered, false), color: 'white' },
          { label: 'Best Streak', value: betStats.longestStreak > 0 ? `${betStats.longestStreak}W` : '--', color: 'amber' },
        ].map(stat => (
          <div key={stat.label} className="bg-[#1e232c] border border-slate-700/30 rounded-xl p-3 text-center">
            <p className={`text-base sm:text-lg font-black text-${stat.color}-400 font-mono`}>{stat.value}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {(betStats.won + betStats.lost) > 0 && (
        <div className="bg-[#1e232c] border border-slate-700/40 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total P&L</span>
            <span className={`text-sm font-black font-mono ${betStats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{betStats.profit >= 0 ? '+' : ''}{formatCurrency(betStats.profit, false)}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${betStats.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, Math.abs(betStats.winRate))}%` }} />
          </div>
        </div>
      )}

      <div className="space-y-2">
        {biggestLossBet && myBetsPage === 0 && (
          <div
            onClick={() => {
              const gameId = biggestLossBet.legs?.[0]?.gameId;
              if (!gameId) return;
              const boxScore = (state.boxScores as any[]).find((game: any) => game.gameId === gameId);
              if (boxScore) onSelectBoxScore(boxScore);
            }}
            className={`bg-rose-950/40 border border-rose-500/40 rounded-xl p-3 sm:p-4 ${biggestLossBet.legs?.[0]?.gameId && (state.boxScores as any[]).some((game: any) => game.gameId === biggestLossBet.legs[0].gameId) ? 'cursor-pointer hover:border-rose-400/60' : ''}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
              <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Biggest Loss</span>
            </div>
            <div className="flex items-start gap-2 sm:gap-3">
              {(() => {
                const propPid = biggestLossBet.legs?.length === 1 ? biggestLossBet.legs[0].playerId : null;
                const player = propPid ? (state.players as any[]).find((p: any) => p.internalId === propPid) : null;
                const teamLogo = getBetTeamLogo(biggestLossBet);
                if (player) return <div className="w-10 h-10 rounded-full bg-slate-700 border border-rose-500/30 overflow-hidden flex-shrink-0 flex items-center justify-center">{player.imgURL ? <img src={player.imgURL} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-[10px] font-bold text-slate-300">{(player.name ?? '??').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span>}</div>;
                if (teamLogo) return <div className="w-10 h-10 rounded-lg bg-slate-800/60 border border-rose-500/30 overflow-hidden flex-shrink-0 flex items-center justify-center p-1"><img src={teamLogo} alt="team" className="w-full h-full object-contain" referrerPolicy="no-referrer" /></div>;
                return null;
              })()}
              <div className="flex-1 min-w-0">
                <div className="space-y-0.5">
                  {biggestLossBet.legs?.map((leg: any, i: number) => <p key={i} className="text-xs sm:text-sm text-rose-200 font-medium">{leg.description}</p>)}
                </div>
                <p className="text-[10px] text-rose-500 font-mono mt-1">{new Date(biggestLossBet.date).toLocaleDateString()}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] text-rose-500 font-mono">Lost</p>
                <p className="text-sm font-black text-rose-400 font-mono">-{formatCurrency(biggestLossBet.wager, false)}</p>
              </div>
            </div>
          </div>
        )}

        {pageBets.map((bet: any) => {
          const propPlayerId = bet.legs?.length === 1 ? bet.legs[0].playerId : null;
          const propPlayer = propPlayerId ? (state.players as any[]).find((p: any) => p.internalId === propPlayerId) : null;
          const teamLogo = getBetTeamLogo(bet);
          const hasBoxScore = !!bet.legs?.[0]?.gameId && (state.boxScores as any[]).some((game: any) => game.gameId === bet.legs[0].gameId);
          return (
            <div
              key={bet.id}
              onClick={() => {
                const gameId = bet.legs?.[0]?.gameId;
                if (!gameId) return;
                const boxScore = (state.boxScores as any[]).find((game: any) => game.gameId === gameId);
                if (boxScore) onSelectBoxScore(boxScore);
              }}
              className={`bg-[#1e232c] rounded-xl border p-3 sm:p-4 transition-colors ${hasBoxScore ? 'cursor-pointer hover:border-slate-500/60' : ''} ${bet.status === 'won' ? 'border-emerald-500/30' : bet.status === 'lost' ? 'border-rose-500/20' : 'border-slate-700/40'}`}
            >
              <div className="flex items-start gap-2 sm:gap-3">
                {propPlayer ? (
                  <div className="w-9 h-9 rounded-full bg-slate-700 border border-slate-600/60 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {propPlayer.imgURL ? <img src={propPlayer.imgURL} alt={propPlayer.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-[10px] font-bold text-slate-300">{(propPlayer.name ?? '??').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span>}
                  </div>
                ) : teamLogo ? (
                  <div className="w-9 h-9 rounded-lg bg-slate-800/60 border border-slate-600/40 overflow-hidden flex-shrink-0 flex items-center justify-center p-1">
                    <img src={teamLogo} alt="team" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                ) : null}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5 flex-wrap">
                    <StatusBadge status={bet.status} />
                    {bet.legs?.length > 1 && <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">{bet.legs.length}-Leg Parlay</span>}
                    <span className="text-[10px] text-slate-600 font-mono">{new Date(bet.date).toLocaleDateString()}</span>
                    {hasBoxScore && bet.status !== 'pending' && <span className="text-[10px] text-slate-600 font-medium">· tap for boxscore</span>}
                  </div>
                  <div className="space-y-0.5">
                    {bet.legs?.map((leg: any, i: number) => <p key={i} className="text-xs sm:text-sm text-slate-300 font-medium">{leg.description}</p>)}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-slate-500 font-mono">Wager</p>
                  <p className="text-xs sm:text-sm font-bold text-white font-mono">{formatCurrency(bet.wager, false)}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">To Win</p>
                  <p className={`text-xs sm:text-sm font-bold font-mono ${bet.status === 'won' ? 'text-emerald-400' : bet.status === 'lost' ? 'text-slate-600 line-through' : 'text-amber-400'}`}>{formatCurrency(bet.potentialPayout - bet.wager, false)}</p>
                </div>
              </div>
            </div>
          );
        })}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button onClick={() => onPageChange(page => Math.max(0, page - 1))} disabled={myBetsPage === 0} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all">← Prev</button>
            <span className="text-[11px] text-slate-500 font-mono">{myBetsPage + 1} / {totalPages}</span>
            <button onClick={() => onPageChange(page => Math.min(totalPages - 1, page + 1))} disabled={myBetsPage >= totalPages - 1} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Next →</button>
          </div>
        )}
      </div>
    </>
  );
};
