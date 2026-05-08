import { NBAPlayer as Player } from '../../../types';
import { PlayerGameStats } from '../types';
import { PossessionEnd } from './types';

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
      if (s) s.min = Math.round(minutes[i] ?? 0);
    });
  }

  applyPossession(end: PossessionEnd, offenseIds: string[], defenseIds: string[], teamScoreDelta: { off: number }) {
    if (end.kind === 'shot') {
      const s = this.byId.get(end.shooterId);
      if (s) {
        s.fga += 1;
        if (end.zone === 'three') s.threePa += 1;
        if (end.zone === 'rim')      s.fgaAtRim    = (s.fgaAtRim ?? 0) + 1;
        if (end.zone === 'lowPost')  s.fgaLowPost  = (s.fgaLowPost ?? 0) + 1;
        if (end.zone === 'midRange') s.fgaMidRange = (s.fgaMidRange ?? 0) + 1;
        if (end.made) {
          s.fgm += 1;
          if (end.zone === 'three') s.threePm += 1;
          if (end.zone === 'rim')      s.fgAtRim    = (s.fgAtRim ?? 0) + 1;
          if (end.zone === 'lowPost')  s.fgLowPost  = (s.fgLowPost ?? 0) + 1;
          if (end.zone === 'midRange') s.fgMidRange = (s.fgMidRange ?? 0) + 1;
          s.pts += end.zone === 'three' ? 3 : 2;
        }
        if (end.ftAttempts > 0) {
          s.fta += end.ftAttempts;
          s.ftm += end.ftMade;
          s.pts += end.ftMade;
        }
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
      const ptsScored = (end.made ? (end.zone === 'three' ? 3 : 2) : 0) + end.ftMade;
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
      if (end.ftMade > 0) {
        offenseIds.forEach(id => { const x = this.byId.get(id); if (x) x.pm += end.ftMade; });
        defenseIds.forEach(id => { const x = this.byId.get(id); if (x) x.pm -= end.ftMade; });
        teamScoreDelta.off += end.ftMade;
      }
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
}
