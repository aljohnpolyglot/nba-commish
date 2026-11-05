import fineCatalogJson from '../../data/fine-reason-templates.json';
import suspensionCatalogJson from '../../data/suspension-reason-templates.json';
import disciplineHistoryJson from '../../data/nba-discipline-history.json';
import type { GameResult, GameState } from '../types';
import { getSimulationSeed } from './saveIdentity';
import { getSeasonEconomyIndex } from './tycoon/clubFinance';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../utils/uiMode';

export type FineEnforcement = 'automatic' | 'commissioner_discretion' | 'team_discretion';

export interface FineTemplate {
  id: string;
  name: string;
  reason: string;
  enforcement: FineEnforcement;
  baseAmountUSD: number;
  minimumAmountUSD?: number;
  maximumAmountUSD?: number;
  suspensionEligible?: boolean;
  automaticSuspensionGames?: number;
  minimumSuspensionGames?: number;
  scope: 'regular_season' | 'playoffs' | 'all_games' | 'league' | 'team';
}

export interface SuspensionTemplate {
  id: string;
  name: string;
  reason: string;
  minGames: number;
  averageGames: number;
  maxGames: number;
}

export interface DisciplineTemplateSelection {
  templateId: string;
  templateName: string;
  reason: string;
  amountUSD?: number;
  games?: number;
}

interface FineCatalog {
  templateModal: {
    title: string;
    description: string;
    amountUnit: string;
    baseSeason: number;
  };
  templates: FineTemplate[];
}

interface SuspensionCatalog {
  templateModal: {
    title: string;
    description: string;
    durationUnit: string;
  };
  templates: SuspensionTemplate[];
}

interface HistoricalDisciplineFrequencyRecord {
  date: string;
  season: number;
  action: 'fine' | 'suspension' | 'fine_and_suspension';
  reasonCategory: string;
}

interface HistoricalDisciplineFrequencyCatalog {
  records: HistoricalDisciplineFrequencyRecord[];
}

export const FINE_TEMPLATE_CATALOG = fineCatalogJson as FineCatalog;
export const SUSPENSION_TEMPLATE_CATALOG = suspensionCatalogJson as SuspensionCatalog;

const fineById = new Map(FINE_TEMPLATE_CATALOG.templates.map(template => [template.id, template]));
const historicalFrequencyRecords = (disciplineHistoryJson as HistoricalDisciplineFrequencyCatalog).records;
const automaticFrequencyCategories = new Set(['technical_foul', 'flagrant_foul']);

const dateKey = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toISOString().slice(0, 10);
};

const stableUnit = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
};

export interface AutomaticDisciplineFrequencyProfile {
  sourceSeasons: number[];
  annualTarget: number;
  observedWindowDays: number;
  dailyTarget: number;
}

export function getAutomaticDisciplineFrequencyProfile(state: GameState): AutomaticDisciplineFrequencyProfile {
  const targetSeason = Number(state.leagueStats.year);
  const availableSeasons = [...new Set(historicalFrequencyRecords.map(record => Number(record.season)))]
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const eligibleSeasons = availableSeasons.filter(season => season <= targetSeason);
  const sourceSeasons = (eligibleSeasons.length > 0 ? eligibleSeasons : availableSeasons).slice(-5);
  const seasonCounts = sourceSeasons.map(season => historicalFrequencyRecords.filter(record =>
    Number(record.season) === season
    && automaticFrequencyCategories.has(record.reasonCategory)
  ).length);
  const sourceRecords = historicalFrequencyRecords.filter(record => sourceSeasons.includes(Number(record.season)));
  const seasonSpans = sourceSeasons.flatMap(season => {
    const timestamps = sourceRecords
      .filter(record => Number(record.season) === season)
      .map(record => Date.parse(`${dateKey(record.date)}T00:00:00Z`))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    if (timestamps.length < 2) return [];
    return [Math.max(1, Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 86_400_000) + 1)];
  });
  const observedWindowDays = seasonSpans.length > 0
    ? Math.max(1, Math.round(seasonSpans.reduce((sum, days) => sum + days, 0) / seasonSpans.length))
    : 210;
  const activeNbaTeams = state.teams.filter(team => team.id >= 0 && team.id < 100).length || 30;
  const sourceAnnual = seasonCounts.length > 0
    ? seasonCounts.reduce((sum, count) => sum + count, 0) / seasonCounts.length
    : 18;
  const annualTarget = Math.max(1, sourceAnnual * activeNbaTeams / 30);
  return {
    sourceSeasons,
    annualTarget,
    observedWindowDays,
    dailyTarget: annualTarget / observedWindowDays,
  };
}

