import React, { useState, useEffect, useMemo } from 'react';
import { NBAPlayer } from '../../../types';
import { ArrowLeft, Loader2, Trophy } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { AwardsView } from './AwardsView';

interface PlayerBioViewProps {
  player: NBAPlayer;
  onBack: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

import { memCache, isCacheValid, fetchWithDedup, prefetchPlayerBio, getPlayerImage } from './bioCache';
import { extractNbaId, hdPortrait } from '../../../utils/helpers';

// Request queue — max 1 concurrent fetch to avoid AllOrigins rate limits
const MAX_CONCURRENT = 1;

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function deepGet(obj: any, ...paths: string[][]): any {
  for (const path of paths) {
    try {
      let cur = obj;
      for (const key of path) { cur = cur[key]; if (cur == null) break; }
      if (cur != null) return cur;
    } catch (_) {}
  }
  return null;
}

const getBestStat = (stats: any[] | undefined, season: number) => {
  if (!stats) return undefined;
  const seasonStats = stats.filter(s => s.season === season && !s.playoffs);
  if (seasonStats.length === 0) return undefined;
  return seasonStats.reduce((prev, current) => (prev.gp >= current.gp) ? prev : current);
};

function calcAge(birthStr: string, currentYear: number): { label: string; age: string } {
  const bD = new Date(birthStr);
  let age  = currentYear - bD.getFullYear();
  // We don't have a precise sim date anymore, so we'll just use the year difference
  // or a default month/day if we want to be fancy.
  return {
    label: bD.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    age:   `${age} years`,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// CACHE VALIDITY
// A cache entry is only trusted if it actually has bio text.
// Birthdate/country alone (from old partial fetches) is NOT a valid hit.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CORE FETCH  (pure async — shared by prefetch + component)
// ────

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICATED FETCH WRAPPER
// Both prefetch() and the component call this so only one HTTP request fires
// per player regardless of how many callers are waiting.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC PREFETCH API
//
// Call from your roster/player-list component to warm the cache for visible
// players before the user taps through. Import like:
//
//   import { prefetchPlayerBio } from './PlayerBioView';
//
//   useEffect(() => {
//     visiblePlayers.slice(0, 10).forEach(p => prefetchPlayerBio(p));
//   }, [visiblePlayers]);
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const PlayerBioView: React.FC<PlayerBioViewProps> = ({ player, onBack }) => {
  const { state } = useGame();
  const [bioData,     setBioData]    = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(() => !!extractNbaId(player.imgURL || ""));
  const [fetchDone, setFetchDone] = useState(false);
  const [portraitSrc, setPortraitSrc] = useState<string>(() => getPlayerImage(player) || "");
  const [activeTab, setActiveTab] = useState<'Overview' | 'Historical Data' | 'Game Log' | 'Awards'>('Overview');
  const [showPlayoffs, setShowPlayoffs] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const OPENING_NIGHT_MS = new Date('2025-10-24T00:00:00Z').getTime();

  const gameLog = useMemo(() => {
    const logs: any[] = [];
    state.boxScores.forEach(game => {
      const isHome = game.homeStats.some(p => p.playerId === player.internalId);
      const isAway = game.awayStats.some(p => p.playerId === player.internalId);

      if (isHome || isAway) {
        const stats = isHome
          ? game.homeStats.find(p => p.playerId === player.internalId)
          : game.awayStats.find(p => p.playerId === player.internalId);

        if (stats) {
          const teamId = isHome ? game.homeTeamId : game.awayTeamId;
          const oppId = isHome ? game.awayTeamId : game.homeTeamId;
          const team = state.teams.find(t => t.id === teamId);
          const opp = state.teams.find(t => t.id === oppId);

          // Determine preseason via schedule flag first, fall back to date comparison
          const schedGame = state.schedule.find((g: any) => g.gid === game.gameId);
          const isPreseason = schedGame?.isPreseason === true ||
            (() => { try { return new Date(game.date).getTime() < OPENING_NIGHT_MS; } catch { return false; } })();

          const isWin = isHome ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
          const resultStr = `${isWin ? 'W' : 'L'}, ${isHome ? game.homeScore : game.awayScore}-${isHome ? game.awayScore : game.homeScore}`;

          const fgm = stats.fgm || 0;
          const fga = stats.fga || 0;
          const tpm = stats.threePm || 0;
          const tpa = stats.threePa || 0;
          const ftm = stats.ftm || 0;
          const fta = stats.fta || 0;

          const twom = fgm - tpm;
          const twoa = fga - tpa;

          const fgp = fga > 0 ? (fgm / fga).toFixed(3).replace(/^0+/, '') : '.000';
          const tpp = tpa > 0 ? (tpm / tpa).toFixed(3).replace(/^0+/, '') : '.000';
          const twop = twoa > 0 ? (twom / twoa).toFixed(3).replace(/^0+/, '') : '.000';
          const efgp = fga > 0 ? ((fgm + 0.5 * tpm) / fga).toFixed(3).replace(/^0+/, '') : '.000';
          const ftp = fta > 0 ? (ftm / fta).toFixed(3).replace(/^0+/, '') : '.000';

          logs.push({
            date: game.date,
            isPreseason,
            teamAbbrev: team?.abbrev || 'UNK',
            isAway: !isHome,
            oppAbbrev: opp?.abbrev || 'UNK',
            result: resultStr,
            isWin,
            gs: stats.gs > 0,
            mp: Math.floor(stats.min) + ':' + String(Math.floor((stats.min % 1) * 60)).padStart(2, '0'),
            fgm, fga, fgp,
            tpm, tpa, tpp,
            twom, twoa, twop,
            efgp,
            ftm, fta, ftp,
            orb: stats.orb || 0,
            drb: stats.drb || 0,
            trb: stats.reb || 0,
            ast: stats.ast || 0,
            stl: stats.stl || 0,
            blk: stats.blk || 0,
            tov: stats.tov || 0,
            pf: stats.pf || 0,
            pts: stats.pts || 0,
            gmsc: (stats.gameScore || 0).toFixed(1),
            plusMinus: stats.pm != null ? stats.pm : null,
          });
        }
      }
    });

    const reversed = logs.reverse(); // Most recent first

    // Assign game numbers: regular season games count from 1 (earliest) upward.
    // Preseason games get rank=null (shown as "PRE").
    const rsTotal = reversed.filter(l => !l.isPreseason).length;
    let rsRank = rsTotal;
    return reversed.map(l => ({ ...l, rank: l.isPreseason ? null : rsRank-- }));
  }, [state.boxScores, state.schedule, player.internalId, state.teams]);

  const team = useMemo(() => {
    const isNBA = !["WNBA","Euroleague","PBA","Draft Prospect","Prospect"].includes(player.status || "");
    return isNBA
      ? state.teams.find(t => t.id === player.tid)
      : state.nonNBATeams.find(t => t.tid === player.tid && t.league === player.status);
  }, [player.tid, player.status, state.teams, state.nonNBATeams]);

  const teamColor = team?.colors?.[0] || "#CE1141";
  const teamLogo  = (team as any)?.logoUrl || (team as any)?.imgURL;

  const maxSeason = useMemo(() => {
    return state.players.reduce((max, p) => {
      const pMax = p.stats?.reduce((m, s) => Math.max(m, s.season), 0) || 0;
      return Math.max(max, pMax);
    }, state.leagueStats.year);
  }, [state.players, state.leagueStats.year]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const run = async () => {
      console.log(`%c[Scout Intel] Opening bio: ${player.name}`, "color:#00d4ff;font-weight:bold");

      // ── 1. Instant BBGM data ─────────────────────────────────────────────
      const curYear = maxSeason;
      const bY = player.born?.year  || 1995;
      const dY = player.draft?.year || 2026;
      const ss = getBestStat(player.stats, curYear);
      const gp = ss?.gp || 1;

      const baseData = {
        n: player.name,
        m: `${team?.name || "Free Agent"} | #${player.jerseyNumber || "00"} | ${player.pos}`,
        h: player.hgt    ? `${Math.floor(player.hgt / 12)}'${player.hgt % 12}"` : "Unknown",
        w: player.weight ? `${player.weight}lb` : "Unknown",
        c: player.born?.loc || "Unknown",
        s: player.college   || "None",
        a: `${curYear - bY} years`,
        b: `${bY}`,
        d: player.draft?.year ? `${player.draft.year} R${player.draft.round} P${player.draft.pick}` : "Undrafted",
        e: `${curYear - dY} Years`,
        stats: {
          PTS: ss ? ((ss.pts || 0) / gp).toFixed(1) : "0.0",
          REB: ss ? (((ss.trb || (ss as any).reb || (ss.orb || 0) + (ss.drb || 0))) / gp).toFixed(1) : "0.0",
          AST: ss ? ((ss.ast || 0) / gp).toFixed(1) : "0.0",
          STL: ss ? ((ss.stl || 0) / gp).toFixed(1) : "0.0",
          BLK: ss ? ((ss.blk || 0) / gp).toFixed(1) : "0.0",
        },
        bio: { pro: "", pre: "", per: "" },
      };

      if (isMounted) setBioData(baseData);

      // ── 2. Extract NBA ID ────────────────────────────────────────────────
      const nbaId = extractNbaId(player.imgURL || "");
      console.log(`%c[Scout Intel] imgURL="${player.imgURL}" → nbaId=${nbaId}`, "color:#94a3b8");

      if (!nbaId) {
        console.log(`%c[Scout Intel] No NBA ID for ${player.name} — BBGM only`, "color:#f59e0b");
        return;
      }

      // Upgrade portrait to HD immediately (before network fetch)
      if (isMounted) setPortraitSrc(hdPortrait(nbaId));

      // ── 3. Fetch (deduped — returns instantly from cache if available) ───
      setIsSyncing(true);
      try {
    const payload = await fetchWithDedup(nbaId);
        if (isMounted) {
          setBioData((prev: any) => ({ ...prev, ...payload }));
          if (payload.imgHD) setPortraitSrc(payload.imgHD);
          console.log(`%c[Scout Intel] Bio applied for ${player.name}`, "color:#10b981;font-weight:bold");
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error(`[Scout Intel] FAILED for ${player.name}:`, err.message);
        }
      } finally {
        if (isMounted) { setIsSyncing(false); setFetchDone(true); }
      }
    };

    run();
    return () => { isMounted = false; controller.abort(); };
  }, [player, team]);

  if (!bioData) return null;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white overflow-hidden rounded-[2.5rem] border border-white/10 relative shadow-2xl">
      <button onClick={onBack} className="absolute top-6 left-6 z-50 w-10 h-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
        <ArrowLeft size={20} />
      </button>

      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* ── HERO ── */}
        <div
      className="relative h-auto min-h-[350px] flex flex-col md:flex-row items-center md:items-end px-[5%] overflow-hidden pt-16 pb-4 md:pb-0 md:pt-0 md:h-[350px]"
          style={{ backgroundColor: teamColor }}
        >
          {teamLogo && (
            <img src={teamLogo} alt=""
              className="absolute top-1/2 left-[10%] -translate-y-[45%] w-[120%] max-w-[1000px] opacity-[0.20] pointer-events-none z-0 select-none grayscale brightness-200"
              style={{ mixBlendMode: "screen" }}
              onError={e => e.currentTarget.style.display = "none"} />
          )}
          {teamLogo && (
            <div className="absolute top-8 left-10 md:left-24 z-30 flex flex-col items-center">
              <img src={teamLogo} alt="Team Logo" className="w-16 md:w-20 h-auto drop-shadow-xl"
                   onError={e => e.currentTarget.style.display = "none"} />
              <span className="hidden md:block text-[10px] font-black tracking-[3px] mt-2 text-white/80 uppercase text-center leading-tight max-w-[100px]">
                {team?.name || "TEAM"}
              </span>
            </div>
          )}

          {/* HD portrait — fallback chain: cdn HD → original ak-static → hide */}
          <img
            key={portraitSrc}
            src={portraitSrc}
            alt={player.name}
            className="h-48 md:h-[90%] z-20 drop-shadow-[10px_0_20px_rgba(0,0,0,0.5)] object-contain mt-8 md:mt-0 md:ml-10"
            onError={e => {
              const img = e.currentTarget;
              if (player.imgURL && img.src !== player.imgURL) {
                img.src = player.imgURL;
              } else {
                img.style.display = "none";
              }
            }}
          />

          <div className="z-20 text-center md:text-left mb-6 md:mb-12 md:ml-10 flex-1">
            <p className="m-0 uppercase text-sm font-medium tracking-widest text-white/90">{bioData.m}</p>
<h1 className="m-0 mt-1 text-2xl sm:text-3xl md:text-[64px] leading-[0.95] uppercase font-black tracking-tight text-white break-words w-full">
              {bioData.n.split(" ").map((part: string, i: number) => (
                <React.Fragment key={i}>{part}<br /></React.Fragment>
              ))}
            </h1>
          </div>
          <div className="hidden md:flex z-20 mb-12 mr-4">
            <button className="px-6 py-2 rounded-full border border-white text-white font-medium hover:bg-white/10 transition-colors flex items-center gap-2">
              <span>☆</span> FOLLOW
            </button>
          </div>
        </div>

        {/* ── STATS BAR ── */}
        <div className="flex flex-col md:flex-row border-y border-white/20" style={{ backgroundColor: teamColor }}>
          <div className="flex flex-row w-full md:w-2/5 border-b md:border-b-0 md:border-r border-white/20 bg-black/20">
            {([["PTS","PPG"],["REB","RPG"],["AST","APG"]] as const).map(([key, label], i, arr) => (
              <div key={key} className={`flex-1 flex flex-col justify-center items-center py-4 md:py-6 ${i < arr.length - 1 ? "border-r border-white/20" : ""}`}>
                <span className="text-[10px] text-white/80 uppercase mb-1 tracking-widest font-bold">{label}</span>
                <span className="text-2xl md:text-3xl font-black text-white">{bioData.stats[key]}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 w-full md:w-3/5 bg-black/40">
            {[
              { label: "Height",        val: bioData.h, border: "border-r border-b" },
              { label: "Weight",        val: bioData.w, border: "border-r border-b" },
              { label: "Country",       val: bioData.c, border: "border-r border-b" },
              { label: "Last Attended", val: bioData.s, border: "border-r border-b" },
              { label: "Age",           val: bioData.a, border: "border-r border-b" },
              { label: "Birthdate",     val: bioData.b, border: "border-b" },
              { label: "Draft",         val: bioData.d, border: "border-r" },
              { label: "Experience",    val: bioData.e, border: "border-r" },
            ].map(({ label, val, border }) => (
              <div key={label} className={`${border} border-white/20 flex flex-col justify-center items-center py-3 px-2 text-center`}>
                <span className="bg-white/10 text-white/70 text-[8px] px-2 py-0.5 rounded-sm uppercase font-bold mb-1 tracking-widest">{label}</span>
                <span className="text-sm font-semibold text-white leading-tight">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex border-b border-white/10 px-2 mt-4 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('Overview')}
            className={`px-3 md:px-6 py-3 text-xs md:text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 ${
              activeTab === 'Overview' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('Historical Data')}
            className={`px-3 md:px-6 py-3 text-xs md:text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 ${
              activeTab === 'Historical Data' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Historical Data
          </button>
          <button
            onClick={() => setActiveTab('Game Log')}
            className={`px-3 md:px-6 py-3 text-xs md:text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 ${
              activeTab === 'Game Log' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Game Log
          </button>
          <button
            onClick={() => setActiveTab('Awards')}
            className={`px-3 md:px-6 py-3 text-xs md:text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 ${
              activeTab === 'Awards' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Awards
          </button>
        </div>

        {activeTab === 'Overview' && (
          <div className="p-6 md:p-12 bg-[#080808]">
            {[
              { title: "Professional Career Report", key: "pro", empty: "Scout report pending official update." },
              { title: "Before NBA / College",        key: "pre", empty: "No historical collegiate data found." },
              { title: "Personal Records",            key: "per", empty: "No personal records on file." },
            ].map(({ title, key, empty }) => (
              <React.Fragment key={key}>
                <div className="flex justify-between items-center mb-6 pb-2 border-b border-white/5">
                  <div className="text-xs font-black uppercase tracking-[3px]" style={{ color: teamColor }}>{title}</div>
                  {key === "pro" && isSyncing && (
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono tracking-widest">
                      <Loader2 size={12} className="animate-spin text-[#00ffaa]" /> SYNCING…
                    </div>
                  )}
                </div>
                <ul className="bio-list mb-12">
                  {(bioData.bio as any)[key]
                    ? <div dangerouslySetInnerHTML={{ __html: (bioData.bio as any)[key] }} />
                    : <li className="text-zinc-600 italic">
                        {fetchDone ? "No data on file for this player." : empty}
                      </li>
                  }
                </ul>
              </React.Fragment>
            ))}
          </div>
        )}
        
        {activeTab === 'Historical Data' && (
          <div className="p-4 bg-[#080808]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                {showPlayoffs ? 'Playoff Stats' : 'Regular Season Stats'}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors"
                >
                  {showAdvanced ? 'Basic Stats' : 'Advanced Stats'}
                </button>
                <button
                  onClick={() => setShowPlayoffs(!showPlayoffs)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors"
                >
                  Switch to {showPlayoffs ? 'Regular Season' : 'Playoffs'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[60vh] md:max-h-[70vh] custom-scrollbar">
              <table className="w-full text-sm text-left text-slate-300">
                <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Season</th>
                    <th className="px-4 py-3 font-semibold">Team</th>
                    <th className="px-4 py-3 font-semibold text-right">GP</th>
                    <th className="px-4 py-3 font-semibold text-right">GS</th>
                    <th className="px-4 py-3 font-semibold text-right">MIN</th>
                    {!showAdvanced ? (
                      <>
                        <th className="px-4 py-3 font-semibold text-right text-white">PTS</th>
                        <th className="px-4 py-3 font-semibold text-right">ORB</th>
                        <th className="px-4 py-3 font-semibold text-right">DRB</th>
                        <th className="px-4 py-3 font-semibold text-right">REB</th>
                        <th className="px-4 py-3 font-semibold text-right">AST</th>
                        <th className="px-4 py-3 font-semibold text-right">STL</th>
                        <th className="px-4 py-3 font-semibold text-right">BLK</th>
                        <th className="px-4 py-3 font-semibold text-right">TOV</th>
                        <th className="px-4 py-3 font-semibold text-right">PF</th>
                        <th className="px-4 py-3 font-semibold text-right">FGM</th>
                        <th className="px-4 py-3 font-semibold text-right">FGA</th>
                        <th className="px-4 py-3 font-semibold text-right">FG%</th>
                        <th className="px-4 py-3 font-semibold text-right">3PM</th>
                        <th className="px-4 py-3 font-semibold text-right">3PA</th>
                        <th className="px-4 py-3 font-semibold text-right">3P%</th>
                        <th className="px-4 py-3 font-semibold text-right">FTM</th>
                        <th className="px-4 py-3 font-semibold text-right">FTA</th>
                        <th className="px-4 py-3 font-semibold text-right">FT%</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 font-semibold text-right text-white">PER</th>
                        <th className="px-4 py-3 font-semibold text-right">TS%</th>
                        <th className="px-4 py-3 font-semibold text-right">eFG%</th>
                        <th className="px-4 py-3 font-semibold text-right">ORtg</th>
                        <th className="px-4 py-3 font-semibold text-right">DRtg</th>
                        <th className="px-4 py-3 font-semibold text-right">AST%</th>
                        <th className="px-4 py-3 font-semibold text-right">REB%</th>
                        <th className="px-4 py-3 font-semibold text-right">STL%</th>
                        <th className="px-4 py-3 font-semibold text-right">BLK%</th>
                        <th className="px-4 py-3 font-semibold text-right">TOV%</th>
                        <th className="px-4 py-3 font-semibold text-right">USG%</th>
                        <th className="px-4 py-3 font-semibold text-right">OWS</th>
                        <th className="px-4 py-3 font-semibold text-right">DWS</th>
                        <th className="px-4 py-3 font-semibold text-right">WS</th>
                        <th className="px-4 py-3 font-semibold text-right">WS/48</th>
                        <th className="px-4 py-3 font-semibold text-right">OBPM</th>
                        <th className="px-4 py-3 font-semibold text-right">DBPM</th>
                        <th className="px-4 py-3 font-semibold text-right">BPM</th>
                        <th className="px-4 py-3 font-semibold text-right">VORP</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {player.stats?.filter(s => !!s.playoffs === showPlayoffs).map((s, i) => {
                    const t = state.teams.find(team => team.id === s.tid);
                    const gp = s.gp || 1;
                    return (
                      <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">{(s.season - 1)}-{String(s.season).slice(2)}</td>
                        <td className="px-4 py-3">{t?.abbrev || 'FA'}</td>
                        <td className="px-4 py-3 text-right">{s.gp || 0}</td>
                        <td className="px-4 py-3 text-right">{s.gs || 0}</td>
                        <td className="px-4 py-3 text-right">{((s.min || 0) / gp).toFixed(1)}</td>
                        {!showAdvanced ? (
                          <>
                            <td className="px-4 py-3 text-right font-bold text-white">{((s.pts || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">
                              {((s.orb || 0) + (s.drb || 0) > 0) ? ((s.orb || 0) / gp).toFixed(1) : (((s.trb || (s as any).reb || 0)) * 0.22 / gp).toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {((s.orb || 0) + (s.drb || 0) > 0) ? ((s.drb || 0) / gp).toFixed(1) : (((s.trb || (s as any).reb || 0)) * 0.78 / gp).toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-right">{(((s.trb || (s as any).reb || (s.orb || 0) + (s.drb || 0))) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.ast || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.stl || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.blk || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.tov || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.pf || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.fg || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.fga || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.fga > 0 ? ((s.fg || 0) / s.fga) * 100 : 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.tp || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.tpa || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.tpa > 0 ? ((s.tp || 0) / s.tpa) * 100 : 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.ft || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.fta || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.fta > 0 ? ((s.ft || 0) / s.fta) * 100 : 0).toFixed(1)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right font-bold text-white">{(s.per || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.tsPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.efgPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.ortg || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.drtg || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.astPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.rebPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.stlPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.blkPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.tovPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.usgPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.ows || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.dws || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.ws || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.ws48 || 0).toFixed(3)}</td>
                            <td className="px-4 py-3 text-right">{(s.obpm || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.dbpm || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.bpm || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.vorp || 0).toFixed(1)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {!player.stats?.filter(s => !!s.playoffs === showPlayoffs).length && (
                    <tr>
                      <td colSpan={23} className="px-4 py-8 text-center text-slate-500">
                        No historical data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'Game Log' && (
          <div className="p-4 bg-[#080808] flex flex-col" style={{ minHeight: 0 }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                {state.leagueStats.year}-{String(state.leagueStats.year + 1).slice(2)} Game Log
                {gameLog.filter(g => !g.isPreseason).length > 0 && (
                  <span className="ml-3 text-xs font-normal text-slate-400 normal-case tracking-normal">
                    {gameLog.filter(g => !g.isPreseason).length} regular season games
                  </span>
                )}
              </h3>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[60vh] md:max-h-[70vh] custom-scrollbar">
              <table className="w-full text-sm text-left text-slate-300">
                <thead className="text-[10px] text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800 whitespace-nowrap">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Rk</th>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Team</th>
                    <th className="px-3 py-2 font-semibold"></th>
                    <th className="px-3 py-2 font-semibold">Opp</th>
                    <th className="px-3 py-2 font-semibold">Result</th>
                    <th className="px-3 py-2 font-semibold">GS</th>
                    <th className="px-3 py-2 font-semibold text-right">MP</th>
                    <th className="px-3 py-2 font-semibold text-right">FG</th>
                    <th className="px-3 py-2 font-semibold text-right">FGA</th>
                    <th className="px-3 py-2 font-semibold text-right">FG%</th>
                    <th className="px-3 py-2 font-semibold text-right">3P</th>
                    <th className="px-3 py-2 font-semibold text-right">3PA</th>
                    <th className="px-3 py-2 font-semibold text-right">3P%</th>
                    <th className="px-3 py-2 font-semibold text-right">2P</th>
                    <th className="px-3 py-2 font-semibold text-right">2PA</th>
                    <th className="px-3 py-2 font-semibold text-right">2P%</th>
                    <th className="px-3 py-2 font-semibold text-right">eFG%</th>
                    <th className="px-3 py-2 font-semibold text-right">FT</th>
                    <th className="px-3 py-2 font-semibold text-right">FTA</th>
                    <th className="px-3 py-2 font-semibold text-right">FT%</th>
                    <th className="px-3 py-2 font-semibold text-right">ORB</th>
                    <th className="px-3 py-2 font-semibold text-right">DRB</th>
                    <th className="px-3 py-2 font-semibold text-right">TRB</th>
                    <th className="px-3 py-2 font-semibold text-right">AST</th>
                    <th className="px-3 py-2 font-semibold text-right">STL</th>
                    <th className="px-3 py-2 font-semibold text-right">BLK</th>
                    <th className="px-3 py-2 font-semibold text-right">TOV</th>
                    <th className="px-3 py-2 font-semibold text-right">PF</th>
                    <th className="px-3 py-2 font-semibold text-right text-white">PTS</th>
                    <th className="px-3 py-2 font-semibold text-right">GmSc</th>
                    <th className="px-3 py-2 font-semibold text-right">+/-</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {gameLog.map((log, i) => {
                    // Insert a "Preseason" header row when we cross from RS → preseason
                    const showPreseasonDivider = log.isPreseason && (i === 0 || !gameLog[i - 1].isPreseason);
                    return (
                    <React.Fragment key={i}>
                      {showPreseasonDivider && (
                        <tr>
                          <td colSpan={31} className="px-3 py-2 bg-slate-900/80 border-y border-slate-700">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">
                              Preseason
                            </span>
                          </td>
                        </tr>
                      )}
                    <tr className={`hover:bg-slate-800/50 transition-colors whitespace-nowrap text-xs ${log.isPreseason ? 'opacity-70' : ''}`}>
                      <td className="px-3 py-2">
                        {log.rank !== null
                          ? log.rank
                          : <span className="text-[10px] font-bold text-amber-500/70">PRE</span>}
                      </td>
                      <td className="px-3 py-2">{log.date}</td>
                      <td className="px-3 py-2">{log.teamAbbrev}</td>
                      <td className="px-3 py-2">{log.isAway ? '@' : ''}</td>
                      <td className="px-3 py-2">{log.oppAbbrev}</td>
                      <td className={`px-3 py-2 ${log.isWin ? 'text-emerald-400' : 'text-red-400'}`}>{log.result}</td>
                      <td className="px-3 py-2">{log.gs ? '*' : ''}</td>
                      <td className="px-3 py-2 text-right">{log.mp}</td>
                      <td className="px-3 py-2 text-right">{log.fgm}</td>
                      <td className="px-3 py-2 text-right">{log.fga}</td>
                      <td className="px-3 py-2 text-right">{log.fgp}</td>
                      <td className="px-3 py-2 text-right">{log.tpm}</td>
                      <td className="px-3 py-2 text-right">{log.tpa}</td>
                      <td className="px-3 py-2 text-right">{log.tpp}</td>
                      <td className="px-3 py-2 text-right">{log.twom}</td>
                      <td className="px-3 py-2 text-right">{log.twoa}</td>
                      <td className="px-3 py-2 text-right">{log.twop}</td>
                      <td className="px-3 py-2 text-right">{log.efgp}</td>
                      <td className="px-3 py-2 text-right">{log.ftm}</td>
                      <td className="px-3 py-2 text-right">{log.fta}</td>
                      <td className="px-3 py-2 text-right">{log.ftp}</td>
                      <td className="px-3 py-2 text-right">{log.orb}</td>
                      <td className="px-3 py-2 text-right">{log.drb}</td>
                      <td className="px-3 py-2 text-right">{log.trb}</td>
                      <td className="px-3 py-2 text-right">{log.ast}</td>
                      <td className="px-3 py-2 text-right">{log.stl}</td>
                      <td className="px-3 py-2 text-right">{log.blk}</td>
                      <td className="px-3 py-2 text-right">{log.tov}</td>
                      <td className="px-3 py-2 text-right">{log.pf}</td>
                      <td className="px-3 py-2 text-right font-bold text-white">{log.pts}</td>
                      <td className="px-3 py-2 text-right">{log.gmsc}</td>
                      <td className={`px-3 py-2 text-right ${log.plusMinus != null && log.plusMinus > 0 ? 'text-emerald-400' : log.plusMinus != null && log.plusMinus < 0 ? 'text-red-400' : ''}`}>
                        {log.plusMinus != null ? (log.plusMinus > 0 ? `+${log.plusMinus}` : log.plusMinus) : '—'}
                      </td>
                    </tr>
                    </React.Fragment>
                    );
                  })}
                  {gameLog.length === 0 && (
                    <tr>
                      <td colSpan={32} className="px-3 py-8 text-center text-slate-500">
                        No game log available for this season.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'Awards' && (
          <AwardsView awards={player.awards || []} teamColor={teamColor} />
        )}

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .bio-list { list-style: none; padding: 0; margin: 0; }
        .bio-list li { padding-left: 25px; position: relative; line-height: 1.7; color: #999; font-size: 15px; margin-bottom: 12px; }
        .bio-list li::before { content: ""; width: 6px; height: 6px; background: ${teamColor}; position: absolute; left: 0; top: 8px; border-radius: 1px; }
        .bio-list b { color: #eee; font-weight: 700; }
      `}} />
    </div>
  );
};