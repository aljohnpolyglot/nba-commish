export type DateZone = 'offseason' | 'early' | 'mid' | 'allstar' | 'late' | 'locked';
export type EuroDateZone = 'transfer' | 'preseason' | 'endesa' | 'euroleague' | 'cup' | 'postseason' | 'offseason';

export interface KeyDate {
  date: string;
  label: string;
  sublabel?: string;
  icon: string;
  zone: DateZone | PbaDateZone | EuroDateZone;
  locked?: boolean;
  placeholder?: boolean;
  placeholderLabel?: string;
  accentColor?: string;
}

import { getLeagueLabels } from '../../utils/leagueLabels';
import { isNbaCupEra, isPlayInEra } from '../../data/historicalNbaSeasons';
import { getAllStarWeekendStartDate, toISODateString } from '../../utils/dateUtils';
import { getPlayableInternationalWindowForSeason } from '../../services/fiba/tournamentWindows';
import { formatPbaSeasonLabel } from '../../services/pba/historicalCatalog';
import { getCachedHistoricalPbaSource } from '../../services/pba/historicalLoader';
import { dateForCompetitionSeason } from '../../services/competition/competitionSeasonState';
import { getConferenceSpec, getPbaCalendarPosition, getConferenceStartIso } from '../../services/pba/conferenceTransition';
import { getPbaAllStarWeekendStartIso } from '../../services/pba/calendar';

const shiftSeasonDate = (date: string, seasonEndYear: number): string => {
  if (date.startsWith('2025-')) return `${seasonEndYear - 1}${date.slice(4)}`;
  if (date.startsWith('2026-')) return `${seasonEndYear}${date.slice(4)}`;
  return date;
};

const addDays = (date: string, days: number): string => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

