import { EXTERNAL_MENS_LEAGUE_STATUSES } from '../../constants';
import { STATIC_NBA_TEAMS } from '../../data/staticNbaTeams';
import type { GameState, HistoryEntry, NBAPlayer } from '../../types';
import { computeAge } from '../../utils/helpers';
import { getTeamFullName } from '../../utils/teamNames';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../utils/uiMode';
import {
  calculateInternationalDraftValue,
  projectInternationalDraftSelection,
  shouldDeclareForInternationalDraft,
} from '../draft/internationalDraftValue';
import { materializeGeneratedEuroYouthRatings } from './prospectRatings';
import type { EuroAcademyPlayer, EuroNbaDraftDecision, EuroNbaDraftOutcome } from './types';

const externalStatuses = new Set<string>(EXTERNAL_MENS_LEAGUE_STATUSES);

const sourceDraftClass = (player: NBAPlayer, season: number): boolean =>
  Number(player.draft?.year ?? 0) === season
  && player.euroGeneratedYouth !== true
  && (!!player.preDraftClub || !!player.historicalDraftProspectSource);

const sourceDraftSlot = (player: NBAPlayer, season: number): { round: number; pick: number } | null => {
  if (!sourceDraftClass(player, season)) return null;
  const round = Number(player.draft?.round ?? 0);
  const pick = Number(player.draft?.pick ?? 0);
  return round > 0 && pick > 0 ? { round, pick } : null;
};

const candidateAgeEligible = (player: NBAPlayer, season: number): boolean => {
  const age = computeAge(player, season);
  return age >= 19 && age <= 22;
};

const nbaDestination = (index?: number) =>
  typeof index === 'number' ? STATIC_NBA_TEAMS[index]?.abbrev : undefined;

const declareExternalPlayer = (
  player: NBAPlayer,
  draftYear: number,
  team: GameState['nonNBATeams'][number] | undefined,
  sourceClass: boolean,
): NBAPlayer => {
  const projection = projectInternationalDraftSelection(player, draftYear);
  const preDraftClub = {
    ...(player.preDraftClub ?? {
      name: team ? getTeamFullName(team) : `Club ${player.tid}`,
      tid: player.tid,
      logoUrl: team?.imgURL,
      colors: team?.colors,
      competitionId: team?.league,
      season: draftYear,
    }),
    rosterBucket: 'senior' as const,
    draftSelection: sourceClass ? undefined : 'projection' as const,
    projectedOverallPick: sourceClass ? undefined : projection.pick,
  };
  const alreadyDeclared = (player.transactions ?? []).some(transaction =>
    transaction.type === 'draftDeclaration' && Number(transaction.season) === draftYear,
  );
  return {
    ...player,
    age: computeAge(player, draftYear),
    tid: -2,
    status: 'Draft Prospect',
    twoWay: undefined,
    nonGuaranteed: false,
    gLeagueAssigned: false,
    contract: undefined,
    contractYears: [],
    preDraftClub,
    draft: {
      ...player.draft,
      year: draftYear,
      tid: -2,
      originalTid: -1,
      round: 0,
      pick: 0,
    },
    transactions: alreadyDeclared
      ? player.transactions
      : [...(player.transactions ?? []), { season: draftYear, tid: -2, type: 'draftDeclaration' }],
  } as NBAPlayer;
};

export function materializeInitialExternalNbaDraftClass(
  players: NBAPlayer[],
  nonNBATeams: GameState['nonNBATeams'],
  draftYear: number,
): NBAPlayer[] {
  const teamsByTid = new Map(nonNBATeams.map(team => [team.tid, team]));
  return players.map(player => {
    const status = String(player.status ?? '');
    const isExternal = externalStatuses.has(status) || player.tid >= 100;
    if (!isExternal || player.tid < 0 || player.historicalEndesaSource) return player;
    if (!sourceDraftClass(player, draftYear)) return player;
    return declareExternalPlayer(player, draftYear, teamsByTid.get(player.tid), true);
  });
}

