import type { GameState, NewsItem } from '../../../types';
import { getLsYear } from '../../../utils/leagueYear';
import {
  filterExternalHOFInducteesForTimeline,
  getExternalHOFMaxInductionYear,
} from '../../playerDevelopment/hofHistoryWindow';
import { logPlanEvent } from '../../offseason/offseasonPlan';
import { getHOFClassYearForDate } from '../../playerDevelopment/hofChecker';
import { adaptProcessedHOFPlayer, type ProcessedHOFPlayer } from '../../../data/HOFData';
import { resolveSavedHistoryPlayer } from '../../navigation/historyPlayerNavigation';
import { resolveCanonicalPersonId } from '../../../utils/playerIdentity';
import { resolveRetirementCareerIdentity } from '../../retirement/retirementEventIdentity';
import { recordSimulationPerf } from '../../simulation/simulationPerfDebug';
import hofCatalog from '../../../../data/sources/hof/naismith-player-inductees.json';

const perfNow = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();
const recordHofLeaf = (
  leaf: string,
  startedAt: number,
  items: number,
  extra: Record<string, string | number | boolean | undefined> = {},
): void => recordSimulationPerf({
  engine: 'hof-resolver-leaf',
  leaf,
  items,
  totalMs: perfNow() - startedAt,
  ...extra,
});

type HOFSourceRow = { year: string | number; name: string; position?: string };

const normalizeHofName = (name: string): string => name
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

// Immutable source index. Source row order is retained within every class and
// therefore remains the deterministic induction/news order.
const hofRowsByYear = new Map<number, HOFSourceRow[]>();
for (const row of (hofCatalog.data ?? []) as HOFSourceRow[]) {
  const year = Number(row.year);
  if (!Number.isFinite(year) || !row.name) continue;
  const rows = hofRowsByYear.get(year) ?? [];
  rows.push(row);
  hofRowsByYear.set(year, rows);
}

const firstSourceId = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const toProcessedHofPlayer = (person: GameState['players'][number], row: HOFSourceRow): ProcessedHOFPlayer => {
  const sourceId = String(
    person.srID
      ?? person.slug
      ?? firstSourceId(person.sourceIds?.srID)
      ?? '',
  ).trim();
  return {
    name: person.name || row.name,
    tid: person.tid ?? -3,
    pos: person.pos || row.position || '',
    hgt: person.hgt ?? 0,
    weight: person.weight ?? 0,
    imgURL: person.imgURL,
    born: person.born ?? { year: 0, loc: '' },
    draft: {
      year: person.draft?.year ?? 0,
      pick: person.draft?.pick ?? 0,
    },
    awards: person.awards,
    ratings: person.ratings,
    stats: person.stats,
    hof: true,
    retiredYear: person.retiredYear,
    srID: sourceId || undefined,
    slug: sourceId || undefined,
    inductionYear: Number(row.year),
  };
};

const resolveLocalHistoricalHofClass = (
  state: GameState,
  classYear: number,
  maxInductionYear: number | undefined,
): ProcessedHOFPlayer[] => {
  const lookupStartedAt = perfNow();
  const sourceRows = maxInductionYear != null && classYear > maxInductionYear
    ? []
    : hofRowsByYear.get(classYear) ?? [];
  recordHofLeaf('immutable-hof-class-lookup', lookupStartedAt, sourceRows.length, {
    cacheHits: sourceRows.length > 0 ? 1 : 0,
    cacheMisses: sourceRows.length > 0 ? 0 : 1,
  });

  const personIndexStartedAt = perfNow();
  const historicalByName = new Map<string, GameState['players'][number]>();
  for (const person of state.historicalPeople ?? []) {
    const key = normalizeHofName(person.name ?? '');
    if (key && !historicalByName.has(key)) historicalByName.set(key, person);
  }
  const savedByName = new Map<string, GameState['players'][number]>();
  for (const person of state.players) {
    if (person.hofInductionYear !== classYear) continue;
    const key = normalizeHofName(person.name ?? '');
    if (key && !savedByName.has(key)) savedByName.set(key, person);
  }
  recordHofLeaf('saved-historical-person-index', personIndexStartedAt, (state.historicalPeople?.length ?? 0) + state.players.length, {
    historicalPeople: state.historicalPeople?.length ?? 0,
    savedClassPeople: savedByName.size,
  });

  const materializeStartedAt = perfNow();
  const result = sourceRows.flatMap(row => {
    const key = normalizeHofName(row.name);
    const person = historicalByName.get(key) ?? savedByName.get(key);
    return person ? [toProcessedHofPlayer(person, row)] : [];
  });
  recordHofLeaf('saved-historical-class-materialization', materializeStartedAt, sourceRows.length, {
    materialized: result.length,
    missing: sourceRows.length - result.length,
  });
  return result;
};

