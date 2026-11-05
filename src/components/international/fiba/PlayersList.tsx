import React from 'react';
import { playersData } from '../../../data/fiba/playersData';

export interface FibaPlayerCard {
  playerId?: string;
  firstName: string;
  lastName: string;
  dob: string;
  teamCode: string;
  teamFlagId: string;
  teamFlagUrl?: string;
  letter: string;
}

interface PlayersListProps {
  teamCode?: string;
  players?: readonly FibaPlayerCard[];
  onPlayerSelect?: (playerId: string) => void;
}

export default function PlayersList({ teamCode, players = playersData, onPlayerSelect }: PlayersListProps) {
  const filteredPlayersData = teamCode 
    ? players.filter(p => p.teamCode === teamCode)
    : players;

  const groupedPlayers = filteredPlayersData.reduce((acc, player) => {
    if (!acc[player.letter]) {
      acc[player.letter] = [];
    }
    acc[player.letter].push(player);
    return acc;
  }, {} as Record<string, FibaPlayerCard[]>);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {Object.entries(groupedPlayers).map(([letter, players]) => (
        <div key={letter} className="mb-10">
          <h2 className="text-white text-2xl font-bold mb-6">{letter}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {players.map((player, idx) => (
              <button
                key={idx}
                type="button"
                disabled={!player.playerId || !onPlayerSelect}
                className="flex w-full items-center justify-between bg-[#1f2735] hover:bg-[#2b3341] disabled:hover:bg-[#1f2735] transition-colors p-4 rounded-[10px] text-left disabled:cursor-default"
                onClick={() => player.playerId && onPlayerSelect?.(player.playerId)}
              >
                <div className="flex items-center space-x-4">
                  <div className="flex flex-col">
                    <span className="text-white font-medium text-[16px]">
                      {player.firstName} <span className="font-extrabold">{player.lastName}</span>
                    </span>
                    <span className="text-gray-400 text-[10px] font-bold tracking-widest uppercase mt-0.5">
                      {player.dob}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2 bg-[#111720] px-2 py-1 rounded-[4px]">
                    <img 
                      src={player.teamFlagUrl || `https://assets.fiba.basketball/image/upload/w_100/f_auto/q_auto/.logoflag--light--organisation_${player.teamFlagId}?buster=20650`}
                      alt=""
                      className="w-4 h-3 object-cover rounded-sm"
                    />
                    <span className="text-white text-[11px] font-bold tracking-wide">
                      {player.teamCode}
                    </span>
                  </div>
                  <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
