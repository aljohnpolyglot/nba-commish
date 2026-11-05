import { parseMin, RotationService } from './rotationService';
import { PlayerGameStats, GameResult } from '../../types';
import { NBAPlayer } from '../../../../types';
import { TeamId, PlayerPool } from './possessionTypes';
import { validateAndNormalizePlaySequence } from './validatePlaySequence';
import { buildPossessions } from './possessionBuilder';
import { stampFoulContext, stampLateGameIntentional } from './foulTracker';
import { stampRuleCommentary } from './ruleCommentary';
import { stampCoachChallenges } from './reviewCommentary';
import { stampHeaveCommentary } from './heaveCommentary';
import { stampTimeouts } from './timeoutCommentary';
import { assignClocks } from './clockAssigner';
import { renderPossession, PlayLine } from './playRenderer';
import { Period } from './possessionTypes';
import {
  GameTimingConfig,
  getGameTimingConfig,
  getPeriodDurationSeconds,
  getPeriodLabel,
  getPeriodStartClock,
  getPeriodStartSeconds,
} from '../../../../utils/gameClock';
import { DEFAULT_GAME_RULES } from '../../gameRuleRuntime';

const pick = <T>(a: T[]): T => a[~~(Math.random() * a.length)];
const makeId = (suffix: string) => `gen-${Math.random().toString(36).substr(2, 9)}-${suffix}`;
const scoreTotal = (scores: number[] = []) => scores.reduce((sum, score) => sum + (Number(score) || 0), 0);
const safeClock = (value: unknown, fallback = '12:00') =>
  typeof value === 'string' && value.trim() ? value : fallback;
const clockToSeconds = (value: unknown): number => {
  const clock = safeClock(value, '0');
  if (clock.includes(':')) {
    const [minStr, secStr] = clock.split(':');
    return (parseInt(minStr, 10) || 0) * 60 + (parseFloat(secStr) || 0);
  }
  return parseFloat(clock) || 0;
};

export function findLateGameWinningScoreIndex(
  lines: PlayLine[],
  winningTeam: TeamId,
  regulationPeriods = 4,
): number {
  const finalPeriod = Math.max(regulationPeriods, ...lines.map(line => line.q || 0));
  return lines.findIndex((line, index) => {
    if (
      line.q !== finalPeriod
      || line.tm !== winningTeam
      || line.pts <= 0
      || !line.player
      || clockToSeconds(line.clock) > 5
    ) return false;

    const winnerAfter = winningTeam === 'HOME' ? line.cs : line.ds;
    const loserAfter = winningTeam === 'HOME' ? line.ds : line.cs;
    if (winnerAfter - line.pts > loserAfter || winnerAfter <= loserAfter) return false;

    return lines.slice(index + 1).every(later => {
      const winnerScore = winningTeam === 'HOME' ? later.cs : later.ds;
      const loserScore = winningTeam === 'HOME' ? later.ds : later.cs;
      return winnerScore > loserScore;
    });
  });
}

function alignLineupToPossession(
  lineup: PlayerPool[],
  possession: any,
  team: TeamId,
  playersOnCourt: number,
): PlayerPool[] {
  const required = [
    possession.scorer,
    possession.assister,
    possession.passPlayer,
    possession.blocker,
    possession.rebounder,
    possession.handler,
    possession.stealer,
    possession.fouler,
    possession.victim,
    ...(possession.fts ?? []).map((shot: any) => shot.shooter),
  ].filter((player: PlayerPool | undefined): player is PlayerPool => player?.tm === team);
  const requiredIds = new Set(required.map(player => player.id));
  const aligned = [...lineup];
  for (const player of required) {
    if (aligned.some(current => current.id === player.id)) continue;
    let replaceAt = -1;
    for (let index = aligned.length - 1; index >= 0; index--) {
      if (!requiredIds.has(aligned[index].id)) { replaceAt = index; break; }
    }
    if (replaceAt >= 0) aligned[replaceAt] = player;
    else if (aligned.length < playersOnCourt) aligned.push(player);
  }
  return aligned.slice(0, playersOnCourt);
}

const punctuateCommentary = (line: PlayLine): PlayLine =>
  line.type === 'sub' || /[.!?]$/.test(line.desc.trim())
    ? line
    : { ...line, desc: `${line.desc.trim()}.` };

