import type { GameState, NBAPlayer } from '../../types';
import type {
  FaceConfig,
  PBAMuse,
  PBAPlayer,
  PBATeam,
} from '../../components/pba/openingCeremony/types';
import { getHistoricalTeamSnapshot, getResolvedTeamLogoUrl, getTeamPrimaryColor } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { getPlayerImage } from '../../utils/playerImage';
import { isOnRoster } from '../../utils/teamLookup';
import { calculateMentorExp } from '../training/mentorScore';
import { resolveHeadCoachName } from '../staff/coachNameResolver';
import {
  getPbaMusePoolForSeason,
  type PbaMuseCandidate,
  type PbaMuseSelection,
} from './musePool';

const PBA_TID_MIN = 2000;
const PBA_TID_MAX = 2100;
const POSITION_LABELS = new Set(['PG', 'SG', 'SF', 'PF', 'C']);

function stablePlayerKey(player: NBAPlayer): string {
  return `${player.name ?? ''}\u0000${player.internalId ?? ''}`;
}

export function selectOpeningCeremonyCaptain(players: readonly NBAPlayer[]): NBAPlayer | undefined {
  return [...players].sort((left, right) => {
    const expDifference = calculateMentorExp(right).exp - calculateMentorExp(left).exp;
    return expDifference || stablePlayerKey(left).localeCompare(stablePlayerKey(right));
  })[0];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) ?? 'PBA')
    .toUpperCase();
}

function position(player: NBAPlayer): PBAPlayer['position'] {
  const label = String(player.pos ?? 'G').toUpperCase();
  if (POSITION_LABELS.has(label)) return label as PBAPlayer['position'];
  if (label.includes('C')) return 'C';
  if (label.includes('F')) return 'SF';
  return 'PG';
}

function rosterPlayer(player: NBAPlayer, captainId?: string): PBAPlayer {
  return {
    id: player.internalId,
    name: player.name,
    jerseyNumber: String(player.jerseyNumber ?? ''),
    position: position(player),
    isCaptain: player.internalId === captainId,
    portraitUrl: getPlayerImage(player),
    face: player.face as FaceConfig | undefined,
    initials: initials(player.name),
    college: player.college,
  };
}

function museForTeam(candidate: PbaMuseCandidate | undefined, teamName: string, primaryColor: string, secondaryColor: string): PBAMuse | undefined {
  if (!candidate) return undefined;
  return {
    id: candidate.id,
    name: candidate.name,
    title: candidate.occupation ?? 'Team Muse',
    portraitUrl: candidate.imageUrl,
    sashText: teamName,
    dressColor: primaryColor,
    accentColor: secondaryColor,
  };
}

function isSeniorPbaPlayer(player: NBAPlayer, tid: number): boolean {
  const row = player as NBAPlayer & { rosterBucket?: string };
  return player.tid === tid
    && row.rosterBucket !== 'academy'
    && isOnRoster(player);
}

function candidateAssignments(
  teamIds: readonly number[],
  candidates: readonly PbaMuseCandidate[],
  selections: readonly PbaMuseSelection[],
  season: number,
): Map<number, PbaMuseCandidate> {
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const assigned = new Map<number, PbaMuseCandidate>();
  const used = new Set<string>();

  for (const selection of selections) {
    if (selection.season !== season || selection.teamId == null || !teamIds.includes(selection.teamId)) continue;
    const candidate = byId.get(selection.museId);
    if (!candidate) continue;
    assigned.set(selection.teamId, candidate);
    used.add(candidate.id);
  }

  const available = candidates.filter(candidate => !used.has(candidate.id));
  let nextCandidate = 0;
  for (const teamId of teamIds) {
    if (assigned.has(teamId) || available.length === 0) continue;
    assigned.set(teamId, available[nextCandidate % available.length]);
    nextCandidate += 1;
  }
  return assigned;
}

export async function buildPbaOpeningCeremonyTeams(state: GameState): Promise<PBATeam[]> {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return [];
  const season = Number(state.leagueStats?.year ?? new Date().getFullYear());
  const liveTeams = (state.nonNBATeams ?? [])
    .filter(team => team.league === 'PBA' || (team.tid >= PBA_TID_MIN && team.tid < PBA_TID_MAX))
    .sort((left, right) => left.tid - right.tid);
  const candidates = await getPbaMusePoolForSeason(season).catch(() => [] as PbaMuseCandidate[]);
  const assignments = candidateAssignments(
    liveTeams.map(team => team.tid),
    candidates,
    state.pbaMuseSelections ?? [],
    season,
  );

  return liveTeams.map(team => {
    const snapshot = getHistoricalTeamSnapshot(team, season);
    const players = state.players.filter(player => isSeniorPbaPlayer(player, team.tid));
    const captain = selectOpeningCeremonyCaptain(players);
    const primaryColor = getTeamPrimaryColor(snapshot);
    const secondaryColor = snapshot.colors?.[1] ?? primaryColor;
    const teamName = getTeamFullName(snapshot);
    const paradePlayers = captain
      ? [captain, ...players.filter(player => player.internalId !== captain.internalId)]
      : players;
    return {
      id: String(team.tid),
      name: teamName,
      shortName: snapshot.abbrev || teamName,
      nickname: snapshot.name || teamName,
      primaryColor,
      secondaryColor,
      accentColor: snapshot.colors?.[2] ?? secondaryColor,
      logoUrl: getResolvedTeamLogoUrl(snapshot, season),
      championships: 0,
      governor: '',
      headCoach: resolveHeadCoachName(snapshot, state.staff, season),
      muse: museForTeam(assignments.get(team.tid), snapshot.abbrev || teamName, primaryColor, secondaryColor),
      players: paradePlayers.map(player => rosterPlayer(player, captain?.internalId)),
      chant: `Let's go ${snapshot.abbrev || snapshot.name || 'PBA'}!`,
      introDescription: `${teamName} takes the floor.`,
    };
  });
}
