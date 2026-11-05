import { getCountryFlagCode, normalizeNationality } from '../../../utils/countryFlags';
import type {
  WnbaCoachAchievement,
  WnbaCoachAward,
  WnbaCoachProfile,
  WnbaCoachRole,
  WnbaCoachSeasonRow,
  WnbaCoachSeasonStats,
  WnbaCoachSelectionBasis,
  WnbaHeadCoachAssignment,
  WnbaHeadCoachQuery,
  WnbaHeadCoachStaffBuildOptions,
  WnbaHeadCoachStaffMember,
} from './types';
import { getWnbaCoachSource, getWnbaCoachSourceVersion } from './source';

interface RawCoachSeasonStats {
  games?: number | null;
  wins?: number | null;
  losses?: number | null;
  winPct?: number | null;
}

interface RawCoachSeasonRow {
  year?: number;
  yearLabel?: string;
  team?: string;
  teamUrl?: string;
  role?: string;
  roleLabel?: string;
  regularSeason?: RawCoachSeasonStats;
  playoffs?: RawCoachSeasonStats;
  notes?: string | null;
}

interface RawCoachAward {
  year?: number;
  name?: string;
  type?: string;
  sourceText?: string;
  awardUrl?: string;
  seasonUrl?: string;
}

interface RawCoachAchievement {
  year?: number;
  type?: string;
  team?: string;
  note?: string;
}

interface RawCoach {
  id?: string;
  name?: string;
  basketballReference?: { url?: string };
  wikipedia?: { url?: string };
  image?: { localFile?: string | null };
  biography?: {
    birthDate?: string | null;
    birthPlace?: string | null;
    deathDate?: string | null;
    nationality?: string | null;
    college?: string | null;
    wikipedia?: { birthPlace?: string | null; nationality?: string | null };
  };
  coachingRecord?: { seasons?: RawCoachSeasonRow[] };
  awards?: RawCoachAward[];
  teamAchievements?: RawCoachAchievement[];
}

interface RawArchive {
  coaches?: RawCoach[];
}

interface ParsedCoach {
  raw: RawCoach;
  id: string;
  name: string;
  rows: WnbaCoachSeasonRow[];
}

interface RatingScore {
  coach: ParsedCoach;
  rawScore: number;
}

interface AdapterCache {
  version: number;
  coaches: ParsedCoach[];
}

let cache: AdapterCache | null = null;

const finite = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const nonNegative = (value: unknown): number => Math.max(0, finite(value) ?? 0);

const normalizeTeam = (value: string | undefined): string => String(value ?? '').trim().toUpperCase();

const normalizeRole = (value: string | undefined): WnbaCoachRole => {
  if (value === 'headCoach') return 'headCoach';
  if (value === 'assistantCoach') return 'assistantCoach';
  return 'otherStaff';
};

function parseStats(stats: RawCoachSeasonStats | undefined): WnbaCoachSeasonStats {
  return {
    games: finite(stats?.games),
    wins: finite(stats?.wins),
    losses: finite(stats?.losses),
    winPct: finite(stats?.winPct),
  };
}

function parseRow(row: RawCoachSeasonRow): WnbaCoachSeasonRow | null {
  const year = finite(row.year);
  const team = normalizeTeam(row.team);
  if (!year || !team) return null;
  const role = normalizeRole(row.role);
  return {
    year: Math.round(year),
    yearLabel: String(row.yearLabel ?? Math.round(year)),
    team,
    teamUrl: row.teamUrl || undefined,
    role,
    roleLabel: String(row.roleLabel ?? (role === 'headCoach' ? 'Head Coach' : role === 'assistantCoach' ? 'Assistant Coach' : 'Staff')),
    regularSeason: parseStats(row.regularSeason),
    playoffs: parseStats(row.playoffs),
    notes: row.notes || undefined,
  };
}

