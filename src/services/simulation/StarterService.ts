import { NBAPlayer as Player, NBATeam as Team } from '../../types';
import { Role } from '../../constants/playerRoles';
import { convertTo2KRating } from '../../utils/helpers';

export interface SlotSpec {
  roles: Role[];
  fallbackSort: (p: Player) => number;
}

export class StarterService {
  private static getScaledRating(p: Player, key: string, season: number): number {
    if (!p.ratings || !p.ratings.length) return 50;
    const rating = p.ratings.find(r => r.season === season) || p.ratings[p.ratings.length - 1];
    if (!rating) return 50;
    const val = (rating as any)[key] ?? 50;
    // hgt is physical — never scaled. All other attributes are pre-scaled at fetch.
    return val as number;
  }

  static classifyRole(p: Player, season: number = 2025): Role {
    const Rb = (k: string) => this.getScaledRating(p, k, season);
    const hgt = Rb('hgt'), reb = Rb('reb'), blk = Rb('blk');
    const tp  = Rb('tp'),  ins = Rb('ins'), diq = Rb('diq');
    const spd = Rb('spd'), dnk = Rb('dnk');
    const pss = Rb('pss'), oiq = Rb('oiq');

    if (hgt >= 55 && reb >= 65 && blk >= 55) return 'RimAnchor';
    if (hgt >= 55 && tp  >= 55 && ins <= 50) return 'StretchBig';
    if (pss >= 52 && oiq >= 55)              return 'Playmaker';
    if (diq >= 50 && hgt >= 45 && spd >= 50) return 'WingDefender';
    if (tp  >= 55 && oiq >= 50)              return 'FloorSpacer';
    if (dnk >= 65 && spd >= 55 && tp  <= 50) return 'Slasher';
    return 'Combo';
  }

  static getProjectedStarters(team: Team, players: Player[], season: number = 2025, overridePlayers?: Player[], modern: boolean = true): Player[] {
    const teamPlayers = overridePlayers || players.filter(
      p => p.tid === team.id && p.status === 'Active' && (!p.injury || p.injury.gamesRemaining <= 0)
    );

    if (teamPlayers.length === 0) return [];

    const Rb = (p: Player, k: string) => this.getScaledRating(p, k, season);
    const getK2 = (p: Player) => convertTo2KRating(p.overallRating, this.getScaledRating(p, 'hgt', season), this.getScaledRating(p, 'tp', season));

    // Sort ALL players by K2 OVR descending — top 5 are always starters regardless of role
    const sortedByOvr = [...teamPlayers].sort((a, b) => getK2(b) - getK2(a));

    // Take top 5 by OVR — this guarantees the best players start (no Tatum on bench)
    const lineup: Player[] = sortedByOvr.slice(0, 5);

    // If fewer than 5 available, return what we have
    if (lineup.length <= 5 && teamPlayers.length <= 5) return lineup;

    // Role classification is still used for positional assignment downstream,
    // but NEVER for starter selection. The old role-first slot filling was the bug.
    const SLOT_SPECS: SlotSpec[] = modern
      ? [
          // Modern 5-out: PG + SG + 3 wings/bigs who can shoot
          { roles: ['Playmaker'],                        fallbackSort: p => Rb(p, 'pss') + Rb(p, 'oiq') + Rb(p, 'drb') },
          { roles: ['FloorSpacer', 'WingDefender'],      fallbackSort: p => Rb(p, 'tp')  + Rb(p, 'diq') + Rb(p, 'fg')  },
          { roles: ['WingDefender', 'Slasher'],          fallbackSort: p => Rb(p, 'spd') + Rb(p, 'dnk') + Rb(p, 'diq') },
          { roles: ['StretchBig', 'RimAnchor'],          fallbackSort: p => Rb(p, 'hgt') + Rb(p, 'ins') + Rb(p, 'tp')  },
          { roles: ['Combo', 'FloorSpacer'],             fallbackSort: p => Rb(p, 'fg')  + Rb(p, 'tp')  + Rb(p, 'oiq') },
        ]
      : [
          // Traditional: RimAnchor first, twin towers fine
          { roles: ['RimAnchor'],                        fallbackSort: p => Rb(p, 'hgt') + Rb(p, 'reb') + Rb(p, 'blk') },
          { roles: ['StretchBig', 'RimAnchor'],          fallbackSort: p => Rb(p, 'hgt') + Rb(p, 'ins') + Rb(p, 'tp')  },
          { roles: ['Playmaker'],                        fallbackSort: p => Rb(p, 'pss') + Rb(p, 'oiq') + Rb(p, 'drb') },
          { roles: ['FloorSpacer', 'WingDefender'],      fallbackSort: p => Rb(p, 'tp')  + Rb(p, 'diq') + Rb(p, 'fg')  },
          { roles: ['WingDefender', 'Slasher', 'Combo'], fallbackSort: p => Rb(p, 'spd') + Rb(p, 'dnk') + Rb(p, 'diq') },
        ];

    // Positional sanity check: ensure at least one big (hgt >= 62) is in the lineup.
    // If top 5 by OVR are all guards/wings, swap the weakest for the best available big.
    if (!lineup.some(p => Rb(p, 'hgt') >= 62)) {
      const bestBig = sortedByOvr.find(p => !lineup.includes(p) && Rb(p, 'hgt') >= 62);
      if (bestBig) {
        // Swap out the lowest-OVR starter for the big
        const worstStarter = [...lineup].sort((a, b) => getK2(a) - getK2(b))[0];
        if (worstStarter) lineup.splice(lineup.indexOf(worstStarter), 1, bestBig);
      }
    }
    // IMPORTANT: return in OVR order, NOT slot order.
    // MinutesPlayedService.allocateMinutes assumes rotation[0] is the star and
    // assigns it the star-MPG target (~36 min), with slots 1-4 stepping down.
    // If we position-sort here, a role-player PG at slot 0 would swallow the
    // star minutes while the actual star (e.g., a C) gets demoted to slot 4's
    // step-down minutes. Display-layer sorting (GameplanTab/IdealRotationTab
    // call sortByPositionSlot at render time) keeps the UI showing PG→SG→...→C
    // while the minutes math stays anchored to OVR.
    return lineup.slice(0, 5);
  }

