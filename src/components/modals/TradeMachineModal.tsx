import React, { useState, useMemo, useRef } from 'react';
import { useGame } from '../../store/GameContext';
import { X, ChevronUp, ChevronDown, MoreVertical } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { NBAPlayer, NBATeam, DraftPick } from '../../types';
import { TradeSummaryModal } from './TradeSummaryModal';
import { TeamDropdown } from '../shared/TeamDropdown';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { calcOvr2K, calcPot2K, calcPlayerTV, calcPickTV, getPotColor, computeLeaguePerAvg, type TeamMode } from '../../services/trade/tradeValueEngine';
import { getCapThresholds, getTeamPayrollUSD, getTradeOutlook, effectiveRecord, topNAvgK2, resolveManualOutlook, type TradeOutlook } from '../../utils/salaryUtils';
import { validateCBATradeRules } from '../../utils/cbaTradeRules';
import { evaluateTradeAcceptance, teamPowerRanks, roleToMode } from '../../services/trade/tradeFinderEngine';
import { SettingsManager } from '../../services/SettingsManager';
import { getMinTradableSeason, getMaxTradableSeason, getTradablePicks } from '../../services/draft/DraftPickGenerator';
import { buildClassStrengthMap, buildFullDraftSlotMap, formatPickLabel } from '../../services/draft/draftClassStrength';
import { validateStepienRule, wouldStepienViolateForTid } from '../../services/trade/stepienRule';
import { getGameDateParts, isInPostDeadlinePreFAWindow } from '../../utils/dateUtils';
import { isWalkingExpiring, isRecentlySignedLocked } from '../../services/trade/tradeValueEngine';
import { isTradeEligible } from '../../utils/signingMoratorium';
import { PlayerHoverCard } from '../shared/PlayerHoverCard';
import { PlayerHoverCardK2 } from '../shared/PlayerHoverCardK2';

// OVR text color matching TradeFinder's ovrText helper — keeps the number coloring
// consistent between TradeMachineModal and the OfferCard stack.
const ovrTextColor = (v: number): string => {
  if (v >= 95) return 'text-violet-300';
  if (v >= 90) return 'text-blue-300';
  if (v >= 85) return 'text-emerald-300';
  if (v >= 78) return 'text-amber-300';
  if (v >= 72) return 'text-slate-300';
  return 'text-red-400';
};

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
}

// HELPER: The "Eyebrow" Pill for outgoing players
const OutgoingPill = ({ player, onRemove }: { player: NBAPlayer, onRemove: () => void }) => (
  <div className="flex items-center gap-2 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-full pl-1 pr-2 py-1 transition-colors shadow-sm flex-shrink-0">
    <PlayerPortrait
      imgUrl={player.imgURL}
      face={(player as any).face}
      playerName={player.name}
      size={24}
    />
    <span className="text-xs font-bold text-white whitespace-nowrap">
      {player.name.charAt(0)}. {player.name.split(' ').slice(1).join(' ')}
    </span>
    <button onClick={onRemove} className="w-4 h-4 rounded-full bg-slate-500 hover:bg-rose-500 flex items-center justify-center text-white transition-colors">
      <X size={10} />
    </button>
  </div>
);

// Pick pill with the ORIGINAL owner's logo so it's visible who the pick came from.
const OutgoingPickPill = ({ pick, teams, onRemove, currentYear, lotterySlotByTid }: { pick: DraftPick, teams: NBATeam[], onRemove: () => void, currentYear: number, lotterySlotByTid?: Map<number, number> }) => {
  const origTeam = teams.find(t => t.id === pick.originalTid);
  const label = formatPickLabel(pick, currentYear, lotterySlotByTid, true);
  return (
    <div className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-full pl-1 pr-2 py-1 transition-colors shadow-sm flex-shrink-0">
      <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 p-0.5 flex items-center justify-center">
        {origTeam?.logoUrl
          ? <img src={origTeam.logoUrl} alt={origTeam.abbrev} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          : <span className="text-[8px] font-black text-indigo-300">{origTeam?.abbrev?.slice(0, 3) ?? 'PK'}</span>
        }
      </div>
      <span className="text-xs font-bold text-indigo-200 whitespace-nowrap">
        {pick.season} {label}{origTeam ? ` · ${origTeam.abbrev}` : ''}
      </span>
      <button onClick={onRemove} className="w-4 h-4 rounded-full bg-indigo-500/40 hover:bg-rose-500 flex items-center justify-center text-white transition-colors">
        <X size={10} />
      </button>
    </div>
  );
};

