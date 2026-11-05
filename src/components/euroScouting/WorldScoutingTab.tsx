import React, { useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { Activity, BarChart3, Clock3, RotateCcw, Search, SlidersHorizontal, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import {
  EURO_COUNTRY_PROFILES,
  getCountryMetricBracket,
  getCountryMetricColor,
  getCountryMetricValue,
  getMetricBracketColor,
  resolveEuroAtlasCountry,
  type EuroCountryBracket,
  type EuroCountryMetric,
} from '../../services/euroScouting/countryProfiles';
import { getScoutingAssignmentProgress, getVisibleScoutingProspects } from '../../services/euroScouting/engine';
import type { EuroCountryProfile, EuroScoutingAssignment } from '../../services/euroScouting/types';
import { CountryFlag } from '../shared/CountryFlag';
import { ScoutingAssignmentModal } from './ScoutingAssignmentModal';
import { ScoutingReportModal } from './ScoutingReportModal';
import { projectEuroCountryProfile } from '../../services/euroScouting/populationProjection';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const BRACKETS: EuroCountryBracket[] = ['low', 'average', 'strong', 'elite'];

const METRIC_META: Record<EuroCountryMetric, { label: string; short: string; color: string; description: string }> = {
  talent: { label: 'Talent Rating', short: 'Talent', color: '#10b981', description: 'Basketball skill and prospect depth' },
  height: { label: 'Height Rating', short: 'Height', color: '#6366f1', description: 'Typical size and physical frames' },
  athleticism: { label: 'Athleticism Rating', short: 'Athletic', color: '#f97316', description: 'Speed, strength and vertical traits' },
  popularity: { label: 'Basketball Popularity', short: 'Popularity', color: '#ec4899', description: 'Basketball culture and audience reach' },
  population: { label: 'Country Population', short: 'Population', color: '#06b6d4', description: 'Size of the available player base' },
  scouted: { label: 'Times Scouted', short: 'Scouted', color: '#eab308', description: 'Completed club scouting trips' },
};

const bracketLabel = (metric: EuroCountryMetric, bracket: EuroCountryBracket) => {
  if (metric === 'height') return { low: 'Short', average: 'Average', strong: 'Tall', elite: 'Elite/Giant' }[bracket];
  if (metric === 'population') return { low: '< 10M', average: '10–50M', strong: '50–150M', elite: '150M+' }[bracket];
  if (metric === 'scouted') return { low: '0 Times', average: '1–2 Times', strong: '3–4 Times', elite: '5+ Times' }[bracket];
  return { low: 'Low', average: 'Average', strong: 'Strong', elite: 'Elite' }[bracket];
};

const formatPopulation = (population: number) => population >= 1_000_000
  ? `${(population / 1_000_000).toFixed(population >= 100_000_000 ? 0 : 1)}M`
  : population.toLocaleString();

const formatMetric = (profile: EuroCountryProfile, metric: EuroCountryMetric, timesScouted: number) => {
  const value = getCountryMetricValue(profile, metric, timesScouted);
  if (metric === 'population') return formatPopulation(value);
  if (metric === 'scouted') return `S:${value}`;
  const prefix = metric === 'talent' ? 'T' : metric === 'height' ? 'H' : metric === 'athleticism' ? 'A' : 'P';
  return `${prefix}:${value}`;
};

const CountryDetails: React.FC<{
  profile: EuroCountryProfile;
  timesScouted: number;
  active: boolean;
  onBack: () => void;
  onScout: () => void;
}> = ({ profile, timesScouted, active, onBack, onScout }) => (
  <div className="space-y-5">
    <button onClick={onBack} className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white">← Back to Database</button>
    <div className="flex items-start gap-4">
      <CountryFlag country={profile.name} iso2={profile.iso2} className="flex h-12 w-16 rounded-lg border border-slate-700 bg-slate-950" />
      <div className="min-w-0"><h2 className="text-xl font-black uppercase tracking-wide text-white">{profile.name}</h2><p className="text-sm font-bold text-emerald-400">{profile.region}</p></div>
    </div>
    <div className="grid grid-cols-3 gap-2">
      {[
        ['Talent', profile.talentRating, 'text-emerald-300'],
        ['Height', profile.heightRating, 'text-indigo-300'],
        ['Athletic', profile.athleticismRating, 'text-orange-300'],
      ].map(([label, value, color]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p><p className={`mt-1 text-xl font-black ${color}`}>{value}</p></div>)}
    </div>
    <div>
      <div className="mb-1 flex justify-between text-xs"><span className="text-slate-400">Basketball Popularity</span><span className="font-mono text-white">{profile.basketballPopularity}/100</span></div>
      <div className="h-2 overflow-hidden rounded-full border border-slate-700 bg-slate-800"><div className="h-full rounded-full bg-pink-500" style={{ width: `${profile.basketballPopularity}%` }} /></div>
    </div>
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/45 p-4 text-sm">
      <div className="flex justify-between"><span className="text-slate-500">Population</span><span className="font-mono text-white">{profile.population.toLocaleString()}</span></div>
      <div className="flex justify-between"><span className="text-slate-500">Times Scouted</span><span className="font-mono text-white">{timesScouted}</span></div>
    </div>
    <button disabled={active} onClick={onScout} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">{active ? 'Scouting in Progress' : 'Scout Country'}</button>
  </div>
);

const AssignmentCard: React.FC<{
  assignment: EuroScoutingAssignment;
  currentDay: number;
  onReport: () => void;
  onCancel: () => void;
}> = ({ assignment, currentDay, onReport, onCancel }) => {
  const progress = getScoutingAssignmentProgress(assignment, currentDay);
  const visible = getVisibleScoutingProspects(assignment, currentDay).length;
  const remaining = Math.max(0, assignment.durationDays - (currentDay - assignment.startedDay));
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-black text-white">{assignment.scoutName}</p><p className="truncate text-[11px] font-bold text-emerald-400">{assignment.countryName}</p></div>{assignment.status === 'active' && <button onClick={onCancel} className="rounded p-1 text-slate-600 hover:bg-red-500/10 hover:text-red-400"><X size={14} /></button>}</div>
      <div className="mt-3 flex justify-between text-[9px] font-bold uppercase tracking-wider text-slate-500"><span>{assignment.status === 'ready' ? 'Report ready' : `${remaining}d left`}</span><span>{Math.round(progress * 100)}%</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${assignment.status === 'ready' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress * 100}%` }} /></div>
      <div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-slate-500">{visible} prospects</span><button onClick={onReport} className="rounded-md border border-blue-500/25 bg-blue-500/10 px-2.5 py-1.5 text-[10px] font-black text-blue-300">View Report</button></div>
    </div>
  );
};

const WorldMap: React.FC<{
  season: number;
  metric: EuroCountryMetric;
  filter: EuroCountryBracket | 'all';
  selectedId?: string;
  assignments: EuroScoutingAssignment[];
  timesScouted: (id: string) => number;
  onSelect: (profile: EuroCountryProfile) => void;
}> = ({ season, metric, filter, selectedId, assignments, timesScouted, onSelect }) => {
  const [features, setFeatures] = useState<any[]>([]);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<{ profile: EuroCountryProfile; x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pointerOrigins = useRef(new Map<number, { x: number; y: number }>());
  const lastDrag = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistance = useRef<number | null>(null);
  const suppressCountryClick = useRef(false);
  React.useEffect(() => {
    let mounted = true;
    fetch(GEO_URL).then(response => {
      if (!response.ok) throw new Error('Map unavailable');
      return response.json();
    }).then((topology: any) => {
      if (!mounted) return;
      const collection = feature(topology, topology.objects.countries) as any;
      setFeatures(collection.features ?? []);
    }).catch(() => mounted && setFailed(true));
    return () => { mounted = false; };
  }, []);
  const path = useMemo(() => geoPath(geoMercator().center([10, 30]).scale(138).translate([400, 270])), []);
  const clampScale = (value: number) => Math.max(1, Math.min(5, value));
  const clampViewport = (scale: number, x: number, y: number) => {
    const maxX = 400 * (scale - 1) / scale;
    const maxY = 270 * (scale - 1) / scale;
    return { scale, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };
  const zoomBy = (factor: number) => setViewport(current => {
    const scale = clampScale(current.scale * factor);
    return clampViewport(scale, current.x, current.y);
  });
  const pointerDistance = (points: Array<{ x: number; y: number }>) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    pointerOrigins.current.set(event.pointerId, point);
    if (pointers.current.size === 1) lastDrag.current = point;
    if (pointers.current.size === 2) lastPinchDistance.current = pointerDistance([...pointers.current.values()]);
  };
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const previous = pointers.current.get(event.pointerId)!;
    const point = { x: event.clientX, y: event.clientY };
    const origin = pointerOrigins.current.get(event.pointerId) ?? point;
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2) {
      const distance = pointerDistance([...pointers.current.values()].slice(0, 2));
      if (lastPinchDistance.current && distance > 0) zoomBy(distance / lastPinchDistance.current);
      lastPinchDistance.current = distance;
      suppressCountryClick.current = true;
      return;
    }
    if (!lastDrag.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (point.x - previous.x) * 800 / Math.max(1, rect.width);
    const dy = (point.y - previous.y) * 540 / Math.max(1, rect.height);
    if (Math.hypot(point.x - origin.x, point.y - origin.y) >= 6) suppressCountryClick.current = true;
    setViewport(current => clampViewport(current.scale, current.x + dx, current.y + dy));
    lastDrag.current = point;
  };
  const handlePointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    pointerOrigins.current.delete(event.pointerId);
    lastPinchDistance.current = null;
    lastDrag.current = pointers.current.size === 1 ? [...pointers.current.values()][0] : null;
    if (suppressCountryClick.current) window.setTimeout(() => { suppressCountryClick.current = false; }, 100);
  };

  if (failed) return <div className="flex min-h-[330px] items-center justify-center text-sm font-bold text-slate-500 md:min-h-[600px]">Map unavailable. Every country remains available in the database.</div>;
  return (
    <div className="relative min-h-[330px] overflow-hidden md:min-h-[600px]">
      <svg
        viewBox="0 0 800 540"
        className="h-full min-h-[330px] w-full cursor-grab touch-none select-none active:cursor-grabbing md:min-h-[600px]"
        role="img"
        aria-label="World scouting map"
        onWheel={event => { event.preventDefault(); zoomBy(Math.exp(-event.deltaY * 0.0015)); }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <g transform={`translate(${viewport.x} ${viewport.y}) translate(400 270) scale(${viewport.scale}) translate(-400 -270)`}>
        {features.map(country => {
          const profile = projectEuroCountryProfile(
            resolveEuroAtlasCountry(country.id ?? country.properties?.ISO_A3, country.properties?.name ?? 'Unknown'),
            season,
          );
          const d = path(country);
          if (!d) return null;
          const active = assignments.some(item => item.countryId === profile.id && item.status === 'active');
          const matches = filter === 'all' || getCountryMetricBracket(profile, metric, timesScouted(profile.id)) === filter;
          const fill = active ? '#3b82f6' : selectedId === profile.id ? '#34d399' : getCountryMetricColor(profile, metric, timesScouted(profile.id));
          return <path
            key={String(country.id ?? country.properties?.name)}
            d={d}
            fill={matches ? fill : '#171c26'}
            opacity={matches ? 1 : 0.22}
            stroke="#080b11"
            strokeWidth={0.55 / viewport.scale}
            className="cursor-pointer transition-opacity hover:opacity-80"
            role="button"
            tabIndex={0}
            aria-label={`Open ${profile.name} scouting`}
            onClick={() => { if (!suppressCountryClick.current) onSelect(profile); }}
            onKeyDown={event => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onSelect(profile);
            }}
            onMouseMove={event => setHovered({ profile, x: event.clientX + 14, y: event.clientY + 14 })}
            onMouseLeave={() => setHovered(null)}
          />;
        })}
        </g>
      </svg>
      <div className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-xl backdrop-blur">
        <button onClick={() => zoomBy(1.35)} disabled={viewport.scale >= 5} className="p-2.5 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30" aria-label="Zoom in"><ZoomIn size={17} /></button>
        <button onClick={() => zoomBy(1 / 1.35)} disabled={viewport.scale <= 1} className="border-t border-slate-700 p-2.5 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30" aria-label="Zoom out"><ZoomOut size={17} /></button>
        <button onClick={() => setViewport({ scale: 1, x: 0, y: 0 })} className="border-t border-slate-700 p-2.5 text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Reset map"><RotateCcw size={17} /></button>
      </div>
      {hovered && <div className="pointer-events-none fixed z-[80] hidden min-w-52 rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl backdrop-blur md:block" style={{ left: hovered.x, top: hovered.y }}><div className="flex items-center gap-2"><CountryFlag country={hovered.profile.name} iso2={hovered.profile.iso2} className="inline-flex h-4 w-6 rounded-sm" /><p className="font-black text-white">{hovered.profile.name}</p></div><div className="mt-2 space-y-1 text-[11px] text-slate-400"><p className="flex justify-between"><span>Talent</span><strong className="text-emerald-300">{hovered.profile.talentRating}</strong></p><p className="flex justify-between"><span>Height</span><strong className="text-indigo-300">{hovered.profile.heightRating}</strong></p><p className="flex justify-between"><span>Athleticism</span><strong className="text-orange-300">{hovered.profile.athleticismRating}</strong></p><p className="flex justify-between"><span>Popularity</span><strong className="text-pink-300">{hovered.profile.basketballPopularity}</strong></p><p className="flex justify-between"><span>Population</span><strong className="text-white">{formatPopulation(hovered.profile.population)}</strong></p></div></div>}
    </div>
  );
};

export const WorldScoutingTab: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const [selected, setSelected] = useState<EuroCountryProfile | null>(null);
  const [assigning, setAssigning] = useState<EuroCountryProfile | null>(null);
  const [report, setReport] = useState<EuroScoutingAssignment | null>(null);
  const [query, setQuery] = useState('');
  const [metric, setMetric] = useState<EuroCountryMetric>('talent');
  const [sortAscending, setSortAscending] = useState(false);
  const [filter, setFilter] = useState<EuroCountryBracket | 'all'>('all');
  const [sortOpen, setSortOpen] = useState(false);
  const [mobileAssignmentsOpen, setMobileAssignmentsOpen] = useState(false);
  const scouting = state.euroScouting;
  const activeSeason = state.leagueStats.year;
  const assignments = (scouting?.assignments ?? []).filter(item => item.status !== 'finalized');
  const timesScouted = (id: string) => scouting?.countryHistory[id]?.timesScouted ?? 0;
  const rows = useMemo(() => EURO_COUNTRY_PROFILES
    .map(profile => projectEuroCountryProfile(profile, activeSeason))
    .filter(profile => profile.name.toLowerCase().includes(query.trim().toLowerCase()))
    .filter(profile => filter === 'all' || getCountryMetricBracket(profile, metric, timesScouted(profile.id)) === filter)
    .sort((a, b) => {
      const delta = getCountryMetricValue(b, metric, timesScouted(b.id)) - getCountryMetricValue(a, metric, timesScouted(a.id));
      return (sortAscending ? -delta : delta) || a.name.localeCompare(b.name);
    }), [activeSeason, filter, metric, query, scouting?.countryHistory, sortAscending]);
  const selectedActive = !!selected && assignments.some(item => item.countryId === selected.id && item.status === 'active');

  const cancel = (assignment: EuroScoutingAssignment) => {
    if (!window.confirm(`Recall ${assignment.scoutName} from ${assignment.countryName}? Current progress will be lost.`)) return;
    void dispatchAction({ type: 'CANCEL_EURO_SCOUTING_ASSIGNMENT', payload: { assignmentId: assignment.id } });
  };
  const assignmentList = <>{assignments.length ? assignments.map(assignment => <AssignmentCard key={assignment.id} assignment={assignment} currentDay={state.day} onReport={() => setReport(assignment)} onCancel={() => cancel(assignment)} />) : <div className="flex min-h-32 flex-col items-center justify-center text-center"><Clock3 size={28} className="text-slate-700" /><p className="mt-2 text-xs font-bold text-slate-500">No active scouts</p></div>}</>;

  return (
    <div className="relative overflow-hidden border-y border-slate-800 bg-[#080b11] md:min-h-[calc(100vh-10rem)] md:rounded-2xl md:border">
      <div className="flex min-h-0 flex-col md:min-h-[calc(100vh-10rem)] md:flex-row">
        <aside className="order-2 flex max-h-[560px] w-full shrink-0 flex-col border-t border-slate-800 bg-slate-900/80 md:order-1 md:max-h-none md:w-80 md:border-r md:border-t-0 lg:w-96">
          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
            {selected ? <CountryDetails profile={selected} timesScouted={timesScouted(selected.id)} active={selectedActive} onBack={() => setSelected(null)} onScout={() => setAssigning(selected)} /> : <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-300"><BarChart3 size={14} className="text-emerald-400" />Global Database</h2><button onClick={() => setSortOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-300"><SlidersHorizontal size={12} />{METRIC_META[metric].short}</button></div>
              <label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search countries..." className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-slate-600" /></label>
              <div className="grid grid-cols-5 gap-1"><button onClick={() => setFilter('all')} className={`rounded border py-1 text-[9px] font-black ${filter === 'all' ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-800 bg-slate-950 text-slate-600'}`}>All</button>{BRACKETS.map(bracket => <button key={bracket} onClick={() => setFilter(bracket)} className={`rounded border py-1 text-[9px] font-black ${filter === bracket ? 'text-white' : 'border-slate-800 bg-slate-950 text-slate-500'}`} style={filter === bracket ? { borderColor: getMetricBracketColor(metric, bracket), backgroundColor: `${getMetricBracketColor(metric, bracket)}33` } : undefined}>{bracketLabel(metric, bracket)}</button>)}</div>
              <div className="min-h-40 flex-1 space-y-2 overflow-y-auto pr-1">
                {rows.map(profile => { const count = timesScouted(profile.id); return <button key={profile.id} onClick={() => setSelected(profile)} className="flex w-full items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/35 p-2.5 text-left hover:border-slate-700 hover:bg-slate-800/55"><div className="flex min-w-0 items-center gap-2.5"><CountryFlag country={profile.name} iso2={profile.iso2} className="inline-flex h-5 w-8 rounded-sm" /><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-200">{profile.name}</p><p className="truncate text-[10px] text-slate-600">{profile.region}</p></div></div><div className="flex items-center gap-2">{assignments.some(item => item.countryId === profile.id && item.status === 'active') && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}<span className="rounded border px-1.5 py-0.5 font-mono text-[10px]" style={{ borderColor: `${getCountryMetricColor(profile, metric, count)}66`, color: getCountryMetricColor(profile, metric, count), backgroundColor: `${getCountryMetricColor(profile, metric, count)}18` }}>{formatMetric(profile, metric, count)}</span></div></button>; })}
                {rows.length === 0 && <p className="py-8 text-center text-xs text-slate-600">No countries match these filters.</p>}
              </div>
            </div>}
          </div>
          <div className="hidden min-h-60 max-h-[34%] flex-col border-t border-slate-800 md:flex"><div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><p className="text-xs font-black text-slate-300">Active Assignments</p><span className="rounded bg-slate-800 px-2 py-1 text-[10px] font-black text-slate-400">{assignments.length}</span></div><div className="space-y-2 overflow-y-auto p-3">{assignmentList}</div></div>
        </aside>

        <main className="order-1 relative min-h-[330px] flex-1 md:order-2">
          <WorldMap season={activeSeason} metric={metric} filter={filter} selectedId={selected?.id} assignments={assignments} timesScouted={timesScouted} onSelect={setSelected} />
          <div className="absolute bottom-3 right-3 w-48 rounded-xl border border-slate-800 bg-slate-900/90 p-3 shadow-xl backdrop-blur md:bottom-5 md:right-5 md:w-60"><p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-500">{METRIC_META[metric].label}</p><div className="space-y-1">{BRACKETS.map(bracket => <button key={bracket} onClick={() => setFilter(filter === bracket ? 'all' : bracket)} className={`flex w-full items-center justify-between rounded px-1.5 py-1 text-[10px] ${filter === bracket ? 'bg-slate-800 text-white' : 'text-slate-400'}`}><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: getMetricBracketColor(metric, bracket) }} />{bracketLabel(metric, bracket)}</span>{filter === bracket && <strong style={{ color: getMetricBracketColor(metric, bracket) }}>Active</strong>}</button>)}</div><div className="mt-2 flex items-center gap-2 border-t border-slate-800 pt-2 text-[10px] font-bold text-blue-400"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />Scout Active</div></div>
          <button onClick={() => setMobileAssignmentsOpen(true)} className="absolute left-3 top-3 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs font-black text-slate-200 shadow-xl md:hidden"><Activity size={15} className="text-emerald-400" />{assignments.length}</button>
        </main>
      </div>

      {sortOpen && <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/85 p-0 backdrop-blur sm:items-center sm:p-4" onClick={event => event.target === event.currentTarget && setSortOpen(false)}><div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"><div className="flex items-center justify-between"><div><h3 className="text-lg font-black text-white">Sort & Focus Database</h3><p className="mt-1 text-xs text-slate-500">Choose what the map and country list emphasize.</p></div><button onClick={() => setSortOpen(false)} className="rounded-lg bg-slate-800 p-2 text-slate-400"><X size={16} /></button></div><div className="mt-5 space-y-2">{(Object.entries(METRIC_META) as Array<[EuroCountryMetric, typeof METRIC_META[EuroCountryMetric]]>).map(([id, meta]) => <button key={id} onClick={() => { if (metric === id) setSortAscending(value => !value); else { setMetric(id); setSortAscending(false); } }} className={`flex w-full items-start justify-between gap-4 rounded-xl border p-3 text-left ${metric === id ? 'border-slate-600 bg-slate-800' : 'border-slate-800 bg-slate-950/45'}`}><span className="flex gap-3"><span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: meta.color }} /><span><strong className="text-sm text-white">{meta.label}</strong><span className="mt-0.5 block text-[11px] text-slate-500">{meta.description}</span></span></span>{metric === id && <span className="shrink-0 rounded bg-slate-950 px-2 py-1 text-[10px] font-black" style={{ color: meta.color }}>{sortAscending ? 'Low → High' : 'High → Low'}</span>}</button>)}</div><button onClick={() => setSortOpen(false)} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white">Apply Sorting</button></div></div>}
      {mobileAssignmentsOpen && <div className="fixed inset-0 z-[95] flex items-end bg-slate-950/80 backdrop-blur md:hidden" onClick={event => event.target === event.currentTarget && setMobileAssignmentsOpen(false)}><div className="max-h-[72vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-4"><div className="mb-4 flex items-center justify-between"><h3 className="font-black text-white">Active Assignments</h3><button onClick={() => setMobileAssignmentsOpen(false)} className="rounded-lg bg-slate-800 p-2 text-slate-400"><X size={16} /></button></div><div className="space-y-2">{assignmentList}</div></div></div>}
      {assigning && <ScoutingAssignmentModal country={assigning} onClose={() => setAssigning(null)} />}
      {report && <ScoutingReportModal assignment={state.euroScouting?.assignments.find(item => item.id === report.id) ?? report} onClose={() => setReport(null)} />}
    </div>
  );
};
