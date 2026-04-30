import { NBATeam as Team, NBAPlayer as Player, Game, LeagueStats } from '../../../types';
import { StatGenerator } from '../StatGenerator';
import { GameResult } from '../types';
import { InjurySystem, enforceSeasonEndingMinimum } from '../InjurySystem';
import { calculateTeamStrength, calculateTeamStrengthWithMinutes } from '../../../utils/playerRatings';
import { getGameplan } from '../../../store/gameplanStore';
import { calcTeamRatings, expectedTeamScore } from '../teamratinghelper';
import { normalRandom } from '../utils';
import { simulateQuarters } from './quarters';
import { pickGameWinner } from './clutch';
import { generateSyntheticPM, applyPMToStats } from './syntheticPM';
import { setClubDebuffs, clearClubDebuffs } from '../StatGenerator/helpers';
import { generateFight } from '../../FightGenerator';
import { fetchGamePhotos } from '../../ImagnPhotoService';
import { Defense2KService } from '../../Defense2KService';
import { SimulatorKnobs, KNOBS_DEFAULT, KNOBS_PRESEASON, KNOBS_ALL_STAR, KNOBS_RISING_STARS, KNOBS_CELEBRITY, KNOBS_BLEAGUE, KNOBS_EUROLEAGUE, KNOBS_PBA, getKnobs } from '../SimulatorKnobs';
import { HighlightGenerator } from '../HighlightGenerator';
import { getInjuries, getRandomInjury } from '../../injuryService';
import { getScoringOptions, getScoringOptionBiases, getCoachingPenalty } from '../../../store/scoringOptionsStore';
import { getLockedStrategy } from '../../../store/coachStrategyLockStore';
import { getSystemFitPenalty, getSystemKnobMods } from '../../../store/coachSystemStore';
import { getExhibitionQL } from '../../allStar/AllStarWeekendOrchestrator';

/**
 * Top-8 pace factor from roster traits. Mirrors the tempo/fastBreak/earlyOffense
 * formula in coachSliders.ts:60-64 (without league normalization) and blends
 * them into one scalar. Returns a multiplier near 1.0:
 *  - All-run team (Warriors-ish)  → ~1.06
 *  - Balanced roster              → ~1.00
 *  - Grind-it-out (post-heavy)    → ~0.94
 * Applied to the shared paceRoll in _simulateGameOnce so the visible score
 * and per-player stat volume both move together.
 */
function computePaceFactor(roster: Player[]): number {
  if (!roster.length) return 1.0;
  const sorted = [...roster].sort((a: any, b: any) =>
    (b.rating2K || b.bbgmOvr || 50) - (a.rating2K || a.bbgmOvr || 50)
  ).slice(0, 8);
  const avg = (key: string) =>
    sorted.reduce((s: number, p: any) => s + (p.ratings?.[0]?.[key] ?? 50), 0) / sorted.length;
  const spd = avg('spd'), pss = avg('pss'), oiq = avg('oiq'), reb = avg('reb');
  const tempo       = spd * 0.3 + pss * 0.2 + oiq * 0.5;
  const fastBreak   = tempo * 0.6 + spd * 0.4 - reb * 0.3;
  const earlyOff    = tempo * 0.4 + fastBreak * 0.4 + reb * 0.2;
  const combined    = tempo * 0.5 + earlyOff * 0.3 + fastBreak * 0.2;
  // Map ~35–75 → 0.93–1.07, clamped to keep extreme rosters sane.
  return Math.max(0.90, Math.min(1.10, 1.0 + (combined - 55) / 280));
}

/**
 * Shot-distribution mults derived from the Coach Sliders. When the user has
 * locked strategy, use the snapshot; otherwise compute fresh from roster so
 * the sim still reflects whatever the UI would show right now.
 *
 * The four main sliders (shotInside/Close/Medium/3PT) always sum to 100, so
 * 25 each = baseline 1.0×. Attack Basket and Post Plays are subtle biases
 * (25 = neutral, 0 = suppress, 100 = crank) layered on top of rim/lowPost.
 */
function computeShotMults(
  teamId: number,
  roster: Player[]
): { rimRateMult: number; lowPostRateMult: number; midRangeRateMult: number; threePointRateMult: number } {
  const locked = getLockedStrategy(teamId);

  // Raw slider-like values, either from lock or derived from roster.
  let inside: number, close: number, medium: number, three: number, attack: number, post: number;

  if (locked) {
    ({ shotInside: inside, shotClose: close, shotMedium: medium, shot3pt: three,
       attackBasket: attack, postPlayers: post } = locked.sliders);
  } else {
    // Lightweight inline derivation — mirror coachSliders.ts shot formulas enough
    // to respect roster identity without pulling in league normalization.
    const sorted = [...roster].sort((a: any, b: any) =>
      (b.rating2K || b.bbgmOvr || 50) - (a.rating2K || a.bbgmOvr || 50)
    ).slice(0, 8);
    if (!sorted.length) {
      return { rimRateMult: 1, lowPostRateMult: 1, midRangeRateMult: 1, threePointRateMult: 1 };
    }
    const avg = (key: string) =>
      sorted.reduce((s: number, p: any) => s + (p.ratings?.[0]?.[key] ?? 50), 0) / sorted.length;
    const hgt = avg('hgt'), stre = avg('stre'), dnk = avg('dnk'), ins = avg('ins');
    const fg = avg('fg'), tp = avg('tp');
    const rawInside = hgt * 0.4 + dnk * 0.4 + stre * 0.2;
    const rawClose  = hgt * 0.3 + ins * 0.5 + stre * 0.2;
    const rawMedium = fg * 0.7 + hgt * 0.3;
    const raw3pt    = tp * 1.0;
    const rawTotal  = rawInside + rawClose + rawMedium + raw3pt || 1;
    inside = (rawInside / rawTotal) * 100;
    close  = (rawClose  / rawTotal) * 100;
    medium = (rawMedium / rawTotal) * 100;
    three  = (raw3pt    / rawTotal) * 100;
    attack = Math.min(80, Math.max(10, dnk * 0.5 + stre * 0.3));
    post   = Math.min(50, Math.max(1, ins * 0.4 - tp * 0.2));
  }

  const main = (inside + close + medium + three) || 100;
  const norm = (v: number) => (v / main) * 4; // 25% → 1.0×

  // Attack Basket / Post Plays are gentler biases (center 25 = 1.0×).
  const attackBias = 1 + (attack - 25) / 150;
  const postBias   = 1 + (post   - 25) / 150;

  return {
    rimRateMult:        Math.max(0.3, norm(inside) * attackBias),
    lowPostRateMult:    Math.max(0.3, norm(close)  * postBias),
    midRangeRateMult:   Math.max(0.3, norm(medium)),
    threePointRateMult: Math.max(0.3, norm(three)),
  };
}

/**
 * Resolve a team's defense/coaching sliders. Locked strategy wins; otherwise
 * derive lightweight values from roster traits. Zone / Double Team default
 * low because those are coaching *choices*, not talent signals.
 */
function getDefenseSliders(teamId: number, roster: Player[]): {
  defensivePressure: number; helpDefense: number; zoneUsage: number;
  doubleTeam: number; runPlays: number; crashOffensiveGlass: number;
} {
  const locked = getLockedStrategy(teamId);
  if (locked) {
    return {
      defensivePressure:   locked.sliders.defensivePressure,
      helpDefense:         locked.sliders.helpDefense,
      zoneUsage:           locked.sliders.zoneUsage,
      doubleTeam:          locked.sliders.doubleTeam,
      runPlays:            locked.sliders.runPlays,
      crashOffensiveGlass: locked.sliders.crashOffensiveGlass,
    };
  }
  if (!roster.length) {
    return { defensivePressure: 50, helpDefense: 50, zoneUsage: 2, doubleTeam: 2, runPlays: 100, crashOffensiveGlass: 50 };
  }
  const sorted = [...roster].sort((a: any, b: any) =>
    (b.rating2K || b.bbgmOvr || 50) - (a.rating2K || a.bbgmOvr || 50)
  ).slice(0, 8);
  const avg = (key: string) =>
    sorted.reduce((s: number, p: any) => s + (p.ratings?.[0]?.[key] ?? 50), 0) / sorted.length;
  const spd = avg('spd'), diq = avg('diq'), hgt = avg('hgt');
  const reb = avg('reb'), stre = avg('stre');
  return {
    defensivePressure:   Math.min(90, Math.max(20, spd * 0.4 + diq * 0.6)),
    helpDefense:         Math.min(90, Math.max(20, diq * 0.6 + hgt * 0.4)),
    zoneUsage:           2,
    doubleTeam:          2,
    runPlays:            100, // default: coach has a system
    crashOffensiveGlass: Math.min(90, Math.max(20, reb * 0.7 + stre * 0.3)),
  };
}

/**
 * The opponent's defensive sliders → knob modifiers applied to YOUR stat gen.
 * Returns unit-multipliers (1.0 = neutral). Caller compounds these into
 * existing knobs rather than replacing them.
 */
function defensiveStackOnOpponent(d: ReturnType<typeof getDefenseSliders>): {
  tovMult: number; ftRateMult: number; interiorEffMult: number;
  rimRateMult: number; threePointRateMult: number;
} {
  const pressureN = (d.defensivePressure - 50) / 50;   // −1..+1
  const helpN     = (d.helpDefense       - 50) / 50;
  const zoneN     = d.zoneUsage / 100;                 // 0..1
  return {
    // Defensive Pressure: opp turns it over more, but also fouls you more
    tovMult:            1 + pressureN * 0.15,
    ftRateMult:         1 + pressureN * 0.10,
    // Help Defense: opp paint FG% ↓
    interiorEffMult:    1 - helpN * 0.08,
    // Zone Usage: opp rim attempts ↓
    rimRateMult:        1 - zoneN * 0.15,
    // Help + Zone both push opp to kick it out → more 3PA
    threePointRateMult: (1 + helpN * 0.10) * (1 + zoneN * 0.12),
  };
}

