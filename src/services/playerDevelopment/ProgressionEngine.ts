/**
 * ProgressionEngine.ts
 *
 * Faithful port of BBGM's developSeason.basketball.ts, adapted for daily simulation.
 *
 * Architecture (matches real BBGM):
 *  - calcBaseChange(age) → one shared base delta for the season (age-dependent + noise)
 *  - Each attr has its own ageModifier(age) that adds to / reverses the base
 *  - Each attr has changeLimits [min, max] per season — physical attrs can drop a lot,
 *    IQ/skill attrs have wide upside for young players
 *  - Final per-attr delta = bound((baseChange + ageModifier) * uniform(0.4, 1.4), limits)
 *  - Applied daily: annual values divided by 365, noise deterministic per player+date+attr
 *  - potMod still applies to taper growth toward ceiling
 *
 * Position-smart limits (extension beyond BBGM):
 *  - Pure bigs (C) get half the upper changeLimits on tp (no Brook Lopez by default,
 *    but Lopez-types who already have high tp are unaffected — the math handles it)
 *  - Pure guards get half upper limit on ins
 *
 * Seasonal events (fire once Oct 1 via applySeasonalBreakouts):
 *  - Breakout: age 18–24, 4% → +6–10 on one key attr
 *  - Late bloomer: age 28–32, 4% → +3–6 on one IQ/skill attr
 *  - Bust: age 19–23 high-pot, 3% → −5–8 on one physical attr
 *
 * Fuzz (scout fog):
 *  - getFuzzedOvr() — ±1–4 OVR noise for non-owned players in scouting views
 */

import { NBAPlayer, NBATeam } from '../../types';
import {
  calculateOverallFromRating,
  calculatePlayerOverallForYear,
  getDisplayOverall,
  getDisplayPotential,
  resolvePotentialBbgm,
} from '../../utils/playerRatings';
import { applyLeagueDisplayScale, LEAGUE_DISPLAY_MULTIPLIERS } from '../../hooks/useLeagueScaledRatings';
import { calculateLeagueOverall } from '../logic/leagueOvr';
import { convertTo2KRating, normalizeDate } from '../../utils/helpers';
import { EXTERNAL_LEAGUE_OVR_CAP, EXTERNAL_MENS_LEAGUE_STATUSES, YOUTH_EXTERNAL_OVR_CAP } from '../../constants';
import { getFocusWeights, ARCHETYPE_PROFILES } from '../../TeamTraining/constants/trainingarchetypes';
import { calculateMentorExp } from '../training/mentorScore';
import type { TrainingParadigm, Allocations } from '../../TeamTraining/types';
import { getTeamAcademyDevelopmentMultiplier, getTeamDevelopmentMultiplier } from '../staff/staffGameplayEffects';
import { SettingsManager } from '../SettingsManager';
import { getCachedHistoricalRealRating } from '../zengmHistoricalRoster';
import { progressGeneratedEuroYouthProjection } from '../euroScouting/prospectRatings';
import { appendOverallTimelineSnapshot } from './progressionTimeline';
import { getBasketballEraRules } from '../era/basketballEraRules';
import { isSimulationPerfEnabled, recordSimulationPerf } from '../simulation/simulationPerfDebug';

// ─── Conditioning maintenance modifier (the ONLY thing in team training that
// touches K2 ratings). Per docs/training.md §3 — biometric team training is
// PURE MAINTENANCE: it never raises Speed / Vertical / Strength / Endurance.
// Those gains come exclusively from individual devFocus (per-player surface),
// so team-bio cannot double-dip on growth. What it does is slow the age-decay
// curve on physicals, proportional to the `conditioning` allocation share:
//   - Any age: caps a fraction of the decline (up to 50% at 100% conditioning).
//   - Genetic Ceiling already enforced by per-attr changeLimits().
//   - Wear-and-Tear (fatigue+injury) handled in trainingTick, not here.
// Offense/Defense/Recovery allocations do NOT touch K2 ratings — they are pure
// team-meter reps (system familiarity / defensive aura / fatigue clearance).
const PHYSICAL_ATTRS_SET = new Set(['spd', 'jmp', 'stre', 'endu', 'dnk']);
const IQ_ATTRS_SET = new Set(['oiq', 'diq']);

type DailyProgressionProfile = {
  ratingPreparationMs: number;
  baseModelMs: number;
  playerContextMs: number;
  attributeLoopMs: number;
  physicalProjectionMs: number;
  realPlayerAnchorMs: number;
  ratingSummaryMs: number;
  playerRebuildMs: number;
  overallCalculationMs: number;
  leagueCapMs: number;
  timelineMs: number;
  ratingRowsScanned: number;
  awardRowsScanned: number;
  attributesEvaluated: number;
  baseModelCalls: number;
  potentialResolutionCalls: number;
  repeatedPotentialResolutionInputs: number;
  playerContextBuilds: number;
  mentorLookups: number;
  teamContextLookups: number;
  realPlayerAnchorCalls: number;
  realPlayerSettingsLookups: number;
  realPlayerRatingLookups: number;
  realCurveDateNormalizations: number;
  overallCalculationCalls: number;
  ratingsArraysCopied: number;
  ratingRowsCopied: number;
  playerObjectsRebuilt: number;
  estimatedTemporaryBytes: number;
};

const progressionPerfNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
function conditioningAttrMod(
  attr: string,
  delta: number,
  alloc: Allocations,
): number {
  if (!PHYSICAL_ATTRS_SET.has(attr)) return 1.0;
  if (delta >= 0) return 1.0; // growth is devFocus territory — never touched here
  const condShare = Math.max(0, Math.min(1, (alloc.conditioning ?? 0) / 100));
  if (condShare === 0) return 1.0;
  return 1.0 - 0.50 * condShare;
}

interface TeamPlanForDay {
  paradigm: TrainingParadigm;
  allocations: Allocations;
}

// External league players have pre-scaled attrs at fetch time.
// calculatePlayerOverallForYear on scaled attrs floors at Math.max(40,...) → display 66.
// Use calculateLeagueOverall (calcRawOvr, no floor, no extra mult) for their OVR instead.
const EXTERNAL_LEAGUE_STATUSES = new Set(EXTERNAL_MENS_LEAGUE_STATUSES);

function clampPbaDraftRookieOverall(player: NBAPlayer, overall: number, currentYear: number, rating?: any): number {
  const version = String((player as any).pbaDraftTunedVersion ?? '');
  if (!version.startsWith('pba-draft-')) return overall;
  const tid = Number(player.tid);
  const status = String(player.status ?? '');
  const inPbaPlayerMarket = status === 'PBA' || status === 'Free Agent' || (Number.isFinite(tid) && tid >= 2000 && tid < 3000);
  if (!inPbaPlayerMarket) return overall;
  const draftYear = Number((player as any).draft?.year);
  if (!Number.isFinite(draftYear) || draftYear < currentYear - 3) return overall;
  const seasonsSinceDraft = Math.max(0, currentYear - draftYear);
  const tunedCap =
    seasonsSinceDraft <= 1 ? 39 :
    seasonsSinceDraft === 2 ? 40 :
    seasonsSinceDraft === 3 ? 41 :
    seasonsSinceDraft === 4 ? 42 :
    43;
  const cap = Math.min(
    tunedCap,
    Number(rating?.pot ?? tunedCap + 2),
    Number(rating?.ovr ?? player.overallRating ?? overall),
  );
  return Math.min(overall, cap);
}

