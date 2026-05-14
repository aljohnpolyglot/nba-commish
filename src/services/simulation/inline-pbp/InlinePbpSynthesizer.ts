// InlinePbpSynthesizer — Skeleton (Phase 1).
// Produces an InlinePlayLine[] from a finished game's box-score, in a
// ZenGM-inspired style: each event is emitted with its scoring contribution,
// and the running cs/ds is derived consumer-side from the event stream.
//
// This file is intentionally minimal in Phase 1 — actual budget distribution
// and event emission come in Phases 2 and 3.

import { ArraySink, attachRunningScores } from './eventSink';
import { InlinePlayLine, SynthesizeInput } from './types';
import { distributeBudgets } from './budgetDistributor';
import { emitQuarter } from './eventEmitter';

export async function synthesizeInlinePbp(input: SynthesizeInput): Promise<InlinePlayLine[]> {
  const sink = new ArraySink();
  const { otCount, timingConfig } = input;
  const totalPeriods = timingConfig.numQuarters + otCount;

  // Phase 2: distribute total stats into per-quarter buckets that exactly
  // sum to quarterScores per team.
  const quarterBudgets = distributeBudgets(input);

  // Phase 3: emit possession-events per quarter, exhausting budgets exactly.
  // The jumpball event is emitted inside emitQuarter when q === 1 so it has
  // access to the actual lineup pools.
  for (let q = 1; q <= totalPeriods; q++) {
    emitQuarter(sink, q, quarterBudgets[q - 1], input);
  }

  // Attach running scores (cs/ds) consumer-side.
  return attachRunningScores(sink.getEvents());
}