function roundEraMoney(amount: number): number {
  const step = amount < 1_000 ? 50 : amount < 10_000 ? 500 : amount < 100_000 ? 1_000 : 5_000;
  return Math.max(step, Math.round(amount / step) * step);
}

export function getEraAdjustedFineAmount(state: GameState, baseAmountUSD: number): number {
  const scale = getSeasonEconomyIndex(state, state.leagueStats.year);
  return roundEraMoney(Math.max(0, baseAmountUSD) * scale);
}

export function getEraFineStep(state: GameState): number {
  return getEraAdjustedFineAmount(state, 1_000);
}

export function getFineTemplateAmount(state: GameState, template: FineTemplate): number {
  return getEraAdjustedFineAmount(state, template.baseAmountUSD);
}

export function sampleSuspensionGames(template: SuspensionTemplate): number {
  const min = Math.max(1, Math.round(template.minGames));
  const max = Math.max(min, Math.round(template.maxGames));
  if (min === max) return min;
  const typical = Math.min(max, Math.max(min, Math.round(template.averageGames)));
  const candidates = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const spread = Math.max(1, (max - min) / 3);
  const weights = candidates.map(games => Math.exp(-Math.abs(games - typical) / spread));
  let pick = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < candidates.length; index += 1) {
    pick -= weights[index];
    if (pick <= 0) return candidates[index];
  }
  return typical;
}

export interface AutomaticDisciplineNotice {
  id: string;
  gameDate: string;
  playerId: string;
  playerName: string;
  teamId: number;
  amountUSD: number;
  reason: string;
  suspensionGames: number;
  templateId: string;
  templateName: string;
}

function calibrateAutomaticDiscipline(
  state: GameState,
  notices: AutomaticDisciplineNotice[],
): AutomaticDisciplineNotice[] {
  const existingIds = new Set(state.players.flatMap(player =>
    (player.disciplineHistory ?? []).map(record => record.id),
  ));
  const byDate = new Map<string, AutomaticDisciplineNotice[]>();
  for (const notice of notices) {
    if (existingIds.has(notice.id)) continue;
    const key = dateKey(notice.gameDate);
    byDate.set(key, [...(byDate.get(key) ?? []), notice]);
  }
  const profile = getAutomaticDisciplineFrequencyProfile(state);
  const selected: AutomaticDisciplineNotice[] = [];
  for (const [date, candidates] of byDate) {
    const forced = candidates.filter(notice => notice.suspensionGames > 0);
    const optional = candidates
      .filter(notice => notice.suspensionGames <= 0)
      .sort((left, right) =>
        stableUnit(`${getSimulationSeed(state)}:${date}:${left.id}`) - stableUnit(`${getSimulationSeed(state)}:${date}:${right.id}`),
      );
    selected.push(...forced);
    const baseCount = Math.floor(profile.dailyTarget);
    const fractionalCount = stableUnit(`${getSimulationSeed(state)}:${date}:automatic-discipline-frequency`) < profile.dailyTarget - baseCount
      ? 1
      : 0;
    const allowedOptional = Math.max(0, baseCount + fractionalCount - forced.length);
    selected.push(...optional.slice(0, allowedOptional));
  }
  return selected;
}

function technicalTemplateId(playoffs: boolean, total: number): string {
  if (playoffs) {
    if (total <= 2) return 'technical-playoffs-1-2';
    if (total <= 4) return 'technical-playoffs-3-4';
    if (total <= 6) return 'technical-playoffs-5-6';
    if (total === 7) return 'technical-playoffs-7';
    return 'technical-playoffs-additional';
  }
  if (total <= 5) return 'technical-regular-1-5';
  if (total <= 10) return 'technical-regular-6-10';
  if (total <= 15) return 'technical-regular-11-15';
  if (total === 16) return 'technical-regular-16';
  return 'technical-regular-additional';
}

function technicalSuspensionGames(playoffs: boolean, total: number): number {
  if (playoffs) return total === 7 || (total >= 9 && total % 2 === 1) ? 1 : 0;
  return total === 16 || (total >= 18 && total % 2 === 0) ? 1 : 0;
}

function previousTechnicalCount(state: GameState, playerId: string, playoffs: boolean): number {
  const player = state.players.find(candidate => candidate.internalId === playerId);
  return (player?.stats ?? [])
    .filter(row =>
      row.season === state.leagueStats.year
      && Boolean(row.playoffs) === playoffs
      && (!row.competitionId || /nba.?cup/i.test(row.competitionId)),
    )
    .reduce((sum, row) => sum + Number((row as typeof row & { techs?: number }).techs ?? 0), 0);
}

