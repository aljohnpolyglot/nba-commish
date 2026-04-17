import React from 'react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { calculateTeamStrength } from '../../../../../utils/playerRatings';
import { NBATeam, NBAPlayer } from '../../../../../types';

interface HomeProps {
  onSelectTeam: (teamId: number) => void;
}

export function Home({ onSelectTeam }: HomeProps) {
  const { state } = useGame();
  const teams = state.teams || [];
  const players = state.players || [];

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      <div className="flex justify-between items-end border-b border-[#30363d] pb-4">
        <div>
          <h1 className="text-4xl font-black italic uppercase tracking-tighter text-[#e6edf3]">Select Franchise</h1>
          <p className="text-[#8b949e] font-medium mt-1">Choose a team to manage their front office operations.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {[...teams].sort((a, b) => a.name.localeCompare(b.name)).map((team) => {
          const roster = players.filter(p => p.tid === team.id && p.status === 'Active');
          const teamOverall = calculateTeamStrength(team.id, players);
          const teamColor = team.colors?.[0] || '#552583';

          return (
            <button
              key={team.id}
              onClick={() => onSelectTeam(team.id)}
              className={cn(
                "group relative flex flex-col items-center p-4 rounded-xl border transition-all duration-300 overflow-hidden text-left",
                "bg-[#161b22]/40 border-[#30363d] hover:border-[#8b949e] hover:bg-[#161b22]/80"
              )}
            >
              {/* Background Glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 blur-xl"
                style={{ backgroundColor: teamColor }}
              />

              <div className="h-20 w-20 mb-4 relative z-10 flex items-center justify-center">
                {team.logoUrl ? (
                  <img
                    src={team.logoUrl}
                    alt={team.name}
                    className="w-full h-full object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#21262d] flex items-center justify-center font-black text-xl text-[#8b949e]">
                    {team.abbrev}
                  </div>
                )}
              </div>

              <div className="w-full text-center relative z-10">
                <h3 className="font-black uppercase tracking-tight text-sm text-[#e6edf3] leading-tight mb-1">
                  {team.region && !team.name.includes(team.region) ? `${team.region} ${team.name}` : team.name}
                </h3>
                <div className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">
                  {team.wins}-{team.losses} | {roster.length} Players
                </div>

                <div className="mt-3 pt-3 border-t border-[#30363d]/50 flex justify-between items-center w-full">
                  <span className="text-[9px] text-[#8b949e] uppercase truncate mr-2">Team OVR</span>
                  <span className="text-[10px] font-black text-[#FDB927]">{teamOverall}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
