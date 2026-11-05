import type { NonNBATeam, StaffMember } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { isUsableTeamLogoUrl } from '../../utils/teamAssets';
import { getStaffMarketSalary } from '../tycoon/economyScale';
import { buildStaffAttrs, computeStaffOverall } from '../staff/displayAttributes';
import { classifyInlineCoachRole, cleanInlineCoachRoleTags, type HistoricalCoachCareerRole } from '../staff/coachRoleTags';
import type { StaffAttributes } from '../../TeamTraining/types';
import { PBA_HISTORICAL_CATALOG } from './historicalCatalog';
import { getActivePbaSeasonTeamEntries, getPlayablePbaSeasons } from './historyConfig';
import type { HistoricalPbaTeamIdentitySnapshot, PbaMasterSource, PbaSourceTeam } from './historicalTypes';
import type {
  HistoricalPbaRemoteSources,
  PbaHistoricalCoach,
  PbaTeamHistoryPage,
  PbaTeamLogoRow,
} from './historicalRemoteSources';
import {
  getCanonicalHistoricalPbaTid,
  getCanonicalPbaRawTid,
} from './franchiseTimeline';
import {
  getPbaHistoricalEconomyFactor,
  PBA_STAFF_ECONOMY_VERSION,
} from './historicalEconomy';
import {
  buildPbaHistoricalCoachRetirementIndex,
  pbaHistoricalCoachKey,
} from './historicalCoachRetirements';
import type { StaffRetirementRecord } from '../staff/staffRetirement';
import { displayStaffRole } from '../staff/staffCareerRows';

type CareerRole = HistoricalCoachCareerRole;
type CareerEntry = {
  role: CareerRole;
  start: number;
  end: number;
  team: string;
};

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const compact = (value: unknown): string => normalize(value).replace(/\s+/g, '');

