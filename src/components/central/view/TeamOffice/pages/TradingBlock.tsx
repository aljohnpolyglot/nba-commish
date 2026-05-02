import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { PlayerSelectorGrid, type PlayerSelectorItem } from '../../../../shared/PlayerSelectorGrid';
import { calcOvr2K, calcPot2K, calcPlayerTV, computeLeagueAvg, getPotColor, isYoungContenderCore, type TeamMode } from '../../../../../services/trade/tradeValueEngine';
import { generateInboundProposalsForUser } from '../../../../../services/trade/inboundProposalGenerator';
import { getMinTradableSeason, getTradablePicks, getMaxTradableSeason } from '../../../../../services/draft/DraftPickGenerator';
import { buildClassStrengthMap, buildFullDraftSlotMap, formatPickLabel } from '../../../../../services/draft/draftClassStrength';
import { teamPowerRanks } from '../../../../../services/trade/tradeFinderEngine';
import { getTradeOutlook, effectiveRecord, getCapThresholds, getTeamPayrollUSD, topNAvgK2, resolveManualOutlook } from '../../../../../utils/salaryUtils';
import { getTradingBlock, saveTradingBlock } from '../../../../../store/tradingBlockStore';
import { getFamilyOnRoster } from '../../../../../utils/familyTies';
import { getCurrentTeamRegularSeasonYears } from '../../../../../utils/playerTenure';
import { compareGameDates, getDraftDate, getTradeDeadlineDate, isInPostDeadlinePreFAWindow, toISODateString } from '../../../../../utils/dateUtils';
import { NBAPlayer, NBATeam } from '../../../../../types';
import { PlayerBioView } from '../../PlayerBioView';

interface TradingBlockProps {
  teamId: number;
}

const EXTERNAL = ['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'];

function ovrText(v: number): string {
  if (v >= 95) return 'text-violet-300';
  if (v >= 90) return 'text-blue-300';
  if (v >= 85) return 'text-emerald-300';
  if (v >= 78) return 'text-amber-300';
  if (v >= 72) return 'text-slate-300';
  return 'text-red-400';
}

