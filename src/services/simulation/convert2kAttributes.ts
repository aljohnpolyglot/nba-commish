export interface K2CategoryData {
  sub: number[];
  ovr: number;
}

export interface K2Data {
  OS: K2CategoryData; // Outside Scoring: closeShot, midRange, threePoint, freeThrow, shotIQ, offConsistency
  AT: K2CategoryData; // Athleticism: speed, agility, strength, vertical, stamina, hustle, durability
  IS: K2CategoryData; // Inside Scoring: layup, standingDunk, drivingDunk, postHook, postFade, postControl, drawFoul, hands
  PL: K2CategoryData; // Playmaking: passAccuracy, ballHandle, speedWithBall, passIQ, passVision
  DF: K2CategoryData; // Defense: interiorDef, perimeterDef, steal, block, helpDefIQ, passPerception, defConsistency
  RB: K2CategoryData; // Rebounding: offRebound, defRebound
}

export const K2_CATS = [
  { k: 'OS', n: 'Outside Scoring', sub: ['Close Shot', 'Mid-Range', 'Three-Point', 'Free Throw', 'Shot IQ', 'Off. Consistency'] },
  { k: 'AT', n: 'Athleticism',     sub: ['Speed', 'Agility', 'Strength', 'Vertical', 'Stamina', 'Hustle', 'Durability'] },
  { k: 'IS', n: 'Inside Scoring',  sub: ['Layup', 'Standing Dunk', 'Driving Dunk', 'Post Hook', 'Post Fade', 'Post Control', 'Draw Foul', 'Hands'] },
  { k: 'PL', n: 'Playmaking',      sub: ['Pass Accuracy', 'Ball Handle', 'Speed w/ Ball', 'Pass IQ', 'Pass Vision'] },
  { k: 'DF', n: 'Defense',         sub: ['Interior Def.', 'Perimeter Def.', 'Steal', 'Block', 'Help Def. IQ', 'Pass Perception', 'Def. Consistency'] },
  { k: 'RB', n: 'Rebounding',      sub: ['Off. Rebound', 'Def. Rebound'] },
] as const;

// Radar axes (for spider chart) — category OVR + overall
export const RADAR_AXES = ['Overall', 'Outside Scoring', 'Athleticism', 'Inside Scoring', 'Playmaking', 'Defense', 'Rebounding'] as const;

interface BBGMRatings {
  hgt: number; stre: number; spd: number; jmp: number; endu: number;
  ins: number; dnk: number; ft: number; fg: number; tp: number;
  oiq: number; diq: number; drb: number; pss: number; reb: number;
  [key: string]: number;
}

interface PlayerPhysicals {
  pos?: string;       // 'PG' | 'SG' | 'SF' | 'PF' | 'C' | 'G' | 'F' | 'G/F' | 'F/C'
  heightIn?: number;  // actual height in inches (player.hgt)
  weightLbs?: number; // actual weight in lbs (player.weight)
  age?: number;
}

