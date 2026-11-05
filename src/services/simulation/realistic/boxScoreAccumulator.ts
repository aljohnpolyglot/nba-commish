import { NBAPlayer as Player } from '../../../types';
import { PlayerGameStats } from '../types';
import type { GameRuleConfig } from '../types';
import { PossessionEnd } from './types';
import { DEFAULT_GAME_RULES } from '../gameRuleRuntime';

const BLANK = (p: Player): PlayerGameStats => ({
  playerId: p.internalId,
  name: p.name,
  min: 0,
  pts: 0,
  reb: 0,
  orb: 0,
  drb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  fgm: 0,
  fga: 0,
  threePm: 0,
  threePa: 0,
  fourPm: 0,
  fourPa: 0,
  ftm: 0,
  fta: 0,
  pf: 0,
  gs: 0,
  gameScore: 0,
  pm: 0,
  fgAtRim: 0,
  fgaAtRim: 0,
  fgLowPost: 0,
  fgaLowPost: 0,
  fgMidRange: 0,
  fgaMidRange: 0,
  ba: 0,
  dunks: 0,
  techs: 0,
});

export class BoxAccumulator {
  private byId = new Map<string, PlayerGameStats>();
  private order: string[] = [];
  private flagrant1ById = new Map<string, number>();
  private flagrant2ById = new Map<string, number>();
  private disqualified = new Map<string, 'technical' | 'flagrant_1' | 'flagrant_2'>();
  private disciplineEvents: Array<{
    playerId: string;
    discipline: 'technical' | 'flagrant_1' | 'flagrant_2';
    ejected: boolean;
    card?: 'yellow' | 'red';
    period: number;
    clockSeconds: number;
  }> = [];

  constructor(private readonly rules: GameRuleConfig = DEFAULT_GAME_RULES) {}

  registerRoster(roster: Player[], starterCount: number) {
    roster.forEach((p, i) => {
      if (this.byId.has(p.internalId)) return;
      const stats = BLANK(p);
      if (i < starterCount) stats.gs = 1;
      this.byId.set(p.internalId, stats);
      this.order.push(p.internalId);
    });
  }

  setMinutes(roster: Player[], minutes: number[]) {
    roster.forEach((p, i) => {
      const s = this.byId.get(p.internalId);
      if (s) {
        const totalSeconds = Math.max(0, Math.round((minutes[i] ?? 0) * 60));
        s.sec = totalSeconds;
        s.min = totalSeconds / 60;
      }
    });
  }