function initPool(stats: PlayerGameStats[], players: NBAPlayer[], tm: TeamId): PlayerPool[] {
  if (!stats) return [];
  return stats.filter(Boolean).map(stat => {
    const player = players.find(p => p.internalId.toString() === stat.playerId) || players[0];
    return {
      n: stat.name, fn: stat.name, id: stat.playerId, imgURL: player.imgURL, tm,
      min: stat.min, pos: player.pos as 'G' | 'F' | 'C',
      fg2:    (stat.fgm || 0) - (stat.threePm || 0) - (stat.fourPm || 0),
      fg3:     stat.threePm  || 0,
      fg4:     stat.fourPm || 0,
      m2:      ((stat.fga || 0) - (stat.threePa || 0) - (stat.fourPa || 0)) - ((stat.fgm || 0) - (stat.threePm || 0) - (stat.fourPm || 0)),
      m3:      (stat.threePa || 0) - (stat.threePm  || 0),
      m4:      (stat.fourPa || 0) - (stat.fourPm || 0),
      ftm:     stat.ftm || 0,
      ftmiss:  (stat.fta || 0) - (stat.ftm || 0),
      ast:     stat.ast || 0,
      orb:     stat.orb || 0,
      drb:     stat.drb || 0,
      stl:     stat.stl || 0,
      blk:     stat.blk || 0,
      tov:     stat.tov || 0,
      pf:      stat.pf  || 0,
      dunks:   stat.dunks || 0,
      ftPct:   (stat.fta || 0) > 0 ? (stat.ftm || 0) / (stat.fta || 0) : 0.7,
      fgAtRim: stat.fgAtRim ?? 0,
      fgaAtRim: stat.fgaAtRim ?? 0,
      fgLowPost: stat.fgLowPost ?? 0,
      fgaLowPost: stat.fgaLowPost ?? 0,
      fgMidRange: stat.fgMidRange ?? 0,
      fgaMidRange: stat.fgaMidRange ?? 0,
    };
  });
}

function detectSubs(
  prevLineup: PlayerPool[],
  currLineup: PlayerPool[],
): { 
  comingIn: PlayerPool[], 
  goingOut: PlayerPool[] 
} {
  const prevIds = new Set(prevLineup.map(p => p.id));
  const currIds = new Set(currLineup.map(p => p.id));
  
  const comingIn = currLineup.filter(
    p => !prevIds.has(p.id)
  );
  const goingOut = prevLineup.filter(
    p => !currIds.has(p.id)
  );
  
  return { comingIn, goingOut };
}

function buildSubLine(
  tm: TeamId,
  comingIn: PlayerPool[],
  goingOut: PlayerPool[],
  poss: any,
  cs: number,
  ds: number,
  // Lineups AT THE MOMENT OF THE SUB — i.e. who was on the floor up to this
  // tick. Empty arrays here would zero out MIN attribution during live
  // playback (useLiveGame iterates lineupHOME/AWAY to accumulate sec).
  lineupHOME: PlayerPool[],
  lineupAWAY: PlayerPool[],
): PlayLine {
  const inNames = comingIn.map(p => p.n).join(', ');
  const outNames = goingOut.map(p => p.n).join(', ');

  const desc = outNames.length > 0
    ? `SUB: ${inNames} in for ${outNames}`
    : `SUB: ${inNames} enters the game`;
  const period = poss.period ?? String(poss.quarter ?? 1);
  const clock = safeClock(poss.clock);

  return {
    id: `sub-${poss.id}-${tm}`,
    tm,
    period,
    clock,
    time: `${period} ${clock}`,
    gs: (poss.gs ?? 0) - 0.5,
    pts: 0,
    desc,
    type: 'sub',
    player: comingIn[0],
    cs,
    ds,
    q: poss.quarter,
    possession: poss.team,
    comingIn,
    goingOut,
    lineupHOME,
    lineupAWAY,
  };
}

function getAvailableLineup(
  pool: PlayerPool[],
  gs: number,
  scoreDiff: number,
  playersOnCourt: number,
  excludedIds: Set<string>,
): PlayerPool[] {
  const proposed = RotationService.getLineupAtTime(pool, gs, scoreDiff, playersOnCourt)
    .filter(player => !excludedIds.has(player.id));
  if (proposed.length >= playersOnCourt) return proposed.slice(0, playersOnCourt);
  const used = new Set(proposed.map(player => player.id));
  const replacements = [...pool]
    .filter(player => !excludedIds.has(player.id) && !used.has(player.id))
    .sort((a, b) => parseMin(b.min) - parseMin(a.min));
  return [...proposed, ...replacements].slice(0, playersOnCourt);
}