export function calculateK2(ratings: BBGMRatings, physicals: PlayerPhysicals = {}): K2Data {
  const { hgt, stre, spd, jmp, endu, ins, dnk, ft, fg, tp, oiq, diq, drb, pss, reb } = ratings;
  const { pos = 'F', heightIn = 78, weightLbs = 220, age = 26 } = physicals;

  const isBig = /C|F\/C|PF/.test(pos);
  const isGuard = /PG|SG|G$/.test(pos);

  // BMI from actual measurements
  const heightCm = heightIn * 2.54;
  const weightKg = weightLbs * 0.453592;
  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  const bmiPenalty = Math.max(0, bmi - 25); // penalty only for overweight
  const bmiBonus = Math.max(0, 22 - bmi);   // bonus for lean players

  // Weight factor for strength
  const weightFactor = (weightLbs - 215) * 0.65;

  // Height bonus for blocks/interior (BBGM hgt attribute 0-100)
  const hgtFactor = hgt > 55 ? (hgt - 55) * 0.4 : (hgt - 55) * 0.8;

  // Age penalty for hustle/durability
  const agePenalty = age > 30 ? (age - 30) * 1.5 : 0;

  // TP-based vertical penalty (shooters don't need to jump as much)
  const tpVertPenalty = tp > 78 ? (tp - 78) * 0.01 : 0;
  const hgtVertPenalty = hgt > 60 ? (hgt - 60) * 0.01 : 0;
  const athPenaltyFactor = tpVertPenalty + hgtVertPenalty;

  // DIQ amplification (good defenders get extra boost, bad ones get penalized)
  const diqAmp = diq + (diq - 50) * 0.5;

  // Overall nerf for very slow players
  const athNerf = Math.min(0, -((50 - spd) + (50 - jmp)) / 3);

  // Scaling: BBGM 0-100 → 2K 25-99
  const s = (v: number, boost = 0): number => {
    let base = 25 + v * 0.6 + boost;
    if (v > 75) base += Math.pow((v - 75) / 5, 1.8); // elite curve
    return Math.max(25, Math.min(99, Math.round(base)));
  };

  // Block rating (used as input for perimeter def boost)
  const blockVal = s(
    diqAmp * 0.2 + hgt * 0.4 + jmp * 0.4,
    Math.max(0, hgt - 70) * 2.0 + (jmp - 50) / 5
  );
  const dominantBlockBoost = blockVal > 90 ? (blockVal - 90) * 0.5 : 0;

  const OS: K2CategoryData = {
    sub: [
      s(ins * 0.5 + oiq * 0.3 + fg * 0.2, 15),                              // Close Shot
      s(fg * 0.8 + ft * 0.1 + tp * 0.1, 10),                                // Mid-Range
      s(tp * 0.8 + fg * 0.2, 18 + (tp < 30 ? -(40 - tp) / 2 : 0)),         // Three-Point
      s(ft, 22),                                                               // Free Throw
      s(oiq, 25),                                                              // Shot IQ
      s(oiq * 0.4 + endu * 0.3 + fg * 0.15 + ins * 0.15, 20),               // Off. Consistency
    ],
    ovr: 0,
  };

  const AT: K2CategoryData = {
    sub: [
      s(spd, 25 + athNerf - bmiPenalty * 2 + bmiBonus * 1.5),               // Speed
      s(spd * 0.7 + drb * 0.3, 10 + athNerf / 2 - bmiPenalty * 3 + bmiBonus * 2), // Agility
      s(stre * 0.8 + hgt * 0.2, 18 + weightFactor),                          // Strength
      s(jmp * (1 - athPenaltyFactor), 15 + athNerf / 2 + (jmp >= 50 ? (spd - 50) / 2 : -(50 - jmp) * 2) + Math.max(0, hgt - 70) / 3), // Vertical
      s(endu, 20 + oiq / 8 - bmiPenalty * 2),                                // Stamina
      s(endu * 0.6 + diq * 0.4, 30 + athNerf - agePenalty),                  // Hustle
      s(endu, 15 - bmiPenalty * 3 - (hgt - 70) / 3 + Math.max(0, 50 - spd) * 0.5), // Durability
    ],
    ovr: 0,
  };

  const IS: K2CategoryData = {
    sub: [
      s(ins * 0.8 + dnk * 0.4, 15),                                           // Layup
      s((dnk * 0.4 + hgt * 0.8) * (1 - athPenaltyFactor), isBig ? 20 : -20), // Standing Dunk
      s((dnk * 0.9 + jmp * 0.3) * (1 - athPenaltyFactor), isBig ? 10 : -10), // Driving Dunk
      s(ins * 0.8 + hgt * 0.2, 10),                                            // Post Hook
      s(fg * 0.6 + ins * 0.4, 10),                                             // Post Fade
      s(stre * 0.6 + ins * 0.4, 15 + weightFactor),                            // Post Control
      s(ins * 0.3 + drb * 0.2 + stre * 0.2 + hgt * 0.2 - tp * 0.1, 35),     // Draw Foul
      s(oiq * 0.7 + pss * 0.3, 30),                                            // Hands
    ],
    ovr: 0,
  };

  const PL: K2CategoryData = {
    sub: [
      s(pss, 25 + (pss < 50 ? (pss - 50) * 1.2 : 0)),                        // Pass Accuracy
      s(drb, 25 + (drb < 50 ? (drb - 50) * 1.2 : 0)),                        // Ball Handle
      s(spd * 0.4 + drb * 0.6, 15 + (spd - 50) / 3),                         // Speed w/ Ball
      s(pss * 0.5 + oiq * 0.5, 20 + (pss < 60 ? -(60 - pss) : 0)),           // Pass IQ
      s(pss * 0.3 + oiq * 0.7, 20 + (pss < 60 ? -(60 - pss) : 0)),           // Pass Vision
    ],
    ovr: 0,
  };

  const DF: K2CategoryData = {
    sub: [
      s(hgt * 0.6 + jmp * 0.2 + diqAmp * 0.15 + stre * 0.05, (isBig ? 10 : 0) + hgtFactor), // Interior Def.
      s(diqAmp * 0.8 + spd * 0.2, (isGuard ? 5 : 0) + dominantBlockBoost),                    // Perimeter Def.
      s(diqAmp * 0.6 + spd * 0.4, 15),                                                          // Steal
      blockVal,                                                                                   // Block
      s(diqAmp, 25),                                                                             // Help Def. IQ
      s(diqAmp * 0.6 + spd * 0.3 + oiq * 0.1, 20),                                             // Pass Perception
      s(diqAmp * 0.4 + endu * 0.1 + hgt * 0.5, 20),                                            // Def. Consistency
    ],
    ovr: 0,
  };

  const RB: K2CategoryData = {
    sub: [
      s(hgt * 0.4 + reb * 0.3 + stre * 0.3, oiq / 15 + jmp / 15 + spd / 15), // Off. Rebound
      s(hgt * 0.4 + reb * 0.3 + stre * 0.3, diq / 15 + stre / 15 + hgt / 10), // Def. Rebound
    ],
    ovr: 0,
  };

  // Compute category OVR as average of subs
  for (const cat of [OS, AT, IS, PL, DF, RB]) {
    cat.ovr = Math.round(cat.sub.reduce((a, b) => a + b, 0) / cat.sub.length);
  }

  return { OS, AT, IS, PL, DF, RB };
}

// Returns radar data: [overall2k, OS.ovr, AT.ovr, IS.ovr, PL.ovr, DF.ovr, RB.ovr]
export function getRadarValues(k2: K2Data, overall2k: number): number[] {
  return [overall2k, k2.OS.ovr, k2.AT.ovr, k2.IS.ovr, k2.PL.ovr, k2.DF.ovr, k2.RB.ovr];
}
