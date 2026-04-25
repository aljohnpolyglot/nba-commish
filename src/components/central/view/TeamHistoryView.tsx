import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Users, History, Star, TrendingUp, Award,
  LayoutGrid, ChevronRight, Search, ArrowLeft, Loader,
} from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { getAllCachedSeasons } from '../../../data/brefFetcher';
import {
  fetchRegularRecords, fetchPlayoffRecords, fetchCareerLeaders, fetchAverageLeaders,
  fetchMissingPortraits,
  filterToTeam, getStatValue, CATEGORY_ORDER, CATEGORY_ORDER_AVG,
  cleanName, computeLiveTotals, mergeCareerLeaders, mergeAverageLeaders, STAT_MAP, parseStatVal,
} from '../../../data/franchiseService';
import {
  ensurePhotosLoaded, getPhotoBySlug, getPhotoByName,
} from '../../../data/realPlayerDataFetcher';
import { getTeamMascot } from '../../../utils/helpers';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';
import type { Tab } from '../../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Cross-view handoff: LeagueHistoryView calls requestTeamHistoryFor(tid, from)
// then navigates to 'Team History'. We consume the pending tid once on mount.
// `from` tells us where to route the back button (default: team list).
// ─────────────────────────────────────────────────────────────────────────────
let _pendingTeamHistoryTid: number | null = null;
let _pendingOrigin: Tab | null = null;
export function requestTeamHistoryFor(tid: number, from?: Tab) {
  _pendingTeamHistoryTid = tid;
  _pendingOrigin = from ?? null;
}

const NBA_HUB_ID = -9999;

// ─────────────────────────────────────────────────────────────────────────────
// Color utilities
// ─────────────────────────────────────────────────────────────────────────────

