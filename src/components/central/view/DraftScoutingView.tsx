import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import type { NBAPlayer } from '../../../types';
import { ChevronLeft, ChevronRight, Search, Target } from 'lucide-react';
import { convertTo2KRating } from '../../../utils/helpers';
import { getDisplayAge, estimatePotentialBbgm } from '../../../utils/playerRatings';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { DraftScoutingModal } from '../../draft/DraftScoutingModal';
import { PlayerBioView } from './PlayerBioView';
import { buildMockDraft } from '../../../services/draftAdvisor';
import { buildFullDraftSlotMap } from '../../../services/draft/draftClassStrength';
import { getCapThresholds } from '../../../utils/salaryUtils';
import {
  ensureDraftScouting,
  getCachedDraftScouting,
  matchProspectToGist,
  type GistProspect,
} from '../../../services/draftScoutingGist';
import {
  getClassPercentiles,
  getClassAverages,
  computeSkillScores,
  SKILL_AXES,
  type ClassPercentileMaps,
  type SkillAxis,
} from '../../../services/scoutingReport';

// ── Re-export for backward compat (initialization.ts used to import from here) ──
// We extracted the gist logic; keep the symbol exported so any older callers
// continue to resolve.
export { prefetchDraftScouting } from '../../../services/draftScoutingGist';

interface MockProspect extends NBAPlayer {
  displayOvr: number;
  displayPot: number;
  derivedAge: number;
  consensusRank: number;
  espnRank?: number;
  noCeilingsRank?: number;
  gistMatch?: GistProspect | null;
}

const POS_FILTERS = ['All', 'Guard', 'Forward', 'Center'] as const;
type PosFilter = typeof POS_FILTERS[number];

const matchesPosFilter = (p: NBAPlayer, f: PosFilter): boolean => {
  if (f === 'All') return true;
  const pos = p.pos ?? '';
  if (f === 'Guard') return pos.includes('G');
  if (f === 'Forward') return pos.includes('F') && !pos.includes('FC');
  if (f === 'Center') return pos.includes('C');
  return true;
};

