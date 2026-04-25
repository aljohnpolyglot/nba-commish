/**
 * TeamIntelFreeAgency — Free Agency scouting + live bid tracker.
 *
 * Three panels:
 *  1. Cap Ticker — current cap room, MLE available, projected after winning shortlist.
 *  2. My Shortlist — user-curated FAs (≤ 15) with one-click "Submit bid" CTAs.
 *  3. Live Bid Tracker — every market involving a shortlisted FA or where the user
 *     has bid; shows top current bid, user bid, days to decision.
 *  4. Top FAs by Tier — read-only scouting drawer at the bottom.
 *
 * Persistence: shortlist lives on tradingBlockStore.faShortlistIds[] alongside trade
 * targets so it survives navigation/refresh + survives mode-switch GM ↔ Commissioner.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { PlayerSelectorGrid, type PlayerSelectorItem } from '../../../../shared/PlayerSelectorGrid';
import { convertTo2KRating } from '../../../../../utils/helpers';
import { getDisplayPotential } from '../../../../../utils/playerRatings';
import {
  computeContractOffer,
  getCapThresholds,
  getMLEAvailability,
} from '../../../../../utils/salaryUtils';
import { getTradingBlock, saveTradingBlock } from '../../../../../store/tradingBlockStore';
import { usePlayerQuickActions } from '../../../../../hooks/usePlayerQuickActions';
import type { NBAPlayer } from '../../../../../types';

interface Props {
  teamId: number;
  onPlayerClick?: (player: NBAPlayer) => void;
}

const SHORTLIST_CAP = 15;

function getK2Ovr(p: NBAPlayer): number {
  const r = p.ratings?.[p.ratings.length - 1];
  return convertTo2KRating(p.overallRating, r?.hgt ?? 50, r?.tp ?? 50);
}

// Use the canonical POT formula from playerRatings.ts — same source of truth
// PlayerRatingsModal uses, so the FA scouting tab POT matches everywhere else.

// Last regular season totals → per-game using the same conventions as
// PlayerStatsView: pts/gp, (orb+drb || trb)/gp, ast/gp, mpg. PER is already
// stored per-100/per-min on the stat entry — just read it through.
function getLastSeasonPergame(p: NBAPlayer): { pts: number; reb: number; ast: number; per: number; gp: number; mp: number } | null {
  const stats = ((p as any).stats ?? []) as Array<any>;
  const last = stats.filter(s => !s.playoffs && (s.gp ?? 0) > 0).slice(-1)[0];
  if (!last) return null;
  const gp = last.gp ?? 0;
  if (gp <= 0) return null;
  return {
    pts: (last.pts ?? 0) / gp,
    reb: ((last.orb ?? 0) + (last.drb ?? 0)) / gp || (last.trb ?? 0) / gp,
    ast: (last.ast ?? 0) / gp,
    per: last.per ?? 0,
    mp: (last.min ?? 0) / gp,
    gp,
  };
}

const fmt1 = (v: number) => Number.isFinite(v) && v > 0 ? v.toFixed(1) : '—';

function isPlayerRFA(p: NBAPlayer): boolean {
  const c = (p as any).contract;
  if (c?.isRestrictedFA || c?.restrictedFA) return true;
  // Real-player imports never get contract.restrictedFA stamped — only in-sim
  // drafted players go through autoResolvers. R1 rookie deal → RFA on expiry.
  if (c?.rookie && (p as any).draft?.round === 1) return true;
  return false;
}

/** Most-recent NBA team tid for the player — same logic Bird Rights / RFA
 *  pipelines use, so the displayed "Team" abbrev matches what those flows see. */
function getLastTeamTid(p: NBAPlayer): number {
  const txns: Array<{ season: number; tid: number }> = (p as any).transactions ?? [];
  if (txns.length > 0) {
    const t = [...txns].sort((a, b) => b.season - a.season).find(x => x.tid >= 0 && x.tid <= 29);
    if (t) return t.tid;
  }
  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (p as any).stats ?? [];
  const s = stats.filter(x => !x.playoffs && (x.gp ?? 0) > 0 && (x.tid ?? -1) >= 0 && (x.tid ?? -1) <= 29)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0))[0];
  return s ? (s.tid ?? -1) : -1;
}

/** Bird Rights truthy check with stats-based fallback. The `hasBirdRights` flag
 *  is set by seasonRollover when yearsWithTeam ≥ 3, but real-player gist imports
 *  often lack the flag (Duren on DET 4 yrs but flag never seeded). Derive it
 *  from stats: ≥ 3 consecutive recent seasons with the same NBA tid. */
