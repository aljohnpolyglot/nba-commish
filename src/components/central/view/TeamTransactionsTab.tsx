import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { NBATeam } from '../../../types';
import { TradeDetailView } from './TradeDetailView';
import { TeamTransactionsFeed, TransactionsPagination, type TradeSelection } from './TransactionsFeed';
import { buildDisplayItems, detectType, DisplayItem, EnrichedEntry, findPlayerInText, findStaffInText, findTeamInText, getSeasonYear, getTransactionStaffCandidates, getTransactionTeamIds, sortTransactionHistoryNewestFirst } from './TransactionsShared';
import { SearchField } from './TransactionsShared';
import { normalizeDate } from '../../../utils/helpers';

interface TeamTransactionsTabProps {
  team: NBATeam;
  selectedSeason?: number;
}

export const TeamTransactionsTab: React.FC<TeamTransactionsTabProps> = ({ team, selectedSeason }) => {
  const { state, navigateToPlayer } = useGame();
  const maxVisibleYear = state.leagueStats?.year ?? new Date().getFullYear();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(() => maxVisibleYear);
  const [selectedTrade, setSelectedTrade] = useState<TradeSelection>(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  useEffect(() => {
    setSelectedYear(maxVisibleYear);
  }, [maxVisibleYear]);

  useEffect(() => {
    if (selectedSeason != null) setSelectedYear(selectedSeason);
  }, [selectedSeason]);

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
  const staffCandidates = useMemo(() => getTransactionStaffCandidates(state), [
    state.nonNBATeams,
    state.staff,
    state.staffFreeAgents,
    state.staffRetirementAnnouncements,
    state.teams,
  ]);

  const enrichedHistory = useMemo<EnrichedEntry[]>(() => (
    sortTransactionHistoryNewestFirst([...(state.history || [])], state.date)
      .filter(raw => typeof raw === 'string' || normalizeDate((raw as any).date || state.date) <= normalizeDate(state.date))
      .map(raw => {
        const entry = typeof raw === 'string' ? { text: raw, date: state.date, type: 'League Event' } : raw as { text: string; date: string; type?: string };
        const text = entry.text || '';
        const kind = detectType(text, entry.type);
        const playerFromId = Array.isArray((entry as any).playerIds)
          ? ((entry as any).playerIds as string[]).map(playerId => playerById.get(playerId)).find(Boolean) ?? null
          : null;
        const resolvedPlayer = playerFromId ?? findPlayerInText(text, playerByName);
        return {
          ...entry,
          kind,
          player: resolvedPlayer,
          playerIdentityMatch: playerFromId ? 'id' : resolvedPlayer ? 'name' : undefined,
          staff: kind === 'Personnel'
            ? findStaffInText(text, [...(team.tycoon?.staffMembers ?? []), ...staffCandidates])
            : null,
          team: getTransactionTeamIds(entry as any).includes(team.id) ? team : findTeamInText(text, state.teams),
        };
      })
  ), [playerById, playerByName, staffCandidates, state.date, state.history, state.teams, team.tycoon?.staffMembers]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    enrichedHistory.forEach(entry => {
      if (entry.kind === 'League Event') return;
      const text = entry.text || '';
      if (!getTransactionTeamIds(entry as any).includes(team.id) && !text.includes(team.name) && !text.includes(team.abbrev)) return;
      const year = getSeasonYear(entry.date || '', state.leagueStats);
      if (year > 0 && year <= maxVisibleYear) set.add(year);
    });
    return Array.from(set).sort((left, right) => right - left);
  }, [enrichedHistory, maxVisibleYear, state.leagueStats, team]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const filteredHistory = useMemo(() => enrichedHistory.filter(entry => {
    if (entry.kind === 'League Event') return false;
    const text = entry.text || '';
    if (!getTransactionTeamIds(entry as any).includes(team.id) && !text.includes(team.name) && !text.includes(team.abbrev)) return false;
    if (selectedYear && getSeasonYear(entry.date || '', state.leagueStats) !== selectedYear) return false;
    if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
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
    return true;
  }), [enrichedHistory, filterType, searchQuery, selectedYear, state.leagueStats, team]);

  const displayItems = useMemo<DisplayItem[]>(() => buildDisplayItems(filteredHistory), [filteredHistory]);
  const totalPages = Math.max(1, Math.ceil(displayItems.length / itemsPerPage));
  const visibleItems = displayItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterType, selectedYear, team.id, itemsPerPage]);

  if (selectedTrade) return <TradeDetailView entry={selectedTrade} legs={selectedTrade.legs} onBack={() => setSelectedTrade(null)} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {availableYears.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5">
            <button onClick={() => { const index = availableYears.indexOf(selectedYear); if (index < availableYears.length - 1) setSelectedYear(availableYears[index + 1]); }} disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
            <span className="text-xs font-black text-white px-1 min-w-[40px] text-center">{selectedYear}</span>
            <button onClick={() => { const index = availableYears.indexOf(selectedYear); if (index > 0) setSelectedYear(availableYears[index - 1]); }} disabled={availableYears.indexOf(selectedYear) === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
          </div>
        )}
        <select value={filterType} onChange={event => setFilterType(event.target.value)} className="appearance-none bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer text-slate-300">
          <option value="">All Types</option>
          <option value="Draft">Draft</option>
          <option value="Signing">Signing</option>
          <option value="Contract Option">Contract Option</option>
          <option value="Personnel">Staff / Personnel</option>
          <option value="Trade">Trade</option>
          <option value="Transfer">Transfer (Buyout)</option>
          <option value="Waive">Waive</option>
          <option value="Retirement">Retirement</option>
          <option value="Jersey Retirement">Jersey Retirement</option>
        </select>
        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search…" className="flex-1 min-w-[160px]" />
      </div>

      <TeamTransactionsFeed visibleItems={visibleItems} teams={state.teams} setSelectedTrade={setSelectedTrade} onViewPlayer={navigateToPlayer} emptyLabel={`No transactions found for ${team.name}`} />
      <TransactionsPagination displayCount={displayItems.length} page={page} totalPages={totalPages} itemsPerPage={itemsPerPage} setItemsPerPage={setItemsPerPage} setPage={setPage} compact />
    </div>
  );
};
