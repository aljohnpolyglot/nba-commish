import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer } from '../../../types';
import { ChevronDown, ChevronLeft, ChevronRight, Search, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { convertTo2KRating } from '../../../utils/helpers';
import { findTopComparisons } from '../../../utils/playerComparisons';
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';

const GIST_BASE = "https://gist.githubusercontent.com/aljohnpolyglot/bb8c80155c6c225cf1be9428892c6329/raw/";

// Module-level cache of scouting gist data keyed by draft year. Lets us prefetch
// the current class at game init and skip the loading spinner when the user
// opens Draft Scouting. `null` means the fetch already failed for that year
// (don't retry on every open).
const gistCache = new Map<number, GistProspect[] | null>();

async function fetchDraftClassScouting(year: number): Promise<GistProspect[] | null> {
  try {
    const res = await fetch(`${GIST_BASE}${year}classScouting`);
    const text = await res.text();
    const jsonStart = text.indexOf('[');
    if (jsonStart === -1) throw new Error('Invalid Gist format');
    return JSON.parse(text.substring(jsonStart));
  } catch (e) {
    console.error(`Failed to fetch scouting data for ${year}:`, e);
    return null;
  }
}

/** Prefetch and cache the scouting gist for a draft year. Safe to fire-and-forget
 *  from initialization — subsequent DraftScoutingView opens will see the cache. */
export function prefetchDraftScouting(year: number): Promise<void> {
  if (gistCache.has(year)) return Promise.resolve();
  return fetchDraftClassScouting(year).then(data => {
    gistCache.set(year, data);
  });
}

interface GistProspect {
  id: string;
  rank: string;
  name: string;
  position?: string;
  college?: string;
  headshot?: string;
  silo?: string;
  height?: string;
  age?: string;
  stats?: {
    pts?: number;
    reb?: number;
    ast?: number;
    fg?: string;
  };
  externalRanks?: {
    noCeilings?: string;
    espn?: string;
  };
  comparisons?: string;
  scoutingReport?: string;
}

interface EnhancedProspect extends NBAPlayer {
  gistData?: GistProspect;
  scoutRanks: {
    espn: number;
    noCeilings: number;
    consensus: number;
  };
  scoutingReport?: string;
  comparisons?: string;
  displayOvr: number;
  displayPot: number;
}

// Helper to normalize names for better matching
const normalizeName = (name: string) => {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, ""); // remove spaces, punctuation, suffixes
};

