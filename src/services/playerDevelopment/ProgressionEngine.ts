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

function progressPlayer(player: NBAPlayer, currentYear: number, date: string): NBAPlayer {
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

      // Apply changeLimits (annual, divide by 365 for daily clamp)
      const [limMin, limMax] = formula.changeLimits(age);
      const capMult = devCapMultiplier(pos, rating, attr);
      const dailyMin = isFinite(limMin) ? limMin / 365 : -Infinity;
      const dailyMax = isFinite(limMax) ? limMax / 365 * capMult : Infinity;
      delta = Math.max(dailyMin, Math.min(dailyMax, delta));

      rating[attr] = Math.min(99, Math.max(20, rating[attr] + delta));
    }

    // Sync rating.ovr so potMod sees the real gap as attrs grow.
    // Generated prospects enter with a frozen nerfed value (e.g. 29) — without this
    // potMod is always 1.0 and they grow unconstrained past their pot ceiling.
    const ovrSum = ALL_ATTRS.reduce((s, a) => s + (rating[a] ?? 0), 0);
    rating.ovr = Math.round(ovrSum / ALL_ATTRS.length);
  }

  // Rebuild ratings array
  const newRatings = player.ratings.map((r: any, i: number) => i === ratingIdx ? rating : r);

  const updatedPlayer: NBAPlayer = { ...player, ratings: newRatings };

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
      return progressPlayer(player, currentYear, date);
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
