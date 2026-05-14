// Event sinks: NullSink (Fast-Mode, future use) discards events, ArraySink
// stores them. The synthesizer writes to a sink; the sink shape decouples the
// emission logic from the consumer.

import { InlineEvent, InlinePlayLine } from './types';

export interface EventSink {
  emit(event: InlineEvent): void;
  getEvents(): InlineEvent[];
}

export class ArraySink implements EventSink {
  private events: InlineEvent[] = [];

  emit(event: InlineEvent): void {
    this.events.push(event);
  }

  getEvents(): InlineEvent[] {
    return this.events;
  }
}

export class NullSink implements EventSink {
  emit(_event: InlineEvent): void {
    // Discarded — Fast Mode does not need PBP history
  }

  getEvents(): InlineEvent[] {
    return [];
  }
}

// Derive running scores (cs = HOME, ds = AWAY) consumer-side from the event
// stream. This is the ZenGM-pattern: PBP entries don't store cs/ds at emit
// time; instead the consumer reconstructs the running score by replaying the
// pts contribution of each event. AC1/AC2 are guaranteed by construction:
// the final cs/ds == sum of all event.pts per team, which == the engine's
// box-score IF the synthesizer's event budgets sum to the quarter targets.
export function attachRunningScores(events: InlineEvent[]): InlinePlayLine[] {
  let cs = 0;
  let ds = 0;
  return events.map(ev => {
    if (ev.tm === 'HOME') cs += ev.pts;
    else if (ev.tm === 'AWAY') ds += ev.pts;
    return { ...ev, cs, ds };
  });
}
