import type { GameResult, GameState, HistoricalAward, MediaFact } from '../../types';
import { TimeService } from '../time/TimeService';
import { getLeagueLifecycleMode } from '../lifecycle/leagueSeasonLifecycle';

const leagueScope = (state: GameState): string => getLeagueLifecycleMode(state);

const factId = (
  scope: string,
  type: MediaFact['type'],
  sourceKind: string,
  sourceId: string | number,
): string => `media:v1:${scope}:${type}:${sourceKind}:${sourceId}`;

const baseFact = (
  state: GameState,
  type: MediaFact['type'],
  sourceKind: string,
  sourceId: string | number,
  date: string,
  importance: MediaFact['importance'],
): MediaFact => ({
  id: factId(leagueScope(state), type, sourceKind, sourceId),
  type,
  occurredAt: TimeService.normalize(date),
  availableAt: TimeService.normalize(date),
  leagueScope: leagueScope(state),
  season: state.leagueStats.year,
  importance,
  entityRefs: {},
  sourceRef: { kind: sourceKind, id: String(sourceId) },
  templateVersion: 1,
});

export function buildSimulationMediaFacts(input: {
  before: GameState;
  after: GameState;
  results: GameResult[];
  awards?: HistoricalAward[];
}): MediaFact[] {
  const { before, after, results, awards = [] } = input;
  const gamesById = new Map((after.schedule ?? []).map(game => [game.gid, game]));
  const facts: MediaFact[] = [];
  for (const result of [...results].sort((left, right) => left.gameId - right.gameId)) {
    const scheduled = gamesById.get(result.gameId);
    const date = TimeService.normalize(result.date ?? scheduled?.date ?? after.date);
    const resultFact = baseFact(
      after,
      'game_result',
      'game',
      result.gameId,
      date,
      scheduled?.isPlayoff || scheduled?.isPlayIn ? 'notable' : 'routine',
    );
    resultFact.competitionId = scheduled?.competitionId;
    resultFact.entityRefs = {
      gameId: result.gameId,
      teamIds: [result.homeTeamId, result.awayTeamId],
    };
    facts.push(resultFact);

    for (const injury of result.injuries ?? []) {
      const injuryFact = baseFact(
        after,
        'injury',
        'game-injury',
        `${result.gameId}:${injury.playerId}`,
        date,
        'notable',
      );
      injuryFact.competitionId = scheduled?.competitionId;
      injuryFact.entityRefs = {
        gameId: result.gameId,
        personIds: [injury.playerId],
        teamIds: injury.teamId == null ? undefined : [injury.teamId],
      };
      injuryFact.attributes = {
        injuryType: injury.injuryType,
        gamesRemaining: injury.gamesRemaining,
      };
      facts.push(injuryFact);
    }
  }

  const priorSeries = new Map((before.playoffs?.series ?? []).map(series => [series.id, series]));
  for (const series of after.playoffs?.series ?? []) {
    if (series.status !== 'complete' || priorSeries.get(series.id)?.status === 'complete') continue;
    const fact = baseFact(after, 'series_completed', 'playoff-series', series.id, after.date, 'major');
    fact.entityRefs = {
      seriesId: series.id,
      teamIds: [series.higherSeedTid, series.lowerSeedTid],
    };
    facts.push(fact);
  }
  if (
    after.playoffs?.bracketComplete
    && !before.playoffs?.bracketComplete
    && after.playoffs.champion != null
  ) {
    const fact = baseFact(after, 'champion', 'season', after.leagueStats.year, after.date, 'critical');
    fact.entityRefs = { teamIds: [after.playoffs.champion] };
    facts.push(fact);
  }
  for (const award of awards) {
    const awardKey = `${award.season}:${award.type}:${award.pid ?? award.tid ?? award.name}`;
    const fact = baseFact(after, 'award', 'award', awardKey, after.date, 'major');
    fact.entityRefs = {
      awardId: awardKey,
      personIds: award.pid ? [String(award.pid)] : undefined,
      teamIds: award.tid == null ? undefined : [award.tid],
    };
    facts.push(fact);
  }
  return dedupeMediaFacts(facts);
}

export function buildAutoEventMediaFact(state: GameState, eventKey: string, date: string): MediaFact {
  const type: MediaFact['type'] = eventKey === 'hof_induction'
    ? 'hall_of_fame'
    : eventKey === 'draft_execute'
      ? 'draft_selection'
      : 'commissioner_announcement';
  return baseFact(state, type, 'calendar-event', `${state.leagueStats.year}:${eventKey}`, date, 'notable');
}

export function dedupeMediaFacts(facts: MediaFact[]): MediaFact[] {
  const byId = new Map<string, MediaFact>();
  for (const fact of facts) if (!byId.has(fact.id)) byId.set(fact.id, fact);
  return [...byId.values()];
}

export function appendMediaFacts(state: GameState, facts: MediaFact[]): GameState {
  if (facts.length === 0) return state;
  const existing = state.mediaFacts ?? [];
  const ids = new Set(existing.map(fact => fact.id));
  const additions = facts.filter(fact => !ids.has(fact.id));
  if (additions.length === 0) return state;
  return {
    ...state,
    mediaFacts: [...existing, ...additions],
    mediaEventRevision: Number(state.mediaEventRevision ?? 0) + additions.length,
  };
}
