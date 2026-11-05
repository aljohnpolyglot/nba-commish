import React, { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { leadersData, type LeaderCategory } from '../../../data/fiba/leadersData';
import { getFlagUrl } from '../../../data/fiba/data';
import type { PlayerStatRow } from './StatsTable';

interface LeadersProps {
  teamCode?: string;
  categories?: readonly LeaderCategory[];
  stats?: readonly PlayerStatRow[];
  onPlayerSelect?: (playerId: string) => void;
}

const TEAM_LEADER_FIELDS: Array<{ title: string; field: keyof PlayerStatRow }> = [
  { title: 'Points', field: 'PTS_pg' },
  { title: 'Rebounds', field: 'TRB_pg' },
  { title: 'Assists', field: 'AST_pg' },
  { title: 'Steals', field: 'STL_pg' },
  { title: 'Blocks', field: 'BLK_pg' },
];

function PlayerPortrait({ imageUrl, fallbackImageUrl, featured = false }: { imageUrl?: string; fallbackImageUrl?: string; featured?: boolean }) {
  const [src, setSrc] = useState(imageUrl ?? fallbackImageUrl);
  useEffect(() => setSrc(imageUrl ?? fallbackImageUrl), [fallbackImageUrl, imageUrl]);
  return (
    <div className={featured
      ? 'absolute bottom-0 right-0 z-0 flex h-[170px] w-[150px] items-end justify-end'
      : 'relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#1b222d]'}
    >
      <UserRound
        className={featured
          ? 'h-28 w-28 text-[#31614f]'
          : 'h-9 w-9 text-[#384252]'}
      />
      {src && (
        <img
          src={src}
          alt=""
          className={featured
            ? 'absolute inset-0 h-full w-full object-contain object-bottom'
            : 'absolute inset-0 h-full w-full object-cover object-top'}
          onError={() => setSrc(current => current !== fallbackImageUrl ? fallbackImageUrl : undefined)}
        />
      )}
    </div>
  );
}

export default function Leaders({ teamCode, categories = leadersData, stats, onPlayerSelect }: LeadersProps) {
  const filteredLeaders = teamCode && stats
    ? TEAM_LEADER_FIELDS.map(category => ({
        title: category.title,
        subtitle: 'PER GAME',
        players: stats
          .filter(player => player.teamCode === teamCode && player.G > 0)
          .sort((left, right) => Number(right[category.field]) - Number(left[category.field]))
          .slice(0, 3)
          .map(player => ({
            id: `${category.title}-${player.id}`,
            playerId: player.playerId,
            imageUrl: player.imageUrl,
            fallbackImageUrl: player.fallbackImageUrl,
            firstName: player.firstName,
            lastName: player.lastName,
            countryCode: player.teamCode,
            countryFlagId: player.teamFlagId,
            countryFlagUrl: player.teamFlagUrl,
            value: Number(player[category.field]).toFixed(1),
          })),
      })).filter(category => category.players.length > 0)
    : teamCode
      ? categories.map(category => ({
          ...category,
          players: category.players.filter(player => player.countryCode === teamCode),
        })).filter(category => category.players.length > 0)
      : categories;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredLeaders.map((category) => {
          if (category.players.length === 0) return null;
          const first = category.players[0];
          const others = category.players.slice(1);

          return (
            <div key={category.title} className="bg-[#222a36] rounded-[1rem] overflow-hidden shadow-lg flex flex-col">
              {/* Category Header & #1 Player */}
              <div className="bg-[#a8f8d9] flex flex-col pt-5">
                <div className="text-center pb-4">
                  <h3 className="text-black font-extrabold text-xl">{category.title}</h3>
                  <p className="text-[#3b8c6e] text-[10px] font-bold tracking-widest uppercase mt-1">{category.subtitle}</p>
                </div>
                
                <div className="relative bg-[#3e7b66] px-6 pb-6 pt-6 rounded-t-3xl flex flex-col h-[180px]">
                  {/* #1 Player Name and Value */}
                  <div className="flex flex-col z-10">
                    <div className="flex items-center space-x-1.5 bg-white/20 w-max px-2 py-0.5 rounded text-[11px] mb-3 text-white font-bold tracking-wide">
                      <img 
                        src={first.countryFlagUrl || getFlagUrl(first.countryFlagId, first.countryCode)}
                        alt=""
                        className="w-4 h-3 object-cover rounded-sm"
                      />
                      <span>{first.countryCode}</span>
                    </div>
                    <button
                      type="button"
                      disabled={!first.playerId || !onPlayerSelect}
                      onClick={() => first.playerId && onPlayerSelect?.(first.playerId)}
                      className="text-left text-white text-[20px] leading-[1.15] mb-4 disabled:cursor-default"
                    >
                      <div className="font-medium">{first.firstName}</div>
                      <div className="font-extrabold">{first.lastName}</div>
                    </button>
                    <div className="bg-[#111720] text-white font-extrabold text-lg px-3 py-1 rounded shadow-md w-max">
                      {first.value}
                    </div>
                  </div>
                  
                  <PlayerPortrait imageUrl={first.imageUrl} fallbackImageUrl={first.fallbackImageUrl} featured />
                </div>
              </div>

              {/* Runners up */}
              <div className="bg-[#222a36] flex flex-col p-2 pt-3 pb-4 space-y-1">
                {others.map((player) => (
                  <div key={player.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl hover:bg-[#2b3341] transition-colors">
                    <div className="flex items-center space-x-4">
                      <PlayerPortrait imageUrl={player.imageUrl} fallbackImageUrl={player.fallbackImageUrl} />
                      <button
                        type="button"
                        disabled={!player.playerId || !onPlayerSelect}
                        onClick={() => player.playerId && onPlayerSelect?.(player.playerId)}
                        className="flex flex-col text-left text-[15px] leading-snug disabled:cursor-default"
                      >
                        <span className="text-gray-200 font-medium">{player.firstName}</span>
                        <span className="text-white font-extrabold">{player.lastName}</span>
                      </button>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2 bg-[#1b222d] px-2 py-1.5 rounded text-[11px] text-gray-200 font-bold tracking-wide">
                        <img 
                          src={player.countryFlagUrl || getFlagUrl(player.countryFlagId, player.countryCode)}
                          alt=""
                          className="w-4 h-3 object-cover rounded-sm"
                        />
                        <span>{player.countryCode}</span>
                      </div>
                      <span className="text-white font-extrabold text-[19px] w-10 text-right">{player.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {teamCode && filteredLeaders.length === 0 && (
          <div className="col-span-full text-center py-20 text-gray-500 font-medium">
            No tournament statistics are available for this team yet.
          </div>
        )}
      </div>
    </div>
  );
}
