import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { Trophy, ChevronLeft, ChevronRight } from 'lucide-react';
import { Game, PlayoffBracket, NBATeam } from '../../../types';
import { BracketColumn } from './BracketColumn';
import { PlayInColumn } from './PlayInColumn';
import { SeriesCard } from './SeriesCard';

interface BracketLayoutProps {
  playoffs: PlayoffBracket;
  teams: NBATeam[];
  schedule: Game[];
  stateDate: string;
  onSeriesClick: (id: string) => void;
  selectedSeriesId: string | null;
}

// Placeholder column shown before play-in completes
const TBDColumn = ({ label, color }: { label: string; color: string }) => (
  <div className="flex flex-col shrink-0">
    <h3 className={`text-center text-[10px] font-bold tracking-[0.2em] mb-3 uppercase ${color}`}>
      {label}
    </h3>
    <div className="flex-1 flex items-center justify-center bg-white/[0.02] border border-dashed border-white/10 rounded-xl w-48 min-h-[200px]">
      <span className="text-slate-700 text-[10px] font-bold">TBD</span>
    </div>
  </div>
);

export const BracketLayout: React.FC<BracketLayoutProps> = ({
  playoffs,
  teams,
  schedule,
  stateDate,
  onSeriesClick,
  selectedSeriesId,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const playInComplete = playoffs.playInComplete;

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo =
        direction === 'left'
          ? scrollLeft - clientWidth / 2
          : scrollLeft + clientWidth / 2;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative w-full">
      {/* Scroll arrows */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded-full backdrop-blur-sm border border-slate-600 shadow-lg hidden md:block"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded-full backdrop-blur-sm border border-slate-600 shadow-lg hidden md:block"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div
        ref={scrollRef}
        className="w-full overflow-x-auto pb-8 custom-scrollbar px-4 md:px-12"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="min-w-max mx-auto flex items-stretch gap-6 py-4">

          {/* West Play-In */}
          <PlayInColumn
            conference="West"
            playoffs={playoffs}
            teams={teams}
            schedule={schedule}
            stateDate={stateDate}
            onGameClick={onSeriesClick}
            selectedId={selectedSeriesId}
          />

          {/* West R1 */}
          {playInComplete ? (
            <BracketColumn
              label="West R1"
              labelColor="text-blue-400"
              seriesIds={['WR1S1', 'WR1S2', 'WR1S3', 'WR1S4']}
              playoffs={playoffs}
              teams={teams}
              schedule={schedule}
              stateDate={stateDate}
              onSeriesClick={onSeriesClick}
              selectedSeriesId={selectedSeriesId}
              justify="space-between"
              baseDelay={0.2}
            />
          ) : (
            <TBDColumn label="West R1" color="text-blue-400" />
          )}

          {/* West Semis */}
          {playInComplete ? (
            <BracketColumn
              label="West Semis"
              labelColor="text-blue-400"
              seriesIds={['WR2S1', 'WR2S2']}
              playoffs={playoffs}
              teams={teams}
              schedule={schedule}
              stateDate={stateDate}
              onSeriesClick={onSeriesClick}
              selectedSeriesId={selectedSeriesId}
              justify="space-around"
              seriesLabels={{ WR2S1: 'Semi TBD', WR2S2: 'Semi TBD' }}
              baseDelay={0.35}
            />
          ) : (
            <TBDColumn label="West Semis" color="text-blue-400" />
          )}

          {/* West Finals */}
          {playInComplete ? (
            <BracketColumn
              label="West Finals"
              labelColor="text-blue-400"
              seriesIds={['WR3S1']}
              playoffs={playoffs}
              teams={teams}
              schedule={schedule}
              stateDate={stateDate}
              onSeriesClick={onSeriesClick}
              selectedSeriesId={selectedSeriesId}
              justify="center"
              seriesLabels={{ WR3S1: 'WCF TBD' }}
              baseDelay={0.5}
            />
          ) : (
            <TBDColumn label="West Finals" color="text-blue-400" />
          )}

          {/* NBA Finals — center column with Trophy */}
          <div className="flex flex-col justify-center px-4 relative shrink-0">
            <h3 className="text-center text-[10px] font-bold tracking-[0.2em] uppercase text-amber-400/80 mb-3">
              NBA Finals
            </h3>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.2, type: 'spring' }}
              className="absolute -top-4 left-1/2 -translate-x-1/2"
            >
              <Trophy className="w-8 h-8 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
            </motion.div>
            {playInComplete ? (
              <SeriesCard
                series={playoffs.series.find(s => s.id === 'Finals') ?? null}
                teams={teams}
                schedule={schedule}
                stateDate={stateDate}
                isSelected={selectedSeriesId === 'Finals'}
                onClick={() => onSeriesClick('Finals')}
                label="Finals TBD"
                delay={0.65}
              />
            ) : (
              <div className="flex items-center justify-center bg-white/[0.02] border border-dashed border-amber-500/20 rounded-xl w-48 min-h-[80px]">
                <span className="text-amber-900 text-[10px] font-bold">TBD</span>
              </div>
            )}
          </div>

          {/* East Finals */}
          {playInComplete ? (
            <BracketColumn
              label="East Finals"
              labelColor="text-red-400"
              seriesIds={['ER3S1']}
              playoffs={playoffs}
              teams={teams}
              schedule={schedule}
              stateDate={stateDate}
              onSeriesClick={onSeriesClick}
              selectedSeriesId={selectedSeriesId}
              justify="center"
              seriesLabels={{ ER3S1: 'ECF TBD' }}
              baseDelay={0.5}
            />
          ) : (
            <TBDColumn label="East Finals" color="text-red-400" />
          )}

          {/* East Semis */}
          {playInComplete ? (
            <BracketColumn
              label="East Semis"
              labelColor="text-red-400"
              seriesIds={['ER2S1', 'ER2S2']}
              playoffs={playoffs}
              teams={teams}
              schedule={schedule}
              stateDate={stateDate}
              onSeriesClick={onSeriesClick}
              selectedSeriesId={selectedSeriesId}
              justify="space-around"
              seriesLabels={{ ER2S1: 'Semi TBD', ER2S2: 'Semi TBD' }}
              baseDelay={0.35}
            />
          ) : (
            <TBDColumn label="East Semis" color="text-red-400" />
          )}

          {/* East R1 */}
          {playInComplete ? (
            <BracketColumn
              label="East R1"
              labelColor="text-red-400"
              seriesIds={['ER1S1', 'ER1S2', 'ER1S3', 'ER1S4']}
              playoffs={playoffs}
              teams={teams}
              schedule={schedule}
              stateDate={stateDate}
              onSeriesClick={onSeriesClick}
              selectedSeriesId={selectedSeriesId}
              justify="space-between"
              baseDelay={0.2}
            />
          ) : (
            <TBDColumn label="East R1" color="text-red-400" />
          )}

          {/* East Play-In */}
          <PlayInColumn
            conference="East"
            playoffs={playoffs}
            teams={teams}
            schedule={schedule}
            stateDate={stateDate}
            onGameClick={onSeriesClick}
            selectedId={selectedSeriesId}
          />

        </div>
      </div>
    </div>
  );
};
