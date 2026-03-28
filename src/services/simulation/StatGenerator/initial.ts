import { NBAPlayer as Player, NBATeam as Team } from '../../../types';
import { PlayerGameStats } from '../types';
import { MinutesPlayedService } from '../MinutesPlayedService';
import { getScaledRating, R } from './helpers';
import { getVariance } from '../utils';
import { getNightProfile } from './nightProfile';
import { SimulatorKnobs, KNOBS_DEFAULT } from '../SimulatorKnobs';

export function generateStatsForTeam(
  team: Team,
  players: Player[],
  totalScore: number,
  isWinner: boolean,
  lead: number,
  weights: Record<string, number> = {},
  season: number = 2025,
  overridePlayers?: Player[],
  otCount: number = 0,
  oppDefProfile?: { overallDef: number; interiorDef: number; perimeterDef: number; steal: number; block: number; passPerception: number },
  knobs: SimulatorKnobs = KNOBS_DEFAULT
): PlayerGameStats[] {
  // ── Apply pace multiplier to scoring target ────────────────────────────────
  const adjustedScore = Math.round(totalScore * knobs.paceMultiplier);

  // ── Rotation (WHO plays) + Minutes (HOW MANY) — both from MinutesPlayedService ──
  // Pass rotationDepthOverride into getRotation directly so exhibition games (All-Star: 12,
  // Rising Stars: 10) bypass the standings-based depth cap before the list is truncated.
  const rotResult  = MinutesPlayedService.getRotation(
    team, players, lead, season, overridePlayers,
    knobs.conferenceRank, knobs.gbFromLeader, knobs.gamesRemaining,
    knobs.rotationDepthOverride,
  );

  const rotation = rotResult.players;

  if (rotation.length === 0) return [];

  const starters = rotation.slice(0, 5);

  // ── Minute allocation ──────────────────────────────────────────────────────
  let playerMinutes: number[];
  const totalMinuteBudget = (knobs.quarterLength * 4 + otCount * 5) * 5;

  if (knobs.flatMinutes) {
    // Rating-weighted flat distribution: athletes play more, personalities play less.
    // Spread is ±50% around the target based on relative overall rating so the total
    // still sums close to TARGET while A'ja Wilson (high OVR) gets 30-36 min and
    // Stephen A. Smith (floor OVR) gets 10-14 min.
    const targetPerPlayer = knobs.flatMinutesTarget ?? Math.floor(totalMinuteBudget / rotation.length);
    const getOvr = (p: Player) => Math.max(knobs.ratingFloor, p.overallRating ?? 50);
    const ovrs = rotation.map(p => getOvr(p));
    const maxOvr = Math.max(...ovrs);
    const minOvr = Math.min(...ovrs);
    playerMinutes = rotation.map((p, i) => {
      // t = 0 for lowest rated, 1 for highest rated
      const t = maxOvr > minOvr ? (ovrs[i] - minOvr) / (maxOvr - minOvr) : 0.5;
      // Scale: 0.5× target (spot minutes) → 1.5× target (star time)
      const mins = targetPerPlayer * (0.5 + t * 1.0);
      return Math.max(1, mins + (Math.random() - 0.5) * 3);
    });
  } else {
    const mpgTarget = knobs.starMpgOverride ?? rotResult.starMpgTarget;
    const { minutes } = MinutesPlayedService.allocateMinutes(
      rotation, season, lead, otCount, mpgTarget
    );
    playerMinutes = minutes;
  }

  // ── Rating-floor helper (protects celebrity/mock players from 0-stat lines) ──
  const rFloor = knobs.ratingFloor;
  const rHelper = (p: Player, k: string) => Math.max(rFloor, R(p, k, season));

  // ── Scoring Potential ──────────────────────────────────────────────────
  const scoringPotentials = rotation.map((p, i) => {
    const oiq = rHelper(p, 'oiq'), drb = rHelper(p, 'drb'), ins = rHelper(p, 'ins');
    const fg  = rHelper(p, 'fg'),  tp  = rHelper(p, 'tp'),  dnk = rHelper(p, 'dnk');
    const spd = rHelper(p, 'spd'), hgt = rHelper(p, 'hgt');

    const usage = (ins * 0.23 + dnk * 0.15 + fg * 0.15 + tp * 0.15 + spd * 0.08 + hgt * 0.08 + drb * 0.08 + oiq * 0.08) * playerMinutes[i];
    const inside  = ins * 0.6 + dnk * 0.4;
    const outside = fg  * 0.5 + tp  * 0.5;
    const skill   = (Math.max(inside, outside) * 1.5 + Math.min(inside, outside) * 0.5) / 2;
    return Math.pow(usage * (skill / 100), 1.25);
  });
  const totalScoringPotential = scoringPotentials.reduce((a, b) => a + b, 0);

  // ── Points Distribution ────────────────────────────────────────────────
  let teamBonusBucket = 0;
  const initialTargets = rotation.map((_, i) => {
    const share    = scoringPotentials[i] / totalScoringPotential;
    let rawTarget  = adjustedScore * share;
    if (rawTarget > 34) {
      const excess      = rawTarget - 34;
      const shavedPoints = excess * 0.40;
      teamBonusBucket  += shavedPoints;
      rawTarget          = 34 + (excess - shavedPoints);
    }
    return { rawTarget, share };
  });

  // ── Build Per-Player Stat Lines ────────────────────────────────────────
  const playerStats: PlayerGameStats[] = rotation.map((p, i) => {
    let ptsTarget = initialTargets[i].rawTarget;
    const share   = initialTargets[i].share;

    if (ptsTarget < 25) {
      const bonusShare = (1 - share) / (rotation.length - 1);
      ptsTarget += teamBonusBucket * bonusShare;
    }
    const nightProfile = getNightProfile(p, season, lead, isWinner, share, oppDefProfile);
    ptsTarget = Math.max(0, Math.round(ptsTarget * nightProfile.ptsTargetMult));
    const _nightOrbMult   = nightProfile.orbMult;
    const _nightDrbMult   = nightProfile.drbMult;
    const _nightAssistMult = nightProfile.assistMult;
    const _nightStlMult   = nightProfile.stlMult; // Split!
    const _nightBlkMult   = nightProfile.blkMult; // Split!
    const _nightBallCtrl  = nightProfile.ballControlMult;

    const tp   = rHelper(p, 'tp'),   oiq  = rHelper(p, 'oiq'), ft   = rHelper(p, 'ft');
    const fg   = rHelper(p, 'fg'),   ins  = rHelper(p, 'ins'),  dnk  = rHelper(p, 'dnk');
    const hgt  = rHelper(p, 'hgt'),  stre = rHelper(p, 'stre'), spd  = rHelper(p, 'spd');
    const drb  = rHelper(p, 'drb');

    // 🏀 FREE THROWS (The Aggressive Whistle)
    // Ins/Dnk/Stre drive the factor — no TP penalty.
    const foulFactor = (ins * 0.4 + dnk * 0.4 + stre * 0.2);
    const drawingFoulsComposite = Math.max(10, foulFactor);

    // Exponent 2.3: preserves big-man dominance. Multiplier 0.55: lifts floor for role players.
    const foulMerchantFactor = Math.pow(drawingFoulsComposite / 100, 2.3);
    let baseFtRate = 0.04 + (foulMerchantFactor * 0.55);

    // Hard caps: elite shooters (TP > 85) at 0.14; everyone else at 0.40
    const maxFtRate = tp > 85 ? 0.14 : 0.40;
    baseFtRate = Math.min(baseFtRate, maxFtRate) * knobs.ftRateMult;

    const estimatedFga = ptsTarget / 1.1;
    // Cap ftaBase at 34 pts equivalent — prevents explosion nights from producing 20 FTA.
    // ftAggression scales FTA with the night profile: Torch/Explosion nights draw more fouls,
    // Brickfest/Passive nights draw fewer.
    const ftaBase = Math.min(ptsTarget, 34) / 1.20;
    let fta = Math.round(ftaBase * baseFtRate * nightProfile.ftAggression * getVariance(1.0, 0.18));

    // Floor: every active scorer draws at least some contact
    fta = Math.max(Math.round(ptsTarget * 0.04), fta);

    // Tight wobble: -1 to +1
    if (fta > 1) fta += Math.floor(Math.random() * 3) - 1;
    fta = Math.max(0, fta);

    // TRUE BELL CURVE FT%: An 80% shooter should occasionally shoot 60% or 100% in a single game.
    // ftSkill nudges % up on hot nights (Torch: +12%) and down on cold nights (Brickfest: -18%).
    const ftpBase = (ft / 100) * 0.50 + 0.42;
    let gameFtp = ftpBase * nightProfile.ftSkill * getVariance(1.0, 0.15) * (1.0 + (nightProfile.efficiencyMult - 1.0) * 0.2);

    // Bell curve cap — naturally creates authentic 6-for-6 or 8-for-8 nights
    gameFtp = Math.max(0.20, Math.min(1.0, gameFtp));

    let ftm = Math.round(fta * gameFtp);
    ftm = Math.max(0, Math.min(ftm, fta));

    // Defensive deltas vs baseline: positive = elite (debuffs offense), negative = bad (buffs offense)
    const perimDelta = oppDefProfile ? (oppDefProfile.perimeterDef - 70) : 0;
    const intDelta   = oppDefProfile ? (oppDefProfile.interiorDef  - 70) : 0;
    const blkDelta   = oppDefProfile ? (oppDefProfile.block        - 65) : 0;

    // 🏀 THREE POINTERS (The Splash Revolution)
    let fgPts = Math.max(0, ptsTarget - ftm);
    const tpComposite = (tp * 1.4 + oiq * 0.02) / 1.1;

    // 1. Base Curve: flattened to 1.7 to let role players breathe
    let threePointRate = Math.pow(Math.max(0, tpComposite / 100), 2.4);

    // 2. Hub Bonus: full bonus restored for stars
    if (share > 0.14 && drb > 45) {
      threePointRate += (share - 0.14) * (drb / 100) * 0.5;
    }

    // 3. League Volume Boost: 1.38 — middle class keeps volume, team totals pulled to ~38-42
    // 🔥 Smarter League Volume (targets 20–60 instead of global inflation)
if (tpComposite >= 20 && tpComposite <= 60) {
  const t = (tpComposite - 20) / 40;
  threePointRate *= 1.20 + (t * 0.30);
} else {
  threePointRate *= 1.08; // light global baseline
}
    // Wemby Effect: high interior D chases them out to the 3PT line
    // Jrue Effect: high perimeter D smothers the 3PT line
    threePointRate += intDelta  * 0.003;
    threePointRate -= perimDelta * 0.003;

    // Realism caps: Curry (>85) at 0.39 → ~12 3PA; good shooters capped at 0.40 (was 0.45)
    const personalCap =
      tpComposite > 92 ? 0.40 :   // 🔒 HARD CAP Curry (~11–12 3PA max)
      tpComposite > 85 ? 0.30 :   // elite shooters
      tpComposite > 78 ? 0.30 :
      tpComposite > 70 ? 0.30 :   // previously 0.38 → big boost for upper-middle
      tpComposite > 60 ? 0.40 :   // previously 0.36 → strong bump
      tpComposite > 50 ? 0.40 :   // previously 0.34 → noticeable jump
      tpComposite > 40 ? 0.40 :   // previously 0.32 → generous boost
      tpComposite > 30 ? 0.40 :
      tpComposite > 20 ? 0.20 :   // Giannis zone (slightly up for league avg)
      tpComposite > 10 ? 0.15 :
      0.04;

    // Apply night profile shift
    threePointRate = Math.max(0, threePointRate + nightProfile.shotDietShift);

    // Knobs: exhibition / rule-change modifiers (applied after personal cap)
    if (!knobs.threePointAvailable) {
      threePointRate = 0;
    } else {
      threePointRate = Math.min(personalCap, threePointRate * knobs.threePointRateMult);
    }

    const threePctBase = (weights.threePmBase || 0.30) + (tp / 100) * (weights.threePmScale || 0.15);
    // Perimeter D modifier: elite (+) tanks 3PT%, bad (-) boosts it. Clamp to sane range.
    const perimPenalty = Math.min(1.20, Math.max(0.75, 1.0 - perimDelta * 0.008));
    const threePctEffective = Math.max(0.05, threePctBase * nightProfile.efficiencyMult * perimPenalty * knobs.efficiencyMultiplier);

    // Calculate 2PT efficiency
    const isIn = tp < 40;
    const eff2 = isIn
      ? ins * 0.45 + dnk * 0.50 + fg * 0.05
      : ins * 0.10 + dnk * 0.05 + fg * 0.85;
    const pct2Raw = 0.34 + (eff2 / 100) * 0.28;
    const pct2 = Math.max(0.28, Math.min(0.72, pct2Raw * nightProfile.efficiencyMult * knobs.efficiencyMultiplier * getVariance(1.0, 0.08)));

    // 🎲 Attributes-Based Volume (calculated from rate, not makes)
    // league3PAMult applied HERE — after the cap — so it actually scales attempts instead of being swallowed
    let threePa = Math.round((estimatedFga * threePointRate) * (weights.league3PAMult || 1.5) * getVariance(1.0, 0.22));

    // Integer Wobble: -2 to +2 to break robot cycles
    if (threePa > 0 || threePointRate > 0.08) {
      threePa += Math.floor(Math.random() * 5) - 2;
    }
    threePa = Math.max(0, threePa);

    // Calculate makes
    let threePm = Math.round(threePa * threePctEffective * getVariance(1.0, 0.12));
    threePm = Math.min(threePm, threePa, Math.floor(fgPts / 3));

    // Loose shaver: allow record-breaking nights (13+ makes) but taper slightly
    if (threePm >= 13 && Math.random() < 0.40) {
      threePm = Math.max(12, threePm - Math.floor(Math.random() * 2));
    }

    // Two Pointers
    const twoPts = Math.max(0, fgPts - (threePm * 3));
    const twoPm = Math.floor(twoPts / 2);

    // Add any odd leftover point to Free Throws to keep the math/team score perfectly balanced
    if (twoPts % 2 !== 0) {
      ftm += 1;
      fta = Math.max(fta, ftm);
    }

    const maxTwoPa = Math.max(twoPm, Math.round(estimatedFga) - threePa);
    const twoPa = Math.max(twoPm, Math.min(maxTwoPa, Math.round(twoPm / Math.max(0.44, pct2))));

    // Shot Locations
    let wAtRim    = Math.max(0.1, hgt * 2.0 + stre * 0.3 + dnk * 0.3 + oiq * 0.2);
    let wLowPost  = Math.max(0.1, hgt * 1.0 + stre * 0.6 + spd * 0.2 + ins * 1.0 + oiq * 0.4);
    let wMidRange = Math.max(0.1, fg  * 1.0 + stre * 0.2 + oiq * 0.5);

    // Interior D modifier: Wemby (elite) scares them out; Wizards (bad) open the door
    wAtRim   *= Math.min(1.30, Math.max(0.40, 1.0 - intDelta * 0.020));
    wLowPost *= Math.min(1.25, Math.max(0.40, 1.0 - intDelta * 0.015));
    wMidRange *= Math.min(1.25, Math.max(0.60, 1.0 + intDelta * 0.015));

    const wTotal = wAtRim + wLowPost + wMidRange;

    const fgaAtRim    = Math.round(twoPa * (wAtRim    / wTotal));
    const fgaLowPost  = Math.round(twoPa * (wLowPost  / wTotal));
    const fgaMidRange = Math.max(0, twoPa - fgaAtRim - fgaLowPost);

    // Block modifier: elite tanks paint FG%, bad defenses give it a boost. Clamp to sane range.
    const blockPenalty = Math.min(1.15, Math.max(0.70, 1.0 - blkDelta * 0.008));
    const effAtRim    = ((dnk * 0.41 + 54) / 100) * blockPenalty;
    const effLowPost  = ((ins * 0.32 + 34) / 100) * blockPenalty;
    // Perimeter D also modifies mid-range efficiency in both directions
    const effMidRange = ((fg  * 0.32 + 42) / 100) * Math.min(1.10, Math.max(0.80, 1.0 - perimDelta * 0.005));

    const rawRim   = fgaAtRim   * effAtRim;
    const rawPost  = fgaLowPost  * effLowPost;
    const rawMid   = fgaMidRange * effMidRange;
    const rawTotal = rawRim + rawPost + rawMid || 1;

    const fgAtRim    = Math.min(fgaAtRim,   Math.round(twoPm * (rawRim  / rawTotal)));
    const fgLowPost  = Math.min(fgaLowPost,  Math.round(twoPm * (rawPost / rawTotal)));
    const fgMidRange = Math.max(0, twoPm - fgAtRim - fgLowPost);

    const ba = Math.round((fgaAtRim + fgaLowPost) * getVariance(0.06, 0.02));

    const pts = twoPm * 2 + threePm * 3 + ftm;

    return {
      playerId: p.internalId,
      name:     p.name,
      min: playerMinutes[i],
      sec: Math.floor((playerMinutes[i] % 1) * 60),
      pts,
      fgm: twoPm + threePm,
      fga: Math.max(twoPm + threePm, twoPa + threePa),
      threePm,
      threePa: Math.max(threePm, threePa),
      ftm,
      fta: Math.max(ftm, fta),
      reb: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0,
      tov: 0, pf: 0,
      pm: 0,
   gs:       starters.includes(p) ? 1 : 0,
      gp:       1,
      gameScore: 0,
      _nightOrbMult,
      _nightDrbMult,
      _nightAssistMult,
      _nightStlMult,
      _nightBlkMult,
      _nightBallCtrl,
      fgAtRim,   fgaAtRim,
      fgLowPost, fgaLowPost,
      fgMidRange, fgaMidRange,
      ba,
    };
  });

  // ── Turnovers ─────────────────────────────────────────────────────────
  // Usage-power formula: eliminates flat constants that were washing out usage signal.
  // Math.pow(usageProxy, 1.4) + 10 → star (30% usage) gets ~3.5-4 TOV, bench gets ~0.5-1.
  // Previously: usageProxy * 4 + constants gave everyone base ~140, ratio only 1.6:1 → all capped at 2.
  // Steal/pass pressure: positive = elite (more TOV), negative = bad defense (fewer TOV)
  const stealPressure = oppDefProfile ? (oppDefProfile.steal + oppDefProfile.passPerception - 130) / 15 : 0;
  const LEAGUE_AVG_TOV = Math.round(Math.max(10, 14 + stealPressure) * (48 + otCount * 5) / 48);
// was 13 — bumps team avg from 12 to 14-15
  const tovFactors = rotation.map((_, i) => {
    const usageProxy = totalScoringPotential > 0
      ? (scoringPotentials[i] / totalScoringPotential) * 100
      : 5;
    return Math.pow(Math.max(1, usageProxy), 1.2) + 10;
  });
  const totalTovFactor = tovFactors.reduce((a, b) => a + b, 0) || 1;
  rotation.forEach((_, i) => {
    const share = tovFactors[i] / totalTovFactor;
    const ballCtrl = playerStats[i]._nightBallCtrl ?? 1.0;
    playerStats[i].tov = Math.max(0, Math.round(LEAGUE_AVG_TOV * share * getVariance(1.0, 0.18) / ballCtrl));
  });

  // ── Cleanup ───────────────────────────────────────────────────────────
  playerStats.forEach(p => {
    p.threePa = Math.max(p.threePm, p.threePa);
    p.fga     = Math.max(p.fgm, p.fga);
    p.fta     = Math.max(p.ftm, p.fta);
    p.gameScore = p.pts + p.reb + p.ast + p.stl + p.blk
                  - p.tov - p.pf * 0.5 - (p.fga - p.fgm) - (p.fta - p.ftm) / 2;
  });

  return playerStats;
}
