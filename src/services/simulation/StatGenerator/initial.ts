import { NBAPlayer as Player, NBATeam as Team } from '../../../types';
import { PlayerGameStats } from '../types';
import { StarterService } from '../StarterService';
import { getScaledRating, R } from './helpers';
import { getVariance } from '../utils';

export function generateStatsForTeam(
  team: Team,
  players: Player[],
  totalScore: number,
  isWinner: boolean,
  lead: number,
  weights: Record<string, number> = {},
  season: number = 2025,
  overridePlayers?: Player[]
): PlayerGameStats[] {
  const rotation = StarterService.getRotation(team, players, lead, season, overridePlayers);
  if (rotation.length === 0) return [];

  const starters = rotation.slice(0, 5);

  // ── Minutes ────────────────────────────────────────────────────────────
  const minWeights   = rotation.map(p =>
    starters.includes(p) ? 30 + Math.random() * 10 : 10 + Math.random() * 15
  );
  const totalWeight  = minWeights.reduce((a, b) => a + b, 0);
  const playerMinutes = minWeights.map(w => (w / totalWeight) * 240);

  const rHelper = (p: Player, k: string) => R(p, k, season);

  // ── Scoring Potential ──────────────────────────────────────────────────
  const scoringPotentials = rotation.map((p, i) => {
    const oiq = rHelper(p, 'oiq'), drb = rHelper(p, 'drb'), ins = rHelper(p, 'ins');
    const fg  = rHelper(p, 'fg'),  tp  = rHelper(p, 'tp'),  dnk = rHelper(p, 'dnk');

    const usage = (oiq * 0.40 + drb * 0.30 + ins * 0.10 + fg * 0.10 + tp * 0.10) * playerMinutes[i];
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
    const variance = Math.random() < 0.04 ? getVariance(1.0, 0.45) : getVariance(1.0, 0.15);
    ptsTarget = Math.max(0, Math.round(ptsTarget * variance));

    const tp   = rHelper(p, 'tp'),   oiq  = rHelper(p, 'oiq'), ft   = rHelper(p, 'ft');
    const fg   = rHelper(p, 'fg'),   ins  = rHelper(p, 'ins'),  dnk  = rHelper(p, 'dnk');
    const hgt  = rHelper(p, 'hgt'),  stre = rHelper(p, 'stre'), spd  = rHelper(p, 'spd');
    const drb  = rHelper(p, 'drb');

    // Free Throws
    const drawingFoulsComposite = (hgt + spd + drb + dnk + oiq) / 5;
    const baseFtRate = 0.15 + (drawingFoulsComposite / 100) * 0.35;
    const estimatedFga = ptsTarget / 1.2;
    const fta  = Math.round(estimatedFga * baseFtRate * getVariance(1.0, 0.15));
    const ftp  = Math.min(0.95, (ft / 100) * 0.60 + 0.45);
    const ftm  = Math.max(0, Math.min(Math.round(fta * ftp * getVariance(1.0, 0.05)), fta));

    // Three Pointers
    let fgPts = Math.max(0, ptsTarget - ftm);
    const tpComposite   = (tp * 1.0 + oiq * 0.1) / 1.1;
    const pullUpTendency = 1.0 + ((oiq - 50) / 100) * 0.3;
    let threePointRate  = Math.pow(Math.max(0, tpComposite / 100), 1.1) * 0.60 * pullUpTendency;
    if      (tpComposite < 25) threePointRate *= 0.2;
    else if (tpComposite < 45) threePointRate *= 0.55;
    threePointRate = Math.min(0.75, threePointRate);

    const threePa  = Math.round(estimatedFga * threePointRate * getVariance(1.0, 0.1));
    let   threePm  = Math.round(
      threePa * ((weights.threePmBase || 0.30) + (tp / 100) * (weights.threePmScale || 0.15))
      * getVariance(1.0, 0.07)
    );
    threePm = Math.max(0, Math.min(threePm, threePa, Math.floor(fgPts / 3)));

    // Two Pointers
    const twoPts = Math.max(0, fgPts - threePm * 3);
    const twoPm  = Math.round(twoPts / 2);
    const isIn   = tp < 40;
    const eff2   = isIn
      ? ins * 0.45 + dnk * 0.50 + fg * 0.05
      : ins * 0.10 + dnk * 0.05 + fg * 0.85;
    const pct2   = 0.40 + (eff2 / 100) * 0.25;
    const twoPa  = Math.max(twoPm, Math.round(twoPm / Math.max(0.38, pct2)));

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
      fgAtRim,   fgaAtRim,
      fgLowPost, fgaLowPost,
      fgMidRange, fgaMidRange,
      ba,
    };
  });

  // ── Turnovers ─────────────────────────────────────────────────────────
  const LEAGUE_AVG_TOV = 13;

  rotation.forEach((p, i) => {
    const pss = rHelper(p, 'pss'), oiq = rHelper(p, 'oiq'), ins = rHelper(p, 'ins');
    const usageProxy = totalScoringPotential > 0
      ? (scoringPotentials[i] / totalScoringPotential) * 100
      : 5;
    const factor = (usageProxy * 4.0) + (ins * 0.5) + (pss * 1.0) + ((100 - oiq) * 1.0);
    // We can't use distributePie directly because it takes a factorFn, but we already have the factor
    // Let's just do it manually or adjust distributePie
  });

  // Actually, let's just use the original distributePie logic for TOV
  const factors = rotation.map((p, i) => {
    const pss = rHelper(p, 'pss'), oiq = rHelper(p, 'oiq'), ins = rHelper(p, 'ins');
    const usageProxy = totalScoringPotential > 0
      ? (scoringPotentials[i] / totalScoringPotential) * 100
      : 5;
    return (usageProxy * 4.0) + (ins * 0.5) + (pss * 1.0) + ((100 - oiq) * 1.0);
  });
  const totalFactor = factors.reduce((a, b) => a + b, 0) || 1;
  rotation.forEach((_, i) => {
    const share = factors[i] / totalFactor;
    playerStats[i].tov = Math.max(0, Math.round(LEAGUE_AVG_TOV * share * getVariance(1.0, 0.12)));
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
