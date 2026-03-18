import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Game, GameResult, PlayoffBracket, NBATeam, NBAPlayer } from '../../../types';
import { normalizeDate } from '../../../utils/helpers';
import { SeriesGameSlots } from './SeriesGameSlots';
import { SeriesActionMenu } from './SeriesActionMenu';
import { SeriesBoxScore } from './SeriesBoxScore';

interface SeriesDetailPanelProps {
  seriesId: string;
  playoffs: PlayoffBracket;
  teams: NBATeam[];
  schedule: Game[];
  players: NBAPlayer[];
  boxScores: GameResult[];
  stateDate: string;
  selectedGameIdx: number;
  onGameIdxChange: (idx: number) => void;
  onWatch: (game: Game) => void;
  onSimGame: () => void;
  onSimRound: () => void;
  onSimPlayoffs: () => void;
  onClose: () => void;
  isProcessing: boolean;
}

const roundLabels: Record<number, string> = {
  1: 'First Round',
  2: 'Second Round',
  3: 'Conference Finals',
  4: 'NBA Finals',
};

export const SeriesDetailPanel: React.FC<SeriesDetailPanelProps> = ({
  seriesId,
  playoffs,
  teams,
  schedule,
  players,
  boxScores,
  stateDate,
  selectedGameIdx,
  onGameIdxChange,
  onWatch,
  onSimGame,
  onSimRound,
  onSimPlayoffs,
  onClose,
  isProcessing,
}) => {
  const [showBoxScore, setShowBoxScore] = useState(false);

  // Resolve series or play-in game
  const series = playoffs.series.find(s => s.id === seriesId) ?? null;
  const playIn = !series ? playoffs.playInGames.find(p => p.id === seriesId) ?? null : null;

  if (!series && !playIn) return null;

  // Determine teams
  let team1: NBATeam | undefined;
  let team2: NBATeam | undefined;
  let team1Wins = 0;
  let team2Wins = 0;
  let confLabel = '';
  let roundLabel = '';
  let isComplete = false;
  let winnerId: number | undefined;

  if (series) {
    team1 = teams.find(t => t.id === series.higherSeedTid);
    team2 = teams.find(t => t.id === series.lowerSeedTid);
    team1Wins = series.higherSeedWins;
    team2Wins = series.lowerSeedWins;
    confLabel = series.conference === 'Finals' ? 'NBA' : `${series.conference}ern Conference`;
    roundLabel = roundLabels[series.round] ?? `Round ${series.round}`;
    isComplete = series.status === 'complete';
    winnerId = series.winnerId;
  } else if (playIn) {
    team1 = playIn.team1Tid > 0 ? teams.find(t => t.id === playIn.team1Tid) : undefined;
    team2 = playIn.team2Tid > 0 ? teams.find(t => t.id === playIn.team2Tid) : undefined;
    confLabel = `${playIn.conference}ern Conference`;
    const typeMap: Record<string, string> = { '7v8': '7 vs 8 Seed', '9v10': '9 vs 10 Seed', 'loserGame': 'Loser Game' };
    roundLabel = `Play-In · ${typeMap[playIn.gameType] ?? playIn.gameType}`;
    isComplete = playIn.played;
    winnerId = playIn.winnerId;
  }

  // Get games for this series
  let seriesGames: Game[] = [];
  if (series) {
    seriesGames = series.gameIds
      .map(id => schedule.find(g => g.gid === id))
      .filter((g): g is Game => !!g)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } else if (playIn?.gameId) {
    const g = schedule.find(g => g.gid === playIn.gameId);
    if (g) seriesGames = [g];
  }

  const playedGames = seriesGames.filter(g => g.played);
  const nextGame = seriesGames.find(g => !g.played) ?? null;
  const isToday = nextGame ? normalizeDate(nextGame.date) === normalizeDate(stateDate) : false;

  // Selected game for box score
  const selectedGame = seriesGames[selectedGameIdx] ?? null;
  const selectedResult = selectedGame ? boxScores.find(b => b.gameId === selectedGame.gid) : null;
  const selectedHomeTeam = selectedGame ? teams.find(t => t.id === selectedGame.homeTid) : null;
  const selectedAwayTeam = selectedGame ? teams.find(t => t.id === selectedGame.awayTid) : null;
  const canShowBoxScore = selectedGame?.played && (!!selectedResult || (selectedGame.homeScore > 0 || selectedGame.awayScore > 0));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 z-50 bg-[#0d0d0d] border-l border-white/10 flex flex-col overflow-hidden shadow-2xl">

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all z-10"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/10 shrink-0">
          <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">
            {confLabel} · {roundLabel}
          </div>

          {/* Teams banner */}
          <div className="flex items-center justify-between gap-2 mt-3">
            {/* Team 1 */}
            <div className={`flex flex-col items-center gap-1 flex-1 ${isComplete && winnerId !== team1?.id ? 'opacity-30' : ''}`}>
              {team1 ? (
                <img src={team1.logoUrl} className="w-12 h-12 object-contain" alt="" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-12 h-12 bg-slate-800 rounded-full" />
              )}
              <span className="text-xs font-black text-white">{team1?.abbrev ?? 'TBD'}</span>
              {team1 && <span className="text-[9px] text-slate-500">{team1.name.split(' ').slice(-1)[0]}</span>}
            </div>

            {/* Series score */}
            <div className="flex flex-col items-center shrink-0">
              {(team1Wins > 0 || team2Wins > 0 || isComplete) ? (
                <div className="text-2xl font-black text-white tabular-nums">
                  {team1Wins} — {team2Wins}
                </div>
              ) : (
                <div className="text-xs font-black text-slate-600 uppercase tracking-widest">vs</div>
              )}
              {isComplete && winnerId && (
                <div className="text-[9px] font-bold text-emerald-400 mt-0.5">
                  {teams.find(t => t.id === winnerId)?.abbrev} wins
                </div>
              )}
            </div>

            {/* Team 2 */}
            <div className={`flex flex-col items-center gap-1 flex-1 ${isComplete && winnerId !== team2?.id ? 'opacity-30' : ''}`}>
              {team2 ? (
                <img src={team2.logoUrl} className="w-12 h-12 object-contain" alt="" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-12 h-12 bg-slate-800 rounded-full" />
              )}
              <span className="text-xs font-black text-white">{team2?.abbrev ?? 'TBD'}</span>
              {team2 && <span className="text-[9px] text-slate-500">{team2.name.split(' ').slice(-1)[0]}</span>}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1 custom-scrollbar">

          {/* Game slots */}
          {(series || playIn) && (
            <SeriesGameSlots
              series={(series ?? playIn)!}
              schedule={schedule}
              boxScores={boxScores}
              teams={teams}
              selectedIdx={selectedGameIdx}
              onSelect={(idx) => {
                onGameIdxChange(idx);
                setShowBoxScore(true);
              }}
              stateDate={stateDate}
            />
          )}

          {/* Action menu */}
          <SeriesActionMenu
            series={series}
            nextGame={nextGame}
            isToday={isToday}
            isProcessing={isProcessing}
            isComplete={isComplete}
            hasPlayedGames={playedGames.length > 0}
            onWatch={() => nextGame && onWatch(nextGame)}
            onSimGame={onSimGame}
            onSimRound={onSimRound}
            onSimPlayoffs={onSimPlayoffs}
            onViewStats={() => {
              // Select last played game for box score
              const lastPlayedIdx = seriesGames.reduce((best, g, i) => g.played ? i : best, 0);
              onGameIdxChange(lastPlayedIdx);
              setShowBoxScore(true);
            }}
          />

          {/* Box score for selected game */}
          {showBoxScore && canShowBoxScore && selectedGame && selectedResult && selectedHomeTeam && selectedAwayTeam && (
            <SeriesBoxScore
              game={selectedGame}
              result={selectedResult}
              homeTeam={selectedHomeTeam}
              awayTeam={selectedAwayTeam}
              players={players}
            />
          )}

          {showBoxScore && canShowBoxScore && selectedGame && !selectedResult && selectedHomeTeam && selectedAwayTeam && (
            <div className="mt-3 p-4 bg-white/[0.03] rounded-xl text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <span className={`text-2xl font-black ${selectedGame.homeScore >= selectedGame.awayScore ? 'text-white' : 'text-slate-500'}`}>
                  {selectedGame.homeScore}
                </span>
                <span className="text-slate-600 font-bold text-sm">—</span>
                <span className={`text-2xl font-black ${selectedGame.awayScore > selectedGame.homeScore ? 'text-white' : 'text-slate-500'}`}>
                  {selectedGame.awayScore}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">{selectedHomeTeam.abbrev} vs {selectedAwayTeam.abbrev}</div>
              <div className="text-[9px] text-slate-700 mt-1">Detailed stats not available</div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};
