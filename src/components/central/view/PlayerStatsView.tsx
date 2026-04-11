import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer, NBAGMStat } from '../../../types';
import { PlayerBioView } from './PlayerBioView';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { evaluateFilter } from '../../../utils/filterUtils';
import { memCache } from './bioCache';

// ─── Types ─────────────────────────────────────────────────────────────────

type StatType = 'perGame' | 'per36' | 'totals' | 'advanced';
type Phase    = 'regular' | 'playoffs' | 'combined';
type SeasonMode = number | 'career' | 'all';

type SortField =
  | 'name' | 'pos' | 'age' | 'team' | 'gp' | 'gs' | 'min'
  | 'fg' | 'fga' | 'fgPct' | 'tp' | 'tpa' | 'tpPct'
  | 'twop' | 'twopa' | 'twopPct' | 'efgPct'
  | 'ft' | 'fta' | 'ftPct'
  | 'orb' | 'drb' | 'trb' | 'ast' | 'tov' | 'stl' | 'blk' | 'pf' | 'pts' | 'pm'
  | 'per' | 'tsPct' | 'efgPctA' | 'usgPct' | 'ortg' | 'drtg' | 'bpm' | 'ws' | 'vorp';

interface ComputedRow {
  player: NBAPlayer;
  season: number | 'career';
  teamAbbrev: string;
  age: number;
  gp: number; gs: number; min: number;
  fg: number; fga: number; fgPct: number;
  tp: number; tpa: number; tpPct: number;
  twop: number; twopa: number; twopPct: number;
  efgPct: number;
  ft: number; fta: number; ftPct: number;
  orb: number; drb: number; trb: number;
  ast: number; tov: number; stl: number; blk: number; pf: number; pts: number; pm: number;
  per: number; tsPct: number; efgPctA: number; usgPct: number;
  ortg: number; drtg: number; bpm: number; ws: number; vorp: number;
  fromBref?: boolean;
}

// ─── Bref career fetch ─────────────────────────────────────────────────────

const BREF_PROXIES = [
  (u: string) => `https://tight-breeze-58b1.mogatas-princealjohn-05082003.workers.dev/?url=${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
];

const brefCache = new Map<string, ComputedRow | null>();
const brefInFlight = new Set<string>();

function brefId(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return '';
  const last  = parts[parts.length - 1].replace(/[^a-zA-Z]/g, '').toLowerCase();
  const first = parts[0].replace(/[^a-zA-Z]/g, '').toLowerCase();
  return `${last.slice(0, 5)}${first.slice(0, 2)}01`;
}

async function fetchBrefRow(player: NBAPlayer): Promise<ComputedRow | null> {
  const pid = brefId(player.name);
  if (!pid) return null;
  const cacheKey = `bref_career_${pid}`;
  if (brefCache.has(cacheKey)) return brefCache.get(cacheKey)!;
  if (brefInFlight.has(cacheKey)) return null;
  brefInFlight.add(cacheKey);

  const url = `https://www.basketball-reference.com/players/${pid[0]}/${pid}.html`;
  let html = '';
  for (const proxy of BREF_PROXIES) {
    try {
      const res  = await fetch(proxy(url));
      const text = await res.text();
      let candidate = text;
      try { candidate = JSON.parse(text).contents ?? text; } catch (_) {}
      if (candidate.includes('per_game')) { html = candidate; break; }
    } catch (_) { continue; }
  }
  if (!html) { brefCache.set(cacheKey, null); brefInFlight.delete(cacheKey); return null; }

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('#per_game');
    if (!table) { brefCache.set(cacheKey, null); brefInFlight.delete(cacheKey); return null; }

    const headers = Array.from(table.querySelectorAll('thead tr:last-child th')).map(th =>
      (th.getAttribute('data-stat') ?? th.textContent ?? '').toLowerCase().trim()
    );

    const careerRow = table.querySelector('tfoot tr');
    if (!careerRow) { brefCache.set(cacheKey, null); brefInFlight.delete(cacheKey); return null; }

    const cells = Array.from(careerRow.querySelectorAll('td, th'));
    const get = (stat: string) => {
      const idx = headers.indexOf(stat);
      return idx >= 0 ? parseFloat(cells[idx]?.textContent ?? '0') || 0 : 0;
    };

    const fg  = get('fg');  const fga = get('fga');
    const tp  = get('fg3'); const tpa = get('fg3a');
    const ft  = get('ft');  const fta = get('fta');
    const gp  = get('g');

    const row: ComputedRow = {
      player,
      season: 'career',
      teamAbbrev: 'TOT',
      age: player.age ?? 0,
      gp,
      gs: get('gs'),
      min: get('mp'),
      fg, fga, fgPct: fga > 0 ? fg / fga : 0,
      tp, tpa, tpPct: tpa > 0 ? tp / tpa : 0,
      twop: fg - tp, twopa: fga - tpa, twopPct: (fga - tpa) > 0 ? (fg - tp) / (fga - tpa) : 0,
      efgPct: fga > 0 ? (fg + 0.5 * tp) / fga : 0,
      ft, fta, ftPct: fta > 0 ? ft / fta : 0,
      orb: get('orb'), drb: get('drb'), trb: get('trb'),
      ast: get('ast'), tov: get('tov'), stl: get('stl'), blk: get('blk'), pf: get('pf'),
      pts: get('pts'), pm: 0,
      per: 0, tsPct: 0, efgPctA: 0, usgPct: 0,
      ortg: 0, drtg: 0, bpm: 0, ws: 0, vorp: 0,
      fromBref: true,
    };
    brefCache.set(cacheKey, row);
    brefInFlight.delete(cacheKey);
    return row;
  } catch (_) {
    brefCache.set(cacheKey, null);
    brefInFlight.delete(cacheKey);
    return null;
  }
}

