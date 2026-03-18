export type DateZone = 'offseason' | 'early' | 'mid' | 'allstar' | 'late' | 'locked';

export interface KeyDate {
  date: string;
  label: string;
  sublabel?: string;
  icon: string;
  zone: DateZone;
  locked?: boolean;
  placeholder?: boolean;
  placeholderLabel?: string;
}

export const KEY_DATES: KeyDate[] = [
  // OFFSEASON
  { date: '2025-08-12', label: 'Day 1',             sublabel: 'Earliest start — planning window',        icon: '🏀', zone: 'offseason' },
  { date: '2025-08-12', label: 'Broadcasting',      sublabel: 'TV Deal Window',                          icon: '📺', zone: 'offseason', placeholder: true, placeholderLabel: 'Broadcasting Negotiations — Future Feature' },
  { date: '2025-08-12', label: 'Arena Naming',      sublabel: 'Sponsorship Rights',                      icon: '🏟️', zone: 'offseason', placeholder: true, placeholderLabel: 'Arena Naming Rights — Future Feature' },
  { date: '2025-08-14', label: 'Schedule Release',  sublabel: 'Full 82-game schedule generated',         icon: '📅', zone: 'offseason' },
  { date: '2025-10-01', label: 'Training Camp',     sublabel: 'Preseason begins',                        icon: '💪', zone: 'offseason' },
  { date: '2025-10-24', label: 'Opening Night',     sublabel: 'Regular season tips off',                 icon: '🎉', zone: 'early' },

  // EARLY SEASON
  { date: '2025-11-28', label: 'NBA Cup',           sublabel: 'In-Season Tournament',                   icon: '🏆', zone: 'early' },
  { date: '2025-12-01', label: 'Cup Finals Host',   sublabel: 'Neutral site selection',                  icon: '📍', zone: 'early', placeholder: true, placeholderLabel: 'In-Season Tournament Host City — Future Feature' },
  { date: '2025-12-17', label: 'Voting Opens',      sublabel: 'All-Star fan voting starts',              icon: '🗳️', zone: 'early' },
  { date: '2025-12-25', label: 'Christmas',         sublabel: 'Christmas Day Games',                     icon: '🎄', zone: 'early' },
  { date: '2025-12-25', label: 'Xmas Halftime',     sublabel: 'Halftime performer',                      icon: '🎤', zone: 'early', placeholder: true, placeholderLabel: 'Christmas Halftime Show Booking — Future Feature' },

  // MID SEASON
  { date: '2026-01-14', label: 'Voting Closes',     sublabel: 'All-Star starters incoming',              icon: '⭐', zone: 'mid' },
  { date: '2026-01-22', label: 'Starters Drop',     sublabel: 'All-Star Starters announced',             icon: '⭐', zone: 'mid' },
  { date: '2026-01-29', label: 'Full Roster Set',   sublabel: 'Reserves + Rising Stars',                 icon: '📋', zone: 'mid' },
  { date: '2026-01-29', label: 'Replacements',      sublabel: 'All-Star injury subs',                    icon: '🩺', zone: 'mid', placeholder: true, placeholderLabel: 'All-Star Replacement Selection — Future Feature' },
  { date: '2026-01-29', label: 'Shooting Stars',    sublabel: 'Select 3-person teams',                   icon: '🌟', zone: 'mid', placeholder: true, placeholderLabel: 'Shooting Stars Teams — Future Feature' },
  { date: '2026-01-29', label: 'Skills Challenge',  sublabel: 'Select participants',                     icon: '🎯', zone: 'mid', placeholder: true, placeholderLabel: 'Skills Challenge — Future Feature' },
  { date: '2026-02-05', label: 'Dunk Contest',      sublabel: 'Select field + approve props',            icon: '🏅', zone: 'mid' },
  { date: '2026-02-08', label: '3-Point Contest',   sublabel: 'Select field',                            icon: '🎯', zone: 'mid' },
  { date: '2026-02-10', label: 'AS Performer',      sublabel: 'Book All-Star concert',                   icon: '🎤', zone: 'mid' },

  // ALL-STAR WEEKEND
  { date: '2026-02-13', label: 'All-Star Weekend',  sublabel: 'Rising Stars Friday',                     icon: '✨', zone: 'allstar' },

  // LATE SEASON
  { date: '2026-02-15', label: 'Trade Deadline',    sublabel: 'Last day for moves',                      icon: '🔄', zone: 'late' },
  { date: '2026-02-17', label: 'Season Resumes',    sublabel: 'Post All-Star stretch',                   icon: '🏀', zone: 'late' },
  { date: '2026-04-10', label: 'Play-In Format',    sublabel: 'Confirm bracket rules',                   icon: '📐', zone: 'late', placeholder: true, placeholderLabel: 'Play-In Format Confirmation — Future Feature' },
  { date: '2026-04-15', label: 'Season Ends',       sublabel: 'Latest possible start date',              icon: '🏁', zone: 'late' },

  // LOCKED
  { date: '2026-04-16', label: 'Play-In Starts',    sublabel: 'LOCKED',                                  icon: '🔒', zone: 'locked', locked: true },
  { date: '2026-04-18', label: 'Playoffs Begin',    sublabel: 'LOCKED',                                  icon: '🏆', zone: 'locked', locked: true },
  { date: '2026-06-01', label: 'Finals',            sublabel: 'LOCKED',                                  icon: '🏆', zone: 'locked', locked: true },
  { date: '2026-06-21', label: 'Draft Lottery',     sublabel: 'LOCKED',                                  icon: '🎰', zone: 'locked', locked: true },
  { date: '2026-06-25', label: 'NBA Draft',         sublabel: 'LOCKED',                                  icon: '📋', zone: 'locked', locked: true },
  { date: '2026-07-01', label: 'Free Agency',       sublabel: 'LOCKED',                                  icon: '✍️',  zone: 'locked', locked: true },
];

export const TIMELINE_MIN = '2025-08-12';
export const TIMELINE_MAX = '2026-04-15';
export const TIMELINE_DISPLAY_END = '2026-07-10';

export const ZONE_COLORS: Record<DateZone, string> = {
  offseason: '#334155',
  early:     '#1e40af',
  mid:       '#3730a3',
  allstar:   '#854d0e',
  late:      '#581c87',
  locked:    '#0f172a',
};

export const ZONE_LABELS: Record<DateZone, string> = {
  offseason: 'Offseason',
  early:     'Early Season',
  mid:       'Mid Season',
  allstar:   'All-Star',
  late:      'Late Season',
  locked:    'Post-Season',
};