function isYouthExternalProspect(player: NBAPlayer, age: number): boolean {
  return age < 19
    && ((player as any).euroAcademyPlayer === true || EXTERNAL_LEAGUE_STATUSES.has(player.status ?? ''))
    && !(player as any).promotedFromAcademy;
}

function calcYouthExternalBaseChange(age: number, seed: string, devSpeed: number): number {
  const ageBase = age <= 15 ? 0.55 : age === 16 ? 0.70 : age === 17 ? 0.85 : 1.00;
  const noise = seededUniform(seed + 'youth-base', -0.15, 0.25);
  const speed = Math.max(0.85, Math.min(1.12, devSpeed));
  return Math.max(0.35, Math.min(1.20, (ageBase + noise) * speed));
}

function getYouthExternalProgressionCap(age: number): number {
  if (age <= 15) return YOUTH_EXTERNAL_OVR_CAP + 1;
  if (age === 16) return YOUTH_EXTERNAL_OVR_CAP + 2;
  if (age === 17) return YOUTH_EXTERNAL_OVR_CAP + 3;
  return YOUTH_EXTERNAL_OVR_CAP + 4;
}

/** NBA-active: on an NBA roster (not FA, not overseas, not WNBA/retired/prospect) */
function isNBAActive(p: NBAPlayer): boolean {
  const s = p.status ?? 'Active';
  return s !== 'Free Agent' && !EXTERNAL_LEAGUE_STATUSES.has(s) && s !== 'WNBA'
      && s !== 'Draft Prospect' && s !== 'Prospect' && s !== 'Retired';
}

function getPlayerAge(player: NBAPlayer, currentYear: number): number {
  return player.born?.year
    ? (currentYear - player.born.year)
    : (typeof player.age === 'number' && player.age > 0 ? player.age : 25);
}

// ─── Seeded RNG ────────────────────────────────────────────────────────────────

function seededHashRaw(seed: string, initialHash = 0): number {
  let hash = initialHash;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return hash;
}

function seededHash(seed: string): number {
  const hash = seededHashRaw(seed);
  return Math.abs(hash);
}

/** Deterministic float in [0, 1) */
function seededRand(seed: string): number {
  return (seededHash(seed) % 100000) / 100000;
}

/** Deterministic int in [min, max] */
function seededInt(seed: string, min: number, max: number): number {
  return min + (seededHash(seed) % (max - min + 1));
}

/** Deterministic uniform in [lo, hi] — mirrors BBGM random.uniform */
function seededUniform(seed: string, lo: number, hi: number): number {
  return lo + seededRand(seed) * (hi - lo);
}

function seededUniformFromPrefix(prefixHash: number, suffix: string, lo: number, hi: number): number {
  const hash = Math.abs(seededHashRaw(suffix, prefixHash));
  return lo + ((hash % 100000) / 100000) * (hi - lo);
}

function getRealPlayerDeterminism(): number {
  try {
    const percent = Math.max(0, Math.min(100, Number(SettingsManager.getSettings().realPlayerDeterminism ?? 0)));
    return Math.pow(percent / 100, 2);
  } catch {
    return 0;
  }
}

function isHistoricalRealPlayer(player: NBAPlayer): boolean {
  return typeof (player as any).srID === 'string' || typeof (player as any).slug === 'string';
}

function resolveDevelopmentPotentialBbgm(player: NBAPlayer, rating: any, age: number): number {
  const currentOvr = Number(rating?.ovr ?? player.overallRating ?? 60);
  const storedPot = Number(rating?.pot ?? (player as any)?.potential);
  if (!isHistoricalRealPlayer(player)) {
    return Number.isFinite(storedPot) && storedPot > 0 ? storedPot : 70;
  }
  return resolvePotentialBbgm(currentOvr, age, undefined);
}

// ─── BBGM calcBaseChange ───────────────────────────────────────────────────────
// One shared base value for the whole season. Young players get heavy positive +
// wide Gaussian noise (potential busts AND breakouts). Older players get steady
// small negatives with tight noise.
//
// Wine-aging modifier (LeBron / KG type):
// Veterans with very high pot decline slower — not a template, just pot math.
//   pot >= 95 at age 32+: decline × 0.45  (LeBron still running at 38)
//   pot >= 90 at age 32+: decline × 0.60
//   pot >= 85 at age 32+: decline × 0.78
// Below pot 85: normal BBGM decline curve.

export function calcBaseChange(
  age: number,
  seed: string,
  pot: number = 70,
  eraYear: number = 2026,
  fatherTimeDeclineMultiplier?: number,
): number {
  let val: number;

  // Reduced ~40% from prior values — old rates produced K2 +17/5yr for avg players,
  // turning every K2 79 rookie into a K2 96 star. Real NBA growth is +1-2 K2/yr peak.
  if      (age <= 18) val = 2.5;
  else if (age <= 20) val = 2.0;
  else if (age <= 21) val = 1.3;
  else if (age <= 22) val = 1.0;
  else if (age <= 25) val = 0.7;
  else if (age <= 27) val = 0.4;
  else if (age <= 29) val = -0.8;
  else if (age <= 31) val = -1.5;
  else if (age <= 34) val = -2.5;
  else if (age <= 37) val = -3.0;
  else if (age <= 40) val = -3.3;
  else if (age <= 43) val = -3.8;
  else                val = -4.8;

  // Wine-aging: elite veterans resist the decline curve
  if (age >= 32 && val < 0) {
    const agingMult = pot >= 95 ? 0.45 : pot >= 90 ? 0.60 : pot >= 85 ? 0.78 : 1.0;
    val *= agingMult;
  }

  // Gaussian noise — noise ceiling halved; old +20 ceiling let a single lucky season
  // spike any 23yo by +20 BBGM producing K2 97 players after one year in the league.
  const u1 = Math.max(1e-10, seededRand(seed + 'bm1'));
  const u2 = seededRand(seed + 'bm2');
  const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  if      (age <= 23) val += Math.max(-3, Math.min(8, gauss * 3));
  else if (age <= 25) val += Math.max(-3, Math.min(5, gauss * 3));
  else                val += Math.max(-2, Math.min(3, gauss * 2));

  if (val < 0) {
    val *= fatherTimeDeclineMultiplier ?? getBasketballEraRules(eraYear).fatherTimeDeclineMultiplier;
  }

  return val;
}

// ─── BBGM per-attr formulas ────────────────────────────────────────────────────
// Each attr has:
//   ageModifier(age) → added to baseChange for this attr
//   changeLimits(age) → [min, max] annual clamp

type AttrFormula = {
  ageModifier: (age: number) => number;
  changeLimits: (age: number) => [number, number];
};

// Shooting formula: slows decline after 27, but tapers off for very old players
const shootingFormula: AttrFormula = {
  ageModifier: (age) => {
    if (age <= 27) return 0;
    if (age <= 29) return 0.5;
    if (age <= 31) return 1.5;
    if (age <= 36) return 2.0;
    if (age <= 39) return 1.2;  // still helps but no longer offsets base entirely
    return 0.7;                 // 40+ — minimal late-career shooting bump
  },
  changeLimits: () => [-3, 7],
};

// IQ formula: extra boost for young (huge upside), reverses decline late
const iqFormula: AttrFormula = {
  ageModifier: (age) => {
    if (age <= 21) return 2;    // was 4 — combined with base was inflating IQ too fast
    if (age <= 23) return 1.5;  // was 3
    if (age <= 27) return 0;
    if (age <= 29) return 0.5;
    if (age <= 31) return 1.5;
    if (age <= 36) return 2.0;
    if (age <= 39) return 1.2;
    return 0.7;
  },
  changeLimits: (age) => {
    if (age >= 24) return [-3, 7];
    // Capped at 14 (was 7+5*(24-age) = 32 at age 19 — allowed single-year +32 IQ gains)
    return [-3, Math.min(14, 3 + 2 * (24 - age))];
  },
};