export function getKeyDates(leagueType?: 'fictional' | 'modded', seasonEndYear = 2026): KeyDate[] {
  const labels = getLeagueLabels(leagueType);
  const startYear = seasonEndYear - 1;
  const allStarStart = toISODateString(getAllStarWeekendStartDate(seasonEndYear));
  const internationalWindow = leagueType === 'modded'
    ? getPlayableInternationalWindowForSeason(startYear)
    : undefined;
  const base: KeyDate[] = [
    { date: '2025-08-06', label: 'Day 1',             sublabel: 'Earliest start — planning window',        icon: '🏀', zone: 'offseason' },
    { date: '2025-08-06', label: 'Broadcasting',      sublabel: 'TV Deal Window',                          icon: '📺', zone: 'offseason', placeholder: true, placeholderLabel: 'Broadcasting Negotiations — Future Feature' },
    { date: '2025-08-06', label: 'Arena Naming',      sublabel: 'Sponsorship Rights',                      icon: '🏟️', zone: 'offseason', placeholder: true, placeholderLabel: 'Arena Naming Rights — Future Feature' },
    { date: '2025-08-14', label: 'Schedule Release',  sublabel: 'Full 82-game schedule generated',         icon: '📅', zone: 'offseason' },
    { date: '2025-10-01', label: 'Training Camp',     sublabel: 'Preseason begins',                        icon: '💪', zone: 'offseason' },
    { date: '2025-10-24', label: 'Opening Night',     sublabel: 'Regular season tips off',                 icon: '🎉', zone: 'early' },
    { date: '2025-11-28', label: labels.cupShort,     sublabel: 'Mid-season tournament',                   icon: '🏆', zone: 'early' },
    { date: '2025-12-01', label: 'Cup Finals Host',   sublabel: 'Neutral site selection',                  icon: '📍', zone: 'early', placeholder: true, placeholderLabel: 'In-Season Tournament Host City — Future Feature' },
    { date: '2025-12-17', label: 'Voting Opens',      sublabel: 'All-Star fan voting starts',              icon: '🗳️', zone: 'early' },
    { date: '2025-12-25', label: 'Christmas',         sublabel: 'Christmas Day Games',                     icon: '🎄', zone: 'early' },
    { date: '2025-12-25', label: 'Xmas Halftime',     sublabel: 'Halftime performer',                      icon: '🎤', zone: 'early', placeholder: true, placeholderLabel: 'Christmas Halftime Show Booking — Future Feature' },
    { date: '2026-01-14', label: 'Voting Closes',     sublabel: 'All-Star starters incoming',              icon: '⭐', zone: 'mid' },
    { date: '2026-01-22', label: 'Starters Drop',     sublabel: 'All-Star Starters announced',             icon: '⭐', zone: 'mid' },
    { date: '2026-01-29', label: 'Full Roster Set',   sublabel: 'Reserves + Rising Stars',                 icon: '📋', zone: 'mid' },
    { date: '2026-01-29', label: 'Replacements',      sublabel: 'All-Star injury subs',                    icon: '🩺', zone: 'mid', placeholder: true, placeholderLabel: 'All-Star Replacement Selection — Future Feature' },
    { date: '2026-01-29', label: 'Shooting Stars',    sublabel: 'All-Star Saturday team shooting challenge', icon: '🌟', zone: 'mid' },
    { date: '2026-01-29', label: 'Skills Challenge',  sublabel: 'All-Star Saturday obstacle course',         icon: '🎯', zone: 'mid' },
    { date: '2026-02-05', label: 'Dunk Contest',      sublabel: 'Select field + approve props',            icon: '🏅', zone: 'mid' },
    { date: '2026-02-08', label: '3-Point Contest',   sublabel: 'Select field',                            icon: '🎯', zone: 'mid' },
    { date: '2026-02-10', label: 'AS Performer',      sublabel: 'Book All-Star concert',                   icon: '🎤', zone: 'mid' },
    { date: '2026-02-13', label: 'All-Star Weekend',  sublabel: 'Rising Stars Friday',                     icon: '✨', zone: 'allstar' },
    { date: '2026-02-15', label: 'Trade Deadline',    sublabel: 'Last day for moves',                      icon: '🔄', zone: 'late' },
    { date: '2026-02-17', label: 'Season Resumes',    sublabel: 'Post All-Star stretch',                   icon: '🏀', zone: 'late' },
    { date: '2026-04-10', label: 'Play-In Format',    sublabel: 'Confirm bracket rules',                   icon: '📐', zone: 'late', placeholder: true, placeholderLabel: 'Play-In Format Confirmation — Future Feature' },
    { date: '2026-04-15', label: 'Season Ends',       sublabel: 'Latest possible start date',              icon: '🏁', zone: 'late' },
    { date: '2026-04-16', label: 'Play-In',           sublabel: 'Play-In Tournament',                      icon: '⚡', zone: 'late' },
    { date: '2026-04-19', label: 'Playoffs',          sublabel: 'First Round begins',                      icon: '🏆', zone: 'late' },
    { date: '2026-06-01', label: 'Finals',            sublabel: `${labels.finals} begin`,                  icon: '🏆', zone: 'late' },
    { date: '2026-05-14', label: labels.draftLottery, sublabel: 'Draft order determined',                  icon: '🎰', zone: 'late' },
    { date: '2026-06-25', label: labels.draft,        sublabel: 'Rookie selection',                        icon: '📋', zone: 'late' },
  ];
  const seasonDates = base
    .filter(item => isNbaCupEra(startYear) || !/cup|tournament/i.test(`${item.label} ${item.sublabel ?? ''}`))
    .filter(item => isPlayInEra(startYear) || !/play-in/i.test(`${item.label} ${item.sublabel ?? ''}`))
    .map(item => {
      const shifted = shiftSeasonDate(item.date, seasonEndYear);
      if (item.label === 'All-Star Weekend') return { ...item, date: allStarStart };
      if (item.label === 'Season Resumes') return { ...item, date: addDays(allStarStart, 4) };
      return { ...item, date: shifted };
    });
  if (!internationalWindow) return seasonDates;
  return [
    ...seasonDates,
    {
      date: internationalWindow.markerDate,
      label: internationalWindow.label,
      sublabel: 'Playable international tournament before training camp',
      icon: '🌍',
      zone: 'offseason' as const,
      accentColor: '#34d399',
    },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export const KEY_DATES: KeyDate[] = getKeyDates('modded');

export const TIMELINE_MIN = '2025-08-06';
export const TIMELINE_MAX = '2026-06-29';
export const TIMELINE_DISPLAY_END = '2026-07-10';

export const PBA_TIMELINE_MIN = '2025-10-05';
export const PBA_TIMELINE_MAX = '2026-10-01';
export const PBA_TIMELINE_DISPLAY_END = '2026-10-04';

export const EURO_TIMELINE_MIN = '2025-07-01';
export const EURO_TIMELINE_MAX = '2026-06-29';
export const EURO_TIMELINE_DISPLAY_END = '2026-07-10';

export type PbaDateZone = 'philippineCup' | 'allstar' | 'commissionersCup' | 'governorsCup' | 'offseason';

export function getPbaSeasonEndYear(iso: string): number {
  if (iso.startsWith('2020-')) return 2020;
  const [year, month, day] = iso.split('-').map(Number);
  return month > 10 || (month === 10 && day >= 5) ? year + 1 : year;
}

export function getPbaSeasonLabel(iso: string): string {
  const endYear = getPbaSeasonEndYear(iso);
  return formatPbaSeasonLabel(endYear, getCachedHistoricalPbaSource() ?? undefined);
}

export function getPbaDateContext(iso: string): string {
  const season = getPbaSeasonLabel(iso);
  const position = getPbaCalendarPosition(iso);
  if (position.phase === 'offseason') return `${season} offseason`;
  if (position.conference === 'philippine') return `${season} Philippine Cup`;
  if (position.conference === 'commissioners') return `${season} Commissioner's Cup`;
  return `${season} Governors' Cup`;
}

const addPbaDays = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export function getPbaKeyDates(seasonEndYear = 2026): KeyDate[] {
  const philippine = getConferenceSpec('philippine', seasonEndYear);
  const commissioners = getConferenceSpec('commissioners', seasonEndYear);
  const governors = getConferenceSpec('governors', seasonEndYear);
  const roundDate = (spec: typeof philippine, phase: 'qf' | 'final', edge: 'start' | 'end' = 'start') => {
    const round = spec.playoffFormat?.rounds.find(item => item.phase === phase);
    if (!round) return getConferenceStartIso('philippine', seasonEndYear);
    return dateForCompetitionSeason(spec, seasonEndYear, round[edge].month, round[edge].day).slice(0, 10);
  };
  const philippineStart = getConferenceStartIso('philippine', seasonEndYear);
  const commissionersStart = getConferenceStartIso('commissioners', seasonEndYear);
  const governorsStart = getConferenceStartIso('governors', seasonEndYear);
  const allStarStart = getPbaAllStarWeekendStartIso(seasonEndYear);
  const awardsDate = addPbaDays(roundDate(governors, 'final', 'end'), 1);
  const seasonLabel = formatPbaSeasonLabel(seasonEndYear, getCachedHistoricalPbaSource() ?? undefined);
  return [
    { date: philippineStart, label: `${seasonLabel} Phil. Cup`, sublabel: 'Season-opening All-Filipino conference', icon: '🏀', zone: 'philippineCup' },
    { date: roundDate(philippine, 'qf'), label: 'Phil. Cup Playoffs', sublabel: 'Twice-to-beat quarterfinals', icon: '🏆', zone: 'philippineCup' },
    { date: roundDate(philippine, 'final'), label: 'Phil. Cup Finals', sublabel: 'Best-of-7 championship series', icon: '🏆', zone: 'philippineCup' },
    { date: allStarStart, label: 'All-Star Weekend', sublabel: 'Captain draft, 3-point contest, main event', icon: '⭐', zone: 'allstar' },
    { date: commissionersStart, label: 'Comm. Cup Opening', sublabel: '1 import per team, no height limit', icon: '🏀', zone: 'commissionersCup' },
    { date: commissionersStart, label: 'Import Search', sublabel: 'Sign your conference import', icon: '🔍', zone: 'commissionersCup', placeholder: true, placeholderLabel: 'Import Search — auto-resolved on jump' },
    { date: roundDate(commissioners, 'qf'), label: 'Comm. Cup Playoffs', sublabel: 'Twice-to-beat quarterfinals', icon: '🏆', zone: 'commissionersCup' },
    { date: roundDate(commissioners, 'final'), label: 'Comm. Cup Finals', sublabel: 'Best-of-7 championship series', icon: '🏆', zone: 'commissionersCup' },
    { date: governorsStart, label: 'Gov. Cup Opening', sublabel: '1 import, max 6\'5\" height limit', icon: '🏀', zone: 'governorsCup' },
    { date: governorsStart, label: 'Import Search (6\'5\")', sublabel: 'Height-restricted import signing', icon: '🔍', zone: 'governorsCup', placeholder: true, placeholderLabel: 'Import Search — auto-resolved on jump' },
    { date: roundDate(governors, 'qf'), label: 'Gov. Cup Playoffs', sublabel: 'Twice-to-beat quarterfinals', icon: '🏆', zone: 'governorsCup' },
    { date: roundDate(governors, 'final'), label: 'Gov. Cup Finals', sublabel: 'Best-of-7 championship series', icon: '🏆', zone: 'governorsCup' },
    { date: awardsDate, label: 'Season Awards', sublabel: 'MVP, Mythical Team, Grand Slam check', icon: '🎖️', zone: 'offseason' },
  ];
}

export const PBA_ZONE_COLORS: Record<PbaDateZone, string> = {
  philippineCup:    '#1B4D3E',
  allstar:          '#854d0e',
  commissionersCup: '#C41E3A',
  governorsCup:     '#B8860B',
  offseason:        '#334155',
};

export const PBA_ZONE_LABELS: Record<PbaDateZone, string> = {
  philippineCup:    'Philippine Cup',
  allstar:          'All-Star',
  commissionersCup: "Commissioner's Cup",
  governorsCup:     "Governors' Cup",
  offseason:        'Offseason',
};

export function getEuroKeyDates(): KeyDate[] {
  return [
    { date: '2025-07-01', label: 'Transfer Window',  sublabel: 'Euro offseason opens',                    icon: '↔️', zone: 'transfer' },
    { date: '2025-08-01', label: 'Staff + Sponsors', sublabel: 'Front office planning window',             icon: '💼', zone: 'transfer' },
    { date: '2025-09-01', label: 'Training Camp',    sublabel: 'Camp and friendlies ramp up',              icon: '💪', zone: 'preseason' },
    { date: '2025-09-22', label: 'Supercopa',        sublabel: 'Spanish curtain-raiser',                   icon: '⭐', zone: 'preseason' },
    { date: '2025-09-28', label: 'Endesa Opening',   sublabel: 'Liga Endesa regular season begins',        icon: '🏀', zone: 'endesa' },
    { date: '2025-10-01', label: 'EuroLeague Open',  sublabel: 'Continental regular season begins',        icon: '🏆', zone: 'euroleague' },
    { date: '2026-02-13', label: 'Copa del Rey',     sublabel: 'Domestic cup weekend',                     icon: '🏆', zone: 'cup' },
    { date: '2026-04-17', label: 'EL Reg. Ends',     sublabel: 'EuroLeague regular season closes',         icon: '🏁', zone: 'euroleague' },
    { date: '2026-04-28', label: 'EL Playoffs',      sublabel: 'EuroLeague quarterfinals',                 icon: '⚡', zone: 'postseason' },
    { date: '2026-05-22', label: 'Final Four',       sublabel: 'EuroLeague semifinal and final weekend',   icon: '🏆', zone: 'postseason' },
    { date: '2026-05-30', label: 'Endesa Reg. Ends', sublabel: 'Domestic regular season closes',           icon: '🏁', zone: 'endesa' },
    { date: '2026-06-01', label: 'Endesa Playoffs',  sublabel: 'ACB postseason starts',                   icon: '⚡', zone: 'postseason' },
    { date: '2026-06-20', label: 'Endesa Finals',    sublabel: 'ACB title series begins',                 icon: '🏆', zone: 'postseason' },
    { date: '2026-06-29', label: 'Offseason',        sublabel: 'Season complete, summer window next',      icon: '🏁', zone: 'offseason' },
  ];
}

export const EURO_ZONE_COLORS: Record<EuroDateZone, string> = {
  transfer:   '#0f766e',
  preseason:  '#475569',
  endesa:     '#b91c1c',
  euroleague: '#c2410c',
  cup:        '#a16207',
  postseason: '#7e22ce',
  offseason:  '#334155',
};

export const EURO_ZONE_LABELS: Record<EuroDateZone, string> = {
  transfer:   'Transfer Window',
  preseason:  'Preseason',
  endesa:     'Liga Endesa',
  euroleague: 'EuroLeague',
  cup:        'Copa del Rey',
  postseason: 'Playoffs',
  offseason:  'Offseason',
};

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
