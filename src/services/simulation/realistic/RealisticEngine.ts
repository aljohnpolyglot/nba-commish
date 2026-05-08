import { NBAPlayer as Player, NBATeam as Team } from '../../../types';
import { GameResult, PlayerGameStats } from '../types';
import { MinutesPlayedService } from '../MinutesPlayedService';
import { SimulatorKnobs, KNOBS_DEFAULT } from '../SimulatorKnobs';
import { StatGenerator } from '../StatGenerator';
import { activeClubDebuffs } from '../StatGenerator/helpers';
import { Defense2KService } from '../../Defense2KService';
import { injurySeverityLevel, playThroughInjuriesFactor } from '../playThroughInjuriesFactor';
import { PlayerComposite } from './types';
import { buildComposite } from './compositeMap';
import { BoxAccumulator } from './boxScoreAccumulator';
import { simulatePeriod } from './possessionLoop';
import { RotationManager } from './rotationManager';
import { SimulateGameArgs } from '../SimulatorAdapter';

const OT_LENGTH_MIN = 5;

interface PrepResult {
  rotation: Player[];
  minuteTargets: number[];
  composites: PlayerComposite[];
}

function prepareUnit(
  team: Team,
  allPlayers: Player[],
  override: Player[] | undefined,
  season: number,
  knobs: SimulatorKnobs,
  lead: number,
): PrepResult {
  const rotResult = MinutesPlayedService.getRotation(
    team, allPlayers, lead, season, override,
    knobs.conferenceRank, knobs.gbFromLeader, knobs.gamesRemaining,
    knobs.rotationDepthOverride,
    knobs.playThroughInjuries ?? 0,
  );
  const rotation = rotResult.players;
  if (rotation.length === 0) {
    return { rotation: [], minuteTargets: [], composites: [] };
  }
  const numQuarters = knobs.numQuarters ?? 4;
  const overtimeDuration = knobs.overtimeDuration ?? 5;
  const { minutes } = MinutesPlayedService.allocateMinutes(
    rotation, season, lead, 0,
    knobs.starMpgOverride ?? rotResult.starMpgTarget,
    !!knobs.isPlayoffs,
    knobs.quarterLength,
    overtimeDuration,
    numQuarters,
  );
  const composites = rotation.map(p => buildComposite(p, season));
  return { rotation, minuteTargets: minutes, composites };
}

/**
 * Apply per-game hooks to the offensive composites of a single unit:
 *  - clubDebuff   : per-player from `activeClubDebuffs` global (set by simulateDay)
 *  - playThrough  : per-player from injury severity vs the team's PTI tolerance
 *  - defensive aura: scalar from opponent's overall 2K defense rating
 *
 * Mutates composites in place. Defensive composites (defRim/defPerimeter/steal/
 * block/rebound) are unaffected — only the offensive side gets dampened, since
 * these hooks model "how well does this player produce against this opponent".
 *
 * Multipliers are conservative (≤22% range total) so the calibration the rest
 * of Phase 5 nailed down isn't overridden by hook stacking.
 */
function applyHooks(unit: PrepResult, oppOverallDef: number): void {
  // Defensive aura: opponent's 2K overallDef centered at 70.
  // 82 (elite) → -0.06 on opponent offense, 60 (bad) → +0.05.
  const auraMult = 1 - (oppOverallDef - 70) * 0.005;

  unit.rotation.forEach((p, i) => {
    const c = unit.composites[i];
    let mult = auraMult;

    // clubDebuff — global Map populated by simulateDay before each game.
    const debuffSeverity = activeClubDebuffs.get(p.internalId);
    if (debuffSeverity === 'heavy')         mult *= 0.84;
    else if (debuffSeverity === 'moderate') mult *= 0.91;
    else if (debuffSeverity === 'mild')     mult *= 0.96;

    // playThroughInjuries — injured players who are suiting up get an output
    // reduction proportional to severity (matches BBGM 2.5%/level).
    const injurySev = injurySeverityLevel(p.injury?.gamesRemaining ?? 0);
    if (injurySev > 0) mult *= playThroughInjuriesFactor(injurySev);

    if (mult !== 1) {
      c.rim        *= mult;
      c.midRange   *= mult;
      c.three      *= mult;
      c.lowPost    *= mult;
      c.driving    *= mult;
      c.passing    *= mult;
      c.drawingFouls *= mult;
      // Usage is the player's "touches" weight — hook also dampens engagement.
      c.usage      *= mult;
    }
  });
}

