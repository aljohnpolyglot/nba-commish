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

    const SUPERSTAR_THRESHOLD = 87; // 2K 87+ = franchise cornerstone; hgt now passes BBGM attribute so no bio-inches inflation
    const [stars, rolePlayers] = teamPlayers.reduce<[Player[], Player[]]>(
      ([s, r], p) =>
        convertTo2KRating(p.overallRating, this.getScaledRating(p, 'hgt', season), this.getScaledRating(p, 'tp', season)) >= SUPERSTAR_THRESHOLD ? [[...s, p], r] : [s, [...r, p]],
      [[], []]
    );

    stars.sort((a, b) => convertTo2KRating(b.overallRating, this.getScaledRating(b, 'hgt', season), this.getScaledRating(b, 'tp', season)) - convertTo2KRating(a.overallRating, this.getScaledRating(a, 'hgt', season), this.getScaledRating(a, 'tp', season)));
    rolePlayers.sort((a, b) => convertTo2KRating(b.overallRating, this.getScaledRating(b, 'hgt', season), this.getScaledRating(b, 'tp', season)) - convertTo2KRating(a.overallRating, this.getScaledRating(a, 'hgt', season), this.getScaledRating(a, 'tp', season)));

    const lineup: Player[] = [...stars.slice(0, 5)];

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

    const notYetInLineup = () => rolePlayers.filter(p => !lineup.includes(p));
    const coveredRoles = new Set<Role>(lineup.map(p => this.classifyRole(p, season)));

    for (const spec of SLOT_SPECS) {
      if (lineup.length >= 5) break;
      const pool = notYetInLineup();
      if (pool.length === 0) break;

      const uncoveredRoles = spec.roles.filter(r => !coveredRoles.has(r));
      let pick: Player | undefined;

      if (uncoveredRoles.length > 0) {
        for (const role of uncoveredRoles) {
          pick = pool.find(p => this.classifyRole(p, season) === role);
          if (pick) break;
        }
      }

      if (!pick) {
        [pick] = [...pool].sort((a, b) => spec.fallbackSort(b) - spec.fallbackSort(a));
      }

      if (pick) {
        lineup.push(pick);
        coveredRoles.add(this.classifyRole(pick, season));
      }
    }

    while (lineup.length < 5) {
      const extra = rolePlayers.find(p => !lineup.includes(p));
      if (!extra) break;
      lineup.push(extra);
    }

    const swapNonStar = (
      swapOutFn: (p: Player) => boolean,
      swapInFn:  (p: Player) => boolean
    ): void => {
      const benchPool = teamPlayers
        .filter(p => !lineup.includes(p))
        .sort((a, b) => convertTo2KRating(b.overallRating, this.getScaledRating(b, 'hgt', season), this.getScaledRating(b, 'tp', season)) - convertTo2KRating(a.overallRating, this.getScaledRating(a, 'hgt', season), this.getScaledRating(a, 'tp', season)));
      const candidate = benchPool.find(swapInFn);
      if (!candidate) return;
      const victim = [...lineup]
        .filter(p => convertTo2KRating(p.overallRating, this.getScaledRating(p, 'hgt', season), this.getScaledRating(p, 'tp', season)) < SUPERSTAR_THRESHOLD && swapOutFn(p))
        .sort((a, b) => convertTo2KRating(a.overallRating, this.getScaledRating(a, 'hgt', season), this.getScaledRating(a, 'tp', season)) - convertTo2KRating(b.overallRating, this.getScaledRating(b, 'hgt', season), this.getScaledRating(b, 'tp', season)))[0];
      if (!victim) return;
      lineup.splice(lineup.indexOf(victim), 1, candidate);
    };

    if (!lineup.some(p => Rb(p, 'hgt') >= 75)) {
      swapNonStar(p => Rb(p, 'hgt') < 62 && Rb(p, 'tp') < 50, p => Rb(p, 'hgt') >= 62);
    }
    if (lineup.filter(p => Rb(p, 'tp') >= 55).length < 2) {
      swapNonStar(p => Rb(p, 'tp') <= 35, p => Rb(p, 'tp') >= 55 && !lineup.includes(p));
    }
    if (!lineup.some(p => Rb(p, 'pss') + Rb(p, 'oiq') >= 130)) {
      swapNonStar(p => Rb(p, 'pss') < 50, p => Rb(p, 'pss') + Rb(p, 'oiq') >= 130 && !lineup.includes(p));
    }
    if (lineup.filter(p => Rb(p, 'tp') <= 35).length > 2) {
      swapNonStar(p => Rb(p, 'tp') <= 35, p => Rb(p, 'tp') >= 50 && !lineup.includes(p));
    }

    const MAX_BIGS = modern ? 1 : 2;
    const BIG_THRESHOLD = modern ? 60 : 72; // catches JV(hgt=69) in modern
    const bigCount = () => lineup.filter(p => Rb(p, 'hgt') >= BIG_THRESHOLD).length;
    while (bigCount() > MAX_BIGS) {
      const before = bigCount();
      swapNonStar(p => Rb(p, 'hgt') >= BIG_THRESHOLD, p => Rb(p, 'hgt') < BIG_THRESHOLD && !lineup.includes(p));
      if (bigCount() >= before) break; // no progress — remaining bigs are all superstars, can't evict
      if (teamPlayers.filter(p => !lineup.includes(p) && Rb(p, 'hgt') < BIG_THRESHOLD).length === 0) break;
    }

    return lineup.slice(0, 5);
  }

  static getRotation(team: Team, players: Player[], lead: number = 0, season: number = 2025, overridePlayers?: Player[], modern: boolean = true): Player[] {
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

    let rotationDepth = 10;
    if      (lead > 25) rotationDepth = 13;
    else if (lead > 15) rotationDepth = 12;
    else if (lead > 8)  rotationDepth = 11;

    return [
      ...finalStarters,
      ...benchLineup.slice(0, Math.min(rotationDepth - 5, benchLineup.length)),
    ];
  }
}
