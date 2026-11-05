import type { PersonSelectorActionType, PersonSelectorStep } from '../personSelectorModalShared';

interface PersonSelectorFormState {
  actionType: PersonSelectorActionType;
  step: PersonSelectorStep;
  selectedCount: number;
  reason: string;
  duration: string;
  amount: string;
  requiresLocation: boolean;
  hasRestaurant: boolean;
  requiresClub: boolean;
  hasClub: boolean;
  useMovieDatabase: boolean | null;
  hasMovie: boolean;
  allowEmptySelection?: boolean;
}

export function isPersonSelectorFormValid(form: PersonSelectorFormState): boolean {
  if (form.step === 'movie') return form.hasMovie;
  if (form.step === 'club_choice') return true;
  if (form.step === 'invite_more') return true;
  if (form.step === 'people') return form.selectedCount > 0 || !!form.allowEmptySelection;
  if (form.actionType !== 'club' && form.selectedCount === 0 && !form.allowEmptySelection) return false;
  if (form.step === 'note') return true;
  if (form.step === 'location') return !form.requiresLocation || form.hasRestaurant;
  if (form.step === 'club') return !form.requiresClub || form.hasClub;
  if (form.step !== 'details') return true;
  if (form.actionType === 'suspension' && (!form.reason.trim() || !form.duration.trim())) return false;
  if (form.actionType === 'sabotage' && (!form.reason.trim() || !form.duration.trim())) return false;
  if (form.actionType === 'drug_test' && !form.reason.trim()) return false;
  if (form.actionType === 'hypnotize' && !form.reason.trim()) return false;
  if (['fine', 'give_money'].includes(form.actionType) && (!form.amount || !form.reason.trim())) return false;
  return true;
}
