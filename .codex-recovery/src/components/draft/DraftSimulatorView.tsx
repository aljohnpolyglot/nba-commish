/**
 * DraftSimulatorView.tsx
 * Mock draft simulator connected to game state.
 * Uses real game prospects + real team draft order (worst record → #1 pick).
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Clock, Play, Pause, CheckCircle, ChevronLeft, ChevronRight, Calendar, FastForward } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating, normalizeDate } from '../../utils/helpers';
import { getDraftDate, isDraftBlockedByUnresolvedPlayoffs, toISODateString } from '../../utils/dateUtils';
import { getLsYear } from '../../utils/leagueYear';
import { estimatePotentialBbgm } from '../../utils/playerRatings';
import { ensureNonNBAFetched, getNonNBAGistData } from '../central/view/nonNBACache';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { getPlayerImage } from '../central/view/bioCache';
import { normalizeTeamJerseyNumbers, pickJerseyNumber } from '../../utils/jerseyUtils';
import type { NBAPlayer } from '../../types';
import { MyFace, isRealFaceConfig } from '../shared/MyFace';
import { DraftScoutingModal } from './DraftScoutingModal';
import { buildDraftOrderFromState, type DraftOrderTeam } from '../../services/draft/draftOrder';
import {
  getClassPercentiles,
  getClassAverages,
  computeSkillScores,
  batchComparisonsDeduped,
  SKILL_AXES,
  type ClassPercentileMaps,
  type SkillAxis,
} from '../../services/scoutingReport';
import { getCachedDraftScouting, ensureDraftScouting, matchProspectToGist, type GistProspect } from '../../services/draftScoutingGist';
import { getPlayerImage } from '../central/view/bioCache';
import { MyFace, isRealFaceConfig } from '../shared/MyFace';
import {
  MAX_DRAFT_POOL_SIZE,
  POSITIONS,
  parseBioDraftStr,
  BIO_LEAGUE_MAP,
  getOrdinalSuffix,
  computeDraftPickFields,
} from './simulator/helpers';
import { FullDraftTable } from './simulator/FullDraftTable';
import { CompactTeamNeedsPanel } from './simulator/CompactTeamNeedsPanel';
import { CompactAdvisorBoardPanel } from './simulator/CompactAdvisorBoardPanel';

// ─── Component ────────────────────────────────────────────────────────────────

interface DraftSimulatorViewProps {
  onViewChange?: (view: string) => void;
}

export const DraftSimulatorView: React.FC<DraftSimulatorViewProps> = ({ onViewChange }) => {
  const { state, dispatchAction: dispatch } = useGame();

  // Trigger re-render once external bio gist caches are loaded (they hold NBA draft strings)
  const [nonNBACacheVer, setNonNBACacheVer] = useState(0);
  useEffect(() => {
    Promise.all(Object.values(BIO_LEAGUE_MAP).map(ensureNonNBAFetched))
      .then(() => setNonNBACacheVer(v => v + 1));
  }, []);

  // Build 60-pick draft order:
  // R1: picks 1-14 from lottery results (if available), picks 15-30 from playoff teams worst→best.
  // R2: same team order as R1.
  // After determining the SOURCE order (who EARNED each slot via record/lottery),
  // each slot is re-mapped to its CURRENT owner via state.draftPicks so traded
  // picks display + assign to the team that actually holds them.
  // Narrow deps to the bits buildDraftOrderFromState actually reads. A `[state]`
  // dep refires on every dispatch and combines with the persist effect below to
  // produce React #185 (infinite update loop) once the user starts drafting.
  const computedDraftOrder = useMemo(
    () => buildDraftOrderFromState(state),
    [state.leagueStats?.year, state.draftPicks, state.draftLotteryResult, state.teams],
  );
  const savedDraftOrder = (state as any).activeDraftOrder as DraftOrderTeam[] | undefined;

  const EXTERNAL_STATUSES = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);

  // POT estimator — delegates to the canonical BBGM potEstimator so draft view,
  // player views, and modals all produce the same POT for the same inputs.
  const estimatePot = (rawOvr: number, hgt: number, tp: number | undefined, age: number): number =>
    convertTo2KRating(estimatePotentialBbgm(rawOvr, age), hgt, tp);

  // All available draft years — NBA roster players (primary) + bio-gist data for external leagues
  const nbaTids = useMemo(() => new Set(state.teams.map(t => t.id)), [state.teams]);
  const availableDraftYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of state.players) {
      if (p.status === 'WNBA' || p.status === 'PBA') continue;
      const d = (p as any).draft;
      if (d?.year && d?.round && d?.pick) { years.add(Number(d.year)); continue; }
      // External player: check bio gist for draft year
      const league = BIO_LEAGUE_MAP[p.status ?? ''];
      if (league) {
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed) years.add(parsed.year);
      }
    }
    return Array.from(years).sort((a, b) => b - a); // newest first
  }, [state.players, nbaTids, nonNBACacheVer]);

  // Default to the UPCOMING draft year (ls.year) so the Draft Board lands
  // on the about-to-run draft, not stale results from the previous year.
  // availableDraftYears (sorted newest-first) only includes years where
  // players have draft.year set — so it's always 1 year BEHIND the current
  // ls.year until the draft actually runs.
  const upcomingDraftYear = getLsYear(state);
  const defaultViewYear = upcomingDraftYear;
  const [viewDraftYear, setViewDraftYear] = useState<number>(defaultViewYear);

  // Sync viewDraftYear when availableDraftYears changes (new save loaded)
  // OR when ls.year increments (post-rollover) so the picker re-anchors
  // to the new upcoming draft.
  useEffect(() => {
    if (availableDraftYears.length > 0 && !availableDraftYears.includes(viewDraftYear) && viewDraftYear !== upcomingDraftYear) {
      setViewDraftYear(upcomingDraftYear);
    }
  }, [availableDraftYears, upcomingDraftYear]);

  const latestDraftClass = useMemo(() => {
    // Collect candidates, attaching resolved _draftRound/_draftPick for slot mapping
    const candidates: any[] = [];

    for (const p of state.players) {
      // Skip WNBA and PBA entirely
      if (p.status === 'WNBA' || p.status === 'PBA') continue;

      const d = (p as any).draft;
      let dYear  = d?.year  ? Number(d.year)  : null;
      let dRound = d?.round ? Number(d.round) : null;
      let dPick  = d?.pick  ? Number(d.pick)  : null;

      // For external league players missing draft info in player object,
      // fall back to the bio gist (RealGM/NBA context — e.g. Willy Hernangomez "2015 R2 P5")
      let bioDraftTeamName: string | undefined;
      if ((!dRound || !dPick) && BIO_LEAGUE_MAP[p.status ?? '']) {
        const league = BIO_LEAGUE_MAP[p.status ?? ''];
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed) {
          dYear = parsed.year; dRound = parsed.round; dPick = parsed.pick;
          bioDraftTeamName = parsed.team; // e.g. "Minnesota Timberwolves"
        }
      }

      if (!dYear || dYear !== viewDraftYear) continue;
      if (!dRound || !dPick) continue;

      // NBA roster players always included; external-league players included if they have a pick
      const isOnNBATeam = nbaTids.has(p.tid);
      const isExternalDrafted = !!BIO_LEAGUE_MAP[p.status ?? ''] && !!dRound && !!dPick;
      if (!isOnNBATeam && !isExternalDrafted) continue;

      candidates.push({ ...p, _draftRound: dRound, _draftPick: dPick, _bioDraftTeamName: bioDraftTeamName });
    }

    // Deduplicate by pick slot (keep highest OVR if collision)
    const bySlot = new Map<number, any>();
    for (const p of candidates) {
      const slot = (p._draftRound === 1 ? 0 : 30) + p._draftPick;
      const existing = bySlot.get(slot);
      if (!existing || (p.overallRating ?? 0) > (existing.overallRating ?? 0)) {
        bySlot.set(slot, p);
      }
    }

    return Array.from(bySlot.entries())
      .sort(([a], [b]) => a - b)
      .map(([slot, p]) => {
        const lastRatings = p.ratings?.[p.ratings.length - 1] ?? {};
        const hgt = lastRatings.hgt ?? 50;
        const tp = lastRatings.tp;
        const rawOvr = lastRatings.ovr ?? p.overallRating ?? 0;
        const age = p.age ?? 26;
        const displayOvr = convertTo2KRating(rawOvr, hgt, tp);
        const storedPotBbgm: number | undefined = lastRatings.pot;
        const potBbgm = Math.max(rawOvr, (storedPotBbgm != null && storedPotBbgm > 0) ? storedPotBbgm : estimatePotentialBbgm(rawOvr, age));
        const displayPot = convertTo2KRating(potBbgm, hgt, tp);
        return {
          ...p,
          _slot: slot,
          displayOvr,
          displayPot,
        };
      });
  }, [state.players, viewDraftYear, nbaTids, state.leagueStats?.year, nonNBACacheVer]);

  const mostRecentDraftYear = viewDraftYear;

  // ─── Date gating ──────────────────────────────────────────────────────────
  const leagueYear = getLsYear(state);
  const draftDate = toISODateString(getDraftDate(leagueYear, state.leagueStats));
  const today = normalizeDate(state.date);
  const isDraftTime = today >= draftDate && !isDraftBlockedByUnresolvedPlayoffs(state);
  // draftComplete is stored as a top-level state field via UPDATE_STATE dispatch
  const isDraftDone = !!(state as any).draftComplete;

  // Draft board: undrafted prospects for the CURRENT season's draft class only
  // (BBGM data includes future classes 2027/2028 — filter to leagueYear only)
  const allProspects = useMemo(() => {
    return state.players
      .filter(p => {
        const isProspect = p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect';
        if (!isProspect) return false;
        if (EXTERNAL_STATUSES.has(p.status ?? '')) return false;
        // Only current year's draft class (or prospects with no year set).
        // Treat draftYear=0 (BBGM historical players) same as a mismatched year.
        const draftYear = (p as any).draft?.year;
        if (draftYear != null && Number(draftYear) !== leagueYear) return false;
        return true;
      })
      .map(p => {
        const lastRatings = p.ratings?.[p.ratings.length - 1] ?? {};
        const hgt = lastRatings.hgt ?? 50;
        const tp = lastRatings.tp;
        const rawOvr = p.overallRating || lastRatings.ovr || 0;
        const age = p.age ?? 20;
        const displayOvr = convertTo2KRating(rawOvr, hgt, tp);
        const storedPotBbgm2: number | undefined = lastRatings.pot;
        const potBbgm2 = Math.max(rawOvr, (storedPotBbgm2 != null && storedPotBbgm2 > 0) ? storedPotBbgm2 : estimatePotentialBbgm(rawOvr, age));
        const displayPot = convertTo2KRating(potBbgm2, hgt, tp);
        const gp = (p.stats ?? []).reduce((s: number, r: any) => s + (r.gp ?? 0), 0);
        const pts = (p.stats ?? []).reduce((s: number, r: any) => s + (r.pts ?? 0), 0);
        const trb = (p.stats ?? []).reduce((s: number, r: any) => s + (r.trb ?? (r.orb ?? 0) + (r.drb ?? 0)), 0);
        const ast = (p.stats ?? []).reduce((s: number, r: any) => s + (r.ast ?? 0), 0);
        return {
          ...p,
          displayOvr,
          displayPot,
          ppg: gp > 0 ? (pts / gp).toFixed(1) : '—',
          rpg: gp > 0 ? (trb / gp).toFixed(1) : '—',
          apg: gp > 0 ? (ast / gp).toFixed(1) : '—',
          pos: p.pos ?? lastRatings.pos ?? 'F',
        };
      })
      .sort((a, b) => b.displayOvr - a.displayOvr || b.displayPot - a.displayPot)
      .slice(0, MAX_DRAFT_POOL_SIZE);
  }, [state.players, state.leagueStats?.year]);

  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);

  // Lazy-load the scouting gist for this draft year so the modal can show
  // ESPN/NoCeilings ranks, college stats, and silos without bouncing through
  // DraftScoutingView first.
  useEffect(() => {
    let cancelled = false;
    ensureDraftScouting(leagueYear).then(data => {
      if (!cancelled) setGistByYear(data);
    });
    return () => { cancelled = true; };
  }, [leagueYear]);

  // Active NBA roster players — the comparison pool for findTopComparisons.
  const activePlayers = useMemo(() =>
    state.players.filter(p =>
      p.tid >= 0 && p.tid < 100 &&
      p.status !== 'Draft Prospect' &&
      p.status !== 'Prospect' &&
      ((p as any).draft?.year ?? 0) < leagueYear
    ),
  [state.players, leagueYear]);

  // Class baselines + position-relative percentiles. Computed once per draft
  // year (via allProspects ref) and passed into the modal so reopening is O(1).
  const classAverages = useMemo(() => getClassAverages(allProspects), [allProspects]);
  const percentilesByPos = useMemo(() => {
    const m = new Map<string, ClassPercentileMaps>();
    m.set('Guard', getClassPercentiles(allProspects, 'Guard'));
    m.set('Forward', getClassPercentiles(allProspects, 'Forward'));
    m.set('Center', getClassPercentiles(allProspects, 'Center'));
    m.set('Class', getClassPercentiles(allProspects, 'Class'));
    return m;
  }, [allProspects]);

  // Batch comps: computed once per class, deduped so no player dominates.
  const batchComps = useMemo(
    () => batchComparisonsDeduped(allProspects as unknown as NBAPlayer[], activePlayers),
    [allProspects, activePlayers],
  );

  // Restore in-progress draft from game state so switching views doesn't lose picks
  const savedDraftPicks: Record<number, any> = (state as any).activeDraftPicks ?? {};
  const savedPickCount = Object.keys(savedDraftPicks).length;
  const [currentPick, setCurrentPick] = useState<number>(() =>
    savedPickCount > 0 ? Math.max(...Object.keys(savedDraftPicks).map(Number)) + 1 : 1
  );
  const [drafted, setDrafted] = useState<Record<number, any>>(() => savedDraftPicks);
  const draftOrder = useMemo(() => {
    if ((savedDraftOrder?.length ?? 0) === 0) return computedDraftOrder;
    return savedDraftOrder!.map((team, idx) => {
      const pickSlot = idx + 1;
      return pickSlot < currentPick ? team : (computedDraftOrder[idx] ?? team);
    });
  }, [computedDraftOrder, savedDraftOrder, currentPick]);
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'ovr' | 'pot' | SkillAxis>('ovr');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState('normal');
  const [hasStarted, setHasStarted] = useState<boolean>(() => savedPickCount > 0);
  const [scoutingPlayer, setScoutingPlayer] = useState<any>(null);
  const [gistByYear, setGistByYear] = useState<GistProspect[] | null>(getCachedDraftScouting(leagueYear) ?? null);

  // (Persist-on-pick is handled atomically inside commitPickToState and
  // simToPickInstant. A redundant useEffect here that watched `draftOrder` would
  // re-dispatch every time computedDraftOrder rebuilt, feeding back into itself
  // via state.draftPicks updates → React #185 infinite loop.)

  const draftedSet = useMemo(() => new Set(Object.values(drafted).map((p: any) => p.internalId)), [drafted]);

  // Undrafted pool sorted by the active criterion. Rank is derived from THIS pool
  // (before position filtering) so a top-5 OVR PG still shows as #5 when the PG
  // filter is active, not #1.
  const sortedPool = useMemo(() => {
    const pool = allProspects.filter(p => !draftedSet.has(p.internalId));
    if (sortBy === 'pot') {
      return [...pool].sort((a, b) => (b.displayPot ?? 0) - (a.displayPot ?? 0));
    }
    if (sortBy === 'ovr') {
      return pool; // allProspects is pre-sorted by displayOvr desc
    }
    // Skill sort — re-sort by the chosen skill score (highest first)
    return [...pool].sort((a, b) =>
      computeSkillScores(b as NBAPlayer)[sortBy as SkillAxis] -
      computeSkillScores(a as NBAPlayer)[sortBy as SkillAxis]
    );
  }, [allProspects, draftedSet, sortBy]);

  const rankById = useMemo(() => {
    const m = new Map<any, number>();
    sortedPool.forEach((p, i) => m.set(p.internalId, i + 1));
    return m;
  }, [sortedPool]);

  const available = useMemo(
    () => sortedPool.filter(p => posFilter === 'ALL' || (p.pos ?? '').includes(posFilter)),
    [sortedPool, posFilter],
  );

  const teamOnClock = draftOrder[currentPick - 1];
  const nextTeam = draftOrder[currentPick];
  const isDraftComplete = currentPick > draftOrder.length;

  // GM mode: the user manages one specific franchise. Other teams' picks are
  // off-limits to avoid sabotage (e.g. wasting another team's #3 on a R2 body).
  const isGM = state.gameMode === 'gm';
  const userTeamId = state.userTeamId;
  const isUserOnClock = isGM && userTeamId != null && teamOnClock?.id === userTeamId;
  // 1-indexed pick slots owned by the user. Uses draftOrder (not state.draftPicks)
  // to stay aligned with the slot sequence the UI iterates — in-draft pick trades
  // aren't modeled here, so this is the user's natural slot list.
  const userPickSlots = useMemo(() => {
    if (!isGM || userTeamId == null) return [] as number[];
    return draftOrder
      .map((t: any, i: number) => (t?.id === userTeamId ? i + 1 : -1))
      .filter((n: number) => n > 0);
  }, [isGM, userTeamId, draftOrder]);
  const userRemainingPicks = useMemo(
    () => userPickSlots.filter(p => p >= currentPick),
    [userPickSlots, currentPick],
  );
  const nextUserPick = userRemainingPicks[0] ?? null;
  const userHasMorePicks = nextUserPick != null;

  // simTarget stops the auto-sim loop when currentPick reaches this value. Set
  // by "Sim to Next Pick" / "Sim to End" so GM-mode runs hands-off until control
  // returns to the user's slot.
  const [simTarget, setSimTarget] = useState<number | null>(null);

  const buildDraftedPlayerUpdate = useCallback((player: any, pickSlot: number) =>
    computeDraftPickFields(pickSlot, draftOrder[pickSlot - 1], state.leagueStats),
  [draftOrder, state.leagueStats]);

  // Immediately commit a single pick to game state — no roster gate.
  const commitPickToState = useCallback((pickSlot: number, player: any) => {
    const update = buildDraftedPlayerUpdate(player, pickSlot);
    if (!update) return;
    // Snapshot in-progress picks (including this one) so autoRunDraft can honor
    // them if user advances day before completing the draft.
    const activeDraftPicksAfter: Record<number, any> = { ...drafted, [pickSlot]: player };
    const team = draftOrder[pickSlot - 1];
    const retired = new Set<string>(
      ((team as any)?.retiredJerseyNumbers ?? []).map((j: any) => String(j.number))
    );
    const taken = new Set<string>(
      state.players
        .filter((p: any) => p.tid === team?.id && p.jerseyNumber && p.internalId !== player.internalId)
        .map((p: any) => String(p.jerseyNumber))
    );
    const excluded = new Set([...retired, ...taken]);
    const existingNum = player.jerseyNumber ? String(player.jerseyNumber) : '';
    const jerseyNumber = (!existingNum || retired.has(existingNum))
      ? pickJerseyNumber(excluded)
      : existingNum;
    const updatedPlayers = state.players.map((p: any) =>
      p.internalId === player.internalId ? { ...p, ...update, jerseyNumber } : p
    );
    // Remove the consumed pick from inventory immediately so Trade Machine /
    // Trade Finder / AI engine can't reuse a slot that's already been drafted.
    const draftSeason: number = state.leagueStats?.year ?? leagueYear;
    const round = pickSlot <= 30 ? 1 : 2;
    const originalTid = (team as any)?._originalTid ?? team?.id;
    const draftPicksAfter = (state.draftPicks ?? []).filter(
      (dp: any) => !(dp.season === draftSeason && dp.round === round && dp.originalTid === originalTid)
    );
    dispatch({
      type: 'UPDATE_STATE',
      payload: {
        players: normalizeTeamJerseyNumbers(updatedPlayers as any, state.teams as any, leagueYear, {
          history: state.history,
          targetTeamIds: team?.id != null ? [team.id] : [],
        }),
        draftPicks: draftPicksAfter,
        activeDraftPicks: activeDraftPicksAfter,
        activeDraftOrder: draftOrder,
      },
    } as any);
  }, [drafted, state.players, state.draftPicks, state.leagueStats?.year, buildDraftedPlayerUpdate, dispatch, draftOrder, leagueYear]);

  const draftPlayer = useCallback((player: any) => {
    setHasStarted(true);
    setDrafted(prev => ({ ...prev, [currentPick]: player }));
    commitPickToState(currentPick, player);
    setCurrentPick(prev => prev + 1);
  }, [currentPick, commitPickToState]);

  // Instant sim — process every pick from currentPick up to (but not including) targetPick
  // synchronously in a single state update. Used by "Sim to My Pick" / "Sim to End" so the
  // user jumps straight to their next decision instead of watching a paced animation.
  const simToPickInstant = useCallback((targetPick: number) => {
    setIsSimulating(false);
    setSimTarget(null);
    setHasStarted(true);

    const newPicks: Record<number, any> = { ...drafted };
    const usedIds = new Set(Object.values(newPicks).map((p: any) => p.internalId));
    const pool = allProspects.filter(p => !usedIds.has(p.internalId));
    let poolIdx = 0;

    let pickNum = currentPick;
    const freshPicks: Array<{ slot: number; player: any }> = [];
    while (pickNum < targetPick && poolIdx < pool.length) {
      const top = pool[poolIdx++];
      newPicks[pickNum] = top;
      freshPicks.push({ slot: pickNum, player: top });
      pickNum++;
    }

    setDrafted(newPicks);
    setCurrentPick(pickNum);

    // Batch-commit all new picks in one pass — no roster gate
    if (freshPicks.length > 0) {
      // Track retired + taken jersey numbers per team to avoid conflicts within the batch
      const batchRetiredByTeam = new Map<number, Set<string>>();
      const batchTakenByTeam = new Map<number, Set<string>>();
      for (const t of state.teams as any[]) {
        batchRetiredByTeam.set(t.id, new Set(
          (t.retiredJerseyNumbers ?? []).map((j: any) => String(j.number))
        ));
      }
      for (const p of state.players as any[]) {
        if (p.tid >= 0 && p.jerseyNumber) {
          if (!batchTakenByTeam.has(p.tid)) batchTakenByTeam.set(p.tid, new Set());
          batchTakenByTeam.get(p.tid)!.add(String(p.jerseyNumber));
        }
      }

      const updateMap = new Map<string, object>();
      for (const { slot, player } of freshPicks) {
        const update = buildDraftedPlayerUpdate(player, slot);
        if (!update) continue;
        const team = draftOrder[slot - 1];
        const retired = batchRetiredByTeam.get(team?.id) ?? new Set<string>();
        const taken   = batchTakenByTeam.get(team?.id)   ?? new Set<string>();
        const excluded = new Set([...retired, ...taken]);
        const existing = player.jerseyNumber ? String(player.jerseyNumber) : '';
        const jerseyNumber = (!existing || retired.has(existing))
          ? pickJerseyNumber(excluded)
          : existing;
        if (team?.id != null) {
          if (!batchTakenByTeam.has(team.id)) batchTakenByTeam.set(team.id, new Set());
          batchTakenByTeam.get(team.id)!.add(jerseyNumber);
        }
        updateMap.set(player.internalId, { ...update, jerseyNumber });
      }
      const updatedPlayers = state.players.map((p: any) =>
        updateMap.has(p.internalId) ? { ...p, ...updateMap.get(p.internalId) } : p
      );
      // Strip every consumed pick in this batch from inventory.
      const draftSeason: number = state.leagueStats?.year ?? leagueYear;
      const consumedKeys = new Set(
        freshPicks.map(({ slot }) => {
          const t = draftOrder[slot - 1];
          const round = slot <= 30 ? 1 : 2;
          const originalTid = (t as any)?._originalTid ?? t?.id;
          return `${draftSeason}|${round}|${originalTid}`;
        })
      );
      const draftPicksAfter = (state.draftPicks ?? []).filter(
        (dp: any) => !consumedKeys.has(`${dp.season}|${dp.round}|${dp.originalTid}`)
      );
      const allPicksDone = targetPick > draftOrder.length;
      dispatch({
        type: 'UPDATE_STATE',
        payload: {
          players: normalizeTeamJerseyNumbers(updatedPlayers as any, state.teams as any, leagueYear, {
            history: state.history,
            targetTeamIds: freshPicks.map(p => draftOrder[p.slot - 1]?.id).filter((id): id is number => id != null),
          }),
          draftPicks: draftPicksAfter,
          // Persist in-progress picks atomically with the player updates so
          // autoRunDraft (fires on day-advance past draft date) can honor them.
          activeDraftPicks: newPicks,
          activeDraftOrder: draftOrder,
          // Set eagerly so stateRef.current.draftComplete is true before any
          // ADVANCE_DAY fires — prevents autoRunDraft re-running when the user
          // clicks Sim Day immediately after Sim to End.
          ...(allPicksDone ? { draftComplete: true } : {}),
        },
      } as any);
    }
  }, [drafted, allProspects, currentPick, state.players, state.teams, state.draftPicks, state.leagueStats?.year, buildDraftedPlayerUpdate, dispatch, draftOrder, leagueYear]);

  // Auto-sim loop
  useEffect(() => {
    if (!isSimulating || isDraftComplete || scoutingPlayer) return;
    // Stop auto-sim when we reach the configured target pick (Sim to Next Pick
    // / Sim to End). Using >= so we stop BEFORE making the user's pick for them.
    if (simTarget != null && currentPick >= simTarget) {
      setIsSimulating(false);
      setSimTarget(null);
      return;
    }
    const speedMs: Record<string, number> = { fastest: 200, normal: 800, slow: 1500, slower: 3000, dramatic: 5000 };
    const timer = setTimeout(() => {
      const top = available[0];
      if (top) draftPlayer(top);
    }, speedMs[simSpeed] ?? 800);
    return () => clearTimeout(timer);
  }, [isSimulating, currentPick, available, simSpeed, isDraftComplete, scoutingPlayer, draftPlayer, simTarget]);

  const onConfirmPickForScouting = useCallback(() => {
    if (!scoutingPlayer) return;
    const pick = currentPick;
    setHasStarted(true);
    setDrafted(prev => ({ ...prev, [pick]: scoutingPlayer }));
    commitPickToState(pick, scoutingPlayer);
    setCurrentPick(pick + 1);
    setScoutingPlayer(null);
  }, [scoutingPlayer, currentPick, commitPickToState]);

  // Auto-commit picks to game state when draft completes — no manual button needed
  const [draftFinalized, setDraftFinalized] = useState(false);
  useEffect(() => {
    if (isDraftComplete && hasStarted && !draftFinalized) {
      finalizeDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraftComplete, hasStarted, draftFinalized]);

  useEffect(() => {
    if (isDraftDone && onViewChange) {
      onViewChange('Draft History');
    }
  }, [isDraftDone, onViewChange]);

  const finalizeDraft = () => {
    const ls = state.leagueStats ?? {};
    const season: number = getLsYear({ leagueStats: ls } as any);

    const updatedPlayers = state.players.map(p => {
      const pickEntry = Object.entries(drafted).find(([, pl]: [string, any]) => pl.internalId === p.internalId);
      if (!pickEntry) return p;
      const pickSlot = parseInt(pickEntry[0]);
      const fields = computeDraftPickFields(pickSlot, draftOrder[pickSlot - 1], ls);
      return fields ? { ...p, ...fields } : p;
    });

    // Undrafted current-year prospects → free agents (future classes stay as prospects)
    const draftedIds = new Set(Object.values(drafted).map((pl: any) => pl.internalId));
    const finalPlayers = updatedPlayers.map(p => {
      const draftYear = (p as any).draft?.year;
      const isCurrentClass = !draftYear || Number(draftYear) === season;
      if (isCurrentClass && (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') && !draftedIds.has(p.internalId)) {
        return { ...p, tid: -1, status: 'Free Agent' as const };
      }
      return p;
    });

    // The picks for this season have been consumed — drop them from the global
    // draftPicks inventory so Trade Machine / Trade Finder / Team Office /
    // AI trade engine all stop showing them. Rollover's future-pick generator
    // will produce the new rolling window (currentYear+1 … +windowSize) on Jun 30.
    const draftPicksAfter = (state.draftPicks ?? []).filter(p => p.season !== season);

    dispatch({
      type: 'UPDATE_STATE',
      payload: {
        players: finalPlayers,
        draftPicks: draftPicksAfter,
        draftComplete: true,
        activeDraftPicks: undefined, // clear in-progress picks — draft is done
        activeDraftOrder: undefined,
      },
    } as any);
    setDraftFinalized(true);
  };

  if (viewingBioPlayer) {
    return (
      <PlayerBioView
        player={viewingBioPlayer}
        onBack={() => setViewingBioPlayer(null)}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">

      {/* DraftSimulatorView is now only rendered on draft day when draft is not complete
          (MainContent routes to DraftHistoryView for all other cases) */}

      {/* INTERACTIVE DRAFT BOARD — only shown on/after draft day and draft not yet committed */}
      {isDraftTime && !isDraftDone && (
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">

        {/* LEFT COLUMN */}
        <div className="space-y-5">

          {/* ON THE CLOCK */}
          <div className="bg-[#1A1A1A] rounded-sm p-5 border border-[#333]">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-white/60" />
              <span className="text-sm font-black uppercase tracking-widest text-white">On The Clock</span>
            </div>

            {isDraftComplete && hasStarted ? (
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                <p className="text-emerald-300 font-black text-sm uppercase tracking-tight">Draft Complete</p>
              </div>
            ) : !isDraftComplete && teamOnClock ? (
              <div className={`flex items-center gap-4 ${isUserOnClock ? 'bg-amber-500/10 border border-amber-500/30 rounded-md p-3 -m-1' : ''}`}>
                {teamOnClock.logoUrl ? (
                  <img src={teamOnClock.logoUrl} alt={teamOnClock.name} className="w-14 h-14 object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-indigo-900/40 flex items-center justify-center font-black text-indigo-300">{teamOnClock.abbrev}</div>
                )}
                <div className="flex-1">
                  {isUserOnClock && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-300">You're on the Clock</span>
                    </div>
                  )}
                  <p className="text-white/70 text-sm leading-relaxed">
                    With the <strong className="text-white">{currentPick}{getOrdinalSuffix(currentPick)}</strong> pick in the {state.leagueStats?.year ?? ''} NBA draft,
                    the <strong className="text-white">{teamOnClock.name}</strong> select…
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-white/60 font-bold uppercase text-sm tracking-widest">Draft Complete</p>
            )}

            {/* Controls */}
            <div className="flex justify-end mt-4 gap-3 items-center flex-wrap">
              {/* GM-mode fast-forward: skip to my next pick, or finish the draft
                  if I have no picks left. Hidden in commissioner mode — the
                  commissioner drafts for every team so the per-pick buttons
                  are enough. */}
              {isGM && !isDraftComplete && !isUserOnClock && userHasMorePicks && (
                <button
                  onClick={() => simToPickInstant(nextUserPick)}
                  className="h-8 px-3 text-xs font-black uppercase rounded-sm bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors"
                >
                  <FastForward size={11} /> Sim to My Pick ({nextUserPick})
                </button>
              )}
              {isGM && !isDraftComplete && !isUserOnClock && (
                <button
                  onClick={() => simToPickInstant(draftOrder.length + 1)}
                  className="h-8 px-3 text-xs font-black uppercase rounded-sm bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors"
                >
                  <FastForward size={11} /> {userHasMorePicks ? 'Assistant GM: Sim to End' : 'Sim to End'}
                </button>
              )}
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-md border border-[#333]">
                <button
                  onClick={() => {
                    if (isSimulating) {
                      setIsSimulating(false);
                      setSimTarget(null);
                    } else {
                      // In GM mode, cap Auto Sim at the user's next pick so
                      // clicking it from another team's slot can't race past
                      // the user's turn and pick for them. Commissioner mode
                      // keeps the open-ended behavior since they draft for
                      // every team anyway.
                      if (isGM && userHasMorePicks) {
                        setSimTarget(nextUserPick);
                      } else {
                        setSimTarget(null);
                      }
                      setIsSimulating(true);
                      setHasStarted(true);
                    }
                  }}
                  disabled={isDraftComplete || (isGM && isUserOnClock)}
                  title={isGM && isUserOnClock ? "You're on the clock — pick a player below" : undefined}
                  className={`h-8 px-3 text-xs font-black uppercase rounded-sm transition-all flex items-center gap-1.5 ${
                    isSimulating ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/50 hover:text-white disabled:text-white/20 disabled:cursor-not-allowed'
                  }`}
                >
                  {isSimulating ? <><Pause size={11} className="fill-current" /> Pause</> : <><Play size={11} className="fill-current" /> Auto Sim</>}
                </button>
                <div className="h-4 w-px bg-zinc-700 mx-1" />
                <select
                  value={simSpeed}
                  onChange={e => setSimSpeed(e.target.value)}
                  className="bg-transparent text-[10px] font-black uppercase text-white/50 border-none outline-none cursor-pointer"
                >
                  {['fastest', 'normal', 'slow', 'slower', 'dramatic'].map(s => (
                    <option key={s} value={s} className="bg-zinc-900">{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* AVAILABLE PLAYERS */}
          <div className="bg-[#1A1A1A] rounded-sm border border-[#333] overflow-hidden">
            <div className="p-3 border-b border-[#333] flex items-center justify-between gap-3 flex-wrap">
              <span className="font-black text-white text-sm">Available Players</span>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex bg-black/40 rounded-md p-0.5 border border-[#333]">
                  {POSITIONS.map(pos => (
                    <button
                      key={pos}
                      onClick={() => setPosFilter(pos)}
                      className={`px-2.5 py-1 text-[10px] font-black rounded-sm transition-colors ${
                        posFilter === pos ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
                {/* Sort toggle — OVR/POT toggle + skill picker drive the rank ordering */}
                <div className="flex bg-black/40 rounded-md p-0.5 border border-[#333]">
                  {(['ovr', 'pot'] as const).map(key => (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      className={`px-2.5 py-1 text-[10px] font-black rounded-sm transition-colors ${
                        sortBy === key ? 'bg-emerald-600 text-white' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {key.toUpperCase()}
                    </button>
                  ))}
                </div>
                {/* Skill sort — selecting a skill re-sorts by that skill score */}
                <select
                  value={SKILL_AXES.includes(sortBy as SkillAxis) ? sortBy : ''}
                  onChange={e => {
                    if (e.target.value) setSortBy(e.target.value as SkillAxis);
                  }}
                  className={`bg-black/40 border border-[#333] text-[10px] font-black uppercase tracking-wider rounded-md px-2 py-1.5 cursor-pointer focus:outline-none focus:border-emerald-500 ${
                    SKILL_AXES.includes(sortBy as SkillAxis) ? 'text-emerald-400 border-emerald-700' : 'text-white/40'
                  }`}
                >
                  <option value="">Sort by skill…</option>
                  {SKILL_AXES.map(skill => (
                    <option key={skill} value={skill}>{skill}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              {available.length === 0 ? (
                <p className="text-center text-zinc-600 font-bold text-xs uppercase py-8">No players available</p>
              ) : (
                available.map((player) => (
                  <div
                    key={player.internalId}
                    onClick={() => setScoutingPlayer(player)}
                    className="flex items-center p-2.5 border-b border-[#333] hover:bg-white/5 transition-colors cursor-pointer group"
                  >
                    {/* Rank — whole-class rank from the sorted pool, not the filtered index */}
                    <div className="w-10 h-10 bg-black/40 rounded-sm font-black text-lg text-white/40 mr-3 shrink-0 flex items-center justify-center">
                      {String(rankById.get(player.internalId) ?? 0).padStart(2, '0')}
                    </div>

                    {/* Photo */}
                    <div className="w-10 h-10 rounded-full bg-black/40 mr-3 shrink-0 border border-zinc-800 overflow-hidden">
                      {(() => {
                        const img = getPlayerImage(player as any);
                        const face = (player as any).face;
                        if (img) return <img src={img} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />;
                        if (isRealFaceConfig(face)) return <div className="relative w-full h-full"><div className="absolute left-1/2 top-1/2" style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}><MyFace face={face} style={{ width: '100%', height: '100%' }} /></div></div>;
                        return <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-zinc-500">{player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>;
                      })()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white text-base leading-tight truncate">{player.name}</p>
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 flex-wrap">
                        <span>{player.pos}</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span>{(player as any).born?.year ? leagueYear - (player as any).born.year : ((player as any).age ?? '?')}y</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span className="text-indigo-300">OVR {player.displayOvr}</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span className="text-emerald-400/70">POT {player.displayPot}</span>
                        {(player as any).college && (
                          <>
                            <span className="w-1 h-1 bg-white/20 rounded-full" />
                            <span className="text-white/50">{(player as any).college}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Draft button — hidden in GM mode when it's not our pick
                        so the user can't spike another team's slot with a bad
                        prospect. Commissioner mode drafts for every team so
                        the button stays available. */}
                    {(!isGM || isUserOnClock) && (
                      <button
                        onClick={e => { e.stopPropagation(); setScoutingPlayer(player); }}
                        disabled={isDraftComplete}
                        className="ml-3 bg-indigo-800 hover:bg-indigo-600 text-white font-black text-[10px] h-6 px-4 rounded-sm transition-colors uppercase disabled:opacity-30"
                      >
                        Draft
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">

          {/* NEXT UP */}
          {nextTeam && !isDraftComplete && (
            <div className="bg-[#1A1A1A] rounded-sm p-3 border border-[#333] flex justify-between items-center">
              <div>
                <div className="text-[9px] font-black uppercase text-white/40">Next Up — Pick {currentPick + 1}</div>
                <div className="font-black text-white text-sm">{nextTeam.name}</div>
              </div>
              {nextTeam.logoUrl && (
                <img src={nextTeam.logoUrl} alt={nextTeam.name} className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
              )}
            </div>
          )}

          {/* TEAM NEEDS — GM mode only, so the user can scan their positional/category gaps
              while picking. Uses a compact sidebar-sized readout; the full 2-column TeamOffice
              view doesn't fit in a 320px aside. */}
          {isGM && userTeamId != null && (
            <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
              <div className="text-[9px] font-black uppercase text-amber-300 tracking-widest mb-3">Your Team Needs</div>
              <CompactTeamNeedsPanel teamId={userTeamId} players={state.players} />
            </div>
          )}

          {/* ADVISOR'S BIG BOARD — GM mode only. Mode-weighted 70/30 value+fit score,
              drafted prospects stay listed with a strikethrough so the user can see
              what's already off the board without the list reshuffling. */}
          {isGM && userTeamId != null && (
            <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
              <div className="text-[9px] font-black uppercase text-amber-300 tracking-widest mb-3">Advisor's Big Board</div>
              <CompactAdvisorBoardPanel teamId={userTeamId} draftedIds={draftedSet} />
            </div>
          )}

          {/* TOP PROSPECTS — drafted players are removed so the list always reflects who's still on the board */}
          <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
            <div className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-3">Top Prospects by OVR</div>
            {allProspects.filter(p => !draftedSet.has(p.internalId)).slice(0, 10).map((p, i) => (
              <div key={p.internalId} className="flex items-center gap-2 py-1">
                <span className="text-[10px] font-black text-white/30 w-5">{i + 1}</span>
                <span className="text-xs font-bold text-white truncate flex-1">{p.name}</span>
                <span className="text-[10px] font-black text-indigo-300">{p.displayOvr}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )} {/* end isDraftTime && !isDraftDone */}

      {/* PRE-DRAFT: Top prospects scouting panel (always visible when draft not yet done) */}
      {!isDraftTime && !isDraftDone && allProspects.length > 0 && (
        <div className="bg-[#1A1A1A] rounded-sm border border-[#333] overflow-hidden">
          <div className="p-3 border-b border-[#333]">
            <span className="font-black text-white text-sm">Top Prospects by OVR — {leagueYear} Draft Class</span>
            <p className="text-[10px] text-white/30 font-medium mt-0.5">Available for drafting on {getDraftDate(leagueYear, state.leagueStats).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}. Ratings may improve before draft day.</p>
          </div>
          <div>
            {allProspects.map((player, i) => (
              <div
                key={player.internalId}
                onClick={() => setViewingBioPlayer(player as NBAPlayer)}
                className="flex items-center p-2.5 border-b border-[#333] hover:bg-white/5 transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 bg-black/40 rounded-sm font-black text-base text-white/30 mr-3 shrink-0 flex items-center justify-center">{i + 1}</div>
                <div className="w-9 h-9 rounded-full bg-black/40 mr-3 shrink-0 border border-zinc-800 overflow-hidden">
                  {(() => {
                    const img = getPlayerImage(player as any);
                    const face = (player as any).face;
                    if (img) return <img src={img} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />;
                    if (isRealFaceConfig(face)) return <div className="relative w-full h-full"><div className="absolute left-1/2 top-1/2" style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}><MyFace face={face} style={{ width: '100%', height: '100%' }} /></div></div>;
                    return <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-zinc-500">{player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white text-sm leading-tight truncate">{player.name}</p>
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 flex-wrap">
                    <span>{player.pos}</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span>{(player as any).born?.year ? leagueYear - (player as any).born.year : ((player as any).age ?? '?')}y</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span className="text-indigo-300">OVR {player.displayOvr}</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span className="text-emerald-400/70">POT {player.displayPot}</span>
                    {(player as any).college && <><span className="w-1 h-1 bg-white/20 rounded-full" /><span className="text-white/50">{(player as any).college}</span></>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FULL DRAFT TABLE — all 60 slots render as empty placeholders from the start, like a real draft board */}
      {isDraftTime && !isDraftDone && draftOrder.length > 0 && (
        <FullDraftTable
          drafted={drafted}
          draftOrder={draftOrder}
          onReview={(player) => setScoutingPlayer(player)}
          currentPick={currentPick}
          userTeamId={userTeamId ?? null}
          isGM={isGM}
        />
      )}

      {/* SCOUTING MODAL — opened from row clicks and Draft button; shows Confirm Pick footer when user is on clock */}
      <DraftScoutingModal
        player={scoutingPlayer}
        onClose={() => setScoutingPlayer(null)}
        classProspects={allProspects as unknown as NBAPlayer[]}
        activePlayers={activePlayers}
        percentilesByPos={percentilesByPos}
        classAverages={classAverages}
        draftYear={leagueYear}
        gistData={scoutingPlayer && gistByYear ? matchProspectToGist(scoutingPlayer, gistByYear) : null}
        onViewPlayerBio={(p) => { setScoutingPlayer(null); setViewingBioPlayer(p); }}
        onConfirmPick={(!isGM || isUserOnClock) && !isDraftComplete && !Object.values(drafted).some((p: any) => p?.internalId === scoutingPlayer?.internalId) ? onConfirmPickForScouting : undefined}
        pickLabel={`Pick #${currentPick}`}
        preComputedComps={scoutingPlayer ? batchComps.get((scoutingPlayer as NBAPlayer).internalId) : undefined}
      />
    </div>
  );
};
