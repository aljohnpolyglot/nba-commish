import type { StaffData, StaffMember } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { getTeamFullName } from '../../utils/teamNames';
import {
  appendStaffCareerRow,
  closePresentCareerRanges,
  currentStaffYearsWithTeam,
  finalizeStaffStint,
  staffTeamHiredYear,
} from './staffCareerRows';
import { attrsForCoach, computeStaffOverall, seedForStaff } from './displayAttributes';

type StaffTeam = {
  id?: number;
  tid?: number;
  name?: string;
  region?: string;
  teamName?: string;
  tycoon?: {
    staffMembers?: StaffMember[];
    firedStaffRoles?: string[];
  };
};

export type StaffContractReconciliation<T extends StaffTeam = StaffTeam> = {
  team: T;
  released: StaffMember[];
  promoted?: StaffMember;
  interimPlayerCoach?: StaffMember;
  changed: boolean;
};

type PlayerCoachCandidate = {
  internalId?: string;
  id?: string | number;
  name?: string;
  tid?: number;
  age?: number;
  born?: { year?: number };
  imgURL?: string;
  nationality?: string;
  status?: string;
  retiredYear?: number;
  diedYear?: number;
  overallRating?: number;
};

type StaffContractReconciliationOptions = {
  activeRosterPlayers?: PlayerCoachCandidate[];
};

type DeceasedStaffIdentity = {
  staffId?: string;
  name: string;
  teamName?: string;
};

export type ActingHeadCoach = StaffMember & {
  actingHeadCoach: true;
  actingFromRole: string;
};

export type OpeningHeadCoachRepair<T extends StaffTeam = StaffTeam> = {
  team: T;
  headCoach?: StaffMember;
  changed: boolean;
};

const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function isOpeningNbaStaffWindow(state: any): boolean {
  if (state?.leagueType !== 'modded' || (state?.moddedLeagueBase ?? 'nba') !== 'nba') return false;
  if (state?.leagueStats?.uiMode && state.leagueStats.uiMode !== 'nba') return false;
  const branchStartYear = Number(state?.nbaStartYear);
  const seasonYear = Number(state?.leagueStats?.year);
  const normalized = normalizeDate(state?.date);
  const calendarYear = Number(normalized.slice(0, 4));
  const calendarMonth = Number(normalized.slice(5, 7));
  const openingRosterMode = String(state?.leagueStats?.openingRosterMode ?? 'fixed');
  return Number.isFinite(branchStartYear)
    && seasonYear === branchStartYear + 1
    && calendarYear === branchStartYear
    && calendarMonth >= 9
    && calendarMonth <= 10
    && Number(state?.day ?? 1) <= 1
    && ['fixed', 'opening', 'fantasy_draft'].includes(openingRosterMode);
}

export const canonicalStaffSlotRole = (value: unknown): string => {
  const raw = String(value ?? '').trim().replace(/\s+/g, ' ');
  const lower = raw.toLowerCase();
  if (lower === 'head coach') return 'Head Coach';
  if (lower === 'lead assistant coach' || lower === 'associate head coach') return 'Assistant Coach';
  if (lower === 'assistant coach') return 'Assistant Coach';
  if (lower === 'assistant coach 2') return 'Assistant Coach 2';
  if (lower === 'assistant coach 3') return 'Assistant Coach 3';
  return raw;
};

export const baseStaffContractRole = (value: unknown): string =>
  canonicalStaffSlotRole(value).replace(/ \d+$/, '');

export const staffContractIdentityKey = (member: Partial<StaffMember> | null | undefined): string => {
  const sourcePlayerId = String(member?.sourcePlayerId ?? '').trim();
  if (sourcePlayerId) return `player:${sourcePlayerId}`;
  const name = normalizeText(member?.name);
  if (name) return `name:${name}`;
  const id = String(member?.id ?? '').trim();
  return id ? `id:${id}` : '';
};

export function isActiveStaffContract(member: Partial<StaffMember> | null | undefined, currentYear?: number): boolean {
  if (!member || member.retiredYear != null || member.diedYear != null) return false;
  const years = Number(member.contractYears);
  if (member.contractYears != null && Number.isFinite(years)) return Math.round(years) > 0;
  const contractExp = Number((member as StaffMember & { contractExp?: number }).contractExp);
  if (Number.isFinite(contractExp) && Number.isFinite(currentYear)) return contractExp >= Number(currentYear);
  return true;
}

