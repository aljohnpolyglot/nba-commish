import type { NBATeam, StaffMember } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import {
  getHistoricalCoachArchive,
  getHistoricalCoachArchiveVersion,
} from './historicalCoachArchive';
import type { StaffRetirementRecord } from './staffRetirement';
import { inferSourceRetirement } from '../retirement/sourceRetirement';

type RawCell = { text?: string; title?: string; href?: string } | string | number | null | undefined;
type RawRow = Record<string, RawCell>;
type RawCoachPage = {
  coach?: { name?: string; isHallOfFame?: boolean; summary?: Record<string, unknown> };
  bio?: { image?: string | null; bornDate?: string | null; fields?: Record<string, string> };
  tables?: Array<{ id?: string; rows?: RawRow[] }> | Record<string, { rows?: RawRow[] }>;
  sections?: { tables?: Record<string, { rows?: RawRow[] }> };
};

export interface HistoricalCoachCandidate {
  name: string;
  team: string;
  teamAbbrev: string;
  position: string;
  role: string;
  image?: string;
  url?: string;
  basketballReferenceUrl?: string;
  basketballReference?: {
    season: string;
    teamAbbrev: string;
    teamName: string;
    role: string;
    games: number;
    wins: number;
    losses: number;
  };
  nationality?: string;
  bornYear?: number;
  bornDate?: string;
  born?: { year?: number; loc?: string; text?: string } | string;
  age?: string;
  careerStartYear?: number;
  hiredYear?: number;
  yearsWithTeam?: number;
  coaching_career?: string;
  career_history?: string;
  contractYears?: number;
  rating: number;
  reputation: number;
  awardsSummary?: string[];
  coachAchievements?: StaffMember['coachAchievements'];
  source: 'historical-nba-coaches';
}

interface HistoricalRow {
  coachName: string;
  season: string;
  seasonEndYear: number;
  seasonStartYear: number;
  age: number;
  teamAbbrev: string;
  teamName: string;
  role: string;
  roleGroup: 'head' | 'assistant' | 'development';
  games: number;
  wins: number;
  losses: number;
  playoffWins: number;
  playoffLosses: number;
  isChampion: boolean;
  isConferenceChampion: boolean;
}

interface HistoricalProfile {
  name: string;
  url?: string;
  isHallOfFame: boolean;
  summary: Record<string, unknown>;
  bio?: RawCoachPage['bio'];
  rows: HistoricalRow[];
  awards: HistoricalCoachAward[];
}

interface HistoricalCoachAward {
  season: string;
  seasonEndYear: number;
  type: string;
}

interface Cache {
  profilesByName: Map<string, HistoricalProfile>;
  headBySeasonTeam: Map<string, HistoricalRow>;
  staffBySeasonTeam: Map<string, HistoricalRow[]>;
  headByTeam: Map<string, HistoricalRow[]>;
  staffByTeam: Map<string, HistoricalRow[]>;
}

let cache: Cache | null = null;
let cacheArchiveVersion = -1;
const MAX_NEAREST_COACH_GAP = 5;

const US_STATES = new Set([
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina',
  'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  'District of Columbia',
]);

