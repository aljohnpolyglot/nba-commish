import { calculateK2, K2_CATS } from '../../../services/simulation/convert2kAttributes';
import type { NBAPlayer } from '../../../types';

export const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

export const K2_DISPLAY_CATS = K2_CATS.filter((category) => category.k !== 'MI');

const EXTERNAL_STATUSES = ['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'];
export const MODAL_LEAGUES = ['NBA', 'Draft Prospects', ...EXTERNAL_STATUSES, 'Retired'] as const;
export type ModalLeague = typeof MODAL_LEAGUES[number];
export type StatMode = 'perGame' | 'advanced';

export function getPlayerLeague(player: NBAPlayer): ModalLeague {
  if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') return 'Draft Prospects';
  if (player.status === 'Retired') return 'Retired';
  if (EXTERNAL_STATUSES.includes(player.status ?? '')) return player.status as ModalLeague;
  return 'NBA';
}

interface Metric {
  id: string;
  label: string;
  title?: string;
  getValue: (player: NBAPlayer, season: number) => number;
  format: (value: number) => string;
  isBetterHigher: boolean;
}

function pg(player: NBAPlayer, season: number, key: keyof typeof player.stats[0]): number {
  const stat = player.stats?.find((entry) => entry.season === season && !entry.playoffs);
  if (!stat || !stat.gp) return 0;
  return (stat[key] as number ?? 0) / stat.gp;
}

function rate(player: NBAPlayer, season: number, key: keyof typeof player.stats[0]): number {
  return (player.stats?.find((entry) => entry.season === season && !entry.playoffs)?.[key] as number) ?? 0;
}

const fmt1 = (value: number) => value.toFixed(1);
const fmtSign = (value: number) => (value >= 0 ? '+' : '') + value.toFixed(1);
const fmtPct3 = (value: number) => value > 0 ? '.' + Math.round(value * 1000).toString().padStart(3, '0') : '—';

export const PG_METRICS: Metric[] = [
  { id: 'pts', label: 'PTS', isBetterHigher: true, format: fmt1, getValue: (player, season) => pg(player, season, 'pts') },
  { id: 'reb', label: 'REB', isBetterHigher: true, format: fmt1, getValue: (player, season) => pg(player, season, 'trb') },
  { id: 'ast', label: 'AST', isBetterHigher: true, format: fmt1, getValue: (player, season) => pg(player, season, 'ast') },
  { id: 'stl', label: 'STL', isBetterHigher: true, format: fmt1, getValue: (player, season) => pg(player, season, 'stl') },
  { id: 'blk', label: 'BLK', isBetterHigher: true, format: fmt1, getValue: (player, season) => pg(player, season, 'blk') },
  { id: 'tov', label: 'TOV', isBetterHigher: false, format: fmt1, getValue: (player, season) => pg(player, season, 'tov') },
  { id: 'min', label: 'MIN', isBetterHigher: true, format: fmt1, getValue: (player, season) => pg(player, season, 'min') },
  { id: 'gp', label: 'GP', isBetterHigher: true, format: (value) => String(Math.round(value)), getValue: (player, season) => rate(player, season, 'gp') },
  { id: 'ts', label: 'TS%', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'tsPct') },
  { id: 'rts', label: 'rTS%', isBetterHigher: true, format: (value) => (value > 0 ? '+' : '') + fmt1(value), getValue: (player, season) => rate(player, season, 'tsPct') - 58.0 },
  { id: 'tpp', label: '3P%', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'tpp') },
  { id: 'ftp', label: 'FT%', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'ftp') },
];

export const ADV_METRICS: Metric[] = [
  { id: 'gp', label: 'GP', isBetterHigher: true, format: (value) => String(Math.round(value)), getValue: (player, season) => rate(player, season, 'gp') },
  { id: 'min', label: 'MIN', isBetterHigher: true, format: fmt1, getValue: (player, season) => pg(player, season, 'min') },
  { id: 'per', label: 'PER', title: 'Player Efficiency Rating', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'per') },
  { id: 'ewa', label: 'EWA', title: 'Estimated Wins Added', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'ewa') },
  { id: 'ts', label: 'TS%', title: 'True Shooting %', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'tsPct') },
  { id: 'usg', label: 'USG%', title: 'Usage Rate', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'usgPct') },
  { id: 'pm', label: '+/-', title: 'Plus/Minus per game', isBetterHigher: true, format: fmtSign, getValue: (player, season) => pg(player, season, 'pm') },
  { id: 'ortg', label: 'ORtg', title: 'Offensive Rating', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'ortg') },
  { id: 'drtg', label: 'DRtg', title: 'Defensive Rating (lower = better)', isBetterHigher: false, format: fmt1, getValue: (player, season) => rate(player, season, 'drtg') },
  { id: 'orbp', label: 'ORB%', title: 'Offensive Rebound %', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'orbPct') },
  { id: 'drbp', label: 'DRB%', title: 'Defensive Rebound %', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'drbPct') },
  { id: 'trbp', label: 'TRB%', title: 'Total Rebound %', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'rebPct') },
  { id: 'astp', label: 'AST%', title: 'Assist %', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'astPct') },
  { id: 'stlp', label: 'STL%', title: 'Steal %', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'stlPct') },
  { id: 'blkp', label: 'BLK%', title: 'Block %', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'blkPct') },
  { id: 'tovp', label: 'TOV%', title: 'Turnover %', isBetterHigher: false, format: fmt1, getValue: (player, season) => rate(player, season, 'tovPct') },
  { id: 'obpm', label: 'OBPM', title: 'Offensive Box Plus-Minus', isBetterHigher: true, format: fmtSign, getValue: (player, season) => rate(player, season, 'obpm') },
  { id: 'dbpm', label: 'DBPM', title: 'Defensive Box Plus-Minus', isBetterHigher: true, format: fmtSign, getValue: (player, season) => rate(player, season, 'dbpm') },
  { id: 'bpm', label: 'BPM', title: 'Box Plus-Minus', isBetterHigher: true, format: fmtSign, getValue: (player, season) => rate(player, season, 'bpm') },
  { id: 'ws', label: 'WS', title: 'Win Shares', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'ws') },
  {
    id: 'ws48',
    label: 'WS/48',
    title: 'Win Shares per 48 min',
    isBetterHigher: true,
    format: (value) => value.toFixed(3),
    getValue: (player, season) => {
      const stat = player.stats?.find((entry) => entry.season === season && !entry.playoffs);
      if (!stat || !stat.min) return 0;
      return (stat.ws ?? 0) / (stat.min / 48);
    },
  },
  { id: 'vorp', label: 'VORP', title: 'Value Over Replacement Player', isBetterHigher: true, format: fmt1, getValue: (player, season) => rate(player, season, 'vorp') },
];

export function getK2(player: NBAPlayer) {
  const ratings = player.ratings?.[player.ratings.length - 1];
  if (!ratings) return null;
  return calculateK2(ratings as any, {
    pos: player.pos,
    heightIn: player.hgt,
    weightLbs: player.weight,
    age: player.age,
  });
}

