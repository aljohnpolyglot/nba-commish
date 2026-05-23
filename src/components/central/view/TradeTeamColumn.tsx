import React from 'react';
import { NBAPlayer, NBATeam } from '../../../types';
import { getPostTradeWS } from './TradeDetailHelpers';
import { PlayerReceivedCard, PickRow } from './TradeDetailAssets';
import { TradeSide } from './TradeDetailTypes';

type TradeTeamColumnProps = {
  teamName: string;
  record: string;
  team: NBATeam | null;
  received: TradeSide;
  players: NBAPlayer[];
  tradeDateMs: number;
  tradeYear: number;
  currentYear: number;
  teams: NBATeam[];
  onPlayerClick: (player: NBAPlayer) => void;
};

export const TradeTeamColumn: React.FC<TradeTeamColumnProps> = ({ teamName, record, team, received, players, tradeDateMs, tradeYear, currentYear, teams, onPlayerClick }) => {
  const logoUrl = team?.logoUrl;
  const teamColor = team?.colors?.[0];
  const isEmpty = players.length === 0 && received.pickStrs.length === 0 && received.cashStrs.length === 0 && received.playerNames.length === 0;
  const totalPostWS = players.reduce((accumulator, player) => accumulator + getPostTradeWS(player, tradeYear).ws, 0);

  return (
    <div className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-3" style={teamColor ? { borderLeftColor: teamColor, borderLeftWidth: 3 } : undefined}>
        {logoUrl && <img src={logoUrl} alt={teamName} className="w-8 h-8 object-contain opacity-90 shrink-0" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} />}
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Received</div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold text-white truncate">{teamName}</div>
            <div className="text-[10px] font-mono text-slate-500 shrink-0">{record}</div>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {isEmpty ? (
          <p className="text-center text-slate-600 text-xs py-4 italic">Nothing received</p>
        ) : (
          <>
            {players.map(player => (
              <PlayerReceivedCard key={player.internalId} player={player} tradeDateMs={tradeDateMs} tradeYear={tradeYear} currentYear={currentYear} receivingTeam={team} teams={teams} onClick={onPlayerClick} />
            ))}

            {received.playerNames.filter(name => !players.some(player => player.name.toLowerCase() === name.toLowerCase())).map((name, index) => (
              <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <div className="w-12 h-12 rounded-full bg-slate-700/50 border-2 border-slate-600/40 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0">{name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-300 truncate">{name}</div>
                  <div className="text-[11px] text-slate-500">Player data unavailable</div>
                </div>
              </div>
            ))}

            {received.pickStrs.map((pick, index) => <PickRow key={index} pickStr={pick} receivingTeamAbbrev={team?.abbrev} />)}

            {received.cashStrs.map((cash, index) => (
              <div key={`cash-${index}`} className="flex items-center gap-3 p-3 rounded-xl border-2 bg-emerald-600/10 border-emerald-500/40">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-black text-emerald-300 shrink-0">$</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-white uppercase tracking-tight">{cash}</div>
                  <div className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest">Cash Considerations</div>
                </div>
              </div>
            ))}

            {players.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 uppercase tracking-wider font-bold">Total WS after trade</span>
                <span className="font-black text-white">{totalPostWS.toFixed(1)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
