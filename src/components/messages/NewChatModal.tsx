import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Globe2,
  Search,
  Send,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { fetchRefereeData } from '../../data/photos';
import {
  buildNewChatContacts,
  INTERNATIONAL_CHAT_LEAGUES,
  isInternationalChatContact,
  STAFF_CHAT_FILTERS,
  type NewChatContact,
} from '../../services/messages/newChatContacts';
import { useGame } from '../../store/GameContext';
import { ContactAvatar } from '../common/ContactAvatar';
import { displayStaffRole } from '../../services/staff/staffCareerRows';

interface NewChatModalProps {
  onClose: () => void;
  onSelect: (contact: NewChatContact) => void;
}

type SortMode = 'recent' | 'rating' | 'name';

interface DisplayContact extends NewChatContact {
  lastActiveAt: number;
  hasConversation: boolean;
}

const sortLabels: Record<SortMode, string> = {
  recent: 'Recently active',
  rating: 'Highest rated',
  name: 'Name A–Z',
};

function filterMatches(contact: NewChatContact, filter: string): boolean {
  if (filter === 'All') return true;
  if (filter === 'Players') return contact.kind === 'player';
  if (filter === 'GMs') return contact.league === 'GM' || contact.role.startsWith('GM ');
  if (filter === 'Coaches') return contact.league === 'Coach' || contact.role.startsWith('Coach ');
  if (filter === 'International') return isInternationalChatContact(contact);
  return contact.league === filter;
}

