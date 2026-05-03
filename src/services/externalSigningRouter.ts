/**
 * externalSigningRouter.ts
 *
 * Routes unsigned free agents (tid === -1, status === 'Free Agent') to external
 * leagues based on OVR bracket. Fires once on Oct 1 of each season after the
 * summer FA window closes.
 *
 * OVR routing table — K2 scale (converted from p.overallRating via convertTo2KRating):
 *   K2 ≥ 75 (BBGM ~50+) → Euroleague / Endesa  (quality overseas, fringe starters)
 *   K2 68–74 (BBGM ~42–50) → G-League           (NBA affiliate pathway)
 *   K2 60–67 (BBGM ~33–42) → PBA                (regional leagues)
 *   K2 55–59 (BBGM ~27–33) → B-League           (lower-tier overseas)
 *   K2 < 55  (BBGM ~<27)   → stays FA           (absolute wash-out)
 *
 * Only NBA-caliber FAs are routed (no WNBA, no draft prospects, no external players
 * who are already in a league).
 */

import type { GameState, NBAPlayer } from '../types';
import { convertTo2KRating, getCountryFromLoc } from '../utils/helpers';
import { getGameDateParts } from '../utils/dateUtils';
import { EXTERNAL_SALARY_SCALE, NATIONALITY_LEAGUE_BIAS, EXTERNAL_LEAGUE_OVR_CAP } from '../constants';
import { getOffseasonState, logOffseasonDrift } from './offseason/offseasonState';

export interface ExternalRoutingResult {
  playerId: string;
  playerName: string;
  league: 'Euroleague' | 'Endesa' | 'G-League' | 'PBA' | 'B-League' | 'China CBA' | 'NBL Australia';
  teamTid: number;
  teamName: string;
  salaryUSD?: number;
}

/** Seeded random float 0–1 based on a numeric seed. */
function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

/** Pick a destination league + team for an unsigned player based on their OVR.
 *
 *  Updated routing (K2 scale):
 *   K2 ≥ 75           → Euroleague (or Endesa fallback)
 *   K2 68–74, age < 30 → G-League (NBA pathway)
 *   K2 68–74, age ≥ 30 → China CBA or Euroleague (vets shouldn't grind G-League)
 *   K2 63–67           → 40% China CBA · 30% NBL Australia · 30% PBA
 *   K2 55–62           → 35% B-League · 35% PBA · 30% China CBA
 *   K2 < 55            → stays FA (handled by caller)
 */
function pickDestination(
  ovr: number,
  age: number,
  nonNBATeams: GameState['nonNBATeams'],
  playerSeed: number,
  born?: { loc?: string },
): { league: ExternalRoutingResult['league']; tid: number; teamName: string } | null {
  let targetLeague: ExternalRoutingResult['league'];

  const rng = seededRandom(playerSeed);

  if (ovr >= 75) {
    targetLeague = 'Euroleague';
  } else if (ovr >= 68) {
    // Veterans (30+) skip G-League — route to quality overseas instead
    if (age >= 30) {
      targetLeague = rng < 0.6 ? 'China CBA' : 'Euroleague';
    } else {
      targetLeague = 'G-League';
    }
  } else if (ovr >= 63) {
    // Mid-tier: spread across China CBA, NBL Australia, PBA
    if (rng < 0.40) targetLeague = 'China CBA';
    else if (rng < 0.70) targetLeague = 'NBL Australia';
    else targetLeague = 'PBA';
  } else {
    // Lower tier: spread across B-League, PBA, China CBA
    if (rng < 0.35) targetLeague = 'B-League';
    else if (rng < 0.70) targetLeague = 'PBA';
    else targetLeague = 'China CBA';
  }

  // Nationality home-league preference: 70% → home league, 30% → OVR-tier result.
  // US/Canada players have no entry in NATIONALITY_LEAGUE_BIAS, so they fall through.
  const country = getCountryFromLoc(born?.loc);
  const homeLeague = NATIONALITY_LEAGUE_BIAS[country] as ExternalRoutingResult['league'] | undefined;
  if (homeLeague && homeLeague !== targetLeague) {
    if (seededRandom(playerSeed + 3) < 0.70) targetLeague = homeLeague;
  }

  const leagueTeams = nonNBATeams.filter(t => t.league === targetLeague);
  // Fallback chain if a league has no teams loaded (gist 404, etc.)
  // Don't skip the target league itself — it may exist elsewhere in nonNBATeams
  if (leagueTeams.length === 0) {
    const fallbackOrder: ExternalRoutingResult['league'][] = ['Euroleague', 'G-League', 'China CBA', 'PBA', 'B-League', 'Endesa', 'NBL Australia'];
    for (const fb of fallbackOrder) {
      const fbTeams = nonNBATeams.filter(t => t.league === fb);
      if (fbTeams.length > 0) {
        const team = fbTeams[Math.floor(seededRandom(playerSeed + 1) * fbTeams.length)];
        return { league: fb, tid: team.tid, teamName: `${team.region} ${team.name}` };
      }
    }
    return null;
  }

  // Pick a random team from the league so players spread out across clubs
  const team = leagueTeams[Math.floor(seededRandom(playerSeed + 2) * leagueTeams.length)];
  return { league: targetLeague, tid: team.tid, teamName: `${team.region} ${team.name}` };
}

