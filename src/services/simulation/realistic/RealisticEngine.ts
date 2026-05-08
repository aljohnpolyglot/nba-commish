import { NBAPlayer as Player, NBATeam as Team } from '../../../types';
import { GameResult, PlayerGameStats } from '../types';
import { MinutesPlayedService } from '../MinutesPlayedService';
import { SimulatorKnobs, KNOBS_DEFAULT } from '../SimulatorKnobs';
import { StatGenerator } from '../StatGenerator';
import { OnCourt, PlayerComposite } from './types';
import { buildComposite } from './compositeMap';
import { BoxAccumulator } from './boxScoreAccumulator';
import { simulateQuarter } from './possessionLoop';
import { SimulateGameArgs } from '../SimulatorAdapter';

const CHUNKS_PER_QUARTER = 2;        // 12-min quarter → 2 chunks of 6 min
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
 * Star-MPG calibration multiplier on per-minute advanced stats.
 *
 * The realistic engine currently has no foul-out, fatigue, or minute-pressure
 * subs, so star-tier MPG runs ~2-3 minutes higher than real NBA. PER, BPM,
 * OBPM and DBPM are per-minute metrics, so those minutes spread the same
 * raw stats across more time → top-tier values land ~15-20% under benchmark
 * (Jokic PER 25.8 sim vs 32.3 real, BPM 11.8 vs 14.2).
 *
 * Until Phase 3 lands, multiply per/bpm/obpm/dbpm by a mpg-scaled boost so
 * stars hit NBA-leader range without inflating role-player advanced stats.
 * Scaling: 0% boost at 25 MPG, capped at +22% for 35+ MPG players.
 */
function applyAdvanced(stats: PlayerGameStats[], adv: any[]): void {
  stats.forEach((s, i) => {
    Object.assign(s, adv[i]);
    const mpg = s.min ?? 0;
    if (mpg > 25) {
      const boost = 1 + Math.min(0.22, (mpg - 25) * 0.022);
      const sa = s as any;
      if (typeof sa.per  === 'number') sa.per  *= boost;
      if (typeof sa.bpm  === 'number') sa.bpm  *= boost;
      if (typeof sa.obpm === 'number') sa.obpm *= boost;
      if (typeof sa.dbpm === 'number') sa.dbpm *= boost;
    }
  });
}

function pickTopFive(remaining: number[]): number[] {
  // Indices of 5 highest remaining (tie-break by lower index = starter preference).
  const indexed = remaining.map((m, i) => ({ m, i }));
  indexed.sort((a, b) => b.m !== a.m ? b.m - a.m : a.i - b.i);
  return indexed.slice(0, 5).map(x => x.i);
}

function buildOnCourt(rotation: Player[], composites: PlayerComposite[], indices: number[]): OnCourt {
  return {
    players: indices.map(i => rotation[i]),
    composites: indices.map(i => composites[i]),
  };
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

  const acc = new BoxAccumulator();
  acc.registerRoster(home.rotation, 5);
  acc.registerRoster(away.rotation, 5);

  const homeRemaining = [...home.minuteTargets];
  const awayRemaining = [...away.minuteTargets];

  const chunkLen = quarterLen / CHUNKS_PER_QUARTER;
  const totalChunks = numQuarters * CHUNKS_PER_QUARTER;
  let homeScore = 0;
  let awayScore = 0;
  const quarterScoresHome: number[] = [];
  const quarterScoresAway: number[] = [];
  let qHomeAccum = 0;
  let qAwayAccum = 0;
  let possessionsTotal = 0;

  for (let c = 0; c < totalChunks; c++) {
    const homeIdx = pickTopFive(homeRemaining);
    const awayIdx = pickTopFive(awayRemaining);
    const onCourtHome = buildOnCourt(home.rotation, home.composites, homeIdx);
    const onCourtAway = buildOnCourt(away.rotation, away.composites, awayIdx);

    const startPoss: 'home' | 'away' = c === 0
      ? (Math.random() < 0.5 ? 'home' : 'away')
      : (possessionsTotal % 2 === 0 ? 'home' : 'away');

    const qr = simulateQuarter(onCourtHome, onCourtAway, acc, startPoss, chunkLen);
    homeScore += qr.homeScore;
    awayScore += qr.awayScore;
    qHomeAccum += qr.homeScore;
    qAwayAccum += qr.awayScore;
    possessionsTotal += qr.possessions;

    homeIdx.forEach(i => { homeRemaining[i] = Math.max(0, homeRemaining[i] - chunkLen); });
    awayIdx.forEach(i => { awayRemaining[i] = Math.max(0, awayRemaining[i] - chunkLen); });

    if ((c + 1) % CHUNKS_PER_QUARTER === 0) {
      quarterScoresHome.push(qHomeAccum);
      quarterScoresAway.push(qAwayAccum);
      qHomeAccum = 0;
      qAwayAccum = 0;
    }
  }

  // Overtime
  let otCount = 0;
  while (homeScore === awayScore && otCount < 6) {
    otCount += 1;
    const homeIdx = pickTopFive(homeRemaining.length ? homeRemaining : home.minuteTargets);
    const awayIdx = pickTopFive(awayRemaining.length ? awayRemaining : away.minuteTargets);
    const onCourtHome = buildOnCourt(home.rotation, home.composites, homeIdx);
    const onCourtAway = buildOnCourt(away.rotation, away.composites, awayIdx);
    const qr = simulateQuarter(onCourtHome, onCourtAway, acc, Math.random() < 0.5 ? 'home' : 'away', OT_LENGTH_MIN);
    homeScore += qr.homeScore;
    awayScore += qr.awayScore;
    quarterScoresHome.push(qr.homeScore);
    quarterScoresAway.push(qr.awayScore);
  }

  // Distribute minutes
  acc.setMinutes(home.rotation, home.minuteTargets);
  acc.setMinutes(away.rotation, away.minuteTargets);

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
