/**
 * Training Tick — daily progression of System Familiarity per docs/training.md.
 *
 * What this DOES today:
 *  - Reads each team's `trainingCalendar` (Training Center daily plans).
 *  - Picks the plan for the current sim day; falls back to a sensible default.
 *  - Increments `team.systemFamiliarity.{offense, defense}` based on paradigm.
 *  - Decays familiarity slowly when no plan is set (use it or lose it).
 *  - Caps familiarity at 100, floors at 0.
 *
 * What this does NOT do yet (deferred Phase 3 work — needs progressionEngine integration):
 *  - Funnel-Model K2 deltas via getFocusWeights(devFocus).
 *  - Mentor multipliers (70/29 score, IQ + Professionalism buffer).
 *  - Genetic Ceiling enforcement on physical attributes.
 *  - Age decay curve (U-23 / Prime / Vet biometric handling).
 *  - Strength → Weight loop.
 *  - Fatigue / injury risk from intensity.
 *
 * The familiarity tick alone is safe to run on every day advance because it
 * never touches player ratings, never modifies the schedule, never affects
 * sim outcomes — it only feeds the existing `computeTeamProficiency` star
 * renderer (offBoost / defBoost) and is already gated to a max +10 score bonus.
 */

import type { GameState, NBATeam, NBAPlayer } from '../../types';
import type { TrainingParadigm, Allocations, DailyPlan } from '../../TeamTraining/types';

// Familiarity deltas per paradigm (per day). Values are tuned so a team that
// trains "Offensive" hard for ~2 weeks reaches mastery (+10 points = ½★) on
// offense systems; a team that ignores training sees gradual decay.
const PARADIGM_DELTA: Record<TrainingParadigm, { off: number; def: number }> = {
  Balanced:   { off: 0.5,  def: 0.5  },
  Offensive:  { off: 1.5,  def: -0.2 },  // sharpens offense, defense rusts slightly
  Defensive:  { off: -0.2, def: 1.5  },
  Biometrics: { off: -0.1, def: -0.1 },  // physical day, no system work
  Recovery:   { off: 0.0,  def: 0.0  },  // film study only, no familiarity gain
};

// Default decay when no plan is logged for the day.
const NO_PLAN_DECAY = -0.3;

// Intensity scales the gain — lighter sessions do less, harder sessions slightly more.
function intensityFactor(intensity: number): number {
  // 0 → 0, 50 → 1.0, 100 → 1.4 (saturating, anti-cheese)
  if (intensity <= 0) return 0;
  if (intensity >= 100) return 1.4;
  return 0.4 + (intensity / 50) * 0.6;
}

interface PlanLike {
  intensity: number;
  paradigm: TrainingParadigm;
  allocations: Allocations;
}

/** Look up today's plan by ISO date `YYYY-MM-DD`. */
function pickPlanForDay(
  calendar: Record<string, PlanLike> | undefined,
  iso: string
): PlanLike | null {
  if (!calendar) return null;
  return calendar[iso] ?? null;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function defensiveAuraDelta(plan: PlanLike | null): number {
  if (!plan) return -0.25;

  const factor = intensityFactor(plan.intensity ?? 50);
  const defenseShare = Math.max(0, Math.min(100, plan.allocations?.defense ?? 30)) / 100;

  if (plan.paradigm === 'Defensive') return 0.45 * factor + defenseShare * 0.35;
  if (plan.paradigm === 'Balanced') return 0.08 * factor + defenseShare * 0.10;
  if (plan.paradigm === 'Recovery') return -0.10;
  return -0.20;
}

/**
 * Apply ONE day's familiarity tick to a single team.
 * Pure — returns updated team or the original if no change.
 */
export function tickTeamFamiliarity(team: NBATeam, iso: string): NBATeam {
  const plan = pickPlanForDay(team.trainingCalendar as any, iso);

  let offDelta: number;
  let defDelta: number;

  if (!plan) {
    offDelta = NO_PLAN_DECAY;
    defDelta = NO_PLAN_DECAY;
  } else {
    const { off, def } = PARADIGM_DELTA[plan.paradigm] ?? PARADIGM_DELTA.Balanced;
    const factor = intensityFactor(plan.intensity ?? 50);
    offDelta = off * factor;
    defDelta = def * factor;
  }

  // Default 0 — familiarity is EARNED via training, not innate. A team that
  // never trains stays at 0 (and gets no proficiency boost).
  const current = team.systemFamiliarity ?? { offense: 0, defense: 0 };
  const currentAura = team.defensiveAura ?? 50;
  const next = {
    offense: clamp(current.offense + offDelta),
    defense: clamp(current.defense + defDelta),
  };
  const nextAura = clamp(currentAura + defensiveAuraDelta(plan));

  // Skip allocation if values didn't actually change (rounding noise within 0.01).
  if (
    Math.abs(next.offense - current.offense) < 0.01 &&
    Math.abs(next.defense - current.defense) < 0.01 &&
    Math.abs(nextAura - currentAura) < 0.01
  ) {
    return team;
  }

  return { ...team, systemFamiliarity: next, defensiveAura: nextAura };
}

/**
 * Apply N days of familiarity ticks across all teams. Idempotent — safe to call
 * after gameLogic computes daysToAdvance.
 */
export function applyDailyFamiliarityTick(
  teams: NBATeam[],
  startDate: string,
  daysToAdvance: number
): NBATeam[] {
  if (daysToAdvance <= 0) return teams;

  let working = teams;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return teams;

  for (let i = 0; i < daysToAdvance; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i + 1);
    const iso = d.toISOString().slice(0, 10);
    working = working.map(t => tickTeamFamiliarity(t, iso));
  }

  return working;
}