export function prepareEuroNbaDraftOutcomes(state: GameState): GameState {
  if (!isEuroIsolatedMode(state) || !state.euroScouting) return state;
  const season = state.leagueStats.year - 1;
  if ((state.euroScouting.preparedNbaDraftSeasons ?? []).includes(season)) return state;

  const academyIds = new Set(state.euroScouting.academyPlayers.map(player => player.internalId));
  const roster = [...state.players, ...state.euroScouting.academyPlayers];
  const seen = new Set<string>();
  const outcomes: EuroNbaDraftOutcome[] = [];

  for (const rawPlayer of roster) {
    if (seen.has(rawPlayer.internalId) || rawPlayer.historicalEndesaSource) continue;
    seen.add(rawPlayer.internalId);
    const player = rawPlayer.euroAcademyPlayer
      ? materializeGeneratedEuroYouthRatings(rawPlayer)
      : rawPlayer;
    if (!candidateAgeEligible(player, season)) continue;

    const isSourceClass = sourceDraftClass(player, season);
    const projection = projectInternationalDraftSelection(player, season);
    if (!isSourceClass && !projection.selected && !shouldDeclareForInternationalDraft(player, season)) continue;

    const exactSlot = sourceDraftSlot(player, season);
    const selected = exactSlot !== null || (!isSourceClass && projection.selected);
    const projectedPick = Number(projection.pick ?? 0);
    const round = exactSlot?.round ?? (selected ? (projectedPick <= 30 ? 1 : 2) : 0);
    const pick = exactSlot?.pick ?? (selected ? projectedPick - ((round - 1) * 30) : 0);
    const sourceTeamTid = rawPlayer.euroAcademyPlayer
      ? Number((rawPlayer as EuroAcademyPlayer).academyTeamId)
      : Number(rawPlayer.tid);

    outcomes.push({
      id: `euro-nba-draft:${season}:${player.internalId}`,
      season,
      playerId: player.internalId,
      playerName: player.name,
      sourceTeamTid,
      sourceRosterBucket: academyIds.has(player.internalId) ? 'academy' : 'senior',
      prospectScore: calculateInternationalDraftValue(player, season),
      status: selected ? 'selected' : 'undrafted',
      draftRound: selected ? round : undefined,
      draftPick: selected ? pick : undefined,
      destinationAbbrev: selected
        ? (isSourceClass ? player.draftAbbrev : nbaDestination(projection.destinationIndex))
        : undefined,
      reviewed: false,
      selectionSource: isSourceClass ? 'source' : 'projection',
    });
  }

  return {
    ...state,
    euroScouting: {
      ...state.euroScouting,
      preparedNbaDraftSeasons: [...(state.euroScouting.preparedNbaDraftSeasons ?? []), season],
      nbaDraftOutcomes: [...(state.euroScouting.nbaDraftOutcomes ?? []), ...outcomes],
    },
  };
}

export function prepareEuroNbaDraftDecisions(state: GameState): GameState {
  if (!isEuroIsolatedMode(state) || !state.euroScouting) return state;
  const draftYear = state.leagueStats.year;
  if ((state.euroScouting.preparedNbaDraftDecisionSeasons ?? []).includes(draftYear)) return state;

  const academyIds = new Set(state.euroScouting.academyPlayers.map(player => player.internalId));
  const decisions: EuroNbaDraftDecision[] = [];
  const seen = new Set<string>();
  for (const rawPlayer of [...state.players, ...state.euroScouting.academyPlayers]) {
    if (seen.has(rawPlayer.internalId)) continue;
    seen.add(rawPlayer.internalId);
    const verifiedDraftYear = Number(rawPlayer.historicalEndesaSource?.draftYear ?? 0);
    if (verifiedDraftYear > 0 && verifiedDraftYear !== draftYear) continue;
    const sourceTeamTid = rawPlayer.euroAcademyPlayer
      ? Number((rawPlayer as EuroAcademyPlayer).academyTeamId)
      : Number(rawPlayer.tid);
    if (sourceTeamTid < 0 || !candidateAgeEligible(rawPlayer, draftYear)) continue;
    const player = rawPlayer.euroAcademyPlayer
      ? materializeGeneratedEuroYouthRatings(rawPlayer)
      : rawPlayer;
    if (!shouldDeclareForInternationalDraft(player, draftYear)) continue;
    const selection = projectInternationalDraftSelection(player, draftYear);
    const outlook: EuroNbaDraftDecision['outlook'] = !selection.selected
      ? 'borderline'
      : Number(selection.pick ?? 60) <= 30
        ? 'first-round'
        : 'second-round';
    decisions.push({
      id: `euro-nba-draft-decision:${draftYear}:${player.internalId}`,
      draftYear,
      playerId: player.internalId,
      playerName: player.name,
      sourceTeamTid,
      sourceRosterBucket: academyIds.has(player.internalId) ? 'academy' : 'senior',
      outlook,
      reviewed: false,
    });
  }

  return {
    ...state,
    euroScouting: {
      ...state.euroScouting,
      preparedNbaDraftDecisionSeasons: [...(state.euroScouting.preparedNbaDraftDecisionSeasons ?? []), draftYear],
      nbaDraftDecisions: [
        ...(state.euroScouting.nbaDraftDecisions ?? []).filter(decision => decision.draftYear !== draftYear),
        ...decisions,
      ],
    },
  };
}

