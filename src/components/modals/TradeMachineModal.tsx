import React, { useState, useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { X, Search, User, CheckCircle2, ArrowLeftRight, Trash2, Plus, DollarSign, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NBAPlayer, NBATeam, DraftPick } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';

interface TradeMachineModalProps {
  onClose: () => void;
  onConfirm: (payload: { 
    teamAId: number, 
    teamBId: number, 
    teamAPlayers: string[], 
    teamBPlayers: string[], 
    teamAPicks: number[], 
    teamBPicks: number[] 
  }) => void;
}

export const TradeMachineModal: React.FC<TradeMachineModalProps> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  
  const [teamAPlayers, setTeamAPlayers] = useState<NBAPlayer[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<NBAPlayer[]>([]);
  const [teamAPicks, setTeamAPicks] = useState<DraftPick[]>([]);
  const [teamBPicks, setTeamBPicks] = useState<DraftPick[]>([]);

  const formatContract = (amount: number) => {
    return `$${(amount / 1000).toFixed(1)}M`;
  };

  const teamA = state.teams.find(t => t.id === teamAId);
  const teamB = state.teams.find(t => t.id === teamBId);

  const teamARoster = useMemo(() => state.players.filter(p => p.tid === teamAId && !['WNBA', 'Euroleague', 'PBA'].includes(p.status || '')), [state.players, teamAId]);
  const teamBRoster = useMemo(() => state.players.filter(p => p.tid === teamBId && !['WNBA', 'Euroleague', 'PBA'].includes(p.status || '')), [state.players, teamBId]);
  
  const teamAPicksAvailable = useMemo(() => state.draftPicks.filter(p => p.tid === teamAId), [state.draftPicks, teamAId]);
  const teamBPicksAvailable = useMemo(() => state.draftPicks.filter(p => p.tid === teamBId), [state.draftPicks, teamBId]);

  const teamASalary = useMemo(() => teamAPlayers.reduce((sum, p) => sum + (p.contract?.amount || 0), 0), [teamAPlayers]);
  const teamBSalary = useMemo(() => teamBPlayers.reduce((sum, p) => sum + (p.contract?.amount || 0), 0), [teamBPlayers]);

  const salaryMismatch = useMemo(() => {
    if (teamAPlayers.length === 0 && teamBPlayers.length === 0) return null;
    
    // Simple rule: Salaries must be within 25% of each other if either team is over the cap
    // For this simulation, we'll just enforce a 25% variance rule for all executive trades to keep it "realistic"
    const maxSalary = Math.max(teamASalary, teamBSalary);
    const minSalary = Math.min(teamASalary, teamBSalary);
    
    if (maxSalary > 0 && minSalary / maxSalary < 0.75) {
      const diff = Math.round(maxSalary * 0.75 - minSalary);
      if (teamASalary < teamBSalary) {
          return {
              message: `The ${teamA?.name} must include approximately ${formatContract(diff)} more in salary to match.`,
              team: 'A'
          };
      } else {
          return {
              message: `The ${teamB?.name} must include approximately ${formatContract(diff)} more in salary to match.`,
              team: 'B'
          };
      }
    }
    return null;
  }, [teamASalary, teamBSalary, teamA, teamB, teamAPlayers, teamBPlayers]);

  const handleConfirm = () => {
    if (salaryMismatch) return;
    if (teamAId !== null && teamBId !== null) {
      onConfirm({
        teamAId,
        teamBId,
        teamAPlayers: teamAPlayers.map(p => p.internalId),
        teamBPlayers: teamBPlayers.map(p => p.internalId),
        teamAPicks: teamAPicks.map(p => p.dpid),
        teamBPicks: teamBPicks.map(p => p.dpid)
      });
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      >
        <motion.div 
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-[95vw] max-w-6xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[90vh]"
        >
          <div className="p-4 md:p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 bg-indigo-500/10 rounded-xl md:rounded-2xl text-indigo-400">
                    <ArrowLeftRight size={20} className="md:w-6 md:h-6" />
                </div>
                <div>
                    <h3 className="text-lg md:text-2xl font-black uppercase tracking-tighter text-white">Executive Trade Machine</h3>
                    <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5 md:mt-1">Bypass restrictions and force the deal</p>
                </div>
            </div>
            <button onClick={onClose} className="p-2 md:p-3 hover:bg-slate-800 rounded-xl md:rounded-2xl text-slate-400 hover:text-white transition-all">
              <X size={20} className="md:w-6 md:h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row custom-scrollbar overflow-y-auto lg:overflow-hidden">
            {/* Team A Column */}
            <div className="flex-1 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col min-h-[300px] lg:min-h-0 lg:overflow-hidden">
                <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900/30">
                    <select 
                        value={teamAId ?? ''} 
                        onChange={(e) => {
                            const id = parseInt(e.target.value);
                            setTeamAId(id);
                            setTeamAPlayers([]);
                            setTeamAPicks([]);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Select Team A</option>
                        {state.teams.filter(t => t.id !== teamBId).map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {teamA ? (
                        <>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <User size={12} /> Roster
                                </h4>
                                <div className="space-y-2">
                                    {teamARoster.map(player => {
                                        const isSelected = teamAPlayers.some(p => p.internalId === player.internalId);
                                        return (
                                            <button 
                                                key={player.internalId}
                                                onClick={() => {
                                                    if (isSelected) setTeamAPlayers(teamAPlayers.filter(p => p.internalId !== player.internalId));
                                                    else setTeamAPlayers([...teamAPlayers, player]);
                                                }}
                                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${isSelected ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <img src={player.imgURL} alt={player.name} className="w-8 h-8 rounded-lg object-cover bg-slate-800" referrerPolicy="no-referrer" />
                                                    <div className="text-left">
                                                        <div className="text-xs font-bold text-white">{player.name}</div>
                                                        <div className="text-[10px] text-slate-500">{player.pos} • {convertTo2KRating(player.overallRating)} OVR</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-mono font-bold text-slate-400">{formatContract(player.contract?.amount || 0)}</div>
                                                    <div className="text-[10px] text-slate-600">Exp: {player.contract?.exp}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Calendar size={12} /> Draft Picks
                                </h4>
                                <div className="grid grid-cols-2 gap-2">
                                    {teamAPicksAvailable.map(pick => {
                                        const isSelected = teamAPicks.some(p => p.dpid === pick.dpid);
                                        const originalTeam = state.teams.find(t => t.id === pick.originalTid);
                                        return (
                                            <button 
                                                key={pick.dpid}
                                                onClick={() => {
                                                    if (isSelected) setTeamAPicks(teamAPicks.filter(p => p.dpid !== pick.dpid));
                                                    else setTeamAPicks([...teamAPicks, pick]);
                                                }}
                                                className={`flex flex-col p-2 rounded-xl border text-left transition-all ${isSelected ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}
                                            >
                                                <div className="text-[10px] font-bold text-white">{pick.season} {pick.round === 1 ? '1st' : '2nd'} Rd</div>
                                                <div className="text-[8px] text-slate-500 uppercase tracking-tighter">via {originalTeam?.abbrev}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-4 opacity-50">
                            <ArrowLeftRight size={48} />
                            <p className="text-xs font-bold uppercase tracking-widest">Select a team to view assets</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Middle Summary */}
            <div className="w-full lg:w-64 bg-slate-950/50 border-y lg:border-y-0 lg:border-x border-slate-800 flex flex-col">
                <div className="p-4 lg:p-6 border-b border-slate-800 text-center">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Trade Summary</h4>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                    <div className="space-y-4">
                        <div className="text-center">
                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">To {teamB?.abbrev || 'Team B'}</div>
                            <div className="space-y-1">
                                {teamAPlayers.map(p => (
                                    <div key={p.internalId} className="text-[10px] font-bold text-white truncate">{p.name}</div>
                                ))}
                                {teamAPicks.map(p => (
                                    <div key={p.dpid} className="text-[10px] font-bold text-slate-400">{p.season} {p.round === 1 ? '1st' : '2nd'} ({state.teams.find(t => t.id === p.originalTid)?.abbrev})</div>
                                ))}
                            </div>
                            <div className="mt-2 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                                Total: {formatContract(teamASalary)}
                            </div>
                        </div>
                        <div className="h-px bg-slate-800"></div>
                        <div className="text-center">
                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">To {teamA?.abbrev || 'Team A'}</div>
                            <div className="space-y-1">
                                {teamBPlayers.map(p => (
                                    <div key={p.internalId} className="text-[10px] font-bold text-white truncate">{p.name}</div>
                                ))}
                                {teamBPicks.map(p => (
                                    <div key={p.dpid} className="text-[10px] font-bold text-slate-400">{p.season} {p.round === 1 ? '1st' : '2nd'} ({state.teams.find(t => t.id === p.originalTid)?.abbrev})</div>
                                ))}
                            </div>
                            <div className="mt-2 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                                Total: {formatContract(teamBSalary)}
                            </div>
                        </div>
                        
                        <div className="pt-4 border-t border-slate-800 text-center">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Salary Diff</div>
                            <div className={`text-xs font-black ${salaryMismatch ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {formatContract(Math.abs(teamASalary - teamBSalary))}
                            </div>
                            {salaryMismatch && (
                                <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                                    <p className="text-[10px] font-bold text-rose-400 leading-tight">
                                        {salaryMismatch.message}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="p-4 lg:p-6 border-t border-slate-800">
                    <button 
                        onClick={handleConfirm}
                        disabled={!!salaryMismatch || !teamAId || !teamBId || (teamAPlayers.length === 0 && teamAPicks.length === 0 && teamBPlayers.length === 0 && teamBPicks.length === 0)}
                        className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                    >
                        {salaryMismatch ? 'Invalid Salaries' : 'Execute Trade'}
                    </button>
                </div>
            </div>

            {/* Team B Column */}
            <div className="flex-1 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col min-h-[300px]">
                <div className="p-6 border-b border-slate-800 bg-slate-900/30">
                    <select 
                        value={teamBId ?? ''} 
                        onChange={(e) => {
                            const id = parseInt(e.target.value);
                            setTeamBId(id);
                            setTeamBPlayers([]);
                            setTeamBPicks([]);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Select Team B</option>
                        {state.teams.filter(t => t.id !== teamAId).map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {teamB ? (
                        <>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <User size={12} /> Roster
                                </h4>
                                <div className="space-y-2">
                                    {teamBRoster.map(player => {
                                        const isSelected = teamBPlayers.some(p => p.internalId === player.internalId);
                                        return (
                                            <button 
                                                key={player.internalId}
                                                onClick={() => {
                                                    if (isSelected) setTeamBPlayers(teamBPlayers.filter(p => p.internalId !== player.internalId));
                                                    else setTeamBPlayers([...teamBPlayers, player]);
                                                }}
                                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${isSelected ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <img src={player.imgURL} alt={player.name} className="w-8 h-8 rounded-lg object-cover bg-slate-800" referrerPolicy="no-referrer" />
                                                    <div className="text-left">
                                                        <div className="text-xs font-bold text-white">{player.name}</div>
                                                        <div className="text-[10px] text-slate-500">{player.pos} • {convertTo2KRating(player.overallRating)} OVR</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-mono font-bold text-slate-400">{formatContract(player.contract?.amount || 0)}</div>
                                                    <div className="text-[10px] text-slate-600">Exp: {player.contract?.exp}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Calendar size={12} /> Draft Picks
                                </h4>
                                <div className="grid grid-cols-2 gap-2">
                                    {teamBPicksAvailable.map(pick => {
                                        const isSelected = teamBPicks.some(p => p.dpid === pick.dpid);
                                        const originalTeam = state.teams.find(t => t.id === pick.originalTid);
                                        return (
                                            <button 
                                                key={pick.dpid}
                                                onClick={() => {
                                                    if (isSelected) setTeamBPicks(teamBPicks.filter(p => p.dpid !== pick.dpid));
                                                    else setTeamBPicks([...teamBPicks, pick]);
                                                }}
                                                className={`flex flex-col p-2 rounded-xl border text-left transition-all ${isSelected ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}
                                            >
                                                <div className="text-[10px] font-bold text-white">{pick.season} {pick.round === 1 ? '1st' : '2nd'} Rd</div>
                                                <div className="text-[8px] text-slate-500 uppercase tracking-tighter">via {originalTeam?.abbrev}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-4 opacity-50">
                            <ArrowLeftRight size={48} />
                            <p className="text-xs font-bold uppercase tracking-widest">Select a team to view assets</p>
                        </div>
                    )}
                </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
