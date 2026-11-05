import type {
  DeathMemorialInboxAction,
  Email,
  GameState,
  HistoryEntry,
  NBAPlayer,
  OffseasonChecklist,
} from '../../types';
import { resolvePool } from '../awards/pool';
import type { UIMode } from '../awards/types';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { normalizeDate } from '../../utils/helpers';
import { applyImmediateNativeActionEffect } from '../nativeActionEffects';
import { defaultOffseasonChecklist } from '../offseason/offseasonChecklistState';
import { careerWinShares } from './hofChecker';
import type { DeathEvent } from './deathEngine';

type MemorialDecision = 'ignore' | 'honor';

type TeamCareer = {
  tid: number;
  seasons: Set<number>;
  games: number;
};

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

export function getDeathMemorialDecisionDueDate(date: string): string {
  const iso = normalizeDate(date);
  const due = new Date(`${iso}T00:00:00.000Z`);
  due.setUTCDate(due.getUTCDate() + 2);
  return due.toISOString().slice(0, 10);
}

function activeMode(state: GameState): UIMode {
  return (state.leagueStats.uiMode ?? (state.leagueType === 'fictional' ? 'fictional' : 'nba')) as UIMode;
}

function supportsMemorialInbox(state: GameState): boolean {
  const mode = activeMode(state);
  return mode === 'nba' || mode === 'fictional';
}

function activeTeamIds(state: GameState): Set<number> {
  return resolvePool('all-active', {
    teams: state.teams,
    nonNBATeams: state.nonNBATeams ?? [],
    uiMode: activeMode(state),
  });
}

function careerByTeam(player: NBAPlayer, eligibleTeamIds: ReadonlySet<number>): TeamCareer[] {
  const careers = new Map<number, TeamCareer>();
  for (const row of player.stats ?? []) {
    if (row.playoffs || Number(row.gp ?? 0) <= 0) continue;
    const tid = Number(row.tid);
    if (!eligibleTeamIds.has(tid)) continue;
    const current = careers.get(tid) ?? { tid, seasons: new Set<number>(), games: 0 };
    if (Number.isFinite(Number(row.season))) current.seasons.add(Number(row.season));
    current.games += Number(row.gp ?? 0);
    careers.set(tid, current);
  }
  return [...careers.values()].sort((left, right) =>
    right.seasons.size - left.seasons.size || right.games - left.games || left.tid - right.tid,
  );
}

function leagueSeasons(careers: TeamCareer[]): number {
  const seasons = new Set<number>();
  for (const career of careers) for (const season of career.seasons) seasons.add(season);
  return seasons.size;
}

function allStarsForTeam(player: NBAPlayer, career: TeamCareer | undefined): number {
  if (!career) return 0;
  return (player.awards ?? []).filter(award =>
    award.type === 'All-Star' && career.seasons.has(Number(award.season)),
  ).length;
}

function isTeamLegend(
  player: NBAPlayer,
  career: TeamCareer | undefined,
  scopedWinShares: number,
  threshold: number,
): boolean {
  if (!career) return false;
  if (player.hof) return true;
  if (career.seasons.size >= 8) return true;
  if (career.seasons.size < 5) return false;
  return scopedWinShares >= threshold * 0.7 || allStarsForTeam(player, career) >= 2;
}

function teamPresentation(state: GameState, tid: number | undefined) {
  if (tid == null) return { name: undefined, logo: undefined };
  const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
  return team
    ? { name: getTeamFullName(team), logo: team.logoUrl }
    : { name: undefined, logo: undefined };
}

function deathEmailBody(
  event: DeathEvent,
  years: number,
  primaryTeamName: string | undefined,
  scope: DeathMemorialInboxAction['scope'],
): string {
  const career = years > 0
    ? `${event.name} played ${years} season${years === 1 ? '' : 's'} in the league${primaryTeamName ? ` and is most closely associated with the ${primaryTeamName}` : ''}.`
    : `${event.name} was part of the league${primaryTeamName ? ` and is remembered most closely by the ${primaryTeamName}` : ''}.`;
  const cause = event.cause.startsWith(event.name)
    ? event.cause
    : `The recorded cause of death was ${event.cause}.`;
  const decision = scope === 'team'
    ? 'The club can honor this legacy with a moment of silence at its next home game, or take no formal action.'
    : 'The league can arrange a formal tribute, or take no formal action.';
  const variants = [
    `We are saddened to report that ${event.name} has died at age ${event.age}. ${career} ${cause} ${decision}`,
    `The league has learned of the death of ${event.name} at age ${event.age}. ${career} ${cause} ${decision}`,
    `${event.name} has passed away at age ${event.age}. ${career} ${cause} ${decision}`,
  ];
  return variants[stableIndex(`${event.playerId}:${event.diedDate}`, variants.length)];
}

