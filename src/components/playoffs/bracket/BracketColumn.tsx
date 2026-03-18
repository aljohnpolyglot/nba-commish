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
}

export const BracketColumn: React.FC<BracketColumnProps> = ({
  label,
  labelColor = 'text-slate-600',
  seriesIds,
  playoffs,
  teams,
  schedule,
  stateDate,
  onSeriesClick,
  selectedSeriesId,
  justify = 'flex-start',
  seriesLabels = {},
}) => {
  return (
    <div className="flex flex-col w-44 shrink-0">
      <div className={`text-[9px] font-black uppercase tracking-widest mb-2 ${labelColor}`}>{label}</div>
      <div className="flex flex-col gap-2 flex-1" style={{ justifyContent: justify }}>
        {seriesIds.map(id => {
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
            />
          );
        })}
      </div>
    </div>
  );
};