function contactComparator(mode: SortMode) {
  return (left: DisplayContact, right: DisplayContact) => {
    if (mode === 'name') return left.name.localeCompare(right.name);
    if (mode === 'rating') {
      return right.ovr - left.ovr || left.name.localeCompare(right.name);
    }
    return (
      right.lastActiveAt - left.lastActiveAt
      || Number(right.hasConversation) - Number(left.hasConversation)
      || right.ovr - left.ovr
      || left.name.localeCompare(right.name)
    );
  };
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${
        active
          ? 'border-violet-400 bg-violet-600 text-white shadow-[0_0_20px_rgba(124,58,237,0.24)]'
          : 'border-slate-800 bg-slate-900/75 text-slate-400 hover:border-slate-600 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

export const NewChatModal = ({ onClose, onSelect }: NewChatModalProps) => {
  const { state } = useGame();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [refereeVersion, setRefereeVersion] = useState(0);
  const suggestedRef = useRef<HTMLDivElement>(null);
  const allPeopleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    void fetchRefereeData().finally(() => {
      if (mounted) setRefereeVersion(version => version + 1);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const contacts = useMemo(
    () => buildNewChatContacts(state),
    [
      refereeVersion,
      state.gameMode,
      state.leagueStats,
      state.leagueType,
      state.moddedLeagueBase,
      state.nonNBATeams,
      state.players,
      state.staff,
      state.teams,
      state.userTeamId,
    ],
  );

  const displayContacts = useMemo<DisplayContact[]>(() => {
    const chatsByParticipant = new Map(
      state.chats.flatMap(chat =>
        chat.participants
          .filter(participantId => participantId !== 'commissioner')
          .map(participantId => [participantId, chat] as const)
      ),
    );
    return contacts.map(contact => {
      const chat = chatsByParticipant.get(contact.id);
      const lastActiveAt = chat?.lastMessage?.timestamp
        ? Date.parse(chat.lastMessage.timestamp)
        : 0;
      return {
        ...contact,
        lastActiveAt: Number.isFinite(lastActiveAt) ? lastActiveAt : 0,
        hasConversation: !!chat,
      };
    });
  }, [contacts, state.chats]);

  const primaryFilters = useMemo(() => {
    if (state.gameMode === 'gm') return ['All', 'Players', 'Owner', 'Coach', 'Staff'];
    if (state.leagueType === 'fictional') {
      return ['All', 'Active', 'Free Agent', 'Draft Prospect', 'Retired'];
    }
    return ['All', 'Players', 'GMs', 'Coaches'];
  }, [state.gameMode, state.leagueType]);

  const menuFilters = useMemo(() => {
    const candidates = state.gameMode === 'gm'
      ? []
      : [
          ...INTERNATIONAL_CHAT_LEAGUES,
          'Draft Prospect',
          'Free Agent',
          'Retired',
          ...STAFF_CHAT_FILTERS,
        ];
    return [...new Set(candidates)].filter(filter =>
      displayContacts.some(contact => contact.league === filter)
    );
  }, [displayContacts, state.gameMode]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredContacts = useMemo(
    () =>
      displayContacts
        .filter(contact => filterMatches(contact, activeFilter))
        .filter(contact =>
          !normalizedSearch
          || contact.name.toLowerCase().includes(normalizedSearch)
          || contact.org.toLowerCase().includes(normalizedSearch)
          || contact.role.toLowerCase().includes(normalizedSearch)
        )
        .sort(contactComparator(sortMode)),
    [activeFilter, displayContacts, normalizedSearch, sortMode],
  );

  const suggested = useMemo(
    () =>
      [...displayContacts]
        .filter(contact =>
          contact.kind === 'player'
          && !['Draft Prospect', 'Retired', 'Free Agent'].includes(contact.league)
        )
        .sort(contactComparator('recent'))
        .slice(0, 12),
    [displayContacts],
  );

  const selectedContact = displayContacts.find(contact => contact.id === selectedId);
  const internationalActive = activeFilter === 'International'
    || INTERNATIONAL_CHAT_LEAGUES.includes(
      activeFilter as typeof INTERNATIONAL_CHAT_LEAGUES[number],
    );

  const selectFilter = (filter: string) => {
    setActiveFilter(filter);
    setFilterMenuOpen(false);
  };

  const viewAll = () => {
    setSearchTerm('');
    setActiveFilter('All');
    allPeopleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const createMessage = () => {
    if (selectedContact) onSelect(selectedContact);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-0 backdrop-blur-md sm:p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        className="flex h-full max-h-none w-full max-w-5xl flex-col overflow-hidden border-slate-700/70 bg-[linear-gradient(145deg,rgba(14,25,48,0.99),rgba(7,17,36,0.995))] shadow-[0_28px_100px_rgba(0,0,0,0.65)] sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-[1.75rem] sm:border"
      >
        <header className="shrink-0 border-b border-slate-700/65 px-4 py-4 sm:px-7 sm:py-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600/20 text-violet-300">
              <Send size={22} />
            </span>
            <h2 className="min-w-0 flex-1 text-xl font-black tracking-tight text-white sm:text-2xl">New Message</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close new message"
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-800 hover:text-white"
            >
              <X size={22} />
            </button>
          </div>

          <div className="relative mt-5">
            <Search
              size={20}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="search"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search people, teams, or leagues..."
              autoFocus
              className="h-14 w-full rounded-2xl border border-violet-500/80 bg-slate-950/45 pl-12 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-300 focus:ring-2 focus:ring-violet-500/20 sm:text-base"
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
              {primaryFilters.map(filter => (
                <FilterPill
                  key={filter}
                  label={filter}
                  active={activeFilter === filter}
                  onClick={() => selectFilter(filter)}
                />
              ))}
              {state.gameMode !== 'gm' && (
                <FilterPill
                  label="International"
                  active={internationalActive}
                  onClick={() => selectFilter('International')}
                />
              )}
            </div>

            {menuFilters.length > 0 && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setFilterMenuOpen(open => !open)}
                  aria-expanded={filterMenuOpen}
                  aria-label="Open contact filters"
                  className={`flex h-10 items-center gap-2 rounded-xl border px-3 transition ${
                    filterMenuOpen
                      ? 'border-violet-400 bg-violet-500/10 text-violet-200'
                      : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-white'
                  }`}
                >
                  <Globe2 size={17} />
                  <ChevronDown size={15} />
                </button>
                {filterMenuOpen && (
                  <div className="absolute right-0 top-12 z-20 max-h-72 w-56 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl custom-scrollbar">
                    {menuFilters.map(filter => (
                      <button
                        type="button"
                        key={filter}
                        onClick={() => selectFilter(filter)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${
                          activeFilter === filter
                            ? 'bg-violet-600 text-white'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {filter}
                        {activeFilter === filter && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {suggested.length > 0 && (
            <section className="border-b border-slate-800/80 px-4 py-5 sm:px-7 sm:py-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Suggested</h3>
                <button
                  type="button"
                  onClick={viewAll}
                  className="text-xs font-black text-violet-300 transition hover:text-violet-200"
                >
                  View all
                </button>
              </div>
              <div className="relative">
                <div
                  ref={suggestedRef}
                  className="no-scrollbar flex snap-x gap-3 overflow-x-auto pr-10"
                >
                  {suggested.map(contact => {
                    const selected = selectedId === contact.id;
                    return (
                      <button
                        type="button"
                        key={contact.id}
                        onClick={() => setSelectedId(contact.id)}
                        className={`relative flex min-h-44 w-40 shrink-0 snap-start flex-col items-center justify-center rounded-2xl border p-4 text-center transition sm:w-44 ${
                          selected
                            ? 'border-violet-400 bg-violet-500/10 shadow-[0_0_24px_rgba(124,58,237,0.14)]'
                            : 'border-slate-700/80 bg-slate-900/45 hover:border-slate-500'
                        }`}
                      >
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border border-slate-600 bg-slate-950">
                          {selected && <Check size={13} className="text-violet-300" />}
                        </span>
                        <ContactAvatar
                          name={contact.name}
                          portraitUrl={contact.avatarUrl}
                          teamLogoUrl={contact.teamLogoUrl}
                          size="lg"
                          className="h-16 w-16"
                        />
                        <p className="mt-3 w-full truncate text-sm font-black text-white">{contact.name}</p>
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{displayStaffRole(contact.role)}</p>
                      </button>
                    );
                  })}
                </div>
                {suggested.length > 4 && (
                  <button
                    type="button"
                    onClick={() => suggestedRef.current?.scrollBy({ left: 190, behavior: 'smooth' })}
                    aria-label="Show more suggested contacts"
                    className="absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-950/95 text-slate-300 shadow-xl transition hover:border-violet-400 hover:text-white"
                  >
                    <ChevronRight size={20} />
                  </button>
                )}
              </div>
            </section>
          )}

          <section ref={allPeopleRef} className="px-4 py-5 sm:px-7 sm:py-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">All People</h3>
                <p className="mt-1 text-xs text-slate-600">{filteredContacts.length} available</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <SlidersHorizontal size={15} />
                <span className="hidden sm:inline">Sort:</span>
                <select
                  value={sortMode}
                  onChange={event => setSortMode(event.target.value as SortMode)}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs font-bold text-slate-300 outline-none focus:border-violet-400"
                >
                  {(Object.keys(sortLabels) as SortMode[]).map(mode => (
                    <option key={mode} value={mode}>{sortLabels[mode]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/25">
              {filteredContacts.map(contact => {
                const selected = selectedId === contact.id;
                return (
                  <button
                    type="button"
                    key={contact.id}
                    onClick={() => setSelectedId(contact.id)}
                    onDoubleClick={() => onSelect(contact)}
                    className={`flex w-full items-center gap-3 border-b border-slate-800/90 px-3 py-3 text-left transition last:border-b-0 sm:px-4 ${
                      selected ? 'bg-violet-500/10' : 'hover:bg-slate-800/55'
                    }`}
                  >
                    <ContactAvatar
                      name={contact.name}
                      portraitUrl={contact.avatarUrl}
                      teamLogoUrl={contact.teamLogoUrl}
                      size="lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-white">{contact.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{displayStaffRole(contact.role)}</span>
                    </span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                      selected
                        ? 'border-violet-400 bg-violet-500 text-white'
                        : 'border-slate-600 bg-slate-950 text-transparent'
                    }`}>
                      <Check size={14} />
                    </span>
                  </button>
                );
              })}
              {filteredContacts.length === 0 && (
                <div className="px-6 py-14 text-center">
                  <Search size={24} className="mx-auto text-slate-700" />
                  <p className="mt-3 text-sm font-bold text-slate-400">No contacts found</p>
                  <button
                    type="button"
                    onClick={viewAll}
                    className="mt-3 text-xs font-black text-violet-300 hover:text-violet-200"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="shrink-0 border-t border-slate-700/65 bg-slate-950/35 p-4 sm:px-7 sm:py-5">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 sm:text-left">
              {selectedContact ? `Selected: ${selectedContact.name}` : 'Select one contact'}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <button
                type="button"
                onClick={onClose}
                className="h-12 rounded-xl border border-slate-700 px-6 text-sm font-black text-slate-400 transition hover:bg-slate-800 hover:text-white sm:min-w-36"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createMessage}
                disabled={!selectedContact}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 text-sm font-black text-white shadow-[0_0_24px_rgba(99,102,241,0.2)] transition hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-52"
              >
                <Send size={17} />
                Create Message
              </button>
            </div>
          </div>
        </footer>
      </motion.div>
    </div>
  );
};