function getCache(): AdapterCache {
  const version = getWnbaCoachSourceVersion();
  if (cache?.version === version) return cache;
  const rawArchive = getWnbaCoachSource() as RawArchive;
  const coaches = (rawArchive.coaches ?? []).flatMap(raw => {
    const id = String(raw.id ?? '').trim();
    const name = String(raw.name ?? '').trim();
    if (!id || !name) return [];
    const rows = (raw.coachingRecord?.seasons ?? [])
      .map(parseRow)
      .filter((row): row is WnbaCoachSeasonRow => row !== null)
      .sort((a, b) => a.year - b.year);
    return [{ raw, id, name, rows }];
  });
  cache = { version, coaches };
  return cache;
}

function safePortrait(localFile: string | null | undefined): string | undefined {
  const normalized = String(localFile ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized.startsWith('images/') || normalized.includes('..')) return undefined;
  return `/data/external/wnba/coaches/${normalized}`;
}

function safeNationality(raw: RawCoach): string | undefined {
  const explicit = raw.biography?.nationality ?? raw.biography?.wikipedia?.nationality;
  if (explicit) return normalizeNationality(explicit);
  const place = raw.biography?.wikipedia?.birthPlace ?? raw.biography?.birthPlace;
  const tail = String(place ?? '').split(',').pop()?.trim();
  if (!tail) return undefined;
  const normalized = normalizeNationality(tail);
  return getCountryFlagCode(normalized) ? normalized : undefined;
}

function visibleAwards(raw: RawCoach, completedThroughYear: number): WnbaCoachAward[] {
  return (raw.awards ?? []).flatMap(award => {
    const year = finite(award.year);
    if (!year || year > completedThroughYear || !award.name) return [];
    return [{
      year: Math.round(year),
      name: award.name,
      type: String(award.type ?? 'otherAward'),
      sourceText: String(award.sourceText ?? award.name),
      awardUrl: award.awardUrl || undefined,
      seasonUrl: award.seasonUrl || undefined,
    }];
  });
}

function visibleAchievements(raw: RawCoach, completedThroughYear: number): WnbaCoachAchievement[] {
  return (raw.teamAchievements ?? []).flatMap(achievement => {
    const year = finite(achievement.year);
    const team = normalizeTeam(achievement.team);
    if (!year || year > completedThroughYear || !achievement.type || !team) return [];
    return [{
      year: Math.round(year),
      type: achievement.type,
      team,
      note: String(achievement.note ?? achievement.type),
    }];
  });
}

function cutoffRawScore(coach: ParsedCoach, completedThroughYear: number): number {
  const rows = coach.rows.filter(row => row.year <= completedThroughYear);
  const awards = visibleAwards(coach.raw, completedThroughYear);
  const achievements = visibleAchievements(coach.raw, completedThroughYear);
  const headRows = rows.filter(row => row.role === 'headCoach');
  const assistantRows = rows.filter(row => row.role === 'assistantCoach');
  const otherRows = rows.filter(row => row.role === 'otherStaff');
  const regularGames = headRows.reduce((sum, row) => sum + nonNegative(row.regularSeason.games), 0);
  const regularWins = headRows.reduce((sum, row) => sum + nonNegative(row.regularSeason.wins), 0);
  const playoffGames = headRows.reduce((sum, row) => sum + nonNegative(row.playoffs.games), 0);
  const playoffWins = headRows.reduce((sum, row) => sum + nonNegative(row.playoffs.wins), 0);
  const championships = achievements.filter(item => item.type === 'wnbaChampionship').length;
  const finalsAppearances = headRows.filter(row => {
    const note = row.notes?.toLowerCase() ?? '';
    return note.includes('champions') && !note.includes('wnba champions');
  }).length;
  const coachOfYear = awards.filter(award => award.type === 'coachOfTheYear').length;
  const coachOfMonth = awards.filter(award => award.type === 'coachOfTheMonth').length;
  const otherAwards = Math.max(0, awards.length - coachOfYear - coachOfMonth);
  const regularPct = regularGames > 0 ? regularWins / regularGames : 0;
  const playoffPct = playoffGames > 0 ? playoffWins / playoffGames : 0;
  const regularPctPoints = Math.min(5, Math.max(0, (regularPct - 0.45) * 20) * Math.min(1, regularGames / 100));
  const playoffPctPoints = Math.min(4.5, Math.max(0, (playoffPct - 0.4) * 15) * Math.min(1, playoffGames / 20));
  return championships * 16
    + finalsAppearances * 4
    + coachOfYear * 10
    + coachOfMonth
    + otherAwards * 0.5
    + Math.min(14, regularWins * 0.035)
    + Math.min(12, playoffWins * 0.16)
    + Math.min(7, headRows.length * 0.3)
    + Math.min(2, assistantRows.length * 0.06)
    + Math.min(1, otherRows.length * 0.03)
    + regularPctPoints
    + playoffPctPoints;
}