function getLuminance(hex: string): number {
  const rgb = hex.replace(/^#/, '').match(/.{2}/g)?.map(x => parseInt(x, 16)) ?? [0, 0, 0];
  const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function isGrayscale(hex: string): boolean {
  const rgb = hex.replace(/^#/, '').match(/.{2}/g)?.map(x => parseInt(x, 16)) ?? [0, 0, 0];
  return Math.max(...rgb) - Math.min(...rgb) < 30;
}
function getBestAccentColor(colors: string[] | undefined, teamName?: string): string {
  if (!colors?.length) return '#94a3b8';
  const n = (teamName ?? '').toLowerCase();
  if (n.includes('bucks')) return '#00471b';
  if (n.includes('kings')) return '#5a2d81';
  if (n.includes('jazz')) return '#f9eb0f';
  if (n.includes('lakers')) return '#552583';
  if (n.includes('celtics')) return '#008348';
  if (n.includes('thunder')) return '#007ac1';
  if (n.includes('rockets') || n.includes('bulls') || n.includes('pistons')) return '#ce1141';
  if (n.includes('hawks') || n.includes('blazers')) return '#e03a3e';
  if (n.includes('pelicans')) return '#b4975a';
  if (!isGrayscale(colors[0]) && getLuminance(colors[0]) > 0.05) return colors[0];
  const vibrant = colors.filter(c => !isGrayscale(c) && getLuminance(c) > 0.07);
  if (vibrant.length) return [...vibrant].sort((a, b) => getLuminance(b) - getLuminance(a))[0];
  return '#94a3b8';
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar fallback
// ─────────────────────────────────────────────────────────────────────────────

function avatarFallback(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=18181b&color=94a3b8&bold=true`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface TeamHistoryViewProps {
  onViewChange?: (view: Tab) => void;
}

export const TeamHistoryView: React.FC<TeamHistoryViewProps> = ({ onViewChange }) => {
  const { state } = useGame();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(() => {
    const t = _pendingTeamHistoryTid;
    _pendingTeamHistoryTid = null;
    return t;
  });
  const [originView, setOriginView] = useState<Tab | null>(() => {
    const o = _pendingOrigin;
    _pendingOrigin = null;
    return o;
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'records' | 'leaders' | 'history'>('overview');
  const [recordType, setRecordType] = useState<'regular' | 'playoff'>('regular');
  const [leaderSubTab, setLeaderSubTab] = useState<'totals' | 'averages'>('totals');
  const [expandedLeaders, setExpandedLeaders] = useState<Record<string, boolean>>({});
  const [expandedRecords, setExpandedRecords] = useState<Record<string, boolean>>({});

  // External data (gists)
  const [regularRecords, setRegularRecords] = useState<any[]>([]);
  const [playoffRecords, setPlayoffRecords] = useState<any[]>([]);
  const [careerLeaders, setCareerLeaders] = useState<any[]>([]);
  const [averageLeaders, setAverageLeaders] = useState<any[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  // Portrait map from missing-portraits gist: name.toLowerCase() → portrait URL
  const [portraitMap, setPortraitMap] = useState<Map<string, string>>(new Map());

  const NBA_HUB_TEAM: any = {
    id: NBA_HUB_ID, name: 'Association', region: 'National Basketball', abbrev: 'NBA',
    colors: ['#1D428A', '#C8102E'], conference: 'League',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg',
  };
  const selectedTeam = selectedTeamId === NBA_HUB_ID
    ? NBA_HUB_TEAM
    : (selectedTeamId != null ? state.teams.find(t => t.id === selectedTeamId) ?? null : null);
  const isNBAHub = selectedTeamId === NBA_HUB_ID;

  // ── Live career totals for active sim players ─────────────────────────────
  const liveTotals = useMemo(() => {
    if (!selectedTeam) return [];
    return computeLiveTotals(state.players, selectedTeam.id);
  }, [state.players, selectedTeamId]);

  // ── Merged career leaders (live overrides gist) ───────────────────────────
  const mergedCareer = useMemo(() => mergeCareerLeaders(careerLeaders, liveTotals), [careerLeaders, liveTotals]);
  const mergedAverage = useMemo(() => mergeAverageLeaders(averageLeaders, liveTotals), [averageLeaders, liveTotals]);

  // ── Accent colors ─────────────────────────────────────────────────────────
  const accent = selectedTeam ? getBestAccentColor(selectedTeam.colors, selectedTeam.name) : '#94a3b8';
  const accentMuted = accent + '22';

  // ── Player photo helper ───────────────────────────────────────────────────
  const findPlayerImg = (name: string): string => {
    const key = name?.toLowerCase().trim();
    // 1. Live sim player — prefer imgURL, then player-photos.json by srID
    const p = state.players.find(pl => pl.name?.toLowerCase() === key);
    if (p?.imgURL) return p.imgURL;
    if (p?.srID) {
      const fromPhotos = getPhotoBySlug(p.srID);
      if (fromPhotos) return fromPhotos;
    }
    // 2. Missing-portraits gist (user-curated legends list)
    const fromGist = portraitMap.get(key);
    if (fromGist) return fromGist;
    // 3. player-photos.json via ZenGM name→srID map (available once a bio was opened)
    const fromZenGM = getPhotoByName(name);
    if (fromZenGM) return fromZenGM;
    // 4. Generic avatar fallback
    return avatarFallback(name);
  };

  // ── Fetch missing-portraits gist + preload player-photos.json on mount ────
  useEffect(() => {
    // player-photos.json is small — warm it up so findPlayerImg can use it immediately
    ensurePhotosLoaded();
    fetchMissingPortraits()
      .then(portraits => {
        const map = new Map<string, string>();
        for (const p of portraits) {
          if (p.name && p.portrait) map.set(p.name.toLowerCase().trim(), p.portrait);
        }
        setPortraitMap(map);
      })
      .catch(() => {}); // silently skip on error
  }, []);

  // ── Load external data when team changes ──────────────────────────────────
  useEffect(() => {
    if (!selectedTeam) return;
    let cancelled = false;
    setExternalLoading(true);
    setExternalError(null);
    Promise.all([fetchRegularRecords(), fetchPlayoffRecords(), fetchCareerLeaders(), fetchAverageLeaders()])
      .then(([reg, play, career, avg]) => {
        if (cancelled) return;
        if (selectedTeamId === NBA_HUB_ID) {
          setRegularRecords(reg);
          setPlayoffRecords(play);
          setCareerLeaders(career);
          setAverageLeaders(avg.filter((l: any) => parseInt(l.GP || '0') >= 100));
        } else {
          setRegularRecords(filterToTeam(reg, selectedTeam));
          setPlayoffRecords(filterToTeam(play, selectedTeam));
          setCareerLeaders(filterToTeam(career, selectedTeam));
          setAverageLeaders(filterToTeam(avg, selectedTeam).filter(l => parseInt(l.GP || '0') >= 100));
        }
      })
      .catch(e => { if (!cancelled) setExternalError(String(e)); })
      .finally(() => { if (!cancelled) setExternalLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTeamId]);

  // ── Top players scoring ───────────────────────────────────────────────────
  const topPlayers = useMemo(() => {
    if (!selectedTeam) return [];

    // scorePlayer: pass tid=null for full career (NBA Hub), tid=number to scope to one team
    const scorePlayer = (p: any, tid: number | null): number => {
      // Seasons this player spent on the target team (or all seasons if tid=null)
      const teamSeasons: Set<number> | null = tid !== null
        ? new Set((p.stats ?? []).filter((s: any) => s.tid === tid).map((s: any) => s.season))
        : null;
      const inScope = (season: number) => teamSeasons === null || teamSeasons.has(season);

      const aw = (p.awards ?? []).filter((a: any) => inScope(a.season));
      const mvp     = aw.filter((a: any) => a.type === 'Most Valuable Player').length;
      const fmvp    = aw.filter((a: any) => a.type === 'Finals MVP').length;
      const al1     = aw.filter((a: any) => a.type === 'All-NBA First Team').length;
      const al2     = aw.filter((a: any) => a.type === 'All-NBA Second Team').length;
      const al3     = aw.filter((a: any) => a.type === 'All-NBA Third Team').length;
      const ad1     = aw.filter((a: any) => a.type === 'All-Defensive First Team').length;
      const ad2     = aw.filter((a: any) => a.type === 'All-Defensive Second Team').length;
      const allStar = aw.filter((a: any) => a.type === 'All-Star').length;
      const champ   = aw.filter((a: any) => a.type === 'NBA Champion').length;
      const regSt   = (p.stats ?? []).filter((s: any) => !s.playoffs && (tid === null || s.tid === tid));
      const playSt  = (p.stats ?? []).filter((s: any) => !!s.playoffs && (tid === null || s.tid === tid));
      const regWS   = regSt.reduce( (sum: number, s: any) => sum + (s.ows ?? 0) + (s.dws ?? 0) + (s.ewa ?? 0), 0);
      const playWS  = playSt.reduce((sum: number, s: any) => sum + (s.ows ?? 0) + (s.dws ?? 0) + (s.ewa ?? 0), 0);
      return mvp * 6 + fmvp * 6 + al1 * 2 + al2 + al3 * 0.25
        + (ad1 + ad2) * 0.15 + allStar * 0.1 + champ
        + (playWS / 2) * 0.1 + (regWS / 2) * 0.075;
    };

    if (isNBAHub) {
      return state.players
        .map(p => ({ name: p.name, score: scorePlayer(p, null), imgURL: p.imgURL, hof: p.hof ?? false }))
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 100);
    }

    // ── Franchise view: score each player scoped to seasons on this team ─────
    const tid = selectedTeam.id;
    const parMap = new Map<string, { pts: number; reb: number; ast: number }>();
    for (const row of mergedCareer) {
      const name = cleanName(row.NAME);
      if (!parMap.has(name)) parMap.set(name, { pts: 0, reb: 0, ast: 0 });
      const entry = parMap.get(name)!;
      const cat = row.Category ?? row.Career_Leader_Category;
      const val = (row._val ?? 0) || parseStatVal(getStatValue(row, cat));
      if (cat === 'Points')   entry.pts = Math.max(entry.pts, val);
      if (cat === 'Rebounds') entry.reb = Math.max(entry.reb, val);
      if (cat === 'Assists')  entry.ast = Math.max(entry.ast, val);
    }
    for (const live of liveTotals) {
      const name = live.NAME;
      if (!parMap.has(name)) parMap.set(name, { pts: 0, reb: 0, ast: 0 });
      const entry = parMap.get(name)!;
      entry.pts = Math.max(entry.pts, parseFloat(live.PTS ?? '0') || 0);
      entry.reb = Math.max(entry.reb, parseFloat(live.REB ?? '0') || 0);
      entry.ast = Math.max(entry.ast, parseFloat(live.AST ?? '0') || 0);
    }
    return Array.from(parMap.entries())
      .map(([name, { pts, reb, ast }]) => {
        const statePlayer = state.players.find(p => p.name?.toLowerCase() === name.toLowerCase());
        // Sim player: score only stats/awards from seasons on this team
        // Historical legend (gist-only): fall back to scaled P+R+A for this franchise
        const score = statePlayer ? scorePlayer(statePlayer, tid) : (pts + reb + ast) * 0.001;
        return { name, score, imgURL: statePlayer?.imgURL, hof: statePlayer?.hof ?? false };
      })
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [mergedCareer, liveTotals, state.players, selectedTeamId, isNBAHub]);

  // ── Season history (from historicalAwards + team.seasons + wiki) ──────────
  const seasonHistory = useMemo(() => {
    if (!selectedTeam) return [];
    const awardsToUse = (state.historicalAwards as any[]) ?? [];
    const tid = selectedTeam.id;

    // Collect all seasons this team participated in
    const seasonsSet = new Set<number>();
    awardsToUse.forEach((a: any) => { if (a.season) seasonsSet.add(Number(a.season)); });
    ((selectedTeam as any).seasons ?? []).forEach((s: any) => { if (s.season) seasonsSet.add(Number(s.season)); });
    state.players.forEach(p => {
      (p.stats ?? []).forEach((s: any) => { if (s.tid === tid && s.season) seasonsSet.add(Number(s.season)); });
    });

    const champAwards = awardsToUse.filter((a: any) => a.type === 'Champion' && Number(a.tid) === tid);
    const ruAwards = awardsToUse.filter((a: any) => a.type === 'Runner Up' && Number(a.tid) === tid);
    const champSeasons = new Set(champAwards.map((a: any) => Number(a.season)));
    const ruSeasons = new Set(ruAwards.map((a: any) => Number(a.season)));

    // Wikipedia supplement
    for (const [yr, brefData] of getAllCachedSeasons().entries()) {
      const cl = (brefData.champion?.name ?? '').toLowerCase();
      const rl = (brefData.runnerUp?.name ?? '').toLowerCase();
      const tl = (selectedTeam.name ?? '').toLowerCase();
      const fl = `${(selectedTeam as any).region ?? ''} ${selectedTeam.name ?? ''}`.toLowerCase().trim();
      if (cl && (cl.includes(tl) || fl.includes(cl))) { champSeasons.add(yr); seasonsSet.add(yr); }
      if (rl && (rl.includes(tl) || fl.includes(rl))) { ruSeasons.add(yr); seasonsSet.add(yr); }
    }

    const currentSeason = state.leagueStats?.year ?? new Date(state.date).getFullYear();

    return Array.from(seasonsSet)
      .sort((a, b) => b - a)
      .map(season => {
        const ts = ((selectedTeam as any).seasons ?? []).find((s: any) => Number(s.season) === season);
        const prw: number | undefined = ts?.playoffRoundsWon;
        // Champion: flat awards OR playoffRoundsWon=4 in season data (historical)
        const isChamp = champSeasons.has(season) || prw === 4;
        // Runner-up: flat awards OR playoffRoundsWon=3 (and not champ via other source)
        const isRU = !isChamp && (ruSeasons.has(season) || prw === 3);
        const playoffRoundsWon = prw ?? (isChamp ? 4 : isRU ? 3 : undefined);
        // Current in-progress season: show TBC
        const isCurrent = season === currentSeason && (ts?.won ?? 0) + (ts?.lost ?? 0) === 0;
        return {
          season,
          won: isCurrent ? undefined : ts?.won,
          lost: isCurrent ? undefined : ts?.lost,
          playoffRoundsWon: isCurrent ? undefined : playoffRoundsWon,
          isChamp, isRU, isCurrent,
        };
      });
  }, [selectedTeamId, state.historicalAwards, state.players, state.leagueStats, state.date]);

  // ── Season summary stats ──────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    // Exclude current in-progress season (0-0) and seasons with no data
    const known = seasonHistory.filter(s => s.won != null && (s.won + (s.lost ?? 0)) > 0);
    const totalW = known.reduce((s, r) => s + (r.won ?? 0), 0);
    const totalL = known.reduce((s, r) => s + (r.lost ?? 0), 0);
    const winPct = totalW + totalL > 0 ? (totalW / (totalW + totalL)).toFixed(3) : '.000';
    const playoffApps = seasonHistory.filter(s => (s.playoffRoundsWon ?? -1) >= 0).length;
    const finalsApps = seasonHistory.filter(s => (s.playoffRoundsWon ?? -1) >= 3).length;
    const titles = seasonHistory.filter(s => s.isChamp).length;
    const sorted = [...known].sort((a, b) => {
      const pa = a.won! / ((a.won! + a.lost!) || 1);
      const pb = b.won! / ((b.won! + b.lost!) || 1);
      return pb - pa;
    });
    return { totalW, totalL, winPct, playoffApps, finalsApps, titles, best: sorted[0], worst: sorted[sorted.length - 1] };
  }, [seasonHistory]);

  // ── Franchise records processing ──────────────────────────────────────────
  const processedRecords = useMemo(() => {
    const source = recordType === 'regular' ? regularRecords : playoffRecords;
    const isPlayoff = recordType === 'playoff';
    // Filter out records from the 2025-26 real-life NBA season (Oct 2025 – Jun 2026)
    // since our simulation starts in 2025 and those real records conflict with simulated data.
    const filtered = source.filter(rec => {
      if (!rec.DATE) return true;
      try {
        const d = new Date(rec.DATE);
        const yr = d.getFullYear();
        const mo = d.getMonth() + 1; // 1-indexed
        // 2025-26 season: Oct 2025 – Jun 2026
        if (yr === 2025 && mo >= 10) return false;
        if (yr === 2026 && mo <= 6) return false;
      } catch { /* keep if unparseable */ }
      return true;
    });

    // Merge sim single-game franchise records without overwriting gist data.
    // For each category, insert the sim record and re-sort so the highest value always wins.
    const simRecs = (state.simFranchiseRecords ?? []).filter((rec: any) => {
      if (rec.isPlayoff !== isPlayoff) return false;
      if (isNBAHub) return true; // show all teams' records in NBA hub
      return rec.tid === selectedTeam?.id;
    });

    const all = [...filtered, ...simRecs];

    const grouped: Record<string, any[]> = {};
    all.forEach(rec => {
      const cat = rec.SearchCategory;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(rec);
    });

    // Re-sort each category so the highest value is first; deduplicate by player name
    for (const cat of Object.keys(grouped)) {
      grouped[cat].sort((a, b) => {
        const av = parseStatVal(getStatValue(a, cat));
        const bv = parseStatVal(getStatValue(b, cat));
        return bv - av;
      });
      const seen = new Set<string>();
      grouped[cat] = grouped[cat].filter(rec => {
        const n = cleanName(rec.NAME ?? '').toLowerCase();
        if (seen.has(n)) return false;
        seen.add(n);
        return true;
      });
    }

    return Object.entries(grouped)
      .sort(([a], [b]) => {
        const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([, recs]) => recs);
  }, [regularRecords, playoffRecords, recordType, state.simFranchiseRecords, selectedTeamId, isNBAHub]);

  // ── Filtered teams for list ────────────────────────────────────────────────
  const filteredTeams = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return state.teams.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.region ?? '').toLowerCase().includes(q) ||
      t.abbrev.toLowerCase().includes(q),
    );
  }, [state.teams, searchTerm]);

  const quick = usePlayerQuickActions();

  // ─────────────────────────────────────────────────────────────────────────
  // Team list view
  // ─────────────────────────────────────────────────────────────────────────

  if (quick.fullPageView) return quick.fullPageView;

  if (!selectedTeam) {
    return (
      <>
      <div className="h-full overflow-y-auto custom-scrollbar bg-[#09090b] text-zinc-100">
        <div className="max-w-6xl mx-auto p-6 md:p-10">
          <div className="mb-10">
            <h1 className="text-4xl font-black tracking-tight uppercase mb-1">
              Team <span className="text-indigo-400">History</span>
            </h1>
            <p className="text-zinc-500 text-sm uppercase tracking-widest font-semibold mb-6">Select a franchise</p>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search teams…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-zinc-100 text-sm focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>
          </div>
          {/* NBA Hub featured card */}
          <motion.button
            whileHover={{ y: -3, scale: 1.005 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setSelectedTeamId(NBA_HUB_ID); setActiveTab('overview'); setExpandedLeaders({}); setExpandedRecords({}); }}
            className="w-full mb-6 bg-gradient-to-r from-[#1D428A]/20 to-[#C8102E]/20 border border-[#1D428A]/40 rounded-2xl p-5 text-left overflow-hidden relative group"
          >
            <div className="flex items-center gap-4">
              <img src="https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg" alt="NBA" className="w-12 h-12 object-contain" referrerPolicy="no-referrer" />
              <div>
                <div className="text-xs font-black uppercase tracking-tight">
                  <span className="text-zinc-400">National Basketball </span>
                  <span className="text-[#C8102E]">Association</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono uppercase mt-0.5">League-Wide Records & All-Time Leaders</div>
              </div>
              <ChevronRight className="ml-auto w-4 h-4 text-[#1D428A] opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
          </motion.button>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredTeams.map(team => {
              const ac = getBestAccentColor(team.colors, team.name);
              return (
                <motion.button
                  key={team.id}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setSelectedTeamId(team.id); setActiveTab('overview'); setExpandedLeaders({}); setExpandedRecords({}); }}
                  className="group relative bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 text-left overflow-hidden transition-all"
                  style={{ borderColor: ac + '44' }}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity" style={{ backgroundColor: ac }} />
                  {team.logoUrl ? (
                    <img src={team.logoUrl} alt={team.name} className="w-14 h-14 object-contain mb-3 group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-zinc-800 mb-3 flex items-center justify-center text-xl font-black" style={{ color: ac }}>{team.abbrev}</div>
                  )}
                  <div className="text-xs font-black uppercase tracking-tight leading-tight">
                    {team.region && <span className="text-zinc-400">{team.region} </span>}
                    <span style={{ color: ac }}>{getTeamMascot(team.name, team.region)}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600 font-mono uppercase mt-0.5">{team.abbrev}</div>
                  <ChevronRight className="absolute right-3 bottom-3 w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: ac }} />
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
      {quick.portals}
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Team detail view
  // ─────────────────────────────────────────────────────────────────────────

  const retiredJerseys: any[] = (selectedTeam as any).retiredJerseyNumbers ?? [];
  const jerseyReasonLabel = (j: any): string | null => {
    const reason = j.reason ?? j.tier;
    if (reason === 'franchise_icon' || reason === 'automatic') return 'Franchise Icon';
    if (reason === 'championship_core' || reason === 'fast_track') return 'Title Core';
    if (reason === 'hof_legend') return 'HOF Legend';
    if (reason === 'loyal_star' || reason === 'standard') return 'Loyal Star';
    if (reason === 'honorary' || reason === 'late_honor') return 'Honorary';
    return null;
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#09090b] text-zinc-100" style={{ '--ta': accent } as any}>

      {/* ── Header ── */}
      <div className="relative overflow-hidden border-b border-zinc-800/50 bg-zinc-950">
        <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(ellipse at top right, ${accent}, transparent 70%)` }} />
        <div className="relative max-w-6xl mx-auto px-6 pt-6 pb-8">
          <button
            onClick={() => {
              if (originView && onViewChange) {
                const dest = originView;
                setOriginView(null);
                setSelectedTeamId(null);
                onViewChange(dest);
                return;
              }
              setSelectedTeamId(null);
            }}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-200 transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" style={{ color: accent }} />
            {originView === 'League History' ? 'Back to League History' : 'All Teams'}
          </button>
          <div className="flex items-center gap-5">
            {selectedTeam.logoUrl ? (
              <img src={selectedTeam.logoUrl} alt={selectedTeam.name} className="w-20 h-20 object-contain drop-shadow-xl shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-zinc-800 flex items-center justify-center text-2xl font-black shrink-0" style={{ color: accent }}>{selectedTeam.abbrev}</div>
            )}
            <div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight uppercase leading-none">
                {selectedTeam.region && <span className="text-zinc-300">{selectedTeam.region} </span>}
                <span style={{ color: accent }}>{getTeamMascot(selectedTeam.name, selectedTeam.region)}</span>
              </h1>
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                <span>{selectedTeam.abbrev}</span>
                <span>{selectedTeam.conference}</span>
                {summaryStats.titles > 0 && (
                  <span className="flex items-center gap-1" style={{ color: accent }}>
                    <Trophy className="w-3 h-3" /> {summaryStats.titles}× Champion
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Nav tabs ── */}
      <div className="sticky top-0 z-20 bg-[#09090b]/90 backdrop-blur border-b border-zinc-800/50 overflow-x-auto">
        <div className="max-w-6xl mx-auto px-6 flex gap-6 min-w-max">
          {([
            { id: 'overview' as const, label: 'Overview', icon: LayoutGrid },
            { id: 'records' as const, label: 'Records', icon: Trophy },
            { id: 'leaders' as const, label: 'Leaders', icon: Award },
            ...(!isNBAHub ? [{ id: 'history' as const, label: 'Season History', icon: History }] : []),
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-4 text-xs font-semibold transition-all relative whitespace-nowrap ${activeTab === tab.id ? '' : 'text-zinc-500 hover:text-zinc-300'}`}
              style={activeTab === tab.id ? { color: accent } : {}}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="teamHistoryTab" className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: accent }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-10">

              {/* Retired jerseys */}
              {retiredJerseys.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest mb-4" style={{ color: accent }}>
                    <Star className="w-4 h-4" fill={accent} /> Retired Numbers
                  </h2>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {retiredJerseys.map((j: any, i: number) => (
                      <motion.div
                        key={i}
                        whileHover={{ y: -3 }}
                        className="relative bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center text-center overflow-hidden group"
                      >
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-15 transition-opacity" style={{ backgroundColor: accent }} />
                        <span className="text-3xl font-black leading-none mb-1" style={{ color: accent }}>{j.number}</span>
                        <span className="text-[10px] font-bold text-zinc-300 leading-tight">
                          {j.text || (j.pid != null ? (state.players.find((pl: any) => pl.pid === j.pid || pl.id === j.pid)?.name ?? 'Legend') : 'Legend')}
                        </span>
                        {j.seasonRetired && (
                          <span className="text-[9px] text-zinc-600 font-mono mt-0.5">{j.seasonRetired}</span>
                        )}
                        {jerseyReasonLabel(j) && (
                          <span className="text-[8px] text-zinc-500 font-black uppercase tracking-wider mt-1">{jerseyReasonLabel(j)}</span>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}

              {/* Top players by career P+A+R */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest" style={{ color: accent }}>
                    <Users className="w-4 h-4" /> {isNBAHub ? 'All-Time Top 100 Players' : 'All-Time Top Players'}
                  </h2>
                  <span className="text-[10px] text-zinc-600 font-mono uppercase">MVP · Finals MVP · All-NBA · Win Shares</span>
                </div>
                {topPlayers.length === 0 ? (
                  <p className="text-zinc-600 text-sm italic">No player stats found for this franchise.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
                    {topPlayers.map(({ name, imgURL, hof }, idx) => {
                      const statePlayer = state.players.find(p => p.name?.toLowerCase() === name.toLowerCase());
                      return (
                        <motion.div
                          key={name}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.015 }}
                          onClick={() => statePlayer && quick.openFor(statePlayer)}
                          className={`group flex flex-col items-center text-center ${statePlayer ? 'cursor-pointer' : ''}`}
                        >
                          <div className="relative mb-2">
                            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-zinc-800 group-hover:border-[var(--ta)] transition-colors">
                              <img
                                src={imgURL || findPlayerImg(name)}
                                alt={name}
                                className="w-full h-full object-cover object-top grayscale group-hover:grayscale-0 transition-all"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center text-[8px] font-black" style={{ color: accent }}>
                              {idx + 1}
                            </div>
                            {hof && (
                              <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-rose-600 flex items-center justify-center">
                                <Star className="w-2.5 h-2.5 text-white" fill="white" />
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-zinc-200 leading-tight line-clamp-2 group-hover:text-[var(--ta)] transition-colors">{name}</p>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {/* ── RECORDS ── */}
          {activeTab === 'records' && (
            <motion.div key="records" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black uppercase tracking-widest">{isNBAHub ? 'League Records' : 'Franchise Records'}</h2>
                <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
                  {(['regular', 'playoff'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setRecordType(type)}
                      className="px-4 py-1.5 text-[10px] font-black uppercase rounded-md transition-all"
                      style={recordType === type ? { backgroundColor: accent, color: '#09090b' } : { color: '#71717a' }}
                    >
                      {type === 'regular' ? 'Regular' : 'Playoffs'}
                    </button>
                  ))}
                </div>
              </div>

              {externalLoading ? (
                <div className="flex items-center gap-2 text-zinc-500 py-8">
                  <Loader className="w-4 h-4 animate-spin" /> Loading records…
                </div>
              ) : externalError ? (
                <p className="text-rose-400 text-sm">Failed to load: {externalError}</p>
              ) : processedRecords.length === 0 ? (
                <p className="text-zinc-600 text-sm italic">No records found for this team.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {processedRecords.map((recs, idx) => {
                    const cat = recs[0]?.SearchCategory;
                    const isExpanded = expandedRecords[cat];
                    const displayed = isExpanded ? recs.slice(0, 5) : [recs[0]];
                    return (
                      <div
                        key={idx}
                        onClick={() => setExpandedRecords(p => ({ ...p, [cat]: !p[cat] }))}
                        className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 cursor-pointer hover:border-zinc-700 transition-all"
                        style={isExpanded ? { borderColor: accent + '66' } : {}}
                      >
                        <div className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: accent }}>{cat}</div>
                        {displayed.map((rec: any, ri: number) => (
                          <div key={ri} className={`flex items-center gap-3 ${ri > 0 ? 'mt-4 pt-4 border-t border-zinc-800' : ''}`}>
                            <div className="relative w-10 h-10 shrink-0">
                              <img src={findPlayerImg(cleanName(rec.NAME))} alt={cleanName(rec.NAME)}
                                className="w-full h-full rounded-lg object-cover border border-zinc-800"
                                referrerPolicy="no-referrer" />
                              <div className="absolute -bottom-1 -left-1 px-1 py-px text-[8px] font-black rounded-sm shadow" style={{ backgroundColor: accent, color: '#09090b' }}>
                                #{ri + 1}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`font-black text-zinc-100 ${ri === 0 ? 'text-2xl' : 'text-base'}`}>
                                {getStatValue(rec, cat)}
                              </div>
                              <div className={`font-semibold text-zinc-400 truncate ${ri === 0 ? 'text-sm' : 'text-xs'}`}>{cleanName(rec.NAME)}</div>
                              {ri === 0 && rec.DATE && <div className="text-[10px] text-zinc-600 font-mono">{rec.DATE} · vs {rec.OPP}</div>}
                            </div>
                          </div>
                        ))}
                        <div className="mt-3 pt-3 border-t border-zinc-800/50 text-center text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
                          {isExpanded ? 'Collapse' : 'Show Top 5'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ── LEADERS ── */}
          {activeTab === 'leaders' && (
            <motion.div key="leaders" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black uppercase tracking-widest">{isNBAHub ? 'All-Time Leaders' : 'Career Leaders'}</h2>
                <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
                  {(['totals', 'averages'] as const).map(sub => (
                    <button
                      key={sub}
                      onClick={() => setLeaderSubTab(sub)}
                      className="px-4 py-1.5 text-[10px] font-black uppercase rounded-md transition-all"
                      style={leaderSubTab === sub ? { backgroundColor: accent, color: '#09090b' } : { color: '#71717a' }}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
              {leaderSubTab === 'averages' && (
                <p className="text-[11px] text-zinc-600 font-mono uppercase -mt-4">Min. 100 games played</p>
              )}

              {externalLoading ? (
                <div className="flex items-center gap-2 text-zinc-500 py-8">
                  <Loader className="w-4 h-4 animate-spin" /> Loading leaders…
                </div>
              ) : externalError ? (
                <p className="text-rose-400 text-sm">Failed to load: {externalError}</p>
              ) : (() => {
                const source = leaderSubTab === 'totals' ? mergedCareer : mergedAverage;
                const catKey = 'Category';
                const order = leaderSubTab === 'totals' ? CATEGORY_ORDER : CATEGORY_ORDER_AVG;
                const cats = Array.from(new Set(source.map(l => l[catKey]))).filter(Boolean) as string[];
                cats.sort((a, b) => {
                  const ia = order.indexOf(a), ib = order.indexOf(b);
                  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                });
                if (!cats.length) return <p className="text-zinc-600 text-sm italic">No leaders data found for this team.</p>;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {cats.map(cat => {
                      const leaders = source.filter(l => l[catKey] === cat);
                      const isExpanded = expandedLeaders[cat];
                      const displayed = isExpanded ? leaders : leaders.slice(0, 5);
                      return (
                        <div key={cat} className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-black uppercase tracking-widest" style={{ color: accent }}>{cat}</span>
                            <span className="text-[10px] text-zinc-600 font-mono">TOP {leaders.length}</span>
                          </div>
                          <div className="space-y-2">
                            {displayed.map((leader: any, li: number) => {
                              const rankField = leaderSubTab === 'totals' ? leader.Franchise_Rank : leader.Rank;
                              const displayName = cleanName(leader.NAME ?? '');
                              const isHof = !!(state.players.find(p => p.name?.toLowerCase() === displayName.toLowerCase())?.hof);
                              return (
                                <div key={li} className="flex items-center gap-3 p-2.5 bg-zinc-900/40 border border-zinc-800/50 rounded-lg hover:border-zinc-700 transition-all">
                                  <div className="relative w-9 h-9 shrink-0">
                                    <img src={findPlayerImg(displayName)} alt={displayName}
                                      className="w-full h-full rounded-lg object-cover border border-zinc-800"
                                      referrerPolicy="no-referrer" />
                                    <div className="absolute -bottom-1 -left-1 px-1 py-px text-[7px] font-black rounded-sm shadow" style={{ backgroundColor: accent, color: '#09090b' }}>
                                      #{rankField ?? li + 1}
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-bold text-zinc-100 truncate">{displayName}</span>
                                      {isHof && <span className="px-1 py-px bg-rose-500/15 text-rose-400 text-[7px] font-black rounded uppercase shrink-0">HOF</span>}
                                    </div>
                                    <span className="text-[9px] text-zinc-600 font-mono">{leader.GP} GP</span>
                                  </div>
                                  <span className="text-sm font-black shrink-0" style={{ color: accent }}>
                                    {getStatValue(leader, cat)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {leaders.length > 5 && (
                            <button
                              onClick={() => setExpandedLeaders(p => ({ ...p, [cat]: !p[cat] }))}
                              className="w-full mt-3 pt-3 border-t border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-300 transition-colors"
                            >
                              {isExpanded ? 'Show Less' : `Show All ${leaders.length}`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </motion.div>
          )}

          {/* ── HISTORY ── */}
          {activeTab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Record', value: `${summaryStats.totalW}-${summaryStats.totalL}`, sub: summaryStats.winPct },
                  { label: 'Playoff Apps', value: summaryStats.playoffApps, sub: 'appearances' },
                  { label: 'Finals Apps', value: summaryStats.finalsApps, sub: 'appearances' },
                  { label: 'Championships', value: summaryStats.titles, sub: 'titles' },
                  {
                    label: 'Best Season',
                    value: summaryStats.best ? `${summaryStats.best.won}-${summaryStats.best.lost}` : '—',
                    sub: summaryStats.best ? String(summaryStats.best.season) : '',
                  },
                  {
                    label: 'Worst Season',
                    value: summaryStats.worst ? `${summaryStats.worst.won}-${summaryStats.worst.lost}` : '—',
                    sub: summaryStats.worst ? String(summaryStats.worst.season) : '',
                  },
                ].map((s, i) => (
                  <div key={i} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 text-center">
                    <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1">{s.label}</div>
                    <div className="text-xl font-black" style={{ color: accent }}>{s.value}</div>
                    <div className="text-[9px] font-mono text-zinc-600 uppercase mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Season table */}
              {seasonHistory.length === 0 ? (
                <p className="text-zinc-600 text-sm italic">No season data found for this franchise.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-zinc-900/80 sticky top-0">
                      <tr>
                        {['Season', 'Record', 'Win%', 'Playoffs'].map(h => (
                          <th key={h} className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-b border-zinc-800">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {seasonHistory.map((row, i) => (
                        <tr key={i} className={`border-b border-zinc-800/40 hover:bg-zinc-900/30 transition-colors ${row.isChamp ? 'bg-amber-950/10' : ''}`}>
                          <td className="py-3 px-4 font-mono text-sm" style={{ color: accent }}>
                            {row.season - 1}–{String(row.season).slice(-2)}
                          </td>
                          <td className="py-3 px-4 font-bold text-sm">
                            {row.isCurrent
                              ? <span className="text-zinc-600 italic text-xs">In Progress</span>
                              : row.won != null ? `${row.won}-${row.lost}` : <span className="text-zinc-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-zinc-400 font-mono text-xs">
                            {row.isCurrent ? <span className="text-zinc-700">TBC</span>
                              : row.won != null ? ((row.won / ((row.won + row.lost!) || 1)).toFixed(3)) : '—'}
                          </td>
                          <td className="py-3 px-4">
                            {row.isCurrent ? (
                              <span className="text-xs text-zinc-600 italic">Season ongoing</span>
                            ) : row.isChamp ? (
                              <span className="flex items-center gap-1.5 text-xs font-black" style={{ color: accent }}>
                                <Trophy className="w-3 h-3" /> NBA Champions
                              </span>
                            ) : row.isRU ? (
                              <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
                                <Trophy className="w-3 h-3 opacity-40" /> Runner-Up
                              </span>
                            ) : row.playoffRoundsWon === 3 ? (
                              <span className="text-xs text-zinc-400">Conf. Finals</span>
                            ) : row.playoffRoundsWon === 2 ? (
                              <span className="text-xs text-zinc-500">2nd Round</span>
                            ) : row.playoffRoundsWon === 1 ? (
                              <span className="text-xs text-zinc-600">1st Round</span>
                            ) : row.playoffRoundsWon === 0 ? (
                              <span className="text-xs text-zinc-700">Play-In</span>
                            ) : (
                              <span className="text-xs text-zinc-800">Missed Playoffs</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
      {quick.portals}
    </div>
  );
};
