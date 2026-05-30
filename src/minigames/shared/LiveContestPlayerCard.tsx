import React from 'react';
import { LivePlayer } from './liveContestTypes';

interface LiveContestPlayerCardProps {
  player: LivePlayer;
  isActive?: boolean;
  role?: string;
  isCompeting?: boolean;
}

const fallbackFace = (name: string) => `https://faces.basketball-gm.com/api/v1/face?seed=${encodeURIComponent(name || '')}`;

export const LiveContestPlayerCard: React.FC<LiveContestPlayerCardProps> = ({ player, isActive, role, isCompeting }) => {
  const rating = player.ratings[0];
  return (
    <div className={`relative flex overflow-hidden rounded-xl border p-3 pl-4 transition-all duration-300 ${
      isActive
        ? 'z-10 border-blue-500 bg-gradient-to-r from-[#0a192f] to-[#112240] shadow-[0_0_20px_rgba(59,130,246,0.55)]'
        : 'border-neutral-800 bg-[#0f172a]/50 opacity-70'
    } ${isCompeting && isActive ? 'shadow-[0_0_30px_rgba(249,115,22,0.75)] ring-2 ring-orange-500' : ''}`}>
      {role && (
        <div className={`absolute bottom-0 left-0 rounded-tr-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
          isActive ? 'bg-blue-500 text-white' : 'bg-neutral-800 text-neutral-400'
        }`}>
          {role}
        </div>
      )}

      <div className="z-10 mr-4 flex flex-col items-center">
        <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-slate-800 bg-neutral-800 shadow-inner">
          <img
            src={player.imgURL || fallbackFace(player.name)}
            onError={event => { event.currentTarget.src = fallbackFace(player.name); }}
            alt={player.name}
            className="relative z-10 h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className={`mt-1 text-[10px] font-black ${isActive ? 'text-blue-400' : 'text-neutral-500'}`}>
          {player.pos || 'G'}
        </div>
      </div>

      <div className="z-10 flex flex-1 items-center justify-between">
        <div className="flex min-w-0 flex-col">
          {player.firstName ? (
            <>
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">{player.firstName}</span>
              <span className={`truncate text-lg font-black uppercase leading-tight tracking-tighter ${isActive ? 'text-white' : 'text-neutral-300'}`}>
                {player.lastName}
              </span>
            </>
          ) : (
            <span className={`truncate text-base font-black uppercase leading-tight tracking-tighter ${isActive ? 'text-white' : 'text-neutral-300'}`}>
              {player.name}
            </span>
          )}
        </div>
        <div className="ml-2 flex flex-col items-end">
          <span className="font-mono text-[10px] text-neutral-500">OVR</span>
          <span className={`text-3xl font-black ${isActive ? 'text-white' : 'text-neutral-400'}`}>{rating.ovr}</span>
        </div>
      </div>

      {isActive && <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-32 bg-gradient-to-l from-blue-500/20 to-transparent" />}
    </div>
  );
};
