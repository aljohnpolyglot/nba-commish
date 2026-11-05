import type { GameState, NBATeam, NonNBATeam, StaffMember } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { getStaffImageUrl, resolveStaffImageId } from '../../utils/staffPortrait';
import { buildHistoricalStaffCandidatesForTeam } from './historicalNbaCoaches';
import { displayStaffRole } from './staffCareerRows';

export interface HistoricalChatContact {
  id: string;
  name: string;
  role: string;
  org: string;
  league: 'Owner' | 'Coach' | 'Staff';
  avatarUrl?: string;
  teamLogoUrl?: string;
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type ChatTeam = NBATeam | NonNBATeam;

function chatTeamId(team: ChatTeam): number {
  return Number('id' in team ? team.id : team.tid);
}

function chatTeamLogo(team: ChatTeam): string | undefined {
  return (team as any).logoUrl ?? (team as any).imgURL ?? (team as any).imgURLSmall;
}

function teamKeys(team: ChatTeam): string[] {
  return [getTeamFullName(team), team.name, team.region, team.abbrev]
    .map(normalize)
    .filter(Boolean);
}

function matchesTeam(member: StaffMember, team: ChatTeam): boolean {
  const values = [member.team, member.position, member.jobTitle]
    .map(normalize)
    .filter(Boolean);
  return values.some(value => teamKeys(team).some(key => value === key || value.includes(key) || key.includes(value)));
}

function isHeadCoach(member: StaffMember): boolean {
  const role = normalize(member.role ?? member.jobTitle ?? member.position);
  return role === 'head coach' || role === 'interim head coach';
}

function isCutoffSafeHistoricalOwner(member: StaffMember): boolean {
  const source = normalize(member.source);
  return source.startsWith('historical') || source.includes('branch');
}

function contactId(kind: 'owner' | 'coach', team: ChatTeam, name: string): string {
  return `${kind}:${chatTeamId(team)}:${normalize(name).replace(/\s+/g, '-')}`;
}

function ownerForTeam(state: GameState, team: ChatTeam, isHistorical: boolean): HistoricalChatContact {
  const profile = 'ownerProfile' in team ? team.ownerProfile : undefined;
  const savedOwner = state.staff?.owners?.find(member => matchesTeam(member, team));
  const usableSavedOwner = savedOwner && (!isHistorical || isCutoffSafeHistoricalOwner(savedOwner))
    ? savedOwner
    : undefined;
  const teamName = getTeamFullName(team);
  const name = profile?.name || usableSavedOwner?.name || `${teamName} Ownership Group`;
  return {
    id: contactId('owner', team, name),
    name,
    role: `Owner • ${teamName}`,
    org: teamName,
    league: 'Owner',
    avatarUrl: (profile as any)?.playerPortraitUrl
      ?? (profile ? getStaffImageUrl(resolveStaffImageId(profile)) : undefined)
      ?? usableSavedOwner?.playerPortraitUrl,
    teamLogoUrl: chatTeamLogo(team),
  };
}

function coachForTeam(state: GameState, team: ChatTeam, year: number, isHistorical: boolean): HistoricalChatContact | null {
  const teamCoach = (team.tycoon?.staffMembers ?? []).find(member => isHeadCoach(member) && member.name);
  const savedCoach = state.staff?.coaches?.find(member => isHeadCoach(member) && matchesTeam(member, team));
  const historicalCoach = isHistorical && 'id' in team
    ? buildHistoricalStaffCandidatesForTeam(team, year).find(member => member.role === 'Head Coach')
    : undefined;
  const coach = teamCoach ?? historicalCoach ?? savedCoach;
  if (!coach?.name) return null;
  const teamName = getTeamFullName(team);
  return {
    id: (coach as StaffMember).id ?? contactId('coach', team, coach.name),
    name: coach.name,
    role: `Coach • ${teamName}`,
    org: teamName,
    league: 'Coach',
    avatarUrl: (coach as StaffMember).playerPortraitUrl ?? ('image' in coach ? coach.image : undefined),
    teamLogoUrl: chatTeamLogo(team),
  };
}

function staffForTeam(team: ChatTeam): HistoricalChatContact[] {
  const teamName = getTeamFullName(team);
  return (team.tycoon?.staffMembers ?? [])
    .filter(member => member.name && !isHeadCoach(member))
    .map(member => {
      const role = member.role || member.position || member.jobTitle || 'Staff';
      return {
        id: member.id || `staff:${chatTeamId(team)}:${normalize(member.name).replace(/\s+/g, '-')}`,
        name: member.name,
        role: `${displayStaffRole(role)} • ${teamName}`,
        org: teamName,
        league: 'Staff' as const,
        avatarUrl: member.playerPortraitUrl ?? getStaffImageUrl(resolveStaffImageId(member)) ?? undefined,
        teamLogoUrl: chatTeamLogo(team),
      };
    });
}

export function buildOwnerCoachChatContacts(state: GameState): HistoricalChatContact[] {
  const isHistorical = state.leagueType === 'modded'
    && (state.moddedLeagueBase === 'nba' || (state.leagueStats as any)?.moddedLeagueBase === 'nba');
  const teams = state.gameMode === 'gm'
    ? [...state.teams, ...state.nonNBATeams].filter(team => chatTeamId(team) === state.userTeamId)
    : state.teams;
  const year = state.leagueStats?.year ?? new Date().getFullYear();
  return teams.flatMap(team => {
    const coach = coachForTeam(state, team, year, isHistorical);
    const primary = coach ? [ownerForTeam(state, team, isHistorical), coach] : [ownerForTeam(state, team, isHistorical)];
    return state.gameMode === 'gm' ? [...primary, ...staffForTeam(team)] : primary;
  });
}