// HELPER: PlayerRow component
const PlayerRow = ({ player, isSelected, onToggle, formatContract, teams, disabled, currentSeason, moratoriumLockedUntil, isSuggested }: {
  player: NBAPlayer & { isIncoming?: boolean };
  isSelected: boolean;
  onToggle: () => void;
  formatContract: (amount: number) => string;
  teams: NBATeam[];
  disabled: boolean;
  currentSeason?: number;
  moratoriumLockedUntil?: string;
  /** AI's counter-offer suggestion — renders amber highlight to nudge the user toward adding this player. */
  isSuggested?: boolean;
}) => {
  const team = teams.find(t => t.id === player.tid);
  // Use current season stats if player has played (gp > 0), otherwise fall back to last season
  const currentSeasonStats = player.stats?.find(s => s.season === currentSeason);
  const seasonStats = (currentSeasonStats && (currentSeasonStats.gp ?? 0) > 0)
    ? currentSeasonStats
    : (player.stats?.filter(s => (s.gp ?? 0) > 0).at(-1) ?? currentSeasonStats);
  const gp = seasonStats?.gp || 0;
  const ppg = gp > 0 ? ((seasonStats!.pts ?? 0) / gp).toFixed(1) : '—';
  const rpg = gp > 0 ? ((seasonStats!.trb ?? 0) / gp).toFixed(1) : '—';
  const apg = gp > 0 ? ((seasonStats!.ast ?? 0) / gp).toFixed(1) : '—';

  const ovr = calcOvr2K(player);
  const pot = calcPot2K(player, currentSeason ?? new Date().getFullYear());
  const rowRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);

  const handleMouseEnter = () => {
    if (disabled || !rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    const cardW = 210;
    const left = rect.right + 8 + cardW > window.innerWidth ? rect.left - cardW - 8 : rect.right + 8;
    const cardH = 620;
    const centeredTop = rect.top + rect.height / 2 - cardH / 2;
    const top = Math.max(8, Math.min(centeredTop, window.innerHeight - cardH - 8));
    setCardPos({ top, left });
  };

  return (
    <div
      ref={rowRef}
      onClick={() => !disabled && onToggle()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setCardPos(null)}
      className={`group relative flex items-center p-3 border-b border-slate-700/30 transition-all duration-200
                  ${disabled ? 'opacity-40 cursor-not-allowed grayscale-[0.5]' : 'cursor-pointer'}
                  hover:bg-slate-800/50
                  ${isSelected ? 'bg-blue-600/10 border-l-4 border-l-blue-500' : ''}
                  ${player.isIncoming ? 'bg-emerald-600/10 border-l-4 border-l-emerald-500' : ''}
                  ${isSuggested && !isSelected && !player.isIncoming ? 'bg-amber-500/10 border-l-4 border-l-amber-500 ring-1 ring-amber-500/30' : ''}`}
    >
      {/* Portrait — no OVR badge; stats column carries OVR/POT instead */}
      <PlayerPortrait
        imgUrl={player.imgURL}
        face={(player as any).face}
        teamLogoUrl={team?.logoUrl}
        isIncoming={player.isIncoming}
        size={48}
        playerName={player.name}
      />

      {/* Player Info */}
      <div className="flex-1 ml-4 min-w-0">
          <div className="text-sm font-black text-white truncate group-hover:text-blue-400 transition-colors">{player.name}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{player.pos} • {player.contract?.exp} YRS</div>
          {moratoriumLockedUntil && (
            <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-amber-300">
              Moratorium until {moratoriumLockedUntil}
            </div>
          )}
          <div className="flex gap-3 mt-1 text-[9px] text-slate-500 font-mono">
              <span><strong className="text-slate-300">{ppg}</strong> PPG</span>
              <span><strong className="text-slate-300">{rpg}</strong> RPG</span>
              <span><strong className="text-slate-300">{apg}</strong> APG</span>
          </div>
      </div>

      {/* OVR / POT stack + Contract */}
      <div className="flex items-center gap-3">
          <div className="flex flex-col items-center leading-tight tabular-nums">
              <span className={`text-base font-black ${ovrTextColor(ovr)}`}>{ovr}</span>
              <span className={`text-xs font-bold ${getPotColor(pot)}`}>{pot}</span>
          </div>
          <div className="text-right">
              <div className="text-sm font-black text-white">{formatContract(player.contract?.amount || 0)}</div>
              <div className="text-[10px] font-bold text-slate-500">{player.contract?.exp} YRS LEFT</div>
          </div>
          <MoreVertical size={16} className="text-slate-600 group-hover:text-slate-400" />
      </div>
      {cardPos && (
        <div className="fixed z-[200] pointer-events-none" style={{ top: cardPos.top, left: cardPos.left }}>
          {SettingsManager.getSettings().tooltipStyle === 'simple'
            ? <PlayerHoverCard player={player} />
            : <PlayerHoverCardK2 player={player} />}
        </div>
      )}
    </div>
  );
};