export const ATTR_FORMULAS: Record<string, AttrFormula> = {
  stre: {
    ageModifier: () => 0,
    changeLimits: () => [-Infinity, Infinity],
  },
  spd: {
    ageModifier: (age) => {
      if (age <= 27) return 0;
      if (age <= 30) return -2;
      if (age <= 35) return -2.5;
      if (age <= 40) return -3;
      return -6;
    },
    // Young players can genuinely develop athleticism — BBGM shows +4-8 spd for age 18-22
    changeLimits: (age) => age <= 22 ? [-12, 8] : age <= 26 ? [-12, 4] : [-12, 2],
  },
  jmp: {
    ageModifier: (age) => {
      if (age <= 26) return 0;
      if (age <= 30) return -2.5;
      if (age <= 35) return -3;
      if (age <= 40) return -4;
      return -8;
    },
    changeLimits: (age) => age <= 22 ? [-12, 8] : age <= 26 ? [-12, 4] : [-12, 2],
  },
  endu: {
    ageModifier: (age, seed?: string) => {
      // Young players: random endurance boost (capped at 5, was 9)
      if (age <= 23) return seededUniform((seed ?? '') + 'endu', 0, 5);
      if (age <= 30) return 0;
      if (age <= 35) return -1.5;
      if (age <= 40) return -3;
      return -6;
    },
    changeLimits: () => [-11, 10],  // was 19
  },
  dnk: {
    ageModifier: (age) => {
      if (age <= 27) return 0;
      return 0.5; // slight resistance to decline (rim presence holds longer)
    },
    changeLimits: () => [-3, 13],
  },
  ins: shootingFormula,
  ft:  shootingFormula,
  fg:  shootingFormula,
  tp:  shootingFormula,
  oiq: iqFormula,
  diq: iqFormula,
  drb: { ageModifier: shootingFormula.ageModifier, changeLimits: () => [-2, 5] },
  pss: { ageModifier: shootingFormula.ageModifier, changeLimits: () => [-2, 5] },
  reb: { ageModifier: shootingFormula.ageModifier, changeLimits: () => [-2, 5] },
};

const ALL_ATTRS = Object.keys(ATTR_FORMULAS);
const REAL_PLAYER_ANCHOR_ATTRS = ['hgt', ...ALL_ATTRS];
type AttrAgeMetadata = {
  attr: string;
  formula: AttrFormula;
  ageModifier: number | undefined;
  limMin: number;
  limMax: number;
};
const ATTR_AGE_METADATA = new Map<number, readonly AttrAgeMetadata[]>();

function getAttrAgeMetadata(age: number): readonly AttrAgeMetadata[] {
  const cached = ATTR_AGE_METADATA.get(age);
  if (cached) return cached;
  const metadata = ALL_ATTRS.map(attr => {
    const formula = ATTR_FORMULAS[attr];
    const [limMin, limMax] = formula.changeLimits(age);
    return {
      attr,
      formula,
      ageModifier: attr === 'endu' ? undefined : formula.ageModifier(age),
      limMin,
      limMax,
    };
  });
  ATTR_AGE_METADATA.set(age, metadata);
  return metadata;
}

function getRemainingRealCurveDays(date: string, currentYear: number): number {
  try {
    const iso = normalizeDate(date);
    const current = new Date(`${iso}T00:00:00Z`).getTime();
    const seasonEnd = Date.UTC(currentYear, 5, 30);
    if (!Number.isFinite(current)) return 365;
    if (current >= seasonEnd) return 1;
    return Math.max(1, Math.ceil((seasonEnd - current) / 86_400_000) + 1);
  } catch {
    return 365;
  }
}

function applyRealPlayerDeterminismAnchor(
  player: NBAPlayer,
  rating: any,
  age: number,
  currentYear: number,
  date: string,
  profile?: DailyProgressionProfile,
  dailyContext?: {
    realPlayerDeterminism: number;
    remainingRealCurveDays: number;
  },
): void {
  if (profile) profile.realPlayerAnchorCalls += 1;
  if (!isHistoricalRealPlayer(player)) return;
  if (profile && !dailyContext) profile.realPlayerSettingsLookups += 1;
  const determinism = dailyContext?.realPlayerDeterminism ?? getRealPlayerDeterminism();
  if (determinism <= 0) return;

  const slug = (player as any).slug ?? (player as any).srID;
  const bornYear = Number(player.born?.year ?? currentYear - age);
  if (!slug || !Number.isFinite(bornYear)) return;

  if (profile) profile.realPlayerRatingLookups += 1;
  const realRating = getCachedHistoricalRealRating(slug, bornYear + age);
  if (!realRating) return;

  if (profile && !dailyContext) profile.realCurveDateNormalizations += 1;
  const dailyBlend = Math.min(
    1,
    determinism / (dailyContext?.remainingRealCurveDays ?? getRemainingRealCurveDays(date, currentYear)),
  );
  for (const attr of REAL_PLAYER_ANCHOR_ATTRS) {
    const current = Number(rating[attr]);
    const target = Number((realRating as any)[attr]);
    if (!Number.isFinite(current) || !Number.isFinite(target)) continue;
    rating[attr] = Math.min(99, Math.max(20, current + (target - current) * dailyBlend));
  }
}

// No position or archetype overrides — pure BBGM algorithm.
// changeLimits + calcBaseChange + ageModifier already produce realistic outcomes.
// Brook Lopez CAN develop threes. Tony Allen WON'T (low base + negative age modifier).
function devCapMultiplier(_pos: string, _rating: any, _attr: string): number {
  return 1.0;
}

// ─── Potential modifier ────────────────────────────────────────────────────────

function potMod(currentOvr: number, pot: number): number {
  const gap = pot - currentOvr;
  if (gap <= 0) return -0.5;
  if (gap >= 15) return 1.0;
  return Math.sqrt(gap / 15);
}

// ─── Single player daily progression ──────────────────────────────────────────

