import { NBAPlayer as Player } from '../../../types';
import { OnCourt, PlayerComposite } from './types';

/**
 * Manages who's on the court for one team, possession by possession.
 *
 * Replaces the chunked top-5-by-remaining approach with proper NBA-style
 * rotation logic: minute targets, foul-out (hard 6 PF), foul-trouble pulls
 * by period, fatigue stretch limits, and bench depth selection.
 *
 * Pure data class — no random I/O, just composes Math.random() in maybeSub.
 */
export class RotationManager {
  private onCourt: number[];        // 5 indices into rotation
  private playedSec: number[];      // total sec played per rotation player
  private stretchSec: number[];     // sec since last rest per rotation player
  private targetSec: number[];      // minute target × 60
  private closingCore: Set<number>;

  constructor(
    public readonly rotation: Player[],
    public readonly composites: PlayerComposite[],
    minuteTargets: number[],
  ) {
    const n = rotation.length;
    this.onCourt = [0, 1, 2, 3, 4].slice(0, Math.min(5, n));
    this.playedSec = new Array(n).fill(0);
    this.stretchSec = new Array(n).fill(0);
    this.targetSec = minuteTargets.map(m => Math.max(60, m * 60));
    this.closingCore = new Set(
      this.targetSec
        .map((seconds, index) => ({ seconds, index }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, Math.min(5, n))
        .map(entry => entry.index),
    );
  }

  getOnCourt(): OnCourt {
    return {
      players: this.onCourt.map(i => this.rotation[i]),
      composites: this.onCourt.map(i => this.composites[i]),
    };
  }

  /** Advance the per-player clock for everyone currently on court. */
  advanceTime(secElapsed: number): void {
    this.onCourt.forEach(i => {
      this.playedSec[i] += secElapsed;
      this.stretchSec[i] += secElapsed;
    });
  }

  /**
   * Decide whether any current player should be swapped off, and do it.
   * Called after every possession.
   *
   * @param period 1-based period (1-4 regulation, 5+ overtime)
   * @param secRemainingInGame remaining game-time seconds — closer crunch time means PF tolerance rises
   * @param getPf reads current PF count for a playerId (passed in by simulateQuarter from the BoxAccumulator)
   */
  maybeSub(period: number, secRemainingInGame: number, getPf: (id: string) => number): void {
    // Snapshot — we may evict multiple slots in one tick.
    for (const courtIdx of [...this.onCourt]) {
      const playerId = this.rotation[courtIdx].internalId;
      const pf = getPf(playerId);
      let shouldSub = false;

      if (pf >= 6) {
        // Hard foul-out — non-negotiable.
        shouldSub = true;
      } else if (
        (period === 1 && pf >= 3) ||
        (period === 2 && pf >= 4) ||
        (period === 3 && pf >= 5) ||
        (period === 4 && pf >= 5 && secRemainingInGame > 5 * 60)
      ) {
        // Foul trouble — coach yanks proactively to keep them available.
        if (Math.random() < 0.55) shouldSub = true;
      } else if (this.stretchSec[courtIdx] > 7 * 60) {
        // Fatigue — 7+ min stretch without rest, time for a breather.
        if (Math.random() < 0.50) shouldSub = true;
      } else if (this.playedSec[courtIdx] > this.targetSec[courtIdx] * 1.05) {
        // Used past their minute budget — coach trusts the rotation.
        if (Math.random() < 0.60) shouldSub = true;
      }

      if (shouldSub) this.swapOut(courtIdx, period, secRemainingInGame, getPf);
    }
  }

  private swapOut(
    outIdx: number,
    period: number,
    secRemainingInGame: number,
    getPf: (id: string) => number,
  ): void {
    const onSet = new Set(this.onCourt);
    const lateGame = period >= 5 || (period >= 4 && secRemainingInGame <= 6 * 60);
    const outgoingBucket = this.getBucket(this.rotation[outIdx].pos);
    const candidates = this.rotation
      .map((_, i) => i)
      .filter(i => !onSet.has(i))
      .map(bi => {
        const pf = getPf(this.rotation[bi].internalId);
        if (pf >= 6) return { i: bi, score: -Infinity };
        // Score: how far under their minute target are they (the more under-used,
        // the higher priority for getting in). Fresh-rested bonus +5.
        const remainingFraction =
          (this.targetSec[bi] - this.playedSec[bi]) / Math.max(60, this.targetSec[bi]);
        const restBonus = this.stretchSec[bi] === 0 ? 5 : 0;
        const roleBonus = this.getCompatibilityBonus(outgoingBucket, this.getBucket(this.rotation[bi].pos));
        const closingBonus = lateGame
          ? (this.closingCore.has(bi) ? 10 : -8)
          : 0;
        return { i: bi, score: remainingFraction * 100 + restBonus + roleBonus + closingBonus };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0 || candidates[0].score === -Infinity) {
      // Either no bench at all or every bench player has fouled out — keep
      // current player on. If they've fouled out (PF ≥ 6) the engine's stat
      // accumulator will keep recording but real games would forfeit; this is
      // a tolerable edge case for an MVP.
      return;
    }

    const replacementIdx = candidates[0].i;
    const slot = this.onCourt.indexOf(outIdx);
    this.onCourt[slot] = replacementIdx;
    this.stretchSec[outIdx] = 0;          // outgoing player resets stretch (now resting)
    this.stretchSec[replacementIdx] = 0;  // incoming player starts fresh stretch
  }

  private getBucket(pos?: string): 'guard' | 'wing' | 'big' {
    const normalized = (pos ?? '').toUpperCase();
    if (normalized.includes('C')) return 'big';
    if (normalized.includes('PF') || normalized === 'F' || normalized.includes('FC')) return 'big';
    if (normalized.includes('PG') || normalized === 'G') return 'guard';
    if (normalized.includes('SG')) return 'guard';
    return 'wing';
  }

  private getCompatibilityBonus(
    outgoing: 'guard' | 'wing' | 'big',
    incoming: 'guard' | 'wing' | 'big',
  ): number {
    if (outgoing === incoming) return 18;
    if ((outgoing === 'guard' && incoming === 'wing') || (outgoing === 'wing' && incoming === 'guard')) return 6;
    if ((outgoing === 'wing' && incoming === 'big') || (outgoing === 'big' && incoming === 'wing')) return 4;
    return -10;
  }

  /** Final actual-minutes-played per rotation player. */
  getMinutesPlayed(): number[] {
    return this.playedSec.map(s => s / 60);
  }
}