function percentileByCoach(completedThroughYear: number): Map<string, number> {
  const scores: RatingScore[] = getCache().coaches
    .filter(coach => coach.rows.some(row => row.year <= completedThroughYear))
    .map(coach => ({ coach, rawScore: cutoffRawScore(coach, completedThroughYear) }))
    .sort((a, b) => a.rawScore - b.rawScore || a.coach.name.localeCompare(b.coach.name));
  const result = new Map<string, number>();
  if (scores.length === 1) result.set(scores[0].coach.id, 0.5);
  else {
    for (let start = 0; start < scores.length;) {
      let end = start;
      while (end + 1 < scores.length && Math.abs(scores[end + 1].rawScore - scores[start].rawScore) < 1e-9) end += 1;
      const percentile = ((start + end) / 2) / (scores.length - 1);
      for (let index = start; index <= end; index += 1) result.set(scores[index].coach.id, percentile);
      start = end + 1;
    }
  }
  return result;
}

function profileFromCoach(
  coach: ParsedCoach,
  completedThroughYear: number,
  percentile: number,
  identityThroughYear = completedThroughYear,
): WnbaCoachProfile | null {
  const completedRows = coach.rows.filter(row => row.year <= completedThroughYear);
  const careerRows = coach.rows
    .filter(row => row.year <= identityThroughYear)
    .map(row => row.year <= completedThroughYear ? row : {
      ...row,
      regularSeason: parseStats(undefined),
      playoffs: parseStats(undefined),
      notes: undefined,
    });
  if (careerRows.length === 0) return null;
  const headRows = completedRows.filter(row => row.role === 'headCoach');
  const awards = visibleAwards(coach.raw, completedThroughYear);
  const achievements = visibleAchievements(coach.raw, completedThroughYear);
  const regularSeasonGames = headRows.reduce((sum, row) => sum + nonNegative(row.regularSeason.games), 0);
  const regularSeasonWins = headRows.reduce((sum, row) => sum + nonNegative(row.regularSeason.wins), 0);
  const regularSeasonLosses = headRows.reduce((sum, row) => sum + nonNegative(row.regularSeason.losses), 0);
  const playoffGames = headRows.reduce((sum, row) => sum + nonNegative(row.playoffs.games), 0);
  const playoffWins = headRows.reduce((sum, row) => sum + nonNegative(row.playoffs.wins), 0);
  const playoffLosses = headRows.reduce((sum, row) => sum + nonNegative(row.playoffs.losses), 0);
  const championships = achievements.filter(item => item.type === 'wnbaChampionship').length;
  const finalsAppearances = headRows.filter(row => {
    const note = row.notes?.toLowerCase() ?? '';
    return note.includes('champions') && !note.includes('wnba champions');
  }).length;
  const birthDate = coach.raw.biography?.birthDate || undefined;
  const deathDate = coach.raw.biography?.deathDate || undefined;
  const deathYear = deathDate ? Number(deathDate.slice(0, 4)) : undefined;
  const rating = Math.round(58 + percentile * 41);
  return {
    id: coach.id,
    name: coach.name,
    basketballReferenceUrl: coach.raw.basketballReference?.url || undefined,
    wikipediaUrl: coach.raw.wikipedia?.url || undefined,
    portraitUrl: safePortrait(coach.raw.image?.localFile),
    bornYear: birthDate ? Number(birthDate.slice(0, 4)) : undefined,
    birthDate,
    birthPlace: coach.raw.biography?.birthPlace || coach.raw.biography?.wikipedia?.birthPlace || undefined,
    nationality: safeNationality(coach.raw),
    college: coach.raw.biography?.college || undefined,
    diedYear: deathYear && deathYear <= completedThroughYear ? deathYear : undefined,
    diedDate: deathYear && deathYear <= completedThroughYear ? deathDate : undefined,
    firstListedSeason: careerRows[0].year,
    lastVisibleSeason: careerRows[careerRows.length - 1].year,
    headCoachSeasons: headRows.length,
    assistantCoachSeasons: completedRows.filter(row => row.role === 'assistantCoach').length,
    regularSeasonGames,
    regularSeasonWins,
    regularSeasonLosses,
    playoffGames,
    playoffWins,
    playoffLosses,
    championships,
    finalsAppearances,
    awards,
    achievements,
    careerRows,
    rating,
    reputation: rating,
    sourceCoachRating: Math.round(20 + percentile * 50),
    sourceCoachPercentile: Math.round(percentile * 10000) / 100,
  };
}