function progressPlayer(
  player: NBAPlayer,
  currentYear: number,
  date: string,
  mentorLookup?: Map<string, NBAPlayer>,
  teamPlan?: TeamPlanForDay,
  devMultiplier: number = 1,
  profile?: DailyProgressionProfile,
  recordTimelineSnapshot = true,
  dailyContext?: {
    fatherTimeDeclineMultiplier: number;
    realPlayerDeterminism: number;
    remainingRealCurveDays: number;
  },
): NBAPlayer {
  if (!player.ratings || player.ratings.length === 0) return player;

  let leafStart = profile ? progressionPerfNow() : 0;
  if (profile) profile.ratingRowsScanned += player.ratings.length;
  const ratingIdx = (() => {
    const i = player.ratings.findIndex((r: any) => r.season === currentYear);
    return i !== -1 ? i : player.ratings.length - 1;
  })();
  const rating: any = { ...player.ratings[ratingIdx] };
  if (profile) profile.estimatedTemporaryBytes += Math.max(64, Object.keys(rating).length * 16);

  // Prefer born.year calculation — player.age can be stale/wrong from BBGM load
  const age = getPlayerAge(player, currentYear);
  const pid = player.internalId ?? player.name;
  const isOverseasPlayer = !!LEAGUE_DISPLAY_MULTIPLIERS[player.status ?? ''];
  const isYouthExternal = isYouthExternalProspect(player, age);
  const pos = player.pos ?? 'F';

  if (age < 19 && !isYouthExternal && !(player as any).promotedFromAcademy) {
    return player;
  }

  const pot = resolveDevelopmentPotentialBbgm(player, rating, age);
  if (profile) profile.potentialResolutionCalls += 1;
  if (isHistoricalRealPlayer(player) && Number(rating.pot ?? 0) !== pot) {
    rating.pot = pot;
  }
  if (profile) {
    profile.ratingPreparationMs += progressionPerfNow() - leafStart;
    leafStart = progressionPerfNow();
  }

  // Per-player developmental fingerprint: stable offset seeded ONLY by pid (not year).
  // Shifts each player's effective age curve — some 26-year-olds are still improving,
  // others already declining. Range [-2, +2] annual units → visible OVR divergence over a season.
  const careerOffset = seededUniform(pid + 'career', -2.0, 2.0);

  // MVP count — computed once and reused for both base dampening and per-attr softening.
  // Awards are stored as 'Most Valuable Player' (via PLAYER_AWARD_TYPE_MAP in autoResolvers).
  // Cap at 4; beyond that the math is already very forgiving.
  const awards = (player as any).awards ?? [];
  let mvpCount = 0;
  for (const award of awards) {
    if (award.type === 'Most Valuable Player' || award.type === 'MVP') mvpCount += 1;
  }
  mvpCount = Math.min(4, mvpCount);
  if (profile) profile.awardRowsScanned += awards.length;

  // Annual base change for this player this season (deterministic per pid+year)
  // Divide by 365 for daily application. pot passed for wine-aging modifier.
  // devSpeed is the hidden per-player trajectory scalar set at draft generation
  // (0.55–0.80 under-developer / 0.90–1.10 normal / 1.15–1.40 hidden gem). Only
  // tilts positive growth — decline years (negative base) shouldn't be softened
  // for slow developers.
  const devSpeed: number = rating.devSpeed ?? 1.0;
  if (profile) profile.baseModelCalls += 1;
  let baseRaw = isYouthExternal
    ? calcYouthExternalBaseChange(age, pid + currentYear, devSpeed)
    : calcBaseChange(
      age,
      pid + currentYear,
      pot,
      currentYear,
      dailyContext?.fatherTimeDeclineMultiplier,
    );

  // MVP aging resistance — only kicks in at 38+, where the real cliff starts.
  // Curry/LeBron types get a modest dampen; still decline, just slower.
  if (baseRaw < 0 && mvpCount > 0 && age >= 38) {
    const mvpBaseMult = mvpCount >= 4 ? 0.68 : mvpCount >= 3 ? 0.75 : mvpCount >= 2 ? 0.82 : 0.90;
    baseRaw *= mvpBaseMult;
  }

  // MVP regression lottery — 20% per ticket, max 2, only at 38+.
  // Rare plateau season for elite late-career players.
  if (baseRaw < 0 && mvpCount > 0 && age >= 38) {
    const lotteryTickets = Math.min(2, mvpCount);
    for (let i = 0; i < lotteryTickets; i++) {
      if (seededUniform(pid + currentYear + 'mvp' + i, 0, 1) < 0.20) {
        baseRaw = 0;
        break;
      }
    }
  }

  const rawBase = isYouthExternal ? baseRaw : (baseRaw > 0 ? baseRaw * devSpeed : baseRaw);
  // Only apply the offset when the base isn't already large (don't double-boost elite youth)
  const annualBase = isYouthExternal
    ? Math.max(0.30, Math.min(1.35, rawBase + careerOffset * 0.12))
    : rawBase + (Math.abs(rawBase) < 4 ? careerOffset : careerOffset * 0.3);
  const dailyBase = annualBase / 365;

  // Skip attribute delta if base is exactly 0 and not overseas (peak-age NBA player)
  const skipDelta = dailyBase === 0 && !isOverseasPlayer;
  if (profile) {
    profile.baseModelMs += progressionPerfNow() - leafStart;
    leafStart = progressionPerfNow();
  }

  if (!skipDelta) {
    const currentOvr: number = rating.ovr ?? player.overallRating ?? 60;
    const pm = annualBase > 0 ? potMod(currentOvr, pot) : 1.0;

    // Funnel Model — weight-driven per archetype's `rawWeights` (which sum to ~1.0).
    // Each attribute's multiplier scales with its specific weight in the archetype:
    //   - Heavily-weighted attrs (focused) grow faster + regress slower.
    //   - Lightly-weighted attrs grow at the BASE rate (no penalty — never zeroed).
    //
    // Net effect is a slight volume inflation for focused archetypes (≈ +10-20%),
    // because the funnel adds boost without subtracting from non-focused attrs.
    // The OVR computation reads all attrs evenly, so the funneled gains land
    // exactly where the user intended without erasing well-rounded growth.
    //
    // Source: docs/training.md "Funnel Model" + simulation.ts brainstorm.
    const devFocus = (player as any).devFocus as string | undefined;
    const useFunnel = !!devFocus && devFocus !== 'Balanced' && !!ARCHETYPE_PROFILES[devFocus];
    const focus = useFunnel ? getFocusWeights(devFocus!) : null;
    // funnelMult(attr) — uses raw weight directly. Weight 0.20 → 1.8× growth /
    // 0.68× regression. Weight 0.05 → 1.2× / 0.92×. Weight 0.01 → 1.04× / 0.984×.

    // Mentor multiplier per docs/mentorship.md §3 + Hakeem-Dwight Rule:
    //   - Mentee age gate: ONLY U-26 players absorb mentor effects. Older mentees
    //     can still be assigned (UI doesn't lock), but the engine ignores it —
    //     matches reality (you don't "mentor" a 28-year-old vet).
    //   - Regression buffer: low-EXP mentors are Regression Fighters only.
    //     Caps at 30% reduction at ~2000 EXP.
    //   - IQ acceleration: GATED by 1000 EXP minimum. Only real vets (CP3-tier,
    //     LeBron-tier) actively push young player IQ growth. The CP3↔SGA /
    //     LeBron↔Reaves model — marginal at the threshold, real at the top end.
    //   - Skill/physical attrs ignore mentor entirely (Hakeem-Dwight rule).
    const mentor = mentorLookup && (player as any).mentorId ? mentorLookup.get((player as any).mentorId) : undefined;
    if (profile) {
      profile.playerContextBuilds += 1;
      profile.mentorLookups += (player as any).mentorId ? 1 : 0;
    }
    const mentorExp = mentor ? calculateMentorExp(mentor).exp : 0;
    const menteeAgeOk = age <= 25;
    const mentorMitigation = menteeAgeOk ? Math.min(0.3, mentorExp / 6666) : 0;
    // 1000 EXP → 3%. 6000 EXP → 13%. 11000+ EXP → 20% cap.
    const mentorIQBonus = (menteeAgeOk && mentorExp >= 1000)
      ? Math.min(0.20, ((mentorExp - 1000) / 10000) * 0.20 + 0.03)
      : 0;

    // Per-player intensity → growth multiplier for positive deltas.
    const intensity = (player as any).trainingIntensity ?? 'Normal';
    const intensityMult =
      intensity === 'Rest' ? 0.3 :
      intensity === 'Half' ? 0.7 :
      intensity === 'Double' ? 1.35 :
      1.0;

    // Fatigue → growth dampener. 0 fatigue → 1.0×, 100 fatigue → 0.8×.
    // Modern sport-science calibration: even max fatigue only mildly slows
    // development. Real elite athletes still progress through tired stretches
    // because their recovery infrastructure cushions the loss. Future
    // @NEW_FEATURES.md "Training Dev staff" tier should soften this further
    // for teams that invest in performance science.
    const fatigue = Math.max(0, Math.min(100, (player as any).trainingFatigue ?? 0));
    const fatigueDampen = 1 - (fatigue / 100) * 0.2;
    if (profile) {
      profile.playerContextMs += progressionPerfNow() - leafStart;
      leafStart = progressionPerfNow();
    }

    const dailyAttributeSeedPrefix = seededHashRaw(pid + date);
    for (const metadata of getAttrAgeMetadata(age)) {
      const { attr, formula, limMin, limMax } = metadata;
      if (rating[attr] == null) continue;

      if (profile) profile.attributesEvaluated += 1;

      // ageModifier for endu needs the seed
      let mod = attr === 'endu'
        ? (ATTR_FORMULAS.endu.ageModifier as any)(age, pid + currentYear + 'endu')
        : metadata.ageModifier!;

      // MVP veterans 38+ retain attribute quality slightly better.
      if (mod < 0 && mvpCount > 0 && age >= 38) {
        const mvpAttrMult = mvpCount >= 4 ? 0.72 : mvpCount >= 3 ? 0.80 : mvpCount >= 2 ? 0.87 : 0.93;
        mod *= mvpAttrMult;
      }

      const annualCombined = annualBase + mod;
      const dailyCombined  = annualCombined / 365;

      // Potential mod only applies when growing
      const effectiveDaily = dailyCombined > 0 ? dailyCombined * pm : dailyCombined;

      // BBGM: multiply by uniform(0.4, 1.4) per attr — deterministic here
      const unifMult = seededUniformFromPrefix(dailyAttributeSeedPrefix, attr, 0.4, 1.4);
      let delta = effectiveDaily * unifMult;

      // Funnel — weight-driven multiplier. Skipped for Balanced (default).
      if (focus && delta !== 0) {
        const weight = (focus.rawWeights as any)[attr] ?? 0;
        delta *= delta > 0
          ? 1.0 + Math.max(0, weight) * 4
          : 1.0 - Math.min(0.6, Math.max(0, weight) * 1.6);
      }

      // Mentor effect — anti-regression on all attrs, small IQ-only growth bonus.
      if (mentorMitigation > 0 && delta < 0) {
        delta *= (1 - mentorMitigation);
      }
      if (mentorIQBonus > 0 && delta > 0 && IQ_ATTRS_SET.has(attr)) {
        delta *= (1 + mentorIQBonus);
      }

      // Individual training intensity — per-player setting from RosterView.
      // Rest=0.3 / Half=0.7 / Normal=1.0 / Double=1.35. Only scales POSITIVE
      // deltas — resting doesn't accelerate decline, hard training doesn't slow
      // it (decline is age + mentor-mitigation only). Spread is intentionally
      // wide enough that the dropdown actually matters for development pace.
      if (delta > 0 && intensityMult !== 1.0) {
        delta *= intensityMult;
      }

      // Fatigue dampening — at 100 fatigue, growth gets 0.6×. Forces rest
      // cycles to maintain optimal development. Only dampens positive deltas.
      // Bench-player fatigue is already softened in trainingTick via mpg
      // scaling, so non-rotation guys feel less of this brake.
      if (delta > 0 && fatigueDampen < 1.0) {
        delta *= fatigueDampen;
      }

      if (delta > 0 && devMultiplier !== 1.0) {
        delta *= devMultiplier;
      }

      // Team conditioning — pure decay-resistance on physicals. Growth comes
      // from devFocus (individual surface); team-bio just flattens the curve.
      if (teamPlan && delta < 0) {
        const cmod = conditioningAttrMod(attr, delta, teamPlan.allocations);
        if (cmod !== 1.0) delta *= cmod;
      }

      // Apply changeLimits (annual, divide by 365 for daily clamp)
      const capMult = devCapMultiplier(pos, rating, attr);
      const dailyMin = isFinite(limMin) ? limMin / 365 : -Infinity;
      const dailyMax = isFinite(limMax) ? limMax / 365 * capMult : Infinity;
      delta = Math.max(dailyMin, Math.min(dailyMax, delta));

      rating[attr] = Math.min(99, Math.max(20, rating[attr] + delta));
    }
    if (profile) {
      profile.attributeLoopMs += progressionPerfNow() - leafStart;
      leafStart = progressionPerfNow();
    }

    // Strength → Weight loop (docs/training.md + simulation.ts brainstorm).
    // 0.5 lbs per stre point gained, capped at +15 lbs over original. Lazy-anchors
    // origWeight on first tick where strength has changed.
    const oldStre = (player.ratings[ratingIdx] as any)?.stre;
    const newStre = rating.stre;
    if (typeof oldStre === 'number' && typeof newStre === 'number' && newStre > oldStre && player.weight) {
      const origWeight = (player as any).origWeight ?? player.weight;
      const weightGain = (newStre - oldStre) * 0.5;
      const proposed = (player.weight ?? origWeight) + weightGain;
      const cap = origWeight + 15;
      (player as any).origWeight = origWeight;
      // Mutate via the returned `updatedPlayer` below — capture target weight here.
      (rating as any).__projectedWeight = Math.min(cap, proposed);
    }
    if (profile) profile.physicalProjectionMs += progressionPerfNow() - leafStart;

  }

  leafStart = profile ? progressionPerfNow() : 0;
  applyRealPlayerDeterminismAnchor(
    player,
    rating,
    age,
    currentYear,
    date,
    profile,
    dailyContext,
  );
  if (profile) {
    profile.realPlayerAnchorMs += progressionPerfNow() - leafStart;
    leafStart = progressionPerfNow();
  }

  // Sync rating.ovr so potMod sees the real gap as attrs grow.
  // Generated prospects enter with a frozen nerfed value (e.g. 29) — without this
  // potMod is always 1.0 and they grow unconstrained past their pot ceiling.
  let ovrSum = 0;
  for (const attr of ALL_ATTRS) ovrSum += rating[attr] ?? 0;
  rating.ovr = Math.round(ovrSum / ALL_ATTRS.length);
  const finalPot = resolveDevelopmentPotentialBbgm(player, rating, age);
  if (profile) {
    profile.potentialResolutionCalls += 1;
    profile.repeatedPotentialResolutionInputs += 1;
  }
  if (isHistoricalRealPlayer(player) && Number(rating.pot ?? 0) !== finalPot) {
    rating.pot = finalPot;
  }
  if (profile) {
    profile.ratingSummaryMs += progressionPerfNow() - leafStart;
    leafStart = progressionPerfNow();
  }

  // Rebuild ratings array
  const projectedWeight: number | undefined = (rating as any).__projectedWeight;
  if (projectedWeight !== undefined) delete (rating as any).__projectedWeight;
  const newRatings = [...player.ratings];
  newRatings[ratingIdx] = rating;
  if (profile) {
    profile.ratingsArraysCopied += 1;
    profile.ratingRowsCopied += player.ratings.length;
    profile.estimatedTemporaryBytes += Math.max(32, player.ratings.length * 8);
  }

  const updatedPlayer: NBAPlayer = {
    ...player,
    ratings: newRatings,
    ...(projectedWeight !== undefined ? {
      weight: Math.round(projectedWeight),
      origWeight: player.origWeight ?? player.weight,
    } : {}),
  };
  if (profile) {
    profile.playerObjectsRebuilt += 1;
    profile.estimatedTemporaryBytes += Math.max(128, Object.keys(player).length * 16);
  }
  if (profile) {
    profile.playerRebuildMs += progressionPerfNow() - leafStart;
    leafStart = progressionPerfNow();
  }

  // External league players: attrs are pre-scaled at fetch (e.g. G-League ×0.75).
  // calculatePlayerOverallForYear on those scaled attrs floors at Math.max(40,...) → display 66.
  // Use calculateLeagueOverall (no extra mult, no NBA-calibrated floor) to keep their OVR correct.
  if (isYouthExternal || EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')) {
    updatedPlayer.overallRating = calculateLeagueOverall(rating);
  } else {
    let selectedRating: any;
    let selectedSeason = -Infinity;
    for (const candidate of newRatings) {
      const season = Number(candidate?.season ?? 0);
      if (season <= currentYear && season > selectedSeason) {
        selectedRating = candidate;
        selectedSeason = season;
      }
    }
    updatedPlayer.overallRating = selectedRating ? calculateOverallFromRating(selectedRating) : 50;
  }
  if (profile) profile.overallCalculationCalls += 1;
  updatedPlayer.overallRating = clampPbaDraftRookieOverall(player, updatedPlayer.overallRating, currentYear, rating);
  if (profile) {
    profile.overallCalculationMs += progressionPerfNow() - leafStart;
    leafStart = progressionPerfNow();
  }

  // Fix 8: cap adult external-league progression at the league's OVR ceiling.
  // Prevents NBA-boosted returners (e.g. high-OVR cut player returning to B-League)
  // from staying above the realistic ceiling for their league each tick.
  // Youth (<19) is already frozen upstream in applyDailyProgression; no double-gate needed.
  if (isYouthExternal) {
    const youthCap = Math.max(rating.ovr ?? player.overallRating ?? 0, getYouthExternalProgressionCap(age));
    if (updatedPlayer.overallRating > youthCap) {
      updatedPlayer.overallRating = youthCap;
      const cappedRating = { ...rating, ovr: youthCap };
      updatedPlayer.ratings = player.ratings.map((r: any, i: number) =>
        i === ratingIdx ? cappedRating : r,
      );
    }
  } else if (EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '') && player.status !== 'PBA') {
    const ovrCap = EXTERNAL_LEAGUE_OVR_CAP[player.status!];
    if (ovrCap !== undefined && updatedPlayer.overallRating > ovrCap) {
      updatedPlayer.overallRating = ovrCap;
      // Sync stored rating.ovr so potMod reads the correct gap on next tick.
      const cappedRating = { ...rating, ovr: ovrCap };
      updatedPlayer.ratings = player.ratings.map((r: any, i: number) =>
        i === ratingIdx ? cappedRating : r,
      );
    }
  }
  if (profile) {
    profile.leagueCapMs += progressionPerfNow() - leafStart;
    leafStart = progressionPerfNow();
  }

  if (recordTimelineSnapshot) {
    try {
      const result = appendOverallTimelineSnapshot(updatedPlayer, date, updatedPlayer.overallRating);
      if (profile) profile.timelineMs += progressionPerfNow() - leafStart;
      return result;
    } catch (_) {}
  }

  if (profile) profile.timelineMs += progressionPerfNow() - leafStart;

  return updatedPlayer;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function progressEuroAcademyPlayer(
  player: NBAPlayer,
  team: NBATeam | null,
  currentYear: number,
  date: string,
  mentorLookup?: Map<string, NBAPlayer>,
): NBAPlayer {
  if (!player.ratings?.length || player.status === 'Retired') return player;
  const initialAcademyOverall = Number.isFinite(Number((player as any).academyOverall))
    ? Number((player as any).academyOverall)
    : getDisplayOverall(player, currentYear);
  const initialAcademyPotential = Number.isFinite(Number((player as any).academyPotential))
    ? Number((player as any).academyPotential)
    : getDisplayPotential(player, currentYear, currentYear, { floorAtEstimated: true });
  const academyPlayer = {
    ...player,
    academyOverall: initialAcademyOverall,
    academyBaseOverall: Number.isFinite(Number(player.academyBaseOverall))
      ? Number(player.academyBaseOverall)
      : initialAcademyOverall,
    academyDevelopmentForm: Number.isFinite(Number(player.academyDevelopmentForm))
      ? Number(player.academyDevelopmentForm)
      : 0,
    academyPotential: Math.max(initialAcademyOverall, initialAcademyPotential),
  } as NBAPlayer;
  const developmentMultiplier = getTeamAcademyDevelopmentMultiplier(team as any);
  const mentor = academyPlayer.mentorId ? mentorLookup?.get(academyPlayer.mentorId) : undefined;
  const mentorMultiplier = mentor
    ? 1 + Math.min(0.08, calculateMentorExp(mentor).exp / 100_000)
    : 1;
  let progressed = progressGeneratedEuroYouthProjection(progressPlayer(
    academyPlayer,
    currentYear,
    date,
    mentorLookup,
    undefined,
    developmentMultiplier,
  ), developmentMultiplier * mentorMultiplier, normalizeDate(date));
  try {
    const dateISO = normalizeDate(date);
    if (new Date(`${dateISO}T00:00:00Z`).getUTCDay() === 0) {
      const visibleOverall = Number((progressed as any).academyOverall);
      if (Number.isFinite(visibleOverall) && visibleOverall > 0) {
        const snapshot = { date: dateISO, ovr: visibleOverall, displayScale: 'k2' as const };
        const previous = progressed.ovrTimeline ?? [];
        progressed = {
          ...progressed,
          ovrTimeline: previous.some(item => item.date === dateISO)
            ? previous.map(item => item.date === dateISO ? snapshot : item).slice(-56)
            : [...previous, snapshot].slice(-56),
        };
      }
    }
  } catch {
    // Timeline bookkeeping must not block player development.
  }
  const age = getPlayerAge(progressed, currentYear);
  const annualGrowth = age <= 14 ? 2.6 : age === 15 ? 1.9 : age === 16 ? 1.15 : age === 17 ? 0.55 : age === 18 ? 0.18 : 0;
  if (annualGrowth <= 0 || seededRand(`${progressed.internalId}:${date}:height`) >= annualGrowth / 365) {
    return { ...progressed, age };
  }
  const growth = seededRand(`${progressed.internalId}:${date}:spurt`) < 0.08 ? 2 : 1;
  const nextHeight = Math.min(92, Number(progressed.hgt ?? 76) + growth);
  const heightRating = Math.round(Math.max(0, Math.min(99, ((nextHeight - 68) / 22) * 99)));
  const latestIndex = progressed.ratings.length - 1;
  const ratings = progressed.ratings.map((rating, index) => index === latestIndex ? { ...rating, hgt: heightRating } : rating);
  const weightScale = nextHeight / Math.max(1, Number(progressed.hgt ?? nextHeight));
  return {
    ...progressed,
    age,
    hgt: nextHeight,
    weight: Math.round(Number(progressed.weight ?? 180) * weightScale),
    ratings,
  };
}

