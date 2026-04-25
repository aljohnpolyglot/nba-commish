import React from 'react';
import HOFCard from './HallofFameCards';
import type { NBAPlayer } from '../../../../../types';

export interface HOFInductee {
  player: NBAPlayer;
  inductionYear: number;
  careerWS: number;
}

interface HOFSectionProps {
  year: number;
  inductees: HOFInductee[];
  onPlayerClick?: (player: NBAPlayer) => void;
}

const HOFSection: React.FC<HOFSectionProps> = ({ year, inductees, onPlayerClick }) => {
  return (
    <section className="relative mb-24 last:mb-0">
      {/* Year Header */}
      <div className="sticky top-0 z-10 mb-12 flex items-baseline gap-4 bg-regal-black/80 py-4 backdrop-blur-md">
        <h2 className="font-display text-6xl font-black text-white/10 md:text-[10rem]">
          {year}
        </h2>
        <div className="absolute bottom-4 left-0 flex items-center gap-4 md:bottom-8">
          <div className="h-px w-8 bg-yellow-500/50 md:w-12" />
          <span className="font-serif text-lg italic text-yellow-400 md:text-2xl">Class of {year}</span>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {inductees.map(i => (
          <HOFCard key={i.player.internalId} inductee={i} onClick={() => onPlayerClick?.(i.player)} />
        ))}
      </div>
    </section>
  );
};

export default HOFSection;
