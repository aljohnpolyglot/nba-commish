import type { NBATeam, NonNBATeam, StaffMember } from '../../types';
import type { StaffAttributes } from '../../TeamTraining/types';
import { getPrimaryPlayerCountry } from '../../utils/playerNationality';
import { getTeamFullName } from '../../utils/teamNames';
import { buildStaffAttrs, computeStaffOverall } from '../staff/displayAttributes';
import { classifyCoachRoleText, classifyInlineCoachRole, cleanInlineCoachRoleTags, type HistoricalCoachCareerRole } from '../staff/coachRoleTags';
import { getStaffMarketSalary } from '../tycoon/economyScale';
import {
  getCachedEuropeanCoachSource,
  loadEuropeanCoachSource,
  type EuropeanCoachSource,
  type EuropeanCoachSourceCoach,
  type SourceCareerRow,
} from './europeanCoachRemote';
import { inferEuroStaffLeagueId, isEuroStaffLeagueId } from './staffPool';
import { getEuroHistoricalEconomyFactor } from './historicalEconomy';
import { inferSourceRetirement } from '../retirement/sourceRetirement';
import type { StaffRetirementRecord } from '../staff/staffRetirement';

export { getCachedEuropeanCoachSource, loadEuropeanCoachSource };

type CareerRole = HistoricalCoachCareerRole;
type CareerEntry = { role: CareerRole; start: number; end: number; team: string };
type PreparedCoach = { coach: EuropeanCoachSourceCoach; entries: CareerEntry[] };

export type EuropeanCoachSnapshot = {
  teams: NonNBATeam[];
  staffFreeAgents: StaffMember[];
  assignedCoachCount: number;
  retirementAnnouncements: StaffRetirementRecord[];
  sourceVersion: string;
  snapshotYear: number;
};

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(?:basketball|basket|baloncesto|pallacanestro|club|bc|bk|kk|cb)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const compact = (value: unknown): string => normalize(value).replace(/\s+/g, '');

function splitYears(value: string | undefined): Array<{ start: number; end: number }> {
  const text = String(value ?? '').replace(/[–—]/g, '-');
  return text.split(',').flatMap(part => {
    const match = part.trim().match(/((?:19|20)\d{2})(?:\s*-\s*((?:19|20)\d{2}|present))?/i);
    if (!match) return [];
    const start = Number(match[1]);
    const end = match[2]?.toLowerCase() === 'present' ? 9999 : Number(match[2] ?? start);
    return Number.isFinite(start) && Number.isFinite(end) ? [{ start, end }] : [];
  });
}

function roleFromRow(team: string, coach: EuropeanCoachSourceCoach): CareerRole {
  const inlineRole = classifyInlineCoachRole(team);
  if (inlineRole) return inlineRole;
  const current = coach.currentBasketballRole;
  if (current?.team && clubScore(team, [current.team]) >= 80) {
    return classifyCoachRoleText(current.position) ?? 'head';
  }
  return 'head';
}

function cleanCareerTeam(value: unknown): string {
  return cleanInlineCoachRoleTags(value);
}

function hasCoachingOtherRows(coach: EuropeanCoachSourceCoach, rows: SourceCareerRow[]): boolean {
  if (coach.careerInformation?.coachingCareer) return true;
  if (rows.some(row => classifyInlineCoachRole(row.team))) return true;
  if (classifyCoachRoleText(coach.currentBasketballRole?.position)) return true;
  return !coach.careerInformation?.playingCareer && /\b(?:coach|trainer)\b/.test(normalize(coach.biography?.introduction));
}

