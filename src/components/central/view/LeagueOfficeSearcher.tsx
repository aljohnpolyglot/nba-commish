import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, ListFilter, Trophy, Briefcase, Scale, UserCheck, Building2,
  ChevronDown, User, Loader2, ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import type { StaffMember } from '../../../types';
import { ContactAvatar } from '../../common/ContactAvatar';
import {
  getAllCoaches, getAllReferees, fetchCoachData, fetchRefereeData,
} from '../../../data/photos';

// Re-export REFS so existing modal imports remain unbroken
export { REFS } from '../../../data/photos';
// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export interface Personnel {
  id: string;
  name: string;
  type: 'gm' | 'owner' | 'coach' | 'referee' | 'league_office';
  jobTitle?: string;
  team?: string;
  number?: string;   // referee jersey number
  conf?: string;     // coach conference
  div?: string;      // coach division
  slug?: string;     // for worker fetch
playerPortraitUrl?: string;
  teamLogoUrl?: string;
}


// ─────────────────────────────────────────────────────────────────
// FILTER TABS
// ─────────────────────────────────────────────────────────────────

const TYPES = [
  { id: 'all',           label: 'All',           Icon: Building2 },
  { id: 'gm',            label: 'GMs',           Icon: Briefcase },
  { id: 'owner',         label: 'Owners',        Icon: Trophy },
  { id: 'coach',         label: 'Coaches',       Icon: UserCheck },
  { id: 'referee',       label: 'Referees',      Icon: Scale },
{ id: 'league_office', label: 'Executives', Icon: Building2 },
] as const;

type FilterType = typeof TYPES[number]['id'];

// ─────────────────────────────────────────────────────────────────
// CARD
// ─────────────────────────────────────────────────────────────────