  /**
   * Reorder 5 players into PG→SG→SF→PF→C slot order.
   *
   * Strategy:
   *   1. If every player has a specific pos (PG/SG/SF/PF/C), greedy-assign to
   *      slots by a slot-preference score; ties broken by hgt rating.
   *   2. If positions are ambiguous ('G'/'F'/'GF'/'FC'/empty) or only a subset
   *      have specific tags, fall back to: highest pss rating = PG, then the
   *      remaining four sorted by hgt rating ASCENDING (shortest = SG, tallest
   *      = C). Critical: uses the hgt RATING (0-100 attribute), not the bio
   *      inches — external-league players often have a good hgt attribute but
   *      no proper pos tag from the scrape.
   */
  static sortByPositionSlot(players: Player[], season: number = 2025): Player[] {
    if (players.length === 0) return players;

    const SLOT_MAP: Record<string, number> = {
      PG: 0, G: 0.5, SG: 1, GF: 1.5, SF: 2, F: 2.5, PF: 3, FC: 3.5, C: 4,
    };
    const SPECIFIC = new Set(['PG', 'SG', 'SF', 'PF', 'C']);

    const hgt = (p: Player) => this.getScaledRating(p, 'hgt', season);
    const pss = (p: Player) => this.getScaledRating(p, 'pss', season);

    const allSpecific = players.every(p => SPECIFIC.has(p.pos ?? ''));
    if (allSpecific) {
      return [...players].sort((a, b) => {
        const sa = SLOT_MAP[a.pos ?? 'F'] ?? 2.5;
        const sb = SLOT_MAP[b.pos ?? 'F'] ?? 2.5;
        if (sa !== sb) return sa - sb;
        return hgt(a) - hgt(b); // shorter slots first within the same pos tie
      });
    }

    // Fallback — roster scrape didn't give clean positions (or some players
    // are generic 'G'/'F'/'C'). Pick PG with a tiered preference so guard-tagged
    // players always beat forward-tagged ones (prior bug: Tatum 'SF' stole PG
    // from Pritchard 'G' because of marginal pss edge).
    const sorted = [...players];
    const posOf = (p: Player) => (p.pos ?? '').toUpperCase();
    const isFrontcourt = (p: Player) => {
      const pos = posOf(p);
      return pos.includes('F') || pos.includes('C');
    };
    // Strict tag-priority: PG first, then G, then SG. Only if none of those
    // exist do we fall back to height/passing heuristics. Prior bug: Tatum
    // ('SF') stole PG from Pritchard ('G') via marginal pss edge.
    const pickByTag = (tag: string) => sorted.filter(p => posOf(p) === tag);
    let pgPool = pickByTag('PG');
    if (pgPool.length === 0) pgPool = pickByTag('G');
    if (pgPool.length === 0) pgPool = pickByTag('SG');
    if (pgPool.length === 0) {
      pgPool = sorted.filter(p => hgt(p) <= 60 && !isFrontcourt(p));
    }
    if (pgPool.length === 0) {
      pgPool = [...sorted].sort((a, b) => hgt(a) - hgt(b)).slice(0, 1);
    }
    let pg = pgPool[0];
    for (const p of pgPool) {
      if (pss(p) > pss(pg)) pg = p;
    }
    const rest = sorted.filter(p => p !== pg).sort((a, b) => hgt(a) - hgt(b));
    return [pg, ...rest];
  }

