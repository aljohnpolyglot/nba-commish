import type { GameState, NBAPlayer } from '../types';
import { getTeamScoutingFuzzBand } from '../services/staff/staffGameplayEffects';
import { getDisplayOverall, getDisplayPotential } from './playerRatings';

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

export function getScoutingFuzzBand(state: GameState, player?: NBAPlayer | null): number {
  if (!player || state.gameMode !== 'gm') return 0;
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

export function fuzzRatingValue(value: number, state: GameState, player?: NBAPlayer | null, salt = 'ovr'): number {
  const band = getScoutingFuzzBand(state, player);
  if (!band) return value;
  const id = String((player as any)?.internalId ?? (player as any)?.pid ?? (player as any)?.name ?? 'player');
  const n = hash(`${state.saveId ?? 'save'}-${id}-${salt}`) % (band * 2 + 1);
  return Math.max(25, Math.min(99, Math.round(value + n - band)));
}

export function formatFuzzedRating(value: number, state: GameState, player?: NBAPlayer | null, salt = 'ovr'): string {
  const fuzzed = fuzzRatingValue(value, state, player, salt);
  return String(fuzzed);
}

export function getScoutedDisplayOverall(state: GameState, player: NBAPlayer, season?: number): number {
  return fuzzRatingValue(getDisplayOverall(player, season), state, player, 'ovr');
}

export function getScoutedDisplayPotential(state: GameState, player: NBAPlayer, currentYear: number, season?: number): number {
  return fuzzRatingValue(getDisplayPotential(player, currentYear, season), state, player, 'pot');
}
