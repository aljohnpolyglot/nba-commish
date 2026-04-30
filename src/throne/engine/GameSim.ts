import { Player, GameState, GameSettings, GameStatus, LogEntry, PlayerStats, PossessionResult } from '../types/throne';

const emptyStats = (): PlayerStats => ({ fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pts: 0, reb: 0, ast: 0, streak: 0 });

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export class GameSim {
  private state: GameState;
  private settings: GameSettings;

  constructor(player1: Player, player2: Player, firstPossessionId: string, settings: GameSettings) {
    this.settings = settings;
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

  nextPossession(): LogEntry | null {
    if (this.state.status === GameStatus.FINISHED) return null;
    if (this.state.status === GameStatus.PRE_GAME) this.state.status = GameStatus.IN_PROGRESS;

    const { player1, player2, currentPossessionPlayerId } = this.state;
    const isP1Off = currentPossessionPlayerId === player1.id;
    const off = isP1Off ? player1 : player2;
    const def = isP1Off ? player2 : player1;
    const offStats = isP1Off ? this.state.p1Stats : this.state.p2Stats;
    const defStats = isP1Off ? this.state.p2Stats : this.state.p1Stats;

    this.state.possessionCount++;

    const r = off.ratings;
    const dr = def.ratings;

    // Turnover?
    const toProb = clamp(0.12 - (r.drb - dr.def) / 600);
    if (Math.random() < toProb) {
      this.state.currentPossessionPlayerId = def.id;
      offStats.streak = 0;
      const log = this.makeLog(`${off.lastName} loses the handle — ${def.lastName} takes over`, off.id);
      this.updateWinProb();
      return log;
    }

    // Block?
    const blkProb = clamp((dr.blk + dr.hgt * 0.3 - r.ins * 0.2 - r.hgt * 0.2) / 300);
    const isInsideTry = Math.random() < clamp(r.ins / (r.ins + r.fg + r.tp + 0.001));

    if (isInsideTry && Math.random() < blkProb) {
      defStats.reb++;
      this.state.currentPossessionPlayerId = def.id;
      offStats.streak = 0;
      const log = this.makeLog(`${def.lastName} rejects the layup attempt!`, off.id);
      this.updateWinProb();
      return log;
    }

    // Shot selection
    const rand = Math.random();
    const insW = r.ins + r.dnk * 0.5;
    const midW = r.fg * 0.8;
    const tpW = r.tp * 0.7;
    const total = insW + midW + tpW;
    const insThresh = insW / total;
    const midThresh = insThresh + midW / total;

    let shotType: 'inside' | 'mid' | 'three';
    let baseProb: number;
    let pts: number;
    let makeDesc: string;
    let missDesc: string;

    if (rand < insThresh) {
      shotType = 'inside';
      baseProb = clamp(r.ins / 100 + r.dnk / 200 - dr.def / 150 - dr.hgt / 300, 0.3, 0.72);
      pts = this.settings.scoringSystem === '2-3' ? 2 : 1;
      const isDunk = r.dnk > 65 && r.jmp > 60 && Math.random() > 0.45;
      makeDesc = isDunk ? `${off.lastName} slams it home!` : `${off.lastName} scores inside`;
      missDesc = `${off.lastName} misses inside`;
      offStats.fga++;
    } else if (rand < midThresh) {
      shotType = 'mid';
      baseProb = clamp(r.fg / 100 - dr.def / 180, 0.28, 0.62);
      pts = this.settings.scoringSystem === '2-3' ? 2 : 1;
      makeDesc = `${off.lastName} hits the mid-range jumper`;
      missDesc = `${off.lastName} misses the mid-range`;
      offStats.fga++;
    } else {
      shotType = 'three';
      baseProb = clamp(r.tp / 100 - dr.def / 220 - dr.spd / 400, 0.2, 0.55);
      pts = this.settings.scoringSystem === '2-3' ? 3 : 2;
      makeDesc = Math.random() > 0.5 ? `${off.lastName} splashes the triple!` : `${off.lastName} hits from downtown!`;
      missDesc = `${off.lastName} misses from three`;
      offStats.fga++;
      offStats.tpa++;
    }

    const makes = Math.random() < baseProb;

    if (makes) {
      offStats.fgm++;
      if (shotType === 'three') offStats.tpm++;
      offStats.pts += pts;
      offStats.streak++;
      if (isP1Off) this.state.score1 += pts;
      else this.state.score2 += pts;

      if (!this.settings.makeItTakeIt) this.state.currentPossessionPlayerId = def.id;

      this.checkGameEnd();
      this.updateWinProb();
      return this.makeLog(makeDesc, off.id);
    } else {
      // Rebound
      const offRebProb = clamp((r.reb + r.jmp * 0.5 - dr.reb * 0.8 - dr.hgt * 0.3) / 200 + 0.35, 0.2, 0.65);
      if (Math.random() < offRebProb) {
        offStats.reb++;
        this.updateWinProb();
        return this.makeLog(`${missDesc} — offensive rebound by ${off.lastName}`, off.id);
      } else {
        defStats.reb++;
        offStats.streak = 0;
        this.state.currentPossessionPlayerId = def.id;
        this.updateWinProb();
        return this.makeLog(`${missDesc} — ${def.lastName} cleans it up`, off.id);
      }
    }
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

  private makeLog(text: string, playerId: string): LogEntry {
    const log: LogEntry = {
      text, playerId,
      timestamp: `POSS ${this.state.possessionCount}`,
      score1: this.state.score1,
      score2: this.state.score2,
    };
    this.state.logs.push(log);
    return log;
  }
}
