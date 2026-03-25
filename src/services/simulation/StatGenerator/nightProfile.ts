import { NBAPlayer as Player } from '../../../types';

export interface NightProfile {
  ptsTargetMult: number;   // Scoring volume (rollS)
  efficiencyMult: number;  // Shooting % (rollS)
  shotDietShift: number;   // 3PA tendency (rollS)
  assistMult: number;      // Passing vision (rollV) — high = more assists
  ballControlMult: number; // TOV safety (rollV) — high = fewer TOs (SAME roll as assistMult, inversely applied)
  reboundMult: number;     // Glass aggression (rollH)
  defensiveEnergy: number; // STL/BLK activity (rollH)
}

function calcStreakiness(rating: any): number {
  const fg   = rating.fg   ?? 50;
  const tp   = rating.tp   ?? 50;
  const oiq  = rating.oiq  ?? 50;
  const endu = rating.endu ?? 50;
  const dnk  = rating.dnk  ?? 50;
  const ins  = rating.ins  ?? 50;
  const hgt  = rating.hgt  ?? 50;

  // Rim-only bigs have low fg/tp but are NOT streaky — they get
  // automatic dunks/putbacks. Use dnk+ins as their consistency anchor.
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
  // Sum of 4 uniforms → approx normal, range ~-1 to 1, centered at 0
  return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
}

