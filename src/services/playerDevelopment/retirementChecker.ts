import type { NBAPlayer } from '../../types';
import { getBasketballEraRules } from '../era/basketballEraRules';
import { simDebug } from '../../utils/simDebug';

export interface RetireeRecord {
  playerId: string;
  name: string;
  age: number;
  ovr: number;
  allStarAppearances: number;
  championships: number;
  careerGP: number;
  careerPts: number;
  careerReb: number;
  careerAst: number;
  isLegend: boolean; // ≥ 5 All-Star appearances
}

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function toApprox2K(rawOvr: number): number {
  return Math.min(99, Math.round(0.88 * rawOvr + 31));
}

export interface RetirementProbabilityInput {
  age: number;
  rawOvr: number;
  previousOvr?: number;
  allStarApps?: number;
  recentAllStar?: boolean;
  lastSeasonGP?: number;
  lastSeasonPPG?: number;
  lastTwoSeasonsGP?: number;
  underContract?: boolean;
  contractYearsRemaining?: number;
  injuryGames?: number;
  competitor?: boolean;
  farewellTour?: boolean;
  year?: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function calculateRetirementProbability(input: RetirementProbabilityInput): number {
  const age = Math.max(16, Number(input.age) || 16);
  const rawOvr = Number.isFinite(input.rawOvr) ? input.rawOvr : 50;
  const previousOvr = Number.isFinite(input.previousOvr) ? Number(input.previousOvr) : rawOvr;
  const lastSeasonGP = Math.max(0, Number(input.lastSeasonGP) || 0);
  const lastSeasonPPG = Math.max(0, Number(input.lastSeasonPPG) || 0);
  const lastTwoSeasonsGP = Math.max(lastSeasonGP, Number(input.lastTwoSeasonsGP) || 0);
  const allStarApps = Math.max(0, Number(input.allStarApps) || 0);
  const year = Number.isFinite(input.year) ? Number(input.year) : 2026;
  const era = getBasketballEraRules(year);

  // A weak market is not the same thing as leaving professional basketball.
  // Young fringe players belong in free agency or the external-league router;
  // retirement pressure only becomes meaningful once a player reaches the
  // veteran exit window.
  const careerExitExposure = clamp01((age - 29) / 7);
  if (careerExitExposure <= 0) return 0;

  const fatherTimeExposure = 1 / (1 + Math.exp(-(age - 36) / 3.5));
  const abilityPressure = clamp01((56 - rawOvr) / 24);
  const declinePressure = clamp01((previousOvr - rawOvr) / 12);
  const availabilityPressure = clamp01(1 - lastSeasonGP / 65);
  const twoYearAbsencePressure = clamp01(1 - lastTwoSeasonsGP / 50);
  const productionPressure = clamp01(1 - lastSeasonPPG / 18);
  const injuryPressure = clamp01((Number(input.injuryGames) || 0) / 82);

  const physicalPressure = fatherTimeExposure * era.fatherTimeDeclineMultiplier * (
    0.08
    + abilityPressure * 0.34
    + declinePressure * 0.2
    + injuryPressure * 0.16
  );
  const rolePressure = availabilityPressure * 0.18
    + twoYearAbsencePressure * 0.14
    + productionPressure * 0.1;
  const marketPressure = input.underContract
    ? -0.2 - Math.min(0.09, Math.max(0, Number(input.contractYearsRemaining) || 0) * 0.03)
    : 0.08 + twoYearAbsencePressure * 0.12;
  const achievementResistance = (input.recentAllStar ? 0.14 : 0)
    + Math.min(0.14, allStarApps * 0.012)
    + (lastSeasonGP >= 50 && lastSeasonPPG >= 15 ? 0.12 : 0);
  const competitiveResistance = input.competitor
    ? era.competitiveLongevityWeight * (0.35 + fatherTimeExposure * 0.65)
    : 0;
  const farewellPressure = input.farewellTour ? 0.28 : 0;

  return clamp01(
    physicalPressure
    + careerExitExposure * (rolePressure + marketPressure + farewellPressure)
    - careerExitExposure * (achievementResistance + competitiveResistance),
  );
}

export function retireProb(age: number, rawOvr: number, allStarApps = 0, recentAllStar = false, lastSeasonGP = 0, lastSeasonPPG = 0): number {
  return calculateRetirementProbability({
    age,
    rawOvr,
    allStarApps,
    recentAllStar,
    lastSeasonGP,
    lastSeasonPPG,
    lastTwoSeasonsGP: lastSeasonGP,
    year: 2026,
  });
}
function computeCareerTotals(player: NBAPlayer): { gp: number; pts: number; reb: number; ast: number } {
  const stats = player.stats ?? [];
  let gp = 0, pts = 0, reb = 0, ast = 0;
  for (const s of stats) {
    if ((s as any).playoffs) continue; // skip playoff rows
    gp  += s.gp  ?? 0;
    pts += s.pts ?? 0;
    reb += s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0));
    ast += s.ast ?? 0;
  }
  return { gp, pts, reb, ast };
}