  applyPossession(
    end: PossessionEnd,
    offenseIds: string[],
    defenseIds: string[],
    teamScoreDelta: { off: number },
    context?: { period: number; clockSeconds: number },
  ) {
    if (end.kind === 'shot') {
      const s = this.byId.get(end.shooterId);
      if (s) {
        const countsAsFieldGoalAttempt = end.made || !end.fouled;
        if (countsAsFieldGoalAttempt) {
          s.fga += 1;
          if (end.zone === 'three') s.threePa += 1;
          if (end.zone === 'four') s.fourPa += 1;
          if (end.zone === 'rim')      s.fgaAtRim    = (s.fgaAtRim ?? 0) + 1;
          if (end.zone === 'lowPost')  s.fgaLowPost  = (s.fgaLowPost ?? 0) + 1;
          if (end.zone === 'midRange') s.fgaMidRange = (s.fgaMidRange ?? 0) + 1;
        }
        if (end.made) {
          s.fgm += 1;
          if (end.zone === 'three') s.threePm += 1;
          if (end.zone === 'four') s.fourPm += 1;
          if (end.zone === 'rim')      s.fgAtRim    = (s.fgAtRim ?? 0) + 1;
          if (end.zone === 'lowPost')  s.fgLowPost  = (s.fgLowPost ?? 0) + 1;
          if (end.zone === 'midRange') s.fgMidRange = (s.fgMidRange ?? 0) + 1;
          s.pts += Math.max(0, end.pts - end.ftMade);
          if (end.isDunk) s.dunks = (s.dunks ?? 0) + 1;
        }
        if (end.ftAttempts > 0) {
          s.fta += end.ftAttempts;
          s.ftm += end.ftMade;
          s.pts += end.ftMade;
        }
        if ((end.penaltyPoints ?? 0) > 0) s.pts += end.penaltyPoints ?? 0;
        if (end.blockerId) s.ba = (s.ba ?? 0) + 1;
      }
      if (end.assisterId) {
        const a = this.byId.get(end.assisterId);
        if (a) a.ast += 1;
      }
      if (end.blockerId) {
        const b = this.byId.get(end.blockerId);
        if (b) b.blk += 1;
      }
      if (end.fouled && end.foulerId) {
        const f = this.byId.get(end.foulerId);
        if (f) f.pf += 1;
      }
      // Plus/Minus
      const ptsScored = end.pts + (end.penaltyPoints ?? 0);
      if (ptsScored > 0) {
        offenseIds.forEach(id => { const x = this.byId.get(id); if (x) x.pm += ptsScored; });
        defenseIds.forEach(id => { const x = this.byId.get(id); if (x) x.pm -= ptsScored; });
        teamScoreDelta.off += ptsScored;
      }
    } else if (end.kind === 'turnover') {
      const t = this.byId.get(end.offenderId);
      if (t) t.tov += 1;
      if (end.stealerId) {
        const s = this.byId.get(end.stealerId);
        if (s) s.stl += 1;
      }
    } else if (end.kind === 'foul') {
      const f = this.byId.get(end.offenderId);
      if (f) f.pf += 1;
      const v = this.byId.get(end.victimId);
      if (v && end.ftAttempts > 0) {
        v.fta += end.ftAttempts;
        v.ftm += end.ftMade;
        v.pts += end.ftMade;
      }
      if (v && (end.penaltyPoints ?? 0) > 0) v.pts += end.penaltyPoints ?? 0;
      const foulPoints = end.ftMade + (end.penaltyPoints ?? 0);
      if (foulPoints > 0) {
        offenseIds.forEach(id => { const x = this.byId.get(id); if (x) x.pm += foulPoints; });
        defenseIds.forEach(id => { const x = this.byId.get(id); if (x) x.pm -= foulPoints; });
        teamScoreDelta.off += foulPoints;
      }
    } else if (end.kind === 'discipline') {
      const offender = this.byId.get(end.offenderId);
      const victim = this.byId.get(end.victimId);
      if (end.discipline === 'technical') {
        if (offender) offender.techs = (offender.techs ?? 0) + 1;
      } else {
        if (offender) offender.pf += 1;
        const target = end.discipline === 'flagrant_1' ? this.flagrant1ById : this.flagrant2ById;
        target.set(end.offenderId, (target.get(end.offenderId) ?? 0) + 1);
      }
      if (victim) {
        victim.fta += end.ftAttempts;
        victim.ftm += end.ftMade;
        victim.pts += end.ftMade;
        victim.pts += end.penaltyPoints ?? 0;
      }
      const disciplinePoints = end.ftMade + (end.penaltyPoints ?? 0);
      if (disciplinePoints > 0) {
        offenseIds.forEach(id => { const x = this.byId.get(id); if (x) x.pm += disciplinePoints; });
        defenseIds.forEach(id => { const x = this.byId.get(id); if (x) x.pm -= disciplinePoints; });
        teamScoreDelta.off += disciplinePoints;
      }

      const count = end.discipline === 'technical'
        ? offender?.techs ?? 0
        : end.discipline === 'flagrant_1'
          ? this.flagrant1ById.get(end.offenderId) ?? 0
          : this.flagrant2ById.get(end.offenderId) ?? 0;
      const limit = end.discipline === 'technical'
        ? this.rules.techEjectionLimit
        : end.discipline === 'flagrant_1'
          ? this.rules.flagrant1EjectionLimit
          : this.rules.flagrant2EjectionLimit;
      const ejected = count >= limit;
      if (ejected) this.disqualified.set(end.offenderId, end.discipline);
      this.disciplineEvents.push({
        playerId: end.offenderId,
        discipline: end.discipline,
        ejected,
        card: this.rules.useYellowRedCards ? (ejected ? 'red' : 'yellow') : undefined,
        period: context?.period ?? 1,
        clockSeconds: Math.max(0, context?.clockSeconds ?? 0),
      });
    }
  }

  applyRebound(rebounderId: string, kind: 'orb' | 'drb') {
    const r = this.byId.get(rebounderId);
    if (!r) return;
    r.reb += 1;
    if (kind === 'orb') r.orb += 1; else r.drb += 1;
  }

  toArray(rosterOrder: Player[]): PlayerGameStats[] {
    return rosterOrder.map(p => this.byId.get(p.internalId) ?? BLANK(p));
  }

  /** Current personal foul count for a player — used by RotationManager
   *  to decide foul-out / foul-trouble swaps mid-game. */
  getPf(playerId: string): number {
    return this.byId.get(playerId)?.pf ?? 0;
  }

  isDisqualified(playerId: string): boolean {
    return this.disqualified.has(playerId);
  }

  getDisqualification(playerId: string) {
    return this.disqualified.get(playerId);
  }

  getDisciplineEvents() {
    return [...this.disciplineEvents];
  }
}