export function applyDailyProgression(
  players: NBAPlayer[],
  isPlayoffs: boolean,
  date: string,
  currentYear: number,
  teams?: NBATeam[],
): NBAPlayer[] {
  if (isPlayoffs) return players;

  const perfEnabled = isSimulationPerfEnabled();
  const totalStart = perfEnabled ? progressionPerfNow() : 0;
  const profile: DailyProgressionProfile | undefined = perfEnabled ? {
    ratingPreparationMs: 0,
    baseModelMs: 0,
    playerContextMs: 0,
    attributeLoopMs: 0,
    physicalProjectionMs: 0,
    realPlayerAnchorMs: 0,
    ratingSummaryMs: 0,
    playerRebuildMs: 0,
    overallCalculationMs: 0,
    leagueCapMs: 0,
    timelineMs: 0,
    ratingRowsScanned: 0,
    awardRowsScanned: 0,
    attributesEvaluated: 0,
    baseModelCalls: 0,
    potentialResolutionCalls: 0,
    repeatedPotentialResolutionInputs: 0,
    playerContextBuilds: 0,
    mentorLookups: 0,
    teamContextLookups: 0,
    realPlayerAnchorCalls: 0,
    realPlayerSettingsLookups: 0,
    realPlayerRatingLookups: 0,
    realCurveDateNormalizations: 0,
    overallCalculationCalls: 0,
    ratingsArraysCopied: 0,
    ratingRowsCopied: 0,
    playerObjectsRebuilt: 0,
    estimatedTemporaryBytes: 0,
  } : undefined;

  // Build per-team plan lookup once per day. Empty when teams aren't passed
  // (legacy call site / external simulators) — paradigm modifier silently
  // no-ops, so behavior is identical to before for unwired callers.
  const planByTid = new Map<number, TeamPlanForDay>();
  const devMultByTid = new Map<number, number>();
  const teamSetupStart = perfEnabled ? progressionPerfNow() : 0;
  let normalizedDate = '';
  try { normalizedDate = normalizeDate(date); } catch { normalizedDate = ''; }
  const recordTimelineSnapshot = normalizedDate !== ''
    && new Date(`${normalizedDate}T00:00:00Z`).getUTCDay() === 0;
  if (teams && teams.length) {
    for (const t of teams) {
      devMultByTid.set(t.id, getTeamDevelopmentMultiplier(t as any));
    }
    if (normalizedDate) {
      for (const t of teams) {
        const cal = (t as any).trainingCalendar as Record<string, TeamPlanForDay> | undefined;
        const plan = cal?.[normalizedDate];
        if (plan?.paradigm && plan.allocations) {
          planByTid.set(t.id, { paradigm: plan.paradigm, allocations: plan.allocations });
        }
      }
    }
  }
  const teamSetupMs = perfEnabled ? progressionPerfNow() - teamSetupStart : 0;
  const realPlayerDeterminism = getRealPlayerDeterminism();
  const dailyContext = {
    fatherTimeDeclineMultiplier: getBasketballEraRules(currentYear).fatherTimeDeclineMultiplier,
    realPlayerDeterminism,
    remainingRealCurveDays: realPlayerDeterminism > 0
      ? getRemainingRealCurveDays(date, currentYear)
      : 365,
  };
  if (profile) {
    profile.realPlayerSettingsLookups += 1;
    profile.realCurveDateNormalizations += realPlayerDeterminism > 0 ? 1 : 0;
  }

  // Young international prospects (age < 19 in foreign men's leagues) freeze
  // their ratings — they haven't entered the NBA draft yet. Without this gate
  // they progress past K2 85 in Hokkaido / FCB / etc. before ever declaring,
  // creating a generation of foreign-born talent that never reaches the league.
  // Age 19+ triggers auto-declare-for-draft in seasonRollover.
  // Build mentor lookup once per day so each progressPlayer call can resolve
  // its mentor in O(1). Only includes players who are SOMEONE'S mentor — most
  // entries unused, but the map is a few hundred entries max.
  const mentorIds = new Set<string>();
  const mentorIdStart = perfEnabled ? progressionPerfNow() : 0;
  for (const p of players) {
    const mid = (p as any).mentorId;
    if (mid) mentorIds.add(mid);
  }
  const mentorIdScanMs = perfEnabled ? progressionPerfNow() - mentorIdStart : 0;
  const mentorLookup = new Map<string, NBAPlayer>();
  const mentorLookupStart = perfEnabled ? progressionPerfNow() : 0;
  for (const p of players) {
    if (mentorIds.has(p.internalId)) mentorLookup.set(p.internalId, p);
  }
  const mentorLookupMs = perfEnabled ? progressionPerfNow() - mentorLookupStart : 0;

  let noRatings = 0;
  let deadPlayers = 0;
  let retiredPlayers = 0;
  let futureProspects = 0;
  let progressedPlayers = 0;
  let changedPlayerReferences = 0;
  let changedRatingReferences = 0;
  let changedTimelineReferences = 0;
  const playerDurations: number[] = [];
  const playerLoopStart = perfEnabled ? progressionPerfNow() : 0;
  const result = players.map(player => {
    if (!player.ratings || player.ratings.length === 0) { noRatings += 1; return player; }
    if ((player as any).diedYear) { deadPlayers += 1; return player; }
    if (player.status === 'Retired') { retiredPlayers += 1; return player; }
    if (player.tid === -2) { futureProspects += 1; return player; } // future draft prospect — ratings frozen until drafted
    try {
      const playerStart = perfEnabled ? progressionPerfNow() : 0;
      const teamPlan = planByTid.get(player.tid);
      const devMultiplier = devMultByTid.get(player.tid) ?? 1;
      if (profile) profile.teamContextLookups += 2;
      const progressed = progressPlayer(
        player,
        currentYear,
        date,
        mentorLookup,
        teamPlan,
        devMultiplier,
        profile,
        recordTimelineSnapshot,
        dailyContext,
      );
      progressedPlayers += 1;
      if (progressed !== player) changedPlayerReferences += 1;
      if (progressed.ratings !== player.ratings) changedRatingReferences += 1;
      if (progressed.ovrTimeline !== player.ovrTimeline) changedTimelineReferences += 1;
      if (perfEnabled) playerDurations.push(progressionPerfNow() - playerStart);
      return progressed;
    } catch (_) {
      return player;
    }
  });
  const playerLoopMs = perfEnabled ? progressionPerfNow() - playerLoopStart : 0;
  if (perfEnabled && profile) {
    const sortedPlayerDurations = [...playerDurations].sort((a, b) => a - b);
    const percentile = (fraction: number): number => sortedPlayerDurations.length === 0
      ? 0
      : sortedPlayerDurations[Math.min(
        sortedPlayerDurations.length - 1,
        Math.max(0, Math.ceil(sortedPlayerDurations.length * fraction) - 1),
      )];
    const leafMs = profile.ratingPreparationMs + profile.baseModelMs + profile.playerContextMs
      + profile.attributeLoopMs + profile.physicalProjectionMs + profile.realPlayerAnchorMs
      + profile.ratingSummaryMs + profile.playerRebuildMs + profile.overallCalculationMs
      + profile.leagueCapMs + profile.timelineMs;
    recordSimulationPerf({
      engine: 'daily-progression-forensics',
      date: normalizeDate(date),
      totalMs: progressionPerfNow() - totalStart,
      teamSetupMs,
      mentorIdScanMs,
      mentorLookupMs,
      playerLoopMs,
      playerLoopOtherMs: Math.max(0, playerLoopMs - leafMs),
      playerMedianMs: percentile(0.5),
      playerP95Ms: percentile(0.95),
      playerSamples: playerDurations.length,
      ...profile,
      playersScanned: players.length,
      teamsScanned: teams?.length ?? 0,
      noRatings,
      deadPlayers,
      retiredPlayers,
      futureProspects,
      progressedPlayers,
      changedPlayerReferences,
      changedRatingReferences,
      changedTimelineReferences,
      mutations: changedPlayerReferences,
      noOp: changedPlayerReferences === 0,
    });
  }
  return result;
}