const PersonnelCard: React.FC<{ person: Personnel; onClick: () => void }> = ({ person, onClick }) => {
  const typeColors: Record<string, string> = {
    referee:       'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    coach:         'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    gm:            'text-amber-400 bg-amber-500/10 border-amber-500/20',
    owner:         'text-rose-400 bg-rose-500/10 border-rose-500/20',
    league_office: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group relative bg-slate-900/40 border border-slate-800 hover:border-indigo-500/40 rounded-3xl p-4 cursor-pointer transition-all overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-3xl rounded-full -mr-8 -mt-8 group-hover:bg-indigo-500/10 transition-all" />

      <div className="flex gap-4 items-center relative z-10">
  
        {/* Portrait */}
        <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0">
{person.type === 'referee' && person.playerPortraitUrl ? (
            <img
              src={person.playerPortraitUrl}
              alt={person.name}
              loading="lazy"
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <ContactAvatar
              name={person.name}
              portraitUrl={person.playerPortraitUrl}
              teamLogoUrl={person.teamLogoUrl}
              size="lg"
              className="w-full h-full rounded-none group-hover:scale-105 transition-transform duration-300"
            />
          )}
          {/* Number badge for refs */}
          {person.type === 'referee' && person.number && (
            <div className="absolute bottom-0 right-0 bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-tl-lg leading-none">
              #{person.number}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white truncate group-hover:text-indigo-400 transition-colors">
            {person.name}
          </h4>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
            {person.jobTitle}
          </p>
          {person.team && (
            <p className="text-[10px] font-bold text-slate-600 mt-1 truncate">{person.team}</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between relative z-10">
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${typeColors[person.type]}`}>
          {person.type.replace('_', ' ')}
        </span>
        <ChevronDown size={13} className="text-slate-600 group-hover:text-indigo-400 transition-colors -rotate-90" />
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────

interface LeagueOfficeSearcherProps {
  onPersonnelClick: (person: Personnel) => void;
}

export const LeagueOfficeSearcher: React.FC<LeagueOfficeSearcherProps> = ({ onPersonnelClick }) => {
  const { state } = useGame();
  const [search, setSearch] = useState('');
  const [photosReady, setPhotosReady] = useState(false);

  useEffect(() => {
    Promise.all([fetchCoachData(), fetchRefereeData()]).then(() => setPhotosReady(true));
  }, []);
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [confFilter, setConfFilter] = useState<'ALL' | 'EAST' | 'WEST'>('ALL');
  const [sortBy, setSortBy] = useState<'last' | 'first'>('last');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // ── Build master list from gist data + state.staff ──────────
  const allPersonnel = useMemo<Personnel[]>(() => {
    const refs: Personnel[] = getAllReferees().map(r => ({
      id:               `ref-${r.id}`,
      name:             r.name,
      type:             'referee',
      jobTitle:         'NBA Official',
      number:           r.id,
      slug:             r.slug,
      playerPortraitUrl: r.photo_url,
    }));

    const coaches: Personnel[] = getAllCoaches().map((c, i) => ({
      id:               `coach-${i}`,
      name:             c.name,
      type:             'coach',
      jobTitle:         'Head Coach',
      team:             c.team,
      conf:             c.conf,
      div:              c.div,
      slug:             c.slug,
      playerPortraitUrl: c.img,
      teamLogoUrl:      state.teams.find(t => t.name === c.team)?.logoUrl,
    }));

 const gms: Personnel[] = (state.staff?.gms || []).map((m: StaffMember, i: number) => ({
      id:               `gm-${i}`,
      name:             m.name,
      type:             'gm',
      jobTitle:         m.jobTitle || 'General Manager',
      team:             m.team,
      playerPortraitUrl: m.playerPortraitUrl,
      teamLogoUrl:      m.teamLogoUrl || state.teams.find(t => t.name === m.team)?.logoUrl,
    }));

    const owners: Personnel[] = (state.staff?.owners || []).map((m: StaffMember, i: number) => ({
      id:               `owner-${i}`,
      name:             m.name,
      type:             'owner',
      jobTitle:         m.jobTitle || 'Team Owner',
      team:             m.team,
      playerPortraitUrl: m.playerPortraitUrl,
      teamLogoUrl:      m.teamLogoUrl || state.teams.find(t => t.name === m.team)?.logoUrl,
    }));

    const lo: Personnel[] = (state.staff?.leagueOffice || []).map((m: StaffMember, i: number) => ({
      id:               `lo-${i}`,
      name:             m.name,
      type:             'league_office',
      jobTitle:         m.jobTitle || 'League Executive',
      playerPortraitUrl: m.playerPortraitUrl,
    }));

    return [...refs, ...coaches, ...gms, ...owners, ...lo];
  }, [state.staff, state.teams, photosReady]);

  // ── Filter & Sort ───────────────────────────────────────────
  const filtered = useMemo(() => {
    return allPersonnel
      .filter(p => {
        if (typeFilter !== 'all' && p.type !== typeFilter) return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
            !(p.team?.toLowerCase().includes(search.toLowerCase()))) return false;
        if (confFilter !== 'ALL' && p.type === 'coach' && p.conf !== confFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const getKey = (name: string) =>
          sortBy === 'last'
            ? name.split(' ').slice(-1)[0]   // last word = last name
            : name.split(' ')[0];             // first word = first name
        const res = getKey(a.name).localeCompare(getKey(b.name));
        return sortOrder === 'asc' ? res : -res;
      });
  }, [allPersonnel, typeFilter, search, confFilter, sortBy, sortOrder]);

  return (
    <div className="flex flex-col lg:flex-row h-full gap-8">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div className="w-full lg:w-72 flex-shrink-0 space-y-6 bg-slate-900/50 border border-slate-800 p-4 lg:p-6 rounded-2xl h-fit lg:sticky lg:top-0 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ListFilter size={14} className="text-indigo-500" /> Filters
          </h3>
          <button
            onClick={() => { setSearch(''); setTypeFilter('all'); setConfFilter('ALL'); }}
            className="text-[10px] font-bold text-slate-600 hover:text-indigo-400 transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Type tabs */}
        <div className="flex lg:flex-col gap-2 overflow-x-auto pb-1 lg:pb-0 lg:space-y-1.5">
          {TYPES.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTypeFilter(id)}
              className={`flex-shrink-0 lg:w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                typeFilter === id
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              <Icon size={14} />
              {label}
              <span className="ml-auto text-[10px] opacity-60">
                {id === 'all' ? allPersonnel.length : allPersonnel.filter(p => p.type === id).length}
              </span>
            </button>
          ))}
        </div>

        {/* Conference filter — only relevant for coaches */}
        {(typeFilter === 'all' || typeFilter === 'coach') && (
          <div className="hidden lg:block pt-4 border-t border-slate-800 space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Conference</p>
            {(['ALL', 'EAST', 'WEST'] as const).map(c => (
              <button
                key={c}
                onClick={() => setConfFilter(c)}
                className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  confFilter === c
                    ? 'bg-slate-700 text-white border-slate-600'
                    : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'
                }`}
              >
                {c === 'ALL' ? 'All Conferences' : `${c}ern`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Grid ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-5">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or team…"
            className="w-full bg-slate-900/80 border border-slate-800 text-white pl-11 pr-4 py-3.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600 text-sm"
          />
        </div>

        {/* Sort Bar */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-2xl p-1">
          <button
            onClick={() => { setSortBy('last'); setSortOrder(sortBy === 'last' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
            className={`flex-1 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${sortBy === 'last' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
          >
            Last Name {sortBy === 'last' && <ArrowUpDown size={12} />}
          </button>
          <button
            onClick={() => { setSortBy('first'); setSortOrder(sortBy === 'first' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
            className={`flex-1 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${sortBy === 'first' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
          >
            First Name {sortBy === 'first' && <ArrowUpDown size={12} />}
          </button>
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-700 border border-dashed border-slate-800 rounded-3xl">
            <User size={40} className="mb-3 opacity-20" />
            <p className="uppercase tracking-widest text-xs font-bold">No personnel found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(person => (
              <PersonnelCard
                key={person.id}
                person={person}
                onClick={() => onPersonnelClick(person)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};