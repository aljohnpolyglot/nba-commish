import type { NBAPlayer } from '../../types';
import {
  COUNTRY_HEIGHT_MULT,
  EXTERNAL_SALARY_SCALE,
  LEAGUE_HEIGHT_CEILING,
  NATIONALITY_LEAGUE_BIAS,
  NATIONALITY_LEAGUE_WEIGHTS,
  YOUTH_EXTERNAL_OVR_CAP,
} from '../../constants';
import type { LeagueWeightEntry } from '../../constants';
import { getNameData } from '../../data/nameDataFetcher';
import { generateDraftClassForGame, pickWeighted } from '../genDraftPlayers';
import { getNewgenPortraitUrl } from '../../utils/newgenPortrait';
import {
  ADULT_DIRECT_NATIONALITY,
  genderForLeague,
  getClubCountry,
  getGeneratedExternalOvrCap,
  getPlayerCountry,
  GENERATED_EXTERNAL_OVR_NERF,
  GENERATED_EXTERNAL_SCALE_ATTRS,
  GENERATED_EXTERNAL_VERSION,
  LEAGUE_OVR_CAP,
  NEWGEN_SKIP_LEAGUES,
  pickGeneratedExternalDraftYear,
  pickNationalFeederAffiliation,
  resolveNamePool,
  seededRandom,
} from './externalLeagueIdentity';
import { pickCollegeForLeague, resolveClubAffinity } from './externalLeagueRouting';

function deriveCollege(league: string, isYouth: boolean, team: any, country: string, seed: string): string {
  const teamName = team ? `${team.region ?? ''} ${team.name ?? ''}`.trim() : '';
  if (!isYouth) {
    // Adult-direct leagues: no college data
    if (league === 'PBA' || league === 'China CBA') return '';
    const feederAffiliation = pickNationalFeederAffiliation(country, team, seed);
    if (feederAffiliation) return feederAffiliation;
    // Try league college tracking first; if empty, show the feeder club rather than blank.
    return pickCollegeForLeague(league, Math.random()) || teamName;
  }
  // Youth: use team name + Youth/Development suffix
  if (!teamName) return '';
  if (league === 'B-League') return `${teamName} Development`;
  if (league === 'NBL Australia') return 'NBL Next Stars';
  return `${teamName} Youth`;
}

/**
 * Generate a single external-league NBAPlayer with correct nationality-matched bio.
 * `country` controls the name pool and born.loc — must be set for 1:1 replacement.
 */
// Youth academy investment tier (0-5) → OVR/POT bonus for prospects spawned
// at THIS team. 0 = team isn't investing → slightly below-average spawns.
// 5 = world-class academy → meaningfully stronger prospects. Caps applied
// after the standard ovrCap so this never breaks league-wide ceilings.
const ACADEMY_TIER_OVR_BONUS: Record<number, number> = { 0: -3, 1: -1, 2: 0, 3: 2, 4: 4, 5: 6 };
const ACADEMY_TIER_POT_BONUS: Record<number, number> = { 0: -3, 1: -1, 2: 0, 3: 3, 4: 6, 5: 9 };

