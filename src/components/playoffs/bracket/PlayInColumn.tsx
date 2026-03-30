import React from 'react';
import { Game, NBATeam, PlayoffBracket } from '../../../types';
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
  const game7v8   = playoffs.playInGames.find(p => p.id === `${prefix}7v8`);
  const game9v10  = playoffs.playInGames.find(p => p.id === `${prefix}9v10`);
  const loserGame = playoffs.playInGames.find(p => p.id === `${prefix}loser`);

  const confColor = conference === 'East' ? 'text-indigo-400/80' : 'text-indigo-400/80';

  return (
    <div className="flex flex-col gap-4 justify-center">
      <h3 className={`text-center text-[10px] font-bold tracking-[0.2em] mb-0 uppercase ${confColor}`}>
        {conference} Play-In
      </h3>
      {/* 7 vs 8 */}
      <PlayInCard
        pig={game7v8}
        teams={teams}
        schedule={schedule}
        stateDate={stateDate}
        isSelected={selectedId === `${prefix}7v8`}
        onClick={() => onGameClick(`${prefix}7v8`)}
        label="7 vs 8"
        delay={0.1}
      />
      {/* Loser game (winner of 9v10 vs loser of 7v8) */}
      <PlayInCard
        pig={loserGame}
        teams={teams}
        schedule={schedule}
        stateDate={stateDate}
        isSelected={selectedId === `${prefix}loser`}
        onClick={() => onGameClick(`${prefix}loser`)}
        label="Loser Game"
        delay={0.2}
      />
      {/* 9 vs 10 */}
      <PlayInCard
        pig={game9v10}
        teams={teams}
        schedule={schedule}
        stateDate={stateDate}
        isSelected={selectedId === `${prefix}9v10`}
        onClick={() => onGameClick(`${prefix}9v10`)}
        label="9 vs 10"
        delay={0.3}
      />
    </div>
  );
};
