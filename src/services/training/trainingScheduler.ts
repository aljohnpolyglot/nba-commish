/**
 * Training Scheduler — auto-generates a year of training plans for a team.
 * Pairs with src/services/gameScheduler.ts: every time a season schedule is
 * generated, this runs to fill each team's `trainingCalendar` with sensible
 * defaults the user can override per-day from the Training Center.
 *
 * Phase awareness (per docs/training.md + simulation.ts brainstorm):
 *  - Training Camp (Aug 15 – Sep 30): high-intensity Full Training, builds System Familiarity.
 *  - Preseason (Oct 1 – Oct 23): mixed — game days, scrimmages, balanced practice.
 *  - Regular Season (Oct 24 – Apr 13): Balanced practice, tune around games.
 *  - Trade Deadline (~Feb 15): NO team training that week — front office work only.
 *  - Playoffs (Apr 16 – Jun 20): Recovery + opponent film. Minimal physical load.
 *  - Free Agency (Jul 1 – Jul 31): NO team training — players negotiating, traveling.
 *  - Offseason (Jun 21 – Jun 30 + Aug 1 – Aug 14): NO team training, individual work only.
 *
 * Proximity logic:
 *  - Day OF a game: Game (no training plan written — game day handled at render).
 *  - Day after a B2B: mandatory pure Recovery (overrides any default).
 *  - Day after a single game: Recovery Practice / light load.
 *  - Day before a game: Shootaround.
 *
 * User overrides: any plan whose `auto: false` (or absent) is treated as user-set.
 * Auto-fill skips those entries to never clobber user edits.
 */

import type { Game, NBATeam } from '../../types';

type Paradigm = 'Balanced' | 'Offensive' | 'Defensive' | 'Biometrics' | 'Recovery';
type Allocations = { offense: number; defense: number; conditioning: number; recovery: number; systemFocus?: string[] };

interface DailyPlan {
  intensity: number;
  paradigm: Paradigm;
  allocations: Allocations;
  auto?: boolean;
  version?: number;
}

export const TRAINING_CALENDAR_VERSION = 2;

// Allocation presets per paradigm — match DailyPlanModal PARADIGM_TEMPLATES.
const PRESETS: Record<Paradigm, { intensity: number; allocations: Allocations }> = {
  Balanced:   { intensity: 50, allocations: { offense: 30, defense: 30, conditioning: 20, recovery: 20 } },
  Offensive:  { intensity: 50, allocations: { offense: 60, defense: 10, conditioning: 10, recovery: 20 } },
  Defensive:  { intensity: 50, allocations: { offense: 10, defense: 60, conditioning: 10, recovery: 20 } },
  Biometrics: { intensity: 65, allocations: { offense: 10, defense: 10, conditioning: 60, recovery: 20 } },
  Recovery:   { intensity: 15, allocations: { offense: 5,  defense: 5,  conditioning: 10, recovery: 80 } },
};

