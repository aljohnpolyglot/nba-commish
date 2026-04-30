import React from 'react';
import { Match, Player } from '../../types/throne';
import { Trophy } from 'lucide-react';
import { motion } from 'motion/react';

interface BracketProps {
  matches: Match[];
  currentMatchIndex: number;
}

const PlayerRow = ({ player, score, isWinner }: { player: Player | null; score: number; isWinner: boolean }) => (
  <div className={`flex items-center justify-between px-3 py-2 h-12 border-b border-zinc-900/50 last:border-0 ${isWinner ? 'bg-yellow-500/10' : ''}`}>
    {isWinner && <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500" />}
    <div className="flex items-center gap-2 overflow-hidden flex-1">
      {player ? (
        <>
          <img src={player.imgURL} className="w-8 h-8 rounded bg-zinc-900 object-cover" alt="" />
          <div className="flex flex-col min-w-0">
            <span className={`font-black uppercase italic text-[11px] truncate ${isWinner ? 'text-yellow-500' : 'text-zinc-300'}`}>
              {player.lastName}
            </span>
            <span className="text-[7px] font-mono text-zinc-500 uppercase">{player.team}</span>
          </div>
        </>
      ) : (
        <span className="text-[10px] text-zinc-800 font-bold uppercase italic">TBD</span>
      )}
    </div>
    <div className={`font-mono text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded ${isWinner ? 'bg-yellow-500 text-black' : 'text-transparent'}`}>
      {score > 0 || isWinner ? score : '0'}
    </div>
  </div>
);

const MatchNode: React.FC<{ match: Match; isCurrent: boolean }> = ({ match, isCurrent }) => {
  const isFinished = !!match.winner;
  const isP1Winner = isFinished && match.winner?.id === match.player1?.id;
  const isP2Winner = isFinished && match.winner?.id === match.player2?.id;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`border-2 rounded transition-all bg-zinc-950 flex flex-col overflow-hidden min-w-[170px] md:min-w-[210px] ${
        isCurrent ? 'border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.2)] animate-pulse' : 'border-zinc-800'
      }`}
    >
      <PlayerRow player={match.player1} score={match.score1} isWinner={isP1Winner} />
      <div className="h-px bg-zinc-900 w-full" />
      <PlayerRow player={match.player2} score={match.score2} isWinner={isP2Winner} />
    </motion.div>
  );
};

export const TournamentBracket: React.FC<BracketProps> = ({ matches, currentMatchIndex }) => {
  const r1 = matches.filter(m => m.round === 1);
  const r2 = matches.filter(m => m.round === 2);
  const r3 = matches.filter(m => m.round === 3);
  const r4 = matches.filter(m => m.round === 4);

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="flex gap-4 md:gap-12 pb-8 pr-12">
        {r1.length > 0 && (
          <div className="flex flex-col justify-around gap-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-700">Round 1</h4>
            {r1.map(m => (
              <MatchNode key={m.id} match={m} isCurrent={matches.indexOf(m) === currentMatchIndex} />
            ))}
          </div>
        )}

        {r2.length > 0 && (
          <div className="flex flex-col justify-around gap-8">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-700">Quarterfinals</h4>
            {r2.map(m => (
              <MatchNode key={m.id} match={m} isCurrent={matches.indexOf(m) === currentMatchIndex} />
            ))}
          </div>
        )}

        {r3.length > 0 && (
          <div className="flex flex-col justify-around gap-16">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-700">Semifinals</h4>
            {r3.map(m => (
              <MatchNode key={m.id} match={m} isCurrent={matches.indexOf(m) === currentMatchIndex} />
            ))}
          </div>
        )}

        {r4.length > 0 && (
          <div className="flex flex-col justify-center">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-yellow-500 italic">The Throne</h4>
            <div className="relative">
              {r4[0] && <MatchNode match={r4[0]} isCurrent={matches.indexOf(r4[0]) === currentMatchIndex} />}
              {r4[0]?.winner && (
                <div className="absolute -right-12 top-1/2 -translate-y-1/2 flex flex-col items-center">
                  <Trophy className="text-yellow-500 w-8 h-8 animate-bounce" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