export function spawnExternalPlayer(opts: {
  league: string;
  targetAge: number;
  year: number;
  rngBase: string;
  tid: number;
  team: any;
  salaryCap: number;
  isYouth: boolean;
  country: string; // explicit nationality — drives names, face race, born.loc
}): NBAPlayer | null {
  const { league, targetAge, year, rngBase, tid, team, salaryCap, isYouth, country } = opts;
  // Read the team's academy investment — only matters for youth spawns. AI
  // teams may not have a tycoon block (PBA/CBA placeholder), default to 2
  // (Standard) so existing balance is preserved.
  const academyBudget: number = isYouth
    ? Math.max(0, Math.min(5, team?.tycoon?.academyBudget ?? 2))
    : 2;

  try {
    const nameData = getNameData();

    // ── Generate base ratings/archetype/physical from the existing pipeline ──
    const gender = genderForLeague(league);
    const generated = generateDraftClassForGame(year, 1, Math.random, nameData, year, undefined, gender);
    const base = generated[0];
    if (!base) return null;

    // ── Name: pull from correct country's pool ──────────────────────────────
    const namePool = resolveNamePool(country, nameData);
    const firstName = namePool?.first
      ? pickWeighted(namePool.first)
      : (base as any).firstName ?? 'Unknown';
    const lastName = namePool?.last && Object.keys(namePool.last).length > 0
      ? pickWeighted(namePool.last)
      : (base as any).lastName ?? 'Player';

    // ── OVR: skewed toward lower-mid (70% bottom half, 30% top half) ────────
    const ovrCap = Math.min(LEAGUE_OVR_CAP[league] ?? 55, getGeneratedExternalOvrCap(league, targetAge));
    const ovrFloor = Math.max(35, ovrCap - 18);
    const rngOvr = seededRandom(rngBase + '_ovr');
    const rawFrac = rngOvr < 0.70 ? (rngOvr / 0.70) * 0.50 : 0.50 + ((rngOvr - 0.70) / 0.30) * 0.50;
    let targetOvr = Math.round(ovrFloor + rawFrac * (ovrCap - ovrFloor));

    // Fix 6: USA imports in foreign leagues are journeymen (G-League exempt — it's the US feeder)
    if (country === 'USA' && league !== 'G-League') {
      targetOvr = Math.min(targetOvr, ovrCap - 8);
    }

    // Fix 9: Youth generation hard cap (age < 19 in external leagues → K2 ~64 max)
    if (targetAge < 19) {
      targetOvr = Math.min(targetOvr, YOUTH_EXTERNAL_OVR_CAP);
    }
    targetOvr = Math.max(25, Math.min(ovrCap, targetOvr - GENERATED_EXTERNAL_OVR_NERF));

    // Apply academy investment bonus AFTER the league cap, but still clamp
    // so a tier-5 academy can't push prospects past the league's own ceiling.
    if (isYouth) {
      targetOvr = Math.max(25, Math.min(ovrCap, targetOvr + (ACADEMY_TIER_OVR_BONUS[academyBudget] ?? 0)));
    }

    // POT: youth has more room to grow (Fix 3 — youth POT stays high even with OVR cap)
    const potCap = isYouth ? ovrCap + 8 : ovrCap + 4;
    const potGap = Math.max(0, potCap - targetOvr);
    let targetPot = Math.min(potCap, targetOvr + Math.round(seededRandom(rngBase + '_pot') * potGap));
    if (isYouth) {
      targetPot = Math.max(targetOvr, Math.min(potCap + 4, targetPot + (ACADEMY_TIER_POT_BONUS[academyBudget] ?? 0)));
    }

    // ── Fix 4 + 5: Height ceiling + country multiplier ──────────────────────
    const baseHgt: number = (base as any).hgt ?? 78; // bio inches from generator
    const hgtMult = COUNTRY_HEIGHT_MULT[country] ?? 1.0;
    const hgtCeil = LEAGUE_HEIGHT_CEILING[league] ?? 88;
    const adjHgt = Math.min(Math.round(baseHgt * hgtMult), hgtCeil);
    // Back-derive hgt rating attribute from adjusted bio height
    const adjHgtRating = Math.round(Math.max(0, Math.min(99, ((adjHgt - 68) / 22) * 99)));
    // Recompute weight proportionally
    const stre = (base as any).ratings?.[0]?.stre ?? 50;
    const adjBMI = 20 + (stre / 99) * 8;
    const adjWeight = Math.round((adjBMI * Math.pow(adjHgt, 2)) / 703);

    // ── Salary proportional to OVR within league band ───────────────────────
    const scale = EXTERNAL_SALARY_SCALE[league] ?? { minPct: 0.001, maxPct: 0.005 };
    const ovrNorm = Math.max(0, Math.min(1, (targetOvr - ovrFloor) / Math.max(1, ovrCap - ovrFloor)));
    const salaryUSD = Math.round(salaryCap * (scale.minPct + ovrNorm * (scale.maxPct - scale.minPct)));
    const contractExp = year + (targetOvr >= ovrCap - 5 ? 2 : 1);

    const college = deriveCollege(league, isYouth, team, country, `${rngBase}_college`);
    const uniqueId = `ext-gen-${league.replace(/[\s-]/g, '')}-${rngBase.slice(-10)}-${Date.now().toString(36)}`;
    const bornYear = year - targetAge;
    const draftYear = pickGeneratedExternalDraftYear(targetAge, bornYear, year, `${rngBase}_draft`);

    // Scale all skill attributes proportionally to targetOvr so that when this player
    // later becomes a Draft Prospect (external cap lifts), calculatePlayerOverallForYear
    // reads the scaled attrs and doesn't compute a wildly higher OVR from unscaled values.
    const baseRatings = Array.isArray((base as any).ratings) ? (base as any).ratings[(base as any).ratings.length - 1] : {};
    const currentAvg = GENERATED_EXTERNAL_SCALE_ATTRS.reduce((s: number, a: string) => s + (baseRatings[a] ?? 50), 0) / GENERATED_EXTERNAL_SCALE_ATTRS.length;
    const scaleFactor = currentAvg > 0 ? targetOvr / currentAvg : 1;
    const scaledLastRating: Record<string, number> = { ...baseRatings, hgt: adjHgtRating, ovr: targetOvr, pot: targetPot };
    for (const a of GENERATED_EXTERNAL_SCALE_ATTRS) {
      scaledLastRating[a] = Math.max(10, Math.min(99, Math.round((baseRatings[a] ?? 50) * scaleFactor)));
    }
    const patchedRatings = Array.isArray((base as any).ratings)
      ? (base as any).ratings.map((r: any, i: number) =>
          i === (base as any).ratings.length - 1 ? scaledLastRating : r)
      : [scaledLastRating];

    return {
      ...base,
      internalId: uniqueId,
      imgURL: NEWGEN_SKIP_LEAGUES.has(league) ? (base as any).imgURL : getNewgenPortraitUrl(uniqueId, gender),
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      tid,
      status: league as NBAPlayer['status'],
      overallRating: targetOvr,
      potential: targetPot,
      age: targetAge,
      born: { year: bornYear, loc: country },
      nationality: country,
      college,
      draft: {
        year: draftYear,
        tid: -1,
        round: 0,
        pick: 0,
        originalTid: -1,
      },
      hgt: adjHgt,
      weight: adjWeight,
      finalHgt: adjHgt,
      finalWeight: adjWeight,
      ratings: patchedRatings,
      contract: {
        amount: Math.round(salaryUSD / 1_000), // BBGM thousands convention
        exp: contractExp,
      },
      stats: [],
      hof: false,
      extGenVersion: GENERATED_EXTERNAL_VERSION,
    } as any as NBAPlayer;
  } catch (err) {
    console.warn('[ExternalSustainer] spawnExternalPlayer failed:', err);
    return null;
  }
}

