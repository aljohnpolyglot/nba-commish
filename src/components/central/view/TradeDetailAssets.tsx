import React, { useMemo } from 'react';
import { NBAPlayer, NBATeam } from '../../../types';
import { calcOvr2K, calcPot2K, getPotColor } from '../../../services/trade/tradeValueEngine';
import { cn } from '../../../lib/utils';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { isTradeEligible } from '../../../utils/signingMoratorium';
import { useGame } from '../../../store/GameContext';
import { getHistoricalOvr2K, getHistoricalPot2K, getPostTradeWS, ovrColor } from './TradeDetailHelpers';

type PlayerReceivedCardProps = {
  player: NBAPlayer;
  currentYear: number;
  tradeDateMs: number;
  tradeYear: number;
  receivingTeam: NBATeam | null;
  teams: NBATeam[];
  onClick: (player: NBAPlayer) => void;
};

export const PlayerReceivedCard: React.FC<PlayerReceivedCardProps> = ({ player, currentYear, tradeDateMs, tradeYear, receivingTeam, teams, onClick }) => {
  const { state } = useGame();
  const historicalOvr = getHistoricalOvr2K(player, tradeDateMs);
  const historicalPot = getHistoricalPot2K(player, tradeDateMs, tradeYear);
  const currentOvr = calcOvr2K(player);
  const currentPot = calcPot2K(player, currentYear);
  const ovrChanged = Math.abs(currentOvr - historicalOvr) >= 1;
  const ageAtTrade = player.born?.year ? tradeYear - player.born.year : (player.age ?? 0);
  const salary = player.contract?.amount ?? 0;
  const salaryM = salary > 0 ? `$${(salary / 1000).toFixed(1)}M` : 'N/A';
  const expYear = player.contract?.exp;
  const injured = (player.injury?.gamesRemaining ?? 0) > 0;
  const tradeEligibleDate = (player as NBAPlayer & { tradeEligibleDate?: string }).tradeEligibleDate;
  const moratoriumLocked = !!tradeEligibleDate && state.leagueStats?.postSigningMoratoriumEnabled !== false && !isTradeEligible(player, state.date ?? '', state.leagueStats as never);

  const { ws: postWS, tids: postTids } = getPostTradeWS(player, tradeYear);
  const tidList = Array.from(postTids);
  const receivingTeamId = receivingTeam?.id;
  const onlyOnReceiving = tidList.length === 1 && tidList[0] === receivingTeamId;
  const wsTeamLabel = (() => {
    if (tidList.length === 0) return '—';
    const abbrevs = tidList.map(tid => teams.find(team => team.id === tid)?.abbrev ?? '?').filter(abbrev => abbrev !== '?');
    if (abbrevs.length === 0) return '—';
    return onlyOnReceiving ? `all with ${abbrevs[0]}` : `with ${abbrevs.join(', ')}`;
  })();

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/80 cursor-pointer transition-all" onClick={() => onClick(player)}>
      <div className="relative shrink-0">
        <PlayerPortrait imgUrl={player.imgURL} face={(player as NBAPlayer & { face?: unknown }).face} playerName={player.name} size={48} />
        {injured && <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-slate-900" title="Injured" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {player.pos && <span className="text-[9px] font-bold bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded uppercase tracking-wider">{player.pos}</span>}
          <span className="text-sm font-semibold text-white truncate">{player.name}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className={`font-bold ${ovrColor(historicalOvr)}`}>{historicalOvr} OVR</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">{historicalPot} POT</span>
          <span className="text-slate-600">·</span>
          <span>{ageAtTrade}y</span>
          <span className="text-slate-600">·</span>
          <span>{salaryM}</span>
          {expYear && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">Exp {expYear}</span>
            </>
          )}
        </div>
        {ovrChanged && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 mt-0.5">
            <span>now:</span>
            <span className={ovrColor(currentOvr)}>{currentOvr}</span>
            <span className="text-slate-700">·</span>
            <span className={getPotColor(currentPot)}>{currentPot}</span>
          </div>
        )}
        <div className="text-[10px] text-slate-500 mt-1">
          <span className="font-bold text-slate-300">{postWS.toFixed(1)}</span>
          <span className="text-slate-500"> WS after trade</span>
          <span className="text-slate-600"> ({wsTeamLabel})</span>
        </div>
        {moratoriumLocked && <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-amber-300">Moratorium until {tradeEligibleDate}</div>}
      </div>
    </div>
  );
};

export const PickRow: React.FC<{ pickStr: string; receivingTeamAbbrev?: string }> = ({ pickStr, receivingTeamAbbrev }) => {
  const { state } = useGame();
  const seasonMatch = pickStr.match(/(\d{4})/);
  const season = seasonMatch ? parseInt(seasonMatch[1], 10) : null;
  const isR1 = /\b1st\b/i.test(pickStr) || /\bR1\b/i.test(pickStr) || /round\s*1\b/i.test(pickStr);
  const isR2 = /\b2nd\b/i.test(pickStr) || /\bR2\b/i.test(pickStr) || /round\s*2\b/i.test(pickStr);
  const hasRound = isR1 || isR2;
  const origMatch = pickStr.match(/\(([A-Z]{2,4})\)/);
  const origAbbrev = origMatch ? origMatch[1] : null;
  const origTeam = origAbbrev ? state.teams.find(team => team.abbrev === origAbbrev) : null;
  const isOwnPick = !!receivingTeamAbbrev && !!origAbbrev && origAbbrev === receivingTeamAbbrev;

  const resolvedPlayer = useMemo(() => {
    if (!season || !hasRound || !origTeam) return null;
    const round = isR1 ? 1 : 2;
    return state.players.find(player => {
      const draft = (player as NBAPlayer & { draft?: { year?: number; round?: number; originalTid?: number } }).draft;
      return draft && Number(draft.year) === season && Number(draft.round) === round && Number(draft.originalTid) === origTeam.id;
    }) ?? null;
  }, [hasRound, isR1, origTeam, season, state.players]);

  if (!season && !hasRound) {
    return (
      <div className="flex items-center gap-4 p-3 rounded-xl border-2 bg-slate-900/50 border-slate-800">
        <span className="text-sm text-slate-300 font-medium">{pickStr}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-4 p-3 rounded-xl border-2 transition-all', isOwnPick ? 'bg-slate-900/50 border-slate-800' : 'bg-blue-600/10 border-blue-500/50')}>
      <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center p-2 shadow-inner flex-shrink-0">
        {origTeam?.logoUrl ? <img src={origTeam.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : <span className="text-[9px] font-black text-slate-400">{origAbbrev ?? '?'}</span>}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-black text-white uppercase tracking-tight">
          {season ?? ''} {isR1 ? '1ST' : isR2 ? '2ND' : ''} ROUND
          {resolvedPlayer && (resolvedPlayer as NBAPlayer & { draft?: { pick?: number } }).draft?.pick && (
            <span className="ml-1.5 text-[10px] font-bold text-slate-500">#{(resolvedPlayer as NBAPlayer & { draft: { pick: number } }).draft.pick}</span>
          )}
        </div>
        {!isOwnPick && origTeam && <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Via {origTeam.region} {origTeam.name}</div>}
        {resolvedPlayer && <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mt-0.5 truncate">became {resolvedPlayer.name}</div>}
      </div>
      {hasRound && <div className={cn('text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0', isR1 ? 'bg-indigo-900/50 text-indigo-300' : 'bg-slate-800 text-slate-500')}>{isR1 ? '1st' : '2nd'}</div>}
      {!isOwnPick && <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] flex-shrink-0" />}
    </div>
  );
};
