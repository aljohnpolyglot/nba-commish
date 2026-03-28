import React, { useState, useMemo } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { AwardService } from '../../../services/logic/AwardService';

interface AllStarReplacementModalProps {
  onClose: () => void;
  onConfirm: (injuredId: string, injuredName: string, replacementId: string, replacementName: string) => void;
}

export const AllStarReplacementModal: React.FC<AllStarReplacementModalProps> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const allStarRoster = state.allStar?.roster ?? [];
  const allStarIds = new Set(allStarRoster.map(r => r.playerId));

  const season = state.leagueStats.year || 2026;
  const candidateRanking = useMemo(() => {
    if (!state.players || !state.teams) return [];
    const races = AwardService.calculateAwardRaces(state.players, state.teams, season);
    return races.mvp
      .filter(c => !allStarIds.has(c.player.internalId) && c.player.status === 'Active' && c.player.tid >= 0)
      .slice(0, 25);
  }, [state.players, state.teams, season]);

  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [selectedReplacement, setSelectedReplacement] = useState<string | null>(null);
  const [searchCandidates, setSearchCandidates] = useState('');

  const swappingEntry = allStarRoster.find(r => r.playerId === swappingId);
  const replacementObj = candidateRanking.find(c => c.player.internalId === selectedReplacement);

  const filteredCandidates = useMemo(() => {
    const q = searchCandidates.trim().toLowerCase();
    if (!q) return candidateRanking;
    return candidateRanking.filter(c => c.player.name.toLowerCase().includes(q));
  }, [candidateRanking, searchCandidates]);

  // ── Step 2: Candidate picker ──────────────────────────────────────────────
  if (swappingId) {
    const swappingPlayer = state.players.find(p => p.internalId === swappingId);
    const swappingTeam = state.teams.find(t => t.id === swappingPlayer?.tid);
    return (
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
          className="bg-slate-900 border border-slate-800 rounded-[2rem] max-w-xl w-full shadow-2xl flex flex-col max-h-[90vh]"
        >
          <div className="p-8 pb-4">
            <button onClick={() => { setSwappingId(null); setSelectedReplacement(null); }} className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5">
              ← Back to roster
            </button>
            <div className="flex items-center gap-4 mb-1 p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
              <PlayerPortrait
                imgUrl={swappingPlayer?.imgURL}
                teamLogoUrl={swappingTeam?.logoUrl}
                overallRating={swappingPlayer?.overallRating}
                size={44}
              />
              <div>
                <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-0.5">Swapping Out</p>
                <p className="font-black text-white">{swappingEntry?.playerName}</p>
                <p className="text-xs text-slate-500">{swappingEntry?.conference} · {swappingEntry?.isStarter ? 'Starter' : 'Reserve'}</p>
              </div>
            </div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-4 mb-2">Select Replacement</p>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                value={searchCandidates}
                onChange={e => setSearchCandidates(e.target.value)}
                placeholder="Search candidates…"
                className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="overflow-y-auto custom-scrollbar px-8 pb-4 space-y-1.5 flex-1">
            {filteredCandidates.map((c) => {
              const stat = c.stats;
              const gp = stat.gp || 1;
              const team = state.teams.find(t => t.id === c.player.tid);
              const isSelected = selectedReplacement === c.player.internalId;
              return (
                <button
                  key={c.player.internalId}
                  onClick={() => setSelectedReplacement(c.player.internalId)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
                    isSelected ? 'bg-sky-600/30 border border-sky-500/50 text-white' : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <PlayerPortrait
                    imgUrl={c.player.imgURL}
                    teamLogoUrl={team?.logoUrl}
                    overallRating={c.player.overallRating}
                    size={44}
                  />
                  <div className="flex flex-col items-start flex-1">
                    <span className="font-bold text-sm">{c.player.name}</span>
                    <span className="text-[10px] text-slate-500">{c.player.pos} · {team?.abbrev}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {(stat.pts / gp).toFixed(1)} pts · {((stat.trb || (stat.orb || 0) + (stat.drb || 0)) / gp).toFixed(1)} reb · {(stat.ast / gp).toFixed(1)} ast
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{c.odds}</span>
                </button>
              );
            })}
          </div>

          <div className="p-8 pt-4 border-t border-slate-800">
            {swappingEntry && replacementObj && (
              <div className="text-xs text-slate-400 bg-slate-950 rounded-xl px-4 py-2.5 border border-slate-800 mb-4">
                <span className="font-bold text-rose-400">{swappingEntry.playerName}</span>
                {' → '}
                <span className="font-bold text-sky-400">{replacementObj.player.name}</span>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-bold uppercase tracking-wider text-xs">Cancel</button>
              <button
                disabled={!selectedReplacement}
                onClick={() => swappingEntry && replacementObj && onConfirm(swappingEntry.playerId, swappingEntry.playerName, replacementObj.player.internalId, replacementObj.player.name)}
                className="px-6 py-3 rounded-xl bg-sky-600 text-white hover:bg-sky-500 font-bold uppercase tracking-wider text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm Swap
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Step 1: Roster view with swap buttons ─────────────────────────────────
  const eastRoster = allStarRoster.filter(r => r.conference === 'East');
  const westRoster = allStarRoster.filter(r => r.conference === 'West');

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="bg-slate-900 border border-slate-800 rounded-[2rem] max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
              <RotateCcw size={22} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-widest">All-Star Roster</h3>
              <p className="text-slate-400 text-xs">Tap the swap icon on any player to replace them</p>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto custom-scrollbar px-8 pb-4 flex-1">
          {(['East', 'West'] as const).map(conf => {
            const confRoster = conf === 'East' ? eastRoster : westRoster;
            return (
              <div key={conf} className="mb-6">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{conf}ern Conference</p>
                <div className="space-y-1.5">
                  {confRoster.map(r => {
                    const p = state.players.find(pl => pl.internalId === r.playerId);
                    const team = state.teams.find(t => t.id === p?.tid);
                    const isInjured = !!(p as any)?.injury;
                    return (
                      <div
                        key={r.playerId}
                        className="flex items-center gap-3 px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl"
                      >
                        <PlayerPortrait
                          imgUrl={p?.imgURL}
                          teamLogoUrl={team?.logoUrl}
                          overallRating={p?.overallRating}
                          size={44}
                        />
                        <div className="flex flex-col items-start flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-white">{r.playerName}</span>
                            {isInjured && <span className="text-[8px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded">INJ</span>}
                          </div>
                          <span className="text-[10px] text-slate-500">{team?.abbrev} · {r.isStarter ? 'Starter' : 'Reserve'}</span>
                        </div>
                        <button
                          onClick={() => setSwappingId(r.playerId)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-sky-600/30 hover:text-sky-400 text-slate-500 transition-all border border-slate-700 hover:border-sky-500/40"
                          title="Swap player"
                        >
                          <RotateCcw size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {confRoster.length === 0 && (
                    <p className="text-slate-600 text-xs text-center py-4">No {conf} All-Stars yet</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-8 pt-4 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-6 py-3 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold uppercase tracking-wider text-xs">Close</button>
        </div>
      </motion.div>
    </div>
  );
};
