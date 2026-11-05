import type { GameState, NBAPlayer, StaffData, StaffMember } from '../../types';
import { computeAge, normalizeDate } from '../../utils/helpers';
import { zengmUsableTragicDeathReasons } from '../../data/zengmTragicDeaths';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { isSimulationPerfEnabled, recordSimulationPerf } from '../simulation/simulationPerfDebug';

export type DeathEvent = {
  entityType: 'player' | 'staff';
  playerId?: string;
  teamId?: number;
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

type DeathPassProfile = {
  playerPrecheckMs: number;
  playerEligibilityMs: number;
  playerScheduleMs: number;
  playerProbabilityMs: number;
  playerMutationMs: number;
  staffPrecheckMs: number;
  staffScheduleMs: number;
  staffProbabilityMs: number;
  staffMutationMs: number;
  alreadyDeadPlayers: number;
  futureProspects: number;
  eligiblePlayers: number;
  ineligiblePlayers: number;
  initializedPlayerChecks: number;
  futurePlayerChecks: number;
  duePlayerChecks: number;
  playerProbabilityEvaluations: number;
  playerReferenceMutations: number;
  staffScanned: number;
  initializedStaffChecks: number;
  futureStaffChecks: number;
  dueStaffChecks: number;
  staffProbabilityEvaluations: number;
  staffReferenceMutations: number;
};

const deathPerfNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

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

export function isPlayerEligibleForSimulatedDeath(
  player: NBAPlayer,
  branchStartYear?: number,
): boolean {
  const isRetired = player.status === 'Retired' || !!player.retiredYear || player.tid === -3;
  if (!isRetired) return true;
  if (player.sourceRetirement || (player as any)._historySourceOnly) return false;
  const startYear = Number(branchStartYear ?? 0);
  if (!Number.isFinite(startYear) || startYear <= 0) return true;
  const retiredYear = Number(player.retiredYear ?? 0);
  if (Number.isFinite(retiredYear) && retiredYear > 0 && retiredYear < startYear) return false;
  const lastPlayedSeason = Math.max(0, ...(player.stats ?? [])
    .filter(row => !row.playoffs && Number(row.gp ?? 0) > 0)
    .map(row => Number(row.season ?? 0))
    .filter(Number.isFinite));
  return lastPlayedSeason <= 0 || lastPlayedSeason >= startYear;
}

function maybeProcessPlayerDeath(
  player: NBAPlayer,
  todayIso: string,
  currentYear: number,
  resolveTeamName: (teamId: number) => string | undefined,
  tragicDeathRateFactor: number,
  branchStartYear?: number,
  profile?: DeathPassProfile,
): { player: NBAPlayer; death?: DeathEvent; toast?: DeathToast } {
  let leafStart = profile ? deathPerfNow() : 0;
  if ((player as any).diedYear || (player as any).diedDate) {
    if (profile) {
      profile.alreadyDeadPlayers += 1;
      profile.playerPrecheckMs += deathPerfNow() - leafStart;
    }
    return { player };
  }
  if (player.tid === -2) {
    if (profile) {
      profile.futureProspects += 1;
      profile.playerPrecheckMs += deathPerfNow() - leafStart;
    }
    return { player };
  }
  if (profile) {
    profile.playerPrecheckMs += deathPerfNow() - leafStart;
    leafStart = deathPerfNow();
  }
  if (!isPlayerEligibleForSimulatedDeath(player, branchStartYear)) {
    const updated = player.deathCheckDate ? { ...player, deathCheckDate: undefined } : player;
    if (profile) {
      profile.ineligiblePlayers += 1;
      profile.playerEligibilityMs += deathPerfNow() - leafStart;
      if (updated !== player) profile.playerReferenceMutations += 1;
    }
    return { player: updated };
  }
  if (profile) {
    profile.eligiblePlayers += 1;
    profile.playerEligibilityMs += deathPerfNow() - leafStart;
    leafStart = deathPerfNow();
  }

  const checkId = player.internalId;
  const scheduled = (player as any).deathCheckDate as string | undefined;
  if (!scheduled) {
    const updated = { ...player, deathCheckDate: nextAnnualCheckDate(checkId, todayIso) } as any;
    if (profile) {
      profile.initializedPlayerChecks += 1;
      profile.playerReferenceMutations += 1;
      profile.playerScheduleMs += deathPerfNow() - leafStart;
    }
    return { player: updated };
  }
  if (scheduled > todayIso) {
    if (profile) {
      profile.futurePlayerChecks += 1;
      profile.playerScheduleMs += deathPerfNow() - leafStart;
    }
    return { player };
  }
  if (profile) {
    profile.duePlayerChecks += 1;
    profile.playerScheduleMs += deathPerfNow() - leafStart;
    leafStart = deathPerfNow();
  }

  const age = computeAge(player, currentYear);
  const isRetired = (player as any).status === 'Retired' || !!player.retiredYear || player.tid === -3;
  const isActive = !isRetired && (player.tid >= 0 || (player as any).status === 'Free Agent');

  const tragicProb = (isRetired ? tragicRetiredDeathProb(age) : tragicPlayerDeathProb(age)) * tragicDeathRateFactor;
  const naturalProb = isRetired ? retiredNaturalDeathProb(age) : 0;
  const tragicRoll = seededUnit(`death-tragic:${checkId}:${todayIso}`);
  const naturalRoll = seededUnit(`death-natural:${checkId}:${todayIso}`);
  if (profile) {
    profile.playerProbabilityEvaluations += 1;
    profile.playerProbabilityMs += deathPerfNow() - leafStart;
    leafStart = deathPerfNow();
  }

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
    const updated = { ...player, deathCheckDate: nextYearCheckDate(checkId, currentYear) } as any;
    if (profile) {
      profile.playerReferenceMutations += 1;
      profile.playerMutationMs += deathPerfNow() - leafStart;
    }
    return { player: updated };
  }

  if (profile) {
    profile.playerMutationMs += deathPerfNow() - leafStart;
    leafStart = deathPerfNow();
  }
  const teamName = player.tid >= 0 ? resolveTeamName(player.tid) : undefined;
  if (profile) leafStart = deathPerfNow();
  const wasActive = isActive && deathType === 'tragic';
  const death: DeathEvent = {
    entityType: 'player',
    playerId: player.internalId,
    teamId: player.tid >= 0 ? player.tid : undefined,
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

  if (profile) {
    profile.playerReferenceMutations += 1;
    profile.playerMutationMs += deathPerfNow() - leafStart;
  }

  return { player: updated, death, toast };
}

function maybeProcessStaffDeath(
  member: StaffMember,
  todayIso: string,
  currentYear: number,
  tragicDeathRateFactor: number,
  profile?: DeathPassProfile,
): { member?: StaffMember; death?: DeathEvent; toast?: DeathToast } {
  let leafStart = profile ? deathPerfNow() : 0;
  if (profile) profile.staffScanned += 1;
  if ((member as any).diedYear || (member as any).diedDate) {
    if (profile) profile.staffPrecheckMs += deathPerfNow() - leafStart;
    return { member };
  }
  if (profile) {
    profile.staffPrecheckMs += deathPerfNow() - leafStart;
    leafStart = deathPerfNow();
  }

  const checkId = member.id ?? `${member.name}:${member.position ?? member.jobTitle ?? member.role ?? 'staff'}`;
  const scheduled = (member as any).deathCheckDate as string | undefined;
  if (!scheduled) {
    const updated = { ...member, deathCheckDate: nextAnnualCheckDate(checkId, todayIso) } as any;
    if (profile) {
      profile.initializedStaffChecks += 1;
      profile.staffReferenceMutations += 1;
      profile.staffScheduleMs += deathPerfNow() - leafStart;
    }
    return { member: updated };
  }
  if (scheduled > todayIso) {
    if (profile) {
      profile.futureStaffChecks += 1;
      profile.staffScheduleMs += deathPerfNow() - leafStart;
    }
    return { member };
  }
  if (profile) {
    profile.dueStaffChecks += 1;
    profile.staffScheduleMs += deathPerfNow() - leafStart;
    leafStart = deathPerfNow();
  }

  const bornYear = Number((member as any).bornYear ?? 0);
  const age = bornYear > 0 ? currentYear - bornYear : 48;
  const tragicProb = tragicStaffDeathProb(age) * tragicDeathRateFactor;
  const naturalProb = staffNaturalDeathProb(age);
  const tragicRoll = seededUnit(`staff-death-tragic:${checkId}:${todayIso}`);
  const naturalRoll = seededUnit(`staff-death-natural:${checkId}:${todayIso}`);
  if (profile) {
    profile.staffProbabilityEvaluations += 1;
    profile.staffProbabilityMs += deathPerfNow() - leafStart;
    leafStart = deathPerfNow();
  }

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
    const updated = { ...member, deathCheckDate: nextYearCheckDate(checkId, currentYear) } as any;
    if (profile) {
      profile.staffReferenceMutations += 1;
      profile.staffMutationMs += deathPerfNow() - leafStart;
    }
    return { member: updated };
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

  if (profile) {
    profile.staffReferenceMutations += 1;
    profile.staffMutationMs += deathPerfNow() - leafStart;
  }

  return { death, toast };
}

function processStaffGroup(
  group: StaffMember[] | undefined,
  todayIso: string,
  currentYear: number,
  tragicDeathRateFactor: number,
  profile?: DeathPassProfile,
): { members: StaffMember[]; deaths: DeathEvent[]; toasts: DeathToast[] } {
  const members: StaffMember[] = [];
  const deaths: DeathEvent[] = [];
  const toasts: DeathToast[] = [];
  for (const member of group ?? []) {
    const result = maybeProcessStaffDeath(member, todayIso, currentYear, tragicDeathRateFactor, profile);
    if (result.member) members.push(result.member);
    if (result.death) deaths.push(result.death);
    if (result.toast) toasts.push(result.toast);
  }
  return { members, deaths, toasts };
}

export function runDailyDeathPass(state: GameState): DeathPassResult {
  const perfEnabled = isSimulationPerfEnabled();
  const totalStart = perfEnabled ? deathPerfNow() : 0;
  const profile: DeathPassProfile | undefined = perfEnabled ? {
    playerPrecheckMs: 0,
    playerEligibilityMs: 0,
    playerScheduleMs: 0,
    playerProbabilityMs: 0,
    playerMutationMs: 0,
    staffPrecheckMs: 0,
    staffScheduleMs: 0,
    staffProbabilityMs: 0,
    staffMutationMs: 0,
    alreadyDeadPlayers: 0,
    futureProspects: 0,
    eligiblePlayers: 0,
    ineligiblePlayers: 0,
    initializedPlayerChecks: 0,
    futurePlayerChecks: 0,
    duePlayerChecks: 0,
    playerProbabilityEvaluations: 0,
    playerReferenceMutations: 0,
    staffScanned: 0,
    initializedStaffChecks: 0,
    futureStaffChecks: 0,
    dueStaffChecks: 0,
    staffProbabilityEvaluations: 0,
    staffReferenceMutations: 0,
  } : undefined;
  const dateStart = perfEnabled ? deathPerfNow() : 0;
  const todayIso = normalizeDate(state.date);
  const dateNormalizationMs = perfEnabled ? deathPerfNow() - dateStart : 0;
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
  const tragicDeathRateFactor = Math.min(10, Math.max(0, Number(state.leagueStats?.tragicDeathRateFactor ?? 1)));
  const teamLookupStart = perfEnabled ? deathPerfNow() : 0;
  const allTeamIds = [
    ...(state.teams ?? []).map(team => team.id),
    ...(state.nonNBATeams ?? []).map(team => team.tid),
  ];
  let teamNameLookup: Map<number, string> | undefined;
  let teamLookupMs = 0;
  let teamsScanned = 0;
  const resolveTeamName = (teamId: number): string | undefined => {
    if (!teamNameLookup) {
      const lazyLookupStart = perfEnabled ? deathPerfNow() : 0;
      teamNameLookup = new Map(allTeamIds.flatMap(candidateTeamId => {
        const team = resolveAnyTeam(candidateTeamId, state.teams, state.nonNBATeams ?? []);
        return team ? [[candidateTeamId, getTeamFullName(team)] as const] : [];
      }));
      teamsScanned = allTeamIds.length;
      if (perfEnabled) teamLookupMs += deathPerfNow() - lazyLookupStart;
    }
    return teamNameLookup.get(teamId);
  };
  if (perfEnabled) teamLookupMs += deathPerfNow() - teamLookupStart;

  const players: NBAPlayer[] = [];
  const deaths: DeathEvent[] = [];
  const pendingDeathToasts: DeathToast[] = [];

  const playerLoopStart = perfEnabled ? deathPerfNow() : 0;
  let activePlayers = 0;
  let freeAgents = 0;
  let retiredPlayers = 0;
  let sourceOnlyPlayers = 0;
  for (const player of state.players) {
    const retired = player.status === 'Retired' || !!player.retiredYear || player.tid === -3;
    if (retired) retiredPlayers += 1;
    else if (player.status === 'Free Agent' || player.tid < 0) freeAgents += 1;
    else activePlayers += 1;
    if (player.sourceRetirement || (player as any)._historySourceOnly) sourceOnlyPlayers += 1;
    const result = maybeProcessPlayerDeath(
      player,
      todayIso,
      currentYear,
      resolveTeamName,
      tragicDeathRateFactor,
      Number(state.nbaStartYear ?? 0) || undefined,
      profile,
    );
    players.push(result.player);
    if (result.death) deaths.push(result.death);
    if (result.toast) pendingDeathToasts.push(result.toast);
  }
  const playerLoopMs = perfEnabled ? deathPerfNow() - playerLoopStart : 0;

  const staffLoopStart = perfEnabled ? deathPerfNow() : 0;
  const staffGroups = state.staff ? {
    owners: processStaffGroup(state.staff.owners, todayIso, currentYear, tragicDeathRateFactor, profile),
    gms: processStaffGroup(state.staff.gms, todayIso, currentYear, tragicDeathRateFactor, profile),
    coaches: processStaffGroup(state.staff.coaches, todayIso, currentYear, tragicDeathRateFactor, profile),
    leagueOffice: processStaffGroup(state.staff.leagueOffice, todayIso, currentYear, tragicDeathRateFactor, profile),
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

  const staffFreeAgentPass = processStaffGroup(state.staffFreeAgents ?? [], todayIso, currentYear, tragicDeathRateFactor, profile);
  deaths.push(...staffFreeAgentPass.deaths);
  const staffLoopMs = perfEnabled ? deathPerfNow() - staffLoopStart : 0;

  const result = {
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
  if (perfEnabled && profile) {
    const leafMs = profile.playerPrecheckMs + profile.playerEligibilityMs + profile.playerScheduleMs
      + profile.playerProbabilityMs + profile.playerMutationMs + profile.staffPrecheckMs
      + profile.staffScheduleMs + profile.staffProbabilityMs + profile.staffMutationMs;
    recordSimulationPerf({
      engine: 'death-pass-forensics',
      date: todayIso,
      totalMs: deathPerfNow() - totalStart,
      dateNormalizationMs,
      teamLookupMs,
      playerLoopMs,
      staffLoopMs,
      loopOtherMs: Math.max(0, playerLoopMs + staffLoopMs - leafMs),
      ...profile,
      playersScanned: state.players.length,
      activePlayers,
      freeAgents,
      retiredPlayers,
      sourceOnlyPlayers,
      teamsScanned,
      deaths: deaths.length,
      mutations: profile.playerReferenceMutations + profile.staffReferenceMutations,
      noOp: deaths.length === 0 && profile.playerReferenceMutations === 0 && profile.staffReferenceMutations === 0,
    });
  }
  return result;
}
