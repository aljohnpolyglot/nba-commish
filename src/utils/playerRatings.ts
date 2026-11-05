import type { NBAGMPlayer, NBAPlayer as Player, DraftPick, NBATeam as Team, TransactionDto } from '../types';
import { convertTo2KRating } from './helpers';
import { activeClubDebuffs } from '../services/simulation/StatGenerator/helpers';
import {
    calculateOverallFromRating,
    getDisplayAge,
    getDisplayOverall,
    getDisplayPotential,
    getProspectDisplayPotential,
    isGeneratedDraftFill,
    resolveDisplayPotentialBbgm,
    resolvePotentialBbgm,
    estimatePotentialBbgm,
    pickPlayerRating,
} from '../store/playerRatingStore';

export {
    calculateOverallFromRating,
    getDisplayAge,
    getDisplayOverall,
    getDisplayPotential,
    getProspectDisplayPotential,
    isGeneratedDraftFill,
    resolveDisplayPotentialBbgm,
    resolvePotentialBbgm,
    estimatePotentialBbgm,
    pickPlayerRating,
};

const STRENGTH_DEBUFF_AMOUNTS = { heavy: 5, moderate: 3, mild: 1 } as const;

type TeamStrengthContext = {
    leaguePERAvg: number;
    teamPlayersByTeam: Map<number, Player[]>;
};

export function getTrainingFatigueRatingMultiplier(player: Pick<Player, 'trainingFatigue'> | any): number {
    const fatigue = Math.max(0, Math.min(100, Number(player?.trainingFatigue ?? 0)));
    return Math.max(0.85, 1 - fatigue / 200);
}

export const calculatePlayerOverallForYear = (player: NBAGMPlayer, year: number): number => {
    if (!player || !player.ratings || player.ratings.length === 0) return 50;
    const rating = [...player.ratings]
        .filter(r => Number(r?.season ?? 0) <= year)
        .sort((a, b) => Number(b?.season ?? 0) - Number(a?.season ?? 0))[0];
    if (!rating) return 50;
    return calculateOverallFromRating(rating);
};

export const calculatePlayerOverall = (player: NBAGMPlayer): number => {
    if (!player || !player.ratings || player.ratings.length === 0) return 50;
    const latestRating = player.ratings[player.ratings.length - 1];
    return calculateOverallFromRating(latestRating);
};
const teamStrengthCache = new Map<string, number>();

export const clearTeamStrengthCache = () => teamStrengthCache.clear();

function computeLeaguePERAvg(players: Player[]): number {
    let totalPer = 0;
    let count = 0;
    for (const player of players) {
        for (const season of player.stats ?? []) {
            if (season.playoffs || (season.gp ?? 0) <= 0) continue;
            const per = season.per ?? 0;
            if (per <= 0) continue;
            totalPer += per;
            count += 1;
        }
    }
    return count > 0 ? totalPer / count : 15;
}

export function buildTeamStrengthContext(players: Player[]): TeamStrengthContext {
    const teamPlayersByTeam = new Map<number, Player[]>();
    for (const player of players) {
        if (player.tid < 0 || (player.injury?.gamesRemaining ?? 0) > 0) continue;
        const existing = teamPlayersByTeam.get(player.tid);
        if (existing) existing.push(player);
        else teamPlayersByTeam.set(player.tid, [player]);
    }
    for (const teamPlayers of teamPlayersByTeam.values()) {
        teamPlayers.sort((a, b) => b.overallRating - a.overallRating);
    }
    return {
        leaguePERAvg: computeLeaguePERAvg(players),
        teamPlayersByTeam,
    };
}

