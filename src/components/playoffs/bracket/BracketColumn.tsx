import React from 'react';
import { Game, PlayoffBracket, NBATeam } from '../../../types';
import { SeriesCard } from './SeriesCard';
import { ByeCard } from './ByeCard';

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
  ownTid?: number | null;
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
  ownTid,
}) => {
  return (
    <div className="flex flex-col shrink-0">
      {label && (
        <h3 className={`text-center text-[10px] font-bold tracking-[0.2em] mb-3 uppercase ${labelColor}`}>
          {label}
        </h3>
      )}
      <div className="flex flex-col gap-4 flex-1" style={{ justifyContent: justify }}>
        {(() => {
          const requestedNodes = (playoffs.nodes ?? []).filter(node => seriesIds.includes(node.id));
          const round = requestedNodes[0]?.roundIndex;
          const conference = requestedNodes[0]?.conference;
          const entries: Array<{ kind: 'series'; id: string; slot: number } | { kind: 'bye'; id: string; slot: number }> = seriesIds.map((id, index) => ({
            kind: 'series', id, slot: playoffs.nodes?.find(node => node.id === id)?.slotIndex ?? index,
          }));
          if (round != null && conference && conference !== 'Finals') {
            for (const bye of playoffs.byes ?? []) {
              if (bye.roundIndex === round && bye.conference === conference) entries.push({ kind: 'bye', id: bye.id, slot: bye.slotIndex });
            }
          }
          return entries.sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id)).map((entry, i) => {
          if (entry.kind === 'bye') {
            const bye = playoffs.byes?.find(row => row.id === entry.id);
            return bye ? <ByeCard key={entry.id} bye={bye} teams={teams} season={playoffs.season} /> : null;
          }
          const id = entry.id;
          const series = playoffs.series.find(s => s.id === id) ?? null;
          const node = playoffs.nodes?.find(candidate => candidate.id === id);
          return (
            <div key={id} className="relative" data-bracket-node={id}>
              <SeriesCard
                series={series}
                node={node}
                teams={teams}
                schedule={schedule}
                stateDate={stateDate}
                season={playoffs.season}
                allSeries={playoffs.series}
                isSelected={selectedSeriesId === id}
                onClick={() => onSeriesClick(id)}
                label={seriesLabels[id]}
                delay={baseDelay + i * 0.05}
                ownTid={ownTid}
              />
              <span aria-hidden className="absolute left-full top-1/2 hidden h-px w-6 bg-slate-600 md:block" />
            </div>
          );
        });
        })()}
      </div>
    </div>
  );
};