export function hasPersistedStaffRoster(team: StaffTeam | null | undefined): boolean {
  return Array.isArray(team?.tycoon?.staffMembers) && team.tycoon.staffMembers.length > 0;
}

export function getActiveTeamStaffMembers(team: StaffTeam | null | undefined, currentYear?: number): StaffMember[] {
  const members = team?.tycoon?.staffMembers ?? [];
  const seenRoles = new Set<string>();
  const seenPeople = new Set<string>();
  const active: StaffMember[] = [];
  for (const member of members) {
    if (!isActiveStaffContract(member, currentYear)) continue;
    const role = canonicalStaffSlotRole(member.role ?? member.position ?? member.jobTitle);
    const personKey = staffContractIdentityKey(member);
    if (!role || seenRoles.has(role) || (personKey && seenPeople.has(personKey))) continue;
    seenRoles.add(role);
    if (personKey) seenPeople.add(personKey);
    active.push(member);
  }
  return active;
}

export function resolveActiveHeadCoach(team: StaffTeam | null | undefined, currentYear?: number): StaffMember | undefined {
  return getActiveTeamStaffMembers(team, currentYear)
    .find(member => baseStaffContractRole(member.role ?? member.position ?? member.jobTitle) === 'Head Coach');
}

const assistantScore = (member: StaffMember): number => {
  const rating = Number(member.rating ?? member.reputation ?? 0);
  const reputation = Number(member.reputation ?? member.rating ?? 0);
  const attributes = member.attributes as unknown as Record<string, unknown> | undefined;
  const attributeOverall = Number(attributes?.overall ?? 0);
  return (Number.isFinite(rating) ? rating : 0) * 2
    + (Number.isFinite(reputation) ? reputation : 0)
    + (Number.isFinite(attributeOverall) ? attributeOverall : 0);
};

export function resolveActiveOrActingHeadCoach(
  team: StaffTeam | null | undefined,
  currentYear?: number,
): StaffMember | ActingHeadCoach | undefined {
  const active = getActiveTeamStaffMembers(team, currentYear);
  const headCoach = active.find(member => (
    baseStaffContractRole(member.role ?? member.position ?? member.jobTitle) === 'Head Coach'
  ));
  if (headCoach) return headCoach;
  const assistant = active
    .filter(member => baseStaffContractRole(member.role ?? member.position ?? member.jobTitle) === 'Assistant Coach')
    .sort((left, right) => assistantScore(right) - assistantScore(left)
      || normalizeText(left.name).localeCompare(normalizeText(right.name)))[0];
  if (!assistant) return undefined;
  return {
    ...assistant,
    role: 'Head Coach',
    position: 'Acting Head Coach',
    jobTitle: 'Acting Head Coach',
    actingHeadCoach: true,
    actingFromRole: canonicalStaffSlotRole(assistant.role ?? assistant.position ?? assistant.jobTitle),
  };
}

const teamStaffKeys = (team: StaffTeam): Set<string> => new Set([
  getTeamFullName(team),
  team.name,
  team.teamName,
].map(normalizeText).filter(Boolean));

const isDirectoryHeadCoachForTeam = (member: StaffMember, team: StaffTeam): boolean => {
  const role = baseStaffContractRole(member.role ?? member.position ?? member.jobTitle);
  return role === 'Head Coach' && teamStaffKeys(team).has(normalizeText(member.team));
};

const isCanonicalOpeningCoach = (member: StaffMember, directoryHeadCoach?: StaffMember): boolean => {
  const source = normalizeText(member.source);
  return source === 'nba-real-staff'
    || source === 'historical-nba-coaches'
    || source === 'historical-nba-generated-staff'
    || (!!directoryHeadCoach && staffContractIdentityKey(member) === staffContractIdentityKey(directoryHeadCoach));
};

