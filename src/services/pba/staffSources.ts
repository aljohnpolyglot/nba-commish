import type { StaffMember } from '../../types';
import rawPbaRosterData from '../../data/pba_full_roster_data.json';
import { deterministicStaffImageId } from '../../utils/staffPortrait';

type PbaTeamSource = {
  teamName?: string;
  management?: Record<string, string>;
  coachingStaff?: Array<{ name?: string; role?: string; image?: string }>;
};

const sources = (Array.isArray(rawPbaRosterData) ? rawPbaRosterData : []) as PbaTeamSource[];

const normalize = (value: unknown): string =>
  String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const cleanName = (value: unknown): string =>
  String(value ?? '')
    .replace(/\bMr\.\s*/gi, '')
    .replace(/\((?:asst|assistant)\)/gi, '')
    .trim();

const splitNames = (value: unknown): string[] =>
  String(value ?? '')
    .split(/\n|,|;/)
    .map(cleanName)
    .filter(Boolean);

const sourceForTeam = (team: any): PbaTeamSource | undefined => {
  const candidates = [
    team?.name,
    team?.region,
    `${team?.region ?? ''} ${team?.name ?? ''}`,
    team?.abbrev,
  ].map(normalize).filter(Boolean);
  return sources.find(source => {
    const key = normalize(source.teamName);
    return candidates.some(candidate => key.includes(candidate) || candidate.includes(key));
  });
};

const roleSalary = (role: string): number => {
  if (role === 'Head Coach') return 1_800_000;
  if (role === 'General Manager') return 1_400_000;
  if (role === 'Team Governor') return 1_200_000;
  return 900_000;
};

const roleRating = (name: string, role: string): number => {
  let seed = 0;
  for (let i = 0; i < `${name}-${role}`.length; i++) seed = (Math.imul(31, seed) + `${name}-${role}`.charCodeAt(i)) | 0;
  const base = role === 'Head Coach' ? 60 : role === 'Assistant Coach' ? 52 : 49;
  return Math.max(38, Math.min(78, base + (Math.abs(seed) % 15) - 7));
};

const buildMember = (
  name: string,
  role: string,
  currentYear: number,
  image?: string,
): StaffMember => {
  const rating = roleRating(name, role);
  return {
    id: `pba-real-staff-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${name.replace(/[^a-zA-Z0-9]+/g, '-')}`,
    role,
    position: role,
    jobTitle: role,
    name,
    nationality: 'Philippines',
    salary: roleSalary(role),
    contractYears: role === 'Head Coach' ? 3 : 2,
    rating,
    hiredYear: currentYear - 1,
    yearsWithTeam: 1,
    staffImageId: deterministicStaffImageId(name),
    playerPortraitUrl: image,
    attributeSeed: rating * 101,
    source: 'pba_full_roster_data',
    leagueId: 'pba',
  } as StaffMember;
};

export function buildPbaStaffMembersForTeam(team: any, currentYear: number): StaffMember[] {
  const source = sourceForTeam(team);
  if (!source) return [];
  const members: StaffMember[] = [];
  const imageByName = new Map(
    (source.coachingStaff ?? [])
      .map(entry => [normalize(cleanName(entry.name)), entry.image] as const)
      .filter(([key]) => !!key),
  );
  const push = (name: string, role: string) => {
    const key = normalize(name);
    if (!key || members.some(member => normalize(member.name) === key && member.role === role)) return;
    members.push(buildMember(name, role, currentYear, imageByName.get(key)));
  };

  for (const name of splitNames(source.management?.['HEAD COACH'] ?? source.coachingStaff?.find(entry => normalize(entry.role) === 'headcoach')?.name)) {
    push(name, 'Head Coach');
  }
  for (const name of splitNames(source.management?.['ASST COACHES'])) push(name, 'Assistant Coach');
  for (const name of splitNames(source.management?.['TEAM MANAGER'])) push(name, 'General Manager');
  for (const name of splitNames(source.management?.['TEAM GOVERNOR'])) push(name, 'Team Governor');
  return members;
}

export function attachPbaStaffToTeam(team: any, currentYear: number): any {
  const staffMembers = buildPbaStaffMembersForTeam(team, currentYear);
  if (staffMembers.length === 0) return team;
  const existing = Array.isArray(team?.tycoon?.staffMembers) ? team.tycoon.staffMembers : [];
  const existingKeys = new Set(existing.map((member: any) => `${normalize(member?.name)}|${normalize(member?.role ?? member?.position ?? member?.jobTitle)}`));
  const additions = staffMembers.filter(member => !existingKeys.has(`${normalize(member.name)}|${normalize(member.role)}`));
  if (additions.length === 0) return team;
  return {
    ...team,
    tycoon: {
      ...(team.tycoon ?? {}),
      staffMembers: [...existing, ...additions],
    },
  };
}
