import React, { useState, useMemo } from 'react';
import { AlertTriangle, RotateCcw, Search, UserPlus, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { AwardService } from '../../../services/logic/AwardService';

interface AllStarReplacementModalProps {
  onClose: () => void;
  onConfirm: (injuredId: string, injuredName: string, replacementId: string, replacementName: string, conference: string) => void;
}

const ModalShell = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <motion.div
      initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
      className={`bg-slate-900 border border-slate-800 rounded-[2rem] w-full shadow-2xl flex flex-col max-h-[90vh] ${wide ? 'max-w-3xl' : 'max-w-2xl'}`}
    >
      {children}
    </motion.div>
  </div>
);

export const AllStarReplacementModal: React.FC<AllStarReplacementModalProps> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const allStarRoster = state.allStar?.roster ?? [];
  const allStarIds = new Set(allStarRoster.map(r => r.playerId));
  const season = state.leagueStats.year || 2026;

  // Picker state
  const [pickerForId, setPickerForId] = useState<string | null>(null); // injuredId or playerId being swapped
  const [search, setSearch] = useState('');

  const candidateRanking = useMemo(() => {
    if (!state.players || !state.teams) return [];
    const races = AwardService.calculateAwardRaces(state.players, state.teams, season);
    return races.mvp
      .filter(c => !allStarIds.has(c.player.internalId) && c.player.status === 'Active' && c.player.tid >= 0)
      .slice(0, 40);
  }, [state.players, state.teams, season, allStarRoster.length]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidateRanking;
    return candidateRanking.filter(c =>
      c.player.name.toLowerCase().includes(q) ||
      (state.teams.find(t => t.id === c.player.tid)?.abbrev ?? '').toLowerCase().includes(q)
    );
  }, [candidateRanking, search, state.teams]);

  // Partition roster
  const injuredPlayers = allStarRoster.filter(r => {
    const p = state.players.find(pl => pl.internalId === r.playerId);
    return !!(p as any)?.injury && !r.isInjuredDNP;
  });
  const activeRoster = allStarRoster.filter(r => !r.isInjuredDNP && !r.isInjuryReplacement);
  const injuredDNP = allStarRoster.filter(r => r.isInjuredDNP);
  const replacements = allStarRoster.filter(r => r.isInjuryReplacement);

  const pickerEntry = pickerForId ? allStarRoster.find(r => r.playerId === pickerForId) : null;
  const pickerPlayer = pickerForId ? state.players.find(p => p.internalId === pickerForId) : null;
  const pickerTeam = pickerPlayer ? state.teams.find(t => t.id === pickerPlayer.tid) : null;
  const isAddingReplacement = pickerEntry ? (!!(state.players.find(p => p.internalId === pickerForId) as any)?.injury && !pickerEntry.isInjuredDNP) : false;

  // ── Step 2: Player picker ─────────────────────────────────────────────────
  if (pickerForId) {
    return (
      <ModalShell wide>
        <div className="p-8 pb-4">
          <button onClick={() => { setPickerForId(null); setSearch(''); }} className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5">
            ← Back to roster
          </button>
          {pickerEntry && (
            <div className={`flex items-center gap-4 mb-4 p-3 rounded-2xl border ${isAddingReplacement ? 'bg-rose-500/10 border-rose-500/20' : 'bg-sky-500/10 border-sky-500/20'}`}>
              <PlayerPortrait imgUrl={pickerPlayer?.imgURL} teamLogoUrl={pickerTeam?.logoUrl} overallRating={pickerPlayer?.overallRating} size={44} />
              <div>
                <p className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${isAddingReplacement ? 'text-rose-400' : 'text-sky-400'}`}>
                  {isAddingReplacement ? '⚡ Injured — Select Replacement' : 'Swapping Out'}
                </p>
                <p className="font-black text-white">{pickerEntry.playerName}</p>
                <p className="text-xs text-slate-500">{pickerEntry.conference} · {pickerEntry.isStarter ? 'Starter' : 'Reserve'}</p>
              </div>
            </div>
          )}
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
            {isAddingReplacement ? 'Select Replacement' : 'Select Replacement'}
          </p>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search candidates…"
              className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="overflow-y-auto custom-scrollbar px-8 pb-6 flex-1">
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
            {filteredCandidates.map(c => {
              const team = state.teams.find(t => t.id === c.player.tid);
              const gp = c.stats.gp || 1;
              return (
                <button
                  key={c.player.internalId}
                  onClick={() => {
                    const conf = pickerEntry?.conference ?? (team?.conference ?? 'East');
                    onConfirm(pickerForId, pickerEntry?.playerName ?? '', c.player.internalId, c.player.name, conf);
                  }}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-sky-500/50 hover:bg-sky-500/10 transition-all text-center"
                >
                  <PlayerPortrait imgUrl={c.player.imgURL} teamLogoUrl={team?.logoUrl} overallRating={c.player.overallRating} size={64} />
                  <p className="font-bold text-white text-[11px] leading-tight line-clamp-2">{c.player.name}</p>
                  <p className="text-[9px] text-slate-500">{c.player.pos} · {team?.abbrev ?? '—'}</p>
                  <p className="text-[9px] text-slate-600 font-mono">
                    {(c.stats.pts / gp).toFixed(1)}p · {((c.stats.trb || 0) / gp).toFixed(1)}r · {(c.stats.ast / gp).toFixed(1)}a
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6 pt-4 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-bold uppercase tracking-wider text-xs">Cancel</button>
        </div>
      </ModalShell>
    );
  }

  // ── Step 1: Main roster view ──────────────────────────────────────────────
  const eastRoster = activeRoster.filter(r => r.conference === 'East');
  const westRoster = activeRoster.filter(r => r.conference === 'West');

  const PlayerRow = ({ r, isInjured = false }: { r: typeof allStarRoster[0]; isInjured?: boolean; key?: React.Key }) => {
    const p = state.players.find(pl => pl.internalId === r.playerId);
    const team = state.teams.find(t => t.id === p?.tid);
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
        isInjured ? 'bg-rose-500/5 border-rose-500/20' : 'bg-slate-950/50 border-slate-800'
      }`}>
        <PlayerPortrait imgUrl={p?.imgURL} teamLogoUrl={team?.logoUrl} overallRating={p?.overallRating} size={40} />
        <div className="flex flex-col items-start flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-white">{r.playerName}</span>
            {isInjured && <span className="text-[8px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded">INJURED</span>}
            {r.isInjuredDNP && <span className="text-[8px] font-black text-slate-500 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded">DNP</span>}
            {r.isInjuryReplacement && <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">REPLACEMENT</span>}
          </div>
          <span className="text-[10px] text-slate-500">{team?.abbrev} · {r.isStarter ? 'Starter' : 'Reserve'}</span>
        </div>
        {isInjured ? (
          <button
            onClick={() => setPickerForId(r.playerId)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:bg-rose-600/40 transition-all text-xs font-black uppercase tracking-widest"
          >
            <UserPlus size={12} /> Add Replacement
          </button>
        ) : !r.isInjuredDNP && !r.isInjuryReplacement && (
          <button
            onClick={() => setPickerForId(r.playerId)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-sky-600/30 hover:text-sky-400 text-slate-500 transition-all border border-slate-700 hover:border-sky-500/40"
            title="Swap player"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    );
  };

  return (
    <ModalShell wide>
      <div className="p-8 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
            <RotateCcw size={22} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black text-white uppercase tracking-widest">All-Star Roster</h3>
            {injuredPlayers.length > 0 ? (
              <p className="text-rose-400 text-xs font-bold">
                ⚡ {injuredPlayers.length} player{injuredPlayers.length > 1 ? 's are' : ' is'} injured — add replacements below
              </p>
            ) : (
              <p className="text-slate-400 text-xs">Tap swap icon to replace any player, or add injury replacements</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-500 hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto custom-scrollbar px-8 pb-4 flex-1 space-y-5">
        {/* Injured players requiring replacements */}
        {injuredPlayers.length > 0 && (
          <div>
            <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <AlertTriangle size={10} /> Injured — Need Replacements
            </p>
            <div className="space-y-1.5">
              {injuredPlayers.map(r => <PlayerRow key={r.playerId} r={r} isInjured />)}
            </div>
          </div>
        )}

        {/* Confirmed DNPs + their replacements */}
        {(injuredDNP.length > 0 || replacements.length > 0) && (
          <div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Replacements Set</p>
            <div className="space-y-1.5">
              {injuredDNP.map(r => <PlayerRow key={r.playerId} r={r} />)}
              {replacements.map(r => <PlayerRow key={r.playerId} r={r} />)}
            </div>
          </div>
        )}

        {/* Active roster */}
        {(['East', 'West'] as const).map(conf => {
          const confRoster = conf === 'East' ? eastRoster : westRoster;
          return (
            <div key={conf}>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{conf}ern Conference</p>
              <div className="space-y-1.5">
                {confRoster.map(r => <PlayerRow key={r.playerId} r={r} />)}
                {confRoster.length === 0 && <p className="text-slate-600 text-xs text-center py-4">No {conf} All-Stars yet</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-8 pt-4 border-t border-slate-800 flex justify-end">
        <button onClick={onClose} className="px-6 py-3 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold uppercase tracking-wider text-xs">Close</button>
      </div>
    </ModalShell>
  );
};