export function buildDeathMemorialInboxPatch(
  state: GameState,
  deaths: DeathEvent[],
  wsThreshold: number,
): Partial<GameState> {
  if (!supportsMemorialInbox(state)) return {};
  const eligibleTeamIds = activeTeamIds(state);
  const existingIds = new Set(state.inbox.map(email => email.id));
  const additions: Email[] = [];
  for (const event of deaths) {
    if (event.entityType !== 'player' || !event.playerId) continue;
    const player = state.players.find(candidate => candidate.internalId === event.playerId);
    if (!player) continue;
    const careers = careerByTeam(player, eligibleTeamIds);
    const eventTeamInScope = event.teamId != null && eligibleTeamIds.has(event.teamId);
    if (!eventTeamInScope && careers.length === 0) continue;
    const primaryCareer = careers[0] ?? (eventTeamInScope
      ? { tid: event.teamId!, seasons: new Set<number>(), games: 0 }
      : undefined);
    const scopedWinShares = careerWinShares(player, eligibleTeamIds);
    const primary = teamPresentation(state, primaryCareer?.tid);
    const isCommissionerCase = state.gameMode !== 'gm'
      && ((event.wasActive && event.deathType === 'tragic') || player.hof || scopedWinShares >= wsThreshold);
    const userCareer = careers.find(career => career.tid === state.userTeamId);
    const isGmCase = state.gameMode === 'gm'
      && state.userTeamId != null
      && (
        (event.wasActive && event.teamId === state.userTeamId)
        || (primaryCareer?.tid === state.userTeamId && isTeamLegend(player, userCareer, scopedWinShares, wsThreshold))
      );
    if (!isCommissionerCase && !isGmCase) continue;
    const scope: DeathMemorialInboxAction['scope'] = isGmCase ? 'team' : 'league';
    const decisionDueDate = getDeathMemorialDecisionDueDate(event.diedDate);
    const emailId = `death-memorial:${event.playerId}:${event.diedDate}:${scope}:${state.userTeamId ?? 'league'}`;
    if (existingIds.has(emailId)) continue;
    existingIds.add(emailId);
    const years = leagueSeasons(careers);
    const honoringTeamId = isGmCase ? state.userTeamId : primaryCareer?.tid;
    additions.push({
      id: emailId,
      sender: isGmCase ? 'Club Office' : 'League Office',
      senderRole: isGmCase ? 'Team Operations' : 'League Operations',
      organization: isGmCase ? primary.name : 'League Office',
      subject: event.deathType === 'tragic'
        ? `Urgent: ${event.name} has passed away`
        : `Remembering ${event.name}`,
      body: `${deathEmailBody(event, years, primary.name, scope)} Please respond by ${decisionDueDate}. If no decision is recorded, ${isGmCase ? 'Club Operations' : 'the Assistant Commissioner'} will handle it on your behalf.`,
      read: false,
      replied: false,
      date: state.date,
      playerPortraitUrl: player.imgURL,
      teamLogoUrl: primary.logo,
      action: {
        type: 'death-memorial',
        playerId: player.internalId,
        playerName: player.name,
        age: event.age,
        cause: event.cause,
        deathType: event.deathType,
        diedDate: event.diedDate,
        decisionDueDate,
        yearsInLeague: years,
        careerWinShares: scopedWinShares,
        primaryTeamId: primaryCareer?.tid,
        primaryTeamName: primary.name,
        honoringTeamId,
        scope,
        status: 'open',
      },
    });
  }
  if (additions.length === 0) return {};
  const inbox = [...additions, ...state.inbox];
  return {
    inbox,
    ...(state.offseasonChecklist
      ? { offseasonChecklist: withDeathMemorialTask(state.offseasonChecklist, inbox) }
      : {}),
  };
}

export function withDeathMemorialTask(
  checklist: OffseasonChecklist | undefined,
  inbox: Email[],
): OffseasonChecklist {
  const base = checklist ?? defaultOffseasonChecklist();
  const hasOpenCase = inbox.some(email =>
    email.action?.type === 'death-memorial' && email.action.status === 'open',
  );
  const current = base.memorialDecisions;
  const next = hasOpenCase
    ? current === 'in-progress' ? 'in-progress' : 'pending'
    : current === 'pending' || current === 'in-progress' ? 'done' : current;
  return next === current ? base : { ...base, memorialDecisions: next };
}

function nextHomeGame(state: GameState, teamId: number | undefined) {
  if (teamId == null) return undefined;
  const today = normalizeDate(state.date);
  return [...state.schedule]
    .filter(game => !game.played && game.homeTid === teamId && normalizeDate(game.date) >= today)
    .sort((left, right) => normalizeDate(left.date).localeCompare(normalizeDate(right.date)))[0];
}

