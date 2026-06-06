import React from 'react';

export type Phase = 'rs' | 'playoffs' | 'combined';

export interface SeasonRow {
  season: number;
  seasonLabel?: string;
  leagueTag?: string;
  leagueTitle?: string;
  teamAbbrev: string;
  age: number;
  gp: number; gs: number; minTotal: number; minPG: number;
  fg: number; fga: number; fgPct: number;
  tp: number; tpa: number; tpPct: number;
  twop: number; twopa: number; twopPct: number;
  efgPct: number;
  ft: number; fta: number; ftPct: number;
  orb: number; drb: number; trb: number;
  ast: number; stl: number; blk: number; tov: number; pf: number; pts: number;
  pm: number;
  fgAtRim: number; fgaAtRim: number;
  fgLowPost: number; fgaLowPost: number;
  fgMidRange: number; fgaMidRange: number;
  ba: number;
  dd: number; td: number; qd: number; fiveBy5: number;
  per: number; ewa: number; tsPct: number;
  ftRate: number; tpRate: number;
  orbPct: number; drbPct: number; trbPct: number;
  astPct: number; stlPct: number; blkPct: number; tovPct: number; usgPct: number;
  ortg: number; drtg: number;
  ows: number; dws: number; ws: number; ws48: number;
  obpm: number; dbpm: number; bpm: number; vorp: number;
  ghMin: number; ghFgm: number; ghFga: number;
  ghTpm: number; ghTpa: number; ghTwom: number; ghTwoa: number;
  ghFtm: number; ghFta: number;
  ghOrb: number; ghDrb: number; ghTrb: number;
  ghAst: number; ghTov: number; ghStl: number; ghBlk: number; ghBa: number;
  ghPf: number; ghPts: number; ghPm: number; ghGmSc: number;
  isCareer?: boolean;
  isTot?: boolean;
  isSubRow?: boolean;
}

const pct3 = (v: number): string => v > 0 ? `.${Math.round(v * 1000).toString().padStart(3, '0')}` : '—';
const f1 = (v: number): string => v.toFixed(1);
const f0 = (v: number): string => Math.round(v).toString();
const dash = (v: number): string => v !== 0 ? f1(v) : '—';
const dashpm = (v: number): string => v > 0 ? `+${v.toFixed(1)}` : v < 0 ? v.toFixed(1) : '—';

export function getSeasonLabel(season: number): string {
  return `${season - 1}-${String(season).slice(2)}`;
}