export function getWnbaCoachProfilesThrough(completedThroughYear: number): WnbaCoachProfile[] {
  const cutoff = Math.round(completedThroughYear);
  if (!Number.isFinite(cutoff)) return [];
  const percentiles = percentileByCoach(cutoff);
  return getCache().coaches.flatMap(coach => {
    const profile = profileFromCoach(coach, cutoff, percentiles.get(coach.id) ?? 0);
    return profile ? [profile] : [];
  });
}

function assignmentBasis(
  coaches: ParsedCoach[],
  rows: WnbaCoachSeasonRow[],
  season: number,
  completedThroughYear: number,
): { index: number; basis: WnbaCoachSelectionBasis } {
  if (rows.length === 1) return { index: 0, basis: 'only-assignment' };
  if (completedThroughYear >= season) {
    let best = 0;
    rows.forEach((row, index) => {
      if (nonNegative(row.regularSeason.games) > nonNegative(rows[best].regularSeason.games)) best = index;
    });
    return { index: best, basis: 'completed-season-games' };
  }
  const continuityIndex = coaches.findIndex((coach, index) => coach.rows.some(row => (
    row.role === 'headCoach' && row.team === rows[index].team && row.year === season - 1
  )));
  return continuityIndex >= 0
    ? { index: continuityIndex, basis: 'prior-season-continuity' }
    : { index: 0, basis: 'source-order' };
}

export function getWnbaHeadCoachAssignments(query: WnbaHeadCoachQuery): WnbaHeadCoachAssignment[] {
  const season = Math.round(query.season);
  const completedThroughYear = Math.round(query.completedThroughYear);
  if (!Number.isFinite(season) || !Number.isFinite(completedThroughYear) || season > completedThroughYear + 1) return [];
  const teamFilter = query.teamAbbrev ? normalizeTeam(query.teamAbbrev) : undefined;
  const profileCompletedThroughYear = Math.min(season, completedThroughYear);
  const percentiles = percentileByCoach(profileCompletedThroughYear);
  const grouped = new Map<string, Array<{ coach: ParsedCoach; row: WnbaCoachSeasonRow }>>();
  for (const coach of getCache().coaches) {
    for (const row of coach.rows) {
      if (row.year !== season || row.role !== 'headCoach' || (teamFilter && row.team !== teamFilter)) continue;
      const entries = grouped.get(row.team) ?? [];
      entries.push({ coach, row });
      grouped.set(row.team, entries);
    }
  }
  return [...grouped.entries()].flatMap(([, entries]) => {
    const selection = assignmentBasis(entries.map(entry => entry.coach), entries.map(entry => entry.row), season, completedThroughYear);
    return entries.flatMap((entry, index) => {
      const profile = profileFromCoach(entry.coach, profileCompletedThroughYear, percentiles.get(entry.coach.id) ?? 0, season);
      if (!profile) return [];
      const row = season <= completedThroughYear ? entry.row : {
        ...entry.row,
        regularSeason: parseStats(undefined),
        playoffs: parseStats(undefined),
        notes: undefined,
      };
      return [{
        coachId: entry.coach.id,
        coachName: entry.coach.name,
        teamAbbrev: entry.row.team,
        season,
        row,
        profile,
        primary: index === selection.index,
        selectionBasis: selection.basis,
      }];
    });
  });
}

