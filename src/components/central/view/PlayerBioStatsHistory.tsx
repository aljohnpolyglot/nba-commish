/**
 * PlayerBioStatsHistory.tsx
 *
 * BBRef-style historical stats tables for a single player.
 * Sections: Per Game · Shot Locations & Feats · Advanced · Game Highs
 * Each section: Regular Season | Playoffs | Combined tabs
 * Career row in tfoot. All-Star seasons get a ★.
 */

import React, { useState, useMemo } from 'react';
import type { NBAPlayer, NBAGMStat } from '../../../types';
import { useGame } from '../../../store/GameContext';

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'rs' | 'playoffs' | 'combined';

interface SeasonRow {
  season: number;
  teamAbbrev: string;
  age: number;
  gp: number; gs: number; minTotal: number; minPG: number;
  // per-game shooting
  fg: number; fga: number; fgPct: number;
  tp: number; tpa: number; tpPct: number;
  twop: number; twopa: number; twopPct: number;
  efgPct: number;
  ft: number; fta: number; ftPct: number;
  orb: number; drb: number; trb: number;
  ast: number; stl: number; blk: number; tov: number; pf: number; pts: number;
  pm: number;
  // shot locations (per game)
  fgAtRim: number; fgaAtRim: number;
  fgLowPost: number; fgaLowPost: number;
  fgMidRange: number; fgaMidRange: number;
  ba: number;
  // feats (counts)
  dd: number; td: number; qd: number; fiveBy5: number;
  // advanced
  per: number; ewa: number; tsPct: number;
  ftRate: number; tpRate: number;
  orbPct: number; drbPct: number; trbPct: number;
  astPct: number; stlPct: number; blkPct: number; tovPct: number; usgPct: number;
  ortg: number; drtg: number;
  ows: number; dws: number; ws: number; ws48: number;
  obpm: number; dbpm: number; bpm: number; vorp: number;
  // game highs
  ghMin: number; ghFgm: number; ghFga: number;
  ghTpm: number; ghTpa: number; ghTwom: number; ghTwoa: number;
  ghFtm: number; ghFta: number;
  ghOrb: number; ghDrb: number; ghTrb: number;
  ghAst: number; ghTov: number; ghStl: number; ghBlk: number; ghBa: number;
  ghPf: number; ghPts: number; ghPm: number; ghGmSc: number;
  isCareer?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sp = (n: unknown): number => (typeof n === 'number' && isFinite(n) ? n : 0);
const pct3 = (v: number): string => v > 0 ? `.${Math.round(v * 1000).toString().padStart(3, '0')}` : '—';
const f1 = (v: number): string => v.toFixed(1);
const f0 = (v: number): string => Math.round(v).toString();
const dash = (v: number): string => v !== 0 ? f1(v) : '—';
const dashpm = (v: number): string => v > 0 ? `+${v.toFixed(1)}` : v < 0 ? v.toFixed(1) : '—';

function getSeasonLabel(season: number): string {
  return `${season - 1}-${String(season).slice(2)}`;
}

function getGameSeasonYear(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  const yr = d.getFullYear();
  return d.getMonth() < 9 ? yr : yr + 1;
}

// ─── PhaseTabs ───────────────────────────────────────────────────────────────

function PhaseTabs({ phase, onChange }: { phase: Phase; onChange: (p: Phase) => void }) {
  const tabs: { id: Phase; label: string }[] = [
    { id: 'rs',       label: 'Regular Season' },
    { id: 'playoffs', label: 'Playoffs' },
    { id: 'combined', label: 'Combined' },
  ];
  return (
    <div className="flex gap-0.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5 shrink-0">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all whitespace-nowrap ${
            phase === t.id
              ? 'bg-slate-700 text-white'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Season label cell with All-Star star ─────────────────────────────────────

function SeasonCell({ row, allStarSeasons }: { row: SeasonRow; allStarSeasons: Set<number> }) {
  if (row.isCareer) return <span>Career</span>;
  return (
    <span className="flex items-center gap-1">
      {getSeasonLabel(row.season)}
      {allStarSeasons.has(row.season) && (
        <span className="text-amber-400 text-[9px]" title="All-Star">★</span>
      )}
    </span>
  );
}

// ─── Generic table ────────────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  title?: string;
  fmt: (r: SeasonRow) => React.ReactNode;
  align: 'left' | 'right';
  dim?: boolean;
  highlight?: boolean;
  span?: number;     // colspan on header group row
  groupLabel?: string;
}

function StatsTable({
  rows, cols, allStarSeasons, groupHeaders,
}: {
  rows: SeasonRow[];
  cols: ColDef[];
  allStarSeasons: Set<number>;
  groupHeaders?: { label: string; span: number }[];
}) {
  const bodyRows  = rows.filter(r => !r.isCareer);
  const careerRow = rows.find(r => r.isCareer);

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="min-w-max w-full text-[11px] border-collapse">
        <thead>
          {groupHeaders && (
            <tr className="bg-slate-900/90 border-b border-slate-700/50">
              {groupHeaders.map((g, i) => (
                <th
                  key={i}
                  colSpan={g.span}
                  className={`px-2 py-1 text-center text-[9px] font-black uppercase tracking-widest
                    ${g.label ? 'text-slate-500 border-x border-slate-700/40' : ''}
                  `}
                >
                  {g.label}
                </th>
              ))}
            </tr>
          )}
          <tr className="bg-slate-900/80 border-b border-slate-700">
            {cols.map(col => (
              <th
                key={col.key}
                title={col.title}
                className={`px-2 py-2 font-bold uppercase tracking-wide whitespace-nowrap select-none
                  ${col.align === 'right' ? 'text-right' : 'text-left'}
                  ${col.highlight ? 'text-white' : col.dim ? 'text-slate-600' : 'text-slate-400'}
                `}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="px-4 py-8 text-center text-slate-600 italic">
                No data available
              </td>
            </tr>
          )}
          {bodyRows.map((row, i) => (
            <tr
              key={`${row.season}-${row.teamAbbrev}-${i}`}
              className="border-b border-slate-800/40 hover:bg-slate-800/25 transition-colors"
            >
              {cols.map(col => (
                <td
                  key={col.key}
                  className={`px-2 py-1.5 whitespace-nowrap tabular-nums
                    ${col.align === 'right' ? 'text-right' : 'text-left'}
                    ${col.highlight ? 'font-bold text-white' : col.dim ? 'text-slate-500' : 'text-slate-300'}
                    ${col.key === 'season' ? 'font-semibold text-slate-200' : ''}
                  `}
                >
                  {col.key === 'season' ? <SeasonCell row={row} allStarSeasons={allStarSeasons} /> : col.fmt(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {careerRow && (
          <tfoot>
            <tr className="border-t-2 border-slate-600 bg-slate-900/70 font-bold">
              {cols.map(col => (
                <td
                  key={col.key}
                  className={`px-2 py-2 whitespace-nowrap tabular-nums font-bold
                    ${col.align === 'right' ? 'text-right' : 'text-left'}
                    ${col.highlight ? 'text-white' : col.dim ? 'text-slate-500' : 'text-slate-200'}
                  `}
                >
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

// ─── Column sets ──────────────────────────────────────────────────────────────

const BASE_COLS: ColDef[] = [
  { key: 'season',    label: 'Season', align: 'left',  fmt: r => '' },
  { key: 'tm',        label: 'Tm',     align: 'left',  fmt: r => r.isCareer ? '' : r.teamAbbrev },
  { key: 'age',       label: 'Age',    align: 'right', dim: true,  fmt: r => r.isCareer ? '' : f0(r.age) },
  { key: 'gp',        label: 'G',      align: 'right',             fmt: r => f0(r.gp) },
  { key: 'gs',        label: 'GS',     align: 'right', dim: true,  fmt: r => f0(r.gs) },
  { key: 'min',       label: 'MP',     align: 'right',             fmt: r => f1(r.minPG) },
];

const PG_COLS: ColDef[] = [
  ...BASE_COLS,
  { key: 'fg',    label: 'FG',   align: 'right',             fmt: r => f1(r.fg) },
  { key: 'fga',   label: 'FGA',  align: 'right', dim: true,  fmt: r => f1(r.fga) },
  { key: 'fgp',   label: 'FG%',  align: 'right',             fmt: r => pct3(r.fgPct) },
  { key: 'tp',    label: '3P',   align: 'right',             fmt: r => f1(r.tp) },
  { key: 'tpa',   label: '3PA',  align: 'right', dim: true,  fmt: r => f1(r.tpa) },
  { key: 'tpp',   label: '3P%',  align: 'right',             fmt: r => pct3(r.tpPct) },
  { key: 'twop',  label: '2P',   align: 'right', dim: true,  fmt: r => f1(r.twop) },
  { key: 'twopa', label: '2PA',  align: 'right', dim: true,  fmt: r => f1(r.twopa) },
  { key: 'twopPct',label: '2P%', align: 'right', dim: true,  fmt: r => pct3(r.twopPct) },
  { key: 'efg',   label: 'eFG%', align: 'right', dim: true,  fmt: r => pct3(r.efgPct) },
  { key: 'ft',    label: 'FT',   align: 'right',             fmt: r => f1(r.ft) },
  { key: 'fta',   label: 'FTA',  align: 'right', dim: true,  fmt: r => f1(r.fta) },
  { key: 'ftp',   label: 'FT%',  align: 'right',             fmt: r => pct3(r.ftPct) },
  { key: 'orb',   label: 'ORB',  align: 'right', dim: true,  fmt: r => f1(r.orb) },
  { key: 'drb',   label: 'DRB',  align: 'right', dim: true,  fmt: r => f1(r.drb) },
  { key: 'trb',   label: 'TRB',  align: 'right',             fmt: r => f1(r.trb) },
  { key: 'ast',   label: 'AST',  align: 'right',             fmt: r => f1(r.ast) },
  { key: 'stl',   label: 'STL',  align: 'right',             fmt: r => f1(r.stl) },
  { key: 'blk',   label: 'BLK',  align: 'right',             fmt: r => f1(r.blk) },
  { key: 'tov',   label: 'TOV',  align: 'right',             fmt: r => f1(r.tov) },
  { key: 'pf',    label: 'PF',   align: 'right', dim: true,  fmt: r => f1(r.pf) },
  { key: 'pts',   label: 'PTS',  align: 'right', highlight: true, fmt: r => f1(r.pts) },
];

const SL_COLS: ColDef[] = [
  ...BASE_COLS,
  // At Rim
  { key: 'rimM',    label: 'M',   title: 'At Rim Made',        align: 'right',             fmt: r => r.fgaAtRim > 0 ? f1(r.fgAtRim) : '—' },
  { key: 'rimA',    label: 'A',   title: 'At Rim Attempted',   align: 'right', dim: true,  fmt: r => r.fgaAtRim > 0 ? f1(r.fgaAtRim) : '—' },
  { key: 'rimPct',  label: '%',   title: 'At Rim %',           align: 'right',             fmt: r => r.fgaAtRim > 0 ? pct3(r.fgAtRim / r.fgaAtRim) : '—' },
  // Low Post
  { key: 'lpM',     label: 'M',   title: 'Low Post Made',      align: 'right',             fmt: r => r.fgaLowPost > 0 ? f1(r.fgLowPost) : '—' },
  { key: 'lpA',     label: 'A',   title: 'Low Post Attempted', align: 'right', dim: true,  fmt: r => r.fgaLowPost > 0 ? f1(r.fgaLowPost) : '—' },
  { key: 'lpPct',   label: '%',   title: 'Low Post %',         align: 'right',             fmt: r => r.fgaLowPost > 0 ? pct3(r.fgLowPost / r.fgaLowPost) : '—' },
  // Mid-Range
  { key: 'mrM',     label: 'M',   title: 'Mid-Range Made',     align: 'right',             fmt: r => r.fgaMidRange > 0 ? f1(r.fgMidRange) : '—' },
  { key: 'mrA',     label: 'A',   title: 'Mid-Range Attempted',align: 'right', dim: true,  fmt: r => r.fgaMidRange > 0 ? f1(r.fgaMidRange) : '—' },
  { key: 'mrPct',   label: '%',   title: 'Mid-Range %',        align: 'right',             fmt: r => r.fgaMidRange > 0 ? pct3(r.fgMidRange / r.fgaMidRange) : '—' },
  // 3PT
  { key: 'tpPG',    label: '3P',  title: '3P Made',            align: 'right',             fmt: r => f1(r.tp) },
  { key: 'tpaPG',   label: '3PA', title: '3P Attempted',       align: 'right', dim: true,  fmt: r => f1(r.tpa) },
  { key: 'tppPG',   label: '3P%', title: '3P %',               align: 'right',             fmt: r => pct3(r.tpPct) },
  // Feats
  { key: 'dd',      label: 'DD',  title: 'Double-Doubles',     align: 'right', highlight: false, fmt: r => r.isCareer ? f0(r.dd) : (r.dd > 0 ? f0(r.dd) : '0') },
  { key: 'td',      label: 'TD',  title: 'Triple-Doubles',     align: 'right',             fmt: r => r.isCareer ? f0(r.td) : (r.td > 0 ? f0(r.td) : '0') },
  { key: 'qd',      label: 'QD',  title: 'Quadruple-Doubles',  align: 'right', dim: true,  fmt: r => r.isCareer ? f0(r.qd) : (r.qd > 0 ? f0(r.qd) : '0') },
  { key: 'five',    label: '5x5', title: 'Five by Fives',      align: 'right', dim: true,  fmt: r => r.isCareer ? f0(r.fiveBy5) : (r.fiveBy5 > 0 ? f0(r.fiveBy5) : '0') },
];

const SL_GROUPS = [
  { label: '', span: 6 },
  { label: 'At Rim', span: 3 },
  { label: 'Low Post', span: 3 },
  { label: 'Mid-Range', span: 3 },
  { label: '3PT', span: 3 },
  { label: 'Feats', span: 4 },
];

const ADV_COLS: ColDef[] = [
  ...BASE_COLS.map(c => c.key === 'min' ? { ...c, fmt: (r: SeasonRow) => f0(r.minTotal) } : c),
  { key: 'per',    label: 'PER',   align: 'right',             fmt: r => f1(r.per) },
  { key: 'ewa',    label: 'EWA',   align: 'right', dim: true,  fmt: r => r.ewa.toFixed(1) },
  { key: 'ts',     label: 'TS%',   align: 'right',             fmt: r => pct3(r.tsPct) },
  { key: 'tpar',   label: '3PAr',  align: 'right', dim: true,  fmt: r => pct3(r.tpRate) },
  { key: 'ftr',    label: 'FTr',   align: 'right', dim: true,  fmt: r => pct3(r.ftRate) },
  { key: 'orbpct', label: 'ORB%',  align: 'right', dim: true,  fmt: r => f1(r.orbPct) },
  { key: 'drbpct', label: 'DRB%',  align: 'right', dim: true,  fmt: r => f1(r.drbPct) },
  { key: 'trbpct', label: 'TRB%',  align: 'right',             fmt: r => f1(r.trbPct) },
  { key: 'astpct', label: 'AST%',  align: 'right',             fmt: r => f1(r.astPct) },
  { key: 'stlpct', label: 'STL%',  align: 'right',             fmt: r => f1(r.stlPct) },
  { key: 'blkpct', label: 'BLK%',  align: 'right',             fmt: r => f1(r.blkPct) },
  { key: 'tovpct', label: 'TOV%',  align: 'right',             fmt: r => f1(r.tovPct) },
  { key: 'usgpct', label: 'USG%',  align: 'right',             fmt: r => f1(r.usgPct) },
  { key: 'pm',     label: '+/-',   align: 'right', dim: true,  fmt: r => dashpm(r.pm) },
  { key: 'ortg',   label: 'ORtg',  align: 'right', dim: true,  fmt: r => r.ortg > 0 ? f0(r.ortg) : '—' },
  { key: 'drtg',   label: 'DRtg',  align: 'right', dim: true,  fmt: r => r.drtg > 0 ? f0(r.drtg) : '—' },
  { key: 'ows',    label: 'OWS',   align: 'right', dim: true,  fmt: r => r.ows.toFixed(1) },
  { key: 'dws',    label: 'DWS',   align: 'right', dim: true,  fmt: r => r.dws.toFixed(1) },
  { key: 'ws',     label: 'WS',    align: 'right',             fmt: r => r.ws.toFixed(1) },
  { key: 'ws48',   label: 'WS/48', align: 'right', dim: true,  fmt: r => r.ws48 !== 0 ? r.ws48.toFixed(3) : '—' },
  { key: 'obpm',   label: 'OBPM',  align: 'right', dim: true,  fmt: r => dash(r.obpm) },
  { key: 'dbpm',   label: 'DBPM',  align: 'right', dim: true,  fmt: r => dash(r.dbpm) },
  { key: 'bpm',    label: 'BPM',   align: 'right', highlight: true, fmt: r => dash(r.bpm) },
  { key: 'vorp',   label: 'VORP',  align: 'right',             fmt: r => r.vorp.toFixed(1) },
];

const GH_COLS: ColDef[] = [
  ...BASE_COLS.slice(0, 4), // season, tm, age, gp (no gs/min in game highs header)
  { key: 'ghMin',  label: 'MP',  title: 'Minutes',             align: 'right',             fmt: r => r.ghMin > 0 ? f1(r.ghMin) : '—' },
  { key: 'ghFgm',  label: 'FG',  title: 'Field Goals Made',    align: 'right',             fmt: r => r.ghFgm > 0 ? f0(r.ghFgm) : '—' },
  { key: 'ghFga',  label: 'FGA', title: 'Field Goals Attempted',align: 'right', dim: true, fmt: r => r.ghFga > 0 ? f0(r.ghFga) : '—' },
  { key: 'ghTpm',  label: '3P',  title: '3P Made',             align: 'right',             fmt: r => r.ghTpm > 0 ? f0(r.ghTpm) : '—' },
  { key: 'ghTpa',  label: '3PA', title: '3P Attempted',        align: 'right', dim: true,  fmt: r => r.ghTpa > 0 ? f0(r.ghTpa) : '—' },
  { key: 'ghTwom', label: '2P',  title: '2P Made',             align: 'right',             fmt: r => r.ghTwom > 0 ? f0(r.ghTwom) : '—' },
  { key: 'ghTwoa', label: '2PA', title: '2P Attempted',        align: 'right', dim: true,  fmt: r => r.ghTwoa > 0 ? f0(r.ghTwoa) : '—' },
  { key: 'ghFtm',  label: 'FT',  title: 'FT Made',             align: 'right',             fmt: r => r.ghFtm > 0 ? f0(r.ghFtm) : '—' },
  { key: 'ghFta',  label: 'FTA', title: 'FT Attempted',        align: 'right', dim: true,  fmt: r => r.ghFta > 0 ? f0(r.ghFta) : '—' },
  { key: 'ghOrb',  label: 'ORB', title: 'Offensive Rebounds',  align: 'right', dim: true,  fmt: r => r.ghOrb > 0 ? f0(r.ghOrb) : '—' },
  { key: 'ghDrb',  label: 'DRB', title: 'Defensive Rebounds',  align: 'right', dim: true,  fmt: r => r.ghDrb > 0 ? f0(r.ghDrb) : '—' },
  { key: 'ghTrb',  label: 'TRB', title: 'Total Rebounds',      align: 'right',             fmt: r => r.ghTrb > 0 ? f0(r.ghTrb) : '—' },
  { key: 'ghAst',  label: 'AST', title: 'Assists',             align: 'right',             fmt: r => r.ghAst > 0 ? f0(r.ghAst) : '—' },
  { key: 'ghTov',  label: 'TOV', title: 'Turnovers',           align: 'right',             fmt: r => r.ghTov > 0 ? f0(r.ghTov) : '—' },
  { key: 'ghStl',  label: 'STL', title: 'Steals',              align: 'right',             fmt: r => r.ghStl > 0 ? f0(r.ghStl) : '—' },
  { key: 'ghBlk',  label: 'BLK', title: 'Blocks',              align: 'right',             fmt: r => r.ghBlk > 0 ? f0(r.ghBlk) : '—' },
  { key: 'ghBa',   label: 'BA',  title: 'Blocks Against',      align: 'right', dim: true,  fmt: r => r.ghBa > 0 ? f0(r.ghBa) : '—' },
  { key: 'ghPf',   label: 'PF',  title: 'Personal Fouls',      align: 'right', dim: true,  fmt: r => r.ghPf > 0 ? f0(r.ghPf) : '—' },
  { key: 'ghPts',  label: 'PTS', title: 'Points',              align: 'right', highlight: true, fmt: r => r.ghPts > 0 ? f0(r.ghPts) : '—' },
  { key: 'ghPm',   label: '+/-', title: 'Plus/Minus',          align: 'right', dim: true,  fmt: r => r.ghPm !== 0 ? (r.ghPm > 0 ? `+${r.ghPm}` : `${r.ghPm}`) : '—' },
  { key: 'ghGmSc', label: 'GmSc',title: 'Game Score',          align: 'right',             fmt: r => r.ghGmSc > 0 ? r.ghGmSc.toFixed(1) : '—' },
];

// ─── Data builder (box scores) ────────────────────────────────────────────────

function emptyGH(): Pick<SeasonRow, 'ghMin'|'ghFgm'|'ghFga'|'ghTpm'|'ghTpa'|'ghTwom'|'ghTwoa'|
  'ghFtm'|'ghFta'|'ghOrb'|'ghDrb'|'ghTrb'|'ghAst'|'ghTov'|'ghStl'|'ghBlk'|'ghBa'|'ghPf'|'ghPts'|'ghPm'|'ghGmSc'> {
  return { ghMin:0,ghFgm:0,ghFga:0,ghTpm:0,ghTpa:0,ghTwom:0,ghTwoa:0,
    ghFtm:0,ghFta:0,ghOrb:0,ghDrb:0,ghTrb:0,ghAst:0,ghTov:0,ghStl:0,ghBlk:0,
    ghBa:0,ghPf:0,ghPts:0,ghPm:0,ghGmSc:0 };
}

interface BoxAggregate {
  gp: number;
  // totals for per-game averages (not season aggregates from player.stats)
  rimFgm: number; rimFga: number;
  lpFgm:  number; lpFga:  number;
  mrFgm:  number; mrFga:  number;
  ba: number;
  // feats
  dd: number; td: number; qd: number; fiveBy5: number;
  // game highs
  gh: ReturnType<typeof emptyGH>;
}

function useBoxData(
  playerId: string,
  boxScores: any[],
): Map<string, BoxAggregate> {
  return useMemo(() => {
    const map = new Map<string, BoxAggregate>();

    const getOrCreate = (key: string): BoxAggregate => {
      if (!map.has(key)) {
        map.set(key, {
          gp: 0,
          rimFgm: 0, rimFga: 0, lpFgm: 0, lpFga: 0, mrFgm: 0, mrFga: 0,
          ba: 0, dd: 0, td: 0, qd: 0, fiveBy5: 0,
          gh: emptyGH(),
        });
      }
      return map.get(key)!;
    };

    boxScores.forEach((game: any) => {
      const allStats = [...(game.homeStats ?? []), ...(game.awayStats ?? [])];
      const s = allStats.find((p: any) => p.playerId === playerId);
      if (!s) return;

      const seasonYear = getGameSeasonYear(game.date ?? '');
      if (!seasonYear) return;

      const isPlayoffs = !!(game.isPlayoff || game.isPlayIn);
      const key = `${seasonYear}_${isPlayoffs ? 'ply' : 'rs'}`;
      const agg = getOrCreate(key);

      agg.gp++;

      // Shot locations (per game totals → will be divided by gp for per-game avg)
      const rimFgm = sp(s.fgAtRim);    const rimFga = sp(s.fgaAtRim);
      const lpFgm  = sp(s.fgLowPost);  const lpFga  = sp(s.fgaLowPost);
      const mrFgm  = sp(s.fgMidRange); const mrFga  = sp(s.fgaMidRange);
      const ba     = sp(s.ba);

      agg.rimFgm += rimFgm; agg.rimFga += rimFga;
      agg.lpFgm  += lpFgm;  agg.lpFga  += lpFga;
      agg.mrFgm  += mrFgm;  agg.mrFga  += mrFga;
      agg.ba     += ba;

      // Feats
      const pts  = sp(s.pts);
      const reb  = sp(s.reb ?? (sp(s.orb) + sp(s.drb)));
      const ast  = sp(s.ast);
      const stl  = sp(s.stl);
      const blk  = sp(s.blk);
      const cats10 = [pts >= 10, reb >= 10, ast >= 10, stl >= 10, blk >= 10].filter(Boolean).length;
      const cats5  = [pts >= 5,  reb >= 5,  ast >= 5,  stl >= 5,  blk >= 5 ].filter(Boolean).length;
      if (cats10 >= 2) agg.dd++;
      if (cats10 >= 3) agg.td++;
      if (cats10 >= 4) agg.qd++;
      if (cats5  >= 5) agg.fiveBy5++;

      // Game highs
      const gh = agg.gh;
      const fgm = sp(s.fgm); const fga = sp(s.fga);
      const tpm = sp(s.threePm); const tpa = sp(s.threePa);
      const twom = fgm - tpm;   const twoa = fga - tpa;
      const ftm = sp(s.ftm); const fta = sp(s.fta);
      const orb = sp(s.orb); const drb = sp(s.drb);
      const trb = sp(s.reb ?? (orb + drb));
      const tov = sp(s.tov); const pf = sp(s.pf);
      const pm  = sp(s.pm);
      const gmSc = sp(s.gameScore);
      const min  = sp(s.min);

      if (min   > gh.ghMin)  gh.ghMin  = min;
      if (fgm   > gh.ghFgm)  gh.ghFgm  = fgm;
      if (fga   > gh.ghFga)  gh.ghFga  = fga;
      if (tpm   > gh.ghTpm)  gh.ghTpm  = tpm;
      if (tpa   > gh.ghTpa)  gh.ghTpa  = tpa;
      if (twom  > gh.ghTwom) gh.ghTwom = twom;
      if (twoa  > gh.ghTwoa) gh.ghTwoa = twoa;
      if (ftm   > gh.ghFtm)  gh.ghFtm  = ftm;
      if (fta   > gh.ghFta)  gh.ghFta  = fta;
      if (orb   > gh.ghOrb)  gh.ghOrb  = orb;
      if (drb   > gh.ghDrb)  gh.ghDrb  = drb;
      if (trb   > gh.ghTrb)  gh.ghTrb  = trb;
      if (ast   > gh.ghAst)  gh.ghAst  = ast;
      if (tov   > gh.ghTov)  gh.ghTov  = tov;
      if (stl   > gh.ghStl)  gh.ghStl  = stl;
      if (blk   > gh.ghBlk)  gh.ghBlk  = blk;
      if (ba    > gh.ghBa)   gh.ghBa   = ba;
      if (pf    > gh.ghPf)   gh.ghPf   = pf;
      if (pts   > gh.ghPts)  gh.ghPts  = pts;
      if (pm    > gh.ghPm)   gh.ghPm   = pm;
      if (gmSc  > gh.ghGmSc) gh.ghGmSc = gmSc;
    });

    return map;
  }, [boxScores, playerId]);
}

// ─── Build season rows from player.stats ─────────────────────────────────────

function buildSeasonRows(
  stats: NBAGMStat[],
  teams: { id: number; abbrev?: string }[],
  currentYear: number,
  age: number | undefined,
  boxData: Map<string, BoxAggregate>,
  phase: Phase,
): { body: SeasonRow[]; career: SeasonRow | null } {
  const rsPool  = stats.filter(s => !s.playoffs && sp(s.gp) > 0);
  const plyPool = stats.filter(s =>  !!s.playoffs && sp(s.gp) > 0);

  const makeSeasoned = (pool: NBAGMStat[], phaseKey: 'rs' | 'ply'): SeasonRow[] => {
    const bySeasTid = new Map<string, NBAGMStat[]>();
    for (const s of pool) {
      const key = `${s.season}_${s.tid}`;
      if (!bySeasTid.has(key)) bySeasTid.set(key, []);
      bySeasTid.get(key)!.push(s);
    }

    const rows: SeasonRow[] = [];
    bySeasTid.forEach((list, key) => {
      const [seaStr] = key.split('_');
      const season   = parseInt(seaStr, 10);
      const team     = teams.find(t => t.id === list[0].tid);
      const abbrev   = team?.abbrev ?? (list[0].tid < 0 ? 'FA' : 'UNK');
      const rowAge   = (age ?? 0) - (currentYear - season);
      const bKey     = `${season}_${phaseKey}`;
      const box      = boxData.get(bKey);

      const totGp  = list.reduce((a, s) => a + sp(s.gp), 0) || 1;
      const totMin = list.reduce((a, s) => a + sp(s.min), 0);
      const totFg  = list.reduce((a, s) => a + sp(s.fg), 0);
      const totFga = list.reduce((a, s) => a + sp(s.fga), 0);
      const totTp  = list.reduce((a, s) => a + sp(s.tp), 0);
      const totTpa = list.reduce((a, s) => a + sp(s.tpa), 0);
      const totFt  = list.reduce((a, s) => a + sp(s.ft), 0);
      const totFta = list.reduce((a, s) => a + sp(s.fta), 0);
      const totOrb = list.reduce((a, s) => a + sp(s.orb), 0);
      const totDrb = list.reduce((a, s) => a + sp(s.drb), 0);
      const totTrb = list.reduce((a, s) => a + sp((s as any).trb ?? (s as any).reb ?? sp(s.orb) + sp(s.drb)), 0);
      const totAst = list.reduce((a, s) => a + sp(s.ast), 0);
      const totStl = list.reduce((a, s) => a + sp(s.stl), 0);
      const totBlk = list.reduce((a, s) => a + sp(s.blk), 0);
      const totTov = list.reduce((a, s) => a + sp(s.tov), 0);
      const totPf  = list.reduce((a, s) => a + sp(s.pf), 0);
      const totPts = list.reduce((a, s) => a + sp(s.pts), 0);
      const totPm  = list.reduce((a, s) => a + sp((s as any).pm), 0);
      const gp = totGp;
      const wpd = (k: string) => list.reduce((a, s) => a + sp((s as any)[k]) * sp(s.gp), 0) / gp;
      const rawWs  = list.reduce((a, s) => a + sp((s as any).ws), 0);
      const rawOws = list.reduce((a, s) => a + sp((s as any).ows), 0);
      const rawDws = list.reduce((a, s) => a + sp((s as any).dws), 0);

      rows.push({
        season, teamAbbrev: abbrev, age: Math.max(16, rowAge),
        gp, gs: list.reduce((a, s) => a + sp(s.gs), 0),
        minTotal: totMin, minPG: totMin / gp,
        fg:  totFg  / gp, fga: totFga / gp, fgPct: totFga > 0 ? totFg  / totFga : 0,
        tp:  totTp  / gp, tpa: totTpa / gp, tpPct: totTpa > 0 ? totTp  / totTpa : 0,
        twop:  (totFg - totTp) / gp,
        twopa: (totFga - totTpa) / gp,
        twopPct: (totFga - totTpa) > 0 ? (totFg - totTp) / (totFga - totTpa) : 0,
        efgPct: totFga > 0 ? (totFg + 0.5 * totTp) / totFga : 0,
        ft: totFt / gp, fta: totFta / gp, ftPct: totFta > 0 ? totFt / totFta : 0,
        orb: totOrb / gp, drb: totDrb / gp, trb: totTrb / gp,
        ast: totAst / gp, stl: totStl / gp, blk: totBlk / gp,
        tov: totTov / gp, pf: totPf / gp, pts: totPts / gp, pm: totPm / gp,
        // shot locations from box data (per-game averages)
        fgAtRim:   box ? box.rimFgm / box.gp : 0,
        fgaAtRim:  box ? box.rimFga / box.gp : 0,
        fgLowPost: box ? box.lpFgm  / box.gp : 0,
        fgaLowPost:box ? box.lpFga  / box.gp : 0,
        fgMidRange:box ? box.mrFgm  / box.gp : 0,
        fgaMidRange:box? box.mrFga  / box.gp : 0,
        ba:        box ? box.ba     / box.gp : 0,
        // feats
        dd: box?.dd ?? 0, td: box?.td ?? 0, qd: box?.qd ?? 0, fiveBy5: box?.fiveBy5 ?? 0,
        // advanced
        per: wpd('per'), ewa: rawWs / 11.4,
        tsPct: (totPts > 0 && (totFga + 0.44 * totFta) > 0) ? totPts / (2 * (totFga + 0.44 * totFta)) : sp(list[0]?.tsPct),
        ftRate: totFga > 0 ? totFta / totFga : 0,
        tpRate: totFga > 0 ? totTpa / totFga : 0,
        orbPct: wpd('orbPct') || wpd('orb%'),
        drbPct: wpd('drbPct') || wpd('drb%'),
        trbPct: wpd('rebPct') || wpd('trbPct') || wpd('reb%'),
        astPct: wpd('astPct') || wpd('ast%'),
        stlPct: wpd('stlPct') || wpd('stl%'),
        blkPct: wpd('blkPct') || wpd('blk%'),
        tovPct: wpd('tovPct') || wpd('tov%'),
        usgPct: wpd('usgPct') || wpd('usg%'),
        ortg: wpd('ortg'), drtg: wpd('drtg'),
        ows: rawOws, dws: rawDws, ws: rawWs,
        ws48: totMin > 0 ? rawWs / (totMin / 48) : 0, obpm: wpd('obpm'), dbpm: wpd('dbpm'), bpm: wpd('bpm'),
        vorp: list.reduce((a, s) => a + sp((s as any).vorp), 0),
        // game highs from box data
        ...(box?.gh ?? emptyGH()),
      });
    });
    return rows.sort((a, b) => a.season - b.season);
  };

  let body: SeasonRow[];
  if (phase === 'rs') {
    body = makeSeasoned(rsPool, 'rs');
  } else if (phase === 'playoffs') {
    body = makeSeasoned(plyPool, 'ply');
  } else {
    const rsBy  = makeSeasoned(rsPool, 'rs');
    const plyBy = makeSeasoned(plyPool, 'ply');
    const seasons = new Set([...rsBy.map(r => r.season), ...plyBy.map(r => r.season)]);
    body = [];
    seasons.forEach(season => {
      const a = rsBy.find(r => r.season === season);
      const b = plyBy.find(r => r.season === season);
      if (!a && !b) return;
      if (!b) { body.push(a!); return; }
      if (!a) { body.push(b!); return; }
      const totGp = a.gp + b.gp;
      const wm = (x: keyof SeasonRow, y: keyof SeasonRow) =>
        ((a[x] as number) * a.gp + (b[y] as number) * b.gp) / totGp;
      body.push({
        season, teamAbbrev: a.teamAbbrev, age: a.age,
        gp: totGp, gs: a.gs + b.gs,
        minTotal: a.minTotal + b.minTotal, minPG: (a.minPG * a.gp + b.minPG * b.gp) / totGp,
        fg: wm('fg','fg'), fga: wm('fga','fga'), fgPct: wm('fgPct','fgPct'),
        tp: wm('tp','tp'), tpa: wm('tpa','tpa'), tpPct: wm('tpPct','tpPct'),
        twop: wm('twop','twop'), twopa: wm('twopa','twopa'), twopPct: wm('twopPct','twopPct'),
        efgPct: wm('efgPct','efgPct'), ft: wm('ft','ft'), fta: wm('fta','fta'), ftPct: wm('ftPct','ftPct'),
        orb: wm('orb','orb'), drb: wm('drb','drb'), trb: wm('trb','trb'),
        ast: wm('ast','ast'), stl: wm('stl','stl'), blk: wm('blk','blk'),
        tov: wm('tov','tov'), pf: wm('pf','pf'), pts: wm('pts','pts'), pm: wm('pm','pm'),
        fgAtRim:    wm('fgAtRim','fgAtRim'),    fgaAtRim:    wm('fgaAtRim','fgaAtRim'),
        fgLowPost:  wm('fgLowPost','fgLowPost'), fgaLowPost:  wm('fgaLowPost','fgaLowPost'),
        fgMidRange: wm('fgMidRange','fgMidRange'),fgaMidRange: wm('fgaMidRange','fgaMidRange'),
        ba: wm('ba','ba'),
        dd: a.dd + b.dd, td: a.td + b.td, qd: a.qd + b.qd, fiveBy5: a.fiveBy5 + b.fiveBy5,
        per: wm('per','per'), ewa: a.ewa + b.ewa,
        tsPct: wm('tsPct','tsPct'), ftRate: wm('ftRate','ftRate'), tpRate: wm('tpRate','tpRate'),
        orbPct: wm('orbPct','orbPct'), drbPct: wm('drbPct','drbPct'), trbPct: wm('trbPct','trbPct'),
        astPct: wm('astPct','astPct'), stlPct: wm('stlPct','stlPct'), blkPct: wm('blkPct','blkPct'),
        tovPct: wm('tovPct','tovPct'), usgPct: wm('usgPct','usgPct'),
        ortg: wm('ortg','ortg'), drtg: wm('drtg','drtg'),
        ows: a.ows + b.ows, dws: a.dws + b.dws, ws: a.ws + b.ws,
        ws48: (a.minTotal + b.minTotal) > 0 ? (a.ws + b.ws) / ((a.minTotal + b.minTotal) / 48) : 0,
        obpm: wm('obpm','obpm'), dbpm: wm('dbpm','dbpm'),
        bpm: wm('bpm','bpm'), vorp: a.vorp + b.vorp,
        // game highs: take max across RS + playoffs
        ghMin:  Math.max(a.ghMin, b.ghMin),   ghFgm:  Math.max(a.ghFgm, b.ghFgm),
        ghFga:  Math.max(a.ghFga, b.ghFga),   ghTpm:  Math.max(a.ghTpm, b.ghTpm),
        ghTpa:  Math.max(a.ghTpa, b.ghTpa),   ghTwom: Math.max(a.ghTwom, b.ghTwom),
        ghTwoa: Math.max(a.ghTwoa, b.ghTwoa), ghFtm:  Math.max(a.ghFtm, b.ghFtm),
        ghFta:  Math.max(a.ghFta, b.ghFta),   ghOrb:  Math.max(a.ghOrb, b.ghOrb),
        ghDrb:  Math.max(a.ghDrb, b.ghDrb),   ghTrb:  Math.max(a.ghTrb, b.ghTrb),
        ghAst:  Math.max(a.ghAst, b.ghAst),   ghTov:  Math.max(a.ghTov, b.ghTov),
        ghStl:  Math.max(a.ghStl, b.ghStl),   ghBlk:  Math.max(a.ghBlk, b.ghBlk),
        ghBa:   Math.max(a.ghBa, b.ghBa),     ghPf:   Math.max(a.ghPf, b.ghPf),
        ghPts:  Math.max(a.ghPts, b.ghPts),   ghPm:   Math.max(a.ghPm, b.ghPm),
        ghGmSc: Math.max(a.ghGmSc, b.ghGmSc),
      });
    });
    body.sort((a, b) => a.season - b.season);
  }

  if (body.length === 0) return { body, career: null };

  const totGp = body.reduce((a, r) => a + r.gp, 0) || 1;
  const wpd = (k: keyof SeasonRow) => body.reduce((a, r) => a + (r[k] as number) * r.gp, 0) / totGp;
  const sum = (k: keyof SeasonRow) => body.reduce((a, r) => a + (r[k] as number), 0);

  const career: SeasonRow = {
    season: 0, teamAbbrev: '', age: 0, isCareer: true,
    gp: sum('gp'), gs: sum('gs'),
    minTotal: sum('minTotal'), minPG: wpd('minPG'),
    fg: wpd('fg'), fga: wpd('fga'),
    fgPct: body.reduce((a,r)=>a+r.fg*r.gp,0) / (body.reduce((a,r)=>a+r.fga*r.gp,0)||1),
    tp: wpd('tp'), tpa: wpd('tpa'),
    tpPct: body.reduce((a,r)=>a+r.tp*r.gp,0) / (body.reduce((a,r)=>a+r.tpa*r.gp,0)||1),
    twop: wpd('twop'), twopa: wpd('twopa'),
    twopPct: body.reduce((a,r)=>a+r.twop*r.gp,0) / (body.reduce((a,r)=>a+r.twopa*r.gp,0)||1),
    efgPct: wpd('efgPct'), ft: wpd('ft'), fta: wpd('fta'),
    ftPct: body.reduce((a,r)=>a+r.ft*r.gp,0) / (body.reduce((a,r)=>a+r.fta*r.gp,0)||1),
    orb: wpd('orb'), drb: wpd('drb'), trb: wpd('trb'),
    ast: wpd('ast'), stl: wpd('stl'), blk: wpd('blk'),
    tov: wpd('tov'), pf: wpd('pf'), pts: wpd('pts'), pm: wpd('pm'),
    fgAtRim: wpd('fgAtRim'), fgaAtRim: wpd('fgaAtRim'),
    fgLowPost: wpd('fgLowPost'), fgaLowPost: wpd('fgaLowPost'),
    fgMidRange: wpd('fgMidRange'), fgaMidRange: wpd('fgaMidRange'),
    ba: wpd('ba'),
    dd: sum('dd'), td: sum('td'), qd: sum('qd'), fiveBy5: sum('fiveBy5'),
    per: wpd('per'), ewa: sum('ewa'),
    tsPct: wpd('tsPct'), ftRate: wpd('ftRate'), tpRate: wpd('tpRate'),
    orbPct: wpd('orbPct'), drbPct: wpd('drbPct'), trbPct: wpd('trbPct'),
    astPct: wpd('astPct'), stlPct: wpd('stlPct'), blkPct: wpd('blkPct'),
    tovPct: wpd('tovPct'), usgPct: wpd('usgPct'),
    ortg: wpd('ortg'), drtg: wpd('drtg'),
    ows: sum('ows'), dws: sum('dws'), ws: sum('ws'),
    ws48: sum('minTotal') > 0 ? sum('ws') / (sum('minTotal') / 48) : 0,
    obpm: wpd('obpm'), dbpm: wpd('dbpm'), bpm: wpd('bpm'),
    vorp: sum('vorp'),
    // game highs career = career bests
    ghMin:  Math.max(...body.map(r => r.ghMin)),
    ghFgm:  Math.max(...body.map(r => r.ghFgm)),
    ghFga:  Math.max(...body.map(r => r.ghFga)),
    ghTpm:  Math.max(...body.map(r => r.ghTpm)),
    ghTpa:  Math.max(...body.map(r => r.ghTpa)),
    ghTwom: Math.max(...body.map(r => r.ghTwom)),
    ghTwoa: Math.max(...body.map(r => r.ghTwoa)),
    ghFtm:  Math.max(...body.map(r => r.ghFtm)),
    ghFta:  Math.max(...body.map(r => r.ghFta)),
    ghOrb:  Math.max(...body.map(r => r.ghOrb)),
    ghDrb:  Math.max(...body.map(r => r.ghDrb)),
    ghTrb:  Math.max(...body.map(r => r.ghTrb)),
    ghAst:  Math.max(...body.map(r => r.ghAst)),
    ghTov:  Math.max(...body.map(r => r.ghTov)),
    ghStl:  Math.max(...body.map(r => r.ghStl)),
    ghBlk:  Math.max(...body.map(r => r.ghBlk)),
    ghBa:   Math.max(...body.map(r => r.ghBa)),
    ghPf:   Math.max(...body.map(r => r.ghPf)),
    ghPts:  Math.max(...body.map(r => r.ghPts)),
    ghPm:   Math.max(...body.map(r => r.ghPm)),
    ghGmSc: Math.max(...body.map(r => r.ghGmSc)),
  };

  return { body, career };
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props { player: NBAPlayer }

export const PlayerBioStatsHistory: React.FC<Props> = ({ player }) => {
  const { state } = useGame();
  const [pgPhase,  setPgPhase]  = useState<Phase>('rs');
  const [slPhase,  setSlPhase]  = useState<Phase>('rs');
  const [advPhase, setAdvPhase] = useState<Phase>('rs');
  const [ghPhase,  setGhPhase]  = useState<Phase>('rs');

  const allStarSeasons = useMemo<Set<number>>(() => {
    const set = new Set<number>();
    (player.awards ?? []).forEach(a => {
      if (a.type && (a.type.toLowerCase().includes('all-star') || a.type.toLowerCase().includes('allstar'))) {
        set.add(a.season);
      }
    });
    return set;
  }, [player.awards]);

  const boxData = useBoxData(player.internalId, state.boxScores);
  const stats   = (player.stats ?? []) as NBAGMStat[];

  const build = (phase: Phase) =>
    buildSeasonRows(stats, state.teams, state.leagueStats.year, player.age, boxData, phase);

  const pgData  = useMemo(() => build(pgPhase),  [pgPhase,  stats, boxData]);
  const slData  = useMemo(() => build(slPhase),  [slPhase,  stats, boxData]);
  const advData = useMemo(() => build(advPhase), [advPhase, stats, boxData]);
  const ghData  = useMemo(() => build(ghPhase),  [ghPhase,  stats, boxData]);

  const toRows = (d: { body: SeasonRow[]; career: SeasonRow | null }) =>
    [...d.body, ...(d.career ? [d.career] : [])];

  return (
    <div className="p-4 md:p-6 bg-[#080808] space-y-8">

      {/* Per Game */}
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Per Game</h3>
            {allStarSeasons.size > 0 && <p className="text-[10px] text-slate-600 mt-0.5">★ All-Star season</p>}
          </div>
          <PhaseTabs phase={pgPhase} onChange={setPgPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(pgData)} cols={PG_COLS} allStarSeasons={allStarSeasons} />
        </div>
      </section>

      {/* Shot Locations & Feats */}
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Shot Locations &amp; Feats</h3>
          <PhaseTabs phase={slPhase} onChange={setSlPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(slData)} cols={SL_COLS} allStarSeasons={allStarSeasons} groupHeaders={SL_GROUPS} />
        </div>
      </section>

      {/* Advanced */}
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Advanced</h3>
          <PhaseTabs phase={advPhase} onChange={setAdvPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(advData)} cols={ADV_COLS} allStarSeasons={allStarSeasons} />
        </div>
      </section>

      {/* Game Highs */}
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Game Highs</h3>
          <PhaseTabs phase={ghPhase} onChange={setGhPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(ghData)} cols={GH_COLS} allStarSeasons={allStarSeasons} />
        </div>
      </section>

    </div>
  );
};
