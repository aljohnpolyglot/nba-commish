import type { NBAGMPlayer, NBAPlayer as Player, DraftPick, NBATeam as Team, TransactionDto } from '../types';
import { convertTo2KRating } from './helpers';
import { activeClubDebuffs } from '../services/simulation/StatGenerator/helpers';

const STRENGTH_DEBUFF_AMOUNTS = { heavy: 5, moderate: 3, mild: 1 } as const;

export const calculatePlayerOverallForYear = (player: NBAGMPlayer, year: number): number => {
    if (!player || !player.ratings || player.ratings.length === 0) return 50;
    const yearRating = player.ratings.find(r => r.season === year);
    if (!yearRating) {
        const latestRating = player.ratings[player.ratings.length - 1];
        if(!latestRating) return 50;
        return calculateOverallFromRating(latestRating);
    }
    return calculateOverallFromRating(yearRating);
};

const calculateOverallFromRating = (rating: any): number => {
    if (!rating) return 50;
    const { hgt, stre, spd, jmp, endu, ins, dnk, ft, fg, tp, oiq, diq, drb, pss, reb } = rating;

    // SCORING FIX: Take the average of the TOP 3 scoring stats + the average of all 5.
    // This rewards players for being ELITE at one thing (like Shai's midrange or Giannis's dunks)
    const scoringStats = [ins, dnk, ft, fg, tp].sort((a, b) => b - a);
    const topScoring = (scoringStats[0] + scoringStats[1] + scoringStats[2]) / 3;
    const avgScoring = (ins + dnk + ft + fg + tp) / 5;
    const scoring = (topScoring * 0.7) + (avgScoring * 0.3);

    // PHYSICALS: Height weight is good, but superstars usually have high SPD/ENDU
    const physicals = (hgt * 1.5 + stre + spd * 1.2 + jmp + endu * 1.3) / 6;

    // PLAYMAKING: Star power comes from IQ (oiq)
    const playmaking = (drb * 0.9 + pss * 0.9 + oiq * 1.2) / 3;

    // DEFENSE: Reward interior/perimeter specialists
    const defense = (diq * 1.2 + reb * 0.9 + hgt * 0.9) / 3; 

    let rawOvr = (scoring * 0.35) + (playmaking * 0.25) + (defense * 0.20) + (physicals * 0.20);

    // THE SUPERSTAR BOOST: If a player is elite (rawOvr > 80), push them higher
    // This is how 2K gets those 94-98 ratings.
    if (rawOvr > 80) {
        rawOvr = 80 + (rawOvr - 80) * 1.4;
    } else if (rawOvr < 60) {
        rawOvr = rawOvr * 0.95; // Keeps role players in the 60s-70s
    }

    return Math.max(25, Math.min(99, Math.round(rawOvr)));
}

export const calculatePlayerOverall = (player: NBAGMPlayer): number => {
    if (!player || !player.ratings || player.ratings.length === 0) return 50;
    const latestRating = player.ratings[player.ratings.length - 1];
    return calculateOverallFromRating(latestRating);
};

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL DISPLAY RATINGS — single source of truth
// ─────────────────────────────────────────────────────────────────────────────
// Every view (NBA Central, Player Ratings, Team Office, modals, etc.) should
// import from here instead of recomputing inline. Matches PlayerRatingsView's
// formula exactly: live `player.overallRating` + current-season rating for
// height/three-point shape, BBGM potEstimator for potential with age.

/**
 * Resolve the rating row for a given season. Falls back to the most recent
 * entry when the season isn't tracked (e.g. retired players, historical sims).
 */
const pickRating = (player: any, season?: number): any => {
    const rs = player?.ratings;
    if (!rs || rs.length === 0) return null;
    if (season != null) {
        const found = rs.find((r: any) => r.season === season);
        if (found) return found;
    }
    return rs[rs.length - 1];
};

/**
 * Compute the age field the way every view does it:
 *   currentYear - born.year, falling back to player.age, then a safe default.
 */
