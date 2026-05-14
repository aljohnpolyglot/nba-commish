import React from 'react';
import type { GameState } from '../../types';
import { explainerTooltip } from './competitionExplainers';

interface Props {
  competitionId?: string;
  phase?: string;
  state: Pick<GameState, 'activeCompetitions'>;
}

export const CompetitionBadge: React.FC<Props> = ({ competitionId, phase, state }) => {
  const spec = state.activeCompetitions?.find(c => c.id === competitionId);
  if (!spec) return null;
  const label = phase?.startsWith('r') ? `${spec.shortName} ${phase.toUpperCase()}` : `${spec.shortName}${phase ? ` ${phase}` : ''}`;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white cursor-help"
      style={{ backgroundColor: spec.accentColor }}
      title={explainerTooltip(competitionId)}
    >
      {label}
    </span>
  );
};