export const calculateTeamStrength = (
    teamId: number,
    players: Player[],
    overridePlayers?: Player[],
    context?: TeamStrengthContext,
): number => {
    const teamPlayers = overridePlayers
        ? [...overridePlayers].sort((a, b) => b.overallRating - a.overallRating)
        : (context?.teamPlayersByTeam.get(teamId) ?? players
            .filter(p => p.tid === teamId && (!p.injury || p.injury.gamesRemaining <= 0))
            .sort((a, b) => b.overallRating - a.overallRating));

    const cacheKey = !overridePlayers
        ? `${teamId}-${teamPlayers.map(p => `${p.internalId}:${p.overallRating}:${Math.round(p.trainingFatigue ?? 0)}`).join('|')}`
        : null;
    if (cacheKey && teamStrengthCache.has(cacheKey)) {
        return teamStrengthCache.get(cacheKey)!;
    }

    if(teamPlayers.length === 0) return 40;

    const star1Ovr = teamPlayers[0].overallRating;
    const qualityCutoff = Math.max(star1Ovr - 20, 0);
    let qualityPool = teamPlayers.filter(p => p.overallRating >= qualityCutoff).slice(0, 10);
    if (qualityPool.length === 0) qualityPool = teamPlayers.slice(0, 10);

    const leaguePERAvg = context?.leaguePERAvg ?? computeLeaguePERAvg(players);

    const top8_2k = qualityPool.map(p => {
        const r = p.ratings?.[p.ratings.length - 1];
        let base = convertTo2KRating(p.overallRating, r?.hgt ?? 50, r?.tp);

        // Blend in current-season PER for qualified players (>10 GP, >12 MPG).
        // Finds the most recent non-playoff season with games played.
        const seasons = (p.stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0);
        if (seasons.length > 0) {
          const latest = seasons[seasons.length - 1] as any;
          const gp = latest.gp ?? 0;
          const mpg = gp > 0 ? (latest.min ?? 0) / gp : 0;
          if (gp > 10 && mpg > 12 && (latest.per ?? 0) > 0) {
            const perDelta = (latest.per as number) - leaguePERAvg;
            // Blend up to ±3 K2 points based on PER vs league avg (perDelta/5 = 3pts at +15 PER)
            base = Math.max(40, Math.min(99, base + Math.max(-3, Math.min(3, perDelta / 5))));
          }
        }

        base *= getTrainingFatigueRatingMultiplier(p);

        const severity = activeClubDebuffs.get(String(p.internalId));
        return severity ? Math.max(40, base - STRENGTH_DEBUFF_AMOUNTS[severity]) : base;
    });

    // Star-heavy weights, normalized to actual pool size.
    const BASE_WEIGHTS = [0.32, 0.22, 0.15, 0.10, 0.08, 0.06, 0.04, 0.03, 0.02, 0.01];
    const rawWeights = BASE_WEIGHTS.slice(0, top8_2k.length);
    const totalWeightRaw = rawWeights.reduce((a, b) => a + b, 0);
    const weights = rawWeights.map(w => w / totalWeightRaw);

    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < top8_2k.length; i++) {
        weightedSum += top8_2k[i] * weights[i];
        totalWeight += weights[i];
    }
    
    let baseStrength = weightedSum / totalWeight; 
    const bestPlayer = top8_2k[0];
    const secondBest = top8_2k.length > 1 ? top8_2k[1] : 70;
    
    let starAdjustment = 0;
    if (bestPlayer >= 94) starAdjustment += 4; 
    else if (bestPlayer >= 90) starAdjustment += 2; 
    else if (bestPlayer <= 85) starAdjustment -= 5; // Penalty for no true star (Fixes Nets/Hornets)
    
    if (bestPlayer >= 89 && secondBest >= 86) starAdjustment += 2.5; 
    
    let finalStrength = baseStrength + starAdjustment;
    finalStrength = (finalStrength - 85) * 1.6 + 85; // Stretch the scale for realism
    
    const result = Math.max(50, Math.min(99, Math.round(finalStrength)));

    if (cacheKey) {
        teamStrengthCache.set(cacheKey, result);
    }

    return result;
};

export function calculateDisplayTeamOverall(teamId: number, players: Player[], overridePlayers?: Player[]): number {
    const roster = (overridePlayers ?? players.filter(p => p.tid === teamId)).filter((player: any) => {
        if (player.status === 'Retired') return false;
        if (player.tid < 0) return false;
        return true;
    });
    const pool = roster
        .map(player => {
            const r = player.ratings?.[player.ratings.length - 1];
            return convertTo2KRating(player.overallRating ?? r?.ovr ?? 50, r?.hgt ?? 50, r?.tp);
        })
        .sort((a, b) => b - a)
        .slice(0, 10);
    if (pool.length === 0) return 50;

    const weights = [0.30, 0.22, 0.16, 0.10, 0.07, 0.05, 0.04, 0.03, 0.02, 0.01].slice(0, pool.length);
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    const weighted = pool.reduce((sum, rating, index) => sum + rating * weights[index], 0) / total;
    const starBonus = pool[0] >= 94 ? 3 : pool[0] >= 90 ? 2 : pool[0] < 83 ? -3 : 0;
    const coStarBonus = pool[0] >= 88 && pool[1] >= 86 ? 2 : 0;
    return Math.max(50, Math.min(99, Math.round(weighted + starBonus + coStarBonus)));
}

