import React, { useMemo, useState } from 'react';
import type { InternationalTournamentState } from '../../../services/fiba/types';
import { CountryFlag } from '../../shared/CountryFlag';
import StatsTable, { type PlayerStatRow } from './StatsTable';
import {
  buildFibaPlayerGameHighRows,
  buildFibaTeamGameHighRows,
  buildFibaTeamStatRows,
  buildFibaPlayerStatRowsByPhase,
  type FibaPlayerGameHighRow,
  type FibaStatMetric,
  type FibaStatsPhase,
  type FibaTeamGameHighRow,
  type FibaTeamStatRow,
} from './fibaStatsData';

type StatsTab = 'player-leaders' | 'player-highs' | 'team-leaders' | 'team-highs';

const tabs: Array<{ id: StatsTab; label: string }> = [
  { id: 'player-leaders', label: 'Players - Leaders' },
  { id: 'player-highs', label: 'Players - Game Highs' },
  { id: 'team-leaders', label: 'Teams - Leaders' },
  { id: 'team-highs', label: 'Teams - Game Highs' },
];

const metrics: Array<{ id: FibaStatMetric; label: string; leaderLabel: string }> = [
  { id: 'PTS', label: 'Points', leaderLabel: 'Points Per Game' },
  { id: 'TRB', label: 'Rebounds', leaderLabel: 'Rebounds Per Game' },
  { id: 'AST', label: 'Assists', leaderLabel: 'Assists Per Game' },
  { id: 'STL', label: 'Steals', leaderLabel: 'Steals Per Game' },
  { id: 'BLK', label: 'Blocks', leaderLabel: 'Blocks Per Game' },
];

const phases: FibaStatsPhase[] = ['Overall', 'Group Phase', 'Round of 16', 'Quarter-Finals', 'Semi-Finals', '3rd Place Game', 'Final'];

const metricValue = (row: FibaTeamStatRow, metric: FibaStatMetric, perGame: boolean): number => {
  if (!perGame) return row[metric];
  return row[`${metric}_pg` as 'PTS_pg' | 'TRB_pg' | 'AST_pg' | 'STL_pg' | 'BLK_pg'];
};

const format = (value: number, digits = 1): string => Number(value.toFixed(digits)).toString();
const formatPct = (value: number): string => format(value * 100, 1);
const formatGameDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed)}, '${String(parsed.getUTCFullYear()).slice(-2)}`;
};

function SelectControl({ value, onChange, children, label }: React.PropsWithChildren<{ value: string; onChange?: (value: string) => void; label: string }>) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={event => onChange?.(event.target.value)}
        className="h-14 w-full appearance-none rounded-md border border-transparent bg-[#2c333e] px-3 pr-10 text-sm font-semibold text-white outline-none transition-colors focus:border-[#69f3cf]"
      >
        {children}
      </select>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m7 10 5 5 5-5" />
      </svg>
    </label>
  );
}

