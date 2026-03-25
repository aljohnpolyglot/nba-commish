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
    let val = (rating as any)[key] ?? 50;
    if (key === 'hgt') return val as number;
    if (p.status === 'Euroleague') return (val as number) * 0.733;
    if (p.status === 'PBA')        return (val as number) * 0.62;
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

  static getProjectedStarters(team: Team, players: Player[], season: number = 2025, overridePlayers?: Player[]): Player[] {
    const teamPlayers = overridePlayers || players.filter(
      p => p.tid === team.id && p.status === 'Active' && (!p.injury || p.injury.gamesRemaining <= 0)
    );

    if (teamPlayers.length === 0) return [];

    const Rb = (p: Player, k: string) => this.getScaledRating(p, k, season);

    const SUPERSTAR_THRESHOLD = 85;
    const [stars, rolePlayers] = teamPlayers.reduce<[Player[], Player[]]>(
      ([s, r], p) =>
        convertTo2KRating(p.overallRating, p.hgt || 77) >= SUPERSTAR_THRESHOLD ? [[...s, p], r] : [s, [...r, p]],
      [[], []]
    );

    stars.sort((a, b) => convertTo2KRating(b.overallRating, b.hgt || 77) - convertTo2KRating(a.overallRating, a.hgt || 77));
    rolePlayers.sort((a, b) => convertTo2KRating(b.overallRating, b.hgt || 77) - convertTo2KRating(a.overallRating, a.hgt || 77));

    const lineup: Player[] = [...stars.slice(0, 5)];

    const SLOT_SPECS: SlotSpec[] = [
      { roles: ['RimAnchor'], fallbackSort: p => Rb(p, 'hgt') + Rb(p, 'reb') + Rb(p, 'blk') },
      { roles: ['StretchBig', 'RimAnchor'], fallbackSort: p => Rb(p, 'hgt') + Rb(p, 'ins') + Rb(p, 'tp') },
      { roles: ['Playmaker'], fallbackSort: p => Rb(p, 'pss') + Rb(p, 'oiq') + Rb(p, 'drb') },
      { roles: ['FloorSpacer', 'WingDefender'], fallbackSort: p => Rb(p, 'tp') + Rb(p, 'diq') + Rb(p, 'fg') },
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
        .sort((a, b) => convertTo2KRating(b.overallRating, b.hgt || 77) - convertTo2KRating(a.overallRating, a.hgt || 77));
      const candidate = benchPool.find(swapInFn);
      if (!candidate) return;
      const victim = [...lineup]
        .filter(p => convertTo2KRating(p.overallRating, p.hgt || 77) < SUPERSTAR_THRESHOLD && swapOutFn(p))
        .sort((a, b) => convertTo2KRating(a.overallRating, a.hgt || 77) - convertTo2KRating(b.overallRating, b.hgt || 77))[0];
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

    const bigCount = () => lineup.filter(p => Rb(p, 'hgt') >= 72).length;
    while (bigCount() > 2) {
      swapNonStar(p => Rb(p, 'hgt') >= 62, p => Rb(p, 'hgt') < 62 && !lineup.includes(p));
      if (teamPlayers.filter(p => !lineup.includes(p) && Rb(p, 'hgt') < 70).length === 0) break;
    }

    return lineup.slice(0, 5);
  }

  static getRotation(team: Team, players: Player[], lead: number = 0, season: number = 2025, overridePlayers?: Player[]): Player[] {
    const teamPlayers = overridePlayers || players.filter(
      p => p.tid === team.id && p.status === 'Active' && (!p.injury || p.injury.gamesRemaining <= 0)
    );
    if (teamPlayers.length === 0) return [];

    const finalStarters = this.getProjectedStarters(team, players, season, teamPlayers);
    const Rb = (p: Player, k: string) => this.getScaledRating(p, k, season);

    const benchPool = teamPlayers
      .filter(p => !finalStarters.includes(p))
      .sort((a, b) => convertTo2KRating(b.overallRating, b.hgt || 77) - convertTo2KRating(a.overallRating, a.hgt || 77));

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

    let rotationDepth = 9;
    if      (lead > 25) rotationDepth = 12;
    else if (lead > 15) rotationDepth = 11;
    else if (lead > 8)  rotationDepth = 10;

    return [
      ...finalStarters,
      ...benchLineup.slice(0, Math.min(rotationDepth - 5, benchLineup.length)),
    ];
  }
}
