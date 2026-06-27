import type { StaffMember } from '../../types';
import rawPbaRosterData from '../../data/pba_full_roster_data.json';
import { PBA_TEAM_DATA } from '../../data/templates/philippines/teamPopulations';
import { getRegenPortraitUrl } from '../../utils/newgenPortrait';
import { getStaffMarketSalary } from '../tycoon/economyScale';

type PbaTeamSource = {
  teamName?: string;
  management?: Record<string, string>;
  coachingStaff?: Array<{ name?: string; role?: string; image?: string }>;
};

const sources = (Array.isArray(rawPbaRosterData) ? rawPbaRosterData : []) as PbaTeamSource[];

const normalize = (value: unknown): string =>
  String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const VISIBLE_PBA_STAFF_ROLES = [
  'Head Coach',
  'Assistant Coach',
  'Assistant Coach 2',
  'Assistant Coach 3',
  'Head of Sports Science',
  'Head Physio',
  'Player Development Coach',
  'Chief Scout',
  'Head of Analytics',
] as const;

const PBA_SUPPORT_NAME_BANK: Record<string, string[]> = {
  'Head of Sports Science': ['Miguel Santiago', 'Paolo Valdez', 'Luis Navarro', 'Jeric Ramos'],
  'Head Physio': ['Anton Reyes', 'Marco Dizon', 'Gabriel Cruz', 'Nico Salazar'],
  'Player Development Coach': ['Jio Casimiro', 'Miko Javier', 'Rafi Mendoza', 'Carlo Manalo'],
  'Chief Scout': ['Paolo Bugia', 'JB Baylon', 'Patrick Cabahug', 'Mark Yee'],
  'Head of Analytics': ['Enzo Villanueva', 'Carlo Tuazon', 'Miggs Santos', 'Renz David'],
};

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

const hashSeed = (value: string): number => {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i++) {
    seed ^= value.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return (seed >>> 0) || 1;
};

const teamMetaFor = (team: any) => {
  const candidates = [
    team?.abbrev,
    team?.region,
    team?.name,
    `${team?.region ?? ''} ${team?.name ?? ''}`,
  ].map(normalize).filter(Boolean);
  return PBA_TEAM_DATA.find(entry => {
    const keys = [entry.abbrev, entry.region, entry.name, ...(entry.aliases ?? [])].map(normalize);
    return keys.some(key => candidates.some(candidate => candidate === key || candidate.includes(key) || key.includes(candidate)));
  });
};

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

const roleSalary = (role: string, rating: number): number => {
  if (role === 'General Manager') return 7_500_000;
  if (role === 'Team Governor') return 6_500_000;
  return getStaffMarketSalary(undefined, role, rating, { market: 'pba', yearsExperience: 6, yearsWithTeam: 1 });
};

const roleContractYears = (role: string): number => {
  if (role === 'Head Coach') return 3;
  if (role === 'Chief Scout') return 2;
  if (role === 'General Manager' || role === 'Team Governor') return 2;
  return 1;
};

const roleRating = (name: string, role: string): number => {
  let seed = 0;
  for (let i = 0; i < `${name}-${role}`.length; i++) seed = (Math.imul(31, seed) + `${name}-${role}`.charCodeAt(i)) | 0;
  const base = role === 'Head Coach' ? 60 : role === 'Assistant Coach' ? 52 : 49;
  return Math.max(38, Math.min(64, base + (Math.abs(seed) % 15) - 7));
};

const generatedSupportName = (team: any, role: string): string => {
  const pool = PBA_SUPPORT_NAME_BANK[role] ?? ['PBA Staff'];
  const seed = hashSeed(`${team?.abbrev ?? team?.name ?? 'pba'}-${role}`);
  return pool[seed % pool.length];
};

const buildMember = (
  name: string,
  role: string,
  currentYear: number,
  image?: string,
): StaffMember => {
  const rating = roleRating(name, role);
  const portraitUrl = image ?? getRegenPortraitUrl(`${name}-${role}`, 'asian', { nationality: 'Philippines' }) ?? undefined;
  return {
    id: `pba-real-staff-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${name.replace(/[^a-zA-Z0-9]+/g, '-')}`,
    role,
    position: role,
    jobTitle: role,
    name,
    nationality: 'Philippines',
    salary: roleSalary(role, rating),
    contractYears: roleContractYears(role),
    rating,
    hiredYear: currentYear - 1,
    yearsWithTeam: 1,
    staffImageId: undefined,
    playerPortraitUrl: portraitUrl,
    attributeSeed: rating * 101,
    source: 'pba_full_roster_data',
    leagueId: 'pba',
  } as StaffMember;
};