/**
 * Minutes-weighted team strength using each player's share of the configured
 * team-minute budget. Star compounding follows the actual star's minute share.
 */
export function calculateTeamStrengthWithMinutes(
  players: Player[],
  minutes: Record<string, number>,
  currentSeason?: number,
  proficiencyBoost = 0,
  playersOnCourt = 5,
): number {
  const active = players.filter(p => (minutes[p.internalId] ?? 0) > 0);
  if (active.length === 0) return 40;

  // Per-player 2K with debuffs + in-season PER adjustment
  const k2: Array<{ id: string; rating: number; mins: number; tp: number; pss: number; hgt: number; reb: number }> = active.map(p => {
    const r = p.ratings?.[p.ratings.length - 1];
    const base = convertTo2KRating(p.overallRating, r?.hgt ?? 50, r?.tp);
    const severity = activeClubDebuffs.get(String(p.internalId));
    let rating = severity ? Math.max(40, base - STRENGTH_DEBUFF_AMOUNTS[severity]) : base;

    // Blend in current-season PER once there are 10+ games of data.
    // perWeight ramps 0→1 from 10 to 30 games, then stays at 1.
    const seasonStats = currentSeason != null
      ? p.stats?.find(s => !s.playoffs && s.season === currentSeason)
      : p.stats?.filter(s => !s.playoffs && (s.gp ?? 0) > 0).at(-1);
    if (seasonStats && (seasonStats.gp ?? 0) >= 10) {
      const perWeight = Math.min(1, (seasonStats.gp - 10) / 20);
      const perDelta = Math.max(-6, Math.min(6, ((seasonStats.per ?? 15) - 15) / 10 * 6));
      rating = Math.max(40, rating + perDelta * perWeight);
    }

    rating = Math.max(40, rating * getTrainingFatigueRatingMultiplier(p));

    return {
      id: p.internalId, rating, mins: minutes[p.internalId] ?? 0,
      tp: r?.tp ?? 50, pss: r?.pss ?? 50, hgt: r?.hgt ?? 50, reb: r?.reb ?? 50,
    };
  });

  const maximumShare = 1 / Math.max(1, playersOnCourt);
  // Pure minutes-weighted average. Cap per-player share at one court slot so a
  // single iron-man can't fully define team strength.
  const totalMins = k2.reduce((s, x) => s + x.mins, 0) || 1;
  let baseStrength = 0;
  for (const x of k2) {
    const share = Math.min(maximumShare, x.mins / totalMins);
    baseStrength += x.rating * share;
  }
  // Renormalize after capping so the weights still sum to ~1
  const totalShare = k2.reduce((s, x) => s + Math.min(maximumShare, x.mins / totalMins), 0) || 1;
  baseStrength = baseStrength / totalShare;

  // Star compounding bonus — your best PLAYER (not best minutes), scaled by
  // their minute share so benching them kills the bonus too.
  const byRating = [...k2].sort((a, b) => b.rating - a.rating);
  const best   = byRating[0]?.rating ?? 70;
  const second = byRating[1]?.rating ?? 70;

  let starAdjustment = 0;
  if (best >= 94)      starAdjustment += 4;
  else if (best >= 90) starAdjustment += 2;
  else if (best <= 85) starAdjustment -= 5;            // missing-star penalty stands regardless
  if (best >= 89 && second >= 86) starAdjustment += 2.5;

  if (starAdjustment > 0 && byRating[0]) {
    starAdjustment *= Math.min(1, byRating[0].mins / 30);
  }

  // Spacing synergy — 3+ shooters (tp > 60) getting real minutes
  const spacers = k2.filter(x => x.tp > 60 && x.mins > 15).length;
  const spacingBonus = spacers >= Math.max(1, Math.ceil(playersOnCourt * 0.8))
    ? 3.5
    : spacers >= Math.max(1, Math.ceil(playersOnCourt * 0.6)) ? 2.0 : 0;

  // Playmaking synergy — elite passers (pss > 65) running the offense
  const playmakers = k2.filter(x => x.pss > 65 && x.mins > 20).length;
  const playmakingBonus = playmakers >= Math.max(1, Math.ceil(playersOnCourt * 0.4))
    ? 2.5
    : playmakers >= Math.max(1, Math.ceil(playersOnCourt * 0.2)) ? 1.5 : 0;

  // Rebounding synergy — bigs (hgt+reb composite > 62) crashing the boards
  const rebounders = k2.filter(x => (x.hgt * 2 + x.reb * 2) / 4 > 62 && x.mins > 12).length;
  const reboundingBonus = rebounders >= Math.max(1, Math.ceil(playersOnCourt * 0.8))
    ? 2.0
    : rebounders >= Math.max(1, Math.ceil(playersOnCourt * 0.6)) ? 1.0 : 0;

  let finalStrength = baseStrength + starAdjustment + spacingBonus + playmakingBonus + reboundingBonus + proficiencyBoost;
  finalStrength = (finalStrength - 85) * 1.6 + 85;
  return Math.max(50, Math.min(99, Math.round(finalStrength)));
}

