import React from 'react';
import { Contact } from '../../../types';
import { CheckCircle2 } from 'lucide-react';
import { ContactAvatar } from '../../common/ContactAvatar';
import { OverallBadge } from '../../common/OverallBadge';

interface ContactListProps {
  contacts: Contact[];
  selectedContacts: Contact[];
  onToggle: (contact: Contact) => void;
}

export const ContactList: React.FC<ContactListProps> = ({ contacts, selectedContacts, onToggle }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {contacts.map(contact => {
        const isSelected = selectedContacts.some(c => c.id === contact.id);
        const isRetired = contact.league === 'Retired' || contact.title.toLowerCase().includes('retired') || contact.title.toLowerCase().includes('hall of famer');
        const showOvr = contact.ovr && contact.ovr > 0 && !isRetired;

        return (
          <button
            key={contact.id}
            onClick={() => onToggle(contact)}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
              isSelected 
                ? 'bg-indigo-600/20 border-indigo-500/50 shadow-lg shadow-indigo-500/10' 
                : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
            }`}
          >
            <ContactAvatar 
              name={contact.name} 
              portraitUrl={contact.playerPortraitUrl} 
              teamLogoUrl={contact.teamLogoUrl} 
            />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>{contact.name}</div>
              <div className="text-xs text-slate-500 truncate">
                {contact.title} • {contact.organization}
              </div>
            </div>
            {isSelected && <CheckCircle2 size={16} className="text-indigo-400 shrink-0 ml-1" />}
          </button>
        );
      })}
    </div>
  );
};
