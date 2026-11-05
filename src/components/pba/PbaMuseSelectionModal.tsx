import { useEffect, useMemo, useState } from 'react';
import {
  CircleUserRound,
  Clapperboard,
  Filter,
  Medal,
  Mic2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  getPbaMuseCandidates,
  type PbaMuseCandidate,
  type PbaMuseSelection,
} from '../../services/pba/musePool';

interface Props {
  open: boolean;
  season: number;
  teamName: string;
  previousSelections: PbaMuseSelection[];
  onClose: () => void;
  onChoose: (candidate: PbaMuseCandidate) => void;
}

type Category = 'All' | 'Actress' | 'Model' | 'Influencer' | 'Singer' | 'Athlete';
type PoolFilter = 'all' | 'real' | 'fictional';

const categoryFor = (occupation = ''): Exclude<Category, 'All'> | null => {
  const value = occupation.toLowerCase();
  if (/athlete|volleyball|equestrian|gymnast|swimmer|sports official/.test(value)) return 'Athlete';
  if (/singer|musician|dancer/.test(value)) return 'Singer';
  if (/influencer|content creator|social media|tiktok/.test(value)) return 'Influencer';
  if (/model|beauty queen|pageant/.test(value)) return 'Model';
  if (/actress|actor|film|television/.test(value)) return 'Actress';
  return null;
};

const categoryIcons = {
  Actress: Clapperboard,
  Model: CircleUserRound,
  Influencer: Sparkles,
  Singer: Mic2,
  Athlete: Medal,
};