function enforceSubstitutionLimit(
  previous: PlayerPool[],
  proposed: PlayerPool[],
  excludedIds: Set<string>,
  used: number,
  enabled: boolean,
  maximum: number,
  playersOnCourt: number,
): { lineup: PlayerPool[]; used: number } {
  if (previous.length === 0 || !enabled) {
    const incoming = previous.length === 0 ? 0 : detectSubs(previous, proposed).comingIn.length;
    return { lineup: proposed, used: used + incoming };
  }

  const eligiblePrevious = previous.filter(player => !excludedIds.has(player.id));
  const forcedSlots = Math.max(0, playersOnCourt - eligiblePrevious.length);
  if (forcedSlots > 0) {
    const currentIds = new Set(eligiblePrevious.map(player => player.id));
    const forcedReplacements = proposed
      .filter(player => !currentIds.has(player.id))
      .slice(0, forcedSlots);
    return {
      lineup: [...eligiblePrevious, ...forcedReplacements].slice(0, playersOnCourt),
      used,
    };
  }

  const incoming = detectSubs(previous, proposed).comingIn.length;
  const remaining = Math.max(0, Math.round(maximum) - used);
  if (incoming <= remaining) return { lineup: proposed, used: used + incoming };
  return { lineup: previous, used };
}

function reconcilePlaybackScores(
  lines: PlayLine[],
  quarterScores: { home: number[]; away: number[] },
): PlayLine[] {
  let homeScore = 0;
  let awayScore = 0;
  const periodHome = new Map<number, number>();
  const periodAway = new Map<number, number>();
  const reconciled: PlayLine[] = [];

  for (const line of lines) {
    let reconciledLine = line;
    const isScoringPlay = line.pts > 0 && (line.type === 'made' || (line.type === 'ft' && line.isMake));
    if (isScoringPlay) {
      const periodIndex = Math.max(0, line.q - 1);
      const target = line.tm === 'HOME'
        ? Number(quarterScores.home[periodIndex] ?? 0)
        : Number(quarterScores.away[periodIndex] ?? 0);
      const current = line.tm === 'HOME'
        ? periodHome.get(line.q) ?? 0
        : periodAway.get(line.q) ?? 0;
      const remaining = target - current;
      if (remaining <= 0) continue;
      if (line.pts > remaining) {
        const playerName = line.player?.n ?? 'The shooter';
        reconciledLine = {
          ...line,
          pts: remaining,
          type: line.type,
          isMake: line.type === 'ft' ? true : undefined,
          is3: remaining === 3,
          is4: remaining === 4,
          desc: remaining === 1
            ? line.type === 'ft'
              ? `${playerName} free throw GOOD.`
              : `${playerName} scores a goal.`
            : remaining === 3
              ? `${playerName} hits the three.`
              : remaining === 4
                ? `${playerName} connects from four-point range.`
                : `${playerName} scores inside.`,
        };
      }
      if (line.tm === 'HOME') {
        periodHome.set(line.q, current + reconciledLine.pts);
        homeScore += reconciledLine.pts;
      } else {
        periodAway.set(line.q, current + reconciledLine.pts);
        awayScore += reconciledLine.pts;
      }
    }
    reconciled.push({ ...reconciledLine, cs: homeScore, ds: awayScore });
  }

  return reconciled;
}

