// PlayerProtectionModal — ZenGM-style Player-Protection für Expansion Draft.
//
// Pro Bestandsteam wählt der GM bis zu `perTeamLimit` Spieler, die NICHT von
// den Expansion-Teams gedraftet werden können. AI-Teams werden silent beim
// Mount via autoSelectAllTeams gefüllt — der User sieht nur sein eigenes Team
// (oder im Commissioner-Mode kann er durch alle cyclen).
//
// Auto-Select-Heuristik: phase-bewusst (rebuilding=POT, contending=OVR, middle=
// hybrid) + Family-Lock (siblings sind unkündbar, vgl. CLAUDE.md).
// Submit dispatcht SET_EXPANSION_PROTECTIONS.

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Sparkles, RotateCcw, Lock, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { NBAPlayer } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import {
  autoSelectAllTeams,
  autoSelectProtections,
  computeProtectScore,
  getTeamPhase,
  type TeamPhase,
} from '../../services/expansion/autoProtect';

interface Props {
  onClose: () => void;
  onConfirm: (protections: Record<number, string[]>) => void;
}

type ExistingTeam = {
  id?: number;
  tid?: number;
  abbrev?: string;
  region?: string;
  name: string;
  abbreviation?: string;
  location?: string;
};

const PHASE_LABELS: Record<TeamPhase, { label: string; color: string; tooltip: string }> = {
  contending: { label: 'Contending',  color: 'text-emerald-400', tooltip: 'Top-7 K2 ≥ 83 — Auto-Select prefers OVR + long contracts.' },
  middle:     { label: 'Middle',      color: 'text-amber-400',   tooltip: 'Hybrid Auto-Select balances OVR/POT/Youth/Contract.' },
  rebuilding: { label: 'Rebuilding',  color: 'text-sky-400',     tooltip: 'Top-7 K2 ≤ 75 — Auto-Select prefers POT + youth.' },
};

