import React from 'react';
import { PlayerNameWithHover } from '../../shared/PlayerNameWithHover';
import {
  ComputedRow,
  fmt0,
  fmt1,
  fmt3,
  getActivePlayerStatsColumns,
  getPlayerStatsPhaseLabel,
  getPlayerStatsTypeLabel,
  Phase,
  SeasonMode,
  SortField,
  StatType,
} from './PlayerStatsShared';

interface PlayerStatsTableProps {
  season: SeasonMode;
  statType: StatType;
  phase: Phase;
  cupShort: string;
  cupChampion: string;
  fourPointEnabled: boolean;
  ownTid: number | null;
  showFilters: boolean;
  columnFilters: Record<string, string>;
  setColumnFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  sortField: SortField;
  sortOrder: 'asc' | 'desc';
  onSort: (field: SortField) => void;
  filteredRows: ComputedRow[];
  pageRows: ComputedRow[];
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  perPage: number;
  totalPages: number;
  brefRowsSize: number;
  onPlayerSelect: (row: ComputedRow) => void;
  onTeamSelect: (abbrev: string) => void;
}

const pctFields: SortField[] = ['fgPct', 'tpPct', 'fpPct', 'twopPct', 'efgPct', 'ftPct'];

function seasonBadgeRow(row: ComputedRow, cupChampion: string) {
  const awards = row.player.awards ?? [];
  const targetSeason = typeof row.season === 'number' ? row.season : null;
  if (!targetSeason) return null;
  const isChamp = awards.some(award => {
    if (award.season !== targetSeason || !award.type) return false;
    const type = award.type.toLowerCase();
    return type.includes('champion') && !type.includes('cup');
  });
  const isCupChamp = awards.some(
    award => award.season === targetSeason && award.type?.toLowerCase() === 'nba cup champion',
  );
  const isAllStar = awards.some(
    award =>
      award.season === targetSeason &&
      (award.type?.toLowerCase().includes('all-star') || award.type?.toLowerCase() === 'allstar'),
  );
  return (
    <>
      {isChamp && <span className="ml-1 text-[9px]" title={`${targetSeason} Champion`}>💍</span>}
      {isCupChamp && <span className="ml-1 text-[9px]" title={`${targetSeason} ${cupChampion}`}>🏆</span>}
      {isAllStar && <span className="ml-1 text-[9px]" title={`${targetSeason} All-Star`}>⭐</span>}
    </>
  );
}