/** Pick the least-rostered team from a list. */
export function pickUnderRosteredTeam(teams: any[], players: NBAPlayer[]): any {
  if (teams.length === 0) return null;
  const HARD_CAP = 16;
  const eligible = teams.filter(team =>
    players.filter(p => p.tid === team.tid && (p as any).status !== 'Retired').length < HARD_CAP
  );
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => {
    const ac = players.filter(p => p.tid === a.tid && (p as any).status !== 'Retired').length;
    const bc = players.filter(p => p.tid === b.tid && (p as any).status !== 'Retired').length;
    return ac - bc;
  })[0];
}

/** Sample a league's country distribution based on nationality of existing players. */
export function sampleLeagueCountry(league: string, nonNBATeams: any[], players: NBAPlayer[], rng: number): string {
  const leagueTeams = nonNBATeams.filter(t => t.league === league);
  const leaguePlayers = players.filter(p => (p as any).status === league);

  const baselineWeights: Record<string, number> = {};
  if (league === 'Endesa') {
    Object.assign(baselineWeights, {
      Spain: 5,
      France: 2,
      Germany: 2,
      Italy: 2,
      Serbia: 2,
      Lithuania: 2,
      Greece: 1,
      Turkey: 1,
      Slovenia: 1,
      Montenegro: 1,
    });
  }

  // Build frequency from existing league players
  const freq: Record<string, number> = { ...baselineWeights };
  for (const p of leaguePlayers) {
    const c = p.born?.loc ?? (p as any).nationality ?? '';
    if (c) freq[c] = (freq[c] ?? 0) + (league === 'Endesa' ? 0.75 : 1);
  }

  if (Object.keys(freq).length > 0) {
    return pickWeighted(freq);
  }

  // Fallback: use NATIONALITY_LEAGUE_BIAS + NATIONALITY_LEAGUE_WEIGHTS in reverse
  const simpleBias = Object.entries(NATIONALITY_LEAGUE_BIAS as Record<string, string>)
    .filter(([, l]) => l === league)
    .map(([c]) => c);
  const weightedBias = Object.entries(NATIONALITY_LEAGUE_WEIGHTS)
    .filter(([, entries]) => (entries as LeagueWeightEntry[]).some(e => e.league === league))
    .map(([c]) => c);
  const biasCountries = [...new Set([...simpleBias, ...weightedBias])];
  if (biasCountries.length > 0) {
    return biasCountries[Math.floor(rng * biasCountries.length)];
  }

  return 'USA'; // absolute last resort
}

