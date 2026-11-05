import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import type { StatType, TeamStatRow } from './TeamStatsView';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';

type SortOption = { field: string; label: string };

const COMMON: SortOption[] = [
  { field: 'team', label: 'Team' }, { field: 'g', label: 'Games' },
  { field: 'wins', label: 'Wins' }, { field: 'losses', label: 'Losses' },
  { field: 'winPct', label: 'Win %' }, { field: 'age', label: 'Age' },
];

const BASIC: SortOption[] = [
  { field: 'pts', label: 'Points' }, { field: 'oppg', label: 'Opponent Points' }, { field: 'mov', label: 'Margin' },
  { field: 'fgm', label: 'FG Made' }, { field: 'fga', label: 'FG Attempts' }, { field: 'fgp', label: 'FG %' },
  { field: 'tpm', label: '3P Made' }, { field: 'tpa', label: '3P Attempts' }, { field: 'tpp', label: '3P %' },
  { field: 'twom', label: '2P Made' }, { field: 'twoa', label: '2P Attempts' }, { field: 'twop', label: '2P %' },
  { field: 'ftm', label: 'FT Made' }, { field: 'fta', label: 'FT Attempts' }, { field: 'ftp', label: 'FT %' },
  { field: 'orb', label: 'Offensive Rebounds' }, { field: 'drb', label: 'Defensive Rebounds' }, { field: 'trb', label: 'Rebounds' },
  { field: 'ast', label: 'Assists' }, { field: 'stl', label: 'Steals' }, { field: 'blk', label: 'Blocks' },
  { field: 'tov', label: 'Turnovers' }, { field: 'pf', label: 'Fouls' },
];

const OPPONENT: SortOption[] = BASIC.map(option => {
  const opponentFields: Record<string, string> = {
    pts: 'oppg', oppg: 'pts',
    fgm: 'oppFgm', fga: 'oppFga', fgp: 'oppFgp', tpm: 'oppTpm', tpa: 'oppTpa', tpp: 'oppTpp',
    twom: 'oppTwom', twoa: 'oppTwoa', twop: 'oppTwop', ftm: 'oppFtm', fta: 'oppFta', ftp: 'oppFtp',
    orb: 'oppOrb', drb: 'oppDrb', trb: 'oppTrb', ast: 'oppAst', stl: 'oppStl', blk: 'oppBlk', tov: 'oppTov', pf: 'oppPf',
  };
  return { ...option, field: opponentFields[option.field] ?? option.field };
});

const SHOT: SortOption[] = [
  { field: 'rimFgm', label: 'Rim Makes' }, { field: 'rimFga', label: 'Rim Attempts' }, { field: 'rimFgp', label: 'Rim %' },
  { field: 'lpFgm', label: 'Low Post Makes' }, { field: 'lpFga', label: 'Low Post Attempts' }, { field: 'lpFgp', label: 'Low Post %' },
  { field: 'mrFgm', label: 'Mid-Range Makes' }, { field: 'mrFga', label: 'Mid-Range Attempts' }, { field: 'mrFgp', label: 'Mid-Range %' },
  { field: 'slTpm', label: '3P Makes' }, { field: 'slTpa', label: '3P Attempts' }, { field: 'slTpp', label: '3P %' },
  { field: 'pip', label: 'Paint Points' }, { field: 'dunks', label: 'Dunks' }, { field: 'techs', label: 'Technical Fouls' },
  { field: 'dd', label: 'Double-Doubles' }, { field: 'td', label: 'Triple-Doubles' }, { field: 'qd', label: 'Quadruple-Doubles' }, { field: 'fiveX5', label: '5×5' },
];

const ADVANCED: SortOption[] = [
  { field: 'pw', label: 'Expected Wins' }, { field: 'pl', label: 'Expected Losses' },
  { field: 'ortg', label: 'Offensive Rating' }, { field: 'drtg', label: 'Defensive Rating' }, { field: 'nrtg', label: 'Net Rating' },
  { field: 'pace', label: 'Pace' }, { field: 'threePar', label: '3P Attempt Rate' }, { field: 'ftr', label: 'Free Throw Rate' },
  { field: 'efgPct', label: 'Effective FG %' }, { field: 'tovPct', label: 'Turnover %' }, { field: 'orbPct', label: 'Offensive Rebound %' },
  { field: 'ftFga', label: 'FT / FGA' }, { field: 'dEfgPct', label: 'Defensive eFG %' }, { field: 'dTovPct', label: 'Forced Turnover %' },
  { field: 'drbPct', label: 'Defensive Rebound %' }, { field: 'dFtFga', label: 'Opponent FT / FGA' },
];

