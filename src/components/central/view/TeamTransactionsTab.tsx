import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer, NBATeam } from '../../../types';
import { PlayerBioView } from './PlayerBioView';
import { TradeDetailView } from './TradeDetailView';
import { TeamTransactionsFeed, TransactionsPagination } from './TransactionsFeed';
import { buildDisplayItems, detectType, DisplayItem, EnrichedEntry, findPlayerInText, findTeamInText, getSeasonYear } from './TransactionsShared';
import { SearchField } from './TransactionsShared';

interface TeamTransactionsTabProps {
  team: NBATeam;
}

export const TeamTransactionsTab: React.FC<TeamTransactionsTabProps> = ({ team }) => {
  const { state } = useGame();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(() => state.leagueStats?.year ?? new Date().getFullYear());
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<{ text: string; date: string; legs?: { text: string; date: string }[] } | null>(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  useEffect(() => {
    setSelectedYear(state.leagueStats?.year ?? new Date().getFullYear());
  }, [state.leagueStats?.year]);

  const playerByName = useMemo(() => {
    const map = new Map<string, typeof state.players[0]>();
    state.players.forEach(player => map.set(player.name.toLowerCase(), player));
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
        const text = entry.text || '';
        return {
          ...entry,
          kind: detectType(text, entry.type),
          player: findPlayerInText(text, playerByName),
          team: findTeamInText(text, state.teams),
        };
      })
  ), [playerByName, state.date, state.history, state.teams]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    enrichedHistory.forEach(entry => {
      if (entry.kind === 'League Event') return;
      const text = entry.text || '';
      if (!text.includes(team.name) && !text.includes(team.abbrev)) return;
      const year = getSeasonYear(entry.date || '');
      if (year > 2000) set.add(year);
    });
    return Array.from(set).sort((left, right) => right - left);
  }, [enrichedHistory, team]);

  const filteredHistory = useMemo(() => enrichedHistory.filter(entry => {
    if (entry.kind === 'League Event') return false;
    const text = entry.text || '';
    if (!text.includes(team.name) && !text.includes(team.abbrev)) return false;
    if (selectedYear && getSeasonYear(entry.date || '') !== selectedYear) return false;
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
  }), [enrichedHistory, filterType, searchQuery, selectedYear, team]);

  const displayItems = useMemo<DisplayItem[]>(() => buildDisplayItems(filteredHistory), [filteredHistory]);
  const totalPages = Math.max(1, Math.ceil(displayItems.length / itemsPerPage));
  const visibleItems = displayItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterType, selectedYear, team.id, itemsPerPage]);

  if (selectedTrade) return <TradeDetailView entry={selectedTrade} legs={selectedTrade.legs} onBack={() => setSelectedTrade(null)} />;
  if (viewingPlayer) return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;

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
          <option value="Personnel">Staff / Personnel</option>
          <option value="Trade">Trade</option>
          <option value="Transfer">Transfer (Buyout)</option>
          <option value="Waive">Waive</option>
          <option value="Retirement">Retirement</option>
          <option value="Jersey Retirement">Jersey Retirement</option>
        </select>
        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search…" className="flex-1 min-w-[160px]" />
      </div>

      <TeamTransactionsFeed visibleItems={visibleItems} teams={state.teams} setSelectedTrade={setSelectedTrade} setViewingPlayer={setViewingPlayer} emptyLabel={`No transactions found for ${team.name}`} />
      <TransactionsPagination displayCount={displayItems.length} page={page} totalPages={totalPages} itemsPerPage={itemsPerPage} setItemsPerPage={setItemsPerPage} setPage={setPage} compact />
    </div>
  );
};
