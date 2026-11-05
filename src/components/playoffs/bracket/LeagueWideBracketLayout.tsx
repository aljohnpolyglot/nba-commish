import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Game, NBATeam, PlayoffBracket } from '../../../types';
import { getOpeningRoundGameCount, getPlayoffBracketCapacity, getPlayoffRoundLabel } from '../../../utils/playoffFormat';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { BracketColumn } from './BracketColumn';
import { BracketLineageList } from './BracketLineageList';

interface LeagueWideBracketLayoutProps {
  playoffs: PlayoffBracket;
  teams: NBATeam[];
  schedule: Game[];
  stateDate: string;
  roundCount: number;
  onSeriesClick: (id: string) => void;
  selectedSeriesId: string | null;
  ownTid?: number | null;
}

export const LeagueWideBracketLayout: React.FC<LeagueWideBracketLayoutProps> = ({
  playoffs,
  teams,
  schedule,
  stateDate,
  roundCount,
  onSeriesClick,
  selectedSeriesId,
  ownTid,
}) => {
  const labels = useLeagueLabels();
  const scrollRef = useRef<HTMLDivElement>(null);
  const totalRounds = Math.max(1, Math.round(roundCount));
  const fieldSize = Math.max(2, playoffs.numPlayoffTeams ?? playoffs.leagueSeeds?.length ?? getPlayoffBracketCapacity(totalRounds));
  const openingGames = getOpeningRoundGameCount(fieldSize, playoffs.numPlayoffByes ?? 0);

  const scroll = (direction: -1 | 1) => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({
      left: container.scrollLeft + direction * container.clientWidth / 2,
      behavior: 'smooth',
    });
  };

  const seriesIdsForRound = (round: number): string[] => {
    const graphIds = playoffs.nodes?.filter(node => node.roundIndex === round).map(node => node.id) ?? [];
    if (graphIds.length > 0) return graphIds;
    const expectedCount = round === 1
      ? openingGames
      : getPlayoffBracketCapacity(totalRounds) / 2 ** round;
    if (round === totalRounds) return ['Finals'];
    return Array.from({ length: expectedCount }, (_, index) => `LR${round}S${index + 1}`);
  };

  return (
    <div className="relative w-full">
      {playoffs.bracketPolicy === 'reseeded' && (
        <div className="mb-3 hidden text-center md:block">
          <span className="rounded-full border border-amber-400/40 bg-amber-950/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
            Reseeded bracket
          </span>
        </div>
      )}
      <BracketLineageList playoffs={playoffs} teams={teams} />
      <button
        type="button"
        aria-label="Scroll bracket left"
        onClick={() => scroll(-1)}
        className="absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-slate-600 bg-slate-800/80 p-2 text-white shadow-lg backdrop-blur-sm hover:bg-slate-700 md:block"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Scroll bracket right"
        onClick={() => scroll(1)}
        className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-slate-600 bg-slate-800/80 p-2 text-white shadow-lg backdrop-blur-sm hover:bg-slate-700 md:block"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div
        ref={scrollRef}
        className="hidden w-full overflow-x-auto px-2 pb-8 custom-scrollbar sm:px-4 md:block md:px-12"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="mx-auto flex min-w-max items-stretch gap-6 py-4">
          {Array.from({ length: totalRounds }, (_, index) => {
            const round = index + 1;
            return (
              <BracketColumn
                key={round}
                label={getPlayoffRoundLabel(round, totalRounds, fieldSize, labels.finals)}
                labelColor={round === totalRounds ? 'text-amber-400' : 'text-indigo-300'}
                seriesIds={seriesIdsForRound(round)}
                playoffs={playoffs}
                teams={teams}
                schedule={schedule}
                stateDate={stateDate}
                onSeriesClick={onSeriesClick}
                selectedSeriesId={selectedSeriesId}
                justify={round === 1 ? 'space-between' : 'space-around'}
                baseDelay={Math.min(0.6, round * 0.08)}
                ownTid={ownTid}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