function countAllStarAppearances(player: NBAPlayer): number {
  return (player.awards ?? []).filter(a => a.type === 'All-Star').length;
}

function countChampionships(player: NBAPlayer): number {
  return (player.awards ?? []).filter(a =>
    a.type === 'Champion' || a.type === 'Won Championship' || a.type === 'NBA Champion'
  ).length;
}


/** True if player made an All-Star game in the season just ended or the one before. */
function wasAllStarRecently(player: NBAPlayer, year: number): boolean {
  return (player.awards ?? []).some(
    a => a.type === 'All-Star' && a.season >= year - 1 && a.season <= year
  );
}

// ─── Farewell tour probability ────────────────────────────────────────────────
/**
 * Returns the probability [0, 1] that a player's upcoming season is their
 * farewell tour (i.e. very likely to be their last season).
 *
 * Uses the same continuous production, decline, health, market, achievement, and
 * competitive-drive model as retirement; age only supplies Father Time exposure.
 *
 * @public — exported for PlayerBioMoraleTab retirement watch display.
 */
export function farewellTourProb(age: number, rawOvr: number, allStarApps: number, recentAllStar = false): number {
  if (age < 32) return 0;
  if (recentAllStar || rawOvr >= 75) return 0;
  const fatherTimeExposure = 1 / (1 + Math.exp(-(age - 36) / 3.5));
  const base = calculateRetirementProbability({ age, rawOvr, allStarApps, recentAllStar, year: 2026 });
  const publicCareerWeight = Math.min(0.25, allStarApps * 0.018) * fatherTimeExposure;
  return Math.min(0.9, Math.max(0, base * 0.62 + publicCareerWeight));
}

export interface FarewellRecord {
  playerId: string;
  name: string;
  age: number;
  allStarAppearances: number;
  championships: number;
  isLegend: boolean; // ≥5 All-Star
}

/**
 * Flag players entering their farewell tour season.
 * Called at rollover AFTER retirement checks (retirees are already removed).
 * Sets `farewellTour: true` on qualifying players for the UPCOMING season.
 *
 * @param players  Post-retirement player list
 * @param year     The season that just ended
 */
