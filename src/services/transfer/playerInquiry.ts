import type { GameState, NBAPlayer } from '../../types';
import { getSimulationSeed } from '../saveIdentity';
import { getDisplayOverall, getDisplayPotential } from '../../utils/playerRatings';
import { getSeasonEconomyIndex } from '../tycoon/clubFinance';
import { estimatePlayerValueEUR } from './transferMarket';

export type EuroTransferAvailability = 'available' | 'listening' | 'untouchable';

export interface EuroTransferInquiryState {
  state: EuroTransferAvailability;
  multiplier: number;
  askingEUR: number;
  generatedSeason: number;
}

function seededFraction(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function snapFee(value: number): number {
  return Math.max(50_000, Math.round(value / 50_000) * 50_000);
}

function resolveAvailability(
  state: GameState,
  player: NBAPlayer,
  season: number,
): EuroTransferAvailability {
  const roster = state.players
    .filter(candidate => candidate.tid === player.tid)
    .sort((left, right) => getDisplayOverall(right) - getDisplayOverall(left));
  const rosterRank = roster.findIndex(candidate => candidate.internalId === player.internalId);
  const yearsLeft = Math.max(0, Number(player.contract?.exp ?? season) - season);
  const roll = seededFraction(`${getSimulationSeed(state)}:${player.internalId}:${season}:availability`);
  const highPotential = getDisplayPotential(player, season) >= getDisplayOverall(player) + 7;

  if (rosterRank === 0 || (rosterRank <= 2 && highPotential)) {
    return roll < 0.78 ? 'untouchable' : 'listening';
  }
  if (yearsLeft <= 1) {
    return roll < 0.58 ? 'available' : roll < 0.94 ? 'listening' : 'untouchable';
  }
  if (rosterRank >= Math.max(7, roster.length - 5)) {
    return roll < 0.48 ? 'available' : roll < 0.92 ? 'listening' : 'untouchable';
  }
  return roll < 0.18 ? 'available' : roll < 0.79 ? 'listening' : 'untouchable';
}

function resolveMultiplier(
  state: GameState,
  player: NBAPlayer,
  season: number,
  availability: EuroTransferAvailability,
): number {
  const roll = seededFraction(`${getSimulationSeed(state)}:${player.internalId}:${season}:price`);
  const [min, max] = availability === 'available'
    ? [0.8, 1]
    : availability === 'listening'
      ? [1.2, 1.8]
      : [2, 5];
  return Math.round((min + (max - min) * roll) * 100) / 100;
}

export function getEuroTransferInquiryState(
  state: GameState,
  player: NBAPlayer,
): EuroTransferInquiryState {
  const season = Number(state.leagueStats?.year ?? new Date().getUTCFullYear());
  const existing = state.euroTransferAvailability?.[player.internalId];
  if (existing?.generatedSeason === season) return existing;

  const availability = resolveAvailability(state, player, season);
  const multiplier = resolveMultiplier(state, player, season, availability);
  const marketValue = estimatePlayerValueEUR(
    player,
    season,
    getSeasonEconomyIndex(state, season),
  );
  const releaseClause = Number((player as NBAPlayer & { releaseClauseEUR?: number }).releaseClauseEUR);
  const askingEUR = Number.isFinite(releaseClause) && releaseClause > 0
    ? snapFee(releaseClause)
    : snapFee(marketValue * multiplier);

  return {
    state: availability,
    multiplier,
    askingEUR,
    generatedSeason: season,
  };
}
