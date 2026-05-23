import { NBAPlayer as Player } from '../../../types';
import { activeClubDebuffs } from './helpers';
export interface NightProfile {
  ptsTargetMult: number;   // Scoring volume (rollS)
  efficiencyMult: number;  // Shooting % (rollS)
  fgaMult: number;         // Volume modifier — 1.0 = baseline shots, >1 chucker archetype, <1 deferring archetype. FGA anchors on BASELINE pts (pre-night-mult) so cold nights keep normal shot diet.
  shotDietShift: number;   // 3PA tendency (rollS)
  assistMult: number;      // Passing vision (rollV) — high = more assists
  ballControlMult: number; // TOV safety (rollV) — high = fewer TOs (SAME roll as assistMult, inversely applied)
  orbMult: number;         // Offensive glass aggression (rollH) — split from reboundMult
  drbMult: number;         // Defensive glass aggression (rollH) — split from reboundMult
  stlMult: number;         // STL activity (rollH) — split from defensiveEnergy
  blkMult: number;         // BLK activity (rollH) — split from defensiveEnergy
  ftAggression: number; // How aggressively the player attacks the line this night (1.0 = normal)
  ftSkill: number;      // FT shooting luck modifier this night (1.0 = normal)
}
function calcStreakiness(rating: any): number {
  const fg   = rating.fg   ?? 50;
  const tp   = rating.tp   ?? 50;
  const oiq  = rating.oiq  ?? 50;
  const endu = rating.endu ?? 50;
  const dnk  = rating.dnk  ?? 50;
  const ins  = rating.ins  ?? 50;
  const hgt  = rating.hgt  ?? 50;
  const isRimOnly = tp < 20 && fg < 45 && dnk > 65 && hgt > 65;
  const effectiveFg = isRimOnly
    ? (dnk * 0.55 + ins * 0.30 + fg * 0.15)
    : fg;
  return (100 - effectiveFg) * 0.45
       + tp                  * 0.30
       + (100 - oiq)         * 0.15
       + (100 - endu)        * 0.10;
}
function approxNormal(): number {
  return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
}
function applyClubDebuff(profile: NightProfile, severity: 'heavy' | 'moderate' | 'mild'): void {
  if (severity === 'heavy') {
    profile.ptsTargetMult  *= 0.78;
    profile.efficiencyMult *= 0.82;
    profile.ballControlMult *= 0.72;  // more TOs — foggy decision-making
    profile.assistMult     *= 0.82;
    profile.stlMult        *= 0.80;
    profile.blkMult        *= 0.80;
  } else if (severity === 'moderate') {
    profile.ptsTargetMult  *= 0.88;
    profile.efficiencyMult *= 0.90;
    profile.ballControlMult *= 0.85;
    profile.assistMult     *= 0.90;
    profile.stlMult        *= 0.90;
    profile.blkMult        *= 0.90;
  } else {
    profile.ptsTargetMult  *= 0.94;
    profile.efficiencyMult *= 0.96;
    profile.ballControlMult *= 0.93;
  }
}
function computeNightProfile(
  p: Player,
  season: number,
  lead: number = 0,
  isWinner: boolean = true,
  offShare: number = 0.1,
  oppDefProfile?: { overallDef: number; steal: number; passPerception: number }
): NightProfile {
  const rating = p.ratings?.find(r => r.season === season)
              ?? p.ratings?.[p.ratings.length - 1];
  if (!rating) return {
    ptsTargetMult: 1.0, efficiencyMult: 1.0, fgaMult: 1.0, shotDietShift: 0,
    assistMult: 1.0, ballControlMult: 1.0, orbMult: 1.0, drbMult: 1.0, stlMult: 1.0, blkMult: 1.0,
    ftAggression: 1.0, ftSkill: 1.0,
  };
  const streakiness = calcStreakiness(rating);
  const ovr = p.overallRating ?? 70;
  const fg   = rating.fg  ?? 50;
  const tp   = rating.tp  ?? 50;
  const ins  = (rating as any).ins  ?? 50;
  const drb  = (rating as any).drb  ?? 50;
  const pss  = (rating as any).pss  ?? 50;
  const diq  = (rating as any).diq  ?? 50;
  const spd  = (rating as any).spd  ?? 50;
  const jmp  = (rating as any).jmp  ?? 50;
  const reb  = (rating as any).reb  ?? 50;
  const stre = (rating as any).stre ?? 50;
  const oiq  = (rating as any).oiq  ?? 50;
  const dnk  = rating.dnk ?? 50;
  const hgt  = rating.hgt ?? 50;
  const isRimOnly = tp < 20 && fg < 45 && dnk > 65 && hgt > 65;
  const normalized = Math.min(1, streakiness / 55);
  const overallPressure = oppDefProfile ? Math.max(0, (oppDefProfile.overallDef - 70) / 100) : 0;
  const passPressure    = oppDefProfile ? Math.max(0, (oppDefProfile.steal + oppDefProfile.passPerception - 140) / 100) : 0;
  const rollS = approxNormal() - overallPressure;
  const rollV = approxNormal() - passPressure;
  const rollH = approxNormal(); // Hustle / Defense / Rebounds
  const dietWidth     = (tp / 100) * 0.12;
  const shotDietShift = rollS * dietWidth;
  const blockMetric = hgt * jmp;
  const blockBonus = Math.max(0, blockMetric - 3500) / 4000;
  const stealBonus = Math.max(0, diq - 55) / 15;
  const hustleProb = (Math.pow(blockBonus, 1.5) * 0.012) + (Math.pow(stealBonus, 1.5) * 0.012);
  if (Math.random() < hustleProb) {
    const isHybrid = hgt > 45 && spd > 45 && diq > 55; // Giannis / Draymond
    const isBig    = hgt > 55 && diq > 55;             // Gobert / Wemby
    const isGuard  = spd > 55 && diq > 50;             // Caruso / Thybulle
    let stlMult = 1.0, blkMult = 1.0, rebBoost = 1.0;
    if (isHybrid) {
      stlMult = 1.35; blkMult = 1.30; rebBoost = 1.15; // Best of both worlds
    } else if (isBig) {
      stlMult = 1.00; blkMult = 1.50; rebBoost = 1.25; // Block party
    } else if (isGuard || stealBonus > blockBonus) {
      stlMult = 1.50; blkMult = 1.00; rebBoost = 1.00; // Clamps / Pickpocket
    }
    const archetype = isHybrid ? 'Hybrid' : isBig ? 'Big' : 'Guard';
    return {
      ptsTargetMult:  0.45 + Math.random() * 0.30,
      efficiencyMult: 0.80 + Math.random() * 0.20,
      fgaMult:        0.75,
      shotDietShift:  -0.10,
      assistMult:      1.0 + Math.random() * 0.4,
      ballControlMult: 1.2 + Math.random() * 0.4,
      orbMult:         rebBoost,
      drbMult:         rebBoost,
      stlMult,
      blkMult,
      ftAggression: 0.75, ftSkill: 1.0,
    };
  }
  let lightningRoll = Math.random();
  if (lead > 15) {
    if (!isWinner && offShare > 0.20) lightningRoll *= 0.6; // Desperate star chucking
    if (tp < 40) lightningRoll *= 0.7; // Bigs shooting 3s in garbage time
  }
  if (lightningRoll < 0.008) {
    const isStarScorer = (ins > 60 || fg > 60 || tp > 20 || oiq > 70);
    const floor = isStarScorer ? 0.45 : 0.25; // Stars don't drop to 9 points
    const pts = (floor + Math.random() * 0.25);
    const eff = (0.45 + Math.random() * 0.15);
    return {
      ptsTargetMult:  pts,
      efficiencyMult: eff,
      fgaMult:        1.00,
      shotDietShift,
      assistMult:      0.3 + Math.random() * 0.4,
      ballControlMult: 0.4 + Math.random() * 0.3,
      orbMult:         0.6 + Math.random() * 0.4,
      drbMult:         0.6 + Math.random() * 0.4,
      stlMult:         0.5 + Math.random() * 0.5,
      blkMult:         0.5 + Math.random() * 0.5,
      ftAggression: 0.55, ftSkill: 0.88,
    };
  }
  if (lightningRoll < 0.023 && (ins > 40 || fg > 60 || tp > 45) && drb > 40) {
    const explosionCeiling = 1.15 + (ovr / 100) * 0.80;
    const pts = (1.45 + Math.random() * (explosionCeiling - 1.35));
    const eff = (1.15 + Math.random() * 0.20);
    return {
      ptsTargetMult:  pts,
      efficiencyMult: eff,
      fgaMult:        0.95,
      shotDietShift,
      assistMult:      1.0 + Math.random() * 0.6,
      ballControlMult: 1.0 + Math.random() * 0.6,
      orbMult:         1.0 + Math.random() * 0.4,
      drbMult:         1.0 + Math.random() * 0.4,
      stlMult:         1.0 + Math.random() * 0.5,
      blkMult:         1.0 + Math.random() * 0.5,
      ftAggression: 1.3 + Math.random() * 0.2, ftSkill: 1.05,
    };
  }
  if (lightningRoll < 0.053 && drb > 40 && pss > 55) {
    const ast = (1.8 + Math.random() * 0.6);
    const bc  = (2.0 + Math.random() * 0.8);
    return {
      ptsTargetMult:  0.80 + Math.random() * 0.40,
      efficiencyMult: 1.0,
      fgaMult:        0.85,
      shotDietShift:  -0.05,
      assistMult:      ast,
      ballControlMult: bc,
      orbMult:         1.0 + Math.random() * 0.3,
      drbMult:         1.0 + Math.random() * 0.3,
      stlMult:         1.0,
      blkMult:         1.0,
      ftAggression: 0.85, ftSkill: 1.0,
    };
  }
  if (lightningRoll < 0.057 && hgt > 60 && stre > 30 && reb > 70) {
    return {
      ptsTargetMult:  1.35,
      efficiencyMult: 1.15,
      fgaMult:        1.0,
      shotDietShift:  -0.10,
      assistMult:      1.0,
      ballControlMult: 1.0,
      orbMult:         1.5,  // 1.5 ^ 2.0 = 2.25x Offensive boards
      drbMult:         1.2,  // 1.2 ^ 2.2 = 1.5x Defensive boards
      stlMult:         1.0,
      blkMult:         1.1,
      ftAggression: 1.2, ftSkill: 1.0,
    };
  }
  if (lightningRoll < 0.060 && tp >= 20 && tp <= 40) {
    const isSuccess = Math.random() > 0.5;
    const shift = tp < 30 ? 0.06 : 0.10; // 20-30 range gets tiny shift, 30-40 gets slight shift
    return {
      ptsTargetMult:  isSuccess ? 1.25 : 0.90,
      efficiencyMult: isSuccess ? 1.35 : 0.75,
      fgaMult:        isSuccess ? 0.95 : 1.05,
      shotDietShift:  isSuccess ? shift : (shift * 0.5),
      assistMult:      1.0,
      ballControlMult: 1.0,
      orbMult:         1.0,
      drbMult:         1.0,
      stlMult:         1.0,
      blkMult:         1.0,
      ftAggression: 0.8, ftSkill: 1.0,
    };
  }
  if (lightningRoll < 0.063 && spd > 50 && oiq > 60 && drb > 60 && pss > 40) {
    return {
      ptsTargetMult:  0.70,
      efficiencyMult: 1.15,
      fgaMult:        0.80,
      shotDietShift:  -0.10,
      assistMult:      1.50,
      ballControlMult: 1.80,
      orbMult:         1.0,
      drbMult:         1.0,
      stlMult:         1.2,
      blkMult:         1.2,
      ftAggression: 0.65, ftSkill: 1.05,
    };
  }
  if (lightningRoll < 0.032 && ovr < 62 && drb > 35 && tp > 30) {
    const pts = (1.1 + Math.random() * 0.5);   // 1.10–1.60x (was 1.2–2.5x — too insane)
    const eff = (1.15 + Math.random() * 0.15);  // 1.15–1.30x (was 1.5–1.8x)
    return {
      ptsTargetMult:  pts,
      efficiencyMult: eff,
      fgaMult:        1.05,                        // was 1.15 (was 1.40) — even role-player heat check stays close to baseline FGA volume
      shotDietShift:  0.10,                        // still chucking from deep, but not insane
      assistMult:     0.7 + Math.random() * 0.3,   // Tunnel vision, heat check mode
      ballControlMult:1.0 + Math.random() * 0.4,
      orbMult:        1.0,
      drbMult:        1.0,
      stlMult:        1.3,
      blkMult:        1.0,
      ftAggression:   1.2, ftSkill: 1.08,          // was 2.3 — no more 20+ FTA nights for bench guys
    };
  }
  if (Math.random() > 0.95) {
    return {
      ptsTargetMult:  0.82,
      efficiencyMult: 1.12,
      fgaMult:        0.72,
      shotDietShift:  -0.15,
      assistMult:      1.20 + rollV * 0.2,
      ballControlMult: 1.25 + rollV * 0.2,
      orbMult:         1.0  + rollH * 0.3,
      drbMult:         1.0  + rollH * 0.3,
      stlMult:         1.0  + rollH * 0.3,
      blkMult:         1.0  + rollH * 0.3,
      ftAggression: 0.75, ftSkill: 1.0,
    };
  }
  const qualifiesShooter    = tp > 60;
  const qualifiesMicrowave  = tp > 40 && drb > 45;
  const useShooterRoller    = qualifiesShooter  && (!qualifiesMicrowave || Math.random() < 0.5);
  const useMicrowaveRoller  = qualifiesMicrowave && !useShooterRoller;
  if (useShooterRoller && lightningRoll >= 0.068) {
    const shooterLuck = Math.random();
    if (shooterLuck < 0.13) {
      return {
        ptsTargetMult:  0.45, efficiencyMult: 0.55, fgaMult: 1.05, shotDietShift: -0.20,
        assistMult:      0.8 + rollV * 0.2,
        ballControlMult: 0.7 + rollV * 0.2,
        orbMult:         1.0 + rollH * 0.4,
        drbMult:         1.0 + rollH * 0.4,
        stlMult:         1.0 + rollH * 0.5,
        blkMult:         1.0 + rollH * 0.5,
        ftAggression: 0.65, ftSkill: 0.82,
      };
    }
    if (shooterLuck < 0.30) {
      return {
        ptsTargetMult:  0.75, efficiencyMult: 0.75, fgaMult: 1.00, shotDietShift: -0.10,
        assistMult:      0.9 + rollV * 0.25,
        ballControlMult: 1.0 + rollV * 0.25,
        orbMult:         1.0 + rollH * 0.4,
        drbMult:         1.0 + rollH * 0.4,
        stlMult:         1.0 + rollH * 0.4,
        blkMult:         1.0 + rollH * 0.4,
        ftAggression: 0.82, ftSkill: 0.88,
      };
    }
    if (shooterLuck < 0.38) {
      return {
        ptsTargetMult:  0.95, efficiencyMult: 0.65, fgaMult: 1.05, shotDietShift: 0,
        assistMult:      1.0 + rollV * 0.3,
        ballControlMult: 0.8 + rollV * 0.2,
        orbMult:         1.0 + rollH * 0.4,
        drbMult:         1.0 + rollH * 0.4,
        stlMult:         1.0 + rollH * 0.4,
        blkMult:         1.0 + rollH * 0.4,
        ftAggression: 0.88, ftSkill: 0.85,
      };
    }
    if (shooterLuck < 0.45) {
      return {
        ptsTargetMult:  0.80, efficiencyMult: 0.58, fgaMult: 1.05, shotDietShift: 0.15,
        assistMult:      0.7 + rollV * 0.2,
        ballControlMult: 0.6 + rollV * 0.2,
        orbMult:         0.9 + rollH * 0.3,
        drbMult:         0.9 + rollH * 0.3,
        stlMult:         0.9 + rollH * 0.3,
        blkMult:         0.9 + rollH * 0.3,
        ftAggression: 1.05, ftSkill: 0.82,
      };
    }
    if (shooterLuck >= 0.80 && shooterLuck < 0.92) {
      return {
        ptsTargetMult:  1.25, efficiencyMult: 1.18, fgaMult: 0.95, shotDietShift: 0.10,
        assistMult:      1.1 + rollV * 0.25,
        ballControlMult: 1.0 + rollV * 0.25,
        orbMult:         1.0 + rollH * 0.4,
        drbMult:         1.0 + rollH * 0.4,
        stlMult:         1.0 + rollH * 0.4,
        blkMult:         1.0 + rollH * 0.4,
        ftAggression: 1.15, ftSkill: 1.08,
      };
    }
    if (shooterLuck >= 0.92) {
      return {
        ptsTargetMult:  1.22, efficiencyMult: 1.18, fgaMult: 0.95, shotDietShift: 0.12,
        assistMult:      1.2 + rollV * 0.2,
        ballControlMult: 1.3 + rollV * 0.2,
        orbMult:         1.0 + rollH * 0.4,
        drbMult:         1.0 + rollH * 0.4,
        stlMult:         1.0 + rollH * 0.5,
        blkMult:         1.0 + rollH * 0.5,
        ftAggression: 1.25, ftSkill: 1.08,
      };
    }
    return {
      ptsTargetMult:  1.0, efficiencyMult: 1.0, fgaMult: 1.0, shotDietShift: 0,
      assistMult:      1.0 + rollV * 0.4,
      ballControlMult: 1.0 + rollV * 0.35,
      orbMult:         1.0 + rollH * 0.45,
      drbMult:         1.0 + rollH * 0.45,
      stlMult:         1.0 + rollH * 0.45,
      blkMult:         1.0 + rollH * 0.45,
      ftAggression: 1.0, ftSkill: 1.0,
    };
  }
  if (useMicrowaveRoller && lightningRoll >= 0.068) {
    const microwaveLuck = Math.random();
    if (microwaveLuck < 0.25) {
      return {
        ptsTargetMult:  0.85, efficiencyMult: 0.65, fgaMult: 1.10, shotDietShift: 0.08,
        assistMult:      0.8 + rollV * 0.2,
        ballControlMult: 0.7 + rollV * 0.2,
        orbMult:         0.9 + rollH * 0.3,
        drbMult:         0.9 + rollH * 0.3,
        stlMult:         0.9 + rollH * 0.4,
        blkMult:         0.9 + rollH * 0.4,
        ftAggression: 0.82, ftSkill: 0.85,
      };
    }
    if (microwaveLuck >= 0.75) {
      return {
        ptsTargetMult:  1.25, efficiencyMult: 1.28, fgaMult: 0.95, shotDietShift: 0.10,
        assistMult:      1.2 + rollV * 0.2,
        ballControlMult: 1.2 + rollV * 0.2,
        orbMult:         1.1 + rollH * 0.3,
        drbMult:         1.1 + rollH * 0.3,
        stlMult:         1.1 + rollH * 0.3,
        blkMult:         1.1 + rollH * 0.3,
        ftAggression: 1.28, ftSkill: 1.10,
      };
    }
    return {
      ptsTargetMult:  1.0, efficiencyMult: 1.0, fgaMult: 1.0, shotDietShift: 0,
      assistMult:      1.0 + rollV * 0.4,
      ballControlMult: 1.0 + rollV * 0.35,
      orbMult:         1.0 + rollH * 0.4,
      drbMult:         1.0 + rollH * 0.4,
      stlMult:         1.0 + rollH * 0.4,
      blkMult:         1.0 + rollH * 0.4,
      ftAggression: 1.0, ftSkill: 1.0,
    };
  }
  const tpBoost  = (tp / 100) * 0.15;
  const ptsWidth = 0.06 + normalized * 0.20 + tpBoost;
  const maxMult  = 1.0 + (ovr / 100) * 0.65;
  const minMult  = 0.25 + (ovr / 100) * 0.20;
  const ptsTargetMult = Math.max(minMult, Math.min(maxMult, 1.0 + rollS * ptsWidth));
  const effBase  = isRimOnly ? dnk : fg;
  const effWidth = ((100 - effBase) / 100) * (isRimOnly ? 0.08 : 0.18) + (tp / 100) * 0.08;
  const efficiencyMult = Math.max(0.62, Math.min(1.32, 1.0 + rollS * effWidth));
  const assistMult      = Math.max(0.30, Math.min(2.2, 1.0 + rollV * 0.60));
  const ballControlMult = Math.max(0.40, Math.min(1.8, 1.0 + rollV * 0.50));
  const orbMult = Math.max(0.40, Math.min(2.1, 1.0 + rollH * 0.55));
  const drbMult = Math.max(0.40, Math.min(2.1, 1.0 + rollH * 0.55));
  const stlMult = Math.max(0.20, Math.min(2.8, 1.0 + rollH * 0.90));
  const blkMult = Math.max(0.20, Math.min(2.8, 1.0 + rollH * 0.90));
  const ftAggression = Math.max(0.5, Math.min(1.6, 1.0 + rollS * 0.40));
  const ftSkill = Math.max(0.80, Math.min(1.15, 1.0 + rollS * 0.10));
  const fgaMult = Math.max(0.90, Math.min(1.10, 1.0 - (ptsTargetMult - 1.0) * 0.10));
  return { ptsTargetMult, efficiencyMult, fgaMult, shotDietShift, assistMult, ballControlMult, orbMult, drbMult, stlMult, blkMult, ftAggression, ftSkill };
}
export function getNightProfile(
  p: Player,
  season: number,
  lead: number = 0,
  isWinner: boolean = true,
  offShare: number = 0.1,
  oppDefProfile?: { overallDef: number; steal: number; passPerception: number }
): NightProfile {
  const profile = computeNightProfile(p, season, lead, isWinner, offShare, oppDefProfile);
  const severity = activeClubDebuffs.get(String(p.internalId));
  if (severity) {
    applyClubDebuff(profile, severity);
  }
  return profile;
}
