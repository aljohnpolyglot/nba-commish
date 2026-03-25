import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer } from '../../../types';
import { ChevronDown, Loader2, AlertCircle, Search, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { convertTo2KRating } from '../../../utils/helpers';

const GIST_URL = "https://gist.githubusercontent.com/aljohnpolyglot/bb8c80155c6c225cf1be9428892c6329/raw/2026classScouting";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortType, setSortType] = useState<'rank' | 'name'>('rank');
  const [posFilter, setPosFilter] = useState('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log("Fetching draft scouting data from Gist...");
        const res = await fetch(GIST_URL);
        const text = await res.text();
        const jsonStart = text.indexOf('[');
        if (jsonStart === -1) throw new Error("Invalid Gist format");
        const json = text.substring(jsonStart);
        const data = JSON.parse(json);
        console.log(`Successfully loaded ${data.length} prospects from Gist.`);
        setGistData(data);
      } catch (e) {
        console.error("Failed to fetch scouting data:", e);
        setError("Could not fetch scouting data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const prospects = useMemo(() => {
    const draftProspects = state.players.filter(p => p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect');
    
    // Calculate displayOvr for each prospect
    const prospectsWithOvr = draftProspects.map(p => {
      const rawOvr = p.overallRating || (p.ratings?.[0]?.ovr || 0);
      const displayOvr = convertTo2KRating(rawOvr, p.hgt || 50);
      return { ...p, displayOvr, rawOvr };
    });

    // Sort by overall rating to determine initial consensus rank
    const sortedByOverall = prospectsWithOvr.sort((a, b) => b.displayOvr - a.displayOvr);
    
    // First, find matches and filter out those without a Gist match
    const matchedProspects = sortedByOverall.map(player => {
      const normalizedPlayerName = normalizeName(player.name);
      const gistMatch = gistData.find(g => {
        const normalizedGistName = normalizeName(g.name);
        return normalizedGistName === normalizedPlayerName || 
               normalizedGistName.includes(normalizedPlayerName) || 
               normalizedPlayerName.includes(normalizedGistName);
      });
      return { player, gistMatch };
    }).filter(item => item.gistMatch);

    let matchCount = matchedProspects.length;

    const enhanced = matchedProspects.map(({ player, gistMatch }, index) => {
      const consensusRank = index + 1;
      
      // Generate some variance for ESPN and No Ceilings ranks
      // Use a consistent seed based on player name/id for stability
      const seed = player.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const random = (offset: number) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
      };

      // Ranks are based on consensus rank but with some "scout disagreement"
      const espnRank = Math.max(1, Math.round(consensusRank + (random(1) * 10 - 5)));
      const noCeilingsRank = Math.max(1, Math.round(consensusRank + (random(2) * 14 - 7)));

      return {
        ...player,
        gistData: gistMatch,
        scoutRanks: {
          consensus: consensusRank,
          espn: espnRank,
          noCeilings: noCeilingsRank,
        },
        scoutingReport: gistMatch?.scoutingReport || "Highly touted prospect with significant upside. Scouts are impressed by his physical tools and basketball IQ. Expected to be a high-impact player at the next level.",
        comparisons: gistMatch?.comparisons || "TBD"
      } as EnhancedProspect;
    });

    console.log(`Showing ${matchCount} draft prospects with Gist data (filtered out ${draftProspects.length - matchCount} generic prospects).`);
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

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <p className="text-sm uppercase tracking-wider font-medium">Loading Scouting Reports...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-xl text-red-400 mb-2 font-bold">Failed to load</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-slate-950 border-b border-slate-800 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <Target className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">Draft Scouting</h1>
            <p className="text-sm text-slate-400">Big Board & Prospect Analysis</p>
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
              
              <img 
                src={p.imgURL || p.gistData?.headshot || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`} 
                alt={p.name} 
                className="w-12 h-12 rounded-full border-2 border-slate-800 bg-slate-950 object-cover object-top flex-shrink-0"
                referrerPolicy="no-referrer"
              />

              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-white truncate">{p.name}</div>
                <div className="text-sm text-slate-400 truncate">
                  <span className="text-slate-300 font-semibold">{p.pos}</span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span>{p.gistData?.college || 'International'}</span>
                  {p.age && (
                    <>
                      <span className="mx-1.5 text-slate-600">|</span>
                      <span>{p.age} y.o</span>
                    </>
                  )}
                </div>
              </div>

              <div className="hidden sm:flex gap-6 flex-shrink-0 mr-4">
                <div className="text-center">
                  <b className="block text-lg font-bold text-white">{p.gistData?.stats?.pts || (p.displayOvr / 4).toFixed(1)}</b>
                  <small className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">PTS</small>
                </div>
                <div className="text-center">
                  <b className="block text-lg font-bold text-white">{p.gistData?.stats?.reb || (p.displayOvr / 8).toFixed(1)}</b>
                  <small className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">REB</small>
                </div>
                <div className="text-center">
                  <b className="block text-lg font-bold text-white">{p.gistData?.stats?.ast || (p.displayOvr / 10).toFixed(1)}</b>
                  <small className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">AST</small>
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
                        <img 
                          src={p.gistData?.silo || p.imgURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`} 
                          className="h-full w-full object-contain object-bottom" 
                          alt={p.name}
                          referrerPolicy="no-referrer"
                        />
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
          <div className="text-center p-12 text-slate-400">
            No prospects found matching your filters.
          </div>
        )}
      </div>
    </div>
  );
};
