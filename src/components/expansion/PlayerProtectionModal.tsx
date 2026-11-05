import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Sparkles, RotateCcw, Lock, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { NBAPlayer } from '../../types';
import { hasFamilyOnRoster } from '../../utils/familyTies';
import { getDisplayPotential } from '../../utils/playerRatings';
import { getDisplayAge, getDisplayOverall } from '../../store/playerRatingStore';
import { getTeamFullName } from '../../utils/teamNames';
import { formatExternalSalary } from '../../constants';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import {
  PlayerProtectionRoster,
  type ProtectionSortDir,
  type ProtectionSortKey,
} from './PlayerProtectionRoster';
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
  logoUrl?: string;
  imgURL?: string;
  imgURLSmall?: string;
};

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
  const isPbaExpansion = state.expansionSchedule?.league === 'pba';

  const existingTeams = useMemo(() => {
    const teams = (isPbaExpansion
      ? state.nonNBATeams.filter(team => team.league === 'PBA')
      : state.teams ?? []) as ExistingTeam[];
    const incoming = new Set(state.expansionTeamIds ?? []);
    return teams.filter(t => (t.id ?? t.tid ?? -1) >= 0 && !incoming.has(t.id ?? t.tid ?? -1));
  }, [isPbaExpansion, state.expansionTeamIds, state.nonNBATeams, state.teams]);

  const existingTeamIds = useMemo(() => {
    return existingTeams
      .map(team => team.id ?? team.tid)
      .filter((tid): tid is number => tid !== undefined);
  }, [existingTeams]);
  const managedUserTid = isGM && existingTeamIds.includes(userTid) ? userTid : -999;

  const [protections, setProtections] = useState<Record<number, string[]>>({});
  const [activeTid, setActiveTid] = useState<number>(
    managedUserTid >= 0 ? managedUserTid : (existingTeamIds[0] ?? 0),
  );
  const [sortKey, setSortKey] = useState<ProtectionSortKey>('ovr');
  const [sortDir, setSortDir] = useState<ProtectionSortDir>('desc');

  useEffect(() => {
    const aiResults = autoSelectAllTeams(
      (state.players ?? []) as NBAPlayer[],
      existingTeamIds,
      perTeamLimit,
      currentYear,
      managedUserTid >= 0 ? [managedUserTid] : [],
    );
    const initial: Record<number, string[]> = {};
    for (const [tid, result] of Object.entries(aiResults)) {
      initial[parseInt(tid, 10)] = result.protected;
    }
    if (managedUserTid >= 0) initial[managedUserTid] = [];
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
      activeRoster.filter(p => hasFamilyOnRoster(p, activeRoster, currentYear)).map(p => p.internalId)
    ),
    [activeRoster, currentYear]
  );
  const activeTeam = useMemo(
    () => existingTeams.find(team => (team.id ?? team.tid) === activeTid),
    [existingTeams, activeTid]
  );
  const activeTeamSnapshot = useMemo(
    () => getHistoricalTeamSnapshot(activeTeam, currentYear),
    [activeTeam, currentYear],
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
        ovr: getDisplayOverall(player),
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
        case 'ovr':    return (a.ovr - b.ovr) * dir;
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

  const toggleSort = (key: ProtectionSortKey) => {
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

  const userProtectionCount = (protections[managedUserTid] ?? []).length;
  const userRosterSize = (state.players ?? []).filter(p => (p as NBAPlayer).tid === managedUserTid).length;
  const userMinExpected = Math.min(perTeamLimit, userRosterSize);
  const canSubmit = managedUserTid < 0
    || userProtectionCount >= userMinExpected
    || userProtectionCount === userRosterSize;
  const formatSalary = (salaryUSD: number) => isPbaExpansion
    ? formatExternalSalary(salaryUSD, 'PBA')
    : `$${(salaryUSD / 1_000_000).toFixed(1)}M`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[220] flex items-stretch justify-center overflow-y-auto bg-[#020617]/90 p-0 backdrop-blur-md sm:items-center sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.97, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.97, opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-protection-title"
          data-testid="player-protection-modal"
          className="flex h-[100dvh] w-full max-w-7xl flex-col overflow-hidden bg-[#07111f] text-white shadow-[0_30px_100px_rgba(0,0,0,0.65)] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl sm:border sm:border-slate-800"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 sm:px-7 sm:py-5">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 ring-1 ring-violet-400/10 sm:h-14 sm:w-14">
                <Shield className="h-7 w-7 text-violet-400 sm:h-8 sm:w-8" />
              </div>
              <div className="min-w-0">
                <h2 id="player-protection-title" className="text-xl font-black uppercase tracking-tight sm:text-3xl">Player Protection</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:text-sm">
                Protect up to {perTeamLimit} players per team. Unprotected players can be claimed by the {expansionTeamCount} expansion team{expansionTeamCount !== 1 ? 's' : ''}.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close player protection" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800/80 text-slate-300 transition hover:bg-slate-700 hover:text-white">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 custom-scrollbar">
            <section className="flex min-h-full flex-col rounded-3xl border border-slate-800 bg-[#091523] p-3 shadow-inner shadow-black/10 sm:p-5">
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  {!isGM && (
                    <button type="button" onClick={() => cycleTeam(-1)} aria-label="Previous team" className="rounded-xl border border-slate-700 p-2 text-slate-400 transition hover:border-violet-400/60 hover:text-white">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950/70 sm:h-16 sm:w-16">
                    {activeTeamSnapshot.logoUrl ? (
                      <img src={activeTeamSnapshot.logoUrl} alt="" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
                    ) : (
                      <Shield className="h-8 w-8 text-violet-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black uppercase tracking-tight sm:text-2xl">{teamDisplayName(activeTeam, activeTid)}</h3>
                    <p className="mt-1 text-xs font-black uppercase tracking-wider text-slate-400">
                      <span className="text-violet-400">{activeProtected.length}</span> / {Math.min(perTeamLimit, activeRoster.length)} protected
                    </p>
                    {familyLocked.size > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                        <Lock className="h-3 w-3" /> {familyLocked.size} family protected
                      </p>
                    )}
                  </div>
                  {!isGM && (
                    <button type="button" onClick={() => cycleTeam(1)} aria-label="Next team" className="rounded-xl border border-slate-700 p-2 text-slate-400 transition hover:border-violet-400/60 hover:text-white">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button type="button" onClick={handleReset} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/40 px-4 text-sm font-black text-slate-200 transition hover:border-slate-500 hover:bg-slate-800">
                    <RotateCcw className="h-4 w-4" /> Reset
                  </button>
                  <button type="button" onClick={handleAutoSelect} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-950/30 transition hover:brightness-110" title={`Auto-select ${perTeamLimit} players`}>
                    <Sparkles className="h-4 w-4" /> Auto Select
                  </button>
                </div>
              </div>

              <PlayerProtectionRoster
                rows={sortedRoster}
                protectedIds={activeProtectedSet}
                familyLocked={familyLocked}
                protectionLimit={perTeamLimit}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                onToggle={handleToggle}
                formatSalary={formatSalary}
              />
            </section>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 bg-[#07111f] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="text-center text-xs font-black uppercase tracking-wide text-slate-400 sm:text-left">
              {!canSubmit ? (
                <span className="inline-flex items-center gap-2 text-violet-400">
                  <Shield className="h-4 w-4" />
                  {isGM
                    ? `Protect at least ${userMinExpected} players (currently ${userProtectionCount}).`
                    : `Your team must protect at least ${userMinExpected} players (currently ${userProtectionCount}).`}
                </span>
              ) : isGM ? (
                <span className="text-emerald-400">
                  Ready · {userProtectionCount} protected for {teamDisplayName(activeTeam, activeTid)}
                </span>
              ) : (
                <span className="text-emerald-400">All teams ready · {Object.keys(protections).length} rosters configured</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-slate-800 px-6 text-sm font-black text-white transition hover:bg-slate-700">Cancel</button>
              <button
                type="button"
                onClick={() => onConfirm(protections)}
                disabled={!canSubmit}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 text-sm font-black text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
              >
                Advance to Draft <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
