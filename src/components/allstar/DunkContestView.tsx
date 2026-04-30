import React from 'react';
import { Zap, Trophy, Star } from 'lucide-react';
import { format } from 'date-fns';
import { useGame } from '../../store/GameContext';
import { getAllStarWeekendDates } from '../../services/allStar/AllStarWeekendOrchestrator';
import { getPlayerImage } from '../central/view/bioCache';
import { calcDunkOdds } from '../../utils/allStarOdds';
import { DUNK_MOVES } from '../../services/allStar/dunkMoves';

interface DunkContestViewProps {
  allStar: any;
  players: any[];
  ownTid?: number | null;
}

export const DunkContestView: React.FC<DunkContestViewProps> = ({ allStar, players, ownTid }) => {
  const { state } = useGame();
  const teams = state.teams;
  const dates = getAllStarWeekendDates(state.leagueStats.year);

  const dunkContestContestants = allStar.dunkContestContestants ?? [];
  const dunkContestResult = allStar.dunkContest;

  const isAnnounced =
    allStar.weekendComplete ||
    !!dunkContestResult ||
    dunkContestContestants.length > 0;

  if (!isAnnounced) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
          <Zap className="w-8 h-8 text-zinc-600" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Slam Dunk Contest</h3>
        <p className="text-sm text-zinc-500">
          The participants will be announced on {format(dates.dunkContestAnnounced, 'MMM d')}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* PRE-WEEKEND — contestants announced, contest not run yet */}
      {!dunkContestResult && dunkContestContestants.length > 0 && (
        <div>
          <div className="text-center mb-8">
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-1">
              Saturday · All-Star Weekend
            </p>
            <h2 className="text-3xl font-black italic tracking-tighter text-white">SLAM DUNK CONTEST</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {dunkContestContestants.map((contestant: any) => {
              const player = players.find(p => p.internalId === (contestant.internalId || contestant.playerId)) || contestant;
              if (!player || !player.name) return null;

              const wins = player.awards?.filter((a: any) => a.type === 'Slam Dunk Contest Winner').length ?? 0;
              const isOwn = ownTid !== null && ownTid !== undefined && player?.tid === ownTid;

              // Vegas odds — relative to field using same composite as sim (dnk/jmp/spd)
              const fullContestants = dunkContestContestants
                .map((c: any) => players.find(pl => pl.internalId === (c.internalId || c.playerId)) || c)
                .filter((p: any) => p && p.name);
              const odds = calcDunkOdds(fullContestants, player);
              const isFavorite = !odds.startsWith('+');

              const portraitSrc = getPlayerImage(player);

              return (
                <div key={contestant.internalId || contestant.playerId}
                  className={`rounded-2xl p-4 flex flex-col items-center text-center border ${
                    isOwn
                      ? 'bg-indigo-500/10 border-indigo-500/40'
                      : 'bg-zinc-900 border-white/10'
                  }`}>

                  {/* Portrait */}
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 mb-3 border-2 border-white/10">
                    {portraitSrc ? (
                      <img
                        src={portraitSrc}
                        alt={player.name}
                        className="w-full h-full object-cover object-top"
                        onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name.split(' ').map((n: string)=>n[0]).join(''))}&background=27272a&color=fff&size=160`; }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 font-black text-lg">
                        {player.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <p className="text-sm font-black uppercase tracking-tight text-white mb-1">
                    {player.name}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-3">
                    {player.pos} · {allStar.roster?.find((r: any) => r.playerId === player.internalId) 
                      ? teams.find(t => t.id === player.tid)?.abbrev ?? '' 
                      : teams.find(t => t.id === player.tid)?.abbrev ?? ''}
                  </p>

                  {/* Vegas odds */}
                  <div className="mb-3">
                    <p className="text-[9px] font-bold tracking-widest text-zinc-600 uppercase mb-1">TO WIN</p>
                    <p className={`text-3xl font-black font-mono ${isFavorite ? 'text-red-400' : 'text-green-400'}`}>
                      {odds}
                    </p>
                  </div>

                  {/* Past wins — trophy icons only */}
                  {wins > 0 && (
                    <div className="flex gap-1 justify-center">
                      {Array.from({ length: wins }).map((_, i) => (
                        <Trophy key={i} className="w-3 h-3 text-yellow-500" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* POST-WEEKEND — results exist */}
      {dunkContestResult && (
        <div>
          {/* Winner hero */}
          {(() => {
            if (!dunkContestResult || !Array.isArray(dunkContestResult.round1)) {
              return (
                <div className="text-center py-12 text-zinc-500">
                  <p className="text-sm">Results unavailable.</p>
                </div>
              );
            }
            const winner = players.find(p => p.internalId === dunkContestResult.winnerId)
              || players.find(p => p.name === dunkContestResult.winnerName);
            if (!winner) {
              // Fallback: just show winner name text without photo
              return (
                <div className="flex flex-col items-center text-center mb-10">
                  <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-yellow-500 bg-zinc-800 flex items-center justify-center mb-4">
                    <Trophy className="w-12 h-12 text-yellow-500" />
                  </div>
                  <h2 className="text-3xl font-black italic tracking-tighter mt-3 text-white">{dunkContestResult.winnerName}</h2>
                  <p className="text-xs text-zinc-500 mt-1">Slam Dunk Contest Champion</p>
                </div>
              );
            }
            const winnerPortrait = getPlayerImage(winner);
            return (
              <div className="flex flex-col items-center text-center mb-10">
                <div className="relative mb-4">
                  <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.3)]">
                    {winnerPortrait ? (
                      <img
                        src={winnerPortrait}
                        alt={winner.name}
                        className="w-full h-full object-cover object-top"
                        onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(winner.name.split(' ').map((n: string)=>n[0]).join(''))}&background=27272a&color=fff&size=224`; }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-black text-2xl">
                        {winner.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[9px] font-black px-3 py-0.5 rounded-full whitespace-nowrap">
                    CHAMPION
                  </div>
                </div>
                <h2 className="text-3xl font-black italic tracking-tighter mt-3 text-white">{winner.name}</h2>
                <p className="text-xs text-zinc-500 mt-1 mb-6">Slam Dunk Contest Champion</p>
                

                {dunkContestResult.mvpDunk && (
                  <div className="mt-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2 max-w-sm">
                    <p className="text-[9px] font-bold tracking-widest text-yellow-600 uppercase mb-1">Dunk of the Night</p>
                    <p className="text-sm text-yellow-300 font-medium">
                      {DUNK_MOVES.find(m => m.id === dunkContestResult.mvpDunk)?.displayName ?? dunkContestResult.mvpDunk}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Results table — Wikipedia style */}
          {dunkContestResult && Array.isArray(dunkContestResult.round1) && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-800/40">
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Official Results</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-800 bg-black/20">
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Player</th>
                      <th className="px-4 py-3 text-center">R1 D1</th>
                      <th className="px-4 py-3 text-center">R1 D2</th>
                      <th className="px-4 py-3 text-center bg-zinc-800/30">R1 Total</th>
                      <th className="px-4 py-3 text-center">Finals D1</th>
                      <th className="px-4 py-3 text-center">Finals D2</th>
                      <th className="px-4 py-3 text-center bg-zinc-800/30">Finals Total</th>
                      <th className="px-4 py-3 text-center">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {(dunkContestResult.round1 ?? [])
                      .sort((a: any, b: any) => (b.total ?? b.totalScore ?? 0) - (a.total ?? a.totalScore ?? 0))
                      .map((r1: any, i: number) => {
                        // Match by any available name/id field (handles old and new save formats)
                        const r1Name = r1.playerName || r1.playerId;
                        const player = players.find(p => p.internalId === r1.playerId) || players.find(p => p.name === r1Name);
                        const finalsRow = (dunkContestResult.round2 ?? []).find((r: any) =>
                          (r.playerName && r.playerName === r1Name) ||
                          (r.playerId && r.playerId === r1Name) ||
                          (r.playerId && r.playerId === r1.playerId)
                        );
                        const isWinner = dunkContestResult.winnerName === r1Name || dunkContestResult.winnerId === r1Name || dunkContestResult.winnerId === r1.playerId;
                        const isFinalist = !!finalsRow;

                        return (
                          <tr key={r1.playerId}
                            className={`transition-colors hover:bg-white/5 ${isWinner ? 'bg-yellow-500/5' : ''}`}>
                            <td className="px-4 py-3 text-zinc-500 text-sm font-mono">
                              {isWinner ? '🏆' : i + 1}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {player && getPlayerImage(player) ? (
                                  <img
                                    src={getPlayerImage(player)}
                                    className="w-8 h-8 rounded-full object-cover object-top bg-zinc-800"
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    alt=""
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-500">
                                    {player?.name?.split(' ').map((n: string) => n[0]).join('') ?? '?'}
                                  </div>
                                )}
                                <div className="text-left">
                                  <p className={`text-sm font-bold ${isWinner ? 'text-yellow-400' : 'text-white'}`}>
                                    {r1.playerName}
                                  </p>
                                  <p className="text-[10px] text-zinc-600">
                                    {teams.find(t => t.id === player?.tid)?.abbrev}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-zinc-400 text-sm">
                              {r1.dunks?.[0]?.score ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-zinc-400 text-sm">
                              {r1.dunks?.[1]?.score ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-center font-black text-white bg-zinc-800/20">
                              {r1.total ?? r1.totalScore ?? 0}
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-sm">
                              {isFinalist
                                ? <span className={isWinner ? 'text-yellow-400 font-bold' : 'text-zinc-400'}>
                                    {finalsRow.dunks?.[0]?.score ?? '—'}
                                  </span>
                                : <span className="text-zinc-700">—</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-sm">
                              {isFinalist
                                ? <span className={isWinner ? 'text-yellow-400 font-bold' : 'text-zinc-400'}>
                                    {finalsRow.dunks?.[1]?.score ?? '—'}
                                  </span>
                                : <span className="text-zinc-700">—</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-center font-black bg-zinc-800/20">
                              {isFinalist
                                ? <span className={isWinner ? 'text-yellow-400 text-lg' : 'text-white'}>
                                    {finalsRow.total ?? finalsRow.totalScore ?? 0}
                                  </span>
                                : <span className="text-zinc-700 text-sm font-normal">DNQ</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isWinner ? (
                                <span className="inline-flex items-center gap-1 bg-yellow-500 text-black text-[9px] font-black px-2 py-1 rounded-full">
                                  <Trophy size={9} /> CHAMPION
                                </span>
                              ) : isFinalist ? (
                                <span className="text-[9px] font-bold text-zinc-500 uppercase">Finalist</span>
                              ) : (
                                <span className="text-[9px] font-bold text-zinc-700 uppercase">Eliminated</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
