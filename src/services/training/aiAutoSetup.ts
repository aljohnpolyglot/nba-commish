/**
 * aiAutoSetup — initial AI dev-focus + mentorship assignment.
 *
 * Runs at:
 *  - Save load when AI players have empty devFocus (one-time backfill)
 *  - Training Camp start (Aug 15) each year — refreshes mentor pairings as
 *    rookies age in and vets retire
 *
 * Skips the user's own team (GM mode). User-set focus/mentor (manually picked
 * via the Roster tab) is preserved — we only fill EMPTY slots.
 */

import type { NBAPlayer, NBATeam } from '../../types';

/** Map BBGM-style position → an archetype string the dev-focus picker accepts.
 *  Picks reflect the modal's curated lists for each position. */
function pickDevFocusForPlayer(p: NBAPlayer): string | null {
  const ratings = p.ratings?.[p.ratings.length - 1] as any;
  if (!ratings) return null;
  const pos = (p.pos || 'F').toUpperCase();
  const tp = Number(ratings.tp ?? 50);
  const diq = Number(ratings.diq ?? 50);
  const drb = Number(ratings.drb ?? 50);
  const ins = Number(ratings.ins ?? 50);
  const oiq = Number(ratings.oiq ?? 50);
  const pss = Number(ratings.pss ?? 50);

  // Tilt toward strengths — pick the archetype whose profile best matches the
  // player's current top attributes. Falls back to "Generalist" if unclear.
  switch (pos) {
    case 'PG':
      if (pss >= 60 && oiq >= 55) return 'Primary Creator';
      if (tp >= 60) return 'Limitless Sniper';
      if (diq >= 55) return 'Two-Way PG';
      return 'Pass-First Floor Gen';
    case 'SG':
      if (tp >= 65) return 'Limitless Sniper';
      if (diq >= 55) return '3&D Guard';
      if (oiq >= 60) return 'Scoring Guard';
      return 'Volume Scorer';
    case 'SF':
      if (diq >= 58) return 'Defensive Wing';
      if (tp >= 60) return '3&D Wing';
      if (drb >= 60 && pss >= 55) return 'Point Forward';
      return 'All-Around Wing';
    case 'PF':
      if (tp >= 55) return 'Stretch Four';
      if (diq >= 60) return 'Defensive Wing';
      if (ins >= 60) return 'Athletic Four';
      return 'Two-Way Wing';
    case 'C':
      if (diq >= 60) return 'Defensive Anchor';
      if (tp >= 50) return 'Stretch Big';
      if (ins >= 65) return 'Post Specialist';
      return 'Two-Way Big';
    default:
      return 'Generalist';
  }
}

/** Pair a young player (age <= 23) with the highest-OVR vet (age >= 28) at the
 *  same position on the same team. Returns null if no suitable vet exists. */
function pickMentorForPlayer(
  player: NBAPlayer,
  teammates: NBAPlayer[],
  currentYear: number,
): string | null {
  const age = player.born?.year ? currentYear - player.born.year : (player.age ?? 25);
  if (age > 23) return null;
  const pos = (player.pos || '').toUpperCase();
  const candidates = teammates.filter(t => {
    if (t.internalId === player.internalId) return false;
    const tAge = t.born?.year ? currentYear - t.born.year : (t.age ?? 25);
    if (tAge < 28) return false;
    return (t.pos || '').toUpperCase() === pos;
  });
  if (candidates.length === 0) return null;
  // Best vet by current OVR.
  candidates.sort((a, b) => {
    const aOvr = a.ratings?.[a.ratings.length - 1]?.ovr ?? 0;
    const bOvr = b.ratings?.[b.ratings.length - 1]?.ovr ?? 0;
    return bOvr - aOvr;
  });
  return candidates[0].internalId;
}

export interface AIAutoSetupOptions {
  /** Always overwrite existing assignments (annual refresh). Default false (= backfill only). */
  overwrite?: boolean;
}

/**
 * Apply AI dev-focus + mentor auto-setup across the league.
 * Returns the updated `players` array — caller dispatches it back to state.
 */
export function applyAIAutoSetup(
  players: NBAPlayer[],
  teams: NBATeam[],
  currentYear: number,
  userTeamId: number | null | undefined,
  gameMode: string | undefined,
  options: AIAutoSetupOptions = {},
): NBAPlayer[] {
  const isGMMode = gameMode === 'gm';
  const skipTid = isGMMode && userTeamId != null ? userTeamId : -9999;

  // Group players by team for mentor lookup.
  const byTid = new Map<number, NBAPlayer[]>();
  for (const p of players) {
    if (p.tid == null) continue;
    if (!byTid.has(p.tid)) byTid.set(p.tid, []);
    byTid.get(p.tid)!.push(p);
  }

  return players.map(p => {
    if (p.tid == null) return p;
    if (p.tid === skipTid) return p; // user's team is sacred
    if (p.status !== 'Active') return p;

    const teammates = byTid.get(p.tid) ?? [];
    let next: any = p;

    // Dev focus: only fill empty unless overwrite.
    if (options.overwrite || !(p as any).devFocus) {
      const focus = pickDevFocusForPlayer(p);
      if (focus) next = { ...next, devFocus: focus };
    }

    // Mentor: pair young players with vets. Skip if already paired (unless overwrite).
    if (options.overwrite || !(p as any).mentorId) {
      const mentor = pickMentorForPlayer(p, teammates, currentYear);
      if (mentor) {
        next = { ...next, mentorId: mentor };
      }
    }

    return next;
  });
}

/**
 * Detect whether AI auto-setup should run. Returns true when at least one AI
 * team has rotation players without devFocus assigned. Lets callers fire-and-
 * forget without redundant work on every load.
 */
export function shouldRunAIAutoSetup(
  players: NBAPlayer[],
  userTeamId: number | null | undefined,
  gameMode: string | undefined,
): boolean {
  const isGMMode = gameMode === 'gm';
  const skipTid = isGMMode && userTeamId != null ? userTeamId : -9999;
  let aiPlayersWithoutFocus = 0;
  let aiPlayersTotal = 0;
  for (const p of players) {
    if (p.tid == null || p.tid === skipTid) continue;
    if (p.status !== 'Active') continue;
    aiPlayersTotal++;
    if (!(p as any).devFocus) aiPlayersWithoutFocus++;
  }
  // If at least 50% of AI players lack devFocus, run setup.
  return aiPlayersTotal > 0 && aiPlayersWithoutFocus / aiPlayersTotal > 0.5;
}
