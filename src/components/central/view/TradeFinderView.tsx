/**
 * TradeFinderView.tsx
 *
 * Trade Finder — connected to live game state.
 * Select assets → scans all 29 teams for matching return packages.
 * "Manage Trade" opens TradeMachineModal pre-loaded.
 */

import React, { useState, useMemo } from 'react';
import { Search, X, Loader2, ArrowLeftRight, TrendingUp, TrendingDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { TeamDropdown } from '../../shared/TeamDropdown';
import { TradeMachineModal } from '../../modals/TradeMachineModal';
import {
  calcOvr2K, calcPot2K, calcPlayerTV, calcPickTV,
  computeLeagueAvg, computeLeaguePerAvg, getPotColor, isSalaryLegal, isUntouchable,
  type TeamMode, type TVContext,
} from '../../../services/trade/tradeValueEngine';
import { getTradeOutlook, effectiveRecord, getCapThresholds, getTeamPayrollUSD, getTeamCapProfileFromState, topNAvgK2, resolveManualOutlook, type TradeOutlook } from '../../../utils/salaryUtils';
import { computeMoodScore } from '../../../utils/mood/moodScore';
import type { NBAPlayer, DraftPick, NBATeam } from '../../../types';
import { generateCounterOffers, teamPowerRanks } from '../../../services/trade/tradeFinderEngine';
import { SettingsManager } from '../../../services/SettingsManager';
import { getMinTradableSeason, getMaxTradableSeason, getTradablePicks } from '../../../services/draft/DraftPickGenerator';
import { buildClassStrengthMap, buildLotterySlotMap, buildFullDraftSlotMap, formatPickLabel } from '../../../services/draft/draftClassStrength';
import { tradeRoleToTeamMode, resolveTeamStrategyProfile } from '../../../utils/teamStrategy';
import { wouldStepienViolateForTid } from '../../../services/trade/stepienRule';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TradeItem {
  id: string;
  type: 'player' | 'pick' | 'absorb';
  label: string;
  val: number;
  player?: NBAPlayer;
  pick?: DraftPick;
  ovr?: number;
  pot?: number;
}

export interface FoundOffer {
  tid: number;
  items: TradeItem[];
  outlook: TradeOutlook;
  strategyLabel?: string;
  variant?: 'match' | 'dump' | 'absorb';
}

interface ManageTradeState {
  teamAId: number;
  teamBId: number;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  teamAPickDpids: number[];
  teamBPickDpids: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatSalaryM = (n: number) => `$${(n / 1000).toFixed(1)}M`;

function playerIndicators(player: NBAPlayer, team: NBATeam | undefined, dateStr: string): React.ReactNode {
  const { score } = computeMoodScore(player, team, dateStr);
  const emoji = score <= -3 ? '😤' : score >= 4 ? '😊' : '😐';
  const label = score <= -3 ? 'Wants out' : score >= 4 ? 'Happy / Loyal' : 'Neutral';
  const isInjured = (player as any).injury?.gamesRemaining > 0;
  const injuryType = (player as any).injury?.type ?? 'Injured';
  return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0 leading-none">
      <span title={`Mood: ${label} (${score > 0 ? '+' : ''}${score})`} className="text-[10px]">{emoji}</span>
      {isInjured && <span title={`Out — ${injuryType}`} className="text-[8px] font-black text-red-500">✚</span>}
    </span>
  );
}

// Tailwind color string for OVR value (no background, text only)
function ovrText(v: number): string {
  if (v >= 95) return 'text-violet-300';
  if (v >= 90) return 'text-blue-300';
  if (v >= 85) return 'text-emerald-300';
  if (v >= 78) return 'text-amber-300';
  if (v >= 72) return 'text-slate-300';
  return 'text-red-400';
}

// ── Player row ────────────────────────────────────────────────────────────────

const PlayerRow: React.FC<{
  player: NBAPlayer;
  selected: boolean;
  onToggle: () => void;
  team?: NBATeam;
  dateStr: string;
  currentYear: number;
}> = ({ player, selected, onToggle, team, dateStr, currentYear }) => {
  const ovr = calcOvr2K(player);
  const pot = calcPot2K(player, currentYear);
  const potColor = getPotColor(pot);
  const salary = player.contract?.amount ?? 0;
  const exp = player.contract?.exp ?? currentYear;

  return (
    <div
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-slate-800/50 transition-all duration-150
        ${selected ? 'bg-indigo-600/20 border-l-4 border-l-indigo-500' : 'hover:bg-slate-800/50'}`}
    >
      {/* Portrait — no overallRating prop so ribbon is suppressed */}
      <PlayerPortrait
        imgUrl={player.imgURL}
        face={(player as any).face}
        size={36}
        playerName={player.name}
      />

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-white truncate">{player.name}</span>
          {playerIndicators(player, team, dateStr)}
        </div>
        <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide truncate">
          {player.pos} · {player.born?.year ? currentYear - player.born.year : player.age ?? '?'}y
        </div>
      </div>

      {/* OVR — plain number, no pill */}
      <div className={`w-9 text-center text-xs font-black tabular-nums ${ovrText(ovr)}`}>{ovr}</div>

      {/* POT */}
      <div className={`w-9 text-center text-xs font-bold tabular-nums ${potColor}`}>{pot}</div>

      {/* Salary */}
      <div className="w-[68px] text-right">
        <div className="text-xs font-bold text-white tabular-nums">{formatSalaryM(salary)}</div>
        <div className="text-[9px] text-slate-500 tabular-nums">{exp}</div>
      </div>

      {selected && <X size={11} className="text-indigo-400 flex-shrink-0" />}
    </div>
  );
};

// ── Pick row ──────────────────────────────────────────────────────────────────

const PickRow: React.FC<{
  pick: DraftPick;
  selected: boolean;
  onToggle: () => void;
  originalTeam?: NBATeam;
  powerRank: number;
  totalTeams: number;
  currentYear: number;
  lotterySlotByTid?: Map<number, number>;
  stepienBlocked?: boolean;
}> = ({ pick, selected, onToggle, originalTeam, powerRank, totalTeams, currentYear, lotterySlotByTid, stepienBlocked }) => {
  const yearsFromNow = Math.max(1, pick.season - currentYear);
  const isNextYear = yearsFromNow <= 1;
  const isStale = yearsFromNow >= 3;
  const resolvedSlot = pick.round === 1 && pick.season === currentYear
    ? lotterySlotByTid?.get(pick.originalTid)
    : undefined;
  const labelShort = formatPickLabel(pick, currentYear, lotterySlotByTid, true);

  return (
    <div
      onClick={stepienBlocked ? undefined : onToggle}
      title={stepienBlocked ? 'Stepien Rule — would leave this team with no 1st in two straight future drafts.' : undefined}
      className={`flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/50 transition-all duration-150
        ${stepienBlocked ? 'opacity-40 grayscale cursor-not-allowed pointer-events-none'
          : selected ? 'bg-indigo-600/20 border-l-4 border-l-indigo-500 cursor-pointer'
          : 'hover:bg-slate-800/50 cursor-pointer'}`}
    >
      <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center p-1 flex-shrink-0">
        {originalTeam?.logoUrl
          ? <img src={originalTeam.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          : <div className="text-[9px] font-black text-slate-400">{originalTeam?.abbrev ?? '?'}</div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white">{pick.season} {labelShort}</div>
        <div className="text-[10px] text-slate-500 truncate">
          {stepienBlocked ? <span className="text-rose-400 font-black uppercase tracking-wider">Stepien Rule</span> : <>Via {originalTeam?.abbrev ?? '?'}</>}
        </div>
      </div>
      {/* Slot badge — exact when lottery resolved, projection otherwise */}
      {pick.round === 1 && resolvedSlot == null && (
        <div className="text-[9px] text-slate-500 font-mono flex-shrink-0 px-1">
          {(() => {
            const rankPct = totalTeams > 1 ? (powerRank - 1) / (totalTeams - 1) : 0.5;
            const mid = Math.round(1 + (1 - rankPct) * 29);
            const lo = Math.max(1, mid - 3);
            const hi = Math.min(30, mid + 3);
            return `~#${lo}–${hi}`;
          })()}
        </div>
      )}
      <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${
        isNextYear ? 'bg-indigo-900/50 text-indigo-300' :
        isStale   ? 'bg-slate-800 text-slate-500' :
                    'bg-slate-800/80 text-slate-400'
      }`}>
        {isNextYear ? <TrendingUp size={10} /> : isStale ? null : <TrendingDown size={10} />}
        {isNextYear ? 'Next' : `+${yearsFromNow}yr`}
      </div>
      {selected && <X size={11} className="text-indigo-400 flex-shrink-0" />}
    </div>
  );
};

// ── Offer item row ────────────────────────────────────────────────────────────
// Shared row used in both the main items list and the "For your:" ask section.
// Keeps visual consistency across TradeFinder and TradeProposals.

const OfferItemRow: React.FC<{
  item: TradeItem;
  teams: NBATeam[];
  dateStr: string;
  currentYear: number;
  /** 'ask' = render inside the rose "For your" panel (subtle color variant). */
  tone?: 'normal' | 'ask';
}> = ({ item, teams, dateStr, currentYear, tone = 'normal' }) => {
  const bg = tone === 'ask' ? 'bg-rose-900/20' : 'bg-slate-800/40';
  return (
    <div className={`flex items-center gap-2 ${bg} rounded-xl px-2.5 py-1.5`}>
      {item.type === 'absorb' ? (
        <>
          <div className="w-7 h-7 rounded-lg bg-emerald-900/50 border border-emerald-700/50 flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-black text-emerald-300">$</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black text-emerald-300 uppercase tracking-wider">Salary Dump</div>
            <div className="text-[10px] text-slate-500">Cap absorption — no players returned</div>
          </div>
        </>
      ) : item.type === 'player' && item.player ? (
        <>
          <PlayerPortrait imgUrl={item.player.imgURL} face={(item.player as any).face} size={28} playerName={item.player.name} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white truncate flex items-center gap-1">
              {item.player.name}
              {playerIndicators(item.player, teams.find(t => t.id === item.player!.tid), dateStr)}
            </div>
            <div className="text-[10px] text-slate-500">
              {item.player.pos}
              {(() => {
                const age = item.player.born?.year ? currentYear - item.player.born.year : item.player.age;
                return age ? <span> · {age}Y</span> : null;
              })()}
            </div>
          </div>
          <div className="flex flex-col items-end flex-shrink-0">
            <div className={`text-xs font-black tabular-nums ${ovrText(item.ovr ?? 70)}`}>{item.ovr ?? '—'}</div>
            <div className={`text-[10px] font-bold tabular-nums ${getPotColor(item.pot ?? 70)}`}>{item.pot ?? '—'}</div>
          </div>
          <div className="flex flex-col items-end flex-shrink-0 tabular-nums w-14">
            <div className="text-[11px] font-black text-white">{formatSalaryM(item.player.contract?.amount ?? 0)}</div>
            {item.player.contract?.exp && (
              <div className="text-[10px] text-slate-500">{item.player.contract.exp}</div>
            )}
          </div>
        </>
      ) : item.type === 'pick' && item.pick ? (
        <>
          <div className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center p-0.5 flex-shrink-0">
            {(() => {
              const origTeam = teams.find(t => t.id === item.pick!.originalTid);
              return origTeam?.logoUrl
                ? <img src={origTeam.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                : <div className="text-[8px] font-black text-indigo-400">{origTeam?.abbrev?.slice(0,3) ?? 'PK'}</div>;
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white">{item.label}</div>
          </div>
        </>
      ) : (
        <>
          <div className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center flex-shrink-0">
            <div className="text-[8px] font-black text-indigo-400">PK</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white">{item.label}</div>
          </div>
        </>
      )}
    </div>
  );
};

// ── Offer card ────────────────────────────────────────────────────────────────

export const OfferCard: React.FC<{
  offer: FoundOffer;
  myItems: TradeItem[];
  team?: NBATeam;
  teams: NBATeam[];
  currentYear: number;
  dateStr: string;
  capSpaceK?: number; // team's cap space in thousands; negative = over cap
  onManage: () => void;
  /** Optional reject handler — if provided, renders a Reject button next to Manage. */
  onReject?: () => void;
  /** When true, renders a "For your: ..." section showing what the other team is asking for. */
  showAsk?: boolean;
  /** When true, the Manage / Reject buttons in the footer are suppressed.
   *  Used by TradeSummaryModal which has its own Confirm Trade action. */
  hideActions?: boolean;
}> = ({ offer, myItems, team, teams, currentYear, dateStr, capSpaceK, onManage, onReject, showAsk, hideActions }) => {
  const mySalary = myItems.filter(i => i.type === 'player').reduce((s, i) => s + (i.player?.contract?.amount ?? 0), 0);
  const theirSalary = offer.items.filter(i => i.type === 'player').reduce((s, i) => s + (i.player?.contract?.amount ?? 0), 0);
  const bothHavePlayers = myItems.some(i => i.type === 'player') && offer.items.some(i => i.type === 'player');
  const salaryOk = !bothHavePlayers || isSalaryLegal(mySalary, theirSalary);
  const { outlook } = offer;
  const badgeLabel = offer.strategyLabel ?? outlook.label;
  const isAbsorb = offer.variant === 'absorb';
  // Cap space display — positive = "Xm avail", negative = "Xm over"
  const capLabel = capSpaceK === undefined ? null
    : capSpaceK >= 0
      ? `$${(capSpaceK / 1000).toFixed(1)}M avail`
      : `-$${(-capSpaceK / 1000).toFixed(1)}M over`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-slate-800/50">
        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 p-1 flex items-center justify-center flex-shrink-0">
          {team?.logoUrl && <img src={team.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-black text-white truncate">{team?.name}</div>
          <div className="text-[10px] text-slate-500">{(team as any)?.wins ?? 0}–{(team as any)?.losses ?? 0}</div>
        </div>
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg flex-shrink-0 ${outlook.bgColor} ${outlook.color}`}>
          {badgeLabel}
        </span>
      </div>

      {/* Outgoing section — what user gives up. Only shown in proposal/inbound view. */}
      {showAsk && myItems.length > 0 && (
        <div className="px-2 pt-2 pb-1 bg-rose-950/20 border-b border-rose-500/10 space-y-1">
          <div className="flex items-center gap-1.5 px-1 mb-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-rose-300 bg-rose-500/15 border border-rose-500/25 rounded px-1.5 py-0.5">
              ↗ Outgoing{mySalary > 0 && ` · ${formatSalaryM(mySalary)}`}
            </span>
          </div>
          {myItems.map(item => (
            <OfferItemRow key={item.id} item={item} teams={teams} dateStr={dateStr} currentYear={currentYear} tone="ask" />
          ))}
        </div>
      )}

      {/* Incoming section — what user receives. Always shown so trade finder cards
          get the same incoming/outgoing visual cue as proposal cards. */}
      <div className="flex-1 p-2 space-y-1">
        <div className="flex items-center gap-1.5 px-1 mb-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 rounded px-1.5 py-0.5">
            ↙ Incoming{theirSalary > 0 && ` · ${formatSalaryM(theirSalary)}`}
          </span>
        </div>
        {offer.items.map(item => (
          <OfferItemRow key={item.id} item={item} teams={teams} dateStr={dateStr} currentYear={currentYear} />
        ))}
      </div>

      {/* Footer */}
      <div className="p-2.5 border-t border-slate-800/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isAbsorb ? (
            <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-emerald-900/40 text-emerald-400">
              ✓ Cap Absorbs
            </span>
          ) : bothHavePlayers ? (
            <span className={`text-[9px] font-bold px-2 py-1 rounded-lg ${
              salaryOk ? 'bg-emerald-900/40 text-emerald-400' : 'bg-amber-900/40 text-amber-400'
            }`}>
              {salaryOk ? '✓ Salary OK' : '⚠ Salary Off'}
            </span>
          ) : null}
          {capLabel && (
            <span className={`text-[9px] font-bold px-2 py-1 rounded-lg tabular-nums ${
              (capSpaceK ?? 0) >= 0 ? 'bg-sky-900/40 text-sky-300' : 'bg-rose-900/40 text-rose-300'
            }`}>
              {capLabel}
            </span>
          )}
        </div>
        {!hideActions && (
          <div className="flex items-center gap-1.5">
            {onReject && (
              <button
                onClick={onReject}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-black uppercase tracking-wide transition-all"
              >
                <X size={11} />
                Reject
              </button>
            )}
            <button
              onClick={onManage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wide transition-all"
            >
              <ArrowLeftRight size={11} />
              Manage
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const TradeFinderView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const { players, teams, draftPicks } = state;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const isGM = state.gameMode === 'gm';
  const [selectedTid, setSelectedTid] = useState<number>(isGM && state.userTeamId != null ? state.userTeamId : (teams[0]?.id ?? 0));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'roster' | 'picks'>('roster');
  const [mobilePanel, setMobilePanel] = useState<'assets' | 'offers'>('assets');
  const [basket, setBasket] = useState<TradeItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [foundOffers, setFoundOffers] = useState<FoundOffer[] | null>(null);
  const [manageTrade, setManageTrade] = useState<ManageTradeState | null>(null);

  const powerRanks = useMemo(() => teamPowerRanks(teams, currentYear), [teams, currentYear]);
  // Dynamic pick valuation — class strength + post-lottery actual slot.
  const classStrengthByYear = useMemo(
    () => buildClassStrengthMap(players, currentYear, currentYear, getMaxTradableSeason(state)),
    [players, currentYear, state.leagueStats?.tradableDraftPickSeasons],
  );
  const lotterySlotByTid = useMemo(
    () => buildFullDraftSlotMap((state as any).draftLotteryResult, state.teams),
    [(state as any).draftLotteryResult, state.teams],
  );
  const leagueAvg = useMemo(() => computeLeagueAvg(players, teams), [players, teams]);
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

  // In-season PER adjustment context. Regular season = Oct-Apr. Auto-resets on
  // rollover because currentYear changes and per-season stats filter to []
  const tvContext: TVContext | undefined = useMemo(() => {
    const d = state.date ? new Date(state.date) : null;
    const month = d ? d.getMonth() + 1 : 0;
    const isRegularSeason = (month >= 10 && month <= 12) || (month >= 1 && month <= 4);
    if (!isRegularSeason) return undefined;
    return { leaguePerAvg: computeLeaguePerAvg(players, currentYear), isRegularSeason: true };
  }, [players, currentYear, state.date]);

  // Per-team cap space in thousands (matches salary units). Feeds the absorb
  // variant in the engine and the cap badge in OfferCard.
  const capSpaces = useMemo(() => {
    const map = new Map<number, number>();
    teams.forEach(t => {
      const profile = getTeamCapProfileFromState(state, t.id, thresholds);
      map.set(t.id, profile.capSpaceUSD / 1000); // cap profile is USD; basket salary is thousands
    });
    return map;
  }, [teams, players, thresholds, state]);

  // Conference standings for getTradeOutlook — uses effectiveRecord so offseason 0-0 falls back to last season
  const confStandings = useMemo(() => {
    const map = new Map<number, { confRank: number; gbFromLeader: number }>();
    for (const conf of ['East', 'West']) {
      const confTeams = teams.filter(t => t.conference === conf).map(t => ({
        t, rec: effectiveRecord(t, currentYear),
      })).sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
      const leader = confTeams[0];
      const lw = leader?.rec.wins ?? 0;
      const ll = leader?.rec.losses ?? 0;
      confTeams.forEach(({ t, rec }, i) => {
        const gb = Math.max(0, ((lw - rec.wins) + (rec.losses - ll)) / 2);
        map.set(t.id, { confRank: i + 1, gbFromLeader: gb });
      });
    }
    return map;
  }, [teams, currentYear]);

  // Memoized TradeOutlook per team
  const teamOutlooks = useMemo(() => {
    const map = new Map<number, TradeOutlook>();
    teams.forEach(t => {
      const manual = resolveManualOutlook(t, state.gameMode, state.userTeamId);
      if (manual) { map.set(t.id, manual); return; }
      const payroll = getTeamPayrollUSD(players, t.id, t, currentYear);
      const standings = confStandings.get(t.id);
      const expiring = players.filter(p => p.tid === t.id && (p.contract?.exp ?? 0) <= currentYear).length;
      const rec = effectiveRecord(t, currentYear);
      const starAvg = topNAvgK2(players, t.id, 3);
      map.set(t.id, getTradeOutlook(
        payroll,
        rec.wins,
        rec.losses,
        expiring,
        thresholds,
        standings?.confRank,
        standings?.gbFromLeader,
        starAvg,
      ));
    });
    return map;
  }, [teams, players, thresholds, confStandings, currentYear, state.gameMode, state.userTeamId]);

  // Per-team strategy label (Contending / Win-Now / Retooling / Cap Clearing / Development / etc.)
  const teamStrategies = useMemo(() => {
    const map = new Map<number, string>();
    teams.forEach(t => {
      const profile = resolveTeamStrategyProfile({
        team: t,
        players,
        teams,
        leagueStats: state.leagueStats,
        currentYear,
        gameMode: state.gameMode,
        userTeamId: state.userTeamId,
      });
      map.set(t.id, profile.label);
    });
    return map;
  }, [teams, players, state.leagueStats, currentYear, state.gameMode, state.userTeamId]);

  // Map TradeRole → TeamMode for TV calculation
  const roleToMode = (role: string): TeamMode => {
    return tradeRoleToTeamMode(role);
  };

  const selectedTeam = teams.find(t => t.id === selectedTid);
  const teamsWithRecord = useMemo(() =>
    teams.map(t => ({ ...t, wins: (t as any).wins ?? 0, losses: (t as any).losses ?? 0 })),
  [teams]);

  const EXTERNAL = ['WNBA','Euroleague','PBA','B-League','G-League','Endesa','China CBA','NBL Australia'];

  const teamRoster = useMemo(() =>
    players.filter(p =>
      p.tid === selectedTid &&
      !EXTERNAL.includes(p.status ?? '') &&
      p.tid !== -2 && p.status !== 'Draft Prospect'
    ).sort((a, b) => b.overallRating - a.overallRating),
  [players, selectedTid]);

  const filteredRoster = useMemo(() =>
    teamRoster.filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
  [teamRoster, search]);

  const minTradableSeason = getMinTradableSeason(state);
  const tradablePicks = useMemo(() => getTradablePicks(state), [draftPicks, state.leagueStats?.year, state.leagueStats?.tradableDraftPickSeasons, (state as any).draftComplete]);
  const teamPicksList = useMemo(() =>
    tradablePicks.filter(pk => pk.tid === selectedTid).sort((a, b) => a.season - b.season || a.round - b.round),
  [tradablePicks, selectedTid]);

  const filteredPicks = useMemo(() =>
    teamPicksList.filter(pk => {
      const orig = teams.find(t => t.id === pk.originalTid);
      return !search || (orig?.name ?? '').toLowerCase().includes(search.toLowerCase()) || String(pk.season).includes(search);
    }),
  [teamPicksList, search, teams]);

  const basketIds = useMemo(() => new Set(basket.map(i => i.id)), [basket]);

  const mySalary = useMemo(() =>
    basket.filter(i => i.type === 'player').reduce((s, i) => s + (i.player?.contract?.amount ?? 0), 0),
  [basket]);

  const myMode = roleToMode(teamOutlooks.get(selectedTid)?.role ?? 'neutral');
  const isReverseMode = isGM && state.userTeamId != null && selectedTid !== state.userTeamId;

  const addPlayer = (player: NBAPlayer) => {
    if (basketIds.has(player.internalId)) return removeItem(player.internalId);
    // Untouchable tax — reverse mode only. Tiered by raw TV so the big hammer only
    // lands on genuine superstars. Ordinary untouchables (loyalty vets, rotation guys)
    // just cost a bit more; Giannis/Jokić tier becomes very hard to pry loose.
    let val = calcPlayerTV(player, myMode, currentYear, tvContext);
    if (isReverseMode && isUntouchable(player, myMode, currentYear)) {
      const tier = val >= 200 ? 0.60
                 : val >= 150 ? 0.30
                 : val >= 100 ? 0.15
                 :               0.10;
      val = Math.round(val * (1 + tier));
    }
    setBasket(b => [...b, {
      id: player.internalId,
      type: 'player',
      label: player.name,
      val,
      player,
      ovr: calcOvr2K(player),
      pot: calcPot2K(player, currentYear),
    }]);
    setFoundOffers(null);
  };

  const addPick = (pick: DraftPick) => {
    const key = String(pick.dpid);
    if (basketIds.has(key)) return removeItem(key);
    const rank = powerRanks.get(pick.originalTid) ?? Math.ceil(teams.length / 2);
    const classStrength = classStrengthByYear.get(pick.season) ?? 1.0;
    const actualSlot = pick.round === 1 && pick.season === currentYear
      ? lotterySlotByTid.get(pick.originalTid)
      : undefined;
    setBasket(b => [...b, {
      id: key,
      type: 'pick',
      label: formatPickLabel(pick, currentYear, lotterySlotByTid, false),
      val: calcPickTV(pick.round, rank, teams.length, Math.max(1, pick.season - currentYear), { classStrength, actualSlot }),
      pick,
    }]);
    setFoundOffers(null);
  };

  const removeItem = (id: string) => { setBasket(b => b.filter(i => i.id !== id)); setFoundOffers(null); };
  const clearBasket = () => { setBasket([]); setFoundOffers(null); };

  // Preselect handoff — PlayerActionsModal's "Trade Player" action drops a
  // { tid, playerId } slot in state, then routes the user here. Apply it once
  // (switch to that team, push the player into the basket), then clear the
  // slot so revisiting the view doesn't re-fire.
  React.useEffect(() => {
    const pre = (state as any).tradeFinderPreselect as { tid: number; playerId: string } | undefined;
    if (!pre) return;
    const player = players.find(p => p.internalId === pre.playerId && p.tid === pre.tid);
    if (player) {
      setSelectedTid(pre.tid);
      setBasket([{
        id: player.internalId,
        type: 'player',
        label: player.name,
        val: calcPlayerTV(player, roleToMode(teamOutlooks.get(pre.tid)?.role ?? 'neutral'), currentYear, tvContext),
        player,
        ovr: calcOvr2K(player),
        pot: calcPot2K(player, currentYear),
      }]);
      setFoundOffers(null);
    }
    dispatchAction({ type: 'UPDATE_STATE', payload: { tradeFinderPreselect: undefined } } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(state as any).tradeFinderPreselect]);

  // ── Enhanced Find Offers ──────────────────────────────────────────────────

  // Reverse mode: user is shopping another team's roster for a target. Engine
  // flips — counter-offers come from USER's team matching the selected team's basket TV.
  // (isReverseMode declared above before addPlayer so the untouchable tax can see it.)
  const [rejectionOpen, setRejectionOpen] = useState(false);
  // Owner-warning modal: fires in reverse mode when user tries to acquire a 10+yr
  // lifer (Curry/Draymond tier). Acknowledge = obey owner, no offers. Ignore = override.
  const [ownerWarningOpen, setOwnerWarningOpen] = useState(false);
  const [ownerWarningLifer, setOwnerWarningLifer] = useState<string | null>(null);
  // 'reverse' = user shopping another team's lifer (original flow)
  // 'own' = user trying to trade their OWN team's lifer (firing-threat variant)
  const [ownerWarningMode, setOwnerWarningMode] = useState<'reverse' | 'own'>('reverse');

  const findOffers = (allowLifers = false) => {
    if (basket.length === 0) return;

    // Lifer gate — fires in both reverse (shopping another team's lifer) and normal
    // (trying to move YOUR team's lifer). Copy differs: owner pleads vs fires you.
    if (!allowLifers) {
      const lifer = basket.find(item => {
        if (item.type !== 'player' || !item.player) return false;
        const p = item.player;
        const directYrs = (p as any).yearsWithTeam ?? 0;
        const statYrs = p.stats
          ? p.stats.filter((s: any) => s.tid === p.tid && !s.playoffs && (s.gp ?? 0) > 0).length
          : 0;
        return Math.max(directYrs, statYrs) >= 10;
      });
      if (lifer && (isReverseMode || isGM)) {
        setOwnerWarningLifer(lifer.label);
        setOwnerWarningMode(isReverseMode ? 'reverse' : 'own');
        setOwnerWarningOpen(true);
        return;
      }
    }

    setIsSearching(true);
    setFoundOffers(null);

    setTimeout(() => {
      const myVal = basket.reduce((s, i) => s + i.val, 0);

      // Use unified trade engine. In reverse mode, restrict counter-offer generation
      // to ONLY the user's team ("what can I give up to get these players?").
      const engineOffers = generateCounterOffers({
        fromTid: selectedTid,
        offerValue: myVal,
        usedIds: new Set(basket.map(i => i.id)),
        players,
        teams,
        draftPicks: tradablePicks,
        currentYear,
        minTradableSeason,
        powerRanks,
        teamOutlooks: teamOutlooks as any,
        tvContext,
        capSpaces,
        classStrengthByYear,
        lotterySlotByTid,
        targetTids: isReverseMode ? [state.userTeamId!] : undefined,
        tradeDifficulty: isGM ? (SettingsManager.getSettings().tradeDifficulty ?? 50) : undefined,
        // Star chase: if user is reverse-shopping a ≥150 TV target, their own untouchables
        // and young core become available in the counter-offer. Be careful what you wish for.
        bypassUntouchablesForTid: isReverseMode && myVal >= 140 ? state.userTeamId! : undefined,
        allowLifers,
        stepienEnabled: state.leagueStats?.stepienRuleEnabled !== false,
        tradablePickWindow: state.leagueStats?.tradableDraftPickSeasons ?? 7,
      });

      // Map engine results to UI format
      const offers: FoundOffer[] = engineOffers.map(o => ({
        tid: o.tid,
        items: o.items as TradeItem[],
        outlook: teamOutlooks.get(o.tid) ?? { role: 'neutral', label: 'Neutral', color: 'text-slate-400', bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: '' },
        strategyLabel: teamStrategies.get(o.tid),
        variant: o.variant,
      }));

      setFoundOffers(offers);
      setIsSearching(false);

      // Reverse mode with zero viable offers — selected team rejects (untouchable,
      // TV impossible, or user lacks pieces). Pop the rejection card.
      if (isReverseMode && offers.length === 0) {
        setRejectionOpen(true);
      }
    }, 80);
  };

  const handleManageTrade = (offer: FoundOffer) => {
    // Normal: basket is user's (teamA), offer is other team's (teamB).
    // Reverse: basket is SHOPPED team's players, offer is user's counter. TradeMachineModal
    // forces teamA=user in GM mode, so we must swap — otherwise both sides end up the same team.
    if (isReverseMode) {
      setManageTrade({
        teamAId: offer.tid,       // user's team (engine's target in reverse)
        teamBId: selectedTid,     // shopped team
        teamAPlayerIds: offer.items.filter(i => i.type === 'player').map(i => i.id),
        teamBPlayerIds: basket.filter(i => i.type === 'player').map(i => i.id),
        teamAPickDpids: offer.items.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!.dpid),
        teamBPickDpids: basket.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!.dpid),
      });
      return;
    }
    setManageTrade({
      teamAId: selectedTid,
      teamBId: offer.tid,
      teamAPlayerIds: basket.filter(i => i.type === 'player').map(i => i.id),
      teamBPlayerIds: offer.items.filter(i => i.type === 'player').map(i => i.id),
      teamAPickDpids: basket.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!.dpid),
      teamBPickDpids: offer.items.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!.dpid),
    });
  };

  const handleExecuteTrade = (payload: any) => {
    dispatchAction({ type: 'EXECUTIVE_TRADE', payload } as any);
    setManageTrade(null);
    clearBasket();
  };

  const selectedOutlook = teamOutlooks.get(selectedTid);

  return (
    <div className="h-full flex flex-col bg-[#0f172a] text-slate-200 overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg md:text-2xl font-black text-white uppercase tracking-tight">Trade Finder</h2>
            <p className="text-slate-500 text-[11px] font-medium mt-0.5 hidden sm:block">
              Select assets → scan all 29 teams for matching return packages
            </p>
          </div>
          {/* Mobile panel toggle */}
          <div className="flex lg:hidden gap-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setMobilePanel('assets')}
              className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase transition-all ${
                mobilePanel === 'assets' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              Assets{basket.length > 0 ? ` (${basket.length})` : ''}
            </button>
            <button
              onClick={() => setMobilePanel('offers')}
              className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase transition-all ${
                mobilePanel === 'offers' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              Offers{foundOffers ? ` (${foundOffers.length})` : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">

        {/* ── LEFT: Asset selector ── */}
        <div className={`flex-1 lg:flex-none lg:w-[380px] lg:flex-shrink-0 flex flex-col border-r border-slate-800 min-h-0
          ${mobilePanel === 'assets' ? 'flex' : 'hidden'} lg:flex`}>

          {/* Team picker (TeamDropdown) + search + tabs */}
          <div className="flex-shrink-0 p-3 border-b border-slate-800 space-y-2">
            <TeamDropdown
              label={isGM && selectedTid !== state.userTeamId ? 'Shopping (Reverse)' : 'Team'}
              selectedTeamId={selectedTid}
              onSelect={id => { setSelectedTid(id); clearBasket(); }}
              teams={teamsWithRecord}
              isOpen={dropdownOpen}
              onToggle={() => setDropdownOpen(v => !v)}
            />

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search players or picks..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
              <button onClick={() => setActiveTab('roster')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${activeTab === 'roster' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>
                Roster ({teamRoster.length})
              </button>
              <button onClick={() => setActiveTab('picks')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${activeTab === 'picks' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>
                Picks ({teamPicksList.length})
              </button>
            </div>

            {/* Column headers — only for roster tab */}
            {activeTab === 'roster' && (
              <div className="flex items-center gap-2 px-1">
                <div className="w-9 flex-shrink-0" />
                <div className="flex-1" />
                <div className="w-9 text-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">OVR</span>
                </div>
                <div className="w-9 text-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">POT</span>
                </div>
                <div className="w-[68px] text-right">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Salary</span>
                </div>
                <div className="w-3" />
              </div>
            )}
          </div>

          {/* Scrollable player / pick list */}
          <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
            {activeTab === 'roster' ? (
              filteredRoster.map(p => (
                <PlayerRow
                  key={p.internalId}
                  player={p}
                  selected={basketIds.has(p.internalId)}
                  onToggle={() => addPlayer(p)}
                  team={selectedTeam}
                  dateStr={state.date ?? ''}
                  currentYear={currentYear}
                />
              ))
            ) : (
              filteredPicks.map(pk => {
                const orig = teams.find(t => t.id === pk.originalTid);
                const rank = powerRanks.get(pk.originalTid) ?? Math.ceil(teams.length / 2);
                const isSelected = basketIds.has(String(pk.dpid));
                const stepienOn = state.leagueStats?.stepienRuleEnabled !== false;
                const basketPicks = basket.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!);
                const stepienBlocked = !isSelected && stepienOn && wouldStepienViolateForTid(
                  draftPicks ?? [], currentYear,
                  state.leagueStats?.tradableDraftPickSeasons ?? 7,
                  selectedTid, [...basketPicks, pk],
                );
                return (
                  <PickRow
                    key={pk.dpid}
                    pick={pk}
                    selected={isSelected}
                    onToggle={() => addPick(pk)}
                    originalTeam={orig}
                    powerRank={rank}
                    totalTeams={teams.length}
                    currentYear={currentYear}
                    lotterySlotByTid={lotterySlotByTid}
                    stepienBlocked={stepienBlocked}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT: Basket + Results ── */}
        <div className={`flex-1 flex flex-col min-h-0
          ${mobilePanel === 'offers' ? 'flex' : 'hidden'} lg:flex`}>

          {/* Basket */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-900/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-300 bg-rose-500/15 border border-rose-500/25 rounded px-2 py-0.5">
                  ↗ Outgoing · {basket.length} asset{basket.length !== 1 ? 's' : ''}{basket.length > 0 ? ` · ${formatSalaryM(mySalary)}` : ''}
                </span>
              </div>
              {basket.length > 0 && (
                <button onClick={clearBasket} className="text-[10px] text-slate-500 hover:text-white transition-colors uppercase tracking-wider font-bold">
                  Clear
                </button>
              )}
            </div>

            {basket.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {basket.map(item => (
                  <div key={item.id} className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-2 py-1 text-xs font-bold text-white">
                    {item.type === 'player' && item.player && (
                      <PlayerPortrait
                        imgUrl={item.player.imgURL}
                        face={(item.player as any).face}
                        playerName={item.player.name}
                        size={16}
                      />
                    )}
                    <span className="truncate max-w-[110px] text-[11px]">{item.label}</span>
                    <button onClick={() => removeItem(item.id)} className="w-3.5 h-3.5 bg-slate-600 hover:bg-rose-500 rounded-full flex items-center justify-center transition-colors flex-shrink-0">
                      <X size={7} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-600 italic py-1">
                Select players or picks from the roster to offer in a trade.
              </div>
            )}

            {/* Find Offers button — hidden on mobile (float button used instead) */}
            <button
              onClick={() => { findOffers(); setMobilePanel('offers'); }}
              disabled={basket.length === 0 || isSearching}
              className="hidden lg:flex w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest transition-all items-center justify-center gap-2"
            >
              {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              {isSearching ? 'Scanning League…' : 'Find Offers'}
            </button>
          </div>

          {/* Results — scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar p-4">
            {foundOffers === null ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600">
                <ArrowLeftRight size={28} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">Select assets and tap Find Offers</p>
              </div>
            ) : foundOffers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600">
                <p className="text-sm font-medium">No valid offers found.</p>
                <p className="text-xs mt-1 text-slate-700">Try adding more value or different asset types.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-black text-white uppercase tracking-widest">
                    {foundOffers.length} Offer{foundOffers.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[10px] text-slate-500">sorted by return value</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {foundOffers.map(offer => {
                    const offerTeam = teams.find(t => t.id === offer.tid);
                    return (
                      <OfferCard
                        key={`${offer.tid}-${offer.variant ?? 'match'}`}
                        offer={offer}
                        capSpaceK={capSpaces.get(offer.tid)}
                        myItems={basket}
                        team={offerTeam}
                        teams={teams}
                        currentYear={currentYear}
                        dateStr={state.date ?? ''}
                        onManage={() => handleManageTrade(offer)}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile floating Find Offers button */}
      <AnimatePresence>
        {basket.length > 0 && mobilePanel === 'assets' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <button
              onClick={() => { findOffers(); setMobilePanel('offers'); }}
              disabled={isSearching}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-black uppercase tracking-wider shadow-xl shadow-indigo-900/50 transition-all"
            >
              {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {isSearching ? 'Scanning…' : `Find Offers (${basket.length})`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline TradeMachineModal */}
      {manageTrade && (
        <TradeMachineModal
          onClose={() => setManageTrade(null)}
          onConfirm={handleExecuteTrade}
          initialTeamAId={manageTrade.teamAId}
          initialTeamBId={manageTrade.teamBId}
          initialTeamAPlayerIds={manageTrade.teamAPlayerIds}
          initialTeamBPlayerIds={manageTrade.teamBPlayerIds}
          initialTeamAPickDpids={manageTrade.teamAPickDpids}
          initialTeamBPickDpids={manageTrade.teamBPickDpids}
        />
      )}

      {/* Reverse-mode rejection card — selected team's front office says no. */}
      {/* Owner warning — lifer gate. In reverse mode, the shopped team's owner
          pleads. In normal mode (GM trying to move their OWN lifer), the owner
          threatens to fire the GM. Either way, Acknowledge obeys / Ignore overrides. */}
      {ownerWarningOpen && selectedTeam && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md bg-[#0a0a0a] border border-amber-500/30 shadow-2xl rounded flex flex-col items-center text-center overflow-hidden"
          >
            <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
              {selectedTeam.logoUrl
                ? <img src={selectedTeam.logoUrl} className="h-32 object-contain z-10" alt={selectedTeam.name} referrerPolicy="no-referrer" />
                : <div className="h-24 w-24 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-sm font-black text-amber-300 z-10">{selectedTeam.abbrev}</div>
              }
            </div>
            <div className="p-8 w-full flex flex-col items-center relative z-20">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-300 mb-2">Owner's Message</p>
              <h2 className="text-2xl font-black italic uppercase tracking-wider mb-4 text-amber-400">
                Do not touch {ownerWarningLifer}
              </h2>
              <p className="text-white/80 italic mb-2 leading-relaxed text-sm">
                {ownerWarningMode === 'own'
                  ? `"${ownerWarningLifer} built this franchise. He retires here, period. Don't even bring me an offer or I will fire you."`
                  : `"${ownerWarningLifer} built this franchise. He retires here, period. Don't even bring me an offer."`
                }
              </p>
              <p className="text-white/50 text-xs mb-8">— {selectedTeam.region} {selectedTeam.name} Ownership</p>
              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={() => { setOwnerWarningOpen(false); setOwnerWarningLifer(null); }}
                  className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
                >
                  Acknowledge — Respect the Legacy
                </button>
                <button
                  onClick={() => {
                    setOwnerWarningOpen(false);
                    setOwnerWarningLifer(null);
                    findOffers(true); // override — generate offers anyway
                  }}
                  className="w-full py-3 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-300 font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
                >
                  {ownerWarningMode === 'own' ? 'Ignore — Risk Getting Fired' : 'Ignore Message — Shop Anyway'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {rejectionOpen && selectedTeam && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md bg-[#0a0a0a] border border-rose-500/30 shadow-2xl rounded flex flex-col items-center text-center overflow-hidden"
          >
            <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
              {selectedTeam.logoUrl
                ? <img src={selectedTeam.logoUrl} className="h-32 object-contain z-10" alt={selectedTeam.name} referrerPolicy="no-referrer" />
                : <div className="h-24 w-24 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-sm font-black text-rose-300 z-10">{selectedTeam.abbrev}</div>
              }
            </div>
            <div className="p-8 w-full flex flex-col items-center relative z-20">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-300 mb-2">{selectedTeam.region} {selectedTeam.name} Front Office</p>
              <h2 className="text-2xl font-black italic uppercase tracking-wider mb-4 text-rose-400">No Deal</h2>
              <p className="text-white/80 italic mb-2 leading-relaxed text-sm">
                {(() => {
                  const names = basket.filter(i => i.type === 'player').map(i => i.label).slice(0, 2).join(' and ');
                  if (!names) return `We're not moving our assets for what your team can offer.`;
                  return `We're not moving ${names} for anything your roster can put together right now.`;
                })()}
              </p>
              <p className="text-white/60 text-xs mb-8">Rework your basket, add future picks, or come back later when the market shifts.</p>
              <button
                onClick={() => setRejectionOpen(false)}
                className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
              >
                Acknowledge
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
