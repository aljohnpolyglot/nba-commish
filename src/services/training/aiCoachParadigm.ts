/**
 * AI Coach Paradigm Selector — Phase 2 of COACHING_DEPTH_ROADMAP.md.
 *
 * AI teams used to drill a flat "Balanced 50%" every day. This module computes
 * a context-aware paradigm + intensity per AI team per day so the league reads
 * like real coaches running their season:
 *   - Game-day:        no plan (sim handles game-day)
 *   - Pre-game:        Recovery low intensity
 *   - Post-game:       Recovery low intensity
 *   - Training Camp:   Balanced 85 (heavy install reps)
 *   - Preseason:       Balanced 60
 *   - Playoffs:        Recovery 30 day-after-game / Offensive 70 between
 *   - Offseason:       no plan (calendar is empty in those windows)
 *   - Regular season:
 *       winPct < 0.40 → Defensive 75 (struggling teams lock down)
 *       winPct > 0.65 → Balanced 50 (load management)
 *       default       → Balanced 65
 *
 * User team is NEVER touched here — `applyDailyFamiliarityTick` skips this
 * helper for the user's team so their calendar/paradigm choices are theirs.
 *
 * Returns null when no override applies (game day, offseason gap, no signal yet
 * in early season). Caller falls back to the team's calendar plan.
 */

import type { Game, NBATeam } from '../../types';

type Paradigm = 'Balanced' | 'Offensive' | 'Defensive' | 'Biometrics' | 'Recovery';
type Allocations = {
  offense: number; defense: number; conditioning: number; recovery: number;
  systemFocus?: string[];
};

export interface AICoachPlan {
  paradigm: Paradigm;
  intensity: number;
  allocations: Allocations;
  /** True so familiarity tick treats it like an auto plan; not persisted. */
  auto: true;
}

const PRESETS: Record<Paradigm, { intensity: number; allocations: Allocations }> = {
  Balanced:   { intensity: 50, allocations: { offense: 30, defense: 30, conditioning: 20, recovery: 20 } },
  Offensive:  { intensity: 50, allocations: { offense: 60, defense: 10, conditioning: 10, recovery: 20 } },
  Defensive:  { intensity: 50, allocations: { offense: 10, defense: 60, conditioning: 10, recovery: 20 } },
  Biometrics: { intensity: 65, allocations: { offense: 10, defense: 10, conditioning: 60, recovery: 20 } },
  Recovery:   { intensity: 15, allocations: { offense: 5,  defense: 5,  conditioning: 10, recovery: 80 } },
};

function planFor(paradigm: Paradigm, intensity: number): AICoachPlan {
  const preset = PRESETS[paradigm];
  return {
    paradigm,
    intensity,
    allocations: preset.allocations,
    auto: true,
  };
}

type Phase = 'training_camp' | 'preseason' | 'regular' | 'playoffs' | 'offseason';
function phaseFromIso(iso: string): Phase {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return 'regular';
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if ((m === 8 && day >= 15) || m === 9) return 'training_camp';
  if (m === 10 && day <= 23) return 'preseason';
  if ((m === 4 && day >= 16) || m === 5 || (m === 6 && day <= 20)) return 'playoffs';
  if ((m === 6 && day >= 21) || (m === 8 && day <= 14) || m === 7) return 'offseason';
  return 'regular';
}

function gameDaysFor(schedule: Game[], teamId: number): Set<string> {
  const set = new Set<string>();
  for (const g of schedule) {
    if (g.homeTid !== teamId && g.awayTid !== teamId) continue;
    // Skip non-counting events. Cup TBD slots are also skipped — no real opponent yet.
    if (g.isPreseason || g.isExhibition || g.isAllStar || g.isRisingStars
        || g.isCelebrityGame || g.isDunkContest || g.isThreePointContest
        || g.isThroneEvent || g.isCupTBD) continue;
    set.add(g.date.slice(0, 10));
  }
  return set;
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Read the team's win% for the current season from the BBGM seasons array. */
function readWinPct(team: NBATeam, year: number): { winPct: number; gp: number } {
  const seasons: any[] = (team as any).seasons ?? [];
  const cur = seasons.find(s => s?.season === year);
  const w = Number(cur?.won ?? 0);
  const l = Number(cur?.lost ?? 0);
  const gp = w + l;
  return { winPct: gp > 0 ? w / gp : 0.5, gp };
}

/**
 * Resolve today's AI paradigm for a single team. Returns null when the team
 * should fall back to its calendar plan (e.g. game day, offseason).
 */
export function getAICoachPlanForDay(
  team: NBATeam,
  iso: string,
  schedule: Game[],
  currentYear: number
): AICoachPlan | null {
  const gameDays = gameDaysFor(schedule, team.id);
  // Game days never get a training plan — sim manages the day.
  if (gameDays.has(iso)) return null;

  const phase = phaseFromIso(iso);
  if (phase === 'offseason') return null; // calendar is empty here too

  const isPreGame = gameDays.has(shiftIso(iso, 1));
  const wasPostGame = gameDays.has(shiftIso(iso, -1));

  // Pre-game and post-game windows trump everything else.
  if (isPreGame) return planFor('Recovery', 25);
  if (wasPostGame) return planFor('Recovery', 25);

  if (phase === 'training_camp') return planFor('Balanced', 85);
  if (phase === 'preseason') return planFor('Balanced', 60);

  if (phase === 'playoffs') {
    // Eliminated AI teams don't get a phase plan — calendar will be empty,
    // so falling back to null is fine.
    return planFor('Offensive', 70);
  }

  // Regular season — record-aware paradigm.
  const { winPct, gp } = readWinPct(team, currentYear);
  if (gp < 5) return planFor('Balanced', 65); // not enough signal early
  if (winPct < 0.40) return planFor('Defensive', 75);
  if (winPct > 0.65) return planFor('Balanced', 50); // contender load mgmt
  return planFor('Balanced', 65);
}
