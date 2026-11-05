import type {
  Email,
  GameState,
  HistoryEntry,
  MediaProjectCastMember,
  MediaProjectInboxAction,
  NBAPlayer,
} from '../types';
import { getSimulationSeed } from './saveIdentity';
import { normalizeDate } from '../utils/helpers';
import { getTeamFullName } from '../utils/teamNames';
import { isOnRoster, resolveAnyTeam } from '../utils/teamLookup';
import { applyImmediateNativeActionEffect } from './nativeActionEffects';

const STARTING_FIVE = {
  projectId: 'netflix-starting-five',
  projectTitle: 'Starting 5',
  studioId: 'netflix',
  studioName: 'Netflix',
  brandLogoUrl: '/brands/netflix.svg',
  formatLabel: 'Season-long documentary series',
  castSize: 5,
} as const;

const DAILY_REQUEST_CHANCE = 0.015;

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function isoDate(value: string): string | null {
  const normalized = normalizeDate(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function isRequestWindow(date: string): boolean {
  const monthDay = date.slice(5);
  return monthDay >= '09-15' && monthDay <= '11-30';
}

export function supportsMediaProjectInbox(state: GameState): boolean {
  const uiMode = state.leagueStats?.uiMode ?? (state.leagueType === 'fictional' ? 'fictional' : 'nba');
  return state.gameMode === 'commissioner'
    && state.leagueType !== 'fictional'
    && uiMode === 'nba'
    && (!state.moddedLeagueBase || state.moddedLeagueBase === 'nba');
}

function hasSeasonProject(state: GameState, season: number): boolean {
  return state.inbox.some(email =>
    email.action?.type === 'media-project'
    && email.action.projectId === STARTING_FIVE.projectId
    && email.action.season === season,
  );
}

export function buildMediaProjectInboxEmail(
  state: GameState,
  date: string,
  roll = stableUnit(`${getSimulationSeed(state)}:media-project:${STARTING_FIVE.projectId}:${normalizeDate(date)}`),
): Email | null {
  const normalized = isoDate(date);
  if (!normalized || !supportsMediaProjectInbox(state) || !isRequestWindow(normalized)) return null;
  const season = Number(normalized.slice(0, 4));
  if (season < 2024 || hasSeasonProject(state, season) || roll >= DAILY_REQUEST_CHANCE) return null;
  return {
    id: `media-project:${STARTING_FIVE.projectId}:${season}`,
    sender: STARTING_FIVE.studioName,
    senderRole: 'Documentary Production',
    organization: STARTING_FIVE.studioName,
    subject: `${STARTING_FIVE.projectTitle}: player access request`,
    body: `Netflix is preparing a new season of Starting 5, following five NBA players through the year on and off the court. We are asking the league to nominate the five players who should lead the series. If the league is interested, respond with your selections and our production team will begin outreach.`,
    read: false,
    replied: false,
    date: normalized,
    teamLogoUrl: STARTING_FIVE.brandLogoUrl,
    action: {
      type: 'media-project',
      ...STARTING_FIVE,
      season,
      status: 'open',
    },
  };
}

export function appendMediaProjectInboxForRange(
  state: GameState,
  startDate: string,
  endDate: string,
): GameState {
  const start = isoDate(startDate);
  const end = isoDate(endDate);
  if (!start || !end || start >= end || !supportsMediaProjectInbox(state)) return state;
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= last) {
    const date = cursor.toISOString().slice(0, 10);
    const email = buildMediaProjectInboxEmail(state, date);
    if (email) return { ...state, inbox: [email, ...state.inbox] };
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return state;
}

export function getMediaProjectPlayerCandidates(state: GameState): NBAPlayer[] {
  return state.players.filter(player =>
    player.tid >= 0
    && player.tid < 100
    && isOnRoster(player)
    && (player.status === 'Active' || !player.status)
    && !(player as NBAPlayer & { retiredYear?: number }).retiredYear
    && !(player as NBAPlayer & { externalLeague?: unknown }).externalLeague,
  );
}

function selectedCast(
  state: GameState,
  action: MediaProjectInboxAction,
  selectedPlayerIds: string[],
): MediaProjectCastMember[] | null {
  const uniqueIds = [...new Set(selectedPlayerIds)];
  if (uniqueIds.length !== action.castSize) return null;
  const eligible = new Map(getMediaProjectPlayerCandidates(state).map(player => [player.internalId, player]));
  const cast = uniqueIds.flatMap(playerId => {
    const player = eligible.get(playerId);
    if (!player) return [];
    const team = resolveAnyTeam(player.tid, state.teams, state.nonNBATeams ?? []);
    if (!team) return [];
    return [{
      playerId: player.internalId,
      playerName: player.name,
      teamId: player.tid,
      teamName: getTeamFullName(team),
    }];
  });
  return cast.length === action.castSize ? cast : null;
}

export function resolveMediaProjectDecision(
  state: GameState,
  emailId: string,
  decision: 'ignore' | 'respond',
  selectedPlayerIds: string[] = [],
): GameState {
  const email = state.inbox.find(candidate => candidate.id === emailId);
  if (!email || email.action?.type !== 'media-project' || email.action.status !== 'open') return state;
  const action = email.action;
  const cast = decision === 'respond' ? selectedCast(state, action, selectedPlayerIds) : [];
  if (!cast) return state;
  const names = cast.map(player => player.playerName);
  const outcome = decision === 'respond'
    ? `Netflix will begin production on ${action.projectTitle} with ${names.join(', ')}.`
    : `The league declined Netflix's ${action.projectTitle} proposal for this season.`;
  const contacts = decision === 'respond'
    ? [
        { id: action.studioId, name: action.studioName, type: 'Media Partner' },
        ...cast.map(player => ({ id: player.playerId, name: player.playerName, type: 'Player' })),
      ]
    : [{ id: action.studioId, name: action.studioName, type: 'Media Partner' }];
  const effect = applyImmediateNativeActionEffect(state, {
    type: decision === 'respond' ? 'MEDIA_PROJECT_RESPOND' : 'MEDIA_PROJECT_IGNORE',
    payload: { contacts, reason: `${action.projectId}:${action.season}` },
  }, outcome);
  const resolution: MediaProjectInboxAction['resolution'] = {
    decision,
    resolvedAt: state.date,
    selectedPlayers: cast,
    outcome,
  };
  const inbox = state.inbox.map(candidate => candidate.id === emailId
    ? {
        ...candidate,
        read: true,
        replied: decision === 'respond',
        action: { ...action, status: 'resolved' as const, resolution },
        thread: [
          ...(candidate.thread ?? [{ sender: candidate.sender, text: candidate.body }]),
          {
            sender: 'Commissioner',
            text: decision === 'respond' ? `RESPOND — ${names.join(', ')}` : 'IGNORE',
          },
        ],
      }
    : candidate);
  const historyEntry: HistoryEntry = {
    text: outcome,
    date: state.date,
    type: 'Media',
    commissioner: true,
    playerIds: cast.map(player => player.playerId),
  };
  return {
    ...state,
    ...effect,
    inbox,
    history: [...state.history, historyEntry],
  };
}