function normalizeName(name: string | undefined | null): string {
  return (name ?? '')
    .replace(/\*/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function normalizeTeamKey(value: string | undefined | null): string {
  return (value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function cellText(row: RawRow, key: string): string {
  const cells = ((row as any).cells ?? row) as RawRow;
  const cell = cells[key];
  if (cell == null) return '';
  if (typeof cell === 'object') return String(cell.text ?? cell.title ?? '').trim();
  return String(cell).trim();
}

function cellTitle(row: RawRow, key: string): string {
  const cells = ((row as any).cells ?? row) as RawRow;
  const cell = cells[key];
  if (cell && typeof cell === 'object' && 'title' in cell) return String(cell.title ?? '').trim();
  return '';
}

function hrefFrom(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const href = (value as any).href;
  return typeof href === 'string' && href.trim() ? href.trim() : undefined;
}

function numberFrom(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') return numberFrom((value as any).text ?? (value as any).csk);
  if (typeof value !== 'string') return 0;
  const parsed = Number(value.replace(/[$,%]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSeasonEndYear(season: string): number | null {
  const match = season.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const suffix = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(suffix)) return null;
  const century = Math.floor(start / 100) * 100;
  let end = century + suffix;
  if (end <= start) end += 100;
  return end;
}

function inferRoleGroup(role: string): HistoricalRow['roleGroup'] {
  const lower = role.toLowerCase();
  if (!lower) return 'head';
  if (lower.includes('player development') && !lower.includes('assistant')) return 'development';
  return 'assistant';
}

function normalizeRole(role: string): string {
  const lower = role.toLowerCase();
  if (!lower) return 'Head Coach';
  if (lower.includes('associate')) return 'Associate Head Coach';
  if (lower.includes('lead')) return 'Lead Assistant Coach';
  if (lower.includes('player development') && !lower.includes('assistant')) return 'Player Development Coach';
  if (lower.includes('scout')) return 'Assistant Coach';
  return 'Assistant Coach';
}

function birthplaceFromBorn(born: string | undefined): string | undefined {
  if (!born) return undefined;
  const inIndex = born.lastIndexOf(' in ');
  return (inIndex >= 0 ? born.slice(inIndex + 4) : born).replace(/\.$/, '').trim() || undefined;
}

function nationalityFromBorn(born: string | undefined): string | undefined {
  const place = birthplaceFromBorn(born);
  if (!place) return undefined;
  const parts = place.split(',').map(part => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return undefined;
  if (US_STATES.has(last) || ['USA', 'US', 'United States', 'United States of America'].includes(last)) {
    return 'United States';
  }
  return last;
}

function bornYearFromBio(bio: RawCoachPage['bio']): number | undefined {
  const direct = bio?.bornDate?.match(/^(\d{4})/);
  if (direct) return Number(direct[1]);
  const born = bio?.fields?.Born ?? '';
  const match = born.match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function pageTables(page: RawCoachPage): Array<{ id?: string; rows?: RawRow[] }> {
  const directTables = Array.isArray(page.tables)
    ? page.tables
    : Object.entries(page.tables ?? {}).map(([id, table]) => ({ id, ...table }));
  return directTables;
}

function rowsForTable(page: RawCoachPage, tableId: string): RawRow[] {
  return pageTables(page).find(table => table.id === tableId)?.rows
    ?? page.sections?.tables?.[tableId]?.rows
    ?? [];
}

function tableRows(page: RawCoachPage): RawRow[] {
  return rowsForTable(page, 'coach-stats');
}

function awardsFromPage(page: RawCoachPage): HistoricalCoachAward[] {
  const awards = rowsForTable(page, 'coach-awards').flatMap(row => {
    const season = cellText(row, 'season');
    const seasonEndYear = parseSeasonEndYear(season);
    const type = cellText(row, 'award_id');
    return seasonEndYear && type ? [{ season, seasonEndYear, type }] : [];
  });
  return awards.filter((award, index) => awards.findIndex(candidate => (
    candidate.seasonEndYear === award.seasonEndYear && candidate.type === award.type
  )) === index);
}

function rowFromRaw(page: RawCoachPage, raw: RawRow): HistoricalRow | null {
  const coachName = page.coach?.name?.replace(/\*+$/, '').trim();
  const season = cellText(raw, 'season');
  const endYear = parseSeasonEndYear(season);
  const teamAbbrev = cellText(raw, 'team_id');
  if (!coachName || !endYear || !teamAbbrev) return null;
  const rawRole = cellText(raw, 'role');
  const role = normalizeRole(rawRole);
  const games = numberFrom(cellText(raw, 'g'));
  const wins = numberFrom(cellText(raw, 'wins'));
  const losses = numberFrom(cellText(raw, 'losses'));
  const playoffWins = numberFrom(cellText(raw, 'wins_playoffs'));
  const playoffLosses = numberFrom(cellText(raw, 'losses_playoffs'));
  const remarks = cellText(raw, 'coach_remarks').toLowerCase();
  return {
    coachName,
    season,
    seasonEndYear: endYear,
    seasonStartYear: endYear - 1,
    age: numberFrom(cellText(raw, 'age')),
    teamAbbrev,
    teamName: cellTitle(raw, 'team_id') || teamAbbrev,
    role,
    roleGroup: inferRoleGroup(rawRole),
    games,
    wins,
    losses,
    playoffWins,
    playoffLosses,
    isChampion: remarks.includes('nba champions') || remarks.includes('aba champions'),
    isConferenceChampion: remarks.includes('champions'),
  };
}

function buildCache(): Cache {
  const rawData = getHistoricalCoachArchive() as { coachPages?: RawCoachPage[] };
  const profilesByName = new Map<string, HistoricalProfile>();
  const headBySeasonTeam = new Map<string, HistoricalRow>();
  const staffBySeasonTeam = new Map<string, HistoricalRow[]>();
  const headByTeam = new Map<string, HistoricalRow[]>();
  const staffByTeam = new Map<string, HistoricalRow[]>();
  for (const page of rawData.coachPages ?? []) {
    const name = page.coach?.name?.replace(/\*+$/, '').trim();
    if (!name) continue;
    const rows = tableRows(page).map(row => rowFromRaw(page, row)).filter(Boolean) as HistoricalRow[];
    const profile: HistoricalProfile = {
      name,
      url: hrefFrom((page.coach?.summary as any)?.coach) ?? hrefFrom(page.coach),
      isHallOfFame: !!page.coach?.isHallOfFame,
      summary: page.coach?.summary ?? {},
      bio: page.bio,
      rows,
      awards: awardsFromPage(page),
    };
    profilesByName.set(normalizeName(name), profile);
    for (const row of rows) {
      const teamKey = normalizeTeamKey(row.teamAbbrev);
      const key = `${row.seasonEndYear}|${teamKey}`;
      if (row.roleGroup === 'head') {
        const previous = headBySeasonTeam.get(key);
        if (!previous || row.games > previous.games) headBySeasonTeam.set(key, row);
        const list = headByTeam.get(teamKey) ?? [];
        list.push(row);
        headByTeam.set(teamKey, list);
      } else {
        const list = staffBySeasonTeam.get(key) ?? [];
        if (!list.some(existing => normalizeName(existing.coachName) === normalizeName(row.coachName) && existing.role === row.role)) {
          list.push(row);
          staffBySeasonTeam.set(key, list);
        }
        const teamList = staffByTeam.get(teamKey) ?? [];
        teamList.push(row);
        staffByTeam.set(teamKey, teamList);
      }
    }
  }
  for (const rows of [...headByTeam.values(), ...staffByTeam.values()]) {
    rows.sort((a, b) => a.seasonEndYear - b.seasonEndYear || a.role.localeCompare(b.role) || a.coachName.localeCompare(b.coachName));
  }
  return { profilesByName, headBySeasonTeam, staffBySeasonTeam, headByTeam, staffByTeam };
}

function getCache(): Cache {
  const archiveVersion = getHistoricalCoachArchiveVersion();
  if (!cache || cacheArchiveVersion !== archiveVersion) {
    cache = buildCache();
    cacheArchiveVersion = archiveVersion;
  }
  return cache;
}

function historicalAliasKeys(keys: Set<string>, currentYear: number): string[] {
  const aliases = new Set<string>();
  const hasAny = (...values: string[]) => values.some(value => keys.has(normalizeTeamKey(value)));
  if (hasAny('WAS', 'WSH', 'Washington', 'Washington Wizards', 'Washington Bullets')) {
    if (currentYear <= 1997) aliases.add('WSB');
    if (currentYear <= 1973) aliases.add('BAL');
  }
  if (hasAny('MEM', 'Memphis', 'Memphis Grizzlies', 'Grizzlies') && currentYear <= 2001) aliases.add('VAN');
  if (hasAny('OKC', 'Oklahoma City', 'Oklahoma City Thunder', 'Thunder') && currentYear <= 2008) aliases.add('SEA');
  if (hasAny('BKN', 'BRK', 'Brooklyn', 'Brooklyn Nets', 'New Jersey Nets', 'Nets')) {
    if (currentYear <= 1977) aliases.add('NYN');
    else if (currentYear <= 2012) aliases.add('NJN');
  }
  if (hasAny('CHA', 'CHO', 'Charlotte', 'Charlotte Hornets', 'Hornets')) {
    if (currentYear <= 2002) aliases.add('CHH');
    else if (currentYear >= 2015) aliases.add('CHO');
  }
  if (hasAny('NOP', 'NOH', 'New Orleans', 'New Orleans Pelicans', 'New Orleans Hornets', 'Pelicans')) {
    if (currentYear <= 1979) aliases.add('NOJ');
    else if (currentYear <= 2005 || (currentYear >= 2008 && currentYear <= 2013)) aliases.add('NOH');
    else if (currentYear <= 2007) aliases.add('NOK');
  }
  if (hasAny('LAC', 'Los Angeles Clippers', 'Clippers')) {
    if (currentYear <= 1978) aliases.add('BUF');
    else if (currentYear <= 1984) aliases.add('SDC');
  }
  if (hasAny('SAC', 'Sacramento Kings', 'Kings')) {
    if (currentYear <= 1957) aliases.add('ROC');
    else if (currentYear <= 1972) aliases.add('CIN');
    else if (currentYear <= 1985) aliases.add('KCK');
  }
  if (hasAny('GSW', 'Golden State Warriors', 'Warriors')) {
    if (currentYear <= 1962) aliases.add('PHW');
    else if (currentYear <= 1971) aliases.add('SFW');
  }
  if (hasAny('PHI', 'Philadelphia 76ers', '76ers') && currentYear <= 1963) aliases.add('SYR');
  if (hasAny('ATL', 'Atlanta Hawks', 'Hawks')) {
    if (currentYear <= 1951) aliases.add('TRI');
    else if (currentYear <= 1968) aliases.add('STL');
  }
  if (hasAny('LAL', 'Los Angeles Lakers', 'Lakers') && currentYear <= 1960) aliases.add('MNL');
  if (hasAny('DET', 'Detroit Pistons', 'Pistons') && currentYear <= 1957) aliases.add('FTW');
  if (hasAny('HOU', 'Houston Rockets', 'Rockets') && currentYear <= 1971) aliases.add('SDR');
  if (hasAny('UTA', 'Utah Jazz', 'Jazz') && currentYear <= 1979) aliases.add('NOJ');
  return [...aliases].map(normalizeTeamKey);
}

function teamKeys(team: NBATeam, currentYear: number): string[] {
  const out = new Set<string>();
  const snapshot = getHistoricalTeamSnapshot(team, currentYear);
  const pushTeamLike = (value: any) => {
    out.add(normalizeTeamKey(value?.abbrev));
    out.add(normalizeTeamKey(value?.region));
    out.add(normalizeTeamKey(value?.name));
    out.add(normalizeTeamKey(`${value?.region ?? ''} ${value?.name ?? ''}`));
  };
  pushTeamLike(team);
  pushTeamLike(snapshot);
  for (const season of [...((team as any).identitySeasons ?? []), ...((team as any).seasons ?? [])]) {
    const seasonYear = Number(season?.season);
    if (Number.isFinite(seasonYear) && seasonYear <= currentYear) {
      pushTeamLike(season);
    }
  }
  for (const alias of historicalAliasKeys(out, currentYear)) out.add(alias);
  return [...out].filter(Boolean);
}

function seasonDistance(row: HistoricalRow, currentYear: number): number {
  if (currentYear >= row.seasonStartYear && currentYear <= row.seasonEndYear) return 0;
  return Math.min(Math.abs(row.seasonStartYear - currentYear), Math.abs(row.seasonEndYear - currentYear));
}

function nearestSort(currentYear: number) {
  return (a: HistoricalRow, b: HistoricalRow) => {
    const distance = seasonDistance(a, currentYear) - seasonDistance(b, currentYear);
    if (distance !== 0) return distance;
    const aStartsAtYear = a.seasonStartYear === currentYear ? 0 : 1;
    const bStartsAtYear = b.seasonStartYear === currentYear ? 0 : 1;
    if (aStartsAtYear !== bStartsAtYear) return aStartsAtYear - bStartsAtYear;
    return a.seasonEndYear - b.seasonEndYear || b.games - a.games || a.coachName.localeCompare(b.coachName);
  };
}

function findNearestHeadRow(keys: string[], currentYear: number): HistoricalRow | undefined {
  const { headBySeasonTeam, headByTeam } = getCache();
  const exact = keys.map(key => headBySeasonTeam.get(`${currentYear}|${key}`)).find(Boolean);
  if (exact) return exact;
  return keys
    .flatMap(key => headByTeam.get(key) ?? [])
    .filter(row => row.seasonStartYear <= currentYear)
    .filter(row => seasonDistance(row, currentYear) <= MAX_NEAREST_COACH_GAP)
    .sort(nearestSort(currentYear))[0];
}

function findNearestStaffRows(keys: string[], currentYear: number): HistoricalRow[] {
  const { staffBySeasonTeam, staffByTeam } = getCache();
  const exact = keys.flatMap(key => staffBySeasonTeam.get(`${currentYear}|${key}`) ?? []);
  if (exact.length > 0) return exact;
  const nearest = keys
    .flatMap(key => staffByTeam.get(key) ?? [])
    .filter(row => row.seasonStartYear <= currentYear)
    .filter(row => seasonDistance(row, currentYear) <= MAX_NEAREST_COACH_GAP)
    .sort(nearestSort(currentYear));
  const bestDistance = nearest[0] ? seasonDistance(nearest[0], currentYear) : Infinity;
  const seen = new Set<string>();
  return nearest.filter(row => {
    if (seasonDistance(row, currentYear) !== bestDistance) return false;
    const key = `${normalizeName(row.coachName)}|${row.role}|${row.teamAbbrev}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function statsThrough(profile: HistoricalProfile, cutoffYear?: number) {
  const useFull = cutoffYear == null || cutoffYear >= numberFrom(profile.summary.season_max);
  if (useFull) {
    return {
      games: numberFrom(profile.summary.g),
      wins: numberFrom(profile.summary.wins),
      losses: numberFrom(profile.summary.losses),
      playoffWins: numberFrom(profile.summary.wins_playoffs),
      playoffLosses: numberFrom(profile.summary.losses_playoffs),
      titles: numberFrom(profile.summary.years_league_champion),
      conferenceTitles: numberFrom(profile.summary.years_conference_champion),
    };
  }
  return profile.rows
    .filter(row => row.roleGroup === 'head' && row.seasonEndYear <= cutoffYear)
    .reduce((acc, row) => {
      acc.games += row.games;
      acc.wins += row.wins;
      acc.losses += row.losses;
      acc.playoffWins += row.playoffWins;
      acc.playoffLosses += row.playoffLosses;
      if (row.isChampion) acc.titles += 1;
      if (row.isConferenceChampion) acc.conferenceTitles += 1;
      return acc;
    }, { games: 0, wins: 0, losses: 0, playoffWins: 0, playoffLosses: 0, titles: 0, conferenceTitles: 0 });
}

function ratingForProfile(profile: HistoricalProfile, role: string, cutoffYear?: number): number {
  const stats = statsThrough(profile, cutoffYear);
  const activeRows = profile.rows.filter(row => cutoffYear == null || row.seasonEndYear <= cutoffYear);
  const assistantBaseline = role === 'Head Coach' ? 0 : (() => {
    const seasons = new Set(activeRows.map(row => row.seasonEndYear)).size;
    const seniorYears = activeRows.filter(row => row.role.includes('Associate') || row.role.includes('Lead')).length;
    const titleYears = activeRows.filter(row => row.isChampion).length;
    const base = 62 + Math.min(18, seasons * 1.35) + Math.min(6, seniorYears * 1.5) + Math.min(6, titleYears * 1.25);
    return Math.max(55, Math.min(88, Math.round(base)));
  })();
  const regularGames = Math.max(1, stats.wins + stats.losses);
  const playoffGames = Math.max(1, stats.playoffWins + stats.playoffLosses);
  const winPct = stats.wins / regularGames;
  const playoffPct = stats.playoffWins / playoffGames;
  const titleScore = stats.titles * 3.6;
  const finalsScore = stats.conferenceTitles * 0.5;
  const volumeScore = Math.min(6, Math.log10(Math.max(1, stats.games) + 1) * 2);
  const hofBonus = profile.isHallOfFame && (cutoffYear == null || cutoffYear >= numberFrom(profile.summary.season_max)) ? 2 : 0;
  const base = role === 'Head Coach' ? 54 : 48;
  const rating = base + winPct * 25 + playoffPct * 8 + titleScore + finalsScore + volumeScore + hofBonus;
  const floor = role === 'Head Coach' ? 58 : 52;
  const cap = role === 'Head Coach' ? 99 : 92;
  return Math.max(assistantBaseline, Math.max(floor, Math.min(cap, Math.round(rating))));
}

function compactResume(profile: HistoricalProfile, cutoffYear: number): string {
  const rows = profile.rows
    .filter(row => row.seasonEndYear <= cutoffYear)
    .sort((a, b) => a.seasonEndYear - b.seasonEndYear);
  const ranges: Array<{ start: number; end: number; team: string; role: string }> = [];
  for (const row of rows) {
    const last = ranges[ranges.length - 1];
    if (last && last.end + 1 === row.seasonEndYear && last.team === row.teamAbbrev && last.role === row.role) {
      last.end = row.seasonEndYear;
    } else {
      ranges.push({ start: row.seasonStartYear, end: row.seasonEndYear, team: row.teamAbbrev, role: row.role });
    }
  }
  return ranges
    .map(range => `${range.start}-${String(range.end).slice(-2)} ${range.team} ${range.role}`)
    .join('\n');
}

function hiredYearFor(profile: HistoricalProfile, current: HistoricalRow, currentYear: number): number {
  const rows = profile.rows
    .filter(row => row.teamAbbrev === current.teamAbbrev && row.roleGroup === current.roleGroup && row.seasonEndYear <= currentYear)
    .sort((a, b) => b.seasonEndYear - a.seasonEndYear);
  let expected = currentYear;
  let start = current.seasonStartYear;
  for (const row of rows) {
    if (row.seasonEndYear !== expected) break;
    start = row.seasonStartYear;
    expected -= 1;
  }
  return start;
}

function contractYearsFor(role: string, rating: number, currentYear: number): number {
  const eraMax = currentYear < 1980 ? 3 : currentYear < 2010 ? 4 : 5;
  if (role === 'Head Coach') {
    if (rating >= 95) return eraMax;
    if (rating >= 86) return Math.min(4, eraMax);
    return Math.min(3, eraMax);
  }
  return rating >= 82 ? Math.min(3, eraMax) : 2;
}

function candidateFromRow(row: HistoricalRow, team: NBATeam, slotRole: string, currentYear: number): HistoricalCoachCandidate | null {
  const profile = getCache().profilesByName.get(normalizeName(row.coachName));
  if (!profile) return null;
  const born = profile.bio?.fields?.Born;
  const bornYear = bornYearFromBio(profile.bio);
  const cutoffYear = Math.max(1947, currentYear - 1, row.seasonEndYear);
  const rating = ratingForProfile(profile, slotRole, cutoffYear);
  const hiredYear = hiredYearFor(profile, row, currentYear);
  const coachAchievements = getHistoricalCoachAchievements(profile.name, currentYear - 1);
  return {
    name: profile.name,
    team: getTeamFullName(team),
    teamAbbrev: row.teamAbbrev,
    position: row.role,
    role: slotRole,
    image: profile.bio?.image ?? undefined,
    url: profile.url,
    basketballReferenceUrl: profile.url,
    basketballReference: {
      season: row.season,
      teamAbbrev: row.teamAbbrev,
      teamName: row.teamName,
      role: row.role,
      games: row.games,
      wins: row.wins,
      losses: row.losses,
    },
    nationality: nationalityFromBorn(born),
    bornYear,
    bornDate: profile.bio?.bornDate ?? undefined,
    born: born ? { year: bornYear, loc: birthplaceFromBorn(born), text: born } : undefined,
    age: row.age ? String(row.age) : bornYear ? String(Math.max(0, currentYear - bornYear)) : undefined,
    careerStartYear: profile.rows.reduce((min, item) => Math.min(min, item.seasonStartYear), currentYear),
    hiredYear,
    yearsWithTeam: Math.max(0, currentYear - hiredYear),
    coaching_career: compactResume(profile, cutoffYear),
    career_history: compactResume(profile, cutoffYear),
    contractYears: contractYearsFor(slotRole, rating, currentYear),
    rating,
    reputation: rating,
    awardsSummary: coachAchievements.map(achievement => achievement.label),
    coachAchievements,
    source: 'historical-nba-coaches',
  };
}

export function buildHistoricalStaffCandidatesForTeam(team: NBATeam, currentYear: number): HistoricalCoachCandidate[] {
  const keys = teamKeys(team, currentYear);
  const candidates: HistoricalCoachCandidate[] = [];
  const head = findNearestHeadRow(keys, currentYear);
  if (head) {
    const candidate = candidateFromRow(head, team, 'Head Coach', currentYear);
    if (candidate) candidates.push(candidate);
  }
  const staffRows = findNearestStaffRows(keys, currentYear);
  const sortedStaffRows = [...staffRows].sort((a, b) => {
    const priority = (role: string) => role.includes('Associate') ? 0 : role.includes('Lead') ? 1 : role.includes('Player Development') ? 3 : 2;
    return priority(a.role) - priority(b.role) || a.coachName.localeCompare(b.coachName);
  });
  let assistantIndex = 0;
  for (const row of sortedStaffRows) {
    const slotRole = row.roleGroup === 'development'
      ? 'Player Development Coach'
      : ['Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'][assistantIndex++];
    if (!slotRole) continue;
    const candidate = candidateFromRow(row, team, slotRole, currentYear);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

export function buildHistoricalNbaStaffRetirementAnnouncements(
  teams: NBATeam[],
  cutoffYear: number,
): StaffRetirementRecord[] {
  const profiles = [...getCache().profilesByName.values()];
  const sourceCoverageThrough = profiles.reduce(
    (latest, profile) => profile.rows.reduce(
      (profileLatest, row) => Math.max(profileLatest, row.seasonEndYear),
      latest,
    ),
    cutoffYear,
  );
  const resolveTeam = (abbrev: string) => teams.find(team =>
    teamKeys(team, cutoffYear).includes(normalizeTeamKey(abbrev)),
  );

  return profiles.flatMap(profile => {
    const bornYear = bornYearFromBio(profile.bio);
    const retirement = inferSourceRetirement(
      {
        bornYear,
        season_max: profile.summary.season_max,
        assignments: profile.rows.map(row => ({ season: row.seasonEndYear, games: Math.max(1, row.games) })),
      },
      {
        branchCutoffYear: cutoffYear,
        sourceCoverageThrough,
        kind: 'staff',
        confirmThroughSourceCoverage: true,
      },
    );
    if (retirement?.retiredYear !== cutoffYear) return [];

    const latest = [...profile.rows]
      .filter(row => row.seasonEndYear <= cutoffYear)
      .sort((left, right) => right.seasonEndYear - left.seasonEndYear || right.games - left.games)[0];
    if (!latest) return [];
    const team = resolveTeam(latest.teamAbbrev);
    const seasons = new Set(
      profile.rows
        .filter(row => row.seasonEndYear <= cutoffYear)
        .map(row => row.seasonEndYear),
    );
    const yearsExperience = seasons.size;
    const age = bornYear
      ? Math.max(0, cutoffYear - bornYear)
      : Math.max(55, latest.age || 65);
    const yearsWithTeam = new Set(
      profile.rows
        .filter(row => row.seasonEndYear <= cutoffYear && row.teamAbbrev === latest.teamAbbrev)
        .map(row => row.seasonEndYear),
    ).size;

    return [{
      id: `source-nba-staff-retire-${normalizeName(profile.name)}-${cutoffYear}`,
      name: profile.name,
      role: latest.role,
      portraitUrl: profile.bio?.image ?? undefined,
      teamName: team ? getTeamFullName(team) : latest.teamName,
      teamId: team?.id,
      teamAbbrev: team?.abbrev ?? latest.teamAbbrev,
      teamLogoUrl: team?.logoUrl,
      leagueId: 'nba',
      age,
      season: cutoffYear,
      retiredDate: `${cutoffYear}-06-30`,
      reason: 'age',
      reasonLabel: 'retired after a long career',
      motivation: 'legacy_winner',
      desireScore: 100,
      yearsExperience,
      experienceLabel: `${yearsExperience} yr${yearsExperience === 1 ? '' : 's'}`,
      yearsWithTeam,
      postRetirementPath: 'none',
      farewellTourEligible: yearsExperience >= 30,
      offseasonRow: 'staffSignings',
      requiresReplacement: false,
      coachAchievements: [],
      hallOfFameEligible: profile.isHallOfFame,
      hallOfFameScore: profile.isHallOfFame ? 100 : 0,
      sourceRetirement: retirement,
    }];
  });
}

export function getHistoricalCoachPhoto(name: string): string | undefined {
  return getCache().profilesByName.get(normalizeName(name))?.bio?.image ?? undefined;
}

export function getHistoricalCoachAchievements(
  name: string,
  cutoffYear: number,
): NonNullable<StaffMember['coachAchievements']> {
  const profile = getCache().profilesByName.get(normalizeName(name));
  if (!profile) return [];
  return profile.awards
    .filter(award => award.seasonEndYear <= cutoffYear)
    .map(award => {
      const teamRow = profile.rows.find(row => row.seasonEndYear === award.seasonEndYear && row.roleGroup === 'head')
        ?? profile.rows.find(row => row.seasonEndYear === award.seasonEndYear);
      return {
        season: award.seasonEndYear,
        type: award.type,
        label: `${award.seasonEndYear} ${award.type}`,
        league: 'nba',
        teamName: teamRow?.teamName,
        role: teamRow?.role ?? 'Head Coach',
      };
    });
}

export function getHistoricalCoachBio(name: string) {
  const profile = getCache().profilesByName.get(normalizeName(name));
  if (!profile) return undefined;
  const firstSeason = numberFrom(profile.summary.season_min);
  const lastSeason = numberFrom(profile.summary.season_max);
  const years = numberFrom(profile.summary.years);
  const born = profile.bio?.fields?.Born;
  return {
    staff: profile.name,
    team: '',
    startSeason: firstSeason && lastSeason ? `${firstSeason}-${lastSeason}` : '',
    yearsInRole: years || Math.max(0, lastSeason - firstSeason + 1),
    birthDate: profile.bio?.bornDate ?? null,
    nationality: nationalityFromBorn(born) ?? 'Unknown',
    img: profile.bio?.image ?? undefined,
  };
}

export function getHistoricalCoachOverall(name: string, cutoffYear?: number): number | undefined {
  const profile = getCache().profilesByName.get(normalizeName(name));
  return profile ? ratingForProfile(profile, 'Head Coach', cutoffYear) : undefined;
}