export const DraftScoutingView: React.FC = () => {
  const { state } = useGame();
  const [gistData, setGistData] = useState<GistProspect[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortType, setSortType] = useState<'rank' | 'name'>('rank');
  const [posFilter, setPosFilter] = useState('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const baseYear = state.leagueStats?.year ?? 2026;
  // Default to current draft class (roll forward after draft completes)
  const defaultDraftYear = state.draftComplete ? baseYear + 1 : baseYear;
  const [selectedYear, setSelectedYear] = useState(defaultDraftYear);
  // Browse range:
  //   minYear = lowest draft.year with a tid=-2 prospect still in state (or
  //     baseYear if none — prevents the left chevron from pointing into empty
  //     past classes that have already been drafted/removed).
  //   maxYear = max of (highest tid=-2 draft.year in state, baseYear + 4).
  //     Future classes only get seeded by ensureDraftClasses at rollover, so
  //     on a fresh game start only the current class exists. We still want the
  //     right chevron to let the user look ahead to years the scouting gist
  //     covers — 4-year horizon matches draftClassFiller's HORIZON_YEARS.
  const { minYear, maxYear } = useMemo(() => {
    // Floor: if the current season's draft is already done, the earliest browsable year is
    // next season — the current class's prospects are no longer tid=-2 in state.
    // Ceiling: only let the user navigate to classes that are actually seeded in state
    // (rookie classes get generated at game init / season rollover). Previously we extended
    // the horizon 4 years past the floor regardless, which produced "class not generated yet"
    // dead ends.
    const floor = state.draftComplete ? baseYear + 1 : baseYear;
    let lo = floor;
    let hi = floor;
    let seen = false;
    for (const p of state.players) {
      if (p.tid !== -2) continue;
      const dy = (p as any).draft?.year;
      if (typeof dy !== 'number') continue;
      if (dy < floor) continue; // skip already-drafted classes
      if (!seen) { lo = hi = dy; seen = true; }
      else { if (dy < lo) lo = dy; if (dy > hi) hi = dy; }
    }
    if (!seen) return { minYear: floor, maxYear: floor };
    return { minYear: lo, maxYear: hi };
  }, [state.players, baseYear, state.draftComplete]);
  const draftYear = selectedYear;

  useEffect(() => {
    setError(null);
    // Cache hit — set synchronously, no spinner
    if (gistCache.has(draftYear)) {
      const cached = gistCache.get(draftYear);
      if (cached) setGistData(cached);
      else {
        setGistData([]);
        setError(`Scout reports unavailable for the ${draftYear} class. Showing prospects from game data.`);
      }
      return;
    }
    // Cache miss — kick off a fetch in the background, populate when it lands
    setGistData([]);
    let cancelled = false;
    fetchDraftClassScouting(draftYear).then(data => {
      gistCache.set(draftYear, data);
      if (cancelled) return;
      if (data) setGistData(data);
      else setError(`Scout reports unavailable for the ${draftYear} class. Showing prospects from game data.`);
    });
    return () => { cancelled = true; };
  }, [draftYear]);

  // Future classes are only seeded at season rollover, so state may legitimately have
  // zero tid=-2 prospects for a year the user can scroll to. Tracking this lets us
  // show a "class not yet generated" message instead of the filter-miss empty state.
  const hasRawProspects = useMemo(
    () => state.players.some(p =>
      (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') &&
      (p as any).draft?.year === draftYear
    ),
    [state.players, draftYear]
  );

  const prospects = useMemo(() => {
    // Only show prospects from the active draft class (tid === -2 + correct draft.year)
    const draftProspects = state.players.filter(p =>
      (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') &&
      (p as any).draft?.year === draftYear
    );
    const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
    const activePlayers = state.players.filter(p =>
      p.tid >= 0 && p.tid < 100 &&
      p.status !== 'Draft Prospect' &&
      p.status !== 'Prospect' &&
      ((p as any).draft?.year ?? 0) < currentYear
    );

    // Calculate displayOvr + displayPot (K2 scale) for each prospect
    const prospectsWithOvr = draftProspects.map(p => {
      const lastRating = p.ratings?.[p.ratings.length - 1];
      const rawOvr = p.overallRating || (lastRating?.ovr || 0);
      const hgt = lastRating?.hgt ?? 50;
      const tp  = lastRating?.tp;
      const displayOvr = convertTo2KRating(rawOvr, hgt, tp);
      // POT: same formula as PlayerBiosView / tradeValueEngine
      const age = (p as any).born?.year ? currentYear - (p as any).born.year : ((p as any).age ?? 20);
      const potBbgm = age >= 29 ? rawOvr : Math.max(rawOvr, Math.round(72.314 + (-2.331 * age) + (0.833 * rawOvr)));
      const displayPot = convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), hgt, tp);
      return { ...p, displayOvr, displayPot, rawOvr };
    });

    // Sort by overall rating to determine initial consensus rank
    const sortedByOverall = prospectsWithOvr.sort((a, b) => b.displayOvr - a.displayOvr);

    // When gist is loaded, only show gist-matched players (scoped to this year's class).
    // When gist failed (error), show all tid=-2 as fallback — gistMatch will be null for all.
    const gistLoaded = gistData.length > 0;
    const withGistMatch = sortedByOverall.map(player => {
      if (!gistLoaded) return { player, gistMatch: null as GistProspect | null };
      const normalizedPlayerName = normalizeName(player.name);
      const gistMatch = gistData.find(g => {
        const normalizedGistName = normalizeName(g.name);
        return normalizedGistName === normalizedPlayerName ||
               normalizedGistName.includes(normalizedPlayerName) ||
               normalizedPlayerName.includes(normalizedGistName);
      });
      return { player, gistMatch: gistMatch ?? null };
    });
    // Filter to gist-matched when gist is available; otherwise show everything
    const candidateProspects = gistLoaded
      ? withGistMatch.filter(item => item.gistMatch !== null)
      : withGistMatch;

    const enhanced = candidateProspects.map(({ player, gistMatch }, index) => {
      const consensusRank = index + 1;

      const seed = player.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const random = (offset: number) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
      };

      const espnRank = Math.max(1, Math.round(consensusRank + (random(1) * 10 - 5)));
      const noCeilingsRank = Math.max(1, Math.round(consensusRank + (random(2) * 14 - 7)));

      // REAL-TIME PRO COMPARISONS — prospect projected to POT ceiling vs NBA players at current ratings
      const topMatches = findTopComparisons(player, activePlayers, false);
      const comparisonNames = topMatches.slice(0, 3).map(m => m.comparison.name).join(', ');

      return {
        ...player,
        gistData: gistMatch ?? undefined,
        scoutRanks: {
          consensus: consensusRank,
          espn: espnRank,
          noCeilings: noCeilingsRank,
        },
        scoutingReport: gistMatch?.scoutingReport || "Highly touted prospect with significant upside. Scouts are impressed by his physical tools and basketball IQ. Expected to be a high-impact player at the next level.",
        comparisons: comparisonNames || gistMatch?.comparisons || "TBD"
      } as EnhancedProspect;
    });

    return enhanced;
  }, [state.players, gistData]);

  const filteredAndSorted = useMemo(() => {
    let filtered = prospects;
    
    if (posFilter !== 'All') {
      filtered = filtered.filter(p => {
        if (posFilter === 'Guard') return p.pos?.includes('G');
        if (posFilter === 'Forward') return p.pos?.includes('F');
        if (posFilter === 'Center') return p.pos?.includes('C');
        if (posFilter === 'PF') return p.pos?.includes('PF');
        return true;
      });
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(lowerSearch));
    }

    return [...filtered].sort((a, b) => {
      if (sortType === 'name') return a.name.localeCompare(b.name);
      return a.scoutRanks.consensus - b.scoutRanks.consensus;
    });
  }, [prospects, posFilter, sortType, searchTerm]);

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
              <h1 className="text-2xl font-black text-white uppercase tracking-tight">Draft Scouting</h1>
              <p className="text-sm text-slate-400">Big Board & Prospect Analysis</p>
            </div>
          </div>
          {/* Year chevron picker */}
          <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2">
            <button
              onClick={() => { setSelectedYear(y => Math.max(minYear, y - 1)); setExpandedId(null); }}
              disabled={selectedYear <= minYear}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-black text-white px-2 min-w-[52px] text-center">
              {draftYear}
            </span>
            <button
              onClick={() => { setSelectedYear(y => Math.min(maxYear, y + 1)); setExpandedId(null); }}
              disabled={selectedYear >= maxYear}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search prospects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm"
            >
              <option value="All">All Positions</option>
              <option value="Guard">Guards</option>
              <option value="Forward">Forwards</option>
              <option value="Center">Centers</option>
            </select>
            <select
              value={sortType}
              onChange={(e) => setSortType(e.target.value as 'rank' | 'name')}
              className="bg-slate-900 border border-slate-800 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm"
            >
              <option value="rank">Sort by Rank</option>
              <option value="name">Sort by Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 custom-scrollbar">
        {filteredAndSorted.map((p) => (
          <div 
            key={p.internalId}
            className={`bg-slate-900 rounded-xl border transition-all cursor-pointer overflow-hidden ${expandedId === p.internalId ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'border-slate-800 hover:border-slate-700'}`}
            onClick={() => setExpandedId(expandedId === p.internalId ? null : p.internalId)}
          >
            <div className="flex items-center p-4 gap-4">
              <div className="w-12 flex-shrink-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-black ${p.scoutRanks.consensus <= 3 ? 'text-yellow-400' : 'text-slate-300'}`}>
                  #{p.scoutRanks.consensus}
                </span>
              </div>
              
              {(() => {
                // Synthesised prospects carry a facesjs `face` descriptor — render
                // that via MyFace instead of falling back to a dicebear avataaar,
                // which visually clashes with BBGM's cartoon style everywhere else
                // in the app. Real-photo prospects (gist silos / NBA imgURL) still
                // use the <img> path.
                const realImg = p.imgURL || p.gistData?.headshot;
                const face = (p as any).face;
                if (realImg) {
                  return (
                    <img
                      src={realImg}
                      alt={p.name}
                      className="w-12 h-12 rounded-full border-2 border-slate-800 bg-slate-950 object-cover object-top flex-shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  );
                }
                if (isRealFaceConfig(face)) {
                  return (
                    <div className="w-12 h-12 rounded-full border-2 border-slate-800 bg-slate-950 overflow-hidden flex-shrink-0 relative">
                      <div className="absolute left-1/2 top-1/2" style={{ width: 12 * 0.85 * 4, height: 12 * 1.275 * 4, transform: 'translate(-50%, -50%)' }}>
                        <MyFace face={face} style={{ width: '100%', height: '100%' }} />
                      </div>
                    </div>
                  );
                }
                const initials = p.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <div className="w-12 h-12 rounded-full border-2 border-slate-800 bg-slate-800 flex items-center justify-center text-sm font-black text-slate-300 flex-shrink-0">
                    {initials}
                  </div>
                );
              })()}

              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-white truncate">{p.name}</div>
                <div className="text-sm text-slate-400 truncate">
                  <span className="text-slate-300 font-semibold">{p.pos}</span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span>{p.gistData?.college || (p as any).college || 'International'}</span>
                  {p.age && (
                    <>
                      <span className="mx-1.5 text-slate-600">|</span>
                      <span>{p.age} y.o</span>
                    </>
                  )}
                </div>
              </div>

              {/* Stats — real when gist available, N/A otherwise (NCAA/external sims coming) */}
              <div className="hidden sm:flex gap-6 flex-shrink-0 mr-4">
                <div className="text-center">
                  <b className="block text-lg font-bold text-white">{p.gistData?.stats?.pts ?? '—'}</b>
                  <small className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">PTS</small>
                </div>
                <div className="text-center">
                  <b className="block text-lg font-bold text-white">{p.gistData?.stats?.reb ?? '—'}</b>
                  <small className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">REB</small>
                </div>
                <div className="text-center">
                  <b className="block text-lg font-bold text-white">{p.gistData?.stats?.ast ?? '—'}</b>
                  <small className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">AST</small>
                </div>
              </div>

              {/* OVR / POT badges */}
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">OVR</span>
                  <span className={`text-sm font-black ${(p as any).displayOvr >= 85 ? 'text-emerald-400' : (p as any).displayOvr >= 75 ? 'text-slate-200' : 'text-slate-400'}`}>{(p as any).displayOvr}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">POT</span>
                  <span className={`text-sm font-black ${(p as any).displayPot >= 90 ? 'text-yellow-400' : (p as any).displayPot >= 85 ? 'text-emerald-400' : (p as any).displayPot >= 78 ? 'text-indigo-400' : 'text-slate-400'}`}>{(p as any).displayPot}</span>
                </div>
              </div>

              <ChevronDown className={`w-5 h-5 flex-shrink-0 text-slate-500 transition-transform duration-200 ${expandedId === p.internalId ? 'rotate-180 text-indigo-400' : ''}`} />
            </div>

            <AnimatePresence>
              {expandedId === p.internalId && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-slate-800 bg-slate-950/50"
                >
                  <div className="p-6 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
                    {/* Left Column: Image & Physicals */}
                    <div className="space-y-4">
                      <div className="h-48 bg-slate-900 rounded-lg flex items-end justify-center overflow-hidden relative border border-slate-800">
                        {(() => {
                          const realImg = p.gistData?.silo || p.imgURL;
                          const face = (p as any).face;
                          if (realImg) {
                            return (
                              <img
                                src={realImg}
                                className="h-full w-full object-contain object-bottom"
                                alt={p.name}
                                referrerPolicy="no-referrer"
                              />
                            );
                          }
                          if (isRealFaceConfig(face)) {
                            return (
                              <div className="h-full w-full flex items-center justify-center">
                                <div style={{ width: '80%', height: '100%' }}>
                                  <MyFace face={face} style={{ width: '100%', height: '100%' }} />
                                </div>
                              </div>
                            );
                          }
                          const initials = p.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                          return (
                            <div className="h-full w-full flex items-center justify-center text-5xl font-black text-slate-600">
                              {initials}
                            </div>
                          );
                        })()}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-center">
                          <small className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Height</small>
                          <b className="text-white font-medium">{p.gistData?.height || `${Math.floor((p.hgt || 72) / 12)}'${(p.hgt || 72) % 12}"`}</b>
                        </div>
                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-center">
                          <small className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Age</small>
                          <b className="text-white font-medium">{p.age || '19'}</b>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Stats & Scouting */}
                    <div className="space-y-6">
                      {/* Big Board Ranks */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Big Board Rankings</h4>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-center">
                            <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Consensus</span>
                            <b className="text-xl text-white font-bold">#{p.scoutRanks.consensus}</b>
                          </div>
                          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-center">
                            <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">ESPN</span>
                            <b className="text-xl text-white font-bold">#{p.scoutRanks.espn}</b>
                          </div>
                          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-center">
                            <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">No Ceilings</span>
                            <b className="text-xl text-white font-bold">#{p.scoutRanks.noCeilings}</b>
                          </div>
                        </div>
                      </div>

                      {/* Scouting Report */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Scouting Report</h4>
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                          <div className="text-sm font-medium text-indigo-400 mb-3 pb-3 border-b border-slate-800">
                            Pro Comparisons: <span className="text-white">{p.comparisons}</span>
                          </div>
                          <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {p.scoutingReport}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
        {filteredAndSorted.length === 0 && (
          hasRawProspects ? (
            <div className="text-center p-12 text-slate-400">
              No prospects found matching your filters.
            </div>
          ) : (
            <div className="text-center p-12 text-slate-400 space-y-2">
              <p className="text-base font-bold text-white">The {draftYear} draft class hasn't been generated yet.</p>
              <p className="text-sm">Rookie classes are seeded at the start of each season — check back after the league rolls over into {draftYear}.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};
