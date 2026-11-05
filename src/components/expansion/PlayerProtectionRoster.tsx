import React from 'react';
import { ArrowUpDown, Check, Lock, Users } from 'lucide-react';
import type { NBAPlayer } from '../../types';
import { PlayerPortrait } from '../shared/PlayerPortrait';

export type ProtectionSortKey = 'ovr' | 'pot' | 'age' | 'pos' | 'name' | 'yrs' | 'salary';
export type ProtectionSortDir = 'asc' | 'desc';

export interface ProtectionRosterRow {
  player: NBAPlayer;
  ovr: number;
  pot: number;
  age: number;
  yearsLeft: number;
  salaryUSD: number;
}

interface Props {
  rows: ProtectionRosterRow[];
  protectedIds: Set<string>;
  familyLocked: Set<string>;
  protectionLimit: number;
  sortKey: ProtectionSortKey;
  sortDir: ProtectionSortDir;
  onSort: (key: ProtectionSortKey) => void;
  onToggle: (playerId: string) => void;
  formatSalary: (salaryUSD: number) => string;
}

export function PlayerProtectionRoster({
  rows,
  protectedIds,
  familyLocked,
  protectionLimit,
  sortKey,
  sortDir,
  onSort,
  onToggle,
  formatSalary,
}: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/60 text-center text-slate-500">
        <div>
          <Users className="mx-auto mb-2 h-10 w-10 opacity-40" />
          <p className="text-sm">No active players on this roster.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row, index) => (
          <MobileProtectionCard
            key={row.player.internalId}
            row={row}
            rank={index + 1}
            checked={protectedIds.has(row.player.internalId)}
            disabled={familyLocked.has(row.player.internalId) || (!protectedIds.has(row.player.internalId) && protectedIds.size >= protectionLimit)}
            familyLocked={familyLocked.has(row.player.internalId)}
            onToggle={onToggle}
            formatSalary={formatSalary}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-slate-800 bg-[#081321] md:block">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-slate-700/80 bg-slate-800/70 text-[11px] font-black uppercase tracking-wider text-slate-400">
            <tr>
              <th className="w-14 px-3 py-3 text-center">#</th>
              <SortHeader label="Player" colKey="name" align="left" sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
              <SortHeader label="Pos" colKey="pos" width="w-16" sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
              <SortHeader label="Age" colKey="age" width="w-16" sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
              <SortHeader label="OVR" colKey="ovr" width="w-20" sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
              <SortHeader label="POT" colKey="pot" width="w-20" sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
              <SortHeader label="Contract" colKey="salary" width="w-28" sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
              <SortHeader label="Yrs" colKey="yrs" width="w-20" sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
              <th className="w-24 px-3 py-3 text-center">Protect</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const checked = protectedIds.has(row.player.internalId);
              const locked = familyLocked.has(row.player.internalId);
              const disabled = locked || (!checked && protectedIds.size >= protectionLimit);
              return (
                <tr
                  key={row.player.internalId}
                  data-testid="expansion-protection-row"
                  className={`border-b border-slate-800/80 transition-colors last:border-b-0 ${checked ? 'bg-violet-500/10' : 'hover:bg-slate-800/35'}`}
                >
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/70 font-black text-violet-400">{index + 1}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <PlayerPortrait imgUrl={row.player.imgURL} face={(row.player as NBAPlayer & { face?: unknown }).face} playerName={row.player.name} size={42} />
                      <span className="truncate font-bold text-white">{row.player.name}</span>
                      {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                    </div>
                  </td>
                  <td className="text-center font-semibold text-slate-300">{row.player.pos || '—'}</td>
                  <td className="text-center text-slate-300">{row.age}</td>
                  <td className="text-center"><span className="inline-flex min-w-12 justify-center rounded-xl bg-slate-800 px-3 py-2 text-lg font-black text-white">{row.ovr}</span></td>
                  <td className="text-center font-black text-emerald-400">{row.pot}</td>
                  <td className="text-center font-semibold text-slate-200">{row.salaryUSD > 0 ? formatSalary(row.salaryUSD) : '—'}</td>
                  <td className="text-center">
                    {row.yearsLeft === 0
                      ? <span className="rounded-md bg-rose-500/20 px-2 py-1 text-[11px] font-black uppercase text-rose-300">Exp</span>
                      : <span className="font-semibold text-slate-300">{row.yearsLeft}</span>}
                  </td>
                  <td className="text-center">
                    <ProtectCheckbox playerName={row.player.name} checked={checked} disabled={disabled} onChange={() => onToggle(row.player.internalId)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MobileProtectionCard({
  row,
  rank,
  checked,
  disabled,
  familyLocked,
  onToggle,
  formatSalary,
}: {
  row: ProtectionRosterRow;
  rank: number;
  checked: boolean;
  disabled: boolean;
  familyLocked: boolean;
  onToggle: (playerId: string) => void;
  formatSalary: (salaryUSD: number) => string;
}) {
  return (
    <div data-testid="expansion-protection-row" className={`rounded-2xl border p-3 ${checked ? 'border-violet-500/50 bg-violet-500/10' : 'border-slate-800 bg-slate-950/70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-black text-violet-400">{rank}</span>
          <PlayerPortrait imgUrl={row.player.imgURL} face={(row.player as NBAPlayer & { face?: unknown }).face} playerName={row.player.name} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-white">{row.player.name}</span>
              {familyLocked && <Lock className="h-3 w-3 shrink-0 text-amber-400" />}
            </div>
            <div className="text-[11px] text-slate-500">{row.player.pos || '—'} · Age {row.age}</div>
          </div>
        </div>
        <ProtectCheckbox playerName={row.player.name} checked={checked} disabled={disabled} onChange={() => onToggle(row.player.internalId)} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-xl bg-black/20 p-2 text-center">
        <MiniStat label="OVR" value={String(row.ovr)} accent="text-white" />
        <MiniStat label="POT" value={String(row.pot)} accent="text-emerald-400" />
        <MiniStat label="Contract" value={row.salaryUSD > 0 ? formatSalary(row.salaryUSD) : '—'} />
        <MiniStat label="Yrs" value={row.yearsLeft === 0 ? 'Exp' : String(row.yearsLeft)} accent={row.yearsLeft === 0 ? 'text-rose-300' : undefined} />
      </div>
    </div>
  );
}

function SortHeader({
  label,
  colKey,
  align = 'center',
  width = '',
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  colKey: ProtectionSortKey;
  align?: 'left' | 'center';
  width?: string;
  sortKey: ProtectionSortKey;
  sortDir: ProtectionSortDir;
  onClick: (key: ProtectionSortKey) => void;
}) {
  const active = sortKey === colKey;
  return (
    <th className={`px-3 py-3 ${width} ${align === 'left' ? 'text-left' : 'text-center'}`}>
      <button type="button" onClick={() => onClick(colKey)} className={`inline-flex items-center gap-1 transition-colors hover:text-white ${active ? 'rounded-lg bg-violet-500/10 px-2 py-1 text-violet-400' : ''}`}>
        {label}
        {active ? <span className="text-[9px]">{sortDir === 'desc' ? '▼' : '▲'}</span> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function ProtectCheckbox({ playerName, checked, disabled, onChange }: { playerName: string; checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      aria-label={`${checked ? 'Unprotect' : 'Protect'} ${playerName}`}
      aria-pressed={checked}
      disabled={disabled}
      onClick={event => { event.stopPropagation(); if (!disabled) onChange(); }}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-all ${checked ? 'border-violet-400 bg-violet-600 shadow-[0_0_12px_rgba(139,92,246,0.35)]' : 'border-slate-600 bg-slate-900 hover:border-violet-400'} ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
    >
      {checked && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
    </button>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] font-black uppercase tracking-wider text-slate-600">{label}</div>
      <div className={`truncate text-[11px] font-black text-slate-300 ${accent ?? ''}`}>{value}</div>
    </div>
  );
}
