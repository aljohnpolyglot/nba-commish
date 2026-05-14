import { describe, it, expect } from 'vitest';
import { buildCoachNationalityPool, clearNationalityPoolCache } from '../nationalityPool';
import type { GameState, Player } from '../../../types';

function makePlayer(tid: number, country: string): Player {
  return { tid, born: { loc: country, year: 1990 } } as Player;
}

describe('buildCoachNationalityPool', () => {
  it('filters by Endesa TID range [5000, 5100)', () => {
    const state = {
      players: [
        makePlayer(5001, 'Spain'),
        makePlayer(5002, 'Spain'),
        makePlayer(5003, 'Argentina'),
        makePlayer(3001, 'USA'),
        makePlayer(1001, 'Greece'),
      ],
    } as unknown as GameState;
    clearNationalityPoolCache();
    const pool = buildCoachNationalityPool(state, 'endesa');
    expect(pool.map(p => p.country).sort()).toEqual(['Argentina', 'Spain']);
  });

  it('falls back to fixed pool when no players match', () => {
    const state = { players: [] } as unknown as GameState;
    clearNationalityPoolCache();
    const pool = buildCoachNationalityPool(state, 'endesa');
    expect(pool.length).toBeGreaterThanOrEqual(5);
    expect(pool.some(p => p.country === 'Serbia')).toBe(true);
  });

  it('caches results until invalidator key changes', () => {
    const state = {
      players: Array.from({ length: 35 }, () => makePlayer(5001, 'Spain')),
    } as unknown as GameState;
    clearNationalityPoolCache();
    const first = buildCoachNationalityPool(state, 'endesa');
    const second = buildCoachNationalityPool(state, 'endesa');
    expect(first).toBe(second);
  });
});
