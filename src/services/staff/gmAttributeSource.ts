import nbaArchive from '../../data/gm_attributes_nba.json';
import wnbaArchive from '../../data/gm_attributes_wnba.json';
import type { NBATeam, StaffData, StaffMember } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { normalizeGMAttributes, type GMAttributes } from './gmAttributes';

type SourceLeague = 'nba' | 'wnba';

type SourceGM = {
  id: string;
  name: string;
  basketballReferenceUrl?: string;
  teams?: Array<{ name?: string; abbreviation?: string; tenure?: string }>;
  indexedTenures?: Array<Record<string, unknown>>;
  attributes?: Record<string, number>;
  imageUrl?: string;
  bio?: Record<string, unknown>;
  wikipediaUrl?: string;
};

type RuntimeArchive = {
  league: SourceLeague;
  currentCompletedSeasonEndYear: number;
  gms: SourceGM[];
};

export type SourcedGMProfile = SourceGM & {
  attributes: GMAttributes;
  sourceLeague: SourceLeague;
  sourceCutoffYear: number;
};

const archives: Record<SourceLeague, RuntimeArchive> = {
  nba: nbaArchive as RuntimeArchive,
  wnba: wnbaArchive as RuntimeArchive,
};

const isSourceSeasonEligible = (archive: RuntimeArchive, seasonEndYear: number): boolean =>
  seasonEndYear >= archive.currentCompletedSeasonEndYear
  && seasonEndYear <= archive.currentCompletedSeasonEndYear + 1;

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const compact = (value: unknown): string => String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

function tenureYears(tenure: string | undefined): { start: number; end: number } {
  const years = String(tenure ?? '').match(/\b(?:18|19|20)\d{2}\b/g)?.map(Number) ?? [];
  const start = years[0] ?? 0;
  const end = /present|current/i.test(String(tenure ?? '')) ? Number.POSITIVE_INFINITY : (years.at(-1) ?? start);
  return { start, end };
}

function profileFromSource(source: SourceGM, league: SourceLeague): SourcedGMProfile {
  const archive = archives[league];
  return {
    ...source,
    attributes: normalizeGMAttributes(source.attributes),
    sourceLeague: league,
    sourceCutoffYear: archive.currentCompletedSeasonEndYear,
  };
}

export function getSourcedGMByIdentity(
  league: SourceLeague,
  identity: { executiveId?: string; name?: string },
  seasonEndYear: number,
): SourcedGMProfile | null {
  const archive = archives[league];
  if (!isSourceSeasonEligible(archive, seasonEndYear)) return null;
  const id = compact(identity.executiveId);
  const name = normalize(identity.name);
  const source = archive.gms.find(gm => (id && compact(gm.id) === id) || (name && normalize(gm.name) === name));
  return source ? profileFromSource(source, league) : null;
}

export function getSourcedGMForTeam(
  league: SourceLeague,
  team: NBATeam,
  seasonEndYear: number,
): SourcedGMProfile | null {
  const archive = archives[league];
  if (!isSourceSeasonEligible(archive, seasonEndYear)) return null;
  const abbreviations = new Set([
    compact(team.abbrev),
    compact((team as NBATeam & { abbreviation?: string }).abbreviation),
  ].filter(Boolean));
  const names = new Set([normalize(team.name), normalize(team.region), normalize(getTeamFullName(team))].filter(Boolean));
  const candidates = archive.gms.flatMap(gm => (gm.teams ?? []).flatMap(tenure => {
    const matches = abbreviations.has(compact(tenure.abbreviation)) || names.has(normalize(tenure.name));
    if (!matches) return [];
    const years = tenureYears(tenure.tenure);
    return years.start <= seasonEndYear && years.end >= seasonEndYear ? [{ gm, start: years.start }] : [];
  }));
  candidates.sort((left, right) => right.start - left.start || left.gm.name.localeCompare(right.gm.name));
  return candidates[0] ? profileFromSource(candidates[0].gm, league) : null;
}

export function sourceFieldsForStaff(profile: SourcedGMProfile): Partial<StaffMember> {
  return {
    id: `bref-${profile.sourceLeague}-gm-${profile.id}`,
    name: profile.name,
    ...(profile.imageUrl ? { playerPortraitUrl: profile.imageUrl } : {}),
    attributes: profile.attributes,
    basketballReferenceUrl: profile.basketballReferenceUrl,
    executiveId: profile.id,
    executiveBio: profile.bio,
    source: `bref-${profile.sourceLeague}-gm-attributes`,
  };
}

function staffMatchesTeam(member: StaffMember, team: NBATeam): boolean {
  const label = normalize(member.team ?? member.position);
  const names = [normalize(team.name), normalize(team.region), normalize(getTeamFullName(team))].filter(Boolean);
  return !!label && names.some(name => label === name || label.includes(name));
}

export function mergeSourcedLeagueGMs(
  staff: StaffData,
  teams: NBATeam[],
  seasonEndYear: number,
  league: SourceLeague,
): StaffData {
  const existing = staff.gms ?? [];
  const consumed = new Set<StaffMember>();
  const sourced = teams.flatMap(team => {
    const profile = getSourcedGMForTeam(league, team, seasonEndYear);
    if (!profile) return [];
    const previous = existing.find(member => !consumed.has(member) && staffMatchesTeam(member, team));
    if (previous) consumed.add(previous);
    return [{
      ...previous,
      ...sourceFieldsForStaff(profile),
      team: getTeamFullName(team),
      position: 'General Manager',
      jobTitle: 'General Manager',
      teamLogoUrl: team.logoUrl ?? (team as NBATeam & { imgURL?: string }).imgURL,
      leagueId: league,
      isPlaceholder: false,
    } as StaffMember];
  });
  return sourced.length > 0 ? { ...staff, gms: [...sourced, ...existing.filter(member => !consumed.has(member))] } : staff;
}