const toRenderableLogopediaUrl = (value: string): string => {
  if (!/^https:\/\/static\.wikia\.nocookie\.net\/logopedia\//i.test(value)) return value;
  return value.replace(/\/revision\/latest\/scale-to-width-down\/\d+(?=\?|$)/i, '/revision/latest');
};

export function normalizeHistoricalPbaLogoUrl(value: unknown): string | undefined {
  const url = String(value ?? '').trim();
  if (!url || url.endsWith('/undefined')) return undefined;
  const normalized = toRenderableLogopediaUrl(url);
  return isUsableTeamLogoUrl(normalized) ? normalized : undefined;
}

const splitYears = (value: string | undefined): Array<{ start: number; end: number }> => {
  const normalized = String(value ?? '').replace(/[–—]/g, '-');
  return normalized.split(',').flatMap(part => {
    const match = part.trim().match(/((?:19|20)\d{2})(?:\s*-\s*((?:19|20)\d{2}|present))?/i);
    if (!match) return [];
    const start = Number(match[1]);
    const end = match[2]?.toLowerCase() === 'present' ? 9999 : Number(match[2] ?? start);
    return Number.isFinite(start) && Number.isFinite(end) ? [{ start, end }] : [];
  });
};

const coachEntries = (coach: PbaHistoricalCoach): CareerEntry[] => {
  const history = coach.careerHistory ?? {};
  const rows: Array<{ role: CareerRole; years?: string; team?: string }> = [
    ...(history.headCoaching ?? []).map(row => ({
      ...row,
      role: classifyInlineCoachRole(row.team) ?? 'head',
    })),
    ...(history.assistantCoaching ?? []).map(row => ({ ...row, role: 'assistant' as const })),
    ...(history.consulting ?? []).map(row => ({ ...row, role: 'consultant' as const })),
    ...(history.youthCoaching ?? []).map(row => ({ ...row, role: 'youth' as const })),
    ...(history.other ?? []).flatMap(row => {
      const role = classifyInlineCoachRole(row.team);
      return role ? [{ ...row, role }] : [];
    }),
  ];
  return rows.flatMap(row => splitYears(row.years).map(years => ({
    role: row.role,
    ...years,
    team: cleanInlineCoachRoleTags(row.team),
  }))).filter(row => !!row.team);
};

const activeAt = (entry: CareerEntry, year: number): boolean => entry.start <= year && entry.end >= year;

const identityAliasesForTeam = (team: NonNBATeam): string[] => [
  getTeamFullName(team as any),
  team.region,
  team.name,
  team.abbrev,
].map(value => String(value ?? '')).filter(value => compact(value).length >= 3);

const aliasesForTeam = (team: NonNBATeam, sourceTeams: PbaSourceTeam[]): string[] => {
  const rawTid = Number(team.tid) - PBA_HISTORICAL_CATALOG.teamTidOffset;
  const aliases = new Set<string>([
    getTeamFullName(team as any),
    team.region,
    team.name,
    team.abbrev,
  ].map(value => String(value ?? '')).filter(Boolean));
  for (const source of sourceTeams.filter(row => getCanonicalPbaRawTid(row.tid) === rawTid)) {
    aliases.add(`${source.region ?? ''} ${source.name ?? ''}`.trim());
    aliases.add(String(source.region ?? ''));
    aliases.add(String(source.name ?? ''));
    aliases.add(String(source.abbrev ?? ''));
  }
  return [...aliases].filter(value => compact(value).length >= 3);
};

const textMatchScore = (value: unknown, aliases: string[]): number => {
  const key = compact(value);
  if (!key) return 0;
  let score = 0;
  for (const alias of aliases.map(compact).filter(Boolean)) {
    if (key === alias) score = Math.max(score, 100);
    else if (key.length >= 6 && alias.length >= 6 && (key.includes(alias) || alias.includes(key))) score = Math.max(score, 35);
  }
  return score;
};

const pageScore = (page: PbaTeamHistoryPage, aliases: string[]): number => Math.max(
  textMatchScore(page.title, aliases),
  textMatchScore(page.displayTitle, aliases),
  ...(page.navLabels ?? []).map(label => textMatchScore(label, aliases)),
  ...(page.logos ?? []).map(logo => textMatchScore(logo.sectionName, aliases)),
);

const findTeamPage = (pages: PbaTeamHistoryPage[], aliases: string[]): PbaTeamHistoryPage | undefined => pages
  .filter(page => page.isTeam !== false)
  .map(page => ({ page, score: pageScore(page, aliases) }))
  .filter(row => row.score > 0)
  .sort((left, right) => right.score - left.score || String(left.page.title).localeCompare(String(right.page.title)))[0]?.page;

const findTeamIdentityPage = (
  pages: PbaTeamHistoryPage[],
  team: NonNBATeam,
  franchiseAliases: string[],
): PbaTeamHistoryPage | undefined => (
  findTeamPage(pages, identityAliasesForTeam(team))
  ?? findTeamPage(pages, franchiseAliases)
);

const logoPeriodRank = (logo: PbaTeamLogoRow, year: number): { phase: number; distance: number } => {
  const periods = (logo.periods ?? []).flatMap(period => {
    const from = Number(period.from);
    if (!Number.isFinite(from)) return [];
    const to = period.present === true ? Number.MAX_SAFE_INTEGER : Number(period.to ?? from);
    if (!Number.isFinite(to)) return [];
    return [{ from, to }];
  });
  if (periods.some(period => period.from <= year && period.to >= year)) return { phase: 0, distance: 0 };
  const prior = periods.filter(period => period.to < year);
  if (prior.length > 0) {
    return { phase: 1, distance: year - Math.max(...prior.map(period => period.to)) };
  }
  const future = periods.filter(period => period.from > year);
  if (future.length > 0) {
    return { phase: 2, distance: Math.min(...future.map(period => period.from)) - year };
  }
  return { phase: 3, distance: Number.MAX_SAFE_INTEGER };
};

const resolvedLogoUrl = (logo: PbaTeamLogoRow | undefined): string | undefined => {
  const displayed = normalizeHistoricalPbaLogoUrl(logo?.displayedUrl);
  if (displayed && /^https?:\/\//i.test(displayed)) return displayed;
  const original = normalizeHistoricalPbaLogoUrl(logo?.originalUrl);
  return original && /^https?:\/\//i.test(original) ? original : undefined;
};

const selectLogo = (page: PbaTeamHistoryPage | undefined, aliases: string[], startYear: number): PbaTeamLogoRow | undefined => (
  (page?.logos ?? [])
    .filter(logo => !!resolvedLogoUrl(logo))
    .map(logo => ({
      logo,
      ...logoPeriodRank(logo, startYear),
      identityScore: textMatchScore(logo.sectionName, aliases),
      relevant: logo.dataRelevant !== '0',
    }))
    .sort((left, right) => (
      left.phase - right.phase
      || left.distance - right.distance
      || right.identityScore - left.identityScore
      || Number(right.relevant) - Number(left.relevant)
      || String(left.logo.id).localeCompare(String(right.logo.id))
    ))[0]?.logo
);

const pageAliases = (page: PbaTeamHistoryPage | undefined): string[] => [
  page?.title,
  page?.displayTitle,
  ...(page?.navLabels ?? []),
].map(value => String(value ?? '')).filter(Boolean);

const entryTeamScore = (entry: CareerEntry, aliases: string[]): number => Math.max(
  textMatchScore(entry.team, aliases),
  ...entry.team.split('/').map(part => textMatchScore(part, aliases)),
);

const portraitUrl = (coach: PbaHistoricalCoach): string | undefined => {
  const value = typeof coach.image === 'string'
    ? coach.image
    : coach.image?.originalFileUrl
      ?? coach.image?.largestThumbnailUrl
      ?? coach.image?.thumbnailUrl
      ?? coach.image?.originalUrl
      ?? coach.image?.url;
  if (!value || !/^https?:\/\//i.test(value)) return undefined;
  return /(?:flag|logo|seal|coat[_ -]of[_ -]arms)/i.test(value) ? undefined : value;
};

const bornYear = (coach: PbaHistoricalCoach): number | undefined => {
  const text = Object.entries(coach.allInfoboxFields ?? {})
    .find(([key]) => normalize(key) === 'born')?.[1];
  const match = String(text ?? '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
};

const nationality = (coach: PbaHistoricalCoach): string => {
  const direct = Object.entries(coach.allInfoboxFields ?? {})
    .find(([key]) => normalize(key) === 'nationality')?.[1];
  if (direct) {
    if (/^filipino$/i.test(direct.trim())) return 'Philippines';
    if (/^american$/i.test(direct.trim())) return 'United States';
    return direct;
  }
  const born = Object.entries(coach.allInfoboxFields ?? {})
    .find(([key]) => normalize(key) === 'born')?.[1] ?? '';
  if (/united states|u\.s\.|usa/i.test(born)) return 'United States';
  return 'Philippines';
};

const yearsThrough = (entries: CareerEntry[], cutoff: number, role?: CareerRole): number => {
  const years = new Set<number>();
  for (const entry of entries) {
    if (role && entry.role !== role) continue;
    for (let year = entry.start; year <= Math.min(entry.end, cutoff); year++) years.add(year);
  }
  return years.size;
};

const ratingFor = (coach: PbaHistoricalCoach, entries: CareerEntry[], role: string, cutoff: number): number => {
  const headYears = yearsThrough(entries, cutoff, 'head');
  const assistantYears = yearsThrough(entries, cutoff, 'assistant');
  const developmentYears = yearsThrough(entries, cutoff, 'development') + yearsThrough(entries, cutoff, 'youth');
  const cutoffYears = yearsThrough(entries, cutoff);
  const fullYears = Math.max(cutoffYears, yearsThrough(entries, 2100));
  const sourceRating = Number(coach.rating?.coachRating);
  const experienceScore = role === 'Head Coach'
    ? 40 + Math.min(26, headYears * 0.9) + Math.min(4, assistantYears * 0.2)
    : role === 'Player Development Coach'
      ? 36 + Math.min(24, developmentYears * 0.85) + Math.min(6, assistantYears * 0.25)
      : 36 + Math.min(24, assistantYears * 0.85) + Math.min(6, headYears * 0.25);
  if (!Number.isFinite(sourceRating)) return Math.max(20, Math.min(70, Math.round(experienceScore)));
  const futurePenalty = fullYears > 0 ? (1 - Math.sqrt(cutoffYears / fullYears)) * 12 : 12;
  const cutoffAnchor = sourceRating - futurePenalty - (role === 'Head Coach' ? 0 : 2);
  return Math.max(20, Math.min(70, Math.round(cutoffAnchor * 0.8 + experienceScore * 0.2)));
};

const attributeOverridesFor = (role: string, rating: number, seed: number): Partial<StaffAttributes> => {
  const base = buildStaffAttrs(seed, { role });
  const delta = rating - computeStaffOverall(role, base);
  return Object.fromEntries(Object.entries(base).map(([key, value]) => [
    key,
    Math.max(20, Math.min(95, Math.round(Number(value) + delta))),
  ])) as Partial<StaffAttributes>;
};

const careerText = (entries: CareerEntry[], cutoff: number): string => entries
  .filter(entry => entry.start <= cutoff)
  .sort((left, right) => left.start - right.start || left.team.localeCompare(right.team))
  .map(entry => `${entry.start}-${Math.min(entry.end, cutoff)} ${entry.team} ${entry.role === 'head' ? 'Head Coach' : entry.role === 'assistant' ? 'Assistant Coach' : entry.role === 'development' ? 'Player Development Coach' : entry.role === 'youth' ? 'Youth Coach' : 'Consultant'}`)
  .join('\n');

const coachAchievementsThrough = (coach: PbaHistoricalCoach, cutoff: number): NonNullable<StaffMember['coachAchievements']> => {
  const typeLabels: Record<string, string> = {
    pbaChampion: 'PBA Champion',
    otherDomesticChampion: 'Grand Slam Champion',
    pbaCoachOfYear: 'PBA Coach of the Year',
    pbaAllStarHeadCoach: 'PBA All-Star Head Coach',
  };
  return (coach.awards ?? []).flatMap(award => {
    const label = typeLabels[String(award.type ?? '')] ?? String(award.type ?? 'Coaching Honor');
    return [...String(award.originalText ?? '').matchAll(/\b((?:19|20)\d{2})(?:[–-]\d{2})?\b/g)]
      .map(match => Number(match[1]))
      .filter(season => season <= cutoff)
      .map(season => ({ season, type: String(award.type ?? 'coachingHonor'), label: `${season} ${label}`, league: 'PBA' }));
  });
};

const coachAwardsSummary = (achievements: NonNullable<StaffMember['coachAchievements']>): string[] => {
  const counts = new Map<string, number>();
  for (const achievement of achievements) {
    const label = achievement.label.replace(/^\d{4}\s+/, '');
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => `${count}x ${label}`);
};

const memberFromCoach = (
  coach: PbaHistoricalCoach,
  role: string,
  cutoff: number,
  currentEntry?: CareerEntry,
  team?: NonNBATeam,
): StaffMember => {
  const entries = coachEntries(coach);
  const rating = ratingFor(coach, entries, role, cutoff);
  const hiredYear = currentEntry?.start ?? Math.max(1900, ...entries.filter(entry => entry.start <= cutoff).map(entry => entry.start));
  const id = compact(coach.id ?? coach.name ?? 'coach');
  const attributeSeed = rating * 101 + cutoff + id.length;
  const coachAchievements = coachAchievementsThrough(coach, cutoff);
  const priorCareer = careerText(entries, cutoff);
  const branchCareer = team
    ? currentEntry
      ? priorCareer
        .split('\n')
        .map(row => row.startsWith(`${currentEntry.start}-${Math.min(currentEntry.end, cutoff)} ${currentEntry.team} `)
          ? `${currentEntry.start}-present ${currentEntry.team} ${displayStaffRole(role)}`
          : row)
        .join('\n')
      : `${priorCareer}${priorCareer ? '\n' : ''}${cutoff}-present ${getTeamFullName(team as any)} ${displayStaffRole(role)}`
    : priorCareer;
  return {
    id: `pba-historical-coach-${id}-${compact(role)}`,
    sourcePlayerId: coach.id,
    source: 'pba-historical-coaches',
    leagueId: 'pba',
    name: String(coach.name ?? 'PBA Coach'),
    role,
    position: role,
    jobTitle: role,
    team: team ? getTeamFullName(team as any) : 'Free Agent',
    playerPortraitUrl: portraitUrl(coach),
    nationality: nationality(coach),
    bornYear: bornYear(coach),
    careerStartYear: Math.min(...entries.map(entry => entry.start)),
    hiredYear,
    roleStartYear: hiredYear,
    yearsWithTeam: currentEntry ? Math.max(0, cutoff - hiredYear) : 0,
    contractYears: role === 'Head Coach' ? (rating >= 75 ? 4 : 3) : 2,
    rating,
    reputation: rating,
    salary: getStaffMarketSalary(undefined, role, rating, {
      market: 'pba',
      yearsExperience: yearsThrough(entries, cutoff),
      yearsWithTeam: currentEntry ? Math.max(0, cutoff - hiredYear) : 0,
      economyScale: getPbaHistoricalEconomyFactor(cutoff),
    }),
    staffEconomyVersion: PBA_STAFF_ECONOMY_VERSION,
    attributeSeed,
    attributeOverrides: attributeOverridesFor(role, rating, attributeSeed),
    isPlaceholder: false,
    coachingYears: yearsThrough(entries, cutoff),
    sourceCoachRating: Number.isFinite(Number(coach.rating?.coachRating)) ? Number(coach.rating?.coachRating) : undefined,
    sourceCoachPercentile: Number.isFinite(Number(coach.rating?.percentile)) ? Number(coach.rating?.percentile) : undefined,
    sourceExperience: coach.experience,
    coachAchievements,
    awardsSummary: coachAwardsSummary(coachAchievements),
    coaching_career: branchCareer,
    career_history: branchCareer,
  };
};

const replaceRole = (members: StaffMember[], role: string, replacement: StaffMember): StaffMember[] => {
  const index = members.findIndex(member => (member.role ?? member.position ?? member.jobTitle) === role);
  if (index < 0) return [...members, replacement];
  const next = [...members];
  next[index] = replacement;
  return next;
};

export function applyHistoricalPbaRemoteSnapshot(
  teams: NonNBATeam[],
  sourceTeams: PbaSourceTeam[],
  sourceSeason: number,
  remote: HistoricalPbaRemoteSources,
): { teams: NonNBATeam[]; staffFreeAgents: StaffMember[]; retirementAnnouncements: StaffRetirementRecord[] } {
  const cutoff = sourceSeason - 1;
  const assignmentSeason = sourceSeason;
  const assignedNames = new Set<string>();
  const preparedCoaches = remote.coaches.coaches.map(coach => ({ coach, entries: coachEntries(coach) }));
  const selectedSeasonMember = (
    coach: PbaHistoricalCoach,
    role: string,
    currentEntry?: CareerEntry,
    team?: NonNBATeam,
  ): StaffMember => {
    const member = memberFromCoach(coach, role, assignmentSeason, currentEntry, team);
    const coachAchievements = (member.coachAchievements ?? []).filter(achievement => Number(achievement.season) <= cutoff);
    return {
      ...member,
      coachAchievements,
      awardsSummary: coachAwardsSummary(coachAchievements),
    };
  };
  const teamContexts = teams.map(team => {
    const aliases = aliasesForTeam(team, sourceTeams);
    const page = findTeamIdentityPage(remote.teams.pages, team, aliases);
    const allAliases = [...new Set([...aliases, ...pageAliases(page)])];
    const logo = selectLogo(page, identityAliasesForTeam(team), sourceSeason);
    return { team, aliases: allAliases, logo };
  });
  const resolveRetirementTeam = (teamName: string): NonNBATeam | undefined => {
    const match = teamContexts
      .map(context => ({
        team: context.team,
        score: textMatchScore(teamName, context.aliases),
      }))
      .sort((left, right) => right.score - left.score)[0];
    return match?.score > 0 ? match.team : undefined;
  };
  const retirementIndex = buildPbaHistoricalCoachRetirementIndex(
    preparedCoaches,
    cutoff,
    resolveRetirementTeam,
  );

  const nextTeams = teamContexts.map(({ team, aliases, logo }) => {
    const staff = [...(((team as any).tycoon?.staffMembers ?? []) as StaffMember[])];
    const candidates = preparedCoaches.flatMap(({ coach, entries }) => entries
      .filter(entry => activeAt(entry, assignmentSeason))
      .map(entry => ({ coach, entry, score: entryTeamScore(entry, aliases) }))
      .filter(row => row.score > 0));
    const head = candidates
      .filter(row => row.entry.role === 'head' && !assignedNames.has(compact(row.coach.name)))
      .sort((left, right) => right.score - left.score || right.entry.start - left.entry.start)[0];
    let nextStaff = staff;
    if (head) {
      assignedNames.add(compact(head.coach.name));
      nextStaff = replaceRole(nextStaff, 'Head Coach', selectedSeasonMember(head.coach, 'Head Coach', head.entry, team));
    }
    const assistants = candidates
      .filter(row => row.entry.role === 'assistant' && !assignedNames.has(compact(row.coach.name)))
      .sort((left, right) => right.score - left.score || right.entry.start - left.entry.start)
      .slice(0, 3);
    assistants.forEach((candidate, index) => {
      assignedNames.add(compact(candidate.coach.name));
      const role = ['Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'][index];
      nextStaff = replaceRole(nextStaff, role, selectedSeasonMember(candidate.coach, role, candidate.entry, team));
    });
    const development = candidates
      .filter(row => (row.entry.role === 'development' || row.entry.role === 'youth') && !assignedNames.has(compact(row.coach.name)))
      .sort((left, right) => right.score - left.score || right.entry.start - left.entry.start)[0];
    if (development) {
      assignedNames.add(compact(development.coach.name));
      nextStaff = replaceRole(nextStaff, 'Player Development Coach', selectedSeasonMember(development.coach, 'Player Development Coach', development.entry, team));
    }
    const rawTid = Number(team.tid) - PBA_HISTORICAL_CATALOG.teamTidOffset;
    const sourceTeam = sourceTeams.find(row =>
      getCanonicalPbaRawTid(row.tid) === rawTid
      && (row.seasons ?? []).some(season => Number(season.season) === sourceSeason),
    ) ?? sourceTeams.find(row => getCanonicalPbaRawTid(row.tid) === rawTid);
    const sourceSeasonRow = sourceTeam?.seasons?.find(row => Number(row.season) === sourceSeason);
    const exactSeasonLogo = normalizeHistoricalPbaLogoUrl(sourceSeasonRow?.imgURLSmall)
      ?? normalizeHistoricalPbaLogoUrl(sourceSeasonRow?.imgURL);
    const modernFranchiseLogo = normalizeHistoricalPbaLogoUrl(sourceTeam?.imgURLSmall)
      ?? normalizeHistoricalPbaLogoUrl(sourceTeam?.imgURL);
    const exactHistoricalLogo = exactSeasonLogo && exactSeasonLogo !== modernFranchiseLogo
      ? exactSeasonLogo
      : undefined;
    const colors = logo?.palette5?.filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 3);
    return {
      ...team,
      imgURL: resolvedLogoUrl(logo) ?? exactHistoricalLogo ?? exactSeasonLogo ?? normalizeHistoricalPbaLogoUrl(team.imgURL),
      colors: sourceSeasonRow?.colors ?? (colors && colors.length >= 2 ? colors : team.colors),
      tycoon: {
        ...((team as any).tycoon ?? {}),
        staffMembers: nextStaff,
      },
    } as NonNBATeam;
  });

  const availableCoaches = preparedCoaches
    .filter(({ coach }) => !!coach.name && !assignedNames.has(compact(coach.name)))
    .filter(({ coach }) => !retirementIndex.byCoachKey.has(pbaHistoricalCoachKey(coach)))
    .filter(row => row.entries.some(entry => entry.start <= assignmentSeason))
    .filter(row => !row.entries.some(entry => activeAt(entry, assignmentSeason)))
    .map(row => ({
      ...row,
      latest: row.entries.filter(entry => entry.start <= assignmentSeason).sort((left, right) => right.end - left.end || right.start - left.start)[0],
    }))
    .filter(row => row.latest?.role !== 'consultant');

  const staffedTeams = nextTeams;
  const staffFreeAgents = availableCoaches
    .map(row => selectedSeasonMember(
      row.coach,
      row.latest?.role === 'head'
        ? 'Head Coach'
        : row.latest?.role === 'development' || row.latest?.role === 'youth'
          ? 'Player Development Coach'
          : 'Assistant Coach',
    ))
    .sort((left, right) => Number(right.rating ?? 0) - Number(left.rating ?? 0) || left.name.localeCompare(right.name))
    .slice(0, 36);

  return {
    teams: staffedTeams,
    staffFreeAgents,
    retirementAnnouncements: retirementIndex.announcements,
  };
}

export function buildHistoricalPbaTeamIdentityTimeline(
  source: PbaMasterSource,
  remote?: HistoricalPbaRemoteSources,
): HistoricalPbaTeamIdentitySnapshot[] {
  const timeline = new Map<string, HistoricalPbaTeamIdentitySnapshot>();
  for (const { season } of getPlayablePbaSeasons(source)) {
    for (const { team: sourceTeam, row } of getActivePbaSeasonTeamEntries(source, season)) {
      const rawTid = sourceTeam.tid;
      const historicalName = String(row.pbaTeamName ?? '').trim();
      const region = String(row.region ?? (historicalName || sourceTeam.region) ?? '').trim();
      const name = String(row.name ?? (row.region || historicalName ? '' : sourceTeam.name ?? '')).trim();
      const team = {
        tid: getCanonicalHistoricalPbaTid(rawTid),
        region,
        name,
        abbrev: String(row.abbrev ?? sourceTeam.abbrev ?? `PBA${rawTid}`),
      } as NonNBATeam;
      const aliases = aliasesForTeam(team, source.teams);
      const page = remote ? findTeamIdentityPage(remote.teams.pages, team, aliases) : undefined;
      const logo = page ? selectLogo(page, identityAliasesForTeam(team), season) : undefined;
      const colors = logo?.palette5?.filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 3);
      const exactSeasonLogo = normalizeHistoricalPbaLogoUrl(row.imgURLSmall)
        ?? normalizeHistoricalPbaLogoUrl(row.imgURL);
      const modernFranchiseLogo = normalizeHistoricalPbaLogoUrl(sourceTeam.imgURLSmall)
        ?? normalizeHistoricalPbaLogoUrl(sourceTeam.imgURL);
      const exactHistoricalLogo = exactSeasonLogo && exactSeasonLogo !== modernFranchiseLogo
        ? exactSeasonLogo
        : undefined;
      timeline.set(`${season}:${team.tid}`, {
        season,
        tid: team.tid,
        region,
        name,
        abbrev: team.abbrev,
        imgURL: resolvedLogoUrl(logo)
          ?? exactHistoricalLogo
          ?? exactSeasonLogo
          ?? normalizeHistoricalPbaLogoUrl(sourceTeam.imgURLSmall)
          ?? normalizeHistoricalPbaLogoUrl(sourceTeam.imgURL),
        colors: row.colors ?? (colors && colors.length >= 2 ? colors : sourceTeam.colors),
      });
    }
  }
  return [...timeline.values()].sort((left, right) => left.season - right.season || left.tid - right.tid);
}
