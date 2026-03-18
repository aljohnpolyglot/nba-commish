import React from 'react';
import { Game, PlayoffBracket, NBATeam } from '../../../types';
import { BracketColumn } from './BracketColumn';
import { PlayInColumn } from './PlayInColumn';

interface BracketLayoutProps {
  playoffs: PlayoffBracket;
  teams: NBATeam[];
  schedule: Game[];
  stateDate: string;
  onSeriesClick: (id: string) => void;
  selectedSeriesId: string | null;
}

export const BracketLayout: React.FC<BracketLayoutProps> = ({
  playoffs,
  teams,
  schedule,
  stateDate,
  onSeriesClick,
  selectedSeriesId,
}) => {
  const playInComplete = playoffs.playInComplete;

  return (
    <div>
      <div className="overflow-x-auto pb-4 -mx-6 px-6 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex items-stretch gap-3 min-w-max min-h-[calc(100vh-200px)]">

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
            label="West · Round 1"
            labelColor="text-blue-400"
            seriesIds={['WR1S1', 'WR1S2', 'WR1S3', 'WR1S4']}
            playoffs={playoffs}
            teams={teams}
            schedule={schedule}
            stateDate={stateDate}
            onSeriesClick={onSeriesClick}
            selectedSeriesId={selectedSeriesId}
            justify="space-between"
          />
        ) : (
          <div className="flex flex-col w-44 shrink-0">
            <div className="text-[9px] font-black uppercase tracking-widest mb-2 text-blue-400">West · Round 1</div>
            <div className="flex-1 flex items-center justify-center bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
              <span className="text-slate-700 text-[10px] font-bold text-center px-2">Bracket TBD</span>
            </div>
          </div>
        )}

        {/* West R2 */}
        {playInComplete ? (
          <BracketColumn
            label="West · Round 2"
            labelColor="text-blue-400"
            seriesIds={['WR2S1', 'WR2S2']}
            playoffs={playoffs}
            teams={teams}
            schedule={schedule}
            stateDate={stateDate}
            onSeriesClick={onSeriesClick}
            selectedSeriesId={selectedSeriesId}
            justify="space-around"
            seriesLabels={{ WR2S1: 'Round 2 TBD', WR2S2: 'Round 2 TBD' }}
          />
        ) : (
          <div className="flex flex-col w-44 shrink-0">
            <div className="text-[9px] font-black uppercase tracking-widest mb-2 text-blue-400">West · Round 2</div>
            <div className="flex-1 flex items-center justify-center bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
              <span className="text-slate-700 text-[10px] font-bold">TBD</span>
            </div>
          </div>
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
          />
        ) : (
          <div className="flex flex-col w-44 shrink-0">
            <div className="text-[9px] font-black uppercase tracking-widest mb-2 text-blue-400">West Finals</div>
            <div className="flex-1 flex items-center justify-center bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
              <span className="text-slate-700 text-[10px] font-bold">TBD</span>
            </div>
          </div>
        )}

        {/* NBA Finals */}
        <div className="flex flex-col w-44 shrink-0">
          <div className="text-[9px] font-black uppercase tracking-widest mb-2 text-yellow-500">🏆 NBA Finals</div>
          <div className="flex-1 flex flex-col justify-center">
            {playInComplete ? (
              <BracketColumn
                label=""
                seriesIds={['Finals']}
                playoffs={playoffs}
                teams={teams}
                schedule={schedule}
                stateDate={stateDate}
                onSeriesClick={onSeriesClick}
                selectedSeriesId={selectedSeriesId}
                justify="center"
                seriesLabels={{ Finals: 'Finals TBD' }}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-white/[0.02] border border-dashed border-yellow-500/20 rounded-xl">
                <span className="text-yellow-900 text-[10px] font-bold">TBD</span>
              </div>
            )}
          </div>
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
          />
        ) : (
          <div className="flex flex-col w-44 shrink-0">
            <div className="text-[9px] font-black uppercase tracking-widest mb-2 text-red-400">East Finals</div>
            <div className="flex-1 flex items-center justify-center bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
              <span className="text-slate-700 text-[10px] font-bold">TBD</span>
            </div>
          </div>
        )}

        {/* East R2 */}
        {playInComplete ? (
          <BracketColumn
            label="East · Round 2"
            labelColor="text-red-400"
            seriesIds={['ER2S1', 'ER2S2']}
            playoffs={playoffs}
            teams={teams}
            schedule={schedule}
            stateDate={stateDate}
            onSeriesClick={onSeriesClick}
            selectedSeriesId={selectedSeriesId}
            justify="space-around"
            seriesLabels={{ ER2S1: 'Round 2 TBD', ER2S2: 'Round 2 TBD' }}
          />
        ) : (
          <div className="flex flex-col w-44 shrink-0">
            <div className="text-[9px] font-black uppercase tracking-widest mb-2 text-red-400">East · Round 2</div>
            <div className="flex-1 flex items-center justify-center bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
              <span className="text-slate-700 text-[10px] font-bold">TBD</span>
            </div>
          </div>
        )}

        {/* East R1 */}
        {playInComplete ? (
          <BracketColumn
            label="East · Round 1"
            labelColor="text-red-400"
            seriesIds={['ER1S1', 'ER1S2', 'ER1S3', 'ER1S4']}
            playoffs={playoffs}
            teams={teams}
            schedule={schedule}
            stateDate={stateDate}
            onSeriesClick={onSeriesClick}
            selectedSeriesId={selectedSeriesId}
            justify="space-between"
          />
        ) : (
          <div className="flex flex-col w-44 shrink-0">
            <div className="text-[9px] font-black uppercase tracking-widest mb-2 text-red-400">East · Round 1</div>
            <div className="flex-1 flex items-center justify-center bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
              <span className="text-slate-700 text-[10px] font-bold text-center px-2">Bracket TBD</span>
            </div>
          </div>
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