export function completeEuroNbaDraftDecisionReview(state: GameState): GameState {
  if (!state.euroScouting) return state;
  const draftYear = state.leagueStats.year;
  return {
    ...state,
    euroScouting: {
      ...state.euroScouting,
      nbaDraftDecisions: (state.euroScouting.nbaDraftDecisions ?? [])
        .map(decision => decision.draftYear === draftYear ? { ...decision, reviewed: true } : decision),
    },
  };
}

export function completeEuroNbaDraftReview(state: GameState): GameState {
  if (!state.euroScouting) return state;
  const season = state.leagueStats.year - 1;
  const current = (state.euroScouting.nbaDraftOutcomes ?? [])
    .filter(outcome => outcome.season === season && !outcome.reviewed);
  if (current.length === 0) return state;

  const selectedIds = new Set(current
    .filter(outcome => outcome.status === 'selected')
    .map(outcome => outcome.playerId));
  const playerById = new Map([
    ...state.players,
    ...state.euroScouting.academyPlayers,
  ].map(player => [player.internalId, player]));
  const departures = current
    .filter(outcome => selectedIds.has(outcome.playerId))
    .map(outcome => playerById.get(outcome.playerId))
    .filter((player): player is NBAPlayer => !!player);
  const historyEntries: HistoryEntry[] = current.map(outcome => ({
    text: outcome.status === 'selected'
      ? `${outcome.playerName} was selected in Round ${outcome.draftRound}, Pick ${outcome.draftPick} of the ${season} NBA Draft.`
      : `${outcome.playerName} went undrafted in the ${season} NBA Draft and remained with his club.`,
    date: state.date,
    type: 'Draft',
    tid: outcome.sourceTeamTid,
    playerIds: [outcome.playerId],
  }));

  return {
    ...state,
    players: state.players.filter(player => !selectedIds.has(player.internalId)),
    euroScouting: {
      ...state.euroScouting,
      academyPlayers: state.euroScouting.academyPlayers
        .filter(player => !selectedIds.has(player.internalId)),
      nbaDraftDepartures: [
        ...(state.euroScouting.nbaDraftDepartures ?? []),
        ...departures.filter(player =>
          !(state.euroScouting?.nbaDraftDepartures ?? [])
            .some(existing => existing.internalId === player.internalId)),
      ],
      nbaDraftOutcomes: (state.euroScouting.nbaDraftOutcomes ?? [])
        .map(outcome => outcome.season === season ? { ...outcome, reviewed: true } : outcome),
    },
    history: [...(state.history ?? []), ...historyEntries],
  };
}

export function prepareExternalNbaDraftDeclarations(state: GameState, draftYear: number): GameState {
  if (isEuroIsolatedMode(state) || isPbaIsolatedMode(state)) return state;
  const teamsByTid = new Map(state.nonNBATeams.map(team => [team.tid, team]));
  const historyEntries: HistoryEntry[] = [];
  let changed = false;

  const players = state.players.map(player => {
    const status = String(player.status ?? '');
    const isExternal = externalStatuses.has(status) || player.tid >= 100;
    if (!isExternal || player.tid < 0 || player.historicalEndesaSource) return player;

    const isSourceClass = sourceDraftClass(player, draftYear);
    if (!isSourceClass && !candidateAgeEligible(player, draftYear)) return player;
    const projection = projectInternationalDraftSelection(player, draftYear);
    if (!isSourceClass && !projection.selected && !shouldDeclareForInternationalDraft(player, draftYear)) return player;

    const team = teamsByTid.get(player.tid);
    const declared = declareExternalPlayer(player, draftYear, team, isSourceClass);
    changed = true;
    historyEntries.push({
      text: `${player.name} entered the ${draftYear} NBA Draft from ${declared.preDraftClub?.name ?? `Club ${player.tid}`}.`,
      date: state.date,
      type: 'Draft Declaration',
      tid: player.tid,
      playerIds: [player.internalId],
    });
    return declared;
  });

  return changed
    ? { ...state, players, history: [...(state.history ?? []), ...historyEntries] }
    : state;
}