export const DraftScoutingView: React.FC = () => {
  const { state } = useGame();

  const baseYear = state.leagueStats?.year ?? 2026;
  const defaultDraftYear = state.draftComplete ? baseYear + 1 : baseYear;
  const [selectedYear, setSelectedYear] = useState(defaultDraftYear);
  const [posFilter, setPosFilter] = useState<PosFilter>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [scoutingPlayer, setScoutingPlayer] = useState<MockProspect | null>(null);
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [skillFilter, setSkillFilter] = useState<SkillAxis | null>(null);
  const [gistData, setGistData] = useState<GistProspect[] | null>(getCachedDraftScouting(selectedYear) ?? null);
  const [error, setError] = useState<string | null>(null);

  // Browse range:
  //   minYear = lowest tid=-2 draft.year still in state (or current floor when class is drafted out)
  //   maxYear = max(highest tid=-2 draft.year, floor + 4)
  const { minYear, maxYear } = useMemo(() => {
    const floor = state.draftComplete ? baseYear + 1 : baseYear;
    let lo = floor, hi = floor, seen = false;
    for (const p of state.players) {
      if (p.tid !== -2) continue;
      const dy = (p as any).draft?.year;
      if (typeof dy !== 'number' || dy < floor) continue;
      if (!seen) { lo = hi = dy; seen = true; }
      else { if (dy < lo) lo = dy; if (dy > hi) hi = dy; }
    }
    if (!seen) return { minYear: floor, maxYear: floor + 4 };
    return { minYear: lo, maxYear: Math.max(hi, floor + 4) };
  }, [state.players, baseYear, state.draftComplete]);

  const draftYear = selectedYear;
  const currentLeagueYear = state.leagueStats?.year ?? new Date().getFullYear();

  // Lazy gist fetch per draft year
  useEffect(() => {
    setError(null);
    const cached = getCachedDraftScouting(draftYear);
    if (cached !== undefined) {
      setGistData(cached);
      if (!cached) setError(`Scout reports unavailable for the ${draftYear} class. Showing prospects from game data.`);
      return;
    }
    setGistData(null);
    let cancelled = false;
    ensureDraftScouting(draftYear).then(data => {
      if (cancelled) return;
      setGistData(data);
      if (!data) setError(`Scout reports unavailable for the ${draftYear} class. Showing prospects from game data.`);
    });
    return () => { cancelled = true; };
  }, [draftYear]);

  // Raw prospects for the selected year — converted to display OVR/POT (K2 scale)
  const prospects = useMemo<MockProspect[]>(() => {
    const raw = state.players.filter(p =>
      (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') &&
      (p as any).draft?.year === draftYear,
    );
    if (raw.length === 0) return [];
    const enriched = raw.map(p => {
      const last = p.ratings?.[p.ratings.length - 1];
      const rawOvr = p.overallRating || (last?.ovr ?? 0);
      const hgt = last?.hgt ?? 50;
      const tp = last?.tp;
      const displayOvr = convertTo2KRating(rawOvr, hgt, tp);
      const age = getDisplayAge(p, currentLeagueYear);
      const storedPot = last?.pot;
      const rawPot = (storedPot != null && storedPot > 0)
        ? storedPot
        : (age >= 29 ? rawOvr : Math.max(rawOvr, estimatePotentialBbgm(rawOvr, age)));
      const potBbgm = Math.max(rawOvr, rawPot);
      const displayPot = convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), hgt, tp);
      return {
        ...p,
        displayOvr,
        displayPot,
        derivedAge: age,
      } as MockProspect;
    }).sort((a, b) => b.displayOvr - a.displayOvr);

    // Consensus rank = sort order. ESPN/NoCeilings come from gist when available;
    // a stable seeded offset is used as the fallback for prospects not in the gist
    // so the rank chips don't disappear off the deep board.
    return enriched.map((p, i) => {
      const gistMatch = matchProspectToGist(p, gistData);
      const seed = p.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const rand = (offset: number) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
      };
      const espnRank = gistMatch?.externalRanks?.espn
        ? parseInt(gistMatch.externalRanks.espn, 10) || undefined
        : Math.max(1, Math.round(i + 1 + (rand(1) * 10 - 5)));
      const noCeilingsRank = gistMatch?.externalRanks?.noCeilings
        ? parseInt(gistMatch.externalRanks.noCeilings, 10) || undefined
        : Math.max(1, Math.round(i + 1 + (rand(2) * 14 - 7)));
      return {
        ...p,
        consensusRank: i + 1,
        espnRank,
        noCeilingsRank,
        gistMatch,
      };
    });
  }, [state.players, draftYear, currentLeagueYear, gistData]);

  // Active NBA players — the comparison pool for findTopComparisons in the modal.
  const activePlayers = useMemo(() =>
    state.players.filter(p =>
      p.tid >= 0 && p.tid < 100 &&
      p.status !== 'Draft Prospect' &&
      p.status !== 'Prospect' &&
      ((p as any).draft?.year ?? 0) < currentLeagueYear,
    ),
  [state.players, currentLeagueYear]);

  // Class percentile maps + averages — modal data, computed once per class.
  const classAverages = useMemo(() => getClassAverages(prospects), [prospects]);
  const percentilesByPos = useMemo(() => {
    const m = new Map<string, ClassPercentileMaps>();
    m.set('Guard', getClassPercentiles(prospects, 'Guard'));
    m.set('Forward', getClassPercentiles(prospects, 'Forward'));
    m.set('Center', getClassPercentiles(prospects, 'Center'));
    m.set('Class', getClassPercentiles(prospects, 'Class'));
    return m;
  }, [prospects]);

  // Build the projected draft order (mirrors DraftSimulatorView's logic).
  const draftOrder = useMemo(() => {
    if (draftYear !== currentLeagueYear) {
      // Future class — fall back to current standings as a generic order
      return [...state.teams]
        .filter(t => t.id >= 0 && t.id < 100)
        .sort((a, b) => {
          const wa = a.wins / Math.max(1, a.wins + a.losses);
          const wb = b.wins / Math.max(1, b.wins + b.losses);
          return wa - wb;
        })
        .flatMap(t => [t, t]); // R1 + R2 same order
    }
    const draftPicks: any[] = (state as any).draftPicks ?? [];
    const eligibleTeams = state.teams.filter(t => t.id >= 0 && t.id < 100);
    const allSorted = [...eligibleTeams].sort((a, b) => {
      const wa = a.wins / Math.max(1, a.wins + a.losses);
      const wb = b.wins / Math.max(1, b.wins + b.losses);
      return wa - wb;
    });
    // Use the shared slot resolver — covers partial lottery arrays AND extends
    // through non-lottery teams (#15-30). Empty map → lottery hasn't fired.
    const slotMap = buildFullDraftSlotMap(state.draftLotteryResult as any, state.teams);
    let r1Source: any[];
    if (slotMap.size > 0) {
      const ordered = eligibleTeams
        .filter(t => slotMap.has(t.id))
        .sort((a, b) => (slotMap.get(a.id)! - slotMap.get(b.id)!));
      const missing = allSorted.filter(t => !slotMap.has(t.id));
      r1Source = [...ordered, ...missing];
    } else {
      r1Source = allSorted;
    }
    const resolveOwner = (round: number, originalTeam: any) => {
      const pick = draftPicks.find(p => p.season === draftYear && p.round === round && p.originalTid === originalTeam.id);
      const meta = {
        _originalTid: originalTeam.id,
        _originalAbbrev: originalTeam.abbrev,
        _originalName: originalTeam.name,
      };
      if (!pick || pick.tid === originalTeam.id) return { ...originalTeam, ...meta, _traded: false };
      const newOwner = state.teams.find(t => t.id === pick.tid);
      if (!newOwner) return { ...originalTeam, ...meta, _traded: false };
      return { ...newOwner, ...meta, _traded: true };
    };
    const r1 = r1Source.map(t => resolveOwner(1, t));
    const r2 = r1Source.map(t => ({ ...resolveOwner(2, t), _r2: true }));
    return [...r1, ...r2];
  }, [state.teams, state.draftLotteryResult, (state as any).draftPicks, draftYear, currentLeagueYear]);

  // Stable hashes prevent the mock-draft useMemo from rebuilding when unrelated
  // player state shifts (e.g. an extension on a non-prospect updates state.players).
  const prospectsHash = useMemo(
    () => prospects.map(p => `${p.internalId}:${p.displayOvr}:${p.displayPot}`).join('|'),
    [prospects],
  );
  const teamsHash = useMemo(
    () => state.teams.map(t => `${t.id}:${t.wins}:${t.losses}`).join('|'),
    [state.teams],
  );
  const draftOrderHash = useMemo(
    () => draftOrder.map((t: any) => `${t?.id}:${t?._traded ? 'T' : 'O'}`).join('|'),
    [draftOrder],
  );

  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

  // The mock-draft simulation. Cached on viewYear + stable input hashes.
  const mockDraft = useMemo(() => {
    if (prospects.length === 0 || draftOrder.length === 0) return [];
    return buildMockDraft({
      prospects,
      draftOrder,
      allTeams: state.teams,
      allPlayers: state.players,
      leagueStats: state.leagueStats,
      thresholds,
      gameMode: state.gameMode,
      userTeamId: state.userTeamId ?? null,
      currentYear: currentLeagueYear,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftYear, prospectsHash, teamsHash, draftOrderHash]);

  // Top-33% set for the active skill filter — recomputed only when the skill
  // changes or the prospect pool refreshes (year change).
  const skillTopSet = useMemo(() => {
    if (!skillFilter) return null;
    const scored = prospects.map(p => ({
      id: p.internalId,
      score: computeSkillScores(p)[skillFilter],
    }));
    scored.sort((a, b) => b.score - a.score);
    const cut = Math.max(1, Math.ceil(scored.length / 3));
    return new Set(scored.slice(0, cut).map(s => s.id));
  }, [skillFilter, prospects]);

  // Highlight predicate — search + pos + skill filters intersect. When none
  // are active, every slot is "matched" so dimming never kicks in.
  const isFilterActive = !!searchTerm || posFilter !== 'All' || !!skillFilter;
  const matchesHighlight = (p: NBAPlayer | null): boolean => {
    if (!p) return false;
    if (!isFilterActive) return true;
    if (posFilter !== 'All' && !matchesPosFilter(p, posFilter)) return false;
    if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (skillTopSet && !skillTopSet.has(p.internalId)) return false;
    return true;
  };

  const hasRawProspects = prospects.length > 0;

  // Undrafted prospects — those in the class but not in the mock draft
  const draftedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of mockDraft) {
      if (slot.prospect?.internalId) {
        ids.add(slot.prospect.internalId);
      }
    }
    return ids;
  }, [mockDraft]);

  const undraftedProspects = useMemo(() =>
    prospects.filter(p => !draftedIds.has(p.internalId)),
    [prospects, draftedIds],
  );

  // Comp-card click in the scouting modal jumps to that player's bio view.
  if (viewingBioPlayer) {
    return <PlayerBioView player={viewingBioPlayer} onBack={() => setViewingBioPlayer(null)} />;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-slate-950 border-b border-slate-800 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Target className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tight">Mock Draft</h1>
              <p className="text-sm text-slate-400">Projected pick by pick — click any slot for a full scouting report</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2">
            <button
              onClick={() => setSelectedYear(y => Math.max(minYear, y - 1))}
              disabled={selectedYear <= minYear}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-black text-white px-2 min-w-[52px] text-center">{draftYear}</span>
            <button
              onClick={() => setSelectedYear(y => Math.min(maxYear, y + 1))}
              disabled={selectedYear >= maxYear}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Highlight prospects by name…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
            />
          </div>
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {POS_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setPosFilter(f)}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${
                  posFilter === f ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Skill highlight chips — top 33% in the chosen skill glow, rest dim */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mr-1">Highlight skill</span>
          {SKILL_AXES.map(skill => (
            <button
              key={skill}
              onClick={() => setSkillFilter(s => (s === skill ? null : skill))}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md border transition-all ${
                skillFilter === skill
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              {skill}
            </button>
          ))}
          {skillFilter && (
            <button
              onClick={() => setSkillFilter(null)}
              className="px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-white transition-colors"
            >
              clear
            </button>
          )}
        </div>

        {error && (
          <p className="text-[11px] font-medium text-amber-500/80 mt-3">{error}</p>
        )}
      </div>

      {/* Mock draft body */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        {!hasRawProspects ? (
          <div className="text-center p-12 text-slate-400 space-y-2">
            <p className="text-base font-bold text-white">The {draftYear} draft class hasn't been generated yet.</p>
            <p className="text-sm">Rookie classes are seeded at the start of each season — check back after the league rolls over into {draftYear}.</p>
          </div>
        ) : mockDraft.length === 0 && undraftedProspects.length === 0 ? (
          <div className="text-center p-12 text-slate-400">
            <p className="text-sm">Draft order isn't available for the {draftYear} class yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Drafted prospects */}
            {mockDraft.length > 0 && (
              <div>
                <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-3 px-1">Projected Picks</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {mockDraft.map(slot => {
                    const p = slot.prospect as MockProspect | null;
                    const team = slot.team;
                    const matched = matchesHighlight(p);
                    const dim = isFilterActive && !matched;
                    return (
                      <button
                        key={slot.pick}
                        onClick={() => p && setScoutingPlayer(p)}
                        disabled={!p}
                        className={`group bg-[#1A1A1A] border border-[#333] rounded-sm flex h-20 overflow-hidden transition-all text-left ${
                          p ? 'cursor-pointer hover:border-indigo-600' : 'cursor-default'
                        } ${dim ? 'opacity-25' : 'opacity-100'} ${matched && isFilterActive && p ? 'border-amber-500/70 shadow-[0_0_14px_rgba(245,158,11,0.25)]' : ''}`}
                      >
                        {/* Pick # */}
                        <div className="w-11 flex items-center justify-center shrink-0 bg-indigo-900/60">
                          <span className="text-xl font-black text-white">{String(slot.pick).padStart(2, '0')}</span>
                        </div>

                        {/* Photo */}
                        <div className="w-20 bg-[#111] relative shrink-0 flex items-center justify-center">
                          {p ? (
                            <PlayerPortrait
                              imgUrl={p.imgURL || p.gistMatch?.headshot}
                              face={(p as any).face}
                              playerName={p.name}
                              size={56}
                            />
                          ) : (
                            <span className="text-white/15 text-2xl font-black">—</span>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                          {p ? (
                            <>
                              <p className="font-black text-white text-base truncate uppercase tracking-tight">{p.name}</p>
                              <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex flex-wrap items-center gap-1">
                                <span>{p.pos}</span>
                                <span className="text-white/20">·</span>
                                <span>{p.derivedAge}y</span>
                                <span className="text-white/20">·</span>
                                <span className="text-indigo-300">OVR {p.displayOvr}</span>
                                <span className="text-white/20">·</span>
                                <span className="text-emerald-400/70">POT {p.displayPot}</span>
                                {((p as any).college || p.gistMatch?.college) && (
                                  <>
                                    <span className="text-white/20">·</span>
                                    <span className="truncate">{(p as any).college || p.gistMatch?.college}</span>
                                  </>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="font-black text-white/40 text-sm uppercase tracking-tight">Best Player Available</p>
                          )}
                        </div>

                        {/* Team logo + abbrev — shows current owner; "via ORIG" when traded */}
                        <div className="w-20 flex items-center justify-center shrink-0 border-l border-[#333] bg-black/20 group-hover:bg-black/40 transition-colors flex-col gap-0.5 py-1">
                          {team?.logoUrl ? (
                            <img src={team.logoUrl} alt="" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-[10px] font-black text-white/30">{team?.abbrev}</span>
                          )}
                          <span className="text-[8px] font-black text-white/50 uppercase tracking-widest">{team?.abbrev}</span>
                          {(team as any)?._traded && (
                            <span className="text-[7px] font-bold text-indigo-400/70 uppercase tracking-wider">via {(team as any)._originalAbbrev}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Undrafted prospects */}
            {undraftedProspects.length > 0 && (
              <div>
                <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-3 px-1">Undrafted</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {undraftedProspects.map(p => {
                    const matched = matchesHighlight(p);
                    const dim = isFilterActive && !matched;
                    return (
                      <button
                        key={p.internalId}
                        onClick={() => setScoutingPlayer(p)}
                        className={`group bg-[#1A1A1A] border border-[#333] rounded-sm flex h-20 overflow-hidden transition-all text-left cursor-pointer hover:border-slate-500 ${
                          dim ? 'opacity-25' : 'opacity-100'
                        } ${matched && isFilterActive ? 'border-amber-500/70 shadow-[0_0_14px_rgba(245,158,11,0.25)]' : ''}`}
                      >
                        {/* Rank placeholder */}
                        <div className="w-11 flex items-center justify-center shrink-0 bg-slate-800/40">
                          <span className="text-xs font-bold text-slate-400">—</span>
                        </div>

                        {/* Photo */}
                        <div className="w-20 bg-[#111] relative shrink-0 flex items-center justify-center">
                          <PlayerPortrait
                            imgUrl={p.imgURL || p.gistMatch?.headshot}
                            face={(p as any).face}
                            playerName={p.name}
                            size={56}
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                          <p className="font-black text-white text-base truncate uppercase tracking-tight">{p.name}</p>
                          <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex flex-wrap items-center gap-1">
                            <span>{p.pos}</span>
                            <span className="text-white/20">·</span>
                            <span>{p.derivedAge}y</span>
                            <span className="text-white/20">·</span>
                            <span className="text-indigo-300">OVR {p.displayOvr}</span>
                            <span className="text-white/20">·</span>
                            <span className="text-emerald-400/70">POT {p.displayPot}</span>
                            {((p as any).college || p.gistMatch?.college) && (
                              <>
                                <span className="text-white/20">·</span>
                                <span className="truncate">{(p as any).college || p.gistMatch?.college}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* FA label */}
                        <div className="w-20 flex items-center justify-center shrink-0 border-l border-[#333] bg-black/20 group-hover:bg-black/40 transition-colors flex-col py-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">FA</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Shared scouting modal */}
      <DraftScoutingModal
        player={scoutingPlayer}
        onClose={() => setScoutingPlayer(null)}
        classProspects={prospects}
        activePlayers={activePlayers}
        percentilesByPos={percentilesByPos}
        classAverages={classAverages}
        draftYear={draftYear}
        gistData={scoutingPlayer?.gistMatch ?? null}
        ranks={scoutingPlayer ? {
          consensus: scoutingPlayer.consensusRank,
          espn: scoutingPlayer.espnRank,
          noCeilings: scoutingPlayer.noCeilingsRank,
        } : undefined}
        teamLogoUrl={(() => {
          if (!scoutingPlayer) return undefined;
          const slot = mockDraft.find(s => s.prospect?.internalId === scoutingPlayer.internalId);
          return (slot?.team as any)?.logoUrl;
        })()}
        onViewPlayerBio={(p) => setViewingBioPlayer(p)}
      />
    </div>
  );
};
