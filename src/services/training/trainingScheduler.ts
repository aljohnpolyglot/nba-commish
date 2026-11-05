/**
 * Training Scheduler — auto-generates a year of training plans for a team.
 * Pairs with src/services/gameScheduler.ts: every time a season schedule is
 * generated, this runs to fill each team's `trainingCalendar` with sensible
 * defaults the user can override per-day from the Training Center.
 *
 * Phase awareness follows the saved league calendar for camp, preseason,
 * regular season, deadline, playoffs, free agency, and offseason windows.
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

import type { Game, LeagueStats, NBATeam } from '../../types';
import { getLeagueCalendarDates } from '../leagueCalendar';
import { getTradeDeadlineDate, isInFreeAgencyWindow } from '../../utils/dateUtils';

type Paradigm = 'Balanced' | 'Offensive' | 'Defensive' | 'Biometrics' | 'Recovery';
type Allocations = { offense: number; defense: number; conditioning: number; recovery: number; systemFocus?: string[] };

interface DailyPlan {
  intensity: number;
  paradigm: Paradigm;
  allocations: Allocations;
  auto?: boolean;
  version?: number;
}

// v5: preseason defaults are lighter; auto-schedule emits ONLY the Balanced paradigm, with intensity alone
// distinguishing pre-game / regular / post-game / post-B2B. Recovery, Biometrics,
// Offensive, Defensive paradigms are user-only — auto cells always render
// identically to a user-set Balanced day so the schedule reads as one uniform
// surface. Bumping the version triggers re-autofill of any older auto-plans.
export const TRAINING_CALENDAR_VERSION = 6;

export function getTrainingCalendarScheduleKey(schedule: Game[]): string {
  let hash = 2166136261;
  for (const game of schedule) {
    const token = `${String(game.date).slice(0, 10)}|${game.homeTid}|${game.awayTid}|${game.gid}|${game.isPlayoff ? 1 : 0}|${game.competitionId ?? ''}`;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${schedule.length}:${hash >>> 0}`;
}

function isTeamTrainingGame(game: Game, teamId: number): boolean {
  if (game.homeTid !== teamId && game.awayTid !== teamId) return false;
  return !(
    game.isAllStar
    || game.isRisingStars
    || game.isCelebrityGame
    || game.isDunkContest
    || game.isThreePointContest
    || (game as Game & { isSkillsChallenge?: boolean }).isSkillsChallenge
  );
}

export function haveCurrentTrainingCalendars(
  teams: NBATeam[],
  schedule: Game[],
  currentDate: string,
  daysAhead = 365,
  completedPostseason = false,
): boolean {
  if (teams.length === 0) return true;
  const expectedScheduleKey = getTrainingCalendarScheduleKey(schedule);
  const currentTime = new Date(`${String(currentDate).slice(0, 10)}T00:00:00Z`).getTime();
  return teams.every(team => {
    const generation = team.trainingCalendarGeneration;
    const hasUpcomingUnplayedTeamGame = schedule.some(game => {
      if (game.played || (completedPostseason && game.isPlayoff) || !isTeamTrainingGame(game, team.id)) return false;
      const gameTime = new Date(`${String(game.date).slice(0, 10)}T00:00:00Z`).getTime();
      return Number.isFinite(gameTime) && Number.isFinite(currentTime) && gameTime >= currentTime;
    });
    if (
      generation?.version !== TRAINING_CALENDAR_VERSION
      || (generation.scheduleKey !== expectedScheduleKey && hasUpcomingUnplayedTeamGame)
      || generation.daysAhead < daysAhead
    ) {
      return false;
    }
    const anchorTime = new Date(`${String(generation.anchorDate ?? '').slice(0, 10)}T00:00:00Z`).getTime();
    if (!Number.isFinite(currentTime) || !Number.isFinite(anchorTime)) return false;
    const daysSinceAnchor = Math.floor((currentTime - anchorTime) / 86_400_000);
    return daysSinceAnchor >= -30 && daysSinceAnchor <= Math.max(30, generation.daysAhead - 180);
  });
}

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

type Phase = 'training_camp' | 'preseason' | 'regular' | 'trade_deadline' | 'playoffs' | 'offseason' | 'free_agency';

function phaseFromDate(d: Date, leagueStats?: LeagueStats, schedule: Game[] = []): Phase {
  const time = d.getTime();
  const year = d.getUTCFullYear();
  const candidateSeasons = [year - 1, year, year + 1, year + 2];
  for (const season of candidateSeasons) {
    const deadline = getTradeDeadlineDate(season, leagueStats as any).getTime();
    if (Math.abs(time - deadline) <= 2 * 86_400_000) return 'trade_deadline';
  }
  for (const season of candidateSeasons) {
    const dates = getLeagueCalendarDates(season, leagueStats);
    const campStart = dates.trainingCampStart ?? dates.preseasonStart;
    const preseasonStart = dates.preseasonStart ?? campStart;
    if (campStart && preseasonStart && time >= campStart.getTime() && time < preseasonStart.getTime()) return 'training_camp';
    if (preseasonStart && time >= preseasonStart.getTime() && time < dates.regularSeasonStart.getTime()) return 'preseason';
    if (time >= dates.regularSeasonStart.getTime() && time <= dates.regularSeasonEnd.getTime()) return 'regular';
    if (time >= dates.playoffStart.getTime() && time < dates.rollover.getTime()) return 'playoffs';
  }
  return isInFreeAgencyWindow(d, leagueStats?.year ?? year, leagueStats as any, schedule)
    ? 'free_agency'
    : 'offseason';
}

/**
 * Build a training calendar centered on `startISO` for the given team.
 *
 * Walks `lookbackDays` BEFORE startISO and `daysAhead` AFTER, so past months
 * the user navigates to still have persisted plans. Without lookback, AUTOFILL
 * only writes future plans — past months would lose their auto-paradigm tints
 * the moment AUTOFILL re-fires from a later sim date (e.g. when playoff games
 * get injected and the schedule grows).
 *
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
  existing?: Record<string, DailyPlan>,
  /** Days to walk BEFORE startISO so past months persist. Default 8 months. */
  lookbackDays: number = 240,
  leagueStats?: LeagueStats,
): Record<string, DailyPlan> {
  const start = new Date(`${startISO}T00:00:00Z`);
  if (isNaN(start.getTime())) return existing ?? {};

  // Window start is `lookbackDays` before the anchor; total walk is lookback + ahead.
  const windowStart = new Date(start);
  windowStart.setUTCDate(start.getUTCDate() - lookbackDays);
  const totalDays = lookbackDays + daysAhead;

  // Include played games — past months need their game days marked too. Without
  // this past-game cells lose their game-day paradigm and look like generic
  // practice days, which doesn't match what actually happened.
  const teamGameDays = new Set<string>();
  for (const g of schedule) {
    if (!isTeamTrainingGame(g, teamId)) continue;
    teamGameDays.add(g.date.slice(0, 10));
  }

  const result: Record<string, DailyPlan> = { ...(existing ?? {}) };

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(windowStart);
    d.setUTCDate(windowStart.getUTCDate() + i);
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

    const phase = phaseFromDate(d, leagueStats, schedule);

    // No team training during these windows — leave the day empty (decay applies).
    if (phase === 'offseason' || phase === 'free_agency' || phase === 'trade_deadline') {
      delete result[iso];
      continue;
    }

    // Day after a B2B → minimal load. Same Balanced paradigm, very low intensity.
    if (wasB2BYesterday) {
      result[iso] = planFor('Balanced', 15);
      continue;
    }

    // Day after a single game → light recovery via low-intensity Balanced.
    if (wasYesterdayGame) {
      result[iso] = planFor('Balanced', 25);
      continue;
    }

    // Day before a game → light pre-game Balanced.
    if (isTomorrowGame) {
      result[iso] = planFor('Balanced', 25);
      continue;
    }

    // Phase-default plans. All auto-fills are Balanced — intensity carries the
    // load story, not the paradigm. Specialties (Recovery/Biometrics/Offensive/
    // Defensive) are user-only.
    if (phase === 'training_camp') {
      const dow = d.getUTCDay();
      if (dow === 0) { delete result[iso]; continue; } // Sunday off
      if (dow === 6) { result[iso] = planFor('Balanced', 25); continue; } // Saturday light
      result[iso] = planFor('Balanced', 75);
      continue;
    }

    if (phase === 'preseason') {
      const dow = d.getUTCDay();
      if (dow === 0) { delete result[iso]; continue; }
      result[iso] = planFor('Balanced', 40);
      continue;
    }

    if (phase === 'playoffs') {
      // Eliminated check — if the team has no upcoming games from this date onward
      // within the playoffs window, treat as offseason (empty).
      const hasUpcomingPlayoffGame = (() => {
        for (let look = 0; look <= 14; look++) {
          const d2 = new Date(d); d2.setUTCDate(d.getUTCDate() + look);
          if (teamGameDays.has(isoDate(d2))) return true;
        }
        return false;
      })();
      if (!hasUpcomingPlayoffGame) { delete result[iso]; continue; }
      result[iso] = planFor('Balanced', 25);
      continue;
    }

    // Regular season — Balanced @ 50%, Sunday off.
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
  daysAhead: number = 365,
  leagueStats?: LeagueStats,
): NBATeam[] {
  const scheduleKey = getTrainingCalendarScheduleKey(schedule);
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
      240,
      leagueStats,
    ),
    trainingCalendarGeneration: {
      version: TRAINING_CALENDAR_VERSION,
      anchorDate: startISO.slice(0, 10),
      daysAhead,
      scheduleKey,
    },
  }));
}