// ─── Stat helpers ───────────────────────────────────────────────────────────

const fmt1 = (v: number) => Number.isFinite(v) ? v.toFixed(1) : '—';
const fmt0 = (v: number) => Number.isFinite(v) ? Math.round(v).toString() : '—';
const fmt3 = (v: number) => (Number.isFinite(v) && v > 0) ? `.${Math.round(v * 1000).toString().padStart(3, '0')}` : '—';
const safePct = (num: number, den: number) => den > 0 ? num / den : 0;

function aggregateStats(statsList: NBAGMStat[]): NBAGMStat {
  const out: NBAGMStat = {
    season: 0, tid: statsList[0]?.tid ?? 0,
    gp: 0, gs: 0, min: 0,
    fg: 0, fga: 0, fgp: 0, tp: 0, tpa: 0, tpp: 0,
    ft: 0, fta: 0, ftp: 0,
    orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0,
    per: 0, pm: 0,
  };
  for (const s of statsList) {
    out.gp += s.gp; out.gs += s.gs; out.min += s.min;
    out.fg += s.fg; out.fga += s.fga;
    out.tp += s.tp; out.tpa += s.tpa;
    out.ft += s.ft; out.fta += s.fta;
    out.orb += s.orb; out.drb += s.drb; out.trb += s.trb;
    out.ast += s.ast; out.stl += s.stl; out.blk += s.blk;
    out.tov += s.tov; out.pf += s.pf; out.pts += s.pts;
    out.pm = (out.pm ?? 0) + (s.pm ?? 0);
  }
  out.fgp = safePct(out.fg, out.fga);
  out.tpp = safePct(out.tp, out.tpa);
  out.ftp = safePct(out.ft, out.fta);
  const totalGp = out.gp || 1;
  out.per     = statsList.reduce((a, s) => a + (s.per     ?? 0) * s.gp, 0) / totalGp;
  out.tsPct   = statsList.reduce((a, s) => a + (s.tsPct   ?? 0) * s.gp, 0) / totalGp;
  out.efgPct  = statsList.reduce((a, s) => a + (s.efgPct  ?? 0) * s.gp, 0) / totalGp;
  out.usgPct  = statsList.reduce((a, s) => a + (s.usgPct  ?? 0) * s.gp, 0) / totalGp;
  out.ortg    = statsList.reduce((a, s) => a + (s.ortg    ?? 0) * s.gp, 0) / totalGp;
  out.drtg    = statsList.reduce((a, s) => a + (s.drtg    ?? 0) * s.gp, 0) / totalGp;
  out.bpm     = statsList.reduce((a, s) => a + (s.bpm     ?? 0) * s.gp, 0) / totalGp;
  out.ws      = statsList.reduce((a, s) => a + (s.ws      ?? 0), 0);
  out.vorp    = statsList.reduce((a, s) => a + (s.vorp    ?? 0), 0);
  return out;
}

