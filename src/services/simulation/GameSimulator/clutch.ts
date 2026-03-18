import { PlayerGameStats, GameResult } from '../types';

export function pickGameWinner(
  winnerStats: PlayerGameStats[],
  teamId: number,
  lead: number,
  isOT: boolean
): GameResult['gameWinner'] {
  if (lead > 6) return undefined;

  const candidates = winnerStats.filter(s => s.pts > 0);
  if (candidates.length === 0) return undefined;

  const totalWeight = candidates.reduce((sum, p) => sum + p.pts + p.ftm * 0.5, 0);
  let r = Math.random() * totalWeight;
  let shooter = candidates[candidates.length - 1];
  for (const p of candidates) {
    r -= p.pts + p.ftm * 0.5;
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
