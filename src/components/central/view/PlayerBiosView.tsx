import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer } from '../../../types';
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { formatHeight, getCountryFromLoc, convertTo2KRating } from '../../../utils/helpers';
import { ensureNonNBAFetched, getNonNBAGistData } from './nonNBACache';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';

export const PlayerBiosView: React.FC = () => {
  const { state } = useGame();
  const { players, teams, nonNBATeams = [] } = state;
  const quick = usePlayerQuickActions();
  const [searchTerm, setSearchTerm] = useState('');
  const [league, setLeague] = useState('NBA');
  const [teamFilter, setTeamFilter] = useState('');
  const [position, setPosition] = useState('');
  const [college, setCollege] = useState('');
  const [country, setCountry] = useState('');
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'displayOvr', direction: 'desc' });
  const [showColFilters, setShowColFilters] = useState(false);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  // Bump this when gist data finishes loading so enriched re-runs
  const [gistVersion, setGistVersion] = useState(0);

  useEffect(() => {
    (['B-League', 'PBA', 'Euroleague', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'WNBA'] as any[]).forEach(async (l) => {
      await ensureNonNBAFetched(l);
      setGistVersion(v => v + 1);
    });
  }, []);

  const matchFilter = (value: any, filter: string): boolean => {
    if (!filter) return true;
    if (filter.includes('|')) return filter.split('|').some(f => matchFilter(value, f.trim()));
    if (filter.includes('&')) return filter.split('&').every(f => matchFilter(value, f.trim()));
    const f = filter.trim();
    if (!f) return true;
    if (f.startsWith('!')) return !matchFilter(value, f.slice(1));
    if (f.startsWith('"') && f.endsWith('"')) return String(value).toLowerCase() === f.slice(1, -1).toLowerCase();
    const num = parseFloat(String(value).replace(/[^0-9.]/g, ''));
    if (f.startsWith('>=')) return !isNaN(num) && num >= parseFloat(f.slice(2));
    if (f.startsWith('<=')) return !isNaN(num) && num <= parseFloat(f.slice(2));
    if (f.startsWith('>')) return !isNaN(num) && num > parseFloat(f.slice(1));
    if (f.startsWith('<')) return !isNaN(num) && num < parseFloat(f.slice(1));
    return String(value).toLowerCase().includes(f.toLowerCase());
  };

  const enriched = useMemo(() => {
    const seen = new Set<string>();
    const simYear = state.leagueStats?.year || new Date().getFullYear();
    return players
      .filter(p => {
        const id = p.internalId || p.name;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map(p => {
        const lastRating = p.ratings?.[p.ratings.length - 1];
        const rawOvr = p.overallRating || lastRating?.ovr || 0;
        const displayOvr = convertTo2KRating(rawOvr, lastRating?.hgt ?? 50, lastRating?.tp);
        const playerAge = p.born?.year ? simYear - p.born.year : (typeof p.age === 'number' ? p.age : 25);
        const potBbgm = playerAge >= 29 ? rawOvr : Math.max(rawOvr, Math.round(72.31428908571982 + (-2.33062761 * playerAge) + (0.83308748 * rawOvr)));
        const displayPot = convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), lastRating?.hgt ?? 50, lastRating?.tp);

        // For external leagues, augment with gist data (loaded async)
        const isExternal = ['B-League', 'PBA', 'Euroleague', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'WNBA'].includes(p.status || '');
        const gist = isExternal ? getNonNBAGistData(p.status!, p.name) : null;

        // College: player object → gist school field
        const college: string | null = (p as any).college || gist?.s || null;

        // Draft year/round/pick: player object → parse from gist draft string "2019 Round 1, Pick 6..."
        const parseDraftStr = (d?: string) => {
          if (!d) return { year: null, round: null, pick: null };
          const yr = d.match(/^(\d{4})/); const rnd = d.match(/Round\s*(\d+)/i); const pk = d.match(/Pick\s*(\d+)/i);
          return { year: yr ? parseInt(yr[1]) : null, round: rnd ? parseInt(rnd[1]) : null, pick: pk ? parseInt(pk[1]) : null };
        };
        const gistDraft = parseDraftStr(gist?.d);
        const draftYear  = p.draft?.year  || gistDraft.year;
        const draftRound = p.draft?.round || gistDraft.round;
        const draftPick  = p.draft?.pick  || gistDraft.pick;

        // Weight: player object → parse from gist weight string "195lb"
        const weight: number | null = p.weight || (gist?.w ? parseInt(gist.w) : null);

        // Country: born.loc → gist nationality
        const extractedCountry = getCountryFromLoc(p.born?.loc) || gist?.c || null;

        const experience = draftYear
          ? Math.max(0, simYear - draftYear)
          : (p.stats?.filter((s: any) => !s.playoffs).length
            ? new Set(p.stats.filter((s: any) => !s.playoffs).map((s: any) => s.season)).size
            : null);

        const playerLeague = p.status === 'Retired' ? 'Retired' : p.status === 'WNBA' ? 'WNBA' : p.status === 'PBA' ? 'PBA' : p.status === 'Euroleague' ? 'Euroleague' : p.status === 'B-League' ? 'B-League' : p.status === 'G-League' ? 'G-League' : p.status === 'Endesa' ? 'Endesa' : p.status === 'China CBA' ? 'China CBA' : p.status === 'NBL Australia' ? 'NBL Australia' : 'NBA';
        const isProspect = p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect';
        const teamObj = isProspect ? null : (teams.find(t => t.id === p.tid) || nonNBATeams.find(t => t.tid === p.tid));
        const prospectCollege = isProspect
          ? (college || ((p as any).pre_draft ? (p as any).pre_draft.replace(/\s*\(.*\)\s*$/, '') : null) || 'DRAFT')
          : null;

        return {
          ...p,
          college,
          weight,
          extractedCountry,
          displayOvr,
          displayPot,
          experience,
          playerLeague,
          teamAbbrev: isProspect ? (prospectCollege || 'DRAFT') : (teamObj?.abbrev || (p.tid === -1 ? 'FA' : 'RET')),
          formattedHeight: p.hgt ? formatHeight(p.hgt) : '—',
          draftStr: draftYear ? `${draftYear}` : '—',
          // Display as "R-P" (e.g. "1-15", "2-1"), sort as 1-60 (R2P1 = 31)
          pickNum: draftRound && draftPick ? (draftRound === 1 ? draftPick : 30 + draftPick) : null,
          pickStr: draftRound && draftPick ? `${draftRound}-${draftPick}` : '—',
          age: p.born?.year ? simYear - p.born.year : '—',
        };
      });
  // gistVersion in deps triggers re-run when gist data arrives
  }, [players, teams, nonNBATeams, gistVersion]); // eslint-disable-line

  // Base filtered set — applies league/team/pos/search but NOT college/country, so dropdowns update dynamically
  const filteredBase = useMemo(() => {
    const showingProspects = teamFilter === '-2';
    return enriched.filter(p => {
      const isProspect = p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect';
      if (isProspect && !showingProspects) return false;
      if (!isProspect && showingProspects) return false;
      if (!showingProspects && league !== 'All' && p.playerLeague !== league) return false;
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (!showingProspects && teamFilter && String(p.tid) !== teamFilter) return false;
      if (!showingProspects && position && p.pos !== position) return false;
      return true;
    });
  }, [enriched, league, searchTerm, teamFilter, position]);

  const allColleges = useMemo(() => [...new Set(filteredBase.map(p => p.college).filter(Boolean))].sort() as string[], [filteredBase]);
  const allCountries = useMemo(() => [...new Set(filteredBase.map(p => p.extractedCountry).filter(Boolean))].sort() as string[], [filteredBase]);

  const filtered = useMemo(() => {
    const showingProspects = teamFilter === '-2';
    let r = enriched.filter(p => {
      // Exclude draft prospects unless explicitly selected via team dropdown
      const isProspect = p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect';
      if (isProspect && !showingProspects) return false;
      if (!isProspect && showingProspects) return false;
      if (!showingProspects && league !== 'All' && p.playerLeague !== league) return false;
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (!showingProspects && teamFilter && String(p.tid) !== teamFilter) return false;
      if (!showingProspects && position && p.pos !== position) return false;
      if (!showingProspects && college && p.college !== college) return false;
      if (!showingProspects && country && p.extractedCountry !== country) return false;
      for (const [key, fv] of Object.entries(colFilters)) {
        if (!fv) continue;
        const val = key === 'team' ? p.teamAbbrev : key === 'displayOvr' ? p.displayOvr : key === 'displayPot' ? p.displayPot : key === 'age' ? p.age : key === 'formattedHeight' ? p.hgt : key === 'formattedWeight' ? p.weight : key === 'draftStr' ? p.draft?.year : key === 'pickStr' ? p.draft?.pick : key === 'experience' ? p.experience : (p as any)[key];
        if (!matchFilter(val, fv)) return false;
      }
      return true;
    });

    r.sort((a, b) => {
      let av: any, bv: any;
      if (sortConfig.key === 'team') { av = a.teamAbbrev; bv = b.teamAbbrev; }
      else if (sortConfig.key === 'formattedHeight') { av = a.hgt || 0; bv = b.hgt || 0; }
      else if (sortConfig.key === 'formattedWeight') { av = a.weight || 0; bv = b.weight || 0; }
      else if (sortConfig.key === 'pickStr') { av = (a as any).pickNum ?? 999; bv = (b as any).pickNum ?? 999; }
      else if (sortConfig.key === 'draftStr') { av = a.draft?.year || 0; bv = b.draft?.year || 0; }
      else if (sortConfig.key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else { av = (a as any)[sortConfig.key] ?? 0; bv = (b as any)[sortConfig.key] ?? 0; }
      const d = sortConfig.direction === 'asc' ? 1 : -1;
      return av < bv ? -d : av > bv ? d : a.name.localeCompare(b.name);
    });

    return r;
  }, [enriched, league, searchTerm, teamFilter, position, college, country, sortConfig, colFilters]);

  const PER_PAGE = 50;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const sort = (key: string) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : (['displayOvr', 'experience', 'formattedHeight', 'formattedWeight', 'draftStr', 'age'].includes(key) && prev.key !== key) ? 'desc' : 'asc' }));
    setPage(1);
  };
  const SortIcon = ({ k }: { k: string }) => sortConfig.key !== k ? null : <span className="text-indigo-400 ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
  const Th = ({ k, label, cls = '' }: { k: string; label: string; cls?: string }) => (
    <th onClick={() => sort(k)} className={`py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300 select-none whitespace-nowrap ${cls}`}>
      {label}<SortIcon k={k} />
    </th>
  );
  const STICKY_BG = '#161a20';

  const visibleTeams = useMemo(() => {
    const base = (league === 'NBA' || league === 'All') ? teams : [];
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [league, teams]);
  const visibleNonNBA = useMemo(() => {
    const base = nonNBATeams.filter(t => league === 'All' || t.league === league);
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [league, nonNBATeams]);

  // PlayerBioView takeover handled by the unified hook.
  if (quick.fullPageView) return quick.fullPageView;

  const ovrBadge = (ovr: number) =>
    ovr >= 90 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
    ovr >= 80 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
    ovr >= 70 ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
    'bg-slate-700/40 text-slate-400 border-slate-600/40';

  return (
    <div className="h-full flex flex-col bg-[#161a20] text-slate-200 overflow-hidden">

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-slate-800/60 bg-[#1a1e26] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
        <h2 className="text-xl font-black text-white uppercase tracking-tight">Player Bios</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Search players…" value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-700/60 rounded-lg py-2 pl-9 pr-4 text-sm text-white w-full sm:w-56 focus:outline-none focus:border-indigo-500/60"
            />
          </div>
          <button onClick={() => setShowColFilters(v => !v)}
            className={`p-2 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 ${showColFilters ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Filter
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="px-4 md:px-6 py-2.5 border-b border-slate-800/60 bg-[#1a1e26] flex flex-wrap items-center gap-2 shrink-0">
        {[
          { val: league, set: (v: string) => { setLeague(v); setTeamFilter(''); setPage(1); }, opts: [['All','All Leagues'],['NBA','NBA'],['Retired','Retired'],['WNBA','WNBA'],['PBA','PBA'],['Euroleague','Euroleague'],['B-League','B-League'],['G-League','G-League'],['Endesa','Endesa'],['China CBA','China CBA'],['NBL Australia','NBL Australia']] },
        ].map((f, i) => (
          <div key={i} className="relative">
            <select value={f.val} onChange={e => f.set(e.target.value)} className="appearance-none bg-slate-800 border border-slate-700/60 rounded-lg py-1.5 pl-3 pr-7 text-xs font-medium text-white focus:outline-none">
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          </div>
        ))}
        <div className="relative">
          <select value={teamFilter} onChange={e => { setTeamFilter(e.target.value); setPage(1); }} className="appearance-none bg-slate-800 border border-slate-700/60 rounded-lg py-1.5 pl-3 pr-7 text-xs font-medium text-white focus:outline-none max-w-[160px]">
            <option value="">All</option>
            <option value="-1">Free Agents</option>
            <option value="-2">Draft Prospects</option>
            {visibleTeams.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            {visibleNonNBA.map(t => <option key={t.tid} value={String(t.tid)}>{t.region ? `${t.region} ${t.name}` : t.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        </div>
        {[
          { val: position, set: (v: string) => { setPosition(v); setPage(1); }, opts: [['', 'All Pos'], ...['PG','SG','SF','PF','C'].map(p => [p, p])] },
        ].map((f, i) => (
          <div key={i} className="relative">
            <select value={f.val} onChange={e => f.set(e.target.value)} className="appearance-none bg-slate-800 border border-slate-700/60 rounded-lg py-1.5 pl-3 pr-7 text-xs font-medium text-white focus:outline-none">
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          </div>
        ))}
        <div className="relative">
          <select value={college} onChange={e => { setCollege(e.target.value); setPage(1); }} className="appearance-none bg-slate-800 border border-slate-700/60 rounded-lg py-1.5 pl-3 pr-7 text-xs font-medium text-white focus:outline-none max-w-[130px] truncate">
            <option value="">All Colleges</option>
            {allColleges.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={country} onChange={e => { setCountry(e.target.value); setPage(1); }} className="appearance-none bg-slate-800 border border-slate-700/60 rounded-lg py-1.5 pl-3 pr-7 text-xs font-medium text-white focus:outline-none max-w-[130px] truncate">
            <option value="">All Countries</option>
            {allCountries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        </div>
        {/* Pagination inline */}
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span>{filtered.length} players</span>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded bg-slate-800 border border-slate-700 disabled:opacity-40"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <span className="text-white font-bold">{page}</span><span>/ {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 rounded bg-slate-800 border border-slate-700 disabled:opacity-40"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <table className="w-full text-left border-collapse" style={{ minWidth: '900px' }}>
          <thead className="bg-slate-900/60 sticky top-0 z-10">
            <tr>
              <th onClick={() => sort('name')} className="py-3 px-3 pl-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300 select-none whitespace-nowrap sticky left-0 z-20" style={{ backgroundColor: '#1a1e26' }}>
                Player<SortIcon k="name" />
              </th>
              <Th k="displayOvr" label="OVR" />
              <Th k="displayPot" label="POT" />
              <Th k="team" label="Team" />
              <Th k="jerseyNumber" label="#" />
              <Th k="pos" label="Pos" />
              <Th k="age" label="Age" />
              <Th k="formattedHeight" label="Hgt" />
              <Th k="formattedWeight" label="Wgt" />
              <Th k="college" label="College" />
              <Th k="extractedCountry" label="Country" />
              <Th k="draftStr" label="Draft" />
              <Th k="pickStr" label="Pick" />
              <Th k="experience" label="Exp" />
            </tr>
            {showColFilters && (
              <tr className="bg-slate-900/40">
                {['name','displayOvr','displayPot','team','jerseyNumber','pos','age','formattedHeight','formattedWeight','college','extractedCountry','draftStr','pickStr','experience'].map((k, i) => (
                  <td key={k} className={`p-1.5${i === 0 ? ' sticky left-0 z-20' : ''}`} style={i === 0 ? { backgroundColor: '#1a1e26' } : undefined}>
                    <input type="text" value={colFilters[k] || ''} onChange={e => setColFilters(prev => ({ ...prev, [k]: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" placeholder="…" />
                  </td>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {paginated.map(p => (
              <tr key={p.internalId} onClick={() => quick.openFor(p as unknown as NBAPlayer)}
                className="border-b border-slate-800/30 hover:bg-slate-800/30 cursor-pointer transition-colors">
                <td className="py-2.5 px-3 pl-4 sticky left-0 z-10 whitespace-nowrap" style={{ backgroundColor: STICKY_BG }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-slate-700 overflow-hidden shrink-0">
                      {p.imgURL ? <img src={p.imgURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-400">{p.name[0]}</span>}
                    </div>
                    <span className="text-sm font-bold text-indigo-400">{p.name}</span>
                    {p.hof && <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1 rounded">HOF</span>}
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${ovrBadge(p.displayOvr)}`}>{p.displayOvr}</span>
                </td>
                <td className="py-2.5 px-3">
                  {(() => {
                    const pot = (p as any).displayPot ?? 0;
                    const potColor = pot >= 90 ? '#3b82f6' : pot >= 80 ? '#22c55e' : pot >= 70 ? '#eab308' : '#94a3b8';
                    return <span className="text-xs font-black tabular-nums" style={{ color: potColor }}>{pot}</span>;
                  })()}
                </td>
                <td className="py-2.5 px-3 text-sm text-slate-300 font-medium">{p.teamAbbrev}</td>
                <td className="py-2.5 px-3 text-sm text-slate-400">{p.jerseyNumber || '—'}</td>
                <td className="py-2.5 px-3 text-sm text-slate-400">{p.pos}</td>
                <td className="py-2.5 px-3 text-sm text-slate-400">{p.age}</td>
                <td className="py-2.5 px-3 text-sm text-slate-400">{p.formattedHeight}</td>
                <td className="py-2.5 px-3 text-sm text-slate-400">{p.weight ? `${p.weight}lb` : '—'}</td>
                <td className="py-2.5 px-3 text-sm text-slate-400 max-w-[120px] truncate">{p.college || '—'}</td>
                <td className="py-2.5 px-3 text-sm text-slate-400">{p.extractedCountry || '—'}</td>
                <td className="py-2.5 px-3 text-sm text-slate-400">{p.draftStr}</td>
                <td className="py-2.5 px-3 text-sm text-slate-400">{p.pickStr}</td>
                <td className="py-2.5 px-3 text-sm text-slate-400">{p.experience ?? '—'}</td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={14} className="py-12 text-center text-slate-600 text-sm italic">No players match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {quick.portals}
    </div>
  );
};
