import { Contact } from '../../types';
import type { DisciplineTemplateSelection } from '../../services/disciplinePolicy';

export type PersonSelectorActionType =
  | 'suspension'
  | 'drug_test'
  | 'dinner'
  | 'general'
  | 'fine'
  | 'movie'
  | 'give_money'
  | 'contact'
  | 'hypnotize'
  | 'sabotage'
  | 'club'
  | 'endorse_hof'
  | 'waive'
  | 'fire'
  | 'retire_now';

export type PersonSelectorStep =
  | 'people'
  | 'location'
  | 'movie'
  | 'note'
  | 'details'
  | 'invite_more'
  | 'club'
  | 'club_choice';

export interface PersonSelectorModalProps {
  onSelect: (
    contacts: Contact[],
    reason?: string,
    amount?: number,
    location?: string,
    duration?: string,
    disciplineTemplate?: DisciplineTemplateSelection,
  ) => void;
  onClose: () => void;
  onSelectionBack?: () => void;
  title: string;
  actionType: PersonSelectorActionType;
  preSelectedContact?: Contact;
  initialSelectedContacts?: Contact[];
  skipPersonSelection?: boolean;
  showInviteMorePrompt?: boolean;
  allowEmptySelection?: boolean;
  contactFilter?: (contact: Contact) => boolean;
  selectionTitle?: string;
  selectionDescription?: string;
  peoplePrimaryLabel?: string;
  fundSource?: 'personal' | 'league';
  onFundSourceChange?: (source: 'personal' | 'league') => void;
  chargePersonalFunds?: boolean;
}
