import React from 'react';
import { BarChart2, CheckCircle, TrendingDown, Trophy } from 'lucide-react';
import { formatCurrency } from '../../../utils/helpers';
import { StatusBadge } from './sportsbook/SportsbookShared';
import { decimalToAmerican } from './sportsbook/sportsbookTypes';
import { getPlayerImage } from '../../../utils/playerImage';
import { getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { PlayerPortrait } from '../../shared/PlayerPortrait';

export const SportsbookMyBetsTab: React.FC<{
  state: any;
  betStats: any;
  myBetsPage: number;
  onPageChange: React.Dispatch<React.SetStateAction<number>>;
  onSelectBoxScore: (boxScore: any) => void;
  onExplore: () => void;
}> = ({ state, betStats, myBetsPage, onPageChange, onSelectBoxScore, onExplore }) => {
  const summaryStats = [
    { label: 'Pending', value: betStats.pending, frame: 'border-amber-500/20', valueClass: 'text-amber-400' },
    { label: 'Won', value: betStats.won, frame: 'border-emerald-500/20', valueClass: 'text-emerald-400' },
    { label: 'Lost', value: betStats.lost, frame: 'border-rose-500/20', valueClass: 'text-rose-400' },
    { label: 'Win Rate', value: `${betStats.winRate}%`, frame: 'border-indigo-500/20', valueClass: 'text-indigo-400' },
  ];

  if ((state.bets?.length ?? 0) === 0) {
    return (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {summaryStats.map(stat => (
            <div key={stat.label} className={`bg-[#121e2d] border rounded-xl p-3 text-center ${stat.frame}`}>
              <p className={`text-xl sm:text-2xl font-black font-mono ${stat.valueClass}`}>{stat.value}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-800/70 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08),transparent_45%)] px-5 py-12 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 shadow-[0_0_40px_rgba(16,185,129,0.12)]">
            <Trophy className="h-9 w-9 text-emerald-300" />
          </div>
          <h3 className="mt-6 text-2xl font-black text-white">No bets yet</h3>
          <p className="mt-2 max-w-md text-sm text-slate-500">Build a slip from today's matchups or player markets, then track every result here.</p>
          <div className="mt-9 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
            {[
              { Icon: BarChart2, title: 'Build your slip', body: 'Browse odds and add selections.' },
              { Icon: CheckCircle, title: 'Place your bet', body: 'Confirm your wager with confidence.' },
              { Icon: Trophy, title: 'Track your action', body: 'Follow pending and settled results.' },
            ].map(({ Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                <Icon className="mx-auto h-5 w-5 text-emerald-300" />
                <p className="mt-3 text-sm font-black text-slate-200">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
              </div>
            ))}
          </div>
          <button type="button" onClick={onExplore} className="mt-8 min-h-11 w-full max-w-sm rounded-xl border border-emerald-400/60 px-5 text-xs font-black uppercase tracking-[0.16em] text-emerald-300 transition hover:bg-emerald-500/10 hover:text-white">
            Explore Today's Lines
          </button>
        </div>
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
    const team = (state.teams as any[]).find((entry: any) => entry.id === tid);
    return team ? getResolvedTeamLogoUrl(team, state.leagueStats?.year) : null;
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {summaryStats.map(stat => (
          <div key={stat.label} className={`bg-[#1e232c] border rounded-xl p-3 text-center ${stat.frame}`}>
            <p className={`text-xl sm:text-2xl font-black font-mono ${stat.valueClass}`}>{stat.value}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {[
          { label: 'Biggest Win', value: betStats.biggestWin !== null ? `+${formatCurrency(betStats.biggestWin, false)}` : '--', valueClass: 'text-emerald-400' },
          { label: 'Biggest Loss', value: betStats.biggestLoss !== null ? `-${formatCurrency(betStats.biggestLoss, false)}` : '--', valueClass: 'text-rose-400' },
          { label: 'Best Parlay', value: betStats.bestParlay !== null ? decimalToAmerican(betStats.bestParlay) : '--', valueClass: 'text-indigo-400' },
          { label: 'Total Wagered', value: formatCurrency(betStats.totalWagered, false), valueClass: 'text-white' },
          { label: 'Best Streak', value: betStats.longestStreak > 0 ? `${betStats.longestStreak}W` : '--', valueClass: 'text-amber-400' },
        ].map(stat => (
          <div key={stat.label} className="bg-[#1e232c] border border-slate-700/30 rounded-xl p-3 text-center">
            <p className={`text-base sm:text-lg font-black font-mono ${stat.valueClass}`}>{stat.value}</p>
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
                if (player) return <PlayerPortrait imgUrl={getPlayerImage(player)} face={player.face} playerName={player.name} size={40} />;
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
                  <PlayerPortrait imgUrl={getPlayerImage(propPlayer)} face={propPlayer.face} playerName={propPlayer.name} size={36} />
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