export function resolveDeathMemorialDecision(
  state: GameState,
  emailId: string,
  decision: MemorialDecision,
  decidedBy: 'user' | 'assistant' = 'user',
): GameState {
  const email = state.inbox.find(candidate => candidate.id === emailId);
  if (!email || email.action?.type !== 'death-memorial' || email.action.status !== 'open') return state;
  const memorial = email.action;
  const homeGame = decision === 'honor' ? nextHomeGame(state, memorial.honoringTeamId) : undefined;
  const isGm = memorial.scope === 'team';
  const outcome = decision === 'honor'
    ? homeGame
      ? isGm
        ? `You chose to honor ${memorial.playerName} with a moment of silence at your next home game.`
        : `The league will honor ${memorial.playerName} with a formal tribute at the ${memorial.primaryTeamName ?? 'organization'}'s next home game.`
      : `You chose to honor ${memorial.playerName} with a formal tribute when the league next gathers.`
    : isGm
      ? `The club will take no formal action in memory of ${memorial.playerName}.`
      : `The league will hold no formal tribute for ${memorial.playerName}.`;
  const contacts = isGm ? [] : [
    {
      id: `family:${state.players.find(player => player.internalId === memorial.playerId)?.familyId ?? memorial.playerId}`,
      name: `${memorial.playerName}'s family`,
      type: 'Family',
    },
    ...(memorial.primaryTeamId == null ? [] : [{
      id: String(memorial.primaryTeamId),
      name: memorial.primaryTeamName ?? 'Former Team',
      type: 'Team',
    }]),
  ];
  const effect = applyImmediateNativeActionEffect(state, {
    type: decision === 'honor' ? 'MEMORIAL_HONOR' : 'MEMORIAL_IGNORE',
    payload: { contacts, reason: memorial.playerId },
  }, outcome);
  const resolution: DeathMemorialInboxAction['resolution'] = {
    decision,
    resolvedAt: state.date,
    ...(decision === 'honor' ? { honorType: isGm ? 'moment_of_silence' : 'formal_tribute' } : {}),
    ...(homeGame ? { scheduledGameId: homeGame.gid } : {}),
    outcome,
  };
  const resolvedInbox = state.inbox.map(candidate => candidate.id === emailId
    ? {
        ...candidate,
        read: true,
        replied: true,
        action: { ...memorial, status: 'resolved' as const, resolution },
        thread: [
          ...(candidate.thread ?? [{ sender: candidate.sender, text: candidate.body }]),
          {
            sender: decidedBy === 'assistant'
              ? isGm ? 'Club Operations' : 'Assistant Commissioner'
              : isGm ? 'General Manager' : 'Commissioner',
            text: decision === 'honor' ? 'HONOR' : 'IGNORE',
          },
        ],
      }
    : candidate);
  const followUpId = `death-memorial-follow-up:${memorial.playerId}:${memorial.diedDate}:${memorial.scope}`;
  const followUp: Email = {
    id: followUpId,
    sender: isGm ? 'Club Operations' : 'Assistant Commissioner',
    senderRole: isGm ? 'Team Operations' : 'League Office',
    organization: isGm ? memorial.primaryTeamName : 'League Office',
    subject: `Memorial decision completed for ${memorial.playerName}`,
    body: `We already handled this task for you while the calendar advanced. ${outcome}`,
    read: false,
    replied: false,
    date: state.date,
  };
  const inbox = decidedBy === 'assistant' && !resolvedInbox.some(candidate => candidate.id === followUpId)
    ? [followUp, ...resolvedInbox]
    : resolvedInbox;
  const eventId = `memorial-tribute:${memorial.playerId}:${homeGame?.gid ?? memorial.diedDate}`;
  const scheduledEvents = decision === 'honor' && homeGame
    ? [
        ...(state.scheduledEvents ?? []).filter(event => event.payload?.id !== eventId),
        {
          type: 'NATIVE_LEAGUE_ANNOUNCEMENT',
          date: homeGame.date,
          payload: {
            id: eventId,
            kind: 'memorial_tribute',
            playerId: memorial.playerId,
            playerName: memorial.playerName,
            teamName: memorial.primaryTeamName,
            honorType: isGm ? 'moment_of_silence' : 'formal_tribute',
            gameId: homeGame.gid,
          },
        },
      ]
    : state.scheduledEvents ?? [];
  const historyEntry: HistoryEntry = {
    text: outcome,
    date: state.date,
    type: 'Memorial',
    tid: memorial.honoringTeamId,
    playerIds: [memorial.playerId],
    commissioner: !isGm,
  };
  return {
    ...state,
    ...effect,
    inbox,
    offseasonChecklist: withDeathMemorialTask(state.offseasonChecklist, inbox),
    scheduledEvents,
    history: [...state.history, historyEntry],
  };
}

export function autoResolveDueDeathMemorials(state: GameState): GameState {
  const today = normalizeDate(state.date);
  const dueIds = state.inbox
    .filter(email => email.action?.type === 'death-memorial'
      && email.action.status === 'open'
      && (email.action.decisionDueDate || getDeathMemorialDecisionDueDate(email.action.diedDate)) <= today)
    .map(email => email.id);
  return dueIds.reduce(
    (current, emailId) => resolveDeathMemorialDecision(current, emailId, 'honor', 'assistant'),
    state,
  );
}
