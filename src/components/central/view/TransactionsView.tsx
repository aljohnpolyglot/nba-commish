import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { TradeDetailView } from './TradeDetailView';
import type { TradeSelection } from './TransactionsFeed';
import { LeagueTransactionsFeed, TransactionsPagination } from './TransactionsFeed';
import {
  buildDisplayItems,
  detectType,
  DisplayItem,
  EnrichedEntry,
  EXTERNAL_LEAGUES,
  FilterSelect,
  findPlayerInText,
  findStaffInText,
  findTeamInText,
  getTransactionTeamIds,
  getTransactionStaffCandidates,
  getSeasonYear,
  LeagueFilter,
  normalizePersonnelRoleText,
  SearchField,
  sortTransactionHistoryNewestFirst,
  teamMentionedInTransactionText,
} from './TransactionsShared';
import { getOwnTeamId, normalizeDate } from '../../../utils/helpers';
import { getDomesticPlayerStatus } from '../../../utils/euroLeagueDefaults';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../../utils/uiMode';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { isExternalLeaguePlayer } from '../../../utils/playerLeagueScope';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { getGameDateParts } from '../../../utils/dateUtils';
import { getLeagueCalendar } from '../../../services/leagueCalendar';

const ACTIVE_LEAGUE_FILTER = 'active';

