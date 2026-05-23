import React, { useState, useMemo, useRef } from 'react';
import { useGame } from '../../store/GameContext';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { NBAPlayer, NBATeam, DraftPick } from '../../types';
import { TradeMachineActionBar } from './TradeMachineActionBar';
import { TradeMachineResponseOverlay } from './TradeMachineResponseOverlay';
import { TradeSummaryModal } from './TradeSummaryModal';
import { computeLeaguePerAvg, type TVContext } from '../../services/trade/tradeValueEngine';
import { AwardService } from '../../services/logic/AwardService';
import { formatPlayerSalaryDisplay, getCapThresholds, getTeamPayrollUSD, getTradeOutlook, effectiveRecord, sumPlayerCurrentSalariesUSD, topNAvgK2, resolveManualOutlook, type TradeOutlook } from '../../utils/salaryUtils';
import { validateCBATradeRules } from '../../utils/cbaTradeRules';
import { teamPowerRanks } from '../../services/trade/tradeFinderEngine';
import { getMinTradableSeason, getMaxTradableSeason, getTradablePicks, DEFAULT_TRADABLE_PICK_SEASONS } from '../../services/draft/DraftPickGenerator';
import { buildClassStrengthMap, buildFullDraftSlotMap, comparePicks } from '../../services/draft/draftClassStrength';
import { validateStepienRule, wouldStepienViolateForTid } from '../../services/trade/stepienRule';
import { getGameDateParts, isInPostDeadlinePreFAWindow } from '../../utils/dateUtils';
import { formatCurrencyWithCode, getLeagueCurrencyCode } from '../../utils/helpers';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { getActiveLeagueTeams, isOnRoster } from '../../utils/teamLookup';
import { TradeMachineTeamColumn } from './TradeMachineTeamColumn';
import { evaluateTradeMachineExecution } from './tradeMachineExecution';

interface TradeMachineModalProps {
  onClose: () => void;
  onConfirm: (payload: { teamAId: number, teamBId: number, teamAPlayers: string[], teamBPlayers: string[], teamAPicks: number[], teamBPicks: number[], teamACashUSD?: number, teamBCashUSD?: number, commissionerForced?: boolean }) => void;
  // Optional pre-load state (from Trade Finder "Manage Trade")
  initialTeamAId?: number;
  initialTeamBId?: number;
  initialTeamAPlayerIds?: string[];
  initialTeamBPlayerIds?: string[];
  initialTeamAPickDpids?: number[];
  initialTeamBPickDpids?: number[];
  initialPreAccepted?: boolean;
}

