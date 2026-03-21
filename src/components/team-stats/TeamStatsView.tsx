import React, { useMemo, useState } from 'react';
import { useGame } from '../../store/GameContext';
import { Trophy, Users, ArrowUpDown, Search, Filter, X } from 'lucide-react';
import { NBATeam } from '../../types';
import { evaluateFilter } from '../../utils/filterUtils';

interface TeamStatRow {
  team: NBATeam;
  g: number;
  wins: number;
  losses: number;
  winPct: number;
  fgm: number;
  fga: number;
  fgp: number;
  tpm: number;
  tpa: number;
  tpp: number;
  twom: number;
  twoa: number;
  twop: number;
  ftm: number;
  fta: number;
  ftp: number;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  min: number;
  oppg: number;
  diff: number;
  // Advanced
  ortg: number;
  drtg: number;
  nrtg: number;
  tsPct: number;
  efgPct: number;
  astPct: number;
  rebPct: number;
  tovPct: number;
  pace: number;
}

export const TeamStatsView: React.FC = () => {
  const { state, navigateToTeam } = useGame();
  const [sortField, setSortField] = useState<keyof TeamStatRow>('pts');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const teamStats = useMemo(() => {
    const statsMap = new Map<number, TeamStatRow>();

    state.teams.forEach(team => {
      statsMap.set(team.id, {
        team,
        g: 0,
        wins: team.wins,
        losses: team.losses,
        winPct: 0,
        fgm: 0,
        fga: 0,
        fgp: 0,
        tpm: 0,
        tpa: 0,
        tpp: 0,
        twom: 0,
        twoa: 0,
        twop: 0,
        ftm: 0,
        fta: 0,
        ftp: 0,
        orb: 0,
        drb: 0,
        trb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        tov: 0,
        pf: 0,
        pts: 0,
        min: 0,
        oppg: 0,
        diff: 0,
        ortg: 0,
        drtg: 0,
        nrtg: 0,
        tsPct: 0,
        efgPct: 0,
        astPct: 0,
        rebPct: 0,
        tovPct: 0,
        pace: 0,
      });
    });

    state.boxScores.forEach(game => {
      const homeStats = statsMap.get(game.homeTeamId);
      const awayStats = statsMap.get(game.awayTeamId);

      if (homeStats) {
        homeStats.g += 1;
        homeStats.oppg += game.awayScore;
        game.homeStats.forEach(p => {
          homeStats.min += p.min;
          homeStats.fgm += p.fgm;
          homeStats.fga += p.fga;
          homeStats.tpm += p.threePm;
          homeStats.tpa += p.threePa;
          homeStats.ftm += p.ftm;
          homeStats.fta += p.fta;
          homeStats.orb += p.orb || 0;
          homeStats.drb += p.drb || 0;
          homeStats.trb += p.reb;
          homeStats.ast += p.ast;
          homeStats.stl += p.stl;
          homeStats.blk += p.blk;
          homeStats.tov += p.tov;
          homeStats.pts += p.pts;
        });
        // Weave advanced stats from game if available
        if (game.homeTeamStats?.ortg) {
          homeStats.ortg += game.homeTeamStats.ortg;
          homeStats.drtg += game.homeTeamStats.drtg;
        }
      }

      if (awayStats) {
        awayStats.g += 1;
        awayStats.oppg += game.homeScore;
        game.awayStats.forEach(p => {
          awayStats.min += p.min;
          awayStats.fgm += p.fgm;
          awayStats.fga += p.fga;
          awayStats.tpm += p.threePm;
          awayStats.tpa += p.threePa;
          awayStats.ftm += p.ftm;
          awayStats.fta += p.fta;
          awayStats.orb += p.orb || 0;
          awayStats.drb += p.drb || 0;
          awayStats.trb += p.reb;
          awayStats.ast += p.ast;
          awayStats.stl += p.stl;
          awayStats.blk += p.blk;
          awayStats.tov += p.tov;
          awayStats.pts += p.pts;
        });
        // Weave advanced stats from game if available
        if (game.awayTeamStats?.ortg) {
          awayStats.ortg += game.awayTeamStats.ortg;
          awayStats.drtg += game.awayTeamStats.drtg;
        }
      }
    });

    // Calculate per game averages
    const rows: TeamStatRow[] = Array.from(statsMap.values()).map(row => {
      const g = row.g || 1;
      
      const twom = row.fgm - row.tpm;
      const twoa = row.fga - row.tpa;

      const fgp = row.fga > 0 ? row.fgm / row.fga : 0;
      const tpp = row.tpa > 0 ? row.tpm / row.tpa : 0;
      const ftp = row.fta > 0 ? row.ftm / row.fta : 0;
      const tsPct = row.fga + 0.44 * row.fta > 0 ? row.pts / (2 * (row.fga + 0.44 * row.fta)) : 0;
      const efgPct = row.fga > 0 ? (row.fgm + 0.5 * row.tpm) / row.fga : 0;

      // Estimate possessions
      const tmPoss = row.fga - row.orb + row.tov + (0.44 * row.fta);
      // We don't have opp stats directly in the row except oppg (points).
      // But we can approximate oppPoss as tmPoss since they play each other.
      const oppPoss = tmPoss;
      
      const teamMinDuration = row.min / 5;
      const pace = teamMinDuration > 0 ? 48 * (tmPoss / teamMinDuration) : (tmPoss / g);
      const ortg = tmPoss > 0 ? 100 * (row.pts / tmPoss) : 0;
      const drtg = oppPoss > 0 ? 100 * (row.oppg / oppPoss) : 0;

      return {
        ...row,
        winPct: (row.wins + row.losses) > 0 ? row.wins / (row.wins + row.losses) : 0,
        fgm: row.fgm / g,
        fga: row.fga / g,
        fgp,
        tpm: row.tpm / g,
        tpa: row.tpa / g,
        tpp,
        twom: twom / g,
        twoa: twoa / g,
        twop: twoa > 0 ? twom / twoa : 0,
        ftm: row.ftm / g,
        fta: row.fta / g,
        ftp,
        orb: row.orb / g,
        drb: row.drb / g,
        trb: row.trb / g,
        ast: row.ast / g,
        stl: row.stl / g,
        blk: row.blk / g,
        tov: row.tov / g,
        pf: row.pf / g,
        pts: row.pts / g,
        oppg: row.oppg / g,
        diff: (row.pts / g) - (row.oppg / g),
        ortg: ortg,
        drtg: drtg,
        nrtg: ortg - drtg,
        tsPct,
        efgPct,
        pace: pace,
      };
    });

    return rows;
  }, [state.teams, state.boxScores]);

  const sortedStats = useMemo(() => {
    const filtered = teamStats.filter(row => {
      if (searchTerm) {
        if (!row.team.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      }
      
      if (Object.keys(columnFilters).length > 0) {
        for (const [col, filterStr] of Object.entries(columnFilters)) {
          if (!filterStr) continue;
          
          let val: string | number = '';
          if (col === 'team') {
            const teamNameMatch = evaluateFilter(String(row.team.name), String(filterStr));
            const teamAbbrevMatch = evaluateFilter(String(row.team.abbrev), String(filterStr));
            if (!teamNameMatch && !teamAbbrevMatch) return false;
            continue;
          } else {
            val = row[col as keyof TeamStatRow] as string | number;
          }
          
          if (!evaluateFilter(String(val), String(filterStr))) return false;
        }
      }
      
      return true;
    });

    return [...filtered].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'team') {
        valA = a.team.name;
        valB = b.team.name;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [teamStats, sortField, sortOrder, searchTerm, columnFilters]);

  const handleSort = (field: keyof TeamStatRow) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const renderSortIcon = (field: keyof TeamStatRow) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="opacity-30" />;
    return <ArrowUpDown size={12} className={`text-indigo-400 ${sortOrder === 'asc' ? 'rotate-180' : ''} transition-transform`} />;
  };

  const handleColumnFilterChange = (column: string, value: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: value
    }));
  };

  const clearFilters = () => {
    setColumnFilters({});
    setSearchTerm('');
  };

  const activeFilterCount = Object.values(columnFilters).filter(v => v).length + (searchTerm ? 1 : 0);

  const renderFilterInput = (column: string) => {
    if (!showFilters) return null;
    return (
      <input
        type="text"
        value={columnFilters[column] || ''}
        onChange={(e) => handleColumnFilterChange(column, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="mt-2 w-full bg-slate-800 text-white text-xs px-3 py-2 rounded border border-slate-700 focus:outline-none focus:border-indigo-500 touch-manipulation"
        placeholder="Filter..."
      />
    );
  };

  const formatNum = (num: number, isPercent = false) => {
    if (isPercent) {
      return num.toFixed(3).replace(/^0+/, ''); // e.g., .493
    }
    return num.toFixed(1);
  };

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-800 shrink-0">
        <div className="mb-4">
          <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">Team Stats</h2>
          <p className="text-slate-400 text-xs sm:text-sm">Per Game Stats for all teams</p>
        </div>

        {/* Controls */}
        <div className="space-y-3">
          {/* Search Bar - Full Width on Mobile */}
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text"
              placeholder="Search teams..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-all touch-manipulation"
            />
          </div>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap gap-2">
            {/* Filter Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex-1 min-w-[120px] px-4 py-3 rounded-lg border transition-all flex items-center justify-center gap-2 text-sm font-bold touch-manipulation ${
                showFilters 
                  ? 'bg-indigo-600 border-indigo-500 text-white' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white active:bg-slate-800'
              }`}
            >
              <Filter size={16} />
              FILTERS
              {activeFilterCount > 0 && (
                <span className="ml-1 bg-indigo-500 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Clear Filters Button */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="px-4 py-3 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white active:bg-slate-800 transition-all flex items-center gap-2 text-sm font-bold touch-manipulation"
              >
                <X size={16} />
                CLEAR
              </button>
            )}

            {/* Stats Type Toggle */}
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 flex-1 min-w-[200px]">
              <button 
                onClick={() => setShowAdvanced(false)}
                className={`flex-1 px-3 py-2 text-xs sm:text-sm font-bold rounded-md transition-all touch-manipulation ${
                  !showAdvanced 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                    : 'text-slate-500 hover:text-slate-300 active:bg-slate-800'
                }`}
              >
                BASIC
              </button>
              <button 
                onClick={() => setShowAdvanced(true)}
                className={`flex-1 px-3 py-2 text-xs sm:text-sm font-bold rounded-md transition-all touch-manipulation ${
                  showAdvanced 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                    : 'text-slate-500 hover:text-slate-300 active:bg-slate-800'
                }`}
              >
                ADVANCED
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden h-full flex flex-col">
          <div className="overflow-x-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-900 z-10 shadow-md">
                <tr className="border-b border-slate-800">
                  <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Rk</th>
                  <th 
                    className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation"
                    onClick={() => handleSort('team')}
                  >
                    <div className="flex items-center gap-1">Team {renderSortIcon('team')}</div>
                    {renderFilterInput('team')}
                  </th>
                  <th 
                    className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation"
                    onClick={() => handleSort('g')}
                  >
                    <div className="flex items-center gap-1">GP {renderSortIcon('g')}</div>
                    {renderFilterInput('g')}
                  </th>
                  
                  {!showAdvanced ? (
                    <>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('wins')}>
                        <div className="flex items-center gap-1">W {renderSortIcon('wins')}</div>
                        {renderFilterInput('wins')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('losses')}>
                        <div className="flex items-center gap-1">L {renderSortIcon('losses')}</div>
                        {renderFilterInput('losses')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('winPct')}>
                        <div className="flex items-center gap-1">WIN% {renderSortIcon('winPct')}</div>
                        {renderFilterInput('winPct')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('pts')}>
                        <div className="flex items-center gap-1">PTS {renderSortIcon('pts')}</div>
                        {renderFilterInput('pts')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('oppg')}>
                        <div className="flex items-center gap-1">OPPG {renderSortIcon('oppg')}</div>
                        {renderFilterInput('oppg')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('diff')}>
                        <div className="flex items-center gap-1">DIFF {renderSortIcon('diff')}</div>
                        {renderFilterInput('diff')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('fgm')}>
                        <div className="flex items-center gap-1">FG {renderSortIcon('fgm')}</div>
                        {renderFilterInput('fgm')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('fga')}>
                        <div className="flex items-center gap-1">FGA {renderSortIcon('fga')}</div>
                        {renderFilterInput('fga')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('fgp')}>
                        <div className="flex items-center gap-1">FG% {renderSortIcon('fgp')}</div>
                        {renderFilterInput('fgp')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('tpm')}>
                        <div className="flex items-center gap-1">3P {renderSortIcon('tpm')}</div>
                        {renderFilterInput('tpm')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('tpa')}>
                        <div className="flex items-center gap-1">3PA {renderSortIcon('tpa')}</div>
                        {renderFilterInput('tpa')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('tpp')}>
                        <div className="flex items-center gap-1">3P% {renderSortIcon('tpp')}</div>
                        {renderFilterInput('tpp')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('twom')}>
                        <div className="flex items-center gap-1">2P {renderSortIcon('twom')}</div>
                        {renderFilterInput('twom')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('twoa')}>
                        <div className="flex items-center gap-1">2PA {renderSortIcon('twoa')}</div>
                        {renderFilterInput('twoa')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('twop')}>
                        <div className="flex items-center gap-1">2P% {renderSortIcon('twop')}</div>
                        {renderFilterInput('twop')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('ftm')}>
                        <div className="flex items-center gap-1">FT {renderSortIcon('ftm')}</div>
                        {renderFilterInput('ftm')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('fta')}>
                        <div className="flex items-center gap-1">FTA {renderSortIcon('fta')}</div>
                        {renderFilterInput('fta')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('ftp')}>
                        <div className="flex items-center gap-1">FT% {renderSortIcon('ftp')}</div>
                        {renderFilterInput('ftp')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('orb')}>
                        <div className="flex items-center gap-1">ORB {renderSortIcon('orb')}</div>
                        {renderFilterInput('orb')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('drb')}>
                        <div className="flex items-center gap-1">DRB {renderSortIcon('drb')}</div>
                        {renderFilterInput('drb')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('trb')}>
                        <div className="flex items-center gap-1">TRB {renderSortIcon('trb')}</div>
                        {renderFilterInput('trb')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('ast')}>
                        <div className="flex items-center gap-1">AST {renderSortIcon('ast')}</div>
                        {renderFilterInput('ast')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('stl')}>
                        <div className="flex items-center gap-1">STL {renderSortIcon('stl')}</div>
                        {renderFilterInput('stl')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('blk')}>
                        <div className="flex items-center gap-1">BLK {renderSortIcon('blk')}</div>
                        {renderFilterInput('blk')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('tov')}>
                        <div className="flex items-center gap-1">TOV {renderSortIcon('tov')}</div>
                        {renderFilterInput('tov')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('pf')}>
                        <div className="flex items-center gap-1">PF {renderSortIcon('pf')}</div>
                        {renderFilterInput('pf')}
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('ortg')}>
                        <div className="flex items-center gap-1">ORtg {renderSortIcon('ortg')}</div>
                        {renderFilterInput('ortg')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('drtg')}>
                        <div className="flex items-center gap-1">DRtg {renderSortIcon('drtg')}</div>
                        {renderFilterInput('drtg')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('nrtg')}>
                        <div className="flex items-center gap-1">NRtg {renderSortIcon('nrtg')}</div>
                        {renderFilterInput('nrtg')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('pace')}>
                        <div className="flex items-center gap-1">Pace {renderSortIcon('pace')}</div>
                        {renderFilterInput('pace')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('tsPct')}>
                        <div className="flex items-center gap-1">TS% {renderSortIcon('tsPct')}</div>
                        {renderFilterInput('tsPct')}
                      </th>
                      <th className="p-2 sm:p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation" onClick={() => handleSort('efgPct')}>
                        <div className="flex items-center gap-1">eFG% {renderSortIcon('efgPct')}</div>
                        {renderFilterInput('efgPct')}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {sortedStats.map((row, idx) => (
                  <tr key={row.team.id} className="hover:bg-slate-800/30 active:bg-slate-800/50 transition-colors group">
                    <td className="p-2 sm:p-3 text-xs font-bold text-slate-400">{idx + 1}</td>
                    <td className="p-2 sm:p-3">
                      <button 
                        onClick={() => navigateToTeam(row.team.id)}
                        className="flex items-center gap-2 hover:opacity-80 active:opacity-70 transition-opacity text-left touch-manipulation"
                      >
                        {row.team.logoUrl && (
                          <img src={row.team.logoUrl} alt={row.team.name} className="w-5 h-5 object-contain" />
                        )}
                        <span className="text-xs font-bold text-white whitespace-nowrap">{row.team.name}</span>
                      </button>
                    </td>
                    <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{row.g}</td>
                    
                    {!showAdvanced ? (
                      <>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{row.wins}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{row.losses}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-indigo-300">{formatNum(row.winPct, true)}</td>
                        <td className="p-2 sm:p-3 text-xs font-bold text-white">{formatNum(row.pts)}</td>
                        <td className="p-2 sm:p-3 text-xs font-bold text-slate-300">{formatNum(row.oppg)}</td>
                        <td className={`p-2 sm:p-3 text-xs font-bold ${row.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {row.diff > 0 ? '+' : ''}{formatNum(row.diff)}
                        </td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.fgm)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.fga)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-indigo-300">{formatNum(row.fgp, true)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.tpm)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.tpa)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-indigo-300">{formatNum(row.tpp, true)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.twom)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.twoa)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-indigo-300">{formatNum(row.twop, true)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.ftm)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.fta)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-indigo-300">{formatNum(row.ftp, true)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.orb)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.drb)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.trb)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.ast)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.stl)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.blk)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-rose-300">{formatNum(row.tov)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-400">{formatNum(row.pf)}</td>
                      </>
                    ) : (
                      <>
                        <td className="p-2 sm:p-3 text-xs font-bold text-white">{formatNum(row.ortg)}</td>
                        <td className="p-2 sm:p-3 text-xs font-bold text-slate-300">{formatNum(row.drtg)}</td>
                        <td className={`p-2 sm:p-3 text-xs font-bold ${row.nrtg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {row.nrtg > 0 ? '+' : ''}{formatNum(row.nrtg)}
                        </td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-slate-300">{formatNum(row.pace)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-indigo-300">{formatNum(row.tsPct, true)}</td>
                        <td className="p-2 sm:p-3 text-xs font-medium text-indigo-300">{formatNum(row.efgPct, true)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}; 