export function PhaseTabs({ phase, onChange }: { phase: Phase; onChange: (phase: Phase) => void }) {
  const tabs: { id: Phase; label: string }[] = [
    { id: 'rs', label: 'Regular Season' },
    { id: 'playoffs', label: 'Playoffs' },
    { id: 'combined', label: 'Combined' },
  ];

  return (
    <div className="flex gap-0.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5 shrink-0">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all whitespace-nowrap ${phase === tab.id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SeasonCell({
  row,
  allStarSeasons,
  ringSeasons,
  cupSeasons,
  cupChampionLabel,
}: {
  row: SeasonRow;
  allStarSeasons: Set<number>;
  ringSeasons: Set<number>;
  cupSeasons: Set<number>;
  cupChampionLabel: string;
}) {
  if (row.isCareer) return <span>Career</span>;
  if (row.isSubRow) return <span className="text-slate-500">{row.seasonLabel ?? getSeasonLabel(row.season)}</span>;

  return (
    <span className="flex items-center gap-1">
      {row.seasonLabel ?? getSeasonLabel(row.season)}
      {row.leagueTag && (
        <span title={row.leagueTitle} className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-300">
          {row.leagueTag}
        </span>
      )}
      {ringSeasons.has(row.season) && !row.isTot && <span className="text-yellow-400 text-[9px]" title="NBA Champion">💍</span>}
      {cupSeasons.has(row.season) && !row.isTot && <span className="text-amber-400 text-[9px]" title={cupChampionLabel}>🏆</span>}
      {allStarSeasons.has(row.season) && !row.isTot && <span className="text-amber-400 text-[9px]" title="All-Star">★</span>}
    </span>
  );
}

export interface ColDef {
  key: string;
  label: string;
  title?: string;
  fmt: (row: SeasonRow) => React.ReactNode;
  align: 'left' | 'right';
  dim?: boolean;
  highlight?: boolean;
}

export function StatsTable({
  rows,
  cols,
  allStarSeasons,
  ringSeasons,
  cupSeasons,
  cupChampionLabel,
  groupHeaders,
}: {
  rows: SeasonRow[];
  cols: ColDef[];
  allStarSeasons: Set<number>;
  ringSeasons: Set<number>;
  cupSeasons: Set<number>;
  cupChampionLabel: string;
  groupHeaders?: { label: string; span: number }[];
}) {
  const bodyRows = rows.filter(row => !row.isCareer);
  const careerRow = rows.find(row => row.isCareer);

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="min-w-max w-full text-[11px] border-collapse">
        <thead>
          {groupHeaders && (
            <tr className="bg-slate-900/90 border-b border-slate-700/50">
              {groupHeaders.map((group, index) => (
                <th key={index} colSpan={group.span} className={`px-2 py-1 text-center text-[9px] font-black uppercase tracking-widest ${group.label ? 'text-slate-500 border-x border-slate-700/40' : ''}`}>
                  {group.label}
                </th>
              ))}
            </tr>
          )}
          <tr className="bg-slate-900/80 border-b border-slate-700">
            {cols.map(col => (
              <th key={col.key} title={col.title} className={`px-2 py-2 font-bold uppercase tracking-wide whitespace-nowrap select-none ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.highlight ? 'text-white' : col.dim ? 'text-slate-600' : 'text-slate-400'}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="px-4 py-8 text-center text-slate-600 italic">No data available</td>
            </tr>
          )}
          {bodyRows.map((row, index) => (
            <tr key={`${row.season}-${row.teamAbbrev}-${index}`} className={`border-b transition-colors ${row.isSubRow ? 'border-slate-800/20 hover:bg-slate-800/15 opacity-60' : row.isTot ? 'border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/50' : 'border-slate-800/40 hover:bg-slate-800/25'}`}>
              {cols.map(col => (
                <td key={col.key} className={`whitespace-nowrap tabular-nums ${col.align === 'right' ? 'text-right' : 'text-left'} ${row.isSubRow ? `px-2 py-1 text-slate-400 ${col.key === 'tm' ? 'pl-4' : ''}` : row.isTot ? `px-2 py-1.5 font-semibold ${col.highlight ? 'text-white' : col.dim ? 'text-slate-400' : 'text-slate-200'}` : `px-2 py-1.5 ${col.highlight ? 'font-bold text-white' : col.dim ? 'text-slate-500' : 'text-slate-300'}`} ${col.key === 'season' ? 'font-semibold text-slate-200' : ''}`}>
                  {col.key === 'season' ? (
                    <SeasonCell row={row} allStarSeasons={allStarSeasons} ringSeasons={ringSeasons} cupSeasons={cupSeasons} cupChampionLabel={cupChampionLabel} />
                  ) : col.fmt(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {careerRow && (
          <tfoot>
            <tr className="border-t-2 border-slate-600 bg-slate-900/70 font-bold">
              {cols.map(col => (
                <td key={col.key} className={`px-2 py-2 whitespace-nowrap tabular-nums font-bold ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.highlight ? 'text-white' : col.dim ? 'text-slate-500' : 'text-slate-200'}`}>
                  {col.key === 'season' ? <span>Career</span> : col.fmt(careerRow)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const BASE_COLS: ColDef[] = [
  { key: 'season', label: 'Season', align: 'left', fmt: () => '' },
  { key: 'tm', label: 'Tm', align: 'left', fmt: row => row.isCareer ? '' : row.teamAbbrev },
  { key: 'age', label: 'Age', align: 'right', dim: true, fmt: row => row.isCareer ? '' : f0(row.age) },
  { key: 'gp', label: 'G', align: 'right', fmt: row => f0(row.gp) },
  { key: 'gs', label: 'GS', align: 'right', dim: true, fmt: row => f0(row.gs) },
  { key: 'min', label: 'MP', align: 'right', fmt: row => f1(row.minPG) },
];

export const PG_COLS: ColDef[] = [
  ...BASE_COLS,
  { key: 'fg', label: 'FG', align: 'right', fmt: row => f1(row.fg) },
  { key: 'fga', label: 'FGA', align: 'right', dim: true, fmt: row => f1(row.fga) },
  { key: 'fgp', label: 'FG%', align: 'right', fmt: row => pct3(row.fgPct) },
  { key: 'tp', label: '3P', align: 'right', fmt: row => f1(row.tp) },
  { key: 'tpa', label: '3PA', align: 'right', dim: true, fmt: row => f1(row.tpa) },
  { key: 'tpp', label: '3P%', align: 'right', fmt: row => pct3(row.tpPct) },
  { key: 'twop', label: '2P', align: 'right', dim: true, fmt: row => f1(row.twop) },
  { key: 'twopa', label: '2PA', align: 'right', dim: true, fmt: row => f1(row.twopa) },
  { key: 'twopPct', label: '2P%', align: 'right', dim: true, fmt: row => pct3(row.twopPct) },
  { key: 'efg', label: 'eFG%', align: 'right', dim: true, fmt: row => pct3(row.efgPct) },
  { key: 'ft', label: 'FT', align: 'right', fmt: row => f1(row.ft) },
  { key: 'fta', label: 'FTA', align: 'right', dim: true, fmt: row => f1(row.fta) },
  { key: 'ftp', label: 'FT%', align: 'right', fmt: row => pct3(row.ftPct) },
  { key: 'orb', label: 'ORB', align: 'right', dim: true, fmt: row => f1(row.orb) },
  { key: 'drb', label: 'DRB', align: 'right', dim: true, fmt: row => f1(row.drb) },
  { key: 'trb', label: 'TRB', align: 'right', fmt: row => f1(row.trb) },
  { key: 'ast', label: 'AST', align: 'right', fmt: row => f1(row.ast) },
  { key: 'stl', label: 'STL', align: 'right', fmt: row => f1(row.stl) },
  { key: 'blk', label: 'BLK', align: 'right', fmt: row => f1(row.blk) },
  { key: 'tov', label: 'TOV', align: 'right', fmt: row => f1(row.tov) },
  { key: 'pf', label: 'PF', align: 'right', dim: true, fmt: row => f1(row.pf) },
  { key: 'pts', label: 'PTS', align: 'right', highlight: true, fmt: row => f1(row.pts) },
];

export const SL_COLS: ColDef[] = [
  ...BASE_COLS,
  { key: 'rimM', label: 'M', title: 'At Rim Made', align: 'right', fmt: row => row.fgaAtRim > 0 ? f1(row.fgAtRim) : '—' },
  { key: 'rimA', label: 'A', title: 'At Rim Attempted', align: 'right', dim: true, fmt: row => row.fgaAtRim > 0 ? f1(row.fgaAtRim) : '—' },
  { key: 'rimPct', label: '%', title: 'At Rim %', align: 'right', fmt: row => row.fgaAtRim > 0 ? pct3(row.fgAtRim / row.fgaAtRim) : '—' },
  { key: 'lpM', label: 'M', title: 'Low Post Made', align: 'right', fmt: row => row.fgaLowPost > 0 ? f1(row.fgLowPost) : '—' },
  { key: 'lpA', label: 'A', title: 'Low Post Attempted', align: 'right', dim: true, fmt: row => row.fgaLowPost > 0 ? f1(row.fgaLowPost) : '—' },
  { key: 'lpPct', label: '%', title: 'Low Post %', align: 'right', fmt: row => row.fgaLowPost > 0 ? pct3(row.fgLowPost / row.fgaLowPost) : '—' },
  { key: 'mrM', label: 'M', title: 'Mid-Range Made', align: 'right', fmt: row => row.fgaMidRange > 0 ? f1(row.fgMidRange) : '—' },
  { key: 'mrA', label: 'A', title: 'Mid-Range Attempted', align: 'right', dim: true, fmt: row => row.fgaMidRange > 0 ? f1(row.fgaMidRange) : '—' },
  { key: 'mrPct', label: '%', title: 'Mid-Range %', align: 'right', fmt: row => row.fgaMidRange > 0 ? pct3(row.fgMidRange / row.fgaMidRange) : '—' },
  { key: 'tpPG', label: '3P', title: '3P Made', align: 'right', fmt: row => f1(row.tp) },
  { key: 'tpaPG', label: '3PA', title: '3P Attempted', align: 'right', dim: true, fmt: row => f1(row.tpa) },
  { key: 'tppPG', label: '3P%', title: '3P %', align: 'right', fmt: row => pct3(row.tpPct) },
  { key: 'dd', label: 'DD', title: 'Double-Doubles', align: 'right', fmt: row => row.isCareer ? f0(row.dd) : row.dd > 0 ? f0(row.dd) : '0' },
  { key: 'td', label: 'TD', title: 'Triple-Doubles', align: 'right', fmt: row => row.isCareer ? f0(row.td) : row.td > 0 ? f0(row.td) : '0' },
  { key: 'qd', label: 'QD', title: 'Quadruple-Doubles', align: 'right', dim: true, fmt: row => row.isCareer ? f0(row.qd) : row.qd > 0 ? f0(row.qd) : '0' },
  { key: 'five', label: '5x5', title: 'Five by Fives', align: 'right', dim: true, fmt: row => row.isCareer ? f0(row.fiveBy5) : row.fiveBy5 > 0 ? f0(row.fiveBy5) : '0' },
];

export const SL_GROUPS = [
  { label: '', span: 6 },
  { label: 'At Rim', span: 3 },
  { label: 'Low Post', span: 3 },
  { label: 'Mid-Range', span: 3 },
  { label: '3PT', span: 3 },
  { label: 'Feats', span: 4 },
];

export const ADV_COLS: ColDef[] = [
  ...BASE_COLS.map(col => col.key === 'min' ? { ...col, fmt: (row: SeasonRow) => f0(row.minTotal) } : col),
  { key: 'per', label: 'PER', align: 'right', fmt: row => f1(row.per) },
  { key: 'ewa', label: 'EWA', align: 'right', dim: true, fmt: row => row.ewa.toFixed(1) },
  { key: 'ts', label: 'TS%', align: 'right', fmt: row => pct3(row.tsPct) },
  { key: 'tpar', label: '3PAr', align: 'right', dim: true, fmt: row => pct3(row.tpRate) },
  { key: 'ftr', label: 'FTr', align: 'right', dim: true, fmt: row => pct3(row.ftRate) },
  { key: 'orbpct', label: 'ORB%', align: 'right', dim: true, fmt: row => f1(row.orbPct) },
  { key: 'drbpct', label: 'DRB%', align: 'right', dim: true, fmt: row => f1(row.drbPct) },
  { key: 'trbpct', label: 'TRB%', align: 'right', fmt: row => f1(row.trbPct) },
  { key: 'astpct', label: 'AST%', align: 'right', fmt: row => f1(row.astPct) },
  { key: 'stlpct', label: 'STL%', align: 'right', fmt: row => f1(row.stlPct) },
  { key: 'blkpct', label: 'BLK%', align: 'right', fmt: row => f1(row.blkPct) },
  { key: 'tovpct', label: 'TOV%', align: 'right', fmt: row => f1(row.tovPct) },
  { key: 'usgpct', label: 'USG%', align: 'right', fmt: row => f1(row.usgPct) },
  { key: 'pm', label: '+/-', align: 'right', dim: true, fmt: row => dashpm(row.pm) },
  { key: 'ortg', label: 'ORtg', align: 'right', dim: true, fmt: row => row.ortg > 0 ? f0(row.ortg) : '—' },
  { key: 'drtg', label: 'DRtg', align: 'right', dim: true, fmt: row => row.drtg > 0 ? f0(row.drtg) : '—' },
  { key: 'ows', label: 'OWS', align: 'right', dim: true, fmt: row => row.ows.toFixed(1) },
  { key: 'dws', label: 'DWS', align: 'right', dim: true, fmt: row => row.dws.toFixed(1) },
  { key: 'ws', label: 'WS', align: 'right', fmt: row => row.ws.toFixed(1) },
  { key: 'ws48', label: 'WS/48', align: 'right', dim: true, fmt: row => row.ws48 !== 0 ? row.ws48.toFixed(3) : '—' },
  { key: 'obpm', label: 'OBPM', align: 'right', dim: true, fmt: row => dash(row.obpm) },
  { key: 'dbpm', label: 'DBPM', align: 'right', dim: true, fmt: row => dash(row.dbpm) },
  { key: 'bpm', label: 'BPM', align: 'right', highlight: true, fmt: row => dash(row.bpm) },
  { key: 'vorp', label: 'VORP', align: 'right', fmt: row => row.vorp.toFixed(1) },
];

export const GH_COLS: ColDef[] = [
  ...BASE_COLS.slice(0, 4),
  { key: 'ghMin', label: 'MP', title: 'Minutes', align: 'right', fmt: row => row.ghMin > 0 ? f1(row.ghMin) : '—' },
  { key: 'ghFgm', label: 'FG', title: 'Field Goals Made', align: 'right', fmt: row => row.ghFgm > 0 ? f0(row.ghFgm) : '—' },
  { key: 'ghFga', label: 'FGA', title: 'Field Goals Attempted', align: 'right', dim: true, fmt: row => row.ghFga > 0 ? f0(row.ghFga) : '—' },
  { key: 'ghTpm', label: '3P', title: '3P Made', align: 'right', fmt: row => row.ghTpm > 0 ? f0(row.ghTpm) : '—' },
  { key: 'ghTpa', label: '3PA', title: '3P Attempted', align: 'right', dim: true, fmt: row => row.ghTpa > 0 ? f0(row.ghTpa) : '—' },
  { key: 'ghTwom', label: '2P', title: '2P Made', align: 'right', fmt: row => row.ghTwom > 0 ? f0(row.ghTwom) : '—' },
  { key: 'ghTwoa', label: '2PA', title: '2P Attempted', align: 'right', dim: true, fmt: row => row.ghTwoa > 0 ? f0(row.ghTwoa) : '—' },
  { key: 'ghFtm', label: 'FT', title: 'FT Made', align: 'right', fmt: row => row.ghFtm > 0 ? f0(row.ghFtm) : '—' },
  { key: 'ghFta', label: 'FTA', title: 'FT Attempted', align: 'right', dim: true, fmt: row => row.ghFta > 0 ? f0(row.ghFta) : '—' },
  { key: 'ghOrb', label: 'ORB', title: 'Offensive Rebounds', align: 'right', dim: true, fmt: row => row.ghOrb > 0 ? f0(row.ghOrb) : '—' },
  { key: 'ghDrb', label: 'DRB', title: 'Defensive Rebounds', align: 'right', dim: true, fmt: row => row.ghDrb > 0 ? f0(row.ghDrb) : '—' },
  { key: 'ghTrb', label: 'TRB', title: 'Total Rebounds', align: 'right', fmt: row => row.ghTrb > 0 ? f0(row.ghTrb) : '—' },
  { key: 'ghAst', label: 'AST', title: 'Assists', align: 'right', fmt: row => row.ghAst > 0 ? f0(row.ghAst) : '—' },
  { key: 'ghTov', label: 'TOV', title: 'Turnovers', align: 'right', fmt: row => row.ghTov > 0 ? f0(row.ghTov) : '—' },
  { key: 'ghStl', label: 'STL', title: 'Steals', align: 'right', fmt: row => row.ghStl > 0 ? f0(row.ghStl) : '—' },
  { key: 'ghBlk', label: 'BLK', title: 'Blocks', align: 'right', fmt: row => row.ghBlk > 0 ? f0(row.ghBlk) : '—' },
  { key: 'ghBa', label: 'BA', title: 'Blocks Against', align: 'right', dim: true, fmt: row => row.ghBa > 0 ? f0(row.ghBa) : '—' },
  { key: 'ghPf', label: 'PF', title: 'Personal Fouls', align: 'right', dim: true, fmt: row => row.ghPf > 0 ? f0(row.ghPf) : '—' },
  { key: 'ghPts', label: 'PTS', title: 'Points', align: 'right', highlight: true, fmt: row => row.ghPts > 0 ? f0(row.ghPts) : '—' },
  { key: 'ghPm', label: '+/-', title: 'Plus/Minus', align: 'right', dim: true, fmt: row => row.ghPm !== 0 ? (row.ghPm > 0 ? `+${row.ghPm}` : `${row.ghPm}`) : '—' },
  { key: 'ghGmSc', label: 'GmSc', title: 'Game Score', align: 'right', fmt: row => row.ghGmSc > 0 ? row.ghGmSc.toFixed(1) : '—' },
];
