import { Player, GameState, GameSettings, GameStatus, LogEntry, PlayerStats } from '../types/throne';
import {
  dunkMake, insideMake, midMake, threeCreatorMake, threeCatchMake,
  insideMiss, midMiss, threeMiss,
  blockLine, turnoverLine, stealLine, selfTurnoverLine,
  offReboundSuffix, defReboundSuffix,
  streakSuffix,
  gameEndDominant, gameEndClose, gameEndNailBiter,
} from './commentary';
import { calculateK2 } from '../../services/simulation/convert2kAttributes';

type K2 = ReturnType<typeof calculateK2>;

const emptyStats = (): PlayerStats => ({ fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, streak: 0 });

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function buildK2(p: Player): K2 {
  const r = p.ratings;
  const hgt = r.hgt ?? 50;
  const ins = r.ins ?? 50;
  const dnk = r.dnk ?? 50;
  const jmp = r.jmp ?? 50;
  const fg = r.fg ?? 50;
  const tp = r.tp ?? 50;
  const drb = r.drb ?? 50;
  const spd = r.spd ?? 50;
  const def = r.def ?? 50;
  const blk = r.blk ?? 50;
  const reb = r.reb ?? 50;
  return calculateK2({
    hgt,
    stre: Math.min(99, Math.round(ins * 0.4 + dnk * 0.4 + jmp * 0.2)),
    spd,
    jmp,
    endu: 70,
    ins,
    dnk,
    ft: Math.min(99, Math.round(fg * 0.9 + 5)),
    fg,
    tp,
    oiq: Math.min(99, Math.round(drb * 0.4 + fg * 0.3 + tp * 0.2 + 10)),
    diq: def,
    drb,
    pss: Math.min(99, Math.round(drb * 0.7 + 15)),
    reb,
    blk,
  } as any, { pos: p.pos, heightIn: 68 + Math.round(hgt * 0.22), weightLbs: 215, age: 27 });
}

export class GameSim {
  private state: GameState;
  private settings: GameSettings;
  private p1K2: K2;
  private p2K2: K2;
  private playSequence: number = 0;

  constructor(player1: Player, player2: Player, firstPossessionId: string, settings: GameSettings) {
    this.settings = settings;
    this.p1K2 = buildK2(player1);
    this.p2K2 = buildK2(player2);
    this.state = {
      player1, player2,
      score1: 0, score2: 0,
      status: GameStatus.PRE_GAME,
      logs: [],
      possessionCount: 0,
      currentPossessionPlayerId: firstPossessionId,
      winProb1: 0.5, winProb2: 0.5,
      momentum: 0,
      p1Stats: emptyStats(),
      p2Stats: emptyStats(),
    };
  }

  getState(): GameState {
    return { ...this.state, p1Stats: { ...this.state.p1Stats }, p2Stats: { ...this.state.p2Stats } };
  }

  getK2(): { p1K2: K2; p2K2: K2 } {
    return { p1K2: this.p1K2, p2K2: this.p2K2 };
  }