export interface ProcessedStats {
    gp: number;
    ppg: string;
    rpg: string;
    apg: string;
    spg: string;
    bpg: string;
    fgPct: string;
    tpPct: string;
    ftPct: string;
}

export const processPlayerStats = (stats: any | undefined): ProcessedStats => {
    if (!stats || stats.gp === 0) {
        return { gp: 0, ppg: '0.0', rpg: '0.0', apg: '0.0', spg: '0.0', bpg: '0.0', fgPct: '0.0', tpPct: '0.0', ftPct: '0.0' };
    }

    return {
        gp: stats.gp,
        ppg: (stats.pts / stats.gp).toFixed(1),
        rpg: (stats.reb / stats.gp).toFixed(1),
        apg: (stats.ast / stats.gp).toFixed(1),
        spg: (stats.stl / stats.gp).toFixed(1),
        bpg: (stats.blk / stats.gp).toFixed(1),
        fgPct: stats.fga > 0 ? ((stats.fg / stats.fga) * 100).toFixed(1) : '0.0',
        tpPct: stats.tpa > 0 ? ((stats.tp / stats.tpa) * 100).toFixed(1) : '0.0',
        ftPct: stats.fta > 0 ? ((stats.ft / stats.fta) * 100).toFixed(1) : '0.0',
    };
};

export interface CareerStatLine {
  gp: number;
  pts: number; reb: number; ast: number; stl: number; blk: number;
  fg: number; fga: number; tp: number; tpa: number; ft: number; fta: number;
  // per-game averages (rounded to 1dp)
  ppg: number; rpg: number; apg: number; spg: number; bpg: number;
  // shooting pcts (0–100)
  fgPct: number; tpPct: number; ftPct: number;
  seasons: number; // distinct regular-season entries
}

/**
 * Aggregate career regular-season totals from player.stats[].
 * Skips playoff rows. Returns zeros if no data.
 */
export function computeCareerStats(player: Player): CareerStatLine {
  const rows = (player.stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0);
  let gp = 0, pts = 0, reb = 0, ast = 0, stl = 0, blk = 0;
  let fg = 0, fga = 0, tp = 0, tpa = 0, ft = 0, fta = 0;

  for (const s of rows) {
    gp  += s.gp  ?? 0;
    pts += s.pts ?? 0;
    reb += s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0));
    ast += s.ast ?? 0;
    stl += s.stl ?? 0;
    blk += s.blk ?? 0;
    fg  += s.fg  ?? 0;
    fga += s.fga ?? 0;
    tp  += s.tp  ?? 0;
    tpa += s.tpa ?? 0;
    ft  += s.ft  ?? 0;
    fta += s.fta ?? 0;
  }

  const safe = (n: number, d: number, dec = 1) => d > 0 ? parseFloat((n / d).toFixed(dec)) : 0;
  return {
    gp, pts, reb, ast, stl, blk, fg, fga, tp, tpa, ft, fta,
    ppg: safe(pts, gp), rpg: safe(reb, gp), apg: safe(ast, gp),
    spg: safe(stl, gp), bpg: safe(blk, gp),
    fgPct: safe(fg * 100, fga), tpPct: safe(tp * 100, tpa), ftPct: safe(ft * 100, fta),
    seasons: rows.length,
  };
}
