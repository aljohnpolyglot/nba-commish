import React from 'react';
import { Globe2, Shield, Trophy } from 'lucide-react';
import type { CompetitionSpec } from '../../services/competition/types';

interface Props {
  competitions: CompetitionSpec[];
  activeId: string;
  primaryCompetitionId?: string;
  onSelect: (competitionId: string) => void;
}

function competitionLabel(spec: CompetitionSpec, primaryCompetitionId?: string): string {
  if (spec.id === primaryCompetitionId) return 'League';
  if (spec.id === 'euroleague' || spec.id === 'eurocup') return 'Europe';
  if (spec.qualificationRule === 'domestic-titleholders') return 'Super Cup';
  if (spec.domesticParentId) return 'Cup';
  return 'Competition';
}

function CompetitionIcon({ spec, primaryCompetitionId }: { spec: CompetitionSpec; primaryCompetitionId?: string }) {
  if (spec.id === 'euroleague' || spec.id === 'eurocup') return <Globe2 className="h-3.5 w-3.5" />;
  if (spec.id === primaryCompetitionId) return <Shield className="h-3.5 w-3.5" />;
  return <Trophy className="h-3.5 w-3.5" />;
}

export const CompetitionSwitcher: React.FC<Props> = ({
  competitions,
  activeId,
  primaryCompetitionId,
  onSelect,
}) => {
  if (competitions.length < 2) return null;

  return (
    <nav
      aria-label="Competitions"
      className="shrink-0 overflow-x-auto border-b border-slate-800 bg-slate-950 px-2 py-2 sm:px-3"
    >
      <div className="flex min-w-max items-center gap-1.5">
        {competitions.map(spec => {
          const active = spec.id === activeId;
          return (
            <button
              key={spec.id}
              type="button"
              onClick={() => onSelect(spec.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                active
                  ? 'bg-slate-800 text-white'
                  : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-white'
              }`}
              style={active ? { borderColor: `${spec.accentColor}88`, boxShadow: `inset 0 -2px 0 ${spec.accentColor}` } : undefined}
            >
              <span style={active ? { color: spec.accentColor } : undefined}>
                <CompetitionIcon spec={spec} primaryCompetitionId={primaryCompetitionId} />
              </span>
              <span>
                <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                  {competitionLabel(spec, primaryCompetitionId)}
                </span>
                <span className="block max-w-[150px] truncate text-[11px] font-black sm:max-w-[220px] sm:text-xs">
                  {spec.shortName || spec.displayName}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
