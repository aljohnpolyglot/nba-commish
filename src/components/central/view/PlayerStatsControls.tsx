import React from 'react';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { PER_PAGE_OPTIONS, Phase, SeasonMode, StatType } from './PlayerStatsShared';

interface TeamOption {
  id: number;
  abbrev: string;
}

interface PlayerStatsControlsProps {
  availableSeasons: number[];
  season: SeasonMode;
  setSeason: React.Dispatch<React.SetStateAction<SeasonMode>>;
  prevSeason: () => void;
  nextSeason: () => void;
  sortedTeams: TeamOption[];
  teamFilter: string;
  setTeamFilter: React.Dispatch<React.SetStateAction<string>>;
  prevTeam: () => void;
  nextTeam: () => void;
  statType: StatType;
  setStatType: React.Dispatch<React.SetStateAction<StatType>>;
  phase: Phase;
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
  pbaCompetitionFilter?: string;
  setPbaCompetitionFilter?: React.Dispatch<React.SetStateAction<string>>;
  pbaCompetitionOptions?: Array<{ id: string; label: string }>;
  perPage: number;
  setPerPage: React.Dispatch<React.SetStateAction<number>>;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  handleSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => Promise<void>;
  showFilters: boolean;
  setShowFilters: React.Dispatch<React.SetStateAction<boolean>>;
  brefLoading: boolean;
  euroIsolated: boolean;
  pbaIsolated: boolean;
  cupShort: string;
}

export function PlayerStatsControls({
  availableSeasons,
  season,
  setSeason,
  prevSeason,
  nextSeason,
  sortedTeams,
  teamFilter,
  setTeamFilter,
  prevTeam,
  nextTeam,
  statType,
  setStatType,
  phase,
  setPhase,
  pbaCompetitionFilter,
  setPbaCompetitionFilter,
  pbaCompetitionOptions,
  perPage,
  setPerPage,
  searchTerm,
  setSearchTerm,
  handleSearchKeyDown,
  showFilters,
  setShowFilters,
  brefLoading,
  euroIsolated,
  pbaIsolated,
  cupShort,
}: PlayerStatsControlsProps) {
  const title = pbaIsolated ? 'PBA Player Stats' : 'Player Stats';

  return (
    <div className="shrink-0 px-3 sm:px-4 py-2.5 border-b border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">{title}</h2>
        <div className="relative sm:hidden">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="bg-slate-900 border border-slate-800 text-white rounded pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 w-32"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-0">
          <button onClick={prevTeam} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-white active:text-white bg-slate-900 border border-slate-700 rounded-l transition-colors">
            <ChevronLeft size={12} />
          </button>
          <select
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value)}
            className="h-7 bg-slate-900 border-y border-slate-700 text-white text-xs px-1.5 focus:outline-none focus:border-indigo-500 appearance-none min-w-[80px]"
          >
            <option value="all">All Teams</option>
            {sortedTeams.map(team => (
              <option key={team.id} value={team.abbrev}>
                {team.abbrev}
              </option>
            ))}
          </select>
          <button onClick={nextTeam} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-white active:text-white bg-slate-900 border border-slate-700 rounded-r transition-colors">
            <ChevronRight size={12} />
          </button>
        </div>

        <div className="flex items-center gap-0">
          <button onClick={prevSeason} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-white active:text-white bg-slate-900 border border-slate-700 rounded-l transition-colors">
            <ChevronLeft size={12} />
          </button>
          <select
            value={typeof season === 'number' ? season : season}
            onChange={e => {
              const value = e.target.value;
              setSeason(value === 'career' || value === 'all' ? (value as SeasonMode) : Number(value));
            }}
            className="h-7 bg-slate-900 border-y border-slate-700 text-white text-xs px-1.5 focus:outline-none focus:border-indigo-500 appearance-none min-w-[70px]"
          >
            <option value="career">Career</option>
            <option value="all">All Time</option>
            {availableSeasons.map(value => (
              <option key={value} value={value}>
                {value - 1}–{String(value).slice(2)}
              </option>
            ))}
          </select>
          <button onClick={nextSeason} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-white active:text-white bg-slate-900 border border-slate-700 rounded-r transition-colors">
            <ChevronRight size={12} />
          </button>
        </div>

        <select
          value={statType}
          onChange={e => setStatType(e.target.value as StatType)}
          className="h-7 bg-slate-900 border border-slate-700 text-white text-xs px-1.5 rounded focus:outline-none focus:border-indigo-500 appearance-none"
        >
          <option value="perGame">Per Game</option>
          <option value="per36">Per 36</option>
          <option value="totals">Totals</option>
          <option value="advanced">Advanced</option>
          <option value="shotLocations">Shot Locations & Feats</option>
        </select>

        <select
          value={phase}
          onChange={e => setPhase(e.target.value as Phase)}
          className="h-7 bg-slate-900 border border-slate-700 text-white text-xs px-1.5 rounded focus:outline-none focus:border-indigo-500 appearance-none"
        >
          <option value="regular">Regular Season</option>
          <option value="playoffs">Playoffs</option>
          <option value="combined">Combined</option>
          {!euroIsolated && !pbaIsolated && <option value="cup">{cupShort}</option>}
        </select>

        {pbaIsolated && pbaCompetitionFilter && setPbaCompetitionFilter && pbaCompetitionOptions && (
          <select
            value={pbaCompetitionFilter}
            onChange={e => setPbaCompetitionFilter(e.target.value)}
            className="h-7 bg-slate-900 border border-slate-700 text-white text-xs px-1.5 rounded focus:outline-none focus:border-indigo-500 appearance-none"
          >
            {pbaCompetitionOptions.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        )}

        <select
          value={perPage}
          onChange={e => {
            setPerPage(Number(e.target.value));
          }}
          className="h-7 bg-slate-900 border border-slate-700 text-white text-xs px-1.5 rounded focus:outline-none focus:border-indigo-500 appearance-none w-14"
        >
          {PER_PAGE_OPTIONS.map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500 hidden sm:inline">per page</span>

        <div className="relative hidden sm:block ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="bg-slate-900 border border-slate-800 text-white rounded pl-8 pr-8 py-1.5 text-xs focus:outline-none focus:border-indigo-500 w-44 transition-all"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
              <X size={12} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(value => !value)}
          className={`h-7 w-7 flex items-center justify-center rounded border transition-colors ${
            showFilters ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-slate-700 text-slate-500 hover:text-white bg-slate-900'
          }`}
        >
          <SlidersHorizontal size={13} />
        </button>
      </div>

      {brefLoading && (
        <div className="mt-1.5 text-[10px] text-slate-500 animate-pulse">
          Fetching career stats from Basketball Reference...
        </div>
      )}
    </div>
  );
}
