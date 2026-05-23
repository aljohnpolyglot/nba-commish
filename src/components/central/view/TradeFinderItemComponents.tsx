import React, { useRef, useState } from 'react';
import { ArrowLeftRight, TrendingDown, TrendingUp, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { PlayerHoverCard } from '../../shared/PlayerHoverCard';
import { PlayerHoverCardK2 } from '../../shared/PlayerHoverCardK2';
import { SettingsManager } from '../../../services/SettingsManager';
import { calcOvr2K, calcPot2K, getPotColor, isSalaryLegal } from '../../../services/trade/tradeValueEngine';
import { formatPlayerSalaryDisplay, sumPlayerCurrentSalariesUSD, type TradeOutlook } from '../../../utils/salaryUtils';
import { computeMoodScore } from '../../../utils/mood/moodScore';
import { formatPickLabel } from '../../../services/draft/draftClassStrength';
import { getDisplayAge } from '../../../store/playerRatingStore';
import type { DraftPick, NBAPlayer, NBATeam } from '../../../types';
import { type FoundOffer, type TradeItem } from './TradeFinderTypes';

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

function ovrText(v: number): string {
  if (v >= 95) return 'text-violet-300';
  if (v >= 90) return 'text-blue-300';
  if (v >= 85) return 'text-emerald-300';
  if (v >= 78) return 'text-amber-300';
  if (v >= 72) return 'text-slate-300';
  return 'text-red-400';
}

function getHoverCardPosition(rect: DOMRect, cardW = 256, cardH = 620): { top: number; left: number; centered: boolean } {
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    return {
      top: Math.max(8, (window.innerHeight - Math.min(cardH, window.innerHeight - 16)) / 2),
      left: Math.max(8, (window.innerWidth - Math.min(cardW, window.innerWidth - 16)) / 2),
      centered: true,
    };
  }
  const left = rect.right + 8 + cardW > window.innerWidth ? rect.left - cardW - 8 : rect.right + 8;
  const centeredTop = rect.top + rect.height / 2 - cardH / 2;
  const top = Math.max(8, Math.min(centeredTop, window.innerHeight - cardH - 8));
  return { top, left: Math.max(8, left), centered: false };
}

