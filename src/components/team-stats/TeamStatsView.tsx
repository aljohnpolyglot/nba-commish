import React, { useMemo, useState, useEffect } from 'react';
import { useGame } from '../../store/GameContext';
import { ArrowUpDown, Search, X, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { NBATeam } from '../../types';
import { evaluateFilter } from '../../utils/filterUtils';
import { getOwnTeamId } from '../../utils/helpers';

type StatType = 'team' | 'opponent' | 'shotLocations' | 'oppShotLocations' | 'advanced';
type Phase = 'regular' | 'playoffs' | 'all';

interface TeamStatRow {
  team: NBATeam;
  g: number; wins: number; losses: number; winPct: number; age: number;
  // team basic (per game)
  pts: number; oppg: number; mov: number;
  fgm: number; fga: number; fgp: number;
  tpm: number; tpa: number; tpp: number;
  twom: number; twoa: number; twop: number;
  ftm: number; fta: number; ftp: number;
  orb: number; drb: number; trb: number;
  ast: number; stl: number; blk: number; tov: number; pf: number;
  // opponent basic (per game)
  oppFgm: number; oppFga: number; oppFgp: number;
  oppTpm: number; oppTpa: number; oppTpp: number;
  oppTwom: number; oppTwoa: number; oppTwop: number;
  oppFtm: number; oppFta: number; oppFtp: number;
  oppOrb: number; oppDrb: number; oppTrb: number;
  oppAst: number; oppStl: number; oppBlk: number; oppTov: number; oppPf: number;
  // shot locations team (per game)
  rimFgm: number; rimFga: number; rimFgp: number;
  lpFgm: number; lpFga: number; lpFgp: number;
  mrFgm: number; mrFga: number; mrFgp: number;
  slTpm: number; slTpa: number; slTpp: number;
  dd: number; td: number; qd: number; fiveX5: number;
  // shot locations opp (per game)
  oppRimFgm: number; oppRimFga: number; oppRimFgp: number;
  oppLpFgm: number; oppLpFga: number; oppLpFgp: number;
  oppMrFgm: number; oppMrFga: number; oppMrFgp: number;
  oppSlTpm: number; oppSlTpa: number; oppSlTpp: number;
  oppDd: number; oppTd: number; oppQd: number; oppFiveX5: number;
  // advanced
  pw: number; pl: number;
  ortg: number; drtg: number; nrtg: number; pace: number;
  threePar: number; ftr: number; tsPct: number; efgPct: number;
  tovPct: number; orbPct: number; ftFga: number;
  dEfgPct: number; dTovPct: number; drbPct: number; dFtFga: number;
}

function seasonYearFromDate(dateStr: string): number {
  const d = new Date(dateStr);
  const yr = d.getFullYear();
  return d.getMonth() < 9 ? yr : yr + 1;
}

function countFeats(pts: number, reb: number, ast: number, stl: number, blk: number) {
  const c10 = [pts >= 10, reb >= 10, ast >= 10, stl >= 10, blk >= 10].filter(Boolean).length;
  const c5  = [pts >= 5,  reb >= 5,  ast >= 5,  stl >= 5,  blk >= 5 ].filter(Boolean).length;
  return { dd: c10 >= 2 ? 1 : 0, td: c10 >= 3 ? 1 : 0, qd: c10 >= 4 ? 1 : 0, fiveX5: c5 === 5 ? 1 : 0 };
}

export const TeamStatsView: React.FC = () => {
  const { state, navigateToTeam, pendingStatSort, setPendingStatSort } = useGame();
  const ownTid = getOwnTeamId(state);

  const [statType, setStatType]     = useState<StatType>('team');
  const [season,   setSeason]       = useState<number | 'all'>(state.leagueStats.year);
  useEffect(() => { setSeason(state.leagueStats.year); }, [state.leagueStats.year]);
  const [phase,    setPhase]        = useState<Phase>('regular');
  const [sortField, setSortField]   = useState<string>('pts');
  const [sortOrder, setSortOrder]   = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters]     = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const availableSeasons = useMemo(() => {
    const years = new Set<number>();
    (state.boxScores as any[]).forEach(g => { if (g.date) years.add(seasonYearFromDate(g.date)); });
    return ['all' as const, ...Array.from(years).sort((a, b) => b - a)];
  }, [state.boxScores]);

  const seasonIndex = availableSeasons.indexOf(season as any);

  useEffect(() => {
    if (pendingStatSort?.type === 'team') {
      setSortField(pendingStatSort.field);
      setSortOrder(pendingStatSort.order);
      const advFields = ['ortg','drtg','nrtg','pace','tsPct','efgPct','pw','pl','threePar','ftr'];
      if (advFields.includes(pendingStatSort.field)) setStatType('advanced');
      setPendingStatSort(null);
    }
  }, [pendingStatSort, setPendingStatSort]);

  const playerAgeMap = useMemo(() => {
    const m = new Map<string, number>();
    state.players.forEach(p => { if (p.internalId) m.set(p.internalId, p.age ?? 25); });
    return m;
  }, [state.players]);

  const teamStats = useMemo((): TeamStatRow[] => {
    type Acc = {
      team: NBATeam; g: number; wins: number; losses: number;
      fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
      orb: number; drb: number; trb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
      ptsPlayer: number; ptsActual: number; oppPtsActual: number; min: number;
      oppFgm: number; oppFga: number; oppTpm: number; oppTpa: number; oppFtm: number; oppFta: number;
      oppOrb: number; oppDrb: number; oppTrb: number; oppAst: number; oppStl: number; oppBlk: number; oppTov: number; oppPf: number; oppPtsPlayer: number;
      rimFgm: number; rimFga: number; lpFgm: number; lpFga: number; mrFgm: number; mrFga: number;
      dd: number; td: number; qd: number; fiveX5: number;
      oppRimFgm: number; oppRimFga: number; oppLpFgm: number; oppLpFga: number; oppMrFgm: number; oppMrFga: number;
      oppDd: number; oppTd: number; oppQd: number; oppFiveX5: number;
      ageMinSum: number; ageMinTotal: number;
    };

    const zero = (team: NBATeam): Acc => ({
      team, g: 0, wins: 0, losses: 0,
      fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,orb:0,drb:0,trb:0,ast:0,stl:0,blk:0,tov:0,pf:0,
      ptsPlayer:0,ptsActual:0,oppPtsActual:0,min:0,
      oppFgm:0,oppFga:0,oppTpm:0,oppTpa:0,oppFtm:0,oppFta:0,
      oppOrb:0,oppDrb:0,oppTrb:0,oppAst:0,oppStl:0,oppBlk:0,oppTov:0,oppPf:0,oppPtsPlayer:0,
      rimFgm:0,rimFga:0,lpFgm:0,lpFga:0,mrFgm:0,mrFga:0,
      dd:0,td:0,qd:0,fiveX5:0,
      oppRimFgm:0,oppRimFga:0,oppLpFgm:0,oppLpFga:0,oppMrFgm:0,oppMrFga:0,
      oppDd:0,oppTd:0,oppQd:0,oppFiveX5:0,
      ageMinSum:0,ageMinTotal:0,
    });

    const acc = new Map<number, Acc>();
    state.teams.forEach(t => acc.set(t.id, zero(t)));

    const addPlayers = (a: Acc, ownStats: any[], oppStats: any[]) => {
      ownStats.forEach(ps => {
        const reb = ps.reb ?? ps.trb ?? (ps.orb || 0) + (ps.drb || 0);
        a.fgm += ps.fgm || 0; a.fga += ps.fga || 0;
        a.tpm += ps.threePm || 0; a.tpa += ps.threePa || 0;
        a.ftm += ps.ftm || 0;  a.fta += ps.fta || 0;
        a.orb += ps.orb || 0;  a.drb += ps.drb || 0; a.trb += reb;
        a.ast += ps.ast || 0;  a.stl += ps.stl || 0; a.blk += ps.blk || 0;
        a.tov += ps.tov || 0;  a.pf  += ps.pf  || 0;
        a.ptsPlayer += ps.pts || 0; a.min += ps.min || 0;
        a.rimFgm += ps.fgAtRim   || 0; a.rimFga += ps.fgaAtRim   || 0;
        a.lpFgm  += ps.fgLowPost || 0; a.lpFga  += ps.fgaLowPost || 0;
        a.mrFgm  += ps.fgMidRange|| 0; a.mrFga  += ps.fgaMidRange|| 0;
        const f = countFeats(ps.pts || 0, reb, ps.ast || 0, ps.stl || 0, ps.blk || 0);
        a.dd += f.dd; a.td += f.td; a.qd += f.qd; a.fiveX5 += f.fiveX5;
        const pid = ps.playerId || ps.internalId;
        const age = pid ? (playerAgeMap.get(pid) ?? 25) : 25;
        a.ageMinSum += age * (ps.min || 0); a.ageMinTotal += ps.min || 0;
      });
      oppStats.forEach(ps => {
        const reb = ps.reb ?? ps.trb ?? (ps.orb || 0) + (ps.drb || 0);
        a.oppFgm += ps.fgm || 0; a.oppFga += ps.fga || 0;
        a.oppTpm += ps.threePm || 0; a.oppTpa += ps.threePa || 0;
        a.oppFtm += ps.ftm || 0;  a.oppFta += ps.fta || 0;
        a.oppOrb += ps.orb || 0;  a.oppDrb += ps.drb || 0; a.oppTrb += reb;
        a.oppAst += ps.ast || 0;  a.oppStl += ps.stl || 0; a.oppBlk += ps.blk || 0;
        a.oppTov += ps.tov || 0;  a.oppPf  += ps.pf  || 0;
        a.oppPtsPlayer += ps.pts || 0;
        a.oppRimFgm += ps.fgAtRim   || 0; a.oppRimFga += ps.fgaAtRim   || 0;
        a.oppLpFgm  += ps.fgLowPost || 0; a.oppLpFga  += ps.fgaLowPost || 0;
        a.oppMrFgm  += ps.fgMidRange|| 0; a.oppMrFga  += ps.fgaMidRange|| 0;
        const f = countFeats(ps.pts || 0, reb, ps.ast || 0, ps.stl || 0, ps.blk || 0);
        a.oppDd += f.dd; a.oppTd += f.td; a.oppQd += f.qd; a.oppFiveX5 += f.fiveX5;
      });
    };

    (state.boxScores as any[]).forEach(game => {
      if (game.isAllStar || game.isRisingStars || game.isCelebrityGame || game.isPreseason) return;
      if (season !== 'all' && game.date && seasonYearFromDate(game.date) !== season) return;
      const isPO = !!(game.isPlayoff || game.isPlayIn);
      if (phase === 'regular' && isPO) return;
      if (phase === 'playoffs' && !isPO) return;

      const home = acc.get(game.homeTeamId);
      const away = acc.get(game.awayTeamId);
      const hStats = game.homeStats || []; const aStats = game.awayStats || [];

      if (home) {
        home.g++; home.wins += game.homeScore > game.awayScore ? 1 : 0;
        home.losses += game.homeScore < game.awayScore ? 1 : 0;
        home.ptsActual += game.homeScore || 0; home.oppPtsActual += game.awayScore || 0;
        addPlayers(home, hStats, aStats);
      }
      if (away) {
        away.g++; away.wins += game.awayScore > game.homeScore ? 1 : 0;
        away.losses += game.awayScore < game.homeScore ? 1 : 0;
        away.ptsActual += game.awayScore || 0; away.oppPtsActual += game.homeScore || 0;
        addPlayers(away, aStats, hStats);
      }
    });

    return Array.from(acc.values()).map(a => {
      const g = a.g || 1;
      const twomT = a.fgm - a.tpm; const twoaT = a.fga - a.tpa;
      const oppTwomT = a.oppFgm - a.oppTpm; const oppTwoaT = a.oppFga - a.oppTpa;
      const fgp  = a.fga > 0 ? a.fgm / a.fga : 0;
      const tpp  = a.tpa > 0 ? a.tpm / a.tpa : 0;
      const ftp  = a.fta > 0 ? a.ftm / a.fta : 0;
      const twop = twoaT > 0 ? twomT / twoaT : 0;
      const oppFgp  = a.oppFga > 0 ? a.oppFgm / a.oppFga : 0;
      const oppTpp  = a.oppTpa > 0 ? a.oppTpm / a.oppTpa : 0;
      const oppFtp  = a.oppFta > 0 ? a.oppFtm / a.oppFta : 0;
      const oppTwop = oppTwoaT > 0 ? oppTwomT / oppTwoaT : 0;

      const tmPoss  = a.fga - a.orb + a.tov + 0.44 * a.fta;
      const oppPoss = a.oppFga - a.oppOrb + a.oppTov + 0.44 * a.oppFta;
      const minPerGame = a.min > 0 ? a.min / (5 * g) : 48;
      const avgPoss = (tmPoss + oppPoss) / 2;
      const pace = minPerGame > 0 ? 48 * avgPoss / (g * minPerGame) : 0;
      const ortg = tmPoss  > 0 ? 100 * a.ptsActual    / tmPoss  : 0;
      const drtg = oppPoss > 0 ? 100 * a.oppPtsActual / oppPoss : 0;
      const nrtg = ortg - drtg;

      const pytExp = 13.91;
      const pw = (a.ptsActual > 0 || a.oppPtsActual > 0)
        ? g * Math.pow(a.ptsActual, pytExp) / (Math.pow(a.ptsActual, pytExp) + Math.pow(a.oppPtsActual, pytExp))
        : 0;

      const tsPct  = (a.fga + 0.44 * a.fta) > 0 ? a.ptsPlayer / (2 * (a.fga + 0.44 * a.fta)) : 0;
      const efgPct = a.fga > 0 ? (a.fgm + 0.5 * a.tpm) / a.fga : 0;
      const tovPct = tmPoss > 0 ? 100 * a.tov / tmPoss : 0;
      const orbPct = (a.orb + a.oppDrb) > 0 ? 100 * a.orb / (a.orb + a.oppDrb) : 0;
      const ftFga  = a.fga > 0 ? a.ftm / a.fga : 0;
      const threePar = a.fga > 0 ? a.tpa / a.fga : 0;
      const ftr     = a.fga > 0 ? a.fta / a.fga : 0;
      const dEfgPct = a.oppFga > 0 ? (a.oppFgm + 0.5 * a.oppTpm) / a.oppFga : 0;
      const dTovPct = oppPoss > 0 ? 100 * a.oppTov / oppPoss : 0;
      const drbPct  = (a.drb + a.oppOrb) > 0 ? 100 * a.drb / (a.drb + a.oppOrb) : 0;
      const dFtFga  = a.oppFga > 0 ? a.oppFtm / a.oppFga : 0;
      const age = a.ageMinTotal > 0 ? a.ageMinSum / a.ageMinTotal : 0;

      return {
        team: a.team, g: a.g, wins: a.wins, losses: a.losses,
        winPct: (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0, age,
        pts: a.ptsActual / g, oppg: a.oppPtsActual / g, mov: (a.ptsActual - a.oppPtsActual) / g,
        fgm: a.fgm/g, fga: a.fga/g, fgp,
        tpm: a.tpm/g, tpa: a.tpa/g, tpp,
        twom: twomT/g, twoa: twoaT/g, twop,
        ftm: a.ftm/g, fta: a.fta/g, ftp,
        orb: a.orb/g, drb: a.drb/g, trb: a.trb/g,
        ast: a.ast/g, stl: a.stl/g, blk: a.blk/g, tov: a.tov/g, pf: a.pf/g,
        oppFgm: a.oppFgm/g, oppFga: a.oppFga/g, oppFgp,
        oppTpm: a.oppTpm/g, oppTpa: a.oppTpa/g, oppTpp,
        oppTwom: oppTwomT/g, oppTwoa: oppTwoaT/g, oppTwop,
        oppFtm: a.oppFtm/g, oppFta: a.oppFta/g, oppFtp,
        oppOrb: a.oppOrb/g, oppDrb: a.oppDrb/g, oppTrb: a.oppTrb/g,
        oppAst: a.oppAst/g, oppStl: a.oppStl/g, oppBlk: a.oppBlk/g, oppTov: a.oppTov/g, oppPf: a.oppPf/g,
        rimFgm: a.rimFgm/g, rimFga: a.rimFga/g, rimFgp: a.rimFga > 0 ? a.rimFgm/a.rimFga : 0,
        lpFgm:  a.lpFgm/g,  lpFga:  a.lpFga/g,  lpFgp:  a.lpFga  > 0 ? a.lpFgm/a.lpFga   : 0,
        mrFgm:  a.mrFgm/g,  mrFga:  a.mrFga/g,  mrFgp:  a.mrFga  > 0 ? a.mrFgm/a.mrFga   : 0,
        slTpm: a.tpm/g, slTpa: a.tpa/g, slTpp: tpp,
        dd: a.dd, td: a.td, qd: a.qd, fiveX5: a.fiveX5,
        oppRimFgm: a.oppRimFgm/g, oppRimFga: a.oppRimFga/g, oppRimFgp: a.oppRimFga > 0 ? a.oppRimFgm/a.oppRimFga : 0,
        oppLpFgm:  a.oppLpFgm/g,  oppLpFga:  a.oppLpFga/g,  oppLpFgp:  a.oppLpFga  > 0 ? a.oppLpFgm/a.oppLpFga  : 0,
        oppMrFgm:  a.oppMrFgm/g,  oppMrFga:  a.oppMrFga/g,  oppMrFgp:  a.oppMrFga  > 0 ? a.oppMrFgm/a.oppMrFga  : 0,
        oppSlTpm: a.oppTpm/g, oppSlTpa: a.oppTpa/g, oppSlTpp: oppTpp,
        oppDd: a.oppDd, oppTd: a.oppTd, oppQd: a.oppQd, oppFiveX5: a.oppFiveX5,
        pw, pl: a.g - pw, ortg, drtg, nrtg, pace, threePar, ftr, tsPct, efgPct,
        tovPct, orbPct, ftFga, dEfgPct, dTovPct, drbPct, dFtFga,
      };
    });
  }, [state.teams, state.boxScores, season, phase, playerAgeMap]);

  const sortedStats = useMemo(() => {
    const filtered = teamStats.filter(row => {
      if (searchTerm && !row.team.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      for (const [col, filterStr] of Object.entries(columnFilters)) {
        if (!filterStr) continue;
        if (col === 'team') {
          if (!evaluateFilter(row.team.name, filterStr) && !evaluateFilter((row.team as any).abbrev ?? '', filterStr)) return false;
        } else {
          if (!evaluateFilter(String((row as any)[col] ?? ''), filterStr)) return false;
        }
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      let va: any = sortField === 'team' ? a.team.name : (a as any)[sortField] ?? 0;
      let vb: any = sortField === 'team' ? b.team.name : (b as any)[sortField] ?? 0;
      if (va < vb) return sortOrder === 'asc' ? -1 : 1;
      if (va > vb) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [teamStats, sortField, sortOrder, searchTerm, columnFilters]);

  const handleSort = (field: string) => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  const renderSortIcon = (field: string) =>
    sortField !== field
      ? <ArrowUpDown size={12} className="opacity-30" />
      : <ArrowUpDown size={12} className={`text-indigo-400 ${sortOrder === 'asc' ? 'rotate-180' : ''} transition-transform`} />;

  const TH_BASE = "px-2 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white active:text-white transition-colors whitespace-nowrap touch-manipulation text-right";
  const TH_GRP  = "px-2 py-1 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center border-l border-slate-700";
  const TH_NC   = "px-2 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap";

  const renderFilterInput = (col: string) => !showFilters ? null : (
    <input type="text" value={columnFilters[col] || ''}
      onChange={e => { e.stopPropagation(); setColumnFilters(p => ({ ...p, [col]: e.target.value })); }}
      onClick={e => e.stopPropagation()}
      className="mt-1 w-full bg-slate-800 text-white text-[10px] px-1.5 py-1 rounded border border-slate-700 focus:outline-none focus:border-indigo-500"
      placeholder="Filter..." />
  );

  const Th = ({ field, label, left }: { field: string; label: string; left?: boolean }) => (
    <th className={TH_BASE + (left ? ' text-left' : '')} onClick={() => handleSort(field)}>
      <div className={`flex items-center gap-1 ${left ? '' : 'justify-end'}`}>{label} {renderSortIcon(field)}</div>
      {renderFilterInput(field)}
    </th>
  );

  const fn  = (n: number, d = 1) => n.toFixed(d);
  const fp  = (n: number, d = 1) => (n * 100).toFixed(d);
  const fP  = (n: number) => n.toFixed(3).replace(/^0/, '');
  const fPc = (n: number) => (n * 100).toFixed(1) + '%';

  const activeFilterCount = Object.values(columnFilters).filter(v => v).length + (searchTerm ? 1 : 0);
  const clearFilters = () => { setColumnFilters({}); setSearchTerm(''); };
  const navSeason = (dir: 1 | -1) => { const i = seasonIndex + dir; if (i >= 0 && i < availableSeasons.length) setSeason(availableSeasons[i]); };
  const seasonLabel = season === 'all' ? 'All' : `${(season as number) - 1}–${String(season).slice(-2)}`;

  const commonThs = (
    <>
      <th className="px-2 py-2 text-right text-slate-600 text-[11px] w-8 sticky left-0 bg-slate-900 z-30">#</th>
      <Th field="team" label="Team" left />
      <Th field="g"       label="G"   />
      <Th field="wins"    label="W"   />
      <Th field="losses"  label="L"   />
      <Th field="winPct"  label="%"   />
      <Th field="age"     label="Age" />
    </>
  );

  const commonTds = (row: TeamStatRow, idx: number, isOwn: boolean) => (
    <>
      <td className={`px-2 py-1.5 text-right text-slate-600 text-[11px] sticky left-0 z-10 ${isOwn ? 'bg-indigo-950/60' : 'bg-slate-950'}`}>{idx + 1}</td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <button onClick={() => navigateToTeam(row.team.id)} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity text-left">
          {(row.team as any).logoUrl && <img src={(row.team as any).logoUrl} alt={row.team.name} className="w-4 h-4 object-contain" />}
          <span className="font-bold text-white">{row.team.name}</span>
          {isOwn && <span className="text-[8px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1 py-0.5 rounded border border-indigo-500/40">You</span>}
        </button>
      </td>
      <td className="px-2 py-1.5 text-right text-slate-300">{row.g}</td>
      <td className="px-2 py-1.5 text-right text-slate-300">{row.wins}</td>
      <td className="px-2 py-1.5 text-right text-slate-300">{row.losses}</td>
      <td className="px-2 py-1.5 text-right text-indigo-300">{fP(row.winPct)}</td>
      <td className="px-2 py-1.5 text-right text-slate-300">{fn(row.age)}</td>
    </>
  );

  const renderThead = () => {
    if (statType === 'shotLocations' || statType === 'oppShotLocations') {
      const px = statType === 'oppShotLocations' ? 'opp' : '';
      const cap = (s: string) => px ? px + s.charAt(0).toUpperCase() + s.slice(1) : s;
      return (
        <thead className="sticky top-0 z-20 bg-slate-900">
          <tr className="border-b border-slate-700/50">
            <th colSpan={7} className={TH_NC} />
            <th colSpan={3} className={TH_GRP}>At Rim</th>
            <th colSpan={3} className={TH_GRP}>Low Post</th>
            <th colSpan={3} className={TH_GRP}>Mid-Range</th>
            <th colSpan={3} className={TH_GRP}>3-Pointers</th>
            <th colSpan={4} className={TH_GRP}>Feats</th>
          </tr>
          <tr className="border-b-2 border-slate-700">
            {commonThs}
            <Th field={cap('rimFgm')} label="M" /><Th field={cap('rimFga')} label="A" /><Th field={cap('rimFgp')} label="%" />
            <Th field={cap('lpFgm')}  label="M" /><Th field={cap('lpFga')}  label="A" /><Th field={cap('lpFgp')}  label="%" />
            <Th field={cap('mrFgm')}  label="M" /><Th field={cap('mrFga')}  label="A" /><Th field={cap('mrFgp')}  label="%" />
            <Th field={cap('slTpm')}  label="M" /><Th field={cap('slTpa')}  label="A" /><Th field={cap('slTpp')}  label="%" />
            <Th field={cap('dd')}     label="DD"  />
            <Th field={cap('td')}     label="TD"  />
            <Th field={cap('qd')}     label="QD"  />
            <Th field={cap('fiveX5')} label="5×5" />
          </tr>
        </thead>
      );
    }

    if (statType === 'advanced') {
      return (
        <thead className="sticky top-0 z-20 bg-slate-900">
          <tr className="border-b border-slate-700/50">
            <th colSpan={7} className={TH_NC} />
            <th colSpan={7} className={TH_GRP}>Ratings</th>
            <th colSpan={4} className={TH_GRP}>Off Four Factors</th>
            <th colSpan={4} className={TH_GRP}>Def Four Factors</th>
          </tr>
          <tr className="border-b-2 border-slate-700">
            {commonThs}
            <Th field="pw"      label="PW"    />
            <Th field="pl"      label="PL"    />
            <Th field="ortg"    label="ORtg"  />
            <Th field="drtg"    label="DRtg"  />
            <Th field="nrtg"    label="NRtg"  />
            <Th field="pace"    label="Pace"  />
            <Th field="threePar" label="3PAr" />
            <Th field="ftr"     label="FTr"   />
            <Th field="efgPct"  label="eFG%"  />
            <Th field="tovPct"  label="TOV%"  />
            <Th field="orbPct"  label="ORB%"  />
            <Th field="ftFga"   label="FT/FGA"/>
            <Th field="dEfgPct" label="eFG%"  />
            <Th field="dTovPct" label="TOV%"  />
            <Th field="drbPct"  label="DRB%"  />
            <Th field="dFtFga"  label="FT/FGA"/>
          </tr>
        </thead>
      );
    }

    const isOpp = statType === 'opponent';
    return (
      <thead className="sticky top-0 z-20 bg-slate-900">
        <tr className="border-b-2 border-slate-700">
          {commonThs}
          <Th field="pts"  label={isOpp ? 'OPPG' : 'PTS'} />
          <Th field="oppg" label={isOpp ? 'PPG'  : 'OPP'} />
          <Th field="mov"  label="MOV" />
          <Th field={isOpp ? 'oppFgm'  : 'fgm'}  label="FG"   />
          <Th field={isOpp ? 'oppFga'  : 'fga'}  label="FGA"  />
          <Th field={isOpp ? 'oppFgp'  : 'fgp'}  label="FG%"  />
          <Th field={isOpp ? 'oppTpm'  : 'tpm'}  label="3P"   />
          <Th field={isOpp ? 'oppTpa'  : 'tpa'}  label="3PA"  />
          <Th field={isOpp ? 'oppTpp'  : 'tpp'}  label="3P%"  />
          <Th field={isOpp ? 'oppTwom' : 'twom'} label="2P"   />
          <Th field={isOpp ? 'oppTwoa' : 'twoa'} label="2PA"  />
          <Th field={isOpp ? 'oppTwop' : 'twop'} label="2P%"  />
          <Th field={isOpp ? 'oppFtm'  : 'ftm'}  label="FT"   />
          <Th field={isOpp ? 'oppFta'  : 'fta'}  label="FTA"  />
          <Th field={isOpp ? 'oppFtp'  : 'ftp'}  label="FT%"  />
          <Th field={isOpp ? 'oppOrb'  : 'orb'}  label="ORB"  />
          <Th field={isOpp ? 'oppDrb'  : 'drb'}  label="DRB"  />
          <Th field={isOpp ? 'oppTrb'  : 'trb'}  label="TRB"  />
          <Th field={isOpp ? 'oppAst'  : 'ast'}  label="AST"  />
          <Th field={isOpp ? 'oppStl'  : 'stl'}  label="STL"  />
          <Th field={isOpp ? 'oppBlk'  : 'blk'}  label="BLK"  />
          <Th field={isOpp ? 'oppTov'  : 'tov'}  label="TOV"  />
          <Th field={isOpp ? 'oppPf'   : 'pf'}   label="PF"   />
        </tr>
      </thead>
    );
  };

  const renderRowCells = (row: TeamStatRow) => {
    const tc  = "px-2 py-1.5 text-right text-slate-300";
    const tca = "px-2 py-1.5 text-right text-indigo-300";

    if (statType === 'shotLocations' || statType === 'oppShotLocations') {
      const isO = statType === 'oppShotLocations';
      const rim   = isO ? [row.oppRimFgm, row.oppRimFga, row.oppRimFgp] : [row.rimFgm, row.rimFga, row.rimFgp];
      const lp    = isO ? [row.oppLpFgm,  row.oppLpFga,  row.oppLpFgp]  : [row.lpFgm,  row.lpFga,  row.lpFgp];
      const mr    = isO ? [row.oppMrFgm,  row.oppMrFga,  row.oppMrFgp]  : [row.mrFgm,  row.mrFga,  row.mrFgp];
      const tp    = isO ? [row.oppSlTpm,  row.oppSlTpa,  row.oppSlTpp]  : [row.slTpm,  row.slTpa,  row.slTpp];
      const feats = isO ? [row.oppDd, row.oppTd, row.oppQd, row.oppFiveX5] : [row.dd, row.td, row.qd, row.fiveX5];
      return (
        <>
          <td className={tc}>{fn(rim[0])}</td><td className={tc}>{fn(rim[1])}</td><td className={tca}>{fPc(rim[2])}</td>
          <td className={tc}>{fn(lp[0])}</td> <td className={tc}>{fn(lp[1])}</td> <td className={tca}>{fPc(lp[2])}</td>
          <td className={tc}>{fn(mr[0])}</td> <td className={tc}>{fn(mr[1])}</td> <td className={tca}>{fPc(mr[2])}</td>
          <td className={tc}>{fn(tp[0])}</td> <td className={tc}>{fn(tp[1])}</td> <td className={tca}>{fPc(tp[2])}</td>
          <td className={tc}>{fn(feats[0], 0)}</td><td className={tc}>{fn(feats[1], 0)}</td>
          <td className={tc}>{fn(feats[2], 0)}</td><td className={tc}>{fn(feats[3], 0)}</td>
        </>
      );
    }

    if (statType === 'advanced') {
      return (
        <>
          <td className={tca}>{fn(row.pw)}</td>
          <td className="px-2 py-1.5 text-right text-rose-300">{fn(row.pl)}</td>
          <td className="px-2 py-1.5 text-right font-bold text-white">{fn(row.ortg)}</td>
          <td className="px-2 py-1.5 text-right font-bold text-slate-300">{fn(row.drtg)}</td>
          <td className={`px-2 py-1.5 text-right font-bold ${row.nrtg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {row.nrtg > 0 ? '+' : ''}{fn(row.nrtg)}
          </td>
          <td className={tc}>{fn(row.pace)}</td>
          <td className={tc}>{fPc(row.threePar)}</td>
          <td className={tc}>{fPc(row.ftr)}</td>
          <td className={tca}>{fPc(row.efgPct)}</td>
          <td className={`px-2 py-1.5 text-right ${row.tovPct > 15 ? 'text-rose-300' : 'text-slate-300'}`}>{fn(row.tovPct)}%</td>
          <td className={tc}>{fn(row.orbPct)}%</td>
          <td className={tc}>{fn(row.ftFga, 3).replace(/^0/, '')}</td>
          <td className="px-2 py-1.5 text-right text-rose-300">{fPc(row.dEfgPct)}</td>
          <td className={tc}>{fn(row.dTovPct)}%</td>
          <td className={tc}>{fn(row.drbPct)}%</td>
          <td className={tc}>{fn(row.dFtFga, 3).replace(/^0/, '')}</td>
        </>
      );
    }

    const isOpp = statType === 'opponent';
    const ptsDisp = isOpp ? row.oppg : row.pts;
    const oppDisp = isOpp ? row.pts  : row.oppg;
    const fgm  = isOpp ? row.oppFgm  : row.fgm;  const fga  = isOpp ? row.oppFga  : row.fga;  const fgp  = isOpp ? row.oppFgp  : row.fgp;
    const tpm  = isOpp ? row.oppTpm  : row.tpm;  const tpa  = isOpp ? row.oppTpa  : row.tpa;  const tpp  = isOpp ? row.oppTpp  : row.tpp;
    const twom = isOpp ? row.oppTwom : row.twom; const twoa = isOpp ? row.oppTwoa : row.twoa; const twop = isOpp ? row.oppTwop : row.twop;
    const ftm  = isOpp ? row.oppFtm  : row.ftm;  const fta  = isOpp ? row.oppFta  : row.fta;  const ftp  = isOpp ? row.oppFtp  : row.ftp;
    const orb  = isOpp ? row.oppOrb  : row.orb;  const drb  = isOpp ? row.oppDrb  : row.drb;  const trb  = isOpp ? row.oppTrb  : row.trb;
    const ast  = isOpp ? row.oppAst  : row.ast;  const stl  = isOpp ? row.oppStl  : row.stl;  const blk  = isOpp ? row.oppBlk  : row.blk;
    const tov  = isOpp ? row.oppTov  : row.tov;  const pf   = isOpp ? row.oppPf   : row.pf;

    return (
      <>
        <td className="px-2 py-1.5 text-right font-bold text-white">{fn(ptsDisp)}</td>
        <td className={tc}>{fn(oppDisp)}</td>
        <td className={`px-2 py-1.5 text-right font-bold ${row.mov >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {row.mov > 0 ? '+' : ''}{fn(row.mov)}
        </td>
        <td className={tc}>{fn(fgm)}</td><td className={tc}>{fn(fga)}</td><td className={tca}>{fP(fgp)}</td>
        <td className={tc}>{fn(tpm)}</td><td className={tc}>{fn(tpa)}</td><td className={tca}>{fP(tpp)}</td>
        <td className={tc}>{fn(twom)}</td><td className={tc}>{fn(twoa)}</td><td className={tca}>{fP(twop)}</td>
        <td className={tc}>{fn(ftm)}</td><td className={tc}>{fn(fta)}</td><td className={tca}>{fP(ftp)}</td>
        <td className={tc}>{fn(orb)}</td><td className={tc}>{fn(drb)}</td><td className={tc}>{fn(trb)}</td>
        <td className={tc}>{fn(ast)}</td>
        <td className="px-2 py-1.5 text-right text-emerald-300/80">{fn(stl)}</td>
        <td className="px-2 py-1.5 text-right text-emerald-300/80">{fn(blk)}</td>
        <td className="px-2 py-1.5 text-right text-rose-300/80">{fn(tov)}</td>
        <td className="px-2 py-1.5 text-right text-slate-500">{fn(pf)}</td>
      </>
    );
  };

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-200">

      {/* ── Header controls (BBGM-style, mirrors PlayerStatsView) ── */}
      <div className="shrink-0 px-3 sm:px-4 py-2.5 border-b border-slate-800 bg-slate-950">
        {/* Row 1 — title + mobile search */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">Team Stats</h2>
          <div className="relative sm:hidden">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
            <input type="text" placeholder="Search..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white rounded pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 w-32" />
          </div>
        </div>

        {/* Row 2 — filter selectors */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Season selector with arrows */}
          <div className="flex items-center gap-0">
            <button onClick={() => navSeason(-1)} disabled={seasonIndex <= 0}
              className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-white active:text-white bg-slate-900 border border-slate-700 rounded-l transition-colors disabled:opacity-30">
              <ChevronLeft size={12} />
            </button>
            <select value={season}
              onChange={e => {
                const v = e.target.value;
                setSeason(v === 'all' ? 'all' : Number(v));
              }}
              className="h-7 bg-slate-900 border-y border-slate-700 text-white text-xs px-1.5 focus:outline-none focus:border-indigo-500 appearance-none min-w-[70px]"
            >
              <option value="all">All Time</option>
              {availableSeasons.filter(s => s !== 'all').map(s => (
                <option key={s} value={s as number}>{(s as number) - 1}–{String(s).slice(2)}</option>
              ))}
            </select>
            <button onClick={() => navSeason(1)} disabled={seasonIndex >= availableSeasons.length - 1}
              className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-white active:text-white bg-slate-900 border border-slate-700 rounded-r transition-colors disabled:opacity-30">
              <ChevronRight size={12} />
            </button>
          </div>

          {/* Stat type */}
          <select value={statType}
            onChange={e => {
              const t = e.target.value as StatType;
              setStatType(t);
              setSortField(t === 'opponent' ? 'oppg' : t === 'advanced' ? 'nrtg' : t === 'shotLocations' ? 'dd' : t === 'oppShotLocations' ? 'oppDd' : 'pts');
            }}
            className="h-7 bg-slate-900 border border-slate-700 text-white text-xs px-1.5 rounded focus:outline-none focus:border-indigo-500 appearance-none"
          >
            <option value="team">Team</option>
            <option value="opponent">Opponent</option>
            <option value="shotLocations">Shot Locations & Feats</option>
            <option value="oppShotLocations">Opp. Shot Locations</option>
            <option value="advanced">Advanced</option>
          </select>

          {/* Phase */}
          <select value={phase} onChange={e => setPhase(e.target.value as Phase)}
            className="h-7 bg-slate-900 border border-slate-700 text-white text-xs px-1.5 rounded focus:outline-none focus:border-indigo-500 appearance-none"
          >
            <option value="regular">Reg Season</option>
            <option value="playoffs">Playoffs</option>
            <option value="all">Combined</option>
          </select>

          {/* Desktop search */}
          <div className="relative hidden sm:block ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
            <input type="text" placeholder="Search..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white rounded pl-8 pr-8 py-1.5 text-xs focus:outline-none focus:border-indigo-500 w-44 transition-all" />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <button onClick={() => setShowFilters(f => !f)}
            className={`h-7 w-7 flex items-center justify-center rounded border transition-colors ${
              showFilters ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-slate-700 text-slate-500 hover:text-white bg-slate-900'
            }`}>
            <SlidersHorizontal size={13} />
          </button>
        </div>
      </div>

      {/* ── Season label ── */}
      <div className="shrink-0 px-3 sm:px-4 py-1 border-b border-slate-800/40 flex items-center justify-end">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {seasonLabel} · {statType === 'team' ? 'Team' : statType === 'opponent' ? 'Opponent' : statType === 'shotLocations' ? 'Shot Locations & Feats' : statType === 'oppShotLocations' ? 'Opp. Shot Locations' : 'Advanced'} · {phase === 'regular' ? 'Reg Season' : phase === 'playoffs' ? 'Playoffs' : 'Combined'}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-xs text-left border-collapse"
          style={{ minWidth: statType === 'advanced' ? 900 : statType === 'shotLocations' || statType === 'oppShotLocations' ? 900 : 1100 }}>
          {renderThead()}
          <tbody className="divide-y divide-slate-800/50">
            {sortedStats.map((row, idx) => {
              const isOwn = ownTid !== null && row.team.id === ownTid;
              return (
              <tr key={row.team.id} className={`transition-colors ${isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'hover:bg-slate-800/30 active:bg-slate-800/50'}`}>
                {commonTds(row, idx, isOwn)}
                {renderRowCells(row)}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
