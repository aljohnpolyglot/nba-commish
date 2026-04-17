import React, { useState, useEffect, useMemo } from 'react';
import { NBAPlayer, Game } from '../../../types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { AwardsView } from './AwardsView';
import { PlayerBioHero } from './PlayerBioHero';
import { TabBar } from '../../shared/ui/TabBar';
import { PlayerBioStatsHistory } from './PlayerBioStatsHistory';
import { PlayerBioOverviewTab } from './PlayerBioOverviewTab';
import { PlayerBioGameLogTab } from './PlayerBioGameLogTab';
import { PlayerBioRatingsTab } from './PlayerBioRatingsTab';
import { PlayerBioContractTab } from './PlayerBioContractTab';
import { PlayerBioTransactionsTab } from './PlayerBioTransactionsTab';
import { TradeDetailView } from './TradeDetailView';
import { PlayerBioInjuriesTab } from './PlayerBioInjuriesTab';
import { PlayerBioMoraleTab } from './PlayerBioMoraleTab';

interface PlayerBioViewProps {
  player: NBAPlayer;
  onBack: () => void;
  onGameClick?: (game: Game) => void;
  onTeamClick?: (teamId: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

import { memCache, isCacheValid, fetchWithDedup, prefetchPlayerBio, getPlayerImage, getNonNBABioData } from './bioCache';
import { ensureNonNBAFetched, getNonNBAGistData } from './nonNBACache';
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

export const PlayerBioView: React.FC<PlayerBioViewProps> = ({ player, onBack, onGameClick, onTeamClick }) => {
  const { state } = useGame();
  const [bioData,     setBioData]    = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(() => !!extractNbaId(player.imgURL || "", player.name));
  const [fetchDone, setFetchDone] = useState(false);
  const [portraitSrc, setPortraitSrc] = useState<string>(() => getPlayerImage(player) || "");

  // Reset portrait when player changes (e.g. navigating between players without unmount)
  useEffect(() => {
    setPortraitSrc(getPlayerImage(player) || "");
    setFetchDone(false);
  }, [player.internalId]);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Historical Data' | 'Game Log' | 'Awards' | 'Ratings' | 'Salaries' | 'Transactions' | 'Injuries' | 'Morale'>('Historical Data');
  const [selectedTrade, setSelectedTrade] = useState<{ text: string; date: string; legs?: { text: string; date: string }[] } | null>(null);
  const team = useMemo(() => {
    const isNBA = !["WNBA","Euroleague","PBA","B-League","G-League","Endesa","China CBA","NBL Australia","Draft Prospect","Prospect"].includes(player.status || "");
    const current = isNBA
      ? state.teams.find(t => t.id === player.tid)
      : state.nonNBATeams.find(t => t.tid === player.tid && t.league === player.status);
    if (current) return current;
    // Retired / Free Agent — use team with most career regular-season GP
    if (isNBA && player.stats?.length) {
      const gpByTid = new Map<number, number>();
      for (const s of player.stats) {
        if (s.playoffs || (s.tid ?? -1) < 0) continue;
        gpByTid.set(s.tid, (gpByTid.get(s.tid) ?? 0) + (s.gp ?? 0));
      }
      let bestTid = -1, bestGP = 0;
      gpByTid.forEach((gp, tid) => { if (gp > bestGP) { bestGP = gp; bestTid = tid; } });
      if (bestTid >= 0) return state.teams.find(t => t.id === bestTid) ?? null;
    }
    return null;
  }, [player.tid, player.status, player.stats, state.teams, state.nonNBATeams]);

  const teamColor = team?.colors?.[0] || "#CE1141";
  const teamLogo  = (team as any)?.logoUrl || (team as any)?.imgURL;
  // NBATeam.name already includes city ("Cleveland Cavaliers"); NonNBATeam stores region+name separately
  const isNBATeam = !["WNBA","Euroleague","PBA","B-League","G-League","Endesa","China CBA","NBL Australia","Draft Prospect","Prospect"].includes(player.status || "");
  const teamFullName = team
    ? (!isNBATeam && (team as any).region ? `${(team as any).region} ${team.name}`.trim() : team.name)
    : null;

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

      const nonNBABio = getNonNBABioData(player);
      const isProspect = player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';
      // College: use BBGM college field, or parse "School (Yr)" from pre_draft e.g. "North Carolina (Sr)"
      const preDraftRaw = (player as any).pre_draft as string | undefined;
      const collegeName = (player as any).college
        || (preDraftRaw ? preDraftRaw.replace(/\s*\([^)]*\)\s*$/, '').trim() : null)
        || "None";
      // For prospects, show college as team label
      const teamLabel = isProspect ? (collegeName !== "None" ? collegeName : "Draft Prospect") : (teamFullName || "Free Agent");
      const baseData = {
        n: player.name,
        m: `${teamLabel} | #${player.jerseyNumber || "—"} | ${player.pos}`,
        h: player.hgt    ? `${Math.floor(player.hgt / 12)}'${player.hgt % 12}"` : "Unknown",
        w: player.weight ? `${player.weight}lb` : "Unknown",
        c: player.born?.loc || "Unknown",
        s: collegeName,
        a: `${curYear - bY} years`,
        b: `${bY}`,
        d: isProspect
          ? (player.draft?.year ? `Draft Eligible: ${player.draft.year}` : 'Draft Prospect')
          : (player.draft?.year
            ? (player.draft.round && player.draft.pick
              ? `${player.draft.year} R${player.draft.round} P${player.draft.pick}`
              : `${player.draft.year} Draft`)
            : "Undrafted"),
        e: `${curYear - dY} Years`,
        stats: (() => {
          if (ss) {
            const g = ss.gp || 1;
            return {
              PTS: ((ss.pts || 0) / g).toFixed(1),
              REB: (((ss.trb || (ss as any).reb || (ss.orb || 0) + (ss.drb || 0))) / g).toFixed(1),
              AST: ((ss.ast || 0) / g).toFixed(1),
              STL: ((ss.stl || 0) / g).toFixed(1),
              BLK: ((ss.blk || 0) / g).toFixed(1),
            };
          }
          // No current-season stats → compute career averages (retired players)
          const regStats = (player.stats || []).filter((s: any) => !s.playoffs && (s.tid ?? -1) >= 0);
          const tot = regStats.reduce((acc: any, s: any) => ({
            gp:  acc.gp  + (s.gp  || 0),
            pts: acc.pts + (s.pts || 0),
            trb: acc.trb + (s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))),
            ast: acc.ast + (s.ast || 0),
            stl: acc.stl + (s.stl || 0),
            blk: acc.blk + (s.blk || 0),
          }), { gp: 0, pts: 0, trb: 0, ast: 0, stl: 0, blk: 0 });
          const g = tot.gp || 1;
          return {
            PTS: (tot.pts / g).toFixed(1),
            REB: (tot.trb / g).toFixed(1),
            AST: (tot.ast / g).toFixed(1),
            STL: (tot.stl / g).toFixed(1),
            BLK: (tot.blk / g).toFixed(1),
          };
        })(),
        bio: nonNBABio?.bio || { pro: "", pre: "", per: "" },
      };

      if (isMounted) setBioData(baseData);

      // ── Non-NBA players: enrich hero stats + info + bio from gist ─────────
      if (nonNBABio) {
        if (isMounted) setIsSyncing(true);
        try {
          await ensureNonNBAFetched(player.status!);
          const gist = getNonNBAGistData(player.status!, player.name);
          if (isMounted && gist) {
            setBioData((prev: any) => ({
              ...prev,
              // Override hero stats bar with real league stats
              stats: {
                PTS: gist.stats.PTS,
                REB: gist.stats.REB,
                AST: gist.stats.AST,
                STL: gist.stats.STL ?? prev.stats.STL,
                BLK: gist.stats.BLK ?? prev.stats.BLK,
              },
              // Override info grid fields if gist has better data
              ...(gist.h && { h: gist.h }),
              ...(gist.w && { w: gist.w }),
              ...(gist.c && { c: gist.c }),
              ...(gist.s && { s: gist.s }),
              ...(gist.b && { b: gist.b }),
              ...(gist.a && { a: gist.a }),
              ...(gist.d && { d: gist.d }),
              // Recompute experience from gist draft year when player.draft.year was missing
              ...(gist.d && !player.draft?.year && (() => {
                const m = gist.d!.match(/^(\d{4})/);
                return m ? { e: `${Math.max(0, curYear - parseInt(m[1]))} Years` } : {};
              })()),
              // Bio section
              bio: { pro: gist.proBio || prev.bio.pro, pre: '', per: '' },
            }));
          }
        } catch (_) {}
        if (isMounted) { setIsSyncing(false); setFetchDone(true); }
        return;
      }

      // ── 2. Extract NBA ID ────────────────────────────────────────────────
      const nbaId = extractNbaId(player.imgURL || "", player.name);
      console.log(`%c[Scout Intel] imgURL="${player.imgURL}" → nbaId=${nbaId}`, "color:#94a3b8");

      if (!nbaId) {
        console.log(`%c[Scout Intel] No NBA ID for ${player.name} — BBGM only`, "color:#f59e0b");
        return;
      }

      // Don't eagerly switch to CDN — keep BBGM portrait until we confirm
      // the CDN has a better one (returned in payload.imgHD below).
      // CDN URLs rely on NBA player IDs which can mismatch for non-current players.

      // ── 3. Fetch (deduped — returns instantly from cache if available) ───
      setIsSyncing(true);
      try {
    const payload = await fetchWithDedup(nbaId, state.leagueStats?.year);
        if (isMounted) {
          setBioData((prev: any) => ({ ...prev, ...payload }));
          // Only upgrade to CDN HD portrait if the player has no BBGM imgURL.
          // BBGM portraits are the canonical source-of-truth and should not be replaced.
          if (payload.imgHD && !player.imgURL) setPortraitSrc(payload.imgHD);
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
    <>
    {selectedTrade && (
      <TradeDetailView
        entry={selectedTrade}
        legs={selectedTrade.legs}
        onBack={() => setSelectedTrade(null)}
      />
    )}
    {!selectedTrade && <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white overflow-hidden rounded-[2.5rem] border border-white/10 relative shadow-2xl">
      <button onClick={onBack} className="absolute top-6 left-6 z-50 w-10 h-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
        <ArrowLeft size={20} />
      </button>

      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* ── HERO ── */}
        <PlayerBioHero
          bioData={bioData}
          teamColor={teamColor}
          teamLogo={teamLogo}
          teamFullName={teamFullName}
          portraitSrc={portraitSrc}
          playerImgURL={player.imgURL}
          playerName={player.name}
          isSyncing={isSyncing}
          fetchDone={fetchDone}
          isHoF={!!player.hof}
        />

        {/* ── TABS ── */}
        <TabBar
          className="px-4 md:px-8 mt-5"
          tabs={[
            { id: 'Historical Data', label: 'Historical Data' },
            { id: 'Ratings',         label: 'Ratings' },
            { id: 'Overview',        label: 'Overview' },
            { id: 'Game Log',        label: 'Game Log' },
            { id: 'Salaries',        label: 'Salaries' },
            { id: 'Transactions',    label: 'Transactions' },
            { id: 'Injuries',        label: 'Injuries' },
            { id: 'Morale',          label: 'Morale' },
            { id: 'Awards',          label: 'Awards' },
          ]}
          active={activeTab}
          onChange={id => setActiveTab(id as typeof activeTab)}
        />

        {activeTab === 'Overview' && (
          <PlayerBioOverviewTab
            bioData={bioData}
            teamColor={teamColor}
            isSyncing={isSyncing}
            fetchDone={fetchDone}
          />
        )}
        
        {activeTab === 'Historical Data' && (
          <div className="bg-[#080808]">
            <PlayerBioStatsHistory player={player} />
          </div>
        )}

        {activeTab === 'Game Log' && (
          <PlayerBioGameLogTab player={player} onGameClick={onGameClick} onTeamClick={onTeamClick} />
        )}

        {activeTab === 'Ratings' && (
          <PlayerBioRatingsTab
            player={player}
            currentYear={state.leagueStats?.year ?? new Date().getFullYear()}
            teamColor={teamColor}
          />
        )}

        {activeTab === 'Salaries' && (
          <PlayerBioContractTab player={player} />
        )}

        {activeTab === 'Transactions' && (
          <PlayerBioTransactionsTab player={player} onTradeClick={setSelectedTrade} />
        )}

        {activeTab === 'Injuries' && (
          <PlayerBioInjuriesTab player={player} />
        )}

        {activeTab === 'Morale' && (
          <PlayerBioMoraleTab player={player} />
        )}

        {activeTab === 'Awards' && (
          <AwardsView awards={player.awards || []} teamColor={teamColor} />
        )}

      </div>
    </div>}

    </>
  );
};