/**
 * Roster → internalIds sorted by usage*overall (same formula as CoachingView:137).
 * Feeds getScoringOptionBiases so user overrides are measured against the team's
 * "natural" top scorers, not the sim's rotation order.
 */
function buildBaselineOrder(roster: Player[]): string[] {
  return [...roster]
    .sort((a: any, b: any) => {
      const getUsage = (p: any) => {
        if (!p.ratings || !p.ratings[0]) return 0;
        const r = p.ratings[0];
        const usage = r.ins * 0.23 + r.dnk * 0.15 + r.fg * 0.15 + r.tp * 0.15
                    + r.spd * 0.08 + r.hgt * 0.08 + r.drb * 0.08 + r.oiq * 0.08;
        const ovr = p.rating2K || p.bbgmOvr || r.ovr || 50;
        return usage * 0.5 + ovr * 0.5;
      };
      return getUsage(b) - getUsage(a);
    })
    .map((p: any) => String(p.internalId ?? p.pid));
}
/**
 * Maps a team's final score to a shot-efficiency multiplier.
 * High-scoring games reflect hot shooting; low-scoring games are grind nights.
 * Curve: +1% efficiency per 3 pts above average (avg ≈ 114).
 * Clamped to [0.90, 1.12] so extreme scores don't produce nonsense lines.
 * Long-run league average is preserved because score distributions are symmetric.
 */
function getEfficiencyMultFromScore(teamPts: number, avgPts = 114): number {
  const delta = (teamPts - avgPts) / 3;
  // Wider range [0.82, 1.22]: 165-pt game → 1.22 (22% more efficient, fewer FGA, more FT)
  // 90-pt game → 0.88 (brickfest — lower FG%, more attempts)
  return Math.max(0.82, Math.min(1.22, 1.0 + delta * 0.013));
}

export class GameSimulator {

  private static calcWinProb(strengthDiff: number): number {
    return 1 / (1 + Math.exp(-strengthDiff * 0.09));
  }

  private static simulateOTPeriod(
    isDecisive: boolean,
    strengthDiff: number,
    overtimeDuration: number = 5
  ): { homePts: number; awayPts: number } {
    const durationScale = Math.max(0.2, overtimeDuration / 5);
    const scoringScale = Math.sqrt(durationScale);

    if (!isDecisive) {
      const basePts = Math.max(2, Math.round(normalRandom(11.5 * durationScale, 2.0 * scoringScale)));
      return { homePts: basePts, awayPts: basePts };
    }

    const winnerPts  = Math.max(2,  Math.round(normalRandom(13.0 * durationScale, 2.5 * scoringScale)));
    const otMargin   = Math.max(1,  Math.round(Math.abs(normalRandom(3.5 * scoringScale, 2.0))));
    const loserPts   = Math.max(0,  winnerPts - otMargin);

    const homeWinsOT = Math.random() < (0.50 + strengthDiff * 0.008);

    return homeWinsOT
      ? { homePts: winnerPts, awayPts: loserPts }
      : { homePts: loserPts,  awayPts: winnerPts };
  }

  static simulateGame(
    homeTeam: Team,
    awayTeam: Team,
    players: Player[],
    gameId: number,
    date: string,
    playerApproval: number = 50,
    homeOverridePlayers?: Player[],
    awayOverridePlayers?: Player[],
    isAllStar?: boolean,
    isRisingStars?: boolean,
    riggedForTid?: number,
    homeKnobs: SimulatorKnobs = KNOBS_DEFAULT,
    awayKnobs: SimulatorKnobs = KNOBS_DEFAULT,
  ): GameResult {
    // 500-retry loop to enforce rigged result
    for (let attempt = 0; attempt < 500; attempt++) {
      const result = this._simulateGameOnce(homeTeam, awayTeam, players, gameId, date, playerApproval, homeOverridePlayers, awayOverridePlayers, isAllStar, isRisingStars, homeKnobs, awayKnobs);
      if (!riggedForTid || result.winnerId === riggedForTid) {
        return result;
      }
    }
    // Fallback: return last attempt even if rig failed (shouldn't happen with 500 tries)
    return this._simulateGameOnce(homeTeam, awayTeam, players, gameId, date, playerApproval, homeOverridePlayers, awayOverridePlayers, isAllStar, isRisingStars, homeKnobs, awayKnobs);
  }