function planFor(paradigm: Paradigm, intensityOverride?: number): DailyPlan {
  const preset = PRESETS[paradigm];
  return {
    intensity: intensityOverride ?? preset.intensity,
    paradigm,
    allocations: preset.allocations,
    auto: true,
    version: TRAINING_CALENDAR_VERSION,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Phase windows — uses calendar-month boundaries (mirrors src/constants.ts SEASON_DATES).
type Phase = 'training_camp' | 'preseason' | 'regular' | 'trade_deadline' | 'playoffs' | 'offseason' | 'free_agency';

function phaseFromDate(d: Date): Phase {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  // Trade deadline week — Feb 13–17 (around Feb 15 per constants.ts).
  if (m === 2 && day >= 13 && day <= 17) return 'trade_deadline';
  // Aug 15 – Sep 30
  if ((m === 8 && day >= 15) || m === 9) return 'training_camp';
  // Oct 1 – Oct 23
  if (m === 10 && day <= 23) return 'preseason';
  // Apr 16 – Jun 20
  if ((m === 4 && day >= 16) || m === 5 || (m === 6 && day <= 20)) return 'playoffs';
  // Jul 1 – Jul 31
  if (m === 7) return 'free_agency';
  // Jun 21 – Jun 30 + Aug 1 – Aug 14
  if ((m === 6 && day >= 21) || (m === 8 && day <= 14)) return 'offseason';
  return 'regular';
}

/**
 * Build a one-year training calendar starting from `startISO` for the given team.
 * Pulls game days from the schedule and populates surrounding days with proximity-aware plans.
 * Phases without team training (offseason, FA, trade deadline week) are intentionally LEFT EMPTY —
 * the daily familiarity tick treats missing plans as "no work done" (slow decay).
 *
 * Eliminated-team awareness: if the team has no upcoming games in the playoffs phase,
 * those days are treated as offseason (empty) — no point training when you're done.
 */
export function autoGenerateTrainingCalendar(
  schedule: Game[],
  teamId: number,
  startISO: string,
  daysAhead: number = 365,
  /** Existing calendar — auto-fill skips any entry where `auto` is falsy (user-set). */
  existing?: Record<string, DailyPlan>
): Record<string, DailyPlan> {
  const start = new Date(`${startISO}T00:00:00Z`);
  if (isNaN(start.getTime())) return existing ?? {};

  const teamGameDays = new Set<string>();
  for (const g of schedule) {
    if (g.played) continue;
    if (g.homeTid !== teamId && g.awayTid !== teamId) continue;
    if (g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isDunkContest || g.isThreePointContest) continue;
    teamGameDays.add(g.date.slice(0, 10));
  }

  const result: Record<string, DailyPlan> = { ...(existing ?? {}) };

  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = isoDate(d);

    // Skip if user has already set a plan for this day.
    const prior = result[iso];
    if (prior && prior.auto === false) continue;

    const yesterday = new Date(d); yesterday.setUTCDate(d.getUTCDate() - 1);
    const tomorrow = new Date(d); tomorrow.setUTCDate(d.getUTCDate() + 1);
    const dayBeforeYesterday = new Date(d); dayBeforeYesterday.setUTCDate(d.getUTCDate() - 2);

    const isGameDay = teamGameDays.has(iso);
    const wasYesterdayGame = teamGameDays.has(isoDate(yesterday));
    const wasDayBeforeGame = teamGameDays.has(isoDate(dayBeforeYesterday));
    const isB2BNight2 = isGameDay && wasYesterdayGame;
    const wasB2BYesterday = wasYesterdayGame && wasDayBeforeGame;
    const isTomorrowGame = teamGameDays.has(isoDate(tomorrow));

    // Game days don't get a training plan — handled at render time.
    if (isGameDay) {
      delete result[iso];
      continue;
    }

    const phase = phaseFromDate(d);

    // No team training during these windows — leave the day empty (decay applies).
    if (phase === 'offseason' || phase === 'free_agency' || phase === 'trade_deadline') {
      delete result[iso];
      continue;
    }

    // Day after a B2B → mandatory pure Recovery (overrides phase default).
    if (wasB2BYesterday) {
      result[iso] = planFor('Recovery');
      continue;
    }

    // Day after a single game → light recovery practice.
    if (wasYesterdayGame) {
      result[iso] = planFor('Recovery', 25);
      continue;
    }

    // Day before a game → light shootaround load (bias toward Balanced low intensity).
    if (isTomorrowGame) {
      result[iso] = { ...planFor('Balanced', 25), auto: true };
      continue;
    }

    // Phase-default plans.
    if (phase === 'training_camp') {
      // High-intensity scrimmages, alternating Off/Def emphasis Mon-Fri, lighter weekend.
      const dow = d.getUTCDay();
      if (dow === 0) { delete result[iso]; continue; } // Sunday off
      if (dow === 6) { result[iso] = planFor('Recovery'); continue; }
      result[iso] = planFor(dow % 2 === 0 ? 'Offensive' : 'Defensive', 75);
      continue;
    }

    if (phase === 'preseason') {
      // Balanced + a couple of Biometrics days mid-week.
      const dow = d.getUTCDay();
      if (dow === 0) { delete result[iso]; continue; }
      if (dow === 3) { result[iso] = planFor('Biometrics', 60); continue; }
      result[iso] = planFor('Balanced', 60);
      continue;
    }

    if (phase === 'playoffs') {
      // Eliminated check — if the team has no upcoming games from this date onward
      // within the playoffs window, treat as offseason (empty). Otherwise minimal
      // physical / opponent prep.
      const hasUpcomingPlayoffGame = (() => {
        // Walk forward up to 14 days looking for a scheduled game for this team.
        for (let look = 0; look <= 14; look++) {
          const d2 = new Date(d); d2.setUTCDate(d.getUTCDate() + look);
          if (teamGameDays.has(isoDate(d2))) return true;
        }
        return false;
      })();
      if (!hasUpcomingPlayoffGame) { delete result[iso]; continue; }
      result[iso] = planFor('Recovery', 25);
      continue;
    }

    // Regular season default — Balanced 4-day-on / Sunday off.
    const dow = d.getUTCDay();
    if (dow === 0) { delete result[iso]; continue; }
    result[iso] = planFor('Balanced', 50);
  }

  return result;
}

/**
 * Convenience: regenerate calendars for ALL teams. Called from gameLogic after
 * a season schedule is freshly generated.
 */
export function autoGenerateTrainingCalendarsForAllTeams(
  teams: NBATeam[],
  schedule: Game[],
  startISO: string,
  daysAhead: number = 365
): NBATeam[] {
  return teams.map(t => ({
    ...t,
    trainingCalendar: autoGenerateTrainingCalendar(
      schedule,
      t.id,
      startISO,
      daysAhead,
      Object.fromEntries(
        Object.entries((t.trainingCalendar as any) ?? {}).filter(([, plan]: [string, any]) => plan?.auto === false)
      ) as any,
    ),
  }));
}
