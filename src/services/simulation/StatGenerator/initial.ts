import { NBAPlayer as Player, NBATeam as Team } from '../../../types';
import { PlayerGameStats } from '../types';
import { MinutesPlayedService } from '../MinutesPlayedService';
import { getScaledRating, R } from './helpers';
import { getVariance } from '../utils';
import { getNightProfile } from './nightProfile';
import { SimulatorKnobs, KNOBS_DEFAULT } from '../SimulatorKnobs';
import { playThroughInjuriesFactor, injurySeverityLevel, minutesRestrictionFactor } from '../playThroughInjuriesFactor';
import { generateGamePlan } from '../GamePlan';
import { getGameplan } from '../../../store/gameplanStore';

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
  knobs: SimulatorKnobs = KNOBS_DEFAULT,
  scoringBiases?: Map<string, { ptsMult: number; effMult: number }>
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
    knobs.playThroughInjuries ?? 0,
  );

  let rotation = rotResult.players;

  // GM's saved gameplan — promote saved starters into slots 0-4 if they're healthy
  // and already in the computed rotation. Displaced starters fall to bench order.
  const savedPlan = overridePlayers ? null : getGameplan(team.id);
  if (savedPlan?.starterIds?.length === 5) {
    const idToPlayer = new Map(rotation.map(p => [p.internalId, p]));
    const savedStarters = savedPlan.starterIds
      .map(id => idToPlayer.get(id))
      .filter((p): p is Player => !!p);
    if (savedStarters.length === 5) {
      const startersSet = new Set(savedStarters.map(p => p.internalId));
      const bench = rotation.filter(p => !startersSet.has(p.internalId));
      rotation = [...savedStarters, ...bench];
    }
  }

  if (rotation.length === 0) return [];

  const starters = rotation.slice(0, 5);

  // ── Minute allocation ──────────────────────────────────────────────────────
  let playerMinutes: number[];
  const overtimeDuration = knobs.overtimeDuration ?? 5;
  const numQuarters = knobs.numQuarters ?? 4;
  const regulationLength = knobs.quarterLength * numQuarters;
  const totalMinuteBudget = (regulationLength + otCount * overtimeDuration) * 5;

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
      rotation, season, lead, otCount, mpgTarget, !!knobs.isPlayoffs, knobs.quarterLength, overtimeDuration, numQuarters
    );
    playerMinutes = minutes;

    // Apply GM's saved minute overrides (renormalized so team still hits 240).
    // We only override players the GM actually set — others keep their computed value.
    if (savedPlan?.minuteOverrides && Object.keys(savedPlan.minuteOverrides).length > 0) {
      const overridden = rotation.map((p, i) => {
        const v = savedPlan.minuteOverrides![p.internalId];
        return typeof v === 'number' ? v : playerMinutes[i];
      });
      const sum = overridden.reduce((a, b) => a + b, 0) || 1;
      const target = totalMinuteBudget;
      playerMinutes = overridden.map(m => m * (target / sum));
    }
  }

  // ── GamePlan: per-game role lottery (stars stable, bench volatile) ─────────
  // ptsMult and minutesMult are correlated but not identical; both normalize to mean=1.0.
  const gamePlan = generateGamePlan(rotation.length);

  // Apply minutes multiplier now, re-normalize to keep team total exact.
  // Also apply injury minutes restriction: day-to-day players lose ~12%, significant injuries ~40%.
  const _ptiLevel = knobs.playThroughInjuries ?? 0;
  playerMinutes = playerMinutes.map((m, i) => {
    const injGames = rotation[i]?.injury?.gamesRemaining ?? 0;
    const minRestriction = injGames > 0 && _ptiLevel > 0
      ? minutesRestrictionFactor(Math.min(injurySeverityLevel(injGames), _ptiLevel))
      : 1.0;
    // Skip minutesMult for flat-minute games (All-Star, Celebrity, Rising Stars) —
    // the point is even distribution; variance would skew KAT to 40 min.
    const minMult = knobs.flatMinutes ? 1.0 : gamePlan.minutesMult[i];
    return Math.max(1, m * minMult * minRestriction);
  });
  const actualMinTotal = playerMinutes.reduce((a, b) => a + b, 0) || 1;
  playerMinutes = playerMinutes.map(m =>
    m * (totalMinuteBudget / actualMinTotal)
  );

  // Hard per-player cap: no player can exceed 48 min (reg) or 53/58 (OT).
  // Short-handed teams (< 9 players): tighter cap so role players don't marathon 48 min
  // when the star and 2 others draw high minutesMult. E.g. 8 players → max ~41 min each.
  const perPlayerMax = rotation.length < 9
    ? Math.min(42 + otCount * overtimeDuration, Math.floor((totalMinuteBudget / rotation.length) * 1.35))
    : regulationLength + otCount * overtimeDuration;
  for (let iter = 0; iter < 4; iter++) {
    if (!playerMinutes.some(m => m > perPlayerMax + 0.01)) break;
    playerMinutes = playerMinutes.map(m => Math.min(perPlayerMax, m));
    const cappedTotal = playerMinutes.reduce((a, b) => a + b, 0) || 1;
    playerMinutes = playerMinutes.map(m => m * (totalMinuteBudget / cappedTotal));
  }

  // ── Rating-floor helper (protects celebrity/mock players from 0-stat lines) ──
  const rFloor = knobs.ratingFloor;
  const rHelper = (p: Player, k: string) => Math.max(rFloor, R(p, k, season));

  // ── Scoring Potential ──────────────────────────────────────────────────
  const ptiLevel = knobs.playThroughInjuries ?? 0;
  const scoringPotentials = rotation.map((p, i) => {
    const oiq = rHelper(p, 'oiq'), drb = rHelper(p, 'drb'), ins = rHelper(p, 'ins');
    const fg  = rHelper(p, 'fg'),  tp  = rHelper(p, 'tp'),  dnk = rHelper(p, 'dnk');
    const spd = rHelper(p, 'spd'), hgt = rHelper(p, 'hgt');

    const usage = (ins * 0.23 + dnk * 0.15 + fg * 0.15 + tp * 0.15 + spd * 0.08 + hgt * 0.08 + drb * 0.08 + oiq * 0.08) * playerMinutes[i];
    const inside  = ins * 0.6 + dnk * 0.4;
    const outside = fg  * 0.5 + tp  * 0.5;
    const skill   = (Math.max(inside, outside) * 1.5 + Math.min(inside, outside) * 0.5) / 2;
    const raw = Math.pow(usage * (skill / 100), 1.25);

    // Structural taper: softens star concentration. GamePlan handles per-game variance.
    const SLOT_SCORE_MULT = [1.0, 0.88, 0.76, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    const slotMult = SLOT_SCORE_MULT[i] ?? 1.0;

    // Play-through-injuries: reduce performance for players with active injuries.
    // The effective penalty = min(injury severity, team's playThroughInjuries setting).
    const injGames = p.injury?.gamesRemaining ?? 0;
    if (injGames > 0 && ptiLevel > 0) {
      const severity  = injurySeverityLevel(injGames);
      const effective = Math.min(severity, ptiLevel);
      return raw * slotMult * playThroughInjuriesFactor(effective);
    }
    return raw * slotMult;
  });
  const totalScoringPotential = scoringPotentials.reduce((a, b) => a + b, 0);

  // ── Points Distribution ────────────────────────────────────────────────
  let teamBonusBucket = 0;
  const initialTargets = rotation.map((p, i) => {
    const share    = scoringPotentials[i] / totalScoringPotential;
    // GamePlan ptsMult shifts tonight's distribution (bench eruption, 2nd-option takeover, etc.)
    // User's Scoring Options override (Coaching → Preferences) applies via scoringBiases:
    // promoted players get +pts, demoted −pts, by slot-distance delta.
    const userPtsBias = scoringBiases?.get(p.internalId)?.ptsMult ?? 1;
    let rawTarget  = adjustedScore * share * gamePlan.ptsMult[i] * userPtsBias;
    if (rawTarget > 27) {
      const excess      = rawTarget - 27;
      const shavedPoints = excess * 0.60;
      teamBonusBucket  += shavedPoints;
      rawTarget          = 27 + (excess - shavedPoints);
    }
    return { rawTarget, share };
  });

  // ── Pass 1: compute ptsTargets with nightProfile, then normalize to adjustedScore ──
  // nightProfile boosts individuals asymmetrically (EXPLOSION 1.5×), breaking the sum.
  // Normalizing BEFORE computing shooting stats eliminates the 0-49 FT reconciliation bug.
  // Per-player cap: 65 normally, 78 on EXPLOSION nights (ptsTargetMult >= 1.45).
  // Normal TORCH tops at ~35 × 1.22 = 43 — nowhere near 65 — so this gated raise
  // only affects EXPLOSION, leaving league averages intact.
  const pass1 = rotation.map((p, i) => {
    let pts = initialTargets[i].rawTarget;
    const share = initialTargets[i].share;
    if (pts < 28) {
      const bonusShare = (1 - share) / (rotation.length - 1);
      pts += teamBonusBucket * bonusShare;
    }
    const np = getNightProfile(p, season, lead, isWinner, share, oppDefProfile);
    const _gpElev = gamePlan.ptsMult[i];
    const _dampF  = _gpElev > 1.55 ? Math.max(0.50, 1.55 / _gpElev) : 1.0;
    const _nightM = 1.0 + (np.ptsTargetMult - 1.0) * _dampF;
    const ptsCap  = np.ptsTargetMult >= 1.45 ? 78 : 65;
    return { rawPts: Math.min(ptsCap, Math.max(0, Math.round(pts * _nightM))), np, share };
  });
  const rawPtsSum   = pass1.reduce((s, r) => s + r.rawPts, 0) || 1;
  const normScale   = adjustedScore / rawPtsSum;
  // Protect EXPLOSION players from normalization shrinkage — otherwise a 67-pt star
  // in a 170-pt raw sum gets clipped to 51 when team scores 130. Redistribute the
  // deficit across non-explosion players instead, letting the hot star keep his pts.
  const isExp = (np: { ptsTargetMult: number }) => np.ptsTargetMult >= 1.45;
  const protectedSum = pass1.filter(r => isExp(r.np)).reduce((s, r) => s + r.rawPts, 0);
  const needsProtection = protectedSum > 0 && normScale < 1;
  const othersSum      = rawPtsSum - protectedSum;
  const othersTarget   = Math.max(1, adjustedScore - protectedSum);
  const othersScale    = othersSum > 0 ? Math.min(1.0, othersTarget / othersSum) : 1;
  const finalPtsTargets = pass1.map(r => {
    const ptsCap = isExp(r.np) ? 78 : 65;
    if (needsProtection && isExp(r.np)) {
      return Math.min(ptsCap, Math.max(0, Math.round(r.rawPts)));
    }
    const scale = needsProtection ? othersScale : normScale;
    return Math.min(ptsCap, Math.max(0, Math.round(r.rawPts * scale)));
  });

  // ── Build Per-Player Stat Lines ────────────────────────────────────────
  const playerStats: PlayerGameStats[] = rotation.map((p, i) => {
    const ptsTarget    = finalPtsTargets[i];
    const { np: nightProfile, share } = pass1[i];
    const _nightOrbMult   = nightProfile.orbMult;
    const _nightDrbMult   = nightProfile.drbMult;
    const _nightAssistMult = nightProfile.assistMult * gamePlan.astMult[i];
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

    // Volume-sticky FGA — anchor to BASELINE pts (pre-night-modifier) so a brickfest
    // doesn't shrink shot volume. Real NBA: a 12-pt cold game = ~20 FGA at 20% FG,
    // not 11 FGA at 36% FG. By dividing finalPts by ptsTargetMult we recover the
    // pre-night anchor (the share-derived baseline this player was supposed to score),
    // then fgaMult acts as a true volume modifier (~1.0 baseline, >1 chucker, <1 deferring).
    const ptm = Math.max(0.05, nightProfile.ptsTargetMult);
    const baselinePts = ptsTarget / ptm;
    // Minutes-scaled FGA floor — kills the "Brunson 2-of-6 brickfest" pathology.
    // Even a star's worst real cold game is ~4-of-20 over 35 mins (~0.57 FGA/min).
    // Floor at 0.40 FGA/min: starter 35 mins → 14 FGA min, bench 15 mins → 6 FGA.
    // Defer/passive archetypes still allowed (fgaMult < 0.85 partially overrides).
    const fgaFloor = Math.floor(playerMinutes[i] * 0.40 * Math.max(0.65, nightProfile.fgaMult));
    const estimatedFga = Math.max(fgaFloor, (baselinePts / 1.1) * nightProfile.fgaMult);
    // Anchor fta to estimatedFga (shot volume), NOT ptsTarget. Real NBA: FT trips are
    // per-attempt — every shot has some ~baseFtRate chance of drawing a foul. Anchoring
    // to ptsTarget let star-night pts inflation multiply through baseFtRate × ftaMult ×
    // ftAggression and produced 17-FTA-on-3-FGA outliers (Edwards line) when fgPts =
    // ptsTarget − ftm collapsed. ftAggression / ftaMult still scale the night profile.
    const ftaMultRaw = Number.isFinite(gamePlan.ftaMult[i]) ? gamePlan.ftaMult[i] : 1.0;
    const ftAgg = Number.isFinite(nightProfile.ftAggression) ? nightProfile.ftAggression : 1.0;
    let fta = Math.round(estimatedFga * baseFtRate * ftAgg * ftaMultRaw * getVariance(1.0, 0.18));

    // Floor: every active scorer draws at least some contact
    fta = Math.max(Math.round(ptsTarget * 0.04), fta);

    // Tight wobble: -1 to +1
    if (fta > 1) fta += Math.floor(Math.random() * 3) - 1;
    fta = Math.max(0, fta);

    // Hard per-player cap FTA/FGA ≤ 2.0 — even an outlier whistle-bait night maxes here
    // (real NBA ceiling for an Embiid/Giannis trip-fest ≈ 2.0 FT per FG). Plus a NaN guard.
    const ftaCeil = Math.max(2, Math.round(estimatedFga * 2.0));
    fta = Math.min(fta, ftaCeil);
    if (!Number.isFinite(fta)) fta = 0;

    // TRUE BELL CURVE FT%: An 80% shooter should occasionally shoot 60% or 100% in a single game.
    // ftSkill nudges % up on hot nights (Torch: +12%) and down on cold nights (Brickfest: -18%).
    const ftpBase = (ft / 100) * 0.50 + 0.42;
    let gameFtp = ftpBase * nightProfile.ftSkill * getVariance(1.0, 0.15) * (1.0 + (nightProfile.efficiencyMult - 1.0) * 0.2) * (knobs.ftEfficiencyMult ?? 1.0);

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

    // Apply night profile diet shift — pure shooters (tp>75) already live on the arc.
    // Their torch expression should be better makes, not more attempts.
    // For them, clamp diet shift to near-zero; the efficiency path handles the rest.
    const effectiveDietShift = tp > 75 ? Math.min(0.015, nightProfile.shotDietShift) : nightProfile.shotDietShift;
    threePointRate = Math.max(0, threePointRate + effectiveDietShift);

    // Knobs: exhibition / rule-change modifiers (applied after personal cap)
    if (!knobs.threePointAvailable) {
      threePointRate = 0;
    } else {
      threePointRate = Math.min(personalCap, threePointRate * knobs.threePointRateMult);
    }

    // Bad-shooter floor penalty: players with tp < 50 get a downward correction
    // so Giannis (tp≈20) shoots ~20% not 33%, without touching league average.
    // Each tp point below 50 costs 0.45pp — max ~22pp reduction at tp=0.
    const tpFloorPenalty = tp < 50 ? (50 - tp) * 0.003 : 0;
    // Mid-elite shooter bump: tp 60-80 (Klay/MPJ/Duncan Robinson tier) gets a small efficiency lift.
    // Not Curry's tier (tp>80), not the whole league.
    const tierEfficiencyBonus = (tp >= 60 && tp < 80) ? 0.025 : 0;
    const threePctBase = Math.max(0.05,
      (weights.threePmBase ?? 0.31) + (tp / 100) * (weights.threePmScale ?? 0.13) - tpFloorPenalty + tierEfficiencyBonus
    );
    // Perimeter D modifier: elite (+) tanks 3PT%, bad (-) boosts it. Clamp to sane range.
    const perimPenalty = Math.min(1.20, Math.max(0.75, 1.0 - perimDelta * 0.008));
    const userEffBias = scoringBiases?.get(p.internalId)?.effMult ?? 1;

    // 4-point line: NBA-calibrated as strategic, low-volume, high-skill shots.
    // PBA 4PT rates are a reference floor; NBA ratings get a slightly higher
    // skill curve while distance still suppresses efficiency.
    let fourPa = 0;
    let fourPm = 0;
    if (knobs.fourPointAvailable) {
      const fourPropensity = Math.pow(Math.max(0, (tp - 52) / 48), 1.45);
      const fourPointRate = Math.min(0.105, (0.006 + fourPropensity * 0.085) * (knobs.fourPointRateMult ?? 1));
      fourPa = Math.round(estimatedFga * fourPointRate * getVariance(1.0, 0.28));
      if (tp < 58 && Math.random() < 0.65) fourPa = 0;

      if (fourPa > 7) {
        let softCapped = 7;
        for (let a = 0; a < fourPa - 7; a++) {
          if (Math.random() < 0.22) softCapped++;
        }
        fourPa = softCapped;
      }

      const naturalFourVol = tp > 90 ? 5 : tp > 82 ? 4 : tp > 72 ? 3 : 2;
      const fourVolDecay = fourPa > naturalFourVol
        ? Math.max(0.58, 1.0 - (fourPa - naturalFourVol) * 0.055)
        : 1.0;
      const fourPctBase = Math.max(0.16, Math.min(0.35,
        0.145 + tp * 0.00165 + (tp >= 88 ? 0.015 : 0) - (tp < 60 ? (60 - tp) * 0.0015 : 0)
      ));
      const fourPctEffective = Math.max(0.08,
        fourPctBase * nightProfile.efficiencyMult * gamePlan.effMult[i] * userEffBias * perimPenalty * knobs.efficiencyMultiplier * (knobs.fourPointEfficiencyMult ?? 1.0) * fourVolDecay
      );
      fourPm = Math.round(fourPa * fourPctEffective * getVariance(1.0, 0.34));
      fourPm = Math.max(0, Math.min(fourPm, fourPa, Math.floor(fgPts / 4)));
      fgPts = Math.max(0, fgPts - fourPm * 4);
    }

    // 🎲 Attributes-Based Volume (calculated from rate, not makes)
    // league3PAMult applied HERE — after the cap — so it actually scales attempts instead of being swallowed
    let threePa = Math.round((Math.max(0, estimatedFga - fourPa) * threePointRate) * (weights.league3PAMult || 1.5) * getVariance(1.0, 0.22));

    // Integer Wobble: -2 to +2 to break robot cycles (only when already taking attempts)
    if (threePa > 0) {
      threePa += Math.floor(Math.random() * 5) - 2;
    }
    threePa = Math.max(0, threePa);

    // Soft cap: no hard ceiling but each attempt above 16 has only 30% survival.
    // Allows Klay/Curry torch nights at 18-20+ but makes it very rare.
    if (threePa > 16) {
      let softCapped = 16;
      for (let a = 0; a < threePa - 16; a++) {
        if (Math.random() < 0.30) softCapped++;
      }
      threePa = softCapped;
    }

    // Diminishing efficiency: high-volume 3PA costs accuracy above the player's natural range.
    // Every attempt above naturalVol reduces hit rate by 2.5%.
    // MPJ at 15 3PA (natural vol 8): 7 extra × 2.5% = −17.5% → shoots ~28% not 38%.
    // Curry at 15 3PA (natural vol 10): 5 extra × 2.5% = −12.5% → still ~38% (high base).
    const naturalVol = tp > 85 ? 11 : tp > 70 ? 9 : tp > 60 ? 8 : tp > 50 ? 6 : 4;
    const volDecay = threePa > naturalVol
      ? Math.max(0.55, 1.0 - (threePa - naturalVol) * 0.018)
      : 1.0;

    // User's Scoring Options override: demoted players shoot slightly more efficient,
    // promoted players slightly less (pushed past their comfort usage). Applied to
    // both 3PT and 2PT effective percentages so it shows up as FG% swing.
    const threePctEffective = Math.max(0.04,
      threePctBase * nightProfile.efficiencyMult * gamePlan.effMult[i] * userEffBias * perimPenalty * knobs.efficiencyMultiplier * (knobs.threePointEfficiencyMult ?? 1.0) * volDecay
    );

    // Calculate 2PT efficiency
    const isIn = tp < 40;
    const eff2 = isIn
      ? ins * 0.45 + dnk * 0.50 + fg * 0.05
      : ins * 0.10 + dnk * 0.05 + fg * 0.85;
    const pct2Raw = 0.34 + (eff2 / 100) * 0.28;
    // Rim runners (isIn) are mechanically consistent — lower variance.
    // Perimeter players' midrange is shot-creation dependent — wider swings.
    const pct2Sigma = isIn ? 0.10 : 0.20;
    const pct2 = Math.max(0.28, Math.min(0.72, pct2Raw * nightProfile.efficiencyMult * gamePlan.effMult[i] * userEffBias * knobs.efficiencyMultiplier * (knobs.interiorEffMult ?? 1.0) * getVariance(1.0, pct2Sigma)));

    // Calculate makes — wider variance (0.28 σ) allows real cold/hot nights:
    // Giannis 3/3 at 21% base: round(0.63 × N(1,0.28)) → 0 or 1 depending on roll.
    // Good shooters 10/10 at 38%: round(3.8 × N(1,0.28)) → 2–6 range realistically.
    let threePm = Math.round(threePa * threePctEffective * getVariance(1.0, 0.32));
    threePm = Math.max(0, Math.min(threePm, threePa, Math.floor(fgPts / 3)));

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

    const maxTwoPa = Math.max(twoPm, Math.round(estimatedFga) - threePa - fourPa);
    // Floor lowered 0.44 → 0.30 so cold-night low pct2 actually drives more 2PA volume
    // (Brunson 4/20 brickfest pattern). At pct2 ≥ 0.44 the floor never activated; below it,
    // the old 0.44 cap was throttling volume. Real cold-game FG% lives in the 0.25–0.40 range.
    const twoPa = Math.max(twoPm, Math.min(maxTwoPa, Math.round(twoPm / Math.max(0.30, pct2))));

    // Shot Locations
    let wAtRim    = Math.max(0.1, hgt * 2.0 + stre * 0.3 + dnk * 0.3 + oiq * 0.2);
    let wLowPost  = Math.max(0.1, hgt * 1.0 + stre * 0.6 + spd * 0.2 + ins * 1.0 + oiq * 0.4);
    let wMidRange = Math.max(0.1, fg  * 1.0 + stre * 0.2 + oiq * 0.5);

    // Interior D modifier: Wemby (elite) scares them out; Wizards (bad) open the door
    wAtRim   *= Math.min(1.30, Math.max(0.40, 1.0 - intDelta * 0.020));
    wLowPost *= Math.min(1.25, Math.max(0.40, 1.0 - intDelta * 0.015));
    wMidRange *= Math.min(1.25, Math.max(0.60, 1.0 + intDelta * 0.015));

    // Rule-change knobs (commissioner settings → shot location shift)
    wAtRim   *= (knobs.rimRateMult   ?? 1.0);
    wLowPost *= (knobs.lowPostRateMult ?? 1.0);
    wMidRange *= (knobs.midRangeRateMult ?? 1.0);

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

    const pts = twoPm * 2 + threePm * 3 + fourPm * 4 + ftm;

    return {
      playerId: p.internalId,
      name:     p.name,
      min: playerMinutes[i],
      sec: Math.floor((playerMinutes[i] % 1) * 60),
      pts,
      fgm: twoPm + threePm + fourPm,
      fga: Math.max(twoPm + threePm + fourPm, twoPa + threePa + fourPa),
      threePm,
      threePa: Math.max(threePm, threePa),
      fourPm,
      fourPa: Math.max(fourPm, fourPa),
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
  const LEAGUE_AVG_TOV = Math.round(Math.max(10, 14 + stealPressure) * (regulationLength + otCount * overtimeDuration) / 48 * (knobs.tovMult ?? 1.0));
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
    p.fourPa  = Math.max(p.fourPm ?? 0, p.fourPa ?? 0);
    p.fga     = Math.max(p.fgm, p.fga);
    p.fta     = Math.max(p.ftm, p.fta);
    p.gameScore = p.pts + p.reb + p.ast + p.stl + p.blk
                  - p.tov - p.pf * 0.5 - (p.fga - p.fgm) - (p.fta - p.ftm) / 2;
  });

  return playerStats;
}