/**
 * Three-driver calibration multiplier on per-minute advanced stats.
 *
 * The realistic engine has no foul-out, fatigue, or minute-pressure subs yet
 * (Phase 3), so per-minute advanced metrics compress 15-25% on engaged
 * players. We need to capture three archetypes:
 *
 *   - Volume scorers (Doncic): high USG + high MPG → driven by usgB
 *   - 6th-man spark plugs (Herro): high USG + low MPG → driven by usgB alone
 *   - Efficient rim runners (M. Robinson, Gobert): low USG, high TS% → driven by effB
 *
 * Bench fillers (low on all three) get no boost. Boost is capped at +25% so
 * elite engines don't compound across all three drivers.
 *
 *   Bench filler (14 mpg, 16 usg, .50 ts) : 1.00
 *   Role player  (22 mpg, 22 usg, .55 ts) : 1.04
 *   M. Robinson  (18 mpg, 12 usg, .75 ts) : 1.16  ← efficiency-driven
 *   Tyler Herro  (22 mpg, 28 usg, .58 ts) : 1.13
 *   Gobert       (28 mpg, 17 usg, .65 ts) : 1.12  ← efficiency-driven
 *   Jokic        (38 mpg, 30 usg, .66 ts) : 1.25 (cap)
 */
function applyAdvanced(stats: PlayerGameStats[], adv: any[]): void {
  stats.forEach((s, i) => {
    Object.assign(s, adv[i]);
    const sa = s as any;
    const mpg = s.min ?? 0;
    const usg = sa.usgPct ?? 18;
    const ts  = sa.tsPct  ?? 0.55;
    const usgB = Math.max(0, usg - 18)   * 0.010;
    const mpgB = Math.max(0, mpg - 22)   * 0.006;
    const effB = Math.max(0, ts  - 0.55) * 0.80;   // TS% .65 → +8%, TS% .75 → +16%
    const boost = 1 + Math.min(0.25, usgB + mpgB + effB);
    if (boost > 1) {
      if (typeof sa.per  === 'number') sa.per  *= boost;
      if (typeof sa.bpm  === 'number') sa.bpm  *= boost;
      if (typeof sa.obpm === 'number') sa.obpm *= boost;
      if (typeof sa.dbpm === 'number') sa.dbpm *= boost;
    }
  });
}

