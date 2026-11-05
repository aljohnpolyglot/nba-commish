import { NBAPlayer as Player } from '../../../types';
import { OnCourt, PlayerComposite, TeamGameplayModifiers } from './types';

/**
 * Manages who's on the court for one team, possession by possession.
 *
 * Replaces the chunked strongest-players approach with possession-level
 * rotation logic: minute targets, configured foul-out, foul-trouble pulls
 * by period, fatigue stretch limits, and bench depth selection.
 *
 * Pure data class — no random I/O, just composes Math.random() in maybeSub.
 */
export class RotationManager {
  private onCourt: number[];        // configured number of indices into rotation
  private playedSec: number[];      // total sec played per rotation player
  private stretchSec: number[];     // sec since last rest per rotation player
  private targetSec: number[];      // minute target × 60
  private closingCore: Set<number>;
  private disqualified = new Set<string>();
  private temporarilyRemoved = new Set<number>();
  private shortHandedRemoved = new Set<number>();
  private substitutionCount = 0;

  constructor(
    public readonly rotation: Player[],
    public readonly composites: PlayerComposite[],
    minuteTargets: number[],
    private readonly playersOnCourt: number = 5,
    private readonly isEuroClubGame: boolean = false,
    private readonly gameplayModifiers?: TeamGameplayModifiers,
    private readonly foulOutLimit: number = 6,
    private readonly substitutionLimitEnabled: boolean = false,
    private readonly maxSubstitutions: number = 0,
    private readonly numPeriods: number = 4,
    private readonly competitiveRotationDepth: number = rotation.length,
  ) {
    const n = rotation.length;
    this.onCourt = Array.from({ length: Math.min(this.playersOnCourt, n) }, (_, index) => index);
    this.playedSec = new Array(n).fill(0);
    this.stretchSec = new Array(n).fill(0);
    this.targetSec = rotation.map((_, index) => Math.max(60, (minuteTargets[index] ?? 1) * 60));
    this.closingCore = new Set(
      this.targetSec
        .map((seconds, index) => ({ seconds, index }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, Math.min(this.playersOnCourt, n))
        .map(entry => entry.index),
    );
  }

  getOnCourt(): OnCourt {
    return {
      players: this.onCourt.map(i => this.rotation[i]),
      composites: this.onCourt.map(i => this.composites[i]),
      isEuroClubGame: this.isEuroClubGame,
      gameplayModifiers: this.gameplayModifiers,
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
  maybeSub(
    period: number,
    secRemainingInGame: number,
    getPf: (id: string) => number,
    isDisqualified: (id: string) => boolean = () => false,
    scoreMargin: number = 0,
  ): void {
    const margin = Math.abs(scoreMargin);
    const garbageTime = period === this.numPeriods && (
      (secRemainingInGame <= 8 * 60 && margin >= 25)
      || (secRemainingInGame <= 5 * 60 && margin >= 18)
      || (secRemainingInGame <= 3 * 60 && margin >= 12)
    );
    // Snapshot — we may evict multiple slots in one tick.
    for (const courtIdx of [...this.onCourt]) {
      const playerId = this.rotation[courtIdx].internalId;
      const pf = getPf(playerId);
      const highWorkload = this.targetSec[courtIdx] >= 41 * 60;
      const extremeHistoricalWorkload = this.targetSec[courtIdx] >= 46 * 60;
      let shouldSub = false;
      let forced = false;

      if (this.disqualified.has(playerId) || isDisqualified(playerId) || pf >= this.foulOutLimit) {
        shouldSub = true;
        forced = true;
      } else if (garbageTime && courtIdx < this.competitiveRotationDepth) {
        shouldSub = true;
      } else if (!garbageTime && courtIdx >= this.competitiveRotationDepth) {
        shouldSub = true;
      } else if (
        pf >= this.getFoulTroubleLimit(period, secRemainingInGame)
      ) {
        if (!highWorkload && Math.random() < 0.55) shouldSub = true;
      } else if (this.stretchSec[courtIdx] > (extremeHistoricalWorkload ? 14 : highWorkload ? 10 : 7) * 60) {
        // Fatigue — 7+ min stretch without rest, time for a breather.
        if (Math.random() < (extremeHistoricalWorkload ? 0.03 : highWorkload ? 0.10 : 0.50)) shouldSub = true;
      } else if (this.playedSec[courtIdx] > this.targetSec[courtIdx] * 1.05) {
        // Used past their minute budget — coach trusts the rotation.
        if (Math.random() < 0.60) shouldSub = true;
      }

      if (shouldSub) this.swapOut(courtIdx, period, secRemainingInGame, getPf, forced, isDisqualified, garbageTime);
    }
  }

  ejectPlayer(playerId: string): void {
    this.disqualified.add(playerId);
  }

  suspendUntilNextScore(playerId: string, allowSubstitute: boolean): void {
    const index = this.rotation.findIndex(player => player.internalId === playerId);
    if (index < 0 || !this.onCourt.includes(index)) return;
    this.temporarilyRemoved.add(index);
    if (allowSubstitute) {
      const slot = this.onCourt.indexOf(index);
      const onSet = new Set(this.onCourt);
      const replacement = this.rotation.findIndex((player, candidate) => (
        !onSet.has(candidate)
        && !this.temporarilyRemoved.has(candidate)
        && !this.disqualified.has(player.internalId)
      ));
      if (replacement >= 0) {
        this.onCourt[slot] = replacement;
        this.stretchSec[index] = 0;
        this.stretchSec[replacement] = 0;
      } else {
        this.onCourt = this.onCourt.filter(value => value !== index);
        this.shortHandedRemoved.add(index);
      }
      return;
    }
    this.onCourt = this.onCourt.filter(value => value !== index);
    this.shortHandedRemoved.add(index);
  }

  clearTemporarySuspensions(): void {
    for (const index of this.shortHandedRemoved) {
      if (this.onCourt.length >= this.playersOnCourt || this.onCourt.includes(index)) continue;
      this.onCourt.push(index);
    }
    this.temporarilyRemoved.clear();
    this.shortHandedRemoved.clear();
  }

  getSubstitutionCount(): number {
    return this.substitutionCount;
  }

  private swapOut(
    outIdx: number,
    period: number,
    secRemainingInGame: number,
    getPf: (id: string) => number,
    forced: boolean,
    isDisqualified: (id: string) => boolean,
    garbageTime: boolean,
  ): void {
    if (!forced && this.substitutionLimitEnabled && this.substitutionCount >= this.maxSubstitutions) return;
    const onSet = new Set(this.onCourt);
    const lateGame = period >= 5 || (period >= 4 && secRemainingInGame <= 6 * 60);
    const outgoingBucket = this.getBucket(this.rotation[outIdx].pos);
    const candidates = this.rotation
      .map((_, i) => i)
      .filter(i => !onSet.has(i))
      .filter(i => !this.temporarilyRemoved.has(i))
      .filter(i => garbageTime || i < this.competitiveRotationDepth)
      .map(bi => {
        const id = this.rotation[bi].internalId;
        const pf = getPf(id);
        if (this.disqualified.has(id) || isDisqualified(id) || pf >= this.foulOutLimit) {
          return { i: bi, score: -Infinity };
        }
        // Score: how far under their minute target are they (the more under-used,
        // the higher priority for getting in). Fresh-rested bonus +5.
        const remainingFraction =
          (this.targetSec[bi] - this.playedSec[bi]) / Math.max(60, this.targetSec[bi]);
        const restBonus = this.stretchSec[bi] === 0 ? 5 : 0;
        const roleBonus = this.getCompatibilityBonus(outgoingBucket, this.getBucket(this.rotation[bi].pos));
        const closingBonus = lateGame
          ? (this.closingCore.has(bi) ? 10 : -8)
          : 0;
        const reserveBonus = garbageTime && bi >= this.competitiveRotationDepth ? 120 : 0;
        return { i: bi, score: remainingFraction * 100 + restBonus + roleBonus + closingBonus + reserveBonus };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0 || candidates[0].score === -Infinity) {
      return;
    }

    const replacementIdx = candidates[0].i;
    const slot = this.onCourt.indexOf(outIdx);
    this.onCourt[slot] = replacementIdx;
    this.stretchSec[outIdx] = 0;          // outgoing player resets stretch (now resting)
    this.stretchSec[replacementIdx] = 0;  // incoming player starts fresh stretch
    if (!forced) this.substitutionCount += 1;
  }

  private getFoulTroubleLimit(period: number, secRemainingInGame: number): number {
    if (period > this.numPeriods || (period === this.numPeriods && secRemainingInGame <= 8 * 60)) {
      return this.foulOutLimit;
    }
    const completion = Math.max(0, Math.min(1, period / Math.max(1, this.numPeriods)));
    return Math.max(2, Math.min(this.foulOutLimit - 1, Math.ceil(completion * this.foulOutLimit)));
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
