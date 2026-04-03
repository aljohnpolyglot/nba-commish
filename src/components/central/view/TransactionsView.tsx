import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { ArrowRightLeft, Calendar, Info, Search, Filter, UserCheck, UserX, AlertTriangle, Users } from 'lucide-react';
import { motion } from 'motion/react';

// ─── helpers ─────────────────────────────────────────────────────────────────

function detectType(text: string, type?: string) {
  const t = text.toLowerCase();
  if (type === 'Trade'      || t.includes('trade'))                   return 'Trade';
  if (type === 'Signing'    || t.includes('signed'))                  return 'Signing';
  if (type === 'Waive'      || t.includes('waived'))                  return 'Waive';
  if (type === 'Suspension' || t.includes('suspended'))               return 'Suspension';
  if (type === 'Personnel'  || t.includes('fired') || t.includes('hired')) return 'Personnel';
  return 'League Event';
}

const TYPE_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  Trade:       { color: 'text-blue-400',    bg: 'bg-blue-500/10',    icon: <ArrowRightLeft size={18}/>, label: 'Trade' },
  Signing:     { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <UserCheck size={18}/>,      label: 'Signing' },
  Waive:       { color: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: <UserX size={18}/>,          label: 'Waiver' },
  Suspension:  { color: 'text-rose-400',    bg: 'bg-rose-500/10',    icon: <AlertTriangle size={18}/>,  label: 'Suspension' },
  Personnel:   { color: 'text-purple-400',  bg: 'bg-purple-500/10',  icon: <Users size={18}/>,          label: 'Personnel' },
  'League Event': { color: 'text-slate-400', bg: 'bg-slate-800',     icon: <Info size={18}/>,           label: 'League Event' },
};

export const TransactionsView: React.FC = () => {
  const { state } = useGame();
  const [filterType, setFilterType] = React.useState('');
  const [filterTeam, setFilterTeam] = React.useState('');
  const [filterMonth, setFilterMonth] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');

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
    return [...(state.history || [])].reverse().map(raw => {
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

  const filteredHistory = enrichedHistory.filter(entry => {
    // Events view handles League Events — Transactions shows only roster/personnel moves
    if (entry.kind === 'League Event') return false;
    const text = entry.text || '';
    if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    if (filterType) {
      if (filterType === 'AwardOnWaivers') {
        if (!text.toLowerCase().includes('claimed off waivers')) return false;
      } else if (filterType === 'Waive') {
        if (!text.toLowerCase().includes('waived')) return false;
      } else if (filterType === 'Signing') {
        if (!text.toLowerCase().includes('signed')) return false;
      } else if (filterType === 'Trade') {
        if (!text.toLowerCase().includes('trade')) return false;
      } else if (entry.kind !== filterType) {
        return false;
      }
    }

    if (filterTeam) {
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

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <FilterSelect label="Transaction Type" value={filterType} onChange={setFilterType}>
              <option value="">All Transactions</option>
              <option value="Signing">Signing</option>
              <option value="Trade">Trade</option>
              <option value="Waive">Waive</option>
              <option value="AwardOnWaivers">Claimed off Waivers</option>
            </FilterSelect>
            <FilterSelect label="Team" value={filterTeam} onChange={setFilterTeam}>
              <option value="">All Teams</option>
              {state.teams.map(team => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Month" value={filterMonth} onChange={setFilterMonth}>
              <option value="">All Months</option>
              {['October','November','December','January','February','March','April','May','June','July','August','September'].map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </FilterSelect>
            {(filterType || filterTeam || filterMonth || searchQuery) && (
              <button
                onClick={() => { setFilterType(''); setFilterTeam(''); setFilterMonth(''); setSearchQuery(''); }}
                className="mt-5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
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
          {filteredHistory.length > 0 ? (
            filteredHistory.map((entry, index) => {
              const style = TYPE_STYLE[entry.kind] ?? TYPE_STYLE['League Event'];
              const teamColor = (entry.team as any)?.colors?.[0];
              const teamLogo = (entry.team as any)?.logoUrl || (entry.team as any)?.imgURL;
              const playerImg = entry.player?.imgURL;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.5), duration: 0.3 }}
                  className="group relative bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden transition-all hover:bg-slate-900/60"
                >
                  {/* Team color ribbon */}
                  {teamColor && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                      style={{ backgroundColor: teamColor }}
                    />
                  )}

                  <div className="flex gap-4 p-5 pl-6">
                    {/* Type icon */}
                    <div className={`mt-1 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${style.bg} ${style.color}`}>
                      {style.icon}
                    </div>

                    {/* Main text area */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${style.color}`}>
                          {style.label}
                        </span>
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                          <Calendar size={12} />
                          <span>{entry.date}</span>
                        </div>
                      </div>
                      <p className="text-slate-200 leading-relaxed font-medium">
                        {entry.text || `${style.label} transaction recorded.`}
                      </p>
                    </div>

                    {/* Right: player portrait + team logo */}
                    {(playerImg || teamLogo) && (
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {playerImg && (
                          <img
                            src={playerImg}
                            alt={entry.player?.name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-slate-700 shrink-0"
                            referrerPolicy="no-referrer"
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        {teamLogo && (
                          <img
                            src={teamLogo}
                            alt={entry.team?.name}
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

// ─── Reusable filter dropdown ─────────────────────────────────────────────────
const FilterSelect: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">{label}</label>
    <div className="relative group">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-slate-800 border border-slate-700 rounded-lg py-2 pl-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-w-[160px] cursor-pointer hover:bg-slate-750 transition-colors"
      >
        {children}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-slate-300 transition-colors">
        <Filter size={14} />
      </div>
    </div>
  </div>
);