export function ensureOpeningTeamHeadCoach<T extends StaffTeam>(
  team: T,
  currentYear: number,
  directoryCoaches: StaffMember[] = [],
): OpeningHeadCoachRepair<T> {
  const existingHeadCoach = resolveActiveHeadCoach(team, currentYear);
  if (existingHeadCoach) return { team, headCoach: existingHeadCoach, changed: false };
  const members = team.tycoon?.staffMembers ?? [];
  const firedRoles = new Set(
    ((team.tycoon as { firedStaffRoles?: string[] } | undefined)?.firedStaffRoles ?? [])
      .map(canonicalStaffSlotRole),
  );
  if (firedRoles.has('Head Coach')) return { team, changed: false };

  const directoryHeadCoach = directoryCoaches.find(member => isDirectoryHeadCoachForTeam(member, team));
  const dormantHeadIndex = members.findIndex(member => (
    baseStaffContractRole(member.role ?? member.position ?? member.jobTitle) === 'Head Coach'
  ));
  if (dormantHeadIndex >= 0) {
    const dormant = members[dormantHeadIndex];
    if (!isCanonicalOpeningCoach(dormant, directoryHeadCoach)) return { team, changed: false };
    const activated: StaffMember = {
      ...dormant,
      contractYears: 1,
      ...((dormant as StaffMember & { contractExp?: number }).contractExp != null
        ? { contractExp: Math.max(currentYear, Number((dormant as StaffMember & { contractExp?: number }).contractExp) || currentYear) }
        : {}),
    };
    const nextMembers = [...members];
    nextMembers[dormantHeadIndex] = activated;
    return {
      team: {
        ...team,
        tycoon: {
          ...(team.tycoon ?? {}),
          staffMembers: nextMembers,
        },
      },
      headCoach: activated,
      changed: true,
    };
  }

  if (!directoryHeadCoach) return { team, changed: false };
  const seeded: StaffMember = {
    ...directoryHeadCoach,
    team: getTeamFullName(team),
    role: 'Head Coach',
    position: 'Head Coach',
    jobTitle: 'Head Coach',
    contractYears: Math.max(1, Number(directoryHeadCoach.contractYears) || 1),
  };
  return {
    team: {
      ...team,
      tycoon: {
        ...(team.tycoon ?? {}),
        staffMembers: [...members, seeded],
      },
    },
    headCoach: seeded,
    changed: true,
  };
}

function promoteAssistant(member: StaffMember, teamName: string, currentYear: number): StaffMember {
  const hiredYear = staffTeamHiredYear(member, currentYear);
  const yearsWithTeam = currentStaffYearsWithTeam({ ...member, hiredYear }, currentYear);
  const careerHistory = closePresentCareerRanges(member.career_history ?? member.coaching_career ?? '', currentYear);
  const coachingCareer = closePresentCareerRanges(member.coaching_career ?? member.career_history ?? '', currentYear);
  return {
    ...member,
    team: teamName,
    role: 'Head Coach',
    position: 'Head Coach',
    jobTitle: 'Head Coach',
    roleStartYear: currentYear,
    hiredYear,
    yearsWithTeam,
    isPlaceholder: false,
    career_history: appendStaffCareerRow(careerHistory, currentYear, teamName, 'Head Coach'),
    coaching_career: appendStaffCareerRow(coachingCareer, currentYear, teamName, 'Head Coach'),
  };
}

const playerCoachAge = (player: PlayerCoachCandidate, currentYear: number): number => {
  const age = Number(player.age);
  if (Number.isFinite(age) && age > 0) return age;
  const bornYear = Number(player.born?.year);
  return Number.isFinite(bornYear) && bornYear > 0 ? Math.max(0, currentYear - bornYear) : 0;
};

