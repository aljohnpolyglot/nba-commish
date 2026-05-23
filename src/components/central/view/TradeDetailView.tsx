import React, { useCallback, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRightLeft, Calendar } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer, NBATeam } from '../../../types';
import { getGameDateParts, parseGameDate } from '../../../utils/dateUtils';
import { PlayerBioView } from './PlayerBioView';
import { getHistoricalOvr2K, parseTrade } from './TradeDetailHelpers';
import { TradeTeamColumn } from './TradeTeamColumn';
import { TradeTrendCharts } from './TradeTrendCharts';
import { TeamSlot, TradeDetailViewProps, TradeEntry, TradeSide } from './TradeDetailTypes';

export const TradeDetailView: React.FC<TradeDetailViewProps> = ({ entry, legs, onBack }) => {
  const { state } = useGame();
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const allLegs: TradeEntry[] = legs && legs.length > 0 ? [entry, ...legs] : [];
  const isMultiTeam = allLegs.length >= 2;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const { tradeDateMs, tradeYear } = useMemo(() => {
    try {
      const date = parseGameDate(entry.date);
      const ms = Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
      const { month, year } = getGameDateParts(date);
      const seasonYear = Number.isNaN(date.getTime()) ? currentYear : (month >= 7 ? year + 1 : year);
      return { tradeDateMs: ms, tradeYear: seasonYear };
    } catch {
      return { tradeDateMs: Date.now(), tradeYear: currentYear };
    }
  }, [currentYear, entry.date]);

  const multiTeamReceived = useMemo(() => {
    if (!isMultiTeam) return null;
    const byTeam = new Map<string, TradeSide>();
    const ensure = (name: string) => {
      let side = byTeam.get(name);
      if (!side) {
        side = { playerNames: [], pickStrs: [], cashStrs: [] };
        byTeam.set(name, side);
      }
      return side;
    };

    for (const leg of allLegs) {
      const parsedLeg = parseTrade(leg.text);
      if (!parsedLeg) continue;
      const teamA = ensure(parsedLeg.teamAName);
      teamA.playerNames.push(...parsedLeg.aReceived.playerNames);
      teamA.pickStrs.push(...parsedLeg.aReceived.pickStrs);
      teamA.cashStrs.push(...parsedLeg.aReceived.cashStrs);
      const teamB = ensure(parsedLeg.teamBName);
      teamB.playerNames.push(...parsedLeg.bReceived.playerNames);
      teamB.pickStrs.push(...parsedLeg.bReceived.pickStrs);
      teamB.cashStrs.push(...parsedLeg.bReceived.cashStrs);
    }

    for (const side of byTeam.values()) {
      side.playerNames = Array.from(new Set(side.playerNames));
      side.pickStrs = Array.from(new Set(side.pickStrs));
      side.cashStrs = Array.from(new Set(side.cashStrs));
    }
    return byTeam;
  }, [allLegs, isMultiTeam]);

  const parsed = useMemo(() => parseTrade(entry.text), [entry.text]);

  const resolvePlayer = useCallback((name: string) => state.players.find(player => player.name.toLowerCase() === name.toLowerCase()) ?? null, [state.players]);
  const resolveTeam = useCallback((name: string) => state.teams.find(team => team.name.toLowerCase() === name.toLowerCase()) ?? null, [state.teams]);
  const teamRecordAtDate = useCallback((teamId: number) => {
    let wins = 0;
    let losses = 0;
    for (const game of state.schedule) {
      if (!game.played || game.isPreseason || game.isAllStar || game.isExhibition) continue;
      if (new Date(game.date).getTime() > tradeDateMs) continue;
      if (game.homeTid === teamId) {
        game.homeScore > game.awayScore ? wins++ : losses++;
      } else if (game.awayTid === teamId) {
        game.awayScore > game.homeScore ? wins++ : losses++;
      }
    }
    return `${wins}-${losses}`;
  }, [state.schedule, tradeDateMs]);

  const teamSlots: TeamSlot[] = useMemo(() => {
    const buildSlot = (name: string, received: TradeSide): TeamSlot => {
      const team = resolveTeam(name);
      const players = received.playerNames.map(resolvePlayer).filter((player): player is NBAPlayer => player !== null);
      const avgOvr = players.length > 0 ? players.reduce((sum, player) => sum + getHistoricalOvr2K(player, tradeDateMs), 0) / players.length : null;
      const record = team ? teamRecordAtDate(team.id) : '0-0';
      return { name, team, received, players, avgOvr, record };
    };

    if (multiTeamReceived && multiTeamReceived.size >= 2) {
      return Array.from(multiTeamReceived.entries()).map(([name, side]) => buildSlot(name, side));
    }
    if (parsed) {
      return [
        buildSlot(parsed.teamAName, parsed.aReceived),
        buildSlot(parsed.teamBName, parsed.bReceived),
      ];
    }
    return [];
  }, [multiTeamReceived, parsed, resolvePlayer, resolveTeam, teamRecordAtDate, tradeDateMs]);

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  if (teamSlots.length === 0) {
    return (
      <div className="flex flex-col h-full bg-slate-950 text-slate-200">
        <div className="p-4 sm:p-8 border-b border-slate-800 bg-slate-900/50">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4">
            <ArrowLeft size={16} />
            <span className="text-sm font-medium">Back to Transactions</span>
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <AlertCircle size={40} className="text-slate-600" />
          <p className="text-slate-400 text-center">Could not parse trade details.</p>
          <p className="text-slate-600 text-sm text-center max-w-lg">{entry.text}</p>
        </div>
      </div>
    );
  }

  const headerTitle = isMultiTeam
    ? `${teamSlots.length}-Team Trade`
    : teamSlots.length === 2 && teamSlots[0].team && teamSlots[1].team
      ? `${(teamSlots[0].team as NBATeam).abbrev} ↔ ${(teamSlots[1].team as NBATeam).abbrev} Trade Details`
      : 'Trade Details';

  const slotsWithAvg = teamSlots.filter(slot => slot.avgOvr !== null);
  const showAnalysis = slotsWithAvg.length >= 2;
  const twoTeamDiff = showAnalysis && teamSlots.length === 2 ? (teamSlots[0].avgOvr ?? 0) - (teamSlots[1].avgOvr ?? 0) : 0;
  const twoTeamVerdict = !showAnalysis || teamSlots.length !== 2
    ? ''
    : Math.abs(twoTeamDiff) < 2
      ? 'Even Trade'
      : twoTeamDiff > 0
        ? `${teamSlots[0].name} Win`
        : `${teamSlots[1].name} Win`;
  const winnerName = showAnalysis && isMultiTeam ? slotsWithAvg.slice().sort((left, right) => (right.avgOvr ?? 0) - (left.avgOvr ?? 0))[0].name : '';

  const seasonLabel = (() => {
    try {
      const { month, year } = getGameDateParts(entry.date);
      const seasonYear = month >= 7 ? year + 1 : year;
      return `${seasonYear - 1}-${String(seasonYear).slice(2)} Season`;
    } catch {
      return '';
    }
  })();

  const containerWidth = teamSlots.length >= 3 ? 'max-w-6xl' : 'max-w-4xl';
  const verdictBadge = showAnalysis && teamSlots.length === 2 ? (
    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${Math.abs(twoTeamDiff) < 2 ? 'bg-slate-700/50 border-slate-600/50 text-slate-300' : twoTeamDiff > 0 ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-blue-500/15 border-blue-500/30 text-blue-300'}`}>
      {twoTeamVerdict}
    </span>
  ) : showAnalysis && winnerName ? (
    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border bg-emerald-500/15 border-emerald-500/30 text-emerald-300">
      {winnerName} Wins
    </span>
  ) : null;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-900/50">
        <div className={`${containerWidth} mx-auto`}>
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4">
            <ArrowLeft size={16} />
            <span className="text-sm font-medium">Back to Transactions</span>
          </button>
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center">
                <ArrowRightLeft size={18} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wide">{headerTitle}</h2>
                {seasonLabel && <span className="text-[11px] text-slate-500 font-medium">{seasonLabel}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {verdictBadge}
              <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                <Calendar size={12} />
                <span>{entry.date}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        <div className={`${containerWidth} mx-auto space-y-6`}>
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-5 py-4 space-y-2">
            {(isMultiTeam ? allLegs : [entry]).map((leg, index) => (
              <p key={index} className="text-slate-300 text-sm leading-relaxed">
                {isMultiTeam && <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider mr-2">Leg {index + 1}</span>}
                {leg.text}
              </p>
            ))}
          </div>

          {teamSlots.length === 2 ? (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-start">
              {teamSlots.map((slot, index) => (
                <React.Fragment key={index}>
                  <TradeTeamColumn teamName={slot.name} record={slot.record} team={slot.team} received={slot.received} players={slot.players} tradeDateMs={tradeDateMs} tradeYear={tradeYear} currentYear={currentYear} teams={state.teams} onPlayerClick={setViewingPlayer} />
                  {index === 0 && (
                    <div className="hidden sm:flex flex-col items-center justify-center pt-10 gap-2">
                      <ArrowRightLeft size={22} className="text-blue-400 opacity-60" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto custom-scrollbar pb-2">
              <div className="flex gap-4 items-start min-w-min">
                {teamSlots.map((slot, index) => (
                  <div key={index} className="w-[320px] sm:w-[360px] shrink-0">
                    <TradeTeamColumn teamName={slot.name} record={slot.record} team={slot.team} received={slot.received} players={slot.players} tradeDateMs={tradeDateMs} tradeYear={tradeYear} currentYear={currentYear} teams={state.teams} onPlayerClick={setViewingPlayer} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <TradeTrendCharts teamSlots={teamSlots.map(slot => ({ team: slot.team as NBATeam | null, players: slot.players }))} tradeYear={tradeYear} />
        </div>
      </div>
    </div>
  );
};
