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
  computeLeagueAvg, getPotColor, isSalaryLegal,
  type TeamMode,
} from '../../../services/trade/tradeValueEngine';
import { getTradeOutlook, effectiveRecord, getCapThresholds, getTeamPayrollUSD, topNAvgK2, type TradeOutlook } from '../../../utils/salaryUtils';
import { computeMoodScore } from '../../../utils/mood/moodScore';
import type { NBAPlayer, DraftPick, NBATeam } from '../../../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TradeItem {
  id: string;
  type: 'player' | 'pick';
  label: string;
  val: number;
  player?: NBAPlayer;
  pick?: DraftPick;
  ovr?: number;
  pot?: number;
}

interface FoundOffer {
  tid: number;
  items: TradeItem[];
  outlook: TradeOutlook;
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

// Uses effectiveRecord so offseason pick values reflect last season's W-L, not 0-0.
// In-season (gp ≥ 10): 60% win-pct + 40% roster strength.
// Offseason (gp < 10): falls back to last-season W-L via effectiveRecord.
function teamPowerRanks(teams: NBATeam[], currentYear: number): Map<number, number> {
  const sorted = [...teams].sort((a, b) => {
    const recA = effectiveRecord(a, currentYear);
    const recB = effectiveRecord(b, currentYear);
    const wpA = (recA.wins + recA.losses) > 0 ? recA.wins / (recA.wins + recA.losses) : 0.5;
    const wpB = (recB.wins + recB.losses) > 0 ? recB.wins / (recB.wins + recB.losses) : 0.5;
    const scoreA = wpA * 0.6 + ((a as any).strength ?? 50) / 100 * 0.4;
    const scoreB = wpB * 0.6 + ((b as any).strength ?? 50) / 100 * 0.4;
    return scoreB - scoreA;
  });
  const map = new Map<number, number>();
  sorted.forEach((t, i) => map.set(t.id, i + 1));
  return map;
}

function moodDot(player: NBAPlayer, team: NBATeam | undefined, dateStr: string): React.ReactNode {
  const { score } = computeMoodScore(player, team, dateStr);
  const color = score <= -3 ? 'bg-emerald-400' : score >= 4 ? 'bg-red-400' : 'bg-slate-600';
  const label = score <= -3 ? 'Wants out' : score >= 4 ? 'Happy / Loyal' : 'Neutral';
  return (
    <span
      title={`Mood: ${label} (${score > 0 ? '+' : ''}${score})`}
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`}
    />
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
        size={36}
        playerName={player.name}
      />

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-white truncate">{player.name}</span>
          {moodDot(player, team, dateStr)}
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
}> = ({ pick, selected, onToggle, originalTeam, powerRank, totalTeams, currentYear }) => {
  const yearsFromNow = Math.max(1, pick.season - currentYear);
  const isNextYear = yearsFromNow <= 1;
  const isStale = yearsFromNow >= 3;

  return (
    <div
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-slate-800/50 transition-all duration-150
        ${selected ? 'bg-indigo-600/20 border-l-4 border-l-indigo-500' : 'hover:bg-slate-800/50'}`}
    >
      <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center p-1 flex-shrink-0">
        {originalTeam?.logoUrl
          ? <img src={originalTeam.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          : <div className="text-[9px] font-black text-slate-400">{originalTeam?.abbrev ?? '?'}</div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white">{pick.season} {pick.round === 1 ? '1st' : '2nd'} Rd</div>
        <div className="text-[10px] text-slate-500 truncate">Via {originalTeam?.abbrev ?? '?'}</div>
      </div>
      {/* Estimated slot range badge */}
      {pick.round === 1 && (
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

// ── Offer card ────────────────────────────────────────────────────────────────

const OfferCard: React.FC<{
  offer: FoundOffer;
  myItems: TradeItem[];
  team?: NBATeam;
  teams: NBATeam[];
  currentYear: number;
  onManage: () => void;
}> = ({ offer, myItems, team, teams, currentYear, onManage }) => {
  const mySalary = myItems.filter(i => i.type === 'player').reduce((s, i) => s + (i.player?.contract?.amount ?? 0), 0);
  const theirSalary = offer.items.filter(i => i.type === 'player').reduce((s, i) => s + (i.player?.contract?.amount ?? 0), 0);
  const bothHavePlayers = myItems.some(i => i.type === 'player') && offer.items.some(i => i.type === 'player');
  const salaryOk = !bothHavePlayers || isSalaryLegal(mySalary, theirSalary);
  const { outlook } = offer;

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
          <div className="text-xs font-black text-white truncate">{team?.region} {team?.name}</div>
          <div className="text-[10px] text-slate-500">{(team as any)?.wins ?? 0}–{(team as any)?.losses ?? 0}</div>
        </div>
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg flex-shrink-0 ${outlook.bgColor} ${outlook.color}`}>
          {outlook.label}
        </span>
      </div>

      {/* Items */}
      <div className="flex-1 p-2 space-y-1">
        {offer.items.map(item => (
          <div key={item.id} className="flex items-center gap-2 bg-slate-800/40 rounded-xl px-2.5 py-1.5">
            {item.type === 'player' && item.player ? (
              <>
                <PlayerPortrait imgUrl={item.player.imgURL} size={28} playerName={item.player.name} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">{item.player.name}</div>
                  <div className="text-[10px] text-slate-500">{item.player.pos}</div>
                </div>
                {/* OVR + POT */}
                <div className="flex flex-col items-end flex-shrink-0">
                  <div className={`text-xs font-black tabular-nums ${ovrText(item.ovr ?? 70)}`}>{item.ovr ?? '—'}</div>
                  <div className={`text-[10px] font-bold tabular-nums ${getPotColor(item.pot ?? 70)}`}>{item.pot ?? '—'}</div>
                </div>
                <div className="text-[10px] text-slate-500 tabular-nums w-12 text-right flex-shrink-0">
                  {formatSalaryM(item.player.contract?.amount ?? 0)}
                </div>
              </>
            ) : item.type === 'pick' && item.pick ? (
              <>
                {/* Use original owner's logo instead of "PK" */}
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
                <div className="text-[10px] text-indigo-400 font-bold flex-shrink-0">
                  {item.pick.round === 1 ? '1st' : '2nd'}
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
        ))}
      </div>

      {/* Footer */}
      <div className="p-2.5 border-t border-slate-800/50 flex items-center justify-between gap-2">
        {bothHavePlayers && (
          <span className={`text-[9px] font-bold px-2 py-1 rounded-lg ${
            salaryOk ? 'bg-emerald-900/40 text-emerald-400' : 'bg-amber-900/40 text-amber-400'
          }`}>
            {salaryOk ? '✓ Salary OK' : '⚠ Salary Off'}
          </span>
        )}
        {!bothHavePlayers && <div />}
        <button
          onClick={onManage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wide transition-all"
        >
          <ArrowLeftRight size={11} />
          Manage
        </button>
      </div>
    </motion.div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const TradeFinderView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const { players, teams, draftPicks } = state;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const [selectedTid, setSelectedTid] = useState<number>(teams[0]?.id ?? 0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'roster' | 'picks'>('roster');
  const [mobilePanel, setMobilePanel] = useState<'assets' | 'offers'>('assets');
  const [basket, setBasket] = useState<TradeItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [foundOffers, setFoundOffers] = useState<FoundOffer[] | null>(null);
  const [manageTrade, setManageTrade] = useState<ManageTradeState | null>(null);

  const powerRanks = useMemo(() => teamPowerRanks(teams, currentYear), [teams, currentYear]);
  const leagueAvg = useMemo(() => computeLeagueAvg(players, teams), [players, teams]);
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

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
      const payroll = getTeamPayrollUSD(players, t.id);
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
  }, [teams, players, thresholds, confStandings, currentYear]);

  // Map TradeRole → TeamMode for TV calculation
  const roleToMode = (role: string): TeamMode => {
    if (role === 'heavy_buyer' || role === 'buyer') return 'contend';
    if (role === 'rebuilding') return 'presti';
    return 'rebuild';
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

  const teamPicksList = useMemo(() =>
    draftPicks.filter(pk => pk.tid === selectedTid).sort((a, b) => a.season - b.season || a.round - b.round),
  [draftPicks, selectedTid]);

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

  const addPlayer = (player: NBAPlayer) => {
    if (basketIds.has(player.internalId)) return removeItem(player.internalId);
    setBasket(b => [...b, {
      id: player.internalId,
      type: 'player',
      label: player.name,
      val: calcPlayerTV(player, myMode, currentYear),
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
    setBasket(b => [...b, {
      id: key,
      type: 'pick',
      label: `${pick.season} ${pick.round === 1 ? '1st' : '2nd'} Round`,
      val: calcPickTV(pick.round, rank, teams.length, Math.max(1, pick.season - currentYear)),
      pick,
    }]);
    setFoundOffers(null);
  };

  const removeItem = (id: string) => { setBasket(b => b.filter(i => i.id !== id)); setFoundOffers(null); };
  const clearBasket = () => { setBasket([]); setFoundOffers(null); };

  // ── Enhanced Find Offers ──────────────────────────────────────────────────

  const findOffers = () => {
    if (basket.length === 0) return;
    setIsSearching(true);
    setFoundOffers(null);

    setTimeout(() => {
      const offers: FoundOffer[] = [];
      const myVal = basket.reduce((s, i) => s + i.val, 0);
      const usedInBasket = new Set(basket.map(i => i.id));

      teams.forEach(team => {
        if (team.id === selectedTid) return;

        const outlook = teamOutlooks.get(team.id) ?? { role: 'neutral', label: 'Neutral', color: 'text-slate-400', bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: '' };
        const theirMode = roleToMode(outlook.role);
        const theirRank = powerRanks.get(team.id) ?? Math.ceil(teams.length / 2);

        const usedIds = new Set(usedInBasket);
        const returnItems: TradeItem[] = [];
        let gap = myVal;

        // Protect top players: don't offer a team's franchise player(s)
        const theirRosterSorted = players
          .filter(p => p.tid === team.id && !EXTERNAL.includes(p.status ?? '') && p.tid !== -2)
          .sort((a, b) => b.overallRating - a.overallRating);

        const protectedCount = myVal >= 150 ? 1 : myVal >= 80 ? 2 : 3;
        const protectedIds = new Set(theirRosterSorted.slice(0, protectedCount).map(p => p.internalId));

        // Build roster with TVs (excluding protected + basket)
        const theirRoster = theirRosterSorted
          .filter(p => !usedIds.has(p.internalId) && !protectedIds.has(p.internalId))
          .map(p => ({ ...p, tv: calcPlayerTV(p, theirMode, currentYear) }))
          .filter(p => p.tv > 0 && p.tv <= gap * 1.8)
          .sort((a, b) => Math.abs(a.tv - gap) - Math.abs(b.tv - gap));

        // First player
        if (theirRoster.length > 0) {
          const p = theirRoster[0];
          returnItems.push({
            id: p.internalId, type: 'player', label: p.name,
            val: p.tv, player: p,
            ovr: calcOvr2K(p), pot: calcPot2K(p, currentYear),
          });
          usedIds.add(p.internalId);
          gap -= p.tv;
        }

        // Second player if still a big gap (> 20 TV)
        if (gap > 20) {
          const second = theirRosterSorted
            .filter(p => !usedIds.has(p.internalId) && !protectedIds.has(p.internalId))
            .map(p => ({ ...p, tv: calcPlayerTV(p, theirMode, currentYear) }))
            .filter(p => p.tv > 0 && p.tv <= gap * 1.5)
            .sort((a, b) => Math.abs(a.tv - gap) - Math.abs(b.tv - gap))[0];
          if (second) {
            returnItems.push({
              id: second.internalId, type: 'player', label: second.name,
              val: second.tv, player: second,
              ovr: calcOvr2K(second), pot: calcPot2K(second, currentYear),
            });
            usedIds.add(second.internalId);
            gap -= second.tv;
          }
        }

        // Third player if gap is still large (> 40 TV) — max 3 players total
        if (gap > 40) {
          const third = theirRosterSorted
            .filter(p => !usedIds.has(p.internalId) && !protectedIds.has(p.internalId))
            .map(p => ({ ...p, tv: calcPlayerTV(p, theirMode, currentYear) }))
            .filter(p => p.tv > 0 && p.tv <= gap * 1.5)
            .sort((a, b) => Math.abs(a.tv - gap) - Math.abs(b.tv - gap))[0];
          if (third) {
            returnItems.push({
              id: third.internalId, type: 'player', label: third.name,
              val: third.tv, player: third,
              ovr: calcOvr2K(third), pot: calcPot2K(third, currentYear),
            });
            usedIds.add(third.internalId);
            gap -= third.tv;
          }
        }

        // Fill remaining gap with picks (no salary fillers)
        const theirPicks = draftPicks
          .filter(pk => pk.tid === team.id && !usedIds.has(String(pk.dpid)))
          .sort((a, b) => a.season - b.season);

        let picksAdded = 0;
        let safety = 0;
        while (gap > 2 && picksAdded < 4 && safety++ < 8 && theirPicks.length > 0) {
          const pk = theirPicks.shift()!;
          const pv = calcPickTV(pk.round, theirRank, teams.length, Math.max(1, pk.season - currentYear));
          if (pv > gap + 14) break;
          returnItems.push({
            id: String(pk.dpid), type: 'pick',
            label: `${pk.season} ${pk.round === 1 ? '1st' : '2nd'} Round`,
            val: pv, pick: pk,
          });
          usedIds.add(String(pk.dpid));
          gap -= pv;
          picksAdded++;
        }

        if (returnItems.length === 0) return;

        // Dynamic ratio threshold — mirrors autoBalance: high-value trades allow tighter window
        const returnVal = returnItems.reduce((s, i) => s + i.val, 0);
        const ratio = Math.max(myVal, returnVal) / Math.max(1, Math.min(myVal, returnVal));
        const totalVal = Math.max(myVal, returnVal);
        const ratioThreshold = totalVal >= 200 ? 1.15 : totalVal >= 100 ? 1.35 : 1.45;
        if (ratio > ratioThreshold) return;

        offers.push({ tid: team.id, items: returnItems, outlook });
      });

      setFoundOffers(offers.sort((a, b) =>
        b.items.reduce((s, i) => s + i.val, 0) - a.items.reduce((s, i) => s + i.val, 0)
      ));
      setIsSearching(false);
    }, 80);
  };

  const handleManageTrade = (offer: FoundOffer) => {
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
        <div className={`lg:w-[380px] flex-shrink-0 flex flex-col border-r border-slate-800 min-h-0
          ${mobilePanel === 'assets' ? 'flex' : 'hidden'} lg:flex`}>

          {/* Team picker (TeamDropdown) + search + tabs */}
          <div className="flex-shrink-0 p-3 border-b border-slate-800 space-y-2">
            <TeamDropdown
              label="Team"
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
                return (
                  <PickRow
                    key={pk.dpid}
                    pick={pk}
                    selected={basketIds.has(String(pk.dpid))}
                    onToggle={() => addPick(pk)}
                    originalTeam={orig}
                    powerRank={rank}
                    totalTeams={teams.length}
                    currentYear={currentYear}
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
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white uppercase tracking-widest">Offering</span>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                  {basket.length} asset{basket.length !== 1 ? 's' : ''}
                </span>
                {basket.length > 0 && (
                  <span className="text-[10px] font-bold text-slate-500">· {formatSalaryM(mySalary)} out</span>
                )}
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
                      <img src={item.player.imgURL} alt="" className="w-4 h-4 rounded-full object-cover bg-slate-700" referrerPolicy="no-referrer" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
                        key={offer.tid}
                        offer={offer}
                        myItems={basket}
                        team={offerTeam}
                        teams={teams}
                        currentYear={currentYear}
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
    </div>
  );
};