export const TradeMachineModal: React.FC<TradeMachineModalProps> = ({
  onClose, onConfirm,
  initialTeamAId, initialTeamBId,
  initialTeamAPlayerIds, initialTeamBPlayerIds,
  initialTeamAPickDpids, initialTeamBPickDpids,
}) => {
  const { state } = useGame();
  const isGM = state.gameMode === 'gm';
  const [teamAId, setTeamAId] = useState<number | null>(isGM && state.userTeamId != null ? state.userTeamId : (initialTeamAId ?? null));
  const [teamBId, setTeamBId] = useState<number | null>(initialTeamBId ?? null);

  // Pre-load players/picks from Trade Finder if provided
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
  
  // Cash considerations — NBA cap $7.5M per team per season. Step $250K.
  const teamACashUsedUSD = ((state.teams.find(t => t.id === teamAId) as any)?.cashUsedInTrades ?? 0);
  const teamBCashUsedUSD = ((state.teams.find(t => t.id === teamBId) as any)?.cashUsedInTrades ?? 0);
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

  const formatContract = (amount: number) => `$${(amount / 1000).toFixed(1)}M`;

  // Calculate team standings (wins/losses for sorting)
  const teamsWithRecords = useMemo(() => {
    const nonRegularGids = new Set(
      state.schedule
        .filter(g => g.isPreseason || g.isPlayoff || g.isPlayIn)
        .map(g => g.gid)
    );

    const records: Record<number, { wins: number; losses: number }> = {};
    state.teams.forEach(t => { records[t.id] = { wins: 0, losses: 0 }; });

    state.boxScores
      .filter(g => !g.isAllStar && !g.isRisingStars && !g.isCelebrityGame && !nonRegularGids.has(g.gameId))
      .forEach(g => {
        const homeWon = g.homeScore > g.awayScore;
        if (records[g.homeTeamId]) homeWon ? records[g.homeTeamId].wins++ : records[g.homeTeamId].losses++;
        if (records[g.awayTeamId]) !homeWon ? records[g.awayTeamId].wins++ : records[g.awayTeamId].losses++;
      });

    return state.teams
      .map(t => ({ ...t, wins: records[t.id]?.wins || 0, losses: records[t.id]?.losses || 0 }))
      .sort((a, b) => b.wins - a.wins);
  }, [state.teams, state.boxScores, state.schedule]);

  const teamA = state.teams.find(t => t.id === teamAId);
  const teamB = state.teams.find(t => t.id === teamBId);

  // Memos for rosters and picks
  const teamARoster = useMemo(() => state.players
    .filter(p => p.tid === teamAId && !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || ''))
    .sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0)),
  [state.players, teamAId]);

  const teamBRoster = useMemo(() => state.players
    .filter(p => p.tid === teamBId && !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || ''))
    .sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0)),
  [state.players, teamBId]);

  const tradablePickCutoff = getMaxTradableSeason(state);
  const minTradableSeason = getMinTradableSeason(state);
  const tradablePicks = useMemo(() => getTradablePicks(state), [state.draftPicks, state.leagueStats?.year, state.leagueStats?.tradableDraftPickSeasons, (state as any).draftComplete]);
  const teamAPicksAvailable = useMemo(() => tradablePicks.filter(p => p.tid === teamAId), [tradablePicks, teamAId]);
  const teamBPicksAvailable = useMemo(() => tradablePicks.filter(p => p.tid === teamBId), [tradablePicks, teamBId]);

  const stepienOnGlobal = state.leagueStats?.stepienRuleEnabled !== false;
  const tradablePickSeasons = state.leagueStats?.tradableDraftPickSeasons ?? 7;
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

  const thresholds = useMemo(() => getCapThresholds(state.leagueStats), [state.leagueStats]);

  // ── Trade engine context (mirrors TradeFinderView) ─────────────────────────
  // Shared acceptance uses these; keep the inputs identical to Finder's so a
  // deal the Finder would return is also one the Machine will accept.
  const currentYearForEval = state.leagueStats?.year ?? new Date().getFullYear();
  const powerRanksMap = useMemo(() => teamPowerRanks(state.teams, currentYearForEval), [state.teams, currentYearForEval]);
  // Dynamic pick valuation inputs — rebuilt when prospect pool or lottery changes.
  const classStrengthByYear = useMemo(
    () => buildClassStrengthMap(state.players, currentYearForEval, currentYearForEval, tradablePickCutoff),
    [state.players, currentYearForEval, tradablePickCutoff],
  );
  const lotterySlotByTid = useMemo(
    () => buildFullDraftSlotMap((state as any).draftLotteryResult, state.teams),
    [(state as any).draftLotteryResult, state.teams],
  );
  const tvContext = useMemo(() => {
    const { month } = state.date ? getGameDateParts(state.date) : getGameDateParts(new Date());
    const isRegularSeason = (month >= 10 && month <= 12) || (month >= 1 && month <= 4);
    if (!isRegularSeason) return undefined;
    return { leaguePerAvg: computeLeaguePerAvg(state.players, currentYearForEval), isRegularSeason: true };
  }, [state.players, currentYearForEval, state.date]);
  const confStandings = useMemo(() => {
    const map = new Map<number, { confRank: number; gbFromLeader: number }>();
    for (const conf of ['East', 'West']) {
      const confTeams = state.teams.filter(t => t.conference === conf)
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
  }, [state.teams, currentYearForEval]);
  const teamOutlooks = useMemo(() => {
    const map = new Map<number, TradeOutlook>();
    state.teams.forEach(t => {
      const manual = resolveManualOutlook(t, state.gameMode, state.userTeamId);
      if (manual) { map.set(t.id, manual); return; }
      const payroll = getTeamPayrollUSD(state.players, t.id, t, currentYearForEval);
      const standings = confStandings.get(t.id);
      const expiring = state.players.filter(p => p.tid === t.id && (p.contract?.exp ?? 0) <= currentYearForEval).length;
      const rec = effectiveRecord(t, currentYearForEval);
      const starAvg = topNAvgK2(state.players, t.id, 3);
      map.set(t.id, getTradeOutlook(
        payroll, rec.wins, rec.losses, expiring, thresholds,
        standings?.confRank, standings?.gbFromLeader, starAvg,
      ));
    });
    return map;
  }, [state.teams, state.players, thresholds, confStandings, currentYearForEval, state.gameMode, state.userTeamId]);

  const salaryMismatchInfo = useMemo(() => {
    if (!teamA || !teamB) return null;
    const cba = validateCBATradeRules({
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAPlayers,
      teamBPlayers,
      teamAPicks,
      teamBPicks,
      teamACashUSD,
      teamBCashUSD,
      teams: state.teams,
      players: state.players,
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
        state.leagueStats?.tradableDraftPickSeasons ?? 7,
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
  }, [teamA, teamB, teamAPlayers, teamBPlayers, teamAPicks, teamBPicks, teamACashUSD, teamBCashUSD, state.teams, state.players, state.leagueStats, state.date, state.draftPicks, currentYearForEval]);

  const handleConfirm = () => {
    if (teamAId !== null && teamBId !== null) setShowSummaryModal(true);
  };

  const handleExecuteTrade = (force: boolean) => {
    if (teamAId === null || teamBId === null) return;

    // GM Mode: evaluate whether the other team accepts
    if (isGM && !force) {
      const currentYear = currentYearForEval;
      const otherTeam = state.teams.find(t => t.id === teamBId);
      const otherGMName = otherTeam ? `${otherTeam.name} GM` : 'Their GM';

      // Single source of truth — same evaluator the Trade Finder uses to gate
      // offers, so a deal Finder would surface is also one Machine will accept.
      const tradeDifficulty = SettingsManager.getSettings().tradeDifficulty ?? 50;
      const result = evaluateTradeAcceptance({
        fromTid: teamAId,
        toTid: teamBId,
        fromItems: [
          ...teamAPlayers.map(p => ({ type: 'player' as const, player: p })),
          ...teamAPicks.map(pk => ({ type: 'pick' as const, pick: pk })),
        ],
        toItems: [
          ...teamBPlayers.map(p => ({ type: 'player' as const, player: p })),
          ...teamBPicks.map(pk => ({ type: 'pick' as const, pick: pk })),
        ],
        teams: state.teams,
        currentYear,
        powerRanks: powerRanksMap,
        teamOutlooks,
        tvContext,
        tradeDifficulty,
        classStrengthByYear,
        lotterySlotByTid,
        toTeamRoster: state.players.filter(p => p.tid === teamBId),
        maxRoster: state.leagueStats?.maxStandardPlayersPerTeam ?? 15,
        leagueStats: state.leagueStats,
        currentDate: state.date,
        allPlayers: state.players,
        fromCashUSD: teamACashUSD,
        toCashUSD: teamBCashUSD,
      });

      const { accepted, reason, shortfall } = result;

      // On rejection, suggest 1-3 user-side additions that would close the gap.
      // Greedy: pick the asset whose TV is closest to the remaining shortfall, repeat.
      // Values user-side assets in fromTid's role mode — same frame as offerValue.
      let suggestion: string | undefined;
      const nextSuggestedPlayers = new Set<string>();
      const nextSuggestedPicks = new Set<number>();
      if (!accepted) {
        const fromMode: TeamMode = roleToMode(teamOutlooks.get(teamAId)?.role ?? 'neutral');
        const gap = shortfall + 5; // small buffer so the next eval clears the ratio threshold
        const userRoster = state.players.filter(p =>
          p.tid === teamAId && !teamAPlayers.some(x => x.internalId === p.internalId)
        );
        const userPicks = state.draftPicks.filter(pk =>
          pk.tid === teamAId && !teamAPicks.some(x => x.dpid === pk.dpid)
        );
        type Candidate = { kind: 'player' | 'pick'; id: string | number; name: string; tv: number };
        const candidates: Candidate[] = [
          ...userRoster.map<Candidate>(p => ({ kind: 'player', id: p.internalId, name: p.name, tv: calcPlayerTV(p, fromMode, currentYear, tvContext) })),
          ...userPicks.map<Candidate>(pk => ({ kind: 'pick', id: pk.dpid, name: formatPickLabel(pk, currentYear, lotterySlotByTid, false), tv: calcPickTV(pk.round, powerRanksMap.get(pk.originalTid) ?? Math.ceil(state.teams.length / 2), state.teams.length, Math.max(1, pk.season - currentYear), { classStrength: classStrengthByYear.get(pk.season) ?? 1.0, actualSlot: pk.round === 1 && pk.season === currentYear ? lotterySlotByTid.get(pk.originalTid) : undefined }) })),
        ].filter(c => c.tv > 0);

        const picked: Candidate[] = [];
        let remaining = gap;
        for (let i = 0; i < 3 && remaining > 3; i++) {
          const chosen = candidates
            .filter(c => !picked.some(p => p.id === c.id))
            .sort((a, b) => Math.abs(a.tv - remaining) - Math.abs(b.tv - remaining))[0];
          if (!chosen) break;
          picked.push(chosen);
          remaining -= chosen.tv;
        }

        if (picked.length > 0) {
          const names = picked.map(p => p.name);
          const formatted = names.length === 1
            ? names[0]
            : names.length === 2
              ? `${names[0]} and ${names[1]}`
              : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
          suggestion = `We'd work with this if you threw in ${formatted} on top.`;
          for (const c of picked) {
            if (c.kind === 'player') nextSuggestedPlayers.add(c.id as string);
            else nextSuggestedPicks.add(c.id as number);
          }
        }
      }

      setTradeResponse({ accepted, gmName: otherGMName, reason, suggestion });
      setSuggestedPlayerIds(nextSuggestedPlayers);
      setSuggestedPickIds(nextSuggestedPicks);
      // Close the summary modal behind the response overlay so there's one clean step.
      setShowSummaryModal(false);
      if (!accepted) return; // Don't execute if rejected — user can Go Back or End Negotiation
      return; // Acceptance still requires user to click Finalize in the response overlay
    }

    setShowSummaryModal(false);
    setTradeResponse(null);
    // Commissioner clicking "Force Trade" (salary mismatch / past deadline override) — tag the
    // payload so the action handler injects controversy seeds + morale/viewership hits.
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

        {/* ACTION BAR — fixed at bottom on both mobile and desktop so it's always reachable */}
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 lg:bottom-6 z-50 flex gap-2 sm:gap-4 bg-[#161616] p-2 rounded-2xl border border-slate-700 shadow-2xl w-[calc(100%-1.5rem)] max-w-xs sm:max-w-sm lg:max-w-none lg:w-auto">
            <button onClick={handleConfirm} disabled={!canClickAssets || teamAId === teamBId || teamAId == null || teamBId == null || (teamAPlayers.length === 0 && teamBPlayers.length === 0 && teamAPicks.length === 0 && teamBPicks.length === 0 && teamACashUSD === 0 && teamBCashUSD === 0)} className="flex-1 lg:flex-none px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl font-black text-xs uppercase bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-600/20">
                {teamAId === teamBId ? 'Same Team — Invalid' : 'Validate Deal'}
            </button>
            <button onClick={onClose} className="flex-1 lg:flex-none px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-black text-xs uppercase bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all">Close</button>
        </div>

        {/* MAIN 2-COLUMN WRAPPER */}
        <div className="w-full max-w-6xl h-[calc(100vh-9rem)] lg:h-[80vh] flex flex-col lg:flex-row gap-3 sm:gap-6 pb-4 lg:pb-0">
          
          {/* ======================= TEAM 1 COLUMN ======================= */}
          <div className="flex-1 flex flex-col bg-[#1e1e1e] border border-slate-700/50 rounded-2xl overflow-hidden relative shadow-2xl min-h-[50vh] lg:min-h-0">
            
            <div className="p-5 border-b border-slate-700/50 bg-[#161616]">
                <TeamDropdown 
                    label={isGM ? 'Your Team' : 'Team 1'}
                    selectedTeamId={teamAId}
                    onSelect={(id) => { if (!isGM) { setTeamAId(id); setTeamAPlayers([]); setTeamAPicks([]); } }}
                    teams={teamsWithRecords}
                    otherTeamId={teamBId}
                    isOpen={isGM ? false : openDropdown === 'A'}
                    onToggle={() => { if (!isGM) setOpenDropdown(openDropdown === 'A' ? null : 'A'); }}
                />
            </div>

            <div className="border-b border-slate-700/30 bg-[#161616]/50">
                <div className="flex items-center justify-between px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <span>Outgoing <strong className="text-white ml-2">-{formatContract(teamASalary)}</strong></span>
                        {(teamAPlayers.length > 0 || teamBPlayers.length > 0) && (
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                            salaryMismatchInfo?.team === 'A' ? 'bg-rose-900/60 text-rose-400' : 'bg-emerald-900/60 text-emerald-400'
                          }`}>
                            {salaryMismatchInfo?.team === 'A' ? '✗ Fix Salary' : '✓ Salary OK'}
                          </span>
                        )}
                    </div>
                    <ChevronUp size={14} className="opacity-30" />
                </div>
                {(teamAPlayers.length > 0 || teamAPicks.length > 0) && (
                    <div className="px-4 pb-4 overflow-x-auto custom-scrollbar">
                        <div className="flex gap-2 min-w-min">
                            {teamAPlayers.map(p => (
                                <OutgoingPill key={p.internalId} player={p} onRemove={() => setTeamAPlayers(teamAPlayers.filter(x => x.internalId !== p.internalId))} />
                            ))}
                            {teamAPicks.map(pk => (
                                <OutgoingPickPill key={pk.dpid} pick={pk} teams={state.teams} currentYear={currentYearForEval} lotterySlotByTid={lotterySlotByTid} onRemove={() => setTeamAPicks(teamAPicks.filter(x => x.dpid !== pk.dpid))} />
                            ))}
                        </div>
                    </div>
                )}
                {teamAId !== null && (
                  <div className="px-4 pb-3 flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Cash:</span>
                    <input
                      type="range" min={0} max={teamACashCapRemaining} step={250_000}
                      value={Math.min(teamACashUSD, teamACashCapRemaining)}
                      onChange={e => setTeamACashUSD(parseInt(e.target.value, 10))}
                      className="flex-1 accent-indigo-500"
                    />
                    <span className={`tabular-nums ${teamACashUSD > 0 ? 'text-emerald-300' : 'text-slate-600'}`}>
                      ${(teamACashUSD / 1_000_000).toFixed(2)}M
                    </span>
                    <span className="text-[9px] text-slate-600">cap left ${(teamACashCapRemaining / 1_000_000).toFixed(1)}M</span>
                  </div>
                )}
            </div>

            <div className="border-b border-slate-700/30 bg-[#161616]/50 p-2 flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">
                <span>Incoming <strong className="text-indigo-400 ml-2">+{formatContract(teamBSalary)}</strong></span>
                <ChevronDown size={14} className="opacity-30" />
            </div>

            <div className="flex gap-6 px-5 pt-4 border-b border-slate-700/50 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                <button onClick={() => setActiveTabA('roster')} className={`pb-3 transition-all ${activeTabA === 'roster' ? 'border-b-2 border-white text-white' : 'hover:text-slate-300'}`}>Roster ({displayTeamARoster.length})</button>
                <button onClick={() => setActiveTabA('picks')} className={`pb-3 transition-all ${activeTabA === 'picks' ? 'border-b-2 border-white text-white' : 'hover:text-slate-300'}`}>Picks ({teamAPicksAvailable.length})</button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1a1a1a]">
                {activeTabA === 'roster' ? (
                    displayTeamARoster.map(player => {
                      const isSel = teamAPlayers.some(x => x.internalId === player.internalId);
                      const moratoriumLocked = !isSel && !(player as any).isIncoming
                        && state.leagueStats?.postSigningMoratoriumEnabled !== false
                        && !isTradeEligible(player, rslCtx.currentDate, rslCtx.leagueStats as any);
                      const walking = !isSel && !(player as any).isIncoming
                        && (isWalkingExpiring(player, state.leagueStats?.year ?? new Date().getFullYear(), postDeadlinePreFA)
                          || isRecentlySignedLocked(player, rslCtx.currentDate, rslCtx.leagueStats)
                          || moratoriumLocked);
                      return (
                        <PlayerRow
                            key={player.internalId}
                            player={player}
                            isSelected={isSel}
                            isSuggested={suggestedPlayerIds.has(player.internalId)}
                            onToggle={() => {
                              // Incoming (from team B) → clicking UNDOES the inclusion on team B's side.
                              // Native + selected → remove from this team's outgoing.
                              // Native + unselected → add to this team's outgoing.
                              if ((player as any).isIncoming) {
                                setTeamBPlayers(teamBPlayers.filter(x => x.internalId !== player.internalId));
                              } else if (teamAPlayers.some(x => x.internalId === player.internalId)) {
                                setTeamAPlayers(teamAPlayers.filter(x => x.internalId !== player.internalId));
                              } else {
                                setTeamAPlayers([...teamAPlayers, player]);
                              }
                            }}
                            formatContract={formatContract}
                            teams={state.teams}
                            disabled={!canClickAssets || walking}
                            currentSeason={state.leagueStats.year}
                            moratoriumLockedUntil={moratoriumLocked ? (player as any).tradeEligibleDate : undefined}
                        />
                      );
                    })
                ) : (
                    <div className="p-4 space-y-2">
                        {teamAPicksAvailable.map(pick => {
                            const isSelected = teamAPicks.some(p => p.dpid === pick.dpid);
                            const isSuggested = suggestedPickIds.has(pick.dpid);
                            const origTeam = state.teams.find(t => t.id === pick.originalTid);
                            const stepienBlocks = !isSelected && stepienBlockedA.has(pick.dpid);
                            const disabled = !canClickAssets || stepienBlocks;
                            return (
                                <button
                                    key={pick.dpid}
                                    disabled={disabled}
                                    title={stepienBlocks ? 'Stepien Rule — would leave this team with no 1st in two straight future drafts.' : undefined}
                                    onClick={() => isSelected ? setTeamAPicks(teamAPicks.filter(p => p.dpid !== pick.dpid)) : setTeamAPicks([...teamAPicks, pick])}
                                    className={`w-full flex items-center gap-4 p-3 rounded-xl border-2 transition-all ${
                                      stepienBlocks ? 'bg-slate-950/60 border-slate-800/60 opacity-40 grayscale cursor-not-allowed'
                                        : isSelected ? 'bg-blue-600/10 border-blue-500/50'
                                        : isSuggested ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                                        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                                    }`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center p-2 shadow-inner flex-shrink-0">
                                        <img src={origTeam?.logoUrl} alt="" className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="text-sm font-black text-white uppercase tracking-tight">{formatPickLabel(pick, currentYearForEval, lotterySlotByTid, false).toUpperCase()}</div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                          {stepienBlocks ? <span className="text-rose-400">Stepien Rule</span> : <>Via {origTeam?.name}</>}
                                        </div>
                                    </div>
                                    {isSelected && <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
          </div>

          {/* ======================= TEAM 2 COLUMN ======================= */}
          <div className="flex-1 flex flex-col bg-[#1e1e1e] border border-slate-700/50 rounded-2xl overflow-hidden relative shadow-2xl min-h-[50vh] lg:min-h-0">
            
            <div className="p-5 border-b border-slate-700/50 bg-[#161616]">
                <TeamDropdown 
                    label="Team 2" 
                    selectedTeamId={teamBId} 
                    onSelect={(id) => { setTeamBId(id); setTeamBPlayers([]); setTeamBPicks([]); }} 
                    teams={teamsWithRecords} 
                    otherTeamId={teamAId}
                    isOpen={openDropdown === 'B'}
                    onToggle={() => setOpenDropdown(openDropdown === 'B' ? null : 'B')}
                />
            </div>

            <div className="border-b border-slate-700/30 bg-[#161616]/50">
                <div className="flex items-center justify-between px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <span>Outgoing <strong className="text-white ml-2">-{formatContract(teamBSalary)}</strong></span>
                        {(teamAPlayers.length > 0 || teamBPlayers.length > 0) && (
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                            salaryMismatchInfo?.team === 'B' ? 'bg-rose-900/60 text-rose-400' : 'bg-emerald-900/60 text-emerald-400'
                          }`}>
                            {salaryMismatchInfo?.team === 'B' ? '✗ Fix Salary' : '✓ Salary OK'}
                          </span>
                        )}
                    </div>
                    <ChevronUp size={14} className="opacity-30" />
                </div>
                {(teamBPlayers.length > 0 || teamBPicks.length > 0) && (
                    <div className="px-4 pb-4 overflow-x-auto custom-scrollbar">
                        <div className="flex gap-2 min-w-min">
                            {teamBPlayers.map(p => (
                                <OutgoingPill key={p.internalId} player={p} onRemove={() => setTeamBPlayers(teamBPlayers.filter(x => x.internalId !== p.internalId))} />
                            ))}
                            {teamBPicks.map(pk => (
                                <OutgoingPickPill key={pk.dpid} pick={pk} teams={state.teams} currentYear={currentYearForEval} lotterySlotByTid={lotterySlotByTid} onRemove={() => setTeamBPicks(teamBPicks.filter(x => x.dpid !== pk.dpid))} />
                            ))}
                        </div>
                    </div>
                )}
                {teamBId !== null && (
                  <div className="px-4 pb-3 flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Cash:</span>
                    <input
                      type="range" min={0} max={teamBCashCapRemaining} step={250_000}
                      value={Math.min(teamBCashUSD, teamBCashCapRemaining)}
                      onChange={e => setTeamBCashUSD(parseInt(e.target.value, 10))}
                      className="flex-1 accent-indigo-500"
                    />
                    <span className={`tabular-nums ${teamBCashUSD > 0 ? 'text-emerald-300' : 'text-slate-600'}`}>
                      ${(teamBCashUSD / 1_000_000).toFixed(2)}M
                    </span>
                    <span className="text-[9px] text-slate-600">cap left ${(teamBCashCapRemaining / 1_000_000).toFixed(1)}M</span>
                  </div>
                )}
            </div>

            <div className="border-b border-slate-700/30 bg-[#161616]/50 p-2 flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">
                <span>Incoming <strong className="text-indigo-400 ml-2">+{formatContract(teamASalary)}</strong></span>
                <ChevronDown size={14} className="opacity-30" />
            </div>

            <div className="flex gap-6 px-5 pt-4 border-b border-slate-700/50 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                <button onClick={() => setActiveTabB('roster')} className={`pb-3 transition-all ${activeTabB === 'roster' ? 'border-b-2 border-white text-white' : 'hover:text-slate-300'}`}>Roster ({displayTeamBRoster.length})</button>
                <button onClick={() => setActiveTabB('picks')} className={`pb-3 transition-all ${activeTabB === 'picks' ? 'border-b-2 border-white text-white' : 'hover:text-slate-300'}`}>Picks ({teamBPicksAvailable.length})</button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1a1a1a]">
                {activeTabB === 'roster' ? (
                    displayTeamBRoster.map(player => {
                      const isSel = teamBPlayers.some(x => x.internalId === player.internalId);
                      const moratoriumLocked = !isSel && !(player as any).isIncoming
                        && state.leagueStats?.postSigningMoratoriumEnabled !== false
                        && !isTradeEligible(player, rslCtx.currentDate, rslCtx.leagueStats as any);
                      const walking = !isSel && !(player as any).isIncoming
                        && (isWalkingExpiring(player, state.leagueStats?.year ?? new Date().getFullYear(), postDeadlinePreFA)
                          || isRecentlySignedLocked(player, rslCtx.currentDate, rslCtx.leagueStats)
                          || moratoriumLocked);
                      return (
                        <PlayerRow
                            key={player.internalId}
                            player={player}
                            isSelected={isSel}
                            onToggle={() => {
                              if ((player as any).isIncoming) {
                                setTeamAPlayers(teamAPlayers.filter(x => x.internalId !== player.internalId));
                              } else if (teamBPlayers.some(x => x.internalId === player.internalId)) {
                                setTeamBPlayers(teamBPlayers.filter(x => x.internalId !== player.internalId));
                              } else {
                                setTeamBPlayers([...teamBPlayers, player]);
                              }
                            }}
                            formatContract={formatContract}
                            teams={state.teams}
                            disabled={!canClickAssets || walking}
                            currentSeason={state.leagueStats.year}
                            moratoriumLockedUntil={moratoriumLocked ? (player as any).tradeEligibleDate : undefined}
                        />
                      );
                    })
                ) : (
                    <div className="p-4 space-y-2">
                        {teamBPicksAvailable.map(pick => {
                            const isSelected = teamBPicks.some(p => p.dpid === pick.dpid);
                            const origTeam = state.teams.find(t => t.id === pick.originalTid);
                            const stepienBlocks = !isSelected && stepienBlockedB.has(pick.dpid);
                            const disabled = !canClickAssets || stepienBlocks;
                            return (
                                <button
                                    key={pick.dpid}
                                    disabled={disabled}
                                    title={stepienBlocks ? 'Stepien Rule — would leave this team with no 1st in two straight future drafts.' : undefined}
                                    onClick={() => isSelected ? setTeamBPicks(teamBPicks.filter(p => p.dpid !== pick.dpid)) : setTeamBPicks([...teamBPicks, pick])}
                                    className={`w-full flex items-center gap-4 p-3 rounded-xl border-2 transition-all ${
                                      stepienBlocks ? 'bg-slate-950/60 border-slate-800/60 opacity-40 grayscale cursor-not-allowed'
                                        : isSelected ? 'bg-blue-600/10 border-blue-500/50'
                                        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                                    }`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center p-2 shadow-inner flex-shrink-0">
                                        <img src={origTeam?.logoUrl} alt="" className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="text-sm font-black text-white uppercase tracking-tight">{formatPickLabel(pick, currentYearForEval, lotterySlotByTid, false).toUpperCase()}</div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                          {stepienBlocks ? <span className="text-rose-400">Stepien Rule</span> : <>Via {origTeam?.name}</>}
                                        </div>
                                    </div>
                                    {isSelected && <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
          </div>
        </div>

        {/* GM Mode: Trade Response — signing-modal-style card with team logo eyebrow,
            big status headline, GM quote, and Go Back / End Negotiation / Finalize actions. */}
        {tradeResponse && (() => {
          const otherTeam = state.teams.find(t => t.id === teamBId);
          const accentRose = 'border-rose-500/30 text-rose-400';
          const accentEm = 'border-emerald-500/30 text-emerald-400';
          const borderCls = tradeResponse.accepted ? 'border-emerald-500/30' : 'border-rose-500/30';
          const headlineCls = tradeResponse.accepted ? 'text-emerald-400' : 'text-rose-400';
          const eyebrowCls = tradeResponse.accepted ? 'text-emerald-300' : 'text-rose-300';
          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className={`relative w-full max-w-md bg-[#0a0a0a] border ${borderCls} shadow-2xl rounded flex flex-col items-center text-center overflow-hidden`}
              >
                <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
                  {otherTeam?.logoUrl
                    ? <img src={otherTeam.logoUrl} className="h-32 object-contain z-10" alt={otherTeam.name} referrerPolicy="no-referrer" />
                    : <div className="h-24 w-24 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-black text-slate-400 z-10">{otherTeam?.abbrev ?? 'AI'}</div>
                  }
                </div>
                <div className="p-8 w-full flex flex-col items-center relative z-20">
                  <p className={`text-[10px] font-black uppercase tracking-[0.4em] mb-2 ${eyebrowCls}`}>
                    {otherTeam?.region} {otherTeam?.name} Front Office
                  </p>
                  <h2 className={`text-2xl font-black italic uppercase tracking-wider mb-1 ${headlineCls}`}>
                    {tradeResponse.accepted ? 'Noice doing business.' : 'No Deal'}
                  </h2>
                  <p className="text-[11px] font-bold text-white/50 mb-4">{tradeResponse.gmName}</p>
                  <p className="text-white/80 italic mb-3 leading-relaxed text-sm">
                    "{tradeResponse.reason}"
                  </p>
                  {/* AI's counter-suggestion — the specific assets that would close the gap.
                      These same ids are highlighted amber when user clicks Go Back. */}
                  {!tradeResponse.accepted && tradeResponse.suggestion && (
                    <p className="text-amber-300 italic text-sm mb-3 leading-relaxed bg-amber-500/5 border border-amber-500/20 rounded px-3 py-2">
                      "{tradeResponse.suggestion}"
                    </p>
                  )}
                  {!tradeResponse.accepted && (
                    <p className="text-white/50 text-xs mb-6 leading-relaxed">
                      Rework the offer, add future picks, or come back later when the market shifts.
                    </p>
                  )}
                  {tradeResponse.accepted && <div className="mb-5" />}
                  <div className="flex flex-col gap-2 w-full">
                    {tradeResponse.accepted ? (
                      <button
                        onClick={() => handleExecuteTrade(true)}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
                      >
                        Finalize Trade
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setTradeResponse(null)}
                          className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
                        >
                          Go Back — Tweak Offer
                        </button>
                        <button
                          onClick={() => { setTradeResponse(null); onClose(); }}
                          className="w-full py-3 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-300 font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
                        >
                          End Negotiation
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}

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