function buildInterimPlayerCoach(
  team: StaffTeam,
  currentYear: number,
  players: PlayerCoachCandidate[],
): StaffMember | undefined {
  const tid = Number(team.id ?? team.tid ?? -1);
  const player = players
    .filter(candidate => {
      const status = normalizeText(candidate.status);
      return Number(candidate.tid) === tid
        && candidate.retiredYear == null
        && candidate.diedYear == null
        && status !== 'retired'
        && status !== 'prospect'
        && status !== 'draft prospect'
        && status !== 'free agent'
        && !!String(candidate.name ?? '').trim();
    })
    .sort((left, right) => playerCoachAge(right, currentYear) - playerCoachAge(left, currentYear)
      || Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0)
      || normalizeText(left.name).localeCompare(normalizeText(right.name)))[0];
  if (!player) return undefined;
  const sourcePlayerId = String(player.internalId ?? player.id ?? '').trim();
  if (!sourcePlayerId) return undefined;
  const name = String(player.name).trim();
  const attributeSeed = seedForStaff({ name });
  const attributes = attrsForCoach(name, attributeSeed, { role: 'Head Coach' });
  const teamName = getTeamFullName(team);
  return {
    id: `staff-player-coach-${sourcePlayerId}`,
    sourcePlayerId,
    source: 'interim-player-coach',
    name,
    team: teamName,
    role: 'Head Coach',
    position: 'Head Coach',
    jobTitle: 'Head Coach',
    playerPortraitUrl: player.imgURL,
    nationality: player.nationality,
    bornYear: Number(player.born?.year) || undefined,
    contractYears: 1,
    hiredYear: currentYear,
    roleStartYear: currentYear,
    yearsWithTeam: 1,
    coachingYears: 0,
    playingYears: Math.max(1, playerCoachAge(player, currentYear) - 19),
    attributeSeed,
    attributeProfile: 'nba',
    attributes: attributes as unknown as StaffMember['attributes'],
    rating: computeStaffOverall('Head Coach', attributes),
    reputation: computeStaffOverall('Head Coach', attributes),
    isPlaceholder: false,
    career_history: `${currentYear}-Present ${teamName} (Player-Coach)`,
    coaching_career: `${currentYear}-Present ${teamName} (Player-Coach)`,
  };
}

export function reconcileTeamStaffContracts<T extends StaffTeam>(
  team: T,
  currentYear: number,
  options: StaffContractReconciliationOptions = {},
): StaffContractReconciliation<T> {
  const members = team.tycoon?.staffMembers ?? [];
  const teamName = getTeamFullName(team);
  const released: StaffMember[] = [];
  const active: StaffMember[] = [];
  const seenRoles = new Set<string>();
  const seenPeople = new Set<string>();

  for (const member of members) {
    const role = canonicalStaffSlotRole(member.role ?? member.position ?? member.jobTitle);
    const personKey = staffContractIdentityKey(member);
    const duplicate = !role || seenRoles.has(role) || (!!personKey && seenPeople.has(personKey));
    if (!isActiveStaffContract(member, currentYear) || duplicate) {
      if (member.retiredYear == null && member.diedYear == null) {
        released.push(finalizeStaffStint(member, role || 'Staff', teamName, currentYear));
      }
      continue;
    }
    seenRoles.add(role);
    if (personKey) seenPeople.add(personKey);
    active.push(member);
  }

  let promoted: StaffMember | undefined;
  let interimPlayerCoach: StaffMember | undefined;
  const hasHeadCoach = active.some(member => baseStaffContractRole(member.role ?? member.position ?? member.jobTitle) === 'Head Coach');
  if (!hasHeadCoach) {
    const candidates = active
      .map((member, index) => ({ member, index }))
      .filter(({ member }) => baseStaffContractRole(member.role ?? member.position ?? member.jobTitle) === 'Assistant Coach')
      .sort((left, right) => assistantScore(right.member) - assistantScore(left.member)
        || normalizeText(left.member.name).localeCompare(normalizeText(right.member.name)));
    const winner = candidates[0];
    if (winner) {
      active.splice(winner.index, 1);
      promoted = promoteAssistant(winner.member, teamName, currentYear);
      active.push(promoted);
    }
    if (!winner) {
      interimPlayerCoach = buildInterimPlayerCoach(team, currentYear, options.activeRosterPlayers ?? []);
      if (interimPlayerCoach) active.push(interimPlayerCoach);
    }
  }

  const changed = released.length > 0 || !!promoted || !!interimPlayerCoach || active.length !== members.length;
  if (!changed) return { team, released, changed: false };
  return {
    team: {
      ...team,
      tycoon: {
        ...(team.tycoon ?? {}),
        staffMembers: active,
      },
    },
    released,
    promoted,
    interimPlayerCoach,
    changed: true,
  };
}