function previousEjectionCount(state: GameState, playerId: string): number {
  return (state.boxScores ?? [])
    .filter(box => Number(box.season ?? state.leagueStats.year) === state.leagueStats.year)
    .reduce((sum, box) => sum + (box.ejections ?? []).filter(ejection =>
      ejection.playerId === playerId
      && ejection.reason !== 'foul_out'
      && ejection.reason !== 'fighting',
    ).length, 0);
}

export function buildAutomaticGameDiscipline(
  state: GameState,
  results: GameResult[],
): AutomaticDisciplineNotice[] {
  if (isEuroIsolatedMode(state) || isPbaIsolatedMode(state)) return [];
  const players = new Map(state.players
    .filter(player => player.tid >= 0 && player.tid < 100)
    .map(player => [player.internalId, player]));
  const technicalCounts = new Map<string, number>();
  const ejectionCounts = new Map<string, number>();
  const notices = new Map<string, AutomaticDisciplineNotice>();

  const addNotice = (
    result: GameResult,
    playerId: string,
    amountUSD: number,
    reason: string,
    template: FineTemplate,
    suspensionGames = 0,
  ) => {
    const player = players.get(playerId);
    if (!player) return;
    const key = `${result.season ?? state.leagueStats.year}-${result.gameId}-${playerId}`;
    const current = notices.get(key);
    notices.set(key, current
      ? {
          ...current,
          amountUSD: current.amountUSD + amountUSD,
          reason: `${current.reason}; ${reason}`,
          suspensionGames: Math.max(current.suspensionGames, suspensionGames),
          templateId: current.templateId === template.id
            ? current.templateId
            : `${current.templateId},${template.id}`,
          templateName: current.templateName === template.name
            ? current.templateName
            : `${current.templateName} / ${template.name}`,
        }
      : {
          id: `automatic-discipline-${key}`,
          gameDate: result.date,
          playerId,
          playerName: player.name,
          teamId: player.tid,
          amountUSD,
          reason,
          suspensionGames,
          templateId: template.id,
          templateName: template.name,
        });
  };

  for (const result of results) {
    if (result.isAllStar || result.isRisingStars || result.isCelebrityGame) continue;
    if (result.competitionId && !result.isNBACup) continue;
    if (state.gameMode === 'gm' && result.fight && result.fight.severity !== 'scuffle') {
      const template = fineById.get('fighting');
      if (template) {
        const suspensionGames = result.fight.severity === 'brawl' ? 5 : 1;
        const amountUSD = getFineTemplateAmount(state, template);
        addNotice(result, result.fight.player1Id, amountUSD, result.fight.description, template, suspensionGames);
        addNotice(result, result.fight.player2Id, amountUSD, result.fight.description, template, suspensionGames);
      }
    }
    const playoffs = Boolean(result.isPlayoff || result.isPlayIn);
    if (!result.isPreseason && !result.excludeFromRecord) {
      for (const stat of [...result.homeStats, ...result.awayStats]) {
        if (!players.has(stat.playerId)) continue;
        const countKey = `${stat.playerId}:${playoffs ? 'playoffs' : 'regular'}`;
        let total = technicalCounts.get(countKey)
          ?? previousTechnicalCount(state, stat.playerId, playoffs);
        for (let index = 0; index < Number(stat.techs ?? 0); index += 1) {
          total += 1;
          const template = fineById.get(technicalTemplateId(playoffs, total));
          if (!template) continue;
          addNotice(
            result,
            stat.playerId,
            getFineTemplateAmount(state, template),
            `${playoffs ? 'Playoff' : 'Regular-season'} technical foul ${total}`,
            template,
            technicalSuspensionGames(playoffs, total),
          );
        }
        technicalCounts.set(countKey, total);
      }
    }

    for (const ejection of result.ejections ?? []) {
      if (!players.has(ejection.playerId) || ejection.reason === 'foul_out' || ejection.reason === 'fighting') continue;
      const prior = ejectionCounts.get(ejection.playerId) ?? previousEjectionCount(state, ejection.playerId);
      const total = prior + 1;
      ejectionCounts.set(ejection.playerId, total);
      const base = fineById.get(total === 1 ? 'first-ejection' : 'subsequent-ejection');
      if (!base) continue;
      const baseAmount = total === 1
        ? base.baseAmountUSD
        : fineById.get('first-ejection')!.baseAmountUSD * total;
      const flagrantMinimum = ejection.reason === 'flagrant_2'
        ? fineById.get('flagrant-two')?.baseAmountUSD ?? 0
        : 0;
      addNotice(
        result,
        ejection.playerId,
        getEraAdjustedFineAmount(state, Math.max(baseAmount, flagrantMinimum)),
        `${ejection.reason === 'flagrant_2' ? 'Flagrant 2 ejection' : 'Ejection'} ${total}`,
        base,
      );
    }
  }

  return calibrateAutomaticDiscipline(state, [...notices.values()]);
}