  nextPossession(): LogEntry[] {
    if (this.state.status === GameStatus.FINISHED) return [];
    if (this.state.status === GameStatus.PRE_GAME) this.state.status = GameStatus.IN_PROGRESS;

    const { player1, player2, currentPossessionPlayerId } = this.state;
    const isP1Off = currentPossessionPlayerId === player1.id;
    const off = isP1Off ? player1 : player2;
    const def = isP1Off ? player2 : player1;
    const offK2 = isP1Off ? this.p1K2 : this.p2K2;
    const defK2 = isP1Off ? this.p2K2 : this.p1K2;
    const offStats = isP1Off ? this.state.p1Stats : this.state.p2Stats;
    const defStats = isP1Off ? this.state.p2Stats : this.state.p1Stats;

    this.state.possessionCount++;

    // K2 sub-attributes used for probabilities
    // DF.sub[2] = steal, PL.sub[1] = ball handle, IS.sub[2] = dunk, IS.sub[0] = layup
    // OS.sub[1] = mid-range, OS.sub[2] = three-point, DF.sub[0] = interior def, DF.sub[1] = perimeter def
    // RB.sub[0] = off reb, RB.sub[1] = def reb, AT.sub[3] = athleticism
    const stealK2 = defK2.DF?.sub?.[2] ?? 65;
    const bhK2 = offK2.PL?.sub?.[1] ?? 65;
    const dunkK2 = offK2.IS?.sub?.[2] ?? 50;
    const layupK2 = offK2.IS?.sub?.[0] ?? 65;
    const midK2 = offK2.OS?.sub?.[1] ?? 65;
    const threeK2 = offK2.OS?.sub?.[2] ?? 65;
    const blkK2 = defK2.DF?.sub?.[3] ?? 60;
    const intDefK2 = defK2.DF?.sub?.[0] ?? 65;
    const periDefK2 = defK2.DF?.sub?.[1] ?? 65;
    const offRebK2 = offK2.RB?.sub?.[0] ?? 60;
    const defRebK2 = defK2.RB?.sub?.[1] ?? 65;
    const athleticK2 = offK2.AT?.sub?.[3] ?? 65;

    // Turnover — based on ball handle vs steal rating
    const toProb = clamp(0.06 + (stealK2 - 70) * 0.004 - (bhK2 - 70) * 0.003, 0.02, 0.18);
    if (Math.random() < toProb) {
      this.state.currentPossessionPlayerId = def.id;
      offStats.streak = 0;
      // Separate forced steal from unforced turnover
      const isSteal = Math.random() < clamp(0.3 + (stealK2 - bhK2) / 60, 0.1, 0.85);
      if (isSteal) {
        defStats.stl++;
        return [this.makeLog(stealLine(def.lastName, off.lastName), def.id, 'steal')];
      } else {
        return [this.makeLog(selfTurnoverLine(off.lastName), off.id, 'turnover')];
      }
    }

    // Block attempt — only inside tries
    const blkProb = clamp((blkK2 - 60) * 0.008 + (intDefK2 - 65) * 0.003 - (layupK2 - 65) * 0.003, 0.01, 0.18);
    const insideWeight = layupK2 + dunkK2 * 0.4;
    const midWeight = midK2 * 0.9;
    const threeWeight = threeK2 * 0.75;
    const totalW = insideWeight + midWeight + threeWeight;
    const insThresh = insideWeight / totalW;
    const midThresh = insThresh + midWeight / totalW;
    const shotRand = Math.random();
    const isInsideTry = shotRand < insThresh;

    if (isInsideTry && Math.random() < blkProb) {
      defStats.reb++;
      defStats.blk++;
      this.state.currentPossessionPlayerId = def.id;
      offStats.streak = 0;
      return [this.makeLog(blockLine(def.lastName, off.lastName), def.id, 'block')];
    }

    let shotType: 'inside' | 'mid' | 'three';
    let baseProb: number;
    let pts: number;
    let makeText: string;
    let missText: string;

    if (isInsideTry) {
      shotType = 'inside';
      baseProb = clamp(0.35 + (layupK2 - 65) * 0.012 - (intDefK2 - 70) * 0.006, 0.28, 0.72);
      pts = this.settings.scoringSystem === '2-3' ? 2 : 1;
      // Dunk only for elite dunkers (~top 15%), rate scales with rating
      const canDunk = dunkK2 > 78 && athleticK2 > 70;
      const dunkRate = canDunk ? clamp((dunkK2 - 78) / 120, 0, 0.18) : 0;
      const isDunk = canDunk && Math.random() < dunkRate;
      makeText = isDunk ? dunkMake(off.lastName) : insideMake(off.lastName);
      missText = insideMiss(off.lastName);
      offStats.fga++;
    } else if (shotRand < midThresh) {
      shotType = 'mid';
      baseProb = clamp(0.25 + (midK2 - 65) * 0.009 - (periDefK2 - 70) * 0.005, 0.22, 0.58);
      pts = this.settings.scoringSystem === '2-3' ? 2 : 1;
      makeText = midMake(off.lastName);
      missText = midMiss(off.lastName);
      offStats.fga++;
    } else {
      shotType = 'three';
      baseProb = clamp(0.16 + (threeK2 - 65) * 0.008 - (periDefK2 - 70) * 0.004, 0.14, 0.48);
      pts = this.settings.scoringSystem === '2-3' ? 3 : 2;
      // Creator = high ball handle
      const isCreator = bhK2 > 70;
      makeText = isCreator ? threeCreatorMake(off.lastName) : threeCatchMake(off.lastName);
      missText = threeMiss(off.lastName);
      offStats.fga++;
      offStats.tpa++;
    }

    if (Math.random() < baseProb) {
      offStats.fgm++;
      if (shotType === 'three') offStats.tpm++;
      offStats.pts += pts;
      offStats.streak++;
      if (isP1Off) this.state.score1 += pts;
      else this.state.score2 += pts;

      if (!this.settings.makeItTakeIt) this.state.currentPossessionPlayerId = def.id;

      const wasFinished = (this.state.status as GameStatus) === GameStatus.FINISHED;
      this.checkGameEnd();
      this.updateWinProb();

      const makeLog = this.makeLog(makeText + streakSuffix(off.lastName, offStats.streak), off.id, 'make');
      if (!wasFinished && (this.state.status as GameStatus) === GameStatus.FINISHED) {
        const endLog = this.makeGameEndLog();
        return [makeLog, endLog];
      }
      return [makeLog];
    } else {
      const missLog = this.makeLog(missText, off.id, 'miss');
      const offRebProb = clamp(0.25 + (offRebK2 - 65) * 0.008 - (defRebK2 - 65) * 0.007, 0.15, 0.55);
      if (Math.random() < offRebProb) {
        offStats.reb++;
        this.updateWinProb();
        const rebLog = this.makeLog(offReboundSuffix(off.lastName), off.id, 'reb');
        return [missLog, rebLog];
      } else {
        defStats.reb++;
        offStats.streak = 0;
        this.state.currentPossessionPlayerId = def.id;
        this.updateWinProb();
        const rebLog = this.makeLog(defReboundSuffix(def.lastName), def.id, 'reb');
        return [missLog, rebLog];
      }
    }
  }

