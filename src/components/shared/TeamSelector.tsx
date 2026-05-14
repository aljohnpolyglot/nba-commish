import React, { useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import type { NBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { getActiveLeagueTeams, resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamCountry } from '../../utils/teamCountry';
import { getCountryFlag } from '../../utils/countryFlags';

type Variant = 'grid' | 'dropdown' | 'list';
type Scope = 'active' | 'nba' | 'all' | 'nonNba';

interface Props {
  variant: Variant;
  value: number | null;
  onChange: (tid: number) => void;
  scope?: Scope;
  showFlag?: boolean;
  excludeTids?: number[];
  className?: string;
}

export const TeamSelector: React.FC<Props> = ({
  variant,
  value,
  onChange,
  scope = 'active',
  showFlag,
  excludeTids = [],
  className = '',
}) => {
  const { state } = useGame();
  const teams = useMemo(() => {
    const nonNBA = (state.nonNBATeams ?? [])
      .map(t => resolveAnyTeam(t.tid, state.teams, state.nonNBATeams ?? []))
      .filter((t): t is NBATeam => !!t);
    const scoped = scope === 'nba'
      ? state.teams
      : scope === 'nonNba'
        ? nonNBA
        : scope === 'all'
          ? [...state.teams, ...nonNBA]
          : getActiveLeagueTeams(state);
    const excluded = new Set(excludeTids);
    return scoped.filter(team => !excluded.has(team.id));
  }, [excludeTids, scope, state]);

  const autoShowFlag = showFlag ?? (scope === 'active' && (state.activeCompetitions ?? []).some(c => c.id === 'euroleague'));

  if (variant === 'dropdown') {
    return (
      <select
        value={value ?? ''}
        onChange={e => e.target.value && onChange(Number(e.target.value))}
        className={`bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white ${className}`}
      >
        <option value="">All teams</option>
        {teams.map(team => {
          const country = getTeamCountry(team, state);
          return (
            <option key={team.id} value={team.id}>
              {autoShowFlag ? `${getCountryFlag(country)} ` : ''}{getTeamFullName(team)}
            </option>
          );
        })}
      </select>
    );
  }

  const tile = (team: NBATeam) => {
    const selected = value === team.id;
    const country = getTeamCountry(team, state);
    return (
      <button
        key={team.id}
        onClick={() => onChange(team.id)}
        className={`group text-left border transition-all ${variant === 'grid'
          ? 'rounded-xl p-4 bg-slate-950/70 hover:bg-slate-900'
          : 'rounded-lg p-3 bg-slate-950/40 hover:bg-slate-900 flex items-center gap-3'} ${selected ? 'border-amber-400' : 'border-slate-800'} ${className}`}
      >
        <div className={variant === 'grid' ? 'flex flex-col items-center text-center gap-3' : 'flex items-center gap-3 w-full'}>
          <div className="h-12 w-12 shrink-0 flex items-center justify-center">
            {team.logoUrl ? <img src={team.logoUrl} alt={team.name} className="h-full w-full object-contain" referrerPolicy="no-referrer" /> : <span className="font-black text-slate-500">{team.abbrev}</span>}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-black uppercase tracking-tight text-white truncate">
              {autoShowFlag ? `${getCountryFlag(country)} ` : ''}{getTeamFullName(team)}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {(team.wins ?? 0)}-{(team.losses ?? 0)} {team.abbrev ? `· ${team.abbrev}` : ''}
            </div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className={variant === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4' : 'flex flex-col gap-2'}>
      {teams.map(tile)}
    </div>
  );
};