export function sampleTeamCountry(
  league: string,
  team: any,
  nonNBATeams: any[],
  players: NBAPlayer[],
  rng: number,
): string {
  const clubCountry = getClubCountry(team?.tid);
  const teamPlayers = players.filter(p => p.tid === team?.tid && (p as any).status !== 'Retired');
  const isMappedClubLeague = !!clubCountry && ['Euroleague', 'B-League', 'NBL Australia'].includes(league);
  const isSoftMappedClubLeague = !!clubCountry && league === 'Endesa';
  if (isMappedClubLeague) {
    const domesticCount = teamPlayers.filter(p => {
      const country = getPlayerCountry(p);
      return country === clubCountry;
    }).length;
    if (domesticCount === 0) return clubCountry!;
  }
  const weights: Record<string, number> = {};

  for (const p of teamPlayers) {
    const country = getPlayerCountry(p);
    if (!country) continue;
    const isClubCountry = clubCountry && country === clubCountry;
    weights[country] = (weights[country] ?? 0) + (isClubCountry ? 1.25 : 0.15);
  }

  const leagueCountry = sampleLeagueCountry(league, nonNBATeams, players, rng);
  if (leagueCountry) weights[leagueCountry] = (weights[leagueCountry] ?? 0) + (isMappedClubLeague ? 1.25 : 2);
  if (clubCountry) {
    const boost = isMappedClubLeague ? 8 : isSoftMappedClubLeague ? 3.5 : 16;
    weights[clubCountry] = (weights[clubCountry] ?? 0) + boost;
  }

  return pickWeighted(weights) ?? clubCountry ?? leagueCountry ?? 'USA';
}

export function pickTeamForGeneratedPlayer(
  teams: any[],
  players: NBAPlayer[],
  additions: NBAPlayer[],
  country: string,
  seed: string,
): any | null {
  if (teams.length === 0) return null;

  const weightedTeams = teams.map(team => {
    const existingCount =
      players.filter(p => p.tid === team.tid && (p as any).status !== 'Retired').length +
      additions.filter(p => p.tid === team.tid).length;
    const deficitWeight = Math.max(0, 13 - existingCount);
    const affinityWeight = resolveClubAffinity(team.tid, country);
    return {
      team,
      weight: deficitWeight * affinityWeight,
    };
  }).filter(entry => entry.weight > 0);

  if (weightedTeams.length === 0) return pickUnderRosteredTeam(teams, [...players, ...additions]);

  const total = weightedTeams.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = seededRandom(seed) * total;
  for (const entry of weightedTeams) {
    roll -= entry.weight;
    if (roll <= 0) return entry.team;
  }
  return weightedTeams[weightedTeams.length - 1].team;
}