export const TransactionsView: React.FC = () => {
  const { state, navigateToPlayer } = useGame();
  const maxVisibleYear = state.leagueStats?.year ?? new Date().getFullYear();
  const ownTid = getOwnTeamId(state);
  const labels = useLeagueLabels();
  const transactionMonths = useMemo(() => {
    const startMonth = getLeagueCalendar(state.leagueStats).regularSeasonStart.month;
    return Array.from({ length: 12 }, (_, index) => {
      const month = ((startMonth - 1 + index) % 12) + 1;
      return {
        month,
        label: new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
          .format(new Date(Date.UTC(2000, month - 1, 1))),
      };
    });
  }, [state.leagueStats]);
  const isFictional = state.leagueType === 'fictional';
  const allTeams = useMemo(() => {
    if (isFictional) return state.teams ?? [];
    const resolvedNonNBA = ((state as any).nonNBATeams ?? [])
      .map((team: any) => resolveAnyTeam(Number(team?.tid ?? team?.id), state.teams, (state as any).nonNBATeams ?? []))
      .filter((team: any) => team && !(state.teams ?? []).some(nbaTeam => nbaTeam.id === team.id));
    return [...(state.teams ?? []), ...resolvedNonNBA];
  }, [isFictional, state.teams, (state as any).nonNBATeams]);
  const ownTeam = ownTid !== null
    ? (allTeams.find((team: any) => Number(team?.id ?? team?.tid) === ownTid) as any) ?? null
    : null;
  const getDefaultFilterLeague = (): LeagueFilter => {
    if (isPbaIsolatedMode(state)) return 'PBA';
    const domestic = getDomesticPlayerStatus(state as any);
    return isEuroIsolatedMode(state) && domestic && EXTERNAL_LEAGUES.includes(domestic as any) ? domestic as LeagueFilter : ACTIVE_LEAGUE_FILTER;
  };
  const defaultFilterLeague = getDefaultFilterLeague();
  const availableLeagueFilters = useMemo(() => {
    const statuses = new Set<string>(EXTERNAL_LEAGUES);
    for (const team of state.nonNBATeams ?? []) if (team.league) statuses.add(team.league);
    return [...statuses].sort((left, right) => left.localeCompare(right));
  }, [state.nonNBATeams]);

  const [filterLeague, setFilterLeague] = useState<LeagueFilter>(defaultFilterLeague);
  const [filterType, setFilterType] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(() => maxVisibleYear);
  const [selectedTrade, setSelectedTrade] = useState<TradeSelection>(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);
  const lastDefaultLeagueRef = useRef<LeagueFilter>(defaultFilterLeague);

  useEffect(() => {
    setSelectedYear(maxVisibleYear);
  }, [maxVisibleYear]);

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
      const year = getSeasonYear(entry.date || '', state.leagueStats);
      if (year > 0 && year <= maxVisibleYear) set.add(year);
    });
    return Array.from(set).sort((left, right) => right - left);
  }, [maxVisibleYear, state.date, state.history, state.leagueStats]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

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

  const leagueFromTid = (tid: number): LeagueFilter | undefined => {
    if (tid >= 2000 && tid < 3000) return 'PBA';
    if (tid >= 1000 && tid < 2000) return 'Euroleague';
    return undefined;
  };

  const leagueFromTeam = (team: any): LeagueFilter | undefined => {
    if (!team) return undefined;
    const teamId = Number(team.id ?? team.tid);
    if (state.teams.some(activeTeam => activeTeam.id === teamId)) return ACTIVE_LEAGUE_FILTER;
    const explicit = String(team.league ?? '').trim();
    if (EXTERNAL_LEAGUES.includes(explicit as any)) return explicit as LeagueFilter;
    const conference = String(team.conference ?? '').trim();
    if (EXTERNAL_LEAGUES.includes(conference as any)) return conference as LeagueFilter;
    return leagueFromTid(Number(team.id ?? team.tid));
  };

  const teamsInText = (text: string) => {
    return allTeams.filter((team: any) => teamMentionedInTransactionText(text, team));
  };

  const inferEntryLeague = (entry: any, text: string, team: any, player: any): LeagueFilter | undefined => {
    const explicit = String(entry?.league ?? '').trim();
    if (EXTERNAL_LEAGUES.includes(explicit as any)) return explicit as LeagueFilter;
    const tid = Number(entry?.tid);
    const tidLeague = Number.isFinite(tid) ? leagueFromTid(tid) : undefined;
    if (tidLeague) return tidLeague;
    const teamLeague = leagueFromTeam(team);
    if (teamLeague) return teamLeague;
    const playerTeam = player ? resolveAnyTeam(Number(player.tid), state.teams, state.nonNBATeams ?? []) : null;
    const playerLeague = player
      ? leagueFromTeam(playerTeam) ?? leagueFromTid(Number(player.tid)) ?? (EXTERNAL_LEAGUES.includes(String(player.status ?? '') as any) ? String(player.status) as LeagueFilter : undefined)
      : undefined;
    if (playerLeague) return playerLeague;

    const ids = Array.isArray(entry?.playerIds) ? entry.playerIds : [];
    const playerLeagues = new Set<LeagueFilter>();
    ids.forEach((playerId: string) => {
      const row = playerById.get(playerId);
      const rowTeam = row ? resolveAnyTeam(Number(row.tid), state.teams, state.nonNBATeams ?? []) : null;
      const league = row ? leagueFromTeam(rowTeam) ?? leagueFromTid(Number(row.tid)) ?? (EXTERNAL_LEAGUES.includes(String(row.status ?? '') as any) ? String(row.status) as LeagueFilter : undefined) : undefined;
      if (league) playerLeagues.add(league);
    });
    if (playerLeagues.size === 1) return Array.from(playerLeagues)[0];

    const textLeagues = new Set<LeagueFilter>();
    teamsInText(text).forEach(textTeam => {
      const league = leagueFromTeam(textTeam);
      if (league) textLeagues.add(league);
    });
    if (textLeagues.size === 1) return Array.from(textLeagues)[0];
    if (/commissioner's cup|governors' cup|philippine cup/i.test(text)) return 'PBA';
    return undefined;
  };

  const enrichedHistory = useMemo<EnrichedEntry[]>(() => (
    sortTransactionHistoryNewestFirst([...(state.history || [])], state.date)
      .filter(raw => typeof raw === 'string' || normalizeDate((raw as any).date || state.date) <= normalizeDate(state.date))
      .map(raw => {
        const entry = typeof raw === 'string' ? { text: raw, date: state.date, type: 'League Event' } : raw as { text: string; date: string; type?: string };
        const text = normalizePersonnelRoleText(entry.text || '');
        const playerFromId = Array.isArray((entry as any).playerIds)
          ? ((entry as any).playerIds as string[])
            .map(playerId => playerById.get(playerId))
            .find(Boolean) ?? null
          : null;
        const team = Number.isFinite(Number((entry as any).tid))
          ? allTeams.find((candidate: any) => Number(candidate?.id ?? candidate?.tid) === Number((entry as any).tid)) ?? null
          : null;
        const structuredTeam = allTeams.find((candidate: any) =>
          getTransactionTeamIds(entry as any).includes(Number(candidate?.id ?? candidate?.tid)),
        ) ?? null;
        const textTeams = teamsInText(text);
        const resolvedTeam = team ?? structuredTeam ?? textTeams[0] ?? null;
        const resolvedPlayer = playerFromId ?? findPlayerInText(text, playerByName);
        const resolvedStaff = detectType(text, entry.type) === 'Personnel'
          ? findStaffInText(text, [
              ...((resolvedTeam as any)?.tycoon?.staffMembers ?? []),
              ...staffCandidates,
            ])
          : null;
        return {
          ...entry,
          text,
          kind: detectType(text, entry.type),
          league: inferEntryLeague(entry, text, resolvedTeam, resolvedPlayer),
          team: resolvedTeam ?? findTeamInText(text, allTeams as any),
          player: resolvedPlayer,
          playerIdentityMatch: playerFromId ? 'id' : resolvedPlayer ? 'name' : undefined,
          staff: resolvedStaff,
        };
      })
  ), [allTeams, playerById, playerByName, staffCandidates, state.date, state.history]);

  const availableTeamsForFilter = useMemo(() => {
    if (filterLeague === 'all') return allTeams;
    return allTeams.filter((team: any) => {
      const teamId = Number(team?.id ?? team?.tid ?? -1);
      const teamLeague = String(team?.league ?? team?.conference ?? '');
      if (filterLeague === ACTIVE_LEAGUE_FILTER) return state.teams.some(activeTeam => activeTeam.id === teamId);
      return teamLeague === filterLeague;
    });
  }, [allTeams, filterLeague, state.teams]);

  const filteredHistory = useMemo(() => enrichedHistory.filter(entry => {
    if (entry.kind === 'League Event') return false;
    if (isFictional && entry.player && isExternalLeaguePlayer(entry.player)) return false;
    const text = entry.text || '';
    const looksLikePbaConferenceMove = /commissioner's cup|governors' cup|philippine cup/i.test(text);
    if (selectedYear && getSeasonYear(entry.date || '', state.leagueStats) !== selectedYear) return false;
    if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    const entryLeague = (entry as any).league as string | undefined;
    if (filterLeague === ACTIVE_LEAGUE_FILTER) {
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
        const structuredTeamIds = getTransactionTeamIds(entry as any);
        if (
          entryTeamId !== selectedTeamId &&
          !structuredTeamIds.includes(selectedTeamId) &&
          !text.toLowerCase().includes(String(team.name ?? '').toLowerCase()) &&
          !text.toLowerCase().includes(String(team.abbrev ?? '').toLowerCase())
        ) return false;
      }
    }

    if (filterMonth) {
      const selectedMonth = Number(filterMonth);
      if (getGameDateParts(entry.date || '').month !== selectedMonth) return false;
    }

    return true;
  }), [allTeams, enrichedHistory, filterLeague, filterMonth, filterTeam, filterType, isFictional, searchQuery, selectedYear, state.leagueStats]);

  const displayItems = useMemo<DisplayItem[]>(() => buildDisplayItems(filteredHistory), [filteredHistory]);
  const totalPages = Math.max(1, Math.ceil(displayItems.length / itemsPerPage));
  const visibleItems = displayItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const emptyLabel = filterLeague !== ACTIVE_LEAGUE_FILTER && filterLeague !== 'all'
    ? `No ${filterLeague} player movement has been recorded for ${selectedYear}.`
    : undefined;

  useEffect(() => {
    setPage(1);
  }, [filterLeague, filterType, filterTeam, filterMonth, searchQuery, selectedYear, itemsPerPage]);

  if (selectedTrade) return <TradeDetailView entry={selectedTrade} legs={selectedTrade.legs} onBack={() => setSelectedTrade(null)} />;

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
              <option value={ACTIVE_LEAGUE_FILTER}>{labels.leagueName}</option>
              {!isFictional && <>
                <option value="all">All Leagues</option>
                {availableLeagueFilters
                  .filter(league => league !== labels.leagueName)
                  .map(league => <option key={league} value={league}>{league}</option>)}
              </>}
            </FilterSelect>
            <FilterSelect label="Transaction Type" value={filterType} onChange={setFilterType}>
              <option value="">All Transactions</option>
              <option value="Draft">Draft</option>
              <option value="Signing">Signing / Extension</option>
              <option value="Contract Option">Contract Option</option>
              <option value="Personnel">Staff / Personnel</option>
              <option value="Trade">Trade</option>
              <option value="Transfer">Transfer (Buyout)</option>
              <option value="Waive">Waive</option>
              <option value="AwardOnWaivers">Claimed off Waivers</option>
              <option value="Retirement">Retirement</option>
              <option value="Jersey Retirement">Jersey Retirement</option>
              {!isFictional && <option value="G-League Assignment">G-League Assignment</option>}
              {!isFictional && <option value="G-League Callup">G-League Callup</option>}
              <option value="Training Camp Release">Training Camp Release</option>
            </FilterSelect>
            {availableTeamsForFilter.length > 0 && (
              <FilterSelect label="Team" value={filterTeam} onChange={setFilterTeam}>
                <option value="">All Teams</option>
                {[...availableTeamsForFilter].sort((left, right) => left.name.localeCompare(right.name)).map((team: any) => (
                  <option key={team.id} value={team.id}>{getTeamFullName(team)}</option>
                ))}
              </FilterSelect>
            )}
            <FilterSelect label="Month" value={filterMonth} onChange={setFilterMonth}>
              <option value="">All Months</option>
              {transactionMonths.map(({ month, label }) => (
                <option key={month} value={month}>{label}</option>
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
        <LeagueTransactionsFeed visibleItems={visibleItems} teams={allTeams as any} ownTid={ownTid} ownTeam={ownTeam as any} setSelectedTrade={setSelectedTrade} onViewPlayer={navigateToPlayer} emptyLabel={emptyLabel} />
      </div>

      <TransactionsPagination displayCount={displayItems.length} page={page} totalPages={totalPages} itemsPerPage={itemsPerPage} setItemsPerPage={setItemsPerPage} setPage={setPage} />
    </div>
  );
};
