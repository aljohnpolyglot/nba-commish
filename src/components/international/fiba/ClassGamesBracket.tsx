import React from 'react';
import { classGamesBracket, BracketMatch } from '../../../data/fiba/bracketData';

interface ClassGamesBracketProps {
  onOpenBoxScore: (game: {
    team1Code: string;
    team2Code: string;
    team1Score: number;
    team2Score: number;
    team1FlagId: string;
    team2FlagId: string;
    phaseAndGroup: string;
    date: string;
  }) => void;
}

const MatchCard = ({ match, onOpenBoxScore }: { match: BracketMatch; onOpenBoxScore: ClassGamesBracketProps['onOpenBoxScore'] }) => (
  <div 
    onClick={() => {
      /* 
        DEVELOPER COMMENT: BRACKET GAME CLICK TRIGGER
        Clicking any classification match card opens the corresponding game's box score modal popup
      */
      onOpenBoxScore({
        team1Code: match.team1Code,
        team2Code: match.team2Code,
        team1Score: Number(match.team1Score),
        team2Score: Number(match.team2Score),
        team1FlagId: match.team1FlagId,
        team2FlagId: match.team2FlagId,
        phaseAndGroup: `Class. Match ${match.gameNum}`,
        date: match.dateStr
      });
    }}
    className="w-[260px] bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col z-10 shrink-0 relative cursor-pointer hover:shadow-md hover:border-gray-300 border border-transparent transition-all"
  >
    <div className="flex justify-between items-center px-4 py-2 text-[10px] text-gray-500 font-bold tracking-wider uppercase border-b border-gray-100 bg-[#f8f9fa]">
      <span>{match.gameNum} · {match.dateStr}</span>
      <span className="text-gray-700">{match.status}</span>
    </div>
    <div className="px-4 py-3 flex flex-col space-y-3 text-[15px] font-bold text-gray-900">
      <div className="flex justify-between items-center relative">
        <div className="flex items-center space-x-3">
          <img src={`https://assets.fiba.basketball/image/upload/w_200/f_auto/q_auto/.logoflag--light--organisation_${match.team1FlagId}?buster=20650`} className="w-7 h-5 object-cover shadow-sm border border-gray-100" alt="" />
          <span className={match.winner !== 1 ? 'text-gray-500 font-medium' : ''}>{match.team1Code}</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className={match.winner !== 1 ? 'text-gray-500 font-medium' : 'text-[#353ec2] font-black'}>{match.team1Score}</span>
          {match.winner === 1 && <span className="text-red-500 text-[10px] absolute -right-2">◀</span>}
        </div>
      </div>
      <div className="flex justify-between items-center relative">
        <div className="flex items-center space-x-3">
          <img src={`https://assets.fiba.basketball/image/upload/w_200/f_auto/q_auto/.logoflag--light--organisation_${match.team2FlagId}?buster=20650`} className="w-7 h-5 object-cover shadow-sm border border-gray-100" alt="" />
          <span className={match.winner !== 2 ? 'text-gray-500 font-medium' : ''}>{match.team2Code}</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className={match.winner !== 2 ? 'text-gray-500 font-medium' : 'text-[#353ec2] font-black'}>{match.team2Score}</span>
          {match.winner === 2 && <span className="text-red-500 text-[10px] absolute -right-2">◀</span>}
        </div>
      </div>
    </div>
  </div>
);

export default function ClassGamesBracket({ onOpenBoxScore }: ClassGamesBracketProps) {
  const { class5to8, class5to6, class7to8 } = classGamesBracket;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 overflow-x-auto">
      <div className="flex space-x-2 md:space-x-3 mb-8">
        <button className="px-4 py-2 rounded-full font-bold text-[13px] bg-[#5bf5a3] text-black border border-[#5bf5a3]">Class. Games 5-8</button>
        <button className="px-4 py-2 rounded-full font-bold text-[13px] bg-transparent text-white border border-[#2b3341] hover:bg-[#2b3341] transition-colors">Class. Games 5-6</button>
        <button className="px-4 py-2 rounded-full font-bold text-[13px] bg-transparent text-white border border-[#2b3341] hover:bg-[#2b3341] transition-colors">Class. Games 7-8</button>
      </div>
      <div className="min-w-max flex h-[350px]">
        
        {/* Column 1: Class 5-8 */}
        <div className="flex flex-col justify-around w-[260px]">
          {class5to8.map((match) => (
            <div key={match.id} className="relative flex items-center">
              <MatchCard match={match} onOpenBoxScore={onOpenBoxScore} />
              <div className="absolute -right-8 w-8 h-[2px] bg-[#343e4f]" />
            </div>
          ))}
        </div>

        {/* Connectors 1 to 2 */}
        <div className="w-8 relative">
           <div className="absolute top-[25%] right-0 w-full border-r-2 border-y-2 border-[#343e4f] rounded-r-lg h-[50%]" />
        </div>

        <div className="w-8 relative">
           <div className="absolute top-[50%] h-[2px] w-full bg-[#343e4f]" />
        </div>

        {/* Column 2: Class 5-6 & 7-8 */}
        <div className="flex flex-col relative w-[260px]">
          <div className="absolute top-[50%] -translate-y-1/2 w-full">
            <MatchCard match={class5to6} onOpenBoxScore={onOpenBoxScore} />
          </div>
          <div className="absolute top-[85%] -translate-y-1/2 w-full">
            <MatchCard match={class7to8} onOpenBoxScore={onOpenBoxScore} />
          </div>
        </div>

      </div>
    </div>
  );
}