export function getWnbaPrimaryHeadCoach(query: WnbaHeadCoachQuery): WnbaHeadCoachAssignment | undefined {
  return getWnbaHeadCoachAssignments(query).find(assignment => assignment.primary);
}

function contiguousStintStart(coachId: string, team: string, season: number): number {
  const coach = getCache().coaches.find(entry => entry.id === coachId);
  if (!coach) return season;
  const years = new Set(coach.rows
    .filter(row => row.role === 'headCoach' && row.team === team && row.year <= season)
    .map(row => row.year));
  let start = season;
  while (years.has(start - 1)) start -= 1;
  return start;
}

function careerText(rows: WnbaCoachSeasonRow[]): string {
  return rows.map(row => `${row.year} ${row.team} (${row.roleLabel})`).join('\n');
}

export function buildWnbaHeadCoachStaffMembers(options: WnbaHeadCoachStaffBuildOptions): WnbaHeadCoachStaffMember[] {
  return getWnbaHeadCoachAssignments(options)
    .filter(assignment => assignment.primary)
    .map(assignment => {
      const profile = assignment.profile;
      const hiredYear = contiguousStintStart(assignment.coachId, assignment.teamAbbrev, assignment.season);
      const team = options.teamNamesByAbbrev?.[assignment.teamAbbrev] ?? assignment.teamAbbrev;
      const careerRows = profile.careerRows.filter(row => row.year <= options.completedThroughYear);
      const coachingCareer = careerText(careerRows);
      return {
        id: `wnba-coach-${assignment.coachId}`,
        name: assignment.coachName,
        team,
        position: 'Head Coach',
        jobTitle: 'Head Coach',
        role: 'Head Coach',
        playerPortraitUrl: profile.portraitUrl,
        nationality: profile.nationality,
        bornYear: profile.bornYear,
        careerStartYear: profile.firstListedSeason,
        hiredYear,
        roleStartYear: hiredYear,
        yearsWithTeam: Math.max(0, assignment.season - hiredYear),
        leagueId: 'WNBA',
        rating: profile.rating,
        reputation: profile.reputation,
        sourceCoachRating: profile.sourceCoachRating,
        sourceCoachPercentile: profile.sourceCoachPercentile,
        basketballReferenceUrl: profile.basketballReferenceUrl,
        coachingYears: profile.headCoachSeasons + profile.assistantCoachSeasons,
        coaching_career: coachingCareer,
        career_history: coachingCareer,
        awardsSummary: profile.awards.map(award => `${award.year} ${award.name}`),
        coachAchievements: profile.achievements.map(achievement => ({
          season: achievement.year,
          type: achievement.type,
          label: achievement.note,
          league: 'WNBA',
          teamName: achievement.team,
          role: 'Head Coach',
        })),
        diedYear: profile.diedYear,
        diedDate: profile.diedDate,
        source: 'wnba-coaches-bref-wikipedia',
        sourceExperience: {
          assignmentSeason: assignment.season,
          completedThroughYear: options.completedThroughYear,
          teamAbbrev: assignment.teamAbbrev,
          selectionBasis: assignment.selectionBasis,
        },
      };
    });
}