interface Props {
  rows: TeamStatRow[];
  statType: StatType;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  displaySeason: number;
  ownTid: number | null;
  fourPointEnabled: boolean;
  onSortField: (field: string) => void;
  onToggleSort: () => void;
  onTeamSelect: (tid: number) => void;
}

export const TeamStatsMobileCards: React.FC<Props> = ({
  rows, statType, sortField, sortOrder, displaySeason, ownTid, fourPointEnabled,
  onSortField, onToggleSort, onTeamSelect,
}) => {
  const fourPoint = fourPointEnabled && (statType === 'team' || statType === 'opponent') ? [
    { field: statType === 'opponent' ? 'oppFpm' : 'fpm', label: '4P Made' },
    { field: statType === 'opponent' ? 'oppFpa' : 'fpa', label: '4P Attempts' },
    { field: statType === 'opponent' ? 'oppFpp' : 'fpp', label: '4P %' },
  ] : [];
  const body = statType === 'advanced' ? ADVANCED
    : statType === 'shotLocations' ? SHOT
      : statType === 'oppShotLocations' ? SHOT.map(option => ({ ...option, field: `opp${option.field[0].toUpperCase()}${option.field.slice(1)}` }))
        : statType === 'opponent' ? OPPONENT
          : BASIC;
  const options = [...COMMON, ...body, ...fourPoint];
  const selectedLabel = options.find(option => option.field === sortField)?.label ?? sortField;
  const format = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(Number.isInteger(value) ? 0 : 1)
    : String(value ?? '—');

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2">
        <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
        <select value={sortField} onChange={event => onSortField(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white">
          {options.map(option => <option key={option.field} value={option.field}>{option.label}</option>)}
        </select>
        <button type="button" onClick={onToggleSort} className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-black text-slate-300">
          {sortOrder === 'desc' ? '↓' : '↑'}
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto p-3">
        {rows.map(row => {
          const snapshot = getHistoricalTeamSnapshot(row.team, displaySeason);
          const teamName = getTeamFullName(snapshot);
          const selectedValue = sortField === 'team'
            ? teamName
            : row.sourceOffenseOnly && (sortField === 'oppg' || sortField === 'mov')
              ? '—'
              : (row as unknown as Record<string, unknown>)[sortField];
          return (
            <article key={row.team.id} className={`rounded-xl border p-3 ${row.team.id === ownTid ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-slate-800 bg-slate-900/50'}`}>
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => onTeamSelect(row.team.id)} className="flex min-w-0 items-center gap-2 text-left">
                  {snapshot.logoUrl ? <img src={snapshot.logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain" /> : <span className="h-8 w-8 shrink-0 rounded bg-slate-800" />}
                  <span><span className="block truncate text-sm font-black text-white">{teamName}</span><span className="text-[10px] font-bold text-slate-500">{row.wins}–{row.losses} · {row.g} games</span></span>
                </button>
                <div className="shrink-0 text-right"><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">{selectedLabel}</div><div className="text-base font-black tabular-nums text-indigo-300">{format(selectedValue)}</div></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-2 text-center">
                {(statType === 'advanced'
                  ? [['ORtg', row.ortg], ['DRtg', row.drtg], ['Net', row.nrtg]]
                  : [['PTS', row.pts], ['OPP', row.sourceOffenseOnly ? '—' : row.oppg], ['MOV', row.sourceOffenseOnly ? '—' : row.mov]]
                ).map(([label, value]) => <div key={String(label)}><div className="text-[9px] font-black uppercase text-slate-600">{label}</div><div className="text-xs font-bold text-slate-200">{format(value)}</div></div>)}
              </div>
            </article>
          );
        })}
        {rows.length === 0 && <div className="py-12 text-center text-sm text-slate-500">No team stats found for the selected filters.</div>}
      </div>
    </div>
  );
};
