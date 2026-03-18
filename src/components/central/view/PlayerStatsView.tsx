import React, { useState, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer, NBAGMStat } from '../../../types';
import { PlayerBioView } from './PlayerBioView';
import { ArrowUpDown, Search, Filter, X } from 'lucide-react';
import { evaluateFilter } from '../../../utils/filterUtils';

type StatCategory = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'TOV' | 'FG%' | '3P%' | 'FT%' | 'MIN' | 'ORB' | 'DRB' | 'FGM' | 'FGA' | '3PM' | '3PA' | 'FTM' | 'FTA' | 'PF' | 'GP' | 'GS' | 'PM' | 'TS%' | 'eFG%' | 'PER' | 'USG%' | 'ORtg' | 'DRtg' | 'BPM' | 'WS' | 'VORP';

export const PlayerStatsView: React.FC = () => {
  const { state, navigateToTeam } = useGame();
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [sortField, setSortField] = useState<StatCategory>('PTS');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    state.players.forEach(p => {
      p.stats?.forEach(s => {
        if (!s.playoffs) seasons.add(s.season);
      });
    });
    const sorted = Array.from(seasons).sort((a, b) => b - a);
    return sorted;
  }, [state.players]);

  const [season, setSeason] = useState<number>(() => {
    const seasons = new Set<number>();
    state.players.forEach(p => {
      p.stats?.forEach(s => {
        if (!s.playoffs) seasons.add(s.season);
      });
    });
    const sorted = Array.from(seasons).sort((a, b) => b - a);
    return sorted[0] || state.leagueStats.year;
  });

  const leaders = useMemo(() => {
    const playersWithStats = state.players.map(player => {
      const stat = player.stats?.find(s => s.season === season && !s.playoffs);
      return { player, stat };
    }).filter(p => p.stat && p.stat.gp > 0);

    const getVal = (s: NBAGMStat, cat: StatCategory) => {
      const gp = s.gp || 1;
      const trb = s.trb || (s as any).reb || (s.orb || 0) + (s.drb || 0);
      const hasOrbDrb = (s.orb || 0) + (s.drb || 0) > 0;
      
      switch (cat) {
        case 'PTS': return (s.pts || 0) / gp;
        case 'REB': return trb / gp;
        case 'ORB': return (hasOrbDrb ? (s.orb || 0) : trb * 0.22) / gp;
        case 'DRB': return (hasOrbDrb ? (s.drb || 0) : trb * 0.78) / gp;
        case 'AST': return (s.ast || 0) / gp;
        case 'STL': return (s.stl || 0) / gp;
        case 'BLK': return (s.blk || 0) / gp;
        case 'TOV': return (s.tov || 0) / gp;
        case 'PF': return (s.pf || 0) / gp;
        case 'MIN': return (s.min || 0) / gp;
        case 'FGM': return (s.fg || 0) / gp;
        case 'FGA': return (s.fga || 0) / gp;
        case '3PM': return (s.tp || 0) / gp;
        case '3PA': return (s.tpa || 0) / gp;
        case 'FTM': return (s.ft || 0) / gp;
        case 'FTA': return (s.fta || 0) / gp;
        case 'GP': return s.gp || 0;
        case 'GS': return s.gs || 0;
        case 'FG%': return s.fga > 0 ? ((s.fg || 0) / s.fga) * 100 : 0;
        case '3P%': return s.tpa > 0 ? ((s.tp || 0) / s.tpa) * 100 : 0;
        case 'FT%': return s.fta > 0 ? ((s.ft || 0) / s.fta) * 100 : 0;
        case 'PM': return (s.pm || 0) / gp;
        case 'TS%': return s.tsPct || 0;
        case 'eFG%': return s.efgPct || 0;
        case 'PER': return s.per || 0;
        case 'USG%': return s.usgPct || 0;
        case 'ORtg': return s.ortg || 0;
        case 'DRtg': return s.drtg || 0;
        case 'BPM': return s.bpm || 0;
        case 'WS': return s.ws || 0;
        case 'VORP': return s.vorp || 0;
        default: return 0;
      }
    };

    const filtered = playersWithStats.filter(p => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesMain = p.player.name.toLowerCase().includes(term) || 
                            p.player.pos.toLowerCase().includes(term) ||
                            (state.teams.find(t => t.id === p.stat?.tid)?.abbrev || 'FA').toLowerCase().includes(term);
        if (!matchesMain) return false;
      }
      
      if (Object.keys(columnFilters).length > 0) {
        for (const [col, filterStr] of Object.entries(columnFilters)) {
          if (!filterStr) continue;
          
          let val: string | number = '';
          if (col === 'Player') val = p.player.name;
          else if (col === 'Pos') val = p.player.pos;
          else if (col === 'Team') val = state.teams.find(t => t.id === p.stat?.tid)?.abbrev || 'FA';
          else val = getVal(p.stat!, col as StatCategory);
          
          if (!evaluateFilter(String(val), String(filterStr))) return false;
        }
      }
      
      return true;
    });

    return filtered.sort((a, b) => {
      const valA = getVal(a.stat!, sortField);
      const valB = getVal(b.stat!, sortField);
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    }).slice(0, 50);
  }, [state.players, season, sortField, sortOrder, searchTerm, columnFilters, state.teams]);

  const handleSort = (field: StatCategory) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const renderSortIcon = (field: StatCategory) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="opacity-30" />;
    return <ArrowUpDown size={12} className={`text-indigo-400 ${sortOrder === 'asc' ? 'rotate-180' : ''} transition-transform`} />;
  };

  const handleColumnFilterChange = (col: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [col]: value }));
  };

  const clearFilters = () => {
    setColumnFilters({});
    setSearchTerm('');
  };

  const activeFilterCount = Object.values(columnFilters).filter(v => v).length + (searchTerm ? 1 : 0);

  const renderFilterInput = (col: string) => {
    if (!showFilters) return null;
    return (
      <div className="mt-2 px-2">
        <input 
          type="text" 
          value={columnFilters[col] || ''}
          onChange={(e) => handleColumnFilterChange(col, e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 touch-manipulation"
          placeholder="Filter..."
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  };

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 shrink-0">
          <div className="mb-4">
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">Player Stats</h2>
            <p className="text-slate-400 text-xs sm:text-sm">Official NBA Statistical Leaders</p>
          </div>
          
          {/* Controls */}
          <div className="space-y-3">
            {/* Search Bar - Full Width on Mobile */}
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text"
                placeholder="Search players, teams, positions..."
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

            {/* Season Selector - Full Width on Mobile */}
            <select 
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 touch-manipulation"
            >
              {availableSeasons.map(s => (
                <option key={s} value={s}>{(s - 1)}-{String(s).slice(2)} Season</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[1000px]">
                <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
                  <tr>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 font-semibold sticky left-0 bg-slate-900 z-10">#</th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 font-semibold sticky left-[48px] sm:left-[60px] bg-slate-900 z-10">
                      Player
                      {renderFilterInput('Player')}
                    </th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 font-semibold">
                      Pos
                      {renderFilterInput('Pos')}
                    </th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 font-semibold">
                      Team
                      {renderFilterInput('Team')}
                    </th>
                    <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('GP')}>
                      <div className="flex items-center justify-end gap-1">GP {renderSortIcon('GP')}</div>
                      {renderFilterInput('GP')}
                    </th>
                    
                    {!showAdvanced ? (
                      <>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('GS')}>
                          <div className="flex items-center justify-end gap-1">GS {renderSortIcon('GS')}</div>
                          {renderFilterInput('GS')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('MIN')}>
                          <div className="flex items-center justify-end gap-1">MIN {renderSortIcon('MIN')}</div>
                          {renderFilterInput('MIN')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('PTS')}>
                          <div className="flex items-center justify-end gap-1">PTS {renderSortIcon('PTS')}</div>
                          {renderFilterInput('PTS')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('FGM')}>
                          <div className="flex items-center justify-end gap-1">FGM {renderSortIcon('FGM')}</div>
                          {renderFilterInput('FGM')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('FGA')}>
                          <div className="flex items-center justify-end gap-1">FGA {renderSortIcon('FGA')}</div>
                          {renderFilterInput('FGA')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('FG%')}>
                          <div className="flex items-center justify-end gap-1">FG% {renderSortIcon('FG%')}</div>
                          {renderFilterInput('FG%')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('3PM')}>
                          <div className="flex items-center justify-end gap-1">3PM {renderSortIcon('3PM')}</div>
                          {renderFilterInput('3PM')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('3PA')}>
                          <div className="flex items-center justify-end gap-1">3PA {renderSortIcon('3PA')}</div>
                          {renderFilterInput('3PA')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('3P%')}>
                          <div className="flex items-center justify-end gap-1">3P% {renderSortIcon('3P%')}</div>
                          {renderFilterInput('3P%')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('FTM')}>
                          <div className="flex items-center justify-end gap-1">FTM {renderSortIcon('FTM')}</div>
                          {renderFilterInput('FTM')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('FTA')}>
                          <div className="flex items-center justify-end gap-1">FTA {renderSortIcon('FTA')}</div>
                          {renderFilterInput('FTA')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('FT%')}>
                          <div className="flex items-center justify-end gap-1">FT% {renderSortIcon('FT%')}</div>
                          {renderFilterInput('FT%')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('ORB')}>
                          <div className="flex items-center justify-end gap-1">ORB {renderSortIcon('ORB')}</div>
                          {renderFilterInput('ORB')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('DRB')}>
                          <div className="flex items-center justify-end gap-1">DRB {renderSortIcon('DRB')}</div>
                          {renderFilterInput('DRB')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('REB')}>
                          <div className="flex items-center justify-end gap-1">REB {renderSortIcon('REB')}</div>
                          {renderFilterInput('REB')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('AST')}>
                          <div className="flex items-center justify-end gap-1">AST {renderSortIcon('AST')}</div>
                          {renderFilterInput('AST')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('STL')}>
                          <div className="flex items-center justify-end gap-1">STL {renderSortIcon('STL')}</div>
                          {renderFilterInput('STL')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('BLK')}>
                          <div className="flex items-center justify-end gap-1">BLK {renderSortIcon('BLK')}</div>
                          {renderFilterInput('BLK')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('TOV')}>
                          <div className="flex items-center justify-end gap-1">TOV {renderSortIcon('TOV')}</div>
                          {renderFilterInput('TOV')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('PF')}>
                          <div className="flex items-center justify-end gap-1">PF {renderSortIcon('PF')}</div>
                          {renderFilterInput('PF')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('PM')}>
                          <div className="flex items-center justify-end gap-1">+/- {renderSortIcon('PM')}</div>
                          {renderFilterInput('PM')}
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('MIN')}>
                          <div className="flex items-center justify-end gap-1">MIN {renderSortIcon('MIN')}</div>
                          {renderFilterInput('MIN')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('PER')}>
                          <div className="flex items-center justify-end gap-1">PER {renderSortIcon('PER')}</div>
                          {renderFilterInput('PER')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('TS%')}>
                          <div className="flex items-center justify-end gap-1">TS% {renderSortIcon('TS%')}</div>
                          {renderFilterInput('TS%')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('eFG%')}>
                          <div className="flex items-center justify-end gap-1">eFG% {renderSortIcon('eFG%')}</div>
                          {renderFilterInput('eFG%')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('USG%')}>
                          <div className="flex items-center justify-end gap-1">USG% {renderSortIcon('USG%')}</div>
                          {renderFilterInput('USG%')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('ORtg')}>
                          <div className="flex items-center justify-end gap-1">ORtg {renderSortIcon('ORtg')}</div>
                          {renderFilterInput('ORtg')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('DRtg')}>
                          <div className="flex items-center justify-end gap-1">DRtg {renderSortIcon('DRtg')}</div>
                          {renderFilterInput('DRtg')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('BPM')}>
                          <div className="flex items-center justify-end gap-1">BPM {renderSortIcon('BPM')}</div>
                          {renderFilterInput('BPM')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('WS')}>
                          <div className="flex items-center justify-end gap-1">WS {renderSortIcon('WS')}</div>
                          {renderFilterInput('WS')}
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 font-semibold text-right cursor-pointer hover:text-white active:text-white transition-colors touch-manipulation" onClick={() => handleSort('VORP')}>
                          <div className="flex items-center justify-end gap-1">VORP {renderSortIcon('VORP')}</div>
                          {renderFilterInput('VORP')}
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {leaders.map((item, index) => {
                    const s = item.stat!;
                    const team = state.teams.find(t => t.id === s.tid);
                    const gp = s.gp || 1;
                    
                    return (
                      <tr key={item.player.internalId} className="hover:bg-slate-800/50 active:bg-slate-800/70 transition-colors">
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-slate-500 sticky left-0 bg-slate-900/95 backdrop-blur-sm z-10">{index + 1}</td>
                        <td 
                          className="px-3 sm:px-6 py-3 sm:py-4 font-medium text-indigo-400 cursor-pointer hover:text-indigo-300 active:text-indigo-200 hover:underline sticky left-[48px] sm:left-[60px] bg-slate-900/95 backdrop-blur-sm z-10 touch-manipulation"
                          onClick={() => setViewingPlayer(item.player)}
                        >
                          {item.player.name}
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-slate-400 font-medium">
                          {item.player.pos}
                        </td>
                        <td 
                          className={`px-3 sm:px-6 py-3 sm:py-4 font-medium transition-colors touch-manipulation ${
                            team 
                              ? 'text-indigo-400 cursor-pointer hover:text-indigo-300 active:text-indigo-200 hover:underline' 
                              : 'text-slate-400'
                          }`}
                          onClick={() => team && navigateToTeam(team.id)}
                        >
                          {team?.abbrev || 'FA'}
                        </td>
                        <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{s.gp}</td>
                        
                        {!showAdvanced ? (
                          <>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{s.gs || 0}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{((s.min || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right font-bold text-white">{((s.pts || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{((s.fg || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{((s.fga || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{(s.fga > 0 ? (s.fg / s.fga) * 100 : 0).toFixed(1)}%</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{((s.tp || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{((s.tpa || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{(s.tpa > 0 ? (s.tp / s.tpa) * 100 : 0).toFixed(1)}%</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{((s.ft || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{((s.fta || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">{(s.fta > 0 ? (s.ft / s.fta) * 100 : 0).toFixed(1)}%</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{((s.orb || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{((s.drb || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{(((s.trb || (s as any).reb || (s.orb || 0) + (s.drb || 0))) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{((s.ast || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{((s.stl || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{((s.blk || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-rose-300">{((s.tov || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-slate-400">{((s.pf || 0) / gp).toFixed(1)}</td>
                            <td className={`px-3 sm:px-4 py-3 sm:py-4 text-right font-medium ${((s.pm || 0) / gp) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {((s.pm || 0) / gp) > 0 ? '+' : ''}{((s.pm || 0) / gp).toFixed(1)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-slate-400">{((s.min || 0) / gp).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right font-bold text-white">{(s.per || 0).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{(s.tsPct || 0).toFixed(1)}%</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{(s.efgPct || 0).toFixed(1)}%</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{(s.usgPct || 0).toFixed(1)}%</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{(s.ortg || 0).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{(s.drtg || 0).toFixed(1)}</td>
                            <td className={`px-3 sm:px-4 py-3 sm:py-4 text-right font-medium ${(s.bpm || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {(s.bpm || 0).toFixed(1)}
                            </td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right font-bold text-white">{(s.ws || 0).toFixed(1)}</td>
                            <td className="px-3 sm:px-4 py-3 sm:py-4 text-right text-indigo-300">{(s.vorp || 0).toFixed(1)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {leaders.length === 0 && (
                    <tr>
                      <td colSpan={21} className="px-6 py-8 text-center text-slate-500">
                        No stats available for this season.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerStatsView;