// Daily tick during euro-isolated saves. Fires sparse, non-spammy events
// based on recent results / cash state. Pushes into state.tycoonEvents
// (consumed by news UI in a later slice).

import type { NBATeam } from '../../types';
import type { SponsorshipSlot, TycoonState } from '../../types/tycoon';

export interface TycoonEvent {
  id: string;
  teamId: number;
  date: string; // ISO yyyy-mm-dd
  kind: 'sponsorMidTermBonus' | 'sponsorPoachingOffer' | 'sponsorWarning' | 'crisisMeeting' | 'bankAlarm';
  payload?: any;
  unread: boolean;
}

interface TickContext {
  state: any;
  gameDate: string;
}

export function tick(ctx: TickContext): void {
  const state = ctx.state;
  if (!state) return;
  const events: TycoonEvent[] = (state.tycoonEvents = state.tycoonEvents ?? []);

  if (state._tycoonEventDayMark === ctx.gameDate) return;
  state._tycoonEventDayMark = ctx.gameDate;

  const teams: NBATeam[] = state.teams ?? [];
  for (const team of teams) {
    if (!team.tycoon) continue;
    runChecks(team, ctx.gameDate, events);
  }
}

function pushEvent(events: TycoonEvent[], teamId: number, date: string, kind: TycoonEvent['kind'], payload?: any): void {
  const id = `${kind}-${teamId}-${date}`;
  if (events.some(e => e.id === id)) return;
  events.push({ id, teamId, date, kind, payload, unread: true });
}

function runChecks(team: NBATeam, date: string, events: TycoonEvent[]): void {
  const t = team.tycoon!;
  const tid: number = (team as any).tid ?? team.id;

  if (t.cashOnHand < 0) {
    pushEvent(events, tid, date, 'bankAlarm', { cash: t.cashOnHand });
  }

  const ts: any = (team as any).stats;
  if (ts?.lastN?.lossStreak >= 5) {
    pushEvent(events, tid, date, 'sponsorWarning', { streak: ts.lastN.lossStreak });
    t.nextRenewalPenaltyFactor = 0.90;
  }

  if (date.match(/-01-\d{2}$/) && (ts?.standingRank ?? 0) >= 16) {
    pushEvent(events, tid, date, 'crisisMeeting', { rank: ts.standingRank });
  }

  if ((team as any).justWonEndesa) {
    const slot = pickRandomNonExpiredSlot(t.sponsorships ?? {});
    if (slot) {
      pushEvent(events, tid, date, 'sponsorMidTermBonus', { slot });
    }
    (team as any).justWonEndesa = false;
  }

  if ((team as any).justReachedEuroFinalFour && t.sponsorships?.sleeve && t.sponsorships.sleeve.yearsRemaining >= 2) {
    pushEvent(events, tid, date, 'sponsorPoachingOffer', { slot: 'sleeve' });
    (team as any).justReachedEuroFinalFour = false;
  }
}

function pickRandomNonExpiredSlot(s: TycoonState['sponsorships']): SponsorshipSlot | null {
  const slots = (['kit', 'sleeve', 'stadium'] as SponsorshipSlot[]).filter(k => s[k] !== null);
  return slots.length ? slots[Math.floor(Math.random() * slots.length)] : null;
}

export function acceptMidTermBonus(team: NBATeam, slot: SponsorshipSlot): void {
  const s = team.tycoon?.sponsorships?.[slot];
  if (!s) return;
  s.valuePerYear = Math.round(s.valuePerYear * 1.20);
  s.yearsRemaining += 2;
}

export function acceptPoachingOffer(
  team: NBATeam,
  slot: SponsorshipSlot,
  newSponsor: string,
  newValue: number,
  newYears: number,
  signedYear: number,
): { penalty: number } {
  const t = team.tycoon;
  if (!t) return { penalty: 0 };
  t.sponsorships = t.sponsorships ?? {};
  const existing = t.sponsorships[slot];
  const penalty = existing ? Math.round(existing.valuePerYear * existing.yearsRemaining * 0.30) : 0;
  t.sponsorships[slot] = {
    sponsor: newSponsor,
    valuePerYear: newValue,
    yearsRemaining: newYears,
    signedYear,
  };
  t.cashOnHand -= penalty;
  return { penalty };
}