export function PbaMuseSelectionModal({
  open,
  season,
  teamName,
  previousSelections,
  onClose,
  onChoose,
}: Props) {
  const [candidates, setCandidates] = useState<PbaMuseCandidate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('All');
  const [poolFilter, setPoolFilter] = useState<PoolFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmationCandidate, setConfirmationCandidate] = useState<PbaMuseCandidate | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    setConfirmationCandidate(null);
    getPbaMuseCandidates(season, previousSelections, 200)
      .then(rows => {
        if (!active) return;
        setCandidates(rows);
        setSelectedId('');
      })
      .catch(() => {
        if (active) setError('Muse candidates are unavailable right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, previousSelections, season]);

  const filtered = useMemo(() => candidates.filter(candidate => {
    if (poolFilter === 'real' && candidate.isFictional) return false;
    if (poolFilter === 'fictional' && !candidate.isFictional) return false;
    if (category !== 'All' && categoryFor(candidate.occupation) !== category) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${candidate.name} ${candidate.occupation ?? ''}`.toLowerCase().includes(needle);
  }), [candidates, category, poolFilter, query]);

  const selected = candidates.find(candidate => candidate.id === selectedId);
  const recent = recentIds
    .map(id => candidates.find(candidate => candidate.id === id))
    .filter((candidate): candidate is PbaMuseCandidate => !!candidate);

  if (!open) return null;

  const selectCandidate = (candidate: PbaMuseCandidate) => {
    setSelectedId(candidate.id);
    setRecentIds(rows => [candidate.id, ...rows.filter(id => id !== candidate.id)].slice(0, 5));
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/85 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section className="relative flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-[#0b1119] shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-8 sm:py-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-full border border-blue-400/20 bg-blue-500/10 text-blue-400 sm:flex">
              <Search size={28} />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">Search Muse</h2>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">Find the perfect muse to represent {teamName}.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={24} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
          <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <Search className="pointer-events-none absolute left-4 top-4 text-slate-500" size={22} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search muse by name or occupation..."
              className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-12 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/60"
            />
            <button
              type="button"
              onClick={() => setFiltersOpen(value => !value)}
              className="flex h-14 items-center justify-center gap-3 rounded-xl border border-blue-400/10 bg-blue-500/10 px-7 text-sm font-black uppercase tracking-wider text-slate-200 hover:bg-blue-500/20"
            >
              <Filter size={20} /> Filters
            </button>
            {filtersOpen && (
              <div className="z-10 rounded-xl border border-white/10 bg-slate-900 p-2 shadow-xl sm:absolute sm:right-0 sm:top-16 sm:w-56">
                {([
                  ['all', 'All candidates'],
                  ['real', 'Real personalities'],
                  ['fictional', 'Future fictional'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setPoolFilter(id);
                      setFiltersOpen(false);
                    }}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${poolFilter === id ? 'bg-blue-500/20 text-blue-200' : 'text-slate-300 hover:bg-white/5'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Trending muses</p>
            {loading ? (
              <div className="mt-3 rounded-2xl border border-white/10 p-8 text-center text-sm text-slate-500">Loading candidates…</div>
            ) : error ? (
              <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/5 p-5 text-sm text-rose-200">{error}</div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {filtered.map(candidate => {
                  const active = selectedId === candidate.id;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      aria-label={`Select ${candidate.name}`}
                      data-testid="pba-muse-candidate"
                      onClick={() => selectCandidate(candidate)}
                      className={`overflow-hidden rounded-xl border text-left transition-all ${active ? 'border-blue-400 bg-blue-500/15 ring-2 ring-blue-400/30' : 'border-white/10 bg-white/[0.04] hover:border-white/30'}`}
                    >
                      <div className="aspect-[4/5] bg-slate-800">
                        {candidate.imageUrl ? (
                          <img src={candidate.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-600"><CircleUserRound size={38} /></div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="line-clamp-2 text-xs font-black uppercase text-white">{candidate.name}</p>
                        <p className="mt-1 line-clamp-2 text-[10px] uppercase tracking-wide text-slate-500">{candidate.occupation ?? 'Personality'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div className="mt-3 rounded-2xl border border-white/10 p-8 text-center text-sm text-slate-500">No eligible muses match these filters.</div>
            )}
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Recently searched</p>
              {recent.length > 0 && (
                <button type="button" onClick={() => setRecentIds([])} className="text-[10px] font-black uppercase text-blue-400">Clear all</button>
              )}
            </div>
            <div className="mt-3 flex min-h-9 flex-wrap gap-2">
              {recent.length === 0 ? (
                <span className="text-xs text-slate-600">Select a card to keep it here.</span>
              ) : recent.map(candidate => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSelectedId(candidate.id)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:border-blue-400/40"
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-5">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Popular categories</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <button
                type="button"
                onClick={() => setCategory('All')}
                className={`rounded-xl border px-3 py-3 text-xs font-black uppercase ${category === 'All' ? 'border-blue-400 bg-blue-500/15 text-blue-200' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}
              >
                All
              </button>
              {(Object.entries(categoryIcons) as Array<[Exclude<Category, 'All'>, typeof Clapperboard]>).map(([name, Icon]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCategory(name)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-black uppercase ${category === name ? 'border-blue-400 bg-blue-500/15 text-blue-200' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}
                >
                  <Icon size={17} /> {name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-3 border-t border-white/10 bg-slate-900/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-xs text-slate-400">{selected ? `${selected.name} will represent ${teamName}.` : "Choose a candidate to represent your team's brand."}</p>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && setConfirmationCandidate(selected)}
            className="w-full rounded-xl bg-blue-500 px-7 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 sm:w-auto"
          >
            Choose Muse
          </button>
        </footer>

        {confirmationCandidate && (
          <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/85 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="confirm-pba-muse-title">
            <div className="w-full max-w-md rounded-t-3xl border border-blue-400/25 bg-[#0b1119] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
              <div className="flex items-center gap-4">
                <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-800 ring-1 ring-white/10">
                  {confirmationCandidate.imageUrl ? (
                    <img src={confirmationCandidate.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-600"><CircleUserRound size={32} /></div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300">Confirm Muse</p>
                  <h3 id="confirm-pba-muse-title" className="mt-1 text-xl font-black text-white">{confirmationCandidate.name}</h3>
                  <p className="mt-1 text-xs text-slate-400">{confirmationCandidate.occupation ?? 'Personality'} · {teamName}</p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-slate-300">
                Confirm {confirmationCandidate.name} as the muse representing {teamName} this season?
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setConfirmationCandidate(null)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-300 hover:bg-white/10">
                  Back
                </button>
                <button type="button" onClick={() => onChoose(confirmationCandidate)} className="rounded-xl bg-blue-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-400">
                  Confirm Muse
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
