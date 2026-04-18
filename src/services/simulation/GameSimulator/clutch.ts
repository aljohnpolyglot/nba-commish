import { PlayerGameStats, GameResult } from '../types';
import type { NBAPlayer } from '../../../types';

/**
 * Picks the game-winning shot taker on the winning team.
 * Weight = (pts + ftm*0.5) * clutchMult, where clutchMult is derived from the
 * player's stored `clutch` (0–99, neutral at 65). Dame at clutch=95 wins
 * buzzer-beaters ~46% more often than raw pts would predict; clutch=35 drops
 * ~46%. Absent/old saves (no clutch field, or `players` not passed) fall back
 * to neutral 1.0× — backward compatible.
 */
export function pickGameWinner(
  winnerStats: PlayerGameStats[],
  teamId: number,
  lead: number,
  isOT: boolean,
  players?: NBAPlayer[],
): GameResult['gameWinner'] {
  if (lead > 6) return undefined;

  const candidates = winnerStats.filter(s => s.pts > 0);
  if (candidates.length === 0) return undefined;

  const clutchById = new Map<string, number>();
  if (players) {
    for (const p of players) {
      const c = (p as any).clutch;
      if (typeof c === 'number') clutchById.set(p.internalId, c);
    }
  }
  const weightOf = (s: PlayerGameStats): number => {
    const base = s.pts + s.ftm * 0.5;
    const clutch = clutchById.get(s.playerId) ?? 65;
    const mult = 1 + (clutch - 65) * 0.015; // ~0.55× at 35, ~1.46× at 95
    return Math.max(0.1, base * mult);
  };

  const totalWeight = candidates.reduce((sum, p) => sum + weightOf(p), 0);
  let r = Math.random() * totalWeight;
  let shooter = candidates[candidates.length - 1];
  for (const p of candidates) {
    r -= weightOf(p);
    if (r <= 0) { shooter = p; break; }
  }

  let shotType: NonNullable<GameResult['gameWinner']>['shotType'];
  const isWalkoff = lead <= 3;

  if (lead <= 2 && shooter.ftm > 0 && Math.random() < 0.35) {
    shotType = 'clutch_ft';
  } else if (isOT && lead <= 3 && Math.random() < 0.20) {
    shotType = 'walkoff';
  } else if (shooter.threePm > 0 && Math.random() < 0.30) {
    shotType = 'clutch_3';
  } else {
    shotType = 'clutch_2';
  }

  let clockRemaining: string;
  if (shotType === 'walkoff' || (isWalkoff && lead === 1)) {
    const tenths = Math.round(Math.random() * 9);
    clockRemaining = tenths === 0 ? '0.0s' : `0.${tenths}s`;
  } else if (lead <= 2) {
    const secs = (Math.random() * 4 + 0.5).toFixed(1);
    clockRemaining = `${secs}s`;
  } else if (lead <= 4) {
    const secs = Math.round(Math.random() * 25 + 5);
    clockRemaining = `${secs}s`;
  } else {
    const secs = Math.round(Math.random() * 90 + 15);
    const m = Math.floor(secs / 60);
    const s = String(secs % 60).padStart(2, '0');
    clockRemaining = m > 0 ? `${m}:${s}` : `${secs}s`;
  }

  return {
    playerId:   shooter.playerId,
    playerName: shooter.name,
    teamId,
    shotType,
    isWalkoff,
    clockRemaining,
  };
}