export const getDisplayAge = (player: any, currentYear: number): number => {
    if (player?.born?.year) return currentYear - player.born.year;
    if (typeof player?.age === 'number') return player.age;
    return 27;
};

/**
 * Canonical 2K-scale OVR for display. Mirrors PlayerRatingsView:138.
 * Uses live `player.overallRating` (not stale precomputed `bbgmOvr`/`rating2K`)
 * and current-season rating for hgt/tp shape. Falls back to `r.ovr` from the
 * rating row when the top-level field is missing — matters for raw BBGM JSON
 * loads (e.g. CoachingViewMain) where `overallRating` isn't hydrated.
 */
export const getDisplayOverall = (player: any, season?: number): number => {
    const r = pickRating(player, season);
    const hgt = r?.hgt ?? 50;
    const tp  = r?.tp  ?? 50;
    const bbgmOvr = player?.overallRating ?? r?.ovr ?? 60;
    return convertTo2KRating(bbgmOvr, hgt, tp);
};

/**
 * BBGM potEstimator for DISPLAY — mirrors PlayerRatingsView:141 exactly.
 * Players 29+: POT = current OVR (no more growth). Younger: regression formula,
 * floored at current OVR so POT is never *below* present rating, then clamped
 * to [40, 99]. Distinct from `genDraftPlayers.potEstimator` which has no floor
 * since prospects don't have a "current" OVR yet.
 */
export const estimatePotentialBbgm = (ovrBbgm: number, age: number): number => {
    if (age >= 29) return ovrBbgm;
    const regression = Math.round(72.31428908571982 + (-2.33062761 * age) + (0.83308748 * ovrBbgm));
    return Math.min(99, Math.max(40, Math.max(ovrBbgm, regression)));
};

/**
 * Canonical 2K-scale POT for display. Mirrors PlayerRatingsView:141-142.
 * Falls back to `r.ovr` when `player.overallRating` is missing (raw BBGM JSON).
 */
export const getDisplayPotential = (player: any, currentYear: number, season?: number): number => {
    const r   = pickRating(player, season);
    const hgt = r?.hgt ?? 50;
    const tp  = r?.tp  ?? 50;
    const age = getDisplayAge(player, currentYear);
    const bbgmOvr = player?.overallRating ?? r?.ovr ?? 60;
    const potBbgm = estimatePotentialBbgm(bbgmOvr, age);
    return convertTo2KRating(potBbgm, hgt, tp);
};
const teamStrengthCache = new Map<string, number>();

export const clearTeamStrengthCache = () => teamStrengthCache.clear();

export const calculateTeamStrength = (teamId: number, players: Player[], overridePlayers?: Player[]): number => {
    // Only cache if not using override players
    const injuryFingerprint = !overridePlayers
      ? players.filter(p => p.tid === teamId && p.injury && p.injury.gamesRemaining > 0).map(p => p.internalId).sort().join(',')
      : '';
    const cacheKey = !overridePlayers ? `${teamId}-${players.length}-${players[0]?.internalId}-${injuryFingerprint}` : null;
    if (cacheKey && teamStrengthCache.has(cacheKey)) {
        return teamStrengthCache.get(cacheKey)!;
    }

    const teamPlayers = overridePlayers || players.filter(p => p.tid === teamId && (!p.injury || p.injury.gamesRemaining <= 0)).sort((a,b) => b.overallRating - a.overallRating);
    if(teamPlayers.length === 0) return 40;
    
    const top8Players = teamPlayers.slice(0, 8);
    const top8_2k = top8Players.map(p => {
        const r = p.ratings?.[p.ratings.length - 1];
        const base = convertTo2KRating(p.overallRating, r?.hgt ?? 50, r?.tp);
        const severity = activeClubDebuffs.get(String(p.internalId));
        return severity ? Math.max(40, base - STRENGTH_DEBUFF_AMOUNTS[severity]) : base;
    });
    
    // Weighted for Superstar impact (0.32 weight for the #1 guy)
    const weights = [0.32, 0.22, 0.15, 0.10, 0.08, 0.06, 0.04, 0.03];
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