export function getNightProfile(p: Player, season: number): NightProfile {
  const rating = p.ratings?.find(r => r.season === season)
              ?? p.ratings?.[p.ratings.length - 1];

  // No ratings = celebrity/mock player, flat profile
  if (!rating) return {
    ptsTargetMult: 1.0, efficiencyMult: 1.0, shotDietShift: 0,
    assistMult: 1.0, ballControlMult: 1.0, reboundMult: 1.0, defensiveEnergy: 1.0,
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

  // THREE INDEPENDENT ROLLS (-1 to 1)
  const rollS = approxNormal(); // Shooting / Volume
  const rollV = approxNormal(); // Vision / Passing (assistMult + ballControlMult share this)
  const rollH = approxNormal(); // Hustle / Defense / Rebounds

  // Shot diet shift (used by lightning paths too)
  const dietWidth     = (tp / 100) * 0.12;
  const shotDietShift = rollS * dietWidth;

  // ── Lightning strikes (~2.8% total) ────────────────────────────────────
  const lightningRoll = Math.random();

  // ── Gated lightning strikes ─────────────────────────────────────────────
  // DISASTER — no gate, anyone can have a historically bad night
  if (lightningRoll < 0.008) {
    return {
      ptsTargetMult:  0.25 + Math.random() * 0.25,
      efficiencyMult: 0.55 + Math.random() * 0.15,
      shotDietShift,
      assistMult:      0.3 + Math.random() * 0.4,
      ballControlMult: 0.4 + Math.random() * 0.3,
      reboundMult:     0.6 + Math.random() * 0.4,
      defensiveEnergy: 0.5 + Math.random() * 0.5,
    };
  }

  // EXPLOSION — gate: must be a real ball-handler who can score (blocks Gobert, Capella)
  // ins>40 OR fg>60 OR tp>45 = has a scoring skill; AND drb>40 = can put it on the floor
  if (lightningRoll < 0.023 && (ins > 40 || fg > 60 || tp > 45) && drb > 40) {
    const explosionCeiling = 1.4 + (ovr / 100) * 0.9;
    return {
      ptsTargetMult:  1.6 + Math.random() * (explosionCeiling - 1.6),
      efficiencyMult: 1.15 + Math.random() * 0.20,
      shotDietShift,
      assistMult:      1.0 + Math.random() * 0.6,
      ballControlMult: 1.0 + Math.random() * 0.6,
      reboundMult:     1.0 + Math.random() * 0.4,
      defensiveEnergy: 1.0 + Math.random() * 0.5,
    };
  }

  // HUSTLE GOD — gate: must have athletic defensive profile (blocks Mitchell diq=52)
  // spd>40 AND jmp>40 AND diq>58 — Caruso/Draymond/Wemby qualify, average guards don't
  if (lightningRoll < 0.038 && spd > 40 && jmp > 40 && diq > 58) {
    return {
      ptsTargetMult:  0.25 + Math.random() * 0.30,
      efficiencyMult: 0.70 + Math.random() * 0.20,
      shotDietShift:  -0.15,
      assistMult:      1.0 + Math.random() * 0.5,
      ballControlMult: 1.2 + Math.random() * 0.4,
      reboundMult:     1.6 + Math.random() * 0.5,
      defensiveEnergy: 1.6 + Math.random() * 0.5,
    };
  }

  // POINT GOD — gate: must be a real facilitator (blocks scorers-only, pure big men)
  // drb>40 AND pss>55 — Jokic/LeBron/CP3 qualify, pure scorers without passing don't
  if (lightningRoll < 0.053 && drb > 40 && pss > 55) {
    return {
      ptsTargetMult:  0.80 + Math.random() * 0.40,
      efficiencyMult: 1.0,
      shotDietShift:  -0.05,
      assistMult:      1.8 + Math.random() * 0.6,  // kept sane — high but not broken
      ballControlMult: 2.0 + Math.random() * 0.8,  // wizard night = very few TOs
      reboundMult:     1.0 + Math.random() * 0.3,
      defensiveEnergy: 1.0,
    };
  }

  // ZUBAC GOLIATH (~0.2%) — tall, strong, elite rebounder: historic board night
  // Gate: hgt>60, stre>30, reb>70 — Zubac/Gobert/Jokic qualify, guards never do
  if (lightningRoll < 0.057 && hgt > 60 && stre > 30 && reb > 70) {
    return {
      ptsTargetMult:  1.75,
      efficiencyMult: 1.20,
      shotDietShift:  -0.10,
      assistMult:      1.0,
      ballControlMult: 1.0,
      reboundMult:     2.0,  // 25-30 reb territory
      defensiveEnergy: 1.5,
    };
  }

  // LIMBO SHOOTER (~0.3%) — non-shooter (tp 22-40) suddenly catches fire from three
  // Double-edged: 50% chance it works, 50% it's a brick parade
  // shotDietShift capped at 0.25 to not overwhelm 3PA averages
  if (lightningRoll < 0.060 && tp >= 22 && tp <= 40) {
    const isSuccess = Math.random() > 0.5;
    return {
      ptsTargetMult:  1.30,
      efficiencyMult: isSuccess ? 1.40 : 0.60,
      shotDietShift:  0.25,
      assistMult:      1.0,
      ballControlMult: 1.0,
      reboundMult:     1.0,
      defensiveEnergy: 1.0,
    };
  }

  // PASSIVE STAR (~0.3%) — star defers, becomes a distributor for one night
  // Gate: spd>50, oiq>60, drb>60, pss>40 — real playmakers only
  // Kept at ~1% window to avoid avg distortion (5% would shave ~0.5 ppg off stars)
  if (lightningRoll < 0.063 && spd > 50 && oiq > 60 && drb > 60 && pss > 40) {
    return {
      ptsTargetMult:  0.70,
      efficiencyMult: 1.15,
      shotDietShift:  -0.10,
      assistMult:      1.50,
      ballControlMult: 1.80,
      reboundMult:     1.0,
      defensiveEnergy: 1.2,
    };
  }

  // ── Simmons Effect (5% — everyone, regardless of rating) ────────────────
  // Passes up shots, defers, plays "the right way." shotDietShift capped at -0.15
  // to avoid tanking league-wide 3PA averages (original -0.35 was too aggressive).
  if (Math.random() > 0.95) {
    return {
      ptsTargetMult:  0.82,
      efficiencyMult: 1.12,
      shotDietShift:  -0.15,
      assistMult:      1.20 + rollV * 0.2,
      ballControlMult: 1.25 + rollV * 0.2,
      reboundMult:     1.0  + rollH * 0.3,
      defensiveEnergy: 1.0  + rollH * 0.3,
    };
  }

  // ── Shooter / Microwave roller selection ────────────────────────────────
  // Both rollers have weighted avg = 1.0, so mixing is safe.
  // If a player qualifies for both, flip a coin — adds variety without breaking averages.
  // If only one qualifies, use that one. Normal night is always the fallback.
  const qualifiesShooter    = tp > 60;
  const qualifiesMicrowave  = tp > 40 && drb > 45;
  const useShooterRoller    = qualifiesShooter  && (!qualifiesMicrowave || Math.random() < 0.5);
  const useMicrowaveRoller  = qualifiesMicrowave && !useShooterRoller;

  // ── Shooter Override — tp > 60: symmetric 5-tier bell curve (fires ~94% of nights) ──
  // Distribution: A(10) / B(15) / C(50) / D(15) / E(10) — B↔D and A↔E mirrored around 1.0
  if (useShooterRoller && lightningRoll >= 0.068) {
    const shooterLuck = Math.random();

    // TIER 1: BRICKFEST (13%) — low volume, low efficiency
    if (shooterLuck < 0.13) {
      return {
        ptsTargetMult:  0.45, efficiencyMult: 0.65, shotDietShift: -0.20,
        assistMult:      0.8 + rollV * 0.2,
        ballControlMult: 0.7 + rollV * 0.2,
        reboundMult:     1.0 + rollH * 0.4,
        defensiveEnergy: 1.0 + rollH * 0.5,
      };
    }

    // TIER 2: COLD (17%) — lower volume, struggling
    if (shooterLuck < 0.30) {
      return {
        ptsTargetMult:  0.75, efficiencyMult: 0.82, shotDietShift: -0.10,
        assistMult:      0.9 + rollV * 0.25,
        ballControlMult: 1.0 + rollV * 0.25,
        reboundMult:     1.0 + rollH * 0.4,
        defensiveEnergy: 1.0 + rollH * 0.4,
      };
    }

    // TIER 3: OFF-NIGHT (8%) — lid on the rim, 5-for-18, normal volume bad efficiency
    if (shooterLuck < 0.38) {
      return {
        ptsTargetMult:  0.95, efficiencyMult: 0.72, shotDietShift: 0,
        assistMult:      1.0 + rollV * 0.3,
        ballControlMult: 0.8 + rollV * 0.2,
        reboundMult:     1.0 + rollH * 0.4,
        defensiveEnergy: 1.0 + rollH * 0.4,
      };
    }

    // TIER 4: DESPERATE CHUCKER (7%) — hunting shots to break slump, 7-for-26
    if (shooterLuck < 0.45) {
      return {
        ptsTargetMult:  1.20, efficiencyMult: 0.65, shotDietShift: 0.15,
        assistMult:      0.7 + rollV * 0.2,
        ballControlMult: 0.6 + rollV * 0.2,
        reboundMult:     0.9 + rollH * 0.3,
        defensiveEnergy: 0.9 + rollH * 0.3,
      };
    }

    // TIER 5: SOLID (35%) — bread-and-butter game
    if (shooterLuck < 0.80) {
      return {
        ptsTargetMult:  1.0, efficiencyMult: 1.0, shotDietShift: 0,
        assistMult:      1.0 + rollV * 0.4,
        ballControlMult: 1.0 + rollV * 0.35,
        reboundMult:     1.0 + rollH * 0.45,
        defensiveEnergy: 1.0 + rollH * 0.45,
      };
    }

    // TIER 6: HOT (12%) — high efficiency night
    if (shooterLuck < 0.92) {
      return {
        ptsTargetMult:  1.25, efficiencyMult: 1.18, shotDietShift: 0.10,
        assistMult:      1.1 + rollV * 0.25,
        ballControlMult: 1.0 + rollV * 0.25,
        reboundMult:     1.0 + rollH * 0.4,
        defensiveEnergy: 1.0 + rollH * 0.4,
      };
    }

    // TIER 7: TORCH (8%) — everything falling, 40+ pt territory
    return {
      ptsTargetMult:  1.55, efficiencyMult: 1.35, shotDietShift: 0.12,
      assistMult:      1.2 + rollV * 0.2,
      ballControlMult: 1.3 + rollV * 0.2,
      reboundMult:     1.0 + rollH * 0.4,
      defensiveEnergy: 1.0 + rollH * 0.5,
    };
  }

  // ── Microwave Override — tp > 45 & drb > 45: volume-stable, efficiency-swing ──
  // Archetype: Cam Thomas, Jamal Crawford, Lou Williams.
  // Dual-qualifiers (tp > 60 & drb > 45) randomly land here ~50% of nights.
  // Distribution: 25% Chucker / 50% Professional / 25% All-Star — avg = exactly 1.0
  if (useMicrowaveRoller && lightningRoll >= 0.068) {
    const microwaveLuck = Math.random();

    // CHUCKER (25%) — 6-for-22 night, volume steady but nothing falling
    if (microwaveLuck < 0.25) {
      return {
        ptsTargetMult:  0.85, efficiencyMult: 0.72, shotDietShift: 0.05,
        assistMult:      0.8 + rollV * 0.2,
        ballControlMult: 0.7 + rollV * 0.2,
        reboundMult:     0.9 + rollH * 0.3,
        defensiveEnergy: 0.9 + rollH * 0.4,
      };
    }

    // PROFESSIONAL (50%) — standard night, 1.0 across the board
    if (microwaveLuck < 0.75) {
      return {
        ptsTargetMult:  1.0, efficiencyMult: 1.0, shotDietShift: 0,
        assistMult:      1.0 + rollV * 0.4,
        ballControlMult: 1.0 + rollV * 0.35,
        reboundMult:     1.0 + rollH * 0.4,
        defensiveEnergy: 1.0 + rollH * 0.4,
      };
    }

    // ALL-STAR (25%) — same volume, everything a swish, people calling for him to start
    return {
      ptsTargetMult:  1.15, efficiencyMult: 1.28, shotDietShift: 0.10,
      assistMult:      1.2 + rollV * 0.2,
      ballControlMult: 1.2 + rollV * 0.2,
      reboundMult:     1.1 + rollH * 0.3,
      defensiveEnergy: 1.1 + rollH * 0.3,
    };
  }

  // ── Normal night ────────────────────────────────────────────────────────

  // 1. SCORING & EFFICIENCY (rollS)
  const tpBoost  = (tp / 100) * 0.15;
  const ptsWidth = 0.06 + normalized * 0.20 + tpBoost;
  const maxMult  = 1.0 + (ovr / 100) * 0.65;
  const minMult  = 0.25 + (ovr / 100) * 0.20;
  const ptsTargetMult = Math.max(minMult, Math.min(maxMult, 1.0 + rollS * ptsWidth));

  const effBase  = isRimOnly ? dnk : fg;
  const effWidth = ((100 - effBase) / 100) * (isRimOnly ? 0.08 : 0.18) + (tp / 100) * 0.08;
  const efficiencyMult = Math.max(0.62, Math.min(1.32, 1.0 + rollS * effWidth));

  // 2. VISION (rollV) — assistMult and ballControlMult share the SAME roll
  //    Wizard night: high assists + few TOs. Disaster night: low assists + many TOs.
  const assistMult      = Math.max(0.30, Math.min(2.2, 1.0 + rollV * 0.60));
  const ballControlMult = Math.max(0.40, Math.min(1.8, 1.0 + rollV * 0.50));

  // 3. HUSTLE (rollH) — rebounds and defensive energy share the SAME roll
  //    Allows Caruso to have 0pts but 5stl/3blk, or Wemby 3-for-15 but 8 blocks.
  const reboundMult     = Math.max(0.40, Math.min(2.1, 1.0 + rollH * 0.55));
  const defensiveEnergy = Math.max(0.20, Math.min(2.8, 1.0 + rollH * 0.90));

  return { ptsTargetMult, efficiencyMult, shotDietShift, assistMult, ballControlMult, reboundMult, defensiveEnergy };
}
