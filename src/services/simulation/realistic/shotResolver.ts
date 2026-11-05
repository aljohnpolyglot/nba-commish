import { OnCourt, PlayerComposite, ShotRules, ShotZone } from './types';

const ZONE_DISTRIBUTION: Record<ShotZone, number> = {
  rim: 0.30,
  midRange: 0.13,
  three: 0.52,
  four: 0.00,
  lowPost: 0.05,
};

const ZONE_BASE_MAKE: Record<ShotZone, number> = {
  rim: 0.62,
  midRange: 0.42,
  three: 0.36,
  four: 0.22,
  lowPost: 0.48,
};

const ZONE_PTS: Record<ShotZone, number> = {
  rim: 2,
  midRange: 2,
  three: 3,
  four: 4,
  lowPost: 2,
};

export function pickShotZone(shooter: PlayerComposite, rules?: ShotRules, offense?: OnCourt): ShotZone {
  // Reweight base distribution by shooter strengths. Power-law on three so
  // a center with three=0.30 fires 3s far less often than a guard at 0.65 —
  // linear reweighting was letting bigs camp behind the line ~3PA/game.
  const threeOn = rules?.threePointAvailable ?? true;
  const fourOn = !!rules?.fourPointAvailable;
  const threeTendency = shooter.threeVolume ?? shooter.three;
  const lowShooterLift = Math.max(0, Math.min(0.20, (threeTendency - 0.30) * 1.34));
  const threeCurve = Math.pow(threeTendency + lowShooterLift, 1.4);
  const w: Record<ShotZone, number> = {
    rim:      ZONE_DISTRIBUTION.rim      * (0.4 + 0.8 * shooter.rim + 0.4 * shooter.driving) * (offense?.gameplayModifiers?.rimRateMult ?? 1),
    midRange: ZONE_DISTRIBUTION.midRange * (0.4 + 0.9 * shooter.midRange) * (offense?.gameplayModifiers?.midRangeRateMult ?? 1),
    three:    threeOn ? ZONE_DISTRIBUTION.three * threeCurve * (offense?.gameplayModifiers?.threePointRateMult ?? 1) : 0,
    four:     fourOn ? 0.095 * Math.pow(threeTendency + lowShooterLift * 0.9, 1.5) * (rules?.fourPointRateMult ?? 1) : 0,
    lowPost:  ZONE_DISTRIBUTION.lowPost  * Math.pow(shooter.lowPost + 0.15, 1.3) * (offense?.gameplayModifiers?.lowPostRateMult ?? 1),
  };
  const total = w.rim + w.midRange + w.three + w.four + w.lowPost;
  let roll = Math.random() * total;
  if ((roll -= w.rim)      < 0) return 'rim';
  if ((roll -= w.midRange) < 0) return 'midRange';
  if ((roll -= w.three)    < 0) return 'three';
  if ((roll -= w.four)     < 0) return 'four';
  return 'lowPost';
}

interface ShotResolution {
  made: boolean;
  pts: number;
  blockerId?: string;
  fouled: boolean;
  foulerId?: string;
  ftAttempts: number;
  ftMade: number;
  isDunk?: boolean;
}

