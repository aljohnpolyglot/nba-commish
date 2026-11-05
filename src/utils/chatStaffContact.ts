import type { GameState, NBATeam, NonNBATeam } from '../types';
import { getStaffImageUrl, resolveStaffImageId } from './staffPortrait';
import { getTeamFullName } from './teamNames';
import { displayStaffRole } from '../services/staff/staffCareerRows';

type StaffContact = {
  id?: string;
  name: string;
  role?: string;
  position?: string;
  jobTitle?: string;
  team?: string;
  playerPortraitUrl?: string;
  staffImageId?: number;
};

export interface ResolvedChatStaffContact {
  staff: StaffContact;
  role: string;
  portraitUrl?: string;
  teamLogoUrl?: string;
  organization?: string;
}

const normalize = (value: unknown): string => String(value ?? '').trim().toLocaleLowerCase();

const clubId = (team: NBATeam | NonNBATeam): number => (
  'tid' in team ? team.tid : team.id
);

const clubLogo = (team: NBATeam | NonNBATeam): string | undefined => (
  'tid' in team ? team.imgURL : team.logoUrl
);

const findNamedTeam = (state: Pick<GameState, 'teams' | 'nonNBATeams'>, label?: string) => {
  const needle = normalize(label);
  if (!needle) return undefined;
  return [...state.teams, ...state.nonNBATeams].find(team => (
    normalize(getTeamFullName(team)) === needle || normalize(team.name) === needle
  ));
};

export function resolveChatStaffContact(
  state: Pick<GameState, 'teams' | 'nonNBATeams' | 'staff'>,
  participant: { id?: string; name?: string } | null | undefined,
): ResolvedChatStaffContact | null {
  if (!participant) return null;
  const id = normalize(participant.id);
  const name = normalize(participant.name);
  for (const team of [...state.teams, ...state.nonNBATeams]) {
    const member = team.tycoon?.staffMembers?.find(staff => (
      (id && normalize(staff.id) === id) || (name && normalize(staff.name) === name)
    ));
    if (!member) continue;
    return {
      staff: member,
      role: displayStaffRole(member.role || member.position || member.jobTitle || 'Staff'),
      portraitUrl: member.playerPortraitUrl ?? getStaffImageUrl(resolveStaffImageId(member)) ?? undefined,
      teamLogoUrl: clubLogo(team),
      organization: getTeamFullName(team),
    };
  }
  const globalStaff = [
    ...(state.staff?.owners ?? []),
    ...(state.staff?.gms ?? []),
    ...(state.staff?.coaches ?? []),
    ...(state.staff?.leagueOffice ?? []),
  ];
  const member = globalStaff.find(staff => (
    (id && normalize(staff.id) === id) || (name && normalize(staff.name) === name)
  ));
  if (!member) return null;
  const team = findNamedTeam(state, member.team);
  return {
    staff: member,
    role: displayStaffRole(member.role || member.position || member.jobTitle || 'Staff'),
    portraitUrl: member.playerPortraitUrl ?? getStaffImageUrl(resolveStaffImageId(member)) ?? undefined,
    teamLogoUrl: member.teamLogoUrl ?? (team ? clubLogo(team) : undefined),
    organization: team ? getTeamFullName(team) : member.team,
  };
}