  static getRotation(team: Team, players: Player[], lead: number = 0, season: number = 2025, overridePlayers?: Player[], modern: boolean = true, depthOverride?: number): Player[] {
    const teamPlayers = overridePlayers || players.filter(
      p => p.tid === team.id && p.status === 'Active' && (!p.injury || p.injury.gamesRemaining <= 0)
    );
    if (teamPlayers.length === 0) return [];

    const finalStarters = this.getProjectedStarters(team, players, season, teamPlayers, modern);
    const Rb = (p: Player, k: string) => this.getScaledRating(p, k, season);

    const benchPool = teamPlayers
      .filter(p => !finalStarters.includes(p))
      .sort((a, b) => convertTo2KRating(b.overallRating, this.getScaledRating(b, 'hgt', season), this.getScaledRating(b, 'tp', season)) - convertTo2KRating(a.overallRating, this.getScaledRating(a, 'hgt', season), this.getScaledRating(a, 'tp', season)));

    const benchLineup: Player[] = [];
    const notInBench = () => benchPool.filter(p => !benchLineup.includes(p));

    benchLineup.push(...notInBench().slice(0, 2));

    const starterHasAnchor = finalStarters.some(p => this.classifyRole(p, season) === 'RimAnchor');
    const starterBigIsStretch = finalStarters
      .filter(p => Rb(p, 'hgt') >= 60)
      .every(p => this.classifyRole(p, season) === 'StretchBig');

    if (!starterHasAnchor || starterBigIsStretch) {
      const backupBig = notInBench().find(p => Rb(p, 'hgt') >= 72);
      if (backupBig) benchLineup.push(backupBig);
    }

    const backupPG = notInBench().find(p => Rb(p, 'pss') >= 60);
    if (backupPG) benchLineup.push(backupPG);

    benchLineup.push(...notInBench());

    // Caller-supplied depth (e.g. MinutesPlayedService passing the full depth after
    // rotationDepthOverride=12 for All-Star) takes priority over the legacy blowout
    // scale. Without this, an ASG with 12 roster spots collapses to a 10-man rotation
    // because rotationDepth is hardcoded to 10 before the blowout adjustments kick in.
    let rotationDepth = 10;
    if      (lead > 25) rotationDepth = 13;
    else if (lead > 15) rotationDepth = 12;
    else if (lead > 8)  rotationDepth = 11;
    if (depthOverride !== undefined && depthOverride > 0) rotationDepth = depthOverride;

    return [
      ...finalStarters,
      ...benchLineup.slice(0, Math.min(rotationDepth - 5, benchLineup.length)),
    ];
  }
}