export function buildPbaStaffMembersForTeam(team: any, currentYear: number): StaffMember[] {
  const source = sourceForTeam(team);
  const meta = teamMetaFor(team);
  if (!source && !meta) return [];
  const members: StaffMember[] = [];
  const imageByName = new Map(
    (source?.coachingStaff ?? [])
      .map(entry => [normalize(cleanName(entry.name)), entry.image] as const)
      .filter(([key]) => !!key),
  );
  const push = (name: string, role: string) => {
    const key = normalize(name);
    if (!key || members.some(member => normalize(member.name) === key && member.role === role)) return;
    members.push(buildMember(name, role, currentYear, imageByName.get(key)));
  };

  for (const name of splitNames(source?.management?.['HEAD COACH'] ?? source?.coachingStaff?.find(entry => normalize(entry.role) === 'headcoach')?.name ?? meta?.coach)) {
    push(name, 'Head Coach');
  }
  const assistantNames = splitNames(source?.management?.['ASST COACHES']);
  const assistantSlots = ['Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'] as const;
  assistantSlots.forEach((role, index) => {
    const assistantName = assistantNames[index] ?? generatedSupportName(team, role);
    push(assistantName, role);
  });

  const chiefScoutName = splitNames(source?.management?.['TEAM MANAGER'])[0] ?? generatedSupportName(team, 'Chief Scout');
  push(chiefScoutName, 'Chief Scout');
  push(chiefScoutName, 'General Manager');

  for (const role of ['Head of Sports Science', 'Head Physio', 'Player Development Coach', 'Head of Analytics'] as const) {
    push(generatedSupportName(team, role), role);
  }

  const teamGovernorName = splitNames(source?.management?.['TEAM GOVERNOR'])[0] ?? meta?.governor;
  if (teamGovernorName) push(teamGovernorName, 'Team Governor');
  return members;
}

export function getPbaHeadCoachPhotoForTeam(team: any, currentYear: number): string | undefined {
  return buildPbaStaffMembersForTeam(team, currentYear)
    .find(member => normalize(member.role) === 'headcoach')
    ?.playerPortraitUrl;
}

export function attachPbaStaffToTeam(team: any, currentYear: number): any {
  const staffMembers = buildPbaStaffMembersForTeam(team, currentYear);
  const meta = teamMetaFor(team);
  if (staffMembers.length === 0 && !meta) return team;
  const existing = Array.isArray(team?.tycoon?.staffMembers) ? team.tycoon.staffMembers : [];
  const nextMembers = [...existing];
  for (const member of staffMembers) {
    const roleKey = normalize(member.role);
    const existingIndex = nextMembers.findIndex(
      (entry: any) => normalize(entry?.role ?? entry?.position ?? entry?.jobTitle) === roleKey,
    );
    if (existingIndex >= 0) {
      const current = nextMembers[existingIndex];
      const currentName = normalize(current?.name);
      const shouldReplace =
        !currentName ||
        current?.isPlaceholder === true ||
        String(current?.source ?? '').startsWith('pba');
      if (shouldReplace) nextMembers[existingIndex] = { ...current, ...member };
      continue;
    }
    nextMembers.push(member);
  }

  const existingOwnerProfile = team?.ownerProfile;
  const ownerProfile = meta
    ? {
        name: meta.company,
        nationality: 'Philippines',
        face: existingOwnerProfile?.face ?? null,
        staffImageId: existingOwnerProfile?.staffImageId,
        wealthTier: existingOwnerProfile?.wealthTier ?? (meta.pop >= 8 ? 'Billionaire' : meta.pop >= 3 ? 'NationalMagnate' : 'LocalWealthy'),
        patience: existingOwnerProfile?.patience ?? (meta.championships > 0 ? 'Steady' : 'LongTerm'),
        vision: existingOwnerProfile?.vision ?? (meta.championships > 0 ? 'WinNow' : 'Develop'),
        cashInjectionUsedThisSeason: existingOwnerProfile?.cashInjectionUsedThisSeason ?? false,
        seasonsSinceLastInjection: existingOwnerProfile?.seasonsSinceLastInjection ?? 0,
        consecutiveBadSeasons: existingOwnerProfile?.consecutiveBadSeasons ?? 0,
      }
    : existingOwnerProfile;

  const changedOwnerName = ownerProfile?.name && ownerProfile.name !== existingOwnerProfile?.name;
  if (nextMembers.length === existing.length && !changedOwnerName) return team;
  return {
    ...team,
    ownerProfile,
    tycoon: {
      ...(team.tycoon ?? {}),
      staffMembers: nextMembers,
    },
  };
}
