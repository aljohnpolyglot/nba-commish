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
import { PlayerBioFamilyTreeTab } from './PlayerBioFamilyTreeTab';
import { findCollegeTeamProfile, getCollegeTeamLabel } from '../../../services/collegeTeamCatalog';
import { getProspectCollege, isDraftProspectLike } from '../../../utils/prospectUtils';

interface PlayerBioViewProps {
  player: NBAPlayer;
  onBack: () => void;
  onGameClick?: (game: Game) => void;
  onTeamClick?: (teamId: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

import { memCache, isCacheValid, fetchWithDedup, prefetchPlayerBio, getNonNBABioData } from './bioCache';
import { ensureNonNBAFetched, getNonNBAGistData } from './nonNBACache';
import { extractNbaId, hdPortrait } from '../../../utils/helpers';
import { classifyBoxScoreGame } from '../../../utils/gameClassification';
import {
  ensureBiosLoaded, getBioBySlug, fmtHeight,
} from '../../../data/realPlayerDataFetcher';

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

const buildHeroStatsFromSave = (stats: any[] | undefined, season: number) => {
  const seasonStats = (stats ?? []).filter(s => s.season === season && !s.playoffs && (s.gp ?? 0) > 0);
  if (seasonStats.length > 0) {
    const totals = seasonStats.reduce((acc: any, s: any) => ({
      gp: acc.gp + (s.gp || 0),
      pts: acc.pts + (s.pts || 0),
      trb: acc.trb + (s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))),
      ast: acc.ast + (s.ast || 0),
      stl: acc.stl + (s.stl || 0),
      blk: acc.blk + (s.blk || 0),
    }), { gp: 0, pts: 0, trb: 0, ast: 0, stl: 0, blk: 0 });
    const gp = totals.gp || 1;
    return {
      PTS: (totals.pts / gp).toFixed(1),
      REB: (totals.trb / gp).toFixed(1),
      AST: (totals.ast / gp).toFixed(1),
      STL: (totals.stl / gp).toFixed(1),
      BLK: (totals.blk / gp).toFixed(1),
      fromSeason: true,
    };
  }

  const regStats = (stats || []).filter((s: any) => !s.playoffs && (s.tid ?? -1) >= 0);
  if (regStats.length === 0) return null;
  const totals = regStats.reduce((acc: any, s: any) => ({
    gp:  acc.gp  + (s.gp  || 0),
    pts: acc.pts + (s.pts || 0),
    trb: acc.trb + (s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))),
    ast: acc.ast + (s.ast || 0),
    stl: acc.stl + (s.stl || 0),
    blk: acc.blk + (s.blk || 0),
  }), { gp: 0, pts: 0, trb: 0, ast: 0, stl: 0, blk: 0 });
  const gp = totals.gp || 1;
  return {
    PTS: (totals.pts / gp).toFixed(1),
    REB: (totals.trb / gp).toFixed(1),
    AST: (totals.ast / gp).toFixed(1),
    STL: (totals.stl / gp).toFixed(1),
    BLK: (totals.blk / gp).toFixed(1),
    fromSeason: false,
  };
};