export function TradingBlock({ teamId }: TradingBlockProps) {
  const { state, dispatchAction } = useGame();
  const { players, teams, draftPicks } = state;
  const currentYear = state.leagueStats?.year ?? 2026;
  const lotterySlotByTid = useMemo(
    () => buildFullDraftSlotMap((state as any).draftLotteryResult, state.teams),
    [(state as any).draftLotteryResult, state.teams],
  );
  const allActive = players.filter(p => p.tid >= 0 && !EXTERNAL.includes(p.status ?? '') && p.status !== 'Draft Prospect');
  const teamPlayers = allActive.filter(p => p.tid === teamId);
  const team = teams.find(t => t.id === teamId);
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

  // Determine team mode using real trade outlook
  const teamMode: TeamMode = useMemo(() => {
    if (!team) return 'rebuild';
    const manual = resolveManualOutlook(team, state.gameMode, state.userTeamId);
    if (manual) {
      if (manual.role === 'heavy_buyer' || manual.role === 'buyer') return 'contend';
      if (manual.role === 'rebuilding') return 'presti';
      return 'rebuild';
    }
    const payroll = getTeamPayrollUSD(players, teamId, team, currentYear);
    const rec = effectiveRecord(team, currentYear);
    const confTeams = teams.filter(t => t.conference === team.conference).map(t => ({
      t, rec: effectiveRecord(t, currentYear),
    })).sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
    const leader = confTeams[0];
    const lw = leader?.rec.wins ?? 0;
    const ll = leader?.rec.losses ?? 0;
    const idx = confTeams.findIndex(c => c.t.id === teamId);
    const confRank = idx >= 0 ? idx + 1 : 15;
    const gb = Math.max(0, ((lw - rec.wins) + (rec.losses - ll)) / 2);
    const expiring = players.filter(p => p.tid === teamId && (p.contract?.exp ?? 0) <= currentYear).length;
    const starAvg = topNAvgK2(players, teamId, 3);
    const outlook = getTradeOutlook(payroll, rec.wins, rec.losses, expiring, thresholds, confRank, gb, starAvg);
    if (outlook.role === 'heavy_buyer' || outlook.role === 'buyer') return 'contend';
    if (outlook.role === 'rebuilding') return 'presti';
    return 'rebuild';
  }, [team, players, teams, teamId, currentYear, thresholds, state.gameMode, state.userTeamId]);

  if (teamPlayers.length === 0) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  const rosterWithTV = teamPlayers.map(p => ({
    player: p,
    tv: calcPlayerTV(p, teamMode, currentYear),
    ovr: calcOvr2K(p),
    pot: calcPot2K(p, currentYear),
  }));

  // ── Editable lists with state ─────────────────────────────────────────────
  // Commissioner can edit any team. GM can only edit their own. Other teams are read-only.
  const isGM = state.gameMode === 'gm';
  const isOwnTeam = isGM && teamId === (state as any).userTeamId;
  const canEdit = !isGM || isOwnTeam;
  const MAX_SLOTS = 10;

  // ── Smart defaults based on team mode ────────────────────────────────────
  const playerAge = (p: NBAPlayer): number => p.born?.year ? currentYear - p.born.year : (p.age ?? 27);

  const defaultUntouchableIds = useMemo(() => {
    const rosterPlayers = rosterWithTV.map(r => r.player);
    const candidates = rosterWithTV.filter(r => {
      const age = playerAge(r.player);
      const ywt = getCurrentTeamRegularSeasonYears(r.player);

      // Loyalty: 10+ years with team = always untouchable (Curry rule)
      if (ywt >= 10) return true;

      // Young-core rule: contenders with avg age <27 protect any POT 90+ prospect
      // (OKC-style teams winning now whose young talent still has runway).
      if (isYoungContenderCore(r.player, rosterPlayers, teamMode, currentYear)) return true;

      if (teamMode === 'contend') {
        // Contending: K2 82+ are core rotation pieces
        return r.ovr >= 82;
      } else if (teamMode === 'presti' || teamMode === 'rebuild') {
        // Rebuilding: young (< 25) + high potential (POT 85+)
        return age < 25 && r.pot >= 85;
      } else {
        // Neutral: stars (K2 85+) or young high-potential
        return r.ovr >= 85 || (age < 24 && r.pot >= 88);
      }
    });
    const coreIds = new Set(candidates.slice(0, MAX_SLOTS).map(r => r.player.internalId));
    // Family-ties protection: if a star is untouchable, so are their siblings on this roster
    // (Thanasis/Alex Antetokounmpo shouldn't appear as trade fodder while Giannis is protected).
    for (const r of rosterWithTV) {
      if (coreIds.has(r.player.internalId)) {
        for (const rel of getFamilyOnRoster(r.player, rosterPlayers)) {
          coreIds.add(rel.internalId);
        }
      }
    }
    return coreIds;
  }, [rosterWithTV, teamMode, currentYear]);

  const defaultBlockIds = useMemo(() => {
    const utIds = defaultUntouchableIds;
    const candidates = rosterWithTV
      .filter(r => !utIds.has(r.player.internalId))
      .filter(r => {
        const age = playerAge(r.player);

        if (teamMode === 'contend') {
          // Contending: dump low-OVR or expiring non-contributors
          return r.ovr < 78 || (r.player.contract?.exp ?? currentYear + 5) <= currentYear + 1;
        } else if (teamMode === 'presti' || teamMode === 'rebuild') {
          // Rebuilding: dump expensive vets (age 28+, K2 75+)
          return age >= 28 && r.ovr >= 75;
        } else {
          // Neutral: overpaid or aging
          return (r.player.contract?.amount ?? 0) > 15000 && r.ovr < 82;
        }
      })
      .sort((a, b) => a.tv - b.tv);
    return new Set(candidates.slice(0, MAX_SLOTS).map(r => r.player.internalId));
  }, [rosterWithTV, defaultUntouchableIds, teamMode, currentYear]);

  // Hydrate from store on first render: if the team has saved selections, use those
  // (filtered to ids that still point at valid players/picks on this team). Otherwise
  // fall back to the smart defaults. A traded-away player's id silently drops off.
  const initialHydrate = useMemo(() => {
    const saved = getTradingBlock(teamId);
    if (!saved) return null;
    const onTeamIds = new Set(teamPlayers.map(p => p.internalId));
    const otherIds = new Set(allActive.filter(p => p.tid !== teamId).map(p => p.internalId));
    const validPickIds = new Set((draftPicks ?? []).filter(p => p.tid === teamId).map(p => p.dpid));
    return {
      untouchable: new Set(saved.untouchableIds.filter(id => onTeamIds.has(id))),
      block: new Set(saved.blockIds.filter(id => onTeamIds.has(id))),
      target: new Set(saved.targetIds.filter(id => otherIds.has(id))),
      picks: new Set(saved.blockPickIds.filter(id => validPickIds.has(id))),
    };
    // Run once per team/save — roster diffs after a trade are reconciled by the
    // sync effect below, not by re-hydrating from localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const [untouchableIds, setUntouchableIds] = useState<Set<string>>(
    () => initialHydrate?.untouchable ?? defaultUntouchableIds,
  );
  const [blockIds, setBlockIds] = useState<Set<string>>(
    () => initialHydrate?.block ?? defaultBlockIds,
  );
  const [targetIds, setTargetIds] = useState<Set<string>>(
    () => initialHydrate?.target ?? new Set(),
  );
  // Pick IDs (dpid) that contending teams are willing to trade — hydrated from their draftPicks inventory.
  const [blockPickIds, setBlockPickIds] = useState<Set<number>>(
    () => initialHydrate?.picks ?? new Set(),
  );

  // Reconcile selections against the current roster whenever players or picks
  // change — after a trade, traded-away players silently fall off each list
  // (and targeted players acquired by the user move into Untouchables territory
  //  for the next session — but we just drop them from Targets here).
  const lastSyncKey = useRef('');
  useEffect(() => {
    const rosterKey = teamPlayers.map(p => p.internalId).sort().join('|');
    const pickKey = (draftPicks ?? []).filter(p => p.tid === teamId).map(p => p.dpid).sort().join('|');
    const key = `${rosterKey}::${pickKey}`;
    if (key === lastSyncKey.current) return;
    lastSyncKey.current = key;

    const onTeamIds = new Set(teamPlayers.map(p => p.internalId));
    const otherIds = new Set(allActive.filter(p => p.tid !== teamId).map(p => p.internalId));
    const validPickIds = new Set((draftPicks ?? []).filter(p => p.tid === teamId).map(p => p.dpid));

    setUntouchableIds(prev => {
      const next = new Set<string>();
      for (const id of prev) if (onTeamIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
    setBlockIds(prev => {
      const next = new Set<string>();
      for (const id of prev) if (onTeamIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
    setTargetIds(prev => {
      const next = new Set<string>();
      for (const id of prev) if (otherIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
    setBlockPickIds(prev => {
      const next = new Set<number>();
      for (const id of prev) if (validPickIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [teamId, teamPlayers, allActive, draftPicks]);

  // Autosave to tradingBlockStore on every selection change.
  useEffect(() => {
    if (!canEdit) return;
    saveTradingBlock(teamId, {
      untouchableIds: Array.from(untouchableIds),
      blockIds: Array.from(blockIds),
      targetIds: Array.from(targetIds),
      blockPickIds: Array.from(blockPickIds),
    });
  }, [teamId, canEdit, untouchableIds, blockIds, targetIds, blockPickIds]);

  const [editingColumn, setEditingColumn] = useState<'untouchable' | 'block' | 'targets' | null>(null);
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);

  const untouchablesList = rosterWithTV.filter(r => untouchableIds.has(r.player.internalId));
  const tradingBlockList = rosterWithTV.filter(r => blockIds.has(r.player.internalId));

  // Target List: user-selected from other teams, or AI-suggested
  const otherPlayers = allActive.filter(p => p.tid !== teamId);
  const otherWithTV = useMemo(() => otherPlayers.map(p => ({
    player: p,
    tv: calcPlayerTV(p, teamMode, currentYear),
    ovr: calcOvr2K(p),
    pot: calcPot2K(p, currentYear),
  })), [otherPlayers, teamMode, currentYear]);

  // ── Team needs: which positions are thin? Targets skew toward filling gaps ────
  // A balanced roster is roughly 3 per position (15 players / 5 slots). Below 2 = critical need.
  const posNeeds = useMemo(() => {
    const normalizePos = (pos: string | undefined) => {
      const p = (pos ?? '').toUpperCase();
      if (p.includes('PG') || p === 'G') return 'PG';
      if (p.includes('SG')) return 'SG';
      if (p.includes('SF')) return 'SF';
      if (p.includes('PF') || p === 'F') return 'PF';
      if (p.includes('C')) return 'C';
      return 'SF';
    };
    const counts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    teamPlayers.forEach(p => { counts[normalizePos(p.pos)]++; });
    // Weight: critical (≤1) = 2x, thin (≤2) = 1.3x, balanced (3+) = 1x.
    const weight: Record<string, number> = {} as any;
    for (const k of Object.keys(counts)) {
      weight[k] = counts[k] <= 1 ? 2.0 : counts[k] <= 2 ? 1.3 : 1.0;
    }
    return { counts, weight, normalizePos };
  }, [teamPlayers]);

  // Smart target defaults:
  //   Contending → tiered wishlist (3 stars OVR≥90, 3 high 85-89, 2 good 80-84, 2 role 75-79)
  //                within each tier, prefer players at positions we need most.
  //   Rebuilding → youth (<24) ranked by potential − age, positional need as tiebreaker.
  const targetList = useMemo(() => {
    if (targetIds.size > 0) return otherWithTV.filter(r => targetIds.has(r.player.internalId));
    const needBonus = (r: TVItem) => posNeeds.weight[posNeeds.normalizePos(r.player.pos)] ?? 1;
    if (teamMode === 'contend') {
      // Win-now teams want peak-years guys. Young prospects are explicitly de-prioritized — they're
      // rebuilding assets, not playoff-rotation pieces. Hard-block teenagers, soft-penalize <24.
      const contendAgeFactor = (r: TVItem) => {
        const age = playerAge(r.player);
        if (age < 24) return 0.55; // developmental — not a win-now fit
        if (age < 26) return 0.85; // promising but not yet prime
        if (age < 32) return 1.10; // prime
        return 0.95;               // aging but productive
      };
      const pick = (lo: number, hi: number, n: number) =>
        [...otherWithTV]
          .filter(r => r.ovr >= lo && (hi === Infinity || r.ovr < hi))
          .filter(r => playerAge(r.player) >= 22) // no teenagers on a contender wishlist
          .sort((a, b) => (b.tv * needBonus(b) * contendAgeFactor(b)) - (a.tv * needBonus(a) * contendAgeFactor(a)))
          .slice(0, n);
      return [
        ...pick(90, Infinity, 3),
        ...pick(85, 90, 3),
        ...pick(80, 85, 2),
        ...pick(75, 80, 2),
      ];
    }
    // Rebuild / presti — chase youth, positional need breaks ties.
    return [...otherWithTV]
      .filter(r => playerAge(r.player) < 24)
      .sort((a, b) => ((b.pot - playerAge(b.player)) * needBonus(b)) - ((a.pot - playerAge(a.player)) * needBonus(a)))
      .slice(0, MAX_SLOTS);
  }, [otherWithTV, targetIds, teamMode, posNeeds]);

  // Selector items
  const ownRosterItems: PlayerSelectorItem[] = useMemo(() =>
    rosterWithTV.map(r => ({ player: r.player, score: r.ovr, subtitle: `${r.ovr} · ${r.pot} · ${playerAge(r.player)}y` })),
  [rosterWithTV]);

  const leagueItems: PlayerSelectorItem[] = useMemo(() =>
    otherWithTV.map(r => ({ player: r.player, score: r.ovr, subtitle: `${r.ovr} · ${r.pot} · ${playerAge(r.player)}y` })),
  [otherWithTV]);

  const toggle = (list: 'untouchable' | 'block' | 'targets', id: string) => {
    if (!canEdit) return;
    const setter = list === 'untouchable' ? setUntouchableIds : list === 'block' ? setBlockIds : setTargetIds;
    setter(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else if (n.size < MAX_SLOTS) n.add(id);
      return n;
    });
  };

  // Remove a player from a list — used by the per-card trash button. Skips the MAX_SLOTS gate since
  // removal is always allowed even when the list is full.
  const removeFromList = (list: 'untouchable' | 'block' | 'targets', id: string) => {
    if (!canEdit) return;
    const setter = list === 'untouchable' ? setUntouchableIds : list === 'block' ? setBlockIds : setTargetIds;
    setter(prev => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  const removePick = (dpid: number) => {
    if (!canEdit) return;
    setBlockPickIds(prev => {
      const n = new Set(prev);
      n.delete(dpid);
      return n;
    });
  };

  // Contending teams can float future picks for win-now help.
  const teamPicks = useMemo(
    () => (draftPicks ?? []).filter(p => p.tid === teamId).sort((a, b) => a.season - b.season || a.round - b.round),
    [draftPicks, teamId],
  );
  const blockPicks = useMemo(
    () => teamPicks.filter(p => blockPickIds.has(p.dpid)),
    [teamPicks, blockPickIds],
  );
  const togglePick = (dpid: number) => {
    if (!canEdit) return;
    setBlockPickIds(prev => {
      const n = new Set(prev);
      if (n.has(dpid)) n.delete(dpid); else n.add(dpid);
      return n;
    });
  };

  // Build the trade-outlook map once for the inbound proposal generator.
  const buildOutlookMap = () => {
    const map = new Map<number, { role: string }>();
    const EAST = teams.filter(t => t.conference === 'East');
    const WEST = teams.filter(t => t.conference === 'West');
    const rankedInConf = (confTeams: typeof teams) => {
      return [...confTeams]
        .map(t => ({ t, rec: effectiveRecord(t, currentYear) }))
        .sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
    };
    const ranks = [...rankedInConf(EAST), ...rankedInConf(WEST)];
    for (const t of teams) {
      const confList = t.conference === 'East' ? rankedInConf(EAST) : rankedInConf(WEST);
      const leader = confList[0];
      const lw = leader?.rec.wins ?? 0, ll = leader?.rec.losses ?? 0;
      const idx = confList.findIndex(c => c.t.id === t.id);
      const confRank = idx >= 0 ? idx + 1 : 15;
      const rec = effectiveRecord(t, currentYear);
      const gb = Math.max(0, ((lw - rec.wins) + (rec.losses - ll)) / 2);
      const payroll = getTeamPayrollUSD(players, t.id, t, currentYear);
      const expiring = players.filter(p => p.tid === t.id && (p.contract?.exp ?? 0) <= currentYear).length;
      const starAvg = topNAvgK2(players, t.id, 3);
      const manual = resolveManualOutlook(t, state.gameMode, state.userTeamId);
      const outlook = manual ?? getTradeOutlook(payroll, rec.wins, rec.losses, expiring, thresholds, confRank, gb, starAvg);
      map.set(t.id, { role: outlook.role });
    }
    void ranks;
    return map;
  };

  // Auto-regenerate inbound proposals whenever the sim date advances (or the user's block changes).
  // Users no longer click "Generate" — proposals quietly refresh so Trade Proposals always shows live fits.
  // Gate on trade deadline: once past it, no new proposals generate (they freeze).
  React.useEffect(() => {
    if (!canEdit) return;
    if (blockIds.size === 0 && blockPickIds.size === 0) return;
    // Skip only while the deadline-closed window is active; post-draft trades reopen,
    // but expiring contracts still get filtered as walking until FA starts.
    const deadline = toISODateString(getTradeDeadlineDate(currentYear, state.leagueStats));
    const draftDate = toISODateString(getDraftDate(currentYear, state.leagueStats));
    if (state.date && compareGameDates(state.date, deadline) > 0 && compareGameDates(state.date, draftDate) < 0) return;
    const outlookMap = buildOutlookMap();
    const minTradableSeason = getMinTradableSeason(state);
    const classStrengthByYear = buildClassStrengthMap(players, currentYear, currentYear, getMaxTradableSeason(state));
    const lotterySlotByTid = buildFullDraftSlotMap((state as any).draftLotteryResult, state.teams);
    const powerRanks = teamPowerRanks(teams, currentYear);
    const proposals = generateInboundProposalsForUser({
      userTid: teamId,
      userGMName: `${team?.name ?? 'Team'} GM`,
      blockPlayerIds: Array.from(blockIds),
      blockPickIds: Array.from(blockPickIds),
      players,
      teams,
      draftPicks: getTradablePicks(state),
      currentYear,
      minTradableSeason,
      teamOutlooks: outlookMap,
      proposedDate: state.date ?? '',
      classStrengthByYear,
      lotterySlotByTid,
      powerRanks,
      isPostDeadlinePreFA: isInPostDeadlinePreFAWindow(state.date ?? '', currentYear, state.leagueStats as any),
      recentlySignedLockMs: {
        currentDate: state.date ?? '',
        leagueStats: state.leagueStats as any,
      },
    });
    // Replace this team's inbound-pending slot; leave other teams / resolved proposals alone.
    const existing = (state.tradeProposals ?? []).filter(p => p.receivingTeamId !== teamId || p.status !== 'pending');
    dispatchAction({ type: 'UPDATE_STATE', payload: { tradeProposals: [...existing, ...proposals] } } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.date, blockIds, blockPickIds, teamId, canEdit]);

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  return (
    <div className="h-full flex flex-col">
      {!canEdit && (
        <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2 inline-block self-start">
          Read-only — GM mode only edits your own team
        </p>
      )}
      {canEdit && (blockIds.size > 0 || blockPickIds.size > 0) && (
        <p className="mb-4 text-[10px] text-slate-500 italic">
          Inbound offers auto-refresh in Trade Proposals whenever the day advances.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-1">
        <EditableColumn title="Target List" items={targetList} teams={teams}
          onAdd={canEdit ? () => setEditingColumn('targets') : undefined}
          accentColor="#818cf8" onPlayerClick={setViewingPlayer}
          onRemovePlayer={canEdit && targetIds.size > 0 ? (id) => removeFromList('targets', id) : undefined} />
        <EditableColumn
          title="Trading Block" items={tradingBlockList} teams={teams}
          onAdd={canEdit ? () => setEditingColumn('block') : undefined}
          accentColor="#f87171" onPlayerClick={setViewingPlayer}
          onRemovePlayer={canEdit ? (id) => removeFromList('block', id) : undefined}
          onRemovePick={canEdit ? removePick : undefined}
          picks={teamMode === 'contend' ? blockPicks : undefined}
          canEditPicks={canEdit && teamMode === 'contend'}
          onTogglePick={togglePick}
          allTeamPicks={teamPicks}
          onOpenPickEditor={canEdit && teamMode === 'contend' ? () => setEditingColumn('block') : undefined}
          currentYear={currentYear} allTeams={teams} blockPickIds={blockPickIds}
          lotterySlotByTid={lotterySlotByTid}
        />
        <EditableColumn title="Untouchables" items={untouchablesList} teams={teams}
          onAdd={canEdit ? () => setEditingColumn('untouchable') : undefined}
          accentColor="#34d399" onPlayerClick={setViewingPlayer}
          onRemovePlayer={canEdit ? (id) => removeFromList('untouchable', id) : undefined} />
      </div>

      {/* ── Player Selector Modal ──────────────────────────────────── */}
      {editingColumn && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85vh]">
            <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm sm:text-lg font-black text-white uppercase tracking-widest">
                {editingColumn === 'untouchable' ? 'Untouchables (Max 10)' : editingColumn === 'block' ? 'Trading Block (Max 10)' : 'Target List (Max 10)'}
              </h3>
              <button onClick={() => setEditingColumn(null)} className="px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase text-xs rounded-xl">Done</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <PlayerSelectorGrid
                items={editingColumn === 'targets' ? leagueItems : ownRosterItems}
                teams={teams as any}
                selectedIds={editingColumn === 'untouchable' ? untouchableIds : editingColumn === 'block' ? blockIds : targetIds}
                onToggle={(id) => toggle(editingColumn!, id)}
                maxSelections={MAX_SLOTS}
                accentColor={editingColumn === 'untouchable' ? 'emerald' : editingColumn === 'block' ? 'red' : 'indigo'}
                searchPlaceholder={editingColumn === 'targets' ? 'Search league players...' : 'Search your roster...'}
              />

              {/* Picks section — only in Trading Block column for contending teams */}
              {editingColumn === 'block' && teamMode === 'contend' && teamPicks.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-800">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-3">Trade Future Picks</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {teamPicks.map(pick => {
                      const origTeam = teams.find(t => t.id === pick.originalTid);
                      const isActive = blockPickIds.has(pick.dpid);
                      return (
                        <button
                          key={pick.dpid}
                          onClick={() => togglePick(pick.dpid)}
                          className={cn(
                            'flex items-center gap-2 p-2 rounded-lg border text-left transition-all',
                            isActive
                              ? 'bg-rose-600/20 border-rose-500/50 text-white'
                              : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700',
                          )}
                        >
                          {origTeam?.logoUrl && (
                            <img src={origTeam.logoUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" referrerPolicy="no-referrer" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-black uppercase">{formatPickLabel(pick, currentYear, lotterySlotByTid, false)}</div>
                            {pick.originalTid !== teamId && (
                              <div className="text-[9px] text-slate-500 truncate">via {origTeam?.abbrev}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TVItem {
  player: NBAPlayer;
  tv: number;
  ovr: number;
  pot: number;
}

function EditableColumn({
  title, items, teams, onAdd, accentColor, onPlayerClick,
  picks, blockPickIds, onRemovePlayer, onRemovePick, currentYear, lotterySlotByTid,
}: {
  title: string;
  items: TVItem[];
  teams: NBATeam[];
  onAdd?: () => void;
  accentColor?: string;
  onPlayerClick?: (p: NBAPlayer) => void;
  onRemovePlayer?: (playerId: string) => void;
  picks?: Array<{ dpid: number; season: number; round: number; originalTid: number; tid: number }>;
  canEditPicks?: boolean;
  onTogglePick?: (dpid: number) => void;
  allTeamPicks?: Array<{ dpid: number; season: number; round: number; originalTid: number; tid: number }>;
  onOpenPickEditor?: () => void;
  onRemovePick?: (dpid: number) => void;
  currentYear?: number;
  allTeams?: NBATeam[];
  blockPickIds?: Set<number>;
  lotterySlotByTid?: Map<number, number>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs uppercase tracking-[1.5px] font-bold border-b border-[#30363d] pb-3" style={{ color: accentColor ?? '#FDB927' }}>
        {title}
      </h2>
      <div className="flex flex-col gap-2">
        {items.length === 0 && (!picks || picks.length === 0) && (
          <p className="text-[#8b949e] text-xs italic py-4 text-center">No players set</p>
        )}
        {items.map((item, i) => {
          const team = teams.find(t => t.id === item.player.tid);
          return (
            <PlayerCard
              key={i}
              item={item}
              teamLogoUrl={team?.logoUrl}
              onClick={() => onPlayerClick?.(item.player)}
              onRemove={onRemovePlayer ? () => onRemovePlayer(item.player.internalId) : undefined}
            />
          );
        })}
        {picks && picks.length > 0 && (
          <div className="mt-2 pt-2 border-t border-[#30363d] flex flex-col gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Picks on Block</span>
            {picks.map(pick => {
              const origTeam = teams.find(t => t.id === pick.originalTid);
              return (
                <PickRow
                  key={pick.dpid}
                  pick={pick}
                  origTeam={origTeam}
                  onRemove={onRemovePick ? () => onRemovePick(pick.dpid) : undefined}
                  currentYear={currentYear ?? new Date().getFullYear()}
                  lotterySlotByTid={lotterySlotByTid ?? new Map()}
                />
              );
            })}
          </div>
        )}
        {onAdd && (
          <button
            onClick={onAdd}
            className="mt-2 flex items-center justify-center gap-2 bg-white/5 border border-transparent hover:border-[#30363d] text-[#8b949e] hover:text-white py-3 px-4 rounded transition-colors font-bold uppercase text-[10px] tracking-widest"
          >
            + Edit List
          </button>
        )}
      </div>
    </div>
  );
}

/** TV → half-star rating (0.5 increments, max 5) */
function tvToStars(tv: number): number {
  if (tv >= 200) return 5;
  if (tv >= 160) return 4.5;
  if (tv >= 120) return 4;
  if (tv >= 90) return 3.5;
  if (tv >= 60) return 3;
  if (tv >= 40) return 2.5;
  if (tv >= 25) return 2;
  if (tv >= 12) return 1.5;
  if (tv >= 5) return 1;
  return 0.5;
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex gap-[1px] shrink-0">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = stars >= i + 1;
        const half = !filled && stars >= i + 0.5;
        return (
          <span key={i} className={cn("text-[10px]", filled || half ? "text-[#FDB927]" : "text-[#30363d]")}>
            {half ? '⯪' : '★'}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Platform-aware reveal hook for a row/card.
 *
 * Desktop (fine pointer): a single click toggles `revealed` — the trash icon slides in on tap.
 *   While revealed, clicking the row dismisses; clicking the trash fires `onRemove`.
 *   The original onClick (bio view) is suppressed in desktop-reveal mode so the user never
 *   accidentally opens the bio while trying to remove.
 * Touch (coarse pointer): a short tap preserves the original onClick (opens bio), while a
 *   long-press (≥400ms) reveals the trash icon — matches the user's stated interaction model
 *   ("click to reveal trash… hold on mobile").
 */
function useRevealOnPressOrClick(onTap?: () => void) {
  const [revealed, setRevealed] = useState(false);
  const pressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches;

  const handlePointerDown = () => {
    longPressFiredRef.current = false;
    if (!isTouch) return;
    pressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      setRevealed(true);
    }, 400);
  };
  const cancelPress = () => {
    if (pressTimerRef.current != null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const handleClick = () => {
    if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
    if (revealed) { setRevealed(false); return; }
    if (isTouch) { onTap?.(); return; }
    setRevealed(true);
  };

  return {
    revealed,
    hide: () => setRevealed(false),
    bind: {
      onClick: handleClick,
      onPointerDown: handlePointerDown,
      onPointerUp: cancelPress,
      onPointerLeave: cancelPress,
      onPointerCancel: cancelPress,
    },
  };
}

function PlayerCard({ item, teamLogoUrl, onClick, onRemove }: { item: TVItem; teamLogoUrl?: string; onClick?: () => void; onRemove?: () => void }) {
  const { player, ovr, pot, tv } = item;
  const stars = tvToStars(tv);
  const { revealed, hide, bind } = useRevealOnPressOrClick(onClick);

  return (
    <div {...bind} className="bg-[#161b22]/60 backdrop-blur-md border border-[#30363d] rounded p-3 flex items-center gap-3 group hover:border-[#FDB927] transition-colors cursor-pointer relative overflow-hidden select-none">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-[#FDB927] transition-colors" />

      <PlayerPortrait
        playerName={player.name}
        imgUrl={player.imgURL}
        face={(player as any).face}
        teamLogoUrl={teamLogoUrl}
        size={40}
      />

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="font-bold text-[#e6edf3] uppercase text-sm truncate group-hover:text-[#FDB927] transition-colors">{player.name}</span>
        <span className="text-[#8b949e] text-[10px] font-bold uppercase tracking-wider">{player.pos}{player.born?.year || player.age ? ` | ${player.born?.year ? (new Date().getFullYear() - player.born.year) : player.age}y` : ''}</span>
      </div>

      {/* OVR + POT — hidden when trash is revealed so the row stays readable on narrow widths */}
      <div className={cn("flex flex-col items-end flex-shrink-0 transition-opacity", revealed && onRemove ? "opacity-0" : "opacity-100")}>
        <div className={cn("text-xs font-black tabular-nums", ovrText(ovr))}>{ovr}</div>
        <div className={cn("text-[10px] font-bold tabular-nums", getPotColor(pot))}>{pot}</div>
      </div>

      <div className={cn("transition-opacity", revealed && onRemove ? "opacity-0" : "opacity-100")}>
        <StarRating stars={stars} />
      </div>

      {onRemove && revealed && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); hide(); }}
          className="absolute inset-y-0 right-0 px-4 flex items-center gap-2 bg-red-500/85 hover:bg-red-500 text-white font-black uppercase text-[10px] tracking-widest"
        >
          <Trash2 size={14} /> Remove
        </button>
      )}
    </div>
  );
}

function PickRow({ pick, origTeam, onRemove, currentYear, lotterySlotByTid }: {
  pick: { dpid: number; season: number; round: number; originalTid: number; tid: number };
  origTeam?: NBATeam;
  onRemove?: () => void;
  currentYear: number;
  lotterySlotByTid: Map<number, number>;
}) {
  const { revealed, hide, bind } = useRevealOnPressOrClick();
  return (
    <div {...bind} className="bg-indigo-900/20 border border-indigo-500/30 rounded px-3 py-2 flex items-center gap-2 relative overflow-hidden cursor-pointer select-none">
      {origTeam?.logoUrl && <img src={origTeam.logoUrl} alt="" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />}
      <span className="text-[11px] font-black uppercase text-indigo-200">{formatPickLabel(pick, currentYear, lotterySlotByTid, false)}</span>
      {pick.originalTid !== pick.tid && (
        <span className="text-[9px] text-slate-500 ml-auto">via {origTeam?.abbrev}</span>
      )}
      {onRemove && revealed && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); hide(); }}
          className="absolute inset-y-0 right-0 px-3 flex items-center gap-1.5 bg-red-500/85 hover:bg-red-500 text-white font-black uppercase text-[9px] tracking-widest"
        >
          <Trash2 size={12} /> Remove
        </button>
      )}
    </div>
  );
}
