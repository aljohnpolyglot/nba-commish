import React, { useMemo, useState } from 'react';
import { useGame } from '../../../store/GameContext';
import { ArrowRightLeft, Calendar, Info, Search, Filter, UserCheck, UserX, AlertTriangle, Users, ChevronLeft, ChevronRight, Sunset, TrendingDown, TrendingUp, Trophy, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { NBAPlayer } from '../../../types';
import { PlayerBioView } from './PlayerBioView';
import { TradeDetailView } from './TradeDetailView';
import { getOwnTeamId } from '../../../utils/helpers';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * NBA season year from a date string.
 * Jul–Dec → calYear+1 (offseason & new season belong to the upcoming season)
 * Jan–Jun → calYear   (regular season, playoffs, trade deadline)
 * e.g. "Jul 14, 2026" → 2027 (summer before the 26-27 season starts)
 *      "Oct 1, 2026"  → 2027 (season opener of 26-27)
 *      "Feb 6, 2027"  → 2027 (mid-season)
 *      "Jun 5, 2026"  → 2026 (Finals / end of 25-26 season)
 */
function getSeasonYear(dateStr: string): number {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    const month = d.getMonth() + 1; // 1-indexed
    const calYear = d.getFullYear();
    // Jun 28+ belongs to the NEW season (draft is Jun 26-28, options Jun 29, FA Jul 1+)
    return month >= 7 || (month === 6 && d.getDate() >= 28) ? calYear + 1 : calYear;
  } catch { return 0; }
}

function detectType(text: string, type?: string) {
  const t = text.toLowerCase();
  if (type === 'Training Camp Release' || t.includes('released from training camp')) return 'Training Camp Release';
  if (type === 'G-League Assignment' || t.includes('assigned to g-league'))  return 'G-League Assignment';
  if (type === 'G-League Callup'     || t.includes('recalled from g-league')) return 'G-League Callup';
  if (type === 'Draft'       || t.includes('overall pick of the'))     return 'Draft';
  if (type === 'NG Guaranteed' || (t.includes('guaranteed by') && t.includes('january 10'))) return 'NG Guaranteed';
  if (type === 'Retirement'  || t.includes('has retired') || t.includes('announced his retirement') || t.includes('announced retirement')) return 'Retirement';
  if (type === 'Trade'       || t.includes('trade'))                   return 'Trade';
  if (type === 'Signing'     || t.includes('signed') || t.includes('re-signed') || t.includes('signs with')) return 'Signing';
  if (type === 'Waive'       || t.includes('waived'))                  return 'Waive';
  if (type === 'Suspension'  || t.includes('suspended'))               return 'Suspension';
  if (type === 'Personnel'   || t.includes('fired') || t.includes('hired')) return 'Personnel';
  return 'League Event';
}

const TYPE_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  Draft:                { color: 'text-violet-400',   bg: 'bg-violet-500/10',   icon: <Trophy size={18}/>,         label: 'Draft' },
  Trade:                { color: 'text-blue-400',    bg: 'bg-blue-500/10',     icon: <ArrowRightLeft size={18}/>, label: 'Trade' },
  Signing:              { color: 'text-emerald-400', bg: 'bg-emerald-500/10',  icon: <UserCheck size={18}/>,      label: 'Signing' },
  Waive:                { color: 'text-amber-400',   bg: 'bg-amber-500/10',    icon: <UserX size={18}/>,          label: 'Waiver' },
  Suspension:           { color: 'text-rose-400',    bg: 'bg-rose-500/10',     icon: <AlertTriangle size={18}/>,  label: 'Suspension' },
  Personnel:            { color: 'text-purple-400',  bg: 'bg-purple-500/10',   icon: <Users size={18}/>,          label: 'Personnel' },
  Retirement:           { color: 'text-amber-300',   bg: 'bg-amber-500/10',    icon: <Sunset size={18}/>,         label: 'Retirement' },
  'G-League Assignment':    { color: 'text-orange-400',  bg: 'bg-orange-500/10',   icon: <TrendingDown size={18}/>,   label: 'G-League' },
  'G-League Callup':        { color: 'text-sky-400',     bg: 'bg-sky-500/10',      icon: <TrendingUp size={18}/>,     label: 'Callup' },
  'Training Camp Release':  { color: 'text-amber-400',   bg: 'bg-amber-500/10',    icon: <UserX size={18}/>,          label: 'TC Release' },
  'NG Guaranteed':      { color: 'text-emerald-400', bg: 'bg-emerald-500/10',  icon: <CheckCircle size={18}/>,    label: 'Guaranteed' },
  'League Event':       { color: 'text-slate-400',   bg: 'bg-slate-800',       icon: <Info size={18}/>,           label: 'League Event' },
};

