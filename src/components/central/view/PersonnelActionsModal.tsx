import React from 'react';
import { Personnel } from './LeagueOfficeSearcher';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ContactAvatar } from '../../common/ContactAvatar';
import { PERSON_ACTION_DEFS, isPersonnelEligible, StaffType } from '../../../data/personActionDefs';

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export type PersonnelActionType =
  | 'view_bio'
  | 'contact'
  | 'bribe'
  | 'fine'
  | 'dinner'
  | 'movie'
  | 'suspension';

interface PersonnelActionsModalProps {
  person: Personnel | null;
  isOpen: boolean;
  onClose: () => void;
  onActionSelect: (actionType: PersonnelActionType) => void;
}

// Ordered list of actions shown in this modal.
const MODAL_ACTION_IDS: PersonnelActionType[] = [
  'view_bio', 'contact', 'bribe', 'fine', 'dinner', 'movie', 'suspension',
];

// ─────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────

export const PersonnelActionsModal: React.FC<PersonnelActionsModalProps> = ({
  person,
  isOpen,
  onClose,
  onActionSelect,
}) => {
  if (!person) return null;

  const actions = MODAL_ACTION_IDS
    .map(id => PERSON_ACTION_DEFS.find(def => def.id === id))
    .filter((def): def is NonNullable<typeof def> => !!def)
    .filter(def => isPersonnelEligible(person.type as StaffType, def.eligibility));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden border border-slate-700 flex-shrink-0">
                  {person.playerPortraitUrl ? (
                    <img
                      src={person.playerPortraitUrl}
                      alt={person.name}
                      className={`w-full h-full object-cover ${person.type === 'referee' ? 'object-top' : ''}`}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <ContactAvatar
                      name={person.name}
                      portraitUrl={person.playerPortraitUrl}
                      size="md"
                      className="w-full h-full rounded-none"
                    />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-white leading-none">
                    {person.name}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                    {person.jobTitle}
                    {person.number ? ` · #${person.number}` : ''}
                    {person.team ? ` · ${person.team}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Actions */}
            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {actions.map(action => (
                <button
                  key={action.id}
                  onClick={() => onActionSelect(action.id as PersonnelActionType)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 transition-all text-left group"
                >
                  <div className={`p-3 rounded-xl text-white ${action.color} ${action.hover} transition-colors`}>
                    <action.icon size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">{action.title}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{action.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
