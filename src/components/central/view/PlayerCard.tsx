import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { NBAPlayer, NBATeam } from '../../../types';
import { getPlayerImage } from './bioCache';
import { useGame } from '../../../store/GameContext';
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';
import { PlayerNameWithHover } from '../../shared/PlayerNameWithHover';
import { getDisplayAge } from '../../../store/playerRatingStore';
import { getScoutedDisplayOverall } from '../../../utils/scoutingFuzz';
import { isNonGuaranteedContract, isTwoWayContract } from '../../../utils/contractTypes';
import { isExternalLeagueStatus } from '../../../constants';
import { ensurePortraitLookupsLoaded } from '../../../data/realPlayerDataFetcher';
import { areWnbaDevelopmentalContractsEnabled } from '../../../services/wnba/developmentalContracts';

interface PlayerCardProps {
  player: NBAPlayer;
  team?: NBATeam;
  onActionClick: (player: NBAPlayer) => void;
  hideNbaContractBadges?: boolean;
  displaySeason?: number;
  historicalRoster?: boolean;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  team,
  onActionClick,
  hideNbaContractBadges = false,
  displaySeason,
  historicalRoster = false,
}) => {
  const { state } = useGame();
  const simYear = displaySeason ?? state.leagueStats?.year ?? new Date().getFullYear();
  const age = getDisplayAge(player, simYear);
  const displayOvr = getScoutedDisplayOverall(state, player, simYear);
  const isInjured = !historicalRoster && player.injury && player.injury.type !== 'Healthy' && player.injury.gamesRemaining > 0;
  const isSuspended = !historicalRoster && player.suspension && player.suspension.gamesRemaining > 0;
  const isAvailable = !isInjured && !isSuspended;
  const [, setPortraitLookupVersion] = useState(0);

  useEffect(() => {
    let active = true;
    ensurePortraitLookupsLoaded()
      .then(() => { if (active) setPortraitLookupVersion(version => version + 1); })
      .catch(() => {});
    return () => { active = false; };
  }, [player.internalId]);

  // Determine status label
  let statusLabel = 'Free Agent';
  if (team) {
    statusLabel = team.name;
  } else if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') {
    statusLabel = 'Draft Prospect';
  } else if (player.status === 'WNBA') {
    statusLabel = 'WNBA';
  } else if (isExternalLeagueStatus(player.status)) {
    statusLabel = player.status!;
  }

  // Handle image source safely
  const imageSrc = getPlayerImage(player);

  let statusText = historicalRoster ? `${simYear - 1}-${String(simYear).slice(-2)} roster` : 'Available';
  if (isInjured) {
    statusText = `Out - ${player.injury.type}`;
  } else if (isSuspended) {
    statusText = /red card/i.test(player.suspension?.reason ?? '')
      ? 'Suspended - Red Card'
      : 'OUT - SUSPENDED';
  }

  const isTwoWay = !historicalRoster && !hideNbaContractBadges && isTwoWayContract(player, state.leagueStats);
  const isNonGuaranteed = !historicalRoster && !hideNbaContractBadges && isNonGuaranteedContract(player, state.leagueStats);
  const contractBorder = isTwoWay
    ? 'border-purple-500/40 hover:border-purple-500/70'
    : isNonGuaranteed
    ? 'border-amber-500/40 hover:border-amber-500/70'
    : 'border-[#facc15]/25 hover:border-[#facc15]/60';
  const contractGlow = isTwoWay
    ? 'bg-purple-500/5 group-hover:bg-purple-500/10'
    : isNonGuaranteed
    ? 'bg-amber-500/5 group-hover:bg-amber-500/10'
    : 'bg-[#facc15]/[0.04] group-hover:bg-[#facc15]/10';

  return (
    <div className={`bg-slate-900/40 border rounded-[2.5rem] p-6 transition-all duration-300 group relative overflow-hidden ${contractBorder}`}>
      <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full blur-2xl transition-all duration-500 ${contractGlow}`}></div>
      
      <div className="flex items-center gap-6 relative z-10">
        <div className="relative">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={player.name}
              className="w-20 h-20 rounded-[2rem] object-cover bg-slate-800 border-2 border-slate-700 group-hover:scale-105 transition-transform duration-300 shadow-xl"
              referrerPolicy="no-referrer"
            />
          ) : isRealFaceConfig((player as any).face) ? (
            <div className="w-20 h-20 rounded-[2rem] bg-slate-800 border-2 border-slate-700 overflow-hidden shadow-xl group-hover:scale-105 transition-transform duration-300 relative">
              <div className="absolute left-1/2 top-1/2" style={{ width: 68, height: 102, transform: 'translate(-50%, -50%)' }}>
                <MyFace face={(player as any).face} style={{ width: '100%', height: '100%' }} />
              </div>
            </div>
          ) : (
             <div className="w-20 h-20 rounded-[2rem] bg-slate-800 border-2 border-slate-700 flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform duration-300">
                <span className="text-xl font-bold text-slate-500">{player.name.charAt(0)}</span>
             </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-slate-950 rounded-full flex items-center justify-center border-2 border-slate-800">
            <span className="text-[10px] font-black text-white">{displayOvr}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-black text-white truncate tracking-tight mb-1"><PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover></h4>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            {statusLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
              {player.pos}
            </span>
            <span className="bg-slate-500/10 text-slate-400 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
              {age} YRS
            </span>
            {isTwoWay && (
              <span className="bg-purple-500/15 text-purple-300 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
                {areWnbaDevelopmentalContractsEnabled(state.leagueStats) ? 'DEV' : '2W'}
              </span>
            )}
            {isNonGuaranteed && !isTwoWay && (
              <span className="bg-amber-500/15 text-amber-300 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
                NG
              </span>
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-6 pt-4 border-t border-slate-800/50 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isAvailable ? 'text-slate-600' : 'text-rose-500'}`}>
            {statusText}
          </span>
        </div>
        <button 
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onActionClick(player);
          }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black px-4 py-2 rounded-xl transition-all duration-200 uppercase tracking-[0.2em] shadow-lg shadow-indigo-600/20 md:opacity-0 md:group-hover:opacity-100 md:translate-y-2 md:group-hover:translate-y-0 opacity-100 translate-y-0"
        >
          <Activity size={12} />
          Actions
        </button>
      </div>
    </div>
  );
};
