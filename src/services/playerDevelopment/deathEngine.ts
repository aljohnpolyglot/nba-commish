import type { GameState, NBAPlayer, StaffData, StaffMember } from '../../types';
import { computeAge, normalizeDate } from '../../utils/helpers';
import { zengmUsableTragicDeathReasons } from '../../data/zengmTragicDeaths';

export type DeathEvent = {
  entityType: 'player' | 'staff';
  playerId?: string;
  staffId?: string;
  name: string;
  age: number;
  cause: string;
  deathType: 'natural' | 'tragic';
  diedDate: string;
  diedYear: number;
  wasActive: boolean;
  teamName?: string;
  roleLabel?: string;
};

type DeathToast = NonNullable<GameState['pendingDeathToasts']>[number];

type DeathPassResult = {
  players: NBAPlayer[];
  staff: StaffData | null;
  staffFreeAgents: StaffMember[];
  deaths: DeathEvent[];
  pendingDeathToasts: DeathToast[];
};

const NATURAL_CAUSES = [
  'natural causes',
  'heart failure',
  'stroke complications',
  'cancer complications',
  'pneumonia complications',
  'a long illness',
] as const;

const TRAGIC_STAFF_CAUSES = [
  'a car accident',
  'a house fire',
  'a boating accident',
  'a fall at home',
  'a drowning accident',
  'a sudden medical emergency while traveling',
] as const;

function seededUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function annualCheckDate(id: string, year: number): string {
  const month = Math.floor(seededUnit(`death-month:${id}`) * 12) + 1;
  const dim = daysInMonth(year, month);
  const day = Math.floor(seededUnit(`death-day:${id}`) * dim) + 1;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function nextAnnualCheckDate(id: string, todayIso: string): string {
  const currentYear = Number(todayIso.slice(0, 4));
  const thisYear = annualCheckDate(id, currentYear);
  return thisYear >= todayIso ? thisYear : annualCheckDate(id, currentYear + 1);
}

function nextYearCheckDate(id: string, currentYear: number): string {
  return annualCheckDate(id, currentYear + 1);
}

function retiredNaturalDeathProb(age: number): number {
  if (age >= 105) return 1.0;
  if (age >= 100) return 0.4;
  if (age >= 95) return 0.25;
  if (age >= 90) return 0.18;
  if (age >= 85) return 0.12;
  if (age >= 80) return 0.07;
  if (age >= 75) return 0.04;
  if (age >= 70) return 0.02;
  if (age >= 65) return 0.01;
  if (age >= 60) return 0.003;
  return 0;
}

function tragicPlayerDeathProb(age: number): number {
  if (age < 18) return 0;
  if (age <= 23) return 0.00003;
  if (age <= 30) return 0.00004;
  if (age <= 38) return 0.00005;
  if (age <= 45) return 0.00007;
  return 0.00012;
}

function tragicRetiredDeathProb(age: number): number {
  if (age < 40) return 0.00001;
  if (age < 65) return 0.000015;
  return 0.00002;
}

function staffNaturalDeathProb(age: number): number {
  return retiredNaturalDeathProb(age) * 0.65;
}

function tragicStaffDeathProb(age: number): number {
  if (age < 25) return 0;
  if (age <= 45) return 0.00002;
  if (age <= 60) return 0.00003;
  return 0.00004;
}

function pickCause(seed: string, causes: readonly string[]): string {
  const index = Math.floor(seededUnit(seed) * causes.length) % causes.length;
  return causes[index];
}

function applyPronouns(template: string, person: { name: string }): string {
  return template
    .replaceAll('PLAYER_NAME', person.name)
    .replaceAll('PRONOUN_He', 'He')
    .replaceAll('PRONOUN_he', 'he')
    .replaceAll('PRONOUN_his', 'his')
    .replaceAll('PRONOUN_him', 'him')
    .replaceAll('PRONOUN_himself', 'himself');
}

function maybeProcessPlayerDeath(
  player: NBAPlayer,
  todayIso: string,
  currentYear: number,
  teamNameLookup: Map<number, string>,
): { player: NBAPlayer; death?: DeathEvent; toast?: DeathToast } {
  if ((player as any).diedYear || (player as any).diedDate) return { player };
  if (player.tid === -2) return { player };

  const checkId = player.internalId;
  const scheduled = (player as any).deathCheckDate as string | undefined;
  if (!scheduled) {
    return { player: { ...player, deathCheckDate: nextAnnualCheckDate(checkId, todayIso) } as any };
  }
  if (scheduled > todayIso) return { player };

  const age = computeAge(player, currentYear);
  const isRetired = (player as any).status === 'Retired' || !!player.retiredYear || player.tid === -3;
  const isActive = !isRetired && (player.tid >= 0 || (player as any).status === 'Free Agent');

  const tragicProb = isRetired ? tragicRetiredDeathProb(age) : tragicPlayerDeathProb(age);
  const naturalProb = isRetired ? retiredNaturalDeathProb(age) : 0;
  const tragicRoll = seededUnit(`death-tragic:${checkId}:${todayIso}`);
  const naturalRoll = seededUnit(`death-natural:${checkId}:${todayIso}`);

  let deathType: DeathEvent['deathType'] | null = null;
  let cause = '';
  if (tragicProb > 0 && tragicRoll < tragicProb) {
    deathType = 'tragic';
    cause = applyPronouns(
      pickCause(`death-cause:${checkId}:${todayIso}:tragic`, zengmUsableTragicDeathReasons),
      { name: player.name },
    );
  } else if (naturalProb > 0 && naturalRoll < naturalProb) {
    deathType = 'natural';
    cause = pickCause(`death-cause:${checkId}:${todayIso}:natural`, NATURAL_CAUSES);
  }

  if (!deathType) {
    return { player: { ...player, deathCheckDate: nextYearCheckDate(checkId, currentYear) } as any };
  }

  const teamName = player.tid >= 0 ? teamNameLookup.get(player.tid) : undefined;
  const wasActive = isActive && deathType === 'tragic';
  const death: DeathEvent = {
    entityType: 'player',
    playerId: player.internalId,
    name: player.name,
    age,
    cause,
    deathType,
    diedDate: todayIso,
    diedYear: currentYear,
    wasActive,
    teamName,
    roleLabel: player.pos,
  };

  const updated = {
    ...player,
    diedYear: currentYear,
    diedDate: todayIso,
    deathCause: cause,
    deathType,
    deathCheckDate: undefined,
    farewellTour: undefined,
    ...(isRetired ? {} : {
      tid: -3,
      status: 'Retired' as const,
      retiredYear: player.retiredYear ?? currentYear,
      contract: player.contract,
      playoffEligible: false,
      twoWay: undefined,
      gLeagueAssigned: false,
    }),
  } as any as NBAPlayer;

  const toast = wasActive
    ? {
        entityType: 'player' as const,
        playerName: player.name,
        teamName: teamName ?? 'League',
        roleLabel: player.pos ?? '',
        cause,
        deathType,
      }
    : undefined;

  return { player: updated, death, toast };
}

function maybeProcessStaffDeath(
  member: StaffMember,
  todayIso: string,
  currentYear: number,
): { member?: StaffMember; death?: DeathEvent; toast?: DeathToast } {
  if ((member as any).diedYear || (member as any).diedDate) return { member };

  const checkId = member.id ?? `${member.name}:${member.position ?? member.jobTitle ?? member.role ?? 'staff'}`;
  const scheduled = (member as any).deathCheckDate as string | undefined;
  if (!scheduled) {
    return { member: { ...member, deathCheckDate: nextAnnualCheckDate(checkId, todayIso) } as any };
  }
  if (scheduled > todayIso) return { member };

  const bornYear = Number((member as any).bornYear ?? 0);
  const age = bornYear > 0 ? currentYear - bornYear : 48;
  const tragicProb = tragicStaffDeathProb(age);
  const naturalProb = staffNaturalDeathProb(age);
  const tragicRoll = seededUnit(`staff-death-tragic:${checkId}:${todayIso}`);
  const naturalRoll = seededUnit(`staff-death-natural:${checkId}:${todayIso}`);

  let deathType: DeathEvent['deathType'] | null = null;
  let cause = '';
  if (tragicProb > 0 && tragicRoll < tragicProb) {
    deathType = 'tragic';
    cause = pickCause(`staff-death-cause:${checkId}:${todayIso}:tragic`, TRAGIC_STAFF_CAUSES);
  } else if (naturalProb > 0 && naturalRoll < naturalProb) {
    deathType = 'natural';
    cause = pickCause(`staff-death-cause:${checkId}:${todayIso}:natural`, NATURAL_CAUSES);
  }

  if (!deathType) {
    return { member: { ...member, deathCheckDate: nextYearCheckDate(checkId, currentYear) } as any };
  }

  const teamName = member.team;
  const roleLabel = member.role ?? member.position ?? member.jobTitle ?? 'Staff';
  const death: DeathEvent = {
    entityType: 'staff',
    staffId: member.id,
    name: member.name,
    age,
    cause,
    deathType,
    diedDate: todayIso,
    diedYear: currentYear,
    wasActive: true,
    teamName,
    roleLabel,
  };

  const toast: DeathToast = {
    entityType: 'staff',
    playerName: member.name,
    teamName: teamName ?? 'League Staff',
    roleLabel,
    cause,
    deathType,
  };

  return { death, toast };
}

function processStaffGroup(
  group: StaffMember[] | undefined,
  todayIso: string,
  currentYear: number,
): { members: StaffMember[]; deaths: DeathEvent[]; toasts: DeathToast[] } {
  const members: StaffMember[] = [];
  const deaths: DeathEvent[] = [];
  const toasts: DeathToast[] = [];
  for (const member of group ?? []) {
    const result = maybeProcessStaffDeath(member, todayIso, currentYear);
    if (result.member) members.push(result.member);
    if (result.death) deaths.push(result.death);
    if (result.toast) toasts.push(result.toast);
  }
  return { members, deaths, toasts };
}

export function runDailyDeathPass(state: GameState): DeathPassResult {
  const todayIso = normalizeDate(state.date);
  if (!todayIso) {
    return {
      players: state.players,
      staff: state.staff,
      staffFreeAgents: state.staffFreeAgents ?? [],
      deaths: [],
      pendingDeathToasts: [],
    };
  }

  const currentYear = Number(todayIso.slice(0, 4));
  const teamNameLookup = new Map((state.teams ?? []).map(team => [team.id, team.name]));

  const players: NBAPlayer[] = [];
  const deaths: DeathEvent[] = [];
  const pendingDeathToasts: DeathToast[] = [];

  for (const player of state.players) {
    const result = maybeProcessPlayerDeath(player, todayIso, currentYear, teamNameLookup);
    players.push(result.player);
    if (result.death) deaths.push(result.death);
    if (result.toast) pendingDeathToasts.push(result.toast);
  }

  const staffGroups = state.staff ? {
    owners: processStaffGroup(state.staff.owners, todayIso, currentYear),
    gms: processStaffGroup(state.staff.gms, todayIso, currentYear),
    coaches: processStaffGroup(state.staff.coaches, todayIso, currentYear),
    leagueOffice: processStaffGroup(state.staff.leagueOffice, todayIso, currentYear),
  } : null;

  if (staffGroups) {
    deaths.push(
      ...staffGroups.owners.deaths,
      ...staffGroups.gms.deaths,
      ...staffGroups.coaches.deaths,
      ...staffGroups.leagueOffice.deaths,
    );
    pendingDeathToasts.push(
      ...staffGroups.owners.toasts,
      ...staffGroups.gms.toasts,
      ...staffGroups.coaches.toasts,
      ...staffGroups.leagueOffice.toasts,
    );
  }

  const staffFreeAgentPass = processStaffGroup(state.staffFreeAgents ?? [], todayIso, currentYear);
  deaths.push(...staffFreeAgentPass.deaths);

  return {
    players,
    staff: staffGroups ? {
      owners: staffGroups.owners.members,
      gms: staffGroups.gms.members,
      coaches: staffGroups.coaches.members,
      leagueOffice: staffGroups.leagueOffice.members,
      ...(state.staff?.referees ? { referees: state.staff.referees } : {}),
    } : state.staff,
    staffFreeAgents: staffFreeAgentPass.members,
    deaths,
    pendingDeathToasts,
  };
}
