import React, { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, LayoutList, Rows3 } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer } from '../../../types';
import { calculateK2, K2_CATS, K2Data } from '../../../services/simulation/convert2kAttributes';
import { convertTo2KRating } from '../../../utils/helpers';
import { PlayerRatingsModal } from '../../modals/PlayerRatingsModal';
import { applyLeagueDisplayScale } from '../../../hooks/useLeagueScaledRatings';

// Category summary config
const CAT_CONFIG = [
  { key: 'OS' as const, label: 'SCR', full: 'Outside Scoring' },
  { key: 'AT' as const, label: 'ATH', full: 'Athleticism' },
  { key: 'IS' as const, label: 'INS', full: 'Inside Scoring' },
  { key: 'PL' as const, label: 'PLY', full: 'Playmaking' },
  { key: 'DF' as const, label: 'DEF', full: 'Defense' },
  { key: 'RB' as const, label: 'REB', full: 'Rebounding' },
] as const;

type CatKey = typeof CAT_CONFIG[number]['key'];

// Sub-attribute abbreviations matching K2_CATS sub order
const SUB_ABBREVS: Record<CatKey, string[]> = {
  OS: ['CLO', 'MID', '3PT', 'FT', 'SIQ', 'OCN'],
  AT: ['SPD', 'AGI', 'STR', 'VRT', 'STA', 'HST', 'DUR'],
  IS: ['LAY', 'SDK', 'DDK', 'PHK', 'PFD', 'PCT', 'DRW', 'HND'],
  PL: ['PAS', 'BHD', 'SWB', 'PIQ', 'PVS'],
  DF: ['IDF', 'PDF', 'STL', 'BLK', 'HIQ', 'PPR', 'DCN'],
  RB: ['ORB', 'DRB'],
};

// Sub-attribute full names matching K2_CATS sub order
const SUB_FULL: Record<CatKey, string[]> = {
  OS: ['Close Shot', 'Mid-Range', 'Three-Point', 'Free Throw', 'Shot IQ', 'Off. Consistency'],
  AT: ['Speed', 'Agility', 'Strength', 'Vertical', 'Stamina', 'Hustle', 'Durability'],
  IS: ['Layup', 'Standing Dunk', 'Driving Dunk', 'Post Hook', 'Post Fade', 'Post Control', 'Draw Foul', 'Hands'],
  PL: ['Pass Accuracy', 'Ball Handle', 'Speed w/ Ball', 'Pass IQ', 'Pass Vision'],
  DF: ['Interior Def.', 'Perimeter Def.', 'Steal', 'Block', 'Help Def. IQ', 'Pass Perception', 'Def. Consistency'],
  RB: ['Off. Rebound', 'Def. Rebound'],
};

const CAT_COLORS: Record<CatKey, string> = {
  OS: '#f97316',
  AT: '#22c55e',
  IS: '#ef4444',
  PL: '#3b82f6',
  DF: '#8b5cf6',
  RB: '#eab308',
};

type SortField = 'name' | 'age' | 'ovr' | CatKey | string; // string covers detail sub keys like 'OS.0'

interface RowData {
  player: NBAPlayer;
  age: number;
  ovr: number;
  k2: K2Data;
  OS: number; AT: number; IS: number; PL: number; DF: number; RB: number;
}

function getRatingColor(val: number): string {
  if (val >= 90) return '#3b82f6';
  if (val >= 80) return '#22c55e';
  if (val >= 70) return '#eab308';
  if (val >= 50) return '#f97316';
  return '#f43f5e';
}

function RatingCell({ value }: { value: number }) {
  const color = getRatingColor(value);
  return (
    <span className="font-black tabular-nums text-sm" style={{ color }}>
      {value}
    </span>
  );
}

function getSubVal(row: RowData, key: string): number {
  // key format: 'OS.0', 'AT.3', etc.
  const [cat, idxStr] = key.split('.');
  const idx = Number(idxStr);
  return (row.k2 as any)[cat]?.sub[idx] ?? 50;
}

