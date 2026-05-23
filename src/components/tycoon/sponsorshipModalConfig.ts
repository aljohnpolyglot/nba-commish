import { ALL_SLOTS, type SponsorshipSlot } from '../../types/tycoon';

export const SPONSORSHIP_SLOTS: SponsorshipSlot[] = ALL_SLOTS;

export const SPONSORSHIP_SLOT_LABEL: Record<SponsorshipSlot, string> = {
  kit: 'Kit',
  sleeve: 'Sleeve',
  back: 'Back',
  shorts: 'Shorts',
  training: 'Training',
  court: 'Court',
  stadium: 'Stadium',
  practice: 'Practice',
};

export const createEmptySponsorshipSlotRecord = <T,>(value: T): Record<SponsorshipSlot, T> =>
  Object.fromEntries(SPONSORSHIP_SLOTS.map((slot) => [slot, value])) as Record<SponsorshipSlot, T>;
