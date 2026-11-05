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
  ownTid?: number | null;
}

export const PlayInColumn: React.FC<PlayInColumnProps> = ({
  conference,
  playoffs,
  teams,
  schedule,
  stateDate,
  onGameClick,
  selectedId,
  ownTid,
}) => {
  const prefix = conference[0];
  const bubbleGame = playoffs.playInFormat === 'bubble_8_9'
    ? playoffs.playInGames.find(p => p.id === `${prefix}8v9`)
    : undefined;
  const bubbleGame2 = playoffs.playInFormat === 'bubble_8_9'
    ? playoffs.playInGames.find(p => p.id === `${prefix}8v9g2`)
    : undefined;
  const showBubbleGame2 = !!bubbleGame2 && (Number(bubbleGame2.team1Tid) !== -1 || Number(bubbleGame2.team2Tid) !== -1 || bubbleGame2.gameId || bubbleGame2.played);
  const game7v8   = playoffs.playInGames.find(p => p.id === `${prefix}7v8`);
  const game9v10  = playoffs.playInGames.find(p => p.id === `${prefix}9v10`);
  const loserGame = playoffs.playInGames.find(p => p.id === `${prefix}loser`);

  const confColor = conference === 'East' ? 'text-indigo-400/80' : 'text-indigo-400/80';

  return (
    <div className="flex flex-col gap-4 justify-center">
      <h3 className={`text-center text-[10px] font-bold tracking-[0.2em] mb-0 uppercase ${confColor}`}>
        {conference} Play-In
      </h3>
      {playoffs.playInFormat === 'bubble_8_9' ? (
        bubbleGame ? (
          <>
            <PlayInCard
              pig={bubbleGame}
              teams={teams}
              schedule={schedule}
              stateDate={stateDate}
              isSelected={selectedId === `${prefix}8v9`}
              onClick={() => onGameClick(`${prefix}8v9`)}
              label="8 vs 9"
              delay={0.1}
              ownTid={ownTid}
            />
            {showBubbleGame2 && (
              <PlayInCard
                pig={bubbleGame2}
                teams={teams}
                schedule={schedule}
                stateDate={stateDate}
                isSelected={selectedId === `${prefix}8v9g2`}
                onClick={() => onGameClick(`${prefix}8v9g2`)}
                label="8 vs 9"
                delay={0.2}
                ownTid={ownTid}
              />
            )}
          </>
        ) : (
          <div className="flex min-h-[76px] w-48 shrink-0 items-center justify-center rounded-lg border border-slate-800/80 bg-[#0f131c] px-3 text-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">No Play-In Needed</span>
          </div>
        )
      ) : (
        <>
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
        ownTid={ownTid}
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
        ownTid={ownTid}
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
        ownTid={ownTid}
      />
        </>
      )}
    </div>
  );
};
