import type { NonNBATeam, StaffMember } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import type { StaffRetirementRecord } from '../staff/staffRetirement';
import {
  inferSourceRetirement,
  type SourceRetirementResult,
} from '../retirement/sourceRetirement';
import type { PbaHistoricalCoach } from './historicalRemoteSources';

export type PbaCoachRetirementCareerEntry = {
  role: string;
  start: number;
  end: number;
  team: string;
};

type PreparedCoach = {
  coach: PbaHistoricalCoach;
  entries: PbaCoachRetirementCareerEntry[];
};

export type PbaCoachRetirementIndex = {
  byCoachKey: Map<string, SourceRetirementResult>;
  announcements: StaffRetirementRecord[];
};

export const pbaHistoricalCoachKey = (coach: PbaHistoricalCoach): string => (
  String(coach.id ?? coach.name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
);

const roleLabel = (role: string): string => {
  if (role === 'head') return 'Head Coach';
  if (role === 'development' || role === 'youth') return 'Player Development Coach';
  if (role === 'consultant') return 'Consultant';
  return 'Assistant Coach';
};

const sourceBornYear = (coach: PbaHistoricalCoach): number | undefined => {
  const text = Object.entries(coach.allInfoboxFields ?? {})
    .find(([key]) => /born|birth/i.test(key))?.[1] ?? '';
  const match = String(text).match(/\b((?:19|20)\d{2})\b/);
  const year = Number(match?.[1]);
  return Number.isInteger(year) ? year : undefined;
};

const portraitUrl = (coach: PbaHistoricalCoach): string | undefined => {
  const value = typeof coach.image === 'string'
    ? coach.image
    : coach.image?.originalFileUrl
      ?? coach.image?.largestThumbnailUrl
      ?? coach.image?.thumbnailUrl
      ?? coach.image?.originalUrl
      ?? coach.image?.url;
  return String(value ?? '').trim() || undefined;
};

const yearsThrough = (entries: PbaCoachRetirementCareerEntry[], cutoff: number): number => {
  const years = new Set<number>();
  for (const entry of entries) {
    for (let year = entry.start; year <= Math.min(entry.end, cutoff); year += 1) years.add(year);
  }
  return years.size;
};

export function buildPbaHistoricalCoachRetirementIndex(
  prepared: PreparedCoach[],
  cutoff: number,
  resolveTeam: (teamName: string) => NonNBATeam | undefined,
): PbaCoachRetirementIndex {
  const sourceCoverageThrough = Math.max(
    cutoff,
    ...prepared.flatMap(({ coach, entries }) => [
      Number(coach.season_max ?? coach.lastSeason ?? 0),
      ...entries.filter(entry => entry.end < 9999).map(entry => entry.end),
    ]).filter(Number.isFinite),
  );
  const byCoachKey = new Map<string, SourceRetirementResult>();
  const announcements: StaffRetirementRecord[] = [];

  for (const { coach, entries } of prepared) {
    const retirement = inferSourceRetirement({
      retiredYear: coach.retiredYear,
      retireddYer: coach.retireddYer,
      retirementYear: coach.retirementYear,
      lastSeason: coach.lastSeason,
      season_max: coach.season_max,
      bornYear: sourceBornYear(coach),
      assignments: entries
        .filter(entry => entry.end < 9999)
        .map(entry => ({ season: entry.end, games: 1 })),
    }, {
      branchCutoffYear: cutoff,
      sourceCoverageThrough,
      kind: 'staff',
      confirmThroughSourceCoverage: true,
    });
    const key = pbaHistoricalCoachKey(coach);
    if (!retirement || !key) continue;
    byCoachKey.set(key, retirement);
    if (retirement.retiredYear !== cutoff) continue;

    const latest = entries
      .filter(entry => entry.end <= cutoff)
      .sort((left, right) => right.end - left.end || right.start - left.start)[0];
    const team = latest ? resolveTeam(latest.team) : undefined;
    const yearsExperience = yearsThrough(entries, cutoff);
    const bornYear = sourceBornYear(coach);
    const age = bornYear ? Math.max(0, cutoff - bornYear) : 65;
    announcements.push({
      id: `source-pba-staff-retire-${coach.id ?? key}-${cutoff}`,
      staffId: coach.id,
      name: String(coach.name ?? 'PBA Coach'),
      role: roleLabel(latest?.role ?? 'assistant'),
      portraitUrl: portraitUrl(coach),
      teamName: team ? getTeamFullName(team as any) : latest?.team ?? 'PBA',
      teamId: team?.tid,
      teamAbbrev: team?.abbrev,
      teamLogoUrl: team?.imgURL,
      leagueId: 'pba',
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
      coachAchievements: [] as StaffMember['coachAchievements'],
      hallOfFameEligible: false,
      hallOfFameScore: 0,
      sourceRetirement: retirement,
    });
  }

  return { byCoachKey, announcements };
}