function toRow(
  player: NBAPlayer,
  rawStat: NBAGMStat,
  statType: StatType,
  seasonLabel: number | 'career',
  teamAbbrev: string,
  age: number,
): ComputedRow {
  const s = rawStat;
  const gp = s.gp || 1;
  const minPer36 = (s.min / 36) || 1;
  const div = statType === 'totals' ? 1 : statType === 'per36' ? minPer36 : gp;

  const fg  = s.fg  / div;
  const fga = s.fga / div;
  const tp  = s.tp  / div;
  const tpa = s.tpa / div;
  const ft  = s.ft  / div;
  const fta = s.fta / div;
  const minD = statType === 'totals' ? s.min : s.min / gp;

  return {
    player, season: seasonLabel, teamAbbrev, age,
    gp: s.gp, gs: s.gs, min: minD,
    fg, fga, fgPct: safePct(s.fg, s.fga),
    tp, tpa, tpPct: safePct(s.tp, s.tpa),
    twop: fg - tp, twopa: fga - tpa,
    twopPct: safePct(s.fg - s.tp, s.fga - s.tpa),
    efgPct: safePct(s.fg + 0.5 * s.tp, s.fga),
    ft, fta, ftPct: safePct(s.ft, s.fta),
    orb: s.orb / div, drb: s.drb / div, trb: s.trb / div,
    ast: s.ast / div, tov: s.tov / div, stl: s.stl / div,
    blk: s.blk / div, pf: s.pf / div,
    pts: s.pts / div, pm: (s.pm ?? 0) / div,
    per: s.per ?? 0,
    tsPct: s.tsPct ?? 0,
    efgPctA: s.efgPct ?? 0,
    usgPct: s.usgPct ?? 0,
    ortg: s.ortg ?? 0, drtg: s.drtg ?? 0,
    bpm: s.bpm ?? 0, ws: s.ws ?? 0, vorp: s.vorp ?? 0,
  };
}

// ─── Column definitions ─────────────────────────────────────────────────────

const BASIC_COLS: { key: SortField; label: string; dim?: boolean }[] = [
  { key: 'gp',      label: 'G'    },
  { key: 'gs',      label: 'GS',   dim: true },
  { key: 'min',     label: 'MP'   },
  { key: 'fg',      label: 'FG'   },
  { key: 'fga',     label: 'FGA',  dim: true },
  { key: 'fgPct',   label: 'FG%'  },
  { key: 'tp',      label: '3P'   },
  { key: 'tpa',     label: '3PA',  dim: true },
  { key: 'tpPct',   label: '3P%'  },
  { key: 'twop',    label: '2P',   dim: true },
  { key: 'twopa',   label: '2PA',  dim: true },
  { key: 'twopPct', label: '2P%',  dim: true },
  { key: 'efgPct',  label: 'eFG%', dim: true },
  { key: 'ft',      label: 'FT'   },
  { key: 'fta',     label: 'FTA',  dim: true },
  { key: 'ftPct',   label: 'FT%'  },
  { key: 'orb',     label: 'ORB',  dim: true },
  { key: 'drb',     label: 'DRB',  dim: true },
  { key: 'trb',     label: 'TRB'  },
  { key: 'ast',     label: 'AST'  },
  { key: 'tov',     label: 'TOV'  },
  { key: 'stl',     label: 'STL'  },
  { key: 'blk',     label: 'BLK'  },
  { key: 'pf',      label: 'PF',   dim: true },
  { key: 'pts',     label: 'PTS'  },
];

const ADV_COLS: { key: SortField; label: string; dim?: boolean }[] = [
  { key: 'gp',     label: 'G'    },
  { key: 'gs',     label: 'GS',  dim: true },
  { key: 'min',    label: 'MP'   },
  { key: 'per',    label: 'PER'  },
  { key: 'tsPct',  label: 'TS%'  },
  { key: 'efgPctA',label: 'eFG%' },
  { key: 'usgPct', label: 'USG%' },
  { key: 'ortg',   label: 'ORtg' },
  { key: 'drtg',   label: 'DRtg' },
  { key: 'bpm',    label: 'BPM'  },
  { key: 'ws',     label: 'WS'   },
  { key: 'vorp',   label: 'VORP' },
];

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

// ─── Component ──────────────────────────────────────────────────────────────

