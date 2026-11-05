import { useEffect, useMemo, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { loadPbaVenues, type PbaVenue } from '../../services/pba/venues';

interface Props {
  seasonYear: number;
  onClose: () => void;
  onConfirm: (venue: PbaVenue) => void;
}

export function PbaAllStarVenuePickerModal({ seasonYear, onClose, onConfirm }: Props) {
  const [venues, setVenues] = useState<PbaVenue[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadPbaVenues(seasonYear).then(setVenues).catch(() => setVenues([]));
  }, [seasonYear]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return venues;
    return venues.filter(venue =>
      venue.name.toLowerCase().includes(term)
      || venue.city.toLowerCase().includes(term)
    );
  }, [search, venues]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-2rem)]">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">PBA All-Star Weekend {seasonYear}</p>
            <h2 className="mt-1 text-2xl font-black text-white">Choose the host venue</h2>
            <p className="mt-2 text-sm text-slate-400">Only arenas open by this season are available.</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="border-b border-white/10 p-4 sm:px-7">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search arena or city"
              className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-amber-400/50"
            />
          </label>
        </div>

        <div className="custom-scrollbar grid flex-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:p-7">
          {visible.map(venue => (
            <button
              key={venue.id}
              onClick={() => onConfirm(venue)}
              className="flex min-w-0 items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-left transition hover:border-amber-400/40 hover:bg-amber-400/5"
            >
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
                <MapPin size={19} />
              </span>
              <span className="min-w-0">
                <span className="block font-black text-white">{venue.name}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {venue.city}{venue.capacity ? ` · ${venue.capacity.toLocaleString()} seats` : ''}
                </span>
              </span>
            </button>
          ))}
          {visible.length === 0 && (
            <p className="col-span-full py-12 text-center text-sm text-slate-500">No eligible venue found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