export function auditLivePlayback(lines: PlayLine[], finalResult: GameResult) {
  let previousHome = 0;
  let previousAway = 0;
  const scoringDivergences: Array<{ id: string; team: TeamId; pts: number; homeDelta: number; awayDelta: number }> = [];
  const missingActors: string[] = [];
  const offCourtActors: string[] = [];
  for (const line of lines) {
    const homeDelta = line.cs - previousHome;
    const awayDelta = line.ds - previousAway;
    const isScoringPlay = line.pts > 0 && (line.type === 'made' || (line.type === 'ft' && line.isMake));
    if (isScoringPlay) {
      const valid = line.tm === 'HOME'
        ? homeDelta === line.pts && awayDelta === 0
        : awayDelta === line.pts && homeDelta === 0;
      if (!valid) scoringDivergences.push({ id: line.id, team: line.tm, pts: line.pts, homeDelta, awayDelta });
      if (!line.player?.n || !line.desc.includes(line.player.n)) missingActors.push(line.id);
    }
    if (line.player && ['made', 'miss', 'blk', 'reb', 'tov', 'stl', 'foul', 'ft'].includes(line.type)) {
      const lineup = line.tm === 'HOME' ? line.lineupHOME : line.lineupAWAY;
      if (lineup?.length && !lineup.some(player => player.id === line.player?.id)) offCourtActors.push(line.id);
    }
    previousHome = line.cs;
    previousAway = line.ds;
  }
  return {
    scoringDivergences,
    missingActors,
    offCourtActors,
    playbackFinal: { home: previousHome, away: previousAway },
    resultFinal: { home: finalResult.homeScore, away: finalResult.awayScore },
    finalMatches: previousHome === finalResult.homeScore && previousAway === finalResult.awayScore,
  };
}

function injectLiveEvents(
  lines: PlayLine[],
  finalResult: GameResult | undefined,
  homePool: PlayerPool[],
  awayPool: PlayerPool[],
  timingConfig: GameTimingConfig,
  playersOnCourt: number,
): PlayLine[] {
  if (!finalResult?.liveEvents || finalResult.liveEvents.length === 0) {
    return [...lines].sort((left, right) => (left.gs ?? 0) - (right.gs ?? 0));
  }

  const withEvents = [...lines];
  const lookupPlayer = (id: string | undefined, team: TeamId, fallbackName: string): PlayerPool => {
    const pool = team === 'HOME' ? homePool : awayPool;
    return pool.find(p => p.id === id)
      ?? pool.find(p => p.n === fallbackName)
      ?? {
        n: fallbackName,
        fn: fallbackName,
        id: id ?? `event-${fallbackName}`,
        imgURL: '',
        tm: team,
        min: 0,
        pos: 'F',
        fg2: 0, fg3: 0, fg4: 0, m2: 0, m3: 0, m4: 0,
        ftm: 0, ftmiss: 0, ast: 0, orb: 0, drb: 0, stl: 0, blk: 0, tov: 0, pf: 0, dunks: 0,
      };
  };

  for (const event of finalResult.liveEvents) {
    const team = event.team;
    const anchorIndex = withEvents.findIndex(
      line => line.q === event.quarter && (line.gs ?? Number.POSITIVE_INFINITY) >= event.gs,
    );
    const insertAt = anchorIndex === -1 ? withEvents.length - 1 : Math.max(1, anchorIndex);
    const prev = withEvents[Math.max(0, insertAt - 1)];
    const lineupHOME = prev?.lineupHOME ?? RotationService.getLineupAtTime(homePool, event.gs, 0, playersOnCourt);
    const lineupAWAY = prev?.lineupAWAY ?? RotationService.getLineupAtTime(awayPool, event.gs, 0, playersOnCourt);
    const scoreHome = typeof prev?.cs === 'number' ? prev.cs : 0;
    const scoreAway = typeof prev?.ds === 'number' ? prev.ds : 0;
    const period = getPeriodLabel(event.quarter, timingConfig.numQuarters);
    withEvents.splice(insertAt, 0, {
      id: makeId(`${event.kind}-${event.playerId ?? event.playerName}`),
      tm: team,
      period,
      q: event.quarter,
      clock: event.clock,
      time: `${period} ${event.clock}`,
      gs: event.gs,
      pts: 0,
      desc: event.description,
      type: event.kind,
      player: lookupPlayer(event.playerId, team, event.playerName),
      cs: scoreHome,
      ds: scoreAway,
      possession: prev?.possession ?? team,
      lineupHOME,
      lineupAWAY,
    });
  }

  return withEvents.sort((a, b) => (a.gs ?? 0) - (b.gs ?? 0));
}