function StatsTopThree({ rows, metric, perGame }: { rows: readonly FibaTeamStatRow[]; metric: FibaStatMetric; perGame: boolean }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {rows.slice(0, 3).map((row, index) => (
        <article key={`${row.id}-${index}`} className="overflow-hidden rounded-lg bg-[#68efcc] text-center text-slate-950">
          <div className="bg-white/35 px-3 py-3 text-[10px] font-black uppercase">{index + 1}{index === 0 ? 'st' : index === 1 ? 'nd' : 'rd'}</div>
          <div className="flex min-h-48 flex-col items-center justify-center gap-4 px-4 py-7">
            <CountryFlag country={row.teamName} className="inline-flex h-14 w-20" imageClassName="h-full w-full object-contain" />
            <h3 className="text-base font-medium">{row.teamName}</h3>
            <span className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium">
              {format(metricValue(row, metric, perGame))} {metric}{perGame ? ' PG' : ''}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function TeamLeadersTable({ rows }: { rows: readonly FibaTeamStatRow[] }) {
  return (
    <StatsShell>
      <table className="w-full min-w-[980px] border-collapse text-xs">
        <thead className="bg-[#68efcc] text-[10px] font-black uppercase text-slate-950">
          <tr><th className="px-3 py-3">#</th><th className="px-3 py-3 text-left">Teams</th><th>GP</th><th>MPG</th><th>PPG</th><th>PTS</th><th>FGMPG-FGAPG</th><th>FG%</th><th>3PMPG-3PAPG</th><th>3P%</th><th>FTMPG-FTAPG</th><th>FT%</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className={index % 2 ? 'bg-[#202731]' : 'bg-[#303640]'}>
              <td className="px-3 py-3 text-center text-slate-300">{index + 1}.</td>
              <td className="px-3 py-3 font-semibold text-[#46efc1]"><span className="flex items-center gap-2"><CountryFlag country={row.teamName} className="inline-flex h-6 w-10" imageClassName="h-full w-full object-contain" />{row.teamName}</span></td>
              <td>{row.G}</td><td>{format(row.MP / row.G)}</td><td>{format(row.PTS_pg)}</td><td>{row.PTS}</td>
              <td>{format(row.FGM_pg)}-{format(row.FGA_pg)}</td><td>{formatPct(row.FG_pct)}</td>
              <td>{format(row.threeP_pg)}-{format(row.threePA_pg)}</td><td>{formatPct(row.threeP_pct)}</td>
              <td>{format(row.FTM_pg)}-{format(row.FTA_pg)}</td><td>{formatPct(row.FT_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </StatsShell>
  );
}

function PlayerHighsTable({ rows, metric, onPlayerSelect, onGameSelect }: { rows: readonly FibaPlayerGameHighRow[]; metric: FibaStatMetric; onPlayerSelect?: (playerId: string) => void; onGameSelect?: (gameId: number) => void }) {
  return (
    <StatsShell>
      <table className="w-full min-w-[980px] border-collapse text-xs">
        <thead className="bg-[#68efcc] text-[10px] font-black uppercase text-slate-950">
          <tr><th className="px-3 py-3">#</th><th className="px-3 py-3 text-left">Players</th><th className="px-3 py-3 text-left">Game</th><th>Value</th><th>2PM-2PA</th><th>3PM-3PA</th><th>FTM-FTA</th><th>{metric}</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className={index % 2 ? 'bg-[#202731]' : 'bg-[#303640]'}>
              <td className="px-3 py-3 text-center text-slate-300">{index + 1}.</td>
              <td className="px-3 py-3 text-left font-semibold text-[#46efc1]"><button type="button" disabled={!row.playerId || !onPlayerSelect} onClick={() => row.playerId && onPlayerSelect?.(row.playerId)} className="disabled:cursor-default">{row.name} ({row.teamCode})</button></td>
              <td className="px-3 py-3 text-left"><button type="button" disabled={!onGameSelect} onClick={() => onGameSelect?.(row.gameId)} className="text-[#46efc1] underline-offset-2 hover:underline disabled:cursor-default disabled:no-underline">{row.gameLabel}, {formatGameDate(row.date)}</button></td>
              <td className="font-bold">{row[metric]}</td><td>{row.FGM - row.threeP}-{row.FGA - row.threePA}</td><td>{row.threeP}-{row.threePA}</td><td>{row.FTM}-{row.FTA}</td><td>{row[metric]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </StatsShell>
  );
}

function TeamHighsTable({ rows, metric }: { rows: readonly FibaTeamGameHighRow[]; metric: FibaStatMetric }) {
  return (
    <StatsShell>
      <table className="w-full min-w-[980px] border-collapse text-xs">
        <thead className="bg-[#68efcc] text-[10px] font-black uppercase text-slate-950">
          <tr><th className="px-3 py-3">#</th><th className="px-3 py-3 text-left">Teams</th><th className="px-3 py-3 text-left">Game</th><th>Value</th><th>2PM-2PA</th><th>3PM-3PA</th><th>FTM-FTA</th><th>{metric}</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className={index % 2 ? 'bg-[#202731]' : 'bg-[#303640]'}>
              <td className="px-3 py-3 text-center text-slate-300">{index + 1}.</td>
              <td className="px-3 py-3 text-left font-semibold text-[#46efc1]"><span className="flex items-center gap-2"><CountryFlag country={row.teamName} className="inline-flex h-6 w-10" imageClassName="h-full w-full object-contain" />{row.teamName}</span></td>
              <td className="px-3 py-3 text-left text-[#46efc1]">{row.gameLabel}, {formatGameDate(row.date)}</td>
              <td className="font-bold">{row[metric]}</td><td>{row.FGM - row.threeP}-{row.FGA - row.threePA}</td><td>{row.threeP}-{row.threePA}</td><td>{row.FTM}-{row.FTA}</td><td>{row[metric]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </StatsShell>
  );
}

function StatsShell({ children }: React.PropsWithChildren) {
  return <div className="overflow-x-auto rounded-t-lg text-center text-white">{children}</div>;
}

interface FibaStatsViewProps {
  tournament: InternationalTournamentState;
  players: readonly PlayerStatRow[];
  onPlayerSelect?: (playerId: string) => void;
  onGameSelect?: (gameId: number) => void;
}

export default function FibaStatsView({ tournament, players, onPlayerSelect, onGameSelect }: FibaStatsViewProps) {
  const [tab, setTab] = useState<StatsTab>('player-leaders');
  const [metric, setMetric] = useState<FibaStatMetric>('PTS');
  const [position, setPosition] = useState('All positions');
  const [phase, setPhase] = useState<FibaStatsPhase>('Overall');
  const teamLeaders = useMemo(() => buildFibaTeamStatRows(tournament, phase), [phase, tournament]);
  const teamHighs = useMemo(() => buildFibaTeamGameHighRows(tournament), [tournament]);
  const playerHighs = useMemo(() => buildFibaPlayerGameHighRows(tournament, players), [players, tournament]);
  const sortedTeamLeaders = useMemo(() => [...teamLeaders].sort((a, b) => metricValue(b, metric, true) - metricValue(a, metric, true)), [metric, teamLeaders]);
  const sortedTeamHighs = useMemo(() => teamHighs.filter(row => phase === 'Overall' || row.phase === phase).sort((a, b) => b[metric] - a[metric]), [metric, phase, teamHighs]);
  const sortedPlayerHighs = useMemo(() => playerHighs.filter(row => (position === 'All positions' || row.pos === position) && (phase === 'Overall' || row.phase === phase)).sort((a, b) => b[metric] - a[metric]), [metric, phase, playerHighs, position]);
  const positions = useMemo(() => [...new Set(playerHighs.map(row => row.pos).filter(Boolean))].sort(), [playerHighs]);
  const playerRowsByPhase = useMemo(() => buildFibaPlayerStatRowsByPhase(tournament, players), [players, tournament]);

  return (
    <section className="bg-[#111720] pb-14 text-white">
      <div role="tablist" aria-label="Tournament statistics" className="border-b border-[#303640] px-4 py-4">
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto">
          {tabs.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68efcc] ${tab === item.id ? 'bg-[#68efcc] text-slate-950' : 'bg-[#303640] text-white hover:bg-[#3a424f]'}`}>{item.label}</button>)}
        </div>
      </div>
      <div aria-hidden="true" className="mx-auto h-28 max-w-3xl bg-[#20262f] md:h-44" />

      {tab === 'player-leaders' ? <StatsTable rows={players} phaseRows={playerRowsByPhase} onPlayerSelect={onPlayerSelect} /> : (
        <div className="mx-auto max-w-6xl px-4">
          <div className={`mb-10 mt-12 grid gap-2 ${tab === 'player-highs' ? 'md:grid-cols-3' : tab === 'team-highs' ? 'md:grid-cols-2' : ''}`}>
            <SelectControl value={metric} label="Statistic" onChange={value => setMetric(value as FibaStatMetric)}>{metrics.map(item => <option key={item.id} value={item.id}>{tab === 'team-leaders' ? item.leaderLabel : item.label}</option>)}</SelectControl>
            {tab === 'player-highs' && <SelectControl value={position} label="Position" onChange={setPosition}><option>All positions</option>{positions.map(value => <option key={value}>{value}</option>)}</SelectControl>}
            <SelectControl value={phase} label="Phase" onChange={value => setPhase(value as FibaStatsPhase)}>{phases.map(value => <option key={value}>{value}</option>)}</SelectControl>
          </div>

          {tab === 'player-highs' && <PlayerHighsTable rows={sortedPlayerHighs} metric={metric} onPlayerSelect={onPlayerSelect} onGameSelect={onGameSelect} />}
          {tab === 'team-leaders' && <div className="space-y-8"><StatsTopThree rows={sortedTeamLeaders} metric={metric} perGame /><TeamLeadersTable rows={sortedTeamLeaders} /></div>}
          {tab === 'team-highs' && <div className="space-y-8"><StatsTopThree rows={sortedTeamHighs} metric={metric} perGame={false} /><TeamHighsTable rows={sortedTeamHighs} metric={metric} /></div>}
        </div>
      )}
    </section>
  );
}