export function simulateGameRealistic(args: SimulateGameArgs): GameResult {
  const homeKnobs = args.homeKnobs ?? KNOBS_DEFAULT;
  const awayKnobs = args.awayKnobs ?? KNOBS_DEFAULT;
  const season = args.date ? parseInt(args.date.split('-')[0], 10) : new Date().getFullYear();
  const numQuarters = homeKnobs.numQuarters ?? 4;
  const quarterLen = homeKnobs.quarterLength ?? 12;

  const home = prepareUnit(args.homeTeam, args.players, args.homeOverridePlayers, season, homeKnobs, 0);
  const away = prepareUnit(args.awayTeam, args.players, args.awayOverridePlayers, season, awayKnobs, 0);

  if (home.rotation.length < 5 || away.rotation.length < 5) {
    // Insufficient roster — caller should fall back. We surface a synthetic score-tied throwaway.
    throw new Error('Realistic engine: insufficient rotation');
  }

  // Apply game-state hooks (clubDebuff / playThrough / defensive aura). Defensive
  // aura needs the opponent's 2K rating computed from the same player set the fast
  // engine uses, so each side passes the OTHER side's rotation to Defense2KService.
  const home2KDef = Defense2KService.getTeamDefense(home.rotation);
  const away2KDef = Defense2KService.getTeamDefense(away.rotation);
  applyHooks(home, away2KDef.overallDef);
  applyHooks(away, home2KDef.overallDef);

  const acc = new BoxAccumulator();
  acc.registerRoster(home.rotation, 5);
  acc.registerRoster(away.rotation, 5);

  // Possession-by-possession rotation managers — handle foul-out, foul-trouble
  // pulls, fatigue stretches, and minute-target burn-down. The starting 5 are
  // the top-rotation players seeded by getRotation order.
  const homeMgr = new RotationManager(home.rotation, home.composites, home.minuteTargets);
  const awayMgr = new RotationManager(away.rotation, away.composites, away.minuteTargets);

  let homeScore = 0;
  let awayScore = 0;
  const quarterScoresHome: number[] = [];
  const quarterScoresAway: number[] = [];

  for (let p = 1; p <= numQuarters; p++) {
    const startPoss: 'home' | 'away' = p === 1
      ? (Math.random() < 0.5 ? 'home' : 'away')
      : (p % 2 === 0 ? 'away' : 'home');
    const r = simulatePeriod(homeMgr, awayMgr, acc, startPoss, quarterLen, p);
    homeScore += r.homeScore;
    awayScore += r.awayScore;
    quarterScoresHome.push(r.homeScore);
    quarterScoresAway.push(r.awayScore);
  }

  // Overtime
  let otCount = 0;
  while (homeScore === awayScore && otCount < 6) {
    otCount += 1;
    const r = simulatePeriod(
      homeMgr, awayMgr, acc,
      Math.random() < 0.5 ? 'home' : 'away',
      OT_LENGTH_MIN,
      numQuarters + otCount,
    );
    homeScore += r.homeScore;
    awayScore += r.awayScore;
    quarterScoresHome.push(r.homeScore);
    quarterScoresAway.push(r.awayScore);
  }

  // Distribute actual minutes from the rotation manager (replaces the static target).
  acc.setMinutes(home.rotation, homeMgr.getMinutesPlayed());
  acc.setMinutes(away.rotation, awayMgr.getMinutesPlayed());

  const homeStats: PlayerGameStats[] = acc.toArray(home.rotation);
  const awayStats: PlayerGameStats[] = acc.toArray(away.rotation);

  // Advanced stats (PER, USG%, ORtg, DRtg, BPM, OBPM, DBPM, WS, VORP, eFG%,
  // TS%, AST%, ORB%, DRB%, TRB%, STL%, BLK%, TOV%) — same per-game wiring
  // the fast engine does. PM is already tracked in the boxScoreAccumulator.
  const homePm = homeStats.map(s => s.pm ?? 0);
  const awayPm = awayStats.map(s => s.pm ?? 0);
  const homeAdv = StatGenerator.generateAdvancedStats(homeStats, awayStats, homePm);
  const awayAdv = StatGenerator.generateAdvancedStats(awayStats, homeStats, awayPm);
  applyAdvanced(homeStats, homeAdv);
  applyAdvanced(awayStats, awayAdv);

  const winnerId = homeScore > awayScore ? args.homeTeam.id : args.awayTeam.id;
  const lead = Math.abs(homeScore - awayScore);

  return {
    gameId: args.gameId,
    homeTeamId: args.homeTeam.id,
    awayTeamId: args.awayTeam.id,
    homeScore,
    awayScore,
    homeStats,
    awayStats,
    winnerId,
    lead,
    isOT: otCount > 0,
    otCount,
    quarterScores: { home: quarterScoresHome, away: quarterScoresAway },
    date: args.date,
    isAllStar: args.isAllStar,
    isRisingStars: args.isRisingStars,
    homeWins: args.homeTeam.wins,
    homeLosses: args.homeTeam.losses,
    awayWins: args.awayTeam.wins,
    awayLosses: args.awayTeam.losses,
  };
}