export function runFarewellTourChecks(
  players: NBAPlayer[],
  year: number,
  options: { excludedPlayerIds?: Set<string> } = {},
): { players: NBAPlayer[]; newFarewells: FarewellRecord[] } {
  const newFarewells: FarewellRecord[] = [];

  const ACTIVE_STATUSES = new Set(['Active', 'Free Agent', 'FreeAgent']);

  const updated = players.map(p => {
    // Skip non-active, deceased, external, or already flagged
    if (options.excludedPlayerIds?.has(p.internalId)) return p;
    if (!ACTIVE_STATUSES.has((p as any).status ?? 'Active')) return p;
    if ((p as any).diedYear) return p;
    if (p.tid === -2) return p;
    if ((p as any).farewellTour) return p; // already flagged from prior rollover

    // Prefer born.year calculation — player.age can be stale/wrong from BBGM load
    const age = p.born?.year ? (year - p.born.year) : (typeof p.age === 'number' && p.age > 0 ? p.age : 0);
    if (age < 32) return p;
    const allStarCount = countAllStarAppearances(p);
    const recentStar = wasAllStarRecently(p, year);
    const regularRows = (p.stats ?? []).filter((row: any) => !row.playoffs);
    const lastSeasonRows = regularRows.filter((row: any) => Number(row.season) === year);
    const lastSeasonGP = lastSeasonRows.reduce((sum: number, row: any) => sum + Number(row.gp ?? 0), 0);
    const lastSeasonPts = lastSeasonRows.reduce((sum: number, row: any) => sum + Number(row.pts ?? 0), 0);
    const lastSeasonPPG = lastSeasonGP > 0 ? lastSeasonPts / lastSeasonGP : 0;
    const previousOvr = [...((p as any).ovrHistory ?? [])]
      .filter((entry: any) => Number(entry?.season) < year && Number.isFinite(Number(entry?.ovr)))
      .sort((left: any, right: any) => Number(right.season) - Number(left.season))[0]?.ovr;
    const prob = Math.min(0.9, calculateRetirementProbability({
      age,
      rawOvr: p.overallRating ?? 60,
      previousOvr,
      allStarApps: allStarCount,
      recentAllStar: recentStar,
      lastSeasonGP,
      lastSeasonPPG,
      lastTwoSeasonsGP: regularRows
        .filter((row: any) => Number(row.season) >= year - 1)
        .reduce((sum: number, row: any) => sum + Number(row.gp ?? 0), 0),
      underContract: !!p.contract && Number(p.contract.exp) >= year + 1 && p.tid >= 0,
      contractYearsRemaining: Math.max(0, Number(p.contract?.exp ?? year) - year),
      injuryGames: Number(p.injury?.gamesRemaining ?? 0),
      competitor: (p.moodTraits ?? []).includes('COMPETITOR'),
      year,
    }) * 0.75 + Math.min(0.18, allStarCount * 0.012));
    if (prob <= 0) return p;

    const roll = seededRandom(`farewell_${p.internalId}_${year}`);
    if (roll >= prob) return p;

    const champCount = countChampionships(p);
    newFarewells.push({
      playerId:           p.internalId,
      name:               p.name,
      age,
      allStarAppearances: allStarCount,
      championships:      champCount,
      isLegend:           allStarCount >= 5,
    });

    return { ...p, farewellTour: true } as any as NBAPlayer;
  });

  return { players: updated, newFarewells };
}

// ─── Mortality curve ─────────────────────────────────────────────────────────
function ageMortalityProb(age: number): number {
  if (age >= 105) return 1.0;
  if (age >= 100) return 0.40;
  if (age >= 95)  return 0.25;
  if (age >= 90)  return 0.18;
  if (age >= 85)  return 0.12;
  if (age >= 80)  return 0.07;
  if (age >= 75)  return 0.04;
  if (age >= 70)  return 0.02;
  if (age >= 65)  return 0.01;
  return 0;
}

export interface MortalityRecord {
  playerId: string;
  name: string;
  age: number;
  diedYear: number;
}

