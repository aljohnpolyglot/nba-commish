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
import { X, Shield, Sparkles, RotateCcw, Lock, ChevronLeft, ChevronRight, Users, ArrowUpDown, Check } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { NBAPlayer } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import { hasFamilyOnRoster } from '../../utils/familyTies';
import { getDisplayPotential } from '../../utils/playerRatings';
import { getDisplayAge } from '../../store/playerRatingStore';
import { getTeamFullName } from '../../utils/teamNames';
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

type SortKey = 'k2' | 'pot' | 'age' | 'pos' | 'name' | 'yrs' | 'salary';
type SortDir = 'asc' | 'desc';

// Wraps getTeamFullName mit Fallback auf "Team {tid}" wenn keine Daten.
function teamDisplayName(team: ExistingTeam | undefined, fallbackTid: number): string {
  if (!team) return `Team ${fallbackTid}`;
  return getTeamFullName(team) || `Team ${fallbackTid}`;
}

export const PlayerProtectionModal: React.FC<Props> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const userTid = state.userTeamId ?? -999;
  const isGM = state.gameMode === 'gm';
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
  const [sortKey, setSortKey] = useState<SortKey>('k2');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    const aiResults = autoSelectAllTeams(
      (state.players ?? []) as NBAPlayer[],
      existingTeamIds,
      perTeamLimit,
      currentYear,
      userTid >= 0 ? [userTid] : [],
    );
    const initial: Record<number, string[]> = {};
    for (const [tid, result] of Object.entries(aiResults)) {
      initial[parseInt(tid, 10)] = result.protected;
    }
    if (userTid >= 0) initial[userTid] = [];
    setProtections(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeRoster = useMemo(() => {
    const all = (state.players ?? []) as NBAPlayer[];
    return all.filter(p => p.tid === activeTid);
  }, [state.players, activeTid]);

  const activePhase = useMemo(() => getTeamPhase(activeRoster), [activeRoster]);

  const activeProtected = protections[activeTid] ?? [];
  const activeProtectedSet = new Set(activeProtected);
  const familyLocked = useMemo(
    () => new Set(
      activeRoster.filter(p => hasFamilyOnRoster(p, activeRoster)).map(p => p.internalId)
    ),
    [activeRoster]
  );
  const activeTeam = useMemo(
    () => existingTeams.find(team => (team.id ?? team.tid) === activeTid),
    [existingTeams, activeTid]
  );

  const sortedRoster = useMemo(() => {
    const enriched = activeRoster.map(player => {
      // Effective expiration — re-signs leave contract.exp pointing at the OLD
      // current-year deal until rollover, with the new deal living in
      // contractYears[]. Use the later of the two so EXP reflects total
      // commitment after a re-sign instead of flashing "expiring" for a
      // freshly extended player. Same pattern as TeamOfficeRosterView.
      const cyYears = (((player as any).contractYears ?? []) as Array<{ season?: string }>)
        .map(cy => parseInt((cy.season ?? '').split('-')[0], 10) + 1)
        .filter(y => Number.isFinite(y));
      const latestCY = cyYears.length > 0 ? Math.max(...cyYears) : 0;
      const effectiveExp = Math.max(player.contract?.exp ?? currentYear, latestCY);
      const yearsLeft = Math.max(0, effectiveExp - currentYear);
      return {
        player,
        k2: convertTo2KRating(player.overallRating ?? 60, 50),
        pot: getDisplayPotential(player, currentYear),
        age: getDisplayAge(player, currentYear),
        yearsLeft,
        salaryUSD: (player.contract?.amount ?? 0) * 1_000,
        score: computeProtectScore(player, { phase: activePhase, currentYear }),
      };
    });
    const dir = sortDir === 'desc' ? -1 : 1;
    return enriched.sort((a, b) => {
      switch (sortKey) {
        case 'k2':     return (a.k2 - b.k2) * dir;
        case 'pot':    return (a.pot - b.pot) * dir;
        case 'salary': return (a.salaryUSD - b.salaryUSD) * dir;
        case 'age': {
          const av = typeof a.age === 'number' ? a.age : 999;
          const bv = typeof b.age === 'number' ? b.age : 999;
          return (av - bv) * dir;
        }
        case 'pos':  return (a.player.pos ?? '').localeCompare(b.player.pos ?? '') * dir;
        case 'name': return a.player.name.localeCompare(b.player.name) * dir;
        case 'yrs':  return (a.yearsLeft - b.yearsLeft) * dir;
        default:     return 0;
      }
    });
  }, [activeRoster, activePhase, currentYear, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

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
    if (nextTid != null) setActiveTid(nextTid);
  };

  const userProtectionCount = (protections[userTid >= 0 ? userTid : -1] ?? []).length;
  const userRosterSize = (state.players ?? []).filter(p => (p as NBAPlayer).tid === userTid).length;
  const userMinExpected = Math.min(perTeamLimit, userRosterSize);
  const canSubmit = userTid < 0 || userProtectionCount >= userMinExpected || userProtectionCount === userRosterSize;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 md:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="bg-zinc-900 text-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-800">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" /> Player Protection
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Protect up to {perTeamLimit} players per team. Unprotected players can be claimed by the {expansionTeamCount} expansion team{expansionTeamCount !== 1 ? 's' : ''}.
              </p>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Team-Header */}
          <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b border-zinc-800 bg-zinc-950">
            {!isGM && (
              <button onClick={() => cycleTeam(-1)} className="p-1.5 hover:bg-zinc-800 rounded" title="Previous team">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex-1 text-center">
              <div className="text-sm font-semibold">
                {teamDisplayName(activeTeam, activeTid)}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {activeProtected.length} / {Math.min(perTeamLimit, activeRoster.length)} protected
              </div>
            </div>
            {!isGM && (
              <button onClick={() => cycleTeam(1)} className="p-1.5 hover:bg-zinc-800 rounded" title="Next team">
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Action-Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-2 border-b border-zinc-800">
            <div className="text-xs text-zinc-400">
              {familyLocked.size > 0 && (
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3" /> {familyLocked.size} family-locked
                </span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
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
          <div className="flex-1 overflow-y-auto custom-scrollbar">
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
                    <SortHeader label="Player"   colKey="name"   align="left"   sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="Pos"      colKey="pos"    align="center" width="w-12" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="Age"      colKey="age"    align="center" width="w-12" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="K2"       colKey="k2"     align="center" width="w-12" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="POT"      colKey="pot"    align="center" width="w-12" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="Contract" colKey="salary" align="center" width="w-20" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="Yrs"      colKey="yrs"    align="center" width="w-14" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <th className="text-center px-2 py-2 w-14">Protect</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRoster.map(({ player, k2, pot, age, yearsLeft, salaryUSD }, idx) => {
                    const isProtected = activeProtectedSet.has(player.internalId);
                    const isFamilyLocked = familyLocked.has(player.internalId);
                    const isLimitReached = !isProtected && activeProtected.length >= perTeamLimit;
                    const disabled = isFamilyLocked || isLimitReached;
                    const salaryM = salaryUSD / 1_000_000;
                    const isExpiring = yearsLeft === 0;
                    return (
                      <tr
                        key={player.internalId}
                        className={`border-b border-zinc-800/50 transition-colors ${
                          isProtected ? 'bg-indigo-950/30' : 'hover:bg-zinc-800/40'
                        }`}
                      >
                        <td className="px-3 py-2 text-zinc-500 text-xs">{idx + 1}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            {player.imgURL && <img src={player.imgURL} alt="" className="w-6 h-6 rounded-full object-cover" />}
                            <span className="font-medium">{player.name}</span>
                            {isFamilyLocked && <Lock className="w-3 h-3 text-amber-400" />}
                          </div>
                        </td>
                        <td className="text-center text-xs text-zinc-400">{player.pos || '—'}</td>
                        <td className="text-center text-xs text-zinc-400">{age}</td>
                        <td className="text-center font-mono">{k2}</td>
                        <td className="text-center font-mono text-emerald-400/80">{pot}</td>
                        <td className="text-center text-xs text-zinc-300">
                          {salaryM > 0 ? `$${salaryM.toFixed(1)}M` : '—'}
                        </td>
                        <td className="text-center text-xs">
                          {isExpiring ? (
                            <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded text-[10px] font-bold uppercase tracking-wider">
                              Exp
                            </span>
                          ) : (
                            <span className="text-zinc-400">{yearsLeft}</span>
                          )}
                        </td>
                        <td className="text-center">
                          <ProtectCheckbox
                            checked={isProtected}
                            disabled={disabled}
                            onChange={() => handleToggle(player.internalId)}
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 border-t border-zinc-800 bg-zinc-950">
            <div className="text-xs text-zinc-400 text-center sm:text-left">
              {!canSubmit ? (
                <span className="text-amber-400">
                  {isGM
                    ? `Protect at least ${userMinExpected} players (currently ${userProtectionCount}).`
                    : `Your team must protect at least ${userMinExpected} players (currently ${userProtectionCount}).`}
                </span>
              ) : isGM ? (
                <span>
                  Ready · {userProtectionCount} protected for {teamDisplayName(activeTeam, activeTid)}
                </span>
              ) : (
                <span>All teams ready · {Object.keys(protections).length} rosters configured</span>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={onClose} className="w-full sm:w-auto px-4 py-2 text-sm text-zinc-300 hover:text-white">Cancel</button>
              <button
                onClick={() => onConfirm(protections)}
                disabled={!canSubmit}
                className="w-full sm:w-auto px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded font-semibold"
              >
                Advance to Draft
              </button>
            </div>
          </div>

          {/* Custom Scrollbar (slim, dark) — gilt nur für .custom-scrollbar */}
          <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.35); border-radius: 3px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(99, 102, 241, 0.6); }
            .custom-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(99,102,241,0.35) transparent; }
          `}</style>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Sub-Komponenten ───────────────────────────────────────────────────────

const SortHeader: React.FC<{
  label: string;
  colKey: SortKey;
  align?: 'left' | 'center';
  width?: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
}> = ({ label, colKey, align = 'center', width = '', sortKey, sortDir, onClick }) => {
  const isActive = sortKey === colKey;
  return (
    <th className={`px-2 py-2 ${width} ${align === 'left' ? 'text-left' : 'text-center'}`}>
      <button
        onClick={() => onClick(colKey)}
        className={`inline-flex items-center gap-1 hover:text-white transition-colors ${
          isActive ? 'text-indigo-300' : 'text-zinc-400'
        }`}
      >
        {label}
        {isActive ? (
          <span className="text-[9px]">{sortDir === 'desc' ? '▼' : '▲'}</span>
        ) : (
          <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
        )}
      </button>
    </th>
  );
};

const ProtectCheckbox: React.FC<{
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}> = ({ checked, disabled, onChange }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(); }}
    disabled={disabled}
    aria-pressed={checked}
    className={`w-5 h-5 rounded-md border-2 inline-flex items-center justify-center transition-all ${
      checked
        ? 'bg-indigo-600 border-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]'
        : 'bg-zinc-900 border-zinc-700 hover:border-indigo-500'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
  </button>
);
