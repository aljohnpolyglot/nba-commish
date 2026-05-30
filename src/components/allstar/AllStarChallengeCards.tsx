import React from 'react';
import { Trophy } from 'lucide-react';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { getPlayerImage } from '../central/view/bioCache';

interface PlayerChipProps {
  player: any;
  teamAbbrev?: string;
  isWinner?: boolean;
}

export const ChallengePlayerChip: React.FC<PlayerChipProps> = ({ player, teamAbbrev, isWinner }) => {
  const img = player ? getPlayerImage(player) : null;
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${isWinner ? 'border-amber-500/40 bg-amber-500/10' : 'border-slate-800 bg-slate-900/60'}`}>
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-800">
        {img ? (
          <img src={img} alt={player.name} className="h-full w-full object-cover object-top" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-black text-slate-500">
            {player?.name?.split(' ').map((n: string) => n[0]).join('') ?? '?'}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className={`truncate text-sm font-bold ${isWinner ? 'text-amber-300' : 'text-white'}`}>
          {player ? <PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover> : 'TBD'}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{teamAbbrev ?? player?.pos ?? ''}</div>
      </div>
      {isWinner && <Trophy className="ml-auto h-4 w-4 text-amber-400" />}
    </div>
  );
};

export const ChallengeEmptyState: React.FC<{ title: string; copy: string; icon: React.ReactNode }> = ({ title, copy, icon }) => (
  <div className="flex flex-col items-center justify-center py-24 text-center">
    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-slate-600">
      {icon}
    </div>
    <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
    <p className="max-w-sm text-sm text-slate-500">{copy}</p>
  </div>
);