export function resolveShot(
  zone: ShotZone,
  shooter: PlayerComposite,
  offense: OnCourt,
  defense: OnCourt,
  rules?: ShotRules,
): ShotResolution {
  const shooterSkill =
    zone === 'rim'      ? shooter.rim
    : zone === 'midRange' ? shooter.midRange
    : zone === 'three' || zone === 'four' ? shooter.three
    : shooter.lowPost;

  // Pick a primary defender — interior shots get a rim/post defender; perimeter gets a perimeter defender.
  const defender = pickDefender(defense, zone);
  const defenseSkill =
    zone === 'rim' || zone === 'lowPost' ? defender.defRim : defender.defPerimeter;

  // Block check (interior shots more likely; perimeter contests rarely turn into blocks).
  // Power-law on defender.block so elite shot-blockers (Wembanyama 4.0 BPG,
  // Holmgren 2.8) actually dominate their tier — linear scaling only gave them
  // ~1.7x the average defender's block rate, far short of their real ~4x edge.
  const blockChance = (zone === 'rim' ? 0.090 : zone === 'lowPost' ? 0.058 : zone === 'four' ? 0.014 : 0.022)
    * (0.34 + 2.20 * Math.pow(defender.block, 1.8))
    * (defense.gameplayModifiers?.blockRateMult ?? 1);
  if (Math.random() < blockChance) {
    return { made: false, pts: 0, blockerId: defender.id, fouled: false, ftAttempts: 0, ftMade: 0 };
  }

  // Foul check (more likely on rim/post). Calibrated against NBA 2025-26
  // shooting-foul rate: ~10 shooting fouls / team-game on ~80 shots → ~12.5%
  // overall, weighted toward interior contact.
  const foulBase = zone === 'rim' ? 0.20 : zone === 'lowPost' ? 0.16 : zone === 'midRange' ? 0.065 : zone === 'four' ? 0.020 : 0.035;
  const foulChance = foulBase
    * (0.55 + 0.75 * shooter.drawingFouls)
    * (1.08 - 0.28 * defenseSkill)
    * (offense.gameplayModifiers?.ftRateMult ?? 1);
  const fouled = Math.random() < foulChance;

  // Make probability
  const skillDelta = shooterSkill - defenseSkill;       // -1..+1 typically -0.4..+0.4
  let pMake = ZONE_BASE_MAKE[zone] + skillDelta * (zone === 'four' ? 0.14 : 0.18);
  pMake *= offense.gameplayModifiers?.shotEfficiencyMult ?? 1;
  if (zone === 'three') pMake *= rules?.threePointEfficiencyMult ?? 1;
  if (zone === 'four') pMake *= rules?.fourPointEfficiencyMult ?? 1;
  if (zone !== 'three' && zone !== 'four') pMake *= rules?.twoPointEfficiencyMult ?? 1;
  if (zone === 'rim' || zone === 'lowPost') {
    pMake *= offense.gameplayModifiers?.interiorEffMult ?? 1;
  }
  pMake = Math.max(0.05, Math.min(0.85, pMake));
  const made = Math.random() < pMake;

  const baseShotPts = zone === 'three' || zone === 'four'
    ? ZONE_PTS[zone]
    : (rules?.fieldGoalValue ?? 2);
  const isDunk = zone === 'rim'
    && made
    && Math.random() < Math.max(0.08, Math.min(0.78, 0.06 + shooter.rim * 0.30 + shooter.driving * 0.26));
  const shotPts = isDunk ? (rules?.dunkValue ?? 2) : baseShotPts;

  if (fouled && (rules?.freeThrowsEnabled ?? true)) {
    if (made) {
      // And-1: 1 FT
      return {
        made: true,
        pts: shotPts,
        fouled: true,
        foulerId: pickFouler(defense, zone, defender).id,
        ftAttempts: 1,
        ftMade: rollFt(shooter, 1, rules?.ftEfficiencyMult),
        isDunk,
      };
    }
    // Shooting foul — FTs equal to shot points
    const fta = baseShotPts;
    return {
      made: false,
      pts: 0,
      fouled: true,
      foulerId: pickFouler(defense, zone, defender).id,
      ftAttempts: fta,
      ftMade: rollFt(shooter, fta, rules?.ftEfficiencyMult),
    };
  }

  return {
    made,
    pts: made ? shotPts : 0,
    fouled: false,
    ftAttempts: 0,
    ftMade: 0,
    isDunk,
  };
}

function pickFouler(defense: OnCourt, zone: ShotZone, primary: PlayerComposite): PlayerComposite {
  const interior = zone === 'rim' || zone === 'lowPost';
  const weights = defense.composites.map(c => {
    const skill = interior ? c.defRim : c.defPerimeter;
    const activity = c.id === primary.id ? 1.10 : 0.75 + skill * 0.5;
    const discipline = Math.max(0.35, Math.min(1.35, 1.50 - skill * 1.25));
    return activity * discipline;
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return primary;
  let roll = Math.random() * total;
  for (let i = 0; i < defense.composites.length; i++) {
    roll -= weights[i];
    if (roll < 0) return defense.composites[i];
  }
  return primary;
}

function pickDefender(defense: OnCourt, zone: ShotZone): PlayerComposite {
  // Bias defender pick: interior shots → biggest defRim; perimeter → biggest defPerimeter.
  const interior = zone === 'rim' || zone === 'lowPost';
  const sorted = [...defense.composites].sort((a, b) =>
    interior ? b.defRim - a.defRim : b.defPerimeter - a.defPerimeter,
  );
  // 82% top defender / 13% #2 / 5% rest. Stronger primary lock so secondary rim
  // protectors (Holmgren, Clingan) actually accrue blocks instead of getting
  // diluted across a uniform [#2..#5] mismatch pool.
  const roll = Math.random();
  if (roll < 0.79) return sorted[0];
  if (roll < 0.93) return sorted[1] ?? sorted[0];
  const secondary = sorted.slice(2);
  return secondary[Math.floor(Math.random() * secondary.length)] ?? sorted[1] ?? sorted[0];
}

function rollFt(shooter: PlayerComposite, attempts: number, efficiencyMult: number = 1): number {
  let made = 0;
  const p = Math.max(0.20, Math.min(0.98, (0.57 + 0.35 * shooter.ft) * efficiencyMult));
  for (let i = 0; i < attempts; i++) if (Math.random() < p) made++;
  return made;
}