export const PlayerRatingsView: React.FC = () => {
  const { state } = useGame();

  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('ovr');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<NBAPlayer | null>(null);
  const [detailMode, setDetailMode] = useState(false);
  const [page, setPage] = useState(0);

  const PAGE_SIZE = 50;

  const season = state.leagueStats?.year ?? 2026;

  const currentYear = new Date().getFullYear();

  // Build row data
  const rows: RowData[] = useMemo(() => {
    return state.players
      .filter(p => p.status === 'Active' || p.status === 'Free Agent')
      .map(player => {
        const ratings = player.ratings?.find((r: any) => r.season === season)
          ?? player.ratings?.[player.ratings?.length - 1]
          ?? {};
        const defaults = {
          hgt: 50, stre: 50, spd: 50, jmp: 50, endu: 50,
          ins: 50, dnk: 50, ft: 50, fg: 50, tp: 50,
          oiq: 50, diq: 50, drb: 50, pss: 50, reb: 50,
        };
        const rawR = { ...defaults, ...ratings };
        // Apply league-strength nerf for display (mirrors sim getScaledRating multipliers)
        const r = applyLeagueDisplayScale(player.status, rawR);
        const age = (player as any).born?.year ? currentYear - (player as any).born.year : player.age || 0;
        const k2 = calculateK2(r as any, {
          pos: player.pos,
          heightIn: player.hgt,
          weightLbs: player.weight,
          age,
        });
        const ovr = convertTo2KRating(player.overallRating ?? 60, r.hgt, r.tp);
        return {
          player,
          age,
          ovr,
          k2,
          OS: k2.OS.ovr,
          AT: k2.AT.ovr,
          IS: k2.IS.ovr,
          PL: k2.PL.ovr,
          DF: k2.DF.ovr,
          RB: k2.RB.ovr,
        };
      });
  }, [state.players, season]); // currentYear is stable within a session

  // Filter
  const filtered = useMemo(() => {
    let r = rows;
    if (teamFilter !== 'all') {
      const tid = Number(teamFilter);
      r = r.filter(row => row.player.tid === tid);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(row => row.player.name.toLowerCase().includes(q));
    }
    return r;
  }, [rows, teamFilter, search]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.player.name.localeCompare(b.player.name);
      else if (sortField === 'age') cmp = a.age - b.age;
      else if (sortField === 'ovr') cmp = a.ovr - b.ovr;
      else if (['OS', 'AT', 'IS', 'PL', 'DF', 'RB'].includes(sortField)) {
        cmp = (a as any)[sortField] - (b as any)[sortField];
      } else if (sortField.includes('.')) {
        cmp = getSubVal(a, sortField) - getSubVal(b, sortField);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(prev => !prev);
    else { setSortField(field); setSortAsc(false); }
    setPage(0);
  };

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown size={10} className="text-slate-600" />;
    return sortAsc
      ? <ChevronUp size={10} className="text-indigo-400" />
      : <ChevronDown size={10} className="text-indigo-400" />;
  };

  const nbaTeams = state.teams.filter(t => t.id >= 0).sort((a, b) => a.name.localeCompare(b.name));

  // Summary columns — pos/age shown below name, not separate columns
  const summaryColumns: { key: SortField; label: string; title?: string; sticky?: boolean }[] = [
    { key: 'name', label: 'Name', sticky: true },
    { key: 'age',  label: 'AGE' },
    { key: 'ovr',  label: 'OVR' },
    ...CAT_CONFIG.map(c => ({ key: c.key as SortField, label: c.label, title: c.full })),
  ];

  // Detail columns: name sticky, then AGE + OVR, then all subs grouped by category
  const detailColumns: { key: SortField; label: string; title?: string; catKey?: CatKey; sticky?: boolean }[] = [
    { key: 'name', label: 'Name', sticky: true },
    { key: 'age',  label: 'AGE' },
    { key: 'ovr',  label: 'OVR' },
  ];
  for (const cat of CAT_CONFIG) {
    const abbrevs = SUB_ABBREVS[cat.key];
    const fulls = SUB_FULL[cat.key];
    abbrevs.forEach((abbr, i) => {
      detailColumns.push({ key: `${cat.key}.${i}`, label: abbr, title: `${cat.full} — ${fulls[i]}`, catKey: cat.key });
    });
  }

  const columns = detailMode ? detailColumns : summaryColumns;

  return (
    <div className="h-full overflow-hidden flex flex-col p-4 md:p-8">
      {/* Page header */}
      <div className="flex-shrink-0 mb-6">
        <h2 className="text-3xl font-black text-white uppercase tracking-tight">Player Ratings</h2>
        <p className="text-slate-500 font-medium">Attribute ratings for all players</p>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search players..."
            className="w-full pl-8 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Team filter */}
        <select
          value={teamFilter}
          onChange={e => { setTeamFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 max-w-xs"
        >
          <option value="all">All Teams</option>
          <option value="-1">Free Agents</option>
          {nbaTeams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        {/* Detail toggle */}
        <button
          onClick={() => setDetailMode(prev => !prev)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
            detailMode
              ? 'bg-violet-600 border-violet-500 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
          }`}
          title={detailMode ? 'Switch to summary view' : 'Switch to detailed attribute view'}
        >
          {detailMode ? <LayoutList size={13} /> : <Rows3 size={13} />}
          {detailMode ? 'Summary' : 'Detailed'}
        </button>

        <span className="text-xs text-slate-500 self-center">{sorted.length} players</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1 self-center ml-auto">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            <span className="text-xs text-slate-400 px-1">
              {page + 1} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar rounded-2xl border border-slate-800">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            {/* Category header row for detail mode */}
            {detailMode && (
              <tr className="bg-slate-950 border-b border-slate-800/50 sticky top-0 z-20">
                <th className="sticky left-0 bg-slate-950 z-30 px-3 py-1.5 shadow-[2px_0_0_#020617]" />
                <th className="px-3 py-1.5" />
                <th className="px-3 py-1.5" />
                {CAT_CONFIG.map(cat => {
                  const subCount = SUB_ABBREVS[cat.key].length;
                  return (
                    <th
                      key={cat.key}
                      colSpan={subCount}
                      className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-center border-l border-slate-800"
                      style={{ color: CAT_COLORS[cat.key] }}
                    >
                      {cat.full}
                    </th>
                  );
                })}
              </tr>
            )}
            {/* Main column header row */}
            <tr className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10" style={{ top: detailMode ? '28px' : '0' }}>
              {columns.map((col, colIdx) => {
                const catKey = (col as any).catKey as CatKey | undefined;
                const catColor = catKey ? CAT_COLORS[catKey] : undefined;
                const isFirst = colIdx === 0;
                const isCatBorder = detailMode && catKey && colIdx > 3 && (
                  // first sub of each category gets a left border
                  col.key === `${catKey}.0`
                );
                return (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    title={col.title}
                    className={`px-3 py-3 text-[10px] font-black uppercase tracking-widest hover:text-slate-300 cursor-pointer select-none whitespace-nowrap ${
                      col.sticky ? 'sticky left-0 bg-slate-900 z-20 shadow-[2px_0_0_#1e293b]' : ''
                    } ${isCatBorder ? 'border-l border-slate-700' : ''}`}
                    style={{ color: sortField === col.key ? '#818cf8' : catColor ?? '#64748b' }}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      <SortIcon field={col.key} />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, idx) => {
              const teamAbbr = state.teams.find(t => t.id === row.player.tid)?.abbrev ?? 'FA';
              return (
                <tr
                  key={row.player.internalId}
                  onClick={() => setSelectedPlayer(row.player)}
                  className={`border-b border-slate-800/50 cursor-pointer transition-colors hover:bg-slate-800/60 ${
                    idx % 2 === 0 ? 'bg-slate-900/30' : 'bg-slate-900/10'
                  }`}
                >
                  {columns.map((col, colIdx) => {
                    if (col.sticky) {
                      return (
                        <td key={col.key} className="sticky left-0 bg-inherit px-3 py-2.5 shadow-[2px_0_0_#1e293b]">
                          <div className="flex items-center gap-2">
                            {row.player.imgURL && (
                              <img
                                src={row.player.imgURL}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover bg-slate-800 flex-shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <div className="min-w-0">
                              <span className="text-sm font-bold text-white truncate block max-w-[120px] md:max-w-none">
                                {row.player.name}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {teamAbbr}{row.player.pos ? ` | ${row.player.pos}` : ''}{row.age ? ` | ${row.age}` : ''}
                              </span>
                            </div>
                          </div>
                        </td>
                      );
                    }
                    if (col.key === 'age') return <td key={col.key} className="px-3 py-2.5 text-xs text-slate-400 tabular-nums">{row.age || '—'}</td>;
                    if (col.key === 'ovr') return <td key={col.key} className="px-3 py-2.5"><RatingCell value={row.ovr} /></td>;

                    const catKey = (col as any).catKey as CatKey | undefined;
                    const isCatBorder = detailMode && catKey && col.key === `${catKey}.0` && colIdx > 3;
                    if (col.key.includes('.')) {
                      const val = getSubVal(row, col.key);
                      return (
                        <td key={col.key} className={`px-3 py-2.5 ${isCatBorder ? 'border-l border-slate-800' : ''}`}>
                          <RatingCell value={val} />
                        </td>
                      );
                    }
                    // Summary category OVR
                    return (
                      <td key={col.key} className="px-3 py-2.5">
                        <RatingCell value={(row as any)[col.key] ?? 50} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500 text-sm">
                  No players found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 pt-3">
          <button
            disabled={page === 0}
            onClick={() => setPage(0)}
            className="px-2 py-1 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            «
          </button>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ‹ Prev
          </button>
          <span className="text-xs text-slate-400 px-2 font-bold">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next ›
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(totalPages - 1)}
            className="px-2 py-1 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            »
          </button>
        </div>
      )}

      {/* Player Ratings Modal */}
      {selectedPlayer && (
        <PlayerRatingsModal
          player={selectedPlayer}
          season={season}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
};