  private makeGameEndLog(): LogEntry {
    const { score1, score2, winner } = this.state;
    const w = Math.max(score1, score2);
    const l = Math.min(score1, score2);
    const diff = w - l;
    const name = winner?.lastName ?? '';
    let text: string;
    if (diff <= 1) {
      text = gameEndNailBiter(name, w, l);
    } else if (diff <= 3) {
      text = gameEndClose(name, w, l);
    } else {
      text = gameEndDominant(name, w, l);
    }
    return this.makeLog(text, winner?.id ?? '', 'end');
  }

  private checkGameEnd() {
    const { score1, score2, player1, player2 } = this.state;
    const t = this.settings.targetPoints;
    const gap = this.settings.winByTwo ? 2 : 1;
    if (score1 >= t && score1 - score2 >= gap) {
      this.state.status = GameStatus.FINISHED;
      this.state.winner = player1;
    } else if (score2 >= t && score2 - score1 >= gap) {
      this.state.status = GameStatus.FINISHED;
      this.state.winner = player2;
    }
  }

  private updateWinProb() {
    const { score1, score2 } = this.state;
    const t = this.settings.targetPoints;
    const need1 = t - score1;
    const need2 = t - score2;
    if (this.state.status === GameStatus.FINISHED) {
      this.state.winProb1 = this.state.winner?.id === this.state.player1.id ? 1 : 0;
      this.state.winProb2 = 1 - this.state.winProb1;
      return;
    }
    const advantage = (need2 - need1) / t;
    this.state.winProb1 = clamp(0.5 + advantage * 0.45, 0.04, 0.96);
    this.state.winProb2 = 1 - this.state.winProb1;
  }

  private makeLog(text: string, playerId: string, type: LogEntry['type']): LogEntry {
    this.playSequence++;
    const log: LogEntry = {
      text, playerId, type,
      timestamp: `PLAY ${this.playSequence}`,
      score1: this.state.score1,
      score2: this.state.score2,
    };
    this.state.logs.push(log);
    return log;
  }
}
