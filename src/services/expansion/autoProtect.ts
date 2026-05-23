// Auto-Protect-Heuristik für Expansion Draft Player Protection.
//
// User-Spec (project_expansion_draft_plan.md):
//   - Rebuilding-Team → Sortierung nach POT
//   - Contending-Team → Sortierung nach K2-OVR
//   - Hybrid 1+3: OVR/POT/Age/Contract + Bird-Rights/Mood/Salary-Fit
//
// Family-Ties: Spieler mit `relatives` auf demselben Team sind IMMER geschützt
// (CLAUDE.md: "siblings/relatives are untouchable in nepotism passes"). Geht
// über das per-Team-Protection-Limit hinaus, da der Bug-Fix sonst zerbricht.

import type { NBAPlayer } from '../../types';
import { hasFamilyOnRoster } from '../../utils/familyTies';
import { getDisplayAge, getDisplayOverall } from '../../store/playerRatingStore';

export type TeamPhase = 'rebuilding' | 'contending' | 'middle';

interface ScoreContext {
  phase: TeamPhase;
  currentYear: number;
}

// ─── Team-Phase-Detection ──────────────────────────────────────────────────
// Average K2-OVR der Top-7-Spieler eines Rosters → Phase. Schwellen orientieren
// sich am Repo-Konsens (siehe TODO §11/§12 Star-Trade-Override mit topNAvgK2).

const PHASE_TOP_N = 7;
const CONTENDING_K2_THRESHOLD = 83;
const REBUILDING_K2_THRESHOLD = 75;

export function getTeamPhase(roster: NBAPlayer[]): TeamPhase {
  if (roster.length === 0) return 'middle';
  const k2Scores = roster
    .map(p => getDisplayOverall(p))
    .sort((a, b) => b - a);
  const top = k2Scores.slice(0, PHASE_TOP_N);
  const avg = top.reduce((s, v) => s + v, 0) / top.length;
  if (avg >= CONTENDING_K2_THRESHOLD) return 'contending';
  if (avg <= REBUILDING_K2_THRESHOLD) return 'rebuilding';
  return 'middle';
}

// ─── Score-Berechnung ──────────────────────────────────────────────────────

/** Heuristische POT-Approximation. Repo hat keinen exportierten potEstimator,
 *  also: BBGM-OVR + Restjugend-Bonus. Ein 24-jähriger 65-OVR-Spieler kommt auf
 *  ~67 POT, ein 35-jähriger 80-OVR auf ~80 (kein Wachstum mehr). */
function estimatePot(player: NBAPlayer, currentYear: number): number {
  const ovr = player.overallRating ?? 60;
  const age = getDisplayAge(player, currentYear);
  const youthBonus = Math.max(0, 26 - age) * 0.5;
  return ovr + youthBonus;
}

function getYearsRemaining(player: NBAPlayer, currentYear: number): number {
  const exp = player.contract?.exp;
  if (!exp) return 0;
  return Math.max(0, exp - currentYear);
}

function isStarByAwards(player: NBAPlayer): boolean {
  const awards = player.awards ?? [];
  return awards.some(a =>
    /MVP|All-NBA|All-Star|Finals MVP|DPOY/i.test(a.type)
  );
}

function hasNegativeMood(player: NBAPlayer): boolean {
  const traits = (player.moodTraits ?? []) as string[];
  return traits.some(t =>
    typeof t === 'string' && /Disloyal|Selfish|Trade Demand|Unhappy/i.test(t)
  );
}

/** Score in [0, 100]. Höher = wichtiger zu schützen. Phase-abhängig gewichtet. */
export function computeProtectScore(player: NBAPlayer, ctx: ScoreContext): number {
  const ovrK2 = getDisplayOverall(player);
  const potK2 = getDisplayOverall({ ...player, overallRating: estimatePot(player, ctx.currentYear) });
  const age = getDisplayAge(player, ctx.currentYear);
  const yearsLeft = getYearsRemaining(player, ctx.currentYear);
  const isStar = isStarByAwards(player);
  const negativeMood = hasNegativeMood(player);

  const ovrScore = Math.min(100, ovrK2);
  const potScore = Math.min(100, potK2);
  const youthScore = Math.max(0, Math.min(100, (28 - age) * 8));
  const contractScore = Math.min(100, yearsLeft * 25);
  const starBonus = isStar ? 15 : 0;
  const moodPenalty = negativeMood ? -10 : 0;

  let weighted: number;
  switch (ctx.phase) {
    case 'contending':
      weighted = ovrScore * 0.8 + contractScore * 0.2 + starBonus;
      break;
    case 'rebuilding':
      weighted = potScore * 0.5 + youthScore * 0.3 + contractScore * 0.2;
      break;
    case 'middle':
    default:
      weighted = ovrScore * 0.4 + potScore * 0.3 + youthScore * 0.15 + contractScore * 0.15;
      break;
  }

  return Math.max(0, Math.min(100, weighted + starBonus + moodPenalty));
}

// ─── Auto-Select ───────────────────────────────────────────────────────────

export interface ProtectionResult {
  protected: string[];        // player.internalId[]
  exposed: string[];          // alle anderen aus dem Roster
  forcedFamily: string[];     // protected wegen relatives (subset von protected)
  phase: TeamPhase;
}

/** Wählt automatisch protectLimit Spieler eines Teams aus. Family-Ties haben
 *  Vorrang und werden auch über das Limit hinaus geschützt (CLAUDE.md). */
export function autoSelectProtections(
  roster: NBAPlayer[],
  perTeamLimit: number,
  currentYear: number,
): ProtectionResult {
  const phase = getTeamPhase(roster);
  const ctx: ScoreContext = { phase, currentYear };

  // 1. Family-Lock: Spieler mit Verwandten AUF DEMSELBEN ROSTER sind unkündbar.
  //    Match per Name (BBGM pid != internalId), siehe utils/familyTies.ts.
  const familyProtected = roster
    .filter(p => hasFamilyOnRoster(p, roster))
    .map(p => p.internalId);

  // 2. Score-sortierte verbleibende Slots
  const remainingSlots = Math.max(0, perTeamLimit - familyProtected.length);
  const familyIds = new Set(familyProtected);
  const candidates = roster
    .filter(p => !familyIds.has(p.internalId))
    .map(p => ({ p, score: computeProtectScore(p, ctx) }))
    .sort((a, b) => b.score - a.score);

  const scoreProtected = candidates
    .slice(0, remainingSlots)
    .map(c => c.p.internalId);

  const protectedSet = new Set([...familyProtected, ...scoreProtected]);
  const exposed = roster
    .filter(p => !protectedSet.has(p.internalId))
    .map(p => p.internalId);

  return {
    protected: [...protectedSet],
    exposed,
    forcedFamily: familyProtected,
    phase,
  };
}

/** Batch-Variante für alle Teams einer Liga. Wird beim Phase-Enter für
 *  AI-Teams silent aufgerufen, damit nur das User-Team manuell wählen muss. */
export function autoSelectAllTeams(
  allPlayers: NBAPlayer[],
  teamIds: number[],
  perTeamLimit: number,
  currentYear: number,
  excludeTids: number[] = [],
): Record<number, ProtectionResult> {
  const result: Record<number, ProtectionResult> = {};
  for (const tid of teamIds) {
    if (excludeTids.includes(tid)) continue;
    const roster = allPlayers.filter(p => p.tid === tid);
    if (roster.length === 0) continue;
    result[tid] = autoSelectProtections(roster, perTeamLimit, currentYear);
  }
  return result;
}
