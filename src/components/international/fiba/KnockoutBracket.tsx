import React from 'react';
import { knockoutBracket, BracketMatch } from '../../../data/fiba/bracketData';
import { getFlagUrl } from '../../../data/fiba/data';
import type { GameResult } from '../../../types';
import type { FibaGameSelection } from './GamesList';

export interface FibaBracketMatch extends BracketMatch {
  boxScore?: GameResult;
}

interface KnockoutBracketProps {
  bracket?: KnockoutBracketData;
  onOpenBoxScore: (game: FibaGameSelection) => void;
  onWatchGame?: (gameId: string) => void;
  currentDate?: string;
}

export interface KnockoutBracketData {
  roundOf16?: FibaBracketMatch[];
  quarterFinals: FibaBracketMatch[];
  semiFinals: FibaBracketMatch[];
  final: FibaBracketMatch;
  thirdPlace: FibaBracketMatch;
}

const MatchCard = ({ match, onOpenBoxScore, onWatchGame, currentDate }: {
  match: FibaBracketMatch;
  onOpenBoxScore: KnockoutBracketProps['onOpenBoxScore'];
  onWatchGame?: KnockoutBracketProps['onWatchGame'];
  currentDate?: string;
}) => {
  const resolved = typeof match.team1Score === 'number' && typeof match.team2Score === 'number';
  const watchable = !resolved && match.scheduledDate === currentDate && match.team1Code !== 'TBD' && match.team2Code !== 'TBD';
  const actionable = resolved || watchable;
  const team1FlagSrc = match.team1FlagUrl || getFlagUrl(match.team1FlagId, match.team1Code);
  const team2FlagSrc = match.team2FlagUrl || getFlagUrl(match.team2FlagId, match.team2Code);
  return (
  <div 
    role={actionable ? 'button' : undefined}
    tabIndex={actionable ? 0 : undefined}
    aria-label={`${match.team1Code} vs ${match.team2Code} ${match.status}`}
    onClick={() => {
      /* 
        DEVELOPER COMMENT: BRACKET GAME CLICK TRIGGER
        Clicking any knockout match card opens the corresponding game's box score modal popup
      */
      if (!resolved) {
        if (watchable) onWatchGame?.(match.id);
        return;
      }
      onOpenBoxScore({
        team1Code: match.team1Code,
        team2Code: match.team2Code,
        team1Score: match.team1Score as number,
        team2Score: match.team2Score as number,
        team1FlagId: match.team1FlagId,
        team1FlagUrl: match.team1FlagUrl,
        team2FlagId: match.team2FlagId,
        team2FlagUrl: match.team2FlagUrl,
        phaseAndGroup: `Bracket Match ${match.gameNum}`,
        date: match.dateStr,
        boxScore: match.boxScore,
      });
    }}
    onKeyDown={event => {
      if (actionable && (event.key === 'Enter' || event.key === ' ')) event.currentTarget.click();
    }}
    className={`w-[260px] bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col z-10 shrink-0 relative border border-transparent transition-all ${actionable ? 'cursor-pointer hover:shadow-md hover:border-gray-300' : ''}`}
  >
    <div className="flex justify-between items-center px-4 py-2 text-[10px] text-gray-500 font-bold tracking-wider uppercase border-b border-gray-100 bg-[#f8f9fa]">
      <span>{match.gameNum} · {match.dateStr}</span>
      <span className="text-gray-700">{match.status}</span>
    </div>
    <div className="px-4 py-3 flex flex-col space-y-3 text-[15px] font-bold text-gray-900">
      <div className="flex justify-between items-center relative">
        <div className="flex items-center space-x-3">
          {team1FlagSrc ? <img src={team1FlagSrc} className="w-7 h-5 object-cover shadow-sm border border-gray-100" alt="" /> : <span className="w-7 h-5" />}
          <span className={match.winner !== 1 ? 'text-gray-500 font-medium' : ''}>{match.team1Code}</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className={match.winner !== 1 ? 'text-gray-500 font-medium' : 'text-[#353ec2] font-black'}>{match.team1Score}</span>
          {match.winner === 1 && <span className="text-red-500 text-[10px] absolute -right-2">◀</span>}
        </div>
      </div>
      <div className="flex justify-between items-center relative">
        <div className="flex items-center space-x-3">
          {team2FlagSrc ? <img src={team2FlagSrc} className="w-7 h-5 object-cover shadow-sm border border-gray-100" alt="" /> : <span className="w-7 h-5" />}
          <span className={match.winner !== 2 ? 'text-gray-500 font-medium' : ''}>{match.team2Code}</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className={match.winner !== 2 ? 'text-gray-500 font-medium' : 'text-[#353ec2] font-black'}>{match.team2Score}</span>
          {match.winner === 2 && <span className="text-red-500 text-[10px] absolute -right-2">◀</span>}
        </div>
      </div>
    </div>
  </div>
);};

