import type { Game } from '../../types';
import type { Allocations, ScheduleDay, TrainingParadigm } from '../../TeamTraining/types';

export function parseSimDate(dateStr: string | undefined | null): Date {
  if (dateStr) {
    const direct = new Date(dateStr);
    if (!isNaN(direct.getTime())) {
      return new Date(Date.UTC(direct.getFullYear(), direct.getMonth(), direct.getDate()));
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function sundayOf(dateStr: string | undefined | null): Date {
  const out = parseSimDate(dateStr);
  out.setUTCDate(out.getUTCDate() - out.getUTCDay());
  return out;
}

export function toIsoDay(dateStr: string | undefined | null): string {
  return parseSimDate(dateStr).toISOString().slice(0, 10);
}

export function getPracticeLabel(paradigm: TrainingParadigm): string {
  switch (paradigm) {
    case 'Balanced':
      return 'Balanced Practice';
    case 'Offensive':
      return 'Offense First';
    case 'Defensive':
      return 'Defense First';
    case 'Biometrics':
      return 'Conditioning';
    case 'Recovery':
      return 'Recovery';
    default:
      return paradigm;
  }
}

function phaseFromDate(d: Date): 'preseason' | 'regular' | 'playoffs' | 'offseason' {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if ((m === 8 && day >= 15) || m === 9 || (m === 10 && day <= 23)) return 'preseason';
  if ((m === 4 && day >= 16) || m === 5 || (m === 6 && day <= 20)) return 'playoffs';
  if ((m === 6 && day >= 21) || m === 7 || (m === 8 && day <= 14)) return 'offseason';
  return 'regular';
}

export function buildCalendar(
  schedule: Game[],
  teamId: number,
  anchorISO: string,
  teamLookup: Map<number, { abbrev: string; logoUrl?: string }>,
  days: number = 28
): ScheduleDay[] {
  const anchor = new Date(`${anchorISO}T00:00:00Z`);
  if (isNaN(anchor.getTime())) return [];

  const teamGamesByISO = new Map<string, Game>();
  for (const g of schedule) {
    if (g.homeTid !== teamId && g.awayTid !== teamId) continue;
    if (g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isDunkContest || g.isThreePointContest) continue;
    const dateKey = (g.date ?? '').slice(0, 10);
    if (dateKey) teamGamesByISO.set(dateKey, g);
  }

  const seedDay = new Date(anchor);
  seedDay.setUTCDate(anchor.getUTCDate() - 1);
  const seedSeed = new Date(anchor);
  seedSeed.setUTCDate(anchor.getUTCDate() - 2);
  const seedISO = seedDay.toISOString().slice(0, 10);
  const seedSeedISO = seedSeed.toISOString().slice(0, 10);
  let lastWasGame = teamGamesByISO.has(seedISO);
  let lastWasB2BGame2 = teamGamesByISO.has(seedISO) && teamGamesByISO.has(seedSeedISO);

  const result: ScheduleDay[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(anchor);
    d.setUTCDate(anchor.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const game = teamGamesByISO.get(iso);

    const nextDate = new Date(d);
    nextDate.setDate(d.getDate() + 1);
    const nextISO = nextDate.toISOString().slice(0, 10);
    const hasGameTomorrow = teamGamesByISO.has(nextISO);
    const phase = phaseFromDate(d);

    let activity: ScheduleDay['activity'] = 'Off Day';
    let description = 'Player day off';
    let isB2B = false;

    if (game) {
      activity = 'Game';
      isB2B = lastWasGame;
      description = isB2B ? 'Back-to-back — night two' : 'Game day';
    } else {
      activity = 'Balanced Practice';
      if (lastWasB2BGame2) description = 'Light load — post B2B';
      else if (lastWasGame) description = 'Light load — post-game';
      else if (hasGameTomorrow) description = 'Light load — pre-game';
      else if (phase === 'offseason') {
        activity = 'Off Day';
        description = 'Offseason — individual development only';
      } else if (phase === 'playoffs') description = 'Film + walkthrough for next opponent';
      else if (phase === 'preseason') description = 'Preseason training';
      else if (d.getUTCDay() === 0) {
        activity = 'Off Day';
        description = 'Sunday rest';
      } else description = 'Balanced offensive / defensive sets';
    }

    let opponent: ScheduleDay['opponent'];
    if (game) {
      const isHome = game.homeTid === teamId;
      const oppTid = isHome ? game.awayTid : game.homeTid;
      const oppMeta = oppTid >= 0 ? teamLookup.get(oppTid) : undefined;
      const isTBD = oppTid < 0 || !oppMeta;
      opponent = {
        tid: oppTid,
        abbrev: isTBD ? 'TBD' : oppMeta?.abbrev ?? '',
        logoUrl: isTBD ? undefined : oppMeta?.logoUrl,
        isHome,
      };
    }

    result.push({
      day: d.getUTCDate(),
      hasGame: !!game,
      isB2B,
      activity,
      description,
      opponent,
      isoDate: iso,
      weekday: d.getUTCDay(),
    });
    lastWasB2BGame2 = isB2B;
    lastWasGame = !!game;
  }

  return result;
}

export type SavedDefaultState = {
  oldPlan: { intensity: number; paradigm: TrainingParadigm; auto?: boolean } | undefined;
  newPlan: { intensity: number; paradigm: TrainingParadigm; allocations: Allocations };
  matchCount: number;
};