export function reconcileTeamStaffDeaths<T extends StaffTeam>(
  team: T,
  currentYear: number,
  deaths: readonly DeceasedStaffIdentity[],
  options: StaffContractReconciliationOptions = {},
): StaffContractReconciliation<T> {
  const teamName = normalizeText(getTeamFullName(team));
  const deceased = deaths.filter(death => !death.teamName || normalizeText(death.teamName) === teamName);
  if (deceased.length === 0) return { team, released: [], changed: false };
  const members = team.tycoon?.staffMembers ?? [];
  const survivors = members.filter(member => !deceased.some(death => (
    (!!death.staffId && String(member.id ?? '') === String(death.staffId))
    || normalizeText(member.name) === normalizeText(death.name)
  )));
  if (survivors.length === members.length) return { team, released: [], changed: false };
  return reconcileTeamStaffContracts({
    ...team,
    tycoon: { ...(team.tycoon ?? {}), staffMembers: survivors },
  }, currentYear, options) as StaffContractReconciliation<T>;
}

export function syncStaffDirectoryHeadCoaches(
  staff: StaffData | null | undefined,
  teams: StaffTeam[],
  currentYear: number,
): StaffData | null | undefined {
  if (!staff?.coaches) return staff;
  const replacements = teams
    .filter(hasPersistedStaffRoster)
    .map(team => ({
      team,
      teamName: getTeamFullName(team),
      shortName: String(team.name ?? '').trim(),
      headCoach: resolveActiveHeadCoach(team, currentYear),
    }));
  if (replacements.length === 0) return staff;
  const matchesTeam = (coach: StaffMember, replacement: typeof replacements[number]) => {
    const coachTeam = normalizeText(coach.team);
    return coachTeam === normalizeText(replacement.teamName)
      || (!!replacement.shortName && coachTeam === normalizeText(replacement.shortName));
  };
  const matchesReplacementIdentity = (coach: StaffMember, replacement: typeof replacements[number]) => {
    const replacementKey = staffContractIdentityKey(replacement.headCoach);
    return !!replacementKey && staffContractIdentityKey(coach) === replacementKey;
  };
  const matchesExactStaffId = (coach: StaffMember, replacement: typeof replacements[number]) => {
    const coachIds = [coach.id, coach.sourcePlayerId].map(value => String(value ?? '').trim()).filter(Boolean);
    const replacementIds = [replacement.headCoach?.id, replacement.headCoach?.sourcePlayerId]
      .map(value => String(value ?? '').trim())
      .filter(Boolean);
    return replacementIds.some(id => coachIds.includes(id));
  };
  const coaches = staff.coaches.filter(coach => !replacements.some(replacement => (
    baseStaffContractRole(coach.role ?? coach.position ?? coach.jobTitle) === 'Head Coach'
    && (matchesTeam(coach, replacement) || matchesReplacementIdentity(coach, replacement))
  )));
  for (const replacement of replacements) {
    if (!replacement.headCoach) continue;
    const existing = staff.coaches.find(coach => matchesExactStaffId(coach, replacement))
      ?? staff.coaches.find(coach => matchesReplacementIdentity(coach, replacement))
      ?? staff.coaches.find(coach => (
        matchesTeam(coach, replacement)
        && baseStaffContractRole(coach.role ?? coach.position ?? coach.jobTitle) === 'Head Coach'
      ));
    const sameIdentity = normalizeText(existing?.name) === normalizeText(replacement.headCoach.name);
    coaches.push({
      ...(sameIdentity ? existing : {}),
      ...replacement.headCoach,
      ...(existing?.deathCheckDate !== undefined ? { deathCheckDate: existing.deathCheckDate } : {}),
      ...(existing?.coachAchievements !== undefined ? { coachAchievements: existing.coachAchievements } : {}),
      ...(existing?.awardsSummary !== undefined ? { awardsSummary: existing.awardsSummary } : {}),
      team: replacement.teamName,
      role: 'Head Coach',
      position: 'Head Coach',
      jobTitle: 'Head Coach',
    });
  }
  return { ...staff, coaches };
}
