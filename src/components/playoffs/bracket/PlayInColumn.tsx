import React from 'react';
import { Game, PlayInGame, NBATeam, PlayoffBracket } from '../../../types';
import { PlayInCard } from './PlayInCard';

interface PlayInColumnProps {
  conference: 'East' | 'West';
  playoffs: PlayoffBracket;
  teams: NBATeam[];
  schedule: Game[];
  stateDate: string;
  onGameClick: (id: string) => void;
  selectedId: string | null;
}

export const PlayInColumn: React.FC<PlayInColumnProps> = ({
  conference,
  playoffs,
  teams,
  schedule,
  stateDate,
  onGameClick,
  selectedId,
}) => {
  const prefix = conference[0];
  const game7v8 = playoffs.playInGames.find(p => p.id === `${prefix}7v8`);
  const game9v10 = playoffs.playInGames.find(p => p.id === `${prefix}9v10`);
  const loserGame = playoffs.playInGames.find(p => p.id === `${prefix}loser`);

  const seed7Winner = game7v8?.played && game7v8.winnerId
    ? teams.find(t => t.id === game7v8.winnerId) : null;
  const seed8Winner = loserGame?.played && loserGame.winnerId
    ? teams.find(t => t.id === loserGame.winnerId) : null;

  const confColor = conference === 'East' ? 'text-red-400' : 'text-blue-400';

  return (
    <div className="flex flex-col w-44 shrink-0">
      <div className={`text-[9px] font-black uppercase tracking-widest mb-2 ${confColor}`}>
        {conference} · Play-In
      </div>

      {/* Bracket tree */}
      <div className="flex gap-0 items-stretch flex-1">

        {/* Left col: first-round games stacked */}
        <div className="flex flex-col w-44 gap-0 flex-1">
          <div className="flex-1 flex flex-col justify-end pb-1">
            <PlayInCard
              pig={game7v8}
              teams={teams}
              schedule={schedule}
              stateDate={stateDate}
              isSelected={selectedId === `${prefix}7v8`}
              onClick={() => onGameClick(`${prefix}7v8`)}
              label="7 vs 8 Seed"
            />
          </div>
          <div className="flex-1 flex flex-col justify-start pt-1">
            <PlayInCard
              pig={game9v10}
              teams={teams}
              schedule={schedule}
              stateDate={stateDate}
              isSelected={selectedId === `${prefix}9v10`}
              onClick={() => onGameClick(`${prefix}9v10`)}
              label="9 vs 10 Seed"
            />
          </div>
        </div>

        {/* H-bracket connector */}
        <div className="w-7 flex flex-col shrink-0">
          <div className="flex-1 border-r-2 border-b-2 border-indigo-900/60 rounded-br-xl" />
          <div className="flex-1 border-r-2 border-t-2 border-indigo-900/60 rounded-tr-xl" />
        </div>

        {/* Right col: outcomes + loser game */}
        <div className="flex-1 flex flex-col justify-center gap-2">
          {/* 7th Seed outcome */}
          <div className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border ${seed7Winner ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/[0.02] border-dashed border-white/10'}`}>
            {seed7Winner ? (
              <>
                <img src={seed7Winner.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
                <span className="text-xs font-bold text-emerald-400 truncate">{seed7Winner.abbrev}</span>
              </>
            ) : (
              <span className="text-[9px] text-slate-600 font-bold">Win Game 1</span>
            )}
            <span className="ml-auto text-[9px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">7th Seed</span>
          </div>

          {/* Loser Game */}
          <PlayInCard
            pig={loserGame}
            teams={teams}
            schedule={schedule}
            stateDate={stateDate}
            isSelected={selectedId === `${prefix}loser`}
            onClick={() => onGameClick(`${prefix}loser`)}
            label="Loser Game"
          />

          {/* 8th Seed outcome */}
          <div className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border ${seed8Winner ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/[0.02] border-dashed border-white/10'}`}>
            {seed8Winner ? (
              <>
                <img src={seed8Winner.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
                <span className="text-xs font-bold text-emerald-400 truncate">{seed8Winner.abbrev}</span>
              </>
            ) : (
              <span className="text-[9px] text-slate-600 font-bold">Win Loser Game</span>
            )}
            <span className="ml-auto text-[9px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">8th Seed</span>
          </div>
        </div>

      </div>
    </div>
  );
};