export default function KnockoutBracket({ bracket = knockoutBracket, onOpenBoxScore, onWatchGame, currentDate }: KnockoutBracketProps) {
  const { roundOf16 = [], quarterFinals, semiFinals, final, thirdPlace } = bracket;
  const hasRoundOf16 = roundOf16.length > 0;

  return (
    <div data-testid="fiba-knockout-bracket-scroll" className="max-w-7xl mx-auto px-4 py-8 overflow-x-auto">
      <div className="flex space-x-2 md:space-x-3 mb-8">
        {hasRoundOf16 && <button className="px-4 py-2 rounded-full font-bold text-[13px] bg-[#5bf5a3] text-black border border-[#5bf5a3]">Round of 16</button>}
        <button className="px-4 py-2 rounded-full font-bold text-[13px] bg-[#5bf5a3] text-black border border-[#5bf5a3]">Quarter-Finals</button>
        <button className="px-4 py-2 rounded-full font-bold text-[13px] bg-transparent text-white border border-[#2b3341] hover:bg-[#2b3341] transition-colors">Semi-Finals</button>
        <button className="px-4 py-2 rounded-full font-bold text-[13px] bg-transparent text-white border border-[#2b3341] hover:bg-[#2b3341] transition-colors">Final</button>
      </div>
      <div className={`min-w-max flex ${hasRoundOf16 ? 'h-[1120px]' : 'h-[700px]'}`}>
        {hasRoundOf16 && (
          <>
            <div className="flex flex-col justify-around w-[260px]">
              {roundOf16.map(match => (
                <div key={match.id} className="relative flex items-center">
                  <MatchCard match={match} onOpenBoxScore={onOpenBoxScore} onWatchGame={onWatchGame} currentDate={currentDate} />
                  <div className="absolute -right-8 w-8 h-[2px] bg-[#343e4f]" />
                </div>
              ))}
            </div>

            <div className="w-8 relative">
              {[6.25, 31.25, 56.25, 81.25].map(top => (
                <div key={top} className="absolute right-0 w-full border-r-2 border-y-2 border-[#343e4f] rounded-r-lg h-[12.5%]" style={{ top: `${top}%` }} />
              ))}
            </div>

            <div className="w-8 relative">
              {[12.5, 37.5, 62.5, 87.5].map(top => (
                <div key={top} className="absolute h-[2px] w-full bg-[#343e4f]" style={{ top: `${top}%` }} />
              ))}
            </div>
          </>
        )}
        
        {/* Column 1: Quarter Finals */}
        <div className="flex flex-col justify-around w-[260px]">
          {quarterFinals.map((match) => (
            <div key={match.id} className="relative flex items-center">
              <MatchCard match={match} onOpenBoxScore={onOpenBoxScore} onWatchGame={onWatchGame} currentDate={currentDate} />
              <div className="absolute -right-8 w-8 h-[2px] bg-[#343e4f]" />
            </div>
          ))}
        </div>

        {/* Connectors 1 to 2 */}
        <div className="w-8 relative">
           <div className="absolute top-[12.5%] right-0 w-full border-r-2 border-y-2 border-[#343e4f] rounded-r-lg h-[25%]" />
           <div className="absolute top-[62.5%] right-0 w-full border-r-2 border-y-2 border-[#343e4f] rounded-r-lg h-[25%]" />
        </div>
        
        <div className="w-8 relative">
           <div className="absolute top-[25%] h-[2px] w-full bg-[#343e4f]" />
           <div className="absolute top-[75%] h-[2px] w-full bg-[#343e4f]" />
        </div>

        {/* Column 2: Semi Finals */}
        <div className="flex flex-col justify-around w-[260px]">
          {semiFinals.map((match) => (
            <div key={match.id} className="relative flex items-center">
              <MatchCard match={match} onOpenBoxScore={onOpenBoxScore} onWatchGame={onWatchGame} currentDate={currentDate} />
              <div className="absolute -right-8 w-8 h-[2px] bg-[#343e4f]" />
            </div>
          ))}
        </div>

        {/* Connectors 2 to 3 */}
        <div className="w-8 relative">
           <div className="absolute top-[25%] right-0 w-full border-r-2 border-y-2 border-[#343e4f] rounded-r-lg h-[50%]" />
        </div>

        <div className="w-8 relative">
           <div className="absolute top-[50%] h-[2px] w-full bg-[#343e4f]" />
        </div>

        {/* Column 3: Final & 3rd Place */}
        <div className="flex flex-col relative w-[260px]">
          {/* Final */}
          <div className="absolute top-[50%] -translate-y-1/2 w-full">
            <MatchCard match={final} onOpenBoxScore={onOpenBoxScore} onWatchGame={onWatchGame} currentDate={currentDate} />
          </div>
          {/* 3rd Place */}
          <div className="absolute top-[80%] -translate-y-1/2 w-full">
            <MatchCard match={thirdPlace} onOpenBoxScore={onOpenBoxScore} onWatchGame={onWatchGame} currentDate={currentDate} />
          </div>
        </div>

      </div>
    </div>
  );
}
