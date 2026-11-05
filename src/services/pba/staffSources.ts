import type { StaffMember } from '../../types';
import rawPbaRosterData from '../../data/pba_full_roster_data.json';
import { PBA_TEAM_DATA } from '../../data/templates/philippines/teamPopulations';
import { createPortraitUsageSet, getRegenPortraitUrl } from '../../utils/newgenPortrait';
import { getStaffMarketSalary } from '../tycoon/economyScale';
import {
  getPbaHistoricalEconomyFactor,
  PBA_STAFF_ECONOMY_VERSION,
} from './historicalEconomy';

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

const PBA_ASSISTANT_COACH_NAMES = [
  'Leo Marquez', 'Rogelio Aquino', 'Tomas Velasco', 'Benjamin Cortez', 'Oscar Lim', 'Manuel de Vera',
  'Cesar Abad', 'Felipe Soriano', 'Emilio Rosales', 'Vicente Pascual', 'Roberto Evangelista', 'Lorenzo Garcia',
  'Ernesto David', 'Mario Javier', 'Andres Mendoza', 'Josefino Ramos', 'Ricardo Salazar', 'Antonio Valdez',
];

const PBA_SUPPORT_NAME_BANK: Record<string, string[]> = {
  'Head Coach': ['Ramon Alcantara', 'Edgardo Villareal', 'Nestor Bautista', 'Danilo Mercado', 'Arturo Macapagal', 'Renato Domingo'],
  'Assistant Coach': PBA_ASSISTANT_COACH_NAMES,
  'Assistant Coach 2': PBA_ASSISTANT_COACH_NAMES,
  'Assistant Coach 3': PBA_ASSISTANT_COACH_NAMES,
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

const pbaStaffPortraits = new Map(
  sources.flatMap(source => (source.coachingStaff ?? []).flatMap(entry => {
    const name = normalize(cleanName(entry.name));
    return name && entry.image ? [[name, entry.image] as const] : [];
  })),
);

export const getPbaStaffPortrait = (name: string): string | undefined =>
  pbaStaffPortraits.get(normalize(cleanName(name)));

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

const roleSalary = (role: string, rating: number, currentYear: number): number => {
  const economyScale = getPbaHistoricalEconomyFactor(currentYear);
  if (role === 'General Manager') return Math.round(7_500_000 * economyScale);
  if (role === 'Team Governor') return Math.round(6_500_000 * economyScale);
  return getStaffMarketSalary(undefined, role, rating, {
    market: 'pba',
    yearsExperience: 6,
    yearsWithTeam: 1,
    economyScale,
  });
};

export function applyPbaStaffEconomyScale(team: any, currentYear: number): any {
  const currentEconomyIndex = getPbaHistoricalEconomyFactor(currentYear);
  const existing = Array.isArray(team?.tycoon?.staffMembers) ? team.tycoon.staffMembers : [];
  let changed = team?.tycoon?.currentEconomyIndex !== currentEconomyIndex;
  const staffMembers = existing.map((member: StaffMember) => {
    if (Number(member.staffEconomyVersion) === PBA_STAFF_ECONOMY_VERSION) return member;
    const role = String(member.role ?? member.position ?? member.jobTitle ?? '').trim();
    if (!role) return member;
    const rating = Number.isFinite(Number(member.rating)) ? Number(member.rating) : roleRating(member.name, role);
    changed = true;
    return {
      ...member,
      salary: roleSalary(role, rating, currentYear),
      staffEconomyVersion: PBA_STAFF_ECONOMY_VERSION,
    };
  });
  if (!changed) return team;
  return {
    ...team,
    tycoon: {
      ...(team.tycoon ?? {}),
      currentEconomyIndex,
      staffMembers,
    },
  };
}

const roleContractYears = (name: string, role: string, currentYear: number): number => {
  const [minimum, maximum] = role === 'Head Coach'
    ? [2, 4]
    : role === 'General Manager' || role === 'Team Governor' || role === 'Chief Scout'
      ? [2, 3]
      : [1, 3];
  return minimum + (hashSeed(`${name}-${role}-${currentYear}-contract`) % (maximum - minimum + 1));
};

const roleRating = (name: string, role: string): number => {
  let seed = 0;
  for (let i = 0; i < `${name}-${role}`.length; i++) seed = (Math.imul(31, seed) + `${name}-${role}`.charCodeAt(i)) | 0;
  const base = role === 'Head Coach' ? 60 : role.startsWith('Assistant Coach') ? 52 : 49;
  return Math.max(38, Math.min(64, base + (Math.abs(seed) % 15) - 7));
};

const generatedSupportName = (team: any, role: string, excludedNames = new Set<string>()): string => {
  const pool = PBA_SUPPORT_NAME_BANK[role] ?? ['PBA Staff'];
  const seed = hashSeed(`${team?.abbrev ?? team?.name ?? 'pba'}-${role}`);
  const start = seed % pool.length;
  for (let offset = 0; offset < pool.length; offset++) {
    const candidate = pool[(start + offset) % pool.length];
    if (!excludedNames.has(normalize(candidate))) return candidate;
  }
  return pool[start];
};

const buildMember = (
  name: string,
  role: string,
  currentYear: number,
  image?: string,
  generatedPortrait = false,
  usedPortraitUrls?: Set<string>,
): StaffMember => {
  const rating = roleRating(name, role);
  const generatedPortraitUrl = generatedPortrait
    ? getRegenPortraitUrl(`${name}-${role}`, 'asian', { nationality: 'Philippines', kind: 'staff', usedPortraitUrls }) ?? undefined
    : undefined;
  return {
    id: `pba-real-staff-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${name.replace(/[^a-zA-Z0-9]+/g, '-')}`,
    role,
    position: role,
    jobTitle: role,
    name,
    nationality: 'Philippines',
    salary: roleSalary(role, rating, currentYear),
    staffEconomyVersion: PBA_STAFF_ECONOMY_VERSION,
    contractYears: roleContractYears(name, role, currentYear),
    rating,
    hiredYear: currentYear - 1,
    yearsWithTeam: 1,
    staffImageId: undefined,
    playerPortraitUrl: image ?? generatedPortraitUrl,
    attributeSeed: rating * 101,
    source: generatedPortrait ? 'generated-pba-staff' : 'pba_full_roster_data',
    isPlaceholder: generatedPortrait,
    leagueId: 'pba',
  } as StaffMember;
};

export function buildPbaStaffMembersForTeam(
  team: any,
  currentYear: number,
  usedPortraitUrls = createPortraitUsageSet(),
): StaffMember[] {
  const source = sourceForTeam(team);
  const meta = teamMetaFor(team);
  if (!source && !meta) return [];
  const members: StaffMember[] = [];
  const imageByName = new Map(
    (source?.coachingStaff ?? [])
      .map(entry => [normalize(cleanName(entry.name)), entry.image] as const)
      .filter(([key]) => !!key),
  );
  const push = (name: string, role: string, generatedPortrait = false) => {
    const key = normalize(name);
    if (!key || members.some(member => normalize(member.name) === key && member.role === role)) return;
    members.push(buildMember(name, role, currentYear, imageByName.get(key), generatedPortrait, usedPortraitUrls));
  };

  for (const name of splitNames(source?.management?.['HEAD COACH'] ?? source?.coachingStaff?.find(entry => normalize(entry.role) === 'headcoach')?.name ?? meta?.coach)) {
    push(name, 'Head Coach');
  }
  const assistantNames = splitNames(source?.management?.['ASST COACHES']);
  const usedAssistantNames = new Set(assistantNames.map(normalize));
  const assistantSlots = ['Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'] as const;
  assistantSlots.forEach((role, index) => {
    const assistantName = assistantNames[index];
    if (assistantName) push(assistantName, role);
    else {
      const generatedName = generatedSupportName(team, role, usedAssistantNames);
      usedAssistantNames.add(normalize(generatedName));
      push(generatedName, role, true);
    }
  });

  const chiefScoutName = splitNames(source?.management?.['TEAM MANAGER'])[0] ?? generatedSupportName(team, 'Chief Scout');
  push(chiefScoutName, 'Chief Scout');
  push(chiefScoutName, 'General Manager');

  for (const role of ['Head of Sports Science', 'Head Physio', 'Player Development Coach', 'Head of Analytics'] as const) {
    push(generatedSupportName(team, role), role, true);
  }

  const teamGovernorName = splitNames(source?.management?.['TEAM GOVERNOR'])[0] ?? meta?.governor;
  if (teamGovernorName) push(teamGovernorName, 'Team Governor');
  return members;
}

export function buildHistoricalPbaStaffMembersForTeam(team: any, currentYear: number): StaffMember[] {
  const usedPortraitUrls = createPortraitUsageSet();
  const usedNames = new Set<string>();
  return VISIBLE_PBA_STAFF_ROLES.map((role, index) => {
    const pool = PBA_SUPPORT_NAME_BANK[role] ?? ['PBA Staff'];
    const start = hashSeed(`${team?.tid ?? team?.id ?? team?.abbrev}-${currentYear}-${role}`) % pool.length;
    let name = pool[start];
    for (let offset = 0; offset < pool.length && usedNames.has(normalize(name)); offset++) {
      name = pool[(start + offset + 1) % pool.length];
    }
    usedNames.add(normalize(name));
    const member = buildMember(name, role, currentYear, undefined, true, usedPortraitUrls);
    return {
      ...member,
      id: `pba-historical-staff-${team?.tid ?? team?.id ?? 'team'}-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${currentYear}-${index}`,
      source: 'historical-pba-generated-staff',
      isPlaceholder: false,
    } as StaffMember;
  });
}

export function attachHistoricalPbaStaffToTeam(team: any, currentYear: number): any {
  const existing = Array.isArray(team?.tycoon?.staffMembers) ? team.tycoon.staffMembers : [];
  const existingRoles = new Set(existing.map((member: any) => normalize(member?.role ?? member?.position ?? member?.jobTitle)));
  const missing = buildHistoricalPbaStaffMembersForTeam(team, currentYear)
    .filter(member => !existingRoles.has(normalize(member.role)));
  const currentEconomyIndex = getPbaHistoricalEconomyFactor(currentYear);
  if (missing.length === 0 && team?.tycoon?.currentEconomyIndex === currentEconomyIndex) return team;
  return {
    ...team,
    tycoon: {
      ...(team.tycoon ?? {}),
      currentEconomyIndex,
      staffMembers: [...existing, ...missing],
    },
  };
}

export function getPbaHeadCoachPhotoForTeam(team: any, currentYear: number): string | undefined {
  return buildPbaStaffMembersForTeam(team, currentYear)
    .find(member => normalize(member.role) === 'headcoach')
    ?.playerPortraitUrl;
}

export function attachPbaStaffToTeam(team: any, currentYear: number, usedPortraitUrls = createPortraitUsageSet()): any {
  const staffMembers = buildPbaStaffMembersForTeam(team, currentYear, usedPortraitUrls);
  const meta = teamMetaFor(team);
  if (staffMembers.length === 0 && !meta) return team;
  const currentEconomyIndex = getPbaHistoricalEconomyFactor(currentYear);
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
      if (shouldReplace) {
        const hasCurrentEconomySalary = Number(current?.staffEconomyVersion) === PBA_STAFF_ECONOMY_VERSION;
        nextMembers[existingIndex] = {
          ...current,
          ...member,
          salary: hasCurrentEconomySalary && Number.isFinite(Number(current?.salary)) ? current.salary : member.salary,
          staffEconomyVersion: PBA_STAFF_ECONOMY_VERSION,
          contractYears: Number.isFinite(Number(current?.contractYears)) ? current.contractYears : member.contractYears,
          hiredYear: Number.isFinite(Number(current?.hiredYear)) ? current.hiredYear : member.hiredYear,
          yearsWithTeam: Number.isFinite(Number(current?.yearsWithTeam)) ? current.yearsWithTeam : member.yearsWithTeam,
        };
      }
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
  const changedEconomyIndex = team?.tycoon?.currentEconomyIndex !== currentEconomyIndex;
  if (nextMembers.length === existing.length && !changedOwnerName && !changedEconomyIndex) return team;
  return {
    ...team,
    ownerProfile,
    tycoon: {
      ...(team.tycoon ?? {}),
      currentEconomyIndex,
      staffMembers: nextMembers,
    },
  };
}
