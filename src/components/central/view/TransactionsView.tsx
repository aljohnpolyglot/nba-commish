import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer } from '../../../types';
import { PlayerBioView } from './PlayerBioView';
import { TradeDetailView } from './TradeDetailView';
import { LeagueTransactionsFeed, TransactionsPagination } from './TransactionsFeed';
import {
  buildDisplayItems,
  detectType,
  DisplayItem,
  EnrichedEntry,
  EXTERNAL_LEAGUES,
  FilterSelect,
  findPlayerInText,
  findTeamInText,
  getSeasonYear,
  LeagueFilter,
  normalizePersonnelRoleText,
  SearchField,
} from './TransactionsShared';
import { getOwnTeamId } from '../../../utils/helpers';
import { getDomesticPlayerStatus } from '../../../utils/euroLeagueDefaults';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../../utils/uiMode';
import { resolveAnyTeam } from '../../../utils/teamLookup';

export const TransactionsView: React.FC = () => {
  const { state } = useGame();
  const ownTid = getOwnTeamId(state);
  const allTeams = useMemo(() => {
    const resolvedNonNBA = ((state as any).nonNBATeams ?? [])
      .map((team: any) => resolveAnyTeam(Number(team?.tid ?? team?.id), state.teams, (state as any).nonNBATeams ?? []))
      .filter((team: any) => team && !(state.teams ?? []).some(nbaTeam => nbaTeam.id === team.id));
    return [...(state.teams ?? []), ...resolvedNonNBA];
  }, [state.teams, (state as any).nonNBATeams]);
  const ownTeam = ownTid !== null
    ? (allTeams.find((team: any) => Number(team?.id ?? team?.tid) === ownTid) as any) ?? null
    : null;
  const getDefaultFilterLeague = (): LeagueFilter => {
    if (isPbaIsolatedMode(state)) return 'PBA';
    const domestic = getDomesticPlayerStatus(state as any);
    return isEuroIsolatedMode(state) && domestic && EXTERNAL_LEAGUES.includes(domestic as any) ? domestic as LeagueFilter : 'nba';
  };
  const defaultFilterLeague = getDefaultFilterLeague();

  const [filterLeague, setFilterLeague] = useState<LeagueFilter>(defaultFilterLeague);
  const [filterType, setFilterType] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(() => state.leagueStats?.year ?? new Date().getFullYear());
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<{ text: string; date: string; legs?: { text: string; date: string }[] } | null>(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);
  const lastDefaultLeagueRef = useRef<LeagueFilter>(defaultFilterLeague);

  useEffect(() => {
    setSelectedYear(state.leagueStats?.year ?? new Date().getFullYear());
  }, [state.leagueStats?.year]);

  useEffect(() => {
    setFilterLeague(previous => previous === lastDefaultLeagueRef.current ? defaultFilterLeague : previous);
    lastDefaultLeagueRef.current = defaultFilterLeague;
  }, [defaultFilterLeague]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    (state.history || []).forEach(raw => {
      const entry = typeof raw === 'string' ? { text: raw, date: state.date } : raw as any;
      const kind = detectType(entry.text || '', entry.type);
      if (kind === 'League Event') return;
      const year = getSeasonYear(entry.date || '');
      if (year > 2000) set.add(year);
    });
    return Array.from(set).sort((left, right) => right - left);
  }, [state.date, state.history]);

  const playerByName = useMemo(() => {
    const map = new Map<string, typeof state.players[0]>();
    state.players.forEach(player => map.set(player.name.toLowerCase(), player));
    return map;
  }, [state.players]);
  const playerById = useMemo(() => {
    const map = new Map<string, typeof state.players[0]>();
    state.players.forEach(player => map.set(player.internalId, player));
    return map;
  }, [state.players]);

  const enrichedHistory = useMemo<EnrichedEntry[]>(() => (
    [...(state.history || [])]
      .sort((left, right) => {
        const leftDate = typeof left === 'string' ? state.date : (left as any).date || state.date;
        const rightDate = typeof right === 'string' ? state.date : (right as any).date || state.date;
        return new Date(rightDate).getTime() - new Date(leftDate).getTime();
      })
      .map(raw => {
        const entry = typeof raw === 'string' ? { text: raw, date: state.date, type: 'League Event' } : raw as { text: string; date: string; type?: string };
        const text = normalizePersonnelRoleText(entry.text || '');
        const player = Array.isArray((entry as any).playerIds)
          ? ((entry as any).playerIds as string[])
            .map(playerId => playerById.get(playerId))
            .find(Boolean) ?? null
          : null;
        const team = Number.isFinite(Number((entry as any).tid))
          ? allTeams.find((candidate: any) => Number(candidate?.id ?? candidate?.tid) === Number((entry as any).tid)) ?? null
          : null;
        return {
          ...entry,
          text,
          kind: detectType(text, entry.type),
          league: (entry as any).league ?? (team as any)?.league,
          team: team ?? findTeamInText(text, allTeams as any),
          player: player ?? findPlayerInText(text, playerByName),
        };
      })
  ), [allTeams, playerById, playerByName, state.date, state.history]);

  const availableTeamsForFilter = useMemo(() => {
    if (filterLeague === 'all') return allTeams;
    return allTeams.filter((team: any) => {
      const teamId = Number(team?.id ?? team?.tid ?? -1);
      const teamLeague = String(team?.league ?? team?.conference ?? '');
      if (filterLeague === 'nba') return teamId >= 0 && teamId < 100;
      return teamLeague === filterLeague;
    });
  }, [allTeams, filterLeague]);

  const filteredHistory = useMemo(() => enrichedHistory.filter(entry => {
    if (entry.kind === 'League Event') return false;
    const text = entry.text || '';
    const looksLikePbaConferenceMove = /commissioner's cup|governors' cup|philippine cup/i.test(text);
    if (selectedYear && getSeasonYear(entry.date || '') !== selectedYear) return false;
    if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    const entryLeague = (entry as any).league as string | undefined;
    if (filterLeague === 'nba') {
      if (entryLeague && EXTERNAL_LEAGUES.includes(entryLeague as any)) return false;
      if (!entryLeague && (EXTERNAL_LEAGUES.some(league => text.includes(league)) || looksLikePbaConferenceMove)) return false;
    } else if (filterLeague !== 'all') {
      if (entryLeague) {
        if (entryLeague !== filterLeague) return false;
      } else if (filterLeague === 'PBA') {
        if (!looksLikePbaConferenceMove && !text.includes(filterLeague)) return false;
      } else if (!text.includes(filterLeague)) {
        return false;
      }
    }

    if (filterType) {
      const lowered = text.toLowerCase();
      if (filterType === 'AwardOnWaivers') { if (!lowered.includes('claimed off waivers')) return false; }
      else if (filterType === 'Signing') { if (entry.kind !== 'Signing' && entry.kind !== 'Re-signing') return false; }
      else if (filterType === 'Trade') { if (entry.kind !== 'Trade') return false; }
      else if (filterType === 'Waive') { if (entry.kind !== 'Waive') return false; }
      else if (filterType === 'Retirement') { if (entry.kind !== 'Retirement') return false; }
      else if (filterType === 'Jersey Retirement') { if (entry.kind !== 'Jersey Retirement') return false; }
      else if (entry.kind !== filterType) return false;
    }

    if (filterTeam) {
      const selectedTeamId = parseInt(filterTeam, 10);
      const team = allTeams.find((entryTeam: any) => Number(entryTeam?.id ?? entryTeam?.tid) === selectedTeamId) as any;
      if (team) {
        const entryTeamId = Number((entry.team as any)?.id ?? (entry.team as any)?.tid ?? NaN);
        if (
          entryTeamId !== selectedTeamId &&
          !text.toLowerCase().includes(String(team.name ?? '').toLowerCase()) &&
          !text.toLowerCase().includes(String(team.abbrev ?? '').toLowerCase())
        ) return false;
      }
    }

    if (filterMonth) {
      const months = ['October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September'];
      const selectedMonth = months[parseInt(filterMonth, 10) - 1];
      if (selectedMonth && !entry.date?.includes(selectedMonth.substring(0, 3))) return false;
    }

    return true;
  }), [allTeams, enrichedHistory, filterLeague, filterMonth, filterTeam, filterType, searchQuery, selectedYear]);

  const displayItems = useMemo<DisplayItem[]>(() => buildDisplayItems(filteredHistory), [filteredHistory]);
  const totalPages = Math.max(1, Math.ceil(displayItems.length / itemsPerPage));
  const visibleItems = displayItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setPage(1);
  }, [filterLeague, filterType, filterTeam, filterMonth, searchQuery, selectedYear, itemsPerPage]);

  if (selectedTrade) return <TradeDetailView entry={selectedTrade} legs={selectedTrade.legs} onBack={() => setSelectedTrade(null)} />;
  if (viewingPlayer) return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      <div className="p-4 sm:p-8 border-b border-slate-800 bg-slate-900/50">
        <div className="flex flex-col gap-3 sm:gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-xl sm:text-3xl font-bold text-white flex items-center gap-2 sm:gap-3">
                <ArrowRightLeft className="text-indigo-500" size={24} />
                League Transactions
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-0.5 sm:mt-1">
                Official record of all player movements, trades, and league-wide personnel changes.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {availableYears.length > 0 && (
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5">
                  <button onClick={() => { const index = availableYears.indexOf(selectedYear); if (index < availableYears.length - 1) setSelectedYear(availableYears[index + 1]); }} disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
                  <span className="text-xs font-black text-white px-1 min-w-[40px] text-center">{selectedYear}</span>
                  <button onClick={() => { const index = availableYears.indexOf(selectedYear); if (index > 0) setSelectedYear(availableYears[index - 1]); }} disabled={availableYears.indexOf(selectedYear) === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
                </div>
              )}
              <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search transactions..." className="w-full sm:w-64" />
            </div>
          </div>

          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-x-visible">
            <FilterSelect label="League" value={filterLeague} onChange={value => { setFilterLeague(value as LeagueFilter); setFilterTeam(''); }}>
              <option value="nba">NBA</option>
              <option value="all">All Leagues</option>
              <option value="Euroleague">Euroleague</option>
              <option value="G-League">G-League</option>
              <option value="PBA">PBA</option>
              <option value="B-League">B-League</option>
              <option value="Endesa">Endesa</option>
              <option value="China CBA">China CBA</option>
              <option value="NBL Australia">NBL Australia</option>
            </FilterSelect>
            <FilterSelect label="Transaction Type" value={filterType} onChange={setFilterType}>
              <option value="">All Transactions</option>
              <option value="Draft">Draft</option>
              <option value="Signing">Signing / Extension</option>
              <option value="Personnel">Staff / Personnel</option>
              <option value="Trade">Trade</option>
              <option value="Transfer">Transfer (Buyout)</option>
              <option value="Waive">Waive</option>
              <option value="AwardOnWaivers">Claimed off Waivers</option>
              <option value="Retirement">Retirement</option>
              <option value="Jersey Retirement">Jersey Retirement</option>
              <option value="G-League Assignment">G-League Assignment</option>
              <option value="G-League Callup">G-League Callup</option>
              <option value="Training Camp Release">Training Camp Release</option>
            </FilterSelect>
            {availableTeamsForFilter.length > 0 && (
              <FilterSelect label="Team" value={filterTeam} onChange={setFilterTeam}>
                <option value="">All Teams</option>
                {[...availableTeamsForFilter].sort((left, right) => left.name.localeCompare(right.name)).map((team: any) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </FilterSelect>
            )}
            <FilterSelect label="Month" value={filterMonth} onChange={setFilterMonth}>
              <option value="">All Months</option>
              {['October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September'].map((month, index) => (
                <option key={month} value={index + 1}>{month}</option>
              ))}
            </FilterSelect>
            {(filterLeague !== defaultFilterLeague || filterType || filterTeam || filterMonth || searchQuery) && (
              <button onClick={() => { setFilterLeague(defaultFilterLeague); setFilterType(''); setFilterTeam(''); setFilterMonth(''); setSearchQuery(''); }} className="mt-5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors shrink-0 whitespace-nowrap pr-4 sm:pr-0">
                Clear all filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-8 custom-scrollbar">
        <LeagueTransactionsFeed visibleItems={visibleItems} teams={allTeams as any} ownTid={ownTid} ownTeam={ownTeam as any} setSelectedTrade={setSelectedTrade} setViewingPlayer={setViewingPlayer} />
      </div>

      <TransactionsPagination displayCount={displayItems.length} page={page} totalPages={totalPages} itemsPerPage={itemsPerPage} setItemsPerPage={setItemsPerPage} setPage={setPage} />
    </div>
  );
};
