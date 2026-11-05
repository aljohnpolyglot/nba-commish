import type { GameState, StaffMember } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveHeadCoachMember } from './coachNameResolver';
import { resolveGeneralManagerForTeam } from './gmAttributes';

export type CoachAchievement = NonNullable<StaffMember['coachAchievements']>[number];

type CoachIdentity = {
  coachId?: string;
  coachName?: string;
};

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const memberMatches = (member: StaffMember, identity: CoachIdentity): boolean => {
  const ids = [member.id, member.sourcePlayerId, member.executiveId]
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  if (identity.coachId) return ids.includes(identity.coachId);
  return !!identity.coachName && normalize(member.name) === normalize(identity.coachName);
};

const achievementKey = (achievement: CoachAchievement): string => [
  achievement.season,
  achievement.type,
  achievement.competitionId ?? '',
].join('|');

const appendToMember = (member: StaffMember, achievement: CoachAchievement): StaffMember => {
  const existing = member.coachAchievements ?? [];
  const key = achievementKey(achievement);
  if (existing.some(row => achievementKey(row) === key)) return member;
  return { ...member, coachAchievements: [...existing, achievement] };
};

export function appendCoachAchievementToTeam<T extends { id?: number; tid?: number; tycoon?: { staffMembers?: StaffMember[] } | null }>(
  team: T,
  identity: CoachIdentity,
  achievement: CoachAchievement,
): T {
  const members = team.tycoon?.staffMembers ?? [];
  let changed = false;
  const staffMembers = members.map(member => {
    if (!memberMatches(member, identity)) return member;
    const next = appendToMember(member, achievement);
    changed ||= next !== member;
    return next;
  });
  return changed ? {
    ...team,
    tycoon: { ...team.tycoon, staffMembers },
  } : team;
}

export function recordCoachAchievement(
  state: GameState,
  args: CoachIdentity & {
    teamId: number;
    season: number;
    type: string;
    label: string;
    league?: string;
    competitionId?: string;
  },
): Pick<GameState, 'teams' | 'nonNBATeams' | 'staff'> {
  const team = [...(state.teams ?? []), ...(state.nonNBATeams ?? [])]
    .find(candidate => Number((candidate as any).id ?? (candidate as any).tid) === args.teamId);
  const resolved = team ? resolveHeadCoachMember(team as any, state.staff) : undefined;
  const identity = {
    coachId: args.coachId ?? resolved?.id ?? resolved?.sourcePlayerId,
    coachName: args.coachName ?? resolved?.name,
  };
  const achievement: CoachAchievement = {
    season: args.season,
    type: args.type,
    label: args.label,
    league: args.league,
    ...(args.competitionId !== undefined ? { competitionId: args.competitionId } : {}),
    teamId: args.teamId,
    teamName: team ? getTeamFullName(team as any) : undefined,
    role: 'Head Coach',
  };
  const teams = (state.teams ?? []).map(candidate => Number(candidate.id) === args.teamId
    ? appendCoachAchievementToTeam(candidate, identity, achievement)
    : candidate);
  const nonNBATeams = (state.nonNBATeams ?? []).map(candidate => Number(candidate.tid) === args.teamId
    ? appendCoachAchievementToTeam(candidate, identity, achievement)
    : candidate);
  const staff = state.staff ? {
    ...state.staff,
    coaches: (state.staff.coaches ?? []).map(member => memberMatches(member, identity)
      ? appendToMember(member, achievement)
      : member),
  } : state.staff;
  return { teams, nonNBATeams, staff };
}

export function recordExecutiveAchievement(
  state: GameState,
  args: {
    executiveId?: string;
    executiveName?: string;
    teamId: number;
    season: number;
    type: string;
    label: string;
    league?: string;
    competitionId?: string;
  },
): Pick<GameState, 'teams' | 'nonNBATeams' | 'staff'> {
  const team = [...(state.teams ?? []), ...(state.nonNBATeams ?? [])]
    .find(candidate => Number((candidate as any).id ?? (candidate as any).tid) === args.teamId);
  const resolved = team ? resolveGeneralManagerForTeam(team as any, state.staff) : null;
  const identity = {
    coachId: args.executiveId ?? resolved?.id ?? resolved?.sourcePlayerId,
    coachName: args.executiveName ?? resolved?.name,
  };
  const achievement: CoachAchievement = {
    season: args.season,
    type: args.type,
    label: args.label,
    league: args.league,
    ...(args.competitionId !== undefined ? { competitionId: args.competitionId } : {}),
    teamId: args.teamId,
    teamName: team ? getTeamFullName(team as any) : undefined,
    role: resolved?.role ?? resolved?.jobTitle ?? resolved?.position ?? 'General Manager',
  };
  const teams = (state.teams ?? []).map(candidate => Number(candidate.id) === args.teamId
    ? appendCoachAchievementToTeam(candidate, identity, achievement)
    : candidate);
  const nonNBATeams = (state.nonNBATeams ?? []).map(candidate => Number(candidate.tid) === args.teamId
    ? appendCoachAchievementToTeam(candidate, identity, achievement)
    : candidate);
  const staff = state.staff ? {
    ...state.staff,
    gms: (state.staff.gms ?? []).map(member => memberMatches(member, identity)
      ? appendToMember(member, achievement)
      : member),
  } : state.staff;
  return { teams, nonNBATeams, staff };
}

export function hydrateWorkerNbaStaffAchievements(
  state: GameState,
): Pick<GameState, 'teams' | 'nonNBATeams' | 'staff'> {
  let working = state;
  const awards = (state.historicalAwards ?? []).filter(award => (
    award.source === 'basketball-data-worker:wikipedia'
    && award.uiMode === 'nba'
    && Number.isFinite(Number(award.tid))
    && Number(award.season) <= Number(state.leagueStats?.year)
  ));
  for (const award of awards) {
    const args = {
      teamId: Number(award.tid),
      season: award.season,
      type: award.type,
      label: `${award.season} ${award.type}`,
      league: 'nba',
    };
    const patch = award.role === 'executive' || award.executiveName
      ? recordExecutiveAchievement(working, {
          ...args,
          executiveName: award.executiveName ?? award.name,
          executiveId: award.executiveId,
        })
      : award.role === 'coach' || award.coachName
        ? recordCoachAchievement(working, {
            ...args,
            coachName: award.coachName ?? award.name,
            coachId: award.coachId,
          })
        : null;
    if (patch) working = { ...working, ...patch };
  }
  return {
    teams: working.teams,
    nonNBATeams: working.nonNBATeams,
    staff: working.staff,
  };
}