/** Roll mortality for all retired living players. Called after HOF checks. */
export function runMortalityChecks(
  players: NBAPlayer[],
  year: number,
): { players: NBAPlayer[]; deaths: MortalityRecord[] } {
  const deaths: MortalityRecord[] = [];

  const updated = players.map(p => {
    if ((p as any).status !== 'Retired') return p;
    if ((p as any).diedYear) return p;

    const age = year - (p.born?.year ?? 2000);
    const prob = ageMortalityProb(age);
    if (prob <= 0) return p;

    const roll = seededRandom(`died_${p.internalId}_${year}`);
    if (roll >= prob) return p;

    deaths.push({ playerId: p.internalId, name: p.name, age, diedYear: year });
    return { ...p, diedYear: year } as any as NBAPlayer;
  });

  return { players: updated, deaths };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RetirementDecisionEvaluation {
  evaluated: boolean;
  eligible: boolean;
  skipReason?: 'inactive' | 'deceased' | 'prospect' | 'wnba' | 'excluded' | 'protected-market';
  age: number;
  ovr: number;
  allStarAppearances: number;
  probability: number;
  roll: number;
  willRetire: boolean;
  clearFarewell: boolean;
}

export interface RetirementRunDiagnostics {
  playersScanned: number;
  evaluated: number;
  eligible: number;
  selected: number;
  persisted: number;
}

export function evaluateRetirementDecision(
  player: NBAPlayer,
  year: number,
  options: { protectedPlayerIds?: Set<string>; excludedPlayerIds?: Set<string> } = {},
): RetirementDecisionEvaluation {
  const empty = (
    skipReason: RetirementDecisionEvaluation['skipReason'],
  ): RetirementDecisionEvaluation => ({
    evaluated: false,
    eligible: false,
    skipReason,
    age: 0,
    ovr: player.overallRating ?? 60,
    allStarAppearances: 0,
    probability: 0,
    roll: 1,
    willRetire: false,
    clearFarewell: false,
  });
  const status = player.status ?? 'Active';
  if (!new Set(['Active', 'Free Agent', 'FreeAgent']).has(status)) return empty('inactive');
  if (player.diedYear) return empty('deceased');
  if (player.tid === -2) return empty('prospect');
  if (status === 'WNBA') return empty('wnba');
  if (options.excludedPlayerIds?.has(player.internalId)) return empty('excluded');
  if (options.protectedPlayerIds?.has(player.internalId)) return empty('protected-market');

  const age = player.born?.year
    ? year - player.born.year
    : typeof player.age === 'number' && player.age > 0 ? player.age : 0;
  const ovr = player.overallRating ?? 60;
  const isFarewell = Boolean(player.farewellTour);
  const allStarAppearances = countAllStarAppearances(player);
  const recentStar = wasAllStarRecently(player, year);
  const regularStats = (player.stats ?? []).filter(row => !row.playoffs);
  const lastSeasonRows = regularStats.filter(row => Number(row.season) === year);
  const lastSeasonGP = lastSeasonRows.reduce((sum, row) => sum + Number(row.gp ?? 0), 0);
  const lastSeasonPts = lastSeasonRows.reduce((sum, row) => sum + Number(row.pts ?? 0), 0);
  const lastSeasonPPG = lastSeasonGP > 0 ? lastSeasonPts / lastSeasonGP : 0;
  const lastTwoSeasonsGP = regularStats
    .filter(row => Number(row.season) >= year - 1)
    .reduce((sum, row) => sum + Number(row.gp ?? 0), 0);
  const previousOvr = [...(player.ovrHistory ?? [])]
    .filter(entry => Number(entry?.season) < year && Number.isFinite(Number(entry?.ovr)))
    .sort((left, right) => Number(right.season) - Number(left.season))[0]?.ovr;
  const underContract = Boolean(player.contract && Number(player.contract.exp) >= year + 1 && player.tid >= 0);
  const probability = calculateRetirementProbability({
    age,
    rawOvr: ovr,
    previousOvr,
    allStarApps: allStarAppearances,
    recentAllStar: recentStar,
    lastSeasonGP,
    lastSeasonPPG,
    lastTwoSeasonsGP,
    underContract,
    contractYearsRemaining: Math.max(0, Number(player.contract?.exp ?? year) - year),
    injuryGames: Number(player.injury?.gamesRemaining ?? 0),
    competitor: (player.moodTraits ?? []).includes('COMPETITOR'),
    farewellTour: isFarewell,
    year,
  });
  const productiveScorer = lastSeasonGP >= 45 && lastSeasonPPG >= 15;
  const clearFarewell = isFarewell && (recentStar || productiveScorer || underContract);
  const roll = probability > 0 ? seededRandom(`retire_${player.internalId}_${year}`) : 1;
  return {
    evaluated: true,
    eligible: probability > 0,
    age,
    ovr,
    allStarAppearances,
    probability,
    roll,
    willRetire: probability > 0 && roll < probability,
    clearFarewell,
  };
}

/**
 * Run retirement checks for all active/FA players.
 * Call this inside applySeasonRollover AFTER age increments.
 *
 * @param players  The already-aged player list from rollover
 * @param year     The season that just ended (pre-increment)
 * @returns        { players: updated list, newRetirees: record of who just retired }
 */
export function runRetirementChecks(
  players: NBAPlayer[],
  year: number,
  options: { protectedPlayerIds?: Set<string>; excludedPlayerIds?: Set<string> } = {},
): { players: NBAPlayer[]; newRetirees: RetireeRecord[]; diagnostics: RetirementRunDiagnostics } {
  const newRetirees: RetireeRecord[] = [];
  const protectedPlayerIds = options.protectedPlayerIds ?? new Set<string>();
  const excludedPlayerIds = options.excludedPlayerIds ?? new Set<string>();

  const evaluations = new Map<string, RetirementDecisionEvaluation>();

  const updated = players.map(p => {
    const evaluation = evaluateRetirementDecision(p, year, { protectedPlayerIds, excludedPlayerIds });
    evaluations.set(p.internalId, evaluation);
    if (evaluation.skipReason === 'protected-market') {
      simDebug('development', () => `[Retirement] Skipping ${p.name} — active user FA bid market.`, {
        playerId: p.internalId,
        event: 'retirement-market-skip',
      });
    }
    if (!evaluation.evaluated || !evaluation.eligible) {
      return evaluation.clearFarewell ? { ...p, farewellTour: undefined } as NBAPlayer : p;
    }
    const survived = !evaluation.willRetire;
    simDebug('development', () => (
      `[Retirement] ${p.name} (age ${evaluation.age}, OVR ${evaluation.ovr}) — prob: ${(evaluation.probability * 100).toFixed(1)}%, roll: ${evaluation.roll.toFixed(4)} → ${survived ? 'SURVIVED' : 'RETIRED'}`
    ), { playerId: p.internalId, event: 'retirement-roll' });
    if (survived) return evaluation.clearFarewell ? { ...p, farewellTour: undefined } as NBAPlayer : p;

    // Retiring!
    const { gp, pts, reb, ast } = computeCareerTotals(p);
    const champCount = countChampionships(p);

    newRetirees.push({
      playerId:           p.internalId,
      name:               p.name,
      age: evaluation.age,
      ovr: evaluation.ovr,
      allStarAppearances: evaluation.allStarAppearances,
      championships:      champCount,
      careerGP:           gp,
      careerPts:          pts,
      careerReb:          reb,
      careerAst:          ast,
      isLegend:           evaluation.allStarAppearances >= 5,
    });

    return {
      ...p,
      status:       'Retired'   as const,
      tid:          -1,
      retiredYear:  year,
      farewellTour: undefined,  // clean up flag
      contract:     undefined,
      hasBirdRights: undefined,
      birdRightsTeamId: undefined,
      birdRightsSeason: undefined,
      declinedTeamOptionByTid: undefined,
      declinedTeamOptionSeasonYear: undefined,
      declinedTeamOptionSalaryUSD: undefined,
      offseasonDecisionTeamId: undefined,
      offseasonDecisionSeason: undefined,
      twoWay: undefined,
      nonGuaranteed: false,
      gLeagueAssigned: false,
    } as NBAPlayer;
  });

  const diagnostics: RetirementRunDiagnostics = {
    playersScanned: players.length,
    evaluated: [...evaluations.values()].filter(evaluation => evaluation.evaluated).length,
    eligible: [...evaluations.values()].filter(evaluation => evaluation.eligible).length,
    selected: newRetirees.length,
    persisted: newRetirees.length,
  };
  simDebug('development', () => (
    `[Retirement] Evaluated ${diagnostics.evaluated} players, ${diagnostics.eligible} had a non-zero retirement probability, ${diagnostics.selected} retired.`
  ), { event: 'retirement-summary', ...diagnostics });

  return { players: updated, newRetirees, diagnostics };
}
