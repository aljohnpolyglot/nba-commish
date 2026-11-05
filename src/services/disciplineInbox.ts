import type {
  DisciplineInboxAction,
  DisciplineSanctionType,
  Email,
  FightResult,
  GameState,
} from '../types';
import { generatePlayerDisciplineStory } from './playerDisciplineGenerator';
import { getEraAdjustedFineAmount } from './disciplinePolicy';

const recommendation = (severity: 'fine' | 'suspend' | 'warn'): DisciplineSanctionType =>
  severity === 'suspend' ? 'suspension' : severity === 'fine' ? 'fine' : 'warning';

const requiresCommissionerReview = (incident: ReturnType<typeof generatePlayerDisciplineStory>) =>
  Boolean(incident) && (
    incident!.severity === 'suspend'
    || incident!.incidentType !== 'conduct'
    || /official|referee|fan|physical|assault|weapon|gambling|bettor|reckless driving|threat/i.test(incident!.story)
  );

const recommendationText = (action: DisciplineInboxAction) => {
  if (action.recommendedSanction === 'fine_and_suspension') {
    return `$${action.recommendedAmountUSD.toLocaleString()} fine and ${action.recommendedGames}-game suspension`;
  }
  if (action.recommendedSanction === 'suspension') return `${action.recommendedGames}-game suspension`;
  if (action.recommendedSanction === 'fine') return `$${action.recommendedAmountUSD.toLocaleString()} fine`;
  return 'formal warning';
};

const recommendedFineAmount = (
  state: GameState,
  incident: NonNullable<ReturnType<typeof generatePlayerDisciplineStory>>,
) => {
  if (incident.incidentType === 'peds') return 0;
  const baseAmount = incident.incidentType === 'gambling' || incident.incidentType === 'weapon'
    ? 100_000
    : incident.incidentType === 'brawl'
      ? 50_000
      : incident.severity === 'suspend'
        ? 50_000
        : incident.severity === 'fine'
          ? 25_000
          : 15_000;
  return getEraAdjustedFineAmount(state, baseAmount);
};

function getDisciplineOfficer(state: GameState) {
  const member = state.staff?.leagueOffice?.find(person =>
    /basketball operations|discipline|competition/i.test(`${person.jobTitle ?? ''} ${person.role ?? ''}`),
  ) ?? state.staff?.leagueOffice?.[0];
  return {
    name: member?.name ?? 'League Basketball Operations',
    title: member?.jobTitle ?? 'Basketball Operations',
    organization: state.leagueStats.leagueName ?? (state.leagueType === 'fictional' ? 'League Office' : 'NBA League Office'),
    portraitUrl: member?.playerPortraitUrl,
  };
}

export function maybeGenerateDisciplineEmail(
  state: GameState,
  date: string,
  probability: number,
): Email | null {
  if (state.gameMode === 'gm' || Math.random() >= probability) return null;
  if (state.inbox.some(email => email.action?.type === 'discipline-case' && email.action.status === 'open')) return null;
  const incident = generatePlayerDisciplineStory(state.players, state.teams, date, state.endorsedPlayers);
  if (!incident || !requiresCommissionerReview(incident)) return null;
  const officer = getDisciplineOfficer(state);
  const incidentId = `discipline-${date}-${incident.playerId}-${incident.incidentType}`;
  const action: DisciplineInboxAction = {
    type: 'discipline-case',
    incidentId,
    incidentType: incident.incidentType,
    playerIds: [incident.playerId],
    playerNames: [incident.playerName],
    teamIds: [incident.teamId],
    reason: incident.story,
    recommendedSanction: incident.incidentType === 'peds'
      ? 'suspension'
      : incident.severity === 'suspend' && ['brawl', 'weapon', 'gambling'].includes(incident.incidentType)
        ? 'fine_and_suspension'
        : recommendation(incident.severity),
    recommendedAmountUSD: recommendedFineAmount(state, incident),
    recommendedGames: incident.recommendedGames,
    status: 'open',
  };
  return {
    id: incidentId,
    sender: officer.name,
    senderRole: officer.title,
    organization: officer.organization,
    subject: `Discipline Review: ${incident.playerName}`,
    body: `${incident.story}\n\nRecommended action: ${recommendationText(action)}. You may accept or change the sanction.`,
    read: false,
    replied: false,
    playerPortraitUrl: officer.portraitUrl ?? incident.playerPortraitUrl,
    teamLogoUrl: incident.teamLogoUrl,
    date,
    action,
  };
}

export function buildFightDisciplineEmail(state: GameState, fight: FightResult, date: string): Email | null {
  if (state.gameMode === 'gm' || fight.severity === 'scuffle') return null;
  const ids = [fight.player1Id, fight.player2Id];
  const incidentId = `discipline-fight-${date}-${[...ids].sort().join('-')}`;
  if (state.inbox.some(email => email.id === incidentId)) return null;
  const games = fight.severity === 'brawl' ? 5 : 1;
  const fineAmount = getEraAdjustedFineAmount(state, 50_000);
  const officer = getDisciplineOfficer(state);
  return {
    id: incidentId,
    sender: officer.name,
    senderRole: officer.title,
    organization: officer.organization,
    subject: `Incident Report: ${fight.player1Name} vs ${fight.player2Name}`,
    body: `${fight.description}\n\nLeague Operations recommends a ${fineAmount.toLocaleString()} fine and ${games}-game suspension for both players. You may change the sanction before issuing the ruling.`,
    read: false,
    replied: false,
    playerPortraitUrl: officer.portraitUrl,
    date,
    action: {
      type: 'discipline-case',
      incidentId,
      incidentType: 'brawl',
      playerIds: ids,
      playerNames: [fight.player1Name, fight.player2Name],
      teamIds: [fight.player1TeamId, fight.player2TeamId],
      reason: fight.description,
      recommendedSanction: 'fine_and_suspension',
      recommendedAmountUSD: fineAmount,
      recommendedGames: games,
      status: 'open',
    },
  };
}

export function resolveMatchingDisciplineCases(
  inbox: Email[],
  playerIds: string[],
  sanction: DisciplineSanctionType,
  date: string,
  amountUSD?: number,
  games?: number,
): Email[] {
  const targets = new Set(playerIds);
  return inbox.map(email => {
    if (email.action?.type !== 'discipline-case' || email.action.status !== 'open') return email;
    if (!email.action.playerIds.some(playerId => targets.has(playerId))) return email;
    return {
      ...email,
      action: {
        ...email.action,
        status: 'resolved',
        resolution: { sanction, amountUSD, games, resolvedAt: date },
      },
    };
  });
}