/**
 * Route unsigned FAs to external leagues.
 * Call once on Oct 1 (or end of Sep) after the summer FA window.
 *
 * @returns array of routing results (for news generation) and the updated players array
 */
/**
 * Keep a minimum pool of quality FAs in the NBA market so teams always have someone to sign.
 * Without this, everyone 70+ gets routed overseas and rosters become static.
 *
 * Minimums that must remain as NBA FAs after routing:
 *   K2 ≥ 70  → keep at least 30 players
 *   K2 60–69 → keep at least 30 players
 */
const MIN_NBA_FA_TIER_HIGH  = 30; // K2 ≥ 70
const MIN_NBA_FA_TIER_MID   = 30; // K2 60–69

export function routeUnsignedPlayers(
  state: GameState,
  options: { protectedPlayerIds?: Set<string> } = {},
): { results: ExternalRoutingResult[]; players: NBAPlayer[] } {
  // [OSPLAN] drift check — overseas routing should fire only on Oct 1 (preCamp).
  if (state.date) {
    const os = getOffseasonState(state.date, state.leagueStats as any, state.schedule as any);
    logOffseasonDrift(
      'externalSigningRouter.routeUnsignedPlayers',
      ['preCamp'],
      os.phase,
      `date=${os.dateStr}`,
    );
    console.log(`[OSPLAN] externalSigningRouter.routeUnsignedPlayers fire date=${state.date} phase=${os.phase}`);
  }

  const EXCLUDED_STATUSES = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'Draft Prospect', 'Prospect']);
  const marketProtectedIds = options.protectedPlayerIds ?? new Set<string>();

  // Pre-compute K2 OVR for each eligible FA so we can decide which ones to protect
  const eligibleFAs = state.players
    .filter(p => p.tid === -1 && p.status === 'Free Agent' && !EXCLUDED_STATUSES.has(p.status ?? ''))
    .map(p => {
      const lastRating = (p as any).ratings?.[(p as any).ratings?.length - 1];
      const hgtAttr = lastRating?.hgt ?? 50;
      const k2Ovr = convertTo2KRating(p.overallRating ?? 0, hgtAttr);
      return { p, k2Ovr };
    })
    .filter(({ k2Ovr }) => k2Ovr >= 55); // only those that would be routed

  // Sort each tier by OVR descending; the top N in each tier are "protected" (stay as NBA FAs)
  const highTier = eligibleFAs.filter(x => x.k2Ovr >= 70).sort((a, b) => b.k2Ovr - a.k2Ovr);
  const midTier  = eligibleFAs.filter(x => x.k2Ovr >= 60 && x.k2Ovr < 70).sort((a, b) => b.k2Ovr - a.k2Ovr);

  const protectedIds = new Set<string>([
    ...highTier.slice(0, MIN_NBA_FA_TIER_HIGH).map(x => x.p.internalId),
    ...midTier.slice(0, MIN_NBA_FA_TIER_MID).map(x => x.p.internalId),
  ]);

  const results: ExternalRoutingResult[] = [];
  const updatedPlayers = state.players.map(p => {
    // Only route NBA free agents (not external players, prospects, or retired)
    if (p.tid !== -1) return p;
    if (p.status !== 'Free Agent') return p;
    if (EXCLUDED_STATUSES.has(p.status ?? '')) return p;

    // Convert to K2 scale — all thresholds below are K2 (per the header comment)
    const lastRating = (p as any).ratings?.[(p as any).ratings?.length - 1];
    const hgtAttr = lastRating?.hgt ?? 50;
    const k2Ovr = convertTo2KRating(p.overallRating ?? 0, hgtAttr);
    // Skip absolute wash-outs (K2 < 55) — let them stay as unsigned FAs
    if (k2Ovr < 55) return p;
    // NBA-starter caliber (K2 ≥ 85 ≈ BBGM OVR 61) — never route overseas
    if (k2Ovr >= 85) return p;
    // Skip protected FAs — they must remain available as NBA signings
    if (protectedIds.has(p.internalId)) return p;
    // Skip players with active user bids — their market must resolve before any fallback routing.
    if (marketProtectedIds.has(p.internalId)) return p;

    const playerAge = (p as any).age ?? ((p as any).born?.year ? getGameDateParts(state.date ?? new Date()).year - (p as any).born.year : 27);
    // Skip aging vets — let them retire naturally instead of signing overseas
    if (playerAge >= 36 && k2Ovr < 72) return p;
    let playerSeed = 0;
    for (let ci = 0; ci < p.internalId.length; ci++) playerSeed += p.internalId.charCodeAt(ci);

    const dest = pickDestination(k2Ovr, playerAge, state.nonNBATeams ?? [], playerSeed, (p as any).born);
    if (!dest) return p;

    // Generate contract with salary based on EXTERNAL_SALARY_SCALE
    const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
    const scale = EXTERNAL_SALARY_SCALE[dest.league];
    const ovrNorm = Math.min(1, Math.max(0, (k2Ovr - 55) / 30)); // 55=floor, 85=ceiling
    const salaryUSD = scale
      ? Math.round(salaryCap * (scale.minPct + ovrNorm * (scale.maxPct - scale.minPct)))
      : 500_000;
    const years = k2Ovr >= 70 ? 2 : 1;
    const contractExp = (state.leagueStats?.year ?? 2026) + years - 1;

    results.push({
      playerId: p.internalId,
      playerName: p.name,
      league: dest.league,
      teamTid: dest.tid,
      teamName: dest.teamName,
      salaryUSD,
    });

    // Fix 18: clamp OVR to destination league ceiling so NBA-boosted ratings
    // don't carry over (e.g. K2 88 player cut to PBA stays at PBA cap, not K2 88).
    const destOvrCap = EXTERNAL_LEAGUE_OVR_CAP[dest.league];
    const clampedOvr = destOvrCap !== undefined
      ? Math.min(p.overallRating ?? 60, destOvrCap)
      : (p.overallRating ?? 60);

    // Clamp the most recent ratings entry's ovr so potMod stays calibrated next season.
    const rawRatings = (p as any).ratings as any[] | undefined;
    const clampedRatings = rawRatings && destOvrCap !== undefined
      ? rawRatings.map((r: any, i: number) =>
          i === rawRatings.length - 1 && (r.ovr ?? 0) > destOvrCap
            ? { ...r, ovr: destOvrCap }
            : r,
        )
      : rawRatings;

    // Fix 17: build a clean single-year contractYears entry at the destination
    // league's salary — strips old NBA contractYears that would show inflated
    // values in the player bio contract tab (e.g. Yuto Imanishi ¥622M B-League).
    const currentYear = state.leagueStats?.year ?? 2026;
    const seasonLabel = `${currentYear - 1}-${String(currentYear).slice(-2)}`;

    return {
      ...p,
      tid: dest.tid,
      status: dest.league as NBAPlayer['status'],
      overallRating: clampedOvr,
      ...(clampedRatings ? { ratings: clampedRatings } : {}),
      twoWay: undefined,
      contract: {
        amount: Math.round(salaryUSD / 1_000), // BBGM convention: thousands
        exp: contractExp,
        hasPlayerOption: false,
        hasTeamOption: false,
      },
      contractYears: [{
        season: seasonLabel,
        guaranteed: salaryUSD,
        option: '',
      }],
    };
  });

  return { results, players: updatedPlayers };
}
