import { ArraySink } from './eventSink';
import {
  InlineEvent,
  PlayerQuarterBudget,
  QuarterBudgets,
  SynthesizeInput,
} from './types';
import { PlayerPool, TeamId } from '../live/playback/possessionTypes';
import { RotationService } from '../live/playback/rotationService';
import {
  getPeriodDurationSeconds,
  getPeriodLabel,
  getPeriodStartSeconds,
} from '../../../utils/gameClock';
import {
  generateMadeNarrative,
  generateMissNarrative,
  generateReboundNarrative,
  generateTovNarrative,
  generateBlockNarrative,
} from '../live/playback/badgeCommentary';
interface PendingShot {
  pid: string;
  team: TeamId;
  kind: 'made2' | 'made3' | 'made4' | 'miss2' | 'miss3' | 'miss4';
}
interface PendingFoul {
  foulerPid: string;
  foulerTeam: TeamId;
  victimPid?: string;
  victimTeam?: TeamId;
  fts: { made: boolean }[];
}

function buildPool(
  byPid: Map<string, PlayerQuarterBudget>,
  stats: import('../types').PlayerGameStats[],
  players: import('../../../types').NBAPlayer[],
  tm: TeamId,
): PlayerPool[] {
  return stats.filter(Boolean).map(stat => {
    const b = byPid.get(stat.playerId) ?? null;
    const player = players.find(p => p.internalId?.toString() === stat.playerId) || players[0];
    return {
      n: stat.name,
      fn: stat.name,
      id: stat.playerId,
      imgURL: player?.imgURL,
      face: (player as any)?.face,
      tm,
      min: (b?.sec ?? 0) / 60,
      pos: (player?.pos as 'G' | 'F' | 'C') ?? 'C',
      fg2: b?.fg2 ?? 0,
      fg3: b?.fg3 ?? 0,
      fg4: b?.fg4 ?? 0,
      m2: b?.m2 ?? 0,
      m3: b?.m3 ?? 0,
      m4: b?.m4 ?? 0,
      ftm: b?.ftm ?? 0,
      ftmiss: b?.ftmiss ?? 0,
      ast: b?.ast ?? 0,
      orb: b?.orb ?? 0,
      drb: b?.drb ?? 0,
      stl: b?.stl ?? 0,
      blk: b?.blk ?? 0,
      tov: b?.tov ?? 0,
      pf: b?.pf ?? 0,
    };
  });
}

function shotsFromBudgets(
  byPid: Map<string, PlayerQuarterBudget>,
  team: TeamId,
): PendingShot[] {
  const shots: PendingShot[] = [];
  for (const [pid, b] of byPid) {
    for (let i = 0; i < b.fg2; i++) shots.push({ pid, team, kind: 'made2' });
    for (let i = 0; i < b.fg3; i++) shots.push({ pid, team, kind: 'made3' });
    for (let i = 0; i < b.fg4; i++) shots.push({ pid, team, kind: 'made4' });
    for (let i = 0; i < b.m2; i++) shots.push({ pid, team, kind: 'miss2' });
    for (let i = 0; i < b.m3; i++) shots.push({ pid, team, kind: 'miss3' });
    for (let i = 0; i < b.m4; i++) shots.push({ pid, team, kind: 'miss4' });
  }
  return shots;
}
function interleaveShots(home: PendingShot[], away: PendingShot[]): PendingShot[] {
  const out: PendingShot[] = [];
  let hi = 0, ai = 0;
  let turn: TeamId = 'HOME';
  while (hi < home.length || ai < away.length) {
    if (turn === 'HOME' && hi < home.length) {
      out.push(home[hi++]);
      turn = 'AWAY';
    } else if (turn === 'AWAY' && ai < away.length) {
      out.push(away[ai++]);
      turn = 'HOME';
    } else if (hi < home.length) {
      out.push(home[hi++]);
    } else if (ai < away.length) {
      out.push(away[ai++]);
    }
  }
  return out;
}

function findPool(pool: PlayerPool[], pid: string): PlayerPool | undefined {
  return pool.find(p => p.id === pid);
}

function consumeAssist(
  byPid: Map<string, PlayerQuarterBudget>,
  pool: PlayerPool[],
  scorerPid: string,
): PlayerPool | undefined {
  if (Math.random() > 0.6) return undefined;
  for (const p of pool) {
    if (p.id === scorerPid) continue;
    const b = byPid.get(p.id);
    if (b && b.ast > 0) {
      b.ast--;
      return p;
    }
  }
  return undefined;
}