  private static _simulateGameOnce(
    homeTeam: Team,
    awayTeam: Team,
    players: Player[],
    gameId: number,
    date: string,
    playerApproval: number = 50,
    homeOverridePlayers?: Player[],
    awayOverridePlayers?: Player[],
    isAllStar?: boolean,
    isRisingStars?: boolean,
    homeKnobs: SimulatorKnobs = KNOBS_DEFAULT,
    awayKnobs: SimulatorKnobs = KNOBS_DEFAULT,
  ): GameResult {

    // Use minutes-weighted strength when a Gameplan exists. Benching your star
    // and playing bums shifts each player's contribution by their minute share
    // → W/L impact. Tank jobs work, ironman star strats reward, flat 24/24/24/...
    // is sub-optimal because the star's contribution drops below ideal.
    const resolveStrength = (tid: number, override?: Player[]) => {
      if (override) return calculateTeamStrength(tid, players, override);
      const plan = getGameplan(tid);
      if (plan && Object.keys(plan.minuteOverrides).length > 0) {
        const roster = players.filter(p => p.tid === tid && (!p.injury || p.injury.gamesRemaining <= 0));
        return calculateTeamStrengthWithMinutes(roster, plan.minuteOverrides);
      }
      return calculateTeamStrength(tid, players);
    };
    const baseHomeStrength = resolveStrength(homeTeam.id, homeOverridePlayers);
    const baseAwayStrength = resolveStrength(awayTeam.id, awayOverridePlayers);

    // Coaching penalty — picking the wrong 1st/2nd/3rd option actually hurts W/L,
    // not just stat distribution. Skip for exhibition/override rosters.
    const homeCoachPenalty = homeOverridePlayers
      ? 0
      : getCoachingPenalty(
          buildBaselineOrder(homeOverridePlayers ?? players.filter(p => p.tid === homeTeam.id)),
          getScoringOptions(homeTeam.id)
        );
    const awayCoachPenalty = awayOverridePlayers
      ? 0
      : getCoachingPenalty(
          buildBaselineOrder(awayOverridePlayers ?? players.filter(p => p.tid === awayTeam.id)),
          getScoringOptions(awayTeam.id)
        );
    // System-fit penalty — wrong system reduces team strength + shooting efficiency.
    // Skip for exhibition/override rosters (same guard as coach penalty above).
    const homeSysFit = homeOverridePlayers ? null : getSystemFitPenalty(homeTeam.id);
    const awaySysFit = awayOverridePlayers ? null : getSystemFitPenalty(awayTeam.id);

    const homeStrength = baseHomeStrength - homeCoachPenalty - (homeSysFit?.strengthPenalty ?? 0);
    const awayStrength = baseAwayStrength - awayCoachPenalty - (awaySysFit?.strengthPenalty ?? 0);

    const HOME_COURT  = 3;
    const strengthDiff = (homeStrength - awayStrength) + HOME_COURT;
    const winProb      = Math.max(0.07, Math.min(0.93, this.calcWinProb(strengthDiff)));
    const homeWins     = Math.random() < winProb;

    const absGap   = Math.abs(homeStrength - awayStrength);
    const baseLead = Math.max(2, Math.round(
      absGap * 0.9 + Math.abs(normalRandom(0, 6)) + 2
    ));

    const homeRatings = calcTeamRatings(homeTeam.id, players);
    const awayRatings = calcTeamRatings(awayTeam.id, players);

    const homeExpected = expectedTeamScore(homeRatings.offRating, awayRatings.defRating, homeRatings.pace);
    const awayExpected = expectedTeamScore(awayRatings.offRating, homeRatings.defRating, awayRatings.pace);

    // Score floors scale by game length — All-Star 3-min quarters (12 min total) need
    // ~22-pt floors, not the 85/80 designed for full-length 48-min NBA games.
    const homeQL = homeKnobs.quarterLength ?? 12;
    const awayQL = awayKnobs.quarterLength ?? 12;
    const lengthScale = ((homeQL + awayQL) / 2 * 4) / 48; // 1.0 for regulation, 0.25 for 3-min All-Star
    const homeMinFloor = Math.max(20, Math.round(85 * lengthScale));
    const awayMinFloor = Math.max(18, Math.round(80 * lengthScale));
    const homeRegScore = Math.max(homeMinFloor, Math.round(normalRandom(homeExpected * lengthScale, 8 * lengthScale)));
    const awayRegScore = Math.max(awayMinFloor, Math.round(normalRandom(awayExpected * lengthScale, 8 * lengthScale)));

    let winnerScore = Math.max(homeRegScore, awayRegScore);
    let loserScore  = Math.min(homeRegScore, awayRegScore);

    // Prevent tied scores outside of OT path
    if (winnerScore === loserScore) {
      if (Math.random() < 0.5) winnerScore += 1;
      else loserScore = Math.max(0, loserScore - 1);
    }

    let isOT    = false;
    let otCount = 0;
    let finalHomeScore: number;
    let finalAwayScore: number;

    const overtimeDuration = Math.max(1, ((homeKnobs.overtimeDuration ?? 5) + (awayKnobs.overtimeDuration ?? 5)) / 2);
    const overtimeEnabled = (homeKnobs.overtimeEnabled ?? true) && (awayKnobs.overtimeEnabled ?? true);
    const enabledOtCaps = [homeKnobs, awayKnobs]
      .filter(k => k.maxOvertimesEnabled)
      .map(k => Math.max(0, Math.floor(k.maxOvertimes ?? 0)));
    const maxOvertimes = enabledOtCaps.length > 0
      ? Math.min(...enabledOtCaps)
      : Number.POSITIVE_INFINITY;
    const otChance = overtimeEnabled && maxOvertimes !== 0
      ? baseLead <= 4 ? 0.38 : baseLead <= 8 ? 0.06 : 0
      : 0;

    if (otChance > 0 && Math.random() < otChance) {
      isOT    = true;
      const rolledOtCount = Math.random() < 0.07 ? 3 : Math.random() < 0.22 ? 2 : 1;
      otCount = Math.min(rolledOtCount, maxOvertimes);

      const regTie  = loserScore;
      let homeOtPts = 0;
      let awayOtPts = 0;

      for (let ot = 1; ot <= otCount; ot++) {
        const isDecisive = ot === otCount;
        const { homePts, awayPts } = this.simulateOTPeriod(isDecisive, strengthDiff, overtimeDuration);
        homeOtPts += homePts;
        awayOtPts += awayPts;
      }

      finalHomeScore = regTie + homeOtPts;
      finalAwayScore = regTie + awayOtPts;

      if (finalHomeScore === finalAwayScore) {
        if (Math.random() < (0.50 + strengthDiff * 0.005)) finalHomeScore += 1;
        else finalAwayScore += 1;
      }

    } else {
      finalHomeScore = homeWins ? winnerScore : loserScore;
      finalAwayScore = homeWins ? loserScore  : winnerScore;
    }

    // ── Team night dice ──────────────────────────────────────────────────────
    // pace roll: shared (both teams) — creates slow grinds vs fast shootouts
    // eff roll:  independent per team — creates blowouts and cold-shooting nights
    // Both are uniform with mean 1.0 → long-run player averages are preserved
    const homePlayers = homeOverridePlayers ?? players.filter(p => p.tid === homeTeam.id);
    const awayPlayers = awayOverridePlayers ?? players.filter(p => p.tid === awayTeam.id);
    const home2KDef = Defense2KService.getTeamDefense(homePlayers);
    const away2KDef = Defense2KService.getTeamDefense(awayPlayers);

    // Aura centered at 70: elite (82) → +0.06 debuff on opponent; bad (60) → -0.05 buff to opponent
    const homeDefAura = (home2KDef.overallDef - 70) * 0.005;
    const awayDefAura = (away2KDef.overallDef - 70) * 0.005;

    // Tempo / Early Offense / Fast Break: both teams pull the game toward their
    // preferred pace. Actual pace ≈ average of the two rosters' pace factors.
    // Run-and-gun vs run-and-gun → 130-128 shootouts; two grinders → 95-93.
    const homePaceFactor = homeOverridePlayers ? 1.0 : computePaceFactor(homePlayers);
    const awayPaceFactor = awayOverridePlayers ? 1.0 : computePaceFactor(awayPlayers);
    const sharedPaceFactor = (homePaceFactor + awayPaceFactor) / 2;

    const paceRoll    = (0.96 + Math.random() * 0.20) * sharedPaceFactor;   // 0.90–1.10 × pace bias
    // Crash Offensive Glass: crashing hard → fewer bodies back on D → opponent
    // gets more transition points. Neutral = 50 → no effect. 100 → +3% to opp.
    const homeCrashPre = homeOverridePlayers ? 50 : getDefenseSliders(homeTeam.id, homePlayers).crashOffensiveGlass;
    const awayCrashPre = awayOverridePlayers ? 50 : getDefenseSliders(awayTeam.id, awayPlayers).crashOffensiveGlass;
    const awayTransitionBonus = 1 + ((homeCrashPre - 50) / 50) * 0.03;
    const homeTransitionBonus = 1 + ((awayCrashPre - 50) / 50) * 0.03;
    const homeEffRoll = ((0.88 + Math.random() * 0.24) - awayDefAura) * homeTransitionBonus;
    const awayEffRoll = ((0.88 + Math.random() * 0.24) - homeDefAura) * awayTransitionBonus;

    // Same length scale applied below — 3-min quarters can't have a 75-pt floor.
    const homePostFloor = Math.max(18, Math.round(75 * lengthScale));
    const awayPostFloor = Math.max(16, Math.round(70 * lengthScale));
    finalHomeScore = Math.max(homePostFloor, Math.round(finalHomeScore * paceRoll * homeEffRoll));
    finalAwayScore = Math.max(awayPostFloor, Math.round(finalAwayScore * paceRoll * awayEffRoll));

    // Exhibition score boost — applied BEFORE stat generation so player totals
    // match the scoreboard.  paceMultiplier in knobs is kept at 1.0 for All-Star
    // to avoid double-counting.
    const homeExhibMult = homeKnobs.exhibitionScoreMult ?? 1.0;
    const awayExhibMult = awayKnobs.exhibitionScoreMult ?? 1.0;
    if (homeExhibMult !== 1.0) finalHomeScore = Math.max(homePostFloor, Math.round(finalHomeScore * homeExhibMult));
    if (awayExhibMult !== 1.0) finalAwayScore = Math.max(awayPostFloor, Math.round(finalAwayScore * awayExhibMult));

    if (finalHomeScore === finalAwayScore) {
      if (Math.random() < 0.5) finalHomeScore += 1;
      else finalAwayScore += 1;
    }

    const homeWinsFinal = finalHomeScore > finalAwayScore;

    const availablePlayers = players.filter(
      p => !p.injury || p.injury.gamesRemaining <= 0
    );

    const actualMargin = Math.abs(finalHomeScore - finalAwayScore);

    // Score-efficiency correlation: high-scoring games reflect hot shooting nights,
    // low-scoring games are grind/cold-shooting games. Multiplied into the knobs
    // so stat lines match the scoreboard energy. League avg preserved over many games.
    const homeEffMult = getEfficiencyMultFromScore(finalHomeScore);
    const awayEffMult = getEfficiencyMultFromScore(finalAwayScore);
    const homeKnobsEff = { ...homeKnobs, efficiencyMultiplier: (homeKnobs.efficiencyMultiplier ?? 1.0) * homeEffMult * (homeSysFit?.efficiencyMult ?? 1.0) };
    const awayKnobsEff = { ...awayKnobs, efficiencyMultiplier: (awayKnobs.efficiencyMultiplier ?? 1.0) * awayEffMult * (awaySysFit?.efficiencyMult ?? 1.0) };

    // Baseline order (usage*ovr) for each team — reused by biases, double team,
    // and coaching penalty. Empty for exhibitions.
    const homeBaselineOrder = homeOverridePlayers ? [] : buildBaselineOrder(homePlayers);
    const awayBaselineOrder = awayOverridePlayers ? [] : buildBaselineOrder(awayPlayers);

    // Scoring Options biases (Coaching → Preferences). Skip for exhibition games
    // (overridePlayers set) since synthetic rosters don't have user overrides.
    let homeBiases = homeOverridePlayers
      ? undefined
      : getScoringOptionBiases(homeBaselineOrder, getScoringOptions(homeTeam.id));
    let awayBiases = awayOverridePlayers
      ? undefined
      : getScoringOptionBiases(awayBaselineOrder, getScoringOptions(awayTeam.id));

    // Defense sliders — each team's defense projects onto the OPPONENT'S knobs.
    // Skip for exhibitions (synthetic rosters use default knobs).
    const homeDef = homeOverridePlayers ? null : getDefenseSliders(homeTeam.id, homePlayers);
    const awayDef = awayOverridePlayers ? null : getDefenseSliders(awayTeam.id, awayPlayers);

    // Run Plays dilutes scoring biases toward neutral. Low RP = more freelance
    // so user overrides matter less; RP=100 = full scripted effect.
    const diluteBiases = (biases: Map<string, { ptsMult: number; effMult: number }> | undefined, runPlays: number) => {
      if (!biases) return;
      const strength = Math.max(0, Math.min(1, runPlays / 100));
      biases.forEach((v, k) => {
        biases.set(k, {
          ptsMult: 1 + (v.ptsMult - 1) * strength,
          effMult: 1 + (v.effMult - 1) * strength,
        });
      });
    };
    if (homeDef) diluteBiases(homeBiases, homeDef.runPlays);
    if (awayDef) diluteBiases(awayBiases, awayDef.runPlays);

    // Double Team — opponent's DT slider debuffs YOUR #1 baseline scorer.
    // Injected into biases Map (creating it if user hasn't set scoring options).
    const applyDoubleTeam = (
      biases: Map<string, { ptsMult: number; effMult: number }> | undefined,
      baseline: string[],
      oppDoubleTeam: number
    ) => {
      if (!biases || !baseline[0] || oppDoubleTeam < 5) return biases;
      const dt = oppDoubleTeam / 100;
      const existing = biases.get(baseline[0]) ?? { ptsMult: 1, effMult: 1 };
      biases.set(baseline[0], {
        ptsMult: existing.ptsMult * (1 - dt * 0.15),
        effMult: existing.effMult * (1 - dt * 0.08),
      });
      return biases;
    };
    if (awayDef && !homeOverridePlayers) {
      homeBiases = homeBiases ?? new Map();
      applyDoubleTeam(homeBiases, homeBaselineOrder, awayDef.doubleTeam);
    }
    if (homeDef && !awayOverridePlayers) {
      awayBiases = awayBiases ?? new Map();
      applyDoubleTeam(awayBiases, awayBaselineOrder, homeDef.doubleTeam);
    }

    // System-specific knob mods — pace/shot/efficiency bonuses for running
    // the right system. Also handles the Heliocentric star ptsMult injection
    // into the biases map so the #1 option reaches prime-usage scoring volume.
    // Skip for exhibition/override rosters.
    const homeSysMods = homeOverridePlayers ? null : getSystemKnobMods(homeTeam.id);
    const awaySysMods = awayOverridePlayers ? null : getSystemKnobMods(awayTeam.id);

    const applyHelioStarBoost = (
      biases: Map<string, { ptsMult: number; effMult: number }> | undefined,
      baseline: string[],
      mods: ReturnType<typeof getSystemKnobMods> | null
    ) => {
      if (!mods || mods.helioStarPtsMod === 1 || !baseline[0]) return;
      const existing = biases?.get(baseline[0]) ?? { ptsMult: 1, effMult: 1 };
      if (!biases) return;
      biases.set(baseline[0], {
        ptsMult: existing.ptsMult * mods.helioStarPtsMod,
        effMult:  existing.effMult  * mods.helioStarEffMod,
      });
    };
    if (!homeOverridePlayers) {
      homeBiases = homeBiases ?? new Map();
      applyHelioStarBoost(homeBiases, homeBaselineOrder, homeSysMods);
    }
    if (!awayOverridePlayers) {
      awayBiases = awayBiases ?? new Map();
      applyHelioStarBoost(awayBiases, awayBaselineOrder, awaySysMods);
    }

    // Shot Distribution sliders (Coaching → Strategy) → per-team shot mix. Skip
    // for exhibition games — synthetic rosters use default knobs.
    const homeShotMults = homeOverridePlayers ? null : computeShotMults(homeTeam.id, homePlayers);
    const awayShotMults = awayOverridePlayers ? null : computeShotMults(awayTeam.id, awayPlayers);

    // Defensive stack — what the opponent's defense projects onto your knobs.
    const homeOpponentStack = awayDef ? defensiveStackOnOpponent(awayDef) : null;
    const awayOpponentStack = homeDef ? defensiveStackOnOpponent(homeDef) : null;

    // Compose final per-team knobs: base × shotMults × opponent-defense.
    // rimRate and threePointRate are multiplicative stacks; interiorEffMult
    // drops in fresh; tovMult/ftRateMult compound with the base value.
    const homeKnobsFinal: SimulatorKnobs = {
      ...homeKnobsEff,
      ...(homeShotMults ?? {}),
      paceMultiplier:     (homeKnobsEff.paceMultiplier     ?? 1) * (homeSysMods?.paceBonus     ?? 1),
      efficiencyMultiplier:(homeKnobsEff.efficiencyMultiplier ?? 1) * (homeSysMods?.efficiencyMod ?? 1),
      tovMult:            (homeKnobsEff.tovMult    ?? 1) * (homeOpponentStack?.tovMult    ?? 1),
      ftRateMult:         (homeKnobsEff.ftRateMult ?? 1) * (homeOpponentStack?.ftRateMult ?? 1),
      interiorEffMult:    homeOpponentStack?.interiorEffMult ?? 1,
      rimRateMult:        (homeKnobsEff.rimRateMult        ?? 1) * (homeShotMults?.rimRateMult        ?? 1) * (homeOpponentStack?.rimRateMult        ?? 1) * (homeSysMods?.rimMod        ?? 1),
      lowPostRateMult:    (homeKnobsEff.lowPostRateMult    ?? 1) * (homeShotMults?.lowPostRateMult    ?? 1) * (homeSysMods?.lowPostMod   ?? 1),
      midRangeRateMult:   (homeKnobsEff.midRangeRateMult   ?? 1) * (homeShotMults?.midRangeRateMult  ?? 1) * (homeSysMods?.midRangeMod  ?? 1),
      threePointRateMult: (homeKnobsEff.threePointRateMult ?? 1) * (homeShotMults?.threePointRateMult ?? 1) * (homeOpponentStack?.threePointRateMult ?? 1) * (homeSysMods?.threePointMod ?? 1),
    };
    const awayKnobsFinal: SimulatorKnobs = {
      ...awayKnobsEff,
      ...(awayShotMults ?? {}),
      paceMultiplier:     (awayKnobsEff.paceMultiplier     ?? 1) * (awaySysMods?.paceBonus     ?? 1),
      efficiencyMultiplier:(awayKnobsEff.efficiencyMultiplier ?? 1) * (awaySysMods?.efficiencyMod ?? 1),
      tovMult:            (awayKnobsEff.tovMult    ?? 1) * (awayOpponentStack?.tovMult    ?? 1),
      ftRateMult:         (awayKnobsEff.ftRateMult ?? 1) * (awayOpponentStack?.ftRateMult ?? 1),
      interiorEffMult:    awayOpponentStack?.interiorEffMult ?? 1,
      rimRateMult:        (awayKnobsEff.rimRateMult        ?? 1) * (awayShotMults?.rimRateMult        ?? 1) * (awayOpponentStack?.rimRateMult        ?? 1) * (awaySysMods?.rimMod        ?? 1),
      lowPostRateMult:    (awayKnobsEff.lowPostRateMult    ?? 1) * (awayShotMults?.lowPostRateMult    ?? 1) * (awaySysMods?.lowPostMod   ?? 1),
      midRangeRateMult:   (awayKnobsEff.midRangeRateMult   ?? 1) * (awayShotMults?.midRangeRateMult  ?? 1) * (awaySysMods?.midRangeMod  ?? 1),
      threePointRateMult: (awayKnobsEff.threePointRateMult ?? 1) * (awayShotMults?.threePointRateMult ?? 1) * (awayOpponentStack?.threePointRateMult ?? 1) * (awaySysMods?.threePointMod ?? 1),
    };

    const homeInitial = StatGenerator.generateStatsForTeam(
      homeTeam, players, finalHomeScore, homeWinsFinal, actualMargin, { league3PAMult: 1.0 }, 2026, homeOverridePlayers, otCount, away2KDef, homeKnobsFinal, homeBiases
    );
    const awayInitial = StatGenerator.generateStatsForTeam(
      awayTeam, players, finalAwayScore, !homeWinsFinal, actualMargin, { league3PAMult: 1.0 }, 2026, awayOverridePlayers, otCount, home2KDef, awayKnobsFinal, awayBiases
    );

    const homeMisses = homeInitial.reduce(
      (sum, p) => sum + (p.fga - p.fgm) + (p.fta - p.ftm) * 0.4, 0
    );
    const awayMisses = awayInitial.reduce(
      (sum, p) => sum + (p.fga - p.fgm) + (p.fta - p.ftm) * 0.4, 0
    );
    const homeTov = homeInitial.reduce((sum, p) => sum + p.tov, 0);
    const awayTov = awayInitial.reduce((sum, p) => sum + p.tov, 0);

    const homeInteriorMisses = homeInitial.reduce(
      (sum, p) => sum + Math.max(0, (p.fga - p.threePa) - (p.fgm - p.threePm)), 0
    );
    const awayInteriorMisses = awayInitial.reduce(
      (sum, p) => sum + Math.max(0, (p.fga - p.threePa) - (p.fgm - p.threePm)), 0
    );

    const homeFTA = homeInitial.reduce((sum, p) => sum + p.fta, 0);
    const awayFTA = awayInitial.reduce((sum, p) => sum + p.fta, 0);

    const homeBlkMult = homeKnobsFinal.blockRateMult ?? 1.0;
    const awayBlkMult = awayKnobsFinal.blockRateMult ?? 1.0;

    // Crash Offensive Glass → ORB pool multiplier per team. 50 = neutral.
    // 100 → +35% ORB (Dennis Rodman-mode); 0 → −30% ORB (everyone sprints back).
    const homeOrbMult = 1 + ((homeCrashPre - 50) / 50) * 0.35;
    const awayOrbMult = 1 + ((awayCrashPre - 50) / 50) * 0.35;

    const homeStats = StatGenerator.generateCoordinatedStats(
      homeInitial,
      homeTeam,
      availablePlayers,
      awayMisses         * 0.70,
      awayTov            * 0.60,
      awayInteriorMisses * 0.33 * awayBlkMult,  // blockRateMult scales away team's blockable interior misses
      awayFTA,
      2026,
      otCount,
      home2KDef,  // home team's defensive ratings (sizes their steal/block pools)
      away2KDef,  // away team's pass perception (shrinks home's assist pool)
      homeOrbMult,
      homeKnobsFinal.quarterLength ?? 12,
      homeKnobsFinal.overtimeDuration ?? 5
    );
    const awayStats = StatGenerator.generateCoordinatedStats(
      awayInitial,
      awayTeam,
      availablePlayers,
      homeMisses         * 0.70,
      homeTov            * 0.60,
      homeInteriorMisses * 0.33 * homeBlkMult,  // blockRateMult scales home team's blockable interior misses
      homeFTA,
      2026,
      otCount,
      away2KDef,  // away team's defensive ratings
      home2KDef,  // home team's pass perception
      awayOrbMult,
      awayKnobsFinal.quarterLength ?? 12,
      awayKnobsFinal.overtimeDuration ?? 5
    );
    // Reconcile player pts to match the final team score.
    // nightProfile boosts individuals asymmetrically (EXPLOSION 1.5× on one player) so the
    // sum of player pts can drift 10-25 pts above the scoreboard total. Fix via FTM adjustment.
    // Removal: lowest scorers first → preserves the star's big night (EXPLOSION stays at 55).
    // Addition: highest scorers first → realistic (stars make the extra FTs).
    // Pass 2: if FTM-based pass can't fully close the gap (due to low ftm), adjust FGM (2-pt) as fallback.
    const reconcileToScore = (stats: any[], target: number) => {
      let delta = target - stats.reduce((s: number, p: any) => s + (p.pts || 0), 0);
      if (delta === 0) return;

      // Brick-fest gate: if the team is shooting cold (FG% < 44%) or already FT-heavy
      // (team FTA/FGA >= 0.45), suppress the FT pump entirely. Real NBA: cold games score
      // 95-100, they don't get padded by 39 FTs. Pump-by-FGM (Pass 2) keeps the scoreboard
      // honest by adding makes instead of trips.
      const teamFga = stats.reduce((s: number, p: any) => s + (p.fga || 0), 0);
      const teamFgm = stats.reduce((s: number, p: any) => s + (p.fgm || 0), 0);
      const teamFta0 = stats.reduce((s: number, p: any) => s + (p.fta || 0), 0);
      const teamFgPct = teamFga > 0 ? teamFgm / teamFga : 1;
      const teamFtaFga0 = teamFga > 0 ? teamFta0 / teamFga : 0;
      const ftPumpAllowed = teamFgPct >= 0.44 && teamFtaFga0 < 0.45;
      const teamFtaCeil = Math.max(0, Math.round(teamFga * 0.45));

      const sorted = delta < 0
        ? [...stats].sort((a: any, b: any) => a.pts - b.pts)   // remove from low scorers first
        : [...stats].sort((a: any, b: any) => b.pts - a.pts);  // add to top scorers first
      // Pass 1: adjust via FTM (capped at 4 per player to preserve star lines).
      // When delta > 0 (need more pts), only pump FT if the brick-fest gate allows it
      // AND the team-level 0.45 FTA/FGA ceiling hasn't been hit yet.
      let teamFtaRunning = teamFta0;
      for (const s of sorted) {
        if (delta === 0) break;
        if (delta > 0) {
          if (!ftPumpAllowed) continue;                     // skip FT add on cold/FT-saturated teams
          const headroom = Math.max(0, teamFtaCeil - teamFtaRunning);
          if (headroom <= 0) break;                         // team FTA/FGA cap reached
          const add = Math.min(delta, 4, headroom);
          if (add <= 0) continue;
          s.ftm += add; s.fta = Math.max(s.fta, s.ftm); s.pts += add; delta -= add;
          teamFtaRunning += add;
        } else {
          const remove = Math.min(-delta, Math.min(4, Math.max(0, s.ftm)));
          if (remove > 0) { s.ftm -= remove; s.pts -= remove; delta += remove; }
        }
      }
      // Pass 2: if delta still remains, adjust via 2-pt FGM (add/remove 2-pointers)
      if (delta !== 0) {
        const pass2 = delta < 0
          ? [...stats].sort((a: any, b: any) => a.pts - b.pts)
          : [...stats].sort((a: any, b: any) => b.pts - a.pts);
        for (const s of pass2) {
          if (delta === 0) break;
          const twoPm = Math.max(0, s.fgm - (s.threePm ?? s.tp ?? 0));
          if (delta > 0) {
            // Add a 2-pointer
            s.fgm += 1; s.fga = Math.max(s.fga, s.fgm); s.pts += 2; delta -= 2;
          } else if (twoPm > 0 && delta <= -2) {
            // Remove a 2-pointer
            s.fgm -= 1; s.pts -= 2; delta += 2;
          } else if (delta === -1) {
            // Odd-point gap: remove 1 FT from whoever has one
            if (s.ftm > 0) { s.ftm -= 1; s.pts -= 1; delta += 1; }
          }
        }
      }
    };
    reconcileToScore(homeStats, finalHomeScore);
    reconcileToScore(awayStats, finalAwayScore);

 // ✅ ADD HERE
    const { homePM, awayPM } = generateSyntheticPM(
      homeStats, awayStats,
      finalHomeScore, finalAwayScore,
      Math.abs(finalHomeScore - finalAwayScore) > 20
    );
    const homeStatsFinal = applyPMToStats(homeStats, homePM).filter(Boolean);
    const awayStatsFinal = applyPMToStats(awayStats, awayPM).filter(Boolean);

    // Weave Advanced Stats
    const homeAdv = StatGenerator.generateAdvancedStats(homeStatsFinal, awayStatsFinal, homePM.map(p => p.pm));
    const awayAdv = StatGenerator.generateAdvancedStats(awayStatsFinal, homeStatsFinal, awayPM.map(p => p.pm));

    homeStatsFinal.forEach((s, i) => {
      Object.assign(s, {
        tsPct: homeAdv[i].tsPct,
        efgPct: homeAdv[i].efgPct,
        per: homeAdv[i].per,
        ortg: homeAdv[i].ortg,
        drtg: homeAdv[i].drtg,
        usgPct: homeAdv[i].usgPct,
        bpm: homeAdv[i].bpm,
        obpm: homeAdv[i].obpm,
        dbpm: homeAdv[i].dbpm,
        ws: homeAdv[i].ws,
        ows: homeAdv[i].ows,
        dws: homeAdv[i].dws,
        vorp: homeAdv[i].vorp,
        ewa: homeAdv[i].ewa,
        orbPct: homeAdv[i].orbPct,
        drbPct: homeAdv[i].drbPct,
        trbPct: homeAdv[i].trbPct,
        astPct: homeAdv[i].astPct,
        stlPct: homeAdv[i].stlPct,
        blkPct: homeAdv[i].blkPct,
        tovPct: homeAdv[i].tovPct,
      });
    });

    awayStatsFinal.forEach((s, i) => {
      Object.assign(s, {
        tsPct: awayAdv[i].tsPct,
        efgPct: awayAdv[i].efgPct,
        per: awayAdv[i].per,
        ortg: awayAdv[i].ortg,
        drtg: awayAdv[i].drtg,
        usgPct: awayAdv[i].usgPct,
        bpm: awayAdv[i].bpm,
        obpm: awayAdv[i].obpm,
        dbpm: awayAdv[i].dbpm,
        ws: awayAdv[i].ws,
        ows: awayAdv[i].ows,
        dws: awayAdv[i].dws,
        vorp: awayAdv[i].vorp,
        ewa: awayAdv[i].ewa,
        orbPct: awayAdv[i].orbPct,
        drbPct: awayAdv[i].drbPct,
        trbPct: awayAdv[i].trbPct,
        astPct: awayAdv[i].astPct,
        stlPct: awayAdv[i].stlPct,
        blkPct: awayAdv[i].blkPct,
        tovPct: awayAdv[i].tovPct,
      });
    });

    // then replace homeStats → homeStatsFinal, awayStats → awayStatsFinal below:
    const winnerStats = homeWinsFinal ? homeStatsFinal : awayStatsFinal;  // ← was homeStats/awayStats
    const winnerTeamId = homeWinsFinal ? homeTeam.id : awayTeam.id;
    const gameWinner = pickGameWinner(
      winnerStats,
      winnerTeamId,
      Math.abs(finalHomeScore - finalAwayScore),
      isOT,
      players,
    );

    const quarterScores = simulateQuarters(
      finalHomeScore,
      finalAwayScore,
      Math.abs(finalHomeScore - finalAwayScore),
      isOT ? otCount : 0
    );

    const gamePlayers = homeOverridePlayers && awayOverridePlayers 
      ? [...homeOverridePlayers, ...awayOverridePlayers]
      : availablePlayers.filter(
          p => p.tid === homeTeam.id || p.tid === awayTeam.id
        );
    const injuries = InjurySystem.checkInjuries(gamePlayers, homeTeam, awayTeam);

    // Record DNP reasons at time of simulation so historical views stay accurate
    const playedHomeIds = new Set(homeStatsFinal.map(s => s.playerId));
    const playedAwayIds = new Set(awayStatsFinal.map(s => s.playerId));

    // Stamp checkInjuries results with startDate + origin. Every game-day injury gets
    // an opponent label based on the player's team — even bench guys, so the UI shows
    // "Nov 5 vs LAC" consistently. Pre-existing roster injuries remain the only ones
    // without an origin (they get "Last Season"/"Summer 2025" at init).
    const homeAbbrev = (homeTeam as any).abbrev;
    const awayAbbrev = (awayTeam as any).abbrev;
    for (const inj of injuries) {
      if (inj.startDate) continue; // already stamped by mid-game path
      inj.startDate = date;
      const isHome = inj.teamId === homeTeam.id;
      const oppAbbrev = isHome ? awayAbbrev : homeAbbrev;
      if (oppAbbrev) inj.origin = `${isHome ? 'vs' : '@'} ${oppAbbrev}`;
    }
    const playerDNPs: Record<string, string> = {};
    for (const p of homePlayers) {
      if (!playedHomeIds.has(p.internalId) && p.status === 'Active') {
        playerDNPs[p.internalId] = (p.injury?.gamesRemaining ?? 0) > 0
          ? `DNP — Injury (${p.injury!.type})`
          : "DNP — Coach's Decision";
      }
    }
    for (const p of awayPlayers) {
      if (!playedAwayIds.has(p.internalId) && p.status === 'Active') {
        playerDNPs[p.internalId] = (p.injury?.gamesRemaining ?? 0) > 0
          ? `DNP — Injury (${p.injury!.type})`
          : "DNP — Coach's Decision";
      }
    }

    // ── Players who suited up already hurt (play-through injuries) ──────────
    // Snapshot the pre-existing injury for anyone who actually logged minutes.
    // BoxScoreModal renders these with an orange indicator ("playing hurt").
    const playersPlayingHurt: Record<string, string> = {};
    const playedAllStats = [...homeStatsFinal, ...awayStatsFinal];
    for (const stat of playedAllStats) {
      const src = availablePlayers.find(p => p.internalId === stat.playerId);
      const g = src?.injury?.gamesRemaining ?? 0;
      if (g > 0 && src?.injury?.type) {
        playersPlayingHurt[stat.playerId] = src.injury.type;
      }
    }

    // ── Mid-game injuries — any player can roll, low-minute players much more likely ──
    // Low minutes (< 15) = clearly left early → 20% chance it's real
    // Short night (15-25) = possible early exit → 7% chance
    // Full game (25-35) = contact/twist late → 2% chance
    // Iron man (35+) → 0.6% chance
    const injuryDefs = getInjuries();
    const playerInGameInjuries: Record<string, { type: string; quarter: number }> = {};
    // Detect international preseason: one side is a non-NBA team (tid ≥ 100).
    // `game` is not in scope here — derive from homeTeam/awayTeam ids that were passed in.
    const isIntlPreseason = homeTeam.id >= 100 || awayTeam.id >= 100;
    if (injuryDefs.length > 0 && !isAllStar && !isRisingStars) {
      const allPlayedStats = [...homeStatsFinal, ...awayStatsFinal];
      for (const stat of allPlayedStats) {
        const player = availablePlayers.find(p => p.internalId === stat.playerId);
        if (!player || (player.injury?.gamesRemaining ?? 0) > 0) continue;

        const min = stat.min;
        // Preseason international games: NBA stars are treated cautiously,
        // sharply reduced injury risk (coaches pull guys early if anything feels off).
        const preseasonFactor = isIntlPreseason ? 0.25 : 1.0;
        const injuryChance = preseasonFactor * (
          min < 15  ? 0.20 :
          min < 25  ? 0.07 :
          min < 35  ? 0.02 :
                      0.006);

        if (Math.random() >= injuryChance) continue;

        const drawn = getRandomInjury(injuryDefs);
        // JSON `games` is the empirical mean — stay close to it (σ=0.15, clamp 0.75–1.30).
        // Early exits are slightly milder; full-game contacts are full severity.
        const u1 = 1 - Math.random(), u2 = 1 - Math.random();
        const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const baseMult = Math.max(0.75, Math.min(1.30, 1.0 + z * 0.15));
        const severityAdj = min < 15 ? -0.10 : min < 25 ? -0.05 : 0;
        const gameMult = Math.max(0.70, baseMult + severityAdj);
        const gamesRemaining = enforceSeasonEndingMinimum(drawn.name, Math.max(1, Math.round(drawn.games * gameMult)));

        // Origin label — mid-game injury → prefix by side. Home team vs opponent, away team @ opponent.
        const isHome = player.tid === homeTeam.id;
        const oppAbbrev = isHome ? (awayTeam as any).abbrev : (homeTeam as any).abbrev;
        const origin = oppAbbrev ? `${isHome ? 'vs' : '@'} ${oppAbbrev}` : undefined;
        injuries.push({
          playerId:       player.internalId,
          playerName:     player.name,
          teamId:         player.tid,
          injuryType:     drawn.name,
          gamesRemaining,
          startDate:      date,
          origin,
        });
        // Only flag "left early" if the injury actually costs the player games.
        // Use stat.min (total minutes played) to approximate the quarter they exited:
        // 0–12 → Q1, 12–24 → Q2, 24–36 → Q3, 36+ → Q4 (OT clamps to 4).
        if (gamesRemaining > 0) {
          const quarter = Math.max(1, Math.min(4, Math.ceil(Math.max(1, stat.min) / 12)));
          playerInGameInjuries[player.internalId] = { type: drawn.name, quarter };
        }
      }
    }

    // ── Fight check (skipped for All-Star / exhibition games) ────────────────
    const fight = (!isAllStar && !isRisingStars)
      ? generateFight(
          homeStatsFinal.map(s => s.playerId),
          awayStatsFinal.map(s => s.playerId),
          availablePlayers,
          [homeTeam, awayTeam] as any,
          date,
        ) ?? undefined
      : undefined;

    const highlights = HighlightGenerator.processGame(
      homeStatsFinal,
      awayStatsFinal,
      homeTeam.id,
      awayTeam.id,
      availablePlayers,
    );

    return {
      gameId,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore:  finalHomeScore,
      awayScore:  finalAwayScore,
       homeStats: homeStatsFinal,   // ← was homeStats
      awayStats: awayStatsFinal,   // ← was awayStats
      winnerId: homeWinsFinal ? homeTeam.id : awayTeam.id,
      lead:    Math.abs(finalHomeScore - finalAwayScore),
      isOT,
      otCount,
      date,
      isAllStar,
      isRisingStars,
      injuries,
      quarterScores,
      gameWinner,
      playerDNPs,
      playerInGameInjuries,
      playersPlayingHurt,
      fight,
      highlights,
      // Snapshot records at tip-off (before this game's result is applied)
      homeWins:   homeTeam.wins   ?? 0,
      homeLosses: homeTeam.losses ?? 0,
      awayWins:   awayTeam.wins   ?? 0,
      awayLosses: awayTeam.losses ?? 0,
    };
  }