export const PlayerProtectionModal: React.FC<Props> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const userTid = state.userTeamId ?? -999;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const perTeamLimit = state.expansionProtectionSettings?.perTeamLimit ?? 8;
  const expansionTeamCount = state.expansionSchedule?.teams.length ?? 0;

  const existingTeams = useMemo(() => {
    const teams = (state.teams ?? []) as ExistingTeam[];
    return teams.filter(t => (t.id ?? t.tid ?? -1) >= 0);
  }, [state.teams]);

  const existingTeamIds = useMemo(() => {
    return existingTeams
      .map(team => team.id ?? team.tid)
      .filter((tid): tid is number => tid !== undefined);
  }, [existingTeams]);

  const [protections, setProtections] = useState<Record<number, string[]>>({});
  const [activeTid, setActiveTid] = useState<number>(userTid >= 0 ? userTid : (existingTeamIds[0] ?? 0));

  useEffect(() => {
    const aiResults = autoSelectAllTeams(
      (state.players ?? []) as NBAPlayer[],
      existingTeamIds,
      perTeamLimit,
      currentYear,
      userTid >= 0 ? [userTid] : [], // User-Team manuell
    );
    const initial: Record<number, string[]> = {};
    for (const [tid, result] of Object.entries(aiResults)) {
      initial[parseInt(tid, 10)] = result.protected;
    }
    if (userTid >= 0) initial[userTid] = [];
    setProtections(initial);
  }, []);

  const activeRoster = useMemo(() => {
    const all = (state.players ?? []) as NBAPlayer[];
    return all.filter(p => p.tid === activeTid);
  }, [state.players, activeTid]);

  const activePhase = useMemo(() => getTeamPhase(activeRoster), [activeRoster]);

  const activeProtected = protections[activeTid] ?? [];
  const activeProtectedSet = new Set(activeProtected);
  const familyLocked = useMemo(
    () => new Set(activeRoster.filter(p => (p.relatives?.length ?? 0) > 0).map(p => p.internalId)),
    [activeRoster]
  );
  const activeTeam = useMemo(
    () => existingTeams.find(team => (team.id ?? team.tid) === activeTid),
    [existingTeams, activeTid]
  );
  const sortedRoster = useMemo(() => {
    return [...activeRoster]
      .map(player => ({
        player,
        k2: convertTo2KRating(player.overallRating ?? 60, 50),
        yearsLeft: Math.max(0, (player.contract?.exp ?? currentYear) - currentYear),
        score: computeProtectScore(player, { phase: activePhase, currentYear }),
      }))
      .sort((a, b) => b.score - a.score);
  }, [activeRoster, activePhase, currentYear]);

  const handleToggle = (playerId: string) => {
    if (familyLocked.has(playerId)) return;
    setProtections(prev => {
      const current = prev[activeTid] ?? [];
      const isProtected = current.includes(playerId);
      let next: string[];
      if (isProtected) {
        next = current.filter(id => id !== playerId);
      } else {
        if (current.length >= perTeamLimit) return prev;
        next = [...current, playerId];
      }
      return { ...prev, [activeTid]: next };
    });
  };

  const handleAutoSelect = () => {
    const result = autoSelectProtections(activeRoster, perTeamLimit, currentYear);
    setProtections(prev => ({ ...prev, [activeTid]: result.protected }));
  };

  const handleReset = () => {
    setProtections(prev => ({ ...prev, [activeTid]: [...familyLocked] }));
  };

  const cycleTeam = (dir: -1 | 1) => {
    const currentIdx = existingTeamIds.indexOf(activeTid);
    const nextIdx = (currentIdx + dir + existingTeamIds.length) % existingTeamIds.length;
    const nextTid = existingTeamIds[nextIdx];
    if (nextTid != null) {
      setActiveTid(nextTid);
    }
  };

  // Submit-Gate: User-Team muss exakt perTeamLimit (oder weniger, wenn Roster<Limit) haben
  const userProtectionCount = (protections[userTid >= 0 ? userTid : -1] ?? []).length;
  const userRosterSize = (state.players ?? []).filter(p => (p as NBAPlayer).tid === userTid).length;
  const userMinExpected = Math.min(perTeamLimit, userRosterSize);
  const canSubmit = userTid < 0 || userProtectionCount >= userMinExpected || userProtectionCount === userRosterSize;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="bg-zinc-900 text-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" /> Player Protection
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Protect up to {perTeamLimit} players per team. Unprotected players can be claimed by the {expansionTeamCount} expansion team{expansionTeamCount !== 1 ? 's' : ''}.
              </p>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Team-Switcher */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-950">
            <button
              onClick={() => cycleTeam(-1)}
              className="p-1.5 hover:bg-zinc-800 rounded"
              title="Previous team"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 text-center">
              <div className="text-sm font-semibold flex items-center justify-center gap-2">
                {activeTeam ? `${activeTeam.region || activeTeam.location} ${activeTeam.name}` : `Team ${activeTid}`}
                {activeTid === userTid && <span className="text-xs text-emerald-400 font-normal">(your team)</span>}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5 flex items-center justify-center gap-3">
                <span title={PHASE_LABELS[activePhase].tooltip} className={PHASE_LABELS[activePhase].color}>
                  {PHASE_LABELS[activePhase].label}
                </span>
                <span>·</span>
                <span>{activeProtected.length} / {Math.min(perTeamLimit, activeRoster.length)} protected</span>
              </div>
            </div>
            <button
              onClick={() => cycleTeam(1)}
              className="p-1.5 hover:bg-zinc-800 rounded"
              title="Next team"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Action-Bar */}
          <div className="flex items-center justify-between px-6 py-2 border-b border-zinc-800">
            <div className="text-xs text-zinc-400">
              {familyLocked.size > 0 && (
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3" /> {familyLocked.size} family-locked
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
              <button
                onClick={handleAutoSelect}
                className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 rounded font-semibold flex items-center gap-1"
                title={`Auto-select ${perTeamLimit} via ${activePhase} heuristic`}
              >
                <Sparkles className="w-3 h-3" /> Auto Select
              </button>
            </div>
          </div>

          {/* Roster-Liste */}
          <div className="flex-1 overflow-y-auto">
            {activeRoster.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No active players on this roster.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
                  <tr>
                    <th className="text-left px-3 py-2 w-8">#</th>
                    <th className="text-left px-2 py-2">Player</th>
                    <th className="text-center px-2 py-2 w-12">Pos</th>
                    <th className="text-center px-2 py-2 w-12">Age</th>
                    <th className="text-center px-2 py-2 w-14">K2</th>
                    <th className="text-center px-2 py-2 w-14">Yrs</th>
                    <th className="text-center px-2 py-2 w-14">Score</th>
                    <th className="text-center px-2 py-2 w-12">Protect</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRoster.map(({ player, k2, yearsLeft, score }, idx) => {
                      const isProtected = activeProtectedSet.has(player.internalId);
                      const isFamilyLocked = familyLocked.has(player.internalId);
                      return (
                        <tr
                          key={player.internalId}
                          className={`border-b border-zinc-800/50 ${isProtected ? 'bg-indigo-950/30' : ''}`}
                        >
                          <td className="px-3 py-2 text-zinc-500 text-xs">{idx + 1}</td>
                          <td className="px-2 py-2 flex items-center gap-2">
                            {player.imgURL && <img src={player.imgURL} alt="" className="w-6 h-6 rounded-full object-cover" />}
                            <span className="font-medium">{player.name}</span>
                            {isFamilyLocked && <Lock className="w-3 h-3 text-amber-400" />}
                          </td>
                          <td className="text-center text-xs text-zinc-400">{player.pos || '—'}</td>
                          <td className="text-center text-xs text-zinc-400">{player.age ?? '—'}</td>
                          <td className="text-center font-mono">{k2}</td>
                          <td className="text-center text-xs text-zinc-400">{yearsLeft}</td>
                          <td className="text-center text-xs text-zinc-500">{score.toFixed(0)}</td>
                          <td className="text-center">
                            <input
                              type="checkbox"
                              checked={isProtected}
                              disabled={isFamilyLocked || (!isProtected && activeProtected.length >= perTeamLimit)}
                              onChange={() => handleToggle(player.internalId)}
                              className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950">
            <div className="text-xs text-zinc-400">
              {!canSubmit ? (
                <span className="text-amber-400">
                  Your team must protect at least {userMinExpected} players (currently {userProtectionCount}).
                </span>
              ) : (
                <span>
                  All teams ready · {Object.keys(protections).length} rosters configured
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-300 hover:text-white">Cancel</button>
              <button
                onClick={() => onConfirm(protections)}
                disabled={!canSubmit}
                className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded font-semibold"
              >
                Advance to Draft
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
