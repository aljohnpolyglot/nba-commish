import React from 'react';
import { X, Star, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { NBAPlayer, NBATeam } from '../../../../types';
import { getPlayerHeadshot, getTeamLogo, extractNbaId, extractTeamId } from '../../../../utils/helpers';
import { calcDunkOdds, calcThreePointOdds } from '../../../../utils/allStarOdds';
import { DUNK_MOVES } from '../../../../services/allStar/dunkMoves';

interface ContestDetailsModalProps {
  type: 'dunk' | 'three';
  onClose: () => void;
  state: any;
}

export const ContestDetailsModal: React.FC<ContestDetailsModalProps> = ({ type, onClose, state }) => {
  const isDunk = type === 'dunk';
  const allStar = state.allStar;
  const result = isDunk ? allStar?.dunkContest : allStar?.threePointContest;
  const contestants = isDunk ? allStar?.dunkContestContestants : allStar?.threePointContestants;
  
  const isComplete = !!result;

  // Resolve contestants to full player objects for accurate odds calculation
  const fullContestants = (contestants || []).map((c: any) => 
    state.players.find((pl: NBAPlayer) => pl.internalId === (c.internalId || c.playerId)) || c
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-[#0a0a0a] border border-white/10 rounded-[32px] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-slate-900 to-black">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${isDunk ? 'bg-orange-500/20 text-orange-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
              {isDunk ? '🏀' : '🎯'}
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">
                {isDunk ? 'Slam Dunk Contest' : '3-Point Contest'}
              </h3>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                {isComplete ? 'Final Results' : 'Contest Preview'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {isComplete ? (
            isDunk ? (
              // DUNK RESULTS — detailed like DunkContestView
              <div className="space-y-6">
                {/* Champion hero */}
                <div className="bg-gradient-to-br from-orange-600/20 to-amber-600/20 border border-orange-500/20 rounded-3xl p-6 flex items-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center text-4xl border border-orange-500/30">🏆</div>
                  <div>
                    <div className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em] mb-1">Champion</div>
                    <div className="text-3xl font-black text-white uppercase tracking-tight">{result.winnerName}</div>
                    {result.mvpDunk && (
                      <div className="mt-2 inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1">
                        <span className="text-[9px] font-black tracking-widest text-yellow-600 uppercase">Dunk of the Night</span>
                        <span className="text-xs text-yellow-300 font-bold">
                          {DUNK_MOVES.find(m => m.id === result.mvpDunk)?.displayName ?? result.mvpDunk}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Detailed results table */}
                <div className="bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Player</th>
                        <th className="py-3 px-3 text-center">R1 D1</th>
                        <th className="py-3 px-3 text-center">R1 D2</th>
                        <th className="py-3 px-3 text-center bg-white/5">R1 Total</th>
                        <th className="py-3 px-3 text-center">Finals D1</th>
                        <th className="py-3 px-3 text-center">Finals D2</th>
                        <th className="py-3 px-3 text-center bg-white/5">Finals Total</th>
                        <th className="py-3 px-4 text-center">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(result.round1 ?? [])
                        .sort((a: any, b: any) => (b.total ?? b.totalScore ?? 0) - (a.total ?? a.totalScore ?? 0))
                        .map((r1: any, i: number) => {
                          const r1Name = r1.playerName || r1.playerId;
                          const player = state.players.find((p: NBAPlayer) => p.internalId === r1.playerId)
                            || state.players.find((p: NBAPlayer) => p.name === r1Name);
                          const team = player ? state.teams.find((t: NBATeam) => t.id === player.tid) : null;
                          const nbaId = player?.nbaId || extractNbaId(player?.imgURL || '', r1Name);
                          const finalsRow = (result.round2 ?? []).find((r: any) =>
                            (r.playerName && r.playerName === r1Name) ||
                            (r.playerId && r.playerId === r1Name) ||
                            (r.playerId && r.playerId === r1.playerId)
                          );
                          const isWinner = result.winnerName === r1Name || result.winnerId === r1Name || result.winnerId === r1.playerId;
                          const isFinalist = !!finalsRow;
                          const r1Total = r1.total ?? r1.totalScore ?? 0;

                          return (
                            <tr key={r1.playerId || r1Name} className={`transition-colors ${isWinner ? 'bg-orange-500/5' : 'hover:bg-white/5'}`}>
                              <td className="py-3 px-4 text-slate-500 font-mono text-sm">
                                {isWinner ? <Trophy size={14} className="text-yellow-500" /> : i + 1}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden shrink-0">
                                    <img
                                      src={getPlayerHeadshot(r1.playerId, nbaId)}
                                      className="w-full h-full object-cover"
                                      alt={r1Name}
                                      referrerPolicy="no-referrer"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                  </div>
                                  <div>
                                    <p className={`text-sm font-bold ${isWinner ? 'text-orange-400' : 'text-white'}`}>{r1Name}</p>
                                    <p className="text-[10px] text-slate-600">{team?.abbrev ?? ''}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center font-mono text-slate-400 text-sm">{r1.dunks?.[0]?.score ?? '—'}</td>
                              <td className="py-3 px-3 text-center font-mono text-slate-400 text-sm">{r1.dunks?.[1]?.score ?? '—'}</td>
                              <td className="py-3 px-3 text-center font-black text-white bg-white/5">{r1Total}</td>
                              <td className="py-3 px-3 text-center font-mono text-sm">
                                {isFinalist
                                  ? <span className={isWinner ? 'text-orange-400 font-bold' : 'text-slate-400'}>{finalsRow.dunks?.[0]?.score ?? '—'}</span>
                                  : <span className="text-slate-700">—</span>}
                              </td>
                              <td className="py-3 px-3 text-center font-mono text-sm">
                                {isFinalist
                                  ? <span className={isWinner ? 'text-orange-400 font-bold' : 'text-slate-400'}>{finalsRow.dunks?.[1]?.score ?? '—'}</span>
                                  : <span className="text-slate-700">—</span>}
                              </td>
                              <td className="py-3 px-3 text-center font-black bg-white/5">
                                {isFinalist
                                  ? <span className={isWinner ? 'text-orange-400 text-lg' : 'text-white'}>{finalsRow.total ?? finalsRow.totalScore ?? 0}</span>
                                  : <span className="text-slate-700 text-xs font-normal">DNQ</span>}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {isWinner ? (
                                  <span className="inline-flex items-center gap-1 bg-orange-500 text-black text-[9px] font-black px-2 py-1 rounded-full">
                                    <Trophy size={9} /> CHAMPION
                                  </span>
                                ) : isFinalist ? (
                                  <span className="text-[9px] font-bold text-slate-500 uppercase">Finalist</span>
                                ) : (
                                  <span className="text-[9px] font-bold text-slate-700 uppercase">Eliminated</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              // 3PT RESULTS
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-indigo-600/20 to-violet-600/20 border border-indigo-500/20 rounded-3xl p-6 flex items-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-indigo-500/20 flex items-center justify-center text-4xl border border-indigo-500/30">🏆</div>
                  <div>
                    <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Champion</div>
                    <div className="text-3xl font-black text-white uppercase tracking-tight">{result.winnerName}</div>
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="py-3 px-3">#</th>
                        <th className="py-3 px-2">Pos</th>
                        <th className="py-3 px-3">Player</th>
                        <th className="py-3 px-3">Team</th>
                        <th className="py-3 px-3 text-right">3P%</th>
                        <th className="py-3 px-3 text-right border-l border-slate-800">Round 1</th>
                        <th className="text-right py-3 px-3 border-l border-slate-800">Final Round</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.contestants ?? [])
                        .sort((a: any, b: any) => {
                          if (a.isWinner) return -1;
                          if (b.isWinner) return 1;
                          const aFinal = a.finalScore ?? -1;
                          const bFinal = b.finalScore ?? -1;
                          if (aFinal !== bFinal) return bFinal - aFinal;
                          return b.round1Score - a.round1Score;
                        })
                        .map((c: any, idx: number) => {
                          const player = state.players.find((p: NBAPlayer) => p.internalId === c.playerId);
                          const team = player ? state.teams.find((t: NBATeam) => t.id === player.tid) : null;
                          const stat = player?.stats?.find((s: any) => s.season === state.leagueStats.year && !s.playoffs);
                          const tpPct = stat && stat.tpa > 0 ? (stat.tp / stat.tpa).toFixed(3) : '—';
                          const inFinals = c.finalScore !== null && c.finalScore !== undefined;

                          return (
                            <tr key={c.playerId} className={`border-b border-slate-800/50 ${c.isWinner ? 'bg-amber-500/10' : 'hover:bg-slate-800/20'}`}>
                              <td className="py-3 px-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                              <td className="py-3 px-2 text-slate-500 text-xs font-bold">{player?.pos ?? '—'}</td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-slate-800 shrink-0 flex items-center justify-center overflow-hidden relative">
                                    <img
                                      src={getPlayerHeadshot(c.playerId, player?.nbaId || extractNbaId(player?.imgURL || "", c.playerName))}
                                      className="w-full h-full object-cover absolute inset-0"
                                      onError={(e) => { 
                                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.playerName)}&background=0D9488&color=fff`;
                                      }}
                                      referrerPolicy="no-referrer"
                                      alt={c.playerName}
                                    />
                                  </div>
                                  <span className={`font-bold text-sm ${c.isWinner ? 'text-amber-400' : 'text-white'}`}>
                                    {c.playerName}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-slate-400 text-xs">{team?.name ?? '—'}</td>
                              <td className="py-3 px-3 text-right font-mono text-slate-300 text-xs">{tpPct}</td>
                              <td className="py-3 px-3 text-right font-mono text-white font-bold border-l border-slate-900">
                                {c.round1Score}
                              </td>
                              <td className={`py-3 px-3 text-right font-mono font-bold border-l border-slate-900 ${c.isWinner ? 'text-amber-400' : inFinals ? 'text-white' : 'text-slate-600 italic text-xs'}`}>
                                {inFinals ? c.finalScore : 'DNQ'}
                              </td>
                            </tr>
                          );
                        })
                      }
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={7} className="pt-3 px-3 text-[10px] text-slate-600">
                          Max score: 30 pts · 5 racks × 5 balls · Money ball = 2 pts
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          ) : (
            // PREVIEW VIEW — contestant cards
            <div className="space-y-4">
              <p className="text-slate-400 text-sm mb-4">
                {isDunk 
                  ? 'Four high-flyers competing for the title'
                  : 'Eight elite shooters competing for the title'}
              </p>
              <div className={`grid gap-4 ${isDunk ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-4'}`}>
                {fullContestants.map((p: NBAPlayer) => {
                  const nbaId = (p as any).nbaId || extractNbaId(p.imgURL || "", p.name);
                  const team = state.teams.find((t: NBATeam) => t.id === p.tid);
                  const teamId = (p as any).teamNbaId || (team ? extractTeamId(team.logoUrl, team.abbrev) : null) || 1610612737;
                  const teamColor = team?.colors?.[0] || (isDunk ? '#f97316' : '#6366f1');
                  
                  const dunkOdds = calcDunkOdds(fullContestants, p);
                  const threeOdds = calcThreePointOdds(fullContestants, p);

                  return (
                    <div key={p.internalId} className={`bg-slate-900 border ${isDunk ? 'border-orange-500/20' : 'border-indigo-500/20'} rounded-2xl p-4 text-center flex flex-col items-center transition-all hover:scale-[1.02]`}>
                      <div className="relative mb-3">
                        <div 
                          className="w-20 h-20 rounded-full overflow-hidden bg-slate-800 border-2"
                          style={{ borderColor: `${teamColor}40` }}
                        >
                          <img
                            src={getPlayerHeadshot(p.internalId, nbaId)}
                            className="w-full h-full object-cover"
                            onError={(e) => { 
                              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=0D9488&color=fff`;
                            }}
                            referrerPolicy="no-referrer"
                            alt={p.name}
                          />
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-1 border border-slate-800">
                          <img 
                            src={getTeamLogo(teamId)}
                            className="w-5 h-5 object-contain"
                            alt="team"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-center mb-2">
                        <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase mb-0.5">TO WIN</div>
                        <div className={`text-3xl font-black font-mono tracking-tight ${isDunk ? 'text-orange-400' : 'text-indigo-400'}`}>
                          {isDunk ? dunkOdds : threeOdds}
                        </div>
                      </div>

                      <div className="text-sm font-bold text-white truncate w-full">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {team?.abbrev || 'NBA'}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {isDunk && (
                <p className="text-xs text-slate-500 text-center mt-4">
                  Max score: 50 pts per dunk · 2 dunks per round · Top 2 advance
                </p>
              )}
              {!isDunk && (
                <p className="text-xs text-slate-500 text-center mt-4">
                  5 racks × 5 balls · Money ball = 2 pts · Max score: 30 · Top 3 advance
                </p>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