  /**
   * Pre-compute conference standings context for every team.
   * Returns rank (1-15), GB from conference leader, and games remaining.
   * Used to build per-team SimulatorKnobs so rotation depth / star MPG
   * reflect real standings pressure at time of simulation.
   */
  private static buildStandingsContext(teams: Team[]): Map<number, { conferenceRank: number; gbFromLeader: number; gamesRemaining: number }> {
    const ctx = new Map<number, { conferenceRank: number; gbFromLeader: number; gamesRemaining: number }>();

    for (const conf of ['East', 'West'] as const) {
      const confTeams = teams
        .filter(t => t.conference === conf)
        .sort((a, b) => {
          const aPct = a.wins / Math.max(1, a.wins + a.losses);
          const bPct = b.wins / Math.max(1, b.wins + b.losses);
          return bPct - aPct || b.wins - a.wins;
        });

      const leader = confTeams[0];
      confTeams.forEach((t, idx) => {
        const gb = leader
          ? Math.max(0, ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2)
          : 0;
        ctx.set(t.id, {
          conferenceRank: idx + 1,   // was 'rank' — key must match SimulatorKnobs.conferenceRank
          gbFromLeader: gb,
          gamesRemaining: Math.max(0, 82 - (t.wins + t.losses)),
        });
      });
    }

    return ctx;
  }

