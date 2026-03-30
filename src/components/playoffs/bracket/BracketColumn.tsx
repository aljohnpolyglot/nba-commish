import React from 'react';
import { Game, PlayoffBracket, NBATeam } from '../../../types';
import { SeriesCard } from './SeriesCard';

interface BracketColumnProps {
  label: string;
  labelColor?: string;
  seriesIds: string[];
  playoffs: PlayoffBracket;
  teams: NBATeam[];
  schedule: Game[];
  stateDate: string;
  onSeriesClick: (id: string) => void;
  selectedSeriesId: string | null;
  justify?: 'flex-start' | 'center' | 'space-around' | 'space-between';
  seriesLabels?: Record<string, string>;
  baseDelay?: number;
}

export const BracketColumn: React.FC<BracketColumnProps> = ({
  label,
  labelColor = 'text-slate-500',
  seriesIds,
  playoffs,
  teams,
  schedule,
  stateDate,
  onSeriesClick,
  selectedSeriesId,
  justify = 'flex-start',
  seriesLabels = {},
  baseDelay = 0,
}) => {
  return (
    <div className="flex flex-col shrink-0">
      {label && (
        <h3 className={`text-center text-[10px] font-bold tracking-[0.2em] mb-3 uppercase ${labelColor}`}>
          {label}
        </h3>
      )}
      <div className="flex flex-col gap-4 flex-1" style={{ justifyContent: justify }}>
        {seriesIds.map((id, i) => {
          const series = playoffs.series.find(s => s.id === id) ?? null;
          return (
            <SeriesCard
              key={id}
              series={series}
              teams={teams}
              schedule={schedule}
              stateDate={stateDate}
              isSelected={selectedSeriesId === id}
              onClick={() => onSeriesClick(id)}
              label={seriesLabels[id]}
              delay={baseDelay + i * 0.05}
            />
          );
        })}
      </div>
    </div>
  );
};
