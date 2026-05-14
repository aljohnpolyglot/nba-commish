import type { GameState, NBAPlayer } from '../types';
import { isEuroIsolatedMode } from './uiMode';

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getScoutingFuzzBand(state: GameState, player?: NBAPlayer | null): number {
  if (!player || !isEuroIsolatedMode(state) || state.gameMode !== 'gm') return 0;
  if ((player as any).tid === state.userTeamId) return 0;
  const team = state.teams.find((t: any) => (t.id ?? t.tid) === state.userTeamId)
    ?? (state.nonNBATeams ?? []).find((t: any) => (t.id ?? t.tid) === state.userTeamId) as any;
  const investment = team?.tycoon?.scoutingInvestment ?? 250_000;
  const quality = Math.max(0, Math.min(1, (investment - 50_000) / (2_500_000 - 50_000)));
  return Math.max(1, Math.round(9 - quality * 7));
}

export function fuzzRatingValue(value: number, state: GameState, player?: NBAPlayer | null, salt = 'ovr'): number {
  const band = getScoutingFuzzBand(state, player);
  if (!band) return value;
  const id = String((player as any)?.internalId ?? (player as any)?.pid ?? (player as any)?.name ?? 'player');
  const n = hash(`${state.saveId ?? 'save'}-${id}-${salt}`) % (band * 2 + 1);
  return Math.max(25, Math.min(99, Math.round(value + n - band)));
}

export function formatFuzzedRating(value: number, state: GameState, player?: NBAPlayer | null, salt = 'ovr'): string {
  const band = getScoutingFuzzBand(state, player);
  const fuzzed = fuzzRatingValue(value, state, player, salt);
  return band ? `~${fuzzed}` : String(fuzzed);
}