/**
 * Clean Slate (full reset) — zeros out a team's familiarity. Reserved for
 * eventual coach changes / wholesale system overhauls. Roster trades use
 * applyRosterChangeFamiliarity (partial penalty) instead.
 */
export function resetTeamFamiliarity(teams: NBATeam[], teamId: number): NBATeam[] {
  return teams.map(t =>
    t.id === teamId ? { ...t, systemFamiliarity: { offense: 0, defense: 0 }, defensiveAura: 50 } : t
  );
}

export interface RosterMove {
  playerId: string;
  fromTid: number;
  toTid: number;
  /** Years the player spent on the source team before moving. Higher = bigger familiarity toll. */
  ywt: number;
}

/**
 * Partial Clean Slate per docs/training.md §2 + user clarification:
 *  - "Not entirely clean slate" — penalty SCALES with departing player's ywt.
 *  - "Unless replaced with a player who knows the system" — same-system arrivals
 *    OFFSET destination dilution by transferring their tenure knowledge.
 *
 * Source team:  loses familiarity proportional to leaver's ywt (cap +8 per leaver).
 * Dest team:    small dilution per new arrival, REDUCED if both teams run the
 *               same coach system (knowledge transfers with the player).
 *
 * `getSystemFor` is injected so this stays decoupled from coachSystemStore.
 */
export function applyRosterChangeFamiliarity(
  teams: NBATeam[],
  moves: RosterMove[],
  getSystemFor?: (tid: number) => string | undefined
): NBATeam[] {
  if (!moves.length) return teams;

  // Aggregate per-team deltas.
  const offByTid = new Map<number, number>();
  const defByTid = new Map<number, number>();
  const bump = (tid: number, off: number, def: number) => {
    offByTid.set(tid, (offByTid.get(tid) ?? 0) + off);
    defByTid.set(tid, (defByTid.get(tid) ?? 0) + def);
  };

  for (const m of moves) {
    // Source loss: 1.5 points per ywt, capped at 8 (a 5+ year vet leaving = full
    // ½★ hit; a rookie leaving barely registers).
    const ywt = Math.max(0, m.ywt ?? 0);
    const sourceLoss = Math.min(8, ywt * 1.5);
    bump(m.fromTid, -sourceLoss, -sourceLoss);

    // Dest dilution: flat 1.0 "new face" cost. Same-system arrivals retain up to
    // 1.5 points of knowledge (ywt × 0.3 capped at 1.5) → net positive on big trades.
    let destDilution = 1.0;
    if (getSystemFor) {
      const fromSys = getSystemFor(m.fromTid);
      const toSys = getSystemFor(m.toTid);
      if (fromSys && toSys && fromSys === toSys) {
        const knowledgeBonus = Math.min(1.5, ywt * 0.3);
        destDilution -= knowledgeBonus;
      }
    }
    if (destDilution > 0) bump(m.toTid, -destDilution, -destDilution);
    else if (destDilution < 0) bump(m.toTid, -destDilution, -destDilution); // net positive bump
  }

  return teams.map(t => {
    const off = offByTid.get(t.id) ?? 0;
    const def = defByTid.get(t.id) ?? 0;
    if (off === 0 && def === 0) return t;
    const current = t.systemFamiliarity ?? { offense: 0, defense: 0 };
    return {
      ...t,
      systemFamiliarity: {
        offense: clamp(current.offense + off),
        defense: clamp(current.defense + def),
      },
    };
  });
}

/**
 * Daily player fatigue tick. Workload comes from training only — game-day fatigue
 * is tracked separately by the sim. Recovery edge case (docs/training.md):
 *   "If a player is set to High Intensity but plays 0 minutes in a game, they
 *    treat the game as a rest day, resetting fatigue compounding."
 *
 * Implementation: fatigue accumulates per training day according to plan intensity
 * × per-player intensity multiplier; decays on Recovery / no plan. Game days
 * don't add fatigue here — sim handles those — so a 0-minute night with high
 * individual setting naturally doesn't compound.
 */
