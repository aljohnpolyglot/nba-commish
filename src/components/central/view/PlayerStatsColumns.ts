import { Phase, PlayerStatsColumn, StatType } from './PlayerStatsTypes';

export const BASIC_COLS: PlayerStatsColumn[] = [
  { key: 'gp', label: 'G' },
  { key: 'gs', label: 'GS', dim: true },
  { key: 'min', label: 'MP' },
  { key: 'fg', label: 'FG' },
  { key: 'fga', label: 'FGA', dim: true },
  { key: 'fgPct', label: 'FG%' },
  { key: 'tp', label: '3P' },
  { key: 'tpa', label: '3PA', dim: true },
  { key: 'tpPct', label: '3P%' },
  { key: 'fp', label: '4P', dim: true },
  { key: 'fpa', label: '4PA', dim: true },
  { key: 'fpPct', label: '4P%', dim: true },
  { key: 'twop', label: '2P', dim: true },
  { key: 'twopa', label: '2PA', dim: true },
  { key: 'twopPct', label: '2P%', dim: true },
  { key: 'efgPct', label: 'eFG%', dim: true },
  { key: 'ft', label: 'FT' },
  { key: 'fta', label: 'FTA', dim: true },
  { key: 'ftPct', label: 'FT%' },
  { key: 'orb', label: 'ORB', dim: true },
  { key: 'drb', label: 'DRB', dim: true },
  { key: 'trb', label: 'TRB' },
  { key: 'ast', label: 'AST' },
  { key: 'tov', label: 'TOV' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'pf', label: 'PF', dim: true },
  { key: 'pts', label: 'PTS' },
];

export const ADV_COLS: PlayerStatsColumn[] = [
  { key: 'gp', label: 'G', title: 'Games Played' },
  { key: 'gs', label: 'GS', title: 'Games Started', dim: true },
  { key: 'min', label: 'MP', title: 'Minutes Per Game' },
  { key: 'per', label: 'PER', title: 'Player Efficiency Rating' },
  { key: 'ewa', label: 'EWA', title: 'Estimated Wins Added', dim: true },
  { key: 'tsPct', label: 'TS%', title: 'True Shooting Percentage' },
  { key: 'threePAr', label: '3PAr', title: 'Three Point Attempt Rate (3PA / FGA)', dim: true },
  { key: 'ftRate', label: 'FTr', title: 'Free Throw Attempt Rate (FTA / FGA)', dim: true },
  { key: 'orbPct', label: 'ORB%', title: 'Percentage of available offensive rebounds grabbed', dim: true },
  { key: 'drbPct', label: 'DRB%', title: 'Percentage of available defensive rebounds grabbed', dim: true },
  { key: 'trbPct', label: 'TRB%', title: 'Percentage of available rebounds grabbed' },
  { key: 'astPct', label: 'AST%', title: 'Percentage of teammate field goals assisted while on the floor' },
  { key: 'stlPct', label: 'STL%', title: 'Percentage of opponent possessions ending in steals' },
  { key: 'blkPct', label: 'BLK%', title: 'Percentage of opponent two-pointers blocked' },
  { key: 'tovPct', label: 'TOV%', title: 'Turnovers per 100 plays', dim: true },
  { key: 'usgPct', label: 'USG%', title: 'Percentage of team plays used' },
  { key: 'pm', label: '+/-', title: 'Plus/Minus', dim: true },
  { key: 'ortg', label: 'ORtg', title: 'Offensive Rating (points scored per 100 possessions)' },
  { key: 'drtg', label: 'DRtg', title: 'Defensive Rating (points allowed per 100 possessions)' },
  { key: 'ows', label: 'OWS', title: 'Offensive Win Shares', dim: true },
  { key: 'dws', label: 'DWS', title: 'Defensive Win Shares', dim: true },
  { key: 'ws', label: 'WS', title: 'Win Shares' },
  { key: 'ws48', label: 'WS/48', title: 'Win Shares Per 48 Minutes', dim: true },
  { key: 'obpm', label: 'OBPM', title: 'Offensive Box Plus-Minus', dim: true },
  { key: 'dbpm', label: 'DBPM', title: 'Defensive Box Plus-Minus', dim: true },
  { key: 'bpm', label: 'BPM', title: 'Box Plus-Minus' },
  { key: 'vorp', label: 'VORP', title: 'Value Over Replacement Player' },
];

export const SL_COLS: PlayerStatsColumn[] = [
  { key: 'gp', label: 'G' },
  { key: 'min', label: 'MP' },
  { key: 'rimFgm', label: 'RimFG' },
  { key: 'rimFga', label: 'RimA', dim: true },
  { key: 'rimFgPct', label: 'Rim%' },
  { key: 'lpFgm', label: 'LPFG' },
  { key: 'lpFga', label: 'LPA', dim: true },
  { key: 'lpFgPct', label: 'LP%' },
  { key: 'mrFgm', label: 'MidFG' },
  { key: 'mrFga', label: 'MidA', dim: true },
  { key: 'mrFgPct', label: 'Mid%' },
  { key: 'slTpm', label: '3P' },
  { key: 'slTpa', label: '3PA', dim: true },
  { key: 'slTpPct', label: '3P%' },
  { key: 'pip', label: 'PIP' },
  { key: 'dunks', label: 'DUNK' },
  { key: 'techs', label: 'TECH', dim: true },
  { key: 'ba', label: 'BA', dim: true },
  { key: 'dd', label: 'DD' },
  { key: 'td', label: 'TD' },
  { key: 'qd', label: 'QD', dim: true },
  { key: 'fiveX5', label: '5×5', dim: true },
];

export const PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function getActivePlayerStatsColumns(statType: StatType, fourPointEnabled: boolean): PlayerStatsColumn[] {
  if (statType === 'advanced') return ADV_COLS;
  if (statType === 'shotLocations') return SL_COLS;
  return fourPointEnabled ? BASIC_COLS : BASIC_COLS.filter(col => col.key !== 'fp' && col.key !== 'fpa' && col.key !== 'fpPct');
}

export function getPlayerStatsTypeLabel(statType: StatType): string {
  if (statType === 'perGame') return 'Per Game';
  if (statType === 'per36') return 'Per 36 Min';
  if (statType === 'totals') return 'Totals';
  if (statType === 'shotLocations') return 'Shot Locations & Feats';
  return 'Advanced';
}

export function getPlayerStatsPhaseLabel(phase: Phase, cupShort: string): string {
  if (phase === 'regular') return 'Reg Season';
  if (phase === 'playoffs') return 'Playoffs';
  if (phase === 'cup') return cupShort;
  return 'Combined';
}