const EXTERNAL_LEAGUES = ['Euroleague', 'G-League', 'PBA', 'B-League', 'Endesa', 'China CBA', 'NBL Australia'] as const;
type LeagueFilter = 'nba' | 'all' | typeof EXTERNAL_LEAGUES[number];

// Module-level display item types shared by TransactionsView and TeamTransactionsTab
type EnrichedEntry = { text: string; date: string; type?: string; kind: string; player: any; team: any; [key: string]: any };
type SingleItem  = { kind: 'single'; entry: EnrichedEntry };
type MultiItem   = { kind: 'multi';  date: string; legs: EnrichedEntry[] };
type DisplayItem = SingleItem | MultiItem;

export const TransactionsView: React.FC = () => {
  const { state } = useGame();
  const ownTid = getOwnTeamId(state);
  const ownTeam = ownTid !== null ? state.teams.find(t => t.id === ownTid) : null;
  const [filterLeague, setFilterLeague] = React.useState<LeagueFilter>('nba');
  const [filterType, setFilterType] = React.useState('');
  const [filterTeam, setFilterTeam] = React.useState('');
  const [filterMonth, setFilterMonth] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedYear, setSelectedYear] = React.useState<number>(() => state.leagueStats?.year ?? 2026);
  // Sync to league year when it advances (e.g. after season rollover) so offseason signings stay visible
  React.useEffect(() => {
    setSelectedYear(state.leagueStats?.year ?? 2026);
  }, [state.leagueStats?.year]);
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<{ text: string; date: string; legs?: { text: string; date: string }[] } | null>(null);

  // Collect all unique season years that have transaction-type entries
  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    (state.history || []).forEach(raw => {
      const entry = typeof raw === 'string' ? { text: raw, date: state.date } : raw as any;
      const kind = detectType(entry.text || '', entry.type);
      if (kind === 'League Event') return;
      const yr = getSeasonYear(entry.date || '');
      if (yr > 2000) yearSet.add(yr);
    });
    return Array.from(yearSet).sort((a, b) => b - a); // newest first
  }, [state.history, state.date]);

  // Pre-build lookup maps
  const teamByName = useMemo(() => {
    const map = new Map<string, typeof state.teams[0]>();
    state.teams.forEach(t => {
      map.set(t.name.toLowerCase(), t);
      map.set(t.abbrev.toLowerCase(), t);
      if ((t as any).city) map.set((t as any).city.toLowerCase(), t);
    });
    return map;
  }, [state.teams]);

  const playerByName = useMemo(() => {
    const map = new Map<string, typeof state.players[0]>();
    state.players.forEach(p => map.set(p.name.toLowerCase(), p));
    return map;
  }, [state.players]);

  // Enrich each entry with team + player refs derived from text
  const enrichedHistory = useMemo(() => {
    return [...(state.history || [])].sort((a, b) => {
      const da = typeof a === 'string' ? state.date : (a as any).date || state.date;
      const db = typeof b === 'string' ? state.date : (b as any).date || state.date;
      return new Date(db).getTime() - new Date(da).getTime();
    }).map(raw => {
      const entry = typeof raw === 'string'
        ? { text: raw, date: state.date, type: 'League Event' }
        : raw as { text: string; date: string; type?: string };

      const text = entry.text || '';
      const kind = detectType(text, entry.type);

      // Find the first team mentioned in the text
      let team: typeof state.teams[0] | null = null;
      for (const t of state.teams) {
        if (text.includes(t.name) || text.includes(t.abbrev)) { team = t; break; }
      }

      // Find the first player mentioned in the text
      let player: typeof state.players[0] | null = null;
      for (const p of state.players) {
        if (text.includes(p.name)) { player = p; break; }
      }

      return { ...entry, kind, team, player };
    });
  }, [state.history, state.date, state.teams, state.players]);

  // Cascade: team options depend on selected league
  const availableTeamsForFilter = React.useMemo(() => {
    if (filterLeague === 'nba') return state.teams;
    if (filterLeague === 'all') return state.teams; // only show NBA teams in team dropdown for 'all'
    // For external leagues, no NBA team filter makes sense — handled by league text filter
    return [];
  }, [filterLeague, state.teams]);

  const filteredHistory = enrichedHistory.filter(entry => {
    // Events view handles League Events — Transactions shows only roster/personnel moves
    if (entry.kind === 'League Event') return false;
    // Year filter
    if (selectedYear && getSeasonYear(entry.date || '') !== selectedYear) return false;
    const text = entry.text || '';
    if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    // League filter
    const entryLeague = (entry as any).league as string | undefined;
    if (filterLeague === 'nba') {
      // Show only entries with no external league tag and mentioning an NBA team
      if (entryLeague && EXTERNAL_LEAGUES.includes(entryLeague as any)) return false;
      if (!entryLeague) {
        // Additional guard: if text contains an external league name, skip
        const hasExtLeague = EXTERNAL_LEAGUES.some(lg => text.includes(lg));
        if (hasExtLeague) return false;
      }
    } else if (filterLeague !== 'all') {
      // External league selected: only show entries for that league
      if (entryLeague) {
        if (entryLeague !== filterLeague) return false;
      } else {
        if (!text.includes(filterLeague)) return false;
      }
    }

    if (filterType) {
      if (filterType === 'AwardOnWaivers') {
        if (!text.toLowerCase().includes('claimed off waivers')) return false;
      } else if (filterType === 'Waive') {
        if (!text.toLowerCase().includes('waived')) return false;
      } else if (filterType === 'Signing') {
        const tl = text.toLowerCase();
        if (!tl.includes('signed') && !tl.includes('re-signed') && !tl.includes('signs with') && !tl.includes('signs overseas')) return false;
      } else if (filterType === 'Trade') {
        if (!text.toLowerCase().includes('trade')) return false;
      } else if (filterType === 'Retirement') {
        if (entry.kind !== 'Retirement') return false;
      } else if (entry.kind !== filterType) {
        return false;
      }
    }

    if (filterTeam && (filterLeague === 'nba' || filterLeague === 'all')) {
      const team = state.teams.find(t => t.id === parseInt(filterTeam));
      if (team && !text.toLowerCase().includes(team.name.toLowerCase()) && !text.toLowerCase().includes(team.abbrev.toLowerCase())) return false;
    }

    if (filterMonth) {
      const months = ['October','November','December','January','February','March','April','May','June','July','August','September'];
      const selectedMonth = months[parseInt(filterMonth) - 1];
      if (selectedMonth && !entry.date?.includes(selectedMonth.substring(0, 3))) return false;
    }

    return true;
  });

  // Group same-date trades that share a player name into multi-team trade blocks
  const displayItems = useMemo((): DisplayItem[] => {
    const result: DisplayItem[] = [];
    const used = new Set<number>();

    for (let i = 0; i < filteredHistory.length; i++) {
      if (used.has(i)) continue;
      const a = filteredHistory[i];

      if (a.kind !== 'Trade') {
        result.push({ kind: 'single', entry: a });
        used.add(i);
        continue;
      }

      // Find other trades on the same date that share a player name with this one
      const textA = a.text || '';
      const group: number[] = [i];
      for (let j = i + 1; j < filteredHistory.length; j++) {
        if (used.has(j)) continue;
        const b = filteredHistory[j];
        if (b.kind !== 'Trade' || b.date !== a.date) continue;
        const textB = b.text || '';
        // Shared player = same player name (≥5 chars) appears in both texts
        const shared = state.players.some(p =>
          p.name.length >= 5 && textA.includes(p.name) && textB.includes(p.name)
        );
        if (shared) group.push(j);
      }

      if (group.length >= 2) {
        group.forEach(idx => used.add(idx));
        result.push({ kind: 'multi', date: a.date, legs: group.map(idx => filteredHistory[idx]) });
      } else {
        used.add(i);
        result.push({ kind: 'single', entry: a });
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredHistory, state.players]);

  if (selectedTrade) {
    return <TradeDetailView entry={selectedTrade} legs={selectedTrade.legs} onBack={() => setSelectedTrade(null)} />;
  }

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Header */}
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
              {/* Year chevron picker */}
              {availableYears.length > 0 && (
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5">
                  <button
                    onClick={() => {
                      const idx = availableYears.indexOf(selectedYear);
                      if (idx < availableYears.length - 1) setSelectedYear(availableYears[idx + 1]);
                    }}
                    disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1}
                    className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs font-black text-white px-1 min-w-[40px] text-center">
                    {selectedYear}
                  </span>
                  <button
                    onClick={() => {
                      const idx = availableYears.indexOf(selectedYear);
                      if (idx > 0) setSelectedYear(availableYears[idx - 1]);
                    }}
                    disabled={availableYears.indexOf(selectedYear) === 0}
                    className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full sm:w-64"
                />
              </div>
            </div>
          </div>

          {/* Filters Row — horizontal scroll on mobile, wrap on desktop */}
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-x-visible">
            <FilterSelect label="League" value={filterLeague} onChange={v => { setFilterLeague(v as LeagueFilter); setFilterTeam(''); }}>
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
              <option value="Trade">Trade</option>
              <option value="Waive">Waive</option>
              <option value="AwardOnWaivers">Claimed off Waivers</option>
              <option value="Retirement">Retirement</option>
              <option value="G-League Assignment">G-League Assignment</option>
              <option value="G-League Callup">G-League Callup</option>
              <option value="Training Camp Release">Training Camp Release</option>
            </FilterSelect>
            {availableTeamsForFilter.length > 0 && (
              <FilterSelect label="Team" value={filterTeam} onChange={setFilterTeam}>
                <option value="">All Teams</option>
                {[...availableTeamsForFilter].sort((a, b) => a.name.localeCompare(b.name)).map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </FilterSelect>
            )}
            <FilterSelect label="Month" value={filterMonth} onChange={setFilterMonth}>
              <option value="">All Months</option>
              {['October','November','December','January','February','March','April','May','June','July','August','September'].map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </FilterSelect>
            {(filterLeague !== 'nba' || filterType || filterTeam || filterMonth || searchQuery) && (
              <button
                onClick={() => { setFilterLeague('nba'); setFilterType(''); setFilterTeam(''); setFilterMonth(''); setSearchQuery(''); }}
                className="mt-5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors shrink-0 whitespace-nowrap pr-4 sm:pr-0"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-4">
          {displayItems.length > 0 ? (
            displayItems.map((item, index) => {
              /* ── Multi-team trade block ── */
              if (item.kind === 'multi') {
                const legTeams = item.legs.flatMap(leg => {
                  const logos: { logo: string; name: string }[] = [];
                  for (const t of state.teams) {
                    if ((leg.text || '').includes(t.name)) logos.push({ logo: (t as any).logoUrl, name: t.name });
                  }
                  return logos;
                });
                // deduplicate by name
                const uniqueTeams = legTeams.filter((t, i, arr) => arr.findIndex(x => x.name === t.name) === i);
                const isOwn = !!ownTeam && item.legs.some(l => (l.text || '').includes(ownTeam.name) || (l.text || '').includes(ownTeam.abbrev));

                return (
                  <motion.div
                    key={`multi-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.5), duration: 0.3 }}
                    className={`relative bg-blue-950/30 border hover:border-blue-600/60 rounded-xl overflow-hidden transition-all ${isOwn ? 'border-indigo-500/60 ring-2 ring-indigo-500/40' : 'border-blue-700/40'}`}
                  >
                    {/* Header — click to open full multi-leg detail */}
                    <div
                      className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-blue-800/30 cursor-pointer hover:bg-blue-900/20 transition-colors"
                      onClick={() => {
                        const [first, ...rest] = item.legs;
                        setSelectedTrade({ text: first.text, date: first.date, legs: rest.map(l => ({ text: l.text, date: l.date })) });
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <ArrowRightLeft size={15} className="text-blue-400" />
                        <span className="text-[11px] font-black uppercase tracking-widest text-blue-300">
                          {item.legs.length + 1}-Team Trade
                        </span>
                        {isOwn && <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">You</span>}
                        <div className="flex items-center gap-1 ml-1">
                          {uniqueTeams.slice(0, 4).map((t, i) => (
                            <img key={i} src={t.logo} alt={t.name} title={t.name}
                              className="w-5 h-5 object-contain opacity-80"
                              referrerPolicy="no-referrer"
                              onError={e => { e.currentTarget.style.display = 'none'; }}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-blue-400/60 font-medium ml-1">View All →</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                        <Calendar size={12} />
                        <span>{item.date}</span>
                      </div>
                    </div>
                    {/* Legs */}
                    <div className="divide-y divide-blue-900/30">
                      {item.legs.map((leg, li) => {
                        const legPlayer = leg.player;
                        const legTeamLogo = (leg.team as any)?.logoUrl;
                        return (
                          <div
                            key={li}
                            className="flex gap-3 px-5 py-3 items-start cursor-pointer hover:bg-blue-900/20 transition-colors"
                            onClick={() => setSelectedTrade({ text: leg.text, date: leg.date })}
                          >
                            <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider mt-0.5 w-10 shrink-0">Leg {li + 1}</span>
                            <p className="flex-1 text-slate-300 text-sm leading-relaxed font-medium">{leg.text}</p>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {legPlayer?.imgURL && (
                                <img src={legPlayer.imgURL} alt={legPlayer.name}
                                  className="w-9 h-9 rounded-full object-cover border border-slate-700 cursor-pointer hover:border-indigo-400 transition-colors"
                                  referrerPolicy="no-referrer"
                                  onError={e => { e.currentTarget.style.display = 'none'; }}
                                  onClick={e => { e.stopPropagation(); legPlayer && setViewingPlayer(legPlayer as NBAPlayer); }}
                                />
                              )}
                              {legTeamLogo && (
                                <img src={legTeamLogo} alt=""
                                  className="w-7 h-7 object-contain opacity-70"
                                  referrerPolicy="no-referrer"
                                  onError={e => { e.currentTarget.style.display = 'none'; }}
                                />
                              )}
                              <span className="text-[10px] text-blue-400/60 font-medium whitespace-nowrap">View →</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              }

              /* ── Single entry ── */
              const entry = item.entry;
              const style = TYPE_STYLE[entry.kind] ?? TYPE_STYLE['League Event'];
              const teamColor = (entry.team as any)?.colors?.[0];
              const teamLogo = (entry.team as any)?.logoUrl || (entry.team as any)?.imgURL;
              const playerImg = entry.player?.imgURL;

              const isTrade = entry.kind === 'Trade';
              const isSigningWithPlayer = !isTrade && !!entry.player;
              const isClickable = isTrade || isSigningWithPlayer;
              const isOwn = ownTid !== null && (
                (entry.team as any)?.id === ownTid ||
                (!!ownTeam && (entry.text || '').includes(ownTeam.name)) ||
                (entry.player as any)?.tid === ownTid
              );
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.5), duration: 0.3 }}
                  className={`group relative bg-slate-900/40 border hover:border-slate-700 rounded-xl overflow-hidden transition-all hover:bg-slate-900/60 ${isOwn ? 'border-indigo-500/60 ring-2 ring-indigo-500/30 bg-indigo-950/20' : 'border-slate-800'} ${isClickable ? 'cursor-pointer' : ''}`}
                  onClick={isClickable ? () => {
                    if (isTrade) setSelectedTrade({ text: entry.text, date: entry.date });
                    else if (entry.player) setViewingPlayer(entry.player as NBAPlayer);
                  } : undefined}
                >
                  {teamColor && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: teamColor }} />
                  )}
                  <div className="flex gap-4 p-5 pl-6">
                    <div className={`mt-1 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${style.bg} ${style.color}`}>
                      {style.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${style.color}`}>{style.label}</span>
                          {isOwn && <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">You</span>}
                          {(entry.text || '').toLowerCase().includes('player option') && (
                            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Player Opt.</span>
                          )}
                          {(entry.text || '').toLowerCase().includes('team option') && (
                            <span className="text-[9px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">Team Opt.</span>
                          )}
                          {isTrade && (
                            <span className="text-[9px] font-medium text-blue-400/70 opacity-0 group-hover:opacity-100 transition-opacity">
                              View Details →
                            </span>
                          )}
                          {isSigningWithPlayer && (
                            <span className="text-[9px] font-medium text-indigo-400/70 opacity-0 group-hover:opacity-100 transition-opacity">
                              View Profile →
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                          <Calendar size={12} />
                          <span>{entry.date}</span>
                        </div>
                      </div>
                      <p className="text-slate-200 leading-relaxed font-medium">
                        {entry.text || `${style.label} transaction recorded.`}
                      </p>
                    </div>
                    {(playerImg || teamLogo) && (
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {playerImg && (
                          <img src={playerImg} alt={entry.player?.name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-slate-700 shrink-0 cursor-pointer hover:border-indigo-400 transition-colors"
                            referrerPolicy="no-referrer"
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                            title={entry.player?.name ? `View ${entry.player.name}'s profile` : undefined}
                          />
                        )}
                        {teamLogo && (
                          <img src={teamLogo} alt={entry.team?.name}
                            className="w-10 h-10 object-contain opacity-80 shrink-0"
                            referrerPolicy="no-referrer"
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4">
                <ArrowRightLeft size={32} />
              </div>
              <p className="text-lg font-medium">No transactions found matching your filters.</p>
              <p className="text-sm">Try adjusting your search or filter criteria.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Team-scoped transactions tab (used inside TeamDetailView) ────────────────

interface TeamTransactionsTabProps {
  team: import('../../../types').NBATeam;
}

export const TeamTransactionsTab: React.FC<TeamTransactionsTabProps> = ({ team }) => {
  const { state } = useGame();
  const [searchQuery, setSearchQuery]   = useState('');
  const [filterType,  setFilterType]    = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(() => state.leagueStats?.year ?? 2026);
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<{ text: string; date: string; legs?: { text: string; date: string }[] } | null>(null);
  // Sync year when season advances
  React.useEffect(() => { setSelectedYear(state.leagueStats?.year ?? 2026); }, [state.leagueStats?.year]);

  const enrichedHistory = useMemo(() => {
    return [...(state.history || [])].sort((a, b) => {
      const da = typeof a === 'string' ? state.date : (a as any).date || state.date;
      const db = typeof b === 'string' ? state.date : (b as any).date || state.date;
      return new Date(db).getTime() - new Date(da).getTime();
    }).map(raw => {
      const entry = typeof raw === 'string'
        ? { text: raw, date: state.date, type: 'League Event' }
        : raw as { text: string; date: string; type?: string };
      const text  = entry.text || '';
      const kind  = detectType(text, entry.type);
      let player: typeof state.players[0] | null = null;
      for (const p of state.players) { if (text.includes(p.name)) { player = p; break; } }
      let teamRef: typeof state.teams[0] | null = null;
      for (const t of state.teams) { if (text.includes(t.name) || text.includes(t.abbrev)) { teamRef = t; break; } }
      return { ...entry, kind, player, team: teamRef };
    });
  }, [state.history, state.date, state.players, state.teams]);

  const availableYears = useMemo(() => {
    const s = new Set<number>();
    enrichedHistory.forEach(e => {
      if (e.kind === 'League Event') return;
      const t = e.text || '';
      if (!t.includes(team.name) && !t.includes(team.abbrev)) return;
      const yr = getSeasonYear(e.date || '');
      if (yr > 2000) s.add(yr);
    });
    return Array.from(s).sort((a, b) => b - a);
  }, [enrichedHistory, team]);

  const filteredHistory = useMemo(() => {
    return enrichedHistory.filter(entry => {
      if (entry.kind === 'League Event') return false;
      const text = entry.text || '';
      if (!text.includes(team.name) && !text.includes(team.abbrev)) return false;
      if (selectedYear && getSeasonYear(entry.date || '') !== selectedYear) return false;
      if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterType) {
        if (filterType === 'AwardOnWaivers') { if (!text.toLowerCase().includes('claimed off waivers')) return false; }
        else if (filterType === 'Waive') { if (!text.toLowerCase().includes('waived')) return false; }
        else if (filterType === 'Signing') { const tl = text.toLowerCase(); if (!tl.includes('signed') && !tl.includes('re-signed') && !tl.includes('signs with')) return false; }
        else if (filterType === 'Trade') { if (!text.toLowerCase().includes('trade')) return false; }
        else if (filterType === 'Retirement') { if (entry.kind !== 'Retirement') return false; }
        else if (entry.kind !== filterType) return false;
      }
      return true;
    });
  }, [enrichedHistory, team, selectedYear, searchQuery, filterType]);

  const displayItems = useMemo((): DisplayItem[] => {
    const result: DisplayItem[] = [];
    const used = new Set<number>();
    for (let i = 0; i < filteredHistory.length; i++) {
      if (used.has(i)) continue;
      const a = filteredHistory[i];
      if (a.kind !== 'Trade') { result.push({ kind: 'single', entry: a }); used.add(i); continue; }
      const textA = a.text || '';
      const group: number[] = [i];
      for (let j = i + 1; j < filteredHistory.length; j++) {
        if (used.has(j)) continue;
        const b = filteredHistory[j];
        if (b.kind !== 'Trade' || b.date !== a.date) continue;
        const textB = b.text || '';
        const shared = state.players.some(p => p.name.length >= 5 && textA.includes(p.name) && textB.includes(p.name));
        if (shared) group.push(j);
      }
      if (group.length >= 2) {
        group.forEach(idx => used.add(idx));
        result.push({ kind: 'multi', date: a.date, legs: group.map(idx => filteredHistory[idx]) });
      } else {
        used.add(i);
        result.push({ kind: 'single', entry: a });
      }
    }
    return result;
  }, [filteredHistory, state.players]);

  if (selectedTrade) return <TradeDetailView entry={selectedTrade} legs={selectedTrade.legs} onBack={() => setSelectedTrade(null)} />;
  if (viewingPlayer)  return <PlayerBioView  player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;

  return (
    <div className="space-y-3">
      {/* Compact toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Year chevrons */}
        {availableYears.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5">
            <button
              onClick={() => { const i = availableYears.indexOf(selectedYear); if (i < availableYears.length - 1) setSelectedYear(availableYears[i + 1]); }}
              disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            ><ChevronLeft size={14} /></button>
            <span className="text-xs font-black text-white px-1 min-w-[40px] text-center">{selectedYear}</span>
            <button
              onClick={() => { const i = availableYears.indexOf(selectedYear); if (i > 0) setSelectedYear(availableYears[i - 1]); }}
              disabled={availableYears.indexOf(selectedYear) === 0}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            ><ChevronRight size={14} /></button>
          </div>
        )}
        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="appearance-none bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer text-slate-300"
        >
          <option value="">All Types</option>
          <option value="Draft">Draft</option>
          <option value="Signing">Signing</option>
          <option value="Trade">Trade</option>
          <option value="Waive">Waive</option>
          <option value="Retirement">Retirement</option>
        </select>
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
          <input
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-300 placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* List */}
      <div className="w-full overflow-x-hidden max-w-4xl mx-auto space-y-3">
        {displayItems.length > 0 ? displayItems.map((item, index) => {
          if (item.kind === 'multi') {
            const legTeams = item.legs.flatMap(leg => {
              const logos: { logo: string; name: string }[] = [];
              for (const t of state.teams) {
                if ((leg.text || '').includes(t.name)) logos.push({ logo: (t as any).logoUrl, name: t.name });
              }
              return logos;
            });
            const uniqueTeams = legTeams.filter((t, i, arr) => arr.findIndex(x => x.name === t.name) === i);
            return (
              <div key={`multi-${index}`} className="bg-blue-950/30 border border-blue-700/40 hover:border-blue-600/60 rounded-xl overflow-hidden transition-all">
                <div
                  className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-blue-800/30 cursor-pointer hover:bg-blue-900/20 transition-colors"
                  onClick={() => { const [first, ...rest] = item.legs; setSelectedTrade({ text: first.text, date: first.date, legs: rest.map(l => ({ text: l.text, date: l.date })) }); }}
                >
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft size={13} className="text-blue-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">{item.legs.length + 1}-Team Trade</span>
                    <div className="flex items-center gap-1">
                      {uniqueTeams.slice(0, 4).map((t, i) => (
                        <img key={i} src={t.logo} alt={t.name} title={t.name} className="w-4 h-4 object-contain opacity-80" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} />
                      ))}
                    </div>
                    <span className="text-[9px] text-blue-400/60 font-medium">View All →</span>
                  </div>
                  <span className="text-slate-500 text-[10px] flex items-center gap-1"><Calendar size={11} />{item.date}</span>
                </div>
                <div className="divide-y divide-blue-900/30">
                  {item.legs.map((leg, li) => (
                    <div key={li} className="flex gap-3 px-4 py-2.5 items-start cursor-pointer hover:bg-blue-900/20 transition-colors" onClick={() => setSelectedTrade({ text: leg.text, date: leg.date })}>
                      <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider mt-0.5 w-8 shrink-0">L{li + 1}</span>
                      <p className="flex-1 text-slate-300 text-xs leading-relaxed">{leg.text}</p>
                      {leg.player?.imgURL && (
                        <img src={leg.player.imgURL} alt={leg.player.name} className="w-7 h-7 rounded-full object-cover border border-slate-700 cursor-pointer hover:border-indigo-400 shrink-0" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} onClick={e => { e.stopPropagation(); leg.player && setViewingPlayer(leg.player as NBAPlayer); }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          const entry = item.entry;
          const style = TYPE_STYLE[entry.kind] ?? TYPE_STYLE['League Event'];
          const teamColor = (entry.team as any)?.colors?.[0];
          const teamLogo  = (entry.team as any)?.logoUrl;
          const playerImg = entry.player?.imgURL;
          const isTrade = entry.kind === 'Trade';

          return (
            <div
              key={index}
              className={`group relative bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden transition-all ${isTrade ? 'cursor-pointer hover:bg-slate-900/70' : ''}`}
              onClick={isTrade ? () => setSelectedTrade({ text: entry.text, date: entry.date }) : undefined}
            >
              {teamColor && <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: teamColor }} />}
              <div className="flex gap-3 p-3 sm:p-4 pl-4 sm:pl-5">
                <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${style.bg} ${style.color}`}>
                  {style.icon}
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-wider ${style.color}`}>{style.label}</span>
                      {isTrade && <span className="text-[9px] font-medium text-blue-400/60 opacity-0 group-hover:opacity-100 transition-opacity">View →</span>}
                    </div>
                    <span className="text-slate-600 text-[10px] flex items-center gap-1 shrink-0"><Calendar size={10} />{entry.date}</span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed break-words">{entry.text}</p>
                </div>
                {(playerImg || teamLogo) && (
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    {playerImg && (
                      <img src={playerImg} alt={entry.player?.name} className="w-9 h-9 rounded-full object-cover border border-slate-700 cursor-pointer hover:border-indigo-400 transition-colors" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} onClick={e => { e.stopPropagation(); entry.player && setViewingPlayer(entry.player as NBAPlayer); }} />
                    )}
                    {teamLogo && (
                      <img src={teamLogo} alt="" className="w-7 h-7 object-contain opacity-60 shrink-0" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600">
            <ArrowRightLeft size={28} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No transactions found for {team.name}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Reusable filter dropdown ─────────────────────────────────────────────────
const FilterSelect: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
  <div className="flex flex-col gap-1.5 shrink-0">
    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">{label}</label>
    <div className="relative group">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-slate-800 border border-slate-700 rounded-lg py-2 pl-3 sm:pl-4 pr-9 sm:pr-10 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-w-[140px] sm:min-w-[160px] cursor-pointer hover:bg-slate-750 transition-colors"
      >
        {children}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-slate-300 transition-colors">
        <Filter size={14} />
      </div>
    </div>
  </div>
);
