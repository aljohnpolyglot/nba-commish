import React from 'react';
import { Match, Player } from '../../types/throne';
import { Trophy } from 'lucide-react';
import { motion } from 'motion/react';

interface BracketProps {
  matches: Match[];
  currentMatchIndex: number;
}

const PlayerRow = ({ player, score, isWinner }: { player: Player | null; score: number; isWinner: boolean }) => (
  <div className={`relative flex items-center justify-between px-3 py-2 h-12 border-b border-zinc-900/50 last:border-0 ${isWinner ? 'bg-yellow-500/10' : ''}`}>
    {isWinner && <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500" />}
    <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
      {player ? (
        <>
          <img src={player.imgURL} className="w-8 h-8 rounded bg-zinc-900 object-cover shrink-0"
            alt="" onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')} />
          <div className="flex flex-col min-w-0 flex-1">
            <span className={`font-black uppercase italic text-[10px] leading-tight truncate ${isWinner ? 'text-yellow-500' : 'text-zinc-300'}`}>
              {player.lastName}
            </span>
            <span className="text-[7px] font-mono text-zinc-500 uppercase truncate">{player.team}</span>
          </div>
        </>
      ) : (
        <span className="text-[10px] text-zinc-800 font-bold uppercase italic">TBD</span>
      )}
    </div>
    <div className={`font-mono text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded shrink-0 ml-1 ${isWinner ? 'bg-yellow-500 text-black' : 'text-zinc-500'}`}>
      {score}
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
      className={`relative border-2 rounded transition-all bg-zinc-950 flex flex-col overflow-hidden w-[180px] md:w-[220px] ${
        isCurrent && !isFinished
          ? 'border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.2)] animate-pulse'
          : isFinished
          ? 'border-zinc-700 opacity-75'
          : 'border-zinc-800'
      }`}
    >
      {isFinished && (
        <div className="absolute top-1 right-1 z-10 bg-zinc-800 text-zinc-400 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded">
          DONE
        </div>
      )}
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

  // Layout follows the PlayoffView BracketLayout pattern:
  //   - Each round = column with label header at top + matches in their own flex container
  //   - Matches container has `flex-1` to fill remaining height
  //   - `justifyContent` controls match distribution per round so matches in later
  //     rounds align with the midpoint of the matches they descend from
  const Column: React.FC<{ label: string; labelColor: string; matches: Match[]; justify: 'space-between' | 'space-around' | 'center' }> = ({ label, labelColor, matches: roundMatches, justify }) => (
    <div className="flex flex-col shrink-0">
      <h4 className={`text-center text-[10px] font-black uppercase tracking-widest mb-3 ${labelColor}`}>{label}</h4>
      <div className="flex flex-col gap-4 flex-1" style={{ justifyContent: justify }}>
        {roundMatches.map(m => (
          <MatchNode key={m.id} match={m} isCurrent={matches.indexOf(m) === currentMatchIndex} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="flex items-stretch gap-4 md:gap-12 pb-8 pr-12">
        {r1.length > 0 && <Column label="Round 1"      labelColor="text-zinc-700"          matches={r1} justify="space-between" />}
        {r2.length > 0 && <Column label="Quarterfinals" labelColor="text-zinc-700"          matches={r2} justify="space-around"  />}
        {r3.length > 0 && <Column label="Semifinals"    labelColor="text-zinc-700"          matches={r3} justify="space-around"  />}
        {r4.length > 0 && (
          <div className="flex flex-col shrink-0 relative">
            <h4 className="text-center text-[10px] font-black uppercase tracking-widest mb-3 text-yellow-500 italic">The Throne</h4>
            <div className="flex flex-col flex-1 justify-center">
              <div className="relative">
                <MatchNode match={r4[0]} isCurrent={matches.indexOf(r4[0]) === currentMatchIndex} />
                {r4[0]?.winner && (
                  <div className="absolute -right-12 top-1/2 -translate-y-1/2 flex flex-col items-center">
                    <Trophy className="text-yellow-500 w-8 h-8 animate-bounce" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
