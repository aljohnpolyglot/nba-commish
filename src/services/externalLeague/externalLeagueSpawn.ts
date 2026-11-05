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
import { getGenderedNamePools, getNameData } from '../../data/nameDataFetcher';
import { generateDraftClassForGame, pickWeighted } from '../genDraftPlayers';
import { getNationalityPortraitRace, getRegenPortraitUrl } from '../../utils/newgenPortrait';
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
  pickGeneratedExternalDraftYear,
  pickNationalFeederAffiliation,
  seededRandom,
} from './externalLeagueIdentity';
import { pickCollegeForLeague, resolveClubAffinity } from './externalLeagueRouting';
import { getAcademyBudgetStrength } from '../tycoon/economyScale';
import { estimatePotentialBbgm } from '../../utils/playerRatings';

function deriveCollege(league: string, isYouth: boolean, team: any, country: string, seed: string): string {
  const teamName = team ? `${team.region ?? ''} ${team.name ?? ''}`.trim() : '';
  if (!isYouth) {
    // Adult-direct leagues: no college data
    if (league === 'PBA' || league === 'China CBA') return '';
    const feederAffiliation = pickNationalFeederAffiliation(country, team, seed);
    if (feederAffiliation) return feederAffiliation;
    // Try league college tracking first; if empty, show the feeder club rather than blank.
    return pickCollegeForLeague(league, seededRandom(seed)) || teamName;
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
function academyYouthPotentialFloor(targetAge: number, academyBudgetStrength: number, targetOvr: number): number {
  const base = 52 + academyBudgetStrength * 15;
  const ageBonus = targetAge <= 15 ? 5 : targetAge === 16 ? 4 : targetAge === 17 ? 2 : 0;
  return Math.max(targetOvr + 10, base + ageBonus);
}

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
  birthplace?: string;
  usedPortraitUrls?: Set<string>;
  generationBias?: {
    talentRating: number;
    heightRating: number;
    athleticismRating: number;
  };
  openEndedGrowth?: boolean;
  nativeYouthProfile?: boolean;
}): NBAPlayer | null {
  const {
    league, targetAge, year, rngBase, tid, team, salaryCap, isYouth, country, birthplace,
    usedPortraitUrls, generationBias, openEndedGrowth = false, nativeYouthProfile = false,
  } = opts;
  const academyBudgetStrength = isYouth
    ? getAcademyBudgetStrength(team?.tycoon?.academyBudget, team?.tycoon?.tier, team?.tycoon?.currentEconomyIndex ?? 1)
    : 0;

  try {
    const nameData = getNameData();
    let randomIndex = 0;
    const generationRandom = () => seededRandom(`${rngBase}_generation_${randomIndex++}`);

    // ── Generate base ratings/archetype/physical from the existing pipeline ──
    const gender = genderForLeague(league);
    const generated = generateDraftClassForGame(
      year,
      1,
      generationRandom,
      nameData,
      year,
      undefined,
      gender,
      'facesjs_only',
      'normal',
      { nationalityOverride: country, currentAgeOverride: isYouth ? targetAge : undefined },
    );
    const base = generated[0];
    if (!base) return null;

    // ── Name: pull from correct country's pool ──────────────────────────────
    const namePool = getGenderedNamePools(nameData, country, gender);
    const firstName = namePool?.first
      ? pickWeighted(namePool.first, generationRandom)
      : (base as any).firstName ?? 'Unknown';
    const lastName = namePool?.last && Object.keys(namePool.last).length > 0
      ? pickWeighted(namePool.last, generationRandom)
      : (base as any).lastName ?? 'Player';

    // ── OVR: skewed toward lower-mid (70% bottom half, 30% top half) ────────
    const ovrCap = Math.min(LEAGUE_OVR_CAP[league] ?? 55, getGeneratedExternalOvrCap(league, targetAge));
    const ovrFloor = Math.max(35, ovrCap - 18);
    const rngOvr = seededRandom(rngBase + '_ovr');
    const rawFrac = rngOvr < 0.70 ? (rngOvr / 0.70) * 0.50 : 0.50 + ((rngOvr - 0.70) / 0.30) * 0.50;
    let targetOvr = nativeYouthProfile
      ? Math.round(Number(base.overallRating ?? base.ratings?.[base.ratings.length - 1]?.ovr ?? ovrFloor)
        + (generationBias ? (generationBias.talentRating - 50) / 15 : 0))
      : Math.round(ovrFloor + rawFrac * (ovrCap - ovrFloor));

    // Fix 6: USA imports in foreign leagues are journeymen (G-League exempt — it's the US feeder)
    if (country === 'USA' && league !== 'G-League') {
      targetOvr = Math.min(targetOvr, ovrCap - 8);
    }

    // Fix 9: Youth generation hard cap (age < 19 in external leagues → K2 ~64 max)
    if (targetAge < 19) {
      targetOvr = Math.min(targetOvr, YOUTH_EXTERNAL_OVR_CAP);
    }
    targetOvr = Math.max(25, Math.min(ovrCap, targetOvr - GENERATED_EXTERNAL_OVR_NERF));

    if (isYouth && !nativeYouthProfile) {
      const academyOvrBonus = Math.round(-3 + academyBudgetStrength * 9);
      targetOvr = Math.max(25, Math.min(ovrCap, targetOvr + academyOvrBonus));
    }

    // POT: youth has more room to grow (Fix 3 — youth POT stays high even with OVR cap)
    const potCap = isYouth ? ovrCap + 8 : ovrCap + 4;
    const potGap = Math.max(0, potCap - targetOvr);
    let targetPot = nativeYouthProfile
      ? estimatePotentialBbgm(targetOvr, targetAge)
      : Math.min(potCap, targetOvr + Math.round(seededRandom(rngBase + '_pot') * potGap));
    if (isYouth && !nativeYouthProfile) {
      targetPot = Math.max(
        targetOvr,
        Math.min(
          potCap + 4,
          Math.max(
            targetPot + Math.round(-3 + academyBudgetStrength * 12),
            academyYouthPotentialFloor(targetAge, academyBudgetStrength, targetOvr),
          ),
        ),
      );
    }

    // ── Fix 4 + 5: Height ceiling + country multiplier ──────────────────────
    const baseHgt: number = (base as any).hgt ?? 78; // bio inches from generator
    const hgtMult = nativeYouthProfile ? 1 : (COUNTRY_HEIGHT_MULT[country] ?? 1.0);
    const hgtCeil = LEAGUE_HEIGHT_CEILING[league] ?? 88;
    const regionalHeightShift = generationBias ? (generationBias.heightRating - 50) * 0.035 : 0;
    const growthRemaining = openEndedGrowth
      ? ({ 14: 4, 15: 2.7, 16: 1.5, 17: 0.6, 18: 0.15 }[targetAge] ?? 0)
      : 0;
    const adjHgt = Math.min(Math.round(baseHgt * hgtMult + regionalHeightShift - growthRemaining), hgtCeil);
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
    const idSuffix = Math.floor(seededRandom(`${rngBase}_id`) * 0x1_0000_0000).toString(36);
    const uniqueId = `ext-gen-${league.replace(/[\s-]/g, '')}-${rngBase.slice(-10)}-${idSuffix}`;
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
    if (generationBias) {
      const talentDelta = Math.round((generationBias.talentRating - 50) / 14);
      const athleticismDelta = Math.round((generationBias.athleticismRating - 50) / 14);
      for (const attribute of ['oiq', 'diq', 'drb', 'pss', 'reb']) {
        scaledLastRating[attribute] = Math.max(10, Math.min(99, (scaledLastRating[attribute] ?? 50) + talentDelta));
      }
      for (const attribute of ['stre', 'spd', 'jmp']) {
        scaledLastRating[attribute] = Math.max(10, Math.min(99, (scaledLastRating[attribute] ?? 50) + athleticismDelta));
      }
    }
    const patchedRatings = Array.isArray((base as any).ratings)
      ? (base as any).ratings.map((r: any, i: number) =>
          i === (base as any).ratings.length - 1 ? scaledLastRating : r)
      : [scaledLastRating];

    return {
      ...base,
      internalId: uniqueId,
      imgURL: getRegenPortraitUrl(uniqueId, getNationalityPortraitRace(uniqueId, country), {
        nationality: country,
        bornLoc: country,
        gender,
        usedPortraitUrls,
      }) ?? undefined,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      tid,
      status: league as NBAPlayer['status'],
      overallRating: targetOvr,
      potential: targetPot,
      age: targetAge,
      born: { year: bornYear, loc: birthplace ?? country },
      nationality: country,
      nationalityTimeline: undefined,
      nationalitySuccessorCountry: undefined,
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
      finalHgt: openEndedGrowth ? undefined : adjHgt,
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
  const HARD_CAP = 15;
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
    return pickWeighted(freq, () => rng);
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

  return pickWeighted(weights, () => rng) ?? clubCountry ?? leagueCountry ?? 'USA';
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