export const TradeMachineModal: React.FC<TradeMachineModalProps> = ({
  onClose, onConfirm,
  initialTeamAId, initialTeamBId,
  initialTeamAPlayerIds, initialTeamBPlayerIds,
  initialTeamAPickDpids, initialTeamBPickDpids,
  initialPreAccepted = false,
}) => {
  const { state } = useGame();
  const pbaMode = isPbaIsolatedMode(state);
  const isGM = state.gameMode === 'gm';
  const activeTeams = useMemo(() => {
    if (!pbaMode) return state.teams;
    return getActiveLeagueTeams({
      teams: state.teams,
      nonNBATeams: state.nonNBATeams ?? [],
      userTeamId: state.userTeamId,
    });
  }, [pbaMode, state.teams, state.nonNBATeams, state.userTeamId]);
  const activeTeamIds = useMemo(() => new Set(activeTeams.map(t => t.id)), [activeTeams]);
  const activePlayers = useMemo(() => {
    if (!pbaMode) return state.players;
    return state.players.filter(p => activeTeamIds.has(p.tid) && isOnRoster(p));
  }, [pbaMode, state.players, activeTeamIds]);
  const [teamAId, setTeamAId] = useState<number | null>(isGM && state.userTeamId != null ? state.userTeamId : (initialTeamAId ?? null));
  const [teamBId, setTeamBId] = useState<number | null>(initialTeamBId ?? null);

  const [teamAPlayers, setTeamAPlayers] = useState<NBAPlayer[]>(() =>
    initialTeamAPlayerIds ? state.players.filter(p => initialTeamAPlayerIds.includes(p.internalId)) : []
  );
  const [teamBPlayers, setTeamBPlayers] = useState<NBAPlayer[]>(() =>
    initialTeamBPlayerIds ? state.players.filter(p => initialTeamBPlayerIds.includes(p.internalId)) : []
  );
  const [teamAPicks, setTeamAPicks] = useState<DraftPick[]>(() =>
    initialTeamAPickDpids ? state.draftPicks.filter(pk => initialTeamAPickDpids.includes(pk.dpid)) : []
  );
  const [teamBPicks, setTeamBPicks] = useState<DraftPick[]>(() =>
    initialTeamBPickDpids ? state.draftPicks.filter(pk => initialTeamBPickDpids.includes(pk.dpid)) : []
  );
  
  // Cash considerations — NBA cap equivalent per team per season. Step $250K.
  const teamACashUsedUSD = ((activeTeams.find(t => t.id === teamAId) as any)?.cashUsedInTrades ?? 0);
  const teamBCashUsedUSD = ((activeTeams.find(t => t.id === teamBId) as any)?.cashUsedInTrades ?? 0);
  const teamACashCapRemaining = Math.max(0, 7_500_000 - teamACashUsedUSD);
  const teamBCashCapRemaining = Math.max(0, 7_500_000 - teamBCashUsedUSD);
  const [teamACashUSD, setTeamACashUSD] = useState(0);
  const [teamBCashUSD, setTeamBCashUSD] = useState(0);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [tradeResponse, setTradeResponse] = useState<{ accepted: boolean; gmName: string; reason: string; suggestion?: string } | null>(null);
  // AI's suggested additions (user-side assets) that would make the rejected trade work.
  // Persisted after Go Back so the TradeMachine highlights them in amber for the user.
  const [suggestedPlayerIds, setSuggestedPlayerIds] = useState<Set<string>>(new Set());
  const [suggestedPickIds, setSuggestedPickIds] = useState<Set<number>>(new Set());
  const [activeTabA, setActiveTabA] = useState<'roster' | 'picks'>('roster');
  const [activeTabB, setActiveTabB] = useState<'roster' | 'picks'>('roster');
  const [openDropdown, setOpenDropdown] = useState<'A' | 'B' | null>(null);

  const currencyCode = getLeagueCurrencyCode(state.leagueStats);
  const formatContract = (player: NBAPlayer) => formatPlayerSalaryDisplay(player as any, state.leagueStats.year, state.nonNBATeams ?? []);
  const formatDisplaySalaryUSD = (amountUSD: number) => formatCurrencyWithCode(amountUSD, currencyCode, false);

  const teamsWithRecords = useMemo(() =>
    activeTeams.map(t => ({ ...t, wins: t.wins ?? 0, losses: t.losses ?? 0 })),
    [activeTeams]
  );

  const teamA = activeTeams.find(t => t.id === teamAId);
  const teamB = activeTeams.find(t => t.id === teamBId);

  // Memos for rosters and picks
  const teamARoster = useMemo(() => activePlayers
    .filter(p => p.tid === teamAId && isOnRoster(p))
    .sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0)),
  [activePlayers, teamAId]);

  const teamBRoster = useMemo(() => activePlayers
    .filter(p => p.tid === teamBId && isOnRoster(p))
    .sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0)),
  [activePlayers, teamBId]);

  const tradablePickCutoff = getMaxTradableSeason(state);
  const minTradableSeason = getMinTradableSeason(state);
  const tradablePicks = useMemo(() => getTradablePicks(state), [state.draftPicks, state.leagueStats?.year, state.leagueStats?.tradableDraftPickSeasons, (state as any).draftComplete]);
  const lotterySlotByTid = useMemo(
    () => buildFullDraftSlotMap((state as any).draftLotteryResult, activeTeams),
    [(state as any).draftLotteryResult, activeTeams],
  );
  const _currentYearForPicks = state.leagueStats?.year ?? new Date().getFullYear();
  const teamAPicksAvailable = useMemo(
    () => tradablePicks.filter(p => p.tid === teamAId).sort((a, b) => comparePicks(a, b, _currentYearForPicks, lotterySlotByTid)),
    [tradablePicks, teamAId, _currentYearForPicks, lotterySlotByTid],
  );
  const teamBPicksAvailable = useMemo(
    () => tradablePicks.filter(p => p.tid === teamBId).sort((a, b) => comparePicks(a, b, _currentYearForPicks, lotterySlotByTid)),
    [tradablePicks, teamBId, _currentYearForPicks, lotterySlotByTid],
  );

  const stepienOnGlobal = state.leagueStats?.stepienRuleEnabled !== false;
  const tradablePickSeasons = state.leagueStats?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
  const postDeadlinePreFA = useMemo(
    () => isInPostDeadlinePreFAWindow(state.date ?? '', state.leagueStats?.year ?? new Date().getFullYear(), state.leagueStats as any),
    [state.date, state.leagueStats],
  );
  const rslCtx = useMemo(() => ({
    currentDate: state.date ?? '',
    leagueStats: state.leagueStats as any,
  }), [state.date, state.leagueStats]);
  const stepienBlockedA = useMemo(() => {
    if (!stepienOnGlobal || !teamA) return new Set<number>();
    const blocked = new Set<number>();
    for (const pick of teamAPicksAvailable) {
      if (teamAPicks.some(p => p.dpid === pick.dpid)) continue;
      if (wouldStepienViolateForTid(state.draftPicks ?? [], state.leagueStats?.year ?? new Date().getFullYear(), tradablePickSeasons, teamA.id, [...teamAPicks, pick])) {
        blocked.add(pick.dpid);
      }
    }
    return blocked;
  }, [stepienOnGlobal, teamA, teamAPicksAvailable, teamAPicks, state.draftPicks, state.leagueStats?.year, tradablePickSeasons]);
  const stepienBlockedB = useMemo(() => {
    if (!stepienOnGlobal || !teamB) return new Set<number>();
    const blocked = new Set<number>();
    for (const pick of teamBPicksAvailable) {
      if (teamBPicks.some(p => p.dpid === pick.dpid)) continue;
      if (wouldStepienViolateForTid(state.draftPicks ?? [], state.leagueStats?.year ?? new Date().getFullYear(), tradablePickSeasons, teamB.id, [...teamBPicks, pick])) {
        blocked.add(pick.dpid);
      }
    }
    return blocked;
  }, [stepienOnGlobal, teamB, teamBPicksAvailable, teamBPicks, state.draftPicks, state.leagueStats?.year, tradablePickSeasons]);

  const displayTeamARoster = useMemo(() => {
    const incoming = teamBPlayers.map(p => ({ ...p, isIncoming: true }));
    const native = teamARoster.filter(p => !teamAPlayers.some(out => out.internalId === p.internalId));
    return [...incoming, ...native];
  }, [teamBPlayers, teamARoster, teamAPlayers]);

  const displayTeamBRoster = useMemo(() => {
    const incoming = teamAPlayers.map(p => ({ ...p, isIncoming: true }));
    const native = teamBRoster.filter(p => !teamBPlayers.some(out => out.internalId === p.internalId));
    return [...incoming, ...native];
  }, [teamAPlayers, teamBRoster, teamBPlayers]);

  const teamASalary = useMemo(() => teamAPlayers.reduce((sum, p) => sum + (p.contract?.amount || 0), 0), [teamAPlayers]);
  const teamBSalary = useMemo(() => teamBPlayers.reduce((sum, p) => sum + (p.contract?.amount || 0), 0), [teamBPlayers]);
  const teamADisplaySalaryUSD = useMemo(() => sumPlayerCurrentSalariesUSD(teamAPlayers as any[], state.leagueStats.year), [teamAPlayers, state.leagueStats.year]);
  const teamBDisplaySalaryUSD = useMemo(() => sumPlayerCurrentSalariesUSD(teamBPlayers as any[], state.leagueStats.year), [teamBPlayers, state.leagueStats.year]);

  const thresholds = useMemo(() => getCapThresholds(state.leagueStats), [state.leagueStats]);

  // ── Trade engine context (mirrors TradeFinderView) ─────────────────────────
  // Shared acceptance uses these; keep the inputs identical to Finder's so a
  // deal the Finder would return is also one the Machine will accept.
  const currentYearForEval = state.leagueStats?.year ?? new Date().getFullYear();
  const powerRanksMap = useMemo(() => teamPowerRanks(activeTeams, currentYearForEval), [activeTeams, currentYearForEval]);
  // Dynamic pick valuation inputs — rebuilt when prospect pool or lottery changes.
  const classStrengthByYear = useMemo(
    () => buildClassStrengthMap(activePlayers, currentYearForEval, currentYearForEval, tradablePickCutoff),
    [activePlayers, currentYearForEval, tradablePickCutoff],
  );
  // Top-30 MVP-race rank — flags franchise-altering players so calcPlayerTV adds
  // the "MVP candidate" premium and isUntouchable locks them down. Built off the
  // same scoring AwardService uses on the awards screen, so what the user sees
  // in the MVP race lines up with what the trade engine treats as untouchable.
  const mvpRank = useMemo(() => {
    const top30 = AwardService.calculateMVPRankings(activePlayers, activeTeams, currentYearForEval, 30);
    const map = new Map<string, number>();
    top30.forEach((c, i) => map.set(c.player.internalId, i + 1));
    return map;
  }, [activePlayers, activeTeams, currentYearForEval]);
  const tvContext = useMemo<TVContext>(() => {
    const { month } = state.date ? getGameDateParts(state.date) : getGameDateParts(new Date());
    const isRegularSeason = (month >= 10 && month <= 12) || (month >= 1 && month <= 4);
    return {
      leaguePerAvg: isRegularSeason ? computeLeaguePerAvg(activePlayers, currentYearForEval) : 15,
      isRegularSeason,
      mvpRank,
    };
  }, [activePlayers, currentYearForEval, state.date, mvpRank]);
  const confStandings = useMemo(() => {
    const map = new Map<number, { confRank: number; gbFromLeader: number }>();
    const groups = Array.from(new Set(activeTeams.map(t => (t.conference ?? '').trim()).filter(Boolean)));
    const confs = groups.length > 0 ? groups : [''];
    for (const conf of confs) {
      const confTeams = activeTeams.filter(t => ((t.conference ?? '').trim() || '') === conf)
        .map(t => ({ t, rec: effectiveRecord(t, currentYearForEval) }))
        .sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
      const leader = confTeams[0];
      const lw = leader?.rec.wins ?? 0;
      const ll = leader?.rec.losses ?? 0;
      confTeams.forEach(({ t, rec }, i) => {
        const gb = Math.max(0, ((lw - rec.wins) + (rec.losses - ll)) / 2);
        map.set(t.id, { confRank: i + 1, gbFromLeader: gb });
      });
    }
    return map;
  }, [activeTeams, currentYearForEval]);
  const teamOutlooks = useMemo(() => {
    const map = new Map<number, TradeOutlook>();
    activeTeams.forEach(t => {
      const manual = resolveManualOutlook(t, state.gameMode, state.userTeamId);
      if (manual) { map.set(t.id, manual); return; }
      const payroll = getTeamPayrollUSD(activePlayers, t.id, t, currentYearForEval);
      const standings = confStandings.get(t.id);
      const expiring = activePlayers.filter(p => p.tid === t.id && (p.contract?.exp ?? 0) <= currentYearForEval).length;
      const rec = effectiveRecord(t, currentYearForEval);
      const starAvg = topNAvgK2(activePlayers, t.id, 3);
      map.set(t.id, getTradeOutlook(
        payroll, rec.wins, rec.losses, expiring, thresholds,
        standings?.confRank, standings?.gbFromLeader, starAvg,
      ));
    });
    return map;
  }, [activeTeams, activePlayers, thresholds, confStandings, currentYearForEval, state.gameMode, state.userTeamId]);

  const salaryMismatchInfo = useMemo(() => {
    if (!teamA || !teamB) return null;
    if (state.leagueStats?.salaryCapEnabled === false) return null;
    const cba = validateCBATradeRules({
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAPlayers,
      teamBPlayers,
      teamAPicks,
      teamBPicks,
      teamACashUSD,
      teamBCashUSD,
      teams: activeTeams,
      players: activePlayers,
      leagueStats: state.leagueStats,
      currentDate: state.date,
      currentYear: currentYearForEval,
    });
    if (!cba.ok) {
      return { message: cba.reason ?? 'Trade violates current CBA settings.', team: (cba.offendingSide ?? 'A') as 'A' | 'B' };
    }

    // Stepien Rule — neither team may end up with no 1st in two consecutive future drafts.
    if (state.leagueStats?.stepienRuleEnabled !== false && teamA && teamB && (teamAPicks.length > 0 || teamBPicks.length > 0)) {
      const stepien = validateStepienRule(
        state.draftPicks ?? [],
        currentYearForEval,
        state.leagueStats?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS,
        teamA.id, teamB.id,
        teamAPicks, teamBPicks,
      );
      if (!stepien.ok) {
        const offendingTid = 'offendingTid' in stepien ? stepien.offendingTid : undefined;
        const offendingSide: 'A' | 'B' = offendingTid === teamA.id ? 'A' : 'B';
        const offendingTeam = offendingSide === 'A' ? teamA : teamB;
        return { message: `Stepien Rule: ${offendingTeam?.abbrev || `Team ${offendingSide}`} would have no 1st in two straight future drafts.`, team: offendingSide };
      }
    }
    return null;
  }, [teamA, teamB, teamAPlayers, teamBPlayers, teamAPicks, teamBPicks, teamACashUSD, teamBCashUSD, activeTeams, activePlayers, state.leagueStats, state.date, state.draftPicks, currentYearForEval]);

  const handleConfirm = () => {
    if (teamAId !== null && teamBId !== null) setShowSummaryModal(true);
  };

  const handleExecuteTrade = (force: boolean) => {
    if (teamAId === null || teamBId === null) return;

    // GM Mode: evaluate whether the other team accepts. Trade Finder's cap
    // absorption offers are pre-vetted by the engine; still re-check CBA here.
    if (isGM && !force && (!initialPreAccepted || salaryMismatchInfo)) {
      const evaluation = evaluateTradeMachineExecution({
        teamAId,
        teamBId,
        teamAPlayers,
        teamBPlayers,
        teamAPicks,
        teamBPicks,
        activeTeams,
        activePlayers,
        currentYear: currentYearForEval,
        powerRanksMap,
        teamOutlooks,
        tvContext,
        classStrengthByYear,
        lotterySlotByTid,
        state,
        teamACashUSD,
        teamBCashUSD,
      });
      setTradeResponse({
        accepted: evaluation.accepted,
        gmName: evaluation.gmName,
        reason: evaluation.reason,
        suggestion: evaluation.suggestion,
      });
      setSuggestedPlayerIds(evaluation.suggestedPlayerIds);
      setSuggestedPickIds(evaluation.suggestedPickIds);
      setShowSummaryModal(false);
      if (!evaluation.accepted) return;
      return;
    }

    setShowSummaryModal(false);
    setTradeResponse(null);
    const commissionerForced = !isGM && force;
    onConfirm({
      teamAId, teamBId,
      teamAPlayers: teamAPlayers.map(p => p.internalId),
      teamBPlayers: teamBPlayers.map(p => p.internalId),
      teamAPicks: teamAPicks.map(p => p.dpid),
      teamBPicks: teamBPicks.map(p => p.dpid),
      ...(teamACashUSD > 0 ? { teamACashUSD } : {}),
      ...(teamBCashUSD > 0 ? { teamBCashUSD } : {}),
      ...(commissionerForced ? { commissionerForced: true } : {})
    });
  };

  const canClickAssets = teamAId !== null && teamBId !== null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/95 z-[60] flex flex-col items-center justify-start lg:justify-center p-3 sm:p-4 pb-24 lg:pb-4 font-sans backdrop-blur-md overflow-y-auto">

        <TradeMachineActionBar
          onConfirm={handleConfirm}
          onClose={onClose}
          sameTeam={teamAId === teamBId}
          disabled={!canClickAssets || teamAId === teamBId || teamAId == null || teamBId == null || (teamAPlayers.length === 0 && teamBPlayers.length === 0 && teamAPicks.length === 0 && teamBPicks.length === 0 && teamACashUSD === 0 && teamBCashUSD === 0)}
        />

        {/* MAIN 2-COLUMN WRAPPER */}
        {/* Mobile: let the wrapper grow with content (each column is min-h-[85vh])
            so the outer overflow-y-auto scrolls smoothly between the two columns.
            A fixed wrapper height fought those mins and produced the unscrollable
            "compacted" layout the user reported. */}
        <div className="w-full max-w-6xl lg:h-[80vh] flex flex-col lg:flex-row gap-3 sm:gap-6 pb-4 lg:pb-0">
          <TradeMachineTeamColumn
            label={isGM ? 'Your Team' : 'Team 1'}
            isGM={isGM}
            selectedTeamId={teamAId}
            otherTeamId={teamBId}
            onSelectTeam={id => {
              if (!isGM) {
                setTeamAId(id);
                setTeamAPlayers([]);
                setTeamAPicks([]);
              }
            }}
            teamsWithRecords={teamsWithRecords}
            dropdownOpen={isGM ? false : openDropdown === 'A'}
            onToggleDropdown={() => { if (!isGM) setOpenDropdown(openDropdown === 'A' ? null : 'A'); }}
            outgoingDisplaySalary={formatDisplaySalaryUSD(teamADisplaySalaryUSD)}
            incomingDisplaySalary={formatDisplaySalaryUSD(teamBDisplaySalaryUSD)}
            salaryMismatchTeam={salaryMismatchInfo?.team === 'A' ? 'A' : null}
            selectedPlayerIds={new Set(teamAPlayers.map(p => p.internalId))}
            selectedPlayers={teamAPlayers}
            onRemovePlayer={id => setTeamAPlayers(teamAPlayers.filter(x => x.internalId !== id))}
            selectedPicks={teamAPicks}
            onRemovePick={dpid => setTeamAPicks(teamAPicks.filter(x => x.dpid !== dpid))}
            activeTeams={activeTeams}
            currentYear={currentYearForEval}
            lotterySlotByTid={lotterySlotByTid}
            cashCapRemaining={teamACashCapRemaining}
            cashUSD={teamACashUSD}
            setCashUSD={setTeamACashUSD}
            activeTab={activeTabA}
            setActiveTab={setActiveTabA}
            displayRoster={displayTeamARoster}
            picksAvailable={teamAPicksAvailable}
            canClickAssets={canClickAssets}
            currentSeason={state.leagueStats.year}
            postDeadlinePreFA={postDeadlinePreFA}
            rslCtx={rslCtx}
            onTogglePlayer={player => {
              if ((player as any).isIncoming) setTeamBPlayers(teamBPlayers.filter(x => x.internalId !== player.internalId));
              else if (teamAPlayers.some(x => x.internalId === player.internalId)) setTeamAPlayers(teamAPlayers.filter(x => x.internalId !== player.internalId));
              else setTeamAPlayers([...teamAPlayers, player]);
            }}
            onTogglePick={pick => teamAPicks.some(p => p.dpid === pick.dpid) ? setTeamAPicks(teamAPicks.filter(p => p.dpid !== pick.dpid)) : setTeamAPicks([...teamAPicks, pick])}
            stepienBlocked={stepienBlockedA}
            stateTeams={state.teams}
            nonNBATeams={state.nonNBATeams ?? []}
            suggestedPlayerIds={suggestedPlayerIds}
            suggestedPickIds={suggestedPickIds}
            formatContract={formatContract}
          />

          <TradeMachineTeamColumn
            label="Team 2"
            selectedTeamId={teamBId}
            otherTeamId={teamAId}
            onSelectTeam={id => {
              setTeamBId(id);
              setTeamBPlayers([]);
              setTeamBPicks([]);
            }}
            teamsWithRecords={teamsWithRecords}
            dropdownOpen={openDropdown === 'B'}
            onToggleDropdown={() => setOpenDropdown(openDropdown === 'B' ? null : 'B')}
            outgoingDisplaySalary={formatDisplaySalaryUSD(teamBDisplaySalaryUSD)}
            incomingDisplaySalary={formatDisplaySalaryUSD(teamADisplaySalaryUSD)}
            salaryMismatchTeam={salaryMismatchInfo?.team === 'B' ? 'B' : null}
            selectedPlayerIds={new Set(teamBPlayers.map(p => p.internalId))}
            selectedPlayers={teamBPlayers}
            onRemovePlayer={id => setTeamBPlayers(teamBPlayers.filter(x => x.internalId !== id))}
            selectedPicks={teamBPicks}
            onRemovePick={dpid => setTeamBPicks(teamBPicks.filter(x => x.dpid !== dpid))}
            activeTeams={activeTeams}
            currentYear={currentYearForEval}
            lotterySlotByTid={lotterySlotByTid}
            cashCapRemaining={teamBCashCapRemaining}
            cashUSD={teamBCashUSD}
            setCashUSD={setTeamBCashUSD}
            activeTab={activeTabB}
            setActiveTab={setActiveTabB}
            displayRoster={displayTeamBRoster}
            picksAvailable={teamBPicksAvailable}
            canClickAssets={canClickAssets}
            currentSeason={state.leagueStats.year}
            postDeadlinePreFA={postDeadlinePreFA}
            rslCtx={rslCtx}
            onTogglePlayer={player => {
              if ((player as any).isIncoming) setTeamAPlayers(teamAPlayers.filter(x => x.internalId !== player.internalId));
              else if (teamBPlayers.some(x => x.internalId === player.internalId)) setTeamBPlayers(teamBPlayers.filter(x => x.internalId !== player.internalId));
              else setTeamBPlayers([...teamBPlayers, player]);
            }}
            onTogglePick={pick => teamBPicks.some(p => p.dpid === pick.dpid) ? setTeamBPicks(teamBPicks.filter(p => p.dpid !== pick.dpid)) : setTeamBPicks([...teamBPicks, pick])}
            stepienBlocked={stepienBlockedB}
            stateTeams={state.teams}
            nonNBATeams={state.nonNBATeams ?? []}
            formatContract={formatContract}
          />
        </div>

        {tradeResponse && (
          <TradeMachineResponseOverlay
            tradeResponse={tradeResponse}
            otherTeam={activeTeams.find(t => t.id === teamBId)}
            onFinalize={() => handleExecuteTrade(true)}
            onGoBack={() => setTradeResponse(null)}
            onEndNegotiation={() => {
              setTradeResponse(null);
              onClose();
            }}
          />
        )}

        {teamA && teamB && showSummaryModal && (
            <TradeSummaryModal
                isOpen={showSummaryModal}
                onClose={() => setShowSummaryModal(false)}
                onConfirmTrade={() => handleExecuteTrade(false)}
                onForceTrade={() => handleExecuteTrade(true)}
                tradeDetails={{
                    teamA, teamB,
                    teamAPlayers, teamBPlayers,
                    teamAPicks, teamBPicks,
                    teamASentSalary: teamASalary,
                    teamBSentSalary: teamBSalary,
                    teamACashUSD, teamBCashUSD,
                }}
                salaryMismatchInfo={salaryMismatchInfo}
            />
        )}
      </motion.div>
    </AnimatePresence>
  );
};
