import React, { useRef, useState } from 'react';
import { MoreVertical, X } from 'lucide-react';
import { PlayerHoverCard } from '../shared/PlayerHoverCard';
import { PlayerHoverCardK2 } from '../shared/PlayerHoverCardK2';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { SettingsManager } from '../../services/SettingsManager';
import { calcOvr2K, calcPot2K, getPotColor } from '../../services/trade/tradeValueEngine';
import { formatPickLabel } from '../../services/draft/draftClassStrength';
import type { DraftPick, NBAPlayer, NBATeam } from '../../types';
import { getPlayerContractExpiryDisplay } from '../../utils/salaryUtils';

const ovrTextColor = (v: number): string => {
  if (v >= 95) return 'text-violet-300';
  if (v >= 90) return 'text-blue-300';
  if (v >= 85) return 'text-emerald-300';
  if (v >= 78) return 'text-amber-300';
  if (v >= 72) return 'text-slate-300';
  return 'text-red-400';
};

const expiryTextClass = (exp: number | undefined, currentSeason: number | undefined): string =>
  exp !== undefined && currentSeason !== undefined && exp <= currentSeason ? 'text-rose-400' : 'text-slate-500';

export const OutgoingPill = ({ player, onRemove }: { player: NBAPlayer; onRemove: () => void }) => (
  <div className="flex items-center gap-2 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-full pl-1 pr-2 py-1 transition-colors shadow-sm flex-shrink-0">
    <PlayerPortrait imgUrl={player.imgURL} face={(player as any).face} playerName={player.name} size={24} />
    <span className="text-xs font-bold text-white whitespace-nowrap">
      {player.name.charAt(0)}. {player.name.split(' ').slice(1).join(' ')}
    </span>
    <button onClick={onRemove} className="w-4 h-4 rounded-full bg-slate-500 hover:bg-rose-500 flex items-center justify-center text-white transition-colors">
      <X size={10} />
    </button>
  </div>
);

export const OutgoingPickPill = ({
  pick,
  teams,
  onRemove,
  currentYear,
  lotterySlotByTid,
}: {
  pick: DraftPick;
  teams: NBATeam[];
  onRemove: () => void;
  currentYear: number;
  lotterySlotByTid?: Map<number, number>;
}) => {
  const origTeam = teams.find(t => t.id === pick.originalTid);
  const label = formatPickLabel(pick, currentYear, lotterySlotByTid, true);
  return (
    <div className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-full pl-1 pr-2 py-1 transition-colors shadow-sm flex-shrink-0">
      <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 p-0.5 flex items-center justify-center">
        {origTeam?.logoUrl
          ? <img src={origTeam.logoUrl} alt={origTeam.abbrev} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          : <span className="text-[8px] font-black text-indigo-300">{origTeam?.abbrev?.slice(0, 3) ?? 'PK'}</span>}
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

export const PlayerRow = ({
  player,
  isSelected,
  onToggle,
  formatContract,
  teams,
  disabled,
  currentSeason,
  moratoriumLockedUntil,
  isSuggested,
}: {
  player: NBAPlayer & { isIncoming?: boolean };
  isSelected: boolean;
  onToggle: () => void;
  formatContract: (player: NBAPlayer) => string;
  teams: NBATeam[];
  disabled: boolean;
  currentSeason?: number;
  moratoriumLockedUntil?: string;
  isSuggested?: boolean;
}) => {
  const team = teams.find(t => t.id === player.tid);
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
  const expiry = getPlayerContractExpiryDisplay(player as any, currentSeason ?? new Date().getFullYear());
  const expClass = expiry.isConferenceDeal ? 'text-amber-300' : expiryTextClass(player.contract?.exp, currentSeason);
  const rowRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);

  const handleMouseEnter = () => {
    if (disabled || !rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    const cardW = 210;
    const cardH = 620;
    const isMobile = window.innerWidth < 640;
    const left = isMobile
      ? Math.max(8, Math.round((window.innerWidth - cardW) / 2))
      : (rect.right + 8 + cardW > window.innerWidth ? rect.left - cardW - 8 : rect.right + 8);
    const centeredTop = rect.top + rect.height / 2 - cardH / 2;
    const top = Math.max(8, Math.min(centeredTop, Math.max(8, window.innerHeight - cardH - 8)));
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
      <PlayerPortrait
        imgUrl={player.imgURL}
        face={(player as any).face}
        teamLogoUrl={team?.logoUrl}
        isIncoming={player.isIncoming}
        size={48}
        playerName={player.name}
      />
      <div className="flex-1 ml-4 min-w-0">
        <div className="text-sm font-black text-white truncate group-hover:text-blue-400 transition-colors">{player.name}</div>
        <div className={`text-[10px] font-bold uppercase tracking-wider ${expClass}`}>{player.pos} • {expiry.label}</div>
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
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center leading-tight tabular-nums">
          <span className={`text-base font-black ${ovrTextColor(ovr)}`}>{ovr}</span>
          <span className={`text-xs font-bold ${getPotColor(pot)}`}>{pot}</span>
        </div>
        <div className="text-right">
          <div className="text-sm font-black text-white">{formatContract(player)}</div>
          <div className={`text-[10px] font-bold ${expClass}`}>{expiry.isConferenceDeal ? 'Conference deal' : `${expiry.label} YRS LEFT`}</div>
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