export const autoInductHOFClass = async (state: GameState): Promise<Partial<GameState>> => {
  const resolverStartedAt = perfNow();
  logPlanEvent('autoResolvers.autoInductHOFClass', 'fire', `date=${state.date}`);
  if (state.leagueStats?.uiMode === 'pba_isolated') return {};
  const classYear = getHOFClassYearForDate(state.date);
  const idPrefix = `hof-class-${classYear}-`;
  const inductedClasses = state.leagueStats?.hofClassesInducted ?? [];
  const alreadyPersisted = inductedClasses.includes(classYear);
  const alreadyInNews = (state.news ?? []).some(news => news.id?.startsWith(idPrefix));
  if (alreadyPersisted || alreadyInNews) return {};

  const timelineInput = {
    currentYear: getLsYear(state),
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  };
  const maxInductionYear = getExternalHOFMaxInductionYear(timelineInput);
  const isNbaHistoryScope = state.leagueType === 'modded'
    && state.moddedLeagueBase === 'nba'
    && (state.leagueStats?.uiMode ?? 'nba') === 'nba';
  const externalLoadStartedAt = perfNow();
  const externalClass = isNbaHistoryScope
    ? filterExternalHOFInducteesForTimeline(
        resolveLocalHistoricalHofClass(state, classYear, maxInductionYear),
        timelineInput,
      )
    : [];
  recordHofLeaf('external-class-resolution', externalLoadStartedAt, externalClass.length, {
    historyScope: isNbaHistoryScope,
  });
  const identityStartedAt = perfNow();
  const externalPeople = externalClass.map(inductee => {
    const sourcePlayer = adaptProcessedHOFPlayer(inductee);
    const savedPlayer = resolveSavedHistoryPlayer(state.players, sourcePlayer);
    return savedPlayer ?? sourcePlayer;
  });
  recordHofLeaf('saved-player-identity-resolution', identityStartedAt, externalClass.length);
  const candidateStartedAt = perfNow();
  const externalSavedIds = new Set(externalPeople
    .filter(person => state.players.some(player => player.internalId === person.internalId))
    .map(person => person.internalId));
  const selectedIds = new Set(
    state.players
      .filter(player => player.scheduledHofInductionYear === classYear)
      .map(player => player.internalId),
  );
  recordHofLeaf('candidate-and-prior-inductee-scan', candidateStartedAt, state.players.length, {
    externalCandidates: externalPeople.length,
    scheduledCandidates: selectedIds.size,
  });
  const updateStartedAt = perfNow();
  const updatedPlayers = state.players.map(player => {
    const selected = selectedIds.has(player.internalId);
    const historical = externalSavedIds.has(player.internalId);
    if (!selected && !historical) return player;
    return {
      ...player,
      hof: true,
      hofInductionYear: classYear,
      hofLeague: state.leagueStats?.uiMode === 'wnba_isolated'
        ? 'WNBA'
        : state.leagueStats?.leagueName ?? 'League',
      scheduledHofInductionYear: undefined,
    };
  });
  recordHofLeaf('inducted-player-materialization', updateStartedAt, state.players.length);
  const dedupeStartedAt = perfNow();
  const selectedPeople = state.players
    .filter(player => selectedIds.has(player.internalId))
    .map(player => player);
  const peopleByIdentity = new Map<string, typeof selectedPeople[number]>();
  for (const person of [...selectedPeople, ...externalPeople]) {
    peopleByIdentity.set(resolveCanonicalPersonId(person), person);
  }
  const people = [...peopleByIdentity.values()];
  recordHofLeaf('canonical-person-dedupe', dedupeStartedAt, selectedPeople.length + externalPeople.length, {
    inducted: people.length,
  });

  const newsStartedAt = perfNow();
  const date = state.date;
  const classItem = {
    id: `${idPrefix}official`,
    headline: `Class of ${classYear} Enshrined in the Hall of Fame`,
    content: people.length > 0
      ? `The Basketball Hall of Fame has formally inducted the Class of ${classYear}: ${people.map(person => person.name).join(', ')}.`
      : `The Basketball Hall of Fame has closed its ${classYear} ceremony without a player induction.`,
    date,
    type: 'league' as const,
    isNew: true,
    read: false,
  } as NewsItem;
  const playerItems = people.slice(0, 10).map((person, index) => ({
    id: `${idPrefix}player-${index}`,
    headline: `${person.name} Inducted Into Hall of Fame`,
    content: `${person.name} has been formally enshrined as part of the Class of ${classYear}.`,
    date,
    type: 'player' as const,
    playerPortraitUrl: person.imgURL,
    playerIds: state.players.some(player => player.internalId === person.internalId) ? [person.internalId] : undefined,
    personId: resolveCanonicalPersonId(person),
    sourceIds: person.sourceIds,
    league: 'NBA',
    isNew: true,
    read: false,
  } as NewsItem));
  recordHofLeaf('news-and-mediafact-input-materialization', newsStartedAt, people.length);
  const historyStartedAt = perfNow();
  const history = people.map(person => {
    const identity = resolveRetirementCareerIdentity(person, state.teams, state.nonNBATeams ?? []);
    const saved = state.players.some(player => player.internalId === person.internalId);
    return {
    text: `${person.name} inducted into the Hall of Fame (Class of ${classYear}).`,
    date,
    type: 'Retirement' as const,
    eventType: 'hall-of-fame',
    personId: resolveCanonicalPersonId(person),
    sourceIds: person.sourceIds,
    league: identity.league === 'UNKNOWN' ? 'NBA' : identity.league,
    teamIds: identity.careerTeamIds,
    ...(identity.primaryCareerTeamId != null ? { careerTeamId: identity.primaryCareerTeamId } : {}),
    ...(saved ? { playerIds: [person.internalId] } : {}),
  };
  });
  recordHofLeaf('career-identity-and-history-writes', historyStartedAt, people.length, {
    statRows: people.reduce((sum, person) => sum + (person.stats?.length ?? 0), 0),
    awardRows: people.reduce((sum, person) => sum + (person.awards?.length ?? 0), 0),
  });

  recordSimulationPerf({
    engine: 'hof-resolver-total',
    classYear,
    playersScanned: state.players.length,
    historicalPeople: state.historicalPeople?.length ?? 0,
    inducted: people.length,
    totalMs: perfNow() - resolverStartedAt,
  });

  return {
    players: updatedPlayers,
    news: [classItem, ...playerItems, ...(state.news ?? [])].slice(0, 200),
    history: [...(state.history ?? []), ...history],
    leagueStats: {
      ...state.leagueStats,
      hofClassesInducted: [...new Set([...inductedClasses, classYear])],
    },
  };
};
