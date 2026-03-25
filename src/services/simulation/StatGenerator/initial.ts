import { NBAPlayer as Player, NBATeam as Team } from '../../../types';
import { PlayerGameStats } from '../types';
import { StarterService } from '../StarterService';
import { getScaledRating, R } from './helpers';
import { getVariance } from '../utils';
import { getNightProfile } from './nightProfile';

export function generateStatsForTeam(
  team: Team,
  players: Player[],
  totalScore: number,
  isWinner: boolean,
  lead: number,
  weights: Record<string, number> = {},
  season: number = 2025,
  overridePlayers?: Player[],
  otCount: number = 0
): PlayerGameStats[] {
  const rotation = StarterService.getRotation(team, players, lead, season, overridePlayers);
  if (rotation.length === 0) return [];

  const starters = rotation.slice(0, 5);

  // ── Minutes ────────────────────────────────────────────────────────────
  // Real NBA tiers: starters ~32-38, 6th man ~22-28, 7th ~17-23, 8th ~11-17, 9th+ ~4-8
  const rHelper = (p: Player, k: string) => R(p, k, season);

  const BENCH_MINUTE_TIERS = [
    { base: 22, spread: 6 },  // 6th man: 22-28, avg 25
    { base: 17, spread: 6 },  // 7th man: 17-23, avg 20
    { base: 11, spread: 6 },  // 8th man: 11-17, avg 14
    { base: 4,  spread: 4 },  // 9th man: 4-8,   avg 6
    { base: 1,  spread: 3 },  // 10th+:   1-4,   avg 2.5
  ];

  const isBlowout    = Math.abs(lead) > 15;
  const isBigBlowout = Math.abs(lead) > 25;

  const minWeights = rotation.map((p, i) => {
    const endu = rHelper(p, 'endu');

    let baseMins: number;
    if (starters.includes(p)) {
      baseMins = isBigBlowout
        ? 30 + Math.random() * 4   // 30-34
        : isBlowout
        ? 33 + Math.random() * 3   // 33-36
        : 35 + Math.random() * 3;  // 35-38
      // Soft fatigue penalty: endu=10 (Wemby) → -4.5 mins; endu=40+ → no penalty
      const fatiguePenalty = endu < 40 ? (40 - endu) * 0.15 : 0;
      baseMins -= fatiguePenalty;
    } else {
      const bi = Math.min(i - 5, BENCH_MINUTE_TIERS.length - 1);
      const { base, spread } = BENCH_MINUTE_TIERS[bi];
      const blowoutBonus = isBigBlowout ? 8 : isBlowout ? 4 : 0;
      baseMins = base + Math.random() * spread + blowoutBonus;
      const fatiguePenalty = endu < 40 ? (40 - endu) * 0.10 : 0;
      baseMins -= fatiguePenalty;
    }

    return Math.max(1, baseMins);
  });

  // Hard clamp to game total — trim from starters first so JV's freed mins
  // stay in the bench, not flow back up to stars
  const TARGET = (48 + otCount * 5) * 5;
  let total = minWeights.reduce((a, b) => a + b, 0);
  const trimOrder = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]; // bench absorbs slack first, stars last
  let trimIdx = 0;
  while (total > TARGET && trimIdx < trimOrder.length) {
    const idx = trimOrder[trimIdx];
    if (idx < minWeights.length && minWeights[idx] > 4) {
      minWeights[idx] -= 1;
      total -= 1;
    } else {
      trimIdx++;
    }
  }

  const playerMinutes = minWeights.map(w => w); // already in real minutes, no ratio needed

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
    let rawTarget  = totalScore * share;
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
    const nightProfile = getNightProfile(p, season);
    ptsTarget = Math.max(0, Math.round(ptsTarget * nightProfile.ptsTargetMult));
    const _nightRebMult   = nightProfile.reboundMult;
    const _nightAssistMult = nightProfile.assistMult;
    const _nightDefEnergy = nightProfile.defensiveEnergy;
    const _nightBallCtrl  = nightProfile.ballControlMult;

    const tp   = rHelper(p, 'tp'),   oiq  = rHelper(p, 'oiq'), ft   = rHelper(p, 'ft');
    const fg   = rHelper(p, 'fg'),   ins  = rHelper(p, 'ins'),  dnk  = rHelper(p, 'dnk');
    const hgt  = rHelper(p, 'hgt'),  stre = rHelper(p, 'stre'), spd  = rHelper(p, 'spd');
    const drb  = rHelper(p, 'drb');

    // Free Throws
    const drawingFoulsComposite = (hgt + spd + drb + dnk + oiq) / 5;
    const foulMerchantFactor = Math.pow(drawingFoulsComposite / 100, 2.5);
    const baseFtRate = 0.04 + (foulMerchantFactor * 0.75);
    const estimatedFga = ptsTarget / 1.2;
    const fta  = Math.round(estimatedFga * baseFtRate * getVariance(1.0, 0.15));
    const ftpBase = Math.min(0.95, (ft / 100) * 0.60 + 0.45);
    const ftp = Math.max(0.30, Math.min(1.0, ftpBase * nightProfile.efficiencyMult));
    const ftm  = Math.max(0, Math.min(Math.round(fta * ftp * getVariance(1.0, 0.03)), fta));

    // Three Pointers
    let fgPts = Math.max(0, ptsTarget - ftm);
    const tpComposite   = (tp * 1.0 + oiq * 0.1) / 1.1;
    const pullUpTendency = 1.0 + ((oiq - 50) / 100) * 0.1;
    let threePointRate  = Math.pow(Math.max(0, tpComposite / 100), 0.65) * 0.61 * pullUpTendency;
    if      (tpComposite < 10) threePointRate *= 0.02;
    else if (tpComposite < 25) threePointRate *= 0.50;
    else if (tpComposite < 36) threePointRate *= 0.05; // Non-shooters (Ayton tp=29 → tpComp≈34) get near-zero 3PA
    else if (tpComposite < 45) threePointRate *= 0.70;
    // Personal ceiling: true elite (>85) capped at 0.42; specialists (>75) at 0.50; everyone else 0.65
    const personalCap = tpComposite > 85 ? 0.42 : tpComposite > 75 ? 0.50 : 0.65;
    threePointRate = Math.min(personalCap, Math.max(0, threePointRate + nightProfile.shotDietShift));

    const threePa  = Math.round(estimatedFga * threePointRate * getVariance(1.0, 0.1));
    const threePctBase = (weights.threePmBase || 0.30) + (tp / 100) * (weights.threePmScale || 0.15);
    const threePctEffective = Math.max(0.05, threePctBase * nightProfile.efficiencyMult);
    let   threePm  = Math.round(threePa * threePctEffective * getVariance(1.0, 0.04));
    threePm = Math.max(0, Math.min(threePm, threePa, Math.floor(fgPts / 3)));

    // Two Pointers
    const twoPts = Math.max(0, fgPts - threePm * 3);
    const twoPm  = Math.round(twoPts / 2);
    const isIn   = tp < 40;
    const eff2   = isIn
      ? ins * 0.45 + dnk * 0.50 + fg * 0.05
      : ins * 0.10 + dnk * 0.05 + fg * 0.85;
    const pct2Raw = 0.34 + (eff2 / 100) * 0.28;
    const pct2 = Math.max(0.28, Math.min(0.72, pct2Raw * nightProfile.efficiencyMult * getVariance(1.0, 0.08)));
    const twoPa  = Math.max(twoPm, Math.round(twoPm / Math.max(0.28, pct2)));

    // Shot Locations
    const wAtRim   = Math.max(0.1, hgt * 2.0 + stre * 0.3  + dnk * 0.3  + oiq * 0.2);
    const wLowPost = Math.max(0.1, hgt * 1.0 + stre * 0.6  + spd * 0.2  + ins * 1.0 + oiq * 0.4);
    const wMidRange = Math.max(0.1, fg  * 1.0 + stre * 0.2  + oiq * 0.5);
    const wTotal   = wAtRim + wLowPost + wMidRange;

    const fgaAtRim    = Math.round(twoPa * (wAtRim    / wTotal));
    const fgaLowPost  = Math.round(twoPa * (wLowPost  / wTotal));
    const fgaMidRange = Math.max(0, twoPa - fgaAtRim - fgaLowPost);

    const effAtRim    = (dnk * 0.41 + 54) / 100;
    const effLowPost  = (ins * 0.32 + 34) / 100;
    const effMidRange = (fg  * 0.32 + 42) / 100;

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
      _nightRebMult,
      _nightAssistMult,
      _nightDefEnergy,
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
 const LEAGUE_AVG_TOV = Math.round(16 * (48 + otCount * 5) / 48);
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
