import {
  getHistoricalCoachArchive,
  getHistoricalCoachArchiveVersion,
} from './historicalCoachArchive';
import type { GameState, NBAPlayer, StaffMember } from '../../types';
import type { StaffAttributes } from '../../TeamTraining/types';
import { getStaffMarketSalary } from '../tycoon/economyScale';
import { computeStaffProbability } from '../../utils/staffprobability';

type RawCell = { text?: string; title?: string; href?: string } | string | number | null | undefined;
type RawRow = { cells?: Record<string, RawCell> } & Record<string, RawCell>;
type RawCoachPage = {
  coach?: { name?: string; isHallOfFame?: boolean; summary?: Record<string, RawCell> };
  bio?: { image?: string | null; bornDate?: string | null; fields?: Record<string, string> };
  tables?: Array<{ id?: string; rows?: RawRow[] }>;
};

type CoachRole = 'Head Coach' | 'Assistant Coach' | 'Player Development Coach';

interface CoachDebutProfile {
  key: string;
  name: string;
  url?: string;
  image?: string;
  bornText?: string;
  bornYear?: number;
  nationality?: string;
  isHallOfFame: boolean;
  summary: Record<string, RawCell>;
  rows: CoachDebutRow[];
  debutRow: CoachDebutRow;
}

interface CoachDebutRow {
  season: string;
  seasonEndYear: number;
  seasonStartYear: number;
  age: number;
  teamAbbrev: string;
  teamName: string;
  role: CoachRole;
  rawRole: string;
  games: number;
  wins: number;
  losses: number;
  playoffWins: number;
  playoffLosses: number;
  champion: boolean;
}

interface HistoricalStaffPoolContext {
  state: Pick<GameState, 'teams' | 'staffFreeAgents' | 'leagueStats'> & { players?: NBAPlayer[] };
  currentYear: number;
  staffFreeAgents?: StaffMember[];
}