const INDIVIDUAL_INTENSITY_MULT: Record<string, number> = {
  Rest: 0,
  Half: 0.5,
  Normal: 1.0,
  Double: 1.6,
};

// Reads the player's most recent regular-season MPG from their stats array.
// 0 if no games this season (rookies pre-debut, G-League shuttlers, IL guys).
function getRecentMpg(player: NBAPlayer): number {
  const stats = ((player as any).stats ?? []).filter((s: any) => !s.playoffs);
  if (stats.length === 0) return 0;
  const latest = stats[stats.length - 1];
  const gp = Number(latest?.gp ?? 0);
  if (gp <= 0) return 0;
  return Number(latest?.min ?? 0) / gp;
}

// Bench-player exemption: real NBA pattern — non-rotation guys can train hard
// because they aren't grinding game minutes. 0 mpg → 0.4× fatigue accumulation,
// 25+ mpg → 1.0×. Scaling only applies to fatigue GAIN (delta > 0); rest-day
// decay isn't reduced — bench guys still recover normally.
function recentMinutesFatigueScale(mpg: number): number {
  return 0.4 + Math.min(1, Math.max(0, mpg) / 25) * 0.6;
}

export function tickPlayerFatigue(
  player: NBAPlayer,
  team: NBATeam | undefined,
  iso: string
): NBAPlayer {
  const calendar = team?.trainingCalendar as Record<string, PlanLike> | undefined;
  const plan = calendar?.[iso];
  const indMult = INDIVIDUAL_INTENSITY_MULT[player.trainingIntensity ?? 'Normal'] ?? 1.0;

  // Modern NBA sport-science calibration: pro recovery teams (cryo, hyperbaric,
  // film/load monitoring, individualized nutrition) keep elite athletes fresh
  // far better than the 90s grind era. Fatigue accumulates slowly under normal
  // load; rest decays fast. Goal: a starter on Normal + Balanced sits in the
  // 20–40 fatigue band most of the season unless GM consistently overrides to
  // Double. Future @NEW_FEATURES.md "Coaching / Training Dev staff" tier should
  // add team-level recovery multipliers on top of these baselines.
  let delta: number;
  if (!plan) {
    // No training scheduled (offseason / FA / trade deadline / Sunday). Strong recovery.
    delta = -5.0;
  } else if (plan.paradigm === 'Recovery') {
    delta = -4.0;
  } else {
    // Training day. Fatigue gain ∝ intensity × paradigm load × individual setting.
    // Base lowered from 2.5 → 1.5 — modern teams don't burn out from drills.
    const base = (plan.intensity ?? 50) / 50; // 0 → 0, 50 → 1, 100 → 2
    const paradigmLoad = plan.paradigm === 'Biometrics' ? 1.3 : 1.0;
    delta = 1.5 * base * paradigmLoad * indMult;
  }

  // Bench-player exemption — only scales positive deltas (fatigue gain).
  if (delta > 0) {
    delta *= recentMinutesFatigueScale(getRecentMpg(player));
  }

  const current = player.trainingFatigue ?? 0;
  const next = Math.max(0, Math.min(100, current + delta));
  if (Math.abs(next - current) < 0.05) return player;
  return { ...player, trainingFatigue: next };
}

export function applyDailyFatigueTick(
  players: NBAPlayer[],
  teams: NBATeam[],
  startDate: string,
  daysToAdvance: number
): NBAPlayer[] {
  if (daysToAdvance <= 0) return players;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return players;

  const teamById = new Map<number, NBATeam>();
  for (const t of teams) teamById.set(t.id, t);

  let working = players;
  for (let i = 0; i < daysToAdvance; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i + 1);
    const iso = d.toISOString().slice(0, 10);
    working = working.map(p => {
      if (p.status && p.status !== 'Active') return p;
      return tickPlayerFatigue(p, teamById.get(p.tid), iso);
    });
  }
  return working;
}

/**
 * Resolve mentor relationships after a trade. If a mentee was traded away from
 * their mentor (or vice versa), clear the dangling mentorId. Mentees keep their
 * relationship if the mentor came along for the ride.
 */
export function resolveMentorBreakage(players: any[]): any[] {
  const tidByPid = new Map<string, number>();
  for (const p of players) tidByPid.set(p.internalId, p.tid);

  return players.map(p => {
    if (!p.mentorId) return p;
    const mentorTid = tidByPid.get(p.mentorId);
    if (mentorTid === undefined) return p;            // mentor not in pool — leave alone
    if (mentorTid === p.tid) return p;                // still teammates — keep
    return { ...p, mentorId: null };                  // mentor on a different team now
  });
}
