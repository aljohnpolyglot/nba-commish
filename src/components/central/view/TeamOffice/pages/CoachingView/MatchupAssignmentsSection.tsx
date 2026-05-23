import React from 'react';
import { ChevronLeft, ChevronRight, Crosshair, EyeOff } from 'lucide-react';

interface AssignmentListProps {
  title: string;
  icon: React.ReactNode;
  labels: string[];
  ids: string[];
  textClassName: string;
  onCycle: (slot: number, direction: 1 | -1) => void;
  formatPlayerName: (id: string) => string;
  borderClassName: string;
}

interface MatchupAssignmentsSectionProps {
  lockdownIds: string[];
  hideIds: string[];
  formatPlayerName: (id: string) => string;
  onCycleLockdown: (slot: number, direction: 1 | -1) => void;
  onCycleHide: (slot: number, direction: 1 | -1) => void;
}

function AssignmentList({
  title,
  icon,
  labels,
  ids,
  textClassName,
  onCycle,
  formatPlayerName,
  borderClassName,
}: AssignmentListProps) {
  return (
    <div className={`bg-[#1a1a1a] border rounded p-3 ${borderClassName}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h6 className={`text-[10px] md:text-xs font-bold uppercase tracking-wider ${textClassName}`}>{title}</h6>
      </div>
      {labels.map((label, idx) => (
        <div key={label} className="flex justify-between items-center bg-[#0d0d0d] p-2 rounded mb-1.5 border border-gray-800 last:mb-0">
          <span className="text-[10px] md:text-xs font-bold text-slate-300 w-24 md:w-28">{label}</span>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <button
              onClick={() => onCycle(idx, -1)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <ChevronLeft size={14} />
            </button>
            <span className={`font-bold text-xs md:text-sm w-32 md:w-40 text-center truncate ${textClassName}`}>
              {formatPlayerName(ids[idx])}
            </span>
            <button
              onClick={() => onCycle(idx, 1)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MatchupAssignmentsSection({
  lockdownIds,
  hideIds,
  formatPlayerName,
  onCycleLockdown,
  onCycleHide,
}: MatchupAssignmentsSectionProps) {
  return (
    <div>
      <h5 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-2 mt-4">Matchup Assignments</h5>
      <p className="text-[10px] text-slate-500 mb-3">
        Lockdowns get the toughest matchups — Hides stay away from elite scorers.
      </p>

      <div className="space-y-3">
        <AssignmentList
          title="Lockdown Priority"
          icon={<Crosshair size={12} className="text-rose-400" />}
          labels={['LOCKDOWN 1', 'LOCKDOWN 2', 'LOCKDOWN 3']}
          ids={lockdownIds}
          textClassName="text-rose-300"
          onCycle={onCycleLockdown}
          formatPlayerName={formatPlayerName}
          borderClassName="border-rose-900/40"
        />
        <AssignmentList
          title="Hide From Scorers"
          icon={<EyeOff size={12} className="text-sky-400" />}
          labels={['HIDE 1', 'HIDE 2', 'HIDE 3']}
          ids={hideIds}
          textClassName="text-sky-300"
          onCycle={onCycleHide}
          formatPlayerName={formatPlayerName}
          borderClassName="border-sky-900/40"
        />
      </div>
    </div>
  );
}