const buildHeroStatsFromBoxScores = (
  playerId: string,
  season: number,
  boxScores: any[] | undefined,
  schedule: Game[] | undefined,
  playoffs: any,
  nbaCup: any,
  nbaCupHistory: any,
) => {
  let gp = 0;
  let pts = 0;
  let trb = 0;
  let ast = 0;
  let stl = 0;
  let blk = 0;

  for (const box of boxScores ?? []) {
    const meta = classifyBoxScoreGame(box as any, schedule ?? [], playoffs, nbaCup, nbaCupHistory, season);
    if (meta.seasonYear !== season || meta.isPreseason || meta.isPlayoff || meta.isPlayIn || meta.isCupFinal) {
      continue;
    }

    const phase = String((box as any).competitionPhase ?? '').toLowerCase();
    if (['play-in', 'qf', 'quarterfinals', 'sf', 'semifinals', 'final', 'final-four'].includes(phase)) {
      continue;
    }

    const line = [...((box as any).homeStats ?? []), ...((box as any).awayStats ?? [])]
      .find((stat: any) => stat.playerId === playerId);
    if (!line) continue;

    gp += 1;
    pts += Number(line.pts ?? 0);
    trb += Number(line.reb ?? line.trb ?? ((line.orb ?? 0) + (line.drb ?? 0)));
    ast += Number(line.ast ?? 0);
    stl += Number(line.stl ?? 0);
    blk += Number(line.blk ?? 0);
  }

  if (gp <= 0) return null;

  return {
    PTS: (pts / gp).toFixed(1),
    REB: (trb / gp).toFixed(1),
    AST: (ast / gp).toFixed(1),
    STL: (stl / gp).toFixed(1),
    BLK: (blk / gp).toFixed(1),
    fromSeason: true,
  };
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bulletList(items: Array<string | null | undefined>): string {
  return items
    .filter((item): item is string => !!item && item.trim().length > 0)
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join('');
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
  const currentYear = state.leagueStats?.year ?? new Date().getUTCFullYear();
  const isProspectProfile = useMemo(
    () => isDraftProspectLike(player, currentYear),
    [player, currentYear],
  );
  const collegeName = useMemo(
    () => getProspectCollege(player),
    [player],
  );
  const collegeProfile = useMemo(
    () => findCollegeTeamProfile(collegeName),
    [collegeName],
  );
  const [bioData,     setBioData]    = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(() =>
    !isDraftProspectLike(player, currentYear) && !!extractNbaId(player.imgURL || "", player.name),
  );
  const [fetchDone, setFetchDone] = useState(false);
  const [portraitSrc, setPortraitSrc] = useState<string>(() => {
    const u = player.imgURL?.trim();
    return (u && !u.includes('head-par-defaut')) ? u : "";
  });

  // Reset portrait when player changes (e.g. navigating between players without unmount)
  useEffect(() => {
    const u = player.imgURL?.trim();
    setPortraitSrc((u && !u.includes('head-par-defaut')) ? u : "");
    setFetchDone(false);
    setIsSyncing(!isDraftProspectLike(player, currentYear) && !!extractNbaId(player.imgURL || "", player.name));
  }, [player.internalId, player.imgURL, player.name, currentYear, player]);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Historical Data' | 'Game Log' | 'Awards' | 'Ratings' | 'Salaries' | 'Transactions' | 'Injuries' | 'Morale' | 'Family Tree'>('Historical Data');
  const [selectedTrade, setSelectedTrade] = useState<{ text: string; date: string; legs?: { text: string; date: string }[] } | null>(null);
  useEffect(() => {
    setActiveTab(isProspectProfile ? 'Overview' : 'Historical Data');
  }, [isProspectProfile, player.internalId]);
  const team = useMemo(() => {
    const isNBA = !["WNBA","Euroleague","PBA","B-League","G-League","Endesa","China CBA","NBL Australia","Draft Prospect","Prospect"].includes(player.status || "");
    // NBA tid range is [0,99]; everything else lives on nonNBATeams keyed by tid.
    // Don't gate the lookup on league === status — `player.status` is often
    // "Free Agent" / unset for non-NBA players, which previously left the header
    // without color/logo. Match by tid first, then prefer league-matching when
    // multiple share a tid (legacy +1000/+2000/etc. offsets).
    if (player.tid >= 0 && player.tid < 100 && isNBA) {
      const current = state.teams.find(t => t.id === player.tid);
      if (current) return current;
    } else {
      const tid = player.tid;
      const candidates = (state.nonNBATeams ?? []).filter(t => t.tid === tid);
      if (candidates.length > 0) {
        return candidates.find(t => t.league === player.status) ?? candidates[0];
      }
      // Legacy offset fallback (+1000/+2000/.../+8000)
      const offsets = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];
      for (const off of offsets) {
        if (tid >= off && tid < off + 1000) {
          const hit = (state.nonNBATeams ?? []).find(t => t.tid === tid - off);
          if (hit) return hit;
        }
      }
    }
    // Retired / Free Agent — use team with most career regular-season GP
    if (player.stats?.length) {
      const gpByTid = new Map<number, number>();
      for (const s of player.stats) {
        if (s.playoffs || (s.tid ?? -1) < 0) continue;
        gpByTid.set(s.tid, (gpByTid.get(s.tid) ?? 0) + (s.gp ?? 0));
      }
      let bestTid = -1, bestGP = 0;
      gpByTid.forEach((gp, tid) => { if (gp > bestGP) { bestGP = gp; bestTid = tid; } });
      if (bestTid >= 0) {
        if (bestTid < 100) return state.teams.find(t => t.id === bestTid) ?? null;
        return (state.nonNBATeams ?? []).find(t => t.tid === bestTid) ?? null;
      }
    }
    return null;
  }, [player.tid, player.status, player.stats, state.teams, state.nonNBATeams]);

  const teamColor = isProspectProfile
    ? (collegeProfile?.primaryColor || collegeProfile?.secondaryColor || "#1d4ed8")
    : (team?.colors?.[0] || "#CE1141");
  const teamLogo  = isProspectProfile
    ? collegeProfile?.logoUrl
    : ((team as any)?.logoUrl || (team as any)?.imgURL);
  // NBATeam.name already includes city ("Cleveland Cavaliers"); NonNBATeam stores region+name separately
  const isNBATeam = !["WNBA","Euroleague","PBA","B-League","G-League","Endesa","China CBA","NBL Australia","Draft Prospect","Prospect"].includes(player.status || "");
  const teamFullName = isProspectProfile
    ? (collegeProfile ? getCollegeTeamLabel(collegeProfile) : collegeName)
    : (team
      ? (!isNBATeam && (team as any).region ? `${(team as any).region} ${team.name}`.trim() : team.name)
      : null);

  const visibleTabs = useMemo(() => {
    if (isProspectProfile) {
      return [
        { id: 'Overview', label: 'Overview' },
        { id: 'Awards', label: 'Awards' },
        ...((player.relatives && player.relatives.length > 0) ? [{ id: 'Family Tree', label: 'Family Tree' }] : []),
      ];
    }

    return [
      { id: 'Historical Data', label: 'Historical Data' },
      { id: 'Ratings', label: 'Ratings' },
      { id: 'Overview', label: 'Overview' },
      { id: 'Game Log', label: 'Game Log' },
      { id: 'Salaries', label: 'Salaries' },
      { id: 'Transactions', label: 'Transactions' },
      { id: 'Injuries', label: 'Injuries' },
      { id: 'Morale', label: 'Morale' },
      { id: 'Awards', label: 'Awards' },
      ...((player.relatives && player.relatives.length > 0) ? [{ id: 'Family Tree', label: 'Family Tree' }] : []),
    ];
  }, [isProspectProfile, player.relatives]);

  const maxSeason = useMemo(() => {
    return state.players.reduce((max, p) => {
      const pMax = p.stats?.reduce((m, s) => Math.max(m, s.season), 0) || 0;
      return Math.max(max, pMax);
    }, state.leagueStats.year);
  }, [state.players, state.leagueStats.year]);

  const liveHeroStats = useMemo(() => {
    const season = state.leagueStats?.year ?? maxSeason;
    return buildHeroStatsFromBoxScores(
      player.internalId,
      season,
      state.boxScores,
      state.schedule,
      state.playoffs,
      state.nbaCup,
      state.nbaCupHistory,
    ) ?? buildHeroStatsFromSave(player.stats, season);
  }, [
    maxSeason,
    player.internalId,
    player.stats,
    state.boxScores,
    state.schedule,
    state.playoffs,
    state.nbaCup,
    state.nbaCupHistory,
    state.leagueStats?.year,
  ]);

  useEffect(() => {
    const nextStats = liveHeroStats
      ? {
          PTS: liveHeroStats.PTS,
          REB: liveHeroStats.REB,
          AST: liveHeroStats.AST,
          STL: liveHeroStats.STL,
          BLK: liveHeroStats.BLK,
        }
      : { PTS: '0.0', REB: '0.0', AST: '0.0', STL: '0.0', BLK: '0.0' };

    setBioData((prev: any) => {
      if (!prev) return prev;
      const currentStats = prev.stats ?? {};
      if (
        currentStats.PTS === nextStats.PTS &&
        currentStats.REB === nextStats.REB &&
        currentStats.AST === nextStats.AST &&
        currentStats.STL === nextStats.STL &&
        currentStats.BLK === nextStats.BLK
      ) {
        return prev;
      }
      return { ...prev, stats: nextStats };
    });
  }, [liveHeroStats]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const run = async () => {
      console.log(`%c[Scout Intel] Opening bio: ${player.name}`, "color:#00d4ff;font-weight:bold");

      // ── 1. Instant BBGM data ─────────────────────────────────────────────
      const curYear = maxSeason;
      const bY = player.born?.year  || 1995;
      const dY = player.draft?.year || 2026;
      const heroStats = liveHeroStats;

      const nonNBABio = getNonNBABioData(player);
      const preDraftRaw = (player as any).pre_draft as string | undefined;
      const collegeDisplay = collegeName || "None";
      const teamLabel = isProspectProfile ? (collegeDisplay !== "None" ? collegeDisplay : "Draft Prospect") : (teamFullName || "Free Agent");
      const diedYear: number | undefined = (player as any).diedYear;
      const ageYear = diedYear ? Math.min(curYear, diedYear) : curYear;
      const metaLine = [
        teamLabel,
        ...(!isProspectProfile && player.jerseyNumber ? [`#${player.jerseyNumber}`] : []),
        ...(isProspectProfile ? ['Draft Prospect'] : []),
        player.pos,
      ].filter(Boolean).join(' | ');
      const baseData = {
        n: player.name,
        m: metaLine,
        h: player.hgt    ? `${Math.floor(player.hgt / 12)}'${player.hgt % 12}"` : "Unknown",
        w: player.weight ? `${player.weight}lb` : "Unknown",
        c: player.born?.loc || "Unknown",
        s: collegeDisplay,
        a: diedYear ? `${ageYear - bY} († ${diedYear})` : `${ageYear - bY} years`,
        b: `${bY}`,
        d: isProspectProfile
          ? (player.draft?.year ? `Draft Eligible: ${player.draft.year}` : 'Draft Prospect')
          : (player.draft?.year
            ? (player.draft.round && player.draft.pick
              ? `${player.draft.year} R${player.draft.round} P${player.draft.pick}`
              : `Undrafted (${player.draft.year})`)
            : "Undrafted"),
        e: isProspectProfile ? 'Pre-NBA' : (() => {
          // Experience = NBA seasons with at least 1 game played, not
          // calendar years since draft. Essengue (0 career GP) was showing
          // "5 Years" despite never touching the floor.
          const played = (player.stats ?? []).filter(
            (s: any) => !s.playoffs && (s.gp ?? 0) > 0
          ).length;
          return `${played} Year${played === 1 ? '' : 's'}`;
        })(),
        stats: heroStats
          ? {
              PTS: heroStats.PTS,
              REB: heroStats.REB,
              AST: heroStats.AST,
              STL: heroStats.STL,
              BLK: heroStats.BLK,
            }
          : { PTS: '0.0', REB: '0.0', AST: '0.0', STL: '0.0', BLK: '0.0' },
        bio: isProspectProfile
          ? {
              pro: bulletList([
                `${player.name} enters the ${dY} draft cycle as a ${player.pos} prospect.`,
                collegeDisplay !== 'None' ? `Last program on file: ${teamLabel}.` : 'No college program has been attached to this prospect yet.',
                collegeProfile?.conferenceName ? `${teamLabel} competes in the ${collegeProfile.conferenceName}.` : null,
              ]),
              pre: bulletList([
                preDraftRaw ? `Source listing: ${preDraftRaw}.` : null,
                player.born?.loc ? `Hometown / birth location on file: ${player.born.loc}.` : null,
                player.hgt ? `Listed measurements: ${Math.floor(player.hgt / 12)}'${player.hgt % 12}" and ${player.weight || 'unknown'} pounds.` : null,
              ]),
              per: bulletList([
                player.draft?.year ? `Draft class: ${player.draft.year}.` : 'Draft class not yet attached.',
                player.age != null ? `Current listed age: ${player.age}.` : null,
                collegeDisplay !== 'None' ? `${player.name} has not been drafted yet and is shown under college branding.` : null,
              ]),
            }
          : (nonNBABio?.bio || { pro: "", pre: "", per: "" }),
      };

      if (isMounted) setBioData(baseData);

      if (isProspectProfile) {
        if (isMounted) {
          setIsSyncing(false);
          setFetchDone(true);
        }
        return;
      }

      // ── Non-NBA players: enrich hero stats + info + bio from gist ─────────
      if (nonNBABio) {
        if (isMounted) setIsSyncing(true);
        try {
          await ensureNonNBAFetched(player.status!);
          const gist = getNonNBAGistData(player.status!, player.name);
          if (isMounted && gist) {
            setBioData((prev: any) => ({
              ...prev,
              ...(heroStats ? {} : {
                stats: {
                  PTS: gist.stats.PTS,
                  REB: gist.stats.REB,
                  AST: gist.stats.AST,
                  STL: gist.stats.STL ?? prev.stats.STL,
                  BLK: gist.stats.BLK ?? prev.stats.BLK,
                },
              }),
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

      // ── 1b. ZenGM bio enrichment for retired/historical NBA players ────────
      // Fires only when srID is present and the player is retired (or has missing
      // bio fields). The 17 MB JSON is fetched once and cached in module memory.
      const needsZenGM = player.srID && (
        player.status === 'Retired' ||
        !player.born?.loc ||
        player.hgt == null ||
        player.weight == null
      );
      if (needsZenGM) {
        // Don't block the NBA.com path — run in background, update bio when done.
        ensureBiosLoaded().then(() => {
          if (!isMounted) return;
          const zen = getBioBySlug(player.srID!);
          if (!zen) return;
          setBioData((prev: any) => {
            if (!prev) return prev;
            const patch: Record<string, any> = {};
            // Only fill fields that are still showing "Unknown" / "None"
            if (zen.height && prev.h === 'Unknown') patch.h = fmtHeight(zen.height);
            if (zen.weight && prev.w === 'Unknown') patch.w = `${zen.weight}lb`;
            if (zen.country && (prev.c === 'Unknown' || !prev.c)) patch.c = zen.country;
            if (zen.college && (prev.s === 'None' || !prev.s)) patch.s = zen.college;
            if (zen.bornYear && prev.b === String(bY)) patch.b = String(zen.bornYear);
            if (zen.draftYear && prev.d === 'Undrafted') {
              const rd = zen.draftRound ? ` R${zen.draftRound}` : '';
              const pk = zen.draftPick  ? ` P${zen.draftPick}` : '';
              patch.d = `${zen.draftYear}${rd}${pk}`;
              patch.e = `${Math.max(0, curYear - zen.draftYear)} Years`;
            }
            return Object.keys(patch).length ? { ...prev, ...patch } : prev;
          });
        });
      }

      // ── 2. Extract NBA ID (for bio text only — not for portrait) ────────────
      const nbaId = extractNbaId(player.imgURL || "", player.name);
      console.log(`%c[Scout Intel] imgURL="${player.imgURL}" → nbaId=${nbaId}`, "color:#94a3b8");

      if (!nbaId) {
        console.log(`%c[Scout Intel] No NBA ID for ${player.name} — BBGM only`, "color:#f59e0b");
        return;
      }

      // ── 3. Fetch bio text (deduped — returns instantly from cache if available) ───
      setIsSyncing(true);
      try {
    const payload = await fetchWithDedup(nbaId, state.leagueStats?.year);
        if (isMounted) {
          // Cache enriches bio text, portrait URL, country, school, and formatted birthdate.
          // Game-state fields are always pinned — cache must never overwrite live data.
          setBioData((prev: any) => ({
            ...prev,
            ...payload,
            n: baseData.n,
            m: baseData.m,
            stats: baseData.stats,
            h: baseData.h,
            w: baseData.w,
            a: baseData.a,
            d: baseData.d,
            e: baseData.e,
          }));
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
  }, [player, team, maxSeason, state.leagueStats?.year, liveHeroStats, teamFullName, isProspectProfile, collegeName, collegeProfile]);

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
          face={(player as any).face}
          showStatsBar={!isProspectProfile}
          schoolLabel={isProspectProfile ? 'College' : 'Last Attended'}
        />

        {/* ── TABS ── */}
        <TabBar
          className="px-4 md:px-8 mt-5"
          tabs={visibleTabs}
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
        
        {!isProspectProfile && activeTab === 'Historical Data' && (
          <div className="bg-[#080808]">
            <PlayerBioStatsHistory player={player} />
          </div>
        )}

        {!isProspectProfile && activeTab === 'Game Log' && (
          <PlayerBioGameLogTab player={player} onGameClick={onGameClick} onTeamClick={onTeamClick} />
        )}

        {!isProspectProfile && activeTab === 'Ratings' && (
          <PlayerBioRatingsTab
            player={player}
            currentYear={state.leagueStats?.year ?? new Date().getFullYear()}
            teamColor={teamColor}
          />
        )}

        {!isProspectProfile && activeTab === 'Salaries' && (
          <PlayerBioContractTab player={player} />
        )}

        {!isProspectProfile && activeTab === 'Transactions' && (
          <PlayerBioTransactionsTab player={player} onTradeClick={setSelectedTrade} />
        )}

        {!isProspectProfile && activeTab === 'Injuries' && (
          <PlayerBioInjuriesTab player={player} />
        )}

        {!isProspectProfile && activeTab === 'Morale' && (
          <PlayerBioMoraleTab player={player} />
        )}

        {activeTab === 'Awards' && (
          <AwardsView awards={player.awards || []} teamColor={teamColor} />
        )}

        {activeTab === 'Family Tree' && (
          <PlayerBioFamilyTreeTab player={player} teamColor={teamColor} />
        )}

      </div>
    </div>}

    </>
  );
};
