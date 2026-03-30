import React, { useState, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer, NBATeam, Game } from '../../../types';
import { Search } from 'lucide-react';
import { PlayerBioView } from './PlayerBioView';
import { BoxScoreModal } from '../../modals/BoxScoreModal';

interface StatisticalFeatsViewProps {
  onGameClick?: (game: Game) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & TYPES
// ─────────────────────────────────────────────────────────────────────────────

const FEAT_CATEGORIES = [
  '50-PT GAMES',
  '40-PT GAMES',
  '30-PT GAMES',
  'TRIPLE-DOUBLES',
  'DOUBLE-DOUBLES',
  '5×5'
];

interface FeatEntry {
  id: string;
  gameId: number;
  player: NBAPlayer;
  playerName: string;
  teamId: number;
  teamAbbrev: string;
  oppTeamId: number;
  oppAbbrev: string;
  date: string;
  isWin: boolean;
  result: string;
  featsFound: string[];
  // Stats (1:1 with PlayerBioView Game Log)
  gs: boolean;
  min: number;
  mp: string;
  fgm: number;
  fga: number;
  fgp: string;
  tpm: number;
  tpa: number;
  tpp: string;
  twom: number;
  twoa: number;
  twop: string;
  efgp: string;
  ftm: number;
  fta: number;
  ftp: string;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  gmsc: number;
  plusMinus: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const StatisticalFeatsView: React.FC<StatisticalFeatsViewProps> = ({ onGameClick }) => {
  const { state, navigateToTeam } = useGame();
  const [selectedBoxScoreGame, setSelectedBoxScoreGame] = useState<Game | null>(null);
  
  // State
  const [selectedPlayer, setSelectedPlayer] = useState<NBAPlayer | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>(FEAT_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  
  const [sortField, setSortField] = useState<keyof FeatEntry>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  const currentYear = state.leagueStats.year.toString();

  // ─── 1. EXTRACT DATA AND CALCULATE FEATS ─────────────────────────────────────
  const { feats, summaryCounts } = useMemo(() => {
    const extracted: FeatEntry[] = [];
    const counts: Record<string, number> = {
      '50-PT GAMES': 0,
      '40-PT GAMES': 0,
      '30-PT GAMES': 0,
      'TRIPLE-DOUBLES': 0,
      'DOUBLE-DOUBLES': 0,
      '5×5': 0
    };

    const OPENING_NIGHT_MS = new Date('2025-10-24T00:00:00Z').getTime();

    state.boxScores.forEach(game => {
      // Skip All-Star & Rising Stars
      if (game.isAllStar || game.isRisingStars) return;

      // Skip Preseason
      const schedGame = state.schedule.find((g: any) => g.gid === game.gameId);
      const isPreseason = schedGame?.isPreseason === true ||
        (() => { try { return new Date(game.date).getTime() < OPENING_NIGHT_MS; } catch { return false; } })();
      if (isPreseason) return;

      const homeTeam = state.teams.find(t => t.id === game.homeTeamId);
      const awayTeam = state.teams.find(t => t.id === game.awayTeamId);
      if (!homeTeam || !awayTeam) return;

      const isHomeWin = game.homeScore > game.awayScore;

      const processStats = (stats: any[], team: NBATeam, opp: NBATeam, isHome: boolean) => {
        stats.forEach(stat => {
          const player = state.players.find(p => p.internalId === stat.playerId);
          if (!player) return;

          const pts = stat.pts || 0;
          const ast = stat.ast || 0;
          const reb = stat.reb || stat.trb || (stat.orb || 0) + (stat.drb || 0) || 0;
          const stl = stat.stl || 0;
          const blk = stat.blk || 0;

          const activeFeats: string[] = [];
          
          // Points Logic (Mutually Exclusive for the visual buckets)
          if (pts >= 50) { activeFeats.push('50-PT GAMES'); counts['50-PT GAMES']++; }
          else if (pts >= 40) { activeFeats.push('40-PT GAMES'); counts['40-PT GAMES']++; }
          else if (pts >= 30) { activeFeats.push('30-PT GAMES'); counts['30-PT GAMES']++; }

          // Double/Triple Doubles (Mutually Exclusive)
          const tens = [pts, reb, ast, stl, blk].filter(val => val >= 10).length;
          if (tens >= 3) { activeFeats.push('TRIPLE-DOUBLES'); counts['TRIPLE-DOUBLES']++; }
          else if (tens === 2) { activeFeats.push('DOUBLE-DOUBLES'); counts['DOUBLE-DOUBLES']++; }

          // 5x5
          const fives = [pts, reb, ast, stl, blk].filter(val => val >= 5).length;
          if (fives >= 5) { activeFeats.push('5×5'); counts['5×5']++; }

          // Only add to table if they actually accomplished a tracked feat
          if (activeFeats.length > 0) {
            const isWin = isHome ? isHomeWin : !isHomeWin;
            const scoreStr = isHome 
              ? `${game.homeScore}-${game.awayScore}` 
              : `${game.awayScore}-${game.homeScore}`;

            const fgm = stat.fgm || 0;
            const fga = stat.fga || 0;
            const tpm = stat.threePm || 0;
            const tpa = stat.threePa || 0;
            const ftm = stat.ftm || 0;
            const fta = stat.fta || 0;

            const twom = fgm - tpm;
            const twoa = fga - tpa;

            const fgp = fga > 0 ? (fgm / fga).toFixed(3).replace(/^0+/, '') : '.000';
            const tpp = tpa > 0 ? (tpm / tpa).toFixed(3).replace(/^0+/, '') : '.000';
            const twop = twoa > 0 ? (twom / twoa).toFixed(3).replace(/^0+/, '') : '.000';
            const efgp = fga > 0 ? ((fgm + 0.5 * tpm) / fga).toFixed(3).replace(/^0+/, '') : '.000';
            const ftp = fta > 0 ? (ftm / fta).toFixed(3).replace(/^0+/, '') : '.000';

            extracted.push({
              id: `${game.gameId}-${player.internalId}`,
              gameId: game.gameId,
              player,
              playerName: player.name,
              teamId: team.id,
              teamAbbrev: team.abbrev,
              oppTeamId: opp.id,
              oppAbbrev: isHome ? opp.abbrev : `@${opp.abbrev}`,
              date: game.date || '',
              isWin,
              result: game.isOT
                ? `${isWin ? 'W' : 'L'}, ${scoreStr}${game.otCount && game.otCount > 1 ? ` ${game.otCount}OT` : ' OT'}`
                : `${isWin ? 'W' : 'L'}, ${scoreStr}`,
              featsFound: activeFeats,
              gs: stat.gs > 0,
              min: stat.min || 0,
              mp: Math.floor(stat.min || 0) + ':' + String(Math.floor(((stat.min || 0) % 1) * 60)).padStart(2, '0'),
              fgm, fga, fgp,
              tpm, tpa, tpp,
              twom, twoa, twop,
              efgp,
              ftm, fta, ftp,
              orb: stat.orb || 0,
              drb: stat.drb || 0,
              trb: reb,
              ast, stl, blk,
              tov: stat.tov || 0,
              pf: stat.pf || 0,
              pts,
              gmsc: Number((stat.gameScore || 0).toFixed(1)),
              plusMinus: stat.pm != null ? stat.pm : null,
            });
          }
        });
      };

      processStats(game.homeStats, homeTeam, awayTeam, true);
      processStats(game.awayStats, awayTeam, homeTeam, false);
    });

    return { feats: extracted, summaryCounts: counts };
  }, [state.boxScores, state.players, state.teams, state.schedule]);

  // ─── 2. FILTER ───────────────────────────────────────────────────────────────
  const filteredFeats = useMemo(() => {
    return feats.filter(feat => {
      if (selectedTeam !== 'all' && feat.teamAbbrev !== selectedTeam) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!feat.playerName.toLowerCase().includes(query) &&
            !feat.teamAbbrev.toLowerCase().includes(query)) return false;
      }
      if (!feat.featsFound.some(f => activeFilters.includes(f))) return false;
      return true;
    });
  }, [feats, selectedTeam, searchQuery, activeFilters]);

