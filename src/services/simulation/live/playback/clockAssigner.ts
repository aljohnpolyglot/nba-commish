import { Possession, Period, PossessionOutcome } from './possessionTypes';

// Per-outcome possession duration estimate (seconds). Numbers loosely follow
// ZenGM/BBGM ranges: shot release + decision + (inbound if make) + rebound.
// Real-time accumulation replaces the old linear `i / (n-1)` distribution
// that produced time-jumps and clustered events at the buzzer.
function durationFor(o: PossessionOutcome): number {
  switch (o) {
    case 'TOV':         return 8;
    case 'MADE_2':      return 14;
    case 'MADE_3':      return 15;
    case 'MADE_4':      return 16;
    case 'MISS_2_DRB':  return 11;
    case 'MISS_3_DRB':  return 12;
    case 'MISS_4_DRB':  return 13;
    case 'MISS_2_ORB':  return 11;
    case 'MISS_3_ORB':  return 12;
    case 'MISS_4_ORB':  return 13;
    case 'FOUL_TRIP':   return 22;
  }
}

export function assignClocks(
  possessions: Possession[],
  quarterDuration: number = 720,
  qStartGs: number = 0,
  periodLabel: Period = '1ST',
  isLatePeriod: boolean = false
): void {
  const qLen = quarterDuration;
  const n = possessions.length;
  if (n === 0) return;

  // Pre-tip + late-clamp budget. Possessions live in [qStartGs+10, qStartGs+qLen-5].
  const usableLen = Math.max(qLen - 25, 60);
  const startGs = qStartGs + 10;
  const endClamp = qStartGs + qLen - 5;

  // 1) Raw durations per possession outcome.
  const rawDurations = possessions.map(p => {
    if (p.isJumpball) return 4;
    return durationFor(p.outcome);
  });

  // Late-period (Q4/OT) extends decision time on the closing third.
  if (isLatePeriod) {
    const lateStart = Math.floor(n * 0.66);
    for (let i = lateStart; i < n; i++) rawDurations[i] *= 1.15;
  }

  // 2) Scale to fit the quarter exactly. Real possessions average ~24s (shot
  // clock + dead time); the raw durations average ~13s. Scaling stretches the
  // visible pacing without distorting the relative gap between outcome types.
  const totalRaw = rawDurations.reduce((s, d) => s + d, 0);
  const scale = totalRaw > 0 ? usableLen / totalRaw : 1;

  // 3) Walk the clock, apply small jitter, enforce monotonic gs.
  let cursor = startGs;
  let prevGs = startGs - 1; // ensures first stamp is > startGs - 0.5

  possessions.forEach((poss, i) => {
    const dur = rawDurations[i] * scale;
    cursor += dur;

    // Jitter capped at 15% of duration (so consecutive plays cannot invert).
    const jitterMax = Math.min(dur * 0.15, 1.5);
    const jitter = (Math.random() - 0.5) * 2 * jitterMax;

    let gs = cursor + jitter;

    // Hard monotonicity + boundary clamp.
    gs = Math.max(prevGs + 0.5, Math.min(endClamp, gs));
    prevGs = gs;

    const tiq = Math.max(0, qLen - (gs - qStartGs));
    const mins = Math.floor(tiq / 60);
    const secs = Math.floor(tiq % 60);
    const clock = mins + ':' + secs.toString().padStart(2, '0');

    poss.gs = gs;
    poss.clock = clock;
    poss.period = periodLabel;
  });
}