function consumeRebound(
  ownByPid: Map<string, PlayerQuarterBudget>,
  oppByPid: Map<string, PlayerQuarterBudget>,
  ownPool: PlayerPool[],
  oppPool: PlayerPool[],
): { rebounder: PlayerPool; isOff: boolean } | undefined {
  for (const p of oppPool) {
    const b = oppByPid.get(p.id);
    if (b && b.drb > 0) {
      b.drb--;
      return { rebounder: p, isOff: false };
    }
  }
  for (const p of ownPool) {
    const b = ownByPid.get(p.id);
    if (b && b.orb > 0) {
      b.orb--;
      return { rebounder: p, isOff: true };
    }
  }
  return undefined;
}

function consumeBlock(
  oppByPid: Map<string, PlayerQuarterBudget>,
  oppPool: PlayerPool[],
): PlayerPool | undefined {
  if (Math.random() > 0.18) return undefined;
  for (const p of oppPool) {
    const b = oppByPid.get(p.id);
    if (b && b.blk > 0) {
      b.blk--;
      return p;
    }
  }
  return undefined;
}

function consumeSteal(
  oppByPid: Map<string, PlayerQuarterBudget>,
  oppPool: PlayerPool[],
): PlayerPool | undefined {
  if (Math.random() > 0.55) return undefined;
  for (const p of oppPool) {
    const b = oppByPid.get(p.id);
    if (b && b.stl > 0) {
      b.stl--;
      return p;
    }
  }
  return undefined;
}

function pidOfFirst<T extends { pid: string }>(arr: T[]): string | undefined {
  return arr[0]?.pid;
}

function pickTov(byPid: Map<string, PlayerQuarterBudget>): string | undefined {
  for (const [pid, b] of byPid) if (b.tov > 0) return pid;
  return undefined;
}

function pickFoul(byPid: Map<string, PlayerQuarterBudget>): string | undefined {
  for (const [pid, b] of byPid) if (b.pf > 0) return pid;
  return undefined;
}

function pickFtVictim(byPid: Map<string, PlayerQuarterBudget>): string | undefined {
  for (const [pid, b] of byPid) if (b.ftm + b.ftmiss > 0) return pid;
  return undefined;
}

function makeId(q: number, idx: number, suffix: string): string {
  return `q${q}-${idx}-${suffix}`;
}