export const PlayerRow: React.FC<{
  player: NBAPlayer;
  selected: boolean;
  onToggle: () => void;
  team?: NBATeam;
  dateStr: string;
  currentYear: number;
  walkingExpiring?: boolean;
  recentlySigned?: boolean;
  tradeEligibleDate?: string;
}> = ({ player, selected, onToggle, team, dateStr, currentYear, walkingExpiring, recentlySigned, tradeEligibleDate }) => {
  const { state } = useGame();
  const ovr = calcOvr2K(player);
  const pot = calcPot2K(player, currentYear);
  const potColor = getPotColor(pot);
  const exp = player.contract?.exp ?? currentYear;
  const blocked = (!!walkingExpiring || !!recentlySigned) && !selected;
  const blockTitle = recentlySigned
    ? (tradeEligibleDate ? `Post-signing trade moratorium — eligible to trade ${tradeEligibleDate}.` : 'Recently signed — trade moratorium in effect.')
    : 'Walking expiring — past trade deadline, this player will be a free agent before any acquirer can use them.';
  const rowRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number; centered: boolean } | null>(null);

  return (
    <div
      ref={rowRef}
      onClick={blocked ? undefined : onToggle}
      title={blocked ? blockTitle : undefined}
      onMouseEnter={() => {
        if (blocked || !rowRef.current) return;
        setCardPos(getHoverCardPosition(rowRef.current.getBoundingClientRect()));
      }}
      onMouseLeave={() => setCardPos(null)}
      className={`flex items-center gap-2 px-3 py-2 border-b border-slate-800/50 transition-all duration-150 ${
        blocked ? 'opacity-40 grayscale cursor-not-allowed pointer-events-none' : 'cursor-pointer ' + (selected ? 'bg-indigo-600/20 border-l-4 border-l-indigo-500' : 'hover:bg-slate-800/50')
      }`}
    >
      <PlayerPortrait imgUrl={player.imgURL} face={(player as any).face} size={36} playerName={player.name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-white truncate">{player.name}</span>
          {playerIndicators(player, team, dateStr)}
        </div>
        <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide truncate">{player.pos} · {getDisplayAge(player, currentYear)}y</div>
        {recentlySigned && tradeEligibleDate && <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-amber-300">Moratorium until {tradeEligibleDate}</div>}
      </div>
      <div className={`w-9 text-center text-xs font-black tabular-nums ${ovrText(ovr)}`}>{ovr}</div>
      <div className={`w-9 text-center text-xs font-bold tabular-nums ${potColor}`}>{pot}</div>
      <div className="w-[68px] text-right">
        <div className="text-xs font-bold text-white tabular-nums">{formatPlayerSalaryDisplay(player as any, currentYear, state.nonNBATeams ?? [])}</div>
        <div className="text-[9px] text-slate-500 tabular-nums">{exp}</div>
      </div>
      {selected && <X size={11} className="text-indigo-400 flex-shrink-0" />}
      {cardPos && (
        <div className="fixed z-[200] pointer-events-none max-h-[calc(100vh-16px)] overflow-y-auto" style={{ top: cardPos.top, left: cardPos.left, width: cardPos.centered ? 'min(256px, calc(100vw - 16px))' : undefined }}>
          {SettingsManager.getSettings().tooltipStyle === 'simple' ? <PlayerHoverCard player={player} /> : <PlayerHoverCardK2 player={player} />}
        </div>
      )}
    </div>
  );
};

export const PickRow: React.FC<{
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
  const resolvedSlot = pick.round === 1 && pick.season === currentYear ? lotterySlotByTid?.get(pick.originalTid) : undefined;
  const labelShort = formatPickLabel(pick, currentYear, lotterySlotByTid, true);
  return (
    <div
      onClick={stepienBlocked ? undefined : onToggle}
      title={stepienBlocked ? 'Stepien Rule — would leave this team with no 1st in two straight future drafts.' : undefined}
      className={`flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/50 transition-all duration-150 ${stepienBlocked ? 'opacity-40 grayscale cursor-not-allowed pointer-events-none' : selected ? 'bg-indigo-600/20 border-l-4 border-l-indigo-500 cursor-pointer' : 'hover:bg-slate-800/50 cursor-pointer'}`}
    >
      <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center p-1 flex-shrink-0">
        {originalTeam?.logoUrl ? <img src={originalTeam.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <div className="text-[9px] font-black text-slate-400">{originalTeam?.abbrev ?? '?'}</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white">{pick.season} {labelShort}</div>
        <div className="text-[10px] text-slate-500 truncate">{stepienBlocked ? <span className="text-rose-400 font-black uppercase tracking-wider">Stepien Rule</span> : <>Via {originalTeam?.abbrev ?? '?'}</>}</div>
      </div>
      {pick.round === 1 && resolvedSlot == null && <div className="text-[9px] text-slate-500 font-mono flex-shrink-0 px-1">{(() => { const rankPct = totalTeams > 1 ? (powerRank - 1) / (totalTeams - 1) : 0.5; const mid = Math.round(1 + (1 - rankPct) * 29); return `~#${Math.max(1, mid - 3)}–${Math.min(30, mid + 3)}`; })()}</div>}
      <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${isNextYear ? 'bg-indigo-900/50 text-indigo-300' : isStale ? 'bg-slate-800 text-slate-500' : 'bg-slate-800/80 text-slate-400'}`}>
        {isNextYear ? <TrendingUp size={10} /> : isStale ? null : <TrendingDown size={10} />}
        {isNextYear ? 'Next' : `+${yearsFromNow}yr`}
      </div>
      {selected && <X size={11} className="text-indigo-400 flex-shrink-0" />}
    </div>
  );
};

const OfferItemRow: React.FC<{ item: TradeItem; teams: NBATeam[]; nonNBATeams: any[]; dateStr: string; currentYear: number; tone?: 'normal' | 'ask' }> = ({ item, teams, nonNBATeams, dateStr, currentYear, tone = 'normal' }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number; centered: boolean } | null>(null);
  const bg = tone === 'ask' ? 'bg-rose-900/20' : 'bg-slate-800/40';
  return (
    <div
      ref={rowRef}
      className={`flex items-center gap-2 ${bg} rounded-xl px-2.5 py-1.5`}
      onMouseEnter={() => {
        if (item.type !== 'player' || !item.player || !rowRef.current) return;
        setCardPos(getHoverCardPosition(rowRef.current.getBoundingClientRect()));
      }}
      onMouseLeave={() => setCardPos(null)}
    >
      {item.type === 'absorb' ? (
        <>
          <div className="w-7 h-7 rounded-lg bg-emerald-900/50 border border-emerald-700/50 flex items-center justify-center flex-shrink-0"><span className="text-[11px] font-black text-emerald-300">$</span></div>
          <div className="flex-1 min-w-0"><div className="text-xs font-black text-emerald-300 uppercase tracking-wider">Salary Dump</div><div className="text-[10px] text-slate-500">Cap absorption — no players returned</div></div>
        </>
      ) : item.type === 'player' && item.player ? (
        <>
          <PlayerPortrait imgUrl={item.player.imgURL} face={(item.player as any).face} size={28} playerName={item.player.name} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white truncate flex items-center gap-1">{item.player.name}{playerIndicators(item.player, teams.find(t => t.id === item.player!.tid), dateStr)}</div>
            <div className="text-[10px] text-slate-500">{item.player.pos}{(() => { const age = getDisplayAge(item.player, currentYear); return age ? <span> · {age}Y</span> : null; })()}</div>
          </div>
          <div className="flex flex-col items-end flex-shrink-0"><div className={`text-xs font-black tabular-nums ${ovrText(item.ovr ?? 70)}`}>{item.ovr ?? '—'}</div><div className={`text-[10px] font-bold tabular-nums ${getPotColor(item.pot ?? 70)}`}>{item.pot ?? '—'}</div></div>
          <div className="flex flex-col items-end flex-shrink-0 tabular-nums w-14"><div className="text-[11px] font-black text-white">{formatPlayerSalaryDisplay(item.player as any, currentYear, nonNBATeams)}</div>{item.player.contract?.exp && <div className="text-[10px] text-slate-500">{item.player.contract.exp}</div>}</div>
        </>
      ) : (
        <>
          <div className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center p-0.5 flex-shrink-0">
            {item.type === 'pick' && item.pick ? (() => { const origTeam = teams.find(t => t.id === item.pick!.originalTid); return origTeam?.logoUrl ? <img src={origTeam.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <div className="text-[8px] font-black text-indigo-400">{origTeam?.abbrev?.slice(0, 3) ?? 'PK'}</div>; })() : <div className="text-[8px] font-black text-indigo-400">PK</div>}
          </div>
          <div className="flex-1 min-w-0"><div className="text-xs font-bold text-white">{item.label}</div></div>
        </>
      )}
      {cardPos && item.player && <div className="fixed z-[200] pointer-events-none max-h-[calc(100vh-16px)] overflow-y-auto" style={{ top: cardPos.top, left: cardPos.left, width: cardPos.centered ? 'min(256px, calc(100vw - 16px))' : undefined }}>{SettingsManager.getSettings().tooltipStyle === 'simple' ? <PlayerHoverCard player={item.player} /> : <PlayerHoverCardK2 player={item.player} />}</div>}
    </div>
  );
};

export const OfferCard: React.FC<{
  offer: FoundOffer;
  myItems: TradeItem[];
  team?: NBATeam;
  teams: NBATeam[];
  currentYear: number;
  dateStr: string;
  nonNBATeams: any[];
  capSpaceK?: number;
  onManage: () => void;
  onReject?: () => void;
  showAsk?: boolean;
  hideActions?: boolean;
  salaryBadgeOverride?: { label: string; tone: 'ok' | 'warn' | 'bad' } | null;
}> = ({ offer, myItems, team, teams, currentYear, dateStr, nonNBATeams, capSpaceK, onManage, onReject, showAsk, hideActions, salaryBadgeOverride }) => {
  const mySalary = myItems.filter(i => i.type === 'player').reduce((s, i) => s + (i.player?.contract?.amount ?? 0), 0);
  const theirSalary = offer.items.filter(i => i.type === 'player').reduce((s, i) => s + (i.player?.contract?.amount ?? 0), 0);
  const myDisplaySalaryUSD = sumPlayerCurrentSalariesUSD(myItems.filter(i => i.type === 'player').map(i => i.player!).filter(Boolean) as any[], currentYear);
  const theirDisplaySalaryUSD = sumPlayerCurrentSalariesUSD(offer.items.filter(i => i.type === 'player').map(i => i.player!).filter(Boolean) as any[], currentYear);
  const bothHavePlayers = myItems.some(i => i.type === 'player') && offer.items.some(i => i.type === 'player');
  const ratioOk = !bothHavePlayers || isSalaryLegal(mySalary, theirSalary);
  const capRoomK = capSpaceK ?? 0;
  const capCoversGap = !ratioOk && bothHavePlayers && capRoomK > 0 && theirSalary <= mySalary + capRoomK + 0.1;
  const salaryBadge = salaryBadgeOverride ?? (capCoversGap ? { label: '✓ Room OK', tone: 'warn' as const } : ratioOk || capCoversGap ? { label: '✓ Salary OK', tone: 'ok' as const } : { label: '⚠ Salary Off', tone: 'bad' as const });
  const badgeLabel = offer.strategyLabel ?? offer.outlook.label;
  const isAbsorb = offer.variant === 'absorb';
  const matchDeltaK = bothHavePlayers ? mySalary * 1.25 - theirSalary : null;
  const capLabel = capCoversGap
    ? (() => { const remainingCapK = mySalary + capRoomK - theirSalary; return remainingCapK >= 0 ? `+$${(remainingCapK / 1000).toFixed(1)}M post-trade room` : `-$${(-remainingCapK / 1000).toFixed(1)}M post-trade over`; })()
    : matchDeltaK !== null
      ? matchDeltaK >= 0 ? `+$${(matchDeltaK / 1000).toFixed(1)}M room` : `-$${(-matchDeltaK / 1000).toFixed(1)}M over limit`
      : capSpaceK === undefined ? null : capSpaceK >= 0 ? `$${(capSpaceK / 1000).toFixed(1)}M avail` : `-$${(-capSpaceK / 1000).toFixed(1)}M over`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-3 p-3 border-b border-slate-800/50">
        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 p-1 flex items-center justify-center flex-shrink-0">{team?.logoUrl && <img src={team.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />}</div>
        <div className="flex-1 min-w-0"><div className="text-xs font-black text-white truncate">{team?.name}</div><div className="text-[10px] text-slate-500">{(team as any)?.wins ?? 0}–{(team as any)?.losses ?? 0}</div></div>
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg flex-shrink-0 ${offer.outlook.bgColor} ${offer.outlook.color}`}>{badgeLabel}</span>
      </div>
      {showAsk && myItems.length > 0 && <div className="px-2 pt-2 pb-1 bg-rose-950/20 border-b border-rose-500/10 space-y-1"><div className="flex items-center gap-1.5 px-1 mb-1"><span className="text-[9px] font-black uppercase tracking-widest text-rose-300 bg-rose-500/15 border border-rose-500/25 rounded px-1.5 py-0.5">↗ Outgoing{myDisplaySalaryUSD > 0 && ` · ${formatSalaryM(myDisplaySalaryUSD / 1000)}`}</span></div>{myItems.map(item => <OfferItemRow key={item.id} item={item} teams={teams} nonNBATeams={nonNBATeams} dateStr={dateStr} currentYear={currentYear} tone="ask" />)}</div>}
      <div className="flex-1 p-2 space-y-1">
        <div className="flex items-center gap-1.5 px-1 mb-1"><span className="text-[9px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 rounded px-1.5 py-0.5">↙ Incoming{theirDisplaySalaryUSD > 0 && ` · ${formatSalaryM(theirDisplaySalaryUSD / 1000)}`}</span></div>
        {offer.items.map(item => <OfferItemRow key={item.id} item={item} teams={teams} nonNBATeams={nonNBATeams} dateStr={dateStr} currentYear={currentYear} />)}
      </div>
      <div className="p-2.5 border-t border-slate-800/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isAbsorb ? <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-emerald-900/40 text-emerald-400">✓ Cap Absorbs</span> : bothHavePlayers ? <span className={`text-[9px] font-bold px-2 py-1 rounded-lg ${salaryBadge.tone === 'warn' ? 'bg-sky-900/40 text-sky-300' : salaryBadge.tone === 'ok' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-rose-900/40 text-rose-300'}`}>{salaryBadge.label}</span> : null}
          {capLabel && <span className={`text-[9px] font-bold px-2 py-1 rounded-lg tabular-nums ${capCoversGap ? (capLabel.startsWith('+') ? 'bg-sky-900/40 text-sky-300' : 'bg-rose-900/40 text-rose-300') : matchDeltaK !== null ? matchDeltaK >= 0 ? 'bg-emerald-900/40 text-emerald-400' : 'bg-rose-900/40 text-rose-300' : (capSpaceK ?? 0) >= 0 ? 'bg-sky-900/40 text-sky-300' : 'bg-rose-900/40 text-rose-300'}`}>{capLabel}</span>}
        </div>
        {!hideActions && <div className="flex items-center gap-1.5">{onReject && <button onClick={onReject} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-black uppercase tracking-wide transition-all"><X size={11} />Reject</button>}<button onClick={onManage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wide transition-all"><ArrowLeftRight size={11} />Manage</button></div>}
      </div>
    </motion.div>
  );
};
