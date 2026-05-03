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

import { NBAPlayer } from '../../types';
import { calculatePlayerOverallForYear } from '../../utils/playerRatings';
import { applyLeagueDisplayScale, LEAGUE_DISPLAY_MULTIPLIERS } from '../../hooks/useLeagueScaledRatings';
import { calculateLeagueOverall } from '../logic/leagueOvr';
import { convertTo2KRating, normalizeDate } from '../../utils/helpers';
import { EXTERNAL_LEAGUE_OVR_CAP } from '../../constants';
import { getFocusWeights, ARCHETYPE_PROFILES } from '../../TeamTraining/constants/trainingarchetypes';
import { calculateMentorExp } from '../training/mentorScore';

// External league players have pre-scaled attrs at fetch time.
// calculatePlayerOverallForYear on scaled attrs floors at Math.max(40,...) → display 66.
// Use calculateLeagueOverall (calcRawOvr, no floor, no extra mult) for their OVR instead.
const EXTERNAL_LEAGUE_STATUSES = new Set([
  'G-League', 'PBA', 'Euroleague', 'B-League', 'Endesa', 'China CBA', 'NBL Australia',
]);

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

function seededHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
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

function calcBaseChange(age: number, seed: string, pot: number = 70): number {
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

const ATTR_FORMULAS: Record<string, AttrFormula> = {
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
  mentorLookup?: Map<string, NBAPlayer>
): NBAPlayer {
  if (!player.ratings || player.ratings.length === 0) return player;

  const ratingIdx = (() => {
    const i = player.ratings.findIndex((r: any) => r.season === currentYear);
    return i !== -1 ? i : player.ratings.length - 1;
  })();
  const rating: any = { ...player.ratings[ratingIdx] };

  // Prefer born.year calculation — player.age can be stale/wrong from BBGM load
  const age = getPlayerAge(player, currentYear);
  const pid = player.internalId ?? player.name;
  const isOverseasPlayer = !!LEAGUE_DISPLAY_MULTIPLIERS[player.status ?? ''];
  const pos = player.pos ?? 'F';

  // Freeze all development for stashable under-19 players until they age into
  // draft-eligible progression territory.
  if (age < 19) {
    return player;
  }

  const pot: number = rating.pot ?? 70;

  // Per-player developmental fingerprint: stable offset seeded ONLY by pid (not year).
  // Shifts each player's effective age curve — some 26-year-olds are still improving,
  // others already declining. Range [-2, +2] annual units → visible OVR divergence over a season.
  const careerOffset = seededUniform(pid + 'career', -2.0, 2.0);

  // MVP count — computed once and reused for both base dampening and per-attr softening.
  // Awards are stored as 'Most Valuable Player' (via PLAYER_AWARD_TYPE_MAP in autoResolvers).
  // Cap at 4; beyond that the math is already very forgiving.
  const mvpCount = Math.min(4, ((player as any).awards ?? []).filter(
    (a: any) => a.type === 'Most Valuable Player' || a.type === 'MVP',
  ).length);

  // Annual base change for this player this season (deterministic per pid+year)
  // Divide by 365 for daily application. pot passed for wine-aging modifier.
  // devSpeed is the hidden per-player trajectory scalar set at draft generation
  // (0.55–0.80 under-developer / 0.90–1.10 normal / 1.15–1.40 hidden gem). Only
  // tilts positive growth — decline years (negative base) shouldn't be softened
  // for slow developers.
  const devSpeed: number = rating.devSpeed ?? 1.0;
  let baseRaw = calcBaseChange(age, pid + currentYear, pot);

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

  const rawBase = baseRaw > 0 ? baseRaw * devSpeed : baseRaw;
  // Only apply the offset when the base isn't already large (don't double-boost elite youth)
  const annualBase = rawBase + (Math.abs(rawBase) < 4 ? careerOffset : careerOffset * 0.3);
  const dailyBase = annualBase / 365;

  // Skip attribute delta if base is exactly 0 and not overseas (peak-age NBA player)
  const skipDelta = dailyBase === 0 && !isOverseasPlayer;

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
    const funnelGrowthMult = (attr: string): number => {
      if (!focus) return 1.0;
      const w = (focus.rawWeights as any)[attr] ?? 0;
      return 1.0 + Math.max(0, w) * 4; // boost only — never reduces non-focused
    };
    const funnelRegressMult = (attr: string): number => {
      if (!focus) return 1.0;
      const w = (focus.rawWeights as any)[attr] ?? 0;
      // Focused attrs regress less (anti-Korver-loses-shooting). Cap at 60% reduction.
      return 1.0 - Math.min(0.6, Math.max(0, w) * 1.6);
    };

    // Mentor multiplier per docs/mentorship.md §3 + Hakeem-Dwight Rule:
    //   - Regression buffer: mentor mitigates NEGATIVE deltas (anti-regression).
    //     Caps at 30% reduction; scales with mentor's EXP (heavy mentors help more).
    //   - IQ tick: tiny upward bias on oiq/diq when mentor is elite. Mentees DON'T
    //     suddenly become stars from mentorship — boost is a fraction of natural growth.
    //   - Skill/physical attrs ignore mentor entirely (Hakeem-Dwight rule).
    const mentor = mentorLookup && (player as any).mentorId ? mentorLookup.get((player as any).mentorId) : undefined;
    const mentorExp = mentor ? calculateMentorExp(mentor).exp : 0;
    // 0 → 0% reduction. 2000 EXP → 30% (cap). Linear in between.
    const mentorMitigation = Math.min(0.3, mentorExp / 6666);
    // 0 → 0% IQ bonus. 2000 EXP → 25% bonus on positive oiq/diq deltas.
    const mentorIQBonus = Math.min(0.25, mentorExp / 8000);

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
    const IQ_ATTRS = new Set(['oiq', 'diq']);

    for (const attr of ALL_ATTRS) {
      if (rating[attr] == null) continue;

      const formula = ATTR_FORMULAS[attr];
      if (!formula) continue;

      // ageModifier for endu needs the seed
      let mod = attr === 'endu'
        ? (ATTR_FORMULAS.endu.ageModifier as any)(age, pid + currentYear + 'endu')
        : formula.ageModifier(age);

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
      const unifMult = seededUniform(pid + date + attr, 0.4, 1.4);
      let delta = effectiveDaily * unifMult;

      // Funnel — weight-driven multiplier. Skipped for Balanced (default).
      if (focus && delta !== 0) {
        delta *= delta > 0 ? funnelGrowthMult(attr) : funnelRegressMult(attr);
      }

      // Mentor effect — anti-regression on all attrs, small IQ-only growth bonus.
      if (mentorMitigation > 0 && delta < 0) {
        delta *= (1 - mentorMitigation);
      }
      if (mentorIQBonus > 0 && delta > 0 && IQ_ATTRS.has(attr)) {
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

      // Apply changeLimits (annual, divide by 365 for daily clamp)
      const [limMin, limMax] = formula.changeLimits(age);
      const capMult = devCapMultiplier(pos, rating, attr);
      const dailyMin = isFinite(limMin) ? limMin / 365 : -Infinity;
      const dailyMax = isFinite(limMax) ? limMax / 365 * capMult : Infinity;
      delta = Math.max(dailyMin, Math.min(dailyMax, delta));

      rating[attr] = Math.min(99, Math.max(20, rating[attr] + delta));
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

    // Sync rating.ovr so potMod sees the real gap as attrs grow.
    // Generated prospects enter with a frozen nerfed value (e.g. 29) — without this
    // potMod is always 1.0 and they grow unconstrained past their pot ceiling.
    const ovrSum = ALL_ATTRS.reduce((s, a) => s + (rating[a] ?? 0), 0);
    rating.ovr = Math.round(ovrSum / ALL_ATTRS.length);
  }

  // Rebuild ratings array
  const projectedWeight: number | undefined = (rating as any).__projectedWeight;
  if (projectedWeight !== undefined) delete (rating as any).__projectedWeight;
  const newRatings = player.ratings.map((r: any, i: number) => i === ratingIdx ? rating : r);

  const updatedPlayer: NBAPlayer = {
    ...player,
    ratings: newRatings,
    ...(projectedWeight !== undefined ? {
      weight: Math.round(projectedWeight),
      origWeight: player.origWeight ?? player.weight,
    } : {}),
  };

  // External league players: attrs are pre-scaled at fetch (e.g. G-League ×0.75).
  // calculatePlayerOverallForYear on those scaled attrs floors at Math.max(40,...) → display 66.
  // Use calculateLeagueOverall (no extra mult, no NBA-calibrated floor) to keep their OVR correct.
  if (EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')) {
    updatedPlayer.overallRating = calculateLeagueOverall(rating);
  } else {
    updatedPlayer.overallRating = calculatePlayerOverallForYear(updatedPlayer, currentYear);
  }

  // Fix 8: cap adult external-league progression at the league's OVR ceiling.
  // Prevents NBA-boosted returners (e.g. high-OVR cut player returning to B-League)
  // from staying above the realistic ceiling for their league each tick.
  // Youth (<19) is already frozen upstream in applyDailyProgression; no double-gate needed.
  if (EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')) {
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

  // Weekly OVR snapshot — record every Sunday so the 1Y chart has ~52 data points
  // Store raw BBGM float so sub-1pt weekly trends are visible in the chart
  try {
    const dateISO = normalizeDate(date); // "Apr 20, 2026" → "2026-04-20"
    const d = new Date(dateISO + 'T00:00:00Z');
    if (d.getUTCDay() === 0) { // 0 = Sunday
      const snap = { date: dateISO, ovr: updatedPlayer.overallRating };
      const prev = updatedPlayer.ovrTimeline ?? [];
      if (prev.length === 0 || prev[prev.length - 1].date !== dateISO) {
        updatedPlayer.ovrTimeline = [...prev, snap].slice(-56);
      }
    }
  } catch (_) { /* never block progression for chart bookkeeping */ }

  return updatedPlayer;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function applyDailyProgression(
  players: NBAPlayer[],
  isPlayoffs: boolean,
  date: string,
  currentYear: number,
): NBAPlayer[] {
  if (isPlayoffs) return players;

  // Young international prospects (age < 19 in foreign men's leagues) freeze
  // their ratings — they haven't entered the NBA draft yet. Without this gate
  // they progress past K2 85 in Hokkaido / FCB / etc. before ever declaring,
  // creating a generation of foreign-born talent that never reaches the league.
  // Age 19+ triggers auto-declare-for-draft in seasonRollover.
  const EXTERNAL_MENS_LEAGUES = new Set([
    'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia',
  ]);

  // Build mentor lookup once per day so each progressPlayer call can resolve
  // its mentor in O(1). Only includes players who are SOMEONE'S mentor — most
  // entries unused, but the map is a few hundred entries max.
  const mentorIds = new Set<string>();
  for (const p of players) {
    const mid = (p as any).mentorId;
    if (mid) mentorIds.add(mid);
  }
  const mentorLookup = new Map<string, NBAPlayer>();
  for (const p of players) {
    if (mentorIds.has(p.internalId)) mentorLookup.set(p.internalId, p);
  }

  return players.map(player => {
    if (!player.ratings || player.ratings.length === 0) return player;
    if ((player as any).diedYear) return player;
    if (player.status === 'Retired') return player;
    if (player.tid === -2) return player; // future draft prospect — ratings frozen until drafted
    const age = (player as any).age;
    if (typeof age === 'number' && age < 19 && EXTERNAL_MENS_LEAGUES.has((player as any).status ?? '')) {
      return player;
    }
    try {
      return progressPlayer(player, currentYear, date, mentorLookup);
    } catch (_) {
      return player;
    }
  });
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
      const pot: number = rating.pot ?? 99;
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
