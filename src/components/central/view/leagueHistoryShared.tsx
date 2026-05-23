import React from 'react';
import { PlayerPortrait } from '../../shared/PlayerPortrait';

export const resolveLeagueHistoryPortraitUrl = (player: any, name: string) =>
  player?.imgURL || ((player as any)?.face ? undefined : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e293b&color=94a3b8`);

type AwardCellProps = {
  award: any;
  isCurrent?: boolean;
  onClick?: () => void;
};

export const AwardCell: React.FC<AwardCellProps> = ({ award, isCurrent, onClick }) => {
  if (!award) {
    return (
      <span className={`italic text-xs ${isCurrent ? 'text-slate-500' : 'text-slate-700'}`}>
        {isCurrent ? 'TBA' : '—'}
      </span>
    );
  }

  const clickable = !!onClick;
  return (
    <div
      onClick={clickable ? (event) => { event.stopPropagation(); onClick(); } : undefined}
      className={`flex items-center gap-2 ${clickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
    >
      <PlayerPortrait
        imgUrl={award.imgURL}
        face={award.face}
        playerName={award.name}
        teamLogoUrl={award.teamLogoUrl}
        size={28}
      />
      <div className="flex flex-col leading-tight">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-white text-xs">{award.name}</span>
          {(award.count ?? 0) > 0 && (
            <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1 py-px rounded-full leading-none">
              {award.count}×
            </span>
          )}
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{award.team}</span>
      </div>
    </div>
  );
};
