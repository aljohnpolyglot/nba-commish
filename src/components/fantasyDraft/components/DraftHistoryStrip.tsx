import React, { useRef } from 'react';
import { Player, getResolvedOvr } from '../types';
import { FantasyTeamLogo, TeamLogo } from '../lib/nbaBranding';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface DraftHistoryEntry {
  round: number;
  pickNumber: number;
  player: Player;
  fantasyTeamAbbrev: string;
  fantasyTeamName: string;
  fantasyTeamId?: number;
  playerId?: string;
}

interface DraftHistoryStripProps {
  history: DraftHistoryEntry[];
  userDraftSlot: number;
}

export const DraftHistoryStrip: React.FC<DraftHistoryStripProps> = ({ history, userDraftSlot }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (history.length === 0) return null;

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  // Only display history ordered by absolute pick number descending (latest first)
  const sortedHistory = [...history].reverse();

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl relative" id="draft-history-strip">
      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
        <h3 className="font-black text-[11px] uppercase tracking-wider text-amber-400">
          DRAFT LOG / PICK HISTORY
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={scrollLeft}
            className="p-1 rounded bg-slate-850 hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
            title="Scroll Left"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={scrollRight}
            className="p-1 rounded bg-slate-850 hover:bg-slate-700 text-slate-400 transition-colors cursor-pointer"
            title="Scroll Right"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Horizontally Scrollable Strip */}
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-3 overflow-x-auto scrollbar-none pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {sortedHistory.map((entry) => {
          return (
            <div
              key={entry.pickNumber}
              className="flex flex-col gap-2.5 bg-slate-950 border border-slate-800 rounded-xl p-3 min-w-[200px] max-w-[230px] shrink-0 transition-all hover:border-slate-700"
              id={`pick-card-${entry.pickNumber}`}
            >
              {/* [FANTASY TEAM LOGO] and Fantasy Team Name */}
              <div className="flex items-center gap-2">
                <FantasyTeamLogo abbrev={entry.fantasyTeamAbbrev} sizeClass="w-5 h-5" />
                <span className="text-[10px] text-slate-400 font-bold truncate uppercase">
                  {entry.fantasyTeamName.replace(' Fantasy', '')}
                </span>
              </div>

              {/* Player details */}
              <div className="flex items-center gap-2.5">
                {/* [PLAYER PORTRAIT] */}
                <div className="w-10 h-10 rounded-lg bg-slate-900 overflow-hidden border border-slate-850 shrink-0">
                  <img
                    src={entry.player.headshotUrl || `https://via.placeholder.com/40?text=${entry.player.lastName}`}
                    alt={entry.player.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  {/* Player Name */}
                  <h4 className="text-[11px] font-black text-white uppercase truncate" title={entry.player.name}>
                    {entry.player.name}
                  </h4>
                  {/* Source team, position and display OVR. */}
                  <div className="flex items-center gap-1.5">
                    <TeamLogo abbrev={entry.player.teamAbbrev} sizeClass="w-4 h-4 rounded-full" />
                    <span className="text-[9px] text-slate-400 font-bold truncate uppercase">
                      {entry.player.displayPos || entry.player.position}
                    </span>
                    <span className="text-[9px] font-black text-amber-400 font-mono shrink-0 ml-auto">
                      {getResolvedOvr(entry.player)} OVR
                    </span>
                  </div>
                </div>
              </div>

              {/* small Pick #XX */}
              <div className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                PICK #{entry.pickNumber}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