function hasBirdRightsResolved(p: NBAPlayer): boolean {
  if ((p as any).hasBirdRights === true) return true;
  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (p as any).stats ?? [];
  const sorted = stats
    .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
  if (sorted.length < 3) return false;
  const lastTid = sorted[0].tid;
  let consecutive = 0;
  for (const s of sorted) {
    if (s.tid === lastTid) consecutive++;
    else break;
  }
  return consecutive >= 3;
}

function fmtUSD(n: number): string {
  // Negative cap space (over-cap teams) was rendering as "$-69820785" because
  // the >= 1_000_000 check fails for negatives. Format the magnitude, prepend
  // the sign before the dollar — matches NBA standard "-$69.8M" notation.
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

export function TeamIntelFreeAgency({ teamId, onPlayerClick }: Props) {
  const { state, dispatchAction } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const isGM = state.gameMode === 'gm';
  const isOwnTeam = isGM && teamId === state.userTeamId;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const quick = usePlayerQuickActions();

  // ── Shortlist state (mutually exclusive with trade targets) ───────────
  const initial = useMemo(() => {
    const saved = getTradingBlock(teamId);
    return new Set(saved?.faShortlistIds ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(initial);
  const [editing, setEditing] = useState(false);

  // Persist shortlist edits
  useEffect(() => {
    if (!isOwnTeam) return;
    const existing = getTradingBlock(teamId);
    saveTradingBlock(teamId, {
      untouchableIds: existing?.untouchableIds ?? [],
      blockIds: existing?.blockIds ?? [],
      targetIds: existing?.targetIds ?? [],
      blockPickIds: existing?.blockPickIds ?? [],
      faShortlistIds: Array.from(shortlistIds),
    });
  }, [shortlistIds, isOwnTeam, teamId]);

  // ── FA pool ───────────────────────────────────────────────────────────
  const allFAs = useMemo(
    () => state.players.filter(p =>
      p.tid === -1 &&
      p.status === 'Free Agent' &&
      !((p as any).draft?.year >= currentYear),
    ),
    [state.players, currentYear],
  );

  // Drop stale shortlist ids (player got signed between renders)
  const faIdSet = useMemo(() => new Set(allFAs.map(p => p.internalId)), [allFAs]);
  useEffect(() => {
    setShortlistIds(prev => {
      const next = new Set([...prev].filter(id => faIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [faIdSet]);

  const shortlistedPlayers = useMemo(
    () => allFAs.filter(p => shortlistIds.has(p.internalId)),
    [allFAs, shortlistIds],
  );

  // ── Cap math ──────────────────────────────────────────────────────────
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);
  const teamPayrollUSD = useMemo(
    () => state.players
      .filter(p => p.tid === teamId && !(p as any).twoWay)
      .reduce((s, p) => s + ((p.contract?.amount ?? 0) * 1_000), 0),
    [state.players, teamId],
  );
  const capSpaceUSD = thresholds.salaryCap - teamPayrollUSD;
  const mleAvail = useMemo(
    () => getMLEAvailability(teamId, teamPayrollUSD, 0, thresholds, state.leagueStats as any),
    [teamId, teamPayrollUSD, thresholds, state.leagueStats],
  );
  const shortlistCommitUSD = useMemo(
    () => shortlistedPlayers.reduce((s, p) => s + computeContractOffer(p, state.leagueStats as any).salaryUSD, 0),
    [shortlistedPlayers, state.leagueStats],
  );
  // Real available signing budget = cap room (when positive) + MLE.
  // Over-cap teams sign via MLE — pure capSpace - shortlistCommit math made it
  // look like Boston (cap -$51M, MLE $5.7M) couldn't sign anyone, when it can
  // absolutely use its MLE on shortlisted FAs.
  const positiveCap = Math.max(0, capSpaceUSD);
  const mleRoom = mleAvail.blocked ? 0 : mleAvail.available;
  const availableRoomUSD = positiveCap + mleRoom;
  const projectedRoomAfterShortlist = availableRoomUSD - shortlistCommitUSD;

  // ── Live bid markets ──────────────────────────────────────────────────
  const allMarkets = state.faBidding?.markets ?? [];
  const trackedMarkets = useMemo(() => {
    return allMarkets
      .filter(m => !m.resolved)
      .filter(m =>
        shortlistIds.has(m.playerId) ||
        m.bids.some(b => b.teamId === teamId),
      )
      .map(m => {
        const p = state.players.find(pp => pp.internalId === m.playerId);
        const activeBids = m.bids.filter(b => b.status === 'active');
        const top = [...activeBids].sort((a, b) => b.salaryUSD - a.salaryUSD)[0];
        const userBid = activeBids.find(b => b.teamId === teamId);
        const daysToDecide = Math.max(0, m.decidesOnDay - state.day);
        return { market: m, player: p, top, userBid, daysToDecide };
      });
  }, [allMarkets, shortlistIds, teamId, state.players, state.day]);

  // ── Top FA scouting drawer ────────────────────────────────────────────
  const [tierFilter, setTierFilter] = useState<'all' | '90+' | '80-89' | '70-79' | 'u25'>('all');
  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'k2', dir: 'desc' });

  const topFAsForDrawer = useMemo(() => {
    const filtered = allFAs
      .map(p => ({ player: p, k2: getK2Ovr(p), age: p.born?.year ? currentYear - p.born.year : (p.age ?? 0) }))
      .filter(x => {
        if (tierFilter === '90+') return x.k2 >= 90;
        if (tierFilter === '80-89') return x.k2 >= 80 && x.k2 < 90;
        if (tierFilter === '70-79') return x.k2 >= 70 && x.k2 < 80;
        if (tierFilter === 'u25') return x.age < 25;
        return true;
      });

    // Apply sorting
    const sorted = [...filtered].sort((aRow, bRow) => {
      const a = aRow;
      const b = bRow;
      let aVal: any = 0, bVal: any = 0;

      switch (sortConfig.col) {
        case 'name':
          aVal = a.player.name;
          bVal = b.player.name;
          break;
        case 'age':
          aVal = a.age;
          bVal = b.age;
          break;
        case 'k2':
          aVal = a.k2;
          bVal = b.k2;
          break;
        case 'pot': {
          aVal = getDisplayPotential(a.player, currentYear);
          bVal = getDisplayPotential(b.player, currentYear);
          break;
        }
        case 'mp': {
          const pgA = getLastSeasonPergame(a.player);
          const pgB = getLastSeasonPergame(b.player);
          aVal = pgA?.mp ?? 0;
          bVal = pgB?.mp ?? 0;
          break;
        }
        case 'pos':
          aVal = a.player.pos ?? '';
          bVal = b.player.pos ?? '';
          break;
        case 'pts': {
          const pgA = getLastSeasonPergame(a.player);
          const pgB = getLastSeasonPergame(b.player);
          aVal = pgA?.pts ?? 0;
          bVal = pgB?.pts ?? 0;
          break;
        }
        case 'reb': {
          const pgA = getLastSeasonPergame(a.player);
          const pgB = getLastSeasonPergame(b.player);
          aVal = pgA?.reb ?? 0;
          bVal = pgB?.reb ?? 0;
          break;
        }
        case 'ast': {
          const pgA = getLastSeasonPergame(a.player);
          const pgB = getLastSeasonPergame(b.player);
          aVal = pgA?.ast ?? 0;
          bVal = pgB?.ast ?? 0;
          break;
        }
        case 'per': {
          const pgA = getLastSeasonPergame(a.player);
          const pgB = getLastSeasonPergame(b.player);
          aVal = pgA?.per ?? 0;
          bVal = pgB?.per ?? 0;
          break;
        }
        case 'asking': {
          const offerA = computeContractOffer(a.player, state.leagueStats as any);
          const offerB = computeContractOffer(b.player, state.leagueStats as any);
          aVal = offerA.salaryUSD * offerA.years;
          bVal = offerB.salaryUSD * offerB.years;
          break;
        }
        default:
          aVal = a.k2;
          bVal = b.k2;
      }

      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      // Numeric comparison
      const diff = aVal - bVal;
      return sortConfig.dir === 'asc' ? diff : -diff;
    });

    return sorted.slice(0, 30);
  }, [allFAs, currentYear, tierFilter, sortConfig, state.leagueStats]);

  const handleSort = (col: string) => {
    setSortConfig(prev => ({
      col,
      dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  // ── Toggle helpers ────────────────────────────────────────────────────
  const toggleShortlist = (id: string) => {
    setShortlistIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); return n; }
      if (n.size >= SHORTLIST_CAP) return prev;
      n.add(id);
      return n;
    });
  };

  // ── Auto-bid: shortlist as an active acquisition list (Trade Hub parity) ──
  // Submits a competitive market bid via SUBMIT_FA_BID. Bid floor = computeContractOffer.
  // If a market already exists with a higher top bid, beat it by +5% so the bid
  // actually competes instead of sitting underwater. Caps at the player's max contract.
  const submitAutoBid = (player: NBAPlayer): { ok: boolean; reason?: string } => {
    if (!isOwnTeam || !team) return { ok: false, reason: 'GM mode + own team only' };
    const offer = computeContractOffer(player, state.leagueStats as any);
    const market = allMarkets.find(m => m.playerId === player.internalId && !m.resolved);
    const topActive = market?.bids
      .filter(b => b.status === 'active' && !b.isUserBid)
      .sort((a, b) => b.salaryUSD - a.salaryUSD)[0];
    // Beat top bid by 5% if there's competition; else bid the computed market value.
    let salaryUSD = offer.salaryUSD;
    if (topActive && topActive.salaryUSD * 1.05 > salaryUSD) {
      salaryUSD = Math.round(topActive.salaryUSD * 1.05);
    }
    // Hard ceiling: don't exceed cap+MLE room (player is signable AND it's a real bid).
    const room = capSpaceUSD + (mleAvail.blocked ? 0 : mleAvail.available);
    if (salaryUSD > room && room > 0) salaryUSD = room;
    if (salaryUSD <= 0) return { ok: false, reason: 'No cap room' };
    const k2 = getK2Ovr(player);
    const wantsOption: 'NONE' | 'PLAYER' | 'TEAM' = k2 >= 88 && offer.years >= 3 ? 'PLAYER' : 'NONE';
    dispatchAction({
      type: 'SUBMIT_FA_BID',
      payload: {
        playerId: player.internalId,
        playerName: player.name,
        teamId,
        teamName: team.name,
        teamLogoUrl: team.logoUrl,
        salaryUSD,
        years: offer.years,
        option: wantsOption,
      },
    } as any);
    return { ok: true };
  };

  const submitAutoBidsAll = () => {
    if (!isOwnTeam) return;
    let submitted = 0;
    let skipped = 0;
    for (const p of shortlistedPlayers) {
      const res = submitAutoBid(p);
      if (res.ok) submitted++; else skipped++;
    }
    if (submitted > 0 || skipped > 0) {
      // eslint-disable-next-line no-alert
      alert(`Auto-bids: ${submitted} submitted${skipped > 0 ? `, ${skipped} skipped (cap)` : ''}.`);
    }
  };

  const shortlistItems: PlayerSelectorItem[] = useMemo(
    () => allFAs.map(p => ({
      player: p,
      score: getK2Ovr(p),
      subtitle: `${getK2Ovr(p)} K2`,
    })),
    [allFAs],
  );

  // ── Render ────────────────────────────────────────────────────────────
  // If the quick-actions modal stack opens View Bio, it replaces the whole view.
  if (quick.fullPageView) return quick.fullPageView;

  return (
    <>
    <div className="h-full flex flex-col gap-3">
      {/* Cap Ticker — combined cap + MLE budget so over-cap teams (Boston tier)
           don't show "$0 budget" when their MLE is the real working budget. */}
      <div className="rounded-lg border border-[#30363d] bg-black/40 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Cap Space" value={fmtUSD(capSpaceUSD)} tone={capSpaceUSD < 0 ? 'red' : 'emerald'} />
        <Stat label="MLE Available" value={mleAvail.blocked ? '—' : fmtUSD(mleAvail.available)} />
        <Stat label="Shortlist Commit" value={fmtUSD(shortlistCommitUSD)} tone={shortlistCommitUSD > availableRoomUSD ? 'amber' : undefined} />
        <Stat
          label="Room After Shortlist"
          value={fmtUSD(projectedRoomAfterShortlist)}
          tone={projectedRoomAfterShortlist < 0 ? 'red' : projectedRoomAfterShortlist === 0 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Two-column layout: Shortlist (left) + Bid Tracker (right) */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
        {/* Shortlist */}
        <div className="lg:w-[360px] flex flex-col rounded-lg border border-[#30363d] bg-black/40 overflow-hidden shrink-0">
          <div className="p-3 border-b border-[#30363d] flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-bold uppercase tracking-wider text-sm">My Shortlist</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{shortlistIds.size}/{SHORTLIST_CAP}</span>
              {isOwnTeam && shortlistedPlayers.length > 0 && (
                <button
                  onClick={submitAutoBidsAll}
                  className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold uppercase text-[10px] rounded"
                  title="Submit competitive bids on every shortlisted FA via the bid market"
                >
                  Auto-bid All
                </button>
              )}
              {isOwnTeam && (
                <button
                  onClick={() => setEditing(true)}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase text-[10px] rounded"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {shortlistedPlayers.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-8">
                {isOwnTeam
                  ? 'Star FAs you\'re scouting. Click Edit to add up to 15.'
                  : `The ${team?.name ?? 'team'} front office has no public scouting board. Use the Top Free Agents drawer below to see who's available.`}
              </div>
            ) : (
              shortlistedPlayers
                .map(p => ({ p, k2: getK2Ovr(p), offer: computeContractOffer(p, state.leagueStats as any) }))
                .sort((a, b) => b.k2 - a.k2)
                .map(({ p, k2, offer }) => {
                  const traits: string[] = (p as any).moodTraits ?? [];
                  const traitBadge = traits.find(t => ['LOYAL', 'MERCENARY', 'COMPETITOR'].includes(t));
                  const age = p.born?.year ? currentYear - p.born.year : (p.age ?? 0);
                  return (
                    <div
                      key={p.internalId}
                      onClick={() => onPlayerClick?.(p) || quick.openFor(p)}
                      className="flex items-center gap-2 px-2 py-2 bg-white/5 hover:bg-white/10 rounded cursor-pointer"
                    >
                      <PlayerPortrait playerName={p.name} imgUrl={p.imgURL} face={(p as any).face} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {p.name.charAt(0)}. {p.name.split(' ').slice(1).join(' ')}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span>{p.pos}</span>
                          <span className="text-slate-600">·</span>
                          <span>age {age}</span>
                          {traitBadge && (
                            <>
                              <span className="text-slate-600">·</span>
                              <span className={cn(
                                'font-bold',
                                traitBadge === 'LOYAL' ? 'text-emerald-300' :
                                traitBadge === 'MERCENARY' ? 'text-amber-300' :
                                'text-sky-300',
                              )}>{traitBadge}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn(
                          'text-sm font-black tabular-nums',
                          k2 >= 90 ? 'text-blue-300' :
                          k2 >= 85 ? 'text-emerald-300' :
                          k2 >= 78 ? 'text-amber-300' : 'text-slate-400',
                        )}>{k2}</div>
                        <div className="text-[9px] text-slate-500 tabular-nums">{fmtUSD(offer.salaryUSD)}/yr</div>
                      </div>
                      {isOwnTeam && (() => {
                        const hasMarket = allMarkets.some(m => m.playerId === p.internalId && !m.resolved);
                        const hasUserBid = hasMarket && allMarkets.find(m => m.playerId === p.internalId && !m.resolved)
                          ?.bids.some(b => b.teamId === teamId && b.status === 'active');
                        return (
                          <div className="flex flex-col items-end gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); submitAutoBid(p); }}
                              className={cn(
                                'px-2 py-0.5 text-[9px] font-bold uppercase rounded',
                                hasUserBid
                                  ? 'bg-amber-600/30 text-amber-300 hover:bg-amber-600/50'
                                  : 'bg-amber-600 hover:bg-amber-500 text-white',
                              )}
                              title={hasUserBid ? 'Bump your bid (beat top by 5%)' : 'Submit competitive market bid'}
                            >
                              {hasUserBid ? 'Bump' : 'Pursue'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleShortlist(p.internalId); }}
                              className="text-rose-400/70 hover:text-rose-400 text-xs leading-none px-1"
                              title="Remove from shortlist"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Live Bid Tracker */}
        <div className="flex-1 flex flex-col rounded-lg border border-[#30363d] bg-black/40 overflow-hidden min-w-0">
          <div className="p-3 border-b border-[#30363d] flex items-center justify-between">
            <h3 className="font-bold uppercase tracking-wider text-sm">
              {isOwnTeam ? 'Live Bid Tracker' : `${team?.name ?? 'Team'} — Active Bids`}
            </h3>
            <span className="text-xs text-slate-400">{trackedMarkets.length} active market{trackedMarkets.length === 1 ? '' : 's'}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {trackedMarkets.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-8">
                {!isOwnTeam
                  ? `The ${team?.name ?? 'team'} has no active bids on free agents right now.`
                  : shortlistIds.size === 0
                    ? 'Shortlist a FA to track their market here. Active markets where you\'ve bid will also appear.'
                    : 'No live markets for shortlisted players. Markets open mid-FA-window — check back tomorrow.'}
              </div>
            ) : (
              trackedMarkets.map(({ market, player, top, userBid, daysToDecide }) => {
                if (!player || !top) return null;
                const k2 = getK2Ovr(player);
                // "userBid" / "userLeading" semantics depend on viewing context:
                //  - GM mode + own team: it's literally the user's bid → use "You" copy
                //  - Commissioner OR GM viewing another team: it's the displayed team's bid
                //    → use third-person copy ("Leading" / "{Team} bid")
                const teamHasBid = !!userBid;
                const teamLeading = teamHasBid && top.teamId === teamId;
                const teamOutbid = teamHasBid && top.teamId !== teamId;
                const topTeam = state.teams.find(t => t.id === top.teamId);
                const teamShort = team?.abbrev ?? team?.name ?? 'Team';
                const statusLabel = isOwnTeam
                  ? (teamLeading ? 'You lead' : teamOutbid ? 'Outbid' : 'No bid')
                  : (teamLeading ? 'Leading' : teamOutbid ? 'Outbid' : 'Not bidding');
                const teamBidLabel = isOwnTeam ? 'Your bid' : `${teamShort} bid`;
                return (
                  <div
                    key={market.playerId}
                    onClick={() => quick.openFor(player)}
                    className={cn(
                      'rounded border p-3 cursor-pointer transition-colors',
                      teamLeading ? 'border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20' :
                      teamOutbid ? 'border-rose-500/60 bg-rose-500/10 hover:bg-rose-500/20' :
                      'border-slate-700 bg-white/5 hover:bg-white/10',
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <PlayerPortrait playerName={player.name} imgUrl={player.imgURL} face={(player as any).face} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate flex items-center gap-1.5">
                          {(() => {
                            const priorTid = getLastTeamTid(player);
                            const priorTeam = priorTid >= 0 ? state.teams.find(t => t.id === priorTid) : null;
                            return priorTeam?.logoUrl
                              ? <img src={priorTeam.logoUrl} alt={priorTeam.abbrev ?? priorTeam.name} referrerPolicy="no-referrer" className="w-4 h-4 object-contain shrink-0 opacity-80" title={`Last with ${priorTeam.name}`} />
                              : null;
                          })()}
                          <span className="truncate">{player.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {player.pos} · K2 {k2} · {daysToDecide === 0 ? <span className="text-rose-300 font-bold">Resolves today</span> : `Resolves in ${daysToDecide}d`}
                        </div>
                      </div>
                      <span className={cn(
                        'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded',
                        teamLeading ? 'bg-amber-500/30 text-amber-200' :
                        teamOutbid ? 'bg-rose-500/30 text-rose-200' :
                        'bg-slate-700/50 text-slate-300',
                      )}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="text-slate-500 uppercase tracking-wider text-[9px]">Top bid</div>
                        <div className="font-bold tabular-nums">{fmtUSD(top.salaryUSD)}/yr · {top.years}yr</div>
                        <div className="text-slate-400 text-[10px] flex items-center gap-1.5 mt-0.5">
                          {topTeam?.logoUrl && (
                            <img
                              src={topTeam.logoUrl}
                              alt={topTeam.abbrev ?? topTeam.name}
                              referrerPolicy="no-referrer"
                              className="w-3.5 h-3.5 object-contain shrink-0"
                            />
                          )}
                          <span>{topTeam?.abbrev ?? topTeam?.name ?? '—'}</span>
                        </div>
                      </div>
                      {userBid && (
                        <div>
                          <div className="text-slate-500 uppercase tracking-wider text-[9px]">{teamBidLabel}</div>
                          <div className="font-bold tabular-nums">{fmtUSD(userBid.salaryUSD)}/yr · {userBid.years}yr</div>
                          <div className="text-slate-400 text-[10px] flex items-center gap-1.5 mt-0.5">
                            {team?.logoUrl && (
                              <img
                                src={team.logoUrl}
                                alt={team.abbrev ?? team.name}
                                referrerPolicy="no-referrer"
                                className="w-3.5 h-3.5 object-contain shrink-0"
                              />
                            )}
                            <span>
                              {userBid.option === 'PLAYER' ? 'Player option'
                                : userBid.option === 'TEAM' ? 'Team option'
                                : '—'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Top FAs scouting drawer */}
      <div className="rounded-lg border border-[#30363d] bg-black/40 overflow-hidden shrink-0">
        <div className="p-3 border-b border-[#30363d] flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold uppercase tracking-wider text-sm">Top Free Agents</h3>
          <div className="flex gap-1">
            {(['all', '90+', '80-89', '70-79', 'u25'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={cn(
                  'px-2 py-1 text-[10px] font-bold uppercase rounded',
                  tierFilter === t ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
                )}
              >{t === 'u25' ? 'Under 25' : t}</button>
            ))}
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
              <tr className="text-[10px] text-slate-400 uppercase tracking-wider">
                <th className="text-left px-3 py-2 cursor-pointer hover:text-slate-300" onClick={() => handleSort('name')}>
                  Player {sortConfig.col === 'name' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-center px-1.5 py-2" title="Most recent NBA team">Team</th>
                <th className="text-center px-2 py-2 cursor-pointer hover:text-slate-300" onClick={() => handleSort('pos')}>
                  Pos {sortConfig.col === 'pos' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-center px-1.5 py-2 cursor-pointer hover:text-slate-300" onClick={() => handleSort('age')}>
                  Age {sortConfig.col === 'age' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-right px-1.5 py-2 cursor-pointer hover:text-slate-300" onClick={() => handleSort('k2')}>
                  K2 {sortConfig.col === 'k2' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-right px-1.5 py-2 cursor-pointer hover:text-slate-300" title="2K-style potential rating" onClick={() => handleSort('pot')}>
                  POT {sortConfig.col === 'pot' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-right px-1.5 py-2 cursor-pointer hover:text-slate-300" onClick={() => handleSort('mp')}>
                  MPG {sortConfig.col === 'mp' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-right px-1.5 py-2 cursor-pointer hover:text-slate-300" onClick={() => handleSort('pts')}>
                  PTS {sortConfig.col === 'pts' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-right px-1.5 py-2 cursor-pointer hover:text-slate-300" onClick={() => handleSort('reb')}>
                  REB {sortConfig.col === 'reb' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-right px-1.5 py-2 cursor-pointer hover:text-slate-300" onClick={() => handleSort('ast')}>
                  AST {sortConfig.col === 'ast' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-right px-1.5 py-2 cursor-pointer hover:text-slate-300" onClick={() => handleSort('per')}>
                  PER {sortConfig.col === 'per' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-center px-1.5 py-2" title="Restricted (prior team can match offer sheet) vs Unrestricted">Type</th>
                <th className="text-center px-1.5 py-2" title="Bird Rights — prior team can sign over the cap">Bird</th>
                <th className="text-center px-1.5 py-2" title="Number of active competing bids in the market">Offers</th>
                <th className="text-right px-2 py-2 cursor-pointer hover:text-slate-300" onClick={() => handleSort('asking')}>
                  Asking {sortConfig.col === 'asking' && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                {isOwnTeam && <th className="text-center px-2 py-2 w-[60px]">★</th>}
              </tr>
            </thead>
            <tbody>
              {topFAsForDrawer.map(({ player, k2, age }) => {
                const offer = computeContractOffer(player, state.leagueStats as any);
                const isShortlisted = shortlistIds.has(player.internalId);
                const pot = getDisplayPotential(player, currentYear);
                const pg = getLastSeasonPergame(player);
                const rfa = isPlayerRFA(player);
                const askingTotalUSD = offer.salaryUSD * offer.years;
                const lastTid = getLastTeamTid(player);
                const lastTeam = lastTid >= 0 ? state.teams.find(t => t.id === lastTid) : null;
                // Bird Rights belongs to the player's prior team — flag set on the
                // player at rollover when yearsWithTeam ≥ 3. Useful as a "should-we-bid"
                // signal: if the viewing team has Bird, they can sign over the cap.
                // Bird Rights is a *team-specific* claim: only the player's prior
                // team can sign them over the cap. From DET's view, LeBron (last
                // team LAL) shows NO — DET doesn't hold his Bird Rights, LAL does.
                const hasBird = hasBirdRightsResolved(player) && lastTid === teamId;
                // Count active offers for this player from the live market
                const playerMarket = allMarkets.find(mk => mk.playerId === player.internalId && !mk.resolved);
                const activeOfferCount = playerMarket?.bids.filter(b => b.status === 'active').length ?? 0;
                // Highlight the row when the viewing team is the player's prior
                // team — these are *your* expiring guys, the ones you most want to
                // re-sign or watch for poaching.
                const isYourPriorPlayer = lastTid === teamId && lastTid >= 0;
                return (
                  <tr
                    key={player.internalId}
                    onClick={() => quick.openFor(player)}
                    className={cn(
                      'border-t border-slate-800/60 cursor-pointer',
                      isYourPriorPlayer
                        ? 'bg-amber-500/10 hover:bg-amber-500/20 border-l-2 border-l-amber-500'
                        : 'hover:bg-white/5',
                    )}
                  >
                    <td className="px-3 py-1.5 font-semibold truncate max-w-[160px]">{player.name}</td>
                    <td className="text-center text-slate-400 font-bold tabular-nums text-[10px]">
                      {lastTeam ? (
                        <span className="inline-flex items-center gap-1 justify-center">
                          {lastTeam.logoUrl && (
                            <img
                              src={lastTeam.logoUrl}
                              alt={lastTeam.abbrev ?? lastTeam.name}
                              referrerPolicy="no-referrer"
                              className="w-4 h-4 object-contain shrink-0 opacity-90"
                            />
                          )}
                          <span>{lastTeam.abbrev}</span>
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="text-center text-slate-400">{player.pos}</td>
                    <td className="text-center text-slate-400 tabular-nums">{age}</td>
                    <td className={cn(
                      'text-right font-black tabular-nums',
                      k2 >= 90 ? 'text-blue-300' :
                      k2 >= 85 ? 'text-emerald-300' :
                      k2 >= 78 ? 'text-amber-300' : 'text-slate-400',
                    )}>{k2}</td>
                    <td className={cn(
                      'text-right font-semibold tabular-nums',
                      pot >= 90 ? 'text-blue-300/80' :
                      pot >= 85 ? 'text-emerald-300/80' :
                      pot >= 78 ? 'text-amber-300/80' : 'text-slate-500',
                    )}>{pot}</td>
                    <td className="text-right text-slate-300 tabular-nums">{pg ? fmt1(pg.mp) : <span className="text-slate-600">—</span>}</td>
                    <td className="text-right text-slate-300 tabular-nums">{pg ? fmt1(pg.pts) : <span className="text-slate-600">—</span>}</td>
                    <td className="text-right text-slate-300 tabular-nums">{pg ? fmt1(pg.reb) : <span className="text-slate-600">—</span>}</td>
                    <td className="text-right text-slate-300 tabular-nums">{pg ? fmt1(pg.ast) : <span className="text-slate-600">—</span>}</td>
                    <td className="text-right text-slate-300 tabular-nums">{pg ? fmt1(pg.per) : <span className="text-slate-600">—</span>}</td>
                    <td className="text-center">
                      <span className={cn(
                        'inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider',
                        rfa
                          ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40'
                          : 'bg-slate-700/40 text-slate-400 border border-slate-700',
                      )}>
                        {rfa ? 'RFA' : 'UFA'}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className={cn(
                        'inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider',
                        hasBird
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-700/40 text-slate-500 border border-slate-700',
                      )}>
                        {hasBird ? 'YES' : 'NO'}
                      </span>
                    </td>
                    <td className="text-center">
                      {activeOfferCount > 0 ? (
                        <span className={cn(
                          'inline-block px-1.5 py-0.5 rounded text-[9px] font-black tabular-nums tracking-wider',
                          activeOfferCount >= 4 ? 'bg-blue-500/25 text-blue-200 border border-blue-500/50' :
                          activeOfferCount >= 2 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                          'bg-slate-700/40 text-slate-300 border border-slate-700',
                        )}>
                          {activeOfferCount}
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-600 tracking-wider">—</span>
                      )}
                    </td>
                    <td className="text-right text-slate-300 tabular-nums whitespace-nowrap">
                      {fmtUSD(askingTotalUSD)}/{offer.years}yr
                    </td>
                    {isOwnTeam && (
                      <td className="text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleShortlist(player.internalId); }}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-sm',
                            isShortlisted ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300',
                          )}
                          title={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                        >
                          {isShortlisted ? '★' : '☆'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shortlist editor modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => setEditing(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm sm:text-lg font-black text-white uppercase tracking-widest">FA Shortlist</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{shortlistIds.size}/{SHORTLIST_CAP}</span>
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase text-xs rounded-xl">Done</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <PlayerSelectorGrid
                items={shortlistItems}
                teams={state.teams as any}
                selectedIds={shortlistIds}
                onToggle={toggleShortlist}
                maxSelections={SHORTLIST_CAP}
                accentColor="amber"
                searchPlaceholder="Search free agents..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
    {/* Portal to document.body — TeamIntel wraps this view in a backdrop-blur
        container, which creates a stacking context that traps `position:fixed`
        children inside the right pane. createPortal escapes it. */}
    {createPortal(quick.portals, document.body)}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'red' | 'amber' }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className={cn(
        'text-base sm:text-lg font-black tabular-nums',
        tone === 'red' ? 'text-rose-400' :
        tone === 'amber' ? 'text-amber-400' :
        tone === 'emerald' ? 'text-emerald-400' : 'text-white',
      )}>{value}</div>
    </div>
  );
}