function coachEntries(coach: EuropeanCoachSourceCoach): CareerEntry[] {
  const history = coach.careerHistory ?? {};
  const other = history.other ?? [];
  const rows: Array<{ row: SourceCareerRow; forcedRole?: CareerRole }> = [
    ...(history.headCoaching ?? []).map(row => ({ row })),
    ...(history.assistantCoaching ?? []).map(row => ({ row, forcedRole: 'assistant' as const })),
    ...(history.consulting ?? []).map(row => ({ row, forcedRole: 'consultant' as const })),
    ...(history.youthCoaching ?? []).map(row => ({ row, forcedRole: 'youth' as const })),
    ...(hasCoachingOtherRows(coach, other) ? other.map(row => ({ row })) : []),
  ];
  const seen = new Set<string>();
  return rows.flatMap(({ row, forcedRole }) => splitYears(row.years).map(years => ({
    ...years,
    role: forcedRole ?? roleFromRow(String(row.team ?? ''), coach),
    team: cleanCareerTeam(row.team),
  }))).filter(entry => {
    const key = `${entry.role}:${entry.start}:${entry.end}:${compact(entry.team)}`;
    if (!entry.team || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const activeAt = (entry: CareerEntry, year: number): boolean => entry.start <= year && entry.end >= year;

function teamAliases(team: NonNBATeam | NBATeam): string[] {
  const values = [
    getTeamFullName(team as any),
    (team as any).region,
    (team as any).name,
    (team as any).abbrev,
  ].map(value => String(value ?? '')).filter(value => compact(value).length >= 4);
  return [...new Set(values)];
}

function tokenPrefixMatch(left: string, right: string): boolean {
  if (left === right) return true;
  const min = Math.min(left.length, right.length);
  return min >= 5 && left.slice(0, min) === right.slice(0, min);
}

function clubScore(value: unknown, aliases: string[]): number {
  const key = compact(value);
  const valueTokens = normalize(value).split(' ').filter(token => token.length >= 4);
  if (!key) return 0;
  let score = 0;
  for (const aliasValue of aliases) {
    const alias = compact(aliasValue);
    if (!alias) continue;
    if (key === alias) {
      score = Math.max(score, 100);
      continue;
    }
    if (key.length >= 6 && alias.length >= 6 && (key.includes(alias) || alias.includes(key))) {
      score = Math.max(score, 62);
    }
    const aliasTokens = normalize(aliasValue).split(' ').filter(token => token.length >= 4);
    const matches = valueTokens.filter(token => aliasTokens.some(aliasToken => tokenPrefixMatch(token, aliasToken))).length;
    const denominator = Math.max(1, Math.min(valueTokens.length, aliasTokens.length));
    if (matches > 0 && matches / denominator >= 0.5) score = Math.max(score, 32 + matches * 5);
  }
  return score;
}

function entryTeamScore(entry: CareerEntry, aliases: string[]): number {
  return Math.max(clubScore(entry.team, aliases), ...entry.team.split('/').map(part => clubScore(part, aliases)));
}

export function europeanCoachTeamMatchScore(value: unknown, team: NonNBATeam | NBATeam): number {
  return clubScore(value, teamAliases(team));
}

function yearsThrough(entries: CareerEntry[], cutoff: number, role?: CareerRole): number {
  const years = new Set<number>();
  for (const entry of entries) {
    if (role && entry.role !== role) continue;
    for (let year = entry.start; year <= Math.min(entry.end, cutoff); year++) years.add(year);
  }
  return years.size;
}

function yearsThroughRoles(entries: CareerEntry[], cutoff: number, roles: CareerRole[]): number {
  const years = new Set<number>();
  for (const entry of entries) {
    if (!roles.includes(entry.role)) continue;
    for (let year = entry.start; year <= Math.min(entry.end, cutoff); year++) years.add(year);
  }
  return years.size;
}

function awardPointsThrough(coach: EuropeanCoachSourceCoach, entries: CareerEntry[], cutoff: number): number {
  return Math.min(50, (coach.awards ?? []).reduce((total, award) => {
    if (award.affectsCoachRating === false || String(award.role ?? '').toLowerCase() === 'player') return total;
    const years = [...String(award.originalText ?? '').matchAll(/\b((?:19|20)\d{2})\b/g)].map(match => Number(match[1]));
    if (years.length === 0) return total;
    const eligibleYears = years.filter(year => year <= cutoff && entries.some(entry => activeAt(entry, year)));
    if (eligibleYears.length === 0) return total;
    const weight = Number(award.weightedPoints ?? award.count ?? 1);
    return total + Math.min(15, Math.max(0, weight) * (eligibleYears.length / years.length));
  }, 0));
}

function ratingFor(coach: EuropeanCoachSourceCoach, entries: CareerEntry[], role: string, cutoff: number): number {
  const headYears = yearsThrough(entries, cutoff, 'head');
  const assistantYears = yearsThrough(entries, cutoff, 'assistant');
  const developmentYears = yearsThroughRoles(entries, cutoff, ['development', 'youth']);
  const cutoffYears = yearsThrough(entries, cutoff);
  const roleYears = role === 'Head Coach'
    ? headYears
    : role === 'Player Development Coach'
      ? developmentYears
      : role === 'Youth Coach'
        ? yearsThrough(entries, cutoff, 'youth')
        : assistantYears;
  const awardScore = Math.min(12, Math.sqrt(awardPointsThrough(coach, entries, cutoff)) * 1.7);
  const rolePenalty = role === 'Head Coach' ? 0 : role === 'Player Development Coach' || role === 'Youth Coach' ? 4 : 2;
  const rating = 40 + Math.min(32, roleYears * 0.9) + Math.min(7, cutoffYears * 0.15) + awardScore - rolePenalty;
  return Math.max(25, Math.min(88, Math.round(rating)));
}

function attributeOverridesFor(role: string, rating: number, seed: number): Partial<StaffAttributes> {
  const displayRole = role === 'Youth Coach' ? 'Player Development Coach' : role;
  const base = buildStaffAttrs(seed, { role: displayRole });
  const delta = rating - computeStaffOverall(displayRole, base);
  return Object.fromEntries(Object.entries(base).map(([key, value]) => [
    key,
    Math.max(20, Math.min(95, Math.round(Number(value) + delta))),
  ])) as Partial<StaffAttributes>;
}

function coachNationality(coach: EuropeanCoachSourceCoach): string {
  return getPrimaryPlayerCountry({
    nationality: coach.biography?.nationality,
    born: { loc: String(coach.biography?.birthPlace ?? '') },
  }, coach.listedUnderCountries?.[0]);
}

function coachPortrait(coach: EuropeanCoachSourceCoach): string | undefined {
  return [coach.image?.largestThumbnailUrl, coach.image?.thumbnailUrl, coach.image?.originalFileUrl]
    .find(url => url && !/(?:flag[_ -]of|national[_ -]flag|\/flags?\/)/i.test(url)) ?? undefined;
}

function careerText(entries: CareerEntry[], cutoff: number): string {
  return entries
    .filter(entry => entry.start <= cutoff)
    .sort((left, right) => left.start - right.start || left.team.localeCompare(right.team))
    .map(entry => {
      const end = entry.end >= cutoff ? 'Present' : String(entry.end);
      const role = entry.role === 'head' ? 'Head Coach' : entry.role === 'assistant' ? 'Assistant Coach' : entry.role === 'development' ? 'Player Development Coach' : entry.role === 'youth' ? 'Youth Coach' : 'Consultant';
      return `${entry.start}-${end} ${entry.team} (${role})`;
    })
    .join('\n');
}

function achievementsThrough(coach: EuropeanCoachSourceCoach, cutoff: number): NonNullable<StaffMember['coachAchievements']> {
  const seen = new Set<string>();
  return (coach.awards ?? []).flatMap(award => {
    if (award.affectsCoachRating === false || String(award.role ?? '').toLowerCase() === 'player') return [];
    return [...String(award.originalText ?? '').matchAll(/\b((?:19|20)\d{2})\b/g)]
      .map(match => Number(match[1]))
      .filter(season => season <= cutoff)
      .flatMap(season => {
        const key = `${season}:${award.type ?? 'coachingHonor'}:${award.originalText ?? ''}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{
          season,
          type: String(award.type ?? 'coachingHonor'),
          label: String(award.originalText ?? 'Coaching Honor'),
          league: 'Europe',
          role: String(award.role ?? 'Head Coach'),
        }];
      });
  });
}

function memberFromCoach(
  prepared: PreparedCoach,
  role: string,
  cutoff: number,
  leagueId: string,
  entry?: CareerEntry,
  team?: NonNBATeam | NBATeam,
): StaffMember {
  const { coach, entries } = prepared;
  const rating = ratingFor(coach, entries, role, cutoff);
  const sourceId = compact(coach.id ?? coach.name ?? 'coach');
  const hiredYear = entry?.start ?? Math.max(1900, ...entries.filter(row => row.start <= cutoff).map(row => row.start));
  const attributeSeed = rating * 101 + cutoff + sourceId.length;
  const achievements = achievementsThrough(coach, cutoff);
  const teamName = team ? getTeamFullName(team as any) : 'Free Agent';
  const bornYear = Number(String(coach.biography?.birthDate ?? '').slice(0, 4));
  const observedTenureYears = entry ? Math.max(1, Math.min(entry.end, cutoff) - entry.start + 1) : 1;
  const historicalClubPreferences = entries
    .filter(row => row.start <= cutoff)
    .map(row => ({
      team: row.team,
      role: row.role,
      startYear: row.start,
      endYear: Math.min(row.end, cutoff),
      tenureYears: Math.max(1, Math.min(row.end, cutoff) - row.start + 1),
    }));
  return {
    id: `european-coach-${sourceId}-${compact(role)}`,
    sourcePlayerId: coach.id,
    source: 'european-coaches',
    leagueId,
    name: String(coach.name ?? 'European Coach').replace(/\s*\((?:basketball|basketball coach|coach)\)\s*$/i, ''),
    role,
    position: role,
    jobTitle: role,
    team: teamName,
    teamLogoUrl: team ? ((team as any).imgURL ?? (team as any).logoUrl) : undefined,
    playerPortraitUrl: coachPortrait(coach),
    nationality: coachNationality(coach),
    bornYear: Number.isFinite(bornYear) ? bornYear : undefined,
    careerStartYear: Math.min(...entries.map(row => row.start)),
    hiredYear,
    roleStartYear: hiredYear,
    yearsWithTeam: team && entry ? Math.max(0, cutoff - entry.start) : 0,
    contractYears: Math.max(1, Math.min(5, observedTenureYears)),
    rating,
    reputation: rating,
    salary: getStaffMarketSalary(undefined, role === 'Youth Coach' ? 'Player Development Coach' : role, rating, {
      market: 'euro',
      yearsExperience: yearsThrough(entries, cutoff),
      yearsWithTeam: entry ? Math.max(0, cutoff - entry.start) : 0,
      economyScale: getEuroHistoricalEconomyFactor(cutoff),
    }),
    attributeSeed,
    attributeOverrides: attributeOverridesFor(role, rating, attributeSeed),
    isPlaceholder: false,
    coachingYears: yearsThrough(entries, cutoff),
    sourceObservedTenureYears: observedTenureYears,
    historicalClubPreferences,
    formerTeam: team ? undefined : entry?.team,
    formerRole: team ? undefined : role,
    sourceExperience: {
      headCoachYears: yearsThrough(entries, cutoff, 'head'),
      assistantCoachYears: yearsThrough(entries, cutoff, 'assistant'),
      developmentCoachYears: yearsThroughRoles(entries, cutoff, ['development', 'youth']),
      youthCoachYears: yearsThrough(entries, cutoff, 'youth'),
      totalCoachingYears: yearsThrough(entries, cutoff),
    },
    coachAchievements: achievements,
    awardsSummary: [...new Set(achievements.map(achievement => achievement.label))],
    coaching_career: careerText(entries, cutoff),
    career_history: careerText(entries, cutoff),
  };
}

function replaceRole(members: StaffMember[], role: string, replacement: StaffMember): StaffMember[] {
  const index = members.findIndex(member => String(member.role ?? member.position ?? member.jobTitle) === role);
  if (index < 0) return [...members, replacement];
  const next = [...members];
  next[index] = replacement;
  return next;
}

function prepareCoaches(source: EuropeanCoachSource): PreparedCoach[] {
  return source.coaches
    .map(coach => ({ coach, entries: coachEntries(coach) }))
    .filter(row => row.coach.name && row.entries.length > 0);
}

function buildSourceRetirementAnnouncements(
  prepared: PreparedCoach[],
  teams: NonNBATeam[],
  cutoff: number,
  leagueId: string,
): StaffRetirementRecord[] {
  const sourceCoverageThrough = Math.max(
    cutoff,
    ...prepared.flatMap(row => row.entries.map(entry => entry.end < 9999 ? entry.end : cutoff)),
  );
  return prepared.flatMap(({ coach, entries }) => {
    const retirement = inferSourceRetirement({
      retiredYear: coach.retiredYear,
      retireddYer: coach.retireddYer,
      retirementYear: coach.retirementYear,
      bornYear: Number(String(coach.biography?.birthDate ?? '').slice(0, 4)),
      assignments: entries
        .filter(entry => entry.end < 9999)
        .map(entry => ({ season: entry.end, games: 1 })),
    }, {
      branchCutoffYear: cutoff,
      sourceCoverageThrough,
      kind: 'staff',
      confirmThroughSourceCoverage: true,
    });
    if (!retirement || retirement.retiredYear !== cutoff) return [];
    const latest = entries
      .filter(entry => entry.end <= cutoff)
      .sort((left, right) => right.end - left.end || right.start - left.start)[0];
    const matchedTeam = latest
      ? teams
          .map(team => ({ team, score: entryTeamScore(latest, teamAliases(team)) }))
          .sort((left, right) => right.score - left.score)[0]
      : undefined;
    const team = matchedTeam && matchedTeam.score >= 32 ? matchedTeam.team : undefined;
    const role = latest?.role === 'assistant'
      ? 'Assistant Coach'
      : latest?.role === 'development' || latest?.role === 'youth'
        ? 'Player Development Coach'
        : 'Head Coach';
    const bornYear = Number(String(coach.biography?.birthDate ?? '').slice(0, 4));
    const age = Number.isFinite(bornYear) ? Math.max(0, cutoff - bornYear) : 65;
    const yearsExperience = yearsThrough(entries, cutoff);
    return [{
      id: `source-staff-retire-${coach.id ?? compact(coach.name)}-${cutoff}`,
      staffId: coach.id,
      name: String(coach.name ?? 'European Coach'),
      role,
      portraitUrl: coachPortrait(coach),
      teamName: team ? getTeamFullName(team) : latest?.team ?? 'European Basketball',
      teamId: team?.tid,
      teamAbbrev: team?.abbrev,
      teamLogoUrl: team?.imgURL,
      leagueId,
      age,
      season: cutoff,
      retiredDate: `${cutoff}-06-30`,
      reason: 'age',
      reasonLabel: 'retired after a long career',
      motivation: 'legacy_winner',
      desireScore: 100,
      yearsExperience,
      experienceLabel: `${yearsExperience} yr${yearsExperience === 1 ? '' : 's'}`,
      yearsWithTeam: latest ? Math.max(0, latest.end - latest.start + 1) : 0,
      sourcePlayerId: coach.id,
      postRetirementPath: 'none',
      farewellTourEligible: yearsExperience >= 30,
      offseasonRow: 'staffSignings',
      requiresReplacement: false,
      hallOfFameEligible: false,
      hallOfFameScore: 0,
      sourceRetirement: retirement,
    }];
  });
}

function assignTeamCoaches(
  team: NonNBATeam | NBATeam,
  existing: StaffMember[],
  prepared: PreparedCoach[],
  cutoff: number,
  leagueId: string,
  assigned: Set<string>,
): StaffMember[] {
  const aliases = teamAliases(team);
  const candidates = prepared.flatMap(row => row.entries
    .filter(entry => activeAt(entry, cutoff))
    .map(entry => ({ row, entry, score: entryTeamScore(entry, aliases) })))
    .filter(candidate => candidate.score >= 32 && !assigned.has(String(candidate.row.coach.id)));
  let staff = [...existing];
  const take = (careerRoles: CareerRole[], staffRoles: string[]) => {
    const matches = candidates
      .filter(candidate => careerRoles.includes(candidate.entry.role) && !assigned.has(String(candidate.row.coach.id)))
      .sort((left, right) => right.score - left.score || right.entry.start - left.entry.start || Number(right.row.coach.rating?.coachRating ?? 0) - Number(left.row.coach.rating?.coachRating ?? 0));
    for (const role of staffRoles) {
      const candidate = matches.find(match => !assigned.has(String(match.row.coach.id)));
      if (!candidate) break;
      assigned.add(String(candidate.row.coach.id));
      staff = replaceRole(staff, role, memberFromCoach(candidate.row, role, cutoff, leagueId, candidate.entry, team));
    }
  };
  take(['head'], ['Head Coach']);
  take(['assistant'], ['Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3']);
  take(['development', 'youth'], ['Player Development Coach']);
  return staff;
}

function buildFreeAgents(
  prepared: PreparedCoach[],
  assigned: Set<string>,
  cutoff: number,
  leagueId: string,
): StaffMember[] {
  const eligible = prepared
    .filter(row => !assigned.has(String(row.coach.id)))
    .filter(row => row.entries.some(entry => entry.start <= cutoff))
    .filter(row => !row.entries.some(entry => activeAt(entry, cutoff)))
    .map(row => ({
      row,
      latest: row.entries.filter(entry => entry.start <= cutoff).sort((left, right) => right.end - left.end || right.start - left.start)[0],
    }))
    .filter(candidate => candidate.latest && candidate.latest.end >= cutoff - 6)
    .filter(candidate => candidate.latest?.role !== 'consultant')
    .filter(candidate => {
      const diedYear = Number(String(candidate.row.coach.biography?.died ?? '').match(/\b(19|20)\d{2}\b/)?.[0]);
      return !Number.isFinite(diedYear) || diedYear > cutoff;
    });
  const limits: Record<string, number> = { 'Head Coach': 35, 'Assistant Coach': 30, 'Player Development Coach': 15, 'Youth Coach': 15 };
  const counts = new Map<string, number>();
  return eligible
    .map(candidate => {
      const role = candidate.latest?.role === 'assistant'
        ? 'Assistant Coach'
        : candidate.latest?.role === 'youth'
          ? 'Youth Coach'
        : candidate.latest?.role === 'development'
          ? 'Player Development Coach'
          : 'Head Coach';
      return { candidate, role, rating: ratingFor(candidate.row.coach, candidate.row.entries, role, cutoff) };
    })
    .sort((left, right) => right.rating - left.rating || String(left.candidate.row.coach.name).localeCompare(String(right.candidate.row.coach.name)))
    .flatMap(row => {
      const count = counts.get(row.role) ?? 0;
      if (count >= limits[row.role]) return [];
      counts.set(row.role, count + 1);
      return [memberFromCoach(row.candidate.row, row.role, cutoff, leagueId, row.candidate.latest)];
    });
}

export function mergeEuropeanCoachStaffForTeam(
  team: NBATeam,
  generatedStaff: StaffMember[],
  sourceSeason: number,
  leagueId: string,
  source: EuropeanCoachSource,
): StaffMember[] {
  return assignTeamCoaches(team, generatedStaff, prepareCoaches(source), sourceSeason - 1, leagueId, new Set());
}

export function applyEuropeanCoachSnapshot(
  teams: NonNBATeam[],
  sourceSeason: number,
  primaryLeagueId: string,
  source: EuropeanCoachSource,
): EuropeanCoachSnapshot {
  const cutoff = sourceSeason - 1;
  const prepared = prepareCoaches(source);
  const assigned = new Set<string>();
  const nextTeams = teams.map(team => {
    const leagueId = inferEuroStaffLeagueId(team.tid, 'modded', { teamLeague: team.league, uiMode: 'euro_isolated' });
    if (!isEuroStaffLeagueId(leagueId)) return team;
    const existing = ((team as any).tycoon?.staffMembers ?? []) as StaffMember[];
    const staffMembers = assignTeamCoaches(team, existing, prepared, cutoff, leagueId, assigned);
    return {
      ...team,
      tycoon: { ...((team as any).tycoon ?? {}), staffMembers },
    } as NonNBATeam;
  });
  return {
    teams: nextTeams,
    staffFreeAgents: buildFreeAgents(prepared, assigned, cutoff, primaryLeagueId),
    assignedCoachCount: assigned.size,
    retirementAnnouncements: buildSourceRetirementAnnouncements(prepared, nextTeams, cutoff, primaryLeagueId),
    sourceVersion: source.sourceVersion,
    snapshotYear: cutoff,
  };
}
