import { Check, Search, Users } from 'lucide-react';
import type { Contact } from '../../../types';
import { ContactAvatar } from '../../common/ContactAvatar';
import { OverallBadge } from '../../common/OverallBadge';

interface ActionContactPickerProps {
  contacts: Contact[];
  selectedContacts: Contact[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onToggle: (contact: Contact) => void;
  placeholder?: string;
  emptyLabel?: string;
}

export function ActionContactPicker({
  contacts,
  selectedContacts,
  searchTerm,
  onSearchTermChange,
  onToggle,
  placeholder = 'Search players and personnel...',
  emptyLabel = 'No eligible people found.',
}: ActionContactPickerProps) {
  const selectedIds = new Set(selectedContacts.map(contact => contact.id));

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={17} />
        <input
          value={searchTerm}
          onChange={event => onSearchTermChange(event.target.value)}
          placeholder={placeholder}
          className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/55 pl-11 pr-4 text-sm font-medium text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/15"
        />
      </div>
      <div className="custom-scrollbar grid max-h-[46vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
        {contacts.map(contact => {
          const selected = selectedIds.has(contact.id);
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => onToggle(contact)}
              className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition ${
                selected
                  ? 'border-violet-400/70 bg-violet-500/10 shadow-[0_0_20px_rgba(124,58,237,0.1)]'
                  : 'border-slate-700/75 bg-slate-950/25 hover:border-slate-500 hover:bg-slate-800/45'
              }`}
            >
              <ContactAvatar
                name={contact.name}
                portraitUrl={contact.playerPortraitUrl}
                teamLogoUrl={contact.teamLogoUrl}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{contact.name}</p>
                <p className="truncate text-xs text-slate-500">{contact.title} · {contact.organization}</p>
              </div>
              {contact.ovr !== undefined && <OverallBadge ovr={contact.ovr} size="sm" />}
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                selected ? 'border-violet-300 bg-violet-500 text-white' : 'border-slate-600 text-transparent'
              }`}>
                <Check size={14} />
              </span>
            </button>
          );
        })}
        {contacts.length === 0 && (
          <div className="col-span-full flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/20 text-center">
            <Users size={28} className="text-slate-600" />
            <p className="mt-2 text-sm text-slate-500">{emptyLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}