export function emitQuarter(
  sink: ArraySink,
  q: number,
  budgets: QuarterBudgets,
  input: SynthesizeInput,
): void {
  const { homeStats, awayStats, players, timingConfig, otCount } = input;
  const qDur = getPeriodDurationSeconds(q, timingConfig);
  const qStartGs = getPeriodStartSeconds(q, timingConfig);
  const period = getPeriodLabel(q, timingConfig.numQuarters);
  const isOT = q > timingConfig.numQuarters;
  const otNum = isOT ? q - timingConfig.numQuarters : undefined;

  const homePool = buildPool(budgets.homeByPid, homeStats, players, 'HOME');
  const awayPool = buildPool(budgets.awayByPid, awayStats, players, 'AWAY');

  if (q === 1) {
    const startHome = RotationService.getLineupAtTime(homePool, 0, 0);
    const startAway = RotationService.getLineupAtTime(awayPool, 0, 0);
    const tipWinner: TeamId = Math.random() > 0.5 ? 'HOME' : 'AWAY';
    const tipPool = tipWinner === 'HOME' ? startHome : startAway;
    const loserPool = tipWinner === 'HOME' ? startAway : startHome;
    const tipW = tipPool.find(p => p.pos === 'C') ?? tipPool[0];
    const tipL = loserPool.find(p => p.pos === 'C') ?? loserPool[0];
    sink.emit({
      id: 'jumpball',
      type: 'jumpball',
      q: 1, period, clock: `${Math.floor(qDur / 60)}:00`,
      gs: 0,
      time: `${period} ${Math.floor(qDur / 60)}:00`,
      tm: tipWinner,
      possession: tipWinner,
      lineupHOME: startHome,
      lineupAWAY: startAway,
      player: tipW,
      pts: 0,
      desc: tipW && tipL ? `Jumpball! ${tipW.n} wins the tip over ${tipL.n}.` : 'Jumpball!',
    });
  }

  const homeShots = shotsFromBudgets(budgets.homeByPid, 'HOME');
  const awayShots = shotsFromBudgets(budgets.awayByPid, 'AWAY');
  const sequence = interleaveShots(homeShots, awayShots);

  const totalSlots = sequence.length + 1;
  let idx = 0;
  const clockForIdx = (i: number): { gs: number; clock: string } => {
    const frac = totalSlots > 1 ? i / Math.max(1, totalSlots - 1) : 0;
    const elapsed = Math.min(qDur - 0.5, Math.max(0.5, frac * qDur));
    const gs = qStartGs + elapsed;
    const remaining = Math.max(0, qDur - elapsed);
    const mm = Math.floor(remaining / 60);
    const ss = Math.floor(remaining % 60);
    const clock = `${mm}:${ss.toString().padStart(2, '0')}`;
    return { gs, clock };
  };

  const lineupAt = (gs: number, diff: number) => ({
    home: RotationService.getLineupAtTime(homePool, gs, diff),
    away: RotationService.getLineupAtTime(awayPool, gs, -diff),
  });

  if (q > 1) {
    const startGs = qStartGs - 0.1;
    sink.emit({
      id: makeId(q, -1, isOT ? 'ot_start' : 'q_start'),
      type: 'gameOver',
      q, period,
      clock: q === timingConfig.numQuarters + 1 || isOT
        ? `${Math.floor(qDur / 60)}:${(qDur % 60).toString().padStart(2, '0')}`
        : `${Math.floor(qDur / 60)}:00`,
      gs: startGs,
      time: `${period} start`,
      tm: 'HOME',
      possession: 'HOME',
      lineupHOME: [],
      lineupAWAY: [],
      pts: 0,
      desc: isOT ? `Overtime ${otNum}! Here we go!!` : `${period} quarter underway.`,
      isOT,
      otNum,
    });
  }

  let runningHomePts = 0;
  let runningAwayPts = 0;

  for (const shot of sequence) {
    const { gs, clock } = clockForIdx(idx);
    const diff = runningHomePts - runningAwayPts;
    const { home: homeLineup, away: awayLineup } = lineupAt(gs, diff);

    const ownByPid = shot.team === 'HOME' ? budgets.homeByPid : budgets.awayByPid;
    const oppByPid = shot.team === 'HOME' ? budgets.awayByPid : budgets.homeByPid;
    const ownPool = shot.team === 'HOME' ? homeLineup : awayLineup;
    const oppPool = shot.team === 'HOME' ? awayLineup : homeLineup;
    const fullOwnPool = shot.team === 'HOME' ? homePool : awayPool;

    const shooter = findPool(fullOwnPool, shot.pid);
    if (!shooter) { idx++; continue; }

    const isMade = shot.kind.startsWith('made');
    const is3 = shot.kind === 'made3' || shot.kind === 'miss3';
    const is4 = shot.kind === 'made4' || shot.kind === 'miss4';
    const pts = isMade ? (is4 ? 4 : is3 ? 3 : 2) : 0;

    if (isMade) {
      const assister = consumeAssist(ownByPid, ownPool, shooter.id);
      const desc = generateMadeNarrative(shooter, pts, assister ?? null, false, oppPool);
      sink.emit({
        id: makeId(q, idx, 'made'),
        type: 'made',
        q, period, clock, gs,
        time: `${period} ${clock}`,
        tm: shot.team,
        possession: shot.team,
        lineupHOME: homeLineup,
        lineupAWAY: awayLineup,
        player: shooter,
        astPlayer: assister,
        pts,
        is3, is4,
        desc,
      });
      if (shot.team === 'HOME') runningHomePts += pts; else runningAwayPts += pts;
    } else {
      const blocker = consumeBlock(oppByPid, oppPool);
      const missDesc = generateMissNarrative(shooter, is3 || is4, oppPool);
      sink.emit({
        id: makeId(q, idx, 'miss'),
        type: 'miss',
        q, period, clock, gs,
        time: `${period} ${clock}`,
        tm: shot.team,
        possession: shot.team,
        lineupHOME: homeLineup,
        lineupAWAY: awayLineup,
        player: shooter,
        blocker,
        pts: 0,
        is3, is4,
        desc: missDesc,
      });
      if (blocker) {
        sink.emit({
          id: makeId(q, idx, 'blk'),
          type: 'blk',
          q, period, clock,
          gs: gs + 0.01,
          time: `${period} ${clock}`,
          tm: blocker.tm,
          possession: shot.team,
          lineupHOME: homeLineup,
          lineupAWAY: awayLineup,
          player: blocker,
          pts: 0,
          desc: generateBlockNarrative(blocker, shooter),
        });
      }
      const reb = consumeRebound(ownByPid, oppByPid, ownPool, oppPool);
      if (reb) {
        sink.emit({
          id: makeId(q, idx, 'reb'),
          type: 'reb',
          q, period, clock,
          gs: gs + 0.02,
          time: `${period} ${clock}`,
          tm: reb.rebounder.tm,
          possession: reb.isOff ? shot.team : (shot.team === 'HOME' ? 'AWAY' : 'HOME'),
          lineupHOME: homeLineup,
          lineupAWAY: awayLineup,
          player: reb.rebounder,
          pts: 0,
          isOffReb: reb.isOff,
          desc: generateReboundNarrative(reb.rebounder, reb.isOff, false),
        });
      }
    }

    idx++;
  }

  const drainFTsForTeam = (team: TeamId, byPid: Map<string, PlayerQuarterBudget>, pool: PlayerPool[]) => {
    for (const p of pool) {
      const b = byPid.get(p.id);
      if (!b) continue;
      const totalFt = b.ftm + b.ftmiss;
      if (totalFt === 0) continue;
      const { gs, clock } = clockForIdx(idx);
      const diff = runningHomePts - runningAwayPts;
      const lineup = lineupAt(gs, diff);

      const fouler = pickFoul(team === 'HOME' ? budgets.awayByPid : budgets.homeByPid);
      const foulerPlayer = fouler
        ? findPool(team === 'HOME' ? awayPool : homePool, fouler)
        : (team === 'HOME' ? awayPool[0] : homePool[0]);
      if (foulerPlayer) {
        const fb = (team === 'HOME' ? budgets.awayByPid : budgets.homeByPid).get(foulerPlayer.id);
        if (fb && fb.pf > 0) fb.pf--;
        sink.emit({
          id: makeId(q, idx, 'foul'),
          type: 'foul',
          q, period, clock, gs,
          time: `${period} ${clock}`,
          tm: foulerPlayer.tm,
          possession: team,
          lineupHOME: lineup.home,
          lineupAWAY: lineup.away,
          player: foulerPlayer,
          pts: 0,
          desc: `Foul called on ${foulerPlayer.n}.`,
        });
      }

      for (let i = 0; i < totalFt; i++) {
        const isMake = b.ftm > 0;
        if (isMake) b.ftm--;
        else b.ftmiss--;
        const ftIdx = i + 1;
        const { gs: ftGs, clock: ftClock } = clockForIdx(idx);
        sink.emit({
          id: makeId(q, idx, `ft${i}`),
          type: 'ft',
          q, period, clock: ftClock,
          gs: ftGs + 0.1 * ftIdx,
          time: `${period} ${ftClock}`,
          tm: team,
          possession: team,
          lineupHOME: lineup.home,
          lineupAWAY: lineup.away,
          player: p,
          pts: isMake ? 1 : 0,
          isMake,
          desc: isMake ? `${p.n} free throw GOOD.` : `${p.n} free throw MISSED.`,
        });
        if (isMake) {
          if (team === 'HOME') runningHomePts += 1;
          else runningAwayPts += 1;
        }
      }
      idx++;
    }
  };
  drainFTsForTeam('HOME', budgets.homeByPid, homePool);
  drainFTsForTeam('AWAY', budgets.awayByPid, awayPool);

  const drainTovs = (team: TeamId, byPid: Map<string, PlayerQuarterBudget>, pool: PlayerPool[]) => {
    const oppByPid = team === 'HOME' ? budgets.awayByPid : budgets.homeByPid;
    const oppPool = team === 'HOME' ? awayPool : homePool;
    for (const p of pool) {
      const b = byPid.get(p.id);
      if (!b) continue;
      while (b.tov > 0) {
        b.tov--;
        const { gs, clock } = clockForIdx(idx);
        const diff = runningHomePts - runningAwayPts;
        const lineup = lineupAt(gs, diff);
        const stealer = consumeSteal(oppByPid, oppPool);
        sink.emit({
          id: makeId(q, idx, 'tov'),
          type: 'tov',
          q, period, clock, gs,
          time: `${period} ${clock}`,
          tm: team,
          possession: team,
          lineupHOME: lineup.home,
          lineupAWAY: lineup.away,
          player: p,
          stealer,
          pts: 0,
          desc: generateTovNarrative(p, stealer ?? null),
        });
        idx++;
      }
    }
  };
  drainTovs('HOME', budgets.homeByPid, homePool);
  drainTovs('AWAY', budgets.awayByPid, awayPool);

  if (q === timingConfig.numQuarters + otCount) {
    sink.emit({
      id: makeId(q, idx, 'final'),
      type: 'gameOver',
      q, period,
      clock: '0:00',
      gs: qStartGs + qDur,
      time: `${period} 0:00`,
      tm: 'HOME',
      possession: 'HOME',
      lineupHOME: [],
      lineupAWAY: [],
      pts: 0,
      desc: 'The buzzer sounds.',
    });
  }
}