export function PlayerStatsTable({
  season,
  statType,
  phase,
  cupShort,
  cupChampion,
  fourPointEnabled,
  ownTid,
  showFilters,
  columnFilters,
  setColumnFilters,
  sortField,
  sortOrder,
  onSort,
  filteredRows,
  pageRows,
  currentPage,
  setCurrentPage,
  perPage,
  totalPages,
  brefRowsSize,
  onPlayerSelect,
  onTeamSelect,
}: PlayerStatsTableProps) {
  const activeCols = getActivePlayerStatsColumns(statType, fourPointEnabled);
  const seasonLabel =
    season === 'career'
      ? 'Career'
      : season === 'all'
        ? 'All Time'
        : `${(season as number) - 1}–${String(season).slice(2)}`;
  const typeLabel = getPlayerStatsTypeLabel(statType);
  const phaseLabel = getPlayerStatsPhaseLabel(phase, cupShort);
  const thCls = (field: SortField) =>
    `px-2 py-2 text-right cursor-pointer select-none whitespace-nowrap font-semibold transition-colors hover:text-white text-[11px] ${
      sortField === field ? 'text-indigo-400' : 'text-slate-400'
    }`;
  const arrow = (field: SortField) => (sortField === field ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : '');
  const rowBg = (index: number, isHof: boolean, isOwn: boolean) => {
    if (isOwn) return 'bg-indigo-500/10 hover:bg-indigo-500/15';
    if (isHof) return 'bg-rose-950/10 hover:bg-rose-900/15';
    return index % 2 === 0 ? 'hover:bg-slate-800/40' : 'bg-slate-900/20 hover:bg-slate-800/40';
  };
  const stickyBg = (index: number, isHof: boolean, isOwn: boolean) =>
    isOwn ? 'rgb(30,27,75)' : isHof ? 'rgb(69,10,10)' : index % 2 === 0 ? 'rgb(2,6,23)' : 'rgb(9,14,27)';

  return (
    <>
      <div className="shrink-0 px-3 sm:px-4 py-1 border-b border-slate-800/40 flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          <span className="text-rose-400">■</span> Hall of Fame
          {typeof season === 'number' && <><span className="ml-3">💍</span> Champion</>}
          {typeof season === 'number' && <><span className="ml-3">🏆</span> Cup Champion</>}
          {typeof season === 'number' && <><span className="ml-3">⭐</span> All-Star</>}
          {brefRowsSize > 0 && <span className="ml-3 text-slate-600">† bref career</span>}
        </span>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {seasonLabel} · {typeLabel} · {phaseLabel}
        </span>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <table
          className="w-full text-xs text-left border-collapse"
          style={{ minWidth: statType === 'advanced' ? 1600 : statType === 'shotLocations' ? 1050 : fourPointEnabled ? 1480 : 1360 }}
        >
          <thead className="sticky top-0 z-20 bg-slate-900 border-b-2 border-slate-700">
            <tr>
              <th className="px-2 py-2 text-right text-slate-600 text-[11px] w-8 sticky left-0 bg-slate-900 z-30">#</th>
              <th
                className="px-3 py-2 text-left cursor-pointer select-none font-semibold text-[11px] text-slate-400 hover:text-white sticky left-8 bg-slate-900 z-30 whitespace-nowrap transition-colors"
                onClick={() => onSort('name')}
              >
                Name{arrow('name')}
                {showFilters && (
                  <input
                    className="mt-1 w-24 block bg-slate-800 border border-slate-700 text-white rounded px-1.5 py-0.5 text-[10px]"
                    placeholder="filter"
                    value={columnFilters.name ?? ''}
                    onChange={e => setColumnFilters(prev => ({ ...prev, name: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </th>
              <th
                className="px-2 py-2 text-left cursor-pointer select-none font-semibold text-[11px] text-slate-400 hover:text-white whitespace-nowrap transition-colors"
                onClick={() => onSort('pos')}
              >
                Pos{arrow('pos')}
                {showFilters && (
                  <input
                    className="mt-1 w-9 block bg-slate-800 border border-slate-700 text-white rounded px-1.5 py-0.5 text-[10px]"
                    placeholder="…"
                    value={columnFilters.pos ?? ''}
                    onChange={e => setColumnFilters(prev => ({ ...prev, pos: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </th>
              <th className={thCls('age')} onClick={() => onSort('age')}>
                Age{arrow('age')}
                {showFilters && (
                  <input
                    className="mt-1 w-9 block bg-slate-800 border border-slate-700 text-white rounded px-1 py-0.5 text-[10px]"
                    placeholder="…"
                    value={columnFilters.age ?? ''}
                    onChange={e => setColumnFilters(prev => ({ ...prev, age: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </th>
              <th
                className="px-2 py-2 text-left cursor-pointer select-none font-semibold text-[11px] text-slate-400 hover:text-white whitespace-nowrap transition-colors"
                onClick={() => onSort('team')}
              >
                Team{arrow('team')}
                {showFilters && (
                  <input
                    className="mt-1 w-10 block bg-slate-800 border border-slate-700 text-white rounded px-1.5 py-0.5 text-[10px]"
                    placeholder="…"
                    value={columnFilters.team ?? ''}
                    onChange={e => setColumnFilters(prev => ({ ...prev, team: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </th>
              {season === 'all' && <th className="px-2 py-2 text-right text-slate-400 font-semibold text-[11px] whitespace-nowrap">Season</th>}
              {activeCols.map(col => (
                <th key={col.key} className={thCls(col.key)} title={col.title} onClick={() => onSort(col.key)}>
                  {col.label}
                  {arrow(col.key)}
                  {showFilters && (
                    <input
                      className="mt-1 w-9 block bg-slate-800 border border-slate-700 text-white rounded px-1 py-0.5 text-[10px]"
                      placeholder="…"
                      value={columnFilters[col.key] ?? ''}
                      onChange={e => setColumnFilters(prev => ({ ...prev, [col.key]: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((row, index) => {
              const isHof = row.player.hof === true;
              const isOwn = ownTid !== null && row.player.tid === ownTid;
              const globalRank = (currentPage - 1) * perPage + index + 1;
              return (
                <tr
                  key={`${row.player.internalId}-${row.season}-${index}`}
                  className={`transition-colors ${rowBg(index, isHof, isOwn)} border-b border-slate-800/20`}
                >
                  <td className="px-2 py-1.5 text-right text-slate-600 sticky left-0 z-10" style={{ backgroundColor: stickyBg(index, isHof, isOwn) }}>
                    {globalRank}
                  </td>
                  <td
                    className={`px-3 py-1.5 font-medium cursor-pointer hover:underline whitespace-nowrap sticky left-8 z-10 ${isHof ? 'text-rose-400' : 'text-indigo-400 hover:text-indigo-300'}`}
                    style={{ backgroundColor: stickyBg(index, isHof, isOwn) }}
                    onClick={() => onPlayerSelect(row)}
                  >
                    <PlayerNameWithHover player={row.player}>{row.player.name}</PlayerNameWithHover>
                    {row.fromBref && <span className="ml-1 text-[9px] text-slate-600">†</span>}
                    {seasonBadgeRow(row, cupChampion)}
                  </td>
                  <td className="px-2 py-1.5 text-slate-400">{row.player.pos ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right text-slate-400">{row.age || '—'}</td>
                  <td
                    className="px-2 py-1.5 text-slate-300 cursor-pointer hover:text-indigo-400 transition-colors whitespace-nowrap"
                    onClick={() => onTeamSelect(row.teamAbbrev)}
                  >
                    {row.teamAbbrev}
                  </td>
                  {season === 'all' && (
                    <td className="px-2 py-1.5 text-right text-slate-500 text-[10px]">
                      {typeof row.season === 'number' ? `${row.season - 1}–${String(row.season).slice(2)}` : '—'}
                    </td>
                  )}
                  {statType === 'shotLocations' ? (
                    <>
                      <td className="px-2 py-1.5 text-right">{row.gp}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{fmt1(row.min)}</td>
                      <td className="px-2 py-1.5 text-right">{row.rimFgm ?? 0}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{row.rimFga ?? 0}</td>
                      <td className="px-2 py-1.5 text-right">{fmt3(row.rimFgPct ?? 0)}</td>
                      <td className="px-2 py-1.5 text-right">{row.lpFgm ?? 0}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{row.lpFga ?? 0}</td>
                      <td className="px-2 py-1.5 text-right">{fmt3(row.lpFgPct ?? 0)}</td>
                      <td className="px-2 py-1.5 text-right">{row.mrFgm ?? 0}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{row.mrFga ?? 0}</td>
                      <td className="px-2 py-1.5 text-right">{fmt3(row.mrFgPct ?? 0)}</td>
                      <td className="px-2 py-1.5 text-right text-indigo-300">{row.slTpm ?? 0}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{row.slTpa ?? 0}</td>
                      <td className="px-2 py-1.5 text-right text-indigo-300">{fmt3(row.slTpPct ?? 0)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{row.ba ?? 0}</td>
                      <td className="px-2 py-1.5 text-right text-emerald-300 font-medium">{row.dd ?? 0}</td>
                      <td className="px-2 py-1.5 text-right text-amber-300 font-bold">{row.td ?? 0}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{row.qd ?? 0}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{row.fiveX5 ?? 0}</td>
                    </>
                  ) : statType !== 'advanced' ? (
                    <>
                      {activeCols.map(col => {
                        const value = (row as any)[col.key] as number;
                        if (pctFields.includes(col.key)) {
                          return <td key={col.key} className={`px-2 py-1.5 text-right ${col.key === 'tpPct' ? 'text-indigo-300' : col.key === 'fpPct' ? 'text-amber-300' : col.dim ? 'text-slate-500' : ''}`}>{fmt3(value)}</td>;
                        }
                        if (col.key === 'gp') return <td key={col.key} className="px-2 py-1.5 text-right">{row.gp}</td>;
                        if (col.key === 'gs') return <td key={col.key} className="px-2 py-1.5 text-right text-slate-500">{row.gs}</td>;
                        if (col.key === 'min') return <td key={col.key} className="px-2 py-1.5 text-right text-slate-400">{fmt1(row.min)}</td>;
                        const display = statType === 'totals' ? fmt0(value) : fmt1(value);
                        const tone =
                          col.key === 'tp' ? 'text-indigo-300'
                          : col.key === 'tpa' ? 'text-slate-500'
                          : col.key === 'fp' ? 'text-amber-300'
                          : col.key === 'fpa' ? 'text-slate-500'
                          : col.key === 'twopa' ? 'text-slate-600'
                          : col.key === 'orb' || col.key === 'drb' ? 'text-slate-400'
                          : col.key === 'trb' || col.key === 'ast' ? 'font-medium'
                          : col.key === 'tov' ? 'text-rose-300/80'
                          : col.key === 'stl' || col.key === 'blk' ? 'text-emerald-300/80'
                          : col.key === 'pf' ? 'text-slate-500'
                          : col.key === 'pts' ? 'font-bold text-white'
                          : col.dim ? 'text-slate-500'
                          : '';
                        return <td key={col.key} className={`px-2 py-1.5 text-right ${tone}`}>{display}</td>;
                      })}
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 text-right">{row.gp}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{row.gs}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{fmt1(row.min)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-white">{fmt1(row.per)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{fmt1(row.ewa)}</td>
                      <td className="px-2 py-1.5 text-right text-indigo-300">{fmt3(row.tsPct / 100)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{fmt3(row.threePAr)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{fmt3(row.ftRate)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{fmt1(row.orbPct)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{fmt1(row.drbPct)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt1(row.trbPct)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt1(row.astPct)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt1(row.stlPct)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt1(row.blkPct)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{fmt1(row.tovPct)}</td>
                      <td className="px-2 py-1.5 text-right text-indigo-300">{fmt1(row.usgPct)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{row.pm >= 0 ? '+' : ''}{fmt1(row.pm)}</td>
                      <td className="px-2 py-1.5 text-right text-emerald-300">{fmt1(row.ortg)}</td>
                      <td className="px-2 py-1.5 text-right text-rose-300">{fmt1(row.drtg)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{fmt1(row.ows)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{fmt1(row.dws)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-white">{fmt1(row.ws)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{row.ws48 !== 0 ? row.ws48.toFixed(3) : '—'}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{row.obpm >= 0 ? '+' : ''}{fmt1(row.obpm)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{row.dbpm >= 0 ? '+' : ''}{fmt1(row.dbpm)}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${row.bpm >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{row.bpm >= 0 ? '+' : ''}{fmt1(row.bpm)}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${row.vorp >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt1(row.vorp)}</td>
                    </>
                  )}
                </tr>
              );
            })}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={5 + activeCols.length + (season === 'all' ? 1 : 0)} className="px-6 py-12 text-center text-slate-500">
                  No stats found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 border-t border-slate-800 px-3 sm:px-4 py-2 flex items-center justify-between bg-slate-950">
        <span className="text-[11px] text-slate-500">
          {filteredRows.length === 0 ? '0 to 0 of 0' : `${(currentPage - 1) * perPage + 1}–${Math.min(currentPage * perPage, filteredRows.length)} of ${filteredRows.length}`}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="px-2 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            «
          </button>
          <button
            onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-[11px] text-slate-500 px-1">{currentPage} / {totalPages || 1}</span>
          <button
            onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage >= totalPages}
            className="px-2 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            »
          </button>
        </div>
      </div>
    </>
  );
}