let debutCache: Map<string, CoachDebutProfile> | null = null;
let debutCacheArchiveVersion = -1;

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

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .replace(/\*/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function slug(value: string): string {
  return normalizeName(value) || String(value ?? 'coach').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function cell(row: RawRow, key: string): RawCell {
  return (row.cells ?? row)[key];
}

function text(row: RawRow, key: string): string {
  const value = cell(row, key);
  if (value == null) return '';
  if (typeof value === 'object') return String(value.text ?? value.title ?? '').trim();
  return String(value).trim();
}

function title(row: RawRow, key: string): string {
  const value = cell(row, key);
  return value && typeof value === 'object' ? String(value.title ?? '').trim() : '';
}

function href(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const url = (value as any).href;
  return typeof url === 'string' && url.trim() ? url.trim() : undefined;
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
  let end = Math.floor(start / 100) * 100 + Number(match[2]);
  if (end <= start) end += 100;
  return Number.isFinite(end) ? end : null;
}

function roleFrom(rawRole: string): CoachRole {
  const lower = rawRole.toLowerCase();
  if (!lower) return 'Head Coach';
  if (lower.includes('player development') && !lower.includes('assistant')) return 'Player Development Coach';
  return 'Assistant Coach';
}

function birthplace(born?: string): string | undefined {
  if (!born) return undefined;
  const idx = born.lastIndexOf(' in ');
  return (idx >= 0 ? born.slice(idx + 4) : born).replace(/\.$/, '').trim() || undefined;
}

function nationalityFromBorn(born?: string): string | undefined {
  const place = birthplace(born);
  const last = place?.split(',').map(part => part.trim()).filter(Boolean).pop();
  if (!last) return undefined;
  if (US_STATES.has(last) || ['USA', 'US', 'United States', 'United States of America'].includes(last)) {
    return 'United States';
  }
  return last;
}

function bornYearFromBio(bio: RawCoachPage['bio']): number | undefined {
  const direct = bio?.bornDate?.match(/^(\d{4})/);
  if (direct) return Number(direct[1]);
  const match = String(bio?.fields?.Born ?? '').match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function rowsFor(page: RawCoachPage): RawRow[] {
  return page.tables?.find(table => table.id === 'coach-stats')?.rows ?? [];
}

function rowFrom(page: RawCoachPage, row: RawRow): CoachDebutRow | null {
  const season = text(row, 'season');
  const seasonEndYear = parseSeasonEndYear(season);
  const teamAbbrev = text(row, 'team_id');
  if (!seasonEndYear || !teamAbbrev) return null;
  const rawRole = text(row, 'role');
  const remarks = text(row, 'coach_remarks').toLowerCase();
  return {
    season,
    seasonEndYear,
    seasonStartYear: seasonEndYear - 1,
    age: numberFrom(text(row, 'age')),
    teamAbbrev,
    teamName: title(row, 'team_id') || teamAbbrev,
    role: roleFrom(rawRole),
    rawRole: rawRole || 'Head Coach',
    games: numberFrom(text(row, 'g')),
    wins: numberFrom(text(row, 'wins')),
    losses: numberFrom(text(row, 'losses')),
    playoffWins: numberFrom(text(row, 'wins_playoffs')),
    playoffLosses: numberFrom(text(row, 'losses_playoffs')),
    champion: remarks.includes('champions'),
  };
}

function buildCache(): Map<string, CoachDebutProfile> {
  const rawData = getHistoricalCoachArchive() as { coachPages?: RawCoachPage[] };
  const out = new Map<string, CoachDebutProfile>();
  for (const page of rawData.coachPages ?? []) {
    const name = page.coach?.name?.replace(/\*+$/, '').trim();
    if (!name) continue;
    const rows = rowsFor(page).map(row => rowFrom(page, row)).filter(Boolean) as CoachDebutRow[];
    if (rows.length === 0) continue;
    rows.sort((a, b) => a.seasonEndYear - b.seasonEndYear || a.role.localeCompare(b.role));
    const bornText = page.bio?.fields?.Born;
    out.set(normalizeName(name), {
      key: normalizeName(name),
      name,
      url: href((page.coach?.summary as any)?.coach) ?? href(page.coach),
      image: page.bio?.image ?? undefined,
      bornText,
      bornYear: bornYearFromBio(page.bio),
      nationality: nationalityFromBorn(bornText),
      isHallOfFame: !!page.coach?.isHallOfFame,
      summary: page.coach?.summary ?? {},
      rows,
      debutRow: rows[0],
    });
  }
  return out;
}

function profiles(): Map<string, CoachDebutProfile> {
  const archiveVersion = getHistoricalCoachArchiveVersion();
  if (!debutCache || debutCacheArchiveVersion !== archiveVersion) {
    debutCache = buildCache();
    debutCacheArchiveVersion = archiveVersion;
  }
  return debutCache;
}

function activeAndPoolNames(state: HistoricalStaffPoolContext['state'], extraPool: StaffMember[]): Set<string> {
  const names = new Set<string>();
  for (const team of state.teams ?? []) {
    for (const member of ((team as any).tycoon?.staffMembers ?? []) as any[]) {
      const key = normalizeName(member?.name);
      if (key) names.add(key);
    }
  }
  for (const member of [...(state.staffFreeAgents ?? []), ...extraPool]) {
    const key = normalizeName(member?.name);
    if (key) names.add(key);
  }
  return names;
}

function activeStaffNames(state: HistoricalStaffPoolContext['state']): Set<string> {
  const names = new Set<string>();
  for (const team of state.teams ?? []) {
    for (const member of ((team as any).tycoon?.staffMembers ?? []) as any[]) {
      const key = normalizeName(member?.name);
      if (key) names.add(key);
    }
  }
  return names;
}

function baseRole(role: string | undefined | null): string {
  const cleaned = String(role ?? '').replace(/ \d+$/, '').trim();
  return cleaned || 'Staff';
}

function poolRoleKeys(members: StaffMember[]): Set<string> {
  const keys = new Set<string>();
  for (const member of members) {
    const name = normalizeName(member?.name);
    if (!name) continue;
    keys.add(`${name}|${baseRole(member?.role ?? member?.position ?? member?.jobTitle)}`);
  }
  return keys;
}

function milestoneRows(profile: CoachDebutProfile): CoachDebutRow[] {
  const milestones = new Map<CoachRole, CoachDebutRow>();
  for (const row of profile.rows) {
    if (!milestones.has(row.role)) milestones.set(row.role, row);
  }
  return [...milestones.values()];
}

function joinedKey(profile: CoachDebutProfile, row: CoachDebutRow, role: CoachRole): string {
  return `${profile.key}|${baseRole(role)}|${row.seasonEndYear}`;
}

function hasJoined(seenKeys: Set<string>, profile: CoachDebutProfile, row: CoachDebutRow, role: CoachRole): boolean {
  if (seenKeys.has(joinedKey(profile, row, role))) return true;
  return row === profile.debutRow && role === profile.debutRow.role && seenKeys.has(profile.key);
}

function historicalRating(profile: CoachDebutProfile, currentYear: number, role: CoachRole): number {
  const rows = profile.rows.filter(row => row.seasonEndYear <= currentYear);
  const games = rows.reduce((sum, row) => sum + row.games, 0);
  const wins = rows.reduce((sum, row) => sum + row.wins, 0);
  const losses = rows.reduce((sum, row) => sum + row.losses, 0);
  const titles = rows.filter(row => row.champion).length;
  if (role !== 'Head Coach' || games === 0) {
    const seasons = new Set(rows.map(row => row.seasonEndYear)).size;
    return Math.max(56, Math.min(88, Math.round(62 + Math.min(20, seasons * 1.4) + Math.min(6, titles * 1.4))));
  }
  const winPct = wins + losses > 0 ? wins / (wins + losses) : 0.5;
  return Math.max(58, Math.min(99, Math.round(54 + winPct * 25 + Math.min(8, titles * 3.5) + Math.min(7, Math.log10(games + 1) * 2))));
}

function basketballReference(profile: CoachDebutProfile, row: CoachDebutRow) {
  return {
    season: row.season,
    teamAbbrev: row.teamAbbrev,
    teamName: row.teamName,
    role: row.rawRole,
    games: row.games,
    wins: row.wins,
    losses: row.losses,
  };
}

function baseHistoricalStaff(
  profile: CoachDebutProfile,
  currentYear: number,
  role = profile.debutRow.role,
  anchorRow?: CoachDebutRow,
): StaffMember {
  const row = anchorRow ?? profile.rows.find(item => item.seasonEndYear <= currentYear) ?? profile.debutRow;
  const rating = historicalRating(profile, Math.max(row.seasonEndYear, currentYear), role);
  const yearsExperience = Math.max(0, currentYear - profile.debutRow.seasonStartYear);
  return {
    id: `historical-coach-pool-${slug(profile.name)}-${baseRole(role).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${row.seasonEndYear}`,
    name: profile.name,
    role,
    position: role,
    jobTitle: role,
    leagueId: 'nba',
    team: '',
    nationality: profile.nationality ?? 'United States',
    playerPortraitUrl: profile.image,
    staffImageId: undefined,
    bornYear: profile.bornYear,
    careerStartYear: profile.debutRow.seasonStartYear,
    yearsWithTeam: 0,
    contractYears: 0,
    rating,
    reputation: rating,
    salary: getStaffMarketSalary(undefined, role, rating, { yearsExperience, yearsWithTeam: 0 }),
    isPlaceholder: false,
    attributeSeed: numberFrom(profile.summary.ranker) || undefined,
    attributeProfile: 'nba',
    source: 'historical-coach-pool',
    basketballReferenceUrl: profile.url,
    basketballReference: basketballReference(profile, row),
    born: profile.bornText ? { year: profile.bornYear, loc: birthplace(profile.bornText), text: profile.bornText } : undefined,
    age: row.age ? String(row.age) : profile.bornYear ? String(currentYear - profile.bornYear) : undefined,
  } as StaffMember;
}

function playerStaffCandidate(player: NBAPlayer, profile: CoachDebutProfile, currentYear: number): StaffMember {
  const probability = computeStaffProbability(player);
  const role = profile.debutRow.role;
  const historical = baseHistoricalStaff(profile, currentYear, role) as any;
  const playerRating = Math.round(Math.max(55, Math.min(91, 56 + probability.staffJoinChance * 0.38 + probability.rawScore * 0.22)));
  const rating = Math.round(playerRating * 0.45 + Number(historical.rating ?? playerRating) * 0.55);
  return {
    ...historical,
    id: `historical-retiree-staff-${player.internalId}-${profile.debutRow.seasonEndYear}`,
    name: player.name,
    playerPortraitUrl: historical.playerPortraitUrl ?? player.imgURL,
    face: player.face,
    bornYear: player.born?.year ?? historical.bornYear,
    nationality: player.born?.loc?.split(',').pop()?.trim() || historical.nationality,
    rating,
    reputation: rating,
    salary: getStaffMarketSalary(undefined, role, rating, { yearsExperience: Math.max(1, probability.totalGP / 82), yearsWithTeam: 0 }),
    attributeProfile: 'default',
    attributeOverrides: probability.attributes as Partial<StaffAttributes>,
    sourcePlayerId: player.internalId,
    source: 'historical-retired-player-staff',
    staffJoinChance: 100,
    staffArchetype: probability.badge,
  } as StaffMember;
}

function isRetiredPlayer(player: NBAPlayer, currentYear: number): boolean {
  if (Number(player.tid ?? -1) >= 0 && Number(player.tid ?? -1) < 100) return false;
  const retiredYear = Number(player.retiredYear ?? 0);
  return player.status === 'Retired' || player.tid === -3 || (retiredYear > 0 && retiredYear <= currentYear);
}

export function buildHistoricalRetiredPlayerStaffCandidates(
  state: HistoricalStaffPoolContext['state'],
  players: NBAPlayer[],
  currentYear: number,
  extraPool: StaffMember[] = [],
): { candidates: StaffMember[]; joinedPlayers: Array<{ playerId: string; role: string }> } {
  const names = activeAndPoolNames(state, extraPool);
  const candidates: StaffMember[] = [];
  const joinedPlayers: Array<{ playerId: string; role: string }> = [];
  for (const player of players) {
    if (!player.internalId || player.postCareerStaffJoined || !isRetiredPlayer(player, currentYear)) continue;
    const profile = profiles().get(normalizeName(player.name));
    if (!profile || profile.debutRow.seasonEndYear > currentYear) continue;
    const key = normalizeName(player.name);
    const role = profile.debutRow.role;
    joinedPlayers.push({ playerId: player.internalId, role });
    if (names.has(key)) continue;
    const candidate = playerStaffCandidate(player, profile, currentYear);
    candidates.push(candidate);
    names.add(key);
  }
  return { candidates, joinedPlayers };
}

export function buildHistoricalNonPlayerCoachPoolAdditions({
  state,
  currentYear,
  staffFreeAgents = [],
}: HistoricalStaffPoolContext): { additions: StaffMember[]; joinedKeys: string[] } {
  const seenKeys = new Set<string>((state.leagueStats as any)?.historicalCoachPoolJoinedKeys ?? []);
  const playerNames = new Set((state.players ?? []).map(player => normalizeName(player.name)).filter(Boolean));
  const activeNames = activeStaffNames(state);
  const existingPoolRoleKeys = poolRoleKeys([...(state.staffFreeAgents ?? []), ...staffFreeAgents]);
  const additions: StaffMember[] = [];
  const joinedKeys = [...seenKeys];
  for (const profile of profiles().values()) {
    if (playerNames.has(profile.key) || activeNames.has(profile.key)) continue;
    for (const row of milestoneRows(profile)) {
      const role = row.role;
      if (row.seasonEndYear !== currentYear) continue;
      const key = joinedKey(profile, row, role);
      const roleKey = `${profile.key}|${baseRole(role)}`;
      if (hasJoined(seenKeys, profile, row, role) || existingPoolRoleKeys.has(roleKey)) continue;
      const candidate = baseHistoricalStaff(profile, currentYear, role, row);
      additions.push(candidate);
      existingPoolRoleKeys.add(roleKey);
      seenKeys.add(key);
      joinedKeys.push(key);
    }
  }
  return { additions, joinedKeys };
}
