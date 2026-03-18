import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Scale } from 'lucide-react';
import { REFS } from '../central/view/LeagueOfficeSearcher';

const GIST_URL = 'https://gist.githubusercontent.com/aljohnpolyglot/39217471bf53cc1f6f5673823e0e2da1/raw/22b6f73155a3e6a8f4b652d41ab0738f1891189c/referee_pics';

interface Ref {
  id: string;
  name: string;
  slug: string;
  photo?: string;
}

interface RefereePickerModalProps {
  isOpen?: boolean;
  favoredTeamName?: string;
  preloadedPhotos?: Record<string, string>;
  onClose: () => void;
  onSelect: (ref: Ref) => void;
}

export const RefereePickerModal: React.FC<RefereePickerModalProps> = ({
  isOpen = true,
  favoredTeamName,
  preloadedPhotos,
  onClose,
  onSelect,
}) => {
  const [photos, setPhotos]       = useState<Record<string, string>>({});
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<Ref | null>(null);

  useEffect(() => {
    if (preloadedPhotos && Object.keys(preloadedPhotos).length > 0) {
      setPhotos(preloadedPhotos);
      return;
    }
    fetch(GIST_URL)
      .then(r => r.text())
      .then(text => {
        const map: Record<string, string> = {};
        text.split('\n').forEach(line => {
          const [slug, url] = line.split('|').map(s => s.trim());
          if (slug && url) map[slug] = url;
        });
        setPhotos(map);
      })
      .catch(() => {});
  }, [preloadedPhotos]);

  const refs: Ref[] = REFS
    .filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    .map(r => ({ ...r, photo: photos[r.slug] || photos[r.name] }));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="bg-[#0a0a0a] border border-white/10 rounded-[28px] w-full max-w-3xl flex flex-col shadow-2xl overflow-hidden max-h-[88vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#111] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Scale size={18} className="text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white uppercase tracking-tight">
                    Assign Referee
                  </h2>
                  {favoredTeamName && (
                    <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mt-0.5">
                      Rigging for {favoredTeamName}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-white/5 shrink-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search referees..."
                  className="w-full bg-slate-900 border border-white/10 text-white pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {refs.map(ref => (
                  <button
                    key={ref.id}
                    onClick={() => setSelected(ref)}
                    className={`group relative flex flex-col items-center p-3 rounded-2xl border transition-all ${
                      selected?.id === ref.id
                        ? 'bg-amber-500/15 border-amber-500/50 shadow-lg shadow-amber-500/10'
                        : 'bg-white/3 border-white/5 hover:border-white/15 hover:bg-white/5'
                    }`}
                  >
                    {/* Photo */}
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-800 border border-white/10 mb-2">
                      {ref.photo ? (
                        <img
                          src={ref.photo}
                          alt={ref.name}
                          loading="lazy"
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 font-black text-lg">
                          {ref.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                      )}
                      {/* Number badge */}
                      <div className="absolute bottom-0 right-0 bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-tl-lg leading-none">
                        #{ref.id}
                      </div>
                    </div>

                    <p className="text-[10px] font-black text-white text-center leading-tight">
                      {ref.name}
                    </p>

                    {selected?.id === ref.id && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                        <span className="text-black text-[8px] font-black">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-[#111] flex items-center justify-between shrink-0">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                {selected ? `Selected: ${selected.name} #${selected.id}` : 'No referee selected'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl text-xs font-black text-slate-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-widest"
                >
                  Back
                </button>
                <button
                  onClick={() => selected && onSelect(selected)}
                  disabled={!selected}
                  className="px-6 py-2.5 rounded-xl text-xs font-black text-black bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all uppercase tracking-widest shadow-lg shadow-amber-500/20"
                >
                  Assign Ref →
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
