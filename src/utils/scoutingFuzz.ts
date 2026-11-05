import type { GameState, NBAPlayer } from '../types';
import { getTeamScoutingFuzzBand } from '../services/staff/staffGameplayEffects';
import { getDisplayOverall, getDisplayPotential } from './playerRatings';
import type { DisplayPotentialOptions } from '../store/playerRatingStore';
import { computeAge } from './helpers';
import { getSimulationSeed } from '../services/saveIdentity';
import { getActiveLeagueTeams } from './teamLookup';

export const DRAFT_FUZZ_OVR_SALT = 'draft-ovr';
export const DRAFT_FUZZ_POT_SALT = 'draft-pot';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getBudgetScoutingFuzzBand(team: any): number {
  const investment = Math.max(50_000, Math.min(2_500_000, team?.tycoon?.scoutingInvestment ?? 250_000));
  const quality = (investment - 50_000) / (2_500_000 - 50_000);
  return clamp(Math.round(8 - quality * 8), 0, 8);
}

function isNBATeam(team: any): boolean {
  const tid = Number(team?.id ?? team?.tid ?? -1);
  return tid >= 0 && tid < 100;
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fuzzBoundedValueWithBand(
  value: number,
  state: Pick<GameState, 'saveId' | 'simulationSeed'>,
  player: NBAPlayer | null | undefined,
  salt: string,
  band: number,
  min: number,
  max: number,
): number {
  const boundedBand = clamp(Math.round(band), 0, 8);
  if (!boundedBand) return Math.round(clamp(value, min, max));
  const id = String((player as any)?.internalId ?? (player as any)?.pid ?? (player as any)?.name ?? 'player');
  const n = hash(`${getSimulationSeed(state)}-${id}-${salt}`) % (boundedBand * 2 + 1);
  return Math.round(clamp(value + n - boundedBand, min, max));
}

export function fuzzRatingValueWithBand(
  value: number,
  state: Pick<GameState, 'saveId' | 'simulationSeed'>,
  player: NBAPlayer | null | undefined,
  salt: string,
  band: number,
): number {
  return fuzzBoundedValueWithBand(value, state, player, salt, band, 25, 99);
}

export function fuzzPercentileValueWithBand(
  value: number,
  state: Pick<GameState, 'saveId' | 'simulationSeed'>,
  player: NBAPlayer | null | undefined,
  salt: string,
  band: number,
): number {
  return fuzzBoundedValueWithBand(value, state, player, salt, band, 1, 100);
}

export function getScoutingFuzzBand(
  state: GameState,
  player?: NBAPlayer | null,
  options?: { force?: boolean },
): number {
  if (!player) return 0;
  if (!options?.force && state.gameMode !== 'gm') return 0;
  if ((player as any).tid === state.userTeamId) return 0;
  const team = state.teams.find((t: any) => (t.id ?? t.tid) === state.userTeamId)
    ?? (state.nonNBATeams ?? []).find((t: any) => (t.id ?? t.tid) === state.userTeamId) as any;
  if (!team) return 0;
  const status = String((player as any).status ?? '').toLowerCase();
  const isDraftProspect = (player as any).tid === -2 || status.includes('draft prospect') || status === 'prospect';
  const staffBand = getTeamScoutingFuzzBand(team, isDraftProspect ? 'draft' : 'current');
  if (isNBATeam(team)) return staffBand;
  const budgetBand = getBudgetScoutingFuzzBand(team);
  return clamp(Math.round(staffBand * 0.3 + budgetBand * 0.7), 0, 8);
}

export function fuzzRatingValue(
  value: number,
  state: GameState,
  player?: NBAPlayer | null,
  salt = 'ovr',
  options?: { force?: boolean },
): number {
  const band = getScoutingFuzzBand(state, player, options);
  return fuzzRatingValueWithBand(value, state, player, salt, band);
}

export function fuzzPercentileValue(
  value: number,
  state: GameState,
  player?: NBAPlayer | null,
  salt = 'percentile',
  options?: { force?: boolean },
): number {
  const band = getScoutingFuzzBand(state, player, options);
  return fuzzPercentileValueWithBand(value, state, player, salt, band);
}

export function getScoutedK2Data<T extends { [K in keyof T]: { ovr: number; sub: number[] } }>(
  state: GameState,
  player: NBAPlayer,
  ratings: T,
): T {
  const entries = Object.entries(ratings) as Array<[keyof T, { ovr: number; sub: number[] }]>;
  return Object.fromEntries(
    entries.map(([key, category]) => [
      key,
      {
        ovr: fuzzRatingValue(category.ovr, state, player, String(key)),
        sub: category.sub.map((value, index) => fuzzRatingValue(value, state, player, `${String(key)}.${index}`)),
      },
    ]),
  ) as T;
}

export function fuzzDraftRatingValue(
  value: number,
  state: GameState,
  player: NBAPlayer | null | undefined,
  kind: 'ovr' | 'pot',
): number {
  return fuzzRatingValue(
    value,
    state,
    player,
    kind === 'ovr' ? DRAFT_FUZZ_OVR_SALT : DRAFT_FUZZ_POT_SALT,
    { force: true },
  );
}

export function formatFuzzedRating(value: number, state: GameState, player?: NBAPlayer | null, salt = 'ovr'): string {
  const fuzzed = fuzzRatingValue(value, state, player, salt);
  return String(fuzzed);
}

const performanceDisplayCache = new WeakMap<GameState, { year: number; boosts: Map<string, number> }>();

function getCurrentProduction(player: NBAPlayer, season: number) {
  let stat: NonNullable<NBAPlayer['stats']>[number] | undefined;
  for (const row of player.stats ?? []) {
    if (row.season === season && !row.playoffs && (!stat || row.gp > stat.gp)) stat = row;
  }
  if (!stat?.gp) return null;
  const perGame = (value: number | undefined) => Number(value ?? 0) / stat.gp;
  return {
    gp: stat.gp,
    mpg: stat.min / stat.gp,
    score: perGame(stat.pts)
      + perGame(stat.trb) * 0.55
      + perGame(stat.ast) * 0.7
      + (perGame(stat.stl) + perGame(stat.blk)) * 1.5
      - perGame(stat.tov) * 0.5,
  };
}

function getPerformanceDisplayBoosts(state: GameState, season: number): Map<string, number> {
  const cached = performanceDisplayCache.get(state);
  if (cached?.year === season) return cached.boosts;

  const teamIds = new Set(getActiveLeagueTeams(state).map(team => Number(team.id)));
  const peers = state.players.flatMap(player => {
    if (!teamIds.has(Number(player.tid))) return [];
    const production = getCurrentProduction(player, season);
    return production ? [{ player, production }] : [];
  });
  const minimumGames = Math.max(8, Math.floor(Math.max(0, ...peers.map(peer => peer.production.gp)) * 0.25));
  const eligible = peers.filter(peer => peer.production.gp >= minimumGames && peer.production.mpg >= 20);
  const byProduction = [...eligible].sort((left, right) => left.production.score - right.production.score);
  const byOverall = eligible.map(peer => getDisplayOverall(peer.player, season, {
    wnbaCurrentRoster: state.leagueStats?.uiMode === 'wnba_isolated',
  })).sort((left, right) => left - right);
  const boosts = new Map<string, number>();

  if (eligible.length >= 8) {
    for (const peer of eligible) {
      const base = getDisplayOverall(peer.player, season, {
        wnbaCurrentRoster: state.leagueStats?.uiMode === 'wnba_isolated',
      });
      const nextProduction = byProduction.findIndex(row => row.production.score > peer.production.score);
      const nextOverall = byOverall.findIndex(value => value > base);
      const performancePercentile = (nextProduction < 0 ? eligible.length - 1 : nextProduction - 1) / (eligible.length - 1);
      const overallPercentile = (nextOverall < 0 ? eligible.length - 1 : nextOverall - 1) / (eligible.length - 1);
      if (performancePercentile < 0.88 || performancePercentile - overallPercentile < 0.08) continue;
      const target = byOverall[Math.round(performancePercentile * (byOverall.length - 1))] ?? base;
      if (target >= base + 2) boosts.set(peer.player.internalId, Math.min(10, target - base));
    }
  }

  performanceDisplayCache.set(state, { year: season, boosts });
  return boosts;
}

export function getPerformanceBoostedDisplayOverall(
  state: GameState,
  player: NBAPlayer,
  baseOverall: number,
  season?: number,
): number {
  const currentYear = Number(state.leagueStats?.year);
  if (!Number.isFinite(currentYear) || (season != null && season !== currentYear)) return baseOverall;
  return baseOverall + (getPerformanceDisplayBoosts(state, currentYear).get(player.internalId) ?? 0);
}

export function getScoutedDisplayOverall(state: GameState, player: NBAPlayer, season?: number): number {
  return fuzzRatingValue(
    getPerformanceBoostedDisplayOverall(
      state,
      player,
      getDisplayOverall(player, season, { wnbaCurrentRoster: state.leagueStats?.uiMode === 'wnba_isolated' }),
      season,
    ),
    state,
    player,
    'ovr',
  );
}

export function getScoutedDisplayPotential(
  state: GameState,
  player: NBAPlayer,
  currentYear: number,
  season?: number,
  options?: DisplayPotentialOptions,
): number {
  const effectiveOptions = {
    ...options,
    ...(state.leagueStats?.uiMode === 'pba_isolated' ? { floorAtEstimated: false } : {}),
    wnbaCurrentRoster: state.leagueStats?.uiMode === 'wnba_isolated',
  };
  const potential = fuzzRatingValue(getDisplayPotential(player, currentYear, season, effectiveOptions), state, player, 'pot');
  const overall = getScoutedDisplayOverall(state, player, season);
  if (computeAge(player, currentYear) >= 27) return Math.min(potential, overall);
  return Math.max(potential, overall);
}
