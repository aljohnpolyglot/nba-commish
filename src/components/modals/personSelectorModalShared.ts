import { Contact } from '../../types';

export type PersonSelectorActionType =
  | 'suspension'
  | 'drug_test'
  | 'dinner'
  | 'general'
  | 'fine'
  | 'bribe'
  | 'movie'
  | 'leak_scandal'
  | 'give_money'
  | 'contact'
  | 'hypnotize'
  | 'sabotage'
  | 'club'
  | 'endorse_hof'
  | 'waive'
  | 'fire';

export type PersonSelectorStep =
  | 'people'
  | 'location'
  | 'movie'
  | 'movie_prompt'
  | 'club'
  | 'club_choice';

export interface PersonSelectorModalProps {
  onSelect: (contacts: Contact[], reason?: string, amount?: number, location?: string, duration?: string) => void;
  onClose: () => void;
  title: string;
  actionType: PersonSelectorActionType;
  preSelectedContact?: Contact;
  skipPersonSelection?: boolean;
}
