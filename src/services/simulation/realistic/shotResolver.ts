import { OnCourt, PlayerComposite, ShotZone } from './types';

const ZONE_DISTRIBUTION: Record<ShotZone, number> = {
  rim: 0.30,
  midRange: 0.15,
  three: 0.50,
  lowPost: 0.05,
};

const ZONE_BASE_MAKE: Record<ShotZone, number> = {
  rim: 0.62,
  midRange: 0.42,
  three: 0.36,
  lowPost: 0.48,
};

const ZONE_PTS: Record<ShotZone, number> = {
  rim: 2,
  midRange: 2,
  three: 3,
  lowPost: 2,
};

export function pickShotZone(shooter: PlayerComposite): ShotZone {
  // Reweight base distribution by shooter strengths. Power-law on three so
  // a center with three=0.30 fires 3s far less often than a guard at 0.65 —
  // linear reweighting was letting bigs camp behind the line ~3PA/game.
  const w: Record<ShotZone, number> = {
    rim:      ZONE_DISTRIBUTION.rim      * (0.4 + 0.8 * shooter.rim + 0.4 * shooter.driving),
    midRange: ZONE_DISTRIBUTION.midRange * (0.4 + 0.9 * shooter.midRange),
    three:    ZONE_DISTRIBUTION.three    * Math.pow(shooter.three + 0.20, 1.4),
    lowPost:  ZONE_DISTRIBUTION.lowPost  * Math.pow(shooter.lowPost + 0.15, 1.3),
  };
  const total = w.rim + w.midRange + w.three + w.lowPost;
  let roll = Math.random() * total;
  if ((roll -= w.rim)      < 0) return 'rim';
  if ((roll -= w.midRange) < 0) return 'midRange';
  if ((roll -= w.three)    < 0) return 'three';
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
}

export function resolveShot(
  zone: ShotZone,
  shooter: PlayerComposite,
  defense: OnCourt,
): ShotResolution {
  const shooterSkill =
    zone === 'rim'      ? shooter.rim
    : zone === 'midRange' ? shooter.midRange
    : zone === 'three'    ? shooter.three
    : shooter.lowPost;

  // Pick a primary defender — interior shots get a rim/post defender; perimeter gets a perimeter defender.
  const defender = pickDefender(defense, zone);
  const defenseSkill =
    zone === 'rim' || zone === 'lowPost' ? defender.defRim : defender.defPerimeter;

  // Block check (interior shots more likely; perimeter contests rarely turn into blocks).
  // Power-law on defender.block so elite shot-blockers (Wembanyama 4.0 BPG,
  // Holmgren 2.8) actually dominate their tier — linear scaling only gave them
  // ~1.7x the average defender's block rate, far short of their real ~4x edge.
  const blockChance = (zone === 'rim' ? 0.082 : zone === 'lowPost' ? 0.052 : 0.024)
    * (0.4 + 1.8 * Math.pow(defender.block, 1.7));
  if (Math.random() < blockChance) {
    return { made: false, pts: 0, blockerId: defender.id, fouled: false, ftAttempts: 0, ftMade: 0 };
  }

  // Foul check (more likely on rim/post). Calibrated against NBA 2025-26
  // shooting-foul rate: ~10 shooting fouls / team-game on ~80 shots → ~12.5%
  // overall, weighted toward interior contact.
  const foulBase = zone === 'rim' ? 0.22 : zone === 'lowPost' ? 0.18 : zone === 'midRange' ? 0.07 : 0.04;
  const foulChance = foulBase * (0.6 + 0.9 * shooter.drawingFouls);
  const fouled = Math.random() < foulChance;

  // Make probability
  const skillDelta = shooterSkill - defenseSkill;       // -1..+1 typically -0.4..+0.4
  let pMake = ZONE_BASE_MAKE[zone] + skillDelta * 0.18;
  pMake = Math.max(0.05, Math.min(0.85, pMake));
  const made = Math.random() < pMake;

  const baseShotPts = ZONE_PTS[zone];

  if (fouled) {
    if (made) {
      // And-1: 1 FT
      return {
        made: true,
        pts: baseShotPts,
        fouled: true,
        foulerId: defender.id,
        ftAttempts: 1,
        ftMade: rollFt(shooter, 1),
      };
    }
    // Shooting foul — FTs equal to shot points
    const fta = baseShotPts;
    return {
      made: false,
      pts: 0,
      fouled: true,
      foulerId: defender.id,
      ftAttempts: fta,
      ftMade: rollFt(shooter, fta),
    };
  }

  return {
    made,
    pts: made ? baseShotPts : 0,
    fouled: false,
    ftAttempts: 0,
    ftMade: 0,
  };
}

function pickDefender(defense: OnCourt, zone: ShotZone): PlayerComposite {
  // Bias defender pick: interior shots → biggest defRim; perimeter → biggest defPerimeter.
  const interior = zone === 'rim' || zone === 'lowPost';
  const sorted = [...defense.composites].sort((a, b) =>
    interior ? b.defRim - a.defRim : b.defPerimeter - a.defPerimeter,
  );
  // 70% chance assigned defender, 30% mismatch
  return Math.random() < 0.7 ? sorted[0] : sorted[1 + Math.floor(Math.random() * 4)];
}

function rollFt(shooter: PlayerComposite, attempts: number): number {
  let made = 0;
  const p = 0.55 + 0.35 * shooter.ft; // 0.55..0.90
  for (let i = 0; i < attempts; i++) if (Math.random() < p) made++;
  return made;
}
