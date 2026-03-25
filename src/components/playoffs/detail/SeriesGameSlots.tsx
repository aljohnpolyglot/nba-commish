import React from 'react';
import { Game, GameResult, NBATeam, PlayoffSeries, PlayInGame } from '../../../types';
import { normalizeDate } from '../../../utils/helpers';

interface SeriesGameSlotsProps {
  series: PlayoffSeries | PlayInGame;
  schedule: Game[];
  boxScores: GameResult[];
  teams: NBATeam[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  stateDate: string;
}

function isPlayoffSeries(s: PlayoffSeries | PlayInGame): s is PlayoffSeries {
  return 'higherSeedTid' in s;
}

export const SeriesGameSlots: React.FC<SeriesGameSlotsProps> = ({
  series,
  schedule,
  boxScores,
  teams,
  selectedIdx,
  onSelect,
  stateDate,
}) => {
  let games: Game[];
  let slotCount: number;

  if (isPlayoffSeries(series)) {
    games = series.gameIds
      .map(id => schedule.find(g => g.gid === id))
      .filter((g): g is Game => !!g)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    slotCount = series.gamesNeeded;
  } else {
    games = series.gameId ? [schedule.find(g => g.gid === series.gameId)].filter((g): g is Game => !!g) : [];
    slotCount = 1;
  }

  // Fill up to slotCount slots
  const slots = Array.from({ length: slotCount }, (_, i) => games[i] ?? null);

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {slots.map((game, idx) => {
        const result = game ? boxScores.find(b => b.gameId === game.gid) : null;
        const isPlayed = game?.played ?? false;
        const isToday = game ? normalizeDate(game.date) === normalizeDate(stateDate) : false;
        const isSelected = idx === selectedIdx;

        const homeTeam = game ? teams.find(t => t.id === game.homeTid) : null;
        const awayTeam = game ? teams.find(t => t.id === game.awayTid) : null;

        const homeAbbrev = homeTeam?.abbrev ?? '???';
        const awayAbbrev = awayTeam?.abbrev ?? '???';

        let homeScore: number | null = null;
        let awayScore: number | null = null;
        let homeWon = false;
        let awayWon = false;

        if (isPlayed && result) {
          homeScore = result.homeScore;
          awayScore = result.awayScore;
          homeWon = result.winnerId === game?.homeTid;
          awayWon = result.winnerId === game?.awayTid;
        } else if (isPlayed && game) {
          homeScore = game.homeScore;
          awayScore = game.awayScore;
          homeWon = game.homeScore > game.awayScore;
          awayWon = game.awayScore > game.homeScore;
        }

        return (
          <button
            key={idx}
            onClick={() => isPlayed && onSelect(idx)}
            disabled={!isPlayed}
            className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl border transition-all min-w-[68px] ${
              isSelected && isPlayed
                ? 'bg-white/10 border-indigo-400/60'
                : isPlayed
                ? 'bg-white/[0.04] border-white/10 hover:border-white/20 cursor-pointer'
                : 'bg-white/[0.02] border-white/5 cursor-default'
            }`}
          >
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
              GAME {idx + 1}
            </span>
            {isPlayed && homeScore !== null && awayScore !== null ? (
              <>
                <span className="text-[8px] text-slate-600">
                  {game ? `${homeAbbrev} @ ${awayAbbrev}` : '—'}
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[10px] font-black ${homeWon ? 'text-white' : 'text-slate-600'}`}>{homeScore}</span>
                  <span className="text-[8px] text-slate-700">—</span>
                  <span className={`text-[10px] font-black ${awayWon ? 'text-white' : 'text-slate-600'}`}>{awayScore}</span>
                </div>
              </>
            ) : isToday ? (
              <>
                <span className="text-[8px] text-slate-600">
                  {game ? `${homeAbbrev} @ ${awayAbbrev}` : '—'}
                </span>
                <span className="text-[8px] font-black text-indigo-400 mt-0.5 uppercase">TODAY</span>
              </>
            ) : (
              // Future unplayed game — show TBA only
              <span className="text-[8px] text-slate-700 mt-0.5 uppercase tracking-widest">TBA</span>
            )}
          </button>
        );
      })}
    </div>
  );
};