export async function genPlays(
  homeStats: PlayerGameStats[],
  awayStats: PlayerGameStats[],
  players: NBAPlayer[],
  quarterScores: { home: number[]; away: number[] },
  otCount: number = 0,
  gameWinner?: GameResult['gameWinner'],
  homeTeamName?: string,
  awayTeamName?: string,
  timingConfig: GameTimingConfig = getGameTimingConfig(),
  finalResult?: GameResult,
): Promise<PlayLine[]> {
  const playersOnCourt = Math.max(1, Math.round(finalResult?.playersOnCourt ?? 5));
  const gameRules = finalResult?.gameRules ?? DEFAULT_GAME_RULES;
  const homePool = initPool(homeStats, players, 'HOME');
  const awayPool = initPool(awayStats, players, 'AWAY');
  const expectedHomeFinal = scoreTotal(quarterScores.home);
  const expectedAwayFinal = scoreTotal(quarterScores.away);

  const tipWinner: TeamId = Math.random() > 0.5 ? 'HOME' : 'AWAY';
  const tipLoser:  TeamId = tipWinner === 'HOME' ? 'AWAY' : 'HOME';

  const fallbackPlayer = { n: 'Unknown', fn: 'Unknown', id: '0', imgURL: '', tm: 'HOME', min: 0, pos: 'C' as 'C', fg2: 0, fg3: 0, fg4: 0, m2: 0, m3: 0, m4: 0, ft: 0, mft: 0, ftm: 0, ftmiss: 0, ast: 0, orb: 0, drb: 0, stl: 0, blk: 0, tov: 0, pf: 0, dunks: 0 };
  const homeCenter = homePool.find(p => p.pos === 'C') ?? homePool[0] ?? { ...fallbackPlayer, tm: 'HOME' };
  const awayCenter = awayPool.find(p => p.pos === 'C') ?? awayPool[0] ?? { ...fallbackPlayer, tm: 'AWAY' };
  const [tipW, tipL] = tipWinner === 'HOME' ? [homeCenter, awayCenter] : [awayCenter, homeCenter];

  const possessions = buildPossessions(
    homePool,
    awayPool,
    quarterScores,
    tipWinner,
    otCount,
    timingConfig,
    playersOnCourt,
    gameRules,
  );

  stampFoulContext(possessions, gameRules.foulOutLimit, gameRules.teamFoulPenalty);
  stampRuleCommentary(possessions, gameRules);
  
  const TOTAL_PERIODS = Math.max(
    timingConfig.numQuarters + otCount,
    quarterScores.home.length,
    quarterScores.away.length,
  );
  
  for (let q = 1; q <= TOTAL_PERIODS; q++) {
    const qPossessions = possessions.filter(p => p.quarter === q);
    const quarterDuration = getPeriodDurationSeconds(q, timingConfig);
    const qStartGs = getPeriodStartSeconds(q, timingConfig);
    assignClocks(qPossessions, quarterDuration, qStartGs, getPeriodLabel(q, timingConfig.numQuarters) as Period, q >= timingConfig.numQuarters);
  }

  stampCoachChallenges(possessions, gameRules, timingConfig.numQuarters);
  const timeoutCountForTeam = (teamId: number | undefined) => finalResult?.highlights?.find(
    highlight => highlight.type === 'timeout' && highlight.teamId === teamId,
  )?.count;
  stampTimeouts(possessions, gameRules, timingConfig.numQuarters, {
    HOME: timeoutCountForTeam(finalResult?.homeTeamId),
    AWAY: timeoutCountForTeam(finalResult?.awayTeamId),
  });
  stampHeaveCommentary(
    possessions,
    finalResult?.heaves ?? [],
    finalResult?.homeTeamId ?? -1,
    finalResult?.awayTeamId ?? -1,
    timingConfig,
    homePool,
    awayPool,
  );
  stampLateGameIntentional(possessions);

  const allLines: PlayLine[] = [];
  let cs = 0, ds = 0;

  let prevHomeLineup: PlayerPool[] = [];
  let prevAwayLineup: PlayerPool[] = [];
  let homeSubstitutions = 0;
  let awaySubstitutions = 0;
  const excludedHome = new Set<string>();
  const excludedAway = new Set<string>();
  const lastSubKey = new Set<string>();

  const openingDescription = gameRules.startOfPossessionMethod === 'coin_toss'
    ? `The ${tipWinner === 'HOME' ? 'home' : 'away'} side wins the coin toss and takes the opening possession.`
    : gameRules.startOfPossessionMethod === 'rock_paper_scissors'
      ? `The ${tipWinner === 'HOME' ? 'home' : 'away'} side wins rock-paper-scissors and takes the opening possession.`
      : `Jump ball! ${tipW.n} wins the tip over ${tipL.n}.`;
  allLines.push({
    id: 'opening-possession',
    tm: tipWinner,
    period: getPeriodLabel(1, timingConfig.numQuarters),
    q: 1,
    clock: getPeriodStartClock(1, timingConfig),
    time: `${getPeriodLabel(1, timingConfig.numQuarters)} ${getPeriodStartClock(1, timingConfig)}`,
    gs: 0,
    pts: 0,
    desc: openingDescription,
    type: 'jumpball',
    player: gameRules.startOfPossessionMethod === 'jump_ball' ? tipW : undefined,
    cs: 0, ds: 0,
    possession: tipWinner,
    lineupHOME: RotationService.getLineupAtTime(homePool, 0, 0, playersOnCourt),
    lineupAWAY: RotationService.getLineupAtTime(awayPool, 0, 0, playersOnCourt),
  });

  let prevPoss: any = null;
  for (const poss of possessions) {
    if (!poss.clock || !poss.period) continue;

    const isNewQuarter = prevPoss && poss.quarter !== prevPoss.quarter;
    if (isNewQuarter) {
      lastSubKey.clear();
      
      // Add "End of Regulation" or "End of OT" labels
      if (prevPoss.quarter === timingConfig.numQuarters && otCount > 0) {
        allLines.push({
          id: makeId('end_regulation'),
          tm: 'HOME',
          period: prevPoss.period,
          clock: '0:00',
          time: `${prevPoss.period} 0:00`,
          q: timingConfig.numQuarters,
          gs: prevPoss.gs + 0.1,
          pts: 0,
          desc: pick([
            'The buzzer sounds — we are TIED!! This game is going to overtime!!',
            'End of regulation — all square!! Overtime basketball!!',
            'Nobody could pull away — OVERTIME IS HERE!!',
            'Regulation is over — we are KNOTTED UP!! OT time!!',
          ]),
          type: 'gameOver',
          cs, ds,
          possession: 'HOME',
        });
      } else if (prevPoss.quarter > timingConfig.numQuarters && poss.quarter > prevPoss.quarter) {
        allLines.push({
          id: makeId(`end_ot_${prevPoss.quarter - timingConfig.numQuarters}`),
          tm: 'HOME',
          period: prevPoss.period,
          clock: '0:00',
          time: `${prevPoss.period} 0:00`,
          q: prevPoss.quarter,
          gs: prevPoss.gs + 0.1,
          pts: 0,
          desc: pick([
            'Still tied!! We are going to another overtime!!',
            'Free basketball continues!! Double overtime!!',
            'Nobody wants to go home!! Another 5 minutes!!',
          ]),
          type: 'gameOver',
          cs, ds,
          possession: 'HOME',
        });
      }

      // Add period-start line for new quarters (except Q1 which is handled separately)
      if (poss.quarter > 1) {
        const qLabel = getPeriodLabel(poss.quarter, timingConfig.numQuarters);
        const isOT = poss.quarter > timingConfig.numQuarters;
        const otNum = isOT ? poss.quarter - timingConfig.numQuarters : 0;
        const startClock = getPeriodStartClock(poss.quarter, timingConfig);
        const side = poss.team === 'HOME' ? 'home' : 'away';
        const periodStartDescription = isOT
          ? gameRules.startOfPossessionMethod === 'jump_ball'
            ? `Overtime ${otNum}! The ${side} side controls the opening tip.`
            : gameRules.startOfPossessionMethod === 'coin_toss'
              ? `Overtime ${otNum}! A fresh coin toss gives the ${side} side the first possession.`
              : `Overtime ${otNum}! Rock-paper-scissors gives the ${side} side the first possession.`
          : gameRules.possessionPattern === 'alternating'
            ? `The possession arrow gives the ${side} side the first possession of ${qLabel}.`
            : `The ${side} side controls the opening possession of ${qLabel}.`;

        allLines.push({
          id: makeId(`tipoff_${poss.quarter}`),
          tm: poss.team,
          period: qLabel,
          q: poss.quarter,
          clock: startClock,
          time: `${qLabel} ${startClock}`,
          gs: poss.gs - 0.1,
          pts: 0,
          desc: periodStartDescription,
          type: 'gameOver',
          cs, ds,
          possession: poss.team,
          otNum: isOT ? otNum : undefined,
          isOT,
        });
      }

      // Period-opening lineups are newly submitted starters, not substitutions.
      prevHomeLineup = [];
      prevAwayLineup = [];
    }

    const gs = poss.gs ?? 0;
    for (const ejection of finalResult?.ejections ?? []) {
      const start = getPeriodStartSeconds(ejection.quarter, timingConfig);
      const duration = getPeriodDurationSeconds(ejection.quarter, timingConfig);
      const ejectionGs = start + Math.max(0, duration - clockToSeconds(ejection.clock));
      if (ejectionGs > gs) continue;
      if (ejection.teamId === finalResult?.homeTeamId) excludedHome.add(ejection.playerId);
      if (ejection.teamId === finalResult?.awayTeamId) excludedAway.add(ejection.playerId);
    }

    const proposedHome = getAvailableLineup(homePool, gs, cs - ds, playersOnCourt, excludedHome);
    const proposedAway = getAvailableLineup(awayPool, gs, ds - cs, playersOnCourt, excludedAway);
    const boundedHome = enforceSubstitutionLimit(
      prevHomeLineup,
      proposedHome,
      excludedHome,
      homeSubstitutions,
      gameRules.substitutionLimitEnabled,
      gameRules.maxSubstitutions,
      playersOnCourt,
    );
    const boundedAway = enforceSubstitutionLimit(
      prevAwayLineup,
      proposedAway,
      excludedAway,
      awaySubstitutions,
      gameRules.substitutionLimitEnabled,
      gameRules.maxSubstitutions,
      playersOnCourt,
    );
    const homeLineup = alignLineupToPossession(boundedHome.lineup, poss, 'HOME', playersOnCourt);
    const awayLineup = alignLineupToPossession(boundedAway.lineup, poss, 'AWAY', playersOnCourt);
    homeSubstitutions = boundedHome.used;
    awaySubstitutions = boundedAway.used;

    if (prevHomeLineup.length > 0) {
      const homeSubs = detectSubs(prevHomeLineup, homeLineup);
      if (homeSubs.comingIn.length > 0) {
        const subKey = `HOME-${homeSubs.comingIn.map(p => p.id).sort().join('-')}`;
        if (!lastSubKey.has(subKey)) {
          lastSubKey.add(subKey);
          // Use prev lineups so the outgoing player gets credit up to the sub.
          allLines.push(buildSubLine('HOME', homeSubs.comingIn, homeSubs.goingOut, poss, cs, ds, prevHomeLineup, prevAwayLineup));
        }
      }
    }

    if (prevAwayLineup.length > 0) {
      const awaySubs = detectSubs(prevAwayLineup, awayLineup);
      if (awaySubs.comingIn.length > 0) {
        const subKey = `AWAY-${awaySubs.comingIn.map(p => p.id).sort().join('-')}`;
        if (!lastSubKey.has(subKey)) {
          lastSubKey.add(subKey);
          allLines.push(buildSubLine('AWAY', awaySubs.comingIn, awaySubs.goingOut, poss, cs, ds, prevHomeLineup, prevAwayLineup));
        }
      }
    }

    prevHomeLineup = homeLineup;
    prevAwayLineup = awayLineup;

    const { lines, newHomeScore, newAwayScore } = renderPossession(
      poss, cs, ds, homeLineup, awayLineup, gameRules
    );

    cs = newHomeScore;
    ds = newAwayScore;
    allLines.push(...lines);

    if (poss.isFoulOut && poss.fouler) {
      (poss.fouler.tm === 'HOME' ? excludedHome : excludedAway).add(poss.fouler.id);
    }

    prevPoss = poss;
  }

  const winningTeamStr = finalResult?.winnerId === finalResult?.homeTeamId
    ? 'HOME'
    : finalResult?.winnerId === finalResult?.awayTeamId
      ? 'AWAY'
      : gameWinner 
    ? (homePool.some(p => p.id === gameWinner.playerId) ? 'HOME' : 'AWAY')
    : (expectedHomeFinal > expectedAwayFinal ? 'HOME' : 'AWAY');

  if (gameWinner && allLines.length > 0) {
    const winningScoreIdx = findLateGameWinningScoreIndex(allLines, winningTeamStr, timingConfig.numQuarters);
    if (winningScoreIdx !== -1) {
      const wp = allLines[winningScoreIdx];
      const clock = safeClock(wp.clock, '0');
      const playerName = wp.player?.n || gameWinner.playerName;
      let desc: string;
      
      const secondsLeft = clockToSeconds(clock);
      const isWalkoff = secondsLeft <= 5.0;
      
      if (wp.type === 'ft') {
        desc = `${playerName} free throw GOOD — ${isWalkoff ? 'GAME OVER' : 'clutch from the stripe'}! (${clock})`;
      } else if (gameRules.fieldGoalValue === 1) {
        desc = `${playerName} scores the winning goal ${isWalkoff ? 'at the horn' : `with ${clock} left`}!`;
      } else if (wp.pts === 3) {
        desc = `${playerName} BURIES THE THREE!! ${isWalkoff ? '🚨 WALKOFF THREE!' : 'clutch shot!'} (${clock})`;
      } else {
        desc = `${playerName} ${isWalkoff ? 'HITS THE WALKOFF' : 'clutch bucket'}!! (${clock})`;
      }
      
      allLines[winningScoreIdx] = { ...wp, desc, isGameWinner: true } as any;

      if (isWalkoff) {
        const buzzerLine = allLines.find(line => line.id === 'final');
        if (buzzerLine) {
          buzzerLine.desc = pick([
            `${playerName} WINS IT AT THE BUZZER!! THE CROWD ERUPTS!!`,
            `FINAL!! ${playerName} IS MOBBED BY TEAMMATES!! WHAT A GAME!!`,
            `BALLGAME!! ${playerName} DELIVERS THE DAGGER!! UNBELIEVABLE!!`,
          ]);
          buzzerLine.type = 'gameOver';
        }
      }
    }
  }

  // Do not truncate the array, let the game finish naturally
  if (allLines.length > 0) {
    const lastLine = allLines[allLines.length - 1];
    if (lastLine.q >= timingConfig.numQuarters) {
      const lastPossessionTeam = lastLine.possession;
      const lastLineup = lastPossessionTeam === 'HOME' ? lastLine.lineupHOME : lastLine.lineupAWAY;
      const player = lastLineup && lastLineup.length > 0 ? lastLineup[0] : null;
      const playerName = player ? player.n : (lastPossessionTeam === 'HOME' ? homeTeamName : awayTeamName) || 'The team';
      
      const isHomeLosing = winningTeamStr === 'AWAY';
      const isAwayLosing = winningTeamStr === 'HOME';
      const isLosing = (lastPossessionTeam === 'HOME' && isHomeLosing) || (lastPossessionTeam === 'AWAY' && isAwayLosing);

      let desc: string;
      if (isLosing) {
        const desperationVariations = [
          `${playerName} cannot create a clean look before the horn.`,
          `${playerName} is forced to hold as the final seconds disappear.`,
          `${playerName} runs out of time trying to create one last chance.`,
          `The defense closes the final possession and the buzzer sounds.`,
          `Time expires before the offense can release a shot.`
        ];
        desc = desperationVariations[Math.floor(Math.random() * desperationVariations.length)];
      } else {
        const variations = gameRules.dribbleRule === 'continuous'
          ? [
              `${playerName} dribbles out the clock.`,
              `${playerName} runs down the final seconds.`,
              `${playerName} milks the clock.`,
              `${playerName} lets it expire.`,
              'The buzzer sounds.',
            ]
          : [
              `${playerName} keeps possession as the final seconds expire.`,
              `${playerName} lets the final seconds pass.`,
              'The final horn sounds.',
            ];
        desc = variations[Math.floor(Math.random() * variations.length)];
      }

      allLines.push({
        id: 'final',
        tm: lastPossessionTeam,
        period: lastLine.period,
        clock: '0:00',
        time: `${lastLine.period} 0:00`,
        gs: Math.max(...allLines.map(line => line.gs ?? 0)) + 0.1,
        pts: 0,
        desc,
        type: 'gameOver',
        player: player || undefined,
        cs: expectedHomeFinal,
        ds: expectedAwayFinal,
        q: lastLine.q,
        possession: lastPossessionTeam,
      });
    }
  }

  const withLiveEvents = injectLiveEvents(
    allLines,
    finalResult,
    homePool,
    awayPool,
    timingConfig,
    playersOnCourt,
  );
  return validateAndNormalizePlaySequence(reconcilePlaybackScores(withLiveEvents, quarterScores))
    .plays.map(punctuateCommentary);
}