  static async simulateDay(
    teams: Team[],
    players: Player[],
    gamesToSimulate: Game[],
    date: string,
    playerApproval: number = 50,
    allStar?: any,
    homeOverridePlayers?: Player[],
    awayOverridePlayers?: Player[],
    riggedForTid?: number,
    clubDebuffs?: Map<string, 'heavy' | 'moderate' | 'mild'>,
    leagueStats?: Partial<LeagueStats>,
    onGame?: (result: GameResult) => void
  ): Promise<GameResult[]> {
    const results: GameResult[] = [];

    // Build standings context once for the whole day
    const standingsCtx = this.buildStandingsContext(teams);

    // Build league-rules base knobs from commissioner rule changes
    const shotClock    = leagueStats?.shotClockValue      ?? 24;
    const shotClockOn  = leagueStats?.shotClockEnabled    ?? true;
    const def3sec      = leagueStats?.defensiveThreeSecondEnabled  ?? true;
    const off3sec      = leagueStats?.offensiveThreeSecondEnabled  ?? true;
    const threeOn      = leagueStats?.threePointLineEnabled ?? true;
    const handchecking  = leagueStats?.handcheckingEnabled    ?? false;
    const goaltending   = leagueStats?.goaltendingEnabled     ?? true;
    const charging      = leagueStats?.chargingEnabled        ?? true;
    const noDribble     = leagueStats?.noDribbleRule           ?? false;

    // Shot clock → pace: 24/shotClock gives 1.0 at NBA default, 2.0 at 12s.
    // No shot clock at all → slow-down ball → 0.78× pace, fewer 3s.
    const shotClockPace = shotClockOn
      ? Math.min(2.0, 24 / Math.max(8, shotClock))
      : 0.78;

    // Defensive 3-second disabled → defenders clog the paint → fewer rim drives, more 3s/mid
    const rimMult      = def3sec  ? 1.0  : 0.72;
    const threeBumpD   = def3sec  ? 1.0  : 1.22;  // more perimeter shots when lane is clogged

    // Offensive 3-second disabled → players can camp in the paint → more post / rim
    const lowPostMult  = off3sec  ? 1.0  : 1.35;
    const rimBumpO     = off3sec  ? 1.0  : 1.15;

    // Handchecking allowed → refs swallow whistles on contact → fewer free throws
    const handcheckFtMult = handchecking ? 0.82 : 1.0;

    // Goaltending disabled → defenders freely swat near rim → more blocks, slightly lower rim efficiency
    const blockMult        = goaltending ? 1.0 : 1.6;
    const goaltendEffMult  = goaltending ? 1.0 : 0.93;

    // Charging disabled → no charge calls → players drive fearlessly → more rim attempts
    const chargingRimBump  = charging ? 1.0 : 1.12;

    // No-dribble rule → everything is catch-and-shoot or post → slower pace, fewer rim drives, more 3s
    const noDribblePaceMult   = noDribble ? 0.72 : 1.0;
    const noDribbleRimMult    = noDribble ? 0.65 : 1.0;
    const noDribble3PMult     = noDribble ? 1.40 : 1.0;

    // ── New Phase 1A rules ────────────────────────────────────────────────────

    // Offensive rebound reset value changes the urgency after extra possessions.
    // 14s is NBA default; shorter resets speed the game up, longer resets slow it down.
    const offRebReset = leagueStats?.shotClockResetOffensiveRebound ?? 14;
    const offRebResetPace = shotClockOn
      ? Math.max(0.75, Math.min(1.25, 14 / Math.max(6, offRebReset)))
      : 1.0;

    // No backcourt timer → slower game, fewer forced TOs
    const backcourtTimerOn = leagueStats?.backcourtTimerEnabled ?? true;
    const backcourtPace    = backcourtTimerOn ? 1.0 : 0.90;
    const backcourtTovMult = backcourtTimerOn ? 1.0 : 0.85;

    // Back-to-basket timer → faster post reads → fewer post attempts
    const backToBasketTimer = leagueStats?.backToBasketTimerEnabled ?? false;
    const backToBasketLowPost = backToBasketTimer ? 0.90 : 1.0;

    // Illegal zone defense: false = zone allowed → clog paint, kick out; true = must play man → drives
    const illegalZone = leagueStats?.illegalZoneDefenseEnabled ?? true;
    const zoneRimMult   = illegalZone ? 1.0 : 0.90;   // zone clogs paint
    const zone3PMult    = illegalZone ? 1.0 : 1.10;   // zone kicks to perimeter
    const manRimBump    = illegalZone ? 1.05 : 1.0;   // man-to-man → more dribble penetration (guard at 1.0 NBA default)

    // Violation flags → fewer TOs when disabled
    const travelOn   = leagueStats?.travelingEnabled        ?? true;
    const dblDribOn  = leagueStats?.doubleDribbleEnabled    ?? true;
    const backctViol = leagueStats?.backcourtViolationEnabled ?? true;
    let tovMult = 1.0;
    if (!travelOn)   tovMult *= 0.88;
    if (!dblDribOn)  tovMult *= 0.90;
    if (!backctViol) tovMult *= 0.92;
    tovMult *= backcourtTovMult;

    // Free throw distance: farther line → lower FT%
    const ftDist = leagueStats?.freeThrowDistance ?? 15;
    const ftEfficiencyMult = Math.min(1.0, Math.max(0.65, 15 / Math.max(10, ftDist)));

    // Rim height: taller rim → lower overall efficiency (efficiencyMultiplier)
    const rimH = leagueStats?.rimHeight ?? 10;
    const rimHeightEffMult = Math.min(1.0, Math.max(0.5, Math.pow(10 / Math.max(8, rimH), 1.5)));

    // Court length: bigger court → slower pace, fewer TOs
    const courtLen = leagueStats?.courtLength ?? 94;
    const courtLenPace   = Math.pow(94 / Math.max(70, courtLen), 0.4);
    const courtLenTov    = Math.pow(94 / Math.max(70, courtLen), 0.2);
    tovMult *= courtLenTov;

    // Baseline (court width): wider court → slightly slower pace
    const baseline = leagueStats?.baselineLength ?? 50;
    const baselinePace  = Math.pow(50 / Math.max(40, baseline), 0.3);

    // Key width: wider key → harder to camp paint → less post, fewer rim drives
    const keyW = leagueStats?.keyWidth ?? 16;
    const keyLowPost = Math.pow(16 / Math.max(10, keyW), 0.5);
    const keyRimMult = Math.pow(16 / Math.max(10, keyW), 0.3);

    // Line/court equipment changes map into existing shot and efficiency knobs.
    const threePointDistance = leagueStats?.threePointLineDistance ?? 23.75;
    const threeDistanceRate = threeOn
      ? Math.max(0.55, Math.min(1.35, Math.pow(23.75 / Math.max(10, threePointDistance), 0.85)))
      : 0;
    const threeDistanceEff = threeOn
      ? Math.max(0.70, Math.min(1.20, Math.pow(23.75 / Math.max(10, threePointDistance), 0.45)))
      : 1.0;
    const ballWeight = leagueStats?.ballWeight ?? 1.4;
    const ballWeightEff = Math.max(0.85, Math.min(1.08, Math.pow(1.4 / Math.max(0.8, ballWeight), 0.25)));
    const ballWeightTov = Math.max(0.90, Math.min(1.18, Math.pow(Math.max(0.8, ballWeight) / 1.4, 0.5)));

    // Non-shot-clock violation toggles are represented as turnover and pace pressure.
    const inboundTimerOn = leagueStats?.inboundTimerEnabled ?? true;
    const inboundTimerValue = leagueStats?.inboundTimerValue ?? 5;
    const inboundTovMult = inboundTimerOn ? Math.max(0.90, Math.min(1.25, 5 / Math.max(2, inboundTimerValue))) : 0.92;
    const outOfBoundsOn = leagueStats?.outOfBoundsEnabled ?? true;
    const outOfBoundsTov = outOfBoundsOn ? 1.0 : 0.88;
    const kickedBallOn = leagueStats?.kickedBallEnabled ?? true;
    const kickedBallPace = kickedBallOn ? 1.0 : 1.03;
    const kickedBallTov = kickedBallOn ? 1.0 : 0.96;
    const basketInterferenceOn = leagueStats?.basketInterferenceEnabled ?? true;
    const basketInterferenceBlock = basketInterferenceOn ? 1.0 : 1.12;
    const basketInterferenceEff = basketInterferenceOn ? 1.0 : 0.98;

    // Foul rules feed the existing FTA/foul and illegal-screen turnover models.
    const teamFoulPenalty = leagueStats?.teamFoulPenalty ?? 5;
    const penaltyFtMult = Math.max(0.75, Math.min(1.35, 5 / Math.max(1, teamFoulPenalty)));
    const foulOutLimit = leagueStats?.foulOutLimit ?? 6;
    const foulOutPhysicality = Math.max(0.85, Math.min(1.18, foulOutLimit / 6));
    const illegalScreenOn = leagueStats?.illegalScreenEnabled ?? true;
    const screenTovMult = illegalScreenOn ? 1.0 : 0.94;
    const clearPathOn = leagueStats?.clearPathFoulEnabled ?? true;
    const clearPathFtMult = clearPathOn ? 1.0 : 0.97;
    const looseBallOn = leagueStats?.looseBallFoulEnabled ?? true;
    const looseBallFtMult = looseBallOn ? 1.0 : 0.96;
    const overBackOn = leagueStats?.overTheBackFoulEnabled ?? true;
    const overBackFtMult = overBackOn ? 1.0 : 0.97;
    tovMult *= inboundTovMult * outOfBoundsTov * kickedBallTov * screenTovMult * ballWeightTov;

    const leagueBaseKnobs = getKnobs({
      quarterLength:       leagueStats?.quarterLength ?? 12,
      overtimeDuration:    leagueStats?.overtimeDuration ?? 5,
      overtimeEnabled:     leagueStats?.overtimeEnabled ?? true,
      maxOvertimesEnabled: leagueStats?.maxOvertimesEnabled ?? false,
      maxOvertimes:        leagueStats?.maxOvertimes ?? 0,
      shotClockSeconds:    shotClock,
      threePointAvailable: threeOn,
      threePointRateMult:  threeOn ? (1.0 * threeBumpD * noDribble3PMult * zone3PMult * threeDistanceRate) : 0,
      threePointEfficiencyMult: threeDistanceEff,
      paceMultiplier:      shotClockPace * noDribblePaceMult * offRebResetPace * backcourtPace * courtLenPace * baselinePace * kickedBallPace,
      efficiencyMultiplier: goaltendEffMult * rimHeightEffMult * ballWeightEff * basketInterferenceEff,
      rimRateMult:         rimMult * rimBumpO * chargingRimBump * noDribbleRimMult * zoneRimMult * manRimBump * keyRimMult,
      lowPostRateMult:     lowPostMult * backToBasketLowPost * keyLowPost,
      ftRateMult:          handcheckFtMult * penaltyFtMult * foulOutPhysicality * clearPathFtMult * looseBallFtMult * overBackFtMult,
      blockRateMult:       blockMult * basketInterferenceBlock,
      tovMult,
      ftEfficiencyMult,
    });

    for (const game of gamesToSimulate) {
      let home = teams.find(t => t.id === game.homeTid);
      let away = teams.find(t => t.id === game.awayTid);
      
      let homeOverride: Player[] | undefined = homeOverridePlayers;
      let awayOverride: Player[] | undefined = awayOverridePlayers;

      // Handle All-Star Teams
      if (!home && game.homeTid < 0) {
        const teamName = game.homeTid === -1 ? 'East All-Stars' : 
                        game.homeTid === -3 ? 'Team USA' : 
                        game.homeTid === -5 ? 'Team Shannon' : 'All-Stars';
        home = { id: game.homeTid, name: teamName } as any;
        
        if (!homeOverride && allStar) {
          if (game.isCelebrityGame) {
            homeOverride = (allStar.celebrityRoster || []).filter((p: any) => p.team === 'Shannon');
          } else {
            const isRisingStars = game.isRisingStars;
            const roster = isRisingStars ? (allStar.risingStarsRoster || []) : (allStar.roster || []);

            const rosterIds = new Set(
              isRisingStars
                ? roster.slice(0, 10).map((r: any) => r.playerId)
                : roster.filter((r: any) => r.conference === 'East').map((r: any) => r.playerId)
            );
            homeOverride = players.filter(p => rosterIds.has(p.internalId));
          }
        }
        // Ensure minimum 8 players — fill from top available NBA players not already on either side
        if (homeOverride && homeOverride.length < 8 && !game.isCelebrityGame) {
          const usedIds = new Set([...(homeOverride || []), ...(awayOverride || [])].map((p: any) => p.internalId));
          const INELIGIBLE = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
          const fillers = players
            .filter(p => !usedIds.has(p.internalId) && !INELIGIBLE.has((p as any).status ?? '') && ((p as any).injury?.gamesRemaining ?? 0) === 0)
            .sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
          while (homeOverride.length < 12 && fillers.length > 0) homeOverride.push(fillers.shift()!);
        }
      }

      if (!away && game.awayTid < 0) {
        const teamName = game.awayTid === -2 ? 'West All-Stars' :
                        game.awayTid === -4 ? 'Team World' :
                        game.awayTid === -6 ? 'Team Stephen A' : 'All-Stars';
        away = { id: game.awayTid, name: teamName } as any;

        if (!awayOverride && allStar) {
          if (game.isCelebrityGame) {
            awayOverride = (allStar.celebrityRoster || []).filter((p: any) => p.team === 'StephenA');
          } else {
            const isRisingStars = game.isRisingStars;
            const roster = isRisingStars ? (allStar.risingStarsRoster || []) : (allStar.roster || []);

            const rosterIds = new Set(
              isRisingStars
                ? roster.slice(10, 20).map((r: any) => r.playerId)
                : roster.filter((r: any) => r.conference === 'West').map((r: any) => r.playerId)
            );
            awayOverride = players.filter(p => rosterIds.has(p.internalId));
          }
        }
        // Ensure minimum 8 players — fill from top available NBA players not already on either side
        if (awayOverride && awayOverride.length < 8 && !game.isCelebrityGame) {
          const usedIds = new Set([...(homeOverride || []), ...(awayOverride || [])].map((p: any) => p.internalId));
          const INELIGIBLE = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
          const fillers = players
            .filter(p => !usedIds.has(p.internalId) && !INELIGIBLE.has((p as any).status ?? '') && ((p as any).injury?.gamesRemaining ?? 0) === 0)
            .sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
          while (awayOverride.length < 12 && fillers.length > 0) awayOverride.push(fillers.shift()!);
        }
      }

      // ── Preseason international games: one side is a nonNBA club (tid ≥ 100) ──
      // nonNBA teams are not in the `teams` array (NBA only). Build a synthetic
      // team and use that club's actual player roster from the shared players pool.
      // Sim multipliers in getScaledRating already nerf their ratings appropriately.
      if ((game as any).isPreseason) {
        const buildNonNBATeam = (tid: number): { team: Team; roster: Player[] } | null => {
          const clubPlayers = players.filter(p => p.tid === tid);
          if (clubPlayers.length === 0) return null;
          // Compute strength from actual pre-scaled player OVRs (top-8 average, like calculateTeamStrength).
          // This naturally reflects the league multiplier — PBA at 0.54× will produce ~38-45 OVR players,
          // giving a strength of ~40-45 vs NBA teams at ~82-88. No hardcoded values needed.
          const sorted = [...clubPlayers].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
          const top8 = sorted.slice(0, 8);
          const computedStr = top8.length > 0
            ? top8.reduce((s, p) => s + (p.overallRating ?? 50), 0) / top8.length
            : 50;
          const synTeam: Team = {
            id: tid,
            name: `Club ${tid}`,
            abbrev: `C${tid}`,
            conference: 'West',
            did: 0,
            wins: 0,
            losses: 0,
            strength: computedStr,
          } as any;
          return { team: synTeam, roster: clubPlayers };
        };

        if (!home && game.homeTid >= 100) {
          const result = buildNonNBATeam(game.homeTid);
          if (result) { home = result.team; if (!homeOverride) homeOverride = result.roster; }
        }
        if (!away && game.awayTid >= 100) {
          const result = buildNonNBATeam(game.awayTid);
          if (result) { away = result.team; if (!awayOverride) awayOverride = result.roster; }
        }
      }

      if (home && away) {
        // ── Intra-squad scrimmage: split roster in half ──────────────────────
        if (game.homeTid === game.awayTid && !homeOverride && !awayOverride) {
          const roster = players
            .filter(p => p.tid === game.homeTid && (!p.injury || p.injury.gamesRemaining <= 0))
            .sort(() => Math.random() - 0.5);
          const mid = Math.floor(roster.length / 2);
          homeOverride = roster.slice(0, mid);
          awayOverride = roster.slice(mid);
        }

        // ── Pick simulator knobs based on game type ──────────────────────────
        let homeKnobs: SimulatorKnobs;
        let awayKnobs: SimulatorKnobs;

        // Exhibition QL routes through getExhibitionQL which respects the per-event
        // mirror flag + event-specific quarterLength field. Reading bare
        // leagueStats.quarterLength here forced 12-min All-Star quarters (192-170
        // finals) regardless of allStarQuarterLength / allStarMirrorLeagueRules.
        if (game.isCelebrityGame) {
          homeKnobs = awayKnobs = { ...KNOBS_CELEBRITY, quarterLength: getExhibitionQL(leagueStats ?? {}, 'celebrity') };
        } else if (game.isRisingStars) {
          homeKnobs = awayKnobs = { ...KNOBS_RISING_STARS, quarterLength: getExhibitionQL(leagueStats ?? {}, 'risingStars') };
        } else if (game.isAllStar) {
          homeKnobs = awayKnobs = { ...KNOBS_ALL_STAR, quarterLength: getExhibitionQL(leagueStats ?? {}, 'allStar') };
        } else if ((game as any).isPreseason && (game.homeTid >= 100 || game.awayTid >= 100)) {
          // International preseason: league-specific knobs for the intl team, NBA preseason for the NBA team.
          // Previously both teams used the same intl knobs — this meant the NBA team also played at
          // PBA efficiency (0.83×), making scores unrealistically close.
          const intlTid = game.homeTid >= 100 ? game.homeTid : game.awayTid;
          const isHomeIntl = game.homeTid >= 100;
          let intlKnobs: SimulatorKnobs;
          if      (intlTid >= 4000 && intlTid < 5000) intlKnobs = KNOBS_BLEAGUE;    // B-League +4000
          else if (intlTid >= 1000 && intlTid < 2000) intlKnobs = KNOBS_EUROLEAGUE; // Euroleague +1000
          else if (intlTid >= 5000 && intlTid < 6000) intlKnobs = KNOBS_EUROLEAGUE; // Endesa/ACB — similar style
          else if (intlTid >= 2000 && intlTid < 3000) intlKnobs = KNOBS_PBA;        // PBA +2000
          else if (intlTid >= 7000 && intlTid < 8000) intlKnobs = KNOBS_BLEAGUE;    // China CBA +7000 — B-League baseline
          else if (intlTid >= 8000 && intlTid < 9000) intlKnobs = KNOBS_BLEAGUE;    // NBL Australia +8000 — B-League baseline
          else intlKnobs = { ...KNOBS_BLEAGUE };                                      // G-League/WNBA/unknown → B-League baseline
          // NBA team uses standard preseason knobs; intl team uses their league-calibrated knobs
          homeKnobs = isHomeIntl ? intlKnobs : KNOBS_PRESEASON;
          awayKnobs = isHomeIntl ? KNOBS_PRESEASON : intlKnobs;
        } else {
          // Regular game: per-team standings context drives rotation depth + star MPG
          // Base is leagueBaseKnobs (commissioner rule changes) not raw KNOBS_DEFAULT
          const homeCtx = standingsCtx.get(home.id) ?? { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 };
          const awayCtx = standingsCtx.get(away.id) ?? { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 };
          if (game.isPlayIn || game.isPlayoff) {
            // Post-season: override gbFromLeader=0 and gamesRemaining=7 to prevent teams from
            // being treated as "eliminated" (82 reg-season games done → gamesRemaining=0, gb>0
            // → standingsProfile returns 12-deep exhibition-style rotation). All remaining
            // playoff teams are still competing — use tight, star-heavy playoff rotation.
            // playThroughInjuries=4: every severity level gutting it out (playoff toughness).
            homeKnobs = { ...leagueBaseKnobs, ...homeCtx, gbFromLeader: 0, gamesRemaining: 7, isPlayoffs: true, playThroughInjuries: 4 };
            awayKnobs = { ...leagueBaseKnobs, ...awayCtx, gbFromLeader: 0, gamesRemaining: 7, isPlayoffs: true, playThroughInjuries: 4 };
            // Two-way contracts are ineligible for playoff/play-in games.
            homeOverride = (homeOverride ?? players.filter(p => p.tid === home.id)).filter(p => !(p as any).twoWay);
            awayOverride = (awayOverride ?? players.filter(p => p.tid === away.id)).filter(p => !(p as any).twoWay);
          } else {
            // Regular season: level 2 — only mild/moderate injuries play through (minutes-restricted);
            // significant/major injuries still sit. Matches "Questionable / Day-to-Day" news framing.
            homeKnobs = { ...leagueBaseKnobs, ...homeCtx, playThroughInjuries: 2 };
            awayKnobs = { ...leagueBaseKnobs, ...awayCtx, playThroughInjuries: 2 };
          }
        }

        // Apply club debuffs around this game
        if (clubDebuffs && clubDebuffs.size > 0) setClubDebuffs(clubDebuffs);
        const gameRig = riggedForTid !== undefined &&
          (home.id === riggedForTid || away.id === riggedForTid)
          ? riggedForTid : undefined;
        const gameResult = this.simulateGame(home, away, players, game.gid, date, playerApproval, homeOverride, awayOverride, game.isAllStar, game.isRisingStars, gameRig, homeKnobs, awayKnobs);
        results.push(gameResult);
        if (clubDebuffs && clubDebuffs.size > 0) clearClubDebuffs();

        // Reset per-game overrides so they don't carry into the next iteration
        homeOverride = homeOverridePlayers;
        awayOverride = awayOverridePlayers;

        // Per-game streaming: fire callback + yield to the event loop so React
        // can paint the ticker between games instead of freezing the whole batch.
        if (onGame) {
          onGame(gameResult);
          await new Promise(r => setTimeout(r, 0));
        }
      }
    }

    return results;
  }
}
