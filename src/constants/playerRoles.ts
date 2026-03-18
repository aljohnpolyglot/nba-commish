export type Role = 'RimAnchor' | 'StretchBig' | 'Playmaker' | 'WingDefender' | 'FloorSpacer' | 'Slasher' | 'Combo';

export const ROLES: Role[] = [
  'RimAnchor',
  'StretchBig',
  'Playmaker',
  'WingDefender',
  'FloorSpacer',
  'Slasher',
  'Combo'
];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  RimAnchor: 'Elite interior defender and rebounder who protects the paint.',
  StretchBig: 'Big man with outside shooting range who pulls defenders away from the rim.',
  Playmaker: 'Primary initiator with elite passing and court vision.',
  WingDefender: 'Versatile perimeter defender capable of locking down multiple positions.',
  FloorSpacer: 'Sharpshooter who provides gravity and spacing for the offense.',
  Slasher: 'Dynamic driver who excels at attacking the rim and finishing in traffic.',
  Combo: 'Versatile player with a balanced skill set across multiple categories.'
};