  // ─── 3. SORT ─────────────────────────────────────────────────────────────────
  const filteredAndSorted = useMemo(() => {
    return [...filteredFeats].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;

      if (sortField === 'date') return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
      if (sortField === 'playerName') return (a.playerName ?? '').localeCompare(b.playerName ?? '') * dir;
      if (sortField === 'teamAbbrev') return (a.teamAbbrev ?? '').localeCompare(b.teamAbbrev ?? '') * dir;
      if (sortField === 'oppAbbrev') return (a.oppAbbrev ?? '').localeCompare(b.oppAbbrev ?? '') * dir;
      if (sortField === 'mp' || sortField === 'min') return (a.min - b.min) * dir;

      const valA = a[sortField as keyof FeatEntry];
      const valB = b[sortField as keyof FeatEntry];

      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      if (typeof valA === 'boolean') return ((valA ? 1 : 0) - ((valB as boolean) ? 1 : 0)) * dir;

      if (typeof valA === 'string') {
        const numA = parseFloat(valA);
        const numB = parseFloat(valB as string);
        if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * dir;
        return valA.localeCompare(valB as string) * dir;
      }

      return ((valA as number) - (valB as number)) * dir;
    });
  }, [filteredFeats, sortField, sortDir]);

  // ─── 4. PAGINATION ───────────────────────────────────────────────────────────
  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const paginatedData = filteredAndSorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const sortedTeams = useMemo(() => [...state.teams].sort((a, b) => (a.city ?? '').localeCompare(b.city ?? '')), [state.teams]);

  // Toggle Box Click Logic
  const toggleFilter = (feat: string) => {
    setActiveFilters(prev => {
      // If all are currently active, clicking one isolates it
      if (prev.length === FEAT_CATEGORIES.length) return [feat];
      // If it's the only one active, clicking it again resets to all
      if (prev.includes(feat) && prev.length === 1) return FEAT_CATEGORIES;
      // Normal multi-select toggle
      if (prev.includes(feat)) return prev.filter(f => f !== feat);
      return [...prev, feat];
    });
    setCurrentPage(1);
  };

  const handleSort = (field: keyof FeatEntry) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setCurrentPage(1);
  };

  const handleGameClick = (game: Game) => {
    if (onGameClick) {
      onGameClick(game);
    } else {
      setSelectedBoxScoreGame(game);
    }
  };

  if (selectedPlayer) {
    return (
      <PlayerBioView
        player={selectedPlayer}
        onBack={() => setSelectedPlayer(null)}
        onGameClick={handleGameClick}
        onTeamClick={navigateToTeam}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white overflow-hidden rounded-[2.5rem] border border-white/10 relative shadow-2xl">
      
      {/* ── HEADER AREA ── */}
      <div className="flex-shrink-0 bg-[#080808] border-b border-white/10 p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              Statistical Feats
            </h1>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium tracking-wide uppercase mt-0.5 sm:mt-1">
              Top Performances • {currentYear} Season
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search Player..."
                className="bg-black/50 border border-white/10 text-white text-xs font-bold tracking-wider rounded-full pl-8 sm:pl-9 pr-3 sm:pr-4 py-1.5 sm:py-2 outline-none focus:border-indigo-500 transition-colors w-full sm:w-48 placeholder-slate-600"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>

            <select
              className="bg-black/50 border border-white/10 text-white text-xs font-bold tracking-wider uppercase rounded-full px-2 sm:px-4 py-1.5 sm:py-2 outline-none cursor-pointer appearance-none transition-colors hover:border-white/30 flex-shrink-0"
              value={selectedTeam}
              onChange={(e) => { setSelectedTeam(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">ALL TEAMS</option>
              {sortedTeams.map(t => (
                <option key={t.id} value={t.abbrev}>{t.abbrev}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── SUMMARY BOXES (CLICKABLE) ── */}
      <div className="flex-shrink-0 grid grid-cols-3 md:grid-cols-6 gap-1.5 sm:gap-2 md:gap-4 px-3 sm:px-6 py-3 sm:py-4 bg-[#080808] border-b border-white/5">
        {FEAT_CATEGORIES.map(feat => {
          const isActive = activeFilters.includes(feat);
          return (
            <button
              key={feat}
              onClick={() => toggleFilter(feat)}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 ${
                isActive 
                  ? 'bg-indigo-500/20 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.15)] scale-[1.02]' 
                  : 'bg-black/30 border-white/5 hover:bg-white/5 hover:border-white/10 text-slate-500'
              }`}
            >
              <span className={`text-xl sm:text-2xl md:text-3xl font-black ${isActive ? 'text-white' : 'text-slate-400'}`}>
                {summaryCounts[feat]}
              </span>
              <span className={`text-[8px] sm:text-[9px] md:text-[10px] font-bold uppercase tracking-widest mt-0.5 sm:mt-1 text-center leading-tight ${isActive ? 'text-indigo-300' : 'text-slate-600'}`}>
                {feat}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── TABLE CONTAINER ── */}
      <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar bg-[#080808]">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-[10px] text-slate-400 uppercase bg-slate-900/50 border-y border-slate-800 whitespace-nowrap sticky top-0 z-10 backdrop-blur-md">
            <tr>
              {[
                { label: 'Date',   field: 'date',       align: 'left',   sortable: true },
                { label: 'Player', field: 'playerName', align: 'left',   sortable: false },
                { label: 'Team',   field: 'teamAbbrev', align: 'left',   sortable: false },
                { label: '',       field: 'oppAbbrev',  align: 'left',   sortable: false },
                { label: 'Opp',    field: 'oppAbbrev',  align: 'left',   sortable: false },
                { label: 'Result', field: 'isWin',      align: 'left',   sortable: false },
                { label: 'GS',     field: 'gs',         align: 'center', sortable: false },
                { label: 'MP',     field: 'mp',         align: 'right',  sortable: true },
                { label: 'FG',     field: 'fgm',        align: 'right',  sortable: true },
                { label: 'FGA',    field: 'fga',        align: 'right',  sortable: true },
                { label: 'FG%',    field: 'fgp',        align: 'right',  sortable: true },
                { label: '3P',     field: 'tpm',        align: 'right',  sortable: true },
                { label: '3PA',    field: 'tpa',        align: 'right',  sortable: true },
                { label: '3P%',    field: 'tpp',        align: 'right',  sortable: true },
                { label: '2P',     field: 'twom',       align: 'right',  sortable: true },
                { label: '2PA',    field: 'twoa',       align: 'right',  sortable: true },
                { label: '2P%',    field: 'twop',       align: 'right',  sortable: true },
                { label: 'eFG%',   field: 'efgp',       align: 'right',  sortable: true },
                { label: 'FT',     field: 'ftm',        align: 'right',  sortable: true },
                { label: 'FTA',    field: 'fta',        align: 'right',  sortable: true },
                { label: 'FT%',    field: 'ftp',        align: 'right',  sortable: true },
                { label: 'ORB',    field: 'orb',        align: 'right',  sortable: true },
                { label: 'DRB',    field: 'drb',        align: 'right',  sortable: true },
                { label: 'TRB',    field: 'trb',        align: 'right',  sortable: true },
                { label: 'AST',    field: 'ast',        align: 'right',  sortable: true },
                { label: 'STL',    field: 'stl',        align: 'right',  sortable: true },
                { label: 'BLK',    field: 'blk',        align: 'right',  sortable: true },
                { label: 'TOV',    field: 'tov',        align: 'right',  sortable: true },
                { label: 'PF',     field: 'pf',         align: 'right',  sortable: true },
                { label: 'PTS',    field: 'pts',        align: 'right',  sortable: true },
                { label: 'GmSc',   field: 'gmsc',       align: 'right',  sortable: true },
                { label: '+/-',    field: 'plusMinus',  align: 'right',  sortable: true },
              ].map((col, i) => (
                <th
                  key={i}
                  className={`px-3 py-3 font-semibold select-none transition-colors ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.sortable ? 'cursor-pointer hover:text-white' : 'cursor-default'} ${col.sortable && sortField === col.field ? 'text-indigo-400' : ''}`}
                  onClick={() => col.sortable && handleSort(col.field as keyof FeatEntry)}
                >
                  {col.label}
                  {col.sortable && sortField === col.field ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {paginatedData.length > 0 ? (
              paginatedData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-800/50 transition-colors whitespace-nowrap text-xs">
                  <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">{row.date}</td>
                  <td 
                    className="px-3 py-2 font-bold text-white cursor-pointer hover:text-indigo-400 transition-colors"
                    onClick={() => setSelectedPlayer(row.player)}
                  >
                    {row.playerName}
                  </td>
                  <td 
                    className="px-3 py-2 cursor-pointer hover:text-indigo-400 transition-colors"
                    onClick={() => navigateToTeam(row.teamId)}
                  >
                    {row.teamAbbrev}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{row.oppAbbrev.startsWith('@') ? '@' : ''}</td>
                  <td 
                    className="px-3 py-2 cursor-pointer hover:text-indigo-400 transition-colors"
                    onClick={() => navigateToTeam(row.oppTeamId)}
                  >
                    {row.oppAbbrev.replace('@', '')}
                  </td>
                  <td
                    className={`px-3 py-2 font-medium cursor-pointer hover:underline ${row.isWin ? 'text-emerald-400' : 'text-red-400'}`}
                    onClick={() => {
                      const sg = state.schedule.find((g: Game) => g.gid === row.gameId);
                      if (sg) handleGameClick(sg);
                    }}
                  >
                    {row.result}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-500">{row.gs ? '*' : ''}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.mp}</td>
                  <td className="px-3 py-2 text-right">{row.fgm}</td>
                  <td className="px-3 py-2 text-right">{row.fga}</td>
                  <td className="px-3 py-2 text-right">{row.fgp}</td>
                  <td className="px-3 py-2 text-right">{row.tpm}</td>
                  <td className="px-3 py-2 text-right">{row.tpa}</td>
                  <td className="px-3 py-2 text-right">{row.tpp}</td>
                  <td className="px-3 py-2 text-right">{row.twom}</td>
                  <td className="px-3 py-2 text-right">{row.twoa}</td>
                  <td className="px-3 py-2 text-right">{row.twop}</td>
                  <td className="px-3 py-2 text-right">{row.efgp}</td>
                  <td className="px-3 py-2 text-right">{row.ftm}</td>
                  <td className="px-3 py-2 text-right">{row.fta}</td>
                  <td className="px-3 py-2 text-right">{row.ftp}</td>
                  <td className="px-3 py-2 text-right">{row.orb}</td>
                  <td className="px-3 py-2 text-right">{row.drb}</td>
                  <td className="px-3 py-2 text-right">{row.trb}</td>
                  <td className="px-3 py-2 text-right">{row.ast}</td>
                  <td className="px-3 py-2 text-right">{row.stl}</td>
                  <td className="px-3 py-2 text-right">{row.blk}</td>
                  <td className="px-3 py-2 text-right">{row.tov}</td>
                  <td className="px-3 py-2 text-right">{row.pf}</td>
                  <td className="px-3 py-2 text-right font-bold text-white">{row.pts}</td>
                  <td className="px-3 py-2 text-right font-bold text-indigo-400">{row.gmsc.toFixed(1)}</td>
                  <td className={`px-3 py-2 text-right ${row.plusMinus != null && row.plusMinus > 0 ? 'text-emerald-400' : row.plusMinus != null && row.plusMinus < 0 ? 'text-red-400' : ''}`}>
                    {row.plusMinus != null ? (row.plusMinus > 0 ? `+${row.plusMinus}` : row.plusMinus) : '—'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={32} className="px-3 py-12 text-center text-slate-500 uppercase tracking-widest text-xs font-bold">
                  No statistical feats found matching criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── PAGINATION BAR ── */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 bg-[#080808] border-t border-white/10 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold hidden sm:inline-block">Show</span>
            <select 
              className="bg-black/50 border border-white/10 text-white text-xs font-bold rounded-md px-2 py-1 outline-none appearance-none text-center"
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center flex-1">
            Page {currentPage} <span className="text-slate-600">of</span> {totalPages} 
            <span className="hidden sm:inline"> • {filteredAndSorted.length} Results</span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-black/50 border border-white/10 text-white rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </button>
            <button 
              className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-black/50 border border-white/10 text-white rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedBoxScoreGame && (
        <BoxScoreModal
          game={selectedBoxScoreGame}
          result={state.boxScores.find(b => b.gameId === selectedBoxScoreGame.gid)}
          homeTeam={state.teams.find(t => t.id === selectedBoxScoreGame.homeTid)!}
          awayTeam={state.teams.find(t => t.id === selectedBoxScoreGame.awayTid)!}
          players={state.players}
          onClose={() => setSelectedBoxScoreGame(null)}
          onPlayerClick={(player) => {
            setSelectedBoxScoreGame(null);
            setSelectedPlayer(player);
          }}
        />
      )}
    </div>
  );
};