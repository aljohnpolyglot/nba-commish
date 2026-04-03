import React, { useState } from 'react';
import { ChevronDown, Bookmark, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NBATeam } from '../../types';

interface NewsSubNavProps {
  teams: NBATeam[];
  selectedTeam: string | null;
  selectedCategory: string | null;
  showBookmarksOnly: boolean;
  onSelectTeam: (name: string | null) => void;
  onSelectCategory: (cat: string | null) => void;
  onToggleBookmarks: () => void;
}

const CATEGORIES = [
  { label: 'Breaking', value: 'Breaking News' },
  { label: 'Injuries', value: 'Injury Update' },
  { label: 'Transactions', value: 'Transaction' },
  { label: 'Period Recaps', value: 'Period Recap' },
];

const TeamDropdown: React.FC<{ teams: NBATeam[]; selectedTeam: string | null; onSelect: (name: string | null) => void }> = ({ teams, selectedTeam, onSelect }) => {
  const [open, setOpen] = useState(false);
  const selected = teams.find(t => `${t.region} ${t.name}` === selectedTeam);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-bold uppercase tracking-wider transition-colors rounded-md text-gray-800 hover:text-[#0078ff]"
      >
        {selected?.logoUrl && (
          <img src={selected.logoUrl} alt="" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
        )}
        <span>{selectedTeam ?? 'Teams'}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="absolute left-0 top-full mt-1 z-50 bg-white shadow-2xl border border-gray-200 rounded-xl min-w-[260px] max-h-[70vh] overflow-y-auto p-3"
            >
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
              >
                All Teams
              </button>
              {teams.filter(t => t.id > 0).sort((a, b) => `${a.region} ${a.name}`.localeCompare(`${b.region} ${b.name}`)).map(team => {
                const fullName = `${team.region} ${team.name}`;
                return (
                  <button
                    key={team.id}
                    onClick={() => { onSelect(fullName); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${selectedTeam === fullName ? 'bg-blue-50 text-[#0078ff]' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    {team.logoUrl && <img src={team.logoUrl} alt="" className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />}
                    <span>{fullName}</span>
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export const NewsSubNav: React.FC<NewsSubNavProps> = ({
  teams, selectedTeam, selectedCategory, showBookmarksOnly,
  onSelectTeam, onSelectCategory, onToggleBookmarks,
}) => {
  return (
    <div className="border-b border-gray-200 bg-white sticky top-0 z-40">
      <div className="max-w-[1400px] mx-auto px-4">
        <div className="flex items-center h-12 gap-2">
          {selectedTeam ? (
            <button
              onClick={() => { onSelectTeam(null); onSelectCategory(null); }}
              className="flex items-center gap-1 text-sm font-bold mr-4 text-[#0078ff] hover:opacity-80 flex-shrink-0"
            >
              <ArrowLeft size={15} /> Back
            </button>
          ) : (
            <button
              onClick={() => { onSelectCategory(null); onSelectTeam(null); }}
              className={`text-sm font-bold mr-4 flex-shrink-0 uppercase tracking-wider ${!selectedCategory && !selectedTeam && !showBookmarksOnly ? 'text-[#0078ff]' : 'text-gray-600 hover:text-[#0078ff]'}`}
            >
              NEWS
            </button>
          )}

          <TeamDropdown teams={teams} selectedTeam={selectedTeam} onSelect={onSelectTeam} />

          <div className="flex items-center gap-1 h-full overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => onSelectCategory(selectedCategory === cat.value ? null : cat.value)}
                className={`text-[12px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md flex-shrink-0 transition-all ${
                  selectedCategory === cat.value ? 'bg-blue-50 text-[#0078ff]' : 'text-gray-600 hover:text-[#0078ff] hover:bg-gray-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex-shrink-0">
            <button
              onClick={onToggleBookmarks}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-bold uppercase tracking-wider transition-all ${
                showBookmarksOnly ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Bookmark size={14} fill={showBookmarksOnly ? 'currentColor' : 'none'} />
              <span className="hidden md:inline">Saved</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