// ─── Seasonal Events ──────────────────────────────────────────────────────────
// Fire once per season (Oct 1). All outcomes seeded by player+year — stable.

const BREAKOUT_ATTRS   = ['ins', 'dnk', 'fg', 'tp', 'spd', 'oiq', 'pss'] as const;
const LATE_BLOOM_ATTRS = ['oiq', 'diq', 'fg', 'ft', 'pss', 'reb'] as const;
const BUST_ATTRS       = ['spd', 'jmp', 'endu', 'dnk'] as const;

export interface SeasonalEvent {
  playerId: string;
  playerName: string;
  type: 'breakout' | 'late_bloomer' | 'bust';
  attr: string;
  delta: number;
}

export function applySeasonalBreakouts(
  players: NBAPlayer[],
  currentYear: number,
  saveSeed: string = 'default',
): { players: NBAPlayer[]; events: SeasonalEvent[] } {
  const events: SeasonalEvent[] = [];

  const updated = players.map(player => {
    if (!player.ratings || player.ratings.length === 0) return player;
    if (player.status === 'Retired' || (player as any).diedYear) return player;
    if (player.tid < 0) return player;
    if (player.status === 'WNBA') return player;
    // Injured players skip the training-camp breakout event — they're not in camp.
    // They still accumulate daily progression (Chet Holmgren effect: quiet off-court work).
    if (((player as any).injury?.gamesRemaining ?? 0) > 0) return player;

    // 70/30 NBA/outside split: non-NBA players (FAs + overseas) get 43% hit rate
    // relative to NBA players. NBA=4% base, outside=~1.7% → realistic distribution.
    const nba = isNBAActive(player);
    const hitRate = nba ? 1.0 : 0.43;

    // Prefer born.year calculation — player.age can be stale/wrong from BBGM load
    const age = getPlayerAge(player, currentYear);
    if (age < 19) return player;
    const pid = player.internalId ?? player.name;
    const pSeed = `${pid}-${saveSeed}`;
    const ratingIdx = (() => {
      const i = player.ratings.findIndex((r: any) => r.season === currentYear);
      return i !== -1 ? i : player.ratings.length - 1;
    })();
    const rating: any = { ...player.ratings[ratingIdx] };

    let event: SeasonalEvent | null = null;

    // Breakout: 18–24, 4% NBA / ~1.7% outside (70/30 distribution via hitRate)
    if (age >= 18 && age <= 24) {
      if (seededRand(pSeed + 'breakout' + currentYear) < 0.04 * hitRate) {
        const attrList = [...BREAKOUT_ATTRS];
        const attr = attrList[seededInt(pSeed + 'battr' + currentYear, 0, attrList.length - 1)];
        const delta = seededInt(pSeed + 'bdelta' + currentYear, 6, 10);
        if (rating[attr] != null) {
          rating[attr] = Math.min(99, rating[attr] + delta);
          event = { playerId: pid, playerName: player.name, type: 'breakout', attr, delta };
        }
      }
    }

    // Late bloomer: 28–32, 4% NBA / ~1.7% outside
    if (!event && age >= 28 && age <= 32) {
      if (seededRand(pSeed + 'bloom' + currentYear) < 0.04 * hitRate) {
        const attrList = [...LATE_BLOOM_ATTRS];
        const attr = attrList[seededInt(pSeed + 'lattr' + currentYear, 0, attrList.length - 1)];
        const delta = seededInt(pSeed + 'ldelta' + currentYear, 3, 6);
        if (rating[attr] != null) {
          rating[attr] = Math.min(99, rating[attr] + delta);
          event = { playerId: pid, playerName: player.name, type: 'late_bloomer', attr, delta };
        }
      }
    }

    // Bust: 19–23, high pot, 3% NBA / ~1.3% outside
    if (!event && age >= 19 && age <= 23) {
      const pot = resolveDevelopmentPotentialBbgm(player, rating, age);
      if (pot >= 75 && seededRand(pSeed + 'bust' + currentYear) < 0.03 * hitRate) {
        const attrList = [...BUST_ATTRS];
        const attr = attrList[seededInt(pSeed + 'buattr' + currentYear, 0, attrList.length - 1)];
        const delta = seededInt(pSeed + 'budelta' + currentYear, 5, 8);
        if (rating[attr] != null) {
          rating[attr] = Math.max(20, rating[attr] - delta);
          event = { playerId: pid, playerName: player.name, type: 'bust', attr, delta: -delta };
        }
      }
    }

    if (!event) {
      // ── Injury-history athleticism hit ────────────────────────────────────
      // Players still injured when training camp opens (gamesRemaining > 30)
      // take a small additional athleticism hit from the layoff (ligament/muscle
      // adaptation loss). This is separate from normal decline — it represents
      // structural wear, not aging. NOT gated by the seasonal event roll.
      const injuredGames = (player as any).injury?.gamesRemaining ?? 0;
      if (injuredGames > 30) {
        const INJURY_PHYS_ATTRS = ['spd', 'jmp', 'endu', 'stre'] as const;
        let injuryModified = false;
        for (const attr of INJURY_PHYS_ATTRS) {
          if (rating[attr] == null) continue;
          // Deterministic drop: −1 to −2 for each physique attr, seeded per player+year+attr
          const drop = seededInt(pSeed + 'injhit' + currentYear + attr, 1, 2);
          rating[attr] = Math.max(20, rating[attr] - drop);
          injuryModified = true;
        }
        if (injuryModified) {
          const newRatings = player.ratings.map((r: any, i: number) => i === ratingIdx ? rating : r);
          const up: NBAPlayer = { ...player, ratings: newRatings };
          up.overallRating = EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')
            ? calculateLeagueOverall(rating)
            : calculatePlayerOverallForYear(up, currentYear);
          up.overallRating = clampPbaDraftRookieOverall(player, up.overallRating, currentYear, rating);
          return up;
        }
      }
      return player;
    }

    events.push(event);
    const newRatings = player.ratings.map((r: any, i: number) => i === ratingIdx ? rating : r);
    const updatedPlayer: NBAPlayer = { ...player, ratings: newRatings };
    updatedPlayer.overallRating = EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')
      ? calculateLeagueOverall(rating)
      : calculatePlayerOverallForYear(updatedPlayer, currentYear);
    updatedPlayer.overallRating = clampPbaDraftRookieOverall(player, updatedPlayer.overallRating, currentYear, rating);
    return updatedPlayer;
  });

  return { players: updated, events };
}

// ─── Fuzz (scout fog) ─────────────────────────────────────────────────────────
// Non-owned players in draft/FA scouting views show OVR ± up to 4 points.
// Own players always show exact rating.

export function getFuzzedOvr(
  player: NBAPlayer,
  viewerTid: number,
  scoutingLevel: number = 5,
): number {
  const base = player.overallRating ?? 60;
  if (player.tid === viewerTid) return base;

  const fuzzRange = Math.max(1, 5 - Math.floor(scoutingLevel / 2));
  const pid = player.internalId ?? player.name;
  const offset = (seededHash(pid + 'fuzz') % (fuzzRange * 2 + 1)) - fuzzRange;
  return Math.max(40, Math.min(99, base + offset));
}