export const PlayerStatsView: React.FC = () => {
  const { state, navigateToTeam, pendingStatSort, setPendingStatSort } = useGame();

  const [viewingPlayer, setViewingPlayer]   = useState<NBAPlayer | null>(null);
  const [statType, setStatType]             = useState<StatType>('perGame');
  const [phase, setPhase]                   = useState<Phase>('regular');
  const [teamFilter, setTeamFilter]         = useState<string>('all');
  const [searchTerm, setSearchTerm]         = useState('');
  const [sortField, setSortField]           = useState<SortField>('pts');
  const [sortOrder, setSortOrder]           = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage]       = useState(1);
  const [perPage, setPerPage]               = useState(25);
  const [showFilters, setShowFilters]       = useState(false);
  const [columnFilters, setColumnFilters]   = useState<Record<string, string>>({});
  const [brefRows, setBrefRows]             = useState<Map<string, ComputedRow>>(new Map());
  const [brefLoading, setBrefLoading]       = useState(false);
  const brefAttempted = useRef(new Set<string>());

  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    state.players.forEach(p => { p.stats?.forEach(s => { if (s.gp > 0) seasons.add(s.season); }); });
    return Array.from(seasons).sort((a, b) => b - a);
  }, [state.players]);

  const [season, setSeason] = useState<SeasonMode>(() => availableSeasons[0] ?? state.leagueStats.year);

  // Sync pending stat sort from league leaders click-through
  useEffect(() => {
    if (!pendingStatSort || pendingStatSort.type !== 'player') return;
    setSortField(pendingStatSort.field as SortField);
    setSortOrder(pendingStatSort.order);
    const advFields: SortField[] = ['per', 'tsPct', 'efgPctA', 'usgPct', 'ortg', 'drtg', 'bpm', 'ws', 'vorp'];
    if (advFields.includes(pendingStatSort.field as SortField)) setStatType('advanced');
    setPendingStatSort(null);
  }, [pendingStatSort, setPendingStatSort]);

  useEffect(() => { setCurrentPage(1); }, [season, phase, statType, teamFilter, searchTerm, sortField, sortOrder]);

  const sortedTeams = useMemo(() =>
    [...state.teams].filter(t => t.id > 0 && t.id < 100).sort((a, b) => a.abbrev.localeCompare(b.abbrev)),
    [state.teams]
  );

  // Season navigation
  const prevSeason = useCallback(() => {
    if (season === 'all') { setSeason('career'); return; }
    if (season === 'career') { setSeason(availableSeasons[0] ?? 2026); return; }
    const idx = availableSeasons.indexOf(season as number);
    setSeason(idx < availableSeasons.length - 1 ? availableSeasons[idx + 1] : 'all');
  }, [season, availableSeasons]);

  const nextSeason = useCallback(() => {
    if (season === 'career') { setSeason('all'); return; }
    if (season === 'all') { setSeason(availableSeasons[0] ?? 2026); return; }
    const idx = availableSeasons.indexOf(season as number);
    setSeason(idx > 0 ? availableSeasons[idx - 1] : 'career');
  }, [season, availableSeasons]);

  // Team navigation
  const prevTeam = useCallback(() => {
    const idx = sortedTeams.findIndex(t => t.abbrev === teamFilter);
    if (teamFilter === 'all') setTeamFilter(sortedTeams[sortedTeams.length - 1]?.abbrev ?? 'all');
    else if (idx <= 0) setTeamFilter('all');
    else setTeamFilter(sortedTeams[idx - 1].abbrev);
  }, [teamFilter, sortedTeams]);

  const nextTeam = useCallback(() => {
    const idx = sortedTeams.findIndex(t => t.abbrev === teamFilter);
    if (teamFilter === 'all') setTeamFilter(sortedTeams[0]?.abbrev ?? 'all');
    else if (idx >= sortedTeams.length - 1) setTeamFilter('all');
    else setTeamFilter(sortedTeams[idx + 1].abbrev);
  }, [teamFilter, sortedTeams]);

  // ── Core row computation ───────────────────────────────────────────────
  const rows = useMemo((): ComputedRow[] => {
    const result: ComputedRow[] = [];

    const getPhaseStats = (player: NBAPlayer, targetSeason: number | null): NBAGMStat[] => {
      const allStats = player.stats ?? [];
      const filtered = targetSeason !== null
        ? allStats.filter(s => s.season === targetSeason)
        : [...allStats];
      if (phase === 'regular')  return filtered.filter(s => !s.playoffs);
      if (phase === 'playoffs') return filtered.filter(s =>  s.playoffs);
      const reg  = filtered.filter(s => !s.playoffs);
      const poff = filtered.filter(s =>  s.playoffs);
      if (!reg.length && !poff.length) return [];
      return [aggregateStats([...reg, ...poff])];
    };

    for (const player of state.players) {
      if (!player.name || player.diedYear) continue;

      const team = state.teams.find(t => t.id === player.tid);
      const teamAbbrev = team?.abbrev ?? (player.tid < 0 ? 'FA' : '?');
      if (teamFilter !== 'all' && teamAbbrev !== teamFilter) continue;

      const age = player.age
        ?? ((player as any).born?.year ? (state.leagueStats.year ?? 2026) - (player as any).born.year : 0);

      if (season === 'career') {
        const stats = getPhaseStats(player, null);
        if (!stats.length) {
          // No local stats — try bref row if we have one cached
          const cached = brefRows.get(player.internalId);
          if (cached) result.push(cached);
          continue;
        }
        const agg = aggregateStats(stats);
        if (agg.gp < 1) continue;
        result.push(toRow(player, agg, statType, 'career', teamAbbrev, age));
      } else if (season === 'all') {
        const allSeasonYears = new Set<number>((player.stats ?? []).map(s => s.season));
        for (const yr of allSeasonYears) {
          const stats = getPhaseStats(player, yr);
          if (!stats.length) continue;
          const agg = stats.length > 1 ? aggregateStats(stats) : stats[0];
          if (agg.gp < 1) continue;
          const t = state.teams.find(t2 => t2.id === agg.tid);
          result.push(toRow(player, agg, statType, yr, t?.abbrev ?? teamAbbrev, age));
        }
      } else {
        const stats = getPhaseStats(player, season as number);
        if (!stats.length) continue;
        const agg = stats.length > 1 ? aggregateStats(stats) : stats[0];
        if (agg.gp < 1) continue;
        const t = state.teams.find(t2 => t2.id === agg.tid);
        result.push(toRow(player, agg, statType, season as number, t?.abbrev ?? teamAbbrev, age));
      }
    }
    return result;
  }, [state.players, state.teams, season, phase, statType, teamFilter, brefRows]);

  // ── Bref career fetch for HOF/retired players with no local stats ──────
  useEffect(() => {
    if (season !== 'career') return;
    const toFetch = state.players.filter(p =>
      p.name &&
      !p.diedYear &&
      (p.hof || p.status === 'Retired') &&
      (!p.stats || p.stats.filter(s => !s.playoffs && s.gp > 0).length === 0) &&
      !brefAttempted.current.has(p.internalId)
    ).slice(0, 10); // max 10 at a time to avoid hammering proxy

    if (!toFetch.length) return;
    toFetch.forEach(p => brefAttempted.current.add(p.internalId));
    setBrefLoading(true);

    Promise.allSettled(toFetch.map(p => fetchBrefRow(p))).then(results => {
      const newMap = new Map(brefRows);
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          newMap.set(toFetch[i].internalId, r.value);
        }
      });
      setBrefRows(newMap);
      setBrefLoading(false);
    });
  }, [season, state.players]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter + sort ──────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let data = rows;

    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      data = data.filter(r =>
        r.player.name.toLowerCase().includes(t) ||
        (r.player.pos ?? '').toLowerCase().includes(t) ||
        r.teamAbbrev.toLowerCase().includes(t)
      );
    }

    if (Object.values(columnFilters).some(Boolean)) {
      data = data.filter(r => {
        for (const [col, flt] of Object.entries(columnFilters)) {
          if (!flt) continue;
          let val: string | number = '';
          if (col === 'name') val = r.player.name;
          else if (col === 'pos')  val = r.player.pos ?? '';
          else if (col === 'team') val = r.teamAbbrev;
          else val = (r as any)[col] ?? 0;
          if (!evaluateFilter(String(val), flt)) return false;
        }
        return true;
      });
    }

    return data.sort((a, b) => {
      let av: number | string = (a as any)[sortField] ?? 0;
      let bv: number | string = (b as any)[sortField] ?? 0;
      if (sortField === 'name') { av = a.player.name; bv = b.player.name; }
      if (sortField === 'pos')  { av = a.player.pos ?? ''; bv = b.player.pos ?? ''; }
      if (sortField === 'team') { av = a.teamAbbrev; bv = b.teamAbbrev; }
      if (av < bv) return sortOrder === 'asc' ? -1 : 1;
      if (av > bv) return sortOrder === 'asc' ?  1 : -1;
      return 0;
    });
  }, [rows, searchTerm, columnFilters, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredRows.length / perPage);
  const pageRows   = filteredRows.slice((currentPage - 1) * perPage, currentPage * perPage);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortOrder('desc'); }
  };

  const thCls = (f: SortField) =>
    `px-2 py-2 text-right cursor-pointer select-none whitespace-nowrap font-semibold transition-colors hover:text-white text-[11px] ${
      sortField === f ? 'text-indigo-400' : 'text-slate-400'
    }`;
  const arrow = (f: SortField) => sortField === f ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : '';

  const fmtBasicVal = (r: ComputedRow, key: SortField): React.ReactNode => {
    const pctFields: SortField[] = ['fgPct', 'tpPct', 'twopPct', 'efgPct', 'ftPct'];
    const v = (r as any)[key] as number;
    if (!Number.isFinite(v)) return <span className="text-slate-600">—</span>;
    if (pctFields.includes(key)) return fmt3(v);
    if (['gp', 'gs'].includes(key)) return Math.round(v);
    return fmt1(v);
  };

  const rowBg = (i: number, isHof: boolean) => {
    if (isHof) return 'bg-rose-950/10 hover:bg-rose-900/15';
    return i % 2 === 0 ? 'hover:bg-slate-800/40' : 'bg-slate-900/20 hover:bg-slate-800/40';
  };

  const stickyBg = (i: number, isHof: boolean) =>
    isHof ? 'rgb(69,10,10)' : i % 2 === 0 ? 'rgb(2,6,23)' : 'rgb(9,14,27)';

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  const activeCols = statType === 'advanced' ? ADV_COLS : BASIC_COLS;
  const seasonLabel = season === 'career' ? 'Career' : season === 'all' ? 'All Time' : `${(season as number) - 1}–${String(season).slice(2)}`;

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200">

      {/* ── Header controls (BBGM-style) ────────────────────────────── */}
      <div className="shrink-0 px-3 sm:px-4 py-2.5 border-b border-slate-800 bg-slate-950">
        {/* Row 1 — title + mobile search */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">Player Stats</h2>
          {/* Mobile search icon — expands to full search below */}
          <div className="relative sm:hidden">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white rounded pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 w-32"
            />
          </div>
        </div>

        {/* Row 2 — filter selectors */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Team selector with arrows */}
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
              {sortedTeams.map(t => <option key={t.id} value={t.abbrev}>{t.abbrev}</option>)}
            </select>
            <button onClick={nextTeam} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-white active:text-white bg-slate-900 border border-slate-700 rounded-r transition-colors">
              <ChevronRight size={12} />
            </button>
          </div>

          {/* Season selector with arrows */}
          <div className="flex items-center gap-0">
            <button onClick={prevSeason} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-white active:text-white bg-slate-900 border border-slate-700 rounded-l transition-colors">
              <ChevronLeft size={12} />
            </button>
            <select
              value={typeof season === 'number' ? season : season}
              onChange={e => {
                const v = e.target.value;
                setSeason(v === 'career' || v === 'all' ? v as SeasonMode : Number(v));
              }}
              className="h-7 bg-slate-900 border-y border-slate-700 text-white text-xs px-1.5 focus:outline-none focus:border-indigo-500 appearance-none min-w-[70px]"
            >
              <option value="career">Career</option>
              <option value="all">All Time</option>
              {availableSeasons.map(s => <option key={s} value={s}>{s - 1}–{String(s).slice(2)}</option>)}
            </select>
            <button onClick={nextSeason} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-white active:text-white bg-slate-900 border border-slate-700 rounded-r transition-colors">
              <ChevronRight size={12} />
            </button>
          </div>

          {/* Stat type */}
          <select
            value={statType}
            onChange={e => setStatType(e.target.value as StatType)}
            className="h-7 bg-slate-900 border border-slate-700 text-white text-xs px-1.5 rounded focus:outline-none focus:border-indigo-500 appearance-none"
          >
            <option value="perGame">Per Game</option>
            <option value="per36">Per 36</option>
            <option value="totals">Totals</option>
            <option value="advanced">Advanced</option>
          </select>

          {/* Phase */}
          <select
            value={phase}
            onChange={e => setPhase(e.target.value as Phase)}
            className="h-7 bg-slate-900 border border-slate-700 text-white text-xs px-1.5 rounded focus:outline-none focus:border-indigo-500 appearance-none"
          >
            <option value="regular">Reg Season</option>
            <option value="playoffs">Playoffs</option>
            <option value="combined">Combined</option>
          </select>

          {/* Per page */}
          <select
            value={perPage}
            onChange={e => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
            className="h-7 bg-slate-900 border border-slate-700 text-white text-xs px-1.5 rounded focus:outline-none focus:border-indigo-500 appearance-none w-14"
          >
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-xs text-slate-500 hidden sm:inline">per page</span>

          {/* Desktop search */}
          <div className="relative hidden sm:block ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white rounded pl-8 pr-8 py-1.5 text-xs focus:outline-none focus:border-indigo-500 w-44 transition-all"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`h-7 w-7 flex items-center justify-center rounded border transition-colors ${
              showFilters ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-slate-700 text-slate-500 hover:text-white bg-slate-900'
            }`}
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>

        {/* Bref loading indicator */}
        {brefLoading && (
          <div className="mt-1.5 text-[10px] text-slate-500 animate-pulse">
            Fetching career stats from Basketball Reference...
          </div>
        )}
      </div>

      {/* ── HOF key + season label ────────────────────────────────────── */}
      <div className="shrink-0 px-3 sm:px-4 py-1 border-b border-slate-800/40 flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          <span className="text-rose-400">■</span> Hall of Fame
          {brefRows.size > 0 && <span className="ml-3 text-slate-600">† bref career</span>}
        </span>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{seasonLabel} · {statType === 'perGame' ? 'Per Game' : statType === 'per36' ? 'Per 36 Min' : statType === 'totals' ? 'Totals' : 'Advanced'} · {phase === 'regular' ? 'Reg Season' : phase === 'playoffs' ? 'Playoffs' : 'Combined'}</span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-auto custom-scrollbar"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <table
          className="w-full text-xs text-left border-collapse"
          style={{ minWidth: statType === 'advanced' ? 820 : 1360 }}
        >
          <thead className="sticky top-0 z-20 bg-slate-900 border-b-2 border-slate-700">
            <tr>
              {/* Rank */}
              <th className="px-2 py-2 text-right text-slate-600 text-[11px] w-8 sticky left-0 bg-slate-900 z-30">#</th>
              {/* Name */}
              <th
                className="px-3 py-2 text-left cursor-pointer select-none font-semibold text-[11px] text-slate-400 hover:text-white sticky left-8 bg-slate-900 z-30 whitespace-nowrap transition-colors"
                onClick={() => handleSort('name')}
              >
                Name{arrow('name')}
                {showFilters && (
                  <input
                    className="mt-1 w-24 block bg-slate-800 border border-slate-700 text-white rounded px-1.5 py-0.5 text-[10px]"
                    placeholder="filter"
                    value={columnFilters['name'] ?? ''}
                    onChange={e => setColumnFilters(p => ({ ...p, name: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </th>
              {/* Pos */}
              <th
                className="px-2 py-2 text-left cursor-pointer select-none font-semibold text-[11px] text-slate-400 hover:text-white whitespace-nowrap transition-colors"
                onClick={() => handleSort('pos')}
              >
                Pos{arrow('pos')}
                {showFilters && (
                  <input
                    className="mt-1 w-9 block bg-slate-800 border border-slate-700 text-white rounded px-1.5 py-0.5 text-[10px]"
                    placeholder="…"
                    value={columnFilters['pos'] ?? ''}
                    onChange={e => setColumnFilters(p => ({ ...p, pos: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </th>
              {/* Age */}
              <th className={thCls('age')} onClick={() => handleSort('age')}>
                Age{arrow('age')}
                {showFilters && (
                  <input
                    className="mt-1 w-9 block bg-slate-800 border border-slate-700 text-white rounded px-1 py-0.5 text-[10px]"
                    placeholder="…"
                    value={columnFilters['age'] ?? ''}
                    onChange={e => setColumnFilters(p => ({ ...p, age: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </th>
              {/* Team */}
              <th
                className="px-2 py-2 text-left cursor-pointer select-none font-semibold text-[11px] text-slate-400 hover:text-white whitespace-nowrap transition-colors"
                onClick={() => handleSort('team')}
              >
                Team{arrow('team')}
                {showFilters && (
                  <input
                    className="mt-1 w-10 block bg-slate-800 border border-slate-700 text-white rounded px-1.5 py-0.5 text-[10px]"
                    placeholder="…"
                    value={columnFilters['team'] ?? ''}
                    onChange={e => setColumnFilters(p => ({ ...p, team: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </th>
              {/* Season column (only for All Time mode) */}
              {season === 'all' && (
                <th className="px-2 py-2 text-right text-slate-400 font-semibold text-[11px] whitespace-nowrap">Season</th>
              )}
              {/* Stat columns */}
              {activeCols.map(col => (
                <th key={col.key} className={thCls(col.key)} onClick={() => handleSort(col.key)}>
                  {col.label}{arrow(col.key)}
                  {showFilters && (
                    <input
                      className="mt-1 w-9 block bg-slate-800 border border-slate-700 text-white rounded px-1 py-0.5 text-[10px]"
                      placeholder="…"
                      value={columnFilters[col.key] ?? ''}
                      onChange={e => setColumnFilters(p => ({ ...p, [col.key]: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((r, i) => {
              const isHof = r.player.hof === true;
              const globalRank = (currentPage - 1) * perPage + i + 1;

              return (
                <tr
                  key={`${r.player.internalId}-${r.season}-${i}`}
                  className={`transition-colors ${rowBg(i, isHof)} border-b border-slate-800/20`}
                >
                  {/* Rank */}
                  <td className="px-2 py-1.5 text-right text-slate-600 sticky left-0 z-10" style={{ backgroundColor: stickyBg(i, isHof) }}>
                    {globalRank}
                  </td>
                  {/* Name */}
                  <td
                    className={`px-3 py-1.5 font-medium cursor-pointer hover:underline whitespace-nowrap sticky left-8 z-10 ${isHof ? 'text-rose-400' : 'text-indigo-400 hover:text-indigo-300'}`}
                    style={{ backgroundColor: stickyBg(i, isHof) }}
                    onClick={() => setViewingPlayer(r.player)}
                  >
                    {r.player.name}
                    {r.fromBref && <span className="ml-1 text-[9px] text-slate-600">†</span>}
                  </td>
                  {/* Pos */}
                  <td className="px-2 py-1.5 text-slate-400">{r.player.pos ?? '—'}</td>
                  {/* Age */}
                  <td className="px-2 py-1.5 text-right text-slate-400">{r.age || '—'}</td>
                  {/* Team */}
                  <td
                    className="px-2 py-1.5 text-slate-300 cursor-pointer hover:text-indigo-400 transition-colors whitespace-nowrap"
                    onClick={() => {
                      const t = state.teams.find(t2 => t2.abbrev === r.teamAbbrev);
                      if (t) navigateToTeam(t.id);
                    }}
                  >
                    {r.teamAbbrev}
                  </td>
                  {/* Season (all-time mode) */}
                  {season === 'all' && (
                    <td className="px-2 py-1.5 text-right text-slate-500 text-[10px]">
                      {typeof r.season === 'number' ? `${r.season - 1}–${String(r.season).slice(2)}` : '—'}
                    </td>
                  )}
                  {/* Stat values */}
                  {statType !== 'advanced' ? (
                    <>
                      <td className="px-2 py-1.5 text-right">{r.gp}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{r.gs}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{fmt1(r.min)}</td>
                      <td className="px-2 py-1.5 text-right">{statType === 'totals' ? fmt0(r.fg) : fmt1(r.fg)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{statType === 'totals' ? fmt0(r.fga) : fmt1(r.fga)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt3(r.fgPct)}</td>
                      <td className="px-2 py-1.5 text-right text-indigo-300">{statType === 'totals' ? fmt0(r.tp) : fmt1(r.tp)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{statType === 'totals' ? fmt0(r.tpa) : fmt1(r.tpa)}</td>
                      <td className="px-2 py-1.5 text-right text-indigo-300">{fmt3(r.tpPct)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{statType === 'totals' ? fmt0(r.twop) : fmt1(r.twop)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-600">{statType === 'totals' ? fmt0(r.twopa) : fmt1(r.twopa)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{fmt3(r.twopPct)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{fmt3(r.efgPct)}</td>
                      <td className="px-2 py-1.5 text-right">{statType === 'totals' ? fmt0(r.ft) : fmt1(r.ft)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{statType === 'totals' ? fmt0(r.fta) : fmt1(r.fta)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt3(r.ftPct)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{statType === 'totals' ? fmt0(r.orb) : fmt1(r.orb)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{statType === 'totals' ? fmt0(r.drb) : fmt1(r.drb)}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{statType === 'totals' ? fmt0(r.trb) : fmt1(r.trb)}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{statType === 'totals' ? fmt0(r.ast) : fmt1(r.ast)}</td>
                      <td className="px-2 py-1.5 text-right text-rose-300/80">{statType === 'totals' ? fmt0(r.tov) : fmt1(r.tov)}</td>
                      <td className="px-2 py-1.5 text-right text-emerald-300/80">{statType === 'totals' ? fmt0(r.stl) : fmt1(r.stl)}</td>
                      <td className="px-2 py-1.5 text-right text-emerald-300/80">{statType === 'totals' ? fmt0(r.blk) : fmt1(r.blk)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{statType === 'totals' ? fmt0(r.pf) : fmt1(r.pf)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-white">{statType === 'totals' ? fmt0(r.pts) : fmt1(r.pts)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 text-right">{r.gp}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{r.gs}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{fmt1(r.min)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-white">{fmt1(r.per)}</td>
                      <td className="px-2 py-1.5 text-right text-indigo-300">{fmt3(r.tsPct / 100)}</td>
                      <td className="px-2 py-1.5 text-right text-indigo-300">{fmt3(r.efgPctA / 100)}</td>
                      <td className="px-2 py-1.5 text-right text-indigo-300">{fmt1(r.usgPct)}%</td>
                      <td className="px-2 py-1.5 text-right text-emerald-300">{fmt1(r.ortg)}</td>
                      <td className="px-2 py-1.5 text-right text-rose-300">{fmt1(r.drtg)}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${r.bpm >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {r.bpm >= 0 ? '+' : ''}{fmt1(r.bpm)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold text-white">{fmt1(r.ws)}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${r.vorp >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {fmt1(r.vorp)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={35} className="px-6 py-12 text-center text-slate-500">
                  No stats found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-800 px-3 sm:px-4 py-2 flex items-center justify-between bg-slate-950">
        <span className="text-[11px] text-slate-500">
          {filteredRows.length === 0
            ? '0 to 0 of 0'
            : `${(currentPage - 1) * perPage + 1}–${Math.min(currentPage * perPage, filteredRows.length)} of ${filteredRows.length}`}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="px-2 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            «
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-[11px] text-slate-500 px-1">{currentPage} / {totalPages || 1}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage >= totalPages}
            className="px-2 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlayerStatsView;
