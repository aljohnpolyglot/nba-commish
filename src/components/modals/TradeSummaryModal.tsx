/**
 * TradeSummaryModal — revamped to reuse OfferCard visuals from the Trade Proposals
 * flow. Two side-by-side OfferCards show each team's outgoing assets with the
 * same portrait/OVR/POT/salary layout used everywhere else.
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { NBAPlayer, DraftPick, NBATeam } from '../../types';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';
import { getTradeDeadlineDate, toISODateString } from '../../utils/dateUtils';
import {
  calcOvr2K, calcPot2K, calcPlayerTV, calcPickTV,
  type TeamMode,
} from '../../services/trade/tradeValueEngine';
import {
  getTradeOutlook, effectiveRecord, getCapThresholds,
  getTeamPayrollUSD, getTeamCapProfile, topNAvgK2,
  type TradeOutlook,
} from '../../utils/salaryUtils';
import { OfferCard, type FoundOffer, type TradeItem } from '../central/view/TradeFinderView';
import { buildClassStrengthMap, buildLotterySlotMap } from '../../services/draft/draftClassStrength';
import { getMaxTradableSeason } from '../../services/draft/DraftPickGenerator';
import { teamPowerRanks } from '../../services/trade/tradeFinderEngine';

interface TradeSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmTrade: () => void;
  onForceTrade: () => void;
  tradeDetails: {
    teamA: NBATeam;
    teamB: NBATeam;
    teamAPlayers: NBAPlayer[];
    teamBPlayers: NBAPlayer[];
    teamAPicks: DraftPick[];
    teamBPicks: DraftPick[];
    teamASentSalary: number;
    teamBSentSalary: number;
  };
  salaryMismatchInfo: { message: string; team: 'A' | 'B' } | null;
}

function roleToMode(role: string): TeamMode {
  if (role === 'heavy_buyer' || role === 'buyer') return 'contend';
  if (role === 'rebuilding') return 'presti';
  return 'rebuild';
}

function buildItems(
  players: NBAPlayer[],
  picks: DraftPick[],
  teamMode: TeamMode,
  currentYear: number,
  teams: NBATeam[],
  classStrengthByYear: Map<number, number>,
  lotterySlotByTid: Map<number, number>,
  powerRanks: Map<number, number>,
): TradeItem[] {
  const items: TradeItem[] = [];
  for (const p of players) {
    items.push({
      id: p.internalId,
      type: 'player',
      label: p.name,
      val: calcPlayerTV(p, teamMode, currentYear),
      player: p,
      ovr: calcOvr2K(p),
      pot: calcPot2K(p, currentYear),
    });
  }
  for (const pk of picks) {
    const owner = teams.find(t => t.id === pk.originalTid);
    const classStrength = classStrengthByYear.get(pk.season) ?? 1.0;
    const actualSlot = pk.round === 1 && pk.season === currentYear
      ? lotterySlotByTid.get(pk.originalTid)
      : undefined;
    // Use the original owner's rank — pick value reflects THEIR slot,
    // regardless of who currently holds it.
    const rank = powerRanks.get(pk.originalTid) ?? 15;
    items.push({
      id: String(pk.dpid),
      type: 'pick',
      label: `${pk.season} ${pk.round === 1 ? '1st' : '2nd'} Round${owner ? ` (via ${owner.abbrev})` : ''}`,
      val: calcPickTV(pk.round, rank, teams.length, Math.max(1, pk.season - currentYear), { classStrength, actualSlot }),
      pick: pk,
    });
  }
  return items;
}

export const TradeSummaryModal: React.FC<TradeSummaryModalProps> = ({
  isOpen,
  onClose,
  onConfirmTrade,
  onForceTrade,
  tradeDetails,
  salaryMismatchInfo,
}) => {
  if (!isOpen) return null;

  const { state } = useGame();
  const { teamA, teamB, teamAPlayers, teamBPlayers, teamAPicks, teamBPicks } = tradeDetails;

  const currentYear = state.leagueStats?.year ?? 2026;
  const isGM = state.gameMode === 'gm';
  const tradeIsValid = !salaryMismatchInfo;
  const seasonYear = currentYear;
  const tradeDeadline = toISODateString(getTradeDeadlineDate(seasonYear, state.leagueStats));
  const isPastDeadline = normalizeDate(state.date) > tradeDeadline;

  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

  // Compute outlook + mode + cap for each team for the OfferCard headers.
  const buildOutlook = (team: NBATeam): TradeOutlook => {
    const payroll = getTeamPayrollUSD(state.players, team.id);
    const rec = effectiveRecord(team, currentYear);
    const confTeams = state.teams.filter(t => t.conference === team.conference).map(t => ({
      t, rec: effectiveRecord(t, currentYear),
    })).sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
    const leader = confTeams[0];
    const lw = leader?.rec.wins ?? 0;
    const ll = leader?.rec.losses ?? 0;
    const idx = confTeams.findIndex(c => c.t.id === team.id);
    const confRank = idx >= 0 ? idx + 1 : 15;
    const gb = Math.max(0, ((lw - rec.wins) + (rec.losses - ll)) / 2);
    const expiring = state.players.filter(p => p.tid === team.id && (p.contract?.exp ?? 0) <= currentYear).length;
    const starAvg = topNAvgK2(state.players, team.id, 3);
    return getTradeOutlook(payroll, rec.wins, rec.losses, expiring, thresholds, confRank, gb, starAvg);
  };

  const teamAOutlook = buildOutlook(teamA);
  const teamBOutlook = buildOutlook(teamB);
  const teamAMode = roleToMode(teamAOutlook.role);
  const teamBMode = roleToMode(teamBOutlook.role);

  const teamACapK = getTeamCapProfile(state.players, teamA.id, (teamA as any).wins ?? 0, (teamA as any).losses ?? 0, thresholds).capSpaceUSD / 1000;
  const teamBCapK = getTeamCapProfile(state.players, teamB.id, (teamB as any).wins ?? 0, (teamB as any).losses ?? 0, thresholds).capSpaceUSD / 1000;

  const classStrengthByYear = useMemo(
    () => buildClassStrengthMap(state.players, currentYear, currentYear, getMaxTradableSeason(state)),
    [state.players, currentYear, state.leagueStats?.tradableDraftPickSeasons],
  );
  const lotterySlotByTid = useMemo(
    () => buildLotterySlotMap((state as any).draftLotteryResult),
    [(state as any).draftLotteryResult],
  );
  const powerRanks = useMemo(
    () => teamPowerRanks(state.teams, currentYear),
    [state.teams, currentYear],
  );

  const teamAItems = buildItems(teamAPlayers, teamAPicks, teamAMode, currentYear, state.teams, classStrengthByYear, lotterySlotByTid, powerRanks);
  const teamBItems = buildItems(teamBPlayers, teamBPicks, teamBMode, currentYear, state.teams, classStrengthByYear, lotterySlotByTid, powerRanks);

  const teamAOffer: FoundOffer = { tid: teamA.id, items: teamAItems, outlook: teamAOutlook, variant: 'match' };
  const teamBOffer: FoundOffer = { tid: teamB.id, items: teamBItems, outlook: teamBOutlook, variant: 'match' };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-2 sm:p-4 font-sans"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between rounded-t-2xl">
            <h3 className="text-lg font-black text-white uppercase tracking-tight">Trade Summary</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Past Trade Deadline Banner */}
          {isPastDeadline && (
            <div className="px-4 py-2 border-b border-amber-500/20 bg-amber-500/10 text-amber-400 flex items-center gap-2">
              <Clock size={14} />
              <span className="text-xs font-bold uppercase tracking-wide">Past Trade Deadline ({tradeDeadline})</span>
            </div>
          )}

          {/* Trade Status Banner */}
          <div className={`px-4 py-3 border-b ${
            tradeIsValid
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            <div className="flex items-center gap-3">
              {tradeIsValid ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <div>
                <div className="text-sm font-black">
                  {tradeIsValid
                    ? isPastDeadline ? 'Salaries Match — Past Deadline' : 'Trade Valid'
                    : isPastDeadline ? 'Past Deadline + Salary Mismatch' : 'Salary Mismatch'}
                </div>
                {salaryMismatchInfo?.message && (
                  <div className="text-xs mt-0.5 opacity-80">{salaryMismatchInfo.message}</div>
                )}
              </div>
            </div>
          </div>

          {/* Two-card body — reuses OfferCard visual language */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <OfferCard
                offer={teamAOffer}
                myItems={teamBItems}
                team={teamA}
                teams={state.teams}
                currentYear={currentYear}
                dateStr={state.date ?? ''}
                capSpaceK={teamACapK}
                hideActions
                onManage={() => {}}
              />
              <OfferCard
                offer={teamBOffer}
                myItems={teamAItems}
                team={teamB}
                teams={state.teams}
                currentYear={currentYear}
                dateStr={state.date ?? ''}
                capSpaceK={teamBCapK}
                hideActions
                onManage={() => {}}
              />
            </div>
          </div>

          {/* Footer buttons */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/50 rounded-b-2xl">
            {isPastDeadline && (
              <p className="text-amber-400/70 text-xs text-center mb-2">
                {tradeIsValid
                  ? 'Trade deadline has passed. Proceeding requires commissioner override.'
                  : 'Trade deadline has passed and salaries don\'t match. Force trade to override both.'}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-5 py-2 rounded-xl font-black text-xs uppercase tracking-widest bg-slate-800 hover:bg-slate-700 text-white transition-colors">
                Go Back
              </button>
              {tradeIsValid ? (
                <button
                  onClick={onConfirmTrade}
                  className={`px-5 py-2 rounded-xl font-black text-xs uppercase tracking-widest text-white transition-colors ${
                    isPastDeadline ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {isPastDeadline ? 'Override Deadline & Confirm' : 'Confirm Trade'}
                </button>
              ) : isGM ? (
                <span className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-rose-500/10 border border-rose-500/30 text-rose-300">
                  Fix Salary to Proceed
                </span>
              ) : (
                <button onClick={onForceTrade} className="px-5 py-2 rounded-xl font-black text-xs uppercase tracking-widest bg-rose-600 hover:bg-rose-500 text-white transition-colors">
                  {isPastDeadline ? 'Force Trade (Override All)' : 'Force Trade'}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
